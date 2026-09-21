// ============================================================================
//  cua.js — 52 CỬA CƯỢC SIC BO + HỆ SỐ NHÂN (thuần logic, không web, không DB)
//
//  Đây là LÕI TIỀN của Tài Xỉu bàn lớn. Sai ở đây là sai tiền thật của người chơi,
//  nên file này không đụng I/O gì cả và có bộ kiểm riêng:
//      node TaiXiu/kiemtra/cua-test.js
//
//  ── CÁCH CÂN BẰNG (đọc kỹ trước khi đổi số) ─────────────────────────────────
//  Bảng trả gốc (chủ server lấy từ sòng thật) CỐ TÌNH trả thấp: nhà cái ăn 10-42%
//  tuỳ cửa. Thứ kéo ngược về mức chơi được là HỆ SỐ NHÂN. Nên:
//
//      RTP = p·(g+1) + p·q·(E_m − g)
//        p   = xác suất cửa trúng (đếm thật trên 216 kết quả, không ước lượng)
//        g   = tỉ lệ trả GỐC
//        E_m = tỉ lệ trung bình khi được nhân (tính từ thang giá trị bên dưới)
//        q   = xác suất ô đó sáng đèn trong một ván  ← MÁY TỰ GIẢI RA, không gõ tay
//
//  => Đổi RTP_MUC_TIEU hoặc đổi thang nhân thì q tự tính lại. ĐỪNG hardcode q.
//  Cửa nào RTP gốc đã ≥ mục tiêu (Tài/Xỉu/Chẵn/Lẻ: 97,2%) thì KHÔNG nhân.
//
//  ── TRẦN CƯỢC ───────────────────────────────────────────────────────────────
//  Trần tỉ lệ NGHỊCH với tỉ lệ trả (giống sòng thật): trần ≈ 5 triệu ÷ tỉ lệ trả
//  cao nhất của cửa đó. Các cửa trùng mức gom thành 5 NHÓM cho admin set 1 ô/nhóm.
// ============================================================================
'use strict';

const RTP_MUC_TIEU = 0.95;   // mặc định khi admin chưa chỉnh: nhà cái ăn ~5%
// RTP ĐANG ÁP DỤNG. Admin chỉnh ở panel -> datRTP() tính lại q cho cả 48 cửa.
// Hạ RTP => q tụt => ÍT ô được bốc nhân hơn (nhà cái ăn dày hơn). Nâng thì ngược lại.
let RTP_HIEN = RTP_MUC_TIEU;
// Chặn 2 đầu cho khỏi lỡ tay: dưới 80% là ăn dày quá người chơi bỏ, trên 99% là lỗ.
const RTP_MIN = 0.80, RTP_MAX = 0.99;

// ---------------------------------------------------------------- 216 kết quả
const MOI_KET_QUA = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) MOI_KET_QUA.push([a, b, c]);
const tongXx = (x) => x[0] + x[1] + x[2];
const laBao = (x) => x[0] === x[1] && x[1] === x[2];
const demMat = (x, n) => (x[0] === n ? 1 : 0) + (x[1] === n ? 1 : 0) + (x[2] === n ? 1 : 0);

// ---------------------------------------------------------------- nhóm trần cược
// Mặc định lấy đúng bảng hạn mức sòng thật chủ server gửi. Admin sửa 1 ô là cả
// nhóm đổi theo (chủ server chốt: "số nào giống nhau thì nhảy chung").
const NHOM_TRAN = {
    deu: { ten: 'Tài/Xỉu · Chẵn/Lẻ', mac: 200000 },
    vua: { ten: 'Tổng 7-14 · 8-13 · 9-12 · 10-11 · Kết hợp', mac: 50000 },
    cao: { ten: 'Gấp đôi · Bộ ba bất kỳ · Tổng 6-15 · Đơn', mac: 20000 },
    hiem: { ten: 'Tổng 5 hoặc 16', mac: 10000 },
    cuchiem: { ten: 'Gấp ba (bão từng số) · Tổng 4 hoặc 17', mac: 5000 },
};

