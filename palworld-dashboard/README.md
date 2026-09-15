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
test — 08/09 chủ server ĐỔI TÊN thành "1. test mod", path SFTP đổi theo tên hiển thị
nên đổi tên server trên Shockbyte = phải sửa `SFTP_MOD_PATH` trong `.env` tương ứng);
server test SFTP trong `env.sh` ở scratchpad;
KHÔNG BAO GIỜ trỏ tool test vào server chính khi chưa được lệnh. Bộ test trích code
thật nằm ở thư mục scratchpad phiên Claude (palwheeltest.js 83 case + 17 bộ khác).

**3. Server CHÍNH:** VPS `/root/tts-bot` (pm2: `BotDoMin` + `palworld-dashboard` —
sửa dashboard NHỚ restart cả nó); server game panel Shockbyte tên "1. Cô 4 vui vẻ"
(08/09 đổi từ "1. test mod"; SFTP uuid `11d72659-…`) — **path SFTP = tên hiển thị**, đổi
tên server trên Shockbyte là phải sửa `SFTP_MOD_PATH` trong `.env` prod + restart
dashboard, không thì mọi give/count báo "Dashboard server error"; web chơi
`103.72.98.37:3002`. Deploy = commit → push →
user pull + pm2 restart; mod = đè `GiveGoldCommand/Scripts/main.lua` qua SFTP + restart
server game. Pal giao xong DÙNG ĐƯỢC SAU RESTART server game (giới hạn game engine).
Đường "dùng ngay không restart" đã đào TỚI ĐÁY 08/09 (mổ pak CreativeMenu, dump chữ ký
hàm, thử gọi thật) — rào cản là UE4SS Lua không dựng được struct param, engine sập.
Chủ server CHỐT giữ restart. Toàn bộ kết quả + code thử + cách dò lại khi game update:
`ue4ss-mod/GHI-CHU-GIVE-PAL-XAI-LIEN.md`. Muốn mở lại chỉ còn đường C++ mod / pak tự build.

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

