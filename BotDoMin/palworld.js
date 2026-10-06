// Palworld ĐÃ TẮT (server chuyển sang Thiên Long Bát Bộ NetCo4, xem tlbb.js).
//
// File chỉ còn là lớp chuyển tiếp: index.js gọi pal.giveItem / pal.countItem cho shop item, quà mỗi ngày,
// Rương Ích Kỷ - cả hai đi thẳng sang tlbb.js (hàng đợi quà Thiên Long).
// 06/10 dọn Palworld đợt 1: bỏ các hàm cũ không ai gọi (getOnlinePlayers, givePal, rescuePlayer, whereIs, link…).
// Đợt 2 sẽ đổi index.js gọi thẳng tlbb rồi xoá hẳn file này.
const tlbb = require('./tlbb');

module.exports = {
    giveItem: (name, itemId, qty) => tlbb.giveItem(name, itemId, qty),
    countItem: (name) => tlbb.countItem(name),
};
