# BotDoMin: bot Discord + web người chơi cho server Thiên Long NetCo4

> **Viết cho người (hoặc phiên Claude) tiếp nhận mà chưa biết gì.** Đọc mục 0 trước khi sửa dòng nào.
> Tài liệu này mô tả **trạng thái hiện tại** của code. Lịch sử theo ngày nằm trong `git log` và nhật ký bên repo game.

**Tài liệu chính nằm ở repo game** `tlbbnetco4` (GitHub `nguyendangkhoa150899-boop/tlbbnetco4`, máy nhà: `D:\TeraBoxDownload\TLBBFULLTOOL\netco4\github-repo`):

| File (repo game) | Nội dung |
|---|---|
| `CLAUDE.md` | Luật làm việc, VPS, mục "Bot mini game ... kinh nghiệm đã trả giá" (deploy, quyền 2 cổng, viết giao diện) |
| `docs/BAN-GIAO.md` | **Bắt đầu phiên mới từ đây**: đang làm gì, việc còn mở |
| `docs/TRANG-THAI.md` | Nhật ký theo ngày |
| `docs/TUI-BOSS.md` · `docs/GHEP-NGOC.md` · `docs/VONG-QUAY.md` · `docs/THUONG-PHO.md` | Thiết kế + luật từng tính năng của bot |

Luật bài/tiền từng game nằm ở README trong thư mục game: `../TaiXiu/`, `../SieuTaiXiu/`, `../Roulette/`, `../TienLen/`, `../Poker/`.

---

## 0. Luật cứng

| Luật | Vì sao |
|---|---|
| Repo **công khai**. Không ghi mật khẩu, token, khoá, nội dung `.env` / `secrets.env` vào code hay tài liệu. | Ai cũng đọc được. |
| **Không commit** `.env`, `database.json`, `log_*.txt`, `thu/du-lieu-mau.json`, `thu/db-thu.json`, ảnh `assets/itemimage/*.webp` mới up tay. `.gitignore` đã chặn. | `database.json` chứa ví và **mật khẩu game thô** (`gamePass`). |
| **Không sửa tay `database.json` trên prod khi bot đang chạy.** Đổi cấu hình thì gọi API cổng SUPER. | Bot giữ DB trong RAM (`dbCache`), ghi đè file mỗi 10 giây và lúc tắt (SIGTERM). |
| Tạo tag rollback **`truoc-<việc>-<dd-mm>`** trước khi sửa. Chỉ commit/push khi chủ server bảo. | Có người đang chơi bằng tiền thật. |
| **Không chạy `cap-nhat.sh`** (deploy game). Chủ server tự chạy. Deploy bot thì được (mục 8). | Script đó restart game. |
| Đừng dựng lại code Palworld (mục 12). Tên `dog*` / `/api/dogbridge/*` **là cầu KNB đang chạy**, không phải code chết. | Đã dọn 2 đợt ngày 06/10. |
| Trả lời chủ server bằng **tiếng Việt**. | |

---

## 1. Bot này là gì

Server Thiên Long Bát Bộ "NetCo4" (khoảng 10 người bạn) dùng bot này cho 3 việc:

1. **Bot Discord**: lệnh `/sodu`, `/diemdanh`, `/nghien`, `/chuyentien`; các bảng tự cập nhật trong kênh (Tài Xỉu đặt cược được, bảng "chơi trên web" của Dò Mìn / Leo Thang / Phi Thuyền / Siêu Tài Xỉu, bảng vay nợ, kênh KNB); thông báo Ghép Ngọc.
2. **Web người chơi** (`play.netco4.click`): mini game, ví **KNB** (Kim Nguyên Bảo, đổi 1:1 với KNB trong game), shop đồ, rương, túi boss, vòng quay, ghép ngọc, Thương Phố. Đăng nhập bằng **tài khoản + mật khẩu game**.
3. **Panel admin** (`admin.netco4.click`, cổng SUPER) và **cổng mod** (`mod.netco4.click`, chỉ xem).

Tên miền (nginx `/etc/nginx/sites-enabled/netco4`, đã kiểm 06/10): `play.` → 3002, `admin.` → 1508, `mod.` → 1234, `gm.` → panel GM của game `https://127.0.0.1:8443`. Riêng `netco4.click` là trang **Bảng Rơi** tĩnh `/var/www/netco4` (dựng từ repo game `tools/bang-roi`), một phần chuyển tiếp sang 3002.

Bot chạy **cùng VPS** với game và nói chuyện với game qua **file** + **panel GM** nội bộ, không ghi thẳng database game (KNB của nhân vật đang chơi nằm trong RAM của game, ghi DB sẽ bị đè).

---

## 2. Kiến trúc

