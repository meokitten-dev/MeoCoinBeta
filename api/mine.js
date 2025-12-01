// api/mine.js - Đây là nơi Cảnh Sát Server làm việc
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// 1. Cấu hình Server với chìa khóa bí mật (Service Account)
// Chúng ta sẽ lấy chìa khóa này từ biến môi trường của Vercel để không bị lộ
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();
const MAX_SUPPLY = 1000000;
const BLOCK_REWARD = 50;

// Hàm tính hash trên server (để đối chiếu với client)
function calculateHash(prevHash, userId, nonce) {
  const data = `${prevHash}${userId}${nonce}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Hàm lấy độ khó hiện tại (phải khớp logic với Client)
function getDifficulty(currentSupply) {
  if (currentSupply < 100000) return "0";
  if (currentSupply < 400000) return "00";
  if (currentSupply < 800000) return "000";
  return "0000";
}

export default async function handler(req, res) {
  // Chỉ chấp nhận method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, nonce, clientHash, minerName } = req.body;

  if (!userId || !nonce || !clientHash) {
    return res.status(400).json({ error: 'Thiếu thông tin gửi lên' });
  }

  try {
    // 2. Lấy thông tin từ Database (người dùng không thể can thiệp đoạn này)
    const statsRef = db.collection('artifacts').doc('meocoin-network-v3').collection('public').doc('data').collection('stats').doc('global');
    const blocksRef = db.collection('artifacts').doc('meocoin-network-v3').collection('public').doc('data').collection('blocks');
    const userRef = db.collection('artifacts').doc('meocoin-network-v3').collection('public').doc('data').collection('users').doc(userId);

    // Chạy transaction để đảm bảo an toàn dữ liệu
    await db.runTransaction(async (t) => {
      const statsDoc = await t.get(statsRef);
      const currentSupply = statsDoc.exists ? (statsDoc.data().totalSupply || 0) : 0;

      // KIỂM TRA 1: Hết coin chưa?
      if (currentSupply + BLOCK_REWARD > MAX_SUPPLY) {
        throw new Error("Đã hết coin để đào!");
      }

      // Lấy block mới nhất để lấy prevHash
      const latestSnapshot = await t.get(blocksRef.orderBy('index', 'desc').limit(1));
      let prevHash = "genesis-block";
      let newIndex = 1;
      
      if (!latestSnapshot.empty) {
        const latestBlock = latestSnapshot.docs[0].data();
        prevHash = latestBlock.hash;
        newIndex = latestBlock.index + 1;
      }

      // KIỂM TRA 2: Tính toán lại Hash xem có khớp không (CHỐNG HACK TỐC ĐỘ)
      const serverCalculatedHash = calculateHash(prevHash, userId, nonce);
      const requiredDiff = getDifficulty(currentSupply);

      if (serverCalculatedHash !== clientHash) {
        throw new Error("Gian lận! Hash gửi lên không khớp.");
      }
      
      if (!serverCalculatedHash.startsWith(requiredDiff)) {
        throw new Error(`Hash chưa đủ độ khó! Cần bắt đầu bằng '${requiredDiff}'`);
      }

      // KIỂM TRA 3: Kiểm tra xem user có tồn tại không
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User không tồn tại!");
      }

      // NẾU TẤT CẢ ĐỀU ĐÚNG -> CỘNG TIỀN (CHỐNG HACK SỐ DƯ)
      t.update(userRef, {
        balance: FieldValue.increment(BLOCK_REWARD),
        blocksMined: FieldValue.increment(1)
      });

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

    return res.status(200).json({ success: true, message: "Block hợp lệ!" });

  } catch (error) {
    console.error("Mining Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
