// Bài kiểm NẶNG: duyệt HẾT 2.598.960 bộ 5 lá có thể rút từ 52 lá, đếm mỗi hạng ra
// bao nhiêu bộ, rồi đối chiếu với bảng xác suất poker chuẩn (số đã biết từ lâu, tra
// đâu cũng ra). Khớp từng con số = hàm chấm bài không thể sai ở bất cứ trường hợp nào.
//
// Chạy:  node Poker/kiemtra/bai-daydu-test.js      (mất khoảng nửa phút)
// Bài này KHÔNG cần chạy mỗi lần sửa, chỉ chạy khi đụng vào chamNam/sanh trong bai.js.
'use strict';
const B = require('../bai.js');

// Số bộ 5 lá cho từng hạng, trên tổng 2.598.960. Đây là hằng số toán học, không phải
// số mình tự đo, nếu code sai thì số đếm được sẽ lệch.
const CHUAN = {
    9: 40,        // thùng phá sảnh (gồm cả 4 bộ sảnh rồng A-K-Q-J-10)
    8: 624,       // tứ quý
    7: 3744,      // cù lũ
    6: 5108,      // thùng (không tính thùng phá sảnh)
    5: 10200,     // sảnh (không tính thùng phá sảnh)
    4: 54912,     // sám cô
    3: 123552,    // hai đôi
    2: 1098240,   // một đôi
    1: 1302540,   // mậu thầu
};
const TONG = 2598960;

const bo = B.BO52;
const dem = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
let n = 0;
const bd = Date.now();

for (let a = 0; a < 48; a++)
    for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
            for (let d = c + 1; d < 51; d++)
                for (let e = d + 1; e < 52; e++) {
                    dem[B.chamNam([bo[a], bo[b], bo[c], bo[d], bo[e]]).hang]++;
                    n++;
                }

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};

console.log('Đã duyệt ' + n.toLocaleString('vi-VN') + ' bộ trong ' +
    ((Date.now() - bd) / 1000).toFixed(1) + ' giây\n');
ok('tổng số bộ đúng bằng C(52,5)', n === TONG, n + ' ≠ ' + TONG);

for (const h of [9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    const co = dem[h], can = CHUAN[h];
    ok(h + ' ' + B.HANG[h].padEnd(16) + can.toLocaleString('vi-VN').padStart(9) + ' bộ',
        co === can, 'đếm được ' + co.toLocaleString('vi-VN'));
}
ok('cộng lại đủ tổng', Object.values(dem).reduce((x, y) => x + y, 0) === TONG);

console.log('\n🧮 DUYỆT ĐẦY ĐỦ: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
