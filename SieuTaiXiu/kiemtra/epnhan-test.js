// ============================================================================
//  Bộ kiểm ✋ ÉP HỆ SỐ NHÂN, chạy: node SieuTaiXiu/kiemtra/epnhan-test.js  (không cần bot)
//
//  Chủ server 22/09: "giúp mình can thiệp được hệ số nhân của siêu tài xỉu, can thiệp được
//  x tài xỉu + chẵn lẻ" → "1 bảng nằm riêng để ép hệ số nhân TỪ 2 ĐẾN 14 cho tài xỉu chẵn lẻ,
//  khi bấm thì trong 4 giây số nhân sẽ có nó".
//
//  Chạy MÁY BÀN THẬT với đồng hồ tự lái, ép rồi soi bảng nhân của ván, không đọc chữ suông.
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
    ok('⭐⭐ XỈU ra ĐÚNG x7, thang không có bậc 7, ép vẫn phải ra', o.xiu === 7, JSON.stringify(o.xiu));
    ok('⭐⭐ LẺ ra ĐÚNG x13, bậc lẻ cũng ép được', o.le === 13, JSON.stringify(o.le));
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
    // và phép so "ô không sáng ăn 1:1" đỏ oan, đúng cái vừa dính.
    ban.epNhan({ tai: 14, chan: 0 });
    ban.dat('A', 'A', [{ choice: 'tai', amount: 10000 }]);
    const S = toiKhoaSo(ban);
    ok('bảng nhân ván này có TÀI x14', (S.nhan.o || {}).tai === 14, JSON.stringify(S.nhan.o));
    // ⚠️ tinhTra trả `tien + tien * ti`, tức "x14" là ĂN 14 LẦN rồi HOÀN VỐN, nhận về 15 lần.
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

// ---------------------------------------------------------------- 🌪️ 3 CON GIỐNG NHAU (22/09)
// Chủ server: "can thiệp luôn hệ số nhân của 3 con giống nhau nữa". 7 ô bão, mỗi ô khoảng riêng.
muc('🌪️ BÃO cũng ép được, khoảng riêng từng ô');
{
    const { ban } = dungBan();
    const t = ban.adminXem();
    ok('máy bàn gửi đủ 11 ô ép được (4 đều + 7 bão)', Array.isArray(t.cuaEp) && t.cuaEp.length === 11,
        JSON.stringify((t.cuaEp || []).map(c => c.id)));
    const kh = Object.fromEntries((t.cuaEp || []).map(c => [c.id, c]));
    ok('...mỗi ô có min/max/nhóm/tên', (t.cuaEp || []).every(c => c.min > 0 && c.max >= c.min && c.nhom && c.ten));
    ok('⭐ TÀI vẫn x2 → x14 (không đổi lời hứa cũ)', kh.tai && kh.tai.min === 2 && kh.tai.max === 14 && kh.tai.nhom === 'deu', JSON.stringify(kh.tai));
    ok('⭐ Bão bất kỳ: x31 → x499 (gốc 30:1, thang tới 499)', kh.baoany && kh.baoany.min === 31 && kh.baoany.max === 499 && kh.baoany.nhom === 'bao', JSON.stringify(kh.baoany));
    ok('⭐ Bão 1..6: x151 → x1999 (gốc 150:1, thang tới 1999)',
        [1, 2, 3, 4, 5, 6].every(n => kh['bao' + n] && kh['bao' + n].min === 151 && kh['bao' + n].max === 1999 && kh['bao' + n].nhom === 'bao'),
        JSON.stringify(kh.bao1));
    ok('...trần đọc từ THANG ĐANG CHẠY (nâng thang là trần tự nới)',
        kh.bao1.max === Math.max(...CUA.thangHienTai().bao.map(b => b[0])) &&
        kh.baoany.max === Math.max(...CUA.thangHienTai().baoAny.map(b => b[0])));
}
{
    const { ban, DB } = dungBan();
    const r = ban.epNhan({ baoany: 499, bao3: 1999, bao5: 0, tai: 14 });
    ok('nhận lệnh ép trộn bão + đều', r.ok === true, JSON.stringify(r.error));
    const S = toiKhoaSo(ban);
    const o = (S.nhan && S.nhan.o) || {};
    ok('⭐⭐ Bão bất kỳ ra ĐÚNG x499', o.baoany === 499, JSON.stringify(o.baoany));
    ok('⭐⭐ Bão 3 ra ĐÚNG x1999', o.bao3 === 1999, JSON.stringify(o.bao3));
    ok('⭐⭐ Bão 5 bị TẮT hẳn', o.bao5 === undefined, JSON.stringify(o.bao5));
    ok('...TÀI vẫn x14 cùng lúc', o.tai === 14);
    ok('lệnh dùng một lần rồi xoá', !DB._stxEpNhan);
    // tiền thật: ra 3-3-3, cược 1.000 vào Bão 3 -> ăn 1999× + vốn; Bão bất kỳ -> 499× + vốn
    ok('⭐⭐ ra 3-3-3: Bão 3 trả 1.000 + 1.000×1999 = 2.000.000', CUA.tinhTra('bao3', 1000, [3, 3, 3], o) === 2000000,
        String(CUA.tinhTra('bao3', 1000, [3, 3, 3], o)));
    ok('...Bão bất kỳ trả 1.000 + 1.000×499 = 500.000', CUA.tinhTra('baoany', 1000, [3, 3, 3], o) === 500000,
        String(CUA.tinhTra('baoany', 1000, [3, 3, 3], o)));
    ok('...Bão 5 (đã tắt) ra 5-5-5 vẫn ăn GỐC 150:1 = 151.000, không nhân', CUA.tinhTra('bao5', 1000, [5, 5, 5], o) === 151000,
        String(CUA.tinhTra('bao5', 1000, [5, 5, 5], o)));
}
{
    const { ban } = dungBan();
    ok('Bão 1 x150 (= gốc) -> chặn: ép dưới/bằng gốc là vô nghĩa', !!ban.epNhan({ bao1: 150 }).error);
    ok('Bão 1 x151 -> nhận (sàn)', !ban.epNhan({ bao1: 151 }).error);
    ok('Bão 1 x2000 -> chặn (trên thang)', !!ban.epNhan({ bao1: 2000 }).error);
    ok('Bão bất kỳ x30 (= gốc) -> chặn', !!ban.epNhan({ baoany: 30 }).error);
    ok('Bão bất kỳ x499 -> nhận (trần)', !ban.epNhan({ baoany: 499 }).error);
    ok('câu báo nói đúng khoảng CỦA Ô ĐÓ', /x151.*x1999/.test(ban.epNhan({ bao1: 5 }).error || ''), ban.epNhan({ bao1: 5 }).error);
    ok('TÀI x20 vẫn bị chặn theo khoảng riêng của nó (x2–x14), không lây trần bão', !!ban.epNhan({ tai: 20 }).error);
}

