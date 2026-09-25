// Bộ kiểm MÁY BÀN ROULETTE, chạy: node Roulette/kiemtra/ban-test.js
// Không cần bot: dựng DB giả + ví giả, ép mốc giờ để chạy trọn ván trong tích tắc.
'use strict';
const { taoBan } = require('../ban.js');
const CUA = require('../cua.js');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');
const vn = (n) => Number(n).toLocaleString('vi-VN');

/** Dựng một bàn sạch + ví giả. */
function dungBan(viDau, dbThem) {
    const DB = Object.assign({ _rlOn: true }, dbThem || {});
    const VI = Object.assign({}, viDau);
    const so = [], logs = [];
    const ban = taoBan({
        db: () => DB,
        layNguoi: (id) => ({ points: VI[id] || 0, name: id }),
        congVi: (id, t, ly) => { VI[id] = (VI[id] || 0) + t; so.push({ id, t, ly }); },
        ghiLog: (d) => logs.push(d), luuDb: () => { },
    });
    ban.khoiDong();
    return { ban, DB, VI, so, logs };
}
const cuoc = (b, u) => Object.fromEntries(b.trangThai(u).myBets.map(x => [x.choice, x.amount]));
/** Đưa bàn tới mốc khoá sổ và cho nhịp chạy: chốt kết quả ngay. */
function khoaSo(ban) {
    const S = ban._S;
    S.targetTime = Math.floor(Date.now() / 1000) + 10;   // lockTime = target - roi(10) = now
    ban.nhip();
    return S;
}
/** Đưa bàn tới mốc trả tiền. */
function traTien(ban) {
    const S = ban._S;
    S.targetTime = Math.floor(Date.now() / 1000);
    ban.nhip();
    return S;
}

// ---------------------------------------------------------------- phí
muc('phí suy từ mức ăn, trừ đúng, xoá cược hoàn đủ');
{
    CUA.datMucAn(0.08);
    const { ban, VI } = dungBan({ A: 1000000 });
    const d = ban.dat('A', 'A', [{ choice: 'do', amount: 10000 }, { choice: 'ta1', amount: 5000 }]);
    ok('đặt được', d.ok, d.error);
    ok('cược 15.000 + phí (575 + 287) = trừ ví 15.862', d.truVi === 15862 && d.phi === 862, JSON.stringify(d));
    ok('ví đúng 984.138', VI.A === 984138, String(VI.A));
    const x = ban.xoaCuoc('A');
    ok('xoá cược hoàn ĐỦ cả phí (ván chưa chốt)', x.hoan === 15862 && VI.A === 1000000, VI.A + ' / ' + x.hoan);
    ok('xoá lần hai thì báo lỗi, không hoàn khống', !!ban.xoaCuoc('A').error && VI.A === 1000000, String(VI.A));
}

muc('admin đổi mức ăn GIỮA ván: hoàn theo phí ĐÃ GHI, không tính lại');
{
    const { ban, VI } = dungBan({ A: 1000000 });
    ban.datMucAn(0.08);
    ban.dat('A', 'A', [{ choice: 'do', amount: 10000 }]);   // phí 575
    ok('trừ 10.575', VI.A === 989425, String(VI.A));
    ban.datMucAn(0.12);                                       // phí giờ 10,57%, nếu tính lại sẽ hoàn 11.056
    const x = ban.xoaCuoc('A');
    ok('hoàn đúng 10.575 (phí lúc đặt), ví về 1.000.000', x.hoan === 10575 && VI.A === 1000000, x.hoan + ' / ' + VI.A);
    ban.datMucAn(0.08);
}

// ---------------------------------------------------------------- 9 kiểu cược
muc('đặt được đủ 9 kiểu cược, cửa bịa thì chặn');
{
    const { ban } = dungBan({ A: 10000000 });
    const gio = ['s0', 't0_1', 't7_8', 't7_10', 'd7', 'g28', 'h1', 'ta2', 'cot3', 'do', 'le', 'cao'].map(c => ({ choice: c, amount: 1000 }));
    const d = ban.dat('A', 'A', gio);
    ok('12 ô thuộc 9 kiểu đều đặt được', d.ok && d.soCua === 12, d.error);
    ok('cửa bịa bị chặn', /không hợp lệ/.test(ban.dat('A', 'A', [{ choice: 'g30', amount: 1000 }]).error || ''));
    ok('góc 30 không tồn tại (số ở cột 3 không có góc bên phải), góc 29 thì có', !CUA.THEO_ID['g30'] && !!CUA.THEO_ID['g29']);
    ok('dưới sàn 1.000 bị chặn', /tối thiểu/.test(ban.dat('A', 'A', [{ choice: 's1', amount: 500 }]).error || ''));
}

