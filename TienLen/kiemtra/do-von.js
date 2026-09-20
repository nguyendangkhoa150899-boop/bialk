// do-von.js — THUA ĐẬM NHẤT MỘT VÁN LÀ BAO NHIÊU CƯỢC? Quét CẠN mọi hình dáng tay 13 lá.
// Chạy: node TienLen/kiemtra/do-von.js
// Đây là nguồn của hai con số trong VON_HE_SO (web.js). Chỉnh bảng giá xong thì CHẠY LẠI
// file này rồi mới chỉnh hệ số, đừng đoán.
// (không phải lấy mẫu ngẫu nhiên — phải là trần tuyệt đối thì mới dám hạ vốn tối thiểu)
const B = require('../bai.js');
const V = require('../van.js');
const V0 = require('../web.js');

const SO = B.SO;                       // ['2','3',...,'A'] theo bai.js
const CHAT_HEO = ['d', 'h', 's', 'c']; // heo ĐỎ trước (đắt hơn) rồi mới tới đen
const CHAT = ['s', 'c', 'd', 'h'];

function tayTu(dem) {
    const la = [];
    for (let i = 0; i < SO.length; i++) {
        const so = SO[i], n = dem[i];
        const ch = (so === '2') ? CHAT_HEO : CHAT;
        for (let k = 0; k < n; k++) la.push(so + ch[k]);
    }
    return la;
}
function giaNhot(la, cheDo) {
    const d = B.doTay(la);
    const bang = V.BANG_CUOC[cheDo];
    let t = 0;
    // ⚠️ CHỈ cộng d.muc. doTay() trả heo ở CẢ HAI chỗ (trong muc và ở bộ đếm heo riêng);
    // van.js chỉ đọc .muc nên cộng thêm d.heo là đếm heo HAI LẦN, ra số vốn to gấp rưỡi.
    for (const m of d.muc) t += bang[m] || 0;
    return t;
}

let best = { hang: { v: -1 }, anhet: { v: -1 } };
const dem = new Array(SO.length).fill(0);
let soCa = 0;
(function dfs(i, con) {
    if (con === 0) {
        soCa++;
        const la = tayTu(dem);
        for (const cd of ['hang', 'anhet']) {
            const v = giaNhot(la, cd);
            if (v > best[cd].v) best[cd] = { v, la: la.slice() };
        }
        return;
    }
    if (i >= SO.length) return;
    const conLai = (SO.length - i) * 4;
    if (conLai < con) return;
    for (let n = Math.min(4, con); n >= 0; n--) { dem[i] = n; dfs(i + 1, con - n); }
    dem[i] = 0;
})(0, 13);

console.log('Quét cạn ' + soCa.toLocaleString('vi-VN') + ' hình dáng tay 13 lá\n');
const CONG = V.CONG_NHAN, VT = V.BANG_VI_TRI;
for (const cd of ['hang', 'anhet']) {
    const nhot = best[cd].v;
    const betNhat = Math.min(...[2, 3, 4].map(n => VT[n][VT[n].length - 1]));   // số âm nhất
    const nenBet = cd === 'hang' ? Math.abs(betNhat) : 13;      // đếm lá: 13 lá còn trên tay = 13 cược
    const tong = (nenBet + nhot) * CONG;                        // CÓNG thì nhân đôi tất
    console.log((cd === 'hang' ? 'TRUYỀN THỐNG' : 'ĐẾM LÁ     ') +
        '  nhốt tối đa ' + String(nhot).padStart(5) + ' cược' +
        ' · nền bét ' + String(nenBet).padStart(2) +
        ' · CÓNG ×' + CONG + '  =>  THUA TỐI ĐA ' + String(tong).padStart(6) + ' cược');
    console.log('            hệ số đang dùng: ' + V0.VON_HE_SO[cd] + '×  ' +
        (V0.VON_HE_SO[cd] >= tong ? '(dư ' + (V0.VON_HE_SO[cd] - tong).toFixed(0) + ')' : '❌ THIẾU'));
    console.log('            tay tệ nhất: ' + best[cd].la.join(' ') + '\n');
}
