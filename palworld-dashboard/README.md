# Palworld Admin Dashboard + tích hợp bot Discord

Hệ thống quản lý server Palworld từ xa, và nối server game với bot Discord (`../BotDoMin`)
để người chơi chuyển Dogcoin qua lại giữa ví Discord và Dog Coin thật trong game.

> **Tài liệu này viết cho người/AI tiếp nhận công việc.** Đọc hết phần "Kiến trúc" và
> "Những thứ đã thử và THẤT BẠI" trước khi sửa — có nhiều mắt xích không hiển nhiên,
> và một danh sách dài các hướng đã đâm vào ngõ cụt. Đọc để khỏi lặp lại.

---

## ⚠️ Bảo mật — đọc trước khi commit

- `server/.env` chứa **mật khẩu thật** (SFTP, admin password Palworld). Đã có trong
  `.gitignore`. **Không bao giờ commit.**
- `server/data/` (lịch sử tặng quà, bảng liên kết) cũng không commit.
- Bên bot: `BotDoMin/.env`, `database.json` (số dư người chơi), `log_*.txt` — đều đã
  gitignore.
- **Cả dashboard lẫn panel bot hiện KHÔNG có mật khẩu** (chủ server yêu cầu). Xem phần
  "Xác thực" bên dưới để biết rủi ro và cách bật lại.

---

## 🧭 Đọc nhanh — trạng thái hệ thống hôm nay (cập nhật 22/08/2026)

Cái gì ĐANG chạy và cái gì đã tắt — để khỏi đi tìm code của thứ không còn tồn tại:

| Thứ | Trạng thái |
|---|---|
| Cầu Dogcoin 2 chiều (Discord ↔ game) | ✅ **TỰ ĐỘNG**, bắt buộc nhân vật online, trần **90.000/lần cả 2 chiều** (27/08) |
| REST API Palworld (kick/ban/xem người chơi) | ❌ **TẮT** (server test không bật) → các endpoint cần REST trả 503 |
| Liên kết Discord ↔ nhân vật | ✅ **admin đặt tay ở panel**; ❌ hệ SteamID/REST đã ngưng |
| Tặng pal tự động (give-pal) | ❌ **ĐÃ GỠ** — game không cho, admin tạo tay bằng CreativeMenu |
| Shop pal trên Discord (mua + gacha + bán lại) | ✅ chạy |
| Mod Lua UE4SS + cầu SFTP | ✅ chạy (đường sống duy nhất để tặng/trừ item) |
| PalSchema (máy nghiền không rớt lõi) | ✅ chạy · Silvance no-drop dùng **pak** vì PalSchema chịu thua Lv70+ |
| Bảng 📊 thống kê người chơi | ❌ **ĐÃ BỎ** 19/08 (dữ liệu `_pstats` vẫn đếm ngầm) |
| Blackjack | ❌ thay bằng 🎡 Vòng quay nhóm 2 tầng |
| 📈 **Sàn Cổ Phiếu Dogcoin (DOG)** | ✅ **MỚI 22/08** — game thuần web, 2 chiều MUA/BÁN, đòn bẩy tới x20, chôn vốn 60s, **lỗ ăn hết ví mới cháy** |
| Vay nợ Dogcoin | ✅ **20.000/ngày**, trần **60.000**, phí **20% thu 1 lần** (không lãi kép), admin chỉnh panel |
| Dò Mìn trên Discord (`/domin`) | ❌ comment lại — chơi trên web |
| Mật khẩu panel/dashboard | ❌ **TẮT** theo yêu cầu chủ server (xem mục Xác thực để biết rủi ro) |

Đọc theo thứ tự nếu mới nhận việc: mục **Kiến trúc** → **Luồng tiền Dogcoin** → **BotDoMin
toàn bộ cơ chế** → **Những thứ đã thử và THẤT BẠI**. Mật khẩu/deploy chi tiết nằm ở sổ tay
nội bộ của chủ server (`SO-TAY-NOI-BO.md`, KHÔNG có trong repo).

---

## Ba thành phần đang chạy

| Thành phần | Chỗ chạy | Restart khi nào |
|---|---|---|
| **Server Palworld** + mod Lua UE4SS | Shockbyte (Windows qua Wine) | mỗi lần sửa `main.lua` |
| **palworld-dashboard** | VPS `103.72.98.37`, pm2 tên `palworld-dashboard` | khi sửa code dashboard |
| **BotDoMin** (bot Discord) | cùng VPS, pm2 tên `BotDoMin` | khi sửa code bot/panel |

Repo trên VPS: `/root/tts-bot` (là clone của repo `bialk`). Deploy = `git pull` + `pm2 restart`.

```bash
cd /root/tts-bot && git pull && pm2 restart BotDoMin palworld-dashboard --update-env
```

---

## Kiến trúc & cơ chế (QUAN TRỌNG)

Có **hai đường** riêng biệt tới server Palworld:

### 1. REST API chính thức — quản lý server/người chơi
Palworld có sẵn REST API (`RESTAPIEnabled=True`). `palworldClient.js` gọi qua HTTP Basic Auth.
Hỗ trợ: `info`, `players`, `metrics`, `announce`, `kick`, `ban`, `unban`, `save`, `shutdown`.
**API này KHÔNG có lệnh tặng/trừ item** — đó là lý do phải có đường thứ hai.

### 2. Mod Lua UE4SS + cầu nối SFTP — tặng/trừ item
```
Dashboard/bot → POST /api/give-item → sftpBridge.js
   → ghi 1 dòng lệnh vào queue.txt trên server (qua SFTP)
mod Lua GiveGoldCommand (chạy trong game qua UE4SS)
   → polling queue.txt mỗi 2 giây → thực thi → ghi kết quả vào results.log
sftpBridge.js đọc results.log lấy kết quả trả về
```

**Vì sao dùng file queue:** RCON của Palworld chỉ nhận bộ lệnh cố định, trả "Unknown command"
cho lệnh custom. Panel Shockbyte không có ô console. File queue là cách chắc chắn chạy được.

**Mod nằm ở:** `Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/`. Mod **tự dò** thư mục của
chính nó nên đổi host không cần sửa — xem dòng `baseDir=` trong `results.log`.

---

## Định dạng lệnh trong queue.txt

```
ITEM <itemId> <quantity> <playerName>
COUNT <itemId> <playerName>                      → OK COUNT DogCoin=53
COUNTALL <itemId>                                → mỗi người 1 dòng, dùng cho bảng số dư
TAKE <itemId> <quantity> <playerName>            → OK TAKE DogCoin x20 (truoc=51 sau=31)
PAL2 <species> <level> <rank> <iv×4> <soul×4> <gender> <lucky> <passiveCsv> <playerName>
```

Chẩn đoán (chỉ đọc): `DUMP <class>`, `DUMPP <class>`, `INSPECT <player>`, `INVDBG <item> <player>`.

**Hai quy tắc BẮT BUỘC của định dạng này** (vi phạm là đọc lệch, đã dính):
1. **`playerName` luôn nằm CUỐI dòng** — tên trong game có thể có dấu cách (`bbb 1`).
2. **Field rỗng phải gửi sentinel `-`**, không được để trống. Passive rỗng + tên có dấu
   cách từng bị đọc thành passive=`bbb`, tên=`1`.

Mọi dòng kết quả phải có tiền tố `[playerName] ` (hàm `appendPlayerResult`) để `sftpBridge.js`
ghép đúng kết quả với đúng người. **Không đoán theo nội dung câu chữ** — lỗi `spawn failed`
từng không chứa tên player nên dashboard báo nhầm "timeout" dù mod đã trả lời.

---

## Luồng tiền Dogcoin (đang chạy — làm lại 17/08/2026 TỰ ĐỘNG cả 2 chiều, 19/08 thêm cổng BẮT BUỘC ONLINE)

**ADMIN liên kết tên nhân vật** với Discord ID ở panel bot (cổng 3001, tab
🎮 Palworld & Dogcoin, card "🔗 Liên kết tên trong game") — lưu `userData.ingameName`
trong `database.json` của bot, API `/api/pal/set-name`. Người chơi KHÔNG tự đặt được:
tự đặt là tự nhận tên nhân vật người khác rồi bấm 💬 rút trộm túi họ. Tên được lọc về
ASCII in được, khớp với `normalizeName` của mod. KHÔNG dùng hệ liên kết SteamID/REST nữa.

### Cổng BẮT BUỘC ONLINE (`requireOnline`, 19/08/2026 — chạy TRƯỚC cả 2 chiều)
Trước khi đụng tới một đồng nào, bot gửi lệnh `COUNT` hỏi mod đếm túi người đó.
Mod chạy TRONG game nên chỉ thấy người đang online:
- Đếm được → **online**, cho làm tiếp (chiều nạp còn dùng luôn số đếm để báo sớm khi túi không đủ).
- `player not found` **hoặc** `Tried calling a member function` (main.lua:679) → **offline** → chặn,
  báo "vào game rồi bấm lại", chưa trừ đồng nào. (Câu lỗi thứ hai là do người vừa thoát game
  để lại PalPlayerState "xác": `IsValid` vẫn true, còn đọc được tên, nhưng gọi
  `GetInventoryData()` là nổ — mod cũng đã vá để trả `player not found (COUNT stale)` cho chuẩn.)
- Lỗi khác / cầu SFTP chết → **không rõ** → cũng chặn, chưa đụng tiền.

Đổi lại mỗi lượt nạp/rút chậm thêm ~5-20 giây cho lượt đếm — giá của việc kiểm chắc.

### Discord → game ("Chuyển vào game", `rut_modal`)
Qua cổng online → trừ ví Discord **ngay** (giữ chỗ) → gọi `/api/give-item`.
- Mod trả `OK` → xong.
- Mod trả `player not found` → CHẮC CHẮN chưa giao → **hoàn ví ngay**.
- Timeout/lỗi lạ → KHÔNG tự hoàn (có thể đã giao) → tạo đơn cho admin đối chiếu `results.log`.

