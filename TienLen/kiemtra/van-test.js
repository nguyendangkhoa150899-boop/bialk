// Bộ kiểm cho TienLen/van.js — máy ván + TIỀN. Chạy: node TienLen/kiemtra/van-test.js
// Có ngẫu nhiên (chia bài) nên chạy 3 lần để dò chập chờn.
'use strict';
const { taoBan, CHE_DO } = require('../van.js');
const B = require('../bai.js');

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');
const BON = [{ id: 'A', ten: 'An', ghe: 0 }, { id: 'B', ten: 'Bình', ghe: 1 }, { id: 'C', ten: 'Cường', ghe: 2 }, { id: 'D', ten: 'Dũng', ghe: 3 }];

/** Bàn đã ngồi sẵn n người, chưa chia bài. */
function ban(n = 4, tc = {}) {
    const b = taoBan({ mucCuoc: 1000, ...tc });
    for (const p of BON.slice(0, n)) b.themNguoi(p);
    return b;
}
/** Dựng tay bài theo ý muốn rồi chỉnh lượt — dùng để kiểm luật tiền cho chắc ăn. */
function dung(b, tay, luot) {
    const v = b._trong.van;
    for (const id of Object.keys(tay)) v.tay[id] = tay[id].slice();
    v.bo = null; v.boCua = null; v.daBo.clear(); v.veNhat = [];
    v.batBuoc3Bich = false;
    if (luot) v.luot = luot;
    return v;
}
const tong = (t) => Object.values(t).reduce((a, x) => a + x, 0);

// ---------------------------------------------------------------- ngồi bàn
muc('ngồi bàn / rời bàn');
{
    const b = taoBan({ mucCuoc: 1000 });
    b.themNguoi(BON[0]);
    const s = b.themNguoi(BON[1]);
    ok('2 người ngồi được, xếp theo ghế', s.nguoi.length === 2 && s.nguoi[0].id === 'A');
    ok('chế độ mặc định là nhất nhì ba tư', s.cheDo === 'hang' && s.cheDoTen === CHE_DO.hang);
    let loi = ''; try { b.themNguoi(BON[1]); } catch (e) { loi = e.message; }
    ok('ngồi 2 lần -> chặn', /đang ngồi/i.test(loi), loi);
    loi = ''; try { b.themNguoi({ id: 'X', ten: 'X', ghe: 0 }); } catch (e) { loi = e.message; }
    ok('ghế đã có người -> chặn', /Ghế/.test(loi), loi);
    b.themNguoi(BON[2]); b.themNguoi(BON[3]);
    loi = ''; try { b.themNguoi({ id: 'E', ten: 'E', ghe: 5 }); } catch (e) { loi = e.message; }
    ok('quá 4 người -> chặn', /đủ 4/.test(loi), loi);
    ok('rời bàn lúc chưa chia bài -> được', b.roiBan('D').nguoi.length === 3);
    b.vanMoi(0);
    loi = ''; try { b.roiBan('A'); } catch (e) { loi = e.message; }
    ok('đang giữa ván -> không rời được', /giữa ván/.test(loi), loi);
    loi = ''; try { b.themNguoi(BON[3]); } catch (e) { loi = e.message; }
    ok('đang giữa ván -> không ai vào được', /giữa ván/.test(loi), loi);
}

// ---------------------------------------------------------------- chia bài
muc('chia bài + ai đi đầu');
{
    const b = ban(4, { toiTrangOn: false });
    const s = b.vanMoi(0);
    const v = b._trong.van;
    ok('mỗi người đúng 13 lá', Object.values(v.tay).every(t => t.length === 13));
    ok('4 người = 52 lá, không lá nào trùng', new Set([].concat(...Object.values(v.tay))).size === 52);
    ok('ván đầu: người cầm 3♠ đi trước', v.tay[v.luot].includes('3s'), v.luot);
    ok('ván đầu bắt buộc đánh 3♠', v.batBuoc3Bich === true);
    ok('bài trên tay đã xếp sẵn nhỏ -> lớn', Object.values(v.tay).every(t => t.join() === B.xepBai(t).join()));
    // 19/09 chủ server: giấu luôn SỐ LÁ của nhau — bản chung chỉ nói còn bài hay hết bài
    ok('bản chung KHÔNG có lá và KHÔNG có số lá của ai', s.nguoi.every(p => p.la === undefined && p.soLa === undefined));
    ok('bản chung chỉ nói CÒN BÀI hay không', s.nguoi.every(p => p.conBai === true));
    const rieng = b.xem('A');
    ok('xem riêng thì thấy bài của CHÍNH MÌNH', Array.isArray(rieng.toi.la) && rieng.toi.la.length === 13);
    ok('...và không kèm bài người khác', JSON.stringify(rieng.nguoi).indexOf('"la"') < 0);

    const b2 = ban(2, { toiTrangOn: false });
    b2.vanMoi(0);
    ok('bàn 2 người vẫn 13 lá mỗi người', Object.values(b2._trong.van.tay).every(t => t.length === 13));
    const b3 = ban(3, { toiTrangOn: false, baBichOn: false });
    b3.vanMoi(0);
    ok('tắt luật 3♠ thì không bắt buộc', b3._trong.van.batBuoc3Bich === false);
}

