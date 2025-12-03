// api/loot.js

// Danh sách vật phẩm có thể đào được
// chance: là tỷ lệ xuất hiện (càng cao càng dễ ra)
// reward: là số MeoCoin nhận được

export const LOOT_TABLE = [
  // --- HẠNG: RÁC (Dễ gặp nhất - Rate cao) ---
  { id: 'fish_bone',    name: 'Xương Cá',       emoji: '🐟', reward: 1,   chance: 150 },
  { id: 'old_boot',     name: 'Ủng Rách',       emoji: '👢', reward: 1,   chance: 120 },
  { id: 'empty_box',    name: 'Hộp Carton',     emoji: '📦', reward: 2,   chance: 100 },
  { id: 'wool_ball',    name: 'Cuộn Len Rối',   emoji: '🧶', reward: 3,   chance: 90 },

  // --- HẠNG: PHỔ BIẾN (Tài nguyên) ---
  { id: 'stone',        name: 'Đá Cuội',        emoji: '🪨', reward: 5,   chance: 80 },
  { id: 'coal',         name: 'Than Đen',       emoji: '⚫', reward: 8,   chance: 70 },
  { id: 'wood',         name: 'Gỗ Sồi',         emoji: '🪵', reward: 10,  chance: 60 },
  { id: 'mouse_toy',    name: 'Chuột Đồ Chơi',  emoji: '🐁', reward: 15,  chance: 50 },

  // --- HẠNG: HIẾM (Đồ ăn ngon & Khoáng sản) ---
  { id: 'catnip',       name: 'Cỏ Mèo Tươi',    emoji: '🌿', reward: 25,  chance: 40 },
  { id: 'canned_food',  name: 'Pate Thượng Hạng', emoji: '🥫', reward: 30, chance: 35 },
  { id: 'iron',         name: 'Quặng Sắt',      emoji: '🔩', reward: 40,  chance: 30 },
  { id: 'silver',       name: 'Bạc Lấp Lánh',   emoji: '🥈', reward: 60,  chance: 20 },

  // --- HẠNG: CỰC HIẾM (Đồ công nghệ & Quý giá) ---
  { id: 'gold',         name: 'Vàng Ròng',      emoji: '⚜️', reward: 100, chance: 15 },
  { id: 'smartphone',   name: 'iPhone 16 Pro',  emoji: '📱', reward: 150, chance: 10 },
  { id: 'gpu',          name: 'NVIDIA RTX 5090',emoji: '📼', reward: 250, chance: 5 },
  { id: 'diamond',      name: 'Kim Cương',      emoji: '💎', reward: 500, chance: 2 },

  // --- HẠNG: HUYỀN THOẠI (Siêu khó ra) ---
  { id: 'bitcoin',      name: 'Bitcoin Vật Lý', emoji: '🪙', reward: 1000, chance: 1 },
  { id: 'ufo',          name: 'Đĩa Bay',        emoji: '🛸', reward: 5000, chance: 0.1 },
  { id: 'meo_crown',    name: 'Vương Miện Meo', emoji: '👑', reward: 9999, chance: 0.05 }
];

// Hàm chọn vật phẩm (Logic giữ nguyên nhưng tách ra đây cho gọn)
export const pickLoot = () => {
  const totalChance = LOOT_TABLE.reduce((sum, item) => sum + item.chance, 0);
  let random = Math.random() * totalChance;
  
  for (const item of LOOT_TABLE) {
    if (random < item.chance) return item;
    random -= item.chance;
  }
  return LOOT_TABLE[0]; // Mặc định trả về Xương Cá nếu lỗi
};