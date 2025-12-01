import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  runTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Cpu, 
  Wifi, 
  Send, 
  Activity, 
  Database, 
  Lock, 
  Copy, 
  Users, 
  Terminal,
  RefreshCw,
  Search,
  Zap,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

// --- CẤU HÌNH GAME ---
const DIFFICULTY = "00"; // Hash bắt đầu bằng 2 số 0
const BLOCK_REWARD = 50; 

// --- FIREBASE SETUP ---
// LƯU Ý: Khi chạy trên máy thật, Meo nhớ thay đoạn này bằng config của Meo nhé!
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDrREROquKxOUFf8GfkkMeaALE929MJDRY",
  authDomain: "meo-coin-net.firebaseapp.com",
  projectId: "meo-coin-net",
  storageBucket: "meo-coin-net.firebasestorage.app",
  messagingSenderId: "980010880222",
  appId: "1:980010880222:web:3b195b6791e95d52f9464f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// App ID mặc định nếu chưa có
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- HÀM HỖ TRỢ (HASHING) ---
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function MeoCoinNetwork() {
  // State
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [networkUsers, setNetworkUsers] = useState([]);
  const [recentTxs, setRecentTxs] = useState([]);
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('miner');
  const [loading, setLoading] = useState(true);
  
  // Wallet Form State
  const [recipientId, setRecipientId] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [txStatus, setTxStatus] = useState(null);

  // Refs
  const miningRef = useRef(false);
  const nonceRef = useRef(0);
  const lastHashRef = useRef("genesis-block");

  // --- 1. KHỞI TẠO & AUTH ---
  useEffect(() => {
    let unsubscribeAuth;
    
    const initApp = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }

        unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
          setUser(currentUser);
          if (currentUser) {
            // FIX: Thêm 'users' vào đường dẫn để đảm bảo số segment chẵn (6 segments)
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
              await setDoc(userRef, {
                address: currentUser.uid,
                balance: 0,
                blocksMined: 0,
                joinedAt: serverTimestamp(),
                lastSeen: serverTimestamp()
              });
            }
            setLoading(false);
            addLog("Đã kết nối vào MeoNet an toàn.", "info");
          }
        });
      } catch (err) {
        console.error("Auth Error:", err);
        setLoading(false);
      }
    };

    initApp();
    return () => unsubscribeAuth && unsubscribeAuth();
  }, []);

  // --- 2. ĐỒNG BỘ DỮ LIỆU (REAL-TIME) ---
  useEffect(() => {
    if (!user) return;

    // 2.1 Nghe số dư của mình (FIX path: .../data/users/UID)
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const unsubBalance = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setBalance(data.balance || 0);
      }
    }, (err) => console.log("Sync Balance Error", err));

    // 2.2 Nghe danh sách người dùng (FIX path: .../data/users)
    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersCol, (snapshot) => {
      const users = [];
      snapshot.forEach(doc => {
        users.push(doc.data());
      });
      // Sort an toàn
      users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      setNetworkUsers(users);
    }, (err) => console.log("Sync Users Error", err));

    // 2.3 Nghe danh sách giao dịch (FIX path: .../data/transactions)
    const txCol = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const unsubTx = onSnapshot(txCol, (snapshot) => {
      const txs = [];
      snapshot.forEach(doc => {
        txs.push(doc.data());
      });
      // Sort an toàn theo timestamp
      txs.sort((a, b) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tB - tA;
      });
      setRecentTxs(txs.slice(0, 15));
    }, (err) => console.log("Sync Tx Error", err));

    return () => {
      unsubBalance();
      unsubUsers();
      unsubTx();
    };
  }, [user]);

  // --- 3. LOGIC ĐÀO COIN (MINING) ---
  const addLog = (msg, type = 'info') => {
    // Đảm bảo msg luôn là string để tránh lỗi render object
    const safeMsg = typeof msg === 'string' ? msg : 'System message';
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${safeMsg}`, ...prev].slice(0, 20));
  };

  const startMining = () => {
    if (mining) return;
    setMining(true);
    miningRef.current = true;
    mineLoop();
    addLog("Bắt đầu giải mã thuật toán...", "info");
  };

  const stopMining = () => {
    setMining(false);
    miningRef.current = false;
    setHashRate(0);
    addLog("Đã ngắt kết nối máy đào.", "warning");
  };

  const mineLoop = async () => {
    let hashes = 0;
    const startTime = Date.now();
    
    while (miningRef.current) {
      nonceRef.current++;
      const data = `${user.uid}${lastHashRef.current}${nonceRef.current}`;
      const hash = await sha256(data);
      hashes++;

      if (hash.startsWith(DIFFICULTY)) {
        addLog(`✨ TÌM THẤY BLOCK! Hash: ${hash.substring(0, 10)}...`, "success");
        await submitBlock(hash);
        nonceRef.current += Math.floor(Math.random() * 1000);
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

  const submitBlock = async (validHash) => {
    if (!user) return;
    try {
      // FIX Paths
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
      const txRef = doc(db, 'artifacts', appId, 'public', 'data', 'transactions', `tx_${Date.now()}_${user.uid}`);

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw "User missing";

        const newBal = (userDoc.data().balance || 0) + BLOCK_REWARD;
        const newBlocks = (userDoc.data().blocksMined || 0) + 1;

        transaction.update(userRef, { balance: newBal, blocksMined: newBlocks });
        transaction.set(txRef, {
          type: 'REWARD',
          from: 'NETWORK',
          to: user.uid,
          amount: BLOCK_REWARD,
          hash: validHash,
          timestamp: serverTimestamp()
        });
      });
      addLog(`💰 Nhận thưởng ${BLOCK_REWARD} MCN!`, "success");
    } catch (e) {
      console.error(e);
      addLog("Lỗi gửi Block lên mạng lưới.", "error");
    }
  };

  // --- 4. GIAO DỊCH (TRANSACTION) ---
  const handleTransfer = async (e) => {
    e.preventDefault();
    setTxStatus(null);
    if (!user) return;

    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) return setTxStatus({type: 'error', msg: 'Số tiền không hợp lệ'});
    if (amount > balance) return setTxStatus({type: 'error', msg: 'Số dư không đủ'});
    if (recipientId === user.uid) return setTxStatus({type: 'error', msg: 'Không thể tự chuyển cho mình'});

    setTxStatus({type: 'info', msg: 'Đang xác thực trên Blockchain...'});

    try {
      // FIX Paths
      const senderRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
      const receiverRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', recipientId);
      const txRef = doc(db, 'artifacts', appId, 'public', 'data', 'transactions', `tx_${Date.now()}_transfer`);

      await runTransaction(db, async (transaction) => {
        const senderDoc = await transaction.get(senderRef);
        const receiverDoc = await transaction.get(receiverRef);

        if (!receiverDoc.exists()) throw "Ví người nhận không tồn tại!";
        
        const senderBal = senderDoc.data().balance;
        if (senderBal < amount) throw "Số dư không đủ!";

        transaction.update(senderRef, { balance: senderBal - amount });
        transaction.update(receiverRef, { balance: (receiverDoc.data().balance || 0) + amount });
        transaction.set(txRef, {
          type: 'TRANSFER',
          from: user.uid,
          to: recipientId,
          amount: amount,
          timestamp: serverTimestamp()
        });
      });

      setTxStatus({type: 'success', msg: 'Giao dịch thành công!'});
      setSendAmount('');
      addLog(`Đã chuyển ${amount} MCN tới ví khác.`, "info");
    } catch (error) {
      const errorMsg = typeof error === 'string' ? error : 'Lỗi mạng lưới';
      setTxStatus({type: 'error', msg: errorMsg});
    }
  };

  const copyID = () => {
    if (user) {
        const el = document.createElement('textarea');
        el.value = user.uid;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        addLog("Đã sao chép ID ví!", "info");
    }
  };

  // --- UI COMPONENTS ---
  if (loading) return (
    <div className="min-h-screen bg-black text-green-500 flex items-center justify-center font-mono">
      <div className="animate-spin mr-2"><RefreshCw/></div> Đang kết nối vệ tinh...
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-green-500 font-mono flex flex-col md:flex-row overflow-hidden select-none">
      
      {/* SIDEBAR */}
      <div className="w-full md:w-64 bg-neutral-900 border-r border-green-900/30 flex flex-col p-4 z-20">
        <div className="mb-8 flex items-center gap-2 text-green-400">
          <Database className="animate-pulse" />
          <div>
            <h1 className="font-bold text-lg leading-none">MEONET</h1>
            <span className="text-xs text-green-700">v2.1.0 Stable</span>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <NavBtn active={activeTab==='miner'} onClick={()=>setActiveTab('miner')} icon={<Cpu size={18}/>} label="Trạm Đào (Miner)" />
          <NavBtn active={activeTab==='wallet'} onClick={()=>setActiveTab('wallet')} icon={<Lock size={18}/>} label="Ví (Wallet)" />
          <NavBtn active={activeTab==='explorer'} onClick={()=>setActiveTab('explorer')} icon={<Search size={18}/>} label="Sổ Cái (Explorer)" />
        </nav>

        <div className="mt-4 pt-4 border-t border-green-900/30 text-xs text-green-700">
          <div className="flex justify-between mb-1">
            <span>Nodes:</span> <span>{networkUsers.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Diff:</span> <span>{DIFFICULTY}</span>
          </div>
          <div className="mt-2 text-center text-green-900 truncate" title={user?.uid}>Connected: {user?.uid.slice(0,6)}...</div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,50,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,50,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>

        {/* TOP BAR */}
        <div className="p-4 md:p-6 flex flex-wrap gap-4 border-b border-green-900/30 bg-neutral-900/50 backdrop-blur-sm z-10">
           <StatBox label="Số Dư Của Bạn" value={`${balance} MCN`} icon={<Zap className="text-yellow-500"/>} />
           <StatBox label="Hashrate (Tốc độ)" value={`${hashRate} H/s`} icon={<Activity className={mining ? "text-green-400" : "text-gray-600"}/>} />
           <StatBox label="Trạng Thái Mạng" value="Online" icon={<Wifi className="text-blue-500"/>} />
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 z-10">
          
          {/* --- MINER TAB --- */}
          {activeTab === 'miner' && (
            <div className="max-w-3xl mx-auto flex flex-col items-center">
              <div className={`
                w-64 h-64 border-4 rounded-full flex flex-col items-center justify-center mb-8 transition-all duration-500 relative
                ${mining 
                  ? 'border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.4)] bg-green-900/10' 
                  : 'border-neutral-800 bg-neutral-900'}
              `}>
                <Cpu size={64} className={`mb-4 ${mining ? 'animate-bounce text-green-400' : 'text-neutral-700'}`} />
                <span className={`text-2xl font-bold ${mining ? 'animate-pulse' : 'text-neutral-600'}`}>
                  {mining ? 'MINING...' : 'PAUSED'}
                </span>
              </div>

              <div className="flex gap-4 mb-8">
                {!mining ? (
                  <button onClick={startMining} className="bg-green-600 hover:bg-green-500 text-black font-bold py-3 px-8 rounded-lg flex items-center gap-2 shadow-lg shadow-green-900/50 transition-all transform hover:scale-105">
                    <Zap size={20}/> KHỞI ĐỘNG MÁY ĐÀO
                  </button>
                ) : (
                  <button onClick={stopMining} className="bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900 font-bold py-3 px-8 rounded-lg flex items-center gap-2 transition-all">
                    <ShieldCheck size={20}/> DỪNG HỆ THỐNG
                  </button>
                )}
              </div>

              <div className="w-full bg-black border border-green-900/50 rounded-lg p-4 font-mono text-xs h-48 overflow-y-auto shadow-inner relative">
                <div className="absolute top-2 right-2 opacity-50"><Terminal size={14}/></div>
                {logs.length === 0 && <div className="text-neutral-600 italic">Hệ thống sẵn sàng...</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`mb-1 ${log.includes('success') ? 'text-yellow-400' : log.includes('error') ? 'text-red-400' : 'text-green-600'}`}>
                    {'>'} {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- WALLET TAB --- */}
          {activeTab === 'wallet' && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-neutral-900 border border-green-900/50 rounded-xl p-6 mb-6">
                <h3 className="text-neutral-400 text-sm uppercase tracking-widest mb-2">Địa chỉ ví của Meo</h3>
                <div className="flex gap-2">
                  <div className="bg-black flex-1 p-3 rounded border border-green-900/30 font-mono text-green-300 truncate">
                    {user?.uid}
                  </div>
                  <button onClick={copyID} className="bg-green-900/30 hover:bg-green-900/50 px-4 rounded border border-green-800 text-green-400">
                    <Copy size={20}/>
                  </button>
                </div>
                <p className="text-xs text-green-800 mt-2">*Gửi mã này cho bạn bè để nhận tiền.</p>
              </div>

              <div className="bg-neutral-900 border border-green-900/50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-green-400 mb-4 flex items-center gap-2">
                  <Send size={18}/> Chuyển Khoản
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">Người nhận (User ID)</label>
                    <input 
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                      placeholder="Nhập ID ví bạn bè..."
                      className="w-full bg-black border border-green-900 rounded p-3 text-green-300 focus:border-green-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">Số lượng (MCN)</label>
                    <input 
                      type="number"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder="0"
                      className="w-full bg-black border border-green-900 rounded p-3 text-green-300 focus:border-green-500 outline-none"
                    />
                  </div>
                  
                  <button onClick={handleTransfer} className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded transition-colors flex justify-center items-center gap-2">
                    GỬI NGAY <Send size={16}/>
                  </button>

                  {txStatus && (
                    <div className={`p-3 rounded text-sm flex items-center gap-2 ${txStatus.type === 'success' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                      {txStatus.type === 'success' ? <ShieldCheck size={16}/> : <AlertCircle size={16}/>}
                      {txStatus.msg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- EXPLORER TAB --- */}
          {activeTab === 'explorer' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-neutral-900/50 border border-green-900/30 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-green-900/30 bg-black/40 font-bold flex items-center gap-2 text-yellow-500">
                  <Users size={18}/> Top Miners
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-green-900/20 text-green-600 text-left">
                      <tr>
                        <th className="p-3">Rank</th>
                        <th className="p-3">User ID</th>
                        <th className="p-3 text-right">Blocks</th>
                        <th className="p-3 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {networkUsers.map((u, idx) => (
                        <tr key={u.address || idx} className={`border-b border-green-900/10 hover:bg-green-900/10 ${u.address === user?.uid ? 'bg-green-900/20' : ''}`}>
                          <td className="p-3 font-bold text-neutral-500">#{idx + 1}</td>
                          <td className="p-3 font-mono">
                            {(u.address || '').slice(0, 8)}...
                            {u.address === user?.uid && <span className="ml-2 text-[10px] bg-green-700 text-white px-1 rounded">YOU</span>}
                          </td>
                          <td className="p-3 text-right text-neutral-400">{u.blocksMined || 0}</td>
                          <td className="p-3 text-right font-bold text-yellow-500">{u.balance || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-neutral-900/50 border border-green-900/30 rounded-xl overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 border-b border-green-900/30 bg-black/40 font-bold flex items-center gap-2 text-blue-400">
                  <Activity size={18}/> Giao Dịch Mới
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
                  {recentTxs.map((tx, i) => (
                    <div key={i} className="border-l-2 border-green-800 pl-3 py-1">
                      <div className="text-neutral-500 mb-1">
                        {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleTimeString() : 'Just now'}
                      </div>
                      {tx.type === 'REWARD' ? (
                        <div className="text-yellow-600">
                          ⚒️ Reward <span className="text-white">+{tx.amount}</span> to {(tx.to || '').slice(0,6)}
                        </div>
                      ) : (
                        <div className="text-blue-400">
                          💸 Transfer <span className="text-white">{tx.amount}</span>
                          <br/>
                          <span className="opacity-50">{(tx.from || '').slice(0,6)} → {(tx.to || '').slice(0,6)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {recentTxs.length === 0 && <div className="text-center text-neutral-600 mt-10">Chưa có giao dịch nào...</div>}
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
  <button 
    onClick={onClick}
    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${active ? 'bg-green-900/40 text-green-300 border border-green-800' : 'text-neutral-500 hover:text-green-400 hover:bg-neutral-800'}`}
  >
    {icon} <span className="font-medium text-sm">{label}</span>
  </button>
);

const StatBox = ({ label, value, icon }) => (
  <div className="flex-1 min-w-[200px] bg-neutral-900 border border-green-900/30 p-4 rounded-xl flex items-center justify-between">
    <div>
      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
    <div className="p-3 bg-black rounded-lg border border-green-900/20">{icon}</div>
  </div>
);