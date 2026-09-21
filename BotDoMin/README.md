# BotDoMin — bot Discord + sòng minigame web + shop + cầu Dogcoin vào game Palworld

> **Viết cho người/AI tiếp nhận.** Đọc hết mục 0 → 3 trước khi sửa một dòng nào.
> Tài liệu này là **trạng thái hiện tại** — không phải nhật ký. Lịch sử theo ngày nằm ở
> `git log`; bản README cũ dài 2.300 dòng (có nhật ký từng ngày) nằm ở commit `385e5f6`,
> file `palworld-dashboard/README.md`. Phần server game / mod / pak: xem `../palworld-dashboard/README.md`.

Chủ server: **Khoa** — không rành code. Trả lời tiếng Việt, giải thích dễ hiểu, chỉ rõ file và dòng.

---

## 0. Luật làm việc (vi phạm là hỏng tiền thật hoặc hỏng prod)

| Luật | Vì sao |
|---|---|
| **Chỉ commit / push khi chủ server nói.** Làm xong thì để nguyên working tree rồi báo. | Chủ server tự chọn lúc deploy, có người đang chơi. |
| **Không bao giờ commit** `.env`, `database.json`, `log_*.txt`, `palworld-dashboard/server/.env*`, và **ảnh icon trong `assets/itemimage/` mà chủ server tự up tay**. | Ảnh đó đã có sẵn trên VPS → commit là `git pull` trên prod tắc vì không dám ghi đè. Đã vỡ một lần. `.gitignore` đã chặn cả hai; cần đưa 1 ảnh vào git thật thì `git add -f`. |
| **Mỗi đợt sửa phải cập nhật README này** (mục liên quan), không viết nhật ký theo ngày. | Người sau cần *cái đang đúng*, không cần *hôm nào sửa*. |
| **Sửa xong phải chạy trên bot test local trước** (mục 12), chưa bao giờ đụng thẳng prod. | Bot giữ ví thật của người chơi. |
| **Không chạy test bằng ký tự đại diện** (`node *test*.js`). Gọi đích danh từng bộ. | Scratchpad có cả script **vá** mang tên `*test*.js`, chạy lại là chèn trùng, có cái ghi thẳng vào `index.js`. Đã phá hỏng 8 bộ test + 2 file nguồn một lần. |
| **Đổi một khoá `ctx` từ giá trị sang hàm → rà hết mọi chỗ dùng.** | `ctx.txLockS` thành hàm mà panel còn `ctx.txLockS || 15` → NaN → panel báo "khoá sổ" vĩnh viễn. |
| **Xoá khối lớn bằng `cut(from,to)` → `to` phải là dòng NGAY SAU khối**, và liệt kê từng dòng bị xoá. | Hai lần cắt lố: một lần nuốt 19 khoá state panel, một lần nuốt 4 dòng khởi động bảng Discord (bảng đứng hình im lặng). |
| Repo đang **công khai** trên GitHub. | Đừng viết gì nhạy cảm vào code/README. Muốn private thì phải cài deploy key trên VPS trước. |

---

## 1. Bản đồ file & cổng

| File | Dòng | Việc |
|---|---|---|
| `index.js` | ~8.450 | **Toàn bộ logic**: bot Discord, mọi game, tiền, shop, rương, cầu game, wiring `ctx` cho web/panel |
| `webplay.js` | ~4.000 | Web người chơi (cổng `PLAY_PORT`, mặc định **3002**). HTML/CSS/JS client là **mảng chuỗi** nối lại. Phục vụ thêm **`/poker/`** (file `../Poker/trang.html`), `/poker/bai/*.webp`, và giao `/api/poker/*` cho `ctx.poker` — tab tầng-1 thứ 3 **🃏 GIẢI POKER** và thứ 4 **🀄 TIẾN LÊN** (`../TienLen/trang.html` tại `/tienlen/`, API `/api/tienlen/*`, ảnh lấy lại từ `../Poker/bai/`) (khung nhúng, hiện khi `_pokerOn`). Vào tab là bật `body.pokerFull` → khung **phủ kín màn hình**, thoát bằng nút nổi `#pokerOut` |
| `../TienLen/` | — | **Tiến Lên Miền Nam nhúng** — `bai.js` (luật bộ bài) · `van.js` (máy ván + TIỀN, thuần logic) · `web.js` (gắn vào ctx, **cửa duy nhất đụng ví**) · `trang.html`. ⚠️ **ĂN DOGCOIN THẬT**, phế 10%/ván. Dùng chung ảnh lá bài của Poker. Chi tiết: `../TienLen/README.md` |
| `../Poker/` | — | **Giải poker nhúng** — `web.js` (mô-đun gắn vào ctx), `giai.js` (máy giải), `bai.js` (chấm bài), `trang.html`, 53 ảnh. Cùng tiến trình, cùng phiên đăng nhập; chip ảo, không đụng ví. Chi tiết: `../Poker/README.md` |
| `panel.js` | ~3.500 | Panel admin: **SUPER** cổng `PANEL_PORT` (mặc định 1508) · **thường** `PANEL_PUBLIC_PORT` (1234). HTML client là **một template literal khổng lồ** |
| `palworld.js` | 200 | Cầu tới dashboard: `giveItem` / `takeItem` / `countItem` / `givePal` / `whereIs`. Basic auth, `cleanName` lọc tên |
| `assets.js` | 75 | Phục vụ file tĩnh: thả file vào `assets/` + restart là xong. Quét cả subfolder (`palimage/`, `itemimage/`). ETag để đổi ảnh không bị cache |
| `shop_items.js` | 55 | Danh mục implant đổi passive |
| `pals.json` / `passives.json` / `gameitems.json` | — | 290 pal (code + tên + paldex) · 99 passive (FName thật) · vật phẩm game |
| `database.json` | — | **DỮ LIỆU SỐNG** (ví, hồ sơ, cấu hình). Gitignore. Mất là mất tiền người chơi |
| `GAN-TEN-MIEN.md` | — | Hướng dẫn gắn `nghienpal.com` + HTTPS cho web (chưa làm) |

Chạy ở đâu: **VPS** `/root/tts-bot` (clone của repo, nhánh local `master` track `origin/main`), pm2 process **`BotDoMin`**. Web chơi công khai `103.72.98.37:3002`. Dashboard Palworld chạy cùng VPS pm2 `palworld-dashboard`, cổng 3000 **chỉ nghe 127.0.0.1** (bot gọi nó qua `PAL_DASHBOARD_URL`).

