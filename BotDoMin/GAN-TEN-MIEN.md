# Gắn tên miền + HTTPS cho web cược

Mục tiêu: thay `http://103.72.98.37:3002` bằng `https://nghienpal.com` cho người chơi
dễ vào, không bị điện thoại cảnh báo "không an toàn", và **WebSocket của Blackjack vẫn
chạy** (đây là chỗ dễ hỏng nhất, xem mục 4).

Code bot KHÔNG cần sửa gì: `WEB_PLAY_URL` đã là biến môi trường, còn trang Blackjack tự
đổi `ws://` sang `wss://` khi thấy trang chạy HTTPS.

---

## 1. Mua tên miền + trỏ DNS

Mua ở đâu cũng được (Namecheap / Cloudflare / Porkbun / Tenten…). Sau khi mua, vào phần
quản lý DNS, tạo 2 bản ghi trỏ về IP VPS:

| Type | Name | Value          |
|------|------|----------------|
| A    | @    | 103.72.98.37   |
| A    | www  | 103.72.98.37   |

Nếu dùng Cloudflare: **tắt đám mây cam (DNS only)** khi chạy certbot lần đầu, xong bật
lại cũng được. Bật proxy ngay từ đầu sẽ làm certbot không xác thực được.

Chờ DNS lan (thường 5–30 phút). Kiểm tra trên VPS:

```bash
dig +short nghienpal.com     # phải ra 103.72.98.37
```

## 2. Mở firewall cổng web

```bash
ufw allow 80
ufw allow 443
```

Cổng 3002 sau khi có nginx thì **không cần mở ra internet nữa** (nginx gọi nội bộ).
Đóng lại cho an toàn: `ufw delete allow 3002`

## 3. Cài nginx + certbot

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

## 4. Cấu hình nginx (BẮT BUỘC có phần WebSocket)

Tạo file `/etc/nginx/sites-available/nghienpal`:

```nginx
server {
    listen 80;
    server_name nghienpal.com www.nghienpal.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;

        # === 3 DÒNG NÀY LÀ SỐNG CÒN CHO BLACKJACK ===
        # Thiếu chúng thì trang vẫn mở được nhưng WebSocket /ws bị nginx chặn,
        # bàn Blackjack sẽ đứng im (đèn 🔴, không chia bài, không chat).
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;   # WS im lặng lâu vẫn không bị cắt

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Bật site rồi nạp lại:

```bash
ln -s /etc/nginx/sites-available/nghienpal /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 5. Bật HTTPS (miễn phí, tự gia hạn)

```bash
certbot --nginx -d nghienpal.com -d www.nghienpal.com
```

Chọn `2` (redirect hết HTTP sang HTTPS). Certbot tự sửa file nginx ở trên và tự cài
cron gia hạn 90 ngày/lần.

## 6. Đổi link bot phát cho người chơi

Sửa `/root/tts-bot/BotDoMin/.env`:

```
WEB_PLAY_URL=https://nghienpal.com
```

Rồi khởi động lại:

```bash
pm2 restart BotDoMin --update-env
```

`--update-env` là bắt buộc, không có nó pm2 vẫn xài biến môi trường cũ.

## 7. Nghiệm thu

- `https://nghienpal.com` mở được, có ổ khóa xanh.
- Đăng nhập bằng ID + PIN.
- **Tab Blackjack: đèn phải là 🟢** (🔴 = thiếu 3 dòng WebSocket ở mục 4).
- Ngồi ghế, đặt cược, chat thử — thấy bong bóng nổi trên đầu là WS chạy đúng.
- Trong Discord bấm nút lấy link, phải ra `https://nghienpal.com` chứ không phải IP.

---

## Panel admin thì sao?

Panel (cổng 1508 / 3001) **nên để nguyên IP, đừng gắn tên miền**. Tên miền công khai +
Google index = mời người lạ tới dò mật khẩu. Nếu vẫn muốn có tên miền cho panel thì
dùng tên miền phụ khó đoán (`quantri-xyz123.nghienpal.com`) và thêm giới hạn IP trong
nginx.
