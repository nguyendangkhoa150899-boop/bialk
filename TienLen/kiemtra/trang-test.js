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
    // 'giaLa' đã bỏ hẳn ở máy chủ (mỗi lá = ĐÚNG 1 cược). Trang còn đọc là ra undefined, in
    // thành "đếm lá 0/lá" / "· lá 0" — người chơi tưởng bàn không tính tiền lá. Đã sót đúng
    // vậy tới lúc soi lại trước khi deploy 20/09.
    ok('KHÔNG còn đọc trường giaLa đã bỏ', !/giaLa/.test(JS));
    ok('phòng đếm lá nói rõ mỗi lá = 1 cược', /mỗi lá còn trên tay = 1 cược/.test(JS) && /🔢 mỗi lá/.test(JS));
    ok('phòng truyền thống nói rõ nhất / nhì bao nhiêu', /🏅 nhất/.test(JS) && /nhì ăn một nửa/.test(JS));
    ok('ảnh lá bài lấy theo mã lá', /src="bai\/'\+ma\+'\.webp"/.test(JS));
    // Nút "✕ Thoát Tiến Lên" của khung bọc ngoài là position:fixed góc phải trên -> nó NỔI ĐÈ
    // lên thanh trên của trang này, che mất viên thuốc tên + số dư. Trang phải tự chừa chỗ.
    ok('thanh trên chừa chỗ cho nút Thoát nổi của khung ngoài',
        HTML.indexOf('padding:8px 12px;padding-right:clamp(104px,15vw,168px)') >= 0);
    // ⚠️⚠️ BẪY CSS ĐÃ LÀM VỠ BÀN HAI LẦN (20/09): 'inset' là VIẾT TẮT của top/right/bottom/left.
    // Viết  .x{left:50%;top:50%;inset:auto}  thì inset XOÁ SẠCH left/top vừa ghi, khung rơi về
    // vị trí tĩnh = GÓC TRÁI TRÊN màn. Trình duyệt KHÔNG báo lỗi vì câu CSS hợp lệ hoàn toàn —
    // chỉ là mình tự ghi đè chính mình. Quét mọi quy tắc: viết tắt không được đứng SAU dòng dài
    // mà nó bao trùm.
    {
        const VIET_TAT = {
            inset: ['top', 'right', 'bottom', 'left'],
            margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
            padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
            background: ['background-color', 'background-image', 'background-position', 'background-size'],
            border: ['border-color', 'border-width', 'border-style'],
            flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
        };
        const css = HTML.slice(0, HTML.indexOf('</style>'));
        const xau = [];
        for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const chon = m[1].trim().split('\n').pop().trim();
            const khai = m[2].split(';').map(x => x.trim()).filter(Boolean)
                .map(x => ({ ten: x.split(':')[0].trim().toLowerCase(), raw: x }));
            khai.forEach((k, i) => {
                const bao = VIET_TAT[k.ten];
                if (!bao) return;
                const truoc = khai.slice(0, i).find(t => bao.indexOf(t.ten) >= 0);
                if (truoc) xau.push(chon.slice(0, 40) + ' -> "' + k.raw + '" đè mất "' + truoc.raw + '"');
            });
        }
        ok('⭐ KHÔNG có viết tắt CSS đặt SAU dòng dài mà nó bao trùm', xau.length === 0, xau.join(' | '));
    }
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
        cauHinh: { mucCuoc: 10000, cheDo: 'hang', toiTrangOn: true, chatHeoOn: true, thoiHeoOn: true, baBichOn: true },
        cheDoTen: 'Truyền thống 1-2-3-4', vonToiThieu: 300000, pheTram: 0.1, demVanKe: null,
        mucChoPhep: [10000, 20000, 40000, 60000, 80000, 100000], vote: null,
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
        // Ý: lỗi MẠNG thì S = null (hiện màn "chưa đăng nhập"); lỗi VẼ thì báo riêng.
        // Hai việc phải nằm ở HAI mắt xích khác nhau của chuỗi, không thì ve() ném lỗi là
        // rơi vào catch của mạng -> trang báo "chưa đăng nhập", giấu mất lỗi thật (dính 19/09).
        const iCatch = JS.indexOf('.catch(function(e){'), iVe = JS.indexOf('try { ve(); }');
        ok('lỗi VẼ TRANG không bị báo nhầm thành "chưa đăng nhập"',
            iCatch > 0 && iVe > iCatch && /S = null; SANH = null;/.test(JS) && /Lỗi vẽ trang/.test(JS));
        ok('...và ve() nằm ở mắt xích SAU, bọc try/catch riêng',
            /\.then\(function\(\)\{\s*try \{ ve\(\); \}/.test(JS));
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

    muc('🔍 chạy thật: ván có người NHỐT HEO / NHỐT TỨ QUÝ');
    // ---- chạy thật: dựng ván NHIỀU NGƯỜI CÙNG BỊ NHỐT rồi vẽ ra xem ----
    // Dùng chế độ ĐẾM LÁ: ván dừng NGAY khi người đầu tiên hết bài, nên cả ba người còn lại
    // đều ôm bài về. Chế độ 'hang' thì chỉ còn ĐÚNG MỘT người cầm bài lúc chốt -> không dựng
    // nổi cảnh hai người cùng thối.
    const b3 = taoBan({ mucCuoc: 1000, cheDo: 'anhet', toiTrangOn: false, baBichOn: false });
    ['A', 'B', 'C', 'D'].forEach((id, i) => b3.themNguoi({ id, ten: 'Người ' + id, ghe: i }));
    b3.vanMoi(0);
    const v3 = b3._trong.van;
    v3.tay.A = ['3s', '7s']; v3.tay.B = ['4c', '2h', '2s']; v3.tay.C = ['5d', '9d']; v3.tay.D = ['6h', 'Ks', 'Kc', 'Kd', 'Kh'];
    v3.bo = null; v3.boCua = null; v3.daBo.clear(); v3.veNhat = []; v3.batBuoc3Bich = false; v3.luot = 'A';
    b3.danh('A', ['3s'], 0); b3.danh('B', ['4c'], 0); b3.danh('C', ['5d'], 0); b3.danh('D', ['6h'], 0);
    b3.danh('A', ['7s'], 0);          // A hết bài -> đếm lá: chốt ngay, B/C/D ôm bài về
    const kq3 = v3.ketQua;
    ok('dựng được ván thật có người nhốt heo và nhốt tứ quý', !!kq3 &&
        kq3.chiTiet.B.thoiMuc.length > 0 && kq3.chiTiet.D.thoiMuc.join() === 'tu',
        JSON.stringify({ B: kq3 && kq3.chiTiet.B.thoiMuc, D: kq3 && kq3.chiTiet.D.thoiMuc }));
    ok('máy chủ lật bài CẢ BÀN lúc chốt ván', kq3.lat.length === 4 && kq3.lat.some(x => x.la.length > 0));
    chay('vẽ ván có người NHỐT HEO + NHỐT TỨ QUÝ không nổ', { ...nen, ban: b3.xem('A'), demVanKe: 5 });
    const raGhe = String(els.get('banGhe') ? els.get('banGhe').innerHTML : '');
    ok('ghế B hiện nhãn THỐI HEO', /THỐI[^<]*HEO/i.test(raGhe), raGhe.slice(0, 200));
    ok('ghế D hiện nhãn THỐI TỨ QUÝ', /THỐI[^<]*TỨ QUÝ/i.test(raGhe));
    ok('ghế ghi rõ ai đi hết bài / ai còn mấy lá', /đi hết bài/.test(raGhe) && /còn \d+ lá/.test(raGhe), raGhe.slice(0, 300));
    // ⭐ Bài THẬT lật TO GIỮA BÀN, không nhét vào ghế: nhét vào ghế thì mỗi lá rộng 26px,
    // 13 lá chồng nhau là nhìn không ra lá gì (chủ server: "chưa show được bài... ý là show
    // bài của người CÒN ra á" — nó CÓ vẽ, chỉ là bé quá nên trông như chưa vẽ).
    // Màn rộng (bài kiểm dựng window.innerWidth = 1200): bài xoè NGAY CẠNH TỪNG GHẾ, đúng
    // ảnh mẫu Ba Bích — gom một bảng giữa bàn thì không biết bài đó của AI.
    ok('cạnh mỗi ghế có xoè bài thật của người đó', raGhe.indexOf('class="latGhe"') >= 0 &&
        raGhe.indexOf('src="bai/2h.webp"') >= 0, raGhe.slice(0, 300));
    ok('...ghế nửa phải màn thì bày bài sang TRÁI, khỏi tràn ra ngoài mép',
        /class="ghe[^"]*beT/.test(raGhe) || /class="ghe[^"]*beP/.test(raGhe), raGhe.slice(0, 200));
    ok('...người ĐÃ đi hết bài thì không xoè gì (không còn lá để lật)',
        (raGhe.match(/class="latGhe"/g) || []).length === 3, String((raGhe.match(/class="latGhe"/g) || []).length));
    const raLat = String(els.get('banLat') ? els.get('banLat').innerHTML : '');
    ok('...bảng gom giữa bàn TẮT khi màn rộng (đã có xoè cạnh ghế)',
        els.get('banLat').hidden === true, raLat.slice(0, 120));
    const raCuoi = String(els.get('kqCuoi') ? els.get('kqCuoi').innerHTML : '');
    ok('có câu chọc nhắc đúng thứ người ta ôm', /heo|tứ quý/i.test(raCuoi), raCuoi);
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
    // Kiểu Ba Bích — chủ server chốt LẠI 20/09 sau khi thử khay: bấm lá thì lá NHÔ LÊN TẠI CHỖ
    // trong hàng bài, không phóng to. Khay riêng đã BỎ (chiếm nguyên một hàng, điện thoại nằm
    // ngang là mọi thứ dồn chật): "cho về lại bản chọn giống như game Ba Bích, đừng chồng chéo".
    ok('lá đang chọn NHÔ LÊN TẠI CHỖ + viền vàng + dấu ✓',
        /\.tay \.the\.chon\{[\s\S]{0,200}translateY\(-26px\)/.test(HTML) && /\.tay \.the\.chon::after\{content:'✓'/.test(HTML));
    ok('lá chọn KHÔNG phóng to (phóng to là lấn che lá kế bên)', !/\.tay \.the\.chon\{[^}]*scale\(/.test(HTML));
    ok('dấu ✓ nằm góc TRÁI (phần luôn nhìn thấy khi xoè chồng)', /\.chon::after\{[^}]*left:-6px/.test(HTML));
    ok('KHÔNG còn khay bài đã chọn', !/banKhay/.test(HTML) && !/function veKhay\(/.test(JS));
    // 20/09: "để chuột vị trí này thì lá bài bị giật giật" — hover mà nhấc lá lên thì mép dưới
    // chạy khỏi con trỏ -> mất hover -> tụt -> dính lại: rung vô tận. Hover PHẢI đứng yên.
    {
        const luatHover = HTML.match(/\.tay \.the[^\n{]*:hover\{[^}]*\}/g) || [];
        ok('có luật hover cho tay bài', luatHover.length > 0, JSON.stringify(luatHover));
        ok('hover KHÔNG di chuyển lá (chống rung)', luatHover.every(r => !/transform|translate|margin/.test(r)), JSON.stringify(luatHover));
        ok('hover KHÔNG đụng lá đã chọn (đẩy lên là che lá chọn kế bên)',
            luatHover.every(r => /:not\(\.chon\)/.test(r)), JSON.stringify(luatHover));
        ok('...nhưng vẫn đưa lá đang trỏ lên trên để nhìn trọn', luatHover.some(r => /z-index:\s*\d/.test(r)));
    }
    // 20/09: dòng gợi ý từng in 2 lần "Mấy lá này không thành bộ · ... không thành bộ hợp lệ"
    // đếm CHUỖI THẬT trong code, không đếm dòng chú thích
    ok('không còn câu "không thành bộ" tự ghép (chỉ còn câu của kq.vi)',
        !JS.includes("'Mấy lá này không thành bộ'") && (JS.match(/'Mấy lá này không thành bộ hợp lệ'/g) || []).length === 1);
    ok('...vì đã để kq.vi tự nói, không ghép thêm câu của mình', /datHTML\(bc, bo \? \(esc\(bo\.ten\) \+ ' · ' \+ phu\) : phu\)/.test(JS));
    // 19/09: chủ server "cứ làm bài to x2 thôi, không cần kính lúp, dư nhiều nút quá"
    ok('cỡ bài CỐ ĐỊNH 2×, đã bỏ nút 🔍', /--co:2;/.test(HTML) && !/function coBai\(/.test(JS) && !/onclick="coBai/.test(JS));
    ok('tay bài xoè chồng + tự co cho vừa bề ngang', /function canhTay\(/.test(JS) && /W \* 0\.8/.test(JS));
    // "chọn con 8 bị che con 9": chỉ chừa chỗ ở nơi lá ĐÃ CHỌN đứng cạnh lá CHƯA CHỌN
    // "chọn con 8 bị che con 9": lá chọn nhô lên nằm đè lên lá kế -> phải chừa khoảng trống
    // NGAY SAU nó, và chỉ ở chỗ lá ĐÃ CHỌN đứng trước lá CHƯA CHỌN.
    ok('chừa khoảng trống sau lá đã chọn để không che lá kế',
        /HO_CHON/.test(JS) && /contains\('chon'\) && !k\[i\]\.classList\.contains\('chon'\)/.test(JS));
    ok('...và khoảng trống đó được tính vào phép chia nên không tràn hàng', /g \* HO_CHON/.test(JS));
    ok('...bấm lá là canh lại hàng NGAY, khỏi đợi nhịp 1 giây', /classList\.toggle\('chon'\);\s*\n\s*canhTay\(\);/.test(JS));
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

    // 🟢 MÀN CHƠI PHỦ KÍN — chủ server gửi ảnh mẫu game Tiến Lên mobile 20/09: mặt bàn là NỀN
    // của cả màn hình, ghế sát mép, tay bài trải hết dải đáy, gần như không có chữ.
    ok('màn chơi PHỦ KÍN màn hình, bật bằng lớp body.choiBan',
        /body\.choiBan\{padding:0;max-width:none;overflow:hidden\}/.test(HTML) &&
        /body\.choiBan #manBan\{position:fixed;inset:0\}/.test(HTML) &&
        /classList\.toggle\('choiBan'/.test(JS));
    ok('...chỉ bật ở màn BÀN, sảnh và phòng chờ vẫn cuộn bình thường',
        /classList\.toggle\('choiBan', !!\(S && !oSanh && S\.ban\)\)/.test(JS));
    ok('...mặt bàn ăn trọn màn, bỏ oval',
        /body\.choiBan \.san\{position:absolute;inset:0/.test(HTML) && /body\.choiBan \.vien\{inset:0;border-radius:0/.test(HTML));
    ok('...tay bài trải dải đáy, chừa bên trái cho ghế của mình',
        /body\.choiBan \.tayHang\{position:absolute[\s\S]{0,140}padding-left:min\(24%,250px\)/.test(HTML));
    // Không có trần thì trên màn PC 2554px, hai ghế đặt ở 13% và 70% cách nhau hơn 700px:
    // tên người chơi văng ra bốn góc, giữa là bãi xanh trống hoác (chủ server chụp 20/09).
    ok('⭐ VÙNG CHƠI có TRẦN kích thước, căn giữa — màn PC không kéo ghế ra bốn góc',
        /body\.choiBan\{[\s\S]{0,40}--W:min\(100%,980px\);--H:min\(100%,560px\)/.test(HTML) &&
        /body\.choiBan \.ni\{position:absolute;inset:auto;left:50%;top:50%[\s\S]{0,90}width:var\(--W\);height:var\(--H\)/.test(HTML) &&
        /body\.choiBan #banGhe\{position:absolute;left:50%;top:50%[\s\S]{0,90}width:var\(--W\);height:var\(--H\)/.test(HTML));
    ok('...nhưng mặt cỏ vẫn phủ kín cả màn cho đẹp',
        /body\.choiBan \.vien\{inset:0;border-radius:0;padding:0;[\s\S]{0,140}radial-gradient/.test(HTML));
    ok('...nút phụ / vote / rời bàn / thanh trên cũng bám mép VÙNG CHƠI, không dạt ra mép màn',
        /left:calc\(var\(--leT\) \+ 6px\)/.test(HTML) && /right:calc\(var\(--leP\) \+ 6px\)/.test(HTML));
    ok('...nút bấm NỔI trên tay bài chứ không đẩy bàn ngắn lại',
        /body\.choiBan #banDanh\{position:absolute/.test(HTML) && /bottom:var\(--t1\)/.test(HTML));
    // 🗺️ BA lần dính "X đè lên Y" (chữ đè ghế · lá chọn đè nút · nút Đánh đè nút Rời bàn) vì
    // mỗi chỗ gõ một con số riêng. Dựng BẢN ĐỒ TẦNG LỚP: mọi thứ nổi trên mặt bàn lấy vị trí
    // từ đúng MỘT khối biến, nhìn một chỗ là biết chỗ nào còn trống.
    ok('🗺️ có bản đồ tầng lớp, mọi tầng lấy từ biến chung',
        /--day:5px;/.test(HTML) && /--hTay:calc\(var\(--lbt\) \* 1\.45\)/.test(HTML) &&
        /--t1:calc\(var\(--day\) \+ var\(--hTay\) \+ 41px\)/.test(HTML) &&
        /--t2:calc\(var\(--t1\) \+ 64px\)/.test(HTML) && /--t3:calc\(var\(--t2\) \+ 32px\)/.test(HTML));
    ok('...tầng 1 đã cộng 41px cho lá ĐANG CHỌN nhô lên 26px',
        /26px lá ĐANG CHỌN nhô lên/.test(HTML) &&
        /\.tay \.the\.chon\{transform:translateY\(-26px\);z-index:18/.test(HTML));
    ok('...KHÔNG còn chỗ nào gõ số lẻ tại chỗ cho dải đáy',
        HTML.indexOf('bottom:calc(var(--lbt) * 1.45 +') < 0);
    // Hàng nút to căn giữa màn, ma vùng chơi chỉ 980px nên hai bên chạm nhau: nút "Đánh" đè
    // lên "RỜI BÀN SAU VÁN NÀY" (chủ server chụp lại 20/09). Cột phải phải lên góc TRÊN.
    ok('...vote + rời bàn nằm GÓC PHẢI TRÊN, không chen vào dải nút ở đáy',
        /body.choiBan #khoiVote{top:52px}/.test(HTML) && /body.choiBan #khoiRa{top:88px}/.test(HTML) &&
        !/body.choiBan #khoiRa{bottom:/.test(HTML));
    ok('...bảng kết quả nổi giữa màn', /body\.choiBan #banKq\{position:absolute;left:50%;top:50%/.test(HTML));
    // Bản cũ xếp ghế theo VÒNG TRÒN (y = 50 + 34·cos) -> màn nằm ngang bóp lại là ghế đè lên bàn.
    ok('🪑 chỗ ngồi theo BẢNG TOẠ ĐỘ cố định, không còn vòng tròn',
        /var CHO_NGOI = \{/.test(JS) && !/34\*Math\.cos/.test(JS) && !/rx\*Math\.sin/.test(JS));
    ok('...mình luôn ở GÓC TRÁI DƯỚI để chừa dải đáy cho tay bài', /2: \[\[13, 70\]/.test(JS) && /4: \[\[13, 70\]/.test(JS));
    ok('...đủ bảng cho 2 / 3 / 4 người',
        /CHO_NGOI\[n\] \|\| CHO_NGOI\[4\]/.test(JS) && /3: \[\[13, 70\], \[12, 34\], \[86, 34\]\]/.test(JS));
    ok('📜 luật chi tiết gom vào tooltip, không chiếm chỗ', /el\.textContent = '📜 luật'/.test(JS) && /el\.title = luatDay/.test(JS));
    ok('...bài nhỏ lại cho vừa màn thấp', /--co:1\.15/.test(HTML));
    ok('...ô ghế gọn lại (nhãn + xấp bài úp thu nhỏ)',
        /\.ttO\{min-height:18px\}/.test(HTML) && /\.av\{width:22px;height:22px/.test(HTML) &&
        /\.lung i\{width:12px;height:17px\}/.test(HTML));
    // iPhone nằm ngang cao ~400px: ép bàn oval vào phòng chờ thì 4 ghế đè lên nhau và nút
    // SẴN SÀNG nằm chồng lên ghế (chủ server chụp lại 20/09). Oval ở phòng chờ chỉ là trang
    // trí -> bỏ hẳn, xếp ghế thành một hàng ngang.
    ok('...PHÒNG CHỜ bỏ bàn oval, xếp ghế thành hàng ngang',
        /#sanCho\{aspect-ratio:auto;height:auto/.test(HTML) &&
        /#sanCho #choGhe\{order:1;display:flex/.test(HTML));
    ok('...và phải !important mới đè được style left/top gắn thẳng vào thẻ ghế',
        /#sanCho \.ghe\{position:static!important;left:auto!important;top:auto!important/.test(HTML));
    ok('...nút SẴN SÀNG rơi xuống dưới hàng ghế, không nằm chồng lên',
        /#sanCho \.vien\{order:2;position:static/.test(HTML) && /#sanCho \.giua\{position:static;transform:none/.test(HTML));
    ok('...KHÔNG còn vết tích khay trong nhánh nằm ngang', !/banKhay/.test(HTML));
    ok('lệch tính theo var(--lb) nên đổi cỡ bài là cả đống co theo', /calc\(var\(--lb\) \* ' \+ mx/.test(JS));
    // "đánh bài có animation lá bài từ chỗ người chơi bay lên"
    // 🐞 LỖI NẶNG 20/09: GHE_VT ghi % của VÙNG CHƠI nhưng laBan quy ra px theo .san — mà từ
    // lúc bàn phủ kín màn thì .san CHÍNH LÀ CẢ MÀN HÌNH. Ghế ở 13% -> lệch −942px trên màn
    // 2547px: lá bài bay từ NGOÀI MÀN và nằm chết ở góc ("đánh bài nó văng lên góc").
    ok('⭐ lá bay đo theo ĐÚNG hộp mà % toạ độ ghế thuộc về (#banGhe), KHÔNG phải .san',
        JS.indexOf("var hop = $('banGhe');") >= 0 && JS.indexOf("var san = $('san');") < 0);
    ok('✈️ lá bay từ chỗ người đánh vào giữa bàn', /\.ola\.bay\{animation:bayVao/.test(HTML) && /@keyframes bayVao\{/.test(HTML) && /GHE_VT\[tuAi\]/.test(JS));
    ok('...ghế phải vẽ TRƯỚC để biết toạ độ', JS.indexOf('veGhe(b, v);') < JS.indexOf('var nuocBan ='));
    // "đếm ngược 5 4 3 2 1 rồi chia ván mới"
    ok('⏱ đếm ngược 5·4·3·2·1 giữa bàn', /id="demNguoc"/.test(HTML) && /con > 0 && con <= 5/.test(JS));
    ok('bỏ lượt hiện PASS to rõ', /class="tt pass"/.test(JS) && /.tt.pass{/.test(HTML));
    ok('ghế hiện VỪA ĐÁNH gì, có dấu 💥 khi chặt', /vl\.viec==='danh'/.test(JS) && /💥 CHẶT/.test(JS));
    // 19/09 chủ server: "che bài người khác lại cho không được biết số lá bài của nhau nữa"
    ok('ghế người khác KHÔNG hiện số lá — chỉ xấp úp cố định', /p\.conBai\) \? '<i><\/i><i><\/i><i><\/i>'/.test(JS) && !/dem-la/.test(JS));
    ok('số lá chỉ hiện cho CHÍNH MÌNH', /laToi && p\.soLa!=null \? p\.soLa\+' lá' : ''/.test(JS));
    // 20/09: ghế nói chuyện CỦA VÁN NÀY, không phải tổng cộng dồn cả buổi — về nhất mà ghế
    // ghi −4.200 (tổng cả buổi) thì chẳng ai hiểu gì.
    ok('ghế hiện ăn/thua CỦA VÁN NÀY, không phải tổng cộng dồn',
        /var tienVan = kqv \? \(\(kqv\.tien && kqv\.tien\[p\.id\]\) \|\| 0\) : \(p\.chatVan \|\| 0\)/.test(JS) &&
        /ván này/.test(JS));
    ok('...không ghi "+0" cho rối mắt', /var nhanTien = !tienVan \? '' :/.test(JS));
    ok('...máy chủ gửi kèm tiền chặt đã chuyển trong ván', /chatVan:/.test(fs.readFileSync(path.join(__dirname, '..', 'van.js'), 'utf8')));
    ok('KHÔNG còn nhãn "sắp thắng" / badge đếm lá cũ', !/sapthang/.test(JS) && !/dem-la/.test(HTML));
    ok('đếm ngược số giây trên ghế đang tới lượt, ≤5 giây thì đỏ nhấp nháy', /class="dem'\+\(conGiay<=5\?' gap':''\)/.test(JS));
    ok('tới lượt mình thì sáng viền bàn + kêu 1 lần', /classList\.toggle\('toiluot'/.test(JS) && /LUOT_KEU/.test(JS));
    // 20/09: "chữ nhảy linh tinh hết" — ghế co giãn theo trạng thái (có lượt thì mọc thanh
    // đồng hồ, nhãn thì đổi liên tục) nên mỗi giây vẽ lại là cả cụm chữ nhích chỗ.
    ok('ghim chiều cao ô đồng hồ + ô nhãn để chữ trên ghế KHÔNG nhảy',
        /\.gioO\{height:7px\}/.test(HTML) && /\.ttO\{min-height:25px\}/.test(HTML) &&
        JS.indexOf('<div class="gioO">\'+gio+\'</div><div class="ttO">\'+tt+\'</div>') >= 0);
    // 🏆 "ai về nhất rồi show ra luôn / hiện chữ NHẤT show bự ra / người nhì nữa"
    ok('🏆 bắn chữ VỀ NHẤT / VỀ NHÌ to giữa bàn',
        /id="banHang"/.test(HTML) && /function theoDoiHang\(/.test(JS) && /@keyframes hangBung\{/.test(HTML));
    ok('...mỗi người bắn ĐÚNG MỘT LẦN, sang ván mới thì xoá sạch',
        /HANG_DA\[ds\[i\]\.id\] = 1;/.test(JS) && /HANG_VAN !== so/.test(JS));
    ok('...xếp hàng chờ, hai người về cùng lúc không đè chữ lên nhau',
        /function chayHang\(/.test(JS) && /HANG_CHO\.shift\(\)/.test(JS));
    ok('...lúc chốt ván chỉ khoe người NHẤT (khỏi bắn tràng dài hơn đếm ngược)',
        /v\.ketQua && ds\[i\]\.hang !== 1\) continue/.test(JS));
    ok('..."được hưởng sái": nói luôn còn mấy người tranh hạng kế',
        /còn ' \+ x\.con \+ ' người tranh '/.test(JS));
    ok('...mỗi hạng một màu riêng',
        /#banHang\.h1\{/.test(HTML) && /#banHang\.h2\{/.test(HTML) && /#banHang\.h3\{/.test(HTML));
}

// ---------------------------------------------------------------- id trùng
// 20/09: tiêu đề trang và chữ-to-giữa-bàn CÙNG mang id="banTen". getElementById trả thẻ đầu
// tiên nên banhTen() ghi đè tiêu đề, còn thẻ giữa bàn chết; CSS #banTen (absolute + animation
// mờ dần) cũng dính vào tiêu đề -> vào trang là tiêu đề bay mất. Loại lỗi này nhìn mắt không ra.
muc('KHÔNG được có id trùng');
{
    const dem = {};
    (HTML.match(/id="[A-Za-z0-9_-]+"/g) || []).forEach(x => { dem[x] = (dem[x] || 0) + 1; });
    const trung = Object.keys(dem).filter(k => dem[k] > 1);
    ok('mỗi id chỉ xuất hiện MỘT lần trong trang', trung.length === 0, trung.join(', '));
    ok('tiêu đề trên đầu trang mang id riêng (banTieu), không giành id banTen',
        /<div class="ten" id="banTieu">/.test(HTML));
    ok('id banTen để dành cho chữ TO giữa bàn, nằm trong lòng bàn (.ni)',
        HTML.indexOf('<div id="banTen" hidden>') > HTML.indexOf('<div class="ni">'));
}

// ---------------------------------------------------------------- nhắc cho người chơi dễ biết
muc('nhắc nhở cho người chơi dễ biết (20/09)');
{
    ok('📜 luật đang bật hiện NGAY TRÊN BÀN (trước chỉ có ở phòng chờ)',
        /id="banLuat"/.test(HTML) && /L\.baBich\?'3♠ đi đầu'/.test(JS) && /phế ' \+ Math\.round\(b\.pheTram\*100\)/.test(JS));
    ok('🕘 khoe ván TRƯỚC: ai nhất, mình ăn thua bao nhiêu',
        /id="banTruoc"/.test(HTML) && /function nhoVanTruoc\(/.test(JS) && /VAN_TRUOC\.nhat/.test(JS));
    ok('...ghi một lần cho mỗi ván, không đè chồng', /VAN_TRUOC\.so === so\) return;/.test(JS));
    ok('...và giấu đi khi đang ở chính ván đó', /VAN_TRUOC\.so !== \(b\.soVan\|\|0\)/.test(JS));
    ok('🚫 nói rõ "bạn đã bỏ lượt, chờ hết vòng" thay vì chỉ "đang chờ X"',
        /Bạn đã bỏ lượt — chờ hết vòng này/.test(JS) && /toiTrongDs && toiTrongDs\.daBo/.test(JS));
    ok('...kèm còn mấy người đang tranh vòng này',
        /x\.trongVan && !x\.daBo && x\.conBai/.test(JS) && /người đang tranh/.test(JS));
}

// ---------------------------------------------------------------- sảnh + vote (20/09)
muc('🏠 SẢNH chọn phòng / tạo phòng');
{
    ok('có màn sảnh riêng', /id="manSanh"/.test(HTML) && /function veSanh\(/.test(JS));
    ok('nhớ phòng đang mở, tải lại trang không văng ra sảnh',
        /localStorage\.getItem\('tienlen_phong'\)/.test(JS) && /function datPhong\(/.test(JS));
    ok('API của phòng có tiền tố mã phòng', /function apiP\(duong, than\)\{ return api\('\/' \+ PHONG \+ duong/.test(JS));
    ok('ở sảnh thì hỏi /ds, trong phòng thì hỏi /state', /PHONG \? apiP\('\/state'\) : api\('\/ds'\)/.test(JS));
    ok('phòng tan mất thì quay ra sảnh, KHÔNG báo "chưa đăng nhập"',
        /không còn nữa\|Phòng/.test(JS) && /datPhong\(null\); return;/.test(JS));
    ok('hộp tạo phòng: chọn chế độ + mức cược trong thang',
        /function veTao\(/.test(JS) && /id="taoCheDo"/.test(HTML) && /id="taoMuc"/.test(HTML));
    ok('...và nói trước cần bao nhiêu vốn, thiếu thì khoá nút',
        /taoVon/.test(JS) && /taoNut'\)\.disabled = !TAO_MUC \|\| d\.toi\.dogcoin < von/.test(JS));
    // 🪙 chủ server: "trừ dogcoin sử dụng icon dogcoin có sẵn hết nha"
    ok('🪙 mọi con số tiền kèm icon Dogcoin',
        /function xu\(n, kemDau\)/.test(JS) && JS.indexOf('src="/dogcoin.png"') >= 0 && /\.dc\{width:1\.05em/.test(HTML));
    ok('...không còn chỗ nào ghi chữ "Dogcoin" suông', JS.indexOf("' Dogcoin'") < 0);
    // 🚪 chủ server: "thêm nút thoát trận, đánh xong thoát luôn thay vì bị mất mạng"
    ok('🚪 giữa ván có nút XIN RỜI SAU VÁN NÀY, không để nút chết trơ',
        /function roiSau\(/.test(JS) && /RỜI BÀN SAU VÁN NÀY/.test(JS) && JS.indexOf("goi('/roisau'") >= 0);
    ok('...bấm lại là huỷ, có nói rõ đang chờ rời',
        /Sẽ rời bàn khi hết ván — bấm để ở lại/.test(JS) && /S\.xinRoi/.test(JS));
    ok('có nút ra sảnh ở phòng chờ', /function raSanh\(/.test(JS) && /onclick="raSanh\(\)"/.test(HTML));
    // "pc mình không bấm được vào bàn" — KHÔNG phải lỗi: ví 20 Dogcoin, phòng rẻ nhất cần
    // 120.000. Lý do vốn đã ghi trong dòng xám của từng phòng nhưng lẫn giữa đống chữ, người
    // chơi chỉ thấy bấm không ăn rồi bỏ đi. Phải nói thẳng ngay đầu sảnh.
    ok('⛔ băng báo đầu sảnh khi KHÔNG vào được phòng nào',
        /id="sanhChan"/.test(HTML) && /#sanhChan\{background:#2e1212/.test(HTML) && /var kho = d\.phong\.length/.test(JS));
    ok('...nói rõ ví có bao nhiêu và phòng rẻ nhất cần bao nhiêu',
        /Ví bạn chỉ có/.test(JS) && /phòng rẻ nhất cũng cần/.test(JS));
    ok('...lý do của từng phòng tách riêng một dòng, tô đỏ',
        /class="t3">⛔/.test(JS) && /\.phg \.t3\{[^}]*#ff9a9a/.test(HTML));
}

muc('🗳️ VOTE đổi mức cược');
{
    ok('khối vote nằm NGOÀI cả màn chờ lẫn màn bàn (tránh id trùng)',
        /id="khoiVote"/.test(HTML) && HTML.indexOf('id="khoiVote"') > HTML.indexOf('<div id="manBan"'));
    ok('chỉ hiện khi đang ngồi trong một phòng', /khoiVote'\)\.hidden = !\(S && !oSanh && S\.gheCuaToi >= 0\)/.test(JS));
    ok('có hàm vẽ vote + gửi phiếu + rút phiếu',
        /function veVote\(/.test(JS) && /goi\('\/vote'/.test(JS) && /goi\('\/huyvote'/.test(JS));
    ok('hiện rõ ĐƯỢC MẤY PHIẾU / CẦN MẤY PHIẾU', /vt\.soDong \+ '\/' \+ vt\.can/.test(JS));
    ok('cảnh báo đổi cược làm đổi VỐN TỐI THIỂU', /vốn tối thiểu mới/.test(JS) && /sẽ bị mời khỏi bàn/.test(JS));
    ok('mức đang chơi thì khoá, không cho vote lại chính nó', /\(đang chơi\)<\/button>/.test(JS));
}

// ---------------------------------------------------------------- ngửa bài + nhãn thối (20/09)
muc('🔍 HẾT VÁN NGỬA BÀI CẢ BÀN + nhãn THỐI/CÓNG');
{
    ok('lật bài giữa bàn khi có ketQua.lat',
        /function veLat\(/.test(JS) && /id="banLat"/.test(HTML) && /\.latD \.bo img\{/.test(HTML));
    ok('...cỡ lá đọc được, không phải xấp tí hon nhét trong ghế',
        /--llb:clamp\(30px,4vw,52px\)/.test(HTML) && !/--llat/.test(HTML));
    ok('...chỉ bày người CÒN cầm bài', /x\.la && x\.la\.length/.test(JS));
    ok('...ghế chỉ ghi nhãn gọn: đi hết bài / còn N lá',
        /hetbai xong">✅ đi hết bài/.test(JS) && /hetbai con">🃏 còn/.test(JS));
    ok('...trước đó vẫn giấu, chỉ một xấp úp', /!v\.ketQua && p\.conBai/.test(JS));
    ok('nhãn THỐI ghi rõ thối CÁI GÌ, không chỉ "thối 2"',
        /THỐI ' \+ esc\(gomMuc\(ctv\.thoiMuc\)/.test(JS) && /function gomMuc\(/.test(JS));
    ok('gom nhiều lá cùng loại: "2 heo đỏ" chứ không phải "heo đỏ · heo đỏ"',
        /dem\[k\] > 1 \? dem\[k\] \+ ' ' : ''/.test(JS));
    ok('có nhãn CÓNG ×2 riêng', /🧊 CÓNG ×2/.test(JS) && /\.tt\.cong\{/.test(HTML));
    ok('nhãn thối/cóng đứng TRƯỚC nhãn hạng (thứ cả bàn muốn nhìn)',
        JS.indexOf('🧊 CÓNG ×2') < JS.indexOf("'🏆 NHẤT'"));
    ok('bảng kết quả cũng ghi rõ thối gì', /thối ' \+ \(ct\.thoiMuc && ct\.thoiMuc\.length/.test(JS));
    ok('😂 có câu chọc cuối ván', /function choc\(/.test(JS) && /id="kqCuoi"/.test(HTML) && /CHOC_THOI/.test(JS));
    // (dấu ngoặc là cố ý: chữ "Math.random" còn nằm trong một dòng bình luận giải thích
    //  vì sao KHÔNG được dùng nó — bắt trần trụi là đỏ oan)
    ok('...câu chọc ổn định theo ván (không nhảy mỗi giây)',
        /bam\(id \+ soVan/.test(JS) && !/Math\.random\(\)/.test(JS));
    // 8 lá chồng 46% thì dính thành MỘT KHỐI, nhìn không ra lá nào với lá nào (chủ server
    // chụp lại 20/09). Hạ chồng xuống 30% + viền trắng + bóng đổ để mắt tách được từng lá.
    // Chồng 30% thì 11 lá dồn thành MỘT VỆT TRẮNG, nhìn không ra lá gì (chủ server: "lá bài bị
    // trắng rồi / show bài giống như ba bích á, có thể xuống dòng"). Bày nguyên lá, cách nhau
    // 3px, hết bề ngang thì tự xuống hàng.
    ok('bài lật bày NGUYÊN CON, KHÔNG chồng lên nhau',
        /\.latGhe img\{[^}]*margin:0/.test(HTML) && !/margin-left:calc\(var\(--llb\)/.test(HTML));
    // Ảnh lá bài (.webp) có NỀN TRONG SUỐT — mặt trắng là do CSS vẽ (.the{background:#fff}).
    // Bày <img> trần lên mặt cỏ thì cỏ xanh lọt qua, lá bài thành MÀU XANH (chủ server 20/09).
    ok('⭐ lá lật có NỀN TRẮNG (ảnh .webp nền trong suốt)',
        /\.latGhe img\{[^}]*background:#fff/.test(HTML) && /\.latD \.bo img\{[^}]*background:#fff/.test(HTML));
    ok('...và giữ đúng tỉ lệ lá bài', /\.latGhe img\{[^}]*aspect-ratio:222\/323/.test(HTML));
    ok('...hết bề ngang thì XUỐNG DÒNG', /\.latGhe\{[\s\S]{0,220}flex-wrap:wrap;gap:3px/.test(HTML) &&
        /max-width:min\(40vw,var\(--latW,400px\)\)/.test(HTML));
    ok('...có trần bề ngang riêng cho khổ nằm ngang', /--latW:230px/.test(HTML));
    ok('lá heo bị phạt có viền cam cho dễ thấy', /\.latD \.bo img\.xau\{outline/.test(HTML) && /xau\[c\] = 1/.test(JS));

}

muc('💥 CHẶT: trừ tiền tại chỗ thì phải THẤY nó trừ');
{
    ok('số tiền bay lên trên ghế hai người liên quan', /class="bay /.test(JS) && /.bay{position:absolute/.test(HTML) && /@keyframes tienBay{/.test(HTML));
    ok('xanh cho người ăn, đỏ cho người mất', /.bay.an{/.test(HTML) && /.bay.mat{/.test(HTML) && JS.indexOf("(an ? 'an' : 'mat')") >= 0);
    ok('kêu MỘT lần cho mỗi cú chặt, so theo mốc luc', /cm.luc !== CHAT_LUC/.test(JS) && /CHAT_LUC = cm.luc/.test(JS));
    ok('...vẽ lại mỗi giây KHÔNG làm hiệu ứng chạy lại từ đầu', /CHAT_NHAY/.test(JS) && /veBan._chat/.test(JS));
    ok('nhãn trên ghế người chặt ghi luôn số tiền ăn', JS.indexOf("(vl.thuong?' +'+xu(vl.thuong):'')") >= 0);
    ok('dòng thông báo nói rõ ai chặt ai, lấy bao nhiêu', JS.indexOf("' chặt ' + tenCua(cm.bi) + ' — lấy ngay '") >= 0);
}

muc('📱 MOBILE: bắt xoay ngang + chặn vuốt trôi trang');
{
    ok('chặn nảy mép / kéo-xuống-tải-lại', /html\{overscroll-behavior:none/.test(HTML) && /overscroll-behavior:none;touch-action:manipulation/.test(HTML));
    ok('vuốt trên BÀN và TAY BÀI không kéo trang', /\.san,\.tayHang,\.tay,#banBo,#banGhe\{touch-action:none\}/.test(HTML));
    ok('bắt xoay ngang bằng CSS, không chỉ dựa vào JS',
        /@media \(orientation:portrait\) and \(max-width:820px\)\{/.test(HTML) && /#xoay\{display:grid!important\}/.test(HTML));
    ok('...và khoá cuộn trang lúc đang che', /body\{position:fixed;inset:0;width:100%;overflow:hidden\}/.test(HTML));
    ok('JS dùng ĐÚNG ngưỡng của CSS (820px), không lệch nhau', /innerWidth <= 820 && window\.innerHeight > window\.innerWidth/.test(JS));
    ok('bàn có TRẦN bề ngang, không phình hết màn hình lớn',
        HTML.indexOf('width:min(100%, 1000px, calc((100dvh - 300px) * 1.61))') >= 0);
    ok('tay bài chỉ siết độ chồng KHI THIẾU CHỖ, dư chỗ thì xoè thoáng', JS.indexOf('var can = W * 0.14;') >= 0);
    ok('JS bật thêm lớp khoá cho máy không nhận @media orientation',
        /classList\.toggle\('khoaXoay', che\)/.test(JS) && /body\.khoaXoay\{/.test(HTML));
}

console.log('\n🎬 TRANG TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
