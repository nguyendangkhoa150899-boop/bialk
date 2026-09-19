// Bộ kiểm cho TienLen/trang.html — cú pháp JS client, mọi id/onclick có thật, luật datHTML,
// và chạy thử hàm vẽ trên DOM giả với trạng thái thật từ van.js (bắt lỗi "vẽ là nổ").
// Chạy: node TienLen/kiemtra/trang-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { taoBan } = require('../van.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'trang.html'), 'utf8');
const JS = (HTML.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1];

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- cú pháp + cấu trúc
muc('cú pháp + cấu trúc trang');
{
    let loi = '';
    try { new vm.Script(JS, { filename: 'tienlen-client.js' }); } catch (e) { loi = e.message; }
    ok('JS client không lỗi cú pháp', !loi, loi);
    ok('có đủ 3 màn: chưa vào / phòng chờ / bàn',
        /id="manChuaVao"/.test(HTML) && /id="manCho"/.test(HTML) && /id="manBan"/.test(HTML));
    ok('gọi API đúng gốc /api/tienlen', /GOC_API = '\/api\/tienlen'/.test(JS));
    ok('dùng chung play_token của web cược', /localStorage\.getItem\('play_token'\)/.test(JS));
    ok('ảnh lá bài lấy theo mã lá', /src="bai\/'\+ma\+'\.webp"/.test(JS));
    ok('KHÔNG còn màu CSS gõ hỏng', !/#\d*[a-z]{4,}\s*;/i.test(HTML.slice(0, HTML.indexOf('</style>'))));
}

muc('CHỐNG ĐỨT: mọi chỗ vẽ lại phải qua datHTML');
{
    ok('có hàm datHTML chỉ đụng DOM khi nội dung đổi thật',
        /function datHTML\(el, html\)\{[\s\S]*?el\.__cu === html/.test(JS));
    const xau = [];
    JS.split('\n').forEach((d, i) => {
        if (!/\.innerHTML\s*=/.test(d)) return;
        if (/el\.innerHTML = html/.test(d)) return;          // chính hàm datHTML
        xau.push('dòng ' + (i + 1) + ': ' + d.trim().slice(0, 60));
    });
    ok('không chỗ nào gán thẳng innerHTML', xau.length === 0, xau.join(' | '));
}

muc('mọi id JS gọi đều có trong HTML · mọi onclick đều có hàm');
{
    const idHTML = new Set([...HTML.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
    const idJS = new Set([...JS.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
    const thieu = [...idJS].filter(x => !idHTML.has(x));
    ok('$(id) nào cũng có thật trong HTML', thieu.length === 0, thieu.join(', '));

    const ham = new Set([...JS.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]));
    const goiHTML = [...HTML.matchAll(/onclick="([A-Za-z0-9_]+)\(/g)].map(m => m[1]);
    const goiJS = [...JS.matchAll(/onclick=\\?"?([A-Za-z0-9_]+)\(/g)].map(m => m[1]);
    const thieuHam = [...new Set([...goiHTML, ...goiJS])].filter(x => !ham.has(x));
    ok('onclick nào cũng trỏ vào hàm có thật', thieuHam.length === 0, thieuHam.join(', '));
    for (const h of ['ngoi', 'roi', 'sanSang', 'danh', 'boLuot', 'doiXep'])
        ok('có hàm ' + h + '()', ham.has(h));
}

muc('🔀 nút xếp bài');
{
    ok('có 2 kiểu xếp: theo số / gom bộ', /KIEU_XEP/.test(JS) && /gom bộ/.test(JS) && /theo số/.test(JS));
    ok('nút XẾP BÀI gọi doiXep()', /onclick="doiXep\(\)"/.test(JS));
    ok('đổi kiểu xếp thì ép vẽ lại tay bài', /doiXep\(\)\{[\s\S]*?banTay'\)\.__cu\s*=\s*''/.test(JS));
}

// ---------------------------------------------------------------- chạy thật trên DOM giả
muc('chạy hàm vẽ với trạng thái THẬT từ van.js (DOM giả)');
{
    // --- DOM giả: chỉ trả phần tử cho id CÓ THẬT trong HTML, id lạ -> null (bắt lỗi $(id) sai tên)
    const idHTML = new Set([...HTML.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
    const els = new Map();
    const makeEl = (id) => ({
        id, style: {}, dataset: {}, hidden: false, textContent: '', innerHTML: '', className: '', value: '',
        clientWidth: 900, offsetWidth: 120,
        classList: { toggle() { }, add() { }, remove() { }, contains() { return false } },
        addEventListener() { }, getAttribute() { return '3s' }, setAttribute() { },
        querySelectorAll() { return [] }, querySelector() { return null }, appendChild() { }, remove() { },
    });
    const doc = {
        getElementById(id) { if (!idHTML.has(id)) return null; if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
        createElement: (t) => makeEl('<' + t + '>'), addEventListener() { },
        body: makeEl('body'), documentElement: makeEl('html'),
    };
    const ctx = {
        document: doc, console, localStorage: { getItem: () => 'tok', setItem() { } },
        setInterval: () => 0, setTimeout: () => 0, clearTimeout() { }, clearInterval() { },
        fetch: () => new Promise(() => { }),          // treo luôn, không cho dongBo() đụng mạng
        window: null, location: { pathname: '/tienlen/' },
    };
    ctx.window = ctx; ctx.window.innerWidth = 1200; ctx.window.innerHeight = 800;
    ctx.window.addEventListener = () => { };
    vm.createContext(ctx);
    let loiNap = '';
    try { vm.runInContext(JS, ctx, { filename: 'tienlen-client.js' }); } catch (e) { loiNap = e.stack.split('\n').slice(0, 3).join(' | '); }
    ok('nạp script không nổ', !loiNap, loiNap);

    // --- dựng trạng thái thật: 4 người, đang đánh
    const b = taoBan({ mucCuoc: 1000, cheDo: 'hang', toiTrangOn: false });
    ['A', 'B', 'C', 'D'].forEach((id, i) => b.themNguoi({ id, ten: 'Người ' + id, ghe: i }));
    b.vanMoi(0);
    const nen = {
        ok: true, toi: { id: 'A', ten: 'Người A', dogcoin: 100000, duocNgoi: true, viSaoKhong: null, admin: false },
        ghe: [{ id: 'A', ten: 'Người A', dogcoin: 100000 }, { id: 'B', ten: 'Người B', dogcoin: 100000 }, null, null],
        gheCuaToi: 0, sanSang: ['A'], toiSanSang: true, toiDa: 4, toiThieu: 2,
        cauHinh: { mucCuoc: 1000, cheDo: 'hang', giaLa: 1000, toiTrangOn: true, chatHeoOn: true, thoiHeoOn: true, baBichOn: true },
        cheDoTen: 'Nhất nhì ba tư', vonToiThieu: 30000, pheTram: 0.1, demVanKe: null,
    };

    const chay = (ten, S) => {
        ctx.S = S;
        let e = '';
        try { vm.runInContext('ve()', ctx); } catch (err) { e = err.stack.split('\n').slice(0, 3).join(' | '); }
        ok(ten, !e, e);
    };
    chay('vẽ màn CHƯA ĐĂNG NHẬP không nổ', null);
    chay('vẽ PHÒNG CHỜ không nổ', { ...nen, ban: null });
    chay('vẽ BÀN đang đánh không nổ', { ...nen, ban: b.xem('A') });
    chay('vẽ bàn dưới góc nhìn KHÁN GIẢ (không có toi.la) không nổ', { ...nen, ban: b.xemChung() });

    // ván chốt -> bảng kết quả
    const v = b._trong.van;
    v.tay.A = ['3s']; v.tay.B = ['4c']; v.tay.C = ['5d']; v.tay.D = ['6h'];
    v.bo = null; v.boCua = null; v.daBo.clear(); v.veNhat = []; v.batBuoc3Bich = false; v.luot = 'A';
    b.danh('A', ['3s'], 0); b.danh('B', ['4c'], 0); b.danh('C', ['5d'], 0);
    chay('vẽ BẢNG KẾT QUẢ cuối ván không nổ', { ...nen, ban: b.xem('A'), demVanKe: 5 });
    ok('bảng kết quả có hiện, đủ 4 dòng hạng',
        els.get('banKq') && els.get('banKq').hidden === false && (els.get('kqDs').innerHTML.match(/kqdong/g) || []).length === 4,
        els.get('kqDs') ? String((els.get('kqDs').innerHTML.match(/kqdong/g) || []).length) : 'không có');
    ok('tiêu đề nói ai về nhất', /về nhất/.test(els.get('kqTieu').textContent), els.get('kqTieu').textContent);

    // tới trắng
    const b2 = taoBan({ mucCuoc: 1000, toiTrangOn: true });
    ['A', 'B'].forEach((id, i) => b2.themNguoi({ id, ten: id, ghe: i }));
    b2.vanMoi(0);
    const v2 = b2._trong.van;
    v2.ketQua = { hang: ['A', 'B'], tien: { A: 7200, B: -8000 }, phe: { A: 800, B: 0 }, pheTong: 800, chiTiet: { A: { toiTrang: 8000 }, B: { toiTrang: -8000 } }, toiTrang: { id: 'A', ten: 'Tứ quý heo' }, chatHeo: [], lat: [] };
    chay('vẽ ván TỚI TRẮNG không nổ', { ...nen, ban: b2.xem('A') });
    ok('tiêu đề tới trắng nói rõ kiểu bài', /TỚI TRẮNG/.test(els.get('kqTieu').textContent) && /Tứ quý heo/.test(els.get('kqTieu').textContent),
        els.get('kqTieu').textContent);
}

console.log('\n🎬 TRANG TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
