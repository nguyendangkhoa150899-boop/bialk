// ============================================================================
//  Bộ kiểm 🧰 RƯƠNG ÍCH KỶ — chạy: node TaiXiu/kiemtra/ruong-test.js   (không cần bot)
//
//  Chủ server 21/09: "update thêm những item còn lại CHO VÀO RƯƠNG ÍCH KỶ được luôn,
//  như implant / nguyên liệu cho pal" — ảnh: nhóm ĐẠN có nút 🧰 Vào rương, nhóm
//  NGUYÊN LIỆU và IMPLANT chỉ có 🛒 Mua.
//
//  Luật cũ (17/09): chỉ món có hạn mua TOÀN SERVER mới vào rương được.
//  Gỡ được vì hạn theo NGƯỜI vẫn bị trừ NGAY LÚC MUA (vào rương không lách được hạn nào).
//  Chừa đúng ⭐ món 1-lần-vĩnh-viễn: quên nhận trước 00:00 là mất cả tiền lẫn suất mua.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const GOC = path.join(__dirname, '..', '..', 'BotDoMin');
const IDX = fs.readFileSync(path.join(GOC, 'index.js'), 'utf8');
const WEB = fs.readFileSync(path.join(GOC, 'webplay.js'), 'utf8');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- 1. mở cho mọi nhóm
muc('🧰 mọi nhóm đều bỏ vào rương được (trừ ⭐ 1-lần)');
{
    ok('⭐⭐ không còn đòi "hạn TOÀN SERVER" mới cho vào rương',
        !/const svNhom = gqOn && gq\.mode === 'server'/.test(IDX) &&
        !/Rương chỉ dành cho món có hạn CHUNG cả server/.test(IDX));
    ok('...không còn chặn riêng implant', !/🧬 Implant không bỏ vào rương được/.test(IDX));
    ok('⭐ vẫn CHẶN món 1-lần-vĩnh-viễn (quên nhận là mất cả suất mua)',
        /if \(isOnce\) \{[\s\S]{0,300}?mỗi người chỉ mua 1 LẦN cả đời/.test(IDX));
    ok('...và câu báo chỉ đúng đường vào game mua thẳng',
        /bấm 🛒 Mua để nhận thẳng vào túi/.test(IDX));
}

// ---------------------------------------------------------------- 2. hai phía cùng luật
muc('⚠️ TRANG và MÁY CHỦ phải CÙNG LUẬT');
{
    // Trang chỉ ẩn nút cho đỡ bấm nhầm; máy chủ mới là chốt. Nới một bên mà quên bên kia:
    //   · nới trang, quên máy chủ  -> bấm được nút rồi ăn lỗi đỏ
    //   · nới máy chủ, quên trang  -> mở rồi mà nút vẫn không hiện (đúng cảnh chủ server gặp)
    const m = WEB.match(/'function ikDuoc\(it\)\{([^']*)\}',/);
    ok('đọc được hàm ikDuoc của trang', !!m, (m || [])[0]);
    const than = m ? m[1] : '';
    ok('⭐⭐ trang cũng chỉ loại đúng ⭐ 1-lần, không loại gì khác',
        /return !isOnceCat\(it\.cat\)/.test(than), than);
    ok('...không còn loại theo nhóm implant', !/it\.cat==="implant"/.test(than));
    ok('...không còn đòi mode==="server"', !/mode==="server"/.test(than));
    ok('hai phía dùng CÙNG một khái niệm "1 lần" (important)',
        /'function isOnceCat\(c\)\{return c==="important"\}'/.test(WEB) &&
        /const isOnce = it\.cat === 'important';/.test(IDX));
    ok('có ghi chú nhắc phải sửa cả hai phía', /PHẢI CÙNG LUẬT VỚI MÁY CHỦ/.test(WEB));
}

