// 📜 22/10 (chủ server): LỊCH SỬ SỬA BỘ QUÀ VÒNG QUAY - chỉ cổng SUPER xem (trả qua /api/vq/cfg, cổng mod không nhận).
// Lý do: 21/10 mod sửa bộ quà (ngọc cấp 7 ×1 -> ×20) rồi tự quay; nhật ký cũ chỉ ghi "lưu cấu hình: N món", không biết sửa gì.
// - Từ 22/10: mỗi lần lưu (mod / SUPER / về mặc định) ghi 1 dòng vào db._vqSua: { t, who, them, bo, sua, cfg } - giữ GIU_NGAY ngày.
// - Trước 22/10: data/vq-sua-cu.json dựng lại từ bản sao lưu DB hằng ngày + bản sao lưu cấu hình + log nginx (giờ / IP từng lần bấm lưu)
//   bằng tools/vq-sua-dung.js. Giữa 2 bản sao lưu chỉ thấy TỔNG thay đổi (tonghop: true) kèm danh sách lần lưu trong khoảng đó.
const fs = require('fs');
const path = require('path');

const GIU_NGAY = 10;
const FILE_CU = path.join(__dirname, 'data', 'vq-sua-cu.json');

// pool -> Map(id -> [[sl, w, off], ...]) (1 ID có thể có nhiều dòng khác SL)
function nhom(pool) {
    const m = new Map();
    for (const p of Array.isArray(pool) ? pool : []) {
        if (!p || !(p.id > 0)) continue;
        const k = String(p.id);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push([p.sl | 0, p.w | 0, !!p.off]);
    }
    for (const a of m.values()) a.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return m;
}

// so 2 cấu hình { on, gia, max, pool } -> { them: [{id, ds}], bo: [{id, ds}], sua: [{id, cu, moi}], cfg: [[ten, cu, moi]] }
function soSanh(cu, moi) {
    cu = cu || {}; moi = moi || {};
    const a = nhom(cu.pool), b = nhom(moi.pool), them = [], bo = [], sua = [], cfg = [];
    for (const [id, ds] of b) {
        if (!a.has(id)) them.push({ id: +id, ds });
        else if (JSON.stringify(a.get(id)) !== JSON.stringify(ds)) sua.push({ id: +id, cu: a.get(id), moi: ds });
    }
    for (const [id, ds] of a) if (!b.has(id)) bo.push({ id: +id, ds });
    for (const k of ['on', 'gia', 'max']) if (cu[k] !== undefined && moi[k] !== undefined && cu[k] !== moi[k]) cfg.push([k, cu[k], moi[k]]);
    return { them, bo, sua, cfg };
}
const rong = (x) => !x.them.length && !x.bo.length && !x.sua.length && !x.cfg.length;

// ghi 1 lần lưu (gọi TRƯỚC khi thay db._vqCfg, cu = cấu hình cũ đầy đủ, moi = cấu hình mới)
function ghi(db, cu, moi, who, loai) {
    const x = soSanh(cu, moi);
    if (!Array.isArray(db._vqSua)) db._vqSua = [];
    db._vqSua.push({ t: Date.now(), who: String(who || 'admin'), loai: loai || 'luu', soMon: (moi.pool || []).length, ...x });
    const han = Date.now() - GIU_NGAY * 86400e3;
    db._vqSua = db._vqSua.filter((e) => e.t >= han).slice(-500);
    return x;
}

let CU = null, cuTs = 0;
function docCu() {
    if (!CU || Date.now() - cuTs > 600000) {
        try { CU = JSON.parse(fs.readFileSync(FILE_CU, 'utf8')); } catch { CU = []; }
        cuTs = Date.now();
    }
    return Array.isArray(CU) ? CU : [];
}

// danh sách cho panel SUPER: mới nhất trước, GIU_NGAY ngày, gắn tên món
function ds(db, ten) {
    const han = Date.now() - GIU_NGAY * 86400e3;
    const moi = Array.isArray(db._vqSua) ? db._vqSua : [];
    const tuLuc = moi.length ? moi[0].t : Infinity;
    const all = docCu().filter((e) => (e.den || e.t) < tuLuc).concat(moi).filter((e) => (e.den || e.t) >= han);
    const tenOf = (id) => (ten ? ten(id) : '#' + id);
    return all.sort((a, b) => (b.den || b.t) - (a.den || a.t)).map((e) => ({
        ...e,
        them: (e.them || []).map((x) => ({ ...x, ten: tenOf(x.id) })),
        bo: (e.bo || []).map((x) => ({ ...x, ten: tenOf(x.id) })),
        sua: (e.sua || []).map((x) => ({ ...x, ten: tenOf(x.id) })),
        dauVet: (e.dauVet || []).map((x) => ({ ...x, ten: tenOf(x.id) })),
    }));
}

module.exports = { GIU_NGAY, soSanh, rong, ghi, ds, nhom };
