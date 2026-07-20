/* ============ Chuyện tình mình — logic ============ */
/* File này tự chạy, bạn không cần sửa. Sửa nội dung ở noi-dung.js */

// Dữ liệu do dashboard quản lý (sticker + ảnh timeline + album). Không có server -> {}
let DASH = {};
const taiDash = (async () => {
  for (const url of ["/api/data", "du-lieu.json"]) {
    try { const r = await fetch(url, { cache: "no-store" }); if (r.ok) { DASH = (await r.json()) || {}; return; } } catch (e) {}
  }
})();

// --- Bìa: tên + đếm ngày ---
const tieuDeBia = document.getElementById("heroTitle");
tieuDeBia.textContent = THONG_TIN.ten1 + " & " + THONG_TIN.ten2;

// --- Nút tải lại: nếu Dashboard có up ảnh (thú cưng...) thì dùng ảnh đó ---
(async function nutTaiLai() {
  await taiDash;
  const anh = (DASH && DASH.sticker && DASH.sticker.reloadIcon) || "";
  const btn = document.querySelector(".reload-btn");
  if (btn && anh) {
    btn.innerHTML = `<img src="${anh}" alt="tải lại">`;
    btn.classList.add("co-anh");
  }
})();

// --- Sticker ảnh mặt 2 đứa (trên tên) — ưu tiên dashboard ---
(async function dungSticker() {
  await taiDash;
  const st = (DASH && DASH.sticker) || {};
  const a1 = st.heroKhoa || THONG_TIN.anh1;
  const a2 = st.heroHanh || THONG_TIN.anh2;
  function moiSticker(anh, ten, xoay) {
    const trong = !anh;
    return (
      `<div class="sticker ${trong ? "trong" : ""}" style="--xoay:${xoay}deg" title="${ten}">` +
        (trong
          ? `<span class="sticker-cho">＋<small>ảnh ${ten}</small></span>`
          : `<img src="${anh}" alt="${ten}" loading="lazy">`) +
      "</div>"
    );
  }
  const wrap = document.createElement("div");
  wrap.className = "hero-sticker";
  wrap.innerHTML =
    moiSticker(a1, THONG_TIN.ten1, -6) +
    '<span class="sticker-tim">💛</span>' +
    moiSticker(a2, THONG_TIN.ten2, 6);
  tieuDeBia.parentNode.insertBefore(wrap, tieuDeBia);
})();

// --- Sinh nhật hai đứa (nếu có) ---
(function sinhNhat() {
  const dsn = [];
  if (THONG_TIN.sinhNhat1) dsn.push("🎂 " + THONG_TIN.ten1 + ": " + dinhDangNgay(THONG_TIN.sinhNhat1));
  if (THONG_TIN.sinhNhat2) dsn.push("🎂 " + THONG_TIN.ten2 + ": " + dinhDangNgay(THONG_TIN.sinhNhat2));
  if (!dsn.length) return;
  const el = document.createElement("p");
  el.className = "hero-sinhnhat";
  el.innerHTML = dsn.map(t => `<span>${t}</span>`).join("");
  const counter = document.getElementById("counter");
  counter.parentNode.insertBefore(el, counter.nextSibling);
})();

function dinhDangNgay(chuoi) {
  // Ghép chuỗi trực tiếp (không qua Date) để tránh lệch ngày do timezone
  // khi người xem ở nước ngoài (vd Mỹ) — Date("YYYY-MM-DD") bị hiểu là giờ UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(chuoi);
  if (!m) return chuoi;
  return m[3] + "/" + m[2] + "/" + m[1];
}

(function demNgay() {
  const el = document.getElementById("counterNum");
  // +07:00 ép mốc "bắt đầu" luôn là nửa đêm giờ Việt Nam, dù người xem ở đâu.
  const batDau = new Date(THONG_TIN.ngayQuen + "T00:00:00+07:00");
  if (isNaN(batDau)) { el.textContent = "?"; return; }
  const soNgay = Math.floor((Date.now() - batDau.getTime()) / 86400000);
  // đếm nhảy số cho vui
  let cur = 0;
  const dich = Math.max(soNgay, 0);
  const buoc = Math.max(1, Math.round(dich / 60));
  const chay = setInterval(() => {
    cur += buoc;
    if (cur >= dich) { cur = dich; clearInterval(chay); }
    el.textContent = cur.toLocaleString("vi-VN");
  }, 20);
})();

