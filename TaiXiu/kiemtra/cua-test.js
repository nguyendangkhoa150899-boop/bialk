// Bộ kiểm lõi tiền Tài Xỉu — chạy: node TaiXiu/kiemtra/cua-test.js
//
// Không tin công thức suông: quay THẬT hàng triệu ván rồi đếm tiền vào/ra, đối
// chiếu với RTP mục tiêu. Sai ở file này là sai tiền thật của người chơi.
'use strict';
const C = require('../cua.js');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');
const pc = (x) => (x * 100).toFixed(2) + '%';

// ---------------------------------------------------------------- bàn cược
muc('bàn cược');
ok('đúng 52 cửa', C.DS.length === 52, String(C.DS.length));
ok('không id nào trùng', new Set(C.DS.map(c => c.id)).size === 52);
ok('4 cửa đều tiền KHÔNG được nhân (RTP gốc đã 97,2%)',
    ['xiu', 'tai', 'chan', 'le'].every(id => C.THEO_ID[id].q === 0));
ok('48 cửa còn lại đều có nhân', C.DS.filter(c => c.q > 0).length === 48, String(C.DS.filter(c => c.q > 0).length));
ok('đủ 14 cửa tổng điểm 4-17', C.DS.filter(c => /^tong\d+$/.test(c.id)).length === 14);
ok('đủ 6 đôi + 6 bão + 1 bão bất kỳ',
    C.DS.filter(c => /^doi\d$/.test(c.id)).length === 6 &&
    C.DS.filter(c => /^bao\d$/.test(c.id)).length === 6 && !!C.THEO_ID.baoany);
ok('đủ 15 cửa kết hợp 2 lá', C.DS.filter(c => /^cap\d\d$/.test(c.id)).length === 15);
ok('đủ 6 cửa số đơn', C.DS.filter(c => /^don\d$/.test(c.id)).length === 6);

// ---------------------------------------------------------------- luật thắng thua
muc('luật thắng thua (đối chiếu tay)');
const tra = (id, xx) => C.THEO_ID[id].tra(xx);
ok('tổng 10 -> XỈU thắng, TÀI thua', tra('xiu', [3, 3, 4]) === 1 && tra('tai', [3, 3, 4]) === 0);
ok('tổng 11 -> TÀI thắng, XỈU thua', tra('tai', [3, 4, 4]) === 1 && tra('xiu', [3, 4, 4]) === 0);
ok('BÃO thì Tài/Xỉu/Chẵn/Lẻ THUA SẠCH (luật sòng)',
    ['xiu', 'tai', 'chan', 'le'].every(id => tra(id, [5, 5, 5]) === 0));
ok('bão 5 -> cửa Bão 5 ăn 150, bão bất kỳ ăn 30',
    tra('bao5', [5, 5, 5]) === 150 && tra('baoany', [5, 5, 5]) === 30);
ok('bão 5 -> cửa Bão 4 KHÔNG ăn', tra('bao4', [5, 5, 5]) === 0);
ok('bão 5 cũng tính là Đôi 5', tra('doi5', [5, 5, 5]) === 8);
ok('đôi 2 (2-2-6) ăn, đôi 6 không ăn', tra('doi2', [2, 2, 6]) === 8 && tra('doi6', [2, 2, 6]) === 0);
ok('cặp 2-6 ăn khi có cả 2 và 6', tra('cap26', [2, 2, 6]) === 5);
ok('cặp 3-4 không ăn khi thiếu một mặt', tra('cap34', [3, 3, 5]) === 0);
ok('số đơn trả theo SỐ MẶT trúng: 1 / 2 / 3',
    tra('don2', [2, 5, 6]) === 1 && tra('don2', [2, 2, 6]) === 2 && tra('don2', [2, 2, 2]) === 3);
ok('tổng 4 chỉ ăn khi đúng tổng 4', tra('tong4', [1, 1, 2]) === 50 && tra('tong4', [1, 1, 3]) === 0);

// ---------------------------------------------------------------- xác suất
muc('xác suất (đếm thật trên 216 kết quả)');
const xs = (id) => C.THEO_ID[id].p;
ok('Tài = Xỉu = 105/216', Math.abs(xs('tai') - 105 / 216) < 1e-9 && Math.abs(xs('xiu') - 105 / 216) < 1e-9);
ok('bão từng số = 1/216', Math.abs(xs('bao1') - 1 / 216) < 1e-9);
ok('bão bất kỳ = 6/216', Math.abs(xs('baoany') - 6 / 216) < 1e-9);
ok('tổng 4 = 3/216', Math.abs(xs('tong4') - 3 / 216) < 1e-9);
ok('tổng 10 = 27/216', Math.abs(xs('tong10') - 27 / 216) < 1e-9);
ok('cặp 2 lá = 30/216', Math.abs(xs('cap12') - 30 / 216) < 1e-9);
// Bàn Sic Bo CỐ TÌNH không có ô tổng 3 và tổng 18 — hai kết quả đó chỉ ra được khi
// bão 1 (1-1-1) và bão 6 (6-6-6), đã có cửa Bão lo. Nên 14 ô tổng cộng lại là 214/216.
ok('tổng 4..17 cộng lại = 214/216 (thiếu đúng tổng 3 và 18)',
    Math.abs(C.DS.filter(c => /^tong\d+$/.test(c.id)).reduce((s, c) => s + c.p, 0) - 214 / 216) < 1e-9);
