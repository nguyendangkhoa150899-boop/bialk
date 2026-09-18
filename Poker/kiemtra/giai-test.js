// Bộ kiểm cho Poker/giai.js — chạy: node Poker/kiemtra/giai-test.js
'use strict';
const { taoGiai } = require('../giai.js');
const B = require('../bai.js');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');
const BON = [{ id: 'A', ten: 'Anh Vinh Q' }, { id: 'B', ten: 'Biabia' },
             { id: 'C', ten: 'Khoa' }, { id: 'D', ten: 'Long' }];
const moi = (tc) => taoGiai(tc);
/** Cho cả bàn THEO tới khi hết ván. Có trần 200 bước để bug của máy lộ ra
 *  thành bài kiểm hỏng, chứ không treo cả bộ kiểm. */
function theoHetVan(g, t = 0) {
    let n = 0;
    while (g._trong.van && !['LAT', 'XONG'].includes(g._trong.van.vong) && n++ < 200) {
        const v = g._trong.van;
        if (v.loDan) g.nhip(t += 2000);                       // 18/09: cả bàn all-in -> lật từ từ theo nhịp
        else if (v.luot) g.hanhDong(v.luot, 'theo', 0, t);
        else break;
    }
    return n < 200;
}
const tongChip = (g) => g._trong.nguoi.reduce((s, p) => s + p.chip, 0);

// ---------------------------------------------------------------- mở giải
muc('mở giải');
{
    const g = moi();
    const s = g.batDau(BON, 0);
    ok('4 người, ai cũng 5.000 chip', s.nguoi.length === 4 && s.nguoi.every(p => p.chip + p.cuoc === 5000),
        JSON.stringify(s.nguoi.map(p => p.chip)));
    ok('tổng chip trên bàn luôn = 20.000', tongChip(g) + s.van.hu === 20000, String(tongChip(g) + s.van.hu));
    ok('mức blind 1 là 25/50', s.blind.sb === 25 && s.blind.bb === 50);
    ok('đã đặt blind (hũ = 75)', s.van.hu === 75, String(s.van.hu));
    ok('vòng đầu là PREFLOP', s.van.vong === 'PREFLOP');
    ok('có người tới lượt', !!s.van.luot);
    // nút cái giờ NGẪU NHIÊN nên không được giả định ghế 0 là SB — so với van.sb thật
    ok('máy chủ báo rõ ai là SB, ai là BB', !!s.van.sb && !!s.van.bb && s.van.sb !== s.van.bb);
    ok('preflop người đi đầu KHÔNG phải small blind, cũng KHÔNG phải big blind',
        s.van.luot !== s.van.sb && s.van.luot !== s.van.bb, 'đi đầu ' + s.van.luot + ' · SB ' + s.van.sb + ' · BB ' + s.van.bb);
    ok('nút cái không phải SB (bàn 4 người)', s.nutCai !== s.van.sb);
}
{
    let loi = false;
    try { moi().batDau([{ id: 'A' }], 0); } catch (e) { loi = true; }
    ok('1 người thì không mở được giải', loi);
}

// ---------------------------------------------------------------- giấu bài
muc('GIẤU BÀI — không được lộ bài người khác');
{
    const g = moi(); g.batDau(BON, 0);
    const s = g.xem('A');
    ok('thấy được 2 lá của chính mình', Array.isArray(s.toi.la) && s.toi.la.length === 2);
    const chuoi = JSON.stringify(s);
    const bai = g._trong.van.tay;
    let lo = [];
    for (const id of ['B', 'C', 'D']) for (const la of bai[id]) if (chuoi.includes('"' + la + '"')) lo.push(id + ':' + la);
    // lá của người khác có thể trùng tên với lá mình? không - bộ 52 không trùng
    const cuaToi = new Set(bai.A);
    lo = lo.filter(x => !cuaToi.has(x.split(':')[1]));
    ok('KHÔNG lá nào của B/C/D lọt vào bản xem của A', lo.length === 0, lo.join(','));
    ok('xemChung() hoàn toàn không có bài của ai',
        !JSON.stringify(g.xemChung()).match(/"(la|tay)"/));
}

// ---------------------------------------------------------------- hành động
muc('luật hành động');
{
    const g = moi(); g.batDau(BON, 0);
    const luot = g.xemChung().van.luot;
    let loi = false;
    try { g.hanhDong(luot === 'A' ? 'B' : 'A', 'theo', 0, 0); } catch (e) { loi = true; }
    ok('không phải lượt mình thì không đánh được', loi);
    let loi2 = false;
    try { g.hanhDong(luot, 'to', 60, 0); } catch (e) { loi2 = true; }
    ok('tố dưới mức tối thiểu bị chặn (mức 50, tố tối thiểu 100)', loi2);
    let loi3 = false;
    try { g.hanhDong(luot, 'to', 999999, 0); } catch (e) { loi3 = true; }
    ok('tố quá số chip đang có bị chặn', loi3);
    g.hanhDong(luot, 'theo', 0, 0);
    ok('theo xong thì chuyển lượt', g.xemChung().van.luot !== luot);
}
{
    const g = moi(); g.batDau(BON, 0);
    const v = g._trong.van;
    // đưa về tình huống miễn phí: big blind lúc ai cũng chỉ theo
    g.hanhDong(v.luot, 'theo', 0, 0);
    g.hanhDong(v.luot, 'theo', 0, 0);
    g.hanhDong(v.luot, 'theo', 0, 0);   // small blind bù cho đủ
    let loi = false;
    try { g.hanhDong(v.luot, 'bo', 0, 0); } catch (e) { loi = true; }
    ok('đang MIỄN PHÍ thì chặn bỏ bài (chống bấm nhầm)', loi);
}

// ---------------------------------------------------------------- hết giờ
muc('hết giờ suy nghĩ');
{
    const g = moi({ giayMoiLuot: 30 }); g.batDau(BON, 0);
    const luot = g.xemChung().van.luot;
    g.nhip(1000);
    ok('chưa hết giờ thì không tự đánh', g.xemChung().van.luot === luot);
    g.nhip(31000);
    ok('hết giờ mà đang phải bỏ tiền -> TỰ BỎ BÀI',
        g._trong.van.daBo.has(luot), [...g._trong.van.daBo].join(','));
}
{
    const g = moi(); g.batDau(BON, 0);
    const v = g._trong.van;
    g.hanhDong(v.luot, 'theo', 0, 0);
    g.hanhDong(v.luot, 'theo', 0, 0);
    g.hanhDong(v.luot, 'theo', 0, 0);
    const bb = v.luot;                    // big blind, đang miễn phí
    g.nhip(99000);
    ok('hết giờ mà đang MIỄN PHÍ -> tự THEO, không bỏ bài', !v.daBo.has(bb));
    ok('...và sang vòng FLOP với 3 lá chung', v.vong === 'FLOP' && v.chung.length === 3,
        v.vong + '/' + v.chung.length);
}

