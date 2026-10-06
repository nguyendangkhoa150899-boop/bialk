// 🧰 07/10: giao dien RUONG ICH KY kieu Thuong Pho - phuc vu o /ik.js, doc lai moi lan tai -> sua khong can restart bot.
// (PC) TRAI = toan bo ruong (chia nhom theo loai). PHAI = 3 nut 📦 Nhan / 🎁 Tang / 🗑️ Xoa: chon 1 nut, bam mon ben ruong de dua sang,
// sua so luong duoi o, bam Xac nhan -> goi API cu (/api/ichky/claim | give | xoa) LAN LUOT tung mon, dung o loi dau tien.
// Phieu KNB (doi > 0): bam vao chinh no -> hop nho co nut 🎫 Su dung (/api/ichky/dung).
// Ghi de ikDraw() cua trang choi (webplay.js); dung chung: IK, api, esc, toast, vqIcon, isImg, vnd, gConfirm, setBal, ikBadge, ikTick, ikGio.
(function () {
  var css = [
    '#ikList .ikTwo{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}',
    // 07/10 chu server: PC trai = ruong (vat pham), phai = khung thao tac (giong Thuong Pho); dien thoai giu khung thao tac o tren cho de bam
    '@media(min-width:900px){#ikList .ikTwo{grid-template-columns:7fr minmax(300px,5fr)}#ikList .ikAc{order:2;position:sticky;top:10px;align-self:start}}',
    '#ikList .ikBag{border:1px solid #6b5420;border-radius:13px;padding:10px;background:linear-gradient(180deg,#1f1a10,#141824 60%);min-width:0}',
    '#ikList .ikAc{border-color:#2f6b46;background:linear-gradient(180deg,#10201a,#141824 60%)}',
    '#ikList .ikAc.m-tang{border-color:#2f5a8a;background:linear-gradient(180deg,#101a2a,#141824 60%)}',
    '#ikList .ikAc.m-xoa{border-color:#7a3434;background:linear-gradient(180deg,#2a1212,#141824 60%)}',
    '#ikList .ikBagT{display:flex;align-items:center;gap:6px;font-weight:900;color:#ffe08a;margin-bottom:8px}',
    '#ikList .ikBagT span{margin-left:auto;font-size:12px;color:var(--muted);font-weight:700}',
    '#ikList .ikMd{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}',
    '#ikList .ikMd button{padding:10px 4px;font-size:14px;font-weight:900;border-radius:11px;border:1px solid #2a3340;background:#151826;color:var(--tx);cursor:pointer}',
    '#ikList .ikMd button.on.m-nhan{background:linear-gradient(180deg,#5ef0a0,#2fbf71);color:#0c2417;border-color:#5ef0a0}',
    '#ikList .ikMd button.on.m-tang{background:linear-gradient(180deg,#7cc4ff,#3a86d6);color:#08172a;border-color:#7cc4ff}',
    '#ikList .ikMd button.on.m-xoa{background:linear-gradient(180deg,#ff8a8a,#d64545);color:#2a0808;border-color:#ff8a8a}',
    '#ikList .ikNote{font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:8px}',
    '#ikList .ikNote b{color:var(--tx)}',
    '#ikList select.ikTo{width:100%;box-sizing:border-box;background:#11141e;border:1px solid #2f5a8a;color:var(--tx);border-radius:9px;padding:8px 9px;font-size:14px;margin-bottom:8px}',
    '#ikList .ikBar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}',
    '#ikList .ikBar input{flex:1 1 140px;min-width:120px;width:auto;background:#11141e;border:1px solid #2a3340;color:var(--tx);border-radius:9px;padding:7px 9px;font-size:13px}',
    '#ikList .ikTab{background:#151826;border:1px solid #2a3340;color:var(--tx);border-radius:999px;padding:6px 11px;font-size:12px;font-weight:800;cursor:pointer}',
    '#ikList .ikTab.on{background:#3a2a0c;border-color:#f5c542;color:#ffd76a}',
    '#ikList .ikGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:5px;min-height:126px;align-content:start}',
    '#ikList .ikGH{grid-column:1/-1;font-size:12px;font-weight:900;color:#ffd76a;padding:6px 2px 2px;border-bottom:1px dashed #3b3220;margin-bottom:2px}',
    '#ikList .ikGH:first-child{padding-top:0}#ikList .ikGH span{color:var(--muted);font-weight:700}',
    '#ikList .ikO{position:relative;aspect-ratio:1;border:1px solid #3b3220;border-radius:8px;background:#0e1118;cursor:pointer;padding:0;overflow:hidden;width:100%;color:#fff}',
    '#ikList .ikO:hover{border-color:#f5c542;box-shadow:0 0 0 1px #f5c542 inset}',
    '#ikList .ikO.pk{border-color:#8a6a2a;box-shadow:0 0 0 1px #5a4418 inset}',
    '#ikList .ikO.het{opacity:.35}',
    '#ikList .ikO .ikIc{display:block;position:absolute;inset:3px;width:auto;height:auto;border-radius:6px;background-repeat:no-repeat}',
    '#ikList .ikO .ikIc.vqNo,#ikList .ikO .isPh{display:flex;position:absolute;inset:3px;align-items:center;justify-content:center;font-style:normal;font-size:24px;background:#1a1f2d;border-radius:6px}',
    '#ikList .ikO img{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain}',
    '#ikList .ikO .q{position:absolute;right:3px;bottom:1px;font-size:12px;font-weight:900;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 0 2px #000}',
    '#ikList .ikO .c{position:absolute;left:2px;top:1px;font-size:11px;font-weight:900;color:#7ee2a8;text-shadow:0 0 3px #000,0 0 3px #000}',
    '#ikList .ikAc .ikO:hover{border-color:#5ef0a0;box-shadow:0 0 0 1px #5ef0a0 inset}',
    '#ikList .ikRa{display:flex;flex-direction:column;align-items:center;gap:3px}',
    '#ikList .ikRa input{width:100%;box-sizing:border-box;background:#11141e;border:1px solid #2a3340;color:#7ee2a8;border-radius:6px;padding:2px 3px;font-size:12px;font-weight:800;text-align:center}',
    '#ikList .ikEmpty{grid-column:1/-1;padding:22px 8px;border:1px dashed #2a3340;border-radius:10px;text-align:center;color:var(--muted);font-size:12px}',
    '#ikList .ikSum{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}#ikList .ikSum b{color:#7ee2a8}',
    '#ikList .ikBtns{display:flex;gap:6px;margin-top:8px}',
    '#ikList .ikGo{flex:1;padding:10px;font-size:15px;font-weight:900;border:0;border-radius:11px;cursor:pointer;color:#0c2417;background:linear-gradient(180deg,#5ef0a0,#2fbf71)}',
    '#ikList .m-tang .ikGo{color:#08172a;background:linear-gradient(180deg,#7cc4ff,#3a86d6)}',
    '#ikList .m-xoa .ikGo{color:#2a0808;background:linear-gradient(180deg,#ff8a8a,#d64545)}',
    '#ikList .ikBo{padding:10px 12px;font-size:13px;font-weight:800;border:1px solid #2a3340;border-radius:11px;color:var(--tx);background:#151826;cursor:pointer}',
    '#ikList .ikGo:disabled,#ikList .ikBo:disabled{opacity:.45;cursor:not-allowed}',
    '#ikList .ikAll{width:100%;margin:0 0 8px;padding:10px;font-size:14px;font-weight:900;border:0;border-radius:11px;cursor:pointer;color:#2a1e00;background:linear-gradient(180deg,#ffe08a,#c9a227);box-shadow:0 2px 0 #7a5c10}',
    '#ikList .ikAll:disabled{opacity:.45;cursor:not-allowed}',
    // popup phieu KNB + danh sach trong popup xac nhan (nam ngoai #ikList)
    '#ikPop{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}',
    '#ikPop.hidden{display:none}',
    '#ikPop .bx{width:100%;max-width:340px;background:#171b27;border:1px solid #8a6a2a;border-radius:14px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.6)}',
    '#ikPop .hd{display:flex;align-items:center;gap:10px;margin-bottom:10px}#ikPop .hd b{color:#ffd76a;font-size:15px}',
    '#ikPop .pic{position:relative;width:52px;height:52px;flex:0 0 52px;border:1px solid #3b3220;border-radius:9px;background:#0e1118;overflow:hidden}',
    '#ikPop .pic .ikIc,#ikPop .pic img,#ikPop .pic .isPh{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);display:block;border-radius:6px;background-repeat:no-repeat;object-fit:contain}',
    '#ikPop .pic .vqNo,#ikPop .pic .isPh{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;background:#1a1f2d}',
    '#ikPop label{font-size:12px;color:var(--muted)}',
    '#ikPop input{width:100%;box-sizing:border-box;background:#11141e;border:1px solid #2a3340;color:#ffe08a;border-radius:8px;padding:8px;font-size:16px;font-weight:900;text-align:right;margin:4px 0 6px}',
    '#ikPop .sl{display:flex;gap:6px;margin-bottom:8px}#ikPop .sl button{flex:1;padding:6px;font-size:12px;font-weight:800;border-radius:8px;border:1px solid #2a3340;background:#151826;color:var(--tx)}',
    '#ikPop .bt{display:flex;flex-direction:column;gap:6px}',
    '#ikPop .bt button{padding:10px;font-size:14px;font-weight:900;border-radius:11px;border:0;cursor:pointer}',
    '#ikPop .use{background:linear-gradient(180deg,#ffe08a,#c9a227);color:#2a1e00}',
    '#ikPop .add{background:#151826;border:1px solid #2a3340!important;color:var(--tx)}',
    '#ikPop .huy{background:transparent;color:var(--muted);font-weight:700!important}',
    '#ikPop .use:disabled{opacity:.5}',
    '.ikCfL{margin:10px 0;display:flex;flex-direction:column;gap:4px;max-height:300px;overflow:auto}',
    '.ikCf{display:flex;align-items:center;gap:8px;background:#0e1118;border:1px solid #262c3d;border-radius:8px;padding:3px 8px 3px 3px;font-size:13px;text-align:left}',
    '.ikCf>span{flex:1;min-width:0}.ikCf b{color:#ffd76a;white-space:nowrap}',
    '.ikCf .pic{position:relative;width:28px;height:28px;flex:0 0 28px}',
    '.ikCf .ikIc,.ikCf img,.ikCf .isPh{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:5px;background-repeat:no-repeat;object-fit:contain}',
    '.ikCf .vqNo,.ikCf .isPh{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:15px;background:#1a1f2d}',
    '#ikTip{position:fixed;z-index:9999;pointer-events:none;max-width:260px;background:rgba(8,10,16,.96);border:1px solid #8a6a2a;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;color:#e8e8e8;box-shadow:0 6px 18px rgba(0,0,0,.6);display:none}',
    '#ikTip .n{font-size:14px;font-weight:900;color:#ffd76a;margin-bottom:2px}#ikTip .x{color:#9aa3b8}#ikTip .g{color:#7ee2a8}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var tip = document.createElement('div'); tip.id = 'ikTip'; document.body.appendChild(tip);
  var pop = document.createElement('div'); pop.id = 'ikPop'; pop.className = 'hidden'; document.body.appendChild(pop);
  pop.addEventListener('click', function (ev) { if (ev.target === pop) ikcPopDong(); });

  var MD = {
    nhan: { t: '📦 Nhận', go: '📦 Nhận vào game', note: 'Đưa đồ vào túi trong game - nhân vật phải đang <b>ONLINE</b>. Bot giao lần lượt từng món.' },
    tang: { t: '🎁 Tặng', go: '🎁 Tặng', note: 'Chuyển thẳng sang rương người nhận, họ <b>không cần online</b>. Tặng rồi là <b>không lấy lại được</b>.' },
    xoa: { t: '🗑️ Xoá', go: '🗑️ Xoá vĩnh viễn', note: 'Bỏ hẳn khỏi rương, <b>không hoàn gì, không lấy lại được</b>.' }
  };
  // 07/10 chu server: "sap xep theo loai" - nhom theo dau ID (bang vat pham game), phieu KNB rieng
  var LOAI = [['phieu', '🎫 Phiếu KNB'], ['ngoc', '💎 Ngọc'], ['tb', '⚔️ Trang bị'], ['cuoi', '🐎 Thú cưỡi · Ngoại hình'], ['nl', '🧪 Nguyên liệu'], ['dc', '🎒 Đạo cụ']];
  var TEN_LOAI = {}; LOAI.forEach(function (l) { TEN_LOAI[l[0]] = l[1]; });
  function loai(x) {
    if (x.doi > 0) return 'phieu';
    var id = String(x.id);
    if (/^5/.test(id)) return 'ngoc';
    if (/^10(14|55)/.test(id)) return 'cuoi';
    if (/^1/.test(id)) return 'tb';
    if (/^2/.test(id)) return 'nl';
    return 'dc';
  }
  var C = { md: 'nhan', chon: {}, loc: 'all', q: '', to: '', busy: false };
  try { var c0 = JSON.parse(localStorage.getItem('ik_cfg') || '{}'); if (MD[c0.md]) C.md = c0.md; if (c0.loc) C.loc = c0.loc; } catch (e) { }
  function luuCfg() { try { localStorage.setItem('ik_cfg', JSON.stringify({ md: C.md, loc: C.loc })); } catch (e) { } }
  function e(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('vi-VN'); }
  function ds() { return (typeof IK !== 'undefined' && IK && IK.items) || []; }
  function tim(id) { var L = ds(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function ic(x) { if (!x.img && x.ic && typeof vqIcon === 'function') return vqIcon(x.ic, 'ikIc'); if (typeof isImg === 'function') return isImg(x.img); return '<i class="ikIc vqNo">📦</i>'; }
  // so toi da chon duoc cua 1 mon o che do hien tai (0 = khong chon duoc)
  function tran(x, md) {
    md = md || C.md;
    if (md === 'nhan') return x.doi > 0 ? 0 : (x.rutMax ? Math.min(x.qty, x.rutMax) : x.qty);
    if (md === 'tang') return Math.min(x.qty, (IK && IK.giveMax) || x.qty);
    return x.qty;
  }
  function donChon() {
    Object.keys(C.chon).forEach(function (id) { var x = tim(id), t = x ? tran(x) : 0; if (!t) delete C.chon[id]; else if (C.chon[id] > t) C.chon[id] = t; });
  }
  function xep(L) {
    var th = {}; LOAI.forEach(function (l, i) { th[l[0]] = i; });
    return L.slice().sort(function (a, b) { return (th[loai(a)] - th[loai(b)]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  }
  function boLoc(L) {
    var q = C.q.trim().toLowerCase(), tk = [];
    q.split(',').forEach(function (p) { p = p.trim(); if (!p) return; if (/^\d+(\s+\d+)*$/.test(p)) tk = tk.concat(p.split(/\s+/)); else tk.push(p); });
    return L.filter(function (x) {
      if (!tk.length) return C.loc === 'all' || loai(x) === C.loc;   // dang tim thi tim moi loai
      var ten = String(x.name).toLowerCase();
      for (var i = 0; i < tk.length; i++) if (x.id === tk[i] || ten.indexOf(tk[i]) >= 0) return true;
      return false;
    });
  }

  // ---- tooltip ----
  function tipHtml(x) {
    var c = C.chon[x.id] || 0, t = tran(x);
    return '<div class="n">' + e(x.name) + '</div><div>Trong rương: <b>' + fmt(x.qty) + '</b></div>' +
      (c ? '<div class="g">Đang chọn ' + MD[C.md].t + ': <b>' + fmt(c) + '</b></div>' : '') +
      (x.doi > 0 ? '<div style="color:#ffe08a">🎫 Mỗi phiếu = ' + fmt(x.doi) + ' KNB web · bấm để Sử dụng</div>' : '') +
      (C.md === 'nhan' && x.rutMax ? '<div class="x">Nhận tối đa ' + x.rutMax + ' cái / lần (mỗi cái 1 ô túi)</div>' : '') +
      (C.md === 'tang' && !(x.doi > 0) && t < x.qty ? '<div class="x">Tặng tối đa ' + fmt(t) + ' / lần</div>' : '') +
      '<div class="x">' + TEN_LOAI[loai(x)] + ' · ID ' + e(x.id) + '</div>';
  }
  document.addEventListener('mousemove', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-ik]') : null;
    if (!t) { tip.style.display = 'none'; return; }
    var x = tim(t.getAttribute('data-ik')); if (!x) { tip.style.display = 'none'; return; }
    tip.innerHTML = tipHtml(x); tip.style.display = 'block';
    var w = tip.offsetWidth, h = tip.offsetHeight, X = ev.clientX + 14, Y = ev.clientY + 14;
    if (X + w > window.innerWidth - 6) X = ev.clientX - w - 14; if (Y + h > window.innerHeight - 6) Y = ev.clientY - h - 14;
    tip.style.left = Math.max(4, X) + 'px'; tip.style.top = Math.max(4, Y) + 'px';
  });

  // ---- ve ----
  function oKho(x) {
    var con = x.qty - (C.chon[x.id] || 0), pk = x.doi > 0;
    return '<button class="ikO' + (pk ? ' pk' : '') + (con <= 0 ? ' het' : '') + '" data-ik="' + e(x.id) + '" onclick="ikcVao(\'' + e(x.id) + '\')">' + ic(x) +
      (C.chon[x.id] ? '<span class="c">✓' + fmt(C.chon[x.id]) + '</span>' : '') + '<span class="q">' + (con > 0 && (con > 1 || C.chon[x.id]) ? fmt(con) : '') + '</span></button>';
  }
  function oRa(x, n) {
    return '<div class="ikRa"><button class="ikO" data-ik="' + e(x.id) + '" onclick="ikcRa(\'' + e(x.id) + '\')" title="Bấm để trả về rương">' + ic(x) + '<span class="q">' + fmt(n) + '</span></button>' +
      '<input type="number" min="1" max="' + tran(x) + '" value="' + n + '" onchange="ikcSo(\'' + e(x.id) + '\',this.value)" onclick="this.select()"></div>';
  }
  function chonDs() { return Object.keys(C.chon).filter(function (id) { return C.chon[id] > 0 && tim(id); }); }
  function nguoiOpt() {
    var L = (typeof IKNG !== 'undefined' && IKNG) || null;
    if (!L) return '<option value="">Đang tải danh sách...</option>';
    return '<option value="">-- chọn người nhận --</option>' + L.map(function (p) { return '<option value="' + e(p.id) + '"' + (String(p.id) === C.to ? ' selected' : '') + '>' + e(p.name || p.id) + '</option>'; }).join('');
  }
  function taiNguoi() {
    if (typeof IKNG !== 'undefined' && IKNG) return;
    api('/api/players').then(function (j) { IKNG = (j.list || []).filter(function (p) { return String(p.id) !== String(typeof MYID !== 'undefined' ? MYID : ''); }); ve(); }).catch(function () { });
  }
  function ve() {
    var box = document.getElementById('ikList'); if (!box || !IK) return;
    var L = ds(), md = MD[C.md];
    if (!L.length) { box.innerHTML = '<div class="ikEmpty" style="margin-top:10px">Rương trống. Qua 🏪 Shop Item bấm <b>🧰 Vào rương</b>, hoặc quay 🍀 Vòng Quay / nhận 🎁 Túi Boss - đồ sẽ vào đây.</div>'; return; }
    donChon();
    // ---- trai: thao tac ----
    var ks = chonDs(), mon = 0; ks.forEach(function (id) { mon += C.chon[id]; });
    var h = '<div class="ikTwo"><div class="ikBag ikAc m-' + C.md + '"><div class="ikMd">' +
      Object.keys(MD).map(function (k) { return '<button class="m-' + k + (C.md === k ? ' on' : '') + '" onclick="ikcMd(\'' + k + '\')">' + MD[k].t + '</button>'; }).join('') + '</div>' +
      '<div class="ikNote">' + md.note + ' Bấm món bên <b>rương</b> để đưa sang đây, sửa số dưới ô, rồi bấm xác nhận.</div>';
    if (C.md === 'tang') { taiNguoi(); h += '<select class="ikTo" onchange="ikcTo(this.value)">' + nguoiOpt() + '</select>'; }
    h += '<div class="ikBagT">' + md.t + ' <span>' + ks.length + ' loại · ' + fmt(mon) + ' món</span></div><div class="ikGrid">';
    h += ks.length ? ks.map(function (id) { return oRa(tim(id), C.chon[id]); }).join('') : '<div class="ikEmpty">Bấm món bên rương để đưa sang đây</div>';
    h += '</div>';
    if (C.md === 'nhan' && ks.length) h += '<div class="ikSum">Cần trống khoảng <b>' + fmt(mon) + '</b> ô túi nếu món không chồng được. Mỗi món giao 1 lượt.</div>';
    if (C.md === 'tang' && ks.length && IK.giveMax) h += '<div class="ikSum">Mỗi món tặng tối đa <b>' + fmt(IK.giveMax) + '</b> / lần.</div>';
    h += '<div class="ikBtns"><button class="ikBo" onclick="ikcBoHet()"' + (ks.length && !C.busy ? '' : ' disabled') + '>↩ Bỏ hết</button>' +
      '<button class="ikGo" id="ikcGo" onclick="ikcGo()"' + (ks.length && !C.busy && (C.md !== 'tang' || C.to) ? '' : ' disabled') + '>' + (C.busy ? '⏳ Đang xử lý...' : md.go) + '</button></div></div>';
    // ---- phai: ruong ----
    var tong = L.reduce(function (t, x) { return t + x.qty; }, 0), dem = {};
    L.forEach(function (x) { var l = loai(x); dem[l] = (dem[l] || 0) + 1; });
    if (C.loc !== 'all' && !dem[C.loc]) C.loc = 'all';
    var tab = function (v, t, n) { return '<button class="ikTab' + (C.loc === v ? ' on' : '') + '" onclick="ikcLoc(\'' + v + '\')">' + t + ' <span style="opacity:.7">' + n + '</span></button>'; };
    // 07/10 chu server: nut dung HET phieu KNB - chi hien khi co phieu
    var PH = L.filter(function (x) { return x.doi > 0; }), knbPh = PH.reduce(function (t, x) { return t + x.qty * x.doi; }, 0);
    h += '<div class="ikBag"><div class="ikBagT">🧰 Rương <span>' + L.length + ' loại · ' + fmt(tong) + ' món</span></div>' +
      (PH.length ? '<button class="ikAll" onclick="ikcDungHet()"' + (C.busy ? ' disabled' : '') + '>🎫 Sử dụng toàn bộ phiếu Kim Nguyên Bảo · ' + fmt(PH.reduce(function (t, x) { return t + x.qty; }, 0)) + ' phiếu = +' + fmt(knbPh) + ' KNB</button>' : '') +
      '<div class="ikBar">' + tab('all', 'Tất cả', L.length) + LOAI.filter(function (l) { return dem[l[0]]; }).map(function (l) { return tab(l[0], l[1], dem[l[0]]); }).join('') +
      '<input id="ikcQ" placeholder="Tìm tên hoặc ID" value="' + e(C.q) + '" oninput="ikcTim(this.value)"></div><div class="ikGrid">';
    var X = xep(boLoc(L)), cu = '';
    if (!X.length) h += '<div class="ikEmpty">Không có món khớp bộ lọc</div>';
    X.forEach(function (x) {
      var l = loai(x);
      if (l !== cu) { cu = l; h += '<div class="ikGH">' + TEN_LOAI[l] + ' <span>· ' + X.filter(function (y) { return loai(y) === l; }).length + '</span></div>'; }
      h += oKho(x);
    });
    h += '</div></div></div>';
    var foc = document.activeElement && document.activeElement.id === 'ikcQ', pos = foc ? document.activeElement.selectionStart : 0;
    var sy = window.scrollY;
    box.style.minHeight = box.offsetHeight + 'px'; box.innerHTML = h; box.style.minHeight = '';
    if (window.scrollY !== sy) window.scrollTo(window.scrollX, sy);
    if (foc) { var q = document.getElementById('ikcQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { } } }
  }

  // ghi de ikDraw cua trang: phan dau giu nguyen (nhan so, dong ho, dong trang thai, ai tang hom nay), phan danh sach = ve()
  window.ikDraw = function () {
    if (!IK) return;
    if (typeof ikBadge === 'function') ikBadge(IK.total); if (typeof ikTick === 'function') ikTick();
    var stt = document.getElementById('ikStat'); if (stt) stt.innerHTML = 'Đang giữ <b>' + IK.total + '</b> món · hôm nay đã mua vào rương <b>' + IK.boughtToday + '/' + IK.dayMax + '</b> (còn ' + IK.leftToday + ')';
    var nh = document.getElementById('ikNhan'), NL = IK.nhan || [];
    if (nh) { nh.classList.toggle('hidden', !NL.length); if (NL.length) nh.innerHTML = '🎁 <b>Hôm nay bạn được tặng:</b><br>' + NL.map(function (g) { return '• <b>' + e(g.tu) + '</b> tặng ' + g.qty + ' ' + e(g.ten) + ' <span class="muted">(' + (typeof ikGio === 'function' ? ikGio(g.at) : '') + ')</span>'; }).join('<br>'); }
    var w = document.getElementById('ikWarn'); if (w) w.innerHTML = '♾️ Rương giữ <b>vĩnh viễn</b>. Chọn <b>📦 Nhận</b> / <b>🎁 Tặng</b> / <b>🗑️ Xoá</b> ở khung thao tác, bấm món trong rương để chọn nhiều món, rồi xác nhận một lần. <b>🎫 Phiếu KNB</b>: bấm vào phiếu để Sử dụng.';
    var gv = document.getElementById('ikGv'); if (gv) gv.classList.add('hidden');
    ve();
  };

  // ---- hanh dong ----
  function ban() { if (C.busy || (typeof IKBUSY !== 'undefined' && IKBUSY)) { toast('⏳ Đang xử lý - chờ chút'); return true; } return false; }
  window.ikcMd = function (m) { if (ban() || !MD[m]) return; C.md = m; luuCfg(); donChon(); tip.style.display = 'none'; ve(); };
  window.ikcLoc = function (v) { C.loc = v; luuCfg(); ve(); };
  window.ikcTim = function (v) { C.q = v; ve(); };
  window.ikcTo = function (v) { C.to = String(v || ''); ve(); };
  window.ikcVao = function (id) {
    if (ban()) return; var x = tim(id); if (!x) return; tip.style.display = 'none';
    if (x.doi > 0) return popPhieu(x);
    var t = tran(x), co = C.chon[id] || 0;
    if (!t) return toast('⚠️ Món này không ' + MD[C.md].t.slice(3).toLowerCase() + ' được');
    if (co >= t) return toast(co >= x.qty ? 'Đã chọn hết món này' : '⚠️ ' + MD[C.md].t + ' tối đa ' + fmt(t) + ' cái mỗi lần');
    C.chon[id] = t; ve();
  };
  window.ikcRa = function (id) { if (ban()) return; delete C.chon[id]; tip.style.display = 'none'; ve(); };
  window.ikcSo = function (id, v) {
    if (ban()) return; var x = tim(id); if (!x) return; var n = Math.floor(Number(v) || 0), t = tran(x);
    if (n > t) toast('⚠️ Tối đa ' + fmt(t));
    if (n <= 0) delete C.chon[id]; else C.chon[id] = Math.min(n, t);
    ve();
  };
  window.ikcBoHet = function () { if (ban()) return; C.chon = {}; ve(); };
  function dongMon(x, n) { return '<div class="ikCf"><span class="pic">' + ic(x) + '</span><span>' + e(x.name) + '</span><b>×' + fmt(n) + '</b></div>'; }
  window.ikcGo = function () {
    if (ban()) return;
    var md = C.md, ks = chonDs(); if (!ks.length) return;
    var to = C.to, tenTo = '';
    if (md === 'tang') {
      if (!to) return toast('Chọn người nhận');
      ((typeof IKNG !== 'undefined' && IKNG) || []).forEach(function (p) { if (String(p.id) === to) tenTo = p.name || p.id; });
    }
    var viec = ks.map(function (id) { return { id: id, n: C.chon[id] }; }), mon = 0; viec.forEach(function (v) { mon += v.n; });
    var msg = (md === 'nhan' ? 'Nhận <b>' + viec.length + ' loại (' + fmt(mon) + ' món)</b> vào túi trong game? Nhân vật phải đang <b>ONLINE</b>.'
      : md === 'tang' ? 'Tặng <b>' + viec.length + ' loại (' + fmt(mon) + ' món)</b> cho <b style="color:#7cc4ff">' + e(tenTo || to) + '</b>?'
        : 'XOÁ <b>' + viec.length + ' loại (' + fmt(mon) + ' món)</b> khỏi rương?') +
      '<div class="ikCfL">' + viec.slice(0, 8).map(function (v) { return dongMon(tim(v.id), v.n); }).join('') + (viec.length > 8 ? '<div class="muted" style="font-size:12px">+ ' + (viec.length - 8) + ' loại khác</div>' : '') + '</div>' +
      (md === 'nhan' ? '' : '<div style="font-size:13px;color:#ffb4b4">' + (md === 'tang' ? 'Tặng rồi là <b>không lấy lại được</b>.' : '<b>Không hoàn gì, không lấy lại được.</b>') + '</div>');
    if (typeof gConfirm !== 'function') return toast('❌ Trang chưa tải xong, F5 rồi thử lại');
    tip.style.display = 'none';
    gConfirm(msg, MD[md].go, md === 'xoa').then(function (ok) {
      if (!ok) return;
      C.busy = true; ve();
      var xong = 0, i = 0, url = md === 'nhan' ? '/api/ichky/claim' : md === 'tang' ? '/api/ichky/give' : '/api/ichky/xoa';
      var nut = function () { var b = document.getElementById('ikcGo'); if (b) b.textContent = '⏳ ' + (i + 1) + '/' + viec.length + '...'; };
      var ket = function (loi) {
        C.busy = false;
        if (loi) toast('❌ ' + (xong ? 'Đã xong ' + xong + '/' + viec.length + ' món. Dừng ở ' + (tim(viec[i].id) || { name: viec[i].id }).name + ': ' : '') + loi);
        else toast((md === 'nhan' ? '✅ Đã gửi ' : md === 'tang' ? '🎁 Đã tặng ' : '🗑️ Đã xoá ') + viec.length + ' loại (' + fmt(mon) + ' món)' + (md === 'nhan' ? ' - vào túi khi đăng nhập hoặc đổi bản đồ' : ''));
        donChon(); window.ikDraw();
        if (loi && typeof ikSync === 'function') ikSync();
      };
      var mot = function () {
        if (i >= viec.length) return ket(null);
        nut(); var v = viec[i], body = { itemId: v.id, qty: v.n }; if (md === 'tang') body.toId = to;
        api(url, body).then(function (j) {
          if (j && j.state) IK = j.state;
          delete C.chon[v.id]; xong++; i++; mot();
        }).catch(function (er) { ket(er.message || 'lỗi'); });
      };
      mot();
    });
  };

  // 🎫 dung HET phieu KNB trong ruong (moi loai phieu 1 lan goi /api/ichky/dung, ca chong)
  window.ikcDungHet = function () {
    if (ban()) return;
    var PH = ds().filter(function (x) { return x.doi > 0 && x.qty > 0; }); if (!PH.length) return;
    var so = 0, knb = 0; PH.forEach(function (x) { so += x.qty; knb += x.qty * x.doi; });
    var msg = 'Dùng <b>toàn bộ ' + fmt(so) + ' phiếu</b> lấy <b style="color:#ffe08a">+' + fmt(knb) + ' KNB</b> vào ví web?' +
      '<div class="ikCfL">' + PH.map(function (x) { return dongMon(x, x.qty); }).join('') + '</div>' +
      (Object.keys(C.chon).some(function (id) { var x = tim(id); return x && x.doi > 0; }) ? '<div style="font-size:13px;color:#ffb4b4">Phiếu đang chọn ở khung thao tác cũng được dùng luôn.</div>' : '');
    if (typeof gConfirm !== 'function') return toast('❌ Trang chưa tải xong, F5 rồi thử lại');
    tip.style.display = 'none';
    gConfirm(msg, '🎫 Sử dụng toàn bộ').then(function (ok) {
      if (!ok) return;
      C.busy = true; ve();
      var i = 0, cong = 0;
      var ket = function (loi) {
        C.busy = false; donChon(); window.ikDraw();
        if (loi) { toast('❌ ' + (cong ? 'Đã cộng +' + fmt(cong) + ' KNB. ' : '') + loi); if (typeof ikSync === 'function') ikSync(); }
        else toast('🎫 Đã dùng ' + fmt(so) + ' phiếu = +' + fmt(knb) + ' KNB');
      };
      var mot = function () {
        if (i >= PH.length) return ket(null);
        var x = PH[i];
        api('/api/ichky/dung', { itemId: x.id, qty: x.qty }).then(function (j) {
          cong += x.qty * x.doi; i++;
          if (typeof j.balance === 'number' && typeof setBal === 'function') setBal(j.balance);
          if (j.state) IK = j.state;
          mot();
        }).catch(function (er) { ket(er.message || 'lỗi'); });
      };
      mot();
    });
  };

  // ---- phieu KNB: bam vao chinh no ----
  var PK = null;
  function popPhieu(x) {
    PK = x.id; var co = x.qty - (C.chon[x.id] || 0);
    // 07/10 chu server: phieu van TANG duoc - nut Tang luon hien (dang o che do khac thi tu chuyen sang 🎁 Tang)
    var them = '<button class="add" onclick="ikcPkChon(\'tang\')">🎁 Tặng phiếu này (chọn vào khung thao tác)</button>' +
      (C.md === 'xoa' ? '<button class="add" onclick="ikcPkChon(\'xoa\')">🗑️ Xoá phiếu này (chọn vào khung thao tác)</button>' : '');
    pop.innerHTML = '<div class="bx"><div class="hd"><span class="pic">' + ic(x) + '</span><div><b>' + e(x.name) + '</b><div class="muted" style="font-size:12px">Đang có ' + fmt(x.qty) + ' · mỗi phiếu = <b style="color:#ffe08a">' + fmt(x.doi) + '</b> KNB web</div></div></div>' +
      '<label>Số lượng</label><input id="ikcPkQ" type="number" min="1" max="' + x.qty + '" value="' + Math.max(1, co) + '" oninput="ikcPkTinh()" onclick="this.select()">' +
      '<div class="sl"><button onclick="ikcPkSo(1)">1</button><button onclick="ikcPkSo(10)">10</button><button onclick="ikcPkSo(' + x.qty + ')">Tất cả</button></div>' +
      '<div class="bt"><button class="use" id="ikcPkUse" onclick="ikcPkDung()">🎫 Sử dụng</button>' + them + '<button class="huy" onclick="ikcPopDong()">Đóng</button></div></div>';
    pop.classList.remove('hidden'); ikcPkTinh();
  }
  window.ikcPopDong = function () { pop.classList.add('hidden'); PK = null; };
  function pkSo() { var x = tim(PK); var q = Math.floor(Number((document.getElementById('ikcPkQ') || {}).value) || 0); return { x: x, q: x ? Math.max(0, Math.min(q, x.qty)) : 0 }; }
  window.ikcPkSo = function (n) { var i = document.getElementById('ikcPkQ'), x = tim(PK); if (i && x) { i.value = Math.min(n, x.qty); ikcPkTinh(); } };
  window.ikcPkTinh = function () { var r = pkSo(), b = document.getElementById('ikcPkUse'); if (b && r.x) { b.textContent = r.q ? '🎫 Sử dụng ' + fmt(r.q) + ' phiếu = +' + fmt(r.q * r.x.doi) + ' KNB' : '🎫 Sử dụng'; b.disabled = !r.q; } };
  window.ikcPkChon = function (m) {
    var r = pkSo(); if (!r.x || !r.q) return toast('Nhập số lượng');
    if (MD[m] && C.md !== m) { C.md = m; luuCfg(); donChon(); }
    var t = tran(r.x); if (r.q > t) toast('⚠️ ' + MD[C.md].t + ' tối đa ' + fmt(t) + ' / lần');
    C.chon[r.x.id] = Math.min(r.q, t); ikcPopDong(); ve();
  };
  window.ikcPkDung = function () {
    if (ban()) return; var r = pkSo(); if (!r.x || !r.q) return toast('Nhập số lượng');
    var b = document.getElementById('ikcPkUse'); if (b) { b.disabled = true; b.textContent = '⏳ Đang dùng...'; }
    C.busy = true;
    api('/api/ichky/dung', { itemId: r.x.id, qty: r.q }).then(function (j) {
      C.busy = false; ikcPopDong(); toast(j.message || '🎫 Đã dùng');
      if (typeof j.balance === 'number' && typeof setBal === 'function') setBal(j.balance);
      if (j.state) { IK = j.state; window.ikDraw(); } else if (typeof ikSync === 'function') ikSync();
    }).catch(function (er) { C.busy = false; ikcPkTinh(); toast('❌ ' + er.message); if (typeof ikSync === 'function') ikSync(); });
  };

  // trang dang mo san (F5 o trang ruong, script tai sau go()) -> tu tai
  var pg = document.getElementById('pageIk');
  if (pg && !pg.classList.contains('hidden') && typeof ikSync === 'function') ikSync();
  else if (typeof IK !== 'undefined' && IK) window.ikDraw();
})();
