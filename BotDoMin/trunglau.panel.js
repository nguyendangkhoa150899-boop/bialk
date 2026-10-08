// 🐉 08/10 CUSTOM TRÙNG LÂU (tab 🛠️ GM, chỉ cổng SUPER) - phục vụ ở /tl.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Dữ liệu + ghi đi qua /api/gm/trunglau -> panel GM (repo tlbbnetco4, panel/trunglau.py). Chỉ Trùng Lâu dòng mới 10553100-10553114.
//  - DÒNG: lưu trên món lúc tạo -> chỉ món tạo mới / Chân Trùng Lâu đem tẩy mới ăn dòng mới.
//  - ĐIỂM: server tính lại mỗi lần vào game = ceil(V × hệ số cấp / 100) -> áp cho CẢ món đang có (dòng món đó có), sau restart.
//  - HIỆU ỨNG (tỉ lệ / thời gian / miễn / phản): chung toàn server cho mọi ai cầm mã đó, sau restart.
(function () {
  var TL = { them: false, d: null, sel: '10553102', hu: {}, sua: {}, giu: null, chiMa: false, xnRs: 0, xnTra: 0 };
  var NHOM = [['Liên (dây chuyền)', ['10553100', '10553112'], '10553103'], ['Giới (nhẫn)', ['10553101', '10553113'], '10553104'],
    ['Ngọc (hộ phù)', ['10553102', '10553114'], '10553105'], ['Đai (thắt lưng)', ['10553106'], '10553107'],
    ['Vai (hộ kiên)', ['10553108'], '10553109'], ['Giáp (áo)', ['10553110'], '10553111'],
    ['Bản cũ giao dịch được (nâng → Chân dòng mới)', ['10422016', '10423024'], null],
    ['Long Văn (tẩy ở NPC Long Văn ra đúng mẫu)', ['10157001', '10157002', '10157003', '10157004', '10157005', '10157006', '10157007', '10157008', '10157009'], null]];
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
    s.textContent = '#tlBox{display:grid;gap:12px;margin-top:8px;color:#e6ebf5}' +
      '#tlBox .tlBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '#tlBox button{padding:6px 12px;border-radius:7px;border:1px solid #3a4560;background:#243049;color:#e6ebf5;cursor:pointer;font-size:13px}' +
      '#tlBox button.tlGo{background:#1f8f4e;border-color:#1f8f4e;color:#fff}#tlBox button.tlDo{background:#9c2730;border-color:#9c2730;color:#fff}' +
      '#tlBox button:disabled{opacity:.5;cursor:default}' +
      '#tlBox .tlNote{font-size:12px;color:#93a0b8;line-height:1.5}#tlBox .tlWarn{background:#3b2c14;border:1px solid #7a5a1c;color:#f3cf8a;border-radius:8px;padding:8px 10px;font-size:12.5px}' +
      '#tlBox .tlWrap{display:grid;grid-template-columns:240px minmax(0,1fr);gap:12px}@container (max-width:760px){#tlBox .tlWrap{grid-template-columns:1fr}}' +
      '#tlBox .tlList{display:grid;gap:8px;align-content:start}#tlBox .tlGrp{background:#161c28;border:1px solid #2a3346;border-radius:8px;padding:6px}' +
      '#tlBox .tlGrp b{display:block;font-size:12px;color:#c9a45c;margin:0 0 4px 2px}' +
      '#tlBox .tlIt{display:flex;justify-content:space-between;gap:6px;width:100%;text-align:left;margin:2px 0;padding:5px 8px;font-size:12.5px;background:transparent;border-color:transparent}' +
      '#tlBox .tlIt.on{background:#243049;border-color:#4a5a80}#tlBox .tlIt small{color:#93a0b8}#tlBox .tlIt .tlDot{color:#5fae84;font-weight:700}' +
      '#tlBox .tlPane{display:grid;gap:12px;min-width:0}#tlBox .tlCard{background:#161c28;border:1px solid #2a3346;border-radius:10px;padding:12px;display:grid;gap:10px;min-width:0}' +
      '#tlBox h4{margin:0;font-size:15px}#tlBox .tlKv{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:#b9c3d6}' +
      '#tlBox .tlHu{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}#tlBox .tlHu label{display:grid;gap:3px;font-size:12px;color:#93a0b8}' +
      '#tlBox input[type=number]{width:100%;padding:5px 7px;border-radius:6px;border:1px solid #3a4560;background:#0f141d;color:#e6ebf5;font-variant-numeric:tabular-nums}' +
      '#tlBox input.tlCh{border-color:#5fae84;background:#17301f}#tlBox .tlTbl{overflow-x:auto}#tlBox table{border-collapse:collapse;width:100%;min-width:560px;font-size:12.5px}' +
      '#tlBox th,#tlBox td{padding:5px 8px;border-bottom:1px solid #2a3346;text-align:left;vertical-align:middle}#tlBox th{color:#93a0b8;font-weight:600;font-size:11.5px}' +
      '#tlBox td.n{font-variant-numeric:tabular-nums}#tlBox tr.off td{color:#6c7891}#tlBox .tlGoc{font-size:11px;color:#c9a45c}#tlBox .tlLech{color:#f3cf8a}' +
      '#tlBox .tlCnt{font-weight:700}#tlBox .tlCnt.bad{color:#ff8a8a}#tlBox input[type=checkbox]{width:16px;height:16px}' +
      '#tlBox .tlPill{display:inline-block;font-size:11px;border:1px solid #3a4560;border-radius:999px;padding:0 6px;color:#b9c3d6}';
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
  window.tlLoad = function () { css(); var b = document.getElementById('tlBox'); if (b) { b.style.display = ''; b.innerHTML = '<div class="tlNote">Đang tải…</div>'; } nap().catch(function (er) { loi(er); }); };

  // trạng thái sửa (nháp) của mã đang chọn: {on:{k:true}, diem:{k:x}}
  function nhap(id) {
    if (!TL.sua[id]) {
      var m = mon(id), on = {}, diem = {};
      m.dong.forEach(function (k) { on[k] = true; });
      for (var k = 0; k < 58; k++) diem[k] = m.diem[k] || m.diemGoc[k] || 0;
      TL.sua[id] = { on: on, diem: diem };
    }
    return TL.sua[id];
  }

  function ve() {
    var b = document.getElementById('tlBox'); if (!b || !TL.d) return;
    var cfg = TL.d.cfg || {}, nMa = Object.keys(cfg.mon || {}).length, nHu = Object.keys(cfg.hu || {}).length;
    var h = '<div class="tlBar"><button onclick="tlLoad()">🔄 Tải lại</button><button onclick="tlGiu()">👥 Ai đang giữ Trùng Lâu</button>' +
      '<button class="tlDo" onclick="tlTra()">' + (TL.xnTra ? '⚠ Bấm lần nữa: trả TẤT CẢ về gốc' : '♻️ Trả tất cả về gốc') + '</button>' +
      '<button onclick="tlRestart()">' + (TL.xnRs ? '⚠ Bấm lần nữa để restart (' + TL.online + ' người online)' : '🔁 Restart game (' + TL.online + ' online)') + '</button></div>';
    h += (nMa || nHu) ? '<div class="tlWarn">Đang áp cấu hình riêng cho <b>' + nMa + '</b> mã và <b>' + nHu + '</b> hiệu ứng. Mọi thay đổi chỉ có hiệu lực sau khi <b>restart game</b>.' +
      (cfg.huAi ? ' Lần chỉnh hiệu ứng cuối: ' + e(cfg.huAi) + '.' : '') + '</div>' : '<div class="tlNote">Chưa chỉnh gì: mọi Trùng Lâu đang đúng bản gốc.</div>';
    h += '<div id="tlGiuBox">' + veGiu() + '</div>';
    h += '<div class="tlWrap"><div class="tlList">';
    NHOM.forEach(function (g) {
      h += '<div class="tlGrp"><b>' + e(g[0]) + '</b>';
      g[1].concat(g[2] ? [g[2]] : []).forEach(function (id) {
        var m = mon(id); if (!m) return;
        h += '<button class="tlIt' + (TL.sel === id ? ' on' : '') + '" onclick="tlChon(\'' + id + '\')"><span>' + (m.chan ? '✦ Chân' : (/^Long V/.test(m.ten) ? m.ten.replace(/^Long Văn /, '') : 'Thường')) + ' <small>' + id + '</small></span><span><small>' + e(m.gd) + '</small>' +
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
      '<span>Số dòng: <b>' + m.soDong[0] + '</b>' + (m.soDong[0] !== m.soDongGoc[0] ? ' (gốc ' + m.soDongGoc[0] + ')' : '') + '</span>' +
      '<span>Dòng bật: <b>' + m.dong.length + '</b> (gốc ' + m.dongGoc.length + ')</span></div>' +
      (m.soDong[0] < m.dong.length ? '<div class="tlNote">Hiện tại mỗi món <b>bốc ngẫu nhiên ' + m.soDong[0] + ' trong ' + m.dong.length + '</b> dòng bật. Lưu ở đây thì món ra <b>đúng các dòng đã tick</b> (bỏ tick bớt nếu muốn ít dòng hơn).</div>' : '') +
      '</div>';
    // hiệu ứng
    if (m.hu) {
      var hu = m.hu, hg = m.huGoc || hu, nh = TL.hu[hu.id] || {}, ns = hu.sub ? (TL.hu[hu.sub] || {}) : {};
      h += '<div class="tlCard"><h4>Hiệu ứng thần khí: ' + e(hu.ten) + ' <span class="tlNote">' + e(hu.tenCN) + ' · mã ' + hu.id + (hu.sub ? ' → ' + hu.sub : '') + '</span></h4>' +
        '<div class="tlNote">Chung toàn server cho: <b>' + cung.join(', ') + '</b>. Đổi ở đây là đổi cho tất cả các mã đó.</div><div class="tlHu">';
      var o = function (lbl, hid, k, cur, goc, donvi, chia) {
        var val = (TL.hu[hid] || {})[k] != null ? TL.hu[hid][k] / (chia || 1) : cur / (chia || 1);
        return '<label>' + lbl + '<input type="number" min="0" step="1" value="' + val + '" data-h="' + hid + '" data-k="' + k + '" data-c="' + (chia || 1) + '" oninput="tlHuSua(this)" class="' + ((TL.hu[hid] || {})[k] != null ? 'tlCh' : '') + '">' +
          '<span class="tlGoc">đang ' + so(cur / (chia || 1)) + donvi + ' · gốc ' + so(goc / (chia || 1)) + donvi + '</span></label>';
      };
      if (hu.tham.rate != null) h += o('Tỉ lệ dính (% mỗi đòn trúng)', hu.id, 'rate', hu.tham.rate, hg.tham.rate, '%');
      if (hu.dur != null) h += o('Thời gian hiệu ứng (giây)', hu.sub, 'dur', hu.dur, hg.dur, ' giây', 1000);
      if (hu.tham.mien != null) h += o('Miễn (%)', hu.id, 'mien', hu.tham.mien, hg.tham.mien, '%');
      if (hu.tham.phan != null) h += o('Phản đòn (%)', hu.id, 'phan', hu.tham.phan, hg.tham.phan, '%');
      if (hu.tham.tran != null) h += o('Trần sát thương phản', hu.id, 'tran', hu.tham.tran, hg.tham.tran, '');
      h += '</div><div class="tlBar"><button class="tlGo" onclick="tlLuuHu()">💾 Lưu hiệu ứng (toàn server)</button><span class="tlNote">Lưu mọi ô hiệu ứng đã đổi ở mọi mã, có hiệu lực sau restart.</span></div></div>';
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
      '<label class="tlNote"><input type="checkbox" ' + (TL.them ? 'checked ' : '') + 'onchange="tlThem(this.checked)"> Hiện thêm dòng game có số nhưng món này không tự ra (' + ((m.dongCo || []).length - m.dongGoc.length) + ' dòng)</label>' +
      '<div class="tlTbl"><table><thead><tr><th></th><th>Dòng</th><th>Gốc</th><th>Điểm muốn</th><th>Sẽ ra</th></tr></thead><tbody>';
    thu.forEach(function (k) {
      var r = m.rate[k], on = !!s.on[k], x = s.diem[k], ra = seRa(x, r), lech = on && ra !== x;
      var goc = so(m.diemGoc[k]) + (m.dongGoc.indexOf(k) >= 0 ? '' : ' <span class="tlPill" title="món gốc không tự ra dòng này; game có sẵn số trong đoạn giá trị">thêm</span>');
      h += '<tr class="' + (on ? '' : 'off') + '"><td><input type="checkbox" ' + (on ? 'checked ' : '') + (r > 0 ? '' : 'disabled title="dòng này không có hệ số ở cấp ' + m.cap + '" ') + 'onchange="tlDong(' + k + ',this.checked)"></td>' +
        '<td>' + e(TL.d.dongTen[k]) + '</td><td class="n">' + goc + '</td>' +
        '<td><input type="number" min="1" step="1" value="' + (x || '') + '" ' + (on ? '' : 'disabled ') + 'oninput="tlDiem(' + k + ',this.value)" class="' + (on && x !== m.diem[k] ? 'tlCh' : '') + '"></td>' +
        '<td class="n' + (lech ? ' tlLech' : '') + '" id="tlRa' + k + '">' + (on ? raChu(x, r) : '') + '</td></tr>';
    });
    h += '</tbody></table></div><div class="tlBar"><button class="tlGo" onclick="tlLuuMon()"' + (nOn && nOn <= max ? '' : ' disabled') + '>💾 Lưu mã ' + id + '</button>' +
      (cfgMon ? '<button class="tlDo" onclick="tlBoMon()">↩ Trả mã này về gốc</button>' : '') +
      '<button onclick="tlHuyMon()">✖ Hủy thay đổi chưa lưu</button>' +
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
            : '<button class="' + (TL.xnChep === id ? 'tlDo' : 'tlGo') + '" onclick="tlChep()">' + (TL.xnChep === id ? '⚠ Bấm lần nữa để chép đè Chân ' + m.chanDich : '📋 Chép dòng sang Chân ' + m.chanDich) + '</button>') +
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
    return on.some(function (k) { return (s.diem[k] || 0) !== (m.diem[k] || m.diemGoc[k] || 0); });
  }
  window.tlChep = function () {
    var id = TL.sel;
    if (TL.xnChep !== id) { TL.xnChep = id; ve(); setTimeout(function () { if (TL.xnChep === id) { TL.xnChep = 0; ve(); } }, 6000); return; }
    TL.xnChep = 0; ghi({ op: 'chep', id: id });
  };

  function veGiu() {
    if (TL.giuLoi) return '<div class="tlWarn">👥 Không đọc được danh sách người giữ: ' + e(TL.giuLoi) + '. Nếu game đang restart (MySQL tắt theo game) thì đợi 2-3 phút rồi bấm lại.</div>';
    if (!TL.giu) return '';
    var ds = TL.chiMa ? TL.giu.filter(function (g) { return g.id === TL.sel; }) : TL.giu;
    var h = '<div class="tlCard"><h4>👥 Ai đang giữ Trùng Lâu (' + ds.length + ')</h4><div class="tlBar"><label class="tlNote"><input type="checkbox" ' + (TL.chiMa ? 'checked ' : '') +
      'onchange="tlChiMa(this.checked)"> chỉ mã đang chọn (' + TL.sel + ')</label><span class="tlNote">Đọc từ DB: game chỉ ghi nhân vật xuống DB <b>~15 phút/lần</b> hoặc khi <b>thoát game</b> → vừa mặc / tháo / giao dịch thì tối đa 15 phút sau mới đúng. Vị trí: túi / đang mặc / kho.</span>' +
      '<button onclick="tlGiuAn()">✖ Ẩn</button></div><div class="tlTbl"><table><thead><tr><th>Nhân vật</th><th>Tài khoản</th><th>Mã</th><th>Món</th><th>Ở đâu</th></tr></thead><tbody>';
    ds.forEach(function (g) {
      h += '<tr><td>' + e(g.nv) + ' <span class="tlNote">' + e(g.guid) + '</span></td><td>' + e(g.acc) + '</td><td class="n">' + g.id + '</td><td>' + e(g.ten) + '</td><td>' +
        (g.cho === 'đang mặc' ? '<b>đang mặc</b>' : e(g.cho)) + '</td></tr>';
    });
    if (!ds.length) h += '<tr><td colspan="5" class="tlNote">Không ai giữ.</td></tr>';
    return h + '</tbody></table></div></div>';
  }

  window.tlChon = function (id) { TL.sel = id; ve(); };
  window.tlThem = function (on) { TL.them = on; ve(); };
  window.tlDong = function (k, on) { var s = nhap(TL.sel); s.on[k] = on; if (on && !s.diem[k]) { var m = mon(TL.sel); s.diem[k] = m.diem[k] || m.diemGoc[k] || 1; } ve(); };
  window.tlDiem = function (k, v) {
    var s = nhap(TL.sel), m = mon(TL.sel), x = Math.max(0, Math.floor(Number(v) || 0)); s.diem[k] = x;
    var ra = seRa(x, m.rate[k]), td = document.getElementById('tlRa' + k);
    if (td) { td.textContent = raChu(x, m.rate[k]); td.className = 'n' + (ra !== x ? ' tlLech' : ''); }
  };
  window.tlHuSua = function (el) {
    var h = el.dataset.h, k = el.dataset.k, c = Number(el.dataset.c) || 1, v = Math.round(Number(el.value) * c);
    if (el.value === '' || !isFinite(v) || v < 0) return;
    TL.hu[h] = TL.hu[h] || {}; TL.hu[h][k] = v; el.classList.add('tlCh');
  };
  window.tlHuyMon = function () { delete TL.sua[TL.sel]; ve(); };
  function ghi(body, ok) {
    return api('/api/gm/trunglau', body).then(function (j) { TL.d = j.data || TL.d; TL.hu = JSON.parse(JSON.stringify((TL.d.cfg || {}).hu || {})); toast('✅ ' + (j.msg || 'Đã lưu')); if (ok) ok(); ve(); })
      .catch(function (er) { loi(er); });
  }
  window.tlLuuMon = function () {
    var s = nhap(TL.sel), dong = [], diem = {};
    Object.keys(s.on).forEach(function (k) { if (s.on[k]) { dong.push(Number(k)); if (s.diem[k] > 0) diem[k] = s.diem[k]; } });
    if (!dong.length) return toast('Chưa chọn dòng nào');
    var id = TL.sel; ghi({ op: 'mon', id: id, dong: dong, diem: diem }, function () { delete TL.sua[id]; });
  };
  window.tlBoMon = function () { var id = TL.sel; ghi({ op: 'xoa', id: id }, function () { delete TL.sua[id]; }); };
  window.tlLuuHu = function () {
    var hu = {}; Object.keys(TL.hu).forEach(function (h) { var t = TL.hu[h], o = {}; Object.keys(t).forEach(function (k) { if (t[k] != null) o[k] = t[k]; }); if (Object.keys(o).length) hu[h] = o; });
    ghi({ op: 'hu', hu: hu });
  };
  window.tlTra = function () {
    if (!TL.xnTra) { TL.xnTra = 1; ve(); setTimeout(function () { TL.xnTra = 0; ve(); }, 6000); return; }
    TL.xnTra = 0; ghi({ op: 'tra' }, function () { TL.sua = {}; });
  };
  window.tlRestart = function () {
    if (!TL.xnRs) { TL.xnRs = 1; ve(); setTimeout(function () { TL.xnRs = 0; ve(); }, 6000); return; }
    TL.xnRs = 0; ghi({ op: 'restart' });
  };
  window.tlGiu = function () {
    api('/api/gm/trunglau', { op: 'giu' }).then(function (j) { TL.giu = j.giu || []; TL.giuLoi = ''; ve(); toast('👥 ' + TL.giu.length + ' món Trùng Lâu đang có người giữ'); cuon(); })
      .catch(function (er) { TL.giuLoi = (er && er.message) || String(er); TL.giu = null; ve(); cuon(); });
  };
  function cuon() { var b = document.getElementById('tlGiuBox'); if (b && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  window.tlGiuAn = function () { TL.giu = null; TL.giuLoi = ''; ve(); };
  window.tlChiMa = function (on) { TL.chiMa = on; var b = document.getElementById('tlGiuBox'); if (b) b.innerHTML = veGiu(); };
})();