// ---------------------------------------------------------------- vòng bài
muc('đi hết 4 vòng bài');
{
    const g = moi(); g.batDau(BON, 0);
    const v = g._trong.van;
    // đi hết MỘT vòng cược rồi dừng — trước đây hàm này chạy tới khi hết lượt nên
    // phi thẳng từ PREFLOP tới RIVER, làm 3 bài kiểm dưới báo hỏng oan
    const diHet = () => {
        const v0 = v.vong; let n = 0;
        while (v.luot && v.vong === v0 && n++ < 12) g.hanhDong(v.luot, 'theo', 0, 0);
    };
    diHet();
    ok('PREFLOP -> FLOP, 3 lá chung', v.vong === 'FLOP' && v.chung.length === 3, v.vong);
    diHet();
    ok('FLOP -> TURN, 4 lá chung', v.vong === 'TURN' && v.chung.length === 4, v.vong);
    diHet();
    ok('TURN -> RIVER, 5 lá chung', v.vong === 'RIVER' && v.chung.length === 5, v.vong);
    diHet();
    ok('RIVER -> LẬT BÀI', v.vong === 'LAT', v.vong);
    ok('có kết quả lật bài', !!v.ketQua && Array.isArray(v.ketQua.lat));
    ok('lật đúng 4 người', v.ketQua.lat.length === 4, String(v.ketQua.lat.length));
    ok('mỗi người có tên bài rõ ràng', v.ketQua.lat.every(x => typeof x.cham.ten === 'string' && x.cham.ten.length > 3));
    ok('bài chung 5 lá không trùng nhau', new Set(v.chung).size === 5);
    ok('tổng chip vẫn 20.000 sau khi chia hũ', tongChip(g) === 20000, String(tongChip(g)));
}

muc('ba người bỏ thì người còn lại ăn trọn, KHÔNG lật bài');
{
    const g = moi(); g.batDau(BON, 0);
    const v = g._trong.van;
    g.hanhDong(v.luot, 'bo', 0, 0);
    g.hanhDong(v.luot, 'bo', 0, 0);
    g.hanhDong(v.luot, 'bo', 0, 0);
    ok('ván chốt ngay', v.vong === 'XONG', v.vong);
    ok('không lộ bài ai cả', v.ketQua.lat === null);
    ok('người còn lại ăn cả hũ 75', Object.values(v.ketQua.an)[0] === 75, JSON.stringify(v.ketQua.an));
    ok('tổng chip vẫn 20.000', tongChip(g) === 20000, String(tongChip(g)));
}

// ---------------------------------------------------------------- hũ phụ
muc('HŨ PHỤ (side pot) — chỗ dễ sai nhất');
{
    // dựng tay: 3 người all-in với 3 mức chip khác nhau
    const g = moi({ lichBlind: [{ sb: 10, bb: 20 }] });
    g.batDau([{ id: 'A' }, { id: 'B' }, { id: 'C' }], 0);
    const G = g._trong, v = G.van;
    // ép chip: A=1000, B=300, C=100  (ghi đè sau khi đã đặt blind)
    for (const p of G.nguoi) { p.chip = { A: 1000, B: 300, C: 100 }[p.id]; }
    for (const id of ['A', 'B', 'C']) { v.cuoc[id] = 0; v.tongCuoc[id] = 0; }
    v.muc = 0; v.toToiThieu = 20; v.daDi.clear(); v.luot = 'A';
    g.hanhDong('A', 'to', 1000, 0);      // A all-in 1000
    g.hanhDong('B', 'theo', 0, 0);       // B chỉ theo được 300
    g.hanhDong('C', 'theo', 0, 0);       // C chỉ theo được 100
    // 18/09: cả bàn all-in không chốt ngay nữa mà LẬT TỪ TỪ theo nhịp -> đẩy đồng hồ cho hết
    ok('cả bàn all-in -> chuyển sang lật từ từ (loDan), chưa chốt', v.loDan > 0 && !['LAT', 'XONG'].includes(v.vong), v.vong);
    let tLo = 0, nLo = 0;
    while (!['LAT', 'XONG'].includes(v.vong) && nLo++ < 10) g.nhip(tLo += 2000);
    ok('lật hết trong 4 nhịp (flop, turn, river, chốt) rồi mới LAT', ['LAT', 'XONG'].includes(v.vong) && nLo === 4, v.vong + ' sau ' + nLo + ' nhịp');
    ok('C đẩy đúng 100, B đúng 300, A đúng 1.000',
        v.tongCuoc.C === 100 && v.tongCuoc.B === 300 && v.tongCuoc.A === 1000,
        JSON.stringify(v.tongCuoc));
    const hu = v.ketQua.hu;
    ok('dựng ra 3 hũ', hu.length === 3, JSON.stringify(hu));
    ok('hũ chính 300 chip, cả 3 người tranh', hu[0].chip === 300 && hu[0].an.length === 3, JSON.stringify(hu[0]));
    ok('hũ phụ 1: 400 chip, chỉ A và B', hu[1].chip === 400 && hu[1].an.length === 2 &&
        hu[1].an.includes('A') && hu[1].an.includes('B'), JSON.stringify(hu[1]));
    ok('hũ phụ 2: 700 chip, chỉ mình A', hu[2].chip === 700 && hu[2].an.length === 1 && hu[2].an[0] === 'A',
        JSON.stringify(hu[2]));
    ok('tổng 3 hũ = 1.400 = đúng số chip đã đẩy vào', hu.reduce((s, h) => s + h.chip, 0) === 1400);
    ok('C không bao giờ ăn được hũ phụ', !(v.ketQua.an.C > 300), JSON.stringify(v.ketQua.an));
    ok('tổng chip không đẻ thêm không mất đi', tongChip(g) === 1400, String(tongChip(g)));
}

