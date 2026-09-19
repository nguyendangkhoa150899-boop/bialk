// ============================================================================
//  index.js — VỎ CHẠY THỬ TẠI MÁY (DEV). **PROD KHÔNG CHẠY FILE NÀY.**
//  Prod là mô-đun web.js nhúng trong BotDoMin; file này chỉ để chủ server mở trình
//  duyệt bấm thử luật bài + giao diện mà không cần bot, không cần Discord, không
//  cần database thật. Ví ở đây là ví GIẢ trong RAM, tắt là mất.
//
//  Chạy:
//      node TienLen/index.js              -> 4 người thật, tự mở 4 cửa sổ
//      node TienLen/index.js --bot 1      -> 1 máy đánh cùng (chơi 1 mình vẫn test được)
//      node TienLen/index.js --bot 3 --cuoc 10000 --chedo anhet
//
//  Vào trang là thấy SẢNH. Máy đánh (nếu có) ngồi sẵn ở phòng đầu tiên.
//
//  Rồi mở: http://127.0.0.1:4100/?u=A   (và ?u=B, ?u=C, ?u=D ở cửa sổ ẩn danh khác)
// ============================================================================
'use strict';
const http = require('http');
const fs = require('fs');
const nodePath = require('path');
const B = require('./bai.js');
const { taoSanh } = require('./web.js');

const args = process.argv.slice(2);
const lay = (ten, mm) => { const i = args.indexOf('--' + ten); return i >= 0 && args[i + 1] ? args[i + 1] : mm; };
const CONG = Number(lay('cong', 4100));
const SO_BOT = Math.max(0, Math.min(3, Number(lay('bot', 0))));
const CHE_DO = lay('chedo', 'hang');
const MUC_CUOC = Number(lay('cuoc', CHE_DO === 'anhet' ? 1000 : 10000));

// ---- ví giả: A/B/C/D là người, M1..M3 là máy ----
const NGUOI = { A: 'An', B: 'Bình', C: 'Cường', D: 'Dũng', M1: 'Máy 1', M2: 'Máy 2', M3: 'Máy 3' };
const db = {};
for (const id of Object.keys(NGUOI)) db[id] = { name: NGUOI[id], points: 1000000, ingameName: NGUOI[id] };

const tienlen = taoSanh({
    layNguoi: (id) => db[id] || null,
    congVi: (id, tien) => { db[id].points += tien; },
    thuPhe: (t, ly) => console.log('  💰 nhà cái thu', t.toLocaleString('vi-VN'), '-', ly),
    laAdmin: () => true,                       // dev: ai cũng là admin cho dễ thử
    tenCua: (id) => (db[id] || {}).name || id,
    ghiLog: (d) => console.log('  ' + d),
    giayAfk: 999999,                           // dev: đừng đá ai ra vì "rớt mạng"
}, [{ cheDo: CHE_DO, mucCuoc: MUC_CUOC }, { cheDo: CHE_DO === 'hang' ? 'anhet' : 'hang', mucCuoc: CHE_DO === 'hang' ? 1000 : 10000 }]);
/** Phòng máy đánh ngồi = phòng đầu sảnh (phòng dựng theo --chedo / --cuoc). */
const phongMay = () => tienlen.phong[0];