// Kho ảnh cho lightbox: mỗi phần tử là { tieuDe, anh: [{src, ghi}] }
const THU_VIEN = [];

// --- Dựng timeline ---
const bocTimeline = document.getElementById("timeline");

// Ảnh có thể là "Lib/HinhAnh/a.jpg" HOẶC {src:"Lib/HinhAnh/a.jpg", ghi:"note nhỏ"}
function chuanHoaAnh(ds) {
  if (!Array.isArray(ds)) return [];
  return ds
    .map(a => (typeof a === "string"
      ? { src: a, ghi: "", keo: "" }
      : { src: (a && a.src) || "", ghi: (a && a.ghi) || "", keo: (a && a.keo) || "" }))
    .filter(a => a.src);
}

// Nhận diện video theo đuôi file
function laVideo(src) {
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(src || "");
}

// Chống chèn HTML cho chữ người dùng gõ (wishlist)
function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// HTML thumbnail (ảnh hoặc video có nút ▶) dùng chung cho timeline & Chopper
function mediaThumb(a) {
  return laVideo(a.src)
    ? `<video src="${a.src}" preload="metadata" muted playsinline></video><span class="video-badge">▶</span>`
    : `<img src="${a.src}" alt="ảnh kỷ niệm" loading="lazy">`;
}

(async function dungTimeline() {
  await taiDash;
  const tlAnh = (DASH && DASH.timeline) || {};
  let chuongHienTai = "";
  let demMoc = 0;

  TIMELINE.forEach((moc, idx) => {
  const mocKey = "m" + idx;
  // Badge chương mới
  if (moc.chuong && moc.chuong !== chuongHienTai) {
    chuongHienTai = moc.chuong;
    const badge = document.createElement("div");
    badge.className = "chuong-badge";
    badge.textContent = "✦ " + moc.chuong;
    bocTimeline.appendChild(badge);
  }

  const ben = demMoc % 2 === 0 ? "trai" : "phai";
  demMoc++;

  const khoi = document.createElement("div");
  khoi.className = "moc " + ben;

  // Phần ảnh — ưu tiên ảnh từ dashboard (theo tiêu đề mốc), không có thì dùng moc.anh
  let htmlAnh = "";
  const nguonAnh = (tlAnh[mocKey] && tlAnh[mocKey].length) ? tlAnh[mocKey] : moc.anh;
  const dsAnh = chuanHoaAnh(nguonAnh);
  const coAnh = dsAnh.length > 0;

  if (moc.kieu === "chat") {
    if (coAnh) {
      const g = THU_VIEN.length;
      THU_VIEN.push({ tieuDe: moc.tieuDe || "", anh: dsAnh });
      htmlAnh = '<div class="chat-phone">' +
        dsAnh.map((a, i) =>
          `<img src="${a.src}" alt="tin nhắn" loading="lazy" class="mo-lightbox" data-g="${g}" data-i="${i}">`
        ).join("") +
        '</div>';
    } else {
      htmlAnh = '<div class="chat-phone"><div class="chat-empty">📱 chèn ảnh chụp màn hình chat vào đây</div></div>';
    }
  } else if (coAnh) {
    const g = THU_VIEN.length;
    THU_VIEN.push({ tieuDe: moc.tieuDe || "", anh: dsAnh });
    const hienThi = dsAnh.slice(0, 3);   // trong thẻ chỉ show tối đa 3 ảnh (1 hàng)
    htmlAnh = `<div class="anh-wrap" style="--cols:${hienThi.length}">` +
      hienThi.map((a, i) => {
        const conLai = (i === 2 && dsAnh.length > 3)
          ? `<span class="anh-them">+${dsAnh.length - 3}</span>` : "";
        const lopKeo = a.keo ? " keo-" + a.keo : "";
        return '<div class="polaroid mo-lightbox' + lopKeo + '" data-g="' + g + '" data-i="' + i + '">' +
          mediaThumb(a) +
          conLai +
        '</div>';
      }).join("") +
      '</div>';
  }

  const htmlNoi = moc.noi ? `<span class="the-noi">📍 ${moc.noi}</span>` : "";

  khoi.innerHTML =
    '<div class="the">' +
      `<span class="the-ngay">${moc.ngay || ""}</span>` +
      `<h3 class="the-tieude">${moc.tieuDe || ""}</h3>` +
      htmlNoi +
      `<p class="the-ke">${moc.ke || ""}</p>` +
      htmlAnh +
    '</div>';

  bocTimeline.appendChild(khoi);
  });

  // render sau observer nên phải tự đăng ký hiệu ứng hiện dần
  bocTimeline.querySelectorAll(".moc, .chuong-badge").forEach(el => quanSat.observe(el));
})();

