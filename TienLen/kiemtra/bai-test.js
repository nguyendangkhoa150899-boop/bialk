// Bộ kiểm cho TienLen/bai.js — chạy: node TienLen/kiemtra/bai-test.js
'use strict';
const B = require('../bai.js');

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');
const nd = (s) => B.nhanDang(s.split(' '));
const danh = (a, b) => B.danhDuoc(nd(a), b ? nd(b) : null);

// ---------------------------------------------------------------- lá bài
muc('thứ tự lá bài (3 nhỏ nhất, heo lớn nhất, chất ♠<♣<♦<♥)');
{
    ok('bộ có đúng 52 lá, không trùng', B.BO52.length === 52 && new Set(B.BO52).size === 52);
    ok('3♠ nhỏ nhất bộ', Math.min(...B.BO52.map(B.tri)) === B.tri('3s'));
    ok('2♥ lớn nhất bộ', Math.max(...B.BO52.map(B.tri)) === B.tri('2h'));
    ok('3 < 4 < 10 < J < A < 2', B.tri('3s') < B.tri('4s') && B.tri('4s') < B.tri('10s') &&
        B.tri('10s') < B.tri('Js') && B.tri('Js') < B.tri('As') && B.tri('As') < B.tri('2s'));
    ok('cùng số: ♠ < ♣ < ♦ < ♥', B.tri('5s') < B.tri('5c') && B.tri('5c') < B.tri('5d') && B.tri('5d') < B.tri('5h'));
    ok('A♥ vẫn NHỎ hơn 2♠ (số quan trọng hơn chất)', B.tri('Ah') < B.tri('2s'));
    ok("đọc '10h' ra 10 cơ (cắt từ cuối)", B.doc('10h').so === '10' && B.doc('10h').chat === 'h');
    ok('mã lá lạ thì ném lỗi', (() => { try { B.doc('Zx'); return false; } catch (e) { return true; } })());
    ok('ten1 viết được ký tự chất', B.ten1('Kh') === 'K♥' && B.ten1('2s') === '2♠');
    ok('laHeo đúng', B.laHeo('2c') && !B.laHeo('Ac'));
}

muc('xáo bài + chia + xếp bài');
{
    const bo = B.boMoi();
    ok('bộ mới đủ 52 lá không trùng', bo.length === 52 && new Set(bo).size === 52);
    const a = B.boMoi().join(), b = B.boMoi().join();
    ok('hai lần xáo ra thứ tự khác nhau', a !== b);
    const bo2 = B.boMoi(), tay = B.chia(bo2, 13);
    ok('chia 13 lá thì bộ còn 39', tay.length === 13 && bo2.length === 39);
    ok('chia thiếu lá thì ném lỗi', (() => { try { B.chia([], 1); return false; } catch (e) { return true; } })());
    const xep = B.xepBai(['2h', '3s', 'Kd', '3c', '10h']);
    ok('🔀 xếp bài: nhỏ -> lớn, cùng số thì theo chất', xep.join(' ') === '3s 3c 10h Kd 2h', xep.join(' '));
    ok('xếp bài KHÔNG đụng mảng gốc', (() => { const t = ['2h', '3s']; B.xepBai(t); return t.join() === '2h,3s'; })());
}

// ---------------------------------------------------------------- nhận dạng bộ
muc('nhận dạng bộ');
{
    ok('1 lá = rác', nd('3s').kieu === 'rac' && nd('3s').dai === 1);
    ok('2 lá cùng số = đôi', nd('7s 7h').kieu === 'doi');
    ok('3 lá cùng số = ba', nd('9s 9c 9d').kieu === 'ba');
    ok('4 lá cùng số = tứ quý', nd('Js Jc Jd Jh').kieu === 'tu');
    ok('2 lá khác số = KHÔNG thành bộ', nd('7s 8h') === null);
    ok('5 lá cùng số là không thể -> null', B.nhanDang(['7s', '7c', '7d', '7h', '7s']) === null);
    ok('lá trùng = null (chống gian)', B.nhanDang(['7s', '7s']) === null);
    ok('mã lá lạ = null', B.nhanDang(['Zx', '7s']) === null);
    ok('mảng rỗng = null', B.nhanDang([]) === null);

    ok('sảnh 3 lá liên tiếp', nd('3s 4c 5d').kieu === 'sanh' && nd('3s 4c 5d').dai === 3);
    ok('sảnh 5 lá', nd('10s Jc Qd Kh As').kieu === 'sanh');
    ok('sảnh 2 lá KHÔNG hợp lệ', nd('3s 4c') === null);
    ok('không liên tiếp = null', nd('3s 4c 6d') === null);
    ok('⚠️ sảnh KHÔNG được chứa heo: A-2-3 sai', nd('Ks As 2s') === null);
    ok('⚠️ sảnh KHÔNG được chứa heo: Q-K-A-2 sai', nd('Qs Kc Ad 2h') === null);
    ok('sảnh tới A vẫn hợp lệ', nd('Js Qc Kd Ah').kieu === 'sanh');

    ok('3 đôi thông', nd('3s 3c 4s 4c 5s 5c').kieu === 'thong' && nd('3s 3c 4s 4c 5s 5c').dai === 3);
    ok('4 đôi thông', nd('7s 7c 8s 8c 9s 9c 10s 10c').dai === 4);
    ok('2 đôi thông KHÔNG hợp lệ', nd('3s 3c 4s 4c') === null);
    ok('đôi không liên tiếp = null', nd('3s 3c 4s 4c 6s 6c') === null);
    ok('⚠️ đôi thông KHÔNG được chứa heo', nd('Ks Kc As Ac 2s 2c') === null);
    ok('6 lá 3 số mà lệch số lượng = null', nd('3s 3c 3d 4s 4c 5s') === null);
}

