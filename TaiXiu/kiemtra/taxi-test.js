// ============================================================================
//  Bộ kiểm 🚕 "XU ĐI TAXI VỀ", chạy: node TaiXiu/kiemtra/taxi-test.js  (không cần bot)
//
//  Chủ server 24/09: "người chơi về 0 dogcoin thì bấm nút được +10.000 (admin set số),
//  điều kiện: 1. thua 2.000.000 trở lên trong ngày (admin set) · 2. 24 tiếng reset 1 lần,
//  1 ngày chỉ nhận được 1 lần".
//
//  Đây là NÚT PHÁT TIỀN THẬT nên mọi phép dưới đây chạy MÃ THẬT cắt từ index.js, không đọc
//  chữ suông: dựng ví giả, chơi giả, rồi soi từng đồng.
// ============================================================================
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(R, 'BotDoMin', 'index.js'), 'utf8');
const PANEL = fs.readFileSync(path.join(R, 'BotDoMin', 'panel.js'), 'utf8');
const WEB = fs.readFileSync(path.join(R, 'BotDoMin', 'webplay.js'), 'utf8');

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');
const vnd = (n) => Number(n).toLocaleString('vi-VN');

// ---------------------------------------------------------------- dựng sân khấu: mã THẬT + ví giả
// Cắt trọn khối từ updatePoints tới hết taxiNhan (gồm logDog, statAdd, sổ lãi-lỗ ngày, vé taxi).
function dung(ngayDau = '24/9/2026') {
    const i = SRC.indexOf('function updatePoints(userId, amount) {');
    const j = SRC.indexOf('// ===== CHUYỂN DOGCOIN GIỮA NGƯỜI CHƠI');
    if (i < 0 || j < 0) throw new Error('không cắt được khối taxi trong index.js');
    const ma = SRC.slice(i, j);
    const c = {
        dbCache: { A: { points: 0, name: 'A' }, B: { points: 0, name: 'B' } },
        NGAY: ngayDau, GIO: Date.now(), log: [],
        console, Math, Number, Date, Object, Array, Set, JSON, String,
    };
    c.getUserData = (id) => { if (!c.dbCache[id]) c.dbCache[id] = { points: 0, name: id }; return c.dbCache[id]; };
    c.vnDayStr = () => c.NGAY;                     // đổi c.NGAY = sang ngày mới
    c.saveDbNow = () => { };
    c.writeLog = (k, m) => c.log.push(m);
    vm.createContext(c);
    vm.runInContext(ma + '\nthis.__api={taxiCfg,setTaxiCfg,taxiState,taxiNhan,taxiLoHomNay,taxiDonSo,loNgayCong,updatePoints,logDog};', c);
    const A = c.__api;
    return {
        c, ...A,
        vi: (id) => c.getUserData(id).points,
        datVi: (id, n) => { c.getUserData(id).points = n; },
        // chơi game: ví đổi, KHÔNG đi qua logDog (đúng như Tài Xỉu / Dò Mìn / Leo Thang thật)
        choi: (id, delta) => A.updatePoints(id, delta),
        // khoản KHÔNG phải game: ví đổi + ghi sổ Dogcoin
        ngoaiGame: (id, delta, loai) => { A.updatePoints(id, delta); A.logDog(loai, id, id, delta, ''); },
        // tua đồng hồ: dời mốc nhận lùi về quá khứ
        tuaGio: (id, gio) => { if (c.dbCache._taxiNhan && c.dbCache._taxiNhan[id]) c.dbCache._taxiNhan[id] -= gio * 3600000; },
    };
}

// ---------------------------------------------------------------- ① mặc định đúng lời chủ server
muc('① mặc định: +10.000 khi thua ≥ 2.000.000 và ví về 0');
{
    const s = dung();
    const c = s.taxiCfg();
    ok('⭐ phát 10.000 · cần thua 2.000.000/ngày · ví phải về 0 · cách 24 tiếng · mặc định BẬT',
        c.tien === 10000 && c.loMin === 2000000 && c.viMax === 0 && c.gioCho === 24 && c.on === true, JSON.stringify(c));
}

