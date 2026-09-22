// ============================================================================
//  cua.js — LÕI TIỀN "SIÊU TÀI XỈU" (52 cửa, có PHÍ 20%, trả thưởng khủng)
//
//  Thuần logic: không web, không DB, không Discord. Bộ kiểm riêng:
//      node SieuTaiXiu/kiemtra/cua-test.js
//
//  ── KHÁC BÀN TÀI XỈU THƯỜNG Ở HAI CHỖ ───────────────────────────────────────
//  1. TÀI/XỈU/CHẴN/LẺ CŨNG ĐƯỢC NHÂN (tới 14:1). Bên bàn thường 4 cửa này không
//     bao giờ nhân vì tỉ lệ gốc đã trả 97,2%. Đây chính là chữ "SIÊU".
//  2. CÓ PHÍ 20% trên tiền cược. Đặt 1.000 thì trừ ví 1.200, ăn thì ăn trên 1.000.
//     Phí này là NGUỒN THU DUY NHẤT của nhà cái.
//
//  ── VÌ VẬY BÀI TOÁN LẬT NGƯỢC ───────────────────────────────────────────────
//  Bảng trả ở đây CỐ TÌNH vượt 100%: nhà cái lỗ trên bàn rồi lấy lại bằng phí,
//  y như kiểu thu hoa hồng bên Baccarat.
//
//      người chơi thực nhận = RTP_BAN / (1 + PHI)
//      nhà cái ăn           = 1 − RTP_BAN / (1 + PHI)
//
//  Chủ server chốt nhà cái ăn 8% (mở màn) => RTP_BAN = 0,92 × 1,20 = 1,104 (110,4%).
//  Admin chỉnh "nhà cái ăn" ở panel, máy tự suy ra RTP_BAN rồi giải lại q.
//
//  ── q VẪN LÀ THỨ MÁY TỰ GIẢI ────────────────────────────────────────────────
//      RTP = p·(g+1) + p·q·(E_m − g)
//  Đổi mức ăn hoặc đổi thang nhân thì q tự tính lại cho cả 52 cửa. ĐỪNG gõ tay q.
//
//  ── TRẦN CƯỢC ───────────────────────────────────────────────────────────────
//  Lấy ĐÚNG cột "Giới hạn đặt cược" trong bảng chủ server gửi. Trả thưởng ở đây
//  to hơn bàn thường rất nhiều (gấp ba tới 1.999:1) nên trần phải thấp hơn hẳn —
//  bê trần của bàn thường sang là phơi nhiễm gấp mấy lần. Thắng đậm nhất một ô
//  quanh 2,5 triệu (Bộ ba bất kỳ: 5.000 × 499).
// ============================================================================
'use strict';

// Phí cố định trên tiền cược. Đặt X thì trừ ví X + X·PHI.
const PHI = 0.20;

// Nhà cái ăn bao nhiêu (SAU khi đã tính phí). Admin chỉnh ở panel.
const AN_MUC_TIEU = 0.08;              // chủ server chốt 22/09: 8% cho mọi người chơi trước, sau nâng
const AN_MIN = 0.02, AN_MAX = 0.30;    // chặn 2 đầu cho khỏi lỡ tay
let AN_HIEN = AN_MUC_TIEU;

/** RTP của BÀN (chưa trừ phí) suy từ mức nhà cái muốn ăn. */
const rtpBan = () => (1 - AN_HIEN) * (1 + PHI);

// ---------------------------------------------------------------- 216 kết quả
const MOI_KET_QUA = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) MOI_KET_QUA.push([a, b, c]);
const tongXx = (x) => x[0] + x[1] + x[2];
const laBao = (x) => x[0] === x[1] && x[1] === x[2];
const demMat = (x, n) => (x[0] === n ? 1 : 0) + (x[1] === n ? 1 : 0) + (x[2] === n ? 1 : 0);

