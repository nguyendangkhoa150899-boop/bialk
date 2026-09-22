// Bộ kiểm MÁY BÀN SIÊU TÀI XỈU — chạy: node SieuTaiXiu/kiemtra/ban-test.js
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

/** Dựng một bàn sạch + ví giả. */
function dungBan(viDau) {
    const DB = { _stxOn: true };
    const VI = Object.assign({}, viDau);
    const so = [];
    const ban = taoBan({
        db: () => DB,
        layNguoi: (id) => ({ points: VI[id] || 0, name: id }),
        congVi: (id, t, ly) => { VI[id] = (VI[id] || 0) + t; so.push({ id, t, ly }); },
        ghiLog: () => { }, luuDb: () => { },
    });
    ban.khoiDong();
    return { ban, DB, VI, so };
}
/**
 * Đưa bàn tới ĐÚNG mốc quay xúc xắc.
 * Vòng ván xét theo thứ tự: chốt (now ≥ targetTime) TRƯỚC, rồi mới tới quay
 * (now ≥ nanTime). Nên muốn quay mà chưa chốt thì phải để targetTime còn Ở PHÍA
 * TRƯỚC 1 giây — đặt bằng now là rơi thẳng vào nhánh chốt, ván chưa kịp quay.
 */
function toiMocQuay(ban) {
    const S = ban._S;
    S.status = 'nhan';
    S.nhan = { gameId: S.gameId, o: CUA.taoNhan(), luc: Date.now() };
    S.targetTime = Math.floor(Date.now() / 1000) + 1;   // now ≥ nanTime, now < targetTime
    return S;
}

// ---------------------------------------------------------------- phí
muc('phí 20% trừ đúng, xoá cược hoàn đủ');
{
    const { ban, VI } = dungBan({ A: 1000000 });
    const d = ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }, { choice: 'tong9', amount: 5000 }]);
    ok('đặt được', d.ok, d.error);
    ok('cược 15.000 + phí 3.000 = trừ ví 18.000', d.truVi === 18000 && d.phi === 3000, JSON.stringify(d));
    ok('ví đúng 982.000', VI.A === 982000, String(VI.A));
    const x = ban.xoaCuoc('A');
    ok('xoá cược hoàn ĐỦ cả phí (ván chưa quay)', x.hoan === 18000 && VI.A === 1000000, VI.A + ' / ' + x.hoan);
    ok('xoá lần hai thì báo lỗi, không hoàn khống', !!ban.xoaCuoc('A').error && VI.A === 1000000, String(VI.A));
}

// ---------------------------------------------------------------- kéo thả chip
muc('kéo thả chip: huỷ đúng 1 ô / dời chip sang ô khác');
{
    const cuoc = (b, u) => Object.fromEntries(b.trangThai(u).myBets.map(x => [x.choice, x.amount]));
    const { ban, VI, DB } = dungBan({ A: 1000000, B: 1000000 });
    ban.dat('A', 'A', [{ choice: 'chan', amount: 10000 }, { choice: 'tai', amount: 5000 }]);   // trừ 18.000
    ban.dat('B', 'B', [{ choice: 'le', amount: 3000 }]);
    const d = ban.doiCua('A', 'A', 'chan', 'le');
    ok('dời Chẵn -> Lẻ ok, mang đủ 10.000', d.ok && d.tien === 10000, JSON.stringify(d));
    ok('dời KHÔNG đụng ví (vẫn 982.000)', VI.A === 982000, String(VI.A));
    const c = cuoc(ban,'A');
    ok('sổ A: Lẻ 10.000 + Tài 5.000, hết Chẵn', c.le === 10000 && c.tai === 5000 && !c.chan, JSON.stringify(c));
    ok('phí đi theo chip (phiToi vẫn 3.000)', ban.trangThai('A').phiToi === 3000, String(ban.trangThai('A').phiToi));
    ok('không đụng cược người khác', cuoc(ban,'B').le === 3000);
    ok('ghi sổ _stxBets NGAY', (DB._stxBets || []).some(b => b.userId === 'A' && b.choice === 'le' && b.amount === 10000));
    ok('dời ô trống -> lỗi', !!ban.doiCua('A', 'A', 'chan', 'tai').error);
    ok('dời vào chính ô cũ -> lỗi', !!ban.doiCua('A', 'A', 'le', 'le').error);
    ok('ô bịa (đi hoặc đến) -> lỗi', !!ban.doiCua('A', 'A', 'le', 'xyz').error && !!ban.doiCua('A', 'A', 'xyz', 'le').error);
    const t = ban.doiCua('A', 'A', 'le', 'bao1');   // Bão 1 trần 1.000, mang 10.000 sang là vượt
    ok('dời vượt trần ô đích -> chặn, sổ giữ nguyên (không dời nửa chừng)',
        /tối đa/.test(t.error || '') && cuoc(ban,'A').le === 10000, t.error);
    const x = ban.xoaCua('A', 'le');
    ok('huỷ ô Lẻ hoàn 12.000 (cả phí), ví 994.000', x.ok && x.hoan === 12000 && VI.A === 994000, JSON.stringify(x) + ' ' + VI.A);
    ok('ô Tài còn nguyên 5.000', cuoc(ban,'A').tai === 5000);
    ok('huỷ ô trống -> lỗi, không hoàn khống', !!ban.xoaCua('A', 'le').error && VI.A === 994000, String(VI.A));
    ok('huỷ ô bịa -> lỗi', !!ban.xoaCua('A', 'xyz').error);
    toiMocQuay(ban);
    ok('ngoài pha đặt: cấm cả dời lẫn huỷ ô', !!ban.doiCua('A', 'A', 'tai', 'xiu').error && !!ban.xoaCua('A', 'tai').error);
}

