-- Tự dò thư mục mod thay vì hardcode đường dẫn tuyệt đối (Z:\server\... chỉ đúng
-- với host Wine cũ). Thử lần lượt các đường dẫn ứng viên, chọn cái đầu tiên mà
-- thư mục tồn tại (mở được file để ghi). Nhờ vậy chuyển host (Shockbyte → host khác,
-- Wine prefix khác) không cần sửa mod.
local candidateBases = {
    "ue4ss\\Mods\\GiveGoldCommand\\",                                      -- cwd = Pal\Binaries\Win64 (thường gặp)
    "Mods\\GiveGoldCommand\\",                                             -- cwd = ...\Win64\ue4ss (UE4SS bản mới)
    "Pal\\Binaries\\Win64\\ue4ss\\Mods\\GiveGoldCommand\\",                -- cwd = thư mục gốc server
    "Z:\\server\\Pal\\Binaries\\Win64\\ue4ss\\Mods\\GiveGoldCommand\\",    -- host Wine cũ (Shockbyte)
}

local baseDir = nil
for _, candidate in ipairs(candidateBases) do
    local f = io.open(candidate .. "results.log", "a")
    if f then
        f:close()
        baseDir = candidate
        break
    end
end
baseDir = baseDir or candidateBases[1]

local queueFile = baseDir .. "queue.txt"
local resultFile = baseDir .. "results.log"

local firstTick = true

local function appendResult(line)
    local f = io.open(resultFile, "a")
    if f then
        f:write(line .. "\n")
        f:close()
    end
end

-- Mọi dòng kết quả liên quan tới 1 lệnh give-item/give-pal PHẢI bắt đầu bằng
-- "[playerName] " để dashboard (sftpBridge.js) ghép đúng kết quả với đúng người
-- gửi lệnh — không được đoán theo nội dung câu chữ (một số lỗi như "spawn failed"
-- không tự nhiên chứa tên player trong câu).
local function appendPlayerResult(playerName, message)
    appendResult("[" .. playerName .. "] " .. message)
end

-- Exp tích lũy của PAL ứng với từng level (field PalTotalEXP trong DT exp table của game,
-- KHÁC TotalEXP là của người chơi). Nguồn: data/json/exp.json của oMaN-Rod/palworld-save-pal.
-- Cần bảng này vì level hiển thị trong game được tính TỪ Exp — ghi SaveParameter.Level
-- một mình không đủ (đã test thực tế: pal ra "Cấp 2" dù gửi Lv50).
local PAL_EXP_BY_LEVEL = {
    [1]=0, [2]=25, [3]=56, [4]=93, [5]=138, [6]=207, [7]=306, [8]=440,
    [9]=616, [10]=843, [11]=1131, [12]=1492, [13]=1941, [14]=2495, [15]=3175, [16]=4007,
    [17]=5021, [18]=6253, [19]=7747, [20]=9555, [21]=11740, [22]=14378, [23]=17559, [24]=21392,
    [25]=26007, [26]=31561, [27]=38241, [28]=46272, [29]=55925, [30]=67524, [31]=81458, [32]=98195,
    [33]=118294, [34]=142429, [35]=171406, [36]=206194, [37]=247955, [38]=298084, [39]=358255, [40]=430475,
    [41]=517155, [42]=621186, [43]=746039, [44]=895878, [45]=1075701, [46]=1291504, [47]=1550483, [48]=1861273,
    [49]=2234236, [50]=2681807, [51]=3218908, [52]=3863445, [53]=4636905, [54]=5565072, [55]=6678888, [56]=8015483,
    [57]=9619412, [58]=11544143, [59]=13853835, [60]=16625481, [61]=19951472, [62]=23942677, [63]=28732138, [64]=34479507,
    [65]=41376365, [66]=48273223, [67]=55170081, [68]=62066939, [69]=68963797, [70]=75860655, [71]=82757513, [72]=89654371,
    [73]=96551229, [74]=103448087, [75]=110344945, [76]=117241803, [77]=124138661, [78]=131035519, [79]=137932377, [80]=144829235,
    [81]=151726093, [82]=158622951, [83]=165519809, [84]=172416667, [85]=179313525, [86]=186210383, [87]=193107241, [88]=200004099,
    [89]=206900957, [90]=213797815, [91]=220694673, [92]=227591531, [93]=234488389, [94]=241385247, [95]=248282105, [96]=255178963,
    [97]=262075821, [98]=268972679, [99]=275869537, [100]=282766395,
}

-- Dashboard cho nhập level tới 255 nhưng bảng exp của game chỉ tới 100 —
-- level > 100 dùng exp của level 100 (giá trị cao nhất biết chắc).
local function expForLevel(level)
    if not level or level < 1 then return nil end
    return PAL_EXP_BY_LEVEL[level] or PAL_EXP_BY_LEVEL[100]
end

-- Ghi cả Level lẫn Exp (game tính level hiển thị từ Exp) vào cả SaveParameter và
-- SaveParameterMirror, rồi replicate. Phải gọi cả TRƯỚC và SAU capture vì
-- PalCaptureSuccess tạo lại pal từ bản copy (giống trường hợp passive).
local function applyLevelExp(parameter, level)
    local exp = expForLevel(level)
    for _, propName in ipairs({ "SaveParameter", "SaveParameterMirror" }) do
        local sp = parameter[propName]
        if sp then
            pcall(function() sp.Level = level end)
            if exp then
                pcall(function() sp.Exp = exp end)
            end
        end
    end
    pcall(function() parameter:OnRep_SaveParameter() end)
end

-- Clears a pal's existing passive list and sets exactly the given passive IDs,
-- so the admin-chosen passives land in the visible 4 slots (not pushed out by random rolls).
-- Writes both SaveParameter and SaveParameterMirror, then replicates via OnRep_SaveParameter.
local function applyPassives(parameter, passiveIds)
    for _, propName in ipairs({ "SaveParameter", "SaveParameterMirror" }) do
        local sp = parameter[propName]
        if sp then
            local list = sp.PassiveSkillList
            if list then
                pcall(function() list:Empty() end)
                for _, id in ipairs(passiveIds) do
                    list[list:GetArrayNum() + 1] = FName(id)
                end
            end
        end
    end
    pcall(function() parameter:OnRep_SaveParameter() end)
end

-- Gender (EPalGenderType: 1 = Male, 2 = Female) và Lucky (IsRarePal = true).
-- CHƯA kiểm chứng in-game — nếu không ăn, dòng WARN sẽ xuất hiện trong results.log.
local function applyGenderLucky(parameter, gender, lucky)
    for _, propName in ipairs({ "SaveParameter", "SaveParameterMirror" }) do
        local sp = parameter[propName]
        if sp then
            if gender and gender > 0 then
                pcall(function() sp.Gender = gender end)
            end
            if lucky and lucky > 0 then
                pcall(function() sp.IsRarePal = true end)
            end
        end
    end
    pcall(function() parameter:OnRep_SaveParameter() end)
end

-- ===== Công cụ chẩn đoán: dump tên hàm/property thật của class trong game =====
-- Dùng để tìm đúng API thêm pal vào storage (thay vì đoán tên hàm). Ghi ra file
-- riêng dump.log để không lẫn với results.log.
local dumpFile = baseDir .. "dump.log"