// ---------------------------------------------------------------- nhóm trần cược
// Lấy ĐÚNG cột "Giới hạn đặt cược" trong bảng chủ server gửi. Đừng bê trần của bàn
// thường sang: bàn này trả cao hơn nhiều nên cùng một mức trần sẽ phơi nhiễm gấp mấy lần.
const NHOM_TRAN = {
    deu: { ten: 'Tài/Xỉu · Chẵn/Lẻ (tới 14:1)', mac: 50000 },
    vua: { ten: 'Tổng 7-14 · 8-13 · 9-12 · 10-11 · Kết hợp (tới 149:1)', mac: 10000 },
    cao: { ten: 'Gấp đôi · Bộ ba bất kỳ · Tổng 6-15 · Đơn (tới 499:1)', mac: 5000 },
    hiem: { ten: 'Tổng 5 hoặc 16 (tới 499:1)', mac: 2000 },
    cuchiem: { ten: 'Gấp ba (tới 1.999:1) · Tổng 4 hoặc 17', mac: 1000 },
};

// ---------------------------------------------------------------- thang nhân
const thang = (arr) => {
    const w = arr.reduce((s, x) => s + x[1], 0);
    return { bac: arr, tong: w, E: arr.reduce((s, x) => s + x[0] * x[1], 0) / w };
};
// ⚠️ GIỮ NGUYÊN MỨC ĐẦU VÀ MỨC CUỐI khi sửa: mức cuối quyết định trần cược.
// Mức cuối lấy đúng bảng "Trả thưởng & Hạn mức" chủ server gửi.
const THANG_GOC = {
    // 4 cửa đều tiền — bàn thường KHÔNG có, đây là điểm ăn tiền của bàn SIÊU
    deu: [[2, 45], [3, 30], [4, 22], [5, 15], [6, 10], [8, 6], [10, 4], [12, 2], [14, 1]],
    tong4: [[75, 40], [100, 30], [150, 22], [200, 15], [300, 10], [400, 6], [600, 4], [800, 2], [999, 1]],
    tong5: [[30, 40], [50, 30], [80, 22], [120, 15], [180, 10], [250, 6], [350, 4], [450, 2], [499, 1]],
    tong6: [[20, 42], [30, 30], [45, 22], [70, 15], [100, 10], [150, 6], [200, 3], [249, 2]],
    tong7: [[15, 42], [20, 30], [30, 22], [45, 15], [65, 10], [90, 6], [120, 3], [149, 2]],
    tong8: [[10, 42], [14, 30], [20, 22], [28, 15], [40, 10], [55, 6], [70, 3], [87, 2]],
    tong9: [[8, 42], [12, 30], [18, 22], [25, 15], [35, 10], [50, 6], [70, 3], [87, 2]],
    tong10: [[8, 42], [12, 30], [18, 22], [25, 15], [35, 10], [50, 6], [70, 3], [87, 2]],
    doi: [[12, 42], [18, 30], [28, 22], [40, 15], [60, 10], [85, 6], [120, 3], [149, 2]],
    bao: [[200, 40], [300, 30], [450, 22], [650, 15], [900, 10], [1200, 6], [1500, 4], [1800, 2], [1999, 1]],
    baoAny: [[40, 42], [60, 30], [90, 22], [140, 15], [200, 10], [300, 6], [400, 3], [499, 2]],
    cap: [[8, 42], [12, 30], [18, 22], [25, 15], [40, 10], [60, 6], [80, 3], [99, 2]],
    // nhân cho phần ĐÔI của cửa đơn (3 mặt ăn cố định DON_BAO_NHAN)
    don: [[10, 42], [12, 30], [14, 22], [15, 15], [16, 10], [17, 6], [18, 3], [19, 2]],
};
const T = {};
function dungT(bang) { for (const k of Object.keys(bang)) T[k] = thang(bang[k]); }
dungT(THANG_GOC);
let THANG_HIEN = JSON.parse(JSON.stringify(THANG_GOC));

// ---------------------------------------------------------------- 52 cửa
// tra(xx) trả về SỐ LẦN ăn (0 = thua). Cửa đơn trả 1/2/3 theo số mặt trúng.
const DS = [];
const them = (o) => { DS.push(o); return o; };