### Game → Discord ("Chuyển ra Discord", `nap_modal`)
Qua cổng online (kèm kiểm túi đủ tiền) → gọi `/api/take-item` **trừ item trong game TRƯỚC**
→ chỉ khi mod xác nhận `took` đúng số mới cộng ví.
- Mod trả `ERROR` bất kỳ (not found / `khong du` / trừ lệch tự hoàn) → CHẮC CHẮN trong
  game không mất gì → chỉ báo người chơi, không tạo đơn.
- Timeout → không rõ đã trừ chưa → đơn cho admin: item ĐÃ trừ thì duyệt (cộng ví),
  chưa trừ thì từ chối.

### Ba nguyên tắc an toàn tiền (đừng sửa nếu chưa hiểu vì sao)
1. **Chưa chắc online thì chưa đụng tiền:** cổng `requireOnline` chặn từ đầu; đường nào
   nghi ngờ (unknown) cũng chặn chứ không "thử đại".
2. **Timeout ≠ thất bại:** mod có thể đã giao/trừ xong nhưng phản hồi về muộn → thành ĐƠN
   cho admin đối chiếu `results.log`, bot KHÔNG tự hoàn / tự cộng. Thà chậm còn hơn nhân đôi tiền.
3. **Chỉ tự hoàn khi CHẮC CHẮN chưa mất gì:** `player not found` lúc give là mod xác nhận
   chưa giao → hoàn ngay; mọi lỗi mập mờ khác đẩy cho admin quyết.

### Giới hạn
- Discord → game: tối đa **20.000/lần** (`WITHDRAW_MAX_PER_REQUEST`) — chặn thiệt hại nếu có lỗi.
- Game → Discord: **không giới hạn** (người chơi chỉ lấy được số họ thật sự có).
- **Chỉ đếm Dog Coin TRONG TÚI**, không tính hòm/kho ở căn cứ — hàm đếm hòm mà game
  expose chỉ chạy phía client.

---

## 🤖 BotDoMin — TOÀN BỘ CƠ CHẾ BOT (đọc phần này trước khi sửa bot)

> Viết cho người/AI tiếp nhận: đây là mô tả đầy đủ cái bot đang làm gì, tiền chạy đường
> nào, luật từng game, và các cạm bẫy đã dính. Tên "BotDoMin" = **Bot Dò Mìn** (game đầu
> tiên của nó), giờ nó cõng cả sòng minigame + shop pal + cầu Dogcoin.

### Bản đồ file (`../BotDoMin/`)

| File | Dòng | Việc của nó |
|---|---|---|
| `index.js` | ~4.350 | **Toàn bộ logic**: bot Discord, tất cả game, tiền, ticket, cầu game, wiring cho web/panel |
| `webplay.js` | ~1.650 | Web chơi cho người chơi (cổng 3002). HTML/CSS/JS client nằm TRONG chuỗi JS |
| `panel.js` | ~1.660 | Panel admin (cổng 1508 SUPER / 1234 thường). Cũng là HTML trong chuỗi |
| `palworld.js` | 157 | Cầu tới dashboard: `giveItem`/`takeItem`/`countItem`/`countItemAll`/`getOnlinePlayers`/link. Basic auth, `cleanName` lọc ký tự lạ trong tên nhân vật |
| `assets.js` | 46 | Phục vụ file tĩnh: **thả file vào `assets/` + restart bot là xong**, không phải khai gì. Đọc 1 lần vào RAM, tra bằng bảng dựng sẵn (không ghép path từ input → không có cửa `../../`) |
| `shop_items.js` | 55 | Danh mục 21 implant đổi passive (7 loại bị nhà phát hành khoá → không bán) |
| `pals.json` | — | 290 pal (code nội bộ + tên hiển thị + paldex) |
| `database.json` | — | **DỮ LIỆU SỐNG** — ví, hồ sơ, cấu hình. Gitignore. Mất là mất hết tiền người chơi |
| `log_{system,result,bet,admin}.txt` | — | Log chia 4 file, tự cắt bớt dòng cũ (2000/1000/1000/500) |

### 6 nguyên tắc kiến trúc (vi phạm là sinh bug tiền)

1. **Tiền tính 100% ở server.** `index.js` quyết mọi thứ, client chỉ vẽ lại cái server
   trả về. Không bao giờ tin số client gửi lên — để client tự tính thưởng thì sửa JS là tự
   cộng tiền.
2. **Ghi DB:** mọi thứ nằm trong `dbCache` (RAM). Vòng lặp 10 giây so `JSON.stringify` rồi
   ghi **atomic** (ghi `.tmp` → rename) — đêm không ai chơi thì 0 lần ghi đĩa. `saveDbNow()`
   ghi ĐỒNG BỘ ngay, chỉ dùng cho khoảnh khắc tiền vừa đổi; **đừng gọi nó trong đường
   đăng nhập/vòng lặp** (ai spam là chặn đứng cả bot).
3. **Deadline Discord 3 giây.** KHÔNG gọi API nào (SFTP mất ~6s) trước `showModal`/reply
   đầu tiên. Cần lâu thì `deferReply` rồi `editReply`.
4. **Ván nằm trong RAM** (`webMines`/`webStairs`/`wheelRoom` là `Map`). Bot restart là mất
   ván đang chơi → có **sổ vé treo** (`_minesPending`/`_stairsPending`/`_wheelPending`) để
   khởi động lại là **tự hoàn tiền cược** các ván treo.
5. **Trả tiền một lần duy nhất.** Mọi đường kết thúc ván phải: xoá ván khỏi Map → xoá vé
   treo → cộng tiền → ghi lịch sử. Bug 19/08 (nổ hũ ăn x2) chính là nhánh trả tiền mà
   *quên xoá ván*.
6. **Sổ biến động (`logDog`)** chỉ ghi khoản CHUYỂN/ĐIỀU CHỈNH (admin cộng trừ, chuyển
   giữa người chơi, vào/ra game, mua pal, hoàn tiền) — **cố tình không ghi** cược thắng
   thua minigame, ghi hết thì sổ thành rác.

### Dữ liệu trong `database.json`

**Mỗi người chơi** (`db[discordUserId]`): `points` (ví), `name`, `webPin` (PIN đăng nhập
web), `lastDaily` + `dailyMonth` + `dailyDays[]` (lịch điểm danh tháng), `streakRun`
(chuỗi ngày thật) + `streakPacks` (gói 800 chờ nhận) + `streakTotal` + `streakRunPaid`
(chống bù trùng), `lastNghien`, `ingameName` (tên nhân vật Palworld — **chỉ admin đặt**),
`lastWheelKey` (lượt vòng quay theo khung 12 tiếng).

**Cấu hình + trạng thái** nằm cùng file dưới các khoá gạch dưới:
`_dogLedger` (sổ biến động), `_palOrders`/`_palOrderSeq` (đơn pal), `_withdrawRequests`/
`_withdrawSeq` (ticket), `_pstats` (thống kê tích luỹ), `_minesHistory`/`_stairsHistory`/
`_wheelHistory`/`_txDashHistory`/`_bcDashHistory` (lịch sử), `_xsBets`/`_xsForced`/
`_xsHistory`/`_xsRound`/`_xsResultMsgIds` (xổ số), `_txBets`/`_bcBets`, `_webChat`,
`_wheelMinPlayers`, `_*ChannelId`/`_*MsgId` (kênh + tin nhắn bảng của từng game),
`_*Pending` (vé treo). Ai mới vào có `STARTING_DOGCOIN = 20`.

`NAME_OVERRIDE` ép tên hiển thị cho vài Discord ID quen (BiaLK, HoangFour, Anh Vinh Q, Hân Z).

### Các game — luật + hằng số + chỗ trong code

**💣 Dò Mìn** (`webMinesApi`, web) — 24 ô, chọn **3–20 mìn**, mở từng ô, dừng lúc nào cũng
được. Hệ số = `nCr` tổ hợp × `RTP`, cắt 2 số lẻ. **`RTP = 1.0` → nhà cái KHÔNG ăn đồng
nào** (giữ y bảng hệ số bản Discord cũ mà người chơi đã quen); muốn hút tiền ra thì hạ
0.97/0.95. Không trần cược/thưởng (`MINES_MAX_WIN = MINES_MAX_BET = 0`), ván ≥ 50.000 thì
ghi log cảnh báo. Mở đủ ô an toàn = Jackpot ván. Admin **ép mìn** được từ panel
(`forcedMines[userId]` hoặc `_any` cho người kế tiếp, dùng 1 lần).

**🔥 Leo Thang** (`webStairsApi`, web) — 10 tầng × 8 cột, tự chọn **1–5 quả cầu lửa**/tầng,
mỗi tầng bấm 1 ô. `STAIRS_RTP = 0.95`. Hệ số = `0.95 × (8/(8−lửa))^tầng`, riêng 2 lửa tầng
9/10 bị **ép tay** xuống 11.86/14.86 (`STAIRS_MULTI_OVERRIDE`). Bẫy sinh **sẵn hết lúc bắt
đầu ván** → server không "đổi ý" giữa chừng. **Ô vàng 🌟** 2% mỗi ván, hiện rõ ở tầng 5–8,
đạp là lên thẳng đỉnh.

**🍀 Ô may mắn** (dùng chung 2 game trên, `MINES_LUCKY_WHEEL`/`STAIRS_LUCKY_WHEEL`) — ô 🍀
**giấu** trong bàn (hiện ra là ai cũng bấm nó đầu tiên = vòng quay free mỗi ván). Đạp vào
thì dừng lại, lật **4 hộp** chọn 1 — phần thưởng quay ở SERVER lúc chọn, 3 hộp kia là hàng
mẫu (hàng mẫu **không bao giờ** ra hũ, kẻo lật ra 2–3 hũ ảo).

