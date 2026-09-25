// ============================================================================
//  cua.js, LÕI TIỀN "ROULETTE" (154 cửa, đủ 9 kiểu cược, nhân chỉ rơi vào SỐ ĐƠN)
//
//  Thuần logic: không web, không DB, không Discord. Bộ kiểm riêng:
//      node Roulette/kiemtra/cua-test.js
//
//  ── DỰNG THEO ĐÚNG ẢNH "CÁCH CHƠI" CHỦ SERVER GỬI (25/09) ───────────────────
//  Vòng bên trong:  Trực tiếp (1 số) · Tác (2 số) · Dãy (3 số) · Góc (4 số) · Hàng (6 số)
//  Vòng bên ngoài:  Cột · Tá · Đỏ/Đen · Chẵn/Lẻ · 1-18/19-36
//
//  ── HỆ SỐ NHÂN CHỈ RƠI VÀO SỐ ĐƠN ───────────────────────────────────────────
//  Chủ server chốt: "chip đặt được ở ngã 4 chứ không phải nhân ở ngã 4".
//  Đúng luật game thật: huy hiệu nhân phải nằm GỌN trong một ô số, nếu treo ở
//  giao điểm thì không ai biết nó thuộc ô nào.
//
//  Tiền nuôi hệ số nhân lấy từ chính cửa số đơn: trả thưởng số đơn bị CẮT từ
//  35:1 xuống 29:1 (RTP tụt từ 97,30% còn 81,08%), phần 16,22 điểm thiếu do
//  hệ số nhân bù lại. Mọi kiểu cược khác trả CHUẨN, RTP gốc đều đúng 36/37.
//
//  ── NHÀ CÁI ĂN: MỘT MỨC PHÍ DUY NHẤT CHO MỌI KIỂU CƯỢC ──────────────────────
//  Roulette chuẩn chỉ để nhà cái ăn 2,70%. Muốn ăn 8% mà KHÔNG phá bảng trả
//  thưởng quen thuộc (Đỏ 1:1, Tá 2:1, Góc 8:1...) thì phải thu phí trên tiền cược:
//
//      phí = (36/37) / (1 − nhà_cái_ăn) − 1
//
//  Nhà cái ăn 8% thì phí 5,7579%. Đặt 10.000 trừ ví 10.575.
//  Vì MỌI cửa có cùng RTP gốc 36/37 nên một mức phí là đủ: kiểu cược nào cũng
//  ra đúng 8%. Admin đổi mức ăn ở panel, phí tự suy lại.
//
//  ── BÀI HỌC ĐÃ TRẢ GIÁ (đừng lặp lại) ───────────────────────────────────────
//  Bản đầu 25/09 cho MỌI cửa đều có hệ số nhân với phí cố định 20%. Sai hai chỗ:
//  huy hiệu nhân của cửa Góc không biết vẽ vào đâu, và nếu bỏ nhân của Góc đi
//  thì riêng ô đó nhà cái ăn 18,92% trong khi ô khác ăn 8%.
// ============================================================================
'use strict';

// RTP gốc chuẩn của roulette một số 0. MỌI kiểu cược trả chuẩn đều ra đúng số này:
// Đỏ 1:1 × 18/37, Tá 2:1 × 12/37, Góc 8:1 × 4/37, Tác 17:1 × 2/37... đều = 36/37.
const RTP_CHUAN = 36 / 37;

// Nhà cái ăn bao nhiêu. Admin chỉnh ở panel, phí tự suy ra từ đây.
const AN_MUC_TIEU = 0.08;              // bằng bàn Tài Xỉu thường và bàn Siêu
// ⚠️ SÀN DƯỚI CÓ THẬT. Roulette chuẩn đã để nhà cái ăn sẵn 1 − 36/37 = 2,7027%.
// Đặt mức ăn THẤP HƠN số đó thì phí tính ra ÂM, nghĩa là bàn phải bù tiền: đặt
// 10.000 chỉ trừ ví 9.928. Nên sàn 3%, trên mốc 2,7027% một quãng an toàn.
// Trần 20% vì lúc đó phí đã 21,6%, cao hơn nữa là người chơi bỏ bàn.
const AN_MIN = 0.03, AN_MAX = 0.20;
let AN_HIEN = AN_MUC_TIEU;