muc('CHIA HŨ LẺ CHIP + tiền người bỏ bài để lại');
{
    // D bỏ bài sau khi đã bỏ vào 10 chip. A, B, C mỗi người 25 và BẰNG BÀI hệt nhau
    // (bài chung ăn trọn). Hũ = 3×25 + 10 = 85, chia 3 không hết -> phải có chip lẻ.
    // Luật: chip lẻ về người ngồi gần bên TRÁI nút cái nhất. Sai chỗ này là đẻ/mất chip.
    const g = moi({ lichBlind: [{ sb: 10, bb: 20 }] });
    g.batDau(BON, 0);
    const G = g._trong, v = G.van;
    v.tay.A = ['2c', '3d']; v.tay.B = ['2h', '3s']; v.tay.C = ['4c', '5d']; v.tay.D = ['7h', '8s'];
    v.chung = ['10s', 'Jh', 'Qd', 'Kc', 'As'];   // sảnh đến A, ai cũng ăn bài chung
    v.vong = 'RIVER';
    for (const p of G.nguoi) p.chip = 100;
    v.daBo = new Set(['D']);
    v.cuoc = { A: 0, B: 0, C: 0, D: 0 };
    v.tongCuoc = { A: 25, B: 25, C: 25, D: 10 };
    v.muc = 0; v.toToiThieu = 20; v.daDi.clear(); v.luot = 'A';
    for (let i = 0; i < 3 && v.luot; i++) g.hanhDong(v.luot, 'theo', 0, 0);

    const an = v.ketQua.an;
    const tong = Object.values(an).reduce((a, b) => a + b, 0);
    ok('chia hết đúng 85 chip, không đẻ không mất', tong === 85, String(tong));
    ok('tiền của người BỎ BÀI vẫn nằm trong hũ', v.ketQua.hu.reduce((s, h) => s + h.chip, 0) === 85);
    ok('người bỏ bài KHÔNG được chia đồng nào', an.D === undefined, String(an.D));
    ok('ba người bằng bài chia gần đều (chênh đúng 1 chip lẻ)',
        Math.max(...['A', 'B', 'C'].map(x => an[x])) - Math.min(...['A', 'B', 'C'].map(x => an[x])) === 1,
        JSON.stringify(an));
    // Nút cái giờ NGẪU NHIÊN nên người sát trái có thể là D (đã bỏ bài, không được chia).
    // Luật đúng: chip lẻ về người ĐẦU TIÊN CÒN BÀI khi đi từ trái nút cái — tự tìm ra.
    let mong = null;
    for (let k = 1; k <= 4 && !mong; k++) {
        const id = G.nguoi[(G.nutCai + k) % 4].id;
        if (['A', 'B', 'C'].includes(id)) mong = id;
    }
    ok('chip lẻ về người CÒN BÀI sát bên trái nút cái nhất (bỏ qua người đã bỏ bài)',
        an[mong] === Math.max(an.A, an.B, an.C),
        'nút cái ' + G.nguoi[G.nutCai].id + ', mong ' + mong + ', chia ' + JSON.stringify(an));
    ok('cả ba đều được chấm là sảnh đến A',
        v.ketQua.lat.filter(x => x.cham.ten === 'Sảnh đến A').length === 3,
        v.ketQua.lat.map(x => x.id + '=' + x.cham.ten).join(' | '));
}

// ---------------------------------------------------------------- blind tăng
muc('mức blind tăng theo giờ');
{
    const g = moi({ phutMoiMuc: 10 });
    g.batDau(BON, 0);
    ok('mở giải ở mức 1', g.xemChung().mucBlind === 1);
    // đá hết ván 1
    const v = () => g._trong.van;
    ok('ván 1 đi hết được, không treo', theoHetVan(g));
    g.vanKe(9 * 60000);
    ok('chưa đủ 10 phút -> vẫn mức 1', g.xemChung().mucBlind === 1, String(g.xemChung().mucBlind));
    theoHetVan(g);
    g.vanKe(11 * 60000);
    ok('qua 10 phút -> lên mức 2 (50/100)',
        g.xemChung().mucBlind === 2 && g.xemChung().blind.bb === 100, JSON.stringify(g.xemChung().blind));
    theoHetVan(g);
    g.vanKe(45 * 60000);
    ok('nhảy thẳng 45 phút -> lên đúng mức 5, không nhảy lố',
        g.xemChung().mucBlind === 5, String(g.xemChung().mucBlind));
}
{
    const g = moi(); g.batDau(BON, 0);
    let loi = false;
    try { g.vanKe(0); } catch (e) { loi = true; }
    ok('ván chưa xong thì không mở ván mới được', loi);
}

muc('LÊN MỨC THEO VÒNG — đi giáp bàn là lên, dù chưa hết giờ');
{
    // ghim giờ cực xa để CHỈ còn luật vòng tác dụng
    const g = moi({ phutMoiMuc: 999999, vanToiThieuMoiMuc: 0 });
    g.batDau(BON, 0);
    const v = () => g._trong.van;
    const hetVan = (t) => { theoHetVan(g, t); if (g.xemChung().trangThai === 'DANG_CHAY') g.vanKe(t); };
    ok('mở giải ở mức 1', g.xemChung().mucBlind === 1);
    ok('báo còn 4 ván nữa hết vòng (4 người)', g.xemChung().vanConLai === 3, String(g.xemChung().vanConLai));
    hetVan(0); ok('sau ván 1 vẫn mức 1', g.xemChung().mucBlind === 1, String(g.xemChung().mucBlind));
    hetVan(0); ok('sau ván 2 vẫn mức 1', g.xemChung().mucBlind === 1);
    hetVan(0); ok('sau ván 3 vẫn mức 1', g.xemChung().mucBlind === 1);
    hetVan(0);
    ok('đủ 4 ván = giáp 1 vòng -> LÊN mức 2 (dù giờ chưa tới đâu)',
        g.xemChung().mucBlind === 2 && g.xemChung().blind.bb === 100,
        'mức ' + g.xemChung().mucBlind + ' · ' + JSON.stringify(g.xemChung().blind));
    ok('đếm vòng đặt lại từ đầu', g.xemChung().vanConLai === 3, String(g.xemChung().vanConLai));
}
{
    // hai luật chạy song song: hết GIỜ trước thì cũng lên, và đếm vòng phải đặt lại
    const g = moi({ phutMoiMuc: 10 });
    g.batDau(BON, 0);
    theoHetVan(g, 0); g.vanKe(11 * 60000);      // mới 1 ván nhưng đã quá 10 phút
    ok('hết giờ trước khi hết vòng -> vẫn lên mức', g.xemChung().mucBlind === 2, String(g.xemChung().mucBlind));
    // sàn mặc định 6 > 4 người, vừa lên mức và đã đánh 1 ván -> còn 6 - 1 = 5
    ok('lên bằng giờ thì cũng đặt lại đếm vòng (còn 5 = sàn 6 trừ 1 ván)',
        g.xemChung().vanConLai === 5, String(g.xemChung().vanConLai));
}
{
    // bàn ít người thì vòng ngắn -> blind leo nhanh -> giải chóng tàn (đúng ý chủ server)
    const g = moi({ phutMoiMuc: 999999, vanToiThieuMoiMuc: 0 });
    g.batDau([{ id: 'A' }, { id: 'B' }], 0);
    ok('2 người: vòng chỉ dài 2 ván', g.xemChung().vanConLai === 1, String(g.xemChung().vanConLai));
    theoHetVan(g, 0); g.vanKe(0);
    theoHetVan(g, 0); g.vanKe(0);
    ok('2 người chơi 2 ván là lên mức luôn', g.xemChung().mucBlind === 2, String(g.xemChung().mucBlind));
}
{
    // chạm mức chót thì dừng, không tràn khỏi bảng
    const g = moi({ phutMoiMuc: 999999, lichBlind: [{ sb: 10, bb: 20 }, { sb: 20, bb: 40 }] });
    g.batDau([{ id: 'A' }, { id: 'B' }], 0);
    for (let i = 0; i < 8 && g.xemChung().trangThai === 'DANG_CHAY'; i++) { theoHetVan(g, 0); g.vanKe(0); }
    const s = g.xemChung();
    ok('không vượt quá mức cuối của bảng', s.mucBlind === 2 && s.blind.bb === 40,
        'mức ' + s.mucBlind + ' · ' + JSON.stringify(s.blind));
    ok('tới mức chót thì báo cho người chơi biết', s.mucCuoiCung === true);
}

