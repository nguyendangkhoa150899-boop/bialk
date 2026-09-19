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

muc('hiệu ứng chọn bài + chỉ dẫn (thứ chủ server đặt)');
{
    ok('lá đang chọn nhô lên + viền vàng + dấu ✓', /\.tay \.the\.chon\{[\s\S]*?translateY\(-26px\)/.test(HTML) && /\.tay \.the\.chon::after\{content:'✓'/.test(HTML));
    ok('🔍 chỉnh cỡ bài được, nhớ trong localStorage', /function coBai\(/.test(JS) && /tl_co/.test(JS) && /--co:2/.test(HTML));
    ok('tay bài xoè chồng + tự co cho vừa bề ngang', /function canhTay\(/.test(JS) && /W \* 0\.72/.test(JS));
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
    ok('bài giữa bàn XOÈ QUẠT (nghiêng dần từ giữa ra)', /function xoeQuat\(/.test(JS) && /rotate\(' \+ \(g \* 5\.5\)/.test(JS));
    ok('ghế có badge ĐỎ đếm lá, ≤2 lá thì vàng nhấp nháy', /dem-la/.test(JS) && /.dem-la.it{/.test(HTML));
    ok('bỏ lượt hiện PASS to rõ', /class="tt pass"/.test(JS) && /.tt.pass{/.test(HTML));
    ok('ghế hiện VỪA ĐÁNH gì, có dấu 💥 khi chặt', /vl\.viec==='danh'/.test(JS) && /💥 CHẶT/.test(JS));
    // cảnh báo "sắp về nhất" giờ nằm ở badge vàng nhấp nháy trên xấp bài (.dem-la.it), không còn nhãn riêng
    ok('cảnh báo ai còn ≤2 lá bằng badge vàng nhấp nháy', JS.includes("(p.soLa<=2?' it':'')") && /\.dem-la\.it\{[\s\S]*?nhapNhay/.test(HTML));
    ok('KHÔNG còn nhãn "sắp thắng" cũ (đã gộp vào badge, đừng báo 2 chỗ)', !/sapthang/.test(JS));
    ok('đếm ngược số giây trên ghế đang tới lượt, ≤5 giây thì đỏ nhấp nháy', /class="dem'\+\(conGiay<=5\?' gap':''\)/.test(JS));
    ok('tới lượt mình thì sáng viền bàn + kêu 1 lần', /classList\.toggle\('toiluot'/.test(JS) && /LUOT_KEU/.test(JS));
}

console.log('\n🎬 TRANG TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