```
 Discord ⇄ index.js (1 tiến trình node, systemd minigame.service)
              │  dbCache (RAM) ⇄ database.json  (ghi atomic mỗi 10 giây nếu đổi + lúc SIGTERM)
              │  ctx = các hàm của index.js truyền cho web/panel
              ├── webplay.js  :3002  web người chơi  ← nginx ← play.netco4.click
              ├── panel.js    :1508  panel SUPER     ← nginx ← admin.netco4.click
              │               :1234  cổng mod (cùng code, chỉ xem) ← mod.netco4.click
              ├── ../TaiXiu ../SieuTaiXiu ../Roulette ../TienLen ../Poker  (mô-đun game, nạp bằng require)
              └── tlbb.js, thuongpho.js, tuiboss.js, tlbbaudit.js, dropboss.js
                     │
                     ├─ file: /opt/tlbb-root/home/tlbb/Server/txt/NetCo4Web/  (KNB, Long Văn, Thương Phố, túi boss)
                     ├─ file: Server/Log/Audit_*.log (ai hạ boss), Server/Config + Public/Config (drop boss)
                     ├─ MySQL game (chỉ đọc, chroot mysql): danh sách nhân vật
                     └─ HTTPS 127.0.0.1:8443 = panel GM (repo game, panel/panel.py), header X-NetCo4-Key
                            → hàng đợi quà Server/txt/NetCo4Qua/<GUID>.txt → script game quatang.lua
                                                                       ↓
                                                 game Thiên Long (chroot /opt/tlbb-root, tlbb.service)
```

Web và panel chỉ được khởi động **trong `client.once('ready')`** của Discord (index.js). Không đăng nhập được Discord thì không có web.

---

## 3. Bản đồ file

### Trong `BotDoMin/`

| File | Việc |
|---|---|
| `index.js` (~7.950 dòng) | **Toàn bộ logic tiền + game**: bot Discord, ví, Tài Xỉu, Dò Mìn, Leo Thang, Vòng quay nhóm, Phi Thuyền, Cổ phiếu, điểm danh, vay nợ, shop, Rương Ích Kỷ, quà, cầu KNB, nạp các mô-đun bên dưới, dựng `ctx` rồi gọi `startWebPlay` / `startPanel`. |
| `webplay.js` (~5.100) | Web người chơi (cổng `PLAY_PORT`). Trang là **mảng chuỗi** `const PAGE = [...]`. Đăng nhập, phiên (tối đa 5 máy/ví), chặn ví chưa liên kết, chặn mục admin tắt, gọi `ctx.*`. Phục vụ `/poker/`, `/tienlen/`, `/tb.js`, `/tp.js`, `/gn.js`, `/itemicon/*`, ảnh trong `assets/`. |
| `panel.js` (~5.300) | Panel admin, 2 cổng cùng code (`PANEL_PORT` = SUPER, `PANEL_PUBLIC_PORT` = mod). HTML là **một template literal**. Gọi panel GM qua `tlbb.gmCall`. Phục vụ `/br.js`, `/br-data.json`, `/gn-admin.js`. |
| `tlbb.js` | Cầu tới game: KNB web↔game (`sendKnb`, `readReceipts`…), phiếu Long Văn (`readLvReceipts`), đọc nhân vật từ MySQL (`listChars`, `findChar`, `viscii()` giải tên VISCII bị mã hoá 2 lần), `gmCall` tới panel GM, danh mục ~23.800 vật phẩm (`loadItems`), giao đồ/pet (`giveItem`, `givePet`), mật khẩu game (`kiemMk`, `doiMk`, `guidsOfAcc`). |
| `tlbbaudit.js` | Đọc `Server/Log/Audit_*.log` 10 giây/lần, gom dòng "Dropped by" của boss thành lượt giết → `dbCache._bossKills` (thẻ 🏹 Boss đã hạ). |
| `tuiboss.js` | 🎒 Túi đồ boss: đọc `NetCo4Web/tuiboss.log` (game ghi khi boss cuối hoạt động chết), tạo túi theo GUID, bốc sẵn đồ; Nhận = đồ vào hàng đợi quà + KNB vào ví. Cấu hình theo hoạt động. Xem `docs/TUI-BOSS.md`. |
| `tuiboss.client.js` | Giao diện túi boss cho trang Cá nhân, phục vụ ở `/tb.js`. |
| `ghepngoc.js` | 💎 Ghép Ngọc (kiểu "Upgrade" CS:GO): bỏ đồ Rương Ích Kỷ (+ KNB nếu bật) để luyện ra món đích theo tỉ lệ giá trị. Cấu hình `_gnCfg`. Xem `docs/GHEP-NGOC.md`. |
| `ghepngoc.client.js` | Giao diện người chơi, `/gn.js`. |
| `ghepngoc.admin.js` | Giao diện admin (cổng SUPER), `/gn-admin.js`. |
| `ghepngoc.anh.js` | Vẽ ảnh PNG kết quả gửi Discord (SVG → PNG bằng `@resvg/resvg-js`, font DejaVu). Thiếu thư viện thì quay về gửi chữ. |
| `vongquay.js` | 🍀 Vòng May Mắn: trả KNB mở vòng 24 món, dùng lượt quay để rút, quà vào rương vòng quay rồi Nhận vào game. Cấu hình `_vqCfg`. Xem `docs/VONG-QUAY.md`. |
| `petboss.js` | 🐾 Chọn Pet Boss: mỗi ví nhận 1 pet Huyễn Hóa (chọn skin + kiểu), hiện như 1 món trong nhóm ⭐ của shop. Danh mục lấy từ panel GM `/api/pets`. Cấu hình `_petBoss`. |
| `thuongpho.js` | 🏪 Thương Phố: kho đồ trên web **theo từng nhân vật** (gửi từ NPC Ví Web, chỉ rút về đúng nhân vật đó). Dựng `thuongpho-cho.txt` (danh sách món được chuyển). Xem `docs/THUONG-PHO.md`. |
| `thuongpho.client.js` | Giao diện Thương Phố, `/tp.js`. |
| `dropboss.js` | 💥 Tab Drop Boss: đọc/ghi `MonsterDropBoxs.txt` + `DropBoxContent.txt` **thẳng trên VPS** (latin1), nhật ký chỉ-ghi-thêm `/opt/tlbb-backup/dropboss-audit.jsonl`, rollback. Hiệu lực sau restart game. |
| `nhatky.js` | 📒 Nhật ký theo ngày: mọi `writeLog` ghi thêm vào `nhatky/YYYY-MM-DD.log`, giữ 3 ngày; panel đọc (cổng mod bị che IP). |
| `itemicon.js` | Icon vật phẩm game: chỉ mục `data/itemicons.json`, tấm ảnh ở `ITEMICON_DIR` (ngoài git, mặc định `/opt/minigame/itemicon`), phục vụ `/itemicon/*`. |
| `bangroi.panel.js` | 📊 Tab Bảng rơi / đề xuất farm trên panel, `/br.js`; dữ liệu `/br-data.json` = `data.json` của `tools/bang-roi` (repo game) ở `/var/www/netco4/`. |
| `assets.js` + `assets/` | File tĩnh (ảnh, âm thanh, `knb.png`, `itemimage/`): thả file vào `assets/` rồi restart. Có ETag. |
| `data/itemicons.json` | Chỉ mục icon, tạo bằng tool `tools/icon-vat-pham/lam.js` bên repo game. |
| `data/vongquay-macdinh.json` | Bộ quà mặc định của Vòng May Mắn. |
| `thu/ghepngoc-local.js` | Chạy thử Ghép Ngọc ở máy nhà (`node thu/ghepngoc-local.js` → `http://localhost:3999`) với ảnh chụp dữ liệu prod `thu/du-lieu-mau.json` (gitignore, có dữ liệu người chơi). |
| `.env.example` | Mẫu `.env` (viết lại 06/10 theo đúng các biến code đang đọc, không có giá trị thật). |

