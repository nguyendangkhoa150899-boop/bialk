// 🏪 06/10: giao dien THUONG PHO (trang Ca nhan) - phuc vu o /tp.js, doc lai moi lan tai -> sua khong can restart bot.
// 2 tui: TRAI = kho web (bam 1 o -> sang phai ca chong), PHAI = se rut vao game (sua so luong, bam o -> tra ve trai).
// Bam XAC NHAN -> /api/tp/rut 1 lan cho moi mon. Kho theo TUNG NHAN VAT, chi rut ve dung nhan vat do, khong tang / ban.
// Dung chung: api, esc, toast, vqIcon (trang choi). Trang thai loc / sap xep luu localStorage tp_cfg.
(function () {
  var css = [
    '@media(min-width:900px){body.tpWide{max-width:1180px}}',
    '#tpCard .tpHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '#tpCard .tpWho{margin-left:auto;font-size:12px;color:var(--muted)}#tpCard .tpWho b{color:#ffd76a}',
    '#tpCard .tpNote{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.45}',
    '#tpCard .tpBar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px}',
    '#tpCard .tpBar input,#tpCard .tpBar select{background:#11141e;border:1px solid #2a3340;color:var(--tx);border-radius:9px;padding:7px 9px;font-size:13px}',
    '#tpCard .tpBar input{flex:1;min-width:140px}',
    '#tpCard .tpTab{background:#151826;border:1px solid #2a3340;color:var(--tx);border-radius:999px;padding:6px 11px;font-size:12px;font-weight:800;cursor:pointer}',
    '#tpCard .tpTab.on{background:#3a2a0c;border-color:#f5c542;color:#ffd76a}',
    '#tpCard .tpTwo{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}',
    '@media(min-width:900px){#tpCard .tpTwo{grid-template-columns:1fr 1fr}#tpCard .tpBag.ra{position:sticky;top:10px;align-self:start}}',   // kho dai: tui rut + nut Xac nhan bam theo man hinh
    '#tpCard .tpBag{border:1px solid #6b5420;border-radius:13px;padding:10px;background:linear-gradient(180deg,#1f1a10,#141824 60%);min-width:0}',
    '#tpCard .tpBag.ra{border-color:#2f6b46;background:linear-gradient(180deg,#10201a,#141824 60%)}',
    '#tpCard .tpBagT{display:flex;align-items:center;gap:6px;font-weight:900;color:#ffe08a;margin-bottom:8px}',
    '#tpCard .tpBag.ra .tpBagT{color:#7ee2a8}#tpCard .tpBagT span{margin-left:auto;font-size:12px;color:var(--muted);font-weight:700}',
    '#tpCard .tpGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:5px;min-height:126px;align-content:start}',
    '#tpCard .tpO{position:relative;aspect-ratio:1;border:1px solid #3b3220;border-radius:8px;background:#0e1118;cursor:pointer;padding:0;overflow:hidden}',
    '#tpCard .tpO:hover{border-color:#f5c542;box-shadow:0 0 0 1px #f5c542 inset}',
    '#tpCard .tpBag.ra .tpO{border-color:#24503a}#tpCard .tpBag.ra .tpO:hover{border-color:#5ef0a0;box-shadow:0 0 0 1px #5ef0a0 inset}',
    '#tpCard .tpO .tpIc{display:block;position:absolute;inset:3px;width:auto;height:auto;border-radius:6px;background-repeat:no-repeat}',
    '#tpCard .tpO .tpIc.vqNo{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;background:#1a1f2d}',
    '#tpCard .tpO .q{position:absolute;right:3px;bottom:1px;font-size:12px;font-weight:900;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 0 2px #000}',
    '#tpCard .tpO .lk{position:absolute;left:2px;top:1px;font-size:11px;filter:drop-shadow(0 0 2px #000)}',
    '#tpCard .tpO.khoa{cursor:not-allowed;opacity:.45}',
    // o CO DINH: vien do + o khoa to hon -> 2 vien cung ID nhin la biet
    '#tpCard .tpO.cd{border-color:#a33a3a;box-shadow:0 0 0 1px #5a1e1e inset}#tpCard .tpO.cd:hover{border-color:#ff5a5a;box-shadow:0 0 0 1px #ff5a5a inset}',
    '#tpCard .tpO .lk{font-size:13px}',
    '#tpCard .tpRa{display:flex;flex-direction:column;align-items:center;gap:3px}',
    '#tpCard .tpRa .tpO{width:100%}',
    '#tpCard .tpRa input{width:100%;box-sizing:border-box;background:#11141e;border:1px solid #2a3340;color:#7ee2a8;border-radius:6px;padding:2px 3px;font-size:12px;font-weight:800;text-align:center}',
    '#tpCard .tpEmpty{grid-column:1/-1;padding:22px 8px;border:1px dashed #2a3340;border-radius:10px;text-align:center;color:var(--muted);font-size:12px}',
    '#tpCard .tpSum{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}#tpCard .tpSum b{color:#7ee2a8}',
    '#tpCard .tpBtns{display:flex;gap:6px;margin-top:8px}',
    '#tpCard .tpGo{flex:1;padding:10px;font-size:15px;font-weight:900;border:0;border-radius:11px;color:#0c2417;background:linear-gradient(180deg,#5ef0a0,#2fbf71);box-shadow:0 2px 0 #14683a;cursor:pointer}',
    '#tpCard .tpBo{padding:10px 12px;font-size:13px;font-weight:800;border:1px solid #2a3340;border-radius:11px;color:var(--tx);background:#151826;cursor:pointer}',
    '#tpCard .tpGo:disabled,#tpCard .tpBo:disabled{opacity:.45;cursor:not-allowed}',
    '#tpCard .tpSec{margin-top:12px;border:1px solid #2a3340;border-radius:12px;padding:10px;background:#121521}',
    '#tpCard .tpSec h3{margin:0 0 6px;font-size:14px}',
    '#tpCard .tpRow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed #20263a;font-size:12px}',
    '#tpCard .tpRow:last-child{border-bottom:0}#tpCard .tpRow .tpIc{position:static;display:block;width:30px;height:30px;flex:0 0 30px;border-radius:6px;background-repeat:no-repeat}',
    '#tpCard .tpRow .tpIc.vqNo{display:flex;align-items:center;justify-content:center;font-style:normal;background:#1a1f2d}',
    '#tpCard .tpRow .t{flex:1;min-width:0}#tpCard .tpRow .m{color:var(--muted);white-space:nowrap}',
    '#tpCard .tpLs{padding:8px 0;border-bottom:1px dashed #20263a}#tpCard .tpLs:last-of-type{border-bottom:0}',
    '#tpCard .tpLsT{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}',
    '#tpCard .tpLsT .g{margin-left:auto;color:var(--muted);font-size:12px}',
    '#tpCard .l-rut{color:#7ee2a8}#tpCard .l-gui{color:#ffd76a}#tpCard .l-hoan{color:#ffb070}',
    '#tpCard .tpTt{font-size:11px;font-weight:800;padding:1px 8px;border-radius:999px;border:1px solid}',
    '#tpCard .tpTt.xong{background:#13261b;color:#7ee2a8;border-color:#2f6b46}#tpCard .tpTt.cho{background:#2a2410;color:#ffd76a;border-color:#6b5420}',
    '#tpCard .tpMons{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}',
    '#tpCard .tpMon{display:inline-flex;align-items:center;gap:6px;background:#0e1118;border:1px solid #262c3d;border-radius:8px;padding:3px 8px 3px 3px;font-size:12px}',
    '#tpCard .tpMon .tpIc{position:static;display:block;width:26px;height:26px;flex:0 0 26px;border-radius:5px;background-repeat:no-repeat}',
    '#tpCard .tpMon .tpIc.vqNo{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:14px;background:#1a1f2d}',
    '#tpCard .tpMon b{color:#ffd76a}',
    // danh sach mon trong popup xac nhan (#gmBox cua trang, ngoai #tpCard)
    '.tpCfL{margin:10px 0;display:flex;flex-direction:column;gap:4px;max-height:300px;overflow:auto}',
    '.tpCf{display:flex;align-items:center;gap:8px;background:#0e1118;border:1px solid #262c3d;border-radius:8px;padding:3px 8px 3px 3px;font-size:13px;text-align:left}',
    '.tpCf>span{flex:1;min-width:0}.tpCf b{color:#ffd76a;white-space:nowrap}',
    '.tpCf .tpIc{display:block;width:28px;height:28px;flex:0 0 28px;border-radius:5px;background-repeat:no-repeat}',
    '.tpCf .tpIc.vqNo{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:15px;background:#1a1f2d}',
    '#tpTip{position:fixed;z-index:9999;pointer-events:none;max-width:280px;background:rgba(8,10,16,.96);border:1px solid #8a6a2a;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;color:#e8e8e8;box-shadow:0 6px 18px rgba(0,0,0,.6);display:none}',
    '#tpTip .n{font-size:14px;font-weight:900;color:#ffd76a;margin-bottom:2px}',
    '#tpTip .cd{color:#ff5a5a;font-weight:900}#tpTip .kcd{color:#7ee2a8}#tpTip .x{color:#9aa3b8}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var tip = document.createElement('div'); tip.id = 'tpTip'; document.body.appendChild(tip);

  var TP = { s: null, chon: {}, loc: 'dc', q: '', sx: 'game', busy: false, ls: 'rut', lsN: 10 };
  try { var c0 = JSON.parse(localStorage.getItem('tp_cfg2') || '{}'); if (c0.loc === 'dc' || c0.loc === 'nl') TP.loc = c0.loc; if (c0.sx && c0.sx !== 'cd' && c0.sx !== 'loai') TP.sx = c0.sx; } catch (e) { }
  function luuCfg() { try { localStorage.setItem('tp_cfg2', JSON.stringify({ loc: TP.loc, sx: TP.sx })); } catch (e) { } }
  var $c = function () { return document.getElementById('tpCard'); };
  var key = function (x) { return x.id + '|' + x.k; };
  var TUI = { 1: 'Đạo cụ', 2: 'Nguyên liệu' };
  function ic(x) { return typeof vqIcon === 'function' ? vqIcon(x.ic, 'tpIc') : '<i class="tpIc vqNo">📦</i>'; }
  function e(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('vi-VN'); }
  function kho() { return (TP.s && TP.s.kho) || []; }
  function tim(k) { var L = kho(); for (var i = 0; i < L.length; i++) if (key(L[i]) === k) return L[i]; return null; }

  // ---- tooltip giong game ----
  function tipHtml(x, soChon, oNay) {
    var o = Math.ceil(x.n / Math.max(1, x.chong));
    return '<div class="n">' + e(x.ten) + '</div>' +
      (x.k ? '<div class="cd">🔒 Đã cố định</div>' : '<div class="kcd">Không cố định</div>') +
      (oNay && oNay < x.n ? '<div>Ô này: <b>' + fmt(oNay) + '</b> · cả kho: <b>' + fmt(x.n) + '</b></div>' : '<div>Số lượng: <b>' + fmt(x.n) + '</b></div>') +
      (soChon ? '<div style="color:#7ee2a8">Đang chọn rút: <b>' + fmt(soChon) + '</b></div>' : '') +
      '<div class="x">Túi ' + (TUI[x.tui] || '?') + ' · chồng tối đa ' + x.chong + '/ô · ~' + o + ' ô</div>' +
      (x.rut ? '' : '<div class="cd">Đang bị khoá rút - nhắn admin</div>') +
      '<div class="x">ID ' + x.id + '</div>';
  }
  document.addEventListener('mousemove', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-tpk]') : null;
    if (!t || !document.getElementById('tpCard') || !document.getElementById('tpCard').contains(t)) { tip.style.display = 'none'; return; }
    var x = tim(t.getAttribute('data-tpk')); if (!x) { tip.style.display = 'none'; return; }
    tip.innerHTML = tipHtml(x, TP.chon[key(x)] || 0, Number(t.getAttribute('data-tpq')) || 0); tip.style.display = 'block';
    var w = tip.offsetWidth, h = tip.offsetHeight, X = ev.clientX + 14, Y = ev.clientY + 14;
    if (X + w > window.innerWidth - 6) X = ev.clientX - w - 14; if (Y + h > window.innerHeight - 6) Y = ev.clientY - h - 14;
    tip.style.left = Math.max(4, X) + 'px'; tip.style.top = Math.max(4, Y) + 'px';
  });

  // ---- loc + sap xep ----
  function boLoc(L) {
    // tu khoa tach bang DAU PHAY, moi tu khoa giu ca cum ("hắc diệu thạch" khong thanh hắc | diệu | thạch);
    // cum chi toan so (cach nhau dau cach) = danh sach ID. Khop 1 tu khoa la hien.
    var q = TP.q.trim().toLowerCase(), tk = [];
    q.split(',').forEach(function (p) { p = p.trim(); if (!p) return; if (/^\d+(\s+\d+)*$/.test(p)) tk = tk.concat(p.split(/\s+/)); else tk.push(p); });
    return L.filter(function (x) {
      if (!tk.length && TP.loc === 'dc' && x.tui !== 1) return false;   // dang tim thi tim ca 2 tui
      if (!tk.length && TP.loc === 'nl' && x.tui !== 2) return false;
      if (!tk.length) return true;
      var ten = String(x.ten).toLowerCase();
      for (var i = 0; i < tk.length; i++) if (x.id === tk[i] || ten.indexOf(tk[i]) >= 0) return true;
      return false;
    });
  }
  function xep(L) {
    var f = {
      // giong tui game: Dao cu truoc, Nguyen lieu sau; trong tui theo ID (thu tu bang vat pham = mon cung loai nam canh nhau); khong khoa truoc
      game: function (a, b) { return (a.tui - b.tui) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.k - b.k); },
      moi: function (a, b) { return (b.t - a.t) || (a.id < b.id ? -1 : 1); },
      ten: function (a, b) { return String(a.ten).localeCompare(String(b.ten), 'vi') || (a.k - b.k); },
      sl: function (a, b) { return (b.n - a.n) || String(a.ten).localeCompare(String(b.ten), 'vi'); },
      loai: function (a, b) { return (a.tui - b.tui) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.k - b.k); },
      cd: function (a, b) { return (b.k - a.k) || (a.tui - b.tui) || (a.id < b.id ? -1 : 1); }
    }[TP.sx] || function () { return 0; };
    return L.slice().sort(f);
  }

  // ---- ve ----
  // 1 mon -> nhieu o nhu trong game: chong day truoc, o le cuoi (phan da chon rut khong hien nua)
  function oKho(x) {
    // 06/10 chu server chot: NGOC (5xxxxxxx) cong don 1 o / loai (trong game moi vien 1 o); do khac tach chong nhu game.
    // So o tui game can trong luon tinh theo so chong that (tooltip, tong ket tui rut, popup xac nhan).
    var con = x.n - (TP.chon[key(x)] || 0);
    if (con <= 0) return '';
    var c = /^5/.test(x.id) ? con : Math.max(1, x.chong), ds = [];
    while (con > 0 && ds.length < 99) { var q = Math.min(c, con); ds.push(q); con -= q; }
    if (con > 0) ds.push(con);   // toi da 100 o / mon, o cuoi gom phan con lai
    var cls = 'tpO' + (x.k ? ' cd' : '') + (x.rut ? '' : ' khoa');
    return ds.map(function (q) {
      return '<button class="' + cls + '" data-tpk="' + key(x) + '" data-tpq="' + q + '" onclick="tpVao(\'' + key(x) + '\',' + q + ')">' +
        ic(x) + (x.k ? '<span class="lk">🔒</span>' : '') + '<span class="q">' + (q > 1 ? fmt(q) : '') + '</span></button>';
    }).join('');
  }
  function oRa(x, n) {
    return '<div class="tpRa"><button class="tpO" data-tpk="' + key(x) + '" onclick="tpRa(\'' + key(x) + '\')" title="Bấm để trả về kho">' +
      ic(x) + (x.k ? '<span class="lk">🔒</span>' : '') + '<span class="q">' + fmt(n) + '</span></button>' +
      '<input type="number" min="1" max="' + x.n + '" value="' + n + '" onchange="tpSo(\'' + key(x) + '\',this.value)" onclick="this.select()"></div>';
  }
  function tinhO() {
    var o = { 1: 0, 2: 0 }, loai = 0, mon = 0;
    Object.keys(TP.chon).forEach(function (k) { var x = tim(k), n = TP.chon[k]; if (!x || !n) return; loai++; mon += n; o[x.tui] = (o[x.tui] || 0) + Math.ceil(n / Math.max(1, x.chong)); });
    return { o: o, loai: loai, mon: mon };
  }
  function ve() {
    var c = $c(); if (!c) return;
    var s = TP.s;
    if (!s) { c.innerHTML = '<div class="muted">Đang tải Thương Phố...</div>'; return; }
    var h = '<div class="tpHead"><h2 style="margin:0">🏪 Thương Phố</h2>' +
      (s.nhanVat ? '<div class="tpWho">Kho của nhân vật <b>' + e(s.nhanVat) + '</b></div>' : '') + '</div>' +
      '<div class="tpNote">Ra NPC <b>Ví Web</b> trong game, bấm <b>Chuyển Đạo cụ</b> hoặc <b>Chuyển Nguyên liệu</b> để chuyển đồ ra đây. ' +
      'Đồ chỉ rút về <b>đúng nhân vật này</b>, không tặng / bán được. Đồ <span style="color:#ff5a5a;font-weight:800">🔒 cố định</span> rút về vẫn cố định. ' +
      'Bấm 1 ô bên trái là chuyển chồng đó sang túi rút (bấm tiếp để lấy thêm), sửa số lượng dưới ô, bấm <b>Xác nhận</b> để chuyển một lần.</div>';
    if (s.tat) h += '<div class="tpSec" style="border-color:#7a3434;color:#ffb4b4">⛔ Thương Phố đang tạm khoá để bảo trì - đồ trong kho vẫn an toàn.</div>';
    if (!s.guid) { c.innerHTML = h + '<div class="tpSec">🔗 Ví của bạn chưa liên kết nhân vật trong game - nhắn admin liên kết trước đã.</div>'; return; }

    // tab dang chon trong ma tab kia co do -> tu sang tab co do (khong luu lua chon), khoi tuong kho rong
    var soDc = kho().filter(function (x) { return x.tui === 1; }).length, soNl = kho().length - soDc;
    if (TP.loc === 'dc' && !soDc && soNl) TP.loc = 'nl'; else if (TP.loc === 'nl' && !soNl && soDc) TP.loc = 'dc';
    var L = xep(boLoc(kho()));
    var tong = kho().reduce(function (t, x) { return t + x.n; }, 0);
    // 2 tab y nhu tui game; so tren tab = so loai mon trong tui do
    var demTui = function (t) { return kho().filter(function (x) { return x.tui === t; }).length; };
    var tab = function (v, t, n) { return '<button class="tpTab' + (TP.loc === v ? ' on' : '') + '" onclick="tpLoc(\'' + v + '\')">' + t + ' <span style="opacity:.7">' + n + '</span></button>'; };
    h += '<div class="tpBar">' + tab('dc', '🎒 Đạo cụ', demTui(1)) + tab('nl', '🧪 Nguyên liệu', demTui(2)) +
      '<input id="tpQ" placeholder="Tìm tên hoặc ID (nhiều ID cách dấu phẩy)" value="' + e(TP.q) + '" oninput="tpTim(this.value)">' +
      '<select onchange="tpSx(this.value)">' +
      [['game', 'Theo loại'], ['moi', 'Mới gửi trước'], ['ten', 'Tên A→Z'], ['sl', 'Số lượng nhiều']].map(function (o) {
        return '<option value="' + o[0] + '"' + (TP.sx === o[0] ? ' selected' : '') + '>↕ ' + o[1] + '</option>';
      }).join('') + '</select></div>';

    // tui trai
    h += '<div class="tpTwo"><div class="tpBag"><div class="tpBagT">📦 Kho web <span>' + kho().length + ' loại · ' + fmt(tong) + ' món</span></div><div class="tpGrid">';
    var luoi = L.map(oKho).join('');   // 06/10: khong tach nhom - o co dinh (vien do) nam sat o thuong cung loai
    h += luoi || '<div class="tpEmpty">' + (kho().length ? (L.length ? 'Đã chọn rút hết các món đang lọc' : 'Không có món khớp bộ lọc') : 'Kho trống - chuyển đồ ra từ NPC Ví Web trong game') + '</div>';
    h += '</div></div>';
    // tui phai
    var ks = Object.keys(TP.chon).filter(function (k) { return TP.chon[k] > 0 && tim(k); });
    var t = tinhO();
    h += '<div class="tpBag ra"><div class="tpBagT">🎮 Rút vào game <span>' + t.loai + ' loại · ' + fmt(t.mon) + ' món</span></div><div class="tpGrid">';
    h += ks.length ? ks.map(function (k) { return oRa(tim(k), TP.chon[k]); }).join('') : '<div class="tpEmpty">Bấm món bên kho web để đưa sang đây</div>';
    h += '</div>';
    if (ks.length) h += '<div class="tpSum">Cần trống khoảng <b>' + t.o[1] + '</b> ô túi Đạo cụ, <b>' + t.o[2] + '</b> ô túi Nguyên liệu. Túi không đủ chỗ thì phần còn lại chờ lần sau, không mất.</div>';
    h += '<div class="tpBtns"><button class="tpBo" onclick="tpBoHet()"' + (ks.length ? '' : ' disabled') + '>↩ Bỏ hết</button>' +
      '<button class="tpGo" onclick="tpXacNhan(this)"' + (ks.length && !TP.busy && !s.tat ? '' : ' disabled') + '>✅ Xác nhận rút vào game</button></div>';
    h += '</div></div>';

    // dang cho
    if (s.cho && s.cho.length) {
      h += '<div class="tpSec"><h3>⏳ Đang chờ vào game (' + s.cho.length + ' lệnh)</h3><div class="tpNote" style="margin:0 0 6px">Nhận khi nhân vật <b>đăng nhập / đổi bản đồ</b>, hoặc bấm NPC Ví Web → <b>Nhận đồ Thương Phố</b>. Lệnh đã xác nhận không huỷ được.</div>';
      h += s.cho.map(function (x) { return '<div class="tpRow">' + ic(x) + '<div class="t">' + e(x.ten) + (x.k ? ' <span style="color:#ff5a5a">🔒</span>' : '') + '</div><div class="m">×' + fmt(x.n) + '</div></div>'; }).join('');
      h += '</div>';
    }
    // lich su: moi lan 1 dong, mon cung loai da gop so luong (bot gop), trang thai lan rut doc tu .tpdone cua game
    if (s.nk && s.nk.length) {
      var NK = { gui: '📥 Gửi từ game', rut: '📤 Rút vào game', hoan: '🔁 Game hoàn về' };
      var TT = { xong: '<span class="tpTt xong">✅ Đã vào game</span>', cho: '<span class="tpTt cho">⏳ Đang chờ</span>', motphan: '<span class="tpTt cho">◐ Nhận một phần</span>' };
      var Ls = s.nk.filter(function (x) { return TP.ls === 'all' || x.loai === TP.ls; });
      var chip = function (v, t) { var n = v === 'all' ? s.nk.length : s.nk.filter(function (x) { return x.loai === v; }).length; return '<button class="tpTab' + (TP.ls === v ? ' on' : '') + '" onclick="tpLs(\'' + v + '\')">' + t + ' <span style="opacity:.7">' + n + '</span></button>'; };
      h += '<div class="tpSec"><h3>📜 Lịch sử</h3><div class="tpBar" style="margin:0 0 8px">' + chip('rut', '📤 Rút vào game') + chip('gui', '📥 Gửi từ game') + chip('hoan', '🔁 Hoàn về') + chip('all', 'Tất cả') + '</div>';
      h += Ls.length ? Ls.slice(0, TP.lsN).map(function (x) {
        var d = new Date(x.at), tong = (x.ds || []).reduce(function (t, y) { return t + y.n; }, 0);
        var mon = (x.ds && x.ds.length) ? x.ds.map(function (y) {
          return '<span class="tpMon" title="' + e(y.ten) + (y.k ? ' (cố định)' : '') + ' - ID ' + y.id + '">' + ic(y) + '<span>' + e(y.ten) + (y.k ? ' <span style="color:#ff5a5a">🔒</span>' : '') + '</span><b>×' + fmt(y.n) + '</b></span>';
        }).join('') : '<span class="muted">' + e(x.moTa || '') + '</span>';
        return '<div class="tpLs"><div class="tpLsT"><b class="l-' + x.loai + '">' + (NK[x.loai] || x.loai) + '</b>' + (x.tt ? TT[x.tt] : '') +
          '<span class="g">' + (tong ? fmt(tong) + ' món · ' : '') + d.toLocaleString('vi-VN', { hour12: false }) + '</span></div><div class="tpMons">' + mon + '</div></div>';
      }).join('') : '<div class="tpEmpty">Chưa có lần nào</div>';
      if (Ls.length > TP.lsN) h += '<button class="tpBo" style="width:100%;margin-top:6px" onclick="tpLsThem()">Xem thêm (' + (Ls.length - TP.lsN) + ')</button>';
      h += '</div>';
    }
    var foc = document.activeElement && document.activeElement.id === 'tpQ', pos = foc ? document.activeElement.selectionStart : 0;
    c.innerHTML = h;
    if (foc) { var q = document.getElementById('tpQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { } } }
  }

  // ---- hanh dong ----
  function donChon() { Object.keys(TP.chon).forEach(function (k) { var x = tim(k); if (!x) delete TP.chon[k]; else if (TP.chon[k] > x.n) TP.chon[k] = x.n; }); }
  window.tpSync = function () { api('/api/tp/state').then(function (j) { TP.s = j; donChon(); ve(); }).catch(function (er) { toast('❌ ' + er.message); }); };
  // bam 1 o -> chuyen dung chong cua o do sang tui rut
  window.tpVao = function (k, q) {
    var x = tim(k); if (!x) return;
    if (!x.rut) return toast('⚠️ Món này đang bị khoá rút - nhắn admin');
    var co = TP.chon[k] || 0, con = x.n - co; if (con <= 0) return;
    TP.chon[k] = co + Math.min(con, Math.max(1, Math.floor(Number(q) || con)));
    tip.style.display = 'none'; ve();
  };
  window.tpRa = function (k) { delete TP.chon[k]; tip.style.display = 'none'; ve(); };
  window.tpSo = function (k, v) {
    var x = tim(k); if (!x) return; var n = Math.floor(Number(v) || 0);
    if (n <= 0) delete TP.chon[k]; else TP.chon[k] = Math.min(n, x.n);
    ve();
  };
  window.tpBoHet = function () { TP.chon = {}; ve(); };
  window.tpLoc = function (v) { TP.loc = v; luuCfg(); ve(); };
  window.tpSx = function (v) { TP.sx = v; luuCfg(); ve(); };
  window.tpTim = function (v) { TP.q = v; ve(); };
  window.tpLs = function (v) { TP.ls = v; TP.lsN = 10; ve(); };
  window.tpLsThem = function () { TP.lsN += 20; ve(); };
  window.tpXacNhan = function (btn) {
    if (TP.busy) return;
    var ds = Object.keys(TP.chon).filter(function (k) { return TP.chon[k] > 0 && tim(k); }).map(function (k) { var x = tim(k); return { id: x.id, k: x.k, n: TP.chon[k] }; });
    if (!ds.length) return;
    var t = tinhO();
    // 06/10 chu server: KHONG dung confirm() cua trinh duyet - dung popup giua man hinh cua trang (gConfirm, webplay.js)
    if (typeof gConfirm !== 'function') return toast('❌ Trang chưa tải xong, F5 rồi thử lại');
    var ds8 = ds.slice(0, 8).map(function (y) { var x = tim(y.id + '|' + y.k);
      return '<div class="tpCf">' + ic(x) + '<span>' + e(x.ten) + (y.k ? ' <span style="color:#ff5a5a">🔒</span>' : '') + '</span><b>×' + fmt(y.n) + '</b></div>'; }).join('');
    var msg = 'Rút <b>' + t.loai + ' loại (' + fmt(t.mon) + ' món)</b> về nhân vật <b style="color:#ffd76a">' + e(TP.s.nhanVat || '') + '</b>?' +
      '<div class="tpCfL">' + ds8 + (ds.length > 8 ? '<div class="muted" style="font-size:12px">+ ' + (ds.length - 8) + ' loại khác</div>' : '') + '</div>' +
      '<div style="font-size:13px">Cần trống khoảng <b>' + t.o[1] + '</b> ô Đạo cụ, <b>' + t.o[2] + '</b> ô Nguyên liệu.</div>' +
      '<div style="font-size:13px;color:#ffb4b4;margin-top:4px">Đã xác nhận thì <b>không huỷ được</b>.</div>';
    tip.style.display = 'none';
    gConfirm(msg, '📦 Rút vào game').then(function (dongY) {
    if (!dongY) return;
    TP.busy = true; if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang chuyển...'; }
    api('/api/tp/rut', { ds: ds }).then(function (j) {
      TP.busy = false; TP.chon = {}; toast(j.message || '✅ Đã xếp lệnh vào game');
      if (j.state) { TP.s = j.state; ve(); } else tpSync();
    }).catch(function (er) { TP.busy = false; toast('❌ ' + er.message); tpSync(); });
    });
  };

  // trang dang mo san (F5 o tab Thuong Pho, script tai sau go()) -> tu tai
  var pg = document.getElementById('pageTp');
  if (pg && !pg.classList.contains('hidden')) tpSync();
})();
