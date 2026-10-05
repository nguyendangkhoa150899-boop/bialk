// 💎 05/10: GHÉP NGỌC (kiểu "Upgrade" CS:GO) trên web.
// Người chơi bỏ đồ trong 🧰 Rương Ích Kỷ (+ KNB web nếu admin bật) để LUYỆN ra 1 món đích (ngọc 7, phiếu KNB...).
//   tỉ lệ (%) = tổng giá trị bỏ vào / giá trị món đích x (100 - phí)%, kẹp [tiMin, tiMax].
//   Server tung số 0..100 (crypto): < tỉ lệ = THẮNG -> món đích vào rương; thua = mất hết đồ đã bỏ.
// GIÁ TRỊ 1 món bỏ vào (theo thứ tự, cái nào có trước dùng cái đó):
//   1. giá riêng admin đặt ở Ghép Ngọc (vao.rieng[id]; 0 = cấm bỏ vào)
//   2. giá shop web x vao.shop.pct % (mặc định 90% = rẻ hơn ngoài shop 10%) - món có bán ở shop web
//   3. giá BÁN trong Rương Ích Kỷ (mặc định TẮT - chủ server: món không có giá chợ thì không hiện)
//   không có giá nào -> không bỏ vào được.
//   NHÓM CẤM (vao.cam, kiểm TRƯỚC mọi giá, kể cả giá riêng): mặc định cấm Yếu Quyết - chỉ bán ở Rương Ích Kỷ.
// MÓN ĐÍCH (05/10 chủ server chốt): CHỈ ngọc 7 thuộc tính, KHÔNG ngọc kép 7-x (Minh Tinh Thạch công + giảm kháng)
//   - Thuộc tính (Tinh Thạch thuần tịnh: công băng/hỏa/huyền/độc 230), Kháng thuộc tính (ngọc kháng thuần tịnh 90),
//     Thể lực / né (Hồng Bảo Thạch, Tổ Mẫu Lục), Chính xác (Tử Ngọc): 120.000; Kháng 110.000
//     (= 5 ngọc 6 giá shop 20.000 - game 5 viên 6 lên 1 viên 7 - cộng thêm 10.000 / 20.000)
//   - Nguyên liệu Trùng Lâu (Chi Lệ/Mang/Thương/Dương 20310185-188): THẮNG NHẬN 10 CÁI, giá trị cả gói 50.000
//   Mỗi nhóm có sl = số cái nhận khi thắng (giá là giá CẢ GÓI).
//   - Phiếu KNB 1.000 - 50.000 = mệnh giá. Nhóm nào có món gì, bật/tắt, giá - admin sửa.
// MỌI con số ở dbCache._gnCfg, admin sửa ở panel (cổng SUPER). MAC_DINH chỉ dùng khi chưa từng lưu.
// Người chơi: userData.gn = { day, luot, lich: [...] }. Nhật ký chung: dbCache._gnLog.
const crypto = require('crypto');

