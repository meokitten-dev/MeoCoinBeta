import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ITEMS, RARITY_RATES, LUCKY_RATES } from '../src/data/items.js'; // Import định nghĩa item

// Mẹo: Để import file từ src trong Vercel Function đôi khi cần cấu hình thêm. 
// Để đơn giản và chắc chắn chạy, Mira sẽ copy lại logic items vào đây luôn nhé.
const LOCAL_ITEMS = {
  "fish_bone": { id: "fish_bone", value: 1, rarity: "common" },
  "old_can": { id: "old_can", value: 2, rarity: "common" },
  "slipper": { id: "slipper", value: 3, rarity: "common" },
  "paper": { id: "paper", value: 1, rarity: "common" },
  "wool": { id: "wool", value: 10, rarity: "uncommon" },
  "catnip": { id: "catnip", value: 15, rarity: "uncommon" },
  "canned_fish": { id: "canned_fish", value: 20, rarity: "uncommon" },
  "mouse_toy": { id: "mouse_toy", value: 12, rarity: "uncommon" },
  "gold": { id: "gold", value: 50, rarity: "rare" },
  "ruby": { id: "ruby", value: 80, rarity: "rare" },
  "amethyst": { id: "amethyst", value: 100, rarity: "rare" },
  "ufo": { id: "ufo", value: 300, rarity: "epic" },
  "fossil": { id: "fossil", value: 400, rarity: "epic" },
  "chest": { id: "chest", value: 500, rarity: "epic" },
  "crown": { id: "crown", value: 2000, rarity: "legendary" },
  "infinity_gem": { id: "infinity_gem", value: 5000, rarity: "legendary" }
};

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!getApps().length) { initializeApp({ credential: cert(serviceAccount) }); }

const db = getFirestore();
const VERSION = 'meocoin-network-v5'; // 👈 LÊN ĐỜI V5
const MAX_SUPPLY = 1000000;
const COOLDOWN_MS = 5000; 

// Hàm chọn item dựa trên tỷ lệ
function pickItem(isLucky) {
  const rates = isLucky ? { common: 0.2, uncommon: 0.3, rare: 0.3, epic: 0.15, legendary: 0.05 } 
                        : { common: 0.5, uncommon: 0.3, rare: 0.15, epic: 0.04, legendary: 0.01 };
  
  const rand = Math.random();
  let selectedRarity = "common";
  let cumulative = 0;

  // Logic chọn độ hiếm (Weighted Random)
  if (rand < (cumulative += rates.legendary)) selectedRarity = "legendary";
  else if (rand < (cumulative += rates.epic)) selectedRarity = "epic";
  else if (rand < (cumulative += rates.rare)) selectedRarity = "rare";
  else if (rand < (cumulative += rates.uncommon)) selectedRarity = "uncommon";
  else selectedRarity = "common";

  // Lọc danh sách item theo độ hiếm đã chọn
  const pool = Object.values(LOCAL_ITEMS).filter(i => i.rarity === selectedRarity);
  // Chọn ngẫu nhiên 1 món trong nhóm đó
  return pool[Math.floor(Math.random() * pool.length)];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, minerName, userEmail, userPhoto } = req.body;
  if (!userId) return res.status(400).json({ error: 'Thiếu thông tin' });

  try {
    const statsRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('stats').doc('global');
    const userRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('users').doc(userId);

    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const statsDoc = await t.get(statsRef);
      const currentSupply = statsDoc.exists ? (statsDoc.data().totalSupply || 0) : 0;
      const now = Date.now();

      // 1. Kiểm tra User & Cooldown
      let isLucky = false;
      let lastMined = 0;

      if (userDoc.exists) {
        const data = userDoc.data();
        lastMined = data.lastMinedAt ? data.lastMinedAt.toMillis() : 0;
        
        // Kiểm tra BUFF
        if (data.activeBuff && data.activeBuff.expiresAt > now) {
           if (data.activeBuff.type === 'lucky') isLucky = true;
           // Nếu có buff tốc độ thì giảm cooldown (ví dụ còn 2.5s)
           if (data.activeBuff.type === 'speed') {
             if (now - lastMined < 2500) throw new Error("COOLDOWN_SPEED");
           } else {
             if (now - lastMined < COOLDOWN_MS) throw new Error("COOLDOWN");
           }
        } else {
           // Không buff thì check 5s
           if (now - lastMined < COOLDOWN_MS) throw new Error("COOLDOWN");
        }
      }

      // 2. Chọn quà
      const droppedItem = pickItem(isLucky);
      if (currentSupply + droppedItem.value > MAX_SUPPLY) throw new Error("MAX_SUPPLY");

      // 3. Cập nhật DB
      const updateData = {
        balance: FieldValue.increment(droppedItem.value),
        blocksMined: FieldValue.increment(1),
        lastSeen: FieldValue.serverTimestamp(),
        lastMinedAt: FieldValue.serverTimestamp(),
        // Cộng item vào kho (inventory.fish_bone = +1)
        [`inventory.${droppedItem.id}`]: FieldValue.increment(1) 
      };

      if (!userDoc.exists) {
        t.set(userRef, {
          address: userId,
          email: userEmail || "",
          displayName: minerName || "Miner",
          photoURL: userPhoto || "",
          ...updateData,
          joinedAt: FieldValue.serverTimestamp()
        });
      } else {
        t.update(userRef, updateData);
      }

      t.set(statsRef, { totalSupply: FieldValue.increment(droppedItem.value) }, { merge: true });

      // Lưu block (rút gọn)
      const newBlockId = `block_${Date.now()}`;
      const blocksRef = db.collection('artifacts').doc(VERSION).collection('public').doc('data').collection('blocks');
      t.set(blocksRef.doc(newBlockId), {
        miner: userId,
        minerName: minerName || "Unknown",
        item: droppedItem.id, // Lưu ID item thay vì reward
        value: droppedItem.value,
        timestamp: FieldValue.serverTimestamp(),
        index: (userDoc.exists ? userDoc.data().blocksMined || 0 : 0) + 1 // Ước lượng index
      });
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    if (error.message.includes("COOLDOWN")) return res.status(200).json({ success: false, code: "COOLDOWN", message: "⏳ Đang hồi chiêu..." });
    if (error.message === "MAX_SUPPLY") return res.status(200).json({ success: false, code: "MAX_SUPPLY", message: "Hết coin!" });
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}