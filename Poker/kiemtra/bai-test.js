// Bộ kiểm cho Poker/bai.js, chạy: node Poker/kiemtra/bai-test.js
//
// Để TRONG repo chứ không để ở thư mục tạm: thư mục tạm còn lẫn cả script VÁ mang
// tên *test*.js, chạy nhầm là hỏng file nguồn (đã xảy ra một lần bên BotDoMin).
// Bài kiểm nằm cạnh code thì ai kéo repo về cũng chạy lại được.
'use strict';
const B = require('../bai.js');

let P = 0, F = 0;
const ok = (ten, dieu, them) => {
    if (dieu) { P++; console.log('  OK   ' + ten); }
    else { F++; console.log('  HỎNG ' + ten + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- bộ bài
muc('bộ bài');
ok('đúng 52 lá', B.BO52.length === 52, String(B.BO52.length));
ok('không lá nào trùng', new Set(B.BO52).size === 52);
ok('đủ 13 số × 4 chất', B.SO.length === 13 && B.CHAT.length === 4);
{
    // mọi mã phải đọc được, và phải có ảnh đúng tên trong Poker/bai/
    const fs = require('fs'), path = require('path');
    const thuMuc = path.join(__dirname, '..', 'bai');
    let hong = [], thieuAnh = [];
    for (const ma of B.BO52) {
        try { B.doc(ma); } catch (e) { hong.push(ma); }
        if (!fs.existsSync(path.join(thuMuc, ma + '.webp'))) thieuAnh.push(ma);
    }
    ok('mã lá nào cũng đọc được', hong.length === 0, hong.join(','));
    ok('mã lá nào cũng có ảnh .webp đúng tên', thieuAnh.length === 0, thieuAnh.join(','));
    ok('có ảnh lưng bài', fs.existsSync(path.join(thuMuc, 'back.webp')));
}
ok("đọc '10h' ra 10 cơ (không cắt nhầm số 2 ký tự)",
    B.doc('10h').so === '10' && B.doc('10h').chat === 'h' && B.doc('10h').diem === 10,
    JSON.stringify(B.doc('10h')));
ok("át mạnh nhất (14), 2 yếu nhất", B.doc('As').diem === 14 && B.doc('2c').diem === 2);
ok("viết đẹp 'Kh' -> 'K♥'", B.ten1('Kh') === 'K♥', B.ten1('Kh'));
{
    let loi = false;
    try { B.doc('Xz'); } catch (e) { loi = true; }
    ok('mã bậy thì báo lỗi chứ không nuốt', loi);
}

// ---------------------------------------------------------------- xáo bài
muc('xáo bài');
{
    const b = B.boMoi();
    ok('xáo xong vẫn đủ 52 lá, không mất không nhân đôi',
        b.length === 52 && new Set(b).size === 52);
    ok('không sửa vào bộ gốc', B.BO52.length === 52 && B.BO52[0] === '2s', B.BO52[0]);
    let khac = 0;
    for (let i = 0; i < 20; i++) if (B.boMoi().join() !== B.boMoi().join()) khac++;
    ok('hai lần xáo ra thứ tự khác nhau', khac >= 19, khac + '/20');
}
{
    // phân bố: lá 'As' phải rơi đều khắp 52 vị trí. Fisher-Yates sai (bốc trong
    // TOÀN mảng thay vì phần chưa xét) sẽ lệch thấy rõ ở phép đo này.
    const N = 26000, dem = new Array(52).fill(0);
    for (let i = 0; i < N; i++) dem[B.boMoi().indexOf('As')]++;
    const kyVong = N / 52;                       // 500
    const lech = Math.max(...dem.map(x => Math.abs(x - kyVong) / kyVong));
    ok('lá A♠ rơi đều khắp 52 vị trí (lệch < 20%)', lech < 0.20,
        'lệch lớn nhất ' + (lech * 100).toFixed(1) + '%');
}
{
    const bo = B.boMoi();
    const tay = B.chia(bo, 2);
    ok('chia 2 lá thì bộ còn 50', tay.length === 2 && bo.length === 50, tay.length + '/' + bo.length);
    ok('lá đã chia không còn trong bộ', !bo.includes(tay[0]) && !bo.includes(tay[1]));
    let loi = false;
    try { B.chia(bo, 999); } catch (e) { loi = true; }
    ok('đòi nhiều hơn số lá còn lại thì báo lỗi', loi);
}

// ---------------------------------------------------------------- nhận đúng hạng
muc('nhận đúng 9 hạng bài');
const H = (la) => B.chamNam(la).hang;
ok('9 Thùng phá sảnh', H(['10s', 'Js', 'Qs', 'Ks', 'As']) === 9);
ok('8 Tứ quý', H(['9s', '9h', '9d', '9c', '2s']) === 8);
ok('7 Cù lũ', H(['Ks', 'Kh', 'Kd', '7c', '7s']) === 7);
ok('6 Thùng', H(['2h', '5h', '9h', 'Jh', 'Kh']) === 6);
ok('5 Sảnh', H(['5s', '6h', '7d', '8c', '9s']) === 5);
ok('4 Sám cô', H(['Qs', 'Qh', 'Qd', '8c', '3s']) === 4);
ok('3 Hai đôi', H(['As', 'Ah', '6d', '6c', 'Ks']) === 3);
ok('2 Một đôi', H(['3s', '3h', 'Kd', '8c', '2s']) === 2);
ok('1 Mậu thầu', H(['As', 'Jh', '9d', '5c', '3s']) === 1);

muc('mấy cái bẫy của sảnh');
ok('sảnh nhỏ A-2-3-4-5 vẫn là sảnh', H(['As', '2h', '3d', '4c', '5s']) === 5);
ok('...và tính lá cao nhất là 5, KHÔNG phải A',
    B.chamNam(['As', '2h', '3d', '4c', '5s']).diem[1] === 5,
    String(B.chamNam(['As', '2h', '3d', '4c', '5s']).diem[1]));
ok('sảnh nhỏ THUA sảnh đến 6',
    B.soDiem(B.chamNam(['As', '2h', '3d', '4c', '5s']).diem,
             B.chamNam(['2s', '3h', '4d', '5c', '6s']).diem) < 0);
ok('K-A-2-3-4 KHÔNG phải sảnh (át không nối vòng)', H(['Ks', 'Ah', '2d', '3c', '4s']) === 1);
ok('Q-K-A-2-3 KHÔNG phải sảnh', H(['Qs', 'Kh', 'Ad', '2c', '3s']) === 1);
ok('sảnh nhỏ cùng chất = thùng phá sảnh', H(['As', '2s', '3s', '4s', '5s']) === 9);

muc('thứ tự mạnh yếu giữa các hạng');
const manhHon = (a, b) => B.soDiem(B.chamNam(a).diem, B.chamNam(b).diem) > 0;
ok('thùng phá sảnh > tứ quý', manhHon(['2s', '3s', '4s', '5s', '6s'], ['As', 'Ah', 'Ad', 'Ac', 'Ks']));
ok('tứ quý > cù lũ', manhHon(['2s', '2h', '2d', '2c', '3s'], ['As', 'Ah', 'Ad', 'Ks', 'Kh']));
ok('cù lũ > thùng', manhHon(['2s', '2h', '2d', '3c', '3s'], ['As', 'Qs', '9s', '7s', '5s']));
ok('thùng > sảnh', manhHon(['2s', '5s', '8s', '9s', 'Js'], ['9s', '10h', 'Jd', 'Qc', 'Ks']));
ok('sảnh > sám cô', manhHon(['2s', '3h', '4d', '5c', '6s'], ['As', 'Ah', 'Ad', 'Ks', 'Qh']));
ok('sám cô > hai đôi', manhHon(['2s', '2h', '2d', '3c', '4s'], ['As', 'Ah', 'Ks', 'Kh', 'Qd']));
ok('hai đôi > một đôi', manhHon(['2s', '2h', '3d', '3c', '4s'], ['As', 'Ah', 'Ks', 'Qh', 'Jd']));
ok('một đôi > mậu thầu', manhHon(['2s', '2h', '5d', '8c', 'Js'], ['As', 'Kh', 'Qd', 'Jc', '9s']));

muc('so kèo trong CÙNG một hạng (lá kèm)');
ok('đôi A kèm K thắng đôi A kèm Q',
    manhHon(['As', 'Ah', 'Ks', '8d', '5c'], ['Ad', 'Ac', 'Qs', '8h', '5s']));
ok('đôi A thắng đôi K', manhHon(['As', 'Ah', '9s', '5d', '2c'], ['Ks', 'Kh', 'Qd', 'Jc', '9h']));
ok('hai đôi so đôi LỚN trước',
    manhHon(['Ks', 'Kh', '2d', '2c', '5s'], ['Qs', 'Qh', 'Jd', 'Jc', 'As']));
ok('hai đôi bằng nhau thì so lá kèm',
    manhHon(['Ks', 'Kh', '2d', '2c', 'As'], ['Kd', 'Kc', '2h', '2s', 'Qh']));
// cù lũ 3 trên 5  THẮNG  cù lũ 2 trên A: so bộ BA trước, đôi chỉ tính sau
ok('cù lũ so bộ BA trước, không so đôi',
    manhHon(['3s', '3h', '3d', '5c', '5s'], ['2h', '2d', '2c', 'As', 'Ah']));
ok('thùng so từ lá cao nhất xuống',
    manhHon(['As', '5s', '4s', '3s', '2s'], ['Ks', 'Qs', 'Js', '9s', '8s']));
ok('tứ quý bằng nhau thì so lá kèm',
    manhHon(['9s', '9h', '9d', '9c', 'As'], ['9s', '9h', '9d', '9c', 'Ks']));

muc('bằng điểm = chia hũ (chỗ hay quên nhất)');
ok('cùng sảnh khác chất -> BẰNG',
    B.soDiem(B.chamNam(['5s', '6h', '7d', '8c', '9s']).diem,
             B.chamNam(['5h', '6d', '7c', '8s', '9h']).diem) === 0);
ok('cùng mậu thầu y hệt -> BẰNG',
    B.soDiem(B.chamNam(['As', 'Jh', '9d', '5c', '3s']).diem,
             B.chamNam(['Ah', 'Jd', '9c', '5s', '3h']).diem) === 0);

// ---------------------------------------------------------------- 7 lá chọn 5
muc('7 lá tự chọn 5 lá mạnh nhất');
{
    // bài riêng A♠K♠ + bài chung Q♠J♠10♠ 2h 3d -> phải thấy thùng phá sảnh
    const k = B.chamBai(['As', 'Ks', 'Qs', 'Js', '10s', '2h', '3d']);
    ok('thấy được thùng phá sảnh giấu trong 7 lá', k.hang === 9, k.ten);
    ok('chọn đúng 5 lá cấu thành', k.nam.length === 5 &&
        ['As', 'Ks', 'Qs', 'Js', '10s'].every(x => k.nam.includes(x)), k.nam.join(','));
    ok('gọi tên đúng', k.ten === 'Thùng phá sảnh đến A (lớn nhất)', k.ten);
}
{
    // bẫy: có 6 lá cùng chất -> phải lấy 5 lá cao nhất của chất đó
    const k = B.chamBai(['2h', '5h', '9h', 'Jh', 'Kh', 'Ah', '7s']);
    ok('6 lá cùng chất -> lấy 5 lá cao nhất', k.hang === 6 && !k.nam.includes('2h'), k.nam.join(','));
}
{
    // bẫy: 2 bộ ba -> cù lũ phải lấy bộ ba LỚN làm nòng
    const k = B.chamBai(['9s', '9h', '9d', '4s', '4h', '4d', 'Kc']);
    ok('hai bộ ba -> cù lũ 9 trên 4', k.hang === 7 && k.ten === 'Cù lũ 9 trên 4', k.ten);
}
{
    // bẫy: bài chung ăn trọn, bài riêng vô dụng
    const k = B.chamBai(['2c', '3d', '10s', 'Js', 'Qs', 'Ks', 'As']);
    ok('bài chung ăn trọn, bỏ luôn 2 lá riêng', k.hang === 9 &&
        !k.nam.includes('2c') && !k.nam.includes('3d'), k.nam.join(','));
}
ok('chấm được 5 lá và 6 lá, không chỉ 7',
    B.chamBai(['As', 'Ks', 'Qs', 'Js', '10s']).hang === 9 &&
    B.chamBai(['As', 'Ks', 'Qs', 'Js', '10s', '2h']).hang === 9);
{
    let loi1 = false, loi2 = false;
    try { B.chamBai(['As', 'Ks', 'Qs', 'Js']); } catch (e) { loi1 = true; }
    try { B.chamBai(['As', 'As', 'Ks', 'Qs', 'Js']); } catch (e) { loi2 = true; }
    ok('ít hơn 5 lá thì báo lỗi', loi1);
    ok('có lá TRÙNG thì báo lỗi (bắt bug chia bài lặp)', loi2);
}

// ---------------------------------------------------------------- xếp hạng bàn
muc('xếp hạng cả bàn lúc lật bài');
{
    const chung = ['10s', 'Js', 'Qs', '4d', '7c'];
    const nhom = B.xepHang([
        { id: 'Khoa', la: ['Ks', 'As', ...chung] },   // A♠K♠Q♠J♠10♠ = thùng phá sảnh
        { id: 'Long', la: ['10h', '10d', ...chung] }, // ba con 10 = sám cô
        { id: 'Vinh', la: ['9s', '2s', ...chung] },   // 5 lá bích = thùng
    ]);
    ok('trả về nhóm, nhóm đầu là người thắng', Array.isArray(nhom) && Array.isArray(nhom[0]));
    ok('tổng số người không đổi', nhom.flat().length === 3);
    ok('nhất là Khoa, thùng phá sảnh',
        nhom[0][0].id === 'Khoa' && nhom[0][0].cham.hang === 9,
        nhom[0][0].id + ', ' + nhom[0][0].cham.ten);
    ok('nhì là Vinh, thùng ăn trên sám cô',
        nhom[1][0].id === 'Vinh' && nhom[1][0].cham.hang === 6,
        nhom[1][0].id + ', ' + nhom[1][0].cham.ten);
    ok('bét là Long, sám cô',
        nhom[2][0].id === 'Long' && nhom[2][0].cham.hang === 4,
        nhom[2][0].id + ', ' + nhom[2][0].cham.ten);
    // kiểm thứ tự giảm dần thật sự
    let giam = true;
    for (let i = 1; i < nhom.length; i++)
        if (B.soDiem(nhom[i - 1][0].cham.diem, nhom[i][0].cham.diem) <= 0) giam = false;
    ok('các nhóm xếp mạnh -> yếu', giam);
}
{
    // hai người BẰNG nhau phải nằm CHUNG một nhóm -> chia hũ
    const chung = ['As', 'Ks', 'Qd', 'Jc', '10h'];   // bài chung đã là sảnh A
    const nhom = B.xepHang([
        { id: 'A', la: ['2c', '3d', ...chung] },
        { id: 'B', la: ['4h', '5s', ...chung] },
    ]);
    ok('cả hai ăn bài chung -> CÙNG một nhóm (chia hũ)',
        nhom.length === 1 && nhom[0].length === 2,
        'số nhóm ' + nhom.length);
}

// ---------------------------------------------------------------- tự chứng minh
muc('tự chứng minh bài kiểm bắt được lỗi');
{
    // cố tình so sai (bỏ qua lá kèm) -> phép so phải KHÁC kết quả đúng
    const soSai = (a, b) => (a[0] === b[0] ? 0 : (a[0] > b[0] ? 1 : -1));
    const x = B.chamNam(['As', 'Ah', 'Ks', '8d', '5c']).diem;
    const y = B.chamNam(['Ad', 'Ac', 'Qs', '8h', '5s']).diem;
    ok('bản so SAI cho ra hoà, bản đúng cho ra thắng -> bài kiểm phân biệt được',
        soSai(x, y) === 0 && B.soDiem(x, y) > 0);
}
{
    // dò 3000 ván thật: không ván nào được có lá trùng hay chấm lỗi
    let loi = 0;
    for (let i = 0; i < 3000; i++) {
        const bo = B.boMoi();
        const chung = B.chia(bo, 5);
        for (let p = 0; p < 4; p++) {
            const tay = B.chia(bo, 2);
            try { B.chamBai([...tay, ...chung]); } catch (e) { loi++; }
        }
    }
    ok('3.000 ván × 4 người: không ván nào lỗi/trùng lá', loi === 0, loi + ' lỗi');
}

console.log('\n🃏 BỘ BÀI + CHẤM BÀI: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
