# Ghi chú: Bàn phẫu thuật (Operating Table) + việc cần fix

Ghi ngày 2026-08-07. **Chưa triển khai gì cả** — mới là nghiên cứu.

---

## 1. VIỆC CẦN FIX: lỗ hổng mất tiền trong `takeItem`

Vị trí: `ue4ss-mod/GiveGoldCommand/Scripts/main.lua`, trong hàm `takeItem` (đã cắm sẵn comment `TODO (chua fix)` ngay tại chỗ).

**Vấn đề:** nếu vòng lặp trừ được **một phần** rồi dừng giữa chừng, số đã trừ **không được hoàn lại**.

Kịch bản: người chơi có 100 DogCoin → rút 100 → trừ được 60 rồi lỗi → bot thấy `took=60 ≠ 100` nên **đúng đắn không cộng Dogcoin**, nhưng người chơi **đã mất 60 coin mà không nhận được gì**.

Xác suất thấp (cần có lỗi giữa vòng lặp), nhưng hậu quả là mất tiền thật của người chơi.

**Cách vá:** trong nhánh `if remaining > 0 then`, gọi `AddItem_ServerInternal` cộng trả lại `quantity - remaining`, rồi báo rõ là đã hoàn tiền.

---

## 2. Bàn phẫu thuật — ĐÃ XÁC MINH (từ `localcc/PalworldModdingKit`, bản 1.0, cập nhật 07/2026)

### Tên nội bộ KHÔNG phải "Surgery"
Trong code game nó là **`OperatingTable`**. Grep từ khoá "Surgery" sẽ không ra gì. Bài học: tên hiển thị ≠ tên nội bộ.

### DataTable điều khiển bàn phẫu thuật
```cpp
struct FPalOperatingTablePassiveSkillData : public FTableRowBase {
    FName PassiveSkill;    // passive nào
    int32 Price;           // giá — CHỈ LÀ CON SỐ, không có loại tiền tệ
    FName RequireItemId;   // implant bắt buộc phải có
};
```
Mỗi dòng = 1 passive khả dụng ở bàn phẫu thuật.

### Class xử lý (server) — KHÔNG có thanh toán
```cpp
UPalMapObjectOperatingTableModel:
    RequestReverseGender(targetHandle)                              // + _ServerInternal
    RequestChangePassiveSkill(targetHandle, skillIndex, PassiveSkill) // + _ServerInternal
```
**Không có tham số tiền, không có kiểm tra tiền.** Hàm server chỉ đổi passive.

### Class tra bảng — toàn Blueprint
```cpp
UPalMasterDataTableAccess_OperatingTablePassiveSkillData:
    BP_FindRowByStaticItemId(StaticItemId, &bResult)   // tra theo implant
    BP_FindRowByPassiveSkill(PassiveSkill, &bResult)
    BP_FindRow(RowName, &bResult)
```
Tất cả đều `BlueprintCallable, BlueprintPure`.

### → KẾT LUẬN QUAN TRỌNG
**Việc trừ Gold Coin nằm trong Blueprint (giao diện), KHÔNG nằm trong C++ đã biên dịch.**
Luồng thật: Blueprint UI tra DataTable lấy `Price` + `RequireItemId` → kiểm tra & trừ tiền người chơi → gọi `RequestChangePassiveSkill` (hàm này không quan tâm tiền nong).

---

## 3. Implant = vật phẩm, ID theo quy tắc rõ ràng

| Loại | Mẫu ID | Ví dụ thật (từ paldb.cc) |
|---|---|---|
| Implant thường (dùng lại được) | `PalPassiveSkillChange_<passiveID>` | `PalPassiveSkillChange_Nocturnal` |
| Implant dùng 1 lần | `PalPassiveSkillChange_Consumable_<passiveID>` | `PalPassiveSkillChange_Consumable_EternalFlame` |

`<passiveID>` chính là ID passive đã có sẵn trong danh sách 114 passive (bản dashboard cũ có `public/passives.js`; bản này đã bỏ file đó).

Đối chiếu đã khớp: `MoveSpeed_up_3`, `EternalFlame`, `PlayerSP_DecreaseRate_Passive` đều là passive ID hợp lệ.