Chỉ có trên VPS (không trong git): `.env`, `database.json`, `log_system.txt` / `log_result.txt` / `log_bet.txt` / `log_admin.txt` (cắt số dòng), thư mục `nhatky/`. Đường dẫn `./database.json` và `./log_*.txt` **tính theo thư mục đang đứng**, nên phải chạy bot từ trong `BotDoMin/`.

### Thư mục game bên cạnh (đều được `index.js` nạp bằng `require`)

| Thư mục | Nạp ở đâu trong `index.js` | Việc |
|---|---|---|
| `../TaiXiu/` | `TX_CUA = require(TAIXIU_DIR/cua.js)` | Lõi tiền bàn Sic Bo 52 cửa (thuần logic). Vòng ván Tài Xỉu vẫn ở index.js (`txState`, `runTaiXiuLoop`). |
| `../SieuTaiXiu/` | `SIEU_CUA` (`cua.js`) + `stxBan = ban.js.taoBan(...)` | ⚡ Bàn Tài Xỉu thứ hai, có phí. Khoá DB `_stx*`. |
| `../Roulette/` | `RL_CUA` (`cua.js`) + `rlBan = ban.js.taoBan(...)` | 🎡 Roulette 154 cửa. Khoá DB `_rl*`. |
| `../TienLen/` | `tienlenMod = web.js.taoSanh(...)` | 🀄 Tiến Lên Miền Nam, **ăn KNB thật** giữa người chơi. `index.js` trong thư mục chỉ để chạy thử ở máy. |
| `../Poker/` | `pokerMod = web.js.taoPoker(...)` | 🃏 Giải Poker, chip ảo. Nhúng chung web (`/poker/`). `Poker/index.js` chỉ để chạy riêng ở máy, prod không dùng. |

Mỗi đường dẫn đổi được bằng biến `*_DIR` (mục 11), dùng khi chạy bản test ngoài repo.

---

## 4. Tính năng cho người chơi (web `webplay.js`)

Thanh trên: nhóm **👤 HỒ SƠ / 🎮 MINI GAME**, thêm **🃏 GIẢI POKER** và **🀄 TIẾN LÊN** khi admin bật (`_pokerOn`, `_tienlenOn`).

