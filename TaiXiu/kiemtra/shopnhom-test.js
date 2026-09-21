// ============================================================================
//  Bộ kiểm ➕ THÊM CẢ NHÓM VÀO SHOP — chạy: node TaiXiu/kiemtra/shopnhom-test.js
//
//  Chủ server 21/09: "update thêm những item còn lại cho vào rương ích kỷ được luôn,
//  như implant nguyên liệu cho pal".
//
//  Bảng shop nằm trong database TRÊN MÁY CHỦ nên bên này không biết đang có món gì —
//  vì vậy làm thành một cái NÚT tự bỏ qua món đã có, chạy được với bất kỳ bảng nào.
//  File này canh: nhặt đúng món, không trùng, không vượt trần, và ảnh vẫn hiện được.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const GOC = path.join(__dirname, '..', '..', 'BotDoMin');
const PANEL = fs.readFileSync(path.join(GOC, 'panel.js'), 'utf8');
const IDX = fs.readFileSync(path.join(GOC, 'index.js'), 'utf8');
const WEB = fs.readFileSync(path.join(GOC, 'webplay.js'), 'utf8');
const KHO = require(path.join(GOC, 'gameitems.json'));

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- 1. hai nhóm phải có sẵn
muc('nhóm 🧬 Implant và 🐾 Nguyên liệu cho Pal phải tồn tại');
ok('nhóm implant có trong danh sách mặc định', /\{ key: 'implant', label: '🧬 IMPLANT', lock: true \}/.test(IDX));
ok('...và bị KHOÁ (admin lỡ xoá thì tự mọc lại, món không rơi về Thương nhân)',
    /ITEM_CAT_LOCKED = ITEM_CAT_DEF\.filter\(c => c\.lock\)/.test(IDX));
ok('nhóm nguyên liệu cho pal có trong danh sách mặc định',
    /\{ key: 'material', label: '🐾 NGUYÊN LIỆU CHO PAL' \}/.test(IDX));

// ---------------------------------------------------------------- 2. kho game có đủ hàng
muc('kho game có đủ món cho hai nhóm');
const implant = KHO.filter(x => /^PalPassiveSkillChange_/.test(x.id));
const material = KHO.filter(x => x.t === 'Material');
ok('có món IMPLANT trong kho game (' + implant.length + ' món)', implant.length >= 50, String(implant.length));
ok('có món NGUYÊN LIỆU trong kho game (' + material.length + ' món)', material.length >= 100, String(material.length));
ok('món nào cũng có id + tên tiếng Việt', implant.concat(material).every(x => x.id && x.n));
ok('id chỉ gồm chữ/số/_ (máy chủ lọc đúng ký tự đó, khác là mất món)',
    implant.concat(material).every(x => /^[A-Za-z0-9_]+$/.test(x.id)),
    (implant.concat(material).find(x => !/^[A-Za-z0-9_]+$/.test(x.id)) || {}).id);

// ---------------------------------------------------------------- 3. trần danh sách
muc('trần bảng shop phải đủ chỗ VÀ phải báo khi cắt');
{
    const m = IDX.match(/const ITEM_SHOP_MAX = (\d+);/);
    const tran = m ? Number(m[1]) : 0;
    // shop đang ~116 món (84 + 32 đạn theo chú thích cũ) + 68 implant + 184 nguyên liệu
    const can = 116 + implant.length + material.length;
    ok('⭐ trần (' + tran + ') đủ chỗ cho cả hai nhóm (cần ~' + can + ')', tran >= can, tran + ' < ' + can);
    ok('⭐ vượt trần thì GHI SỔ chứ không cắt âm thầm',
        /VƯỢT TRẦN[\s\S]{0,80}?đã cắt bỏ/.test(IDX) && /sach\.length = ITEM_SHOP_MAX;/.test(IDX));
    ok('không còn .slice(0, 300) cắt lén', !/\.slice\(0, 300\)/.test(IDX));
}

