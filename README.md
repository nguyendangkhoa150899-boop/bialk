# NetCo4 Mini Game

Mini game (Tài Xỉu, Siêu Tài Xỉu, Roulette, Dò Mìn, Leo Thang, Vòng Quay, Phi Thuyền, Cổ phiếu, Tiến Lên, Poker) cho server **Thiên Long Bát Bộ NetCo4**. Tiền là **Kim Nguyên Bảo (KNB)**, chuyển qua lại với KNB trong game theo tỉ giá **1:1**.

> Từ 29/09/2026 repo này **không còn dùng cho Palworld**. Palworld dashboard, love-timeline, BotNoi đã xóa; tính năng Palworld trong bot đã tắt (`BotDoMin/palworld.js` là bản rỗng). Server game: repo [`tlbbnetco4`](https://github.com/nguyendangkhoa150899-boop/tlbbnetco4).

## Chạy ở đâu

| | |
|---|---|
| VPS | `103.216.118.123` (**cùng máy với server game**), SSH cổng `24700` |
| Thư mục | `/opt/minigame` (bản sao repo này, không có `.git`), bot trong `/opt/minigame/BotDoMin` |
| Dịch vụ | `systemctl restart minigame` / `journalctl -u minigame -f` (systemd, KHÔNG dùng pm2) |
| Cấu hình | `/opt/minigame/BotDoMin/.env` (token Discord, mật khẩu panel, không commit) |
| Dữ liệu | `/opt/minigame/BotDoMin/database.json` (ví KNB, bắt đầu mới 29/09, không commit) |
| Web người chơi | **https://netco4.click** (và `play.netco4.click`) → nginx → `127.0.0.1:3002` |
| Panel admin | **https://admin.netco4.click** → nginx → `127.0.0.1:1508` (SUPER, mật khẩu trong `.env`) |
| Panel game | https://gm.netco4.click (panel Thiên Long, repo tlbbnetco4) |

HTTPS: Let's Encrypt qua certbot (tự gia hạn), cấu hình nginx ở `/etc/nginx/sites-available/netco4`. Tường lửa chỉ mở 80/443 cho web; cổng 3002/1234/1508 chỉ nghe nội bộ sau nginx.

Deploy sau khi sửa code (từ máy có SSH key):
```bash
tar -cf - --exclude=.git --exclude=node_modules --exclude=database.json --exclude=.env . \
  | ssh -p 24700 root@103.216.118.123 'tar -C /opt/minigame -xf - && systemctl restart minigame'
```

## Cầu KNB với game (`BotDoMin/tlbb.js`)

Bot và game cùng máy nên trao đổi qua **file** trong `/opt/tlbb-root/home/tlbb/Server/txt/NetCo4Web/`, không qua mạng. Không ghi thẳng database game: KNB của nhân vật đang chơi nằm trong RAM (ShareMemory), ghi DB sẽ bị server ghi đè.

- **Game → web (không giới hạn):** trong game gặp NPC **"Ví Web NetCo4"** (Lạc Dương 203,323 · Đại Lý 154,170; script `999999`, `CDK/CDK.lua` bên repo game), chọn số KNB. Game **trừ KNB trong game** rồi ghi phiếu `out/<GUID>_<giờ>_<số>.txt` ("GUID số END"). Bot đọc mỗi 5 giây, cộng ví, chuyển phiếu sang `out/xong/`. Chống cộng trùng: tên phiếu lưu ở `database.json` `_tlbbSeen` trước khi chuyển.
- **Web → game (30.000 KNB/người/ngày):** tab 💸 Chuyển/Rút hoặc nút Discord. Bot trừ ví rồi ghi `<GUID>.in` (dòng "mã số ok", ghi tạm + đổi tên). Game phát KNB khi nhân vật **đăng nhập hoặc đổi bản đồ**, ghi mã vào `<GUID>.done` trước khi phát (không phát trùng). Không cần online lúc chuyển.
- **Liên kết ví ↔ nhân vật:** chỉ admin. Panel → ví người chơi → ô tên nhân vật: gõ **tên nhân vật hoặc GUID**, bot tra `tlbbdb.t_char` và lưu `tlbbGuid`. 1 nhân vật chỉ gắn 1 ví.
- Hạn ngày: `DOG_BRIDGE_DAY_DEF` (30.000) và ô hạn ngày trên panel chỉ áp chiều rút; chiều nạp bỏ qua trong `dogBridgeDayCheck`.

## Icon

Icon KNB chính: `BotDoMin/assets/knb.png` (256×256, nền trong suốt, tách từ `assets/itemimage/kimnguyenbao.jpg`). Web dùng đường dẫn `/knb.png`. Tin nhắn Discord dùng `KNB_EMOJI` trong `.env` (đang đặt `<:knb:1554355126167412796>`, emoji server Discord tạo từ `knb.png`; không đặt thì hiện 🪙).

## Còn làm / chưa kiểm chứng

- Chưa thử chuyển KNB thật cả 2 chiều trong game (NPC Ví Web có hiệu lực từ restart game 29/09 ~11:50).
- Tab 💸 Chuyển/Rút trên web vẫn còn ô "nạp từ game" kiểu cũ: bấm sẽ hiện hướng dẫn ra NPC. Nên sửa giao diện cho rõ.
- Tên đơn vị trong code vẫn là `points` / `dog*` (chỉ đổi chữ hiển thị thành KNB).
- Đã xóa dữ liệu Palworld (29/09): `pals.json`, `passives.json`, `gameitems.json`, `shop_items.js`, `assets/palimage/`, ảnh item trong `assets/itemimage/` (chỉ giữ `kimnguyenbao.jpg`), 154 món shop seed. Code Palworld còn trong `index.js`/`webplay.js`/`panel.js` nhưng tab, mục panel (class `pwOff`) và nút đã ẩn/tắt; log khởi động báo "Khong doc duoc pals.json/passives.json" là bình thường.
- Poker chạy tiến trình riêng (`Poker/index.js`, cổng 3003), chưa dựng trên VPS.

Chi tiết từng game: README trong từng thư mục (`BotDoMin/README.md`, `TaiXiu/`, `SieuTaiXiu/`, `Roulette/`, `Poker/`, `TienLen/`). Phần Palworld trong `BotDoMin/README.md` là lịch sử, không còn đúng.
