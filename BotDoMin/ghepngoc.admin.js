// 💎 05/10: admin Ghép Ngọc (phục vụ ở /gn-admin.js, cổng SUPER). Dùng hàm chung của panel: api, toast, esc, vqaIc.
// Vẽ vào #gnaApp. Gọi gnaLoad() khi mở.
(function () {
  var A = null, TIM = [], LOC = '', LLOC = '';
  function el(id) { return document.getElementById(id); }
  function ic(x) { return typeof vqaIc === 'function' ? vqaIc(x && x.ic) : ''; }
  function so(v) { return Math.floor(Number(v) || 0).toLocaleString('vi-VN'); }
  function inp(id, v, w, extra) { return '<input class="mini-in" id="' + id + '" value="' + esc(String(v)) + '" style="width:' + (w || 80) + 'px" ' + (extra || '') + '>'; }
  function chk(id, v, lbl) { return '<label style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" id="' + id + '" style="width:auto;margin:0" ' + (v ? 'checked' : '') + '> ' + lbl + '</label>'; }
  window.gnaLoad = function () { api('/api/gn/cfg', {}).then(function (j) { A = j; ve(); }).catch(function (e) { toast('❌ ' + e.message); }); };
  function ve() {
    var box = el('gnaApp'); if (!box || !A) return;
    var c = A.cfg, h = '';
    h += '<div class="note">Người chơi bỏ đồ trong 🧰 Rương Ích Kỷ để luyện ra 1 món đích. <b>Tỉ lệ = tổng giá trị bỏ vào ÷ giá món đích × (100 − phí)%</b>, kẹp trong [tối thiểu, tối đa]. Thua là mất hết đồ đã bỏ. '
      + 'Giá 1 món bỏ vào lấy theo thứ tự: <b>giá riêng ở đây</b> (ngoại lệ admin tự đặt) → <b>% giá chợ</b> (shop web, chỉ món ĐANG BÁN; mặc định 90% = rẻ hơn ngoài 10%) → <b>giá bán Rương Ích Kỷ</b> (mặc định tắt). Món không có giá chợ thì KHÔNG hiện ở mục bỏ vào của người chơi.' + (c.moi ? ' <b>Đang dùng cấu hình mặc định, chưa lưu lần nào.</b>' : '') + '</div>';
    if (A.canhBao && A.canhBao.length) h += '<div class="note" style="border-color:#c0392b"><b>⚠️ Cảnh báo kinh tế:</b>' + A.canhBao.map(function (w) { return '<div>• ' + esc(w) + '</div>'; }).join('') + '</div>';
    h += '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px">' + chk('gnaOn', c.on, '<b>Bật</b> trên web')
      + '<label>Phí % ' + inp('gnaPhi', c.phi, 60) + '</label><label>Tỉ lệ tối thiểu % ' + inp('gnaMin', c.tiMin, 60) + '</label><label>tối đa % ' + inp('gnaMax', c.tiMax, 60) + '</label>'
      + '<label>Lượt/ngày (0 = không giới hạn) ' + inp('gnaLuot', c.luotNgay, 70) + '</label><label>Món tối đa/lần ' + inp('gnaMon', c.monMax, 70) + '</label></div>';
    h += '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:center;margin-top:6px">' + chk('gnaKnb', c.knbOn, 'Cho bỏ thêm KNB web') + '<label>KNB tối đa/lần ' + inp('gnaKnbMax', c.knbMax, 100) + '</label></div>';
    h += '<h4 style="margin:14px 0 6px">🧰 Giá đồ bỏ vào</h4><div class="row" style="gap:12px;flex-wrap:wrap;align-items:center">' + chk('gnaRac', c.vao.shop.on, 'Món có ở shop web tính = ') + inp('gnaRacPct', c.vao.shop.pct, 50) + ' % giá shop' + chk('gnaRuong', c.vao.giaRuong, 'Món không có ở shop: dùng giá bán Rương Ích Kỷ') + '</div>';
    h += '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:center;margin-top:6px"><span class="muted" style="font-size:12px">Cấm bỏ vào (kiểm trước cả giá riêng):</span>' + Object.keys(A.nhomCam || {}).map(function (k) { return chk('gnaC_' + k, c.vao.cam && c.vao.cam[k], esc(A.nhomCam[k])); }).join('') + '</div>';
    h += '<div class="muted" style="font-size:12px;margin:6px 0">Giá riêng (ghi đè; 0 = cấm bỏ vào):</div><div id="gnaVaoR">' + bangRieng('vao', c.vao.rieng) + '</div>';
    h += '<h4 style="margin:14px 0 6px">🎯 Món đích</h4><div class="row" style="gap:12px;flex-wrap:wrap;align-items:center">';
    h += '</div>';
    Object.keys(A.nhomDich).forEach(function (k) { var g = c.dich.nhom[k] || { on: false, gia: 0, ids: [] }; h += '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0">' + chk('gnaN_' + k, g.on, '<b>' + esc(A.nhomDich[k]) + '</b>') + ' giá trị ' + inp('gnaNG_' + k, g.gia, 90) + ' thắng nhận ' + inp('gnaNS_' + k, g.sl || 1, 50) + ' cái · ID: ' + inp('gnaNI_' + k, (g.ids || []).join(' '), 380) + '<span class="muted" style="font-size:12px">' + (g.ids || []).map(function (id) { var x = (A.dich || []).find(function (y) { return y.id === id; }); return x ? esc(x.ten) : '#' + id; }).join(', ') + '</span></div>'; });
    h += '<div><div class="muted" style="font-size:12px;margin:6px 0">Món đích riêng / phiếu KNB (giá trị; 0 = gỡ khỏi danh sách đích):</div><div id="gnaDichR">' + bangRieng('dich', c.dich.rieng) + '</div>';
    h += '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><input id="gnaQ" placeholder="🔎 Tìm vật phẩm (tên không dấu hoặc ID) để thêm giá riêng" style="flex:1;min-width:220px" onkeydown="if(event.key===\'Enter\')gnaTim()"><button onclick="gnaTim()">Tìm</button></div><div id="gnaKq" style="margin-top:6px">' + kq() + '</div>';
    var tb = c.thongBao || {}, kenh = A.kenh || [];
    h += '<h4 style="margin:14px 0 6px">📣 Thông báo Discord mỗi lần luyện</h4><div class="row" style="gap:12px;flex-wrap:wrap;align-items:center">' + chk('gnaTbOn', tb.on, '<b>Bật</b>')
      + '<label>Kênh <select id="gnaTbK" onchange="var i=document.getElementById(\'gnaTbKid\');if(this.value)i.value=this.value"><option value="">-- chọn kênh --</option>' + kenh.map(function (k) { return '<option value="' + k.id + '"' + (k.id === tb.kenh ? ' selected' : '') + '>' + esc(k.guild + ' › #' + k.ten) + '</option>'; }).join('') + '</select></label>'
      + '<label>ID kênh ' + inp('gnaTbKid', tb.kenh || '', 170) + '</label>'
      + chk('gnaTbW', tb.thang, '🎉 báo khi THẮNG (chúc mừng)') + chk('gnaTbL', tb.thua, '💥 báo khi THUA (châm biếm)') + chk('gnaTbTag', tb.tag, 'tag người chơi')
      + '<label>chỉ báo món đích từ ' + inp('gnaTbMin', tb.minGia || 0, 90) + ' giá trị (0 = báo hết)</label><label title="Kim trên web quay 7,6 giây - đăng sớm hơn là lộ kết quả trước người chơi">đăng sau ' + inp('gnaTbTre', tb.tre === undefined ? 8 : tb.tre, 50) + ' giây</label><button class="btn-grey" onclick="gnaThuTb()">🧪 Gửi thử</button></div>';
    h += '<div class="row" style="gap:8px;margin-top:12px"><button class="btn-green" onclick="gnaSave()">💾 Lưu Ghép Ngọc</button><button class="btn-grey" onclick="gnaLoad()">🔄 Tải lại</button></div>';
    h += '<h4 style="margin:16px 0 6px">💰 Bảng giá đang tính (' + A.bangGia.length + ' món bỏ vào được) · ' + A.dich.length + ' món đích</h4>'
      + '<input placeholder="Lọc bảng giá..." value="' + esc(LOC) + '" oninput="gnaLoc(this.value)" style="width:240px"><div style="max-height:360px;overflow:auto;margin-top:6px"><table><thead><tr><th>Món</th><th>Giá shop web</th><th>Giá bỏ vào</th><th>Nguồn giá</th></tr></thead><tbody id="gnaBG">' + bangGia() + '</tbody></table></div>';
    h += '<h4 style="margin:16px 0 6px">📜 Nhật ký luyện (' + A.log.length + ' lượt gần nhất)</h4><input placeholder="Lọc theo tên người chơi / món..." value="' + esc(LLOC) + '" oninput="gnaLLoc(this.value)" style="width:280px"><div id="gnaLog" style="max-height:520px;overflow:auto;margin-top:6px">' + nhatKy() + '</div>';
    box.innerHTML = h;
  }
  // 📜 05/10: mỗi lượt = 1 dòng: giờ · người · [hình đồ bỏ vào ×SL] → [hình món đích ×SL] · tỉ lệ/tung · kết quả · nút Hoàn
  function nhatKy(ds0, chiXem) {
    var l = LLOC.toLowerCase();
    var ds = (ds0 || A.log).filter(function (x) { return !l || String(x.ten || '').toLowerCase().indexOf(l) >= 0 || String(x.tenDich || '').toLowerCase().indexOf(l) >= 0 || (x.vaoCt || []).some(function (v) { return v.ten.toLowerCase().indexOf(l) >= 0; }); });
    if (!ds.length) return '<span class="muted">Chưa có lượt nào.</span>';
    return ds.map(function (x) {
      var vao = (x.vaoCt || []).map(function (v) { return '<span title="' + esc(v.ten) + '" style="display:inline-flex;align-items:center;gap:3px;margin:2px 6px 2px 0">' + ic(v) + '<span style="font-size:12px">' + esc(v.ten) + ' <b>×' + v.sl + '</b></span></span>'; }).join('') + (x.knb ? '<span style="font-size:12px;margin-right:6px">💰 ' + so(x.knb) + ' KNB</span>' : '');
      var dich = '<span title="' + esc(x.tenDich) + '" style="display:inline-flex;align-items:center;gap:3px">' + ic({ ic: x.icDich }) + '<span style="font-size:12px">' + esc(x.tenDich) + ((x.sl || 1) > 1 ? ' <b>×' + x.sl + '</b>' : '') + '</span></span>';
      var kq = x.thang ? '<b style="color:#3ddc84">🎉 THẮNG</b>' : '<b style="color:#ff7b7b">💥 thua</b>';
      var nut = chiXem ? (x.hoan ? '<span class="muted" style="font-size:12px">↩ admin đã hoàn</span>' : '') : x.hoan ? '<span class="muted" style="font-size:12px">↩ đã hoàn ' + new Date(x.hoan.t).toLocaleString('vi-VN') + '</span>' : '<button class="btn-grey" style="padding:3px 8px;font-size:12px" onclick="gnaHoan(\'' + x.k + '\')">↩ Hoàn đồ</button>';
      return '<div style="border-bottom:1px solid #2a2e3b;padding:6px 0;' + (x.hoan ? 'opacity:.55' : '') + '"><div style="font-size:12px;margin-bottom:3px"><span class="muted">' + new Date(x.t).toLocaleString('vi-VN') + '</span> · <b>' + esc(x.ten || x.uid) + '</b> · ' + kq + ' · ' + x.tiLe + '% (tung ' + x.roll + ') · bỏ ' + so(x.tong) + ' → giá trị đích ' + so(x.gia) + ' ' + nut + '</div>'
        + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">' + vao + '<b style="margin:0 8px;font-size:16px">→</b>' + dich + '</div></div>';
    }).join('');
  }
  window.gnaLLoc = function (s) { LLOC = s; var e = el('gnaLog'); if (e) e.innerHTML = nhatKy(); };
  // 👀 cổng mod: tab 💎 Ghép Ngọc chỉ xem (/api/gn/xem)
  var X = null;
  window.gnxLoad = function () { api('/api/gn/xem', {}).then(function (j) { X = j; gnxVe(); }).catch(function (e) { var b = el('gnxApp'); if (b) b.textContent = '❌ ' + e.message; }); };
  function gnxVe() {
    var b = el('gnxApp'); if (!b || !X) return;
    b.innerHTML = '<div class="muted" style="font-size:13px;margin-bottom:6px">' + (X.on ? '<b style="color:var(--green)">ĐANG BẬT</b>' : '<b style="color:var(--red)">ĐANG TẮT</b>') + ' · phí ' + X.phi + '% · tỉ lệ tối đa ' + X.tiMax + '% · ' + X.log.length + ' lượt gần nhất · ' + X.log.filter(function (x) { return x.thang; }).length + ' thắng</div>'
      + '<input placeholder="Lọc theo tên người chơi / món..." value="' + esc(LLOC) + '" oninput="gnxLoc(this.value)" style="width:280px"><div id="gnxLog" style="max-height:620px;overflow:auto;margin-top:6px">' + nhatKy(X.log, true) + '</div>';
  }
  window.gnxLoc = function (s) { LLOC = s; var e = el('gnxLog'); if (e) e.innerHTML = nhatKy(X.log, true); };
  window.gnaHoan = function (k) {
    var x = A.log.find(function (y) { return y.k === k; }); if (!x) return;
    var ds = (x.vaoCt || []).map(function (v) { return v.ten + ' ×' + v.sl; }).join(', ') + (x.knb ? ' + ' + so(x.knb) + ' KNB' : '');
    if (!confirm('Hoàn cho ' + (x.ten || x.uid) + ' (lượt ' + new Date(x.t).toLocaleString('vi-VN') + '):\n' + ds + '\n\nĐồ trả về Rương Ích Kỷ của họ. Món đã ' + (x.thang ? 'thắng (' + x.tenDich + ') vẫn giữ.' : 'thua thì thôi.') + ' Mỗi lượt chỉ hoàn 1 lần.')) return;
    api('/api/gn/hoan', { k: k }).then(function (j) { A = j; ve(); toast(j.message || '↩ Đã hoàn'); }).catch(function (e) { toast('❌ ' + e.message); });
  };
  function bangRieng(loai, o) {
    var ids = Object.keys(o || {}); if (!ids.length) return '<span class="muted" style="font-size:12px">(chưa có)</span>';
    var ten = function (id) { var x = (A.bangGia || []).concat(A.dich || []).find(function (y) { return y.id === id; }); return x ? x.ten : '#' + id; };
    return '<table><tbody>' + ids.map(function (id) { return '<tr><td>' + esc(ten(id)) + ' <span class="muted">#' + id + '</span></td><td>' + inp('gnaR_' + loai + '_' + id, o[id], 100, 'data-loai="' + loai + '" data-id="' + id + '"') + '</td><td><button class="btn-red" onclick="gnaBoR(\'' + loai + '\',\'' + id + '\')">🗑</button></td></tr>'; }).join('') + '</tbody></table>';
  }
  function bangGia() {
    var l = LOC.toLowerCase();
    return A.bangGia.filter(function (x) { return !l || x.ten.toLowerCase().indexOf(l) >= 0 || x.id.indexOf(l) >= 0; }).slice(0, 400).map(function (x) { return '<tr><td>' + esc(x.ten) + ' <span class="muted">#' + x.id + '</span></td><td>' + (x.shop ? so(x.shop) : '-') + '</td><td><b>' + so(x.gia) + '</b></td><td class="muted">' + esc(x.tu || 'cấm') + '</td></tr>'; }).join('');
  }
  function kq() { return TIM.map(function (it, k) { return '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px;padding:3px 6px;border:1px solid #3a3f4b;border-radius:6px">' + ic(it) + esc(it.ten) + ' <span class="muted">#' + it.id + (it.shop ? ' · shop ' + so(it.shop) : '') + '</span> <button class="btn-grey" onclick="gnaThem(\'vao\',' + k + ')">+ giá bỏ vào</button><button class="btn-grey" onclick="gnaThem(\'dich\',' + k + ')">+ món đích</button></span>'; }).join(''); }
  function doc() {
    var c = A.cfg, v = function (id) { return el(id).value; }, b = function (id) { return el(id).checked; };
    var o = { on: b('gnaOn'), phi: v('gnaPhi'), tiMin: v('gnaMin'), tiMax: v('gnaMax'), luotNgay: v('gnaLuot'), monMax: v('gnaMon'), knbOn: b('gnaKnb'), knbMax: v('gnaKnbMax'),
      vao: { cam: Object.fromEntries(Object.keys(A.nhomCam || {}).map(function (k) { return [k, b('gnaC_' + k)]; })), giaRuong: b('gnaRuong'), shop: { on: b('gnaRac'), pct: v('gnaRacPct') }, rieng: {} }, dich: { nhom: {}, rieng: {} } };
    Object.keys(A.nhomDich).forEach(function (k) { o.dich.nhom[k] = { on: b('gnaN_' + k), gia: v('gnaNG_' + k), sl: v('gnaNS_' + k), ids: v('gnaNI_' + k) }; });
    o.thongBao = { on: b('gnaTbOn'), kenh: v('gnaTbKid').trim(), thang: b('gnaTbW'), thua: b('gnaTbL'), minGia: v('gnaTbMin'), tag: b('gnaTbTag'), tre: v('gnaTbTre') };
    [].slice.call(document.querySelectorAll('#gnaApp input[data-loai]')).forEach(function (x) { o[x.getAttribute('data-loai')].rieng[x.getAttribute('data-id')] = x.value; });
    return o;
  }
  window.gnaLoc = function (s) { LOC = s; var t = el('gnaBG'); if (t) t.innerHTML = bangGia(); };
  window.gnaTim = function () { var q = el('gnaQ').value.trim(); if (!q) return; api('/api/gn/tim', { q: q }).then(function (j) { TIM = j.items || []; el('gnaKq').innerHTML = TIM.length ? kq() : '<span class="muted">Không thấy.</span>'; }).catch(function (e) { toast('❌ ' + e.message); }); };
  window.gnaThem = function (loai, k) {
    var it = TIM[k]; if (!it) return; var o = doc();
    var md = loai === 'vao' ? Math.floor((it.shop || 0) * (Number(A.cfg.vao.shop.pct) || 90) / 100) : (it.shop || 0);
    var g = prompt((loai === 'vao' ? 'Giá trị 1 cái khi BỎ VÀO' : 'Giá trị món ĐÍCH') + ' cho ' + it.ten + ' (#' + it.id + ')' + (it.shop ? ' - giá shop web ' + it.shop : ''), String(md || ''));
    if (g === null) return; o[loai].rieng[it.id] = g; A.cfg = Object.assign({}, A.cfg, o); A.cfg[loai] = o[loai];
    if (!A.bangGia.find(function (y) { return y.id === it.id; })) A.bangGia.push({ id: it.id, ten: it.ten, shop: it.shop, gia: 0, tu: '(chưa lưu)' });
    ve(); toast('➕ Đã thêm - nhớ bấm 💾 Lưu');
  };
  window.gnaBoR = function (loai, id) { var o = doc(); delete o[loai].rieng[id]; A.cfg = Object.assign({}, A.cfg, o); ve(); };
  window.gnaThuTb = function () { api('/api/gn/thu', {}).then(function (j) { toast(j.message || '📣 Đã gửi'); }).catch(function (e) { toast('❌ ' + e.message); }); };
  window.gnaSave = function () { api('/api/gn/save', doc()).then(function (j) { A = j; ve(); toast('💾 Đã lưu Ghép Ngọc - ' + (j.cfg.on ? 'đang BẬT' : 'đang tắt')); }).catch(function (e) { toast('❌ ' + e.message); }); };
})();