// ---------------------------------------------------------------- 4. ảnh vẫn hiện được
muc('🖼️ ảnh: thiếu file nội bộ vẫn phải có icon, không ra rừng ô 📦');
{
    const co = new Set(fs.readdirSync(path.join(GOC, 'assets', 'itemimage')));
    const tiLe = (l) => Math.round(100 * l.filter(x => co.has(x.i + '.webp')).length / l.length);
    // Chính vì tỉ lệ này thấp mới phải bắc cầu sang CDN — ghi số ra cho lần sau khỏi hỏi lại.
    console.log('       (ảnh có sẵn trong máy chủ: implant ' + tiLe(implant) + '% · nguyên liệu ' + tiLe(material) + '%)');
    ok('⭐ trang cược có nấc dự phòng lấy icon gốc từ paldb',
        /cdn\.paldb\.cc\/image\/Others\/InventoryItemIcon\/Texture\//.test(WEB) && /function isImgLoi\(el\)/.test(WEB));
    // ⚠️ so vị trí phải SOI TRONG THÂN isImg. Chuỗi "/itemimage/" còn xuất hiện ở chục chỗ
    // khác trong trang (nút Dogcoin, tỉ giá...), so trên cả file là ra kết quả vô nghĩa.
    const iF = WEB.indexOf("'function isImg(f){");
    const than = iF >= 0 ? WEB.slice(iF, iF + 900) : '';
    ok('...thử file nội bộ TRƯỚC (ảnh admin tự up vẫn thắng)',
        !!than && than.indexOf('/itemimage/') < than.indexOf('data-cdn'), than.slice(0, 120));
    ok('...CDN hụt nữa mới ra ô 📦', /el\.outerHTML=\\'<div class="isPh">📦<\/div>\\'/.test(WEB));
    ok('...và không lặp vô tận khi CDN cũng hụt (có cờ data-b)', /setAttribute\("data-b","1"\)/.test(WEB));
}

// ---------------------------------------------------------------- 5. CHẠY THẬT hàm thêm nhóm
muc('🔬 chạy THẬT itemShopThemNhom trong DOM giả');
{
    // bóc đúng mấy hàm cần, chạy với DOM giả — không dựng cả panel
    // ⚠️ PHẢI lấy cả chữ `async` phía trước. Cắt từ `function` là mất nó -> thân hàm có
    // `await` mà không còn async -> nạp vào là nổ "await is only valid in async functions".
    const boc = (ten) => {
        let i = PANEL.indexOf('function ' + ten + '(');
        if (i < 0) return '';
        if (PANEL.slice(i - 6, i) === 'async ') i -= 6;
        const j = PANEL.indexOf('\n}', i);
        return j < 0 ? '' : PANEL.slice(i, j + 2);
    };
    const iBang = PANEL.indexOf('var IS_NHOM=');
    const bang = iBang >= 0 ? PANEL.slice(iBang, PANEL.indexOf('\n};', iBang) + 3) : '';
    const ma = bang + '\n' + boc('isGiaGoiY') + '\n' + boc('itemShopThemNhom');
    ok('bóc được bảng nhóm + hai hàm', !!bang && /function itemShopThemNhom/.test(ma));

    const dong = [];                       // mỗi phần tử = một dòng shop giả
    const els = {
        isBulkPick: { value: 'implant' },
        isBulkBtn: { textContent: '' },
        itemShopBody: {},
    };
    const ctx = {
        GV: { items: KHO },
        gvLoad: async () => { },
        toast: (t) => ctx.__toast = t,
        itemShopAddRow: (it) => dong.push(it),
        itemShopDirty: () => { ctx.__dirty = true; },
        itemShopFilter: () => { ctx.__locLai = true; },
        document: {
            getElementById: (id) => els[id] || null,
            querySelectorAll: () => dong.map(d => ({ value: d.id })),
            querySelector: () => null,
        },
        console, String, Number, Array, Object, JSON, Math,
    };
    vm.createContext(ctx);
    let loi = '';
    try { vm.runInContext(ma, ctx, { filename: 'themnhom.js' }); } catch (e) { loi = e.message; }
    ok('nạp chạy được', !loi, loi);

    if (!loi) {
        const chay = (nhom) => { els.isBulkPick.value = nhom; return vm.runInContext('itemShopThemNhom()', ctx); };

        return chay('implant').then(() => {
            ok('⭐ thêm ĐÚNG ' + implant.length + ' món implant', dong.length === implant.length,
                dong.length + ' / ' + implant.length);
            ok('...gán đúng nhóm shop 🧬', dong.every(d => d.cat === 'implant'));
            ok('...có tên tiếng Việt, không phải id trần', dong.every(d => d.name && d.name !== d.id));
            ok('...điền sẵn tên ảnh theo texture', dong.every(d => /\.webp$/.test(d.img)));
            ok('...giá gợi ý > 0 (để 0 là thành "miễn phí" trên web)', dong.every(d => d.price > 0));
            ok('...có chạy lại bộ lọc sau khi thêm (không thì dòng mới bị ẩn sạch)', ctx.__locLai === true);
            ok('...và đánh dấu CHƯA LƯU', ctx.__dirty === true);

            const truoc = dong.length;
            return chay('implant').then(() => {
                ok('⭐⭐ bấm LẦN HAI không thêm trùng món nào', dong.length === truoc,
                    dong.length + ' (trước ' + truoc + ')');
                ok('...và báo cho admin biết là đã đủ', /đã có đủ/.test(ctx.__toast || ''), ctx.__toast);

                return chay('material').then(() => {
                    const them = dong.length - truoc;
                    ok('⭐ thêm tiếp ĐÚNG ' + material.length + ' món nguyên liệu', them === material.length,
                        them + ' / ' + material.length);
                    ok('...nguyên liệu vào nhóm 🐾, không lẫn với implant',
                        dong.slice(truoc).every(d => d.cat === 'material'));
                    const id = new Set(dong.map(d => d.id));
                    ok('⭐⭐ cả bảng KHÔNG có id trùng', id.size === dong.length, id.size + ' / ' + dong.length);

                    console.log('\n🧰 THÊM NHÓM VÀO SHOP: ' + P + ' đạt, ' + F + ' hỏng');
                    process.exit(F ? 1 : 0);
                });
            });
        });
    }
}

console.log('\n🧰 THÊM NHÓM VÀO SHOP: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
