// ============================================================================
//  RÀ SOÁT TRẢ THƯỜNG × HỆ SỐ NHÂN, 2 bàn (Tài Xỉu thường + Siêu Tài Xỉu)
//  chạy: node TaiXiu/kiemtra/nhan-2ban-test.js   (không cần bot)
//
//  Chủ server 22/09: "rà soát lại 2 bên tài xỉu coi trả thưởng nhân đúng chưa, rà soát thật kỹ".
//  Nguyên tắc: KHÔNG tin lõi. Viết lại luật trả thưởng từ README thành hàm THAM CHIẾU độc lập, so
//  với lõi thật qua đủ 216 kết cục × 52 ô × nhiều bảng nhân, rồi chạy máy bàn thật hàng nghìn ván
//  và cân ví từng đồng. Kèm phần "chữ khớp tiền": ô Đơn 1 viên trả 1:1 thì không được khoe ⚡.
// ============================================================================
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const TX = require(path.join(R, 'TaiXiu', 'cua.js'));
const STX = require(path.join(R, 'SieuTaiXiu', 'cua.js'));
const { taoBan } = require(path.join(R, 'SieuTaiXiu', 'ban.js'));

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');
// PRNG cố định để lặp lại được
let seed = 20260922; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---------------------------------------------------------------- LUẬT THAM CHIẾU (từ README, không nhìn lõi)
// Ăn về ĐÃ GỒM VỐN. 0 = thua.
function thamChieu(CUA, id, tien, xx, nhan) {
    const c = CUA.THEO_ID[id];
    const [a, b, d] = xx; const sum = a + b + d; const bao = a === b && b === d;
    const dem = (n) => xx.filter(v => v === n).length;
    const m = nhan && nhan[id];
    let ti = 0;
    if (id === 'tai') ti = (!bao && sum >= 11) ? 1 : 0;
    else if (id === 'xiu') ti = (!bao && sum <= 10) ? 1 : 0;
    else if (id === 'chan') ti = (!bao && sum % 2 === 0) ? 1 : 0;
    else if (id === 'le') ti = (!bao && sum % 2 === 1) ? 1 : 0;
    else if (/^tong\d+$/.test(id)) ti = sum === Number(id.slice(4)) ? c.goc : 0;
    else if (/^doi\d$/.test(id)) ti = dem(Number(id.slice(3))) >= 2 ? 8 : 0;
    else if (/^bao\d$/.test(id)) ti = (bao && a === Number(id.slice(3))) ? 150 : 0;
    else if (id === 'baoany') ti = bao ? 30 : 0;
    else if (/^cap\d\d$/.test(id)) ti = (xx.includes(Number(id[3])) && xx.includes(Number(id[4]))) ? 5 : 0;
    else if (/^don\d$/.test(id)) {
        const k = dem(Number(id.slice(3)));
        // Đơn 1/2/3 mặt = 1/2/3:1; có nhân: 1 mặt VẪN 1:1, 2 mặt = m, 3 mặt = 87
        ti = k; if (m) { if (k === 2) ti = m; else if (k === 3) ti = 87; }
        return ti > 0 ? tien + tien * ti : 0;
    } else throw new Error('tham chiếu chưa biết ô ' + id);
    if (ti <= 0) return 0;
    if (m) ti = m;                       // ô thường có nhân: ăn đúng m (thay gốc)
    return tien + tien * ti;
}
/**
 * Tham chiếu "ô thật sự được nhân": trúng, có hệ số > 1, và hệ số CÓ ÁP vào tiền theo luật:
 * ô thường có nhân là áp luôn (kể cả khi trùng số với gốc, ví dụ Đôi gốc 8 bốc x8); Đơn chỉ áp
 * khi ra ≥ 2 viên (1 viên luôn 1:1). Không định nghĩa bằng "tiền có khác không" vì x8 trùng gốc
 * vẫn là ô đang sáng nhân trên bàn, người chơi thấy huy hiệu thì lịch sử phải kể.
 */