// ---------------------------------------------------------------- đánh bài
muc('đánh bài + bỏ lượt + hết vòng');
{
    const b = ban(4, { toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '4s', '5s'], B: ['3c', '4c', '5c'], C: ['3d', '4d', '5d'], D: ['3h', '4h', '5h'] }, 'A');
    let loi = ''; try { b.danh('B', ['3c']); } catch (e) { loi = e.message; }
    ok('chưa tới lượt -> chặn', /Chưa tới lượt/.test(loi), loi);
    loi = ''; try { b.danh('A', ['9h']); } catch (e) { loi = e.message; }
    ok('đánh lá không có trên tay -> chặn', /không có lá/.test(loi), loi);
    loi = ''; try { b.danh('A', ['3s', '4s']); } catch (e) { loi = e.message; }
    ok('mớ lá không thành bộ -> chặn', /không thành bộ/.test(loi), loi);
    loi = ''; try { b.boLuot('A'); } catch (e) { loi = e.message; }
    ok('đang MỞ lượt thì không bỏ được', /phải đánh/.test(loi), loi);

    b.danh('A', ['3s'], 0);
    ok('đánh xong: bộ lên bàn, tay còn 2 lá, tới lượt B', v.bo.ten === '3♠' && v.tay.A.length === 2 && v.luot === 'B');
    loi = ''; try { b.danh('B', ['3c']); } catch (e) { loi = e.message; }
    ok('3♣ không lớn hơn 3♠? (♣ > ♠ nên PHẢI được)', loi === '', loi);
    ok('B đánh xong tới C', v.luot === 'C' && v.boCua === 'B');
    b.boLuot('C', 0); b.boLuot('D', 0);
    ok('C, D bỏ lượt -> quay lại A', v.luot === 'A' && v.daBo.size === 2);
    b.boLuot('A', 0);
    ok('cả bàn bỏ -> B ăn vòng, B mở vòng mới, bàn sạch bộ', v.luot === 'B' && v.bo === null && v.daBo.size === 0);
    ok('lịch sử ghi lại nước đi', v.lichSu.length >= 5 && v.lichSu[0].id === 'A');
}

