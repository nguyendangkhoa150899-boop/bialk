// Bộ kiểm LÕI TIỀN SIÊU TÀI XỈU — chạy: node SieuTaiXiu/kiemtra/cua-test.js
// Không cần bot. Đây là bàn CÓ PHÍ 20% nên mọi phép tính tiền phải tính cả phí.
'use strict';
const S = require('../cua.js');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- bàn
muc('bàn 52 cửa');
ok('đúng 52 cửa, id không trùng', S.DS.length === 52 && new Set(S.DS.map(c => c.id)).size === 52,
    String(S.DS.length));
ok('mọi cửa đủ trường (id, tên, nhóm trần, tỉ lệ gốc, hàm tra)',
    S.DS.every(c => c.id && c.ten && S.NHOM_TRAN[c.nhom] && c.goc > 0 && typeof c.tra === 'function'));
ok('không cửa nào KHÔNG BAO GIỜ thắng', S.DS.every(c => S.MOI_KET_QUA.some(x => c.tra(x) > 0)));
ok('không cửa nào LUÔN thắng', S.DS.every(c => S.MOI_KET_QUA.some(x => c.tra(x) === 0)));
ok('ván nào cũng có ít nhất 1 cửa trúng', S.MOI_KET_QUA.every(x => S.cuaThang(x).length > 0));

// ⭐ Điểm KHÁC bàn thường: 4 cửa đều tiền ở đây CŨNG được nhân.
muc('⭐ khác bàn thường: Tài/Xỉu/Chẵn/Lẻ CÓ được nhân');
for (const id of ['tai', 'xiu', 'chan', 'le']) {
    const c = S.THEO_ID[id];
    ok(c.ten + ' được nhân (q > 0)', c.q > 0, 'q=' + c.q);
}
ok('4 cửa đều tiền vẫn THUA SẠCH khi ra bão',
    ['tai', 'xiu', 'chan', 'le'].every(id => S.tinhTra(id, 1000, [4, 4, 4], null) === 0));
ok('mức nhân cao nhất của cửa đều tiền đúng 14:1', S.tiLeToiDa('tai') === 14, String(S.tiLeToiDa('tai')));

// ---------------------------------------------------------------- bảng trả
muc('mức trả cao nhất khớp bảng "Trả thưởng & Hạn mức"');
const CAN = {
    tai: 14, xiu: 14, chan: 14, le: 14,
    doi3: 149, bao3: 1999, baoany: 499,
    tong4: 999, tong17: 999, tong5: 499, tong16: 499,
    tong6: 249, tong15: 249, tong7: 149, tong14: 149,
    tong8: 87, tong13: 87, tong9: 87, tong12: 87, tong10: 87, tong11: 87,
    cap12: 99, don3: 87,
};
{
    const lech = Object.keys(CAN).filter(id => S.tiLeToiDa(id) !== CAN[id]);
    ok('không nhóm nào lệch mức cao nhất', lech.length === 0,
        lech.map(id => id + ': x' + S.tiLeToiDa(id) + ' (bảng ghi x' + CAN[id] + ')').join(', '));
}
ok('tỉ lệ GỐC đúng bảng: đôi 8:1 · bão 150:1 · bão bất kỳ 30:1 · tổng 4 là 50:1 · cặp 5:1',
    S.THEO_ID.doi3.goc === 8 && S.THEO_ID.bao3.goc === 150 && S.THEO_ID.baoany.goc === 30 &&
    S.THEO_ID.tong4.goc === 50 && S.THEO_ID.cap12.goc === 5);

// ---------------------------------------------------------------- phí 20%
muc('phí 20% — nguồn thu duy nhất của nhà cái');
ok('phí đúng 20%', S.PHI === 0.20, String(S.PHI));
ok('đặt 1.000 thì trừ ví 1.200', S.tienTru(1000) === 1200, String(S.tienTru(1000)));
ok('riêng phần phí là 200', S.tienPhi(1000) === 200, String(S.tienPhi(1000)));
ok('đặt 1 đồng lẻ vẫn không âm', S.tienTru(1) === 1 && S.tienPhi(1) === 0, S.tienTru(1) + '/' + S.tienPhi(1));
// Phí KHÔNG hoàn: thắng thì ăn trên tiền cược gốc, không ăn trên tiền đã trừ.
ok('thắng thì ăn trên tiền cược GỐC, không ăn trên tiền đã trừ (phí không hoàn)',
    S.tinhTra('tai', 1000, [6, 6, 5], null) === 2000, String(S.tinhTra('tai', 1000, [6, 6, 5], null)));