/** Phí thu trên tiền cược, suy ra từ mức nhà cái muốn ăn. KHÔNG gõ tay. */
const phiSuat = () => RTP_CHUAN / (1 - AN_HIEN) - 1;

// ---------------------------------------------------------------- 37 kết quả
const O_SO = 37;
const MOI_KET_QUA = [];
for (let i = 0; i < O_SO; i++) MOI_KET_QUA.push(i);

// Thứ tự ô TRÊN BÀN QUAY châu Âu (một số 0). Web vẽ vòng theo đúng mảng này,
// panel cũng đọc từ đây, để hình và tiền không bao giờ lệch nhau.
const VONG = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SO_DO = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const laDo = (n) => SO_DO.has(n);
const laDen = (n) => n !== 0 && !SO_DO.has(n);
const ta = (n) => (n === 0 ? 0 : Math.ceil(n / 12));          // 1 | 2 | 3, số 0 là 0
const cot = (n) => (n === 0 ? 0 : ((n - 1) % 3) + 1);         // 1 | 2 | 3, số 0 là 0

// ---------------------------------------------------------------- nhóm trần cược
// Chỉ SỐ ĐƠN mới ăn đậm được (nhờ hệ số nhân), nên trần nó thấp nhất. Mấy kiểu
// kia trả chuẩn nên trần đặt sao cho thắng đậm nhất một ô đều quanh 300.000,
// đúng nết roulette thật: cược trong hạn mức thấp, cược ngoài hạn mức cao.
const NHOM_TRAN = {
    so: { ten: 'Trực tiếp, 1 số (29:1, có hệ số nhân tới 500:1)', mac: 5000 },
    tac: { ten: 'Tác, 2 số (17:1)', mac: 20000 },
    day: { ten: 'Dãy, 3 số (11:1)', mac: 30000 },
    goc: { ten: 'Góc, 4 số (8:1)', mac: 40000 },
    hang: { ten: 'Hàng, 6 số (5:1)', mac: 60000 },
    ta: { ten: 'Tá và Cột (2:1)', mac: 150000 },
    deu: { ten: 'Đỏ/Đen · Chẵn/Lẻ · 1-18/19-36 (1:1)', mac: 300000 },
};

// ---------------------------------------------------------------- thang nhân
const thang = (arr) => {
    const w = arr.reduce((s, x) => s + x[1], 0);
    return { bac: arr, tong: w, E: arr.reduce((s, x) => s + x[0] * x[1], 0) / w };
};
// ⚠️ Mức cuối quyết định trần cược ở NHOM_TRAN.so. Mức đầu phải LỚN HƠN 29 (tỉ lệ
// gốc đã cắt), không thì "trúng có nhân" lại ít tiền hơn "trúng thường".
// 25/09 chủ server: "mỗi ván cho 2 tới 11 ô có nhân" + "thêm nhiều bậc thang". Thang 13 bậc, mức
// trung bình ~64 để số sét trung bình ~6,3/ván (công thức: sét/ván = 37·6/(E − 29)). Hạ thang là
// nhiều ô sáng hơn nhưng mỗi ô nhỏ hơn; tổng tiền nhà cái trả cho sét KHÔNG đổi.
// Chốt 25/09 sau khi so với Lightning Roulette thật (1-5 số sét, x50-x500, người đặt 1 số trúng
// sét 0,25% ván): thang 7 bậc x50-x500, trung bình ~80 -> ~4,4 số sét/ván, trúng sét 0,33% ván.
// Bản 2-11 ô x30-x500 trước đó cho trúng sét 0,46%, chủ server sợ "nhân nhiều mặc định trúng".
const THANG_GOC = {
    so: [[50, 100], [75, 50], [100, 28], [150, 12], [200, 6], [300, 3], [500, 1]],
};
// ── SỐ Ô SÉT MỖI VÁN: bảng tỉ lệ admin đặt, KHÔNG rải đều (chủ server 25/09) ──
// [số ô, độ hiếm]: 2 ô hay gặp nhất, 11 ô hiếm nhất. Độ hiếm là tương đối, như thang nhân.
// Máy giữ HÌNH DẠNG bảng này rồi nghiêng một hệ số duy nhất (w_k · x^k) để trung bình số ô
// sáng khớp đúng điều thang nhân đòi hỏi, nhờ vậy nhà cái vẫn ăn đúng mức đã đặt.
const SET_GOC = [[2, 30], [3, 26], [4, 20], [5, 13], [6, 7], [7, 4]];
let SET_HIEN = SET_GOC.map(x => x.slice());
let PHAN_PHOI_SET = [];   // [{k, p}] sau khi nghiêng, taoNhan bốc từ đây
const T = {};
function dungT(bang) { for (const k of Object.keys(bang)) T[k] = thang(bang[k]); }
dungT(THANG_GOC);
let THANG_HIEN = JSON.parse(JSON.stringify(THANG_GOC));

