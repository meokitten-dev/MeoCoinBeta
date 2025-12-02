import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { 
  PawPrint, Wifi, Send, Activity, ShoppingBag, Copy, Users, RefreshCw, Search, Zap, Hexagon, LogIn, LogOut, Layers, History, ArrowUpRight, ArrowDownLeft, AlertTriangle, Sparkles, Rocket, UserCog, Mail, Gift, Library, Timer
} from 'lucide-react';

// 👇 IMPORT DỮ LIỆU ITEM
import { ITEMS } from './data/items';

const CURRENT_VERSION = "v5.0"; 
const BLOCK_REWARD = 10; 
const MAX_SUPPLY = 1000000; 

// 👇 CONFIG CỦA MEO 👇
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
const appId = 'meocoin-network-v5'; // 👈 LÊN V5

export default function MeoCoinNetwork() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [networkUsers, setNetworkUsers] = useState([]);
  const [blockchain, setBlockchain] = useState([]); 
  const [totalSupply, setTotalSupply] = useState(0); 
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0); 
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('miner');
  const [loading, setLoading] = useState(true);
  
  // State mới cho V5
  const [inventory, setInventory] = useState({});
  const [activeBuff, setActiveBuff] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0); // Thời gian buff còn lại

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
    onSnapshot(systemRef, (doc) => {
      if (doc.exists() && doc.data().latestVersion && doc.data().latestVersion !== CURRENT_VERSION) {
        setUpdateAvailable(true); stopMining(); 
      }
    });

    return () => { unsubscribe(); channel.close(); };
  }, []);

  // --- 2. SYNC & BUFF TIMER ---
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

    // Đồng hồ đếm ngược Buff
    const timer = setInterval(() => {
      if (activeBuff && activeBuff.expiresAt) {
        const remaining = activeBuff.expiresAt - Date.now();
        setTimeLeft(remaining > 0 ? remaining : 0);
      } else {
        setTimeLeft(0);
      }
    }, 1000);

    // ... (Các listener khác giữ nguyên) ...
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

    return () => { unsubUser(); unsubUsers(); unsubBlocks(); unsubStats(); clearInterval(timer); };
  }, [user, isDuplicateTab, updateAvailable, isSessionInvalid, isSessionReady, activeBuff]);

  // --- 3. ACTIONS ---
  const handleBuyItem = async (itemId) => {
    if (!user) return;
    const confirmBuy = window.confirm("Meo có chắc muốn mua không?");
    if (!confirmBuy) return;

    try {
      const res = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, itemId })
      });
      const data = await res.json();
      if (data.success) {
        alert("Mua thành công! 😺");
      } else {
        alert("Lỗi: " + data.message);
      }
    } catch (e) { alert("Lỗi mạng rồi Meo ơi!"); }
  };

  // ... (Logic Mining giữ nguyên nhưng cập nhật log) ...
  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) return;
    if (mining) return;
    setMining(true);
    isSubmittingRef.current = false;
    
    miningIntervalRef.current = setInterval(async () => {
      if (isSubmittingRef.current) return;
      // Nếu có buff tốc độ -> Hashrate ảo tăng gấp đôi
      const speedMultiplier = (activeBuff && activeBuff.type === 'speed' && timeLeft > 0) ? 2 : 1;
      setHashRate((Math.floor(Math.random() * 500) + 1500) * speedMultiplier);

      // Tăng tỷ lệ trúng nếu có buff tốc độ (giả lập việc đào nhanh hơn)
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, minerName: user.displayName, userEmail: user.email, userPhoto: user.photoURL })
      });
      const result = await response.json();
      if (!response.ok) {
         if (response.status !== 429) addLog(result.message || "Lỗi", "error");
      } else {
         // Vì giờ đào ra Item, nên không log +10 MCN nữa, mà để DB tự sync
         addLog("✨ Vừa tìm thấy gì đó! Kiểm tra kho nào!", "success");
      }
    } catch (e) { console.error(e); }
  };

  const addLog = (msg, type) => {
     const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });
     setLogs(prev => [{time, msg, type}, ...prev].slice(0, 20));
  };

  // ... (Phần Login/Transfer giữ nguyên) ...
  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); } };

  // --- HELPER FORMAT TIME ---
  const formatTime = (ms) => {
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / 1000 / 60) % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ... (Các màn hình Error/Loading giữ nguyên) ...
  if (loading) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}>Loading...</div>;
  if (!user) return <button onClick={handleGoogleLogin}>Login</button>; // Rút gọn cho đỡ dài

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo-area"><PawPrint size={32}/> MEONET V5</div>
        <nav className="nav-menu">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Zap/>} label="Nông Trại" />
          <NavBtn active={activeTab==='shop'} onClick={()=>setActiveTab('shop')} icon={<ShoppingBag/>} label="Cửa Hàng" />
          <NavBtn active={activeTab==='collection'} onClick={()=>setActiveTab('collection')} icon={<Library/>} label="Bảo Tàng" />
          <NavBtn active={activeTab==='account'} onClick={()=>setActiveTab('account')} icon={<UserCog/>} label="Tài Khoản" />
        </nav>
      </div>

      <div className="main-content">
        <div className="top-bar">
           <StatBox label="Tài Sản" value={`${balance} MCN`} icon={<Hexagon color="#facc15"/>} />
           {/* HIỂN THỊ BUFF */}
           <div className="stat-box" style={{borderColor: timeLeft > 0 ? '#d946ef' : 'white'}}>
              <div>
                <div className="stat-label">HIỆU ỨNG</div>
                <div className="stat-value" style={{fontSize:'1rem', color: timeLeft > 0 ? '#d946ef' : '#94a3b8'}}>
                  {timeLeft > 0 ? `${activeBuff?.name} (${formatTime(timeLeft)})` : 'Không có'}
                </div>
              </div>
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
              <div className="console-log">
                 {logs.map((l,i) => <div key={i} className={`log-item log-${l.type}`}>[{l.time}] {l.msg}</div>)}
              </div>
            </div>
          )}

          {/* 👇 TAB CỬA HÀNG MỚI 👇 */}
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
                    <button onClick={() => handleBuyItem('speed_potion')} style={{width:'100%', marginTop:'1rem', padding:'0.8rem', background:'#d946ef', color:'white', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:'bold'}}>
                      Mua (100 MCN)
                    </button>
                  </div>
                  <div style={{background:'#f0f9ff', padding:'1.5rem', borderRadius:'15px', border:'1px solid #bae6fd'}}>
                    <div style={{fontSize:'2rem'}}>🍀</div>
                    <h3 style={{margin:'0.5rem 0'}}>Kính Lúp May Mắn</h3>
                    <p style={{fontSize:'0.9rem', color:'#64748b'}}>Tăng tỷ lệ tìm thấy đồ Hiếm và Huyền Thoại.</p>
                    <div style={{marginTop:'1rem', fontWeight:'bold', color:'#0ea5e9'}}>10 phút</div>
                    <button onClick={() => handleBuyItem('lucky_charm')} style={{width:'100%', marginTop:'1rem', padding:'0.8rem', background:'#0ea5e9', color:'white', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:'bold'}}>
                      Mua (500 MCN)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 👇 TAB BẢO TÀNG (COLLECTION) MỚI 👇 */}
          {activeTab === 'collection' && (
            <div className="card">
              <h2 style={{marginBottom:'1.5rem', display:'flex', gap:'0.5rem'}}><Library/> Bảo Tàng Khảo Cổ</h2>
              <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap:'1rem'}}>
                {Object.values(ITEMS).map(item => {
                  const count = inventory[item.id] || 0;
                  const isOwned = count > 0;
                  return (
                    <div key={item.id} style={{
                      opacity: isOwned ? 1 : 0.4, 
                      filter: isOwned ? 'none' : 'grayscale(100%)',
                      background: isOwned ? `${item.color}20` : '#f1f5f9',
                      border: `2px solid ${isOwned ? item.color : '#e2e8f0'}`,
                      borderRadius: '15px', padding: '1rem', textAlign: 'center', position:'relative'
                    }}>
                      <div style={{fontSize:'2rem'}}>{item.icon}</div>
                      <div style={{fontSize:'0.7rem', fontWeight:'bold', marginTop:'0.5rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{item.name}</div>
                      {isOwned && <div style={{position:'absolute', top:'-5px', right:'-5px', background:item.color, color:'white', borderRadius:'50%', width:'20px', height:'20px', fontSize:'0.7rem', display:'flex', alignItems:'center', justifyContent:'center'}}>{count}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {/* ... (Tab Account giữ nguyên) ... */}
           {activeTab === 'account' && (
            <div className="wallet-screen">
              <div className="card" style={{display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:'1rem'}}>
                <img src={user.photoURL} style={{width:'100px', borderRadius:'50%'}} />
                <h2>{user.displayName}</h2>
                <button onClick={() => signOut(auth)} style={{padding:'0.8rem 2rem', background:'#fee2e2', color:'#ef4444', border:'none', borderRadius:'10px', fontWeight:'bold', cursor:'pointer'}}>Đăng Xuất</button>
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