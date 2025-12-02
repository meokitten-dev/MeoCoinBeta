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

// --- FIREBASE SETUP ---
// 👇 ĐIỀN CONFIG CỦA MEO VÀO ĐÂY NHA 👇
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
  
  // State chuyển tiền
  const [recipientId, setRecipientId] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [txStatus, setTxStatus] = useState(null);

  const miningIntervalRef = useRef(null);
  // 👇 Thêm cái chốt này để tránh đào trùng lặp khi đang gửi kết quả
  const isSubmittingRef = useRef(false);
  const totalSupplyRef = useRef(0);

  // --- 1. AUTH & INIT ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. DATA SYNC ---
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
  }, [user]);

  // --- 3. SIMULATED MINING (ĐÃ SỬA LỖI DỪNG ĐÀO) ---
  
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
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{time, msg: String(msg), type}, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) return addLog("Hết coin!", "error");
    if (mining) return; // Nếu đang đào thì thôi
    
    setMining(true);
    isSubmittingRef.current = false; // Đảm bảo chốt mở
    addLog(`🚀 Hệ thống giả lập kích hoạt! Level: ${calculateLevel(totalSupplyRef.current)}`, "info");

    miningIntervalRef.current = setInterval(async () => {
      // 👇 Nếu đang bận gửi kết quả thì bỏ qua lượt này (không dừng hẳn loop)
      if (isSubmittingRef.current) return;

      const fakeHashRate = Math.floor(Math.random() * 500) + 1500; 
      setHashRate(fakeHashRate);

      const level = calculateLevel(totalSupplyRef.current);
      const chance = getWinChance(level);
      const roll = Math.random(); 

      if (roll < chance) {
        // 👇 Đóng chốt lại, không cho đào tiếp khi chưa xong việc
        isSubmittingRef.current = true; 
        
        const fakeHash = "0000" + Math.random().toString(36).substring(7); 
        addLog(`✨ MAY MẮN! Tìm thấy Block: ${fakeHash}...`, "success");
        
        await submitBlockToServer();
        
        // 👇 Mở chốt sau 2 giây để đào tiếp
        setTimeout(() => {
           isSubmittingRef.current = false;
           // Không cần gọi startMining() lại nữa vì interval vẫn đang chạy ngầm
        }, 2000);
      } 
    }, 1000);
  };

  const stopMining = () => {
    setMining(false);
    if (miningIntervalRef.current) clearInterval(miningIntervalRef.current);
    isSubmittingRef.current = false; // Reset chốt
    setHashRate(0);
    addLog("🛑 Đã tắt máy đào.", "warning");
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
      if (!response.ok) throw new Error(result.error || "Lỗi Server");
      addLog(`💰 +${BLOCK_REWARD} MCN đã về ví!`, "success");
    } catch (e) { 
      console.error(e); 
      addLog(`❌ Lỗi mạng: ${e.message}`, "error"); 
    }
  };

  // --- 4. TÍNH NĂNG CHUYỂN TIỀN ---
  const handleTransfer = async (e) => {
    e.preventDefault();
    setTxStatus(null);
    if (!user) return;
    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) return setTxStatus({type: 'error', msg: 'Số tiền không hợp lệ'});
    if (amount > balance) return setTxStatus({type: 'error', msg: 'Số dư không đủ'});
    if (recipientId === user.uid) return setTxStatus({type: 'error', msg: 'Không thể tự chuyển'});

    setTxStatus({type: 'info', msg: 'Đang xử lý...'});
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
      setTxStatus({type: 'success', msg: '✅ Chuyển thành công!'});
      setSendAmount('');
      addLog(`💸 Đã chuyển ${amount} MCN.`, "info");
    } catch (error) { 
      setTxStatus({type: 'error', msg: `❌ Lỗi: ${error.message}`}); 
    }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (e) { alert(e.message); }
  };

  if (loading) return <div style={{height:'100vh', background:'#0a0a0a', color:'#22c55e', display:'flex', justifyContent:'center', alignItems:'center'}}>Loading System... <RefreshCw className="animate-spin"/></div>;

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
          <NavBtn active={activeTab==='explorer'} onClick={()=>setActiveTab('explorer')} icon={<Search size={18}/>} label="Sổ Cái" />
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
           <StatBox label="Hashrate (Ảo)" value={`~${hashRate} H/s`} icon={<Activity size={20} color={mining ? "#4ade80" : "#737373"}/>} />
           <div className="stat-box" style={{flex: 2, display:'block'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'0.2rem'}}>
                <span className="stat-label">Tổng Cung</span>
                <span className="stat-label">Cấp độ: {currentLevel}</span>
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
                  CPU Usage: &lt; 1% (Simulated)
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
                {logs.length === 0 && <div style={{color:'#525252'}}>Hệ thống sẵn sàng...</div>}
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
               <div className="card">
                 <h3 style={{marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.5rem'}}><Send size={18}/> Chuyển Khoản</h3>
                 <div className="input-group">
                   <label style={{display:'block', marginBottom:'0.5rem', fontSize:'0.9rem'}}>ID Người Nhận</label>
                   <input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="input-field" placeholder="Nhập ID ví..." />
                 </div>
                 <div className="input-group">
                   <label style={{display:'block', marginBottom:'0.5rem', fontSize:'0.9rem'}}>Số Tiền (MCN)</label>
                   <input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className="input-field" placeholder="0" />
                 </div>
                 <button onClick={handleTransfer} className="btn-send">GỬI</button>
                 {txStatus && <div style={{marginTop:'1rem', color: txStatus.type==='success'?'#4ade80':'#ef4444'}}>{txStatus.msg}</div>}
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
                    {blockchain.length === 0 && <div style={{color:'#737373'}}>Chưa có block mới</div>}
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