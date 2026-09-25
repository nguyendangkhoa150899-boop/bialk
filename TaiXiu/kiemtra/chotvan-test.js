// Bộ kiểm CHỐT VÁN, chạy: node TaiXiu/kiemtra/chotvan-test.js  (cần bot test đang chạy)
//
// Vì sao có file này, lỗi THẬT đã làm mất tiền người chơi trên bot chính:
//   Đổi sang bàn 52 cửa nhưng khâu ghi log/lịch sử vẫn tra bảng tên 5 CỬA CŨ
//   (TX_CHOICES). Ai đặt ô mới như "Tổng 9" là tra ra undefined -> TypeError ->
//   settleTXPayout vỡ giữa chừng -> lịch sử không ghi (không soi được cầu),
//   vòng ván chết (bàn KẸT ở một số ván), nhánh phục hồi xoá sạch cược.
//   Người chơi đặt xong bỏ sang Discord nhắn tin là mất tiền, không ai trả.
//
// Bộ kiểm này diễn lại ĐÚNG cảnh đó: đặt vào ô của bàn mới rồi IM LẶNG hoàn toàn
// (không nặn, không bấm gì) và đo bằng SỐ DƯ THẬT.
'use strict';
const http = require('http');
const path = require('path');
const CUA = require(path.join(__dirname, '..', 'cua.js'));

const WEB = 4002, PANEL = 4508;
const UID = '111111111111111111', PIN = '123456';

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');
const ngu = (ms) => new Promise(r => setTimeout(r, ms));

function goi(port, duong, than, token) {
    return new Promise((xong) => {
        const d = than ? JSON.stringify(than) : null;
        const r = http.request({
            host: '127.0.0.1', port, path: duong, method: d ? 'POST' : 'GET', timeout: 8000,
            headers: Object.assign({ 'Content-Type': 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {},
                d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
        }, (rs) => {
            let b = '';
            rs.on('data', c => b += c);
            rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } xong({ ma: rs.statusCode, j }); });
        });
        r.on('timeout', () => { r.destroy(); xong({ ma: 0, j: null }); });
        r.on('error', () => xong({ ma: 0, j: null }));
        if (d) r.write(d);
        r.end();
    });
}

(async () => {
    const lg = await goi(WEB, '/api/login', { userId: UID, pin: PIN });
    if (!lg.j || !lg.j.ok) { console.log('❌ Bot test chưa chạy? (bật: node Desktop/bialk-test.js 4)'); process.exit(1); }
    const T = lg.j.token;
    const PT = (await goi(PANEL, '/api/login', { password: '' })).j.token;
    await goi(PANEL, '/api/tx/time', { bet: 12, nhan: 2, nan: 6 }, PT);

    muc('đặt ô của BÀN MỚI rồi bỏ đi (không nặn), ván vẫn phải chốt');
    // chờ sang ĐẦU một ván mới cho đủ giờ đặt
    let s = null, truoc = null;
    for (let i = 0; i < 400; i++) {
        s = (await goi(WEB, '/api/state', {}, T)).j;
        if (truoc !== null && s.gameId !== truoc && s.phase === 'bet') break;
        truoc = s.gameId;
        await ngu(400);
    }
    ok('bắt được đầu pha đặt', s && s.phase === 'bet', s && s.phase);

    await goi(WEB, '/api/tx/xoacuoc', {}, T);
    const van = s.gameId;
    const v0 = (await goi(WEB, '/api/state', {}, T)).j.balance;

    // 6 ô ĐƠN: ván nào cũng trúng ít nhất một ô, nên chắc chắn có tiền phải trả.
    // Toàn ô của bàn mới, đúng loại từng làm vỡ khâu chốt ván.
    const gio = [1, 2, 3, 4, 5, 6].map(n => ({ choice: 'don' + n, amount: 2000 }));
    const dat = await goi(WEB, '/api/bet', { gio }, T);
    ok('đặt được 6 ô Đơn (12.000)', dat.ma === 200 && dat.j.tong === 12000, JSON.stringify(dat.j));

    // IM LẶNG: chỉ hỏi ván đã sang số chưa, TUYỆT ĐỐI không gọi /api/tx/reveal
    let c = null;
    for (let i = 0; i < 150; i++) {
        await ngu(700);
        c = (await goi(WEB, '/api/state', {}, T)).j;
        if (c && c.gameId > van) break;
    }
    ok('BÀN KHÔNG KẸT, đã sang ván mới', c && c.gameId > van, 'vẫn đứng ở ' + (c && c.gameId));

    const h = ((c && c.history) || []).filter(x => x.gameId === van)[0];
    ok('SOI CẦU CÓ ván vừa rồi (lịch sử được ghi)', !!h, 'không thấy ván #' + van);
    if (h) {
        ok('lịch sử ghi đủ 3 viên + tổng', Array.isArray(h.dice) && h.dice.length === 3 && h.sum === h.dice[0] + h.dice[1] + h.dice[2],
            JSON.stringify(h.dice) + ' sum ' + h.sum);
        ok('lịch sử ghi tên cửa của bàn MỚI, không phải undefined',
            (h.bets || []).every(b => b.choice && b.choice !== 'undefined'),
            JSON.stringify((h.bets || []).map(b => b.choice)));

        // tiền: tính tay từ lõi tiền rồi so với ví thật
        const xx = h.dice;
        let phaiTra = 0;
        for (const gg of gio) phaiTra += CUA.tinhTra(gg.choice, gg.amount, xx, null);
        // ván có thể được bốc hệ số nhân, nên tiền thật >= mức tính theo tỉ lệ gốc
        const thuc = c.balance - v0 + 12000;
        ok('ĐƯỢC TRẢ THƯỞNG dù không nặn (không mất trắng)', thuc > 0,
            'nhận về ' + thuc.toLocaleString('vi-VN'));
        ok('nhận về ít nhất bằng mức tỉ lệ gốc (' + phaiTra.toLocaleString('vi-VN') + ')', thuc >= phaiTra,
            thuc + ' vs ' + phaiTra);
        const w = (h.winners || []).filter(x => x.u === UID)[0];
        ok('máy chủ ghi đúng số thắng của mình', !!w && w.amount === thuc,
            (w ? w.amount : 'không có') + ' vs ví ' + thuc);
    }

    await goi(PANEL, '/api/tx/time', { bet: 30, nhan: 4, nan: 20 }, PT);
    console.log('\n🏁 CHỐT VÁN: ' + P + ' đạt, ' + F + ' hỏng');
    process.exit(F ? 1 : 0);
})();
