# BÀN GIAO DỰ ÁN — "Chuyện tình mình" (love-timeline)

> Dán / mở nguyên file này cho Claude để nắm bối cảnh và làm tiếp ĐÚNG HƯỚNG.
> Cập nhật lần cuối: 20/07/2026 — đã deploy lên VPS thật; thêm **mục 13** ghi lại quy trình deploy đúng + các bẫy (CRLF, cache, token). ĐỌC MỤC 13 trước khi động tới deploy.

---

## 0. CÁCH LÀM VIỆC (giữ y như vậy)
- **Trả lời tiếng Việt**, xưng **"mình"**, gọi người dùng là **"Khoa"** (chồng). Vợ tên **Hạnh**.
- Ngắn gọn, thực tế, **thành thật** — làm không được thì nói thẳng, đừng hứa suông; có rủi ro (mất dữ liệu, bảo mật) thì cảnh báo.
- Người dùng **không rành code** → giải thích dễ hiểu, chỉ rõ sửa file/dòng nào.
- Mỗi lần sửa xong: **kiểm cú pháp** (`node -c noi-dung.js`, `node --check script.js`, `node --check server.js`) rồi **mở lại web** cho Khoa xem (thường mình tự chạy server + mở trình duyệt).
- Windows + Git Bash: gõ tiếng Việt qua `curl` bị lỗi font (mojibake) — đó là do terminal, KHÔNG phải bug. Trình duyệt/Node fetch gửi UTF-8 vẫn chuẩn.

## 1. DỰ ÁN LÀ GÌ
Web kể chuyện tình **Khoa & Hạnh** (yêu xa, Hạnh ở Mỹ) tiến tới cưới 2026. Tiếng Việt. Ban đầu là web tĩnh, **giờ đã có backend Node** để có Dashboard upload ảnh. Mục tiêu: đưa lên **VPS** (Khoa đã có VPS chạy 2 bot Discord) + tên miền, cho vợ xem/thêm nội dung bằng iPhone.

## 2. KIẾN TRÚC QUAN TRỌNG (đọc kỹ)
Có **2 nguồn nội dung**, web ưu tiên dashboard, thiếu thì lùi về file:
1. **`noi-dung.js`** = nội dung "gốc/fallback" viết cứng trong code (text câu chuyện, mốc timeline, cấu hình).
2. **`du-lieu.json`** = dữ liệu **động do Dashboard ghi** (ảnh/video đã upload, sticker, sở thích, album kỷ niệm). File này **KHÔNG đẩy git**, sống trên VPS.

