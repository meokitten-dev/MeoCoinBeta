export const ITEMS = {
  // --- CẤP 1: PHẾ LIỆU (GRAY) ---
  "fish_bone": { id: "fish_bone", name: "Xương Cá", icon: "🦴", rarity: "common", value: 1, color: "#94a3b8" },
  "old_can": { id: "old_can", name: "Vỏ Lon", icon: "🥫", rarity: "common", value: 2, color: "#94a3b8" },
  "slipper": { id: "slipper", name: "Dép Tổ Ong", icon: "🩴", rarity: "common", value: 3, color: "#94a3b8" },
  "paper": { id: "paper", name: "Giấy Vụn", icon: "📄", rarity: "common", value: 1, color: "#94a3b8" },

  // --- CẤP 2: NHU YẾU PHẨM (GREEN) ---
  "wool": { id: "wool", name: "Cuộn Len", icon: "🧶", rarity: "uncommon", value: 10, color: "#22c55e" },
  "catnip": { id: "catnip", name: "Cỏ Mèo", icon: "🌿", rarity: "uncommon", value: 15, color: "#22c55e" },
  "canned_fish": { id: "canned_fish", name: "Cá Hộp", icon: "🐟", rarity: "uncommon", value: 20, color: "#22c55e" },
  "mouse_toy": { id: "mouse_toy", name: "Chuột Nhựa", icon: "🐁", rarity: "uncommon", value: 12, color: "#22c55e" },

  // --- CẤP 3: QUÝ HIẾM (BLUE) ---
  "gold": { id: "gold", name: "Vàng Ròng", icon: "🌕", rarity: "rare", value: 50, color: "#3b82f6" },
  "ruby": { id: "ruby", name: "Hồng Ngọc", icon: "🔴", rarity: "rare", value: 80, color: "#3b82f6" },
  "amethyst": { id: "amethyst", name: "Thạch Anh", icon: "🟣", rarity: "rare", value: 100, color: "#3b82f6" },

  // --- CẤP 4: HUYỀN BÍ (PURPLE) ---
  "ufo": { id: "ufo", name: "Mảnh UFO", icon: "🛸", rarity: "epic", value: 300, color: "#a855f7" },
  "fossil": { id: "fossil", name: "Hóa Thạch", icon: "🦖", rarity: "epic", value: 400, color: "#a855f7" },
  "chest": { id: "chest", name: "Rương Báu", icon: "🏴‍☠️", rarity: "epic", value: 500, color: "#a855f7" },

  // --- CẤP 5: THẦN THOẠI (ORANGE) ---
  "crown": { id: "crown", name: "Vương Miện", icon: "👑", rarity: "legendary", value: 2000, color: "#f97316" },
  "infinity_gem": { id: "infinity_gem", name: "MeoGem", icon: "💠", rarity: "legendary", value: 5000, color: "#f97316" }
};

export const RARITY_RATES = {
  common: 0.5,      // 50%
  uncommon: 0.3,    // 30%
  rare: 0.15,       // 15%
  epic: 0.04,       // 4%
  legendary: 0.01   // 1%
};

// Tỷ lệ khi dùng Bùa May Mắn
export const LUCKY_RATES = {
  common: 0.2,      // Giảm rác
  uncommon: 0.3,
  rare: 0.3,        // Tăng đồ quý
  epic: 0.15,       // Tăng mạnh
  legendary: 0.05   // Tăng gấp 5 lần
};