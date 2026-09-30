// 🏹 Đọc Audit log của game Thiên Long để biết AI đã hạ BOSS nào, lúc nào (30/09).
//
// Server ghi Server/Log/Audit_<ngày>-0.<số>.log (file mới mỗi lần restart). Mỗi món rơi là 1 dòng:
//   ITEM_CREATED,0X3C34E722,1,39910002,Nguyên Bảo Phiếu 2000,Dropped by "Lý Thu Thủy",9546, (...)(T0=2026-9-30_2:6:29 T1=...)
//   = GUID người nhận (hex), số lượng, ID món, tên món, tên quái, ID quái, giờ VN.
// Boss nào cũng rơi phiếu gần chắc (hộp phiếu BV = Mvalue) nên "dòng rơi từ boss" ≈ "lượt giết boss".
// Gom các dòng cùng boss trong 3 giây thành 1 LƯỢT GIẾT, ghi nhớ mọi GUID có tên → dbCache._bossKills.
//
// Giới hạn: chỉ tính người có tên trong dòng rơi (đồng đội không được chia món lượt đó thì không tính).
// Bước sau có thể chèn OnDie vào script boss cuối phó bản để ghi cả tổ.
const fs = require('fs');
const path = require('path');

const ROOT = process.env.TLBB_ROOT || '/opt/tlbb-root';
const LOG_DIR = path.join(ROOT, 'home/tlbb/Server/Log');
const MAP_FILE = process.env.TLBB_VISCII_MAP || '/opt/tlbb-repo/tools/viscii-map.json';
const KEEP_DAYS = 30, MAX_EVENTS = 5000, FIRST_IMPORT_DAYS = 3;

let REV = null;
function dec(s) {
    if (!REV) { REV = {}; try { const m = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); for (const [c, b] of Object.entries(m)) REV[b] = c; } catch { /* không có map: giữ nguyên */ } }
    let o = '';
    for (const ch of s) { const x = ch.charCodeAt(0); o += x < 128 ? ch : (REV[x] || '?'); }
    return o;
}

const RE = /^ITEM_CREATED,0X([0-9A-Fa-f]+),(\d+),(\d+),([^,]*),Dropped by "([^"]*)",(\d+),.*T0=(\d+)-(\d+)-(\d+)_(\d+):(\d+):(\d+)/;
const VER = 2;   // đổi số này khi cách ghi _bossKills thay đổi -> bot nạp lại từ đầu

// Cờ boss theo MonsterAttrExTable (cột 15 = 1) - Audit ghi đồ rơi của MỌI quái, chỉ giữ boss cho bảng người chơi.
const F_MON = path.join(ROOT, 'home/tlbb/Public/Config/MonsterAttrExTable.txt');
let BOSS = null;
function isBoss(id) {
    if (!BOSS) {
        BOSS = new Set();
        try { for (const l of fs.readFileSync(F_MON, 'latin1').split(/\r?\n/)) { const c = l.split('\t'); if (/^\d+$/.test(c[0]) && c[14] === '1') BOSS.add(c[0]); } } catch { /* thiếu file: coi mọi quái là thường */ }
    }
    return BOSS.has(String(id));
}

function auditFiles() {
    let names;
    try { names = fs.readdirSync(LOG_DIR); } catch { return []; }
    return names.filter((n) => /^Audit_.*\.log$/.test(n)).map((n) => { const p = path.join(LOG_DIR, n); let st; try { st = fs.statSync(p); } catch { return null; } return { name: n, path: p, mtime: st.mtimeMs, size: st.size }; }).filter(Boolean).sort((a, b) => a.mtime - b.mtime);
}

function kills(dbCache) {
    if (!Array.isArray(dbCache._bossKills)) dbCache._bossKills = [];
    return dbCache._bossKills;
}

