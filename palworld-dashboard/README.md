# Palworld Admin Dashboard

Bảng điều khiển web cho admin quản lý server Palworld từ xa **không cần vào game**: quản lý người chơi, điều khiển server, và tặng item / pal (kèm sao, IV, soul %, passive skill) cho người chơi đang online.

> **Tài liệu này viết để người/Claude khác tiếp nhận và phát triển tiếp.** Đọc hết phần "Kiến trúc & cơ chế" trước khi sửa — hệ thống có một mắt xích không hiển nhiên (mod Lua UE4SS + cầu nối SFTP) mà nếu không hiểu sẽ sửa sai.

---

## ⚠️ Bảo mật — ĐỌC TRƯỚC KHI ĐẨY LÊN GITHUB

- File `server/.env` chứa **mật khẩu thật** (SFTP, admin password của Palworld server, mật khẩu dashboard). Đã có `.gitignore` loại nó ra. **Tuyệt đối không xóa dòng `.env` trong `.gitignore`, không commit `.env`.**
- Nếu lỡ đẩy `.env` lên GitHub (nhất là repo public), phải coi như toàn bộ mật khẩu đã lộ → **đổi ngay** AdminPassword trong panel Shockbyte, đổi mật khẩu SFTP, đổi `DASHBOARD_PASSWORD`.
- Khi mang về máy khác: copy `server/.env.example` thành `server/.env` rồi điền lại giá trị thật (xem phần Cấu hình).
- `DASHBOARD_PASSWORD` mặc định là `changeme` — đổi trước khi mở dashboard ra internet.

---

## Cấu trúc thư mục

```
palworld-dashboard/
├── server/                  # Backend Node.js (Express)
│   ├── src/
│   │   ├── index.js         # Express app + tất cả route API
│   │   ├── palworldClient.js # Gọi REST API chính thức của Palworld (info/players/kick/ban/...)
│   │   ├── sftpBridge.js    # Cầu nối SFTP: ghi lệnh give-item/give-pal vào queue.txt của mod Lua
│   │   ├── dashboardAuth.js  # HTTP Basic Auth cho chính dashboard
│   │   └── validate.js      # Kiểm tra input (số nguyên, không âm, giới hạn) chống crash server
│   ├── .env                 # Cấu hình + secrets (KHÔNG commit)
│   └── .env.example         # Mẫu cấu hình
├── public/                  # Frontend (HTML/CSS/JS thuần, không cần build)
│   ├── index.html
│   ├── app.js               # Logic UI
│   ├── style.css
│   └── passives.js          # Dữ liệu 114 Pal passive (tên tiếng Việt + ID + hiệu ứng + rank)
├── ue4ss-mod/
│   └── GiveGoldCommand/Scripts/main.lua  # Mod Lua CHẠY TRÊN SERVER PALWORLD (bản gốc để sửa)
├── tools/                   # Script deploy/test qua SFTP (dùng chung .env của server)
│   ├── config.js            # Đọc cấu hình SFTP từ server/.env
│   ├── upload.js            # Đẩy main.lua lên server + bật mod trong mods.txt
│   ├── givepal.js           # Test give-pal trực tiếp (không qua dashboard)
│   ├── giveitem.js          # Test give-item trực tiếp
│   ├── list.js / cat.js     # Duyệt / đọc file trên server qua SFTP
└── README.md
```

---

## Kiến trúc & cơ chế (QUAN TRỌNG)

Hệ thống có **hai đường** riêng biệt tới server Palworld:

### 1. REST API chính thức (cho quản lý server/người chơi)
Palworld Dedicated Server có sẵn REST API (bật bằng `RESTAPIEnabled=True`). `palworldClient.js` gọi thẳng qua HTTP Basic Auth. Hỗ trợ: `info`, `players`, `announce`, `kick`, `ban`, `unban`, `save`, `shutdown`. **Đây là toàn bộ những gì API chính thức làm được — nó KHÔNG có lệnh give item/pal.**

### 2. Mod Lua UE4SS + cầu nối SFTP (cho give item/pal)
Vì REST API không give được item/pal, phần đó đi đường khác:

```
Dashboard (browser) → POST /api/give-pal → sftpBridge.js
   → ghi 1 dòng lệnh vào file queue.txt trên server (qua SFTP)
mod Lua GiveGoldCommand (chạy trong game qua UE4SS)
   → polling queue.txt mỗi 2 giây → đọc lệnh → gọi hàm game → ghi kết quả vào results.log
sftpBridge.js đọc results.log để lấy kết quả trả về dashboard
```

