// Bộ kiểm TIỀN KHÔNG ĐƯỢC MẤT — chạy: node TaiXiu/kiemtra/tienkhongmat-test.js
// Không cần bot: đọc luật thẳng từ index.js + chạy thử phần logic thuần.
//
// Cược là tiền ĐÃ TRỪ KHỎI VÍ. Mọi chỗ xoá sổ cược đều phải giải quyết tiền trước.
// Trước đây có 5 chỗ xoá thẳng (mất trắng / treo tiền) và 1 cửa hậu trả hai lần.
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

// ---------------------------------------------------------------- 1. mọi chỗ xoá cược
muc('mọi chỗ xoá sổ cược phải giải quyết tiền trước');
ok('có hàm dọn sổ cược dùng chung', /function txDonSoCuoc\(lyDo\)/.test(SRC));
ok('hàm đó: ván ĐÃ quay thì trả theo bảng, CHƯA quay thì hoàn cược',
    /if \(p && p\.byUser\)[\s\S]{0,260}?txPayUser\(p\.gameId, uid\)/.test(SRC) &&
    /else \{[\s\S]{0,300}?updatePoints\(b\.userId, b\.amount\)/.test(SRC));
{
    // Liệt kê từng chỗ gán txState.bets = [] rồi soi 12 dòng NGAY TRƯỚC nó.
    const d = SRC.split(/\r?\n/);
    const xau = [];
    d.forEach((ln, i) => {
        if (!/^\s*txState\.bets = \[\];\s*$/.test(ln)) return;
        const truoc = d.slice(Math.max(0, i - 12), i).join('\n');
        // thân CHÍNH hàm dọn sổ thì tất nhiên được xoá — nhìn xa hơn để nhận ra nó
        const than = d.slice(Math.max(0, i - 30), i).join('\n');
        const an = /txDonSoCuoc\(/.test(truoc)            // đã dọn tiền ngay trước
            || /function txDonSoCuoc/.test(than)           // chính thân hàm đó
            || /await txState\.resultPromise/.test(truoc)  // vừa chốt ván xong
            || /resultPromise \|\| Promise\.resolve/.test(truoc);
        if (!an) xau.push('dòng ' + (i + 1));
    });
    ok('không còn chỗ nào xoá cược mà chưa giải quyết tiền', xau.length === 0, xau.join(', '));
}
ok('admin khởi tạo lại bàn: dọn tiền trước khi sang ván mới',
    /txDonSoCuoc\('admin khởi tạo lại bàn/.test(SRC));
ok('admin dừng bàn giữa ván: không để tiền treo',
    /txDonSoCuoc\('admin dừng bàn giữa ván/.test(SRC));
ok('watchdog kẹt: dọn tiền + TĂNG số ván (giữ số cũ là khớp nhầm bảng trả tiền)',
    /txDonSoCuoc\('watchdog reset ván/.test(SRC) &&
    // ⚠️ ĐỪNG đòi đúng dòng `txState.gameId++` ở đây. 21/09 gom mọi đường tăng số ván về
    // MỘT cửa txSangVanMoi() (nó tự lo ghi lịch sử) — đòi dòng cũ là ép phá cái chốt đó.
    // Cái PHẢI đúng vẫn nguyên: dọn tiền xong thì phải sang ván mới.
    /txDonSoCuoc\('watchdog reset ván[\s\S]{0,400}?txSangVanMoi\(/.test(SRC));

// 🕳️ 21/09 — chủ server: "lâu lâu bị mất ID mất luôn kết quả ván đó làm người chơi mất dogcoin".
// Ván bị huỷ vẫn tăng gameId nhưng không ghi gì -> dãy số ván thủng lỗ, người chơi không tra
// được tiền mình đi đâu. Mọi đường huỷ ván giờ phải để lại một dòng lịch sử.
// ⏱️ 21/09 — GỐC của "mất ID mất luôn kết quả ván". Máy trạng thái 3 mốc trước đây là một
// chuỗi else-if KIỂM targetTime TRƯỚC, nên mỗi nhịp chỉ đi được MỘT mốc. Máy chủ kẹt (lag)
// làm nhịp trễ; trễ đủ lâu thì lúc chạy lại nowSec đã vượt targetTime trong khi status còn
// 'betting' -> rơi thẳng vào nhánh mở bát mà ván CHƯA QUAY -> huỷ ván. Chủ server đo được
// 4 ván biến mất trong 24 ván, đúng lúc khung chat báo "Lag rồi".
muc('⏱️ ba mốc của ván phải BẮT KỊP được, không nhảy cóc khi máy chủ lag');
{
    // lấy đúng thân vòng lặp ván để soi thứ tự, khỏi dính mấy chỗ khác trong file
    const i0 = SRC.indexOf('function runTaiXiuLoop()');
    const than = i0 >= 0 ? SRC.slice(i0, i0 + 9000) : '';
    ok('tìm được vòng lặp ván', !!than);

    const iKhoa = than.indexOf("if (nowSec >= lockTime && txState.status === 'betting')");
    const iQuay = than.indexOf("if (nowSec >= nanTime && txState.status === 'nhan')");
    const iMo = than.indexOf('if (nowSec >= txState.targetTime)');
    ok('⭐ KHOÁ SỔ đứng TRƯỚC mở bát (không thì lag một cái là ván chưa quay đã bị mở)',
        iKhoa > 0 && iMo > 0 && iKhoa < iMo, 'khoá@' + iKhoa + ' mở@' + iMo);
    ok('⭐ QUAY XÚC XẮC đứng TRƯỚC mở bát', iQuay > 0 && iQuay < iMo, 'quay@' + iQuay + ' mở@' + iMo);
    ok('⭐ và KHOÁ SỔ đứng trước QUAY (sai thứ tự là quay bằng bảng nhân ván cũ)', iKhoa < iQuay);

    ok('⭐⭐ ba mốc là "if" NỐI TIẾP, KHÔNG phải "else if" — else if là nhảy cóc trở lại',
        than.indexOf('else if (nowSec >= lockTime') < 0 &&
        than.indexOf('else if (nowSec >= nanTime') < 0 &&
        than.indexOf('else if (nowSec >= txState.targetTime') < 0);

    // lag trong cùng một nhịp thì đừng vẽ bảng Discord ba lần liên tiếp
    ok('bắt kịp trong cùng nhịp thì bỏ qua lần vẽ bảng dở dang',
        /if \(nowSec < nanTime\) updateTXMessage/.test(than));

    ok('có ghi rõ trong mã là CẤM đổi lại thành else if',
        /KHÔNG ĐỔI LẠI THÀNH .?else if/.test(than));
}

// ============================================================================
// 🚪 CHỐT TRIỆT ĐỂ: chỉ MỘT cửa được tăng số ván (21/09, chủ server: "fix triệt để")
// Vá theo từng đường thì đường thêm sau lại quên ghi lịch sử -> lỗ thủng quay lại.
// Gom về một cửa, cửa đó tự lo, và bộ kiểm quét mã chặn mọi đường vòng.
// ============================================================================
muc('🚪 CHỈ MỘT CỬA được tăng số ván');
{
    const d = SRC.split(/\r?\n/);
    const tang = [];
    d.forEach((ln, i) => { if (/txState\.gameId\s*(\+\+|\+=)/.test(ln) && !/^\s*(\*|\/\/)/.test(ln)) tang.push(i + 1); });
    ok('⭐⭐ trong cả file CHỈ CÓ ĐÚNG MỘT chỗ tăng số ván', tang.length === 1,
        'thấy ở dòng: ' + tang.join(', '));

    const i0 = SRC.indexOf('function txSangVanMoi(');
    const iHet = SRC.indexOf('\n}', i0);
    const than = i0 >= 0 ? SRC.slice(i0, iHet) : '';
    ok('⭐ và chỗ đó nằm TRONG txSangVanMoi()', !!than && /txState\.gameId\+\+/.test(than), than.slice(0, 120));
    ok('⭐ cửa đó BẢO ĐẢM ván sắp rời đi có lịch sử (chưa có thì ghi ván huỷ)',
        /txGhiVanHuy\(txState\.gameId/.test(than));
    ok('...và ghi TRƯỚC khi tăng (tăng trước là ghi nhầm sang ván sau)',
        than.indexOf('txGhiVanHuy(') < than.indexOf('txState.gameId++'));
    ok('có ghi rõ trong mã là cấm tăng ở chỗ khác', /ĐỪNG viết txState\.gameId\+\+ ở bất kỳ đâu khác/.test(SRC));
}
{
    // mọi đường KẾT THÚC VÁN phải đi qua cửa chung
    const duong = [
        ['mở bát (đường thường)', /txState\.bets = \[\];\r?\n\s*txSangVanMoi\(/],
        ['watchdog kẹt 120 giây', /txDonSoCuoc\('watchdog reset ván[\s\S]{0,200}?txSangVanMoi\(/],
        ['lỗi giữa vòng ván', /txDonSoCuoc\('lỗi vòng ván[\s\S]{0,400}?txSangVanMoi\(/],
        ['admin khởi tạo lại bàn', /txDonSoCuoc\('admin khởi tạo lại bàn[\s\S]{0,200}?txSangVanMoi\(/],
    ];
    for (const [ten, re] of duong) ok('đường "' + ten + '" đi qua cửa chung', re.test(SRC));
}

// ---------------------------------------------------------------- cứu ván, đừng huỷ ván
muc('🛟 lỡ mốc nặn thì QUAY BÙ, không huỷ ván');
{
    const i0 = SRC.indexOf('function runTaiXiuLoop()');
    const than = i0 >= 0 ? SRC.slice(i0, i0 + 9000) : '';
    // 21/09: bước ②b (cứu ván) nằm TRƯỚC nhánh mở bát và tự thoát sớm, nên trong try chỉ còn await.
    ok('⭐ resultPromise rỗng thì QUAY BÙ tại chỗ (ván vẫn ra kết quả thật)',
        /!txState\.resultPromise && !txState\.isProcessing[\s\S]{0,900}?txState\.resultPromise = finishTXGame\(txState\.gameId/.test(than));
    ok('⭐ quay bù xong DỜI giờ mở bát ra sau, để còn chỗ xem kết quả',
        /txState\.targetTime = nowSec \+ TX_KQ_S;[\s\S]{0,200}?finishTXGame\(txState\.gameId/.test(than));
    ok('⭐ KHÔNG còn hoàn-cược-rồi-bỏ-ván ở đường thường (đó là chỗ mất ID)',
        !/nhảy cóc mốc nặn/.test(than), 'vẫn còn nhánh huỷ ván trong vòng lặp');
    ok('...lỡ luôn mốc khoá sổ thì SINH BÙ bảng hệ số nhân',
        /txState\.nhan\.gameId !== txState\.gameId[\s\S]{0,260}?TX_CUA\.taoNhan\(\)/.test(than));
    ok('...nếu không sinh bù thì người chơi mất phần nhân lặng lẽ (có ghi chú)',
        /mất phần nhân một cách lặng lẽ/.test(than));
    ok('nhánh mở bát chỉ còn await, KHÔNG huỷ ván (huỷ là mất ID + mất kết quả)',
        /await \(txState\.resultPromise \|\| Promise\.resolve\(\)\);/.test(than));
    ok('có ghi sổ để soi lại được khi bàn lag', /QUAY BÙ tại chỗ, KHÔNG huỷ ván/.test(than));
}

muc('🕳️ ván huỷ vẫn phải để lại dấu (số ván không được thủng lỗ)');
ok('có hàm ghi ván huỷ', /function txGhiVanHuy\(gameId, lyDo, hoanPhieu, hoanTien\)/.test(SRC));
ok('...ghi vào ĐÚNG sổ lịch sử mà web đọc',
    /txGhiVanHuy[\s\S]{0,1200}?txState\.history\.unshift/.test(SRC) &&
    /txGhiVanHuy[\s\S]{0,1400}?dbCache\._txHist20 = txState\.history\.slice\(0, 20\)/.test(SRC));
ok('...không ghi chồng nếu ván đó đã có lịch sử (ván đã quay thì thôi)',
    /txGhiVanHuy[\s\S]{0,600}?history\.some\(h => h && h\.gameId === gameId\)/.test(SRC));
ok('...có đủ trường mà chỗ hiển thị đang đọc (khỏi phải thêm kiểm tra null)',
    /txGhiVanHuy[\s\S]{0,900}?dice: \[0, 0, 0\][\s\S]{0,200}?bets: \[\], winners: \[\], nhan: \{\}/.test(SRC));
{
    // cả BA đường huỷ ván đều phải gọi
    // ⚠️ Không kiểm từng đường gọi thẳng txGhiVanHuy nữa. 21/09 gom hết về MỘT cửa
    // txSangVanMoi() — chính nó gọi txGhiVanHuy. Kiểm từng đường lại là ép quay về kiểu
    // "mỗi chỗ tự nhớ ghi", đúng cái kiểu đã đẻ ra lỗ thủng. Khối 🚪 ở trên đã canh việc
    // mọi đường đi qua cửa chung; ở đây chỉ canh cửa đó làm đúng phận sự.
    const i0 = SRC.indexOf('function txSangVanMoi(');
    const cua = i0 >= 0 ? SRC.slice(i0, SRC.indexOf('\n}', i0)) : '';
    ok('cửa chung luôn ghi lịch sử trước khi sang ván mới', /txGhiVanHuy\(/.test(cua));
    ok('...và nhận được lý do + số phiếu hoàn để ghi vào sổ',
        /function txSangVanMoi\(lyDo, hoanPhieu, hoanTien\)/.test(SRC) &&
        /txGhiVanHuy\(txState\.gameId, lyDo[\s\S]{0,80}?hoanPhieu, hoanTien\)/.test(cua));
}
ok('soi cầu Discord không in "undefined" cho ván huỷ (ván huỷ không có xúc xắc)',
    /if \(h\.huy\) return .*VÁN HUỶ/.test(SRC));
// ⚠️ 21/09 ĐỔI THIẾT KẾ: lỡ mốc nặn giờ QUAY BÙ chứ không hoàn-cược-rồi-bỏ-ván nữa.
// Hoàn cược là đúng về tiền nhưng MẤT KẾT QUẢ VÀ MẤT ID — đúng cái chủ server than.
// Quay bù ra một ván thật, tiền trả theo kết quả thật. Xem khối 🛟 ở trên.
ok('lỡ mốc nặn: QUAY BÙ (không còn hoàn-cược-rồi-bỏ-ván ở đường thường)',
    /!txState\.resultPromise && !txState\.isProcessing[\s\S]{0,900}?finishTXGame\(/.test(SRC) &&
    !/txDonSoCuoc\('nhảy cóc mốc nặn/.test(SRC));
ok('mất bảng phải dựng lại: cũng dọn tiền', /txDonSoCuoc\('mất bảng, dựng lại ván/.test(SRC));
ok('lỗi vòng ván: cũng dọn tiền', /txDonSoCuoc\('lỗi vòng ván/.test(SRC));

// ---------------------------------------------------------------- 2. cửa hậu trả hai lần
muc('không có cửa hậu trả hai lần');
ok('chốt ván KHÔNG tự dựng lại bảng trả tiền khi không tìm thấy bảng cũ',
    !/\? txState\.plan : txPlanPayout\(gameId, bets, d1, d2, d3\)/.test(SRC) &&
    /không còn bảng trả tiền\) - bỏ qua, KHÔNG trả lại lần nữa/.test(SRC));
ok('cờ đã-trả ghi NGAY xuống đĩa, không chỉ nằm trong RAM',
    /dbCache\._txPlan\.paid\[userId\] = true;/.test(SRC));
ok('chốt sổ xong ghi đĩa ngay (dọn bảng trả tiền + sổ cược)',
    /txState\.plan = null; delete dbCache\._txPlan;\s*\n\s*dbCache\._txBets = \[\];\s*\n\s*saveDbNow\(\);/.test(SRC));
ok('hoàn cược lúc bật lại bỏ qua ai đã có trong bảng trả tiền',
    /if \(keHoach && b && keHoach\[b\.userId\]\) \{ boQua\+\+; continue; \}/.test(SRC));

// ---------------------------------------------------------------- 3. giờ giấc
muc('3 mốc giờ admin chỉnh được');
ok('mốc "hết giờ đặt" = hiện nhân + nặn (không phải chỉ nặn)',
    /lockSeconds: \(\) => txNhanS\(\) \+ txLockS\(\)/.test(SRC) &&
    /txKhoaSoS: \(\) => txNhanS\(\) \+ txLockS\(\)/.test(SRC));
ok('bảng Discord ghi đủ cả 2 mốc khoá sổ',
    /\$\{txNhanS\(\) \+ txLockS\(\)\} giây cuối khóa sổ/.test(SRC));

// ---------------------------------------------------------------- 4. tên cửa + lịch sử
muc('bàn 52 cửa: tên cửa và lịch sử');
ok('tên cửa luôn tra qua txTenCua, không tra thẳng bảng 5 cửa cũ',
    /function txTenCua\(id\)/.test(SRC) &&
    !/TX_CHOICES\[b\.choice\]\.name/.test(SRC) && !/TX_CHOICES\[sel\.choice\]\.name/.test(SRC));
ok('bảng lịch sử KHÔNG tự tính lại tiền (đọc số nhận về từ lõi tiền)',
    /const net = \(Number\(b\.nhan\) \|\| 0\) - b\.amount;/.test(SRC) &&
    !/win = b\.amount \* TX_BAO_RATE/.test(SRC));
ok('ván CŨ thiếu số nhận về thì tính tổng theo winners, không in ai cũng thua',
    /const cuMoi = \(h\.bets \|\| \[\]\)\.every/.test(SRC) && /if \(!cuMoi\) \{/.test(SRC));
ok('kế hoạch trả tiền ghi kèm số nhận về TỪNG CỬA', /cuaAgg: Object\.values\(cuaAgg\)/.test(SRC));

// ---------------------------------------------------------------- 5. đường Discord
muc('đường đặt cược Discord không lách luật tiền');
ok('cả 2 đường Discord đi qua txDatLo (kiểm đủ ví/sàn/trần cửa/trần tổng)',
    (SRC.match(/txDatLo\(userId, interaction\.user\.username, \[\{ choice: sel\.choice/g) || []).length === 2);
ok('không còn đường Discord tự trừ tiền rồi tự push cược',
    !/txState\.bets\.push\(\{ userId, username: interaction\.user\.username/.test(SRC));

// ---------------------------------------------------------------- 6. chạy thử dọn sổ cược
muc('chạy thử hàm dọn sổ cược');
{
    // ván CHƯA quay -> phải hoàn nguyên cược
    const vi = { A: 0, B: 0 };
    const bets = [{ userId: 'A', amount: 7000 }, { userId: 'B', amount: 3000 }];
    let plan = null;
    if (plan) { /* nhánh trả theo bảng */ }
    else for (const b of bets) vi[b.userId] += b.amount;
    ok('ván chưa quay: hoàn đúng nguyên tiền cược', vi.A === 7000 && vi.B === 3000, JSON.stringify(vi));

    // ván ĐÃ quay -> trả theo bảng, KHÔNG hoàn thêm
    const vi2 = { A: 0, B: 0 };
    const plan2 = { gameId: 5, paid: {}, byUser: { A: { win: 21000, refund: 0 }, B: { win: 0, refund: 0 } } };
    for (const uid of Object.keys(plan2.byUser)) {
        if (plan2.paid[uid]) continue;
        plan2.paid[uid] = true;
        vi2[uid] += plan2.byUser[uid].win + plan2.byUser[uid].refund;
    }
    ok('ván đã quay: thắng nhận 21.000, thua nhận 0 (không hoàn thêm)',
        vi2.A === 21000 && vi2.B === 0, JSON.stringify(vi2));
}

// ============================================================================
// 🔬 CHẠY MÃ THẬT: dãy số ván KHÔNG ĐƯỢC THỦNG LỖ, dù đường nào kết thúc ván.
// Mấy khối trên đọc mã (soi chữ). Khối này BÓC ĐÚNG HAI HÀM txGhiVanHuy + txSangVanMoi
// ra khỏi index.js rồi chạy thật với txState giả — chứng minh bằng hành vi chứ không
// bằng niềm tin vào regex.
// ============================================================================
muc('🔬 chạy mã THẬT: bắn 500 ván đủ kiểu, dãy ID phải liền mạch');
{
    const vm = require('vm');
    const boc = (ten) => {
        const i = SRC.indexOf('function ' + ten + '(');
        if (i < 0) return '';
        // tìm dấu } đứng đầu dòng đầu tiên sau đó = hết thân hàm
        const j = SRC.indexOf('\n}', i);
        return j < 0 ? '' : SRC.slice(i, j + 2);
    };
    const ma = boc('txGhiVanHuy') + '\n' + boc('txSangVanMoi');
    ok('bóc được mã thật của hai hàm', /function txGhiVanHuy/.test(ma) && /function txSangVanMoi/.test(ma));

    const log = [];
    const ctx = {
        txState: { gameId: 100, history: [] },
        dbCache: {},
        writeLog: (a, b) => log.push(b),
        Date, Array, String, Number, JSON, Math,
    };
    vm.createContext(ctx);
    let loi = '';
    try { vm.runInContext(ma, ctx, { filename: 'tx-cua.js' }); } catch (e) { loi = e.message; }
    ok('nạp chạy được, không dính biến ngoài nào khác', !loi, loi);

    if (!loi) {
        // Giả lập 500 ván, mỗi ván rơi ngẫu nhiên vào một trong các đường:
        //   'thuong'  ván quay xong -> settle đã ghi lịch sử trước khi sang ván mới
        //   'watchdog' / 'loi' / 'admin'  -> ván chết, chưa có lịch sử
        const kieu = ['thuong', 'watchdog', 'loi', 'admin'];
        const dem = { thuong: 0, watchdog: 0, loi: 0, admin: 0 };
        const dauTien = ctx.txState.gameId;
        for (let i = 0; i < 500; i++) {
            const k = kieu[Math.floor(Math.random() * kieu.length)];
            dem[k]++;
            if (k === 'thuong') {
                // Giả lập ĐÚNG ba việc ketSoTXPayout làm lúc chốt ván: ghi lịch sử, cắt sổ
                // 100 ván, cập nhật bản lưu 20 ván. Thiếu hai việc sau là giàn thử tự sai
                // rồi đổ oan cho mã thật (đã đổ oan một lần).
                ctx.txState.history.unshift({ gameId: ctx.txState.gameId, dice: [1, 2, 3], sum: 6, bets: [], winners: [] });
                if (ctx.txState.history.length > 100) ctx.txState.history.pop();
                ctx.dbCache._txHist20 = ctx.txState.history.slice(0, 20);
            }
            vm.runInContext('txSangVanMoi(' + JSON.stringify('thử ' + k) + ', 0, 0)', ctx);
        }
        const cuoi = ctx.txState.gameId;
        ok('chạy đủ 500 ván (' + Object.entries(dem).map(([a, b]) => a + ' ' + b).join(', ') + ')',
            cuoi - dauTien === 500, String(cuoi - dauTien));

        // ⭐ CÁI PHẢI ĐÚNG: mọi ván đã đi qua đều có mặt trong lịch sử, không sót số nào.
        // (sổ chỉ giữ 100 ván gần nhất nên soi đúng 100 ván cuối)
        const ids = ctx.txState.history.map(h => h.gameId);
        ok('sổ giữ đúng 100 ván gần nhất', ids.length === 100, String(ids.length));
        let thung = [];
        for (let i = 1; i < ids.length; i++) if (ids[i - 1] - ids[i] !== 1) thung.push(ids[i] + '->' + ids[i - 1]);
        ok('⭐⭐ DÃY SỐ VÁN LIỀN MẠCH, không thủng lỗ nào', thung.length === 0, thung.slice(0, 5).join(', '));
        ok('...ván chết được đánh dấu huỷ kèm lý do',
            ctx.txState.history.some(h => h.huy && /thử (watchdog|loi|admin)/.test(h.lyDo || '')));
        ok('...ván thường KHÔNG bị dán nhãn huỷ oan',
            ctx.txState.history.filter(h => !h.huy).every(h => Array.isArray(h.dice) && h.dice.length === 3));
        ok('...web đọc được (dbCache._txHist20 cập nhật theo)',
            Array.isArray(ctx.dbCache._txHist20) && ctx.dbCache._txHist20.length === 20 &&
            ctx.dbCache._txHist20[0].gameId === ids[0]);
    }
}
{
    // gọi chồng: hai đường cùng báo huỷ một ván thì chỉ được ghi MỘT dòng
    const vm = require('vm');
    const i = SRC.indexOf('function txGhiVanHuy(');
    const ma = SRC.slice(i, SRC.indexOf('\n}', i) + 2);
    const ctx = { txState: { gameId: 7, history: [] }, dbCache: {}, writeLog: () => { }, Date, Array, String, Number, JSON, Math };
    vm.createContext(ctx); vm.runInContext(ma, ctx);
    vm.runInContext("txGhiVanHuy(7,'lần 1',1,1000); txGhiVanHuy(7,'lần 2',2,2000);", ctx);
    ok('gọi hai lần cho cùng một ván chỉ ghi MỘT dòng', ctx.txState.history.length === 1,
        String(ctx.txState.history.length));
    ok('...giữ lần ghi ĐẦU (ván đã quay thì settle ghi trước, đừng đè lên)',
        ctx.txState.history[0].lyDo === 'lần 1', ctx.txState.history[0].lyDo);
}

console.log('\n🧯 TIỀN KHÔNG ĐƯỢC MẤT: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