| Quà | Dò Mìn | Leo Thang | Tác dụng |
|---|---|---|---|
| 🛡️ Khiên | 15% | 20% | Đỡ 1 lần chết (mìn/lửa), Leo Thang thì đứng yên không lên tầng. **Đếm cộng dồn** (`g.shield++`), không phải cờ bật/tắt |
| ⛏️ Đào / 🚀 Tên lửa | 15% | 15% | Mở giúp 1–2 ô an toàn / +2 tầng |
| 💰 Lì xì | 46% | 40% | **+30%** tiền cược ngay (tối thiểu 1) |
| 🍂 Hụt | 23% | 24% | Không gì cả — **van chỉnh kỳ vọng**, sòng chảy máu thì tăng ô này |
| 🏆 **NỔ HŨ** | 1% | 1% | `trần nổ hũ của ván` + **NGUYÊN hũ nuôi** của trò đó, rồi **CHỐT VÁN LUÔN** |

Ba luật kinh tế của hũ, đừng bỏ: (1) hũ tính theo **cấu hình ván đó** — chọn 1 mìn/1 lửa
rồi ngồi câu hũ chỉ ăn giải bé, hết cửa farm; (2) **trần CHỈ áp ván ăn nhờ trợ giúp**
(🚀/🌟/⛏️, khiên đã dùng để thoát chết, hoặc nổ hũ) — tự lực 100% thì `calculateMulti`/
`stairsMulti` **trả đủ không trần**, cày thật ăn thật; (3) **cược dưới `MIN_BET` (200) là
bị TỪ CHỐI ván** — đặt 1 xu cầu may hết cửa ngay từ đầu, nên mọi ván đều nuôi/ăn hũ như
nhau (không còn cửa xét riêng cho hũ). Nổ xong hũ về mồi `POT_SEED` (1.500), không về 0.

**🎡 Vòng quay nhóm 2 tầng** (`wheelRoom`) — thay Blackjack. Vào bàn **miễn phí**. Đủ N
người (admin chỉnh ở panel) thì nút quay sáng, **người trong bàn tự bấm**, không tự quay.
- *Vòng 1 — VÉ (miễn phí):* 15 nan `1.500/2.000/2.500` xen kẽ, 1 mũi tên, quay ra giá nào
  thì cả bàn trả giá đó. **Lượt bị khoá ngay khi vé quay** (câu giờ chờ vé đẹp = mất lượt).
  Ai không đủ tiền lúc vé chốt thì bị mời ra, không mất gì.
- *Vòng 2 — HỆ SỐ:* 27 nan (chia hết cho 3), 3 mũi tên 🟡🔵🟢 lệch 120° = 9 nan; chọn trùng
  màu thoải mái. Phân bố sau buff 19/08: `×1.5×9 · ×1.8×6 · ×2×5 · ×2.5×3 · ×3×2 · ×5×1 ·
  ×10×1` — **sàn ×1.5, chắc chắn thắng**, kỳ vọng ~×2.33 vé (nhà cái chịu lỗ vòng này, coi
  như quà định kỳ). Vé chốt xong 2 phút không ai bấm thì tự quay.
- **1 lượt/người/khung 12 tiếng** (00:00–11:59 và 12:00–23:59 giờ VN), admin reset được.

**🎲 Big Small** (tài xỉu, Discord + web) — ván **40 giây** = 25s đặt cược + `TX_LOCK_S = 15`
giây nặn. Lúc khoá sổ xí ngầu lắc **ngầm** trong server, người chơi lên web **tự kéo tờ giấy
che** để lộ dần (ai kéo người đó thấy riêng). Cửa: BIG/SMALL/CHẴN/LẺ/**BÃO** (3 viên giống
nhau, ×30 — bão về thì mọi cửa thường thua sạch). ⚠️ Tên cửa trong `TX_CHOICES` vừa để hiển
thị vừa là **giá trị lưu lịch sử** — đổi tên phải so qua `TX_CHOICES.*`, không viết chữ cứng.

**🎰 Xổ số miền Bắc** (`xsState`) — mỗi giờ 1 kỳ vào **đúng đầu giờ**, khoá sổ từ **phút 50**.
Bot tự quay đủ bảng 27 lô như XSMB thật (`XS_PRIZE_SPEC`: ĐB/G1/G2×2/G3×6/G4×4/G5×6/G6×3/G7×4).
**Đề** = 2 số cuối giải ĐB, ăn **×70**. **Lô** = số về ở bất kỳ lô nào, mỗi nháy ăn **×3.5**.
Giới hạn: 5 số đề + 5 số lô mỗi kỳ, tối đa **1.000/số**. Admin ép được số đề / bắt số lô
phải về / cấm về (`_xsForced`, dùng 1 kỳ rồi tự xoá).

**🦀 Bầu Cua** — ĐÃ GỠ HẲN 27/08 (game tắt lâu, dọn cho nhẹ: bỏ MASCOTS/bcState + hàm
BC + nút bc_* + card panel + ctx, ~514 dòng). Muốn dựng lại: lục git history.

**📅 Điểm danh & 💉 Nghiện** (logic dùng chung Discord + web) — điểm danh ngày **400**
(reset 00:00 giờ VN, có lịch tháng), `/nghien` **100** mỗi **1 tiếng**. **Thưởng chuỗi:** cứ
**2 ngày điểm danh LIÊN TIẾP** = 1 gói **800** ghi vào sổ, tự bấm nhận, mỗi lần bấm 1 gói,
gói dồn được và **chuỗi đứt sau đó cũng không mất gói đã ghi**. Chuỗi đếm theo **ngày thật**
(`streakRun`) nên sang tháng không đứt oan; người điểm danh từ bản cũ được **tự bù**
(`streakTopUp`) khi mở trang, `streakRunPaid` chống bù trùng. Lụm nghiện **từ web** mới đăng
công khai vào kênh; gõ `/nghien` trên Discord chỉ có lời đáp riêng (fix 2 tin trùng 19/08).

**🧧 Lộc lá** — chuyển Dogcoin giữa người chơi trên web, có đăng công khai.

**💱 Giá bán TRONG GAME — admin thu Dogcoin bằng tay, KHÔNG có trong code** (cập nhật
21/08/2026). Đây là đường **hút Dogcoin về** duy nhất, để bù phần các trò chơi bơm ra:

| Món | Giá | Ghi chú |
|---|---|---|
| Lõi Văn Minh | **300**/lõi | nâng từ giá cũ |
| Sách (kỹ năng) | **2.000**/sách | nâng từ giá cũ |
| Pal Boss Raid | **40.000–80.000**/con | tuỳ con, admin tự định |
| Đổi passive / cấy ghép | admin ra giá, **cố tình đắt** | chủ server chốt: đây là chỗ thu lại tiền |

> Vì đây là giá **ngoài code**, muốn đổi thì sửa bảng này rồi nói lại với người chơi — bot
> không kiểm tra gì cả. Đừng đi tìm hằng số trong `index.js`, không có.

**🐾 Shop pal** (Discord) — tự chọn **6.000** / quay ngẫu nhiên **2.000** (pool paldex ≥ 80,
trừ Xenolord/Hartalis/Blazamut Ryu). Mọi pal shop: **4 sao, IV 100 cả 3, 4 passive + 1 linh
hồn 60%**. Quay random thì **biết trúng gì rồi mới chọn** passive, hoặc **bán lại 1.000**
(đơn tự đóng, admin khỏi giao). Passive **Cây Thế Giới không bán kèm** (so khớp sau khi bỏ
dấu tiếng Việt nên "Thần Hủy Diệt" hay "than huy diet" đều bắt được). Bot **không tự spawn
pal** — admin tạo tay bằng CreativeMenu rồi bấm hoàn thành trên panel (lý do: xem mục
"Những thứ đã thử và THẤT BẠI").

**📈 Sàn Cổ Phiếu Dogcoin — mã DOG** (`stock*` trong index.js, tab web 📈, tab panel 📈)
— **game duy nhất KHÔNG thanh toán tức thì**: mỗi người đang giữ lệnh là một khoản bot
**đang nợ họ**, phình theo giá. Đọc hết mục này trước khi sửa bất cứ con số nào.

*Bộ máy giá* — chạy hoàn toàn nội bộ, KHÔNG gọi API ngoài (VPS này từng timeout tới Discord):

```
mỗi 2 giây (STOCK_TICK_MS):
  kéo   = −STOCK_PULL × ln(giá / 1000)      // PULL = 0.0024, càng xa mốc càng kéo mạnh
  nhiễu = cfg.vol × ngẫu_nhiên_chuẩn         // vol mặc định 0.003, admin chỉnh ở panel
  giá   = giá × (1 + kéo + nhiễu)
  chặn  : mỗi nhịp không quá ±8% (STOCK_TICK_CAP) · giá luôn trong [300 … 3.000]

nến: cây CUỐI mảng là nến ĐANG SỐNG, mỗi nhịp cập nhật c/h/l và tăng trường n;
     đủ STOCK_CANDLE_TICKS = 25 nhịp (50 giây) thì chốt, mở cây mới với o = c cây trước.

giá mua (ask) = giá × (1 + spread)   |   giá bán (bid) = giá × (1 − spread)
```

*Vì sao 3 con số đó dính chặt nhau* (đổi một cái là phải tính lại hai cái kia):

- **Bề rộng dao động** ≈ `vol / căn(2 × pull)` → 0.003/căn(0.0048) = **±4,3%**. Đây là
  không gian sống của trò: hẹp hơn phí thì không ai thắng nổi.