// ---------------------------------------------------------------- máy đánh giùm (chỉ dev)
/** Tìm một nước đánh được từ tay bài. Trả mảng lá, hoặc null nếu phải bỏ lượt. */
function nuocMay(tay, boTruoc) {
    const thu = (mo) => { const bo = B.nhanDang(mo); return bo && B.danhDuoc(bo, boTruoc).ok ? mo : null; };
    const theoSo = {};
    for (const la of tay) { const so = B.doc(la).so; (theoSo[so] = theoSo[so] || []).push(la); }
    const hang = Object.keys(theoSo).map(x => B.HANG_SO[x]).sort((a, b) => a - b);
    const ra = [];
    for (const so of Object.keys(theoSo)) {
        const g = B.xepBai(theoSo[so]);
        for (const l of g) ra.push([l]);
        if (g.length >= 2) ra.push(g.slice(0, 2));
        if (g.length >= 3) ra.push(g.slice(0, 3));
        if (g.length >= 4) ra.push(g.slice(0, 4));
    }
    const khongHeo = hang.filter(h => B.SO[h] !== '2');
    for (let i = 0; i < khongHeo.length; i++) {
        const day = [khongHeo[i]];
        for (let j = i + 1; j < khongHeo.length && khongHeo[j] === khongHeo[j - 1] + 1; j++) day.push(khongHeo[j]);
        for (let k = 3; k <= day.length; k++) ra.push(day.slice(0, k).map(h => B.xepBai(theoSo[B.SO[h]])[0]));
    }
    const coDoi = khongHeo.filter(h => theoSo[B.SO[h]].length >= 2);
    for (let i = 0; i < coDoi.length; i++) {
        const day = [coDoi[i]];
        for (let j = i + 1; j < coDoi.length && coDoi[j] === coDoi[j - 1] + 1; j++) day.push(coDoi[j]);
        for (let k = 3; k <= day.length; k++) {
            let mo = [];
            for (let q = 0; q < k; q++) mo = mo.concat(B.xepBai(theoSo[B.SO[day[q]]]).slice(0, 2));
            ra.push(mo);
        }
    }
    const duoc = ra.map(thu).filter(Boolean)
        .sort((a, b) => a.length - b.length || B.tri(B.xepBai(a).slice(-1)[0]) - B.tri(B.xepBai(b).slice(-1)[0]));
    return duoc[0] || null;
}
let botBan = 0;
function botDanh() {
    const p = phongMay();
    const ban = p && p.may.phong.ban;
    if (!ban || Date.now() < botBan) return;
    const s = ban.xemChung();
    if (s.trangThai !== 'DANG_CHAY' || !s.van || !s.van.luot) return;
    const id = s.van.luot;
    if (!/^M\d$/.test(id)) return;                       // chỉ đánh giùm ghế máy
    botBan = Date.now() + 900;                            // chậm 0,9 giây cho người kịp nhìn
    try {
        const tay = ban._trong.van.tay[id] || [];
        const nuoc = nuocMay(tay, ban._trong.van.bo);
        if (nuoc) ban.danh(id, nuoc); else ban.boLuot(id);
        // ⚠️ máy đánh THẲNG vào máy ván, KHÔNG đi qua xuLy() nên không tự kích thanh toán.
        // Gọi nhịp ngay để ván do máy kết thúc cũng trả tiền liền, không phải đợi tới nhịp sau.
        phongMay().may.nhip();
    } catch (e) { console.log('  🤖 máy lỗi:', e.message); }
}