// ---------------------------------------------------------------- kéo thả chip
muc('kéo thả chip: huỷ đúng 1 ô / dời chip sang ô khác (kể cả sang góc)');
{
    const { ban, VI, DB } = dungBan({ A: 1000000, B: 1000000 });
    ban.dat('A', 'A', [{ choice: 'chan', amount: 10000 }, { choice: 's5', amount: 5000 }]);   // phí 575 + 287
    ban.dat('B', 'B', [{ choice: 'le', amount: 3000 }]);
    const viSauDat = VI.A;
    const d = ban.doiCua('A', 'A', 'chan', 'g28');
    ok('dời Chẵn -> Góc 28-29-31-32 ok, mang đủ 10.000', d.ok && d.tien === 10000, JSON.stringify(d));
    ok('dời KHÔNG đụng ví', VI.A === viSauDat, String(VI.A));
    const c = cuoc(ban, 'A');
    ok('sổ A: g28 10.000 + s5 5.000, hết Chẵn', c.g28 === 10000 && c.s5 === 5000 && !c.chan, JSON.stringify(c));
    ok('phí đi theo chip (phiToi vẫn 862)', ban.trangThai('A').phiToi === 862, String(ban.trangThai('A').phiToi));
    ok('không đụng cược người khác', cuoc(ban, 'B').le === 3000);
    ok('ghi sổ _rlBets NGAY', (DB._rlBets || []).some(b => b.userId === 'A' && b.choice === 'g28' && b.amount === 10000));
    ok('dời ô trống -> lỗi', !!ban.doiCua('A', 'A', 'chan', 'do').error);
    ok('dời vào chính ô cũ -> lỗi', !!ban.doiCua('A', 'A', 'g28', 'g28').error);
    const t = ban.doiCua('A', 'A', 'g28', 's7');   // số đơn trần 5.000, mang 10.000 sang là vượt
    ok('dời vượt trần ô đích -> chặn, sổ giữ nguyên', /tối đa/.test(t.error || '') && cuoc(ban, 'A').g28 === 10000, t.error);
    const x = ban.xoaCua('A', 'g28');
    ok('huỷ ô góc hoàn 10.575 (cả phí)', x.ok && x.hoan === 10575, JSON.stringify(x));
    ok('ô s5 còn nguyên 5.000', cuoc(ban, 'A').s5 === 5000);
    ok('huỷ ô trống -> lỗi, không hoàn khống', !!ban.xoaCua('A', 'g28').error);
}

// ---------------------------------------------------------------- trần
muc('trần cược theo nhóm + trần mỗi người');
{
    const { ban } = dungBan({ A: 100000000 });
    ok('số đơn 5.000 ok', ban.dat('A', 'A', [{ choice: 's1', amount: 5000 }]).ok);
    ok('số đơn thêm 1.000 nữa là vượt 5.000', /tối đa/.test(ban.dat('A', 'A', [{ choice: 's1', amount: 1000 }]).error || ''));
    ok('đỏ 300.000 ok', ban.dat('A', 'A', [{ choice: 'do', amount: 295000 }]).ok);
    ok('vượt trần người 300.000 thì chặn', /người\/ván/.test(ban.dat('A', 'A', [{ choice: 'den', amount: 1000 }]).error || ''));
    const r = ban.datMaxBet(0);
    ok('bỏ trần người (0)', r.ok && ban.dat('A', 'A', [{ choice: 'den', amount: 1000 }]).ok);
}

// ---------------------------------------------------------------- khoá sổ
muc('khoá sổ: chốt kết quả + số sét ngay, không nhận cược nữa');
{
    const { ban, DB } = dungBan({ A: 1000000 });
    ok('đang nhận cược', ban.trangThai('A').phase === 'bet');
    ban.dat('A', 'A', [{ choice: 'do', amount: 1000 }]);
    const S = khoaSo(ban);
    ok('sang pha rơi', S.status === 'roi' && ban.trangThai('A').phase === 'roi', S.status);
    ok('có kết quả 0-36 ngay lúc khoá', S.kq && S.kq.so >= 0 && S.kq.so <= 36, JSON.stringify(S.kq));
    ok('web nhận kết quả để vẽ bi rơi', ban.trangThai('A').kq && ban.trangThai('A').kq.so === S.kq.so);
    ok('bảng trả tiền đã lập và ghi đĩa', DB._rlPlan && DB._rlPlan.gameId === S.gameId);
    ok('số sét chỉ rơi vào ô số', Object.keys(S.nhan.o).every(k => k.charAt(0) === 's'));
    ok('đặt thêm bị chặn', /khoá sổ/.test(ban.dat('A', 'A', [{ choice: 'do', amount: 1000 }]).error || ''));
    ok('xoá / dời / huỷ đều bị chặn', !!ban.xoaCuoc('A').error && !!ban.doiCua('A', 'A', 'do', 'den').error && !!ban.xoaCua('A', 'do').error);
}