// --- Luật của tụi mình ---
(function dungQuyTac() {
  const boc = document.getElementById("quytac");
  if (!boc || typeof QUY_TAC === "undefined" || !QUY_TAC.length) return;
  boc.innerHTML =
    '<div class="qt-badge">✦ Luật của tụi mình</div>' +
    '<div class="qt-luoi">' +
      QUY_TAC.map(q =>
        '<div class="qt-the">' +
          `<div class="qt-icon">${q.icon || "💛"}</div>` +
          `<h4 class="qt-tieude">${q.tieuDe || ""}</h4>` +
          `<p class="qt-ke">${q.ke || ""}</p>` +
        '</div>'
      ).join("") +
    '</div>';
})();

// --- Sở thích / Về hai đứa — sticker ưu tiên dashboard ---
(async function dungSoThich() {
  const boc = document.getElementById("sothich");
  if (!boc || typeof SO_THICH === "undefined") return;
  await taiDash;
  const st = (DASH && DASH.sticker) || {};
  const so = (DASH && DASH.soThich) || {};
  const slot = ["soThichKhoa", "soThichHanh"];
  const whoKey = ["khoa", "hanh"];
  const nguoi = [SO_THICH.nguoi1, SO_THICH.nguoi2].filter(Boolean);
  if (!nguoi.length) return;
  boc.innerHTML =
    '<div class="qt-badge">✦ Sở thích của hai đứa</div>' +
    '<div class="st-luoi">' +
      nguoi.map((n, i) => {
        const sticker = st[slot[i]] || n.sticker;
        const thich = (so[whoKey[i]] && Array.isArray(so[whoKey[i]].thich))
          ? so[whoKey[i]].thich : (Array.isArray(n.thich) ? n.thich : []);
        return '<div class="st-the">' +
          (sticker
            ? `<img class="st-sticker sticker-cut" src="${sticker}" alt="${n.ten || ""}">`
            : `<div class="st-emoji">${n.emoji || "💛"}</div>`) +
          `<h4 class="st-ten">${n.ten || ""}</h4>` +
          '<ul class="st-ds">' +
            thich.filter(t => t && t.trim() && t.trim() !== "...").map(t => `<li>${escHtml(t)}</li>`).join("") +
          '</ul>' +
        '</div>';
      }).join("") +
    '</div>';
  boc.querySelectorAll(".st-the, .qt-badge").forEach(el => quanSat.observe(el));
})();

