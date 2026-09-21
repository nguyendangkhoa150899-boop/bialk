// ============================================================================
//  Bộ kiểm MẠCH VÁN — chạy: node TaiXiu/kiemtra/nhipvan-test.js   (không cần bot)
//
//  Chủ server dặn 21/09:
//    "thời gian đặt xong -> khóa cược -> hiển số nhân -> cho người chơi nặn.
//     logic tổng quát là vậy, KHÔNG ĐƯỢC THIẾU CÁI NÀO.
//     không được ngưng, không được mất ván, không được chưa show kết quả đã qua ván khác"
//
//  File này canh đúng bốn điều đó:
//     ① ĐỦ MỐC   — bốn mốc đều tồn tại và đều có thời lượng thật (không mốc nào 0 giây)
//     ② ĐÚNG THỨ TỰ — khoá sổ -> quay -> mở bát, và ba bước phải BẮT KỊP được khi lag
//     ③ KHÔNG NGƯNG — mọi đường kẹt đều có lối ra
//     ④ KHÔNG MẤT VÁN / KHÔNG NUỐT KẾT QUẢ — luôn chừa chỗ xem kết quả trước ván sau
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'BotDoMin', 'index.js'), 'utf8');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

const so = (ten) => {
    const m = SRC.match(new RegExp('const ' + ten + '\\s*=\\s*(\\d+)')) ||
        SRC.match(new RegExp(ten + '\\s*=\\s*(\\d+)'));
    return m ? Number(m[1]) : null;
};
const i0 = SRC.indexOf('function runTaiXiuLoop()');
// ⚠️ 11.000 chứ không phải 9.000: dòng `}, 1000);` đóng vòng lặp nằm ở khoảng 10.180.
// Cắt ngắn là mấy phép kiểm cuối trượt mà tưởng mã sai (đã tưởng một lần).
const VONG = i0 >= 0 ? SRC.slice(i0, i0 + 11000) : '';

// ---------------------------------------------------------------- ① ĐỦ BỐN MỐC
muc('① BỐN MỐC ĐỀU PHẢI CÓ THẬT (đặt → khoá sổ → hiện nhân → nặn)');
{
    const BET_MIN = so('TX_BET_S_MIN'), NHAN_MIN = so('TX_NHAN_S_MIN'), NAN_MIN = so('TX_NAN_S_MIN');
    const KQ = so('TX_KQ_S');
    ok('đọc được cả 4 hằng số biên', [BET_MIN, NHAN_MIN, NAN_MIN, KQ].every(x => x != null),
        JSON.stringify({ BET_MIN, NHAN_MIN, NAN_MIN, KQ }));

    ok('mốc ĐẶT CƯỢC không thể bằng 0', BET_MIN >= 1, 'sàn = ' + BET_MIN);
    // ⚠️ Từng để 0 với chú thích "0 = tắt hẳn pha hiện nhân". Đặt 0 thì lockTime === nanTime:
    // khoá sổ và quay xúc xắc rơi CÙNG MỘT GIÂY -> cả bàn không kịp nhìn bảng hệ số nhân.
    ok('⭐ mốc HIỆN SỐ NHÂN không thể bằng 0 (thiếu mốc là sai mạch ván)',
        NHAN_MIN >= 2, 'sàn = ' + NHAN_MIN);
    ok('mốc NẶN không thể bằng 0', NAN_MIN >= 1, 'sàn = ' + NAN_MIN);
    ok('⭐ mốc NẶN còn phải chừa đủ ' + KQ + ' giây cuối cho bàn tự mở kết quả',
        NAN_MIN >= KQ + 2, NAN_MIN + ' < ' + (KQ + 2));
    ok('không còn chú thích "0 = tắt hẳn pha hiện nhân"', !/0 = tắt hẳn pha hiện nhân/.test(SRC));

    // số admin đặt nằm ngoài khoảng thì phải LÙI VỀ MẶC ĐỊNH, không được nhận bừa
    ok('số ngoài khoảng thì txTimeCfg() lùi về mặc định (không nhận bừa)',
        /nhan: Number\.isFinite\(h\) && h >= TX_NHAN_S_MIN && h <= TX_NHAN_S_MAX \? Math\.floor\(h\) : TX_NHAN_S_DEF/.test(SRC));
    ok('panel đặt giờ cũng kiểm đủ cả ba mốc',
        /nhan < TX_NHAN_S_MIN \|\| nhan > TX_NHAN_S_MAX/.test(SRC) &&
        /bet < TX_BET_S_MIN \|\| bet > TX_BET_S_MAX/.test(SRC) &&
        /nan < TX_NAN_S_MIN \|\| nan > TX_NAN_S_MAX/.test(SRC));
    ok('ván = đặt + hiện nhân + nặn (không quên cộng mốc nào)',
        /function txRoundS\(\) \{ const c = txTimeCfg\(\); return c\.bet \+ c\.nhan \+ c\.nan; \}/.test(SRC));
}

