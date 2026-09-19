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
    ok('nút ⇄ tròn cạnh tay bài gọi doiXep()', /id="nutXep"[^>]*onclick="doiXep\(\)"/.test(HTML));
    ok('đổi kiểu xếp thì ép vẽ lại tay bài', /doiXep\(\)\{[\s\S]*?banTay'\)\.__cu\s*=\s*''/.test(JS));
}

// ---------------------------------------------------------------- chạy thật trên DOM giả
muc('chạy hàm vẽ với trạng thái THẬT từ van.js (DOM giả)');
{
    // --- DOM giả: chỉ trả phần tử cho id CÓ THẬT trong HTML, id lạ -> null (bắt lỗi $(id) sai tên)
    const idHTML = new Set([...HTML.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
    const els = new Map();
    const makeEl = (id) => ({
        // style phải có setProperty: trang gọi documentElement.style.setProperty('--co', ...)
        id, style: { setProperty() { }, removeProperty() { } }, dataset: {}, hidden: false,
        textContent: '', innerHTML: '', className: '', value: '',
        clientWidth: 900, offsetWidth: 120, children: [],
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

    // ⚠️ CA ĐÃ LÀM VỠ TRANG THẬT (19/09): có bộ TRÊN BÀN + tới lượt mình. Lúc đó client chạy
    // cMoiNuoc/cDanhDuoc trên bộ ĐÃ SERIALIZE của máy chủ — thiếu một trường là nổ. Ca "bàn đang
    // đánh" ở trên không bắt được vì bàn còn trống (chưa ai đánh lá nào).
    {
        const vv = b._trong.van;
        vv.tay.A = ['3s', '5c', '5d', '9h']; vv.tay.B = ['4c', '6d'];
        vv.tay.C = ['7s', '8c']; vv.tay.D = ['10d', 'Jh'];
        vv.bo = null; vv.boCua = null; vv.daBo.clear(); vv.veNhat = []; vv.batBuoc3Bich = false; vv.luot = 'B';
        b.danh('B', ['4c'], 0);                       // B đánh 1 lá -> tới lượt C... đẩy tiếp cho tới A
        while (b._trong.van.luot && b._trong.van.luot !== 'A') b.boLuot(b._trong.van.luot, 0);
        const sA = b.xem('A');
        ok('máy chủ gửi bộ trên bàn KÈM trường "cao" (client cần để so bài)',
            sA.van.bo && sA.van.bo.cao === '4c', JSON.stringify(sA.van.bo));
        chay('vẽ bàn khi CÓ BỘ TRÊN BÀN + tới lượt mình không nổ', { ...nen, ban: sA });
        ctx.S = { ...nen, ban: sA };
        vm.runInContext('CHON = ["5c","5d"];', ctx);
        chay('...và khi đang CHỌN lá (chạy máy luật client trên bộ của máy chủ)', { ...nen, ban: sA });
        vm.runInContext('CHON = [];', ctx);
        ok('lỗi VẼ TRANG không bị báo nhầm thành "chưa đăng nhập"',
            /\.catch\(function\(\)\{ S = null; \}\)/.test(JS) && /Lỗi vẽ trang/.test(JS));
    }

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

// ---------------------------------------------------------------- máy luật bản client
// Trang có BẢN SAO rút gọn của bai.js (cNhanDang / cDanhDuoc) để gợi ý và tô mờ lá. Bản sao là
// chỗ dễ lệch nhất trong cả tính năng: lệch mà không ai biết thì gợi ý sai, người chơi bấm ĐÁNH
// rồi ăn lỗi đỏ. Ở đây ĐỐI CHIẾU hai bên trên hàng ngàn ca ngẫu nhiên.
muc('⚖️ máy luật bản client PHẢI khớp bai.js');
{
    const B = require('../bai.js');
    const vm2 = require('vm');
    const ctx = { console };
    vm2.createContext(ctx);
    // chỉ nạp phần máy luật (tới trước theLa) — khỏi kéo theo DOM
    const phan = JS.slice(JS.indexOf('var CSO ='), JS.indexOf('function theLa('));
    let loi = '';
    try { vm2.runInContext(phan, ctx, { filename: 'client-luat.js' }); } catch (e) { loi = e.message; }
    ok('tách được phần máy luật và nạp sạch', !loi, loi);

    const rnd = (n) => Math.floor(Math.random() * n);
    const boc = (k) => { const b = B.BO52.slice(); const r = []; for (let i = 0; i < k; i++) r.push(b.splice(rnd(b.length), 1)[0]); return r; };
    ctx.__so = null;
    const cND = (la) => { ctx.__la = la; return vm2.runInContext('cNhanDang(__la)', ctx); };
    const cDD = (la, truoc) => { ctx.__la = la; ctx.__t = truoc; return vm2.runInContext('cDanhDuoc(cNhanDang(__la), __t?cNhanDang(__t):null)', ctx); };

    let lechND = 0, lechDD = 0, viDu = '';
    // ca ngẫu nhiên
    for (let i = 0; i < 1500; i++) {
        const la = boc(1 + rnd(8));
        const a = B.nhanDang(la), c = cND(la);
        const bangNhau = (!a && !c) || (a && c && a.kieu === c.kieu && a.dai === c.dai && a.cao === c.cao);
        if (!bangNhau) { lechND++; viDu = viDu || (la.join(' ') + ' -> server ' + JSON.stringify(a && a.kieu) + ' / client ' + JSON.stringify(c && c.kieu)); }
    }
    // ca dựng tay: mọi kiểu bộ + mọi kiểu chặt (ngẫu nhiên khó đụng tới tứ quý / đôi thông)
    const CA = [
        ['3s'], ['2h'], ['5s', '5h'], ['9s', '9c', '9d'], ['Ks', 'Kc', 'Kd', 'Kh'],
        ['3s', '4c', '5d'], ['10s', 'Jc', 'Qd', 'Kh', 'As'], ['Qs', 'Kc', 'Ad', '2h'],
        ['3s', '3c', '4s', '4c', '5s', '5c'], ['7s', '7c', '8s', '8c', '9s', '9c', '10s', '10c'],
        ['Ks', 'Kc', 'As', 'Ac', '2s', '2c'], ['3s', '3c', '4s', '4c'], ['3s', '5c'], ['2s', '2c', '2d'],
    ];
    for (const la of CA) {
        const a = B.nhanDang(la), c = cND(la);
        const bangNhau = (!a && !c) || (a && c && a.kieu === c.kieu && a.dai === c.dai && a.cao === c.cao);
        if (!bangNhau) { lechND++; viDu = viDu || (la.join(' ') + ' -> server ' + JSON.stringify(a && a.kieu) + ' / client ' + JSON.stringify(c && c.kieu)); }
    }
    ok('nhận dạng bộ: client khớp server trên 1.500 ca ngẫu nhiên + 14 ca dựng tay', lechND === 0, lechND + ' lệch · ' + viDu);

    // đánh đè / chặt
    let viDu2 = '';
    const DOI = [];
    for (const x of CA) for (const y of CA) DOI.push([x, y]);
    for (let i = 0; i < 500; i++) DOI.push([boc(1 + rnd(6)), boc(1 + rnd(6))]);
    for (const [x, y] of DOI) {
        const bx = B.nhanDang(x), by = B.nhanDang(y);
        if (!bx || !by) continue;
        if (x.some(l => y.includes(l))) continue;          // trùng lá thì bỏ, không phải ca thật
        const a = B.danhDuoc(bx, by), c = cDD(x, y);
        if (a.ok !== c.ok || !!a.chat !== !!c.chat) { lechDD++; viDu2 = viDu2 || (x.join(' ') + ' đè ' + y.join(' ') + ' -> server ' + JSON.stringify(a) + ' / client ' + JSON.stringify(c)); }
    }
    ok('đánh đè + chặt: client khớp server', lechDD === 0, lechDD + ' lệch · ' + viDu2);
}

muc('💡 gợi ý nước đánh (cMoiNuoc)');
{
    const B = require('../bai.js');
    const vm2 = require('vm');
    const ctx = { console };
    vm2.createContext(ctx);
    vm2.runInContext(JS.slice(JS.indexOf('var CSO ='), JS.indexOf('function theLa(')), ctx, { filename: 'client-luat.js' });
    const nuoc = (tay, truoc) => { ctx.__t = tay; ctx.__b = truoc; return vm2.runInContext('cMoiNuoc(__t, __b?cNhanDang(__b):null)', ctx); };

    const tay = ['3s', '3c', '4s', '4c', '5s', '5c', '9d', 'Js', 'Qc', 'Kd', 'Ah', '2s', '2h'];
    const mo = nuoc(tay, null);
    ok('mở lượt: gợi ý ra nhiều nước, nước đầu là lá nhỏ nhất', mo.length > 5 && mo[0].la.join() === '3s', mo.length + ' · ' + (mo[0] && mo[0].la.join()));
    ok('có tìm ra 3 đôi thông trong tay', mo.some(x => x.kieu === 'thong' && x.dai === 3), JSON.stringify(mo.filter(x => x.kieu === 'thong').map(x => x.ten)));
    ok('có tìm ra sảnh', mo.some(x => x.kieu === 'sanh'), JSON.stringify(mo.filter(x => x.kieu === 'sanh').slice(0, 2).map(x => x.ten)));

    const theo = nuoc(tay, ['6d']);
    ok('theo 1 lá 6♦: mọi gợi ý đều là 1 lá và đều LỚN HƠN', theo.length > 0 && theo.every(x => x.dai === 1 && B.tri(x.cao) > B.tri('6d')),
        JSON.stringify(theo.slice(0, 3).map(x => x.ten)));
    const chat = nuoc(tay, ['2d']);
    ok('theo heo lẻ: gợi ý có CHẶT bằng 3 đôi thông', chat.some(x => x.kieu === 'thong'), JSON.stringify(chat.map(x => x.ten)));
    ok('...và cả heo lớn hơn (2♥ > 2♦)', chat.some(x => x.la.join() === '2h'), JSON.stringify(chat.map(x => x.la.join())));
    const bi = nuoc(['3s', '4c'], ['Ah']);
    ok('không có nước nào thì trả mảng rỗng', bi.length === 0, JSON.stringify(bi));

    // mọi gợi ý phải được SERVER chấp nhận — đây mới là điều thật sự quan trọng
    let xau = 0;
    for (let i = 0; i < 200; i++) {
        const b = B.BO52.slice(); const t = [];
        for (let k = 0; k < 13; k++) t.push(b.splice(Math.floor(Math.random() * b.length), 1)[0]);
        const truoc = b.splice(0, 1 + Math.floor(Math.random() * 3));
        const bt = B.nhanDang(truoc);
        for (const g of nuoc(t, bt ? truoc : null)) {
            if (!B.danhDuoc(B.nhanDang(g.la), bt || null).ok) xau++;
        }
    }
    ok('200 tay ngẫu nhiên: MỌI nước gợi ý đều được server chấp nhận', xau === 0, String(xau));
}

muc('📣 CHỈ bài đặc biệt mới bắn tên to giữa bàn (chủ server chốt 19/09)');
{
    const B = require('../bai.js');
    const vm2 = require('vm');
    const ctx = { console };
    vm2.createContext(ctx);
    vm2.runInContext(JS.slice(JS.indexOf('var CSO ='), JS.indexOf('function theLa(')), ctx, { filename: 'client-luat.js' });
    vm2.runInContext(JS.slice(JS.indexOf('function dangKhoe('), JS.indexOf('/* 📣 Tên bộ bài bắn to')), ctx, { filename: 'client-khoe.js' });
    const khoe = (t) => { ctx.__b = B.nhanDang(t.split(' ')); return vm2.runInContext('dangKhoe(__b)', ctx); };
    // ĐÁNG khoe
    for (const [t, ten] of [['2s 2c', 'đôi heo'], ['2s 2c 2d', 'ba heo'], ['Ks Kc Kd Kh', 'tứ quý'],
    ['3s 3c 4s 4c 5s 5c', '3 đôi thông'], ['7s 7c 8s 8c 9s 9c 10s 10c', '4 đôi thông'],
    ['3s 4c 5d 6h 7s', 'sảnh 5 lá'], ['10s Jc Qd Kh As', 'sảnh tới A']])
        ok('BẮN tên: ' + ten, khoe(t) === true, t);
    // KHÔNG khoe (đánh suốt ván, bắn là loạn mắt)
    for (const [t, ten] of [['3s', '1 lá'], ['2h', 'heo LẺ'], ['5s 5h', 'đôi thường'],
    ['9s 9c 9d', 'ba thường'], ['3s 4c 5d', 'sảnh 3 lá'], ['3s 4c 5d 6h', 'sảnh 4 lá']])
        ok('im lặng: ' + ten, khoe(t) === false, t);
    ok('bộ rỗng / null không nổ', khoe.bind(null, '3s') && (() => { ctx.__b = null; return vm2.runInContext('dangKhoe(__b)', ctx) === false; })());
    ok('veBan chỉ gọi banhTen khi dangKhoe', /khoaBo !== BO_CU && dangKhoe\(v\.bo\)/.test(JS));
}

muc('hiệu ứng chọn bài + chỉ dẫn (thứ chủ server đặt)');
{
    ok('lá đang chọn nhô lên + viền vàng + dấu ✓', /\.tay \.the\.chon\{[\s\S]*?translateY\(-26px\)/.test(HTML) && /\.tay \.the\.chon::after\{content:'✓'/.test(HTML));
    // 19/09: phóng to lá chọn thì nó lấn che lá bên cạnh trong hàng xoè chồng -> chỉ nhô, không phóng
    ok('lá chọn KHÔNG phóng to', !/\.tay \.the\.chon\{[^}]*scale\(/.test(HTML));
    ok('dấu ✓ nằm góc TRÁI (phần luôn nhìn thấy khi xoè chồng)', /\.chon::after\{[^}]*left:-6px/.test(HTML));
    // 19/09: chủ server "cứ làm bài to x2 thôi, không cần kính lúp, dư nhiều nút quá"
    ok('cỡ bài CỐ ĐỊNH 2×, đã bỏ nút 🔍', /--co:2;/.test(HTML) && !/function coBai\(/.test(JS) && !/onclick="coBai/.test(JS));
    ok('tay bài xoè chồng + tự co cho vừa bề ngang', /function canhTay\(/.test(JS) && /W \* 0\.8/.test(JS));
    // "chọn con 8 bị che con 9": chỉ chừa chỗ ở nơi lá ĐÃ CHỌN đứng cạnh lá CHƯA CHỌN
    ok('chừa khoảng trống sau lá đã chọn để không che lá kế',
        /HO_CHON/.test(JS) && /contains\('chon'\) && !k\[i\]\.classList\.contains\('chon'\)/.test(JS));
    ok('...và khoảng trống đó được tính vào phép chia nên không tràn hàng', /g \* HO_CHON/.test(JS));
    ok('lá không đánh được thì làm mờ (.cam)', /\.tay \.the\.cam\{filter/.test(HTML) && /' cam'/.test(JS));
    ok('có dòng gợi ý #banGoi báo đánh được / không', /id="banGoi"/.test(HTML) && /#banGoi\.duoc/.test(HTML) && /#banGoi\.khong/.test(HTML));
    ok('có nút 💡 GỢI Ý', /💡 GỢI Ý/.test(JS));
    // Theo ảnh mẫu Ba Bích: 2 nút TO "Bỏ lượt" (đỏ) / "Đánh" (xanh) + đồng hồ tròn, hiện suốt lượt mình
    ok('🎯 hàng nút TO Bỏ lượt / Đánh', /id="banDanh"/.test(HTML) && JS.includes('nutTo nutBo') && JS.includes('nutTo nutDanh')
        && /\.nutBo\{background[\s\S]*?#d83a2c/.test(HTML) && /\.nutDanh\{background[\s\S]*?#1f7fc4/.test(HTML));
    ok('nút Đánh chỉ SÁNG khi mớ lá đang chọn hợp lệ', JS.includes('danhDuoc = cua && !!kq && kq.ok') && JS.includes("(danhDuoc?'':' disabled')"));
    ok('hàng nút nằm TRÊN tay bài (ngón tay với tới)', HTML.indexOf('id="banDanh"') < HTML.indexOf('id="banTay"'));
    ok('có đồng hồ tròn đếm ngược, ≤5 giây thì đỏ', /class="dongHo/.test(JS) && /\.dongHo\.gap\{/.test(HTML));
    ok('dòng dưới nói rõ bộ gì + vì sao chưa đánh được', /id="banBoChon"/.test(HTML) && /💥 CHẶT được!/.test(JS) && /chưa tới lượt bạn/.test(JS));
    ok('📣 tên bộ bài bắn TO giữa bàn khi có người đánh', /id="banTen"/.test(HTML) && /function banhTen\(/.test(JS) && /@keyframes tenBo\{/.test(HTML));
    ok('...hàng chặt (tứ quý / đôi thông) đổi màu cam', /bo\.kieu === 'tu' \|\| bo\.kieu === 'thong'/.test(JS) && /#banTen\.bom\{/.test(HTML));
    // 19/09: bàn giữ CẢ DIỄN BIẾN vòng đang đánh — các nước xếp đè, nước cũ mờ, nước mới sáng
    ok('bài trên bàn XẾP ĐÈ lên nhau (không xoè quạt nữa)', /function chongLen\(/.test(JS) && !/function xoeQuat\(/.test(JS));
    ok('vẽ MỌI nước của vòng (v.chongBai), không chỉ bộ mới nhất', /v\.chongBai && v\.chongBai\.length/.test(JS));
    ok('nước cũ vẽ mờ, nước mới vẽ sáng', /gi < moiNhat/.test(JS) && /\.ola\.cu \.the\{filter/.test(HTML));
    // 19/09: "đè bài nhau thì phải đè random chứ đừng xếp hàng"
    ok('bài trên bàn nằm NGẪU NHIÊN (xoay + lệch)', /function laBan\(/.test(JS) && /--r:' \+ r \+ 'deg/.test(JS) && /rotate\(var\(--r/.test(HTML));
    ok('...nhưng ổn định theo mã lá, không nhảy mỗi giây', /function bam\(ma, tron\)/.test(JS) && !/Math\.random\(\)/.test(JS));
    // 20/09: "đè nhau xáo trộn chứ không phải đè qua 1 bên phải"
    ok('đống bài xếp quanh TÂM bàn, không xếp thành hàng',
        /\.bomay\{position:relative/.test(HTML) && /\.ola\{position:absolute;left:50%;top:50%/.test(HTML));
    ok('chongLen() chỉ còn xếp tầng, không đẩy lề nữa',
        /function chongLen\(\)\{[\s\S]{0,300}?zIndex = i;/.test(JS) &&
        !JS.slice(JS.indexOf('function chongLen'), JS.indexOf('function chongLen') + 300).includes('marginLeft'));
    // 20/09 chủ server nói rõ: TRONG một nước thì thẳng hàng (lệch nhẹ thôi); LỘN XỘN là giữa các nước
    ok('trong một nước: xếp thẳng hàng, khoảng cách đều', /giua = \(j - \(soLaNuoc - 1\) \/ 2\) \* 0\.40/.test(JS));
    ok('cả nước nghiêng theo một góc riêng (±18°)', /rNuoc = laDau \? \(\(bam\(laDau, 13\) % 37\) - 18\)/.test(JS));
    ok('...và hàng bài nằm nghiêng THEO góc đó (không gãy)', /nghieng = giua \* Math\.tan\(rNuoc/.test(JS));
    ok('giữa các nước: xô lệch MẠNH (±0.35 lá) -> đè lộn xộn', /bam\(laDau, 71\) % 71\) - 35/.test(JS));
    ok('từng lá chỉ rung RẤT nhẹ (±0.03 lá, ±4°) — không phá hàng',
        /bam\(ma, 29\) % 7\) - 3/.test(JS) && /rLa = \(bam\(ma, 11\) % 9\) - 4/.test(JS));
    // trang này từng THIẾU nhánh điện thoại nằm ngang (nhầm với trang Poker) -> bàn co còn ~145px
    ok('có nhánh CSS cho điện thoại NẰM NGANG', /@media\(orientation:landscape\) and \(max-height:560px\)\{/.test(HTML));
    ok('...ở khổ đó bàn ăn trọn chiều cao còn lại, bài nhỏ lại', /aspect-ratio:auto;width:100%;height:calc\(100vh - 232px\)/.test(HTML) && /--co:1\.25/.test(HTML));
    ok('lệch tính theo var(--lb) nên đổi cỡ bài là cả đống co theo', /calc\(var\(--lb\) \* ' \+ mx/.test(JS));
    // "đánh bài có animation lá bài từ chỗ người chơi bay lên"
    ok('✈️ lá bay từ chỗ người đánh vào giữa bàn', /\.ola\.bay\{animation:bayVao/.test(HTML) && /@keyframes bayVao\{/.test(HTML) && /GHE_VT\[tuAi\]/.test(JS));
    ok('...ghế phải vẽ TRƯỚC để biết toạ độ', JS.indexOf('veGhe(b, v);') < JS.indexOf('var nuocBan ='));
    // "đếm ngược 5 4 3 2 1 rồi chia ván mới"
    ok('⏱ đếm ngược 5·4·3·2·1 giữa bàn', /id="demNguoc"/.test(HTML) && /con > 0 && con <= 5/.test(JS));
    ok('bỏ lượt hiện PASS to rõ', /class="tt pass"/.test(JS) && /.tt.pass{/.test(HTML));
    ok('ghế hiện VỪA ĐÁNH gì, có dấu 💥 khi chặt', /vl\.viec==='danh'/.test(JS) && /💥 CHẶT/.test(JS));
    // 19/09 chủ server: "che bài người khác lại cho không được biết số lá bài của nhau nữa"
    ok('ghế người khác KHÔNG hiện số lá — chỉ xấp úp cố định', /p\.conBai\) \? '<i><\/i><i><\/i><i><\/i>'/.test(JS) && !/dem-la/.test(JS));
    ok('số lá chỉ hiện cho CHÍNH MÌNH', /laToi && p\.soLa!=null \? p\.soLa\+' lá · ' : ''/.test(JS));
    ok('KHÔNG còn nhãn "sắp thắng" / badge đếm lá cũ', !/sapthang/.test(JS) && !/dem-la/.test(HTML));
    ok('đếm ngược số giây trên ghế đang tới lượt, ≤5 giây thì đỏ nhấp nháy', /class="dem'\+\(conGiay<=5\?' gap':''\)/.test(JS));
    ok('tới lượt mình thì sáng viền bàn + kêu 1 lần', /classList\.toggle\('toiluot'/.test(JS) && /LUOT_KEU/.test(JS));
}

console.log('\n🎬 TRANG TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
