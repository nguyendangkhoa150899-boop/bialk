// ============================================================================
//  bai.js, BỘ BÀI 52 LÁ + CHẤM BÀI (thuần logic, không dính web, không dính giải)
//  Đây là móng của cả tính năng poker. Sai ở đây là sai thứ hạng cả giải, nên file
//  này có bộ kiểm riêng: node Poker/kiemtra/bai-test.js
//
//  MÃ LÁ BÀI dùng ĐÚNG tên file ảnh trong Poker/bai/ để giao diện ghép thẳng
//  'bai/' + ma + '.webp', không cần bảng tra:
//      số:   A K Q J 10 9 8 7 6 5 4 3 2
//      chất: s = ♠ bích · h = ♥ cơ · d = ♦ rô · c = ♣ chuồn
//      ví dụ: 'As' (át bích) · '10h' (10 cơ) · 'Qd' (đầm rô) · '2c' (2 chuồn)
// ============================================================================
'use strict';
const crypto = require('crypto');

const SO = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CHAT = ['s', 'h', 'd', 'c'];
const CHAT_KY_TU = { s: '♠', h: '♥', d: '♦', c: '♣' };

// điểm của từng số: 2..10 rồi J=11 Q=12 K=13 A=14
const DIEM_SO = {};
SO.forEach((s, i) => { DIEM_SO[s] = i + 2; });

const BO52 = [];
for (const c of CHAT) for (const s of SO) BO52.push(s + c);

/** Tách 1 mã lá thành { so, chat, diem }. Lưu ý '10' dài 2 ký tự nên cắt từ CUỐI. */
function doc(ma) {
    const chat = ma.slice(-1);
    const so = ma.slice(0, -1);
    if (!CHAT.includes(chat) || DIEM_SO[so] === undefined) throw new Error('Mã lá bài lạ: ' + ma);
    return { so, chat, diem: DIEM_SO[so] };
}

/** Viết lá bài cho người đọc: 'Kh' -> 'K♥' */
const ten1 = (ma) => { const l = doc(ma); return l.so + CHAT_KY_TU[l.chat]; };