**Chưa xác minh:** implant có tồn tại sẵn cho **mọi** passive hay chỉ ~27 cái kiếm được trong game. Thử rẻ tiền: `node rawcmd.js "ITEM PalPassiveSkillChange_Legend 1 <tên>"` rồi vào game xem túi đồ.

---

## 4. KẾ HOẠCH CHỐT (do chủ server đề ra 2026-08-07) — ít can thiệp game nhất

Nguyên tắc: **không mod sâu vào game**. Chỉ nerf drop + bán implant qua Discord.

```
1. NERF: giảm/bỏ drop của các NGUYÊN LIỆU chế implant, rơi từ pal World Tree
         -> người chơi không tự farm được nữa
2. BÁN:  bot Discord lệnh `gift` -> trừ DogCoin -> tặng ITEM implant
         (tặng item dễ hơn tặng pal rất nhiều, đường give-item đã chạy ổn)
3. PHẠM VI BÁN: chỉ chiêu kim cương + World Tree.
         Chiêu vàng trở xuống -> bàn phẫu thuật MẶC ĐỊNH đã có, không cần đụng.
4. Chi phí Gold ở bàn phẫu thuật GIỮ NGUYÊN — không cần đổi sang DogCoin.
   Vật khan hiếm thật sự là IMPLANT (mua bằng DogCoin), Gold chỉ là phụ phí.
```

**Vì sao kế hoạch này tốt hơn:** không cần thêm dòng cho mọi passive, không cần đổi `Price`,
không cần đụng Blueprint. Chỉ sửa bảng drop (việc đã biết chắc làm được) + dùng lại
give-item đã chạy ổn định.

### Phân loại implant (đối chiếu paldb 2026-08-07)

**21 implant DÙNG ĐƯỢC — bán được:**
- *World Tree (7)*: Demonic Grasp (Bàn Tay Ác Quỷ), Dimensional Leap (Cú Nhảy Không Gian),
  God of Destruction (Thần Hủy Diệt), Hermit (Tiên Nhân), Sacred Flesh (Thành Trì Thịt Sống),
  Double-Edged Holy Sword (Thánh Kiếm Hai Lưỡi), World Tree's Bounty (Vườn Ươm Cây Thần)
- *Mutation (5)*: Immortality, Idiosyncratic, Babysitter, Heavily Armored, Skymarcher
- *Khác (9)*: Remarkable Craftsmanship, Diamond Body, Demon God, Mastery of Fasting,
  Heart of the Immovable King, Swift, Eternal Engine, Vampiric, King of the Waves

**7 implant "Drop disabled" — KHÔNG dùng được:**
Lucky, Legend, Siren of the Void, Eternal Flame, Invader, Lunker, Savior

> **ĐÃ TEST (chủ server):** lấy được item qua Creative Menu nhưng **không sử dụng được**.

**Giả thuyết cứu 7 cái này (chưa test):** chúng bị disable vì **không có dòng trong
`FPalOperatingTablePassiveSkillData`**, nên bàn phẫu thuật không liệt kê — dù có item trong túi.
→ Thử **thêm dòng** (`PassiveSkill = Legend`, `RequireItemId = <implant tương ứng>`, `Price = <tuỳ>`)
qua PalSchema. Nếu được thì không cần viết code ghi thẳng passive.

### ⭐ Disposable implant BỊ TIÊU HAO KHI DÙNG (nhà phát hành xác nhận)

> *"Disposable Implant usable at the Pal Surgery Table. **It is consumed on use**, but can grant
> more powerful passive skills."*

Rất quan trọng cho kinh tế server:
- Implant **thường** (27 cái): dùng mãi mãi → bán 1 lần/người rồi hết khách.
- Implant **disposable** (21 cái): **mất sau mỗi lần dùng** → mỗi lần đổi passive = 1 lần mua.

→ **Chọn bán disposable** = chỗ tiêu DogCoin lặp lại, bền vững. Đây là thứ giữ kinh tế sống.

### ID item implant — quy tắc ĐÃ XÁC NHẬN

Tên icon nhà phát hành dùng: `...MaterialPalPassiveSkillChangeConsumable` → khớp quy tắc:
```
PalPassiveSkillChange_Consumable_<passiveID>
```