const LICH_MAX = 30, LOG_MAX = 400;
const MAC_DINH = {
    on: false, phi: 10, tiMin: 1, tiMax: 75, luotNgay: 30, monMax: 50,
    knbOn: false, knbMax: 100000,
    // 📣 thông báo Discord mỗi lần luyện: thắng = chúc mừng, thua = châm biếm (câu bốc ngẫu nhiên)
    thongBao: { on: false, kenh: '', thang: true, thua: true, minGia: 0, tag: true, tre: 8 },   // tre = giây chờ kim web quay xong (7,6s) rồi mới đăng
    // 05/10 chủ server: món KHÔNG có giá trên chợ (shop web) thì KHÔNG hiện ở mục bỏ vào -> tắt giá bán rương, không giá riêng mặc định
    vao: { cam: { yq: true }, giaRuong: false, shop: { on: true, pct: 90 }, rieng: {} },
    dich: {
        nhom: {
            thuocTinh: { on: true, gia: 120000, sl: 1, ids: ['50702005', '50702006', '50702007', '50702008'] },
            khang: { on: true, gia: 110000, sl: 1, ids: ['50712005', '50712006', '50712007', '50712008'] },
            theLucNe: { on: true, gia: 120000, sl: 1, ids: ['50713004', '50714001'] },
            chinhXac: { on: true, gia: 120000, sl: 1, ids: ['50703001'] },
            trungLau: { on: true, gia: 50000, sl: 10, ids: ['20310185', '20310186', '20310187', '20310188'] },
        },
        // phiếu KNB làm món đích: CHƯA BẬT mặc định (rác túi boss -> KNB game ~81%) - chờ chủ server chốt, admin tự thêm
        rieng: {},
    },
};
// Tên nhóm món đích (danh sách ID + giá + bật/tắt nằm trong cấu hình, admin sửa)
const NHOM_DICH = { thuocTinh: '💎 Ngọc thuộc tính 7 (công băng/hỏa/huyền/độc)', khang: '🛡️ Ngọc kháng thuộc tính 7', theLucNe: '❤️ Ngọc thể lực / né 7', chinhXac: '🎯 Ngọc chính xác 7 (Tử Ngọc)', trungLau: '🧩 Nguyên liệu Trùng Lâu (Chi Lệ/Mang/Thương/Dương)' };
// Nhóm CẤM bỏ vào (chỉ là cách nhận món; bật/tắt ở vao.cam do admin)
const NHOM_CAM = { yq: { ten: '📜 Yếu Quyết (chỉ bán ở Rương Ích Kỷ)', khop: (id, ten) => /^3030[78]\d{3}$/.test(id) && /Yếu Quyết/i.test(ten) } };
// Câu thông báo ({ten} người chơi, {mon} món, {tl} tỉ lệ, {tung} số tung, {gt} giá trị đã bỏ)
const CAU_THANG = [
    '🎉 **{ten}** vừa luyện ra **{mon}** chỉ với **{tl}%**! Đại gia đây rồi, chúc mừng 👏👏',
    '💎 Trời độ! **{ten}** ra **{mon}** ({tl}%, tung {tung}). Ai chưa luyện thì xin vía đi 🙏',
    '🔥 **{ten}** đỏ quá trời: **{mon}** về rương ở mức {tl}%. Mai mua vé số chung nha 🎫',
    '🏆 Chúc mừng **{ten}** luyện thành công **{mon}**! {tl}% mà vẫn ăn, nhân phẩm tràn đầy ✨',
    '🍀 **{ten}** vừa bỏ {gt} đồ, nhận về **{mon}** ({tl}%). Lời to rồi bạn ơi 💰',
];
const CAU_THUA = [
    '💥 **{ten}** vừa đốt **{gt}** đồ để mơ **{mon}** ({tl}%)... và tạch. Thắp nén nhang 🕯️',
    '😂 **{ten}** ôm hy vọng {tl}% ra **{mon}**, kim chỉ {tung}. Rương nhẹ hẳn đi rồi kìa 🎒',
    '🪦 RIP {gt} giá trị đồ của **{ten}**. **{mon}** {tl}% mà cũng không độ nổi 😭',
    '🤡 **{ten}** tự tin {tl}% là chắc ăn... nhà cái xin cảm ơn đã ủng hộ **{gt}** 🙇',
    '🫠 **{ten}** luyện **{mon}** thất bại ({tl}%). Không sao, nghèo thêm chút nữa là quen 😌',
];
const idDs = (a) => (Array.isArray(a) ? a : String(a || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter((x) => /^\d{5,9}$/.test(x));

module.exports = function ghepNgoc(d) {
    // d: { db(), getUserData, updatePoints, saveDbNow, logDog, writeLog, debtBlock, icon(id), items() -> [{id,n}],
    //      shop() -> [{id,name,price,off}], giaRuong(id) -> giá bán Rương Ích Kỷ (bỏ qua công tắc bán), ichKy: {of, add, take}, dayStr() }
    const rnd = (n) => crypto.randomInt(n);
    const so = (v, lo, hi, md) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : md; };
    const gon = (s) => String(s || '').split(' [')[0].replace(/[㐀-鿿＀-￯]+.*$/, '').replace(/#G|#c[0-9A-Fa-f]{6}/g, '').trim() || String(s || '');
    let NM = null, nmTs = 0;
    const tenMap = () => { if (!NM || Date.now() - nmTs > 600000 || !NM.size) { NM = new Map(d.items().map((x) => [String(x.id), gon(x.n)])); nmTs = Date.now(); } return NM; };
    const ten = (id) => tenMap().get(String(id)) || ('#' + id);

    function cfg() {
        const c = d.db()._gnCfg || {};
        const M = MAC_DINH, v = c.vao || {}, di = c.dich || {};
        const rieng = (o, md) => { const r = {}; for (const [id, g] of Object.entries(o && typeof o === 'object' ? o : md)) if (/^\d{5,9}$/.test(id)) r[id] = Math.floor(so(g, 0, 1e9, 0)); return r; };
        const nhom = {};
        for (const k of Object.keys(NHOM_DICH)) {
            const md = M.dich.nhom[k] || { on: false, gia: 0, sl: 1, ids: [] }, g = (di.nhom && di.nhom[k]) || md;
            nhom[k] = { on: g.on === undefined ? !!md.on : !!g.on, gia: Math.floor(so(g.gia, 0, 1e9, md.gia)), sl: Math.floor(so(g.sl, 1, 9999, md.sl || 1)), ids: idDs(g.ids === undefined ? md.ids : g.ids) };
        }
        const sh = v.shop || M.vao.shop;
        const tb = Object.assign({}, M.thongBao, c.thongBao || {});
        const cam = {}; for (const k of Object.keys(NHOM_CAM)) cam[k] = v.cam && v.cam[k] !== undefined ? !!v.cam[k] : !!M.vao.cam[k];
        return {
            on: c.on === undefined ? M.on : !!c.on,
            phi: so(c.phi, 0, 90, M.phi), tiMin: so(c.tiMin, 0.01, 100, M.tiMin), tiMax: so(c.tiMax, 1, 100, M.tiMax),
            luotNgay: Math.floor(so(c.luotNgay, 0, 100000, M.luotNgay)), monMax: Math.floor(so(c.monMax, 1, 10000, M.monMax)),
            knbOn: c.knbOn === undefined ? M.knbOn : !!c.knbOn, knbMax: Math.floor(so(c.knbMax, 0, 1e9, M.knbMax)),
            vao: { cam, giaRuong: v.giaRuong === undefined ? M.vao.giaRuong : !!v.giaRuong, shop: { on: sh.on === undefined ? true : !!sh.on, pct: so(sh.pct, 0, 100, M.vao.shop.pct) }, rieng: rieng(v.rieng, M.vao.rieng) },
            dich: { nhom, rieng: rieng(di.rieng, M.dich.rieng) },
            thongBao: { on: !!tb.on, kenh: /^\d{15,20}$/.test(String(tb.kenh || '')) ? String(tb.kenh) : '', thang: !!tb.thang, thua: !!tb.thua, minGia: Math.floor(so(tb.minGia, 0, 1e9, 0)), tag: !!tb.tag, tre: so(tb.tre, 0, 120, 8) },
            moi: !d.db()._gnCfg,
        };
    }
    // giá CHỢ (shop web) - chỉ món ĐANG BÁN (không tắt), giá > 0
    function shopGia(id) { const s = d.shop().find((x) => String(x.id) === String(id) && !x.off && Number(x.price) > 0); return s ? Number(s.price) : 0; }
    // giá trị 1 món BỎ VÀO + nguồn giá
    function giaVao(id, c) {
        c = c || cfg(); id = String(id);
        for (const [k, on] of Object.entries(c.vao.cam)) if (on && NHOM_CAM[k].khop(id, ten(id))) return { gia: 0, tu: 'cấm: ' + NHOM_CAM[k].ten };
        if (c.vao.rieng[id] !== undefined) return { gia: c.vao.rieng[id], tu: 'riêng' };
        if (c.vao.shop.on) { const s = shopGia(id); if (s > 0) { const g = Math.floor(s * c.vao.shop.pct / 100); if (g > 0) return { gia: g, tu: c.vao.shop.pct === 100 ? 'giá shop' : 'shop −' + (100 - c.vao.shop.pct) + '%' }; } }
        if (c.vao.giaRuong) { const g = Math.floor(Number(d.giaRuong(id)) || 0); if (g > 0) return { gia: g, tu: 'giá bán rương' }; }
        return { gia: 0, tu: '' };
    }
    // 05/10 (chủ server): thứ tự hiện ở 🎯 Món đích + 🧰 Rương - phiếu KNB nhỏ -> lớn, nguyên liệu Trùng Lâu, ngọc công
    // Băng/Hỏa/Huyền/Độc, ngọc kháng Băng/Hỏa/Huyền/Độc, Thể lực (Hồng Bảo Thạch), Né tránh (Tổ Mẫu Lục), Chính xác (Tử Ngọc), còn lại.
    // Ngọc so theo 5 số cuối ID (bỏ số cấp, GemInfo.txt: 02006 = Lam Tinh Thạch = Băng công ...) nên ngọc 6 / 7 cùng loại đứng cùng chỗ, cấp cao trước.
    const THU_NGOC = ['02006', '02007', '02005', '02008', '12006', '12007', '12005', '12008', '13004', '14001', '03001'];
    function hang(id) {
        id = String(id);
        if (/^3991000\d$/.test(id)) return [0, +id];
        if (/^2031018[5-8]$/.test(id)) return [1, +id];
        if (/^50\d{6}$/.test(id)) { const i = THU_NGOC.indexOf(id.slice(3)); if (i >= 0) return [2 + i, -Number(id[2])]; }
        return [99, 0];
    }
    const soHang = (a, b) => { const x = hang(a.id), y = hang(b.id); return x[0] - y[0] || x[1] - y[1]; };
    // danh sách món ĐÍCH + giá
    function dsDich(c) {
        c = c || cfg();
        const m = new Map();
        for (const [k, g] of Object.entries(c.dich.nhom)) if (g.on && g.gia > 0) for (const id of g.ids) m.set(id, { gia: g.gia, sl: g.sl, nhom: k });
        for (const [id, g] of Object.entries(c.dich.rieng)) { if (g > 0) m.set(id, { gia: g, sl: 1, nhom: 'rieng' }); else m.delete(id); }
        return [...m.entries()].map(([id, x]) => ({ id, ten: ten(id), ic: d.icon(id), gia: x.gia, sl: x.sl, nhom: x.nhom })).sort((a, b) => soHang(a, b) || a.gia - b.gia || a.ten.localeCompare(b.ten));
    }
    function gnOf(u) {
        const hn = d.dayStr();
        if (!u.gn || typeof u.gn !== 'object') u.gn = {};
        if (u.gn.day !== hn) { u.gn.day = hn; u.gn.luot = 0; }
        if (!Array.isArray(u.gn.lich)) u.gn.lich = [];
        return u.gn;
    }
    const tiLeTho = (tong, giaDich, c) => (giaDich > 0 ? tong / giaDich * (100 - c.phi) : 0);

    function state(uid) {
        const c = cfg(), u = d.getUserData(uid), g = gnOf(u), k = d.ichKy.of(u);
        const ruong = Object.entries(k.items || {}).map(([id, qty]) => ({ id, qty: Number(qty) || 0, ...giaVao(id, c) }))
            .filter((x) => x.qty > 0 && x.gia > 0).map((x) => ({ id: x.id, qty: x.qty, gia: x.gia, tu: x.tu, ten: ten(x.id), ic: d.icon(x.id) }))
            .sort((a, b) => soHang(a, b) || b.gia - a.gia || a.ten.localeCompare(b.ten));
        return {
            on: c.on, phi: c.phi, tiMin: c.tiMin, tiMax: c.tiMax, luotNgay: c.luotNgay, luotHomNay: g.luot, monMax: c.monMax,
            knbOn: c.knbOn, knbMax: c.knbMax, balance: u.points || 0,
            dich: dsDich(c), ruong, lich: g.lich.slice().reverse(),
        };
    }

    function quay(uid, body, who) {
        const c = cfg();
        if (!c.on) return { error: '💎 Ghép Ngọc đang tắt' };
        const debt = d.debtBlock && d.debtBlock(uid, 'ghép ngọc'); if (debt) return { error: debt };
        const u = d.getUserData(uid), g = gnOf(u);
        if (c.luotNgay > 0 && g.luot >= c.luotNgay) return { error: `Hôm nay đã luyện đủ ${c.luotNgay} lần - mai quay lại` };
        body = body || {};
        const dich = dsDich(c).find((x) => x.id === String(body.dich || ''));
        if (!dich) return { error: 'Chọn món muốn luyện ra' };
        // gom đồ bỏ vào
        const gop = new Map();
        for (const x of Array.isArray(body.vao) ? body.vao.slice(0, 200) : []) {
            const id = String((x && x.id) || ''), sl = Math.floor(Number(x && x.sl) || 0);
            if (!/^\d{5,9}$/.test(id) || sl < 1) continue;
            gop.set(id, (gop.get(id) || 0) + sl);
        }
        const knb = Math.floor(Number(body.knb) || 0);
        if (knb < 0) return { error: 'KNB không hợp lệ' };
        if (knb > 0 && !c.knbOn) return { error: 'Không được bỏ KNB vào' };
        if (knb > c.knbMax) return { error: `Bỏ KNB tối đa ${c.knbMax.toLocaleString('vi-VN')}` };
        if (knb > (u.points || 0)) return { error: 'Không đủ KNB' };
        if (!gop.size && !knb) return { error: 'Chưa bỏ món nào vào' };
        const soMon = [...gop.values()].reduce((t, n) => t + n, 0);
        if (soMon > c.monMax) return { error: `Mỗi lần bỏ tối đa ${c.monMax} món` };
        const k = d.ichKy.of(u);
        let tong = knb; const ds = [];
        for (const [id, sl] of gop) {
            const gv = giaVao(id, c);
            if (gv.gia <= 0) return { error: `${ten(id)} không dùng để ghép được` };
            if ((Number(k.items[id]) || 0) < sl) return { error: `Rương không đủ ${ten(id)}` };
            tong += gv.gia * sl; ds.push({ id, sl, gia: gv.gia });
        }
        const tho = tiLeTho(tong, dich.gia, c);
        // du tiMax thi khong bo them: chi cho mon CUOI lam vuot moc; bo bot 1 mon re nhat ma van du -> thua
        const re = ds.length ? Math.min(...ds.map((x) => x.gia)) : knb;
        if (tiLeTho(tong - re, dich.gia, c) >= c.tiMax - 1e-9) return { error: `Bỏ thừa - đã đủ ${c.tiMax}%, bớt đồ ra cho đỡ phí` };
        const tiLe = Math.round(Math.min(c.tiMax, tho) * 1000) / 1000;
        if (tiLe < c.tiMin) return { error: `Tỉ lệ ${tiLe}% thấp quá - tối thiểu ${c.tiMin}%, bỏ thêm đồ vào` };
        // trừ đồ + KNB rồi mới tung
        for (const x of ds) if (!d.ichKy.take(u, x.id, x.sl)) return { error: 'Rương thay đổi, thử lại' };
        if (knb) d.updatePoints(uid, -knb);
        // vung trung = cung [lech, lech + tiLe) tren vong 0..100 (nguoi choi keo xoay). So tung deu nen ti le khong doi.
        const lech = Math.round(((Number(body.lech) || 0) % 100 + 100) % 100 * 1000) / 1000;
        const roll = rnd(100000) / 1000;   // 0.000 .. 99.999
        const thang = ((roll - lech) % 100 + 100) % 100 < tiLe;
        if (thang) d.ichKy.add(u, dich.id, dich.sl);
        g.luot += 1;
        const t = Date.now();
        const rec = { t, dich: dich.id, sl: dich.sl, gia: dich.gia, tong, tiLe, lech, roll, thang, vao: ds.map((x) => [x.id, x.sl]), knb };
        g.lich.push(rec); if (g.lich.length > LICH_MAX) g.lich.splice(0, g.lich.length - LICH_MAX);
        const db = d.db(); if (!Array.isArray(db._gnLog)) db._gnLog = [];
        db._gnLog.push({ ...rec, uid, ten: u.name || who || uid });
        if (db._gnLog.length > LOG_MAX) db._gnLog.splice(0, db._gnLog.length - LOG_MAX);
        if (knb && d.logDog) d.logDog('ghepngoc', uid, u.name || who || uid, -knb, `💎 Ghép ngọc: bỏ ${knb.toLocaleString('vi-VN')} KNB`);
        d.saveDbNow();
        thongBao(c, uid, u, thang, dich, tiLe, roll, tong);
        d.writeLog('ADMIN', `[GHÉP NGỌC] ${u.name || who || uid} ${thang ? 'THẮNG' : 'thua'} ${ten(dich.id)} x${dich.sl} (${tiLe}%, tung ${roll}) - bỏ ${ds.map((x) => ten(x.id) + ' x' + x.sl).join(', ')}${knb ? ' + ' + knb + ' KNB' : ''} = ${tong}`);
        return { ok: true, thang, tiLe, lech, roll, dich: { id: dich.id, ten: dich.ten, ic: dich.ic, gia: dich.gia, sl: dich.sl }, ...state(uid) };
    }

    // 📣 gửi Discord (không await - gửi hỏng không ảnh hưởng lượt luyện)
    const vnd = (n) => Math.floor(n).toLocaleString('vi-VN');
    function cauTb(ds, o) { return ds[rnd(ds.length)].replace(/\{(\w+)\}/g, (_, k) => (o[k] !== undefined ? o[k] : '')); }
    function thongBao(c, uid, u, thang, dich, tiLe, roll, tong) {
        const tb = c.thongBao;
        if (!tb.on || !tb.kenh || !d.guiKenh || dich.gia < tb.minGia || (thang ? !tb.thang : !tb.thua)) return;
        const ten = (tb.tag && /^\d{15,20}$/.test(String(uid)) ? '<@' + uid + '> ' : '') + (u.ingameName || u.name || uid);
        const mon = ten_(dich);
        const msg = cauTb(thang ? CAU_THANG : CAU_THUA, { ten, mon, tl: tiLe, tung: roll, gt: vnd(tong) });
        // chờ kim trên web quay xong mới đăng - đăng ngay thì kênh Discord lộ kết quả trước cả người chơi
        setTimeout(() => { Promise.resolve(d.guiKenh(tb.kenh, msg, tb.tag ? [String(uid)] : [])).catch(() => {}); }, tb.tre * 1000);
    }
    const ten_ = (dich) => dich.ten + (dich.sl > 1 ? ' ×' + dich.sl : '');
    async function guiThu() {
        const c = cfg(), tb = c.thongBao;
        if (!tb.kenh) return { error: 'Chưa chọn kênh' };
        if (!d.guiKenh) return { error: 'Bot chưa nối hàm gửi Discord' };
        const vd = dsDich(c)[0] || { ten: 'Ngọc thử', sl: 1 };
        try {
            await d.guiKenh(tb.kenh, '🧪 [THỬ] ' + cauTb(CAU_THANG, { ten: 'Admin', mon: ten_(vd), tl: 42, tung: 12.345, gt: vnd(50000) }), []);
            await d.guiKenh(tb.kenh, '🧪 [THỬ] ' + cauTb(CAU_THUA, { ten: 'Admin', mon: ten_(vd), tl: 42, tung: 88.8, gt: vnd(50000) }), []);
        } catch (e) { return { error: 'Gửi lỗi: ' + e.message }; }
        return { ok: true, message: '📣 Đã gửi 2 tin thử vào kênh' };
    }
    // ===== ADMIN =====
    function canhBao(c) {
        const w = [];
        for (const x of dsDich(c)) {
            const ban = Math.floor(Number(d.giaRuong(x.id)) || 0) * x.sl;
            if (ban > x.gia * (100 - c.phi) / 100) w.push(`${x.ten} #${x.id} x${x.sl}: giá bán rương ${ban} > giá đích ${x.gia} trừ phí → luyện rồi bán lại có lời`);
            const s = shopGia(x.id) * x.sl;
            if (s > 0 && x.gia * 100 / (100 - c.phi) < s * c.vao.shop.pct / 100) w.push(`${x.ten} #${x.id}: giá đích ${x.gia} rẻ hơn nhiều so với shop ${s} → mua shop bỏ vào luyện ra chính nó là lời`);
        }
        for (const [id, g] of Object.entries(c.vao.rieng)) { const s = shopGia(id); if (g > 0 && s > 0 && g > s) w.push(`${ten(id)} #${id}: giá bỏ vào ${g} > giá shop ${s} → mua shop bỏ vào là lời`); }
        if (c.knbOn && dsDich(c).some((x) => /^3991/.test(x.id))) w.push('Đang cho bỏ KNB web và có phiếu KNB làm đích → người chơi đổi KNB web sang phiếu game, lách giới hạn rút');
        return w;
    }
    function bangGia(c) {
        c = c || cfg();
        const ids = new Set([...d.shop().map((x) => String(x.id)), ...Object.keys(c.vao.rieng)]);
        for (const it of d.items()) if (/^50[67]\d{5}$/.test(String(it.id))) ids.add(String(it.id));
        return [...ids].map((id) => ({ id, ten: ten(id), shop: shopGia(id), ...giaVao(id, c) })).filter((x) => x.gia > 0 || c.vao.rieng[x.id] !== undefined || /^cấm/.test(x.tu))
            .sort((a, b) => b.gia - a.gia);
    }
    function adminState() {
        const c = cfg(), db = d.db();
        return { cfg: c, kenh: d.dsKenh ? d.dsKenh() : [], nhomDich: NHOM_DICH, nhomCam: Object.fromEntries(Object.entries(NHOM_CAM).map(([k, v]) => [k, v.ten])),
            dich: dsDich(c), bangGia: bangGia(c), canhBao: canhBao(c),
            log: (db._gnLog || []).slice(-200).reverse().map((x) => ({ ...x, k: x.t + '_' + x.uid, tenDich: ten(x.dich), icDich: d.icon(x.dich),
                vaoCt: (x.vao || []).map(([id, n]) => ({ id, sl: n, ten: ten(id), ic: d.icon(id) })) })) };
    }
    function saveCfg(x, who) {
        x = x || {};
        const num = (v, lo, hi, ten_) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${ten_} phải ${lo} - ${hi}`); return n; };
        const ds = (o, ten_) => { const r = {}; for (const [id, g] of Object.entries(o && typeof o === 'object' ? o : {})) { if (!/^\d{5,9}$/.test(id)) throw new Error(`${ten_}: ID ${id} sai`); r[id] = Math.floor(num(g, 0, 1e9, `${ten_} ${id}`)); } return r; };
        try {
            const c = {
                on: !!x.on, phi: num(x.phi, 0, 90, 'Phí'), tiMin: num(x.tiMin, 0.01, 100, 'Tỉ lệ tối thiểu'), tiMax: num(x.tiMax, 1, 100, 'Tỉ lệ tối đa'),
                luotNgay: Math.floor(num(x.luotNgay, 0, 100000, 'Lượt/ngày')), monMax: Math.floor(num(x.monMax, 1, 10000, 'Món tối đa/lần')),
                knbOn: !!x.knbOn, knbMax: Math.floor(num(x.knbMax, 0, 1e9, 'KNB tối đa')),
                vao: { cam: Object.fromEntries(Object.keys(NHOM_CAM).map((k) => [k, !!(x.vao && x.vao.cam && x.vao.cam[k])])), giaRuong: !!(x.vao && x.vao.giaRuong), shop: { on: !!(x.vao && x.vao.shop && x.vao.shop.on), pct: num(x.vao && x.vao.shop && x.vao.shop.pct, 0, 100, '% giá shop') }, rieng: ds(x.vao && x.vao.rieng, 'Giá bỏ vào') },
                dich: { nhom: {}, rieng: ds(x.dich && x.dich.rieng, 'Món đích') },
                thongBao: (() => { const t0 = x.thongBao || {}; const k = String(t0.kenh || '').trim(); if (k && !/^\d{15,20}$/.test(k)) throw new Error('ID kênh Discord phải là 15-20 chữ số');
                    return { on: !!t0.on, kenh: k, thang: !!t0.thang, thua: !!t0.thua, minGia: Math.floor(num(t0.minGia || 0, 0, 1e9, 'Mức giá báo')), tag: !!t0.tag, tre: num(t0.tre === undefined || t0.tre === '' ? 8 : t0.tre, 0, 120, 'Giây chờ đăng') }; })(),
            };
            if (c.tiMin > c.tiMax) throw new Error('Tỉ lệ tối thiểu lớn hơn tối đa');
            for (const k of Object.keys(NHOM_DICH)) { const g = (x.dich && x.dich.nhom && x.dich.nhom[k]) || {}; c.dich.nhom[k] = { on: !!g.on, gia: Math.floor(num(g.gia || 0, 0, 1e9, 'Giá ' + NHOM_DICH[k])), sl: Math.floor(num(g.sl || 1, 1, 9999, 'Số lượng ' + NHOM_DICH[k])), ids: idDs(g.ids) }; }
            d.db()._gnCfg = c;
        } catch (e) { return { error: e.message }; }
        d.saveDbNow();
        const c = cfg();
        d.writeLog('ADMIN', `[GHÉP NGỌC] ${who || 'admin'} lưu cấu hình: ${c.on ? 'BẬT' : 'tắt'}, phí ${c.phi}%, tỉ lệ ${c.tiMin}-${c.tiMax}%, ${c.luotNgay} lượt/ngày, giá bỏ vào ${c.vao.shop.on ? c.vao.shop.pct + '% shop' : 'không theo shop'}, ${dsDich(c).length} món đích`);
        return { ok: true, ...adminState() };
    }
    // 👀 05/10: nhật ký CHỈ XEM cho cổng mod - không uid, không cấu hình
    function logXem() {
        const c = cfg();
        return { on: c.on, phi: c.phi, tiMax: c.tiMax,
            log: (d.db()._gnLog || []).slice(-200).reverse().map((x) => ({ t: x.t, ten: x.ten, thang: x.thang, tiLe: x.tiLe, roll: x.roll, tong: x.tong, gia: x.gia, sl: x.sl || 1, knb: x.knb || 0,
                tenDich: ten(x.dich), icDich: d.icon(x.dich), hoan: x.hoan ? { t: x.hoan.t } : null,
                vaoCt: (x.vao || []).map(([id, n]) => ({ sl: n, ten: ten(id), ic: d.icon(id) })) })) };
    }
    // ↩ 05/10: admin HOÀN đồ đã bỏ vào 1 lượt (bấm nhầm...) - trả về Rương Ích Kỷ (+ KNB nếu có), món đã thắng giữ nguyên. 1 lần/lượt.
    function hoan(k, who) {
        const db = d.db(), x = (db._gnLog || []).find((y) => y.t + '_' + y.uid === String(k || ''));
        if (!x) return { error: 'Không thấy lượt này trong nhật ký' };
        if (x.hoan) return { error: 'Lượt này đã hoàn lúc ' + new Date(x.hoan.t).toLocaleString('vi-VN') };
        const u = d.getUserData(x.uid);
        if (!u) return { error: 'Không thấy ví người chơi' };
        for (const [id, n] of x.vao || []) d.ichKy.add(u, id, n);
        if (x.knb) d.updatePoints(x.uid, x.knb);
        x.hoan = { t: Date.now(), ai: who || 'admin' };
        const g = u.gn && Array.isArray(u.gn.lich) ? u.gn.lich.find((y) => y.t === x.t) : null; if (g) g.hoan = x.hoan.t;
        d.saveDbNow();
        const ds = (x.vao || []).map(([id, n]) => ten(id) + ' x' + n).join(', ') + (x.knb ? ' + ' + x.knb + ' KNB' : '');
        d.writeLog('ADMIN', `[GHÉP NGỌC] ${who || 'admin'} HOÀN cho ${x.ten || x.uid} lượt ${new Date(x.t).toLocaleString('vi-VN')}: ${ds} -> Rương Ích Kỷ`);
        return { ok: true, message: '↩ Đã hoàn ' + ds + ' vào Rương Ích Kỷ của ' + (x.ten || x.uid), ...adminState() };
    }
    function tim(q) {
        q = String(q || '').trim(); if (!q) return [];
        const kd = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
        const qk = kd(q), out = [];
        for (const it of d.items()) { const id = String(it.id); if (id === q || kd(String(it.n)).includes(qk)) { out.push({ id, ten: gon(it.n), ic: d.icon(id), shop: shopGia(id) }); if (out.length >= 60) break; } }
        return out;
    }
    return { state, quay, adminState, saveCfg, tim, giaVao, cfg, guiThu, hoan, logXem, MAC_DINH };
};