// ---------------------------------------------------------------- ② đủ / chưa đủ điều kiện
muc('② hai điều kiện: cháy ví VÀ thua đủ trong ngày');
{
    const s = dung();
    s.datVi('A', 3000000);
    ok('mới vào, chưa thua gì -> KHÔNG nhận được', !s.taxiState('A').nhanDuoc);
    s.choi('A', -1500000);                               // thua 1,5 triệu
    s.datVi('A', 0);                                      // giả bộ cháy sạch ví
    let st = s.taxiState('A');
    ok('cháy ví nhưng mới thua 1,5tr -> vẫn KHÔNG nhận được', !st.nhanDuoc && st.vuong === 'chuaDuLo');
    ok('...báo còn thiếu đúng 500.000', st.thieuLo === 500000, String(st.thieuLo));
    ok('...bấm liều cũng bị máy chủ chặn, câu báo nói rõ số', /thua 1\.500\.000/.test(s.taxiNhan('A').error || '') && /2\.000\.000/.test(s.taxiNhan('A').error || ''), s.taxiNhan('A').error);
    s.choi('A', -600000);                                 // tổng thua 2,1 triệu
    s.datVi('A', 50000);                                  // nhưng ví còn tiền
    st = s.taxiState('A');
    ok('thua đủ 2,1tr nhưng ví còn 50.000 -> KHÔNG nhận được (nút dành cho người CHÁY ví)', !st.nhanDuoc && st.vuong === 'conTien');
    ok('...câu báo nói rõ ví còn bao nhiêu', /còn 50\.000/.test(s.taxiNhan('A').error || ''), s.taxiNhan('A').error);
    s.datVi('A', 0);
    st = s.taxiState('A');
    ok('⭐ cháy ví + thua 2,1tr -> ĐỦ điều kiện', st.nhanDuoc && st.vuong === '', JSON.stringify(st.vuong));
    const r = s.taxiNhan('A');
    ok('⭐⭐ bấm nhận: ví từ 0 -> 10.000', r.ok === true && s.vi('A') === 10000, JSON.stringify([r, s.vi('A')]));
    ok('...trả về đúng số tiền + số giờ phải chờ', r.tien === 10000 && r.gioCho === 24 && r.balance === 10000);
    ok('...ghi log admin có tên + số tiền + số đã thua', /XU ĐI TAXI/.test(s.c.log.join('|')) && /2\.100\.000/.test(s.c.log.join('|')), s.c.log.join('|'));
}

// ---------------------------------------------------------------- ③ 24 tiếng / 1 ngày 1 lần
muc('③ 24 tiếng mới nhận lại được, 1 ngày 1 lần');
{
    const s = dung();
    s.choi('A', -5000000); s.datVi('A', 0);
    ok('lần 1 nhận được', s.taxiNhan('A').ok === true);
    ok('⭐ bấm lại NGAY -> bị chặn, không cộng thêm đồng nào', !!s.taxiNhan('A').error && s.vi('A') === 10000, String(s.vi('A')));
    ok('...câu báo nói còn phải chờ bao lâu', /Mỗi 24 tiếng/.test(s.taxiNhan('A').error), s.taxiNhan('A').error);
    // bấm dồn 5 phát (mạng lag, bấm liên tục), chỉ ăn 1
    s.datVi('A', 0);
    for (let i = 0; i < 5; i++) s.taxiNhan('A');
    ok('⭐⭐ bấm dồn 5 phát chỉ ăn 1 lần (ví vẫn 0 vì đã nhận rồi)', s.vi('A') === 0, String(s.vi('A')));
    s.tuaGio('A', 23);
    ok('sau 23 tiếng -> vẫn chưa được', !s.taxiState('A').nhanDuoc && s.taxiState('A').vuong === 'cho');
    s.tuaGio('A', 1.1);
    ok('⭐ qua mốc 24 tiếng -> nhận lại được', s.taxiState('A').nhanDuoc && s.taxiNhan('A').ok === true && s.vi('A') === 10000);
    // đúng ý "1 ngày 1 lần": sang ngày mới NHƯNG chưa đủ 24h thì vẫn phải chờ
    const s2 = dung();
    s2.choi('A', -5000000); s2.datVi('A', 0); s2.taxiNhan('A');
    s2.c.NGAY = '25/9/2026'; s2.datVi('A', 0); s2.choi('A', -5000000);
    ok('⭐ nhận lúc 23h55 rồi sang ngày mới lúc 00h05 -> VẪN phải chờ đủ 24 tiếng (không lách được mốc nửa đêm)',
        !s2.taxiState('A').nhanDuoc && s2.taxiState('A').vuong === 'cho');
}

