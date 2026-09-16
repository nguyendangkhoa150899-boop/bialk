#!/usr/bin/env node
// ============================================================================
// patch_expedition.js — TẮT RỚT một số món ở TRẠM THÁM HIỂM PAL (Expedition) bằng cách vá
// JSON (UAssetCLI tojson) của 2 bảng xổ số Palworld — đúng cơ chế đã dùng cho máy nghiền cổ vật
// (BialkServer_P.pak, 08/08): thám hiểm cũng bốc đồ qua DT_FieldLotteryNameDataTable, 18 dòng
// Expedition_* (xác nhận 16/09 bằng DTINFO trên server test).
//
// Mặc định tắt: AncientParts2 (Lõi Văn Minh Cổ Đại) + PalCrystal_Ex (Linh Kiện Văn Minh Cổ Đại
// = "Ancient Civilization Parts" theo gameitems.json). Đổi bằng --items=.
//
// HAI BẢNG:
//   DT_ItemLotteryDataTable       dòng đánh số 1..N; mỗi dòng = 1 món trong 1 slot của 1 "field":
//                                 FieldName (vd Expedition_Grass) · SlotNo · StaticItemId · WeightInSlot · MinNum/MaxNum
//   DT_FieldLotteryNameDataTable  dòng tên = field (Expedition_Grass...): ItemSlot<N>_ProbabilityPercent
//                                 = % slot N được bốc. Đặt "+0" là slot đó KHÔNG BAO GIỜ ra.
// => Muốn tắt 1 món: tìm slot chứa nó (bảng item) rồi đặt % slot đó = "+0" (bảng field).
//
// ⚠️ MỘT SLOT CÓ THỂ CHỨA NHIỀU MÓN (bài học slot 14 recycler: implant + RideJumpCount). Tắt slot
// là tắt HẾT món trong slot. Mặc định script CHỈ tắt slot mà mọi món đều là món cần tắt; slot lẫn
// món khác thì BÁO và GIỮ. Muốn tắt luôn: --force (chấp nhận mất kèm mấy món kia).
//
// Cách chạy (máy có pak-tools + Mappings.usmap):
//   dotnet UAssetCLI.dll tojson DT_ItemLotteryDataTable.uasset      item.json  VER_UE5_1 Mappings.usmap
//   dotnet UAssetCLI.dll tojson DT_FieldLotteryNameDataTable.uasset field.json VER_UE5_1 Mappings.usmap
//   node patch_expedition.js --check item.json field.json                 # CHỈ SOI, không ghi
//   node patch_expedition.js item.json field.json field.patched.json      # vá
//   dotnet UAssetCLI.dll fromjson field.patched.json build/Pal/Content/Pal/DataTable/Common/DT_FieldLotteryNameDataTable.uasset Mappings.usmap
//   repak pack build BialkExpedition_P.pak --version V11 -p 764445180
//
// ⚠️ Cùng file DT_FieldLotteryNameDataTable với BialkServer_P.pak (recycler). Hai pak sửa cùng 1
// file thì pak nào load sau đè pak kia -> MỘT trong hai sẽ mất tác dụng. Cách đúng: vá NỐI TIẾP
// trên cùng 1 json (chạy script recycler rồi chạy script này lên kết quả) và đóng 1 pak duy nhất
// thay BialkServer_P.pak. Cờ --keep-recycler kiểm giúp: báo nếu 5 dòng recycler slot 8/9/14 chưa "+0".
//
// Tuỳ chọn:
//   --items=A,B      món cần tắt (StaticItemId), mặc định AncientParts2,PalCrystal_Ex
//   --rows=~^Expedition_   dòng field áp dụng (regex ~..., mặc định mọi dòng bắt đầu Expedition_)
//   --force          tắt cả slot có lẫn món khác
//   --keep-recycler  kiểm 5 dòng recycler còn "+0" ở slot 8/9/14 không (để đóng chung 1 pak)
// Script KHÔNG đoán cấu trúc cứng: duyệt đệ quy toàn JSON theo $type + Name như patch_shopoff.js,
// nhưng PHẢI đọc kỹ log --check và round-trip như README trước khi lên server.
// ============================================================================
const fs = require('fs');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--') && !a.includes('=')));
const files = args.filter(a => !a.startsWith('--'));
const opt = (p, d) => { const a = args.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const checkOnly = flags.has('--check');
const force = flags.has('--force');
const keepRecycler = flags.has('--keep-recycler');
const ITEMS = new Set(opt('--items=', 'AncientParts2,PalCrystal_Ex').split(',').map(s => s.trim()).filter(Boolean));
const rowSel = opt('--rows=', '~^Expedition_');
const ROWS = /^\/.*\/$/.test(rowSel) ? new RegExp(rowSel.slice(1, -1)) : (rowSel.startsWith('~') ? new RegExp(rowSel.slice(1)) : new RegExp('^' + rowSel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));

if (files.length < 2 || (!checkOnly && files.length < 3)) {
    console.log('Dùng: node patch_expedition.js --check <item.json> <field.json>');
    console.log('      node patch_expedition.js <item.json> <field.json> <field.patched.json> [--items=A,B] [--rows=~^Expedition_] [--force] [--keep-recycler]');
    process.exit(1);
}
// Nguồn ánh xạ slot->món: (a) item.json từ UAssetCLI, HOẶC (b) dump.log của mod có khối
// "DTMAP PalMasterDataTableAccess_ItemLotteryData FieldName,SlotNo,StaticItemId,..." (16/09: lệnh
// DTMAP đọc cả cột bảng ngay trên server test - không cần file game). Tự nhận theo nội dung.
const itemSrc = fs.readFileSync(files[0], 'utf8');
const itemJson = /^\s*[{[]/.test(itemSrc) ? JSON.parse(itemSrc) : null;
const itemDump = itemJson ? null : itemSrc;
const fieldJson = JSON.parse(fs.readFileSync(files[1], 'utf8'));

// ---- tiện ích duyệt JSON UAssetCLI ----
const typeOf = (n) => String((n && n.$type) || '');
const isRow = (n) => n && typeof n === 'object' && /StructPropertyData/.test(typeOf(n)) && typeof n.Name === 'string';
// giá trị "phẳng" của 1 property con: Name/Str/Int/Float/Bool đều nằm ở .Value
const val = (p) => (p && typeof p === 'object' && 'Value' in p) ? p.Value : undefined;
const num = (v) => { if (typeof v === 'number') return v; if (typeof v === 'string' && /^[+-]?\d+(\.\d+)?$/.test(v)) return Number(v); return NaN; };
// gom mọi property con TRỰC TIẾP của 1 dòng theo Name (dòng DataTable: các field nằm trong node.Value[])
function fieldsOf(row) {
    const out = {};
    const kids = Array.isArray(row.Value) ? row.Value : [];
    for (const k of kids) if (k && typeof k === 'object' && typeof k.Name === 'string') out[k.Name] = k;
    return out;
}
// tìm mọi dòng trong 1 bảng (dòng = StructPropertyData có ít nhất 1 property con mang tên nào đó trong `must`)
function rowsOf(json, must) {
    const rows = [];
    (function walk(n) {
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (!n || typeof n !== 'object') return;
        if (isRow(n)) {
            const f = fieldsOf(n);
            if (must.every(m => f[m])) { rows.push(n); return; }   // là dòng -> không duyệt sâu thêm
        }
        for (const k of Object.keys(n)) if (k !== '$type') walk(n[k]);
    })(json);
    return rows;
}

// ---- 1) bảng ITEM: field -> slot -> [món] ----
const map = {};   // field -> { slot -> [{item, weight}] }
let itemRowCount = 0;
const addRow = (field, slot, item, w) => {
    if (!field || !Number.isFinite(slot) || !item) return;
    itemRowCount++;
    ((map[field] = map[field] || {})[slot] = map[field][slot] || []).push({ item, weight: Number.isFinite(w) ? w : null });
};
if (itemJson) {
    const itemRows = rowsOf(itemJson, ['FieldName', 'SlotNo', 'StaticItemId']);
    if (!itemRows.length) { console.log('!! Bảng item: không thấy dòng nào có FieldName+SlotNo+StaticItemId - soi lại tên field trong json (có phải DT_ItemLotteryDataTable?)'); process.exit(2); }
    for (const r of itemRows) {
        const f = fieldsOf(r);
        addRow(String(val(f.FieldName) ?? ''), num(val(f.SlotNo)), String(val(f.StaticItemId) ?? ''), num(val(f.WeightInSlot)));
    }
} else {
    // dump.log: trong khối DTMAP có "HEADER row;FieldName;SlotNo;StaticItemId;..." rồi các dòng "MAP a;b;c;..."
    // Có thể có nhiều khối (lọc theo tiền tố khác nhau) -> gom hết, khử trùng theo (field,slot,item).
    let header = null; const seen = new Set();
    for (const raw of itemDump.split(/\r?\n/)) {
        const line = raw.trim();
        if (/^=+ DTMAP /.test(line)) { header = null; continue; }
        const h = /^HEADER (.+)$/.exec(line); if (h) { header = h[1].split(';'); continue; }
        const m = /^MAP (.+)$/.exec(line); if (!m || !header) continue;
        const cols = m[1].split(';'); const o = {}; header.forEach((k, i) => o[k] = cols[i]);
        if (!('FieldName' in o) || !('SlotNo' in o) || !('StaticItemId' in o)) continue;   // khối của bảng khác
        const key = o.FieldName + '|' + o.SlotNo + '|' + o.StaticItemId; if (seen.has(key)) continue; seen.add(key);
        addRow(o.FieldName, num(o.SlotNo), o.StaticItemId, num(o.WeightInSlot));
    }
    if (!itemRowCount) { console.log('!! dump.log: không thấy khối DTMAP nào có FieldName+SlotNo+StaticItemId - chạy DTMAP PalMasterDataTableAccess_ItemLotteryData FieldName,SlotNo,StaticItemId,WeightInSlot Expedition_ trước'); process.exit(2); }
}
const targetFields = Object.keys(map).filter(f => ROWS.test(f)).sort();
console.log('Nguồn món:', files[0], itemJson ? '(json UAssetCLI)' : '(dump.log DTMAP)', '·', itemRowCount, 'dòng ·', Object.keys(map).length, 'field ·', targetFields.length, 'field khớp', String(ROWS));
if (!targetFields.length) { console.log('!! Không field nào khớp - tên dòng thám hiểm có thể khác, thử --rows=~Expedition'); process.exit(2); }

// ---- 2) quyết định slot nào tắt, ở field nào ----
const plan = {};   // field -> { slot -> {items, tat:boolean, lydo} }
let nHit = 0, nSkip = 0;
for (const f of targetFields) {
    plan[f] = {};
    for (const [slot, list] of Object.entries(map[f])) {
        const items = list.map(x => x.item);
        const dinh = items.filter(i => ITEMS.has(i));
        if (!dinh.length) continue;
        const khac = items.filter(i => !ITEMS.has(i));
        const tat = khac.length === 0 || force;
        plan[f][slot] = { items, dinh, khac, tat };
        if (tat) nHit++; else nSkip++;
    }
}

// ---- 3) bảng FIELD: đặt % slot = "+0" ----
const fieldRows = rowsOf(fieldJson, ['ItemSlot1_ProbabilityPercent']);
if (!fieldRows.length) { console.log('!! Bảng field: không thấy dòng nào có ItemSlot1_ProbabilityPercent - có phải DT_FieldLotteryNameDataTable?'); process.exit(2); }
const byName = {}; for (const r of fieldRows) byName[r.Name] = r;
let patched = 0, already = 0, missingRow = [], missingSlot = [];
const before = {};
for (const f of targetFields) {
    const row = byName[f];
    if (!row) { if (Object.keys(plan[f]).length) missingRow.push(f); continue; }
    const fl = fieldsOf(row);
    for (const [slot, p] of Object.entries(plan[f])) {
        const prop = fl['ItemSlot' + slot + '_ProbabilityPercent'];
        if (!prop) { missingSlot.push(f + ':' + slot); continue; }
        const cur = val(prop);
        (before[f] = before[f] || {})[slot] = cur;   // ghi % gốc cho CẢ slot giữ lại - admin cần số này để cân --force
        if (!p.tat) continue;
        if (num(cur) === 0) { already++; continue; }
        if (!checkOnly) prop.Value = '+0';   // UAssetAPI biểu diễn float 0 bằng "+0" (README)
        patched++;
    }
}

// ---- 4) báo cáo ----
console.log('Bảng field:', files[1], '·', fieldRows.length, 'dòng');
console.log('Món cần tắt:', [...ITEMS].join(', '), force ? '· --force (tắt cả slot lẫn món khác)' : '· chỉ tắt slot thuần món cần tắt');
console.log('');
console.log('FIELD'.padEnd(28) + 'SLOT  % gốc   HÀNH ĐỘNG');
for (const f of targetFields) {
    const slots = Object.entries(plan[f]);
    if (!slots.length) { console.log(f.padEnd(28) + '  -     -     ✅ không có món cần tắt, giữ nguyên'); continue; }
    for (const [slot, p] of slots) {
        const pct = before[f] && before[f][slot] !== undefined ? String(before[f][slot]) : '?';
        const chu = p.tat
            ? ('⛔ tắt slot (' + p.dinh.join(', ') + (p.khac.length ? ' + MẤT KÈM: ' + p.khac.join(', ') : '') + ')')
            : ('⚠️ GIỮ - slot lẫn món khác: ' + p.khac.join(', ') + ' (dùng --force để tắt luôn)');
        console.log(f.padEnd(28) + String(slot).padStart(4) + '  ' + pct.padEnd(7) + chu);
    }
}
console.log('');
console.log('=> slot tắt:', nHit, '· đã "+0" sẵn:', already, '· sẽ vá:', patched, '· slot giữ vì lẫn món khác:', nSkip);
if (missingRow.length) console.log('!! field có món cần tắt nhưng KHÔNG có dòng trong bảng field:', missingRow.join(', '));
if (missingSlot.length) console.log('!! không thấy property ItemSlot<N>_ProbabilityPercent cho:', missingSlot.join(', '));

// ---- 5) --keep-recycler: pak recycler cũ sửa CÙNG file này -> kiểm 5 dòng đó đã "+0" chưa ----
if (keepRecycler) {
    const bad = [];
    for (let i = 1; i <= 5; i++) {
        const r = byName['AncientRelicRecycler_WorldTreeRelic_0' + i];
        if (!r) { bad.push('thiếu dòng _0' + i); continue; }
        const fl = fieldsOf(r);
        for (const s of [8, 9, 14]) { const p = fl['ItemSlot' + s + '_ProbabilityPercent']; if (p && num(val(p)) !== 0) bad.push('_0' + i + ' slot ' + s + ' = ' + val(p)); }
    }
    console.log(bad.length ? ('⚠️ RECYCLER chưa vá trong json này: ' + bad.join(' · ') + ' -> chạy vá recycler trước rồi vá tiếp file này, đóng 1 pak') : '✅ recycler: 5 dòng slot 8/9/14 đã "+0" - đóng chung 1 pak được');
}

if (checkOnly) { console.log('(--check: không ghi gì)'); process.exit(0); }
if (!patched) { console.log('KHÔNG có gì để vá - không ghi file.'); process.exit(2); }
fs.writeFileSync(files[2], JSON.stringify(fieldJson, null, 2));
console.log('Đã ghi', files[2], '- nhớ round-trip fromjson -> tojson so lại như README trước khi đóng pak.');
