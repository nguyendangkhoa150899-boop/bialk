// ============================================================================
//  Bộ kiểm TRANG PANEL SUPER — dựng panel THẬT, lấy trang về, kiểm JS CHẠY TRONG
//  TRÌNH DUYỆT có lỗi cú pháp không, và thử đăng nhập.
//
//  ⚠️ VÌ SAO PHẢI CÓ FILE NÀY (20/09): cả trang panel là MỘT template literal khổng lồ trong
//  panel.js. Viết \' trong đó thì template literal NUỐT dấu gạch, trang đích ra  tlLuu(''+x+'')
//  — hai chuỗi dính nhau = LỖI CÚ PHÁP = CHẾT TOÀN BỘ JS CỦA TRANG. Admin bấm đăng nhập không
//  ăn, bấm gì cũng không ăn, mà console của bot thì im ru vì lỗi nằm ở phía trình duyệt.
//  `node --check panel.js` KHÔNG bắt được: bản thân panel.js đúng cú pháp, thứ hỏng là cái
//  CHUỖI nó sinh ra. Muốn ra chữ \' ở trang đích thì trong nguồn phải viết \\'.
//
//  Chạy: node TienLen/kiemtra/panel-test.js
// ============================================================================
'use strict';
const http = require('http');
const vm = require('vm');
const path = require('path');
const { startPanel } = require(path.join(__dirname, '..', '..', 'BotDoMin', 'panel.js'));

const CONG = 3931;
const MAT_KHAU = 'matkhau-thu';
const MAT_KHAU_SUPER = 'super-thu';

let P = 0, F = 0;
const ok = (t, dk, them) => { if (dk) { P++; console.log('  OK   ' + t); } else { F++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); } };
const muc = (t) => console.log('\n== ' + t + ' ==');

const db = { '900000000000000001': { name: 'An', points: 100000, ingameName: 'AnChar' } };

function xin(duong, than, token) {
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
                const b = Buffer.concat(buf).toString('utf8');
                let j = null; try { j = JSON.parse(b); } catch (e) { }
                xong({ ma: rs.statusCode, j, b });
            });
        });
        r.on('error', e => xong({ ma: 0, j: null, b: String(e) }));
        if (d) r.write(d);
        r.end();
    });
}

