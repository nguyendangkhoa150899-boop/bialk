# Palworld — dashboard, mod Lua, pak mods, server Shockbyte

> **Viết cho người/AI tiếp nhận.** Đây là **trạng thái hiện tại**, không phải nhật ký.
> Lịch sử theo ngày: `git log`. Bản README cũ 2.300 dòng (nhật ký từng ngày từ 08/08 → 18/09)
> nằm ở commit `385e5f6`. **Bot Discord / sòng web / shop / rương / tiền: xem `../BotDoMin/README.md`.**
> **Từng pak, cách dựng, từng bẫy đã dính: `pak-mods/README.md`** (tài liệu kỹ thuật sâu, giữ nguyên).

Chủ server: **Khoa**, không rành code. Trả lời tiếng Việt, chỉ rõ file/dòng, giải thích dễ hiểu.

---

## 0. Bảo mật & luật làm việc

- `server/.env` chứa **mật khẩu SFTP thật**. Gitignore, kể cả bản sao `.env.bak-*`. **Không bao giờ commit, không ghi vào README.** Tài khoản 2 server + danh sách server **cấm đụng** (hard-block) nằm trong bộ nhớ Claude và trong `.env`, không ở đây.
- Có **hai server game** trên Shockbyte: **TEST** ("1. test mod") và **CHÍNH** ("1. Cô 4 vui vẻ"). `server/.env` trỏ TEST. Tool nào ghi lên prod phải nhận tài khoản prod qua biến môi trường `PROD_USER`/`PROD_PASS`, và **chỉ khi chủ server bảo**. Mọi tool đều có hard-block UUID server không phải của mình.
- **SFTP Shockbyte: cấm `fastPut`/`fastGet` của ssh2** — nó xáo khúc 32 KB (cùng kích thước, sai nội dung, `main.lua` báo lỗi cú pháp ở dòng vô can, mod chết). Ghi bằng `createWriteStream` tuần tự và **đọc lại so từng byte** sau khi ghi. Readdir Shockbyte trả theo đợt — phải gọi lặp tới hết (ghi chú cũ "chỉ trả 1 entry" là do gọi 1 lần).
- **Kích thước file KHÔNG chứng minh đúng bản**: các đời pak cùng bảng thường **bằng byte nhau** (v1/v2/v3 của `BialkNoDrop_P.pak` đều 328.821 B). Chỉ md5 mới chắc.
- Chỉ commit/push khi chủ server nói. Sửa xong cập nhật README này (mục liên quan), không viết nhật ký theo ngày.

---

## 1. Ba thành phần đang chạy

| Thành phần | Chỗ chạy | Restart khi nào |
|---|---|---|
| **Server Palworld** + mod Lua UE4SS + pak | Shockbyte (Windows qua Wine) | mỗi lần sửa `main.lua` hoặc thay pak (chủ server bấm trên panel Shockbyte) |
| **palworld-dashboard** (`server/`) | VPS `103.72.98.37`, pm2 `palworld-dashboard`, cổng 3000 **chỉ nghe 127.0.0.1** | khi sửa `server/src/*` hoặc `server/.env` |
| **BotDoMin** | cùng VPS, pm2 `BotDoMin` | xem README bot |

```bash
# VPS
cd /root/tts-bot && git checkout -- . && git pull
pm2 restart palworld-dashboard        # chỉ khi sửa dashboard
pm2 restart BotDoMin --update-env     # khi sửa bot
```
Dashboard **phải sống** thì bot mới giao/đếm được — lỗi `fetch failed` khi bấm nhận pal/mua đồ = dashboard chưa chạy. Local: `cd server && node src/index.js` (cổng 3010 theo `.env` local).

⚠️ **Tên server trên Shockbyte = đường dẫn SFTP.** Đổi tên server là `SFTP_MOD_PATH` sai → mọi give/count báo "Dashboard server error" mà không ai hiểu vì sao. Đổi tên xong phải sửa `.env` (prod + test) và restart dashboard.

---

## 2. Kiến trúc — hai đường tới server game

**Đường 1 — REST API chính thức** (`palworldClient.js`): `info` `players` `metrics` `announce` `kick` `ban` `unban` `save` `shutdown`. **Không có lệnh tặng/trừ item.** Hiện **TẮT** (server không bật REST) → các endpoint cần nó trả 503. Bật lại: điền `PALWORLD_HOST/PORT/ADMIN_PASSWORD` vào `server/.env`.