// Nạp các dòng mới của 1 file từ offset; trả về offset mới + phần dòng dở.
function ingest(dbCache, file, off, rest, stats) {
    let fd;
    try { fd = fs.openSync(file.path, 'r'); } catch { return { off, rest }; }
    try {
        const size = fs.fstatSync(fd).size;
        if (size < off) { off = 0; rest = ''; }   // file bị cắt/ghi lại
        if (size === off) return { off, rest };
        const buf = Buffer.alloc(size - off);
        fs.readSync(fd, buf, 0, buf.length, off);
        const text = rest + buf.toString('latin1');
        const lines = text.split('\n');
        rest = lines.pop();   // dòng cuối có thể chưa đủ
        const ev = kills(dbCache);
        for (const raw of lines) {
            const m = RE.exec(raw.trim());
            if (!m) continue;
            if (/^F+$/i.test(m[1])) continue;   // 0XFFFFFFFF = không có chủ (rương, hệ thống)
            const guid = String(parseInt(m[1], 16));
            const boss = m[6];
            const t = new Date(+m[7], +m[8] - 1, +m[9], +m[10], +m[11], +m[12]).getTime();
            let e = null;
            for (let i = ev.length - 1; i >= 0 && i >= ev.length - 40; i--) { if (ev[i].boss === boss && Math.abs(ev[i].t - t) <= 3000) { e = ev[i]; break; } }
            if (!e) { e = { t, boss, name: dec(m[5]).trim(), b: isBoss(boss) ? 1 : 0, g: [] }; ev.push(e); if (e.b) stats.kills++; }
            if (!e.g.includes(guid)) e.g.push(guid);
            stats.lines++;
        }
        return { off: size, rest };
    } finally { fs.closeSync(fd); }
}

// Gọi định kỳ (10 giây). Lần đầu: nạp các file trong 3 ngày gần nhất; sau đó chỉ đọc phần mới của file mới nhất.
function poll(dbCache) {
    const files = auditFiles();
    if (!files.length) return null;
    const newest = files[files.length - 1];
    const stats = { lines: 0, kills: 0 };
    let pos = dbCache._auditPos;
    if (dbCache._auditVer !== VER) { pos = null; dbCache._bossKills = []; dbCache._auditVer = VER; }   // đổi định dạng -> nạp lại
    if (!pos || typeof pos !== 'object') {
        const cut = Date.now() - FIRST_IMPORT_DAYS * 86400000;
        for (const f of files) if (f.mtime >= cut && f !== newest) ingest(dbCache, f, 0, '', stats);
        pos = { file: newest.name, off: 0, rest: '' };
    }
    if (pos.file !== newest.name) {   // server restart -> file mới; đọc nốt file cũ rồi chuyển
        const old = files.find((f) => f.name === pos.file);
        if (old) ingest(dbCache, old, pos.off, pos.rest || '', stats);
        pos = { file: newest.name, off: 0, rest: '' };
    }
    const r = ingest(dbCache, newest, pos.off, pos.rest || '', stats);
    pos.off = r.off; pos.rest = r.rest;
    dbCache._auditPos = pos;
    // dọn: quá 30 ngày hoặc quá nhiều
    const ev = kills(dbCache);
    const cut = Date.now() - KEEP_DAYS * 86400000;
    let i = 0; while (i < ev.length && ev[i].t < cut) i++;
    if (i) ev.splice(0, i);
    if (ev.length > MAX_EVENTS) ev.splice(0, ev.length - MAX_EVENTS);
    return stats;
}

// Lượt giết có GUID này, mới nhất trước.
function forGuid(dbCache, guid, limit) {
    guid = String(guid || '');
    if (!guid) return [];
    const out = [];
    const ev = kills(dbCache);
    for (let i = ev.length - 1; i >= 0 && out.length < (limit || 200); i--) if (ev[i].b && ev[i].g.includes(guid)) out.push({ t: ev[i].t, boss: ev[i].boss, name: ev[i].name, team: ev[i].g.length });
    return out;
}

module.exports = { poll, forGuid, kills, LOG_DIR };
