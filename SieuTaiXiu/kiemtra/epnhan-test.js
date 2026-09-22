// ============================================================================
//  Bộ kiểm ✋ ÉP HỆ SỐ NHÂN — chạy: node SieuTaiXiu/kiemtra/epnhan-test.js  (không cần bot)
//
//  Chủ server 22/09: "giúp mình can thiệp được hệ số nhân của siêu tài xỉu, can thiệp được
//  x tài xỉu + chẵn lẻ" → "1 bảng nằm riêng để ép hệ số nhân TỪ 2 ĐẾN 14 cho tài xỉu chẵn lẻ,
//  khi bấm thì trong 4 giây số nhân sẽ có nó".
//
//  Chạy MÁY BÀN THẬT với đồng hồ tự lái, ép rồi soi bảng nhân của ván — không đọc chữ suông.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { taoBan } = require('../ban.js');
const CUA = require('../cua.js');
const PANEL = fs.readFileSync(path.join(__dirname, '..', '..', 'BotDoMin', 'panel.js'), 'utf8');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

function dungBan() {
    const DB = { _stxOn: true };
    const VI = {};
    const so = [];
    const ban = taoBan({
        db: () => DB,
        layNguoi: (id) => ({ points: VI[id] || 0, name: id }),
        congVi: (id, t) => { VI[id] = (VI[id] || 0) + t; },
        ghiLog: (d) => so.push(d), luuDb: () => { },
    });
    ban.khoiDong();
    return { ban, DB, VI, so };
}
/**
 * Đưa bàn tới ĐÚNG mốc KHOÁ SỔ (chỗ sinh bảng hệ số nhân).
 * Vòng ván xét: chốt (now ≥ targetTime) -> quay (now ≥ nanTime) -> khoá sổ (now ≥ lockTime).
 * Muốn rơi vào khoá sổ thì phải để now NẰM GIỮA lockTime và nanTime:
 *     targetTime ∈ (now + nan, now + nan + nhan]   -> chọn đúng mút phải.
 */
function toiKhoaSo(ban) {
    const S = ban._S;
    const t = ban.adminXem().time;
    S.status = 'betting';
    S.targetTime = Math.floor(Date.now() / 1000) + t.nan + t.nhan;
    ban.nhip();
    return S;
}

muc('máy bàn có hàm ép + gửi đủ thứ panel cần');
{
    const { ban } = dungBan();
    ok('⭐ có epNhan()', typeof ban.epNhan === 'function');
    ok('⭐ có huyEpNhan()', typeof ban.huyEpNhan === 'function');
    const t = ban.adminXem();
    ok('panel nhận được danh sách 4 cửa để dựng ô nhập',
        Array.isArray(t.cuaDeu) && t.cuaDeu.length === 4, JSON.stringify(t.cuaDeu));
    ok('...đúng TÀI · XỈU · CHẴN · LẺ',
        ['tai', 'xiu', 'chan', 'le'].every(id => t.cuaDeu.some(c => c.id === id)), JSON.stringify(t.cuaDeu));
    ok('...kèm TÊN TIẾNG VIỆT (panel không tự bịa)',
        t.cuaDeu.every(c => c.ten && c.ten !== c.id), JSON.stringify(t.cuaDeu));
    ok('⭐ khoảng ép được là x2 → x14 (đúng lời chủ server)',
        t.epNhanKhoang && t.epNhanKhoang.min === 2 && t.epNhanKhoang.max === 14,
        JSON.stringify(t.epNhanKhoang));
}

