// Bộ sinh ngẫu nhiên CHO BỘ KIỂM, không dùng cho tiền thật (tiền thật đi crypto).
//
// ⚠️ Bài học 25/09: bản đầu viết LCG kiểu C `seed = (seed*1103515245 + 12345) & 0x7fffffff`.
// Trong JS, seed tới 2^31 nhân 1103515245 ra cỡ 2^61, VƯỢT 2^53 là mốc số nguyên chính xác
// của kiểu double, nên mấy bit thấp thành rác và dãy sinh ra lệch hẳn. Hậu quả: mô phỏng
// 2 triệu ván báo nhà cái ăn 4,68% thay vì 8%, và đếm 2,94 ô sáng thay vì 2,60. Lõi tiền
// KHÔNG sai, chỉ cái thước bị cong.
//
// Mulberry32 dưới đây dùng Math.imul nên mọi phép nhân nằm gọn trong 32 bit.
'use strict';
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
module.exports = { mulberry32 };
