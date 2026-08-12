# Nhật ký thay đổi trên SERVER — để khôi phục về mặc định khi cần

> Mỗi lần sửa file trên server Palworld, ghi vào đây kèm bản gốc trong thư mục này.
> Server: `1. MOD PALWORLD TEST` (Shockbyte, SFTP).

---

## 2026-08-07 — Bật debug logging + auto reload cho PalSchema

**File trên server:**
`/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/config/config.json`

**Bản gốc đã lưu:** `PalSchema_config.json.goc`

**Nội dung gốc:**
```json
{
   "languageOverride": "",
   "enableAutoReload": false,
   "enableDebugLogging": false
}
```

**Đổi thành:**
```json
{
   "languageOverride": "",
   "enableAutoReload": true,
   "enableDebugLogging": true
}
```

**Lý do:** khi JSON mod sai định dạng, PalSchema **bỏ qua im lặng** — không bật debug log thì
không cách nào biết mod có được nạp hay không. `enableAutoReload` cho phép nạp lại mod
mà (có thể) không cần restart server.

**Cách khôi phục:**
```bash
cd tools
node putfile.js "../server-backups/PalSchema_config.json.goc" \
  "/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/config/config.json"
```

**Ảnh hưởng nếu để nguyên:** chỉ tốn thêm chút log, không đổi gameplay. An toàn để giữ.

---

## 2026-08-07 — Mod PalSchema `BialkServer` (nerf recycler + drop Silvance)

**Thư mục trên server:**
`/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/mods/BialkServer/`

**Nguồn giữ trong project:** `palschema-mods/BialkServer/`

| File | Tác dụng |
|---|---|
| `metadata.json` | Khai báo mod |
| `raw/recycler.json` | Tắt slot **8, 9, 14** của cả 5 dòng `AncientRelicRecycler_WorldTreeRelic_01..05` trong `DT_FieldLotteryNameDataTable` → máy recycler không còn cho **Ancient Civilization Core**, **Disposable Implants**, **Mutation Disposable Implants**. Các pool khác (Awakening Materials, Skill Cards, Ancient Blueprints, Mythical Wood, Paloxite) giữ nguyên. |
| `raw/drop_silvance.json` | `DT_PalDropItem` → `Mothman000` và `BOSS_Mothman000`, đặt `Rate1..5 = 0`. **⚠️ TÁC DỤNG CHƯA CHẮC CHẮN — đọc phần bên dưới.** |
| `raw/drop_probe.json` | `{}` — file rỗng còn sót từ lúc dò, có thể xoá. |

### ⚠️ Về `drop_silvance.json` — mức độ chắc chắn THẤP

**Quan sát thực tế:** Silvance **Lv70+ VẪN rơi** Ancient Civilization Core (cả khi giết lẫn khi xẻ),
dù đã đặt `Rate = 0`, đã thử thêm `ItemId = "None"`, và đã restart. Pal **dưới Lv70 thì không rơi**.

**Chưa xác định được** ngưỡng Lv70 đó là do config này tạo ra hay là cơ chế sẵn có của game.
Chủ server quyết định **giữ lại** vì: nếu nó thật sự tạo ngưỡng thì gỡ đi sẽ khiến pal level thấp
cũng rơi Core. Để lại thì xấu nhất là vô tác dụng — không gây hại.

**Những cách ĐÃ THỬ và THẤT BẠI** (đừng lặp lại):
- `Rate = 0` → không chặn được pal Lv70+
- `ItemId = "None"` → không chặn được; nghi ngờ giá trị này còn làm hỏng cả dòng
- Thêm dòng `BOSS_Mothman000` → dòng có thật (`2 rows updated`) nhưng vẫn không chặn được
- Nhắm bảng `DT_PalDropItem_Common` → **PalSchema khớp tên sai**, thực tế nó tác động vào
  `DT_PalDropItem`. Kiểm chứng: gửi tên bảng `DT_PalDropItem_Common` mà log in ra `DT_PalDropItem`.

**Nếu sau này muốn làm cho bằng được:** dùng **FModel** export `DT_PalDropItem` từ file .pak của game
để xem chính xác dòng nào / ô nào. Đoán mò đã tốn rất nhiều lượt thử-sai mà không ra.

**Bối cảnh thiết kế:** nguồn Core lớn nhất là **máy recycler** (x5–10 mỗi lần, 41%, cày relic vô hạn)
— cái đó **đã chặn xong và kiểm chứng hoạt động**. Silvance Lv70+ còn rơi x1 mỗi con, nhưng phải
breed rồi **nuôi lên Lv70** nên là công sức có thật, chấp nhận được.

**Cách gỡ hoàn toàn:** xoá thư mục `BialkServer` trên server rồi restart.
PalSchema **không sửa file gốc của game** — nó vá lúc chạy, nên gỡ mod là về mặc định 100%.

**Cách sửa giá trị:** sửa file JSON trong `palschema-mods/BialkServer/raw/` rồi:
```bash
cd tools
node putfile.js "../palschema-mods/BialkServer/raw/<file>.json" \
  "/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/mods/BialkServer/raw/<file>.json"
```
PalSchema **tự nạp lại ngay**, không cần restart (nhờ `enableAutoReload`).

⚠️ **Hai cạm bẫy đã dính:**
1. **Không đặt khoá chú thích** (kiểu `"_ghi_chu"`) ở cấp cao nhất của JSON — PalSchema tưởng đó là
   tên DataTable và báo lỗi `Failed to find UDataTable '_ghi_chu'`, làm hỏng cả lần nạp.
2. PalSchema **vá vào bộ nhớ, không tự hoàn tác**. Bỏ một field khỏi JSON thì giá trị cũ **vẫn còn**
   cho tới khi **restart**. Trong lúc dò slot đã ghi đè cả 15 slot → phải restart mới sạch.

---

## 2026-08-12 — Chặn drop của Dandilord (`drop_dandilord.json`)

**File trên server:**
`.../Pal/Binaries/Win64/ue4ss/Mods/PalSchema/mods/BialkServer/raw/drop_dandilord.json`

**Nguồn trong project:** `palschema-mods/BialkServer/raw/drop_dandilord.json`

Giống hệt cách làm với Silvance: `DT_PalDropItem` → `FlowerPrince` (Dandilord #194, ID nội bộ
xác nhận từ palworlddb.com / palpedia / palworld.th.gl) và `BOSS_FlowerPrince`, đặt `Rate1..5 = 0`.

⚠️ **Kế thừa nguyên cảnh báo của drop_silvance:** với Silvance, pal **Lv70+ VẪN rơi đồ** dù
Rate = 0 (chưa rõ vì sao — xem mục drop_silvance ở trên). Dandilord là boss World Tree, level
cao, nên **phải test thực tế**: giết/xẻ 1 con Dandilord rồi xem còn rơi không. Nếu còn thì đây
là giới hạn đã biết của cách Rate=0, đừng tốn công thử lại các cách đã fail (ItemId=None,
DT_PalDropItem_Common...).

**Cách gỡ:** xoá file `drop_dandilord.json` trên server rồi restart.

---

## (chưa có) Các thay đổi DataTable qua PalSchema

Khi thêm mod JSON vào `PalSchema/mods/`, ghi vào đây:
- Đường dẫn file trên server
- Nội dung
- Cách gỡ (thường chỉ cần **xoá thư mục mod** đó rồi restart)

Lưu ý: mod PalSchema **không sửa file gốc của game** — nó nạp đè lúc chạy. Nên gỡ mod = xoá
thư mục là về mặc định hoàn toàn, không cần backup file game.
