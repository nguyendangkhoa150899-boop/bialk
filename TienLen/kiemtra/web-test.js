// Bộ kiểm cho TienLen/web.js — cổng vào, ghế, sẵn sàng, VÍ DOGCOIN, chống lộ bài.
// Gọi thẳng xuLy() với req/res giả (không cần dựng máy chủ HTTP).
// Chạy: node TienLen/kiemtra/web-test.js
'use strict';
const { taoTienLen, VON_HE_SO } = require('../web.js');
const B = require('../bai.js');

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');

/** Dựng một "bot" giả: ví Dogcoin trong RAM + sổ log + sổ phế. */
function dung(tuyChon = {}) {
    const vi = { A: 100000, B: 100000, C: 100000, D: 100000, NGHEO: 500, CHUALK: 100000 };
    const ten = { A: 'An', B: 'Bình', C: 'Cường', D: 'Dũng', NGHEO: 'Nghèo', CHUALK: 'ChuaLK' };
    const log = []; let phe = 0;
    const tl = taoTienLen({
        layNguoi: (id) => vi[id] === undefined ? null : { name: ten[id], points: vi[id], ingameName: id === 'CHUALK' ? '' : ten[id] },
        congVi: (id, t) => { vi[id] = (vi[id] || 0) + t; },
        thuPhe: (t) => { phe += t; },
        laAdmin: (id) => id === 'A',
        tenCua: (id) => ten[id] || id,
        ghiLog: (d) => log.push(d),
        giayXemKet: tuyChon.giayXemKet != null ? tuyChon.giayXemKet : 9999,   // mặc định KHÔNG tự chia ván kế
    });
    // ⚠️ TẮT TỚI TRẮNG cho mọi bài kiểm ở file này. Bật thì thỉnh thoảng (~1/15 lần) chia bài xong
    // là có người tới trắng -> ván CHỐT NGAY trong moBan(), mọi bài kiểm phía sau mất bối cảnh
    // "ván đang đánh" và đỏ oan. Luật tới trắng đã có bộ kiểm riêng ở van-test.
    if (tuyChon.toiTrangOn !== true) tl.quanLy.datCauHinh({ toiTrangOn: false });
    return { tl, vi, log, phe: () => phe, ten };
}
/** Gọi API như webplay.js gọi: trả { ma, j }. */
function goi(tl, duong, than, toi) {
    let ra = null;
    tl.xuLy({ path: duong, method: than ? 'POST' : 'GET', body: than || {}, userId: toi },
        null, (res, ma, j) => { ra = { ma, j }; });
    return ra;
}
const st = (tl, id) => goi(tl, '/state', null, id).j;
/** Dựng tay bài + lượt cho chắc ăn (đụng thẳng vào máy ván). */
function epBai(tl, tay, luot) {
    const v = tl.phong.ban._trong.van;
    for (const id of Object.keys(tay)) v.tay[id] = tay[id].slice();
    v.bo = null; v.boCua = null; v.daBo.clear(); v.veNhat = []; v.batBuoc3Bich = false;
    if (luot) v.luot = luot;
    return v;
}

// ---------------------------------------------------------------- cổng vào
muc('cổng vào bàn');
{
    // toiTrangOn: true = KHÔNG đụng vào cấu hình mặc định (xem dung()), vì đoạn này soi đúng mặc định
    const { tl } = dung({ toiTrangOn: true });
    const s = st(tl, 'A');
    ok('người thường vào xem được', s.ok === true && s.ban === null);
    ok('vốn tối thiểu = 30 × mức cược', s.vonToiThieu === s.cauHinh.mucCuoc * VON_HE_SO && VON_HE_SO === 30);
    ok('chế độ mặc định: nhất nhì ba tư', s.cauHinh.cheDo === 'hang' && /Nhất nhì/.test(s.cheDoTen));
    ok('4 luật nâng cao bật sẵn', s.cauHinh.toiTrangOn && s.cauHinh.chatHeoOn && s.cauHinh.thoiHeoOn && s.cauHinh.baBichOn);

    const r1 = goi(tl, '/ngoi', { ghe: 0 }, 'CHUALK');
    ok('chưa liên kết nhân vật -> chặn', r1.ma === 400 && /liên kết/.test(r1.j.error), r1.j.error);
    const r2 = goi(tl, '/ngoi', { ghe: 0 }, 'NGHEO');
    ok('không đủ vốn -> chặn, câu báo nói rõ cần bao nhiêu', r2.ma === 400 && /30.000/.test(r2.j.error), r2.j.error);
    ok('người không có ví -> chặn', goi(tl, '/ngoi', { ghe: 0 }, 'LA').ma === 400);
}

