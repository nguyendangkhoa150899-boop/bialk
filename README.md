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

## Đã làm chiều 29/09 — cần test (checklist đầy đủ ở README repo `tlbbnetco4`)

- **Tab 🛠️ GM Thiên Long trong admin** (`panel.js` → `/api/gm/state|items|act` → `tlbb.gmCall` → panel GM `https://127.0.0.1:8443/api/*`, khóa `PANEL_PASS` trong `secrets.env`). Chỉ cổng SUPER thao tác được. Không cần đăng nhập gm.netco4.click nữa (vẫn còn chạy để share tạm).
- **Shop Item + Quà mỗi ngày mở lại**: `palworld.js` trỏ `giveItem`/`countItem` sang `tlbb.js` → hàng đợi quà panel GM (`quatang.lua`), đồ vào túi khi đăng nhập/đổi bản đồ, không cần online. Danh mục 23.789 món tải lúc khởi động (`tlbb.loadItems`). Đã nạp: 33 ngọc cấp 6 (nhóm 💎 Thuộc Tính `ammo` 4/ngày, 💎 Chỉ Số `material` 5/ngày, **đang tắt, giá tạm 99.999**), Yếu Quyết môn phái (nhóm `yq`, mỗi lần 1): 60 quyển kỹ năng cấp 45/65/80 giá 60.000 (gồm 24 quyển "điển bí" cấp 80 lúc đầu gắn nhầm 120.000, đã hạ). Nhóm **⚔️ KỸ NĂNG TIẾN CẤP** (`tiencap`, mỗi lần 1): **60 quyển tiến giai nhánh chính cấp 90** (`30308200`–`30308314`, vd Nộ Hỏa Liên Trảm-Tuyệt Sát) giá **300.000** (chủ server test thấy mạnh, đặt 29/09). Nhóm **📜 BÍ TỊCH KINH MẠCH** (`bitich`): 48 quyển "-Tri/-Hộ Thể/-Giải… cấp 1" (`30308320`–`30308373`, rót huyệt Đốc mạch) giá **120.000** (giá tạm, chủ server chưa chốt). Nhóm hàng đã đổi tên cho Thiên Long. Rương Ích Kỷ vẫn còn (thừa với Thiên Long, nên tắt).
- **Web → game nhận Vàng không khóa** (thẻ riêng, 1 KNB = 1 vàng, qua hàng đợi `loai=vang`; hạn riêng `_dogVangDayMax`, panel ô "Đổi KNB → vàng", tạm 30.000/ngày). Thẻ "Chuyển KNB từ game ra web" đã ẩn (dùng NPC Ví Web). Chiều vàng → web chưa làm.
- 30 icon ngọc `assets/itemimage/ngoc_<hàng>_<cột>.png` (96px), chưa gắn món.
- **Cầu KNB game ↔ web đã test 8 case OK** (29/09).

- **Cổng admin THƯỜNG (`PANEL_PUBLIC_PORT`, mật khẩu `PANEL_PASSWORD`) được sửa SHOP** (giá, nhóm, hạn, hình, tick bán) để bạn bè giúp đặt giá — 29/09. Vẫn bị chặn: liên kết nhân vật, GM, ví, các game. **Khoá phiên bản**: nút Lưu shop gửi cả bảng, nên server từ chối (409) nếu bảng đã cũ so với lần lưu cuối → F5 rồi sửa lại. Log ghi cổng + IP mỗi lần lưu. Chủ server sẽ phát triển tiếp vai admin thường.

- **Tab 💥 Drop Boss** (29/09 tối, cả admin lẫn mod — mod tạm mở để test chung, đóng lại theo chú thích `29/09 tạm MỞ` trong `panel.js`): sửa đồ rơi của 4.247 boss ngay trên web. `dropboss.js` ghi thẳng 2 file drop trên VPS (backup `/opt/tlbb-backup/dropui-*`), **hiệu lực sau restart game**; sửa xong phải đồng bộ về repo game (`lay-tu-server.sh --push`) trước lần `cap-nhat.sh` kế.

## Còn làm / chưa kiểm chứng

- Chưa test thật: mua shop → đổi bản đồ nhận đồ; nhận quà mỗi ngày; đổi vàng nhận đúng 1.000 vàng (không phải đồng); tab GM bấm từng nút trong trình duyệt.
- Chưa đặt giá 33 viên ngọc 6; chưa quyết hạn đổi vàng/ngày; icon ngọc chưa khớp tên.
- Tên đơn vị trong code vẫn là `points` / `dog*` (chỉ đổi chữ hiển thị thành KNB).
- Đã xóa dữ liệu Palworld (29/09): `pals.json`, `passives.json`, `gameitems.json`, `shop_items.js`, `assets/palimage/`, ảnh item trong `assets/itemimage/` (chỉ giữ `kimnguyenbao.jpg`), 154 món shop seed. Code Palworld còn trong `index.js`/`webplay.js`/`panel.js` nhưng tab, mục panel (class `pwOff`) và nút đã ẩn/tắt; log khởi động báo "Khong doc duoc pals.json/passives.json" là bình thường.
- Poker chạy tiến trình riêng (`Poker/index.js`, cổng 3003), chưa dựng trên VPS.

Chi tiết từng game: README trong từng thư mục (`BotDoMin/README.md`, `TaiXiu/`, `SieuTaiXiu/`, `Roulette/`, `Poker/`, `TienLen/`). Phần Palworld trong `BotDoMin/README.md` là lịch sử, không còn đúng.
