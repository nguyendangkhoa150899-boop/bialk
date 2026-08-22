# Pak mods cho server (Linux native)

Mod dạng `.pak` — không cần UE4SS/PalSchema/Wine. Các file độc lập, muốn tắt cái nào
thì xóa file đó khỏi `~mods/` rồi restart:

| File | Tác dụng |
|---|---|
| `BialkServer_P.pak` | Máy nghiền cổ vật không rớt implant + lõi cổ đại |
| `BialkSilvanceNoDrop_P.pak` | Silvance (mọi cấp, cả boss) không rớt gì hết |
| `BialkRaidTimer_P.pak` | Raid: timer 4 TIẾNG + CHỈ Ultra/Master buff trường kỳ (máu to, giáp 20%, attack 250-350%) + pal nở từ trứng KHÔNG phối giống được |
| `BialkSurgeryOff_P.pak` | VÔ HIỆU bàn phẫu thuật toàn server (chặn cheat mod client đổi passive) |

**Đồ nghề build đã lưu bền tại `C:\Users\Khoa\Desktop\palworld\pak-tools\`**
(repak.exe + UAssetCLI + json đã vá) — khỏi tải lại. Game gốc: `E:\SteamLibrary\steamapps\common\Palworld\Pal\Content\Paks\Pal-Windows.pak`.

---

# BialkServer_P.pak

## Nội dung

Sửa `Pal/Content/Pal/DataTable/Common/DT_FieldLotteryNameDataTable`, 5 dòng
`AncientRelicRecycler_WorldTreeRelic_01..05` (máy nghiền cổ vật):

| Slot | Vật phẩm | Trước | Sau |
|---|---|---|---|
| 8 | `PalPassiveSkillChange_Consumable_*` (implant, 16 loại) | 0.81 – 13 % | **0** |
| 9 | `AncientParts2` (lõi công nghệ cổ đại) | 20 – 41.5 % | **0** |
| 14 | Implant đột biến + `RideJumpCount_Increase2` (chỉ dòng `_05`) | 19.44 % | **0** |

Giữ nguyên: slot 10–12 chứa `TechnologyBook_G1/G2/G3` + `AncientTechnologyBook_G1`
(sách kỹ năng vẫn rơi bình thường), và toàn bộ slot khác.

**Cảnh giác slot 14**: ở dòng `_01..._04` nó bằng 0 sẵn nên nhìn dòng `_01` sẽ tưởng slot này
"không tồn tại" — nhưng dòng `_05` (relic bậc cao nhất) có 19.44% toàn implant. Danh sách
vật phẩm mỗi slot **khác nhau giữa các dòng**, phải soi đủ cả 5 dòng trong `DT_ItemLotteryDataTable`.

## Cài đặt

Chép vào `Pal/Content/Paks/~mods/` trên server. Không cần mod phía client.

## Thông số đóng gói

Khớp với `CreativeMenu_P.pak` (mod đã chạy được trên server này):

```
version: V11    path hash seed: 2D9081FC    mount point: ../../../
```

## Quy trình dựng lại

Công cụ: [UAssetCLI](https://github.com/jpabscale/UAssetCLI) (cần .NET 10 runtime)
+ [repak](https://github.com/trumank/repak). `Mappings.usmap` để kèm trong thư mục này,
lấy từ [PalworldModding/UsefulFiles](https://github.com/PalworldModding/UsefulFiles).

```bash
# 1. Lấy file gốc từ pak của game
repak unpack Pal-Windows.pak -o extracted

# 2. uasset -> json  (BẮT BUỘC có mappings: Palworld dùng unversioned properties)
dotnet UAssetCLI.dll tojson DT_FieldLotteryNameDataTable.uasset table.json VER_UE5_1 Mappings.usmap

# 3. Sửa json: đặt ItemSlot8/9/14_ProbabilityPercent = "+0" cho 5 dòng recycler

# 4. json -> uasset
dotnet UAssetCLI.dll fromjson table_patched.json build/Pal/Content/Pal/DataTable/Common/DT_FieldLotteryNameDataTable.uasset Mappings.usmap