// ---------------------------------------------------------------- ghế + sẵn sàng
muc('ngồi ghế + ✅ sẵn sàng tự mở bàn (không cần admin)');
{
    const { tl } = dung();
    ok('chưa ngồi mà bấm sẵn sàng -> chặn', goi(tl, '/sansang', {}, 'A').ma === 400);
    goi(tl, '/ngoi', { ghe: 0 }, 'A');
    const r = goi(tl, '/ngoi', { ghe: 0 }, 'B');
    ok('ghế có người -> chặn', r.ma === 400 && /có người/.test(r.j.error));
    goi(tl, '/ngoi', { ghe: 2 }, 'B');
    const s = st(tl, 'A');
    ok('2 người ngồi đúng ghế 0 và 2', s.ghe[0].id === 'A' && s.ghe[2].id === 'B' && s.ghe[1] === null);
    ok('ghế hiện luôn số dư để cả bàn biết ai còn bao nhiêu', s.ghe[0].dogcoin === 100000);
    const r1 = goi(tl, '/sansang', {}, 'A');
    ok('A sẵn sàng 1/2, chưa mở bàn', r1.j.toiSanSang === true && r1.j.ban === null);
    ok('bấm lại = huỷ', goi(tl, '/sansang', {}, 'A').j.toiSanSang === false);
    goi(tl, '/sansang', {}, 'A');
    const r2 = goi(tl, '/sansang', {}, 'B');
    ok('B sẵn sàng nốt -> BÀN MỞ NGAY trong cùng phản hồi', r2.j.ban && r2.j.ban.trangThai === 'DANG_CHAY', JSON.stringify(r2.j.ban && r2.j.ban.trangThai));
    ok('mở xong xoá dấu sẵn sàng', r2.j.sanSang.length === 0);
    ok('chia đủ 13 lá cho mình', r2.j.ban.toi.la.length === 13);
    ok('đang đánh thì không ai ngồi thêm', goi(tl, '/ngoi', { ghe: 1 }, 'C').ma === 400);
    ok('đang giữa ván không rời được', goi(tl, '/roi', {}, 'A').ma === 400);
}

// ---------------------------------------------------------------- chống lộ bài
muc('🔒 CHỐNG LỘ BÀI — soi từng lá trong JSON trả về');
{
    const { tl } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/ngoi', { ghe: 2 }, 'C'); goi(tl, '/ngoi', { ghe: 3 }, 'D');
    for (const id of ['A', 'B', 'C', 'D']) goi(tl, '/sansang', {}, id);
    const v = tl.phong.ban._trong.van;
    ok('ván đang ĐÁNH (chưa chốt) — đúng bối cảnh cần soi', !v.ketQua);
    let lo = [];
    for (const id of ['A', 'B', 'C', 'D']) {
        const tho = JSON.stringify(st(tl, id));
        const cuaToi = new Set(v.tay[id]);
        for (const khac of ['A', 'B', 'C', 'D']) {
            if (khac === id) continue;
            for (const la of v.tay[khac]) {
                if (cuaToi.has(la)) continue;
                if (tho.includes('"' + la + '"')) lo.push(id + ' thấy ' + la + ' của ' + khac);
            }
        }
    }
    ok('KHÔNG ai thấy lá của người khác', lo.length === 0, lo.slice(0, 3).join(' | '));
    // 19/09: giấu cả SỐ LÁ. A chỉ biết số lá của chính A; người khác chỉ biết "còn bài".
    const sA = st(tl, 'A').ban;
    ok('KHÔNG ai thấy SỐ LÁ của người khác', sA.nguoi.filter(p => p.id !== 'A').every(p => p.soLa === undefined && p.conBai === true),
        JSON.stringify(sA.nguoi.map(p => [p.id, p.soLa, p.conBai])));
    ok('...nhưng thấy số lá của CHÍNH MÌNH', sA.nguoi.find(p => p.id === 'A').soLa === 13);
    ok('JSON gửi cho A chỉ chứa đúng MỘT chữ "soLa"', (JSON.stringify(sA).match(/"soLa"/g) || []).length === 1,
        String((JSON.stringify(sA).match(/"soLa"/g) || []).length));
    const khach = st(tl, 'NGHEO');
    ok('khán giả nhận bản chung, không có bài của ai', !khach.ban.toi && !JSON.stringify(khach.ban.nguoi).includes('"la"'));

    // Ngược lại: HẾT ván thì lật bài cả bàn là ĐÚNG (showdown). Chốt lại để sau này ai siết
    // chống lộ bài không lỡ tay bịt luôn màn lật bài cuối ván.
    v.tay.A = ['3s']; v.tay.B = ['4c']; v.tay.C = ['5d']; v.tay.D = ['6h'];
    v.bo = null; v.boCua = null; v.daBo.clear(); v.veNhat = []; v.batBuoc3Bich = false; v.luot = 'A';
    goi(tl, '/danh', { la: ['3s'] }, 'A'); goi(tl, '/danh', { la: ['4c'] }, 'B'); goi(tl, '/danh', { la: ['5d'] }, 'C');
    const sauVan = st(tl, 'A');
    ok('hết ván thì lật bài cả bàn (cố ý)', sauVan.ban.van.ketQua && sauVan.ban.van.ketQua.lat.length === 4,
        JSON.stringify(sauVan.ban.van.ketQua && sauVan.ban.van.ketQua.lat));
}