// 4 cửa đều tiền — VẪN thua sạch nếu ra bão (đúng dòng "* Thua bất kỳ Bộ Ba nào"),
// nhưng KHÁC bàn thường: ở đây CÓ ĐƯỢC NHÂN, tới 14:1.
them({ id: 'xiu', ten: 'XỈU 4-10', nhom: 'deu', goc: 1, thangNhan: T.deu, _thang: 'deu', tra: x => (!laBao(x) && tongXx(x) <= 10) ? 1 : 0 });
them({ id: 'tai', ten: 'TÀI 11-17', nhom: 'deu', goc: 1, thangNhan: T.deu, _thang: 'deu', tra: x => (!laBao(x) && tongXx(x) >= 11) ? 1 : 0 });
them({ id: 'chan', ten: 'CHẴN', nhom: 'deu', goc: 1, thangNhan: T.deu, _thang: 'deu', tra: x => (!laBao(x) && tongXx(x) % 2 === 0) ? 1 : 0 });
them({ id: 'le', ten: 'LẺ', nhom: 'deu', goc: 1, thangNhan: T.deu, _thang: 'deu', tra: x => (!laBao(x) && tongXx(x) % 2 === 1) ? 1 : 0 });

// 14 cửa tổng điểm 4..17
const TONG_CAU = {
    4: { goc: 50, t: T.tong4, tn: 'tong4', nhom: 'cuchiem' }, 17: { goc: 50, t: T.tong4, tn: 'tong4', nhom: 'cuchiem' },
    5: { goc: 20, t: T.tong5, tn: 'tong5', nhom: 'hiem' }, 16: { goc: 20, t: T.tong5, tn: 'tong5', nhom: 'hiem' },
    6: { goc: 15, t: T.tong6, tn: 'tong6', nhom: 'cao' }, 15: { goc: 15, t: T.tong6, tn: 'tong6', nhom: 'cao' },
    7: { goc: 12, t: T.tong7, tn: 'tong7', nhom: 'vua' }, 14: { goc: 12, t: T.tong7, tn: 'tong7', nhom: 'vua' },
    8: { goc: 8, t: T.tong8, tn: 'tong8', nhom: 'vua' }, 13: { goc: 8, t: T.tong8, tn: 'tong8', nhom: 'vua' },
    9: { goc: 6, t: T.tong9, tn: 'tong9', nhom: 'vua' }, 12: { goc: 6, t: T.tong9, tn: 'tong9', nhom: 'vua' },
    10: { goc: 6, t: T.tong10, tn: 'tong10', nhom: 'vua' }, 11: { goc: 6, t: T.tong10, tn: 'tong10', nhom: 'vua' },
};
for (let s = 4; s <= 17; s++) {
    const c = TONG_CAU[s];
    them({ id: 'tong' + s, ten: 'Tổng ' + s, nhom: c.nhom, goc: c.goc, thangNhan: c.t, _thang: c.tn, tra: x => tongXx(x) === s ? c.goc : 0, _goc: c.goc });
}

// 6 cửa gấp đôi + 6 cửa gấp ba (bão từng số)
for (let n = 1; n <= 6; n++) {
    them({ id: 'doi' + n, ten: 'Đôi ' + n, nhom: 'cao', goc: 8, thangNhan: T.doi, _thang: 'doi', tra: x => demMat(x, n) >= 2 ? 8 : 0 });
    them({ id: 'bao' + n, ten: 'Bão ' + n, nhom: 'cuchiem', goc: 150, thangNhan: T.bao, _thang: 'bao', tra: x => (laBao(x) && x[0] === n) ? 150 : 0 });
}
them({ id: 'baoany', ten: 'Bão bất kỳ', nhom: 'cao', goc: 30, thangNhan: T.baoAny, _thang: 'baoAny', tra: x => laBao(x) ? 30 : 0 });

// 15 cửa kết hợp 2 lá khác nhau
for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) {
    them({ id: 'cap' + a + b, ten: 'Cặp ' + a + '-' + b, nhom: 'vua', goc: 5, thangNhan: T.cap, _thang: 'cap', tra: x => (x.includes(a) && x.includes(b)) ? 5 : 0 });
}

// 6 cửa số đơn — 1 mặt 1:1 (tới 9:1), 2 mặt 2:1 (tới 19:1), 3 mặt 3:1 (tới 87:1)
const DON_BAO_NHAN = 87;
for (let n = 1; n <= 6; n++) {
    them({ id: 'don' + n, ten: 'Đơn ' + n, nhom: 'cao', goc: 1, thangNhan: T.don, _thang: 'don', donSo: n, tra: x => demMat(x, n) });
}

const THEO_ID = Object.fromEntries(DS.map(c => [c.id, c]));