- **Biên độ một cây nến** ≈ `vol × căn(25)` = **~1,2%** (đo được 1,18%) → ra hình nến,
  không phải cột dài phi từ đáy lên đỉnh.
- **Chênh mua–bán** `spread` = **0,5%/chiều = 1% mỗi vòng**. Đây là **lợi thế nhà cái
  duy nhất**. Từng để 2%/chiều (4%/vòng) và **sai**: 4% trên biên độ ±4,3% khiến người
  chơi gần như không bao giờ thắng. Mô phỏng 300.000 nhịp ở mức 0,5%:

  | Kiểu chơi | Thắng | Lãi/lỗ TB |
  |---|---|---|
  | Vào lệnh ngẫu nhiên, giữ 40s | 10,9% | −1,00% vốn |
  | Vào lệnh ngẫu nhiên, giữ 6 phút | 32,6% | −0,99% vốn |
  | Mua khi dưới 1.000 / bán khi trên, giữ 6 phút | 54,3% | **+0,24%** vốn |

  Tức đa số thua đều 1% mỗi vòng (bot ăn), người chịu quan sát vẫn có cửa. **Đúng tỉ lệ
  của một trò chơi được.** Đổi `spread` là đổi thẳng vào chỗ này.

*Hai chiều* — `stockOpen(uid, side, amount, want, lev)`:

| | Vào ở giá | Ăn khi | Lãi/lỗ |
|---|---|---|---|
| `long` (MUA) | ask | giá **LÊN** | `shares × bid − basis` |
| `short` (BÁN) | bid | giá **XUỐNG** | `basis − shares × ask` |

KHÔNG cho giữ 2 chiều cùng lúc — đổi chiều phải đóng lệnh cũ trước.

*Đòn bẩy = "khối lượng"* — ba trường trong vị thế, **đừng lẫn**:

- `shares` — số CP nắm giữ (**mức rủi ro của BOT**, đây là cái bị trần chặn)
- `cost` — **basis**, giá trị lệnh lúc vào = dùng tính lãi/lỗ
- `margin` — **vốn** đã trừ khỏi ví (KHÔNG còn là mức lỗ tối đa — xem *Cháy ví* dưới)

`đòn bẩy = cost / margin`. Vốn 4.000 ở giá 1.000, giá lên 2% (net 1% sau phí):

| | Nắm | Lãi | Cháy vốn khi giá về |
|---|---|---|---|
| x1 | 3 CP | +30 (1% vốn) | không bao giờ (sàn giá 300) |
| x5 | 19 CP | +190 (5% vốn) | 808 |
| x10 | 39 CP | +390 (10% vốn) | 909 |
| x20 | 79 CP | +790 (20% vốn) | 960 |

