# Nghiên cứu: giao pal XÀI LIỀN (không chờ restart server) — 08/09/2026

## Vấn đề
Đường giao pal hiện tại của mod (`SpawnNPCForServer` → `PalCaptureSuccess` → ghi
SaveParameter → huỷ actor) chỉ ghi vào SAVE; các hệ thống RUNTIME chưa "nhận nuôi"
pal → hộp hiện pal nhưng không thao tác được, phải chờ restart server (world load
lại từ save mới đăng ký đủ).

## Đường đã thử và LOẠI
`PalPlayerState:Debug_CaptureNewMonster_ToServer(FName)` (lệnh queue `DBGPAL`):
- Gọi được, `ok=true`, pal vào hộp.
- **NHƯNG server SẬP 2/2 lần** ngay sau đó (build v1.0.4.102642, test 08/09).
- ❌ CẤM TUYỆT ĐỐI chạy `DBGPAL` trên server chính.

## Phát hiện từ mổ CreativeMenu_P.pak (mod give pal xài liền, không sập)
Pak V11 nén Oodle — đã bung 211/214 file (đồ nghề: `Desktop/palworld-analysis/`,
oodle-data-shared.dll từ repo WorkingRobot/OodleUE; 3 file fail là texture/UI
nhiều block, không cần). Parse name map + import map các blueprint server-side:

### Đường GIVE PAL vào hộp (COMP_CreativeMenuTransmitter → GivePal_ServerInternal)
Import các hàm game (class :: hàm):
```
PalUtility           :: GetInitializedCharacterSaveParemter   (sic - game gõ sai "Paremter")
PalUtility           :: GetCharacterManager
PalCharacterManager  :: CreateIndividual          ← tạo CÁ THỂ đăng ký chuẩn, KHÔNG spawn world
PalPlayerState       :: OnCreatedGrantedIndividualHandle_ServerInternal
                        ← đường "GRANTED pal" chính chủ (pal tặng/bonus của game,
                          loại nhận phát xài liền)
PalCharacterManager  :: GetIndividualHandle
PalIndividualCharacterHandle :: TryGetIndividualActor
```
Giả thuyết flow (khớp tên hàm, CHƯA xác nhận thứ tự/tham số):
1. `GetInitializedCharacterSaveParemter(CharacterID, ...)` → save parameter khởi tạo chuẩn
2. `GetCharacterManager()` → manager
3. `CreateIndividual(...)` → handle cá thể (đã đăng ký runtime)
4. `PlayerState:OnCreatedGrantedIndividualHandle_ServerInternal(handle)` → vào hộp người chơi

### Đường SPAWN pal ra world (BP_ServerComponent)
```
PalUtility::GetInitializedCharacterSaveParemter + GetCharacterManager
PalCharacterManager::SpawnNewCharacter   (+ BP_MonsterAIController_Wild_C,
BeginDeferredActorSpawnFromClass/FinishSpawningActor)
```

### Bonus (giao item không cần queue? - chưa cần, đường SFTP đang ổn)
```
PalPlayerInventoryData::AddItem_ServerInternal
PalUtility::GetInventoryDataByPlayerUID
```

## CHỮ KÝ HÀM (dump thật từ server test v1.0.4, 08/09 - lệnh DUMPP)
```
bool PalUtility::GetInitializedCharacterSaveParemter(
    Object WorldContextObject, FName CharacterID, FName UniqueNPCID, int Level,
    FGuid OwnerPlayerUId, OUT FPalIndividualCharacterSaveParameter outParameter,
    bool DisableRandomPassiveSkill, bool RarePalAble)

UPalIndividualCharacterHandle* UPalCharacterManager::CreateIndividual(
    FPalIndividualCharacterSaveParameter InitParameter, Delegate spawnCallback)
UPalIndividualCharacterHandle* UPalCharacterManager::CreateIndividualByFixedID(
    FIndividualId ID, FPalIndividualCharacterSaveParameter InitParameter, Delegate spawnCallback)

PalIndividualCharacterHandle:  GetIndividualID() -> struct  |  property .ID (struct)
void APalPlayerState::OnCreatedGrantedIndividualHandle_ServerInternal(FIndividualId IndividualId)
```
Điểm sướng: Init nhận thẳng Level + OwnerPlayerUId + DisableRandomPassiveSkill -
level và chủ sở hữu set ngay lúc tạo. Ẩn số còn lại: cách UE4SS Lua truyền
out-param struct + delegate param (thử nghiệm bằng GIVEPAL2 bên dưới).