// ---------------------------------------------------------------- nút cái
muc('SÀN VÁN MỖI MỨC — bàn ít người không được lên blind quá nhanh');
{
    // Mô phỏng chỉ ra: không sàn thì 2 người cứ 2 ván lên một mức (~1 phút), giải tàn
    // trong 10 phút. Sàn mặc định 6: lên mức sau max(số người, 6) ván.
    const g = moi({ phutMoiMuc: 999999 });          // ghim giờ, để riêng luật vòng + sàn
    g.batDau(BON, 0);
    const hetVan = (t) => { theoHetVan(g, t); if (g.xemChung().trangThai === 'DANG_CHAY') g.vanKe(t); };
    ok('4 người: báo còn 5 ván (sàn 6 thắng số người 4)', g.xemChung().vanConLai === 5, String(g.xemChung().vanConLai));
    for (let i = 0; i < 4; i++) hetVan(0);
    ok('4 người đánh 4 ván (giáp vòng) VẪN mức 1 vì chưa đủ sàn 6', g.xemChung().mucBlind === 1, String(g.xemChung().mucBlind));
    hetVan(0); hetVan(0);
    ok('đủ 6 ván mới lên mức 2', g.xemChung().mucBlind === 2, String(g.xemChung().mucBlind));
}
{
    const g = moi({ phutMoiMuc: 999999 });
    g.batDau([{ id: 'A' }, { id: 'B' }], 0);
    for (let i = 0; i < 5; i++) { theoHetVan(g, 0); if (g.xemChung().trangThai === 'DANG_CHAY') g.vanKe(0); }
    ok('2 người đánh 5 ván vẫn mức 1 (trước đây 2 ván là lên)', g.xemChung().mucBlind === 1, String(g.xemChung().mucBlind));
}
{
    // bàn 8 người: sàn 6 < 8 nên vẫn theo vòng 8 ván, sàn không làm chậm bàn đông
    const g = moi({ phutMoiMuc: 999999 });
    g.batDau(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(x => ({ id: x })), 0);
    ok('8 người: báo còn 7 ván (theo vòng, không phải sàn)', g.xemChung().vanConLai === 7, String(g.xemChung().vanConLai));
}
{
    // thang blind phải leo tới >= tổng chip bàn, không thì bot chỉ-bỏ-bài treo giải vô hạn
    const { taoLichBlind, TOI_DA_NGUOI } = require('../giai.js');
    for (const chip of [2000, 5000, 10000, 20000, 100000]) {
        const l = taoLichBlind(chip);
        ok('thang ' + chip + ': BB đầu = 1% stack, BB cuối >= tổng chip 8 người',
            l[0].bb === chip / 100 && l[l.length - 1].bb >= chip * TOI_DA_NGUOI,
            l[0].bb + ' … ' + l[l.length - 1].bb + ' (cần >= ' + chip * TOI_DA_NGUOI + ')');
    }
}

muc('nút cái xoay + heads-up');
{
    const g = moi(); g.batDau(BON, 0);
    const v = () => g._trong.van;
    const nut1 = g.xemChung().nutCai;
    theoHetVan(g);
    g.vanKe(0);
    ok('sang ván mới nút cái đổi người', g.xemChung().nutCai !== nut1,
        nut1 + ' -> ' + g.xemChung().nutCai);
}
{
    const g = moi({ lichBlind: [{ sb: 25, bb: 50 }] });
    g.batDau([{ id: 'A' }, { id: 'B' }], 0);
    const s = g.xemChung();
    ok('2 người: vẫn đặt đủ blind 75', s.van.hu === 75, String(s.van.hu));
    ok('2 người: nút cái đi TRƯỚC ở preflop', s.van.luot === s.nutCai, s.van.luot + ' vs nút ' + s.nutCai);
}

// ---------------------------------------------------------------- chạy hết giải
muc('chạy trọn vẹn nhiều giải');
{
    let loi = 0, hangSai = 0, chipSai = 0, vanTong = 0;
    for (let lan = 0; lan < 60; lan++) {
        const g = moi({ phutMoiMuc: 1 });
        g.batDau(BON, 0);
        let t = 0, buoc = 0;
        try {
            while (g.xemChung().trangThai === 'DANG_CHAY' && buoc++ < 6000) {
                const v = g._trong.van;
                if (v && v.luot) {
                    // đánh ngẫu nhiên: 15% bỏ, 70% theo, 15% tố
                    const r = Math.random();
                    const canTheo = v.muc - v.cuoc[v.luot];
                    const toiDa = v.cuoc[v.luot] + g._trong.nguoi.find(p => p.id === v.luot).chip;
                    if (r < 0.15 && canTheo > 0) g.hanhDong(v.luot, 'bo', 0, t);
                    else if (r > 0.85 && toiDa > v.muc) {
                        g.hanhDong(v.luot, 'to', Math.min(toiDa, v.muc + v.toToiThieu), t);
                    } else g.hanhDong(v.luot, 'theo', 0, t);
                } else if (v && v.loDan) { t += 2000; g.nhip(t); }   // 18/09: cả bàn all-in -> đẩy nhịp cho lật hết
                else if (v && ['LAT', 'XONG'].includes(v.vong)) { vanTong++; t += 40000; g.vanKe(t); }
                else break;
            }
            if (tongChip(g) !== 20000) chipSai++;
            const kq = g.ketQua();
            if (kq.length !== 4 || new Set(kq.map(x => x.id)).size !== 4 ||
                kq.map(x => x.hang).join() !== '1,2,3,4') hangSai++;
        } catch (e) { loi++; if (loi === 1) console.log('       lỗi đầu tiên: ' + e.message); }
    }
    ok('60 giải chạy tới hết, không nổ lỗi nào', loi === 0, loi + ' giải lỗi');
    ok('tổng chip luôn = 20.000 ở mọi giải', chipSai === 0, chipSai + ' giải sai');
    ok('giải nào cũng ra đủ hạng 1-2-3-4, không trùng người', hangSai === 0, hangSai + ' giải sai');
    ok('có chạy thật (tổng số ván > 300)', vanTong > 300, String(vanTong));
}

muc('NGƯỜI ĐÃ CHÁY phải biết mình bị loại, hạng mấy');
{
    const g = moi(); g.batDau(BON, 0);
    const G = g._trong;
    // ép D cháy và rơi khỏi ván đang đánh
    G.nguoi.find(p => p.id === 'D').chip = 0;
    G.thuTuChay.push('D');
    G.van.thuTu = G.van.thuTu.filter(x => x !== 'D');
    delete G.van.tay.D; delete G.van.cuoc.D; delete G.van.tongCuoc.D;
    if (G.van.luot === 'D') G.van.luot = G.van.thuTu[0];

    const s = g.xem('D');
    ok('báo rõ ĐÃ CHÁY', s.toi.daChay === true);
    ok('biết mình về hạng 4 (cháy đầu tiên trong 4 người)', s.toi.hang === 4, String(s.toi.hang));
    ok('không còn bài', s.toi.la === null);
    ok('vẫn xem được diễn biến bàn', !!s.van && typeof s.van.hu === 'number');
    const sA = g.xem('A');
    ok('người còn sống thì daChay = false', sA.toi.daChay === false && sA.toi.hang === null,
        sA.toi.daChay + '/' + sA.toi.hang);
}