- **15/09 (chiều)** — 📒 **Đang nợ thì KHÔNG nhận được quà admin** (chủ server: "check giùm nếu có nợ được nhận quà admin
  không, nếu có thì không cho nhận luôn"). Kiểm tra: **có, đang nợ vẫn nhận được** - lỗ hổng do chính đợt tách quà sáng nay.
  🐛 Khi tách quà ra kho riêng, `giftClaim()` là đường đi **mới hoàn toàn** và quên gắn `debtBlock()`. `itemShopBuy` và
  `palChestClaim` đều có chốt nợ, riêng quà thì không - nên người đang nợ vẫn lấy đồ vào game được, đúng thứ luật nợ muốn cấm.
  ✅ Thêm `debtBlock(userId, 'nhận quà admin tặng')` ở **ĐẦU** `giftClaim`, **trước** cả bước kiểm "hôm nay đã nhận chưa" -
  nhờ vậy người đang nợ bấm nhầm **không bị đánh dấu đã nhận**, trả sạch nợ là nhận lại được ngay trong ngày.
  ✅ `giftstoretest.js` lên **46 case** (thêm 4: đang nợ bị chặn đúng câu, không giao món nào, không bị đánh dấu, sạch nợ nhận
  bình thường). Thử thật trên bot test: ghi nợ 5.000 → chặn đúng câu; xoá nợ → quà vẫn còn nguyên chưa bị đánh dấu.
- **15/09 (chiều)** — 🩹 **Chữa luôn cột GHI CHÚ mất dấu, không chỉ cột tên** (chủ server gửi ảnh panel prod: "hiện tại ở prod
  đang bị 23 chỗ lỗi này" - ký tự hỏng nằm trong ghi chú: "Giảm tiêu hao thể ���c", "hông biến m���t khi đến").
  🐛 Hàm `itemShopRepairNames()` làm sáng nay **chỉ chữa `name`**, bỏ sót `note` - nên bot có restart bao nhiêu lần ghi chú vẫn hỏng.
  ✅ Nay chữa cả hai trong một vòng: lấy lại theo **id** từ `DEFAULT_ITEM_SHOP` (36 implant + toàn bộ món gốc đều có note đúng),
  không có thì lấy mô tả `d` trong `gameitems.json`. **Không có bản chuẩn thì GIỮ NGUYÊN và ghi log riêng** nhắc admin sửa tay,
  tuyệt đối không bịa. Ghi chú **rỗng** không coi là hỏng nên không tự điền vào. Log tách 2 loại (tên / ghi chú) + tổng kết
  "Đã sửa N chỗ mất dấu (tên + ghi chú)".
  🧪 Thử bằng cách **làm hỏng y kiểu prod** trên bản sao dữ liệu bot test (29 ghi chú implant + món cũ): khởi động lại → bot
  chữa **38 chỗ**, đếm lại còn **0 tên hỏng, 0 ghi chú hỏng** trên 157 món.
  ✅ `repairtest.js` lên **29 case** (thêm 10: chữa ghi chú, không đụng ghi chú sạch, món hỏng cả tên lẫn ghi chú, không có bản
  chuẩn thì giữ nguyên + báo admin, ghi chú rỗng bỏ qua, chạy lại không sửa thừa).
- **15/09 (chiều)** — ⏳ **Nút "Nhận quà" và "Mua" giờ khoá + báo rõ khi đang giao** (chủ server: "bấm là nhận, không có hiệu
  ứng disable nút hoặc đang giao đồ vô nên không biết khi nào xong, dễ bấm spam crash game").
  Nút quà **đã có** khoá (`GIFTBUSY` + `btn.disabled`) nhưng khoá đó **vô dụng** vì 3 lý do: ① không đổi chữ nên nhìn y như chưa
  bấm; ② vòng tự làm mới 30 giây gọi `giftDraw()` vẽ LẠI cả danh sách → nút đang khoá bị thay bằng nút mới còn bấm được;
  ③ bấm lúc đang giao bị chặn **im lặng**, người chơi tưởng đơ nên bấm tiếp.
  ✅ Nay: nút đổi thành **"⏳ Đang giao vào game..."**, **mọi nút quà khác mờ đi + khoá**, `giftDraw()` **không vẽ lại** khi đang
  giao, bấm thêm thì hiện toast "Đang giao quà vào game - chờ chút nhé", giao hỏng thì trả lại chữ cũ để bấm lại.
  🛒 **Sửa luôn nút Mua ở Shop Item** - dính y hệt và chỗ đó còn **trừ tiền thật**: thêm `isBtnLock()`, đổi chữ nút, chặn
  `isRender()` khi `ISBUSY`, và báo toast thay vì thoát im lặng. Truyền `this` vào `isBuy(id, btn)` để biết nút nào vừa bấm.
  🔒 **Phía bot vốn đã an toàn** - đã kiểm lại và thêm test: `giftClaim` gọi `deliverBusy()`/`deliverLock()` **TRƯỚC** lệnh chờ
  `await requireOnline`, nên 2 lần bấm không thể cùng lọt qua; quà còn `giftMark` trước khi giao. Lỗi thuần giao diện.
  ✅ `giftstoretest.js` lên **42 case** (thêm 10 case cho phần khoá nút 2 bên + thứ tự khoá ở server).
- **15/09 (chiều)** — 🔌 **Công tắc bật/tắt từng chức năng của người chơi** (chủ server: "thêm nút tắt mở các chức năng của
  người chơi, hiện tại mình muốn tắt tab chọn pal").
  🎛️ **10 mục bật/tắt được**: 🎲 Tài Xỉu · 💣 Dò Mìn · 🪜 Leo Thang · 🎡 Vòng Quay · 📈 Cổ phiếu · 🚀 Phi Thuyền · 🎁 Quay Pal ·
  🎯 Chọn Pal · 🛒 Shop Item · 💸 Chuyển/Rút. Không đụng 🪪 Cá nhân, 📒 Nợ, 🎁 Quà (quà tắt từng món ở tab riêng).
  Lưu ở `dbCache._featOff`, **chỉ ghi mục ĐANG TẮT** nên mặc định mở hết và mở lại là sạch, không để rác trong DB.
  🔒 **Chặn 2 tầng**: (1) **server** từ chối mọi đường HÀNH ĐỘNG của mục bị tắt - danh sách đường dẫn đặt ngay sau khâu đăng nhập
  trong `webplay.js`, cộng `featGuard()` ở `itemShopBuy`/`palPickBuy`/`palWheelSpin`/`spmBet`/`stockOpen` để Discord cũng dính;
  (2) **web** giấu luôn tab, đang đứng trong mục bị tắt thì báo và đá về Tài Xỉu.
  ⚠️ **Cố ý KHÔNG chặn đường xem trạng thái**: ai đang chơi dở một ván Dò Mìn/Leo Thang/Cổ phiếu lúc admin tắt vẫn **rút tiền ra
  được**, không bị kẹt vốn. Chỉ cấm bắt đầu ván mới.
  🖥️ **Panel** tab 👥 Người chơi (chỉ SUPER): mỗi mục một nút, **xanh = đang mở, đỏ = đang tắt**, bấm là hỏi xác nhận rồi đổi.
  Route `/api/feat/set` nằm trong `VIEWONLY_PATHS` nên cổng admin thường không đổi được. Mỗi lần đổi ghi log admin.
  ✅ Bộ test mới `feattest.js` **22 case** chạy hàm thật + quét nguồn. Thử thật trên bot test: tắt 🎯 Chọn Pal → web nhận
  `featOff:["pick"]`, gọi mua trả **403 "Mục này đang tạm khoá"**, 🎁 Quay Pal không tắt vẫn chạy bình thường, mở lại thì sạch.
- **15/09 (chiều)** — 🎁 **TÁCH quà admin ra danh sách riêng + tab 🎁 Quà tặng cạnh Kho đồ** (chủ server gửi ảnh nút "Nhận quà
  (x999)" kèm dòng "cả server còn mua được 99 Pin Cánh Bay": "mình bị vướng cái này nè nên muốn tách admin ra tab khác để chạy
  logic riêng thôi").
  🐛 **Lỗi gốc**: shop tra món theo **StaticItemId**. Chủ server có 2 dòng cùng `WingGlider_Fuel` - một bán ở nhóm 💍 Phụ kiện
  (giá 100, max 99), một làm quà (giá 0, max 999). Nút quà tra theo id nên **vớ nhầm dòng bán**: câu hạn ngày, giá, số lượng
  đều lấy của dòng kia. Không vá được bằng bộ lọc - phải tách kho.
  🗃️ **Kho quà riêng** `dbCache._giftShop`, mỗi dòng có **`gid` riêng** (không phải item id). `setGiftShop` tự sinh gid không
  trùng: 2 quà cùng item → `WingGlider_Fuel` và `WingGlider_Fuel_2`. Dấu "đã nhận hôm nay" đếm **theo gid**. `giftClaim`
  đi đường giao đồ riêng: kiểm online → đánh dấu TRƯỚC (chặn bấm đúp) → gọi mod → hỏng thì gỡ dấu. **Không** dính tiền, hạn
  ngày, hạn nhóm, nợ. `giftWebList` chỉ trả quà đang bật + cờ `taken` của riêng người xem.
  🧹 **Gỡ nhóm `gift` khỏi shop**: `ITEM_SHOP_CATS` bỏ `gift`, `itemShopBuy` về lại luật ⭐ thuần, web bỏ nhóm 🎁 khỏi
  `ISG` và `isOnceCat`, panel bỏ lựa chọn nhóm 🎁. `giftMigrateFromShop()` chạy lúc boot chuyển dòng `cat:'gift'` của bản sáng
  sang kho quà với **gid = item id** để dấu "đã nhận" cũ vẫn khớp, dòng bán ở shop giữ nguyên.
  🖥️ **Panel**: tab **🎁 Quà tặng** ngay trước 📦 Kho đồ, chỉ cổng SUPER (`/api/gift/save` nằm trong `VIEWONLY_PATHS`). Bảng riêng
  6 cột: Phát · StaticItemId · Tên hiện · Số cái/lần · Ghi chú · Hình (up ảnh dùng chung route shop). Có cờ "chưa lưu" riêng.
  🌐 **Web**: route `/api/gift/state` + `/api/gift/claim`. Thẻ quà dựng bằng **DOM** thay vì nối chuỗi HTML cho khỏi vướng dấu
  nháy lồng nhau. Tab vàng 🎁 Quà đếm theo kho quà riêng, hết quà thì ẩn + tự về Cá nhân, nạp lúc vào + 30 giây/lần.
  ✅ Bộ test mới `giftstoretest.js` **32 case** chạy hàm thật: gid không trùng khi cùng item, lọc id lạ, quà tắt không lộ/không
  nhận được, nhận 1 lần/ngày, qua ngày nhận lại, người khác độc lập, giao hỏng gỡ dấu, chưa online/chưa liên kết thì chặn,
  migrate đúng 1 dòng và giữ nguyên dòng bán. Thử thật trên bot test: lưu 2 quà cùng `WingGlider_Fuel` → ra 2 gid khác nhau,
  web thấy 2 dòng riêng, shop còn 157 món và **0 dòng nhóm gift**.
  ⚠️ Đường **giao đồ vào game chưa thử được ở máy** (cầu dashboard :3010 không chạy) - `requireOnline` chặn đúng và không đánh
  dấu đã nhận. Logic giao đã có test với mod giả; lên server thật cần nhận thử 1 món.
- **15/09** — 🩹 **Tự chữa tên món shop bị mất dấu + ô lọc bảng vật phẩm ở panel** (chủ server: "phông chữ bị ��o T�m Giao",
  "làm thêm phần lọc vật phẩm").
  🔎 **Nguyên nhân chữ lỗi**: không phải phông chữ. `database.json` của **bot test** có **84/156 tên món** bị hỏng kiểu bảng mã
  Windows (dấu tiếng Việt thành `?` hoặc ký tự thay thế `\uFFFD`: "S?ch Hu?n Luy?n", "��o T�m Giao", "Th?t B� Mozzarina").
  Hỏng hàng loạt = cả file bị ghi sai bảng mã một lần từ **ngoài bot** (bot ghi `JSON.stringify` → `writeFileSync` UTF-8 chuẩn,
  `gameitems.json` và 3 file JS đều sạch). Không truy được đúng lệnh nào gây ra; khả năng cao là một lần ghi file bằng công cụ
  Windows dùng ANSI. **Chưa xác nhận server thật có dính không** - chủ server cần liếc một tên món trên web thật.
  🩹 **Tự chữa lúc boot** `itemShopRepairNames()`: tên nào có `\uFFFD` hoặc dấu `?` (tên món tiếng Việt không bao giờ có `?`)
  thì lấy lại tên chuẩn theo **id**: ưu tiên `DEFAULT_ITEM_SHOP` (tên chủ server đã đặt), không có thì `gameitems.json`; không tìm
  được thì để yên, không bịa. Ghi log từng món + tổng. Gọi lại nhiều lần vô hại. Chạy trên bot test: **sửa đủ 84/84, còn 0**.
  Đưa vào boot nên nếu server thật có dính thì pull về restart là tự lành, không cần sửa tay.
  🔍 **Ô lọc bảng vật phẩm panel** (tab 🎮): gõ id/tên/nhóm/ghi chú, chọn nhóm (có 🎁 Admin tặng + tên nhóm mới), tick "chỉ món
  đang tắt", đếm "hiện x/y món". **Chỉ ẩn dòng, không xoá** nên bấm 💾 vẫn lưu đủ mọi dòng kể cả dòng đang ẩn; dòng mới thêm cũng
  theo bộ lọc đang gõ.
  ✅ Bộ test mới `repairtest.js` **19 case**: nhận diện hỏng/sạch, chữa đúng theo id, ưu tiên DEFAULT, không bịa khi thiếu nguồn,
  gọi lại không lưu thừa, và các mảnh panel. Bot test chạy lại không lỗi.
- **15/09** — 🎁 **Nhóm shop "ADMIN TẶNG" (quà mỗi ngày) + tab 🎁 Quà vàng ở Hồ sơ + đổi tên 2 nhóm** (chủ server: "đổi tên
  🧱 Nguyên liệu → Nguyên liệu cho Pal, 🧪 Tiêu hao → Thương nhân, thêm icon; thêm 1 mục admin tặng đồ, nhận vào game xong vật
  phẩm bị xóa, admin nhập số lượng, ẩn hiện như Quan trọng" → sau chốt lại: "nhận xong qua ngày mới có thể nhận lại, admin bật
  tắt được" → rồi: "nó nằm ở phần hồ sơ luôn, ô màu vàng, mua hết ẩn đi như phần nợ, qua ngày mới lại hiện").
  🔤 **Đổi tên**: `material` → **🐾 Nguyên liệu cho Pal**, `consume` → **🏪 Thương nhân** - ở thanh nhóm trên web, ô chọn nhóm và
  bảng hạn nhóm trong panel. Mã nhóm giữ nguyên nên món cũ không phải sửa.
  🎁 **Nhóm `gift`** (thêm vào `ITEM_SHOP_CATS`): admin tạo món như thường, chọn nhóm 🎁, giá để **0** (web hiện "Miễn phí"),
  cột **Max** = **số cái tặng mỗi lần**. Luật trong `itemShopBuy`: người chơi không chọn số lượng - server **tự lấy `it.max`**
  (bỏ qua số client gửi); **mỗi người mỗi ngày nhận 1 lần** theo ngày VN (`giftTakenToday/giftMark/giftTakenIds`, lưu
  `u.shopGift[id] = 'YYYY-MM-DD'`), khác nhóm ⭐ là vĩnh viễn (`shopOnce`). Giao hỏng thì gỡ dấu để nhận lại ngay. Miễn hạn
  ngày chung và hạn nhóm. Bật/tắt từng món bằng ô **Bán** sẵn có (`it.off` → coi như không tồn tại). Web nhận danh sách
  "đã lấy" = ⭐ vĩnh viễn + 🎁 đã nhận hôm nay để khoá nút và ẩn nhóm.
  🟡 **Tab 🎁 Quà** trong nhóm Hồ sơ, ngay sau tab đỏ Nợ, trước Cá nhân. Chỉ hiện khi **còn quà chưa nhận hôm nay** (đếm
  `cat gift && !off && chưa lấy`), ghi kèm số món; nhận hết là **ẩn** và nếu đang đứng ở trang Quà thì tự về Cá nhân, y như tab
  Nợ. Trạng thái shop giờ nạp **ngay khi vào + 30 giây/lần** ở mọi trang (trước chỉ nạp khi mở Shop) nên **qua 00:00 tab tự
  hiện lại** mà không cần F5. Trang Quà dùng lại đúng thẻ món của shop (`isCard`), nút "🎁 Nhận quà (xN)" / "✅ ĐÃ NHẬN HÔM
  NAY - mai nhận lại". CSS viết `#nav button#navGift` cho đúng độ ưu tiên (bài học tab Nợ hôm qua).
  ✅ Bộ test mới `gifttest.js` **37 case** chạy `itemShopBuy` thật với mod giao đồ giả và ngày VN giả: giao đúng Max, giá 0 không trừ
  ví, cùng ngày nhận lần 2 bị chặn, **đổi ngày là nhận lại được**, người khác độc lập, quà có giá tính tiền theo Max, món tắt
  không nhận được, giao hỏng gỡ dấu, nhóm ⭐ vẫn vĩnh viễn, món thường không ảnh hưởng, và toàn bộ mảnh UI/panel/tab.
  Các bộ cũ vẫn xanh: shopcard 33, nợ 60, hũ Bão 91, cầu Dogcoin 38, CSS/scope/page sạch. Bot test chạy lại không lỗi, cả 2
  trang phục vụ đủ nhãn mới + tab Quà.
- **15/09** — 📱 **Nút Bão trên điện thoại: mỗi chú thích đúng 1 hàng** (chủ server gửi ảnh iPhone: "ở mobile đang bị xuống
  dòng, giúp mình viết lại text ... mỗi chú thích nằm trên 1 hàng thôi").
  Chữ viết gọn theo đúng câu chủ server đưa: **"Bão 111, 222, 333 = XỈU · 444, 555, 666 = TÀI"** và **"Đặt đúng cửa Bão hoàn
  30% xu, sai mất hết"**. Mỗi câu bọc trong `<span class="bl">` là một khối riêng có `white-space:nowrap`, cỡ chữ đổi sang
  `clamp(11px, 3.4vw, 13.5px)` để tự co theo bề ngang: iPhone 375px ra ~12.7px, máy 320px xuống 11px vẫn đủ chỗ cho câu dài
  nhất (~44 ký tự), máy to thì giữ 13.5px như cũ. Không dùng cắt bớt bằng dấu ba chấm vì sẽ mất chữ "TÀI" ở cuối câu.
  ✅ `txpottest.js` cập nhật 2 assertion theo chữ mới + 1 assertion kiểm đúng 2 khối `.bl`, nowrap, và clamp.
- **14/09** — 🔴 **SỬA: tab Nợ ra màu vàng chứ không đỏ** (chủ server gửi ảnh: "ô nợ này cho thành màu đỏ") **+ hạ nghỉ
  cầu cứu 10 phút → 1 phút** ("cho 1 phút bấm 1 lần nữa").
  Lại là bẫy độ ưu tiên CSS, lần này ở hướng khác: `#navDebt` chỉ có **id** nên điểm 100, thua `#nav button` có **id + thẻ**
  nên điểm 101 → nền/viền/chữ đỏ bị đè sạch, và `#navDebt.on` (110) thua `#nav button.on` (111) nên lúc chọn ra viền vàng.
  Viết lại thành `#nav button#navDebt` (201) và `#nav button#navDebt.on` (211) là thắng. Nhân tiện tô đậm hơn cho rõ và
  dọn luật thừa `#debtBarNote` còn sót từ lúc bỏ thanh trả nợ.
  🔍 **`hiddencheck.js` thêm luật thứ 3**: đọc markup lấy mọi id nút nằm trong `#nav`/`#navGrp`, rồi bắt mọi luật CSS tô
  màu riêng cho nút đó mà **không** viết kèm `#nav button` - tức là chắc chắn sẽ bị đè. Thử ngược trên bản đã push: bắt đúng
  2 lỗi (`#navDebt`, `#navDebt.on`); bản sửa: sạch. Bộ này giờ soi 3 loại bẫy CSS: ẩn không được, canh giữa rớt dòng,
  và tô màu nút nav bị đè.
  ⏱️ `DEBT_SOS_CD_MS` 10 phút → **1 phút**, câu báo đổi từ đếm phút sang **đếm giây** cho khớp ("chờ 60 giây nữa").
  Đã thử thật: bấm lần đầu đăng được, bấm lại ngay bị chặn đúng câu.
- **14/09** — 📒 **Tab NỢ đỏ riêng trong nhóm Hồ sơ + nút 🆘 CẦU CỨU ANH EM** (chủ server: "thêm 1 ô Nợ màu đỏ nếu người chơi
  có nợ ở phần hồ sơ phía trước cá nhân, khi có nợ mới hiện ra bấm vào để trả nợ, nếu không nợ thì không hiện", "khi bấm vào có
  nút cầu cứu anh em kênh chat sẽ hiện thông báo số dư để có thể người khác trả nợ giùm, đây là id 1538752789499347037").
  🔴 **Tab 📒 Nợ** tô đỏ, đứng **trước** 🪪 Cá nhân, mặc định ẩn - chỉ hiện khi đang nợ, trả sạch là **tự ẩn** và nếu đang đứng
  ở trang Nợ thì tự đá về Cá nhân. Thẻ nợ được **dời hẳn** từ trang Cá nhân sang trang riêng `#pageDebt`.
  🧹 **Bỏ thanh trả nợ xổ dưới topbar** (làm hôm nay, giờ thừa). Ô 📒 ĐANG NỢ cạnh số dư vẫn giữ làm đèn báo, nhưng bấm vào là
  **nhảy thẳng sang tab Nợ** và điền sẵn số trả hết, thay vì xổ thanh tại chỗ.
  🆘 **Nút CẦU CỨU ANH EM** trong trang Nợ: gọi `POST /api/debt/sos` → bot đăng ra kênh `1538752789499347037` một thẻ đỏ ghi
  số dư ví, nợ vay, nợ admin, tổng nợ và lãi ngày, kèm nút **🤝 Trả nợ giùm người này** để ai cũng bấm trả hộ ngay tại đó.
  Có **nghỉ 10 phút** giữa 2 lần réo (`u.sosAt`) để khỏi spam kênh; sạch nợ thì chặn luôn.
  📣 **Thông báo LÃI ĐẺ và AI TRẢ NỢ GIÙM nay đăng cả ở kênh chat đó** (chủ server bổ sung), qua helper `vayAnnounce2` -
  đăng bảng 📒 VAY NỢ trước rồi tới kênh chat, nếu hai kênh trùng nhau thì chỉ đăng một lần.
  ✅ `notest.js` lên **60 case**. Thử thật trên bot test: sạch nợ bấm cầu cứu bị chặn đúng câu, ghi nợ 24.000 rồi bấm thì
  đăng được, bấm lần hai ngay lập tức bị chặn "chờ 10 phút", log admin ghi đủ.
- **14/09** — 🤝 **Nút "Trả nợ giùm người này" trên thẻ `/sodu`** (chủ server: "thêm nút trả nợ giùm được không chat,
  người khác bấm vào xong trả cho người nào /sodu á"). Ai chạy `/sodu` mà đang nợ thì thẻ hiện thêm nút xanh; **người khác**
  bấm vào là mở ô nhập số tiền, gửi xong thì **tiền trừ ví NGƯỜI BẤM, nợ trừ sổ NGƯỜI NỢ**.
  🔒 **Chốt an toàn**: id người nợ nằm ngay trong tên nút (`vay_ho_<id>`) nên không nhầm người; người nợ **KHÔNG** được cộng
  Dogcoin rồi trừ lại (làm vậy họ có thể cuỗm tiền giữa chừng) mà trừ THẲNG vào sổ nợ; tự bấm trả giùm chính mình bị chặn và
  chỉ sang nút 💳 Trả nợ vay; ví không đủ thì chặn, không trừ của ai đồng nào; gõ quá số nợ thì chỉ lấy đúng số đang nợ;
  bỏ trống = trả hết; và `debtAccrue` chạy TRƯỚC nên lãi dồn tới hôm nay được tính vào rồi mới trả.
  📣 Có thông báo réo tên cả hai người ở kênh bảng 📒 VAY NỢ, ghi sổ Dogcoin bên người trả ("trả nợ GIÙM ..."), và log admin.
  Người bấm nhận phản hồi riêng tư: đã trả bao nhiêu, người kia còn nợ bao nhiêu, ví mình còn bao nhiêu.
  ✅ `notest.js` lên **49 case** (thêm 14: trả một phần, trả hết, gõ quá số nợ, ví không đủ, tự trả giùm mình, người ta sạch nợ,
  id lung tung, và lãi dồn được cộng trước khi trả).
- **14/09** — 🔤 **Dọn phông chữ + khoá vuông xí ngầu + nút Bão gọn lại** (chủ server: "phông chữ hơi kì, xí ngầu nó bị méo,
  chữ ở ô bão cũng có vấn đề, bỏ dòng chú thích 3 viên giống nhau cho chữ bự lên xíu, phần tính toán ở nút bão sẽ hay hơn khi
  người chơi bấm vào nút đó + gõ số tiền").
  🔤 **Giãn chữ**: `.cbtn` đang `letter-spacing:2px` và `.cbtn.bao` `3px` - kéo chữ tiếng Việt có dấu ra trông rất kì.
  Hạ còn `.5px` và `1px`; dòng `small` bỏ hẳn giãn chữ.
  🎲 **Xí ngầu méo**: cả viên to (`.die`, nằm trong lưới) lẫn viên nhỏ ở bảng soi cầu (`.mdie`, nằm trong hàng flex) đều
  chỉ đặt `width/height` nên chỗ hẹp là bị kéo giãn. Khoá `aspect-ratio:1/1` + `flex:0 0 auto` + `min-width`, và cho
  `#diceRow .die` `justify-self/align-self:center` để ô lưới không kéo viên xúc xắc ra.
  🌪️ **Nút Bão**: bỏ dòng "3 viên giống nhau · ăn x30 tiền cửa + bú hũ" như chủ server yêu cầu, còn đúng 2 dòng luật.
  Chữ to lên: viên HŨ 14 → 16px, dòng luật 12 → 13.5px (giãn dòng 1.55), dòng tính tiền 12.5 → 14px.
  🧮 **Dòng tính tiền chỉ hiện khi ĐÃ BẤM chọn cửa Bão** (trước đây lúc nào cũng hiện). Tách riêng `baoCalcDraw()` và gọi
  ngay khi: bấm chọn cửa (`pick`), gõ số (`oninput` của ô tiền), bấm nút nhanh (`addAmt`), bấm ALL IN - nên số nhảy tức
  thì chứ không phải chờ nhịp 2 giây. Số hũ, bội số, tỉ lệ cửa Bão được nhớ ở `BPOT/BPX/BPR` để tính lại không cần gọi mạng.
  ✅ `txpottest.js` lên **90 case** (thêm 6: xí ngầu khoá vuông, bớt giãn chữ, chữ nút Bão to lên, chỉ tính khi chọn cửa Bão,
  bốn đường nhập liệu đều tính lại ngay).
- **14/09** — 🌪️ **Gom hết thông tin Bão lên NÚT BÃO** (chủ server: "bỏ chú thích ... viết gọn ở nút bão luôn", "chỗ HŨ BÃO
  ĐANG NUÔI hiện vào nút đặt bão luôn"). Bỏ **khung chú thích riêng** `#txStormNote` và **card hũ riêng** `#txPotCard`.
  Nút Bão giờ có đủ ba tầng: dòng đầu **🌪️ BÃO + viên "HŨ 54.331 🪙"**; dòng nhỏ ghi luật gọn - 3 viên giống nhau, ăn x30 tiền
  cửa + bú hũ, **Bão 1-1-1/2-2-2/3-3-3 = XỈU · 4-4-4/5-5-5/6-6-6 = TÀI**, đặt ĐÚNG bên được hoàn 30% tiền cược, đặt sai mất hết;
  dòng cuối **nhẩm tiền theo số đang gõ**: "Đặt 20.000 → ra Bão ăn 600.000 + bú hũ 54.331 = 654.331". Chưa gõ số thì nhắc
  "Gõ số tiền để xem ra Bão ăn bao nhiêu".
  Tỉ lệ cửa Bão nay gửi kèm trong state (`txBaoRate`) để nút tự tính đúng, admin đổi `TX_BAO_RATE` là web đổi theo, không
  còn số 30 cứng trong mã trang.
  ✅ `txpottest.js` lên **84 case**: thêm **6 case phủ đủ 6 mặt bão** (1-1-1 · 2-2-2 · 3-3-3 về phía XỈU, 4-4-4 · 5-5-5 · 6-6-6
  về phía TÀI, mỗi ván kiểm cả bên được hoàn lẫn bên mất trắng) đúng như chủ server chốt lại, cộng các case kiểm nút Bão
  chứa đủ số hũ, dòng nhẩm tiền và câu luật.
- **14/09** — 📱 **Sửa vỡ dòng trên điện thoại** (chủ server gửi ảnh chụp màn hình iPhone: "UI trên mobile nó bị đẩy xuống dòng rồi").
  ① **Huy hiệu "Tổng 10 - XỈU · CHẴN" rớt xuống 2 dòng**: `#sumBadge` canh giữa bằng `left:50%` + `translateX(-50%)` nhưng
  **không đặt `right`**, nên bề ngang khả dụng chỉ tính từ mốc 50% tới mép phải, tức NỬA sân khấu → chữ dài tự xuống dòng và
  đè lên xí ngầu. Thêm `white-space:nowrap` + `max-width:96%` + cắt bớt cỡ chữ dưới 420px.
  ② **Thanh trả nợ**: ô nhập bị bóp, chữ gợi ý cụt. Cho `flex-wrap:wrap`, ô nhập `flex:1 1 140px`, nút `flex:0 0 auto`,
  rút gọn chữ gợi ý còn "Trống = trả hết".
  ③ **Thanh đầu trang** (giờ có thêm ô NỢ): `flex-wrap:wrap` + `gap:8px`, ô NỢ `flex:0 0 auto;white-space:nowrap` để màn
  hẹp thì xuống dòng gọn chứ không bóp méo số dư.
  🔍 **`hiddencheck.js` thêm luật thứ 2**: bắt mọi khối canh giữa kiểu `position:absolute` + `left:50%` + `translateX(-50%)`
  mà thiếu cả `right`, `width` lẫn `white-space:nowrap` - đúng cái bẫy làm rớt dòng. Thử ngược trên bản đã push: bắt đủ
  3 lỗi (`#debtBar`, `#paper`, `#sumBadge`); bản sửa: sạch.
- **14/09** — 🩹 **SỬA: dòng trả nợ hiện cả khi KHÔNG nợ** (chủ server: "khi nào có nợ mới hiện dòng trả nợ chat ơi").
  Lỗi CSS kinh điển: `#debtBar{display:flex}` chọn theo **id** nên độ ưu tiên 100, đè `.hidden{display:none}` chọn theo
  **class** chỉ có 10 → thêm class `hidden` vào là vô tác dụng, dòng trả nợ luôn nằm đó. Thêm `#debtBar.hidden{display:none}`
  (id + class = 110) là thắng lại. Ô 📒 ĐANG NỢ không dính lỗi này vì luật id của nó không đặt `display`.
  🔍 **Bộ test mới `hiddencheck.js`** quét đúng loại lỗi này trên toàn trang: render trang thật, lấy CSS, tìm mọi id vừa có
  luật đặt `display` vừa được ẩn/hiện bằng class `hidden`, và bắt buộc phải có luật `#id.hidden`. Bỏ qua tên biến dùng lại
  khắp nơi (`box`, `el`, `b`...) kẻo báo nhầm. Thử ngược trên bản đã push: bắt đúng 2 lỗi; bản sửa: sạch.
  🎲 **Nhờ bộ test này lòi ra lỗi cũ ở CHÉN NẶN Tài Xỉu**: `#paper` cũng đặt `display:flex` theo id nên **4 chỗ** gọi
  `paper.classList.add("hidden")` đều không ẩn được chén - nặn xong, đang mở bát, bàn tắt, và lúc vẽ lại trạng thái.
  Chén vẫn nằm đó (chỉ bị kéo lệch đi) thay vì biến mất. Đã thêm `#paper.hidden{display:none}`.
  Bài học ghi lại: trong `webplay.js`, hễ đặt `display` trong luật `#id{...}` mà chỗ khác ẩn bằng class `hidden` thì
  **luôn phải viết kèm** `#id.hidden{display:none}` - các chỗ làm đúng từ trước là `#gmodal`, `#tmodal`, `#pwRaidBox`.
- **14/09** — 💳 **Ô NỢ ngay cạnh số dư, bấm là trả nợ tại chỗ** (chủ server: "thêm mục nợ kế bên Số dư dogcoin, kế bên có
  phần nợ bấm vào trả được luôn"). Trước đây muốn trả nợ phải vào tab 👤 Hồ sơ kéo tìm thẻ 📒 Nợ Dogcoin.
  Nay thanh đầu trang có ô **📒 ĐANG NỢ + số tiền** nằm sát số dư, viền đỏ; bấm vào là **xổ ngay một ô trả nợ** ngay dưới thanh,
  đã **điền sẵn đúng số nợ** để bấm một phát trả hết, hoặc sửa số để trả một phần. Trả sạch là ô nợ và ô trả **tự biến mất**.
  Ô nợ **chỉ hiện khi đang nợ** và tự làm mới 15 giây một lần ở MỌI trang, không riêng trang Hồ sơ như `debtSync` cũ.
  Thẻ nợ trong Hồ sơ giữ nguyên; hai chỗ trả nợ dùng chung một hàm `debtDo(inpId, btnId)` nên không sợ lệch luật.
  ✅ `notest.js` lên **35 case**. Đã thử thật trên bot test: ghi nợ 7.777 → trả một phần 2.777 còn 5.000 → để trống trả hết
  còn 0 → ô nợ tự ẩn. Trang render ra có đủ `debtChip` và `debtBar`.
- **14/09** — 📒 **BỎ HẲN NHÃN ⚠️ NỢ XẤU - còn nợ một đồng là khoá 2 việc** (chủ server: "bỏ nợ xấu đi, giờ nếu ai nợ sẽ ko
  mua đồ ở shop item nữa, không được lấy pal vào game, miễn sao tài khoản có nợ sẽ bị vậy và ko có nợ xấu, lãi vẫn tính như cũ").
  ✅ **Luật mới, đúng 2 cổng chặn** qua hàm `debtBlock(userId, việc)`: còn nợ (vay HOẶC admin ghi) thì ① không mua được đồ ở
  🛒 SHOP ITEM (`itemShopBuy`) và ② không chuyển được PAL vào game (`palChestClaim`). Trả sạch nợ là mở khoá ngay, không chờ ai duyệt.
  Vẫn bán/tặng pal trong rương bình thường - chỉ chặn đường đưa pal vào game.
  🗑️ **Đã xoá sạch bộ máy nợ xấu**: hàm `adminDebtBad` + route `/api/debt/bad` + nút "⚠️ Nợ xấu" ở panel + hàm client
  `pDebtBad`; hàm xiết ví `debtBadSweep` và hằng `DEBT_BAD_FLOOR` (ví bị vét về 1.000); trường `bad` trong `debtStatus`/`debtList`;
  "BẢNG PHONG THẦN NỢ XẤU" trên bảng Discord. Cờ `bad` cũ còn sót trong database bị **xoá dần** mỗi lần người đó trả sạch nợ
  (`delete d.bad`), và trong lúc còn sót thì cũng vô nghĩa vì không còn chỗ nào đọc nó.
  ⚠️ **Hệ quả cần biết - đã báo chủ server**: mọi ràng buộc CŨ gắn với nhãn nợ xấu đều biến mất theo. Người đang nợ giờ
  **vẫn** chuyển tiền cho người khác được, vẫn chuyển Dogcoin vào game, vẫn chơi Dò Mìn/Leo Thang/Phi Thuyền, vẫn quay/mua pal,
  vẫn vào lệnh cổ phiếu, vẫn vay thêm trong hạn mức. Tiền điểm danh/nghiện/chuỗi **không còn bị cắt** để trừ nợ
  (`LOAN_INCOME_CUT` 0.5 → 0, `debtCutIncome` giữ lại nhưng luôn trả đủ). Nghĩa là sức ép trả nợ giờ chỉ còn **lãi kép mỗi ngày**
  cộng 2 cổng chặn trên, không còn cơ chế cưỡng chế thu tiền nào.
  💰 **Lãi giữ nguyên 100%**: `debtAccrue` không đụng tới - qua mỗi mốc 00:00 giờ VN cả cục nợ (kể cả nợ admin ghi) nhân
  (1 + feePct%), vẫn réo tên ở kênh bảng vay.
  🖥️ Lời lẽ đã sửa đồng bộ ở: bảng 📒 VAY NỢ trong Discord, nút "Nợ của tôi", thông báo trả nợ, DM, thẻ nợ trên web, 2 dòng
  ghi chú trong panel. Cột 📒 Nợ ở panel bỏ dấu ⚠️.
  ✅ Bộ test mới `notest.js` **29 case** chạy hàm thật trong vm: chặn từ 1 đồng nợ, nợ admin ghi cũng chặn, trả sạch mở khoá,
  `debtStatus` hết trường `bad`, cờ `bad` cũ vô hiệu, thu nhập không bị cắt, lãi 1 ngày + lãi kép 3 ngày vẫn đúng, và quét
  nguồn để chắc không còn chỗ nào đọc `.bad`. Đã thử thật trên bot test: ghi nợ 5.000 → mua shop bị chặn đúng câu, chuyển tiền
  vẫn chạy, xoá nợ xong hết bị chặn.
- **14/09** — 🀫 **NẶN XONG LÀ TIỀN VỀ VÍ NGAY, trả riêng từng người** (chủ server: "nếu người chơi tự mở thì cộng trừ vẫn
  như cũ", "nếu nặn xong rồi thì trả thưởng tại chỗ luôn, show +/- Dogcoin, trả riêng người đó thôi, người khác chưa nặn
  hoặc không nặn thì chưa ảnh hưởng"). Trước đây lắc lúc khóa sổ rồi CHỜ HẾT 15 giây mới trả cho tất cả cùng lúc.
  🔑 **Cách làm - tính MỘT LẦN, trả RẢI RÁC**: tách `settleTXPayout` cũ làm ba:
  `txPlanPayout(gameId, bets, d1,d2,d3)` chạy ngay sau `rollTXDice()`, tính trọn bảng tiền của cả ván và **nuôi + rút hũ Bão
  đúng một lần tại đây**, nhưng CHƯA cộng ví ai; `txPayUser(gameId, userId)` trả cho đúng một người, gọi mấy lần cũng chỉ
  trả một lần nhờ cờ `plan.paid`; `settleTXPayout` giữ nguyên tên/tham số/giá trị trả về, tới giờ mở bát thì quét nốt ai
  chưa nhận rồi mới ghi lịch sử + log + bảng Discord. Giữ nguyên chữ ký nên mọi chỗ gọi cũ và bộ test không phải sửa.
  ⚠️ **Vì sao phải tính trước chứ không tính lúc nặn**: phần bú hũ khi nhiều người cùng trúng Bão được chia theo tỉ lệ tiền
  cược. Nếu tính lúc nặn thì người nặn sớm sẽ ẵm sạch hũ, người nặn muộn mất phần. Tính một lần từ lúc lắc thì phần của ai
  người nấy nhận, nặn sớm hay muộn không đổi một đồng. Đã có case test riêng cho đúng chuyện này.
  🛟 **Cứu ván dở khi bot tắt giữa chừng**: kế hoạch được cất ở `dbCache._txPlan`, lúc bot bật lại sẽ trả nốt cho ai chưa kịp
  nhận rồi mới dọn, ghi log "Bot bật lại giữa ván #N". Trước đây bot chết giữa 15 giây nặn là cả ván mất trắng; nay nếu không
  cứu thì còn tệ hơn vì người nặn sớm đã nhận còn người nặn muộn thì không.
  🖥️ **Web**: route mới `POST /api/tx/reveal`, `revealDone()` gọi ngay khi chén rời khỏi xí ngầu, nhận về `net` + số dư mới,
  cập nhật ô số dư và bật popup +/- tại chỗ. Đặt `lastSettled = gameId` để lát bảng lịch sử về không bật popup lần hai.
  Câu chờ đổi từ "chờ mở bát trả tiền" thành "tiền đã về ví, chờ ván sau". Ai không nặn thì tới giờ tự mở, y như cũ.
  ✅ `txpottest.js` lên **76 case** (thêm 18 case: trả riêng từng người, chống trả trùng, người không đặt, nặn sớm không ẵm
  phần hũ của người nặn muộn, cứu ván dở sau restart). Thêm `reveal-e2e.js` đánh thật một ván rồi đòi tiền ngay lúc còn
  đang nặn để chắc chắn ví cộng trước giờ mở bát và không bị cộng lần hai.
- **14/09** — 📉 **Hạ nuôi hũ Bão 2% → 1% + admin ĐẶT THẲNG số tiền trong hũ** (chủ server hỏi "2% nuôi hủ bão vậy hợp lý
  ko", xem mô phỏng xong chốt "hạ hủ xuống 1% tiền cược cho toàn bộ cược", "có chỗ cho admin config tiền trong hủ luôn nha").
  📊 **Mô phỏng 300.000 ván** bằng chính `settleTXPayout` (`scratchpad/potsim.js`), mỗi ván cả bàn cược 100.000, đo biên nhà cái:

  | cửa Bão chiếm | không hũ | nuôi 1% | nuôi 2% | nuôi 3% | nuôi 10% cược Bão |
  |---|---|---|---|---|---|
  | 5% | 2,98% | 1,90% | 1,74% | 1,49% | 2,60% |
  | 10% | 3,78% | 2,87% | 1,69% | 1,21% | 2,72% |
  | 20% | 5,35% | 4,31% | 3,27% | 2,57% | 3,03% |
  | 30% | 6,59% | 5,45% | 4,90% | 3,74% | 3,47% |

  Kết luận đã báo chủ server: nuôi 2% chỉ hoà vốn khi cửa Bão đông **gấp ba** (10% → 30% tổng cược), tức đặt cược quá lớn vào
  hành vi người chơi; 1% giữ thêm hơn một điểm biên mà hũ vẫn lên tới trần, chỉ chậm hơn. Hũ muốn to ngay thì admin mồi tay.
  Cũng đã nêu phương án "nuôi 10% tiền cược cửa Bão" - an toàn hơn vì không bao giờ tụt dưới biên gốc, nhưng chủ server chọn 1%.
  `TX_POT_RATE_DEF` 0.02 → **0.01**; admin vẫn chỉnh được ở panel tab 💣 nên không cần sửa code lần sau.
  🎯 **`adminPotSet(key, amount)`** mới + route `/api/pot/set` + nút **🎯 Đặt đúng số** cạnh nút **➕ Cộng thêm** trong card hũ.
  Trước chỉ cộng/trừ chênh lệch nên muốn hũ đúng 250.000 phải tự tính; giờ gõ số rồi bấm là hũ thành đúng số đó. Chặn số âm,
  cho vượt trần nuôi để mồi hũ to, ghi log riêng "Panel ĐẶT THẲNG hũ X -> Y". Áp dụng cho mọi hũ chứ không riêng hũ Bão.
  ✅ `txpottest.js` lên **58 case** (thêm 9 case cho nuôi 1% + cộng/trừ/đặt thẳng/chặn âm/chặn hũ lạ). Đã gọi thật 4 lần
  `/api/pot/set` và `/api/pot/add` trên bot test: đặt 250.000 → rút 50.000 → chặn số âm → đặt lại 100.000, log khớp từng dòng.
- **14/09** — 🎲 **Tài Xỉu: ra Bão không còn thua sạch + đổi tên cửa + nút bấm nhanh mới** (chủ server: "đối với bão đặt đúng
  sẽ thua 70% số xu đặt", "đặt 10.000 tài ra bão 4 4 4 thì sẽ thua 7.000 còn ra 111 222 333 thì thua hết").
  **Luật hoàn 30%**: ra Bão thì cửa thường ĐÚNG BÊN với bão được hoàn `TX_STORM_REFUND` = 30% tiền cược (chỉ thua 70%),
  cửa ngược bên vẫn thua hết. Bão 4-4-4 (12) · 5-5-5 (15) · 6-6-6 (18) là phía TÀI; 1-1-1 (3) · 2-2-2 (6) · 3-3-3 (9) là phía XỈU.
  ⚠️ **Đã áp dụng cho CẢ CHẴN/LẺ** theo đúng nghĩa "đặt đúng" (bão 6/12/18 là CHẴN, bão 3/9/15 là LẺ) - chủ server chỉ nêu
  ví dụ tài/xỉu, nếu muốn bỏ chẵn/lẻ ra thì sửa đúng một điều kiện trong `settleTXPayout`.
  📐 Kinh tế: mỗi cửa thường có 3/216 ván là "bão đúng bên", hoàn 30% → biên nhà cái cửa tài/xỉu/chẵn/lẻ giảm **2,78% → 2,36%**.
  Tiền hoàn đi vào `refAgg` riêng: log Discord ghi dòng "🌪️ Bão hoàn 30% tiền cược" tách khỏi dòng "thắng" cho khỏi hiểu nhầm,
  nhưng vẫn gộp vào `winners` để web tính lãi/lỗ ván đúng (làm tròn XUỐNG, 999 → 299).
  🔤 **Đổi tên cửa BIG/SMALL → TÀI/XỈU** ở `TX_CHOICES` (Discord + web + lịch sử). Lịch sử cũ lưu "BIG" vẫn tô màu đúng vì
  chỗ đọc nhận cả hai tên. Toast lúc đặt cược ghi tên tiếng Việt thay vì "TAI"/"XIU".
  🎨 **Tô màu CHẴN/LẺ**: trước chỉ TÀI (đỏ) / XỈU (xanh) có màu, chẵn lẻ trắng trơn. Nay CHẴN xanh lá `#4fd6a0`, LẺ tím
  `#c79bff` ở cả bảng 20 ván lẫn huy hiệu "Tổng N" dưới khay xí ngầu.
  ⚡ **Nút bấm nhanh 1.000 / 5.000 / 10.000 / 20.000** (trước là +10/+50/+100/+500). Bấm mà vượt số dư thì tự hạ về đúng số dư
  kèm nhắc "Chỉ còn X Dogcoin - đặt hết luôn", y như nút ALL IN.
  ✅ `txpottest.js` lên **49 case** (thêm 10 case luật hoàn + tên cửa + kiểm nguồn UI). Thêm `txpot-e2e.js` đánh thật 1 ván
  3 cửa (Bão + Tài + Lẻ) rồi ép 4-4-4 qua panel SUPER để soi tiền về ví.
- **14/09** — 🌪️ **HŨ BÃO BẢN 2: để riêng, ăn theo tiền cược, trần là số hũ đang có** (chủ server: "hủ bão để riêng ra đi cho
  hấp dẫn", "nếu thắng thì sẽ thắng dựa trên số tiền cược", "hủ đang nuôi ở 20.000 thì đặt 100 ăn được 1.000 + x30, đặt 3.000
  thì cũng chỉ ăn 20.000 thôi + x30"). Luật mới: **trúng cửa Bão = x30 tiền cửa + bú hũ min(cược × bội số, hũ đang có)**.
  Bỏ hẳn đường "nhà cái bù" của bản 1 - giờ chi phí hũ đúng bằng số đã nuôi vào, nhà cái không bao giờ lỗ quá quỹ.
  Nhiều người cùng trúng mà hũ không đủ thì **chia theo tỉ lệ tiền cược** (gom trước rồi mới chia, không phải ai trước ăn trước);
  tiền lẻ dồn cho người cuối nên hũ cạn đúng 0, không đẻ thêm đồng nào.
  **% nuôi hạ 5% → 2%** và tách khỏi `LUCKY_POT_RATE` dùng chung: `txPotCfg()` đọc `dbCache._txPot = {rate, x}`.
  📐 **Vì sao 2%**: biên nhà cái Tài Xỉu là 2,78% ở cửa tài/xỉu/chẵn/lẻ (thắng 105/216, trả x2) và 16,7% ở cửa Bão (6/216, trả x30);
  trộn lại khoảng **4% tổng cược**. Nuôi bao nhiêu % là nhà cái cho đi bấy nhiêu %, nên **5% của bản 1 là ăn lỗ**, 2% giữ lại
  chừng nửa lãi, 3% là mức mạo hiểm hơn cho hũ mau to. Cửa Bão càng đông thì biên càng cao, lúc đó nâng % được.
  🎛️ **Panel (tab 💣, SUPER)**: hũ Bão hiện trong card hũ nên **admin nạp/rút tay** như hũ khác (`adminPotAdd` vốn đã nhận key
  `tx`, chỉ thiếu chỗ hiện - nay `getPot` trả thêm `tx`), kèm 2 ô mới **% nuôi/ván** và **bội số bú hũ** (route `/api/txpot/cfg`).
  🖥️ **Web**: hũ Bão tách thành **card riêng** ngay trên bàn cược, số vàng cỡ lớn có quầng sáng, thêm dòng nhẩm trước theo số
  đang gõ: "Đặt 3.000 → trúng Bão ăn 90.000 (x30) + bú hũ 20.000 = 110.000 (hũ chỉ còn 20.000 nên bú tới đó thôi)".
  Nút BÃO bỏ chữ "1 ăn 40" cố định. Bội số đọc động từ config nên admin sửa là web đổi theo.
  ✅ `txpottest.js` viết lại **32 case** chạy `settleTXPayout` thật, gồm đúng 2 ví dụ chủ server đưa, hũ rỗng, chia tỉ lệ,
  chia tiền lẻ, đổi % nuôi, đổi bội số. Thêm `txpot-e2e.js` đánh thật 1 ván cửa Bão qua HTTP trên bot test.
- **14/09** — 🩹 **SỬA GẤP: trang Tài Xỉu đứng hình sau bản hũ Bão** (chủ server: "sao tài xỉu local nó chết rồi"). Bot vẫn chạy ván
  bình thường (log ra tới ván #43) nhưng web đứng ở ván #40, đồng hồ "--": hàm `txPotDraw` bị đợt patch chèn **lọt vào giữa thân
  `renderHist20`** nên chỗ gọi ở vòng cập nhật state không thấy nó → `ReferenceError` → hàm vẽ chết ngay sau dòng "Ván #...",
  mọi thứ phía dưới (đồng hồ, xí ngầu, ô cược) không được vẽ nữa. Đã đưa `txPotDraw` ra **top-level** (ngay sau `$` và `vnd`).
  Thêm bộ test mới `scopecheck.js`: render trang thật, xoá chuỗi/comment rồi đếm ngoặc để tìm mọi hàm khai báo lồng bên trong
  hàm khác **mà vẫn bị gọi từ ngoài** - đúng loại lỗi này. Đã thử ngược trên bản lỗi: test bắt đúng 1 lỗi; bản sửa: sạch.
  Bài học cho lần sau: patch chèn hàm mới phải neo vào **mốc top-level**, không neo vào dòng nằm giữa thân hàm khác.
- **14/09** — 🌪️ **HŨ BÃO cho Tài Xỉu: trúng Bão ăn x40** (chủ server: "đặt bão 1000 thì hũ ăn 10.000 + x30 của bão = 40.000",
  "cứ thắng là x40 để người chơi tham gia bão nhiều"). Hũ `tx` thêm vào `POT_KEYS` (mồi 10.000, trần nuôi 500.000) nên hiện
  luôn ở card hũ của panel, admin cộng/trừ tay được. Nuôi 5% TỔNG cược mỗi ván, nuôi TRƯỚC khi trả để tiền ván đó cũng bú được.
  Settle: cửa Bão trúng bão nhận `x30 + bet×10`; `potTake` rút hũ (không ẵm sạch, không mồi lại), **hũ thiếu thì nhà cái bù**
  nên người chơi luôn đủ x40; log admin ghi tách "hũ X + nhà cái bù Y" để thấy chi phí thật. Web: khung 🌪️ HŨ BÃO dưới nút Bão,
  nút ghi "1 ăn 40 (x30 cửa + x10 bú hũ)", state gửi `txPot`/`txPotX`. Bộ test mới `txpottest.js` 21 case chạy `settleTXPayout`
  thật (nuôi, bú, hũ cạn, nhiều người trúng, cửa thường, trần nuôi).
  ⚠️ **KINH TẾ - chủ server đã được báo và chốt**: bão ra 6/216 = 2,78%/ván. Kỳ vọng cửa Bão = 2,78% × 40 = **1,11** → người
  chơi LỜI ~11% dài hạn ở cửa này (trước khi có hũ là ×30 → 0,83, nhà cái giữ 17%). Van an toàn còn lại là **trần cược/người/ván**
  ở panel; nếu thấy chảy máu thì hạ trần hoặc hạ `TX_POT_X`.
- **14/09** — 🔤 **Đổi tên "Big Small" → "Tài Xỉu" ở mọi chỗ người chơi đọc** + **toast tự nặn chỉ hiện ở trang Tài Xỉu**
  (trước đang ở tab khác cũng bị nhảy toast). Web: nhãn tab, câu đăng nhập, câu lấy PIN; Discord: tiêu đề bảng "🎲 TÀI XỈU LIVE",
  nhãn nút web, hướng dẫn; panel: nhãn tab. `sweepBoards` nhận MẢNG tên (`['TÀI XỈU LIVE','BIG SMALL LIVE']`) để bảng mồ côi
  đăng trước 14/09 vẫn quét được. Log kỹ thuật `[KẾT QUẢ BIG SMALL]` giữ nguyên cho log cũ/mới đọc chung. Trang web thêm biến
  `CURPAGE` (set trong `go()`) để biết đang xem trang nào.
- **14/09** — 🎲 **Xí ngầu ĐỎ · nút TRẮNG · nền ĐEN + viên to hơn** (chủ sòng chốt). Hột 48 → **56px** (nền đỏ chuyển sắc
  + viền sáng mảnh), nút 10 → **12px** trắng có bóng, sân khấu đổi từ nỉ xanh sang đen, cao 196 → 206px. Vì viên to lên nên
  **chén phải nới 168 → 176px** cho vẫn phủ kín: cụm xí ngầu 118px, góc xa tâm 83,4px ≤ bán kính 88px (chentest tính lại mỗi
  lần chạy, hở là báo đỏ vì sẽ lộ kết quả trước khi nặn).
- **14/09** — 🗂️ **Thay ảnh trong `assets/` xong người chơi vẫn thấy ảnh CŨ - sửa tận gốc bằng ETag** (chủ server: "sao mình
  vẫn thấy hình này" sau khi chén đã cắt tròn - server trả đúng ảnh mới, lỗi nằm ở trình duyệt). `assets.js` trước gửi
  `Cache-Control: public, max-age=604800` nên ảnh nằm lì trong máy người chơi **7 ngày**: đổi icon item, đổi chén, đổi ảnh
  gì cũng phải chờ hết hạn hoặc bắt từng người Ctrl+F5. Nay mỗi file có **ETag = sha1 nội dung** (tính lúc quét thư mục và
  cả lúc admin up hình từ panel) + `Cache-Control: no-cache`: trình duyệt hỏi lại mỗi lần, chưa đổi thì nhận **304** vài chục
  byte, đổi file là thấy ngay. Kiểm: GET lần đầu 200 có ETag, gửi lại kèm `If-None-Match` ra 304. ⚠️ Ghi chú: `ASSETS.serve`
  chỉ nhận GET nên `curl -I` (HEAD) luôn ra 404, đừng tưởng hỏng.
- **14/09** — ✂️ **Cắt TRÒN ảnh chén + bỏ chú thích dán dưới chén** (chủ server: ảnh gửi lên chưa cắt, và không cần chữ ở dưới).
  Ảnh gốc là ảnh chụp màn hình 157×163 nền đục. Không có thư viện ảnh trong repo nên viết `scratchpad/png.js` đọc/ghi PNG RGBA
  8-bit thuần Node (inflate → bỏ filter → pixel → deflate + CRC). Dò đĩa vàng bằng đoạn màu dài nhất theo hàng/cột: tâm
  (78.5, 79.5), đường kính 132 → cắt vuông 132 quanh tâm, bo alpha tròn (mép vờn 1,2px cho hết răng cưa), phóng 2× song tuyến
  thành **264×264** cho nét khi web hiện 168px. Bản gốc vẫn nằm trong git ở commit `e32406d` nếu cần dựng lại. Viên thuốc chữ
  dưới chén bỏ hẳn (kể cả CSS + 2 biến JS), hướng dẫn dồn xuống dòng dưới sân khấu. `chentest.js` lên 20 case, thêm phần đọc
  thẳng file PNG: ảnh phải vuông, 4 góc trong suốt, tâm đục, 8 điểm quanh vành còn đục.
- **14/09** — 🀫 **Big Small: xí ngầu xếp TAM GIÁC + thay tờ giấy bằng CHÉN THẬT để nặn** (chủ server gửi ảnh mẫu sòng +
  `assets/chennantaixiu.png`). `#diceRow` đổi từ flex 1 hàng sang grid 2 cột, viên đầu chiếm 2 cột canh giữa (1 trên · 2 dưới),
  xí ngầu 56 → 48px; sân khấu cao 150 → 196px cho vừa chén. `#paper` (giữ id để không phải sửa luật nặn) nay là ảnh chén tròn
  168px giữa sân khấu: khoá thì xám mờ, tới giờ thì sáng + nhấp nhô nhẹ + con trỏ nắm, chữ nhắc gom vào viên thuốc dưới chén
  (`pointer-events:none` để không chắn kéo). Luật GIỮ NGUYÊN: chỉ kéo trong pha nặn, phải lộ đủ 3 viên mới ra điểm, 3 giây cuối
  tự tuột chén giùm. **Số đo là ràng buộc chống gian lận**: cụm xí ngầu 102px có góc xa tâm 72,1px phải ≤ bán kính chén 84px,
  hở là lộ kết quả trước khi nặn. Bộ test mới `chentest.js` 14 case đọc trang đã render, tính lại hình học đó mỗi lần chạy.
- **14/09** — 📦 **Kho đồ bỏ giới hạn 999/lần** (chủ server: admin chuyển vào game cho thoải mái): `adminGiveItem` + ô nhập
  panel nới lên **1.000.000**. Giữ MỘT mức chặn rất cao thay vì bỏ hẳn: gõ nhầm hoặc dán số khổng lồ sẽ làm mod ghi StackCount
  rất lâu và kẹt hàng đợi SFTP của cả server (mọi luồng giao pal/item đi chung một khoá). Muốn bỏ hẳn thì sửa đúng 1 dòng.
- **14/09** — 🐶 **Card "Nạp ra web" đổi thành icon Dogcoin + chữ "Chuyển Dogcoin từ game ra web"** (nút: "Chuyển ra web").
  Nút phải chuyển từ `textContent` sang `innerHTML` mới nhúng được thẻ ảnh, nhãn để một biến `DOGNAPLB` dùng lại cho lúc bấm
  xong và lúc admin khoá chiều. Thẻ 🪙 đổi vàng nhắc tên card theo chữ mới. CSS `.tic` (22px tiêu đề) + `.bic` (18px nút).
- **14/09** — 🪙 **ĐỔI VÀNG trong game → Dogcoin web, DÙNG CHUNG giới hạn ngày với 💬 Nạp ra web** (chủ server: thương nhân đã
  tắt nên vàng thành vô dụng; "2 UI khác nhau mà xài chung 1 giới hạn"). Quy ước **100 vàng = 1 Dogcoin TRONG GAME** nên
  10.000 vàng = `dogNapRate` × 100 Dogcoin web (tỉ lệ 1:4 → 400) - nhờ quy về cùng đơn vị với luồng nạp nên KHÔNG cần ô cấu
  hình mới, hai đường ăn chung một bộ đếm `user.dogDay.nap`. Server: `webNapGold` (chỉ nhận BỘI SỐ 10.000 vàng, ≤ 500.000
  vàng/lần, kiểm giới hạn ngày trước khi đụng SFTP, câu chặn quy ngược ra vàng), `requireOnline(gameName, itemId)` thêm tham
  số để đếm `Money` thay `DogCoin`, mod TAKE/COUNT vốn đã nhận itemId bất kỳ nên KHÔNG phải sửa Lua. Ví cộng
  `floor(took × rate / 100)` theo số vàng THẬT lấy được, bộ đếm cộng `took / 100`. Web: card riêng 🪙 Đổi Vàng ra Dogcoin
  (dưới 💬 Nạp ra web) với khung tỉ lệ có icon `T_itemicon_Material_Money.webp` → `T_itemicon_Material_DogCoin.webp`, ô nhập
  tự chèn dấu ngăn nghìn (10.000), xem trước "→ Trừ N vàng, ví web +M Dogcoin", dòng vàng "Dùng CHUNG giới hạn với 💬 Nạp ra
  web · hôm nay còn đổi được X vàng". Route `/api/dogbridge/napgold`. Panel: chú thích ô 📅 nói rõ vàng dùng chung hạn.
  Với 8.000/ngày + tỉ lệ 4: tối đa 800.000 vàng/ngày = 32.000 Dogcoin web. Test bridgetest +14 (38/38) + e2e HTTP.
- **14/09** — 🔤 **Chữ "trần" người chơi đọc thấy → "giới hạn"** (chủ server: dễ đọc hơn). 14 chỗ trong webplay/index:
  giới hạn cược Big Small, quá giới hạn khối lượng cổ phiếu, vượt giới hạn /lần ở cầu Dogcoin, nâng cấp pal vượt giới hạn…
  Riêng 2 nhãn hẹp trong bảng trả thưởng Dò Mìn/Leo Thang dùng **"TỐI ĐA"** (6 ký tự) cho khỏi vỡ lưới. Không đụng comment,
  log admin, hay các câu đã đổi thành "kịch khung" hôm 09/09.
- **11/09** — 🔁 **Hạn ngày chiều NẠP đếm theo Dogcoin TRONG GAME** (chủ server: "để 5000 thì game vẫn cho chuyển ra 5000, web nhận
  10000, sau đó không chuyển nữa - đang bị ngược"). Trước: đếm theo số web nhận (hạn 10.000 web = 5.000 game). Nay: `dogBridgeDayCheck`
  chiều nạp dùng `amount` (game), đếm `r.took` (game) - cùng đơn vị với chiều rút nên 1 ô hạn dùng chung cho cả 2 chiều; web nhận
  = took × tỉ lệ. Web dòng hạn nạp ghi "N Dogcoin TRONG GAME/ngày · còn lấy được X trong game (= nhận X×rate web)", xem trước sửa
  theo. Test bridgetest sửa 4 + thêm kịch bản 5.000/×2 (25/25).
- **11/09** — 📅 **Cầu Dogcoin: mỗi chiều 1 dòng hạn riêng + XEM TRƯỚC khi gõ số** (chủ server: "Nạp ra web không có cảnh báo
  vượt"). Rút: dòng "Hạn rút vào game N/ngày · hôm nay còn X"; Nạp: dòng "Hạn nạp ra web N web/ngày · còn X web (= X/rate game)".
  Gõ số là hiện ngay (dogPreview): xanh "→ Lấy A game, ví web +B (tỉ lệ 1 : 2)" hoặc đỏ "⚠️ Vượt hạn ngày… chỉ còn nhận được X web" /
  "⚠️ Vượt trần 500.000/lần". Server vẫn là chốt cuối.
- **11/09** — 📣 **Bán/tặng pal: DM Discord + log kênh trúng pal** (chủ server: thêm DM + log ở kênh 1538789642743193611 - kênh
  đang đăng pal quay trúng). `palTradeNotify(kind, t)`: offer → DM người nhận (kèm link web → 🪪 Cá nhân → 🤝) + đăng kênh;
  accept → DM người bán + kênh; decline → DM người bán + kênh; cancel → DM người nhận + kênh. Kênh = `dbCache._gachaChannelId`
  (cài ở panel, hiện chính là kênh đó), chưa cài thì fallback hằng `PAL_TRADE_LOG_CHANNEL`. Bắn nền, lỗi DM (người tắt DM) chỉ
  ghi log. Test +5 với client giả (256/256).
- **11/09** — 🤝 **BÁN / TẶNG PAL CHO NGƯỜI CHƠI KHÁC** (chủ server: nút Bán → popup (1) bán shop giá sẵn (2) bán cho người
  khác nhập giá, 0 = tặng; bên nhận thấy pal + "Xác nhận mua với X"; người bán thu hồi được nếu câu giờ; UI pal đang giao dịch).
  Server: `dbCache._palTrades[]` {id, from, fromName, to, toName, price, item, at}; `palTradeOffer` RÚT pal khỏi rương người
  bán (không bán shop/nhận trùng được), kiểm người nhận có ví (`palUserExists` tra dbCache[id]), giá 0–100M, trần 10 pal đang
  rao/người; `palTradeCancel` = thu hồi (người bán) hoặc từ chối (người nhận) → pal về rương người bán; `palTradeAccept` =
  người nhận mua: giá > 0 thì kiểm nợ xấu + đủ tiền, trừ ví mua, cộng ví bán (logDog transfer 2 chiều), pal sang rương người mua
  (status chest, wonAt ghi "mua/được tặng từ X"). Profile state gửi `trades {out, in}`. Web: `pcSell` → popup `#tmodal` (🏪 bán
  shop | 🤝 chọn người nhận từ /api/players + giá), khối "🤝 ĐANG GIAO DỊCH" trên đầu rương: thẻ xanh = lời bán gửi cho tôi
  (✅ Xác nhận mua với X / 🎁 Nhận tặng / ❌ Từ chối), thẻ vàng = pal tôi đang rao (↩️ Thu hồi); routes
  `/api/pal/trade/offer|cancel|accept`. Test palwheeltest +15 (251/251). Chưa có DM Discord báo bên nhận - bên nhận thấy khi mở
  web (poll rương). Cầu Dogcoin: chủ server xác nhận nạp game→web giữ hạn 10.000 web/người/ngày như admin đặt (đã có).
- **11/09** — 💱 **Nạp Dogcoin game → web theo TỈ LỆ 1 : 2** (chủ server: "game 1 dog ở ngoài 2 dog, tại không cho rút, đồ quá
  cao + khoá shop"). `dbCache._dogNapRate` (mặc định 2, 0.1–100), admin đặt ở tab 👥 cùng dòng hạn ngày (ô 💱, lưu chung nút 💾,
  body `napRate` route daymax). `webNapGame`: lấy `took` trong game → ví + `floor(took × rate)`, hạn ngày chiều nạp đếm theo
  SỐ WEB nhận (kiểm trước bằng `amount × rate`, câu chặn kèm quy đổi), message + `credit/took/rate` trả về; RÚT web→game giữ 1:1.
  Web: dòng xanh "💱 Tỉ lệ 1 : 2 - lấy 1 Dogcoin trong game được 2 Dogcoin web", toast xem trước khi bấm nạp. Test bridgetest +7
  (24/24). ⚠️ Lưu ý kinh tế: 1:2 cộng với hạn 10.000 web/ngày = tối đa 5.000 Dogcoin game/ngày đổi được; đổi hạn nhớ tính lại.
- **11/09** — 💜 **+7 pal tím bản 1.0** (chủ server nêu Celesdir Noct + Eidrolon Ignis, bảo tìm thêm): thêm Dandilord (194),
  Silvance (193), Aegidron (184), Renjishi (183), Solenne (182) - 5 pal 1.0 dex cao nhất còn lại trong pool thường. KHÔNG thêm
  Lyleen thường, Wistella/Loomen/Mycora (support/thợ), Venusa trở xuống. Tổng tím 23/282 (~8%). Test 236/236.
- **11/09** — 🎯 **Viền sáng ô trúng chỉ hiện SAU khi mũi tên dừng** (chủ server: "tô vàng hiện trước, biết trúng con nào").
  Trước: thẻ 52 dựng sẵn class `raidhit/legendhit/epichit` từ đầu reel → nhìn dải là lộ. Nay cả 3 dải (vòng random, vòng may mắn
  reel 1, reel 2) dựng thẻ 52 với hit=false; `pwRollEl` sau 10,3 s dò `s.children[52]` gắn hit theo class thẻ rồi mới gọi cb.
  Test palwheeltest +1 (236/236).
- **11/09** — 🎁 **Vòng quay RANDOM bỏ hẳn ô RAID (mọi chế độ); đổi tên "Vòng quay RAID" → "🍀 Vòng quay may mắn"; thẻ Ô RAID =
  Lamball tô đỏ** (chủ server: "tắt raid đi chỉ còn legend trở xuống", "chuyển thành vòng quay may mắn", "lấy hình
  T_SheepBall tô đỏ, hình kia xấu"). `palWheelSpin` `raids = []` + state `raids: []` → 282 ô chia đều, không còn 1/283 raid;
  mua raid đích danh (`palPickBuy`, dùng `palWheelRaidPool`) KHÔNG đổi - vẫn bán khi không raw. Web: mọi chữ "vòng RAID" →
  "vòng may mắn", thẻ Ô RAID dùng `/palimage/T_SheepBall_icon_normal.png` + `filter:sepia(1) saturate(9) hue-rotate(-45deg)`
  (đỏ), `raid_slot.jpg` xoá khỏi repo. Test: 2 case cũ "trúng Ô RAID ở vòng random" viết lại thành "không bao giờ ra raid" (234/234).
- **11/09** — 🖼️ **Thẻ "Ô RAID" vòng may mắn dùng icon riêng** `assets/itemimage/raid_slot.jpg` (chủ server tải, tên gốc
  `images.jpg` → đổi cho rõ). `pwRaidSlotHtml` render <img> 62px bo góc, thiếu file thì onerror rớt về 🔥. Không đổi luật.
- **11/09** — 🍀 **VÒNG MAY MẮN LÀM LẠI + MỞ Ở PAL GỐC; raid KHOÁ LẠI ở vòng random** (chủ server: "vòng may mắn có pal
  legend với pal raid là 1 ô nằm riêng, trúng ô raid thì quay thêm raid random; 10 ô legend thì 4 ô raid; khoá pal raid ở quay
  random; vẫn khoá build chỉ số"). Server `palRaidSpin`: roll 1 = `Math.random()*100 < cfg.luckyRaidPct` (mặc định **40**, admin
  đặt ở panel ô "% ô RAID trên vòng may mắn") → nhóm RAID (**4 boss** `palLuckyRaidPool` theo luật 27/08 - KHÔNG Bellanoir Libero; không phụ thuộc raw. Commit `034c735` lỡ để 5 boss + đẩy khi 1 test cũ đỏ - sửa ngay ở commit sau) hay nhóm HUYỀN THOẠI
  (6 con `palLegendPool`); roll 2 = con nào trong nhóm; trả `raidHit`, item `raid`/`legend`; thưởng raidBonus giữ; bỏ chặn raw
  (pal ra vẫn Lv1/0 sao/không passive theo luật raw lúc nhận). `palWheelRaidPool` (vòng RANDOM + đích danh) trở lại `[]` khi raw.
  State: `luckyLegends`, `luckyRaidPct`, `raidWheelPals` (4 boss cho reel 2). Web: reel 1 trộn thẻ 👑 vàng + thẻ "🔥 Ô RAID"
  theo %; trúng Ô RAID → toast + **reel 2 toàn boss** dừng đúng con server chọn (`pwRaidStrip2` → `pwRaidFinal`); huyền thoại →
  kết quả vàng luôn. Test palwheeltest +6 (234/234): raid/legend theo roll, %=0/100, raw mở, pool random khoá.
- **11/09** — 💜 **16 pal "TÍM" trên vòng quay** (chủ server chốt danh sách sau khi bàn: pal cuối game build để đánh, không phải
  huyền thoại/raid; các con "lưỡng lự" Suzaku/Cryolinx/Helzephyr/Menasting/Gildane/Azurmane/Dogen/Omascul KHÔNG thêm). CHỈ tô
  màu, giá + tỉ lệ y pal thường. `PALWHEEL_EPIC_CODE` 16 mã: Shaolong, Orserk, Astegon, Shadowbeak, Blazamut, Silvegis, Selyne, Bastigor, Xenogard, Knocklem Ignis, Faleris, Faleris Aqua, Anubis, Lyleen Noct, Grizzbolt, Jormuntide Ignis.
  State gửi cờ `epic` ở 3 chỗ như `legend`; web `.pwCard.epic` viền/tên tím #c9a2ff + 💜 + chữ "PAL MẠNH", trúng thì `.epichit`
  phát sáng tím (ưu tiên: raid > huyền thoại > tím). Test palwheeltest +2 (228/228).
- **11/09** — 🔥 **PAL GỐC: pal RAID trở lại vòng quay RANDOM, vẫn khoá mua đích danh + vòng RAID may mắn** (chủ server:
  "thêm lại pal raid ở vòng quay, vẫn khoá cái lucky" → "chỉ cho quay random thôi"). `palWheelRaidPool()` bỏ early-return khi
  raw (ô RAID trên vòng có lại, xác suất như thường); `palPickBuy` + `pickState` dùng `raidNames`/`raidRows` RỖNG khi raw →
  danh sách mua đích danh không có raid, gọi thẳng API cũng "Không thấy pal này"; `palLuckyRaidPool` + `palRaidSpin` giữ khoá.
  Pal raid quay ra ở chế độ gốc vẫn là Lv1/0 sao/không passive như mọi pal gốc. Test palwheeltest +2 (226/226).
- **11/09** — 💥🏆 **Web: hiệu ứng NỔ HŨ QUAY PAL** (chủ server: "thiếu dấu hiệu biết mình nổ" - trước chỉ 1 toast 2 giây dễ
  trôi). `palJackpotFx(amount)` trong webplay.js: lóe vàng toàn màn `#jpFlash` 3 nhịp, rung màn (`body.storm`), mưa 44 emoji
  🏆💥🪙💰✨🐶 (dùng lại `.fx`), chữ to vàng giữa màn `#winpop.jp` 5,2 s "💥🏆 NỔ HŨ QUAY PAL +N Dogcoin", toast; khung kết
  quả `#pwRes` thêm dòng vàng + viền nhấp nháy `.jpwin` 8 s. Gọi ở CẢ vòng quay thường (`pwDone`) lẫn mua đích danh (`pkBuy`).
  Test: `paljpfxtest.js` 7 case chạy hàm thật với DOM giả (đếm 44 emoji, class, số tiền, dọn sau hẹn giờ) + palwheeltest nguồn
  (224/224); không có âm thanh vì assets chỉ có 1 file mp3 cũ.
- **11/09** — 🛒 **Pak thương nhân: giữ thêm Arena_Shop_1** (Thương Nhân Đấu Trường). `BialkShopOff_P.pak` build lại
  `--keep=Bounty_Shop_1,Arena_Shop_1`: 74 sản phẩm còn bán (18 + 56), 513 ẩn, pal shop tắt; đọc ngược khớp; đã chép lên server
  TEST `~mods/` (khớp byte, cần restart TEST). Prod: chủ server tự đè file (hoặc ra lệnh chép).
- **11/09** — ⭐ **Shop: nhóm QUAN TRỌNG (cat `important`) - mỗi người mua ĐÚNG 1 LẦN, vĩnh viễn** (chủ server: 2 Hộp Phụ Kiện
  mở ô phụ kiện - Kỳ Lạ `UnlockEquipmentSlot_Accessory_01` 3.000 tím, Bí Ẩn `UnlockEquipmentSlot_Accessory_02` 10.000 vàng; icon
  chủ server tải). Server: `user.shopOnce {id: ts}`, `itemShopBuy` chặn "đã mua rồi" + ép số lượng 1, MIỄN hạn ngày chung,
  đánh dấu lúc trừ tiền, giao hụt có hoàn → gỡ dấu; state web gửi `once` (id đã mua); `importantTier` tô màu theo độ hiếm
  gameitems (r3 tím `.isPur`, r≥4 vàng). Web: nhóm ⭐ đứng ĐẦU danh sách nhóm, card không có ô số lượng, nút "🛒 Mua (1 lần duy
  nhất)" → sau khi mua thành "✅ ĐÃ MUA" khoá + card mờ; isCard tách hàng Mua ra `isBuyRow(it)` (hàm đặt SAU isCard, không chen
  giữa). Panel: option ⭐ trong select nhóm. Đợt ghép 12 cờ `_migItemShopImportant1109`. Test: palwheeltest +7, shopcardtest +5.
- **11/09** — 🔁 **Cầu Dogcoin web↔game: HẠN NGÀY mỗi người, mỗi chiều** (chủ server: "chuyển tối đa 10.000 từ game ra web và
  ngược lại, limit 1 ngày, admin set được cạnh nút bật tắt"). `dbCache._dogBridgeDayMax` (mặc định 10.000, 0 = không giới hạn),
  đếm `user.dogDay {day, rut, nap}` theo ngày VN - rút web→game và nạp game→web đếm RIÊNG. Kiểm TRƯỚC khi trừ ví/mở SFTP; rút tính
  hạn lúc trừ ví, giao hụt có hoàn → trả hạn, timeout mơ hồ (giữ tiền) vẫn tính; nạp đếm đúng `r.took` (số thật lấy được từ túi
  game). Trần 500k/lần giữ nguyên. Panel: dòng "📅 Cầu Dogcoin: mỗi người chuyển tối đa [10000] / chiều / ngày 💾" ngay dưới 2
  công tắc 🎮/💬 ở tab 👥, route `/api/dogbridge/daymax` (SUPER, cổng thường 403), điền từ state khi ô trống. Web Hồ sơ: dòng
  vàng "📅 Hạn mỗi chiều 10.000/ngày · hôm nay còn rút … · còn nạp …". Test mới `bridgetest.js` 17 case (trích webRutGame/
  webNapGame thật); e2e HTTP: web rút 20.000 bị chặn "còn 10,000" không đụng SFTP, cổng thường 403, -1 → 400.
- **11/09** — 🛒 **Pak thương nhân: CHỈ GIỮ Bounty_Shop_1** (chủ server chốt sau khi xem bảng 38 shop + paldb: Bounty_Shop_1 =
  "Sĩ Quan Truy Nã PIDF", Arena_Shop_1 = Thương Nhân Đấu Trường bán bản vẽ Octavia cấp 5, Medal_Shop_1 = Thương Nhân Huy Chương
  Dog Coin). Build `--keep=Bounty_Shop_1` từ JSON rút pak 09/09 → `BialkShopOff_P.pak` mới (515 → -1, 18 Bounty giữ 0, pal shop
  8/8 = 0), đọc ngược pak khớp. Bản tắt sạch cũ đổi tên `BialkShopOff_ALL_P.pak` (chỉ cài 1 trong 2). Đã chép lên server TEST
  `~mods/` khớp byte - chờ restart TEST + kiểm trong game; prod chưa đụng (cần chủ server đè file hoặc ra lệnh).
- **11/09** — 🛒 **Nghiên cứu: tắt/giữ THEO TỪNG thương nhân** (chủ server: "tắt thương nhân huyền thoại, giữ con cần").
  Khả thi ngay: bảng shop 38 dòng = 38 shop, Stock theo dòng. `scripts/patch_shopoff.js` thêm `--list`, `--off=A,B`,
  `--keep=A,B` (regex `~^Caravan_`), áp cả CharacterNum bảng pal shop; kiểm trên JSON rút từ pak 09/09 (93/495/533 sản
  phẩm đúng). Bảng 38 shop + đoán NPC ghi ở README pak-mods (mục BialkShopOff). "Thương nhân huyền thoại" nhiều khả năng =
  `Arena_Shop_1` (10 bản vẽ Octavia/súng năng lượng cấp 5) và `Medal_Shop_1` (bản vẽ giáo Forest Boss cấp 5). CHƯA build
  pak - chờ chủ server chốt danh sách tắt/giữ; đồ nghề (dotnet10 + UAssetCLI + repak) còn trong scratchpad, Mappings.usmap
  trong repo. Pull sáng 11/09 nhận thêm commit Claude nhà `7f50b3c` (vòng quay pal: 6 huyền thoại trở lại + tô vàng).
- **10/09** — 💰 **Implant: trong cùng bậc xếp giá CAO trước** (chủ server: "1 bậc cây → kim cương → vàng; 2 giá trong bậc
  12000 xếp trước 8000"). `itemShopWebList()` sort 3 khoá: bậc (Chuyển Đổi → 🌈 → 💎 → 🥇 → thường) → giá giảm dần (chỉ cat
  implant) → thứ tự admin. Nhóm khác không đổi. Test palwheeltest +1 (216/216).
- **10/09** — 💎 **Implant xếp HẠNG theo passive** (chủ server: "cái nào kim cương xếp kim cương, cái nào vàng xếp vàng").
  Server `implantTier(id)` tra `passives.json` (tier 4 = 💎 kim cương, 3 = 🥇 vàng, 1-2 = thường; Cây Thế Giới = 🌈 riêng;
  Chuyển Đổi = gender), `itemShopWebList()` xếp Chuyển Đổi → 🌈 → 💎 → 🥇 → thường (nhóm khác giữ thứ tự) và gắn field
  `tier` (không lưu DB). Web: card `.isT4` viền + tên xanh ngọc #3fe0cf, `.isT3` vàng #ffd76a (cùng màu bảng passive lúc
  nhận pal), nhãn chữ 💎/🥇/🌈 cạnh tên ĐÃ BỎ ngay sau đó (chủ server: "nhìn cho gọn") - chỉ còn màu viền + màu tên; hàm `isTierTag` còn trong code nhưng không gọi. Kết quả nhóm implant: 1 Chuyển Đổi, 7 🌈, 14 💎
  (9.000), 13 🥇 (6.000), 1 thường (Cơ Bắp tier 2, 6.000). Test: shopcardtest +5, palwheeltest +2.
- **10/09** — 🧪 **Implant +14 món dùng một lần còn lại** (chủ server đối chiếu paldb "Disposable Implant" 21 món: 7 🌳 đã
  có, thiếu 5 Đột biến + 9 Cao cấp - Quỷ Thần, Thân Thể Kim Cương, Siêu Cấp Kỹ Năng, Nhịn Ăn Thành Thạo, Bất Động Minh
  Vương Chi Tâm, Thần Tốc, Động Cơ Vĩnh Cửu, Ma Cà Rồng, Vua Lướt Sóng, Thân Thể Bất Tử, Thể Chất Đặc Dị, Bảo Mẫu Trông
  Trẻ, Thiết Giáp Hạng Nặng, Bước Đi Trên Không). Giá **9.000** (Claude đề xuất giữa 6.000 và 12.000, chủ server duyệt
  "thêm đi"), gộp quota 🧬 2/người/ngày (không phải WT nên không vào quota 🌳), đứng sau 🌳 trước implant thường. Đợt ghép
  10 cờ `_migItemShopImplant14_1009`. DEFAULT 138 → 152, nhóm implant 36 món.
- **10/09** — ✂️ **Tên implant chỉ còn tiếng Việt**: bỏ "Cấy ghép dùng một lần: " / "Cấy ghép: " và " (Tên tiếng Anh)"
  ở 22 món nhóm implant (DEFAULT + đợt ghép 9 `_migItemShopImplantName1009` gọt tên món đã có trong DB theo đúng mẫu,
  tên admin tự sửa không dính). Ví dụ "Cấy ghép dùng một lần: Cú Nhảy Không Gian (Dimensional Leap)" → "Cú Nhảy Không Gian".
- **10/09** — 🆘 **Tẩu thoát: 4 tiếng → 1 tiếng/người/lần** (`RESCUE_CD_MS`), sửa luôn mọi câu chữ "4 tiếng" ở ngữ
  cảnh tẩu thoát trong index/webplay/panel (câu chặn, câu báo xong, chú thích Hồ sơ web, card panel, toast 🧪). Web tự
  lấy `rescueCd` từ state nên đồng hồ đếm ngược đúng ngay. ⚠️ Commit `4a43a6a` lỡ đẩy TRƯỚC khi kiểm cú pháp (script kiểm
  "còn sót 4 tiếng" tự bắt chính dòng comment của nó rồi ném lỗi, chuỗi lệnh dùng `;` nên commit vẫn chạy) - đã kiểm lại
  ngay sau: syntax + pagecheck OK, bot test chạy, web trả `rescueCd` = 3.600.000 ms. Bài học: sau bước ném lỗi phải là
  `&&`, không phải `;`.
- **10/09** — 🌳 **Implant: +7 Cây Thế Giới 12.000 (hạn riêng 1/người/ngày, card cầu vồng), Chuyển Đổi lên đầu +
  icon riêng, nhóm implant MIỄN hạn 📅 chung, chú thích = tác dụng thuần** (4 yêu cầu liên tiếp của chủ server). (1) Card
  implant bỏ dòng "📅 cả server hôm nay còn N" (web `isDayLine` trả riêng dòng 🧬/🌳; server `itemShopBuy` bỏ qua hạn chung
  cho `cat==='implant'` vì đã có hạn riêng - nếu không, số hiện và số chặn lệch nhau). (2) 7 implant
  `PalPassiveSkillChange_Consumable_WorldTree_*` (Thánh Kiếm Hai Lưỡi, Thành Trì Thịt Sống, Thần Hủy Diệt, Bàn Tay Ác Quỷ,
  Cú Nhảy Không Gian, Tiên Nhân, Vườn Ươm Cây Thần) giá 12.000, hạn riêng `_itemShopWtMax` (mặc định 1, admin đặt ở ô 🌳
  panel, body `wtMax` cùng route daymax), đếm `user.wtDay`, KHÔNG ăn vào quota 🧬 2/ngày; web: class `.isWT` viền + tên
  gradient cầu vồng, dòng 🌳 còn N/1. (3) Chuyển Đổi dùng `T_itemicon_Material_PalGenderReverse.webp`, đứng đầu nhóm: server
  `itemShopWebList()` sort ổn định trong nhóm implant (Chuyển Đổi → 🌳 → thường), nhóm khác giữ thứ tự. (4) `note` = mô tả
  passive nguyên văn (bỏ tiền tố 🏟️/🎯/🌳), nới `note` 140 → 240 ký tự cả đọc lẫn ghi (WT dài ~95). Đợt ghép 8 cờ
  `_migItemShopWT1009`: thêm WT còn thiếu + đổi icon Chuyển Đổi + gọt tiền tố note món đã có. DEFAULT 131 → 138. Test:
  palwheeltest +10 (213/213), shopcardtest 22/22 (harness trích thêm isWT/isWtLeft), e2e HTTP: web 138 món, thứ tự đúng, WT 7 ×
  12000, note sạch tiền tố, mua 2 WT bị chặn "còn 1", wtMax 3 → state 3, icon Chuyển Đổi 200. Bài học harness: regex trong
  template literal của patch test cần ĐÚNG 2 lớp escape - viết 8 backslash ra 4 trong file = sai lặng lẽ.
- **10/09** — 🧬 **Shop item: nhóm IMPLANT riêng, 15 món × 6.000, mỗi người 2 cái/ngày mọi loại gộp** (chủ server gửi
  ảnh paldb "Unlock Implants from Arena/Bounty" + Pal Reverser, dặn dùng chung icon
  `T_itemicon_Material_PalPassiveSkillChange_Consumable.webp`, "làm tiếng Việt + chú thích"). Map EN → id qua
  `passives.json` (en) rồi item `PalPassiveSkillChange_<passive>` trong `gameitems.json`: Serenity=CoolTimeReduction_Up_1,
  Infinite Stamina=Stamina_Up_1, **Runner=MoveSpeed_up_2 (Cấp Tốc, KHÔNG phải up_1 Nhanh Nhẹn)**, Ace Swimmer=SwimSpeed_up_2,
  Noble=SalePrice_Up_1, Healing Coach=AutoHPRegeneRate_Passive, Reload Master=ReloadSpeedUp_Passive, Musclehead=Noukin,
  Burly Body=Deffence_up2, Artisan=CraftSpeed_up2, Vanguard=TrainerATK_UP_1, Stronghold Strategist=TrainerDEF_UP_1,
  Motivational Leader=TrainerWorkSpeed_UP_1, Wellness Watcher=PlayerSP_DecreaseRate_Passive; Pal Reverser=`PalGenderReverse`.
  Tên = tên item game + (EN), `note` = 🏟️/🎯 nguồn + mô tả passive (hiện trên card + search). Nhóm `implant` thêm vào
  `ITEM_SHOP_CATS`/panel/web (8 nhóm). **Hạn RIÊNG** `_itemShopImplantMax` (mặc định 2, 0 = không) đếm `user.implantDay {day,n}`
  THEO NGƯỜI bất kể chế độ 🌐/👤 của hạn chung; kiểm trước khi trừ tiền, hoàn tiền trả lại hạn; web: dòng 🧬 trên card
  implant + `isBuy` chặn sớm; panel: ô 🧬 cạnh ô 📅, lưu chung route `/api/itemshop/daymax` (body `implantMax`). Đợt ghép 7
  cờ `_migItemShopImplant1009`. DEFAULT 116 → 131. Test: palwheeltest +11 (203/203), shopcardtest +4 (18/18; harness phải
  trích thêm isImpLeft/isImpLine), e2e HTTP: web 131 món / 15 implant / 6000, mua 3 Chuyển Đổi bị chặn "còn 2", implantMax
  5 → state 5, -3 → 400, icon 200.
- **10/09** — 🌐 **Hạn mua/ngày đổi sang GỘP CẢ SERVER** (chủ server: "toàn server được mua thay vì cá nhân").
  Thêm chế độ `dbCache._itemShopDayMode`: `'server'` (MẶC ĐỊNH mới - mọi người chung 1 bộ đếm
  `dbCache._itemShopDay {day, bought}`, ai mua trước được trước) / `'user'` (mỗi người, bộ đếm cũ `user.shopDay`).
  Panel: select 🌐/👤 cạnh ô 📅, lưu chung route `/api/itemshop/daymax` (body `dayMode`). Web: state gửi `dayMode`,
  card ghi "cả server hôm nay còn N/99" hoặc "hôm nay bạn còn…"; câu chặn server-side đổi theo chế độ. Test:
  palwheeltest +7 (192/192, khối cũ ép `'user'`), shopcardtest +3 (14/14), e2e HTTP: đặt 1/server → web mua 2 Mũi Tên
  bị chặn "Cả server chỉ mua tối đa 1…", dayMode lạ → 400. ⚠️ Rủi ro chủ server cần biết: 99/ngày CHUNG cho món 1–2
  Dogcoin = 1 người đăng nhập sớm vét sạch, người sau trắng tay; muốn công bằng thì nâng số hoặc bật lại 👤.
- **10/09** — 🔫 **Shop item +32 loại đạn, 1 Dogcoin/cái** (chủ server tải 32 icon `T_itemicon_Ammo_*.webp`, dẫn
  paldb.cc/vi/Ammo, dặn BỎ 6 món chưa có trong game: 2 món tên "-", Đạn Súng Máy `MachingunBullet`, Đạn Magnum
  `MagnumBullet`, SkyLightBullet, SkyHeavyBullet). Lấy đúng 34 Ammo trong `gameitems.json` trừ 2 id Magnum/Súng Máy
  = 32, tên tiếng Việt trong game, cat `ammo` (đã có từ 09/09). Đợt ghép 5 cờ `_migItemShopAmmo1009`. **Nới trần
  `setItemShop` 100 → 300** (84 + 32 = 116 đã vượt 100 - trước đây sẽ bị cắt lặng lẽ). Test bot: log "Ghép thêm 32 loại
  đạn", web 116 món / 7 nhóm, 32 đạn giá 1, icon 200. Lưu ý: `RoughBullet` (Đạn Thô), `InkBullet` (đạn súng decal),
  `PalDopingShotBullet` có trong dữ liệu game nhưng ít ai xài - admin không cần thì tắt "Bán" ở panel.
- **10/09** — 🐛 **HOTFIX web Shop Item vỡ layout (card lồng bậc thang, mất nút Mua)** ngay sau `499e865`: patch
  hạn/ngày chèn 2 hàm `isDayLeft/isDayLine` vào GIỮA 2 dòng của biểu thức `return` trong `isCard` (hàm này trải
  2 phần tử mảng chuỗi) → ASI cắt return sớm, card không đóng `</div>`, mất hàng Mua, 2 hàm thành hàm lồng nên
  `isBuy` gọi `isDayLeft` lỗi. pagecheck KHÔNG bắt được (cú pháp vẫn hợp lệ). Fix: dời 2 hàm xuống sau isCard.
  Bài học: webplay.js là MẢNG chuỗi, một hàm có thể trải nhiều phần tử - chèn dòng mới phải nhìn cả dòng kế.
  Thêm bộ test `shopcardtest.js` (11 case, trích isCard từ trang 4002 đã render: đếm div đóng/mở, có nút Mua,
  dòng 📅 xanh/đỏ, 2 hàm cấp cao nhất). Chữ Việt hiện "?" trong ảnh chủ server gửi là hệ quả lồng card (font
  đậm chồng nhiều lớp), header + meta đều utf-8.
- **10/09** — 📅 **Shop item: GIỚI HẠN MUA mỗi món / mỗi người / ngày** (chủ server: "mỗi người chỉ được mua
  99 cái/ngày, tất cả vật phẩm, cho mình set"). Một số chung `dbCache._itemShopDayMax` (mặc định 99, 0 = không
  giới hạn), admin đặt ở panel SUPER tab 🎮 card Shop Item (ô 📅 + 💾, route `/api/itemshop/daymax` trong VIEWONLY
  → cổng thường 403). Đếm ở `user.shopDay {day, bought:{id:n}}` theo ngày VN (`vnDayISO`), đổi ngày tự đếm lại.
  `itemShopBuy` kiểm TRƯỚC khi trừ tiền/mở SFTP; tính hạn lúc trừ tiền; giao hụt (hoàn tiền) trả lại hạn; timeout
  mơ hồ (giữ tiền) vẫn tính (chống lách). Web: state gửi `dayMax` + `today`, card hiện "📅 hôm nay còn mua được
  N/99" (đỏ khi hết), `isBuy` chặn sớm; server vẫn là chốt. Test: palwheeltest +13 case (185/185); e2e HTTP bot test
  (đặt 1 → web mua 2 bị chặn đúng câu, cổng thường 403, 0 và -5 xử đúng); 19 món test-bot đã sửa giá 2 qua API.
- **10/09** — 🛒 **Shop item +19 món: 13 🍖 thức ăn (12 thịt sống + Mật Ong) + 6 🧱 nguyên liệu** (chủ server
  tải icon sẵn vào `assets/itemimage/`, tra ID từ `gameitems.json` theo icon - lưu ý IconName ≠ ID ở
  1631/2299 món nên KHÔNG lấy IconName làm ID). Nhóm shop MỚI `material` (🧱 Nguyên liệu): thêm vào
  `ITEM_SHOP_CATS` (server), select `.isf-cat` panel, `ISG` web (7 nút nhóm). `DEFAULT_ITEM_SHOP` 65 → 84;
  đợt ghép 4 theo cờ `_migItemShopFood1009` (chỉ thêm cat food/material còn thiếu, không hồi sinh món
  admin đã xoá, chạy 1 lần lúc bot khởi động → prod `pm2 restart` là có). Giá chủ server chốt: **2 Dogcoin/cái**
  cả 19 món (cần số lượng rất lớn) - bù bằng hạn mua/ngày (mục dưới). ⚠️ `setItemShop` cắt ở **100 món** (`.slice(0,100)`),
  còn 16 chỗ. Test: web /api/itemshop/state 84 món đúng nhóm, 4 ảnh mới 200, palwheeltest 172/172
  (sandbox thêm `vnDayISO` - hàm Claude nhà thêm, không liên quan đợt này).
- **10/09** — 🆘 **Điểm tẩu thoát "mất" sau F5** (chủ server: "F5 nó mất, hôm qua mình lưu"): điểm
  KHÔNG mất - vẫn nằm ở `dbCache._rescuePoint` (database.json VPS, reset server game không đụng tới)
  và người chơi bấm 🆘 vẫn về đúng điểm đó. Chỉ là card panel tải điểm bằng POST riêng sau 800 ms
  lúc mở trang - khi panel có mật khẩu thì lúc đó chưa đăng nhập → 401 nuốt lỗi → 3 ô trống; cổng
  thường còn bị 403 vì route nằm trong VIEWONLY. Fix: `buildState()` thêm `rescuePoint`, `refresh()`
  gọi `rpFill(STATE.rescuePoint, true)` (soft: chỉ điền ô TRỐNG + dòng "Đang dùng điểm", không đè
  số admin đang gõ chưa lưu), bỏ `setTimeout(rpLoad,800)`. Test HTTP 2 cổng: lưu ở SUPER → state
  cả 2 cổng có điểm, cổng thường POST vẫn 403; holdtest thêm 6 case (34/34). Kiểm prod chỉ-đọc qua
  SFTP: main.lua prod có RESCUEAT (10:19), server restart 14:00 → mod mới đã nạp, chưa ai bấm 🆘 sau đó.
- **10/09** — 🖱️ **Panel: bôi chữ / Ctrl+F bị mất sau 2–3 giây (CẢ 2 cổng SUPER + thường)**:
  nhịp `refresh()` 3 s gán lại `innerHTML` ~40 khối dù dữ liệu y cũ → trình duyệt vứt vùng bôi
  đen + vệt tìm kiếm. Fix 3 lớp trong `panel.js` (1 trang cho cả 2 cổng): (1) **setter
  `innerHTML` "lười"** (IIFE đầu script): gán lại đúng chuỗi đã gán lần trước và số con không
  đổi thì không đụng DOM → khối nào không đổi đứng yên, chỉ khối có số đổi (sàn CP nhịp 2 s, giờ)
  mới vẽ lại; (2) **giữ màn hình** `holdReason()`: đang bôi chữ trong `#app` (tối đa 5 phút),
  đang Ctrl+F/F3 (bắt keydown, giữ tới khi trang lấy lại focus), hoặc bấm nút **⏸ Dừng cập nhật**
  ở header → nhịp tự động `refresh(false)` chỉ cập nhật STATE + chỉ báo vàng ở header, không vẽ;
  `refresh()` sau khi bấm nút vẫn ép vẽ ngay; state y hệt lần vẽ trước (so chuỗi JSON) cũng bỏ
  qua; (3) bảng 👥 Người chơi dựng thành 1 chuỗi gán 1 lần (trước xoá sạch + appendChild từng
  dòng). Bộ test `holdtest.js` 28 case trích code từ trang đã render (setter lười, holdReason,
  refresh guard, renderPlayers). Đã sync + restart bot test (4508/4234).
- **10/09** — 🆘 **Tẩu thoát khi OFFLINE báo lỗi thô** ("ERROR RESCUE: …main.lua:727: khong lay duoc
  pawn…"): người chơi thoát game vẫn còn PlayerState nên mod tìm được state mà không có pawn.
  Fix: `palRescue` **kiểm `requireOnline` trước** như mọi luồng giao đồ (offline → "Nhân vật X chưa
  ONLINE trong game - vào game, đứng yên vài giây rồi bấm 🆘 (chưa tính lượt)", không kiểm được →
  câu riêng); lỗi mod `khong lay duoc pawn` / timeout cũng dịch ra câu người thường; Lua
  `rescuePlayer` dùng `error(msg, 0)` để không kèm `file:dòng`. main.lua đã chép lên TEST + PROD
  (cần restart server mới nạp).

- **08/09 (tối)** — ⚠️ **Đổi tên server trên Shockbyte = GÃY prod âm thầm**: chủ server đổi
  tên server CHÍNH "1. test mod" → **"1. Cô 4 vui vẻ"** (và server TEST → "1. test mod").
  Path SFTP Shockbyte đi theo TÊN HIỂN THỊ nên `SFTP_MOD_PATH` trong `.env` dashboard prod
  sai → mọi ghi `queue.txt` lỗi "path not found" → bot báo "Không kiểm tra được online
  (Dashboard server error)" cho CẢ Kho đồ lẫn nhận pal, dù mod Lua trên server vẫn sống.
  Chẩn đoán: `opendir("/")+readdir` trên SFTP prod liệt kê tên hiện tại (readdir thư mục con
  bị chặn). Fix: sửa `.env` prod + `pm2 restart palworld-dashboard`, KHÔNG cần đụng mod/restart
  game. Đã chạy OK sau fix. Lần sau thấy "Dashboard server error" ngay sau khi đổi tên/đổi
  gói server → nghĩ tới cái này đầu tiên.
- **09/09** — 🍀 **Panel SUPER: ép QUÀ hộp may mắn kế tiếp** (tab 💣, cùng ô chọn người của ép
  mìn): khiên/⛏️/🚀/💰/🏆/hụt, dùng 1 lần rồi xoá, quà không thuộc bàn quay của trò đó thì quay
  thường. Mục đích: dựng kịch bản test (ép mìn 7 ô + ép khiên → đạp mìn → mở tiếp qua ô an
  toàn thứ 14 → thấy cảnh báo trần ×2000). Code `forcedLucky` + `takeForcedLucky(userId, wheel)`
  gọi trước `spinWheel` ở 2 `luckyPick`; route `/api/lucky/force|clear`; state `forcedLucky`.
- **09/09** — ⚠️ **Báo người chơi khi ván CÓ TRỢ GIÚP đã chạm trần** (khiên đã đỡ/⛏️ → trần
  thắng ×100/300/500 theo 3/4/5 mìn, ×2000 từ 6 mìn và Leo Thang). Trước đây số trên nút chỉ
  đứng yên, không ai nói gì, người chơi mở tiếp ôm rủi ro 100% lợi 0%. Server `current()` thêm
  `assistCap` + `assistCapHit` (2 game); web: dòng trạng thái ghi "⚠️ CHẠM TRẦN ×N (ván có trợ
  giúp 🍀) - mở thêm KHÔNG tăng tiền", nút NHẬN TIỀN nối "· ⚠️ TỐI ĐA ×N (nhờ …) - NÊN DỪNG",
  toast đỏ 1 lần/ván (cờ MCAPWARN/SCAPWARN). Không tự dừng ván thay người chơi. Chủ server
  chốt câu chữ + vị trí: server thêm `assistWhy` (`assistWhyOf(g)`: "KHIÊN đỡ mìn / KHIÊN đỡ
  lửa / MÁY ĐÀO mở ô / THANG MÁY / Ô VÀNG") → câu "Ván này bạn mở được nhờ KHIÊN đỡ mìn nên chỉ
  thưởng TỐI ĐA ×2000 = N"; **khung đỏ nhấp nháy `.capwarn` (#mCapWarn/#sCapWarn) đặt NGAY TRÊN
  nút NHẬN TIỀN**; toast webplay có class `.err` (nền đỏ) khi câu bắt đầu ⚠️/❌/⛔.
- **09/09 (tối)** — 🎚️ **Sàn cược Dò Mìn + Leo Thang admin chỉnh được** (tab 👥, card Mở/Đóng, hàng
  dưới): `MIN_BET = 400` chỉ còn là mặc định, số thật `minBet()` đọc `dbCache._minBet`
  (`setMinBet`, route `/api/games/minbet`, 1–10.000.000); `start()` 2 game + web api dùng getter nên
  đổi là áp ngay cho ván mới, web nhận `minBet` qua state. Chủ server muốn hạ về 100 cho team chơi
  lại. pottest +4 case (90). ⚠️ Lúc kiểm API shop, Claude lỡ lưu danh sách RỖNG vào shop bot TEST
  (65 món) → khôi phục từ `DEFAULT_ITEM_SHOP` (đúng 65, cùng nhóm); nếu chủ server từng sửa giá trên
  test thì mất. Bài học: không gọi API ghi lên db test bằng dữ liệu giả để "dọn".
- **09/09 (tối)** — 🛒 **Shop item thêm 2 nhóm 🍖 Thức ăn (`food`) + 🔫 Đạn (`ammo`)**: whitelist nhóm
  gom về 1 hằng `ITEM_SHOP_CATS` trong index.js (list/save/backfill dùng chung), panel select + nạp
  form, web mảng `ISG` 6 nút (hàng nút đã flex-wrap). Món cũ không đổi nhóm. Thêm nhóm sau này = thêm
  1 phần tử ở 3 chỗ đó.
- **09/09 (tối)** — 🔄 **PROD RESET SẠCH + CÀI LẠI** (team chơi lại từ đầu). Chủ server reset qua
  Shockbyte (world mới id `45DB99BA…`, UE4SS có sẵn theo image, AdminPassword MỚI do Shockbyte
  sinh - khác mật khẩu cũ, REST 22666/RCON 22665 bật, ExpRate 0.4, ServerName mặc định). Claude cài
  lại qua SFTP bằng `tools/pak/prod_setup.js` (ghi xong đọc lại khớp byte từng file): (1) mod
  `GiveGoldCommand` (main.lua repo + enabled/queue/results + `mods.txt` thêm `GiveGoldCommand : 1`
  trước khối Keybinds); (2) **PalDefender 1.9.1** vào `Pal/Binaries/Win64/` (d3d9.dll + PalDefender.dll)
  + `PalDefender/Config.json` chép từ server test (kick cheater, chưa ban, log chat/IP, chặn respawn
  khẩn); (3) 4 pak `BialkServer / BialkNoDrop / BialkRaidTimer v18 / BialkShopOff` vào `~mods/`, KHÔNG
  CreativeMenu; (4) `bAllowClientMod=False` ở `ShockPal.ini` + `PalWorldSettings.ini`. Server đang
  CHẠY lúc ghi → hiệu lực sau restart (chủ server tự restart). ⚠️ Ai dùng REST game trên VPS phải đổi
  sang AdminPassword mới (xem ShockPal.ini prod); đường giao pal/Kho đồ đi SFTP nên không ảnh hưởng;
  `SFTP_MOD_PATH` không đổi (tên server + UUID giữ). Kinh tế Dogcoin trên bot CHƯA reset (chờ lệnh).
  Web: fix chế độ PAL GỐC vẫn bị client chặn "chọn ít nhất 1 dòng linh hồn" (`2f1d005`) - prod hết
  lỗi khi pull. Đồ nghề rút pak/cài server chuyển từ scratchpad vào `tools/pak/` (có README riêng).
- **09/09** — 📦 **Đối chiếu `~mods/` PROD (chỉ đọc)**: prod chạy `BialkServer` (= repo),
  `BialkRaidTimer` (= **v17** → v18 vá EXP tháp đúng nền, dùng thẳng), `BialkNoDrop_P.pak`
  (Silvance + Dandilord 8 dòng về 0 - file chủ server dựng ở nhà, nay đưa vào repo thay
  `BialkSilvanceNoDrop`), và `CreativeMenu_P.pak` sót (nên gỡ). Test đã đồng bộ: v18 + ShopOff +
  NoDrop, gỡ Lv77 sót. Web: fix chế độ PAL GỐC vẫn bị chặn "chọn ít nhất 1 dòng linh hồn" ở client.
- **09/09** — 🧹 **Dọn nhầm lẫn pak raid + Dandilord**: (1) tiêu đề README pak-mods ghi "v7" nhưng file
  thật đã là **v17** (git `3f00641`, 03/09) - bản vá EXP tháp hôm nay là **v18** trên nền v17, không
  phải v8; đã thêm sổ phiên bản vào README pak-mods. (2) Server TEST còn sót `BialkRaidTimerLv77_P.pak`
  (bản thử 28/08, v16 đã gộp + xoá khỏi repo) nằm cạnh file chính → 2 pak đè cùng bảng → **đã gỡ
  khỏi `~mods/` test** (bản sao git `e23ae99`). (3) Chủ server nhớ "Dandilord không drop": đúng là
  đã làm 12/08 bằng PalSchema `drop_dandilord.json` (Rate=0 FlowerPrince + BOSS) nhưng **revert
  cùng ngày** (bd0d03d → e92835f) vì cách Rate=0 PalSchema không ăn Lv70+ (bài Silvance); hiện
  KHÔNG có file nào chặn drop Dandilord - pak Silvance chỉ tắt 4 dòng Mothman. Muốn làm thì vá 4
  dòng FlowerPrince (`000`/`070` × thường/BOSS) vào pak drop như Silvance.
- **09/09** — 🏯 **Boss tháp hết cày EXP (`BialkRaidTimer_P.pak` v18, nền v17)**: chủ server muốn cooldown/
  giới hạn số lần vào tháp. Dump `PalBossBattleManager` / `PalBossBattleSequencer` /
  `PalBossBattleInstanceModel` trên server test (lệnh DUMPP của mod): game **không có** cooldown
  hay đếm lần, chỉ `BossBattleEntry/Cancel/Exit`, `EntryPlayers/WonPlayers/FirstClearPlayers`.
  Chặn cứng = Lua đá người sau khi vào + rủi ro sập native (bài DBGPAL) → CHỌN bịt động lực:
  `ExpRatio` 21 dòng `GYM_*` trong `DT_PalMonsterParameter(+_Common)` 30–35 → **1**. Bảng này
  đã nằm trong pak RaidTimer (2 pak cùng bảng đè nhau) → vá thêm vào bản đó, phẫu thuật byte
  (`pak-mods/scripts/surgical_expratio.js`), verify 20/0, dựng lại pak, đã chép lên server TEST
  (chưa test game). Bài học mới: gom diff theo CỤM byte, không theo mốc 4 (property không canh 4).
- **09/09** — 🧾 **Nghiên cứu tắt thương nhân NPC (kế hoạch pak `BialkShopOff_P.pak`)**: khả
  thi, là mod DataTable như `BialkServer_P.pak` - đặt `Stock = -1` ("not visible in shop") cho
  mọi sản phẩm trong `DT_ItemShopCreateData_Common` (+ `DT_PalShopCreateData_Common`, có thể
  `DT_ItemShopLotteryData` cho thương nhân lang thang); chỉ cần cài server (mod Nexus cùng bảng
  xác nhận replicate xuống client). Script vá sẵn `pak-mods/scripts/patch_shopoff.js`
  (`--check/--stock/--empty`, duyệt theo tên field; pal shop: `CharacterNum` → 0). **ĐÃ BUILD
  cùng ngày** dù máy không có game: rút 5 bảng thẳng từ `Pal-WindowsServer.pak` (4.9 GB) trên
  server test qua SFTP đọc-theo-offset + Oodle, tải nóng UAssetCLI + .NET 10 portable + repak.
  Round-trip gốc byte giống hệt; 587/587 Stock = -1, 8/8 CharacterNum = 0; pak V11 seed chuẩn
  6 file `pak-mods/BialkShopOff_P.pak`, đã chép lên `~mods/` server TEST (chờ restart + test).
  Chi tiết + cách rút file từ pak server: `pak-mods/README.md`.
- **09/09** — 🩹 **Bảng shop item cuốn số đang sửa** (chủ server: "edit số, mấy giây sau reset về
  mặc định"): render 3s/lần chỉ chừa lúc con trỏ còn trong ô, rời chuột là vẽ lại theo db. Fix:
  cờ `ISDIRTY` (mọi input/change trong `#itemShopBody`, ➕ Thêm, 🗑️, 📷 up) → không vẽ lại tới khi
  💾 Lưu thành công; nút Lưu đổi "💾 Lưu shop ● CHƯA LƯU" (đỏ); thêm chữ ký `ISSIG` = JSON db, dữ
  liệu server không đổi cũng không vẽ lại (đỡ nháy). Cùng bài với ô nhập panel 05/09.
- **09/09** — 🔁 **Công tắc cầu Dogcoin web ↔ game** (2 chiều riêng, tab 👥 hàng dưới card Mở/Đóng):
  `dogBridgeCfg()/setDogBridge(key,on)` lưu `dbCache._dogBridge {rut, nap}`; `webRutGame`/`webNapGame`
  từ chối ngay đầu hàm khi đóng ("⛔ … đang ĐÓNG - admin tạm khoá chiều này"); state
  `/api/dogbridge/state` thêm `rutOpen/napOpen` → web khoá nút chiều đó + đổi chữ "⛔ … ĐANG ĐÓNG".
  Route `/api/dogbridge/open {key: rut|nap, open}` (epOk). Mục đích: chặn hack Dogcoin trong game
  rồi chuyển ra web (bàn 08/09), giờ admin bật/tắt tuỳ lúc thay vì phải sửa code.
- **09/09** — 🧰 **3 tiện ích panel SUPER**: (1) **⏸️ Mở/Đóng trò GOM về tab 👥** (chủ server:
  "dễ thao tác 1 lần"): card đầu tab với 5 ô tick Dò Mìn / Leo Thang / Phi Thuyền / Vòng quay Pal
  / Sàn cổ phiếu + trạng thái Big Small kèm nút ⏹ - `gameSwitch()` gọi đúng API sẵn có của từng trò
  (`/api/games/open`, `/api/spm/cfg {open}`, `/api/palwheel/cfg {open}`, `/api/stock/cfg {open}`),
  đổi ngay không cần Lưu; card cũ ở tab 💣 bỏ. (2) **🗑️ Xóa TẤT CẢ pal trong rương** mọi người
  chơi (nút đỏ cạnh 🎒 Xem rương, gõ XOA): `palChestClearAll()` xoá mọi item trừ `delivering` (đơn
  đang giao phải chốt trước), KHÔNG hoàn tiền, route `/api/palchest/clearall`. (3) **Shop item: công
  tắc Bán/ẩn từng món** - cột "Bán" đầu bảng, bỏ tick = `off:true` → web không thấy, mua thẳng API
  bị chặn, dòng mờ 45% trong panel, dữ liệu món giữ nguyên.
- **09/09** — 🔒 **Chế độ PAL GỐC (tắt chỉ số)** - team chơi lại sợ pal quá mạnh. Panel tab 🎮 ô
  tick đỏ "🔒 TẮT CHỈ SỐ PAL" (`palWheelCfg.raw`). Bật → mọi pal giao ra **Lv1 · 0 sao · IV 1/1/1 ·
  linh hồn 0 · KHÔNG passive · bản THƯỜNG** (không BOSS_), chỉ chọn giới tính (v2 theo chủ server:
  "chỉ chọn được giới tính thôi"). Server: `specBase` nhánh raw, `passives = []`, bỏ bắt "ít nhất 1
  dòng linh hồn", không tính phí gì dù client gửi lên. **Pool**: bật raw thì `palWheelNormalPool`
  ẩn 6 huyền thoại (`PALWHEEL_RAW_EXCLUDE_CODE`: SaintCentaur Paladius · BlackCentaur Necromus ·
  IceHorse Frostallion · IceHorse_Dark Frostallion Noct · JetDragon Jetragon · PoseidonOrca
  Neptilius), `palWheelRaidPool` + `palLuckyRaidPool` trả rỗng (không ô RAID, không bán raid đích
  danh, vòng RAID may mắn báo tạm tắt). Web nhận pal: ẩn cả 2 cột (linh hồn+IV, passive) và nút
  BOSS, dòng mặc định ghi "🔒 CHẾ ĐỘ PAL GỐC". Bỏ tick là về luật thường + pool đủ như cũ.
  palwheeltest thêm 6 case raw (pool + claim).
  Phi Thuyền: thêm **nút to ⏸/▶️** cạnh tiêu đề card (bấm 1 lần, gọi `/api/spm/cfg {open}`) - công
  tắc cũ là ô tick "Mở game" nhỏ + phải Lưu nên chủ server không thấy.
- **09/09** — ⏸️ **Công tắc MỞ/ĐÓNG Dò Mìn + Leo Thang** (panel SUPER tab 💣, khung đầu; các trò
  khác đã có sẵn: Phi Thuyền/Vòng quay Pal `open`, Cổ phiếu `skOpen`, Big Small tắt bàn).
  `gameOpen(key)/setGameOpen(key,on)` lưu `dbCache._gameOpen`; `start()` 2 game từ chối "⛔ …
  đang ĐÓNG bảo trì" khi đóng, ván đang chơi vẫn chơi nốt/dừng (không nuốt tiền). Web nhận
  `open` qua state → nút bắt đầu thành "⛔ DÒ MÌN/LEO THANG ĐANG ĐÓNG BẢO TRÌ" (disabled). Route
  `/api/games/open {key, open}` (epOk). Đổi chữ "trần" → "kịch khung" ở 2 minigame (web,
  Discord, log) theo ý chủ server; giữ "Trần cược" Big Small + "trần khối lượng" sàn.
- **09/09 (v2 nổ hũ)** — 🎁 **Trúng 🏆 thì tự tay chọn hộp bội số**: hộp cỏ ra 🏆 KHÔNG trả ngay
  nữa - server treo ván (`g.jpPending`, guard chặn mở ô/dừng "Chọn 1 hộp NỔ HŨ đã!"), trả
  `{jackpotPick:true, mults, state}`; web đóng hộp cỏ là bung modal vàng `#jpPick` với N hộp úp
  (N = số bội số cấu hình, mặc định 3: x10/x15/x20). Người chơi bấm hộp → `POST
  /api/<game>/jackpot {box}` → `jackpotPick()` bốc bội số ngẫu nhiên (hộp chỉ là sân khấu như hộp
  cỏ), N-1 hộp kia lật ra các bội số còn lại (trộn), trả trần ván + bội số × cược, CHỐT VÁN, kết
  quả ghi "🎲 Bạn bốc x15 = +N · 🏆 Trần ván +M · TỔNG". F5 giữa chừng: `current().jpPick/jpMults`
  → web mở lại hộp. RQ test: mult random tốn ở jackpotPick (không còn ở luckyPick). pottest 80,
  luckytest 92.
- **09/09** — 💎 **Giá riêng cho passive HẠNG 4 thường** (`upTier4`, mặc định 0 = miễn phí như
  cũ; 24 con tier 4 không phải Cây Thế Giới: Huyền Thoại, May Mắn, Thần Tốc, Ma Cà Rồng, Quỷ
  Thần, Thân Thể Kim Cương...). Server cộng `t4Count × upTier4` vào upCost (không tính đôi với 7
  con 🌈 đã có `upWtPassive`); web hiện "💎 giá" cạnh tên khi > 0, tính vào tổng + dòng riêng
  từng con trong tóm tắt; panel ô "💎 Passive HẠNG 4 thường (giá/con)". `passives.json` có sẵn
  field `tier` (1:36 · 2:2 · 3:30 · 4:31).
- **09/09** — 💎 **Pal: giá dòng linh hồn PHẲNG + bán ô passive 2–4**. `cfg.soulMax` ĐỔI NGHĨA
  (giữ tên key cho db cũ): từ "trần chọn" thành **số dòng linh hồn GỐC MIỄN PHÍ** (mặc định 1) -
  người chơi luôn tick được tới 4 dòng, dòng vượt gốc trả tiền, y hệt passiveMax (trước: để 1 là
  web chặn không cho tick dòng 2-4 - chủ server bắt lỗi). `palUpSoulLineCost = max(0, lines -
  soulMax) × upSoulLine`, hết cấp số nhân: mỗi dòng vượt = `upSoulLine` (mặc định đổi 2.000 →
  **5.000**; gốc 1 → 4 dòng = 15k). Panel nhãn "Dòng linh hồn GỐC miễn phí (1–4)". Tóm tắt
  nhận pal (web) ghi phí NGAY TRÊN TỪNG DÒNG: linh hồn "· thêm dòng +5.000" / "· dòng gốc miễn
  phí" (+ phí kéo % nếu có), bỏ cục "Phí thêm dòng (4 dòng) +15.000" gây hiểu nhầm là bug; passive
  từng con một dòng "✨ Passive #i Tên 🌈 · ô vượt gốc +N (ô X + 🌈 Y)" thay 2 dòng gộp.
  `palUpPassiveCost` tính MỌI ô vượt "ô gốc miễn phí": ô 2–4 giá `upSlotLow` (mới, mặc định
  5.000; hạ gốc xuống 1 là bán ô 2/3/4), ô 5–8 giá riêng như cũ (trước đây ô 2–4 luôn miễn phí
  dù hạ gốc). Panel tab 🎮: ô "💎 Ô passive 2–4", nhãn dòng linh hồn đổi; web gương công thức
  (`up.slotLow`, `lc = (lines-1)×soulLine`). palwheeltest 166/166.
- **09/09** — 🏆 **Nổ hũ Dò Mìn/Leo Thang = BỘI SỐ NGẪU NHIÊN × tiền cược, BỎ HẲN hũ nuôi**
  (chủ server chốt lần cuối sau 3 vòng: chia % hũ → ăn x10 từ hũ vô hạn → bản này). Trúng 🏆
  trong hộp 🍀 → bốc đều 1 trong danh sách bội số (mặc định **x10 / x15 / x20**) × cược, CỘNG
  trần ván như cũ (`jackpotCapOf`: 3 mìn ×50 · 4 ×100 · 5 ×200 · 6+ / thang ×2000, kẹp giải
  cao nhất bàn), ván DỪNG NGAY. 2 minigame **không trích 5%, không hiện hũ, không trần hũ**
  nữa (`luckyPotCut` trả 0 cho mines/stairs); tiền hũ cũ trong `_pots.mines/stairs` nằm yên,
  panel hiện "hũ cũ còn N không dùng" (rút tay bằng số âm nếu muốn). Hũ Quay Pal GIỮ NGUYÊN.
  Code: `potCfg(key).mults` (lưu `dbCache._potCfg[key].mults`), `setPotCfg(key,{mults})` nhận
  chuỗi "10,15,20" (1–6 số, 1–1000, bỏ trùng, sắp tăng), `jackpotMult(key, bet)` tốn đúng 1
  `Math.random()` SAU quay hộp + 3 hàng mẫu (test đẩy RQ theo thứ tự đó). Panel tab 💣: ô bội
  số từng trò (SUPER, `/api/pot/cfg`). Web: nhãn cạnh tên game "🏆 NỔ HŨ x10/x15/x20", dòng
  dưới bàn "cược X → Y tới Z", lời mời hộp 🍀 "NỔ HŨ tới…", kết quả "(🎲 bốc x15 tiền cược =
  N + trần ván)"; state gửi `potMults`. Discord: "+N bội số 🎲 bốc **x15** tiền cược".
  ⚠️ Kinh tế: nhà cái trả THẲNG, kỳ vọng thêm mỗi hộp 🍀 = 1% × ~15 × cược = 15% cược (cộng
  lì xì 30%×46% sẵn có) - chủ server đã nghe, chấp nhận; giảm bằng cách hạ danh sách bội số.
  pottest 76/76, luckytest 91/91.
- **08/09 (tối 3)** — 🐛 **Trình sửa shop item nuốt nhóm Phụ kiện**: `itemShopAddRow` chỉ
  nhận cat weapon/armor (viết trước khi có accessory 07/09) → 38 phụ kiện nạp lên form thành
  🧪 Tiêu hao, admin bấm 💾 Lưu là server ghi đè cat=consume cả 38 món (server thì nhận
  accessory đúng). Sửa 1 dòng. Quy trình thêm món bán mới = lấy StaticItemId ở 📦 Kho đồ
  (SUPER) → tab shop: id + tên + nhóm + giá + 📷 Up hình → 💾 Lưu, không cần code/restart.
- **08/09 (tối 2)** — 🔐 **Web người chơi: login sai PIN không thấy báo gì** → lỗi giờ hiện
  trong khung đỏ `#loginErr` NGAY DƯỚI ô PIN (đứng yên tới lần thử sau; toast đáy màn hình bị
  bàn phím điện thoại che), nút login khoá "⏳ Đang kiểm tra..." khi chờ, Enter ở ô PIN =
  bấm nút, JSON hỏng/HTTP lỗi/mạng đứt đều có câu rõ. Toast webplay z-index 99 → **200**
  (trước bị popup Lộc lá 100 / chọn quà 110 / gmodal 120 che → báo lỗi trong popup mất tăm),
  thời gian hiện theo độ dài (lỗi ≥5s, tối đa 8s).
- **08/09 (tối)** — 🔔 **Panel: thông báo nhìn thấy được, không phải F12 nữa**. (1) `toast()`
  xếp chồng tối đa 5 tin, thời gian hiện theo độ dài chữ (lỗi ≥6s, tối đa 10s), lỗi viền
  đỏ / thành công viền xanh, bấm là tắt, tin trùng trong 1.5s bỏ qua (trước: 1 ô, 1.8s là
  biến). (2) `api()` toast MỌI đường lỗi: fetch đứt (bot tắt/mất mạng - trước đây im lặng
  hoàn toàn), HTTP 403 cổng chỉ xem, 502/504 proxy không kịp; lỗi gắn cờ `toasted` để caller
  không hiện đôi; thêm `unhandledrejection` + `window.error` → toast lưới an toàn cho mọi
  chỗ quên `.catch`. (3) Helper **`runBtn(btn,label,fn)`** dùng chung: khoá nút + chữ ⏳ tới
  khi xong, thành công/lỗi đều trả nút về; đã gắn cho 🧹 Xóa chat bot (4 chỗ). (4) Kho đồ:
  bấm Giao → khoá TẤT CẢ nút Giao, nút bấm hiện "⏳ Đang giao...", khung `#gvResult` trong
  tab ghi dòng ⏳ rồi thay bằng ✅/❌ (giữ 8 dòng, có giờ) - giống bảng người chơi. (5)
  `pcResolve` (rương pal) bỏ `confirm()` trình duyệt, dùng uiConfirm; login báo lỗi mạng.
  Smoke test vm `toasttest.js` (scratchpad) 17 case trích code từ trang đang chạy.
- **08/09** — 📦 **Tab "Kho đồ" (CHỈ cổng SUPER): admin giao BẤT KỲ item vào túi người
  chơi**, thay hẳn CreativeMenu (mod đó cần cài cả client, server bật bAllowClientMod).
  `BotDoMin/gameitems.json` 2299 item {id, tên VN, mô tả, icon, rarity, type} lấy từ registry
  save-editor oMaN-Rod (items.json + l10n/vi); icon hotlink `cdn.paldb.cc/.../<Icon>.webp`
  — CDN PHÂN BIỆT HOA/THƯỜNG nên tên icon đã đối chiếu 793 tên chuẩn cào từ paldb.cc/vi/Items.
  Bot: `gameItems()` (lazy), `giveTargets()`, `adminGiveItem()` (sanitize id, qty 1-999,
  deliverLock + requireOnline + pal.giveItem, log `[KHO ĐỒ]`). Panel: `/api/gameitems` +
  `/api/give/item` (epOk), UI chọn người (select + ô gõ tay) / số lượng / 🔎 tìm / lọc loại,
  tối đa 80 dòng. Confirm dialog của panel là `textContent` → KHÔNG dùng thẻ HTML trong
  chuỗi uiConfirm (đã dính hiện `<b>` thô, sửa). Đã giao thật thành công trên test.
- **08/09** — 🩹 **Hết kẹt "This operation was aborted" vĩnh viễn**: dashboard
  `sftpBridge.withSftpNow` thêm **watchdog 75s** (`conn.destroy()` + reject) — stream SFTP
  câm (hay gặp ngay sau restart server game) làm promise không bao giờ settle → `sftpChain`
  tuần tự KẸT MÃI, mọi give/count sau đều timeout tới khi restart dashboard. Bot
  `requireOnline` thử lại 1 lần sau 3s khi lỗi aborted/timeout (COUNT chỉ đọc, an toàn).
  ⚠️ **Deploy đợt này VPS phải `pm2 restart palworld-dashboard` NGOÀI BotDoMin.**
- **08/09** — 🔬 **Nghiên cứu "pal xài liền không restart" — KẾT LUẬN: BỎ, giữ restart.**
  `DBGPAL` (Debug_CaptureNewMonster_ToServer) SẬP SERVER 2/2 → cấm tuyệt đối trên prod.
  Mổ `CreativeMenu_P.pak` (UE pak V11 + Oodle, parse import map .uasset) tìm ra đường
  GRANTED pal: `GetInitializedCharacterSaveParemter → CharacterManager:CreateIndividual →
  PlayerState:OnCreatedGrantedIndividualHandle_ServerInternal`, dump chữ ký thật; thử
  `GIVEPAL2` trên test: b1/b2 OK, b3 crash native (Lua không dựng được struct out-param,
  pcall vô dụng). main.lua đã TRẢ VỀ bản gốc (không còn GIVEPAL2), code thử + hướng còn lại
  (C++ UE4SS mod / pak tự build) lưu `ue4ss-mod/GHI-CHU-GIVE-PAL-XAI-LIEN.md`.
- **08/09** — 🛡️ **Chống hack sau khi mời người lạ** (server TEST, chưa làm prod):
  `bAllowClientMod=False` trong `ShockPal.ini` (file nguồn sinh PalWorldSettings.ini trên
  image Shockbyte modded); cài **PalDefender 1.9.1** — one-click của Shockbyte bỏ nhầm DLL
  vào `ue4ss/Mods/`, đã dời `d3d9.dll` + `PalDefender.dll` về `Pal/Binaries/Win64/` cạnh
  `PalServer-Win64-Shipping.exe` (UE4SS nạp qua dwmapi.dll nên không đụng nhau); giao pal
  + item vẫn chạy khi PalDefender bật. Config `Win64/PalDefender/Config.json` (whitelist,
  webhook AntiCheats, ban cheater) chủ server tự chỉnh. **Chưa quyết**: khoá cầu nạp/rút
  Dogcoin game↔web (sạp trong game đã gỡ nên có thể khoá cả 2 chiều) — chỉ bàn, chưa code.
- **07/09 (chiều 2)** — 💍 **Shop thêm 38 PHỤ KIỆN + UI 4 nút nhóm + search + ghi chú**:
  cat mới `accessory`; item có field `note` (ghi chú tác dụng, panel sửa được, hiện trên
  card). Icon→code đối chiếu registry save-editor 38/38 khớp (giày AirDash3, chuông Exp
  cấp 3, 2 huy hiệu, 2 bùa hộ mệnh thân, đai/trang phục, 9 gậy chỉ huy AT, 9 bùa DF theo
  hệ, 9 nhẫn hệ - code Elphidran game gõ sai "Dargon", + Nhẫn Huyễn Ảnh/Tin Cậy). Giá:
  giày+chuông 20k · 7 món 50k · còn lại 60k (luật "không ghi giá = 60k"). Web shop bỏ
  cuộn dài: 4 NÚT NHÓM (đếm số món, nhớ nhóm qua F5) + ô 🔎 tìm theo tên LẪN tác dụng
  quét mọi nhóm. Migration cờ riêng `_migItemShopAcc0709` + backfill note cho món cũ.
- **07/09 (chiều)** — 👑 **Bản PAL BOSS thành TUỲ CHỌN trả phí**: mặc định giao bản THƯỜNG,
  tick "Bản PAL BOSS" trong bảng nhận là +`upBoss` (mặc định 10k, panel chỉnh ô 👑;
  checkbox cũ "Giao bản PAL BOSS" đổi nghĩa thành CÔNG TẮC MỞ BÁN). Server chặn: chưa mở
  bán / pal Yakushima không có bản BOSS. Icon riêng `assets/palboss.png` thay 👑 trong UI.
  🎒 **Rương Pal tách 2 phần** "CHƯA NHẬN" (chest+đang giao, mặc định mở) và "ĐÃ NHẬN/ĐÃ BÁN"
  (mặc định đóng) - bấm đề mục đóng/mở, trạng thái lưu localStorage nên **F5 giữ nguyên**.
  palwheeltest 162/162.
- **07/09** — 🐛 **Fix Demon Eye kẹt ĐANG GIAO + chống tái diễn cho MỌI pal**: results.log
  prod báo `ERROR spawn failed BOSS_YakushimaBoss001_Small` - pal collab Terraria không có
  bản `BOSS_`, mà cfg "Giao bản PAL BOSS" gắn prefix cho mọi pal, và message "spawn failed"
  không khớp nhánh nào nên treo 'delivering'. Fix 3 lớp trong palChestClaim: (1) code
  `Yakushima*` khỏi gắn BOSS_ ngay từ đầu; (2) BOSS_ spawn fail → TỰ THỬ LẠI bản thường
  1 lần (pal đặc biệt nào thiếu bản BOSS_ sau này tự lành, khỏi nuôi danh sách); (3) spawn
  fail cả 2 kiểu = mod CHƯA giao gì → TRẢ VỀ RƯƠNG + hoàn phí, hết treo. Audit tĩnh toàn bộ
  291 code trong pals.json với registry save-editor oMaN-Rod: id hợp lệ 291/291, pool không
  con nào thiếu icon, Panthalus disabled đúng như đã loại, chỉ Demon Eye thuộc họ đặc biệt.
  palwheeltest 158/158. Đơn kẹt cũ: panel SUPER → 🎒 rương → ↩️ về rương cho nhận lại.
- **07/09** — 🖼️ 🎯 Chọn Pal gắn icon pal 34px đầu mỗi dòng (kho `/palimage/` theo code,
  `loading=lazy` - 286 hình chỉ tải khi cuộn tới, thiếu hình tự ẩn không vỡ layout).
- **07/09** — 🐾 **Thêm Demon Eye (Mắt Ác Quỷ)** vào pals.json (`YakushimaBoss001_Small`,
  pal collab Terraria, KHÔNG số paldex như Boltmane) → tự vào vòng quay thường (pool 282)
  + 🎯 Chọn Pal giá thường. Icon tải từ paldb (ruột webp, tên .png cho khớp URL client -
  browser render theo magic bytes). palwheeltest 152/152.
- **05/09** — 🩹 Panel: ô nhập (mức thưởng + trần cược TX) chỉ điền khi còn TRỐNG - hết bị
  refresh 3s đè số đang gõ; tab 📜 Log thêm 5 nút chọn mục (hiện 1 mục/lúc, F5 nhớ); bỏ 2
  banner 👁️ view-only (cơ chế chặn vẫn nguyên).
- **04/09 (tối 3)** — 🚀 **Phi Thuyền hiện AI đặt trước chuyến sau** (`nextPlayers` trong
  `spmWebState`, hộp `#spmNext` riêng "Hân đặt 5.000 cho chuyến sau" - bỏ kiểu nhét vào
  `spmMsg` gây chồng chữ). 📜 **Panel thêm tab Log**: gom Lịch sử Big Small / Dò Mìn /
  Leo Thang (chuyển từ tab từng game) + **Lịch sử Phi Thuyền mới** (từ `betHistory`, thêm
  vào `getSpmState`) + 💰 Sổ biến động Dogcoin (chuyển từ tab 🎮) - mỗi mục hiện 30 ván
  có cược. 🎮 **Tab Palworld & Dogcoin gọn lại**: 🎒 rương pal ĐÓNG mặc định sau nút
  "Xem rương pal (N · ⏳ X đang giao)" (`pcToggle`).
- **04/09 (tối 2)** — 🔐 **Phân quyền 2 cổng panel + dọn dẹp**: 🕹️ Can thiệp giá cổ phiếu
  (kéo giá KÍN + nút 💀/🎁 nhắm người) chuyển hẳn sang cổng SUPER (card `epOnly` + route
  `/api/stock/push` chặn `epOk`); cổng ADMIN THƯỜNG chỉ XEM 2 tab 👥 Người chơi + 🎮 Palworld
  & Dogcoin - chặn 1 chỗ bằng `VIEWONLY_PATHS` (27 route ghi: ví/nợ/phát quà/mức thưởng/duyệt
  đơn rút/cấu hình pal/shop item...) trả 403, client khoá bằng CSS `body.viewonly` (chừa ô 🔍)
  + banner 👁️ đầu tab. LƯU Ý: admin thường hết duyệt được đơn rút/giao pal. 🪪 **Mức điểm
  danh/nghiện/thưởng chuỗi cho admin chỉnh** (`dailyCfg()` thay 4 hằng cứng, lưu `_dailyCfg`,
  card ở tab 👥, route `/api/daily/cfg`, áp ngay không restart). 🍀 Gỡ cột "May mắn admin set"
  khỏi bảng ví (banh ngang) + migration `_migClearPalLuckRate0409` xoá % override còn sót -
  tất cả về mặc định; route luckrate giữ lại nếu cần dựng lại. 🧹 Xoá khối dò mìn Discord cũ
  (139 dòng comment) + khối lệnh /domin comment; `.gitignore` thêm `.claude/` + `.dashpid`.
  ✒️ Thay TOÀN BỘ dấu gạch dài "—" bằng "-" ở index/webplay/panel (418 chỗ) theo yêu cầu.
- **04/09 (chiều 2)** — 💎 **Shop thêm 9 viên Đá Thức Tỉnh** (`PalAwakening_<Hệ>`,
  Nước/Sấm/Đất/Cỏ/Lửa/Băng/Rồng/Bóng Tối/Thường — code + tên VN chuẩn paldb) 10k/viên,
  nhóm tiêu hao. Ghép vào DB đang chạy bằng cờ RIÊNG `_migItemShopAwaken0409` — merge tổng
  cũ KHÔNG chạy lại (tránh hồi sinh món admin đã xoá, vd Cung Cơ Khí nếu chủ server đã thay
  bằng Cung Trợ Lực tự thêm). 9 icon webp do chủ server tự bỏ vào `assets/itemimage/`.
- **04/09 (tối)** — 🎲 **Trần cược Big Small 400k, admin chỉnh được**: `txMaxBet()`
  (dbCache `_txMaxBet`, mặc định 400.000, 0 = tắt) — trần tính TỔNG mọi cửa + mọi lần đặt
  của 1 người trong 1 ván (`txBetTotalOf` + `txCapCheck`, chặn kiểu đặt lắt nhắt lách trần).
  Áp cả 3 cửa đặt: web `/api/bet`, Discord modal, nút cược nhanh (ALL IN tự kẹp về phần trần
  còn lại). Panel tab Big Small có ô "Trần cược/người/ván" (`/api/tx/maxbet`); trần hiện trên
  bảng Discord + ghi chú dưới nút cược web (kèm "ván này bạn đã đặt X").
- **04/09 (tối)** — 🛒 **Shop chia 3 mục + admin up hình từ panel**: item có field `cat`
  (weapon/armor/consume, panel chọn bằng select, sai giá trị thì rơi về consume), web render
  theo mục 🗡️ Vũ khí / 🛡️ Giáp / 🧪 Tiêu hao (mục trống tự ẩn); `backfillItemShopCat` điền
  nhóm cho món cũ trong DB mỗi boot (idempotent, tra id trong DEFAULT). 🖼️ **Up hình không
  cần code/deploy**: nút 📷 Up ở từng dòng panel → POST `/api/itemshop/upload` (base64, trần
  600KB, chỉ ảnh, sanitize tên) → `uploadItemImage` ghi `assets/itemimage/` + `ASSETS.add()`
  nạp RAM phục vụ NGAY không restart. Lưu ý: hình up kiểu này nằm NGOÀI git (git pull không
  đụng, nhưng deploy-lại-từ-đầu sẽ mất — thỉnh thoảng gom về repo).
- **04/09** — 🛒 **Shop thêm 12 vũ khí Huyền Thoại** (11 món 45k + Cần Câu Depresso 70k):
  Code chuẩn paldb (Legendary = `_5`; ngoại lệ `LaserMiningTool` chỉ có 1 bản legendary
  không hậu tố, cần câu là `FishingRod_03_2` — `FishingRod_6` chỉ là tên icon), tên tiếng
  Việt theo paldb /vi. `seedItemShopIfEmpty` nay còn GHÉP THÊM món mặc định thiếu vào shop
  đã có trong DB (1 lần theo cờ `_migItemShopWeapons0409`, không đè món admin sửa, không
  hồi sinh món admin xoá). 12 icon webp mới trong `assets/itemimage/`.
- **04/09** — 📒 **Vay nợ siết lại 2 lớp cùng `feePct` (20%)**: (1) **phí cộng NGAY lúc vay**
  — vay X ghi sổ X×1.2 (vay 40.000 ôm nợ 48.000, trần sổ tính cả phí); (2) **lãi kép mỗi ngày
  mốc 00:00 VN trên CẢ CỤC NỢ, KỂ CẢ NỢ ADMIN ghi tay** (trước không lãi) + thông báo réo tên
  ở kênh bảng vay (vòng quét mỗi giờ sẵn có lo phần tự chạy). `adminDebtAdd` accrue nợ cũ trước
  khi cộng khoản mới (không lãi hồi tố); fix `ratePct` undefined ở web + nút "Nợ của tôi";
  đồng bộ text bảng vay/sodu/web/panel. Test vaytest 19/19.
- **03/09 (chiều)** — ⏳ **Cooldown nhận pal 5 phút → 2 phút** (default `claimCd` 300→120 +
  migration 1 lần `_migClaimCd120` sửa cfg đã lưu trong DB; admin đổi tay sau đó thì giữ) và
  **đồng hồ cooldown ai cũng thấy**: banner sẵn có dựng lại từ server nên F5 vẫn đúng, thêm
  endpoint nhẹ `/api/pal/cd` + client poll 15s khi mở trang Hồ sơ (người KHÁC vừa nhận là mình
  thấy ngay), banner ghi rõ quy tắc "X phút/lần". 💸 **Chuyển tiền NHIỀU người 1 lần**: bỏ ô gõ
  tên, hiện TẤT CẢ người chơi thành chip bấm chọn (tự loại chính mình khỏi list), mỗi người nhận
  cùng số tiền — trừ tổng, dòng tổng cập nhật sống; `webTransferMulti` (khử trùng id, chặn
  thiếu tiền/nợ xấu, vẫn 10s/lần chung, tối đa 20 người) + route `/api/transfer/multi`, gộp
  1 thông báo Discord + 1 dòng chat sòng. Test dogmultitest 15/15.
- **03/09 (chiều)** — 🐾 **Xenovader #145 + Xenogard #146 thành pal thường**: bỏ 2 tên khỏi
  `raidOnly` trong `pals.json` → tự vào vòng quay thường (`palWheelNormalPool` 279→281 con)
  + trang 🎯 Chọn Pal (giá customPrice); hình `T_DarkAlien` / `T_WhiteAlienDragon` đã có sẵn
  trong assets. Chúng vẫn KHÔNG nằm trong ô RAID/vòng raid (không phải boss triệu hồi).
  Test palwheeltest 151/151 + verify HTTP trên bot test.
- **03/09** — 🚀 Phi Thuyền đợt 2: **📜 lịch sử 20 lượt cược** (thắng xanh `×m +tiền` / thua đỏ
  `thua hết −cược`, `spmState.betHistory` cap 100, lộ 20 qua `spmWebState`); **đặt cược CHUYẾN SAU**
  khi đang bay/nổ (`spmQueueBet` trừ tiền ngay → `spmResetRound` áp vào chuyến mới; nút luôn bấm
  được, có **huỷ đặt trước hoàn tiền** `spmCancelNext` + route `/api/spm/cancelnext`; đơn đặt trước
  vẫn nằm `_spmBets` để restart refund); **bảng kết quả Discord** kiểu bảng Dò Mìn (`spmBoard`,
  admin chọn kênh ở panel tab Phi Thuyền, `/api/spm/board/start|stop`, khoe 10 lượt gần nhất
  💰 thắng x… được … / 💥 NỔ x… thua hết … kèm số dư, nút web_pin, tự nối lại sau restart).
- **28/08 (tối)** — 🚀 **PHI THUYỀN** (crash game kiểu Spaceman, thuần web): vòng chơi CHUNG
  (chờ cược 8s → bay số nhân tăng dần `m=e^(growth·s)` → nổ → lặp), 1 loop `spmTick` 250ms.
  Điểm nổ chốt KÍN lúc cất cánh (`spmDrawCrash`, house edge baked-in, kẹp `maxMult`); client
  vẽ số nhân theo giờ server, RÚT thì SERVER tính hệ số (chống gian lận). Cược trừ trước, rút
  cộng `cược×hệ số`, nổ = mất; refund `_spmBets` khi restart. Auto-cashout đúng mốc. Cấu hình
  panel tab RIÊNG (edge/tốc độ/min-max/maxMult/cửa) + **ép điểm nổ** (nhà cái can thiệp ván
  tới, cổng SUPER). Mặc định edge **6%** · tối đa **200x** · cược **15k** (đều chỉnh panel).
  💸 **CHUYỂN/RÚT DOGCOIN LÊN WEB** (tab HỒ SƠ mới): chuyển ví↔ví (đã có Lộc lá) + **rút vào
  game** (`webRutGame`, giveItem DogCoin) + **nạp ra web** (`webNapGame`, takeItem, cộng đúng
  `took`) — xử lý THẲNG web→dashboard/SFTP (không qua lệnh Discord, đỡ chết bot), dùng chung
  khoá giao đơn, trần **500k/lần** (`WITHDRAW_MAX_PER_REQUEST`).
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
