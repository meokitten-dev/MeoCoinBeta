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
  Cpu, Wifi, Send, Activity, Database, Lock, Copy, Users, RefreshCw, Search, Zap, ShieldCheck, LogIn, LogOut, Link, Layers
} from 'lucide-react';

// --- CẤU HÌNH ---
const BLOCK_REWARD = 10; 
const MAX_SUPPLY = 1000000; 

// --- FIREBASE SETUP (Đã điền sẵn cho Meo) ---
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
// 👇 RESET SANG V4 👇
const appId = 'meocoin-network-v4'; 

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function MeoCoinNetwork() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [networkUsers, setNetworkUsers] = useState([]);
  const [blockchain, setBlockchain] = useState([]); 
  const [totalSupply, setTotalSupply] = useState(0); 
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0);
  const [logs, setLogs] = useState([]);
  const [currentDifficulty, setCurrentDifficulty] = useState("0000"); 
  const [activeTab, setActiveTab] = useState('miner');
  const [loading, setLoading] = useState(true);
  
  const miningRef = useRef(false);
  const nonceRef = useRef(0);
  const latestBlockRef = useRef({ hash: "genesis-block", index: 0 });
  const totalSupplyRef = useRef(0);

  // --- LOGIC AUTH ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ghi chú: Vì database đã bị khóa Write, ta không thể tự tạo user ở đây nữa.
        // Server sẽ tự tạo user khi đào được block đầu tiên.
        addLog(`Chào mừng ${currentUser.displayName}! Hãy bắt đầu đào để kích hoạt ví.`, "info");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    onSnapshot(userRef, (doc) => { if (doc.exists()) setBalance(doc.data().balance || 0); });

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
      if (b.length > 0) latestBlockRef.current = { hash: b[0].hash, index: b[0].index };
    });

    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
    onSnapshot(statsRef, (doc) => {
      if (doc.exists()) {
        const supply = doc.data().totalSupply || 0;
        setTotalSupply(supply);
        totalSupplyRef.current = supply;
        setCurrentDifficulty(calculateDifficulty(supply));
      }
    });
  }, [user]);

  // --- ĐỘ KHÓ 6 GIAI ĐOẠN (KHỚP SERVER) ---
  const calculateDifficulty = (currentSupply) => {
    if (currentSupply < 50000) return "0000"; 
    if (currentSupply < 200000) return "00000";
    if (currentSupply < 400000) return "00000";
    if (currentSupply < 600000) return "000000";
    if (currentSupply < 800000) return "000000";
    return "0000000";
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{time, msg: String(msg), type}, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) return addLog("Hết coin!", "error");
    if (mining) return;
    setMining(true);
    miningRef.current = true;
    mineLoop();
    addLog(`🚀 Bắt đầu! Level: ${calculateDifficulty(totalSupplyRef.current).length}`, "info");
  };

  const stopMining = () => {
    setMining(false);
    miningRef.current = false;
    setHashRate(0);
    addLog("🛑 Đã dừng.", "warning");
  };

  const mineLoop = async () => {
    let hashes = 0;
    const startTime = Date.now();
    while (miningRef.current) {
      nonceRef.current++;
      const prevHash = latestBlockRef.current.hash;
      const data = `${prevHash}${user.uid}${nonceRef.current}`;
      const hash = await sha256(data);
      hashes++;

      const currentDiff = calculateDifficulty(totalSupplyRef.current);
      
      if (hash.startsWith(currentDiff)) {
        addLog(`✨ TÌM THẤY: ${hash.substring(0, 8)}...`, "success");
        await submitBlockToServer(hash, nonceRef.current);
        nonceRef.current += Math.floor(Math.random() * 100000);
        await new Promise(r => setTimeout(r, 1000)); 
      }

      if (Date.now() - startTime > 1000) {
        if (miningRef.current) {
          setHashRate(hashes);
          await new Promise(r => setTimeout(r, 0)); 
          mineLoop(); 
          return;
        }
      }
    }
  };

  const submitBlockToServer = async (validHash, validNonce) => {
    if (!user) return;
    try {
      const response = await fetch('/api/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          nonce: validNonce,
          clientHash: validHash,
          minerName: user.displayName,
          userEmail: user.email, // Gửi thêm email
          userPhoto: user.photoURL // Gửi thêm ảnh
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Lỗi Server");
      addLog(`💰 +${BLOCK_REWARD} MCN xác nhận!`, "success");
    } catch (e) { 
      console.error(e); 
      addLog(`❌ Bị từ chối: ${e.message}`, "error"); 
    }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); }
  };

  if (loading) return <div style={{height:'100vh', background:'#0a0a0a', color:'#22c55e', display:'flex', justifyContent:'center', alignItems:'center'}}>Loading V4... <RefreshCw className="animate-spin"/></div>;

  if (!user) return (
    <div style={{height:'100vh', background:'#0a0a0a', color:'#22c55e', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'2rem'}}>
      <div style={{fontSize:'3rem', fontWeight:'bold', display:'flex', alignItems:'center', gap:'1rem'}}>
        <Link size={48} className="animate-pulse"/> MEONET V4
      </div>
      <button onClick={handleGoogleLogin} style={{background:'#fff', color:'#000', padding:'1rem 2rem', borderRadius:'2rem', fontWeight:'bold', display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer'}}>
        <LogIn size={20}/> Login with Google
      </button>
    </div>
  );

  const supplyPercent = Math.min((totalSupply / MAX_SUPPLY) * 100, 100);

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo-area">
          <Link className="animate-pulse" size={24}/>
          <span>MEONET</span>
        </div>
        <nav className="nav-menu">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Cpu size={18}/>} label="Trạm Đào" />
          <NavBtn active={activeTab==='wallet'} onClick={()=>setActiveTab('wallet')} icon={<Lock size={18}/>} label="Ví Tiền" />
          <NavBtn active={activeTab==='explorer'} onClick={()=>setActiveTab('explorer')} icon={<Search size={18}/>} label="Blockchain" />
        </nav>
        <div className="sidebar-footer">
          <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem'}}>
            <img src={user.photoURL} style={{width:'24px', borderRadius:'50%'}} />
            <span style={{fontSize:'0.8rem'}}>{user.displayName}</span>
          </div>
          <button onClick={() => signOut(auth)} style={{background:'#262626', color:'#fff', border:'none', padding:'0.5rem', borderRadius:'0.3rem', cursor:'pointer', fontSize:'0.7rem', width: '100%', display:'flex', justifyContent:'center', gap:'0.5rem'}}>
            <LogOut size={12}/> Đăng Xuất
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="top-bar">
           <StatBox label="Số Dư" value={`${balance} MCN`} icon={<Zap size={20} color="#facc15"/>} />
           <StatBox label="Hashrate" value={`${hashRate} H/s`} icon={<Activity size={20} color={mining ? "#4ade80" : "#737373"}/>} />
           <div className="stat-box" style={{flex: 2, display:'block'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'0.2rem'}}>
                <span className="stat-label">Tổng Cung (Supply)</span>
                <span className="stat-label">Level: {currentDifficulty.length} ({currentDifficulty})</span>
              </div>
              <div style={{width:'100%', height:'8px', background:'#262626', borderRadius:'4px', overflow:'hidden'}}>
                <div style={{width:`${supplyPercent}%`, height:'100%', background:'#3b82f6', transition:'width 0.5s'}}></div>
              </div>
              <div style={{fontSize:'0.7rem', color:'#737373', marginTop:'0.2rem', textAlign:'right'}}>
                {totalSupply.toLocaleString()} / {MAX_SUPPLY.toLocaleString()} MCN
              </div>
           </div>
        </div>

        <div className="content-area">
          {activeTab === 'miner' && (
            <div className="miner-screen">
              <div className={`miner-circle ${mining ? 'active' : ''}`}>
                <Cpu size={64} color={mining ? "#4ade80" : "#525252"} className={mining ? "animate-bounce" : ""} />
                <div style={{marginTop:'1rem', fontWeight:'bold', color: mining ? '#4ade80' : '#525252'}}>
                  {mining ? 'MINING...' : 'IDLE'}
                </div>
                <div style={{fontSize:'0.7rem', color:'#737373', marginTop:'0.5rem'}}>
                  Target: {currentDifficulty}...
                </div>
              </div>
              <div style={{display:'flex', gap:'1rem'}}>
                {!mining ? (
                  <button onClick={startMining} className="btn-start"><Zap size={20}/> KHỞI ĐỘNG</button>
                ) : (
                  <button onClick={stopMining} className="btn-stop"><ShieldCheck size={20}/> DỪNG LẠI</button>
                )}
              </div>
              <div className="console-log">
                {logs.length === 0 && <div style={{color:'#525252'}}>System ready... Difficulty: {currentDifficulty}</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`log-item ${log.type === 'success' ? 'log-success' : log.type === 'error' ? 'log-error' : ''}`}>
                    {`> [${log.time}] ${log.msg}`}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'wallet' && (
             <div className="wallet-screen">
               <div className="card">
                 <div style={{fontSize:'0.8rem', color:'#737373', marginBottom:'0.5rem'}}>VÍ CỦA BẠN</div>
                 <div style={{display:'flex', gap:'0.5rem'}}>
                   <input readOnly value={user?.uid} className="input-field" />
                   <button onClick={() => navigator.clipboard.writeText(user.uid)} style={{background:'#262626', border:'1px solid #14532d', color:'#fff', padding:'0.5rem', borderRadius:'0.5rem', cursor:'pointer'}}><Copy/></button>
                 </div>
               </div>
               <div className="card" style={{padding:'2rem', textAlign:'center', color:'#737373'}}>
                 Tạm khóa chuyển tiền để bảo trì.
               </div>
             </div>
          )}

          {activeTab === 'explorer' && (
            <div className="explorer-grid">
              <div className="card" style={{gridColumn: '1 / -1'}}>
                 <div style={{marginBottom:'1rem', fontWeight:'bold', color:'#3b82f6', display:'flex', alignItems:'center', gap:'0.5rem'}}><Layers size={18}/> Blockchain</div>
                 <div style={{display:'flex', gap:'1rem', overflowX:'auto', paddingBottom:'1rem'}}>
                    {blockchain.map((block) => (
                      <div key={block.hash} style={{minWidth:'200px', background:'#171717', border:'1px solid #14532d', padding:'1rem', borderRadius:'0.5rem', position:'relative'}}>
                         <div style={{fontSize:'0.7rem', color:'#737373', marginBottom:'0.5rem'}}>#{block.index}</div>
                         <div style={{fontSize:'0.8rem', color:'#facc15', fontWeight:'bold', marginBottom:'0.5rem'}}>+{block.reward} MCN</div>
                         <div style={{fontSize:'0.6rem', color:'#4ade80'}}>Hash: {block.hash.slice(0,10)}...</div>
                         <div style={{fontSize:'0.6rem', color:'#fff', marginTop:'0.5rem'}}>{block.minerName}</div>
                      </div>
                    ))}
                    {blockchain.length === 0 && <div style={{color:'#737373'}}>Chưa có block mới (V4 Reset)</div>}
                 </div>
              </div>
              <div className="card table-container">
                <div style={{marginBottom:'1rem', fontWeight:'bold', color:'#facc15', display:'flex', alignItems:'center', gap:'0.5rem'}}><Users size={18}/> Top Miners</div>
                <table>
                  <thead><tr><th>Rank</th><th>Miner</th><th>Blocks</th><th>Balance</th></tr></thead>
                  <tbody>
                    {networkUsers.map((u, idx) => (
                      <tr key={u.address} style={{backgroundColor: u.address === user?.uid ? 'rgba(20,83,45,0.2)' : 'transparent'}}>
                        <td>#{idx + 1}</td>
                        <td>{u.displayName}</td>
                        <td>{u.blocksMined}</td>
                        <td style={{color:'#facc15'}}>{u.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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