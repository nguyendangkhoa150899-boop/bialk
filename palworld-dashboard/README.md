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

## 🧭 Đọc nhanh — trạng thái hệ thống hôm nay (cập nhật 20/08/2026)

Cái gì ĐANG chạy và cái gì đã tắt — để khỏi đi tìm code của thứ không còn tồn tại:

| Thứ | Trạng thái |
|---|---|
| Cầu Dogcoin 2 chiều (Discord ↔ game) | ✅ **TỰ ĐỘNG**, bắt buộc nhân vật online, trần rút 20.000/lần |
| REST API Palworld (kick/ban/xem người chơi) | ❌ **TẮT** (server test không bật) → các endpoint cần REST trả 503 |
| Liên kết Discord ↔ nhân vật | ✅ **admin đặt tay ở panel**; ❌ hệ SteamID/REST đã ngưng |
| Tặng pal tự động (give-pal) | ❌ **ĐÃ GỠ** — game không cho, admin tạo tay bằng CreativeMenu |
| Shop pal trên Discord (mua + gacha + bán lại) | ✅ chạy |
| Mod Lua UE4SS + cầu SFTP | ✅ chạy (đường sống duy nhất để tặng/trừ item) |
| PalSchema (máy nghiền không rớt lõi) | ✅ chạy · Silvance no-drop dùng **pak** vì PalSchema chịu thua Lv70+ |
| Bảng 📊 thống kê người chơi | ❌ **ĐÃ BỎ** 19/08 (dữ liệu `_pstats` vẫn đếm ngầm) |
| Blackjack | ❌ thay bằng 🎡 Vòng quay nhóm 2 tầng |
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

**🦀 Bầu Cua** (Discord, `bcState`) — 6 con Hổ/Cua/Tôm/Cá/Gà/Nai. Mặc định `status:'stopped'`
— **cố tình**: để `'betting'` thì bảng cũ còn sót trong Discord vẫn nhận cược, trừ tiền thật
rồi không bao giờ trả (tiền bốc hơi im lặng).

**📅 Điểm danh & 💉 Nghiện** (logic dùng chung Discord + web) — điểm danh ngày **400**
(reset 00:00 giờ VN, có lịch tháng), `/nghien` **100** mỗi **1 tiếng**. **Thưởng chuỗi:** cứ
**2 ngày điểm danh LIÊN TIẾP** = 1 gói **800** ghi vào sổ, tự bấm nhận, mỗi lần bấm 1 gói,
gói dồn được và **chuỗi đứt sau đó cũng không mất gói đã ghi**. Chuỗi đếm theo **ngày thật**
(`streakRun`) nên sang tháng không đứt oan; người điểm danh từ bản cũ được **tự bù**
(`streakTopUp`) khi mở trang, `streakRunPaid` chống bù trùng. Lụm nghiện **từ web** mới đăng
công khai vào kênh; gõ `/nghien` trên Discord chỉ có lời đáp riêng (fix 2 tin trùng 19/08).

**🧧 Lộc lá** — chuyển Dogcoin giữa người chơi trên web, có đăng công khai.

**🐾 Shop pal** (Discord) — tự chọn **6.000** / quay ngẫu nhiên **2.000** (pool paldex ≥ 80,
trừ Xenolord/Hartalis/Blazamut Ryu). Mọi pal shop: **4 sao, IV 100 cả 3, 4 passive + 1 linh
hồn 60%**. Quay random thì **biết trúng gì rồi mới chọn** passive, hoặc **bán lại 1.000**
(đơn tự đóng, admin khỏi giao). Passive **Cây Thế Giới không bán kèm** (so khớp sau khi bỏ
dấu tiếng Việt nên "Thần Hủy Diệt" hay "than huy diet" đều bắt được). Bot **không tự spawn
pal** — admin tạo tay bằng CreativeMenu rồi bấm hoàn thành trên panel (lý do: xem mục
"Những thứ đã thử và THẤT BẠI").

### Slash command đang bật
`/sodu` · `/diemdanh` · `/nghien` · `/chuyentien <người> <số tiền>`.
`/addtien` `/trutien` đã **xoá** (nhiều người có quyền Administrator Discord ≠ được đụng ví
— cộng/trừ tay giờ CHỈ ở panel). `/domin` còn nguyên trong code nhưng **comment lại** (chơi
web mượt hơn, không dính deadline 3 giây).

