// Bộ kiểm máy chủ web — chạy: node Poker/kiemtra/web-test.js
//
// Bài quan trọng nhất ở đây là CHỐNG LỘ BÀI: không phải tin hàm xem() sạch, mà gọi
// HTTP thật bằng phiên của từng người rồi soi TỪNG BYTE trả về xem có lá nào của
// người khác lọt ra không. Lộ bài là hỏng cả tính năng, không phải lỗi nhỏ.
//
// Dùng database.json GIẢ trong thư mục tạm của máy — tuyệt đối không đụng file thật.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CONG = 4399;
const ADMIN = '900000000000000001';

// ---- dựng database giả: 4 người đủ điều kiện, 1 chưa liên kết, 1 nghèo ----
const TAM = fs.mkdtempSync(path.join(os.tmpdir(), 'pokertest-'));
const DUONG = path.join(TAM, 'database.json');
const DB = {};
const cho = (id, ten, points, ingameName) => {
    DB[id] = { name: ten, points, webPin: '123456', ingameName };
};
cho(ADMIN, 'Admin', 500000, 'AdminChar');
cho('900000000000000002', 'Biabia', 300000, 'Biabia');
cho('900000000000000003', 'Long', 50000, 'Long');
cho('900000000000000004', 'Vinh', 20000, 'Vinh');
cho('900000000000000005', 'ChuaLienKet', 999999, '');       // chưa liên kết
cho('900000000000000006', 'Ngheo', 500, 'Ngheo');           // không đủ 10.000
fs.writeFileSync(DUONG, JSON.stringify(DB));

process.env.POKER_DB = DUONG;
process.env.POKER_ADMIN = ADMIN;
process.env.POKER_PORT = String(CONG);
process.env.POKER_GIAY_LAT = '1';   // khỏi chờ 8 giây mỗi lần lật bài
const may = require('../index.js');

let P = 0, F = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

function goi(duong, than, token, kieu) {
    return new Promise((xong) => {
        const d = than ? JSON.stringify(than) : null;
        const r = http.request({
            host: '127.0.0.1', port: CONG, path: duong, method: kieu || (d ? 'POST' : 'GET'),
            headers: Object.assign({ 'Content-Type': 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {},
                d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
        }, (rs) => {
            let b = '';
            rs.on('data', c => b += c);
            rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } xong({ ma: rs.statusCode, j, tho: b }); });
        });
        r.on('error', e => xong({ ma: 0, j: null, tho: String(e) }));
        if (d) r.write(d);
        r.end();
    });
}
const dangNhap = async (id) => (await goi('/api/dangnhap', { id, pin: '123456' })).j;