**Đường 2 — Mod Lua UE4SS + cầu SFTP** (đường sống duy nhất để đụng túi/pal):
```
bot / dashboard → POST /api/give-item …  → sftpBridge.js
   → ghi 1 dòng vào queue.txt (SFTP)  →  mod GiveGoldCommand (trong game) poll 2s/lần
   → thực thi → ghi results.log  →  sftpBridge.js đọc về, ghép theo tiền tố [playerName]
```
Vì sao file queue: RCON Palworld chỉ nhận lệnh cố định, panel Shockbyte không có console. Mod ở `Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/`, **tự dò thư mục của nó** (xem `baseDir=` trong `results.log`).

Endpoint dashboard (`server/src/index.js`): `/api/give-item` `/api/take-item` `/api/item-count` `/api/item-count-all` `/api/give-pal` `/api/whereis` `/api/rescue` `/api/history` `/api/settings` · cần REST: `/api/info` `/api/players` `/api/metrics` `/api/announce` `/api/kick` `/api/ban` `/api/unban` `/api/save` `/api/shutdown` `/api/links`.

---

## 3. Lệnh trong `queue.txt` (mod `ue4ss-mod/GiveGoldCommand/Scripts/main.lua`)

```
ITEM <itemId> <qty> <playerName>            TAKE <itemId> <qty> <playerName>
COUNT <itemId> <playerName>                 COUNTALL <itemId>
PAL2 <species> <level> <rank> <iv×4> <soul×4> <gender> <lucky> <passiveCsv> <playerName>
RESCUE <playerName> | RESCUEAT … | WHEREIS <playerName> | PASSCHK …
```
Chẩn đoán (chỉ đọc): `DUMP <class>` `DUMPP <class>` `INSPECT <player>` `INVDBG <item> <player>` `DBGPAL` `DTINFO <class>` · **`DTMAP <class> <Prop1,Prop2,…> [tiềnTố]`** đọc **cả cột** một DataTable đang sống trong game (dùng để tra bảng game mà không cần file game — vd `DTMAP PalMasterDataTableAccess_ItemLotteryData FieldName,SlotNo,StaticItemId,WeightInSlot AncientRelicRecycler_`). `DTROW` **hỏng** (BP_FindRow fail), đừng dùng.

**Hai quy tắc bắt buộc:** (1) `playerName` luôn **cuối dòng** (tên có dấu cách); (2) field rỗng gửi sentinel **`-`**. Mọi dòng kết quả có tiền tố `[playerName] ` (`appendPlayerResult`) — dashboard ghép theo đó, **không đoán theo câu chữ**.

`species` = code nội bộ (`DomeArmorDragon`, `BOSS_DomeArmorDragon` là bản alpha; Fuack = `BluePlatypus`…), tra `../BotDoMin/pals.json` hoặc paldb.cc mục "Code". `gender` 0 random / 1 đực / 2 cái (số nguyên, không phải FName). Passive `id` phải là FName thật (nguồn: save-editor `oMaN-Rod/palworld-save-pal`) — **1 id sai là game từ chối cả lô**.

Deploy mod: `cd tools && node upload.js` (đẩy `main.lua` + bật trong `mods.txt`, ghi stream tuần tự + so byte) → **restart server game** → `results.log` có `mod loaded`. Kiểm Lua trước khi đẩy: chạy qua `wasmoon` (Lua 5.4) — chỉ `luac`-kiểu syntax là chưa đủ vì đã có lần file lên server bị xáo khúc.

---

## 4. Cấu hình

`server/.env` tối thiểu (đang trỏ server TEST):
```
SFTP_HOST=sftp.discord.sgp2.shockbyte.host
SFTP_PORT=2222
SFTP_USERNAME=default@<uuid server>
SFTP_PASSWORD=<mật khẩu>
SFTP_MOD_PATH=/<TÊN SERVER TRÊN SHOCKBYTE>/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand
PORT=3000   HOST=127.0.0.1   DASHBOARD_PASSWORD=          # trống = không mật khẩu, GIỮ HOST 127.0.0.1
```
`BotDoMin/.env`: `PAL_DASHBOARD_URL=http://127.0.0.1:3000`, `PAL_DASHBOARD_PASSWORD` (khớp trên), `PANEL_PASSWORD` (trống = panel mở).

Xác thực **đang tắt** theo yêu cầu chủ server. Dashboard nghe localhost nên ít rủi ro; panel bot nghe `0.0.0.0` là mở cho internet — bật lại bằng điền mật khẩu + restart, hoặc `ufw deny <cổng>` + SSH tunnel `ssh -L 3001:localhost:3001 -p 24700 root@103.72.98.37`.

---

## 5. `tools/` — đồ nghề SFTP (chạy từ `tools/` hoặc `server/` để có ssh2)

