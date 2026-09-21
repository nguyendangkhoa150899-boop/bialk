// Bộ kiểm PHẠM VI BIẾN — chạy: node TaiXiu/kiemtra/pham-vi-test.js
//
// Vì sao có file này: 21/09 mình thêm hằng số TX_KQ_S vào index.js rồi gọi thẳng
// trong webplay.js. Hai file là HAI MODULE khác nhau nên webplay không thấy nó ->
// mỗi lần gọi /api/state là văng ReferenceError -> bàn Tài Xỉu trắng trơn.
// node --check KHÔNG bắt được lỗi này (cú pháp vẫn đúng), nên phải soi bằng tay.
//
// Luật: mọi thứ index.js muốn cho webplay.js / panel.js dùng đều phải đi qua ctx.
'use strict';
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', '..', 'BotDoMin');
let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// Bỏ chú thích + chuỗi, để chữ tiếng Việt viết hoa trong lời ghi chú không bị bắt nhầm.
function bocVo(s) {
    return s
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

const SAN = new Set(['JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number',
    'Promise', 'Set', 'Map', 'RegExp', 'Error', 'URL', 'Infinity', 'NaN', 'Buffer',
    'TextEncoder', 'TextDecoder', 'AbortController']);

function soi(ten) {
    const src = fs.readFileSync(path.join(GOC, ten), 'utf8');
    // Chỉ soi phần MÁY CHỦ. Phần người chơi nằm trong chuỗi, chạy ở trình duyệt,
    // có bộ kiểm riêng (trang-test.js / dom-null-check.js).
    const cat = src.indexOf('const PAGE');
    const sv = bocVo(cat > 0 ? src.slice(0, cat) : src);

    const khai = new Set(['PAGE']);   // PAGE khai ngay dưới chỗ cắt, vẫn là của chính file này
    for (const m of sv.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) khai.add(m[1]);
    for (const m of sv.matchAll(/\{([^{}]*)\}\s*=/g))
        m[1].split(',').forEach(x => khai.add(x.trim().split(':').pop().trim()));

    const dung = new Set();
    for (const m of sv.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]{2,})\b/gm)) dung.add(m[2]);

    return [...dung].filter(x => !khai.has(x) && !SAN.has(x));
}

muc('hằng số viết hoa dùng ở phần máy chủ phải được khai ngay trong file đó');
for (const f of ['webplay.js', 'panel.js']) {
    const la = soi(f);
    ok(f + ': không gọi hằng số của file khác', la.length === 0,
        la.join(', ') + '  (đưa qua ctx đi, đừng gọi thẳng)');
}

muc('ctx có sẵn thứ bàn Sic Bo cần');
{
    const idx = fs.readFileSync(path.join(GOC, 'index.js'), 'utf8');
    const web = fs.readFileSync(path.join(GOC, 'webplay.js'), 'utf8');
    // mỗi ctx.<tên> mà webplay gọi thì index phải có khai trong khối ctx
    const goi = new Set();
    for (const m of web.matchAll(/ctx\.([A-Za-z_$][\w$]*)/g)) goi.add(m[1]);
    // index.js khai kiểu "tên: giá trị" HOẶC kiểu gọn "tên," (viết tắt của tên: tên)
    const thieu = [...goi].filter(k => !new RegExp('(^|[\\s,{])' + k + '\\s*[:,]', 'm').test(idx));
    ok('mọi ctx.<tên> webplay gọi đều có trong index.js', thieu.length === 0, thieu.join(', '));
    ok('ctx.txKqS có thật (số giây cuối tự mở kết quả)', /txKqS:\s*\(\)\s*=>/.test(idx));
    ok('ctx.txCua / ctx.txTran có thật', /txCua:/.test(idx) && /txTran:/.test(idx));
}

console.log('\n🔍 PHẠM VI BIẾN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