// ---------------------------------------------------------------- ④ "thua" đếm đúng: chỉ tiền CHƠI
muc('④ "thua trong ngày" chỉ tính tiền CHƠI, nạp/rút/chuyển/admin không tính');
{
    const s = dung();
    s.choi('A', -800000);
    ok('thua game 800.000 -> sổ ghi 800.000', s.taxiLoHomNay('A') === 800000, String(s.taxiLoHomNay('A')));
    s.ngoaiGame('A', -3000000, 'to-game');
    ok('⭐ RÚT 3 triệu vào game -> KHÔNG phải thua, sổ vẫn 800.000', s.taxiLoHomNay('A') === 800000, String(s.taxiLoHomNay('A')));
    s.ngoaiGame('A', -2000000, 'transfer');
    ok('⭐ CHUYỂN 2 triệu cho người khác -> không tính là thua', s.taxiLoHomNay('A') === 800000, String(s.taxiLoHomNay('A')));
    s.ngoaiGame('A', -1500000, 'shop');
    s.ngoaiGame('A', -500000, 'trano');
    s.ngoaiGame('A', 4000000, 'admin+');
    s.ngoaiGame('A', 1000000, 'vay');
    s.ngoaiGame('A', 700000, 'refund');
    s.ngoaiGame('A', 2000000, 'from-game');
    ok('⭐ mua pal · trả nợ · admin cộng · vay · hoàn tiền · nạp về Discord -> không cái nào tính là thua',
        s.taxiLoHomNay('A') === 800000, String(s.taxiLoHomNay('A')));
    s.choi('A', 300000);
    ok('thắng lại 300.000 -> thua ròng còn 500.000', s.taxiLoHomNay('A') === 500000, String(s.taxiLoHomNay('A')));
    s.choi('A', 900000);
    ok('thắng tiếp, đang LÃI -> thua = 0 (không ra số âm)', s.taxiLoHomNay('A') === 0, String(s.taxiLoHomNay('A')));
}

// ---------------------------------------------------------------- ⑤ cái bẫy: sổ Dogcoin ghi lệch ví
muc('⑤ ⚠️ Phi Thuyền ghi sổ 2 lần, đếm theo VÍ nên không bị thổi gấp đôi');
{
    const s = dung();
    // Phi Thuyền THẬT: cược -> updatePoints(-1tr) + logDog('bet', -1tr); nổ -> logDog('bet', -1tr) LẦN NỮA
    // (ví không đổi). Nếu đếm theo sổ thì ra 2tr; đếm theo ví thì đúng 1tr.
    s.choi('A', -1000000);
    s.logDog('bet', 'A', 'A', -1000000, 'Phi Thuyền cược');
    s.logDog('bet', 'A', 'A', -1000000, 'Phi Thuyền NỔ - thua');
    ok('⭐⭐ cược 1tr rồi nổ: thua ĐÚNG 1.000.000, không phải 2.000.000', s.taxiLoHomNay('A') === 1000000, String(s.taxiLoHomNay('A')));
    ok('...tức là KHÔNG đủ điều kiện nhận (ngưỡng 2tr), đếm sai là phát tiền oan', (s.datVi('A', 0), !s.taxiState('A').nhanDuoc));
    // cashout: ví +win, sổ ghi (win - cược)
    const s2 = dung();
    s2.choi('B', -1000000); s2.logDog('bet', 'B', 'B', -1000000, 'cược');
    s2.choi('B', 1500000); s2.logDog('bet', 'B', 'B', 500000, 'rút 1.5x');
    ok('⭐ cược 1tr rút về 1,5tr: đang LÃI 500.000 nên thua = 0', s2.taxiLoHomNay('B') === 0, String(s2.taxiLoHomNay('B')));
    // các trò còn lại đi qua logDog với đúng số ví đổi -> vẫn đúng
    const s3 = dung();
    s3.choi('A', -300000); s3.logDog('sieutx', 'A', 'A', -300000, 'Siêu TX');
    s3.choi('A', -200000); s3.logDog('tienlen', 'A', 'A', -200000, 'Tiến Lên');
    s3.choi('A', -400000); s3.logDog('cophieu', 'A', 'A', -400000, 'cổ phiếu');
    ok('Siêu TX + Tiến Lên + Cổ phiếu: cộng dồn đúng 900.000', s3.taxiLoHomNay('A') === 900000, String(s3.taxiLoHomNay('A')));
}

