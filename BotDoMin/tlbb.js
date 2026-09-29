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

module.exports = { sendKnb, pendingIn, cleanupIn, readReceipts, finishReceipt, listChars, findChar, ensureDirs, DIR };