// ---------------------------------------------------------------- trả tiền
muc('trả tiền đúng: trúng 29:1, trúng có nhân, trúng đỏ, thua sạch');
{
    const { ban, VI, DB } = dungBan({ A: 1000000, B: 1000000, C: 1000000 });
    ban.dat('A', 'A', [{ choice: 's7', amount: 1000 }]);    // trừ 1.057
    ban.dat('B', 'B', [{ choice: 'do', amount: 1000 }]);    // 7 là đỏ, trừ 1.057
    ban.dat('C', 'C', [{ choice: 'den', amount: 1000 }]);   // thua
    ban.epKetQua(7);
    ban.epNhan({ s7: 100 });
    const S = khoaSo(ban);
    ok('kết quả ép = 7', S.kq.so === 7, String(S.kq.so));
    ok('số sét ép: s7 x100', S.nhan.o.s7 === 100, JSON.stringify(S.nhan.o));
    traTien(ban);
    ok('A: 1.000 x100 -> ví 1.000.000 - 1.057 + 101.000 = 1.099.943', VI.A === 1099943, String(VI.A));
    ok('B: đỏ 1:1 -> ví 1.000.000 - 1.057 + 2.000 = 1.000.943', VI.B === 1000943, String(VI.B));
    ok('C: thua sạch -> 998.943', VI.C === 998943, String(VI.C));
    ok('bảng trả tiền đã xoá khỏi đĩa', !DB._rlPlan);
    ok('sổ cược trống', (DB._rlBets || []).length === 0);
    ok('mở ván mới, nhận cược lại', ban.trangThai('A').phase === 'bet');
    const h = ban.trangThai('A').history[0];
    ok('lịch sử ghi ván: ra 7, đỏ, sét s7 x100', h.so === 7 && h.mau === 'r' && h.nhan.s7 === 100, JSON.stringify(h).slice(0, 120));
    ok('ván có cược vào sổ riêng', ban._S.hisCuoc.length === 1);
    ok('ép dùng 1 lần rồi xoá', !Number.isInteger(DB._rlEp) && !DB._rlEpNhan);
}

muc('không nhân, số đơn trả 29:1 (đã cắt, không phải 35:1)');
{
    const { ban, VI } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 's12', amount: 1000 }]);
    ban.epKetQua(12); ban.epNhan({ s12: 0 });   // tắt sét ô 12
    khoaSo(ban); traTien(ban);
    ok('ví = 1.000.000 - 1.057 + 30.000 = 1.028.943', VI.A === 1028943, String(VI.A));
}

muc('số 0: đỏ đen thua, tác 0-1 ăn 17:1, số đơn 0 ăn 29:1');
{
    const { ban, VI } = dungBan({ A: 1000000, B: 1000000, C: 1000000 });
    ban.dat('A', 'A', [{ choice: 'do', amount: 1000 }, { choice: 'den', amount: 1000 }]);
    ban.dat('B', 'B', [{ choice: 't0_1', amount: 1000 }]);
    ban.dat('C', 'C', [{ choice: 's0', amount: 1000 }]);
    ban.epKetQua(0); ban.epNhan({ s0: 0 });
    khoaSo(ban); traTien(ban);
    ok('A thua cả hai: 997.886', VI.A === 997886, String(VI.A));
    ok('B tác 0-1: 998.943 + 18.000 = 1.016.943', VI.B === 1016943, String(VI.B));
    ok('C số 0: 998.943 + 30.000 = 1.028.943', VI.C === 1028943, String(VI.C));
}

// ---------------------------------------------------------------- ép
muc('ép: khoảng hợp lệ, chỉ số đơn, huỷ được');
{
    const { ban } = dungBan({});
    ok('ép kết quả 37 -> chặn', !!ban.epKetQua(37).error);
    ok('ép kết quả -1 -> chặn', !!ban.epKetQua(-1).error);
    ok('ép sét vào góc -> chặn (chỉ số đơn)', /SỐ ĐƠN/.test(ban.epNhan({ g28: 100 }).error || ''));
    ok('ép sét x29 -> chặn (phải > 29)', !!ban.epNhan({ s1: 29 }).error);
    ok('ép sét x30 -> ok', ban.epNhan({ s1: 30 }).ok);
    ok('ép sét x500 -> ok (bậc cao nhất)', ban.epNhan({ s1: 500 }).ok);
    ok('ép sét x501 -> chặn', !!ban.epNhan({ s1: 501 }).error);
    ok('ép sét toàn ô trống -> chặn', !!ban.epNhan({ s1: '', s2: '' }).error);
    ok('huỷ ép sét', ban.huyEpNhan().daHuy === true && ban.huyEpNhan().daHuy === false);
    ban.epKetQua(5);
    ok('huỷ ép kết quả', ban.huyEp().daHuy === true && ban.huyEp().daHuy === false);
}

