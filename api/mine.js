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
const COOLDOWN_MS = 5000; 

export default async function handler(req, res) {
  // Lỗi Method thì vẫn phải báo lỗi thật
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, minerName, userEmail, userPhoto } = req.body;

  if (!userId) {
    return res.status(200).json({ success: false, message: 'Thiếu thông tin User' });
  }

  try {
    const statsRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('stats').doc('global');
    const blocksRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('blocks');
    const userRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(userId);

    await db.runTransaction(async (t) => {
      const statsDoc = await t.get(statsRef);
      const currentSupply = statsDoc.exists ? (statsDoc.data().totalSupply || 0) : 0;

      if (currentSupply + BLOCK_REWARD > MAX_SUPPLY) throw new Error("MAX_SUPPLY");

      const userDoc = await t.get(userRef);
      const now = Date.now();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const lastMined = userData.lastMinedAt ? userData.lastMinedAt.toMillis() : 0;
        
        // Kiểm tra hồi chiêu
        if (now - lastMined < COOLDOWN_MS) {
          throw new Error("COOLDOWN");
        }
      }

      const latestSnapshot = await t.get(blocksRef.orderBy('index', 'desc').limit(1));
      let prevHash = "genesis-block";
      let newIndex = 1;
      
      if (!latestSnapshot.empty) {
        const latestBlock = latestSnapshot.docs[0].data();
        prevHash = latestBlock.hash;
        newIndex = latestBlock.index + 1;
      }

      const randomHash = '0000' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

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
          lastMinedAt: FieldValue.serverTimestamp()
        });
      } else {
        t.update(userRef, {
          balance: FieldValue.increment(BLOCK_REWARD),
          blocksMined: FieldValue.increment(1),
          lastSeen: FieldValue.serverTimestamp(),
          lastMinedAt: FieldValue.serverTimestamp()
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
    // 👇 MẸO Ở ĐÂY: Trả về 200 (Thành công) nhưng kèm cờ success: false
    if (error.message === "COOLDOWN") {
        return res.status(200).json({ success: false, code: "COOLDOWN", message: "⏳ Đào quá nhanh! Chờ chút..." });
    }
    if (error.message === "MAX_SUPPLY") {
        return res.status(200).json({ success: false, code: "MAX_SUPPLY", message: "⚠️ Đã hết coin!" });
    }

    console.error("Mining Error:", error);
    // Các lỗi hệ thống khác thì vẫn nên báo lỗi thật
    return res.status(500).json({ success: false, message: "Lỗi hệ thống: " + error.message });
  }
}