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
//   --list <file.json>             : in danh sách SHOP (tên dòng + số sản phẩm) - để chọn tắt/giữ.
//   --off=A,B,C                    : CHỈ tắt các shop có tên dòng khớp (so chuỗi đúng, hoặc regex nếu bọc /.../),
//                                   shop khác GIỮ NGUYÊN. Vd --off=Arena_Shop_1,Medal_Shop_1  hoặc  --off=/^Caravan_/
//   --keep=A,B,C                   : tắt HẾT trừ các shop khớp. Vd --keep=Village_Shop_1,/^Vagrant_/
//                                   (11/09: chủ server muốn "tắt thương nhân huyền thoại, giữ con cần thiết")
//                                   Áp cho cả DT_ItemShopCreateData (Stock) lẫn DT_PalShopCreateData (CharacterNum).
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
const listOnly = flags.has('--list');
const checkOnly = flags.has('--check') || listOnly;
// --off= / --keep= : bộ lọc theo TÊN DÒNG shop (Village_Shop_1, Arena_Shop_1, Dark_01 ...)
// regex viết /.../ HOẶC ~... (Git Bash trên Windows tự đổi "/^Dark_/" thành đường dẫn -> dùng ~^Dark_ cho an toàn)
const parseSel = (prefix) => { const a = args.find(x => x.startsWith(prefix)); if (!a) return null; return a.slice(prefix.length).split(',').map(x => x.trim()).filter(Boolean).map(x => /^\/.*\/$/.test(x) ? new RegExp(x.slice(1, -1)) : (x.startsWith('~') ? new RegExp(x.slice(1)) : x)); };
const SEL_OFF = parseSel('--off='), SEL_KEEP = parseSel('--keep=');
if (SEL_OFF && SEL_KEEP) { console.log('Chỉ dùng MỘT trong --off= hoặc --keep='); process.exit(1); }
const selMatch = (list, name) => list.some(x => x instanceof RegExp ? x.test(name) : x === name);
// shop này có bị tắt không? (không có bộ lọc = tắt hết như cũ)
const shopOff = (name) => SEL_OFF ? selMatch(SEL_OFF, name) : (SEL_KEEP ? !selMatch(SEL_KEEP, name) : true);
const shops = [];   // [{name, products, off}] cho --list + log
let curShop = null;
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
    // Dòng shop = StructType *ShopCreateDataRow / PalShopCreateData (KHÔNG phải struct sản phẩm con) -> đặt curShop
    // rồi duyệt con trong ngữ cảnh shop đó; Stock/CharacterNum bên trong chỉ vá khi shopOff(curShop).
    if (/StructPropertyData/.test(t) && node.StructType && /ShopCreateData|ShopLottery/i.test(String(node.StructType)) && !/Product/i.test(String(node.StructType)) && node.Name !== 'productDataArray') {
        stat.rows++;
        const prev = curShop;
        curShop = { name: String(node.Name), products: 0, off: shopOff(String(node.Name)) };
        shops.push(curShop);
        for (const k of Object.keys(node)) if (k !== '$type' && typeof node[k] === 'object') walk(node[k], depth + 1);
        curShop = prev;
        return;
    }
    if (/StaticItemId/i.test(String(node.Name)) && curShop) curShop.products++;
    const inOffShop = !curShop || curShop.off;   // ngoài ngữ cảnh shop (không nên xảy ra) -> giữ hành vi cũ
    if (isStockName(node.Name) && /IntPropertyData/.test(t) && typeof node.Value === 'number') {
        stat.stockSeen++;
        stat.stockValues[node.Value] = (stat.stockValues[node.Value] || 0) + 1;
        if (!checkOnly && mode === 'stock' && inOffShop && node.Value !== -1) { node.Value = -1; stat.stockPatched++; }
    }
    // Người buôn Pal (DT_PalShopCreateData): mỗi dòng có CharacterNum = số pal bày bán -> 0 = shop trống.
    // GIỮ CharacterIDArray nguyên (không làm rỗng - tránh code bốc ngẫu nhiên chia cho 0).
    if (/^CharacterNum$/i.test(String(node.Name)) && /IntPropertyData/.test(t) && typeof node.Value === 'number') {
        stat.stockSeen++;
        stat.stockValues['CharacterNum=' + node.Value] = (stat.stockValues['CharacterNum=' + node.Value] || 0) + 1;
        if (!checkOnly && mode === 'stock' && inOffShop && node.Value !== 0) { node.Value = 0; stat.stockPatched++; }
    }
    if (isProductArray(node.Name) && /ArrayPropertyData/.test(t) && Array.isArray(node.Value)) {
        stat.arraysSeen++;
        stat.arrayNames[node.Name] = (stat.arrayNames[node.Name] || 0) + 1;
        if (!checkOnly && mode === 'empty' && inOffShop && node.Value.length) { node.Value = []; stat.arraysEmptied++; }
    }
    for (const k of Object.keys(node)) if (k !== '$type') walk(node[k], depth + 1);
}
walk(json, 0);

console.log('Bảng:', files[0]);
console.log('  dòng shop (StructType *ShopCreateData/*ShopLottery):', stat.rows);
if (SEL_OFF || SEL_KEEP) console.log('  bộ lọc:', SEL_OFF ? '--off' : '--keep', (SEL_OFF || SEL_KEEP).map(String).join(', '), '=> TẮT', shops.filter(x => x.off).length, '/ GIỮ', shops.filter(x => !x.off).length, 'shop');
if (listOnly || SEL_OFF || SEL_KEEP) {
    console.log('  ' + 'SHOP'.padEnd(22) + 'SP'.padStart(4) + '  TRẠNG THÁI');
    for (const sh of shops) console.log('  ' + sh.name.padEnd(22) + String(sh.products).padStart(4) + '  ' + (sh.off ? '⛔ tắt' : '✅ giữ'));
    const unknown = (SEL_OFF || SEL_KEEP || []).filter(x => !(x instanceof RegExp) && !shops.some(sh => sh.name === x));
    if (unknown.length) console.log('  !! tên shop KHÔNG có trong bảng này:', unknown.join(', '));
}
if (listOnly) { process.exit(0); }
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