// ---------------------------------------------------------------- giải ra q
function doGoc(c) {
    let win = 0, evGoc = 0;
    for (const x of MOI_KET_QUA) {
        const k = c.tra(x);
        if (k > 0) { win++; evGoc += k + 1; }
    }
    return { p: win / MOI_KET_QUA.length, rtpGoc: evGoc / MOI_KET_QUA.length };
}
function giaiQ(c) {
    const muc = rtpBan();
    const { p, rtpGoc } = doGoc(c);
    if (!c.thangNhan || rtpGoc >= muc) return { p, rtpGoc, q: 0, rtpSau: rtpGoc };
    let them_;
    if (c.donSo) {
        let d2 = 0, d3 = 0;
        for (const x of MOI_KET_QUA) { const k = demMat(x, c.donSo); if (k === 2) d2++; if (k === 3) d3++; }
        them_ = (d2 * (c.thangNhan.E - 2) + d3 * (DON_BAO_NHAN - 3)) / MOI_KET_QUA.length;
    } else {
        them_ = p * (c.thangNhan.E - c.goc);
    }
    const q = Math.max(0, Math.min(1, (muc - rtpGoc) / them_));
    return { p, rtpGoc, q, rtpSau: rtpGoc + q * them_ };
}
for (const c of DS) Object.assign(c, giaiQ(c));

/**
 * Admin đặt MỨC NHÀ CÁI ĂN (sau phí). Máy suy ra RTP bàn rồi giải lại q cho cả 52 cửa.
 * Nhận 0.10 hoặc 10 đều được.
 */
function datMucAn(muc) {
    let a = Number(muc);
    if (Number.isFinite(a) && a > 1) a = a / 100;
    if (!Number.isFinite(a) || a < AN_MIN || a > AN_MAX) {
        return { error: `Nhà cái ăn phải từ ${(AN_MIN * 100).toFixed(0)}% đến ${(AN_MAX * 100).toFixed(0)}%` };
    }
    AN_HIEN = a;
    for (const c of DS) Object.assign(c, giaiQ(c));
    return { ok: true, ...thongKe() };
}
function thongKe() {
    const coNhan = DS.filter(c => c.q > 0);
    const oSang = DS.reduce((s, c) => s + (c.q || 0), 0);
    const rtpTB = DS.reduce((s, c) => s + (c.rtpSau || c.rtpGoc || 0), 0) / DS.length;
    // kẹt trần = cửa muốn sáng 100% số ván mà vẫn chưa đủ RTP -> không kéo lên nổi
    const ket = DS.filter(c => c.thangNhan && c.q >= 1).map(c => c.id);
    return {
        an: AN_HIEN,                       // nhà cái ăn (sau phí)
        phi: PHI,
        rtpBan: rtpBan(),                  // RTP của bàn (chưa trừ phí)
        rtpThuc: rtpTB / (1 + PHI),        // người chơi THỰC NHẬN
        anThuc: 1 - rtpTB / (1 + PHI),     // nhà cái ăn thật, đo trên bàn hiện tại
        soCuaDuocNhan: coNhan.length,
        oSangMoiVan: oSang,
        cuaKetTran: ket,
        min: AN_MIN, max: AN_MAX, macDinh: AN_MUC_TIEU,
    };
}
const mucAnHienTai = () => AN_HIEN;

