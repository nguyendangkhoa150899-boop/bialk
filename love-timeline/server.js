/* =============================================================
   SERVER — phục vụ web + Dashboard upload ảnh (chạy: node server.js)
   - Web:       http://localhost:8080
   - Dashboard: http://localhost:8080/admin
   - Không mật khẩu — chỉ chia sẻ link cho người thân.
   ============================================================= */
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// jimp để tạo ảnh thu nhỏ (thumbnail). Nếu chưa cài (chưa npm install) thì bỏ qua, web vẫn chạy.
let Jimp = null;
try { Jimp = require("jimp").Jimp; }
catch { console.log("(Chưa có jimp — tạm bỏ qua thumbnail, chạy 'npm install' để bật.)"); }

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(ROOT, "du-lieu.json");
const THUMB_DIR = path.join(ROOT, "Lib", "Thumb");
const LA_VIDEO = /\.(mp4|webm|ogg|mov|m4v)$/i;

/* ---------- Tạo thumbnail (~400px) từ 1 ảnh; trả đường dẫn thumb hoặc null ---------- */
async function taoThumb(srcRel) {
  if (!Jimp || !srcRel || LA_VIDEO.test(srcRel)) return null;
  try {
    const absSrc = path.join(ROOT, srcRel);
    if (!fs.existsSync(absSrc)) return null;
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    const thumbRel = "Lib/Thumb/" + path.basename(srcRel).replace(/\.[^.]+$/, "") + ".jpg";
    const absThumb = path.join(ROOT, thumbRel);
    if (fs.existsSync(absThumb)) return thumbRel; // đã có rồi
    const img = await Jimp.read(absSrc);
    const scale = 400 / Math.max(img.width, img.height);
    if (scale < 1) img.resize({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) });
    const buf = await img.getBuffer("image/jpeg", { quality: 72 });
    fs.writeFileSync(absThumb, buf);
    return thumbRel;
  } catch (e) { console.log("Thumb lỗi:", srcRel, "-", e.message); return null; }
}

const app = express();
app.use(express.json());

/* ---------- Log tạm để soi request /api/* (theo dõi qua pm2 logs) ---------- */
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const t0 = Date.now();
  console.log(`[api] ${req.method} ${req.path} <- START`);
  res.on("finish", () => console.log(`[api] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - t0}ms)`));
  next();
});

/* ---------- Dữ liệu ---------- */
// Dữ liệu khởi tạo khi VPS chưa có du-lieu.json (file này KHÔNG đẩy lên git)
const SEED = {
  sticker: {},
  timeline: {},
  soThich: {
    khoa: { thich: ["Game Game suốt ngày Game"] },
    hanh: { thich: ["La Khoa"] }
  },
  kyNiem: [
    { id: "kn1", tieuDe: "Yêu Xa", ke: "", anh: [] },
    { id: "kn2", tieuDe: "Đồ ăn Hạnh nấu", ke: "", anh: [] },
    { id: "kn3", tieuDe: "Cute", ke: "", anh: [] },
    { id: "kn4", tieuDe: "Cãi nhau", ke: "", anh: [] }
  ]
};
function docData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return JSON.parse(JSON.stringify(SEED)); }
}
function ghiData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), "utf8"); }
function timAlbum(d, id) { return (d.kyNiem || []).find(a => a.id === id); }

// Lần đầu chạy trên máy mới (VPS): tạo du-lieu.json từ SEED
if (!fs.existsSync(DATA_FILE)) { try { ghiData(SEED); } catch {} }

/* ---------- Chặn truy cập trực tiếp file nhạy cảm ---------- */
app.use((req, res, next) => {
  if (/^\/(admin\.html|server\.js|package.*|du-lieu\.json$|\.firebaserc|firebase\.json|node_modules|CHO-CLAUDE|WISHLIST-HUONG)/i.test(req.path))
    return res.status(403).send("403");
  next();
});

/* ---------- API đọc dữ liệu (công khai, web đọc lên) ---------- */
app.get("/api/data", (req, res) => res.json(docData()));

