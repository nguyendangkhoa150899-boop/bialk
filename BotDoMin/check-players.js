// Script kiểm tra nhanh: in ra nguyên JSON danh sách người chơi đang online từ REST API.
// Chạy: node check-players.js
// Mục đích: xem tên field thật (steamId? userId? playerId?) trước khi ráp logic chính thức.
require('dotenv').config();
const { getOnlinePlayers } = require('./palworldBridge');

(async () => {
    try {
        const players = await getOnlinePlayers();
        console.log(JSON.stringify(players, null, 2));
    } catch (e) {
        console.error('LỖI:', e.message);
    }
})();