### Web chơi (cổng 3002)
Đăng nhập bằng **Discord ID + PIN** (`webPin`, lấy bằng nút 🌐 trên bảng Big Small trong
Discord). Sai quá nhiều → chặn IP 10 phút; token phiên 30 ngày, đăng nhập lại thu hồi máy cũ.
API: `/api/login` `/api/state` `/api/chat` `/api/players` `/api/transfer` ·
`/api/daily/{state,claim,streak,nghien}` · `/api/wheel/{state,ready,unready,spin}` ·
`/api/bet` · `/api/mines/{state,dismiss,table,start,reveal,cashout,lucky}` ·
`/api/stairs/{state,dismiss,table,start,step,cashout,lucky}`.

### Panel admin (1508 SUPER / 1234 thường)
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

## Bot Discord (BotDoMin) — nhật ký cập nhật

> **Quy ước:** mỗi lần thêm/sửa tính năng của bot thì THÊM 1 dòng vào đầu danh sách này
> (ngày + tóm tắt). Chi tiết cách làm/vì sao thì xem message của commit tương ứng.

- **21/08/2026 — Nổ hũ 🏆 hạ 2% → 1% ở CẢ BA trò.** Ô 🏆 của hai bàn quay hộp may mắn
  còn `p: 0.01`, `POT_HIT_RATE` (quay Pal) còn `0.01`; **phần dư dồn vào ô hụt 🍂** như mọi
  lần hạ trước (mìn 22% → 23%, thang 23% → 24%) nên tổng mỗi bàn vẫn đúng 100% — kiểm bằng
  ca "tổng xác suất 2 bàn quay = 1". Lưu ý khi viết test: lát 🏆 giờ chỉ còn `[0.99, 1.0)`,
  mốc `0.985` cũ **không còn ép ra jackpot nữa** (rơi vào hụt) — dùng `0.995`.
- **21/08/2026 — Vé vòng quay 1.500/2.000/2.500 → 2.000/2.500/3.000.** `WHEEL_STAGE1`
  (15 nan, mỗi giá 5 nan) + `WHEEL_MAX_TICKET = 3000`; đổi kèm bảng màu nan `FILL1` và
  ngưỡng chữ tối (nan vàng giờ là 3.000), chữ mời vào bàn, chú thích panel.
- **21/08/2026 — "Mua cỏ rồi vẫn thấy 1 cỏ" KHÔNG phải bug tiền — là UI nói dối.**
  Test HTTP đầu-cuối chứng minh server luôn đúng: tick = trừ đúng `cược + 20%` và giấu
  **2** ô 🍀. Nguyên nhân thật: ô tick là control của **ván sau**, nhưng web để nó bấm
  được giữa ván (và trình duyệt còn tự khôi phục trạng thái tick sau F5) → người chơi
  tick giữa ván rồi tưởng ván đang chạy có 2 cỏ. Sửa: `current()` đẩy thêm
  `luckyTotal`/`luckyLeft`/`extraLucky` (**chỉ số lượng, tuyệt đối không lộ `g.lucky`** —
  lộ vị trí ô 🍀 là lộ ô an toàn), `g.luckyTotal` chốt lúc start; web **khoá ô tick khi
  đang có ván** và đổi nhãn thành "Ván này giấu N ô cỏ may mắn · còn M ô chưa mở".
- **21/08/2026 — SÀN CƯỢC 200/ván cho 2 minigame + nổ hũ xong hũ về mồi 1.500.**
  `MIN_BET = 200`: cược dưới mức này thì `start` của **cả Dò Mìn lẫn Leo Thang** trả lỗi
  "Cược tối thiểu 200" — không tạo ván, không trừ ví, không đụng hũ. ⚠️ Bản đầu làm **sai
  ý**: cho cược 1 xu nhưng "không được ăn hũ" (`POT_MIN_BET` + `potEligible`); chủ server
  chốt lại là **BUỘC đặt tối thiểu 200**, nên cửa xét đó **gỡ hẳn** — giờ mọi ván đều nuôi
  và ăn hũ bình thường, không còn nhánh thông báo "cược dưới 200 nên chưa ăn được hũ".
  `minBet` đẩy xuống web + panel từ **một nguồn** (`webMinesApi/webStairsApi.minBet` và
  `ctx.getPot`), web chặn trước cho báo lỗi tử tế, ô cược mặc định lên 200, nút x2/MAX
  không kéo xuống dưới sàn. Nổ hũ xong hũ **không về 0** mà về `POT_SEED = 1500`; hũ mới
  tạo cũng được mồi 1.500. Mồi 1.500 (không phải 3.000) có lý do kinh tế: mồi là **tiền nhà
  cái bỏ ra mỗi lần nổ**, mồi càng cao thì hũ càng bị ghim quanh mức mồi và không bao giờ
  leo lên con số đủ hấp dẫn.
