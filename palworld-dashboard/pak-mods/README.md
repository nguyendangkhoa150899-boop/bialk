# Pak mods cho server (Linux native)

Mod dạng `.pak` — không cần UE4SS/PalSchema/Wine. Hai file độc lập, muốn tắt cái nào
thì xóa file đó khỏi `~mods/` rồi restart:

| File | Tác dụng |
|---|---|
| `BialkServer_P.pak` | Máy nghiền cổ vật không rớt implant + lõi cổ đại |
| `BialkSilvanceNoDrop_P.pak` | Silvance (mọi cấp, cả boss) không rớt gì hết |

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
