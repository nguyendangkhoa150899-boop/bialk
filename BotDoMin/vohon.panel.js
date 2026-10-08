// 🔮 09/10 CUSTOM VÕ HỒN (khu 🧰 Công cụ, chỉ cổng SUPER) - phục vụ ở /vh.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Dữ liệu + ghi đi qua /api/gm/vohon -> panel GM (repo tlbbnetco4, panel/vohon.py) -> file Server/txt/NetCo4Cfg/vohon.txt.
// Script 892101 (odali_wuyazi.lua x892101_NetCo4_Roll3) đọc file MỖI LẦN người chơi bấm Lĩnh ngộ / Tẩy kỹ năng -> lưu là có hiệu lực ngay, KHÔNG restart.
//  - Trọng số từng chiêu trong từng ô (0 = tắt). Ô không chỉnh = chọn đều như GM cũ.
//  - Giữ cấp khi tẩy: GM cũ đưa cả 3 chiêu về cấp 1 (dù giao diện client ghi "giữ cấp cũ").
//  - Võ Hồn đang có giữ nguyên chiêu; chỉ lần lĩnh ngộ / tẩy kế tiếp mới theo cấu hình.
(function () {
  var VH = { d: null, w: null, sua: {}, giucap: 0, xnTra: 0 };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }

  function css() {
    if (document.getElementById('vhCss')) return;
    var s = document.createElement('style'); s.id = 'vhCss';
    s.textContent =
      '#vhBox{display:grid;gap:12px;margin-top:10px}#vhBox .vhNote{font-size:12px;color:#93a0b8}#vhBox .vhWarn{font-size:12.5px;color:#f3cf8a;background:#2a2312;border:1px solid #5a4a22;border-radius:8px;padding:8px 10px}' +
      '#vhBox .vhBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#vhBox button{padding:6px 12px;font-size:12.5px;border-radius:6px;background:#2b3245;color:#fff;border:1px solid #3a4560;cursor:pointer}' +
      '#vhBox button.vhGo{background:#2f6b4a;border-color:#3f8a60}#vhBox button.vhDo{background:#6b2f2f;border-color:#8a3f3f}#vhBox button:disabled{opacity:.5;cursor:default}' +
      '#vhBox .vhGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:12px;align-items:start}' +
      '#vhBox .vhCard{background:#161c28;border:1px solid #2a3346;border-radius:10px;padding:12px;display:grid;gap:8px;min-width:0}#vhBox h4{margin:0;font-size:14.5px}' +
      '#vhBox .vhTag{font-size:11px;border:1px solid #3a4560;border-radius:999px;padding:0 7px;color:#b9c3d6;margin-left:6px}#vhBox .vhTag.on{border-color:#5fae84;color:#9fe0b8}' +
      '#vhBox table{border-collapse:collapse;width:100%;font-size:12.5px}#vhBox th,#vhBox td{padding:4px 6px;border-bottom:1px solid #2a3346;text-align:left;vertical-align:middle}' +
      '#vhBox th{color:#93a0b8;font-weight:600;font-size:11.5px}#vhBox td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}#vhBox tr.off td{color:#6c7891}' +
      '#vhBox td small{display:block;color:#93a0b8;font-size:11.5px}#vhBox .vhChu{font-family:monospace;color:#c9a45c}' +
      '#vhBox input[type=number]{width:70px;padding:4px 6px;border-radius:6px;border:1px solid #3a4560;background:#0f141d;color:#e6ebf5}#vhBox input.vhCh{border-color:#5fae84;background:#17301f}' +
      '#vhBox input[type=checkbox]{width:16px;height:16px;vertical-align:middle}#vhBox .vhBarPct{height:4px;background:#2f6b4a;border-radius:2px;margin-top:2px}';
    document.head.appendChild(s);
  }

  function nap() {
    return api('/api/gm/vohon', { op: 'xem' }).then(function (j) {
      VH.d = j.data; var c = VH.d.cfg || {};
      VH.sua = {};   // nhom -> {chu: trong so} dang soan; chi nhom co trong sua (hoac cfg) moi gui len
      Object.keys(c.w || {}).forEach(function (n) { VH.sua[n] = Object.assign({}, c.w[n]); });
      VH.giucap = c.giucap ? 1 : 0;
      ve();
    });
  }
  window.vhLoad = function () { css(); var b = document.getElementById('vhBox'); if (b) { b.style.display = ''; b.innerHTML = '<div class="vhNote">Đang tải…</div>'; } nap().catch(function (er) { loi(er); }); };

  function trongSo(n, chu) { var t = VH.sua[n]; return t ? (t[chu] || 0) : 1; }   // nhom chua chinh = deu (1)
  function ve() {
    var b = document.getElementById('vhBox'); if (!b || !VH.d) return;
    var c = VH.d.cfg || {};
    var h = '<div class="vhNote">Tỉ lệ chiêu khi <b>lĩnh ngộ</b> (Võ Hồn hợp thành cấp 8) và khi <b>tẩy kỹ năng</b> (10 Ức Hồn Thạch + 5 vàng). Lưu là có hiệu lực <b>ngay lần bấm kế tiếp</b>, không cần restart. ' +
      'Võ Hồn đang có giữ nguyên chiêu. Chiêu nằm cố định theo ô: ô 3 của Ngự Dao Bàn và Lưu Ly Diễm là 2 bộ khác nhau. Ghi chú chiêu: cấp 1 → cấp 6, theo tooltip client.</div>';
    h += c.co ? '<div class="vhWarn">Đang áp cấu hình riêng' + (c.ai ? ' · lưu lần cuối ' + new Date(c.t * 1000).toLocaleString('vi-VN') + ' · ' + e(c.ai) : '') + '.</div>'
      : '<div class="vhNote">Chưa chỉnh: mọi ô chọn đều như GM cũ, tẩy về cấp 1.</div>';
    h += '<div class="vhCard"><label><input type="checkbox" ' + (VH.giucap ? 'checked ' : '') + 'onchange="vhGiu(this.checked)"> <b>Tẩy giữ cấp kỹ năng từng ô</b></label>' +
      '<div class="vhNote">Tắt (GM cũ): tẩy xong <b>cả 3 chiêu về cấp 1</b>, mất Hồn Băng Châu đã nâng, dù giao diện tẩy trong game ghi "kỹ năng mới vẫn giữ cấp cũ". Bật: chiêu mới ở ô nào giữ đúng cấp của ô đó.</div></div>';
    h += '<div class="vhBar"><button class="vhGo" onclick="vhLuu()">💾 Lưu cấu hình Võ Hồn</button><button onclick="vhHoa()">🔥 Ô 3 chỉ ra chiêu Hỏa (soạn, chưa lưu)</button>' +
      '<button onclick="vhLoad()">🔄 Tải lại</button><button class="vhDo" onclick="vhTra()">' + (VH.xnTra ? '⚠ Bấm lần nữa: về mặc định GM cũ' : '♻️ Về mặc định GM cũ') + '</button></div>';
    h += '<div class="vhGrid">';
    [1, 2, 4, 3].forEach(function (n) {
      var g = VH.d.nhom[n], chinh = !!VH.sua[n], tong = 0;
      g.chieu.forEach(function (x) { tong += trongSo(n, x.chu); });
      h += '<div class="vhCard"><h4>' + e(g.ten) + '<span class="vhTag' + (chinh ? ' on' : '') + '">' + (chinh ? 'đã chỉnh' : 'chọn đều (GM cũ)') + '</span></h4>' +
        '<div class="vhBar"><button onclick="vhDeu(' + n + ')">Chia đều</button>' + (chinh ? '<button onclick="vhBo(' + n + ')">↺ Ô này về GM cũ</button>' : '') +
        (tong <= 0 ? '<span class="vhNote" style="color:#ff8a8a">⚠ Tổng trọng số 0: phải bật ít nhất 1 chiêu</span>' : '') + '</div>' +
        '<table><thead><tr><th>Chiêu</th><th>Trọng số</th><th class="n">Tỉ lệ</th></tr></thead><tbody>';
      g.chieu.forEach(function (x) {
        var w = trongSo(n, x.chu), p = tong > 0 ? w / tong * 100 : 0;
        h += '<tr class="' + (w > 0 ? '' : 'off') + '"><td><b>' + e(x.ten) + '</b> <span class="vhChu" title="chữ trong chuỗi &amp;WH trên món / mã kỹ năng cấp 1">' + x.chu + ' · ' + x.id + '</span><small>' + e(x.ghi) + '</small></td>' +
          '<td><input type="number" min="0" step="1" value="' + w + '" class="' + (chinh ? 'vhCh' : '') + '" oninput="vhW(' + n + ',\'' + x.chu + '\',this.value)"></td>' +
          '<td class="n" id="vhP' + n + x.chu + '">' + p.toFixed(1) + '%<div class="vhBarPct" style="width:' + Math.round(p) + '%"></div></td></tr>';
      });
      h += '</tbody></table></div>';
    });
    b.innerHTML = h + '</div>';
  }
  function dongPct(n) {   // cap nhat % ca nhom khong ve lai (giu o dang go)
    var g = VH.d.nhom[n], tong = 0;
    g.chieu.forEach(function (x) { tong += trongSo(n, x.chu); });
    g.chieu.forEach(function (x) {
      var td = document.getElementById('vhP' + n + x.chu); if (!td) return;
      var p = tong > 0 ? trongSo(n, x.chu) / tong * 100 : 0;
      td.innerHTML = p.toFixed(1) + '%<div class="vhBarPct" style="width:' + Math.round(p) + '%"></div>';
      td.parentNode.className = trongSo(n, x.chu) > 0 ? '' : 'off';
    });
  }
  function batNhom(n) {
    if (!VH.sua[n]) { VH.sua[n] = {}; VH.d.nhom[n].chieu.forEach(function (x) { VH.sua[n][x.chu] = 1; }); return true; }
    return false;
  }
  window.vhW = function (n, chu, v) {
    var moi = batNhom(n); VH.sua[n][chu] = Math.max(0, Math.min(100000, Math.floor(Number(v) || 0)));
    if (moi) ve(); else dongPct(n);
  };
  window.vhDeu = function (n) { VH.sua[n] = {}; VH.d.nhom[n].chieu.forEach(function (x) { VH.sua[n][x.chu] = 1; }); ve(); };
  window.vhBo = function (n) { delete VH.sua[n]; ve(); };
  window.vhGiu = function (on) { VH.giucap = on ? 1 : 0; };
  window.vhHoa = function () {   // 🔥 chủ server 09/10: muốn tẩy ra chiêu Hỏa -> ô 3 chỉ Liệt Diễm (Lưu Ly Diễm) / Thiên Hỏa (Ngự Dao Bàn)
    [[3, 'A'], [4, 'R']].forEach(function (p) { VH.sua[p[0]] = {}; VH.d.nhom[p[0]].chieu.forEach(function (x) { VH.sua[p[0]][x.chu] = x.chu === p[1] ? 1 : 0; }); });
    ve(); toast('🔥 Đã soạn: ô 3 chỉ ra chiêu Hỏa. Bấm 💾 Lưu để áp.');
  };
  window.vhLuu = function () {
    for (var n in VH.sua) {
      var t = 0; for (var c in VH.sua[n]) t += VH.sua[n][c];
      if (t <= 0) return toast('❌ ' + VH.d.nhom[n].ten + ': tổng trọng số 0');
    }
    api('/api/gm/vohon', { op: 'luu', w: VH.sua, giucap: VH.giucap }).then(function (j) { toast('✅ ' + (j.msg || 'Đã lưu')); return nap(); }).catch(function (er) { loi(er); });
  };
  window.vhTra = function () {
    if (!VH.xnTra) { VH.xnTra = 1; ve(); setTimeout(function () { VH.xnTra = 0; ve(); }, 6000); return; }
    VH.xnTra = 0;
    api('/api/gm/vohon', { op: 'tra' }).then(function (j) { toast('✅ ' + (j.msg || 'Đã về mặc định')); return nap(); }).catch(function (er) { loi(er); });
  };
})();