// ---------------------------------------------------------------- so bộ cùng kiểu
muc('so bộ cùng kiểu');
{
    ok('4♠ > 3♥ (số thắng chất)', B.soBo(nd('4s'), nd('3h')) === 1);
    ok('3♥ > 3♠ (cùng số thì chất quyết)', B.soBo(nd('3h'), nd('3s')) === 1);
    ok('đôi 8 có ♥ > đôi 8 không ♥', B.soBo(nd('8d 8h'), nd('8s 8c')) === 1);
    ok('khác kiểu = null (không so được)', B.soBo(nd('3s 3c'), nd('3d')) === null);
    ok('cùng kiểu khác độ dài = null', B.soBo(nd('3s 4c 5d 6h'), nd('3c 4d 5h')) === null);
    ok('sảnh so theo lá CAO NHẤT', B.soBo(nd('4s 5c 6d'), nd('3h 4c 5d')) === 1);
    ok('sảnh cùng đầu cùng cuối thì chất lá cao quyết', B.soBo(nd('3s 4s 5h'), nd('3c 4c 5d')) === 1);
    ok('không bao giờ hoà (chất phân định)', B.soBo(nd('5s'), nd('5s')) === 0);
}

// ---------------------------------------------------------------- chặt
muc('CHẶT (bom) — 3 đôi thông / tứ quý / 4 đôi thông');
{
    const heoLe = nd('2s'), doiHeo = nd('2s 2c'), baHeo = nd('2s 2c 2d'), tuHeo = nd('2s 2c 2d 2h');
    const ba3 = nd('3s 3c 4s 4c 5s 5c'), ba4 = nd('6s 6c 7s 7c 8s 8c');
    const tuQuy3 = nd('3s 3c 3d 3h'), tuQuyK = nd('Ks Kc Kd Kh');
    const bon3 = nd('3s 3c 4s 4c 5s 5c 6s 6c'), bon7 = nd('7s 7c 8s 8c 9s 9c 10s 10c');

    ok('3 đôi thông chặt HEO LẺ', B.chatDuoc(ba3, heoLe));
    ok('3 đôi thông KHÔNG chặt được đôi heo', !B.chatDuoc(ba3, doiHeo));
    ok('3 đôi thông chặt 3 đôi thông nhỏ hơn', B.chatDuoc(ba4, ba3) && !B.chatDuoc(ba3, ba4));
    ok('3 đôi thông KHÔNG chặt tứ quý', !B.chatDuoc(ba3, tuQuy3));

    ok('tứ quý chặt heo lẻ', B.chatDuoc(tuQuy3, heoLe));
    ok('tứ quý chặt đôi heo', B.chatDuoc(tuQuy3, doiHeo));
    ok('tứ quý KHÔNG chặt ba heo', !B.chatDuoc(tuQuy3, baHeo));
    ok('tứ quý chặt 3 đôi thông', B.chatDuoc(tuQuy3, ba3));
    ok('tứ quý lớn chặt tứ quý nhỏ', B.chatDuoc(tuQuyK, tuQuy3) && !B.chatDuoc(tuQuy3, tuQuyK));

    ok('4 đôi thông chặt heo lẻ / đôi heo / ba heo', B.chatDuoc(bon3, heoLe) && B.chatDuoc(bon3, doiHeo) && B.chatDuoc(bon3, baHeo));
    ok('4 đôi thông chặt 3 đôi thông', B.chatDuoc(bon3, ba4));
    ok('4 đôi thông chặt tứ quý (kể cả tứ quý heo)', B.chatDuoc(bon3, tuQuyK) && B.chatDuoc(bon3, tuHeo));
    ok('4 đôi thông lớn chặt 4 đôi thông nhỏ', B.chatDuoc(bon7, bon3) && !B.chatDuoc(bon3, bon7));
    ok('tứ quý KHÔNG chặt được 4 đôi thông', !B.chatDuoc(tuQuyK, bon3));
    ok('tứ quý heo bị 4 đôi thông chặt, nhưng chặt lại được mọi tứ quý khác', B.chatDuoc(tuHeo, tuQuyK));

    ok('bài thường (không heo) KHÔNG bị chặt: tứ quý không chặt được đôi K', !B.chatDuoc(tuQuy3, nd('Ks Kh')));
    ok('bài thường không chặt được gì: đôi 5 không chặt heo lẻ', !B.chatDuoc(nd('5s 5c'), heoLe));
    ok('sảnh không phải hàng chặt', !B.chatDuoc(nd('3s 4c 5d 6h 7s'), heoLe));
}

