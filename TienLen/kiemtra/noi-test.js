// Bộ kiểm PHẦN NỐI vào BotDoMin: dựng webplay.js thật, kiểm /tienlen/, ảnh lá bài,
// đường /api/tienlen/* và CỔNG LIÊN KẾT (chưa liên kết chỉ xem được, không ngồi được).
// Chạy: node TienLen/kiemtra/noi-test.js
'use strict';
const http = require('http');
const path = require('path');
const BOT = path.join(__dirname, '..', '..', 'BotDoMin');
const { startWebPlay } = require(path.join(BOT, 'webplay.js'));
const { taoSanh } = require('../web.js');

const CONG = 3917;
let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---- database giả: A/B đã liên kết + đủ vốn · C chưa liên kết ----
const db = {
    '900000000000000001': { name: 'An', points: 3000000, ingameName: 'AnChar', webPin: '123456' },
    '900000000000000002': { name: 'Bình', points: 3000000, ingameName: 'BinhChar', webPin: '123456' },
    '900000000000000003': { name: 'Chưa', points: 3000000, ingameName: '', webPin: '123456' },
};
const A = '900000000000000001', B = '900000000000000002', C = '900000000000000003';
// Ví 3.000.000 để vào được cả phòng truyền thống 10.000 (vốn 300.000) lẫn đếm lá 1.000 (120.000).
const tienlen = taoSanh({
    layNguoi: (id) => db[id] || null,
    congVi: (id, t) => { db[id].points += t; },
    laAdmin: (id) => id === A,
    tenCua: (id) => (db[id] || {}).name || id,
});

function goi(duong, than, token) {
    return new Promise((xong) => {
        const d = than ? JSON.stringify(than) : null;
        const r = http.request({
            host: '127.0.0.1', port: CONG, path: duong, method: d ? 'POST' : 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {},
                d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
        }, (rs) => {
            const buf = [];
            rs.on('data', c => buf.push(c));
            rs.on('end', () => {
                const b = Buffer.concat(buf);
                let j = null; try { j = JSON.parse(b.toString('utf8')); } catch (e) { }
                xong({ ma: rs.statusCode, j, b, kieu: rs.headers['content-type'] || '' });
            });
        });
        r.on('error', e => xong({ ma: 0, j: null, b: Buffer.alloc(0), kieu: '', loi: String(e) }));
        if (d) r.write(d);
        r.end();
    });
}