Luồng: `script.js` khi tải trang `fetch("/api/data")` (hoặc `du-lieu.json`) vào biến `DASH`. Mỗi mục render: **có dữ liệu trong DASH thì dùng, không thì fallback `noi-dung.js`**. Vậy khi có server → dashboard là "chủ"; mở offline (file://) → chạy bằng noi-dung.js.

## 3. CẤU TRÚC FILE
```
love-timeline/
├── index.html      # khung + thẻ PWA; nạp Firebase SDK, noi-dung.js, script.js
├── noi-dung.js     # nội dung gốc/fallback (Khoa sửa text ở đây)
├── script.js       # logic render toàn site + lightbox + wishlist (ít khi cần sửa)
├── style.css       # giao diện
├── server.js       # BACKEND Express: phục vụ web + /admin + API upload. Chạy: node server.js
├── admin.html      # DASHBOARD (mật khẩu) — self-contained (inline CSS+JS)
├── du-lieu.json    # DỮ LIỆU động (dashboard ghi). GITIGNORED. Server tự tạo từ SEED nếu thiếu.
├── package.json    # deps: express, multer
├── manifest.json   # PWA "Thêm vào Màn hình chính"
├── firebase.json + .firebaserc  # (tuỳ chọn) deploy Firebase Hosting — giờ ưu tiên VPS
├── _server.js      # server test tĩnh cũ (không có dashboard) — có thể bỏ
├── .gitignore      # chặn node_modules + du-lieu.json + Lib/HinhAnh|Video|Sticker
├── DEPLOY.md       # hướng dẫn GitHub + VPS (pm2 + Caddy)
├── WISHLIST-HUONG-DAN.md  # hướng dẫn tạo Firebase cho wishlist
└── Lib/
    ├── Icon/       # icon PWA (icon-192/512, apple-touch-icon) — CÓ trong git
    ├── Sticker/    # sticker đã tách nền (gitignored)
    ├── HinhAnh/    # ảnh thường (gitignored)
    ├── Video/      # video .mp4 (gitignored)
    └── DOC-FILE-NAY.txt
```
**Quy ước:** đường dẫn luôn đầy đủ `Lib/HinhAnh/...`, `Lib/Video/...`, `Lib/Sticker/...`. Tên file **không dấu, không khoảng trắng** (server tự đổi tên an toàn khi upload).

## 4. MÔ HÌNH DỮ LIỆU

### noi-dung.js (fallback/gốc)
- **THONG_TIN**: `ten1`, `ten2`, `anh1`/`anh2` (sticker mặt bìa — fallback), `ngayQuen` = `2023-07-15` (mốc đếm ngày bên nhau), `sinhNhat1` (1999-08-15), `sinhNhat2` (2002-07-01), `loiKet`.
- **TIMELINE**: `[{ ngay, chuong, tieuDe, ke, noi?, anh[], kieu }]`. `chuong` giống nhau → gom 1 badge. `anh[]` phần tử = `"Lib/..jpg"` hoặc `{src, ghi, keo}`. Video nhận theo đuôi (.mp4…). `keo` ∈ vang|hong|mint|tim|xanh. `kieu` = "polaroid" | "chat".
- **QUY_TAC**: `[{icon, tieuDe, ke}]` — "Luật của tụi mình".
- **CHOPPER**: `{ten, giong(ẩn), sticker, ke, anh[]}` — bé Poodle tiny.
- **SO_THICH**: `{nguoi1:{ten,emoji,sticker?,thich[]}, nguoi2:{...}}`.
- **KY_NIEM = []** (RỖNG) — kỷ niệm giờ do Dashboard quản lý hoàn toàn. Đừng thêm vào đây.
- **WISHLIST_FB**: config Firebase (đã điền, project `wishlist-8ea54`).

### du-lieu.json (dashboard ghi — nguồn chính khi có server)
```
{
  "sticker": { heroKhoa, heroHanh, soThichKhoa, soThichHanh, chopper }  // mỗi slot = 1 đường dẫn ảnh
  "timeline": { "m0":[{src,ghi}], "m1":[...], ..., "chopper":[...] }     // list ảnh theo KEY
  "soThich": { "khoa":{thich:[...]}, "hanh":{thich:[...]} }
  "kyNiem":  [ {id, tieuDe, ke, anh:[{src,ghi}]} ]                        // album động
}
```
- **Ảnh timeline** keyed `"m"+index` theo THỨ TỰ mốc trong TIMELINE. Site `dungTimeline` đọc `DASH.timeline["m"+idx]`, có thì **đè** `moc.anh`. ⚠ Chèn/xoá/đảo mốc trong noi-dung.js sẽ lệch mapping — **thêm mốc ở cuối thì an toàn**; muốn bền hơn phải đổi sang id cố định mỗi mốc.
- **Album Chopper** dùng chung cơ chế keyed, key = `"chopper"` trong `timeline`.

## 5. BACKEND (server.js)
- Chạy: `node server.js` → Web `http://localhost:8080`, Dashboard `/admin`.
- **Đăng nhập**: Basic Auth, mật khẩu = env `DASH_PASS` (mặc định `yeu-nhau` — PHẢI đổi khi lên VPS). Chỉ chặn `/admin` + API ghi; web + `GET /api/data` công khai.
- **SEED**: có hằng SEED (4 album kn1-4 + sở thích mẫu). Nếu `du-lieu.json` chưa tồn tại → server tự tạo.
- **API** (ghi cần auth):
  - `GET /api/data` — trả du-lieu.json (web đọc).
  - Album kỷ niệm: `POST /api/album` · `PATCH /api/album/:id` · `DELETE /api/album/:id` · `POST /api/upload` (multipart: albumId, ghi, files) · `PATCH /api/photo` (albumId,index,ghi) · `DELETE /api/photo` · `POST /api/reorder` (albumId,from,to).
  - List keyed (timeline + chopper): `POST /api/tl-upload` (key, ghi, files) · `PATCH /api/tl-photo` · `DELETE /api/tl-photo` · `POST /api/tl-reorder` (key,from,to).
  - Sticker (1 ảnh/ô, lưu Lib/Sticker): `POST /api/sticker-upload` (slot, file) · `DELETE /api/sticker` (slot).
  - Sở thích: `POST /api/sothich` (who: "khoa"|"hanh", thich:[...]).
- Upload: ảnh→`Lib/HinhAnh`, video→`Lib/Video`, sticker→`Lib/Sticker`. Tên file tự chuẩn hoá ASCII + timestamp. Xoá ảnh = xoá cả file trên đĩa.

## 6. DASHBOARD (admin.html)
Trang cuộn dọc **mirror theo site** (nạp /style.css + /noi-dung.js để lấy tên mốc). Các mục theo thứ tự: **💛 Bìa** (2 sticker) → **🕐 Timeline** (mỗi mốc 1 thẻ + upload) → **✦ Sở thích** (2 người: sticker + danh sách sở thích có nút ＋ Thêm) → **🐩 Chopper** (sticker + album) → **✦ Kỷ niệm** (tạo/sửa/xoá album + upload) → nút **✓ Xong** (về trang chính).
- **Upload tại chỗ**: mỗi thẻ có ô chọn file + note chung + nút Tải lên.
- **Kéo-thả sắp xếp**: ảnh có nhãn hạng **★ Bìa / #2 / #3…**; **kéo thả** để đổi thứ tự (đã bỏ nút ↑↓). Tấm #1 = ảnh bìa + hiện đầu. (Kéo-thả HTML5 mượt trên máy tính; điện thoại cảm ứng kén — nếu cần sắp trên điện thoại thì làm kiểu bấm-chọn.)
- **Cropper tròn (kiểu Discord)**: khi chọn ảnh cho STICKER → mở modal canvas, kéo/zoom canh mặt trong vòng tròn → **Lưu** → xuất PNG tròn (nền trong suốt ngoài vòng, 512px) rồi upload.
- Xoá ở dashboard = xoá luôn trên site (đọc chung du-lieu.json) + xoá file trong Lib.

## 7. TÍNH NĂNG ĐÃ LÀM (site)
- Đếm ngày bên nhau (nhảy số) từ 15/07/2023; badge sinh nhật.
- Trang bìa: 2 sticker mặt + 💛 (fallback ô "+"); timeline 2 cột (mobile 1 cột) + hiện dần khi cuộn.
- Khối: Luật · Sở thích · Chopper · Kỷ niệm · **Wishlist (Firebase real-time)**.
- **Lightbox** toàn màn hình: ảnh/video, chuyển cảnh, note, chấm chỉ số, ‹ ›, phím ←→Esc, vuốt mobile, video autoplay+controls. Dùng **event delegation** (nội dung async vẫn bấm được).
- Băng keo polaroid nhiều màu; timeline mỗi thẻ tối đa 3 ảnh + badge "+N", bấm mở lightbox lướt hết.
- **iOS/PWA**: `100dvh`, `viewport-fit=cover`+`env(safe-area-inset)`, `-webkit-backdrop-filter`, tắt fixed-bg mobile; "Thêm vào Màn hình chính" chạy như app (chỉ hoạt động khi đã host HTTPS).
- **Tách nền ảnh trắng bằng jimp** (flood-fill từ mép) — đã dùng tạo sticker Chopper.

## 8. NỘI DUNG THẬT
- **Ngày:** gặp 28/06/2023 (sân bay Tân Sơn Nhất) · chính thức 15/07/2023 · cầu hôn 14/02/2026 (Valentine, Vũng Tàu) · cưới 01/03/2026 · lễ nhà thờ 17/04/2026.
- **Sinh nhật:** Khoa 15/08/1999 · Hạnh 01/07/2002.
- **4 lần Hạnh về:** mVillage Võ Thị Sáu · Airbnb Nam Kỳ Khởi Nghĩa · Khách sạn Ngọc Dung · nhà mình Sài Gòn (lần 4, hơn 4 tháng — lo cưới, chụp hình).
- **Du lịch (6 chuyến, mỗi chuyến 1 mốc):** Đà Lạt · Singapore · Hàn Quốc (Jeju) · Nha Trang · Hà Nội · Hạ Long.
- **Chi tiết:** quen qua bạn giới thiệu Facebook (Hạnh cần homestay); ấn tượng đầu (heo gấu bông / Khoa cao & "ẹo"); luật "không im lặng quá 24h"; Khoa làm lành trước; yêu xa đặt trà sữa/thuốc; tỏ tình & cầu hôn đều ở Vũng Tàu.
- **Chopper:** chó Poodle tiny, vợ rất thương.

## 9. QUY ƯỚC / LƯU Ý KỸ THUẬT (dễ vấp)
- **Render async + hiệu ứng cuộn**: các mục đọc DASH nên render sau khi fetch. `.qt-badge`/`.st-the`/`.chopper-the`/`.knm-the` mặc định `opacity:0` chờ IntersectionObserver. Hàm render async PHẢI tự `quanSat.observe(...)` **cả badge của nó** sau khi set innerHTML — nếu quên, tiêu đề mục sẽ ẩn mất (đã từng bị).
- **Timeline key theo index** (`m0..`) — xem cảnh báo ở mục 4.
- **UTF-8**: text/note tiếng Việt + emoji qua multipart/JSON lưu đúng (đã test Node fetch). Lỗi font chỉ xảy ra khi test bằng curl trong Git Bash.
- **Tên file/thư mục không dấu, không cách.** Server tự chuẩn hoá tên khi upload.
- Firebase SDK nạp qua CDN **compat 9.23.0** trong index.html (cần internet cho wishlist).

## 10. TRIỂN KHAI (GitHub + VPS) — xem DEPLOY.md
- **Đẩy git**: code. **KHÔNG đẩy** (đã .gitignore): `node_modules/`, `du-lieu.json`, `Lib/HinhAnh|Video|Sticker`. → nội dung up sống trên VPS, `git pull` không đè mất.
- **VPS**: `git pull` → `npm install` → `DASH_PASS="..." PORT=8090 pm2 start server.js --name love-timeline` → `pm2 save`. Đổi PORT nếu trùng bot. Đặt sau **Caddy** để có HTTPS + tên miền (PWA + mật khẩu cần HTTPS).
- Cập nhật sau: `git pull && npm install && pm2 restart love-timeline`.
- Server tĩnh nhẹ, chạy song song 2 bot Discord vô tư.

## 11. CÒN CÓ THỂ LÀM TIẾP (gợi ý)
- Điền nội dung THẬT: ảnh/video từng mốc + 6 chuyến du lịch + sticker mặt 2 đứa (qua Dashboard).
- Lời kể thật cho 6 chuyến du lịch + 2 mốc cưới (đang là placeholder "👉 …").
- Kéo-thả thân thiện cảm ứng (điện thoại) nếu cần sắp xếp bằng iPhone.
- Bảo mật wishlist mạnh hơn (hiện Firestore rules mở); hoặc mật khẩu cho cả trang.
- Mở rộng dashboard sửa được cả text mốc/tiêu đề (giờ text vẫn sửa trong noi-dung.js).
- Đếm ngược tới ngày cưới / nhạc nền / thư gửi vợ (các ý đã bàn, chưa làm).

## 12. CHẠY & KIỂM TRA NHANH
```
node server.js         # web + dashboard ở :8080  (đổi PORT/DASH_PASS bằng env)
```
- Web: http://localhost:8080 · Dashboard: http://localhost:8080/admin (mật khẩu yeu-nhau khi test).
- Cú pháp: `node -c noi-dung.js && node --check script.js && node --check server.js`.
- Sửa noi-dung.js/style.css/script.js → chỉ cần F5 (file tĩnh). Sửa server.js → phải restart node.

---

## 13. ⚠️ DEPLOY VPS — THỰC TẾ + BÀI HỌC (buổi 20/07/2026)
> Buổi này mất RẤT nhiều thời gian vì code bị sửa ở 2 nơi + cache điện thoại. Đọc kỹ để không lặp lại.

### Sự thật về VPS (đúng hiện trạng)
- **Repo trên VPS ở: `/root/tts-bot`** — KHÔNG phải `/root/bialk`. Đây là git root. love-timeline là thư mục con `/root/tts-bot/love-timeline`.
- Repo GitHub: `github.com/nguyendangkhoa150899-boop/bialk` — **monorepo** chung với bot Discord.
- **Branch trên VPS tên `master`, còn GitHub là `main`.** Đã set `master` theo dõi (`track`) `origin/main`. Từ nay đứng ở `/root/tts-bot` gõ `git pull` là đúng.
- Chạy bằng **pm2**, tên tiến trình `love-timeline` (chung máy với `BotDoMin`, `tts-bot`).
- Thông tin kết nối VPS (IP / port SSH / user / mật khẩu): **Khoa giữ riêng — KHÔNG ghi vào file này** vì file nằm trong git, lỡ lộ là chỉ đường cho người lạ.

### Quy trình deploy ĐÚNG (theo đúng thứ tự)
1. **Chỉ sửa code ở máy Windows** (`Desktop/bialk/bialk`). Xong: `git add … && git commit && git push origin main`.
2. Trên VPS:
   ```bash
   cd /root/tts-bot
   git checkout -- .          # bỏ thay đổi "ảo" do CRLF (xem Bẫy 1)
   git pull
   git log --oneline -1       # kiểm tra đúng commit mới nhất chưa
   ```
3. File tĩnh (html/js/css) → KHÔNG cần restart. Chỉ khi sửa `server.js` mới `pm2 restart love-timeline`.

### ⚠️ TUYỆT ĐỐI KHÔNG
- **KHÔNG sửa code trực tiếp trên VPS.** Buổi này lỗi kéo dài vì code từng bị sửa ở cả 2 nơi → git rẽ nhánh, pull không vào file, restart hoài vẫn chạy code cũ.
- **KHÔNG `git reset --hard` trên VPS** — sẽ đè mất `du-lieu.json` / `database.json` (dữ liệu SỐNG: ảnh vợ chồng up, lịch sử dashboard). Cần bỏ thay đổi 1 file thì `git checkout -- <đúng file đó>`.

### Bẫy 1 — CRLF (Windows ↔ Linux)  ← thủ phạm chính buổi này
File sửa trên Windows lưu kiểu xuống dòng CRLF, VPS Linux dùng LF → `git pull`/`merge`/`checkout` báo **"Your local changes would be overwritten"** DÙ `git diff` trống (không có nội dung khác thật). Chữa: chạy 1 lần `git config core.autocrlf input`, và luôn `git checkout -- .` trước khi pull. (Bền hơn: thêm file `.gitattributes` nội dung `* text=auto eol=lf`.)

### Bẫy 2 — Cache trình duyệt điện thoại  ← lý do "deploy xong mở lên y như cũ"
`style.css`/`script.js` là file tĩnh, không có service worker, nhưng cũng không tự đổi version → điện thoại giữ bản cũ đã lưu.
→ **Mỗi lần sửa css/js: tăng số `?v=` trong index.html** (dòng `<link … style.css?v=N>` và `<script src="script.js?v=N">`). Hiện đang **`?v=3`**. Đây là cách chắc ăn ép điện thoại tải bản mới, khỏi phải xoá cache tay.

### Bẫy 3 — Bảo mật token GitHub
Buổi này Khoa lỡ dán output `git remote -v` (có kèm token `ghp_…`) vào chat → **lộ token**, đã dặn revoke + tạo mới.
→ **Đừng bao giờ dán `git remote -v` hay lệnh chứa token ra ngoài.** Token nên để credential helper của git, không nhúng thẳng vào URL remote.

### Việc lightbox (đang làm dở)
- **Bug:** mở ảnh trên điện thoại, vuốt qua ảnh khác thì **trang nền phía sau cuộn theo**.
- **Đã sửa:** (a) chặn `touchmove` mọi hướng trong lightbox (`preventDefault`, listener `passive:false`); (b) `touch-action:none` cho `.lb` + ảnh con; (c) **khoá body bằng `position:fixed` + lưu/trả `scrollY`** (chuẩn iOS, thay `overflow:hidden` vốn vô dụng trên Safari mobile); (d) thêm hiệu ứng vuốt theo ngón tay; (e) `?v=3` chống cache. Commit mới nhất liên quan: `70bf243`.
- **CHƯA xác nhận chạy được trên máy thật.** Nếu Khoa báo vẫn cuộn: **HỎI BẰNG ĐƯỢC — iPhone hay Android? Trình duyệt gì (Safari / Chrome / hay mở trong app Zalo/Messenger)?** Mở trong app là môi trường webview khác, phải xử lý cách khác. Đừng sửa mù tiếp khi chưa có thông tin này.