// ---------------------------------------------------------------- thang: admin sửa
const thangHienTai = () => JSON.parse(JSON.stringify(THANG_HIEN));
const thangMacDinh = () => JSON.parse(JSON.stringify(THANG_GOC));
function datThang(bangMoi) {
    if (!bangMoi || typeof bangMoi !== 'object') return { error: 'Thiếu bảng thang nhân' };
    const moi = JSON.parse(JSON.stringify(THANG_HIEN));
    for (const ten of Object.keys(bangMoi)) {
        if (!THANG_GOC[ten]) return { error: 'Không có nhóm nhân tên "' + ten + '"' };
        const bac = bangMoi[ten];
        if (!Array.isArray(bac) || bac.length < 2 || bac.length > 12) {
            return { error: 'Nhóm "' + ten + '": phải có từ 2 đến 12 bậc' };
        }
        let truoc = 0;
        for (const b of bac) {
            if (!Array.isArray(b) || b.length !== 2) return { error: 'Nhóm "' + ten + '": mỗi bậc phải là (hệ số, độ hiếm)' };
            const gt = Math.floor(Number(b[0])), ts = Math.floor(Number(b[1]));
            if (!Number.isFinite(gt) || gt < 1 || gt > 9999) return { error: 'Nhóm "' + ten + '": hệ số x' + b[0] + ' phải từ 1 đến 9999' };
            if (!Number.isFinite(ts) || ts < 1 || ts > 1000) return { error: 'Nhóm "' + ten + '": độ hiếm của x' + gt + ' phải từ 1 đến 1000' };
            if (gt <= truoc) return { error: 'Nhóm "' + ten + '": hệ số phải TĂNG DẦN (x' + gt + ' đứng sau x' + truoc + ')' };
            truoc = gt;
        }
        moi[ten] = bac.map(b => [Math.floor(Number(b[0])), Math.floor(Number(b[1]))]);
    }
    THANG_HIEN = moi;
    dungT(THANG_HIEN);
    for (const c of DS) if (c.thangNhan) c.thangNhan = T[c._thang];
    for (const c of DS) Object.assign(c, giaiQ(c));
    return { ok: true, thang: thangHienTai(), ...thongKe() };
}

// ---------------------------------------------------------------- sinh nhân
function bocThang(t, rnd) {
    let r = rnd() * t.tong;
    for (const b of t.bac) { r -= b[1]; if (r <= 0) return b[0]; }
    return t.bac[t.bac.length - 1][0];
}
function taoNhan(rnd) {
    rnd = rnd || (() => require('crypto').randomInt(0, 1e9) / 1e9);
    const out = {};
    for (const c of DS) {
        if (!c.thangNhan || c.q <= 0) continue;
        if (rnd() < c.q) out[c.id] = bocThang(c.thangNhan, rnd);
    }
    return out;
}

// ---------------------------------------------------------------- tiền
/** Tiền THỰC TRỪ khỏi ví khi đặt `tien` (đã gồm phí 20%). */
const tienTru = (tien) => Math.floor(tien) + Math.floor(Math.floor(tien) * PHI);
/** Riêng phần phí, để ghi sổ / hiện cho người chơi. */
const tienPhi = (tien) => Math.floor(Math.floor(tien) * PHI);

/**
 * Tiền một cửa ăn về (ĐÃ gồm vốn GỐC, KHÔNG gồm phí — phí không hoàn).
 * 0 = thua sạch.
 */
function tinhTra(cuaId, tien, xx, nhan) {
    const c = THEO_ID[cuaId];
    if (!c) throw new Error('Không có cửa: ' + cuaId);
    const k = c.tra(xx);
    if (k <= 0) return 0;
    const m = nhan && nhan[cuaId];
    let ti = k;
    if (m) {
        if (c.donSo) { if (k === 2) ti = m; else if (k === 3) ti = DON_BAO_NHAN; }
        else ti = m;
    }
    return tien + tien * ti;
}

function cuaThang(xx) {
    return DS.filter(c => c.tra(xx) > 0).map(c => c.id);
}

function tranCua(cuaId, tranNhom) {
    const c = THEO_ID[cuaId];
    if (!c) return 0;
    const n = tranNhom && tranNhom[c.nhom];
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : NHOM_TRAN[c.nhom].mac;
}
const tranMacDinh = () => Object.fromEntries(Object.keys(NHOM_TRAN).map(k => [k, NHOM_TRAN[k].mac]));

function tiLeToiDa(cuaId) {
    const c = THEO_ID[cuaId];
    if (!c) return 0;
    if (!c.thangNhan) return c.goc;
    if (c.donSo) return DON_BAO_NHAN;
    return c.thangNhan.bac[c.thangNhan.bac.length - 1][0];
}

module.exports = {
    PHI, AN_MUC_TIEU, AN_MIN, AN_MAX, datMucAn, thongKe, mucAnHienTai, rtpBan,
    datThang, thangHienTai, thangMacDinh,
    DS, THEO_ID, NHOM_TRAN, MOI_KET_QUA, DON_BAO_NHAN,
    tongXx, laBao, demMat, taoNhan, tinhTra, cuaThang,
    tienTru, tienPhi,
    tranCua, tranMacDinh, tiLeToiDa, doGoc,
};