**Đã xác nhận thật (URL paldb.cc có tồn tại):**
- `PalPassiveSkillChange_Consumable_MoveSpeed_up_3`   (Swift)
- `PalPassiveSkillChange_Consumable_Vampire`          (Vampiric)
- `PalPassiveSkillChange_Consumable_Stamina_Up_3`     (Eternal Engine?)
- `PalPassiveSkillChange_Consumable_MutationPal_ExplosionResist`
- `PalPassiveSkillChange_Consumable_EternalFlame`     (nằm nhóm disabled)

**Suy ra cho 7 chiêu World Tree** (ghép passiveID đã biết chắc — độ tin cậy cao, vẫn nên test):

| Passive (VN) | passiveID | Item ID implant |
|---|---|---|
| Thánh Kiếm Hai Lưỡi | `WorldTree_ATK` | `PalPassiveSkillChange_Consumable_WorldTree_ATK` |
| Thành Trì Thịt Sống | `WorldTree_DEF` | `PalPassiveSkillChange_Consumable_WorldTree_DEF` |
| Bàn Tay Ác Quỷ | `WorldTree_CraftSpeed` | `PalPassiveSkillChange_Consumable_WorldTree_CraftSpeed` |
| Vườn Ươm Cây Thần | `WorldTree_FullStomach` | `PalPassiveSkillChange_Consumable_WorldTree_FullStomach` |
| Tiên Nhân | `WorldTree_Sanity` | `PalPassiveSkillChange_Consumable_WorldTree_Sanity` |
| Cú Nhảy Không Gian | `WorldTree_MoveSpeed` | `PalPassiveSkillChange_Consumable_WorldTree_MoveSpeed` |
| Thần Hủy Diệt | `WorldTree_ATK_DEF` | `PalPassiveSkillChange_Consumable_WorldTree_ATK_DEF` |

**Cách test (rẻ, làm trước mọi thứ khác):**
```bash
cd tools
node rawcmd.js "ITEM PalPassiveSkillChange_Consumable_WorldTree_ATK 1 <tên nhân vật>"
```
Rồi **vào game xem túi đồ** (log OK không đủ tin). Có item → mô hình bán chạy được ngay,
**không cần mod gì cả** cho phần bán. Chỉ còn phần nerf drop.

### CHƯA BIẾT — phải tra trước khi nerf
**Nguyên liệu nào chế ra implant?** Đây là thứ cần nerf, mà chưa xác định.
Nghi ngờ (từ drop của Silvance): Ancient Civilization Core, World Tree Holy Water,
Grass Radiant Gem, các loại Ancient Relic. **Phải tra công thức chế implant thật** rồi mới
biết nerf cái gì — nerf nhầm thì vừa không chặn được farm, vừa phá thứ khác.

---

## 5. BA hướng cũ (lưu lại để tham khảo, đã bị kế hoạch trên thay thế)

### Hướng A: Sửa DataTable + bán implant bằng DogCoin ⭐ khuyên dùng
```
1. PalSchema: thêm dòng cho mọi passive muốn có, đặt Price = 0
2. Giữ RequireItemId = implant tương ứng (làm "vé vào cửa")
3. Bot Discord: người chơi trả DogCoin -> bot tặng implant qua give-item (ĐÃ CHẠY)
4. Người chơi vào bàn phẫu thuật đổi passive, không tốn Gold
```
- ✅ Giữ trải nghiệm gốc trong game
- ✅ Chỉ cần sửa DataTable (đã biết chắc làm được) + hệ thống đã có
- ✅ Giá do bot kiểm soát, đổi lúc nào cũng được, không cần restart server
- ⚠️ Chưa chắc: Blueprint có thật sự chặn khi thiếu `RequireItemId` không → phải test

### Hướng B: Bỏ qua bàn phẫu thuật, làm hẳn qua bot
```
Người chơi trả DogCoin -> bot -> mod Lua ghi thẳng PassiveSkillList của pal
```
- ✅ Không mod dữ liệu game chút nào, dùng kỹ thuật ĐÃ chứng minh (give-pal đang ghi passive y hệt)
- ✅ Kiểm soát tuyệt đối
- ❌ Cần code mới: tìm đúng con pal trong kho của người chơi (hiện mod chỉ ghi được lúc spawn pal mới)
- ❌ Người chơi thao tác trên Discord, không phải trong game