local function appendDump(line)
    local f = io.open(dumpFile, "a")
    if f then
        f:write(line .. "\n")
        f:close()
    end
end

-- Duyệt cả class lẫn các class cha (nhiều hàm nằm ở lớp cha).
local function dumpStruct(structPath, withProperties)
    local cls = StaticFindObject(structPath)
    if not cls or not cls:IsValid() then
        appendDump("KHONG TIM THAY: " .. structPath)
        return false
    end

    appendDump("")
    appendDump("=========== DUMP " .. structPath .. " ===========")
    local current, depth = cls, 0
    while current and current:IsValid() and depth < 8 do
        local okName, fullName = pcall(function() return current:GetFullName() end)
        appendDump("---- class: " .. tostring(okName and fullName or "?") .. " ----")

        pcall(function()
            current:ForEachFunction(function(fn)
                local ok, n = pcall(function() return fn:GetFullName() end)
                appendDump("  FN  " .. tostring(ok and n or "?"))
            end)
        end)

        if withProperties then
            pcall(function()
                current:ForEachProperty(function(prop)
                    local ok, n = pcall(function() return prop:GetFullName() end)
                    appendDump("  PROP " .. tostring(ok and n or "?"))
                end)
            end)
        end

        local okSuper, super = pcall(function() return current:GetSuperStruct() end)
        if not okSuper or not super or not super:IsValid() then break end
        current = super
        depth = depth + 1
    end
    appendDump("=========== HET " .. structPath .. " ===========")
    return true
end

