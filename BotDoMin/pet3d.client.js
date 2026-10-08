// 🐾 08/10: bộ xem 3D trân thú (phục vụ ở /p3.js). Dùng three.js r128 (+ DDSLoader, OrbitControls) đã nạp sẵn.
// Dữ liệu do repo game tools/pet3d dựng: m<k>.bin (thân + da xương + điểm gắn + hiệu ứng), k<n>.json (xương + động tác),
// fx.json (hệ hạt + vật liệu), p<n>.bin (mesh của hạt kiểu mesh), t<n>.dds.
// Mô phỏng lại hệ hạt Ogre/Fairy của client: billboard / texcoord_billboard / ribbon / mesh; emitter Box Ring Cylinder Point
// Ellipsoid HollowEllipsoid PolarEmitter; affector ColourFading ColourInterpolator ScaleInterpolator Scaler Rotator Movement
// Revolution RevoluMove DirectionRandomiser MeshRotator MeshAnimationAffector. Gần giống game, không giống từng điểm ảnh.
// API: var v = P3V.tao(canvas, '/pet3d/<trứng>/'); v.chon(k).then(...); v.dong();
(function () {
  if (window.P3V) return;
  var T = THREE, DEG = Math.PI / 180;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function so(v, d) { return v === undefined || v === '' ? d : v; }
  function v3(a, d) { return a && a.length >= 3 ? new T.Vector3(a[0], a[1], a[2]) : (d || new T.Vector3()); }
  function la(v) { return v === true || v === 'true' || v === 1; }
  // khoảng [min,max]: dùng *_min/*_max nếu có, không thì giá trị gốc
  function khoang(o, k, d) { var b = so(o[k], d); return [so(o[k + '_min'], b), so(o[k + '_max'], b)]; }
  // nội suy khóa (giá trị k0..k5 tại thời điểm time0..time5, thời gian = phần đời 0..1)
  function khoa(o, tenGT, tenTG, n) {
    var ds = []; for (var i = 0; i < n; i++) { if (o[tenGT + i] === undefined) break; ds.push({ t: so(o[tenTG + i], i ? 1 : 0), v: o[tenGT + i] }); }
    return ds;
  }
  function noiSuy(ds, f) {
    if (!ds.length) return null; if (f <= ds[0].t) return ds[0].v;
    for (var i = 1; i < ds.length; i++) if (f <= ds[i].t) { var a = ds[i - 1], b = ds[i], k = b.t > a.t ? (f - a.t) / (b.t - a.t) : 1; if (typeof a.v === 'number') return a.v + (b.v - a.v) * k; return a.v.map(function (x, j) { return x + (b.v[j] - x) * k; }); }
    return ds[ds.length - 1].v;
  }
  function lap(f, n) { n = n || 1; if (n <= 1) return f; var x = f * n; return x - Math.floor(x) || (f >= 1 ? 1 : 0); }

  // ---------- đọc .bin ----------
  function docBin(ab) {
    var n = new DataView(ab).getUint32(0, true), js = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, n))), d0 = 4 + n + ((4 - ((4 + n) % 4)) % 4);
    (js.parts || []).forEach(function (p) {
      var o = p.o; p.pos = new Float32Array(ab, d0 + o.pos, p.nv * 3); p.nor = o.nor < 0 ? null : new Float32Array(ab, d0 + o.nor, p.nv * 3);
      p.uv = o.uv < 0 ? null : new Float32Array(ab, d0 + o.uv, p.nv * 2); p.idx = p.i32 ? new Uint32Array(ab, d0 + o.idx, p.ni) : new Uint16Array(ab, d0 + o.idx, p.ni);
      if (o.bi !== undefined) { p.bi = new Uint8Array(ab, d0 + o.bi, p.nv * 4); p.bw = new Float32Array(ab, d0 + o.bw, p.nv * 4); }
    });
    return js;
  }

  // ---------- xương + động tác ----------
  function taoXuong(k) {
    var goc = new T.Group(), bones = k.bones.map(function (b, i) {
      var x = new T.Bone(); x.name = 'b' + i; x.userData.ten = b.n; x.position.set(b.p[0], b.p[1], b.p[2]); x.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]); if (b.s) x.scale.set(b.s[0], b.s[1], b.s[2]); return x;
    });
    k.bones.forEach(function (b, i) { (b.c >= 0 && bones[b.c] ? bones[b.c] : goc).add(bones[i]); });
    goc.updateMatrixWorld(true);
    var clips = {}; Object.keys(k.anims || {}).forEach(function (ten) {
      var a = k.anims[ten], tr = [];
      a.tr.forEach(function (t) { tr.push(new T.QuaternionKeyframeTrack('b' + t.b + '.quaternion', t.t, t.q)); tr.push(new T.VectorKeyframeTrack('b' + t.b + '.position', t.t, t.p)); });
      clips[ten] = new T.AnimationClip(ten, a.d, tr);
    });
    var theoTen = {}; bones.forEach(function (b) { theoTen[b.userData.ten] = b; });
    return { goc: goc, bones: bones, clips: clips, theoTen: theoTen };
  }
  function boTriDongTac(goc, clips) {
    var mx = new T.AnimationMixer(goc), dung = clips['站立'], nghi = clips['休闲'];
    if (!dung && !nghi) return mx;
    var a = mx.clipAction(dung || nghi); a.play();
    if (dung && nghi) {   // đứng 3 vòng rồi 1 lần động tác nghỉ, như game
      var b = mx.clipAction(nghi); b.setLoop(T.LoopOnce, 1); b.clampWhenFinished = false; var dem = 0;
      mx.addEventListener('loop', function (e) { if (e.action !== a) return; if (++dem >= 3) { dem = 0; b.reset().play(); a.crossFadeTo(b, 0.3, false); } });
      mx.addEventListener('finished', function (e) { if (e.action !== b) return; a.reset().play(); b.crossFadeTo(a, 0.3, false); });
    }
    return mx;
  }

  // ---------- vật liệu ----------
  var VS = 'attribute vec4 mau; varying vec4 vM; varying vec2 vUv; void main(){ vM = mau; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  var FS = 'uniform sampler2D map; uniform float nhan; uniform float coTex; uniform float rej; uniform vec2 dich; varying vec4 vM; varying vec2 vUv;'
    + 'void main(){ vec4 t = coTex > 0.5 ? texture2D(map, vUv + dich) : vec4(1.0); vec4 c = vec4(t.rgb * vM.rgb * nhan, t.a * vM.a); if (rej > 0.5 && c.a < 0.5) discard; gl_FragColor = c; }';
  function vatLieuHat(mt, texOf) {
    mt = mt || { blend: 'add', x4: 1 };
    var u = { map: { value: null }, nhan: { value: mt.x4 || 1 }, coTex: { value: 0 }, rej: { value: mt.rej ? 1 : 0 }, dich: { value: new T.Vector2() } };
    if (mt.tex) { var t = texOf(mt.tex); if (t) { u.map.value = t; u.coTex.value = 1; } }
    var m = new T.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: T.DoubleSide });
    // cộng màu nhưng KHÔNG ghi kênh alpha (canvas trong suốt -> ghi alpha sẽ thành mảng đen trên nền trang)
    if (mt.blend === 'add') { m.blending = T.CustomBlending; m.blendSrc = T.SrcAlphaFactor; m.blendDst = T.OneFactor; m.blendSrcAlpha = T.ZeroFactor; m.blendDstAlpha = T.OneFactor; }
    else if (mt.blend === 'mod') { m.blending = T.MultiplyBlending; m.premultipliedAlpha = true; }
    else if (mt.blend === 'none') { m.transparent = false; m.depthWrite = true; }
    m.userData.cuon = mt.scroll;
    return m;
  }

  // ---------- 1 hệ hạt ----------
  function HeHat(def, nut, ctx) {
    this.d = def; this.nut = nut; this.ctx = ctx; this.hat = []; this.t = 0;
    this.quota = Math.max(1, Math.min(400, def.quota || 10));
    this.local = la(def.local_space); this.kieu = def.renderer || 'billboard';
    this.em = (def.em || []).map(function (e) { return { e: e, acc: 0, bat: 0, tat: 0, chay: true, polar: 0 }; });
    this.em.forEach(function (s) { HeHat.batTat(s, true); });
    var self = this; this.af = def.af || [];
    this.af.forEach(function (a) {   // khóa nội suy dựng sẵn
      if (a.t === 'ColourFading' || a.t === 'ColourInterpolator') a._k = khoa(a, 'colour', 'time', 6);
      if (a.t === 'ScaleInterpolator') a._k = khoa(a, 'scale', 'time', 6);
      if (a.t === 'Revolution' || a.t === 'RevoluMove') { a._k = khoa(a, 'radius_increment_scale', 'time', 6); a._mv = khoa(a, 'move_velocity_point', 'move_time', 6); }
    });
    this.mat = this.kieu === 'mesh' ? null : vatLieuHat(ctx.fx.mat[def.material], ctx.tex);
    if (this.kieu !== 'mesh') {
      var nq = this.kieu === 'ribbon' ? this.quota * Math.max(2, def.element_count || 10) : this.quota;
      var g = new T.BufferGeometry(); this.pos = new Float32Array(nq * 4 * 3); this.uv = new Float32Array(nq * 4 * 2); this.mau = new Float32Array(nq * 4 * 4);
      var id = new Uint32Array(nq * 6); for (var i = 0; i < nq; i++) { id.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6); }
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('uv', new T.BufferAttribute(this.uv, 2).setUsage(T.DynamicDrawUsage));
      g.setAttribute('mau', new T.BufferAttribute(this.mau, 4).setUsage(T.DynamicDrawUsage)); g.setIndex(new T.BufferAttribute(id, 1));
      this.mesh = new T.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; ctx.canh.add(this.mesh);
    } else this.meshNhom = new T.Group(), ctx.canh.add(this.meshNhom);
  }
  HeHat.batTat = function (s, dau) {   // chu kỳ phát: duration (0 = mãi) rồi nghỉ repeat_delay (0 = thôi)
    var e = s.e, du = khoang(e, 'duration', 0), rd = khoang(e, 'repeat_delay', 0);
    if (dau) { s.chay = true; s.bat = rnd(du[0], du[1]); return; }
    if (s.chay) { s.chay = false; s.tat = rnd(rd[0], rd[1]); if (!(s.tat > 0)) s.het = true; } else { s.chay = true; s.bat = rnd(du[0], du[1]); }
  };
  var _q = new T.Quaternion(), _v = new T.Vector3(), _w = new T.Vector3(), _m = new T.Matrix4();
  // trục khu vực của emitter Ogre (AreaEmitter::genAreaAxes) theo hướng phát
  function trucVung(dir) {
    var d = dir.clone().normalize(), up = d.clone().cross(new T.Vector3(1, 0, 0)); if (up.lengthSq() < 1e-6) up = d.clone().cross(new T.Vector3(0, 1, 0)); up.normalize();
    return { x: up.clone().cross(d), y: up, z: d };
  }
  HeHat.prototype.phat = function (s) {
    var e = s.e, dir = v3(e.direction, new T.Vector3(1, 0, 0)).normalize(), ax = trucVung(dir), w = (e.width || 0) / 2, h = (e.height || 0) / 2, dp = (e.depth || 0) / 2;
    var p = v3(e.position), x, y, z, a, r;
    switch (e.t) {
      case 'Box': p.addScaledVector(ax.x, rnd(-1, 1) * w).addScaledVector(ax.y, rnd(-1, 1) * h).addScaledVector(ax.z, rnd(-1, 1) * dp); break;
      case 'Ring': a = rnd(0, Math.PI * 2); r = rnd(so(e.inner_width, 0.5), 1); p.addScaledVector(ax.x, Math.cos(a) * r * w).addScaledVector(ax.y, Math.sin(a) * rnd(so(e.inner_height, 0.5), 1) * h).addScaledVector(ax.z, rnd(-1, 1) * dp); break;
      case 'Cylinder': do { x = rnd(-1, 1); y = rnd(-1, 1); } while (x * x + y * y > 1); p.addScaledVector(ax.x, x * w).addScaledVector(ax.y, y * h).addScaledVector(ax.z, rnd(-1, 1) * dp); break;
      case 'Ellipsoid': case 'HollowEllipsoid':
        do { x = rnd(-1, 1); y = rnd(-1, 1); z = rnd(-1, 1); } while (x * x + y * y + z * z > 1);
        if (e.t === 'HollowEllipsoid') { var l = Math.sqrt(x * x + y * y + z * z) || 1, k = rnd(so(e.inner_width, 0.5), 1) / l; x *= k; y *= k; z *= k; }
        p.addScaledVector(ax.x, x * w).addScaledVector(ax.y, y * h).addScaledVector(ax.z, z * dp); break;
      case 'PolarEmitter':
        var n = s.polar++, rr = la(e.use_polar_step) ? so(e.radius_start, 0) + n * so(e.radius_step, 0) : rnd(so(e.radius_start, 0), so(e.radius_end, 0));
        var th = (la(e.use_polar_step) ? so(e.theta_start, 0) + n * so(e.theta_step, 0) : rnd(so(e.theta_start, 0), so(e.theta_end, 360))) * DEG;
        var ph = (la(e.use_polar_step) ? so(e.phi_start, 0) + n * so(e.phi_step, 0) : rnd(so(e.phi_start, 0), so(e.phi_end, 180))) * DEG;
        x = rr * Math.sin(ph) * Math.cos(th); y = rr * Math.cos(ph); z = rr * Math.sin(ph) * Math.sin(th);
        if (la(e.flip_yz_axis)) { var tm = y; y = z; z = tm; } p.add(new T.Vector3(x, y, z)); break;
    }
    // hướng: lệch ngẫu nhiên trong nón 'angle' độ quanh direction
    var ang = (e.angle || 0) * DEG, v = dir.clone();
    if (ang > 0) { var up = ax.y.clone().applyAxisAngle(dir, rnd(0, Math.PI * 2)); v.applyAxisAngle(up, rnd(0, ang)); }
    var vel = khoang(e, 'velocity', 0); v.multiplyScalar(rnd(vel[0], vel[1]));
    var c0 = e.colour_range_start, c1 = e.colour_range_end, cc = e.colour || [1, 1, 1, 1], kk = Math.random();
    var col = c0 && c1 ? c0.map(function (x, i) { return x + (c1[i] - x) * kk; }) : cc.slice();
    var ttl = khoang(e, 'time_to_live', 5);
    var ph1 = { p: p, v: v, tuoi: 0, song: Math.min(1e6, Math.max(0.01, rnd(ttl[0], ttl[1]))), col0: col, col: col.slice(), w: this.d.particle_width || 1, h: this.d.particle_height || 1, rot: 0, vr: 0, vet: [] };
    // ScaleInterpolator / Rotator / Movement / Revolution / MeshRotator: giá trị khởi đầu
    var self = this;
    this.af.forEach(function (a) {
      // có nội suy: cỡ = particle_width/height × scale (mắt: 0.2 × 30 = 6); không nội suy: cỡ ngẫu nhiên trong width/height_range
      if (a.t === 'ScaleInterpolator' && !la(a.use_interpolated_scale)) { var k1 = Math.random(); ph1.w0 = so(a.width_range_start, ph1.w) + (so(a.width_range_end, ph1.w) - so(a.width_range_start, ph1.w)) * k1; ph1.h0 = la(a.uniform_size) ? ph1.w0 : so(a.height_range_start, ph1.h) + (so(a.height_range_end, ph1.h) - so(a.height_range_start, ph1.h)) * Math.random(); ph1.w = ph1.w0; ph1.h = ph1.h0; }
      if (a.t === 'Rotator') { ph1.rot = rnd(so(a.rotation_range_start, 0), so(a.rotation_range_end, 0)) * DEG; ph1.vr = rnd(so(a.rotation_speed_range_start, 0), so(a.rotation_speed_range_end, 0)) * DEG; }
      if (a.t === 'Movement' && la(a.use_start_velocity)) { var mn = a.start_velocity_min || [0, 0, 0], mxv = a.start_velocity_max || mn; ph1.v.set(rnd(mn[0], mxv[0]), rnd(mn[1], mxv[1]), rnd(mn[2], mxv[2])); }
      if (a.t === 'Revolution' || a.t === 'RevoluMove') { var o0 = a.center_offset_min || [0, 0, 0], o1 = a.center_offset_max || o0; ph1.tam = new T.Vector3(rnd(o0[0], o1[0]), rnd(o0[1], o1[1]), rnd(o0[2], o1[2])); }
      if (a.t === 'MeshRotator') { ph1.ypr0 = ['yaw', 'pitch', 'roll'].map(function (k) { return rnd(so(a[k + '_rotation_range_start'], 0), so(a[k + '_rotation_range_end'], 0)) * DEG; }); ph1.yprV = ['yaw', 'pitch', 'roll'].map(function (k) { return rnd(so(a[k + '_rotation_speed_range_start'], 0), so(a[k + '_rotation_speed_range_end'], 0)) * DEG; }); }
    });
    // không gian: local -> giữ theo nút; world -> đổi sang thế giới lúc sinh
    if (!this.local) { this.nut.updateMatrixWorld(); ph1.p.applyMatrix4(this.nut.matrixWorld); _q.setFromRotationMatrix(_m.extractRotation(this.nut.matrixWorld)); ph1.v.applyQuaternion(_q); ph1.qSinh = _q.clone(); ph1.goc = new T.Vector3().setFromMatrixPosition(this.nut.matrixWorld); }
    if (this.kieu === 'mesh' && this.ctx.meshHat) ph1.obj = this.ctx.meshHat(this.d, this.meshNhom);
    this.hat.push(ph1);
  };
  HeHat.prototype.capNhat = function (dt) {
    this.t += dt; var self = this, i;
    // phát
    this.em.forEach(function (s) {
      if (s.het) return;
      if (s.chay) { if (s.bat > 0) { s.bat -= dt; if (s.bat <= 0) HeHat.batTat(s); } }
      else { s.tat -= dt; if (s.tat <= 0) HeHat.batTat(s); return; }
      var rate = Math.min(s.e.emission_rate || 0, self.quota * 60); s.acc += rate * dt;
      if ((s.e.emission_rate || 0) >= 1e6) s.acc = self.quota;
      while (s.acc >= 1 && self.hat.length < self.quota) { s.acc -= 1; self.phat(s); }
      if (self.hat.length >= self.quota) s.acc = Math.min(s.acc, 1);
    });
    // tác động
    for (i = this.hat.length - 1; i >= 0; i--) {
      var p = this.hat[i]; p.tuoi += dt;
      if (p.tuoi >= p.song) { if (p.obj) p.obj.parent.remove(p.obj); this.hat.splice(i, 1); continue; }
      var f = p.tuoi / p.song, fade = 1;
      for (var j = 0; j < this.af.length; j++) {
        var a = this.af[j];
        switch (a.t) {
          case 'ColourFading': case 'ColourInterpolator':
            var c = noiSuy(a._k, lap(f, a.repeat_times)); if (c) { p.col = [c[0] * p.col0[0], c[1] * p.col0[1], c[2] * p.col0[2], (c.length > 3 ? c[3] : 1) * p.col0[3]]; }
            if (a.t === 'ColourFading') { var fi = so(a.fade_in_time, 0), fo = so(a.fade_out_time, 1); if (fi > 0 && f < fi) fade *= f / fi; if (fo < 1 && f > fo) fade *= (1 - f) / (1 - fo); p.op = so(a.opacity, 1); }
            break;
          case 'ScaleInterpolator':
            var w0 = p.w0 || this.d.particle_width || 1, h0 = p.h0 || this.d.particle_height || 1;
            if (la(a.use_interpolated_scale) && a._k.length) { var sc = noiSuy(a._k, lap(f, a.repeat_times)); p.w = w0 * sc[0]; p.h = h0 * sc[1]; }
            else if (la(a.use_constant_scale)) { var cs = a.constant_scale || [0, 0, 0]; p.w = w0 + w0 * cs[0] * p.tuoi; p.h = h0 + h0 * cs[1] * p.tuoi; }
            break;
          case 'Scaler': p.w += (a.rate || 0) * dt; p.h += (a.rate || 0) * dt; break;
          case 'Rotator': p.rot += p.vr * dt; break;
          case 'Movement':
            var ac = a.acceleration || [0, 0, 0], vl = a.velocity_loss_min || [0, 0, 0], r0 = a.randomness_min || [0, 0, 0], r1 = a.randomness_max || r0;
            p.v.x += (ac[0] + rnd(r0[0], r1[0])) * dt; p.v.y += (ac[1] + rnd(r0[1], r1[1])) * dt; p.v.z += (ac[2] + rnd(r0[2], r1[2])) * dt;
            p.v.x *= Math.max(0, 1 - vl[0] * dt); p.v.y *= Math.max(0, 1 - vl[1] * dt); p.v.z *= Math.max(0, 1 - vl[2] * dt);
            break;
          case 'DirectionRandomiser': var rd = (a.randomness || 0); p.v.x += rnd(-rd, rd) * dt; p.v.y += rnd(-rd, rd) * dt; p.v.z += rnd(-rd, rd) * dt; break;
          case 'Revolution': case 'RevoluMove':
            var axis = v3(a.rotation_axis, new T.Vector3(0, 1, 0)).normalize(); if (p.qSinh) axis.applyQuaternion(p.qSinh);
            var tam = (p.tam ? p.tam.clone() : new T.Vector3()); if (p.goc) tam.add(p.goc);
            _v.copy(p.p).sub(tam); _v.applyAxisAngle(axis, (a.rotation_speed || 0) * DEG * dt);
            var tang = la(a.use_radius_increment_scale) && a._k.length ? noiSuy(a._k, lap(f, a.repeat_times)) : (a.radius_increment || 0);
            if (tang) { _w.copy(_v).addScaledVector(axis, -_v.dot(axis)); var L = _w.length(); if (L > 1e-4) _v.addScaledVector(_w, tang * dt / L); }
            p.p.copy(tam).add(_v);
            if (a.t === 'RevoluMove') { var mv = la(a.move_usevariablevelocity) && a._mv.length ? noiSuy(a._mv, f) : (a.move_velocity || 0); if (typeof mv === 'number') p.p.addScaledVector(axis, mv * dt); }
            break;
        }
      }
      p.p.addScaledVector(p.v, dt); p.fade = fade;
      if (this.kieu === 'ribbon') { p.vet.unshift(p.p.clone()); var ec = Math.max(2, this.d.element_count || 10); if (p.vet.length > ec) p.vet.length = ec; }
    }
    if (this.mat && this.mat.userData.cuon) { var cu = this.mat.userData.cuon; this.mat.uniforms.dich.value.set(cu[0] * this.t, cu[1] * this.t); }
  };
  HeHat.prototype.ve = function (cam) {
    if (this.kieu === 'mesh') return this.veMesh();
    var d = this.d, n = 0, self = this; this.nut.updateMatrixWorld();
    var M = this.nut.matrixWorld, R = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), U = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), F = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 2);
    _q.setFromRotationMatrix(_m.extractRotation(M));
    var bt = d.billboard_type || 'point', cd = v3(d.common_direction, new T.Vector3(0, 1, 0)).applyQuaternion(_q).normalize(), cu = v3(d.common_up_vector, new T.Vector3(0, 0, 1)).applyQuaternion(_q).normalize();
    var org = d.billboard_origin || 'center', oy = /^bottom/.test(org) ? 0.5 : /^top/.test(org) ? -0.5 : 0, ox = /left$/.test(org) ? 0.5 : /right$/.test(org) ? -0.5 : 0;
    var nhan = 1, st = d.stacks || 1, sl = d.slices || 1, nk = st * sl;
    var wp = new T.Vector3(), rr = new T.Vector3(), uu = new T.Vector3(), a = new T.Vector3();
    function dinh(i, P, u, v, c) { self.pos[i * 3] = P.x; self.pos[i * 3 + 1] = P.y; self.pos[i * 3 + 2] = P.z; self.uv[i * 2] = u; self.uv[i * 2 + 1] = v; self.mau.set(c, i * 4); }
    for (var i = 0; i < this.hat.length; i++) {
      var p = this.hat[i], col = p.col, k = (p.fade === undefined ? 1 : p.fade) * so(p.op, 1);
      var c = [col[0] * k, col[1] * k, col[2] * k, Math.min(1, col[3] * (p.fade === undefined ? 1 : p.fade))];
      if (this.kieu === 'ribbon') {   // vệt: dải mặt hướng camera dọc các điểm đã qua
        var vt = p.vet; if (vt.length < 2) continue;
        for (var s = 0; s < vt.length - 1 && n < this.pos.length / 12; s++) {
          var A = vt[s].clone(), B = vt[s + 1].clone(); if (this.local) { A.applyMatrix4(M); B.applyMatrix4(M); }
          var dir = B.clone().sub(A), side = dir.clone().cross(F).normalize(), f0 = s / (vt.length - 1), f1 = (s + 1) / (vt.length - 1);
          var hw = so(d.head_width_scale, 1), tw = so(d.tail_width_scale, 1), ha = so(d.head_alpha, 1), ta = so(d.tail_alpha, 1);
          var w0 = p.w * (hw + (tw - hw) * f0) / 2, w1 = p.w * (hw + (tw - hw) * f1) / 2, a0 = ha + (ta - ha) * f0, a1 = ha + (ta - ha) * f1;
          var c0 = [c[0] * a0, c[1] * a0, c[2] * a0, c[3] * a0], c1 = [c[0] * a1, c[1] * a1, c[2] * a1, c[3] * a1];
          dinh(n * 4, A.clone().addScaledVector(side, -w0), f0, 0, c0); dinh(n * 4 + 1, A.clone().addScaledVector(side, w0), f0, 1, c0);
          dinh(n * 4 + 2, B.clone().addScaledVector(side, -w1), f1, 0, c1); dinh(n * 4 + 3, B.clone().addScaledVector(side, w1), f1, 1, c1); n++;
        }
        continue;
      }
      wp.copy(p.p); if (this.local) wp.applyMatrix4(M);
      var vdir = p.v.clone(); if (this.local) vdir.applyQuaternion(_q); if (vdir.lengthSq() < 1e-8) vdir.copy(cd); vdir.normalize();
      if (bt === 'oriented_common' || bt === 'oriented_self') { uu.copy(bt === 'oriented_common' ? cd : vdir); rr.copy(uu).cross(F).normalize(); if (rr.lengthSq() < 1e-6) rr.copy(R); }
      else if (bt === 'perpendicular_common' || bt === 'perpendicular_self') { var nn = bt === 'perpendicular_common' ? cd : vdir; rr.copy(cu).cross(nn).normalize(); uu.copy(nn).cross(rr).normalize(); }
      else { rr.copy(R); uu.copy(U); }
      if (p.rot) { var nrm = rr.clone().cross(uu).normalize(); rr.applyAxisAngle(nrm, p.rot); uu.applyAxisAngle(nrm, p.rot); }
      var hw2 = p.w / 2, hh2 = p.h / 2, u0 = 0, u1 = 1, v0 = 0, v1 = 1;
      if (this.kieu === 'texcoord_billboard' && nk > 1) { var fr = Math.min(nk - 1, Math.floor(p.tuoi / p.song * nk)), cx = fr % sl, cy = Math.floor(fr / sl); u0 = cx / sl; u1 = (cx + 1) / sl; v0 = cy / st; v1 = (cy + 1) / st; }
      a.copy(wp).addScaledVector(uu, oy * p.h * 2 * 0.5).addScaledVector(rr, ox * p.w);
      dinh(n * 4, a.clone().addScaledVector(rr, -hw2).addScaledVector(uu, hh2), u0, v0, c); dinh(n * 4 + 1, a.clone().addScaledVector(rr, hw2).addScaledVector(uu, hh2), u1, v0, c);
      dinh(n * 4 + 2, a.clone().addScaledVector(rr, -hw2).addScaledVector(uu, -hh2), u0, v1, c); dinh(n * 4 + 3, a.clone().addScaledVector(rr, hw2).addScaledVector(uu, -hh2), u1, v1, c); n++;
    }
    var g = this.mesh.geometry; g.setDrawRange(0, n * 6); g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.mau.needsUpdate = true;
  };
  HeHat.prototype.veMesh = function () {
    this.nut.updateMatrixWorld(); var M = this.nut.matrixWorld; _q.setFromRotationMatrix(_m.extractRotation(M));
    for (var i = 0; i < this.hat.length; i++) {
      var p = this.hat[i]; if (!p.obj) continue; var o = p.obj;
      o.position.copy(p.p); if (this.local) o.position.applyMatrix4(M);
      var e = p.ypr0 ? new T.Euler(p.ypr0[1] + p.yprV[1] * p.tuoi, p.ypr0[0] + p.yprV[0] * p.tuoi, p.ypr0[2] + p.yprV[2] * p.tuoi, 'YXZ') : new T.Euler();
      o.quaternion.setFromEuler(e); if (this.local) o.quaternion.premultiply(_q);
      var s = p.w / (this.d.particle_width || 1); o.scale.setScalar(s || 1);
      var k = (p.fade === undefined ? 1 : p.fade) * so(p.op, 1); o.traverse(function (x) { if (x.material && x.material.uniforms) { x.material.uniforms.nhan.value = (x.material.userData.nhan0 || 1) * k; } });
    }
  };
  HeHat.prototype.huy = function () { if (this.mesh) { this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); } if (this.meshNhom) this.meshNhom.parent.remove(this.meshNhom); };

  // ---------- bộ xem ----------
  function tao(cv, goc) {
    var V = { goc: goc, bin: {}, tex: {}, skel: {}, pm: {}, fx: null, k: 0, raf: 0, nhom: null, he: [], mixers: [], clock: new T.Clock() };
    V.r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); V.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    V.sc = new T.Scene(); V.sc.add(new T.AmbientLight(0xffffff, 0.75)); var dl = new T.DirectionalLight(0xffffff, 0.6); dl.position.set(60, 120, 100); V.sc.add(dl);
    V.cam = new T.PerspectiveCamera(32, 1, 1, 8000); V.ctl = new T.OrbitControls(V.cam, cv); V.ctl.enableDamping = true; V.ctl.autoRotate = true; V.ctl.autoRotateSpeed = 1.5; V.ctl.enablePan = false;
    V.dds = new T.DDSLoader();
    function texOf(f) { if (!V.tex[f]) { V.tex[f] = V.dds.load(goc + f); V.tex[f].flipY = false; V.tex[f].wrapS = V.tex[f].wrapT = T.RepeatWrapping; } return V.tex[f]; }
    function lay(f, json) { var k = f; if (!V.bin[k]) V.bin[k] = fetch(goc + f).then(function (r) { if (!r.ok) throw new Error('thiếu ' + f); return json ? r.json() : r.arrayBuffer(); }); return V.bin[k]; }
    V.co = function () { var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); };
    window.addEventListener('resize', V.co); V.co();
    // dựng 1 bộ mesh (thân hoặc mesh hạt) -> {nhom, xuong}
    function dung(m, k, matHat) {
      var nhom = new T.Group(), x = k ? taoXuong(k) : null; if (x) nhom.add(x.goc);
      var sk = x ? new T.Skeleton(x.bones) : null;
      m.parts.forEach(function (p) {
        var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p.pos, 3));
        if (p.nor) g.setAttribute('normal', new T.BufferAttribute(p.nor, 3)); if (p.uv) g.setAttribute('uv', new T.BufferAttribute(p.uv, 2));
        g.setIndex(new T.BufferAttribute(p.idx, 1)); if (!p.nor) g.computeVertexNormals();
        var da = sk && p.bi, mat;
        if (matHat && !da) {   // mesh hạt không da: vật liệu hạt (hòa trộn cộng...), màu đỉnh = 1
          mat = vatLieuHat(matHat, texOf); mat.userData.nhan0 = matHat.x4 || 1;
          var mau = new Float32Array(p.nv * 4); mau.fill(1); g.setAttribute('mau', new T.BufferAttribute(mau, 4));
        }
        if (!mat) { var opt = { side: T.DoubleSide, alphaTest: p.alpha ? 0.4 : 0, skinning: !!da }; if (p.tex) opt.map = texOf(p.tex); else if (matHat && matHat.tex) { opt.map = texOf(matHat.tex); opt.transparent = true; opt.depthWrite = false; if (matHat.blend === 'add') opt.blending = T.AdditiveBlending; } mat = new T.MeshLambertMaterial(opt); }
        var o; if (da) { g.setAttribute('skinIndex', new T.BufferAttribute(p.bi, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(p.bw, 4)); o = new T.SkinnedMesh(g, mat); o.bind(sk); }
        else o = new T.Mesh(g, mat);
        o.frustumCulled = false; nhom.add(o);
      });
      if (x) V.mixers.push(boTriDongTac(nhom, x.clips));
      return { nhom: nhom, xuong: x };
    }
    // mesh của hạt kiểu mesh (cánh, vật bay...): nạp trước p<n>.bin + xương
    function napMeshHat(def) {
      if (!def.pm || V.pm[def.pm]) return Promise.resolve();
      V.pm[def.pm] = { cho: true };
      return lay(def.pm).then(function (ab) { var m = docBin(ab); return (m.skel ? lay(m.skel, true) : Promise.resolve(null)).then(function (k) { V.pm[def.pm] = { m: m, k: k }; }); }).catch(function () { V.pm[def.pm] = null; });
    }
    var ctx = { canh: V.sc, tex: texOf, fx: null, meshHat: function (def, cha) { var d = V.pm[def.pm]; if (!d || !d.m) return null; var b = dung(d.m, d.k, V.fx.mat[def.material]); cha.add(b.nhom); return b.nhom; } };
    function xoa() {
      V.he.forEach(function (h) { h.huy(); }); V.he = []; V.mixers = [];
      if (V.nhom) { V.sc.remove(V.nhom); V.nhom.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); V.nhom = null; }
    }
    V.chon = function (k) {
      V.k = k;
      return Promise.all([lay('m' + k + '.bin'), V.fx ? Promise.resolve(V.fx) : lay('fx.json', true).catch(function () { return { ps: {}, mat: {} }; })]).then(function (r) {
        if (V.k !== k) return; V.fx = ctx.fx = r[1]; var m = docBin(r[0]);
        var cho = [m.skel ? lay(m.skel, true) : Promise.resolve(null)];
        (m.eff || []).forEach(function (e) { e.el.forEach(function (el) { var d = V.fx.ps[el.ps]; if (d && d.pm) cho.push(napMeshHat(d)); }); });
        return Promise.all(cho).then(function (rr) {
          if (V.k !== k) return; xoa(); var k0 = rr[0];
          var b = dung(m, k0); V.nhom = b.nhom; V.sc.add(V.nhom); V.nhom.updateMatrixWorld(true);
          // khung nhìn theo thân ở TƯ THẾ ĐANG ĐỨNG (áp khung đầu động tác, tính đỉnh qua da xương) - con bay sẽ cao hơn tư thế gốc
          V.mixers.forEach(function (mx) { mx.update(0); }); V.nhom.updateMatrixWorld(true);
          var box = new T.Box3(), c = new T.Vector3(), vt = new T.Vector3();
          V.nhom.traverse(function (o) {
            if (!o.isMesh) return; var pa = o.geometry.attributes.position, buoc = Math.max(1, Math.floor(pa.count / 400));
            for (var i = 0; i < pa.count; i += buoc) { vt.fromBufferAttribute(pa, i); if (o.isSkinnedMesh) o.boneTransform(i, vt); vt.applyMatrix4(o.matrixWorld); box.expandByPoint(vt); }
          });
          if (box.isEmpty()) box.setFromObject(V.nhom); box.getCenter(c); var h = Math.max(box.max.y - box.min.y, (box.max.x - box.min.x) * 0.75, (box.max.z - box.min.z) * 0.75);
          V.ctl.target.copy(c); V.cam.position.set(c.x + h * 0.9, c.y + h * 0.3, c.z + h * 1.9); V.cam.near = h / 100; V.cam.far = h * 60; V.cam.updateProjectionMatrix(); V.ctl.update();
          // điểm gắn + hiệu ứng
          (m.eff || []).forEach(function (e) {
            var L = (m.loc || {})[e.loc], cha = V.nhom;
            if (L && L.b && b.xuong && b.xuong.theoTen[L.b]) cha = b.xuong.theoTen[L.b];
            var nut = new T.Object3D(); if (L) { nut.position.set(L.p[0], L.p[1], L.p[2]); var ax = new T.Vector3(L.r[0], L.r[1], L.r[2]); if (ax.lengthSq() > 1e-8 && L.r[3]) nut.quaternion.setFromAxisAngle(ax.normalize(), L.r[3]); }
            cha.add(nut);
            e.el.forEach(function (el) {
              var d = V.fx.ps[el.ps]; if (!d) return; var n2 = new T.Object3D(); n2.position.set(el.pos[0], el.pos[1], el.pos[2]); n2.quaternion.set(el.q[1], el.q[2], el.q[3], el.q[0]); nut.add(n2);
              var h1 = new HeHat(d, n2, ctx); h1.cho = el.t0 || 0; V.he.push(h1);
            });
          });
          V.nhom.updateMatrixWorld(true);
          for (var i = 0; i < 30; i++) V.he.forEach(function (h) { h.capNhat(1 / 30); });   // chạy trước 1 giây cho hiệu ứng đầy
        });
      });
    };
    (function loop() {
      if (V.dong) return; var dt = Math.min(0.05, V.clock.getDelta());
      V.mixers.forEach(function (m) { m.update(dt); });
      if (V.nhom) V.nhom.updateMatrixWorld(true);
      V.he.forEach(function (h) { if (h.cho > 0) { h.cho -= dt; return; } h.capNhat(dt); });
      V.ctl.update(); V.he.forEach(function (h) { h.ve(V.cam); });
      V.r.render(V.sc, V.cam); V.raf = requestAnimationFrame(loop);
    })();
    V.dongLai = function () {
      V.dong = true; cancelAnimationFrame(V.raf); window.removeEventListener('resize', V.co); xoa();
      Object.keys(V.tex).forEach(function (k) { V.tex[k].dispose(); }); V.ctl.dispose(); V.r.dispose(); V.r.forceContextLoss();
    };
    return V;
  }
  window.P3V = { tao: tao, docBin: docBin };
})();