muc('✋ ÉP RỒI PHẢI RA ĐÚNG SỐ ĐÓ (chạy thật)');
{
    const { ban, DB } = dungBan();
    const r = ban.epNhan({ tai: 14, xiu: 7, chan: 0, le: 13 });
    ok('nhận lệnh ép', r.ok === true, JSON.stringify(r.error));
    ok('...ghi vào DB để restart không mất', !!DB._stxEpNhan, JSON.stringify(DB._stxEpNhan));
    ok('...báo lại là áp NGAY ván này hay ván sau', typeof r.ngay === 'boolean');

    const S = toiKhoaSo(ban);
    ok('bàn đã qua mốc khoá sổ', S.status === 'nhan', S.status);
    const o = (S.nhan && S.nhan.o) || {};
    ok('⭐⭐ TÀI ra ĐÚNG x14', o.tai === 14, JSON.stringify(o.tai));
    ok('⭐⭐ XỈU ra ĐÚNG x7 — thang không có bậc 7, ép vẫn phải ra', o.xiu === 7, JSON.stringify(o.xiu));
    ok('⭐⭐ LẺ ra ĐÚNG x13 — bậc lẻ cũng ép được', o.le === 13, JSON.stringify(o.le));
    ok('⭐⭐ CHẴN bị TẮT hẳn (ép 0)', o.chan === undefined, JSON.stringify(o.chan));
    ok('⭐ lệnh ép DÙNG MỘT LẦN rồi tự xoá', !DB._stxEpNhan, JSON.stringify(DB._stxEpNhan));
    ok('...và bảng nhân gắn đúng số ván', S.nhan.gameId === S.gameId);
}