// ---------------------------------------------------------------- admin: gợi ý ép + huỷ ép + báo cược
muc('gợi ý ép rẻ nhất · huỷ ép · báo cược');
{
    const { ban, DB } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    const g = ban.timEpReNhat();
    ok('gợi ý ép: có bộ ba làm Tài thua sạch (trả 0), kể đủ soCuoc/tongDat', g.tra === 0 && g.soCuoc === 1 && g.tongDat === 10000, JSON.stringify(g));
    const s = g.dice[0] + g.dice[1] + g.dice[2], bao = g.dice[0] === g.dice[1] && g.dice[1] === g.dice[2];
    ok('bộ ba gợi ý thật sự là Xỉu hoặc Bão', bao || s <= 10, g.dice.join('-'));
    const ax = ban.adminXem();
    ok('adminXem gửi epGoiY + betsCount cho panel', ax.epGoiY && ax.epGoiY.tra === 0 && ax.betsCount === 1);
    ban.epKetQua(6, 6, 5);
    ok('ép xong adminXem.ep = 6-6-5', JSON.stringify(ban.adminXem().ep) === '[6,6,5]');
    const h = ban.huyEp();
    ok('huỷ ép: xoá _stxEp, báo daHuy=true, adminXem.ep về null', h.ok && h.daHuy === true && !DB._stxEp && ban.adminXem().ep === null);
    ok('huỷ khi không có ép: ok nhưng daHuy=false', ban.huyEp().daHuy === false);
    ok('bàn trống: gợi ý vẫn trả về, soCuoc 0', dungBan({}).ban.timEpReNhat().soCuoc === 0);
}
{
    const goi = [];
    const dung = (baoCuoc) => { const b = taoBan({ db: () => ({ _stxOn: true }), layNguoi: () => ({ points: 1e6, name: 'A' }), congVi: () => { }, ghiLog: () => { }, luuDb: () => { }, baoCuoc }); b.khoiDong(); return b; };
    const b1 = dung((u, t, c, tien) => goi.push([u, c, tien]));
    b1.dat('A', 'A', [{ choice: 'tai', amount: 5000 }, { choice: 'le', amount: 2000 }]);
    ok('đặt 2 ô -> báo cược 2 lần, đúng ô + tiền gốc (chưa gồm phí)', goi.length === 2 && goi[0][1] === 'tai' && goi[0][2] === 5000 && goi[1][1] === 'le' && goi[1][2] === 2000, JSON.stringify(goi));
    const b2 = dung(() => { throw new Error('discord chết'); });
    const d = b2.dat('A', 'A', [{ choice: 'tai', amount: 5000 }]);
    ok('báo cược nổ KHÔNG làm hỏng ván đặt', d.ok === true, d.error);
    ok('không nối baoCuoc thì vẫn đặt bình thường', dungBan({ A: 1e6 }).ban.dat('A', 'A', [{ choice: 'tai', amount: 5000 }]).ok);
}

// ---------------------------------------------------------------- luật đặt
muc('luật đặt cược');
{
    const { ban, VI } = dungBan({ A: 1000000, B: 1000 });
    ok('cửa bậy thì hỏng CẢ GIỎ', !!ban.dat('A', 'A', [{ choice: 'tai', amount: 5000 }, { choice: 'xxx', amount: 5000 }]).error);
    ok('giỏ bậy không trừ đồng nào', VI.A === 1000000, String(VI.A));
    ok('dưới sàn cược thì chặn', !!ban.dat('A', 'A', [{ choice: 'tai', amount: 500 }]).error);
    ok('không đủ ví (phải tính cả phí) thì chặn', !!ban.dat('B', 'B', [{ choice: 'tai', amount: 1000 }]).error,
        'ví 1.000 mà cần 1.200');
    // trần cửa: bao3 trần 1.000
    ok('vượt trần cửa thì chặn', !!ban.dat('A', 'A', [{ choice: 'bao3', amount: 5000 }]).error);
    const r = ban.dat('A', 'A', [{ choice: 'bao3', amount: 1000 }]);
    ok('đúng trần cửa thì cho', r.ok, r.error);
    ok('đặt thêm vào cửa đã kịch trần thì chặn', !!ban.dat('A', 'A', [{ choice: 'bao3', amount: 1000 }]).error);
}