### Hướng C: Sửa Blueprint để đổi thẳng Gold -> DogCoin
- ❌ Khó nhất, PalSchema có loader `blueprints` nhưng chưa rõ sửa được tới đâu
- ❌ Dễ hỏng khi game update
- → Chỉ làm nếu A và B đều không đạt

---

## 5. Việc cần làm tiếp (cần server chạy được)

Mod đã có sẵn lệnh `DUMP`/`DUMPP` — **không cần tải SDK dump của ai cả**, tự tra trực tiếp trên đúng phiên bản game đang chạy:

```bash
cd tools
node rawcmd.js "DUMPP /Script/Pal.PalMapObjectOperatingTableModel"
node rawcmd.js "DUMPP /Script/Pal.PalMasterDataTableAccess_OperatingTablePassiveSkillData"
```
Rồi đọc `dump.log` trên server (qua `node cat.js`).

Sau đó:
1. Tìm đường dẫn asset thật của DataTable (để PalSchema loader `raw` nhắm vào).
2. Đọc docs PalSchema: https://okaetsu.github.io/PalSchema/docs/gettingstarted
3. Viết JSON thêm dòng + `Price = 0` → restart server → **test bằng cách vào game phẫu thuật thật** (log không đủ tin, bài học từ vụ passive skill).

---

## 0. ⭐ KẾT QUẢ TEST THẬT TRÊN SERVER (2026-08-07) — ĐỌC PHẦN NÀY TRƯỚC

### ✅ MÔ HÌNH BÁN IMPLANT CHẠY ĐƯỢC — không cần mod game
Đã tặng `PalPassiveSkillChange_Consumable_WorldTree_ATK` bằng lệnh `ITEM` sẵn có
→ **vào game bàn phẫu thuật hiện đúng "Grant this Pal Twin-Edged Holy Blade?"** (có ảnh xác nhận).

→ Bot Discord bán implant lấy DogCoin **dùng thẳng `give-item` đã chạy ổn định**, không cần
sửa DataTable, không cần đụng Blueprint. **Phần bán coi như xong về mặt kỹ thuật.**

### ✅ Tên DataTable bàn phẫu thuật (lấy bằng lệnh DTINFO trên server thật)
```
DataTable /Game/Pal/DataTable/MapObject/DT_OperatingTablePassiveSkillDataTable
```
→ Tên dùng cho PalSchema: **`DT_OperatingTablePassiveSkillDataTable`**

### ✅ Implant KHÔNG phải đồ chế tạo
Chúng đến từ **Ancient Relic Recycler** (công nghệ cấp 74): nạp **Ancient Relic** vào → ra
implant **ngẫu nhiên**. Relic rơi ở vùng World Tree.
→ **Thứ cần nerf là Ancient Relic**, KHÔNG phải Ancient Civilization Core như nghĩ ban đầu.

Silvance rơi đủ 5 loại relic: Decayed (10%), Dormant (5%), Gorgeous (3.33%), Glowing (2.5%),
Glistening (2%).

⚠️ **Lưu ý:** relic + implant còn ra từ **rương ở vùng World Tree / đảo bay** và **trại NPC cấp cao**
— đó là bảng loot khác. Nerf drop của pal **không chặn hết** được. Muốn kín phải nerf cả rương.

💡 Điểm hay: recycler cho implant **ngẫu nhiên**, còn bot bán **đúng cái người chơi muốn**
→ sản phẩm của bạn tốt hơn farm, không chỉ tiện hơn.

### ✅ ID nội bộ đã tra
| Tên hiển thị | ID nội bộ |
|---|---|
| **Silvance** (No. 193) | **`Mothman`** ⚠️ khác hoàn toàn tên hiển thị |
| Gold Coin | `Money` |
| Dog Coin | `DogCoin` |
| Mimog (No. 144) | chưa tra |

→ Dòng drop của Silvance sẽ là `Mothman000`, `Mothman001`, ... (quy tắc `<ID>` + 3 chữ số)

### ⭐⭐ AUTO-RELOAD CHẠY ĐƯỢC — không cần restart khi sửa JSON PalSchema
Sau khi bật `enableAutoReload: true`, chỉ cần **upload file JSON là PalSchema tự nạp lại ngay**:
```
[PalSchema] DT_OperatingTablePassiveSkillDataTable: 0 rows updated, 1 rows added, 0 errors.
[PalSchema] Auto-reloaded mod BialkServer
```
→ Vòng lặp sửa–thử rút từ **vài phút (restart)** xuống **vài giây**. Rất quan trọng.

