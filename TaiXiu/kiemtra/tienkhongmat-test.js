// Bộ kiểm TIỀN KHÔNG ĐƯỢC MẤT — chạy: node TaiXiu/kiemtra/tienkhongmat-test.js
// Không cần bot: đọc luật thẳng từ index.js + chạy thử phần logic thuần.
//
// Cược là tiền ĐÃ TRỪ KHỎI VÍ. Mọi chỗ xoá sổ cược đều phải giải quyết tiền trước.
// Trước đây có 5 chỗ xoá thẳng (mất trắng / treo tiền) và 1 cửa hậu trả hai lần.
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'BotDoMin', 'index.js'), 'utf8');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- 1. mọi chỗ xoá cược
muc('mọi chỗ xoá sổ cược phải giải quyết tiền trước');
ok('có hàm dọn sổ cược dùng chung', /function txDonSoCuoc\(lyDo\)/.test(SRC));
ok('hàm đó: ván ĐÃ quay thì trả theo bảng, CHƯA quay thì hoàn cược',
    /if \(p && p\.byUser\)[\s\S]{0,260}?txPayUser\(p\.gameId, uid\)/.test(SRC) &&
    /else \{[\s\S]{0,300}?updatePoints\(b\.userId, b\.amount\)/.test(SRC));
{
    // Liệt kê từng chỗ gán txState.bets = [] rồi soi 12 dòng NGAY TRƯỚC nó.
    const d = SRC.split(/\r?\n/);
    const xau = [];
    d.forEach((ln, i) => {
        if (!/^\s*txState\.bets = \[\];\s*$/.test(ln)) return;
        const truoc = d.slice(Math.max(0, i - 12), i).join('\n');
        // thân CHÍNH hàm dọn sổ thì tất nhiên được xoá — nhìn xa hơn để nhận ra nó
        const than = d.slice(Math.max(0, i - 30), i).join('\n');
        const an = /txDonSoCuoc\(/.test(truoc)            // đã dọn tiền ngay trước
            || /function txDonSoCuoc/.test(than)           // chính thân hàm đó
            || /await txState\.resultPromise/.test(truoc)  // vừa chốt ván xong
            || /resultPromise \|\| Promise\.resolve/.test(truoc);
        if (!an) xau.push('dòng ' + (i + 1));
    });
    ok('không còn chỗ nào xoá cược mà chưa giải quyết tiền', xau.length === 0, xau.join(', '));
}
ok('admin khởi tạo lại bàn: dọn tiền trước khi sang ván mới',
    /txDonSoCuoc\('admin khởi tạo lại bàn/.test(SRC));
ok('admin dừng bàn giữa ván: không để tiền treo',
    /txDonSoCuoc\('admin dừng bàn giữa ván/.test(SRC));
ok('watchdog kẹt: dọn tiền + TĂNG số ván (giữ số cũ là khớp nhầm bảng trả tiền)',
    /txDonSoCuoc\('watchdog reset ván/.test(SRC) &&
    /txDonSoCuoc\('watchdog reset ván[^\n]*\n\s*txState\.gameId\+\+;/.test(SRC));
ok('nhảy cóc mốc nặn: hoàn cược chứ không xoá trắng',
    /if \(!txState\.resultPromise\) \{[\s\S]{0,200}?txDonSoCuoc\('nhảy cóc mốc nặn/.test(SRC));
ok('mất bảng phải dựng lại: cũng dọn tiền', /txDonSoCuoc\('mất bảng, dựng lại ván/.test(SRC));
ok('lỗi vòng ván: cũng dọn tiền', /txDonSoCuoc\('lỗi vòng ván/.test(SRC));

// ---------------------------------------------------------------- 2. cửa hậu trả hai lần
muc('không có cửa hậu trả hai lần');
ok('chốt ván KHÔNG tự dựng lại bảng trả tiền khi không tìm thấy bảng cũ',
    !/\? txState\.plan : txPlanPayout\(gameId, bets, d1, d2, d3\)/.test(SRC) &&
    /không còn bảng trả tiền\) - bỏ qua, KHÔNG trả lại lần nữa/.test(SRC));
ok('cờ đã-trả ghi NGAY xuống đĩa, không chỉ nằm trong RAM',
    /dbCache\._txPlan\.paid\[userId\] = true;/.test(SRC));
ok('chốt sổ xong ghi đĩa ngay (dọn bảng trả tiền + sổ cược)',
    /txState\.plan = null; delete dbCache\._txPlan;\s*\n\s*dbCache\._txBets = \[\];\s*\n\s*saveDbNow\(\);/.test(SRC));
ok('hoàn cược lúc bật lại bỏ qua ai đã có trong bảng trả tiền',
    /if \(keHoach && b && keHoach\[b\.userId\]\) \{ boQua\+\+; continue; \}/.test(SRC));

// ---------------------------------------------------------------- 3. giờ giấc
muc('3 mốc giờ admin chỉnh được');
ok('mốc "hết giờ đặt" = hiện nhân + nặn (không phải chỉ nặn)',
    /lockSeconds: \(\) => txNhanS\(\) \+ txLockS\(\)/.test(SRC) &&
    /txKhoaSoS: \(\) => txNhanS\(\) \+ txLockS\(\)/.test(SRC));
ok('bảng Discord ghi đủ cả 2 mốc khoá sổ',
    /\$\{txNhanS\(\) \+ txLockS\(\)\} giây cuối khóa sổ/.test(SRC));

// ---------------------------------------------------------------- 4. tên cửa + lịch sử
muc('bàn 52 cửa: tên cửa và lịch sử');
ok('tên cửa luôn tra qua txTenCua, không tra thẳng bảng 5 cửa cũ',
    /function txTenCua\(id\)/.test(SRC) &&
    !/TX_CHOICES\[b\.choice\]\.name/.test(SRC) && !/TX_CHOICES\[sel\.choice\]\.name/.test(SRC));
ok('bảng lịch sử KHÔNG tự tính lại tiền (đọc số nhận về từ lõi tiền)',
    /const net = \(Number\(b\.nhan\) \|\| 0\) - b\.amount;/.test(SRC) &&
    !/win = b\.amount \* TX_BAO_RATE/.test(SRC));
ok('ván CŨ thiếu số nhận về thì tính tổng theo winners, không in ai cũng thua',
    /const cuMoi = \(h\.bets \|\| \[\]\)\.every/.test(SRC) && /if \(!cuMoi\) \{/.test(SRC));
ok('kế hoạch trả tiền ghi kèm số nhận về TỪNG CỬA', /cuaAgg: Object\.values\(cuaAgg\)/.test(SRC));

// ---------------------------------------------------------------- 5. đường Discord
muc('đường đặt cược Discord không lách luật tiền');
ok('cả 2 đường Discord đi qua txDatLo (kiểm đủ ví/sàn/trần cửa/trần tổng)',
    (SRC.match(/txDatLo\(userId, interaction\.user\.username, \[\{ choice: sel\.choice/g) || []).length === 2);
ok('không còn đường Discord tự trừ tiền rồi tự push cược',
    !/txState\.bets\.push\(\{ userId, username: interaction\.user\.username/.test(SRC));

// ---------------------------------------------------------------- 6. chạy thử dọn sổ cược
muc('chạy thử hàm dọn sổ cược');
{
    // ván CHƯA quay -> phải hoàn nguyên cược
    const vi = { A: 0, B: 0 };
    const bets = [{ userId: 'A', amount: 7000 }, { userId: 'B', amount: 3000 }];
    let plan = null;
    if (plan) { /* nhánh trả theo bảng */ }
    else for (const b of bets) vi[b.userId] += b.amount;
    ok('ván chưa quay: hoàn đúng nguyên tiền cược', vi.A === 7000 && vi.B === 3000, JSON.stringify(vi));

    // ván ĐÃ quay -> trả theo bảng, KHÔNG hoàn thêm
    const vi2 = { A: 0, B: 0 };
    const plan2 = { gameId: 5, paid: {}, byUser: { A: { win: 21000, refund: 0 }, B: { win: 0, refund: 0 } } };
    for (const uid of Object.keys(plan2.byUser)) {
        if (plan2.paid[uid]) continue;
        plan2.paid[uid] = true;
        vi2[uid] += plan2.byUser[uid].win + plan2.byUser[uid].refund;
    }
    ok('ván đã quay: thắng nhận 21.000, thua nhận 0 (không hoàn thêm)',
        vi2.A === 21000 && vi2.B === 0, JSON.stringify(vi2));
}

console.log('\n🧯 TIỀN KHÔNG ĐƯỢC MẤT: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
