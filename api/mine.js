import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

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

function calculateHash(prevHash, userId, nonce) {
  const data = `${prevHash}${userId}${nonce}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getDifficulty(currentSupply) {
  if (currentSupply < 50000) return "0000"; 
  if (currentSupply < 200000) return "00000";
  if (currentSupply < 400000) return "00000";
  if (currentSupply < 600000) return "000000";
  if (currentSupply < 800000) return "000000";
  return "0000000";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 👇 Lấy thêm thông tin user để tạo ví nếu cần
  const { userId, nonce, clientHash, minerName, userEmail, userPhoto } = req.body;

  if (!userId || !nonce || !clientHash) {
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

      const latestSnapshot = await t.get(blocksRef.orderBy('index', 'desc').limit(1));
      let prevHash = "genesis-block";
      let newIndex = 1;
      
      if (!latestSnapshot.empty) {
        const latestBlock = latestSnapshot.docs[0].data();
        prevHash = latestBlock.hash;
        newIndex = latestBlock.index + 1;
      }

      const serverCalculatedHash = calculateHash(prevHash, userId, nonce);
      const requiredDiff = getDifficulty(currentSupply);

      if (serverCalculatedHash !== clientHash) throw new Error("Hash không khớp!");
      if (!serverCalculatedHash.startsWith(requiredDiff)) throw new Error(`Hash yếu! Cần bắt đầu bằng '${requiredDiff}'`);

      const userDoc = await t.get(userRef);
      
      // 👇 LOGIC MỚI: Tự động tạo user nếu chưa có (Thay vì báo lỗi)
      if (!userDoc.exists) {
        t.set(userRef, {
          address: userId,
          email: userEmail || "",
          displayName: minerName || "Miner",
          photoURL: userPhoto || "",
          balance: BLOCK_REWARD, // Thưởng luôn block đầu tiên
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
        hash: serverCalculatedHash,
        prevHash: prevHash,
        miner: userId,
        minerName: minerName || "Unknown",
        nonce: Number(nonce),
        difficulty: requiredDiff,
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