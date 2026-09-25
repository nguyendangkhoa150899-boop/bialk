// Bộ kiểm TIỀN TRẢ RA trên bot test đang chạy, chạy: node TaiXiu/kiemtra/tratien-test.js
//
// Đây là phép đo quan trọng nhất: đặt thật, ÉP xúc xắc ra kết quả biết trước, đọc
// bảng nhân máy chủ công bố, rồi TỰ TÍNH TAY xem ví phải tăng bao nhiêu và đối chiếu.
// Sai ở đây nghĩa là người chơi bị trả thiếu/thừa tiền thật.
'use strict';
const http = require('http');
const C = require('../cua.js');
const WEB = 4002, PANEL = 4508;
const UID = '111111111111111111', PIN = '123456';

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const ngu = (ms) => new Promise(r => setTimeout(r, ms));
const vnd = (n) => Math.floor(n).toLocaleString('vi-VN');

// Luật riêng của server này, NẰM NGOÀI cua.js: ra bão mà đặt đúng bên Tài/Xỉu/Chẵn/Lẻ
// thì hoàn 30% thay vì mất trắng (sòng thật cho thua sạch). index.js cộng khoản này.
const HOAN_BAO = 0.3;
function tinhTayCaGio(gio, xx, nhan) {
    const bao = xx[0] === xx[1] && xx[1] === xx[2];
    const tong = xx[0] + xx[1] + xx[2];
    const benTX = tong >= 11 ? 'tai' : 'xiu';
    const benCL = tong % 2 === 0 ? 'chan' : 'le';
    let t = 0;
    for (const g of gio) {
        const an = C.tinhTra(g.choice, g.amount, xx, nhan);
        if (an > 0) { t += an; continue; }
        if (bao && (g.choice === benTX || g.choice === benCL)) t += Math.floor(g.amount * HOAN_BAO);
    }
    return t;
}

function goi(port, duong, than, token) {
    return new Promise((xong) => {
        const d = than ? JSON.stringify(than) : null;
        const r = http.request({
            host: '127.0.0.1', port, path: duong, method: d ? 'POST' : 'GET', timeout: 8000,
            headers: Object.assign({ 'Content-Type': 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {}, d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
        }, (rs) => { let b = ''; rs.on('data', c => b += c); rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } xong({ ma: rs.statusCode, j, tho: b }); }); });
        r.on('timeout', () => { r.destroy(); xong({ ma: 0, j: null }); });
        r.on('error', () => xong({ ma: 0, j: null }));
        if (d) r.write(d); r.end();
    });
}

/** Chạy MỘT ván: đặt giỏ, ép xúc xắc, chờ chốt, trả về { truoc, sau, nhan, xx } */
async function motVan(T, PT, gio, xx) {
    let s = null;
    for (let i = 0; i < 400; i++) {
        s = (await goi(WEB, '/api/state', {}, T)).j;
        if (s && s.phase === 'bet') break;
        await ngu(200);
    }
    if (!s || s.phase !== 'bet') throw new Error('không bắt được pha đặt cược');
    await goi(PANEL, '/api/tx/force', { values: xx.join(',') }, PT);
    const truoc = s.balance;
    const r = await goi(WEB, '/api/bet', { gio }, T);
    if (!r.j || !r.j.ok) throw new Error('đặt hỏng: ' + (r.j && r.j.error));
    const sauDat = r.j.balance;

    // chờ pha hiện nhân để chộp bảng nhân máy chủ công bố
    let nhan = null;
    for (let i = 0; i < 400; i++) {
        const q = (await goi(WEB, '/api/state', {}, T)).j;
        if (q && q.phase === 'nhan') { nhan = q.txNhan || {}; break; }
        if (q && (q.phase === 'nan' || q.phase === 'wait')) { nhan = q.txNhan || {}; break; }
        await ngu(150);
    }
    // chờ chốt ván (ví ngừng đổi + quay lại pha đặt)
    let sau = sauDat;
    for (let i = 0; i < 500; i++) {
        const q = (await goi(WEB, '/api/state', {}, T)).j;
        if (q) sau = q.balance;
        if (q && q.phase === 'bet' && q.history && q.history.length && sau !== sauDat) break;
        if (q && q.phase === 'bet' && i > 60) break;
        await ngu(200);
    }
    return { truoc, sauDat, sau, nhan: nhan || {}, xx };
}

