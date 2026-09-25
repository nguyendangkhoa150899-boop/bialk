// Bộ kiểm LÕI TIỀN Roulette. Chạy: node Roulette/kiemtra/cua-test.js
// Không đụng DB, không đụng web. Chạy được cả khi bot đang chạy.
'use strict';
const C = require('../cua.js');
const { mulberry32 } = require('./rnd.js');

let so = 0, hong = 0;
function kt(ten, dieu, them) {
    so++;
    if (!dieu) hong++;
    console.log('  ' + (dieu ? 'ĐẠT ' : 'HỎNG') + '  ' + ten + (them ? '   ' + them : ''));
}
const pt = (x) => (x * 100).toFixed(4) + '%';
const vn = (n) => Number(n).toLocaleString('vi-VN');

console.log('\n═══ 1. BÀN QUAY ═══');
kt('37 ô', C.O_SO === 37);
kt('vòng quay đủ 37 ô, không trùng, không thiếu',
    C.VONG.length === 37 && new Set(C.VONG).size === 37 && C.VONG.every(n => n >= 0 && n <= 36));
kt('18 số đỏ + 18 số đen + số 0',
    C.MOI_KET_QUA.filter(C.laDo).length === 18 &&
    C.MOI_KET_QUA.filter(C.laDen).length === 18 && !C.laDo(0) && !C.laDen(0));
kt('đỏ và đen không giao nhau', !C.MOI_KET_QUA.some(n => C.laDo(n) && C.laDen(n)));
kt('mỗi tá 12 số, số 0 không thuộc tá nào',
    [1, 2, 3].every(k => C.MOI_KET_QUA.filter(n => C.ta(n) === k).length === 12) && C.ta(0) === 0);
kt('mỗi cột 12 số, số 0 không thuộc cột nào',
    [1, 2, 3].every(k => C.MOI_KET_QUA.filter(n => C.cot(n) === k).length === 12) && C.cot(0) === 0);

console.log('\n═══ 2. ĐỦ 9 KIỂU CƯỢC TRONG ẢNH LUẬT ═══');
const dem = (nh) => C.DS.filter(c => c.nhom === nh).length;
kt('Trực tiếp: 37 ô (kể cả số 0)', dem('so') === 37, dem('so') + '');
kt('Tác: 60 cửa (24 ngang + 33 dọc + 3 cửa của số 0)', C.TAC.length === 60, C.TAC.length + '');
kt('Dãy: 12 cửa', C.DAY.length === 12, C.DAY.length + '');
kt('Góc: 22 cửa', C.GOC4.length === 22, C.GOC4.length + '');
kt('Hàng: 11 cửa', C.HANG.length === 11, C.HANG.length + '');
kt('Cột 3 + Tá 3', dem('ta') === 6);
kt('Đỏ/Đen · Chẵn/Lẻ · 1-18/19-36: 6 cửa', dem('deu') === 6);
kt('tổng 154 cửa', C.DS.length === 154, C.DS.length + ' cửa');
kt('không trùng mã cửa', new Set(C.DS.map(c => c.id)).size === C.DS.length);
kt('mọi cửa thuộc một nhóm trần có thật', C.DS.every(c => C.NHOM_TRAN[c.nhom]));

console.log('\n═══ 3. SỐ Ô MỖI KIỂU CƯỢC PHỦ, VÀ TỈ LỆ TRẢ ═══');
const phu = (c) => C.MOI_KET_QUA.filter(n => c.tra(n) > 0).length;
for (const [nh, soO, tiLe] of [['so', 1, 29], ['tac', 2, 17], ['day', 3, 11],
['goc', 4, 8], ['hang', 6, 5], ['ta', 12, 2], ['deu', 18, 1]]) {
    const ds = C.DS.filter(c => c.nhom === nh);
    kt('nhóm ' + nh + ': mỗi cửa phủ ' + soO + ' số, trả ' + tiLe + ':1',
        ds.every(c => phu(c) === soO && c.goc === tiLe));
}
kt('Tác đúng là 2 số kề nhau (ngang, dọc, hoặc kề số 0)',
    C.TAC.every(b => b[0] === 0 || b[1] - b[0] === 1 || b[1] - b[0] === 3));