// ---------------------------------------------------------------- ⑥ tiền cứu trợ không tự xoá nợ
muc('⑥ tiền taxi không tự làm giảm số đã thua');
{
    const s = dung();
    s.choi('A', -2500000); s.datVi('A', 0);
    s.taxiNhan('A');
    ok('⭐ nhận 10.000 xong, sổ vẫn ghi thua 2.500.000 (không bị trừ còn 2.490.000)',
        s.taxiLoHomNay('A') === 2500000, String(s.taxiLoHomNay('A')));
    ok('...và khoản này CÓ vào Sổ Dogcoin (loại "taxi") để admin tra được',
        (s.c.dbCache._dogLedger || []).some(r => r.type === 'taxi' && r.amount === 10000),
        JSON.stringify((s.c.dbCache._dogLedger || [])[0]));
}

// ---------------------------------------------------------------- ⑦ sang ngày mới
muc('⑦ sang ngày mới (00:00 giờ VN) sổ thua về 0');
{
    const s = dung();
    s.choi('A', -9000000);
    ok('hôm nay thua 9 triệu', s.taxiLoHomNay('A') === 9000000);
    s.c.NGAY = '25/9/2026';
    ok('⭐ qua ngày mới -> sổ về 0, phải thua lại từ đầu mới nhận được', s.taxiLoHomNay('A') === 0, String(s.taxiLoHomNay('A')));
    s.datVi('A', 0);
    ok('...và lúc này không đủ điều kiện', !s.taxiState('A').nhanDuoc);
    // dọn sổ: entry ngày cũ phải biến, mốc nhận quá 7 ngày cũng dọn
    s.c.dbCache._loNgay['Z_cu'] = { n: '01/1/2020', v: -999 };
    s.c.dbCache._taxiNhan = { moi: Date.now(), cu: Date.now() - 8 * 86400000 };
    s.taxiDonSo();
    ok('taxiDonSo() dọn entry ngày cũ + mốc nhận quá 7 ngày, giữ cái mới',
        !s.c.dbCache._loNgay['Z_cu'] && s.c.dbCache._taxiNhan.moi && !s.c.dbCache._taxiNhan.cu);
    ok('bot GỌI taxiDonSo() lúc khởi động (không thì sổ phình mãi)', /refundBootPendingBets\(\);\s*\r?\n\s*taxiDonSo\(\);/.test(SRC));
    ok('id rác (không có ví) không tạo được entry rỗng trong DB',
        (s.loNgayCong('id_khong_ton_tai', -500), !s.c.dbCache._loNgay['id_khong_ton_tai']));
}