muc('thứ hạng');
{
    const g = moi({ phutMoiMuc: 1 });
    g.batDau(BON, 0);
    let t = 0, buoc = 0;
    while (g.xemChung().trangThai === 'DANG_CHAY' && buoc++ < 6000) {
        const v = g._trong.van;
        if (v && v.luot) g.hanhDong(v.luot, 'theo', 0, t);
        else if (v && v.loDan) { t += 2000; g.nhip(t); }   // 18/09: cả bàn all-in -> đẩy nhịp cho lật hết
        else if (v && ['LAT', 'XONG'].includes(v.vong)) { t += 40000; g.vanKe(t); }
        else break;
    }
    const kq = g.ketQua();
    ok('giải kết thúc', g.xemChung().trangThai === 'XONG');
    ok('hạng nhất là người còn chip', kq[0].chip > 0, JSON.stringify(kq));
    ok('hạng tư hết sạch chip', kq[3].chip === 0, JSON.stringify(kq));
    ok('xemChung() trả luôn kết quả khi xong', Array.isArray(g.xemChung().ketQua));
}

// ---------------------------------------------------------------- bàn 8 người
muc('BÀN 8 NGƯỜI (chủ server chốt tối đa 8)');
const TAM = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(x => ({ id: x, ten: 'Người ' + x }));
{
    const g = moi(); const s = g.batDau(TAM, 0);
    ok('mở được bàn 8 người', s.nguoi.length === 8);
    ok('tổng chip 8 × 5.000 = 40.000', tongChip(g) + s.van.hu === 40000, String(tongChip(g) + s.van.hu));
    ok('thứ tự đánh đủ 8 người', g._trong.van.thuTu.length === 8);
    ok('preflop đi đầu là người thứ 3 tính từ trái nút cái (UTG)',
        s.van.luot === g._trong.van.thuTu[2], s.van.luot + ' vs ' + g._trong.van.thuTu[2]);
    ok('mỗi người đúng 2 lá, tổng 16 lá không trùng',
        new Set(Object.values(g._trong.van.tay).flat()).size === 16);
}
{
    let loi = false;
    try { moi().batDau([...TAM, { id: 'I' }], 0); } catch (e) { loi = true; }
    ok('9 người thì chặn', loi);
    let loi2 = false;
    try { moi().batDau([{ id: 'A' }, { id: 'A' }], 0); } catch (e) { loi2 = true; }
    ok('một người ghi tên 2 lần thì chặn', loi2);
}
{
    // chạy trọn giải 8 người nhiều lần
    let loi = 0, chipSai = 0, hangSai = 0;
    for (let lan = 0; lan < 30; lan++) {
        const g = moi({ phutMoiMuc: 1 });
        g.batDau(TAM, 0);
        let t = 0, buoc = 0;
        try {
            while (g.xemChung().trangThai === 'DANG_CHAY' && buoc++ < 20000) {
                const v = g._trong.van;
                if (v && v.luot) {
                    const r = Math.random(), can = v.muc - v.cuoc[v.luot];
                    const toiDa = v.cuoc[v.luot] + g._trong.nguoi.find(p => p.id === v.luot).chip;
                    if (r < 0.2 && can > 0) g.hanhDong(v.luot, 'bo', 0, t);
                    else if (r > 0.88 && toiDa > v.muc) {
                        g.hanhDong(v.luot, 'to', Math.min(toiDa, v.muc + v.toToiThieu), t);
                    } else g.hanhDong(v.luot, 'theo', 0, t);
                } else if (v && v.loDan) { t += 2000; g.nhip(t); }   // 18/09: cả bàn all-in -> đẩy nhịp cho lật hết
                else if (v && v.loDan) { t += 2000; g.nhip(t); }   // 18/09: cả bàn all-in -> đẩy nhịp cho lật hết
        else if (v && ['LAT', 'XONG'].includes(v.vong)) { t += 40000; g.vanKe(t); }
                else break;
            }
            if (tongChip(g) !== 40000) chipSai++;
            const kq = g.ketQua();
            if (kq.length !== 8 || new Set(kq.map(x => x.id)).size !== 8 ||
                kq.map(x => x.hang).join() !== '1,2,3,4,5,6,7,8') hangSai++;
        } catch (e) { loi++; if (loi === 1) console.log('       lỗi đầu tiên: ' + e.message); }
    }
    ok('30 giải 8 người chạy tới hết, không nổ lỗi', loi === 0, loi + ' giải lỗi');
    ok('tổng chip luôn = 40.000', chipSai === 0, chipSai + ' giải sai');
    ok('giải nào cũng ra đủ hạng 1..8, không trùng người', hangSai === 0, hangSai + ' giải sai');
}

