import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Lấy chìa khóa bí mật
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();
const VERSION = 'meocoin-network-v4'; // Đảm bảo đúng phiên bản V4

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { senderId, receiverId, amount } = req.body;
  const transferAmount = parseInt(amount);

  if (!senderId || !receiverId || !transferAmount || transferAmount <= 0) {
    return res.status(400).json({ error: 'Thông tin không hợp lệ' });
  }

  if (senderId === receiverId) {
    return res.status(400).json({ error: 'Không thể tự chuyển cho mình' });
  }

  try {
    const senderRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(senderId);
    const receiverRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(receiverId);
    const txRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('transactions').doc(`tx_${Date.now()}`);

    await db.runTransaction(async (t) => {
      const senderDoc = await t.get(senderRef);
      const receiverDoc = await t.get(receiverRef);

      if (!senderDoc.exists) throw new Error("Ví người gửi lỗi");
      if (!receiverDoc.exists) throw new Error("ID người nhận không tồn tại");

      const currentBal = senderDoc.data().balance || 0;
      if (currentBal < transferAmount) throw new Error("Số dư không đủ");

      // Trừ tiền người gửi
      t.update(senderRef, { 
        balance: FieldValue.increment(-transferAmount) 
      });
      
      // Cộng tiền người nhận
      t.update(receiverRef, { 
        balance: FieldValue.increment(transferAmount) 
      });

      // Ghi lại giao dịch
      t.set(txRef, {
        from: senderId,
        to: receiverId,
        amount: transferAmount,
        timestamp: FieldValue.serverTimestamp(),
        type: 'TRANSFER'
      });
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Transfer Error:", error);
    return res.status(500).json({ error: error.message });
  }
}