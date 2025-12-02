import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();
const VERSION = 'meocoin-network-v4'; 
const MAX_SUPPLY = 1000000;
const BLOCK_REWARD = 10; 
const COOLDOWN_MS = 5000; // ⏱️ Hồi chiêu 5 giây

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, minerName, userEmail, userPhoto } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Thiếu thông tin' });
  }

  try {
    const statsRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('stats').doc('global');
    const blocksRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('blocks');
    const userRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(userId);

    await db.runTransaction(async (t) => {
      const statsDoc = await t.get(statsRef);
      const currentSupply = statsDoc.exists ? (statsDoc.data().totalSupply || 0) : 0;

      if (currentSupply + BLOCK_REWARD > MAX_SUPPLY) throw new Error("Đã hết coin để đào!");

      // Lấy thông tin user để kiểm tra hồi chiêu
      const userDoc = await t.get(userRef);
      const now = Date.now();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const lastMined = userData.lastMinedAt ? userData.lastMinedAt.toMillis() : 0;
        
        // 🛑 KIỂM TRA HỒI CHIÊU TẠI ĐÂY
        if (now - lastMined < COOLDOWN_MS) {
          throw new Error("⏳ Đào quá nhanh! Vui lòng đợi 5 giây.");
        }
      }

      // Logic tạo hash ảo (Fake Chain)
      const latestSnapshot = await t.get(blocksRef.orderBy('index', 'desc').limit(1));
      let prevHash = "genesis-block";
      let newIndex = 1;
      
      if (!latestSnapshot.empty) {
        const latestBlock = latestSnapshot.docs[0].data();
        prevHash = latestBlock.hash;
        newIndex = latestBlock.index + 1;
      }

      const randomHash = '0000' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Cập nhật User (Thêm trường lastMinedAt)
      if (!userDoc.exists) {
        t.set(userRef, {
          address: userId,
          email: userEmail || "",
          displayName: minerName || "Miner",
          photoURL: userPhoto || "",
          balance: BLOCK_REWARD,
          blocksMined: 1,
          joinedAt: FieldValue.serverTimestamp(),
          lastSeen: FieldValue.serverTimestamp(),
          lastMinedAt: FieldValue.serverTimestamp() // Ghi lại thời gian đào
        });
      } else {
        t.update(userRef, {
          balance: FieldValue.increment(BLOCK_REWARD),
          blocksMined: FieldValue.increment(1),
          lastSeen: FieldValue.serverTimestamp(),
          lastMinedAt: FieldValue.serverTimestamp() // Cập nhật thời gian đào mới nhất
        });
      }

      t.set(statsRef, { totalSupply: FieldValue.increment(BLOCK_REWARD) }, { merge: true });

      const newBlockId = `block_${Date.now()}`;
      t.set(blocksRef.doc(newBlockId), {
        index: newIndex,
        hash: randomHash,
        prevHash: prevHash,
        miner: userId,
        minerName: minerName || "Unknown",
        difficulty: "SIMULATED",
        timestamp: FieldValue.serverTimestamp(),
        reward: BLOCK_REWARD
      });
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    // Không log lỗi cooldown ra console server để đỡ rác log, chỉ trả về client
    if (!error.message.includes("Đào quá nhanh")) {
        console.error("Mining Error:", error);
    }
    return res.status(500).json({ error: error.message });
  }
}