// ---------------------------------------------------------------- AFK
muc('RỚT MẠNG (AFK) — tự bỏ bài tới khi vào lại');
{
    const g = moi(); g.batDau(BON, 0);
    const v = g._trong.van;
    const keo = v.luot;
    g.roiMang(keo);
    ok('có cờ afk trong bản xem', g.xemChung().nguoi.find(p => p.id === keo).afk === true);
    g.nhip(0);                               // chưa hết giờ nhưng AFK -> xử ngay
    ok('AFK thì KHÔNG bắt cả bàn đợi hết 30 giây', v.luot !== keo, 'vẫn là ' + v.luot);
    ok('AFK bị bỏ bài (vì đang phải bỏ tiền theo)', v.daBo.has(keo));
}
{
    // Người AFK phải đóng blind như thường, nhưng KHÔNG BAO GIỜ tự bỏ thêm đồng nào.
    //
    // Đừng đo "chip tụt dần" — đo vậy là chập chờn: khi người AFK làm big blind mà cả
    // bàn chỉ theo thì lượt về họ MIỄN PHÍ, máy tự theo nên họ vẫn vào lật bài và có
    // thể thắng. Thứ luôn đúng là: tiền họ đẩy vào mỗi ván không bao giờ vượt quá
    // tiền blind bắt buộc của ván đó.
    const g = moi({ phutMoiMuc: 999999, vanToiThieuMoiMuc: 0 }); g.batDau(BON, 0);
    g.roiMang('A');
    let t = 0, quaTay = 0, soVanBo = 0, soVan = 0;
    for (let van = 0; van < 40 && g.xemChung().trangThai === 'DANG_CHAY'; van++) {
        let n = 0;
        while (g._trong.van.luot && n++ < 200) {
            g.nhip(t + 99999);
            if (g._trong.van.luot) g.hanhDong(g._trong.van.luot, 'theo', 0, t);
        }
        while (g._trong.van.loDan && n++ < 210) g.nhip(t += 2000);   // 18/09: lật từ từ khi cả bàn all-in
        const v = g._trong.van, bl = g.xemChung().blind;
        if (v.tongCuoc.A !== undefined) {
            soVan++;
            if (v.tongCuoc.A > bl.bb) quaTay++;      // đẩy quá tiền blind = sai
            if (v.daBo.has('A')) soVanBo++;
        }
        t += 1000; if (g.xemChung().trangThai === 'DANG_CHAY') g.vanKe(t);
    }
    ok('AFK không bao giờ tự bỏ thêm tiền ngoài blind bắt buộc', quaTay === 0,
        quaTay + '/' + soVan + ' ván đẩy quá tay');
    ok('AFK bỏ bài ở phần lớn các ván', soVanBo > soVan * 0.5, soVanBo + '/' + soVan + ' ván bỏ bài');
    // Ngưỡng để thấp vì luật LÊN MỨC THEO VÒNG làm giải tàn sớm: ghim giờ cực xa
    // cũng không ngăn được blind leo mỗi 4 ván, nên hiếm khi chạy quá ~30 ván.
    ok('có chạy đủ ván để phép đo có nghĩa', soVan >= 20, String(soVan));
}
{
    // Việc thứ hai, đo riêng: cả bàn AFK hết thì giải vẫn TỰ chạy tới hết, không treo.
    // Phải để blind lên bình thường, nếu ghim blind thì ván nào cũng huề, giải chạy mãi.
    const g = moi({ phutMoiMuc: 1 }); g.batDau(BON, 0);
    for (const id of ['A', 'B', 'C', 'D']) g.roiMang(id);
    let t = 0, buoc = 0;
    while (g.xemChung().trangThai === 'DANG_CHAY' && buoc++ < 5000) {
        const v = g._trong.van;
        if (v && v.luot) g.nhip(t);
        else if (v && v.loDan) { t += 2000; g.nhip(t); }   // 18/09: cả bàn all-in -> đẩy nhịp cho lật hết
        else if (v && ['LAT', 'XONG'].includes(v.vong)) { t += 40000; g.vanKe(t); }
        else break;
    }
    ok('cả bàn AFK -> giải vẫn tự chạy tới hết, không treo',
        g.xemChung().trangThai === 'XONG', 'dừng ở ' + g.xemChung().trangThai + ' sau ' + buoc + ' bước');
    ok('vẫn ra đủ thứ hạng 1-2-3-4', g.ketQua().length === 4 &&
        g.ketQua().map(x => x.hang).join() === '1,2,3,4', JSON.stringify(g.ketQua()));
}
{
    const g = moi(); g.batDau(BON, 0);
    g.roiMang('A'); g.noiLai('A');
    ok('vào lại thì hết cờ afk', g.xemChung().nguoi.find(p => p.id === 'A').afk === false);
    const v = g._trong.van;
    const keo = v.luot;
    g.nhip(0);
    ok('không ai AFK, chưa hết giờ -> không xử ai', v.luot === keo);
    let loi = false;
    try { g.roiMang('KHONG_CO'); } catch (e) { loi = true; }
    ok('đánh dấu người không tồn tại thì báo lỗi', loi);
}

// ---------------------------------------------------------------- tạm ngưng
muc('TẠM NGƯNG — đông cứng cả 2 đồng hồ');
{
    const g = moi({ giayMoiLuot: 30, phutMoiMuc: 10 }); g.batDau(BON, 0);
    const v = g._trong.van;
    const keo = v.luot, hanCu = v.hanChot, mucCu = g._trong.gioLenMuc;
    g.tamNghi('Khoa', 10000);
    ok('bản xem báo đang nghỉ + ai bấm', g.xemChung().nghi === true && g.xemChung().nghiBoi === 'Khoa');
    g.nhip(10 * 60000);
    ok('đang nghỉ thì nhịp KHÔNG xử ai dù trôi 10 phút', v.luot === keo && !v.daBo.has(keo));
    let loi = false;
    try { g.hanhDong(v.luot, 'theo', 0, 10 * 60000); } catch (e) { loi = true; }
    ok('đang nghỉ thì không ai đánh được', loi);
    g.choiTiep(10000 + 5 * 60000);          // nghỉ đúng 5 phút
    ok('hết nghỉ', g.xemChung().nghi === false);
    ok('giờ suy nghĩ được cộng bù đúng 5 phút', v.hanChot === hanCu + 5 * 60000,
        (v.hanChot - hanCu) + 'ms');
    ok('giờ lên blind cũng được cộng bù 5 phút', g._trong.gioLenMuc === mucCu + 5 * 60000);
    ok('tổng thời gian nghỉ được ghi lại', g.xemChung().tongNghiMs === 5 * 60000);
    g.hanhDong(v.luot, 'theo', 0, 10000 + 5 * 60000);
    ok('chơi tiếp được bình thường', v.luot !== keo);
}
{
    // nghỉ 20 phút mà không bù giờ thì blind sẽ nhảy 2 mức - kiểm đúng chỗ đó
    const g = moi({ phutMoiMuc: 10 }); g.batDau(BON, 0);
    const v = () => g._trong.van;
    g.tamNghi(null, 1000);
    g.choiTiep(1000 + 20 * 60000);
    theoHetVan(g, 1000 + 20 * 60000);
    g.vanKe(1000 + 20 * 60000);
    ok('nghỉ 20 phút KHÔNG làm blind nhảy mức', g.xemChung().mucBlind === 1,
        'mức ' + g.xemChung().mucBlind);
}
{
    const g = moi(); g.batDau(BON, 0);
    g.tamNghi(null, 0);
    ok('bấm nghỉ 2 lần không sao', g.tamNghi(null, 5000).nghi === true);
    ok('bấm chơi tiếp khi không nghỉ cũng không sao', (g.choiTiep(6000), g.choiTiep(7000).nghi === false));
}