muc('🖥️ bảng RIÊNG trong panel');
{
    // ⚠️ KHÔNG ghim nguyên văn chữ hoa/thường: 24/09 bản "điều chỉnh UI UX admin portal" đổi
    // <label>✋ Ép HỆ SỐ NHÂN, …</label> thành <h3>✋ Ép hệ số nhân, …</h3> và 2 phép này đỏ oan.
    // Thứ cần giữ là: khối CÓ TỒN TẠI, nhãn kể cả 4 cửa đều lẫn bão, và nằm trong tab Siêu.
    const iNhan = PANEL.search(/✋ Ép hệ số nhân/i);
    ok('⭐ có khối riêng "Ép hệ số nhân" (nhãn kể cả 4 cửa đều + BÃO)',
        iNhan >= 0 && /✋ Ép hệ số nhân[^<]*Bão/i.test(PANEL), PANEL.slice(iNhan, iNhan + 80));
    ok('...nằm trong tab Siêu Tài Xỉu, không lẫn sang bàn thường',
        iNhan > PANEL.indexOf('id="tab-stx"') && iNhan < PANEL.indexOf('id="tab-poker"'));
    ok('có khung 4 ô nhập + nút ép + nút huỷ',
        /id="stxNhanO"/.test(PANEL) && /onclick="stxEpNhan\(\)"/.test(PANEL) && /onclick="stxHuyEpNhan\(\)"/.test(PANEL));
    ok('có nút bấm nhanh (x14 / x8 / x2 / tắt hết)', (PANEL.match(/onclick="stxNhanDat\(/g) || []).length >= 4);
    ok('🌪️ có nút nhanh riêng cho hàng bão (tối đa / tắt hết)', /stxNhanDatBao\('max'\)/.test(PANEL) && /stxNhanDatBao\(0\)/.test(PANEL));
    ok('⭐ ô nhập dựng từ danh sách máy bàn gửi (cuaEp, dự phòng cuaDeu), panel KHÔNG tự bịa',
        /function stxDsEp\(/.test(PANEL) && /s\.cuaEp/.test(PANEL) && /s\.cuaDeu/.test(PANEL));
    ok('⭐ trần + placeholder từng ô lấy theo khoảng RIÊNG máy bàn gửi',
        /max="'\+c\.max\+'"/.test(PANEL) && /placeholder="x'\+c\.min\+'–x'\+c\.max\+'"/.test(PANEL));
    ok('vẽ thành 2 hàng: đều tiền + bão', /hang\('deu'/.test(PANEL) && /hang\('bao'/.test(PANEL) && /3 con giống nhau/.test(PANEL));
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
