#!/usr/bin/env node
// ============================================================================
// patch_paldrop_item.js — TẮT rớt MỘT MÓN ở MỘT SỐ PAL trong bảng rơi đồ DT_PalDropItem(_Common),
// bằng cách đặt Rate<N> = "+0" ở đúng slot có ItemId<N> == món đó. Các món khác của pal GIỮ NGUYÊN
// (khác BialkNoDrop đời trước: tắt CẢ dòng Silvance/Dandilord).
//
// Lần đầu (17/09/2026): Thermal_Core (Lõi Siêu Nhiệt) ở Jetragon (JetDragon) + Aegidron (DomeArmorDragon).
//
// Bài học 09/09 giữ nguyên: mỗi pal có NHIỀU dòng (000 <70, 070 ≥70, 080, BOSS_...) - script quét theo
// CharacterID nên bắt đủ mọi biến thể; --check in ra hết trước khi vá.
//
// Dùng (máy có toolchain - repak + .NET 10 + UAssetCLI, xem README "Toolchain chạy ngay trên máy không có game"):
//   node patch_paldrop_item.js --check <in.json> --item=Thermal_Core --pals=JetDragon,DomeArmorDragon
//   node patch_paldrop_item.js <in.json> <out.json> --item=Thermal_Core --pals=JetDragon,DomeArmorDragon
//   (chạy cho CẢ DT_PalDropItem.json và DT_PalDropItem_Common.json - server không rõ nạp bản nào)
// --pals= so với CharacterID sau khi bỏ tiền tố BOSS_ (nên gõ mã gốc là bắt cả BOSS). Regex: --pals=~^Jet
// --rows=A,B  (tuỳ chọn) chỉ vá đúng TÊN DÒNG liệt kê.
// Idempotent: slot đã "+0" thì đếm "đã tắt sẵn", không ghi nếu không có gì đổi.
// ============================================================================
const fs = require('fs');
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--') && !a.includes('=')));
const files = args.filter(a => !a.startsWith('--'));
const opt = (p, d) => { const a = args.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const checkOnly = flags.has('--check');
const ITEM = opt('--item=', '');
const palSel = opt('--pals=', ''); const rowSel = opt('--rows=', '');
// 17/09: ngoài TẮT hẳn (mặc định), cho phép GIẢM SỐ LƯỢNG rơi mà giữ nguyên tỉ lệ.
//   --setmin=1 --setmax=2   -> mọi slot có món đó rơi 1-2 cái thay vì 1-9 tuỳ pal
// Có --setmin/--setmax thì KHÔNG đụng Rate (không tắt), chỉ sửa số lượng.
const SETMIN = opt('--setmin=', null), SETMAX = opt('--setmax=', null);
const DOI_SL = SETMIN !== null || SETMAX !== null;
if (!ITEM || (!palSel && !rowSel) || files.length < 1 || (!checkOnly && files.length < 2)) {
    console.log('Dùng: node patch_paldrop_item.js [--check] <in.json> [<out.json>] --item=<StaticItemId> --pals=<CharacterID,...|~regex> [--rows=...] [--setmin=N --setmax=N]');
    process.exit(1);
}
const toMatcher = (s) => { if (!s) return null; if (s.startsWith('~')) { const re = new RegExp(s.slice(1)); return (v) => re.test(v); } const set = new Set(s.split(',').map(x => x.trim()).filter(Boolean)); return (v) => set.has(v); };
const palMatch = toMatcher(palSel), rowMatch = toMatcher(rowSel);
// 17/09: --item= nhận cả regex (vd --item=~^Blueprint_) vì mỗi boss Alpha rớt một mã bản vẽ riêng.
const itemMatch = toMatcher(ITEM);

const json = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const typeOf = (n) => String((n && n.$type) || '');
const rows = [];
(function walk(n) {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    if (/StructPropertyData/.test(typeOf(n)) && typeof n.Name === 'string' && Array.isArray(n.Value) && n.Value.some(p => p && p.Name === 'CharacterID')) { rows.push(n); return; }
    for (const k of Object.keys(n)) if (k !== '$type') walk(n[k]);
})(json);
if (!rows.length) { console.log('!! Không thấy dòng nào có CharacterID - có phải DT_PalDropItem?'); process.exit(2); }
const prop = (r, name) => r.Value.find(p => p && p.Name === name);
const val = (p) => (p && 'Value' in p) ? p.Value : undefined;
const num = (v) => { if (typeof v === 'number') return v; if (typeof v === 'string' && /^[+-]?\d+(\.\d+)?$/.test(v)) return Number(v); return NaN; };

let hitRows = 0, patched = 0, already = 0; const report = [];
for (const r of rows) {
    const cid = String(val(prop(r, 'CharacterID')) ?? '');
    const base = cid.replace(/^BOSS_/, '');
    const okRow = rowMatch ? rowMatch(r.Name) : (palMatch(base) || palMatch(cid));
    if (!okRow) continue;
    hitRows++;
    const slots = [];
    for (let i = 1; i <= 10; i++) {
        const id = String(val(prop(r, 'ItemId' + i)) ?? 'None'); if (id === 'None' || !id) continue;
        const rp = prop(r, 'Rate' + i); const rate = val(rp);
        if (itemMatch(id)) {
            if (DOI_SL) {
                // GIẢM SỐ LƯỢNG, giữ tỉ lệ. Tên field trong bảng: min<i> (chữ thường) và Max<i> (chữ hoa).
                const mp = prop(r, 'min' + i), xp = prop(r, 'Max' + i);
                const cu = val(mp) + '-' + val(xp);
                const mMoi = SETMIN !== null ? Number(SETMIN) : num(val(mp));
                const xMoi = SETMAX !== null ? Number(SETMAX) : num(val(xp));
                if (num(val(mp)) === mMoi && num(val(xp)) === xMoi) { already++; slots.push(i + ':' + id + '(đã ' + cu + ')'); }
                else {
                    slots.push(i + ':' + id + '(' + rate + '%, x' + cu + ' → x' + mMoi + '-' + xMoi + ')');
                    if (!checkOnly) { if (mp) mp.Value = mMoi; if (xp) xp.Value = xMoi; }
                    patched++;
                }
            } else if (num(rate) === 0) { already++; slots.push(i + ':' + id + '(đã 0)'); }
            else { slots.push(i + ':' + id + '(' + rate + '%→0)'); if (!checkOnly && rp) { rp.Value = '+0'; } patched++; }
        } else slots.push(i + ':' + id + '(' + rate + '% giữ)');
    }
    report.push('  ' + r.Name.padEnd(26) + slots.join('  '));
}
console.log('Bảng:', files[0], '·', rows.length, 'dòng · món:', ITEM, '· dòng pal khớp:', hitRows);
report.forEach(l => console.log(l));
console.log(DOI_SL ? ('=> slot đổi số lượng: ' + patched + ' · đã đúng sẵn: ' + already)
    : ('=> slot tắt mới: ' + patched + ' · đã 0 sẵn: ' + already));
if (!hitRows) { console.log('!! Không dòng nào khớp --pals/--rows - kiểm mã CharacterID (vd Jetragon = JetDragon)'); process.exit(2); }
if (checkOnly) { console.log('(--check: không ghi gì)'); process.exit(0); }
if (!patched) { console.log('KHÔNG có gì để vá - không ghi file.'); process.exit(2); }
fs.writeFileSync(files[1], JSON.stringify(json, null, 2));
console.log('Đã ghi', files[1]);