⚠️ Lưu ý: chỉ đúng với **JSON của PalSchema**. Sửa **mod Lua** (`main.lua`) thì **vẫn phải restart**
— UE4SS chỉ nạp Lua lúc khởi động.

### Nơi đọc log PalSchema
Nằm chung trong **`Pal/Binaries/Win64/ue4ss/UE4SS.log`** (không có file log riêng), tìm dòng `[PalSchema]`.
Dòng quan trọng nhất có dạng:
`DT_<Ten>: N rows updated, N rows added, N rows deleted, N errors.`
→ `errors > 0` hoặc không thấy dòng nào = JSON của mình sai / không được nạp.

### Mod PalSchema của server (nguồn giữ trong project)
`palschema-mods/BialkServer/` → upload lên `PalSchema/mods/BialkServer/` bằng:
```bash
cd tools
node putfile.js "../palschema-mods/BialkServer/raw/<file>.json" \
  "/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/mods/BialkServer/raw/<file>.json"
```
Gỡ mod = xoá thư mục `BialkServer` trên server → về mặc định hoàn toàn (PalSchema không sửa file gốc).

### Lệnh chẩn đoán mới thêm vào mod (cần restart server mới nạp)
| Lệnh | Công dụng |
|---|---|
| `DTINFO <ten class>` | In đường dẫn DataTable thật + toàn bộ tên dòng |
| `PASSCHK <passiveId>` | Hỏi thẳng bảng: passive này **có dòng hay không** (dùng `BP_FindRowByPassiveSkill`) |

`PASSCHK Legend` chính là câu trả lời dứt điểm cho câu hỏi "7 cái bị khoá có cứu được không":
- Có dòng → bị khoá vì lý do khác, thêm dòng vô ích
- Không có dòng → **thêm dòng bằng PalSchema là cứu được**

### ✅ PalSchema THÊM ĐƯỢC DÒNG MỚI
Mod mẫu chính chủ tạo hẳn pal mới `MyCustomPal5` trong `DT_PalMonsterParameter`.
→ Giả thuyết cứu 7 passive bị khoá là khả thi về kỹ thuật.

---

## 0b. ⭐ MÁY ANCIENT RELIC RECYCLER — ĐÃ MỔ XẺ XONG (2026-08-07)

### Chuỗi cơ chế
```
Relic (WorldTreeRelic_01..05)
  → UPalMapObjectRecyclerParameterComponent.RelicItemSettings  (map relic -> LotteryName)
    → DT_FieldLotteryNameDataTable: ItemSlot1..15_ProbabilityPercent   ← CHỖ SỬA
      → DT_ItemLotteryData: mỗi slot chứa item gì (FieldName, SlotNo, WeightInSlot,
        StaticItemId, MinNum, MaxNum)
```

### Tên bảng + tên dòng (lấy bằng DTINFO trên server thật)
- Bảng: **`DT_FieldLotteryNameDataTable`** (`/Game/Pal/DataTable/Common/`), **511 dòng**
- 5 dòng của máy recycler:
```
AncientRelicRecycler_WorldTreeRelic_01   (Decayed)
AncientRelicRecycler_WorldTreeRelic_02   (Dormant)
AncientRelicRecycler_WorldTreeRelic_03   (Gorgeous)
AncientRelicRecycler_WorldTreeRelic_04   (Glowing)
AncientRelicRecycler_WorldTreeRelic_05   (Glistening)
```

### ⭐ BẢN ĐỒ SLOT — ĐÃ XÁC ĐỊNH BẰNG THỬ NGHIỆM THẬT (2026-08-07)

| Slot | Pool | Xử lý |
|---|---|---|
| 1–2 | (không dùng) | — |
| 3–7 | Awakening Materials (đá quý, nguyên liệu) | ✅ giữ |
| **8** | Disposable Implants **hoặc** Ancient Civilization Cores | ❌ **TẮT** |
| **9** | Cái còn lại của cặp trên | ❌ **TẮT** |
| 10–12 | Skill Cards / Fruits / Books | ✅ giữ |
| 13 | Ancient Blueprints | ✅ giữ |
| **14** | Mutation Disposable Implants | ❌ **TẮT** |
| 15 | (không dùng) | — |

