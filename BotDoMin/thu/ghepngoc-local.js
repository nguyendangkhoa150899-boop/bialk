// 💎 05/10: CHẠY THỬ Ghép Ngọc ở máy local (không cần Discord, không đụng server thật).
//   node thu/ghepngoc-local.js       -> mở http://localhost:3999
// Dùng ĐÚNG ghepngoc.js + ghepngoc.client.js + ghepngoc.admin.js như bản thật. Dữ liệu:
//   thu/du-lieu-mau.json  = ảnh chụp từ server thật (danh mục vật phẩm, giá shop web, bảng giá Rương Ích Kỷ,
//                           rương + ví TỪNG người chơi để đóng vai). CÓ dữ liệu người chơi -> KHÔNG commit (gitignore).
//   thu/db-thu.json       = DB thử (cấu hình admin, rương người chơi giả). Xoá file = về ban đầu.
// Icon lấy qua proxy từ https://play.netco4.click/itemicon/ (ảnh công khai).
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
const ITEMICON = require('../itemicon');
const PORT = Number(process.env.PORT) || 3999;
const MAU = JSON.parse(fs.readFileSync(path.join(__dirname, 'du-lieu-mau.json'), 'utf8'));
const DBF = path.join(__dirname, 'db-thu.json');

function ruongMau() {
    const items = { ...MAU.ruong };
    // thêm cho đủ đồ thử: 20 ngọc 6 mỗi loại phổ biến + vài phiếu KNB
    for (const id of ['50613004', '50613001', '50601001', '50602001', '50612005']) items[id] = (items[id] || 0) + 20;
    items['39910003'] = (items['39910003'] || 0) + 5;
    return items;
}
let db;
try { db = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch { db = null; }
const NGUOI = MAU.nguoi || [];   // vi that tren server (uid, ten, game, points, ruong)
function goc(uid) {
    if (uid === 'test') return { name: 'Người chơi thử (tổng rương cả server)', points: 1000000, ichKy: { items: ruongMau() } };
    const p = NGUOI.find((x) => x.uid === uid); return p ? { name: p.ten + (p.game ? ' · ' + p.game : ''), points: p.points, ichKy: { items: { ...p.ruong } } } : null;
}
if (!db) { db = { _ichKyBan: MAU.ichKyBan, test: goc('test') }; for (const p of NGUOI) db[p.uid] = goc(p.uid); }
const luu = () => fs.writeFileSync(DBF, JSON.stringify(db, null, 1));
let UID = NGUOI.length ? NGUOI[0].uid : 'test';

// --- giá bán Rương Ích Kỷ: chép logic ichKyBanGia của index.js (bỏ qua công tắc bán, vẫn kẹp 90% giá shop)
const nameOf = new Map(MAU.items.map((x) => [x.id, x.n]));
function giaRuong(id) {
    const c = db._ichKyBan || {}; id = String(id);
    let gia = 0;
    if (c.rieng && c.rieng[id] !== undefined) gia = Number(c.rieng[id]) || 0;
    else if (/^506\d{5}$/.test(id) && c.nhom && c.nhom.ngoc6 && c.nhom.ngoc6.on) gia = c.nhom.ngoc6.gia;
    else if (/^3030[78]\d{3}$/.test(id) && /Yếu Quyết/i.test(nameOf.get(id) || '') && c.nhom && c.nhom.yq && c.nhom.yq.on) gia = c.nhom.yq.gia;
    const sp = MAU.shop.find((x) => x.id === id && !x.off && x.price > 0);
    if (sp) gia = Math.min(gia, Math.floor(sp.price * 0.9));
    return Math.max(0, gia);
}
const ichKy = {
    of: (u) => { if (!u.ichKy) u.ichKy = { items: {} }; if (!u.ichKy.items) u.ichKy.items = {}; return u.ichKy; },
    add: (u, id, n) => { const k = ichKy.of(u); k.items[id] = (Number(k.items[id]) || 0) + n; },
    take: (u, id, n) => { const k = ichKy.of(u), co = Number(k.items[id]) || 0; if (co < n) return false; if (co === n) delete k.items[id]; else k.items[id] = co - n; return true; },
};
const GN = require('../ghepngoc')({
    db: () => db, getUserData: (uid) => db[uid], updatePoints: (uid, n) => { db[uid].points = (db[uid].points || 0) + n; },
    saveDbNow: luu, logDog: () => {}, writeLog: (t, m) => console.log(`[${t}] ${m}`), debtBlock: () => null,
    icon: ITEMICON.icon, items: () => MAU.items, shop: () => MAU.shop, giaRuong, ichKy,
    dayStr: () => new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
});

if (!db._gnCfg) GN.saveCfg({ ...GN.MAC_DINH, on: true }, 'chạy thử');   // bản thử: bật sẵn
const ICON_CACHE = new Map();
function proxyIcon(file, res) {
    if (ICON_CACHE.has(file)) { const c = ICON_CACHE.get(file); res.writeHead(200, { 'Content-Type': c.t, 'Cache-Control': 'max-age=86400' }); return res.end(c.b); }
    https.get('https://play.netco4.click/itemicon/' + encodeURIComponent(file), (r) => {
        const parts = []; r.on('data', (x) => parts.push(x)); r.on('end', () => {
            if (r.statusCode !== 200) { res.writeHead(404); return res.end(); }
            const c = { t: r.headers['content-type'] || 'image/jpeg', b: Buffer.concat(parts) }; ICON_CACHE.set(file, c);
            res.writeHead(200, { 'Content-Type': c.t }); res.end(c.b);
        });
    }).on('error', () => { res.writeHead(502); res.end(); });
}

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ghép Ngọc - chạy thử</title><style>
:root{--bg:#12141a;--card:#1b1e27;--line:#2a2e3b;--tx:#e8eaf0;--muted:#8a90a3;--green:#3ddc84;--red:#ff5d5d;--blue:#4da3ff;--gold:#ffcf5c}
body{margin:0;background:var(--bg);color:var(--tx);font:14px system-ui,Segoe UI,Arial,sans-serif}main{max-width:1100px;margin:0 auto;padding:16px}
button{background:#232838;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}button:hover{border-color:var(--gold)}
input{background:#10131b;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}.muted{color:var(--muted)}
.row{display:flex}.note{background:#151826;border:1px solid #3a3f4b;border-radius:10px;padding:10px;font-size:13px;margin:6px 0}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;font-size:13px}
.mini-in{padding:3px 6px}.btn-green{background:#1f6f43}.btn-red{background:#7a2a2a}.btn-grey{background:#2a2f3d}
.vqIc{display:block;width:100%;height:100%;background-repeat:no-repeat}.vqIcS{display:block;width:40px;height:40px;flex:0 0 40px;border-radius:6px;background-repeat:no-repeat;border:1px solid #6b4a1a}.vqNo{font-style:normal;text-align:center;line-height:40px}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#232838;border:1px solid var(--gold);padding:10px 16px;border-radius:10px;opacity:0;transition:opacity .3s;z-index:9;max-width:90vw}#toast.err{border-color:var(--red)}
.tabs button.on{border-color:var(--gold)}
</style></head><body><main>
<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><h2 style="margin:0">💎 Ghép Ngọc <span class="muted" style="font-size:13px">chạy thử local</span></h2>
<span style="flex:1"></span><span>Ví: <b id="bal">-</b> KNB</span>
<span class="tabs"><button id="tP" class="on" onclick="tab('p')">🎮 Người chơi</button> <button id="tA" onclick="tab('a')">⚙️ Admin</button></span>
<select id="vai" onchange="api('/api/thu/vai',{uid:this.value}).then(function(j){toast(j.msg);gnSync()})"></select><button onclick="thu('reset')" title="Trả rương + ví người đang chọn về như ảnh chụp server (giữ cấu hình admin)">🔄 Rương thật</button><button onclick="thu('knb')">💰 +100k KNB</button></div>
<div class="card" id="pP"><div id="gnApp">Đang tải...</div></div>
<div class="card" id="pA" style="display:none"><div id="gnaApp">Đang tải...</div></div>
</main><div id="toast"></div>
<script>
function $(id){return document.getElementById(id)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function vnd(n){return Math.floor(n).toLocaleString("vi-VN")}
function toast(m){var t=$("toast");t.textContent=m;t.classList.toggle("err",/^(❌|⚠️|⛔)/.test(m));t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},4500)}
function setBal(v){$("bal").textContent=vnd(v)}
function api(p,b){return fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})}).then(function(r){return r.json()}).then(function(j){if(!j.ok)throw new Error(j.error||"lỗi");if(j.balance!==undefined)setBal(j.balance);return j})}
${'function vqIcon(ic,cls){if(!ic)return "<i class=\\""+(cls||"vqIc")+" vqNo\\">📦</i>";var sx=ic.w/64*100,sy=ic.h/64*100,px=ic.w>64?ic.x/(ic.w-64)*100:0,py=ic.h>64?ic.y/(ic.h-64)*100:0;return "<i class=\\""+(cls||"vqIc")+"\\" style=\\"background-image:url(/itemicon/"+encodeURIComponent(ic.f)+");background-size:"+sx+"% "+sy+"%;background-position:"+px.toFixed(3)+"% "+py.toFixed(3)+"%\\"></i>"}'}
${"function vqaIc(ic){if(!ic)return '<span style=\"display:inline-block;width:32px;height:32px;line-height:32px;text-align:center\">📦</span>';var sx=ic.w/64*100,sy=ic.h/64*100,px=ic.w>64?ic.x/(ic.w-64)*100:0,py=ic.h>64?ic.y/(ic.h-64)*100:0;return '<i style=\"display:inline-block;width:32px;height:32px;vertical-align:middle;border-radius:5px;background-repeat:no-repeat;background-image:url(/itemicon/'+encodeURIComponent(ic.f)+');background-size:'+sx+'% '+sy+'%;background-position:'+px.toFixed(3)+'% '+py.toFixed(3)+'%\"></i>';}"}
function tab(t){$("tP").classList.toggle("on",t==="p");$("tA").classList.toggle("on",t==="a");$("pP").style.display=t==="p"?"":"none";$("pA").style.display=t==="a"?"":"none";if(t==="p")gnSync();else gnaLoad()}
function thu(a){api("/api/thu/"+a,{}).then(function(j){toast(j.msg);gnSync()}).catch(function(e){toast("❌ "+e.message)})}
function dsVai(){api('/api/thu/ds',{}).then(function(j){$("vai").innerHTML=j.ds.map(function(x){return '<option value="'+x.uid+'"'+(x.uid===j.uid?' selected':'')+'>👤 '+esc(x.ten)+'</option>'}).join('');$("vai").title='Ảnh chụp server lúc '+new Date(j.tao).toLocaleString('vi-VN')})}
</script><script src="/gn.js"></script><script src="/gn-admin.js"></script><script>dsVai();gnSync()</script></body></html>`;

function body(req) { return new Promise((ok) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); }); }
const send = (res, code, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length }); res.end(b); };
http.createServer(async (req, res) => {
    const p = req.url.split('?')[0];
    try {
        if (req.method === 'GET' && p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(PAGE); }
        if (req.method === 'GET' && (p === '/gn.js' || p === '/gn-admin.js')) {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end(fs.readFileSync(path.join(__dirname, '..', p === '/gn.js' ? 'ghepngoc.client.js' : 'ghepngoc.admin.js')));
        }
        if (req.method === 'GET' && p.startsWith('/itemicon/')) return proxyIcon(decodeURIComponent(p.slice(10)), res);
        if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
        const b = await body(req);
        let r;
        if (p === '/api/gn/state') r = GN.state(UID);
        else if (p === '/api/gn/quay') r = GN.quay(UID, b, 'thử');
        else if (p === '/api/gn/cfg') r = GN.adminState();
        else if (p === '/api/gn/save') r = GN.saveCfg(b, 'admin thử');
        else if (p === '/api/gn/tim') r = { items: GN.tim(b.q) };
        else if (p === '/api/thu/reset') { db[UID] = goc(UID); luu(); r = { msg: '🔄 Đã trả rương + ví của ' + db[UID].name + ' về như server thật' }; }
        else if (p === '/api/thu/ds') r = { ds: [...NGUOI.map((x) => ({ uid: x.uid, ten: db[x.uid] ? db[x.uid].name : x.ten })), { uid: 'test', ten: db.test.name }], uid: UID, tao: MAU.tao };
        else if (p === '/api/thu/vai') { if (!db[String(b.uid)]) return send(res, 400, { ok: false, error: 'không có người này' }); UID = String(b.uid); r = { msg: '👤 Đang đóng vai ' + db[UID].name }; }
        else if (p === '/api/thu/knb') { db[UID].points += 100000; luu(); r = { msg: '💰 +100.000 KNB' }; }
        else return send(res, 404, { ok: false, error: 'không có API này' });
        if (r && r.error) return send(res, 400, { ok: false, error: r.error });
        return send(res, 200, { ok: true, balance: db[UID].points, ...r });
    } catch (e) { console.error(e); return send(res, 500, { ok: false, error: e.message }); }
}).listen(PORT, () => console.log(`💎 Ghép Ngọc chạy thử: http://localhost:${PORT}`));