// ---------------------------------------------------------------- trọn ván
muc('chạy trọn một ván: trả đúng tiền, ghi đúng lịch sử');
{
    const { ban, VI, DB } = dungBan({ A: 5000000 });
    // đặt cả 6 ô ĐƠN -> ván nào cũng trúng ít nhất 1 ô
    const gio = [1, 2, 3, 4, 5, 6].map(n => ({ choice: 'don' + n, amount: 2000 }));
    const d = ban.dat('A', 'A', gio);
    ok('đặt 6 ô Đơn: cược 12.000 + phí 2.400', d.tong === 12000 && d.phi === 2400, JSON.stringify(d));
    const viSauDat = VI.A;

    const S = toiMocQuay(ban);
    ban.nhip();                       // now >= nanTime && status nhan -> quay
    ok('đã quay xúc xắc', !!S.nan && S.nan.dice.length === 3, JSON.stringify(S.nan));
    const xx = S.nan.dice.slice(), gid = S.gameId;
    // chụp bảng nhân của ván NÀY để lát tính tay cho khớp
    const bangNhan = JSON.parse(JSON.stringify((S.plan && S.plan.bangNhan) || {}));
    S.targetTime = Math.floor(Date.now() / 1000) - 1;
    ban.nhip();                       // now >= targetTime -> chốt
    ok('sang ván mới', S.gameId === gid + 1, String(S.gameId));

    // tính tay bằng lõi tiền
    let can = 0; for (const g of gio) can += CUA.tinhTra(g.choice, g.amount, xx, bangNhan);
    const thuc = VI.A - viSauDat;
    ok('trả đúng số lõi tiền tính (' + can.toLocaleString('vi-VN') + ')', thuc === can, thuc + ' vs ' + can);
    ok('bảng trả tiền đã dọn', !DB._stxPlan);
    ok('sổ cược đã dọn', (DB._stxBets || []).length === 0);

    const h = ban.trangThai('A').history[0];
    ok('lịch sử ghi đúng ván vừa chốt', h && h.gameId === gid, h && String(h.gameId));
    ok('lịch sử có 3 viên + tổng khớp', h && h.dice.join('-') === xx.join('-') && h.sum === xx[0] + xx[1] + xx[2]);
    ok('lịch sử chỉ giữ ô nhân RA TRÚNG',
        h && Object.keys(h.nhan || {}).every(k => CUA.cuaThang(h.dice).includes(k)), JSON.stringify(h && h.nhan));
}

// ---------------------------------------------------------------- không mất tiền
muc('tiền không được mất');
{
    // admin tắt bàn giữa lúc có cược -> phải hoàn
    const { ban, VI } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    ok('đã trừ 12.000', VI.A === 988000, String(VI.A));
    ban.datBatTat(false);
    ok('admin tắt bàn thì HOÀN đủ (gồm phí)', VI.A === 1000000, String(VI.A));
}
{
    // lỗi giữa vòng ván -> hoàn
    const { ban, VI } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    ban._S.status = 'nhan';
    ban._S.nhan = null;             // cố tình làm hỏng để nhịp văng
    ban._S.targetTime = Math.floor(Date.now() / 1000) - 1;
    ban.nhip();
    ok('lỡ mốc chốt (ván không quay được) thì HOÀN cược', VI.A === 1000000, String(VI.A));
}
{
    // bot bật lại giữa ván: KHÔNG được vừa hoàn vừa trả
    const DB = { _stxOn: true };
    const VI = { A: 0, B: 0 };
    DB._stxBets = [{ userId: 'A', amount: 10000, phi: 2000 }, { userId: 'B', amount: 10000, phi: 2000 }];
    DB._stxPlan = { gameId: 9, paid: {}, byUser: { A: { name: 'A', stake: 10000, phi: 2000, win: 30000 }, B: { name: 'B', stake: 10000, phi: 2000, win: 0 } } };
    const ban = taoBan({ db: () => DB, layNguoi: (id) => ({ points: VI[id], name: id }), congVi: (id, t) => { VI[id] += t; }, ghiLog: () => { }, luuDb: () => { } });
    ban.khoiDong();
    ok('người THẮNG nhận đúng 30.000, KHÔNG cộng thêm tiền hoàn', VI.A === 30000, String(VI.A));
    ok('người THUA nhận 0, KHÔNG được hoàn trắng', VI.B === 0, String(VI.B));
    ban.khoiDong();
    ok('bật lại lần hai không cộng thêm đồng nào', VI.A === 30000 && VI.B === 0, VI.A + '/' + VI.B);
}