// ---------------------------------------------------------------- RTP
muc('nhà cái ăn bao nhiêu (admin chỉnh)');
{
    const k = S.thongKe();
    ok('mặc định nhà cái ăn 8% (chủ server chốt 22/09)', Math.abs(k.an - 0.08) < 1e-9, String(k.an));
    ok('RTP bàn = (1 − ăn) × (1 + phí) = 110,4%', Math.abs(k.rtpBan - 1.104) < 1e-9, String(k.rtpBan));
    ok('người chơi thực nhận đúng 92%', Math.abs(k.rtpThuc - 0.92) < 0.002, (k.rtpThuc * 100).toFixed(3) + '%');
    ok('KHÔNG cửa nào kẹt trần (muốn sáng 100% ván mà vẫn thiếu RTP)',
        k.cuaKetTran.length === 0, k.cuaKetTran.join(', '));
    ok('cả 52 cửa đều có cơ hội được nhân', k.soCuaDuocNhan === 52, String(k.soCuaDuocNhan));
}
{
    const xau = S.datMucAn(0.5);
    ok('đặt mức ăn ngoài khoảng thì chặn', !!xau.error, JSON.stringify(xau));
    const a = S.datMucAn(8);          // nhận cả 8 lẫn 0.08
    ok('nhận cả "8" lẫn "0.08"', a.ok && Math.abs(a.an - 0.08) < 1e-9, JSON.stringify(a.an));
    S.datMucAn(0.08);
}

// ĐO THẬT bằng mô phỏng, không tin công thức suông.
muc('đo thật bằng mô phỏng (đặt đều 52 cửa, đã tính phí)');
{
    const N = 200000;
    let tru = 0, tra = 0;
    for (let i = 0; i < N; i++) {
        const nhan = S.taoNhan();
        const x = S.MOI_KET_QUA[Math.floor(Math.random() * 216)];
        for (const c of S.DS) { tru += S.tienTru(1000); tra += S.tinhTra(c.id, 1000, x, nhan); }
    }
    const an = (tru - tra) / tru;
    ok('nhà cái ăn thật 7-9% (đặt 8%)', an > 0.07 && an < 0.09, (an * 100).toFixed(2) + '%');
    console.log('       => đo được ' + (an * 100).toFixed(2) + '% trên ' + N.toLocaleString('vi-VN') + ' ván');
}

// ---------------------------------------------------------------- trần cược
muc('trần cược');
{
    const tran = S.tranMacDinh();
    // Trần lấy đúng bảng chủ server gửi. Ô phơi nhiễm nhất là Bộ ba bất kỳ
    // (5.000 × 499 = 2.495.000) nên ngưỡng đặt 2,6 triệu cho vừa.
    const vuot = S.DS.filter(c => S.tranCua(c.id, tran) * S.tiLeToiDa(c.id) > 2600000)
        .map(c => c.id + ': ' + (S.tranCua(c.id, tran) * S.tiLeToiDa(c.id)).toLocaleString('vi-VN'));
    ok('thắng tối đa MỘT ô không vượt ~2,5 triệu', vuot.length === 0, vuot.slice(0, 4).join(' · '));
    ok('cửa trả càng cao trần càng thấp',
        S.tranCua('bao3', tran) < S.tranCua('tong7', tran) && S.tranCua('tong7', tran) < S.tranCua('tai', tran));
}

// ---------------------------------------------------------------- ô trúng
muc('danh sách ô trúng (bàn web tô màu theo đây)');
{
    let lech = [], tong = 0;
    for (const x of S.MOI_KET_QUA) {
        const t = new Set(S.cuaThang(x));
        for (const c of S.DS) { tong++; if ((S.tinhTra(c.id, 100, x, null) > 0) !== t.has(c.id)) lech.push(x.join('-') + '/' + c.id); }
    }
    ok('cuaThang khớp tinhTra trên toàn bộ ' + tong + ' phép', lech.length === 0, lech.slice(0, 4).join(', '));
}

// ---------------------------------------------------------------- thang nhân
muc('thang hệ số nhân (admin chỉnh)');
{
    const r = S.datThang({ bao: [[200, 50], [999, 10], [1999, 1]] });
    ok('sửa được thang', r.ok, r.error);
    ok('sửa xong nhà cái vẫn ăn đúng 8%', Math.abs(r.anThuc - 0.08) < 0.01, (r.anThuc * 100).toFixed(2) + '%');
    ok('hệ số không tăng dần thì chặn', !!S.datThang({ bao: [[999, 1], [200, 5]] }).error);
    ok('nhóm lạ thì chặn', !!S.datThang({ khongco: [[1, 1], [2, 2]] }).error);
    S.datThang(S.thangMacDinh());
    ok('về mặc định được', S.tiLeToiDa('bao3') === 1999, String(S.tiLeToiDa('bao3')));
}

console.log('\n⚡ LÕI TIỀN SIÊU TÀI XỈU: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
