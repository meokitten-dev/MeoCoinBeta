import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { 
  PawPrint, Wifi, Send, Activity, ShoppingBag, Copy, Users, RefreshCw, Search, Zap, Hexagon, LogIn, LogOut, Layers, History, ArrowUpRight, ArrowDownLeft, AlertTriangle, Sparkles, Rocket, UserCog, Mail, Gift, Library
} from 'lucide-react';

// --- 1. DỮ LIỆU VẬT PHẨM (ITEMS) ---
import { ITEMS } from './data/items';
// --- 2. LỊCH SỬ UPDATE ---
import { UPDATE_HISTORY } from './data/updates';
// --- 3. CẤU HÌNH ---
const CURRENT_VERSION = "v5.0"; 
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
const appId = 'meocoin-network-v5'; 

export default function MeoCoinNetwork() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [networkUsers, setNetworkUsers] = useState([]);
  const [blockchain, setBlockchain] = useState([]); 
  const [totalSupply, setTotalSupply] = useState(0); 
  
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0); 
  const [logs, setLogs] = useState([]);
  
  const [inventory, setInventory] = useState({});
  const [activeBuff, setActiveBuff] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // 👇 Logic tự động chuyển tab sau update
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('meocoin_target_tab');
    if (savedTab) {
      localStorage.removeItem('meocoin_target_tab');
      return savedTab;
    }
    return 'miner';
  });

  const [loading, setLoading] = useState(true);
  
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

  // --- INIT ---
  useEffect(() => {
    const channel = new BroadcastChannel('meocoin_channel');
    channel.postMessage({ type: 'NEW_TAB_OPENED' });
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_TAB_OPENED') {
        setIsDuplicateTab(true); stopMining(); 
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const res = await fetch('/api/session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        setUser(null); setIsSessionReady(false);
      }
      setLoading(false);
    });

    // CHECK UPDATE VERSION
    const systemRef = doc(db, 'artifacts', appId, 'public', 'data', 'system', 'info');
    onSnapshot(systemRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.latestVersion && data.latestVersion !== CURRENT_VERSION) {
          setUpdateAvailable(true); 
          stopMining(); 
        }
      } else {
        // Tự tạo file version nếu chưa có
        setDoc(systemRef, { latestVersion: CURRENT_VERSION }, { merge: true });
      }
    });

    return () => { unsubscribe(); channel.close(); };
  }, []);

  // --- SYNC ---
  useEffect(() => {
    if (!user || isDuplicateTab || updateAvailable || isSessionInvalid || !isSessionReady) return; 
    
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (doc) => { 
      if (doc.exists()) {
        const data = doc.data();
        setBalance(data.balance || 0);
        setMyBlocksMined(data.blocksMined || 0);
        setInventory(data.inventory || {});
        setActiveBuff(data.activeBuff || null);

        if (localSessionIdRef.current && data.currentSessionId && data.currentSessionId !== localSessionIdRef.current) {
          setIsSessionInvalid(true); stopMining();
        }
      }
    });

    const timer = setInterval(() => {
      if (activeBuff && activeBuff.expiresAt) {
        const remaining = activeBuff.expiresAt - Date.now();
        setTimeLeft(remaining > 0 ? remaining : 0);
      } else { setTimeLeft(0); }
    }, 1000);

    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersCol, (snap) => {
      const u = []; snap.forEach(d => u.push(d.data()));
      u.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      setNetworkUsers(u);
    });

    const blocksQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'blocks'), orderBy('timestamp', 'desc'), limit(10));
    const unsubBlocks = onSnapshot(blocksQuery, (snap) => {
      const b = []; snap.forEach(d => b.push(d.data()));
      setBlockchain(b);
    });

    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
    const unsubStats = onSnapshot(statsRef, (doc) => {
      if (doc.exists()) {
        setTotalSupply(doc.data().totalSupply || 0);
        totalSupplyRef.current = doc.data().totalSupply || 0;
      }
    });

    const txQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    const unsubTx = onSnapshot(txQuery, (snap) => {
      const txs = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.from === user.uid || data.to === user.uid) txs.push(data);
      });
      setMyTransactions(txs);
    });

    return () => { unsubUser(); unsubUsers(); unsubBlocks(); unsubStats(); unsubTx(); clearInterval(timer); };
  }, [user, isDuplicateTab, updateAvailable, isSessionInvalid, isSessionReady, activeBuff]);

  // --- ACTIONS ---
  const handleBuyItem = async (itemId) => {
    if (!user) return;
    if (!window.confirm("Meo có chắc muốn mua không?")) return;
    try {
      const res = await fetch('/api/shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, itemId })
      });
      const data = await res.json();
      if (data.success) alert("Mua thành công! 😺"); else alert("Lỗi: " + data.message);
    } catch (e) { alert("Lỗi mạng!"); }
  };

  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) return;
    if (mining) return;
    setMining(true);
    isSubmittingRef.current = false;
    
    miningIntervalRef.current = setInterval(async () => {
      if (isSubmittingRef.current) return;
      const speedMultiplier = (activeBuff && activeBuff.type === 'speed' && timeLeft > 0) ? 2 : 1;
      setHashRate((Math.floor(Math.random() * 500) + 1500) * speedMultiplier);
      const chance = 0.01 * speedMultiplier; 
      
      if (Math.random() < chance) {
        isSubmittingRef.current = true;
        addLog("⛏️ Đang đào trúng mạch...", "info"); 
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
  };

  const submitBlockToServer = async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/mine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, minerName: user.displayName, userEmail: user.email, userPhoto: user.photoURL })
      });
      const result = await response.json();
      if (!response.ok) {
         if (response.status !== 429) addLog(result.message || "Lỗi", "error");
      } else {
         addLog("✨ Vừa tìm thấy gì đó! Kiểm tra kho nào!", "success");
      }
    } catch (e) { console.error(e); }
  };

  const addLog = (msg, type) => {
     const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });
     setLogs(prev => [{time, msg, type}, ...prev].slice(0, 20));
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTxStatus(null);
    if (!user) return;
    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) return setTxStatus({type: 'error', msg: 'Số tiền lỗi'});
    if (amount > balance) return setTxStatus({type: 'error', msg: 'Không đủ tiền'});
    if (recipientId === user.uid) return setTxStatus({type: 'error', msg: 'Tự chuyển?'});
    setTxStatus({type: 'info', msg: 'Đang gửi...'});
    try {
      const response = await fetch('/api/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: user.uid, receiverId: recipientId, amount: amount })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setTxStatus({type: 'success', msg: '✅ Thành công!'});
      setSendAmount('');
      addLog(`🎁 Đã tặng ${amount} MCN.`, "info");
    } catch (error) { setTxStatus({type: 'error', msg: `❌ ${error.message}`}); }
  };

  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); } };
  
  // 👇 HÀM XỬ LÝ UPDATE NGAY 👇
  const handleUpdateNow = () => { 
    localStorage.setItem('meocoin_target_tab', 'updates'); // Lưu lệnh chuyển tab
    window.location.reload(); // Tải lại trang
  };
  
  const formatTime = (ms) => {
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / 1000 / 60) % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const calculateLevel = (currentSupply) => {
    if (currentSupply < 50000) return 1; 
    if (currentSupply < 200000) return 2;
    if (currentSupply < 400000) return 3;
    if (currentSupply < 600000) return 4;
    if (currentSupply < 800000) return 5;
    return 6;
  };

  // --- RENDERING ---
  if (isDuplicateTab) return <div style={{height:'100vh', background:'#fee2e2', color:'#991b1b', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', padding:'2rem', textAlign:'center'}}><AlertTriangle size={64}/><h1>Đã mở ở tab khác!</h1><button onClick={()=>window.location.reload()} style={{padding:'1rem 2rem', background:'#991b1b', color:'white', border:'none', borderRadius:'50px', fontWeight:'bold'}}>Dùng ở đây</button></div>;
  if (isSessionInvalid) return <div style={{height:'100vh', background:'#1e293b', color:'#f87171', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', padding:'2rem', textAlign:'center'}}><AlertTriangle size={64}/><h1>Đăng nhập nơi khác!</h1><button onClick={()=>window.location.reload()} style={{padding:'1rem 3rem', background:'#ef4444', color:'white', border:'none', borderRadius:'50px', fontWeight:'bold'}}>Đăng nhập lại</button></div>;
  
  // 👇 MÀN HÌNH UPDATE ĐÃ TRỞ LẠI 👇
  if (updateAvailable) {
    const latestUpdate = UPDATE_HISTORY[0];
    return (
      <div style={{height:'100vh', background:'linear-gradient(135deg, #f0abfc 0%, #a78bfa 100%)', color:'white', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'1.5rem', textAlign:'center', padding:'2rem', position:'relative', overflow:'hidden'}}>
        <div style={{background:'rgba(255,255,255,0.25)', backdropFilter:'blur(25px)', padding:'3rem 2rem', borderRadius:'40px', border:'1px solid rgba(255,255,255,0.4)', boxShadow:'0 25px 60px rgba(0,0,0,0.25)', maxWidth:'500px', width:'90%'}}>
          <div style={{marginBottom:'1.5rem', position:'relative'}}><Gift size={80} className="animate-bounce" style={{color:'#fde047', filter:'drop-shadow(0 5px 15px rgba(253, 224, 71, 0.5))'}}/><Sparkles size={40} style={{position:'absolute', top:'-10px', right:'30%', color:'white'}} className="animate-pulse"/></div>
          <h1 style={{fontSize:'2.2rem', fontWeight:'900', marginBottom:'0.5rem', textShadow:'0 2px 10px rgba(0,0,0,0.1)', lineHeight:'1.2'}}>Cập Nhật Mới! ✨</h1>
          <div style={{background:'rgba(255,255,255,0.2)', padding:'1rem', borderRadius:'20px', margin:'1.5rem 0', textAlign:'left'}}>
            <div style={{fontSize:'0.9rem', color:'#fde047', fontWeight:'800', textTransform:'uppercase', marginBottom:'0.2rem'}}>Phiên bản {latestUpdate.version}</div>
            <div style={{fontSize:'1.1rem', fontWeight:'800', marginBottom:'0.5rem'}}>{latestUpdate.title}</div>
            <div style={{fontSize:'0.95rem', lineHeight:'1.5', opacity:'0.9'}}>{latestUpdate.desc}</div>
          </div>
          <button onClick={handleUpdateNow} style={{background:'white', color:'#d946ef', border:'none', padding:'1.2rem 3.5rem', borderRadius:'50px', cursor:'pointer', fontWeight:'900', fontSize:'1.2rem', display:'flex', alignItems:'center', gap:'0.8rem', margin:'0 auto', boxShadow:'0 10px 30px rgba(0,0,0,0.15)', width:'100%', justifyContent:'center'}}><Rocket size={28}/> Cập Nhật Ngay</button>
        </div>
      </div>
    );
  }

  if (loading) return <div style={{height:'100vh', background:'#fce7f3', color:'#db2777', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold'}}>Đang tải... <RefreshCw className="animate-spin" style={{marginLeft:'10px'}}/></div>;
  if (!user) return <div style={{height:'100vh', background:'linear-gradient(135deg, #fff1eb 0%, #ace0f9 100%)', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'2rem'}}><div style={{fontSize:'4rem', fontWeight:'800', color:'#d946ef', display:'flex', alignItems:'center', gap:'1rem'}}><PawPrint size={64} className="animate-bounce"/> MEONET</div><button onClick={handleGoogleLogin} style={{background:'white', color:'#475569', padding:'1rem 2.5rem', borderRadius:'50px', fontWeight:'700', display:'flex', alignItems:'center', gap:'0.8rem', border:'none', boxShadow:'0 10px 25px rgba(0,0,0,0.1)'}}><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="24" alt=""/> Đăng nhập với Google</button></div>;

  const supplyPercent = Math.min((totalSupply / MAX_SUPPLY) * 100, 100);

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo-area"><PawPrint size={32}/> MEONET V5</div>
        <nav className="nav-menu">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Zap/>} label="Nông Trại" />
          <NavBtn active={activeTab==='shop'} onClick={()=>setActiveTab('shop')} icon={<ShoppingBag/>} label="Cửa Hàng" />
          <NavBtn active={activeTab==='collection'} onClick={()=>setActiveTab('collection')} icon={<Library/>} label="Bảo Tàng" />
          <NavBtn active={activeTab==='wallet'} onClick={()=>setActiveTab('wallet')} icon={<Activity/>} label="Ví & Giao Dịch" />
          <NavBtn active={activeTab==='account'} onClick={()=>setActiveTab('account')} icon={<UserCog/>} label="Tài Khoản" />
          <NavBtn active={activeTab==='updates'} onClick={()=>setActiveTab('updates')} icon={<History/>} label="Nhật Ký" />
        </nav>
      </div>

      <div className="main-content">
        <div className="top-bar">
           <StatBox label="Tài Sản" value={`${balance} MCN`} icon={<Hexagon color="#facc15"/>} />
           <div className="stat-box" style={{borderColor: timeLeft > 0 ? '#d946ef' : 'white'}}>
              <div><div className="stat-label">HIỆU ỨNG</div><div className="stat-value" style={{fontSize:'1rem', color: timeLeft > 0 ? '#d946ef' : '#94a3b8'}}>{timeLeft > 0 ? `${activeBuff?.name} (${formatTime(timeLeft)})` : 'Không có'}</div></div>
              <div className={timeLeft > 0 ? "animate-spin" : ""}><Sparkles color={timeLeft > 0 ? "#d946ef" : "#cbd5e1"}/></div>
           </div>
        </div>

        <div className="content-area">
          {activeTab === 'miner' && (
            <div className="miner-screen">
              <div className={`miner-circle ${mining ? 'active' : ''}`}>
                <PawPrint size={100} color={mining ? "#d946ef" : "#cbd5e1"} />
                <div style={{marginTop:'1rem', fontWeight:'bold'}}>{mining ? 'ĐANG KHẢO CỔ...' : 'ĐANG NGHỈ'}</div>
              </div>
              <button onClick={mining ? stopMining : startMining} className={mining ? "btn-stop" : "btn-start"}>
                {mining ? "DỪNG LẠI" : "BẮT ĐẦU ĐÀO"}
              </button>
              <div className="console-log">{logs.map((l,i) => <div key={i} className={`log-item log-${l.type}`}>[{l.time}] {l.msg}</div>)}</div>
            </div>
          )}

          {activeTab === 'shop' && (
            <div className="explorer-grid">
              <div className="card" style={{gridColumn: '1/-1'}}>
                <h2 style={{marginBottom:'1rem'}}>Cửa Hàng Đạo Cụ 🏪</h2>
                <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap:'1rem'}}>
                  <div style={{background:'#fdf2f8', padding:'1.5rem', borderRadius:'15px', border:'1px solid #fbcfe8'}}>
                    <div style={{fontSize:'2rem'}}>⚡</div>
                    <h3 style={{margin:'0.5rem 0'}}>Nước Tăng Lực</h3>
                    <p style={{fontSize:'0.9rem', color:'#64748b'}}>Tăng x2 tốc độ đào, giảm thời gian hồi chiêu còn 2.5s.</p>
                    <div style={{marginTop:'1rem', fontWeight:'bold', color:'#d946ef'}}>10 phút</div>
                    <button onClick={() => handleBuyItem('speed_potion')} style={{width:'100%', marginTop:'1rem', padding:'0.8rem', background:'#d946ef', color:'white', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:'bold'}}>Mua (100 MCN)</button>
                  </div>
                  <div style={{background:'#f0f9ff', padding:'1.5rem', borderRadius:'15px', border:'1px solid #bae6fd'}}>
                    <div style={{fontSize:'2rem'}}>🍀</div>
                    <h3 style={{margin:'0.5rem 0'}}>Kính Lúp May Mắn</h3>
                    <p style={{fontSize:'0.9rem', color:'#64748b'}}>Tăng tỷ lệ tìm thấy đồ Hiếm và Huyền Thoại.</p>
                    <div style={{marginTop:'1rem', fontWeight:'bold', color:'#0ea5e9'}}>10 phút</div>
                    <button onClick={() => handleBuyItem('lucky_charm')} style={{width:'100%', marginTop:'1rem', padding:'0.8rem', background:'#0ea5e9', color:'white', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:'bold'}}>Mua (500 MCN)</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'collection' && (
            <div className="card">
              <h2 style={{marginBottom:'1.5rem', display:'flex', gap:'0.5rem'}}><Library/> Bảo Tàng Khảo Cổ</h2>
              <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap:'1rem'}}>
                {Object.values(ITEMS).map(item => {
                  const count = inventory[item.id] || 0;
                  const isOwned = count > 0;
                  return (
                    <div key={item.id} style={{opacity: isOwned ? 1 : 0.4, filter: isOwned ? 'none' : 'grayscale(100%)', background: isOwned ? `${item.color}20` : '#f1f5f9', border: `2px solid ${isOwned ? item.color : '#e2e8f0'}`, borderRadius: '15px', padding: '1rem', textAlign: 'center', position:'relative'}}>
                      <div style={{fontSize:'2rem'}}>{item.icon}</div>
                      <div style={{fontSize:'0.7rem', fontWeight:'bold', marginTop:'0.5rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{item.name}</div>
                      {isOwned && <div style={{position:'absolute', top:'-5px', right:'-5px', background:item.color, color:'white', borderRadius:'50%', width:'20px', height:'20px', fontSize:'0.7rem', display:'flex', alignItems:'center', justifyContent:'center'}}>{count}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 👇 TAB WALLET: CÓ LỊCH SỬ GIAO DỊCH 👇 */}
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

          {/* 👇 TAB EXPLORER: CÓ BẢNG XẾP HẠNG & BLOCKCHAIN 👇 */}
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
              <div className="card" style={{display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:'1rem'}}>
                <img src={user.photoURL} style={{width:'100px', borderRadius:'50%'}} />
                <h2>{user.displayName}</h2>
                <div style={{display:'flex', gap:'1rem', width:'100%', marginTop:'1rem'}}>
                  <div style={{flex:1, background:'#f8fafc', padding:'1rem', borderRadius:'15px'}}>
                    <div style={{fontSize:'0.8rem', color:'#94a3b8', fontWeight:'700'}}>ĐÃ ĐÀO</div>
                    <div style={{fontSize:'1.2rem', color:'#d946ef', fontWeight:'800'}}>{myBlocksMined} Block</div>
                  </div>
                  <div style={{flex:1, background:'#f8fafc', padding:'1rem', borderRadius:'15px'}}>
                    <div style={{fontSize:'0.8rem', color:'#94a3b8', fontWeight:'700'}}>LEVEL</div>
                    <div style={{fontSize:'1.2rem', color:'#3b82f6', fontWeight:'800'}}>{currentLevel}</div>
                  </div>
                </div>
                <button onClick={() => signOut(auth)} style={{padding:'0.8rem 2rem', background:'#fee2e2', color:'#ef4444', border:'none', borderRadius:'10px', fontWeight:'bold', cursor:'pointer', marginTop:'1rem'}}>Đăng Xuất</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const NavBtn = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`nav-btn ${active ? 'active' : ''}`}>{icon} <span>{label}</span></button>
);
const StatBox = ({ label, value, icon }) => (
  <div className="stat-box"><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div><div>{icon}</div></div>
);