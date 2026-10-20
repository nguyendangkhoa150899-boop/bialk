// 🐉 08/10 CUSTOM TRÙNG LÂU (tab 🛠️ GM, chỉ cổng SUPER) - phục vụ ở /tl.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Dữ liệu + ghi đi qua /api/gm/trunglau -> panel GM (repo tlbbnetco4, panel/trunglau.py). Lệnh: xem / giu / mon / xoa / chep / giong / hu / restart.
//  - DÒNG: lưu trên món lúc tạo -> chỉ món tạo mới / Chân Trùng Lâu đem tẩy mới ăn dòng mới.
//  - ĐIỂM: server tính lại mỗi lần vào game = ceil(V × hệ số cấp / 100) -> áp cho CẢ món đang có (dòng món đó có), sau restart.
//  - HIỆU ỨNG (tỉ lệ / thời gian / miễn / phản): chung toàn server cho mọi ai cầm mã đó, sau restart.
// 20/10: làm lại giao diện: bảng chọn món theo nhóm (thường -> Chân), nhãn người chơi / admin, trạng thái Gốc / Đã chỉnh / Nháp,
//   bảng dòng cột Gốc / Đang / Mới / Thay đổi (thứ tự cố định, không nhảy khi tick), lọc dòng theo tên, thanh lưu dính đáy đếm thay đổi,
//   hiệu ứng dùng chung cảnh báo to, hộp xác nhận uiConfirm thay bấm 2 lần. Payload gửi server GIỮ NGUYÊN.
(function () {
  // 09/10: 2 muc doc lap dung chung code - NS = tien to ham (tl / lv), BOX = id khung, CFG = { ten, nhom, sel, coHu }
  // nhom: [ten, [ma thuong...], ma Chan | null, { loai: 'nc' | 'ad' | 'tb' | 'mu', nhan: {ma: nhan}, ghi: {ma: ghi chu} }]
  function lap(NS, BOX, CFG) {
  var TL = { xem: 'goc', tim: '', tab: 'dong', heSo: 1.3, d: null, sel: CFG.sel, hu: {}, sua: {}, giu: null, giuLoi: '', chiMa: false, ban: false };
  // 20/10 (chu server): Gioi / Ngoc nguoi choi = ma su kien (giao dich duoc) + ma doi NPC, nang len Chan; Gioi / Ngoc admin (gift code) tach rieng:
  // 10553113 -> 10422018 (Chan gia: ten game van "Trung Lau Gioi", chi so manh hon), 10553114 -> 10423025 (Chan-Trung Lau Ngoc that).
  var NHOM_TL = [
    ['Giới (nhẫn) người chơi', ['10422016', '10553101'], '10553104', { loai: 'nc', nhan: { '10422016': 'Sự kiện', '10553101': 'Đổi NPC' } }],
    ['Ngọc (hộ phù) người chơi', ['10423024', '10553102'], '10553105', { loai: 'nc', nhan: { '10423024': 'Sự kiện', '10553102': 'Đổi NPC' } }],
    ['Giới admin (chỉ admin / gift code)', ['10553113'], '10422018', { loai: 'ad', nhan: { '10553113': 'Bản thường', '10422018': 'Chân (admin)' },
      ghi: { '10422018': 'Tên trong game vẫn là "Trùng Lâu Giới" (không có chữ Chân): đây là bản Chân giả, chỉ số mạnh hơn. Nâng 10553113 ở NPC Tuyết Phi Phi (250 Huyền Tinh) ra mã này; mã này không nâng tiếp được.' } }],
    ['Ngọc admin (chỉ admin / gift code)', ['10553114'], '10423025', { loai: 'ad', nhan: { '10553114': 'Bản thường', '10423025': 'Chân (admin)' },
      ghi: { '10423025': 'Chân-Trùng Lâu Ngọc bản admin: nâng 10553114 ở NPC Tuyết Phi Phi (250 Huyền Tinh) ra mã này.' } }],
    ['Liên (dây chuyền)', ['10553100', '10553112'], '10553103', { loai: 'tb' }],
    ['Đai (thắt lưng)', ['10553106'], '10553107', { loai: 'tb' }],
    ['Vai (hộ kiên)', ['10553108'], '10553109', { loai: 'tb' }],
    ['Giáp (áo)', ['10553110'], '10553111', { loai: 'tb' }],
    // 13/10: doan rieng 4527 / 4528 / 4529, hieu ung 7580 / 7581 / 7582 (% sat thuong hien theo so that cua server, khong ghi cung)
    ['Mũ Giáng Sinh (sát thương thêm)', ['10410121', '10410127', '10410126'], null, { loai: 'mu',
      nhan: { '10410121': 'Mũ "Trùng Lâu Khôi"', '10410127': 'Mũ top 2 (cấp 92)', '10410126': 'Mũ top 3 (cấp 82)' } }]];
  var NHOM = CFG.nhom.length ? CFG.nhom : NHOM_TL;
  var IDS = []; NHOM.forEach(function (g) { IDS = IDS.concat(g[1]).concat(g[2] ? [g[2]] : []); });
  var LOAI = { nc: '👤 Người chơi', ad: '🛡️ Chỉ admin', tb: 'Trang bị', mu: '🎅 Mũ' };

  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }
  function so(n) { return Number(n || 0).toLocaleString('vi-VN'); }
  function ngay(t) { return t ? new Date(t * 1000).toLocaleString('vi-VN') : ''; }
  function mon(id) { return TL.d ? TL.d.mon.filter(function (m) { return m.id === id; })[0] : null; }
  function boDau(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function dat(id, html, cls) { var x = el(id); if (!x) return; if (html != null) x.innerHTML = html; if (cls != null) x.className = cls; }
  // hop xac nhan tu ve cua panel.js (khong dung hop xac nhan cua trinh duyet)
  function hoi(msg, nut, cls) {
    if (typeof uiConfirm === 'function') return uiConfirm(msg, nut, cls || 'btn-red');
    toast('❌ Thiếu hộp xác nhận, tải lại trang (F5)'); return Promise.resolve(false);
  }
  // giống panel/trunglau.py v_cho: V cho điểm gần x nhất (bằng nhau lấy bên lớn)
  function vCho(x, r) { if (x <= 0 || r <= 0) return 0; var v = Math.floor((x - 1) * 100 / r) + 1; while (Math.ceil(v * r / 100) < x) v++; if (v > 1 && x - Math.ceil((v - 1) * r / 100) < Math.ceil(v * r / 100) - x) v--; return v; }
  function seRa(x, r) { return r > 0 ? Math.ceil(vCho(x, r) * r / 100) : 0; }
  // 2 số gần x nhất engine làm được (dòng hệ số > 100, vd 180: muốn 300 chỉ có 299 / 301)
  function hangXom(x, r) { var vHi = Math.floor((x - 1) * 100 / r) + 1; while (Math.ceil(vHi * r / 100) < x) vHi++; var hi = Math.ceil(vHi * r / 100), lo = vHi > 1 ? Math.ceil((vHi - 1) * r / 100) : hi; return lo === hi ? String(hi) : lo + ' / ' + hi; }
  function raChu(x, r) { var ra = seRa(x, r); return ra === x ? so(ra) : so(ra) + ' ⚠ chỉ có ' + hangXom(x, r); }
  function khoang(a) { return a[0] === a[1] ? String(a[0]) : a[0] + '-' + a[1]; }
  // 09/10: xac suat ra DU k dong goc khi moi lan tao boc n dong (n deu trong [a,b]) tu C dong bat - gia dinh engine chon deu, chua do
  function tohop(n, r) { if (r < 0 || r > n) return 0; var x = 1; for (var i = 1; i <= r; i++) x = x * (n - r + i) / i; return x; }
  function xsDu(C, k, a, b) { var t = 0; for (var n = a; n <= b; n++) t += n < k ? 0 : tohop(C - k, n - k) / tohop(C, n); return t / (b - a + 1); }
  // 📋 08/10: điểm Chân từ điểm Thường (giống panel/trunglau.py diem_chan)
  var CONG_TT = [6, 9, 12, 15];
  function diemChan(x, k, r) {
    if (!(x > 0)) return 0;
    if (CONG_TT.indexOf(k) >= 0) { for (var d = 50; d <= 51; d++) if (r > 0 && seRa(x + d, r) === x + d) return x + d; return x + 50; }
    return Math.max(1, Math.floor(x * 1.3 + 0.5));
  }

  // ---------- nhom / nhan / trang thai
  function nhomCua(id) { return NHOM.filter(function (g) { return g[1].indexOf(id) >= 0 || g[2] === id; })[0] || null; }
  function laChan(id) { var g = nhomCua(id), m = mon(id); return !!((g && g[2] === id) || (m && m.chan)); }
  function nhanCua(id) {
    var g = nhomCua(id), o = (g && g[3]) || {}, m = mon(id);
    if (o.nhan && o.nhan[id]) return o.nhan[id];
    if (!m) return id;
    if (laChan(id)) return 'Chân';
    if (/^Long V/.test(m.ten)) return m.ten.replace(/^Long Văn /, '');
    return 'Thường';
  }
  function tenDai(id) { var g = nhomCua(id); return (g ? g[0] + ': ' : '') + nhanCua(id); }
  function cfgMon(id) { return ((TL.d.cfg || {}).mon || {})[id]; }
  function cungHu(m) { return m.huCung || TL.d.mon.filter(function (x) { return x.hu && m.hu && x.hu.id === m.hu.id; }).map(function (x) { return x.id; }); }
  function huDaChinh(m) { var c = (TL.d.cfg || {}).hu || {}; return !!(m.hu && (c[m.hu.id] || (m.hu.sub && c[m.hu.sub]))); }

  function nap() {
    return api('/api/gm/trunglau', { op: 'xem' }).then(function (j) {
      TL.d = j.data; TL.online = j.online;
      TL.hu = JSON.parse(JSON.stringify((TL.d.cfg || {}).hu || {}));
      TL.sua = {};
      ve();
    });
  }
  window[NS + 'Load'] = function () {
    var chay = function () {
      css(); var b = el(BOX);
      if (b) { b.classList.add('tlKhung'); b.style.display = ''; if (!TL.d) b.innerHTML = '<div class="tlNote">Đang tải…</div>'; }
      nap().catch(function (er) { loi(er); });
    };
    var ds = TL.d ? dsNhap() : [], hd = TL.d ? huDoi().length : 0;
    if (!ds.length && !hd) return chay();
    hoi('Tải lại sẽ BỎ mọi thay đổi chưa lưu: ' + (ds.length ? ds.length + ' mã (' + ds.join(', ') + ')' : '') + (ds.length && hd ? ' và ' : '') + (hd ? hd + ' ô hiệu ứng' : '') + '. Vẫn tải lại?', '🔄 Tải lại, bỏ nháp')
      .then(function (ok) { if (ok) chay(); });
  };

  // ---------- nhap (ban sua chua luu) cua 1 ma: {on:{k:true}, diem:{k:x}, so:[min,max]|null}
  function nhap(id) {
    if (!TL.sua[id]) {
      var m = mon(id), on = {}, diem = {};
      m.dong.forEach(function (k) { on[k] = true; });
      for (var k = 0; k < 58; k++) diem[k] = m.diem[k] || m.diemGoc[k] || 0;
      var cm = cfgMon(id);
      TL.sua[id] = { on: on, diem: diem, so: cm && cm.so ? cm.so.slice() : null };   // 09/10: so = [min,max] dong ra moi lan tao; null = du moi dong tick
    }
    return TL.sua[id];
  }
  function nOnCua(s) { return Object.keys(s.on).filter(function (k) { return s.on[k]; }).length; }
  function soHL(s) { var n = nOnCua(s); return s.so && !(s.so[0] === n && s.so[1] === n) ? s.so : null; }   // giong dieu kien gui body.so
  function diemDang(m, k) { return m.diem[k] || m.diemGoc[k] || 0; }
  // khac biet nhap <-> dang luu: them / bo dong, doi diem, doi so dong ra
  function doiCua(id) {
    var s = TL.sua[id], m = mon(id), r = { them: [], bo: [], diem: [], so: false, n: 0 };
    if (!s || !m) return r;
    Object.keys(s.on).forEach(function (k) {
      k = Number(k); var co = m.dong.indexOf(k) >= 0;
      if (s.on[k] && !co) r.them.push(k); else if (!s.on[k] && co) r.bo.push(k);
      else if (s.on[k] && (s.diem[k] || 0) !== diemDang(m, k)) r.diem.push(k);
    });
    var cm = cfgMon(id);
    r.so = String(soHL(s) || '') !== String((cm && cm.so) || '');
    r.n = r.them.length + r.bo.length + r.diem.length + (r.so ? 1 : 0);
    return r;
  }
  function chuaLuu(id) { return doiCua(id).n > 0; }
  function dsNhap() { return IDS.filter(function (i) { return mon(i) && chuaLuu(i); }); }
  function trangThai(id) { return chuaLuu(id) ? ['nhap', '✎ Nháp'] : cfgMon(id) ? ['chinh', '● Đã chỉnh'] : ['goc', 'Gốc']; }

  // ---------- hieu ung: gia tri dang chay / goc / o da doi chua luu
  function huTim(h, k, goc) {
    var v = null;
    TL.d.mon.forEach(function (m) {
      var x = goc ? (m.huGoc || m.hu) : m.hu; if (!x) return;
      if (x.id === h && x.tham && x.tham[k] != null) v = x.tham[k];
      if (x.sub === h && k === 'dur' && x.dur != null) v = x.dur;
    });
    return v;
  }
  function huDoi() {
    var cfg = (TL.d.cfg || {}).hu || {}, keys = {}, out = [];
    [TL.hu, cfg].forEach(function (o) { Object.keys(o).forEach(function (h) { Object.keys(o[h] || {}).forEach(function (k) { keys[h + '|' + k] = 1; }); }); });
    Object.keys(keys).forEach(function (hk) {
      var p = hk.split('|'), moi = (TL.hu[p[0]] || {})[p[1]], cu = (cfg[p[0]] || {})[p[1]];
      if (moi == null && cu == null) return;
      if (moi == null || (cu != null ? moi !== cu : moi !== huTim(p[0], p[1]))) out.push(hk);
    });
    return out;
  }

  function css() {
    if (document.getElementById('tlCss')) return;
    var s = document.createElement('style'); s.id = 'tlCss';
    s.textContent =
      '.tlKhung{--tN:var(--bg,#1e1f22);--tT:var(--card,#2b2d31);--tV:var(--line,#3f4147);--tC:var(--txt,#dbdee1);--tM:var(--mut,#949ba4);display:grid;gap:12px;margin-top:8px;color:var(--tC);font-size:13.5px;min-width:0}' +
      '.tlKhung *{box-sizing:border-box}' +
      '.tlKhung button{padding:6px 12px;border-radius:7px;border:1px solid #4e525b;background:#3a3d44;color:#eceef1;cursor:pointer;font-size:13px;line-height:1.3;font-family:inherit}' +
      '.tlKhung button:hover:not(:disabled){filter:brightness(1.15)}.tlKhung button:disabled{opacity:.45;cursor:not-allowed}' +
      '.tlKhung button.tlGo{background:#1a7f45;border-color:#23a55a;color:#fff;font-weight:700}.tlKhung button.tlDo{background:#a52a2e;border-color:#d0383d;color:#fff}' +
      '.tlKhung button.tlDoVien{background:transparent;border-color:#d0383d;color:#ffa3a5}' +
      '.tlKhung button.tlLink{background:none;border:none;padding:0 2px;color:#a9b4ff;text-decoration:underline dotted;font-size:inherit}' +
      '.tlKhung .tlNote{font-size:12.5px;color:var(--tM);line-height:1.55}.tlKhung .tlNote b{color:var(--tC)}.tlKhung .tlMo{color:var(--tM)}' +
      '.tlKhung .tlVang{color:#f5c76b}.tlKhung .tlDoChu{color:#ff9a9c;font-weight:600}' +
      '.tlKhung .tlWarn{background:rgba(240,177,50,.12);border:1px solid rgba(240,177,50,.55);color:#f7d58f;border-radius:8px;padding:9px 12px;font-size:13px;line-height:1.5}' +
      '.tlKhung .tlWarn b{color:#ffe2a8}.tlKhung .tlWarnTo{font-size:14px;border-width:2px}' +
      // badge / chip
      '.tlKhung .tlB{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;border:1px solid;border-radius:999px;padding:1px 8px;white-space:nowrap;line-height:1.5}' +
      '.tlKhung .tlB-goc,.tlKhung .tlB-tb{background:#3a3c42;color:#c9cdd3;border-color:#4e525b}' +
      '.tlKhung .tlB-chinh,.tlKhung .tlB-them{background:rgba(35,165,90,.16);color:#74e0a2;border-color:rgba(35,165,90,.5)}' +
      '.tlKhung .tlB-nhap,.tlKhung .tlB-doi{background:rgba(240,177,50,.16);color:#f5c76b;border-color:rgba(240,177,50,.55)}' +
      '.tlKhung .tlB-bo{background:rgba(242,63,67,.16);color:#ff9a9c;border-color:rgba(242,63,67,.5)}' +
      '.tlKhung .tlB-nc{background:rgba(52,182,201,.16);color:#86dbe8;border-color:rgba(52,182,201,.5)}' +
      '.tlKhung .tlB-ad{background:rgba(242,120,60,.16);color:#ffb088;border-color:rgba(242,120,60,.55)}' +
      '.tlKhung .tlB-mu{background:rgba(236,96,160,.16);color:#f7a3c9;border-color:rgba(236,96,160,.5)}' +
      '.tlKhung .tlB-chan{background:rgba(179,98,242,.18);color:#d9b0ff;border-color:rgba(179,98,242,.55)}' +
      '.tlKhung .tlB-ngoai{background:rgba(88,101,242,.18);color:#b3bcff;border-color:rgba(88,101,242,.5)}' +
      // thanh tren
      '.tlKhung .tlTop{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;background:var(--tT);border:1px solid var(--tV);border-radius:10px;padding:10px 12px}' +
      '.tlKhung .tlSum{display:flex;flex-wrap:wrap;gap:8px}.tlKhung .tlSo1{background:var(--tN);border:1px solid var(--tV);border-radius:8px;padding:4px 10px;font-size:12.5px;color:var(--tM)}' +
      '.tlKhung .tlSo1 b{color:var(--tC);font-size:15px;margin-right:2px}.tlKhung .tlSo1.nhap{border-color:rgba(240,177,50,.6)}.tlKhung .tlSo1.nhap b{color:#f5c76b}' +
      '.tlKhung .tlTopBtn{display:flex;flex-wrap:wrap;gap:8px}.tlKhung .tlFull{flex-basis:100%}' +
      // bang chon mon
      '.tlKhung .tlGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;align-items:start}' +
      '.tlKhung .tlG{background:var(--tT);border:1px solid var(--tV);border-left:4px solid #6d727b;border-radius:10px;padding:8px;display:grid;gap:3px}' +
      '.tlKhung .tlG-nc{border-left-color:#34b6c9}.tlKhung .tlG-ad{border-left-color:#f2783c}.tlKhung .tlG-mu{border-left-color:#ec60a0}' +
      '.tlKhung .tlGH{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:0 2px 4px}.tlKhung .tlGH b{font-size:13px;color:#e9d3a0}' +
      '.tlKhung .tlIt{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 8px;background:transparent;border-color:transparent}' +
      '.tlKhung .tlIt:hover{background:#34373d}.tlKhung .tlIt.on{background:rgba(88,101,242,.22);border-color:#5865f2}' +
      '.tlKhung .tlIt.chan{background:rgba(179,98,242,.08)}.tlKhung .tlIt.chan.on{background:rgba(179,98,242,.25);border-color:#b362f2}.tlKhung .tlIt.chan b{color:#e2c2ff}' +
      '.tlKhung .tlItL,.tlKhung .tlItR{display:grid;gap:1px;min-width:0}.tlKhung .tlItR{justify-items:end;flex-shrink:0}' +
      '.tlKhung .tlIt small{color:var(--tM);font-size:11.5px}.tlKhung .tlItL b{font-weight:600;overflow-wrap:anywhere}' +
      '.tlKhung .tlMui{font-size:11.5px;color:#c9a8f0;padding:0 10px}' +
      // khung sua
      '.tlKhung .tlPane{display:grid;gap:10px;min-width:0}' +
      '.tlKhung .tlCard{background:var(--tT);border:1px solid var(--tV);border-radius:10px;padding:12px;display:grid;gap:10px;min-width:0}' +
      '.tlKhung h4{margin:0;font-size:15px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}' +
      '.tlKhung .tlDauT{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:flex-start}' +
      '.tlKhung .tlTen{font-size:18px;font-weight:700;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.tlKhung .tlNhan{font-size:13px;font-weight:700;padding:2px 10px;border-radius:999px;background:#3a3d44;color:#eceef1}.tlKhung .tlNhan.chan{background:rgba(179,98,242,.3);color:#ecd7ff}' +
      '.tlKhung .tlChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.tlKhung .tlFlow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:var(--tN);border:1px solid var(--tV);border-radius:8px;padding:8px 10px}' +
      '.tlKhung .tlFlow .tlChip{padding:4px 10px;border-radius:999px}.tlKhung .tlChip.on{background:#5865f2;border-color:#7983f5;color:#fff}' +
      '.tlKhung .tlChip.chan{border-color:#b362f2}.tlKhung .tlChip.chan.on{background:#8a45c9;color:#fff}.tlKhung .tlChip small{opacity:.8}' +
      '.tlKhung .tlTo{font-size:18px;color:#c9a8f0;padding:0 4px}.tlKhung .tlPlus{color:var(--tM)}' +
      '.tlKhung .tlStats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}' +
      '.tlKhung .tlStat{background:var(--tN);border:1px solid var(--tV);border-radius:8px;padding:7px 10px;display:grid;gap:1px}' +
      '.tlKhung .tlStat small{color:var(--tM);font-size:11.5px}.tlKhung .tlStat b{font-size:15px}.tlKhung .tlStat span{font-size:12px;color:var(--tM)}' +
      '.tlKhung .tlStat.lech{border-color:rgba(35,165,90,.55)}.tlKhung .tlStat.lech b{color:#74e0a2}' +
      '.tlKhung .tlStat.warn{border-color:rgba(240,177,50,.7)}.tlKhung .tlStat.warn span{color:#f5c76b;font-weight:600}' +
      // tab
      '.tlKhung .tlTabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--tV)}' +
      '.tlKhung .tlTab{background:transparent;border:1px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;color:#b5bac1;padding:8px 14px;font-weight:600}' +
      '.tlKhung .tlTab.on{background:var(--tT);border-color:var(--tV);color:#fff;box-shadow:inset 0 3px 0 #5865f2;margin-bottom:-1px}' +
      // cong cu dong
      '.tlKhung .tlTool{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}.tlKhung .tlTool2{font-size:12.5px;color:var(--tM)}' +
      '.tlKhung .tlSep{width:1px;align-self:stretch;background:var(--tV);margin:0 4px}' +
      '.tlKhung .tlSeg{display:inline-flex;border:1px solid #4e525b;border-radius:8px;overflow:hidden}' +
      '.tlKhung .tlSeg button{border:none;border-radius:0;background:transparent;color:#c4c9d0;padding:6px 11px}.tlKhung .tlSeg button+button{border-left:1px solid #4e525b}' +
      '.tlKhung .tlSeg button.on{background:#5865f2;color:#fff;font-weight:700}' +
      '.tlKhung input[type=number],.tlKhung input[type=search]{padding:5px 8px;border-radius:6px;border:1px solid #4e525b;background:var(--tN);color:var(--tC);font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums}' +
      '.tlKhung input[type=search]{flex:1 1 220px;min-width:160px;max-width:360px}.tlKhung input[type=number]{width:110px}.tlKhung input.tlNho{width:70px}' +
      '.tlKhung input:disabled{opacity:.4}.tlKhung input.tlCh{border-color:#f0b132;background:rgba(240,177,50,.12)}' +
      '.tlKhung .tlCnt{font-weight:700;margin-left:auto;padding:3px 10px;border-radius:999px;background:var(--tN);border:1px solid var(--tV)}.tlKhung .tlCnt.bad{color:#ff9a9c;border-color:#d0383d}' +
      '.tlKhung details.tlHelp summary{cursor:pointer;color:#a9b4ff;font-size:12.5px}.tlKhung details.tlHelp .tlNote{margin-top:6px}' +
      // bang
      '.tlKhung .tlTbl{min-width:0}.tlKhung table{border-collapse:collapse;width:100%;font-size:13px}' +
      '.tlKhung th,.tlKhung td{padding:6px 10px;border-bottom:1px solid var(--tV);text-align:left;vertical-align:middle}' +
      '.tlKhung th{color:var(--tM);font-weight:600;font-size:12px;background:var(--tN)}.tlKhung th.n,.tlKhung td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.tlKhung tbody tr:hover td{background:rgba(255,255,255,.03)}.tlKhung tr.off td{color:#7d838c}.tlKhung tr.doi td{background:rgba(240,177,50,.07)}' +
      '.tlKhung td.c{width:34px}.tlKhung input[type=checkbox]{width:17px;height:17px;cursor:pointer;accent-color:#5865f2}' +
      '.tlKhung .tlLech{color:#f5c76b}.tlKhung .tlKhacGoc{color:#74e0a2;font-weight:600}' +
      '.tlKhung .tlSoD{display:grid;gap:6px;background:var(--tN);border:1px solid var(--tV);border-radius:8px;padding:9px 12px}' +
      // hieu ung
      '.tlKhung .tlHu{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}' +
      '.tlKhung .tlF{background:var(--tN);border:1px solid var(--tV);border-radius:8px;padding:9px 10px;display:grid;gap:5px}.tlKhung .tlF.doi{border-color:#f0b132}' +
      '.tlKhung .tlF label{font-size:12.5px;color:var(--tC);font-weight:600}.tlKhung .tlF .tlGoc{font-size:12px;color:var(--tM)}' +
      // thanh luu dinh day
      '.tlKhung .tlBar2{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;padding:10px 12px;background:#232428;border:1px solid var(--tV);border-radius:10px;box-shadow:0 -6px 18px rgba(0,0,0,.4)}' +
      '.tlKhung .tlBar2.doi{border:2px solid #f0b132}.tlKhung .tlBarL{display:grid;gap:3px;font-size:13px;min-width:0}.tlKhung .tlBarR{display:flex;flex-wrap:wrap;gap:8px}' +
      '@container (max-width:700px){.tlKhung .tlTbl{overflow-x:auto;padding-bottom:10px}.tlKhung table{min-width:640px}.tlKhung .tlCnt{margin-left:0}.tlKhung .tlTop{padding:8px}}';
    document.head.appendChild(s);
  }

  // ---------- ve
  function ve() {
    var b = el(BOX); if (!b || !TL.d) return;
    if (!mon(TL.sel)) { var dau = IDS.filter(mon)[0]; if (dau) TL.sel = dau; }
    var y = window.scrollY;
    b.innerHTML = '<div id="' + NS + 'Top">' + veTop() + '</div><div id="' + NS + 'GiuBox">' + veGiu() + '</div>' +
      '<div id="' + NS + 'Grid">' + veNhom() + '</div><div class="tlPane">' + veMon(TL.sel) + '</div>';
    if (y && window.scrollTo && window.scrollY !== y) { try { window.scrollTo(0, y); } catch (x) { /* bo qua */ } }
  }
  // cap nhat nho (khong ve lai ca trang -> giu o dang go)
  function veNho() { dat(NS + 'Top', veTop()); dat(NS + 'Grid', veNhom()); var bc = veBar(); dat(NS + 'Bar', bc[0], bc[1]); }

  function veTop() {
    var cfg = TL.d.cfg || {}, co = IDS.filter(mon), nMa = co.filter(function (i) { return (cfg.mon || {})[i]; }).length;
    var nHu = CFG.coHu ? Object.keys(cfg.hu || {}).length : 0, nNhap = dsNhap().length;
    return '<div class="tlTop"><div class="tlSum">' +
      '<span class="tlSo1"><b>' + nMa + '</b> / ' + co.length + ' mã đã chỉnh</span>' +
      (CFG.coHu ? '<span class="tlSo1"><b>' + nHu + '</b> hiệu ứng đã chỉnh</span>' : '') +
      (nNhap ? '<span class="tlSo1 nhap"><b>' + nNhap + '</b> mã có nháp chưa lưu</span>' : '') +
      '<span class="tlSo1"><b>' + so(TL.online) + '</b> người online</span></div>' +
      '<div class="tlTopBtn"><button onclick="' + NS + 'Load()">🔄 Tải lại</button><button onclick="' + NS + 'Giu()">👥 Ai đang giữ ' + e(CFG.ten) + '</button>' +
      '<button class="tlDoVien" onclick="' + NS + 'Restart()">🔁 Restart game</button><button class="tlDo" onclick="' + NS + 'Tra()">♻️ Trả tất cả ' + e(CFG.ten) + ' về gốc</button></div>' +
      '<div class="tlNote tlFull">💾 Lưu xong <b>chưa có hiệu lực ngay</b>: phải <b>restart game</b>.' +
      (CFG.coHu && cfg.huAi ? ' Lần chỉnh hiệu ứng cuối: ' + e(cfg.huAi) + (cfg.huT ? ' lúc ' + ngay(cfg.huT) : '') + '.' : '') + '</div></div>';
  }

  function veNhom() {
    var h = '<div class="tlGrid">';
    NHOM.forEach(function (g) {
      var th = g[1].filter(mon), chan = g[2] && mon(g[2]) ? g[2] : null, o = g[3] || {};
      if (!th.length && !chan) return;   // ma chua co tren server -> bo qua
      h += '<div class="tlG' + (o.loai ? ' tlG-' + o.loai : '') + '"><div class="tlGH"><b>' + e(g[0]) + '</b>' + (LOAI[o.loai] ? '<span class="tlB tlB-' + o.loai + '">' + LOAI[o.loai] + '</span>' : '') + '</div>';
      th.forEach(function (id) { h += veIt(id); });
      if (chan) h += (th.length ? '<div class="tlMui">' + (o.loai === 'ad' ? '↓ nâng lên Chân admin (NPC)' : '↓ nâng lên Chân') + '</div>' : '') + veIt(chan);
      h += '</div>';
    });
    return h + '</div>';
  }
  function veIt(id) {
    var m = mon(id); if (!m) return '';
    var st = trangThai(id), chan = laChan(id), g = nhomCua(id), meta = [id];
    if (m.gd) meta.push(m.gd);
    var phu = m.dong.length + ' dòng';
    if (g && g[3] && g[3].loai === 'mu' && m.hu && m.hu.tham && m.hu.tham.hs != null) phu = '+' + m.hu.tham.hs + '% sát thương · ' + phu;
    if (huDaChinh(m)) phu += ' · ✨';
    return '<button class="tlIt' + (TL.sel === id ? ' on' : '') + (chan ? ' chan' : '') + '" onclick="' + NS + 'Chon(\'' + id + '\')" title="' + e(m.ten) + '">' +
      '<span class="tlItL"><b>' + (chan ? '✦ ' : '') + e(nhanCua(id)) + '</b><small>' + e(meta.join(' · ')) + '</small></span>' +
      '<span class="tlItR"><span class="tlB tlB-' + st[0] + '">' + st[1] + '</span><small>' + phu + '</small></span></button>';
  }

  function veMon(id) {
    var m = mon(id); if (!m) return '';
    var s = nhap(id), cung = cungHu(m), tabs = [['dong', '📊 Dòng và điểm <span class="tlB tlB-tb">' + nOnCua(s) + ' / ' + TL.d.maxDong + '</span>']];
    if (m.hu) tabs.push(['hu', '✨ Hiệu ứng: ' + e(m.hu.ten) + (cung.length > 1 ? ' <span class="tlB tlB-doi">⚠ dùng chung ' + cung.length + ' mã</span>' : '')]);
    if (m.chanDich && mon(m.chanDich)) tabs.push(['chep', '📋 Chép sang Chân ' + m.chanDich]);
    if (m.giong && mon(m.giong)) tabs.push(['giong', '📋 Giống hệt ' + e(nhanCua(m.giong)) + ' ' + m.giong]);
    var tab = tabs.some(function (t) { return t[0] === TL.tab; }) ? TL.tab : 'dong';
    var h = veDau(m) + '<div class="tlTabs">' + tabs.map(function (t) {
      return '<button class="tlTab' + (t[0] === tab ? ' on' : '') + '" onclick="' + NS + 'Tab(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += tab === 'hu' ? veHu(m) : tab === 'chep' ? veChep(m) : tab === 'giong' ? veGiong(m) : veDong(m, s);
    var bc = veBar();
    return h + '<div class="' + bc[1] + '" id="' + NS + 'Bar">' + bc[0] + '</div>';
  }

  function chip(x) {
    return '<button class="tlChip' + (x === TL.sel ? ' on' : '') + (laChan(x) ? ' chan' : '') + '" onclick="' + NS + 'Chon(\'' + x + '\')">' + (laChan(x) ? '✦ ' : '') + e(nhanCua(x)) + ' <small>' + x + '</small></button>';
  }
  function veDau(m) {
    var id = m.id, g = nhomCua(id), o = (g && g[3]) || {}, cm = cfgMon(id), st = trangThai(id), chan = laChan(id), cung = m.hu ? cungHu(m) : [];
    var h = '<div class="tlCard"><div class="tlDauT"><div><div class="tlTen">' + e(m.ten) + ' <span class="tlNhan' + (chan ? ' chan' : '') + '">' + (chan ? '✦ ' : '') + e(nhanCua(id)) + '</span></div>' +
      '<div class="tlChips"><span class="tlB tlB-tb">Mã ' + id + '</span>' + (m.loai ? '<span class="tlB tlB-tb">' + e(m.loai) + '</span>' : '') +
      (m.gd ? '<span class="tlB tlB-tb">' + e(m.gd) + '</span>' : '') + (LOAI[o.loai] ? '<span class="tlB tlB-' + o.loai + '">' + LOAI[o.loai] + '</span>' : '') +
      '<span class="tlB tlB-' + st[0] + '">' + st[1] + '</span><span class="tlB tlB-tb">Đoạn điểm ' + e(m.seg) + (m.seg !== m.segGoc ? ' (gốc ' + e(m.segGoc) + ')' : '') + '</span></div></div>' +
      '<div class="tlTopBtn">' + (cm ? '<button class="tlDo" onclick="' + NS + 'BoMon()">↩ Trả mã này về gốc</button>' : '') + '</div></div>';
    if (o.ghi && o.ghi[id]) h += '<div class="tlNote">ℹ ' + e(o.ghi[id]) + '</div>';
    // luong thuong -> Chan
    if (g && g[2]) {
      var th = g[1].filter(mon);
      h += '<div class="tlFlow"><span class="tlMo">Luồng:</span>' + th.map(chip).join('<span class="tlPlus">+</span>') + (th.length ? '<span class="tlTo">→</span>' : '') +
        (mon(g[2]) ? chip(g[2]) : '<span class="tlB tlB-goc">✦ ' + e(nhanCua(g[2])) + ' ' + g[2] + ': chưa có trên server</span>') + '</div>';
      if (m.chanDich && g[1].indexOf(id) >= 0 && m.chanDich !== g[2]) h += '<div class="tlWarn">⚠ Nút 📋 Chép sang Chân của server đang trỏ tới <b>' + m.chanDich + '</b>, không phải <b>' + g[2] + '</b> như nhóm này (server chưa cập nhật?).</div>';
    }
    if (chan) {
      var nguon = TL.d.mon.filter(function (x) { return x.chanDich === id; }).map(function (x) { return x.id; });
      if (nguon.length) h += '<div class="tlNote">Chân này nhận dòng khi bấm 📋 Chép ở: ' + nguon.map(function (x) { return '<button class="tlLink" onclick="' + NS + 'Chon(\'' + x + '\')">' + e(nhanCua(x)) + ' ' + x + '</button>'; }).join(', ') + ' (chép mã nào thì Chân theo mã đó).</div>';
    }
    var stat = function (lbl, val, sub, cls) { return '<div class="tlStat' + (cls ? ' ' + cls : '') + '"><small>' + lbl + '</small><b>' + val + '</b><span>' + sub + '</span></div>'; };
    h += '<div class="tlStats">' +
      stat('Dòng đang bật', m.dong.length + ' / ' + TL.d.maxDong, 'gốc ' + m.dongGoc.length + ' dòng', m.dong.length !== m.dongGoc.length ? 'lech' : '') +
      stat('Số dòng ra mỗi lần tạo', khoang(m.soDong), 'gốc ' + khoang(m.soDongGoc) + (m.soDong[0] < m.dong.length ? ' · bốc ngẫu nhiên trong ' + m.dong.length : ''), khoang(m.soDong) !== khoang(m.soDongGoc) ? 'lech' : '') +
      (m.hu ? stat('Hiệu ứng thần khí', e(m.hu.ten), cung.length > 1 ? '⚠ dùng chung ' + cung.length + ' mã' : 'riêng mã này', cung.length > 1 ? 'warn' : (huDaChinh(m) ? 'lech' : '')) : '') +
      stat('Lưu lần cuối', cm ? ngay(cm.t) : 'Chưa chỉnh', cm ? e(cm.ai) : 'đang đúng bản gốc', '') + '</div>';
    return h + '</div>';
  }

  // ---------- tab dong + diem
  function dsDong(m, s) {
    var thu = [], add = function (k) { k = Number(k); if (thu.indexOf(k) < 0) thu.push(k); };
    if (TL.xem === 'het') (m.dongCo || m.dongGoc).forEach(add);
    if (TL.xem !== 'tick') m.dongGoc.forEach(add);
    m.dong.forEach(add);
    Object.keys(s.on).forEach(function (k) { if (s.on[k]) add(k); });
    // thu tu CO DINH theo ban dang luu (tick / bo tick khong lam hang nhay): dang bat -> dong goc -> con lai
    var co = function (a, k) { return a.indexOf(k) >= 0 ? 0 : 1; };
    thu.sort(function (a, b) { return co(m.dong, a) - co(m.dong, b) || co(m.dongGoc, a) - co(m.dongGoc, b) || a - b; });
    return thu;
  }
  function lopHang(m, s, k) { var on = !!s.on[k], coD = m.dong.indexOf(k) >= 0; return !on ? (coD ? 'off doi' : 'off') : (!coD || (s.diem[k] || 0) !== diemDang(m, k) ? 'doi' : ''); }
  function oDoi(m, s, k) {
    var on = !!s.on[k], coD = m.dong.indexOf(k) >= 0, x = s.diem[k] || 0;
    if (on && !coD) return '<span class="tlB tlB-them">+ bật mới</span>';
    if (!on && coD) return '<span class="tlB tlB-bo">− sẽ bỏ</span>';
    if (on && x !== diemDang(m, k)) return '<span class="tlB tlB-doi">' + so(diemDang(m, k)) + ' → ' + so(x) + '</span>';
    return '';
  }
  function veHang(m, s) {
    var tim = boDau(TL.tim).trim(), ds = dsDong(m, s).filter(function (k) { return !tim || boDau(TL.d.dongTen[k]).indexOf(tim) >= 0; });
    if (!ds.length) return '<tr><td colspan="7" class="tlNote">Không có dòng nào khớp "' + e(TL.tim) + '".</td></tr>';
    return ds.map(function (k) {
      var r = m.rate[k], on = !!s.on[k], x = s.diem[k] || 0, coD = m.dong.indexOf(k) >= 0, laGoc = m.dongGoc.indexOf(k) >= 0, ra = seRa(x, r);
      var goc = m.diemGoc[k] || 0, dang = coD ? diemDang(m, k) : null;
      return '<tr id="' + NS + 'Row' + k + '" class="' + lopHang(m, s, k) + '"><td class="c"><input type="checkbox" ' + (on ? 'checked ' : '') +
        (r > 0 ? '' : 'disabled title="dòng này không có hệ số ở cấp ' + m.cap + '" ') + 'onchange="' + NS + 'Dong(' + k + ',this.checked)"></td>' +
        '<td>' + e(TL.d.dongTen[k]) + (laGoc ? '' : ' <span class="tlB tlB-ngoai" title="món gốc không tự ra dòng này; game có sẵn số trong đoạn giá trị">ngoài gốc</span>') + '</td>' +
        '<td class="n">' + (on && x !== goc && goc > 0 ? '<button class="tlLink" title="Đặt điểm mới = gốc" onclick="' + NS + 'DiemGoc(' + k + ')">' + so(goc) + '</button>' : so(goc)) + '</td>' +
        '<td class="n' + (dang != null && dang !== goc ? ' tlKhacGoc' : '') + '">' + (dang != null ? so(dang) : '<span class="tlMo">tắt</span>') + '</td>' +
        '<td class="n"><input type="number" min="1" step="1" value="' + (x || '') + '" ' + (on ? '' : 'disabled ') + 'oninput="' + NS + 'Diem(' + k + ',this.value,this)" class="' + (on && x !== diemDang(m, k) ? 'tlCh' : '') + '"></td>' +
        '<td class="n' + (on && ra !== x ? ' tlLech' : '') + '" id="' + NS + 'Ra' + k + '">' + (on ? raChu(x, r) : '') + '</td>' +
        '<td id="' + NS + 'Doi' + k + '">' + oDoi(m, s, k) + '</td></tr>';
    }).join('');
  }
  function soNote(m, s) {
    var nOn = nOnCua(s), sr = s.so || [nOn, nOn], kGoc = m.dongGoc.filter(function (k) { return s.on[k]; }).length;
    if (!(sr[0] >= 1 && sr[0] <= sr[1] && sr[1] <= nOn)) return '<span class="tlDoChu">⚠ Phải 1 ≤ từ ≤ đến ≤ ' + nOn + '.</span>';
    if (sr[1] >= nOn && sr[0] >= nOn) return 'Mỗi món ra <b>đủ ' + nOn + ' dòng</b> đã bật (không ngẫu nhiên).';
    return 'Mỗi món bốc ngẫu nhiên <b>' + (sr[0] === sr[1] ? sr[0] : sr[0] + '-' + sr[1]) + '</b> dòng trong ' + nOn + ' dòng bật. ' +
      (kGoc ? 'Xác suất ra <b>đủ ' + kGoc + ' dòng gốc</b>: <b>' + (xsDu(nOn, kGoc, sr[0], sr[1]) * 100).toFixed(1) + '%</b>' : '') +
      ' <i>(giả định engine chọn đều, chưa đo; đo lại bằng DB sau khi người chơi tẩy)</i>';
  }
  function veDong(m, s) {
    var id = m.id, nOn = nOnCua(s), max = TL.d.maxDong, nCo = (m.dongCo || m.dongGoc).length, g = nhomCua(id);
    var anhEm = g && g[3] ? g[1].concat(g[2] ? [g[2]] : []).filter(function (x) { return x !== id && mon(x); }) : [];
    var h = '<div class="tlCard"><div class="tlTool"><div class="tlSeg">' +
      [['goc', 'Dòng gốc + đang bật'], ['het', 'Mọi dòng game có (' + nCo + ')'], ['tick', 'Chỉ dòng đang bật']].map(function (x) {
        return '<button class="' + (TL.xem === x[0] ? 'on' : '') + '" onclick="' + NS + 'Xem(\'' + x[0] + '\')">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<input type="search" id="' + NS + 'Tim" placeholder="🔎 Lọc dòng theo tên (vd: công, kháng)" value="' + e(TL.tim) + '" oninput="' + NS + 'Tim(this.value)">' +
      '<span class="tlCnt' + (nOn > max || !nOn ? ' bad' : '') + '">' + nOn + ' / ' + max + ' dòng bật</span></div>' +
      '<div class="tlTool tlTool2"><span>Nhân điểm mọi dòng đang bật ×</span><input type="number" class="tlNho" step="0.05" min="0.1" id="' + NS + 'HeSo" value="' + TL.heSo + '">' +
      '<button onclick="' + NS + 'Nhan()">Áp vào nháp</button>' +
      (anhEm.length ? '<span class="tlSep"></span><span>📥 Lấy dòng + điểm đang lưu của:</span>' + anhEm.map(function (x) {
        return '<button onclick="' + NS + 'Lay(\'' + x + '\')" title="Chép vào nháp của mã này (chưa lưu)">' + (laChan(x) ? '✦ ' : '') + e(nhanCua(x)) + ' <small>' + x + '</small></button>';
      }).join('') : '') + '</div>' +
      '<details class="tlHelp"><summary>ℹ Dòng và điểm có hiệu lực thế nào?</summary><div class="tlNote">Tick dòng muốn có (tối đa ' + max + '). ' +
      '<b>Dòng</b> ghi vào món lúc tạo: chỉ món tạo mới / Chân Trùng Lâu đem tẩy mới ra đúng dòng. <b>Điểm</b> server tính lại mỗi lần vào game: đổi điểm áp cho cả món đang có (ở dòng món đó có) sau restart. ' +
      'Cột <b>Đang</b> là số server đang chạy (xanh = khác gốc). Cột <b>Engine ra</b> là số thật engine cho (vài dòng hệ số lớn chỉ ra số chẵn / lẻ nhất định). Bấm số gạch chân ở cột <b>Gốc</b> để đặt lại điểm bằng gốc.</div></details>' +
      '<div class="tlTbl"><table><thead><tr><th class="c"></th><th>Dòng</th><th class="n">Gốc</th><th class="n">Đang</th><th class="n">Điểm mới</th><th class="n">Engine ra</th><th>Thay đổi</th></tr></thead>' +
      '<tbody id="' + NS + 'Tb">' + veHang(m, s) + '</tbody></table></div>';
    // 09/10 (chủ server): số dòng ra mỗi lần tạo < số dòng tick -> bốc ngẫu nhiên (vd Long Văn +9: 13 trong 15 -> đủ 11 dòng gốc ~5,7%)
    var sr = s.so || [nOn, nOn];
    h += '<div class="tlSoD"><div><b>Số dòng ra mỗi lần tạo:</b> từ <input type="number" class="tlNho' + (s.so ? ' tlCh' : '') + '" min="1" max="' + nOn + '" step="1" value="' + sr[0] + '" oninput="' + NS + 'So(0,this.value)">' +
      ' đến <input type="number" class="tlNho' + (s.so ? ' tlCh' : '') + '" min="1" max="' + nOn + '" step="1" value="' + sr[1] + '" oninput="' + NS + 'So(1,this.value)"> trong <b>' + nOn + '</b> dòng bật' +
      (s.so ? ' <button onclick="' + NS + 'So(-1)">↺ Ra đủ mọi dòng bật</button>' : '') + '</div><div class="tlNote" id="' + NS + 'SoNote">' + soNote(m, s) + '</div></div>';
    return h + '</div>';
  }

  // ---------- tab hieu ung
  function veHu(m) {
    var hu = m.hu, hg = m.huGoc || hu, cung = cungHu(m), cfgHu = (TL.d.cfg || {}).hu || {}, doi = {};
    huDoi().forEach(function (hk) { doi[hk] = 1; });
    var tenMa = function (x) { return mon(x) ? '<b>' + e(tenDai(x)) + '</b> (' + x + ')' : x + ' (không có trên trang này)'; };
    var h = '<div class="tlCard"><h4>✨ ' + e(hu.ten) + ' <span class="tlNote">' + e(hu.tenCN) + ' · mã hiệu ứng ' + hu.id + (hu.sub ? ' → ' + hu.sub : '') + '</span></h4>' +
      (cung.length > 1 ? '<div class="tlWarn tlWarnTo">⚠ Hiệu ứng này <b>DÙNG CHUNG</b> cho ' + cung.length + ' mã: ' + cung.map(tenMa).join(', ') + '. Đổi ở đây là đổi cho <b>tất cả</b> các mã đó, toàn server.</div>'
        : '<div class="tlNote">Chỉ mã ' + m.id + ' dùng hiệu ứng này. Áp toàn server cho mọi ai cầm mã này.</div>') + '<div class="tlHu">';
    var o = function (lbl, hid, k, cur, goc, donvi, chia) {
      chia = chia || 1;
      var tl = (TL.hu[hid] || {})[k], cf = (cfgHu[hid] || {})[k], val = tl != null ? tl : (cf != null ? goc : cur), d = doi[hid + '|' + k];
      return '<div class="tlF' + (d ? ' doi' : '') + '"><label>' + lbl + '</label><input type="number" min="0" step="1" value="' + (val / chia) + '" data-h="' + hid + '" data-k="' + k + '" data-c="' + chia + '" oninput="' + NS + 'HuSua(this)" class="' + (d ? 'tlCh' : '') + '">' +
        '<div class="tlGoc">đang ' + so(cur / chia) + donvi + ' · gốc ' + so(goc / chia) + donvi +
        (tl != null && tl !== goc ? ' · <button class="tlLink" onclick="' + NS + 'HuGoc(\'' + hid + '\',\'' + k + '\')">↺ về gốc</button>' : '') +
        (cf != null && tl == null ? ' <span class="tlB tlB-nhap">về gốc khi lưu</span>' : '') + '</div></div>';
    };
    if (hu.tham.rate != null) h += o('Tỉ lệ dính (% mỗi đòn trúng)', hu.id, 'rate', hu.tham.rate, hg.tham.rate, '%');
    if (hu.tham.hs != null) h += o('Sát thương thêm (%) khi dính', hu.id, 'hs', hu.tham.hs, hg.tham.hs, '%');   // 13/10: 伤害修正率 (100 = x2); mu 7580 / 7581 / 7582
    if (hu.dur != null) h += o('Thời gian hiệu ứng (giây)', hu.sub, 'dur', hu.dur, hg.dur, ' giây', 1000);
    if (hu.tham.mien != null) h += o('Miễn (%)', hu.id, 'mien', hu.tham.mien, hg.tham.mien, '%');
    if (hu.tham.phan != null) h += o('Phản đòn (%)', hu.id, 'phan', hu.tham.phan, hg.tham.phan, '%');
    if (hu.tham.tran != null) h += o('Trần sát thương phản', hu.id, 'tran', hu.tham.tran, hg.tham.tran, '');
    var n = huDoi().length;
    return h + '</div><div class="tlTool"><button class="tlGo" onclick="' + NS + 'LuuHu()">💾 Lưu hiệu ứng (toàn server)</button>' + (n ? '<button onclick="' + NS + 'HuHuy()">✖ Hủy ô hiệu ứng đã đổi</button>' : '') +
      '<span class="tlNote">Lưu mọi ô hiệu ứng đã đổi ở mọi mã' + (n ? ' (<b class="tlVang">' + n + ' ô chưa lưu</b>)' : '') + ', có hiệu lực sau restart.</span></div></div>';
  }

  // ---------- tab chep sang Chan / chep giong het
  function veChep(m) {
    var id = m.id, c = mon(m.chanDich), dirty = chuaLuu(id), dongC = m.dong.slice().sort(function (a, b) { return a - b; });
    var cungChan = TL.d.mon.filter(function (x) { return x.chanDich === m.chanDich; }).map(function (x) { return x.id; });
    var thieu = dongC.filter(function (k) { return (c.dongCo || []).indexOf(k) < 0; });
    return '<div class="tlCard"><h4>📋 Chép dòng sang Chân <span class="tlB tlB-chan">✦ ' + e(nhanCua(m.chanDich)) + ' ' + m.chanDich + '</span> <span class="tlNote">' + e(c.ten) + '</span></h4>' +
      '<div class="tlNote">Chân ra <b>đúng ' + dongC.length + ' dòng đang lưu</b> của mã này (nâng ở NPC Tuyết Phi Phi, tẩy Chân bằng Ma Huyết Thạch). Điểm Chân: <b>Băng / Hỏa / Huyền / Độc công +50</b> (engine không ra đúng thì +51), <b>các dòng khác ×1,3</b>. ' +
      'Đè cấu hình Chân hiện tại. Chân này dùng chung cho <b>' + cungChan.join(', ') + '</b>: chép mã nào thì Chân theo mã đó. Có hiệu lực sau restart.</div>' +
      '<div class="tlTbl"><table><thead><tr><th>Dòng</th><th class="n">Thường (đang)</th><th class="n">Chân (đang)</th><th class="n">Chân sau khi chép</th></tr></thead><tbody>' +
      dongC.map(function (k) {
        var ra = seRa(diemChan(m.diem[k], k, c.rate[k]), c.rate[k]), cu = c.dong.indexOf(k) >= 0 ? c.diem[k] : null;
        return '<tr><td>' + e(TL.d.dongTen[k]) + '</td><td class="n">' + so(m.diem[k]) + '</td><td class="n">' + (cu != null ? so(cu) : '<span class="tlMo">không có</span>') + '</td><td class="n"><b' + (cu !== ra ? ' class="tlVang"' : '') + '>' + so(ra) + '</b></td></tr>';
      }).join('') + '</tbody></table></div><div class="tlTool">' +
      (dirty ? '<span class="tlWarn">⚠ Mã này đang có thay đổi chưa lưu: bấm 💾 Lưu (hoặc ✖ Hủy) ở thanh dưới trước rồi mới chép.</span>'
        : thieu.length ? '<span class="tlWarn">⚠ Chân không có số gốc cho: ' + thieu.map(function (k) { return e(TL.d.dongTen[k]); }).join(', ') + '. Bỏ các dòng đó ở mã này rồi chép.</span>'
          : '<button class="tlGo" onclick="' + NS + 'Chep()">📋 Chép dòng sang Chân ' + m.chanDich + '</button>') + '</div></div>';
  }
  function veGiong(m) {
    var id = m.id, g = mon(m.giong), dirty = chuaLuu(id), dongG = m.dong.slice().sort(function (a, b) { return a - b; });
    var thieu = dongG.filter(function (k) { return (g.dongCo || []).indexOf(k) < 0; });
    return '<div class="tlCard"><h4>📋 Chép giống hệt sang <span class="tlB tlB-chan">' + e(nhanCua(m.giong)) + ' ' + m.giong + '</span> <span class="tlNote">' + e(g.ten) + '</span></h4>' +
      '<div class="tlNote">' + e(g.ten) + ' sẽ có <b>đúng ' + dongG.length + ' dòng, cùng điểm, cùng số dòng ra (' + khoang(m.soDong) + ')</b> như mã này. Đè cấu hình hiện tại của ' + m.giong + '. ' +
      '<b>Hiệu ứng thần khí không chép</b> (mỗi món giữ hiệu ứng riêng). Có hiệu lực sau restart.</div>' +
      '<div class="tlTbl"><table><thead><tr><th>Dòng</th><th class="n">' + id + ' (đang)</th><th class="n">' + m.giong + ' (đang)</th><th class="n">' + m.giong + ' sau khi chép</th></tr></thead><tbody>' +
      dongG.map(function (k) {
        return '<tr><td>' + e(TL.d.dongTen[k]) + '</td><td class="n">' + so(m.diem[k]) + '</td><td class="n">' + (g.dong.indexOf(k) >= 0 ? so(g.diem[k]) : '<span class="tlMo">không có</span>') + '</td><td class="n"><b>' + so(seRa(m.diem[k], g.rate[k])) + '</b></td></tr>';
      }).join('') + '</tbody></table></div><div class="tlTool">' +
      (dirty ? '<span class="tlWarn">⚠ Mã này đang có thay đổi chưa lưu: bấm 💾 Lưu (hoặc ✖ Hủy) ở thanh dưới trước rồi mới chép.</span>'
        : thieu.length ? '<span class="tlWarn">⚠ ' + m.giong + ' không có số gốc cho: ' + thieu.map(function (k) { return e(TL.d.dongTen[k]); }).join(', ') + '. Bỏ các dòng đó ở mã này rồi chép.</span>'
          : '<button class="tlGo" onclick="' + NS + 'Giong()">📋 Chép giống hệt sang ' + m.giong + '</button>') + '</div></div>';
  }

  // ---------- thanh luu dinh day: [html, class]
  function veBar() {
    var id = TL.sel, m = mon(id); if (!m) return ['', 'tlBar2'];
    var s = nhap(id), d = doiCua(id), nOn = nOnCua(s), max = TL.d.maxDong, sr = s.so || [nOn, nOn], soOk = sr[0] >= 1 && sr[0] <= sr[1] && sr[1] <= nOn;
    var loiS = !nOn ? 'Chưa bật dòng nào' : nOn > max ? 'Đang bật ' + nOn + ' dòng, tối đa ' + max + ': bỏ bớt ' + (nOn - max) + ' dòng' : !soOk ? 'Số dòng ra phải 1 ≤ từ ≤ đến ≤ ' + nOn : '';
    var phan = [];
    if (d.them.length) phan.push('+' + d.them.length + ' dòng'); if (d.bo.length) phan.push('−' + d.bo.length + ' dòng');
    if (d.diem.length) phan.push(d.diem.length + ' điểm'); if (d.so) phan.push('số dòng ra');
    var khac = dsNhap().filter(function (x) { return x !== id; }), hd = huDoi().length, ten = e(nhanCua(id)) + ' ' + id;
    var h = '<div class="tlBarL">' + (d.n ? '<span><b class="tlVang">✎ ' + d.n + ' thay đổi chưa lưu</b> ở ' + ten + ': ' + phan.join(', ') + '</span>' : '<span class="tlMo">' + ten + ': không có thay đổi chưa lưu</span>') +
      (loiS && d.n ? '<span class="tlDoChu">⚠ ' + loiS + '</span>' : '') +
      (khac.length ? '<span class="tlMo">Nháp chưa lưu ở mã khác: ' + khac.map(function (x) { return '<button class="tlLink" onclick="' + NS + 'Chon(\'' + x + '\')">' + e(nhanCua(x)) + ' ' + x + '</button>'; }).join(', ') + '</span>' : '') +
      (hd ? '<span class="tlVang">✨ ' + hd + ' ô hiệu ứng chưa lưu (toàn server)</span>' : '') + '</div>';
    h += '<div class="tlBarR">' + (hd ? '<button onclick="' + NS + 'HuHuy()">✖ Hủy hiệu ứng</button><button class="tlGo" onclick="' + NS + 'LuuHu()">💾 Lưu hiệu ứng (' + hd + ')</button>' : '') +
      (d.n ? '<button onclick="' + NS + 'HuyMon()">✖ Hủy</button>' : '') + '<button class="tlGo" onclick="' + NS + 'LuuMon()"' + (d.n && !loiS ? '' : ' disabled') + '>💾 Lưu mã ' + id + '</button></div>';
    return [h, 'tlBar2' + (d.n || hd ? ' doi' : '')];
  }

  function veGiu() {
    if (TL.giuLoi) return '<div class="tlWarn">👥 Không đọc được danh sách người giữ: ' + e(TL.giuLoi) + '. Nếu game đang restart (MySQL tắt theo game) thì đợi 2-3 phút rồi bấm lại.</div>';
    if (!TL.giu) return '';
    var ds = TL.chiMa ? TL.giu.filter(function (g) { return g.id === TL.sel; }) : TL.giu;
    var h = '<div class="tlCard"><h4>👥 Ai đang giữ ' + e(CFG.ten) + ' (' + ds.length + ')</h4><div class="tlTool"><label class="tlNote"><input type="checkbox" ' + (TL.chiMa ? 'checked ' : '') +
      'onchange="' + NS + 'ChiMa(this.checked)"> chỉ mã đang chọn (' + TL.sel + ')</label><button onclick="' + NS + 'GiuAn()">✖ Ẩn</button></div>' +
      '<div class="tlNote">Đọc từ DB: game chỉ ghi nhân vật xuống DB <b>~15 phút/lần</b> hoặc khi <b>thoát game</b> → vừa mặc / tháo / giao dịch thì tối đa 15 phút sau mới đúng.</div>' +
      '<div class="tlTbl"><table><thead><tr><th>Nhân vật</th><th>Tài khoản</th><th>Mã</th><th>Món</th><th>Ở đâu</th></tr></thead><tbody>';
    ds.forEach(function (g) {
      h += '<tr><td>' + e(g.nv) + ' <span class="tlMo">' + e(g.guid) + '</span></td><td>' + e(g.acc) + '</td><td class="n">' + e(g.id) + '</td><td>' + e(g.ten) + (mon(g.id) ? ' <span class="tlMo">(' + e(nhanCua(g.id)) + ')</span>' : '') + '</td><td>' +
        (g.cho === 'đang mặc' ? '<b>đang mặc</b>' : e(g.cho)) + '</td></tr>';
    });
    if (!ds.length) h += '<tr><td colspan="5" class="tlNote">Không ai giữ.</td></tr>';
    return h + '</tbody></table></div></div>';
  }

  // ---------- thao tac
  window[NS + 'Chon'] = function (id) { TL.sel = id; ve(); };
  window[NS + 'Tab'] = function (t) { TL.tab = t; ve(); };
  window[NS + 'Xem'] = function (x) { TL.xem = x; ve(); };
  window[NS + 'Them'] = function (on) { TL.xem = on ? 'het' : 'goc'; ve(); };   // ten cu (giu cho chac)
  window[NS + 'Tim'] = function (v) { TL.tim = String(v || ''); var m = mon(TL.sel); if (m) dat(NS + 'Tb', veHang(m, nhap(TL.sel))); };
  window[NS + 'Dong'] = function (k, on) { var s = nhap(TL.sel); s.on[k] = on; if (on && !s.diem[k]) { var m = mon(TL.sel); s.diem[k] = diemDang(m, k) || 1; } ve(); };
  window[NS + 'Diem'] = function (k, v, inp) {
    var s = nhap(TL.sel), m = mon(TL.sel), x = Math.max(0, Math.floor(Number(v) || 0)); s.diem[k] = x;
    var ra = seRa(x, m.rate[k]), td = el(NS + 'Ra' + k);
    if (td) { td.textContent = raChu(x, m.rate[k]); td.className = 'n' + (ra !== x ? ' tlLech' : ''); }
    if (inp && inp.classList) inp.classList.toggle('tlCh', x !== diemDang(m, k));
    dat(NS + 'Doi' + k, oDoi(m, s, k)); dat(NS + 'Row' + k, null, lopHang(m, s, k)); veNho();
  };
  window[NS + 'DiemGoc'] = function (k) { var s = nhap(TL.sel), m = mon(TL.sel); s.diem[k] = m.diemGoc[k] || s.diem[k]; ve(); };
  window[NS + 'Nhan'] = function () {
    var o = el(NS + 'HeSo'), f = Number(String((o && o.value) || '').replace(',', '.'));
    if (!(f > 0) || f > 100) return toast('❌ Hệ số nhân không hợp lệ (vd 1,3 hoặc 0,9)');
    TL.heSo = f;
    var s = nhap(TL.sel), n = 0;
    Object.keys(s.on).forEach(function (k) { if (s.on[k] && s.diem[k] > 0) { s.diem[k] = Math.min(10000000, Math.max(1, Math.round(s.diem[k] * f))); n++; } });
    toast('✅ Đã nhân điểm ' + n + ' dòng × ' + String(f).replace('.', ',') + ' (nháp, chưa lưu)'); ve();
  };
  // 📥 lay dong + diem DANG LUU cua ma khac cung nhom vao nhap ma dang chon (chi dong ma nay co so)
  window[NS + 'Lay'] = function (src) {
    var m = mon(TL.sel), n = mon(src); if (!m || !n) return;
    var s = nhap(TL.sel), co = m.dongCo || m.dongGoc, on = {}, diem = {}, bo = [];
    Object.keys(s.diem).forEach(function (k) { diem[k] = s.diem[k]; });
    m.dong.forEach(function (k) { on[k] = false; });
    n.dong.forEach(function (k) { if (m.rate[k] > 0 && co.indexOf(k) >= 0) { on[k] = true; diem[k] = n.diem[k] || n.diemGoc[k] || diem[k]; } else bo.push(k); });
    var cm = cfgMon(src), nOn = Object.keys(on).filter(function (k) { return on[k]; }).length;
    TL.sua[TL.sel] = { on: on, diem: diem, so: cm && cm.so && cm.so[1] <= nOn ? cm.so.slice() : null };
    toast('✅ Đã lấy ' + (n.dong.length - bo.length) + ' dòng + điểm của ' + src + ' vào nháp ' + TL.sel + (bo.length ? ' (bỏ ' + bo.length + ' dòng mã này không có: ' + bo.map(function (k) { return TL.d.dongTen[k]; }).join(', ') + ')' : '') + '. Kiểm tra rồi bấm 💾 Lưu.');
    TL.tab = 'dong'; ve();
  };
  window[NS + 'HuSua'] = function (inp) {
    var h = inp.dataset.h, k = inp.dataset.k, c = Number(inp.dataset.c) || 1, v = Math.round(Number(inp.value) * c);
    if (inp.value === '' || !isFinite(v) || v < 0) return;
    TL.hu[h] = TL.hu[h] || {}; TL.hu[h][k] = v; inp.classList.add('tlCh'); veNho();
  };
  window[NS + 'HuGoc'] = function (h, k) { if (TL.hu[h]) { delete TL.hu[h][k]; if (!Object.keys(TL.hu[h]).length) delete TL.hu[h]; } ve(); };
  window[NS + 'HuHuy'] = function () { TL.hu = JSON.parse(JSON.stringify((TL.d.cfg || {}).hu || {})); ve(); };
  window[NS + 'HuyMon'] = function () { delete TL.sua[TL.sel]; ve(); };
  function ghi(body, ok) {
    if (TL.ban) { toast('⏳ Đang gửi lệnh trước, đợi chút'); return Promise.resolve(); }
    TL.ban = true;
    return api('/api/gm/trunglau', body).then(function (j) {
      TL.ban = false; TL.d = j.data || TL.d;
      if (body.op === 'hu') TL.hu = JSON.parse(JSON.stringify((TL.d.cfg || {}).hu || {}));   // lenh khac: giu o hieu ung dang sua do
      toast('✅ ' + (j.msg || 'Đã lưu')); if (ok) ok(); ve();
    }).catch(function (er) { TL.ban = false; loi(er); });
  }
  window[NS + 'LuuMon'] = function () {
    var s = nhap(TL.sel), dong = [], diem = {};
    Object.keys(s.on).forEach(function (k) { if (s.on[k]) { dong.push(Number(k)); if (s.diem[k] > 0) diem[k] = s.diem[k]; } });
    if (!dong.length) return toast('❌ Chưa chọn dòng nào');
    var id = TL.sel, body = { op: 'mon', id: id, dong: dong, diem: diem };
    if (s.so && !(s.so[0] === dong.length && s.so[1] === dong.length)) body.so = s.so;   // 09/10: so dong ra moi lan tao
    ghi(body, function () { delete TL.sua[id]; });
  };
  // 09/10: o "so dong ra" (i = 0 tu / 1 den; -1 = bo, ra du moi dong tick)
  window[NS + 'So'] = function (i, v) {
    var s = nhap(TL.sel);
    if (i < 0) { s.so = null; return ve(); }
    var nOn = nOnCua(s), sr = s.so || [nOn, nOn]; sr[i] = Math.max(0, Math.floor(Number(v) || 0)); s.so = sr;
    dat(NS + 'SoNote', soNote(mon(TL.sel), s)); veNho();
  };
  window[NS + 'BoMon'] = function () {
    var id = TL.sel;
    hoi('Trả mã ' + id + ' (' + tenDai(id) + ') về gốc? Xóa cấu hình riêng (dòng, điểm, số dòng ra) của mã này. Hiệu ứng thần khí không đổi. Có hiệu lực sau restart.', '↩ Trả về gốc')
      .then(function (ok) { if (ok) ghi({ op: 'xoa', id: id }, function () { delete TL.sua[id]; }); });
  };
  window[NS + 'LuuHu'] = function () {
    var hu = {}; Object.keys(TL.hu).forEach(function (h) { var t = TL.hu[h], o = {}; Object.keys(t).forEach(function (k) { if (t[k] != null) o[k] = t[k]; }); if (Object.keys(o).length) hu[h] = o; });
    ghi({ op: 'hu', hu: hu });
  };
  window[NS + 'Chep'] = function () {
    var id = TL.sel, m = mon(id); if (!m || !m.chanDich) return;
    if (chuaLuu(id)) return toast('❌ Mã ' + id + ' đang có thay đổi chưa lưu: lưu hoặc hủy trước rồi mới chép');
    var dich = m.chanDich, nhapDich = chuaLuu(dich);
    hoi('Chép ' + m.dong.length + ' dòng đang lưu của ' + id + ' (' + tenDai(id) + ') sang Chân ' + dich + '? Đè cấu hình Chân hiện tại (công thuộc tính +50, dòng khác ×1,3).' +
      (nhapDich ? ' Nháp chưa lưu của ' + dich + ' sẽ bị bỏ.' : '') + ' Có hiệu lực sau restart.', '📋 Chép đè Chân')
      .then(function (ok) { if (ok) ghi({ op: 'chep', id: id }, function () { delete TL.sua[dich]; }); });
  };
  window[NS + 'Giong'] = function () {
    var id = TL.sel, m = mon(id); if (!m || !m.giong) return;
    if (chuaLuu(id)) return toast('❌ Mã ' + id + ' đang có thay đổi chưa lưu: lưu hoặc hủy trước rồi mới chép');
    var dich = m.giong;
    hoi('Chép giống hệt ' + id + ' sang ' + dich + ' (' + tenDai(dich) + ')? Đè dòng, điểm, số dòng ra của ' + dich + '. Hiệu ứng thần khí giữ riêng. Có hiệu lực sau restart.', '📋 Chép đè')
      .then(function (ok) { if (ok) ghi({ op: 'giong', id: id }, function () { delete TL.sua[dich]; }); });
  };
  window[NS + 'Tra'] = function () {
    // 09/10: tra ve goc CHI ma cua muc nay (lenh co san 'xoa' tung ma; Trung Lau them 'hu' rong = bo hieu ung) - khong dung cau hinh muc kia
    var cm = (TL.d.cfg || {}).mon || {}, buoc = IDS.filter(function (i) { return cm[i]; }).map(function (i) { return { op: 'xoa', id: i }; });
    var coHu = CFG.coHu && Object.keys((TL.d.cfg || {}).hu || {}).length;
    if (coHu) buoc.push({ op: 'hu', hu: {} });
    if (!buoc.length) return toast('Không có gì để trả về gốc: mọi ' + CFG.ten + ' đang đúng bản gốc');
    hoi('Trả TẤT CẢ ' + CFG.ten + ' về gốc? Xóa cấu hình riêng của ' + (buoc.length - (coHu ? 1 : 0)) + ' mã' + (coHu ? ' và mọi hiệu ứng đã chỉnh' : '') + '. Không hoàn tác được. Có hiệu lực sau restart.', '♻️ Trả tất cả về gốc')
      .then(function (ok) {
        if (!ok) return;
        buoc.reduce(function (pr, b) { return pr.then(function () { return api('/api/gm/trunglau', b); }); }, Promise.resolve())
          .then(function () { TL.sua = {}; toast('✅ Đã trả ' + CFG.ten + ' về gốc (' + buoc.length + ' bước). Có hiệu lực sau restart.'); return nap(); }).catch(function (er) { loi(er); nap(); });
      });
  };
  window[NS + 'Restart'] = function () {
    var ds = dsNhap(), hd = huDoi().length;
    hoi('Restart game ngay? ' + so(TL.online) + ' người đang online sẽ bị ngắt (~3 phút). Cấu hình đã lưu sẽ có hiệu lực sau restart.' +
      (ds.length || hd ? ' Lưu ý: còn ' + (ds.length ? ds.length + ' mã nháp' : '') + (ds.length && hd ? ' và ' : '') + (hd ? hd + ' ô hiệu ứng' : '') + ' CHƯA LƯU, sẽ không được áp.' : ''), '🔁 Restart game')
      .then(function (ok) { if (ok) ghi({ op: 'restart' }); });
  };
  window[NS + 'Giu'] = function () {
    api('/api/gm/trunglau', { op: 'giu' }).then(function (j) { TL.giu = (j.giu || []).filter(function (g) { return IDS.indexOf(g.id) >= 0; }); TL.giuLoi = ''; ve(); toast('👥 ' + TL.giu.length + ' món ' + CFG.ten + ' đang có người giữ'); cuon(); })
      .catch(function (er) { TL.giuLoi = (er && er.message) || String(er); TL.giu = null; ve(); cuon(); });
  };
  function cuon() { var b = el(NS + 'GiuBox'); if (b && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  window[NS + 'GiuAn'] = function () { TL.giu = null; TL.giuLoi = ''; ve(); };
  window[NS + 'ChiMa'] = function (on) { TL.chiMa = on; dat(NS + 'GiuBox', veGiu()); };
  return NHOM_TL;
  }
  // Muc Trung Lau (khung tlBox co san trong panel.js)
  lap('tl', 'tlBox', { ten: 'Trùng Lâu', sel: '10553102', coHu: true, nhom: [] });
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