## Lệnh thử nghiệm GIVEPAL2 (đã viết trong main.lua, 08/09)
`GIVEPAL2 <species> <level> <player>` qua queue.txt - chạy flow trên, log TỪNG BƯỚC
(b1..b6) vào results.log để lần hỏng nào cũng biết đứt ở đâu. CHỈ CHẠY TRÊN TEST.

## Bước kế tiếp (làm trên SERVER TEST, người chơi online, chấp nhận rủi ro sập)
1. Dùng lệnh `DUMP` của mod lấy CHỮ KÝ 4 hàm:
   - `DUMP /Script/Pal.PalUtility` (tìm GetInitializedCharacterSaveParemter)
   - `DUMP /Script/Pal.PalCharacterManager` (CreateIndividual)
   - `DUMP /Script/Pal.PalPlayerState` (OnCreatedGrantedIndividualHandle_ServerInternal)
2. Viết lệnh thử nghiệm `GIVEPAL2 <species> <player>` trong main.lua theo flow trên.
3. Test: pal vào hộp + XÀI ĐƯỢC NGAY + không sập + qua restart vẫn còn.
4. OK thì thử bước ghi chỉ số (Lv/IV/soul/passive) TRƯỚC khi đưa vào
   OnCreatedGranted... (sửa save parameter sau bước 1 - lúc đó chưa đăng ký nên an toàn?)
5. Ổn hết mới đổi đường chính của `givePal` + xoá câu "DÙNG ĐƯỢC sau restart" trên web.

## Lưu ý khi game UPDATE (lý do làm nghiên cứu này)
- Tên hàm trên là của build v1.0.4; update lớn có thể đổi. Cách dò lại: mổ pak
  CreativeMenu bản mới y hệt quy trình này (đồ nghề + script còn ở Desktop/palworld-analysis).
- `Mappings.usmap` trong repo cũng phải thay bản mới theo game thì các pak mod tự build
  (RaidTimer...) mới vá lại được.


## KẾT QUẢ THỬ 08/09 + code GIVEPAL2 (đã GỠ khỏi main.lua, lưu đây để làm tiếp)
- b1 OK sau khi sửa: UId lấy qua PlayerController:GetPlayerUId() (KHÔNG phải PlayerState).
- b2 OK: PalUtility:GetCharacterManager(playerState) trả manager valid.
- b3 CRASH NATIVE (văng nhân vật/server, pcall KHÔNG bắt được): gọi
  GetInitializedCharacterSaveParemter với out-param truyền bảng Lua {} -> engine nghẹn.
  RÀO CẢN: UE4SS Lua không dựng được struct FPalIndividualCharacterSaveParameter.
  CreativeMenu làm được vì là Blueprint (engine tự cấp struct native).
- Hướng nếu làm tiếp: tìm cách tạo struct tạm trong UE4SS Lua (bản UE4SS mới có
  StructUtils?), hoặc viết C++ UE4SS mod nhỏ chỉ làm việc này, hoặc mượn chính
  blueprint mod (pak) tự build thay vì Lua.