---

## 2. Kiến trúc — 6 nguyên tắc (vi phạm là sinh bug tiền)

1. **Tiền tính 100% ở server.** Client chỉ vẽ lại cái server trả về. Không tin số client gửi lên.
2. **Ghi DB:** mọi thứ nằm trong `dbCache` (RAM). Vòng lặp 10 giây so `JSON.stringify` rồi ghi **atomic** (`.tmp` → rename). `saveDbNow()` ghi ĐỒNG BỘ ngay — chỉ dùng lúc tiền vừa đổi, **đừng gọi trong đường đăng nhập / vòng lặp** (ai spam là chặn cả bot).
3. **Deadline Discord 3 giây.** Không gọi API nào (SFTP mất ~6s) trước `showModal`/reply đầu. Cần lâu thì `deferReply` → `editReply`.
4. **Ván nằm trong RAM** (`webMines` / `webStairs` / `wheelRoom` là `Map`). Restart là mất ván → có **sổ vé treo** (`_*Pending`) để boot **tự hoàn cược** ván treo. Cổ phiếu là ngoại lệ: vị thế `saveDbNow()` mỗi lần mở/đóng.
5. **Trả tiền một lần.** Mọi đường kết ván phải: xoá ván khỏi Map → xoá vé treo → cộng tiền → ghi lịch sử. Bug "nổ hũ ăn x2" là nhánh quên xoá ván.
6. **`logDog` chỉ ghi khoản CHUYỂN / ĐIỀU CHỈNH** (admin cộng trừ, chuyển giữa người chơi, vào/ra game, mua, hoàn). Cố tình không ghi cược minigame.

**Cấu trúc client (web + panel):** HTML/CSS/JS nằm trong chuỗi JS. `node --check` **không** kiểm được phần client. Xem mục 12 để biết bộ kiểm nào bắt được lỗi ở đó.

---

## 3. Dữ liệu trong `database.json`

**Mỗi người chơi** `db[discordId]`: `points` (ví) · `name` · `webPin` · `ingameName` (**chỉ admin đặt** — đây là mốc "đã liên kết") · điểm danh: `lastDaily`, `dailyDays[]`, `streakRun`, `streakPacks`, `streakTotal`, `streakRunPaid`, `lastNghien` · `lastWheelKey` · `debt {loan, admin, lastAccrue}` · `shopOnce {itemId: ts}` · `ichKy {day, bought, items{}, nhan[]}` · `palLuck`, `palLuckRate` · `sosAt`. Người mới: `STARTING_DOGCOIN = 20`.

**Cấu hình + trạng thái** dùng khoá gạch dưới: `_dogLedger` · `_pstats` · `_*History` (đều có cap) · `_*ChannelId` / `_*MsgId` (bảng Discord từng game) · `_*Pending` (vé treo) · `_txTime` `_txNoti` `_txMaxBet` `_txHist20` · `_potCfg` `_pots` · `_minBet` `_gameOpen` `_featOff` · `_loanCfg` · `_itemShop` `_itemCats` `_itemShopQuota*` · `_palwheel*` · `_stock*` · `_spm*` · **`_pokerAdmin`** (mảng ID được mở giải poker) · **`_pokerOn`** (tab 🃏 hiện/ẩn) · **`_tienlenAdmin`** / **`_tienlenOn`** (🀄 Tiến Lên, cùng kiểu) — hai khoá này panel ghi, `../Poker/web.js` chỉ đọc.

`NAME_OVERRIDE` ép tên hiển thị cho vài Discord ID quen.

---

## 4. Cầu Dogcoin ↔ game (tiền thật của người chơi đi qua đây)

Đường đi: bot → `palworld.js` → dashboard `/api/give-item|take-item|count-item|give-pal` → `sftpBridge.js` ghi lệnh vào `queue.txt` trên server game qua SFTP → mod Lua UE4SS đọc mỗi 2s → ghi `results.log` → dashboard đọc về. Chi tiết mod: `../palworld-dashboard/README.md`.

**Cổng BẮT BUỘC ONLINE** (`requireOnline`): trước khi đụng tiền, bot gửi `COUNT` cho mod đếm túi. Đếm được = online. `player not found` / lỗi stale = offline → chặn, chưa trừ gì. Lỗi khác = không rõ → cũng chặn.

**Ba nguyên tắc tiền:**
1. Chưa chắc online thì chưa đụng tiền. Nghi ngờ (unknown) cũng chặn.
2. **Timeout ≠ thất bại.** Mod có thể đã giao xong mà phản hồi về muộn → thành ĐƠN cho admin đối chiếu `results.log`. Bot **không** tự hoàn/tự cộng.
3. Chỉ tự hoàn khi **chắc chắn** chưa mất gì: `player not found` / `ECONNREFUSED` / `fetch failed` / `aborted`. Mọi lỗi mập mờ đẩy cho admin.

| Thông số | Giá trị |
|---|---|
| Trần mỗi lần chuyển, cả 2 chiều | `WITHDRAW_MAX_PER_REQUEST = 500.000` |
| Tỉ lệ nạp game → web | `DOG_NAP_RATE_DEF = 2` (1 dog game = 2 dog web), admin chỉnh |
| Đổi vàng → Dogcoin web | `GOLD_PER_DOG = 100`, nhập bội số `GOLD_STEP = 10.000`, dùng chung hạn ngày với nạp |
| Hạn ngày mỗi chiều | admin đặt ở panel (`_dogDayMax`), đếm theo Dogcoin **trong game** |
| Công tắc từng chiều | panel tab 👥 |

Chỉ đếm Dog Coin **trong túi**, không tính hòm. Pal giao vào save **dùng được sau restart server game** (giới hạn engine — đã đào tới đáy, kết luận giữ restart; xem `../palworld-dashboard/ue4ss-mod/GHI-CHU-GIVE-PAL-XAI-LIEN.md`).

---

## 5. 🔗 Cổng liên kết — chưa liên kết thì KHÔNG LÀM GÌ được

Mốc = `userData.ingameName` khác rỗng (admin đặt ở panel, tab 🎮 → `POST /api/pal/set-name`). Không ngoại lệ cho admin. **Đăng nhập web vẫn vào bình thường** để hệ thống nhận ID và admin thấy ai cần liên kết.