// ---------------------------------------------------------------- thang nhân
// [giá trị, trọng số] — số đẹp, càng to càng hiếm. Giá trị cuối = mức TỐI ĐA in
// trên bảng trả thưởng, nên đừng vượt quá kẻo quảng cáo một đằng trả một nẻo.
const thang = (arr) => {
    const w = arr.reduce((s, x) => s + x[1], 0);
    return { bac: arr, tong: w, E: arr.reduce((s, x) => s + x[0] * x[1], 0) / w };
};
const T = {
    tong4: thang([[75, 40], [100, 25], [150, 20], [250, 10], [499, 5]]),
    tong5: thang([[30, 40], [50, 25], [88, 20], [150, 10], [249, 5]]),
    tong6: thang([[20, 45], [30, 30], [50, 18], [87, 7]]),
    tong7: thang([[15, 45], [20, 30], [25, 18], [29, 7]]),
    tong8: thang([[10, 45], [14, 30], [18, 18], [24, 7]]),
    tong9: thang([[10, 45], [15, 30], [25, 18], [49, 7]]),
    tong10: thang([[8, 45], [12, 30], [18, 18], [24, 7]]),
    doi: thang([[15, 45], [25, 30], [50, 18], [87, 7]]),
    bao: thang([[200, 45], [300, 30], [500, 18], [999, 7]]),
    baoAny: thang([[40, 45], [55, 30], [70, 18], [87, 7]]),
    cap: thang([[8, 45], [12, 30], [18, 18], [24, 7]]),
    don: thang([[10, 45], [14, 30], [17, 18], [19, 7]]),   // nhân cho phần ĐÔI của cửa đơn
};

// ---------------------------------------------------------------- 52 cửa
// tra(xx) trả về SỐ LẦN ăn (0 = thua). Cửa đơn trả 1/2/3 theo số mặt trúng.
const DS = [];
const them = (o) => { DS.push(o); return o; };

// 4 cửa đều tiền — thua sạch nếu ra bão, KHÔNG được nhân (RTP gốc đã 97,2%)
them({ id: 'xiu', ten: 'XỈU 4-10', nhom: 'deu', goc: 1, thangNhan: null, tra: x => (!laBao(x) && tongXx(x) <= 10) ? 1 : 0 });
them({ id: 'tai', ten: 'TÀI 11-17', nhom: 'deu', goc: 1, thangNhan: null, tra: x => (!laBao(x) && tongXx(x) >= 11) ? 1 : 0 });
them({ id: 'chan', ten: 'CHẴN', nhom: 'deu', goc: 1, thangNhan: null, tra: x => (!laBao(x) && tongXx(x) % 2 === 0) ? 1 : 0 });
them({ id: 'le', ten: 'LẺ', nhom: 'deu', goc: 1, thangNhan: null, tra: x => (!laBao(x) && tongXx(x) % 2 === 1) ? 1 : 0 });

// 14 cửa tổng điểm 4..17
const TONG_CAU = {
    4: { goc: 50, t: T.tong4, nhom: 'cuchiem' }, 17: { goc: 50, t: T.tong4, nhom: 'cuchiem' },
    5: { goc: 20, t: T.tong5, nhom: 'hiem' }, 16: { goc: 20, t: T.tong5, nhom: 'hiem' },
    6: { goc: 15, t: T.tong6, nhom: 'cao' }, 15: { goc: 15, t: T.tong6, nhom: 'cao' },
    7: { goc: 12, t: T.tong7, nhom: 'vua' }, 14: { goc: 12, t: T.tong7, nhom: 'vua' },
    8: { goc: 8, t: T.tong8, nhom: 'vua' }, 13: { goc: 8, t: T.tong8, nhom: 'vua' },
    9: { goc: 6, t: T.tong9, nhom: 'vua' }, 12: { goc: 6, t: T.tong9, nhom: 'vua' },
    10: { goc: 6, t: T.tong10, nhom: 'vua' }, 11: { goc: 6, t: T.tong10, nhom: 'vua' },
};
for (let s = 4; s <= 17; s++) {
    const c = TONG_CAU[s];
    them({ id: 'tong' + s, ten: 'Tổng ' + s, nhom: c.nhom, goc: c.goc, thangNhan: c.t, tra: x => tongXx(x) === s ? c.goc : 0, _goc: c.goc });
}