| Tool | Việc |
|---|---|
| `upload.js` | đẩy `main.lua` + bật mod |
| `putfile.js <local> <remote>` · `cat.js <remote>` · `list.js` | ghi / đọc / liệt kê 1 file trên server test |
| `giveitem.js <player> <itemId> <qty>` · `rawcmd.js "<lệnh>"` | gửi lệnh cho mod và in `results.log` mới |
| `sftp-dtmap.cjs "DTMAP …"` | gửi lệnh đọc bảng sống, tải `dump.log` về (creds qua ENV `SFTP_USER/PASS/MOD_PATH`; Git Bash cần `MSYS_NO_PATHCONV=1`) |
| `soi-nguoi-choi.js` | đọc `database.json` của bot: lời/lỗ từng người theo trò (offline) |
| `pak/sftp_pakget.js` `pak/oodle_unpack.ps1` | rút 1 entry từ pak game 4,9 GB trên server qua SFTP theo offset (cần `oodle-data-shared.dll` — **máy hiện tại không có**, dùng `DTMAP` thay) |
| `pak/prod_*.js` | chỉ-đọc/cài lại prod, creds qua `PROD_USER/PROD_PASS`, hard-block server lạ |

Tất cả dùng stream tuần tự, không `fastPut`.

---

## 6. Pak mods — cái gì đang chạy trên CẢ HAI server

Tên pak **giống nhau ở test và prod** (chủ server đã dọn prod về cùng tên). Mỗi pak sửa một bộ bảng riêng, **không pak nào đụng bảng của pak khác** (đã đo bằng `repak list`).

| Pak | Bảng | Làm gì |
|---|---|---|
| `BialkNoDrop_P.pak` | `DT_PalDropItem` + `_Common` | Silvance/Dandilord không rớt gì · Jetragon + Aegidron không rớt Lõi Siêu Nhiệt (`Thermal_Core`) · **Linh Kiện Văn Minh Cổ Đại (`PalCrystal_Ex`) rơi 1–2 cái** (334 slot, toàn dòng `BOSS_*`) — không chặn hẳn vì 345 công thức cần nó, đang bán ở web |
| `BialkServer_ZExpedition_P.pak` | `DT_FieldLotteryNameDataTable` | Máy nghiền cổ vật (5 dòng `AncientRelicRecycler_WorldTreeRelic_01..05`) tắt slot 8 implant · 9 Lõi Công Nghệ · 13 **bản vẽ vũ khí/giáp** · 14 implant đột biến; **Trạm Thám Hiểm** không rớt Lõi + Linh kiện. Là superset của `BialkServer_P.pak` cũ — **chỉ để 1 pak nhóm này** trên mỗi server |
| `BialkRaid_NgayThuong_P.pak` | `DT_PalMonsterParameter` + `_Common`, `DT_PalRaidBoss*`, `BP_PalRaidBossManager` | raid ngày thường + **EXP boss tháp 0,5× gốc** (`GYM_*`). Bản `BialkRaid_Event_P.pak` (0,7×) để dự phòng, không cài chung |
| `BialkShopOff_P.pak` | `DT_ItemShopCreateData*`, `DT_PalShopCreateData` | thương nhân không bán gì, giữ `Bounty_Shop_1` + `Arena_Shop_1` |

Không cài: `BialkRecipe_P.pak` (đổi nguyên liệu chế đồ) — **pak server không đổi được UI client**: server đòi 50 lõi mà máy người chơi vẫn hiện 10 → bỏ, dùng giá/hạn shop thay. `BialkSurgeryOff_P.pak`, `BialkSilvanceNoDrop_P.pak` là đời cũ đã gộp.

**Luật ở chung:** hai pak sửa **cùng một file bảng** thì pak nạp sau (theo chữ cái) **thay cả file**, pak trước mất tác dụng **im lặng**. Muốn sửa thêm cùng bảng → vá tiếp vào JSON của pak đang có, dựng lại **đúng pak đó**.

**Toolchain chạy ngay trên máy không có game** (scratchpad `tools/`): `repak` v0.2.3 + .NET 10 user-scope + `UAssetCLI` v1.0.5 + `pak-mods/Mappings.usmap`. `tojson … VER_UE5_1 Mappings.usmap` → vá JSON bằng script trong `pak-mods/scripts/` → `fromjson` → `repak pack build <tên> --version V11 -p 764445180` → **bung ngược so từng dòng** trước khi lên server. `DT_PalMonsterParameter` **không round-trip** (bug FName `_2`) → vá byte bằng `surgical_expratio.js`. UAssetAPI ghi float 0 là chuỗi `"+0"`.

