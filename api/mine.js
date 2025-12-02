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

      // Kiểm tra còn coin không
      if (currentSupply + BLOCK_REWARD > MAX_SUPPLY) throw new Error("Đã hết coin để đào!");

      // Lấy block cũ để tạo dây xích giả (cho đẹp đội hình)
      const latestSnapshot = await t.get(blocksRef.orderBy('index', 'desc').limit(1));
      let prevHash = "genesis-block";
      let newIndex = 1;
      
      if (!latestSnapshot.empty) {
        const latestBlock = latestSnapshot.docs[0].data();
        prevHash = latestBlock.hash;
        newIndex = latestBlock.index + 1;
      }

      // Tạo hash ngẫu nhiên (Fake hash)
      const randomHash = '0000' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      const userDoc = await t.get(userRef);
      
      // Tự động tạo user nếu chưa có
      if (!userDoc.exists) {
        t.set(userRef, {
          address: userId,
          email: userEmail || "",
          displayName: minerName || "Miner",
          photoURL: userPhoto || "",
          balance: BLOCK_REWARD,
          blocksMined: 1,
          joinedAt: FieldValue.serverTimestamp(),
          lastSeen: FieldValue.serverTimestamp()
        });
      } else {
        t.update(userRef, {
          balance: FieldValue.increment(BLOCK_REWARD),
          blocksMined: FieldValue.increment(1),
          lastSeen: FieldValue.serverTimestamp()
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
    console.error("Mining Error:", error);
    return res.status(500).json({ error: error.message });
  }
}