(async () => {
    await new Promise(x => may.may.listen(CONG, x));

    // ------------------------------------------------------------ đăng nhập
    muc('đăng nhập');
    {
        const a = await goi('/api/dangnhap', { id: ADMIN, pin: '123456' });
        ok('đúng ID + PIN thì vào được', a.ma === 200 && !!a.j.token);
        ok('trả về tên nhân vật trong game', a.j.ten === 'AdminChar', a.j.ten);
        const b = await goi('/api/dangnhap', { id: ADMIN, pin: 'sai' });
        ok('sai PIN thì chặn', b.ma === 401, String(b.ma));
        const c = await goi('/api/dangnhap', { id: '000000000000000000', pin: '123456' });
        ok('ID không có thì chặn', c.ma === 401, String(c.ma));
        const d = await goi('/api/trangthai', null, 'token-bay-ba');
        ok('token bậy thì chặn', d.ma === 401, String(d.ma));
        const e = await goi('/api/trangthai');
        ok('không có token thì chặn', e.ma === 401, String(e.ma));
    }

    // ------------------------------------------------------------ cổng vào giải
    muc('cổng vào giải: 10.000 Dogcoin + đã liên kết');
    {
        const chuaLk = await dangNhap('900000000000000005');
        const r1 = await goi('/api/ngoi', {}, chuaLk.token);
        ok('chưa liên kết nhân vật thì không ngồi được', r1.ma === 400 && /liên kết/i.test(r1.j.error), r1.j.error);
        const ngheo = await dangNhap('900000000000000006');
        const r2 = await goi('/api/ngoi', {}, ngheo.token);
        ok('dưới 10.000 Dogcoin thì không ngồi được', r2.ma === 400 && /10\.000/.test(r2.j.error), r2.j.error);
        const t2 = (await goi('/api/trangthai', null, ngheo.token)).j;
        ok('web nói rõ lý do không ngồi được', t2.toi.duocNgoi === false && !!t2.toi.viSaoKhong, t2.toi.viSaoKhong);
        ok('KHÔNG trừ Dogcoin của ai (chỉ kiểm tra)',
            JSON.parse(fs.readFileSync(DUONG, 'utf8'))['900000000000000006'].points === 500);
    }

    // ------------------------------------------------------------ chọn ghế + cấu hình + giải tán
    muc('CHỌN GHẾ trên bàn · admin đặt chip · giải tán');
    {
        const tA = (await dangNhap(ADMIN)).token, tB = (await dangNhap('900000000000000002')).token;
        const t0 = (await goi('/api/trangthai', null, tA)).j;
        ok('phòng chờ có đúng 8 ghế, ban đầu trống hết',
            Array.isArray(t0.ghe) && t0.ghe.length === 8 && t0.ghe.every(x => x === null), JSON.stringify(t0.ghe));
        ok('chưa ngồi thì gheCuaToi = -1', t0.gheCuaToi === -1, String(t0.gheCuaToi));

        const r1 = await goi('/api/ngoi', { ghe: 3 }, tA);
        ok('ngồi được đúng ghế mình chọn (ghế 3)', r1.ma === 200 && r1.j.gheCuaToi === 3 && r1.j.ghe[3] && r1.j.ghe[3].id === ADMIN,
            r1.j && (r1.j.error || JSON.stringify(r1.j.ghe)));
        ok('danh sách cho biết số ghế', r1.j.cho.length === 1 && r1.j.cho[0].ghe === 3, JSON.stringify(r1.j.cho));
        const r2 = await goi('/api/ngoi', { ghe: 3 }, tB);
        ok('người khác ngồi trùng ghế thì bị chặn', r2.ma === 400 && /có người/i.test(r2.j.error), r2.j && r2.j.error);
        const r3 = await goi('/api/ngoi', { ghe: 5 }, tA);
        ok('đổi ghế 3 -> 5 thì ghế 3 được nhả ra', r3.j.gheCuaToi === 5 && r3.j.ghe[3] === null && r3.j.ghe[5].id === ADMIN,
            JSON.stringify(r3.j.ghe));
        const r4 = await goi('/api/ngoi', { ghe: 99 }, tB);
        ok('số ghế bậy thì chặn', r4.ma === 400, String(r4.ma));

        const c1 = await goi('/api/cauhinh', { chipDau: 10000 }, tB);
        ok('người thường KHÔNG đổi được chip khởi điểm', c1.ma === 403, String(c1.ma));
        const c2 = await goi('/api/cauhinh', { chipDau: 7777 }, tA);
        ok('chip lẻ (không chia hết 500) bị chặn', c2.ma === 400, c2.j && c2.j.error);
        const c3 = await goi('/api/cauhinh', { chipDau: 10000 }, tA);
        ok('admin đặt 10.000 chip -> phòng chờ báo 10.000', c3.ma === 200 && c3.j.chipDau === 10000, JSON.stringify(c3.j.cauHinh));
        ok('thang blind tự sinh theo chip: BB đầu 100, BB cuối >= 80.000',
            c3.j.lichBlind[0] === 100 && c3.j.lichBlind[c3.j.lichBlind.length - 1] >= 80000,
            c3.j.lichBlind[0] + ' … ' + c3.j.lichBlind[c3.j.lichBlind.length - 1]);
        await goi('/api/cauhinh', { chipDau: 5000 }, tA);   // trả về mặc định cho các bài sau

        const g1 = await goi('/api/giaitan', {}, tB);
        ok('người thường KHÔNG giải tán được', g1.ma === 403, String(g1.ma));
        const g2 = await goi('/api/giaitan', {}, tA);
        ok('admin giải tán -> 8 ghế trống lại', g2.ma === 200 && g2.j.ghe.every(x => x === null), JSON.stringify(g2.j.ghe));
    }

    // ------------------------------------------------------------ ngồi + mở giải
    muc('ngồi bàn và mở giải');
    const NG = {};
    for (const id of [ADMIN, '900000000000000002', '900000000000000003', '900000000000000004'])
        NG[id] = (await dangNhap(id)).token;
    const IDS = Object.keys(NG);
    {
        const khach = await dangNhap('900000000000000005');
        const r = await goi('/api/batdau', {}, khach.token);
        ok('người thường KHÔNG mở được giải', r.ma === 403, String(r.ma));
        const r2 = await goi('/api/batdau', {}, NG[ADMIN]);
        ok('chưa đủ người thì admin cũng không mở được', r2.ma === 400, r2.j && r2.j.error);
        for (const id of IDS) await goi('/api/ngoi', {}, NG[id]);
        const t = (await goi('/api/trangthai', null, NG[ADMIN])).j;
        ok('4 người đã ngồi vào bàn', t.cho.length === 4, String(t.cho.length));
        const r3 = await goi('/api/batdau', {}, NG[ADMIN]);
        ok('admin mở được giải', r3.ma === 200 && r3.j.giai && r3.j.giai.trangThai === 'DANG_CHAY',
            r3.j && (r3.j.error || r3.j.giai && r3.j.giai.trangThai));
        ok('ai cũng 5.000 chip', r3.j.giai.nguoi.every(p => p.chip + p.cuoc === 5000));
    }

    // ------------------------------------------------------------ CHỐNG LỘ BÀI
    muc('🔒 CHỐNG LỘ BÀI — soi từng byte máy chủ trả về');
    {
        const tay = may.phong.giai._trong.van.tay;   // bài thật của từng người
        let loLot = [];
        for (const id of IDS) {
            const r = await goi('/api/trangthai', null, NG[id]);
            const cuaToi = new Set(tay[id] || []);
            for (const khac of IDS) {
                if (khac === id) continue;
                for (const la of (tay[khac] || [])) {
                    if (cuaToi.has(la)) continue;                       // không thể trùng, bộ 52 là duy nhất
                    if (r.tho.includes('"' + la + '"')) loLot.push(id + ' thấy ' + la + ' của ' + khac);
                }
            }
        }
        ok('KHÔNG người nào thấy bài của người khác', loLot.length === 0, loLot.join(' | '));

        for (const id of IDS) {
            const r = await goi('/api/trangthai', null, NG[id]);
            ok(id.slice(-1) + ': thấy đúng 2 lá của CHÍNH MÌNH',
                r.j.giai.toi.la && r.j.giai.toi.la.length === 2 &&
                r.j.giai.toi.la.every(x => (tay[id] || []).includes(x)));
        }

        // khán giả (không trong giải) không được thấy bài của BẤT KỲ ai
        const khach = await dangNhap('900000000000000005');
        const rk = await goi('/api/trangthai', null, khach.token);
        let loKhach = [];
        for (const id of IDS) for (const la of (tay[id] || []))
            if (rk.tho.includes('"' + la + '"')) loKhach.push(la + ' của ' + id);
        ok('khán giả KHÔNG thấy bài của bất kỳ ai', loKhach.length === 0, loKhach.join(', '));
        ok('khán giả vẫn xem được diễn biến (hũ, vòng, người)',
            rk.j.giai && typeof rk.j.giai.van.hu === 'number' && rk.j.giai.nguoi.length === 4);
        ok('khán giả không có mục "toi" chứa bài', !rk.j.giai.toi);
    }

    // ------------------------------------------------------------ đánh thật
    muc('đánh thật qua HTTP');
    {
        const luot1 = (await goi('/api/trangthai', null, NG[ADMIN])).j.giai.van.luot;
        const saiNguoi = IDS.find(x => x !== luot1);
        const r = await goi('/api/danh', { kieu: 'theo' }, NG[saiNguoi]);
        ok('không phải lượt mình thì máy chủ chặn', r.ma === 400 && /lượt/i.test(r.j.error), r.j.error);
        const r2 = await goi('/api/danh', { kieu: 'to', tien: 1 }, NG[luot1]);
        ok('tố bậy thì máy chủ chặn kèm lời giải thích', r2.ma === 400 && !!r2.j.error, r2.j.error);

        // cho cả bàn theo tới khi lật bài
        let buoc = 0;
        while (buoc++ < 60) {
            const s = (await goi('/api/trangthai', null, NG[ADMIN])).j.giai;
            if (!s.van.luot) break;
            await goi('/api/danh', { kieu: 'theo' }, NG[s.van.luot]);
        }
        const s = (await goi('/api/trangthai', null, NG[ADMIN])).j.giai;
        ok('đi hết ván tới màn lật bài', ['LAT', 'XONG'].includes(s.van.vong), s.van.vong);
        ok('có 5 lá bài chung', s.van.chung.length === 5, String(s.van.chung.length));
        ok('LÚC LẬT thì bài mới lộ, và lộ cho mọi người',
            !!(s.van.ketQua && s.van.ketQua.lat && s.van.ketQua.lat.length === 4),
            s.van.ketQua ? String(s.van.ketQua.lat && s.van.ketQua.lat.length) : 'không có');
        const tong = s.nguoi.reduce((a, b) => a + b.chip, 0);
        ok('tổng chip vẫn đúng 20.000 sau khi chia hũ', tong === 20000, String(tong));
    }

    // ------------------------------------------------------------ tự mở ván sau
    muc('máy chủ tự mở ván kế sau khi lật bài');
    {
        const truoc = (await goi('/api/trangthai', null, NG[ADMIN])).j.giai.van.so;
        let s = null;
        for (let i = 0; i < 40; i++) {                      // chờ tối đa 4 giây
            await new Promise(x => setTimeout(x, 100));
            s = (await goi('/api/trangthai', null, NG[ADMIN])).j.giai;
            if (s.van.so > truoc) break;
        }
        ok('sau vài giây máy chủ tự chia ván mới', s.van.so === truoc + 1, s.van.so + ' vs ' + truoc);
        ok('ván mới có người tới lượt', !!s.van.luot);
        ok('ván mới chia lại bài chung từ đầu', s.van.chung.length === 0, String(s.van.chung.length));
    }

    // ------------------------------------------------------------ xin nghỉ
    muc('xin nghỉ qua HTTP');
    {
        const r1 = await goi('/api/xinnghi', {}, NG[IDS[1]]);
        ok('xin nghỉ xong còn chờ phiếu', r1.ma === 200 && r1.j.giai.xinNghi && !r1.j.giai.nghi);
        const r2 = await goi('/api/xinnghi', {}, NG[IDS[2]]);
        ok('đang chờ phiếu thì không ai chen ngang', r2.ma === 400, r2.j && r2.j.error);
        let s;
        for (const id of IDS) if (id !== IDS[1]) s = (await goi('/api/dongy', {}, NG[id])).j;
        ok('đủ phiếu thì nghỉ thật', s.giai.nghi === true);
        const luot = s.giai.van.luot;
        const r3 = await goi('/api/danh', { kieu: 'theo' }, NG[luot || IDS[0]]);
        ok('đang nghỉ thì người ĐANG TỚI LƯỢT cũng không đánh được',
            r3.ma === 400 && /ngưng/i.test(r3.j.error), r3.j.error);
        const r4 = await goi('/api/choitiep', {}, NG[IDS[0]]);
        ok('chơi tiếp được', r4.j.giai.nghi === false);
    }

    // ------------------------------------------------------------ file tĩnh
    muc('phục vụ file + chặn đường dẫn bậy');
    {
        const t = await goi('/', null, null, 'GET');
        ok('trang chủ trả về HTML', t.ma === 200 && t.tho.includes('<!doctype html>'), String(t.ma));
        const a = await goi('/bai/As.webp', null, null, 'GET');
        ok('lấy được ảnh lá bài', a.ma === 200 && a.tho.length > 1000, String(a.ma));
        // Điều PHẢI đúng là: không bao giờ phục vụ file mã nguồn / dữ liệu.
        // Đo bằng NỘI DUNG trả về chứ không bắt cứng mã số HTTP.
        const bay = ['/bai/../index.js', '/bai/../../BotDoMin/database.json', '/index.js',
                     '/giai.js', '/bai.js', '/kiemtra/web-test.js', '/../database.json'];
        for (const b of bay) {
            const r = await goi(b, null, null, 'GET');
            const loMa = /require\(|module\.exports|webPin|function taoGiai/.test(r.tho);
            ok('không phục vụ file: ' + b, r.ma !== 200 && !loMa, r.ma + ' · ' + r.tho.slice(0, 50));
        }
        const t2 = await goi('/index.js', null, null, 'GET');
        ok('đường lạ trả 404, không phải 401 (đừng gợi ý "đăng nhập là thấy")',
            t2.ma === 404, String(t2.ma));
    }

    // ------------------------------------------------------------ không ghi DB
    muc('tuyệt đối không ghi vào database.json');
    {
        const sau = fs.readFileSync(DUONG, 'utf8');
        ok('file database.json y nguyên từ đầu tới cuối', sau === JSON.stringify(DB), 'file đã bị sửa!');
    }

    fs.rmSync(TAM, { recursive: true, force: true });
    console.log('\n🌐 MÁY CHỦ WEB POKER: ' + P + ' đạt, ' + F + ' hỏng');
    process.exit(F ? 1 : 0);
})();