| Trang (nav) | Ở đâu |
|---|---|
| 🎲 Tài Xỉu (bàn đơn giản 4 cửa khi `_txSimple` bật, không thì bàn 52 cửa) | index.js (`txState`, `txPlanPayout`) + `../TaiXiu/cua.js` |
| ⚡ Siêu Tài Xỉu, 🎡 Roulette (ẩn tới khi admin bật) | `../SieuTaiXiu/`, `../Roulette/` |
| 💣 Dò Mìn, 🪜 Leo Thang | index.js `webMinesApi`, `webStairsApi`; cấu hình Dò Mìn `_minesCfg` |
| 🎡 Vòng Quay (nhóm, 2 tầng) | index.js `wheelRoom` |
| 📈 Cổ phiếu, 🚀 Phi Thuyền | index.js `stock*`, `spm*` |
| 🍀 Vòng May Mắn | `vongquay.js` |
| 💎 Ghép Ngọc | `ghepngoc.js` + `/gn.js` |
| 📒 Nợ, 🎁 Quà (nút ẩn, chỉ hiện khi có nợ / có quà), 🚕 "Xu đi taxi về" (thua trong ngày được nhận lại một khoản) | index.js `debt*`, `giftClaim`, `taxi*` + sổ lãi-lỗ ngày `_loNgay` |
| 🪪 Cá nhân: điểm danh, nghiện, 🎒 Túi đồ boss, 🏹 Boss đã hạ, 🎮 đổi mật khẩu game | index.js `claimDaily`/`claimNghien`/`claimStreak`; `tuiboss.js` + `/tb.js`; `tlbbaudit.js` (`/api/boss/log`); `/api/doimk` → `tlbb.doiMk` |
| 🧰 Rương Ích Kỷ: giữ đồ mua ở shop, Long Văn gửi từ game, quà; Nhận vào game, Tặng, dùng phiếu KNB (cộng thẳng ví). **Không còn bán đồ** (06/10, chặn ở server). | index.js `ichKy*` |
| 🏪 Thương Phố | `thuongpho.js` + `/tp.js` |
| 🛒 Shop Item (+ thẻ 🐾 Chọn Pet Boss trong nhóm ⭐) | index.js `itemShopBuy`; `petboss.js` |
| 💸 Chuyển/Rút: chuyển KNB cho người khác, rút KNB vào game, đổi KNB → vàng không khoá | index.js `/api/transfer*`, `webRutGame` |

Chặn ở server, không phải ở giao diện:
- **Chưa liên kết nhân vật = chỉ được xem** (`webplay.js`, danh sách CHỪA ngay sau kiểm phiên: đường `.../state|table|hist|cd|ds` và các đường rút tiền ván dở). Route mới thêm mặc định bị chặn. Liên kết chỉ admin làm (mục 5).
- Mục admin tắt (`_featOff`) chặn các đường hành động trong `HANH_DONG` của `webplay.js`.
- Đăng nhập Discord ID + PIN **đã bỏ** (30/09). `/api/login` chỉ nhận tài khoản game; bot gửi MD5 cho panel GM so (`kiem_mk`), tìm ví theo `gameAcc` hoặc theo GUID nhân vật đã liên kết. Không tự tạo ví.

---

## 5. Panel admin (`panel.js`)

| Tab | Việc | Cổng |
|---|---|---|
| 🎲 Tài Xỉu · ⚡ Siêu TX · 🎡 Roulette · 💣 Dò Mìn · 🪜 Leo Thang · 🎡 Vòng Quay · 🚀 Phi Thuyền · 📈 Cổ phiếu · 🃏 Poker · 🀄 Tiến Lên | Bật/tắt, nhịp ván, RTP, trần cược, ép kết quả, bảng Discord | SUPER |
| 👥 Người chơi | Ví (cộng/trừ/đặt), vay nợ, mức điểm danh, công tắc chức năng, sàn cược | SUPER |
| 🎁 Quà tặng | Quà mỗi ngày + cấu hình Vòng May Mắn, cấp lượt quay | SUPER |
| 🧰 Rương Ích Kỷ | Bảng giá bán cũ (tính năng bán đã chặn) | SUPER |
| 💎 Ghép Ngọc | `/gn-admin.js`, API `/api/gn/*` | SUPER |
| 📦 Kho đồ | Giao đồ Thiên Long cho 1 người (vào game / vào Rương) | SUPER |
| 🛠️ GM Thiên Long | Trạng thái server, gỡ kẹt đăng nhập, restart game, tạo tài khoản (gắn ví), phát quà / GM nhân vật (`GM_KINDS`: vật phẩm, xoá vật phẩm, KNB, vàng, cấp, VIP, pet…), mẫu đồ chế, ám khí → `gmCall` | SUPER |
| 💥 Drop Boss · 🎒 Túi Boss | Sửa drop (`dropboss.js`), cấu hình túi boss | SUPER sửa; mod xem túi boss |
| 🐉 Thiên Long & KNB | Kênh KNB, **liên kết ví ↔ nhân vật** (`/api/tlbb/lienket`, nhập tên hoặc GUID), hạn ngày cầu KNB, Shop Item + nhóm hàng (khoá phiên bản, lưu bảng cũ bị 409), cấu hình Pet Boss | SUPER |
| 📊 Bảng rơi · 🍀 Vòng quay (xem) · 💎 Ghép Ngọc (xem) | Chỉ xem | mod + SUPER |
| 📜 Log | 📒 Nhật ký (mod thấy, che IP), lịch sử từng game, sổ biến động KNB, bảng vay nợ | Nhật ký: cả 2; còn lại SUPER |

