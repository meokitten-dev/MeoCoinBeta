import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { 
  PawPrint, Wifi, Send, Activity, ShoppingBag, Copy, Users, RefreshCw, Search, Zap, Hexagon, LogIn, LogOut, Layers, History, ArrowUpRight, ArrowDownLeft, AlertTriangle, UserCog, Mail, Gift
} from 'lucide-react';

// --- DATA & CONFIG ---
import { UPDATE_HISTORY } from './data/updates';

const CURRENT_VERSION = "v5.0-UI"; 
const BLOCK_REWARD = 10; 
const MAX_SUPPLY = 1000000; 

// 👇 Config Meo 👇
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

  // --- LOGIC ---
  useEffect(() => {
    const channel = new BroadcastChannel('meocoin_channel');
    channel.postMessage({ type: 'NEW_TAB_OPENED' });
    channel.onmessage = (event) => { if (event.data.type === 'NEW_TAB_OPENED') { setIsDuplicateTab(true); stopMining(); } };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid }) });
          const data = await res.json();
          if (data.sessionId) { localSessionIdRef.current = data.sessionId; setIsSessionReady(true); }
        } catch (e) { console.error(e); }
        setUser(currentUser); 
      } else { setUser(null); setIsSessionReady(false); }
      setLoading(false);
    });

    const systemRef = doc(db, 'artifacts', appId, 'public', 'data', 'system', 'info');
    onSnapshot(systemRef, (doc) => {
      if (doc.exists() && doc.data().latestVersion && doc.data().latestVersion !== CURRENT_VERSION) { setUpdateAvailable(true); stopMining(); }
    });
    return () => { unsubscribe(); channel.close(); };
  }, []);

  useEffect(() => {
    if (!user || isDuplicateTab || updateAvailable || !isSessionReady) return; 
    
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    onSnapshot(userRef, (doc) => { 
      if (doc.exists()) {
        const data = doc.data();
        setBalance(data.balance || 0);
        setMyBlocksMined(data.blocksMined || 0);
        if (localSessionIdRef.current && data.currentSessionId && data.currentSessionId !== localSessionIdRef.current) {
          setIsSessionInvalid(true); stopMining();
        }
      }
    });

    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    onSnapshot(usersCol, (snap) => { const u = []; snap.forEach(d => u.push(d.data())); u.sort((a, b) => (b.balance || 0) - (a.balance || 0)); setNetworkUsers(u); });

    const blocksQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'blocks'), orderBy('timestamp', 'desc'), limit(10));
    onSnapshot(blocksQuery, (snap) => { const b = []; snap.forEach(d => b.push(d.data())); setBlockchain(b); });

    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
    onSnapshot(statsRef, (doc) => {
      if (doc.exists()) { setTotalSupply(doc.data().totalSupply || 0); totalSupplyRef.current = doc.data().totalSupply || 0; }
    });

    const txQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    onSnapshot(txQuery, (snap) => { const txs = []; snap.forEach(doc => { const data = doc.data(); if (data.from === user.uid || data.to === user.uid) txs.push(data); }); setMyTransactions(txs); });
  }, [user, isDuplicateTab, updateAvailable, isSessionInvalid, isSessionReady]);

  const calculateLevel = (currentSupply) => {
    if (currentSupply < 50000) return 1; if (currentSupply < 200000) return 2; if (currentSupply < 400000) return 3;
    if (currentSupply < 600000) return 4; if (currentSupply < 800000) return 5; return 6;
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });
    setLogs(prev => [{time, msg, type}, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) return addLog("Hết coin rồi Meo ơi!", "error");
    if (mining) return;
    setMining(true);
    isSubmittingRef.current = false;
    addLog(`🌸 Khởi động máy đào! Cấp độ: ${calculateLevel(totalSupplyRef.current)}`, "info");

    miningIntervalRef.current = setInterval(async () => {
      if (isSubmittingRef.current) return;
      setHashRate(Math.floor(Math.random() * 500) + 1500);
      const chance = 0.02; // 2% mỗi giây
      if (Math.random() < chance) {
        isSubmittingRef.current = true; 
        addLog("🔍 Đang xác thực Block...", "info");
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
    if (!isDuplicateTab && !updateAvailable && !isSessionInvalid) addLog("💤 Meo đi ngủ...", "warning");
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
        console.error("API Error:", result);
        return addLog(`Lỗi: ${result.message}`, "error");
      }
      if (result.success) addLog(`🍯 +${BLOCK_REWARD} MCN về túi!`, "success");
      else if (result.code === "COOLDOWN") addLog(result.message, "warning");
      else addLog(result.message, "error");
    } catch (e) { addLog(`🔌 Lỗi kết nối: Server không phản hồi.`, "error"); }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTxStatus({type: 'info', msg: 'Đang gửi...'});
    try {
      const response = await fetch('/api/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: user.uid, receiverId: recipientId, amount: parseInt(sendAmount) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setTxStatus({type: 'success', msg: '✅ Thành công!'});
      setSendAmount('');
      addLog(`🎁 Đã tặng ${sendAmount} MCN.`, "info");
    } catch (error) { setTxStatus({type: 'error', msg: `❌ ${error.message}`}); }
  };

  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); } };
  const handleUpdateNow = () => { localStorage.setItem('meocoin_target_tab', 'updates'); window.location.reload(); };

  // --- RENDERING ---
  if (loading) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', color:'#d946ef', fontWeight:'bold'}}>Đang tải...</div>;
  if (!user) return (
    <div style={{height:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'2rem'}}>
      <div style={{fontSize:'4rem', fontWeight:'800', color:'#d946ef', display:'flex', gap:'1rem'}}><PawPrint size={64}/> MEONET</div>
      <button onClick={handleGoogleLogin} className="btn-main btn-start" style={{background:'white', color:'#475569'}}>Đăng nhập với Google</button>
    </div>
  );

  if (isDuplicateTab) return <div style={{height:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', color:'#ef4444'}}><AlertTriangle size={64}/><h1>Đã mở ở tab khác!</h1></div>;
  if (updateAvailable) return <div style={{height:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', background:'#d946ef', color:'white'}}><Sparkles size={64}/><h1>Cập Nhật Mới! ✨</h1><button onClick={handleUpdateNow} className="btn-main" style={{background:'white', color:'#d946ef', marginTop:'1rem'}}>Cập Nhật Ngay</button></div>;

  const supplyPercent = Math.min((totalSupply / MAX_SUPPLY) * 100, 100);

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo-area"><PawPrint size={32} color="#d946ef"/><span>MEONET</span></div>
        <nav className="nav-menu">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Zap/>} label="Nông Trại" />
          <NavBtn active={activeTab==='wallet'} onClick={()=>setActiveTab('wallet')} icon={<ShoppingBag/>} label="Ví Tiền" />
          <NavBtn active={activeTab==='explorer'} onClick={()=>setActiveTab('explorer')} icon={<Search/>} label="Sổ Cái" />
          <NavBtn active={activeTab==='account'} onClick={()=>setActiveTab('account')} icon={<UserCog/>} label="Tài Khoản" />
          <NavBtn active={activeTab==='updates'} onClick={()=>setActiveTab('updates')} icon={<History/>} label="Nhật Ký" />
        </nav>
        <div className="sidebar-footer">
          <div style={{display:'flex', alignItems:'center', gap:'0.8rem', marginBottom:'1rem'}}>
            <img src={user.photoURL} style={{width:'36px', borderRadius:'50%'}} />
            <span style={{fontWeight:'700'}}>{user.displayName}</span>
          </div>
          <button onClick={() => signOut(auth)} style={{width:'100%', padding:'0.8rem', background:'#fee2e2', color:'#ef4444', border:'none', borderRadius:'15px', fontWeight:'700', cursor:'pointer'}}>Đăng Xuất</button>
        </div>
      </div>

      <div className="main-content">
        <div className="top-bar">
           <StatBox label="Tài Sản" value={`${balance} MCN`} icon={<Hexagon size={24} color="#facc15" fill="#fcd34d"/>} />
           <StatBox label="Tốc Độ Ảo" value={`~${hashRate} H/s`} icon={<Activity size={24} color="#3b82f6"/>} />
           <div className="stat-box" style={{flex: 2, display:'block'}}>
             <div style={{display:'flex', justifyContent:'space-between', marginBottom:'0.5rem'}}>
               <span className="stat-label">Tiến Độ Đào</span>
               <span className="stat-label">Cấp {currentLevel}</span>
             </div>
             <div style={{width:'100%', height:'12px', background:'#f1f5f9', borderRadius:'6px', overflow:'hidden'}}>
               <div style={{width:`${supplyPercent}%`, height:'100%', background:'linear-gradient(90deg, #60a5fa, #a78bfa)', transition:'width 0.5s'}}></div>
             </div>
             <div style={{fontSize:'0.8rem', color:'#94a3b8', marginTop:'0.4rem', textAlign:'right', fontWeight:'600'}}>{totalSupply.toLocaleString()} / {MAX_SUPPLY.toLocaleString()}</div>
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
              <button onClick={mining ? stopMining : startMining} className={`btn-main ${mining ? "btn-stop" : "btn-start"}`}>
                {mining ? "DỪNG LẠI" : "BẮT ĐẦU ĐÀO"}
              </button>
              <div className="console-log">
                {logs.map((l,i) => <div key={i} className={`log-item log-${l.type}`}>[{l.time}] {l.msg}</div>)}
              </div>
            </div>
          )}
          
          {/* CÁC TAB KHÁC GIỮ NGUYÊN LOGIC CŨ NHƯNG DÙNG CSS MỚI */}
          {/* (Code Wallet, Explorer, Updates, Account ở đây sẽ tự kế thừa style mới từ index.css) */}
          {/* Meo chỉ cần copy phần render tab từ file V4.9.2 cũ bỏ vào đây là được, hoặc dùng bản rút gọn này để test UI trước */}
          
          {activeTab === 'account' && (
            <div className="miner-screen">
               <div className="card" style={{textAlign:'center'}}>
                 <img src={user.photoURL} style={{width:'100px', borderRadius:'50%', margin:'0 auto 1rem'}} />
                 <h2>{user.displayName}</h2>
                 <p style={{color:'#64748b'}}>{user.email}</p>
                 <div style={{marginTop:'2rem', display:'flex', gap:'1rem'}}>
                    <div style={{background:'#f1f5f9', padding:'1rem', borderRadius:'15px', flex:1}}>
                       <div style={{fontSize:'0.8rem', fontWeight:'bold', color:'#94a3b8'}}>ĐÃ ĐÀO</div>
                       <div style={{fontSize:'1.5rem', fontWeight:'800', color:'#d946ef'}}>{myBlocksMined}</div>
                    </div>
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
  <button onClick={onClick} className={`nav-btn ${active ? 'active' : ''}`}>{icon} <span>{label}</span></button>
);
const StatBox = ({ label, value, icon }) => (
  <div className="stat-box"><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div><div>{icon}</div></div>
);