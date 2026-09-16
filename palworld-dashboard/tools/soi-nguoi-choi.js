// Soi 1 người chơi: ví, tổng ăn/thua từng game (tính từ trước tới giờ), sổ Dogcoin của riêng họ.
const db = require(process.cwd()+'/database.json');
const q = (process.argv[2] || '').toLowerCase();
if (!q) { console.log('Dùng: node soi.js <tên hoặc ID>'); process.exit(1); }
const ids = Object.keys(db).filter(k => k[0] !== '_' && db[k] && typeof db[k] === 'object')
    .filter(k => k === q || String(db[k].name || '').toLowerCase().includes(q)
        || String(db[k].ingameName || '').toLowerCase().includes(q));
if (!ids.length) { console.log('Không thấy ai tên/ID khớp "' + q + '"'); process.exit(0); }
const vnd = n => Number(n || 0).toLocaleString('vi-VN');
for (const id of ids) {
    const u = db[id], s = (db._pstats || {})[id] || {};
    console.log('\n===== ' + (u.name || id) + '  (ID ' + id + ')');
    console.log('  Ví hiện tại   : ' + vnd(u.points) + ' Dogcoin');
    console.log('  Tên trong game: ' + (u.ingameName || '(chưa liên kết)'));
    console.log('  --- TỔNG TỪ TRƯỚC TỚI GIỜ (net, âm = thua) ---');
    console.log('   Tài Xỉu   : ' + vnd(s.tx));
    console.log('   Dò Mìn    : ' + vnd(s.mines));
    console.log('   Leo Thang : ' + vnd(s.stairs));
    console.log('   Nổ hũ     : ' + vnd(s.jpTotal) + ' (' + (s.jpCount || 0) + ' lần)');
    console.log('   Admin cộng: ' + vnd(s.adminIn));
    console.log('   Chuyển đi  : ' + vnd(s.sentOut) + '  ·  Nhận về: ' + vnd(s.recvIn));
    console.log('   Vào game   : ' + vnd(s.toGame) + '  ·  Ra Discord: ' + vnd(s.fromGame));
    const led = (db._dogLedger || []).filter(r => r.userId === id);
    console.log('  --- SỔ DOGCOIN của người này (' + led.length + ' dòng còn lưu) ---');
    led.slice(0, 40).forEach(r => console.log('   ' + r.time + '  ' + (r.amount > 0 ? '+' : '') + vnd(r.amount)
        + '  [' + r.type + ']  còn ' + vnd(r.balance) + '  ' + (r.note || '')));
}