**Vì sao dùng file queue chứ không phải RCON/console?**
- RCON của Palworld chỉ nhận bộ lệnh cố định, trả "Unknown command" cho lệnh custom → không dùng được.
- Panel Shockbyte không có ô nhập console.
- → Giải pháp chắc chắn hoạt động: mod Lua tự polling một file, dashboard ghi file đó qua SFTP.

**Mod Lua nằm ở đâu trên server:** `Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/`. Server này là **bản Windows chạy qua Wine trên container Linux** của Shockbyte, UE4SS đã được cài sẵn (qua mod installer của panel). `queue.txt` và `results.log` sinh ra trong thư mục mod đó. Mod **tự dò** thư mục của chính nó (thử lần lượt các đường dẫn ứng viên tương đối + đường dẫn Wine cũ) nên chuyển host không cần sửa mod — xem dòng `baseDir=...` trong `UE4SS.log`/`results.log` để biết nó chọn đường nào.

> ⚠️ **Nếu chuyển sang host Linux:** UE4SS **KHÔNG chạy** với bản Palworld server Linux native. Bắt buộc host phải chạy **bản Windows server qua Wine/Proton** (như Shockbyte đang làm) thì mod give item/pal mới hoạt động. Bản Linux native chỉ dùng được phần REST API (quản lý player). Khi đổi host, cập nhật trong `server/.env`: `PALWORLD_HOST/PORT`, `SFTP_HOST/PORT/USERNAME/PASSWORD`, và `SFTP_MOD_PATH` (tìm prefix mới bằng `cd tools && node list.js "/"`).

### Cơ chế give-pal (đã kiểm chứng thực tế trong game)
Mod spawn pal ra thế giới gần player rồi "bắt" (`PalCaptureSuccess`) vào cho player đó. Trước/sau khi bắt, ghi thẳng vào struct dữ liệu của pal:
- **Số sao:** `SaveParameter.Rank` (int, 0-255). **Quan trọng: số sao hiển thị = Rank − 1.** Rank 0 và 1 đều hiện 0 sao; Rank 5 = 4 sao (max hiển thị). Dashboard cho nhập 0-255 và gửi thẳng (không +1). *(Xem lịch sử: ban đầu tưởng nhầm cần map, sau xác nhận CreativeMenu cũng cho nhập raw tới 255.)*
- **IV (Talent):** `Talent_HP`, `Talent_Melee`, `Talent_Shot`, `Talent_Defense` (int, 0-255; vanilla max 100, nhưng field nhận tới 255 như CreativeMenu).
- **Soul enhancement %:** `Rank_HP`, `Rank_Attack`, `Rank_Defence` (spelling Anh-Anh!), `Rank_CraftSpeed` (int, 0-255). **Mỗi rank = +3% → 255 rank = +765%** (khớp max của CreativeMenu). Dashboard cho nhập % (0-765), backend quy đổi `rank = round(%/3)`.
- **Passive skill:** ghi thẳng vào mảng `SaveParameter.PassiveSkillList` (TArray<FName>). **KHÔNG dùng hàm `AddPassiveSkill`** — hàm đó chạy không lỗi nhưng KHÔNG có tác dụng thật (đã test kỹ). Cách đúng: `list:Empty()` rồi `list[list:GetArrayNum()+1] = FName(id)` cho từng passive. Phải ghi cả `SaveParameter` lẫn `SaveParameterMirror`, rồi gọi `OnRep_SaveParameter()`. Ghi ở CẢ pre-capture và post-capture (delay 1s) vì `PalCaptureSuccess` tạo lại pal từ bản copy.

Mọi thay đổi struct phải ghi vào **cả `SaveParameter` và `SaveParameterMirror`** rồi gọi `parameter:OnRep_SaveParameter()` để game đồng bộ.

### Tra cứu ID item / pal / passive
- **Item ID & Species (pal) ID:** tra trên https://paldb.cc — mỗi trang item/pal có field "Code" là ID nội bộ (vd Gold Coin = `Money`, Dog Coin = `DogCoin`, pal Lamball = `SheepBall`, Anubis = `Anubis`). Species ID KHÔNG phải lúc nào cũng trùng tên hiển thị (Lamball → `SheepBall`) — spawn sai ID sẽ báo "spawn failed".
- **Passive ID:** đã có sẵn trong `public/passives.js` (114 cái, map tên tiếng Việt → ID). Không cần tra thủ công.

