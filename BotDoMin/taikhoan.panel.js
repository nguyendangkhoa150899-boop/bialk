// 👤 19/10 TAB TÀI KHOẢN (chủ server) - phục vụ ở /tk.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Gộp theo NGƯỜI = 1 tài khoản game: tài khoản + nhân vật (panel GM, /api/gm/state) + ví web (/api/tk/data, chỉ SUPER, không có mật khẩu).
// Ghép ở trình duyệt: ví gắn tài khoản theo gameAcc, không có thì theo GUID nhân vật đã liên kết thuộc tài khoản đó.
// Ví không ghép được = "Ví chỉ có Discord"; tài khoản không có ví = "Tài khoản chưa có ví".
// Thao tác: /api/gm/act (tao_tk, doi_mk, go_ket, khoa_tk, xoa_tk, gm_bat, gm_tat, huy_qua), /api/points/add|subtract|set|delete,
// /api/debt/add|clear, /api/tlbb/lienket, /api/tlbb/taoclone. Hàm chung của panel: api, toast, uiConfirm, runBtn, tab, logout, pqMo.
// Thay cho: bảng ví ở tab 💰 (cũ 👥 Người chơi & Ví), khung 🔗 Liên kết ở tab 🛒, khung tài khoản ở tab 🛠️, bảng nhân vật ở tab ⚙️.
(function () {
  var TK = { gm: null, w: null, ds: [], gmLoi: '', wLoi: '', luc: '', q: '', loc: 'all', sel: null, selUids: [], detKey: null, boKeep: false,
    built: false, timer: null, busy: 0, dangTai: null, moTao: false };
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function so(x) { return Number(x || 0).toLocaleString('vi-VN'); }
  function boDau(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
  function thuong(s) { return String(s || '').trim().toLowerCase(); }

  function css() {
    if ($('tkCss')) return;
    var s = document.createElement('style'); s.id = 'tkCss';
    s.textContent =
      '#tkRoot{display:grid;gap:14px}#tkRoot .card{margin:0}#tkRoot h2{margin:0;font-size:19px}#tkRoot h2 small{font-weight:400;color:var(--mut);font-size:13px;margin-left:6px}' +
      '#tkRoot input,#tkRoot select{margin:0}#tkRoot button{padding:7px 12px;font-size:13px;border-radius:8px;white-space:nowrap}' +
      '#tkRoot .tkTop{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between}' +
      '#tkRoot .tkStats{display:flex;flex-wrap:wrap;gap:8px}#tkRoot .tkStat{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:6px 12px;font-size:12.5px;color:var(--mut);white-space:nowrap}' +
      '#tkRoot .tkStat b{display:block;font-size:16px;color:var(--txt);font-variant-numeric:tabular-nums}' +
      '#tkRoot .tkBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}#tkRoot .tkBar input{flex:1 1 260px;width:auto;padding:9px 12px}' +
      '#tkRoot .tkSeg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}#tkRoot .tkSeg button{background:var(--card2);border:1px solid var(--line);color:var(--txt);font-weight:600}' +
      '#tkRoot .tkSeg button.on{background:var(--blue);border-color:var(--blue);color:#fff}#tkRoot .tkSeg button.canh:not(.on){color:#ffb070;border-color:#6a4a22}' +
      '#tkRoot .tkSeg button span{opacity:.8;margin-left:4px;font-variant-numeric:tabular-nums}' +
      '#tkRoot .tkTao{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;padding:10px;border:1px dashed #3a4a66;border-radius:10px}' +
      '#tkRoot .tkTao input{flex:1 1 170px;width:auto;padding:8px 10px}' +
      '#tkRoot .tkLoi{margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(242,63,67,.12);border:1px solid rgba(242,63,67,.45);color:#ffb0b2;font-size:13px}' +
      '#tkRoot .tkMain{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:14px;align-items:start}' +
      '#tkRoot .tkListN{font-size:12.5px;color:var(--mut);margin-bottom:8px}' +
      '#tkRoot .tkList{border:1px solid var(--line);border-radius:10px}' +   // 19/10 vòng 2: không cuộn lồng trong trang, cuộn trang là đủ (chi tiết dính bên phải)
      '#tkRoot .tkRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;padding:9px 12px;border-bottom:1px solid var(--line);cursor:pointer;border-left:3px solid transparent}' +
      '#tkRoot .tkRow:last-child{border-bottom:0}#tkRoot .tkRow:hover{background:var(--card2)}#tkRoot .tkRow.sel{background:rgba(88,101,242,.16);border-left-color:var(--blue)}' +
      '#tkRoot .tkR1,#tkRoot .tkR2,#tkRoot .tkR3{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#tkRoot .tkR2,#tkRoot .tkR3{grid-column:1/-1;font-size:12.5px;color:var(--mut)}' +
      '#tkRoot .tkTen{font-size:14.5px;margin-right:6px}#tkRoot .tkKnb{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}' +
      '#tkRoot .tkR2 b{color:var(--txt);font-weight:600}#tkRoot .tkSep{opacity:.5}#tkRoot .tkC1{margin-right:12px}#tkRoot .tkNo{color:#ff8a8d;font-weight:700}' +
      '#tkRoot .tkGm{color:#f1c40f;font-size:11px}#tkRoot .tkCho{color:#f3cf8a}' +
      '#tkRoot .tkDot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#5c6070;margin-right:6px;vertical-align:middle}#tkRoot .tkDot.on{background:var(--green);box-shadow:0 0 6px var(--green)}' +
      '#tkRoot .tkTag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:700;margin-left:5px;border:1px solid;white-space:nowrap;vertical-align:middle}' +
      '#tkRoot .tkTag.khoa{color:#ff8a8d;background:rgba(242,63,67,.14);border-color:rgba(242,63,67,.45)}#tkRoot .tkTag.adm{color:#f3cf8a;background:rgba(240,177,50,.14);border-color:rgba(240,177,50,.45)}' +
      '#tkRoot .tkTag.clone{color:#d8b8ff;background:rgba(179,98,242,.15);border-color:rgba(179,98,242,.5)}#tkRoot .tkTag.canh{color:#ffb070;background:rgba(255,140,40,.12);border-color:rgba(255,140,40,.45)}' +
      '#tkRoot .tkTag.on{color:#5fd38d;background:rgba(35,165,90,.14);border-color:rgba(35,165,90,.45)}#tkRoot .tkTag.xam{color:var(--mut);background:var(--card2);border-color:var(--line)}' +
      '#tkRoot .tkDet{position:sticky;top:calc(var(--hdrH,58px) + 12px);max-height:calc(100vh - var(--hdrH,58px) - 24px);overflow:auto;scrollbar-gutter:stable;padding:16px}' +
      '#tkRoot .tkDetT{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}#tkRoot .tkDetT h3{margin:0;font-size:17px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#tkRoot .tkTrong{color:var(--mut);text-align:center;padding:40px 12px;font-size:13.5px;line-height:1.6}' +
      '#tkRoot .tkSec{margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}#tkRoot .tkSec h4{margin:0 0 8px;font-size:14px}' +
      '#tkRoot .tkBox{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px}' +
      '#tkRoot .tkBoxT{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}#tkRoot .tkBoxT b{font-size:14px}#tkRoot .tkBoxT code{font-size:11.5px;color:var(--mut)}' +
      '#tkRoot .tkKv{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0}#tkRoot .tkKv span{color:var(--mut);white-space:nowrap}#tkRoot .tkKv b{text-align:right;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}' +
      '#tkRoot .tkIn{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}#tkRoot .tkIn input,#tkRoot .tkIn select{flex:1 1 150px;width:auto;padding:8px 10px}' +
      '#tkRoot .tkBtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}#tkRoot .tkChk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--txt);white-space:nowrap}#tkRoot .tkChk input{width:16px;height:16px}' +
      '#tkRoot .tkNote{font-size:12px;color:var(--mut);margin-top:8px;line-height:1.5}#tkRoot .tkWarn{font-size:12.5px;color:#ffb070;margin-top:6px}' +
      '#tkRoot .tkChoDs{font-size:12px;color:#f3cf8a;margin-top:6px;line-height:1.5}' +
      '#tkRoot .tkB-g{background:var(--green);color:#fff}#tkRoot .tkB-o{background:#b85f10;color:#fff}#tkRoot .tkB-b{background:var(--blue);color:#fff}' +
      '#tkRoot .tkB-p{background:#7f45c8;color:#fff}#tkRoot .tkB-x{background:#4e5058;color:#fff}#tkRoot .tkB-r{background:var(--red);color:#fff}' +
      '#tkRoot .tkDong{display:none}#tkRoot .tkEye{padding:7px 10px;background:#4e5058;color:#fff}' +
      // màn hẹp: danh sách 1 cột, chi tiết mở thành tấm phủ toàn màn hình
      '@media(min-width:1200px) and (max-width:1439px){#tkRoot .tkMain{grid-template-columns:minmax(0,1fr) 400px}}' +
      '@media(max-width:1199px){#tkRoot .tkMain{display:block}#tkRoot .tkDet{display:none}' +
      '#tkRoot .tkDet.mo{display:block;position:fixed;inset:0;z-index:60;border-radius:0;max-height:none;margin:0;padding:14px 16px 40px}#tkRoot .tkDong{display:inline-block}' +
      '#tkRoot .tkDet.mo{overflow:auto}}' +
      '@media(max-width:560px){#tkRoot .tkRow{grid-template-columns:minmax(0,1fr)}#tkRoot .tkKnb{text-align:left}}';
    document.head.appendChild(s);
  }

  function khung() {
    css();
    var r = $('tkRoot'); if (!r) return false;
    r.innerHTML =
      '<div class="card"><div class="tkTop"><h2>👤 Tài khoản<small>tài khoản game, nhân vật, ví web gộp theo từng người</small></h2><div class="tkStats" id="tkStats"></div></div>' +
      '<div class="tkBar"><input type="text" id="tkQ" autocomplete="off" placeholder="🔎 Tài khoản, nhân vật, tên ví, Discord ID, GUID">' +
      '<button class="tkB-x" data-tk="tai">🔄 Tải lại</button><button class="tkB-g" data-tk="moTao">➕ Tạo tài khoản game</button></div>' +
      '<div class="tkTao" id="tkTao" style="display:none"><b>➕ Tạo tài khoản game</b>' +
      '<input type="text" id="tkNewTen" autocomplete="off" placeholder="Tên đăng nhập (a-z 0-9 _)"><input type="text" id="tkNewMk" autocomplete="off" placeholder="Mật khẩu (6 - 32 ký tự)">' +
      '<input type="text" id="tkNewUid" autocomplete="off" placeholder="Discord ID gắn ví (tuỳ chọn)">' +
      '<button class="tkB-g" data-tk="tao">Tạo</button><button class="tkB-x" data-tk="dongTao">Đóng</button></div>' +
      '<div class="tkSeg" id="tkSeg"></div><div id="tkLoi"></div></div>' +
      '<div class="tkMain"><div class="card"><div class="tkListN" id="tkListN"></div><div class="tkList" id="tkList"><div class="tkTrong">Đang tải...</div></div></div>' +
      '<div class="card tkDet" id="tkDet"></div></div>';
    $('tkQ').addEventListener('input', function () { TK.q = this.value; veList(); });
    TK.built = true;
    return true;
  }

  // ===== dữ liệu =====
  // đọc im lặng (không toast mỗi 10 giây khi panel GM tắt) - lỗi hiện ở dải đỏ trên đầu tab
  function lay(p) {
    return fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, body: '{}' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { if (typeof logout === 'function') logout(); throw new Error('Phiên đăng nhập hết hạn'); }
        if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function tai() {
    if (TK.dangTai) return TK.dangTai;
    var a = lay('/api/gm/state').then(function (j) { TK.gm = j.state || {}; TK.gmLoi = ''; }).catch(function (er) { TK.gmLoi = 'Panel GM (tài khoản / nhân vật): ' + er.message; });
    var b = lay('/api/tk/data').then(function (j) { TK.w = j.wallets || []; TK.wLoi = ''; }).catch(function (er) { TK.wLoi = 'Ví web: ' + er.message; });
    TK.dangTai = Promise.all([a, b]).then(function () { TK.dangTai = null; TK.luc = new Date().toLocaleTimeString('vi-VN'); ghep(); });
    return TK.dangTai;
  }
  function ghep() {
    var gs = TK.gm || {}, map = {}, ds = [], guidAcc = {};
    (gs.accounts || []).forEach(function (a) {
      var k = thuong(a.name); if (!k || map[k]) return;
      map[k] = { key: 'a:' + k, acc: a, chars: [], wallets: [] }; ds.push(map[k]);
    });
    (gs.chars || []).forEach(function (c) {
      var k = thuong(c.account); if (!k) return;
      if (!map[k]) { map[k] = { key: 'a:' + k, acc: { id: '', name: c.account, online: false, khoa: false, thieu: true }, chars: [], wallets: [] }; ds.push(map[k]); }
      map[k].chars.push(c); guidAcc[String(c.guid)] = k;
    });
    // 19/10 vòng 2: nhân vật liên kết (tlbbGuid) THẮNG gameAcc - giống Phát quà (theo GUID). Lệch nhau thì gắn nhãn cảnh báo,
    // tài khoản mà gameAcc trỏ tới ghi nhận "viTro" (không tính là "chưa có ví").
    (TK.w || []).forEach(function (w) {
      w.guidAcc = (w.tlbbGuid && guidAcc[w.tlbbGuid]) || '';
      w.lech = !!(w.guidAcc && w.gameAcc && w.gameAcc !== w.guidAcc);
      w.matTk = !!(w.gameAcc && !map[w.gameAcc]);          // tài khoản game ghi trong ví không còn
      w.matNv = !!(w.tlbbGuid && !w.guidAcc);               // nhân vật liên kết không còn
      var k = w.guidAcc || ((w.gameAcc && map[w.gameAcc]) ? w.gameAcc : '');
      if (w.lech && map[w.gameAcc]) (map[w.gameAcc].viTro = map[w.gameAcc].viTro || []).push(w);
      if (k) map[k].wallets.push(w); else ds.push({ key: 'w:' + w.id, acc: null, chars: [], wallets: [w] });
    });
    ds.forEach(function (p) {
      p.viTro = p.viTro || [];
      p.lech = p.wallets.some(function (w) { return w.lech; });
      p.matTk = !p.acc && p.wallets.some(function (w) { return w.matTk; });
      p.matNv = !p.acc && p.wallets.some(function (w) { return w.matNv; });
      p.chars.sort(function (x, y) { return (y.online ? 1 : 0) - (x.online ? 1 : 0) || (Number(y.level) || 0) - (Number(x.level) || 0); });
      p.ten = p.acc ? String(p.acc.name) : (p.wallets[0].name || p.wallets[0].id);
      p.on = !!(p.acc && p.acc.online) || p.chars.some(function (c) { return c.online; });
      p.knb = p.wallets.reduce(function (t, w) { return t + (w.points || 0); }, 0);
      p.no = p.wallets.reduce(function (t, w) { return t + ((w.debt && w.debt.total) || 0); }, 0);
      p.clone = p.wallets.some(function (w) { return w.clone; });
      p.khoa = !!(p.acc && p.acc.khoa);
      p.adm = !!p.acc && (thuong(p.acc.name) === 'admin' || p.chars.some(function (c) { return c.gm; }));
      p.k = boDau([p.ten].concat(p.chars.map(function (c) { return c.name + ' ' + c.guid; }),
        p.wallets.map(function (w) { return w.name + ' ' + w.id + ' ' + w.ingameName + ' ' + w.tlbbGuid + ' ' + w.gameAcc; })).join(' '));
    });
    ds.sort(function (a, b) { return (b.on ? 1 : 0) - (a.on ? 1 : 0) || b.knb - a.knb || String(a.ten).localeCompare(String(b.ten), 'vi'); });
    TK.ds = ds;
    // giữ đúng người đang mở: ví vừa liên kết / tài khoản vừa đổi thì khoá người đổi (w:id -> a:tk), tìm lại theo ví
    if (TK.sel && !nguoi(TK.sel) && TK.selUids.length) {
      var p2 = ds.filter(function (p) { return p.wallets.some(function (w) { return TK.selUids.indexOf(w.id) >= 0; }); })[0];
      TK.sel = p2 ? p2.key : null;
    } else if (TK.sel && !nguoi(TK.sel)) TK.sel = null;
    var cur = TK.sel && nguoi(TK.sel); TK.selUids = cur ? cur.wallets.map(function (w) { return w.id; }) : [];
  }
  function nguoi(k) { for (var i = 0; i < TK.ds.length; i++) if (TK.ds[i].key === k) return TK.ds[i]; return null; }
  function viTheoId(uid) { var L = TK.w || []; for (var i = 0; i < L.length; i++) if (L[i].id === uid) return L[i]; return null; }

  // ===== vẽ =====
  var LOC = [['all', 'Tất cả', function () { return true; }], ['on', '🟢 Online', function (p) { return p.on; }], ['no', '📒 Còn nợ', function (p) { return p.no > 0; }],
    ['clone', '🧬 Clone', function (p) { return p.clone; }], ['khoa', '🔒 Bị khóa', function (p) { return p.khoa; }],
    ['viLe', '⚠ Ví chỉ có Discord', function (p) { return !p.acc && !p.matTk && !p.matNv; }, 1],
    ['mat', '⚠ Liên kết không còn', function (p) { return p.matTk || p.matNv; }, 2],
    ['lech', '⚠ gameAcc lệch', function (p) { return p.lech; }, 2],
    ['chuaVi', '⚠ Tài khoản chưa có ví', function (p) { return !!p.acc && !p.wallets.length && !p.viTro.length; }, 1]];
  function locFn() { for (var i = 0; i < LOC.length; i++) if (LOC[i][0] === TK.loc) return LOC[i][2]; return LOC[0][2]; }
  function dangGo() { var a = document.activeElement, t = $('tab-tk'); return !!(a && t && t.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); }
  function ve(ep) { if (!TK.built || (!ep && dangGo())) return; veStats(); veSeg(); veList(); veDet(); }
  function veStats() {
    var ds = TK.ds, on = 0, knb = 0, no = 0;
    ds.forEach(function (p) { if (p.on) on++; knb += p.knb; if (p.no > 0) no++; });
    $('tkStats').innerHTML = '<div class="tkStat"><b>' + so(ds.length) + '</b>người</div><div class="tkStat"><b>' + so(on) + '</b>online</div>' +
      '<div class="tkStat"><b>' + so(knb) + '</b>tổng KNB ví</div><div class="tkStat"><b>' + so(no) + '</b>người còn nợ</div>';
    var loi = [TK.gmLoi, TK.wLoi].filter(Boolean);
    $('tkLoi').innerHTML = loi.length ? '<div class="tkLoi">⚠ Không tải được: ' + loi.map(e).join(' · ') + '</div>' : '';
    $('tkTao').style.display = TK.moTao ? '' : 'none';
  }
  function veSeg() {
    $('tkSeg').innerHTML = LOC.map(function (l) {
      var n = TK.ds.filter(l[2]).length;
      if (l[3] === 2 && !n && TK.loc !== l[0]) return '';   // 2 bộ lọc hiếm: chỉ hiện khi có
      return '<button class="' + (TK.loc === l[0] ? 'on' : '') + (l[3] ? ' canh' : '') + '" data-tkloc="' + l[0] + '">' + l[1] + '<span>' + so(n) + '</span></button>';
    }).join('');
  }
  function tags(p) {
    var h = '';
    if (p.khoa) h += '<span class="tkTag khoa">🔒 Bị khóa</span>';
    if (p.adm) h += '<span class="tkTag adm">👑 Admin</span>';
    if (p.clone) h += '<span class="tkTag clone">🧬 Clone</span>';
    if (p.wallets.length > 1) h += '<span class="tkTag canh">⚠ ' + p.wallets.length + ' ví cùng tài khoản</span>';
    if (p.lech) h += '<span class="tkTag canh">⚠ gameAcc khác tài khoản nhân vật</span>';
    if (p.matTk) h += '<span class="tkTag canh">⚠ Tài khoản game không còn</span>';
    if (p.matNv) h += '<span class="tkTag canh">⚠ Nhân vật liên kết không còn</span>';
    if (!p.acc && !p.matTk && !p.matNv) h += '<span class="tkTag canh">⚠ Ví chỉ có Discord</span>';
    return h;
  }
  function dong(p) {
    var w = p.wallets.length ? p.wallets.map(function (x) {
      return '👛 <b>' + e(x.name || x.id) + '</b> ' + so(x.points) + ' KNB' + (x.debt && x.debt.total > 0 ? ' · <span class="tkNo">📒 nợ ' + so(x.debt.total) + '</span>' : '');
    }).join('<span class="tkSep"> | </span>') : (p.viTro.length ? '<span>👛 ví ' + p.viTro.map(function (x) { return '<b>' + e(x.name || x.id) + '</b>'; }).join(', ') + ' ghi tài khoản này nhưng liên kết nhân vật ở tài khoản ' + e(p.viTro[0].guidAcc) + '</span>' : '<span>👛 chưa có ví web</span>');
    var c = p.chars.length ? p.chars.map(function (x) {
      return '<span class="tkC1"><span class="tkDot' + (x.online ? ' on' : '') + '"></span>' + e(x.name) + ' <small>Lv' + e(x.level) + '</small>' + (x.gm ? ' <b class="tkGm">GM</b>' : '') +
        (x.pending && x.pending.length ? ' <span class="tkCho">🎁 ' + x.pending.length + ' chờ</span>' : '') + '</span>';
    }).join('') : (p.acc ? 'chưa có nhân vật' : 'không gắn tài khoản game');
    return '<div class="tkRow' + (TK.sel === p.key ? ' sel' : '') + '" data-tksel="' + e(p.key) + '">' +
      '<div class="tkR1"><span class="tkDot' + (p.on ? ' on' : '') + '"></span><b class="tkTen">' + e(p.ten) + '</b>' + tags(p) + '</div>' +
      '<div class="tkKnb">' + (p.wallets.length ? so(p.knb) + ' KNB' : '') + '</div>' +
      '<div class="tkR2">' + w + '</div><div class="tkR3">⚔ ' + c + '</div></div>';
  }
  function veList() {
    var el = $('tkList'); if (!el) return;
    if (!TK.gm && !TK.w) { el.innerHTML = '<div class="tkTrong">' + (TK.gmLoi || TK.wLoi ? 'Không tải được dữ liệu.' : 'Đang tải...') + '</div>'; return; }
    var q = boDau(TK.q.trim()), f = locFn();
    var L = TK.ds.filter(function (p) { return f(p) && (!q || p.k.indexOf(q) >= 0); });
    var MAX = 400, top = el.scrollTop;
    el.innerHTML = L.slice(0, MAX).map(dong).join('') || '<div class="tkTrong">Không có ai khớp bộ lọc.</div>';
    el.scrollTop = top;
    $('tkListN').textContent = 'Hiện ' + so(Math.min(L.length, MAX)) + ' / ' + so(L.length) + ' người khớp' + (L.length > MAX ? ' (gõ thêm để lọc)' : '') +
      ' · online lên đầu, rồi theo KNB ví · cập nhật ' + (TK.luc || '...') + ' (tự tải lại 10 giây/lần)';
  }

  // giữ chữ admin đang gõ dở ở khung chi tiết khi vẽ lại (đổi người / vừa thao tác xong thì bỏ)
  function giu() { var o = {}, d = $('tkDet'); if (!d) return o; [].forEach.call(d.querySelectorAll('input[id],select[id]'), function (x) { o[x.id] = x.type === 'checkbox' ? x.checked : x.value; }); return o; }
  function tra(o) { Object.keys(o).forEach(function (id) { var x = $(id); if (!x) return; if (x.type === 'checkbox') x.checked = o[id]; else x.value = o[id]; }); }
  function kv(k, v) { return '<div class="tkKv"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function veDet() {
    var d = $('tkDet'); if (!d) return;
    var p = TK.sel ? nguoi(TK.sel) : null;
    d.classList.toggle('mo', !!p);
    var keep = (!TK.boKeep && TK.detKey === TK.sel) ? giu() : {}, top = d.scrollTop;
    if (!p) { d.innerHTML = '<div class="tkTrong">Bấm 1 người ở danh sách để xem và thao tác:<br>ví web, tài khoản game, nhân vật, liên kết.</div>'; TK.detKey = null; TK.boKeep = false; return; }
    var h = '<div class="tkDetT"><span class="tkDot' + (p.on ? ' on' : '') + '"></span><h3 title="' + e(p.ten) + '">' + e(p.ten) + '</h3><button class="tkB-x tkDong" data-tk="dong">✕ Đóng</button></div>' +
      (tags(p) ? '<div style="margin-left:-5px">' + tags(p) + '</div>' : '');
    h += secVi(p) + (p.acc ? secTk(p) : '') + (p.chars.length ? secNv(p) : '') + secLk(p);
    d.innerHTML = h;
    if (TK.detKey === TK.sel) d.scrollTop = top; else d.scrollTop = 0;
    tra(keep); TK.detKey = TK.sel; TK.boKeep = false;
  }
  function secVi(p) {
    var h = '<div class="tkSec"><h4>👛 Ví web</h4>';
    if (p.viTro.length) h += '<div class="tkWarn" style="margin-top:0">⚠ Ví ' + p.viTro.map(function (x) { return e(x.name || x.id); }).join(', ') + ' có gameAcc = tài khoản này nhưng liên kết nhân vật thuộc tài khoản ' +
      p.viTro.map(function (x) { return e(x.guidAcc); }).join(', ') + ', nên nằm ở người đó (theo nhân vật). Lưu lại liên kết ở đó để gameAcc khớp.</div>';
    if (!p.wallets.length) return h + '<div class="tkNote" style="margin-top:0">Tài khoản này chưa có ví web. Người chơi có Discord: liên kết ví của họ với nhân vật ở mục 🔗 bên dưới (từ ví đó). Nhân vật phụ không có Discord: bấm 🧬 Tạo ví clone.</div></div>';
    p.wallets.forEach(function (w) {
      var no = (w.debt && w.debt.total) || 0;
      h += '<div class="tkBox"><div class="tkBoxT"><b>' + e(w.name || '(chưa rõ tên)') + '</b><code>' + e(w.id) + '</code>' + (w.clone ? '<span class="tkTag clone">🧬 Clone</span>' : '') + '</div>' +
        kv('Số dư', so(w.points) + ' KNB') +
        kv('Nợ', no > 0 ? '<span class="tkNo">' + so(no) + '</span> <small class="muted">(vay ' + so(w.debt.loan) + ' · admin ghi ' + so(w.debt.admin) + ')</small>' : '0') +
        kv('Tài khoản game', w.gameAcc ? e(w.gameAcc) + (w.matTk ? ' <span class="tkNo">(không còn)</span>' : '') : '<span class="muted">chưa gắn</span>') +
        (w.lech ? '<div class="tkWarn">⚠ gameAcc của ví là ' + e(w.gameAcc) + ' nhưng nhân vật liên kết (' + e(w.ingameName || w.tlbbGuid) + ') thuộc tài khoản ' + e(w.guidAcc) + '. Bấm 💾 Lưu liên kết ở mục 🔗 để gameAcc về đúng ' + e(w.guidAcc) + '.</div>' : '') +
        (w.matTk ? '<div class="tkWarn">⚠ Tài khoản game ' + e(w.gameAcc) + ' không còn trong game (đã xóa?). Liên kết lại nhân vật mới hoặc xóa ví nếu không dùng.</div>' : '') +
        (w.matNv ? '<div class="tkWarn">⚠ Nhân vật liên kết (' + e(w.ingameName || '?') + ', GUID ' + e(w.tlbbGuid) + ') không còn trong game.</div>' : '') +
        '<div class="tkIn"><input type="number" id="tkAmt_' + e(w.id) + '" placeholder="Số KNB"></div>' +
        '<div class="tkBtns"><button class="tkB-g" data-tk="cong" data-uid="' + e(w.id) + '">Cộng</button><button class="tkB-o" data-tk="tru" data-uid="' + e(w.id) + '">Trừ</button>' +
        '<button class="tkB-b" data-tk="dat" data-uid="' + e(w.id) + '">Đặt bằng</button><button class="tkB-p" data-tk="ghino" data-uid="' + e(w.id) + '">📒 Ghi nợ</button>' +
        (no > 0 ? '<button class="tkB-x" data-tk="xoano" data-uid="' + e(w.id) + '">Xóa nợ</button>' : '') +
        '<button class="tkB-r" data-tk="xoavi" data-uid="' + e(w.id) + '">🗑️ Xóa ví</button></div></div>';
    });
    return h + '<div class="tkNote">Còn nợ thì người chơi không mua shop item, không nhận quà admin, không tặng đồ trong rương, không ghép ngọc / mở vòng quay / nhận pet boss. 📒 Ghi nợ cộng vào nợ admin (số âm = giảm, cũng tính lãi ngày như nợ vay); Xóa nợ xóa sạch cả nợ vay lẫn nợ ghi.</div></div>';
  }
  function secTk(p) {
    var a = p.acc, ad = thuong(a.name) === 'admin';
    var h = '<div class="tkSec"><h4>🎮 Tài khoản game</h4><div class="tkBox">' +
      kv('Tên đăng nhập', e(a.name)) + kv('ID', a.id !== '' && a.id != null ? e(a.id) : '<span class="muted">?</span>') +
      kv('Trạng thái', (a.online ? '<span class="tkTag on" style="margin:0">online</span>' : '<span class="muted">offline</span>') + (a.khoa ? ' <span class="tkTag khoa">🔒 Bị khóa</span>' : ''));
    if (a.thieu) h += '<div class="tkWarn">⚠ Không thấy tài khoản này trong danh sách tài khoản của panel GM (chỉ thấy qua nhân vật).</div>';
    h += '<div class="tkIn"><input type="' + (TK.xemMk ? 'text' : 'password') + '" id="tkPw" autocomplete="new-password" placeholder="Mật khẩu mới (6 - 32 ký tự)">' +
      '<button class="tkEye" data-tk="xemmk" title="' + (TK.xemMk ? 'Ẩn mật khẩu' : 'Hiện mật khẩu') + '">' + (TK.xemMk ? '🙈' : '👁') + '</button><button class="tkB-b" data-tk="mk">Đổi mật khẩu</button></div>' +
      '<div class="tkBtns"><button class="tkB-x" data-tk="goket">🩹 Gỡ kẹt</button>' +
      (ad ? '' : (a.khoa ? '<button class="tkB-g" data-tk="mokhoa">🔓 Mở khóa</button>' : '<button class="tkB-o" data-tk="khoa">🔒 Khóa</button>') + '<button class="tkB-r" data-tk="xoatk">🗑️ Xóa tài khoản</button>') +
      '</div><div class="tkNote">Đổi mật khẩu cũng cập nhật mật khẩu lưu ở ví web gắn tài khoản này (lệnh /taikhoan trên Discord). Gỡ kẹt = bị disconnect không vào lại được. Khóa: chặn từ lần đăng nhập sau.' + (ad ? ' Tài khoản admin không khóa / xóa được.' : '') + '</div></div></div>';
    return h;
  }
  function secNv(p) {
    var h = '<div class="tkSec"><h4>⚔ Nhân vật (' + p.chars.length + ')</h4>';
    p.chars.forEach(function (c) {
      var cho = c.pending || [];
      h += '<div class="tkBox"><div class="tkBoxT"><span class="tkDot' + (c.online ? ' on' : '') + '"></span><b>' + e(c.name) + '</b><span class="muted" style="font-size:12px">Lv' + e(c.level) + ' · ' + e(c.guid) + '</span>' +
        (c.gm ? '<span class="tkTag adm">GM</span>' : '') + (c.online ? '<span class="tkTag on">online</span>' : '') + '</div>' +
        (cho.length ? '<div class="tkChoDs">🎁 ' + cho.length + ' quà đang chờ: ' + cho.map(e).join(' · ') + '</div>' : '') +
        '<div class="tkBtns"><button class="tkB-g" data-tk="guiqua" data-guid="' + e(c.guid) + '">🎁 Gửi quà</button>' +
        (c.gm ? '<button class="tkB-x" data-tk="gmtat" data-guid="' + e(c.guid) + '" data-ten="' + e(c.name) + '">Tắt GM</button>' : '<button class="tkB-b" data-tk="gmbat" data-guid="' + e(c.guid) + '" data-ten="' + e(c.name) + '">Cấp GM</button>') +
        (cho.length ? '<button class="tkB-r" data-tk="huyqua" data-guid="' + e(c.guid) + '" data-ten="' + e(c.name) + '">Hủy quà chờ</button>' : '') + '</div></div>';
    });
    return h + '<div class="tkNote">Cấp / tắt GM cần restart game mới có hiệu lực. Quà chờ = quà cách 🗺️ Đổi bản đồ, vào túi khi nhân vật đăng nhập / đổi bản đồ.</div></div>';
  }
  function secLk(p) {
    var h = '<div class="tkSec"><h4>🔗 Liên kết ví ↔ nhân vật</h4>';
    if (!p.wallets.length) {
      if (!p.chars.length) return '';
      h += '<div class="tkNote" style="margin-top:0">Chưa có ví: tạo ví clone (0 KNB, chỉ dùng Thương Phố, không túi boss) gắn sẵn nhân vật và tài khoản game này. Đăng nhập web bằng tài khoản + mật khẩu game.</div>';
      p.chars.forEach(function (c) {
        h += '<div class="tkBox" style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span><b>' + e(c.name) + '</b> <small class="muted">' + e(c.guid) + '</small></span>' +
          '<button class="tkB-p" data-tk="taoclone" data-guid="' + e(c.guid) + '" data-ten="' + e(c.name) + '">🧬 Tạo ví clone</button></div>';
      });
      return h + '</div>';
    }
    p.wallets.forEach(function (w) {
      var id = e(w.id);
      h += '<div class="tkBox"><div class="tkBoxT"><b>' + e(w.name || w.id) + '</b></div>' +
        kv('Đang liên kết', w.tlbbGuid ? e(w.ingameName || '?') + ' <small class="muted">' + e(w.tlbbGuid) + '</small>' : '<span class="muted">chưa liên kết</span>') +
        '<div class="tkIn"><select id="tkLkSel_' + id + '"><option value="">- nhân vật của tài khoản này -</option>' +
        p.chars.map(function (c) { return '<option value="' + e(c.guid) + '"' + (String(c.guid) === w.tlbbGuid ? ' selected' : '') + '>' + e(c.name) + ' (Lv' + e(c.level) + ')</option>'; }).join('') + '</select>' +
        '<input type="text" id="tkLkTxt_' + id + '" autocomplete="off" placeholder="hoặc gõ tên / GUID nhân vật khác"></div>' +
        '<div class="tkBtns" style="align-items:center"><label class="tkChk"><input type="checkbox" id="tkLkCl_' + id + '"' + (w.clone ? ' checked' : '') + '> 🧬 Clone (chỉ Thương Phố, không túi boss)</label></div>' +
        '<div class="tkBtns"><button class="tkB-g" data-tk="lkluu" data-uid="' + id + '">💾 Lưu liên kết</button>' +
        (w.tlbbGuid ? '<button class="tkB-x" data-tk="lkbo" data-uid="' + id + '">Bỏ liên kết</button>' : '') + '</div></div>';
    });
    return h + '<div class="tkNote">Liên kết = cầu KNB web ↔ game chạy cho ví này, ví gắn luôn tài khoản game của nhân vật (đăng nhập web bằng tài khoản game vào đúng ví). 1 nhân vật / 1 tài khoản game chỉ gắn 1 ví. Bỏ liên kết = gỡ cả tài khoản game khỏi ví.</div></div>';
  }

  // ===== thao tác =====
  function lam(b, p, body, okMsg) {
    TK.busy++;
    return runBtn(b, 'Đang xử lý...', function () {
      return api(p, body).then(function (j) { toast(typeof okMsg === 'function' ? okMsg(j) : okMsg); TK.boKeep = true; xoaO(); });
    }).then(function () { TK.busy--; return tai(); }).then(function () { ve(true); });
  }
  // thao tác xong: xoá hẳn ô 1 lần (mật khẩu, số KNB, tên liên kết) - lần vẽ lại có thể không đụng DOM (innerHTML y hệt) nên phải xoá tay
  function xoaO() {
    var p = TK.sel ? nguoi(TK.sel) : null, ids = ['tkPw'];
    (p ? p.wallets : []).forEach(function (w) { ids.push('tkAmt_' + w.id, 'tkLkTxt_' + w.id); });
    ids.forEach(function (id) { var x = $(id); if (x) x.value = ''; });
  }
  function gmMsg(j) { return (j.done ? '✅ ' : '⚠️ ') + (j.msg || ''); }
  function soNhap(uid) { var x = $('tkAmt_' + uid), v = x ? String(x.value).trim() : ''; return v === '' ? NaN : Math.floor(Number(v)); }
  function hoi(msg, ok, cls, go) { return uiConfirm(msg, ok, cls, go || ''); }

  function chay(b) {
    var a = b.getAttribute('data-tk'), uid = b.getAttribute('data-uid'), guid = b.getAttribute('data-guid'), tenNv = b.getAttribute('data-ten');
    var p = TK.sel ? nguoi(TK.sel) : null, acc = p && p.acc, w = uid ? viTheoId(uid) : null, tenVi = w ? (w.name || w.id) : uid, n;
    if (a === 'tai') { tai().then(function () { ve(true); }); return; }
    if (a === 'moTao') { TK.moTao = !TK.moTao; veStats(); if (TK.moTao && $('tkNewTen')) $('tkNewTen').focus(); return; }
    if (a === 'dongTao') { TK.moTao = false; veStats(); return; }
    if (a === 'xemmk') { TK.xemMk = !TK.xemMk; veDet(); return; }
    if (a === 'dong') { TK.sel = null; TK.selUids = []; veList(); veDet(); return; }
    if (a === 'tao') {
      var ten = String($('tkNewTen').value).trim(), mk = String($('tkNewMk').value).trim(), u = String($('tkNewUid').value).trim();
      if (!ten || !mk) return toast('Nhập tên đăng nhập và mật khẩu');
      if (mk.length < 6 || mk.length > 32) return toast('Mật khẩu 6 - 32 ký tự');
      if (u && !/^[0-9]{15,20}$/.test(u)) return toast('Discord ID phải là 15 - 20 chữ số');
      TK.busy++;
      runBtn(b, 'Đang tạo...', function () {
        return api('/api/gm/act', { a: 'tao_tk', ten: ten, mk: mk, uid: u }).then(function (j) {
          toast(gmMsg(j));
          if (j.done) { $('tkNewTen').value = ''; $('tkNewMk').value = ''; $('tkNewUid').value = ''; TK.moTao = false; TK.sel = 'a:' + ten.toLowerCase(); TK.selUids = []; TK.boKeep = true; }
        });
      }).then(function () { TK.busy--; return tai(); }).then(function () { ve(true); });
      return;
    }
    // ví web
    if (a === 'cong') { n = soNhap(uid); if (!n) return toast('Gõ số KNB vào ô (khác 0)'); lam(b, '/api/points/add', { userId: uid, amount: n }, '✅ Đã ' + (n > 0 ? 'cộng ' : 'trừ ') + so(Math.abs(n)) + ' KNB ' + (n > 0 ? 'vào' : 'khỏi') + ' ví ' + tenVi); return; }
    if (a === 'tru') { n = soNhap(uid); if (!(n > 0)) return toast('Gõ số KNB cần trừ (lớn hơn 0)');
      hoi('Trừ ' + so(n) + ' KNB khỏi ví ' + tenVi + ' (đang có ' + so(w ? w.points : 0) + ')?', 'Trừ', 'btn-red').then(function (ok) { if (ok) lam(b, '/api/points/subtract', { userId: uid, amount: n }, '✅ Đã trừ ' + so(n) + ' KNB của ' + tenVi); }); return; }
    if (a === 'dat') { n = soNhap(uid); if (isNaN(n) || n < 0) return toast('Gõ số dư mới (từ 0 trở lên)');
      hoi('Đặt số dư ví ' + tenVi + ' = ' + so(n) + ' KNB (đang có ' + so(w ? w.points : 0) + ')?', 'Đặt bằng', 'btn-red').then(function (ok) { if (ok) lam(b, '/api/points/set', { userId: uid, amount: n }, '✅ Ví ' + tenVi + ' giờ có ' + so(n) + ' KNB'); }); return; }
    if (a === 'ghino') { n = soNhap(uid); if (!n) return toast('Gõ số nợ vào ô (số âm = giảm nợ đã ghi)');
      hoi('Ghi nợ ' + (n > 0 ? '' : 'giảm ') + so(Math.abs(n)) + ' KNB cho ví ' + tenVi + '? (nợ admin, tính lãi ngày như nợ vay)', '📒 Ghi nợ', 'btn-red').then(function (ok) { if (ok) lam(b, '/api/debt/add', { userId: uid, amount: n }, function (j) { return '📒 Đã ghi - tổng nợ ' + so(j.total); }); }); return; }
    if (a === 'xoano') { hoi('Xóa SẠCH nợ của ví ' + tenVi + ' (' + so(w && w.debt ? w.debt.total : 0) + ', cả nợ vay lẫn nợ admin ghi)?', 'Xóa nợ', 'btn-red').then(function (ok) { if (ok) lam(b, '/api/debt/clear', { userId: uid }, function (j) { return '✅ Đã xóa ' + so(j.cleared) + ' nợ'; }); }); return; }
    if (a === 'xoavi') { hoi('XÓA ví ' + tenVi + ' (' + so(w ? w.points : 0) + ' KNB) khỏi database? Lần chơi sau họ được tạo ví mới từ số dư khởi điểm. Gõ đúng tên ví để xác nhận.', '🗑️ Xóa ví', 'btn-red', String(tenVi)).then(function (ok) { if (ok) lam(b, '/api/points/delete', { userId: uid }, '🗑️ Đã xóa ví ' + tenVi); }); return; }
    // tài khoản game
    if (acc) {
      var tk = String(acc.name), ad = thuong(tk) === 'admin';
      if (a === 'mk') { var mk2 = String(($('tkPw') || {}).value || '').trim(); if (mk2.length < 6 || mk2.length > 32) return toast('Mật khẩu mới 6 - 32 ký tự');
        lam(b, '/api/gm/act', { a: 'doi_mk', ten: tk, mk: mk2 }, gmMsg); return; }
      if (a === 'goket') { lam(b, '/api/gm/act', { a: 'go_ket', ten: tk }, gmMsg); return; }
      if ((a === 'khoa' || a === 'mokhoa') && !ad) { hoi((a === 'khoa' ? 'Khóa tài khoản ' + tk + '? Chặn từ lần đăng nhập sau (đang trong game thì không bị đá).' : 'Mở khóa tài khoản ' + tk + '?'), a === 'khoa' ? '🔒 Khóa' : '🔓 Mở khóa', a === 'khoa' ? 'btn-red' : 'btn-green')
        .then(function (ok) { if (ok) lam(b, '/api/gm/act', { a: 'khoa_tk', ten: tk, khoa: a === 'khoa' ? '1' : '0' }, gmMsg); }); return; }
      if (a === 'xoatk' && !ad) { hoi('XÓA tài khoản game ' + tk + '? Ví web gắn tài khoản này sẽ bị gỡ tài khoản game. Gõ đúng tên tài khoản để xác nhận.', '🗑️ Xóa tài khoản', 'btn-red', tk)
        .then(function (ok) { if (ok) lam(b, '/api/gm/act', { a: 'xoa_tk', ten: tk }, gmMsg); }); return; }
    }
    // nhân vật
    if (a === 'guiqua') { if (typeof window.pqMo === 'function') window.pqMo(guid); else toast('Chưa tải được tab 🎁 Phát quà - tải lại trang'); return; }
    if (a === 'gmbat' || a === 'gmtat') { hoi((a === 'gmbat' ? 'Cấp GM cho ' : 'Tắt GM của ') + tenNv + '? Cần restart game mới có hiệu lực.', a === 'gmbat' ? 'Cấp GM' : 'Tắt GM', a === 'gmbat' ? 'btn-green' : 'btn-red')
      .then(function (ok) { if (ok) lam(b, '/api/gm/act', { a: a === 'gmbat' ? 'gm_bat' : 'gm_tat', guid: guid }, gmMsg); }); return; }
    if (a === 'huyqua') { hoi('Hủy toàn bộ quà đang chờ của ' + tenNv + '? Cửa sổ quà chưa nhận (nếu có) cũng bị hủy.', 'Hủy quà', 'btn-red')
      .then(function (ok) { if (ok) lam(b, '/api/gm/act', { a: 'huy_qua', guid: guid }, gmMsg); }); return; }
    // liên kết
    if (a === 'taoclone') { hoi('Tạo ví clone cho nhân vật ' + tenNv + '? Ví 0 KNB, chỉ dùng Thương Phố, đăng nhập web bằng tài khoản + mật khẩu game.', '🧬 Tạo ví clone', 'btn-green')
      .then(function (ok) { if (ok) lam(b, '/api/tlbb/taoclone', { name: guid }, function (j) { return '🧬 Đã tạo ví clone cho ' + j.name + ' (tài khoản game ' + j.account + ')'; }); }); return; }
    if (a === 'lkluu') {
      var txt = String(($('tkLkTxt_' + uid) || {}).value || '').trim(), sel = String(($('tkLkSel_' + uid) || {}).value || ''), q = txt || sel;
      if (!q) return toast('Chọn nhân vật hoặc gõ tên / GUID');
      var cl = !!($('tkLkCl_' + uid) || {}).checked;
      lam(b, '/api/tlbb/lienket', { userId: uid, name: q, clone: cl }, function (j) { return '🔗 Đã liên kết ' + tenVi + ' ↔ ' + j.name + (j.clone ? ' · 🧬 Clone (chỉ Thương Phố)' : ''); });
      return;
    }
    if (a === 'lkbo') { hoi('Bỏ liên kết nhân vật ' + ((w && w.ingameName) || '') + ' khỏi ví ' + tenVi + '? Ví cũng bị gỡ tài khoản game (đăng nhập web bằng tài khoản game không vào ví này nữa).', 'Bỏ liên kết', 'btn-red')
      .then(function (ok) { if (ok) lam(b, '/api/tlbb/lienket', { userId: uid, name: '' }, '🔗 Đã bỏ liên kết ví ' + tenVi); }); return; }
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target; if (!t.closest || !t.closest('#tab-tk')) return;
    var lo = t.closest('[data-tkloc]'); if (lo) { TK.loc = lo.getAttribute('data-tkloc'); veSeg(); veList(); return; }
    var b = t.closest('[data-tk]'); if (b) { if (!b.disabled) chay(b); return; }
    var r = t.closest('[data-tksel]'); if (r) {
      TK.sel = r.getAttribute('data-tksel'); var p = nguoi(TK.sel); TK.selUids = p ? p.wallets.map(function (w) { return w.id; }) : [];
      veList(); veDet(); return;
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !ev.target || !ev.target.id) return;
    var id = ev.target.id;
    if (id === 'tkNewTen' || id === 'tkNewMk' || id === 'tkNewUid') { var bt = document.querySelector('#tkTao [data-tk="tao"]'); if (bt) bt.click(); }
    else if (id === 'tkPw') { var b2 = document.querySelector('#tkDet [data-tk="mk"]'); if (b2) b2.click(); }
  });

  window.tkLoad = function () {
    if (typeof TOKEN === 'undefined' || !TOKEN || !$('tkRoot')) return;
    if (!TK.built && !khung()) return;
    ve(true);
    tai().then(function () { ve(true); });
    if (!TK.timer) TK.timer = setInterval(function () {
      var t = $('tab-tk'); if (!t || t.classList.contains('hidden') || document.hidden || TK.busy) return;
      tai().then(function () { if (!TK.busy) ve(false); });   // đang gõ trong tab thì chỉ cập nhật dữ liệu, chưa vẽ lại
    }, 10000);
  };
  // F5 đúng tab này: tab() chạy trước khi file này tải xong -> tự tải
  if ($('tab-tk') && !$('tab-tk').classList.contains('hidden')) window.tkLoad();
})();
