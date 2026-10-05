// 💎 05/10: admin Ghép Ngọc (phục vụ ở /gn-admin.js, cổng SUPER). Dùng hàm chung của panel: api, toast, esc, vqaIc.
// Vẽ vào #gnaApp. Gọi gnaLoad() khi mở.
(function () {
  var A = null, TIM = [], LOC = '';
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
      + 'Giá 1 món bỏ vào lấy theo thứ tự: <b>giá riêng ở đây</b> → <b>giá bán Rương Ích Kỷ</b> (tab 📦 Kho đồ) → <b>rác = % giá shop web</b>. Không có giá nào thì không bỏ vào được.' + (c.moi ? ' <b>Đang dùng cấu hình mặc định, chưa lưu lần nào.</b>' : '') + '</div>';
    if (A.canhBao && A.canhBao.length) h += '<div class="note" style="border-color:#c0392b"><b>⚠️ Cảnh báo kinh tế:</b>' + A.canhBao.map(function (w) { return '<div>• ' + esc(w) + '</div>'; }).join('') + '</div>';
    h += '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px">' + chk('gnaOn', c.on, '<b>Bật</b> trên web')
      + '<label>Phí % ' + inp('gnaPhi', c.phi, 60) + '</label><label>Tỉ lệ tối thiểu % ' + inp('gnaMin', c.tiMin, 60) + '</label><label>tối đa % ' + inp('gnaMax', c.tiMax, 60) + '</label>'
      + '<label>Lượt/ngày (0 = không giới hạn) ' + inp('gnaLuot', c.luotNgay, 70) + '</label><label>Món tối đa/lần ' + inp('gnaMon', c.monMax, 70) + '</label></div>';
    h += '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:center;margin-top:6px">' + chk('gnaKnb', c.knbOn, 'Cho bỏ thêm KNB web') + '<label>KNB tối đa/lần ' + inp('gnaKnbMax', c.knbMax, 100) + '</label></div>';
    h += '<h4 style="margin:14px 0 6px">🧰 Giá đồ bỏ vào</h4><div class="row" style="gap:12px;flex-wrap:wrap;align-items:center">' + chk('gnaRuong', c.vao.giaRuong, 'Dùng giá bán Rương Ích Kỷ') + chk('gnaRac', c.vao.rac.on, 'Tính <b>rác</b> = ') + inp('gnaRacPct', c.vao.rac.pct, 50) + ' % giá shop web</div>';
    h += '<div class="muted" style="font-size:12px;margin:6px 0">Giá riêng (ghi đè; 0 = cấm bỏ vào):</div><div id="gnaVaoR">' + bangRieng('vao', c.vao.rieng) + '</div>';
    h += '<h4 style="margin:14px 0 6px">🎯 Món đích</h4><div class="row" style="gap:12px;flex-wrap:wrap;align-items:center">';
    Object.keys(A.nhomDich).forEach(function (k) { var g = c.dich.nhom[k] || { on: false, gia: 0 }; h += chk('gnaN_' + k, g.on, esc(A.nhomDich[k])) + ' giá trị ' + inp('gnaNG_' + k, g.gia, 100); });
    h += '</div><div class="muted" style="font-size:12px;margin:6px 0">Món đích riêng / phiếu KNB (giá trị; 0 = gỡ khỏi danh sách đích):</div><div id="gnaDichR">' + bangRieng('dich', c.dich.rieng) + '</div>';
    h += '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><input id="gnaQ" placeholder="🔎 Tìm vật phẩm (tên không dấu hoặc ID) để thêm giá riêng" style="flex:1;min-width:220px" onkeydown="if(event.key===\'Enter\')gnaTim()"><button onclick="gnaTim()">Tìm</button></div><div id="gnaKq" style="margin-top:6px">' + kq() + '</div>';
    h += '<div class="row" style="gap:8px;margin-top:12px"><button class="btn-green" onclick="gnaSave()">💾 Lưu Ghép Ngọc</button><button class="btn-grey" onclick="gnaLoad()">🔄 Tải lại</button></div>';
    h += '<h4 style="margin:16px 0 6px">💰 Bảng giá đang tính (' + A.bangGia.length + ' món bỏ vào được) · ' + A.dich.length + ' món đích</h4>'
      + '<input placeholder="Lọc bảng giá..." value="' + esc(LOC) + '" oninput="gnaLoc(this.value)" style="width:240px"><div style="max-height:360px;overflow:auto;margin-top:6px"><table><thead><tr><th>Món</th><th>Giá shop web</th><th>Giá bỏ vào</th><th>Nguồn giá</th></tr></thead><tbody id="gnaBG">' + bangGia() + '</tbody></table></div>';
    h += '<h4 style="margin:16px 0 6px">📜 Lượt luyện gần đây</h4><div style="max-height:260px;overflow:auto;font-size:12px">' + (A.log.length ? A.log.map(function (x) { return '<div>' + new Date(x.t).toLocaleString('vi-VN') + ' · <b>' + esc(x.ten) + '</b> ' + (x.thang ? '<b style="color:#3ddc84">THẮNG</b>' : '<span style="color:#ff7b7b">thua</span>') + ' ' + esc(x.tenDich) + ' · ' + x.tiLe + '% (tung ' + x.roll + ') · bỏ ' + so(x.tong) + '</div>'; }).join('') : '<span class="muted">Chưa có lượt nào.</span>') + '</div>';
    box.innerHTML = h;
  }
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
      vao: { giaRuong: b('gnaRuong'), rac: { on: b('gnaRac'), pct: v('gnaRacPct') }, rieng: {} }, dich: { nhom: {}, rieng: {} } };
    Object.keys(A.nhomDich).forEach(function (k) { o.dich.nhom[k] = { on: b('gnaN_' + k), gia: v('gnaNG_' + k) }; });
    [].slice.call(document.querySelectorAll('#gnaApp input[data-loai]')).forEach(function (x) { o[x.getAttribute('data-loai')].rieng[x.getAttribute('data-id')] = x.value; });
    return o;
  }
  window.gnaLoc = function (s) { LOC = s; var t = el('gnaBG'); if (t) t.innerHTML = bangGia(); };
  window.gnaTim = function () { var q = el('gnaQ').value.trim(); if (!q) return; api('/api/gn/tim', { q: q }).then(function (j) { TIM = j.items || []; el('gnaKq').innerHTML = TIM.length ? kq() : '<span class="muted">Không thấy.</span>'; }).catch(function (e) { toast('❌ ' + e.message); }); };
  window.gnaThem = function (loai, k) {
    var it = TIM[k]; if (!it) return; var o = doc();
    var md = loai === 'vao' ? Math.floor((it.shop || 0) * 0.25) : (it.shop || 0);
    var g = prompt((loai === 'vao' ? 'Giá trị 1 cái khi BỎ VÀO' : 'Giá trị món ĐÍCH') + ' cho ' + it.ten + ' (#' + it.id + ')' + (it.shop ? ' - giá shop web ' + it.shop : ''), String(md || ''));
    if (g === null) return; o[loai].rieng[it.id] = g; A.cfg = Object.assign({}, A.cfg, o); A.cfg[loai] = o[loai];
    if (!A.bangGia.find(function (y) { return y.id === it.id; })) A.bangGia.push({ id: it.id, ten: it.ten, shop: it.shop, gia: 0, tu: '(chưa lưu)' });
    ve(); toast('➕ Đã thêm - nhớ bấm 💾 Lưu');
  };
  window.gnaBoR = function (loai, id) { var o = doc(); delete o[loai].rieng[id]; A.cfg = Object.assign({}, A.cfg, o); ve(); };
  window.gnaSave = function () { api('/api/gn/save', doc()).then(function (j) { A = j; ve(); toast('💾 Đã lưu Ghép Ngọc - ' + (j.cfg.on ? 'đang BẬT' : 'đang tắt')); }).catch(function (e) { toast('❌ ' + e.message); }); };
})();