### Định dạng dòng lệnh trong queue.txt
```
ITEM <playerName> <itemId> <quantity>
PAL2 <playerName> <speciesId> <level> <rank> <ivHp> <ivMelee> <ivShot> <ivDef> <soulHp> <soulAtk> <soulDef> <soulWork> <gender> <lucky> <passiveCsv>
PAL  <playerName> <speciesId> <level> <rank> <ivHp> <ivMelee> <ivShot> <ivDef> <soulHp> <soulAtk> <soulDef> <soulWork> <passiveCsv>   (format cũ, mod vẫn hiểu)
```
- **PAL2** (dashboard hiện dùng): mọi field số bắt buộc có mặt; field không đặt (giữ random của game) gửi bằng `-`. `gender`: 0 = random, 1 = đực, 2 = cái. `lucky`: 0/1 (set `IsRarePal`). Nếu mod trên server còn bản cũ, PAL2 sẽ trả `ERROR bad line` → chạy `tools/upload.js` + restart server.
- `passiveCsv`: các ID passive cách nhau bằng dấu phẩy, KHÔNG có khoảng trắng (vd `Legend,WorldTree_ATK,Rare`).
- Tên player khớp theo hậu tố (`name:sub(-#playerName) == playerName`) vì tên trong engine có ký tự ẩn ở đầu.
- Dashboard có thể ghi **nhiều dòng một lượt** (tặng nhiều player cùng lúc) — `sftpBridge.js` đợi đủ số dòng kết quả "chốt" (OK/ERROR) rồi tách kết quả theo tên player.
- **Alpha pal:** không phải field riêng — dashboard thêm tiền tố `BOSS_` vào Species ID (vd `BOSS_Anubis`).

---

## Cấu hình (`server/.env`)

```
# REST API của Palworld server
PALWORLD_HOST=<ip server>
PALWORLD_PORT=<RESTAPIPort, KHÔNG phải cổng game>   # xem PalWorldSettings.ini, field RESTAPIPort
PALWORLD_PROTOCOL=http
PALWORLD_ADMIN_PASSWORD=<AdminPassword trong PalWorldSettings.ini>

# Mật khẩu đăng nhập chính dashboard (khác admin password)
DASHBOARD_PASSWORD=<đổi cái này>

PORT=3000

# SFTP tới server (lấy từ nút "SFTP Connect" trong panel Shockbyte)
SFTP_HOST=<sftp host>
SFTP_PORT=2222
SFTP_USERNAME=<sftp user, dạng default@<uuid>>
SFTP_PASSWORD=<sftp password>
SFTP_MOD_PATH=/<đường dẫn>/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand
```

> Lưu ý cổng: Palworld có 3 cổng khác nhau — PublicPort (game, vd 21049), RCONPort (21051), **RESTAPIPort (21052)**. Dashboard dùng RESTAPIPort. Kiểm tra trong file `PalWorldSettings.ini` (tab Config của panel).

---

## Chạy dashboard

```bash
cd server
npm install     # chỉ cần lần đầu
npm start
```
Mở http://localhost:3000, đăng nhập bằng `DASHBOARD_PASSWORD`.

---

## Deploy / cập nhật mod Lua

Sau khi sửa `ue4ss-mod/GiveGoldCommand/Scripts/main.lua`:
```bash
cd tools
npm install     # chỉ cần lần đầu
node upload.js  # đẩy main.lua lên server + thêm GiveGoldCommand vào mods.txt
```
**Rồi phải RESTART server Palworld** (qua panel Shockbyte) — UE4SS chỉ nạp lại mod lúc khởi động. `mods.txt` cũng chỉ được đọc lúc khởi động.

Cách xác nhận mod đã nạp: đọc `Pal/Binaries/Win64/ue4ss/UE4SS.log`, tìm dòng `[GiveGoldCommand] mod loaded`.

---

## Test nhanh không qua dashboard (dành cho debug mod)

```bash
cd tools
node giveitem.js <player> <itemId> <quantity>
# vd: node giveitem.js biabia Money 1000     (Money = Gold Coin; DogCoin = Dog Coin)

node givepal.js <player> <species> <level> <rank> <ivHp> <ivMelee> <ivShot> <ivDef> <passiveCsv> <soulHp> <soulAtk> <soulDef> <soulWork>
# vd: node givepal.js biabia SheepBall 50 5 255 255 255 255 Legend,WorldTree_ATK 255 255 255 255
```
Script ghi lệnh vào queue.txt rồi đọc kết quả từ results.log sau vài giây.

