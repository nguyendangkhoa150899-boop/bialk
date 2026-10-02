// 🍀 02/10: VÒNG QUAY MAY MẮN trên web (thay vòng quay trong game - giao diện game hiện ô giả, khó dùng).
// Cách chơi giống game (Vòng Quay Bảo Thạch):
//   1. MỞ / LÀM MỚI vòng: trả <gia> KNB (admin đặt, mặc định 8.000) -> server bốc 24 món từ bộ thưởng:
//      <vip> ô VIP (mặc định 2) + phần còn lại món thường, bốc theo trọng số, không trùng nếu bộ đủ món.
//   2. RÚT THĂM: tốn 1 LƯỢT QUAY (có từ Túi đồ boss, admin cấp) -> server bốc 1 trong 24 ô theo trọng số
//      của từng món (VIP trọng số nhỏ = hiếm). Vòng giữ nguyên sau khi quay (giống game), muốn đổi món thì Làm mới.
//   3. Quà vào RƯƠNG VÒNG QUAY trên web (không hết hạn, tối đa RUONG_MAX dòng). Trúng món đã có trong rương thì CỘNG DỒN
//      vào dòng cũ. Bấm Nhận -> hàng đợi quà game (đổi bản đồ là có). Người chơi tự xóa món không cần.
// Cấu hình: dbCache._vqCfg = { on, gia, vip, pool: [{ id, sl, w, vip }] } - sửa ở panel tab 🎁 Quà tặng.
// Người chơi: userData.vq = { luot, board: [{ id, sl, w, vip }], ruong: [{ k, id, sl, t, vip }], lich: [...] }
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SO_O = 24, RUONG_MAX = 100, LICH_MAX = 30, LOG_MAX = 400;
let MAC_DINH = [];
try { MAC_DINH = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'vongquay-macdinh.json'), 'utf8')); } catch { /* bộ trống */ }

