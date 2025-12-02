import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// Import Item Database
import { RARITY_RATES, ITEMS } from '../src/data/items.js';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();
const VERSION = 'meocoin-network-v5'; // KHỞI ĐỘNG V5
const MAX_SUPPLY = 1000000;
const COOLDOWN_MS = 5000; 

// --- HÀM QUAY XỔ SỐ ITEM ---
function getLootItem(rarityRates) {
    let randomValue = Math.random();
    let cumulativeRate = 0;
    let selectedRarity = 'common';

    // Dùng tỷ lệ để quay ra cấp độ hiếm
    for (const category in rarityRates) {
        cumulativeRate += rarityRates[category];
        if (randomValue <= cumulativeRate) {
            selectedRarity = category;
            break;
        }
    }
    
    // Lọc ra Item thuộc Rarity đã chọn
    const possibleItems = Object.values(ITEMS).filter(item => item.rarity === selectedRarity);

    if (possibleItems.length === 0) {
        // Fallback an toàn (Đá vụn)
        return ITEMS.fish_bone;
    }

    // Chọn Item ngẫu nhiên trong nhóm Rarity
    return possibleItems[Math.floor(Math.random() * possibleItems.length)];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, minerName, userEmail, userPhoto } = req.body;

  if (!userId) {
    return res.status(200).json({ success: false, message: 'Thiếu thông tin User' });
  }

  try {
    const statsRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('stats').doc('global');
    const blocksRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('blocks');
    const userRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(userId);

    let foundItem = null;
    let rewardAmount = 0;
    
    await db.runTransaction(async (t) => {
      const statsDoc = await t.get(statsRef);
      const currentSupply = statsDoc.exists ? (statsDoc.data().totalSupply || 0) : 0;

      // 1. KIỂM TRA HỒI CHIÊU
      const userDoc = await t.get(userRef);
      const now = Date.now();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const lastMined = userData.lastMinedAt ? userData.lastMinedAt.toMillis() : 0;
        
        if (now - lastMined < COOLDOWN_MS) {
          throw new Error("COOLDOWN");
        }
      }
      
      // 2. QUAY SỔ XỐ & KIỂM TRA TỔNG CUNG
      foundItem = getLootItem(RARITY_RATES);
      rewardAmount = foundItem.value; // Coin nhận được = Giá trị của Item

      if (currentSupply + rewardAmount > MAX_SUPPLY) throw new Error("MAX_SUPPLY");


      // 3. CẬP NHẬT DATABASE
      const latestSnapshot = await t.get(blocksRef.orderBy('index', 'desc').limit(1));
      let prevHash = "genesis-block";
      let newIndex = 1;
      if (!latestSnapshot.empty) {
        const latestBlock = latestSnapshot.docs[0].data();
        prevHash = latestBlock.hash;
        newIndex = latestBlock.index + 1;
      }

      const randomHash = '0000' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Nếu User mới -> Tạo User
      if (!userDoc.exists) {
        t.set(userRef, {
          address: userId, email: userEmail || "", displayName: minerName || "Miner", photoURL: userPhoto || "",
          balance: rewardAmount, blocksMined: 1, joinedAt: FieldValue.serverTimestamp(), lastSeen: FieldValue.serverTimestamp(), lastMinedAt: FieldValue.serverTimestamp(),
          inventory: { [foundItem.id]: 1 } // Thêm Item đầu tiên vào kho
        });
      } else {
        // User đã có -> Cộng Item và Coin
        const currentInventory = userDoc.data().inventory || {};
        const currentItemCount = currentInventory[foundItem.id] || 0;
        
        // Dùng map/dot notation để cập nhật field Inventory an toàn
        let updateData = {
          balance: FieldValue.increment(rewardAmount), 
          blocksMined: FieldValue.increment(1), 
          lastSeen: FieldValue.serverTimestamp(), 
          lastMinedAt: FieldValue.serverTimestamp(),
          [`inventory.${foundItem.id}`]: currentItemCount + 1
        };

        t.update(userRef, updateData);
      }

      // Cập nhật Tổng cung
      t.set(statsRef, { totalSupply: FieldValue.increment(rewardAmount) }, { merge: true });

      // Ghi Block
      const newBlockId = `block_${Date.now()}`;
      t.set(blocksRef.doc(newBlockId), {
        index: newIndex, hash: randomHash, prevHash: prevHash, miner: userId, minerName: minerName || "Unknown", difficulty: "SIMULATED",
        timestamp: FieldValue.serverTimestamp(), reward: rewardAmount, itemId: foundItem.id, itemName: foundItem.name
      });
    });

    return res.status(200).json({ success: true, item: foundItem }); // Trả về Item vừa đào được

  } catch (error) {
    if (error.message === "COOLDOWN") {
        return res.status(200).json({ success: false, code: "COOLDOWN", message: "⏳ Đào quá nhanh! Chờ chút..." });
    }
    if (error.message === "MAX_SUPPLY") {
        return res.status(200).json({ success: false, code: "MAX_SUPPLY", message: "⚠️ Đã hết coin!" });
    }

    console.error("Mining Error:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống: " + error.message });
  }
}