muc('người hết bài thì bỏ qua, vòng vẫn chạy đúng');
{
    const b = ban(3, { toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c', '5c'], C: ['6d', '7d'] }, 'A');
    b.danh('A', ['3s'], 0);
    ok('A hết bài -> về nhất, ván chưa xong (còn 2 người cầm bài)', v.veNhat[0] === 'A' && b._trong.trangThai === 'DANG_CHAY');
    ok('lượt sang B', v.luot === 'B');
    b.boLuot('B', 0); b.boLuot('C', 0);
    ok('cả 2 bỏ, chủ bộ (A) hết bài -> người kế A còn bài là B mở vòng', v.luot === 'B' && v.bo === null, v.luot);
}

// ---------------------------------------------------------------- TIỀN: nhất nhì ba tư
muc('💰 chế độ NHẤT NHÌ BA TƯ (nhất↔tư, nhì↔ba) + phế 10%');
{
    const b = ban(4, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c'], C: ['5d'], D: ['6h'] }, 'A');
    // chế độ hạng: ván DỪNG khi chỉ còn 1 người cầm bài -> D (bét) không kịp đánh lá cuối
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('C', ['5d'], 0);
    const kq = v.ketQua;
    ok('thứ hạng đúng thứ tự về', kq.hang.join() === 'A,B,C,D', kq.hang.join());
    ok('nhất +1.000 rồi trừ phế 10% = +900', kq.tien.A === 900, String(kq.tien.A));
    ok('nhì +1.000 -> +900', kq.tien.B === 900, String(kq.tien.B));
    ok('ba  -1.000 (thua thì KHÔNG bị phế)', kq.tien.C === -1000, String(kq.tien.C));
    ok('tư  -1.000', kq.tien.D === -1000, String(kq.tien.D));
    ok('phế nhà cái = 200, đúng bằng phần hụt của bàn', kq.pheTong === 200 && tong(kq.tien) === -200, kq.pheTong + '/' + tong(kq.tien));
    ok('bảng tổng của người chơi cộng dồn đúng', b._trong.nguoi.find(p => p.id === 'A').tong === 900);
    ok('ván xong thì bàn về trạng thái CHỜ (chạy liên tục)', b._trong.trangThai === 'CHO');
    ok('nhật ký ghi ván vừa rồi', b._trong.nhatKy[0].van === v.so && b._trong.nhatKy[0].hang[0] === 'A');
    ok('lật bài cuối ván cho cả bàn xem', kq.lat.length === 4);
}
{
    const b = ban(3, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c'], C: ['5d'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0);   // C là bét, không kịp đánh
    ok('3 người: nhất ăn của ba, NHÌ HOÀ', v.ketQua.tien.A === 900 && v.ketQua.tien.B === 0 && v.ketQua.tien.C === -1000,
        JSON.stringify(v.ketQua.tien));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c'] }, 'A');
    b.danh('A', ['3s'], 0);
    ok('2 người: A hết bài là xong ván ngay', b._trong.trangThai === 'CHO' && v.ketQua.hang.join() === 'A,B');
    ok('2 người: nhất +900 (sau phế), nhì -1.000', v.ketQua.tien.A === 900 && v.ketQua.tien.B === -1000, JSON.stringify(v.ketQua.tien));
}

// ---------------------------------------------------------------- TIỀN: nhất ăn hết + đếm lá
muc('💰 chế độ NHẤT ĂN HẾT + ĐẾM LÁ');
{
    const b = ban(4, { cheDo: 'anhet', mucCuoc: 1000, giaLa: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c', '5c'], C: ['6d', '7d', '8d'], D: ['9h', '10h', 'Jh', 'Qh'] }, 'A');
    b.danh('A', ['3s'], 0);
    const kq = v.ketQua;
    ok('có người về nhất là DỪNG NGAY (không đánh tiếp như chế độ hạng)', b._trong.trangThai === 'CHO');
    ok('B còn 2 lá: -1.000 cược -2.000 lá = -3.000', kq.tien.B === -3000, String(kq.tien.B));
    ok('C còn 3 lá: -1.000 -3.000 = -4.000', kq.tien.C === -4000, String(kq.tien.C));
    ok('D còn 4 lá: -1.000 -4.000 = -5.000', kq.tien.D === -5000, String(kq.tien.D));
    ok('A ăn 12.000, phế 1.200 -> +10.800', kq.tien.A === 10800, String(kq.tien.A));
    ok('tổng bàn hụt đúng bằng phế', tong(kq.tien) === -kq.pheTong && kq.pheTong === 1200, tong(kq.tien) + '/' + kq.pheTong);
    ok('hạng người thua xếp theo SỐ LÁ CÒN LẠI (ít lá hạng cao hơn)', kq.hang.join() === 'A,B,C,D', kq.hang.join());
    ok('bảng chi tiết tách riêng cược và đếm lá', kq.chiTiet.D.cuoc === -1000 && kq.chiTiet.D.demLa === -4000 && kq.chiTiet.D.la === 4);
    const b2 = ban(4, { cheDo: 'anhet', mucCuoc: 1000, giaLa: 200, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b2.vanMoi(0);
    const v2 = dung(b2, { A: ['3s'], B: ['4c', '5c'], C: ['6d'], D: ['9h'] }, 'A');
    b2.danh('A', ['3s'], 0);
    ok('đơn giá lá chỉnh được (200/lá): B còn 2 lá = -1.400', v2.ketQua.tien.B === -1400, String(v2.ketQua.tien.B));
}

// ---------------------------------------------------------------- chặt heo + thối 2
muc('💥 CHẶT HEO có thưởng');
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2s', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2s'], 0);
    b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('3 đôi thông chặt được heo đen', v.lichSu[v.lichSu.length - 1].chat === true);
    ok('thưởng chặt heo ĐEN = 1 phần cược = 1.000', v.chatHeo[0].tien === 1000, JSON.stringify(v.chatHeo));
    ok('B hết bài -> về nhất', v.veNhat[0] === 'B');
    const kq = v.ketQua;
    ok('B: +1.000 cược +1.000 chặt = 2.000, phế 200 -> +1.800', kq.tien.B === 1800, String(kq.tien.B));
    ok('A: -1.000 cược -1.000 bị chặt = -2.000', kq.tien.A === -2000, String(kq.tien.A));
    ok('chi tiết ghi riêng khoản chặt', kq.chiTiet.B.chat === 1000 && kq.chiTiet.A.chat === -1000);
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2h', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2h'], 0);
    b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('heo ĐỎ phạt gấp đôi = 2.000', v.chatHeo[0].tien === 2000, JSON.stringify(v.chatHeo));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, chatHeoOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2s', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2s'], 0); b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('tắt luật chặt heo -> vẫn chặt được nhưng KHÔNG có thưởng', !v.chatHeo && v.ketQua.tien.B === 900, String(v.ketQua.tien.B));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['Ks', 'Kc', 'Kd', 'Kh', '3d'], B: ['As', 'Ac', 'Ad', 'Ah', '4c'] }, 'A');
    b.danh('A', ['Ks', 'Kc', 'Kd', 'Kh'], 0);
    b.danh('B', ['As', 'Ac', 'Ad', 'Ah'], 0);
    ok('tứ quý chặt tứ quý (không heo) -> KHÔNG thưởng', !v.chatHeo || v.chatHeo.length === 0);
}