module.exports = function vongQuay(d) {
    // d: { db(), getUserData, updatePoints, saveDbNow, logDog, writeLog, debtBlock, tlbb, icon }
    // danh mục ghi "Tên [loại, cấp, khóa...] 中文" -> chỉ lấy phần tên cho gọn ô vòng quay
    const gon = (s) => String(s || '').split(' [')[0].replace(/[㐀-鿿＀-￯]+.*$/, '').trim() || String(s || '');
    const nameMap = () => { const m = new Map(); for (const it of (d.tlbb.items ? d.tlbb.items() : [])) m.set(String(it.id), gon(it.n)); return m; };
    let NM = null, nmTs = 0;
    const ten = (id) => { if (!NM || Date.now() - nmTs > 600000 || !NM.size) { NM = nameMap(); nmTs = Date.now(); } return NM.get(String(id)) || ('#' + id); };
    const rnd = (n) => crypto.randomInt(n);

    function cfg() {
        const c = d.db()._vqCfg || {};
        const pool = Array.isArray(c.pool) ? c.pool : MAC_DINH;
        return {
            on: !!c.on,
            gia: Number.isInteger(c.gia) ? c.gia : 8000,
            vip: Number.isInteger(c.vip) ? c.vip : 2,
            pool: pool.filter((x) => x && x.id > 0 && x.w > 0 && x.sl > 0 && !x.off),
            poolAll: pool,
            macDinh: !Array.isArray(c.pool),
        };
    }
    function vqOf(u) {
        if (!u.vq || typeof u.vq !== 'object') u.vq = {};
        const v = u.vq;
        if (!Number.isInteger(v.luot)) v.luot = 0;
        if (!Array.isArray(v.ruong)) v.ruong = [];
        if (!Array.isArray(v.lich)) v.lich = [];
        if (!v.gop) {   // 02/10: gộp dòng trùng ID có từ trước khi có cộng dồn
            const m = new Map();
            for (const x of v.ruong) { const y = m.get(x.id); if (y) { y.sl += x.sl; y.t = Math.max(y.t, x.t); y.vip = y.vip || x.vip; } else m.set(x.id, { ...x }); }
            v.ruong = [...m.values()]; v.gop = 1;
        }
        return v;
    }
    const ra = (x) => ({ id: x.id, sl: x.sl, vip: !!x.vip, ten: ten(x.id), ic: d.icon(x.id) });

    // bốc k món theo trọng số, không lặp (thiếu món thì cho lặp lại)
    function bocNhieu(ds, k) {
        const out = [];
        let con = ds.slice();
        while (out.length < k && ds.length) {
            if (!con.length) con = ds.slice();
            const tong = con.reduce((s, x) => s + x.w, 0);
            let r = rnd(tong), i = 0;
            while (r >= con[i].w) { r -= con[i].w; i++; }
            out.push(con[i]); con.splice(i, 1);
        }
        return out;
    }
    function taoVong(c) {
        const vipDs = c.pool.filter((x) => x.vip), thuong = c.pool.filter((x) => !x.vip);
        const nVip = Math.min(c.vip, vipDs.length, SO_O);
        const ds = bocNhieu(vipDs, nVip).concat(bocNhieu(thuong.length ? thuong : vipDs, SO_O - nVip));
        for (let i = ds.length - 1; i > 0; i--) { const j = rnd(i + 1); [ds[i], ds[j]] = [ds[j], ds[i]]; }   // xáo vị trí
        return ds.map((x) => ({ id: x.id, sl: x.sl, w: x.w, vip: !!x.vip }));
    }

    function webState(uid) {
        const c = cfg(), u = d.getUserData(uid), v = vqOf(u);
        return {
            on: c.on, gia: c.gia, luot: v.luot, balance: u.points || 0, ruongMax: RUONG_MAX,
            ingameName: (u.ingameName || '').trim(), linked: !!(u.tlbbGuid || u.ingameName),
            board: (v.board || []).map(ra),
            ruong: v.ruong.slice().reverse().map((x) => ({ ...ra(x), k: x.k, t: x.t })),
            lich: v.lich.slice().reverse().map((x) => ({ ...ra(x), t: x.t })),
        };
    }

    function mo(uid) {
        const c = cfg();
        if (!c.on) return { error: '🍀 Vòng quay đang tắt' };
        const debt = d.debtBlock(uid, 'mở vòng quay'); if (debt) return { error: debt };
        if (c.pool.length < 1) return { error: 'Admin chưa đặt quà cho vòng quay' };
        const u = d.getUserData(uid), v = vqOf(u);
        if ((u.points || 0) < c.gia) return { error: `Cần ${c.gia.toLocaleString()} KNB để ${v.board ? 'làm mới' : 'mở'} vòng (bạn có ${(u.points || 0).toLocaleString()})` };
        if (c.gia) { d.updatePoints(uid, -c.gia); d.logDog('vongquay', uid, u.name || uid, -c.gia, `🍀 ${v.board ? 'Làm mới' : 'Mở'} vòng quay`); }
        v.board = taoVong(c); v.boardT = Date.now();
        d.saveDbNow();
        return { ok: true, ...webState(uid) };
    }

    function quay(uid) {
        const c = cfg();
        if (!c.on) return { error: '🍀 Vòng quay đang tắt' };
        const u = d.getUserData(uid), v = vqOf(u);
        if (!v.board || !v.board.length) return { error: `Chưa có vòng - bấm Mở vòng (${c.gia.toLocaleString()} KNB) trước` };
        if (v.luot < 1) return { error: 'Hết lượt quay - đánh boss nhận Túi đồ boss để có thêm lượt' };
        if (v.ruong.length >= RUONG_MAX) return { error: `Rương đầy ${RUONG_MAX} món - nhận bớt vào game hoặc xóa bớt đã` };
        const tong = v.board.reduce((s, x) => s + (x.w > 0 ? x.w : 0), 0);
        if (tong <= 0) return { error: 'Vòng lỗi trọng số - bấm Làm mới' };
        let r = rnd(tong), o = 0;
        while (r >= v.board[o].w) { r -= v.board[o].w; o++; }
        const x = v.board[o];
        v.luot -= 1;
        const q = { k: Date.now().toString(36) + '-' + rnd(1e6).toString(36), id: x.id, sl: x.sl, vip: !!x.vip, t: Date.now() };
        const cu = v.ruong.find((y) => y.id === x.id);   // trúng món đã có -> cộng dồn
        if (cu) { cu.sl += x.sl; cu.t = q.t; cu.vip = cu.vip || q.vip; } else v.ruong.push(q);
        v.lich.push({ id: x.id, sl: x.sl, vip: !!x.vip, t: q.t }); if (v.lich.length > LICH_MAX) v.lich.splice(0, v.lich.length - LICH_MAX);
        const db = d.db(); if (!Array.isArray(db._vqLog)) db._vqLog = [];
        db._vqLog.push({ t: q.t, uid, ten: u.name || uid, id: x.id, sl: x.sl, vip: !!x.vip });
        if (db._vqLog.length > LOG_MAX) db._vqLog.splice(0, db._vqLog.length - LOG_MAX);
        d.saveDbNow();
        if (x.vip) d.writeLog('ADMIN', `[VÒNG QUAY] ⭐ ${u.name || uid} quay trúng VIP ${ten(x.id)} ×${x.sl}`);
        return { ok: true, o, qua: ra(x), ...webState(uid) };
    }

    // Nhận quà từ rương vào game (k = mã 1 món, hoặc 'all')
    const dangNhan = new Set();
    async function nhan(uid, k) {
        const u = d.getUserData(uid), v = vqOf(u);
        const target = String(u.tlbbGuid || '').trim() || String(u.ingameName || '').trim();
        if (!target) return { error: 'Chưa liên kết nhân vật trong game - nhắn admin liên kết trước đã' };
        if (dangNhan.has(uid)) return { error: '⏳ Đang giao quà trước, chờ vài giây' };
        const ds = k === 'all' ? v.ruong.slice() : v.ruong.filter((x) => x.k === String(k));
        if (!ds.length) return { error: 'Không thấy món này trong rương' };
        dangNhan.add(uid);
        let da = 0;
        try {
            for (const x of ds) {
                let r = null, err = null;
                try { r = await d.tlbb.giveItem(target, x.id, x.sl); } catch (e) { err = e; }
                if (!r || !r.ok) {
                    const msg = (r && r.message) || (err && err.message) || 'không gửi được';
                    if (da) d.saveDbNow();
                    return { error: (da ? `Đã gửi ${da} món, ` : '') + 'lỗi ở ' + ten(x.id) + ': ' + msg.replace(/\s*\(player not found\)/i, '') + '. Món còn lại vẫn trong rương.', ...webState(uid) };
                }
                const i = v.ruong.findIndex((y) => y.k === x.k); if (i >= 0) v.ruong.splice(i, 1);
                da++;
            }
            d.saveDbNow();
            d.writeLog('SYSTEM', `[VÒNG QUAY] ${u.name || uid} nhận ${da} món từ rương -> ${target}`);
            return { ok: true, message: `✅ Đã gửi ${da} món vào game - đổi bản đồ để nhận (túi đầy thì lần sau nhận tiếp)`, ...webState(uid) };
        } finally { dangNhan.delete(uid); }
    }

    // Xóa món trong rương (k = mã 1 món, hoặc 'all')
    function xoa(uid, k) {
        const u = d.getUserData(uid), v = vqOf(u);
        if (dangNhan.has(uid)) return { error: '⏳ Đang giao quà, chờ vài giây' };
        const truoc = v.ruong.length;
        const bo = k === 'all' ? v.ruong : v.ruong.filter((x) => x.k === String(k));
        if (!bo.length) return { error: 'Không thấy món này trong rương' };
        d.writeLog('SYSTEM', `[VÒNG QUAY] ${u.name || uid} xóa ${bo.length} món khỏi rương: ${bo.map((x) => ten(x.id) + ' x' + x.sl).join(', ').slice(0, 300)}`);
        v.ruong = k === 'all' ? [] : v.ruong.filter((x) => x.k !== String(k));
        d.saveDbNow();
        return { ok: true, message: `🗑 Đã xóa ${truoc - v.ruong.length} món`, ...webState(uid) };
    }

    // Túi đồ boss / admin cộng lượt quay
    function congLuot(uid, n, lyDo) {
        n = Math.floor(Number(n) || 0); if (!n) return 0;
        const u = d.getUserData(uid), v = vqOf(u);
        v.luot = Math.max(0, v.luot + n);
        d.writeLog('SYSTEM', `[VÒNG QUAY] ${u.name || uid} ${n > 0 ? '+' : ''}${n} lượt quay (${lyDo}) -> ${v.luot}`);
        return v.luot;
    }

    // ===== ADMIN =====
    function adminState() {
        const c = cfg(), db = d.db();
        const nguoi = Object.entries(db).filter(([k, x]) => /^\d{5,20}$/.test(k) && x && x.vq)
            .map(([k, x]) => ({ uid: k, ten: x.name || k, game: x.ingameName || '', luot: x.vq.luot || 0, ruong: (x.vq.ruong || []).length, coVong: !!(x.vq.board && x.vq.board.length) }));
        const vi = Object.entries(db).filter(([k, x]) => /^\d{5,20}$/.test(k) && x && typeof x === 'object')
            .map(([k, x]) => ({ uid: k, ten: x.name || k, game: x.ingameName || '' }));
        return {
            cfg: { on: c.on, gia: c.gia, vip: c.vip, macDinh: c.macDinh },
            pool: c.poolAll.map((x) => ({ id: x.id, sl: x.sl, w: x.w, vip: !!x.vip, off: !!x.off, ten: ten(x.id), ic: d.icon(x.id) })),
            nguoi, vi,
            log: (db._vqLog || []).slice(-80).reverse().map((x) => ({ ...x, tenMon: ten(x.id) })),
        };
    }
    function saveCfg(x, who) {
        x = x || {};
        const gia = Math.floor(Number(x.gia)), vip = Math.floor(Number(x.vip));
        if (!(gia >= 0 && gia <= 10000000)) return { error: 'Giá mở/làm mới phải 0 - 10.000.000 KNB' };
        if (!(vip >= 0 && vip <= 12)) return { error: 'Số ô VIP phải 0 - 12' };
        const items = new Set((d.tlbb.items ? d.tlbb.items() : []).map((it) => String(it.id)));
        if (!items.size) return { error: 'Bot chưa tải xong danh mục vật phẩm game, thử lại sau 1 phút' };
        if (!Array.isArray(x.pool) || x.pool.length > 1000) return { error: 'Bộ quà phải là danh sách tối đa 1.000 món' };
        const pool = [], seen = new Set();
        for (let i = 0; i < x.pool.length; i++) {
            const p = x.pool[i] || {}; const id = Math.floor(Number(p.id)), sl = Math.floor(Number(p.sl)), w = Math.floor(Number(p.w));
            if (!items.has(String(id))) return { error: `Dòng ${i + 1}: ID ${p.id} không có trong game` };
            if (!(sl >= 1 && sl <= 999)) return { error: `Dòng ${i + 1} (${ten(id)}): số lượng 1 - 999` };
            if (!(w >= 1 && w <= 100000)) return { error: `Dòng ${i + 1} (${ten(id)}): trọng số 1 - 100.000` };
            const key = id + ':' + sl; if (seen.has(key)) continue; seen.add(key);
            pool.push({ id, sl, w, vip: !!p.vip, off: !!p.off });
        }
        const db = d.db();
        db._vqCfg = { on: !!x.on, gia, vip, pool };
        d.saveDbNow();
        d.writeLog('ADMIN', `[VÒNG QUAY] ${who || 'admin'} lưu cấu hình: ${x.on ? 'BẬT' : 'tắt'}, giá ${gia}, ${vip} ô VIP, ${pool.length} món (${pool.filter((p) => p.vip).length} VIP)`);
        return { ok: true, ...adminState() };
    }
    function macDinh(who) {
        const db = d.db(); const c = db._vqCfg || {};
        db._vqCfg = { on: !!c.on, gia: Number.isInteger(c.gia) ? c.gia : 8000, vip: Number.isInteger(c.vip) ? c.vip : 2 };
        d.saveDbNow();
        d.writeLog('ADMIN', `[VÒNG QUAY] ${who || 'admin'} đưa bộ quà về mặc định (${MAC_DINH.length} món vòng quay gốc)`);
        return { ok: true, ...adminState() };
    }
    function capLuot(uid, n, who) {
        uid = String(uid || ''); n = Math.floor(Number(n));
        const db = d.db();
        if (!db[uid] || typeof db[uid] !== 'object') return { error: 'Không thấy ví này' };
        if (!(n >= -10000 && n <= 10000) || !n) return { error: 'Số lượt -10.000 đến 10.000, khác 0' };
        const con = congLuot(uid, n, 'admin ' + (who || ''));
        d.saveDbNow();
        return { ok: true, message: `${db[uid].name || uid}: ${n > 0 ? '+' : ''}${n} lượt → còn ${con} lượt`, ...adminState() };
    }
    function tim(q) {
        q = String(q || '').trim().toLowerCase(); if (!q) return [];
        const kd = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
        const qk = kd(q), out = [];
        for (const it of (d.tlbb.items ? d.tlbb.items() : [])) {
            if (String(it.id) === q || kd(String(it.n)).includes(qk)) { out.push({ id: Number(it.id), ten: gon(it.n), ic: d.icon(it.id) }); if (out.length >= 60) break; }
        }
        return out;
    }

    return { webState, mo, quay, nhan, xoa, congLuot, adminState, saveCfg, macDinh, capLuot, tim, RUONG_MAX };
};