/* ---------- Upload ảnh/video vào Lib/ ---------- */
function safeName(orig) {
  const ext = (path.extname(orig) || "").toLowerCase();
  // NFD tách dấu ra khỏi chữ; [^a-zA-Z0-9] loại luôn dấu + khoảng trắng -> tên file an toàn
  let base = path.basename(orig, ext).normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "file";
  return base + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000) + ext;
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const laVideo = /^video\//.test(file.mimetype);
    const dir = path.join(ROOT, "Lib", laVideo ? "Video" : "HinhAnh");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, safeName(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

/* ---------- Dashboard (trang + API) ---------- */
app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin.html")));

// tạo album
app.post("/api/album", (req, res) => {
  const d = docData();
  const album = { id: "a" + Date.now(), tieuDe: (req.body.tieuDe || "Kỷ niệm mới").trim(), ke: "", anh: [] };
  d.kyNiem = d.kyNiem || [];
  d.kyNiem.push(album);
  ghiData(d);
  res.json(album);
});

// sửa tên/mô tả album
app.patch("/api/album/:id", (req, res) => {
  const d = docData(); const a = timAlbum(d, req.params.id);
  if (!a) return res.status(404).json({ loi: "Không thấy album" });
  if (req.body.tieuDe !== undefined) a.tieuDe = req.body.tieuDe;
  if (req.body.ke !== undefined) a.ke = req.body.ke;
  ghiData(d); res.json(a);
});

// xoá album
app.delete("/api/album/:id", (req, res) => {
  const d = docData();
  d.kyNiem = (d.kyNiem || []).filter(a => a.id !== req.params.id);
  ghiData(d); res.json({ ok: true });
});

// upload nhiều file vào 1 album
app.post("/api/upload", upload.array("files", 50), async (req, res) => {
  const d = docData(); const a = timAlbum(d, req.body.albumId);
  if (!a) return res.status(404).json({ loi: "Không thấy album" });
  const ghi = req.body.ghi || "";
  for (const f of (req.files || [])) {
    const laVideo = /^video\//.test(f.mimetype);
    const src = "Lib/" + (laVideo ? "Video" : "HinhAnh") + "/" + f.filename;
    const photo = { src, ghi };
    const thumb = await taoThumb(src);
    if (thumb) photo.thumb = thumb;
    a.anh.push(photo);
  }
  ghiData(d); res.json(a);
});

// sửa note 1 tấm
app.patch("/api/photo", (req, res) => {
  const d = docData(); const a = timAlbum(d, req.body.albumId);
  if (!a || !a.anh[req.body.index]) return res.status(404).json({ loi: "Không thấy ảnh" });
  a.anh[req.body.index].ghi = req.body.ghi || "";
  ghiData(d); res.json(a);
});

// xoá 1 tấm (xoá cả file trên đĩa)
app.delete("/api/photo", (req, res) => {
  const d = docData(); const a = timAlbum(d, req.body.albumId);
  if (!a || !a.anh[req.body.index]) return res.status(404).json({ loi: "Không thấy ảnh" });
  const [removed] = a.anh.splice(req.body.index, 1);
  ghiData(d);
  try { if (removed && removed.src) fs.unlinkSync(path.join(ROOT, removed.src)); } catch {}
  try { if (removed && removed.thumb) fs.unlinkSync(path.join(ROOT, removed.thumb)); } catch {}
  res.json(a);
});

// đổi thứ tự (di chuyển 1 tấm từ from -> to)
app.post("/api/reorder", (req, res) => {
  const d = docData(); const a = timAlbum(d, req.body.albumId);
  if (!a) return res.status(404).json({ loi: "Không thấy album" });
  const { from, to } = req.body;
  if (from >= 0 && to >= 0 && from < a.anh.length && to < a.anh.length) {
    const [m] = a.anh.splice(from, 1); a.anh.splice(to, 0, m);
  }
  ghiData(d); res.json(a);
});

/* ---------- Ảnh cho từng MỐC TIMELINE (key = tiêu đề mốc) ---------- */
function tlList(d, key) {
  d.timeline = d.timeline || {};
  d.timeline[key] = d.timeline[key] || [];
  return d.timeline[key];
}
app.post("/api/tl-upload", upload.array("files", 50), async (req, res) => {
  const key = req.body.key;
  if (!key) return res.status(400).json({ loi: "Thiếu mốc" });
  const d = docData(); const arr = tlList(d, key); const ghi = req.body.ghi || "";
  for (const f of (req.files || [])) {
    const v = /^video\//.test(f.mimetype);
    const src = "Lib/" + (v ? "Video" : "HinhAnh") + "/" + f.filename;
    const photo = { src, ghi };
    const thumb = await taoThumb(src);
    if (thumb) photo.thumb = thumb;
    arr.push(photo);
  }
  ghiData(d); res.json(arr);
});
app.patch("/api/tl-photo", (req, res) => {
  const d = docData(); const arr = (d.timeline || {})[req.body.key];
  if (!arr || !arr[req.body.index]) return res.status(404).json({ loi: "Không thấy ảnh" });
  arr[req.body.index].ghi = req.body.ghi || ""; ghiData(d); res.json(arr);
});
app.delete("/api/tl-photo", (req, res) => {
  const d = docData(); const arr = (d.timeline || {})[req.body.key];
  if (!arr || !arr[req.body.index]) return res.status(404).json({ loi: "Không thấy ảnh" });
  const [r] = arr.splice(req.body.index, 1); ghiData(d);
  try { if (r && r.src) fs.unlinkSync(path.join(ROOT, r.src)); } catch {}
  try { if (r && r.thumb) fs.unlinkSync(path.join(ROOT, r.thumb)); } catch {}
  res.json(arr);
});
app.post("/api/tl-reorder", (req, res) => {
  const d = docData(); const arr = (d.timeline || {})[req.body.key];
  if (!arr) return res.status(404).json({ loi: "Không thấy mốc" });
  const { from, to } = req.body;
  if (from >= 0 && to >= 0 && from < arr.length && to < arr.length) { const [m] = arr.splice(from, 1); arr.splice(to, 0, m); }
  ghiData(d); res.json(arr);
});

/* ---------- Sticker (1 ảnh cho mỗi ô: bìa, sở thích, chopper) ---------- */
const storageSticker = multer.diskStorage({
  destination: (req, file, cb) => { const dir = path.join(ROOT, "Lib", "Sticker"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => cb(null, safeName(file.originalname))
});
const uploadSticker = multer({ storage: storageSticker, limits: { fileSize: 50 * 1024 * 1024 } });

app.post("/api/sticker-upload", uploadSticker.single("file"), (req, res) => {
  const slot = req.body.slot;
  if (!slot || !req.file) return res.status(400).json({ loi: "Thiếu slot/file" });
  const d = docData(); d.sticker = d.sticker || {};
  const old = d.sticker[slot];
  d.sticker[slot] = "Lib/Sticker/" + req.file.filename;
  ghiData(d);
  if (old && old !== d.sticker[slot]) { try { fs.unlinkSync(path.join(ROOT, old)); } catch {} }
  res.json({ slot, src: d.sticker[slot] });
});
app.delete("/api/sticker", (req, res) => {
  const d = docData(); d.sticker = d.sticker || {};
  const old = d.sticker[req.body.slot];
  delete d.sticker[req.body.slot]; ghiData(d);
  if (old) { try { fs.unlinkSync(path.join(ROOT, old)); } catch {} }
  res.json({ ok: true });
});

/* ---------- Sở thích (danh sách "thích" của mỗi người) ---------- */
app.post("/api/sothich", (req, res) => {
  const who = req.body.who; // "khoa" | "hanh"
  if (!who) return res.status(400).json({ loi: "Thiếu who" });
  const d = docData(); d.soThich = d.soThich || {};
  d.soThich[who] = d.soThich[who] || {};
  if (Array.isArray(req.body.thich)) d.soThich[who].thich = req.body.thich.map(s => String(s).slice(0, 200));
  ghiData(d); res.json(d.soThich[who]);
});

/* ---------- Web tĩnh (đặt cuối) ---------- */
app.use(express.static(ROOT));

/* ---------- Tạo thumbnail cho ảnh CŨ (đã up trước khi có tính năng này) ---------- */
async function taoThumbConThieu() {
  if (!Jimp) return;
  try {
    const d = docData();
    const lists = [];
    Object.values(d.timeline || {}).forEach(arr => { if (Array.isArray(arr)) lists.push(arr); });
    (d.kyNiem || []).forEach(a => { if (a && Array.isArray(a.anh)) lists.push(a.anh); });
    let dem = 0;
    for (const arr of lists) {
      for (const p of arr) {
        if (p && p.src && !p.thumb && !LA_VIDEO.test(p.src)) {
          const t = await taoThumb(p.src);
          if (t) { p.thumb = t; dem++; }
        }
      }
    }
    if (dem) { ghiData(d); console.log("Đã tạo " + dem + " thumbnail cho ảnh cũ."); }
  } catch (e) { console.log("Tạo thumbnail ảnh cũ lỗi:", e.message); }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log("Web:        http://localhost:" + PORT);
  console.log("Dashboard:  http://localhost:" + PORT + "/admin");
  taoThumbConThieu();
});