*Cháy ví* (`stockBurnCheck()` + `posBuffer()`, chạy mỗi nhịp) — áp **CẢ HAI CHIỀU**.
**Lỗ KHÔNG dừng ở vốn**: ăn hết `margin` thì ăn tiếp vào **số dư ví**, tới khi ví cạn mới
cháy (chủ server chốt 22/08: *"gồng bằng dogcoin từ trong ví luôn tới khi nào cháy ví thì
thôi"*). Ngưỡng = `posBuffer() = margin + ví`, nên **mốc cháy tự xa ra khi người chơi có
nhiều tiền trong ví** và gần lại khi họ tiêu. Đo được với vốn 3.970 / 79 CP / x20:

| Ví còn | Cháy ví khi giá về |
|---|---|
| 5.000 | 896 (−10,4%) |
| 20.000 | 705 (−29,5%) |
| 100.000 | không bao giờ (giá sàn 300 chặn trước) |

Lỗ ghi sổ bị **kẹp** đúng bằng `margin + ví`, và `updatePoints` ở đây **có thể âm** (trừ
tiếp vào ví) — theo cách kẹp đó thì ví sau khi đóng **luôn ≥ 0**, đã test. Web hiện dòng
**💀 CHÁY VÍ nếu giá tới** kèm câu nói rõ đang gồng bằng bao nhiêu (vốn + ví).

> **Lỗ hổng chưa bịt**: mở lệnh xong **chuyển hết tiền đi** (cho bạn / vào game) là đệm
> chịu lỗ tụt về đúng vốn — cơ chế cháy ví chỉ cắn người để tiền trong ví, người tính toán
> thì né được. Muốn bịt thì chặn chuyển tiền + chuyển vào game khi đang giữ lệnh, y như
> cách đang chặn người nợ xấu.

*Chôn vốn* (`cfg.holdS`, mặc định 60 giây) — vào lệnh xong phải giữ đủ số giây này mới
đóng được, chặn kiểu "thấy xanh một nhịp là rút". **Cháy vốn BỎ QUA chốt này** — không
giam người chơi trong lệnh đã hết vốn.

*Chốt an toàn* — đang ⚠️ nợ xấu thì **cấm mở lệnh** (vẫn cho đóng); sàn đóng cũng vậy;
trần `maxPer` (80 CP/người) và `maxShares` (500 CP toàn sàn).

*Panel chỉnh được*: biến động, chênh mua–bán, trần toàn sàn, trần mỗi người, **đòn bẩy tối
đa** (mặc định x20), **chôn vốn (giây)**, đóng/mở sàn, và **thả tin tốt/tin xấu ±40%** (giá
bật/sụp ngay một nhịp, có cảnh báo số tiền bot sẽ phải trả trước khi bấm).

> ### ⚠️ Trần CP toàn sàn là cái phanh DUY NHẤT của ví server
> Thiệt hại tối đa tuyệt đối = `maxShares × 3.000` = **1.500.000** Dogcoin ở mức 500 CP.
> **Đòn bẩy không đổi trần đó nhưng làm nó DỄ CHẠM hơn rất nhiều**: ở x20 cả server chỉ
> cần **~25.000** Dogcoin vốn là chạm trần 500 CP (không đòn bẩy thì cần ~500.000). Nghĩa
> là bot sẽ **thường xuyên** gánh mức rủi ro tối đa thay vì hiếm khi. Thấy tiền chảy ra
> nhanh thì siết **`maxShares`** (500 → 200), KHÔNG phải `maxPer`.

*Ba cái bẫy đã xử sẵn — đừng vô tình mở lại*:

1. **Trần mảng nến** `STOCK_HIST_N = 180` (180 × 50s = 2,5 giờ) đặt từ dòng code đầu tiên.
   Nến sinh 30 dòng/phút — nhanh hơn mọi mảng khác trong bot. Đây là bài học
   `_txDashHistory` phình 1.348 ván = 57% `database.json`.
2. **Vị thế phải `saveDbNow()`** mỗi lần mở/đóng: tiền đã trừ khỏi ví nên restart mà mất
   vị thế là **người chơi mất trắng**. Không đợi vòng lưu 10 giây.
3. **KHÔNG chạy bù nhịp giá** khi bot vừa bật lại sau lúc chết. `stockTick` chỉ do
   `setInterval` gọi, nên bot tắt 2 tiếng thì giá đứng nguyên 2 tiếng — người đang gồng
   mở mắt ra không bị cháy vì những nhịp họ không có cơ hội phản ứng.

*Lỗi tiền đã dính (đừng lặp lại)*: `posMargin()` bị gọi **sau** khi cập nhật `cost`, nên
vị thế mới rơi vào nhánh dự phòng (`margin` rỗng → lấy `cost`) và ghi **vốn 18.090 cho
lệnh vào 10.000**. Phải đọc vốn cũ **trước** khi đụng `cost`. Đọc code thì trượt, chỉ
`check-stock3.js` chạy thử mới thấy.

*Test*: `scratchpad/check-stock3.js` — dựng lại logic sát index.js, boot webplay giả rồi
parse JS client + chạy: bảng đòn bẩy 4 mức, cháy vốn 2 chiều, chôn vốn (chặn khi đang lãi,
mở sau 60s, cháy thì bỏ qua), mọi trần, và kiểm 25 nhịp/nến + biên độ + vùng giá.

### Slash command đang bật
`/sodu` · `/diemdanh` · `/nghien` · `/chuyentien <người> <số tiền>`.
`/addtien` `/trutien` đã **xoá** (nhiều người có quyền Administrator Discord ≠ được đụng ví
— cộng/trừ tay giờ CHỈ ở panel). `/domin` còn nguyên trong code nhưng **comment lại** (chơi
web mượt hơn, không dính deadline 3 giây).

### Web chơi (cổng 3002)

Tab 📈 **Cổ phiếu** dựng theo app giao dịch thật: thanh 3 ô **SỐ DƯ · ĐANG GỒNG · HÔM NAY**,
giá to + Cao/Mở/Thấp/Đóng, tab khung thời gian **50s/5m/10m/20m** (gộp nến ở client) + nút
**MA**, đồ thị nến có **trục giá bên phải** (nhãn vẽ bằng HTML vì SVG dùng
`preserveAspectRatio=none` sẽ kéo méo chữ), kẻ chấm ở giá hiện tại, kẻ vàng ở giá vốn.
Ô đặt lệnh: **nhập số Dogcoin làm vốn** + **tự nhập đòn bẩy** (nút nhanh x1/x5/x10/x20),
hai nút MUA/BÁN in luôn số tiền lên mặt nút. Có thẻ **❓ Cách chơi** mở sẵn lần đầu (nhớ
lựa chọn qua `localStorage`) — chủ server từng nói *"vẫn chưa hiểu cách chơi"*, mà game
không tự dạy thì không ai bấm. Web nạp lại mỗi **2 giây** để nến cuối động thật.
Đăng nhập bằng **Discord ID + PIN** (`webPin`, lấy bằng nút 🌐 trên bảng Big Small trong
Discord). Sai quá nhiều → chặn IP 10 phút; token phiên 30 ngày, đăng nhập lại thu hồi máy cũ.
API: `/api/login` `/api/state` `/api/chat` `/api/players` `/api/transfer` ·
`/api/daily/{state,claim,streak,nghien}` · `/api/wheel/{state,ready,unready,spin}` ·
`/api/bet` · `/api/mines/{state,dismiss,table,start,reveal,cashout,lucky}` ·
`/api/stairs/{state,dismiss,table,start,step,cashout,lucky}`.

### Panel admin (1508 SUPER / 1234 thường)

Tab 📈 **Cổ phiếu**: hai dòng quan trọng nhất là **CP lưu hành** và **trần thiệt hại** —
đọc trước khi thả tin tốt, vì tin tốt là bot **trả tiền thật** cho những người đang gồng
lệnh MUA (và tin xấu thì trả cho lệnh BÁN).
8 tab: `tx` `mine` `stair` `bj`(vòng quay) `bc` `xs` `user` `pal`. Làm được: bật/tắt + ép kết
quả từng game, ép mìn, reset lượt vòng quay, cộng/trừ/set/xoá ví từng người, phát tiền toàn
server, reset điểm danh, duyệt/từ chối ticket nạp rút, đóng đơn pal, **liên kết tên nhân vật
↔ Discord** (`/api/pal/set-name`), xem sổ biến động, chọn kênh cho từng bảng game.

### Kiểm thử — cách đang làm (không có test framework)
Bot không boot được ở máy Windows (node_modules local là discord.js v13, VPS v14) nên test
theo lối **trích code**: đọc `index.js` bằng `fs`, cắt đúng hàm/khối cần thử
(`extract(mốcĐầu, mốcCuối)`), `.replace(/\bconst /g,'var ')` cho biến gắn vào global sandbox,
rồi chạy trong `vm` với phụ thuộc giả (`getUserData`/`updatePoints`/`writeLog`... là stub, ví
là object thường). Mẹo đã dùng: **đè `Math.random`** bằng hàng đợi số để đi đúng nhánh, **đè
`Date`** bằng `FakeDate` để giả lập trôi ngày (test chuỗi điểm danh, sang tháng), shim
`setTimeout` để co thời gian chờ. Test nằm ở thư mục scratchpad của phiên làm việc — chạy
xanh hết rồi mới commit. Các bộ đang có: ô may mắn (88 ca), vay nợ (68), hũ nuôi (60),
vòng quay (63), chuỗi điểm danh (36), lộc lá (34), nổ hũ chốt ván (29), ảnh leo thang (28),
bảng lịch sử (24), bán lại pal (19), cổng online nạp/rút (16), khiên qua HTTP (14),
/nghien (12).

### Cạm bẫy riêng của bot (đã dính, đừng dính lại)
- **`panel.js`/`webplay.js` không kiểm được bằng `node --check`** — JS client nằm trong chuỗi
  HTML. Một lỗi cú pháp ở đó làm chết **toàn bộ** script (triệu chứng: bảng đăng nhập không
  bao giờ ẩn). Cách kiểm đúng: chạy server → tải HTML thật → `new vm.Script()` đoạn `<script>`.
- Trong template literal của panel phải viết `\\'` chứ không phải `\'`.
- **Trùng tên class CSS giữa 2 khu vực** làm vỡ layout (19/08: lịch điểm danh dùng `.dd`
  trùng hàng xí ngầu → lịch sử xếp dọc).
- **Heredoc bash làm hỏng `${}`** trong template literal JS (bad substitution → chuỗi rỗng).
  Sửa file có template literal thì dùng Edit hoặc `node -e`, đừng heredoc.
- Discord chỉ cho **25 nút/tin** và **25 lựa chọn/menu** — danh sách 290 pal phải nhập bằng
  ô text, không dùng menu.
- Ô 🍀 phải chọn trong ô an toàn và **ép số** (`g.mines.map(Number)`) — layout ép từ panel có
  thể là chuỗi, so lệch kiểu là 🍀 rơi trúng mìn.
- Đừng để `current()` trả về vị trí ô 🍀/mìn — client xem được là gian lận được.

---

## 📌 GHI CHÚ BÀN GIAO cho phiên phát triển sau (đọc TRƯỚC khi làm gì — 25/08/2026 tối)

**Trạng thái:** toàn bộ hệ pal-web ĐANG CHẠY THẬT trên server chính (commit `4a1fc17`):
quay pal CSGO 10s + chọn pal đích danh + rương + giao tự động BOSS Lv80 4 sao +
cổ phiếu tự cắt theo mốc. Đã giao thật nhiều pal cho người chơi thật.

**1. Passive — 12 con còn cờ ⚠ `unsure` trong `BotDoMin/passives.json` (mã đoán, cần
kiểm):** Chiêu Đãi Hào Phóng (`LavishHospitality`), Thân Thủ Linh Hoạt
(`RideJumpCount_Increase1`), Chủ Nhân Trang Trại (`RanchMaster`), Bảo Mẫu Trông Trẻ
(`MutationPal_Babysitter`), Đứa Trẻ Trang Trại (`Farmhand`), Lòng Thương Bao La
(`Philanthropist`), Tinh Thần Phục Vụ (`ServiceMinded`), Dòng Dõi Cao Quý
(`SalePrice_Up_2`), Sung Sức (`Stamina_Up_2`), Nóng Vội (`CoolTimeReduction_Up_2`),
Không Ngủ (`Insomnia`), Bơi Lội Uyển Chuyển (`SwimSpeed_up_1`).
- **Cách đào mã ĐÃ ĂN 25 con** (làm lại được cho 12 con này): trang
  `paldb.cc/en/Passive_Skills` nhúng mã thật trong `data-hover="?s=PassiveSkills%2F<ID>"`
  và tên item cấy `PalPassiveSkillChange_(Consumable_)?<ID>`; passive chỉ có trên boss
  thì vào TRANG PAL (vd `paldb.cc/en/Bellanoir_Libero`) grep
  `data-hover="?s=PassiveSkills/<ID>"` (dấu / thường). Ví dụ đã tìm ra: Siren of the
  Void=`Witch`, Lunker=`Nushi`, Savior=`Salvation`, Otherworldly Cells=`Alien`,
  Heavyweight=`Deffence_up2_2`, Diamond Body=`Deffence_up3`.
- **Cách kiểm trong game:** gửi pal test gắn 4 passive ⚠/con qua SFTP server test
  (kịch bản mẫu: scratchpad `paltest8.mjs` — lệnh `PAL2 <species> 1 0 0 0 0 0 0 0 0 0
  0 0 <id1,id2,id3,id4> <tênNhânVật>`), người chơi mở hộp xem con nào THIẾU ô = mã sai.
  Bài học: pal Yakumo giao thật thiếu 2 ô → lòi ra 2 mã sai đầu tiên.

**2. Môi trường test (máy Windows này):** bot test `Desktop/bialk-test` (web 4002,
panel 4508/4234, PIN 123456, user `111111111111111111`, nhân vật test `bia123`);
dashboard test cổng 3010 (`palworld-dashboard/server/.env` local, gitignore, SFTP server
test "1. Cô 4 và những người bạn"); server test SFTP trong `env.sh` ở scratchpad;
KHÔNG BAO GIỜ trỏ tool test vào server chính khi chưa được lệnh. Bộ test trích code
thật nằm ở thư mục scratchpad phiên Claude (palwheeltest.js 83 case + 17 bộ khác).

**3. Server CHÍNH:** VPS `/root/tts-bot` (pm2: `BotDoMin` + `palworld-dashboard` —
sửa dashboard NHỚ restart cả nó); server game panel Shockbyte tên "1. test mod"
(SFTP uuid `11d72659-…`); web chơi `103.72.98.37:3002`. Deploy = commit → push →
user pull + pm2 restart; mod = đè `GiveGoldCommand/Scripts/main.lua` qua SFTP + restart
server game. Pal giao xong DÙNG ĐƯỢC SAU RESTART server game (giới hạn game engine,
đã dò hết API — đừng đào lại đường "dùng ngay không restart", xem nhật ký 25/08).

**4. Việc còn mở:** (a) kiểm 12 passive ⚠; (b) reel quay hiện ẢNH pal thay tên — cần
gom đủ ảnh (mới có 16/290 ở `BotDoMin/assets/palimage/`, tên file
`T_<code>_icon_normal.png`) và sửa `assets.js` (đang chỉ quét 1 cấp thư mục nên file
trong palimage/ bị 404); (c) tự động hoá restart server game theo khung giờ — dashboard
có sẵn `/api/save` + `/api/shutdown` (REST Palworld), chỉ cần bật REST trong
`server/.env` prod + panel Shockbyte auto-start; (d) 7 passive World Tree cố tình CẤM
khỏi web (giữ kinh tế sạp trong game) — đừng thêm vào nếu chủ server không đổi luật.

## 📋 TRẠNG THÁI HIỆN TẠI + BÀI HỌC (đọc đầu tiên khi mất lịch sử)

Thay cho nhật ký theo ngày: chỉ giữ **cái đang đúng** + **bài học đã tốn nhiều lượt
thử-sai**. Ngày tháng không quan trọng, GIÁ TRỊ HIỆN TẠI mới quan trọng. Có gì lệch với
các mục hằng-số phía trên thì TIN MỤC NÀY (mục trên có thể còn số cũ chưa cập nhật).

### Cấu hình hiện tại từng hệ thống

**📈 Cổ phiếu Dogcoin (web, index.js `stockTick`/`stockCfg`)** — mốc gốc **1.000**, biên
cứng **100–2.000** (`STOCK_MIN/MAX`), nến **60 giây** (`STOCK_CANDLE_TICKS=30`, nhịp 2s),
kho **4 giờ** (`STOCK_HIST_N=288`), web hiện **15 nến/màn** (kéo ngang xem lại). Giá đi
theo **NEO LANG THANG**: một neo vô hình (`_stockAnchor`) tự đi bộ khắp dải, mỗi chặng
20–50 phút bốc đích cách 150–700, giá bám neo (`STOCK_PULL=0.004`) + nhiễu `tickAmp` (mặc
định 3, độ lệch chuẩn ĐƠN VỊ giá/nhịp, trần ±4×tickAmp). Ngưỡng mềm chỉnh ở panel:
dưới `waveLow`(350) neo thiên LÊN, trên `waveHigh`(1650) thiên XUỐNG, giữa random. Reset
1 lần khi boot: `_stockSeedV=6`. Admin can thiệp KÍN = `stockPush` (±40%, trôi ~2,5 phút,
người chơi không biết). Panel chỉnh sống: tickAmp, spread(0,1%), maxShares, maxPer, maxLev
(20), holdS(60), pointX, waveOn/waveLow/waveHigh.
⚠️ **Lỗ hổng kinh tế phải canh:** mint tối đa/người = `maxPer × biên_độ_di_chuyển × pointX`.
Với neo lang thang 100–2.000, người mua sát đáy giữ tới đỉnh ăn KHỔNG LỒ gần như chắc
(chính ngưỡng mềm tạo điểm mua/bán gần chắc thắng). Giữ **`maxPer` thấp (~50)**, không để
500. Hạ rủi ro thật = hạ đòn bẩy/maxPer/pointX, KHÔNG phải tickAmp.

**💰 Kinh tế** — điểm danh **+600/ngày**, `/nghien` **+200/giờ**, vé vòng quay
**3.000/4.000/5.000**, `MIN_BET=400` (mọi minigame trừ Tài Xỉu), hũ Dò Mìn/Leo Thang mồi
**5.000** trần nuôi **50.000**, hũ gacha mồi **1.500** trần **20.000**.

**🎁 Shop pal (web, trang 🪪 Cá nhân) — giao TỰ ĐỘNG**, không cần admin đưa tay. Luồng:
web chọn → `/api/pal/claim` → `palChestClaim` → `pal.givePal` → dashboard `/api/give-pal`
→ mod (lệnh PAL2) → pal vào save, **DÙNG ĐƯỢC SAU RESET server**. Có Quay Pal kiểu CSGO
(vé 2.000) + Chọn Pal đích danh (6.000, boss raid giá riêng) + Rương. `palWheelCfg`:
level 80, 4 sao, linh hồn 1 dòng 60% (mở tới 4 dòng, mua tới 201%), IV 100 (mua tới 255),
passive 4 ô (mở tới 8), bản PAL BOSS. **Nâng cấp trả phí** (trừ ví khi nhận, giao hụt tự
hoàn): slot passive 5/6/7/8 = 8k/16k/32k/64k; soul %/IV/số-dòng-soul theo bảng; passive
Cây Thế Giới 1.000/cái; boss raid Bellanoir Libero 9.000, Blazamut Ryu/Xenolord/Hartalis
20.000. **Giới tính BẮT BUỘC chọn** (♂ Đực=1 / ♀ Cái=2, không mặc định).
27/08 **VÒNG QUAY GẮN HÌNH + THANH MAY MẮN + VÒNG RAID**: reel giờ có **hình pal**
(`assets/palimage/T_<code>_icon_normal.png`, 287 icon; `assets.js` quét subfolder; con
thiếu hình tự ẩn `<img>` chừa tên). Pool thường **279** (loại thêm Boltmane/Dragostrophe
theo `PALWHEEL_EXCLUDE_CODE` vì chưa có hình). **Gộp 1 reel**: raid ra thẳng ở vòng thường
(ô trúng bốc lửa `.raidhit` + toast riêng), bỏ màn 2-reel; `revealMs` cả 2 loại = **10.500**.
🍀 **Thanh may mắn** (`u.palLuck`, mỗi lượt +`luckMin..luckMax`% mặc định 1-3, **admin đặt
%/quay RIÊNG từng người** ở panel `u.palLuckRate` để cài sẵn cho bạn — máy in tiền có chủ
đích, đặt cao = lời vô hạn). Đầy 100% mở **🔥 VÒNG RAID** (`palRaidSpin`, 4 boss Hartalis/
Bellanoir/Blazamut Ryu/Xenolord + thưởng `raidBonus` mặc định **18.000**, quay xong thanh
**về 0**). Cfg panel: `luckMin/luckMax/raidBonus/raidWheelOn`. **Chống spam** (`palSpinLocked`):
đang có lượt chưa hiện (revealAt tương lai) thì server CHẶN quay mới (cả 2 vòng) + nút web
**đếm ngược ~10,5s** (state trả `spinRemain` để F5 dựng lại đếm ngược, KHÔNG resume hoạt
hình — bản resume cũ bị bỏ vì F5 nhảy loạn con khác).

**✨ Passive (`BotDoMin/passives.json`, 99 mục)** — tên/mô tả tiếng Việt trong game, `id`
= FName game lưu thật, `tier` 1-4 màu (trắng/vàng/xanh ngọc, `bad` đỏ, `wt` Cây Thế Giới
cầu vồng). `builds` = bộ 4 passive chọn nhanh. Cấm: 7 passive Cây Thế Giới trong build gốc
(thay con cùng vai trò).

**📒 Vay nợ (`loanCfg`, admin chỉnh panel tab 🎮)** — 27/08 ĐẠI TU: phí vay **1 LẦN**
(mặc định 20%, `feePct`), **KHÔNG còn lãi kép ngày** (`debtAccrue` chỉ ghi mốc, không
tăng nợ). Vay X → ghi nợ X×(1+phí%), nhận đủ X (vay 10k → nợ 12k; vay 20k → 24k). Vay
tối đa `dailyMax`=20.000/ngày, ôm tối đa `cap`=60.000. Cả 3 số chỉnh sống ở panel
(_loanCfg), đổi xong **Đăng lại bảng** để text mới. **NỢ XẤU** (admin gắn) bị siết mạnh:
🚫 vay · 🚫 chuyển tiền (đi lẫn nhận) · 🚫 mua/quay pal · 🚫 chuyển vào game · mọi khoản
thu (điểm danh/nghiện/event/ai chuyển cho) bị **xiết thẳng trả nợ, ví chỉ chừa sàn 1.000**
(`DEBT_BAD_FLOOR`, hàm `debtBadSweep` gọi khi gắn nhãn + mỗi lần nhận tiền). Trả sạch =
nhãn tự bay.

**🎲 Big Small / Tài Xỉu (web nặn xí ngầu, `txState`)** — ván `TX_ROUND_S=40s`. Vòng chạy
(`runTaiXiuLoop`) CHỈ tick khi có `txState.channel` (bảng Discord). **27/08: TỰ KHỞI ĐỘNG**
— boot tự `startLonnho` lại kênh `_txChannelId` đã lưu, khỏi cần admin bấm mở. **Lịch sử
KHÔNG mất qua restart**: `dbCache._txHist20` lưu 20 ván gần nhất (web đọc `txState.history`
để vẽ "Lịch sử 20 ván"), boot khôi phục + gameId nối tiếp. 27/08 DỌN NHẸ RAM/DB: soi
cầu RAM 1000→**100**; `_txDashHistory` (từng phình 57% vì KHÔNG cap) giờ **cap 100 ván
cược** + dọn 1 lần lúc boot; UI show **20**. Cầu Dogcoin 2 chiều trần **90.000/lần**
(`WITHDRAW_MAX_PER_REQUEST`, dùng chung cả 2 chiều).

**🎡 Vòng quay nhóm 2 tầng, 📉 vay nợ, 💣 Dò Mìn, 🔥 Leo Thang, 🍀 ô may mắn** — xem mục
"Các game — luật + hằng số" phía trên (cơ chế không đổi; chỉ số tiền theo mục kinh tế này).

### Bài học tái sử dụng (đọc trước khi sửa cùng loại)

1. **ID passive/pal sai = pal ra passive lạ hoặc không đổi giới tính.** Mod ghi thẳng
   `FName(id)` vào save, bỏ qua hạn chế cấy (add được cả Legend/Huyền Thoại vào pal thường)
   — nên KHÔNG có "passive cấm", chỉ có ID SAI. **Một id sai trong lô → game từ chối CẢ
   lô → pal giữ passive spawn.** Nguồn FName chuẩn = save-editor
   `oMaN-Rod/palworld-save-pal` file `data/json/l10n/en/passive_skills.json` (key = FName,
   value.localized_name = tên EN). paldb.cc chỉ có mã cho passive cấy-được; passive 1.0 đặc
   biệt phải lấy từ save-editor. 26/08 đã sửa 6 id bằng nguồn này.
2. **Giới tính pal:** trường `Gender` (EPalGenderType) — **0=random, 1=Đực, 2=Cái**. Mod
   ghi số nguyên `sp.Gender=1/2` ĂN (verify tận game). Không phải FName.
3. **Nút reset server cho người chơi = BẤT KHẢ THI trên hosting này.** REST `/shutdown`
   chỉ TẮT được, server KHÔNG tự dậy (panel coi là admin chủ động tắt). Access Control
   không cấp API key → dashboard không gọi được task panel. Lời giải: đặt lịch **"Send
   Restart"** trong **Scheduled Tasks** của panel Shockbyte (Tasks) — pal tự kích hoạt ở
   cữ restart, không cần ai online. Đừng gọi `/shutdown` REST tự động.
4. **"fetch failed" khi bấm nhận pal** = dashboard chưa chạy. Bot gọi `PAL_DASHBOARD_URL`
   (test .env `http://127.0.0.1:3010`) để đếm túi kiểm online. Bật local:
   `cd palworld-dashboard/server && node src/index.js`; prod chạy trong pm2 nên tự sống.
5. **give-pal khớp tên nhân vật CHÍNH XÁC.** Tên có ký tự ẩn (vd U+1CBC sau "bia123",
   game đọc "bia123᲼") → gửi tên liên kết trượt "no PlayerController". Đếm túi khớp mờ nên
   VẪN thấy online → dễ tưởng nhầm. Ai đặt tên có ký tự lạ có thể nhận hụt; sau này nên cho
   give-pal khớp theo tiền tố/lược ký tự ẩn như đếm túi.
6. **UI:** đổi UI xong PHẢI Ctrl+Shift+R (trình duyệt cache trang cũ — hay bị tưởng lỗi
   code). Panel: base `button{}` có `color:#fff` + `background:#3a4155` (đã fix); nút không
   có class `.btn-*` mà thiếu background = nền bạc chữ trắng không đọc được.
7. **Client HTML/JS** nằm trong MẢNG STRING ở webplay.js/panel.js. Đừng re-render khối
   chứa input (mất giá trị đang gõ) — markup tĩnh + cập nhật value riêng. `pagecheck.js`
   validate từng khối `<script>`. Escape `\\'` trong template panel.
8. **Kiểm thử** không có framework: extraction-based (`ex(startMark,endMark)` cắt index.js
   → `const→var` → chạy trong `vm` sandbox với hàng đợi RNG). Bộ test ở scratchpad
   (stocktest 44, wheeltest, pottest, luckytest...). Sửa hằng số cổ phiếu thì cập nhật
   assertion trong stocktest.
9. **Deploy:** CHỈ commit/push khi chủ server ra lệnh. VPS:
   `cd /root/tts-bot && git pull --ff-only && pm2 restart BotDoMin --update-env` (dashboard
   ít khi cần restart). Bot test ở `Desktop/bialk-test` (dữ liệu sống, không xoá), dashboard
   local phải TỰ bật. **SFTP 2 server + hard-block server cấm** nằm trong `.env` (gitignore)
   + bộ nhớ Claude — KHÔNG đưa mật khẩu lên README/git.

### Nhật ký cô đọng (mốc lớn, mới → cũ)

- **28/08** — 🛒 **SHOP ITEM**: mua item game + số lượng → giao thẳng vào túi qua mod (lệnh
  `ITEM`, `pal.giveItem` có sẵn), admin quản danh mục ở panel (id/tên/giá/max/hình), hình ở
  `assets/itemimage/` (assets.js quét subfolder). **StaticItemId lấy từ paldb** (mục "Code")
  hoặc suy từ tên icon (bỏ tiền tố: `T_itemicon_Consume_ExpBoost_04`→`ExpBoost_04`); **độ
  hiếm armor = id RIÊNG có hậu tố** (`AncientHelmet_5`=Huyền Thoại). Boot **seed 6 món mặc
  định** (`DEFAULT_ITEM_SHOP`) khi DB chưa có `_itemShop` (deploy mới có sẵn; admin xoá/sửa
  sau vẫn giữ — chỉ seed khi `undefined`). ⏳ **Cooldown nhận pal
  CHUNG** 5 phút (đặt sau khi giao thành công). 🚦 **Khoá giao đơn chung** (`deliverBusy`):
  đang giao 1 đơn pal/item thì chặn mọi đơn khác → **chống mở nhiều phiên SFTP dồn dập
  (Shockbyte khoá ~10 phút)**. 📈 **Cổ phiếu NHỐT GIÁ TRONG BAND**: waveOn = giá chỉ loanh
  quanh trong [waveLow, waveHigh] (neo đi trong band + đẩy mềm mép + chốt cứng; ~98% trong
  band); panel đổi nhãn "Đáy/Trần band". 🎨 Popup xác nhận web (`gConfirm`) giống admin thay
  `confirm()`. **F5 giữ tab** (web dùng PAGE_GRP; panel thêm tab stock). Card 🎒 Rương làm
  lại (hình pal + nút dưới). **THỬ rồi BỎ "mua sao 5-15"**: Palworld chốt cứng 4 sao (+20%),
  sao 5+ vô dụng — pal giao đúng cfg.stars, sức mạnh thật = IV + linh hồn.
- **27/08** — Giới tính pal bắt buộc chọn ở web (♂ xanh/♀ hồng); phát Dogcoin toàn server
  kèm lời nhắn custom; gỡ card "Đơn mua Pal"; fix nút panel nền bạc; chip passive đã chọn;
  cầu Dogcoin trần 90k; Tài Xỉu tự khởi động + giữ lịch sử; **đại tu vay nợ** (phí 20% 1
  lần, không lãi kép, nợ xấu xiết ví về 1.000, admin chỉnh panel); **GỠ HẲN Bầu Cua** (dọn
  ~514 dòng dead code, cả index.js lẫn panel.js); **can thiệp Tài Xỉu** ở panel: hiện cược
  trực tiếp (cửa nào gánh bao nhiêu + ai đặt gì) + nút 🎯 tự chọn xúc xắc cho nhà cái ăn
  nhiều nhất + đồng hồ "còn Xs để ép ăn ván này". Ép chỉ ăn khi CÒN MỞ CƯỢC (dice chốt lúc
  khóa sổ; ép sau khóa trôi sang ván sau — không phá cơ chế nặn).
- **27/08 (chiều)** — **Vòng quay pal gắn hình** (287 icon `assets/palimage/`, assets.js quét
  subfolder); gộp 1 reel raid ra thẳng + ô trúng bốc lửa; loại Boltmane/Dragostrophe (thiếu
  hình). 🍀 **Thanh may mắn** đầy 100% mở **vòng RAID** (4 boss + 18k, xong về 0), admin đặt
  **%/quay riêng từng người** ở panel (rig cho bạn). **Chống spam quay/F5**: server khoá khi
  còn lượt chưa hiện + nút web đếm ngược ~10,5s (dùng `spinRemain`, chỉ đếm ngược không resume).
  Làm lại card **🎒 Rương Pal**: mỗi con 1 thẻ — trên là hình pal + tên/tag/giờ, dưới là nút
  Bán/Nhận full ngang (con RAID viền lửa).
- **26/08** — Cổ phiếu chốt: mốc 1.000, neo lang thang 100–2.000, nến 60s lình xình
  (tickAmp 3), ngưỡng mềm 350/1650 chỉnh panel. Sửa 6 ID passive sai. Điều tra nút reset
  server (kết luận bất khả thi → Scheduled Task). Bán 4 boss raid + 7 passive Cây Thế Giới.
  Nâng cấp pal trả phí (passive 5-8, soul/IV vượt trần, boss raid). Gói chỉnh kinh tế.
- **25/08** — Shop pal LÊN WEB: Quay Pal kiểu CSGO + Chọn Pal + Rương ở Cá nhân, giao TỰ
  ĐỘNG qua dashboard→SFTP→mod. Discord chỉ còn chuyển tiền. 9 build passive chọn nhanh.
- **24/08** — Cổ phiếu: sức nặng điểm giá (pointX) + phí vay 20%.
- **22/08** — Game mới 📈 Sàn Cổ Phiếu Dogcoin (thuần web, đòn bẩy, chôn vốn, cháy cả ví).
- **(trước đó)** — Cầu Dogcoin 2 chiều TỰ ĐỘNG (bắt buộc online), mini-game web (Dò Mìn,
  Leo Thang, ô may mắn, hũ), Vòng quay nhóm 2 tầng thay Blackjack, PalSchema máy nghiền.

---
## Liên kết Discord ↔ nhân vật — ĐÃ NGƯNG (17/08/2026)

Hệ liên kết SteamID cần REST API (`/api/players`) mà server test hiện **không bật REST**
→ toàn bộ đường này ngưng. Thay bằng: **admin liên kết tên ở panel bot** (tab 🎮,
card 🔗), bot lưu `ingameName` trong `database.json`. Code links.js/endpoints vẫn còn
nhưng các endpoint cần REST giờ trả 503 rõ ràng (xem guard trong `palworldClient.js`).

---

## Cấu hình

`server/.env` (dashboard) — cấu hình TỐI THIỂU đang dùng (server test 17/08/2026,
chỉ chạy cầu SFTP Dogcoin, REST tắt):
```
SFTP_HOST=sftp.discord.sgp2.shockbyte.host
SFTP_PORT=2222
SFTP_USERNAME=default@<uuid của server trên Shockbyte>
SFTP_PASSWORD=<mật khẩu SFTP>
SFTP_MOD_PATH=/1. test mod/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand
```
(PORT mặc định 3000, HOST mặc định 127.0.0.1 — GIỮ NGUYÊN, xem phần Xác thực.)

Muốn bật lại REST (quản lý người chơi, kick/ban, links) thì thêm:
```
PALWORLD_HOST=<ip>
PALWORLD_PORT=<port REST>
PALWORLD_PROTOCOL=http
PALWORLD_ADMIN_PASSWORD=<AdminPassword trong PalWorldSettings.ini — ĐỔI MỖI LẦN CÀI LẠI SERVER>
DASHBOARD_PASSWORD=          # để trống = không cần đăng nhập
```

`BotDoMin/.env` thêm:
```
PAL_DASHBOARD_URL=http://127.0.0.1:3000
PAL_DASHBOARD_PASSWORD=      # phải KHỚP DASHBOARD_PASSWORD ở trên
PANEL_PASSWORD=              # để trống = panel không cần đăng nhập
```

### Xác thực — hiện đang TẮT theo yêu cầu chủ server
- **Dashboard** nghe `127.0.0.1` nên tắt mật khẩu chỉ mở cho tiến trình cùng máy (bot).
  Rủi ro thấp — **nhưng đừng đổi `HOST` thành `0.0.0.0`**.
- **Panel bot** nghe `0.0.0.0` cổng 3001, tắt mật khẩu = **mở cho cả internet**: cộng/trừ
  Dogcoin, ép kết quả game, tặng item thật. Chủ server đã được cảnh báo và chấp nhận.
- Bật lại: điền giá trị vào `PANEL_PASSWORD` / `DASHBOARD_PASSWORD` rồi restart.
- Muốn vừa tiện vừa an toàn: `ufw deny 3001` rồi vào qua SSH tunnel
  `ssh -L 3001:localhost:3001 -p 24700 root@103.72.98.37`.

---

## Deploy mod Lua

```bash
cd tools && node upload.js      # đẩy main.lua + bật mod trong mods.txt
```
**Rồi PHẢI restart server Palworld** — UE4SS chỉ nạp Lua lúc khởi động.
Xác nhận: `results.log` có dòng `mod loaded`.

Đẩy 1 file bất kỳ lên server: `node putfile.js <file local> <đường dẫn trên server>`

Gửi lệnh thô cho mod (debug): `node rawcmd.js "COUNTALL DogCoin"`

---

## Mod PalSchema `BialkServer` — sửa dữ liệu game

Nguồn giữ ở `palschema-mods/BialkServer/`, trên server nằm ở
`ue4ss/Mods/PalSchema/mods/BialkServer/`. Có `enableAutoReload` nên **sửa JSON là nạp lại
ngay, không cần restart**.

| File | Tác dụng | Trạng thái |
|---|---|---|
| `raw/recycler.json` | Tắt slot 8/9/14 của 5 dòng `AncientRelicRecycler_WorldTreeRelic_01..05` → máy nghiền không ra **Ancient Civilization Core**, **Disposable Implants**, **Mutation Implants** | ✅ **đã kiểm chứng chạy** |
| `raw/drop_silvance.json` | Đặt drop rate của Silvance về 0 | ⚠️ **KHÔNG ăn với pal Lv70+** |
| `raw/operating_table.json` | Giá bàn phẫu thuật | xem `GHI-CHU-BAN-PHAU-THUAT.md` |

**Bản đồ slot máy nghiền** (xác định bằng thử nghiệm thật, KHÔNG suy từ palpedia — thứ tự
khác nhau): 3–7 đá quý · **8, 9 = Core + Implants** · 10–12 Skill Cards/Fruits/Books ·
13 Ancient Blueprints · **14 = Mutation Implants**.

Chi tiết đầy đủ: `server-backups/NHAT-KY-SUA-SERVER.md` và `GHI-CHU-BAN-PHAU-THUAT.md`.

---

## ❌ Những thứ đã thử và THẤT BẠI — đừng lặp lại

### 1. Tặng pal (give-pal) — ĐÃ GỠ KHỎI HỆ THỐNG
Pal tặng được vào túi nhưng **không thao tác được** (không xuất ra, không bỏ palbox) cho tới
khi **restart server**. Đã loại trừ 5 giả thuyết:
- ghi `Level`/`Exp` sai → không phải (readback đúng)
- khối ghi lại passive sau capture → không phải (test không passive vẫn lỗi)
- actor spawn không bị hủy → hủy rồi vẫn lỗi
- `Debug_CaptureNewMonster_ToServer` → gọi `ok=true` nhưng **vô hiệu trong bản Shipping**
- pal "trần" không ghi chỉ số nào → **vẫn lỗi** ⇒ gốc rễ là chính cách spawn-rồi-bắt

**Kết luận:** game **không expose API nào** để thêm pal vào giỏ (`PalPlayerDataPalStorage`,
`PalGlobalPalStorageSubsystem`, `PalNPCManager`, `PalIndividualCharacterHandle` đều chỉ có
hàm đọc). Hiện dùng **shop pal trên Discord + admin tạo tay bằng CreativeMenu**.

### 2. Hook chat trong game
`RegisterHook("/Script/Pal.PalPlayerState:EnterChat")` — đăng ký được nhưng **không bao giờ
chạy**, và nghi làm **gãy chat** của server. Đã gỡ. Đừng hook hàm RPC mạng trên server thật.

### 3. "Bug Level" pal ra Cấp 2
**Không phải bug.** Server bật **Level Sync**, hạ pal xuống bằng cấp nhân vật.

### 4. Silvance vẫn rớt lõi ở Lv70+ — ĐÃ TÌM RA NGUYÊN NHÂN (08/08/2026)
Đã thử `Rate=0`, `ItemId="None"`, thêm dòng `BOSS_Mothman000` — đều không chặn được pal
Lv70+. **Nguyên nhân:** bảng drop có riêng 2 dòng `Mothman070`/`BOSS_Mothman070` cho pal
cấp ≥ 70 mà bản PalSchema không vá tới. Đã giải bằng pak `BialkSilvanceNoDrop_P.pak`
(vá đủ 4 dòng) — xem `pak-mods/README.md`.

---

## Bài học kỹ thuật (tốn nhiều lượt thử-sai mới ra)

**UE4SS Lua**
- Hàm có out-param: **phải truyền đủ tham số**, và out-param được ghi vào **bảng truyền vào**:
  `inv:TryGetContainerFromStaticItemID(FName(id), out)` → đọc `out.OutContainer`
- `slot.ItemId.StaticId` là **FName** → phải `:ToString()`. `tostring()` chỉ ra địa chỉ bộ nhớ.
- Không có hàm trừ item nào expose ra Lua → cách làm được: **ghi thẳng `slot.StackCount`**
  rồi gọi `OnRep_StackCount()`. Cùng kỹ thuật với chỉ số pal.
- Mọi thay đổi struct phải ghi vào **cả `SaveParameter` lẫn `SaveParameterMirror`** rồi
  `OnRep_SaveParameter()`.

**Discord bot**
- **KHÔNG gọi API nào trước `showModal`/reply đầu tiên.** Discord chỉ cho **3 giây**, mà mỗi
  lượt gọi SFTP mất ~6 giây → luôn báo "ứng dụng không phản hồi kịp thời".

**panel.js**
- JS phía client nằm trong chuỗi HTML nên **`node --check panel.js` KHÔNG kiểm được**. Một
  lỗi cú pháp ở đó làm chết toàn bộ script (triệu chứng: bảng đăng nhập không bao giờ ẩn).
  Cách kiểm đúng: chạy panel → tải HTML thật → check cú pháp đoạn `<script>`.
- Trong template literal phải viết `\\'` chứ không phải `\'`.

**PalSchema**
- **Không đặt khoá chú thích** (`"_ghi_chu"`) ở cấp cao nhất JSON — nó tưởng là tên DataTable.
- Vá vào bộ nhớ, **không tự hoàn tác**: bỏ field khỏi JSON thì giá trị cũ vẫn còn tới khi restart.

**Tra ID**
- Species ID nội bộ **khác tên hiển thị**: Fuack = `BluePlatypus`, Lamball = `Sheepball`,
  Fuack Ignis = `BluePlatypus_Fire`. Tra ở paldb.cc mục **"Code"** (nằm cuối trang, phần Others).
- Danh sách 290 pal đã có sẵn ở `../BotDoMin/pals.json`.

---

## 🔜 Việc đang dang dở: chuyển server sang Linux native

Chủ server muốn chuyển vì **Linux chạy mượt hơn Windows/Wine** (đang bị ping cao khi có
3 người chơi).

**Hậu quả phải biết trước:** UE4SS **không chạy trên Linux native**. Mất UE4SS là mất:
- ❌ Chuyển Dogcoin vào/ra game (mod Lua)
- ❌ Bảng số dư trong game
- ❌ **Toàn bộ mod PalSchema** → máy nghiền rớt lõi trở lại như mặc định
- ✅ Vẫn chạy: shop pal, quản lý người chơi, kick/ban, broadcast, các mini game Discord

**Cách giữ lại thay đổi máy nghiền: ĐÃ LÀM XONG (08/08/2026)** — xem `pak-mods/README.md`:
- `pak-mods/BialkServer_P.pak` — máy nghiền không rớt implant + lõi. **Đã test trong game, chạy đúng.**
- `pak-mods/BialkSilvanceNoDrop_P.pak` — Silvance không rớt gì (mọi cấp, cả boss; giải luôn
  vấn đề Lv70+ mà PalSchema chịu thua). Đã upload lên `~mods/` của server hiện tại,
  chờ restart để test.

Quy trình dựng lại, công cụ (UAssetCLI + repak + Mappings.usmap) và các bẫy đã dính
ghi đủ trong `pak-mods/README.md`. Pak chạy được cả trên Windows/Wine lẫn Linux native.

**Trước khi chuyển, nên làm:** thêm công tắc `PAL_TRANSFER_ENABLED=false` để ẩn 2 nút chuyển
Dogcoin, tránh người chơi bấm rồi bị trừ tiền mà không nhận được gì.

**Lưu ý lâu dài:** khác PalSchema (vá lúc chạy, tự thích nghi), pak gắn với phiên bản asset
cụ thể — game update lớn là phải làm lại.

---

## Vấn đề chưa giải quyết: ping cao

Ping cao **liên tục** khi có 3 người chơi. Chưa đo được `serverfps`. Cách xác định:
```bash
curl -s http://127.0.0.1:3000/api/metrics
```
- `serverfps` **< 20** → thiếu CPU, mod không liên quan, phải nâng gói host
- `serverfps` **> 30** → do đường truyền

Nhìn code thì mod gần như chắc chắn **không phải** nguyên nhân (mỗi 2 giây chỉ đọc 1 file nhỏ,
phần nặng chỉ chạy khi có lệnh). Đừng tối ưu mod trước khi có số liệu.

---

## Chạy ở máy local

```bash
cd server && npm install && npm start     # http://localhost:3000
cd tools  && npm install                  # công cụ SFTP
```