muc('🐷 THỐI 2 (hết ván còn heo trên tay)');
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['2s', '2h'] }, 'A');
    b.danh('A', ['3s'], 0);
    const kq = v.ketQua;
    ok('B còn heo đen + heo đỏ = phạt 3 phần = 3.000', kq.chiTiet.B.thoi === -3000, String(kq.chiTiet.B.thoi));
    ok('A ăn 1.000 cược + 3.000 thối = 4.000, phế 400 -> +3.600', kq.tien.A === 3600, String(kq.tien.A));
    ok('B: -1.000 -3.000 = -4.000', kq.tien.B === -4000, String(kq.tien.B));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['2s', '2h'] }, 'A');
    b.danh('A', ['3s'], 0);
    ok('tắt thối 2 -> không phạt', v.ketQua.chiTiet.B.thoi === 0 && v.ketQua.tien.B === -1000);
}

// ---------------------------------------------------------------- tới trắng
muc('🎴 TỚI TRẮNG');
{
    const b = ban(4, { cheDo: 'hang', mucCuoc: 1000 });
    // ép bài A thành tứ quý heo NGAY TRƯỚC khi chia -> dùng đường vanMoi thật thì khó, nên
    // kiểm bằng cách gọi lại vanMoi với bộ bài đã dựng: thay hàm chia tạm thời.
    const goc = B.chia;
    const dat = [
        ['2s', '2c', '2d', '2h', '3s', '4c', '5d', '6h', '7s', '8c', '9d', '10h', 'Js'],
        ['3c', '4d', '5h', '6s', '7c', '8d', '9h', '10s', 'Jc', 'Qd', 'Kh', 'As', '3d'],
        ['4s', '5c', '6d', '7h', '8s', '9c', '10d', 'Jh', 'Qs', 'Kc', 'Ad', '3h', '4h'],
        ['5s', '6c', '7d', '8h', '9s', '10c', 'Jd', 'Qh', 'Ks', 'Ac', 'Qc', 'Kd', 'Ah'],
    ];
    let lan = 0;
    B.chia = () => dat[lan++].slice();
    const s = b.vanMoi(0);
    B.chia = goc;
    const kq = b._trong.van.ketQua;
    ok('A tứ quý heo -> tới trắng, ván kết thúc ngay', !!kq && !!kq.toiTrang && kq.toiTrang.id === 'A', JSON.stringify(kq && kq.toiTrang));
    ok('không ai đánh lá nào', b._trong.van.lichSu.length === 0);
    ok('tứ quý heo thưởng 8 phần cược: mỗi người trả 8.000', kq.chiTiet.B.toiTrang === -8000, String(kq.chiTiet.B.toiTrang));
    ok('A ăn 24.000, phế 2.400 -> +21.600', kq.tien.A === 21600, String(kq.tien.A));
    ok('A đứng hạng nhất', kq.hang[0] === 'A');
    ok('tổng hụt đúng bằng phế', tong(kq.tien) === -kq.pheTong);
    ok('trạng thái về CHỜ để chia ván kế', s.trangThai === 'CHO');
}