**Quyền 2 cổng:** cổng SUPER nhận ra bằng `epOk(req)` (= `req.socket.localPort === PANEL_PORT`), có mật khẩu riêng `PANEL_SUPER_PASSWORD`. Cổng mod **mở không cần mật khẩu** (`PANEL_MOD_MO` khác `0`), và sau `isAuthed` mọi `/api/*` của cổng mod trả 403, **trừ** `/api/whoami`, `/api/nhatky`, `/api/tuiboss/xem`, `/api/gn/xem`, `/api/vq/xem`. Thêm route chỉ-xem cho mod thì đặt **trước** dòng chặn đó và thêm tab vào `modApp()` → `DUOC=[...]`. `VIEWONLY_PATHS` chỉ còn là lớp phụ.

---

## 6. `database.json` (dữ liệu sống)

Mỗi người chơi `db[discordId]`: `points` (ví KNB) · `name` · `ingameName` + `tlbbGuid` (liên kết nhân vật, **chỉ admin đặt**; bot tự sửa tên theo GUID lúc khởi động và mỗi 6 giờ) · `gameAcc` + `gamePass` (đăng nhập web, mật khẩu **thô**) · điểm danh `lastDaily`, `dailyDays`, `streakRun`, `streakPacks`, `streakTotal`, `streakRunPaid`, `lastNghien` · `lastWheelKey` · `debt` · `shopOnce` · `ichKy` (rương) · `vq` (vòng quay) · `gn` (ghép ngọc) · `petBoss` · `sosAt`. Ví mới: `STARTING_KNB = 20`.

Khoá cấu hình/trạng thái (gạch dưới đầu), nhóm theo việc:

| Nhóm | Khoá |
|---|---|
| Cầu KNB / game | `_dogBridge` (công tắc chiều), `_dogBridgeDayMax`, `_dogVangDayMax`, `_tlbbSeen`, `_tlbbLvSeen`, `_tp`, `_tpCfg`, `_tpSeen`, `_tuiBoss`, `_tuiBossCfg`, `_tuiBossCfgLog`, `_tuiBossGop`, `_tuiBossPos`, `_bossKills`, `_auditPos`, `_auditVer` |
| Sổ + phiên | `_dogLedger` (sổ KNB, **không** ghi mini game: `DOG_LEDGER_BO_QUA`), `_pstats`, `_webSessions`, `_webChat`, `_panelAddDaily`, `_loNgay`, `_taxiCfg`, `_taxiNhan` |
| Shop / quà / rương | `_itemShop`, `_itemCats`, `_itemShopDay*`, `_itemShopGroupQuota`, `_itemShopGroupDay`, `_itemShopImplantMax`, `_itemShopAmmoMax`, `_itemShopMatMax`, `_giftShop`, `_ichKyBan`, `_petBoss`, `_vqCfg`, `_vqLog`, `_vqMigHVQ`, `_gnCfg`, `_gnLog` |
| Tài Xỉu | `_txTime`, `_txSimple`, `_txRTP`, `_txThang`, `_txTran`, `_txMaxBet`, `_txNoti`, `_txBets`, `_txPlan`, `_txHist20`, `_txDashHistory`, `_txPot`, `_txChannelId`, `_txMsgId` |
| Game khác | `_stx*`, `_rl*` (do `ban.js` ghi), `_mines*`, `_stairs*`, `_minesCfg`, `_wheel*`, `_spm*`, `_stock*`, `_potCfg`, `_pots`, `_luckyPot`, `_pokerAdmin`, `_pokerOn`, `_tienlenAdmin`, `_tienlenOn` |
| Chung | `_minBet`, `_gameOpen`, `_featOff`, `_dailyCfg`, `_loanCfg`, `_savedChannels`, `_vayChannelId`/`_vayMsgId`, `_withdraw*`, `_giveaway*` |

**Rác để lại, code không còn đọc** (kiểm prod 06/10: chỉ còn `_palTrades` rỗng và `_dogNapRate`; đừng dựng lại code dùng chúng): Palworld `_palTrades`, `_palTradeSeq`, `_palOrders`, `_palOrderSeq`, `_palChestSeq`, `_palClaimCdUntil`, `_palWheelCfg`, `_rescuePoint`, `_noBossCodes`, `_gachaChannelId`, `_dogNapRate`, `_itemShopWtMax`, các cờ `_mig*`; trong từng ví `palChest`, `palBuilds`, `palLuck`, `palLuckRate`, `palDayKey`, `palDayN`, `webPin` (PIN cũ). `_statsChannelId`/`_statsMsgId` bị đặt `null` lúc khởi động; `_xs*`/`_bc*`/`_bj*` (Xổ Số, Bầu Cua, Blackjack) được hoàn cược rồi xoá ở `cleanupGoneGames()`.

---

## 7. Cầu nối với game

Thư mục cầu: `/opt/tlbb-root/home/tlbb/Server/txt/NetCo4Web/` (bot thấy qua `TLBB_ROOT`). Mọi file bot ghi cho game đều **ghi tạm rồi đổi tên** (atomic). Chống cộng trùng: tên phiếu lưu vào DB (`_tlbbSeen`…) **trước** khi chuyển phiếu sang `xong/`.

