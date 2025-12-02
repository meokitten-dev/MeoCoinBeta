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
  // Thêm icon UserCog cho tab Tài khoản
  PawPrint, Wifi, Send, Activity, Database, ShoppingBag, Copy, Users, RefreshCw, Search, Zap, Hexagon, LogIn, LogOut, Layers, History, ArrowUpRight, ArrowDownLeft, AlertTriangle, Sparkles, Rocket, UserCog, Mail, Gift
} from 'lucide-react';

import { UPDATE_HISTORY } from './data/updates';


import CuteEffects from './components/CuteEffects';

import './index.css'

const CURRENT_VERSION = "v4.9.2"; 
const BLOCK_REWARD = 10; 
const MAX_SUPPLY = 1000000; 

// 👇 ĐIỀN CONFIG CỦA MEO VÀO ĐÂY 👇
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
  const [loading, setLoading] = useState(true);
  
  // 👇 LOGIC THÔNG MINH: Kiểm tra xem có lệnh chuyển tab từ lần trước không
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('meocoin_target_tab');
    if (savedTab) {
      localStorage.removeItem('meocoin_target_tab'); // Xóa lệnh sau khi dùng
      return savedTab;
    }
    return 'miner'; // Mặc định là máy đào
  });

  const [recipientId, setRecipientId] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [txStatus, setTxStatus] = useState(null);
  const [myTransactions, setMyTransactions] = useState([]); 

  const [isDuplicateTab, setIsDuplicateTab] = useState(false);
  const [isSessionInvalid, setIsSessionInvalid] = useState(false); 
  const [updateAvailable, setUpdateAvailable] = useState(false); 
  const [isSessionReady, setIsSessionReady] = useState(false);
  
  const [myBlocksMined, setMyBlocksMined] = useState(0);

  const localSessionIdRef = useRef(null);
  const miningIntervalRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const totalSupplyRef = useRef(0);

  // --- 1. INIT ---
  useEffect(() => {
    const channel = new BroadcastChannel('meocoin_channel');
    channel.postMessage({ type: 'NEW_TAB_OPENED' });
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_TAB_OPENED') {
        setIsDuplicateTab(true);
        stopMining(); 
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const res = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.uid })
          });
          const data = await res.json();
          if (data.sessionId) {
            localSessionIdRef.current = data.sessionId;
            setIsSessionReady(true);
          }
        } catch (e) { console.error(e); }
        setUser(currentUser); 
      } else {
        setUser(null);
        setIsSessionReady(false);
      }
      setLoading(false);
    });

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

  // --- 2. SYNC ---
  useEffect(() => {
    if (!user || isDuplicateTab || updateAvailable || isSessionInvalid || !isSessionReady) return; 
    
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    onSnapshot(userRef, (doc) => { 
      if (doc.exists()) {
        const data = doc.data();
        setBalance(data.balance || 0);
        setMyBlocksMined(data.blocksMined || 0);
        if (localSessionIdRef.current && data.currentSessionId && data.currentSessionId !== localSessionIdRef.current) {
          setIsSessionInvalid(true);
          stopMining();
        }
      }
    });

    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    onSnapshot(usersCol, (snap) => {
      const u = []; snap.forEach(d => u.push(d.data()));
      u.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      setNetworkUsers(u);
    });

    const blocksQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'blocks'), orderBy('index', 'desc'), limit(10));
    onSnapshot(blocksQuery, (snap) => {
      const b = []; snap.forEach(d => b.push(d.data()));
      setBlockchain(b);
    });

    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
    onSnapshot(statsRef, (doc) => {
      if (doc.exists()) {
        const supply = doc.data().totalSupply || 0;
        setTotalSupply(supply);
        totalSupplyRef.current = supply;
        setCurrentLevel(calculateLevel(supply));
      }
    });

    const txQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    onSnapshot(txQuery, (snap) => {
      const txs = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.from === user.uid || data.to === user.uid) txs.push(data);
      });
      setMyTransactions(txs);
    });

  }, [user, isDuplicateTab, updateAvailable, isSessionInvalid, isSessionReady]);

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
      case 1: return 0.2; case 2: return 0.1; case 3: return 0.05; case 4: return 0.02; case 5: return 0.01; case 6: return 0.001; default: return 0.01;
    }
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });
    setLogs(prev => [{time, msg: String(msg), type}, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) return addLog("Hết coin rồi Meo ơi!", "error");
    if (mining) return;
    setMining(true);
    isSubmittingRef.current = false;
    addLog(`🌸 Đã bật máy đào! Cấp độ: ${calculateLevel(totalSupplyRef.current)}`, "info");

    miningIntervalRef.current = setInterval(async () => {
      if (isSubmittingRef.current) return;
      const fakeHashRate = Math.floor(Math.random() * 500) + 1500; 
      setHashRate(fakeHashRate);
      const level = calculateLevel(totalSupplyRef.current);
      const chance = getWinChance(level);
      if (Math.random() < chance) {
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
        body: JSON.stringify({ userId: user.uid, minerName: user.displayName, userEmail: user.email, userPhoto: user.photoURL })
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429) addLog("⏳ Đào nhanh quá! Đợi xíu...", "error");
        else throw new Error(result.error || "Lỗi Server");
      } else {
        addLog(`🍯 +${BLOCK_REWARD} MeoCoin về túi!`, "success");
      }
    } catch (e) { console.error(e); addLog(`😿 Lỗi: ${e.message}`, "error"); }
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
        body: JSON.stringify({ senderId: user.uid, receiverId: recipientId, amount: amount })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Lỗi giao dịch");
      setTxStatus({type: 'success', msg: '✅ Giao hàng thành công!'});
      setSendAmount('');
      addLog(`🎁 Đã tặng ${amount} MCN.`, "info");
    } catch (error) { setTxStatus({type: 'error', msg: `❌ Lỗi: ${error.message}`}); }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); }
  };

  // Hàm xử lý khi bấm nút Cập Nhật
  const handleUpdateNow = () => {
    // Lưu lệnh chuyển tab vào bộ nhớ
    localStorage.setItem('meocoin_target_tab', 'updates');
    window.location.reload();
  };

  // --- GIAO DIỆN THÔNG BÁO UPDATE (Đã nâng cấp) ---
  if (updateAvailable) {
    // Lấy thông tin bản cập nhật mới nhất
    const latestUpdate = UPDATE_HISTORY[0];
    return (
      <div style={{height:'100vh', background:'linear-gradient(135deg, #f0abfc 0%, #a78bfa 100%)', color:'white', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', textAlign:'center', padding:'2rem', position:'relative', overflow:'hidden'}}>
        <div style={{background:'rgba(255,255,255,0.25)', backdropFilter:'blur(25px)', padding:'3rem 2rem', borderRadius:'40px', border:'1px solid rgba(255,255,255,0.4)', boxShadow:'0 25px 60px rgba(0,0,0,0.25)', maxWidth:'500px', width:'90%'}}>
          
          <div style={{marginBottom:'1.5rem', position:'relative'}}>
            <Gift size={80} className="animate-bounce" style={{color:'#fde047', filter:'drop-shadow(0 5px 15px rgba(253, 224, 71, 0.5))'}}/>
            <Sparkles size={40} style={{position:'absolute', top:'-10px', right:'30%', color:'white'}} className="animate-pulse"/>
          </div>

          <h1 style={{fontSize:'2.2rem', fontWeight:'900', marginBottom:'0.5rem', textShadow:'0 2px 10px rgba(0,0,0,0.1)', lineHeight:'1.2'}}>
            Cập Nhật Mới! ✨
          </h1>
          
          <div style={{background:'rgba(255,255,255,0.2)', padding:'1rem', borderRadius:'20px', margin:'1.5rem 0', textAlign:'left'}}>
            <div style={{fontSize:'0.9rem', color:'#fde047', fontWeight:'800', textTransform:'uppercase', marginBottom:'0.2rem'}}>Phiên bản {latestUpdate.version}</div>
            <div style={{fontSize:'1.1rem', fontWeight:'800', marginBottom:'0.5rem'}}>{latestUpdate.title}</div>
            <div style={{fontSize:'0.95rem', lineHeight:'1.5', opacity:'0.9'}}>{latestUpdate.desc}</div>
          </div>

          <p style={{fontSize:'1rem', marginBottom:'2rem', lineHeight:'1.6', opacity:'0.9'}}>
            MeoCoin đã được nâng cấp xịn hơn để phục vụ bạn tốt nhất.<br/>Cập nhật ngay để khám phá nhé!
          </p>

          <button 
            onClick={handleUpdateNow} 
            style={{
              background:'white', color:'#d946ef', border:'none', padding:'1.2rem 3.5rem', borderRadius:'50px', 
              cursor:'pointer', fontWeight:'900', fontSize:'1.2rem', display:'flex', alignItems:'center', gap:'0.8rem',
              margin:'0 auto', boxShadow:'0 10px 30px rgba(0,0,0,0.15)', transition:'transform 0.2s', width:'100%', justifyContent:'center'
            }}
            onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
          >
            <Rocket size={28}/> Cập Nhật Ngay
          </button>
        </div>
      </div>
    );
  }

  if (isDuplicateTab) return <div style={{height:'100vh', background:'#fee2e2', color:'#991b1b', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', padding:'2rem', textAlign:'center'}}><AlertTriangle size={64}/><h1>Đã mở ở tab khác!</h1><button onClick={()=>window.location.reload()} style={{padding:'1rem 2rem', background:'#991b1b', color:'white', border:'none', borderRadius:'50px', fontWeight:'bold'}}>Dùng ở đây</button></div>;
  if (isSessionInvalid) return <div style={{height:'100vh', background:'#1e293b', color:'#f87171', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', padding:'2rem', textAlign:'center'}}><AlertTriangle size={64}/><h1>Đăng nhập nơi khác!</h1><button onClick={()=>window.location.reload()} style={{padding:'1rem 3rem', background:'#ef4444', color:'white', border:'none', borderRadius:'50px', fontWeight:'bold'}}>Đăng nhập lại</button></div>;
  if (loading) return <div style={{height:'100vh', background:'#fce7f3', color:'#db2777', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold'}}>Đang tải... <RefreshCw className="animate-spin" style={{marginLeft:'10px'}}/></div>;

  if (!user) return (
    <div style={{height:'100vh', background:'linear-gradient(135deg, #fff1eb 0%, #ace0f9 100%)', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'2rem'}}>
      <div style={{fontSize:'4rem', fontWeight:'800', color:'#d946ef', display:'flex', alignItems:'center', gap:'1rem'}}><PawPrint size={64} className="animate-bounce"/> MEONET</div>
      <button onClick={handleGoogleLogin} style={{background:'white', color:'#475569', padding:'1rem 2.5rem', borderRadius:'50px', fontWeight:'700', display:'flex', alignItems:'center', gap:'0.8rem', border:'none', boxShadow:'0 10px 25px rgba(0,0,0,0.1)'}}>
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="24" alt=""/> Đăng nhập với Google
      </button>
    </div>
  );

  const supplyPercent = Math.min((totalSupply / MAX_SUPPLY) * 100, 100);

  return (
    <div className="app-container">
      <CuteEffects />
      <div className="sidebar">
        <div className="logo-area">
          <PawPrint className="animate-bounce" size={32} color="#d946ef"/>
          <span>MEONET</span>
        </div>
        <nav className="nav-menu">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Zap size={20}/>} label="Nông Trại" />
          <NavBtn active={activeTab==='wallet'} onClick={()=>setActiveTab('wallet')} icon={<ShoppingBag size={20}/>} label="Túi Thần Kỳ" />
          <NavBtn active={activeTab==='explorer'} onClick={()=>setActiveTab('explorer')} icon={<Search size={20}/>} label="Sổ Cái" />
          <NavBtn active={activeTab==='account'} onClick={()=>setActiveTab('account')} icon={<UserCog size={20}/>} label="Tài Khoản" />
          <NavBtn active={activeTab==='updates'} onClick={()=>setActiveTab('updates')} icon={<History size={20}/>} label="Nhật Ký" />
        </nav>
        
        {/* Footer chỉ hiện trên Desktop */}
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
        {/* Top bar giữ nguyên */}
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
          {/* ... (Các tab Miner, Wallet, Explorer giữ nguyên) ... */}
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
                             <div style={{fontWeight:'700', color:'#334155'}}>{isReceive ? 'Nhận Meow' : 'Chuyển Meow'}</div>
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

          {/* TAB TÀI KHOẢN */}
          {activeTab === 'account' && (
  <div className="wallet-screen">
    <div className="card" style={{display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:'1.5rem'}}>
      <div style={{position:'relative', marginBottom:'1.5rem'}}>
        <img 
          src={user.photoURL} 
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            border: '4px solid #ffb6c1',
            boxShadow: '0 10px 30px rgba(255, 182, 193, 0.3)',
            position: 'relative',
            zIndex: 2
          }} 
        />
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          background: 'linear-gradient(135deg, #ffb6c1, #e6e6fa)',
          color: 'white',
          borderRadius: '50%',
          padding: '10px',
          border: '3px solid white',
          boxShadow: '0 5px 15px rgba(255, 182, 193, 0.4)',
          zIndex: 3,
          animation: 'bounce 2s infinite'
        }}>
          <Zap size={24} />
        </div>
        <div style={{
          position: 'absolute',
          bottom: '-5px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #b2f2bb, #8dd7a0)',
          color: 'white',
          padding: '5px 15px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          fontWeight: '800',
          boxShadow: '0 5px 15px rgba(178, 242, 187, 0.3)',
          zIndex: 3
        }}>
          Cấp {currentLevel}
        </div>
      </div>
      
      <div>
        <h2 style={{fontSize:'1.8rem', fontWeight:'900', color:'#777', marginBottom:'0.5rem'}}>{user.displayName}</h2>
        <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'0.8rem', color:'#aaa', fontSize:'1rem'}}>
          <Mail size={18}/> {user.email}
        </div>
      </div>
      
      <div style={{display:'flex', gap:'1.5rem', width:'100%', marginTop:'1rem'}}>
        <div style={{flex:1, background:'rgba(255, 255, 255, 0.8)', padding:'1.2rem', borderRadius:'20px', border:'2px solid rgba(255, 182, 193, 0.3)'}}>
          <div style={{fontSize:'0.9rem', color:'#ffb6c1', fontWeight:'800', marginBottom:'0.5rem'}}>ĐÃ ĐÀO</div>
          <div style={{fontSize:'1.4rem', color:'#ff7f50', fontWeight:'900'}}>{myBlocksMined} Block</div>
        </div>
        <div style={{flex:1, background:'rgba(255, 255, 255, 0.8)', padding:'1.2rem', borderRadius:'20px', border:'2px solid rgba(255, 182, 193, 0.3)'}}>
          <div style={{fontSize:'0.9rem', color:'#b2f2bb', fontWeight:'800', marginBottom:'0.5rem'}}>LEVEL</div>
          <div style={{fontSize:'1.4rem', color:'#e6e6fa', fontWeight:'900'}}>{currentLevel}</div>
        </div>
      </div>
      
      <button onClick={() => signOut(auth)} style={{
        background:'linear-gradient(135deg, #ff9aa2, #ff7b8a)',
        color:'white',
        border:'none',
        padding:'1.2rem',
        borderRadius:'18px',
        cursor:'pointer',
        fontSize:'1.1rem',
        width: '100%',
        display:'flex',
        justifyContent:'center',
        alignItems:'center',
        gap:'0.8rem',
        fontWeight:'800',
        marginTop:'1.5rem',
        boxShadow:'0 10px 25px rgba(255, 154, 162, 0.4)',
        transition:'transform 0.3s'
      }}
      onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
      onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
      >
        <LogOut size={22}/> Đăng Xuất
      </button>
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