// ---------------------------------------------------------------- 154 cửa
// tra(n) trả về SỐ LẦN ăn (0 = thua), KHÔNG gồm vốn.
const DS = [];
const them = (o) => { DS.push(o); return o; };
/** Cửa phủ một tập số, trả cố định. Dùng cho Tác / Dãy / Góc / Hàng. */
function themTap(id, ten, nhom, goc, bo) {
    const tap = new Set(bo);
    return them({ id, ten, nhom, goc, thangNhan: null, bo: bo.slice(), tra: (x) => (tap.has(x) ? goc : 0) });
}

// ── Trực tiếp: 37 ô, 29:1, CHỈ KIỂU NÀY CÓ HỆ SỐ NHÂN ──
const SO_GOC = 29;
for (let n = 0; n < O_SO; n++) {
    them({
        id: 's' + n, ten: 'Số ' + n, nhom: 'so', goc: SO_GOC,
        thangNhan: T.so, _thang: 'so', so: n,
        tra: (x) => (x === n ? SO_GOC : 0),
    });
}

// ── Tác: 2 số kề nhau, 17:1. Ngang trong một hàng, dọc giữa hai hàng, và 0 với 1/2/3 ──
const TAC = [];
for (let h = 1; h <= 12; h++) {                    // ngang: (1,2) (2,3) (4,5) (5,6) ...
    const dau = (h - 1) * 3 + 1;
    TAC.push([dau, dau + 1]); TAC.push([dau + 1, dau + 2]);
}
for (let a = 1; a <= 33; a++) TAC.push([a, a + 3]);   // dọc: (1,4) (2,5) ... (33,36)
TAC.push([0, 1]); TAC.push([0, 2]); TAC.push([0, 3]); // số 0 kề 3 ô đầu
for (const bo of TAC) themTap('t' + bo[0] + '_' + bo[1], 'Tác ' + bo.join('-'), 'tac', 17, bo);

// ── Dãy: trọn một hàng 3 số, 11:1 ──
const DAY = [];
for (let h = 1; h <= 12; h++) { const d = (h - 1) * 3 + 1; DAY.push([d, d + 1, d + 2]); }
for (const bo of DAY) themTap('d' + bo[0], 'Dãy ' + bo[0] + '-' + bo[2], 'day', 11, bo);

// ── Góc: ô vuông 4 số nơi bốn số gặp nhau, 8:1. Đặt tên theo số TRÊN BÊN TRÁI ──
const GOC4 = [];
for (let h = 1; h <= 11; h++) {          // 11 đường ngang bên trong
    for (let c = 1; c <= 2; c++) {       // 2 đường dọc bên trong
        const a = (h - 1) * 3 + c;
        GOC4.push([a, a + 1, a + 3, a + 4]);
    }
}
for (const bo of GOC4) themTap('g' + bo[0], 'Góc ' + bo.join('-'), 'goc', 8, bo);

// ── Hàng: hai dãy liền nhau, 6 số, 5:1 ──
const HANG = [];
for (let h = 1; h <= 11; h++) {
    const d = (h - 1) * 3 + 1;
    HANG.push([d, d + 1, d + 2, d + 3, d + 4, d + 5]);
}
for (const bo of HANG) themTap('h' + bo[0], 'Hàng ' + bo[0] + '-' + bo[5], 'hang', 5, bo);

