// Palworld ĐÃ TẮT (server chuyển sang Thiên Long Bát Bộ NetCo4, xem tlbb.js).
//
// File giữ lại để index.js vẫn require được. Mọi hàm báo lỗi "đã tắt": các luồng cũ
// (shop implant, quay/mua pal, chuyển pal vào game, đổi vàng) đều kiểm tra online /
// gọi dashboard TRƯỚC khi trừ tiền, nên bấm vào chỉ nhận thông báo, không mất KNB.
// Chuỗi 'player not found' để các chỗ phân loại lỗi coi là "chắc chắn chưa giao" => hoàn tiền.
const OFF = 'Tinh nang Palworld da tat (player not found)';
const fail = async () => { throw new Error(OFF); };

function cleanName(name) {
    return String(name == null ? '' : name).replace(/[^\x20-\x7E]/g, '').trim();
}

module.exports = {
    getOnlinePlayers: async () => [],
    findOnlineBySteamId: async () => null,
    giveItem: fail,
    givePal: fail,
    rescuePlayer: fail,
    whereIs: fail,
    countItem: async () => ({ ok: false, message: OFF }),
    countItemAll: async () => ({ ok: false, message: OFF }),
    takeItem: fail,
    getLink: async () => null,
    saveLink: fail,
    listLinks: async () => [],
    deleteLink: fail,
    cleanName,
    DASHBOARD_URL: '',
    DISABLED: true,
};
