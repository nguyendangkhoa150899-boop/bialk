// Cầu nối KNB tới server Thiên Long Bát Bộ NetCo4 (thay cho palworld.js).
//
// Bot chạy CÙNG VPS với game (103.216.118.123) nên nói chuyện qua FILE, không qua mạng.
// Phía game: Public/Data/Script/CDK/CDK.lua (NPC "Ví Web", script 999999) của repo tlbbnetco4.
//
//   GAME -> WEB: người chơi bấm NPC Ví Web, game TRỪ KNB trong game rồi ghi phiếu
//                out/<GUID>_<giờ>_<số>.txt = "<GUID> <số KNB> END". Bot đọc phiếu, cộng ví,
//                chuyển phiếu sang out/xong/. Tên file = mã giao dịch (chống cộng trùng).
//   WEB -> GAME: bot ghi <GUID>.in, mỗi dòng "<mã> <số> ok" (ghi file tạm rồi đổi tên => game
//                không bao giờ đọc được file ghi dở). Game phát KNB khi nhân vật ĐĂNG NHẬP hoặc
//                ĐỔI BẢN ĐỒ, ghi mã vào <GUID>.done TRƯỚC khi phát (không phát trùng). Bot dọn
//                dòng đã có trong .done. Không cần online lúc rút.
//
// Vì sao không ghi thẳng database: KNB của nhân vật đang chơi nằm trong RAM (ShareMemory), ghi
// DB sẽ bị server ghi đè. Mọi thay đổi tiền phải đi qua script trong game.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = process.env.TLBB_ROOT || '/opt/tlbb-root';
const GAME = path.join(ROOT, 'home/tlbb');
const DIR = path.join(GAME, 'Server/txt/NetCo4Web');
const OUT = path.join(DIR, 'out');
const OUT_DONE = path.join(OUT, 'xong');
const SECRETS = process.env.TLBB_SECRETS || '/opt/tlbb-deploy/secrets.env';
const VISCII_MAP = process.env.TLBB_VISCII_MAP || '/opt/tlbb-repo/tools/viscii-map.json';
const MYSQL = '/usr/local/mysql5.0.45/bin/mysql';

function ensureDirs() {
    for (const d of [DIR, OUT, OUT_DONE]) fs.mkdirSync(d, { recursive: true });
}

function readLines(file) {
    try { return fs.readFileSync(file, 'latin1').split(/\r?\n/).filter(Boolean); } catch { return []; }
}

function writeAtomic(file, text) {
    const tmp = `${file}.tmp${process.pid}`;
    fs.writeFileSync(tmp, text, 'latin1');
    fs.renameSync(tmp, file);   // rename trên cùng ổ là nguyên tử: game thấy file cũ hoặc mới, không bao giờ dở dang
}

const guidOk = (g) => /^\d{6,12}$/.test(String(g));

// ----- WEB -> GAME -----
// Trả { txid }. Chỉ xếp hàng: KNB vào túi khi nhân vật đăng nhập / đổi bản đồ.
function sendKnb(guid, amount) {
    if (!guidOk(guid)) throw new Error('GUID nhân vật không hợp lệ');
    amount = Math.floor(Number(amount));
    if (!(amount > 0 && amount <= 99999)) throw new Error('Số KNB mỗi lệnh phải 1-99.999');
    ensureDirs();
    const txid = 'w' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const file = path.join(DIR, `${guid}.in`);
    const lines = readLines(file);
    lines.push(`${txid} ${amount} ok`);
    writeAtomic(file, lines.join('\n') + '\n');
    return { txid };
}

// Các lệnh web -> game CHƯA được game nhận. [{ txid, amount }]
function pendingIn(guid) {
    const done = new Set(readLines(path.join(DIR, `${guid}.done`)));
    return readLines(path.join(DIR, `${guid}.in`))
        .map((l) => l.match(/^(\w+) (\d+) ok$/))
        .filter((m) => m && !done.has(m[1]))
        .map((m) => ({ txid: m[1], amount: Number(m[2]) }));
}

// Bỏ khỏi .in những dòng game đã nhận (đã có trong .done). Trả số KNB đã nhận xong.
function cleanupIn(guid) {
    const file = path.join(DIR, `${guid}.in`);
    const lines = readLines(file);
    if (!lines.length) return 0;
    const done = new Set(readLines(path.join(DIR, `${guid}.done`)));
    const keep = [];
    let delivered = 0;
    for (const l of lines) {
        const m = l.match(/^(\w+) (\d+) ok$/);
        if (m && done.has(m[1])) delivered += Number(m[2]);
        else keep.push(l);
    }
    if (keep.length !== lines.length) writeAtomic(file, keep.length ? keep.join('\n') + '\n' : '');
    return delivered;
}