// ---------------------------------------------------------------------------
//  XÁO BÀI
//  Dùng crypto.randomInt, KHÔNG dùng Math.random: giải này có thưởng (Pal) và có
//  phạt thật, nên bộ sinh số phải không đoán được. Fisher-Yates chuẩn: chạy từ
//  cuối về đầu, mỗi bước đổi chỗ với một vị trí ngẫu nhiên trong phần CHƯA xét.
//  (Lỗi kinh điển là bốc ngẫu nhiên trong TOÀN mảng -> phân bố lệch.)
// ---------------------------------------------------------------------------
function xao(mang) {
    const a = mang.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Bộ 52 lá mới, đã xáo. */
const boMoi = () => xao(BO52);

/** Rút n lá khỏi ĐẦU bộ. Sửa thẳng mảng bộ (như chia bài thật). */
function chia(bo, n) {
    if (n > bo.length) throw new Error('Bộ chỉ còn ' + bo.length + ' lá, đòi ' + n);
    return bo.splice(0, n);
}

// ---------------------------------------------------------------------------
//  CHẤM BÀI
//  Điểm trả về là MẢNG so sánh theo thứ tự trước-sau: [hạng, phụ1, phụ2, ...].
//  So hai bàn tay = so từng phần tử từ trái sang. Cách này tránh được trò nhồi
//  tất cả vào một con số lớn (dễ tràn và dễ sai thầm lặng).
// ---------------------------------------------------------------------------
const HANG = {
    9: 'Thùng phá sảnh', 8: 'Tứ quý', 7: 'Cù lũ', 6: 'Thùng', 5: 'Sảnh',
    4: 'Sám cô', 3: 'Hai đôi', 2: 'Một đôi', 1: 'Mậu thầu',
};

/** Nếu 5 điểm số tạo thành sảnh thì trả về điểm lá CAO NHẤT của sảnh, không thì 0. */
function sanh(diemDuyNhat) {
    const d = diemDuyNhat.slice().sort((a, b) => b - a);
    if (d.length !== 5) return 0;
    // sảnh thường: 5 số liền nhau
    if (d[0] - d[4] === 4) return d[0];
    // sảnh nhỏ A-2-3-4-5: át tính là 1, lá cao nhất của sảnh là 5
    if (d[0] === 14 && d[1] === 5 && d[2] === 4 && d[3] === 3 && d[4] === 2) return 5;
    return 0;
}

/** Chấm ĐÚNG 5 lá. Trả { hang, diem, ten }. */
function chamNam(nam) {
    if (nam.length !== 5) throw new Error('chamNam cần đúng 5 lá, nhận ' + nam.length);
    const la = nam.map(doc);
    const thung = la.every(x => x.chat === la[0].chat);

    // đếm số lần xuất hiện của từng điểm
    const dem = new Map();
    for (const x of la) dem.set(x.diem, (dem.get(x.diem) || 0) + 1);
    // sắp: nhiều lần trước, cùng số lần thì điểm cao trước
    const nhom = [...dem.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const soLan = nhom.map(x => x[1]).join('');       // '32' = cù lũ, '41' = tứ quý...
    const d = nhom.map(x => x[0]);                    // điểm theo thứ tự nhóm
    const cao = sanh([...dem.keys()]);

    let hang, phu;
    if (thung && cao) { hang = 9; phu = [cao]; }
    else if (soLan === '41') { hang = 8; phu = [d[0], d[1]]; }
    else if (soLan === '32') { hang = 7; phu = [d[0], d[1]]; }
    else if (thung) { hang = 6; phu = la.map(x => x.diem).sort((a, b) => b - a); }
    else if (cao) { hang = 5; phu = [cao]; }
    else if (soLan === '311') { hang = 4; phu = [d[0], d[1], d[2]]; }
    else if (soLan === '221') { hang = 3; phu = [d[0], d[1], d[2]]; }
    else if (soLan === '2111') { hang = 2; phu = [d[0], d[1], d[2], d[3]]; }
    else { hang = 1; phu = la.map(x => x.diem).sort((a, b) => b - a); }

    return { hang, diem: [hang, ...phu], ten: dienGiai(hang, phu) };
}

/** Câu chữ cho người chơi đọc lúc lật bài: 'Cù lũ K trên 7'. */
function dienGiai(hang, phu) {
    const s = (diem) => SO[diem - 2];
    switch (hang) {
        case 9: return phu[0] === 14 ? 'Thùng phá sảnh đến A (lớn nhất)' : 'Thùng phá sảnh đến ' + s(phu[0]);
        case 8: return 'Tứ quý ' + s(phu[0]);
        case 7: return 'Cù lũ ' + s(phu[0]) + ' trên ' + s(phu[1]);
        case 6: return 'Thùng ' + s(phu[0]) + ' cao';
        case 5: return 'Sảnh đến ' + s(phu[0]);
        case 4: return 'Sám cô ' + s(phu[0]);
        case 3: return 'Hai đôi ' + s(phu[0]) + ' và ' + s(phu[1]) + ', kèm ' + s(phu[2]);
        case 2: return 'Một đôi ' + s(phu[0]) + ', kèm ' + s(phu[1]);
        default: return 'Mậu thầu ' + s(phu[0]) + ' cao';
    }
}

/** So 2 mảng điểm: >0 nếu a mạnh hơn, <0 nếu b mạnh hơn, 0 là BẰNG (chia hũ). */
function soDiem(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const x = a[i] === undefined ? -1 : a[i];
        const y = b[i] === undefined ? -1 : b[i];
        if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
}

/**
 * Chấm 5–7 lá, tự chọn BỘ 5 LÁ MẠNH NHẤT.
 * Cách làm: thử hết mọi cách chọn 5 trong 7 (21 cách) rồi lấy cái cao nhất.
 * Chậm hơn thuật toán đếm bit nhưng ĐÚNG hiển nhiên và đọc là hiểu, bàn 4 người
 * mỗi giải chỉ vài chục ván nên nhanh chậm ở đây không đáng kể.
 * Trả { hang, diem, ten, nam }, nam là 5 lá được chọn, để giao diện tô sáng.
 */
function chamBai(la) {
    if (la.length < 5 || la.length > 7) throw new Error('chamBai cần 5–7 lá, nhận ' + la.length);
    const trung = new Set(la);
    if (trung.size !== la.length) throw new Error('Có lá trùng: ' + la.join(','));

    let tot = null;
    const n = la.length;
    for (let a = 0; a < n - 4; a++)
        for (let b = a + 1; b < n - 3; b++)
            for (let c = b + 1; c < n - 2; c++)
                for (let d = c + 1; d < n - 1; d++)
                    for (let e = d + 1; e < n; e++) {
                        const nam = [la[a], la[b], la[c], la[d], la[e]];
                        const kq = chamNam(nam);
                        if (!tot || soDiem(kq.diem, tot.diem) > 0) tot = { ...kq, nam };
                    }
    return tot;
}

/** So 2 bàn tay (mỗi bàn 5–7 lá): 1 = a thắng, -1 = b thắng, 0 = chia hũ. */
const soSanh = (a, b) => soDiem(chamBai(a).diem, chamBai(b).diem);

/**
 * Xếp hạng nhiều người cùng lật bài. Trả mảng nhóm, nhóm đầu là người thắng.
 * Cùng một nhóm = BẰNG ĐIỂM, phải chia hũ (đây là chỗ hay quên nhất).
 *   vao: [{ id, la: [...] }, ...]
 *   ra:  [[{id, cham}, {id, cham}], [{id, cham}], ...]
 */
function xepHang(nguoi) {
    const co = nguoi.map(x => ({ ...x, cham: chamBai(x.la) }));
    co.sort((p, q) => soDiem(q.cham.diem, p.cham.diem));
    const nhom = [];
    for (const x of co) {
        const cuoi = nhom[nhom.length - 1];
        if (cuoi && soDiem(cuoi[0].cham.diem, x.cham.diem) === 0) cuoi.push(x);
        else nhom.push([x]);
    }
    return nhom;
}

module.exports = {
    BO52, SO, CHAT, CHAT_KY_TU, HANG,
    doc, ten1, xao, boMoi, chia,
    chamNam, chamBai, soDiem, soSanh, xepHang,
};