kt('Tác ngang không vắt qua mép bàn (3 sang 4)',
    C.TAC.filter(b => b[0] > 0 && b[1] - b[0] === 1).every(b => ((b[0] - 1) % 3) <= 1));
kt('Góc không vắt qua mép bàn', C.GOC4.every(b => ((b[0] - 1) % 3) <= 1));
kt('Hàng đúng là 2 dãy liền nhau',
    C.HANG.every(b => b.length === 6 && b[5] === b[0] + 5 && (b[0] - 1) % 3 === 0));
kt('góc 28-29-31-32 có thật (đúng cái chủ server chỉ trong ảnh)',
    !!C.THEO_ID['g28'] && C.THEO_ID['g28'].bo.join('-') === '28-29-31-32');

console.log('\n═══ 4. RA SỐ 0 ═══');
const thang0 = C.cuaThang(0);
kt('ra 0: chỉ 4 cửa thắng (1 Trực tiếp + 3 cửa Tác của số 0)',
    thang0.length === 4, thang0.join(','));
kt('ra 0: mọi cửa vòng ngoài thua sạch',
    C.DS.filter(c => c.nhom === 'ta' || c.nhom === 'deu').every(c => c.tra(0) === 0));
kt('ra 0: Dãy / Góc / Hàng cũng thua sạch',
    C.DS.filter(c => ['day', 'goc', 'hang'].indexOf(c.nhom) >= 0).every(c => c.tra(0) === 0));

console.log('\n═══ 5. RTP GỐC: MỌI CỬA TRẢ CHUẨN ĐỀU 36/37 ═══');
const chuan = C.DS.filter(c => c.nhom !== 'so');
kt(chuan.length + ' cửa trả chuẩn cùng RTP gốc 36/37 = 97,2973%',
    chuan.every(c => Math.abs(C.doGoc(c).rtpGoc - C.RTP_CHUAN) < 1e-12),
    pt(C.doGoc(chuan[0]).rtpGoc));
kt('số đơn bị CẮT còn 29:1 nên RTP gốc thấp hơn (81,08%)',
    Math.abs(C.doGoc(C.THEO_ID['s7']).rtpGoc - 30 / 37) < 1e-12,
    pt(C.doGoc(C.THEO_ID['s7']).rtpGoc));
kt('hệ số nhân kéo số đơn về đúng 36/37',
    Math.abs(C.THEO_ID['s7'].rtpSau - C.RTP_CHUAN) < 1e-12, pt(C.THEO_ID['s7'].rtpSau));

console.log('\n═══ 6. HỆ SỐ NHÂN CHỈ RƠI VÀO SỐ ĐƠN ═══');
kt('đúng 37 cửa được nhân, toàn là Trực tiếp',
    C.DS.filter(c => c.q > 0).every(c => c.nhom === 'so') &&
    C.DS.filter(c => c.q > 0).length === 37);
kt('Tác / Dãy / Góc / Hàng / Cột / Tá / Đỏ Đen đều KHÔNG có nhân',
    C.DS.filter(c => c.nhom !== 'so').every(c => c.q === 0 && !c.thangNhan));
{
    const rnd = mulberry32(12345);
    let laSo = true;
    for (let i = 0; i < 20000; i++) {
        for (const id of Object.keys(C.taoNhan(rnd))) if (C.THEO_ID[id].nhom !== 'so') laSo = false;
    }
    kt('bốc 20.000 ván: không lần nào nhân rơi ra ngoài ô số', laSo);
}

console.log('\n═══ 7. NHÀ CÁI ĂN ĐỀU NHAU Ở MỌI KIỂU CƯỢC ═══');
for (const muc of [0.03, 0.05, 0.08, 0.12, 0.20]) {
    const r = C.datMucAn(muc);
    kt('đặt ăn ' + pt(muc) + ': mọi cửa đều ra đúng mức đó',
        !r.error && Math.abs(r.anThuc - muc) < 1e-9 && r.anLech < 1e-12,
        r.error ? r.error : 'phí ' + pt(r.phi) + ' · lệch giữa các cửa ' + r.anLech.toExponential(1)
        + ' · ' + r.oSangMoiVan.toFixed(2) + ' ô sáng/ván');
}
kt('ngoài khoảng thì chặn', !!C.datMucAn(0.5).error && !!C.datMucAn(0.001).error);
// Phí ÂM = bàn tự phát tiền (đặt 10.000 mà chỉ trừ ví 9.928). Phải chặn từ sàn dưới.
kt('sàn dưới nằm TRÊN mức ăn tự nhiên của roulette', C.AN_MIN > 1 - 36 / 37,
    'AN_MIN ' + pt(C.AN_MIN) + ' > ' + pt(1 - 36 / 37));
