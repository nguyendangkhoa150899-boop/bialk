// Bộ kiểm CỨU TIỀN LÚC BOT BẬT LẠI, chạy: node TaiXiu/kiemtra/restart-test.js
// Không cần bot: trích đúng đoạn logic ra chạy thử với dữ liệu giả.
//
// Vì sao có file này, lỗi THẬT có sẵn từ trước:
//   Lúc bot bật lại có HAI đường cứu tiền chạy nối nhau:
//     · refundBootPendingBets()  hoàn TIỀN CƯỢC theo dbCache._txBets
//     · khối khôi phục _txPlan   trả TIỀN THẮNG theo kế hoạch đã chốt
//   Từ lúc KHOÁ SỔ tới lúc mở ván mới (pha hiện nhân + pha nặn, ~24s mỗi ván 54s),
//   CẢ HAI cùng tồn tại -> restart đúng quãng đó thì người THẮNG nhận 2 lần,
//   người THUA được hoàn trắng tiền cược. Deploy giữa giờ chơi là dính.
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

// ---------------------------------------------------------------- 1. đọc luật từ code thật
muc('luật trong code');
ok('hoàn cược lúc bật lại có ngó tới bảng trả tiền (_txPlan)',
    /const keHoach = \(dbCache\._txPlan && dbCache\._txPlan\.byUser\)/.test(SRC));
ok('ai đã có phần trong bảng trả tiền thì KHÔNG hoàn cược nữa',
    /if \(keHoach && b && keHoach\[b\.userId\]\) \{ boQua\+\+; continue; \}/.test(SRC));
ok('trả nốt xong thì dọn sổ cược, khỏi hoàn lại lần bật sau',
    /dbCache\._txBets = \[\];\s*\/\/ ván đã chốt sổ/.test(SRC));
ok('bảng trả tiền có cờ paid, trả 2 lần cũng chỉ ăn 1',
    /if \(!e \|\| p\.paid\[userId\]\) return null;/.test(SRC) && /p\.paid\[userId\] = true;/.test(SRC));

// ---------------------------------------------------------------- 2. chạy thử logic
muc('diễn lại: bot tắt ĐÚNG lúc đang nặn (đã khoá sổ, chưa mở ván mới)');
{
    // dựng lại đúng cảnh: A thắng, B thua, cả hai đều còn trong sổ cược
    const vi = { A: 0, B: 0 };
    const dbCache = {
        _txBets: [{ userId: 'A', amount: 10000 }, { userId: 'B', amount: 10000 }],
        _txPlan: {
            gameId: 99, paid: {},
            byUser: {
                A: { name: 'A', stake: 10000, win: 30000, refund: 0 },   // thắng 30.000
                B: { name: 'B', stake: 10000, win: 0, refund: 0 },       // thua sạch
            },
        },
    };

    // --- đường 1: hoàn cược (bản ĐÃ VÁ) ---
    const keHoach = (dbCache._txPlan && dbCache._txPlan.byUser) ? dbCache._txPlan.byUser : null;
    let boQua = 0;
    for (const b of dbCache._txBets) {
        if (keHoach && b && keHoach[b.userId]) { boQua++; continue; }
        vi[b.userId] += b.amount;
    }
    ok('bỏ qua đúng 2 khoản đã nằm trong bảng trả tiền', boQua === 2, String(boQua));

    // --- đường 2: trả nốt theo bảng ---
    const p = dbCache._txPlan;
    for (const uid of Object.keys(p.byUser)) {
        if (p.paid[uid]) continue;
        p.paid[uid] = true;
        const e = p.byUser[uid];
        vi[uid] += e.win + e.refund;
    }
    dbCache._txBets = [];

    ok('người THẮNG nhận đúng 30.000 (không phải 40.000)', vi.A === 30000, String(vi.A));
    ok('người THUA nhận 0 (không được hoàn trắng tiền cược)', vi.B === 0, String(vi.B));
    ok('sổ cược đã dọn, bật lại lần nữa không hoàn thêm', dbCache._txBets.length === 0);

    // bật lại lần nữa cho chắc
    const vi2 = JSON.parse(JSON.stringify(vi));
    for (const b of dbCache._txBets) vi2[b.userId] += b.amount;
    for (const uid of Object.keys(p.byUser)) { if (p.paid[uid]) continue; vi2[uid] += p.byUser[uid].win; }
    ok('bật lại lần 2 KHÔNG cộng thêm đồng nào', vi2.A === vi.A && vi2.B === vi.B,
        JSON.stringify(vi2) + ' vs ' + JSON.stringify(vi));
}

muc('diễn lại: bot tắt lúc CÒN ĐANG NHẬN CƯỢC (chưa khoá sổ, chưa có bảng trả tiền)');
{
    const vi = { A: 0, B: 0 };
    const dbCache = { _txBets: [{ userId: 'A', amount: 10000 }, { userId: 'B', amount: 5000 }], _txPlan: null };
    const keHoach = (dbCache._txPlan && dbCache._txPlan.byUser) ? dbCache._txPlan.byUser : null;
    for (const b of dbCache._txBets) {
        if (keHoach && b && keHoach[b.userId]) continue;
        vi[b.userId] += b.amount;
    }
    ok('chưa chốt sổ thì HOÀN ĐỦ tiền cược cho cả hai', vi.A === 10000 && vi.B === 5000, JSON.stringify(vi));
}

console.log('\n♻️  CỨU TIỀN LÚC BẬT LẠI: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
