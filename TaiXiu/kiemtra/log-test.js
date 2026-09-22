// ============================================================================
//  Bộ kiểm 📜 LOG (22/09) — chạy: node TaiXiu/kiemtra/log-test.js  (không cần bot)
//
//  Chủ server: · "log tài xỉu mình chỉ quan tâm ván đó người nào đặt nhiêu ăn thua nhiêu kết quả"
//              · "làm thêm 1 siêu tài xỉu log nữa rồi tách log ra"
//              · "💰 Sổ Dogcoin chỉ lưu chuyển nạp rút dogcoin admin thêm dogcoin thôi,
//                 ngoài ra không lưu log gì của mấy mini game hết"
// ============================================================================
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const IDX = fs.readFileSync(path.join(R, 'BotDoMin', 'index.js'), 'utf8');
const PANEL = fs.readFileSync(path.join(R, 'BotDoMin', 'panel.js'), 'utf8');
const { taoBan } = require(path.join(R, 'SieuTaiXiu', 'ban.js'));

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');
const cat = (S, tu, den) => { const i = S.indexOf(tu), j = S.indexOf(den, i); if (i < 0 || j < 0) throw new Error('không cắt được ' + tu); return S.slice(i, j); };

// ---------------------------------------------------------------- 💰 SỔ DOGCOIN
muc('💰 Sổ Dogcoin: chỉ chuyển / nạp / rút / admin - chạy thật logDog');
{
    const code = cat(IDX, 'const DOG_LEDGER_BO_QUA = new Set(', '// ===== THỐNG KÊ TÍCH LŨY THEO NGƯỜI CHƠI');
    const c = { dbCache: {}, getUserData: () => ({ points: 7 }), statAdd: () => { }, Date, Array, Set, Number, Math, console };
    vm.createContext(c); vm.runInContext(code, c);
    // const ở đầu script vm không thành thuộc tính context -> hỏi thẳng trong context
    ok('cắt được logDog + danh sách loại bị chặn', typeof c.logDog === 'function' && vm.runInContext('DOG_LEDGER_BO_QUA instanceof Set', c) === true);
    const ghi = (t) => { c.dbCache._dogLedger = []; c.logDog(t, 'u1', 'U1', 1000, 'x'); return (c.dbCache._dogLedger || []).length; };
    for (const t of ['transfer', 'to-game', 'from-game', 'admin+', 'admin-']) ok('⭐ ' + t + ' -> GHI', ghi(t) === 1);
    for (const t of ['shop', 'vay', 'trano', 'refund']) ok(t + ' (không phải mini game) -> ghi', ghi(t) === 1);
    for (const t of ['bet', 'jackpot', 'cophieu', 'tienlen', 'sieutx']) ok('⭐ ' + t + ' (mini game) -> KHÔNG ghi', ghi(t) === 0);
    ok('⭐ getDogLedger lọc luôn dòng CŨ trong DB', /getDogLedger: \(\) => \(dbCache\._dogLedger \|\| \[\]\)\.filter\(r => r && !DOG_LEDGER_BO_QUA\.has\(r\.type\)\)/.test(IDX));
    ok('3 khoản hoàn cược mini game (trò đã gỡ / Phi Thuyền ×2) đổi nhãn "bet" để bị chặn theo',
        /logDog\('bet', uid, getUserData\(uid\)\.name \|\| uid, a, `hoàn cược \$\{nhan\} \(trò đã gỡ\)`\)/.test(IDX) &&
        /logDog\('bet', uid, b\.name \|\| uid, b\.amount, `Huỷ đặt cược trước Phi Thuyền/.test(IDX) &&
        /logDog\('bet', uid, \(getUserData\(uid\)\.name\) \|\| uid, b\.amount, `hoàn cược Phi Thuyền \(bot restart giữa vòng\)`\)/.test(IDX));
    ok('...hoàn RÚT / hoàn đơn pal vẫn là refund (vẫn ghi)', /logDog\('refund', userId, u\.name \|\| userId, amount, `hoàn rút web/.test(IDX) && /logDog\('refund', req\.userId, req\.username, deducted, `admin từ chối đơn/.test(IDX));
    ok('panel: ghi chú Sổ Dogcoin nói rõ không ghi mini game', /Không<\/b> ghi bất cứ gì của mini game/.test(PANEL) && /'vay':'🏦 Vay', 'trano':'💳 Trả nợ'/.test(PANEL));
}

// ---------------------------------------------------------------- 📜 LOG FILE TÀI XỈU
muc('📜 log file Tài Xỉu: một dòng mỗi ván, ai đặt nhiêu ăn thua nhiêu');
{
    ok('bỏ log từng phiếu đặt / xoá / huỷ ô / dời cửa', !/\[WEB CƯỢC TX\]/.test(IDX) && !/XOÁ CƯỢC ván #/.test(IDX) && !/\[WEB TX\] \$\{ten\} dời/.test(IDX) && !/\[WEB TX\] \$\{u\.name \|\| userId\} huỷ cược ô/.test(IDX));
    ok('bỏ dòng "khoá sổ - sáng N ô nhân"', !/khoá sổ - sáng \$\{soO\} ô nhân/.test(IDX));
    ok('bỏ 2 dòng cũ [KẾT QUẢ BIG SMALL] + [CƯỢC BIG SMALL]', !/\[KẾT QUẢ BIG SMALL\]/.test(IDX) && !/\[CƯỢC BIG SMALL\]/.test(IDX));
    // chạy thật đoạn dựng dòng kết quả với kế hoạch giả
    const doan = cat(IDX, '    const dongNguoi = Object.values(p.byUser || {}).map(e => {', "        + (dongNguoi.length ? ' · ' + dongNguoi.join(' · ') : ' · không ai đặt'));") + "        + (dongNguoi.length ? ' · ' + dongNguoi.join(' · ') : ' · không ai đặt'));";
    const ghi = []; const c = { p: { byUser: { a: { name: 'Khoa', stake: 50000, win: 60000, refund: 0 }, b: { name: 'Nam', stake: 20000, win: 0, refund: 6000 } } }, gameId: 77, d1: 3, d2: 4, d3: 5, sum: 12, isStorm: false, isTai: true, isChan: true, writeLog: (k, m) => ghi.push([k, m]), Object, Number };
    // bọc trong { } để chạy 2 lần cùng context không đụng "const dongNguoi" đã khai báo
    vm.createContext(c); vm.runInContext('{' + doan + '}', c);
    ok('⭐ ghi vào RESULT, một dòng, có kết quả', ghi.length === 1 && ghi[0][0] === 'RESULT' && /Ván #77: 3-4-5 \(Tổng 12 \| TÀI \| CHẴN\)/.test(ghi[0][1]), JSON.stringify(ghi));
    ok('⭐ ...kể từng người: Khoa đặt 50.000 → +10.000 · Nam đặt 20.000 → −14.000 (hoàn 30%)', /Khoa đặt 50\.000 → \+10\.000/.test(ghi[0][1]) && /Nam đặt 20\.000 → -14\.000/.test(ghi[0][1]), ghi[0][1]);
    ghi.length = 0; c.p = { byUser: {} }; vm.runInContext('{' + doan + '}', c);
    ok('ván trống: "không ai đặt"', /không ai đặt/.test(ghi[0][1]));
}

// ---------------------------------------------------------------- ⚡ LOG SIÊU TÁCH RIÊNG
muc('⚡ Siêu Tài Xỉu: log tách loại + dòng kết quả kể đủ người');
{
    const doan = cat(IDX, '    ghiLog: (dong) => {', '    luuDb: () => saveDbNow(),');
    const ghi = []; const c = { writeLog: (k, m) => ghi.push([k, m]) };
    vm.createContext(c); vm.runInContext('var o = {' + doan + '}; ghiLog = o.ghiLog;', c);
    const thu = (m) => { ghi.length = 0; c.ghiLog(m); return ghi.length ? ghi[0][0] : null; };
    ok('⭐ từng phiếu cược -> KHÔNG ghi', thu('[SIÊU TX CƯỢC] A đặt 1.000 (+phí 200) vào 1 cửa (ván #5)') === null);
    ok('...xoá cược / huỷ ô / dời cửa / khoá sổ -> KHÔNG ghi',
        thu('[SIÊU TX] A xoá cược ván #5, hoàn 1.200 (gồm phí)') === null && thu('[SIÊU TX] A huỷ cược ô TÀI 11-17 ván #5, hoàn 1.200 (gồm phí)') === null &&
        thu('[SIÊU TX] A dời 1.000 từ TÀI 11-17 sang XỈU 4-10 (ván #5)') === null && thu('[SIÊU TX] Ván #5 khoá sổ - sáng 7 ô nhân') === null);
    ok('⭐ kết quả ván -> RESULT', thu('[SIÊU TX KẾT QUẢ] Ván #5: 3-4-5 (Tổng 12 | TÀI | CHẴN) · A đặt 1.000 (+phí 200) → +800') === 'RESULT');
    ok('lỗi / dọn sổ / lỡ mốc / bật lại -> SYSTEM', thu('[LỖI TRẢ TIỀN SIÊU TX] ván #5') === 'SYSTEM' && thu('[DỌN SỔ SIÊU TX] x') === 'SYSTEM' && thu('[SIÊU TX] Ván #5 lỡ mốc, đã hoàn 2 phiếu') === 'SYSTEM' && thu('[SIÊU TX] Bật lại: hoàn 1 phiếu (1.200 gồm phí)') === 'SYSTEM');
    ok('thao tác admin (ép, đổi nhịp, trần, thang, bật tắt) -> ADMIN', thu('[SIÊU TX] Admin ép hệ số nhân (ván #5): TÀI x14') === 'ADMIN' && thu('[SIÊU TX] Đổi nhịp ván: 30s đặt + 4s nhân + 10s nặn = ván 44s') === 'ADMIN' && thu('[SIÊU TX] TẮT bàn') === 'ADMIN');
    // chạy máy bàn thật: 2 người, xem dòng kết quả
    const DB = { _stxOn: true }; const VI = { A: 1e7, B: 1e7 }; const so = [];
    const ban = taoBan({ db: () => DB, layNguoi: (id) => ({ points: VI[id] || 0, name: id }), congVi: (id, t) => { VI[id] = (VI[id] || 0) + t; }, ghiLog: (d) => so.push(d), luuDb: () => { } });
    ban.khoiDong(); const S = ban._S; const t = ban.adminXem().time; const now = () => Math.floor(Date.now() / 1000);
    S.status = 'betting'; S.targetTime = now() + t.bet + t.nhan + t.nan;
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]); ban.dat('B', 'B', [{ choice: 'xiu', amount: 5000 }]);
    S.targetTime = now() + t.nan + t.nhan; ban.nhip(); S.nhan.o = {}; ban.epKetQua(6, 5, 1);
    S.targetTime = now() + t.nan; ban.nhip(); S.targetTime = now() - 1; ban.nhip();
    const kq = so.find(d => /\[SIÊU TX KẾT QUẢ\]/.test(d)) || '';
    ok('⭐⭐ máy bàn thật ra 6-5-1: dòng kết quả kể "A đặt 10.000 (+phí 2.000) → +8.000" và "B đặt 5.000 (+phí 1.000) → -6.000"',
        /A đặt 10\.000 \(\+phí 2\.000\) → \+8\.000/.test(kq) && /B đặt 5\.000 \(\+phí 1\.000\) → -6\.000/.test(kq), kq);
    ok('...ví thật khớp dòng log: A +8.000, B −6.000', VI.A === 1e7 + 8000 && VI.B === 1e7 - 6000, JSON.stringify(VI));
}

// ---------------------------------------------------------------- 🖥️ PANEL tab 📜 LOG
muc('🖥️ panel: mục ⚡ Siêu riêng + dòng ván gộp theo người');
{
    ok('có nút ⚡ Siêu Tài Xỉu và khung logSec-stx / #stxHist', /data-log="stx" onclick="logPick\('stx'\)">⚡ Siêu Tài Xỉu/.test(PANEL) && /id="logSec-stx"/.test(PANEL) && /id="stxHist"/.test(PANEL));
    ok('state gửi stxHistory từ bangDiscord(30) (30 ván có cược, đúng nguồn bảng Discord)', /stxHistory: \(ctx\.stx && ctx\.stx\.bangDiscord\) \? \(ctx\.stx\.bangDiscord\(30\)\.history \|\| \[\]\) : \[\]/.test(PANEL));
    ok('bỏ cách vẽ cũ "📝 bets · 🏆 winners"', !/'<div class="b">📝 '\+bets\+'<\/div>'/.test(PANEL));
    // chạy thật veVanLog với DOM giả
    const code = cat(PANEL, '  const TENCUA=(STATE.stx&&STATE.stx.tenCua)||{};', '  const tx=(STATE.txHistory||[]).slice(0,30);');
    const c = { STATE: { stx: { tenCua: { don3: 'Đơn 3' } } }, esc: (s) => String(s), fmtAmt: (n) => (n > 0 ? '+' : '') + Number(n).toLocaleString(), padId: (n) => String(n).padStart(5, '0'), Object, Number, Math };
    vm.createContext(c); vm.runInContext(code + '\nthis.veVanLog=veVanLog;', c);
    const van = { gameId: 12, dice: [3, 3, 1], sum: 7, tx: 'XỈU', cl: 'LẺ', time: '10:00', nhan: { don3: 19 },
        bets: [{ u: 'a', name: 'Khoa', choice: 'Đơn 3', amount: 1000, nhan: 20000 }, { u: 'a', name: 'Khoa', choice: 'TÀI 11-17', amount: 5000, nhan: 0 }, { u: 'b', name: 'Nam', choice: 'XỈU 4-10', amount: 2000, phi: 400, nhan: 4000 }] };
    const html = c.veVanLog(van);
    ok('⭐ dòng ván: kết quả + ⚡ x19 Đơn 3 (tên cửa, không in id)', /Ván #00012 · 🎲 3-3-1 \(Tổng 7\) · XỈU \| LẺ · ⚡ x19 Đơn 3/.test(html), html.slice(0, 200));
    ok('⭐ Khoa: đặt 6.000 → nhận 20.000 · +14.000 (gộp 2 ô)', /Khoa<\/b> đặt 6[.,]000 → nhận 20[.,]000 · <b>\+14[.,]000<\/b>/.test(html), html);
    ok('⭐ Nam (Siêu, có phí): đặt 2.000 (+phí 400) → nhận 4.000 · +1.600', /Nam<\/b> đặt 2[.,]000 \(\+phí 400\) → nhận 4[.,]000 · <b>\+1[.,]600<\/b>/.test(html), html);
    ok('kể từng ô đã đặt dưới dòng người', /Đơn 3 1[.,]000, TÀI 11-17 5[.,]000/.test(html));
    const cu = c.veVanLog({ gameId: 1, dice: [1, 2, 3], sum: 6, tx: 'XỈU', cl: 'CHẴN', bets: [{ u: 'a', name: 'Cũ', choice: 'XỈU', amount: 1000 }], winners: [{ u: 'a', name: 'Cũ', amount: 2000 }] });
    ok('ván CŨ (chưa có b.nhan) lấy nhận từ winners: +1.000', /Cũ<\/b> đặt 1[.,]000 → nhận 2[.,]000 · <b>\+1[.,]000<\/b>/.test(cu), cu);
    ok('ván trống: "không ai đặt"', /không ai đặt/.test(c.veVanLog({ gameId: 2, dice: [1, 1, 1], sum: 3, tx: 'BÃO', storm: true, bets: [] })));
}

console.log('\n📜 LOG 2 BÀN + SỔ DOGCOIN: ' + P + ' đạt, ' + F + ' hỏng');
if (F) process.exitCode = 1;