// ── Vòng ngoài. Ra 0 là thua sạch, đúng luật chuẩn (ảnh luật ghi rõ "không có số 0") ──
const TEN_TA = { 1: 'Tá 1 (1-12)', 2: 'Tá 2 (13-24)', 3: 'Tá 3 (25-36)' };
for (let k = 1; k <= 3; k++) {
    them({ id: 'ta' + k, ten: TEN_TA[k], nhom: 'ta', goc: 2, thangNhan: null, tra: (x) => (ta(x) === k ? 2 : 0) });
}
for (let k = 1; k <= 3; k++) {
    them({ id: 'cot' + k, ten: 'Cột ' + k, nhom: 'ta', goc: 2, thangNhan: null, tra: (x) => (cot(x) === k ? 2 : 0) });
}
them({ id: 'do', ten: 'ĐỎ', nhom: 'deu', goc: 1, thangNhan: null, tra: (x) => (laDo(x) ? 1 : 0) });
them({ id: 'den', ten: 'ĐEN', nhom: 'deu', goc: 1, thangNhan: null, tra: (x) => (laDen(x) ? 1 : 0) });
them({ id: 'chan', ten: 'CHẴN', nhom: 'deu', goc: 1, thangNhan: null, tra: (x) => (x !== 0 && x % 2 === 0 ? 1 : 0) });
them({ id: 'le', ten: 'LẺ', nhom: 'deu', goc: 1, thangNhan: null, tra: (x) => (x !== 0 && x % 2 === 1 ? 1 : 0) });
them({ id: 'thap', ten: '1-18', nhom: 'deu', goc: 1, thangNhan: null, tra: (x) => (x >= 1 && x <= 18 ? 1 : 0) });
them({ id: 'cao', ten: '19-36', nhom: 'deu', goc: 1, thangNhan: null, tra: (x) => (x >= 19 && x <= 36 ? 1 : 0) });

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
/**
 * Mọi cửa đều phải về đúng RTP_CHUAN trước khi thu phí. Cửa trả chuẩn thì đã đúng
 * sẵn (q = 0). Riêng SỐ ĐƠN bị cắt còn 29:1 nên thiếu, hệ số nhân bù cho đủ.
 */
// ── Giải bảng số ô sét ──
// 37 ô số cùng thang, cùng p, nên cùng một xác suất sáng qHieu = 6/(E − 29) (để RTP về 36/37).
// Số ô sáng trung bình cần có: T = 37·qHieu. Máy bốc SỐ Ô K từ bảng SET_HIEN đã nghiêng
// w_k·x^k, với x giải bằng chia đôi sao cho E[K] = T, rồi chọn K ô khác nhau đều nhau. Khi đó
// mỗi ô sáng đúng xác suất T/37 = qHieu, tiền đúng. Nghiêng chỉ làm được khi T nằm giữa số ô
// nhỏ nhất và lớn nhất trong bảng; ngoài khoảng thì datThang / datKhoangSet đã chặn.
function trungBinhSet(bang, x) {
    let tu = 0, mau = 0;
    for (const [k, w] of bang) { const g = w * Math.pow(x, k); tu += k * g; mau += g; }
    return mau > 0 ? tu / mau : 0;
}
/** Số sét trung bình mỗi ván mà thang ĐÒI HỎI = 37 · 6 / (E − 29). Infinity nếu thang vô nghĩa. */
function setDoiHoi(c) {
    const { p, rtpGoc } = doGoc(c);
    const them_ = p * (c.thangNhan.E - c.goc);
    return them_ > 0 ? O_SO * (RTP_CHUAN - rtpGoc) / them_ : Infinity;
}
function dungPhanPhoiSet(T) {
    const ks = SET_HIEN.map(x => x[0]);
    const kMin = Math.min(...ks), kMax = Math.max(...ks);
    let x;
    if (T <= kMin) x = 0; else if (T >= kMax) x = Infinity;
    else { let lo = 1e-6, hi = 1e6; for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (trungBinhSet(SET_HIEN, m) < T) lo = m; else hi = m; } x = Math.sqrt(lo * hi); }
    let out;
    if (x === 0) out = [{ k: kMin, p: 1 }];
    else if (x === Infinity) out = [{ k: kMax, p: 1 }];
    else { const tong = SET_HIEN.reduce((s, [k, w]) => s + w * Math.pow(x, k), 0); out = SET_HIEN.map(([k, w]) => ({ k, p: w * Math.pow(x, k) / tong })); }
    PHAN_PHOI_SET = out.sort((a, b) => a.k - b.k);
    return PHAN_PHOI_SET;
}
function giaiQ(c) {
    const { p, rtpGoc } = doGoc(c);
    if (!c.thangNhan || rtpGoc >= RTP_CHUAN) return { p, rtpGoc, q: 0, qHieu: 0, rtpSau: rtpGoc };
    const them_ = p * (c.thangNhan.E - c.goc);
    if (!(them_ > 0)) return { p, rtpGoc, q: 0, qHieu: 0, rtpSau: rtpGoc };
    const qHieu = Math.max(0, Math.min(1, (RTP_CHUAN - rtpGoc) / them_));
    return { p, rtpGoc, q: qHieu, qHieu, rtpSau: rtpGoc + qHieu * them_ };
}
function giaiHet() {
    for (const c of DS) Object.assign(c, giaiQ(c));
    const so = DS.find(c => c.nhom === 'so');
    dungPhanPhoiSet(so ? O_SO * so.qHieu : 0);
}
giaiHet();

