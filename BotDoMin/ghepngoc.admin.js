// 💎 05/10: admin Ghép Ngọc (phục vụ ở /gn-admin.js, cổng SUPER). Dùng hàm chung của panel: api, toast, esc, vqaIc, uiConfirm.
// Vẽ vào #gnaApp. Gọi gnaLoad() khi mở.
// 07/10 (chủ server) làm lại: cài đặt ở trên; dưới là 2 cột - TRÁI = đồ được bỏ vào (trade) + giá, PHẢI = món đích + giá + số nhận.
//   Thêm bằng ô tìm của từng cột, xoá bằng ✕ hoặc chọn nhiều rồi "Xoá đã chọn". Sửa xong bấm 💾 Lưu (chưa lưu thì chưa áp).
//   Dữ liệu cũ (giá lấy theo Shop Item, món đích theo nhóm) -> nút ⤵️ Chuyển ghi cứng vào 2 danh sách, GIỮ NGUYÊN giá (/api/gn/chuyen).
(function () {
  var A = null, S = null, TIM = { vao: [], dich: [] }, LOC = { vao: '', dich: '' }, LLOC = '', BAN = false;
  function el(id) { return document.getElementById(id); }
  function ic(x) { return typeof vqaIc === 'function' ? vqaIc(x && x.ic) : ''; }
  function so(v) { return Math.floor(Number(v) || 0).toLocaleString('vi-VN'); }
  function inp(id, v, w, extra) { return '<input class="mini-in" id="' + id + '" value="' + esc(String(v)) + '" style="width:' + (w || 80) + 'px" ' + (extra || '') + '>'; }
  function chk(id, v, lbl) { return '<label style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" id="' + id + '" style="width:auto;margin:0" ' + (v ? 'checked' : '') + '> ' + lbl + '</label>'; }
  // khung panel .wrap chỉ 840px -> mở tab Ghép Ngọc thì nới 1400px cho 2 cột (tab khác giữ nguyên)
  var CSS = '.wrap:has(#tab-gn:not(.hidden)){max-width:1400px}'
    + '#gnaApp .gnaCols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:12px;align-items:start}@media(max-width:1000px){#gnaApp .gnaCols{grid-template-columns:minmax(0,1fr)}}'
    + '#gnaApp .gnaCol{min-width:0;border:1px solid #2f3545;border-radius:12px;padding:10px;background:#151925}'
    + '#gnaApp .gnaCol h4{margin:0 0 8px;display:flex;align-items:center;gap:8px}#gnaApp .gnaCol h4 small{margin-left:auto;font-weight:400}'
    + '#gnaApp .gnaBar{display:flex;gap:6px;align-items:center;margin:6px 0}#gnaApp .gnaBar input{flex:1;min-width:0;margin:0}#gnaApp .gnaBar button{white-space:nowrap;margin:0}'
    + '#gnaApp .gnaList{max-height:560px;overflow:auto;border-top:1px solid #2a2e3b}'
    + '#gnaApp .gnaR{display:flex;align-items:center;gap:6px;padding:4px 2px;border-bottom:1px solid #222838;font-size:13px}#gnaApp .gnaR:hover{background:#1b2030}'
    + '#gnaApp .gnaR .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#gnaApp .gnaR input.mini-in{margin:0;padding:3px 6px}'
    + '#gnaApp .gnaR .x{width:auto;margin:0;padding:2px 9px;background:#3a1c1c;border:1px solid #7a3434;color:#ffb4b4;border-radius:7px;cursor:pointer}'
    + '#gnaApp .gnaKq .gnaR{background:#11202a}#gnaApp .gnaDirty{color:#ffb35c;font-weight:700}'
    + '#gnaApp .gnaTop{display:flex;gap:12px;flex-wrap:wrap;align-items:center}#gnaApp details{margin-top:10px;border:1px solid #2f3545;border-radius:10px;padding:6px 10px}#gnaApp summary{cursor:pointer;font-weight:700}';
  function cssOn() { if (!el('gnaCss')) { var s = document.createElement('style'); s.id = 'gnaCss'; s.textContent = CSS; document.head.appendChild(s); } }
  // tên + hình của 1 ID (từ bảng giá / món đích / kết quả tìm)
  var META = {};
  function nap(ds) { (ds || []).forEach(function (x) { if (x && x.id) META[x.id] = { ten: x.ten, ic: x.ic, shop: x.shop }; }); }
  function tenOf(id) { return (META[id] && META[id].ten) || ('#' + id); }
  function moi(j) {   // dữ liệu mới từ server -> trạng thái sửa
    A = j; nap(A.bangGia); nap(A.dich); nap(A.dichTen);
    var r = A.cfg.dich.rieng || {}, d = {};
    Object.keys(r).forEach(function (id) { var g = r[id]; d[id] = typeof g === 'object' ? { gia: g.gia, sl: g.sl || 1, off: !!g.off } : { gia: g, sl: 1, off: false }; });
    S = { vao: Object.assign({}, A.cfg.vao.rieng || {}), dich: d }; BAN = false;
    // món đang trade được nhưng CHƯA nằm trong danh sách (giá theo Shop Item / món đích theo nhóm) -> hiện mờ để thấy đủ như prod
    LINK = {
      vao: (A.bangGia || []).filter(function (x) { return x.gia > 0 && (A.cfg.vao.rieng || {})[x.id] === undefined; }),
      dich: (A.dich || []).filter(function (x) { return x.nhom !== 'rieng'; }),
    };
  }
  var LINK = { vao: [], dich: [] };
  function cu() {   // còn dữ liệu kiểu cũ (giá theo shop / rương, món đích theo nhóm)?
    var c = A.cfg, nhom = Object.keys(c.dich.nhom || {}).filter(function (k) { return c.dich.nhom[k].on; });
    var shopMon = (A.bangGia || []).filter(function (x) { return x.gia > 0 && (c.vao.rieng || {})[x.id] === undefined; }).length;
    var nhomMon = (A.dich || []).filter(function (x) { return x.nhom !== 'rieng'; }).length;
    return (c.vao.shop.on || c.vao.giaRuong || nhom.length) ? { shopMon: shopMon, nhomMon: nhomMon } : null;
  }
  window.gnaLoad = function () { api('/api/gn/cfg', {}).then(function (j) { moi(j); ve(); }).catch(function (e) { toast('❌ ' + e.message); }); };
  function danhDau() { BAN = true; var d = el('gnaDirty'); if (d) d.textContent = '● có thay đổi chưa lưu'; }
  function ve() {
    var box = el('gnaApp'); if (!box || !A) return; cssOn();
    var c = A.cfg, h = '';
    h += '<div class="note" style="font-size:12px">Người chơi bỏ đồ trong 🧰 Rương Ích Kỷ để luyện ra 1 món đích. <b>Tỉ lệ = tổng giá trị bỏ vào ÷ giá món đích × (100 − phí)%</b>, kẹp trong [tối thiểu, tối đa]. Thua là mất hết đồ đã bỏ. Chỉ món có trong danh sách <b>🧰 bỏ vào</b> mới đem trade được; món đích nhận vào rương.</div>';
    if (A.canhBao && A.canhBao.length) h += '<div class="note" style="border-color:#c0392b"><b>⚠️ Cảnh báo kinh tế:</b>' + A.canhBao.map(function (w) { return '<div>• ' + esc(w) + '</div>'; }).join('') + '</div>';
    var o = cu();
    if (o) h += '<div class="note" style="border-color:#f5c542"><b>⤵️ Dữ liệu kiểu cũ:</b> ' + (o.shopMon ? o.shopMon + ' món bỏ vào đang tự lấy giá từ Shop Item' + (c.vao.shop.on ? ' (' + c.vao.shop.pct + '% giá shop)' : '') + '. ' : '') + (o.nhomMon ? o.nhomMon + ' món đích đang theo nhóm. ' : '')
      + 'Bấm để ghi cứng hết vào 2 danh sách bên dưới - <b>giữ nguyên giá</b>, không xoá gì, sau đó đổi giá Shop Item không ảnh hưởng Ghép Ngọc nữa. <button class="btn-green" style="margin-left:6px" onclick="gnaChuyen()">⤵️ Chuyển vào danh sách</button></div>';
    // --- cài đặt
    h += '<div class="gnaTop" style="margin-top:8px">' + chk('gnaOn', c.on, '<b>Bật</b> trên web')
      + '<label>Phí % ' + inp('gnaPhi', c.phi, 55) + '</label><label>Tỉ lệ tối thiểu % ' + inp('gnaMin', c.tiMin, 55) + '</label><label>tối đa % ' + inp('gnaMax', c.tiMax, 55) + '</label>'
      + '<label>Lượt/ngày (0 = không giới hạn) ' + inp('gnaLuot', c.luotNgay, 65) + '</label><label>Món tối đa/lần ' + inp('gnaMon', c.monMax, 65) + '</label>'
      + chk('gnaKnb', c.knbOn, 'Cho bỏ thêm KNB web') + '<label>KNB tối đa/lần ' + inp('gnaKnbMax', c.knbMax, 90) + '</label></div>';
    var tb = c.thongBao || {}, kenh = A.kenh || [];
    h += '<details><summary>📣 Thông báo Discord mỗi lần luyện ' + (tb.on ? '<span style="color:var(--green)">(đang bật)</span>' : '<span class="muted">(tắt)</span>') + '</summary><div class="gnaTop" style="margin-top:8px">' + chk('gnaTbOn', tb.on, '<b>Bật</b>')
      + '<label>Kênh <select id="gnaTbK" onchange="var i=document.getElementById(\'gnaTbKid\');if(this.value)i.value=this.value"><option value="">-- chọn kênh --</option>' + kenh.map(function (k) { return '<option value="' + k.id + '"' + (k.id === tb.kenh ? ' selected' : '') + '>' + esc(k.guild + ' › #' + k.ten) + '</option>'; }).join('') + '</select></label>'
      + '<label>ID kênh ' + inp('gnaTbKid', tb.kenh || '', 170) + '</label>'
      + chk('gnaTbW', tb.thang, '🎉 báo khi THẮNG') + chk('gnaTbL', tb.thua, '💥 báo khi THUA') + chk('gnaTbTag', tb.tag, 'tag người chơi')
      + chk('gnaTbAnh', tb.anh === undefined ? true : tb.anh, '📸 gửi <b>ẢNH</b> kết quả') + chk('gnaTbAnhChu', tb.anhChu, 'kèm câu dưới ảnh')
      + '<label>chỉ báo món đích từ ' + inp('gnaTbMin', tb.minGia || 0, 90) + ' giá trị (0 = báo hết)</label><label title="Kim trên web quay 7,6 giây - đăng sớm hơn là lộ kết quả trước người chơi">đăng sau ' + inp('gnaTbTre', tb.tre === undefined ? 8 : tb.tre, 50) + ' giây</label><button class="btn-grey" onclick="gnaThuTb()">🧪 Gửi thử</button></div></details>';
    h += '<div class="gnaTop" style="margin-top:10px"><button class="btn-green" onclick="gnaSave()">💾 Lưu Ghép Ngọc</button><button class="btn-grey" onclick="gnaLoad()">🔄 Tải lại (bỏ thay đổi)</button><span id="gnaDirty" class="gnaDirty">' + (BAN ? '● có thay đổi chưa lưu' : '') + '</span></div>';
    // --- 2 cột
    h += '<div class="gnaCols">' + cot('vao') + cot('dich') + '</div>';
    h += '<details><summary>📜 Nhật ký luyện (' + A.log.length + ' lượt gần nhất)</summary><input placeholder="Lọc theo tên người chơi / món..." value="' + esc(LLOC) + '" oninput="gnaLLoc(this.value)" style="width:280px;margin-top:8px"><div id="gnaLog" style="max-height:520px;overflow:auto;margin-top:6px">' + nhatKy() + '</div></details>';
    box.innerHTML = h;
  }
  function cot(k) {
    var vao = k === 'vao', n = Object.keys(S[k]).length;
    return '<div class="gnaCol"><h4>' + (vao ? '🧰 Đồ được bỏ vào (trade)' : '🎯 Món đích') + ' <span class="muted" id="gnaN_' + k + '">' + demN(k) + '</span><small class="muted">' + (vao ? 'giá trị 1 cái' : 'giá trị · số nhận khi thắng') + '</small></h4>'
      + '<div class="gnaBar"><input id="gnaQ_' + k + '" placeholder="🔎 Tìm vật phẩm để THÊM (tên không dấu hoặc ID)" onkeydown="if(event.key===\'Enter\')gnaTim(\'' + k + '\')"><button onclick="gnaTim(\'' + k + '\')">Tìm</button></div>'
      + '<div class="gnaKq" id="gnaKq_' + k + '">' + kq(k) + '</div>'
      + '<div class="gnaBar"><input placeholder="Lọc danh sách..." value="' + esc(LOC[k]) + '" oninput="gnaLoc(\'' + k + '\',this.value)"><button class="btn-grey" onclick="gnaChonHet(\'' + k + '\')">☑ Chọn hết (đang lọc)</button><button class="btn-red" onclick="gnaXoaChon(\'' + k + '\')">🗑 Xoá đã chọn</button></div>'
      + (vao ? '' : '<div class="gnaBar" style="justify-content:flex-end"><span class="muted" style="font-size:12px;margin-right:auto">Món ⚫ tắt: giữ trong danh sách, người chơi không thấy</span><button class="btn-grey" onclick="gnaBatChon(true)">🟢 Bật đã chọn</button><button class="btn-grey" onclick="gnaBatChon(false)">⚫ Tắt đã chọn</button></div>')
      + '<div class="gnaList" id="gnaDs_' + k + '">' + ds(k) + '</div></div>';
  }
  function ds(k) {
    var l = LOC[k].toLowerCase(), o = S[k];
    var ids = Object.keys(o).filter(function (id) { return !l || tenOf(id).toLowerCase().indexOf(l) >= 0 || id.indexOf(l) >= 0; });
    var gia = function (id) { return k === 'vao' ? Number(o[id]) || 0 : Number(o[id].gia) || 0; };
    ids.sort(function (a, b) { return gia(b) - gia(a) || tenOf(a).localeCompare(tenOf(b)); });
    var lk = LINK[k].filter(function (x) { return o[x.id] === undefined && (!l || String(x.ten).toLowerCase().indexOf(l) >= 0 || x.id.indexOf(l) >= 0); });
    var phu = lk.length ? '<div class="muted" style="padding:6px 2px;font-size:12px;border-bottom:1px solid #222838;background:#1d1a10">🔗 ' + lk.length + (k === 'vao' ? ' món đang tự lấy giá theo Shop Item' : ' món đích đang theo nhóm') + ' - người chơi VẪN dùng được; bấm <b>⤵️ Chuyển</b> ở trên để đưa vào danh sách và sửa được:</div>'
      + lk.map(function (x) { return '<div class="gnaR" style="opacity:.6">' + ic(x) + '<span class="n" title="' + esc(x.ten) + '">' + esc(x.ten) + ' <span class="muted">#' + x.id + '</span></span><span style="font-size:12px">' + so(x.gia) + (k === 'dich' && x.sl > 1 ? ' ×' + x.sl : '') + ' <span class="muted">' + esc(k === 'vao' ? (x.tu || 'theo shop') : 'theo nhóm') + '</span></span></div>'; }).join('') : '';
    if (!ids.length) return '<div class="muted" style="padding:10px;font-size:12px">' + (Object.keys(o).length ? 'Không có món khớp bộ lọc.' : '(chưa có món nào - tìm ở ô trên để thêm)') + '</div>' + phu;
    return ids.map(function (id) {
      var m = META[id] || {}, g = k === 'vao' ? o[id] : o[id].gia;
      var tat = k === 'dich' && o[id].off;
      return '<div class="gnaR"' + (tat ? ' style="opacity:.5"' : '') + '><input type="checkbox" data-k="' + k + '" data-id="' + id + '" style="width:auto;margin:0">' + ic(m) + '<span class="n" title="' + esc(tenOf(id)) + '">' + esc(tenOf(id)) + ' <span class="muted">#' + id + '</span></span>'
        + inp('gnaG_' + k + '_' + id, g, 95, 'type="number" min="0" oninput="gnaSua(\'' + k + '\',\'' + id + '\',\'gia\',this.value)"')
        + (k === 'dich' ? '×' + inp('gnaS_' + id, o[id].sl, 48, 'type="number" min="1" title="Số cái nhận khi thắng" oninput="gnaSua(\'dich\',\'' + id + '\',\'sl\',this.value)"')
          + '<button class="x" style="background:' + (tat ? '#2a2e3b;border-color:#3a4050;color:#aab' : '#13261b;border-color:#2f6b46;color:#7ee2a8') + '" title="Bật / tạm tắt món đích này (tắt = người chơi không thấy)" onclick="gnaBat(\'' + id + '\')">' + (tat ? '⚫ Tắt' : '🟢 Bật') + '</button>' : '')
        + '<button class="x" title="Xoá khỏi danh sách" onclick="gnaXoa(\'' + k + '\',\'' + id + '\')">✕</button></div>';
    }).join('') + phu;
  }
  function kq(k) {
    if (!TIM[k].length) return '';
    return '<div class="muted" style="font-size:12px;margin:2px 0">Kết quả tìm - nhập giá rồi bấm ➕ (' + TIM[k].length + ' món):</div>' + TIM[k].map(function (it, i) {
      var co = S[k][it.id] !== undefined;
      return '<div class="gnaR">' + ic(it) + '<span class="n" title="' + esc(it.ten) + '">' + esc(it.ten) + ' <span class="muted">#' + it.id + (it.shop ? ' · shop ' + so(it.shop) : '') + '</span></span>'
        + (co ? '<span class="muted" style="font-size:12px">✔ đã có</span>' : inp('gnaTG_' + k + '_' + i, '', 95, 'type="number" min="0" placeholder="giá trị"') + (k === 'dich' ? '×' + inp('gnaTS_' + i, 1, 48, 'type="number" min="1" title="Số cái nhận khi thắng"') : '')
          + '<button class="btn-green" style="width:auto;margin:0;padding:3px 10px" onclick="gnaThem(\'' + k + '\',' + i + ')">➕</button>') + '</div>';
    }).join('') + '<div style="text-align:right;margin:2px 0 6px"><button class="btn-grey" style="width:auto;padding:2px 10px;font-size:12px" onclick="gnaDongTim(\'' + k + '\')">Đóng kết quả tìm</button></div>';
  }
  function demN(k) { var n = Object.keys(S[k]).length, m = LINK[k].filter(function (x) { return S[k][x.id] === undefined; }).length; return '(' + n + (m ? ' + ' + m + (k === 'vao' ? ' theo shop' : ' theo nhóm') : '') + ')'; }
  function veCot(k) { var d = el('gnaDs_' + k); if (d) d.innerHTML = ds(k); var q = el('gnaKq_' + k); if (q) q.innerHTML = kq(k); var n = el('gnaN_' + k); if (n) n.textContent = demN(k); }
  window.gnaLoc = function (k, s) { LOC[k] = s; var d = el('gnaDs_' + k); if (d) d.innerHTML = ds(k); };
  window.gnaSua = function (k, id, f, v) { if (k === 'vao') S.vao[id] = v; else S.dich[id][f] = v; danhDau(); };
  window.gnaXoa = function (k, id) { delete S[k][id]; danhDau(); veCot(k); toast('🗑 Đã xoá ' + tenOf(id) + ' - nhớ bấm 💾 Lưu'); };
  // 07/10: bật / tạm tắt món đích (vd trứng pet chờ người chơi đạt cấp 95)
  window.gnaBat = function (id) { var x = S.dich[id]; if (!x) return; x.off = !x.off; danhDau(); veCot('dich'); toast((x.off ? '⚫ Đã tắt ' : '🟢 Đã bật ') + tenOf(id) + ' - nhớ bấm 💾 Lưu'); };
  window.gnaBatChon = function (bat) {
    var ids = [].slice.call(document.querySelectorAll('#gnaDs_dich input[type=checkbox]:checked')).map(function (x) { return x.getAttribute('data-id'); });
    if (!ids.length) { toast('Chưa chọn món nào'); return; }
    ids.forEach(function (id) { if (S.dich[id]) S.dich[id].off = !bat; }); danhDau(); veCot('dich'); toast((bat ? '🟢 Đã bật ' : '⚫ Đã tắt ') + ids.length + ' món - nhớ bấm 💾 Lưu');
  };
  window.gnaChonHet = function (k) { [].slice.call(document.querySelectorAll('#gnaDs_' + k + ' input[type=checkbox]')).forEach(function (x) { x.checked = true; }); };
  window.gnaXoaChon = function (k) {
    var ids = [].slice.call(document.querySelectorAll('#gnaDs_' + k + ' input[type=checkbox]:checked')).map(function (x) { return x.getAttribute('data-id'); });
    if (!ids.length) { toast('Chưa chọn món nào'); return; }
    uiConfirm('Xoá ' + ids.length + ' món khỏi danh sách ' + (k === 'vao' ? 'BỎ VÀO' : 'MÓN ĐÍCH') + '? (chưa áp cho tới khi bấm 💾 Lưu)', '🗑 Xoá ' + ids.length + ' món', 'btn-red').then(function (ok) {
      if (!ok) return; ids.forEach(function (id) { delete S[k][id]; }); danhDau(); veCot(k); toast('🗑 Đã xoá ' + ids.length + ' món - nhớ bấm 💾 Lưu');
    });
  };
  window.gnaTim = function (k) {
    var q = (el('gnaQ_' + k) || {}).value; q = (q || '').trim(); if (!q) return;
    api('/api/gn/tim', { q: q }).then(function (j) { TIM[k] = j.items || []; nap(TIM[k]); var e = el('gnaKq_' + k); if (e) e.innerHTML = TIM[k].length ? kq(k) : '<div class="muted" style="font-size:12px">Không thấy.</div>'; }).catch(function (e) { toast('❌ ' + e.message); });
  };
  window.gnaDongTim = function (k) { TIM[k] = []; var e = el('gnaKq_' + k); if (e) e.innerHTML = ''; };
  window.gnaThem = function (k, i) {
    var it = TIM[k][i]; if (!it) return;
    var g = ((el('gnaTG_' + k + '_' + i) || {}).value || '').trim();
    if (g === '' || !(Number(g) > 0)) { toast('❌ Nhập giá trị (> 0) cho ' + it.ten); var f = el('gnaTG_' + k + '_' + i); if (f) f.focus(); return; }
    if (k === 'vao') S.vao[it.id] = Math.floor(Number(g));
    else S.dich[it.id] = { gia: Math.floor(Number(g)), sl: Math.max(1, Math.floor(Number((el('gnaTS_' + i) || {}).value) || 1)) };
    META[it.id] = { ten: it.ten, ic: it.ic, shop: it.shop }; danhDau(); veCot(k); toast('➕ Đã thêm ' + it.ten + ' - nhớ bấm 💾 Lưu');
  };
  function doc() {
    var c = A.cfg, v = function (id) { return el(id).value; }, b = function (id) { return el(id).checked; };
    // cấm / liên kết shop / nhóm món đích: không còn trên giao diện -> GIỮ NGUYÊN giá trị đang có (chỉ ⤵️ Chuyển mới tắt)
    var nhom = {}; Object.keys(c.dich.nhom || {}).forEach(function (k) { var g = c.dich.nhom[k]; nhom[k] = { on: g.on, gia: g.gia, sl: g.sl, ids: Array.isArray(g.ids) ? g.ids.join(' ') : String(g.ids || '') }; });
    return { on: b('gnaOn'), phi: v('gnaPhi'), tiMin: v('gnaMin'), tiMax: v('gnaMax'), luotNgay: v('gnaLuot'), monMax: v('gnaMon'), knbOn: b('gnaKnb'), knbMax: v('gnaKnbMax'),
      vao: { cam: c.vao.cam, giaRuong: c.vao.giaRuong, shop: c.vao.shop, rieng: S.vao }, dich: { nhom: nhom, rieng: S.dich },
      thongBao: { on: b('gnaTbOn'), kenh: v('gnaTbKid').trim(), thang: b('gnaTbW'), thua: b('gnaTbL'), minGia: v('gnaTbMin'), tag: b('gnaTbTag'), tre: v('gnaTbTre'), anh: b('gnaTbAnh'), anhChu: b('gnaTbAnhChu') } };
  }
  window.gnaSave = function () { api('/api/gn/save', doc()).then(function (j) { moi(j); ve(); toast('💾 Đã lưu Ghép Ngọc - ' + (j.cfg.on ? 'đang BẬT' : 'đang tắt')); }).catch(function (e) { toast('❌ ' + e.message); }); };
  window.gnaChuyen = function () {
    if (BAN) { toast('Đang có thay đổi chưa lưu - bấm 💾 Lưu hoặc 🔄 Tải lại trước khi chuyển'); return; }
    uiConfirm('Ghi cứng các món đang lấy giá theo Shop Item vào danh sách BỎ VÀO và tách món đích theo nhóm thành từng dòng - giữ nguyên giá, không xoá gì. Sau đó đổi giá Shop Item không còn ảnh hưởng Ghép Ngọc.', '⤵️ Chuyển', 'btn-green').then(function (ok) {
      if (!ok) return; api('/api/gn/chuyen', {}).then(function (j) { moi(j); ve(); toast(j.message || '⤵️ Đã chuyển'); }).catch(function (e) { toast('❌ ' + e.message); });
    });
  };
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
    // 07/10: hộp xác nhận của panel (uiConfirm) thay confirm() của trình duyệt
    uiConfirm('Hoàn cho ' + (x.ten || x.uid) + ' (lượt ' + new Date(x.t).toLocaleString('vi-VN') + '): ' + ds + ' · Đồ trả về Rương Ích Kỷ của họ. Món đã ' + (x.thang ? 'thắng (' + x.tenDich + ') vẫn giữ.' : 'thua thì thôi.') + ' Mỗi lượt chỉ hoàn 1 lần.', '↩ Hoàn đồ', 'btn-green').then(function (ok) {
      if (!ok) return;
      // hoàn không đụng cấu hình -> giữ nguyên thay đổi đang sửa (S), chỉ làm mới nhật ký
      api('/api/gn/hoan', { k: k }).then(function (j) { A.log = j.log || A.log; var e = el('gnaLog'); if (e) e.innerHTML = nhatKy(); toast(j.message || '↩ Đã hoàn'); }).catch(function (e) { toast('❌ ' + e.message); });
    });
  };
  window.gnaThuTb = function () { api('/api/gn/thu', {}).then(function (j) { toast(j.message || '📣 Đã gửi'); }).catch(function (e) { toast('❌ ' + e.message); }); };
  // 05/10: F5 đứng ở tab Ghép Ngọc - panel khôi phục tab TRƯỚC khi file này tải xong -> tự tải
  setTimeout(function () { var a = document.getElementById('tab-gn'), x = document.getElementById('tab-gnx'); if (a && !a.classList.contains('hidden')) window.gnaLoad(); if (x && !x.classList.contains('hidden')) window.gnxLoad(); }, 0);
})();
