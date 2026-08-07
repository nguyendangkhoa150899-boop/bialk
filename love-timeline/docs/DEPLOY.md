# Hướng dẫn Deploy — love-timeline (GitHub + VPS)

> File DUY NHẤT về deploy. Bàn giao tổng thể dự án xem `CHO-CLAUDE-O-NHA.md`; tạo Firebase cho wishlist xem `WISHLIST-HUONG-DAN.md`.

---

## ⚡ Cập nhật web (việc làm thường xuyên nhất)

**Chỉ sửa code ở máy Windows → đẩy GitHub → VPS kéo về.**
TUYỆT ĐỐI không sửa code trực tiếp trên VPS (sẽ làm git rẽ nhánh, kéo không vào file, mất công gỡ — đã dính rồi).

### 1) Trên máy Windows (thư mục `Desktop/bialk-main/bialk-main` — từ 07/08/2026, folder cũ `Desktop/bialk/bialk` không dùng nữa)
```bash
git add .
git commit -m "mô tả thay đổi"
git push origin main
```
> ⚠ Nếu vừa sửa `style.css` hoặc `script.js`: **tăng số `?v=` trong `index.html`** (dòng link css và dòng script) TRƯỚC khi commit. Không làm thì điện thoại dùng lại bản cũ trong cache → "deploy xong mở lên y như cũ". Hiện đang `?v=3`.

### 2) Trên VPS (SSH vào rồi)
```bash
cd /root/tts-bot
git checkout -- .        # bỏ thay đổi "ảo" do CRLF (xem Bẫy 1)
git pull
git log --oneline -1     # xem đã đúng commit mới nhất chưa
```
- Sửa file tĩnh (html/js/css) → xong luôn, **KHÔNG cần restart**.
- Chỉ khi sửa `server.js` mới cần: `pm2 restart love-timeline`.

---

## 📍 Sự thật về VPS (nhớ để khỏi lạc)
- Repo trên VPS ở **`/root/tts-bot`** (KHÔNG phải `/root/bialk`). love-timeline là thư mục con.
- GitHub: `github.com/nguyendangkhoa150899-boop/bialk` — **monorepo** chung với bot Discord.
- Branch trên VPS tên **`master`**, GitHub là **`main`** (master đã track `origin/main` → `git pull` chạy đúng).
- Chạy bằng **pm2**, tên tiến trình `love-timeline`, chung máy với `BotDoMin` và `tts-bot`.
- Thông tin SSH (IP / port / user / mật khẩu): **Khoa giữ riêng, KHÔNG ghi vào file trong git.**

---

## ⚠️ 3 cái bẫy đã vấp

**Bẫy 1 — CRLF (Windows ↔ Linux).** File sửa trên Windows lưu kiểu xuống dòng CRLF, VPS Linux dùng LF → `git pull` báo *"Your local changes would be overwritten"* DÙ `git diff` trống (không có nội dung khác thật). Chữa: chạy **một lần** `git config core.autocrlf input`, và luôn `git checkout -- .` trước khi pull.

**Bẫy 2 — Cache trình duyệt điện thoại.** css/js là file tĩnh, không có version → điện thoại giữ bản cũ. Mỗi lần sửa css/js phải **tăng `?v=` trong `index.html`**.

**Bẫy 3 — Token GitHub.** Đừng bao giờ dán `git remote -v` (kèm token `ghp_…`) hay lệnh chứa token ra ngoài. Lộ token = người khác ghi được vào repo. Token nên để credential helper, không nhúng thẳng vào URL remote.

**Không nên `git reset --hard` trên VPS.** Dữ liệu sống (`du-lieu.json`, `database.json`, ảnh/video) đã gitignore nên reset không xoá chúng — nhưng reset --hard vứt luôn mọi thứ khác không đáng. Cần bỏ thay đổi 1 file thì dùng `git checkout -- <đúng file đó>`.

---

## 📦 Nguyên tắc đẩy git
- **Đẩy**: code (html / js / css, `server.js`, `admin.html`, `package.json`, `Lib/Icon`…).
- **KHÔNG đẩy** (đã `.gitignore`): `node_modules/`, `du-lieu.json`, `database.json`, `Lib/HinhAnh`, `Lib/Video`, `Lib/Sticker`, `Lib/Thumb`.
  → Ảnh + nội dung vợ chồng up **sống trên VPS**, `git pull` không đè mất. Server tự tạo `du-lieu.json` từ SEED khi chưa có.

---

## 🚀 Lần đầu cài trên VPS (chỉ làm 1 lần)
```bash
git clone https://github.com/nguyendangkhoa150899-boop/bialk.git
cd bialk/love-timeline          # (hiện repo đang nằm ở /root/tts-bot)
npm install
DASH_PASS="mat-khau-cua-khoa" PORT=8090 pm2 start server.js --name love-timeline
pm2 save
```
- **PORT**: nếu trùng bot thì đổi số khác (vd 8090). Mở cổng firewall nếu vào thẳng bằng IP.
- Test nhanh: `http://<IP-VPS>:8090` → web; `/admin` → dashboard.

## 🔒 Tên miền + HTTPS (nên có — PWA & mật khẩu cần HTTPS)
Dùng **Caddy** (tự xin SSL). `/etc/caddy/Caddyfile`:
```
chuyentinh.tenmien.com {
    reverse_proxy localhost:8090
}
```
Rồi `sudo systemctl reload caddy`. (Trỏ DNS bản ghi A của `chuyentinh` về IP VPS trước.)

---

## ✅ Kiểm tra chạy được chưa
1. `pm2 logs love-timeline` → thấy dòng "Web: http://localhost:PORT".
2. Mở web bằng IP/tên miền → cuộn xem timeline.
3. `/admin` → đăng nhập (DASH_PASS) → up thử 1 ảnh → F5 web thấy ảnh.
4. File ảnh nằm trong `Lib/HinhAnh` trên VPS; `du-lieu.json` cập nhật.