| Chiều | File | Bên game | Bên bot |
|---|---|---|---|
| KNB game → web | `out/<GUID>_<giờ>_<số>.txt` → `out/xong/` | NPC "Ví Web" (`CDK/CDK.lua`, NPC 999999) trừ KNB rồi ghi phiếu | `tlbbPollReceipts` 5 giây/lần |
| KNB web → game | `<GUID>.in` (bot ghi), `<GUID>.done` (game ghi) | Phát khi đăng nhập / đổi bản đồ, ghi mã vào `.done` trước khi phát | `webRutGame` → `tlbb.sendKnb`; `tlbbCleanupIn` 30 giây. Hạn 30.000/người/ngày (`DOG_BRIDGE_DAY_DEF`, panel chỉnh) |
| Long Văn +1/+2/+3 → 🧰 Rương | `outlv/` → `outlv/xong/` | NPC Ví Web xoá món rồi ghi phiếu | `tlbbPollLvReceipts` 5 giây |
| 🏪 Thương Phố | `outtp/` (game → web), `<GUID>.tpin` (bot ghi) / `<GUID>.tpdone` (**chỉ game ghi**), `thuongpho-cho.txt` (bot dựng 6 giờ/lần) | NPC Ví Web gửi cả túi Đạo cụ / Nguyên liệu | `TP.pollPhieu` 5 giây, `TP.donTpin` 30 giây. **Tắt khẩn cấp:** tạo file `thuongpho-tat` trong thư mục cầu (xoá = mở lại) |
| 🎒 Túi boss | `tuiboss.log` | Script boss cuối ghi `<giờ> <scene> <ID quái> <GUID,...>` | `tuiBoss.poll` 10 giây |
| 🏹 Boss đã hạ | `Server/Log/Audit_*.log` | Game tự ghi | `tlbbAudit.poll` 10 giây |
| Đồ / pet / vàng → game | Panel GM ghi `Server/txt/NetCo4Qua/<GUID>.txt` | `quatang.lua` phát khi đăng nhập / đổi bản đồ | `tlbb.giveItem` / `givePet` / `gmCall('/api/act', {a:'qua', loai:'vang'})` |

Panel GM (repo game `panel/panel.py`) nghe `https://127.0.0.1:8443`, bot gửi header `X-NetCo4-Key` = `PANEL_PASS` đọc từ `/opt/tlbb-deploy/secrets.env` (**không bao giờ in ra**). Bot còn đọc `MYSQL_ROOT_PASS` ở cùng file để chạy `mysql` trong chroot (chỉ SELECT `tlbbdb.t_char`).

**Luật tiền khi giao:** trừ ví trước. Lỗi chắc chắn chưa ghi gì (`player not found`) thì hoàn. Panel GM **không trả lời** (timeout) thì **không hoàn** (có thể đã ghi, hoàn là nhận đôi), ghi log để admin kiểm hàng đợi.

**Chữ của game là VISCII** (bảng `/opt/tlbb-repo/tools/viscii-map.json`). Tên nhân vật lấy từ MySQL bị mã hoá 2 lần (VISCII → UTF-8), `tlbb.viscii()` bóc lớp UTF-8 trước. Đọc/ghi file game bằng `latin1`.

---

## 8. Deploy bot lên VPS

Prod: VPS `103.216.118.123`, SSH cổng `24700`. Bot ở `/opt/minigame/BotDoMin` (**không phải git**, file được chép lên), dịch vụ `minigame.service` (`After=tlbb.service`). Không dùng pm2.

```bash
F=webplay.js; T=<thư mục tạm ngoài repo>       # làm lần lượt từng file đã commit
git show HEAD:BotDoMin/$F > "$T/$F"            # bản LF đúng như commit (working copy là CRLF vì core.autocrlf)
scp -P 24700 "$T/$F" root@103.216.118.123:/tmp/$F
ssh -p 24700 root@103.216.118.123 "node --check /tmp/$F && md5sum /opt/minigame/BotDoMin/$F"
git show <commit deploy lần trước>:BotDoMin/$F | tr -d '\r' | md5sum   # PHẢI trùng md5 trên VPS, lệch = có người sửa thẳng prod -> dừng, hỏi
ssh -p 24700 root@103.216.118.123 "systemctl list-jobs | grep -c tlbb"   # PHẢI ra 0 (game đang restart thì bot chờ, mọi web chết 2-3 phút)
ssh -p 24700 root@103.216.118.123 "D=/opt/tlbb-backup/bot-\$(date +%d%m-%H%M); mkdir -p \$D && cp /opt/minigame/BotDoMin/$F \$D/ && cp /tmp/$F /opt/minigame/BotDoMin/$F && systemctl restart minigame"
ssh -p 24700 root@103.216.118.123 "journalctl -u minigame -n 40 --no-pager; for p in 3002 1508 1234; do curl -s -o /dev/null -w \"\$p %{http_code}\n\" http://127.0.0.1:\$p/; done"
```

