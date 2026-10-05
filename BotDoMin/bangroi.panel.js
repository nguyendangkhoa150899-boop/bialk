// 📊 05/10: BẢNG RƠI + ĐỀ XUẤT FARM cho portal admin/mod (tab "br"). Phục vụ ở /br.js, đọc lại mỗi lần tải -> sửa không cần restart.
// Dữ liệu: /br-data.json = data.json của tools/bang-roi (repo game), panel thêm icon (ic) cho từng món.
// Công thức giống https://netco4.click/: X = Mv / BV × 2 × giảm rơi (chỉ khi quái cao hơn nhân vật); mỗi người tự roll.
(function () {
  var D = null, ST = { tab: 'farm', q: '', plv: 89, speed: 6, isort: 'gop', iboss: false, mboss: true, shown: 30 };
  try { var sv = JSON.parse(localStorage.getItem('br_cfg') || '{}'); if (sv.plv) ST.plv = sv.plv; if (sv.speed) ST.speed = sv.speed; if (sv.tab) ST.tab = sv.tab; } catch (e) {}
  var css = [
    '#brApp{--brA:#5865f2;--brG:#23a55a;--brY:#f0b132}',
    '#brApp .brTop{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '#brApp .brSeg{display:inline-flex;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:3px;gap:3px}',
    '#brApp .brSeg button{background:transparent;color:var(--mut);padding:8px 14px;border-radius:8px;font-size:14px}',
    '#brApp .brSeg button.on{background:var(--brA);color:#fff}',
    '#brApp .brBuilt{margin-left:auto;font-size:12px;color:var(--mut)}#brApp .brBuilt a{color:#9aa8ff;text-decoration:none}#brApp .brBuilt a:hover{text-decoration:underline}',
    '#brApp .brCtl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}',
    '#brApp .brCtl input[type=search]{flex:1;min-width:220px;margin:0}',
    '#brApp .brCtl label{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--mut);white-space:nowrap}',
    '#brApp .brCtl label input{width:70px;margin:0;padding:8px}',
    '#brApp .brCtl label input[type=checkbox]{width:auto}',
    '#brApp .brCtl select{width:auto;margin:0;padding:8px 10px}',
    '#brApp .brChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
    '#brApp .brChips button{display:flex;align-items:center;gap:6px;background:var(--card2);border:1px solid var(--line);color:var(--txt);padding:5px 12px 5px 6px;border-radius:999px;font-size:13px;font-weight:600}',
    '#brApp .brChips button:hover{border-color:var(--brA)}#brApp .brChips button.on{background:var(--brA);border-color:var(--brA);color:#fff}',
    '#brApp .brIc{display:inline-block;width:26px;height:26px;flex:0 0 26px;border-radius:6px;background-repeat:no-repeat;background-color:#1a1b1e;border:1px solid #6b4a1a;vertical-align:middle}',
    '#brApp .brIc.no{display:inline-flex;align-items:center;justify-content:center;font-size:14px;border-color:var(--line)}',
    '#brApp .brIc.s{width:20px;height:20px;flex:0 0 20px;border-radius:4px}',
    '#brApp .brHint{margin-top:14px;padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--mut);font-size:14px;text-align:center}',
    '#brApp .brBest{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px}',
    '#brApp .brTile{background:linear-gradient(180deg,#26324a,#232428);border:1px solid #3b4a6b;border-radius:12px;padding:12px 14px}',
    '#brApp .brTile .k{font-size:12px;color:var(--mut);font-weight:700;letter-spacing:.3px}',
    '#brApp .brTile .n{font-size:16px;font-weight:800;margin-top:4px;line-height:1.3}',
    '#brApp .brTile .v{font-size:24px;font-weight:900;color:var(--brY);margin-top:4px}#brApp .brTile .v small{font-size:13px;color:var(--mut);font-weight:600}',
    '#brApp .brTile .s{font-size:12px;color:var(--mut);margin-top:2px}',
    '#brApp .brSec{display:flex;align-items:baseline;gap:8px;margin:18px 0 8px;font-size:15px;font-weight:800}#brApp .brSec small{font-size:12px;color:var(--mut);font-weight:500}',
    '#brApp .brRow{display:grid;grid-template-columns:34px 92px 1fr;gap:10px;align-items:center;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin-bottom:6px}',
    '#brApp .brRow .rk{font-weight:900;color:var(--mut);font-size:15px}#brApp .brRow .rk.t1{color:var(--brY)}#brApp .brRow .rk.t2{color:#c0c4cc}#brApp .brRow .rk.t3{color:#cd8a52}',
    '#brApp .brRow .val{font-weight:900;font-size:16px;color:var(--brG);line-height:1.15}#brApp .brRow .val small{display:block;font-size:11px;color:var(--mut);font-weight:600}',
    '#brApp .brRow .bar{height:4px;border-radius:3px;background:#1a1b1e;margin-top:5px;overflow:hidden}#brApp .brRow .bar i{display:block;height:100%;background:var(--brG)}',
    '#brApp .brRow .who{min-width:0}#brApp .brRow .who b{font-size:14px}#brApp .brRow .who .sub{font-size:12px;color:var(--mut);margin-top:2px}',
    '#brApp .tag{display:inline-block;font-size:10px;font-weight:800;padding:1px 6px;border-radius:5px;margin-left:5px;vertical-align:1px}',
    '#brApp .tag.boss{background:#3d2f12;color:var(--brY);border:1px solid #6b5420}#brApp .tag.lv{background:#1a1b1e;color:var(--mut);border:1px solid var(--line)}#brApp .tag.id{background:transparent;color:#6d7380;padding:0 2px}',
    '#brApp .brIts{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}',
    '#brApp .brIts span{display:inline-flex;align-items:center;gap:5px;background:#1a1b1e;border:1px solid var(--line);border-radius:999px;padding:2px 9px 2px 3px;font-size:12px;white-space:nowrap}',
    '#brApp .brIts span b{color:var(--brG)}',
    '#brApp .brMore{display:block;width:100%;margin-top:6px;background:var(--card2);border:1px solid var(--line);color:var(--txt)}',
    '#brApp .brNote{margin-top:12px;font-size:12px;color:var(--mut);line-height:1.5}',
    '@media(max-width:620px){#brApp .brRow{grid-template-columns:26px 76px 1fr}#brApp .brSeg button{padding:7px 9px;font-size:13px}}'
  ].join('');
  var PRESET = [['Ngọc 6', '50601001-50614001', '50602001'], ['Phục Hi Ngọc', 'phục hi ngọc'], ['Nguyên Bảo Phiếu', 'nguyên bảo phiếu', '39910001'], ['Chí Tôn Cường Hóa', 'chí tôn cường hóa'], ['Long Hồn Ngọc', 'long hồn ngọc'],
    ['Tử Vi Linh Phách', 'tử vi linh phách'], ['Công Lực Đan', 'công lực đan'], ['Hợp Thành Phù', 'hợp thành phù'], ['Miên Bố / Bí Ngân 8', '20501008, 20502008', '20501008'], ['Cửu Thiên Ngọc Toái', 'cửu thiên ngọc toái']];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fold = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase(); };
  var mapName = [], mapKind = [];
  function itemName(id) { var it = D.items[id]; if (!it) return '#' + id; return it[1] === 'e' ? 'Trang bị cấp ' + it[2] + ' · ' + it[0] : it[0]; }
  function icon(id, s) { var ic = D.ic && D.ic[id]; if (!ic) return '<i class="brIc no' + (s ? ' s' : '') + '">📦</i>'; var sx = ic.w / 64 * 100, sy = ic.h / 64 * 100, px = ic.w > 64 ? ic.x / (ic.w - 64) * 100 : 0, py = ic.h > 64 ? ic.y / (ic.h - 64) * 100 : 0; return '<i class="brIc' + (s ? ' s' : '') + '" style="background-image:url(/itemicon/' + encodeURIComponent(ic.f) + ');background-size:' + sx + '% ' + sy + '%;background-position:' + px.toFixed(3) + '% ' + py.toFixed(3) + '%"></i>'; }
  function att(mlv) { if (mlv <= ST.plv) return 1; var d = Math.max(-200, Math.min(200, mlv - ST.plv)); var r = D.att[String(d)]; return r === undefined ? 1 : r; }
  function boxX(m, b) { var bx = D.boxes[b]; if (!bx || !bx[0]) return 0; return m[3] / bx[0] * D.dropParam * att(m[2]); }
  function pct(x) { if (x >= 1) return x >= 1.05 ? x.toFixed(x >= 10 ? 0 : 1) + ' món' : '100%'; var p = x * 100; return (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p >= 0.1 ? p.toFixed(2) : '<0.1') + '%'; }
  function so(x) { return x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3); }
  function gio(s) { return !s ? '' : s >= 3600 ? 'hồi ' + (s / 3600).toFixed(s % 3600 ? 1 : 0) + ' giờ' : s >= 60 ? 'hồi ' + Math.round(s / 60) + ' phút' : 'hồi ' + s + ' giây'; }
  function dieuKien(s) {
    var raw = String(s || '').trim(); if (!raw) return [];
    var parts = raw.split(/[,;|+\n]+/); if (parts.length === 1 && /^[\d\s-]+$/.test(raw)) parts = raw.split(/\s+/);
    return parts.map(function (p) { p = p.trim(); if (!p) return null; var r = p.match(/^(\d+)\s*-\s*(\d+)$/); if (r) { var a = +r[1], b = +r[2]; return { lo: Math.min(a, b), hi: Math.max(a, b) }; } if (/^\d+$/.test(p)) return { lo: +p, hi: +p }; return { t: fold(p) }; }).filter(Boolean);
  }
  function khopId(dk, id) { id = +id; return dk.some(function (d) { return d.lo !== undefined && id >= d.lo && id <= d.hi; }); }
  function timMon(dk) { var hit = {}; Object.keys(D.items).forEach(function (id) { var n = fold(itemName(id)); if (khopId(dk, id) || dk.some(function (d) { return d.t && d.t.length >= 2 && n.indexOf(d.t) >= 0; })) hit[id] = 1; }); return hit; }
  function perMon(m, hit) { var ds = {}; m[4].forEach(function (b) { var bx = D.boxes[b]; var n = bx[1].length; if (!n) return; var x = boxX(m, b); bx[1].forEach(function (i) { if (!hit || hit[i]) ds[i] = (ds[i] || 0) + x / n; }); }); m[5].forEach(function (s) { if (s[4] && (!hit || hit[s[4][0]])) ds[s[4][0]] = Math.max(ds[s[4][0]] || 0, s[4][1] / 100); }); return ds; }
  var tong = function (ds) { var e = 0; for (var i in ds) e += ds[i]; return e; };
  var noiCua = function (m) { var o = []; m[5].forEach(function (s) { if (o.indexOf(mapName[s[0]]) < 0) o.push(mapName[s[0]]); }); return o; };
  var tenQ = function (m) { return '<b>' + esc(m[1]) + '</b><span class="tag lv">cấp ' + m[2] + '</span>' + (m[6] ? '<span class="tag boss">BOSS</span>' : '') + '<span class="tag id">#' + m[0] + '</span>'; };
  var chipsMon = function (ds, n) { return '<div class="brIts">' + Object.keys(ds).sort(function (a, b) { return ds[b] - ds[a]; }).slice(0, n || 6).map(function (i) { return '<span>' + icon(i, 1) + esc(itemName(i)) + ' <b>' + pct(ds[i]) + '</b></span>'; }).join('') + '</div>'; };
  function dong(k, v, sub, w, who) { return '<div class="brRow"><div class="rk' + (k <= 3 ? ' t' + k : '') + '">#' + k + '</div><div class="val">' + v + '<small>' + sub + '</small>' + (w >= 0 ? '<div class="bar"><i style="width:' + Math.max(2, Math.min(100, w * 100)).toFixed(0) + '%"></i></div>' : '') + '</div><div class="who">' + who + '</div></div>'; }

  // ===== 🎯 MUỐN FARM GÌ? =====
  function farm() {
    var dk = dieuKien(ST.q); if (!dk.length) return '<div class="brHint">👆 Bấm 1 món ở trên, hoặc gõ tên / ID (nhiều món cách bằng dấu phẩy, dải ID kiểu <b>50602001-50602008</b>).<br>Trang xếp hạng nên đi phó bản nào, đánh boss nào, farm bản đồ nào - tính cho <b>mỗi người</b> ở cấp đang chọn.</div>';
    var hit = timMon(dk), nHit = Object.keys(hit).length; if (!nHit) return '<div class="brHint">Không có món nào khớp "' + esc(ST.q) + '".</div>';
    var speed = Math.max(1, ST.speed) * 60, bd = {}, pb = {}, boss = [];
    D.mons.forEach(function (m) {
      var ds = perMon(m, hit), e = tong(ds); if (e < 0.0005) return;
      if (m[6]) { var rs = 0; m[5].forEach(function (s) { if (mapKind[s[0]] === 'map' && s[2] > 0) rs = rs ? Math.min(rs, s[2]) : s[2]; }); boss.push({ m: m, e: e, ds: ds, rs: rs, noi: noiCua(m) }); }
      m[5].forEach(function (s) {
        var k = mapKind[s[0]], pts = Math.max(1, s[1] || 0);
        if (k === 'map') { if (m[6] || !(s[2] > 0)) return; var r = pts * 3600 / s[2]; var a = bd[s[0]] = bd[s[0]] || { i: s[0], rate: 0, w: 0, mons: [] }; a.rate += r; a.w += e * r; a.mons.push({ m: m, e: e }); }
        else { var b = pb[s[0]] = pb[s[0]] || { i: s[0], mons: [] }; b.mons.push({ m: m, e: e, pts: pts }); }
      });
    });
    // cùng tên quái nhiều BẬC CẤP: mỗi lượt chỉ gặp 1 bậc -> giữ bậc gần cấp nhân vật nhất
    var gan = function (lv) { return Math.abs(lv - ST.plv); };
    var chon = function (ds, khoa) { var g = {}; ds.forEach(function (x) { var k = khoa(x), c = g[k]; if (!c || gan(x.m[2]) < gan(c.m[2]) || (gan(x.m[2]) === gan(c.m[2]) && x.m[2] < c.m[2])) g[k] = x; }); return Object.values(g); };
    var pbL = Object.values(pb).map(function (b) { b.mons = chon(b.mons, function (x) { return fold(x.m[1]); }); b.v = 0; b.mons.forEach(function (x) { b.v += x.e * x.pts; }); return b; }).sort(function (a, b) { return b.v - a.v; });
    boss = chon(boss, function (b) { return fold(b.m[1]) + '|' + (b.noi[0] || ''); }).sort(function (a, b) { return b.e - a.e || (a.rs || 1e9) - (b.rs || 1e9); });
    var bdL = Object.values(bd).map(function (a) { a.kh = Math.min(a.rate, speed); a.v = a.w / a.rate * a.kh; return a; }).sort(function (a, b) { return b.v - a.v; });
    var N = ST.shown > 30 ? 40 : 10;
    var top3 = function (ms) { return ms.slice().sort(function (a, b) { return b.e - a.e; }).slice(0, 3).map(function (x) { return esc(x.m[1]) + ' <b style="color:var(--brG)">' + so(x.e) + '</b>/con'; }).join(' · '); };
    var tile = function (k, n, v, dv, s) { return '<div class="brTile"><div class="k">' + k + '</div><div class="n">' + n + '</div><div class="v">' + v + ' <small>' + dv + '</small></div><div class="s">' + s + '</div></div>'; };
    var h = '<div class="brBest">';
    if (pbL[0]) h += tile('🏰 PHÓ BẢN NÊN ĐI', esc(mapName[pbL[0].i]), so(pbL[0].v), 'món / lượt', top3(pbL[0].mons));
    if (boss[0]) h += tile('⚔️ BOSS NÊN ĐÁNH', esc(boss[0].m[1]) + ' <span class="tag lv">cấp ' + boss[0].m[2] + '</span>', so(boss[0].e), 'món / lần hạ', esc(boss[0].noi.slice(0, 2).join(', ') || 'gọi bằng script') + (boss[0].rs ? ' · ' + gio(boss[0].rs) : ''));
    if (bdL[0]) h += tile('🗺️ FARM BẢN ĐỒ', esc(mapName[bdL[0].i]), so(bdL[0].v), 'món / giờ', top3(bdL[0].mons));
    h += '</div>';
    var maxV = function (L) { return L.length ? L[0].v || L[0].e : 1; };
    if (pbL.length) { var mp = maxV(pbL); h += '<div class="brSec">🏰 Phó bản / hoạt động <small>mỗi lượt, cộng mọi con trong lượt · chưa tính giới hạn lượt/ngày</small></div>'; pbL.slice(0, N).forEach(function (a, k) { h += dong(k + 1, so(a.v), 'mỗi lượt', a.v / mp, '<b>' + esc(mapName[a.i]) + '</b><div class="sub">' + top3(a.mons) + '</div>'); }); }
    if (boss.length) { var mb = maxV(boss); h += '<div class="brSec">⚔️ Boss <small>mỗi lần hạ, mỗi người</small></div>'; boss.slice(0, N).forEach(function (b, k) { h += dong(k + 1, so(b.e), b.rs ? gio(b.rs) : 'mỗi lần hạ', b.e / mb, tenQ(b.m) + '<div class="sub">' + esc(b.noi.slice(0, 2).join(', ') || 'gọi bằng script') + '</div>' + chipsMon(b.ds, 4)); }); }
    if (bdL.length) { var mm = maxV(bdL); h += '<div class="brSec">🗺️ Farm bản đồ <small>ước tính mỗi giờ · đánh tối đa ' + ST.speed + ' con/phút</small></div>'; bdL.slice(0, N).forEach(function (a, k) { h += dong(k + 1, so(a.v), 'mỗi giờ · ' + Math.round(a.kh) + ' con', a.v / mm, '<b>' + esc(mapName[a.i]) + '</b><div class="sub">' + top3(a.mons) + '</div>'); }); }
    if (!pbL.length && !boss.length && !bdL.length) h += '<div class="brHint">Không quái nào rơi món này từ bảng rơi.</div>';
    if (Math.max(pbL.length, boss.length, bdL.length) > N && N === 10) h += '<button class="brMore" onclick="brMore()">Xem thêm (top 40 mỗi nhóm)</button>';
    return '<div class="brNote" style="margin-top:6px">Khớp <b>' + nHit + '</b> món · ' + pbL.length + ' phó bản · ' + boss.length + ' boss · ' + bdL.length + ' bản đồ</div>' + h
      + '<div class="brNote">Số là trung bình <b>mỗi người</b> (mỗi thành viên tổ tự roll). Phó bản: mỗi boss chỉ tính bậc gần cấp nhân vật nhất. Bản đồ: giả định đánh con vừa hồi sinh, không tính đi đường. Quân cờ Kỳ Cuộc rơi thêm ngọc 6 qua script (4%) chưa tính.</div>';
  }
  // ===== 🔎 TRA VẬT PHẨM =====
  function item() {
    var dk = dieuKien(ST.q); if (!dk.length) return '<div class="brHint">Gõ tên hoặc ID vật phẩm. Nhiều món: <b>50602001, 50613004, phục hi</b> · dải ID: <b>50602001-50602008</b>.</div>';
    var hit = timMon(dk), nHit = Object.keys(hit).length; if (!nHit) return '<div class="brHint">Không có món nào khớp.</div>';
    var rows = [];
    D.mons.forEach(function (m) { if (ST.iboss && !m[6]) return; var ds = perMon(m, hit); var ks = Object.keys(ds).filter(function (i) { return ds[i] >= 0.0001; }); if (!ks.length) return;
      if (ST.isort === 'mon') ks.forEach(function (i) { var o = {}; o[i] = ds[i]; rows.push({ v: ds[i], m: m, ds: o }); }); else rows.push({ v: tong(ds), m: m, ds: ds }); });
    var hoa = function (a, b) { return (b.m[6] - a.m[6]) || (a.m[2] - b.m[2]) || (a.m[0] - b.m[0]); };
    rows.sort(ST.isort === 'lv' ? function (a, b) { return (a.m[2] - b.m[2]) || (b.v - a.v); } : ST.isort === 'lvd' ? function (a, b) { return (b.m[2] - a.m[2]) || (b.v - a.v); } : function (a, b) { return (b.v - a.v) || hoa(a, b); });
    var mx = rows.length ? Math.max.apply(null, rows.map(function (r) { return r.v; })) : 1;
    var h = '<div class="brNote" style="margin-top:6px">Khớp <b>' + nHit + '</b> món · <b>' + rows.length + '</b> ' + (ST.isort === 'mon' ? 'nguồn rơi' : 'con quái') + ' · ' + (ST.isort === 'mon' ? 'tỉ lệ ra đúng món đó' : 'tỉ lệ ra <b>bất kỳ</b> món nào trong danh sách') + ', mỗi người khi hạ 1 con</div>';
    rows.slice(0, ST.shown).forEach(function (r, k) { h += dong(k + 1, pct(r.v), r.m[6] ? 'boss' : 'quái', r.v / mx, tenQ(r.m) + '<div class="sub">' + esc(noiCua(r.m).slice(0, 2).join(', ') || 'gọi bằng script') + '</div>' + chipsMon(r.ds, 8)); });
    if (!rows.length) h += '<div class="brHint">Không quái nào rơi món này' + (ST.iboss ? ' (đang bật Chỉ boss)' : '') + '.</div>';
    if (rows.length > ST.shown) h += '<button class="brMore" onclick="brMore()">Xem thêm (' + (rows.length - ST.shown) + ' nữa)</button>';
    return h;
  }
  // ===== 👹 TRA QUÁI / BOSS =====
  function quai() {
    var dk = dieuKien(ST.q), ds = D.mons.filter(function (m) { if (ST.mboss && !m[6]) return false; if (!m[4].length && !m[5].some(function (s) { return s[4]; })) return false; return !dk.length || khopId(dk, m[0]) || dk.some(function (d) { return d.t && m.key.indexOf(d.t) >= 0; }); });
    ds.forEach(function (m) { m._ds = perMon(m, null); m._e = tong(m._ds); }); ds.sort(function (a, b) { return b._e - a._e; });
    var h = '<div class="brNote" style="margin-top:6px"><b>' + ds.length + '</b> con · trung bình số món rơi mỗi người khi hạ 1 con</div>';
    ds.slice(0, ST.shown).forEach(function (m, k) { h += dong(k + 1, so(m._e), 'món / con', -1, tenQ(m) + '<div class="sub">' + esc(noiCua(m).slice(0, 3).join(', ') || 'gọi bằng script') + '</div>' + chipsMon(m._ds, 10)); });
    if (ds.length > ST.shown) h += '<button class="brMore" onclick="brMore()">Xem thêm (' + (ds.length - ST.shown) + ' nữa)</button>';
    return h;
  }
  function luu() { try { localStorage.setItem('br_cfg', JSON.stringify({ plv: ST.plv, speed: ST.speed, tab: ST.tab })); } catch (e) {} }
  function ve() {
    var el = $('brApp'); if (!el || !D) return;
    var sx = window.scrollY;
    var seg = [['farm', '🎯 Muốn farm gì?'], ['item', '🔎 Tra vật phẩm'], ['quai', '👹 Tra quái / boss']].map(function (t) { return '<button class="' + (ST.tab === t[0] ? 'on' : '') + '" onclick="brTab(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('');
    var ph = ST.tab === 'quai' ? 'Tên quái, ID, bản đồ… (nhiều: 3720, 1851-1859)' : ST.tab === 'farm' ? 'Muốn farm gì? Tên / ID (nhiều: 50602001-50602008, phục hi)' : 'Tên / ID vật phẩm… (nhiều: 50602001, 50613004)';
    var ctl = '<input type="search" id="brQ" placeholder="' + ph + '" value="' + esc(ST.q) + '" oninput="brQ(this.value)"><label>Cấp nhân vật <input type="number" min="1" max="150" value="' + ST.plv + '" onchange="brSet(\'plv\',this.value)"></label>';
    if (ST.tab === 'farm') ctl += '<label title="Không thể đánh nhanh hơn số này dù quái hồi sinh nhanh">Tốc độ đánh <input type="number" min="1" max="60" value="' + ST.speed + '" onchange="brSet(\'speed\',this.value)"> con/phút</label>';
    if (ST.tab === 'item') ctl += '<select onchange="brSet(\'isort\',this.value)">' + [['gop', 'Gộp theo quái (tổng tỉ lệ)'], ['mon', 'Từng món (tỉ lệ cao nhất)'], ['lv', 'Cấp quái thấp → cao'], ['lvd', 'Cấp quái cao → thấp']].map(function (o) { return '<option value="' + o[0] + '"' + (ST.isort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><label><input type="checkbox"' + (ST.iboss ? ' checked' : '') + ' onchange="brSet(\'iboss\',this.checked)"> Chỉ boss</label>';
    if (ST.tab === 'quai') ctl += '<label><input type="checkbox"' + (ST.mboss ? ' checked' : '') + ' onchange="brSet(\'mboss\',this.checked)"> Chỉ boss</label>';
    var chips = ST.tab === 'quai' ? '' : '<div class="brChips">' + PRESET.map(function (p, i) { return '<button class="' + (ST.q === p[1] ? 'on' : '') + '" onclick="brPick(' + i + ')">' + icon(p[2] || '', 1) + esc(p[0]) + '</button>'; }).join('') + '</div>';
    var body = ST.tab === 'farm' ? farm() : ST.tab === 'item' ? item() : quai();
    el.innerHTML = '<div class="brTop"><div class="brSeg">' + seg + '</div><div class="brBuilt">Dữ liệu bảng rơi: ' + esc(new Date(D.built).toLocaleString('vi-VN')) + ' · <a href="https://netco4.click/" target="_blank" rel="noopener">netco4.click ↗</a></div></div><div class="brCtl">' + ctl + '</div>' + chips + body;
    if (window.scrollY !== sx) window.scrollTo(window.scrollX, sx);
  }
  // icon cho nút gợi ý không có ID cụ thể: lấy món đầu tiên khớp tên
  function iconPreset() { PRESET.forEach(function (p) { if (p[2]) return; var t = fold(p[1]); var id = Object.keys(D.items).find(function (i) { return fold(D.items[i][0]).indexOf(t) >= 0; }); p[2] = id || ''; }); }
  var hen;
  window.brQ = function (v) { clearTimeout(hen); hen = setTimeout(function () { ST.q = v; ST.shown = 30; ve(); var i = $('brQ'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 200); };
  window.brPick = function (i) { ST.q = ST.q === PRESET[i][1] ? '' : PRESET[i][1]; ST.shown = 30; ve(); };
  window.brTab = function (t) { if (t === 'quai' || ST.tab === 'quai') ST.q = ''; ST.tab = t; ST.shown = 30; luu(); ve(); };   // ô tìm của tab quái (tên quái) khác 2 tab kia (tên món)
  window.brMore = function () { ST.shown += 30; ve(); };
  window.brSet = function (k, v) { if (k === 'plv') v = Math.max(1, Math.min(150, parseInt(v, 10) || 89)); if (k === 'speed') v = Math.max(1, Math.min(60, parseInt(v, 10) || 6)); ST[k] = v; ST.shown = 30; luu(); ve(); };
  // 05/10: F5 đứng ở tab Bảng rơi - panel khôi phục tab TRƯỚC khi file này tải xong -> tự tải
  setTimeout(function () { var b = document.getElementById('tab-br'); if (b && !b.classList.contains('hidden')) window.brLoad(); }, 0);
  window.brLoad = function () {
    var el = $('brApp'); if (!el) return;
    if (!document.getElementById('brCss')) { var s = document.createElement('style'); s.id = 'brCss'; s.textContent = css; document.head.appendChild(s); }
    if (D) return ve();
    el.innerHTML = '<div class="muted">Đang tải bảng rơi…</div>';
    fetch('/br-data.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
      D = j; mapName = D.maps.map(function (m) { return m[0]; }); mapKind = D.maps.map(function (m) { return m[1]; });
      D.mons.forEach(function (m) { m.key = fold(m[1] + ' ' + m[0] + ' ' + m[5].map(function (s) { return mapName[s[0]]; }).join(' ')); });
      iconPreset(); ve();
    }).catch(function (e) { el.innerHTML = '<div class="brHint">❌ Không tải được bảng rơi: ' + esc(e.message) + '</div>'; });
  };
})();