Cách chặn = **danh sách CHO PHÉP**, không phải danh sách chặn (`webplay.js`, ngay sau khâu kiểm phiên):
- **Được:** đường XEM (`*/state`, `*/table`, `*/hist`, `*/cd`, `/api/state`, `/api/profile`, `/api/players`) và đường **LẤY TIỀN VỀ** ván đang dở (`mines|stairs/cashout|dismiss`, `spm/cashout|cancelnext`, `stock/close`, `debt/pay`, `wheel/unready`).
- **Mọi thứ khác → 403 `{chuaLienKet:true}`**, kể cả mua shop, chuyển tiền, nhận pal, nhận quà. **Route thêm sau này mặc định bị chặn.**
- Tầng hai trong `index.js`: `lienKetGuard(userId)` ở dòng đầu `claimDaily` / `claimStreak` / `claimNghien` → bịt cả `/diemdanh`, `/nghien` bên Discord.

Web: banner đỏ `#lkWarn` dưới thanh số dư, bật theo cờ `linked` của `/api/state` (nhịp 2s). CSS `#lkWarn` **cố tình không có `display`** để `.hidden` còn tắt được (xem bẫy CSS mục 11).

⚠️ Khi bật lên prod lần đầu: **mọi ví chưa có tên nhân vật bị khoá ngay** → liên kết trước cho người đang chơi rồi mới restart bot.

---

## 6. Các game — luật + hằng số ĐANG CHẠY

Sàn cược chung (trừ Tài Xỉu): `minBet()` mặc định `MIN_BET = 400`, admin chỉnh panel tab 👥. Công tắc mở/đóng từng trò: `_gameOpen` (tab 💣) + công tắc chức năng người chơi `_featOff` (tab 👥) — cả hai chặn ở server, client sửa gì cũng vô ích.

### 💣 Dò Mìn (`webMinesApi`)
- 25 ô, chọn **3–20 mìn**. Hệ số = `1/xác suất × RTP`, cắt 2 số lẻ. **`RTP = 0.88`** → nhà cái ăn 12%.
- **🚧 0,88 là SÀN, đừng hạ tiếp:** bàn 3 mìn có 22/25 ô an toàn = 88% → RTP < 0,88 là **mở trúng 1 ô rồi DỪNG vẫn nhận ít hơn tiền cược** (0,85 → x0.96; 0,80 → x0.90). Người chơi thấy ngay vì hệ số hiện trên bàn. Muốn siết thêm dùng `MINES_MAX_WIN` (đang 0 = không trần), trần cược, hoặc bảng quà 🍀.
- Mở đủ ô an toàn = jackpot ván. Admin **ép mìn** từ panel (`forcedMines[userId]` / `_any`).
- **Trần khi có trợ giúp** (`capIfAssisted`): 3 mìn ×100 · 4 ×300 · 5 ×500 · 6+ ×2000. **La bàn 🧭 và Máy đào ⛏️ tính là trợ giúp ngay khi bốc trúng; Khiên 🛡️ chỉ tính khi thực sự đỡ mìn** (cầm khiên không dùng = tự lực, ăn đủ).
- **Trần nổ hũ 🏆** (áp LUÔN, không cần trợ giúp): 3 mìn ×50 · 4 ×100 · 5 ×200 · 6+ ×2000, cộng bội số hũ (`_potCfg.mines.mults`, mặc định x10/x15/x20 bốc ngẫu nhiên, người chơi tự chọn hộp).

### 🪜 Leo Thang (`webStairsApi`)
- 10 tầng × 8 cột, chọn 1–5 lửa/tầng. **`STAIRS_RTP = 0.92`**. Hệ số = `0.92 × (8/(8−lửa))^tầng`, 2 lửa tầng 9/10 ép tay (`STAIRS_MULTI_OVERRIDE`). Bẫy sinh sẵn cả ván.
- **Ô vàng 🌟** `STAIRS_GOLDEN_RATE = 2%`/ván, hiện rõ tầng 5–8, đạp là lên đỉnh. Trần trợ giúp `LUCKY_WIN_CAP_MULTI = 2000`.

### 🍀 Hộp cỏ 4 lá (dùng chung 2 game)
Người chơi **mua** cỏ (**30% tiền cược**, cả 2 game, `fee = bet * 0.3` — 19/09 chủ server chốt 30 sau khi thử 20 rồi 40) → 1 ô 🍀 giấu trong bàn → chạm là lật 4 hộp chọn 1. Quà quay ở server lúc chọn; 3 hộp kia là hàng mẫu (không bao giờ ra hũ).

| Quà | Dò Mìn | Leo Thang |
|---|---|---|
| 💰 Lì xì **+100% cược** (`LUCKY_CASH_RATE = 1.0`, 19/09; trước 30%) | **17%** | 36% |
| 🛡️ Khiên | **17%** | 18% |
| ↩️ Hoàn vé cỏ | **17%** | 13% |
| ⛏️ Máy đào / 🚀 Thang máy | **12%** | 13% |
| 🎲 Gấp đôi hoặc không | **— (bỏ 19/09)** | 10% |
| 🧭 La bàn (lộ 1 mìn/lửa) | **12%** | 8% |
| 🏆 Nổ hũ | **1%** | **2%** |
| 🍂 Hụt (không gì) | **24%** | — |

⚠️ **Tổng mỗi bảng phải đúng 1.00.** `spinWheel` trừ dần → thiếu bao nhiêu là **dồn hết vào ô CUỐI bảng** không báo gì. `luckywheeltest.js` canh. Đổi nổ hũ thì bù/trừ ở ô "hãm" (Dò Mìn: 🍂 Hụt; Leo Thang không có Hụt nên vào ↩️ Hoàn vé) — 18/09 từng hạ xuống 0,5% cả 2 game, 19/09 chủ server phục hồi 1%/2%. Dò Mìn 19/09 (chủ server chốt, lần 3): **bỏ 🎲 Gấp đôi**, 10% chia đều 5 ô còn lại; 41% hộp hụt/hoàn phí, **41% là trợ giúp** (khiên/đào/la bàn) — bốc trúng là ván dính trần "trợ giúp" (×100/×300/×500 theo mìn). Kỳ vọng tiền mặt mỗi lần mua cỏ Dò Mìn: lì xì 17%×100% = 17% + hoàn vé 17%×30% ≈ 5% = **~22% cược trên phí 30%** → nhà cái giữ ~8% phí cỏ, phần còn lại là giá trị khiên/đào/la bàn/nổ hũ. Leo Thang giữ bảng cũ nhưng lì xì cũng 100% (chung một quà): 36%×100% = 36% + hoàn vé 4% + gấp đôi 10% = **~50% cược trên phí 30% → cỏ Leo Thang DƯƠNG kỳ vọng cho người chơi**, chủ server chưa đụng. Mã `dbl` vẫn còn vì Leo Thang dùng. Đổi phí cỏ thì sửa **cả 2** dòng `fee` trong `index.js` và mọi chữ "30% cược" + phép `*0.3` ở `webplay.js` (8 chỗ chữ + 3 phép).

