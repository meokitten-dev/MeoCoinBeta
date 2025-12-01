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

// --- CẤU HÌNH GAME ---
const BLOCK_REWARD = 50; 
const MAX_SUPPLY = 1000000; // Giới hạn 1 triệu coin

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
// 👇 ĐỔI SANG V3 ĐỂ RESET TOÀN BỘ SERVER NHƯ MỚI 👇
const appId = 'meocoin-network-v3'; 

// Hàm băm SHA-256
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function MeoCoinNetwork() {
  // User State
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  
  // Network State
  const [networkUsers, setNetworkUsers] = useState([]);
  const [blockchain, setBlockchain] = useState([]); 
  const [totalSupply, setTotalSupply] = useState(0); 
  
  // Mining State
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0);
  const [logs, setLogs] = useState([]);
  const [currentDifficulty, setCurrentDifficulty] = useState("0"); // Hiển thị độ khó
  
  // UI State
  const [activeTab, setActiveTab] = useState('miner');
  const [loading, setLoading] = useState(true);
  const [recipientId, setRecipientId] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [txStatus, setTxStatus] = useState(null);

  // Refs
  const miningRef = useRef(false);
  const nonceRef = useRef(0);
  const latestBlockRef = useRef({ hash: "genesis-block", index: 0 });
  const totalSupplyRef = useRef(0); // Dùng ref để đọc supply mới nhất trong vòng lặp

  // --- 1. AUTH & INIT ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            address: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            balance: 0,
            blocksMined: 0,
            joinedAt: serverTimestamp(),
          });
          addLog(`Chào mừng ${currentUser.displayName}!`, "success");
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. REAL-TIME DATA ---
  useEffect(() => {
    if (!user) return;

    // Nghe số dư user
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const unsubBalance = onSnapshot(userRef, (doc) => {
      if (doc.exists()) setBalance(doc.data().balance || 0);
    });

    // Nghe Top Miners
    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersCol, (snapshot) => {
      const users = [];
      snapshot.forEach(doc => users.push(doc.data()));
      users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      setNetworkUsers(users);
    });

    // Nghe Blockchain 
    const blocksQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'blocks'),
      orderBy('index', 'desc'),
      limit(10)
    );
    const unsubBlocks = onSnapshot(blocksQuery, (snapshot) => {
      const blocks = [];
      snapshot.forEach(doc => blocks.push(doc.data()));
      setBlockchain(blocks);
      if (blocks.length > 0) {
        latestBlockRef.current = { hash: blocks[0].hash, index: blocks[0].index };
      }
    });

    // Nghe Tổng Cung & Tính Độ Khó
    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
    const unsubStats = onSnapshot(statsRef, (doc) => {
      if (doc.exists()) {
        const supply = doc.data().totalSupply || 0;
        setTotalSupply(supply);
        totalSupplyRef.current = supply; // Cập nhật ref
        
        // CẬP NHẬT UI ĐỘ KHÓ
        const diff = calculateDifficulty(supply);
        setCurrentDifficulty(diff);
      } else {
        setDoc(statsRef, { totalSupply: 0 }, { merge: true });
      }
    });

    return () => { unsubBalance(); unsubUsers(); unsubBlocks(); unsubStats(); };
  }, [user]);

  // --- 3. MINING LOGIC (DYNAMIC DIFFICULTY) ---
  
  // Hàm tính độ khó dựa trên tổng cung
  const calculateDifficulty = (currentSupply) => {
    // Giai đoạn 1: < 100k coin -> Dễ (1 số 0) - Để kích thích mọi người chơi
    if (currentSupply < 100000) return "0"; 
    // Giai đoạn 2: < 400k coin -> Vừa (2 số 0)
    if (currentSupply < 400000) return "00";
    // Giai đoạn 3: < 800k coin -> Khó (3 số 0) - Bắt đầu tốn điện
    if (currentSupply < 800000) return "000";
    // Giai đoạn 4: Về đích -> Cực khó (4 số 0) - Đào cả ngày mới ra
    return "0000";
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{time, msg: String(msg), type}, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (totalSupplyRef.current >= MAX_SUPPLY) {
      addLog("⚠️ Đã hết coin để đào! (Max Supply Reached)", "error");
      return;
    }
    if (mining) return;
    setMining(true);
    miningRef.current = true;
    mineLoop();
    addLog(`🚀 Bắt đầu! Độ khó hiện tại: Level ${calculateDifficulty(totalSupplyRef.current).length}`, "info");
  };

  const stopMining = () => {
    setMining(false);
    miningRef.current = false;
    setHashRate(0);
    addLog("🛑 Đã dừng máy đào.", "warning");
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

      // Lấy độ khó động (Real-time difficulty)
      const currentDiff = calculateDifficulty(totalSupplyRef.current);

      if (hash.startsWith(currentDiff)) {
        addLog(`✨ TÌM THẤY BLOCK! Hash: ${hash.substring(0, 8)}...`, "success");
        await submitBlock(hash, prevHash, nonceRef.current, currentDiff);
        
        nonceRef.current += Math.floor(Math.random() * 10000);
        await new Promise(r => setTimeout(r, 2000)); 
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

  const submitBlock = async (validHash, prevHash, validNonce, requiredDiff) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
      const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'global');
      const newBlockId = `block_${Date.now()}`;
      const blockRef = doc(db, 'artifacts', appId, 'public', 'data', 'blocks', newBlockId);

      await runTransaction(db, async (transaction) => {
        // Kiểm tra lại trên server (giả lập)
        const statsDoc = await transaction.get(statsRef);
        const currentSupply = statsDoc.exists() ? (statsDoc.data().totalSupply || 0) : 0;
        
        // Kiểm tra lại độ khó server-side (Logic khớp với client)
        // Lưu ý: Ở môi trường thật cần check kỹ hash, nhưng ở đây mình check supply thôi
        if (currentSupply + BLOCK_REWARD > MAX_SUPPLY) {
          throw "Đã đạt giới hạn tổng cung!";
        }

        const userDoc = await transaction.get(userRef);
        const newBal = (userDoc.data().balance || 0) + BLOCK_REWARD;
        const newBlocksMined = (userDoc.data().blocksMined || 0) + 1;

        transaction.update(userRef, { balance: newBal, blocksMined: newBlocksMined });
        transaction.set(statsRef, { totalSupply: currentSupply + BLOCK_REWARD }, { merge: true });

        const newIndex = latestBlockRef.current.index + 1;
        transaction.set(blockRef, {
          index: newIndex,
          hash: validHash,
          prevHash: prevHash,
          miner: user.uid,
          minerName: user.displayName,
          nonce: validNonce,
          difficulty: requiredDiff,
          timestamp: serverTimestamp(),
          reward: BLOCK_REWARD
        });
      });
      addLog(`💰 +${BLOCK_REWARD} MCN | Supply: ${totalSupplyRef.current}/${MAX_SUPPLY}`, "success");
    } catch (e) { 
      console.error(e); 
      addLog(`Lỗi: ${typeof e === 'string' ? e : 'Block bị từ chối'}`, "error"); 
    }
  };

  // --- 4. OTHER FEATURES ---
  const handleTransfer = async (e) => {
    e.preventDefault();
    setTxStatus(null);
    if (!user) return;
    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) return setTxStatus({type: 'error', msg: 'Số tiền sai'});
    if (amount > balance) return setTxStatus({type: 'error', msg: 'Thiếu tiền'});

    setTxStatus({type: 'info', msg: 'Đang xử lý...'});
    try {
      const senderRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
      const receiverRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', recipientId);
      
      await runTransaction(db, async (transaction) => {
        const senderDoc = await transaction.get(senderRef);
        const receiverDoc = await transaction.get(receiverRef);
        if (!receiverDoc.exists()) throw "Sai địa chỉ ví";
        const senderBal = senderDoc.data().balance;
        if (senderBal < amount) throw "Thiếu tiền";
        
        transaction.update(senderRef, { balance: senderBal - amount });
        transaction.update(receiverRef, { balance: (receiverDoc.data().balance || 0) + amount });
      });
      setTxStatus({type: 'success', msg: 'Đã chuyển!'});
      setSendAmount('');
    } catch (error) { setTxStatus({type: 'error', msg: 'Lỗi giao dịch'}); }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (e) { alert(e.message); }
  };

  // --- RENDER UI ---
  if (loading) return <div style={{height:'100vh', background:'#0a0a0a', color:'#22c55e', display:'flex', justifyContent:'center', alignItems:'center'}}>Đang tải Blockchain... <RefreshCw className="animate-spin"/></div>;

  if (!user) {
    return (
      <div style={{height:'100vh', background:'#0a0a0a', color:'#22c55e', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'2rem'}}>
        <div style={{fontSize:'3rem', fontWeight:'bold', display:'flex', alignItems:'center', gap:'1rem'}}>
          <Link size={48} className="animate-pulse"/> MEONET V3
        </div>
        <button onClick={handleGoogleLogin} style={{background:'#fff', color:'#000', padding:'1rem 2rem', borderRadius:'2rem', fontWeight:'bold', display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer'}}>
          <LogIn size={20}/> Login with Google
        </button>
      </div>
    );
  }

  const supplyPercent = Math.min((totalSupply / MAX_SUPPLY) * 100, 100);

  return (
    <div className="app-container">
      {/* SIDEBAR */}
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

      {/* MAIN CONTENT */}
      <div className="main-content">
        <div className="top-bar">
           <StatBox label="Số Dư" value={`${balance} MCN`} icon={<Zap size={20} color="#facc15"/>} />
           <StatBox label="Hashrate" value={`${hashRate} H/s`} icon={<Activity size={20} color={mining ? "#4ade80" : "#737373"}/>} />
           
           {/* Thanh hiển thị Supply */}
           <div className="stat-box" style={{flex: 2, display:'block'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'0.2rem'}}>
                <span className="stat-label">Tổng Cung (Supply)</span>
                <span className="stat-label">Độ khó: Level {currentDifficulty.length}</span>
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
          {/* MINER TAB */}
          {activeTab === 'miner' && (
            <div className="miner-screen">
              <div className={`miner-circle ${mining ? 'active' : ''}`}>
                <Cpu size={64} color={mining ? "#4ade80" : "#525252"} className={mining ? "animate-bounce" : ""} />
                <div style={{marginTop:'1rem', fontWeight:'bold', color: mining ? '#4ade80' : '#525252'}}>
                  {mining ? 'MINING...' : 'IDLE'}
                </div>
                {/* Hiển thị độ khó trực quan */}
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
                {logs.length === 0 && <div style={{color:'#525252'}}>Waiting for command...</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`log-item ${log.type === 'success' ? 'log-success' : log.type === 'error' ? 'log-error' : ''}`}>
                    {`> [${log.time}] ${log.msg}`}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WALLET TAB */}
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
                  <input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="input-field" />
                </div>
                <div className="input-group">
                  <label style={{display:'block', marginBottom:'0.5rem', fontSize:'0.9rem'}}>Số Tiền</label>
                  <input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className="input-field" />
                </div>
                <button onClick={handleTransfer} className="btn-send">GỬI</button>
                {txStatus && <div style={{marginTop:'1rem', color: txStatus.type==='success'?'#4ade80':'#ef4444'}}>{txStatus.msg}</div>}
              </div>
            </div>
          )}

          {/* EXPLORER TAB */}
          {activeTab === 'explorer' && (
            <div className="explorer-grid">
              <div className="card" style={{gridColumn: '1 / -1'}}>
                 <div style={{marginBottom:'1rem', fontWeight:'bold', color:'#3b82f6', display:'flex', alignItems:'center', gap:'0.5rem'}}>
                   <Layers size={18}/> Chuỗi Khối (Mini Blockchain)
                 </div>
                 <div style={{display:'flex', gap:'1rem', overflowX:'auto', paddingBottom:'1rem'}}>
                    {blockchain.map((block) => (
                      <div key={block.hash} style={{minWidth:'200px', background:'#171717', border:'1px solid #14532d', padding:'1rem', borderRadius:'0.5rem', position:'relative'}}>
                         <div style={{fontSize:'0.7rem', color:'#737373', marginBottom:'0.5rem'}}>Block #{block.index}</div>
                         <div style={{fontSize:'0.8rem', color:'#facc15', fontWeight:'bold', marginBottom:'0.5rem'}}>+{block.reward} MCN</div>
                         <div style={{fontSize:'0.6rem', color:'#4ade80', wordBreak:'break-all'}}>Hash: {block.hash.slice(0,10)}...</div>
                         <div style={{fontSize:'0.6rem', color:'#737373', wordBreak:'break-all'}}>Prev: {block.prevHash.slice(0,10)}...</div>
                         <div style={{fontSize:'0.6rem', color:'#fff', marginTop:'0.5rem'}}>{block.minerName}</div>
                         <div style={{position:'absolute', right:'-1rem', top:'50%', color:'#14532d'}}>→</div>
                      </div>
                    ))}
                    {blockchain.length === 0 && <div style={{color:'#737373'}}>Chưa có block nào được đào...</div>}
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
                        <td>{u.displayName || u.address.slice(0,8)}</td>
                        <td>{u.blocksMined || 0}</td>
                        <td style={{color:'#facc15'}}>{u.balance || 0}</td>
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