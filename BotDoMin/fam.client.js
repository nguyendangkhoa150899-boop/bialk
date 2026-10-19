// 👪 20/10 FAMILY - popup nút 🔗 Liên kết (cạnh 🔑 Mật khẩu). Server: family.js + /api/fam/* (webplay.js).
// Bot đọc lại file này mỗi lần tải trang (/fam.js) - sửa không cần restart. Dùng api / toast / refresh của trang chơi.
(function () {
  if (window.famOpen && window.famOpen._v) return;
  var css = document.createElement('style');
  css.textContent =
    '#famModal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:120;padding:16px}' +
    '#famModal.hidden{display:none}' +
    '#famBox{position:relative;background:var(--card);border:1px solid #33405a;border-radius:16px;padding:20px;width:440px;max-width:100%;max-height:92vh;overflow:auto;box-shadow:0 12px 48px rgba(0,0,0,.6);animation:gmpop .15s ease}' +
    '#famBox h2{margin:0;font-size:18px}#famBox .fmX{position:absolute;top:10px;right:10px;width:auto;margin:0;padding:4px 10px;background:#232a3a;font-size:14px}' +
    '#famBox .fmNote{margin-top:8px;font-size:12px;color:var(--muted);line-height:1.55}' +
    '#famBox .fmList{margin-top:12px;display:flex;flex-direction:column;gap:6px}' +
    '#famBox .fmRow{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #2b3550;border-radius:10px;background:#161c2b}' +
    '#famBox .fmRow.toi{border-color:#4da3ff}' +
    '#famBox .fmRow .n{flex:1;min-width:0;font-size:14px}#famBox .fmRow .n b{color:#e9eefc}#famBox .fmRow .n span{display:block;font-size:12px;color:var(--muted)}' +
    '#famBox .fmTag{font-size:11px;padding:2px 7px;border-radius:999px;background:#3a2f10;color:#ffd27a;white-space:nowrap}' +
    '#famBox .fmTag.me{background:#10263a;color:#8cc8ff}' +
    '#famBox .fmDuoi{width:auto;margin:0;padding:5px 10px;font-size:12px;background:#4a1d1d;color:#ffb4ab;border-radius:8px}' +
    '#famBox .fmF{margin-top:10px}#famBox .fmF input{margin:0 0 8px}' +
    '#famBox .fmErr{min-height:18px;font-size:13px;font-weight:700;color:#ff8a80;margin-top:2px}' +
    '#famBox .fmGo{display:block;width:100%;margin-top:6px;padding:12px;font-size:15px;font-weight:900;border:0;border-radius:11px;color:#04203a;background:linear-gradient(180deg,#8cc8ff,#4da3ff)}' +
    '#famBox .fmGo:disabled{opacity:.5}' +
    '#famBox .fmRoi{display:block;width:100%;margin-top:12px;padding:10px;font-size:13px;background:#2a1b1b;color:#ffb4ab;border:1px solid #5a2a2a;border-radius:10px}' +
    '#famBox .fmWarn{margin-top:10px;padding:9px 11px;border:1px solid #ffcf5c;border-radius:10px;background:#231d10;color:#ffd27a;font-size:12px;line-height:1.5}' +
    '#famBox h3{margin:16px 0 0;font-size:15px}' +
    // nút 🔗 Liên kết trên thanh trên cùng: màu vàng cam nổi bật (đứng trước 🔑 Mật khẩu)
    '#topbar #famBtn{background:linear-gradient(180deg,#ffd76a,#f5a623);border:1px solid #c98a12;color:#3a2600;box-shadow:0 2px 0 #9a6a0c,0 0 12px rgba(245,166,35,.35)}' +
    '#topbar #famBtn:hover{filter:brightness(1.08)}#topbar #famBtn:active{transform:translateY(1px);box-shadow:0 1px 0 #9a6a0c}';
  document.head.appendChild(css);
  var m = document.createElement('div');
  m.id = 'famModal'; m.className = 'hidden';
  m.onclick = function (e) { if (e.target === m) famClose(); };
  m.innerHTML = '<div id="famBox"><button class="fmX" onclick="famClose()">✕</button><h2>🔗 Liên kết tài khoản (Family)</h2><div id="famBody" class="fmNote">Đang tải...</div></div>';
  document.body.appendChild(m);

  var F = null, XN = null, BUSY = false;
  function e(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $f(id) { return document.getElementById(id); }
  function ve() {
    var b = $f('famBody'); if (!F) { b.innerHTML = 'Đang tải...'; return; }
    var h = '<div class="fmNote">Bạn (👑 trưởng) quản lý <b>KNB</b> + <b>Rương Ích Kỷ</b> chung và <b>Thương Phố</b> từng tài khoản (chọn tài khoản ở Thương Phố). Điểm danh / Nghiện nhận hộ mọi tài khoản; rút vào game thì chọn tài khoản nhận.</div>';
    if (F.coFam) {
      h += '<div class="fmList">' + F.tv.map(function (x) {
        return '<div class="fmRow' + (x.toi ? ' toi' : '') + '"><div class="n"><b>' + e(x.ten || x.acc) + '</b><span>Tài khoản ' + e(x.acc || '?') + '</span></div>' +
          (x.truong ? '<span class="fmTag">👑 Trưởng</span>' : '') + (x.toi ? '<span class="fmTag me">Bạn</span>' : '') +
          (F.laTruong && !x.truong ? '<button class="fmDuoi" onclick="famDuoi(\'' + x.vi + '\')">Đuổi</button>' : '') + '</div>';
      }).join('') + '</div>';
    } else {
      h += '<div class="fmNote" style="margin-top:10px">Bạn chưa có family. Liên kết tài khoản đầu tiên thì bạn thành <b>👑 trưởng</b>.</div>';
    }
    h += '<h3>➕ Thêm tài khoản</h3><div class="fmF">' +
      '<input id="famAcc" placeholder="Tài khoản game" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="20">' +
      '<input id="famPass" type="password" placeholder="Mật khẩu của tài khoản đó" autocomplete="new-password" maxlength="32" onkeydown="if(event.key===\'Enter\')famLink()">' +
      '<div class="fmErr" id="famErr"></div>' +
      '<button class="fmGo" id="famGo" onclick="famLink()"' + (BUSY ? ' disabled' : '') + '>🔗 Liên kết</button></div>' +
      '<div class="fmWarn">⚠️ Khi liên kết: KNB + Rương Ích Kỷ của tài khoản đó <b>gộp vào ví chung</b>, và tài khoản đó <b>không đăng nhập web riêng được nữa</b> (chỉ trưởng quản lý).<br>' +
      'Bị đuổi: tài khoản đó <b>mất hết</b> KNB + Rương Ích Kỷ (ở lại family). Thương Phố không gộp - kho từng nhân vật giữ nguyên. Chỉ trưởng đuổi được.</div>';
    if (F.coFam && !F.laTruong) h += '<button class="fmRoi" onclick="famRoi()">🚪 Rời family (mất hết)</button>';
    b.innerHTML = h;
  }
  function tai() { return api('/api/fam/state').then(function (j) { F = j; ve(); }).catch(function (x) { $f('famBody').textContent = (x && x.message) || 'Không tải được'; }); }
  function xongDoi() { if (typeof refresh === 'function') try { refresh(); } catch (x) { } }
  // Bấm 2 lần trong 6 giây để xác nhận (không dùng confirm())
  function xacNhan(k, msg) { if (XN && XN.k === k && Date.now() - XN.t < 6000) { XN = null; return true; } XN = { k: k, t: Date.now() }; toast(msg); return false; }

  window.famOpen = function () { $f('famModal').classList.remove('hidden'); F = null; ve(); tai(); };
  window.famOpen._v = 1;
  window.famClose = function () { $f('famModal').classList.add('hidden'); };
  window.famLink = function () {
    if (BUSY) return; var acc = ($f('famAcc').value || '').trim().toLowerCase(), pass = $f('famPass').value || '', er = $f('famErr');
    if (!/^[a-z0-9_]{3,20}$/.test(acc)) { er.textContent = 'Nhập tài khoản game (3-20 ký tự: chữ thường, số, _)'; return; }
    if (!pass) { er.textContent = 'Nhập mật khẩu của tài khoản đó'; return; }
    er.textContent = ''; BUSY = true; $f('famGo').disabled = true; $f('famGo').textContent = '⏳ Đang kiểm...';
    // api() của trang NÉM lỗi khi server trả ok:false -> câu lỗi nằm ở .catch
    api('/api/fam/lienket', { acc: acc, pass: pass }).then(function (j) {
      BUSY = false;
      var g = j.gop || {};
      toast('✅ Đã liên kết ' + acc + (g.knb || g.mon || g.luot ? ' - gộp ' + Number(g.knb || 0).toLocaleString('vi-VN') + ' KNB + ' + Number(g.mon || 0).toLocaleString('vi-VN') + ' món rương' + (g.luot ? ' + ' + g.luot + ' lượt quay' : '') : ''));
      F = j.fam; DS = null; if (typeof window.ikcFamReset === 'function') window.ikcFamReset(); ve(); xongDoi();
    }).catch(function (x) { BUSY = false; ve(); $f('famAcc').value = acc; $f('famErr').textContent = '❌ ' + ((x && x.message) || 'Không liên kết được'); });
  };
  window.famDuoi = function (vi) {
    var x = (F && F.tv || []).filter(function (t) { return t.vi === vi; })[0]; if (!x) return;
    if (!xacNhan('duoi' + vi, 'Bấm Đuổi lần nữa trong 6 giây - ' + (x.acc || x.ten) + ' sẽ MẤT HẾT KNB + Rương Ích Kỷ (Thương Phố giữ nguyên)')) return;
    api('/api/fam/duoi', { vi: vi }).then(function (j) { toast('✅ Đã đuổi ' + (x.acc || x.ten)); F = j.fam; DS = null; if (typeof window.ikcFamReset === 'function') window.ikcFamReset(); ve(); xongDoi(); })
      .catch(function (e) { toast('❌ ' + ((e && e.message) || 'Không đuổi được')); });
  };

  // ---- 👪 CHỌN NHÂN VẬT NHẬN khi rút vào game (Rương Ích Kỷ /api/ichky/claim, KNB / vàng /api/dogbridge/rut) ----
  // Bọc api() của trang: family >= 2 tài khoản thì hỏi nhân vật trước khi gửi; chọn rồi giữ 15 giây (rút nhiều món liên tiếp không hỏi lại).
  var DS = null, DS_T = 0, CHON = { vi: '', t: 0 };
  function dsNv() {
    if (DS && Date.now() - DS_T < 30000) return Promise.resolve(DS);
    return apiGoc('/api/fam/state').then(function (j) { DS = (j.tv || []).filter(function (x) { return x.guid; }); DS_T = Date.now(); return DS; })
      .catch(function () { return []; });
  }
  var pk = document.createElement('div');
  pk.id = 'famPick'; pk.className = 'hidden';
  pk.innerHTML = '<div id="famPickBox"><h2>🎮 Rút cho nhân vật nào?</h2><div class="fmNote">Đồ / KNB trừ từ ví chung, gửi vào nhân vật bạn chọn.</div><div id="famPickDs" class="fmList"></div>' +
    '<button class="fmRoi" style="background:#232a3a;color:#ccd;border-color:#33405a" onclick="famPickHuy()">Huỷ - chưa rút</button></div>';
  document.body.appendChild(pk);
  css.textContent += '#famPick{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:130;padding:16px}#famPick.hidden{display:none}' +
    '#famPickBox{background:var(--card);border:1px solid #33405a;border-radius:16px;padding:20px;width:400px;max-width:100%;box-shadow:0 12px 48px rgba(0,0,0,.6)}#famPickBox h2{margin:0;font-size:18px}' +
    '#famPickBox .fmNote{margin-top:6px;font-size:12px;color:var(--muted)}#famPickBox .fmList{margin-top:12px;display:flex;flex-direction:column;gap:6px}' +
    '#famPickBox .fmPk{display:flex;justify-content:space-between;align-items:center;width:100%;margin:0;padding:11px 12px;border:1px solid #2b3550;border-radius:10px;background:#161c2b;color:#e9eefc;font-size:14px;text-align:left}' +
    '#famPickBox .fmPk span{font-size:12px;color:var(--muted)}#famPickBox .fmPk:hover{border-color:#4da3ff}' +
    '#famPickBox .fmRoi{display:block;width:100%;margin-top:12px;padding:10px;font-size:13px;border:1px solid;border-radius:10px}';
  var PK = null;
  function chonNv(ds) {
    return new Promise(function (ok, loi) {
      if (PK) { var cu = PK; PK = null; cu.loi(new Error('Đã huỷ - chưa rút')); }   // lần hỏi trước chưa trả lời -> huỷ, không treo nút
      PK = { ok: ok, loi: loi };
      $f('famPickDs').innerHTML = ds.map(function (x) {
        return '<button class="fmPk" onclick="famPickChon(\'' + x.vi + '\')"><b>' + e(x.ten || x.acc) + (x.toi ? ' (bạn)' : '') + '</b><span>' + e(x.acc) + (x.truong ? ' · 👑' : '') + '</span></button>';
      }).join('');
      pk.classList.remove('hidden');
    });
  }
  window.famPickChon = function (vi) { pk.classList.add('hidden'); var p = PK; PK = null; if (p) p.ok(vi); };
  window.famPickHuy = function () { pk.classList.add('hidden'); var p = PK; PK = null; if (p) p.loi(new Error('Đã huỷ - chưa rút')); };
  var apiGoc = window.api;
  if (typeof apiGoc === 'function' && !apiGoc._fam) {
    window.api = function (p, body) {
      if (body && body.vi === undefined && (p === '/api/ichky/claim' || p === '/api/dogbridge/rut')) {
        return dsNv().then(function (ds) {
          if (ds.length < 2) return apiGoc(p, body);
          // nhớ lựa chọn 15 giây CHỈ trong cùng 1 loại rút (rương nhiều món liên tiếp); rút KNB / vàng luôn hỏi lại
          if (p === '/api/ichky/claim' && CHON.p === p && CHON.vi && Date.now() - CHON.t < 15000) { CHON.t = Date.now(); return apiGoc(p, Object.assign({}, body, { vi: CHON.vi })); }
          return chonNv(ds).then(function (vi) { CHON = { p: p, vi: vi, t: Date.now() }; return apiGoc(p, Object.assign({}, body, { vi: vi })); });
        });
      }
      return apiGoc(p, body);
    };
    window.api._fam = 1;
  }
  // Điểm danh dùng chung: server trả DST.fam {tong, chua, tv} -> ghi rõ trên nút đang nhận cho mấy tài khoản
  if (typeof window.dRender === 'function' && !window.dRender._fam) {
    var dRenderGoc = window.dRender;
    window.dRender = function () {
      dRenderGoc.apply(this, arguments);
      try {
        if (typeof DST === 'undefined' || !DST || !DST.fam) return;
        var b = document.getElementById('dClaim'), f = DST.fam;
        if (b) b.textContent = DST.checkedToday ? '✅ CẢ FAMILY (' + f.tong + ' TÀI KHOẢN) ĐÃ ĐIỂM DANH - MAI QUAY LẠI'
          : '✨ ĐIỂM DANH ' + f.chua + '/' + f.tong + ' TÀI KHOẢN (+' + DST.amount.toLocaleString('vi-VN') + ')';
        if (b) b.title = f.tv.map(function (x) { return (x.da ? '✅ ' : '⬜ ') + (x.ten || x.acc) + ' (' + x.acc + ')'; }).join('\n');
      } catch (x) { }
    };
    window.dRender._fam = 1;
  }
  window.famRoi = function () {
    if (!xacNhan('roi', 'Bấm Rời lần nữa trong 6 giây - tài khoản này sẽ MẤT HẾT KNB + Rương Ích Kỷ (Thương Phố giữ nguyên)')) return;
    api('/api/fam/roi', {}).then(function () { toast('✅ Đã rời family'); DS = null; tai(); xongDoi(); })
      .catch(function (e) { toast('❌ ' + ((e && e.message) || 'Không rời được')); });
  };
})();