Script vá: `patch_paldrop_item.js` (tắt slot theo món / `--setmin --setmax` giảm số lượng / `--item=~regex`), `patch_expedition.js` (nhận `dump.log` của DTMAP làm nguồn ánh xạ slot→món, `--keep-recycler`), `surgical_expratio.js` (`--map=cũ:mới`, `SURG_TARGETS`). Chi tiết từng lần build và số liệu: `pak-mods/README.md`.

Còn mở: 24 boss Alpha vẫn rớt bản vẽ bậc `_5` ở 3% (bảng `DT_PalDropItem`, chủ server chưa yêu cầu — `--item=~^Blueprint_ --pals='~.'` là tắt được). Prod chưa so md5 pak sau lần chủ server tự chép.

---

## 7. PalSchema `BialkServer` (đời cũ, còn để tham chiếu)

Nguồn `palschema-mods/BialkServer/`, trên server `ue4ss/Mods/PalSchema/mods/BialkServer/`, có `enableAutoReload`. `raw/recycler.json` từng làm việc máy nghiền (giờ pak lo); `raw/drop_silvance.json` **không ăn với pal Lv70+** (bảng có dòng riêng `*070`) → đó là lý do chuyển sang pak. Bẫy: không đặt khoá chú thích ở cấp cao nhất JSON; vá vào bộ nhớ, bỏ field không tự hoàn tác. Ghi chú bàn phẫu thuật: `GHI-CHU-BAN-PHAU-THUAT.md`; nhật ký sửa server cũ: `server-backups/NHAT-KY-SUA-SERVER.md`.

---

## 8. Đã thử và THẤT BẠI — đừng lặp lại

1. **Pal tặng "xài liền không restart"** — đào tới đáy (mổ pak CreativeMenu, dump chữ ký hàm, gọi thật): UE4SS Lua không dựng được struct param, engine sập; `Debug_CaptureNewMonster_ToServer` vô hiệu ở bản Shipping. **Kết luận: giữ restart.** Toàn bộ bằng chứng: `ue4ss-mod/GHI-CHU-GIVE-PAL-XAI-LIEN.md`. Chỉ còn đường C++ mod.
2. **Hook chat trong game** (`PalPlayerState:EnterChat`) — không chạy, nghi gãy chat. Đừng hook RPC mạng trên server thật.
3. **Nút reset server cho người chơi** — REST `/shutdown` chỉ tắt, server không tự dậy; Access Control không cấp API key. Lời giải: **Scheduled Tasks "Send Restart"** trên panel Shockbyte.
4. **Đổi nguyên liệu chế đồ bằng pak server** — client không thấy (mục 6).
5. **"Bug level" pal ra cấp 2** — không phải bug, server bật Level Sync.
6. **Kéo pal từ game ngược lên web** — bỏ, không có đường đọc palbox an toàn.
7. `DTROW` (BP_FindRow) — fail cả 3 cách → làm `DTMAP`.

---

## 9. Bài học kỹ thuật UE4SS Lua

- Hàm có out-param: truyền đủ tham số, out-param ghi vào **bảng truyền vào** (`inv:TryGetContainerFromStaticItemID(FName(id), out)` → `out.OutContainer`).
- `slot.ItemId.StaticId` là FName → `:ToString()`; `tostring()` ra địa chỉ.
- Không có hàm trừ item → ghi thẳng `slot.StackCount` rồi `OnRep_StackCount()`.
- Chỉ số pal: ghi **cả `SaveParameter` và `SaveParameterMirror`** rồi `OnRep_SaveParameter()`.
- Người vừa thoát game để lại `PalPlayerState` "xác": `IsValid` true nhưng gọi `GetInventoryData()` là nổ → mod trả `player not found (COUNT stale)`.
- Tên nhân vật có ký tự ẩn (U+1CBC…) → give-pal trượt dù đếm túi vẫn thấy online.
- Đọc bảng game: `StaticFindObject("/Script/Engine.Default__DataTableFunctionLibrary"):GetDataTableColumnAsString(dt, FName(prop))` chạy được (cách `DTMAP` dùng).

---

## 10. Việc còn mở

- **Chuyển server sang Linux native** (ping cao khi 3 người): mất UE4SS = mất cầu Dogcoin + mod Lua + PalSchema; pak vẫn chạy. Trước khi chuyển: thêm công tắc tắt 2 nút chuyển Dogcoin. Đo `serverfps` qua `/api/metrics` trước khi đổ lỗi cho mod.
- Restart server game định kỳ bằng Scheduled Tasks Shockbyte (pal giao cần restart mới dùng được).
- 24 boss Alpha rớt bản vẽ 3% (mục 6). So md5 4 pak prod khi có creds.
- Bật lại REST + mật khẩu dashboard/panel khi cần quản lý người chơi từ xa.
- Chạy ở máy local: `cd server && npm install && npm start` · `cd tools && npm install`.