**Cách xác định:** đặt một nhóm slot = 100%, các slot khác = 0, rồi tái chế 1 relic —
thứ hiện ra chính là nội dung nhóm đó. Dứt khoát, không cần thống kê nhiều lần.
Chuỗi thử: 1–5 → 6–7 (ra đá quý) → 8–11 (ra Core+Implant) → 8–9 (ra đúng Core x61 + Implant)
→ 10–15 (ra Mutation) → 14 (chỉ ra Mutation ⇒ chốt).

⚠️ **THỨ TỰ SLOT KHÔNG GIỐNG THỨ TỰ HIỂN THỊ TRÊN PALPEDIA.** Đoán theo palpedia
(Implants=6, Cores=7) là **SAI** — slot 6–7 thực ra là đá quý. Bài học: phải thử, đừng suy từ
thứ tự hiển thị của web.

### File áp dụng
`palschema-mods/BialkServer/raw/recycler.json` — chỉ ghi 3 slot (8, 9, 14) = 0 cho cả 5 dòng
`AncientRelicRecycler_WorldTreeRelic_01..05`. **Cố ý không đụng 12 slot còn lại** để chúng giữ
giá trị gốc. PalSchema xác nhận `5 rows updated, 0 errors`.

⚠️ Trong lúc thử nghiệm đã ghi đè cả 15 slot của dòng `_05` → **phải restart một lần** sau khi
áp bản cuối thì 12 slot kia mới trở về giá trị gốc (PalSchema vá lúc chạy, gỡ field khỏi JSON
không tự hoàn tác cho tới khi khởi động lại).

### Các pool phần thưởng (theo palpedia) và slot phỏng đoán ban đầu (ĐÃ SAI, giữ để đối chiếu)
| Pool | Số roll | Slot (đoán) | Decayed | Glistening |
|---|---|---|---|---|
| Awakening Materials (9 món) | 5 | 1–5 | 18% | 35% |
| **Disposable Implants (16)** | 1 | **6** | 0.81% | 13% |
| **Ancient Civilization Cores (1)** | 1 | **7** | 20% | 41% |
| Skill Cards / Fruits / Books (90) | 3 | 8–10 | 4.3% | 8.8% |
| Ancient Blueprints (28) | 1 | 11 | 0.13% | 20% |
| Mutation Disposable Implants (5) | 1 | 12 | — | 19% |

Tổng 12 slot / 15 → khớp. **Thứ tự slot mới là PHỎNG ĐOÁN theo thứ tự hiển thị trên palpedia**,
chưa xác minh. Kiểm chứng bằng cách tái chế Glistening relic (Core 41%, ra x5–10 → thấy ngay).

### Đã áp dụng
`palschema-mods/BialkServer/raw/recycler.json` — đặt `ItemSlot6/7_ProbabilityPercent = 0`
cho cả 5 dòng. PalSchema báo: **`5 rows updated, 0 errors`** → tên bảng/dòng/field đều ĐÚNG.
Còn lại chỉ chưa chắc slot 6/7 có đúng là Implants/Cores hay không.

### Vì sao nerf máy chứ không nerf pal
Hơn **50 pal** rớt Ancient Relic (boss, biến thể, Awakening Lv80...) — sửa hết là bất khả thi.
Mà máy này còn cho Core nhiều hơn drop của pal: **20–41% × x5–10 mỗi lần**, palpedia gọi nó là
*"lý do chính để giữ máy chạy"*. Chặn ở máy là chặn đúng cổ chai.

Quan trọng: pool tách riêng nên tắt Cores + Implants **KHÔNG làm relic thành rác** — vẫn đổi được
Awakening Materials, Skill Cards, Ancient Blueprints, Mythical Wood, Paloxite.

### Công thức xây máy (để test)
Công nghệ **cấp 74**, 3 điểm. Vật liệu: 50 Paloxite Ingot, 50 Mythical Wood,
30 Ancient Civilization Parts, 20 Ancient Civilization Core.
ID dùng để tặng: `PaloxiteIngot`, `MythicalWood`, `AncientCivilizationParts`,
`AncientCivilizationCore` (log báo OK — **cần xác nhận trong game**).