- **20/08/2026 — 🏆 HŨ NUÔI: mỗi trò MỘT HŨ RIÊNG, chung một tỉ lệ nổ.** Ba hũ
  `_pots = { mines, stairs, gacha }`, nổ ở trò nào ăn hũ trò đó (2 hũ kia không suy suyển).
  Nuôi: mỗi ván/lượt quay trích **5% tiền cược**, **KHÔNG thu thêm của người chơi** — cược
  100 trừ đúng 100, khoản nuôi là **nhà cái bao** (lấy từ phần RTP; hệ quả: Dò Mìn RTP 0.95
  trả hết 5% vào hũ ≈ nhà cái về 0 lợi nhuận, Leo Thang còn ~3%). Tự trích **dừng ở trần
  20.000**, nhưng **admin nạp tay thì vượt trần được** (chỉ chặn âm). **Một tỉ lệ nổ duy
  nhất `POT_HIT_RATE` = 1%** (hạ dần 3% → 2% ngày 20/08 → 1% ngày 21/08) = ô 🏆 của 2 bàn quay: minigame trúng 🏆 = trần hũ của ván +
  NGUYÊN hũ trò đó; quay Pal mỗi lượt bốc 1% ăn hũ gacha. Nổ ở đâu báo kênh đó. Panel tab
  💣: khu **🏆 Hũ nuôi** liệt kê 3 hũ, mỗi hũ một ô nhập + nút nạp/rút riêng (khung dựng
  MỘT lần rồi chỉ cập nhật số — vẽ lại cả khối là cuốn mất số admin đang gõ, panel refresh 3s)
  (`/api/pot/add` nhận `{key, amount}`). Tiền hũ cũ của bản "1 hũ chung" tự dồn sang hũ
  Dò Mìn khi khởi động. Số hũ hiện **cạnh tên game** trong khung 💣/🪜 của web (nhãn vàng "🏆 HŨ 11.298",
  tươi theo nhịp 2 giây qua `/api/state`) và trên **tiêu đề bảng 🔄 DOGCOIN & SHOP PAL**
  trong Discord (hũ quay Pal, bảng tự vẽ lại mỗi lượt quay).
- **20/08/2026 — Chốt cuối tiền thưởng Dò Mìn/Leo Thang:** TỰ LỰC ĂN ĐỦ theo tỉ lệ
  tổ hợp, KHÔNG trần (mở hết bàn 12-13 mìn = ×4,9 triệu lần cược, xác suất 1/5,2 triệu —
  chủ server chấp nhận sau khi nghe cảnh báo). Bàn quay 🍀 Dò Mìn: lì xì 46% (+30% cược) · hụt 23% · khiên 15% · đào 15% · hũ 1%
  (Leo Thang giữ: rocket 15 · khiên 20 · lì xì 40 · hụt 24 · hũ 1). Trần CHỈ áp 3 đường may mắn: nổ hũ 🏆
  50/100/200 (3/4/5 mìn), khiên/⛏️ ĐÃ DÙNG 100/300/500; 6+ mìn và Leo Thang ×2000.
  Khiên nhận mà chưa dùng vẫn tính tự lực. UI thanh hệ số tự gộp dải mốc trùng nhau
  ở cuối bảng thành một ô (nếu có). Lưu ý: trần tuyệt đối từng được thêm rồi GỠ 2 lần
  trong ngày theo lệnh chủ server — đừng thêm lại nếu không có lệnh mới.
- **20/08/2026 — Fix khiên 🛡️ + cỏ 🍀 thành hàng MUA THÊM.** Khiên giờ CỘNG DỒN cả 2 game
  (trước là boolean: đang cầm khiên mà hộp ra khiên nữa là mất trắng — "khiên vô dụng");
  UI hiện số khiên đang cầm. Dò Mìn về mặc định **1 ô 🍀/ván**, thêm checkbox
  **mua thêm 1 cỏ = phí 20% tiền cược** (đặt 100 cần 120; phí vào net lịch sử, vé treo
  hoàn cả phí khi restart).
- **20/08/2026 — Nổ hũ 🏆 hạ 5% → 3% → 2%** cả 2 bàn quay hộp may mắn (21/08 hạ tiếp còn 1%); phần dư dồn vào
  ô hụt 🍂 — tổng mỗi bàn vẫn đúng 100%. Lời mời hộp 🍀 giờ hứa
  ĐÚNG số sẽ nhận (trần theo số mìn + hũ nuôi), trước đây treo ×2000 nên ván 3 mìn cược
  1.800 ghi 3.600.000 mà thực nhận 100.270.