-- Tìm INSTANCE đang sống của một class truy cập DataTable, rồi in ra:
--   - tên/đường dẫn thật của DataTable nó trỏ tới (property DataTable ở lớp cha)
--   - toàn bộ tên dòng trong bảng (hàm GetRowNames ở lớp cha)
-- Dùng để biết chính xác tên bảng cần sửa bằng PalSchema, thay vì đoán.
local function dumpDataTableInfo(className)
    local objs = FindAllOf(className) or {}
    appendDump("")
    appendDump("=========== DTINFO " .. className .. " (" .. tostring(#objs) .. " instance) ===========")

    for i, obj in ipairs(objs) do
        pcall(function()
            if not obj:IsValid() then return end
            appendDump("-- instance " .. i .. ": " .. tostring(obj:GetFullName()))

            -- Đường dẫn thật của DataTable
            local okDt, dt = pcall(function() return obj.DataTable end)
            if okDt and dt and dt:IsValid() then
                appendDump("   DataTable = " .. tostring(dt:GetFullName()))
            else
                appendDump("   DataTable = (khong doc duoc)")
            end

            -- Danh sách tên dòng. UE4SS có thể trả thẳng, hoặc qua tham số out.
            local rows = nil
            pcall(function() rows = obj:GetRowNames() end)
            if not rows then
                pcall(function()
                    local out = {}
                    obj:GetRowNames(out)
                    rows = out.OutRowNames or out[1]
                end)
            end

            if rows then
                -- Kieu tra ve khong chac chan: co the la TArray cua UE4SS, co the la bang Lua.
                local n = 0
                pcall(function() n = rows:GetArrayNum() end)
                if n == 0 then pcall(function() n = #rows end) end
                appendDump("   kieu=" .. type(rows) .. "  So dong: " .. tostring(n))

                -- Neu van 0, thu duyet bang ForEach (mot so ban UE4SS chi ho tro cach nay)
                if n == 0 then
                    local cnt = 0
                    local okEach = pcall(function()
                        rows:ForEach(function(_, v)
                            cnt = cnt + 1
                            local s = v
                            pcall(function() s = v:get():ToString() end)
                            appendDump("   ROW " .. tostring(s))
                        end)
                    end)
                    appendDump("   ForEach " .. (okEach and "ok" or "loi") .. ", dem duoc " .. cnt)
                else
                    for j = 1, n do
                        pcall(function()
                            local v = rows[j]
                            -- UE4SS boc phan tu trong RemoteUnrealParam -> phai :get() truoc.
                            local s = nil
                            pcall(function() s = v:get():ToString() end)
                            if not s then pcall(function() s = v:ToString() end) end
                            if not s then pcall(function() s = tostring(v:get()) end) end
                            appendDump("   ROW " .. tostring(s or v))
                        end)
                    end
                end
            else
                appendDump("   GetRowNames: khong lay duoc")
            end
        end)
    end

    appendDump("=========== HET DTINFO " .. className .. " ===========")
    return #objs > 0
end

-- Hoi thang bang bàn phẫu thuật: passive nay CO dong trong DataTable khong?
-- Dung chinh ham game dung (BP_FindRowByPassiveSkill). Tra ve gia tri cac field neu tim thay.
-- Muc dich: xac dinh 7 passive bi "Drop disabled" (Legend, Rare/Lucky...) bi khoa vi THIEU DONG
-- hay vi ly do khac. Neu thieu dong -> them dong bang PalSchema la cuu duoc.
local function checkOperatingPassive(passiveId)
    local objs = FindAllOf("PalMasterDataTableAccess_OperatingTablePassiveSkillData") or {}
    appendDump("")
    appendDump("--- PASSCHK " .. tostring(passiveId) .. " ---")
    if #objs == 0 then
        appendDump("   khong tim thay instance")
        return false
    end

    local obj = objs[1]
    local r1, r2, r3
    local ok = pcall(function()
        r1, r2, r3 = obj:BP_FindRowByPassiveSkill(FName(passiveId))
    end)
    if not ok then
        appendDump("   goi ham LOI")
        return false
    end

    appendDump("   tra ve: " .. type(r1) .. " / " .. type(r2) .. " / " .. type(r3))
    for idx, r in ipairs({ r1, r2, r3 }) do
        if type(r) == "boolean" then
            appendDump("   [" .. idx .. "] bResult = " .. tostring(r))
        elseif type(r) == "userdata" or type(r) == "table" then
            -- Doc cac field cua FPalOperatingTablePassiveSkillData
            for _, f in ipairs({ "PassiveSkill", "Price", "RequireItemId" }) do
                pcall(function()
                    local v = r[f]
                    local s = v
                    pcall(function() s = v:ToString() end)
                    appendDump("   [" .. idx .. "] " .. f .. " = " .. tostring(s))
                end)
            end
        end
    end
    return true
end

-- Doc GIA TRI cua mot dong trong DataTable, qua ham BP_FindRow cua class truy cap.
-- Ham co tham so out (bool& bResult) nen phai thu nhieu cach goi.
-- Dung de biet chinh xac slot nao chua gi (vd doi chieu % voi palpedia).
local DTROW_FIELDS = {
    -- FieldLotteryName (bang xo so)
    "ItemSlot1_ProbabilityPercent", "ItemSlot2_ProbabilityPercent", "ItemSlot3_ProbabilityPercent",
    "ItemSlot4_ProbabilityPercent", "ItemSlot5_ProbabilityPercent", "ItemSlot6_ProbabilityPercent",
    "ItemSlot7_ProbabilityPercent", "ItemSlot8_ProbabilityPercent", "ItemSlot9_ProbabilityPercent",
    "ItemSlot10_ProbabilityPercent", "ItemSlot11_ProbabilityPercent", "ItemSlot12_ProbabilityPercent",
    "ItemSlot13_ProbabilityPercent", "ItemSlot14_ProbabilityPercent", "ItemSlot15_ProbabilityPercent",
    -- ItemLotteryData
    "FieldName", "SlotNo", "WeightInSlot", "StaticItemId", "MinNum", "MaxNum", "NumUnit",
    -- OperatingTablePassiveSkillData
    "PassiveSkill", "Price", "RequireItemId",
    -- DropItem
    "CharacterID", "Level",
    "ItemId1", "Rate1", "Min1", "Max1", "ItemId2", "Rate2", "Min2", "Max2",
    "ItemId3", "Rate3", "Min3", "Max3", "ItemId4", "Rate4", "Min4", "Max4",
    "ItemId5", "Rate5", "Min5", "Max5",
}

local function dumpDataTableRow(className, rowName)
    local objs = FindAllOf(className) or {}
    appendDump("")
    appendDump("=========== DTROW " .. className .. " / " .. rowName .. " ===========")
    if #objs == 0 then
        appendDump("   khong tim thay instance")
        return false
    end
    local obj = objs[#objs]  -- instance cuoi thuong la cai dang dung

    -- Thu cac cach goi khac nhau vi ham co tham so out.
    local row = nil
    local tries = {
        function() return obj:BP_FindRow(FName(rowName), false) end,
        function() return obj:BP_FindRow(FName(rowName)) end,
        function() return obj:BP_FindRow(rowName, false) end,
    }
    for i, fn in ipairs(tries) do
        if row then break end
        local ok, r = pcall(fn)
        if ok and r ~= nil then
            row = r
            appendDump("   goi duoc bang cach " .. i .. " (kieu tra ve: " .. type(r) .. ")")
        end
    end
    if not row then
        appendDump("   BP_FindRow: khong goi duoc bang ca 3 cach")
        return false
    end

    local found = 0
    for _, f in ipairs(DTROW_FIELDS) do
        pcall(function()
            local v = row[f]
            if v ~= nil then
                local s = v
                pcall(function() s = v:ToString() end)
                appendDump("   " .. f .. " = " .. tostring(s))
                found = found + 1
            end
        end)
    end
    appendDump("   (doc duoc " .. found .. " field)")
    return true
end

local function parsePassives(csv)
    local ids = {}
    if csv and csv ~= "" and csv ~= "-" then
        for id in csv:gmatch("[^,]+") do
            table.insert(ids, id)
        end
    end
    return ids
end

-- Bỏ mọi ký tự không phải ASCII in được: tên trong engine hay dính ký tự ẩn ở đầu
-- hoặc cuối tùy platform (đã thấy cả "​biabia" và "biabia᲼", "bbb 1᲼").
local function normalizeName(s)
    return (s:gsub("[^\32-\126]", ""))
end

-- So khớp theo thứ tự CHẶT → LỎNG. Không dùng substring làm cách chính vì nó cực
-- nguy hiểm: tên "1" khớp được vào "bbb 1", tức người chơi khác có thể nhận quà
-- của người khác. Substring chỉ dùng khi không có ai khớp chuẩn, và phải khớp
-- DUY NHẤT một người (nhiều người khớp thì coi như không tìm thấy, an toàn hơn).
local function findPlayerState(playerName)
    local players = FindAllOf("PalPlayerState") or {}
    local names = {}
    local states = {}
    for _, playerState in ipairs(players) do
        local ok, name = pcall(function()
            if not playerState:IsValid() then return nil end
            return playerState.PlayerNamePrivate:ToString()
        end)
        if ok and name then
            table.insert(names, name)
            table.insert(states, { state = playerState, name = name })
        end
    end

    local target = normalizeName(playerName)

    for _, entry in ipairs(states) do
        if entry.name == playerName then return entry.state, names end
    end
    for _, entry in ipairs(states) do
        if normalizeName(entry.name) == target then return entry.state, names end
    end

    local found, count = nil, 0
    for _, entry in ipairs(states) do
        if normalizeName(entry.name):find(target, 1, true) then
            found = entry.state
            count = count + 1
        end
    end
    if count == 1 then return found, names end

    return nil, names
end

-- ===== Thử nghiệm: tặng pal qua đường CHÍNH THỨC của game =====
-- Debug_CaptureNewMonster_ToServer(CharacterID) là RPC server có sẵn trong
-- PalPlayerState (tìm được bằng lệnh DUMP). Khác hẳn cách hiện tại (spawn pal ra
-- world rồi PalCaptureSuccess) — cách đó khiến pal không thao tác được cho tới khi
-- restart. Hàm này để game tự lo việc đăng ký pal vào storage.
local function debugGivePal(playerName, speciesId)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (DBGPAL) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end
    local ok, err = pcall(function()
        playerState:Debug_CaptureNewMonster_ToServer(FName(speciesId))
    end)
    appendPlayerResult(playerName, "DBGPAL " .. speciesId .. ": ok=" .. tostring(ok) .. " err=" .. tostring(err))
end

-- Tặng pal "TRẦN": spawn + bắt, KHÔNG ghi bất kỳ chỉ số nào (không level/exp, sao,
-- IV, soul, passive, gender). Dùng để kiểm tra xem bug "không thao tác được pal"
-- đến từ cách spawn-rồi-bắt, hay từ việc ghi vào SaveParameter.
local function giveRawPal(playerName, speciesId)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (RAWPAL) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end
    local pc = playerState:GetPlayerController()
    if not pc or not pc:IsValid() then
        appendPlayerResult(playerName, "ERROR no PlayerController (RAWPAL)")
        return
    end
    local playerChar = pc.Pawn
    if not playerChar or not playerChar:IsValid() then
        appendPlayerResult(playerName, "ERROR no Pawn (RAWPAL)")
        return
    end
    local palUtil = StaticFindObject("/Script/Pal.Default__PalUtility")
    local npc_manager = palUtil and palUtil:GetNPCManager(pc)
    if not npc_manager or not npc_manager:IsValid() then
        appendPlayerResult(playerName, "ERROR no NPC manager (RAWPAL)")
        return
    end
    local locOk, location = pcall(function() return playerChar:K2_GetActorLocation() end)
    if not locOk then
        appendPlayerResult(playerName, "ERROR no location (RAWPAL)")
        return
    end

    local spawnOk, handle = pcall(function()
        return npc_manager:SpawnNPCForServer({
            ControllerClass = npc_manager.NPCAIControllerBaseClass,
            CharacterID = FName(speciesId),
            Level = 5,
            Location = { X = location.X + 300, Y = location.Y, Z = location.Z + 100 },
            Yaw = 0.0,
            Squad = nil,
        }, nil)
    end)
    if not spawnOk or not handle or not handle:IsValid() then
        appendPlayerResult(playerName, "ERROR spawn failed (RAWPAL) " .. speciesId)
        return
    end

    local attempts = 0
    local function tryCapture()
        attempts = attempts + 1
        local actorOk, spawned = pcall(function() return handle:TryGetIndividualActor() end)
        if actorOk and spawned and spawned:IsValid() then
            local ok, err = pcall(function() palUtil:PalCaptureSuccess(playerChar, spawned) end)
            appendPlayerResult(playerName, "RAWPAL " .. speciesId .. " (khong ghi chi so nao): ok=" .. tostring(ok) .. " err=" .. tostring(err))
            return
        end
        if attempts < 30 then
            ExecuteWithDelay(100, tryCapture)
        else
            appendPlayerResult(playerName, "ERROR RAWPAL pal never valid: " .. speciesId)
        end
    end
    ExecuteWithDelay(150, tryCapture)
end

-- ===== CHẨN ĐOÁN TÚI ĐỒ (cho luồng nạp: game -> Discord) =====
-- Game KHÔNG expose hàm trừ item nào ra Blueprint/Lua (đã dò PalItemContainer,
-- PalItemSlot, PalItemUtility, PalPlayerInventoryData — chỉ có hàm đọc). Nhưng
-- PalItemSlot có property StackCount ghi được + hàm OnRep_StackCount, nên cách trừ
-- là ghi thẳng StackCount giống kỹ thuật đã dùng cho chỉ số pal.
--
-- Lệnh này CHỈ ĐỌC, không sửa gì. Mục đích: biết chính xác
--   - CountItemNum64 trả về kiểu gì
--   - TryGetContainerFromStaticItemID trả out-param theo hình dạng nào
--   - mỗi ô đồ đọc ItemId / StackCount ra sao
-- Biết xong mới viết lệnh trừ thật, tránh đoán sai.
local function inventoryDebug(playerName, itemId)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (INVDBG) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end

    local inv = nil
    pcall(function() inv = playerState:GetInventoryData() end)
    if not inv then
        appendPlayerResult(playerName, "ERROR khong lay duoc InventoryData")
        return
    end

    local okCount, cnt = pcall(function() return inv:CountItemNum64(FName(itemId)) end)
    appendPlayerResult(playerName, string.format(
        "INVDBG count(%s): ok=%s value=%s type=%s",
        itemId, tostring(okCount), tostring(cnt), type(cnt)))

    -- UE4SS bắt truyền ĐỦ tham số kể cả out-param ("expected 3 parameters, received 1"),
    -- nhưng không rõ nó nhận hình dạng nào — thử vài kiểu rồi xem kiểu nào chạy.
    local function shortErr(v)
        local s = tostring(v)
        if #s > 110 then s = s:sub(1, 110) .. "..." end
        return (s:gsub("[\r\n]+", " "))
    end

    local attempts = {
        { "3 args (nil,false)", function() return inv:TryGetContainerFromStaticItemID(FName(itemId), nil, false) end },
        { "3 args ({},false)",  function() return inv:TryGetContainerFromStaticItemID(FName(itemId), {}, false) end },
        { "2 args (nil)",       function() return inv:TryGetContainerFromStaticItemID(FName(itemId), nil) end },
        { "2 args ({})",        function() return inv:TryGetContainerFromStaticItemID(FName(itemId), {}) end },
    }

    local container = nil
    for _, a in ipairs(attempts) do
        local okC, r1, r2, r3 = pcall(a[2])
        appendPlayerResult(playerName, string.format(
            "INVDBG try[%s]: ok=%s r1=%s(%s) r2=%s(%s) r3=%s(%s)",
            a[1], tostring(okC), shortErr(r1), type(r1), shortErr(r2), type(r2), shortErr(r3), type(r3)))
        if okC then
            for _, cand in ipairs({ r1, r2, r3 }) do
                if cand ~= nil and type(cand) ~= "boolean" and type(cand) ~= "string" then
                    local okNum, n = pcall(function() return cand:Num() end)
                    if okNum and type(n) == "number" then
                        container = cand
                        appendPlayerResult(playerName, "INVDBG => container lay duoc bang cach: " .. a[1])
                        break
                    end
                end
            end
        end
        if container then break end
    end

    -- Cách gọi (FName, {}) chạy được và trả true, nghĩa là out-param được ghi vào
    -- BẢNG mình truyền vào. Xem bảng đó có gì.
    do
        local out = {}
        local okT, ret = pcall(function() return inv:TryGetContainerFromStaticItemID(FName(itemId), out) end)
        appendPlayerResult(playerName, string.format(
            "INVDBG out-table: callOk=%s ret=%s | type(out)=%s", tostring(okT), tostring(ret), type(out)))
        if type(out) == "table" then
            local keys = {}
            for k, v in pairs(out) do
                table.insert(keys, tostring(k) .. "=" .. tostring(v) .. "(" .. type(v) .. ")")
            end
            appendPlayerResult(playerName, "INVDBG out-table keys: " .. (#keys > 0 and table.concat(keys, " , ") or "(BANG RONG)"))
            if not container then
                for _, v in pairs(out) do
                    local okNum, n = pcall(function() return v:Num() end)
                    if okNum and type(n) == "number" then
                        container = v
                        appendPlayerResult(playerName, "INVDBG => container lay duoc tu out-table")
                        break
                    end
                end
            end
        end
    end

    -- Học hình dạng ItemId: in thô vài ô đồ đang có item để biết so sánh thế nào.
    if not container then
        local all = FindAllOf("PalItemContainer") or {}
        appendPlayerResult(playerName, string.format("INVDBG FindAllOf(PalItemContainer) = %d cai", #all))
        local shown = 0
        for _, c in ipairs(all) do
            if shown >= 6 then break end
            local okNum, n = pcall(function() return c:Num() end)
            if okNum and type(n) == "number" and n > 0 then
                for i = 0, math.min(n - 1, 40) do
                    if shown >= 6 then break end
                    pcall(function()
                        local slot = c:Get(i)
                        if slot and slot:IsValid() then
                            local stack = tonumber(tostring(slot.StackCount)) or 0
                            if stack > 0 then
                                shown = shown + 1
                                local raw, viaFn, staticId = "?", "?", "?"
                                pcall(function() raw = tostring(slot.ItemId) end)
                                pcall(function() viaFn = tostring(slot:GetItemId()) end)
                                pcall(function() staticId = tostring(slot.ItemId.StaticId) end)
                                appendPlayerResult(playerName, string.format(
                                    "INVDBG mau o: stack=%d | ItemId=%s | GetItemId()=%s | ItemId.StaticId=%s",
                                    stack, raw, viaFn, staticId))
                            end
                        end
                    end)
                end
            end
        end
    end

    if not container then
        appendPlayerResult(playerName, "INVDBG: KHONG tim duoc container tu ham nay")
        return
    end

    local okNum, num = pcall(function() return container:Num() end)
    appendPlayerResult(playerName, string.format("INVDBG container.Num() = %s", tostring(num)))

    -- In THÔ mọi ô có hàng (không lọc theo tên) để học đúng hình dạng ItemId.
    -- Vòng trước lọc bằng tostring nên không khớp gì — nên lần này thử nhiều đường
    -- đọc: property ItemId, các field con thường gặp của FPalItemId, và hàm GetItemId.
    local found = 0
    for i = 0, (tonumber(num) or 0) - 1 do
        pcall(function()
            local slot = container:Get(i)
            if slot and slot:IsValid() then
                local stack = tonumber(tostring(slot.StackCount)) or 0
                if stack > 0 and found < 8 then
                    found = found + 1
                    -- StaticId là FName (FNameUserdata) nên phải gọi :ToString() —
                    -- tostring() chỉ ra địa chỉ bộ nhớ, không so sánh được.
                    local name = "?"
                    pcall(function() name = slot.ItemId.StaticId:ToString() end)
                    appendPlayerResult(playerName, string.format(
                        "INVDBG o[%d] stack=%d | item=%s", i, stack, name))
                end
            end
        end)
    end
    appendPlayerResult(playerName, string.format("INVDBG so o co hang da in: %d (tong %s o)", found, tostring(num)))
end

-- Lấy container đang giữ item của người chơi. UE4SS ghi out-param vào BẢNG truyền
-- vào (đã kiểm chứng: out.OutContainer), và bắt buộc truyền đủ tham số.
local function getItemContainer(inv, itemId)
    local out = {}
    local ok, found = pcall(function() return inv:TryGetContainerFromStaticItemID(FName(itemId), out) end)
    if not ok or not found then return nil end
    return out.OutContainer
end

-- Tên item của 1 ô. StaticId là FName nên phải :ToString().
local function slotItemName(slot)
    local name = nil
    pcall(function() name = slot.ItemId.StaticId:ToString() end)
    return name
end

-- Đếm số lượng item người chơi đang có trong game. Dùng để hiện số dư cho họ trước
-- khi chuyển ra Discord (chỉ đọc, không sửa gì).
local function countItem(playerName, itemId)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (COUNT) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end
    local ok, n = pcall(function()
        return tonumber(tostring(playerState:GetInventoryData():CountItemNum64(FName(itemId)))) or 0
    end)
    if ok then
        appendPlayerResult(playerName, string.format("OK COUNT %s=%d", itemId, n))
    elseif tostring(n):find("Tried calling a member function", 1, true) then
        -- Người vừa thoát game để lại PalPlayerState "xác": findPlayerState vẫn thấy
        -- (IsValid true, còn đọc được tên) nhưng gọi GetInventoryData() là nổ đúng câu
        -- lỗi này. Với bên gọi thì nghĩa chỉ có một: người này KHÔNG còn trong game
        -- -> báo chuẩn "player not found" để bot xử như ca offline bình thường.
        appendPlayerResult(playerName, "ERROR player not found (COUNT stale) | names=[" .. table.concat(names, ", ") .. "]")
    else
        appendPlayerResult(playerName, string.format("ERROR COUNT %s: %s", itemId, tostring(n)))
    end
end

-- Đếm item cho TẤT CẢ người đang online trong MỘT lệnh. Cần thiết vì mỗi lượt gửi
-- lệnh qua SFTP mất khoảng 6 giây — đếm từng người sẽ chậm không dùng được.
-- Lưu ý: chỉ đếm TÚI ĐỒ của người chơi, KHÔNG tính hòm/kho ở căn cứ (container khác,
-- và hàm đếm hòm mà game expose chỉ chạy phía client).
local function countItemAll(itemId)
    local players = FindAllOf("PalPlayerState") or {}
    local reported = 0
    for _, playerState in ipairs(players) do
        pcall(function()
            if not playerState:IsValid() then return end
            local name = playerState.PlayerNamePrivate:ToString()
            local n = tonumber(tostring(playerState:GetInventoryData():CountItemNum64(FName(itemId)))) or 0
            appendPlayerResult(name, string.format("OK COUNT %s=%d", itemId, n))
            reported = reported + 1
        end)
    end
    appendResult(string.format("OK COUNTALL %s: %d nguoi online", itemId, reported))
end

-- ===== TRỪ ITEM TRONG TÚI (cho luồng nạp: game -> Discord) =====
-- Game không có hàm trừ item nào expose ra Lua, nên ghi thẳng StackCount của từng ô
-- rồi gọi OnRep_StackCount để đồng bộ — cùng kỹ thuật đã dùng cho chỉ số pal.
--
-- An toàn: đếm TRƯỚC, thiếu thì không sửa gì cả; đếm LẠI sau khi sửa và báo cả hai
-- số để bên gọi (bot) đối chiếu, tránh cộng Dogcoin khi thực tế chưa trừ được.
local function takeItem(playerName, itemId, quantity)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (TAKE) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end

    local inv = nil
    pcall(function() inv = playerState:GetInventoryData() end)
    if not inv then
        appendPlayerResult(playerName, "ERROR khong lay duoc InventoryData (TAKE)")
        return
    end

    local function countNow()
        local n = 0
        pcall(function() n = tonumber(tostring(inv:CountItemNum64(FName(itemId)))) or 0 end)
        return n
    end

    local before = countNow()
    if before < quantity then
        appendPlayerResult(playerName, string.format(
            "ERROR khong du %s: trong game co %d, can %d", itemId, before, quantity))
        return
    end

    local container = getItemContainer(inv, itemId)
    if not container then
        appendPlayerResult(playerName, string.format("ERROR khong lay duoc container cho %s", itemId))
        return
    end

    local num = 0
    pcall(function() num = tonumber(tostring(container:Num())) or 0 end)

    local remaining = quantity
    for i = 0, num - 1 do
        if remaining <= 0 then break end
        pcall(function()
            local slot = container:Get(i)
            if not (slot and slot:IsValid()) then return end
            local stack = tonumber(tostring(slot.StackCount)) or 0
            if stack <= 0 then return end
            if slotItemName(slot) ~= itemId then return end

            local take = math.min(stack, remaining)
            slot.StackCount = stack - take
            remaining = remaining - take
            pcall(function() slot:OnRep_StackCount() end)
        end)
    end

    pcall(function() container:OnRep_ItemSlotArray() end)
    pcall(function() inv:OnUpdateInventoryContainer() end)

    local after = countNow()
    local took = before - after

    if took == quantity then
        appendPlayerResult(playerName, string.format(
            "OK TAKE %s x%d (truoc=%d sau=%d)", itemId, quantity, before, after))
        return
    end

    -- ===== TRU DO DANG -> HOAN LAI NGAY =====
    -- Ben goi (bot) chi cong Dogcoin khi took == quantity. Neu tru duoc mot phan roi dung,
    -- ma khong hoan lai thi nguoi choi MAT DO ma khong nhan duoc gi. Do la mat tien that.
    if took > 0 then
        local backOk = pcall(function()
            inv:AddItem_ServerInternal(FName(itemId), took, false, 0.0, true)
        end)
        local afterBack = countNow()
        if backOk and afterBack >= before then
            appendPlayerResult(playerName, string.format(
                "ERROR TAKE %s: yeu cau %d, tru duoc %d -> DA HOAN LAI DU (truoc=%d gio=%d)",
                itemId, quantity, took, before, afterBack))
        else
            -- Hoan that bai: canh bao that to, admin phai den bu tay.
            appendPlayerResult(playerName, string.format(
                "NGHIEM TRONG TAKE %s: tru %d nhung HOAN LAI THAT BAI (truoc=%d gio=%d) - CAN DEN BU TAY",
                itemId, took, before, afterBack))
        end
    else
        appendPlayerResult(playerName, string.format(
            "ERROR TAKE %s: yeu cau %d nhung khong tru duoc gi (truoc=%d sau=%d)",
            itemId, quantity, before, after))
    end
end

-- In ra class thật của các object liên quan tới pal storage (chỉ biết được lúc chạy).
local function inspectPlayer(playerName)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, "ERROR player not found (INSPECT) | names=[" .. table.concat(names, ", ") .. "]")
        return
    end

    local function classOf(obj)
        if not obj then return "nil" end
        local ok, n = pcall(function() return obj:GetClass():GetFullName() end)
        return tostring(ok and n or "?")
    end

    appendDump("")
    appendDump("=========== INSPECT player: " .. playerName .. " ===========")
    appendDump("PlayerState class = " .. classOf(playerState))
    pcall(function() appendDump("GetPalStorage()        -> " .. classOf(playerState:GetPalStorage())) end)
    pcall(function() appendDump("GetPalPlayerOtomoData()-> " .. classOf(playerState:GetPalPlayerOtomoData())) end)
    pcall(function() appendDump("GetInventoryData()     -> " .. classOf(playerState:GetInventoryData())) end)
    appendDump("=========== HET INSPECT ===========")
    appendPlayerResult(playerName, "INSPECT done (xem dump.log)")
end

local function giveItem(playerName, itemId, quantity)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, string.format(
            "ERROR player not found (item %s x%d) | names=[%s]",
            itemId, quantity, table.concat(names, ", ")
        ))
        return
    end

    local callOk, callErr = pcall(function()
        playerState:GetInventoryData():AddItem_ServerInternal(FName(itemId), quantity, false, 0.0, true)
    end)
    if callOk then
        appendPlayerResult(playerName, string.format("OK gave %s x%d", itemId, quantity))
    else
        appendPlayerResult(playerName, string.format("LUA ERROR giving item: %s", tostring(callErr)))
    end
end

local function givePal(playerName, speciesId, level, rank, ivHp, ivMelee, ivShot, ivDefense, passivesCsv,
                       soulHp, soulAttack, soulDefense, soulWorkSpeed, gender, lucky)
    local passiveList = parsePassives(passivesCsv)
    local playerState, names = findPlayerState(playerName)
    if not playerState then
        appendPlayerResult(playerName, string.format(
            "ERROR player not found (pal %s Lv%d) | names=[%s]",
            speciesId, level, table.concat(names, ", ")
        ))
        return
    end

    local pc = playerState:GetPlayerController()
    if not pc or not pc:IsValid() then
        appendPlayerResult(playerName, "ERROR no PlayerController")
        return
    end

    local playerChar = pc.Pawn
    if not playerChar or not playerChar:IsValid() then
        appendPlayerResult(playerName, "ERROR no Pawn")
        return
    end

    local palUtil = StaticFindObject("/Script/Pal.Default__PalUtility")
    if not palUtil or not palUtil:IsValid() then
        appendPlayerResult(playerName, "ERROR PalUtility not ready")
        return
    end

    local npc_manager = palUtil:GetNPCManager(pc)
    if not npc_manager or not npc_manager:IsValid() then
        appendPlayerResult(playerName, "ERROR NPC manager unavailable")
        return
    end

    local controller_class = npc_manager.NPCAIControllerBaseClass
    if not controller_class or not controller_class:IsValid() then
        appendPlayerResult(playerName, "ERROR AI controller class unavailable")
        return
    end

    local locOk, location = pcall(function() return playerChar:K2_GetActorLocation() end)
    if not locOk then
        appendPlayerResult(playerName, "ERROR could not get location: " .. tostring(location))
        return
    end

    local spawn_info = {
        ControllerClass = controller_class,
        CharacterID = FName(speciesId),
        Level = level,
        Location = { X = location.X + 300, Y = location.Y, Z = location.Z + 100 },
        Yaw = 0.0,
        Squad = nil,
    }

    local spawnOk, handle = pcall(function() return npc_manager:SpawnNPCForServer(spawn_info, nil) end)
    if not spawnOk or not handle or not handle:IsValid() then
        appendPlayerResult(playerName, string.format("ERROR spawn failed for pal %s (sai Species ID?): %s", speciesId, tostring(handle)))
        return
    end

    local attempts = 0
    local function tryCapture()
        attempts = attempts + 1
        local actorOk, spawned = pcall(function() return handle:TryGetIndividualActor() end)
        if actorOk and spawned and spawned:IsValid() then
            local hasPassives = #passiveList > 0
            local hasSoul = soulHp or soulAttack or soulDefense or soulWorkSpeed
            local hasGenderLucky = (gender and gender > 0) or (lucky and lucky > 0)
            local needsParamEdit = (level and level > 0) or (rank and rank > 0) or ivHp or ivMelee or ivShot or ivDefense
                or hasPassives or hasSoul or hasGenderLucky
            if needsParamEdit then
                local paramOk, parameter = pcall(function() return handle:TryGetIndividualParameter() end)
                if paramOk and parameter and parameter:IsValid() then
                    if level and level > 0 then
                        pcall(function() applyLevelExp(parameter, level) end)
                    end

                    pcall(function()
                        if rank and rank > 0 then
                            parameter.SaveParameter.Rank = rank
                            parameter.SaveParameterMirror.Rank = rank
                        end
                        if ivHp then
                            parameter.SaveParameter.Talent_HP = ivHp
                            parameter.SaveParameterMirror.Talent_HP = ivHp
                        end
                        if ivMelee then
                            parameter.SaveParameter.Talent_Melee = ivMelee
                            parameter.SaveParameterMirror.Talent_Melee = ivMelee
                        end
                        if ivShot then
                            parameter.SaveParameter.Talent_Shot = ivShot
                            parameter.SaveParameterMirror.Talent_Shot = ivShot
                        end
                        if ivDefense then
                            parameter.SaveParameter.Talent_Defense = ivDefense
                            parameter.SaveParameterMirror.Talent_Defense = ivDefense
                        end
                        -- Soul enhancement ranks (each rank = +3% in-game; 255 rank = +765%).
                        if soulHp then
                            parameter.SaveParameter.Rank_HP = soulHp
                            parameter.SaveParameterMirror.Rank_HP = soulHp
                        end
                        if soulAttack then
                            parameter.SaveParameter.Rank_Attack = soulAttack
                            parameter.SaveParameterMirror.Rank_Attack = soulAttack
                        end
                        if soulDefense then
                            parameter.SaveParameter.Rank_Defence = soulDefense
                            parameter.SaveParameterMirror.Rank_Defence = soulDefense
                        end
                        if soulWorkSpeed then
                            parameter.SaveParameter.Rank_CraftSpeed = soulWorkSpeed
                            parameter.SaveParameterMirror.Rank_CraftSpeed = soulWorkSpeed
                        end
                        parameter:OnRep_SaveParameter()
                    end)

                    if hasGenderLucky then
                        pcall(function() applyGenderLucky(parameter, gender, lucky) end)
                    end
                    if hasPassives then
                        pcall(function() applyPassives(parameter, passiveList) end)
                    end
                else
                    appendPlayerResult(playerName, string.format("WARN could not set rank/IV/passives (pal %s)", speciesId))
                end
            end

            -- 25/08: tìm slot trống TRƯỚC khi bắt — vừa làm chốt chặn hộp đầy, vừa để
            -- lát nữa biết pal mới nằm slot nào mà dọn actor tái sinh.
            -- FindEmptySlot trả OBJECT slot (không tonumber — bài học v5). slot:IsValid()
            -- là hàm wrapper của UE4SS, gọi trên slot rỗng/null vẫn an toàn.
            local suggestedSlot = nil
            pcall(function()
                local st = playerState:GetPalStorage()
                local c = st and st.TargetContainer
                if c and c:IsValid() then suggestedSlot = c:FindEmptySlot() end
            end)
            if not (suggestedSlot and suggestedSlot:IsValid()) then
                -- HỘP ĐẦY: bắt vào đâu cũng hỏng (pal "văng ra ngoài" cạnh người chơi,
                -- dữ liệu không vào hộp). Hủy bản spawn và báo lỗi rõ cho bot trả về rương.
                appendPlayerResult(playerName, "ERROR PALBOX DAY - khong giao " .. speciesId .. " (don bot pal trong hop roi nhan lai)")
                pcall(function() if spawned and spawned:IsValid() then spawned:K2_DestroyActor() end end)
                return
            end

            local captureOk, captureErr = pcall(function()
                palUtil:PalCaptureSuccess(playerChar, spawned)
            end)
            if captureOk then
                appendPlayerResult(playerName, string.format(
                    "OK gave pal %s (Lv %d, Rank %d, IV hp=%s melee=%s shot=%s def=%s, gender=%s, lucky=%s, passives=[%s])",
                    speciesId, level, rank or 0,
                    tostring(ivHp), tostring(ivMelee), tostring(ivShot), tostring(ivDefense),
                    tostring(gender or 0), tostring(lucky or 0),
                    passivesCsv or ""
                ))

                -- Bug "không triệu hồi được pal cho tới khi restart server": đã loại trừ
                -- khối re-apply bên dưới (test không passive vẫn lỗi). Giả thuyết hiện tại:
                -- actor pal spawn ngoài world KHÔNG bị hủy sau PalCaptureSuccess, nên game
                -- vẫn coi con đó đang ở ngoài. Kiểm tra + thử hủy, có log để kết luận.
                ExecuteWithDelay(500, function()
                    local stillValid = false
                    pcall(function() stillValid = (spawned and spawned:IsValid()) == true end)
                    appendPlayerResult(playerName, "DEBUG sau capture: spawned actor con valid = " .. tostring(stillValid))
                    if stillValid then
                        local okDestroy, errDestroy = pcall(function() spawned:K2_DestroyActor() end)
                        appendPlayerResult(playerName, "DEBUG huy actor: ok=" .. tostring(okDestroy) .. " err=" .. tostring(errDestroy))
                    end
                end)

                -- 25/08: DỌN ACTOR TÁI SINH. PalCaptureSuccess tạo lại pal từ bản copy —
                -- bản tái tạo này đôi khi ĐỨNG NGOÀI WORLD cạnh người chơi rồi đi lung tung
                -- (chủ server báo "pal xuất hiện kế bên và văng ra ngoài"). Pal thật đã nằm
                -- trong slot (FindByHandle valid=true) nên actor ngoài world chỉ là cái xác
                -- thừa: hủy ACTOR không đụng dữ liệu trong hộp. Quét 2 lần vì tái tạo có trễ.
                -- QUY TẮC CŨ GIỮ NGUYÊN: slot RỖNG thì không gọi GetHandle (sập tầng C++).
                local function donPalTaiSinh(tag)
                    pcall(function()
                        if not (suggestedSlot and suggestedSlot:IsValid()) then return end
                        local empty = true
                        pcall(function() empty = (suggestedSlot:IsEmpty() == true) end)
                        if empty then return end
                        local h = nil
                        pcall(function() h = suggestedSlot:GetHandle() end)
                        if not (h and h:IsValid()) then return end
                        local actor = nil
                        pcall(function() actor = h:TryGetIndividualActor() end)
                        if actor and actor:IsValid() then
                            local okD = pcall(function() actor:K2_DestroyActor() end)
                            appendPlayerResult(playerName, "DON PAL TAI SINH (" .. tag .. "): pal trong slot co actor lang thang ngoai world -> huy ok=" .. tostring(okD))
                        end
                    end)
                end
                ExecuteWithDelay(1500, function() donPalTaiSinh("1.5s") end)
                ExecuteWithDelay(3500, function() donPalTaiSinh("3.5s") end)

                -- PalCaptureSuccess tạo lại pal trong túi từ bản copy, nên passive/gender
                -- phải ghi lại sau một nhịp delay mới ăn. Level/Exp ghi trước capture là đủ
                -- (readback đã xác nhận giá trị ăn).
                local needsReapply = hasPassives or hasGenderLucky
                if needsReapply then
                    ExecuteWithDelay(1000, function()
                        local paramOk, parameter = pcall(function() return handle:TryGetIndividualParameter() end)
                        if paramOk and parameter and parameter:IsValid() then
                            if hasGenderLucky then
                                pcall(function() applyGenderLucky(parameter, gender, lucky) end)
                            end
                            if hasPassives then
                                pcall(function() applyPassives(parameter, passiveList) end)
                            end

                            -- Đọc lại giá trị thật sau khi ghi để biết ghi có "ăn" hay không
                            -- (phân biệt: write thất bại âm thầm vs write thành công nhưng
                            -- game hiển thị level từ nguồn khác). Chỉ để debug.
                            if level and level > 0 then
                                pcall(function()
                                    local sp = parameter.SaveParameter
                                    appendPlayerResult(playerName, string.format(
                                        "DEBUG readback: Level=%s Exp=%s (mong doi Level=%d Exp=%s)",
                                        tostring(sp.Level), tostring(sp.Exp), level, tostring(expForLevel(level))
                                    ))
                                end)
                            end
                        end
                    end)
                end
            else
                appendPlayerResult(playerName, "LUA ERROR capturing pal: " .. tostring(captureErr))
            end
            return
        end
        if attempts < 30 then
            ExecuteWithDelay(100, tryCapture)
        else
            appendPlayerResult(playerName, string.format("ERROR pal %s never became valid for capture", speciesId))
        end
    end
    ExecuteWithDelay(150, tryCapture)
end

local function processLine(line)
    -- DUMP <duong dan class>        vd: DUMP /Script/Pal.PalPlayerState
    -- DUMPP <duong dan class>       (kem ca property)
    -- Chi de chan doan, ghi ra dump.log.
    local dumpPath = line:match("^DUMP%s+(.+)$")
    if dumpPath then
        local ok = dumpStruct(dumpPath, false)
        appendResult("DUMP " .. (ok and "OK" or "FAILED") .. ": " .. dumpPath)
        return
    end
    local dumpPPath = line:match("^DUMPP%s+(.+)$")
    if dumpPPath then
        local ok = dumpStruct(dumpPPath, true)
        appendResult("DUMPP " .. (ok and "OK" or "FAILED") .. ": " .. dumpPPath)
        return
    end

    -- DTINFO <ten class>   vd: DTINFO PalMasterDataTableAccess_OperatingTablePassiveSkillData
    -- In ra duong dan DataTable that + TOAN BO ten dong. Ghi vao dump.log.
    local dtInfoName = line:match("^DTINFO%s+(.+)$")
    if dtInfoName then
        local ok = dumpDataTableInfo(dtInfoName)
        appendResult("DTINFO " .. (ok and "OK" or "KHONG TIM THAY INSTANCE") .. ": " .. dtInfoName)
        return
    end

    -- DTROW <ten class> <ten dong>
    -- vd: DTROW PalMasterDataTableAccess_FieldLotteryNameData AncientRelicRecycler_WorldTreeRelic_05
    -- In gia tri cac field cua dong do ra dump.log.
    local dtRowClass, dtRowName = line:match("^DTROW%s+(%S+)%s+(%S+)$")
    if dtRowClass then
        local ok = dumpDataTableRow(dtRowClass, dtRowName)
        appendResult("DTROW " .. (ok and "OK" or "FAILED") .. ": " .. dtRowClass .. " / " .. dtRowName)
        return
    end

    -- PASSCHK <passiveId>   vd: PASSCHK Legend
    -- Kiem tra passive co dong trong bang ban phau thuat khong. Ket qua vao dump.log.
    local passChk = line:match("^PASSCHK%s+(%S+)$")
    if passChk then
        local ok = checkOperatingPassive(passChk)
        appendResult("PASSCHK " .. (ok and "OK" or "FAILED") .. ": " .. passChk)
        return
    end

    -- DBGPAL <species> <playerName>   thu tang pal qua Debug_CaptureNewMonster_ToServer
    local dbgSpecies, dbgPlayer = line:match("^DBGPAL%s+(%S+)%s+(.+)$")
    if dbgSpecies then
        debugGivePal(dbgPlayer, dbgSpecies)
        return
    end

    -- RAWPAL <species> <playerName>  spawn+bat, KHONG ghi bat ky chi so nao
    local rawSpecies, rawPlayer = line:match("^RAWPAL%s+(%S+)%s+(.+)$")
    if rawSpecies then
        giveRawPal(rawPlayer, rawSpecies)
        return
    end

    -- COUNTALL <itemId>   CHI DOC: dem cho MOI nguoi dang online (1 lenh, nhanh)
    -- Phai dat TRUOC COUNT vi "COUNTALL" cung bat dau bang "COUNT".
    local cntAllId = line:match("^COUNTALL%s+(%S+)$")
    if cntAllId then
        countItemAll(cntAllId)
        return
    end

    -- COUNT <itemId> <playerName>   CHI DOC: dem so luong item trong tui
    local cntId, cntPlayer = line:match("^COUNT%s+(%S+)%s+(.+)$")
    if cntId then
        countItem(cntPlayer, cntId)
        return
    end

    -- TAKE <itemId> <quantity> <playerName>   TRU item trong tui nguoi choi
    local takeId, takeQty, takePlayer = line:match("^TAKE%s+(%S+)%s+(%d+)%s+(.+)$")
    if takeId then
        takeItem(takePlayer, takeId, tonumber(takeQty))
        return
    end

    -- INVDBG <itemId> <playerName>   CHI DOC: xem tui do cua nguoi choi co gi
    local invItem, invPlayer = line:match("^INVDBG%s+(%S+)%s+(.+)$")
    if invItem then
        inventoryDebug(invPlayer, invItem)
        return
    end

    -- INSPECT <playerName>            in class thuc te cua pal storage ra dump.log
    local inspectName = line:match("^INSPECT%s+(.+)$")
    if inspectName then
        inspectPlayer(inspectName)
        return
    end

    -- ITEM <itemId> <quantity> <playerName>
    -- playerName nằm CUỐI dòng (bắt hết phần còn lại) để chịu được tên có dấu cách
    -- (tên hiển thị trong game nhiều khi có 2+ từ, vd "Anh Hai").
    local itemId, quantityStr, itemPlayerName = line:match("^ITEM%s+(%S+)%s+(%d+)%s+(.+)$")
    if itemId then
        giveItem(itemPlayerName, itemId, tonumber(quantityStr))
        return
    end

    -- PAL2 <species> <level> <rank> <ivHp> <ivMelee> <ivShot> <ivDef>
    --      <soulHp> <soulAtk> <soulDef> <soulWork> <gender> <lucky> <passivesCsv> <playerName>
    -- Mọi field số đều bắt buộc có mặt; "-" nghĩa là không đặt (giữ random của game).
    -- gender: 0 = random, 1 = đực, 2 = cái. lucky: 0/1. playerName luôn ở CUỐI dòng
    -- (cùng lý do như ITEM — chịu được tên có dấu cách).
    local p2Species, p2Level, p2Rank, p2Hp, p2Melee, p2Shot, p2Def,
          p2SoulHp, p2SoulAtk, p2SoulDef, p2SoulWork, p2Gender, p2Lucky, p2Passives, p2Name =
        line:match("^PAL2%s+(%S+)%s+(%d+)%s+(%d+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%d+)%s+(%d+)%s+(%S+)%s+(.+)$")
    if p2Species then
        givePal(
            p2Name, p2Species, tonumber(p2Level), tonumber(p2Rank) or 0,
            tonumber(p2Hp), tonumber(p2Melee), tonumber(p2Shot), tonumber(p2Def), p2Passives,
            tonumber(p2SoulHp), tonumber(p2SoulAtk), tonumber(p2SoulDef), tonumber(p2SoulWork),
            tonumber(p2Gender) or 0, tonumber(p2Lucky) or 0
        )
        return
    end

    -- PAL (format cũ, giữ để tools/givepal.js và dashboard bản cũ vẫn chạy):
    -- PAL <player> <species> <level> <rank> <ivHp> <ivMelee> <ivShot> <ivDef> <soulHp> <soulAtk> <soulDef> <soulWork> <passivesCsv>
    local palPlayerName, speciesId, levelStr, rankStr, hpStr, meleeStr, shotStr, defStr,
          soulHpStr, soulAtkStr, soulDefStr, soulWorkStr, passivesCsv =
        line:match("^PAL%s+(%S+)%s+(%S+)%s+(%d+)%s+(%d+)%s*(%d*)%s*(%d*)%s*(%d*)%s*(%d*)%s*(%d*)%s*(%d*)%s*(%d*)%s*(%d*)%s*(.*)$")
    if palPlayerName then
        givePal(
            palPlayerName, speciesId, tonumber(levelStr), tonumber(rankStr) or 0,
            tonumber(hpStr), tonumber(meleeStr), tonumber(shotStr), tonumber(defStr), passivesCsv,
            tonumber(soulHpStr), tonumber(soulAtkStr), tonumber(soulDefStr), tonumber(soulWorkStr),
            0, 0
        )
        return
    end

    appendResult("ERROR bad line: " .. line)
end

local function processQueue()
    local f = io.open(queueFile, "r")
    if not f then
        if firstTick then
            appendResult("DEBUG: could not open queue file for read: " .. queueFile)
        end
        return
    end
    local content = f:read("*a")
    f:close()

    if content and content ~= "" then
        local clear = io.open(queueFile, "w")
        if clear then clear:close() end

        for line in content:gmatch("[^\r\n]+") do
            processLine(line)
        end
    end
end

LoopAsync(2000, function()
    local ok, err = pcall(processQueue)
    if not ok then
        appendResult("LUA ERROR in processQueue: " .. tostring(err))
    end
    if firstTick then
        appendResult("DEBUG: first tick executed, baseDir=" .. baseDir)
        firstTick = false
    end
    return false
end)

print("[GiveGoldCommand] mod loaded, polling queue.txt every 2s (baseDir=" .. baseDir .. ")\n")