---

## 6. ✅ ĐỊNH DẠNG PALSCHEMA — ĐÃ XÁC MINH (2026-08-07, từ mod mẫu chính chủ)

### Cấu trúc thư mục
```
PalSchema/mods/<TenMod>/
├── metadata.json        { "name": "...", "authors": ["..."], "description": "", "version": "1.0.0" }
└── raw/
    └── <bat-ky-ten>.json
```
Trên server: `/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/mods/`
(kiểm tra 2026-08-07: đang **rỗng**)

### Định dạng JSON trong `raw/`
```json
{ "<TenDataTable>": { "<TenDong>": { "<Field>": giá_trị } } }
```
Ví dụ thật (mod mẫu `CattivaWithDogenPartnerSkill`):
```json
{ "DT_PalMonsterParameter": { "PinkCat": { "OverridePartnerSkillTextID": "PARTNERSKILL_SifuDog" } } }
```

### ⭐ PalSchema chỉ MERGE field được ghi, KHÔNG ghi đè cả dòng
→ Sửa `Rate` của DogCoin **không làm hỏng** các drop khác trong cùng dòng. Đây là điều lo lắng
trước đó (sợ phải ghi lại đủ 5 ô), giờ hết lo.

### Loader (tên thư mục quyết định cách xử lý)
`raw` (mọi DataTable, không kiểm tra an toàn), `pals`, `items`, `buildings`, `blueprints`,
`appearance`, `enums`, `skins`, `spawns`, `translations`, `helpguide`. → Việc của ta dùng **`raw`**.

### Tên DataTable
| Bảng | Tên | Trạng thái |
|---|---|---|
| Drop của pal | **`DT_PalDropItem`** | ✅ xác nhận (docs PalSchema + nhiều mod Nexus) |
| Drop chung | `DT_PalDropItem_Common` | ✅ |
| Tham số pal | `DT_PalMonsterParameter` | ✅ mod mẫu |
| **Bàn phẫu thuật** | ❓ **chưa biết** | phải dò bằng `DUMP` |

### ⭐ Quy tắc đặt tên DÒNG trong `DT_PalDropItem`
Docs dùng ví dụ **`SheepBall000`** → `<CharacterID>` + số thứ tự 3 chữ số.
Giải thích vì sao 1 pal có nhiều dòng: `Silvance000`, `Silvance001`, ...

### Cách dò tên DataTable bàn phẫu thuật (khi server chạy)
`DUMP` dùng `StaticFindObject(path)`, báo "KHONG TIM THAY" nếu sai → **dò rẻ, thử nhiều lần được**:
```bash
node rawcmd.js "DUMP /Game/Pal/DataTable/Character/DT_PalDropItem"
```
Docs nói drop table ở `Character/DT_PalDropItem` → đường dẫn game nhiều khả năng có dạng
`/Game/Pal/DataTable/<thư mục>/DT_<Tên>`.

### Mod người khác đã làm việc tương tự (chưa đọc được nội dung — bị chặn)
- **Complete Passive Surgery** — nexusmods.com/palworld/mods/3720 (Nexus trả 403)
- **Pal Surgery Table Unlocker (PalSchema)** — Steam Workshop id 3761679027 (kết nối bị reset)
→ Nếu tải được, JSON của họ chỉ thẳng tên DataTable + cách bật 7 implant bị khoá. **Rất đáng thử lại.**

---

## Nguồn tra cứu MỚI (thay cho SDK dump cũ đã chết)

**`localcc/PalworldModdingKit`** — cập nhật 07/2026, đúng bản game 1.0, ~1000 header, mỗi class 1 file:
`https://github.com/localcc/PalworldModdingKit` → `Source/Pal/Public/<TenClass>.h`

Bản dump cũ (`VeroFess/PalWorld-Server-Unoffical-Api`) từ 02/2024 — **đã chết 2.5 năm, không có nội dung mới**, đừng dùng nữa.

Liệt kê nhanh file theo từ khoá:
```bash
curl -s "https://api.github.com/repos/localcc/PalworldModdingKit/git/trees/main?recursive=1" \
 | grep -oE '"path": *"[^"]*"' | grep -i "<tu khoa>"
```
