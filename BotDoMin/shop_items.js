// Danh mục hàng bán trong shop Discord.
//
// ID item lấy theo quy tắc: PalPassiveSkillChange_Consumable_<passiveID>
// (đã kiểm chứng trong game: tặng item -> vào Bàn Phẫu Thuật Pal dùng được).
//
// 21 implant này là toàn bộ loại DÙNG ĐƯỢC. Còn 7 loại nữa (Legend, Lucky, Siren of the Void,
// Eternal Flame, Invader, Lunker, Savior) bị nhà phát hành khoá — có item nhưng bàn phẫu thuật
// không nhận, nên KHÔNG bán. Xem GHI-CHU-BAN-PHAU-THUAT.md của palworld-dashboard.
//
// Implant loại "dùng một lần" — cấy xong là mất, nên người chơi phải mua lại mỗi lần đổi passive.

const IMPLANT_PREFIX = 'PalPassiveSkillChange_Consumable_';

// tier 'worldtree' = 7 chiêu Cây Thế Giới (mạnh nhất, giá cao hơn)
// tier 'kimcuong'  = 14 chiêu cao cấp còn lại
const IMPLANTS = [
    // --- Cây Thế Giới (7) ---
    { passive: 'WorldTree_ATK', name: 'Thánh Kiếm Hai Lưỡi', tier: 'worldtree' },
    { passive: 'WorldTree_DEF', name: 'Thành Trì Thịt Sống', tier: 'worldtree' },
    { passive: 'WorldTree_ATK_DEF', name: 'Thần Hủy Diệt', tier: 'worldtree' },
    { passive: 'WorldTree_CraftSpeed', name: 'Bàn Tay Ác Quỷ', tier: 'worldtree' },
    { passive: 'WorldTree_MoveSpeed', name: 'Cú Nhảy Không Gian', tier: 'worldtree' },
    { passive: 'WorldTree_Sanity', name: 'Tiên Nhân', tier: 'worldtree' },
    { passive: 'WorldTree_FullStomach', name: 'Vườn Ươm Cây Thần', tier: 'worldtree' },

    // --- Đột biến (5) ---
    { passive: 'MutationPal_Immortal', name: 'Thân Thể Bất Tử', tier: 'kimcuong' },
    { passive: 'MutationPal_Mutant', name: 'Thể Chất Đặc Dị', tier: 'kimcuong' },
    { passive: 'MutationPal_Babysitter', name: 'Bảo Mẫu Trông Trẻ', tier: 'kimcuong' },
    { passive: 'MutationPal_ExplosionResist', name: 'Thiết Giáp Hạng Nặng', tier: 'kimcuong' },
    { passive: 'RideJumpCount_Increase2', name: 'Bước Đi Trên Không', tier: 'kimcuong' },

    // --- Cao cấp khác (9) ---
    { passive: 'Deffence_up3', name: 'Thân Thể Kim Cương', tier: 'kimcuong' },
    { passive: 'PAL_ALLAttack_up3', name: 'Quỷ Thần', tier: 'kimcuong' },
    { passive: 'CraftSpeed_up3', name: 'Kỹ Năng Siêu Việt', tier: 'kimcuong' },
    { passive: 'MoveSpeed_up_3', name: 'Thần Tốc', tier: 'kimcuong' },
    { passive: 'Stamina_Up_3', name: 'Động Cơ Vĩnh Cửu', tier: 'kimcuong' },
    { passive: 'Vampire', name: 'Ma Cà Rồng', tier: 'kimcuong' },
    { passive: 'SwimSpeed_up_3', name: 'Vua Lướt Sóng', tier: 'kimcuong' },
    { passive: 'PAL_FullStomach_Down_3', name: 'Nhịn Ăn Thành Thạo', tier: 'kimcuong' },
    { passive: 'PAL_Sanity_Down_3', name: 'Bất Động Minh Vương Tâm', tier: 'kimcuong' },
].map((x) => ({ ...x, itemId: IMPLANT_PREFIX + x.passive }));

// Item khác bán theo số lượng
// ⚠️ ID nội bộ của "Ancient Civilization Core" là AncientParts2 (tra palmods.gg/paldb) —
// KHÔNG phải AncientCivilizationCore. ID sai thì mod vẫn báo OK nhưng game không give gì.
const CORE_ITEM_ID = 'AncientParts2';
const GOLD_ITEM_ID = 'Money'; // Gold Coin trong game

function findImplant(passiveId) {
    return IMPLANTS.find((x) => x.passive === passiveId) || null;
}

module.exports = { IMPLANTS, findImplant, CORE_ITEM_ID, GOLD_ITEM_ID, IMPLANT_PREFIX };