- **20/08/2026 — Vay nợ: PHÍ VAY 5%** ghi thẳng vào nợ lúc vay (vay 4.000 → ghi sổ
  4.200, nhận đủ 4.000). Chống spam vay-trả-vay: trả sạch mở lại hạn mức ngày, nhưng
  mỗi vòng lặp tốn 5% phí — vay 4.000 trả liền là mất 200.
- **20/08/2026 — NERF thưởng giữa (người chơi ăn chắc dễ quá):** Dò Mìn 24 ô → **25 ô**
  (lưới 5×5) + RTP 1.0 → **0.95**; Leo Thang RTP 0.95 → **0.92**. Hệ số khúc giữa giảm
  rõ (vd 3 mìn mở 8 ô: x3.61 → x3.21; mở 15 ô: x24.1 → x18.2). Các mốc CỐ ĐỊNH giữ
  nguyên: trần nổ hũ/khiên, mốc ép tay 2 lửa tầng 9/10 (11.86/14.86). Lưu ý: /domin
  bản Discord (đang tắt) hết đường bật lại vì 25 ô + nút DỪNG = 26 nút > trần Discord.
- **20/08/2026 — Dò Mìn: 2 ô 🍀/ván (mỗi ô quay 1 lần) · lì xì 💰 20% → 30% cược (CẢ
  Leo Thang) · trần may mắn theo bậc** — chặn farm bằng ván dễ, hai trần riêng:
  NỔ HŨ 🏆 (`jackpotCapOf`): 3 mìn ×50 · 4 mìn ×100 · 5 mìn ×200 · 6+ giữ ×2000;
  THẮNG CUỐI VÁN khi trợ giúp ĐÃ DÙNG (`assistCapOf`): 3 mìn ×100 · 4 mìn ×300 · 5 mìn ×500 ·
  5+ giữ ×2000. Leo Thang giữ ×2000 cho cả hai.
- **20/08/2026 — 📒 VAY NỢ Dogcoin (toàn nút bấm, không lệnh).** Bảng trong kênh Discord
  (đặt từ panel tab 👥) với 3 nút: 💰 Vay (tối đa 4.000/ngày, tổng nợ vay ≤ 12.000, lãi kép
  20%/ngày DỪNG ở trần) · 💳 Trả nợ (đủ số dư mới trả, bỏ trống = trả hết) · 📄 Nợ của tôi.
  Thân bảng tự hiện sổ nợ + khối 🚨 DANH SÁCH NỢ XẤU riêng, tự vẽ lại sau mỗi biến động,
  bot restart tự bám lại bảng cũ. Nợ THƯỜNG không bị siết gì. Nợ xấu do ADMIN GẮN TAY
  (nút ⚠️ ở tab 👥) — dính nợ xấu mới bị: cấm vay thêm + chặn chuyển tiền cho người khác
  (/chuyentien + web) + chặn chuyển vào game + trích 50% tiền điểm danh/nghiện/thưởng
  chuỗi tự trả nợ (trả nợ vay trước vì có lãi). Gắn/gỡ/thoát nợ xấu đều DM người chơi
  + ĐĂNG CÔNG KHAI vào kênh bảng vay; **trả sạch nợ là nhãn tự bay**, không cần admin gỡ.
  Admin ghi nợ tay: không lãi, không trần, số âm = giảm. Giọng văn bảng/tin nhắn viết
  kiểu bông đùa cho server bạn bè. Lãi đẻ mỗi ngày + gắn/thoát nợ xấu đều RÉO TÊN (tag)
  công khai ở kênh bảng vay, và luôn nói "HỆ THỐNG" chứ không nói admin (đỡ bị chửi).
  `/sodu` hiện cả nợ vay + nợ admin + nhãn nợ xấu, kèm nút 💳 Trả nợ vay và 🧾 Trả nợ
  admin (trả riêng từng khoản) ngay tại chỗ.
  Web: card 📒 Nợ ở trang điểm danh (chỉ hiện khi đang nợ) + nút trả. Test vaytest.js 51/51.
- **19/08/2026 — Vòng quay BUFF vòng hệ số:** bỏ đám nan lẻ ×1.1–1.4 (quay ra +200 nhìn
  chán), sàn lên ×1.5, thêm bậc ×3/×5. Phân bố cuối: ×1.5×9 · ×1.8×6 · ×2×5 · ×2.5×3 ·
  ×3×2 · ×5×1 · ×10×1.