kt('phí không bao giờ âm trong cả khoảng cho phép', (() => {
    // ⚠️ Đếm bằng SỐ NGUYÊN rồi chia. Bản đầu cộng dồn 0.0005 nên bước cuối trôi thành
    // 0,20000000000000015, vượt trần rồi báo hỏng oan trong khi lõi tiền không sai.
    const buoc = 20;   // 0,05 điểm phần trăm một bước
    const dau = Math.round(C.AN_MIN * 10000), cuoi = Math.round(C.AN_MAX * 10000);
    for (let i = dau; i <= cuoi; i += buoc) {
        const a = i / 10000;
        if (C.datMucAn(a).error) return false;
        if (C.phiSuat() < 0) return false;
        if (C.tienTru(10000) < 10000) return false;
    }
    C.datMucAn(C.AN_MUC_TIEU); return true;
})());
C.datMucAn(C.AN_MUC_TIEU);

console.log('\n═══ 8. ĐỔI ĐỘ HIẾM KHÔNG ĐỔI MỨC ĂN ═══');
const anGoc = C.thongKe().anThuc;
for (const w of [80, 100, 160, 240]) {
    const moi = C.thangMacDinh();
    moi.so[0][1] = w;
    const r = C.datThang({ so: moi.so });
    kt('bậc thấp nhất độ hiếm ' + w + ' vẫn ăn ' + pt(anGoc),
        !r.error && Math.abs(r.anThuc - anGoc) < 1e-9, r.error ? r.error : (pt(r.anThuc) + ' · ' + r.oSangMoiVan.toFixed(2) + ' ô sét/ván'));
}
C.datThang(C.thangMacDinh());

console.log('\n═══ 9. THANG NHÂN: CHẶN BẬC SAI ═══');
kt('hệ số không tăng dần thì chặn', !!C.datThang({ so: [[100, 5], [50, 5]] }).error);
kt('bậc thấp nhất không vượt 29:1 thì chặn', !!C.datThang({ so: [[20, 5], [600, 1]] }).error,
    (C.datThang({ so: [[20, 5], [600, 1]] }).error || '').slice(0, 64));
kt('thang quá thấp (đòi 170 ô sét > 11) thì chặn', /thang thấp/.test(C.datThang({ so: [[30, 5], [32, 1]] }).error || ''),
    (C.datThang({ so: [[30, 5], [32, 1]] }).error || '').slice(0, 100));
kt('thang quá cao (chỉ đủ 0,5 ô sét < 2) thì chặn', /thang cao/.test(C.datThang({ so: [[400, 1], [500, 1]] }).error || ''),
    (C.datThang({ so: [[400, 1], [500, 1]] }).error || '').slice(0, 100));
kt('nhóm không có thật thì chặn', !!C.datThang({ khongco: [[2, 1], [3, 1]] }).error);
kt('sau mấy lần chặn, thang vẫn là bản mặc định',
    JSON.stringify(C.thangHienTai()) === JSON.stringify(C.thangMacDinh()));

console.log('\n═══ 10. PHÍ ═══');
C.datMucAn(0.08);
kt('nhà cái ăn 8% thì phí quanh 5,758%', Math.abs(C.phiSuat() - 0.0575793) < 1e-5, pt(C.phiSuat()));
kt('đặt 10.000 thì trừ ví 10.575', C.tienTru(10000) === 10575, vn(C.tienTru(10000)));
kt('phần phí của 10.000 là 575', C.tienPhi(10000) === 575);
kt('phí luôn làm tròn xuống', C.tienPhi(1) === 0 && C.tienTru(1) === 1);
kt('ăn nhiều hơn thì phí cao hơn', (() => {
    C.datMucAn(0.12); const a = C.phiSuat(); C.datMucAn(0.08); return a > C.phiSuat();
})());

