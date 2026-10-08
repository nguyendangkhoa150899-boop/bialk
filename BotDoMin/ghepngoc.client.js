// 💎 05/10: giao diện người chơi Ghép Ngọc (phục vụ ở /gn.js). Dùng hàm chung của trang: api, toast, esc, vnd, vqIcon, (setBal).
// Vẽ vào phần tử #gnApp. Gọi gnSync() khi mở trang.
(function () {
  var GN = { s: null, vao: {}, dich: '', knb: 0, busy: false, chon: '', loc: '' };
  var css = [
    '#gnApp{--gnA:#8b5cf6;--gnB:#f5c542;container-type:inline-size}',
    '@media(min-width:900px){body.gnWide{max-width:1180px}}',
    // nut + o nhap RIENG (trang choi co button{color:#fff;padding:12px} + input{width:100%} chung -> de len)
    '#gnApp button{background:#232838;color:var(--tx);border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:13px;font-weight:700;line-height:1.2;cursor:pointer}',
    '#gnApp button:hover{border-color:var(--gnB)}#gnApp button:disabled{opacity:.45;cursor:not-allowed}',
    '#gnApp input{width:auto;margin:0;padding:6px 8px;font-size:14px;border-radius:8px;background:#10131b;color:var(--tx);border:1px solid var(--line)}',
    '.gnTop{display:grid;grid-template-columns:minmax(0,1fr) 280px minmax(0,1fr);gap:14px;align-items:stretch}',
    '.gnRingBox{align-items:center}',
    '@container (max-width:780px){.gnTop{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.gnRingBox{grid-column:1 / -1;order:-1}}',
    '@container (max-width:430px){.gnTop{grid-template-columns:minmax(0,1fr)}}',
    '.gnBox{background:#151826;border:1px solid var(--line);border-radius:14px;padding:12px;min-height:220px;display:flex;flex-direction:column}',
    '.gnBox h4{margin:0 0 8px;font-size:14px;color:var(--muted);letter-spacing:.5px}',
    '.gnSum{margin-top:auto;padding-top:8px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;font-weight:800}',
    '.gnRow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #ffffff0d}',
    // 💰 05/10: khung KNB web nổi bật
    '.gnKnb{margin:2px 0 8px;padding:9px 10px;border:1px solid #c9a227;border-radius:10px;background:linear-gradient(180deg,#3a2e0e,#241c08)}',
    '.gnKnbT{font-weight:900;font-size:15px;color:#ffe08a}.gnKnbT small{display:block;font-weight:600;font-size:12px;color:#d8c68a;margin-top:2px}.gnKnbT small b{color:#fff}',
    '.gnKnbR{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}',
    '#gnApp .gnKnbR input{flex:1 1 90px;min-width:80px;padding:7px 8px;font-size:16px;font-weight:900;text-align:right;background:#0f1218;border:1px solid #c9a227;color:#ffe08a;border-radius:8px}',
    '#gnApp .gnKnbR button{padding:6px 10px;font-size:13px;font-weight:800;border-radius:8px;background:#4a3a10;color:#fff3c4;border:1px solid #c9a227}',
    '.gnRow .n{flex:1;min-width:0;font-size:13px;line-height:1.25}.gnRow .n small{color:var(--muted)}',
    '#gnApp .gnRow input{width:58px;padding:3px 4px;text-align:center}',
    '#gnApp .gnRow button{padding:3px 8px;font-size:12px}',
    '.gnTgt{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:6px;text-align:center}',
    '.gnTgt .big{width:72px;height:72px}',
    '.gnCap.ok{color:#7ee2a8}.gnTgt .gnCap.ok{border-color:#2f6b46;background:#10201a}',
    '.gnCap{display:block;color:#ffb35c;font-weight:700}.gnTgt .gnCap{font-size:12px;padding:3px 8px;border:1px solid #6b4a1a;border-radius:8px;background:#241a0c}',   // 07/10: trứng pet cấp mang 95
    '.gnRing{position:relative;display:flex;align-items:center;justify-content:center}',
    '.gnRing svg{width:240px;height:240px;max-width:100%}',
    '.gnNeedle{transform-origin:120px 120px;transition:transform 7.6s cubic-bezier(.08,.55,.06,1)}',
    '.gnMid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}',
    '.gnPct{font-size:34px;font-weight:900;letter-spacing:.5px}',
    '.gnRisk{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}',
    '.gnRing.thang svg circle.arc{stroke:#3ddc84;filter:drop-shadow(0 0 8px #3ddc84)}',
    '.gnRing.thua svg circle.arc{stroke:#ff5d5d}',
    '#gnApp .gnGo{margin-top:12px;width:100%;max-width:300px;padding:12px;font-size:16px;font-weight:900;background:linear-gradient(180deg,#8b5cf6,#6d3fe0);border:0;color:#fff;border-radius:12px}',
    '.gnGo:disabled{opacity:.45}',
    '.gnPick{margin-top:14px}',
    '.gnTabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '#gnApp .gnTabs button{padding:8px 12px}#gnApp .gnTabs button.on{border-color:var(--gold);background:#2b2f40}',
    '#gnApp .gnTabs input{flex:1;min-width:140px}',
    '.gnGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;max-height:360px;overflow:auto}',
    '.gnCard{background:#1a1f2d;border:1px solid var(--line);border-radius:10px;padding:8px;display:flex;gap:8px;align-items:center;cursor:pointer;font-size:12px}',
    '.gnCard:hover{border-color:var(--gnA)}.gnCard.on{border-color:var(--gnB);box-shadow:0 0 0 1px var(--gnB)}',
    '.gnCard.het{opacity:.4;cursor:not-allowed}.gnCard b{display:block;font-size:12px}.gnCard small{color:var(--muted)}',
    // 08/10 (chủ server): thẻ Rương - số lượng thành nhãn nổi trên góc icon (×44 / đã bỏ 2/44), tên 2 dòng, giá + % tách dòng
    // 08/10 (lần 2, chủ server "làm giống game"): số lượng trắng viền đen NẰM TRONG góc dưới-phải ô icon như túi đồ TLBB; đang bỏ vào = dấu ✓N xanh góc trên-trái
    '.gnIcW{position:relative;flex:0 0 auto;line-height:0}',
    '.gnIcW .vqIcS{width:44px;height:44px;flex-basis:44px}',
    '.gnSl{position:absolute;right:3px;bottom:2px;color:#fff;font-weight:800;font-size:12.5px;line-height:1;pointer-events:none;font-variant-numeric:tabular-nums;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 3px #000}',
    '.gnDung{position:absolute;left:-6px;top:-6px;background:#3ddc84;color:#06210f;font-size:10.5px;font-weight:900;line-height:15px;border-radius:999px;padding:0 5px;border:2px solid #1a1f2d;pointer-events:none}',
    '.gnCard .gnTx{min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.gnCard .gnNm{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:800;font-size:12.5px;line-height:1.3}',
    '.gnCard .gnGia{color:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums}',
    '.gnCard .gnPt{color:#3ddc84;font-weight:900;font-size:13px;font-variant-numeric:tabular-nums}.gnCard .gnPt small{font-weight:600;font-size:11px}',
    // 08/10: chưa chọn món đích -> nhắc chọn để thấy % (mỗi thẻ hiện +?% mờ)
    '.gnHint{font-size:12.5px;color:#f0c35a;background:#2a2412;border:1px dashed #6b5a2e;border-radius:8px;padding:7px 10px;margin-bottom:8px}',
    '.gnCard .gnPt0{color:#6b7385;font-size:11.5px;font-weight:700}',
    '.gnMul{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;justify-content:center}#gnApp .gnMul button{padding:4px 10px;font-size:12px}',
    '.gnLich div{font-size:12px;padding:3px 0;border-bottom:1px solid #ffffff0d}',
    '.gnW{color:#3ddc84;font-weight:800}.gnL{color:#ff5d5d;font-weight:800}',
    // 05/10: khung ket qua giu nguyen sau khi quay (chup man hinh khoe)
    '.gnKq{margin-top:10px;width:100%;max-width:300px;border-radius:12px;padding:10px;text-align:center;font-size:13px;line-height:1.35}',
    '.gnKq.thang{background:linear-gradient(180deg,#14361f,#0f2418);border:1px solid #3ddc84;box-shadow:0 0 14px #3ddc8455}',
    '.gnKq.thua{background:#2a1416;border:1px solid #7a3434}',
    '.gnKq .t{font-size:20px;font-weight:900;letter-spacing:.5px}.gnKq.thang .t{color:#3ddc84}.gnKq.thua .t{color:#ff8a8a}',
    '.gnKq .m{display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;font-weight:800}',
    '.gnKq small{color:var(--muted)}',
    '.gnRow.da{opacity:.75}',
    // 🐾 08/10: xem mô hình 3D trân thú (bản thường + các đời biến dị)
    '#gnApp button.gn3d{margin-top:4px;padding:3px 8px;font-size:12px;border-color:#7c5cff;background:#241d45;color:#e3dbff}',
    '.gn3dM{position:fixed;inset:0;z-index:9999;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.gn3dBox{width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;background:#151826;border:1px solid var(--line);border-radius:14px;overflow:hidden}',
    '.gn3dHd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}.gn3dHd b{flex:1;font-size:15px;color:var(--tx)}',
    '.gn3dHd small{color:var(--muted);font-weight:600}',
    '.gn3dM button{background:#232838;color:var(--tx);border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer}',
    '.gn3dCv{position:relative;height:min(62vh,500px);background:radial-gradient(circle at 50% 40%,#252c42,#10131b)}',
    '.gn3dCv canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}',
    '.gn3dLd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;pointer-events:none}',
    '.gn3dChips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px}',
    '.gn3dM .gn3dChips button{padding:5px 10px;font-size:12px}.gn3dM .gn3dChips button.on{border-color:#f5c542;background:#3a2e0e;color:#ffe08a}',
    '.gn3dNote{padding:0 12px 10px;color:var(--muted);font-size:11px}',
  ].join('');
  function ic(x, cls) { return typeof vqIcon === 'function' ? vqIcon(x && x.ic, cls) : ''; }
  // ===== 🐾 08/10: XEM 3D TRÂN THÚ - chỉ mục /pet3d/index.json (bot pet3d.js), three.js r128 tải lúc mở lần đầu =====
  // 1 cửa sổ WebGL + chip chọn bản (Thường / Đời 1..N) -> mỗi lần chỉ tải 1 bản (~100-300 KB), điện thoại nhẹ.
  var P3 = { idx: null, dang: false, v: null };
  function p3(id) { return P3.idx && P3.idx[id]; }
  function p3Nut(id, dai) { return p3(id) ? '<button class="gn3d" onclick="event.stopPropagation();gn3d(\'' + id + '\')">👁 ' + (dai ? 'Xem 3D ' + p3(id).so + ' bản' : '3D') + '</button>' : ''; }
  function p3Idx() {
    if (P3.idx || P3.dang) return; P3.dang = true;
    fetch('/pet3d/index.json').then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { P3.idx = j || {}; if (Object.keys(P3.idx).length && S()) ve(); }).catch(function () { P3.idx = {}; });
  }
  function nap(src) { return new Promise(function (ok, loi) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { loi(new Error('không tải được thư viện 3D')); }; document.head.appendChild(s); }); }
  var CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/';
  function napThree() {
    if (window.THREE && THREE.DDSLoader && THREE.OrbitControls) return Promise.resolve();
    return (window.THREE ? Promise.resolve() : nap(CDN + 'build/three.min.js')).then(function () { return Promise.all([nap(CDN + 'examples/js/loaders/DDSLoader.js'), nap(CDN + 'examples/js/controls/OrbitControls.js')]); });
  }
  // m<k>.bin = [u32 dài JSON][JSON {parts:[{nv,ni,i32,tex,alpha,o:{pos,nor,uv,idx}}]}][đệm 4][Float32/Uint16/Uint32]
  function docBin(ab) {
    var n = new DataView(ab).getUint32(0, true), js = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, n))), d0 = 4 + n + ((4 - ((4 + n) % 4)) % 4);
    js.parts.forEach(function (p) {
      p.pos = new Float32Array(ab, d0 + p.o.pos, p.nv * 3); p.nor = p.o.nor < 0 ? null : new Float32Array(ab, d0 + p.o.nor, p.nv * 3);
      p.uv = p.o.uv < 0 ? null : new Float32Array(ab, d0 + p.o.uv, p.nv * 2); p.idx = p.i32 ? new Uint32Array(ab, d0 + p.o.idx, p.ni) : new Uint16Array(ab, d0 + p.o.idx, p.ni);
    });
    return js;
  }
  function p3Dong() {
    var V = P3.v; P3.v = null; document.removeEventListener('keydown', p3Esc);
    if (V) {
      cancelAnimationFrame(V.raf); window.removeEventListener('resize', V.co);
      if (V.grp) V.grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      Object.keys(V.tex).forEach(function (k) { V.tex[k].dispose(); });
      if (V.ctl) V.ctl.dispose(); if (V.r) { V.r.dispose(); V.r.forceContextLoss(); }
    }
    var m = document.getElementById('gn3dM'); if (m) m.remove();
  }
  function p3Esc(e) { if (e.key === 'Escape') p3Dong(); }
  function p3Chon(k) {
    var V = P3.v; k = Math.floor(Number(k) || 0); if (!V || k < 1 || k > (p3(V.id) || {}).so) return; V.k = k;
    [].forEach.call(document.querySelectorAll('#gn3dM .gn3dChips button'), function (b, i) { b.classList.toggle('on', i + 1 === k); });
    var ld = document.querySelector('#gn3dM .gn3dLd'); ld.textContent = '⏳ Đang tải mô hình...'; ld.style.display = '';
    var lay = V.bin[k] ? Promise.resolve(V.bin[k]) : fetch('/pet3d/' + V.id + '/m' + k + '.bin').then(function (r) { if (!r.ok) throw new Error('thiếu mô hình'); return r.arrayBuffer(); });
    lay.then(function (ab) {
      if (P3.v !== V || V.k !== k) return; V.bin[k] = ab;
      var m = docBin(ab), grp = new THREE.Group(), box = new THREE.Box3();
      m.parts.forEach(function (p) {
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
        if (p.nor) g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 3)); if (p.uv) g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
        g.setIndex(new THREE.BufferAttribute(p.idx, 1)); if (!p.nor) g.computeVertexNormals();
        var opt = { side: THREE.DoubleSide, alphaTest: p.alpha ? 0.4 : 0 };
        if (p.tex) { if (!V.tex[p.tex]) { V.tex[p.tex] = V.dds.load('/pet3d/' + V.id + '/' + p.tex); V.tex[p.tex].flipY = false; } opt.map = V.tex[p.tex]; }
        grp.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial(opt))); g.computeBoundingBox(); box.union(g.boundingBox);
      });
      if (V.grp) { V.sc.remove(V.grp); V.grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      V.grp = grp; V.sc.add(grp);
      var c = new THREE.Vector3(); box.getCenter(c); var h = Math.max(box.max.y - box.min.y, (box.max.x - box.min.x) * 0.75, (box.max.z - box.min.z) * 0.75);
      V.ctl.target.copy(c); V.cam.position.set(c.x + h * 0.9, c.y + h * 0.3, c.z + h * 1.9); V.cam.near = h / 100; V.cam.far = h * 50; V.cam.updateProjectionMatrix(); V.ctl.update();
      ld.style.display = 'none';
    }).catch(function (e) { if (P3.v === V) ld.textContent = '❌ ' + e.message; });
  }
  window.gn3d = function (id) {
    var x = p3(id); if (!x) return; p3Dong();
    var d = (S().dich || []).find(function (y) { return y.id === id; }), ten = x.ten || (d && d.ten) || ('#' + id);
    var chips = ''; for (var k = 1; k <= x.so; k++) chips += '<button onclick="gn3dChon(' + k + ')">' + (k === 1 ? 'Bản thường' : '🧬 Đời ' + (k - 1)) + '</button>';
    var m = document.createElement('div'); m.id = 'gn3dM'; m.className = 'gn3dM';
    m.innerHTML = '<div class="gn3dBox"><div class="gn3dHd"><b>🐾 ' + esc(ten) + ' <small>· ' + x.so + ' bản ngoại hình</small></b><button onclick="gn3dDong()">✕</button></div>'
      + '<div class="gn3dCv"><canvas></canvas><div class="gn3dLd">⏳ Đang tải thư viện 3D...</div></div><div class="gn3dChips">' + chips + '</div>'
      + '<div class="gn3dNote">Kéo để xoay · lăn chuột / chụm 2 ngón để phóng to · mô hình gốc của game (tư thế đứng mặc định)</div></div>';
    m.addEventListener('click', function (e) { if (e.target === m) p3Dong(); });
    document.body.appendChild(m); document.addEventListener('keydown', p3Esc);
    napThree().then(function () {
      if (!document.getElementById('gn3dM')) return;
      var cv = m.querySelector('canvas'), V = { id: id, k: 1, bin: {}, tex: {}, grp: null };
      V.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); V.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      V.sc = new THREE.Scene(); V.sc.add(new THREE.AmbientLight(0xffffff, 0.75)); var dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(60, 120, 100); V.sc.add(dl);
      V.cam = new THREE.PerspectiveCamera(32, 1, 1, 4000); V.ctl = new THREE.OrbitControls(V.cam, cv);
      V.ctl.enableDamping = true; V.ctl.autoRotate = true; V.ctl.autoRotateSpeed = 1.5; V.ctl.enablePan = false;
      V.dds = new THREE.DDSLoader();
      V.co = function () { var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); };
      window.addEventListener('resize', V.co); V.co();
      P3.v = V; V.raf = requestAnimationFrame(function f() { if (P3.v !== V) return; V.ctl.update(); V.r.render(V.sc, V.cam); V.raf = requestAnimationFrame(f); });
      p3Chon(1);
    }).catch(function (e) { var ld = m.querySelector('.gn3dLd'); if (ld) ld.textContent = '❌ ' + e.message; });
  };
  window.gn3dChon = p3Chon;
  window.gn3dDong = p3Dong;
  // 07/10: ghi chú CẤP PET cho trứng trân thú làm món đích: cấp mang cố định (vd 95) hoặc ra pet theo cấp nhân vật
  // trứng / đản trân thú -> mục 🐾 Trân thú (trade pet)
  function laPet(x) { return !!(x && (x.canCap || x.kieu || /Thú Đản|Vật Đản|Lân Đản/.test(x.ten || ''))); }
  // 07/10 (chủ server): chỉ ghi KIỂU pet (Ngoại công / Nội công / Cân bằng) - trứng pet đẹp mặc định ra bản cấp mang 95, khỏi chú thích cấp
  function capNote(x, dai) {
    if (!x || !x.kieu) return '';
    var t = (x.kieu === 'Ngoại công' ? '⚔️ ' : x.kieu === 'Nội công' ? '🔮 ' : '⚖️ ') + x.kieu;
    // 07/10 tối: số đời biến dị (mỗi đời +500 cả 5 tư chất, tối đa +3500)
    if (x.doi) t += ' · 🧬 ' + x.doi + ' đời biến dị' + (dai ? ' (mỗi đời +500 cả 5 tư chất, tối đa +' + Math.min(500 * x.doi, 3500) + ')' : '');
    return dai ? '<span class="gnCap ok">' + t + '</span>' : '<small class="gnCap ok">' + t + '</small>';
  }
  function S() { return GN.s; }
  function giaVao(id) { var r = (S().ruong || []).find(function (x) { return x.id === id; }); return r ? r.gia : 0; }
  function tong() { var t = GN.knb || 0; Object.keys(GN.vao).forEach(function (id) { t += giaVao(id) * GN.vao[id]; }); return t; }
  function soMon() { return Object.keys(GN.vao).reduce(function (t, id) { return t + GN.vao[id]; }, 0); }
  function dichObj() { return (S().dich || []).find(function (x) { return x.id === GN.dich; }) || null; }
  function tiLeTho() { var d = dichObj(); return d && d.gia > 0 ? tong() / d.gia * (100 - S().phi) : 0; }
  function tiLe() { return Math.min(S().tiMax, tiLeTho()); }
  function duRoi() { return tiLeTho() >= S().tiMax - 1e-9; }
  function thua() {
    var d = dichObj(); if (!d) return false; var ids = Object.keys(GN.vao); if (!ids.length) return false;
    var re = Math.min.apply(null, ids.map(function (id) { return giaVao(id); }));
    return (tong() - re) / d.gia * (100 - S().phi) >= S().tiMax - 1e-9;
  }
  function risk(p) { return p <= 0 ? 'chưa có gì' : p < 10 ? 'rủi ro rất cao' : p < 30 ? 'rủi ro cao' : p < 55 ? 'cân bằng' : 'khá an toàn'; }
  function hopLe() {
    var s = S(), p = tiLeTho(); if (!s.on || !dichObj() || (!soMon() && !GN.knb)) return '';
    if (s.luotNgay > 0 && s.luotHomNay >= s.luotNgay) return 'Hôm nay đã hết lượt';
    if (soMon() > s.monMax) return 'Tối đa ' + s.monMax + ' món/lần';
    if (thua()) return 'Bỏ thừa - đã đủ ' + s.tiMax + '%, bớt đồ ra';
    if (p < s.tiMin) return 'Tối thiểu ' + s.tiMin + '%, bỏ thêm đồ';
    return 'ok';
  }
  var R = 96, CX = 120, CIR = 2 * Math.PI * R, QUAY_MS = 7600;
  function diem(p) { var g = (p / 100) * 2 * Math.PI - Math.PI / 2; return [CX + R * Math.cos(g), CX + R * Math.sin(g)]; }
  // VUNG TRUNG = cung dai p% bat dau o vi tri GN.lech (0..100, keo vong de xoay). So tung deu tren ca vong nen xoay khong doi ti le.
  function ringSvg(p) {
    var w = Math.max(0, Math.min(100, p)) / 100 * CIR, k = diem((GN.lech || 0) + p / 2), vach = '';
    for (var i = 0; i < 40; i++) { var g = i / 40 * 2 * Math.PI, r1 = R + 12, r2 = R + (i % 5 ? 15 : 18); vach += '<line x1="' + (CX + r1 * Math.sin(g)).toFixed(1) + '" y1="' + (CX - r1 * Math.cos(g)).toFixed(1) + '" x2="' + (CX + r2 * Math.sin(g)).toFixed(1) + '" y2="' + (CX - r2 * Math.cos(g)).toFixed(1) + '" stroke="#33384f" stroke-width="2"/>'; }
    return '<svg viewBox="0 0 240 240" id="gnSvg" style="touch-action:none;cursor:grab"><defs><linearGradient id="gnG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ddc84"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>'
      + '<circle cx="120" cy="120" r="116" fill="#11131f" stroke="#262a3d" stroke-width="2"/>' + vach
      + '<circle cx="120" cy="120" r="' + R + '" fill="none" stroke="#2a2440" stroke-width="16"/>'
      + '<circle class="arc" id="gnArc" cx="120" cy="120" r="' + R + '" fill="none" stroke="url(#gnG)" stroke-width="16" stroke-dasharray="' + w.toFixed(2) + ' ' + CIR.toFixed(2) + '" transform="rotate(' + (-90 + (GN.lech || 0) * 3.6).toFixed(2) + ' 120 120)"/>'
      + '<g class="gnNeedle" id="gnNeedle" style="transform:rotate(' + (GN.goc || 0) + 'deg)"><polygon points="120,6 112,26 128,26" fill="#ff4d6d" stroke="#fff" stroke-width="1.5"/></g></svg>';
  }
  // xoay vung trung khi dang keo (khong ve lai ca trang)
  function capNhatVong(p) {
    var arc = document.getElementById('gnArc'), kn = document.getElementById('gnKnob');
    if (arc) arc.setAttribute('transform', 'rotate(' + (-90 + (GN.lech || 0) * 3.6).toFixed(2) + ' 120 120)');
    if (kn) { var k = diem((GN.lech || 0) + p / 2); kn.setAttribute('cx', k[0].toFixed(1)); kn.setAttribute('cy', k[1].toFixed(1)); }
  }
  function tuBo(pMuon) {
    var s = S(), d = dichObj(); if (!d) return;
    var can = pMuon / (100 - s.phi) * d.gia - (GN.knb || 0), vao = {}, con = s.monMax, dung = 0;
    var ds = (s.ruong || []).filter(function (x) { return x.id !== d.id; }).slice().sort(function (a, b) { var ra = /^50\d/.test(a.id) ? 1 : 0, rb = /^50\d/.test(b.id) ? 1 : 0; return ra - rb || b.gia - a.gia; });
    ds.forEach(function (x) { if (dung >= can || con <= 0) return; var n = Math.min(x.qty, con, Math.floor((can - dung) / x.gia)); if (n > 0) { vao[x.id] = n; dung += n * x.gia; con -= n; } });
    if (dung < can && con > 0) { var nho = null; ds.forEach(function (x) { if ((vao[x.id] || 0) < x.qty && (!nho || x.gia < nho.gia)) nho = x; }); if (nho) { vao[nho.id] = (vao[nho.id] || 0) + 1; dung += nho.gia; } }
    GN.vao = vao;
    var ids = Object.keys(vao).sort(function (a, b) { return giaVao(b) - giaVao(a); });
    ids.forEach(function (id) { while (GN.vao[id] && thua()) { GN.vao[id]--; if (!GN.vao[id]) delete GN.vao[id]; } });
  }
  function gocToP(ev) {
    var sv = document.getElementById('gnSvg'); if (!sv) return 0;
    var r = sv.getBoundingClientRect(), x = ev.clientX - (r.left + r.width / 2), y = ev.clientY - (r.top + r.height / 2);
    var g = Math.atan2(y, x) + Math.PI / 2; if (g < 0) g += 2 * Math.PI;
    return g / (2 * Math.PI) * 100;
  }
  // keo bat cu cho nao tren vong -> xoay vung trung theo tay
  function ganKeo() {
    var sv = document.getElementById('gnSvg'); if (!sv || GN.busy) return;
    if (GN.kq && GN.kq.vao) { sv.style.cursor = 'default'; return; }   // 05/10: đang hiện kết quả -> đứng yên cho chụp màn hình
    var keo = false, a0 = 0, l0 = 0;
    var mv = function (ev) { if (!keo) return; GN.lech = ((l0 + gocToP(ev) - a0) % 100 + 100) % 100; capNhatVong(tiLe()); };
    sv.addEventListener('pointerdown', function (ev) { keo = true; a0 = gocToP(ev); l0 = GN.lech || 0; sv.setPointerCapture(ev.pointerId); sv.style.cursor = 'grabbing'; });
    sv.addEventListener('pointermove', mv);
    var het = function () { if (!keo) return; keo = false; sv.style.cursor = 'grab'; };
    sv.addEventListener('pointerup', het); sv.addEventListener('pointercancel', het);
  }
  function ve() {
    var el = document.getElementById('gnApp'); if (!el || !S()) return;
    var s = S();
    if (!document.getElementById('gnCss')) { var st = document.createElement('style'); st.id = 'gnCss'; st.textContent = css; document.head.appendChild(st); }
    if (!s.on) { el.innerHTML = '<div class="muted" style="padding:18px">💎 Ghép Ngọc đang tạm tắt - admin sẽ mở sớm.</div>'; return; }
    var p = GN.kq && GN.kq.vao ? GN.kq.p : tiLe(), d = dichObj(), ok = hopLe(), h = '';
    h += '<div class="gnTop">';
    // ---- bỏ vào
    h += '<div class="gnBox"><h4>🧰 BỎ VÀO (' + soMon() + '/' + s.monMax + ' món)</h4>';
    // 💰 05/10 (chủ server): KNB web thành khung riêng nổi bật ở đầu ô Bỏ vào, có nút bấm nhanh
    if (s.knbOn) {
      var kMax = Math.max(0, Math.min(s.knbMax, s.balance || 0)), dz = GN.busy ? ' disabled' : '';   // 07/10: khóa lúc kim đang quay
      h += '<div class="gnKnb"><div class="gnKnbT">💰 Thêm KNB web <small>tối đa ' + vnd(s.knbMax) + ' / lần · ví <b>' + vnd(s.balance) + '</b></small></div>'
        + '<div class="gnKnbR"><input type="number" min="0" max="' + kMax + '" value="' + (GN.knb || 0) + '" onchange="gnKnb(this.value)"' + dz + '>'
        + '<button onclick="gnKnb(' + ((GN.knb || 0) + 1000) + ')"' + dz + '>+1.000</button><button onclick="gnKnb(' + ((GN.knb || 0) + 5000) + ')"' + dz + '>+5.000</button>'
        + '<button onclick="gnKnb(' + kMax + ')"' + dz + '>Tối đa</button><button onclick="gnKnb(0)"' + dz + '>✕</button></div></div>';
    }
    var ids = Object.keys(GN.vao);
    var kq = GN.kq && GN.kq.vao ? GN.kq : null;   // 05/10: kết quả lượt vừa luyện (giữ tới khi người chơi đổi)
    if (kq && !ids.length && !GN.knb) {
      kq.vao.forEach(function (x) { h += '<div class="gnRow da">' + ic(x, 'vqIcS') + '<div class="n">' + esc(x.ten) + '<br><small>' + vnd(x.gia) + ' / cái · đã dùng</small></div><b>×' + x.sl + '</b></div>'; });
      if (kq.knb) h += '<div class="gnRow da"><div class="n">💰 KNB web</div><b>' + vnd(kq.knb) + '</b></div>';
    } else if (!ids.length && !GN.knb) h += '<div class="muted" style="font-size:13px">Chọn đồ trong rương ở bên dưới (tab 🧰 Rương). Đồ bỏ vào sẽ <b>mất</b> dù thắng hay thua.</div>';
    ids.forEach(function (id) {
      var r = (s.ruong || []).find(function (x) { return x.id === id; }); if (!r) return;
      h += '<div class="gnRow">' + ic(r, 'vqIcS') + '<div class="n">' + esc(r.ten) + '<br><small>' + vnd(r.gia) + ' / cái · có ' + r.qty + '</small></div>'
        + '<input type="number" min="1" max="' + r.qty + '" value="' + GN.vao[id] + '" onchange="gnSl(\'' + id + '\',this.value)"><button onclick="gnBo(\'' + id + '\')">✕</button></div>';
    });
    h += '<div class="gnSum"><span>Tổng giá trị</span><span>' + vnd(kq && !ids.length && !GN.knb ? kq.tong : tong()) + '</span></div>';
    if (ids.length) h += '<button style="margin-top:6px" onclick="gnXoaHet()">🗑 Bỏ hết ra</button>';
    h += '</div>';
    // ---- vòng
    h += '<div class="gnBox gnRingBox"><div class="gnRing' + (GN.kq ? (GN.kq.thang ? ' thang' : ' thua') : '') + '" id="gnRing">' + ringSvg(p)
      + '<div class="gnMid"><div class="gnPct">' + (Math.round(p * 1000) / 1000) + '%</div><div class="gnRisk">' + (GN.kq ? (GN.kq.thang ? '🎉 THÀNH CÔNG' : '💥 THẤT BẠI') + ' · tung ' + GN.kq.roll : 'cơ hội · ' + risk(p)) + '</div></div></div>'
      + (GN.kq && GN.kq.dich ? '<div class="gnKq ' + (GN.kq.thang ? 'thang' : 'thua') + '">'
        + (GN.kq.thang ? '<div class="t">🎉 CHÚC MỪNG!</div><div class="m">' + ic(GN.kq.dich, 'vqIcS') + esc(GN.kq.dich.ten) + (GN.kq.dich.sl > 1 ? ' ×' + GN.kq.dich.sl : '') + '</div><small>Luyện thành công với ' + GN.kq.tiLe + '% · tung ' + GN.kq.roll + ' · đã vào 🧰 Rương Ích Kỷ</small>'
          : '<div class="t">💥 THẤT BẠI</div><div class="m">' + ic(GN.kq.dich, 'vqIcS') + esc(GN.kq.dich.ten) + '</div><small>' + GN.kq.tiLe + '% · tung ' + GN.kq.roll + ' · đồ đã bỏ vào bị mất</small>')
        + '<br><small>Chọn món đích khác hoặc bỏ đồ vào để luyện tiếp</small></div>' : '')
      + '<div class="muted" style="font-size:12px;text-align:center">Phí ' + s.phi + '% · tỉ lệ ' + s.tiMin + '–' + s.tiMax + '%' + (s.luotNgay ? ' · hôm nay ' + s.luotHomNay + '/' + s.luotNgay : '') + '</div>'
      + '<button class="gnGo" ' + (ok === 'ok' && !GN.busy ? '' : 'disabled') + ' onclick="gnQuay()">💎 LUYỆN</button>'
      + (ok && ok !== 'ok' ? '<div style="font-size:12px;color:#ffb4a8;margin-top:6px;text-align:center">' + esc(ok) + '</div>' : '') + '</div>';
    // ---- đích
    h += '<div class="gnBox"><h4>🎯 MÓN MUỐN LUYỆN RA</h4>';
    if (d) h += '<div class="gnTgt">' + ic(d, 'vqIc big') + '<b>' + esc(d.ten) + (d.sl > 1 ? ' <span style="color:var(--gold)">×' + d.sl + '</span>' : '') + '</b><span class="muted">giá trị ' + vnd(d.gia) + '</span>' + capNote(d, true) + p3Nut(d.id, true) + '</div>';
    else h += '<div class="gnTgt muted" style="font-size:13px">Chọn món ở tab 🎯 Món đích bên dưới</div>';
    h += '<div class="gnMul">' + [1.5, 2, 5, 10, 20].map(function (m) { return '<button onclick="gnNhan(' + m + ')" title="Chọn món đích có giá trị gần ' + m + ' lần đồ đang bỏ vào">' + m + 'x</button>'; }).join('') + '</div>'
      + '<div class="gnMul">' + [35, 55, 75].filter(function (v) { return v <= s.tiMax; }).map(function (v) { return '<button onclick="gnPct(' + v + ')" title="Tự bỏ đồ trong rương cho đủ ' + v + '%">' + v + '%</button>'; }).join('') + '</div>'
      + '<div class="muted" style="font-size:11px;text-align:center;margin-top:4px">Kéo vòng để xoay vùng trúng tới chỗ ưng ý · 35/55/75% = tự bỏ đồ (đồ không phải ngọc trước)</div></div>';
    h += '</div>';
    // ---- chọn
    var tab = GN.chon || 'ruong';
    h += '<div class="gnPick"><div class="gnTabs"><button class="' + (tab === 'ruong' ? 'on' : '') + '" onclick="gnTab(\'ruong\')">🧰 Rương (' + (s.ruong || []).length + ' loại dùng được)</button>'
      + '<button class="' + (tab === 'dich' ? 'on' : '') + '" onclick="gnTab(\'dich\')">💎 Nguyên liệu (' + (s.dich || []).filter(function (x) { return !laPet(x); }).length + ')</button>'
      + '<button class="' + (tab === 'pet' ? 'on' : '') + '" onclick="gnTab(\'pet\')">🐾 Trân thú (' + (s.dich || []).filter(laPet).length + ')</button>'
      + '<button class="' + (tab === 'lich' ? 'on' : '') + '" onclick="gnTab(\'lich\')">📜 Lịch sử</button>'
      + '<input placeholder="🔎 lọc tên..." value="' + esc(GN.loc) + '" oninput="gnLoc(this.value)" style="flex:1;min-width:140px"></div>';
    var loc = (GN.loc || '').toLowerCase(), khop = function (x) { return !loc || x.ten.toLowerCase().indexOf(loc) >= 0 || x.id.indexOf(loc) >= 0; };
    if (tab === 'ruong') {
      var r = (s.ruong || []).filter(khop), dObj = dichObj();
      var phanTram = function (g) { var v = g / dObj.gia * (100 - s.phi); return v >= 1 ? (Math.round(v * 10) / 10) : (Math.round(v * 1000) / 1000); };
      // 08/10: số lượng = nhãn nổi trên góc icon (×có, đang bỏ vào thì xanh dung/có); "riêng / shop" chỉ còn trong chú thích rê chuột
      h += (r.length && !dObj ? '<div class="gnHint">👉 Chọn <b>món muốn luyện ra</b> (tab 💎 Nguyên liệu / 🐾 Trân thú) để thấy mỗi món trong rương cộng bao nhiêu <b>%</b> tỉ lệ.</div>' : '') +
        (r.length ? '<div class="gnGrid">' + r.map(function (x) { var dung = GN.vao[x.id] || 0; return '<div class="gnCard' + (dung ? ' on' : '') + (dObj && duRoi() ? ' het' : '') + '" onclick="gnThem(\'' + x.id + '\')" title="' + esc(x.ten) + ' · có ' + x.qty + ' · giá ' + esc(x.tu) + '">' +
        '<span class="gnIcW">' + ic(x, 'vqIcS') + '<span class="gnSl">' + x.qty + '</span>' + (dung ? '<span class="gnDung" title="đã bỏ vào ' + dung + '">✓' + dung + '</span>' : '') + '</span>' +
        '<div class="gnTx"><span class="gnNm">' + esc(x.ten) + '</span><span class="gnGia">' + vnd(x.gia) + ' / cái</span>' + (dObj ? '<span class="gnPt">+' + phanTram(x.gia) + '% <small>/ cái</small></span>' : '<span class="gnPt0">+?% / cái</span>') + '</div></div>'; }).join('') + '</div>'
        : '<div class="muted" style="font-size:13px">Rương không có món nào dùng để ghép được.</div>');
    } else if (tab === 'dich' || tab === 'pet') {   // 07/10: món đích chia 2 mục - 💎 Nguyên liệu / 🐾 Trân thú
      var dd = (s.dich || []).filter(khop).filter(function (x) { return (tab === 'pet') === laPet(x); });
      h += '<div class="gnGrid">' + dd.map(function (x) { return '<div class="gnCard' + (x.id === GN.dich ? ' on' : '') + '" onclick="gnDich(\'' + x.id + '\')">' + ic(x, 'vqIcS') + '<div><b>' + esc(x.ten) + (x.sl > 1 ? ' ×' + x.sl : '') + '</b><small>giá trị ' + vnd(x.gia) + '</small>' + capNote(x, false) + p3Nut(x.id) + '</div></div>'; }).join('') + '</div>';
    } else {
      var L = s.lich || [];
      var tenDich = function (id) { var x = (s.dich || []).find(function (y) { return y.id === id; }); return x ? x.ten : '#' + id; };
      h += '<div class="gnLich">' + (L.length ? L.map(function (x) { return '<div>' + new Date(x.t).toLocaleString('vi-VN') + ' · <span class="' + (x.thang ? 'gnW">THẮNG' : 'gnL">thua') + '</span> ' + esc(tenDich(x.dich)) + ' · ' + x.tiLe + '% (tung ' + x.roll + ') · bỏ ' + vnd(x.tong) + '</div>'; }).join('') : '<div class="muted">Chưa luyện lần nào.</div>') + '</div>';
    }
    h += '</div>';
    // 05/10: vẽ lại cả khung làm điện thoại nhảy về đầu -> giữ chỗ cuộn của trang + danh sách món + ô lịch sử
    var sx = window.scrollX, sy = window.scrollY, cu = el.querySelector('.gnGrid, .gnLich'), st = cu ? cu.scrollTop : 0, tabCu = GN.chon || 'ruong';
    el.style.minHeight = el.offsetHeight + 'px';   // giữ chiều cao lúc thay nội dung -> trang không co lại rồi bật lên
    el.innerHTML = h;
    var moi = el.querySelector('.gnGrid, .gnLich'); if (moi && tabCu === GN.daTab) moi.scrollTop = st;
    GN.daTab = tabCu; el.style.minHeight = '';
    if (window.scrollY !== sy) window.scrollTo(sx, sy);
    ganKeo();
  }
  function chuanHoa() { var s = S(); Object.keys(GN.vao).forEach(function (id) { var r = (s.ruong || []).find(function (x) { return x.id === id; }); if (!r) delete GN.vao[id]; else GN.vao[id] = Math.max(1, Math.min(r.qty, GN.vao[id])); }); if (GN.dich && !dichObj()) GN.dich = ''; }
  // 07/10: lúc kim đang quay (GN.busy) mọi nút đổi đồ / KNB / đích / tab bị chặn. Trước đó bấm vẫn được -> ve() vẽ lại cả bảng:
  // kim mới nhảy thẳng tới kết quả + vòng tỉ lệ vẽ theo số KNB / đồ mới -> kim dừng lệch vùng, trông như lỗi.
  function ban(im) { if (!GN.busy) return false; if (!im) toast('⏳ Đang luyện - chờ kim dừng đã'); return true; }
  window.gnSync = function () { if (ban(1)) return; api('/api/gn/state', {}).then(function (j) { if (GN.busy) return; GN.s = j; GN.kq = null; chuanHoa(); ve(); p3Idx(); }).catch(function (e) { toast('❌ ' + e.message); }); };
  window.gnTab = function (t) { if (ban()) return; GN.chon = t; ve(); };
  window.gnLoc = function (v) { if (ban(1)) return; GN.loc = v; ve(); var i = document.querySelector('#gnApp .gnTabs input'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } };
  window.gnThem = function (id) { if (ban()) return; var r = S().ruong.find(function (x) { return x.id === id; }); if (!r) return; var c = GN.vao[id] || 0; if (c >= r.qty) return toast('⚠️ Rương chỉ có ' + r.qty); if (dichObj() && duRoi()) return toast('⚠️ Đã đủ ' + S().tiMax + '% - không bỏ thêm được'); GN.vao[id] = c + 1; if (thua()) { if (c) GN.vao[id] = c; else delete GN.vao[id]; return toast('⚠️ Món này làm thừa (đã đủ ' + S().tiMax + '% khi bỏ món rẻ hơn) - chọn món nhỏ hơn'); } GN.kq = null; ve(); };
  window.gnSl = function (id, v) { if (ban()) return; v = Math.floor(Number(v) || 0); if (v <= 0) delete GN.vao[id]; else GN.vao[id] = v; chuanHoa(); while (GN.vao[id] > 1 && thua()) GN.vao[id]--; if (GN.vao[id] === 1 && thua()) delete GN.vao[id]; GN.kq = null; ve(); };
  window.gnBo = function (id) { if (ban()) return; delete GN.vao[id]; GN.kq = null; ve(); };
  window.gnXoaHet = function () { if (ban()) return; GN.vao = {}; GN.kq = null; ve(); };
  window.gnKnb = function (v) { if (ban()) return; GN.knb = Math.max(0, Math.min(S().knbMax, S().balance || 0, Math.floor(Number(v) || 0))); GN.kq = null; ve(); };   // 05/10: kẹp cả theo số dư ví
  window.gnDich = function (id) { if (ban()) return; GN.dich = id; GN.kq = null; ve(); };
  window.gnNhan = function (m) {
    if (ban()) return;
    var t = tong(); if (!t) return toast('⚠️ Bỏ đồ vào trước rồi chọn mức nhân');
    var muc = t * m, best = null;
    (S().dich || []).forEach(function (x) { if (!best || Math.abs(x.gia - muc) < Math.abs(best.gia - muc)) best = x; });
    if (best) { GN.dich = best.id; GN.kq = null; ve(); }
  };
  window.gnPct = function (v) { if (ban()) return; if (!dichObj()) return toast('⚠️ Chọn món đích trước'); tuBo(v); GN.kq = null; ve(); };
  window.gnQuay = function () {
    if (GN.busy || hopLe() !== 'ok') return;
    var d = dichObj(), vao = Object.keys(GN.vao).map(function (id) { return { id: id, sl: GN.vao[id] }; });
    // j.dich bị ...state(uid) đè thành DANH SÁCH món đích -> lấy món đích ở client lúc bấm
    var chup = { dich: d ? { id: d.id, ten: d.ten, ic: d.ic, gia: d.gia, sl: d.sl } : null, p: tiLe(), tong: tong(), knb: GN.knb || 0, vao: Object.keys(GN.vao).map(function (id) { var r = (S().ruong || []).find(function (x) { return x.id === id; }) || {}; return { id: id, ic: r.ic, ten: r.ten || ('#' + id), gia: r.gia || 0, sl: GN.vao[id] }; }) };
    GN.busy = true; GN.kq = null; ve();
    api('/api/gn/quay', { dich: GN.dich, vao: vao, knb: GN.knb || 0, lech: GN.lech || 0 }).then(function (j) {
      var base = Math.ceil((GN.goc || 0) / 360) * 360 + 360 * 9;
      GN.goc = base + j.roll * 3.6;
      var n = document.getElementById('gnNeedle'); if (n) n.style.transform = 'rotate(' + GN.goc + 'deg)';
      setTimeout(function () {
        GN.busy = false; GN.s = j; GN.kq = { thang: j.thang, roll: j.roll, tiLe: j.tiLe, dich: chup.dich, p: chup.p, tong: chup.tong, knb: chup.knb, vao: chup.vao }; GN.vao = {}; GN.knb = 0; chuanHoa(); ve();
        if (typeof setBal === 'function' && j.balance !== undefined) setBal(j.balance);
        toast(j.thang ? '🎉 THÀNH CÔNG! Nhận ' + (chup.dich ? chup.dich.ten + (chup.dich.sl > 1 ? ' ×' + chup.dich.sl : '') : 'món đích') + ' - đã vào 🧰 Rương Ích Kỷ' : '💥 Thất bại (' + j.tiLe + '%, tung ' + j.roll + ') - mất đồ đã bỏ vào');
      }, QUAY_MS + 200);
    }).catch(function (e) { GN.busy = false; ve(); toast('❌ ' + e.message); gnSync(); });
  };
  // 05/10: F5 khi dang o trang Ghep Ngoc - trang choi mo lai trang gn TRUOC khi file nay tai xong (gnSync chua co) -> tu tai
  var pg = document.getElementById('pageGn');
  if (pg && !pg.classList.contains('hidden')) window.gnSync();
})();