// ----- GAME -> WEB -----
// Phiếu hoàn chỉnh (có END). [{ file, guid, amount }]
function readReceipts() {
    ensureDirs();
    const out = [];
    for (const f of fs.readdirSync(OUT)) {
        if (!/^\d+_\d+_\d+\.txt$/.test(f)) continue;
        const m = readLines(path.join(OUT, f)).join(' ').match(/^(\d+) (\d+) END$/);
        if (m && f.startsWith(m[1] + '_')) out.push({ file: f, guid: m[1], amount: Number(m[2]) });
    }
    return out;
}

function finishReceipt(file) {
    fs.renameSync(path.join(OUT, file), path.join(OUT_DONE, file));
}

// ----- NHÂN VẬT (đọc MySQL của game, chỉ đọc) -----
let _rev = null;
function viscii(buf) {
    if (!_rev) {
        _rev = {};
        try {
            const m = JSON.parse(fs.readFileSync(VISCII_MAP, 'utf8'));
            for (const [ch, b] of Object.entries(m)) _rev[b] = ch;
        } catch { /* không có bảng: hiện byte thô */ }
    }
    let s = '';
    for (const b of buf) s += _rev[b] || String.fromCharCode(b);
    return s;
}

function rootPass() {
    const m = fs.readFileSync(SECRETS, 'utf8').match(/^MYSQL_ROOT_PASS=(.+)$/m);
    if (!m) throw new Error('Không đọc được MYSQL_ROOT_PASS');
    return m[1].trim();
}

// [{ guid, account, name, level }]
function listChars() {
    return new Promise((resolve, reject) => {
        execFile('chroot', [ROOT, MYSQL, '-uroot', '-p' + rootPass(), '-N', '-B', '-e',
            'SELECT charguid, accname, charname, level FROM tlbbdb.t_char WHERE isvalid=1 ORDER BY charguid'],
        { encoding: 'buffer', timeout: 15000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr && stderr.toString()) || err.message));
            const rows = [];
            for (const line of stdout.toString('latin1').split('\n')) {
                if (!line) continue;
                const c = line.split('\t');
                rows.push({ guid: c[0], account: viscii(Buffer.from(c[1] || '', 'latin1')), name: viscii(Buffer.from(c[2] || '', 'latin1')), level: Number(c[3]) });
            }
            resolve(rows);
        });
    });
}

// Tìm theo tên nhân vật (không phân biệt hoa thường) hoặc GUID. Trả { guid, name, ... } | null
async function findChar(nameOrGuid) {
    const q = String(nameOrGuid || '').trim();
    if (!q) return null;
    const rows = await listChars();
    if (guidOk(q)) return rows.find((r) => r.guid === q) || null;
    const lq = q.toLowerCase();
    return rows.find((r) => r.name.trim().toLowerCase() === lq) || null;
}

// ===== GIAO ĐỒ (shop item, quà mỗi ngày, rương) - 29/09 =====
// Đi qua API nội bộ của panel GM (repo tlbbnetco4, panel/panel.py) ở https://127.0.0.1:8443:
// panel GM ghi hàng đợi quà NetCo4Qua/<GUID>.txt, game phát khi nhân vật ĐĂNG NHẬP hoặc ĐỔI BẢN ĐỒ
// (quatang.lua). Không cần online lúc mua. Panel GM chỉ nhận kết nối THẲNG từ 127.0.0.1 + đúng khoá
// (PANEL_PASS trong secrets.env của game).
const https = require('https');
function gmKey() {
    try {
        const m = fs.readFileSync(SECRETS, 'utf8').match(/^PANEL_PASS=(.+)$/m);
        return m ? m[1].trim() : '';
    } catch { return ''; }
}
function gmCall(method, p, body) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const req = https.request({
            host: '127.0.0.1', port: 8443, path: p, method, rejectUnauthorized: false, timeout: 20000,
            headers: { Host: '127.0.0.1:8443', 'X-NetCo4-Key': gmKey(), 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}) },
        }, (res) => {
            const parts = [];
            res.on('data', (c) => parts.push(c));
            res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { reject(new Error('panel GM trả về không phải JSON (HTTP ' + res.statusCode + ')')); } });
        });
        req.on('timeout', () => req.destroy(new Error('panel GM không trả lời (20 giây)')));
        req.on('error', (e) => reject(new Error('không gọi được panel GM: ' + e.message)));
        if (data) req.write(data);
        req.end();
    });
}