ok('2 phần thiếu đúng là bão 1 và bão 6',
    Math.abs(C.THEO_ID.bao1.p + C.THEO_ID.bao6.p - 2 / 216) < 1e-9);

// ---------------------------------------------------------------- tính tiền
muc('tính tiền (đã gồm vốn)');
ok('thua thì về 0', C.tinhTra('tai', 1000, [2, 2, 3], {}) === 0);
ok('Tài thắng 1:1 -> đặt 1.000 về 2.000', C.tinhTra('tai', 1000, [5, 5, 6], {}) === 2000);
ok('Bão 3 trúng, KHÔNG nhân -> 1.000 về 151.000', C.tinhTra('bao3', 1000, [3, 3, 3], {}) === 151000);
ok('Bão 3 trúng, nhân 999 -> 1.000 về 1.000.000', C.tinhTra('bao3', 1000, [3, 3, 3], { bao3: 999 }) === 1000000);
ok('nhân THAY tỉ lệ gốc chứ không cộng thêm', C.tinhTra('tong4', 100, [1, 1, 2], { tong4: 499 }) === 100 + 49900);
ok('nhân của cửa khác không ăn lây', C.tinhTra('tong4', 100, [1, 1, 2], { tong5: 249 }) === 100 + 5000);
ok('đơn 1 mặt LUÔN trả 1:1 dù ô đang sáng', C.tinhTra('don2', 1000, [2, 5, 6], { don2: 19 }) === 2000);
ok('đơn 2 mặt mới ăn nhân', C.tinhTra('don2', 1000, [2, 2, 6], { don2: 19 }) === 1000 + 19000);
ok('đơn 3 mặt ăn mức bão 87', C.tinhTra('don2', 1000, [2, 2, 2], { don2: 19 }) === 1000 + 87000);
{
    let loi = false;
    try { C.tinhTra('khong_co_cua_nay', 100, [1, 2, 3], {}); } catch (e) { loi = true; }
    ok('cửa lạ thì báo lỗi, không âm thầm trả 0', loi);
}

// ---------------------------------------------------------------- trần cược
muc('trần cược (nhóm, admin set 1 ô cả nhóm nhảy theo)');
ok('5 nhóm trần', Object.keys(C.NHOM_TRAN).length === 5);
ok('mặc định lấy đúng bảng sòng thật',
    JSON.stringify(C.tranMacDinh()) === JSON.stringify({ deu: 200000, vua: 50000, cao: 20000, hiem: 10000, cuchiem: 5000 }),
    JSON.stringify(C.tranMacDinh()));
ok('Tài/Xỉu/Chẵn/Lẻ chung nhóm 200.000',
    ['tai', 'xiu', 'chan', 'le'].every(id => C.tranCua(id, null) === 200000));
ok('Bão từng số + Tổng 4/17 chung nhóm 5.000 (chủ server chỉ đúng chỗ này)',
    [C.tranCua('bao1', null), C.tranCua('tong4', null), C.tranCua('tong17', null)].every(v => v === 5000));
ok('Tổng 5/16 riêng nhóm 10.000', C.tranCua('tong5', null) === 10000 && C.tranCua('tong16', null) === 10000);
ok('admin đổi 1 nhóm thì cả nhóm đổi theo',
    C.tranCua('tong4', { cuchiem: 8000 }) === 8000 && C.tranCua('bao1', { cuchiem: 8000 }) === 8000);
{
    // thắng tối đa mỗi cửa phải nằm trong tầm ~5 triệu, không có cửa nào vọt ra
    const max = C.DS.map(c => C.tranCua(c.id, null) * C.tiLeToiDa(c.id));
    ok('không cửa nào thắng quá 5 triệu ở trần mặc định', Math.max(...max) <= 5000000,
        Math.max(...max).toLocaleString('vi-VN'));
    ok('cửa đắt nhất là Bão từng số (4.995.000)',
        C.tranCua('bao1', null) * C.tiLeToiDa('bao1') === 4995000);
}