- File client đọc lại từ đĩa mỗi lần tải, chép xong **không cần restart**: `/tp.js` (`thuongpho.client.js`), `/tb.js` (`tuiboss.client.js`), `/gn.js` (`ghepngoc.client.js`), `/gn-admin.js` (`ghepngoc.admin.js`), `/br.js` (`bangroi.panel.js`). Các file khác (`index.js`, `webplay.js`, `panel.js`, mô-đun server) cần restart.
- Đổi cấu hình trên prod: gọi API cổng SUPER `127.0.0.1:1508` (đăng nhập bằng `PANEL_SUPER_PASSWORD` đọc từ `.env`, không in ra), sao lưu cấu hình cũ vào `/opt/tlbb-backup` trước. Tab admin mở từ trước mà bấm Lưu sẽ ghi đè, dặn chủ server F5.
- Không chạy `cap-nhat.sh` (deploy game), chỉ đưa lệnh cho chủ server.

---

## 9. Luật viết code và cạm bẫy

**Tiền**
- Tiền tính 100% ở server, client chỉ vẽ. Kiểm và trừ ví liền nhau, không `await` ở giữa.
- Mọi thứ trong `dbCache`; `saveDbNow()` ghi đồng bộ ngay, chỉ gọi khi tiền vừa đổi. **Không gọi trong đường đăng nhập / vòng lặp.**
- Ván trong RAM; restart thì có sổ vé treo (`_minesPending`, `_stairsPending`, `_txBets`, `_txPlan`…) để hoàn ở `refundBootPendingBets()`. Mỗi đường kết ván: xoá ván → xoá vé treo → cộng tiền → ghi lịch sử (trả một lần).
- Tài Xỉu đang ở **bàn đơn giản** (`txSimple()`): thắng theo tổng điểm kể cả bão, 1 ăn 1. Tính toán phải theo `txPlanPayout`, không tự suy luật.
- Cho đổi đồ ↔ KNB thì kiểm kinh tế: giá vào lệch giá ra, đồ miễn phí (túi boss) có thành KNB không. Mô phỏng bằng dữ liệu prod trước khi chốt giá.

**Giao diện**
- `panel.js`: HTML là template literal. Trong phần trang **không có backtick, `${`, dấu gạch ngược lẻ**.
- `webplay.js`: trang là mảng chuỗi nháy đơn `const PAGE = [...]`. Thêm/bớt **nguyên phần tử**, cẩn thận `\'` và `\\"`.
- Tính năng mới: để client ở **file riêng** rồi phục vụ bằng route (như `/gn.js`), ít lỗi thoát ký tự, sửa không cần restart.
- Trang người chơi **không dùng `confirm()/alert()/prompt()`** của trình duyệt. Dùng `gConfirm(html, okLabel, danger)` (modal giữa màn hình, trả Promise).
- CSS chung `button{color:#fff;padding:12px}`, `input{width:100%}` đè mọi thứ: đặt phạm vi `#id button`. Trang rộng 520px; cần rộng thì bật class trên `body` (`gnWide`, `tpWide`). Bố cục theo khung dùng container query.
- `#id{display:...}` đè `.hidden`: modal có `display` phải kèm `#id.hidden{display:none}`.
- Vẽ lại bằng `innerHTML` làm điện thoại nhảy lên đầu: giữ `scrollY` và `scrollTop` khung con.
- Thông báo Discord phải chờ hiệu ứng client (kim Ghép Ngọc quay 7,6 giây), không thì lộ kết quả.
- Lớp `pwOff` (panel) = ẩn mục Palworld cũ. Thấy "mất chức năng" thì grep trước, có thể chỉ đang bị ẩn.

**Công cụ trên máy Windows**
- Heredoc bash và `node -e` **ăn dấu gạch ngược** và `${}`. Viết script sửa file bằng Write tool ra file `.js` rồi `node file.js`.
- Dừng server thử thì dừng đúng PID (`netstat -ano | grep :<cổng>`), không `taskkill /IM node.exe`.
- Commit message kết bằng dòng `Co-Authored-By: Claude ...` (quy ước của repo).

---

## 10. Kiểm thử

Không có framework. Ba loại:

1. **Bộ kiểm trong repo** (gọi đích danh từng file, không dùng `*`):
   `node TaiXiu/kiemtra/<file>.js`, `TienLen/kiemtra`, `Poker/kiemtra`, `SieuTaiXiu/kiemtra`, `Roulette/kiemtra`. Vài bộ **đã hỏng sẵn ở HEAD** (một số `web-test.js` cần bot test đang chạy): chạy cùng bộ đó trên HEAD trước khi đổ lỗi cho thay đổi của mình.
2. **Kiểm tĩnh:**
   - `node --check index.js webplay.js panel.js <file đã sửa>`
   - Biến chưa khai báo: `npx --yes eslint@8 --no-eslintrc --env node,es2022 --parser-options=ecmaVersion:2022 --rule "no-undef:error" <file>`
   - Client nằm trong chuỗi nên `node --check` không thấy lỗi. Dùng script kiểm trang: lấy mảng `PAGE` của `webplay.js` (hoặc template `HTML` của `panel.js`), eval ra chuỗi, tách từng khối `<script>` rồi `new Function(code)` để bắt lỗi cú pháp. Bản có sẵn: `thu/check_page.js`, `thu/check_panel.js` (`node thu/check_panel.js HEAD` kiểm bản đã commit).
