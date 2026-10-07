// 💰 07/10: the "VI KNB <-> GAME" o trang Ca nhan (cung Diem danh) - phuc vu o /vg.js, doc lai moi lan tai -> sua khong can restart bot.
// Gom 3 viec truoc nam rai o trang Chuyen/Rut: Rut KNB vao game, Doi KNB -> Vang, Nap tu game (NPC Vi Web).
// API giu nguyen: GET /api/dogbridge/state, POST /api/dogbridge/rut {amount, kind:'knb'|'vang'}. Ve vao #vgCard.
// Dung chung cua trang choi: api, esc, vnd, toast, setBal, gConfirm. Tab dang chon luu localStorage vg_tab.
(function () {
  var css = [
    '#vgCard{position:relative;overflow:hidden;border-color:#3a4a2a;background:linear-gradient(180deg,#18221a,#1b1e27 55%)}',
    '#vgCard:before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,#3ddc84,#ffcf5c,#4da3ff)}',
    '#vgCard .vgHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '#vgCard .vgWho{margin-left:auto;font-size:12px;padding:3px 10px;border-radius:999px;background:#13261b;border:1px solid #2f6b46;color:#7ee2a8;white-space:nowrap}',
    '#vgCard .vgWho.no{background:#2a1416;border-color:#7a3434;color:#ffb4b4}',
    '#vgCard .vgBal{display:flex;align-items:baseline;gap:8px;margin-top:10px;padding:10px 12px;border-radius:12px;background:#11141b;border:1px solid #2a2e3b}',
    '#vgCard .vgBal .l{font-size:12px;color:var(--muted)}#vgCard .vgBal .v{font-size:24px;font-weight:900;color:#ffd76a;letter-spacing:.3px}',
    '#vgCard .vgBal .u{font-size:12px;color:var(--muted)}#vgCard .vgBal .r{margin-left:auto;font-size:11px;color:var(--muted);text-align:right}',
    '#vgCard .vgTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}',
    '#vgCard .vgTabs button{margin:0;padding:9px 4px;font-size:13px;font-weight:800;border-radius:10px;background:#151826;border:1px solid #2a3340;color:var(--muted)}',
    '#vgCard .vgTabs button.on{color:#0c2417;border-color:transparent;background:linear-gradient(180deg,#5ef0a0,#2fbf71)}',
    '#vgCard .vgTabs button.on.vang{color:#2a1d00;background:linear-gradient(180deg,#ffe08a,#e0a82e)}',
    '#vgCard .vgTabs button.on.nap{color:#04203a;background:linear-gradient(180deg,#8cc8ff,#4da3ff)}',
    '#vgCard .vgBody{margin-top:10px}',
    '#vgCard .vgIn{display:flex;align-items:center;background:#0f1218;border:1px solid #2a3340;border-radius:12px;padding:0 12px}',
    '#vgCard .vgIn:focus-within{border-color:#3ddc84}',
    '#vgCard .vgIn input{flex:1;width:auto;min-width:0;background:transparent;border:0;outline:0;color:#fff;font-size:22px;font-weight:800;padding:12px 0}',
    '#vgCard .vgIn span{color:var(--muted);font-weight:800;font-size:13px}',
    '#vgCard .vgQuick{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}',
    '#vgCard .vgQuick button{margin:0;padding:8px 2px;font-size:12px;font-weight:800;border-radius:9px;background:#1a1f2d;border:1px solid #2a3340;color:#cfd6e4}',
    '#vgCard .vgQuick button:active{transform:scale(.97)}',
    '#vgCard .vgLim{margin-top:10px;font-size:12px;color:var(--muted)}',
    '#vgCard .vgLim .row2{display:flex;justify-content:space-between;gap:8px}',
    '#vgCard .vgBar{height:7px;border-radius:99px;background:#232838;overflow:hidden;margin-top:5px}',
    '#vgCard .vgBar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#3ddc84,#ffcf5c)}',
    '#vgCard .vgBar i.het{background:#ff5d5d}',
    '#vgCard .vgPrev{min-height:18px;margin-top:8px;font-size:13px;font-weight:700}',
    '#vgCard .vgPrev.ok{color:#7ee2a8}#vgCard .vgPrev.bad{color:#ff8a80}',
    '#vgCard .vgGo{display:block;width:100%;margin-top:8px;padding:13px;font-size:16px;font-weight:900;border:0;border-radius:12px;color:#0c2417;background:linear-gradient(180deg,#5ef0a0,#2fbf71);box-shadow:0 2px 0 #14683a}',
    '#vgCard .vgGo.vang{color:#2a1d00;background:linear-gradient(180deg,#ffe08a,#e0a82e);box-shadow:0 2px 0 #8a6508}',
    '#vgCard .vgGo:disabled{opacity:.45;cursor:not-allowed}',
    '#vgCard .vgNote{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}',
    '#vgCard .vgStep{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;margin-top:6px;border-radius:11px;background:#11141b;border:1px solid #232838;font-size:13px;line-height:1.45}',
    '#vgCard .vgStep b.n{flex:0 0 22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#4da3ff;color:#04203a;font-size:12px}',
    '#vgCard .vgNpc{display:inline-block;margin:4px 6px 0 0;padding:2px 9px;border-radius:999px;background:#10233a;border:1px solid #2c5a8a;color:#8cc8ff;font-size:12px;font-weight:700}',
    '#vgCard .vgSoft{display:block;width:100%;margin-top:8px;padding:10px;font-size:14px;font-weight:800;border-radius:11px;background:#151826;border:1px solid #2c5a8a;color:#8cc8ff}',
    '#vgCard .vgHist{margin-top:12px;border-top:1px dashed #2a3340;padding-top:8px}',
    '#vgCard .vgHist h3{margin:0 0 4px;font-size:13px;color:var(--muted)}',
    '#vgCard .vgH{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px solid #1d2230}',
    '#vgCard .vgH:last-child{border-bottom:0}#vgCard .vgH .t{flex:1}#vgCard .vgH .g{color:var(--muted);font-size:11px;white-space:nowrap}',
    '#vgCard .vgH .so{font-weight:900;white-space:nowrap}#vgCard .vgH .so.vao{color:#7ee2a8}#vgCard .vgH .so.ra{color:#ffb070}',
    '#vgCard .vgOff{margin-top:10px;padding:10px 12px;border-radius:11px;background:#2a1416;border:1px solid #7a3434;color:#ffb4b4;font-size:13px}',
    // PC: the nam cot phai trang Ca nhan (body.vgWide, webplay.js) - noi bat hon, lich su cuon rieng
    '@media(min-width:900px){body.vgWide #vgCard{padding:18px}body.vgWide #vgCard .vgBal .v{font-size:30px}body.vgWide #vgCard .vgHist{max-height:330px;overflow:auto}}',
    // dien thoai hep
    '@media(max-width:420px){#vgCard .vgTabs button{font-size:12px;padding:9px 2px}#vgCard .vgBal .v{font-size:21px}#vgCard .vgBal .r{display:none}',
    '#vgCard .vgQuick button{font-size:11px}#vgCard .vgIn input{font-size:19px}#vgCard .vgLim .row2{flex-wrap:wrap}#vgCard .vgH .g{display:none}}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var VG = { s: null, tab: 'rut', busy: false };
  try { var t0 = localStorage.getItem('vg_tab'); if (t0 === 'rut' || t0 === 'vang' || t0 === 'nap') VG.tab = t0; } catch (e) { }
  var $c = function () { return document.getElementById('vgCard'); };
  var f = function (n) { return typeof vnd === 'function' ? vnd(n) : Number(n || 0).toLocaleString('vi-VN'); };
  var e = function (s) { return typeof esc === 'function' ? esc(s) : String(s); };
  var NPC_MAC_DINH = 'NPC "Ví Web" ở Lạc Dương (203,323) hoặc Đại Lý (154,170)';

  // con duoc rut / doi bao nhieu ngay luc nay (ca 3 tran: so du, tran 1 lan, han ngay con lai)
  function conDuoc(k) {
    var s = VG.s || {}, bal = s.balance || 0, mx = s.max || 0;
    var dm = k === 'vang' ? (s.vangDayMax || 0) : (s.dayMax || 0), da = k === 'vang' ? (s.vangToday || 0) : (s.rutToday || 0);
    var conNgay = dm > 0 ? Math.max(0, dm - da) : Infinity;
    return { bal: bal, mx: mx, dm: dm, da: da, conNgay: conNgay, toiDa: Math.max(0, Math.min(bal, mx || Infinity, conNgay)) };
  }
  function soNhap() { var i = document.getElementById('vgAmt'); return i ? Math.floor(Number(i.value) || 0) : 0; }
  function gio(ts) { if (!ts) return ''; var d = new Date(ts), n = Date.now() - ts; if (n < 60000) return 'vừa xong'; if (n < 3600000) return Math.floor(n / 60000) + ' phút trước'; if (n < 86400000) return Math.floor(n / 3600000) + ' giờ trước'; return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2); }

  function veRut(k) {
    var s = VG.s, c = conDuoc(k), vang = k === 'vang', mo = s.rutOpen !== false && !!s.ingameName;
    var h = '<div class="vgIn"><input id="vgAmt" type="number" inputmode="numeric" min="1" placeholder="Nhập số KNB" oninput="vgPrev()" onkeydown="if(event.key===\'Enter\')vgGo()"><span>KNB</span></div>';
    h += '<div class="vgQuick">' + [1000, 10000, 50000].map(function (v) { return '<button onclick="vgThem(' + v + ')">+' + f(v) + '</button>'; }).join('') +
      '<button onclick="vgToiDa()">Tối đa</button></div>';
    h += '<div class="vgLim">';
    if (c.dm > 0) {
      var pc = Math.min(100, Math.round(c.da / c.dm * 100));
      h += '<div class="row2"><span>📅 Hôm nay đã ' + (vang ? 'đổi' : 'rút') + ' <b>' + f(c.da) + '</b> / ' + f(c.dm) + '</span><span>còn <b style="color:#ffd76a">' + f(c.conNgay) + '</b></span></div>' +
        '<div class="vgBar"><i class="' + (pc >= 100 ? 'het' : '') + '" style="width:' + pc + '%"></i></div>';
    }
    h += '<div class="row2" style="margin-top:6px"><span>Tối đa <b>' + f(c.mx) + '</b> / lần</span><span>' + (vang ? '<b>1 KNB = 1 vàng</b> không khoá' : 'Vào túi KNB trong game') + '</span></div></div>';
    h += '<div class="vgPrev" id="vgPrev"></div>';
    h += '<button class="vgGo' + (vang ? ' vang' : '') + '" id="vgGo" onclick="vgGo()"' + (mo && !VG.busy ? '' : ' disabled') + '>' +
      (!s.ingameName ? '🔗 Chưa liên kết nhân vật' : s.rutOpen === false ? '⛔ Rút vào game đang đóng' : VG.busy ? '⏳ Đang gửi...' : vang ? '🪙 Đổi ra Vàng trong game' : '🎮 Rút vào game') + '</button>';
    h += '<div class="vgNote">' + (vang ? 'Vàng' : 'KNB') + ' vào túi khi nhân vật <b>đăng nhập</b> hoặc <b>đổi bản đồ</b> (không cần đang online lúc bấm).</div>';
    return h;
  }
  function veNap() {
    var s = VG.s, npc = s.napNpc || NPC_MAC_DINH, m = /Lạc Dương \(([^)]*)\)/.exec(npc), m2 = /Đại Lý \(([^)]*)\)/.exec(npc);
    var h = '<div class="vgStep"><b class="n">1</b><div>Vào game, tới NPC <b>Ví Web</b>:<br>' +
      (m ? '<span class="vgNpc">📍 Lạc Dương ' + e(m[1]) + '</span>' : '') + (m2 ? '<span class="vgNpc">📍 Đại Lý ' + e(m2[1]) + '</span>' : '') + (!m && !m2 ? e(npc) : '') + '</div></div>';
    h += '<div class="vgStep"><b class="n">2</b><div>Chọn <b>Chuyển ra web 10.000 / 100.000 KNB</b> hoặc <b>Toàn bộ KNB</b>.</div></div>';
    h += '<div class="vgStep"><b class="n">3</b><div>KNB cộng vào ví web sau khoảng <b>5 giây</b>, tỉ giá <b>1 : 1</b>, không giới hạn.</div></div>';
    if (s.napToday) h += '<div class="vgNote">📥 Hôm nay bạn đã nạp <b style="color:#7ee2a8">' + f(s.napToday) + '</b> KNB.</div>';
    h += '<button class="vgSoft" onclick="vgSync(true)">🔄 Tải lại số dư</button>';
    return h;
  }
  function ve() {
    var c = $c(); if (!c) return;
    var s = VG.s;
    if (!s) { c.innerHTML = '<div class="muted">Đang tải ví...</div>'; return; }
    var tab = function (k, t, cls) { return '<button class="' + (VG.tab === k ? 'on ' : '') + cls + '" onclick="vgTab(\'' + k + '\')">' + t + '</button>'; };
    var h = '<div class="vgHead"><h2 style="margin:0">💰 Ví KNB ↔ Game</h2>' +
      (s.ingameName ? '<span class="vgWho">🧑 ' + e(s.ingameName) + '</span>' : '<span class="vgWho no">⚠️ Chưa liên kết nhân vật</span>') + '</div>';
    h += '<div class="vgBal"><span class="l">Số dư web</span><span class="v">' + f(s.balance) + '</span><span class="u">KNB</span><span class="r">1 KNB web<br>= 1 KNB game</span></div>';
    h += '<div class="vgTabs">' + tab('rut', '🎮 Rút KNB', '') + tab('vang', '🪙 Đổi Vàng', 'vang') + tab('nap', '📥 Nạp từ game', 'nap') + '</div>';
    h += '<div class="vgBody">' + (VG.tab === 'nap' ? veNap() : veRut(VG.tab)) + '</div>';
    if (!s.ingameName) h += '<div class="vgOff">🔗 Ví chưa liên kết tên nhân vật trong game - nhắn admin liên kết giúp (chỉ 1 lần) rồi mới rút / nạp được.</div>';
    var L = s.hist || [];
    if (L.length) {
      var NH = { rut: ['📤', 'Rút KNB vào game', 'ra'], vang: ['🪙', 'Đổi ra vàng', 'ra'], nap: ['📥', 'Nạp từ game', 'vao'] };
      h += '<div class="vgHist"><h3>🕘 Gần đây</h3>' + L.map(function (x) {
        var n = NH[x.loai] || NH.rut;
        return '<div class="vgH"><span>' + n[0] + '</span><span class="t">' + n[1] + '</span><span class="so ' + n[2] + '">' + (n[2] === 'vao' ? '+' : '−') + f(x.so) + '</span><span class="g">' + gio(x.ts) + '</span></div>';
      }).join('') + '</div>';
    }
    var cu = soNhap();
    c.innerHTML = h;
    var i = document.getElementById('vgAmt'); if (i && cu) i.value = cu;
    vgPrev();
  }

  window.vgSync = function (bao) {
    api('/api/dogbridge/state').then(function (j) { VG.s = j; if (typeof setBal === 'function') setBal(j.balance); ve(); if (bao) toast('🔄 Số dư: ' + f(j.balance) + ' KNB'); })
      .catch(function (er) { toast('❌ ' + er.message); });
  };
  window.vgTab = function (k) { VG.tab = k; try { localStorage.setItem('vg_tab', k); } catch (er) { } ve(); };
  window.vgThem = function (v) { var i = document.getElementById('vgAmt'); if (!i) return; i.value = Math.max(0, soNhap()) + v; vgPrev(); };
  window.vgToiDa = function () { var i = document.getElementById('vgAmt'); if (!i) return; var c = conDuoc(VG.tab); i.value = c.toiDa || ''; vgPrev(); if (!c.toiDa) toast('⚠️ Không còn rút được (hết số dư hoặc hết hạn hôm nay)'); };
  window.vgPrev = function () {
    var p = document.getElementById('vgPrev'); if (!p || !VG.s || VG.tab === 'nap') return;
    var a = soNhap(), c = conDuoc(VG.tab), vang = VG.tab === 'vang';
    if (!a) { p.className = 'vgPrev'; p.textContent = ''; return; }
    var loi = a > c.bal ? 'Số dư web chỉ có ' + f(c.bal) + ' KNB' : (c.mx && a > c.mx) ? 'Vượt giới hạn ' + f(c.mx) + ' / lần' : a > c.conNgay ? 'Vượt hạn hôm nay - chỉ còn ' + f(c.conNgay) : '';
    p.className = 'vgPrev ' + (loi ? 'bad' : 'ok');
    p.textContent = loi ? '⚠️ ' + loi : '✓ Nhận ' + f(a) + (vang ? ' vàng' : ' KNB') + ' trong game · ví web còn ' + f(c.bal - a);
  };
  window.vgGo = function () {
    if (VG.busy || !VG.s || VG.tab === 'nap') return;
    var a = soNhap(), c = conDuoc(VG.tab), vang = VG.tab === 'vang';
    if (a < 1) return toast('⚠️ Nhập số KNB');
    if (a > c.bal || (c.mx && a > c.mx) || a > c.conNgay) { vgPrev(); return toast('⚠️ ' + document.getElementById('vgPrev').textContent.replace('⚠️ ', '')); }
    if (typeof gConfirm !== 'function') return toast('❌ Trang chưa tải xong, F5 rồi thử lại');
    var msg = (vang ? 'Đổi <b>' + f(a) + '</b> KNB web thành <b style="color:#ffd76a">' + f(a) + ' vàng</b> không khoá' : 'Rút <b style="color:#7ee2a8">' + f(a) + ' KNB</b>') +
      ' vào nhân vật <b>' + e(VG.s.ingameName) + '</b>?<div style="font-size:13px;margin-top:8px;color:var(--muted)">Ví web còn <b>' + f(c.bal - a) + '</b> KNB. Nhận khi đăng nhập / đổi bản đồ.</div>';
    gConfirm(msg, vang ? '🪙 Đổi vàng' : '🎮 Rút vào game').then(function (dongY) {
      if (!dongY) return;
      VG.busy = true; ve();
      api('/api/dogbridge/rut', { amount: a, kind: vang ? 'vang' : 'knb' }).then(function (j) {
        VG.busy = false; if (typeof setBal === 'function') setBal(j.balance); toast(j.message || '✅ Đã gửi vào game');
        var i = document.getElementById('vgAmt'); if (i) i.value = ''; vgSync();
      }).catch(function (er) { VG.busy = false; ve(); toast('❌ ' + er.message); });
    });
  };

  // trang Ca nhan dang mo san (F5, script tai sau go()) -> tu tai
  var pg = document.getElementById('pageDaily');
  if (pg && !pg.classList.contains('hidden')) vgSync();
})();