(async () => {
    const lg = await goi(WEB, '/api/login', { userId: UID, pin: PIN });
    if (!lg.j || !lg.j.ok) { console.log('❌ Bot test chưa chạy (node Desktop/bialk-test.js 4)'); process.exit(1); }
    const T = lg.j.token;
    const PT = (await goi(PANEL, '/api/login', { password: '' })).j.token;
    await goi(PANEL, '/api/tx/time', { bet: 8, nhan: 2, nan: 3 }, PT);

    // ---------------------------------------------------------------- ván 1: 4-4-4
    console.log('\n== ván ép 4-4-4 (bão 4 · tổng 12 · TÀI · CHẴN) ==');
    {
        const gio = [
            { choice: 'tai', amount: 4000 },     // tổng 12 nhưng là BÃO -> THUA sạch
            { choice: 'bao4', amount: 1000 },    // trúng bão 4
            { choice: 'baoany', amount: 2000 },  // trúng bão bất kỳ
            { choice: 'doi4', amount: 2000 },    // 4-4-4 cũng tính đôi 4
            { choice: 'tong12', amount: 2000 },  // tổng 12 -> TRÚNG (ô tổng không thua vì bão)
            { choice: 'don4', amount: 1500 },    // 3 mặt số 4
            { choice: 'don1', amount: 1500 },    // 0 mặt -> thua
        ];
        const r = await motVan(T, PT, gio, [4, 4, 4]);
        const dat = gio.reduce((s, g) => s + g.amount, 0);
        ok('trừ đúng tổng đặt', r.truoc - r.sauDat === dat, vnd(r.truoc - r.sauDat) + ' vs ' + vnd(dat));

        const mong = tinhTayCaGio(gio, [4, 4, 4], r.nhan);   // gồm cả khoản hoàn 30% khi ra bão
        const thuc = r.sau - r.sauDat;
        ok('tiền ăn về khớp từng đồng với tính tay', thuc === mong, 'thực ' + vnd(thuc) + ' vs tính tay ' + vnd(mong));
        console.log('       bảng nhân ván này: ' + (Object.keys(r.nhan).length ? Object.entries(r.nhan).map(([k, v]) => k + ' x' + v).join(' · ') : '(không ô nào sáng)'));
        console.log('       ăn về ' + vnd(thuc) + ' / đặt ' + vnd(dat));
        ok('cửa TÀI không ĂN khi ra bão, chỉ được hoàn 30%',
            C.tinhTra('tai', 4000, [4, 4, 4], r.nhan) === 0 && tinhTayCaGio([{choice:'tai',amount:4000}],[4,4,4],r.nhan) === 1200);
        ok('cửa Bão 4 + Bão bất kỳ + Đôi 4 đều trúng',
            C.tinhTra('bao4', 1000, [4, 4, 4], r.nhan) > 0 &&
            C.tinhTra('baoany', 2000, [4, 4, 4], r.nhan) > 0 &&
            C.tinhTra('doi4', 2000, [4, 4, 4], r.nhan) > 0);
    }

    // ---------------------------------------------------------------- ván 2: 1-2-6
    console.log('\n== ván ép 1-2-6 (tổng 9 · XỈU · LẺ · không bão) ==');
    {
        const gio = [
            { choice: 'xiu', amount: 5000 },     // tổng 9 <= 10 -> trúng 1:1
            { choice: 'le', amount: 5000 },      // 9 lẻ -> trúng 1:1
            { choice: 'tong9', amount: 3000 },   // trúng
            { choice: 'cap12', amount: 2000 },   // có 1 và 2 -> trúng
            { choice: 'cap34', amount: 2000 },   // thua
            { choice: 'don6', amount: 2000 },    // 1 mặt -> 1:1
            { choice: 'bao1', amount: 1000 },    // thua
        ];
        const r = await motVan(T, PT, gio, [1, 2, 6]);
        const dat = gio.reduce((s, g) => s + g.amount, 0);
        const mong = tinhTayCaGio(gio, [1, 2, 6], r.nhan);
        const thuc = r.sau - r.sauDat;
        ok('trừ đúng tổng đặt', r.truoc - r.sauDat === dat, vnd(r.truoc - r.sauDat));
        ok('tiền ăn về khớp từng đồng với tính tay', thuc === mong, 'thực ' + vnd(thuc) + ' vs tính tay ' + vnd(mong));
        console.log('       bảng nhân ván này: ' + (Object.keys(r.nhan).length ? Object.entries(r.nhan).map(([k, v]) => k + ' x' + v).join(' · ') : '(không ô nào sáng)'));
        ok('cửa đều tiền trả đúng 1:1 (không bị nhân)',
            C.tinhTra('xiu', 5000, [1, 2, 6], r.nhan) === 10000 && C.tinhTra('le', 5000, [1, 2, 6], r.nhan) === 10000);
        ok('đơn 6 ra 1 mặt trả đúng 1:1', C.tinhTra('don6', 2000, [1, 2, 6], r.nhan) === 4000);
    }

    await goi(PANEL, '/api/tx/time', { bet: 35, nhan: 4, nan: 15 }, PT);
    await goi(PANEL, '/api/tx/clear', {}, PT);
    console.log('\n💰 TIỀN TRẢ RA: ' + P + ' đạt, ' + F + ' hỏng');
    process.exit(F ? 1 : 0);
})();
