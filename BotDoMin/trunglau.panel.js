// 🐉 08/10 CUSTOM TRÙNG LÂU (tab 🛠️ GM, chỉ cổng SUPER) - phục vụ ở /tl.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Dữ liệu + ghi đi qua /api/gm/trunglau -> panel GM (repo tlbbnetco4, panel/trunglau.py). Chỉ Trùng Lâu dòng mới 10553100-10553114.
//  - DÒNG: lưu trên món lúc tạo -> chỉ món tạo mới / Chân Trùng Lâu đem tẩy mới ăn dòng mới.
//  - ĐIỂM: server tính lại mỗi lần vào game = ceil(V × hệ số cấp / 100) -> áp cho CẢ món đang có (dòng món đó có), sau restart.
//  - HIỆU ỨNG (tỉ lệ / thời gian / miễn / phản): chung toàn server cho mọi ai cầm mã đó, sau restart.
(function () {
  // 09/10: 2 muc doc lap dung chung code - NS = tien to ham (tl / lv), BOX = id khung, CFG = { ten, nhom, sel, coHu }
  function lap(NS, BOX, CFG) {
  var TL = { them: false, d: null, sel: CFG.sel, hu: {}, sua: {}, giu: null, chiMa: false, xnRs: 0, xnTra: 0 };
  var IDS = []; CFG.nhom.forEach(function (g) { IDS = IDS.concat(g[1]).concat(g[2] ? [g[2]] : []); });
  var NHOM = null;
  var NHOM_TL = [['Liên (dây chuyền)', ['10553100', '10553112'], '10553103'], ['Giới (nhẫn)', ['10553101', '10553113'], '10553104'],
    ['Ngọc (hộ phù)', ['10553102', '10553114'], '10553105'], ['Đai (thắt lưng)', ['10553106'], '10553107'],
    ['Vai (hộ kiên)', ['10553108'], '10553109'], ['Giáp (áo)', ['10553110'], '10553111'],
    ['Bản cũ giao dịch được (nâng → Chân dòng mới)', ['10422016', '10423024'], null]];
  NHOM = CFG.nhom.length ? CFG.nhom : NHOM_TL;
  IDS = []; NHOM.forEach(function (g) { IDS = IDS.concat(g[1]).concat(g[2] ? [g[2]] : []); });
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }
  function so(n) { return Number(n || 0).toLocaleString('vi-VN'); }
  function mon(id) { return TL.d ? TL.d.mon.filter(function (m) { return m.id === id; })[0] : null; }
  // giống panel/trunglau.py v_cho: V cho điểm gần x nhất (bằng nhau lấy bên lớn)
  function vCho(x, r) { if (x <= 0 || r <= 0) return 0; var v = Math.floor((x - 1) * 100 / r) + 1; while (Math.ceil(v * r / 100) < x) v++; if (v > 1 && x - Math.ceil((v - 1) * r / 100) < Math.ceil(v * r / 100) - x) v--; return v; }
  function seRa(x, r) { return r > 0 ? Math.ceil(vCho(x, r) * r / 100) : 0; }
  // 2 số gần x nhất engine làm được (dòng hệ số > 100, vd 180: muốn 300 chỉ có 299 / 301)
  function hangXom(x, r) { var vHi = Math.floor((x - 1) * 100 / r) + 1; while (Math.ceil(vHi * r / 100) < x) vHi++; var hi = Math.ceil(vHi * r / 100), lo = vHi > 1 ? Math.ceil((vHi - 1) * r / 100) : hi; return lo === hi ? String(hi) : lo + ' / ' + hi; }
  function raChu(x, r) { var ra = seRa(x, r); return ra === x ? so(ra) : so(ra) + ' ⚠ chỉ có ' + hangXom(x, r); }

  function css() {
    if (document.getElementById('tlCss')) return;
    var s = document.createElement('style'); s.id = 'tlCss';
    s.textContent = '.tlKhung{display:grid;gap:12px;margin-top:8px;color:#e6ebf5}' +
      '.tlKhung .tlBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.tlKhung button{padding:6px 12px;border-radius:7px;border:1px solid #3a4560;background:#243049;color:#e6ebf5;cursor:pointer;font-size:13px}' +
      '.tlKhung button.tlGo{background:#1f8f4e;border-color:#1f8f4e;color:#fff}.tlKhung button.tlDo{background:#9c2730;border-color:#9c2730;color:#fff}' +
      '.tlKhung button:disabled{opacity:.5;cursor:default}' +
      '.tlKhung .tlNote{font-size:12px;color:#93a0b8;line-height:1.5}.tlKhung .tlWarn{background:#3b2c14;border:1px solid #7a5a1c;color:#f3cf8a;border-radius:8px;padding:8px 10px;font-size:12.5px}' +
      '.tlKhung .tlWrap{display:grid;grid-template-columns:240px minmax(0,1fr);gap:12px}@container (max-width:760px){.tlKhung .tlWrap{grid-template-columns:1fr}}' +
      '.tlKhung .tlList{display:grid;gap:8px;align-content:start}.tlKhung .tlGrp{background:#161c28;border:1px solid #2a3346;border-radius:8px;padding:6px}' +
      '.tlKhung .tlGrp b{display:block;font-size:12px;color:#c9a45c;margin:0 0 4px 2px}' +
      '.tlKhung .tlIt{display:flex;justify-content:space-between;gap:6px;width:100%;text-align:left;margin:2px 0;padding:5px 8px;font-size:12.5px;background:transparent;border-color:transparent}' +
      '.tlKhung .tlIt.on{background:#243049;border-color:#4a5a80}.tlKhung .tlIt small{color:#93a0b8}.tlKhung .tlIt .tlDot{color:#5fae84;font-weight:700}' +
      '.tlKhung .tlPane{display:grid;gap:12px;min-width:0;align-content:start}.tlKhung .tlCard{background:#161c28;border:1px solid #2a3346;border-radius:10px;padding:12px;display:grid;gap:10px;min-width:0}' +
      '.tlKhung h4{margin:0;font-size:15px}.tlKhung .tlKv{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:#b9c3d6}' +
      '.tlKhung .tlHu{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.tlKhung .tlHu label{display:grid;gap:3px;font-size:12px;color:#93a0b8}' +
      '.tlKhung input[type=number]{width:100%;padding:5px 7px;border-radius:6px;border:1px solid #3a4560;background:#0f141d;color:#e6ebf5;font-variant-numeric:tabular-nums}' +
      '.tlKhung input.tlCh{border-color:#5fae84;background:#17301f}.tlKhung .tlTbl{overflow-x:auto}.tlKhung table{border-collapse:collapse;width:100%;min-width:560px;font-size:12.5px}' +
      '.tlKhung th,.tlKhung td{padding:5px 8px;border-bottom:1px solid #2a3346;text-align:left;vertical-align:middle}.tlKhung th{color:#93a0b8;font-weight:600;font-size:11.5px}' +
      '.tlKhung td.n{font-variant-numeric:tabular-nums}.tlKhung tr.off td{color:#6c7891}.tlKhung .tlGoc{font-size:11px;color:#c9a45c}.tlKhung .tlLech{color:#f3cf8a}' +
      '.tlKhung .tlCnt{font-weight:700}.tlKhung .tlCnt.bad{color:#ff8a8a}.tlKhung input[type=checkbox]{width:16px;height:16px}' +
      '.tlKhung .tlPill{display:inline-block;font-size:11px;border:1px solid #3a4560;border-radius:999px;padding:0 6px;color:#b9c3d6}' +
      '.tlKhung .tlSo{font-size:12.5px;color:#b9c3d6;display:grid;gap:4px}.tlKhung .tlSo input[type=number]{width:64px;display:inline-block}';
    document.head.appendChild(s);
  }

  function nap() {
    return api('/api/gm/trunglau', { op: 'xem' }).then(function (j) {
      TL.d = j.data; TL.online = j.online;
      var c = TL.d.cfg || {};
      TL.hu = JSON.parse(JSON.stringify(c.hu || {}));
      TL.sua = {};
      ve();
    });
  }
  window[NS + 'Load'] = function () { css(); var b = document.getElementById(BOX); if (b) { b.classList.add('tlKhung'); b.style.display = ''; b.innerHTML = '<div class="tlNote">Đang tải…</div>'; } nap().catch(function (er) { loi(er); }); };

  // trạng thái sửa (nháp) của mã đang chọn: {on:{k:true}, diem:{k:x}}
  function nhap(id) {
    if (!TL.sua[id]) {
      var m = mon(id), on = {}, diem = {};
      m.dong.forEach(function (k) { on[k] = true; });
      for (var k = 0; k < 58; k++) diem[k] = m.diem[k] || m.diemGoc[k] || 0;
      var cm = ((TL.d.cfg || {}).mon || {})[id];
      TL.sua[id] = { on: on, diem: diem, so: cm && cm.so ? cm.so.slice() : null };   // 09/10: so = [min,max] dong ra moi lan tao; null = du moi dong tick
    }
    return TL.sua[id];
  }
  // 09/10: xac suat ra DU k dong goc khi moi lan tao boc n dong (n deu trong [a,b]) tu C dong bat - gia dinh engine chon deu, chua do
  function khoang(a) { return a[0] === a[1] ? String(a[0]) : a[0] + '–' + a[1]; }
  function tohop(n, r) { if (r < 0 || r > n) return 0; var x = 1; for (var i = 1; i <= r; i++) x = x * (n - r + i) / i; return x; }
  function xsDu(C, k, a, b) {
    var t = 0; for (var n = a; n <= b; n++) t += n < k ? 0 : tohop(C - k, n - k) / tohop(C, n);
    return t / (b - a + 1);
  }

  function ve() {
    var b = document.getElementById(BOX); if (!b || !TL.d) return;
    var cfg = TL.d.cfg || {}, nMa = Object.keys(cfg.mon || {}).filter(function (i) { return IDS.indexOf(i) >= 0; }).length, nHu = CFG.coHu ? Object.keys(cfg.hu || {}).length : 0;
    var h = '<div class="tlBar"><button onclick="' + NS + 'Load()">🔄 Tải lại</button><button onclick="' + NS + 'Giu()">👥 Ai đang giữ ' + CFG.ten + '</button>' +
      '<button class="tlDo" onclick="' + NS + 'Tra()">' + (TL.xnTra ? '⚠ Bấm lần nữa: trả TẤT CẢ ' + CFG.ten + ' về gốc' : '♻️ Trả tất cả ' + CFG.ten + ' về gốc') + '</button>' +
      '<button onclick="' + NS + 'Restart()">' + (TL.xnRs ? '⚠ Bấm lần nữa để restart (' + TL.online + ' người online)' : '🔁 Restart game (' + TL.online + ' online)') + '</button></div>';
    h += (nMa || nHu) ? '<div class="tlWarn">Đang áp cấu hình riêng cho <b>' + nMa + '</b> mã và <b>' + nHu + '</b> hiệu ứng. Mọi thay đổi chỉ có hiệu lực sau khi <b>restart game</b>.' +
      (cfg.huAi ? ' Lần chỉnh hiệu ứng cuối: ' + e(cfg.huAi) + '.' : '') + '</div>' : '<div class="tlNote">Chưa chỉnh gì: mọi ' + CFG.ten + ' đang đúng bản gốc.</div>';
    h += '<div id="' + NS + 'GiuBox">' + veGiu() + '</div>';
    h += '<div class="tlWrap"><div class="tlList">';
    NHOM.forEach(function (g) {
      h += '<div class="tlGrp"><b>' + e(g[0]) + '</b>';
      g[1].concat(g[2] ? [g[2]] : []).forEach(function (id) {
        var m = mon(id); if (!m) return;
        h += '<button class="tlIt' + (TL.sel === id ? ' on' : '') + '" onclick="' + NS + 'Chon(\'' + id + '\')"><span>' + (m.chan ? '✦ Chân' : (/^Long V/.test(m.ten) ? m.ten.replace(/^Long Văn /, '') : 'Thường')) + ' <small>' + id + '</small></span><span><small>' + e(m.gd) + '</small>' +
          ((cfg.mon || {})[id] ? ' <span class="tlDot" title="đã chỉnh">●</span>' : '') + '</span></button>';
      });
      h += '</div>';
    });
    h += '</div><div class="tlPane">' + veMon(TL.sel) + '</div></div>';
    b.innerHTML = h;
  }

  function veMon(id) {
    var m = mon(id); if (!m) return '';
    var s = nhap(id), cfgMon = ((TL.d.cfg || {}).mon || {})[id];
    var cung = m.huCung || TL.d.mon.filter(function (x) { return x.hu && m.hu && x.hu.id === m.hu.id; }).map(function (x) { return x.id; });
    var h = '<div class="tlCard"><h4>' + e(m.ten) + ' <span class="tlPill">' + id + '</span> <span class="tlPill">' + e(m.gd) + '</span></h4>' +
      '<div class="tlKv"><span>Cấp phẩm chất cố định: <b>' + m.cap + '</b></span><span>Đoạn điểm: <b>' + m.seg + '</b>' + (m.seg !== m.segGoc ? ' (gốc ' + m.segGoc + ')' : '') + '</span>' +
      '<span>Số dòng ra: <b>' + khoang(m.soDong) + '</b>' + (khoang(m.soDong) !== khoang(m.soDongGoc) ? ' (gốc ' + khoang(m.soDongGoc) + ')' : '') + '</span>' +
      '<span>Dòng bật: <b>' + m.dong.length + '</b> (gốc ' + m.dongGoc.length + ')</span></div>' +
      (m.soDong[0] < m.dong.length ? '<div class="tlNote">Hiện tại mỗi món <b>bốc ngẫu nhiên ' + khoang(m.soDong) + ' trong ' + m.dong.length + '</b> dòng bật' + (m.soDong[1] > m.dong.length ? ' (tối đa ' + m.soDong[1] + ' &gt; ' + m.dong.length + ' dòng có → thường ra đủ)' : '') + '. Chỉnh ở ô <b>Số dòng ra mỗi lần tạo</b> dưới bảng dòng.</div>' : '') +
      '</div>';
    // hiệu ứng
    if (m.hu) {
      var hu = m.hu, hg = m.huGoc || hu, nh = TL.hu[hu.id] || {}, ns = hu.sub ? (TL.hu[hu.sub] || {}) : {};
      h += '<div class="tlCard"><h4>Hiệu ứng thần khí: ' + e(hu.ten) + ' <span class="tlNote">' + e(hu.tenCN) + ' · mã ' + hu.id + (hu.sub ? ' → ' + hu.sub : '') + '</span></h4>' +
        '<div class="tlNote">Chung toàn server cho: <b>' + cung.join(', ') + '</b>. Đổi ở đây là đổi cho tất cả các mã đó.</div><div class="tlHu">';
      var o = function (lbl, hid, k, cur, goc, donvi, chia) {
        var val = (TL.hu[hid] || {})[k] != null ? TL.hu[hid][k] / (chia || 1) : cur / (chia || 1);
        return '<label>' + lbl + '<input type="number" min="0" step="1" value="' + val + '" data-h="' + hid + '" data-k="' + k + '" data-c="' + (chia || 1) + '" oninput="' + NS + 'HuSua(this)" class="' + ((TL.hu[hid] || {})[k] != null ? 'tlCh' : '') + '">' +
          '<span class="tlGoc">đang ' + so(cur / (chia || 1)) + donvi + ' · gốc ' + so(goc / (chia || 1)) + donvi + '</span></label>';
      };
      if (hu.tham.rate != null) h += o('Tỉ lệ dính (% mỗi đòn trúng)', hu.id, 'rate', hu.tham.rate, hg.tham.rate, '%');
      if (hu.dur != null) h += o('Thời gian hiệu ứng (giây)', hu.sub, 'dur', hu.dur, hg.dur, ' giây', 1000);
      if (hu.tham.mien != null) h += o('Miễn (%)', hu.id, 'mien', hu.tham.mien, hg.tham.mien, '%');
      if (hu.tham.phan != null) h += o('Phản đòn (%)', hu.id, 'phan', hu.tham.phan, hg.tham.phan, '%');
      if (hu.tham.tran != null) h += o('Trần sát thương phản', hu.id, 'tran', hu.tham.tran, hg.tham.tran, '');
      h += '</div><div class="tlBar"><button class="tlGo" onclick="' + NS + 'LuuHu()">💾 Lưu hiệu ứng (toàn server)</button><span class="tlNote">Lưu mọi ô hiệu ứng đã đổi ở mọi mã, có hiệu lực sau restart.</span></div></div>';
    }
    // dòng + điểm
    var nOn = Object.keys(s.on).filter(function (k) { return s.on[k]; }).length, max = TL.d.maxDong;
    // chỉ dòng game CÓ cho mã này (dòng tự ra + dòng có số gốc trong đoạn giá trị) - 08/10 chủ server: bỏ dòng không có số gốc
    var thu = (TL.them ? (m.dongCo || m.dongGoc) : m.dongGoc).slice();
    Object.keys(s.on).forEach(function (k) { k = Number(k); if (s.on[k] && thu.indexOf(k) < 0) thu.push(k); });   // dòng đang bật luôn hiện
    thu.sort(function (a, b2) { var ga = m.dongGoc.indexOf(a) >= 0 ? 0 : 1, gb = m.dongGoc.indexOf(b2) >= 0 ? 0 : 1; return (s.on[b2] ? 1 : 0) - (s.on[a] ? 1 : 0) || ga - gb || a - b2; });
    h += '<div class="tlCard"><h4>Dòng thuộc tính và điểm <span class="tlCnt' + (nOn > max || !nOn ? ' bad' : '') + '">' + nOn + ' / ' + max + ' dòng</span></h4>' +
      '<div class="tlNote">Tick dòng muốn có (tối đa ' + max + '). <b>Dòng</b> ghi vào món lúc tạo: chỉ món tạo mới / Chân Trùng Lâu đem tẩy mới ra đúng dòng. ' +
      '<b>Điểm</b> server tính lại mỗi lần vào game: đổi điểm áp cho cả món đang có (ở dòng món đó có) sau restart. Cột "sẽ ra" là số thật engine cho (vài dòng hệ số lớn chỉ ra số chẵn/lẻ nhất định).</div>' +
      '<label class="tlNote"><input type="checkbox" ' + (TL.them ? 'checked ' : '') + 'onchange="' + NS + 'Them(this.checked)"> Hiện thêm dòng game có số nhưng món này không tự ra (' + ((m.dongCo || []).length - m.dongGoc.length) + ' dòng)</label>' +
      '<div class="tlTbl"><table><thead><tr><th></th><th>Dòng</th><th>Gốc</th><th>Điểm muốn</th><th>Sẽ ra</th></tr></thead><tbody>';
    thu.forEach(function (k) {
      var r = m.rate[k], on = !!s.on[k], x = s.diem[k], ra = seRa(x, r), lech = on && ra !== x;
      var goc = so(m.diemGoc[k]) + (m.dongGoc.indexOf(k) >= 0 ? '' : ' <span class="tlPill" title="món gốc không tự ra dòng này; game có sẵn số trong đoạn giá trị">thêm</span>');
      h += '<tr class="' + (on ? '' : 'off') + '"><td><input type="checkbox" ' + (on ? 'checked ' : '') + (r > 0 ? '' : 'disabled title="dòng này không có hệ số ở cấp ' + m.cap + '" ') + 'onchange="' + NS + 'Dong(' + k + ',this.checked)"></td>' +
        '<td>' + e(TL.d.dongTen[k]) + '</td><td class="n">' + goc + '</td>' +
        '<td><input type="number" min="1" step="1" value="' + (x || '') + '" ' + (on ? '' : 'disabled ') + 'oninput="' + NS + 'Diem(' + k + ',this.value)" class="' + (on && x !== m.diem[k] ? 'tlCh' : '') + '"></td>' +
        '<td class="n' + (lech ? ' tlLech' : '') + '" id="' + NS + 'Ra' + k + '">' + (on ? raChu(x, r) : '') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    // 09/10 (chủ server): số dòng ra mỗi lần tạo < số dòng tick -> bốc ngẫu nhiên (vd Long Văn +9: 13 trong 15 -> đủ 11 dòng gốc ~5,7%)
    var sr = s.so || [nOn, nOn], kGoc = m.dongGoc.filter(function (k) { return s.on[k]; }).length;
    var soOk = sr[0] >= 1 && sr[0] <= sr[1] && sr[1] <= nOn;
    h += '<div class="tlSo"><div><b>Số dòng ra mỗi lần tạo:</b> từ <input type="number" min="1" max="' + nOn + '" step="1" value="' + sr[0] + '" oninput="' + NS + 'So(0,this.value)" class="' + (s.so ? 'tlCh' : '') + '">' +
      ' đến <input type="number" min="1" max="' + nOn + '" step="1" value="' + sr[1] + '" oninput="' + NS + 'So(1,this.value)" class="' + (s.so ? 'tlCh' : '') + '"> trong <b>' + nOn + '</b> dòng tick' +
      (s.so ? ' <button onclick="' + NS + 'So(-1)">↺ ra đủ mọi dòng tick</button>' : '') + '</div><div class="tlNote">' +
      (!soOk ? '⚠ Phải 1 ≤ từ ≤ đến ≤ ' + nOn + '.' :
        sr[1] >= nOn && sr[0] >= nOn ? 'Mỗi món ra <b>đủ ' + nOn + ' dòng</b> đã tick (không ngẫu nhiên).' :
          'Mỗi món bốc ngẫu nhiên ' + (sr[0] === sr[1] ? sr[0] : sr[0] + '–' + sr[1]) + ' dòng trong ' + nOn + ' dòng tick. ' +
          (kGoc ? 'Xác suất ra <b>đủ ' + kGoc + ' dòng gốc</b>: <b>' + (xsDu(nOn, kGoc, sr[0], sr[1]) * 100).toFixed(1) + '%</b>' : '') +
          ' <i>(giả định engine chọn đều - chưa đo; đo lại bằng DB sau khi người chơi tẩy)</i>') + '</div></div>';
    h += '<div class="tlBar"><button class="tlGo" onclick="' + NS + 'LuuMon()"' + (nOn && nOn <= max && soOk ? '' : ' disabled') + '>💾 Lưu mã ' + id + '</button>' +
      (cfgMon ? '<button class="tlDo" onclick="' + NS + 'BoMon()">↩ Trả mã này về gốc</button>' : '') +
      '<button onclick="' + NS + 'HuyMon()">✖ Hủy thay đổi chưa lưu</button>' +
      (cfgMon ? '<span class="tlNote">Lưu lần cuối: ' + new Date(cfgMon.t * 1000).toLocaleString('vi-VN') + ' · ' + e(cfgMon.ai) + '</span>' : '') + '</div></div>';
    // 📋 08/10 (chủ server): chép dòng sang Chân - nâng ở NPC Tuyết Phi Phi / tẩy Chân ra đúng bộ dòng này; điểm Chân = công thuộc tính +50 (không ra đúng thì +51), còn lại x1,3
    if (m.chanDich && mon(m.chanDich)) {
      var c = mon(m.chanDich), dirty = chuaLuu(id), dongC = m.dong.slice().sort(function (a, b2) { return a - b2; });
      var cungChan = TL.d.mon.filter(function (x) { return x.chanDich === m.chanDich; }).map(function (x) { return x.id; });
      var thieu = dongC.filter(function (k) { return (c.dongCo || []).indexOf(k) < 0; });
      h += '<div class="tlCard"><h4>📋 Chép dòng sang Chân <span class="tlPill">' + m.chanDich + '</span> <span class="tlNote">' + e(c.ten) + '</span></h4>' +
        '<div class="tlNote">Chân ra <b>đúng ' + dongC.length + ' dòng</b> của mã này (nâng ở NPC Tuyết Phi Phi, tẩy Chân bằng Ma Huyết Thạch). Điểm Chân: <b>Băng / Hỏa / Huyền / Độc công +50</b> (engine không ra đúng thì +51), <b>các dòng khác ×1,3</b>. ' +
        'Đè cấu hình Chân hiện tại. Chân này dùng chung cho <b>' + cungChan.join(', ') + '</b>: chép mã nào thì Chân theo mã đó. Có hiệu lực sau restart.</div>' +
        '<div class="tlTbl"><table><thead><tr><th>Dòng</th><th>Thường (đang)</th><th>Chân (đang)</th><th>Chân sau khi chép</th></tr></thead><tbody>' +
        dongC.map(function (k) {
          var ra = seRa(diemChan(m.diem[k], k, c.rate[k]), c.rate[k]);
          return '<tr><td>' + e(TL.d.dongTen[k]) + '</td><td class="n">' + so(m.diem[k]) + '</td><td class="n">' + (c.dong.indexOf(k) >= 0 ? so(c.diem[k]) : '<span class="tlNote">không có</span>') + '</td><td class="n"><b>' + so(ra) + '</b></td></tr>';
        }).join('') +
        '</tbody></table></div><div class="tlBar">' +
        (dirty ? '<span class="tlNote">⚠ Mã này đang sửa chưa lưu: bấm 💾 Lưu (hoặc ✖ Hủy) trước rồi mới chép.</span>'
          : thieu.length ? '<span class="tlNote">⚠ Chân không có số gốc cho: ' + thieu.map(function (k) { return e(TL.d.dongTen[k]); }).join(', ') + '. Bỏ các dòng đó ở mã này rồi chép.</span>'
            : '<button class="' + (TL.xnChep === id ? 'tlDo' : 'tlGo') + '" onclick="' + NS + 'Chep()">' + (TL.xnChep === id ? '⚠ Bấm lần nữa để chép đè Chân ' + m.chanDich : '📋 Chép dòng sang Chân ' + m.chanDich) + '</button>') +
        '</div></div>';
    }
    return h;
  }
  // 📋 08/10: điểm Chân từ điểm Thường (giống panel/trunglau.py diem_chan)
  var CONG_TT = [6, 9, 12, 15];
  function diemChan(x, k, r) {
    if (!(x > 0)) return 0;
    if (CONG_TT.indexOf(k) >= 0) { for (var d = 50; d <= 51; d++) if (r > 0 && seRa(x + d, r) === x + d) return x + d; return x + 50; }
    return Math.max(1, Math.floor(x * 1.3 + 0.5));
  }
  function chuaLuu(id) {
    var s = TL.sua[id], m = mon(id); if (!s || !m) return false;
    var tang = function (a, b2) { return a - b2; };
    var on = Object.keys(s.on).filter(function (k) { return s.on[k]; }).map(Number).sort(tang);
    if (on.join() !== m.dong.slice().sort(tang).join()) return true;
    var cm = ((TL.d.cfg || {}).mon || {})[id];
    if (String(s.so || '') !== String((cm && cm.so) || '')) return true;   // 09/10: so dong ra
    return on.some(function (k) { return (s.diem[k] || 0) !== (m.diem[k] || m.diemGoc[k] || 0); });
  }
  window[NS + 'Chep'] = function () {
    var id = TL.sel;
    if (TL.xnChep !== id) { TL.xnChep = id; ve(); setTimeout(function () { if (TL.xnChep === id) { TL.xnChep = 0; ve(); } }, 6000); return; }
    TL.xnChep = 0; ghi({ op: 'chep', id: id });
  };

  function veGiu() {
    if (TL.giuLoi) return '<div class="tlWarn">👥 Không đọc được danh sách người giữ: ' + e(TL.giuLoi) + '. Nếu game đang restart (MySQL tắt theo game) thì đợi 2-3 phút rồi bấm lại.</div>';
    if (!TL.giu) return '';
    var ds = TL.chiMa ? TL.giu.filter(function (g) { return g.id === TL.sel; }) : TL.giu;
    var h = '<div class="tlCard"><h4>👥 Ai đang giữ ' + CFG.ten + ' (' + ds.length + ')</h4><div class="tlBar"><label class="tlNote"><input type="checkbox" ' + (TL.chiMa ? 'checked ' : '') +
      'onchange="' + NS + 'ChiMa(this.checked)"> chỉ mã đang chọn (' + TL.sel + ')</label><span class="tlNote">Đọc từ DB: game chỉ ghi nhân vật xuống DB <b>~15 phút/lần</b> hoặc khi <b>thoát game</b> → vừa mặc / tháo / giao dịch thì tối đa 15 phút sau mới đúng. Vị trí: túi / đang mặc / kho.</span>' +
      '<button onclick="' + NS + 'GiuAn()">✖ Ẩn</button></div><div class="tlTbl"><table><thead><tr><th>Nhân vật</th><th>Tài khoản</th><th>Mã</th><th>Món</th><th>Ở đâu</th></tr></thead><tbody>';
    ds.forEach(function (g) {
      h += '<tr><td>' + e(g.nv) + ' <span class="tlNote">' + e(g.guid) + '</span></td><td>' + e(g.acc) + '</td><td class="n">' + g.id + '</td><td>' + e(g.ten) + '</td><td>' +
        (g.cho === 'đang mặc' ? '<b>đang mặc</b>' : e(g.cho)) + '</td></tr>';
    });
    if (!ds.length) h += '<tr><td colspan="5" class="tlNote">Không ai giữ.</td></tr>';
    return h + '</tbody></table></div></div>';
  }

  window[NS + 'Chon'] = function (id) { TL.sel = id; ve(); };
  window[NS + 'Them'] = function (on) { TL.them = on; ve(); };
  window[NS + 'Dong'] = function (k, on) { var s = nhap(TL.sel); s.on[k] = on; if (on && !s.diem[k]) { var m = mon(TL.sel); s.diem[k] = m.diem[k] || m.diemGoc[k] || 1; } ve(); };
  window[NS + 'Diem'] = function (k, v) {
    var s = nhap(TL.sel), m = mon(TL.sel), x = Math.max(0, Math.floor(Number(v) || 0)); s.diem[k] = x;
    var ra = seRa(x, m.rate[k]), td = document.getElementById(NS + 'Ra' + k);
    if (td) { td.textContent = raChu(x, m.rate[k]); td.className = 'n' + (ra !== x ? ' tlLech' : ''); }
  };
  window[NS + 'HuSua'] = function (el) {
    var h = el.dataset.h, k = el.dataset.k, c = Number(el.dataset.c) || 1, v = Math.round(Number(el.value) * c);
    if (el.value === '' || !isFinite(v) || v < 0) return;
    TL.hu[h] = TL.hu[h] || {}; TL.hu[h][k] = v; el.classList.add('tlCh');
  };
  window[NS + 'HuyMon'] = function () { delete TL.sua[TL.sel]; ve(); };
  function ghi(body, ok) {
    return api('/api/gm/trunglau', body).then(function (j) { TL.d = j.data || TL.d; TL.hu = JSON.parse(JSON.stringify((TL.d.cfg || {}).hu || {})); toast('✅ ' + (j.msg || 'Đã lưu')); if (ok) ok(); ve(); })
      .catch(function (er) { loi(er); });
  }
  window[NS + 'LuuMon'] = function () {
    var s = nhap(TL.sel), dong = [], diem = {};
    Object.keys(s.on).forEach(function (k) { if (s.on[k]) { dong.push(Number(k)); if (s.diem[k] > 0) diem[k] = s.diem[k]; } });
    if (!dong.length) return toast('Chưa chọn dòng nào');
    var id = TL.sel, body = { op: 'mon', id: id, dong: dong, diem: diem };
    if (s.so && !(s.so[0] === dong.length && s.so[1] === dong.length)) body.so = s.so;   // 09/10: so dong ra moi lan tao
    ghi(body, function () { delete TL.sua[id]; });
  };
  // 09/10: o "so dong ra" (i = 0 tu / 1 den; -1 = bo, ra du moi dong tick)
  window[NS + 'So'] = function (i, v) {
    var s = nhap(TL.sel);
    if (i < 0) { s.so = null; return ve(); }
    var nOn = Object.keys(s.on).filter(function (k) { return s.on[k]; }).length;
    var sr = s.so || [nOn, nOn]; sr[i] = Math.max(0, Math.floor(Number(v) || 0)); s.so = sr;
    clearTimeout(TL.soT); TL.soT = setTimeout(ve, 600);   // ve lai sau khi ngung go (giu o nhap)
  };
  window[NS + 'BoMon'] = function () { var id = TL.sel; ghi({ op: 'xoa', id: id }, function () { delete TL.sua[id]; }); };
  window[NS + 'LuuHu'] = function () {
    var hu = {}; Object.keys(TL.hu).forEach(function (h) { var t = TL.hu[h], o = {}; Object.keys(t).forEach(function (k) { if (t[k] != null) o[k] = t[k]; }); if (Object.keys(o).length) hu[h] = o; });
    ghi({ op: 'hu', hu: hu });
  };
  window[NS + 'Tra'] = function () {
    if (!TL.xnTra) { TL.xnTra = 1; ve(); setTimeout(function () { TL.xnTra = 0; ve(); }, 6000); return; }
    TL.xnTra = 0;
    // 09/10: tra ve goc CHI ma cua muc nay (lenh co san 'xoa' tung ma; Trung Lau them 'hu' rong = bo hieu ung) - khong dung cau hinh muc kia
    var cm = (TL.d.cfg || {}).mon || {}, buoc = IDS.filter(function (i) { return cm[i]; }).map(function (i) { return { op: 'xoa', id: i }; });
    if (CFG.coHu && Object.keys((TL.d.cfg || {}).hu || {}).length) buoc.push({ op: 'hu', hu: {} });
    if (!buoc.length) { toast('Không có gì để trả về gốc'); ve(); return; }
    buoc.reduce(function (pr, b) { return pr.then(function () { return api('/api/gm/trunglau', b); }); }, Promise.resolve())
      .then(function () { TL.sua = {}; toast('✅ Đã trả ' + CFG.ten + ' về gốc (' + buoc.length + ' bước). Có hiệu lực sau restart.'); return nap(); }).catch(function (er) { loi(er); nap(); });
  };
  window[NS + 'Restart'] = function () {
    if (!TL.xnRs) { TL.xnRs = 1; ve(); setTimeout(function () { TL.xnRs = 0; ve(); }, 6000); return; }
    TL.xnRs = 0; ghi({ op: 'restart' });
  };
  window[NS + 'Giu'] = function () {
    api('/api/gm/trunglau', { op: 'giu' }).then(function (j) { TL.giu = (j.giu || []).filter(function (g) { return IDS.indexOf(g.id) >= 0; }); TL.giuLoi = ''; ve(); toast('👥 ' + TL.giu.length + ' món ' + CFG.ten + ' đang có người giữ'); cuon(); })
      .catch(function (er) { TL.giuLoi = (er && er.message) || String(er); TL.giu = null; ve(); cuon(); });
  };
  function cuon() { var b = document.getElementById(NS + 'GiuBox'); if (b && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  window[NS + 'GiuAn'] = function () { TL.giu = null; TL.giuLoi = ''; ve(); };
  window[NS + 'ChiMa'] = function (on) { TL.chiMa = on; var b = document.getElementById(NS + 'GiuBox'); if (b) b.innerHTML = veGiu(); };
  return NHOM_TL;
  }
  // Muc Trung Lau (khung tlBox co san trong panel.js)
  var NHOM_TL = lap('tl', 'tlBox', { ten: 'Trùng Lâu', sel: '10553102', coHu: true, nhom: [] });
  // Muc Long Van: 09/10 chu server tach rieng khoi Trung Lau. Khung tu chen ngay duoi muc Trung Lau (khong sua panel.js)
  lap('lv', 'lvBox', { ten: 'Long Văn', sel: '10157009', coHu: false, nhom: [['Long Văn (tẩy ở NPC Long Văn ra đúng mẫu)', ['10157001', '10157002', '10157003', '10157004', '10157005', '10157006', '10157007', '10157008', '10157009'], null]] });
  (function chen() {   // 09/10: khoi rieng trong khu 🧰 Cong cu (chi cong SUPER), ngay sau khoi Custom Trung Lau
    var tl = document.getElementById('tlBox'); if (!tl || document.getElementById('lvBox')) return;
    var khoi = tl.parentNode;   // div.quaTool cua Custom Trung Lau
    var m = document.createElement('div'); m.className = khoi.className || 'quaTool';
    m.innerHTML = '<div class="qT"><b>🐲 Custom Long Văn (+1 → +9)</b> <button class="btn-grey" onclick="lvLoad()">🔄 Tải</button> <span class="muted">Chỉnh dòng thuộc tính + điểm từng cấp Long Văn. Tẩy ở NPC Long Văn / nâng cấp ra đúng mẫu; điểm áp cả Long Văn đang có. Có hiệu lực sau restart game.</span></div>' +
      '<div id="lvBox" class="epOnly" style="display:none;container-type:inline-size"></div>';
    khoi.parentNode.insertBefore(m, khoi.nextSibling);
  })();
})();