---

## Trạng thái hiện tại

### Đã kiểm chứng trong game
- ✅ Quản lý người chơi (list, kick, ban), broadcast, save, shutdown — qua REST API.
- ✅ Tặng item bất kỳ (Money/Gold Coin, DogCoin, ...) với số lượng.
- ✅ Tặng pal với: species, level, số sao (0-255), IV (0-255), soul % (0-765%).
- ✅ 114 Pal passive tiếng Việt (đúng danh sách paldb tab "Pal Kỹ năng bị động /114"), có ID nội bộ chính xác, tô màu theo tier (World Tree 🌳 / xanh kim cương / vàng / trắng / đỏ), có tìm kiếm + chip + chú thích hover.
- ✅ Nút "Full Power": 4 sao + IV 255 + Soul 765% mọi stat.
- ✅ Validate input chống crash (số nguyên, không âm, cap 255/765; passive ID chỉ chữ/số/gạch dưới).

### Mới thêm — CHƯA kiểm chứng trong game, cần test kỹ trước khi dùng thật
- ⚠️ **Tặng cùng lúc nhiều người chơi** (item lẫn pal): chọn nhiều checkbox, dashboard ghi nhiều dòng lệnh trong 1 phiên SFTP, tách kết quả theo từng player.
- ⚠️ **Giới tính pal** (đực/cái) và **Lucky** (`IsRarePal`): lệnh `PAL2` mới trong mod Lua ghi `SaveParameter.Gender` / `IsRarePal` — field tên đúng nhưng **chưa xác nhận hiệu ứng thật trong game**, có thể sai tên field hoặc kiểu dữ liệu. Xem dòng `WARN`/`ERROR` trong `results.log` sau khi test.
- ⚠️ **Alpha pal**: chỉ là thêm tiền tố `BOSS_` vào Species ID khi spawn — cách này phổ biến trong các mod Palworld nhưng chưa test riêng ở repo này; không phải species nào cũng có bản `BOSS_` tương ứng.
- ⚠️ **Preset build** (built-in + lưu tùy chỉnh trong localStorage trình duyệt): chỉ là tiện ích điền sẵn form, không có rủi ro về mặt game logic — không cần test in-game, nhưng preset built-in dùng ID passive giả định hợp lý, nên xem lại trước khi bấm "Áp dụng" cho pal thật.
- ⚠️ **Lịch sử tặng quà** (`server/data/history.jsonl`, panel "Lịch sử tặng quà"): ghi phía dashboard (không phụ thuộc mod), nên luôn hoạt động kể cả khi mod timeout — nhưng dữ liệu chỉ có từ lúc tính năng này được thêm, không hồi cứu được lịch sử cũ.
- ⚠️ Ô hiển thị FPS/uptime trong header: gọi `/api/metrics` (endpoint REST API chính thức) — im lặng bỏ qua nếu server không trả về field này.
- ⚠️ Nút Unban trong panel điều khiển server.

**Trước khi dùng các tính năng "chưa kiểm chứng" trên server thật:** deploy mod mới (`cd tools && node upload.js`), **restart server Palworld**, rồi test với 1 player/pal rẻ tiền trước, đọc `results.log` xem có dòng `WARN`/`ERROR` không.

### Nguồn dữ liệu passive
`public/passives.js` được sinh ra bằng cách merge/lọc từ: l10n tiếng Việt của save-editor `oMaN-Rod/palworld-save-pal`, ID nội bộ từ `palmods.gg`, danh sách 114 + rank từ `paldb.cc`. Nếu cần regenerate hoặc mở rộng, các script merge nằm trong thư mục scratchpad tạm (không kèm repo) — có thể dựng lại từ 3 nguồn trên.

---

## Ý tưởng phát triển tiếp (gợi ý)

- Xác nhận field `Gender`/`IsRarePal` đúng tên thật trong `PalIndividualCharacterSaveParameter` (dò qua UE4SS object dumper hoặc test thực tế) — nếu sai tên, sửa trong `applyGenderLucky()` ở `main.lua`.
- Kiểm chứng tiền tố `BOSS_` cho từng species cụ thể — một số pal có thể dùng tên khác (vd hậu tố `_Boss` hoặc species ID riêng).
- Đưa dashboard lên HTTPS + auth mạnh hơn nếu host public.
- Trang riêng xem toàn bộ lịch sử (hiện chỉ hiện 50 dòng gần nhất) + lọc theo player/loại quà.

