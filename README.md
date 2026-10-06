# NetCo4 Mini Game (repo `bialk`)

Bot Discord + web người chơi cho server **Thiên Long Bát Bộ "NetCo4"** (server riêng, khoảng 10 người bạn): mini game, ví **Kim Nguyên Bảo (KNB)** đổi 1:1 với KNB trong game, shop đồ, rương, túi boss, vòng quay, ghép ngọc, Thương Phố, panel admin.

> Repo **công khai**. Không ghi mật khẩu, token, khoá hay nội dung `.env` vào đây.

## Đọc gì trước

1. **[`BotDoMin/README.md`](BotDoMin/README.md)**: kiến trúc, bản đồ file, cầu nối game, deploy, luật viết code, kiểm thử.
2. Repo game **[`tlbbnetco4`](https://github.com/nguyendangkhoa150899-boop/tlbbnetco4)**: `CLAUDE.md` và `docs/BAN-GIAO.md` là tài liệu bàn giao chính (bắt đầu phiên mới từ `BAN-GIAO.md`). Thiết kế tính năng của bot: `docs/TUI-BOSS.md`, `docs/GHEP-NGOC.md`, `docs/VONG-QUAY.md`, `docs/THUONG-PHO.md`; nhật ký: `docs/TRANG-THAI.md`.

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `BotDoMin/` | Bot chính: `index.js` (Discord + toàn bộ logic tiền), `webplay.js` (web người chơi), `panel.js` (panel admin), `tlbb.js` (cầu với game) và các mô-đun tính năng |
| `TaiXiu/` | Lõi tiền bàn Sic Bo (`cua.js`) + bộ kiểm `kiemtra/` |
| `SieuTaiXiu/` | ⚡ Bàn Tài Xỉu có phí (`ban.js`, `cua.js`) |
| `Roulette/` | 🎡 Roulette (`ban.js`, `cua.js`) |
| `TienLen/` | 🀄 Tiến Lên Miền Nam, ăn KNB thật (`web.js` nhúng vào bot; `index.js` chỉ để chạy thử ở máy) |
| `Poker/` | 🃏 Giải Poker chip ảo (`web.js` nhúng vào bot; `index.js` chỉ để chạy thử ở máy) |

Năm thư mục game đều được `BotDoMin/index.js` nạp bằng `require`, chạy chung một tiến trình. Mỗi thư mục có README riêng về luật và tiền.

## Chạy ở máy

```bash
cd BotDoMin
npm install            # discord.js, dotenv, @resvg/resvg-js
# tạo BotDoMin/.env (KHÔNG commit), các biến chính:
#   TOKEN, PLAY_PORT, PANEL_PORT, PANEL_PUBLIC_PORT, PANEL_SUPER_PASSWORD,
#   PANEL_PASSWORD, WEB_PLAY_URL, KNB_EMOJI  (đủ danh sách: BotDoMin/README.md mục 11)
node index.js          # phải đứng trong BotDoMin/: database.json và log_*.txt tính theo thư mục hiện tại
```

- Web và panel chỉ bật sau khi bot đăng nhập Discord. Không có token thì dùng cách "Discord giả" ở `BotDoMin/README.md` mục 10.
- Máy nhà không có game nên cầu KNB, danh sách nhân vật, giao đồ sẽ báo lỗi. Bình thường.
- Chép `BotDoMin/.env.example` thành `BotDoMin/.env`, điền `TOKEN` và mật khẩu. Bot phải chạy từ trong `BotDoMin/` (đường dẫn `database.json`, `log_*.txt` là tương đối).

## Production

- VPS `103.216.118.123` (chung máy với game), SSH cổng `24700`.
- Bot ở `/opt/minigame/BotDoMin` (**không phải git checkout**, file được chép lên), dịch vụ `minigame.service`.
- Web người chơi `play.netco4.click` → cổng 3002; panel SUPER `admin.netco4.click` → 1508; cổng mod (chỉ xem) `mod.netco4.click` → 1234.
- Cách deploy và các bước kiểm: `BotDoMin/README.md` mục 8.

## Lịch sử

Repo này từng là bot cho Palworld (tiền Dogcoin). Từ 29/09/2026 chuyển sang Thiên Long NetCo4, Dogcoin đổi thành KNB 1:1. Code Palworld đã xoá ngày 06/10/2026 (commit `8a7d86a`, `a5a109c`). Các tên `dog*` còn lại trong code là cầu KNB đang chạy, không phải code chết.