// ---------------------------------------------------------------- ② ĐÚNG THỨ TỰ + BẮT KỊP
muc('② ĐÚNG THỨ TỰ, và lag thì BẮT KỊP chứ không nhảy cóc');
{
    ok('tìm được vòng lặp ván', !!VONG);
    const iKhoa = VONG.indexOf("if (nowSec >= lockTime && txState.status === 'betting')");
    const iQuay = VONG.indexOf("if (nowSec >= nanTime && txState.status === 'nhan')");
    const iMo = VONG.indexOf('if (nowSec >= txState.targetTime) {');
    ok('⭐ thứ tự trong mã: KHOÁ SỔ → QUAY → MỞ BÁT',
        iKhoa > 0 && iQuay > iKhoa && iMo > iQuay, 'khoá@' + iKhoa + ' quay@' + iQuay + ' mở@' + iMo);
    ok('⭐⭐ ba bước là "if" NỐI TIẾP (else if = mỗi nhịp chỉ đi được một mốc = nhảy cóc)',
        VONG.indexOf('else if (nowSec >= lockTime') < 0 &&
        VONG.indexOf('else if (nowSec >= nanTime') < 0 &&
        VONG.indexOf('else if (nowSec >= txState.targetTime') < 0);
    ok('mốc khoá sổ tính từ mốc quay lùi lại đúng số giây hiện nhân',
        /const nanTime = txState\.targetTime - txLockS\(\);/.test(VONG) &&
        /const lockTime = nanTime - txNhanS\(\);/.test(VONG));
    ok('khoá sổ xong là CẤM đặt ngay (status khác betting thì mọi đường đặt đều chặn)',
        /txState\.status !== 'betting'[\s\S]{0,200}?Đã khoá sổ/.test(SRC));
    ok('bảng hệ số nhân sinh ĐÚNG LÚC KHOÁ SỔ, trước khi quay',
        /txState\.status = 'nhan';[\s\S]{0,200}?txState\.nhan = \{ gameId: txState\.gameId, o: TX_CUA\.taoNhan\(\)/.test(VONG));
    ok('...và gắn đúng số ván (ván sau sinh bảng khác, không được dùng nhầm)',
        /txState\.nhan\.gameId === gameId/.test(SRC));
}

// ---------------------------------------------------------------- ③ KHÔNG NGƯNG
muc('③ BÀN KHÔNG ĐƯỢC NGƯNG — mọi đường kẹt phải có lối ra');
{
    ok('mất bảng Discord giữa chừng -> tự dựng lại', /if \(!txState\.message && txState\.channel && !txState\.isProcessing\)/.test(VONG));
    ok('kẹt cờ isProcessing -> watchdog tự gỡ', /Date\.now\(\) - txState\.processingStart > 120000/.test(VONG));
    ok('lỗi giữa vòng ván -> catch dựng lại mốc giờ + mở lại cửa đặt',
        /txDonSoCuoc\('lỗi vòng ván[\s\S]{0,700}?txState\.targetTime = Math\.floor\(Date\.now\(\) \/ 1000\) \+ txRoundS\(\);[\s\S]{0,160}?txState\.status = 'betting';/.test(VONG));
    ok('mọi lối ra của nhánh mở bát đều nhả cờ isProcessing',
        /txState\.isProcessing = false;\s*\r?\n\s*txState\.processingStart = 0;/.test(VONG));
    ok('lỗi khâu ghi chép KHÔNG được làm chết vòng ván (tiền đã trả xong)',
        /LỖI GHI SỔ TX/.test(SRC) && /ketSoTXPayout\(gameId, bets, d1, d2, d3, p\);/.test(SRC));
    ok('vòng lặp chạy mỗi giây', /\}, 1000\);/.test(VONG));
}

// ---------------------------------------------------------------- ④ KHÔNG NUỐT KẾT QUẢ
muc('④ CHƯA SHOW KẾT QUẢ THÌ KHÔNG ĐƯỢC QUA VÁN KHÁC');
{
    ok('⭐ trễ mốc quay -> DỜI giờ mở bát ra sau, chừa chỗ xem kết quả',
        /if \(nowSec >= txState\.targetTime - TX_KQ_S\) txState\.targetTime = nowSec \+ TX_KQ_S;/.test(VONG));
    ok('⭐ cứu ván (lỡ hẳn mốc nặn) cũng dời giờ mở bát, không chốt ngay',
        /!txState\.resultPromise && !txState\.isProcessing[\s\S]{0,900}?txState\.targetTime = nowSec \+ TX_KQ_S;/.test(VONG));
    ok('...cứu ván xong thoát sớm để nhịp sau mở bát theo đường thường',
        /txState\.resultPromise = finishTXGame\(txState\.gameId[\s\S]{0,200}?return;/.test(VONG));
    ok('máy chốt ván ngủ tới đúng giờ mở bát rồi mới trả tiền',
        /const revealAtMs = txState\.targetTime \* 1000;[\s\S]{0,200}?if \(waitMs > 0\) await new Promise/.test(SRC));
    ok('KHÔNG còn đường huỷ ván trong vòng lặp (huỷ = mất ID + mất kết quả)',
        !/txDonSoCuoc\('nhảy cóc mốc nặn/.test(SRC));
    ok('cửa sổ nặn mở đúng ván đang chạy', /txState\.nan = \{ gameId, dice: \[d1, d2, d3\]/.test(SRC));
}

// ---------------------------------------------------------------- MÔ PHỎNG LAG
// Mô hình lại đúng máy trạng thái ở trên rồi bắn lag ngẫu nhiên. Mô hình chỉ đáng tin khi
// nó khớp mã thật — mấy phép kiểm ② ở trên canh việc đó (thứ tự + "if" nối tiếp + công thức
// mốc giờ). Ở đây đo thứ mà đọc mã không thấy được: CHẠY RA có ván nào thiếu mốc không.
muc('🔬 mô phỏng 3.000 ván với lag ngẫu nhiên tới 40 giây');
{
    const BET = 30, NHAN = 4, NAN = 20, KQ = 4;
    const sai = { thieuKhoaSo: 0, thieuNhan: 0, thieuQuay: 0, nuotKetQua: 0, mat: 0 };
    let soVan = 0, lanLag = 0;
    const ids = [];

    let gameId = 100, status = 'betting', target = BET + NHAN + NAN, promise = null, nhanCua = -1;
    let t = 0;
    const MOC = {};   // gameId -> { khoa, quay, mo }

    for (let buoc = 0; buoc < 200000 && soVan < 3000; buoc++) {
        // nhịp 1 giây, thỉnh thoảng máy chủ kẹt vài chục giây
        const lag = Math.random() < 0.05 ? 1 + Math.floor(Math.random() * 40) : 1;
        if (lag > 1) lanLag++;
        t += lag;

        const nanTime = target - NAN, lockTime = nanTime - NHAN;
        // ① khoá sổ
        if (t >= lockTime && status === 'betting') {
            status = 'nhan'; nhanCua = gameId;
            (MOC[gameId] = MOC[gameId] || {}).khoa = t;
        }
        // ② quay
        if (t >= nanTime && status === 'nhan') {
            status = 'ending';
            if (t >= target - KQ) target = t + KQ;          // ⬅ chừa chỗ xem kết quả
            promise = { gameId, nhan: nhanCua === gameId };
            (MOC[gameId] = MOC[gameId] || {}).quay = t;
        }
        // ②b cứu ván
        if (t >= target && !promise) {
            if (nhanCua !== gameId) { nhanCua = gameId; (MOC[gameId] = MOC[gameId] || {}).khoa = t; }
            status = 'ending'; target = t + KQ;
            promise = { gameId, nhan: true };
            (MOC[gameId] = MOC[gameId] || {}).quay = t;
            continue;
        }
        // ③ mở bát
        if (t >= target) {
            const m = MOC[gameId] || {};
            m.mo = t;
            if (m.khoa == null) sai.thieuKhoaSo++;
            if (m.quay == null) sai.thieuQuay++;
            if (!promise || !promise.nhan) sai.thieuNhan++;
            if (m.quay != null && m.mo - m.quay < 1) sai.nuotKetQua++;   // không kịp xem kết quả
            ids.push(gameId);
            soVan++;
            target = t + BET + NHAN + NAN;
            status = 'betting'; promise = null; gameId++;
        }
    }

    ok('chạy được 3.000 ván (có ' + lanLag + ' lần lag)', soVan === 3000, String(soVan));
    ok('⭐ không ván nào THIẾU mốc khoá sổ', sai.thieuKhoaSo === 0, String(sai.thieuKhoaSo));
    ok('⭐ không ván nào THIẾU mốc hiện số nhân', sai.thieuNhan === 0, String(sai.thieuNhan));
    ok('⭐ không ván nào THIẾU mốc quay xúc xắc', sai.thieuQuay === 0, String(sai.thieuQuay));
    ok('⭐⭐ không ván nào bị NUỐT KẾT QUẢ (mở bát cách lúc quay ≥ 1 giây)',
        sai.nuotKetQua === 0, String(sai.nuotKetQua));
    let thung = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] - ids[i - 1] !== 1) thung++;
    ok('⭐⭐ dãy số ván LIỀN MẠCH, không mất ván nào', thung === 0, String(thung));
}

console.log('\n⏱️  MẠCH VÁN TÀI XỈU: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