// Danh mục vật phẩm của game (≈23.800 món, tên tiếng Việt) - dạng {id, n} để khớp code shop cũ.
let ITEMS = [];
async function loadItems() {
    const j = await gmCall('GET', '/api/items?all=1');
    if (!j || !j.ok || !Array.isArray(j.items)) throw new Error((j && j.error) || 'không đọc được danh mục vật phẩm');
    ITEMS = j.items.map((x) => ({ id: String(x.id), n: String(x.name || x.id), kind: String(x.kind || '') }));
    return ITEMS.length;
}
function items() { return ITEMS; }

// Nhân vật có trong database game thì coi là "online" (quà xếp hàng, không cần đang chơi).
// Không thấy => 'player not found' để code cũ hiểu là CHẮC CHẮN chưa giao (hoàn tiền).
async function countItem(nameOrGuid) {
    const c = await findChar(nameOrGuid);
    if (!c) throw new Error('Khong thay nhan vat trong game (player not found)');
    return { ok: true, count: 0 };
}
// Mỗi dòng hàng đợi tối đa 999 cái => chia nhiều dòng. Lỗi TRƯỚC khi ghi dòng nào = 'player not
// found' (hoàn tiền); ghi được một phần rồi lỗi = trả lỗi mơ hồ để admin kiểm (không hoàn kẻo trùng).
async function giveItem(nameOrGuid, itemId, qty) {
    const c = await findChar(nameOrGuid);
    if (!c) throw new Error('Khong thay nhan vat trong game (player not found)');
    let con = Math.floor(Number(qty) || 0), da = 0;
    if (con < 1) throw new Error('So luong khong hop le (player not found)');
    while (con > 0) {
        const n = Math.min(999, con);
        let j;
        try { j = await gmCall('POST', '/api/act', { a: 'qua', guid: c.guid, loai: 'item', gt: String(itemId), sl: String(n) }); }
        catch (e) { if (!da) throw new Error(e.message + ' (player not found)'); throw e; }
        if (!j || !j.ok || !j.done) {
            const m = (j && (j.msg || j.error)) || 'panel GM từ chối';
            if (!da) throw new Error(m + ' (player not found)');
            return { ok: false, message: 'Giao được ' + da + '/' + qty + ' rồi lỗi: ' + m };
        }
        da += n; con -= n;
    }
    return { ok: true, guid: c.guid, name: c.name, message: 'Đã xếp hàng quà cho ' + c.name };
}

// ===== 30/09: TÀI KHOẢN GAME dùng chung cho web =====
// Game giữ MD5 trong web.account; panel GM có act kiem_mk (so MD5) và doi_mk. Bot chỉ gửi MD5, không gửi mật khẩu thô.
const RE_GACC = /^[a-z0-9_]{3,20}$/, RE_GPASS = /^[A-Za-z0-9_@.!-]{6,32}$/;
async function kiemMk(acc, pass) {
    acc = String(acc || '').toLowerCase(); pass = String(pass || '');
    if (!RE_GACC.test(acc) || !RE_GPASS.test(pass)) return false;
    const md5 = crypto.createHash('md5').update(pass).digest('hex');
    const j = await gmCall('POST', '/api/act', { a: 'kiem_mk', ten: acc, md5 });
    if (!j || !j.ok) throw new Error((j && j.error) || 'panel GM lỗi');
    return /^Da khop/.test(String(j.msg || ''));
}
async function doiMk(acc, pass) {
    acc = String(acc || '').toLowerCase(); pass = String(pass || '');
    if (!RE_GACC.test(acc) || !RE_GPASS.test(pass)) throw new Error('tên hoặc mật khẩu không hợp lệ');
    const j = await gmCall('POST', '/api/act', { a: 'doi_mk', ten: acc, mk: pass });
    if (!j || !j.ok || !j.done) throw new Error((j && (j.error || j.msg)) || 'panel GM lỗi');
    return true;
}
// GUID các nhân vật thuộc tài khoản (để tìm ví Discord đã liên kết nhân vật)
async function guidsOfAcc(acc) {
    acc = String(acc || '').toLowerCase();
    const j = await gmCall('GET', '/api/state');
    const chars = (j && j.ok && j.state && Array.isArray(j.state.chars)) ? j.state.chars : [];
    return chars.filter((c) => String(c.account || '').toLowerCase() === acc).map((c) => String(c.guid));
}

module.exports = { sendKnb, pendingIn, cleanupIn, readReceipts, finishReceipt, listChars, findChar, ensureDirs, DIR, gmCall, loadItems, items, countItem, giveItem, kiemMk, doiMk, guidsOfAcc, RE_GACC, RE_GPASS };