muc('gợi ý ép: số nhà cái trả ít nhất');
{
    const { ban } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'do', amount: 100000 }]);
    const g = ban.timEpReNhat();
    ok('gợi ý là số ĐEN hoặc 0 (đỏ ăn thì nhà cái trả 200.000)', g.tra === 0 && !CUA.laDo(g.so), JSON.stringify(g));
}

// ---------------------------------------------------------------- bật lại
muc('bot bật lại giữa ván: hoàn cược, nhưng KHÔNG hoàn ai đã có trong bảng trả tiền');
{
    // ván dở chưa chốt: có 2 phiếu trên đĩa
    const { ban, VI } = dungBan({ A: 1000000, B: 1000000 }, {
        _rlBets: [{ userId: 'A', username: 'A', choice: 'do', amount: 10000, phi: 575 },
        { userId: 'B', username: 'B', choice: 's3', amount: 2000, phi: 115 }],
    });
    void ban;
    ok('A được hoàn 10.575', VI.A === 1010575, String(VI.A));
    ok('B được hoàn 2.115', VI.B === 1002115, String(VI.B));
}
{
    // ván đã chốt, bảng trả tiền có A (chưa trả) và cược trên đĩa cũng có A + B
    const { VI, DB } = dungBan({ A: 1000000, B: 1000000 }, {
        _rlBets: [{ userId: 'A', username: 'A', choice: 's7', amount: 1000, phi: 57 },
        { userId: 'B', username: 'B', choice: 'den', amount: 1000, phi: 57 }],
        _rlPlan: { gameId: 5, so: 7, byUser: { A: { name: 'A', stake: 1000, phi: 57, win: 30000 } }, paid: {} },
    });
    ok('A KHÔNG được hoàn, chỉ được TRẢ 30.000 theo bảng', VI.A === 1030000, String(VI.A));
    ok('B (không trong bảng) được hoàn 1.057', VI.B === 1001057, String(VI.B));
    ok('bảng và sổ đã dọn', !DB._rlPlan && DB._rlBets.length === 0);
}
{
    // bảng đã đánh dấu paid: bật lại không trả lần hai
    const { VI } = dungBan({ A: 1000000 }, {
        _rlPlan: { gameId: 5, so: 7, byUser: { A: { name: 'A', stake: 1000, phi: 57, win: 30000 } }, paid: { A: true } },
    });
    ok('đã paid thì không trả nữa', VI.A === 1000000, String(VI.A));
}

// ---------------------------------------------------------------- tắt bàn
muc('admin tắt bàn giữa lúc nhận cược: hoàn hết');
{
    const { ban, VI } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'do', amount: 10000 }]);
    ban.datBatTat(false);
    ok('hoàn đủ 10.575', VI.A === 1000000, String(VI.A));
    ok('bàn tắt, không nhận cược', ban.trangThai('A').phase === 'off' && !!ban.dat('A', 'A', [{ choice: 'do', amount: 1000 }]).error);
    ban.datBatTat(true);
    ok('bật lại thì mở ván', ban.trangThai('A').phase === 'bet');
}

muc('admin tắt bàn SAU khi khoá sổ: trả theo bảng, không hoàn');
{
    const { ban, VI } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 's7', amount: 1000 }]);
    ban.epKetQua(7); ban.epNhan({ s7: 0 });
    khoaSo(ban);
    ban.datBatTat(false);
    ok('A được trả 30.000 (không hoàn 1.057)', VI.A === 1028943, String(VI.A));
}

// ---------------------------------------------------------------- nhịp
muc('nhịp ván và cờ bi chạy');
{
    const { ban } = dungBan({});
    const g = ban.datGio(15, 5, 10);
    ok('đổi nhịp 15/5/10 = ván 30s', g.ok && g.round === 30, JSON.stringify(g));
    ok('roi < 6 bị chặn', !!ban.datGio(15, 5, 5).error);
    const S = ban._S;
    S.targetTime = Math.floor(Date.now() / 1000) + 30;
    ok('đầu ván: bi đứng yên', ban.trangThai('x').biChay === false);
    S.targetTime = Math.floor(Date.now() / 1000) + 14;   // còn 14s: lock sau 4s, bi đã chạy (quay=5)
    ok('5 giây cuối trước khoá: bi chạy, vẫn nhận cược', ban.trangThai('x').biChay === true && ban.trangThai('x').phase === 'bet');
}

console.log('\n' + (F ? '❌ ' + F + ' HỎNG / ' + (P + F) : '✅ ĐẠT HẾT ' + P + ' PHÉP KIỂM'));
process.exit(F ? 1 : 0);