// ---------------------------------------------------------------- đánh bài + VÍ
muc('💰 đánh bài và TIỀN vào ví (chế độ nhất nhì ba tư)');
{
    const { tl, vi, log, phe } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    epBai(tl, { A: ['3s'], B: ['4c', '2h'] }, 'A');
    const truocA = vi.A, truocB = vi.B;

    ok('chưa tới lượt -> chặn', goi(tl, '/danh', { la: ['4c'] }, 'B').ma === 400);
    ok('đánh lá không có -> chặn', goi(tl, '/danh', { la: ['9h'] }, 'A').ma === 400);
    const r = goi(tl, '/danh', { la: ['3s'] }, 'A');
    ok('A đánh hết bài -> ván chốt luôn (2 người)', r.ma === 200 && r.j.ban.van.ketQua, JSON.stringify(r.j.ban && r.j.ban.trangThai));
    // A nhất: +1.000 cược, B thối 1 heo đỏ = +2.000 -> 3.000, phế 300 -> +2.700
    ok('ví A cộng đúng 2.700 (1.000 cược + 2.000 thối heo đỏ − 10% phế)', vi.A - truocA === 2700, String(vi.A - truocA));
    ok('ví B trừ đúng 3.000', vi.B - truocB === -3000, String(vi.B - truocB));
    ok('nhà cái thu phế 300', phe() === 300, String(phe()));
    ok('có ghi log ván', log.some(d => /Ván #1/.test(d)), log.join(' | '));

    // gọi nhịp nhiều lần: KHÔNG được trả tiền lần 2
    const aSauVan = vi.A, bSauVan = vi.B;
    for (let i = 0; i < 20; i++) tl.nhip();
    ok('gọi nhịp 20 lần vẫn KHÔNG trả tiền lần 2', vi.A === aSauVan && vi.B === bSauVan, vi.A + '/' + aSauVan);
    ok('phế cũng không thu 2 lần', phe() === 300, String(phe()));
}

muc('💰 chế độ nhất ăn hết + đếm lá');
{
    const { tl, vi } = dung();
    goi(tl, '/cauhinh', { cheDo: 'anhet', mucCuoc: 1000, giaLa: 500 }, 'A');
    ok('admin đổi được chế độ + đơn giá lá', st(tl, 'A').cauHinh.cheDo === 'anhet' && st(tl, 'A').cauHinh.giaLa === 500);
    ok('người thường KHÔNG đổi được', goi(tl, '/cauhinh', { cheDo: 'hang' }, 'B').ma === 403);
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B'); goi(tl, '/ngoi', { ghe: 2 }, 'C');
    for (const id of ['A', 'B', 'C']) goi(tl, '/sansang', {}, id);
    epBai(tl, { A: ['3s'], B: ['4c', '5c'], C: ['6d', '7d', '8d'] }, 'A');
    const t = { A: vi.A, B: vi.B, C: vi.C };
    goi(tl, '/danh', { la: ['3s'] }, 'A');
    // B: -1.000 -2×500 = -2.000 · C: -1.000 -3×500 = -2.500 · A: +4.500 - 450 phế = +4.050
    ok('B mất 2.000 (cược + 2 lá × 500)', vi.B - t.B === -2000, String(vi.B - t.B));
    ok('C mất 2.500 (cược + 3 lá × 500)', vi.C - t.C === -2500, String(vi.C - t.C));
    ok('A ăn 4.500, phế 450 -> +4.050', vi.A - t.A === 4050, String(vi.A - t.A));
    ok('tổng ví bàn hụt đúng bằng phế', (vi.A - t.A) + (vi.B - t.B) + (vi.C - t.C) === -450);
}

// ---------------------------------------------------------------- bàn chạy liên tục
muc('bàn chạy liên tục: xem kết quả xong tự chia ván kế');
{
    const { tl, vi } = dung({ giayXemKet: 0 });
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    epBai(tl, { A: ['3s'], B: ['4c'] }, 'A');
    goi(tl, '/danh', { la: ['3s'] }, 'A');
    const van1 = tl.phong.ban.xemChung().soVan;
    tl.nhip(); tl.nhip();
    const s = st(tl, 'A');
    ok('tự chia ván mới, số ván tăng', s.ban.soVan === van1 + 1 && s.ban.trangThai === 'DANG_CHAY', s.ban.soVan + ' vs ' + van1);
    ok('ván mới chia lại đủ 13 lá', s.ban.toi.la.length === 13);
    ok('người về nhất ván trước đi đầu ván sau', s.ban.van.luot === 'A', s.ban.van.luot);
    ok('tổng ăn/thua tại bàn được cộng dồn', s.ban.nguoi.find(p => p.id === 'A').tong > 0);
}

muc('hết vốn thì bị mời khỏi bàn trước ván kế');
{
    const { tl, vi, log } = dung({ giayXemKet: 0 });
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    epBai(tl, { A: ['3s'], B: ['4c'] }, 'A');
    vi.B = 5000;                                  // B tụt dưới vốn tối thiểu 30.000
    goi(tl, '/danh', { la: ['3s'] }, 'A');
    tl.nhip(); tl.nhip();
    const s = st(tl, 'A');
    ok('B bị mời ra, ghế trống lại', s.ghe[1] === null, JSON.stringify(s.ghe[1]));
    ok('còn 1 người -> bàn đóng, về phòng chờ', s.ban === null);
    ok('có ghi log lý do mời ra', log.some(d => /Mời .* rời bàn/.test(d)), log.slice(-2).join(' | '));
}

// ---------------------------------------------------------------- lưới an toàn
muc('🛡️ lưới an toàn: không bao giờ để ví âm');
{
    const { tl, vi, log } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    epBai(tl, { A: ['3s'], B: ['4c', '2h', '2d'] }, 'A');
    vi.B = 1000;                                   // ép ví B cạn NGAY TRƯỚC lúc chốt (đáng lẽ không xảy ra)
    goi(tl, '/danh', { la: ['3s'] }, 'A');
    ok('ví B không âm', vi.B >= 0, String(vi.B));
    ok('B chỉ mất đúng số đang có', vi.B === 0, String(vi.B));
    ok('có cảnh báo trong log để chủ server biết', log.some(d => /⚠️/.test(d)), log.filter(d => /⚠️/.test(d)).join(' | '));
}

// ---------------------------------------------------------------- linh tinh
muc('đường lạ + giải tán');
{
    const { tl } = dung();
    ok('đường không có -> 400/404, không nổ', [400, 404].includes(goi(tl, '/bay-ba', {}, 'A').ma));
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    const r = goi(tl, '/giaitan', {}, 'A');
    ok('admin giải tán -> bàn trống sạch', r.ma === 200 && r.j.ban === null && r.j.ghe.every(x => x === null));
    ok('người thường không giải tán được', goi(tl, '/giaitan', {}, 'B').ma === 403);
    ok('panel đọc được tóm tắt', typeof tl.quanLy.tomTat().soNgoi === 'number');
}

console.log('\n🌐 MÁY CHỦ TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