// ---------------------------------------------------------------- máy chủ
const traJson = (res, ma, obj) => {
    res.writeHead(ma, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
};
const may = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const duong = u.pathname;

    // trang: nhét sẵn play_token = ?u=... để khỏi làm màn đăng nhập riêng cho bản dev
    if (req.method === 'GET' && (duong === '/' || duong === '/tienlen/' || duong === '/tienlen')) {
        const ai = (u.searchParams.get('u') || 'A').toUpperCase();
        if (!db[ai]) return traJson(res, 400, { ok: false, error: 'Không có người ' + ai });
        return fs.readFile(nodePath.join(__dirname, 'trang.html'), 'utf8', (e, t) => {
            if (e) return traJson(res, 500, { ok: false, error: String(e) });
            const nhet = '<script>localStorage.setItem("play_token","' + ai + '");</script>\n';
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(nhet + t);
        });
    }
    // 🪙 icon Dogcoin — prod web cược phục vụ sẵn ở /dogcoin.png; bản chạy thử phải tự lấy
    // từ BotDoMin/assets, không thì mọi con số tiền hiện ảnh vỡ.
    if (req.method === 'GET' && duong === '/dogcoin.png') {
        return fs.readFile(nodePath.join(__dirname, '..', 'BotDoMin', 'assets', 'dogcoin.png'), (e, b) => {
            if (e) return traJson(res, 404, { ok: false, error: 'Không có icon Dogcoin' });
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
            res.end(b);
        });
    }
    // ảnh lá bài lấy từ thư mục của Poker (dùng chung)
    if (req.method === 'GET' && /^\/(tienlen\/)?bai\/[A-Za-z0-9]{1,4}\.webp$/.test(duong)) {
        const ten = duong.slice(duong.lastIndexOf('/') + 1);
        return fs.readFile(nodePath.join(__dirname, '..', 'Poker', 'bai', ten), (e, b) => {
            if (e) return traJson(res, 404, { ok: false, error: 'Không có lá này' });
            res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=60' });
            res.end(b);
        });
    }
    if (duong.startsWith('/api/tienlen/')) {
        // DEV: token CHÍNH LÀ id người chơi, không có mật khẩu. Đừng bao giờ bê kiểu này lên prod.
        const toi = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        if (!db[toi]) return traJson(res, 401, { ok: false, error: 'Mở trang bằng ?u=A (hoặc B/C/D)' });
        let than = '';
        req.on('data', c => than += c);
        req.on('end', () => {
            let body = {};
            try { body = than ? JSON.parse(than) : {}; } catch (e) { }
            tienlen.xuLy({ path: duong.slice('/api/tienlen'.length), method: req.method, body, userId: toi }, res, traJson);
        });
        return;
    }
    return traJson(res, 404, { ok: false, error: 'Đường lạ: ' + duong });
});

setInterval(() => { tienlen.nhip(); botDanh(); }, 400);

if (require.main === module) {
    // cho máy ngồi sẵn + bấm sẵn sàng luôn, người vào là đủ bàn
    const maMay = phongMay().ma;
    for (let i = 1; i <= SO_BOT; i++) {
        const id = 'M' + i;
        tienlen.xuLy({ path: '/' + maMay + '/ngoi', method: 'POST', body: { ghe: 4 - i }, userId: id }, null, () => { });
        tienlen.xuLy({ path: '/' + maMay + '/sansang', method: 'POST', body: {}, userId: id }, null, () => { });
    }
    may.listen(CONG, () => {
        console.log('\n🀄 TIẾN LÊN — bản CHẠY THỬ TẠI MÁY (ví giả, không đụng Dogcoin thật)');
        console.log('   Ví mỗi người 1.000.000 · ' + SO_BOT + ' máy đánh cùng (ngồi phòng ' + maMay + ')');
        console.log('   Sảnh đang có:');
        for (const p of tienlen.phong) {
            const c = p.may.phong.cauHinh;
            console.log('     ' + p.ma + '  ' + (c.cheDo === 'hang' ? 'Truyền thống 1-2-3-4' : 'Đếm lá').padEnd(22) +
                ' cược ' + c.mucCuoc.toLocaleString('vi-VN').padStart(8) +
                ' · vốn tối thiểu ' + p.may.trangThai('A').vonToiThieu.toLocaleString('vi-VN'));
        }
        console.log('\n   Mở các đường này (mỗi người MỘT cửa sổ ẩn danh riêng):');
        for (const id of ['A', 'B', 'C', 'D'].slice(0, 4 - SO_BOT))
            console.log('     http://127.0.0.1:' + CONG + '/?u=' + id + '   (' + NGUOI[id] + ')');
        console.log('\n   Chọn phòng ở sảnh (hoặc ➕ TẠO PHÒNG MỚI) → bấm ✅ SẴN SÀNG.');
        console.log('   Đủ 2 người sẵn sàng là bài chia liền. Ctrl+C để tắt.\n');
    });
}
module.exports = { may, tienlen, db, nuocMay };