muc('KHOE BÀI — mỗi ván 1 lá, cả bàn xem 4 giây rồi tự đóng');
{
    const g = moi(); g.batDau(BON, 0);
    const v = g._trong.van;
    const baiA = v.tay.A.slice();
    // Khoe bài chạy theo ĐỒNG HỒ THẬT (hết hạn sau 4 giây), nên ở đây không dùng
    // mốc giờ giả như mấy phép đo khác — dùng giả thì lá coi như hết hạn ngay.
    let s = g.khoeBai('A', 1);
    ok('khoe được 1 lá', s.van.khoe.length === 1, JSON.stringify(s.van.khoe));
    ok('khoe đúng lá mình chọn (lá thứ 2)',
        s.van.khoe[0].la === baiA[1] && s.van.khoe[0].i === 1, JSON.stringify(s.van.khoe[0]));
    ok('lá kia KHÔNG lộ', JSON.stringify(s).indexOf('"' + baiA[0] + '"') < 0, baiA[0]);
    ok('cả bàn đều thấy (nằm trong bản xemChung)',
        g.xemChung().van.khoe.length === 1);
    ok('người khác cũng thấy lá đó', g.xem('B').van.khoe[0].la === baiA[1]);
    let loi = false;
    try { g.khoeBai('A', 0); } catch (e) { loi = true; }
    ok('khoe lá thứ 2 trong cùng ván thì bị chặn', loi);
    ok('có ghi nhận A đã dùng lượt khoe', g.xemChung().van.daKhoe.indexOf('A') >= 0);

    // hết 4 giây thì tự biến mất — đẩy lùi mốc hết hạn thay vì ngồi chờ thật
    ok('hạn đúng 4 giây kể từ lúc khoe',
        Math.abs(v.khoe.A.den - Date.now() - 4000) < 1500, String(v.khoe.A.den - Date.now()));
    v.khoe.A.den = Date.now() - 1;
    ok('quá hạn thì lá tự rút khỏi danh sách', g.xemChung().van.khoe.length === 0,
        JSON.stringify(g.xemChung().van.khoe));
    ok('nhưng vẫn tính là ĐÃ DÙNG lượt khoe', g.xemChung().van.daKhoe.indexOf('A') >= 0);
    let loi2 = false;
    try { g.khoeBai('A', 0); } catch (e) { loi2 = true; }
    ok('hết hạn rồi cũng không được khoe thêm lá nữa', loi2);
}
{
    const g = moi(); g.batDau(BON, 0);
    let l1 = false, l2 = false, l3 = false;
    try { g.khoeBai('A', 5); } catch (e) { l1 = true; }
    ok('chỉ khoe được lá 0 hoặc 1', l1);
    try { g.khoeBai('KHONG_CO', 0); } catch (e) { l2 = true; }
    ok('người không có bài trong ván thì không khoe được', l2);
    // người đã bỏ bài VẪN khoe được (khoe con bài vừa bỏ cũng là một kiểu chơi)
    const v = g._trong.van;
    g.hanhDong(v.luot, 'bo', 0, 0);
    const daBo = [...v.daBo][0];
    try { g.khoeBai(daBo, 0); } catch (e) { l3 = true; }
    ok('người đã BỎ BÀI vẫn khoe được', !l3);
}
{
    // ván mới thì được khoe lại từ đầu
    const g = moi(); g.batDau(BON, 0);
    g.khoeBai('A', 0);
    theoHetVan(g, 0); g.vanKe(0);
    ok('sang ván mới thì hết lá khoe cũ', g.xemChung().van.khoe.length === 0);
    ok('và được khoe lại 1 lá mới', g.khoeBai('A', 1).van.khoe.length === 1);
}

muc('XIN NGHỈ phải CẢ BÀN ĐỒNG Ý, mỗi người 1 lần');
{
    const g = moi(); g.batDau(BON, 0);
    let s = g.xinNghi('A', 1000);
    ok('xin xong chưa nghỉ ngay, còn chờ phiếu', s.nghi === false && !!s.xinNghi);
    ok('người xin được tính là đã đồng ý', s.xinNghi.dongY.join() === 'A');
    ok('còn chờ đúng 3 người kia', s.xinNghi.conCho.sort().join() === 'B,C,D', s.xinNghi.conCho.join());
    s = g.dongYNghi('B', 1000); ok('B đồng ý -> vẫn chưa nghỉ', s.nghi === false);
    s = g.dongYNghi('C', 1000); ok('C đồng ý -> vẫn chưa nghỉ', s.nghi === false);
    s = g.dongYNghi('D', 1000);
    ok('người CUỐI đồng ý -> nghỉ thật', s.nghi === true && s.nghiBoi === 'A');
    ok('hết đề nghị treo', s.xinNghi === null);
}
{
    const g = moi(); g.batDau(BON, 0);
    g.xinNghi('A', 0); g.dongYNghi('B', 0);
    const s = g.tuChoiNghi('C', 0);
    ok('một người từ chối là tan đề nghị', s.xinNghi === null && s.nghi === false);
    ok('A ĐÃ MẤT lượt xin dù bị từ chối (chống câu giờ)',
        s.nguoi.find(p => p.id === 'A').conLuotXinNghi === false);
    let loi = false;
    try { g.xinNghi('A', 0); } catch (e) { loi = true; }
    ok('A xin lần 2 thì bị chặn', loi);
    ok('B vẫn còn lượt xin của mình', s.nguoi.find(p => p.id === 'B').conLuotXinNghi === true);
    ok('B xin được và bắt đầu vòng phiếu mới', !!g.xinNghi('B', 0).xinNghi);
}
{
    const g = moi(); g.batDau(BON, 0);
    g.xinNghi('A', 0);
    let loi = false;
    try { g.xinNghi('B', 0); } catch (e) { loi = true; }
    ok('đang chờ phiếu thì không ai xin chen ngang', loi);
}
{
    // người rớt mạng KHÔNG được tính phiếu, nếu tính thì cả bàn không bao giờ nghỉ được
    const g = moi(); g.batDau(BON, 0);
    g.roiMang('D');
    const s0 = g.xinNghi('A', 0);
    ok('không chờ phiếu của người rớt mạng', !s0.xinNghi.conCho.includes('D'), s0.xinNghi.conCho.join());
    g.dongYNghi('B', 0);
    const s = g.dongYNghi('C', 0);
    ok('3 người có mặt đồng ý là nghỉ được, không kẹt vì người AFK', s.nghi === true);
}
{
    const g = moi(); g.batDau(BON, 0);
    let loi1 = false, loi2 = false, loi3 = false;
    try { g.dongYNghi('A', 0); } catch (e) { loi1 = true; }
    ok('không có đề nghị mà bấm đồng ý thì báo lỗi', loi1);
    try { g.xinNghi('KHONG_CO', 0); } catch (e) { loi2 = true; }
    ok('người lạ xin nghỉ thì báo lỗi', loi2);
    g._trong.nguoi.find(p => p.id === 'D').chip = 0;
    try { g.xinNghi('D', 0); } catch (e) { loi3 = true; }
    ok('người đã cháy không xin nghỉ được', loi3);
}

