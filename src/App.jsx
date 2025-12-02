import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  runTransaction,
  serverTimestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  PawPrint, Wifi, Send, Activity, Database, ShoppingBag, Copy, Users, RefreshCw, Search, Zap, Hexagon, LogIn, LogOut, Layers, History, ArrowUpRight, ArrowDownLeft, AlertTriangle, Sparkles, Rocket, ShieldAlert
} from 'lucide-react';

// 👇 NHẬP DỮ LIỆU TỪ FILE RIÊNG (Nếu Meo đã tách file thì xóa dòng const UPDATE_HISTORY bên dưới đi nhé)
// import { UPDATE_HISTORY } from './data/updates';

// --- CẤU HÌNH ---
const CURRENT_VERSION = "v4.6"; 
const BLOCK_REWARD = 10; 
const MAX_SUPPLY = 1000000; 

// --- DỮ LIỆU LỊCH SỬ (Dự phòng nếu Meo chưa tách file) ---
import { UPDATE_HISTORY } from './data/updates';

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyDrREROquKxOUFf8GfkkMeaALE929MJDRY",
  authDomain: "meo-coin-net.firebaseapp.com",
  projectId: "meo-coin-net",
  storageBucket: "meo-coin-net.firebasestorage.app",
  messagingSenderId: "980010880222",
  appId: "1:980010880222:web:3b195b6791e95d52f9464f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const appId = 'meocoin-network-v4'; 

