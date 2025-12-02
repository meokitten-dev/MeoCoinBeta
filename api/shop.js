import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!getApps().length) { initializeApp({ credential: cert(serviceAccount) }); }

const db = getFirestore();
const VERSION = 'meocoin-network-v5'; // Khớp version

const SHOP_ITEMS = {
  "speed_potion": { name: "Nước Tăng Lực", price: 100, type: "speed", duration: 10 * 60 * 1000 }, // 10 phút
  "lucky_charm": { name: "Kính Lúp May Mắn", price: 500, type: "lucky", duration: 10 * 60 * 1000 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, itemId } = req.body;
  const item = SHOP_ITEMS[itemId];

  if (!userId || !item) return res.status(400).json({ error: 'Dữ liệu sai' });

  try {
    const userRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(userId);

    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error("User không tồn tại");

      const userData = userDoc.data();
      const now = Date.now();

      // 1. Kiểm tra tiền
      if ((userData.balance || 0) < item.price) {
        throw new Error("Không đủ tiền!");
      }

      // 2. Kiểm tra Buff cũ (Chỉ được dùng 1 cái)
      if (userData.activeBuff && userData.activeBuff.expiresAt > now) {
        throw new Error("Đang có hiệu ứng rồi! Hết hiệu ứng mới được mua tiếp.");
      }

      // 3. Trừ tiền và Gán Buff
      t.update(userRef, {
        balance: FieldValue.increment(-item.price),
        activeBuff: {
          type: item.type,
          name: item.name,
          expiresAt: now + item.duration
        }
      });
    });

    return res.status(200).json({ success: true, message: `Đã mua ${item.name}!` });

  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
}