console.log('\n═══ 11. TIỀN TRẢ ═══');
kt('số đơn trúng, không nhân: 1.000 -> 30.000', C.tinhTra('s7', 1000, 7, {}) === 30000);
kt('số đơn trúng, có nhân x100: 1.000 -> 101.000', C.tinhTra('s7', 1000, 7, { s7: 100 }) === 101000);
kt('nhân THAY THẾ tỉ lệ gốc chứ không cộng dồn',
    C.tinhTra('s7', 1000, 7, { s7: 100 }) === 1000 + 1000 * 100);
kt('Tác 7-8 trúng: 1.000 -> 18.000', C.tinhTra('t7_8', 1000, 8, {}) === 18000);
kt('Dãy 7-9 trúng: 1.000 -> 12.000', C.tinhTra('d7', 1000, 8, {}) === 12000);
kt('Góc 28-29-31-32 trúng: 1.000 -> 9.000', C.tinhTra('g28', 1000, 29, {}) === 9000);
kt('Hàng 1-6 trúng: 1.000 -> 6.000', C.tinhTra('h1', 1000, 5, {}) === 6000);
kt('Tá trúng: 1.000 -> 3.000', C.tinhTra('ta1', 1000, 7, {}) === 3000);
kt('Đỏ trúng: 1.000 -> 2.000', C.tinhTra('do', 1000, 7, {}) === 2000);
kt('đặt trật thì thua sạch', C.tinhTra('g28', 1000, 30, {}) === 0);
kt('cửa lạ thì ném lỗi chứ không trả tiền bừa',
    (() => { try { C.tinhTra('khongco', 1000, 7, {}); return false; } catch (e) { return true; } })());

console.log('\n═══ 12. TRẦN CƯỢC ═══');
const tran = C.tranMacDinh();
for (const k of Object.keys(tran)) {
    const cua = C.DS.filter(c => c.nhom === k);
    const toiDa = tran[k] * C.tiLeToiDa(cua[0].id);
    kt('nhóm ' + k + ': thắng đậm nhất một ô', toiDa <= 2600000,
        vn(tran[k]) + ' × ' + C.tiLeToiDa(cua[0].id) + ' = ' + vn(toiDa));
}

console.log('\n═══ 13. MÔ PHỎNG 1 TRIỆU VÁN (đặt đều cả 154 cửa) ═══');
{
    C.datMucAn(0.08);
    const rnd = mulberry32(20250925);
    const N = 1000000;
    let tru = 0, ve = 0;
    const theoNhom = {};
    for (let i = 0; i < N; i++) {
        const nhan = C.taoNhan(rnd);
        const ra = Math.floor(rnd() * 37);
        for (const c of C.DS) {
            const t = C.tienTru(1000), v = C.tinhTra(c.id, 1000, ra, nhan);
            tru += t; ve += v;
            if (!theoNhom[c.nhom]) theoNhom[c.nhom] = { tru: 0, ve: 0 };
            theoNhom[c.nhom].tru += t; theoNhom[c.nhom].ve += v;
        }
    }
    kt('nhà cái ăn thật quanh 8% (sai số < 0,3 điểm)',
        Math.abs(1 - ve / tru - 0.08) < 0.003, 'đo được ' + pt(1 - ve / tru) + ' trên ' + vn(N) + ' ván');
    for (const nh of Object.keys(theoNhom)) {
        const a = 1 - theoNhom[nh].ve / theoNhom[nh].tru;
        kt('  nhóm ' + (nh + '     ').slice(0, 5) + ' cũng quanh 8%',
            Math.abs(a - 0.08) < 0.006, pt(a));
    }
}