### 🎲 Tài Xỉu — bàn Sic Bo 52 cửa (Discord + web, `txState`, lõi tiền `../TaiXiu/cua.js`)
- **Ván 3 mốc**: giây ĐẶT CƯỢC → giây HIỆN NHÂN (khoá sổ, cấm đặt) → giây NẶN. Admin chỉnh cả 3 ở panel (`_txTime`, mặc định **30 + 4 + 20 = ván 54s**, phạm vi 5–600 / 0–60 / 6–300). ⚠️ **Số trong DB thắng số mặc định trong code** — đổi hằng số mà `_txTime` đã lưu thì không ăn thua gì, phải set ở panel. Ván đang chạy giữ mốc cũ. Dùng `txRoundS()` / `txLockS()` / `txNhanS()`, **không dùng lại hằng `TX_ROUND_S`**.
- **52 cửa** (Tài/Xỉu/Chẵn/Lẻ · 14 tổng điểm · 6 đôi · 6 bão · bão bất kỳ · 15 kết hợp · 6 đơn), bảng trả lấy từ sòng thật. Bảng trả gốc cố tình thấp; thứ kéo về mức chơi được là **HỆ SỐ NHÂN**: mỗi ván máy bốc ngẫu nhiên vài ô sáng đèn, ô sáng ăn theo hệ số đó **THAY** tỉ lệ gốc. Tần suất sáng `q` **máy tự giải** từ `RTP_MUC_TIEU = 0.95`, đừng gõ tay. Nhà cái ăn ~4,9% đo bằng 3 triệu ván. Hũ Bão **đã bỏ** (`ctx.txPot` trả 0).
- 🎰 **Thang hệ số nhân admin chỉnh được** (`_txThang`, route `/api/tx/thang` trong `VIEWONLY_PATHS`): mỗi nhóm một dòng `bao: 200×45, 250×33, …`, độ hiếm là trọng số (số nhỏ = hiếm). Sửa xong máy tính lại q theo RTP. **Nâng hệ số cao nhất thì phải hạ trần cược nhóm đó.** 12 nhóm, bộ ba dao động x200→x999 (9 bậc).
- 🃏 Ô **Admin POKER** đã chuyển từ tab Big Small sang **tab 🃏 Poker** (đúng chỗ của nó).
- 🎯 **RTP admin chỉnh được** (panel SUPER tab Big Small, `_txRTP`, 80–99%, mặc định 95%; route `/api/tx/rtp` nằm trong `VIEWONLY_PATHS`). Đổi RTP là `TX_CUA.datRTP()` tính lại tần suất sáng đèn cho cả 48 cửa — **hạ RTP = ít ô được nhân hơn**, không đụng bảng trả gốc. 90% → nhà cái ăn ~9,2%, còn ~4,8 ô sáng/ván (95% thì 7,2 ô).
- Bảng nhân sinh ra **ngay lúc khoá sổ, trước khi quay xúc xắc**, cả bàn thấy giống nhau; `/api/state` chỉ gửi nó khi `status !== 'betting'`.
- **Trần cược theo nhóm** (`_txTran`, 5 nhóm trong `NHOM_TRAN`): trần ≈ 5 triệu ÷ tỉ lệ trả cao nhất, nên cửa trả càng cao trần càng thấp. Admin sửa 1 ô là cả nhóm nhảy theo.
- Khoá sổ xong xí ngầu lắc ngầm, người chơi lên web **nặn chén** để lộ; nặn xong tiền về ví ngay (`txRevealClaim`), trả riêng từng người. **`TX_KQ_S = 4` giây cuối** pha nặn: chén tự rơi, bàn **tô ô trúng sáng / ô trượt xám** cho cả bàn cùng xem. Ai nặn tay xong sớm thì thấy ngay. Danh sách ô trúng do **`TX_CUA.cuaThang()`** tính rồi gửi kèm `nan.thang` — phía người chơi **không tự đoán luật thắng**.
- Xúc xắc **chỉ được gửi xuống khi `phase === 'nan'`**: mở F12 xoá chén ở pha hiện nhân cũng không moi ra được gì.
- **Bấm ô là đặt luôn** (không có giỏ cược). Mệnh giá `1.000/10.000/20.000/50.000/100.000` + nút **MAX CƯỢC** đỏ ở cuối — MAX bị chặn bởi ví + trần ô + trần tổng ván (trần ô 200.000 mà ví 400.000 thì chỉ 200.000 vào), và là cách duy nhất để người có **dưới 1.000** đặt được. Bấm ô có **đồng xu bay** vào ô (thuần trang trí, tự dọn). Tiền đã đặt hiện bằng **đồng Dogcoin** đè giữa ô, số tiền là chú thích nhỏ dưới đồng xu (rút gọn 1K/50K/2.5TR, **làm tròn XUỐNG** để không bao giờ ghi hơn tiền thật); từ **50.000** trở lên đồng xu đổi viền đen. Máy chủ **gộp `myBets` theo cửa** trước khi gửi, kẻo bấm 20 phát vào một ô là 20 dòng.
- **3 nút thao tác nhanh** (`/api/tx/datlai` · `/api/tx/x2` · `/api/tx/xoacuoc`): 🔁 Đặt lại xếp y giỏ ván trước (`txVanTruoc`, RAM, chụp lúc chốt ván; **chặn nếu ván này đã đặt** kẻo cộng dồn tiêu oan tiền) · ✖️2 đặt thêm đúng số đang có ở mọi cửa · 🗑️ Xoá cược gỡ hết cược của **riêng người đó** rồi hoàn đúng số đã trừ. Hai nút đầu **gọi lại `txDatLo`** nên luật tiền chỉ nằm một chỗ và vẫn tất-cả-hoặc-không. Báo lỗi hiện bằng **dòng đứng yên** dưới nút, **không dùng toast** (chủ server chốt: phải đọc kịp).
- ⚠️ **Cược = tiền đã trừ ví.** Chỗ nào xoá `txState.bets` PHẢI gọi `txDonSoCuoc(lyDo)` trước (ván đã quay: trả nốt theo bảng; chưa quay: hoàn cược). Áp cho cả admin khởi tạo lại bàn / dừng bàn, watchdog, mất bảng, nhảy cóc mốc nặn. **Không dựng lại bảng trả tiền** khi không thấy bảng cũ (cờ `paid` rỗng = trả hai lần). Cờ `paid` ghi xuống đĩa ngay. Watchdog reset phải `gameId++`.
- ⚠️ **Tên cửa PHẢI tra bằng `txTenCua(id)`**, đừng tra `TX_CHOICES[id].name`: bảng đó chỉ còn 5 cửa cũ, ô mới như `tong9` tra ra undefined và từng làm **vỡ khâu chốt ván** (mất lịch sử, kẹt bàn, mất tiền người chơi). `settleTXPayout` giờ **trả tiền trước**, phần ghi sổ bọc try/catch riêng; nhánh phục hồi của vòng ván **trả nốt tiền rồi mới reset**.
- Bộ kiểm riêng: `node TaiXiu/kiemtra/cua-test.js` (lõi tiền) · `trang-test.js` (giao diện) · `pham-vi-test.js` (biến xuyên file) · `chotvan-test.js` (đặt ô bàn mới rồi bỏ đi, ván vẫn phải chốt + trả thưởng) · `web-test.js` + `tratien-test.js` (cần bot test đang chạy).
- **Dòng lịch sử ván** (Discord + bảng 20 ván trên web): mỗi người chỉ kể ô **ĂN ĐƯỢC** (tối đa 3), ô thua gói thành "N ô, thua hết", tiền rút gọn `k/tr`; kèm dòng ⚡ kể **ô nhân ĐÃ RA TRÚNG** (lọc sẵn lúc chốt ván bằng `cuaThang`; ván nào nhân không ăn vào đâu thì không có dòng này). `histEntry.nhan` lưu bảng nhân của ván. Ván cũ thiếu trường này thì chỉ hiện tổng, không bịa.
- Bảng Tài Xỉu trên Discord liệt kê người đặt theo **đúng thứ tự 52 cửa** (trước chỉ đọc 5 cửa cũ nên ai đặt ô mới là biến mất khỏi bảng). Dòng đếm giờ ghi cả 2 mốc khoá sổ (hiện nhân + nặn).
- **🔔 Báo cược về Discord** (`_txNoti`): có người đặt là bot nhắn chủ server (ai/cửa/bao nhiêu/ván/ví/tổng bàn). Một ô ID: thử DM trước, hụt thì gửi kênh, nhớ kiểu gửi được. Có mức tối thiểu để khỏi ngập. Gắn ở **cả 3 cửa** đặt (web + 2 nút Discord); gửi hỏng **không** làm hỏng ván. Panel có nút Gửi thử. **Mặc định TẮT** — chủ server tự bật.
- Tự khởi động lại bàn ở `_txChannelId` khi boot; lịch sử 20 ván sống qua restart (`_txHist20`).