/** Admin đặt MỨC NHÀ CÁI ĂN. Nhận 0.10 hoặc 10 đều được. Chỉ đổi phí, không đụng q. */
function datMucAn(muc) {
    let a = Number(muc);
    if (Number.isFinite(a) && a > 1) a = a / 100;
    if (!Number.isFinite(a) || a < AN_MIN || a > AN_MAX) {
        return { error: `Nhà cái ăn phải từ ${(AN_MIN * 100).toFixed(0)}% đến ${(AN_MAX * 100).toFixed(0)}%` };
    }
    AN_HIEN = a;
    return { ok: true, ...thongKe() };
}
/** Nhà cái ăn THẬT ở một cửa, đo từ chính bảng trả thưởng của nó. */
const anCua = (c) => 1 - (c.rtpSau || c.rtpGoc) / (1 + phiSuat());
function thongKe() {
    const coNhan = DS.filter(c => c.q > 0);
    const oSang = DS.reduce((s, c) => s + (c.q || 0), 0);
    const anMoiCua = DS.map(anCua);
    const ket = DS.filter(c => c.thangNhan && c.q >= 1).map(c => c.id);
    return {
        an: AN_HIEN,                       // mức admin đặt
        phi: phiSuat(),                    // phí suy ra, thu trên tiền cược
        rtpChuan: RTP_CHUAN,
        rtpThuc: 1 - Math.max(...anMoiCua), // người chơi thực nhận (cửa tệ nhất)
        anThuc: Math.max(...anMoiCua),      // nhà cái ăn thật, cửa ăn đậm nhất
        anLech: Math.max(...anMoiCua) - Math.min(...anMoiCua),   // phải là 0
        soCua: DS.length,
        soCuaDuocNhan: coNhan.length,
        oSangMoiVan: oSang,
        cuaKetTran: ket,
        // bảng số ô sét: admin đặt (setBang) và xác suất THẬT sau khi máy nghiêng (phanPhoiSet)
        setBang: SET_HIEN.map(x => x.slice()),
        phanPhoiSet: PHAN_PHOI_SET.map(x => ({ k: x.k, p: x.p })),
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
        if (!Array.isArray(bac) || bac.length < 2 || bac.length > 16) {
            return { error: 'Nhóm "' + ten + '": phải có từ 2 đến 16 bậc' };
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
    // Bậc thấp nhất phải CAO HƠN tỉ lệ gốc, không thì trúng có nhân lại ít tiền hơn
    // trúng thường. Và trung bình thang phải đủ cao để kéo RTP về chuẩn (q ≤ 1).
    for (const c of DS) {
        if (!c._thang || !moi[c._thang]) continue;
        const bac = moi[c._thang];
        if (bac[0][0] <= c.goc) {
            return { error: `Nhóm "${c._thang}": bậc thấp nhất x${bac[0][0]} phải LỚN HƠN tỉ lệ gốc ${c.goc}:1` };
        }
        // Thang quyết định số ô sét trung bình T = 37·6/(E − 29). T phải nằm trong khoảng số ô của
        // bảng sét (mặc định 2..11), không thì máy không nghiêng bảng cho khớp được -> tiền lệch.
        const E = thang(bac).E, p = doGoc(c).p, thieu = RTP_CHUAN - doGoc(c).rtpGoc;
        const T = p * (E - c.goc) > 0 ? O_SO * thieu / (p * (E - c.goc)) : Infinity;
        const loi = kiemSetKhop(T, E);
        if (loi) return { error: `Nhóm "${c._thang}": ` + loi };
    }
    THANG_HIEN = moi;
    dungT(THANG_HIEN);
    for (const c of DS) if (c.thangNhan) c.thangNhan = T[c._thang];
    giaiHet();
    return { ok: true, thang: thangHienTai(), ...thongKe() };
}

// ---------------------------------------------------------------- bảng số ô sét: admin sửa
/** Thang đòi T ô sét/ván; bảng sét phải bao được T. Trả chuỗi lỗi hoặc null. */
function kiemSetKhop(T, E, bang) {
    const b = bang || SET_HIEN;
    const ks = b.map(x => x[0]);
    const kMin = Math.min(...ks), kMax = Math.max(...ks);
    if (!Number.isFinite(T) || T <= 0) return 'thang vô nghĩa (trung bình phải lớn hơn tỉ lệ gốc 29)';
    if (T < kMin) return `thang cao (trung bình x${E.toFixed(1)}) chỉ đủ tiền cho ${T.toFixed(2)} ô sét/ván, mà bảng số ô sét ít nhất ${kMin} ô. Hạ thang xuống hoặc hạ số ô nhỏ nhất trong bảng sét.`;
    if (T > kMax) return `thang thấp (trung bình x${E.toFixed(1)}) đòi ${T.toFixed(2)} ô sét/ván, mà bảng số ô sét nhiều nhất ${kMax} ô. Nâng thang lên hoặc nâng số ô lớn nhất trong bảng sét.`;
    return null;
}
const setHienTai = () => SET_HIEN.map(x => x.slice());
const setMacDinh = () => SET_GOC.map(x => x.slice());
/**
 * Admin đặt bảng SỐ Ô SÉT: [[số ô, độ hiếm], ...] hoặc {2:10, 3:9, ...}. Số ô 1..37, độ hiếm 1..1000,
 * không trùng số ô. Bảng phải bao được số ô mà thang hiện tại đòi hỏi.
 */
function datKhoangSet(bang) {
    let ds = Array.isArray(bang) ? bang : (bang && typeof bang === 'object' ? Object.keys(bang).map(k => [k, bang[k]]) : null);
    if (!ds || !ds.length) return { error: 'Thiếu bảng số ô sét' };
    if (ds.length < 1 || ds.length > 37) return { error: 'Bảng số ô sét: từ 1 đến 37 dòng' };
    const moi = []; const thay = new Set();
    for (const d of ds) {
        if (!Array.isArray(d) || d.length !== 2) return { error: 'Mỗi dòng phải là (số ô, độ hiếm)' };
        const k = Math.floor(Number(d[0])), w = Math.floor(Number(d[1]));
        if (!Number.isFinite(k) || k < 1 || k > O_SO) return { error: 'Số ô "' + d[0] + '" phải từ 1 đến 37' };
        if (!Number.isFinite(w) || w < 1 || w > 1000) return { error: 'Độ hiếm của ' + k + ' ô phải từ 1 đến 1000' };
        if (thay.has(k)) return { error: 'Số ô ' + k + ' bị lặp' };
        thay.add(k); moi.push([k, w]);
    }
    moi.sort((a, b) => a[0] - b[0]);
    const so = DS.find(c => c.nhom === 'so');
    const E = so.thangNhan.E, T = O_SO * so.qHieu;
    const loi = kiemSetKhop(T, E, moi);
    if (loi) return { error: 'Bảng số ô sét: ' + loi };
    SET_HIEN = moi;
    giaiHet();
    return { ok: true, set: setHienTai(), ...thongKe() };
}

// ---------------------------------------------------------------- sinh nhân
function bocThang(t, rnd) {
    let r = rnd() * t.tong;
    for (const b of t.bac) { r -= b[1]; if (r <= 0) return b[0]; }
    return t.bac[t.bac.length - 1][0];
}
/** Bốc "số sét" của ván. Chỉ SỐ ĐƠN mới được bốc, nên huy hiệu luôn nằm gọn trong ô. */
/** Bốc "số sét" của ván: bốc SỐ Ô K theo bảng đã nghiêng, rồi chọn K ô số khác nhau, mỗi ô một hệ số. */
function taoNhan(rnd) {
    rnd = rnd || (() => require('crypto').randomInt(0, 1e9) / 1e9);
    const out = {};
    const so = DS.filter(c => c.nhom === 'so' && c.thangNhan && c.q > 0);
    if (!so.length || !PHAN_PHOI_SET.length) return out;
    let r = rnd(), K = PHAN_PHOI_SET[PHAN_PHOI_SET.length - 1].k;
    for (const x of PHAN_PHOI_SET) { r -= x.p; if (r <= 0) { K = x.k; break; } }
    K = Math.min(K, so.length);
    // chọn K ô khác nhau đều nhau (xáo Fisher-Yates một phần)
    const o = so.slice();
    for (let i = 0; i < K; i++) {
        const j = i + Math.floor(rnd() * (o.length - i));
        const t = o[i]; o[i] = o[j]; o[j] = t;
        out[o[i].id] = bocThang(o[i].thangNhan, rnd);
    }
    return out;
}

// ---------------------------------------------------------------- tiền
/** Riêng phần phí, để ghi sổ / hiện cho người chơi. */
const tienPhi = (tien) => Math.floor(Math.floor(tien) * phiSuat());
/** Tiền THỰC TRỪ khỏi ví khi đặt `tien` (đã gồm phí). */
const tienTru = (tien) => Math.floor(tien) + tienPhi(tien);

/**
 * Tiền một cửa ăn về (ĐÃ gồm vốn GỐC, KHÔNG gồm phí, phí không hoàn).
 * 0 = thua sạch. Hệ số nhân THAY THẾ tỉ lệ gốc, không cộng dồn.
 */
function tinhTra(cuaId, tien, so, nhan) {
    const c = THEO_ID[cuaId];
    if (!c) throw new Error('Không có cửa: ' + cuaId);
    const k = c.tra(so);
    if (k <= 0) return 0;
    const m = nhan && nhan[cuaId];
    const ti = m ? m : k;
    return tien + tien * ti;
}

const cuaThang = (so) => DS.filter(c => c.tra(so) > 0).map(c => c.id);

/** Ô THẬT SỰ ĂN NHÂN trong ván: trúng VÀ hệ số có áp vào tiền. */
function cuaAnNhan(so, nhan) {
    if (!nhan || typeof nhan !== 'object') return [];
    return Object.keys(nhan).filter(id => {
        const c = THEO_ID[id];
        if (!c || !(Number(nhan[id]) > 1)) return false;
        return c.tra(so) > 0;
    });
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
    return c.thangNhan.bac[c.thangNhan.bac.length - 1][0];
}

module.exports = {
    AN_MUC_TIEU, AN_MIN, AN_MAX, RTP_CHUAN, SO_GOC,
    datMucAn, thongKe, mucAnHienTai, phiSuat, anCua,
    datThang, thangHienTai, thangMacDinh,
    datKhoangSet, setHienTai, setMacDinh, kiemSetKhop,
    DS, THEO_ID, NHOM_TRAN, MOI_KET_QUA, O_SO, VONG, SO_DO,
    TAC, DAY, GOC4, HANG,
    laDo, laDen, ta, cot,
    taoNhan, tinhTra, cuaThang, cuaAnNhan,
    tienTru, tienPhi,
    tranCua, tranMacDinh, tiLeToiDa, doGoc,
};
