// 💎 10/10 CUSTOM % TẨY TƯ CHẤT (khu 🧰 Công cụ, chỉ cổng SUPER) - phục vụ ở /tc.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Dữ liệu + ghi đi qua /api/gm/tuchat -> panel GM (repo tlbbnetco4, panel/tuchat.py) -> file Server/txt/NetCo4Cfg/tuchat.txt.
// Script 809261 (event/equip/judge_aptitude.lua x809261_NetCo4_TuChat) đọc file MỖI LẦN người chơi giám định lại tư chất ở Triệu Tiết:
// chọn mốc đích theo tỉ lệ rồi quay lại trong server tới khi % công/thủ CAO NHẤT của món đúng mốc -> lưu là có hiệu lực ngay, KHÔNG restart.
//  - Engine gốc: mỗi chỉ số đều trong [cột 94 EquipBase, 255]; 250 = 20%, 251 = 25, 252 = 30, 253 = 35, 254 = 45, 255 = 60 (ItemAptRate).
//  - Món đang có giữ nguyên tư chất; chỉ lần tẩy kế tiếp mới theo cấu hình.
(function () {
  var TC = { d: null, p: {}, bat: 0, xnTra: 0 };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }
  function f2(x) { return (Math.round(x * 100) / 100).toString(); }
  function pc(x) { return x >= 10 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3); }
  function moiSa(x) { return x > 0 ? '~1 / ' + Math.max(1, Math.round(100 / x)) + ' viên' : '—'; }

  function css() {
    if (document.getElementById('tcCss')) return;
    var s = document.createElement('style'); s.id = 'tcCss';
    s.textContent =
      '#tcBox{display:grid;gap:12px;margin-top:10px}#tcBox .tcNote{font-size:12px;color:#93a0b8}#tcBox .tcWarn{font-size:12.5px;color:#f3cf8a;background:#2a2312;border:1px solid #5a4a22;border-radius:8px;padding:8px 10px}' +
      '#tcBox .tcBad{font-size:12.5px;color:#ffb0b0;background:#2a1414;border:1px solid #6b2f2f;border-radius:8px;padding:8px 10px}' +
      '#tcBox .tcBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#tcBox button{padding:6px 12px;font-size:12.5px;border-radius:6px;background:#2b3245;color:#fff;border:1px solid #3a4560;cursor:pointer}' +
      '#tcBox button.tcGo{background:#2f6b4a;border-color:#3f8a60}#tcBox button.tcDo{background:#6b2f2f;border-color:#8a3f3f}' +
      '#tcBox .tcCard{background:#161c28;border:1px solid #2a3346;border-radius:10px;padding:12px;display:grid;gap:8px;min-width:0;overflow-x:auto}' +
      '#tcBox table{border-collapse:collapse;width:100%;font-size:12.5px}#tcBox th,#tcBox td{padding:5px 6px;border-bottom:1px solid #2a3346;text-align:left;vertical-align:middle}' +
      '#tcBox th{color:#93a0b8;font-weight:600;font-size:11.5px}#tcBox td.n,#tcBox th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}#tcBox tr.du td{color:#93a0b8}' +
      '#tcBox td small{display:block;color:#93a0b8;font-size:11px}#tcBox input[type=number]{width:84px;padding:4px 6px;border-radius:6px;border:1px solid #3a4560;background:#0f141d;color:#e6ebf5}' +
      '#tcBox input.tcCh{border-color:#5fae84;background:#17301f}#tcBox input[type=checkbox]{width:16px;height:16px;vertical-align:middle}#tcBox .tcMoc{font-weight:700;color:#f3cf8a}';
    document.head.appendChild(s);
  }

  function nap() {
    return api('/api/gm/tuchat', { op: 'xem' }).then(function (j) {
      TC.d = j.data; var c = TC.d.cfg || {};
      TC.p = {}; TC.d.moc.forEach(function (m) { TC.p[m] = Number((c.p || {})[m] || 0); });
      TC.bat = c.bat ? 1 : 0;
      ve();
    });
  }
  window.tcLoad = function () { css(); var b = document.getElementById('tcBox'); if (b) { b.style.display = ''; b.innerHTML = '<div class="tcNote">Đang tải…</div>'; } nap().catch(function (er) { loi(er); }); };

  function tong() { var t = 0; TC.d.moc.forEach(function (m) { t += TC.p[m] || 0; }); return Math.round(t * 100) / 100; }
  function ve() {
    var b = document.getElementById('tcBox'); if (!b || !TC.d) return;
    var c = TC.d.cfg || {}, g1 = TC.d.goc['1'], g126 = TC.d.goc['126'];
    var h = '<div class="tcNote">Giám định lại tư chất ở <b>Triệu Tiết</b> (Lạc Dương), mỗi lần tốn 1 Kim Cương Sa hoặc 1 lượt Kim Cương Tỏa. ' +
      '<b>Engine gốc:</b> mỗi lần tẩy quay lại cả 6 chỉ số, mỗi chỉ số đều trong [cột 94 EquipBase, 255]. Lúc chế chỉ ra tối đa 250 = 20%, nên các mốc 25–60% <b>chỉ có qua tẩy</b>. ' +
      '<b>Bật custom:</b> mỗi lần tẩy chọn mốc theo tỉ lệ dưới đây, rồi server tự quay lại (không tốn thêm Sa) tới khi <b>% công / thủ cao nhất của món</b> đúng mốc đó. Tư chất ra là thật nên tooltip đúng. ' +
      'Lưu là có hiệu lực <b>ngay lần tẩy kế tiếp</b>, không cần restart. Món đang có giữ nguyên.</div>';
    h += c.co ? '<div class="tcWarn">' + (c.bat ? 'Đang <b>BẬT</b> custom' : 'Có file nhưng đang <b>TẮT</b> (chạy engine gốc)') +
      (c.ai ? ' · lưu lần cuối ' + new Date(c.t * 1000).toLocaleString('vi-VN') + ' · ' + e(c.ai) : '') + '.</div>'
      : '<div class="tcNote">Chưa chỉnh: tẩy chạy đúng engine gốc.</div>';
    h += '<div class="tcCard"><label><input type="checkbox" ' + (TC.bat ? 'checked ' : '') + 'onchange="tcBat(this.checked)"> <b>Bật custom % tẩy</b> (tắt = engine gốc, giữ nguyên số đã soạn)</label>';
    var t = tong(), du = Math.round((100 - t) * 100) / 100;
    if (t > 100) h += '<div class="tcBad">⚠ Tổng các mốc ' + f2(t) + '% vượt 100%: không lưu được.</div>';
    h += '<table><thead><tr><th>Mốc</th><th class="n">Gốc: vũ khí thường<small>min 1</small></th><th class="n">Gốc: đồ chế 8x/9x<small>min 126</small></th>' +
      '<th>Custom (%)</th><th class="n">Kim Cương Sa / 1 lần ra</th></tr></thead><tbody>';
    TC.d.moc.forEach(function (m) {
      h += '<tr><td><span class="tcMoc">' + m + '%</span><small>tư chất ' + TC.d.byte[m] + '</small></td>' +
        '<td class="n">' + pc(g1[m]) + '%</td><td class="n">' + pc(g126[m]) + '%</td>' +
        '<td><input type="number" min="0" max="100" step="0.01" value="' + f2(TC.p[m] || 0) + '" class="' + ((TC.p[m] || 0) > 0 ? 'tcCh' : '') + '" oninput="tcP(' + m + ',this.value)" onchange="tcVe()"></td>' +
        '<td class="n" id="tcS' + m + '">' + moiSa(TC.p[m] || 0) + '</td></tr>';
    });
    h += '<tr class="du"><td>Dưới 20%<small>phần còn lại</small></td><td class="n">' + pc(g1.duoi) + '%</td><td class="n">' + pc(g126.duoi) + '%</td>' +
      '<td id="tcDu">' + (du < 0 ? '—' : f2(du) + '%') + '</td><td class="n"></td></tr></tbody></table>' +
      '<div class="tcNote">Cột "Gốc" = tỉ lệ % công cao nhất của vũ khí (2 chỉ số ngoại + nội công) rơi đúng mốc ở engine gốc. Giáp tương tự với ngoại / nội thủ. ' +
      'Mốc 20% = đúng tư chất 250; "Dưới 20%" = tư chất ≤ 249 (11–19%, tuỳ món).</div></div>';
    h += '<div class="tcBar"><button class="tcGo" onclick="tcLuu()">💾 Lưu cấu hình tẩy tư chất</button>' +
      '<button onclick="tcGoc()">📋 Điền như gốc (đồ chế, min 126)</button><button onclick="tcLoad()">🔄 Tải lại</button>' +
      '<button class="tcDo" onclick="tcTra()">' + (TC.xnTra ? '⚠ Bấm lần nữa: về mặc định (engine gốc)' : '♻️ Về mặc định (engine gốc)') + '</button></div>';
    h += '<div class="tcWarn">⚠ Mốc 60% gấp 3 lần mức 20% lúc chế. Đặt mốc 60% = 5% nghĩa là cứ ~20 viên Sa ra 1 món 60%: cân theo lượng Kim Cương Sa đang lưu hành, đừng theo cảm giác. Mỗi lần lưu ghi nhật ký ADMIN + sao lưu file cũ.</div>';
    b.innerHTML = h;
  }
  window.tcVe = function () { ve(); };
  window.tcP = function (m, v) {
    TC.p[m] = Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100) / 100));
    var s = document.getElementById('tcS' + m); if (s) s.textContent = moiSa(TC.p[m]);
    var d = document.getElementById('tcDu'), du = Math.round((100 - tong()) * 100) / 100; if (d) d.textContent = du < 0 ? '—' : f2(du) + '%';
  };
  window.tcBat = function (on) { TC.bat = on ? 1 : 0; };
  window.tcGoc = function () {
    var g = TC.d.goc['126']; TC.d.moc.forEach(function (m) { TC.p[m] = Math.round(g[m] * 100) / 100; });
    ve(); toast('📋 Đã điền tỉ lệ gốc của đồ chế (min 126). Sửa rồi bấm 💾 Lưu.');
  };
  window.tcLuu = function () {
    if (tong() > 100) return toast('❌ Tổng các mốc vượt 100%');
    api('/api/gm/tuchat', { op: 'luu', p: TC.p, bat: TC.bat }).then(function (j) { toast('✅ ' + (j.msg || 'Đã lưu')); return nap(); }).catch(function (er) { loi(er); });
  };
  window.tcTra = function () {
    if (!TC.xnTra) { TC.xnTra = 1; ve(); setTimeout(function () { TC.xnTra = 0; ve(); }, 6000); return; }
    TC.xnTra = 0;
    api('/api/gm/tuchat', { op: 'tra' }).then(function (j) { toast('✅ ' + (j.msg || 'Đã về mặc định')); return nap(); }).catch(function (er) { loi(er); });
  };
})();