// 6 cửa gấp đôi + 6 cửa gấp ba (bão từng số)
for (let n = 1; n <= 6; n++) {
    them({ id: 'doi' + n, ten: 'Đôi ' + n, nhom: 'cao', goc: 8, thangNhan: T.doi, tra: x => demMat(x, n) >= 2 ? 8 : 0 });
    them({ id: 'bao' + n, ten: 'Bão ' + n, nhom: 'cuchiem', goc: 150, thangNhan: T.bao, tra: x => (laBao(x) && x[0] === n) ? 150 : 0 });
}
them({ id: 'baoany', ten: 'Bão bất kỳ', nhom: 'cao', goc: 30, thangNhan: T.baoAny, tra: x => laBao(x) ? 30 : 0 });

// 15 cửa kết hợp 2 lá khác nhau
for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) {
    them({ id: 'cap' + a + b, ten: 'Cặp ' + a + '-' + b, nhom: 'vua', goc: 5, thangNhan: T.cap, tra: x => (x.includes(a) && x.includes(b)) ? 5 : 0 });
}

// 6 cửa số đơn — ăn theo SỐ MẶT trúng: 1 mặt 1:1, 2 mặt 2:1, 3 mặt 3:1.
// Nhân chỉ ăn vào phần 2 mặt / 3 mặt (bảng sòng: đơn 1:1, đôi 2-19:1, bão 3-87:1).
const DON_BAO_NHAN = 87;
for (let n = 1; n <= 6; n++) {
    them({ id: 'don' + n, ten: 'Đơn ' + n, nhom: 'cao', goc: 1, thangNhan: T.don, donSo: n, tra: x => demMat(x, n) });
}

const THEO_ID = Object.fromEntries(DS.map(c => [c.id, c]));

// ---------------------------------------------------------------- giải ra q
/** Xác suất cửa thắng + kỳ vọng ăn GỐC, đếm thật trên 216 kết quả. */
function doGoc(c) {
    let win = 0, evGoc = 0;
    for (const x of MOI_KET_QUA) {
        const k = c.tra(x);
        if (k > 0) { win++; evGoc += k + 1; }
    }
    return { p: win / MOI_KET_QUA.length, rtpGoc: evGoc / MOI_KET_QUA.length };
}
/**
 * Giải q (tần suất sáng đèn) để cửa đạt đúng RTP mục tiêu.
 * Cửa đơn tính riêng vì nhân chỉ ăn vào phần đôi/bão, không ăn phần 1 mặt.
 */
function giaiQ(c) {
    const { p, rtpGoc } = doGoc(c);
    if (!c.thangNhan || rtpGoc >= RTP_HIEN) return { p, rtpGoc, q: 0, rtpSau: rtpGoc };
    let them_;
    if (c.donSo) {
        let d2 = 0, d3 = 0;
        for (const x of MOI_KET_QUA) { const k = demMat(x, c.donSo); if (k === 2) d2++; if (k === 3) d3++; }
        them_ = (d2 * (c.thangNhan.E - 2) + d3 * (DON_BAO_NHAN - 3)) / MOI_KET_QUA.length;
    } else {
        them_ = p * (c.thangNhan.E - c.goc);
    }
    const q = Math.max(0, Math.min(1, (RTP_HIEN - rtpGoc) / them_));
    return { p, rtpGoc, q, rtpSau: rtpGoc + q * them_ };
}
/**
 * Đặt RTP mục tiêu rồi TÍNH LẠI q cho toàn bộ bàn. Gọi lúc bot khởi động (đọc từ DB)
 * và mỗi lần admin chỉnh ở panel. Trả về vài con số để panel hiện cho admin thấy
 * hạ/nâng RTP thì bàn đổi thế nào.
 */
function datRTP(rtp) {
    const r = Number(rtp);
    if (!Number.isFinite(r) || r < RTP_MIN || r > RTP_MAX) {
        return { error: `RTP phải từ ${(RTP_MIN * 100).toFixed(0)}% đến ${(RTP_MAX * 100).toFixed(0)}%` };
    }
    RTP_HIEN = r;
    for (const c of DS) Object.assign(c, giaiQ(c));
    return { ok: true, ...thongKeRTP() };
}
/** Vài con số tóm tắt bàn hiện tại, để panel in cho admin. */
function thongKeRTP() {
    const coNhan = DS.filter(c => c.q > 0);
    const oSang = DS.reduce((s2, c) => s2 + (c.q || 0), 0);        // kỳ vọng số ô sáng / ván
    // RTP trung bình khi đặt đều mọi cửa
    const rtpTB = DS.reduce((s2, c) => s2 + (c.rtpSau || c.rtpGoc || 0), 0) / DS.length;
    return {
        rtp: RTP_HIEN,
        nhaCaiAn: 1 - rtpTB,
        soCuaDuocNhan: coNhan.length,
        oSangMoiVan: oSang,
        min: RTP_MIN, max: RTP_MAX, macDinh: RTP_MUC_TIEU,
    };
}
const rtpHienTai = () => RTP_HIEN;

