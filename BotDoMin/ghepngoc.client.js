// 💎 05/10: giao diện người chơi Ghép Ngọc (phục vụ ở /gn.js). Dùng hàm chung của trang: api, toast, esc, vnd, vqIcon, (setBal).
// Vẽ vào phần tử #gnApp. Gọi gnSync() khi mở trang.
(function () {
  var GN = { s: null, vao: {}, dich: '', knb: 0, busy: false, chon: '', loc: '' };
  var css = [
    '#gnApp{--gnA:#8b5cf6;--gnB:#f5c542}',
    '.gnTop{display:grid;grid-template-columns:1fr 260px 1fr;gap:14px;align-items:stretch}',
    '@media (max-width:760px){.gnTop{grid-template-columns:1fr}}',
    '.gnBox{background:#151826;border:1px solid var(--line);border-radius:14px;padding:12px;min-height:220px;display:flex;flex-direction:column}',
    '.gnBox h4{margin:0 0 8px;font-size:14px;color:var(--muted);letter-spacing:.5px}',
    '.gnSum{margin-top:auto;padding-top:8px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;font-weight:800}',
    '.gnRow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #ffffff0d}',
    '.gnRow .n{flex:1;min-width:0;font-size:13px;line-height:1.25}.gnRow .n small{color:var(--muted)}',
    '.gnRow input{width:58px;padding:3px 4px;text-align:center}',
    '.gnRow button{padding:2px 8px;font-size:12px}',
    '.gnTgt{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:6px;text-align:center}',
    '.gnTgt .big{width:72px;height:72px}',
    '.gnRing{position:relative;display:flex;align-items:center;justify-content:center}',
    '.gnRing svg{width:240px;height:240px;max-width:100%}',
    '.gnNeedle{transform-origin:120px 120px;transition:transform 7.6s cubic-bezier(.08,.55,.06,1)}',
    '.gnMid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}',
    '.gnPct{font-size:34px;font-weight:900;letter-spacing:.5px}',
    '.gnRisk{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}',
    '.gnRing.thang svg circle.arc{stroke:#3ddc84;filter:drop-shadow(0 0 8px #3ddc84)}',
    '.gnRing.thua svg circle.arc{stroke:#ff5d5d}',
    '.gnGo{margin-top:12px;width:100%;padding:12px;font-size:16px;font-weight:900;background:linear-gradient(180deg,#8b5cf6,#6d3fe0);border:0;color:#fff;border-radius:12px}',
    '.gnGo:disabled{opacity:.45}',
    '.gnPick{margin-top:14px}',
    '.gnTabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '.gnTabs button.on{border-color:var(--gold);color:var(--tx)}',
    '.gnGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;max-height:360px;overflow:auto}',
    '.gnCard{background:#1a1f2d;border:1px solid var(--line);border-radius:10px;padding:8px;display:flex;gap:8px;align-items:center;cursor:pointer;font-size:12px}',
    '.gnCard:hover{border-color:var(--gnA)}.gnCard.on{border-color:var(--gnB);box-shadow:0 0 0 1px var(--gnB)}',
    '.gnCard b{display:block;font-size:12px}.gnCard small{color:var(--muted)}',
    '.gnMul{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;justify-content:center}.gnMul button{padding:3px 9px;font-size:12px}',
    '.gnLich div{font-size:12px;padding:3px 0;border-bottom:1px solid #ffffff0d}',
    '.gnW{color:#3ddc84;font-weight:800}.gnL{color:#ff5d5d;font-weight:800}',
  ].join('');
  function ic(x, cls) { return typeof vqIcon === 'function' ? vqIcon(x && x.ic, cls) : ''; }
  function S() { return GN.s; }
  function giaVao(id) { var r = (S().ruong || []).find(function (x) { return x.id === id; }); return r ? r.gia : 0; }
  function tong() { var t = GN.knb || 0; Object.keys(GN.vao).forEach(function (id) { t += giaVao(id) * GN.vao[id]; }); return t; }
  function soMon() { return Object.keys(GN.vao).reduce(function (t, id) { return t + GN.vao[id]; }, 0); }
  function dichObj() { return (S().dich || []).find(function (x) { return x.id === GN.dich; }) || null; }
  function tiLeTho() { var d = dichObj(); return d && d.gia > 0 ? tong() / d.gia * (100 - S().phi) : 0; }
  function tiLe() { return Math.min(S().tiMax, tiLeTho()); }
  function risk(p) { return p <= 0 ? 'chưa có gì' : p < 10 ? 'rủi ro rất cao' : p < 30 ? 'rủi ro cao' : p < 55 ? 'cân bằng' : 'khá an toàn'; }
  function hopLe() {
    var s = S(), p = tiLeTho(); if (!s.on || !dichObj() || (!soMon() && !GN.knb)) return '';
    if (s.luotNgay > 0 && s.luotHomNay >= s.luotNgay) return 'Hôm nay đã hết lượt';
    if (soMon() > s.monMax) return 'Tối đa ' + s.monMax + ' món/lần';
    if (p > s.tiMax + 1e-9) return 'Bỏ dư - tối đa ' + s.tiMax + '%, bớt đồ ra';
    if (p < s.tiMin) return 'Tối thiểu ' + s.tiMin + '%, bỏ thêm đồ';
    return 'ok';
  }
  var R = 96, CX = 120, CIR = 2 * Math.PI * R, QUAY_MS = 7600;
  function diem(p) { var g = (p / 100) * 2 * Math.PI - Math.PI / 2; return [CX + R * Math.cos(g), CX + R * Math.sin(g)]; }
  function ringSvg(p) {
    var w = Math.max(0, Math.min(100, p)) / 100 * CIR, k = diem(p), vach = '';
    [25, 50, 75].forEach(function (v) { var q = diem(v), q2 = [CX + (R - 16) * Math.cos((v / 100) * 2 * Math.PI - Math.PI / 2), CX + (R - 16) * Math.sin((v / 100) * 2 * Math.PI - Math.PI / 2)]; vach += '<text x="' + q2[0].toFixed(1) + '" y="' + (q2[1] + 3).toFixed(1) + '" fill="#6b6f86" font-size="9" text-anchor="middle">' + v + '%</text>'; });
    return '<svg viewBox="0 0 240 240" id="gnSvg" style="touch-action:none;cursor:grab"><defs><linearGradient id="gnG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d4d"/><stop offset=".45" stop-color="#f5c542"/><stop offset="1" stop-color="#3ddc84"/></linearGradient></defs>'
      + '<circle cx="120" cy="120" r="112" fill="#11131f" stroke="#262a3d" stroke-width="2"/>'
      + '<circle cx="120" cy="120" r="' + R + '" fill="none" stroke="url(#gnG)" stroke-opacity=".18" stroke-width="16"/>'
      + '<circle class="arc" id="gnArc" cx="120" cy="120" r="' + R + '" fill="none" stroke="url(#gnG)" stroke-width="16" stroke-dasharray="' + w.toFixed(2) + ' ' + CIR.toFixed(2) + '" transform="rotate(-90 120 120)"/>'
      + vach
      + '<circle id="gnKnob" cx="' + k[0].toFixed(1) + '" cy="' + k[1].toFixed(1) + '" r="10" fill="#fff" stroke="#f5c542" stroke-width="4" style="cursor:grab"/>'
      + '<g class="gnNeedle" id="gnNeedle" style="transform:rotate(' + (GN.goc || 0) + 'deg)"><polygon points="120,14 113,34 127,34" fill="#ffcf5c"/></g></svg>';
  }
  // cap nhat vong khi dang keo (khong ve lai ca trang)
  function capNhatVong(p) {
    var arc = document.getElementById('gnArc'), kn = document.getElementById('gnKnob'), pc = document.querySelector('#gnApp .gnPct'), rk = document.querySelector('#gnApp .gnRisk');
    if (arc) arc.setAttribute('stroke-dasharray', (Math.max(0, Math.min(100, p)) / 100 * CIR).toFixed(2) + ' ' + CIR.toFixed(2));
    if (kn) { var k = diem(p); kn.setAttribute('cx', k[0].toFixed(1)); kn.setAttribute('cy', k[1].toFixed(1)); }
    if (pc) pc.textContent = (Math.round(p * 1000) / 1000) + '%';
    if (rk) rk.textContent = 'cơ hội · ' + risk(p);
  }
  // tu bo do trong ruong cho du ti le muon: uu tien RAC truoc, roi tu mon gia cao xuong (khong vuot), cuoi cung them 1 mon nho nhat cho du
  function tuBo(pMuon) {
    var s = S(), d = dichObj(); if (!d) return;
    var can = pMuon / (100 - s.phi) * d.gia - (GN.knb || 0), vao = {}, con = s.monMax, dung = 0;
    var ds = (s.ruong || []).filter(function (x) { return x.id !== d.id; }).slice().sort(function (a, b) { var ra = /^rác/.test(a.tu) ? 0 : 1, rb = /^rác/.test(b.tu) ? 0 : 1; return ra - rb || b.gia - a.gia; });
    ds.forEach(function (x) { if (dung >= can || con <= 0) return; var n = Math.min(x.qty, con, Math.floor((can - dung) / x.gia)); if (n > 0) { vao[x.id] = n; dung += n * x.gia; con -= n; } });
    if (dung < can && con > 0) { var nho = null; ds.forEach(function (x) { if ((vao[x.id] || 0) < x.qty && (!nho || x.gia < nho.gia)) nho = x; }); if (nho) { vao[nho.id] = (vao[nho.id] || 0) + 1; dung += nho.gia; } }
    GN.vao = vao;
  }
  function gocToP(ev) {
    var sv = document.getElementById('gnSvg'); if (!sv) return 0;
    var r = sv.getBoundingClientRect(), x = ev.clientX - (r.left + r.width / 2), y = ev.clientY - (r.top + r.height / 2);
    var g = Math.atan2(y, x) + Math.PI / 2; if (g < 0) g += 2 * Math.PI;
    return g / (2 * Math.PI) * 100;
  }
  function ganKeo() {
    var sv = document.getElementById('gnSvg'); if (!sv || GN.busy) return;
    var keo = false, last = 0;
    var mv = function (ev) {
      if (!keo) return;
      var p = gocToP(ev);
      if (last > 80 && p < 20) p = 100; else if (last < 20 && p > 80) p = 0;   // khong cho nhay qua dinh
      last = p;
      var s = S(); p = Math.max(s.tiMin, Math.min(s.tiMax, p));
      tuBo(p); GN.kq = null; capNhatVong(tiLe());
    };
    sv.addEventListener('pointerdown', function (ev) {
      if (!dichObj()) { toast('⚠️ Chọn món đích trước rồi kéo vòng'); return; }
      keo = true; last = tiLe(); sv.setPointerCapture(ev.pointerId); sv.style.cursor = 'grabbing'; mv(ev);
    });
    sv.addEventListener('pointermove', mv);
    var het = function () { if (!keo) return; keo = false; sv.style.cursor = 'grab'; ve(); };
    sv.addEventListener('pointerup', het); sv.addEventListener('pointercancel', het);
  }
  function ve() {
    var el = document.getElementById('gnApp'); if (!el || !S()) return;
    var s = S();
    if (!document.getElementById('gnCss')) { var st = document.createElement('style'); st.id = 'gnCss'; st.textContent = css; document.head.appendChild(st); }
    if (!s.on) { el.innerHTML = '<div class="muted" style="padding:18px">💎 Ghép Ngọc đang tạm tắt - admin sẽ mở sớm.</div>'; return; }
    var p = tiLe(), d = dichObj(), ok = hopLe(), h = '';
    h += '<div class="gnTop">';
    // ---- bỏ vào
    h += '<div class="gnBox"><h4>🧰 BỎ VÀO (' + soMon() + '/' + s.monMax + ' món)</h4>';
    var ids = Object.keys(GN.vao);
    if (!ids.length && !GN.knb) h += '<div class="muted" style="font-size:13px">Chọn đồ trong rương ở bên dưới (tab 🧰 Rương). Đồ bỏ vào sẽ <b>mất</b> dù thắng hay thua.</div>';
    ids.forEach(function (id) {
      var r = (s.ruong || []).find(function (x) { return x.id === id; }); if (!r) return;
      h += '<div class="gnRow">' + ic(r, 'vqIcS') + '<div class="n">' + esc(r.ten) + '<br><small>' + vnd(r.gia) + ' / cái · có ' + r.qty + '</small></div>'
        + '<input type="number" min="1" max="' + r.qty + '" value="' + GN.vao[id] + '" onchange="gnSl(\'' + id + '\',this.value)"><button onclick="gnBo(\'' + id + '\')">✕</button></div>';
    });
    if (s.knbOn) h += '<div class="gnRow"><div class="n">💰 Thêm KNB web<br><small>tối đa ' + vnd(s.knbMax) + ' · ví ' + vnd(s.balance) + '</small></div><input style="width:90px" type="number" min="0" value="' + (GN.knb || 0) + '" onchange="gnKnb(this.value)"></div>';
    h += '<div class="gnSum"><span>Tổng giá trị</span><span>' + vnd(tong()) + '</span></div>';
    if (ids.length) h += '<button style="margin-top:6px" onclick="gnXoaHet()">🗑 Bỏ hết ra</button>';
    h += '</div>';
    // ---- vòng
    h += '<div class="gnBox" style="align-items:center"><div class="gnRing' + (GN.kq ? (GN.kq.thang ? ' thang' : ' thua') : '') + '" id="gnRing">' + ringSvg(p)
      + '<div class="gnMid"><div class="gnPct">' + (Math.round(p * 1000) / 1000) + '%</div><div class="gnRisk">' + (GN.kq ? (GN.kq.thang ? '🎉 THÀNH CÔNG' : '💥 THẤT BẠI') + ' · tung ' + GN.kq.roll : 'cơ hội · ' + risk(p)) + '</div></div></div>'
      + '<div class="muted" style="font-size:12px;text-align:center">Phí ' + s.phi + '% · tỉ lệ ' + s.tiMin + '–' + s.tiMax + '%' + (s.luotNgay ? ' · hôm nay ' + s.luotHomNay + '/' + s.luotNgay : '') + '</div>'
      + '<button class="gnGo" ' + (ok === 'ok' && !GN.busy ? '' : 'disabled') + ' onclick="gnQuay()">💎 LUYỆN</button>'
      + (ok && ok !== 'ok' ? '<div style="font-size:12px;color:#ffb4a8;margin-top:6px;text-align:center">' + esc(ok) + '</div>' : '') + '</div>';
    // ---- đích
    h += '<div class="gnBox"><h4>🎯 MÓN MUỐN LUYỆN RA</h4>';
    if (d) h += '<div class="gnTgt">' + ic(d, 'vqIc big') + '<b>' + esc(d.ten) + '</b><span class="muted">giá trị ' + vnd(d.gia) + '</span></div>';
    else h += '<div class="gnTgt muted" style="font-size:13px">Chọn món ở tab 🎯 Món đích bên dưới</div>';
    h += '<div class="gnMul">' + [1.5, 2, 5, 10, 20].map(function (m) { return '<button onclick="gnNhan(' + m + ')" title="Chọn món đích có giá trị gần ' + m + ' lần đồ đang bỏ vào">' + m + 'x</button>'; }).join('') + '</div>'
      + '<div class="gnMul">' + [35, 55, 75].filter(function (v) { return v <= s.tiMax; }).map(function (v) { return '<button onclick="gnPct(' + v + ')" title="Tự bỏ đồ trong rương cho đủ ' + v + '%">' + v + '%</button>'; }).join('') + '</div>'
      + '<div class="muted" style="font-size:11px;text-align:center;margin-top:4px">Kéo tay nắm trên vòng để chọn % - tự bỏ đồ (rác trước)</div></div>';
    h += '</div>';
    // ---- chọn
    var tab = GN.chon || 'ruong';
    h += '<div class="gnPick"><div class="gnTabs"><button class="' + (tab === 'ruong' ? 'on' : '') + '" onclick="gnTab(\'ruong\')">🧰 Rương (' + (s.ruong || []).length + ' loại dùng được)</button>'
      + '<button class="' + (tab === 'dich' ? 'on' : '') + '" onclick="gnTab(\'dich\')">🎯 Món đích (' + (s.dich || []).length + ')</button>'
      + '<button class="' + (tab === 'lich' ? 'on' : '') + '" onclick="gnTab(\'lich\')">📜 Lịch sử</button>'
      + '<input placeholder="🔎 lọc tên..." value="' + esc(GN.loc) + '" oninput="gnLoc(this.value)" style="flex:1;min-width:140px"></div>';
    var loc = (GN.loc || '').toLowerCase(), khop = function (x) { return !loc || x.ten.toLowerCase().indexOf(loc) >= 0 || x.id.indexOf(loc) >= 0; };
    if (tab === 'ruong') {
      var r = (s.ruong || []).filter(khop);
      h += r.length ? '<div class="gnGrid">' + r.map(function (x) { var dung = GN.vao[x.id] || 0; return '<div class="gnCard' + (dung ? ' on' : '') + '" onclick="gnThem(\'' + x.id + '\')">' + ic(x, 'vqIcS') + '<div><b>' + esc(x.ten) + '</b><small>' + vnd(x.gia) + '/cái · ' + esc(x.tu) + '<br>có ' + x.qty + (dung ? ' · đã bỏ ' + dung : '') + '</small></div></div>'; }).join('') + '</div>'
        : '<div class="muted" style="font-size:13px">Rương không có món nào dùng để ghép được.</div>';
    } else if (tab === 'dich') {
      var dd = (s.dich || []).filter(khop);
      h += '<div class="gnGrid">' + dd.map(function (x) { return '<div class="gnCard' + (x.id === GN.dich ? ' on' : '') + '" onclick="gnDich(\'' + x.id + '\')">' + ic(x, 'vqIcS') + '<div><b>' + esc(x.ten) + '</b><small>giá trị ' + vnd(x.gia) + '</small></div></div>'; }).join('') + '</div>';
    } else {
      var L = s.lich || [];
      var tenDich = function (id) { var x = (s.dich || []).find(function (y) { return y.id === id; }); return x ? x.ten : '#' + id; };
      h += '<div class="gnLich">' + (L.length ? L.map(function (x) { return '<div>' + new Date(x.t).toLocaleString('vi-VN') + ' · <span class="' + (x.thang ? 'gnW">THẮNG' : 'gnL">thua') + '</span> ' + esc(tenDich(x.dich)) + ' · ' + x.tiLe + '% (tung ' + x.roll + ') · bỏ ' + vnd(x.tong) + '</div>'; }).join('') : '<div class="muted">Chưa luyện lần nào.</div>') + '</div>';
    }
    h += '</div>';
    el.innerHTML = h;
    ganKeo();
  }
  function chuanHoa() { var s = S(); Object.keys(GN.vao).forEach(function (id) { var r = (s.ruong || []).find(function (x) { return x.id === id; }); if (!r) delete GN.vao[id]; else GN.vao[id] = Math.max(1, Math.min(r.qty, GN.vao[id])); }); if (GN.dich && !dichObj()) GN.dich = ''; }
  window.gnSync = function () { api('/api/gn/state', {}).then(function (j) { GN.s = j; GN.kq = null; chuanHoa(); ve(); }).catch(function (e) { toast('❌ ' + e.message); }); };
  window.gnTab = function (t) { GN.chon = t; ve(); };
  window.gnLoc = function (v) { GN.loc = v; ve(); var i = document.querySelector('#gnApp .gnTabs input'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } };
  window.gnThem = function (id) { var r = S().ruong.find(function (x) { return x.id === id; }); if (!r) return; var c = GN.vao[id] || 0; if (c >= r.qty) return toast('⚠️ Rương chỉ có ' + r.qty); GN.vao[id] = c + 1; GN.kq = null; ve(); };
  window.gnSl = function (id, v) { v = Math.floor(Number(v) || 0); if (v <= 0) delete GN.vao[id]; else GN.vao[id] = v; chuanHoa(); GN.kq = null; ve(); };
  window.gnBo = function (id) { delete GN.vao[id]; GN.kq = null; ve(); };
  window.gnXoaHet = function () { GN.vao = {}; GN.kq = null; ve(); };
  window.gnKnb = function (v) { GN.knb = Math.max(0, Math.min(S().knbMax, Math.floor(Number(v) || 0))); GN.kq = null; ve(); };
  window.gnDich = function (id) { GN.dich = id; GN.kq = null; ve(); };
  window.gnNhan = function (m) {
    var t = tong(); if (!t) return toast('⚠️ Bỏ đồ vào trước rồi chọn mức nhân');
    var muc = t * m, best = null;
    (S().dich || []).forEach(function (x) { if (!best || Math.abs(x.gia - muc) < Math.abs(best.gia - muc)) best = x; });
    if (best) { GN.dich = best.id; GN.kq = null; ve(); }
  };
  window.gnPct = function (v) { if (!dichObj()) return toast('⚠️ Chọn món đích trước'); tuBo(v); GN.kq = null; ve(); };
  window.gnQuay = function () {
    if (GN.busy || hopLe() !== 'ok') return;
    var d = dichObj(), vao = Object.keys(GN.vao).map(function (id) { return { id: id, sl: GN.vao[id] }; });
    GN.busy = true; GN.kq = null; ve();
    api('/api/gn/quay', { dich: GN.dich, vao: vao, knb: GN.knb || 0 }).then(function (j) {
      var base = Math.ceil((GN.goc || 0) / 360) * 360 + 360 * 9;
      GN.goc = base + j.roll * 3.6;
      var n = document.getElementById('gnNeedle'); if (n) n.style.transform = 'rotate(' + GN.goc + 'deg)';
      setTimeout(function () {
        GN.busy = false; GN.s = j; GN.kq = { thang: j.thang, roll: j.roll }; GN.vao = {}; GN.knb = 0; chuanHoa(); ve();
        if (typeof setBal === 'function' && j.balance !== undefined) setBal(j.balance);
        toast(j.thang ? '🎉 THÀNH CÔNG! Nhận ' + j.dich.ten + ' - đã vào 🧰 Rương Ích Kỷ' : '💥 Thất bại (' + j.tiLe + '%, tung ' + j.roll + ') - mất đồ đã bỏ vào');
      }, QUAY_MS + 200);
    }).catch(function (e) { GN.busy = false; ve(); toast('❌ ' + e.message); gnSync(); });
  };
})();
