// ============================================================================
//  bai.js, BỘ BÀI 52 LÁ + LUẬT BỘ BÀI TIẾN LÊN MIỀN NAM
//  Thuần logic: không dính web, không dính ván, không dính tiền. Sai ở đây là sai
//  cả ván nên có bộ kiểm riêng: node TienLen/kiemtra/bai-test.js
//
//  MÃ LÁ dùng ĐÚNG tên file ảnh (DÙNG CHUNG với Poker: ../Poker/bai/*.webp) để web
//  ghép thẳng 'bai/' + ma + '.webp', không cần bảng tra:
//      số:   3 4 5 6 7 8 9 10 J Q K A 2
//      chất: s = ♠ bích · c = ♣ chuồn · d = ♦ rô · h = ♥ cơ
//      ví dụ: '3s' (3 bích) · '10h' (10 cơ) · 'Qd' (đầm rô) · '2h' (heo cơ)
//
//  ⚠️ KHÁC POKER HAI CHỖ, đừng chép nhầm:
//   1. THỨ TỰ SỐ: 3 nhỏ nhất, 2 (heo) LỚN NHẤT, 3<4<...<10<J<Q<K<A<2.
//   2. CHẤT CÓ THỨ BẬC: ♠ < ♣ < ♦ < ♥. Hai lá cùng số vẫn phân được lớn nhỏ.
// ============================================================================
'use strict';
const crypto = require('crypto');

// xếp từ NHỎ tới LỚN, chỉ số trong mảng chính là "hạng" dùng để so
const SO = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const CHAT = ['s', 'c', 'd', 'h'];
const CHAT_KY_TU = { s: '♠', c: '♣', d: '♦', h: '♥' };
const HEO = '2';                 // "heo" = con 2, lá mạnh nhất, KHÔNG được vào sảnh / đôi thông

const HANG_SO = {}; SO.forEach((s, i) => { HANG_SO[s] = i; });
const HANG_CHAT = {}; CHAT.forEach((c, i) => { HANG_CHAT[c] = i; });

const BO52 = [];
for (const s of SO) for (const c of CHAT) BO52.push(s + c);

/** Tách mã lá -> { so, chat, hang, chatHang, tri }. '10' dài 2 ký tự nên cắt từ CUỐI. */
function doc(ma) {
    const chat = String(ma).slice(-1);
    const so = String(ma).slice(0, -1);
    if (HANG_CHAT[chat] === undefined || HANG_SO[so] === undefined) throw new Error('Mã lá bài lạ: ' + ma);
    // tri = giá trị tuyệt đối của lá, so 2 lá bất kỳ chỉ cần so số này
    return { so, chat, hang: HANG_SO[so], chatHang: HANG_CHAT[chat], tri: HANG_SO[so] * 4 + HANG_CHAT[chat] };
}
const tri = (ma) => doc(ma).tri;
const laHeo = (ma) => doc(ma).so === HEO;
/** Viết cho người đọc: 'Kh' -> 'K♥' */
const ten1 = (ma) => { const l = doc(ma); return l.so + CHAT_KY_TU[l.chat]; };
const tenBai = (la) => (la || []).map(ten1).join(' ');