function thamChieuAnNhan(CUA, xx, nhan) {
    const dem = (n) => xx.filter(v => v === n).length;
    return Object.keys(nhan || {}).filter(id => {
        if (!(nhan[id] > 1) || !CUA.THEO_ID[id]) return false;
        if (thamChieu(CUA, id, 1000, xx, null) <= 0) return false;          // không trúng
        const d = /^don(\d)$/.exec(id);
        return d ? dem(Number(d[1])) >= 2 : true;
    });
}

// ---------------------------------------------------------------- A. LÕI TIỀN 2 BÀN vs THAM CHIẾU
for (const [ten, CUA] of [['TÀI XỈU THƯỜNG', TX], ['SIÊU TÀI XỈU', STX]]) {
    muc('A. lõi ' + ten + ': tinhTra vs tham chiếu, 216 kết cục × ' + CUA.DS.length + ' ô × nhân');
    ok('có đúng 52 ô', CUA.DS.length === 52, String(CUA.DS.length));
    let so = 0, sai = 0, viDu = '';
    const bangs = [{}, CUA.taoNhan(rnd), CUA.taoNhan(rnd)];
    const ep = {}; for (const c of CUA.DS) if (c.thangNhan) ep[c.id] = ri(2, 1999); bangs.push(ep);
    const ep2 = {}; for (const c of CUA.DS) ep2[c.id] = 7; bangs.push(ep2);
    for (const nhan of bangs) for (const xx of CUA.MOI_KET_QUA) for (const c of CUA.DS) {
        const tien = [1000, 5000, 83333, 1200000][so % 4];
        const a = CUA.tinhTra(c.id, tien, xx, nhan), b = thamChieu(CUA, c.id, tien, xx, nhan);
        so++; if (a !== b) { sai++; if (!viDu) viDu = c.id + ' ' + xx.join('-') + ' nhân=' + JSON.stringify(nhan[c.id]) + ' lõi ' + a + ' ≠ tham chiếu ' + b; }
    }
    ok('⭐⭐ ' + so.toLocaleString('vi-VN') + ' phép tính khớp tham chiếu từng đồng', sai === 0, sai + ' lệch, ví dụ: ' + viDu);
    ok('tiền ăn luôn là số nguyên', CUA.DS.every(c => Number.isInteger(CUA.tinhTra(c.id, 83333, [3, 3, 3], ep))));
    let saiT = 0;
    for (const xx of CUA.MOI_KET_QUA) { const t = new Set(CUA.cuaThang(xx)); for (const c of CUA.DS) if (t.has(c.id) !== (thamChieu(CUA, c.id, 1, xx, null) > 0)) saiT++; }
    ok('cuaThang (tô sáng ô trúng trên web) khớp luật', saiT === 0, saiT + ' lệch');
    let ngoai = 0;
    for (let i = 0; i < 3000; i++) { const o = CUA.taoNhan(rnd); for (const k of Object.keys(o)) { const c = CUA.THEO_ID[k]; if (!c.thangNhan.bac.some(b => b[0] === o[k])) ngoai++; } }
    ok('máy bốc 3.000 bảng: mọi hệ số đều nằm trong thang', ngoai === 0, String(ngoai));
    ok('ô không có thang KHÔNG bao giờ được bốc nhân', (() => { for (let i = 0; i < 500; i++) { const o = CUA.taoNhan(rnd); for (const k of Object.keys(o)) if (!CUA.THEO_ID[k].thangNhan) return false; } return true; })());
    ok('tiLeToiDa (web in "tới N:1") = bậc cao nhất thang / gốc / 87 cho Đơn',
        CUA.DS.every(c => CUA.tiLeToiDa(c.id) === (c.donSo ? 87 : (c.thangNhan ? c.thangNhan.bac[c.thangNhan.bac.length - 1][0] : c.goc))));
    // ⚡ cuaAnNhan: ô THẬT SỰ được nhân (22/09) - đủ 216 kết cục × 200 bảng nhân
    ok('có cuaAnNhan()', typeof CUA.cuaAnNhan === 'function');
    let saiN = 0, coDon1 = 0;
    for (let i = 0; i < 200; i++) {
        const nh = CUA.taoNhan(rnd); for (const c of CUA.DS) if (c.thangNhan && rnd() < 0.5) nh[c.id] = ri(2, 99);
        for (const xx of CUA.MOI_KET_QUA) {
            const a = (CUA.cuaAnNhan(xx, nh) || []).slice().sort().join(), b = thamChieuAnNhan(CUA, xx, nh).sort().join();
            if (a !== b) saiN++;
            for (const id of Object.keys(nh)) if (/^don\d$/.test(id) && CUA.demMat(xx, Number(id[3])) === 1) coDon1++;
        }
    }
    ok('⭐ cuaAnNhan khớp tham chiếu ở ' + (200 * 216).toLocaleString('vi-VN') + ' ván (Đơn 1 viên KHÔNG kể, ô khác kể như cuaThang)', saiN === 0, saiN + ' lệch');
    ok('...và ca "Đơn có nhân, ra đúng 1 viên" xuất hiện đủ nhiều để tin', coDon1 > 1000, String(coDon1));
    ok('cuaAnNhan: bảng rỗng/null -> []', CUA.cuaAnNhan([1, 2, 3], null).length === 0 && CUA.cuaAnNhan([1, 2, 3], {}).length === 0);
}