// ---------------------------------------------------------------- 3. không lách được hạn
muc('🔒 vào rương KHÔNG được lách hạn mua');
{
    // Đây là lý do gỡ chặn được. Mất mấy dòng này là mở toang cửa hậu.
    const i = IDX.indexOf('updatePoints(userId, -cost);   // trừ TRƯỚC');
    const sau = i >= 0 ? IDX.slice(i, i + 900) : '';
    ok('tìm được đoạn ngay sau khi trừ tiền', !!sau);
    ok('⭐ hạn NGÀY vẫn bị trừ', /today\[it\.id\] = \(today\[it\.id\] \|\| 0\) \+ qty;/.test(sau));
    ok('⭐ hạn IMPLANT/người vẫn bị trừ', /if \(imp\) imp\.n \+= qty;/.test(sau));
    ok('⭐ hạn Cây Thế Giới vẫn bị trừ', /if \(wt\) wt\.n \+= qty;/.test(sau));
    ok('⭐ hạn NHÓM vẫn bị trừ', /if \(gCnt\) gCnt\.n\[gqKey\] = \(gCnt\.n\[gqKey\] \|\| 0\) \+ qty;/.test(sau));
    ok('...và mấy dòng đó nằm TRƯỚC nhánh bỏ vào rương (không phải chỉ cho đường giao game)',
        sau.indexOf('if (gCnt)') < sau.indexOf('if (vaoRuong) {'));
}

// ---------------------------------------------------------------- 4. rương vẫn có hạn riêng
muc('🧰 rương vẫn giữ hạn riêng của nó');
{
    ok('hạn mua vào rương mỗi ngày', /const ICHKY_DAY_MAX = \d+;/.test(IDX) &&
        /qty > conNgay/.test(IDX));
    ok('hạn số món rương giữ được', /const ICHKY_HOLD_MAX = \d+;/.test(IDX) &&
        /qty > conCho/.test(IDX));
    ok('mua vào rương KHÔNG đòi online, không mở SFTP', /if \(!vaoRuong\) \{[\s\S]{0,400}?requireOnline\(gameName\)/.test(IDX));
    ok('vẫn đòi đã liên kết tên nhân vật', /Chưa liên kết tên nhân vật trong game/.test(IDX));
    ok('vẫn nhắc 00:00 là mất', /trước 00:00 kẻo mất/.test(IDX));
}

// ---------------------------------------------------------------- 5. CHẠY THẬT ikDuoc
muc('🔬 chạy THẬT ikDuoc của trang');
{
    const m = WEB.match(/'function isOnceCat\(c\)\{[^']*\}'/);
    const ma = (m ? m[0].slice(1, -1) : '') + '\n' +
        (WEB.match(/'function ikDuoc\(it\)\{[^']*\}',/) || [''])[0].replace(/^'|',$/g, '');
    const ctx = { IS: { dayMax: 0, dayMode: 'user', groupQuota: {} }, console };
    vm.createContext(ctx);
    let loi = '';
    try { vm.runInContext(ma, ctx, { filename: 'ikduoc.js' }); } catch (e) { loi = e.message; }
    ok('nạp chạy được', !loi, loi);
    if (!loi) {
        const thu = (cat) => vm.runInContext('ikDuoc(' + JSON.stringify({ id: 'x', cat }) + ')', ctx);
        // đúng mấy nhóm trong ảnh chủ server gửi
        for (const [cat, ten] of [['implant', '🧬 Implant'], ['material', '🐾 Nguyên liệu cho Pal'],
        ['ammo', '🔫 Đạn'], ['food', '🍖 Thức ăn'], ['weapon', '🗡️ Vũ khí'],
        ['armor', '🛡️ Giáp'], ['accessory', '💍 Phụ kiện'], ['consume', '🏪 Thương nhân'],
        ['admin', '🧺 Linh tinh']])
            ok('⭐ ' + ten + ' -> CÓ nút Vào rương', thu(cat) === true);
        ok('⭐ QUAN TRỌNG (1 lần cả đời) -> KHÔNG có nút', thu('important') === false);
        ok('IS chưa tải xong thì không vẽ nút (khỏi bấm lúc chưa biết luật)',
            (() => { const cu = ctx.IS; ctx.IS = null; const r = thu('material'); ctx.IS = cu; return r === false; })());
    }
}

console.log('\n🧰 RƯƠNG ÍCH KỶ: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
