#!/usr/bin/env node
// ============================================================================
// patch_shopoff.js — VÁ JSON (UAssetCLI tojson) của bảng shop thương nhân Palworld
// để THƯƠNG NHÂN KHÔNG BÁN GÌ (kinh tế server đi hết qua Shop Dogcoin trên web).
//
// Dùng cho: DT_ItemShopCreateData(_Common)  (shop item: làng, sa mạc, núi lửa, huy chương,
//           tiền thưởng, đấu trường, đoàn lữ hành, lang thang, hầm ngục...)
//           DT_PalShopCreateData(_Common)   (người buôn Pal + chợ đen bán pal)
//           DT_ItemShopLotteryData*         (nếu có - hàng ngẫu nhiên của thương nhân lang thang)
//
// Cách vá (2 chế độ):
//   --stock   (MẶC ĐỊNH, an toàn) : mọi IntProperty tên "Stock" trong bảng -> -1
//                                   (wiki pwmodding: Stock -1 = "not visible in shop";
//                                   0 = vô hạn; >=1 = giới hạn/ngày). Giữ nguyên cấu trúc mảng.
//   --empty                        : làm RỒNG mọi ArrayProperty tên *ProductDataArray* / *ShopProductData*
//                                   (dùng khi bảng không có field Stock, vd pal shop).
//   --check <file.json>            : chỉ đếm, không ghi (dùng để soi cấu trúc trước khi vá).
//
// Cách chạy (máy có pak-tools):
//   dotnet UAssetCLI.dll tojson DT_ItemShopCreateData_Common.uasset shop.json VER_UE5_1 Mappings.usmap
//   node patch_shopoff.js shop.json shop.patched.json --stock
//   dotnet UAssetCLI.dll fromjson shop.patched.json build/Pal/Content/Pal/DataTable/ItemShop/DT_ItemShopCreateData_Common.uasset Mappings.usmap
//   (lặp cho bảng pal shop, rồi) repak pack build BialkShopOff_P.pak --version V11 -p 764445180
//
// Script KHÔNG đoán schema cứng: duyệt đệ quy toàn JSON, bắt theo TÊN property, nên đổi
// phiên bản game vẫn chạy - nhưng PHẢI đọc log "đã vá N" và round-trip check như README.
// ============================================================================
const fs = require('fs');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const files = args.filter(a => !a.startsWith('--'));
const mode = flags.has('--empty') ? 'empty' : 'stock';
const checkOnly = flags.has('--check');
if (!files[0] || (!checkOnly && !files[1])) {
    console.log('Dùng: node patch_shopoff.js <in.json> <out.json> [--stock|--empty]   |   node patch_shopoff.js --check <in.json>');
    process.exit(1);
}

const src = fs.readFileSync(files[0], 'utf8');
const json = JSON.parse(src);

const stat = { rows: 0, stockSeen: 0, stockPatched: 0, arraysSeen: 0, arraysEmptied: 0, stockValues: {}, arrayNames: {} };
const isStockName = (n) => typeof n === 'string' && /^Stock$/i.test(n);
const isProductArray = (n) => typeof n === 'string' && /(ProductDataArray|ShopProductData|ProductData)$/i.test(n);

function walk(node, depth) {
    if (Array.isArray(node)) { node.forEach(x => walk(x, depth + 1)); return; }
    if (!node || typeof node !== 'object') return;
    const t = String(node.$type || '');
    // Dòng DataTable (UAssetAPI: StructPropertyData có Name = row name, nằm trong Table.Data)
    if (/StructPropertyData/.test(t) && node.StructType && /ShopCreateData|ShopLottery/i.test(String(node.StructType))) stat.rows++;
    if (isStockName(node.Name) && /IntPropertyData/.test(t) && typeof node.Value === 'number') {
        stat.stockSeen++;
        stat.stockValues[node.Value] = (stat.stockValues[node.Value] || 0) + 1;
        if (!checkOnly && mode === 'stock' && node.Value !== -1) { node.Value = -1; stat.stockPatched++; }
    }
    // Người buôn Pal (DT_PalShopCreateData): mỗi dòng có CharacterNum = số pal bày bán -> 0 = shop trống.
    // GIỮ CharacterIDArray nguyên (không làm rỗng - tránh code bốc ngẫu nhiên chia cho 0).
    if (/^CharacterNum$/i.test(String(node.Name)) && /IntPropertyData/.test(t) && typeof node.Value === 'number') {
        stat.stockSeen++;
        stat.stockValues['CharacterNum=' + node.Value] = (stat.stockValues['CharacterNum=' + node.Value] || 0) + 1;
        if (!checkOnly && mode === 'stock' && node.Value !== 0) { node.Value = 0; stat.stockPatched++; }
    }
    if (isProductArray(node.Name) && /ArrayPropertyData/.test(t) && Array.isArray(node.Value)) {
        stat.arraysSeen++;
        stat.arrayNames[node.Name] = (stat.arrayNames[node.Name] || 0) + 1;
        if (!checkOnly && mode === 'empty' && node.Value.length) { node.Value = []; stat.arraysEmptied++; }
    }
    for (const k of Object.keys(node)) if (k !== '$type') walk(node[k], depth + 1);
}
walk(json, 0);

console.log('Bảng:', files[0]);
console.log('  dòng shop (StructType *ShopCreateData/*ShopLottery):', stat.rows);
console.log('  field Stock thấy:', stat.stockSeen, '| phân bố giá trị gốc:', JSON.stringify(stat.stockValues));
console.log('  mảng sản phẩm thấy:', stat.arraysSeen, JSON.stringify(stat.arrayNames));
if (checkOnly) { console.log('(--check: không ghi gì)'); process.exit(0); }
if (mode === 'stock') {
    console.log('  => đã đặt Stock = -1 cho', stat.stockPatched, 'sản phẩm');
    if (!stat.stockSeen) console.log('  !! Bảng này KHÔNG có field Stock - dùng --empty cho bảng này');
} else {
    console.log('  => đã làm rỗng', stat.arraysEmptied, 'mảng sản phẩm');
    if (!stat.arraysSeen) console.log('  !! Không thấy mảng *ProductDataArray/*ShopProductData - soi lại tên bằng --check');
}
if ((mode === 'stock' && !stat.stockPatched) || (mode === 'empty' && !stat.arraysEmptied)) {
    console.log('KHÔNG có gì để vá - không ghi file.'); process.exit(2);
}
fs.writeFileSync(files[1], JSON.stringify(json, null, 2));
console.log('Đã ghi', files[1]);
