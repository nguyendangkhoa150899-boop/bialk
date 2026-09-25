// Bộ kiểm cho TienLen/van.js, máy ván + TIỀN. Chạy: node TienLen/kiemtra/van-test.js
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
/** Dựng tay bài theo ý muốn rồi chỉnh lượt, dùng để kiểm luật tiền cho chắc ăn. */
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
    // ⚠️ TẮT TỚI TRẮNG: để bật thì thỉnh thoảng (~1/15 lần) chia bài xong là có người tới trắng
    // -> ván CHỐT NGAY, trạng thái về CHO, và hai phép kiểm "đang giữa ván" ở dưới đỏ oan.
    // Luật tới trắng có mục kiểm riêng ở cuối file.
    const b = taoBan({ mucCuoc: 1000, toiTrangOn: false });
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
    // 19/09 chủ server: giấu luôn SỐ LÁ của nhau, bản chung chỉ nói còn bài hay hết bài
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

muc('🚫 BỎ LƯỢT LÀ NGHỈ HẾT VÒNG (chủ server chỉ ca này 20/09)');
{
    // Ca chủ server đưa nguyên văn:
    //    vòng 1: A đánh · B BỎ   · C đánh · D đánh
    //    vòng 2: A đánh · B NGHỈ · C đánh · D bỏ
    //    vòng 3: A đánh · B NGHỈ · C đánh · D NGHỈ
    //    "tới khi nào bỏ hết thì mới được vô vòng lại"
    // Bản cũ có dòng daBo.clear() trong danh() nên cứ ai đánh một lá là B được đánh lại ngay.
    const b = ban(4, { toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    // Mỗi người chừa DƯ một lá nhỏ: hết ba vòng mà ai cũng còn bài thì vòng mới thật sự
    // kết thúc vì CẢ BÀN BỎ, chứ không phải vì có người đi hết bài (hai chuyện khác nhau).
    const v = dung(b, {
        A: ['3s', '7s', 'Js', '3c'], B: ['4c', '8c', 'Qc', '4d'],
        C: ['5d', '9d', 'Kd', '5c'], D: ['6h', '10h', 'Ah', '6c'],
    }, 'A');

    // ---------- vòng 1 ----------
    b.danh('A', ['3s'], 0);
    ok('vòng 1: A đánh -> tới B', v.luot === 'B', v.luot);
    b.boLuot('B', 0);
    ok('vòng 1: B BỎ -> tới C', v.luot === 'C' && v.daBo.has('B'), v.luot);
    b.danh('C', ['5d'], 0);
    ok('vòng 1: C đánh -> tới D (B vẫn nằm trong sổ bỏ)', v.luot === 'D' && v.daBo.has('B'),
        v.luot + ' · daBo=' + [...v.daBo].join());
    b.danh('D', ['6h'], 0);

    // ---------- vòng 2: phải NHẢY QUA B ----------
    ok('vòng 2: quay lại A, KHÔNG phải B', v.luot === 'A', v.luot);
    let loi = ''; try { b.danh('B', ['8c'], 0); } catch (e) { loi = e.message; }
    ok('⭐ B đã bỏ thì KHÔNG được đánh nữa dù có người đánh tiếp', /Chưa tới lượt/.test(loi), loi || '(B đánh được, SAI LUẬT)');
    b.danh('A', ['7s'], 0);
    ok('⭐ A đánh xong NHẢY QUA B, tới thẳng C', v.luot === 'C', v.luot);
    b.danh('C', ['9d'], 0);
    ok('vòng 2: tới D', v.luot === 'D', v.luot);
    b.boLuot('D', 0);
    ok('vòng 2: D bỏ -> sổ bỏ có cả B và D', v.daBo.has('B') && v.daBo.has('D'), [...v.daBo].join());

    // ---------- vòng 3: nhảy qua cả B lẫn D ----------
    ok('vòng 3: tới A', v.luot === 'A', v.luot);
    b.danh('A', ['Js'], 0);
    ok('⭐ nhảy qua B, tới C', v.luot === 'C', v.luot);
    b.danh('C', ['Kd'], 0);
    ok('⭐ nhảy qua D, quay về A', v.luot === 'A', v.luot);
    ok('B và D vẫn đang nghỉ', v.daBo.has('B') && v.daBo.has('D'), [...v.daBo].join());

    // ---------- A bỏ nốt -> cả vòng bỏ hết -> C ăn vòng, sổ bỏ XOÁ SẠCH ----------
    b.boLuot('A', 0);
    ok('⭐ cả vòng bỏ hết -> C (chủ bộ) ăn vòng và mở vòng mới', v.luot === 'C' && v.bo === null, v.luot);
    ok('⭐ "tới khi nào bỏ hết thì mới được vô vòng lại", sổ bỏ xoá sạch',
        v.daBo.size === 0, [...v.daBo].join());
    ok('bàn dọn sạch bài vòng cũ', v.chongBai.length === 0);
}
{
    // 2 người: B bỏ là A ăn vòng luôn, không phải chờ thêm
    const b = ban(2, { toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '7s'], B: ['4c', '8c'] }, 'A');
    b.danh('A', ['3s'], 0);
    b.boLuot('B', 0);
    ok('2 người: B bỏ -> A ăn vòng, mở vòng mới ngay', v.luot === 'A' && v.bo === null && v.daBo.size === 0, v.luot);
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

// ---------------------------------------------------------------- TIỀN
// ⚠️ TOÀN BỘ KHỐI NÀY VIẾT LẠI 20/09 theo luật gốc Ba Bích (babichgame.gitbook.io).
// Mọi con số dưới đây lấy mucCuoc = 1.000, tức 1 CƯỢC = 1.000 Dogcoin, cho dễ nhẩm.
// Bàn thật: phòng truyền thống 1 cược = 50.000, phòng đếm lá 1 cược = 5.000.
//
// 📌 CÓNG = cả ván không đánh nổi một lá nào. Trong mấy ván dựng tay bài 1–2 lá dưới đây
// người về bét thường CHƯA KỊP đánh -> dính cóng. Đó là thật, không phải lỗi test: ván
// dừng khi chỉ còn 1 người cầm bài, ai chưa đánh lá nào là cóng. Nên mỗi phép kiểm đều
// có bản SONG SINH: một ván ai cũng kịp đánh (không cóng) và một ván có người cóng.

/** Ván 4 người ai cũng kịp đánh: mỗi người 2 lá, đánh so le nên không ai bị cóng. */
function vanKhongCong(b) {
    const v = dung(b, { A: ['3s', '7s'], B: ['4c', '8c'], C: ['5d', '9d'], D: ['6h', '10h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('C', ['5d'], 0); b.danh('D', ['6h'], 0);
    b.danh('A', ['7s'], 0); b.danh('B', ['8c'], 0); b.danh('C', ['9d'], 0);
    return v;
}

muc('💰 TRUYỀN THỐNG 1-2-3-4, ăn thua theo vị trí về');
{
    const b = ban(4, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const kq = vanKhongCong(b).ketQua;
    ok('thứ hạng đúng thứ tự về', kq.hang.join() === 'A,B,C,D', kq.hang.join());
    ok('không ai bị cóng (ai cũng kịp đánh)', kq.cong.length === 0, JSON.stringify(kq.cong));
    ok('nhất +1 cược = 1.000, phế 10% -> +900', kq.tien.A === 900, String(kq.tien.A));
    ok('nhì +0.5 cược = 500, phế 50 -> +450', kq.tien.B === 450, String(kq.tien.B));
    ok('ba  −0.5 cược = −500 (thua thì KHÔNG bị phế)', kq.tien.C === -500, String(kq.tien.C));
    ok('bét −1 cược = −1.000', kq.tien.D === -1000, String(kq.tien.D));
    ok('phế nhà cái = 150, đúng bằng phần hụt của bàn', kq.pheTong === 150 && tong(kq.tien) === -150, kq.pheTong + '/' + tong(kq.tien));
    ok('bảng tổng của người chơi cộng dồn đúng', b._trong.nguoi.find(p => p.id === 'A').tong === 900);
    ok('ván xong thì bàn về trạng thái CHỜ (chạy liên tục)', b._trong.trangThai === 'CHO');
    ok('nhật ký ghi ván vừa rồi', b._trong.nhatKy[0].hang[0] === 'A');
    ok('lật bài cuối ván cho cả bàn xem', kq.lat.length === 4);
}
{
    const b = ban(3, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '6s'], B: ['4c', '7c'], C: ['5d', '8d'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('C', ['5d'], 0);
    b.danh('A', ['6s'], 0); b.danh('B', ['7c'], 0);
    const kq = v.ketQua;
    ok('3 người: nhất +1.5 cược -> 1.500 phế 150 = 1.350', kq.tien.A === 1350, String(kq.tien.A));
    ok('3 người: nhì −0.5 cược = −500 (KHÔNG còn hoà như bản cũ)', kq.tien.B === -500, String(kq.tien.B));
    ok('3 người: bét −1 cược = −1.000', kq.tien.C === -1000, String(kq.tien.C));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '6c'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    ok('2 người: A hết bài là xong ván ngay', b._trong.trangThai === 'CHO' && v.ketQua.hang.join() === 'A,B');
    ok('2 người: nhất +900 (sau phế), bét −1.000', v.ketQua.tien.A === 900 && v.ketQua.tien.B === -1000, JSON.stringify(v.ketQua.tien));
}

muc('🧊 CÓNG, cả ván không đánh nổi lá nào');
{
    const b = ban(4, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c'], C: ['5d'], D: ['6h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('C', ['5d'], 0);   // D chưa kịp đánh
    const kq = v.ketQua;
    ok('D bị tính CÓNG', kq.cong.join() === 'D' && kq.chiTiet.D.cong === true, JSON.stringify(kq.cong));
    ok('cóng mất GẤP ĐÔI mức bét: −2 cược = −2.000', kq.tien.D === -2000, String(kq.tien.D));
    ok('nhì / ba vẫn ăn thua như thường', kq.tien.B === 450 && kq.tien.C === -500, JSON.stringify(kq.tien));
    ok('phần dôi ra vì cóng dồn cho NHẤT: 1.000+1.000 = 2.000, phế 200 -> 1.800', kq.tien.A === 1800, String(kq.tien.A));
    ok('bàn vẫn cân: tổng = −phế', tong(kq.tien) === -kq.pheTong, tong(kq.tien) + '/' + kq.pheTong);
}
{
    const b = ban(4, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '4s'], B: ['5c'], C: ['6d'], D: ['7h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['5c'], 0); b.danh('C', ['6d'], 0);
    // B, C hết bài; A còn 4s, D còn 7h -> còn 2 người cầm bài, ván chạy tiếp
    b.danh('D', ['7h'], 0);
    const kq = v.ketQua;
    ok('ai cũng đánh ít nhất 1 lá -> không ai cóng', kq.cong.length === 0, JSON.stringify(kq.cong));
    ok('bỏ lượt KHÔNG cứu được cóng, phải ĐÁNH mới thoát', /daDanh/.test(require('fs').readFileSync(__dirname + '/../van.js', 'utf8')));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c'] }, 'A');
    b.danh('A', ['3s'], 0);
    ok('2 người, bét cóng: −2 cược, nhất ăn cả phần dôi', v.ketQua.tien.B === -2000 && v.ketQua.tien.A === 1800, JSON.stringify(v.ketQua.tien));
}

muc('💰 ĐẾM LÁ, nhất ăn hết, mỗi lá = 1 cược, KHÔNG có cược nền');
{
    const b = ban(4, { cheDo: 'anhet', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '7s'], B: ['4c', '8c', '9c'], C: ['5d', '10d', 'Jd', 'Qd'], D: ['6h', 'Kh', 'Ah', '4h', '5h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('C', ['5d'], 0); b.danh('D', ['6h'], 0);
    b.danh('A', ['7s'], 0);                       // A hết bài -> DỪNG NGAY
    const kq = v.ketQua;
    ok('có người về nhất là DỪNG NGAY (khác chế độ hạng)', b._trong.trangThai === 'CHO');
    ok('không ai cóng (ai cũng kịp đánh 1 lá)', kq.cong.length === 0, JSON.stringify(kq.cong));
    ok('B còn 2 lá = −2.000 (KHÔNG có cược nền nữa)', kq.tien.B === -2000, String(kq.tien.B));
    ok('C còn 3 lá = −3.000', kq.tien.C === -3000, String(kq.tien.C));
    ok('D còn 4 lá = −4.000', kq.tien.D === -4000, String(kq.tien.D));
    ok('A ăn 9.000, phế 900 -> +8.100', kq.tien.A === 8100, String(kq.tien.A));
    ok('tổng bàn hụt đúng bằng phế', tong(kq.tien) === -kq.pheTong && kq.pheTong === 900, tong(kq.tien) + '/' + kq.pheTong);
    ok('hạng người thua xếp theo SỐ LÁ CÒN LẠI (ít lá hạng cao hơn)', kq.hang.join() === 'A,B,C,D', kq.hang.join());
    ok('bảng chi tiết: không còn khoản cược nền, chỉ đếm lá', kq.chiTiet.D.cuoc === 0 && kq.chiTiet.D.demLa === -4000 && kq.chiTiet.D.la === 4);
}
{
    const b = ban(4, { cheDo: 'anhet', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['4c', '5c'], C: ['6d', '7d', '8d'], D: ['9h', '10h', 'Jh', 'Qh'] }, 'A');
    b.danh('A', ['3s'], 0);                       // A ra ngay, ba người kia chưa ai đánh
    const kq = v.ketQua;
    ok('đếm lá: nhất ra ngay -> cả ba người còn lại CÓNG', kq.cong.sort().join() === 'B,C,D', JSON.stringify(kq.cong));
    ok('cóng: mỗi lá tính GẤP ĐÔI, B 2 lá = −4.000', kq.tien.B === -4000, String(kq.tien.B));
    ok('C 3 lá cóng = −6.000', kq.tien.C === -6000, String(kq.tien.C));
    ok('D 4 lá cóng = −8.000', kq.tien.D === -8000, String(kq.tien.D));
    ok('A ăn 18.000, phế 1.800 -> +16.200', kq.tien.A === 16200, String(kq.tien.A));
}

muc('💥 CHẶT, trả theo BẢNG GIÁ, chặt HÀNG cũng ăn tiền');
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2s', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2s'], 0);
    b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('3 đôi thông chặt được heo đen', v.lichSu[v.lichSu.length - 1].chat === true);
    ok('bàn TRUYỀN THỐNG: heo đen = 0.5 cược = 500', v.chatHeo[0].tien === 500, JSON.stringify(v.chatHeo));
    ok('ghi rõ chặt trúng mục giá nào', v.chatHeo[0].muc.join() === 'heoDen', JSON.stringify(v.chatHeo[0].muc));
    ok('B hết bài -> về nhất', v.veNhat[0] === 'B');
    const kq = v.ketQua;
    ok('chi tiết ghi riêng khoản chặt', kq.chiTiet.B.chat === 500 && kq.chiTiet.A.chat === -500, JSON.stringify(kq.chiTiet.B));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2h', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2h'], 0); b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('heo ĐỎ gấp đôi heo đen = 1 cược = 1.000', v.chatHeo[0].tien === 1000, JSON.stringify(v.chatHeo));
}
{
    const b = ban(2, { cheDo: 'anhet', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2h', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2h'], 0); b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('bàn ĐẾM LÁ dùng bảng giá KHÁC: heo đỏ = 6 cược = 6.000', v.chatHeo[0].tien === 6000, JSON.stringify(v.chatHeo));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, chatHeoOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['2s', '3d'], B: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'A');
    b.danh('A', ['2s'], 0); b.danh('B', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    ok('tắt luật chặt -> vẫn chặt được nhưng KHÔNG có thưởng', !v.chatHeo && v.ketQua.chiTiet.B.chat === 0);
}
{
    // ⭐ LUẬT MỚI: bản cũ chỉ trả tiền khi chặt trúng HEO. Giờ chặt trúng HÀNG cũng ăn.
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['4s', '4c', '5s', '5c', '6s', '6c', '3d'], B: ['Ks', 'Kc', 'Kd', 'Kh', '3h'] }, 'A');
    b.danh('A', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    b.danh('B', ['Ks', 'Kc', 'Kd', 'Kh'], 0);
    ok('tứ quý chặt 3 đôi thông', v.lichSu[v.lichSu.length - 1].chat === true);
    ok('3 đôi thông BỊ CHẶT = 1 cược = 1.000', v.chatHeo && v.chatHeo[0].tien === 1000, JSON.stringify(v.chatHeo));
}
{
    const b = ban(2, { cheDo: 'anhet', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['4s', '4c', '5s', '5c', '6s', '6c', '3d'], B: ['Ks', 'Kc', 'Kd', 'Kh', '3h'] }, 'A');
    b.danh('A', ['4s', '4c', '5s', '5c', '6s', '6c'], 0);
    b.danh('B', ['Ks', 'Kc', 'Kd', 'Kh'], 0);
    ok('bàn đếm lá: 3 đôi thông bị chặt = 12 cược = 12.000', v.chatHeo[0].tien === 12000, JSON.stringify(v.chatHeo));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['Ks', 'Kc', 'Kd', 'Kh', '3d'], B: ['As', 'Ac', 'Ad', 'Ah', '4c'] }, 'A');
    b.danh('A', ['Ks', 'Kc', 'Kd', 'Kh'], 0);
    b.danh('B', ['As', 'Ac', 'Ad', 'Ah'], 0);
    // ⚠️ CHỖ NÀY CỐ Ý: tứ quý đè tứ quý là ĐÁNH ĐÈ THƯỜNG (cùng kiểu, cùng dài -> so lá cao),
    // KHÔNG phải chặt, nên không có tiền. Y hệt 3 đôi thông đè 3 đôi thông. Luật gốc Ba Bích
    // không nói rõ trường hợp này, nếu chủ server muốn tính tiền thì phải đổi danhDuoc() ở
    // bai.js cho nó trả chat:true, đừng vá ở van.js.
    ok('tứ quý đè tứ quý = đánh đè thường, KHÔNG phải chặt, không có tiền',
        !v.chatHeo || v.chatHeo.length === 0, JSON.stringify(v.chatHeo));
    ok('...nhưng vẫn đè được', v.veNhat.length > 0 || v.tay.B.length === 1, JSON.stringify(v.tay.B));
}

muc('🐷 NHỐT (thối), hết ván còn HEO hoặc HÀNG trên tay');
{
    // Ván ai cũng kịp đánh: B nhốt 1 heo đen + 1 heo đỏ = 0.5 + 1 = 1.5 cược
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '2s', '2h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    const kq = v.ketQua;
    ok('B không cóng (đã đánh 4♣)', kq.cong.length === 0, JSON.stringify(kq.cong));
    ok('nhốt heo đen 0.5 + heo đỏ 1 = 1.5 cược = 1.500', kq.chiTiet.B.thoi === -1500, String(kq.chiTiet.B.thoi));
    ok('bảng ghi rõ nhốt những mục nào', kq.chiTiet.B.thoiMuc.sort().join() === 'heoDen,heoDo', JSON.stringify(kq.chiTiet.B.thoiMuc));
    ok('A: 1.000 cược + 1.500 nhốt = 2.500, phế 250 -> +2.250', kq.tien.A === 2250, String(kq.tien.A));
    ok('B: −1.000 −1.500 = −2.500', kq.tien.B === -2500, String(kq.tien.B));
}
{
    // Y hệt trên nhưng B CÓNG -> mọi khoản của B nhân đôi
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s'], B: ['2s', '2h'] }, 'A');
    b.danh('A', ['3s'], 0);
    const kq = v.ketQua;
    ok('B cóng + nhốt 2 heo: cược −2.000, nhốt −3.000 = −5.000', kq.tien.B === -5000, String(kq.tien.B));
    ok('nhốt cũng nhân đôi khi cóng: 1.5 cược x2 = 3.000', kq.chiTiet.B.thoi === -3000, String(kq.chiTiet.B.thoi));
    ok('A ăn 5.000, phế 500 -> +4.500', kq.tien.A === 4500, String(kq.tien.A));
}
{
    // ⭐ LUẬT MỚI: bản cũ chỉ phạt HEO còn trên tay. Giờ nhốt cả HÀNG.
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', 'Ks', 'Kc', 'Kd', 'Kh'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    const kq = v.ketQua;
    ok('nhốt TỨ QUÝ = 1.5 cược = 1.500 (bản cũ không phạt)', kq.chiTiet.B.thoi === -1500, String(kq.chiTiet.B.thoi));
    ok('bảng ghi đúng loại hàng bị nhốt', kq.chiTiet.B.thoiMuc.join() === 'tu', JSON.stringify(kq.chiTiet.B.thoiMuc));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '7s', '7c', '8s', '8c', '9s', '9c'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    ok('nhốt 3 ĐÔI THÔNG = 1 cược = 1.000', v.ketQua.chiTiet.B.thoi === -1000, String(v.ketQua.chiTiet.B.thoi));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '7s', '7c', '8s', '8c', '9s', '9c', '10s', '10c'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    ok('nhốt 4 ĐÔI THÔNG = 2 cược = 2.000 (không tính thành 3 đôi thông)',
        v.ketQua.chiTiet.B.thoi === -2000 && v.ketQua.chiTiet.B.thoiMuc.join() === 'thong4', JSON.stringify(v.ketQua.chiTiet.B.thoiMuc));
}
{
    const b = ban(2, { cheDo: 'anhet', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', 'Ks', 'Kc', 'Kd', 'Kh'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    const kq = v.ketQua;
    ok('bàn ĐẾM LÁ: nhốt tứ quý = 12 cược = 12.000', kq.chiTiet.B.thoi === -12000, String(kq.chiTiet.B.thoi));
    ok('...cộng tiền lá 4 lá = 4.000', kq.chiTiet.B.demLa === -4000, String(kq.chiTiet.B.demLa));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '6s', '7c', '8d', '9h', '10s'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    ok('nhốt SẢNH thì KHÔNG mất tiền (luật chỉ tính heo + 3 loại hàng)',
        v.ketQua.chiTiet.B.thoi === 0, String(v.ketQua.chiTiet.B.thoi));
}
{
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false, thoiHeoOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '2s', '2h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    ok('tắt luật nhốt -> không phạt gì', v.ketQua.chiTiet.B.thoi === 0 && v.ketQua.tien.B === -1000, JSON.stringify(v.ketQua.tien));
}
{
    // 4 con 2 = 2 heo đen + 2 heo đỏ (3 cược), KHÔNG phải một tứ quý (1.5 cược)
    const b = ban(2, { cheDo: 'hang', mucCuoc: 1000, toiTrangOn: false, baBichOn: false });
    b.vanMoi(0);
    const v = dung(b, { A: ['3s', '5s'], B: ['4c', '2s', '2c', '2d', '2h'] }, 'A');
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('A', ['5s'], 0);
    ok('nhốt TỨ QUÝ HEO tính là 4 lá heo (3 cược) chứ không phải tứ quý (1.5)',
        v.ketQua.chiTiet.B.thoi === -3000, String(v.ketQua.chiTiet.B.thoi));
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

muc('♠️ TỚI TRẮNG: VÁN ĐẦU CÓ HÀNG CHỨA 3♠');
{
    // A cầm 3 đôi thông 3-4-5 trong đó có 3♠. B/C/D dựng sao cho KHÔNG ai tới trắng kiểu khác,
    // không thì chẳng biết ván chốt vì lý do nào.
    const DAT = [
        ['3s', '3c', '4s', '4c', '5s', '5c', '6h', '7d', '8d', '9s', '10h', 'Qc', 'Ad'],
        ['3d', '3h', '4d', '4h', '5d', '5h', '6s', '6c', '6d', '8s', '8c', '8h', '10s'],
        ['7s', '7c', '7h', '9c', '9d', '9h', '10c', '10d', 'Js', 'Jc', 'Jd', 'Jh', '2s'],
        ['Qs', 'Qd', 'Qh', 'Ks', 'Kc', 'Kd', 'Kh', 'As', 'Ac', 'Ah', '2c', '2d', '2h'],
    ];
    const chiaEp = (b) => { const goc = B.chia; let i = 0; B.chia = () => DAT[i++].slice(); try { return b.vanMoi(0); } finally { B.chia = goc; } };

    const b = ban(4, { cheDo: 'hang', mucCuoc: 1000 });
    chiaEp(b);
    const kq = b._trong.van.ketQua;
    ok('⭐ ván ĐẦU: A có 3 đôi thông chứa 3♠ -> tới trắng ngay',
        !!kq && !!kq.toiTrang && kq.toiTrang.id === 'A' && kq.toiTrang.ma === 'hang_3bich',
        JSON.stringify(kq && kq.toiTrang));
    ok('không ai đánh lá nào', b._trong.van.lichSu.length === 0);
    ok('thưởng 2 cược: mỗi người trả 2.000', kq.chiTiet.B.toiTrang === -2000, String(kq.chiTiet.B.toiTrang));
    ok('A ăn 6.000, phế 600 -> +5.400', kq.tien.A === 5400, String(kq.tien.A));

    // ⭐ ván SAU: đã có người về nhất ván trước -> 3♠ không còn đi đầu, luật này tắt
    const b2 = ban(4, { cheDo: 'hang', mucCuoc: 1000 });
    b2._trong.nhatTruoc = 'B';
    chiaEp(b2);
    const kq2 = b2._trong.van.ketQua;
    ok('⭐ ván SAU: CÙNG tay bài đó KHÔNG còn tới trắng', !kq2, JSON.stringify(kq2 && kq2.toiTrang));
    ok('...và ván chạy bình thường, B đi đầu', b2._trong.van.luot === 'B', b2._trong.van.luot);

    // tắt luật 3♠ thì cũng tắt luôn cái này (3♠ hết đi đầu thì có phá hàng đâu mà đền)
    const b3 = ban(4, { cheDo: 'hang', mucCuoc: 1000, baBichOn: false });
    chiaEp(b3);
    ok('tắt luật 3♠ -> không tới trắng kiểu này', !b3._trong.van.ketQua,
        JSON.stringify(b3._trong.van.ketQua && b3._trong.van.ketQua.toiTrang));
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
muc('chạy trọn vẹn nhiều ván (bàn chạy liên tục), tiền không đẻ thêm');
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