~~~lua
-- ===== Thử nghiệm GIVEPAL2 (08/09): đường "GRANTED pal" chính chủ của game =====
-- Mổ từ CreativeMenu (xem GHI-CHU-GIVE-PAL-XAI-LIEN.md): pal tạo qua CharacterManager
-- + grant vào PlayerState -> đăng ký ĐỦ hệ thống runtime -> kỳ vọng XÀI LIỀN không
-- chờ restart. Log TỪNG BƯỚC b1..b6 để hỏng đâu biết đó. CHỈ CHẠY TRÊN SERVER TEST.
local function givePal2(playerName, speciesId, level)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (GIVEPAL2) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end
    local palUtil = StaticFindObject("/Script/Pal.Default__PalUtility")
    if not palUtil or not palUtil:IsValid() then
        appendPlayerResult(playerName, "GIVEPAL2 FAIL: khong thay PalUtility")
        return
    end
    -- b1: UId nằm trên PlayerCONTROLLER (import CreativeMenu: PalPlayerController::GetPlayerUId),
    -- không phải PlayerState (đã thử, fail). Thử controller trước, state làm dự phòng.
    local uid = nil
    local okUid, errUid = pcall(function()
        local pc = playerState:GetPlayerController()
        uid = pc:GetPlayerUId()
    end)
    if uid == nil then
        local okUid2, errUid2 = pcall(function() uid = playerState:GetPlayerUId() end)
        appendPlayerResult(playerName, "GIVEPAL2 b1 uid: ctrl ok=" .. tostring(okUid) .. " err=" .. tostring(errUid) .. " | state ok=" .. tostring(okUid2) .. " err=" .. tostring(errUid2))
    else
        appendPlayerResult(playerName, "GIVEPAL2 b1 GetPlayerUId(controller) OK uid=" .. tostring(uid))
    end
    if uid == nil then return end
    local okMgr, mgr = pcall(function() return palUtil:GetCharacterManager(playerState) end)
    local mgrValid = okMgr and mgr and mgr:IsValid()
    appendPlayerResult(playerName, "GIVEPAL2 b2 GetCharacterManager ok=" .. tostring(okMgr) .. " valid=" .. tostring(mgrValid))
    if not mgrValid then return end
    -- b3: outParameter là OUT struct - UE4SS Lua có thể (a) điền vào bảng truyền vào,
    -- hoặc (b) trả thêm return value. Bắt CẢ HAI, log kiểu dữ liệu để biết đường nào ăn.
    local spTable = {}
    local okInit, ret1, ret2 = pcall(function()
        return palUtil:GetInitializedCharacterSaveParemter(playerState, FName(speciesId), FName("None"), level, uid, spTable, true, false)
    end)
    local spFilled = false
    pcall(function() spFilled = (next(spTable) ~= nil) end)
    appendPlayerResult(playerName, "GIVEPAL2 b3 ok=" .. tostring(okInit) .. " ret1=" .. tostring(ret1) .. " ret2type=" .. type(ret2) .. " ret2=" .. tostring(ret2) .. " spTableFilled=" .. tostring(spFilled))
    if not okInit then return end
    -- chọn save parameter: ưu tiên return phụ (kiểu userdata), rồi tới bảng đã điền
    local sp = nil
    if ret2 ~= nil and type(ret2) ~= "boolean" then sp = ret2
    elseif spFilled then sp = spTable
    else sp = spTable end
    appendPlayerResult(playerName, "GIVEPAL2 b3x dùng sp kiểu=" .. type(sp))
    -- b4: CreateIndividual(InitParameter, spawnCallback) - thử callback hàm rỗng, rồi nil
    local handle = nil
    local okC1, errC1 = pcall(function() handle = mgr:CreateIndividual(sp, function() end) end)
    appendPlayerResult(playerName, "GIVEPAL2 b4a CreateIndividual(cb=fn) ok=" .. tostring(okC1) .. " err=" .. tostring(errC1) .. " handle=" .. tostring(handle))
    if not okC1 or handle == nil then
        local okC2, errC2 = pcall(function() handle = mgr:CreateIndividual(sp, nil) end)
        appendPlayerResult(playerName, "GIVEPAL2 b4b CreateIndividual(cb=nil) ok=" .. tostring(okC2) .. " err=" .. tostring(errC2) .. " handle=" .. tostring(handle))
    end
    if handle == nil then
        appendPlayerResult(playerName, "GIVEPAL2 FAIL: khong co handle")
        return
    end
    -- b5: lấy IndividualId từ handle (thử hàm rồi property)
    local id = nil
    local okId, errId = pcall(function() id = handle:GetIndividualID() end)
    appendPlayerResult(playerName, "GIVEPAL2 b5 GetIndividualID ok=" .. tostring(okId) .. " err=" .. tostring(errId) .. " id=" .. tostring(id))
    if id == nil then
        local okId2, errId2 = pcall(function() id = handle.ID end)
        appendPlayerResult(playerName, "GIVEPAL2 b5b handle.ID ok=" .. tostring(okId2) .. " err=" .. tostring(errId2) .. " id=" .. tostring(id))
    end
    if id == nil then
        appendPlayerResult(playerName, "GIVEPAL2 FAIL: khong lay duoc IndividualId")
        return
    end
    -- b6: grant vào hộp người chơi qua đường chính chủ
    local okG, errG = pcall(function() playerState:OnCreatedGrantedIndividualHandle_ServerInternal(id) end)
    appendPlayerResult(playerName, "GIVEPAL2 b6 Granted ok=" .. tostring(okG) .. " err=" .. tostring(errG) .. " -> MO HOP PAL, KEO RA DANH THU NGAY")
end
~~~