# 5. Đóng gói
repak pack build BialkServer_P.pak --version V11 -p 764445180
```

## Những chỗ dễ vấp

- **Số 0 phải ghi là `"+0"`**, không phải `0.0` — đó là cách UAssetAPI biểu diễn float 0
  trong file này (các slot vốn bằng 0 đều hiện `"+0"`).
- **Không dùng UAssetGUI CLI**: bản v1.1.0 nhận lệnh `tojson` rồi thoát exit 0 mà không
  tạo file, cũng không báo lỗi. UAssetCLI in lỗi rõ ràng ra stdout.
- **Không bao giờ chép file `.uasset`/`.uexp` qua cmdlet văn bản** (`Get-Content`/`Set-Content`/
  `Out-File`). Nó sẽ chèn BOM `EF BB BF` và biến mọi byte ≥ 0x80 thành `EF BF BD`, phá hỏng
  file. Dấu hiệu: UAssetCLI báo `File signature mismatch` (chữ ký đúng là `C1 83 2A 9E`).

## Đã kiểm chứng

- Round-trip file gốc (json → uasset) ra **byte giống hệt** → công cụ không làm biến dạng dữ liệu.
- Đọc ngược file đã sửa: slot 8/9/14 = `+0` ở cả 5 dòng, slot 10 giữ nguyên giá trị cũ.
- Bung ngược pak: 2 file khớp hash với file đem đóng gói.
- Đối chiếu slot ↔ vật phẩm lấy từ `DT_ItemLotteryDataTable` của game, không phải phỏng đoán.
- **Test trong game (08/08/2026): recycler hết rớt implant + lõi, các đồ khác vẫn rơi.** ✅

---

# BialkSilvanceNoDrop_P.pak

Silvance không rớt bất kỳ đồ gì, mọi cấp độ, cả bản thường lẫn boss.

## Nội dung

Sửa `Pal/Content/Pal/DataTable/Character/DT_PalDropItem` **và** `DT_PalDropItem_Common`
(vá cả 2 biến thể cho chắc — không rõ server load bản nào).

Silvance = mã nội bộ **`Mothman`** (xác nhận qua `DT_PalNameText_Common` bản en).
Bảng rơi đồ có **4 dòng** cho nó — toàn bộ `Rate1..Rate10` đặt về `"+0"`:

| Dòng | Áp dụng | Đồ gốc đáng chú ý |
|---|---|---|
| `Mothman000` | thường, cấp < 70 | PalUpgradeStone4, **AncientParts2** |
| `BOSS_Mothman000` | boss, cấp < 70 | PalCrystal_Ex, đồ bán |
| `Mothman070` | thường, cấp ≥ 70 | AncientParts2, WorldTreeRelic_01..05 |
| `BOSS_Mothman070` | boss, cấp ≥ 70 | UniqueMaterial_Mothman, WorldTreeRelic_01..05 |

**Bài học quan trọng**: đây là lý do bản PalSchema cũ (`drop_silvance.json`) thất bại với
Silvance cấp cao — nó chỉ vá 2 dòng `*000`, không biết tồn tại 2 dòng `*070` dành riêng
cho cấp ≥ 70. Muốn tắt drop một pal phải grep đủ MỌI dòng có `CharacterID` trùng.

## Lưu ý phạm vi

Pak này thay **toàn bộ** bảng `DT_PalDropItem` (bảng chung của mọi pal) bằng bản
v0.6.x chỉ sửa 4 dòng Mothman. Nếu game ra bản mới đổi drop của pal khác, bảng cũ
trong pak sẽ đè lên → cần trích lại bảng mới và vá lại.

## Đã kiểm chứng

- Round-trip `DT_PalDropItem_Common` gốc: byte giống hệt.
- Đọc ngược sau vá: 4/4 dòng, 40/40 rate = `+0`.
- Đóng gói cùng thông số V11 + seed như pak recycler (đã chứng minh chạy được trên server này).

**Chưa test trong game.**

---

# BialkRaidTimer_P.pak

Boss triệu hồi ở Tế đàn (Summoning Altar) — bản v7 (09/08/2026):

0. **CHỈ Ultra/Master thành boss trường kỳ** (mọi boss THƯỜNG nguyên bản game) —
   chỉnh trong `DT_PalMonsterParameter*` (đường vá phẫu thuật, xem mục FName bên
   dưới). Máu hiệu dụng Ultra ~18-22M, bỏ giáp dày, attack còn 250-350%:

   | Dòng RAID_ | EnemyMaxHPRate | ReceiveDamageRate (giáp) | InflictDamageRate (attack) |
   |---|---|---|---|
   | NightLady_Dark_2 (Ultra Libero) | 420 → 2950 | 0.09 → 0.8 | 10 → 2.5 |
   | KingBahamut_Dragon_2 (Ultra Blazamut) | 500 → 3300 | 0.09 → 0.8 | 8 → 2.5 |
   | DarkMechaDragon_2 (Ultra Xenolord) | 420 → 2890 | 0.085 → 0.8 | 13 → 3.5 |
   | LegendDeer_2 (Ultra Hartalis) | 320 → 2360 | 0.2 → 0.8 | 13 → 3.5 |
   | YakushimaBoss002_2 + 2 tay + đầu (Master Moon Lord) | 480/80/80/150 → 3270/545/545/1020 | 0.25 → 0.8 | 7 → 2.5 |
   | YakushimaBoss001_Green_2 (mob phụ Master) | giữ | giữ | 7 → 2.5 |

   **Không đụng**: TOÀN BỘ boss thường (Bellanoir, Libero, Blazamut Ryu, Xenolord,
   Moon Lord, Hartalis bản thường). Sửa số: `pak-tools\patch_raidhp.js` (bảng CONFIG
   đầu file) + verify bằng `pak-tools\verify_v4.js` (35 khác biệt kỳ vọng: 10 cấm đẻ
   + 25 field Ultra).

1. Thời gian đánh boss: **4 TIẾNG** (`TimeLimit = 14400`; bản 900 = 15 phút đã test OK
   trong game). Lưu ý: server restart giữa trận là boss biến mất (trạng thái raid
   không lưu vào save).
2. Trứng rớt **như game gốc** (bản v2 từng xóa trứng — đã bỏ), NHƯNG pal raid nở ra
   **không phối giống được**: 10 dòng (NightLady, NightLady_Dark, KingBahamut_Dragon,
   DarkMechaDragon, LegendDeer + 5 bản BOSS_) đặt `MaleProbability = 0` trong
   `DT_PalMonsterParameter` + `_Common` → toàn con cái, cùng loài không ghép đôi được,
   lai chéo loài đã bị `IgnoreCombi=true` của game gốc chặn.

**Lỗ hổng còn lại phải biết**: pal raid ĐỰC nở từ trứng TRƯỚC khi cài bản này vẫn
ghép được với con cái mới. Server xóa trứng suốt giai đoạn v2 nên cửa này hẹp,
nhưng nếu cần triệt để thì rà save tìm con đực cũ. Ngoài ra nếu sau này bật lại
bàn phẫu thuật (đổi giới tính) là mở lại đường sinh sản.

## Nội dung 1: timer (BP_PalRaidBossManager)

Sửa `Pal/Content/Pal/Blueprint/RaidBoss/BP_PalRaidBossManager`: **thêm** property
`TimeLimit` (float) = `900.0` vào CDO (`Default__BP_PalRaidBossManager_C`).

**Điểm mấu chốt**: `TimeLimit` KHÔNG có sẵn trong blueprint — giá trị mặc định 600 giây
nằm trong C++ class `PalRaidBossManager` (`/Script/Pal`). Vì Palworld dùng unversioned
properties + có schema trong `Mappings.usmap`, chỉ cần THÊM property vào CDO là engine
đọc được và override giá trị C++. Đây là đúng kỹ thuật của mod
[Longer Boss Battle Timer](https://www.nexusmods.com/palworld/mods/3694) trên Nexus
(`setOrAddScalar: BP_PalRaidBossManager :: TimeLimit`).

Thứ tự property trong Data không cần lo — UAssetAPI tự xếp theo schema khi ghi
(đọc ngược thấy `TimeLimit` nằm sau `RaidBossDataTable`, trước `BattleAreaRadius`).

Muốn đổi thời gian khác: sửa `Value` của `TimeLimit` trong
`pak-tools\BP_PalRaidBossManager_patched.json` rồi build lại (fromjson + pack như dưới).

## Nội dung 2: chặn phối giống pal raid (DT_PalMonsterParameter + _Common)

**⚠️ BẢNG NÀY DÍNH BUG FNAME — KHÔNG round-trip qua JSON được.** Các dòng
`RAID_*_2` (boss Ultra) có enum Tribe đuôi `_2` (vd `YakushimaBoss002_2`);
UAssetAPI tách `_2` thành instance number và ghi lại sai thành `YakushimaBoss002`
→ hỏng Tribe của boss Ultra. Round-trip check đã bắt được (uexp lệch byte).

**Cách vá an toàn đã dùng — VÁ BYTE PHẪU THUẬT** (scripts trong `pak-tools\`):
1. `patch_nobreed.js`: sửa JSON MaleProbability=0 (giữ `IsZero=false` để không lệch cấu trúc)
2. fromjson cả bản gốc lẫn bản sửa → 2 file rebuild CHỈ dùng làm bản đồ định vị
3. `surgical_patch.js`: diff 2 bản rebuild → ra đúng 10 offset byte → ghi giá trị mới
   vào **file uexp GỐC nguyên vẹn** (kiểm tra byte gốc = byte rebuild-gốc tại từng offset
   trước khi ghi — lệch là dừng)
4. `verify_surgical.js`: tojson file đã vá, so TỪNG DÒNG với gốc → phải ra đúng
   10 khác biệt MaleProbability, 0 khác biệt khác, Tribe nguyên vẹn. Kết quả: ĐẠT cả 2 bảng.

Lịch sử bản v2 (đã bỏ): xóa trứng bằng cách làm rỗng `EggPalIDAndWeight` trong
`DT_PalRaidBoss*` — script `pak-tools\patch_eggs.js` còn giữ nếu muốn quay lại.

## Cài đặt

Chép vào `Pal/Content/Paks/~mods/` trên server rồi restart. Không cần mod phía client.

## Đã kiểm chứng (bản v4)

- Cơ chế timer: đã test trong game từ bản 15 phút, chạy đúng ✅ (giá trị 3h chưa test).
- 2 bảng MonsterParameter vá phẫu thuật chồng 2 lớp (cấm đẻ + buff Ultra): đọc ngược
  so từng dòng với gốc ra **đúng 35 khác biệt kỳ vọng** (10 MaleProbability + 25 field
  Ultra), 0 khác biệt lạ, boss thường nguyên bản, Tribe (vùng bug FName) nguyên vẹn.
- Bung ngược pak (6 file): hash khớp. V11 + seed `2D9081FC` như các pak kia.
- **Phần chặn đẻ + buff Ultra CHƯA test trong game.** Khi test:
  1. Đánh raid → trứng rớt như game gốc, nở ra pal toàn **con cái**.
  2. Ghép 2 con cùng loài ở trại phối giống → phải báo không ghép được (thiếu đực).
  3. Boss thường phải y hệt game gốc (máu/giáp/damage cũ).
  4. Ultra: máu hiển thị ~14-17M, đánh thấy máu tụt rõ (hết giáp 91%), không one-shot.
  5. Cân bằng 2-3 tiếng là ước tính từ DPS đội — đánh thử 1 trận rồi chỉnh CONFIG
     trong `patch_raidhp.js` nếu nhanh/chậm quá.

Ghi chú: pak thay **nguyên bảng** `DT_PalMonsterParameter*` (bảng chỉ số của TOÀN BỘ
pal). Game update đổi chỉ số pal là phải trích lại bảng mới và vá lại — và nhớ dùng
đường vá phẫu thuật, KHÔNG round-trip JSON (bug FName ở trên).

**Phát hiện từ data gốc**: 2 dòng Moon Lord (`PalSummon_YakushimaBoss002*`) trong game
nguyên bản đã có `EggPalIDAndWeight` RỖNG sẵn → map rỗng là trạng thái game hỗ trợ
chính thức, không có rủi ro crash.

**Kết luận thực nghiệm về tỉ lệ rớt trứng (test 09/08/2026)**: đã build pak thử
với tổng weight `EggPalIDAndWeight` = 0.3 → kết quả **10/10 trận vẫn rớt trứng**.
Code game TỰ CHUẨN HÓA weight → weight chỉ là xổ số chọn con TRONG trứng, không
phải tỉ lệ rớt. Chốt: trứng raid chỉ có 2 nấc **0% (map rỗng) hoặc 100%**; thứ
chỉnh được thêm là tỉ lệ ruột (gốc: BOSS 10% / thường 90%). Đừng thử lại "X%".
(Pak test đã xóa; script scale weight còn ở `pak-tools\patch_eggs_rate.js` — chỉ
còn hữu ích nếu muốn đổi tỉ lệ BOSS/thường.)

---

# (Đã gỡ) Thử nghiệm bàn phẫu thuật — BialkSurgery_P.pak

Đã thử thêm 7 passive khóa drop (Lucky=`Rare`, Legend, Siren of the Void=`Witch`,
Eternal Flame, Invader, Lunker=`Nushi`, Savior=`Salvation`) vào
`DT_OperatingTablePassiveSkillDataTable` (pattern WorldTree: 0 vàng + item
`PalPassiveSkillChange_Consumable_*`). **Kết quả test 09/08/2026: cài cả client
(local) vẫn không thấy dòng mới trong menu → đã gỡ pak.** Nghi vấn chưa kiểm chứng:
UI có thể chỉ hiện ca yêu cầu item khi người chơi ĐANG CÓ item đó trong túi — chưa
test lại với item trong túi (spawn `PalPassiveSkillChange_Consumable_Legend` bằng
CreativeMenu rồi mở bàn là biết).

Bài học đã xác minh (giữ lại để khỏi nghiên cứu lại):

- Struct `PalOperatingTablePassiveSkillData` chỉ có 3 field: `PassiveSkill` (FName),
  `Price` (int32, **luôn là vàng** — native code trừ, không đổi loại tiền được),
  `RequireItemId` (FName, cố định 1 item, **không có field số lượng**).
- → Không thể đặt giá phẫu thuật bằng "X DogCoin". Tối đa: `RequireItemId = DogCoin`
  = đồng giá 1 xu mọi ca.
- 7 item implant khóa drop tồn tại đầy đủ trong `DT_ItemDataTable` (chỉ tắt nguồn rớt).
- File dựng lại nếu muốn thử tiếp: `pak-tools\patch_surgery.js` +
  `pak-tools\DT_OperatingTablePassiveSkillDataTable.patched.json` (build fromjson +
  pack như quy trình chuẩn).

Hướng đã chốt thay thế: bán các implant game cho phép sẵn qua shop ticket/dashboard
theo giá DogCoin.

---

# BialkSurgeryOff_P.pak

**Vô hiệu hóa bàn phẫu thuật trên TOÀN server, phía server, người chơi không cần cài gì.**

Lý do: nghiệp vụ bàn phẫu thuật do CLIENT quyết (đã chứng minh 2 chiều — server thêm
dòng thì client không thấy; client mod bảng thì server vẫn làm theo). Người chơi cài
mod bàn phẫu thuật local là tự đổi passive thoải mái, không qua shop DogCoin. Không
chặn được validation (code native) → giải pháp: **giết chức năng cái bàn ở tầng server**.

## Nội dung

Sửa `Pal/Content/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_OperatingTable`:
đổi import `ConcreteModelClass` từ `PalMapObjectOperatingTableModel` (model xử lý
phẫu thuật phía server) → **`PalMapObjectConcreteModel`** (model trơ — các công trình
không chức năng như tường dùng mặc định này). Bàn vẫn xây/hiển thị bình thường nhưng
server không còn bộ xử lý phẫu thuật → yêu cầu đổi passive/giới tính từ bất kỳ client
nào (kể cả client mod) không có nơi nhận.

Đánh đổi: phẫu thuật hợp lệ (đổi giới tính, cấy passive trả vàng) cũng chết theo —
chấp nhận vì kinh tế server đi qua shop pal/ticket.

## Đã kiểm chứng

- Round-trip blueprint gốc: byte giống hệt. Đọc ngược file vá: `ConcreteModelClass`
  → `PalMapObjectConcreteModel`, không còn tham chiếu model cũ. Pak hash khớp, V11 + seed chuẩn.

**Chưa test trong game.** Quy trình test (LÀM LOCAL TRƯỚC — có rủi ro load save):

1. Local (single player = mình là server): vào world, **xây bàn phẫu thuật trước khi
   cài pak**, thoát. Cài pak vào `~mods` client. Vào lại world:
   - Không crash khi load world có bàn xây sẵn? (rủi ro chính: save của object cũ
     mang dữ liệu model cũ)
   - Bấm bàn → menu có thể vẫn mở (UI là của client) nhưng **bấm Sửa Đổi phải thất bại/không có gì xảy ra**.
   - Xây bàn mới vẫn đặt được (thành đồ trang trí).
2. Nếu local ổn → **backup save server** → chép pak lên `~mods/` server → restart → thử lại từ client thường.
3. **Sau khi test local xong NHỚ XÓA pak khỏi `~mods` client** trước khi vào server thật
   (client mang BP khác server có thể gây lệch replicate không cần thiết).

Nếu test thấy phẫu thuật VẪN ăn → giả thuyết model sai (RPC đi đường khác) → gỡ pak,
chuyển sang phương án quét save định kỳ tìm passive bất hợp lệ.
