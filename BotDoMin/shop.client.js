// 🛒 07/10: giao dien SHOP ITEM kieu Thuong Pho / Ruong Ich Ky - phuc vu o /sh.js, doc lai moi lan tai -> sua khong can restart bot.
// CHI doi phan VE: ghi de isRender() cua trang choi. Luat + tien giu nguyen code cu cua webplay.js:
//   isBuy(id,btn,vaoRuong) doc so luong o o #isq_<id> (o so luong cua khung mua), kiem han ngay / nhom / hang gioi han / ⭐ 1 lan,
//   hoi gConfirm, goi /api/itemshop/buy, xong goi isSync() -> isRender() (ban nay).
// Dung chung: IS, ISG, ISBUSY, isOnceCat, isOnceBought, ikDuoc, isGrpQ, isGrpLeft, isDayLeft, isImpLeft, isDayLine, isImg,
//   isCatGet, vqIcon, esc, vnd, toast, pbOpen. Trang thai: localStorage is_cat (nhom, dung chung ban cu), sh_sx (sap xep), sh_sel (mon dang chon).
(function () {
  var css = [
    '@media(min-width:900px){body.shWide{max-width:1180px}}',
    '#pageShop>.card>*:not(#shRoot){display:none!important}',   // an bo cu (#isCats/#isList... van con de code cu khong loi)
    '#shRoot .shHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '#shRoot .shChip{font-size:12px;padding:3px 10px;border-radius:999px;background:#151826;border:1px solid #2a3340;color:var(--muted);white-space:nowrap}',
    '#shRoot .shChip b{color:#ffd76a}#shRoot .shChip.ok{background:#13261b;border-color:#2f6b46;color:#7ee2a8}#shRoot .shChip.no{background:#2a1416;border-color:#7a3434;color:#ffb4b4}',
    '#shRoot .shHead .r{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}',
    '#shRoot .shBar{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center}',
    '#shRoot .shBar input,#shRoot .shBar select{margin:0;background:#11141e;border:1px solid #2a3340;color:var(--tx);border-radius:9px;padding:8px 10px;font-size:13px}',
    '#shRoot .shBar input{flex:1;min-width:160px}#shRoot .shBar select{width:auto}',
    '#shRoot .shTabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    '#shRoot .shTab{width:auto;margin:0;background:#151826;border:1px solid #2a3340;color:var(--tx);border-radius:999px;padding:6px 11px;font-size:12px;font-weight:800}',
    '#shRoot .shTab span{opacity:.7;margin-left:3px}#shRoot .shTab.on{background:#3a2a0c;border-color:#f5c542;color:#ffd76a}',
    '#shRoot .shTwo{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}',
    '@media(min-width:900px){#shRoot .shTwo{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr)}#shRoot .shBuy{position:sticky;top:10px;align-self:start}}',
    '#shRoot .shBag{border:1px solid #6b5420;border-radius:13px;padding:10px;background:linear-gradient(180deg,#1f1a10,#141824 60%);min-width:0}',
    '#shRoot .shGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px}',
    '#shRoot .shSub{grid-column:1/-1;font-size:12px;font-weight:800;color:#c9a95a;padding:6px 2px 2px;border-bottom:1px dashed #3b3220}',
    '#shRoot .shIt{position:relative;width:auto;margin:0;display:flex;align-items:center;gap:8px;text-align:left;padding:7px 8px;border-radius:11px;background:#10131b;border:1px solid #2a3040;color:var(--tx);cursor:pointer;min-width:0}',
    '#shRoot .shIt:hover{border-color:#f5c542}#shRoot .shIt.sel{border-color:#5ef0a0;box-shadow:0 0 0 1px #5ef0a0 inset;background:#10201a}',
    '#shRoot .shIt.gold{border-color:#a8862a}#shRoot .shIt.pur{border-color:#7b54b8}#shRoot .shIt.het{opacity:.5}',
    '#shRoot .shIt .shIc{display:block;width:42px;height:42px;flex:0 0 42px;border-radius:8px;background-repeat:no-repeat;border:1px solid #6b4a1a}',
    '#shRoot .shIt .shIc.vqNo,#shRoot .shBig .shIc.vqNo{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:22px;background:#1a1f2d}',
    '#shRoot .shIt img,#shRoot .shBig img{width:42px;height:42px;flex:0 0 42px;border-radius:8px;object-fit:cover}',
    '#shRoot .shIt .isPh{width:42px;height:42px;flex:0 0 42px;display:flex;align-items:center;justify-content:center;font-size:22px;border-radius:8px;background:#1a1f2d}',
    '#shRoot .shIt .m{flex:1;min-width:0}#shRoot .shIt .n{font-size:12.5px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '#shRoot .shIt .p{font-size:12px;font-weight:900;color:#ffd76a;margin-top:2px}',
    '#shRoot .shIt .tag{position:absolute;top:-6px;right:6px;font-size:10px;font-weight:900;padding:1px 6px;border-radius:999px;background:#3a2a0c;border:1px solid #c9a227;color:#ffd76a}',
    '#shRoot .shIt .tag.lim{background:#3a1410;border-color:#c0532b;color:#ffb070}#shRoot .shIt .tag.het{background:#2a1416;border-color:#7a3434;color:#ffb4b4}',
    '#shRoot .shEmpty{grid-column:1/-1;padding:22px 8px;border:1px dashed #2a3340;border-radius:10px;text-align:center;color:var(--muted);font-size:13px}',
    '#shRoot .shBuy{border:1px solid #2f6b46;border-radius:13px;padding:12px;background:linear-gradient(180deg,#10201a,#141824 60%);min-width:0}',
    '#shRoot .shBuyT{font-weight:900;color:#7ee2a8;margin-bottom:8px}',
    '#shRoot .shBig{display:flex;gap:10px;align-items:center}',
    '#shRoot .shBig .shIc,#shRoot .shBig img,#shRoot .shBig .isPh{width:64px;height:64px;flex:0 0 64px;border-radius:12px}',
    '#shRoot .shBig .shIc{display:block;background-repeat:no-repeat;border:1px solid #6b4a1a}',
    '#shRoot .shBig .n{font-size:16px;font-weight:900;line-height:1.3}#shRoot .shBig .p{font-size:14px;font-weight:900;color:#ffd76a;margin-top:3px}',
    '#shRoot .shBig .id{font-size:11px;color:var(--muted)}',
    '#shRoot .shNote{font-size:12.5px;color:#cfd6e4;margin-top:8px;line-height:1.5;background:#11141b;border:1px solid #232838;border-radius:10px;padding:8px 10px}',
    '#shRoot .shLim .isNote{font-size:12px;margin-top:6px}',
    '#shRoot .shQ{display:flex;align-items:center;gap:6px;margin-top:10px}',
    '#shRoot .shQ button{width:44px;margin:0;padding:9px 0;font-size:18px;font-weight:900;border-radius:10px;background:#1a1f2d;border:1px solid #2a3340;color:#fff}',
    '#shRoot .shQ input{flex:1;margin:0;text-align:center;font-size:18px;font-weight:900;background:#0f1218;border:1px solid #2a3340;border-radius:10px;padding:8px}',
    '#shRoot .shQk{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}',
    '#shRoot .shQk button{margin:0;padding:7px 2px;font-size:12px;font-weight:800;border-radius:9px;background:#151826;border:1px solid #2a3340;color:#cfd6e4}',
    '#shRoot .shTot{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding:9px 11px;border-radius:11px;background:#11141b;border:1px solid #2a2e3b}',
    '#shRoot .shTot .v{font-size:20px;font-weight:900;color:#ffd76a}#shRoot .shTot .s{font-size:12px;color:var(--muted)}#shRoot .shTot .s.bad{color:#ff8a80;font-weight:800}',
    '#shRoot .shBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}',
    '#shRoot .shBtns button{margin:0;padding:12px 6px;font-size:14px;font-weight:900;border-radius:11px;border:0}',
    '#shRoot .shBtns .r{background:#3a2e10;border:1px solid #c9a227;color:#ffd76a}',
    '#shRoot .shBtns .g{color:#0c2417;background:linear-gradient(180deg,#5ef0a0,#2fbf71);box-shadow:0 2px 0 #14683a}',
    '#shRoot .shBtns .one{grid-column:1/-1}#shRoot .shBtns button:disabled{opacity:.45;cursor:not-allowed}',
    '#shRoot .shHint{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}',
    '#shRoot .shPick{padding:26px 10px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed #2a3340;border-radius:11px}',
    '@media(max-width:899px){#shRoot .shBuy.trong{display:none}}',   // dien thoai: chua chon mon thi an khung mua cho gon
    '@media(max-width:420px){#shRoot .shGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#shRoot .shIt .shIc,#shRoot .shIt img,#shRoot .shIt .isPh{width:36px;height:36px;flex-basis:36px}',
    '#shRoot .shTab{font-size:11px;padding:5px 9px}#shRoot .shBtns{grid-template-columns:1fr}}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var SH = { sx: 'macdinh', sel: '' };
  try { SH.sx = localStorage.getItem('sh_sx') || 'macdinh'; SH.sel = localStorage.getItem('sh_sel') || ''; } catch (e) { }
  var f = function (n) { return typeof vnd === 'function' ? vnd(n) : Number(n || 0).toLocaleString('vi-VN'); };
  var e = function (s) { return typeof esc === 'function' ? esc(s) : String(s); };
  function hinh(it) { return (!it.img && it.ic && typeof vqIcon === 'function') ? vqIcon(it.ic, 'shIc') : isImg(it.img); }
  function mon(id) { var r = null; (IS && IS.items || []).forEach(function (x) { if (x.id === id) r = x; }); return r; }
  function catOf(it) { return it.cat || 'consume'; }
  function conHang(it) { return !isOnceBought(it); }
  // con mua duoc toi da bao nhieu luc nay (theo tran /lan + han ngay / nhom / hang gioi han) - chi de goi y nut Toi da
  function toiDa(it) {
    if (!it) return 1; if (isOnceCat(it.cat)) return 1;
    var m = Number(it.max) || 1;
    if (it.cat === 'implant') { var il = isImpLeft(); if (il >= 0) m = Math.min(m, il); }
    else { var gq = isGrpQ(it); if (gq) { var gl = isGrpLeft(it); if (gl >= 0) m = Math.min(m, gl); } else if (IS.dayMax > 0) { var dl = isDayLeft(it.id); if (dl >= 0) m = Math.min(m, dl); } }
    if (it.price > 0) m = Math.min(m, Math.floor((IS.balance || 0) / it.price));
    return Math.max(0, m);
  }
  function hetHomNay(it) {
    if (isOnceCat(it.cat)) return false;
    if (it.cat === 'implant') return isImpLeft() === 0;
    var gq = isGrpQ(it); if (gq) return isGrpLeft(it) === 0;
    return IS.dayMax > 0 && isDayLeft(it.id) === 0;
  }
  function o(it) {
    var cls = 'shIt' + (it.tier === 'gold' ? ' gold' : it.tier === 'purple' ? ' pur' : '') + (it.id === SH.sel ? ' sel' : '') + (hetHomNay(it) ? ' het' : '');
    var tag = isOnceCat(it.cat) ? '<span class="tag">⭐ 1 lần</span>' : hetHomNay(it) ? '<span class="tag het">hết hôm nay</span>' : it.cat === 'implant' ? '<span class="tag lim">🔥 giới hạn</span>' : '';
    return '<button class="' + cls + '" onclick="shChon(\'' + it.id + '\')" title="' + e(it.name) + '">' + tag + hinh(it) +
      '<span class="m"><span class="n">' + e(it.name) + '</span><span class="p">' + (it.pet ? '🐾 Chọn pet' : it.price > 0 ? f(it.price) + ' KNB' : '🎁 Miễn phí') + '</span></span></button>';
  }
  function luoi() {
    var q = ((document.getElementById('shFind') || {}).value || '').trim().toLowerCase(), cat = isCatGet();
    var coHang = function (c) { return IS.items.some(function (it) { return catOf(it) === c && conHang(it); }); };
    if (!coHang(cat)) { for (var i = 0; i < ISG.length; i++) if (coHang(ISG[i][0])) { cat = ISG[i][0]; break; } }
    var xep = function (L) {
      var k = { gia: function (a, b) { return a.price - b.price; }, giaG: function (a, b) { return b.price - a.price; }, ten: function (a, b) { return String(a.name).localeCompare(String(b.name), 'vi'); } }[SH.sx];
      return k ? L.slice().sort(k) : L;
    };
    var h = '';
    if (q) {
      ISG.forEach(function (g) {
        var rows = xep(IS.items.filter(function (it) { return conHang(it) && catOf(it) === g[0] && ((it.name || '').toLowerCase().indexOf(q) >= 0 || (it.note || '').toLowerCase().indexOf(q) >= 0 || String(it.id) === q); }));
        if (rows.length) h += '<div class="shSub">' + e(g[1]) + ' · ' + rows.length + ' món</div>' + rows.map(o).join('');
      });
      if (!h) h = '<div class="shEmpty">Không thấy món nào khớp "' + e(q) + '"</div>';
    } else {
      var rows = xep(IS.items.filter(function (it) { return catOf(it) === cat && conHang(it); }));
      h = rows.length ? rows.map(o).join('') : '<div class="shEmpty">Nhóm này chưa có món nào.</div>';
    }
    return { h: h, cat: cat, q: q };
  }
  function khungMua(it) {
    if (!it) return '<div class="shBuyT">🛒 Mua hàng</div><div class="shPick">👈 Bấm 1 món bên trái để xem công dụng, hạn mua và mua.</div>';
    var h = '<div class="shBuyT">🛒 Mua hàng</div><div class="shBig">' + hinh(it) + '<div><div class="n">' + e(it.name) + '</div>' +
      '<div class="p">' + (it.price > 0 ? f(it.price) + ' KNB / cái' : '🎁 Miễn phí') + '</div><div class="id">ID ' + e(it.id) + '</div></div></div>';
    if (it.note) h += '<div class="shNote">' + e(it.note) + '</div>';
    h += '<div class="shLim">' + isDayLine(it) + '</div>';
    if (it.pet) return h + '<div class="shBtns"><button class="g one" onclick="pbOpen()">🐾 Chọn pet boss</button></div>';
    var mot = isOnceCat(it.cat), daMua = isOnceBought(it), td = toiDa(it), lienKet = !!IS.ingameName;
    if (!mot) {
      h += '<div class="shQ"><button onclick="shSo(-1)">−</button><input id="isq_' + e(it.id) + '" type="number" inputmode="numeric" min="1" max="' + (Number(it.max) || 1) + '" value="1" oninput="shTong()"><button onclick="shSo(1)">+</button></div>' +
        '<div class="shQk"><button onclick="shDat(1)">1</button><button onclick="shDat(5)">5</button><button onclick="shDat(10)">10</button><button onclick="shDat(' + Math.max(1, td) + ')">Tối đa</button></div>';
    }
    h += '<div class="shTot"><span class="s">Tổng</span><span class="v" id="shTotV">' + f(it.price) + ' KNB</span></div><div class="shHint" id="shTotS"></div>';
    var dis = (!lienKet || ISBUSY || daMua) ? ' disabled' : '';
    h += '<div class="shBtns">' + (mot
      ? '<button class="g one" onclick="isBuy(\'' + it.id + '\',this)"' + dis + '>' + (daMua ? '✅ Đã mua (1 lần/người)' : '🛒 Mua (1 lần duy nhất)') + '</button>'
      : (ikDuoc(it) ? '<button class="r" onclick="isBuy(\'' + it.id + '\',this,true)"' + dis + ' title="Không cần đang online">🧰 Mua vào rương</button>' : '') +
        '<button class="g' + (ikDuoc(it) ? '' : ' one') + '" onclick="isBuy(\'' + it.id + '\',this)"' + dis + '>🛒 Mua vào game</button>') + '</div>';
    h += '<div class="shHint">' + (lienKet ? (mot ? '⭐ Món 1 lần chỉ mua thẳng vào game (phải đang <b>online</b>).' : '🧰 <b>Vào rương</b>: không cần online, nhận sau ở Rương Ích Kỷ · 🛒 <b>Vào game</b>: giao thẳng vào túi, phải đang <b>online</b>.') : '⚠️ Chưa liên kết tên nhân vật - nhắn admin liên kết rồi mới mua được.') + '</div>';
    return h;
  }
  window.isRender = function () {
    if (!IS) return;
    var card = document.querySelector('#pageShop > .card'); if (!card) return;
    var root = document.getElementById('shRoot');
    if (!root) { root = document.createElement('div'); root.id = 'shRoot'; card.appendChild(root); }
    var focus = document.activeElement && document.activeElement.id === 'shFind', pos = focus ? document.activeElement.selectionStart : 0;
    var qCu = ((document.getElementById('shFind') || {}).value) || '';
    var slCu = (oSo() || {}).value;   // gõ tìm / ví làm mới -> giữ số lượng đang chọn, không nhảy về 1
    if (SH.sel && !mon(SH.sel)) SH.sel = '';
    var L = luoi();   // doc o tim (#shFind) TRUOC khi ve lai
    var qBox = qCu;
    var it = mon(SH.sel);
    var tab = function (g) { var n = IS.items.filter(function (x) { return catOf(x) === g[0] && conHang(x); }).length; if (!n) return ''; return '<button class="shTab' + (g[0] === L.cat && !qBox ? ' on' : '') + '" onclick="shCat(\'' + g[0] + '\')">' + e(g[1]) + '<span>' + n + '</span></button>'; };
    var h = '<div class="shHead"><h2 style="margin:0">🛒 Shop Item</h2><div class="r">' +
      '<span class="shChip">' + IS.items.filter(conHang).length + ' món</span><span class="shChip">Ví <b>' + f(IS.balance) + '</b> KNB</span>' +
      (IS.ingameName ? '<span class="shChip ok">🧑 ' + e(IS.ingameName) + '</span>' : '<span class="shChip no">⚠️ Chưa liên kết</span>') + '</div></div>';
    h += '<div class="shBar"><input id="shFind" placeholder="🔎 Tìm tên, công dụng hoặc ID trong mọi nhóm..." oninput="isRender()"><select onchange="shSx(this.value)">' +
      [['macdinh', 'Mặc định'], ['gia', 'Giá thấp → cao'], ['giaG', 'Giá cao → thấp'], ['ten', 'Tên A → Z']].map(function (x) { return '<option value="' + x[0] + '"' + (SH.sx === x[0] ? ' selected' : '') + '>↕ ' + x[1] + '</option>'; }).join('') + '</select></div>';
    h += '<div class="shTabs">' + ISG.map(tab).join('') + '</div>';
    h += '<div class="shTwo"><div class="shBag"><div class="shGrid">' + L.h + '</div></div><div class="shBuy' + (it ? '' : ' trong') + '" id="shBuy">' + khungMua(it) + '</div></div>';
    root.innerHTML = h;
    if (slCu && oSo()) oSo().value = slCu;
    var fi = document.getElementById('shFind'); if (fi) { fi.value = qBox; if (focus) { fi.focus(); try { fi.setSelectionRange(pos, pos); } catch (er) { } } }
    shTong();
  };

  window.shChon = function (id) {
    SH.sel = SH.sel === id ? '' : id; try { localStorage.setItem('sh_sel', SH.sel); } catch (er) { }
    isRender();
    if (SH.sel && window.innerWidth < 900) { var b = document.getElementById('shBuy'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  window.shCat = function (c) { try { localStorage.setItem('is_cat', c); } catch (er) { } var fi = document.getElementById('shFind'); if (fi) fi.value = ''; isRender(); };
  window.shSx = function (v) { SH.sx = v; try { localStorage.setItem('sh_sx', v); } catch (er) { } isRender(); };
  function oSo() { return SH.sel ? document.getElementById('isq_' + SH.sel) : null; }
  window.shDat = function (n) { var i = oSo(); if (!i) return; var it = mon(SH.sel); i.value = Math.max(1, Math.min(n, Number(it && it.max) || n)); shTong(); };
  window.shSo = function (d) { var i = oSo(); if (!i) return; shDat((Math.floor(Number(i.value)) || 1) + d); };
  window.shTong = function () {
    var it = mon(SH.sel), v = document.getElementById('shTotV'), s = document.getElementById('shTotS'); if (!it || !v || !s) return;
    var i = oSo(), q = isOnceCat(it.cat) ? 1 : Math.max(0, Math.floor(Number(i && i.value) || 0)), tong = q * (Number(it.price) || 0), con = (IS.balance || 0) - tong;
    v.textContent = f(tong) + ' KNB';
    if (q > (Number(it.max) || 1)) { s.className = 'shHint'; s.style.color = '#ff8a80'; s.textContent = '⚠️ Tối đa ' + f(it.max) + ' cái mỗi lần'; }
    else if (con < 0) { s.className = 'shHint'; s.style.color = '#ff8a80'; s.textContent = '⚠️ Không đủ KNB - thiếu ' + f(-con); }
    else { s.className = 'shHint'; s.style.color = ''; s.textContent = q ? 'Mua ' + f(q) + ' cái · ví còn ' + f(con) + ' KNB' : ''; }
  };

  // trang Shop dang mo san (F5, script tai sau go()) -> ve lai bang giao dien moi
  var pg = document.getElementById('pageShop');
  if (pg && !pg.classList.contains('hidden') && typeof IS !== 'undefined' && IS) isRender();
})();