---

## Bối cảnh kỹ thuật cần biết

- Server test dùng **Shockbyte** (panel Pterodactyl), Palworld bản **Windows chạy qua Wine**. UE4SS cài sẵn qua mod installer của panel, cùng PalSchema, CreativeMenu (bản .pak, mở bằng F1 trong game — chỉ client-side, không liên quan phần server-side này).
- `curl` (libssh2) KHÔNG bắt tay được SFTP của Shockbyte (thiếu thuật toán KEX); phải dùng thư viện `ssh2` của Node (đã dùng trong `tools/` và `sftpBridge.js`).
- SFTP của Shockbyte không hỗ trợ mở file chế độ append tốt → luôn đọc-rồi-ghi-đè khi thêm dòng vào queue.txt.
- Đường dẫn gốc trên SFTP Shockbyte có prefix lạ dạng `/1. MOD PALWORLD TEST/...` (tên server hiển thị trên panel), không phải `/`. `SFTP_MOD_PATH` trong `.env` phải ghi đủ prefix này. Nếu đổi server/host, lấy lại đường dẫn đúng bằng `cd tools && node list.js "/"` để xem thư mục gốc.

### ⚠️ Đang thử chuyển sang chạy server ở host Linux khác (2026-08-04)
Đã thấy một server test mới trên cùng tài khoản Shockbyte, cùng dạng prefix `/1. MOD PALWORLD TEST/...` nhưng cấu trúc **khác hẳn bản Windows/Wine cũ**:
- `Pal/Binaries/` chỉ có thư mục `Linux/` (chứa `PalServer-Linux-Shipping`) — **KHÔNG có `Win64/`**.
- Không tìm thấy `Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand` (list thư mục báo lỗi).
- Đây có vẻ là **bản Palworld server Linux native**, không phải Windows-qua-Wine như server cũ.

**Hệ quả:** UE4SS chỉ chạy được trên bản Windows/Wine — với bản Linux native thì **KHÔNG cài được UE4SS, nên mod Lua give-item/give-pal không chạy được**. REST API (list/kick/ban/save/shutdown) vẫn hoạt động bình thường vì đó là tính năng có sẵn của Palworld server, không phụ thuộc UE4SS.

**Việc cần làm trước khi tiếp tục dùng dashboard này với server mới:**
1. Xác nhận với bên host xem server này chạy native Linux hay Windows-qua-Wine (hỏi trực tiếp, hoặc kiểm tra panel có phải "Windows" build không).
2. Nếu là native Linux → hỏi bên host có thể chuyển sang bản Windows-qua-Wine (giống server cũ) không, vì đó là điều kiện bắt buộc để UE4SS + mod này hoạt động.
3. Nếu bắt buộc dùng Linux native → tính năng give-item/give-pal của dashboard này sẽ không dùng được cho tới khi tìm được cách khác để can thiệp vào game state (vd RCON mở rộng, mod native Linux nếu UE4SS sau này hỗ trợ, hoặc chỉnh save file trực tiếp).
4. `server/.env` đã cập nhật `PALWORLD_ADMIN_PASSWORD` theo `AdminPassword` đọc được từ `PalWorldSettings.ini` của server mới (`f8c9f77b`) — nhưng **chưa xác nhận `PALWORLD_HOST`/`PALWORLD_PORT` đúng** (IP cũ trong `.env` không kết nối được tới REST API port 21052 khi test). Cần lấy IP/port thật của server mới (mục Connect trên panel Shockbyte hoặc hỏi bên host) rồi cập nhật `PALWORLD_HOST`.

---

## Nếu nhận bản nén (.zip) thay vì clone từ GitHub
Bản nén đã **kèm sẵn `server/.env`** với secret thật (tiện chạy ngay), và đã **bỏ `node_modules`** (phải cài lại). Sau khi giải nén:
```bash
cd server && npm install
cd ../tools && npm install
cd ../server && npm start
```
⚠️ Vì file nén chứa mật khẩu thật trong `.env`, giữ nó ở nơi riêng tư (Drive cá nhân), đừng chia sẻ công khai.