// ---------------------------------------------------------------- nhịp / AFK
muc('⏰ hết giờ + rớt mạng thì máy đánh giùm');
{
    const b = ban(4, { toiTrangOn: false, baBichOn: false, giayMoiLuot: 25 });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '4s'], B: ['5c', '6c'], C: ['7d', '8d'], D: ['9h', '10h'] }, 'A');
    b.danh('A', ['3s'], 0);
    ok('chưa hết giờ -> nhịp không làm gì', b.nhip(1000).van.luot === 'B');
    b.nhip(99999);
    ok('hết giờ mà đang THEO -> tự bỏ lượt', v.daBo.has('B'), JSON.stringify([...v.daBo]));
    const b2 = ban(2, { toiTrangOn: false, baBichOn: false });
    b2.vanMoi(0);
    const v2 = dung(b2, { A: ['5s', '2h'], B: ['6c', '7c'] }, 'A');
    b2.nhip(99999);
    ok('hết giờ mà đang MỞ lượt -> tự đánh LÁ NHỎ NHẤT', v2.lichSu[0].la.join() === '5s', JSON.stringify(v2.lichSu[0]));
    const b3 = ban(2, { toiTrangOn: false, baBichOn: false });
    b3.vanMoi(0);
    const v3 = dung(b3, { A: ['5s', '2h'], B: ['6c', '7c'] }, 'A');
    b3.roiMang('A');
    b3.nhip(0);
    ok('rớt mạng -> đánh giùm NGAY, không đợi hết giờ', v3.lichSu.length > 0);
}

// ---------------------------------------------------------------- chạy trọn vẹn
muc('chạy trọn vẹn nhiều ván (bàn chạy liên tục) — tiền không đẻ thêm');
{
    for (const cheDo of ['hang', 'anhet']) {
        let loiNao = '', vanXong = 0, lechTien = 0, treo = 0;
        for (let lan = 0; lan < 25; lan++) {
            const b = ban(2 + (lan % 3), { cheDo, mucCuoc: 1000, giaLa: 500 });
            let t = 0;
            for (let van = 0; van < 4; van++) {
                b.vanMoi(t);
                let buoc = 0;
                while (b._trong.trangThai === 'DANG_CHAY' && buoc++ < 400) {
                    const v = b._trong.van, id = v.luot;
                    if (!id) break;
                    const tay = v.tay[id];
                    // thử mọi lá lẻ rồi tới mọi đôi; không đánh được gì thì bỏ lượt
                    let danhDuoc = null;
                    for (const la of tay) if (B.danhDuoc(B.nhanDang([la]), v.bo).ok) { danhDuoc = [la]; break; }
                    if (!danhDuoc) {
                        for (let i = 0; i < tay.length - 1 && !danhDuoc; i++)
                            for (let j = i + 1; j < tay.length; j++) {
                                const bo = B.nhanDang([tay[i], tay[j]]);
                                if (bo && B.danhDuoc(bo, v.bo).ok) { danhDuoc = [tay[i], tay[j]]; break; }
                            }
                    }
                    try { if (danhDuoc) b.danh(id, danhDuoc, t); else b.boLuot(id, t); }
                    catch (e) { loiNao = loiNao || e.message; break; }
                    t += 1000;
                }
                if (buoc >= 400) treo++;
                const kq = b._trong.van && b._trong.van.ketQua;
                if (!kq) { treo++; continue; }
                vanXong++;
                if (tong(kq.tien) !== -kq.pheTong) lechTien++;
                if (kq.hang.length !== b._trong.nguoi.length) lechTien++;
            }
        }
        ok(cheDo + ': 100 ván chạy hết, không nổ lỗi', !loiNao && vanXong === 100, loiNao || ('xong ' + vanXong));
        ok(cheDo + ': không ván nào treo', treo === 0, String(treo));
        ok(cheDo + ': ván nào tổng tiền cũng hụt ĐÚNG bằng phế, hạng đủ người', lechTien === 0, String(lechTien));
    }
}

console.log('\n🀄 MÁY BÀN TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
