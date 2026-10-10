// ⚒️ 10/10 TINH THÔNG - ADMIN CHỌN 3 DÒNG (khu 🧰 Công cụ, chỉ cổng SUPER) - phục vụ ở /tt.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Dữ liệu + ghi đi qua /api/gm/tinhthong -> panel GM (repo tlbbnetco4, panel/tinhthong.py) -> file Server/txt/NetCo4Cfg/tinhthong.txt.
// Script 890087 (MyLua/jingtong/jingtongClient.lua x890087_chuilian) đọc file MỖI LẦN người chơi tôi luyện (10 Ly Hỏa + 100 vàng):
// mỗi nhóm ra CHẮC CHẮN 3 dòng admin chọn. Dòng đang khóa giữ nguyên, dòng trùng mã giữ cấp, món đã đủ 3 dòng thì không trừ Ly Hỏa.
// Nhóm để "ngẫu nhiên gốc" -> tôi luyện như cũ. Món đang có giữ nguyên tới lần tôi luyện kế tiếp.
(function () {
  var TT = { d: null, c: { cong: null, thu: null }, xnTra: 0 };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }

  function css() {
    if (document.getElementById('ttCss')) return;
    var s = document.createElement('style'); s.id = 'ttCss';
    s.textContent =
      '#ttBox{display:grid;gap:12px;margin-top:10px}#ttBox .ttNote{font-size:12px;color:#93a0b8}#ttBox .ttWarn{font-size:12.5px;color:#f3cf8a;background:#2a2312;border:1px solid #5a4a22;border-radius:8px;padding:8px 10px}' +
      '#ttBox .ttBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#ttBox button{padding:6px 12px;font-size:12.5px;border-radius:6px;background:#2b3245;color:#fff;border:1px solid #3a4560;cursor:pointer}' +
      '#ttBox button.ttGo{background:#2f6b4a;border-color:#3f8a60}#ttBox button.ttDo{background:#6b2f2f;border-color:#8a3f3f}' +
      '#ttBox .ttGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}' +
      '#ttBox .ttCard{background:#161c28;border:1px solid #2a3346;border-radius:10px;padding:12px;display:grid;gap:8px;min-width:0}' +
      '#ttBox .ttCard h4{margin:0;font-size:14px}#ttBox .ttCard small{color:#93a0b8;font-size:11.5px}' +
      '#ttBox .ttRow{display:flex;align-items:center;gap:8px;font-size:12.5px}#ttBox .ttRow span{width:52px;color:#93a0b8}' +
      '#ttBox select{flex:1;min-width:0;padding:5px 6px;border-radius:6px;border:1px solid #3a4560;background:#0f141d;color:#e6ebf5}' +
      '#ttBox select:disabled{opacity:.45}#ttBox input[type=checkbox]{width:16px;height:16px;vertical-align:middle}#ttBox .ttCur{font-weight:700;color:#f3cf8a}';
    document.head.appendChild(s);
  }

  function nap() {
    return api('/api/gm/tinhthong', { op: 'xem' }).then(function (j) {
      TT.d = j.data; var c = TT.d.cfg || {};
      TT.c = { cong: c.cong ? c.cong.slice() : null, thu: c.thu ? c.thu.slice() : null };
      ve();
    });
  }
  window.ttLoad = function () { css(); var b = document.getElementById('ttBox'); if (b) { b.style.display = ''; b.innerHTML = '<div class="ttNote">Đang tải…</div>'; } nap().catch(function (er) { loi(er); }); };

  function tenDs(ds) { return ds ? ds.map(function (x) { return TT.d.ten[x] || x; }).join(' / ') : 'ngẫu nhiên gốc'; }
  function the(k) {
    var n = TT.d.nhom[k], ds = TT.c[k], bat = !!ds, cur = (TT.d.cfg || {})[k];
    var h = '<div class="ttCard"><h4>' + e(n.ten) + '</h4><small>' + e(n.o) + '</small>' +
      '<div class="ttNote">Đang chạy: <span class="ttCur">' + e(tenDs(cur)) + '</span></div>' +
      '<label class="ttRow"><input type="checkbox" ' + (bat ? 'checked ' : '') + 'onchange="ttBat(\'' + k + '\',this.checked)"> <b>Cố định 3 dòng</b> (bỏ tick = ngẫu nhiên gốc)</label>';
    for (var i = 0; i < 3; i++) {
      var v = ds ? ds[i] : MAC[k][i];
      h += '<div class="ttRow"><span>Dòng ' + (i + 1) + '</span><select ' + (bat ? '' : 'disabled ') + 'onchange="ttChon(\'' + k + '\',' + i + ',this.value)">' +
        n.ma.map(function (m) { return '<option value="' + m + '"' + (m === v ? ' selected' : '') + '>' + e(TT.d.ten[m] || m) + ' (' + m + ')</option>'; }).join('') + '</select></div>';
    }
    return h + '</div>';
  }
  function ve() {
    var b = document.getElementById('ttBox'); if (!b || !TT.d) return;
    var c = TT.d.cfg || {};
    var h = '<div class="ttNote">Tôi luyện Tinh Thông tốn <b>' + TT.d.toiluyen.sl + ' ' + e(TT.d.toiluyen.ten) + '</b> (' + TT.d.toiluyen.id + ') + 100 vàng. ' +
      'Chọn 3 dòng cho mỗi nhóm: mọi lần tôi luyện món trong nhóm sẽ ra <b>chắc chắn 3 dòng đó</b> (được chọn trùng, vd 3 dòng Thể lực). ' +
      'Dòng người chơi đang <b>khóa</b> giữ nguyên; dòng đã đúng mã <b>giữ cấp</b>; món đã đủ 3 dòng thì báo và <b>không trừ Ly Hỏa</b>. ' +
      'Thăng cấp dòng dùng <b>' + e(TT.d.thangcap.ten) + ' (' + TT.d.thangcap.id + ')</b>, tối đa cấp 10. Lưu là có hiệu lực ngay lần tôi luyện kế tiếp, không cần restart. Món đang có giữ nguyên.</div>';
    h += c.co ? '<div class="ttWarn">Đang dùng cấu hình admin' + (c.ai ? ' · lưu lần cuối ' + new Date(c.t * 1000).toLocaleString('vi-VN') + ' · ' + e(c.ai) : '') + '.</div>'
      : '<div class="ttNote">Chưa chỉnh: tôi luyện ngẫu nhiên như gốc.</div>';
    h += '<div class="ttGrid">' + the('cong') + the('thu') + '</div>';
    h += '<div class="ttBar"><button class="ttGo" onclick="ttLuu()">💾 Lưu Tinh Thông</button><button onclick="ttLoad()">🔄 Tải lại</button>' +
      '<button class="ttDo" onclick="ttTra()">' + (TT.xnTra ? '⚠ Bấm lần nữa: về ngẫu nhiên gốc' : '♻️ Về ngẫu nhiên gốc') + '</button></div>';
    h += '<div class="ttWarn">⚠ Cấp các dòng cùng loại được <b>cộng dồn</b> trên mọi món đang mặc: 6 món đồ thủ × 3 dòng Thể lực × cấp 10 = 180 cấp Thể lực. Cân với lượng Tinh Kim Thạch đang lưu hành.</div>';
    b.innerHTML = h;
  }
  var MAC = { cong: ['BG', 'HG', 'XG'], thu: ['TL', 'TL', 'TL'] };   // gợi ý khi vừa tick (chủ server 10/10: công = thuộc tính, thủ = thể lực)
  window.ttBat = function (k, on) { TT.c[k] = on ? (TT.c[k] || MAC[k].slice()) : null; ve(); };
  window.ttChon = function (k, i, v) { if (TT.c[k]) TT.c[k][i] = v; };
  window.ttLuu = function () {
    api('/api/gm/tinhthong', { op: 'luu', cfg: TT.c }).then(function (j) { toast('✅ ' + (j.msg || 'Đã lưu')); return nap(); }).catch(function (er) { loi(er); });
  };
  window.ttTra = function () {
    if (!TT.xnTra) { TT.xnTra = 1; ve(); setTimeout(function () { TT.xnTra = 0; ve(); }, 6000); return; }
    TT.xnTra = 0;
    api('/api/gm/tinhthong', { op: 'tra' }).then(function (j) { toast('✅ ' + (j.msg || 'Đã về mặc định')); return nap(); }).catch(function (er) { loi(er); });
  };
})();