// ---------------------------------------------------------------- nhãn việc vừa làm (18/09)
muc('nhãn việc vừa làm (vuaLam) - cả bàn thấy ai vừa tố/theo/bỏ');
{
    const g = moi();
    let s = g.batDau(BON, 0);
    const v = () => g._trong.van;
    const nhan = (st, id) => st.nguoi.find(p => p.id === id).vuaLam;
    ok('đầu ván chưa ai có nhãn (blind không tính là hành động)', s.nguoi.every(p => p.vuaLam === null));
    const L1 = v().luot;
    s = g.hanhDong(L1, 'to', 200, 0);
    ok('tố tới 200 -> nhãn "to", tiền = TỔNG cược tới 200', nhan(s, L1) && nhan(s, L1).viec === 'to' && nhan(s, L1).tien === 200, JSON.stringify(nhan(s, L1)));
    ok('nhãn không mang cờ máy khi người tự bấm', !nhan(s, L1).may);
    const L2 = v().luot, phaiTheo = v().muc - v().cuoc[L2];
    s = g.hanhDong(L2, 'theo', 0, 0);
    ok('theo -> nhãn "theo", tiền = số vừa đẩy (' + phaiTheo + ')', nhan(s, L2).viec === 'theo' && nhan(s, L2).tien === phaiTheo, JSON.stringify(nhan(s, L2)));
    const L3 = v().luot;
    s = g.hanhDong(L3, 'bo', 0, 0);
    ok('bỏ bài -> nhãn "bo" và daBo', nhan(s, L3).viec === 'bo' && s.nguoi.find(p => p.id === L3).daBo);
    ok('nhãn của người tố vẫn còn nguyên khi người khác đang đi', nhan(s, L1).viec === 'to');
    let n = 0;
    while (v().vong === 'PREFLOP' && v().luot && n++ < 20) g.hanhDong(v().luot, 'theo', 0, 0);
    s = g.xemChung();
    ok('sang FLOP thì nhãn vòng cũ xoá sạch', s.van.vong === 'FLOP' && s.nguoi.every(p => p.vuaLam === null), s.van.vong + ' ' + JSON.stringify(s.nguoi.map(p => p.vuaLam)));
    ok('...nhưng người đã bỏ vẫn giữ cờ daBo (web tự vẽ "Bỏ bài")', s.nguoi.find(p => p.id === L3).daBo);
    const L4 = v().luot;
    s = g.nhip(1e9);   // hết giờ suy nghĩ -> máy đánh giùm
    ok('hết giờ, miễn phí -> máy XEM giùm, nhãn mang cờ máy', nhan(s, L4) && nhan(s, L4).viec === 'xem' && nhan(s, L4).may === true, JSON.stringify(nhan(s, L4)));
    // all-in: người còn ít chip nhất tố hết
    const g2 = moi();
    g2.batDau(BON, 0);
    const v2 = g2._trong.van, La = v2.luot;
    const s2 = g2.hanhDong(La, 'to', v2.cuoc[La] + g2._trong.nguoi.find(p => p.id === La).chip, 0);
    ok('tố hết chip -> nhãn "allin"', nhan(s2, La).viec === 'allin' && g2._trong.nguoi.find(p => p.id === La).chip === 0, JSON.stringify(nhan(s2, La)));
}

// ---------------------------------------------------------------- lật từ từ khi cả bàn all-in (18/09)
muc('cả bàn all-in ngay preflop -> lật flop / turn / river từng nhịp, không chốt một cục');
{
    const g = moi({ lichBlind: [{ sb: 10, bb: 20 }] });
    let s = g.batDau([{ id: 'A', ten: 'A' }, { id: 'B', ten: 'B' }], 0);
    const v = () => g._trong.van;
    const L1 = v().luot, L2 = L1 === 'A' ? 'B' : 'A';
    g.hanhDong(L1, 'to', v().cuoc[L1] + g._trong.nguoi.find(p => p.id === L1).chip, 0);   // all-in
    s = g.hanhDong(L2, 'theo', 0, 0);
    ok('cả 2 all-in preflop: vẫn PREFLOP, 0 lá chung, loDan bật, không ai tới lượt',
        s.van.vong === 'PREFLOP' && s.van.chung.length === 0 && s.van.loDan === true && s.van.luot === null, JSON.stringify([s.van.vong, s.van.chung.length, s.van.loDan, s.van.luot]));
    let loi = '';
    try { g.hanhDong(L1, 'theo', 0, 0); } catch (e) { loi = e.message; }
    ok('đang lật thì không ai đánh được nữa', /all-in/.test(loi), loi);
    s = g.nhip(1000);
    ok('chưa tới mốc (1,6s) -> chưa lật gì', s.van.vong === 'PREFLOP' && s.van.chung.length === 0);
    s = g.nhip(1700);
    ok('mốc 1: FLOP 3 lá', s.van.vong === 'FLOP' && s.van.chung.length === 3, s.van.vong + ' ' + s.van.chung.length);
    s = g.nhip(3400);
    ok('mốc 2: TURN 4 lá', s.van.vong === 'TURN' && s.van.chung.length === 4, s.van.vong + ' ' + s.van.chung.length);
    s = g.nhip(5100);
    ok('mốc 3: RIVER 5 lá, vẫn CHƯA chốt (để lá river kịp lật trên màn)', s.van.vong === 'RIVER' && s.van.chung.length === 5 && !s.van.ketQua, s.van.vong);
    s = g.nhip(6800);
    ok('mốc 4: chốt ván -> LAT, có ketQua, có bài lật của cả 2, loDan tắt',
        s.van.vong === 'LAT' && s.van.ketQua && s.van.ketQua.lat && s.van.ketQua.lat.length === 2 && s.van.loDan === false, s.van.vong);
    ok('5 lá làm nên bài (cham.nam) có đủ cho web tô vàng', s.van.ketQua.lat.every(z => z.cham && Array.isArray(z.cham.nam) && z.cham.nam.length === 5));
    ok('tổng chip không đẻ không mất', tongChip(g) === 2 * 5000, String(tongChip(g)));
    // giayLoDan = 0 -> luật cũ: chốt ngay một cục (đường tắt cho bộ kiểm)
    const g0 = moi({ lichBlind: [{ sb: 10, bb: 20 }], giayLoDan: 0 });
    g0.batDau([{ id: 'A' }, { id: 'B' }], 0);
    const v0 = g0._trong.van, M1 = v0.luot, M2 = M1 === 'A' ? 'B' : 'A';
    g0.hanhDong(M1, 'to', v0.cuoc[M1] + g0._trong.nguoi.find(p => p.id === M1).chip, 0);
    const s0 = g0.hanhDong(M2, 'theo', 0, 0);
    ok('giayLoDan = 0 -> chốt ngay như trước', ['LAT', 'XONG'].includes(s0.van.vong) && s0.van.chung.length === 5, s0.van.vong);
}

muc('tên tay 2 lá preflop (toi.tenTay)');
{
    const g = moi();
    g.batDau(BON, 0);
    const v = g._trong.van;
    v.tay.A = ['As', 'Ad']; v.tay.B = ['Kh', 'Qh']; v.tay.C = ['9c', '4s']; v.tay.D = ['10s', 'Jd'];
    ok('đôi A -> "Đôi A"', g.xem('A').toi.tenTay === 'Đôi A', g.xem('A').toi.tenTay);
    ok('K-Q cùng cơ -> "K-Q đồng chất"', g.xem('B').toi.tenTay === 'K-Q đồng chất', g.xem('B').toi.tenTay);
    ok('9-4 khác chất -> "9-4 lệch chất" (lá lớn đứng trước)', g.xem('C').toi.tenTay === '9-4 lệch chất', g.xem('C').toi.tenTay);
    ok('10-J -> "J-10 lệch chất" (J lớn hơn 10)', g.xem('D').toi.tenTay === 'J-10 lệch chất', g.xem('D').toi.tenTay);
    ok('preflop chưa có cham (chưa đủ 5 lá)', g.xem('A').toi.cham === null);
}

console.log('\n🏆 MÁY TRẠNG THÁI GIẢI: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