3. **Chạy thử cả bot ở máy (Discord giả):** web chỉ bật sau sự kiện `ready`. Chép repo ra thư mục tạm (bot sẽ tạo `database.json` ở đó), `npm install` trong bản sao, rồi thay `discord.js` bằng đồ giả: `Client` là EventEmitter, `login()` phát `'ready'` với `{ user: { tag, id } }`, mọi thứ khác (`REST`, builder…) là Proxy gọi chuỗi được. Đặt cổng khác prod + mật khẩu thử + `TLBB_ROOT` trỏ thư mục tạm, rồi gọi thử trang và API. Không có game nên cầu file / panel GM báo lỗi, đúng như mong đợi. Bản có sẵn: `thu/bot-gia/chay.js` (nạp bot với module giả) và `thu/bot-gia/thu.js` (`node BotDoMin/thu/bot-gia/thu.js "<bản sao>/BotDoMin"`, cổng 13002/11508/11234).
   Riêng Ghép Ngọc: `node thu/ghepngoc-local.js`.

---

## 11. Biến môi trường và nơi để bí mật

`.env` ở `/opt/minigame/BotDoMin/.env` (đọc bằng `dotenv`). Chỉ tên biến, không ghi giá trị ở đây:

| Biến | File | Ý nghĩa / mặc định |
|---|---|---|
| `TOKEN` | index.js | Token bot Discord |
| `PLAY_PORT` | index.js | Web người chơi, mặc định 3002 |
| `PANEL_PORT` / `PANEL_PUBLIC_PORT` | index.js | Panel SUPER 1508 / cổng mod 1234 |
| `PANEL_SUPER_PASSWORD` | index.js → panel.js | Mật khẩu cổng SUPER |
| `PANEL_PASSWORD` | index.js → panel.js | Mật khẩu cổng thường (trống = tắt) |
| `PANEL_MOD_MO` | panel.js | `0` = bắt mật khẩu cổng mod; còn lại mở |
| `WEB_PLAY_URL` | index.js | Link web gửi trong Discord (mặc định trong code là IP cũ, prod nên đặt link `play.netco4.click`) |
| `KNB_EMOJI` | index.js | Emoji KNB trong tin nhắn Discord (không đặt = 🪙) |
| `TAIXIU_DIR`, `SIEUTX_DIR`, `ROULETTE_DIR`, `TIENLEN_DIR`, `POKER_DIR` | index.js, webplay.js | Thư mục game, mặc định `../<Tên>` |
| `TLBB_ROOT` | tlbb, tlbbaudit, tuiboss, thuongpho, dropboss | Gốc chroot game, mặc định `/opt/tlbb-root` |
| `TLBB_SECRETS` | tlbb.js | Mặc định `/opt/tlbb-deploy/secrets.env` |
| `TLBB_VISCII_MAP` | tlbb, tlbbaudit, dropboss | Mặc định `/opt/tlbb-repo/tools/viscii-map.json` |
| `DROP_AUDIT` | dropboss.js | Mặc định `/opt/tlbb-backup/dropboss-audit.jsonl` |
| `ITEMICON_DIR` | itemicon.js | Mặc định `/opt/minigame/itemicon` |
| `BANGROI_DATA` | panel.js | Mặc định `/var/www/netco4/data.json` |
| `GN_ANH_FONT`, `GN_ANH_FONT_HO` | ghepngoc.anh.js | Font vẽ ảnh Ghép Ngọc |

Bí mật chỉ nằm trên VPS: `/opt/minigame/BotDoMin/.env` (token, mật khẩu panel), `/opt/tlbb-deploy/secrets.env` (khoá panel GM `PANEL_PASS`, `MYSQL_ROOT_PASS`), `/opt/minigame/BotDoMin/database.json` (mật khẩu game thô của người chơi).

---

## 12. Lịch sử ngắn (để khỏi dựng lại)

- Bot ban đầu làm cho **Palworld** (cầu qua dashboard + SFTP + mod Lua, tiền Dogcoin).
- **29/09/2026** chuyển sang Thiên Long NetCo4, lên chung VPS game. Dogcoin → **KNB** 1:1, dữ liệu bắt đầu mới. Tên biến `points`, `dog*`, `logDog`, `_dogLedger`, `/api/dogbridge/*` giữ nguyên vì là cầu KNB đang chạy.
- **06/10/2026** dọn Palworld 2 đợt: `8a7d86a` (bỏ ~2.900 dòng code chết: quay/chọn/rương/giao dịch/cứu hộ pal, thẻ + route panel, nút Discord shop cũ) và `a5a109c` (xoá `palworld.js`, gọi thẳng `tlbb.js`; bỏ shop Palworld mặc định, nạp web cũ; đổi route liên kết nhân vật thành `/api/tlbb/lienket`). Còn sót vài chú thích nhắc Palworld và lớp CSS `pwOff`.
