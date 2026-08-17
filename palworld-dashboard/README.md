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

## Luồng tiền Dogcoin (đang chạy — làm lại 17/08/2026, TỰ ĐỘNG cả 2 chiều)

**ADMIN liên kết tên nhân vật** với Discord ID ở panel bot (cổng 3001, tab
🎮 Palworld & Dogcoin, card "🔗 Liên kết tên trong game") — lưu `userData.ingameName`
trong `database.json` của bot, API `/api/pal/set-name`. Người chơi KHÔNG tự đặt được:
tự đặt là tự nhận tên nhân vật người khác rồi bấm 💬 rút trộm túi họ. Tên được lọc về
ASCII in được, khớp với `normalizeName` của mod. KHÔNG dùng hệ liên kết SteamID/REST nữa.

### Discord → game ("Chuyển vào game", `rut_modal`)
Bấm nút → trừ ví Discord **ngay** → gọi `/api/give-item`.
- Mod trả `OK` → xong.
- Mod trả `player not found` → CHẮC CHẮN chưa giao → **hoàn ví ngay**.
- Timeout/lỗi lạ → KHÔNG tự hoàn (có thể đã giao) → tạo đơn cho admin đối chiếu `results.log`.

### Game → Discord ("Chuyển ra Discord", `nap_modal`)
Bấm nút → gọi `/api/take-item` **trừ item trong game TRƯỚC** → chỉ khi mod xác nhận
`took` đúng số mới cộng ví.
- Mod trả `ERROR` bất kỳ (not found / `khong du` / trừ lệch tự hoàn) → CHẮC CHẮN trong
  game không mất gì → chỉ báo người chơi, không tạo đơn.
- Timeout → không rõ đã trừ chưa → đơn cho admin: item ĐÃ trừ thì duyệt (cộng ví),
  chưa trừ thì từ chối.

### Ba nguyên tắc an toàn tiền (đừng sửa nếu chưa hiểu vì sao)
1. **Chống giao 2 lần:** đánh dấu `processing` TRƯỚC khi gọi. Bot crash giữa chừng thì
   yêu cầu nằm lại `processing` và **không tự thử lại** — đẩy admin quyết. Thà chậm còn hơn
   nhân đôi tiền.
2. **Timeout ≠ thất bại:** mod có thể đã giao xong nhưng phản hồi về muộn.
3. **Không tự hoàn tiền khi lỗi:** lỗi phổ biến nhất là offline. Hoàn tiền do admin bấm.

### Giới hạn
- Discord → game: tối đa **2000/lần**.
- Game → Discord: **không giới hạn** (người chơi chỉ lấy được số họ thật sự có).
- **Chỉ đếm Dog Coin TRONG TÚI**, không tính hòm/kho ở căn cứ — hàm đếm hòm mà game
  expose chỉ chạy phía client.

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