// --- Wishlist của tụi mình (đồng bộ qua Firebase) ---
(function dungWishlist() {
  const boc = document.getElementById("wishlist");
  if (!boc) return;

  const cfg = (typeof WISHLIST_FB !== "undefined") ? WISHLIST_FB : null;
  const daCauHinh = cfg && cfg.apiKey && cfg.projectId;

  boc.innerHTML =
    '<div class="qt-badge">✦ Wishlist của tụi mình</div>' +
    '<div class="wl-the">' +
      (daCauHinh
        ? '<form class="wl-them" id="wlForm">' +
            '<input id="wlInput" type="text" maxlength="120" placeholder="Điều tụi mình muốn làm cùng nhau...">' +
            '<button type="submit">Thêm 💛</button>' +
          '</form>' +
          '<ul class="wl-ds" id="wlDs"></ul>' +
          '<p class="wl-trangthai" id="wlTrangThai">Đang kết nối…</p>'
        : '<div class="wl-cho">💭 Wishlist cần cấu hình <b>Firebase</b> để hai đứa cùng thêm &amp; đồng bộ.<br>' +
          'Mở file <b>WISHLIST-HUONG-DAN.md</b> làm theo (~10 phút), rồi dán config vào <b>WISHLIST_FB</b> trong <b>noi-dung.js</b>.</div>') +
    '</div>';

  if (!daCauHinh) return;
  const tt = () => document.getElementById("wlTrangThai");
  if (typeof firebase === "undefined") {
    if (tt()) tt().textContent = "⚠ Không tải được Firebase (cần có mạng).";
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const col = firebase.firestore().collection("wishlist");
    const dsEl = document.getElementById("wlDs");

    col.orderBy("ts").onSnapshot(
      snap => {
        if (tt()) tt().style.display = "none";
        dsEl.innerHTML = snap.docs.map(d => {
          const w = d.data();
          return `<li class="${w.done ? "xong" : ""}">` +
            `<button class="wl-tick" data-id="${d.id}" data-done="${w.done ? 1 : 0}">${w.done ? "✅" : "⬜"}</button>` +
            `<span class="wl-text">${escHtml(w.text || "")}</span>` +
            `<button class="wl-xoa" data-id="${d.id}" title="Xoá">✕</button>` +
          "</li>";
        }).join("") || '<li class="wl-rong">Chưa có điều ước nào, thêm cái đầu tiên nha 💛</li>';
      },
      err => { if (tt()) { tt().style.display = ""; tt().textContent = "⚠ Lỗi kết nối: " + err.message; } }
    );

    document.getElementById("wlForm").addEventListener("submit", e => {
      e.preventDefault();
      const inp = document.getElementById("wlInput");
      const t = inp.value.trim();
      if (!t) return;
      col.add({ text: t, done: false, ts: Date.now() }).catch(er => alert("Không thêm được: " + er.message));
      inp.value = "";
    });

    dsEl.addEventListener("click", e => {
      const tick = e.target.closest(".wl-tick");
      const xoa = e.target.closest(".wl-xoa");
      if (tick) col.doc(tick.dataset.id).update({ done: tick.dataset.done !== "1" });
      else if (xoa && confirm("Xoá điều ước này?")) col.doc(xoa.dataset.id).delete();
    });
  } catch (err) {
    if (tt()) { tt().style.display = ""; tt().textContent = "⚠ Lỗi Firebase: " + err.message; }
  }
})();

// --- Chopper 🐩 (album + video) — sticker & album ưu tiên dashboard ---
(async function dungChopper() {
  const boc = document.getElementById("chopper");
  if (!boc || typeof CHOPPER === "undefined") return;
  await taiDash;

  const nguonAlbum = (DASH.timeline && DASH.timeline["chopper"] && DASH.timeline["chopper"].length)
    ? DASH.timeline["chopper"] : CHOPPER.anh;
  const ds = chuanHoaAnh(nguonAlbum);
  let album;
  if (ds.length) {
    const g = THU_VIEN.length;
    THU_VIEN.push({ tieuDe: CHOPPER.ten || "Chopper", anh: ds });
    album = '<div class="chopper-album">' +
      ds.map((a, i) => {
        const lopKeo = a.keo ? " keo-" + a.keo : "";
        return `<div class="polaroid mo-lightbox${lopKeo}" data-g="${g}" data-i="${i}">` +
          mediaThumb(a) +
        '</div>';
      }).join("") +
      '</div>';
  } else {
    album = '<div class="chopper-cho">🐾 Thêm ảnh &amp; video của Chopper trong Dashboard.</div>';
  }

  const sticker = (DASH.sticker && DASH.sticker.chopper) || CHOPPER.sticker;

  boc.innerHTML =
    `<div class="qt-badge">✦ ${CHOPPER.ten || "Bé cưng"}</div>` +
    '<div class="chopper-the">' +
      (sticker ? `<img class="chopper-sticker sticker-cut" src="${sticker}" alt="${CHOPPER.ten || "Chopper"}">` : "") +
      `<p class="chopper-ke">${CHOPPER.ke || ""}</p>` +
      album +
    '</div>';
  boc.querySelectorAll(".chopper-the, .qt-badge").forEach(el => quanSat.observe(el));
})();

