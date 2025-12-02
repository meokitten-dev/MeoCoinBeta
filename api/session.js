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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Thiếu User ID' });
  }

  try {
    const userRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(userId);

    // Tạo một mã Session ngẫu nhiên (Thẻ bài)
    const newSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Lưu mã này vào Database (Ghi đè mã cũ)
    await userRef.set({
      currentSessionId: newSessionId,
      lastSeen: FieldValue.serverTimestamp()
    }, { merge: true });

    // Trả mã này về cho máy người dùng cầm
    return res.status(200).json({ sessionId: newSessionId });

  } catch (error) {
    console.error("Session Error:", error);
    return res.status(500).json({ error: error.message });
  }
}