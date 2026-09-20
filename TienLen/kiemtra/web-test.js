// Bộ kiểm cho TienLen/web.js — cổng vào, ghế, sẵn sàng, VÍ DOGCOIN, chống lộ bài.
// Gọi thẳng xuLy() với req/res giả (không cần dựng máy chủ HTTP).
// Chạy: node TienLen/kiemtra/web-test.js
'use strict';
const { taoTienLen, taoSanh, VON_HE_SO, MUC_CUOC_CHO_PHEP, TOI_DA_PHONG,
    GIAY_AFK_MAC_DINH, GIAY_DUOI_MAC_DINH } = require('../web.js');
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
        // -1 = "lặng bao lâu cũng tính là quá hạn" -> khỏi phải ngồi đợi 70 giây thật trong bài kiểm
        giayAfk: tuyChon.giayAfk,
        giayDuoi: tuyChon.giayDuoi,
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
// Hệ số vốn KHÁC NHAU theo chế độ: 'anhet' thua tối đa một ván nặng gấp ~10 lần 'hang'
    // (cóng 13 lá ×2 + nhốt 4 đôi thông/tứ quý ×2), để chung 30× là có ngày vỡ ví.
    ok('vốn tối thiểu = hệ số theo chế độ × mức cược', s.vonToiThieu === s.cauHinh.mucCuoc * VON_HE_SO.hang);
    ok('hệ số vốn: hạng 30× · đếm lá 120×', VON_HE_SO.hang === 30 && VON_HE_SO.anhet === 120, JSON.stringify(VON_HE_SO));
    ok('chế độ mặc định: truyền thống 1-2-3-4', s.cauHinh.cheDo === 'hang' && /Truyền thống/.test(s.cheDoTen), s.cheDoTen);
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
    // B KHÔNG kịp đánh lá nào -> CÓNG, mọi khoản của B nhân đôi (luật Ba Bích):
    //   cược bét −1 ×2 = −2.000 · nhốt 1 heo đỏ (1 cược) ×2 = −2.000  ->  B −4.000
    //   A: 1.000 cược + 1.000 phần dôi do B cóng + 2.000 nhốt = 4.000, phế 400 -> +3.600
    ok('B cóng: ví B trừ đúng 4.000', vi.B - truocB === -4000, String(vi.B - truocB));
    ok('ví A cộng đúng 3.600', vi.A - truocA === 3600, String(vi.A - truocA));
    ok('nhà cái thu phế 400', phe() === 400, String(phe()));
    ok('có ghi log ván', log.some(d => /Ván #1/.test(d)), log.join(' | '));

    // gọi nhịp nhiều lần: KHÔNG được trả tiền lần 2
    const aSauVan = vi.A, bSauVan = vi.B;
    for (let i = 0; i < 20; i++) tl.nhip();
    ok('gọi nhịp 20 lần vẫn KHÔNG trả tiền lần 2', vi.A === aSauVan && vi.B === bSauVan, vi.A + '/' + aSauVan);
    ok('phế cũng không thu 2 lần', phe() === 400, String(phe()));
}

muc('💰 chế độ ĐẾM LÁ');
{
    const { tl, vi } = dung();
    // Phòng đếm lá cần vốn 120× mức cược, ví mặc định 100.000 không đủ -> nạp thêm trước.
    for (const id of ['A', 'B', 'C']) vi[id] = 500000;
    goi(tl, '/cauhinh', { cheDo: 'anhet', mucCuoc: 1000 }, 'A');
    ok('admin đổi được chế độ', st(tl, 'A').cauHinh.cheDo === 'anhet');
    ok('KHÔNG còn ô giá lá riêng (mỗi lá = đúng 1 cược)', st(tl, 'A').cauHinh.giaLa === undefined);
    ok('vốn tối thiểu nhảy lên 120× khi đổi sang đếm lá', st(tl, 'A').vonToiThieu === 120000, String(st(tl, 'A').vonToiThieu));
    ok('người thường KHÔNG đổi được', goi(tl, '/cauhinh', { cheDo: 'hang' }, 'B').ma === 403);
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B'); goi(tl, '/ngoi', { ghe: 2 }, 'C');
    for (const id of ['A', 'B', 'C']) goi(tl, '/sansang', {}, id);
    epBai(tl, { A: ['3s'], B: ['4c', '5c'], C: ['6d', '7d', '8d'] }, 'A');
    const t = { A: vi.A, B: vi.B, C: vi.C };
    goi(tl, '/danh', { la: ['3s'] }, 'A');
    // A ra ngay -> B và C chưa đánh lá nào -> CÓNG, mỗi lá tính gấp đôi. KHÔNG có cược nền.
    ok('B cóng, 2 lá × 1.000 × 2 = −4.000', vi.B - t.B === -4000, String(vi.B - t.B));
    ok('C cóng, 3 lá × 1.000 × 2 = −6.000', vi.C - t.C === -6000, String(vi.C - t.C));
    ok('A ăn 10.000, phế 1.000 -> +9.000', vi.A - t.A === 9000, String(vi.A - t.A));
    ok('tổng ví bàn hụt đúng bằng phế', (vi.A - t.A) + (vi.B - t.B) + (vi.C - t.C) === -1000);
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

// ---------------------------------------------------------------- SẢNH nhiều phòng (20/09)
/** Dựng một sảnh với ví giả. */
function dungSanh(vi) {
    const log = [];
    const m = taoSanh({
        layNguoi: (id) => vi[id] === undefined ? null : { name: id, points: vi[id], ingameName: id },
        congVi: (id, t) => { vi[id] += t; }, thuPhe: () => { }, laAdmin: (id) => id === 'A',
        tenCua: (id) => id, ghiLog: (d) => log.push(d), giayXemKet: 0,
    });
    const goiS = (p, b, u) => { let r = null; m.xuLy({ path: p, method: b ? 'POST' : 'GET', body: b || {}, userId: u }, null, (x, c, j) => { r = { ma: c, j }; }); return r; };
    // ⚠️ TẮT TỚI TRẮNG cho MỌI phòng, kể cả phòng tạo sau. Để bật thì thỉnh thoảng (~1/15 lần)
    // chia bài xong là có người tới trắng -> ván CHỐT NGAY, bàn về trạng thái CHỜ, và mấy phép
    // kiểm cần bối cảnh "đang đánh" (vote nằm chờ, đổi phòng bị chặn) đỏ oan.
    const tatToiTrang = () => { for (const p of m.phong) p.may.quanLy.datCauHinh({ toiTrangOn: false }); };
    tatToiTrang();
    const goiT = (p, b, u) => { const r = goiS(p, b, u); tatToiTrang(); return r; };
    return { m, goiS: goiT, log };
}

muc('🏠 SẢNH: tạo phòng / thang mức cược / dọn phòng trống');
{
    const vi = { A: 5000000, B: 5000000, NGHEO: 200000 };
    const { m, goiS } = dungSanh(vi);
    const ds = goiS('/ds', null, 'A').j;
    ok('sảnh dựng sẵn 2 phòng: truyền thống + đếm lá', ds.phong.length === 2 &&
        ds.phong.some(p => p.cheDo === 'hang') && ds.phong.some(p => p.cheDo === 'anhet'), JSON.stringify(ds.phong.map(p => p.ten)));
    ok('phòng dựng sẵn ở bậc THẤP NHẤT để ai cũng vào được',
        ds.phong.find(p => p.cheDo === 'hang').mucCuoc === MUC_CUOC_CHO_PHEP.hang[0] &&
        ds.phong.find(p => p.cheDo === 'anhet').mucCuoc === MUC_CUOC_CHO_PHEP.anhet[0]);
    ok('vốn tối thiểu tính đúng hệ số từng chế độ',
        ds.phong.find(p => p.cheDo === 'hang').vonToiThieu === 10000 * VON_HE_SO.hang &&
        ds.phong.find(p => p.cheDo === 'anhet').vonToiThieu === 1000 * VON_HE_SO.anhet);
    ok('sảnh gửi kèm THANG mức cược cho trang vẽ nút',
        ds.mucChoPhep.hang.join() === MUC_CUOC_CHO_PHEP.hang.join() && ds.mucChoPhep.anhet.join() === MUC_CUOC_CHO_PHEP.anhet.join());

    ok('mức ngoài thang -> chặn', /Mức cược phải chọn trong/.test(goiS('/tao', { cheDo: 'anhet', mucCuoc: 7000 }, 'A').j.error || ''));
    ok('chế độ lạ -> chặn', /Chế độ lạ/.test(goiS('/tao', { cheDo: 'xyz', mucCuoc: 1000 }, 'A').j.error || ''));
    // Không đủ tiền mà tạo phòng -> chặn NGAY, không thì tạo xong bị đá ra, phòng rỗng nằm giữa sảnh
    ok('không đủ vốn -> KHÔNG cho tạo phòng',
        /cần ít nhất/.test(goiS('/tao', { cheDo: 'hang', mucCuoc: 100000 }, 'NGHEO').j.error || ''),
        JSON.stringify(goiS('/tao', { cheDo: 'hang', mucCuoc: 100000 }, 'NGHEO').j));

    const r = goiS('/tao', { cheDo: 'anhet', mucCuoc: 4000 }, 'A');
    ok('tạo phòng hợp lệ -> có mã phòng', !!r.j.vaoPhong, JSON.stringify(r.j.error));
    ok('...và người tạo NGỒI LUÔN, không phải bấm thêm nhát nữa', goiS('/ds', null, 'A').j.dangO === r.j.vaoPhong);
    ok('phòng lạ -> 404 có lời dẫn ra sảnh', goiS('/khongco/state', null, 'A').ma === 404 &&
        /quay ra sảnh/.test(goiS('/khongco/state', null, 'A').j.error));

    let het = null;
    for (let k = 0; k < 20; k++) het = goiS('/tao', { cheDo: 'anhet', mucCuoc: 1000 }, 'B');
    ok('có TRẦN số phòng, không cho tạo tràn sảnh',
        /đủ \d+ phòng/.test(het.j.error || '') || goiS('/ds', null, 'A').j.phong.length <= TOI_DA_PHONG,
        String(goiS('/ds', null, 'A').j.phong.length));
}

muc('🚪 MỖI LÚC CHỈ NGỒI MỘT PHÒNG');
{
    const vi = { A: 5000000, B: 5000000 };
    const { m, goiS } = dungSanh(vi);
    const ds = goiS('/ds', null, 'A').j;
    const p1 = ds.phong[0].ma, p2 = ds.phong[1].ma;
    goiS('/' + p1 + '/ngoi', { ghe: 0 }, 'A');
    ok('ngồi phòng 1', goiS('/ds', null, 'A').j.dangO === p1);
    goiS('/' + p2 + '/ngoi', { ghe: 0 }, 'A');
    ok('ngồi phòng 2 -> tự đứng dậy khỏi phòng 1', goiS('/ds', null, 'A').j.dangO === p2);
    ok('ghế phòng 1 trống lại', m.cua(p1).may.phong.ghe.indexOf('A') < 0, JSON.stringify(m.cua(p1).may.phong.ghe));

    // 🐞 LỖI THẬT 20/09: bản đầu gọi /roi phòng cũ rồi VỨT kết quả đi. Đang giữa ván thì phòng
    // cũ từ chối, người đó VẪN ngồi phòng cũ mà VẪN được ngồi phòng mới -> một ví hai bàn cùng
    // trừ, đúng cái mà luật "mỗi lúc một phòng" sinh ra để chặn.
    goiS('/' + p2 + '/ngoi', { ghe: 1 }, 'B');
    goiS('/' + p2 + '/sansang', {}, 'A'); goiS('/' + p2 + '/sansang', {}, 'B');
    ok('bàn phòng 2 đã vào ván', !!m.cua(p2).may.phong.ban);
    const r = goiS('/' + p1 + '/ngoi', { ghe: 0 }, 'A');
    ok('đang giữa ván mà đòi đổi phòng -> CHẶN', r.ma === 400 && /giữa ván ở phòng khác/.test(r.j.error || ''), JSON.stringify(r.j));
    ok('...và KHÔNG bị ngồi hai phòng cùng lúc',
        m.cua(p1).may.phong.ghe.indexOf('A') < 0 && m.cua(p2).may.phong.ghe.indexOf('A') >= 0,
        JSON.stringify([m.cua(p1).may.phong.ghe, m.cua(p2).may.phong.ghe]));
}

muc('🗳️ VOTE đổi mức cược');
{
    const vi = { A: 5000000, B: 5000000, C: 5000000 };
    const { m, goiS, log } = dungSanh(vi);
    const p = goiS('/tao', { cheDo: 'anhet', mucCuoc: 2000 }, 'A').j.vaoPhong;
    goiS('/' + p + '/ngoi', { ghe: 1 }, 'B');
    goiS('/' + p + '/ngoi', { ghe: 2 }, 'C');
    ok('chưa ngồi thì không vote được', goiS('/' + p + '/vote', { mucCuoc: 5000 }, 'KHACH').ma === 400);
    ok('mức ngoài thang -> chặn', /Mức cược phải nằm trong/.test(goiS('/' + p + '/vote', { mucCuoc: 9999 }, 'A').j.error || ''));
    ok('vote đúng mức đang chơi -> chặn', /đang chơi đúng mức/.test(goiS('/' + p + '/vote', { mucCuoc: 2000 }, 'A').j.error || ''));

    const s1 = goiS('/' + p + '/vote', { mucCuoc: 5000 }, 'A').j;
    ok('mở vote: 1/2 phiếu (3 người -> cần quá nửa = 2)', s1.vote && s1.vote.soDong === 1 && s1.vote.can === 2, JSON.stringify(s1.vote));
    ok('vote nói rõ VỐN TỐI THIỂU MỚI', s1.vote.vonMoi === 5000 * VON_HE_SO.anhet, String(s1.vote.vonMoi));
    ok('bấm lại không cộng thành 2 phiếu', goiS('/' + p + '/vote', { mucCuoc: 5000 }, 'A').j.vote.soDong === 1);
    ok('rút phiếu -> vote tắt', goiS('/' + p + '/huyvote', {}, 'A').j.vote === null);

    goiS('/' + p + '/vote', { mucCuoc: 5000 }, 'A');
    const s2 = goiS('/' + p + '/vote', { mucCuoc: 5000 }, 'B').j;
    ok('đủ quá nửa -> áp NGAY vì đang nghỉ giữa ván', s2.cauHinh.mucCuoc === 5000 && s2.vote === null, JSON.stringify(s2.cauHinh));
    ok('có ghi log đổi cược', log.some(d => /đồng ý đổi mức cược/.test(d)), log.join(' | '));

    // đang ĐÁNH thì giữ lại, chia ván sau mới áp
    goiS('/' + p + '/sansang', {}, 'A'); goiS('/' + p + '/sansang', {}, 'B'); goiS('/' + p + '/sansang', {}, 'C');
    const ban = m.cua(p).may.phong.ban;
    ok('bàn đã vào ván', !!ban);
    goiS('/' + p + '/vote', { mucCuoc: 1000 }, 'A');
    goiS('/' + p + '/vote', { mucCuoc: 1000 }, 'B');
    ok('đang đánh thì CHƯA đổi, vote nằm chờ', m.cua(p).may.phong.cauHinh.mucCuoc === 5000 &&
        !!goiS('/' + p + '/state', null, 'A').j.vote, String(m.cua(p).may.phong.cauHinh.mucCuoc));
    for (let k = 0; k < 400 && ban._trong.van && !ban._trong.van.ketQua; k++) { ban.roiMang(ban._trong.van.luot); ban.nhip(); }
    m.nhip(); m.nhip();
    ok('chia ván kế thì mức cược mới áp dụng', m.cua(p).may.phong.cauHinh.mucCuoc === 1000, String(m.cua(p).may.phong.cauHinh.mucCuoc));
}

muc('💥 CHẶT TRỪ TIỀN TẠI CHỖ (chủ server chốt 20/09)');
{
    const { tl, vi, log } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    // A cầm heo đen + vài lá, B cầm 3 đôi thông để chặt. Bàn 'hang' cược 1.000 -> heo đen 0.5 cược = 500.
    epBai(tl, { A: ['2s', '3d', '4d'], B: ['4s', '4c', '5s', '5c', '6s', '6c', '7d'] }, 'A');
    const t = { A: vi.A, B: vi.B };
    goi(tl, '/danh', { la: ['2s'] }, 'A');
    ok('đánh heo ra: ví chưa ai đổi', vi.A === t.A && vi.B === t.B, (vi.A - t.A) + '/' + (vi.B - t.B));

    const r = goi(tl, '/danh', { la: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'B');
    ok('3 đôi thông chặt được heo đen', r.ma === 200 && r.j.ban.van.chatMoi, JSON.stringify(r.j && r.j.error));
    // ⭐ ĐIỂM CHÍNH: tiền phải nhảy NGAY, ván vẫn đang chạy (chưa có ketQua)
    ok('ván VẪN ĐANG CHẠY (chưa chốt)', !r.j.ban.van.ketQua);
    ok('người chặt ĐƯỢC CỘNG NGAY 500', vi.B - t.B === 500, String(vi.B - t.B));
    ok('người bị chặt BỊ TRỪ NGAY 500', vi.A - t.A === -500, String(vi.A - t.A));
    ok('có ghi sổ ngay lúc chặt', log.some(d => /💥.*chặt.*trả ngay/.test(d)), log.join(' | '));
    ok('máy chủ gửi kèm cú chặt mới nhất cho web nháy hiệu ứng',
        r.j.ban.van.chatMoi.tien === 500 && r.j.ban.van.chatMoi.chatBoi === 'B' && r.j.ban.van.chatMoi.bi === 'A' &&
        typeof r.j.ban.van.chatMoi.luc === 'number', JSON.stringify(r.j.ban.van.chatMoi));

    // gọi nhịp nhiều lần: KHÔNG được trả cú chặt lần 2
    const giua = { A: vi.A, B: vi.B };
    for (let i = 0; i < 15; i++) tl.nhip();
    ok('gọi nhịp nhiều lần KHÔNG trả cú chặt lần 2', vi.A === giua.A && vi.B === giua.B,
        (vi.A - giua.A) + '/' + (vi.B - giua.B));

    // đánh nốt cho hết ván rồi soi tổng: chặt KHÔNG được tính hai lần
    const ban = tl.phong.ban;
    for (let k = 0; k < 400 && ban._trong.van && !ban._trong.van.ketQua; k++) { ban.roiMang(ban._trong.van.luot); ban.nhip(); }
    tl.nhip();
    const kq = ban._trong.van.ketQua;
    ok('ván chốt được', !!kq);
    ok('TỔNG ví khớp đúng kết quả ván (chặt không bị tính hai lần)',
        (vi.A - t.A) === kq.tien.A && (vi.B - t.B) === kq.tien.B,
        JSON.stringify({ viA: vi.A - t.A, kqA: kq.tien.A, viB: vi.B - t.B, kqB: kq.tien.B }));
    ok('bàn vẫn hụt đúng bằng phế', (vi.A - t.A) + (vi.B - t.B) === -kq.pheTong,
        ((vi.A - t.A) + (vi.B - t.B)) + ' vs ' + kq.pheTong);
}
{
    // Người bị chặt không đủ tiền -> kẹp lại đúng số họ có, KHÔNG để ví âm giữa ván
    const { tl, vi, log } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    epBai(tl, { A: ['2h', '3d', '4d'], B: ['4s', '4c', '5s', '5c', '6s', '6c', '7d'] }, 'A');
    goi(tl, '/danh', { la: ['2h'] }, 'A');
    vi.A = 300;                                   // vét ví A, heo đỏ = 1 cược = 1.000
    goi(tl, '/danh', { la: ['4s', '4c', '5s', '5c', '6s', '6c'] }, 'B');
    ok('ví người bị chặt KHÔNG âm', vi.A >= 0, String(vi.A));
    ok('chỉ lấy đúng số họ có', vi.A === 0, String(vi.A));
    ok('có ghi log ⚠️ để chủ server biết', log.some(d => /⚠️.*bị chặt/.test(d)), log.join(' | '));
}

muc('🚪 RỜI BÀN SAU VÁN NÀY');
{
    // Chủ server 20/09: "thêm nút thoát trận, đánh xong thoát luôn thay vì bị mất mạng".
    // Đang cầm bài thì không rời giữa chừng được (bỏ bàn giữa ván là quỵt tiền người khác),
    // nhưng bắt ngồi đực chờ hết ván thì người ta đóng tab -> thành "mất kết nối", máy đánh
    // giùm, thua oan. Nên ghi tên vào sổ, hết ván máy chủ TỰ cho ra.
    const { tl, vi, log } = dung({ giayXemKet: 0 });
    goi(tl, '/ngoi', { ghe: 0 }, 'A'); goi(tl, '/ngoi', { ghe: 1 }, 'B'); goi(tl, '/ngoi', { ghe: 2 }, 'C');
    for (const id of ['A', 'B', 'C']) goi(tl, '/sansang', {}, id);
    ok('bàn đã vào ván', !!tl.phong.ban);

    ok('người ngoài phòng không xin rời được', goi(tl, '/roisau', {}, 'D').ma === 400);
    const r = goi(tl, '/roisau', {}, 'C');
    ok('đang giữa ván: xin rời được nhận (KHÔNG báo lỗi đỏ)', r.ma === 200 && r.j.xinRoi === true,
        r.ma + ' ' + JSON.stringify(r.j && (r.j.error || r.j.xinRoi)));
    ok('...nhưng vẫn CÒN NGỒI cho tới hết ván', tl.phong.ghe.indexOf('C') >= 0, JSON.stringify(tl.phong.ghe));
    ok('bấm lại là huỷ xin rời', goi(tl, '/roisau', {}, 'C').j.xinRoi === false);
    goi(tl, '/roisau', {}, 'C');           // xin lại

    const truocC = vi.C;
    const ban = tl.phong.ban;
    for (let k = 0; k < 500 && ban._trong.van && !ban._trong.van.ketQua; k++) { ban.roiMang(ban._trong.van.luot); ban.nhip(); }
    tl.nhip(); tl.nhip();
    ok('⭐ hết ván là TỰ CHO RA, không phải bấm lại', tl.phong.ghe.indexOf('C') < 0, JSON.stringify(tl.phong.ghe));
    ok('...và ván vừa rồi VẪN tính tiền đầy đủ cho C', vi.C !== truocC, String(vi.C - truocC));
    ok('có ghi sổ', log.some(d => /đã xin rời sau ván/.test(d)), log.join(' | '));
    ok('hai người còn lại vẫn ngồi', tl.phong.ghe.filter(Boolean).length === 2, JSON.stringify(tl.phong.ghe));
}
{
    // Không đang đánh thì cho ra LUÔN, khỏi bắt chờ tới ván sau
    const { tl } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A');
    const r = goi(tl, '/roisau', {}, 'A');
    ok('chưa vào ván: xin rời = rời luôn', r.ma === 200 && tl.phong.ghe.indexOf('A') < 0, JSON.stringify(tl.phong.ghe));
}

// ---------------------------------------------------------------- 📵 ĐUỔI NGƯỜI MẤT KẾT NỐI (20/09)
// Chủ server: "khi người chơi mất kết nối thì vẫn bị treo ở đó có cách nào đá người đó ra ko"
// + "bàn tạo trống thì tự xóa bàn đó đi". Hai cái CHUNG MỘT GỐC: ghế không tự nhả thì phòng
// không bao giờ rỗng, mà phòng không rỗng thì donPhongTrong chẳng có gì để xoá.
muc('📵 đuổi người mất kết nối khỏi ghế');
{
    ok('mốc đuổi DÀI HƠN mốc rớt mạng (chập wifi vài giây không bị đuổi oan)',
        GIAY_DUOI_MAC_DINH > GIAY_AFK_MAC_DINH, GIAY_AFK_MAC_DINH + ' -> ' + GIAY_DUOI_MAC_DINH);
}
{
    // ⭐ CHỖ THỦNG NẶNG NHẤT: PHÒNG CHỜ. ratSoatAfk() cũ có dòng "if (!phong.ban) return;"
    // nên chưa mở bàn là không soi ai hết -> ngồi rồi đóng tab = giữ ghế vĩnh viễn.
    const { tl, log } = dung({ giayDuoi: -1 });
    goi(tl, '/ngoi', { ghe: 0 }, 'A');
    goi(tl, '/ngoi', { ghe: 1 }, 'B');
    ok('hai người đang ngồi phòng chờ', tl.phong.ghe.filter(Boolean).length === 2);
    tl.nhip();
    ok('⭐ PHÒNG CHỜ: đóng tab quá hạn là bị nhả ghế', tl.phong.ghe.filter(Boolean).length === 0,
        JSON.stringify(tl.phong.ghe));
    ok('có ghi sổ rõ lý do', log.some(d => /Đuổi .* mất kết nối/.test(d)), log.join(' | '));
}
{
    // chưa quá hạn thì TUYỆT ĐỐI không được đụng vào ghế
    const { tl } = dung();
    goi(tl, '/ngoi', { ghe: 0 }, 'A');
    for (let k = 0; k < 5; k++) tl.nhip();
    ok('vừa hỏi thăm xong thì KHÔNG bị đuổi', tl.phong.ghe.indexOf('A') === 0, JSON.stringify(tl.phong.ghe));
}
{
    // rớt mạng ngắn (đã quá mốc afk nhưng CHƯA tới mốc đuổi) -> máy đánh giùm, ghế giữ nguyên
    const { tl } = dung({ giayAfk: -1 });          // đuổi vẫn để mặc định 70s
    goi(tl, '/ngoi', { ghe: 0 }, 'A');
    goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B');
    tl.nhip();
    ok('rớt mạng NGẮN: vẫn giữ ghế, chỉ máy đánh giùm', tl.phong.ghe.filter(Boolean).length === 2,
        JSON.stringify(tl.phong.ghe));
    ok('...và /state báo cờ rớt mạng cho cả phòng thấy', st(tl, 'A').ghe[1].rot === true,
        JSON.stringify(st(tl, 'A').ghe[1]));
    ok('...kèm đếm ngược còn mấy giây nữa thì ra ghế', st(tl, 'A').ghe[1].giayDuoi > 0);
}
{
    // ⚠️ ĐANG CẦM BÀI thì KHÔNG được nhấc ra giữa chừng — bỏ ngang là quỵt tiền cả bàn.
    // Phải đánh nốt (máy đánh giùm) rồi hết ván mới cho ra.
    const { tl, vi, log } = dung({ giayDuoi: -1, giayXemKet: 0 });
    goi(tl, '/ngoi', { ghe: 0 }, 'A');
    goi(tl, '/ngoi', { ghe: 1 }, 'B');
    goi(tl, '/ngoi', { ghe: 2 }, 'C');
    goi(tl, '/sansang', {}, 'A'); goi(tl, '/sansang', {}, 'B'); goi(tl, '/sansang', {}, 'C');
    ok('bàn đã mở', !!tl.phong.ban && tl.phong.ban.xemChung().trangThai === 'DANG_CHAY');
    const truoc = vi.C;
    tl.nhip();
    ok('⭐ đang cầm bài: KHÔNG bị nhấc ra giữa ván', tl.phong.ghe.indexOf('C') >= 0, JSON.stringify(tl.phong.ghe));
    ok('...mà được ghi vào sổ xin rời', tl.phong.xinRoi.has('C'));
    ok('...có báo rõ trong sổ', log.some(d => /đánh nốt ván này rồi cho ra ghế/.test(d)), log.join(' | '));
    const ban = tl.phong.ban;
    for (let k = 0; k < 800 && ban._trong.van && !ban._trong.van.ketQua; k++) { ban.roiMang(ban._trong.van.luot); ban.nhip(); }
    tl.nhip(); tl.nhip();
    ok('...hết ván mới nhả ghế', tl.phong.ghe.indexOf('C') < 0, JSON.stringify(tl.phong.ghe));
    ok('...và ván đó VẪN tính tiền đủ cho người bị đuổi', vi.C !== truoc, String(vi.C - truoc));
}

muc('🧹 phòng rỗng thì tự xoá');
{
    // ví phải DƯ SỨC vốn tối thiểu (phòng 'hang' 10.000 cần 30× = 300.000), không thì /tao
    // bị chặn ngay ở cổng vốn và bài kiểm đỏ vì lý do chẳng liên quan.
    const sanh = taoSanh({
        layNguoi: () => ({ name: 'An', points: 10000000, ingameName: 'An' }),
        congVi: () => { }, laAdmin: () => false, tenCua: (id) => id, ghiLog: () => { },
        giayXemKet: 9999, giayDuoi: -1,
    });
    const g = (duong, than, toi) => { let r = null; sanh.xuLy({ path: duong, method: than ? 'POST' : 'GET', body: than || {}, userId: toi }, null, (res, ma, j) => { r = { ma, j }; }); return r; };
    const soNen = sanh.phong.length;
    const tao = g('/tao', { cheDo: 'hang', mucCuoc: 10000 }, 'A');
    ok('tạo được phòng mới', tao.ma === 200 && !!tao.j.vaoPhong, JSON.stringify(tao.j && tao.j.error));
    const ma = tao.j.vaoPhong;
    ok('người tạo được cho ngồi luôn', !!sanh.cua(ma) && sanh.cua(ma).may.phong.ghe.indexOf('A') >= 0);
    // lùi mốc tạo về quá khứ: donPhongTrong chừa 30 giây đầu cho người tạo kịp vào
    sanh.cua(ma).luc = Date.now() - 60000;
    sanh.nhip();
    ok('⭐ người tạo mất kết nối -> bị nhả ghế -> PHÒNG TỰ XOÁ', !sanh.cua(ma), JSON.stringify(sanh.phong.map(p => p.ma)));
    ok('...phòng dựng sẵn thì KHÔNG bị xoá theo (sảnh không được trắng)', sanh.phong.length === soNen,
        sanh.phong.length + ' / ' + soNen);
}
{
    // phòng vừa tạo chưa kịp ai vào thì ĐỪNG xoá ngay, người ta đang bấm dở
    const sanh = taoSanh({
        layNguoi: () => ({ name: 'An', points: 10000000, ingameName: 'An' }),
        congVi: () => { }, laAdmin: () => false, tenCua: (id) => id, ghiLog: () => { }, giayDuoi: -1,
    });
    const soNen = sanh.phong.length;
    let r = null; sanh.xuLy({ path: '/tao', method: 'POST', body: { cheDo: 'hang', mucCuoc: 10000 }, userId: 'A' }, null, (res, ma, j) => { r = { ma, j }; });
    sanh.nhip();
    ok('phòng mới tạo có 30 giây ân hạn, không bị dọn ngay', sanh.phong.length === soNen + 1,
        sanh.phong.length + ' / ' + (soNen + 1));
}

console.log('\n🌐 MÁY CHỦ TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