export default function MeoCoinNetwork() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [networkUsers, setNetworkUsers] = useState([]);
  const [blockchain, setBlockchain] = useState([]); 
  const [totalSupply, setTotalSupply] = useState(0); 
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0); 
  const [logs, setLogs] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(1); 
  const [activeTab, setActiveTab] = useState('miner');
  const [loading, setLoading] = useState(true);
  
  // State Ví
  const [recipientId, setRecipientId] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [txStatus, setTxStatus] = useState(null);
  const [myTransactions, setMyTransactions] = useState([]); 

  // State Bảo Mật
  const [isDuplicateTab, setIsDuplicateTab] = useState(false); // Chặn nhiều tab cùng trình duyệt
  const [isSessionInvalid, setIsSessionInvalid] = useState(false); // Chặn đăng nhập nơi khác (Real-time)
  const [updateAvailable, setUpdateAvailable] = useState(false); 
  
  // Lưu session ID hiện tại của máy này
  const localSessionIdRef = useRef(null);

  const miningIntervalRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const totalSupplyRef = useRef(0);

  // --- 1. AUTH & SESSION CHECK ---
  useEffect(() => {
    // 1.1 Chặn nhiều tab (BroadcastChannel)
    const channel = new BroadcastChannel('meocoin_channel');
    channel.postMessage({ type: 'NEW_TAB_OPENED' });
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_TAB_OPENED') {
        setIsDuplicateTab(true);
        stopMining(); 
      }
    };

    // 1.2 Đăng nhập & Đăng ký Session
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Gọi API để xin "Thẻ bài" (Session ID) mới
        try {
          const res = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.uid })
          });
          const data = await res.json();
          if (data.sessionId) {
            localSessionIdRef.current = data.sessionId;
            console.log("Session ID cấp mới:", data.sessionId);
          }
        } catch (e) {
          console.error("Lỗi cấp session:", e);
        }
      }
      setLoading(false);
    });

    // 1.3 Check Version
    const systemRef = doc(db, 'artifacts', appId, 'public', 'data', 'system', 'info');
    const unsubscribeSystem = onSnapshot(systemRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.latestVersion && data.latestVersion !== CURRENT_VERSION) {
          setUpdateAvailable(true);
          stopMining(); 
        }
      } else {
        setDoc(systemRef, { latestVersion: CURRENT_VERSION }, { merge: true });
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSystem();
      channel.close();
    };
  }, []);

  // --- 2. DATA SYNC & REAL-TIME SECURITY ---
  useEffect(() => {
    if (!user || isDuplicateTab || updateAvailable || isSessionInvalid) return; 
    
    // Lắng nghe dữ liệu User (bao gồm cả Session ID để check bảo mật)
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (doc) => { 
      if (doc.exists()) {
        const data = doc.data();
        setBalance(data.balance || 0);

        // 🛑 BẢO MẬT: Kiểm tra xem Session ID trên server có khớp với máy này không
        if (localSessionIdRef.current && data.currentSessionId) {
          if (data.currentSessionId !== localSessionIdRef.current) {
            setIsSessionInvalid(true); // Bị đá ra ngoài!
            stopMining();
          }
        }
      }
    });

    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersCol, (snap) => {
      const u = []; snap.forEach(d => u.push(d.data()));
      u.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      setNetworkUsers(u);
    });

    const blocksQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'blocks'), orderBy('index', 'desc'), limit(10));
    const unsubBlocks = onSnapshot(blocksQuery, (snap) => {
      const b = []; snap.forEach(d => b.push(d.data()));
      setBlockchain(b);
    });

    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
    const unsubStats = onSnapshot(statsRef, (doc) => {
      if (doc.exists()) {
        const supply = doc.data().totalSupply || 0;
        setTotalSupply(supply);
        totalSupplyRef.current = supply;
        setCurrentLevel(calculateLevel(supply));
      }
    });

    const txQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    const unsubTx = onSnapshot(txQuery, (snap) => {
      const txs = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.from === user.uid || data.to === user.uid) {
          txs.push(data);
        }
      });
      setMyTransactions(txs);
    });

    return () => {
      unsubUser();
      unsubUsers();
      unsubBlocks();
      unsubStats();
      unsubTx();
    };

  }, [user, isDuplicateTab, updateAvailable, isSessionInvalid]);

  // --- 3. MINING ---
  const calculateLevel = (currentSupply) => {
    if (currentSupply < 50000) return 1; 
    if (currentSupply < 200000) return 2;
    if (currentSupply < 400000) return 3;
    if (currentSupply < 600000) return 4;
    if (currentSupply < 800000) return 5;
    return 6;
  };

  const getWinChance = (level) => {
    switch(level) {
      case 1: return 0.2;   
      case 2: return 0.1;   
      case 3: return 0.05;  
      case 4: return 0.02;  
      case 5: return 0.01;  
      case 6: return 0.001; 
      default: return 0.01;
    }
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });
    setLogs(prev => [{time, msg: String(msg), type}, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (isDuplicateTab || updateAvailable || isSessionInvalid) return; 
    if (totalSupplyRef.current >= MAX_SUPPLY) return addLog("Hết coin rồi Meo ơi!", "error");
    if (mining) return;
    
    setMining(true);
    isSubmittingRef.current = false;
    addLog(`🌸 Đã bật máy đào! Cấp độ: ${calculateLevel(totalSupplyRef.current)}`, "info");

    miningIntervalRef.current = setInterval(async () => {
      if (isSubmittingRef.current || isDuplicateTab || updateAvailable || isSessionInvalid) return; 

      const fakeHashRate = Math.floor(Math.random() * 500) + 1500; 
      setHashRate(fakeHashRate);

      const level = calculateLevel(totalSupplyRef.current);
      const chance = getWinChance(level);
      const roll = Math.random(); 

      if (roll < chance) {
        isSubmittingRef.current = true; 
        const fakeHash = "meo" + Math.random().toString(36).substring(7); 
        addLog(`🐾 YAHOO! Nhặt được Block: ${fakeHash}...`, "success");
        await submitBlockToServer();
        setTimeout(() => { isSubmittingRef.current = false; }, 2000);
      } 
    }, 1000);
  };

  const stopMining = () => {
    setMining(false);
    if (miningIntervalRef.current) clearInterval(miningIntervalRef.current);
    isSubmittingRef.current = false;
    setHashRate(0);
    if (!isDuplicateTab && !updateAvailable && !isSessionInvalid) addLog("💤 Meo đi ngủ đây...", "warning");
  };

  const submitBlockToServer = async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          minerName: user.displayName,
          userEmail: user.email,
          userPhoto: user.photoURL
        })
      });
      const result = await response.json();
      
      if (!response.ok) {
        if (response.status === 429) {
            addLog("⏳ Đào nhanh quá! Đợi xíu...", "error");
        } else {
            throw new Error(result.error || "Lỗi Server");
        }
      } else {
        addLog(`🍯 +${BLOCK_REWARD} MeoCoin về túi!`, "success");
      }
    } catch (e) { 
      console.error("Mining Error:", e);
      addLog(`😿 Lỗi: ${e.message}`, "error"); 
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTxStatus(null);
    if (!user) return;
    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) return setTxStatus({type: 'error', msg: 'Số tiền không hợp lệ'});
    if (amount > balance) return setTxStatus({type: 'error', msg: 'Số dư không đủ'});
    if (recipientId === user.uid) return setTxStatus({type: 'error', msg: 'Không thể tự chuyển'});

    setTxStatus({type: 'info', msg: 'Đang gửi mèo đi giao hàng...'});
    try {
      const response = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user.uid,
          receiverId: recipientId,
          amount: amount
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Lỗi giao dịch");
      setTxStatus({type: 'success', msg: '✅ Giao hàng thành công!'});
      setSendAmount('');
      addLog(`🎁 Đã tặng ${amount} MCN.`, "info");
    } catch (error) { 
      setTxStatus({type: 'error', msg: `❌ Lỗi: ${error.message}`}); 
    }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); }
  };

  // --- GIAO DIỆN BỊ ĐĂNG XUẤT (KICKED OUT) ---
  if (isSessionInvalid) {
    return (
      <div style={{height:'100vh', background:'#1e293b', color:'#f87171', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', textAlign:'center', padding:'2rem'}}>
        <ShieldAlert size={80} className="animate-pulse"/>
        <div>
          <h1 style={{fontSize:'2rem', fontWeight:'bold', marginBottom:'0.5rem'}}>Tài khoản đã đăng nhập nơi khác!</h1>
          <p style={{color:'#94a3b8'}}>Để bảo mật, phiên đăng nhập này đã bị hủy.</p>
        </div>
        <button onClick={() => window.location.reload()} style={{background:'#ef4444', color:'white', border:'none', padding:'1rem 3rem', borderRadius:'50px', cursor:'pointer', fontWeight:'bold', fontSize:'1.1rem', boxShadow:'0 10px 25px rgba(239, 68, 68, 0.3)'}}>
          Đăng nhập lại tại đây
        </button>
      </div>
    );
  }

  // --- GIAO DIỆN CHẶN NHIỀU TAB ---
  if (isDuplicateTab) {
    return (
      <div style={{height:'100vh', background:'#fee2e2', color:'#991b1b', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', textAlign:'center', padding:'2rem'}}>
        <AlertTriangle size={64} className="animate-bounce"/>
        <div>
          <h1 style={{fontSize:'2rem', fontWeight:'bold', marginBottom:'0.5rem'}}>Ứng dụng đang mở ở tab khác!</h1>
          <p>Để bảo mật, MeoCoin chỉ cho phép chạy trên một tab duy nhất.</p>
        </div>
        <button onClick={() => window.location.reload()} style={{background:'#991b1b', color:'white', border:'none', padding:'1rem 2rem', borderRadius:'50px', cursor:'pointer', fontWeight:'bold', fontSize:'1rem'}}>
          Sử dụng ở tab này
        </button>
      </div>
    );
  }

  // --- GIAO DIỆN THÔNG BÁO UPDATE ---
  if (updateAvailable) {
    return (
      <div style={{height:'100vh', background:'linear-gradient(135deg, #f0abfc 0%, #a78bfa 100%)', color:'white', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', textAlign:'center', padding:'2rem', position:'relative', overflow:'hidden'}}>
        <div style={{background:'rgba(255,255,255,0.2)', backdropFilter:'blur(20px)', padding:'3rem', borderRadius:'30px', border:'1px solid rgba(255,255,255,0.3)', boxShadow:'0 20px 50px rgba(0,0,0,0.2)', maxWidth:'500px'}}>
          <Sparkles size={64} className="animate-pulse" style={{margin:'0 auto 1rem', color:'#fde047'}}/>
          <h1 style={{fontSize:'2.5rem', fontWeight:'800', marginBottom:'0.5rem', textShadow:'0 2px 10px rgba(0,0,0,0.1)'}}>Cập Nhật Mới! ✨</h1>
          <p style={{fontSize:'1.1rem', marginBottom:'2rem', lineHeight:'1.5'}}>
            MeoCoin đã có phiên bản xịn hơn. Vui lòng tải lại trang để trải nghiệm tính năng mới nhé!
          </p>
          <button onClick={() => window.location.reload()} style={{background:'white', color:'#d946ef', border:'none', padding:'1rem 3rem', borderRadius:'50px', cursor:'pointer', fontWeight:'800', fontSize:'1.2rem', display:'flex', alignItems:'center', gap:'0.5rem', margin:'0 auto', boxShadow:'0 10px 25px rgba(0,0,0,0.1)'}}>
            <Rocket size={24}/> Cập Nhật Ngay
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div style={{height:'100vh', background:'#fce7f3', color:'#db2777', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold'}}>Đang gọi mèo về... <RefreshCw className="animate-spin" style={{marginLeft:'10px'}}/></div>;

  if (!user) return (
    <div style={{height:'100vh', background:'linear-gradient(135deg, #fff1eb 0%, #ace0f9 100%)', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'2rem'}}>
      <div style={{fontSize:'4rem', fontWeight:'800', color:'#d946ef', display:'flex', alignItems:'center', gap:'1rem', textShadow:'0 4px 10px rgba(0,0,0,0.1)'}}>
        <PawPrint size={64} className="animate-bounce"/> MEONET
      </div>
      <div style={{color:'#64748b', fontSize:'1.2rem'}}>Mạng lưới đào coin cute nhất hệ mặt trời ☀️</div>
      <button onClick={handleGoogleLogin} style={{background:'white', color:'#475569', padding:'1rem 2.5rem', borderRadius:'50px', fontWeight:'700', fontSize:'1.1rem', display:'flex', alignItems:'center', gap:'0.8rem', cursor:'pointer', border:'none', boxShadow:'0 10px 25px rgba(0,0,0,0.1)', transition:'transform 0.2s'}}>
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="24" alt=""/> Đăng nhập với Google
      </button>
    </div>
  );

  const supplyPercent = Math.min((totalSupply / MAX_SUPPLY) * 100, 100);

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo-area">
          <PawPrint className="animate-bounce" size={32} color="#d946ef"/>
          <span>MEONET</span>
        </div>
        <nav className="nav-menu">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Zap size={20}/>} label="Nông Trại Mèo" />
          <NavBtn active={activeTab==='wallet'} onClick={()=>setActiveTab('wallet')} icon={<ShoppingBag size={20}/>} label="Túi Thần Kỳ" />
          <NavBtn active={activeTab==='explorer'} onClick={()=>setActiveTab('explorer')} icon={<Search size={20}/>} label="Sổ Cái Mèo" />
          <NavBtn active={activeTab==='updates'} onClick={()=>setActiveTab('updates')} icon={<History size={20}/>} label="Nhật Ký Update" />
        </nav>
        <div className="sidebar-footer">
          <div style={{display:'flex', alignItems:'center', gap:'0.8rem', marginBottom:'1rem'}}>
            <img src={user.photoURL} style={{width:'36px', borderRadius:'50%', border:'2px solid white', boxShadow:'0 2px 5px rgba(0,0,0,0.1)'}} />
            <span style={{fontSize:'0.9rem', fontWeight:'700', color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'120px'}}>{user.displayName}</span>
          </div>
          <button onClick={() => signOut(auth)} style={{background:'#fee2e2', color:'#ef4444', border:'none', padding:'0.8rem', borderRadius:'15px', cursor:'pointer', fontSize:'0.8rem', width: '100%', display:'flex', justifyContent:'center', gap:'0.5rem', fontWeight:'700', transition:'background 0.2s'}}>
            <LogOut size={16}/> Đăng Xuất
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="top-bar">
           <StatBox label="Tài Sản" value={`${balance} MCN`} icon={<Hexagon size={24} color="#f59e0b" fill="#fcd34d"/>} />
           <StatBox label="Tốc Độ Ảo" value={`~${hashRate} H/s`} icon={<Activity size={24} color="#3b82f6"/>} />
           <div className="stat-box" style={{flex: 2, display:'block'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'0.5rem'}}>
                <span className="stat-label">Tiến Độ Đào</span>
                <span className="stat-label">Cấp {currentLevel}</span>
              </div>
              <div style={{width:'100%', height:'12px', background:'#f1f5f9', borderRadius:'6px', overflow:'hidden'}}>
                <div style={{width:`${supplyPercent}%`, height:'100%', background:'linear-gradient(90deg, #60a5fa, #a78bfa)', transition:'width 0.5s', borderRadius:'6px'}}></div>
              </div>
              <div style={{fontSize:'0.8rem', color:'#94a3b8', marginTop:'0.4rem', textAlign:'right', fontWeight:'600'}}>
                {totalSupply.toLocaleString()} / {MAX_SUPPLY.toLocaleString()}
              </div>
           </div>
        </div>

        <div className="content-area">
          {activeTab === 'miner' && (
            <div className="miner-screen">
              <div className={`miner-circle ${mining ? 'active' : ''}`}>
                <PawPrint size={100} color={mining ? "#d946ef" : "#cbd5e1"} />
                <div style={{marginTop:'1.5rem', fontWeight:'800', color: mining ? '#d946ef' : '#94a3b8', fontSize:'1.2rem', letterSpacing:'1px'}}>
                  {mining ? 'ĐANG ĐÀO...' : 'ĐANG NGỦ'}
                </div>
              </div>
              <div style={{display:'flex', gap:'1.5rem'}}>
                {!mining ? (
                  <button onClick={startMining} className="btn-start"><Zap size={20}/> ĐÁNH THỨC</button>
                ) : (
                  <button onClick={stopMining} className="btn-stop"><Layers size={20}/> ĐI NGỦ</button>
                )}
              </div>
              <div className="console-log">
                {logs.length === 0 && <div style={{color:'#94a3b8', textAlign:'center', marginTop:'3rem'}}>Mèo đang đợi lệnh... 🐾</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`log-item ${log.type === 'success' ? 'log-success' : log.type === 'error' ? 'log-error' : ''}`}>
                    <span style={{opacity:0.5, fontSize:'0.8rem'}}>[{log.time}]</span> {log.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'wallet' && (
             <div className="wallet-screen">
               <div className="card">
                 <div style={{fontSize:'0.8rem', color:'#94a3b8', marginBottom:'0.8rem', fontWeight:'700', textTransform:'uppercase'}}>ID Ví Của Bạn</div>
                 <div style={{display:'flex', gap:'0.8rem'}}>
                   <input readOnly value={user?.uid} className="input-field" />
                   <button onClick={() => navigator.clipboard.writeText(user.uid)} style={{background:'#f1f5f9', border:'none', color:'#64748b', padding:'0 1.2rem', borderRadius:'15px', cursor:'pointer', transition:'background 0.2s'}}><Copy/></button>
                 </div>
               </div>
               <div className="card">
                 <h3 style={{marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:'0.8rem', color:'#334155'}}><Send size={24} color="#3b82f6"/> Chuyển MeoCoin</h3>
                 <div className="input-group">
                   <label style={{display:'block', marginBottom:'0.5rem', fontSize:'0.9rem', fontWeight:'600', color:'#64748b'}}>ID Người Nhận</label>
                   <input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="input-field" placeholder="Dán ID ví bạn bè vào đây..." />
                 </div>
                 <div className="input-group">
                   <label style={{display:'block', marginBottom:'0.5rem', fontSize:'0.9rem', fontWeight:'600', color:'#64748b'}}>Số Lượng</label>
                   <input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className="input-field" placeholder="0" />
                 </div>
                 <button onClick={handleTransfer} className="btn-send">GỬI QUÀ NGAY</button>
                 {txStatus && <div style={{marginTop:'1rem', padding:'1rem', background: txStatus.type==='success'?'#dcfce7':'#fee2e2', color: txStatus.type==='success'?'#166534':'#991b1b', borderRadius:'15px', fontWeight:'600', textAlign:'center'}}>{txStatus.msg}</div>}
               </div>

               {/* BẢNG LỊCH SỬ GIAO DỊCH */}
               <div className="card">
                 <h3 style={{marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:'0.8rem', color:'#334155'}}><History size={24} color="#f59e0b"/> Lịch Sử Giao Dịch</h3>
                 <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                   {myTransactions.length === 0 && <div style={{textAlign:'center', color:'#94a3b8', fontStyle:'italic'}}>Chưa có giao dịch nào...</div>}
                   {myTransactions.map((tx, idx) => {
                     const isReceive = tx.to === user.uid;
                     return (
                       <div key={idx} style={{display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:'1rem', borderBottom:'1px solid #f1f5f9'}}>
                         <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
                           <div style={{padding:'0.8rem', borderRadius:'12px', background: isReceive ? '#dcfce7' : '#fee2e2', color: isReceive ? '#166534' : '#991b1b'}}>
                             {isReceive ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}
                           </div>
                           <div>
                             <div style={{fontWeight:'700', color:'#334155'}}>{isReceive ? 'Nhận Coin' : 'Chuyển Coin'}</div>
                             <div style={{fontSize:'0.75rem', color:'#94a3b8'}}>{tx.timestamp ? new Date(tx.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</div>
                           </div>
                         </div>
                         <div style={{textAlign:'right'}}>
                           <div style={{fontWeight:'800', color: isReceive ? '#166534' : '#991b1b', fontSize:'1.1rem'}}>
                             {isReceive ? '+' : '-'}{tx.amount} MCN
                           </div>
                           <div style={{fontSize:'0.7rem', color:'#64748b', fontFamily:'monospace'}}>
                             {isReceive ? `Từ: ${(tx.from || '').slice(0,6)}...` : `Đến: ${(tx.to || '').slice(0,6)}...`}
                           </div>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             </div>
          )}

          {activeTab === 'explorer' && (
            <div className="explorer-grid">
              <div className="card" style={{gridColumn: '1 / -1'}}>
                 <div style={{marginBottom:'1rem', fontWeight:'bold', color:'#3b82f6', display:'flex', alignItems:'center', gap:'0.5rem'}}><Layers size={18}/> Blockchain</div>
                 <div style={{display:'flex', gap:'1rem', overflowX:'auto', paddingBottom:'1rem'}}>
                    {blockchain.map((block) => (
                      <div key={block.hash} style={{minWidth:'200px', background:'#f8fafc', border:'1px solid #e2e8f0', padding:'1rem', borderRadius:'15px', position:'relative', boxShadow:'0 2px 5px rgba(0,0,0,0.05)'}}>
                         <div style={{fontSize:'0.7rem', color:'#64748b', marginBottom:'0.5rem'}}>Block #{block.index}</div>
                         <div style={{fontSize:'0.8rem', color:'#f59e0b', fontWeight:'800', marginBottom:'0.5rem'}}>+{block.reward} MCN</div>
                         <div style={{fontSize:'0.6rem', color:'#475569', wordBreak:'break-all', fontFamily:'monospace'}}>Hash: {block.hash.slice(0,10)}...</div>
                         <div style={{fontSize:'0.7rem', color:'#334155', marginTop:'0.5rem', fontWeight:'600'}}>{block.minerName}</div>
                      </div>
                    ))}
                    {blockchain.length === 0 && <div style={{color:'#94a3b8', fontStyle:'italic'}}>Chưa có block nào được đào...</div>}
                 </div>
              </div>
              <div className="card table-container">
                <div style={{marginBottom:'1.5rem', fontWeight:'800', color:'#f59e0b', display:'flex', alignItems:'center', gap:'0.8rem', fontSize:'1.2rem'}}><Users size={24}/> Bảng Xếp Hạng Mèo</div>
                <table>
                  <thead><tr><th>Hạng</th><th>Tên Mèo</th><th>Blocks</th><th>Tài Sản</th></tr></thead>
                  <tbody>
                    {networkUsers.map((u, idx) => (
                      <tr key={u.address} style={{background: u.address === user?.uid ? '#f0f9ff' : 'transparent'}}>
                        <td>
                          <span style={{background: idx < 3 ? '#fcd34d' : '#e2e8f0', color: idx < 3 ? '#78350f' : '#64748b', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', fontSize:'0.8rem', fontWeight:'bold'}}>
                            {idx + 1}
                          </span>
                        </td>
                        <td>
                          <div style={{display:'flex', alignItems:'center', gap:'0.8rem'}}>
                            {u.photoURL && <img src={u.photoURL} style={{width:'28px', borderRadius:'50%'}}/>}
                            <span>{u.displayName}</span>
                            {u.address === user?.uid && <span style={{fontSize:'0.6rem', background:'#dbeafe', color:'#1e40af', padding:'2px 6px', borderRadius:'10px'}}>Me</span>}
                          </div>
                        </td>
                        <td style={{color:'#64748b'}}>{u.blocksMined}</td>
                        <td style={{color:'#d97706', fontWeight:'800'}}>{u.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB NHẬT KÝ */}
          {activeTab === 'updates' && (
            <div className="explorer-grid">
               <div className="card" style={{gridColumn: '1 / -1'}}>
                  <div style={{marginBottom:'1.5rem', fontWeight:'800', color:'#d946ef', display:'flex', alignItems:'center', gap:'0.8rem', fontSize:'1.2rem'}}>
                    <History size={24}/> Nhật Ký Phát Triển
                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                    {UPDATE_HISTORY.map((update, index) => (
                      <div key={index} style={{borderLeft:'4px solid #e2e8f0', paddingLeft:'1.5rem', position:'relative'}}>
                        <div style={{position:'absolute', left:'-9px', top:'0', width:'14px', height:'14px', borderRadius:'50%', background: update.color || '#cbd5e1'}}></div>
                        <div style={{fontWeight:'700', color:'#334155', fontSize:'1.1rem'}}>{update.version} <span style={{fontSize:'0.8rem', color:'#94a3b8', fontWeight:'500'}}>{update.date}</span></div>
                        <div style={{fontSize:'0.9rem', color: update.color, fontWeight:'700', margin:'0.2rem 0'}}>{update.title}</div>
                        <div style={{color:'#64748b', marginTop:'0.2rem', lineHeight:'1.6', fontSize:'0.9rem'}}>{update.desc}</div>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const NavBtn = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`nav-btn ${active ? 'active' : ''}`}>
    {icon} <span>{label}</span>
  </button>
);
const StatBox = ({ label, value, icon }) => (
  <div className="stat-box">
    <div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
    <div>{icon}</div>
  </div>
);