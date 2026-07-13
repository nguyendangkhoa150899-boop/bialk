# Đưa lên GitHub + chạy trên VPS

## Nguyên tắc (quan trọng)
- **Đẩy lên git**: code (html/js/css, server.js, admin.html, package.json, Lib/Icon...).
- **KHÔNG đẩy** (đã để trong `.gitignore`): `node_modules/`, `du-lieu.json`, `Lib/HinhAnh`, `Lib/Video`, `Lib/Sticker`.
  → Ảnh + nội dung vợ chồng up **sống trên VPS**, git pull không đè mất. Server tự tạo `du-lieu.json` (từ SEED) khi chưa có.

---

## A. Đẩy code lên GitHub (làm ở máy tính)

### Nếu tạo repo RIÊNG cho web này
```bash
cd "đường-dẫn/love-timeline"
git init
git add .
git commit -m "Web chuyện tình mình + dashboard"
git branch -M main
git remote add origin https://github.com/<user>/<ten-repo>.git
git push -u origin main
```

### Nếu gộp CHUNG repo với bot Discord (monorepo)
- Copy nguyên thư mục `love-timeline` vào trong repo bot.
- Trong thư mục repo bot:
```bash
git add love-timeline
git commit -m "Thêm web love-timeline"
git push
```
- Lưu ý: `.gitignore` của love-timeline dùng đường dẫn tương đối nên vẫn đúng khi nằm trong repo con.

---

## B. Chạy trên VPS (SSH vào VPS)

```bash
# 1. Lấy code về (lần đầu clone; sau này chỉ cần git pull)
git clone https://github.com/<user>/<ten-repo>.git
cd <ten-repo>            # hoặc cd <ten-repo>/love-timeline nếu monorepo

# 2. Cài thư viện
npm install

# 3. Chạy bằng pm2 (giống 2 con bot), đặt mật khẩu dashboard + cổng riêng
DASH_PASS="mat-khau-cua-khoa" PORT=8090 pm2 start server.js --name love-timeline
pm2 save
```

- **PORT**: nếu 8080 đang bị bot/khác dùng, đổi số khác (vd 8090). Nhớ mở cổng ở firewall nếu vào thẳng bằng IP.
- Test nhanh: `http://<IP-VPS>:8090`  → web; `/admin` → dashboard.
- Cập nhật sau này: `git pull && npm install && pm2 restart love-timeline`

---

## C. Tên miền + HTTPS (nên có — PWA & bảo mật mật khẩu cần HTTPS)
Dùng **Caddy** (tự xin SSL). Ví dụ `/etc/caddy/Caddyfile`:
```
chuyentinh.tenmien.com {
    reverse_proxy localhost:8090
}
```
Rồi `sudo systemctl reload caddy`. Xong có `https://chuyentinh.tenmien.com`.
(Trỏ DNS bản ghi A của `chuyentinh` về IP VPS trước.)

---

## Kiểm tra "work không"
1. `pm2 logs love-timeline` → thấy dòng "Web: http://localhost:PORT".
2. Mở web bằng IP/tên miền → cuộn xem timeline, mục.
3. `/admin` → đăng nhập (DASH_PASS) → up thử 1 ảnh → F5 web thấy ảnh.
4. File ảnh nằm trong `Lib/HinhAnh` trên VPS; `du-lieu.json` trên VPS cập nhật.