console.log('\n═══ 14. SỐ Ô SÉT MỖI VÁN: LUÔN TRONG BẢNG 2..11, TỈ LỆ GIẢM DẦN ═══');
{
    const tk = C.thongKe();
    const rnd = mulberry32(987654321);
    const N = 200000;
    let tong = 0, min = 99, max = 0; const dem = {};
    for (let i = 0; i < N; i++) { const k = Object.keys(C.taoNhan(rnd)).length; tong += k; dem[k] = (dem[k] || 0) + 1; if (k < min) min = k; if (k > max) max = k; }
    kt('bảng mặc định 2..7 (6 dòng)', tk.setBang.length === 6 && tk.setBang[0][0] === 2 && tk.setBang[5][0] === 7);
    kt('200.000 ván: KHÔNG ván nào dưới 2 hay trên 7 ô', min === 2 && max === 7, 'min ' + min + ' · max ' + max);
    kt('số ô sét trung bình khớp con số máy tính ra',
        Math.abs(tong / N - tk.oSangMoiVan) < 0.05, 'đo ' + (tong / N).toFixed(3) + ' · máy nói ' + tk.oSangMoiVan.toFixed(3));
    kt('2 ô hay gặp hơn 7 ô (tỉ lệ giảm dần, không rải đều)', dem[2] > dem[7] * 1.15, (dem[2] / N * 100).toFixed(1) + '% vs ' + (dem[7] / N * 100).toFixed(1) + '%');
    kt('xác suất thật máy in ra khớp đo được (sai số < 0,6 điểm)',
        tk.phanPhoiSet.every(x => Math.abs(x.p - (dem[x.k] || 0) / N) < 0.006));
    kt('mọi ô sét đều là số đơn, không trùng', (() => { for (let i = 0; i < 2000; i++) { const nh = C.taoNhan(rnd); for (const id of Object.keys(nh)) if (C.THEO_ID[id].nhom !== 'so' || !(nh[id] > 29)) return false; } return true; })());
    kt('không cửa nào kẹt trần', tk.cuaKetTran.length === 0, tk.cuaKetTran.join(',') || 'không có');
}

console.log('\n═══ 15. ADMIN ĐẶT BẢNG SỐ Ô SÉT ═══');
{
    const anGoc2 = C.thongKe().anThuc;
    let r = C.datKhoangSet([[2, 10], [3, 9], [4, 9], [5, 8], [6, 8], [7, 7], [8, 7], [9, 6], [10, 6], [11, 5]]);
    kt('bảng kiểu chủ server (2×10 … 11×5) nhận được', !!r.ok, r.error);
    kt('nhà cái vẫn ăn y nguyên', !!r.ok && Math.abs(r.anThuc - anGoc2) < 1e-9, r.ok ? pt(r.anThuc) : '');
    kt('trung bình vẫn do thang quyết định (không đổi)', !!r.ok && Math.abs(r.oSangMoiVan - C.thongKe().oSangMoiVan) < 1e-9);
    r = C.datKhoangSet({ 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5 });
    kt('nhận cả kiểu {số ô: độ hiếm}', !!r.ok && r.set.length === 7, r.error);
    kt('bảng 8..11 (không bao được 6,3 ô thang đòi) thì chặn, kể rõ lý do',
        /thang cao|ít nhất 8/.test(C.datKhoangSet([[8, 1], [9, 1], [10, 1], [11, 1]]).error || ''));
    kt('bảng 1..3 (thang đòi 6,3 > 3) thì chặn', /thang thấp|nhiều nhất 3/.test(C.datKhoangSet([[1, 1], [2, 1], [3, 1]]).error || ''));
    kt('số ô 0 hay 38 thì chặn', !!C.datKhoangSet([[0, 1], [5, 1]]).error && !!C.datKhoangSet([[5, 1], [38, 1]]).error);
    kt('số ô lặp thì chặn', /lặp/.test(C.datKhoangSet([[5, 1], [5, 2]]).error || ''));
    kt('bảng trống thì chặn', !!C.datKhoangSet([]).error);
    C.datKhoangSet(C.setMacDinh());
    kt('về mặc định được', JSON.stringify(C.setHienTai()) === JSON.stringify(C.setMacDinh()));
}

console.log('\n' + (hong ? '❌ ' + hong + '/' + so + ' PHÉP KIỂM HỎNG' : '✅ ĐẠT HẾT ' + so + ' PHÉP KIỂM'));
process.exit(hong ? 1 : 0);