### 🎡 Vòng quay nhóm 2 tầng (`wheelRoom`) — thay Blackjack
Vào bàn miễn phí, đủ N người (`_wheelMinPlayers`) thì tự bấm quay. Vòng 1 VÉ (3.000/4.000/5.000, khoá lượt ngay khi quay), vòng 2 HỆ SỐ 27 nan 3 mũi tên, sàn ×1.5 chắc thắng, kỳ vọng ~×2.33 vé (nhà cái chịu lỗ vòng này). **1 lượt/người/khung 12 tiếng**, admin reset được.

### 🚀 Phi Thuyền (crash game, thuần web, `spm*`)
Vòng chung: cược `betS` 8s → bay → nổ. `SPM_CFG_DEF`: houseEdge 6%, growth 0.14 (x1→x2 ~5s), maxMult 200, cược 400–15.000, trần cứng `SPM_MAX_MULT = 5000`. Panel chỉnh tất cả. Lịch sử 20 lượt.

### 📈 Cổ phiếu DOG (thuần web, `stock*`) — game DUY NHẤT không thanh toán tức thì
Mỗi vị thế mở là bot **đang nợ** người đó. Giá đi theo **neo lang thang** trong `STOCK_MIN..MAX = 10..4000`, mốc gốc 1.000, nhịp 2s, nến 60s, kho 4 giờ (`STOCK_HIST_N = 288`). `STOCK_CFG_DEF`: tickAmp 3 · spread 0,1%/chiều · maxShares 500 (toàn sàn) · maxPer 80 · maxLev 20 · holdS 60 (chôn vốn) · pointX. Hai chiều long/short, không giữ 2 chiều. **Cháy ví**: lỗ ăn hết vốn rồi ăn tiếp ví tới cạn. Trần `maxShares × giá max` là phanh duy nhất; đòn bẩy làm trần dễ chạm hơn nhiều → siết `maxShares`, không phải `maxPer`. Bot tắt thì giá đứng, **không chạy bù nhịp**. Lỗ hổng chưa bịt: mở lệnh rồi chuyển hết tiền đi = đệm chịu lỗ tụt về đúng vốn.

### 📅 Điểm danh / 💉 Nghiện (Discord + web chung logic)
`DAILY_CFG_DEF`: điểm danh **600**/ngày (00:00 VN) · nghiện **200**/giờ (`NGHIEN_COOLDOWN_MS`) · **2 ngày liên tiếp** = 1 gói **800**, gói dồn được, tự bấm nhận. Admin chỉnh panel. Chuỗi đếm ngày thật (`streakRun`), `streakTopUp` tự bù người cũ.

### 📒 Vay nợ (`loanCfg`)
Phí **1 lần** 20% (`feePct`), không lãi kép. Vay tối đa 20.000/ngày, ôm tối đa 60.000. **Còn nợ một đồng là khoá 2 việc** (vay thêm, mua/quay pal, chuyển vào game…) — nhãn "nợ xấu" đã bỏ. Tab 📒 Nợ đỏ, nút 🆘 cầu cứu đăng kênh `DEBT_SOS_CHANNEL`, nút "Trả nợ giùm" trên `/sodu`. Nghỉ cầu cứu `DEBT_SOS_CD_MS = 1 phút`.

