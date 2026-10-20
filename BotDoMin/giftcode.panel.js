// 🎟️ 20/10 TAB GIFTCODE (chủ server) - phục vụ ở /gc.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Admin tạo mã + quà, người chơi nhập mã trong game (NPC Hồi Ức Thiên Long > Nhập Giftcode), game kiểm hạn / lượt / tài khoản và phát quà ngay.
// Bot chỉ ghi giftcode.txt + giftcode-acc.txt, đọc giftcode-dung.txt (xem giftcode.js).
// API (chỉ SUPER): /api/gc/list, /api/gc/tao, /api/gc/bat, /api/gc/xoa, /api/gc/dung, /api/gameitems (danh mục để chọn quà).
// Dùng hàm chung của panel: api, toast, uiConfirm, icTra, ICMAP, vqaIc. KHÔNG dùng confirm/alert/prompt.
(function () {
  var GC = { d: null, items: null, itemsLoading: false, iq: '', chon: [], q: '', loc: '', mo: {}, moi: null, busy: false, built: false };
  var ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // giống bot: bỏ 0 O 1 I L
  var TT = { bat: ['Đang bật', 'on'], tat: ['Đã tắt', 'off'], hethan: ['Hết hạn', 'exp'], hetluot: ['Hết lượt', 'full'] };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }
  function $(id) { return document.getElementById(id); }
  function icOf(id) { var v = ICMAP[id]; return v && v.ic ? v.ic : null; }
  function so(x) { return Number(x || 0).toLocaleString('vi-VN'); }
  function boDau(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ngay(sec) { var d = new Date(sec * 1000); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dtLocal(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function conLai(s) { if (s < 3600) return 'còn ' + Math.max(1, Math.round(s / 60)) + ' phút'; if (s < 86400 * 2) return 'còn ' + Math.round(s / 3600) + ' giờ'; return 'còn ' + Math.round(s / 86400) + ' ngày'; }
  function maNgauNhien() { var s = ''; for (var i = 0; i < 6; i++) s += ABC[Math.floor(Math.random() * ABC.length)]; return s; }   // 6 ký tự sau "TL"
  function maNhap() { var m = String(($('gcMa') || {}).value || '').toUpperCase().replace(/\s+/g, ''); return m.length === 6 ? 'TL' + m : m; }   // giống bot: 6 ký tự -> thêm TL

  function css() {
    if ($('gcCss')) return;
    var s = document.createElement('style'); s.id = 'gcCss';
    s.textContent =
      '#gcRoot{display:grid;gap:14px}#gcRoot .card{margin:0}#gcRoot h3{margin:0 0 10px;font-size:16px}#gcRoot h3 small{font-weight:400;color:var(--mut);font-size:12.5px;margin-left:6px}' +
      '#gcRoot button{padding:7px 12px;font-size:13px;border-radius:8px}#gcRoot input,#gcRoot select{margin:0}' +
      '#gcRoot .gcGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:18px;align-items:start}@media(max-width:900px){#gcRoot .gcGrid{grid-template-columns:1fr}}' +
      '#gcRoot .gcF{display:grid;gap:10px}#gcRoot .gcF label{display:block;font-size:12.5px;color:var(--mut);margin-bottom:4px}' +
      '#gcRoot .gcRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}#gcRoot .gcRow input,#gcRoot .gcRow select{flex:1;min-width:120px;width:auto;padding:8px 10px}' +
      '#gcRoot .gc3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#gcRoot .gc3 input{width:100%;padding:8px 10px}' +
      '#gcRoot .gcHint{font-size:12px;color:var(--mut);margin-top:3px;line-height:1.45}' +
      '#gcRoot .gcTL{flex:0 0 auto;padding:8px 10px;border-radius:8px;background:#1a1b1e;border:1px solid var(--line);color:#fff;font-family:Consolas,monospace;font-weight:800}' +
      '#gcRoot .gcItems{max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:10px;scrollbar-gutter:stable}' +
      '#gcRoot .gcIt{display:flex;align-items:center;gap:9px;padding:6px 12px 6px 9px;border-bottom:1px solid var(--line);cursor:pointer}#gcRoot .gcIt:hover{background:var(--card2)}' +
      '#gcRoot .gcIt.on{background:rgba(53,196,106,.14)}#gcRoot .gcItT{flex:1;min-width:0}#gcRoot .gcItN{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gcRoot .gcIt small{display:block;color:var(--mut);font-size:11px}' +
      '#gcRoot .gcChon{display:grid;gap:6px;margin-top:8px}#gcRoot .gcC{display:flex;align-items:center;gap:9px;padding:6px 8px 6px 9px;border:1px solid #3f8a60;border-radius:10px;background:var(--card2)}' +
      '#gcRoot .gcC .gcItT b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gcRoot .gcC small{color:var(--mut);font-size:11px}' +
      '#gcRoot .gcC input{width:90px;flex:0 0 90px;padding:6px 8px}#gcRoot .gcX{width:28px;height:28px;padding:0!important;border-radius:50%!important;background:#4e5058;flex:0 0 auto}#gcRoot .gcX:hover{background:var(--red)}' +
      '#gcRoot .empty{padding:10px 12px;color:var(--mut);font-size:13px}' +
      '#gcRoot .gcSum{padding:12px;border-radius:10px;background:var(--card2);border:1px solid var(--line);font-size:13.5px;line-height:1.6;margin-top:12px}' +
      '#gcRoot .gcGo{width:100%;padding:12px!important;font-size:15px!important;font-weight:800;margin-top:10px}' +
      '#gcRoot .gcMoi{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;border-radius:10px;background:#1f3a2a;border:1px solid #3f8a60;color:#e3f5ea;margin-bottom:12px}' +
      '#gcRoot .gcMoi code{font-size:20px;font-weight:800;letter-spacing:1px;color:#fff}' +
      '#gcRoot .gcBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}#gcRoot .gcBar input[type=text]{flex:1;min-width:180px;width:auto;padding:8px 10px}#gcRoot .gcBar select{width:auto;padding:8px 10px}' +
      '#gcRoot table{border-collapse:collapse;width:100%;font-size:13px}#gcRoot td,#gcRoot th{padding:8px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}' +
      '#gcRoot th{color:var(--mut);font-weight:600;font-size:12px}#gcRoot tr.gcOff td{opacity:.72}' +
      '#gcRoot .gcMa{font-family:Consolas,monospace;font-size:14.5px;font-weight:700;color:#fff;background:#1a1b1e;border:1px solid var(--line);padding:2px 7px;border-radius:6px}' +
      '#gcRoot .gcMini{padding:3px 7px!important;font-size:12px!important;margin-left:4px}' +
      '#gcRoot .gcQs{display:flex;flex-wrap:wrap;gap:5px;max-width:520px}#gcRoot .gcQ{display:inline-flex;align-items:center;gap:5px;padding:2px 9px 2px 3px;border-radius:999px;background:var(--card2);border:1px solid var(--line);font-size:12.5px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}' +
      '#gcRoot .gcQ.tien{padding-left:9px;color:#f3cf8a;border-color:#5a4a22}' +
      '#gcRoot .gcB{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid}' +
      '#gcRoot .gcB.on{background:#1f3a2a;color:#8fe0ad;border-color:#3f8a60}#gcRoot .gcB.off{background:#33353b;color:#d0d3d8;border-color:#55585f}' +
      '#gcRoot .gcB.exp{background:#4a2326;color:#ffb0b0;border-color:#8a3a3f}#gcRoot .gcB.full{background:#463717;color:#f6d58e;border-color:#7a6128}' +
      '#gcRoot .gcAct{display:flex;flex-wrap:wrap;gap:6px}#gcRoot .bad{color:#ff8f8f;font-weight:700}#gcRoot .ok{color:#5fd68a}' +
      '#gcRoot tr.gcSub>td{background:#24262b;padding:10px 14px}#gcRoot tr.gcSub table{font-size:12.5px}#gcRoot .gcWarn{padding:9px 12px;border-radius:8px;background:#463717;color:#f6d58e;border:1px solid #7a6128;font-size:13px;margin-top:8px}';
    document.head.appendChild(s);
  }

  function khung() {
    css();
    var r = $('gcRoot'); if (!r) return;
    r.innerHTML =
      '<div class="card"><h2 style="margin:0">🎟️ Giftcode <small class="muted" style="font-size:13px;font-weight:400">người chơi nhập mã ở NPC Hồi Ức Thiên Long > Nhập Giftcode · quà vào túi ngay · mỗi tài khoản dùng 1 lần / mã</small></h2><div id="gcInfo" class="gcHint" style="margin-top:6px"></div></div>' +
      '<div class="card"><h3>➕ Tạo mã mới</h3><div id="gcMoi"></div><div class="gcGrid"><div class="gcF">' +
      '<div><label>Mã (để trống = tạo ngẫu nhiên)</label><div class="gcRow"><span class="gcTL">TL</span><input type="text" id="gcMa" maxlength="8" placeholder="6 ký tự, vd: 2026AB" autocomplete="off" style="text-transform:uppercase;font-family:Consolas,monospace"><button type="button" class="btn-grey" data-gc="ngaunhien">🎲 Ngẫu nhiên</button></div>' +
      '<div class="gcHint">Người chơi gõ TL viết hoa + 6 ký tự (không có dấu -). Chỉ gõ 6 ký tự chữ A-Z / số 0-9 sau TL, hoặc dán cả mã 8 ký tự.</div></div>' +
      '<div><label>Hạn dùng (giờ theo máy bạn, để trống = không hết hạn)</label><div class="gcRow"><input type="datetime-local" id="gcHan">' +
      '<button type="button" class="btn-grey" data-gchan="1">+1 ngày</button><button type="button" class="btn-grey" data-gchan="7">+7 ngày</button><button type="button" class="btn-grey" data-gchan="30">+30 ngày</button><button type="button" class="btn-grey" data-gchan="0">Không hạn</button></div></div>' +
      '<div><label>Tổng lượt dùng cả server</label><div class="gcRow"><input type="number" id="gcLuot" min="0" max="100000" value="1"></div><div class="gcHint">0 = không giới hạn. Mỗi tài khoản game chỉ dùng được 1 lần dù có nhiều nhân vật.</div></div>' +
      '<div><label>Tiền (để trống = không có)</label><div class="gc3"><input type="number" id="gcKnb" min="0" placeholder="KNB"><input type="number" id="gcVang" min="0" placeholder="Vàng"><input type="number" id="gcDt" min="0" placeholder="Điểm Tặng"></div>' +
      '<div class="gcHint">KNB tối đa 10.000.000 · Vàng tối đa 100.000 · Điểm Tặng tối đa 10.000.000</div></div>' +
      '<div><label>Ghi chú (chỉ admin thấy)</label><div class="gcRow"><input type="text" id="gcGhi" maxlength="200" placeholder="vd: quà tân thủ, sự kiện 20/10"></div></div>' +
      '</div><div class="gcF"><div><label>Vật phẩm: tìm theo tên hoặc ID rồi bấm để thêm (tối đa 20 loại, mỗi loại 1 - 9.999)</label><div class="gcRow"><input type="text" id="gcIq" placeholder="vd: Hồn Băng Châu, 20309101" autocomplete="off"></div></div>' +
      '<div class="gcItems" id="gcItems"></div><div><label>Quà đã chọn</label><div class="gcChon" id="gcChon"></div></div>' +
      '<div class="gcSum" id="gcSum"></div><button type="button" class="btn-green gcGo" id="gcGo" data-gc="tao">Tạo mã</button></div></div></div>' +
      '<div class="card"><h3>📋 Danh sách mã <small id="gcN"></small></h3>' +
      '<div class="gcBar"><input type="text" id="gcQ" placeholder="🔎 Tìm mã / ghi chú / tên quà"><select id="gcLoc"><option value="">Tất cả trạng thái</option><option value="bat">Đang bật</option><option value="tat">Đã tắt</option><option value="hethan">Hết hạn</option><option value="hetluot">Hết lượt</option></select><button type="button" class="btn-grey" data-gc="tai">🔄 Tải lại</button></div>' +
      '<div id="gcList"><div class="empty">Đang tải...</div></div><div id="gcLe"></div>' +
      '<div class="note">Tắt mã = game báo "Mã không tồn tại" ngay (file giftcode.txt ghi lại liền). Bật lại thì lượt cũ vẫn được tính. Nhật ký: tab 📜 Log, lọc chữ "GIFTCODE".</div></div>';
    $('gcIq').addEventListener('input', function () { GC.iq = this.value; veItems(); });
    $('gcQ').addEventListener('input', function () { GC.q = this.value; veList(); });
    $('gcLoc').addEventListener('change', function () { GC.loc = this.value; veList(); });
    ['gcMa', 'gcHan', 'gcLuot', 'gcKnb', 'gcVang', 'gcDt'].forEach(function (id) { $(id).addEventListener('input', veSum); $(id).addEventListener('change', veSum); });
    GC.built = true;
    veItems(); veChon();
  }

  // ----- chọn vật phẩm (giống tab Phát quà) -----
  function taiItems() {
    if (GC.items || GC.itemsLoading) return;
    GC.itemsLoading = true;
    api('/api/gameitems').then(function (j) {
      GC.items = (j.items || []).map(function (x) { return { id: String(x.id), n: x.n, k: boDau(x.n + ' ' + x.id) }; });
      GC.itemsLoading = false; veItems();
    }).catch(function (er) { GC.itemsLoading = false; loi(er); });
  }
  function daChon(id) { for (var i = 0; i < GC.chon.length; i++) if (GC.chon[i].id === id) return i; return -1; }
  function veItems() {
    var el = $('gcItems'); if (!el) return;
    if (!GC.items) { taiItems(); el.innerHTML = '<div class="empty">Đang tải danh mục vật phẩm...</div>'; return; }
    var q = boDau(GC.iq.trim());
    if (!q) { el.innerHTML = '<div class="empty">Gõ tên hoặc ID để tìm (' + so(GC.items.length) + ' vật phẩm).</div>'; return; }
    var L = GC.items.filter(function (x) { return x.k.indexOf(q) >= 0; }), hien = L.slice(0, 60), q0 = GC.iq;
    var ve = function () {
      el.innerHTML = hien.map(function (x) {
        return '<div class="gcIt' + (daChon(x.id) >= 0 ? ' on' : '') + '" data-gcit="' + x.id + '">' + vqaIc(icOf(x.id)) + '<div class="gcItT"><span class="gcItN" title="' + e(x.n) + '">' + e(x.n) + '</span><small>' + x.id + (daChon(x.id) >= 0 ? ' · đã thêm' : '') + '</small></div></div>';
      }).join('') + (L.length > 60 ? '<div class="empty">' + so(L.length) + ' món khớp, đang hiện 60 - gõ thêm để lọc</div>' : '') || '<div class="empty">Không món nào khớp.</div>';
    };
    ve(); icTra(hien.map(function (x) { return x.id; }), function () { if (GC.iq === q0 && $('gcItems') === el) ve(); });
  }
  function veChon() {
    var el = $('gcChon'); if (!el) return;
    el.innerHTML = GC.chon.length ? GC.chon.map(function (x, i) {
      return '<div class="gcC">' + vqaIc(icOf(x.id)) + '<div class="gcItT"><b title="' + e(x.ten) + '">' + e(x.ten) + '</b><small>' + x.id + '</small></div>' +
        '<label class="muted" style="font-size:12px;margin:0">SL</label><input type="number" min="1" max="9999" value="' + e(x.n) + '" data-gcsl="' + i + '">' +
        '<button type="button" class="gcX" data-gcbo="' + i + '" title="Bỏ món này">✕</button></div>';
    }).join('') : '<div class="muted" style="font-size:12.5px">Chưa chọn vật phẩm (có thể chỉ tặng KNB / Vàng / Điểm Tặng).</div>';
    veSum();
  }

  // ----- gom form -----
  function soO(id) { var v = String(($(id) || {}).value || '').trim(); return v === '' ? 0 : Number(v); }
  function goi() {
    var ma = maNhap();
    if (ma && !/^TL[A-Z0-9]{6}$/.test(ma)) return { loi: 'Mã phải là TL + 6 ký tự chữ A-Z hoặc số 0-9 (không có dấu -)' };
    var han = $('gcHan').value, hetHan = 0;
    if (han) { var t = new Date(han).getTime(); if (!isFinite(t)) return { loi: 'Hạn dùng không hợp lệ' }; hetHan = Math.floor(t / 1000); if (hetHan <= Date.now() / 1000) return { loi: 'Hạn dùng đã qua' }; }
    var lv = String($('gcLuot').value).trim(), luot = lv === '' ? 1 : Number(lv);
    if (!(Math.floor(luot) === luot && luot >= 0 && luot <= 100000)) return { loi: 'Tổng lượt 0 - 100.000' };
    var knb = soO('gcKnb'), vang = soO('gcVang'), dt = soO('gcDt');
    if (!(Math.floor(knb) === knb && knb >= 0 && knb <= 10000000)) return { loi: 'KNB 0 - 10.000.000' };
    if (!(Math.floor(vang) === vang && vang >= 0 && vang <= 100000)) return { loi: 'Vàng 0 - 100.000' };
    if (!(Math.floor(dt) === dt && dt >= 0 && dt <= 10000000)) return { loi: 'Điểm Tặng 0 - 10.000.000' };
    for (var i = 0; i < GC.chon.length; i++) { var n = Number(GC.chon[i].n); if (!(Math.floor(n) === n && n >= 1 && n <= 9999)) return { loi: 'Số lượng ' + GC.chon[i].ten + ' phải 1 - 9.999' }; }
    if (!GC.chon.length && !knb && !vang && !dt) return { loi: 'Chưa có quà' };
    var mo = GC.chon.map(function (x) { return x.ten + ' x' + so(x.n); });
    if (knb) mo.push(so(knb) + ' KNB'); if (vang) mo.push(so(vang) + ' Vàng'); if (dt) mo.push(so(dt) + ' Điểm Tặng');
    return { body: { ma: ma, hetHan: hetHan, tongLuot: luot, items: GC.chon.map(function (x) { return { id: x.id, n: Number(x.n) }; }), knb: knb, vang: vang, diemtang: dt, ghiChu: $('gcGhi').value },
      mo: mo.join(', '), ma: ma || 'ngẫu nhiên', han: hetHan ? ngay(hetHan) : 'không hết hạn', luot: luot ? so(luot) + ' lượt' : 'không giới hạn lượt' };
  }
  function veSum() {
    var el = $('gcSum'); if (!el) return;
    var g = goi();
    el.innerHTML = g.loi ? '<span class="bad">' + e(g.loi) + '</span>' :
      '<div>Mã: <b>' + e(g.ma) + '</b> · ' + e(g.han) + ' · ' + e(g.luot) + '</div><div>Quà: <b>' + e(g.mo) + '</b></div>';
    var b = $('gcGo'); if (b) { b.disabled = GC.busy || !!g.loi; b.textContent = GC.busy ? '⏳ Đang tạo...' : 'Tạo mã'; }
  }
  function xoaForm() {
    ['gcMa', 'gcHan', 'gcKnb', 'gcVang', 'gcDt', 'gcGhi'].forEach(function (id) { $(id).value = ''; });
    $('gcLuot').value = '1'; GC.chon = []; veChon(); veItems();
  }
  function veMoi() {
    var el = $('gcMoi'); if (!el) return;
    el.innerHTML = GC.moi ? '<div class="gcMoi"><span>✅ Vừa tạo:</span><code>' + e(GC.moi.ma) + '</code><button type="button" class="btn-grey" data-gccopy="' + e(GC.moi.ma) + '">📋 Copy mã</button>' +
      '<span style="font-size:12.5px;color:#cfe9da">' + e(GC.moi.mo) + '</span>' + (GC.moi.canhBao ? '<div class="gcWarn" style="flex-basis:100%">⚠️ ' + e(GC.moi.canhBao) + '</div>' : '') + '</div>' : '';
  }

  function tao() {
    var g = goi(); if (g.loi || GC.busy) return;
    uiConfirm('Tạo mã ' + g.ma + ': ' + g.mo + ' · ' + g.han + ' · ' + g.luot + '. Người chơi nhập mã là nhận quà thật trong game.', 'Tạo mã', 'btn-green').then(function (ok) {
      if (!ok) return;
      GC.busy = true; veSum();
      api('/api/gc/tao', g.body).then(function (j) {
        GC.busy = false; GC.moi = { ma: j.ma, mo: g.mo, canhBao: j.canhBao }; veMoi();
        toast('✅ Đã tạo mã ' + j.ma); xoaForm(); tai();
      }).catch(function (er) { GC.busy = false; veSum(); loi(er); });
    });
  }

  // ----- danh sách -----
  function quaHtml(q) {
    var h = (q.items || []).map(function (x) { var ten = x.ten || ('ID ' + x.id); return '<span class="gcQ" title="' + e(ten + ' (' + x.id + ') x' + x.n) + '">' + vqaIc(icOf(x.id)) + e(ten) + ' x' + so(x.n) + '</span>'; });
    if (q.knb) h.push('<span class="gcQ tien">💎 ' + so(q.knb) + ' KNB</span>');
    if (q.vang) h.push('<span class="gcQ tien">🪙 ' + Number(q.vang).toLocaleString('vi-VN', { maximumFractionDigits: 4 }) + ' Vàng</span>');
    if (q.diemtang) h.push('<span class="gcQ tien">🎀 ' + so(q.diemtang) + ' Điểm Tặng</span>');
    return '<div class="gcQs">' + h.join('') + '</div>';
  }
  function hanHtml(c, now) {
    if (!c.hetHan) return '<span class="muted">Không hết hạn</span>';
    if (now > c.hetHan) return '<span class="bad">Đã hết hạn</span><br><small class="muted">' + ngay(c.hetHan) + '</small>';
    return ngay(c.hetHan) + '<br><small class="muted">' + conLai(c.hetHan - now) + '</small>';
  }
  function locDs() {
    if (!GC.d) return [];
    var q = boDau(GC.q.trim());
    return GC.d.ds.filter(function (c) {
      if (GC.loc && c.trangThai !== GC.loc) return false;
      return !q || boDau(c.ma + ' ' + c.ghiChu + ' ' + c.qua.items.map(function (x) { return x.ten + ' ' + x.id; }).join(' ')).indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.tao || 0) - (a.tao || 0); });
  }
  function dungHtml(ma) {
    var m = GC.mo[ma];
    if (!m || m.dang) return '<div class="empty">Đang tải...</div>';
    if (!m.ds.length) return '<div class="empty">Chưa ai dùng mã này.</div>';
    return '<table><tr><th>Nhân vật</th><th>Tài khoản</th><th>GUID</th><th>Thời gian</th></tr>' + m.ds.map(function (x) {
      return '<tr><td><b>' + (x.ten ? e(x.ten) : '<span class="muted">(chưa rõ tên)</span>') + '</b></td><td>' + e(x.acc) + '</td><td>' + e(x.guid) + '</td><td>' + ngay(x.t) + '</td></tr>';
    }).join('') + '</table>';
  }
  function veList() {
    var el = $('gcList'); if (!el) return;
    if (!GC.d) { el.innerHTML = '<div class="empty">Đang tải...</div>'; return; }
    var now = GC.d.now, L = locDs(), dem = { bat: 0 };
    GC.d.ds.forEach(function (c) { if (c.trangThai === 'bat') dem.bat++; });
    $('gcN').textContent = GC.d.ds.length + ' mã · ' + dem.bat + ' đang dùng được' + (L.length !== GC.d.ds.length ? ' · đang hiện ' + L.length : '');
    el.innerHTML = L.length ? '<table><tr><th>Mã</th><th>Quà</th><th>Hạn dùng</th><th>Lượt</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr>' + L.map(function (c) {
      var t = TT[c.trangThai] || TT.bat, mo = !!GC.mo[c.ma];
      return '<tr class="' + (c.on ? '' : 'gcOff') + '"><td><span class="gcMa">' + e(c.ma) + '</span><button type="button" class="btn-grey gcMini" data-gccopy="' + e(c.ma) + '" title="Copy mã">📋</button>' +
        (c.tao ? '<br><small class="muted">tạo ' + ngay(Math.floor(c.tao / 1000)) + '</small>' : '') + '</td>' +
        '<td>' + quaHtml(c.qua) + '</td><td>' + hanHtml(c, now) + '</td>' +
        '<td><b>' + so(c.daDung) + '</b> / ' + (c.tongLuot ? so(c.tongLuot) : '<span title="không giới hạn">∞</span>') + '</td>' +
        '<td><span class="gcB ' + t[1] + '">' + t[0] + '</span></td><td style="max-width:220px;white-space:normal">' + e(c.ghiChu) + '</td>' +
        '<td><div class="gcAct">' + (c.on ? '<button type="button" class="btn-red" data-gcbat="0" data-ma="' + e(c.ma) + '">Tắt</button>' : '<button type="button" class="btn-green" data-gcbat="1" data-ma="' + e(c.ma) + '">Bật</button>') +
        '<button type="button" class="btn-grey" data-gcdung="' + e(c.ma) + '">👥 ' + (mo ? 'Ẩn' : 'Ai đã dùng') + ' (' + c.daDung + ')</button>' +
        '<button type="button" class="btn-red" data-gcxoa="' + e(c.ma) + '">Xóa</button></div></td></tr>' +
        (mo ? '<tr class="gcSub"><td colspan="7">' + dungHtml(c.ma) + '</td></tr>' : '');
    }).join('') + '</table>' : '<div class="empty">' + (GC.d.ds.length ? 'Không mã nào khớp bộ lọc.' : 'Chưa có mã nào. Tạo mã ở khung trên.') + '</div>';
    var le = $('gcLe');
    if (le) le.innerHTML = GC.d.le && GC.d.le.length ? '<div class="gcHint" style="margin-top:8px">Mã đã xoá nhưng còn lượt dùng trong giftcode-dung.txt: ' + GC.d.le.map(function (x) { return e(x.ma) + ' (' + x.n + ')'; }).join(', ') + ' (tạo lại cùng tên sẽ bị chặn).</div>' : '';
  }
  function veInfo() {
    var el = $('gcInfo'); if (!el || !GC.d) return;
    var h = 'Danh sách tài khoản cho game (giftcode-acc.txt): <b>' + so(GC.d.accN) + '</b> nhân vật' + (GC.d.accAt ? ', làm mới lúc ' + ngay(Math.floor(GC.d.accAt / 1000)) : '') + ' (tự làm mới mỗi 60 giây).';
    if (!GC.d.gameOk) h += '<div class="gcWarn">⚠️ Không thấy thư mục game trên máy chạy bot: mã chỉ lưu ở bot, chưa ghi file cho game.</div>';
    if (GC.d.accLoi) h += '<div class="gcWarn">⚠️ Không đọc được danh sách nhân vật: ' + e(GC.d.accLoi) + '. Nhân vật mới tạo sẽ chưa nhập mã được.</div>';
    el.innerHTML = h;
  }

  function tai() {
    return api('/api/gc/list', {}).then(function (j) {
      GC.d = j; veInfo(); veList();
      var ids = []; j.ds.forEach(function (c) { c.qua.items.forEach(function (x) { if (ids.indexOf(x.id) < 0) ids.push(x.id); }); });
      icTra(ids, function () { veList(); });
      Object.keys(GC.mo).forEach(function (ma) { taiDung(ma); });   // bảng "ai đã dùng" đang mở -> tải lại luôn
    }).catch(loi);
  }
  function taiDung(ma) {
    GC.mo[ma] = GC.mo[ma] || { dang: true, ds: [] };
    return api('/api/gc/dung', { ma: ma }).then(function (j) { if (GC.mo[ma]) { GC.mo[ma] = { ds: j.ds || [] }; veList(); } })
      .catch(function (er) { delete GC.mo[ma]; veList(); loi(er); });
  }
  function copy(s) {
    var ok = function () { toast('📋 Đã copy mã ' + s); };
    var tay = function () {
      var ta = document.createElement('textarea'), r = false; ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { r = document.execCommand('copy'); } catch (x) { r = false; }
      ta.remove(); if (r) ok(); else toast('📋 Mã: ' + s + ' (bôi đen rồi Ctrl+C)');
    };
    var cb = typeof navigator !== 'undefined' && navigator.clipboard;
    if (cb && cb.writeText) cb.writeText(s).then(ok, tay); else tay();
  }

  window.gcLoad = function () {
    if (!$('gcRoot')) return;
    if (!GC.built) khung();
    tai();
  };

  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t || !t.getAttribute) return;
    var i = t.getAttribute('data-gcsl'); if (i === null || !GC.chon[i]) return;
    GC.chon[i].n = t.value; veSum();
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t.closest || !t.closest('#gcRoot')) return;
    var cp = t.closest('[data-gccopy]'); if (cp) { copy(cp.getAttribute('data-gccopy')); return; }
    var it = t.closest('[data-gcit]'); if (it) {
      var id = it.getAttribute('data-gcit'), k = daChon(id);
      if (k >= 0) { toast('Món này đã có trong quà, sửa số lượng ở khung "Quà đã chọn"'); return; }
      if (GC.chon.length >= 20) { toast('❌ Tối đa 20 loại vật phẩm mỗi mã'); return; }
      var x = (GC.items || []).filter(function (y) { return y.id === id; })[0]; if (!x) return;
      GC.chon.push({ id: x.id, ten: x.n, n: 1 }); veChon(); veItems(); return;
    }
    var bo = t.closest('[data-gcbo]'); if (bo) { GC.chon.splice(Number(bo.getAttribute('data-gcbo')), 1); veChon(); veItems(); return; }
    var hn = t.closest('[data-gchan]'); if (hn) {
      var d = Number(hn.getAttribute('data-gchan'));
      if (!d) $('gcHan').value = ''; else { var dt = new Date(Date.now() + d * 86400000); dt.setSeconds(0, 0); $('gcHan').value = dtLocal(dt); }
      veSum(); return;
    }
    var bt = t.closest('[data-gcbat]'); if (bt) {
      var ma = bt.getAttribute('data-ma'), on = bt.getAttribute('data-gcbat') === '1';
      bt.disabled = true;
      api('/api/gc/bat', { ma: ma, on: on }).then(function (j) { toast((on ? '✅ Đã bật mã ' : '⏹️ Đã tắt mã ') + ma + (j.canhBao ? ' (⚠️ ' + j.canhBao + ')' : '')); tai(); })
        .catch(function (er) { bt.disabled = false; loi(er); });
      return;
    }
    var du = t.closest('[data-gcdung]'); if (du) {
      var m2 = du.getAttribute('data-gcdung');
      if (GC.mo[m2]) { delete GC.mo[m2]; veList(); } else { GC.mo[m2] = { dang: true, ds: [] }; veList(); taiDung(m2); }
      return;
    }
    var xo = t.closest('[data-gcxoa]'); if (xo) {
      var m3 = xo.getAttribute('data-gcxoa'), c = ((GC.d && GC.d.ds) || []).filter(function (y) { return y.ma === m3; })[0];
      uiConfirm('Xóa mã ' + m3 + (c && c.daDung ? ' (đã có ' + c.daDung + ' lượt dùng)' : '') + '? Người chơi nhập mã này sẽ bị báo "Mã không tồn tại". Lịch sử dùng vẫn giữ trong giftcode-dung.txt và không tạo lại được mã cùng tên.', 'Xóa', 'btn-red').then(function (ok) {
        if (!ok) return;
        api('/api/gc/xoa', { ma: m3 }).then(function () { delete GC.mo[m3]; toast('🗑️ Đã xóa mã ' + m3); tai(); }).catch(loi);
      });
      return;
    }
    var b = t.closest('[data-gc]'); if (!b) return;
    var a = b.getAttribute('data-gc');
    if (a === 'tai') tai();
    else if (a === 'ngaunhien') { $('gcMa').value = maNgauNhien(); veSum(); }
    else if (a === 'tao') tao();
  });
  // F5 đúng tab này: tab() đã chạy trước khi file này tải xong (lúc đó gcLoad chưa có) -> tự tải
  if ($('tab-gc') && !$('tab-gc').classList.contains('hidden')) window.gcLoad();
})();