// --- Những kỷ niệm đáng nhớ (mỗi kỷ niệm 1 album) ---
// Ưu tiên dữ liệu từ dashboard (/api/data hoặc du-lieu.json); không có thì dùng KY_NIEM trong noi-dung.js.
(async function dungKyNiem() {
  const boc = document.getElementById("kyniem");
  if (!boc) return;
  await taiDash;

  let list = (Array.isArray(DASH.kyNiem) && DASH.kyNiem.length)
    ? DASH.kyNiem
    : ((typeof KY_NIEM !== "undefined" && Array.isArray(KY_NIEM)) ? KY_NIEM : []);
  if (!list.length) return;

  const the = list.map(kn => {
    const ds = chuanHoaAnh(kn.anh);
    let coverHtml, lopTrong = "", mo = "";
    if (ds.length) {
      const g = THU_VIEN.length;
      THU_VIEN.push({ tieuDe: kn.tieuDe || "", anh: ds });
      mo = ` mo-lightbox" data-g="${g}" data-i="0`;   // bấm cả thẻ -> mở lightbox từ ảnh đầu
      const bia = ds[0];
      const soVideo = ds.filter(a => laVideo(a.src)).length;
      const nhan = soVideo
        ? `📷 ${ds.length - soVideo} ảnh · 🎬 ${soVideo}`
        : `📷 ${ds.length} ảnh`;
      coverHtml =
        '<div class="knm-cover">' + mediaThumb(bia) + `<span class="knm-count">${nhan}</span></div>`;
    } else {
      lopTrong = " knm-trong";
      coverHtml = '<div class="knm-cover knm-cho">＋<small>chưa có ảnh</small></div>';
    }
    return `<div class="knm-the${lopTrong}${mo}">` +
      coverHtml +
      `<div class="knm-title">${kn.tieuDe || ""}</div>` +
      (kn.ke ? `<div class="knm-ke">${kn.ke}</div>` : "") +
    '</div>';
  }).join("");

  boc.innerHTML =
    '<div class="qt-badge">✦ Những kỷ niệm đáng nhớ</div>' +
    '<div class="knm-luoi">' + the + '</div>';

  // render sau observer nên phải tự đăng ký hiệu ứng hiện dần
  boc.querySelectorAll(".knm-the, .qt-badge").forEach(el => quanSat.observe(el));
})();

// --- Kết ---
document.getElementById("ending").innerHTML =
  '<div class="ending-heart">💞</div>' +
  `<p class="ending-text">${THONG_TIN.loiKet || ""}</p>`;

// --- Hiệu ứng xuất hiện khi cuộn ---
const quanSat = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("hienra"); } });
}, { threshold: 0.15 });

document.querySelectorAll(".moc, .chuong-badge, .qt-the, .st-the, .qt-badge, .chopper-the, .knm-the, .wl-the").forEach(el => quanSat.observe(el));