muc('💰 hệ số ép phải ĂN VÀO TIỀN THẬT, không chỉ hiện cho đẹp');
{
    // TÀI x14: đặt 10.000 vào TÀI, ra tổng 11-17 -> phải nhận 10.000 × 14
    const { ban, VI } = dungBan();
    VI.A = 1000000;
    // ⚠️ ÉP LUÔN CHẴN = 0. Không ép thì máy vẫn bốc ngẫu nhiên cho CHẴN, có ván nó sáng x2
    // và phép so "ô không sáng ăn 1:1" đỏ oan — đúng cái vừa dính.
    ban.epNhan({ tai: 14, chan: 0 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    const S = toiKhoaSo(ban);
    ok('bảng nhân ván này có TÀI x14', (S.nhan.o || {}).tai === 14, JSON.stringify(S.nhan.o));
    // ⚠️ tinhTra trả `tien + tien * ti` — tức "x14" là ĂN 14 LẦN rồi HOÀN VỐN, nhận về 15 lần.
    // Đừng kỳ vọng 140.000 (mình từng kỳ vọng sai ở đây): bảng trả ghi 14:1 theo lối cược,
    // ăn 14 ăn thêm vốn về.
    const tra = CUA.tinhTra('tai', 10000, [6, 6, 4], S.nhan.o);   // tổng 16 = TÀI
    ok('⭐⭐ lõi tiền trả theo ĐÚNG hệ số ép: ăn 14× + hoàn vốn = 150.000', tra === 150000, String(tra));
    const traTat = CUA.tinhTra('chan', 10000, [6, 6, 4], S.nhan.o);
    ok('...còn ô KHÔNG sáng thì ăn tỉ lệ gốc 1:1 = 20.000 (gồm vốn)', traTat === 20000, String(traTat));
    ok('...chênh nhau đúng 13 lần tiền cược (14 so với 1)', tra - traTat === 130000, String(tra - traTat));
}

muc('🎲 ô KHÔNG bị ép vẫn do máy bốc, không bị đụng vào');
{
    let saiTai = 0, coSangKhac = 0;
    for (let lan = 0; lan < 60; lan++) {
        const { ban } = dungBan();
        ban.epNhan({ tai: 6 });
        const o = (toiKhoaSo(ban).nhan || {}).o || {};
        if (o.tai !== 6) saiTai++;
        if (o.xiu !== undefined || o.chan !== undefined || o.le !== undefined) coSangKhac++;
    }
    ok('⭐ TÀI luôn ra đúng x6 qua 60 ván', saiTai === 0, saiTai + ' ván sai');
    ok('...và 3 ô kia vẫn tự bốc (có ván sáng, có ván không)', coSangKhac > 0,
        'không ván nào 3 ô kia sáng - nghi ép đè cả bảng');
}

muc('🚫 chặn số bậy');
{
    const { ban } = dungBan();
    ok('x1 -> chặn (dưới sàn)', !!ban.epNhan({ tai: 1 }).error);
    ok('x15 -> chặn (trên trần)', !!ban.epNhan({ tai: 15 }).error);
    ok('x999 -> chặn', !!ban.epNhan({ tai: 999 }).error);
    ok('số âm -> chặn', !!ban.epNhan({ tai: -3 }).error);
    ok('câu báo nói rõ khoảng ép được', /x2.*x14/.test(ban.epNhan({ tai: 99 }).error || ''),
        ban.epNhan({ tai: 99 }).error);
    ok('không nhập ô nào -> chặn', !!ban.epNhan({}).error);
    ok('bảng rỗng/sai kiểu -> chặn', !!ban.epNhan(null).error);
    ok('⭐ chặn rồi thì KHÔNG để lại lệnh treo trong DB', (() => {
        const { ban: b2, DB } = dungBan(); b2.epNhan({ tai: 99 }); return !DB._stxEpNhan;
    })());
    ok('0 (tắt ô) thì KHÔNG bị chặn', !ban.epNhan({ tai: 0 }).error);
}

muc('↩️ huỷ ép');
{
    const { ban, DB } = dungBan();
    ban.epNhan({ tai: 14 });
    ok('có lệnh đang chờ', !!DB._stxEpNhan);
    const h = ban.huyEpNhan();
    ok('huỷ được', h.ok === true && h.daHuy === true);
    ok('...DB sạch', !DB._stxEpNhan);
    ok('huỷ khi không có gì -> báo daHuy=false, không nổ', ban.huyEpNhan().daHuy === false);
}

muc('🖥️ bảng RIÊNG trong panel');
{
    ok('⭐ có khối riêng "Ép HỆ SỐ NHÂN"', /Ép HỆ SỐ NHÂN cho 4 cửa/.test(PANEL));
    ok('...nằm trong tab Siêu Tài Xỉu, không lẫn sang bàn thường',
        PANEL.indexOf('Ép HỆ SỐ NHÂN cho 4 cửa') > PANEL.indexOf('id="tab-stx"') &&
        PANEL.indexOf('Ép HỆ SỐ NHÂN cho 4 cửa') < PANEL.indexOf('id="tab-poker"'));
    ok('có khung 4 ô nhập + nút ép + nút huỷ',
        /id="stxNhanO"/.test(PANEL) && /onclick="stxEpNhan\(\)"/.test(PANEL) && /onclick="stxHuyEpNhan\(\)"/.test(PANEL));
    ok('có nút bấm nhanh (x14 / x8 / x2 / tắt hết)', (PANEL.match(/onclick="stxNhanDat\(/g) || []).length >= 4);
    ok('⭐ ô nhập dựng từ danh sách máy bàn gửi, panel KHÔNG tự bịa tên cửa', /S\.cuaDeu/.test(PANEL));
    ok('⭐ trần ô nhập lấy theo khoảng máy bàn gửi', /epNhanKhoang/.test(PANEL));
    ok('nói rõ ép giờ ăn ván NÀY hay ván SAU',
        /ép giờ HIỆN NGAY ván/.test(PANEL) && /ép giờ vào VÁN SAU/.test(PANEL));
    ok('kể lệnh đang chờ áp', /Đang chờ áp:/.test(PANEL));
    ok('⚠️ không vẽ lại ô nhập mỗi nhịp (admin đang gõ sẽ mất chữ)', /STX_NHAN_VE/.test(PANEL));
    ok('hai route bị chặn ở cổng thường', /'\/api\/stx\/epnhan', '\/api\/stx\/epnhanclear'/.test(PANEL));
    ok('hai route có nối vào máy bàn',
        /path === '\/api\/stx\/epnhan'\) r = B\.epNhan/.test(PANEL) &&
        /path === '\/api\/stx\/epnhanclear'\) r = B\.huyEpNhan/.test(PANEL));
}

console.log('\n✋ ÉP HỆ SỐ NHÂN SIÊU TX: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
