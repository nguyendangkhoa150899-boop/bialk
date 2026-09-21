// Bộ kiểm đầu-cuối bàn Sic Bo trên BOT TEST đang chạy (cổng 4002 / panel 4508).
//   node Desktop/bialk-test.js 4        (bật bot test trước)
//   node TaiXiu/kiemtra/web-test.js
//
// Kiểm bằng HTTP thật: 3 mốc giờ, bảng nhân chỉ lộ SAU khi khoá sổ, cấm đặt ở pha
// hiện nhân, trần từng cửa, giỏ cược hợp lệ hết mới trừ tiền.
'use strict';
const http = require('http');
const WEB = 4002, PANEL = 4508;
const UID = '111111111111111111', PIN = '123456';

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');
const ngu = (ms) => new Promise(r => setTimeout(r, ms));

function goi(port, duong, than, token) {
    return new Promise((xong) => {
        const d = than ? JSON.stringify(than) : null;
        const r = http.request({
            host: '127.0.0.1', port, path: duong, method: d ? 'POST' : 'GET',
            timeout: 8000,
            headers: Object.assign({ 'Content-Type': 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {},
                d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
        }, (rs) => {
            let b = '';
            rs.on('data', c => b += c);
            rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } xong({ ma: rs.statusCode, j, tho: b }); });
        });
        r.on('timeout', () => { r.destroy(); xong({ ma: 0, j: null, tho: 'timeout' }); });
        r.on('error', e => xong({ ma: 0, j: null, tho: String(e) }));
        if (d) r.write(d);
        r.end();
    });
}