// ---------------------------------------------------------------- ⑧ admin chỉnh được
muc('⑧ admin chỉnh được cả 4 số + công tắc');
{
    const s = dung();
    s.setTaxiCfg({ tien: 50000, loMin: 500000, viMax: 20000, gioCho: 6 });
    s.choi('A', -600000); s.datVi('A', 15000);
    const st = s.taxiState('A');
    ok('⭐ đổi: phát 50.000 · cần thua 500.000 · ví còn ≤ 20.000 · cách 6 tiếng -> áp NGAY',
        st.nhanDuoc && st.tien === 50000 && st.gioCho === 6, JSON.stringify(st));
    ok('...ví còn 15.000 vẫn nhận được vì ngưỡng là 20.000', s.taxiNhan('A').ok === true && s.vi('A') === 65000, String(s.vi('A')));
    s.tuaGio('A', 6.1); s.datVi('A', 0);   // vừa nhận 50.000 xong nên phải cháy ví lại mới xét tiếp
    ok('...chờ 6 tiếng (không phải 24) là nhận lại được', s.taxiState('A').nhanDuoc, JSON.stringify(s.taxiState('A')));
    s.setTaxiCfg({ on: false });
    ok('⭐ TẮT -> không ai nhận được nữa', !s.taxiState('A').nhanDuoc && /đang tắt/.test(s.taxiNhan('A').error || ''), s.taxiNhan('A').error);
    s.setTaxiCfg({ on: true, gioCho: 0 });
    ok('số bậy (0 giờ) bị kẹp về mặc định 24, không cho nhận vô hạn', s.taxiCfg().gioCho === 24, String(s.taxiCfg().gioCho));
    s.setTaxiCfg({ tien: -5, loMin: 'abc' });
    ok('tiền âm / chữ -> về mặc định, không NaN', s.taxiCfg().tien === 10000 && s.taxiCfg().loMin === 2000000, JSON.stringify(s.taxiCfg()));
}

// ---------------------------------------------------------------- ⑨ nối dây: web + panel
muc('⑨ nối dây web + panel');
{
    ok('index đưa hàm cho web (ctx.taxi)', /taxi: \{ state: taxiState, nhan: taxiNhan \}/.test(SRC));
    ok('index đưa cấu hình cho panel', /getTaxiCfg: \(\) => taxiCfg\(\)/.test(SRC) && /setTaxiCfg: \(o\) => setTaxiCfg\(o\)/.test(SRC));
    ok('web có 2 đường: xem trạng thái + bấm nhận', /path === '\/api\/taxi\/state'/.test(WEB) && /path === '\/api\/taxi\/nhan'/.test(WEB));
    ok('⭐ đường NHẬN là POST (người chưa liên kết ví bị cổng chặn sẵn)', /req\.method === 'POST' && path === '\/api\/taxi\/nhan'/.test(WEB));
    ok('nút nằm cạnh số dư, chỉ hiện khi đủ điều kiện', /id="taxiChip"/.test(WEB) && /XU ĐI TAXI VỀ/.test(WEB) && /if\(TAXI&&TAXI\.nhanDuoc\)/.test(WEB));
    ok('hỏi lại máy chủ mỗi 20 giây + ngay khi ví đổi (cháy ví là thấy nút liền)',
        /setInterval\(taxiSync,20000\)/.test(WEB) && /if\(\(TAXI&&TAXI\.nhanDuoc\)!==\(BAL<=\(\(TAXI&&TAXI\.viMax\)\|\|0\)\)\)taxiSync\(\)/.test(WEB));
    ok('panel: 4 ô + công tắc + nút lưu', /id="txTien"/.test(PANEL) && /id="txLoMin"/.test(PANEL) && /id="txViMax"/.test(PANEL) && /id="txGio"/.test(PANEL) && /id="txOn"/.test(PANEL) && /onclick="txSave\(\)"/.test(PANEL));
    ok('panel có đường lưu cấu hình + ghi log admin', /path === '\/api\/taxi\/cfg'/.test(PANEL) && /\[PANEL\] Xu đi taxi về/.test(PANEL));
    ok('Sổ Dogcoin có nhãn tiếng Việt cho loại "taxi"', /'taxi':'🚕 Xu đi taxi về'/.test(PANEL));
    ok('panel đổ giá trị về ô mà KHÔNG đè lúc admin đang gõ', /if\(STATE\.taxiCfg\)\{\[\['txTien','tien'\]/.test(PANEL) && /document\.activeElement!==el/.test(PANEL));
}

console.log('\n🚕 XU ĐI TAXI VỀ: ' + P + ' đạt, ' + F + ' hỏng');
if (F) process.exitCode = 1;