// ---------------------------------------------------------------- sinh nhân
muc('sinh hệ số nhân');
{
    const N = 200000;
    let tongO = 0, viPham = [];
    const demO = {};
    for (let i = 0; i < N; i++) {
        const nh = C.taoNhan(Math.random);
        const ids = Object.keys(nh);
        tongO += ids.length;
        for (const id of ids) {
            demO[id] = (demO[id] || 0) + 1;
            if (nh[id] > C.tiLeToiDa(id)) viPham.push(id + '=' + nh[id]);
            if (nh[id] <= C.THEO_ID[id].goc) viPham.push(id + ' nhân ' + nh[id] + ' <= gốc');
        }
    }
    ok('nhân không bao giờ vượt mức in trên bảng', viPham.length === 0, viPham.slice(0, 3).join(', '));
    ok('nhân luôn LỚN HƠN tỉ lệ gốc (sáng đèn mà trả ít hơn là vô lý)', viPham.length === 0);
    const tb = tongO / N;
    ok('trung bình 5-10 ô sáng mỗi ván', tb >= 5 && tb <= 10, tb.toFixed(2) + ' ô');
    ok('4 cửa đều tiền KHÔNG bao giờ sáng',
        !['xiu', 'tai', 'chan', 'le'].some(id => demO[id]));
    // tần suất thực phải bám q đã giải
    let lech = [];
    for (const c of C.DS) {
        if (c.q <= 0) continue;
        const thuc = (demO[c.id] || 0) / N;
        if (Math.abs(thuc - c.q) > 0.01) lech.push(c.id + ' ' + pc(thuc) + ' vs ' + pc(c.q));
    }
    ok('tần suất sáng thực bám đúng q đã giải (lệch < 1%)', lech.length === 0, lech.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- RTP thật
muc('🎯 RTP THẬT — quay 3 triệu ván, đặt 1 đồng mọi cửa');
{
    const N = 3000000;
    const dat = {}, an = {};
    for (const c of C.DS) { dat[c.id] = 0; an[c.id] = 0; }
    for (let i = 0; i < N; i++) {
        const xx = [1 + (Math.random() * 6 | 0), 1 + (Math.random() * 6 | 0), 1 + (Math.random() * 6 | 0)];
        const nh = C.taoNhan(Math.random);
        for (const c of C.DS) { dat[c.id] += 1; an[c.id] += C.tinhTra(c.id, 1, xx, nh); }
    }
    let xau = [];
    for (const c of C.DS) {
        const rtp = an[c.id] / dat[c.id];
        const mong = c.q > 0 ? C.RTP_MUC_TIEU : c.rtpGoc;
        // cửa hiếm (bão từng số) dao động mạnh nên nới ngưỡng theo độ hiếm
        const nguong = c.p < 0.01 ? 0.10 : (c.p < 0.05 ? 0.04 : 0.02);
        if (Math.abs(rtp - mong) > nguong) xau.push(c.ten + ' ' + pc(rtp) + ' (mong ' + pc(mong) + ')');
    }
    ok('mọi cửa đều bám RTP mục tiêu', xau.length === 0, xau.slice(0, 5).join(' | '));

    const nhom = [['tai', 'Tài'], ['tong4', 'Tổng 4'], ['tong9', 'Tổng 9'], ['doi1', 'Đôi 1'],
                  ['bao1', 'Bão 1'], ['baoany', 'Bão bất kỳ'], ['cap12', 'Cặp 1-2'], ['don1', 'Đơn 1']];
    console.log('       ' + nhom.map(([id, t]) => t + ' ' + pc(an[id] / dat[id])).join(' · '));

    const tongDat = Object.values(dat).reduce((a, b) => a + b, 0);
    const tongAn = Object.values(an).reduce((a, b) => a + b, 0);
    const edge = 1 - tongAn / tongDat;
    ok('nhà cái ăn 4-6% trên toàn bàn', edge >= 0.04 && edge <= 0.06, pc(edge));
    console.log('       => đặt đều mọi cửa thì nhà cái ăn ' + pc(edge) + ' (Tài Xỉu cũ: ~2,8%)');
}

// ---------------------------------------------------------------- ô trúng
// Bàn web tô sáng/xám theo cuaThang(). Nếu nó lệch với tinhTra() thì bàn báo
// trúng mà ví không tăng (hoặc ngược lại) — phải khớp TUYỆT ĐỐI, không sai 1 ô.
muc('danh sách ô TRÚNG dùng để tô bàn');
{
    let lech = [], tong = 0;
    for (const x of C.MOI_KET_QUA) {
        const t = new Set(C.cuaThang(x));
        for (const c of C.DS) {
            tong++;
            const an = C.tinhTra(c.id, 100, x, null) > 0;
            if (an !== t.has(c.id)) lech.push(x.join('-') + '/' + c.id);
        }
    }
    ok('cuaThang khớp tinhTra trên toàn bộ ' + tong + ' phép (216 kết quả × 52 cửa)',
        lech.length === 0, lech.slice(0, 5).join(', '));
    ok('bão 4-4-4 trúng đúng 5 ô: tổng 12, đôi 4, bão 4, bão bất kỳ, đơn 4',
        C.cuaThang([4, 4, 4]).sort().join(',') === ['tong12', 'doi4', 'bao4', 'baoany', 'don4'].sort().join(','),
        C.cuaThang([4, 4, 4]).join(','));
    ok('ván thường 1-2-3 KHÔNG trúng ô bão nào',
        !C.cuaThang([1, 2, 3]).some(id => id.indexOf('bao') === 0),
        C.cuaThang([1, 2, 3]).join(','));
    ok('ván nào cũng có ít nhất 1 ô trúng',
        C.MOI_KET_QUA.every(x => C.cuaThang(x).length > 0));
}

console.log('\n🎲 LÕI TIỀN TÀI XỈU: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