// ---------------------------------------------------------------------------
//  XÁO BÀI, crypto.randomInt chứ KHÔNG Math.random: ván này ăn Dogcoin thật,
//  bộ sinh số phải không đoán trước được. Fisher-Yates chuẩn (chạy từ cuối về đầu).
// ---------------------------------------------------------------------------
function xao(bo) {
    const a = bo.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const boMoi = () => xao(BO52);
/** Cắt n lá ra khỏi bộ (bộ bị rút ngắn). */
function chia(bo, n) {
    if (bo.length < n) throw new Error('Bộ bài không đủ ' + n + ' lá (còn ' + bo.length + ')');
    return bo.splice(0, n);
}
/** 🔀 NÚT XẾP BÀI: nhỏ -> lớn theo số, cùng số thì theo chất (♠♣♦♥). */
const xepBai = (la) => la.slice().sort((a, b) => tri(a) - tri(b));

// ---------------------------------------------------------------------------
//  NHẬN DẠNG BỘ
//  Trả { kieu, dai, la, cao, ten } hoặc null nếu mớ lá không thành bộ hợp lệ.
//    kieu: 'rac' 1 lá · 'doi' 2 · 'ba' 3 · 'tu' tứ quý 4 · 'sanh' ≥3 lá liên tiếp
//          · 'thong' ≥3 đôi liên tiếp
//    dai:  số LÁ với rac/doi/ba/tu/sanh · số ĐÔI với thong (3 đôi thông -> dai 3)
//    cao:  lá lớn nhất của bộ (mã lá), mọi phép so đều quy về tri(cao)
//  Luật: sảnh và đôi thông KHÔNG được chứa heo (2). Sảnh tối thiểu 3 lá, đôi thông
//  tối thiểu 3 đôi. Tứ quý và đôi thông từ 3 trở lên là HÀNG CHẶT (xem chatDuoc).
// ---------------------------------------------------------------------------
function nhanDang(la) {
    if (!Array.isArray(la) || la.length === 0) return null;
    if (new Set(la).size !== la.length) return null;              // lá trùng = gian
    let c; try { c = la.map(doc); } catch (e) { return null; }    // mã lá lạ
    const xep = la.slice().sort((a, b) => tri(a) - tri(b));
    const cao = xep[xep.length - 1];
    const dem = {};                                               // số -> mấy lá
    for (const x of c) dem[x.so] = (dem[x.so] || 0) + 1;
    const soKhac = Object.keys(dem);

    // ---- cùng một số: rác / đôi / ba / tứ quý ----
    if (soKhac.length === 1) {
        const n = la.length;
        if (n === 1) return { kieu: 'rac', dai: 1, la: xep, cao, ten: ten1(cao) };
        if (n === 2) return { kieu: 'doi', dai: 2, la: xep, cao, ten: 'đôi ' + soKhac[0] };
        if (n === 3) return { kieu: 'ba', dai: 3, la: xep, cao, ten: 'ba ' + soKhac[0] };
        if (n === 4) return { kieu: 'tu', dai: 4, la: xep, cao, ten: 'tứ quý ' + soKhac[0] };
        return null;
    }

    // ---- sảnh: mỗi số đúng 1 lá, hạng liên tiếp, không heo, ≥ 3 lá ----
    if (soKhac.every(s => dem[s] === 1) && la.length >= 3) {
        const h = c.map(x => x.hang).sort((a, b) => a - b);
        const lienTiep = h.every((v, i) => i === 0 || v === h[i - 1] + 1);
        if (lienTiep && !c.some(x => x.so === HEO)) {
            const caoS = xep[xep.length - 1];
            return { kieu: 'sanh', dai: la.length, la: xep, cao: caoS, ten: 'sảnh ' + la.length + ' lá tới ' + ten1(caoS) };
        }
    }

    // ---- đôi thông: toàn đôi, hạng liên tiếp, không heo, ≥ 3 đôi ----
    if (la.length % 2 === 0 && soKhac.every(s => dem[s] === 2) && soKhac.length >= 3) {
        const h = soKhac.map(s => HANG_SO[s]).sort((a, b) => a - b);
        const lienTiep = h.every((v, i) => i === 0 || v === h[i - 1] + 1);
        if (lienTiep && !soKhac.includes(HEO)) {
            const caoT = xep[xep.length - 1];
            return { kieu: 'thong', dai: soKhac.length, la: xep, cao: caoT, ten: soKhac.length + ' đôi thông tới ' + caoT.slice(0, -1) };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
//  SO BỘ CÙNG KIỂU: 1 = a lớn hơn, -1 = b lớn hơn, null = không so được
//  (khác kiểu hoặc khác độ dài thì KHÔNG so, muốn ăn phải đi đường CHẶT).
//  Mọi kiểu đều quy về lá cao nhất; vì chất có thứ bậc nên không bao giờ hoà.
// ---------------------------------------------------------------------------
function soBo(a, b) {
    if (!a || !b) return null;
    if (a.kieu !== b.kieu || a.dai !== b.dai) return null;
    const x = tri(a.cao), y = tri(b.cao);
    return x === y ? 0 : (x > y ? 1 : -1);
}

// ---------------------------------------------------------------------------
//  CHẶT (bom), đánh đè lên bộ khác kiểu. Luật chủ server chốt (bản phổ thông):
//    3 đôi thông  chặt: 1 heo lẻ · 3 đôi thông nhỏ hơn
//    tứ quý       chặt: 1 heo lẻ · đôi heo · 3 đôi thông · tứ quý nhỏ hơn
//    4 đôi thông  chặt: 1 heo lẻ · đôi heo · ba heo · 3 đôi thông · tứ quý · 4 đôi thông nhỏ hơn
//  Ghi chú: "đôi heo" = đôi 2, "ba heo" = ba con 2. Chặt tứ quý heo thì cần 4 đôi thông.
// ---------------------------------------------------------------------------
const HANG_CHAT_BOM = (bo) => {
    if (!bo) return 0;
    if (bo.kieu === 'thong' && bo.dai === 3) return 1;
    if (bo.kieu === 'tu') return 2;
    if (bo.kieu === 'thong' && bo.dai >= 4) return 3;
    return 0;                                     // không phải hàng chặt
};
/** Bộ bị chặt là heo lẻ / đôi heo / ba heo? trả số lá heo, 0 nếu không phải. */
function boHeo(bo) {
    if (!bo || !['rac', 'doi', 'ba'].includes(bo.kieu)) return 0;
    return bo.la.every(laHeo) ? bo.la.length : 0;
}
/** a có CHẶT được b không (a, b là bộ đã nhận dạng). */
function chatDuoc(a, b) {
    const ha = HANG_CHAT_BOM(a);
    if (!ha) return false;                        // a không phải hàng chặt
    const heo = boHeo(b), hb = HANG_CHAT_BOM(b);
    if (heo) {
        if (ha === 1) return heo === 1;           // 3 đôi thông chỉ chặt heo LẺ
        if (ha === 2) return heo <= 2;            // tứ quý chặt heo lẻ + đôi heo
        return heo <= 3;                          // 4 đôi thông chặt tới ba heo
    }
    if (!hb) return false;                        // b là bài thường, không heo -> không chặt được
    if (ha > hb) return true;                     // hàng chặt cao hơn ăn hàng chặt thấp hơn
    if (ha === hb) return soBo(a, b) === 1;       // cùng hàng thì so lá cao (cùng dai mới so được)
    return false;
}

/**
 * ĐÁNH ĐƯỢC KHÔNG? bo đè lên boTruoc (boTruoc = null nghĩa là mở lượt, đánh gì cũng được).
 * Trả { ok: true, chat: bool } hoặc { ok: false, vi: 'lý do' }, 'vi' hiện thẳng cho người chơi.
 */
function danhDuoc(bo, boTruoc) {
    if (!bo) return { ok: false, vi: 'Mấy lá này không thành bộ hợp lệ' };
    if (!boTruoc) return { ok: true, chat: false };
    if (bo.kieu === boTruoc.kieu && bo.dai === boTruoc.dai) {
        return soBo(bo, boTruoc) === 1
            ? { ok: true, chat: false }
            : { ok: false, vi: 'Bộ này không lớn hơn ' + boTruoc.ten };
    }
    if (chatDuoc(bo, boTruoc)) return { ok: true, chat: true };
    return { ok: false, vi: 'Phải đánh ' + moTaKieu(boTruoc) + ' lớn hơn (hoặc chặt)' };
}
function moTaKieu(bo) {
    if (!bo) return 'bài';
    if (bo.kieu === 'rac') return '1 lá';
    if (bo.kieu === 'doi') return 'một đôi';
    if (bo.kieu === 'ba') return 'ba con';
    if (bo.kieu === 'tu') return 'tứ quý';
    if (bo.kieu === 'sanh') return 'sảnh ' + bo.dai + ' lá';
    return bo.dai + ' đôi thông';
}

// ---------------------------------------------------------------------------
//  TỚI TRẮNG, chia bài xong có sẵn bài quá đẹp thì thắng ngay, khỏi đánh.
//  Xếp từ mạnh xuống; trả { ma, ten, thuong }, thuong = số PHẦN CƯỢC mỗi người
//  thua phải trả (ván.js nhân với mức cược). null = không tới trắng.
// ---------------------------------------------------------------------------
const TOI_TRANG = [
    { ma: 'dong_chat', ten: 'Đồng chất (13 lá cùng chất)', thuong: 12 },
    { ma: 'sanh_rong', ten: 'Sảnh rồng (3 đến A)', thuong: 10 },
    { ma: 'tu_quy_heo', ten: 'Tứ quý heo', thuong: 8 },
    { ma: 'nam_doi_thong', ten: '5 đôi thông', thuong: 6 },
    { ma: 'sau_doi', ten: '6 đôi bất kỳ', thuong: 4 },
    // ♠️ VÁN ĐẦU CÓ HÀNG CHỨA 3♠, luật gốc Ba Bích, trang "Tổng quan", dòng ĐẦU TIÊN của
    // danh sách tới trắng. Ý nghĩa: ván đầu người cầm 3♠ BỊ BUỘC mở bằng bộ có 3♠; nếu con
    // 3♠ đang nằm trong một HÀNG (tứ quý 3 / 3-4 đôi thông bắt đầu từ 3) thì mở bài là phải
    // phá hàng, nên luật đền bằng cách cho thắng trắng luôn.
    //
    // ⚠️ SỐ 2 LÀ SỐ DO BÊN MÌNH ĐẶT, luật gốc KHÔNG ghi tiền từng trường hợp. Đặt thấp nhất
    // thang vì đây là trường hợp DỄ RA NHẤT: đo 300.000 ván thì 2,85% (1 trong 35) tay của
    // người cầm 3♠ có hàng chứa 3♠, dễ gấp ~1,8 lần "6 đôi bất kỳ" (đang ăn 4).
    // Bù lại nó CHỈ nổ ở ván ĐẦU của bàn, nên cả buổi nhiều lắm một lần.
    { ma: 'hang_3bich', ten: 'Ván đầu: hàng chứa 3♠', thuong: 2, vanDau: true },
];
/**
 * Con 3♠ có đang nằm trong một HÀNG trên tay không? Trả kiểu hàng ('tu' | 'thong3' | 'thong4')
 * hoặc null. Xét từ hàng TO xuống: 4 đôi thông > tứ quý > 3 đôi thông, cùng một con 3♠ có thể
 * vừa nằm trong tứ quý 3 vừa nằm trong 3 đôi thông, lấy cái to hơn cho đúng tinh thần "phá hàng".
 */
function hangChua3Bich(tay) {
    if (!Array.isArray(tay) || !tay.includes('3s')) return null;
    for (const kieu of ['thong4', 'tu', 'thong3']) {
        const h = timHang(tay, kieu);
        if (h && h.includes('3s')) return kieu;
    }
    return null;
}

/**
 * Tay bài này có tới trắng không?
 * @param vanDau true nếu đang là VÁN ĐẦU của bàn (ván mà 3♠ đi trước). Chỉ ván đầu mới xét
 *        'hang_3bich'; ván sau 3♠ chẳng còn đặc biệt nên không tính.
 */
function toiTrang(tay, vanDau) {
    if (!Array.isArray(tay) || tay.length < 12) return null;
    const c = tay.map(doc);
    const dem = {}; for (const x of c) dem[x.so] = (dem[x.so] || 0) + 1;
    const hang = [...new Set(c.filter(x => x.so !== HEO).map(x => x.hang))].sort((a, b) => a - b);
    const tim = (ma) => TOI_TRANG.find(x => x.ma === ma);

    const chat = {}; for (const x of c) chat[x.chat] = (chat[x.chat] || 0) + 1;
    if (Object.values(chat).some(n => n >= 13)) return tim('dong_chat');
    // sảnh rồng: có đủ 12 hạng 3->A (mỗi hạng ít nhất 1 lá)
    if (hang.length === 12 && hang[0] === HANG_SO['3'] && hang[11] === HANG_SO['A']) return tim('sanh_rong');
    if (dem[HEO] === 4) return tim('tu_quy_heo');
    // 5 đôi thông: có 5 hạng liên tiếp (không heo) mà hạng nào cũng ≥ 2 lá
    const hangDoi = hang.filter(h => Object.keys(dem).some(s => HANG_SO[s] === h && dem[s] >= 2));
    for (let i = 0; i + 4 < hangDoi.length; i++) {
        if (hangDoi[i + 4] === hangDoi[i] + 4) return tim('nam_doi_thong');
    }
    if (Object.values(dem).filter(n => n >= 2).length >= 6) return tim('sau_doi');
    // ⚠️ XÉT CUỐI CÙNG: đây là loại rẻ nhất thang, ai vừa có 6 đôi vừa có hàng chứa 3♠ thì
    // phải ăn theo cái TO hơn. Đứng trên là ăn hụt tiền người ta.
    if (vanDau && hangChua3Bich(tay)) return tim('hang_3bich');
    return null;
}

/** Đếm heo còn trên tay (thối 2): { den, do }, heo đen ♠♣, heo đỏ ♦♥ (đỏ phạt nặng hơn). */
function demHeo(tay) {
    let den = 0, do_ = 0;
    for (const ma of (tay || [])) {
        const l = doc(ma);
        if (l.so !== HEO) continue;
        if (l.chat === 's' || l.chat === 'c') den++; else do_++;
    }
    return { den, do: do_, tong: den + do_ };
}

// ---------------------------------------------------------------------------
//  🧾 TỔ HỢP ĐÁNG TIỀN, dùng cho hai việc TRẢ TIỀN, cùng một bảng giá:
//    · BỊ CHẶT : bộ vừa bị chặt đáng bao nhiêu -> người bị chặt trả cho người chặt
//    · BỊ NHỐT : hết ván còn gì trên tay -> trả cho người về nhất (dân gian gọi "thối")
//  Luật gốc (babichgame.gitbook.io) chỉ tính 5 thứ: heo đen · heo đỏ · 3 đôi thông ·
//  tứ quý · 4 đôi thông. Sảnh, đôi thường, rác... KHÔNG tính tiền.
//
//  ⚠️ HAI CHỖ TỰ QUYẾT, ghi rõ ra đây để sau khỏi cãi:
//   1. HEO LUÔN TÍNH TỪNG LÁ, kể cả khi 4 con 2 thành tứ quý. Bốn con 2 = 2 heo đen +
//      2 heo đỏ (đắt hơn tính là một tứ quý). Đúng tinh thần "thối 2": kẹt heo là chết.
//      Vì heo bị tách ra trước nên hàng (3/4 đôi thông, tứ quý) không bao giờ đè lên heo
//     , sảnh và đôi thông vốn đã cấm heo, chỉ tứ quý heo là đụng, và nó đã thành heo rồi.
//   2. Lá đã dùng cho một hàng thì KHÔNG dùng lại cho hàng khác. Nhặt hàng ĐẮT TRƯỚC
//      (4 đôi thông > tứ quý ≥ 3 đôi thông, thứ tự này đúng ở CẢ HAI bảng giá), nhặt
//      được thì bỏ mấy lá đó ra rồi nhặt tiếp. Tham lam đơn giản, không tìm cách tối ưu:
//      luật gốc không nói gì, mà đơn giản thì người chơi còn tự nhẩm lại được.
// ---------------------------------------------------------------------------
/** 4 đôi thông / tứ quý / 3 đôi thông nằm trong mớ lá (không heo). Trả mảng lá, hoặc null. */
function timHang(la, kieu) {
    const theoSo = {};
    for (const ma of la) { const l = doc(ma); (theoSo[l.so] = theoSo[l.so] || []).push(ma); }
    if (kieu === 'tu') {
        for (const so of SO) if (so !== HEO && (theoSo[so] || []).length >= 4) return theoSo[so].slice(0, 4);
        return null;
    }
    const canDoi = kieu === 'thong4' ? 4 : 3;                  // mấy đôi liên tiếp
    for (let i = 0; i + canDoi <= SO.length; i++) {
        const day = SO.slice(i, i + canDoi);
        if (day.includes(HEO)) continue;                        // đôi thông cấm heo
        if (!day.every(so => (theoSo[so] || []).length >= 2)) continue;
        let ra = [];
        for (const so of day) ra = ra.concat(theoSo[so].slice(0, 2));
        return ra;
    }
    return null;
}
/**
 * Mọi thứ đáng tiền trong mớ lá. Trả { muc: [...], heo: {den, do} } với muc là mảng
 * khoá giá: 'heoDen' | 'heoDo' | 'thong3' | 'tu' | 'thong4' (một khoá lặp lại nếu có
 * nhiều cái). Nhân với bảng giá của chế độ đang chơi là ra tiền.
 */
function doTay(la) {
    const tay = (la || []).slice();
    const muc = [];
    // ---- 1. heo tách ra trước, tính TỪNG LÁ ----
    const h = demHeo(tay);
    for (let i = 0; i < h.den; i++) muc.push('heoDen');
    for (let i = 0; i < h.do; i++) muc.push('heoDo');
    // ---- 2. phần còn lại: nhặt hàng đắt trước, lá đã dùng thì loại ra ----
    let con = tay.filter(x => !laHeo(x));
    for (const kieu of ['thong4', 'tu', 'thong3']) {
        for (;;) {
            const duoc = timHang(con, kieu);
            if (!duoc) break;
            muc.push(kieu);
            con = con.filter(x => !duoc.includes(x));
        }
    }
    return { muc, heo: { den: h.den, do: h.do } };
}
/** Bộ VỪA BỊ CHẶT đáng những khoá giá nào. Bộ thường (sảnh, đôi, rác không heo) = rỗng. */
function doBoBiChat(bo) {
    if (!bo) return [];
    if (bo.kieu === 'thong') return bo.dai >= 4 ? ['thong4'] : (bo.dai === 3 ? ['thong3'] : []);
    if (bo.kieu === 'tu') return bo.la.every(laHeo) ? doTay(bo.la).muc : ['tu'];
    return doTay(bo.la).muc.filter(k => k === 'heoDen' || k === 'heoDo');
}

module.exports = {
    BO52, SO, CHAT, CHAT_KY_TU, HEO, HANG_SO, HANG_CHAT, TOI_TRANG,
    doc, tri, laHeo, ten1, tenBai, xao, boMoi, chia, xepBai,
    nhanDang, soBo, chatDuoc, danhDuoc, moTaKieu, toiTrang, demHeo, hangChua3Bich,
    timHang, doTay, doBoBiChat,
};