// ---------------------------------------------------------------- 2 sơ hở đã rà
muc('2 sơ hở rà được khi đọc lại');
{
    // ① nhip() trước khoiDong() phải là no-op
    const DB = { _stxOn: true };
    const ban = taoBan({ db: () => DB, layNguoi: () => ({ points: 0 }), congVi: () => { }, ghiLog: () => { }, luuDb: () => { } });
    const gidTruoc = ban._S.gameId;
    ban.nhip(); ban.nhip(); ban.nhip();
    ok('nhip() TRƯỚC khoiDong() không mở ván, không nhảy số', ban._S.gameId === gidTruoc && ban._S.status === 'off',
        'gameId ' + gidTruoc + ' -> ' + ban._S.gameId + ' · ' + ban._S.status);
    ban.khoiDong();
    ok('khoiDong() xong mới có ván', ban._S.status === 'betting');
}
{
    // ② đặt cược xong sổ trên đĩa phải có NGAY
    const { ban, DB } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    ok('đặt xong _stxBets có ngay, không chờ nhịp sau', Array.isArray(DB._stxBets) && DB._stxBets.length === 1,
        JSON.stringify(DB._stxBets));
    ban.xoaCuoc('A');
    ok('xoá xong _stxBets rỗng ngay', Array.isArray(DB._stxBets) && DB._stxBets.length === 0);
}

// ---------------------------------------------------------------- 3 nút
muc('3 nút thao tác nhanh');
{
    const { ban, VI } = dungBan({ A: 5000000 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }, { choice: 'tong9', amount: 5000 }]);
    const vi1 = VI.A;
    const x2 = ban.nhanDoi('A', 'A');
    ok('✖️2 đặt thêm đúng 15.000 (+phí)', x2.ok && x2.tong === 15000, JSON.stringify(x2));
    ok('✖️2 trừ đúng 18.000', vi1 - VI.A === 18000, String(vi1 - VI.A));
    const m = {}; ban.trangThai('A').myBets.forEach(b => { m[b.choice] = b.amount; });
    ok('✖️2 nhân đôi đúng từng ô', m.tai === 20000 && m.tong9 === 10000, JSON.stringify(m));
    ok('🔁 chưa có ván trước thì chặn', !!ban.datLai('A', 'A').error);
    ban.xoaCuoc('A');
    ok('✖️2 khi chưa đặt gì thì chặn', !!ban.nhanDoi('A', 'A').error);
}

// ---------------------------------------------------------------- giờ + admin
muc('admin chỉnh');
{
    const { ban } = dungBan({});
    ok('đổi 3 mốc giờ', ban.datGio(20, 3, 10).ok);
    ok('giây nặn dưới 6 thì chặn', !!ban.datGio(20, 3, 4).error);
    ok('đổi trần cược', ban.datTran({ deu: 60000 }).ok);
    ok('trần dưới sàn cược thì chặn', !!ban.datTran({ deu: 100 }).error);
    ok('đổi mức nhà cái ăn', ban.datMucAn(12).ok);
    ok('mức ăn ngoài khoảng thì chặn', !!ban.datMucAn(50).error);
    ok('ép kết quả', ban.epKetQua(1, 2, 3).ok);
    ok('ép số bậy thì chặn', !!ban.epKetQua(0, 2, 9).error);
    const a = ban.adminXem();
    ok('admin xem được mức ăn + thang + tổng cược', !!a.rtp && !!a.thang && !!a.betAgg);
    ban.datMucAn(8);
}

// ---------------------------------------------------------------- chống soi bài
muc('chống soi bài');
{
    const { ban } = dungBan({ A: 1000000 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    const S = ban._S;
    S.status = 'nhan'; S.nhan = { gameId: S.gameId, o: CUA.taoNhan(), luc: Date.now() };
    const t = ban.trangThai('A');
    ok('pha hiện nhân: ĐÃ lộ bảng nhân', t.nhan && typeof t.nhan === 'object');
    ok('pha hiện nhân: CHƯA gửi xúc xắc', t.nan === null, JSON.stringify(t.nan));
    ok('pha hiện nhân: cấm đặt', !!ban.dat('A', 'A', [{ choice: 'tai', amount: 1000 }]).error);
    ok('pha hiện nhân: cấm cả 3 nút',
        !!ban.nhanDoi('A', 'A').error && !!ban.datLai('A', 'A').error && !!ban.xoaCuoc('A').error);
}

console.log('\n⚡ MÁY BÀN SIÊU TÀI XỈU: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