for (const c of DS) Object.assign(c, giaiQ(c));

// ---------------------------------------------------------------- sinh nhân
/** Bốc 1 giá trị trong thang theo trọng số. */
function bocThang(t, rnd) {
    let r = rnd() * t.tong;
    for (const [v, w] of t.bac) { r -= w; if (r <= 0) return v; }
    return t.bac[t.bac.length - 1][0];
}
/**
 * Sinh bảng nhân của MỘT ván: { cuaId: giáTrị }. Mỗi ô tự bốc độc lập theo q của
 * nó, nên số ô sáng mỗi ván không cố định (trung bình ~7). Gọi lúc KHOÁ SỔ, trước
 * khi xúc xắc quay — cả bàn phải thấy nhân giống nhau.
 * rnd: hàm sinh số 0..1 (mặc định crypto cho khỏi đoán được).
 */
function taoNhan(rnd) {
    rnd = rnd || (() => require('crypto').randomInt(0, 1e9) / 1e9);
    const out = {};
    for (const c of DS) {
        if (!c.thangNhan || c.q <= 0) continue;
        if (rnd() < c.q) out[c.id] = bocThang(c.thangNhan, rnd);
    }
    return out;
}

/**
 * Tiền một cửa ăn về (ĐÃ gồm vốn). 0 = thua sạch.
 *   cuaId, tien, xx = [a,b,c], nhan = bảng nhân của ván (có thể rỗng)
 * Cửa đơn: 1 mặt luôn trả 1:1 (không nhân), 2 mặt / 3 mặt mới ăn nhân.
 */
function tinhTra(cuaId, tien, xx, nhan) {
    const c = THEO_ID[cuaId];
    if (!c) throw new Error('Không có cửa: ' + cuaId);
    const k = c.tra(xx);
    if (k <= 0) return 0;
    const m = nhan && nhan[cuaId];
    let ti = k;                                  // số lần ăn (chưa tính vốn)
    if (m) {
        if (c.donSo) { if (k === 2) ti = m; else if (k === 3) ti = DON_BAO_NHAN; }
        else ti = m;
    }
    return tien + tien * ti;
}

/**
 * Danh sách id các cửa TRÚNG với bộ xúc xắc này.
 * Bàn web tô sáng/làm xám theo đúng danh sách này, nên luật thắng chỉ nằm MỘT chỗ.
 */
function cuaThang(xx) {
    return DS.filter(c => c.tra(xx) > 0).map(c => c.id);
}

/** Trần cược của một cửa, theo nhóm. tranNhom = { deu: 200000, ... } (admin set). */
function tranCua(cuaId, tranNhom) {
    const c = THEO_ID[cuaId];
    if (!c) return 0;
    const n = tranNhom && tranNhom[c.nhom];
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : NHOM_TRAN[c.nhom].mac;
}
/** Bảng trần mặc định — dùng khi admin chưa đặt gì. */
const tranMacDinh = () => Object.fromEntries(Object.keys(NHOM_TRAN).map(k => [k, NHOM_TRAN[k].mac]));

/** Tỉ lệ trả cao nhất của cửa (để web in "50-499:1" và tính trần). */
function tiLeToiDa(cuaId) {
    const c = THEO_ID[cuaId];
    if (!c) return 0;
    if (!c.thangNhan) return c.goc;
    if (c.donSo) return DON_BAO_NHAN;
    return c.thangNhan.bac[c.thangNhan.bac.length - 1][0];
}

module.exports = {
    RTP_MUC_TIEU, RTP_MIN, RTP_MAX, datRTP, thongKeRTP, rtpHienTai,
    DS, THEO_ID, NHOM_TRAN, MOI_KET_QUA, DON_BAO_NHAN,
    tongXx, laBao, demMat, taoNhan, tinhTra, cuaThang, tranCua, tranMacDinh, tiLeToiDa, doGoc,
};
