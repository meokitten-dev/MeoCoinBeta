// --- MeoCoin Item Loot Pool (V5.0) ---

export const ITEMS = {
  // --- CẤP 1: PHẾ LIỆU (COMMON - 50%) ---
  "fish_bone": { id: "fish_bone", name: "Xương Cá", icon: "🦴", rarity: "common", value: 1, color: "#94a3b8" },
  "old_can": { id: "old_can", name: "Vỏ Lon Cũ", icon: "🥫", rarity: "common", value: 2, color: "#94a3b8" },
  "slipper": { id: "slipper", name: "Dép Tổ Ong", icon: "🩴", rarity: "common", value: 3, color: "#94a3b8" },
  "paper": { id: "paper", name: "Giấy Vụn", icon: "📄", rarity: "common", value: 1, color: "#94a3b8" },

  // --- CẤP 2: NHU YẾU PHẨM (UNCOMMON - 30%) ---
  "wool": { id: "wool", name: "Cuộn Len", icon: "🧶", rarity: "uncommon", value: 10, color: "#22c55e" },
  "catnip": { id: "catnip", name: "Cỏ Mèo", icon: "🌿", rarity: "uncommon", value: 15, color: "#22c55e" },
  "canned_fish": { id: "canned_fish", name: "Cá Hộp", icon: "🐟", rarity: "uncommon", value: 20, color: "#22c55e" },
  "mouse_toy": { id: "mouse_toy", name: "Chuột Nhựa", icon: "🐁", rarity: "uncommon", value: 12, color: "#22c55e" },

  // --- CẤP 3: QUÝ HIẾM (RARE - 15%) ---
  "gold": { id: "gold", name: "Vàng Ròng", icon: "🌕", rarity: "rare", value: 50, color: "#3b82f6" },
  "ruby": { id: "ruby", name: "Hồng Ngọc", icon: "🔴", rarity: "rare", value: 80, color: "#3b82f6" },
  "amethyst": { id: "amethyst", name: "Thạch Anh Tím", icon: "🟣", rarity: "rare", value: 100, color: "#3b82f6" },

  // --- CẤP 4: HUYỀN BÍ (EPIC - 4%) ---
  "ufo": { id: "ufo", name: "Mảnh UFO", icon: "🛸", rarity: "epic", value: 300, color: "#a855f7" },
  "fossil": { id: "fossil", name: "Hóa Thạch", icon: "🦖", rarity: "epic", value: 400, color: "#a855f7" },
  "chest": { id: "chest", name: "Rương Báu", icon: "🏴‍☠️", rarity: "epic", value: 500, color: "#a855f7" },

  // --- CẤP 5: THẦN THOẠI (LEGENDARY - 1%) ---
  "crown": { id: "crown", name: "Vương Miện", icon: "👑", rarity: "legendary", value: 2000, color: "#f97316" },
  "infinity_gem": { id: "infinity_gem", name: "MeoGem Vô Cực", icon: "💠", rarity: "legendary", value: 5000, color: "#f97316" }
};

// --- Tỷ lệ xuất hiện của các cấp độ (Tổng cộng phải = 1.0) ---
export const RARITY_RATES = {
    common: 0.50,    // 50%
    uncommon: 0.30,  // 30%
    rare: 0.15,      // 15%
    epic: 0.04,      // 4%
    legendary: 0.01  // 1%
};

// Phân loại Items vào các Collection cho Bộ Sưu Tập
export const ITEM_COLLECTIONS = {
    "collection_1": { name: "Phế Liệu Bãi Rác", items: ["fish_bone", "old_can", "slipper", "paper"] },
    "collection_2": { name: "Nhu Yếu Phẩm Mèo", items: ["wool", "catnip", "canned_fish", "mouse_toy"] },
    "collection_3": { name: "Khoáng Sản Quý", items: ["gold", "ruby", "amethyst"] },
    "collection_4": { name: "Bí Ẩn Cổ Đại", items: ["ufo", "fossil", "chest"] },
    "collection_5": { name: "Thần Khí Tối Thượng", items: ["crown", "infinity_gem"] }
};