// ---------------------------------------------------------------- đánh được không
muc('đánh đè lượt trước');
{
    ok('mở lượt thì đánh gì cũng được', danh('3s', null).ok && danh('2h', null).ok);
    ok('cùng kiểu lớn hơn = được', danh('5s', '4h').ok);
    ok('cùng kiểu nhỏ hơn = chặn, có lý do', !danh('4s', '5h').ok && /không lớn hơn/.test(danh('4s', '5h').vi));
    ok('khác kiểu = chặn, lý do nói rõ phải đánh gì', !danh('5s 5c', '4h').ok && /1 lá/.test(danh('5s 5c', '4h').vi));
    ok('sảnh 3 lá không đè được sảnh 4 lá', !danh('5s 6c 7d', '3s 4c 5h 6d').ok);
    ok('chặt thì cờ chat = true', danh('3s 3c 4s 4c 5s 5c', '2h').ok && danh('3s 3c 4s 4c 5s 5c', '2h').chat === true);
    ok('đánh thường thì chat = false', danh('5s', '4h').chat === false);
    ok('mấy lá không thành bộ = chặn', !B.danhDuoc(B.nhanDang(['3s', '5c']), null).ok);
    ok('moTaKieu nói tiếng Việt', B.moTaKieu(nd('3s 3c 4s 4c 5s 5c')) === '3 đôi thông' && B.moTaKieu(nd('3s')) === '1 lá');
}

// ---------------------------------------------------------------- tới trắng
muc('TỚI TRẮNG');
{
    const tt = (s) => B.toiTrang(s.split(' '));
    ok('tứ quý heo', tt('2s 2c 2d 2h 3s 4c 5d 6h 7s 8c 9d 10h Js').ma === 'tu_quy_heo');
    ok('sảnh rồng 3->A', tt('3s 4c 5d 6h 7s 8c 9d 10h Js Qc Kd Ah 3c').ma === 'sanh_rong');
    // 6 đôi phải KHÔNG liên tiếp, không thì thành 5 đôi thông (mạnh hơn, xét trước)
    ok('6 đôi bất kỳ (rời rạc)', tt('3s 3c 5s 5c 7s 7c 9s 9c Js Jc Ks Kc 4d').ma === 'sau_doi', JSON.stringify(tt('3s 3c 5s 5c 7s 7c 9s 9c Js Jc Ks Kc 4d')));
    ok('6 đôi LIÊN TIẾP thì tính là 5 đôi thông (mạnh hơn)', tt('3s 3c 4s 4c 5s 5c 6s 6c 7s 7c 8s 8c 9d').ma === 'nam_doi_thong');
    ok('5 đôi thông', tt('3s 3c 4s 4c 5s 5c 6s 6c 7s 7c Kd Ah 9d').ma === 'nam_doi_thong');
    ok('13 lá cùng chất = đồng chất (mạnh nhất)', tt('3s 4s 5s 6s 7s 8s 9s 10s Js Qs Ks As 2s').ma === 'dong_chat');
    // ⚠️ bài 'thường' mà đủ 12 hạng 3->A là SẢNH RỒNG - phải dựng tay ít hạng mới thật là thường
    ok('bài thường KHÔNG tới trắng', tt('3s 3c 3d 4s 4c 4d 5s 5c 5d 6s 6c 6d 7s') === null, JSON.stringify(tt('3s 3c 3d 4s 4c 4d 5s 5c 5d 6s 6c 6d 7s')));
    ok('đủ 12 hạng 3->A dù rời rạc vẫn là sảnh rồng', tt('3s 4c 6d 8h 10s Qc Ad 2h 5s 7c 9d Jh Ks').ma === 'sanh_rong');
    ok('5 đôi KHÔNG thông và chỉ 5 đôi -> không tới trắng',
        tt('3s 3c 5s 5c 7s 7c 9s 9c Js Jc Kd Ah 4d') === null);
    ok('tay thiếu lá -> null', B.toiTrang(['3s', '3c']) === null);
    ok('mỗi kiểu tới trắng có thưởng > 0', B.TOI_TRANG.every(x => x.thuong > 0));
}

// ---------------------------------------------------------------- thối 2
muc('đếm heo còn trên tay (thối 2)');
{
    ok('2♠ 2♣ = 2 heo đen', B.demHeo(['2s', '2c', '3d']).den === 2 && B.demHeo(['2s', '2c', '3d']).do === 0);
    ok('2♦ 2♥ = 2 heo đỏ', B.demHeo(['2d', '2h']).do === 2);
    ok('tổng = đen + đỏ', B.demHeo(['2s', '2d', '2h']).tong === 3);
    ok('không có heo = 0', B.demHeo(['3s', 'Ah']).tong === 0);
    ok('tay rỗng = 0', B.demHeo([]).tong === 0 && B.demHeo(null).tong === 0);
}

console.log('\n🃏 BỘ BÀI + LUẬT TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