(async () => {
    startPanel({
        port: CONG, password: MAT_KHAU, superPassword: MAT_KHAU_SUPER,
        getDb: () => db, getUserData: (id) => db[id] || {}, updatePoints() { }, saveDbNow() { }, writeLog() { },
        getTX: () => ({ bets: [], status: 'stopped', forcedResult: null }),
        diceEmojis: ['1', '2', '3', '4', '5', '6'], totalTiles: 24, txChoices: {},
        getForcedMines: () => ({}),
    });
    await new Promise(r => setTimeout(r, 500));

    const trang = await xin('/');
    muc('⭐ JS CHẠY TRONG TRÌNH DUYỆT không được lỗi cú pháp');
    ok('lấy được trang panel', trang.ma === 200 && trang.b.length > 10000, trang.ma + ' · ' + trang.b.length + ' ký tự');

    const khoi = trang.b.match(/<script>([\s\S]*?)<\/script>/g) || [];
    ok('trang có khối <script>', khoi.length > 0, String(khoi.length));
    for (let i = 0; i < khoi.length; i++) {
        const js = khoi[i].replace(/^<script>/, '').replace(/<\/script>$/, '');
        let loi = '';
        try { new vm.Script(js, { filename: 'panel-trang.js' }); }
        catch (e) {
            const m = String(e.stack).match(/panel-trang\.js:(\d+)/);
            const d = js.split('\n');
            loi = e.message + (m ? ' · dòng ' + m[1] + ': ' + (d[Number(m[1]) - 1] || '').trim().slice(0, 120) : '');
        }
        ok('khối script ' + (i + 1) + ' không lỗi cú pháp', !loi, loi);
    }

    // Bẫy riêng cho đúng kiểu lỗi đã dính: dấu nháy đóng mở dính nhau trong onclick.
    const dinh = (trang.b.match(/onclick="[A-Za-z0-9_]+\(''\+/g) || []);
    ok("KHÔNG có onclick kiểu ham(''+x+'') — dấu \\' bị template literal nuốt",
        dinh.length === 0, dinh.join(' | '));

    muc('🔑 đăng nhập');
    const sai = await xin('/api/login', { password: 'bay-ba-khong-dung' });
    ok('mật khẩu sai -> 401', sai.ma === 401, sai.ma + ' ' + JSON.stringify(sai.j));
    const sup = await xin('/api/login', { password: MAT_KHAU_SUPER });
    ok('mật khẩu SUPER -> có token', sup.ma === 200 && !!(sup.j && sup.j.token), sup.ma + ' ' + JSON.stringify(sup.j));
    const st = await xin('/api/state', null, sup.j && sup.j.token);
    ok('có token thì đọc được trạng thái', st.ma === 200 && st.j && st.j.ok !== false, st.ma + ' ' + String(st.b).slice(0, 120));
    const khong = await xin('/api/state');
    ok('không token -> chặn', khong.ma === 401 || khong.ma === 403, String(khong.ma));

    muc('🀄 tab Tiến Lên trong panel');
    ok('có nút nhóm + khung danh sách phòng', /id="tlDs"/.test(trang.b) && /id="tlOn"/.test(trang.b));
    ok('có ô mở thêm phòng', /id="tlTaoCheDo"/.test(trang.b) && /id="tlTaoMuc"/.test(trang.b));
    // Rác cũ CÓ SẴN từ trước, không phải lỗi mới: hai id này thuộc khung "đơn Pal" đã gỡ khỏi
    // markup, nhưng hàm đọc chúng đều chặn null sẵn (`if(!box||!STATE) return` / `if(badge){`)
    // nên vô hại. Cho vào danh sách bỏ qua để phép kiểm vẫn bắt được id HỎNG MỚI phát sinh.
    const BO_QUA = ['palOrders', 'palOrderBadge'];
    const idCo = new Set([...trang.b.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
    const idGoi = [...new Set([...trang.b.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]))];
    const thieu = idGoi.filter(x => !idCo.has(x) && BO_QUA.indexOf(x) < 0);
    ok('mọi getElementById đều trỏ vào id CÓ THẬT trong trang', thieu.length === 0, thieu.join(', '));
    const dem = {}; [...trang.b.matchAll(/id="([A-Za-z0-9_-]+)"/g)].forEach(m => dem[m[1]] = (dem[m[1]] || 0) + 1);
    const trung = Object.keys(dem).filter(k => dem[k] > 1);
    ok('không có id trùng trong trang panel', trung.length === 0, trung.join(', '));

    // ---------------------------------------------------------------- 🆙 CẤP PAL GỐC + 🚕 VÉ TAXI (24/09)
    // Hai ô admin mới. Trang đích phải có thật (phép "getElementById trỏ vào id CÓ THẬT" ở trên đã
    // canh sẵn), và index.js phải thật sự DÙNG số đó chứ không phải chỉ lưu cho vui.
    const IDX = require('fs').readFileSync(path.join(__dirname, '..', '..', 'BotDoMin', 'index.js'), 'utf8');
    ok('🆙 PAL GỐC: trang có ô nhập CẤP pal', /id="pwRawLevel"/.test(trang.b));
    ok('...gửi lên máy chủ kèm rawLevel và chặn ngoài 1–100',
        /rawLevel:lv/.test(trang.b) && /Cấp pal 1–100/.test(trang.b));
    ok('⭐ index KHÔNG còn cứng Lv1 — pal gốc giao ra theo cfg.rawLevel',
        /level: Math\.max\(1, Math\.min\(100, Math\.floor\(cfg\.rawLevel\) \|\| 1\)\), rank: 0,/.test(IDX) && !/\n\s+level: 1, rank: 0,/.test(IDX));
    ok('...cấu hình có rawLevel, mặc định 1, kẹp 1–100 (cùng phạm vi với cấp của chế độ thường)',
        /rawLevel: Math\.floor\(num\(c\.rawLevel, 1, 1, 100\)\)/.test(IDX));
    ok('...dòng trạng thái trên panel hiện đúng cấp đang đặt, không in cứng "Lv1"',
        /Lv'\+\(k\.rawLevel\|\|1\)\+'/.test(trang.b) && !/pal giao ra Lv1 ·/.test(trang.b));
    ok('🚕 vé taxi: trang có đủ 4 ô + công tắc + nút lưu',
        ['txTien', 'txLoMin', 'txViMax', 'txGio', 'txOn'].every(id => trang.b.includes('id="' + id + '"')) && /onclick="txSave\(\)"/.test(trang.b));

    console.log('\n🛠️ TRANG PANEL SUPER: ' + P + ' đạt, ' + F + ' hỏng');
    process.exit(F ? 1 : 0);
})();