(async () => {
    const lg = await goi(WEB, '/api/login', { userId: UID, pin: PIN });
    if (!lg.j || !lg.j.ok) { console.log('❌ Bot test chưa chạy? (bật bằng: node Desktop/bialk-test.js 4)'); process.exit(1); }
    const T = lg.j.token;
    const pl = await goi(PANEL, '/api/login', { password: '' });
    const PT = pl.j && pl.j.token;

    // ván ngắn cho bộ kiểm chạy nhanh: 8s đặt + 2s nhân + 6s nặn
    // (nặn tối thiểu 6s vì 4 giây cuối là lúc bàn tự mở kết quả)
    muc('ba mốc giờ (admin set)');
    const t1 = await goi(PANEL, '/api/tx/time', { bet: 8, nhan: 2, nan: 6 }, PT);
    ok('admin đặt được 3 mốc', t1.j && t1.j.ok && t1.j.bet === 8 && t1.j.nhan === 2 && t1.j.nan === 6, JSON.stringify(t1.j));
    ok('ván = tổng 3 mốc (8+2+6=16)', t1.j && t1.j.round === 16, t1.j && String(t1.j.round));
    const xau = await goi(PANEL, '/api/tx/time', { bet: 8, nhan: 999, nan: 6 }, PT);
    ok('giây hiện nhân quá ngưỡng thì chặn', xau.ma === 400, String(xau.ma));
    const nganQua = await goi(PANEL, '/api/tx/time', { bet: 8, nhan: 2, nan: 4 }, PT);
    ok('nặn ngắn hơn 6s bị chặn (không đủ chỗ cho 4 giây tự mở)', nganQua.ma === 400, String(nganQua.ma));

    muc('trần cược từng cửa (5 nhóm)');
    const tr = await goi(PANEL, '/api/tx/tran', { tran: { deu: 200000, vua: 50000, cao: 20000, hiem: 10000, cuchiem: 5000 } }, PT);
    ok('admin lưu được 5 nhóm trần', tr.j && tr.j.ok, tr.j && tr.j.error);
    ok('panel báo lại thắng tối đa từng nhóm', tr.j && tr.j.thangToiDa && tr.j.thangToiDa.cuchiem === 4995000,
        tr.j && JSON.stringify(tr.j.thangToiDa));
    const trXau = await goi(PANEL, '/api/tx/tran', { tran: { deu: 0 } }, PT);
    ok('trần 0 bị chặn', trXau.ma === 400, String(trXau.ma));

    // ---------------------------------------------------------------- chờ pha đặt
    muc('một ván trọn vẹn: đặt -> hiện nhân -> nặn');
    let s = null;
    for (let i = 0; i < 200; i++) {
        s = (await goi(WEB, '/api/state', {}, T)).j;
        if (s && s.phase === 'bet' && (s.secsToBet === undefined || s.secsToBet > 3)) break;
        await ngu(300);
    }
    ok('bắt được pha ĐẶT CƯỢC', s && s.phase === 'bet', s && s.phase);
    ok('bảng 52 cửa gửi kèm', s && s.txCua && s.txCua.length === 52, s && s.txCua && String(s.txCua.length));
    ok('CHƯA lộ hệ số nhân lúc đang đặt', s && s.txNhan === null, JSON.stringify(s && s.txNhan));
    ok('hũ Bão đã bỏ (txPot = 0)', s && s.txPot === 0, String(s && s.txPot));

    const vi0 = s.balance;
    const dat = await goi(WEB, '/api/bet', {
        gio: [{ choice: 'tai', amount: 5000 }, { choice: 'tong9', amount: 2000 },
              { choice: 'bao3', amount: 1000 }, { choice: 'don5', amount: 1500 }],
    }, T);
    ok('đặt cả giỏ 4 cửa một lần', dat.j && dat.j.ok && dat.j.soCua === 4, dat.j && (dat.j.error || JSON.stringify(dat.j)));
    ok('trừ đúng tổng 9.500', dat.j && dat.j.ok && (vi0 - dat.j.balance) === 9500, dat.j && String(vi0 - dat.j.balance));

    const qua = await goi(WEB, '/api/bet', { gio: [{ choice: 'bao3', amount: 9000 }] }, T);
    ok('vượt trần cửa Bão (5.000) thì chặn', qua.ma === 400 && /tối đa/i.test(qua.j.error || ''), qua.j && qua.j.error);
    const viSau = (await goi(WEB, '/api/state', {}, T)).j.balance;
    ok('giỏ bị chặn thì KHÔNG trừ đồng nào', viSau === dat.j.balance, viSau + ' vs ' + dat.j.balance);

    const lai = await goi(WEB, '/api/bet', { gio: [{ choice: 'tai', amount: 1000 }, { choice: 'khong_co_cua', amount: 1000 }] }, T);
    ok('một cửa bậy thì HỎNG CẢ GIỎ, không đặt nửa vời', lai.ma === 400, lai.j && lai.j.error);
    const viSau2 = (await goi(WEB, '/api/state', {}, T)).j.balance;
    ok('giỏ có cửa bậy cũng không trừ đồng nào', viSau2 === viSau, viSau2 + ' vs ' + viSau);

    // ---------------------------------------------------------------- pha hiện nhân
    let sn = null;
    for (let i = 0; i < 300; i++) {
        sn = (await goi(WEB, '/api/state', {}, T)).j;
        if (sn && sn.phase === 'nhan') break;
        await ngu(200);
    }
    ok('bắt được pha HIỆN NHÂN', sn && sn.phase === 'nhan', sn && sn.phase);
    ok('lúc này MỚI lộ bảng nhân', sn && sn.txNhan && typeof sn.txNhan === 'object', JSON.stringify(sn && sn.txNhan));
    {
        const ids = Object.keys((sn && sn.txNhan) || {});
        ok('có ít nhất 1 ô sáng', ids.length >= 1, String(ids.length) + ' ô');
        ok('4 cửa đều tiền KHÔNG bao giờ sáng',
            !ids.some(x => ['tai', 'xiu', 'chan', 'le'].includes(x)), ids.join(','));
        const cua = {}; (sn.txCua || []).forEach(c => { cua[c.id] = c; });
        const xauN = ids.filter(x => !cua[x] || sn.txNhan[x] > cua[x].max || sn.txNhan[x] <= cua[x].goc);
        ok('mọi hệ số nằm trong khoảng in trên bàn (> gốc, <= tối đa)', xauN.length === 0, xauN.join(','));
    }
    const chan = await goi(WEB, '/api/bet', { gio: [{ choice: 'tai', amount: 1000 }] }, T);
    ok('pha hiện nhân CẤM đặt', chan.ma === 400 && /nhân|khoá|khóa/i.test(chan.j.error || ''), chan.j && chan.j.error);

    // 🔒 CHỐNG SOI BÀI: người chơi mở F12 xoá cái chén cũng không được lợi gì, vì máy
    // chủ CHƯA quay xúc xắc ở pha này — dữ liệu gửi xuống không hề có 3 viên.
    {
        let lo = [], soLan = 0;
        for (let i = 0; i < 25; i++) {
            const q = await goi(WEB, '/api/state', {}, T);
            if (!q.j || q.j.phase !== 'nhan') break;
            soLan++;
            if (q.j.nan) lo.push('có trường nan: ' + JSON.stringify(q.j.nan));
            // history CHỨA dice của 20 ván CŨ — đó là thông tin công khai, không tính là rò.
            // Chỉ soi phần CÒN LẠI của phản hồi.
            const ngoaiLichSu = JSON.stringify(Object.fromEntries(
                Object.entries(q.j).filter(([k]) => k !== 'history')));
            if (/"dice"/.test(ngoaiLichSu)) lo.push('lộ dice ngoài lịch sử');
            await ngu(80);
        }
        ok('pha hiện nhân KHÔNG gửi xúc xắc xuống (F12 cũng không soi được)', lo.length === 0 && soLan > 0,
            lo.length ? lo.slice(0, 2).join(' | ') : 'không bắt được lần đo nào');
    }

    // ---------------------------------------------------------------- nặn + kết ván
    let sv = null;
    for (let i = 0; i < 300; i++) {
        sv = (await goi(WEB, '/api/state', {}, T)).j;
        if (sv && (sv.phase === 'nan' || sv.phase === 'wait')) break;
        await ngu(200);
    }
    ok('sang được pha NẶN', sv && (sv.phase === 'nan' || sv.phase === 'wait'), sv && sv.phase);
    if (sv && sv.phase === 'nan') {
        ok('pha nặn kèm danh sách ô TRÚNG để bàn tô màu',
            sv.nan && Array.isArray(sv.nan.thang) && sv.nan.thang.length > 0,
            JSON.stringify(sv.nan && sv.nan.thang));
        // đối chiếu lại bằng chính lõi tiền, không tin suông phản hồi
        const CUA = require('../cua.js');
        const dung = CUA.cuaThang(sv.nan.dice).sort().join(',');
        ok('danh sách ô trúng khớp lõi tiền', sv.nan.thang.slice().sort().join(',') === dung,
            sv.nan.dice.join('-') + ' -> ' + sv.nan.thang.join(','));
    }
    ok('máy chủ báo số giây cuối tự mở kết quả', sv && sv.txKqS === 4, String(sv && sv.txKqS));

    let xong = null;
    for (let i = 0; i < 400; i++) {
        xong = (await goi(WEB, '/api/state', {}, T)).j;
        if (xong && xong.history && xong.history.length && xong.phase === 'bet') break;
        await ngu(250);
    }
    ok('ván chốt xong, sang ván mới', xong && xong.phase === 'bet');
    ok('ván mới lại giấu hệ số nhân', xong && xong.txNhan === null, JSON.stringify(xong && xong.txNhan));

    // trả nhịp ván về mặc định chủ server chốt
    const ve = await goi(PANEL, '/api/tx/time', { bet: 30, nhan: 4, nan: 20 }, PT);
    ok('trả nhịp về mốc chủ server chốt: 30s đặt + 4s nhân + 20s nặn = ván 54s',
        ve.j && ve.j.bet === 30 && ve.j.nhan === 4 && ve.j.nan === 20 && ve.j.round === 54,
        JSON.stringify(ve.j));
    console.log('\n🎲 BÀN SIC BO TRÊN WEB: ' + P + ' đạt, ' + F + ' hỏng');
    process.exit(F ? 1 : 0);
})();