### 🀄 Tiến Lên Miền Nam (thuần web, `../TienLen/`) — game DUY NHẤT người chơi ăn tiền nhau
Bàn 2–4 người, 13 lá, chạy liên tục, **ăn Dogcoin thật**. Hai chế độ: **nhất nhì ba tư** (nhất ăn của tư, nhì ăn của ba) và **nhất ăn hết + đếm lá**. Bật/tắt 4 luật: 3♠ đi đầu · tới trắng · chặt heo có thưởng · thối 2. **Nhà cái ăn 10% tiền thắng** mỗi ván (`pheTram`) — đây là nguồn thu duy nhất vì người chơi ăn nhau. Ngồi bàn cần **vốn ≥ 30× mức cược**, tụt dưới là bị mời ra trước ván kế. Người chơi **tự mở bàn** bằng nút ✅ Sẵn sàng. Luật đầy đủ + cạm bẫy: `../TienLen/README.md`.

### 🧧 Lộc lá
Chuyển Dogcoin giữa người chơi trên web (`/api/transfer`, `/api/transfer/multi`), có đăng công khai.

---

## 7. 🏪 Shop Item + 🧰 Rương Ích Kỷ + 🎁 Quà

### Shop Item (`itemShopBuy`)
- Món có `cat`, `price`, `max`, `img` (tên ảnh trong `assets/itemimage/`). Nhóm do admin tự đặt (`_itemCats`, `ITEM_CAT_DEF` là mặc định; `itemCatHas()` là **nguồn sự thật duy nhất** — từng có whitelist thứ 5 giấu trong `ITEM_SHOP_CATS` làm mất cấu hình, đã xoá).
- **Hạn mua** nhiều tầng, kiểm TRƯỚC khi trừ tiền: ⭐ `important` mỗi người 1 lần vĩnh viễn · 🧬 implant N/người/ngày (`_itemShopImplantMax`) · 🌳 implant Cây Thế Giới riêng · 🗂️ hạn theo nhóm (`_itemShopGroupQuota[cat] = {mode:'server'|'user', per:'group'|'item', max}`) · 📅 hạn chung mỗi món/ngày (`_itemShopDayMax` + `dayMode`). Nhóm có hạn riêng thì MIỄN hạn chung.
- Mua **giao ngay**: bắt buộc online, khoá SFTP (`deliverLock`), trừ tiền trước, giao hụt hoàn theo luật mục 4.
- Chữa tên/ghi chú mất dấu tự động lúc boot (`repairtest.js`).

### 🧰 Rương Ích Kỷ (`ichKy*`)
Mua **không cần online**, để dành, rồi **📦 Nhận** vào game (lúc này mới cần online) hoặc **🎁 Tặng** người khác. **00:00 giờ VN xoá sạch** — so ngày mỗi lần mở rương, không hẹn giờ (bot tắt qua đêm vẫn đúng).