(async () => {
    startWebPlay({
        port: CONG, getDb: () => db, getUserData: (id) => db[id] || {},
        updatePoints: (id, t) => { db[id].points += t; }, saveDbNow() { }, writeLog() { },
        getTX: () => ({ bets: [], status: 'stopped' }), diceEmojis: ['1', '2', '3', '4', '5', '6'],
        txChoices: {}, totalTiles: 24,
        tienlen, tienlenOn: () => true,
        daLienKet: (id) => !!(db[id] && db[id].ingameName),
        lienKetMsg: () => 'Ví chưa liên kết',
    });
    await new Promise(r => setTimeout(r, 400));

    muc('phục vụ trang + ảnh lá bài');
    {
        const r0 = await goi('/tienlen');
        ok('/tienlen chuyển hướng sang /tienlen/ (cần dấu / cuối cho đường tương đối)', r0.ma === 302, String(r0.ma));
        const r = await goi('/tienlen/');
        ok('/tienlen/ trả trang HTML thật', r.ma === 200 && /Tiến Lên Miền Nam/.test(r.b.toString('utf8')), String(r.ma));
        const a = await goi('/tienlen/bai/3s.webp');
        ok('ảnh lá bài lấy được (dùng chung thư mục ảnh của Poker)', a.ma === 200 && a.kieu === 'image/webp' && a.b.length > 200,
            a.ma + ' ' + a.kieu + ' ' + a.b.length);
        const x = await goi('/tienlen/bai/2h.webp');
        ok('lá heo cơ cũng có', x.ma === 200 && x.b.length > 200);
        const bay = await goi('/tienlen/bai/khongco.webp');
        ok('lá không có -> 404, không nổ', bay.ma === 404, String(bay.ma));
    }

    muc('đăng nhập chung + đường /api/tienlen/*');
    {
        const lg = await goi('/api/login', { userId: A, pin: '123456' });
        ok('đăng nhập web cược lấy được token', lg.ma === 200 && !!lg.j.token, JSON.stringify(lg.j && lg.j.error));
        const tA = lg.j.token;
        const ds = await goi('/api/tienlen/ds', null, tA);
        ok('/api/tienlen/ds trả SẢNH danh sách phòng', ds.ma === 200 && ds.j.ok && Array.isArray(ds.j.phong) && ds.j.phong.length >= 2,
            JSON.stringify(ds.j && ds.j.error));
        const MA = ds.j.phong[0].ma;
        const s = await goi('/api/tienlen/' + MA + '/state', null, tA);
        ok('/api/tienlen/<ma>/state đi qua đúng phòng (đường đã cắt tiền tố)', s.ma === 200 && s.j.ok && s.j.toi.id === A,
            JSON.stringify(s.j && s.j.error));
        ok('trạng thái có đủ cấu hình bàn', s.j.cauHinh && typeof s.j.vonToiThieu === 'number');
        const kho = await goi('/api/tienlen/ds');
        ok('không token -> 401', kho.ma === 401, String(kho.ma));
        const la = await goi('/api/tienlen/bay-ba/state', null, tA);
        ok('phòng lạ -> 404 có lời dẫn ra sảnh', la.ma === 404 && /quay ra sảnh/.test((la.j && la.j.error) || ''), String(la.ma));

        const tb = (await goi('/api/login', { userId: B, pin: '123456' })).j.token;
        const n1 = await goi('/api/tienlen/' + MA + '/ngoi', { ghe: 0 }, tA);
        ok('A ngồi ghế 0', n1.ma === 200 && n1.j.ghe[0].id === A, JSON.stringify(n1.j && n1.j.error));
        const n2 = await goi('/api/tienlen/' + MA + '/ngoi', { ghe: 1 }, tb);
        ok('B ngồi ghế 1', n2.ma === 200 && n2.j.ghe[1].id === B);
        await goi('/api/tienlen/' + MA + '/sansang', {}, tA);
        const ss = await goi('/api/tienlen/' + MA + '/sansang', {}, tb);
        ok('cả 2 sẵn sàng -> bàn mở, chia 13 lá', ss.ma === 200 && ss.j.ban && ss.j.ban.toi.la.length === 13,
            JSON.stringify(ss.j && (ss.j.error || (ss.j.ban && ss.j.ban.trangThai))));
        ok('/api/state của web cược báo tab Tiến Lên đang bật',
            (await goi('/api/state', null, tA)).j.tienlenOn === true);
        const tao = await goi('/api/tienlen/tao', { cheDo: 'anhet', mucCuoc: 3000 }, tA);
        ok('tạo phòng qua web thật được', tao.ma === 200 && !!tao.j.vaoPhong, JSON.stringify(tao.j && tao.j.error));
    }

    muc('🔗 cổng liên kết: chưa liên kết thì XEM được, KHÔNG ngồi được');
    {
        const tc = (await goi('/api/login', { userId: C, pin: '123456' })).j.token;
        // ⚠️ SẢNH phải lọt cổng: nó là màn ĐẦU TIÊN của trò chơi. Chặn nó thì người chưa liên
        // kết mở tab ra chỉ thấy lỗi, không biết mình thiếu gì. (Dính đúng vậy lúc đổi sang
        // nhiều phòng: '/ds' không khớp regex XEM cũ.)
        const ds = await goi('/api/tienlen/ds', null, tc);
        ok('chưa liên kết VẪN XEM được sảnh', ds.ma === 200 && ds.j.ok && Array.isArray(ds.j.phong),
            ds.ma + ' ' + JSON.stringify(ds.j && ds.j.error));
        const MA2 = ds.j.phong[0].ma;
        const s = await goi('/api/tienlen/' + MA2 + '/state', null, tc);
        ok('chưa liên kết vẫn xem được một phòng (khớp luật XEM .../state)', s.ma === 200 && s.j.ok, String(s.ma));
        ok('...và sảnh nói rõ vì sao chưa ngồi được', /liên kết/i.test(ds.j.phong[0].viSaoKhong || ''), ds.j.phong[0].viSaoKhong);
        const n = await goi('/api/tienlen/' + MA2 + '/ngoi', { ghe: 2 }, tc);
        ok('chưa liên kết -> ngồi bị CHẶN ở cổng liên kết (403 chuaLienKet)',
            n.ma === 403 && n.j.chuaLienKet === true, n.ma + ' ' + JSON.stringify(n.j && n.j.error));
        const d = await goi('/api/tienlen/' + MA2 + '/danh', { la: ['3s'] }, tc);
        ok('chưa liên kết -> đánh bài cũng bị chặn', d.ma === 403, String(d.ma));
        const t2 = await goi('/api/tienlen/tao', { cheDo: 'anhet', mucCuoc: 1000 }, tc);
        ok('chưa liên kết -> TẠO PHÒNG cũng bị chặn', t2.ma === 403, String(t2.ma));
        const vt = await goi('/api/tienlen/' + MA2 + '/vote', { mucCuoc: 2000 }, tc);
        ok('chưa liên kết -> VOTE đổi cược cũng bị chặn', vt.ma === 403, String(vt.ma));
    }

    muc('🎮 mục TIẾN LÊN trong menu web cược (giống Poker)');
    {
        const tA = (await goi('/api/login', { userId: A, pin: '123456' })).j.token;
        const r = await goi('/', null, tA);
        const h = r.b.toString('utf8');
        ok('có nút nhóm 🀄 TIẾN LÊN cạnh HỒ SƠ / MINI GAME / GIẢI POKER',
            /id="ngTienlen"[^>]*onclick="grpGo\('tienlen'\)"/.test(h) && /🀄 TIẾN LÊN/.test(h));
        ok('...chỉ hiện khi admin bật ở panel', /\$\("ngTienlen"\)\.style\.display=j\.tienlenOn\?"":"none";/.test(h));
        ok('có trang nhúng #pageTienlen + khung /tienlen/', /id="pageTienlen"/.test(h) && /id="tlFrame"/.test(h) &&
            /tf\.src="\/tienlen\/"/.test(h));
        ok('bấm vào là PHỦ KÍN MÀN HÌNH y như Poker',
            /classList\.toggle\("pokerFull",g==="poker"\|\|g==="tienlen"\)/.test(h) &&
            /body\.pokerFull #pageTienlen\{position:fixed;inset:0/.test(h));
        ok('có nút ✕ thoát nổi góc phải', /id="tlOut"/.test(h) && /body\.pokerFull #tlOut\{display:block/.test(h));
        const tr = await goi('/tienlen/');
        const ht = tr.b.toString('utf8');
        ok('trang chơi có nút CHUYỂN SANG MÀN HÌNH NGANG', /onclick="epXoay\(\)"/.test(ht) && /function epXoay\(/.test(ht));
        ok('trang chơi có nút RỜI BÀN ra sảnh', /function veRa\(/.test(ht) && /RỜI BÀN/.test(ht));
    }

    console.log('\n🔌 NỐI TIẾN LÊN VÀO BOTDOMIN: ' + P + ' đạt, ' + F + ' hỏng');
    process.exit(F ? 1 : 0);
})();