// ---------------------------------------------------------------- A2. Đơn: chữ phải khớp tiền
muc('A2. Đơn 1 viên trả 1:1 -> không khoe ⚡ (22/09)');
{
    const nhan = { don3: 19, tai: 5 };
    ok('Đơn 3 ra 3-1-2 (1 mặt) có x19: trả 1:1 = 2.000', TX.tinhTra('don3', 1000, [3, 1, 2], nhan) === 2000);
    ok('...ra 3-3-1 (2 mặt): x19 = 20.000', TX.tinhTra('don3', 1000, [3, 3, 1], nhan) === 20000);
    ok('...ra 3-3-3: x87 = 88.000', TX.tinhTra('don3', 1000, [3, 3, 3], nhan) === 88000);
    ok('⭐ cuaAnNhan 3-1-2: KHÔNG có don3 (dù cuaThang có)', !TX.cuaAnNhan([3, 1, 2], nhan).includes('don3') && TX.cuaThang([3, 1, 2]).includes('don3'));
    ok('...3-3-1: có don3', TX.cuaAnNhan([3, 3, 1], nhan).includes('don3'));
    ok('...tổng 6 (3-1-2) là XỈU: tai x5 không kể; 6-5-1 tổng 12 TÀI: tai x5 kể', !TX.cuaAnNhan([3, 1, 2], nhan).includes('tai') && TX.cuaAnNhan([6, 5, 1], nhan).includes('tai'));
    const WEB = fs.readFileSync(path.join(R, 'BotDoMin', 'webplay.js'), 'utf8');
    const IDX = fs.readFileSync(path.join(R, 'BotDoMin', 'index.js'), 'utf8');
    const BAN = fs.readFileSync(path.join(R, 'SieuTaiXiu', 'ban.js'), 'utf8');
    ok('web: lịch sử lọc ⚡ bằng txCuaAnNhan (lùi về txCuaThang nếu bot cũ)', /ctx\.txCuaAnNhan \? ctx\.txCuaAnNhan\(h\.dice, nh\)/.test(WEB));
    ok('index: cấp txCuaAnNhan cho web + lịch sử bàn thường lọc bằng cuaAnNhan', /txCuaAnNhan: \(xx, nh\) => TX_CUA\.cuaAnNhan\(xx, nh\)/.test(IDX) && /new Set\(TX_CUA\.cuaAnNhan\(\[d1, d2, d3\], bn\)\)/.test(IDX));
    ok('index: bảng Discord 2 bàn lọc ⚡ bằng cuaAnNhan', /opt\.cuaAnNhan \? opt\.cuaAnNhan\(h\.dice, nh\)/.test(IDX) && /cuaAnNhan: \(d, nh\) => TX_CUA\.cuaAnNhan\(d, nh\)/.test(IDX) && /cuaAnNhan: \(d, nh\) => SIEU_CUA\.cuaAnNhan\(d, nh\)/.test(IDX));
    ok('Siêu: ghi sổ + trạng thái lọc ⚡ bằng cuaAnNhan', /CUA\.cuaAnNhan\(xx, p\.bangNhan \|\| \{\}\)/.test(BAN) && /CUA\.cuaAnNhan\(h\.dice, nh\)/.test(BAN));
    ok('web: tiêu đề khu Đơn nói rõ "1 viên 1:1 (không nhân)" ở CẢ 2 bàn', (WEB.match(/ĐƠN · 1 viên 1:1 \(không nhân\) · 2 viên 2:1 hoặc ×nhân · 3 viên 3:1 hoặc ×87/g) || []).length === 2);
    ok('web: huy hiệu ô Đơn ghi thêm "2-3 viên" ở CẢ 2 bàn', (WEB.match(/indexOf\("don"\)===0\?\\'<i class="sbX2">2-3 viên<\/i>\\'/g) || []).length === 2 && /\.sbX \.sbX2\{/.test(WEB));
    // chạy thật máy bàn Siêu: ép don3 x19, ra 3-1-2 -> lịch sử KHÔNG có don3 trong nhan; ra 3-3-1 -> có
    const chay = (xx) => {
        const DB = { _stxOn: true }; const VI = { A: 1e7 };
        const ban = taoBan({ db: () => DB, layNguoi: (id) => ({ points: VI[id] || 0, name: id }), congVi: (id, t) => { VI[id] = (VI[id] || 0) + t; }, ghiLog: () => { }, luuDb: () => { } });
        ban.khoiDong(); const S = ban._S; const t = ban.adminXem().time; const now = () => Math.floor(Date.now() / 1000);
        S.status = 'betting'; S.targetTime = now() + t.bet + t.nhan + t.nan;
        ban.dat('A', 'A', [{ choice: 'don3', amount: 1000 }]);
        S.targetTime = now() + t.nan + t.nhan; ban.nhip();           // khoá sổ
        S.nhan.o = { don3: 19 };                                      // bảng nhân của ván
        ban.epKetQua(...xx);
        S.targetTime = now() + t.nan; ban.nhip();                     // quay
        S.targetTime = now() - 1; ban.nhip();                         // mở bát
        return { h: S.history[0], vi: VI.A };
    };
    const r1 = chay([3, 1, 2]), r2 = chay([3, 3, 1]);
    ok('⭐⭐ máy bàn Siêu: ra 3-1-2 -> ví +1.000 (1:1) và lịch sử KHÔNG khoe x19 Đơn 3', r1.vi === 1e7 - 1200 + 2000 && !('don3' in (r1.h.nhan || {})), JSON.stringify([r1.vi, r1.h && r1.h.nhan]));
    ok('...ra 3-3-1 -> ví +19.000 và lịch sử CÓ x19 Đơn 3', r2.vi === 1e7 - 1200 + 20000 && r2.h.nhan.don3 === 19, JSON.stringify([r2.vi, r2.h && r2.h.nhan]));
}

// ---------------------------------------------------------------- B. BÀN THƯỜNG: txPlanPayout + txPayUser chạy thật (vm)
muc('B. bàn thường: txPlanPayout + txPayUser chạy thật, 2.000 ván, cân ví từng đồng');
{
    const SRC = fs.readFileSync(path.join(R, 'BotDoMin', 'index.js'), 'utf8');
    const cat = (tu, den) => { const i = SRC.indexOf(tu), j = SRC.indexOf(den, i); if (i < 0 || j < 0) throw new Error('không cắt được ' + tu); return SRC.slice(i, j); };
    const code = cat('function txPlanPayout(gameId, bets, d1, d2, d3) {', '// 🀫 Người chơi bấm "nặn xong"');
    const VI = {};
    const c = {
        txState: {}, dbCache: {}, TX_CUA: TX, TX_STORM_REFUND: 0.3, console,
        txTenCua: (id) => (TX.THEO_ID[id === 'bao' ? 'baoany' : id] || { ten: id }).ten,
        updatePoints: (u, a) => { VI[u] = (VI[u] || 0) + a; }, statAdd: () => { }, writeLog: () => { },
        Math, Number, Object, Array, Set, Date,
    };
    vm.createContext(c); vm.runInContext(code, c);
    ok('cắt được txPlanPayout + txPayUser', typeof c.txPlanPayout === 'function' && typeof c.txPayUser === 'function');
    const ids = TX.DS.map(x => x.id).concat(['bao']);
    let lechVi = 0, lechCua = 0, traHaiLan = 0, viDu = '', anNhan = 0, hoan = 0;
    for (let van = 1; van <= 2000; van++) {
        const bets = []; const nU = ri(1, 5);
        for (let u = 1; u <= nU; u++) for (let k = 0; k < ri(1, 6); k++) bets.push({ userId: 'u' + u, username: 'U' + u, choice: ids[ri(0, ids.length - 1)], amount: [1000, 5000, 20000, 83333, 400000][ri(0, 4)] });
        const nhanO = rnd() < 0.8 ? TX.taoNhan(rnd) : {};
        if (rnd() < 0.2) for (const id of ['bao3', 'baoany', 'don2', 'tong10']) nhanO[id] = ri(2, 1999);
        c.txState.nhan = { gameId: van, o: nhanO }; c.txState.gameId = van;
        const xx = rnd() < 0.15 ? [ri(1, 6)].flatMap(v => [v, v, v]) : [ri(1, 6), ri(1, 6), ri(1, 6)];
        const plan = c.txPlanPayout(van, bets, xx[0], xx[1], xx[2]);
        const kyVong = {}; const kyVongCua = {};
        const bao = xx[0] === xx[1] && xx[1] === xx[2]; const sum = xx[0] + xx[1] + xx[2];
        for (const b of bets) {
            const id = b.choice === 'bao' ? 'baoany' : b.choice;
            let w = thamChieu(TX, id, b.amount, xx, nhanO);
            if (w > 0 && nhanO[id]) anNhan++;
            if (w === 0 && bao) { const ben = sum >= 11 ? 'tai' : 'xiu', cl = sum % 2 === 0 ? 'chan' : 'le'; if (id === ben || id === cl) { w = Math.floor(b.amount * 0.3); hoan++; } }
            kyVong[b.userId] = (kyVong[b.userId] || 0) + w;
            const kc = b.userId + '_' + b.choice; kyVongCua[kc] = (kyVongCua[kc] || 0) + w;
        }
        for (const u of Object.keys(plan.byUser)) VI[u] = 0;
        for (const u of Object.keys(plan.byUser)) if (rnd() < 0.5) { c.txPayUser(van, u); if (c.txPayUser(van, u) !== null) traHaiLan++; }
        for (const u of Object.keys(plan.byUser)) c.txPayUser(van, u);
        for (const u of Object.keys(plan.byUser)) if ((VI[u] || 0) !== (kyVong[u] || 0)) { lechVi++; if (!viDu) viDu = 'ván ' + van + ' ' + u + ' ví ' + VI[u] + ' ≠ ' + kyVong[u] + ' xx ' + xx.join('-'); }
        for (const ca of plan.cuaAgg) { const kc = ca.u + '_' + bets.find(b => b.userId === ca.u && c.txTenCua(b.choice) === ca.choice).choice; if (ca.nhan !== kyVongCua[kc]) lechCua++; }
    }
    ok('⭐⭐ 2.000 ván: ví mọi người nhận ĐÚNG tham chiếu (nhân + hoàn 30% bão) từng đồng', lechVi === 0, lechVi + ' lệch, vd: ' + viDu);
    ok('...độ phủ: ' + anNhan + ' phiếu ăn theo nhân, ' + hoan + ' phiếu hoàn bão', anNhan > 50 && hoan > 20);
    ok('⭐ số "nhận về" ghi sổ theo ô (lịch sử/Discord đọc) = tiền thật trả', lechCua === 0, String(lechCua));
    ok('⭐ gọi trả 2 lần / settle sau nặn: KHÔNG ai được trả 2 lần', traHaiLan === 0, String(traHaiLan));
    c.txState.nhan = { gameId: 999, o: { tai: 0, bao3: 1999 } }; c.txState.gameId = 1000;
    const p2 = c.txPlanPayout(1000, [{ userId: 'z', username: 'z', choice: 'bao3', amount: 1000 }], 3, 3, 3);
    ok('⭐ bảng nhân của VÁN KHÁC bị bỏ qua (bao3 ăn gốc 150:1 = 151.000)', p2.byUser.z.win === 151000, String(p2.byUser.z.win));
}

// ---------------------------------------------------------------- C. SIÊU: máy bàn thật, ví thật, 600 ván
muc('C. Siêu Tài Xỉu: máy bàn thật chạy 600 ván, cân ví (phí + cược + ăn) từng đồng');
{
    const DB = { _stxOn: true }; const VI = { A: 5e9, B: 5e9, C: 5e9 };
    const ban = taoBan({ db: () => DB, layNguoi: (id) => ({ points: VI[id] || 0, name: id }), congVi: (id, t) => { VI[id] = (VI[id] || 0) + t; }, ghiLog: () => { }, luuDb: () => { } });
    ban.khoiDong(); const S = ban._S; const t = ban.adminXem().time;
    const ids = STX.DS.map(x => x.id);
    let lechVi = 0, lechNan = 0, lechHist = 0, lechShow = 0, epKhongAn = 0, viDu = '', phieu = 0, an = 0, anNhan = 0, soEp = 0;
    const now = () => Math.floor(Date.now() / 1000);
    for (let van = 1; van <= 600; van++) {
        S.status = 'betting'; S.targetTime = now() + t.bet + t.nhan + t.nan; S.bets = []; S.nhan = null; S.nan = null; S.plan = null;
        const truoc = { ...VI }; const cuoc = {}; const phi = {};
        for (const u of ['A', 'B', 'C']) if (rnd() < 0.8) {
            const gio = []; for (let k = 0; k < ri(1, 5); k++) { const id = ids[ri(0, ids.length - 1)]; const tr = STX.tranCua(id, null); const muon = [1000, 5000, 10000, 83333, 100000][ri(0, 4)]; gio.push({ choice: id, amount: Math.max(1000, Math.min(muon, tr)) }); }
            ban.dat(u, u, gio);   // giỏ dính trần thì bị chặn cả giỏ - đúng luật, bỏ qua
        }
        const PH = S.bets.slice();
        for (const b of PH) { cuoc[b.userId] = (cuoc[b.userId] || 0) + b.amount; phi[b.userId] = (phi[b.userId] || 0) + b.phi; }
        for (const u of Object.keys(cuoc)) if (truoc[u] - VI[u] !== cuoc[u] + phi[u]) { lechVi++; if (!viDu) viDu = 'trừ lúc đặt sai ' + u; }
        const ep = {}; if (rnd() < 0.5) { ep.tai = ri(2, 14); ep.bao3 = ri(151, 1999); ep.baoany = 0; ban.epNhan(ep); soEp++; }
        const xxEp = rnd() < 0.3 ? [3, 3, 3] : (rnd() < 0.5 ? [ri(1, 6), ri(1, 6), ri(1, 6)] : null);
        if (xxEp) ban.epKetQua(...xxEp);
        S.targetTime = now() + t.nan + t.nhan; ban.nhip();
        if (S.status !== 'nhan') { lechVi++; viDu = viDu || 'không khoá sổ được'; continue; }
        const o = S.nhan.o;
        if (ep.tai && (o.tai !== ep.tai || o.bao3 !== ep.bao3 || o.baoany !== undefined)) epKhongAn++;
        S.targetTime = now() + t.nan; ban.nhip();
        if (S.status !== 'nan' || !S.nan) { lechVi++; viDu = viDu || 'không quay được'; continue; }
        const xx = S.nan.dice;
        if (xxEp && xx.join() !== xxEp.join()) { lechVi++; viDu = viDu || 'ép kết quả không ăn'; }
        const kyVong = {};
        for (const b of PH) { const w = thamChieu(STX, b.choice, b.amount, xx, o); kyVong[b.userId] = (kyVong[b.userId] || 0) + w; phieu++; if (w > 0) { an++; if (o[b.choice]) anNhan++; } }
        const truocTra = { ...VI };
        const rA = ban.nanXong('A'); const rA2 = ban.nanXong('A');
        if (cuoc.A) {
            if (!(rA.got === (kyVong.A || 0) && rA.stake === cuoc.A && rA.phi === phi.A)) lechNan++;
            if (rA2 && rA2.got !== undefined && !rA2.already) lechNan++;
            if ((rA.got - rA.stake) !== ((kyVong.A || 0) - cuoc.A)) lechShow++;
        }
        S.targetTime = now() - 1; ban.nhip();
        for (const u of ['A', 'B', 'C']) { const nhan = VI[u] - truocTra[u]; if (nhan !== (kyVong[u] || 0)) { lechVi++; if (!viDu) viDu = 'ván ' + van + ' ' + u + ' nhận ' + nhan + ' ≠ ' + kyVong[u] + ' xx ' + xx.join('-'); } }
        const h = S.history[0];
        const anNhanSet = new Set(STX.cuaAnNhan(xx, o));
        for (const k of Object.keys(h.nhan || {})) if (!anNhanSet.has(k)) lechHist++;
        const tongNhanSo = (h.bets || []).reduce((s, b) => s + (b.nhan || 0), 0), tongKy = Object.values(kyVong).reduce((s, v) => s + v, 0);
        if (tongNhanSo !== tongKy) lechHist++;
    }
    ok('⭐⭐ 600 ván: ví từng người = −(cược + phí 20%) lúc đặt, +ăn (theo nhân + ép) lúc mở bát, khớp từng đồng', lechVi === 0, lechVi + ' lệch, vd: ' + viDu);
    ok('...độ phủ: ' + phieu + ' phiếu, ' + an + ' ăn, ' + anNhan + ' ăn theo nhân, ' + soEp + ' ván ép', phieu > 2000 && an > 300 && anNhan > 30 && soEp > 100);
    ok('⭐ lệnh ÉP nhân (tai / bao3 / tắt baoany) ăn đúng vào bảng nhân ván', epKhongAn === 0, String(epKhongAn));
    ok('⭐ nặn xong trả đúng {got, stake, phi}; nặn 2 lần không trả 2 lần', lechNan === 0, String(lechNan));
    ok('⭐ số bay trên web (got − stake) = ăn − cược, không trừ phí lần 2', lechShow === 0, String(lechShow));
    ok('⭐ lịch sử: ⚡ chỉ kể ô THẬT SỰ được nhân; tổng "nhận về" theo ô = tiền thật trả', lechHist === 0, String(lechHist));
}

console.log('\n🔎 RÀ SOÁT NHÂN 2 BÀN: ' + P + ' đạt, ' + F + ' hỏng');
if (F) process.exitCode = 1;