- **19/08/2026 — Vòng quay: giá vé 1.000/1.500/2.000 → 1.500/2.000/2.500**, vòng hệ số
  thêm 3 nan ×1.3 (24 → 27 nan, phải chia hết cho 3 vì 3 mũi tên lệch 9 nan).
- **19/08/2026 — Fix xí ngầu lịch sử xếp dọc:** lịch điểm danh dùng trùng class `.dd` với
  hàng xúc xắc. Web UI: xí ngầu lịch sử nằm ngang, tắt hero chân trang, ép mỏng header/nav.
- **19/08/2026 — Big Small: ván 50 → 40 giây** (đặt cược còn 25 giây, nặn giữ nguyên 15).
- **19/08/2026 — Cân lại hộp may mắn 🍀:** khiên 🛡️ 25% → 20%, lì xì 💰 (hoàn 20% cược)
  35% → 40%; giữ nguyên đào/tên lửa 15%, hụt 20%, nổ hũ 5%. Áp cả Dò Mìn lẫn Leo Thang.
- **19/08/2026 — Fix NỔ HŨ 🏆 ăn x2 (Dò Mìn + Leo Thang).** Trúng hộp 🏆 giờ CHỐT VÁN
  ngay: trả hũ (min của giải cao nhất ván đó và trần x2000 cược) rồi kết thúc — trước đây
  ván vẫn chạy tiếp nên người chơi bấm dừng được trả THÊM lần nữa. Client không phải sửa
  (đã sẵn xử lý `jackpot`/`top` từ hộp may mắn).
- **19/08/2026 — Gacha pal: nút BÁN LẠI 1.000.** Quay random (2.000) trúng con không ưng
  thì bấm 💰 Bán lại ngay cạnh nút chọn passive: hoàn 1.000, đơn tự đóng (admin khỏi giao),
  DM báo admin, panel hiện "💰 Bán lại". Chỉ bán được khi CHƯA chốt passive/linh hồn.
- **19/08/2026 — Nạp/rút Dogcoin: cổng BẮT BUỘC ONLINE** (xem mục "Luồng tiền" ở trên).
  Kèm vá mod `main.lua` trả `player not found (COUNT stale)` thay vì lỗi Lua thô.
  (Loạt commit trước đó về nút chuyển trên WEB + tự đối chiếu khi timeout đã REVERT —
  chủ server chọn giữ luồng Discord + đơn cho admin.)
- **19/08/2026 — Điểm danh: bỏ bonus đủ tháng (5.000), thay bằng THƯỞNG CHUỖI.** Cứ 2 ngày
  điểm danh LIÊN TIẾP = 1 gói 800, gói dồn được, mỗi lần bấm ô "Đủ chuỗi 2" nhận 1 gói.
  Chuỗi tính theo ngày thật (`streakRun`) nên sang tháng không đứt; người điểm danh bằng
  bản cũ được tự BÙ gói khi mở trang (`streakTopUp`).
- **19/08/2026 — /nghien hết ra 2 tin trùng.** Gõ lệnh trên Discord chỉ còn lời đáp riêng;
  tin công khai "vừa lụm 100..." chỉ đăng khi điểm danh qua WEB (`claimNghien(uid, announce)`).
- **19/08/2026 — Đơn pal chỉ hiện TÊN pal**, bỏ mã code (`Sootseer CandleGhost` → `Sootseer`)
  ở mọi chỗ: tin trúng thưởng, DM admin, panel.
- **19/08/2026 — Bỏ bảng 📊 thống kê người chơi** (cả bảng Discord lẫn tab panel) theo yêu cầu
  chủ server. `_pstats` vẫn đếm ngầm; muốn dựng lại thì lục git history (`getStatsBoardData`...).
- **19/08/2026 — Đổi tên Tài Xỉu → Big Small** (nút BIG/SMALL, CHẴN/LẺ/BÃO giữ tiếng Việt),
  thêm điều khoản lúc đăng nhập web.
- **19/08/2026 — 🎡 Vòng quay 2 tầng bản v4:** vòng VÉ miễn phí (không cần màu), vòng HỆ SỐ
  chỉ quay khi đủ người + cả bàn đủ vé, khóa lượt ngay khi về quay (bịt lỗ câu giờ).
- **Đang chờ:** hình pal cho tin trúng gacha — đã đo xong (177 pal, CDN paldb có 176 hình),
  cách làm + code mẫu nằm ở scratchpad `pal-image-prototype.md`; chờ tải ảnh về `assets/pal/`.

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