| Luật | Số |
|---|---|
| Mua vào rương | `ICHKY_DAY_MAX = 100` món/người/**ngày** |
| Rương giữ | `ICHKY_HOLD_MAX = 100` (chặn dồn quà) |
| Tặng | `ICHKY_GIVE_MAX = 100`/lần, không ăn hạn MUA của người nhận, phải lọt sức chứa rương họ |

- **Chỉ nhận món có hạn TOÀN SERVER**: nhóm `mode:'server'` hoặc hạn chung `dayMode:'server'`. Implant, ⭐, nhóm để "cá nhân" → bị loại. Đọc cấu hình động, **không ghi cứng tên nhóm**; admin đổi nhóm sang toàn server là nút 🧰 hiện ra.
- **Cách làm:** không có đường mua thứ hai — `itemShopBuy(..., vaoRuong)` dùng chung mọi luật, khác đúng 2 chỗ (bỏ kiểm online, bỏ giao SFTP). Hàm bọc `ctx.itemshop.buy` **phải truyền đủ tham số** (từng nuốt cờ).
- Web: nút 🧰 viền đỏ trên thanh số dư hiện luôn số món (đọc `ichKyTotal` từ `/api/state` mỗi 2s — **client phải đọc**, từng quên); popup `#ikModal` lưới thẻ (ảnh, số lượng đè góc, tên, ô nhập, 2 nút), khung xanh "🎁 Hôm nay bạn được tặng: TÊN tặng N món (giờ)" (`ichKy.nhan`, 20 lượt, bay theo rương lúc 00:00). Shop: hàng nút **ô số → 🧰 Vào rương → 🛒 Mua**.

### 🎁 Quà admin & Kho đồ (panel SUPER)
Tab **Quà**: quà mỗi ngày theo danh sách riêng (`giftClaim`, người nợ không nhận được). Tab **Kho đồ** (chỉ SUPER): admin giao bất kỳ item vào túi người chơi (`adminGiveItem`, không giới hạn số lượng), và thẻ **"Tặng riêng 1 người"**: mỗi món 2 nút — 🎁 Giao vào game / 🧰 bỏ vào Rương Ích Kỷ **không tính hạn**.

---

## 8. 🐾 Pal trên web (Hồ sơ)

- **🎁 Quay Pal** kiểu CSGO (vé `palWheelCfg().price`, mặc định 2.000), reel có hình (`assets/palimage/T_<code>_icon_normal.png`), dải kéo xem hết pal (xáo ngẫu nhiên, khoá kéo sau khi quay tới F5). **Nổ hũ = trúng Mimog** (`PALWHEEL_JACKPOT_CODE = MimicDog`, **2 ô** trên vòng): hũ cố định `25.000` + thưởng `10.000`, thẻ tô màu vàng. SUPER ép được con kế tiếp (`palWheelForce`) để test.
- **🍀 Thanh may mắn** (`u.palLuck`, +1–3%/lượt, admin đặt riêng từng người `palLuckRate`) đầy 100% mở vòng RAID (4 boss + `raidBonus`).
- **🎯 Chọn Pal** đích danh (6.000; boss raid giá riêng). Nâng cấp trả phí: slot passive 5–8, soul %, IV, bản BOSS. **Giới tính bắt buộc chọn** (1 đực / 2 cái).
- **🎒 Rương pal**: `PAL_CHEST_MAX = 100` ở mục CHƯA NHẬN (đếm cả lời rao đang treo); nút tự động quay tới khi đầy; **bán hàng loạt** checkbox + chọn tất cả; mục ĐÃ NHẬN chỉ gửi `PAL_DONE_SHOW = 100` con gần nhất. **Bán/tặng cho người khác** (`palTrades`): người nhận đang 80 pal thì chỉ bán được 20. Nhận vào game → `pal.givePal` → lệnh `PAL2` → dùng được **sau restart server**. Cooldown nhận `claimCd`. Tẩu thoát 🆘 `RESCUE_CD_MS = 1 giờ`.
- Passive: `passives.json` `id` = FName thật (nguồn chuẩn: save-editor `oMaN-Rod/palworld-save-pal`, **không** đoán từ paldb). 1 id sai → game từ chối **cả lô**. 7 passive Cây Thế Giới cố tình **cấm** khỏi web.
- **Chế độ PAL GỐC** (panel tab 🎮): tắt chỉ số, giao bản thường.

---

## 9. Slash command Discord đang bật
`/sodu` · `/diemdanh` · `/nghien` · `/chuyentien`. `/addtien` `/trutien` **đã xoá** (cộng/trừ tay chỉ ở panel). Mọi game đã lên web; Discord chỉ còn bảng Tài Xỉu (đặt cược được) + các bảng "chơi trên web" của Dò Mìn / Leo Thang / Phi Thuyền (`run*BoardLoop` + `resume*Board` **phải đủ cặp** ở boot — `boardloop-test.js` canh).

---

## 10. Panel admin (`panel.js`)

Tab: `tx` Tài Xỉu · `mine` Dò Mìn · `stair` Leo Thang · `bj` Vòng quay · `stock` · `spm` Phi Thuyền · `user` 👥 Người chơi · `pal` 🎮 Palworld & Dogcoin · `log` · `gift` Quà · `give` Kho đồ. SUPER (cổng `PANEL_PORT`) mới có: ép kết quả/mìn/quà hộp/pal, Kho đồ, can thiệp giá cổ phiếu (`epOk` = so `req.socket.localPort`).

Làm được: bật/tắt + ép kết quả từng game · **nhịp ván Tài Xỉu 3 mốc** (đặt / hiện nhân / nặn) + **trần cược 5 nhóm cửa Sic Bo** (`/api/tx/tran`, nằm trong `VIEWONLY_PATHS`) + báo cược · sàn cược · cộng/trừ/set ví · phát tiền toàn server · reset điểm danh · **liên kết tên nhân vật** (`/api/pal/set-name`) · cấu hình shop (món, nhóm, hạn, ảnh) · hũ · vay nợ · công tắc chức năng · kênh cho từng bảng · sổ biến động · **tab 🀄 Tiến Lên (chỉ SUPER)**: mức cược · chế độ · đơn giá lá · 4 công tắc luật · Mở bàn / Giải tán · công tắc hiện tab (5 route `/api/tienlen/*` đều nằm trong `VIEWONLY_PATHS`) · **tab 🃏 Poker (chỉ SUPER)**: công tắc hiện/ẩn tab GIẢI POKER trên web (`/api/poker/on`), ô "Admin poker" (`/api/poker/admin`), chip khởi điểm (`/api/poker/chip`), Bắt đầu (N người) / Giải tán / Tạm nghỉ / Chơi tiếp (`/api/poker/batdau|giaitan|nghi|tiep`) — 7 route này đều nằm trong `VIEWONLY_PATHS` nên cổng thường bị chặn.

**Vòng làm mới 3 giây ghi đè ô đang sửa** — mọi ô nhập mới phải dùng khuôn: chỉ điền khi `value===''`, hoặc `dataset.dirty` (chạm vào là đánh dấu, Lưu xong bỏ dấu). Ô tick không có chốt nào nếu quên.

Mật khẩu panel/dashboard **đang TẮT** theo yêu cầu chủ server (`PANEL_PASSWORD` trống). Panel nghe `0.0.0.0` = mở cho internet; muốn an toàn: `ufw deny <cổng>` + SSH tunnel.

---

## 11. Cạm bẫy đã dính (gom một chỗ, đừng dính lại)

**Client trong chuỗi JS**
- `webplay.js` là **mảng chuỗi** (dùng `\\"` trong file để ra `\"` cho client), `panel.js` là **một template literal** (tuyệt đối không chèn backtick / `${}`; dùng `\\'`). Sửa bằng **script vá exact-match viết qua Write tool** (Bash heredoc/`node -e` nuốt backslash và `${}`).
- CSS: `#id{display:...}` (100 điểm) **đè** `.hidden{display:none}` (10 điểm). Modal có `display` phải kèm `#id.hidden{display:none}`. `hiddencheck.js` canh.
- `button{}` gốc **không đặt background** → nút mới quên cho màu là trắng nhợt chữ chìm.
- Đừng re-render khối chứa `<input>` đang gõ.
- Đổi ảnh xong phải Ctrl+Shift+R; ETag đã xử phần server.

**Wiring & vòng đời**
- Hàm bọc trong `ctx` phải khai **đủ tham số** (từng nuốt `vaoRuong`).
- Máy chủ gửi trường mới ≠ client đọc — canh **cả hai đầu** trong test (từng gửi `ichKyTotal` mà không ai đọc).
- Danh sách tab cứng trong `tab()` phải khớp thẻ `id="tab-*"` (xoá tab mà sót tên → `null.classList`, panel chết). `paneltabtest.js` canh, `tab()` nay có `if(el)`.
- Gỡ trò chơi: **hoàn cược đã trừ ví trước khi xoá khoá db** (`cleanupGoneGames()` là mẫu).

**Discord / mod**
- 25 nút/tin, 25 lựa chọn/menu. Deadline 3 giây.
- Tên nhân vật có ký tự ẩn → give-pal trượt dù đếm túi vẫn thấy online.
- Đổi tên server trên Shockbyte = đổi path SFTP → prod gãy âm thầm (xem README Palworld).

**Kinh tế**
- Hạ RTP Dò Mìn dưới 0,88 → ô đầu lỗ. Đổi bảng quà → tổng phải 1.00. `_txDashHistory` từng phình 57% db vì không cap — mảng lịch sử nào cũng phải cap.
- Đề nghị "cho một người cụ thể thua nhiều hơn" đã bàn và **không làm** (server nhỏ dễ lộ, repo công khai, admin vốn cộng trừ thẳng được). Hướng thay: trần thắng/ván, trần cược riêng từng người (nhìn thấy được).

---

## 12. Kiểm thử — không có framework, nhưng có kỷ luật

**Bot test local** (`Desktop/bialk-test`, điều khiển bằng `Desktop/bialk-test.js`, ngoài repo; discord.js giả, không cần token):

```bash
node Desktop/bialk-test.js 5    # tắt
node Desktop/bialk-test.js 3    # đồng bộ code từ repo (phải tắt trước)
node Desktop/bialk-test.js 4    # bật  -> web 4002 · panel SUPER 4508 · thường 4234
node Desktop/bialk-test.js 7    # nạp lại ví test 200.000 + đặt ingameName (bước 7 tự làm)
# đăng nhập web: ID 111111111111111111 · PIN 123456 ; panel SUPER: password rỗng
```
Bot test **không có game** → mọi lệnh cần online/SFTP trả lỗi — đó là điều bài kiểm dựa vào để chứng minh "giao hụt thì không mất gì".

**Bốn tầng kiểm, chạy đích danh từng file** (scratchpad của phiên Claude; tên bộ ổn định qua nhiều phiên):

| Tầng | Bắt được gì | Bộ |
|---|---|---|
| Cú pháp file | lỗi JS server | `node --check index.js webplay.js panel.js` |
| Cú pháp **client** | thiếu nháy trong chuỗi HTML (node --check không thấy) | `panelclient-check.js`, `webclient-check.js` (dựng lại mảng `PAGE` rồi `new Function`) |
| Chạy hàm thật trong `vm` | logic tiền, trần, luật — trích `ex(mốcĐầu, mốcCuối)` từ `index.js`, stub phụ thuộc, ép `Math.random` | `ichkytest` `lienkettest` `txtimetest` `luckywheeltest` `mimogtest` `chestmaxtest` `shopuitest` `txpottest` `notest` `giftstoretest` `bridgetest` `repairtest` `feattest` `pgpicktest` `popupscroll-test` `txnotidirty-test` `boardloop-test` `paneltabtest` `scopecheck` `hiddencheck` |
| Bộ kiểm 🀄 Tiến Lên (trong repo, KHÔNG ở scratchpad) | luật bài, tiền 2 chế độ, ví, chống lộ bài, nối vào bot | `node TienLen/kiemtra/{bai,van,web,trang,noi}-test.js` (268 bài) |
| Chạy thật HTTP trên bot test | wiring route ↔ ctx ↔ client, state lệch, 403 | `*-e2e.js` (`ichky` `lienket` `txtime` `leaf` `mimog` `palforce` `chestmax` `itemcats` `catsave` `pgpick` `reveal`), `dom-null-check.js <url>` (DOM giả chỉ trả phần tử cho id có trong HTML) |

Nguyên tắc viết bài kiểm mới: **chứng minh nó bắt được lỗi** bằng cách chạy ngược trên bản hỏng; tính theo **chênh lệch** chứ không giả định trạng thái sạch (rương/ví còn từ lần chạy trước); trò có ngẫu nhiên thì **ép** (`/api/mines/force`, `/api/lucky/force`, `palWheelForce`) cho hết hên xui; trần theo ngày là thật, bài kiểm phải tự thích ứng khi hết lượt.

---

## 13. Deploy — lệnh dùng hằng ngày

**Ở máy Windows (repo `Desktop/bialk-main/bialk-main`), chỉ khi chủ server bảo commit:**
```bash
git status --short                      # phải KHÔNG thấy ảnh itemimage / .env
git add BotDoMin/index.js BotDoMin/webplay.js BotDoMin/panel.js BotDoMin/README.md palworld-dashboard/README.md
git commit -m "mo ta ngan"
git push origin main
```
Lấy code người khác đẩy lên (chủ server làm từ máy khác): `git fetch origin && git log HEAD..origin/main --oneline` xem trước → `git pull --ff-only origin main`.

**Trên VPS** (SSH `root@103.72.98.37 -p 24700`):
```bash
cd /root/tts-bot
git checkout -- . && git pull            # checkout -- . để né bẫy CRLF
pm2 restart BotDoMin --update-env        # sửa bot/panel/web
pm2 restart palworld-dashboard           # CHỈ khi sửa palworld-dashboard/server
pm2 logs BotDoMin --lines 50
```
`/root/tts-bot` chứa `.env`, `database.json` sống — **không bao giờ** `reset --hard`/xoá.

Sau restart bot, kiểm nhanh: log có `Bot ... online`, web `:3002` vào được, panel bấm tab không lỗi.

⚠️ **Riêng bàn Sic Bo**: nhịp ván lưu trong `database.json` (`_txTime`) **thắng** số mặc định trong code. Deploy xong phải vào **panel SUPER → tab Big Small** set lại **30 / 4 / 20** thì mới ăn nhịp mới. Kiểm thêm: đặt thử 1 ô của bàn mới (ví dụ Tổng 9) rồi **để yên không nặn**, hết ván phải thấy ván đó trong bảng soi cầu và tiền về ví — nếu không thấy thì xem `log_system.txt` có dòng `[LỖI GHI SỔ TX]` không.

---

## 14. Việc còn mở / hướng phát triển

- **Gắn tên miền + HTTPS** cho web (`GAN-TEN-MIEN.md`), hiện người chơi vào bằng IP:3002.
- **Bịt lỗ hổng cổ phiếu**: chặn chuyển tiền/vào game khi đang giữ lệnh.
- **Trần thắng mỗi ván Dò Mìn** (`MINES_MAX_WIN`) và **trần cược riêng từng người** — đã đề xuất, chủ server chưa chốt. Đây là chỗ siết kinh tế thay cho hạ RTP.
- Rương Ích Kỷ: chưa có công tắc bật/tắt riêng (đang đi theo công tắc `shop`), chưa có mục panel xem rương người chơi.
- Bảng "soi người chơi" trong panel (ai lời/lỗ bao nhiêu theo trò) — có tool `../palworld-dashboard/tools/soi-nguoi-choi.js` đọc offline, chưa có UI.
- 12 passive còn cờ `unsure` trong `passives.json` (cách kiểm: gửi pal test 4 passive/con qua server test, thiếu ô = mã sai).
- Bật lại mật khẩu panel khi có người lạ vào server.
- Repo còn công khai; muốn private phải cài deploy key trên VPS trước.