/* ============ LIGHTBOX — xem ảnh toàn màn hình ============ */
(function lightbox() {
  // Dựng khung lightbox 1 lần
  const lb = document.createElement("div");
  lb.className = "lb";
  lb.innerHTML =
    '<button class="lb-nut lb-dong" aria-label="Đóng">✕</button>' +
    '<button class="lb-nut lb-truoc" aria-label="Ảnh trước">‹</button>' +
    '<figure class="lb-khung">' +
      '<div class="lb-media"></div>' +
      '<figcaption class="lb-ghi"></figcaption>' +
    '</figure>' +
    '<button class="lb-nut lb-sau" aria-label="Ảnh sau">›</button>' +
    '<div class="lb-cham"></div>';
  document.body.appendChild(lb);

  const mediaEl = lb.querySelector(".lb-media");
  const ghiEl  = lb.querySelector(".lb-ghi");
  const chamEl = lb.querySelector(".lb-cham");
  const nutTruoc = lb.querySelector(".lb-truoc");
  const nutSau   = lb.querySelector(".lb-sau");

  let gHienTai = 0, iHienTai = 0;

  function hienAnh(huong) {
    const g = THU_VIEN[gHienTai];
    const a = g.anh[iHienTai];
    const dir = huong === -1 ? "trai" : "phai";
    // tạo lại thẻ media mỗi lần -> vừa chạy hiệu ứng, vừa dừng video cũ
    mediaEl.innerHTML = laVideo(a.src)
      ? `<video class="lb-anh vao ${dir}" src="${a.src}" controls autoplay playsinline></video>`
      : `<img class="lb-anh vao ${dir}" src="${a.src}" alt="ảnh kỷ niệm">`;

    ghiEl.textContent = a.ghi || "";
    ghiEl.style.display = a.ghi ? "" : "none";

    const nhieu = g.anh.length > 1;
    nutTruoc.style.display = nhieu ? "" : "none";
    nutSau.style.display   = nhieu ? "" : "none";

    // chấm chỉ số ảnh
    chamEl.innerHTML = nhieu
      ? g.anh.map((_, i) => `<span class="${i === iHienTai ? "on" : ""}" data-i="${i}"></span>`).join("")
      : "";
  }

  function di(delta) {
    const n = THU_VIEN[gHienTai].anh.length;
    iHienTai = (iHienTai + delta + n) % n;
    hienAnh(delta);
  }

  function mo(g, i) {
    gHienTai = g; iHienTai = i;
    lb.classList.add("mo");
    document.body.style.overflow = "hidden";
    hienAnh(1);
  }

  function dong() {
    lb.classList.remove("mo");
    document.body.style.overflow = "";
    mediaEl.innerHTML = "";   // dừng video đang phát
  }

  // Bấm vào ảnh trong thẻ -> mở lightbox (dùng delegation để nội dung sinh sau vẫn chạy)
  document.addEventListener("click", e => {
    const el = e.target.closest(".mo-lightbox");
    if (el && el.dataset.g !== undefined) mo(+el.dataset.g, +el.dataset.i);
  });

  nutTruoc.addEventListener("click", e => { e.stopPropagation(); di(-1); });
  nutSau.addEventListener("click",   e => { e.stopPropagation(); di(1); });
  lb.querySelector(".lb-dong").addEventListener("click", dong);
  chamEl.addEventListener("click", e => {
    const s = e.target.closest("span[data-i]");
    if (s) { iHienTai = +s.dataset.i; hienAnh(1); }
  });
  // bấm ra vùng tối -> đóng
  lb.addEventListener("click", e => { if (e.target === lb) dong(); });

  // bàn phím
  document.addEventListener("keydown", e => {
    if (!lb.classList.contains("mo")) return;
    if (e.key === "Escape") dong();
    else if (e.key === "ArrowLeft") di(-1);
    else if (e.key === "ArrowRight") di(1);
  });

  // vuốt trên điện thoại — theo ngón tay, mượt, và chặn trang nền cuộn theo
  let x0 = null, y0 = null, dxHienTai = 0, dangKeo = false, ngang = null;

  function anhDang() { return mediaEl.querySelector(".lb-anh"); }

  lb.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    dxHienTai = 0; ngang = null; dangKeo = false;
    const anh = anhDang();
    if (anh) anh.style.transition = "none";   // tắt animation để kéo theo tay
  }, { passive: true });

  lb.addEventListener("touchmove", e => {
    // chặn trang nền cuộn theo cho MỌI hướng khi lightbox mở (cần passive:false)
    if (e.cancelable) e.preventDefault();
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;

    // quyết định hướng vuốt ngay lần di chuyển đầu
    if (ngang === null) ngang = Math.abs(dx) > Math.abs(dy);

    if (!ngang) return;                 // vuốt dọc: chỉ chặn cuộn, không kéo ảnh
    dangKeo = true;
    dxHienTai = dx;
    const anh = anhDang();
    if (anh) {
      anh.style.transform = `translateX(${dx}px)`;
      anh.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 600));
    }
  }, { passive: false });

  lb.addEventListener("touchend", () => {
    if (x0 === null) return;
    const dx = dxHienTai;
    const anh = anhDang();
    x0 = y0 = null;

    if (dangKeo && Math.abs(dx) > 60) {
      di(dx < 0 ? 1 : -1);              // đủ xa -> qua ảnh khác (hienAnh sẽ tạo thẻ mới có hiệu ứng)
    } else if (anh) {
      // chưa đủ xa -> trượt về chỗ cũ mượt mà
      anh.style.transition = "transform .25s ease, opacity .25s ease";
      anh.style.transform = "translateX(0)";
      anh.style.opacity = "1";
    }
    dangKeo = false;
  }, { passive: true });
})();
