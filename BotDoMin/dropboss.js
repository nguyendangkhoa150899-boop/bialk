// 💥 Tab Drop Boss (admin SUPER): đọc/ghi bảng rơi đồ của game Thiên Long NGAY TRÊN VPS.
//
//   MonsterDropBoxs.txt : mỗi quái -> Mvalue + tối đa 20 hộp rơi (cột 4..23)
//   DropBoxContent.txt  : mỗi hộp  -> BoxValue + tối đa ~256 cặp (ItemID, Level); rơi ra 1 món trong hộp
//   MonsterAttrExTable  : tên + cấp + cờ boss (cột 15 = 1)
//
// Ghi thẳng file game (KHÔNG qua repo) - có hiệu lực sau khi RESTART game (tab 🛠️ GM).
// ⚠ Sửa xong phải đồng bộ về repo tlbbnetco4 (lay-tu-server.sh --push) trước lần cap-nhat.sh kế,
//   không thì cap-nhat ghi đè mất. Đã ghi chú ở CLAUDE.md repo game.
// Mọi đọc/ghi đều latin1 (1 byte = 1 ký tự) để giữ nguyên byte GBK/VISCII + CRLF.
const fs = require('fs');
const path = require('path');

const ROOT = process.env.TLBB_ROOT || '/opt/tlbb-root';
const GAME = path.join(ROOT, 'home/tlbb');
const F_MON = path.join(GAME, 'Public/Config/MonsterAttrExTable.txt');
const F_MDB = path.join(GAME, 'Server/Config/MonsterDropBoxs.txt');
const F_BOX = path.join(GAME, 'Server/Config/DropBoxContent.txt');
const SCENE_DIR = path.join(GAME, 'Public/Scene');
const SCRIPT_DIR = path.join(GAME, 'Public/Data/Script');
const MAP_FILE = process.env.TLBB_VISCII_MAP || '/opt/tlbb-repo/tools/viscii-map.json';
const BACKUP_DIR = '/opt/tlbb-backup';

let REV = null;
function dec(latin1Str) {
    if (!REV) { REV = {}; const m = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); for (const [c, b] of Object.entries(m)) REV[b] = c; }
    let s = '';
    for (const ch of latin1Str) { const x = ch.charCodeAt(0); s += x < 128 ? ch : (REV[x] || '?'); }
    return s;
}
function kd(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }
function readF(f) { const t = fs.readFileSync(f, 'latin1'); const eol = t.includes('\r\n') ? '\r\n' : '\n'; return { eol, lines: t.split(eol) }; }
function isRow(l) { return /^\d+\t/.test(l); }

// chèn dòng mới TRƯỚC các dòng trống cuối file (giữ nguyên đuôi file)
function insertRows(lines, rows) {
    let last = lines.length;
    while (last > 0 && lines[last - 1].trim() === '') last--;
    lines.splice(last, 0, ...rows);
}

let lastBk = 0;
function backup() {
    const now = Date.now();
    if (now - lastBk < 10 * 60 * 1000) return;   // gộp các lần lưu gần nhau vào 1 bản sao lưu
    lastBk = now;
    try {
        const d = path.join(BACKUP_DIR, 'dropui-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19));
        fs.mkdirSync(d, { recursive: true });
        fs.copyFileSync(F_MDB, path.join(d, 'MonsterDropBoxs.txt'));
        fs.copyFileSync(F_BOX, path.join(d, 'DropBoxContent.txt'));
    } catch { /* sao lưu hỏng không chặn việc lưu */ }
}

// boss xuất hiện ở đâu (quét 1 lần rồi cache tới khi bot restart)
let SPAWN = null;
function spawnMap(bossSet) {
    if (SPAWN) return SPAWN;
    const out = {};
    // ⚠ Tên file có thể chứa byte GBK: readdirSync mặc định trả UTF-8 vỡ mã -> mở lại là ENOENT.
    //   Đọc tên dạng buffer + bắt lỗi TỪNG file để 1 file hỏng không giết cả vòng quét.
    try {
        for (const nb of fs.readdirSync(SCENE_DIR, { encoding: 'buffer' })) {
            const name = nb.toString('latin1');
            if (!/_monster\.ini$/i.test(name)) continue;
            let t;
            try { t = fs.readFileSync(Buffer.concat([Buffer.from(SCENE_DIR + path.sep, 'latin1'), nb]), 'latin1'); } catch { continue; }
            for (const m of t.matchAll(/^type=(\d+)/gm)) {
                if (!bossSet.has(m[1])) continue;
                const k = name.replace(/_monster\.ini$/i, '');
                out[m[1]] = out[m[1]] ? (out[m[1]].includes(k) ? out[m[1]] : out[m[1]] + ',' + k) : k;
            }
        }
    } catch { /* thiếu thư mục scene thì bỏ qua */ }
    try {   // boss do script phó bản gọi ra (CreateMonster / DataID= / g_CreateId= / g_MonsterId=)
        const stack = [Buffer.from(SCRIPT_DIR, 'latin1')];
        while (stack.length) {
            const d = stack.pop();
            let ents;
            try { ents = fs.readdirSync(d, { encoding: 'buffer' }); } catch { continue; }
            for (const nb of ents) {
                const p = Buffer.concat([d, Buffer.from(path.sep, 'latin1'), nb]);
                const name = nb.toString('latin1');
                let st2;
                try { st2 = fs.statSync(p); } catch { continue; }
                if (st2.isDirectory()) { stack.push(p); continue; }
                if (!name.endsWith('.lua')) continue;
                let t;
                try { t = fs.readFileSync(p, 'latin1'); } catch { continue; }
                for (const m of t.matchAll(/(?:CreateMonster\w*\s*\(\s*sceneId\s*,\s*|(?:DataID|[A-Za-z0-9_]*CreateId|[A-Za-z0-9_]*MonsterId|BossId)\s*=\s*)(\d+)/g)) {
                    if (bossSet.has(m[1]) && !out[m[1]]) out[m[1]] = 'script phó bản';
                }
            }
        }
    } catch { /* nt */ }
    SPAWN = out;
    return out;
}

function parseBoxRow(c, nameOf) {
    const items = [];
    for (let i = 4; i + 1 < c.length; i += 2) if (/^\d{6,}$/.test(c[i])) items.push({ id: c[i], name: nameOf.get(c[i]) || '' });
    return { val: +c[1], items };
}

function state(catalog) {
    const nameOf = new Map((catalog || []).map((x) => [String(x.id), x.n || '']));
    // boss
    const bosses = [];
    const bossSet = new Set();
    for (const l of readF(F_MON).lines) {
        if (!isRow(l)) continue;
        const c = l.split('\t');
        if (c[14] !== '1') continue;
        const name = dec(c[1]).trim();
        bosses.push({ id: c[0], name, k: kd(name), lv: +c[3] || 0, boxes: [] });
        bossSet.add(c[0]);
    }
    // quái -> hộp
    const use = {};   // boxId -> [soBoss, soQuaiThuong]
    const byBoss = {};
    for (const l of readF(F_MDB).lines) {
        if (!isRow(l)) continue;
        const c = l.split('\t');
        const bs = c.slice(3, 23).filter((v) => /^\d+$/.test(v));
        const isB = bossSet.has(c[0]);
        if (isB) byBoss[c[0]] = { mv: +c[1], boxes: bs };
        for (const b of bs) { (use[b] = use[b] || [0, 0])[isB ? 0 : 1]++; }
    }
    // hộp
    const boxes = {};
    const want = new Set(Object.keys(use).filter((b) => use[b][0] > 0));
    for (const l of readF(F_BOX).lines) {
        if (!isRow(l)) continue;
        const c = l.split('\t');
        if (!want.has(c[0]) && +c[0] < 90000) continue;
        boxes[c[0]] = { ...parseBoxRow(c, nameOf), nBoss: (use[c[0]] || [0, 0])[0], nOther: (use[c[0]] || [0, 0])[1] };
    }
    for (const b of want) if (!boxes[b]) boxes[b] = { missing: true, val: 0, items: [], nBoss: use[b][0], nOther: use[b][1] };
    const sp = spawnMap(bossSet);
    for (const b of bosses) { const r = byBoss[b.id]; if (r) { b.mv = r.mv; b.boxes = r.boxes; } b.sp = sp[b.id] || ''; }
    bosses.sort((a, b) => a.lv - b.lv || (+a.id - +b.id));
    return { bosses, boxes };
}

function saveBox(body) {
    const id = String(body.id || '').trim();
    const val = Math.floor(Number(body.val));
    const items = (Array.isArray(body.items) ? body.items : []).map((s) => String(s).trim());
    if (!/^\d+$/.test(id)) return { error: 'ID hộp không hợp lệ' };
    if (!Number.isFinite(val) || val < 1 || val > 999999999) return { error: 'BoxValue phải từ 1 đến 999.999.999' };
    if (!items.length) return { error: 'Hộp phải có ít nhất 1 món' };
    if (items.some((s) => !/^\d{6,9}$/.test(s))) return { error: 'ID vật phẩm phải là số 6-9 chữ số' };
    const { eol, lines } = readF(F_BOX);
    const li = lines.findIndex((l) => l.split('\t')[0] === id);
    if (li < 0) return { error: 'Hộp ' + id + ' chưa có trong DropBoxContent - dùng 🧬 Tách riêng từ một hộp có sẵn' };
    const c = lines[li].split('\t');
    const cap = Math.floor((c.length - 4) / 2);
    if (items.length > cap) return { error: 'Dòng hộp này chứa tối đa ' + cap + ' món' };
    const oldLv = {};   // giữ cột Level cũ theo từng item (thường -1)
    for (let i = 4; i + 1 < c.length; i += 2) if (/^\d{6,}$/.test(c[i]) && !(c[i] in oldLv)) oldLv[c[i]] = c[i + 1];
    c[1] = String(val);
    for (let k = 0; k < cap; k++) {
        const it = items[k];
        c[4 + 2 * k] = it || '-1';
        c[5 + 2 * k] = it ? (oldLv[it] !== undefined ? oldLv[it] : '-1') : '-1';
    }
    backup();
    lines[li] = c.join('\t');
    fs.writeFileSync(F_BOX, lines.join(eol), 'latin1');
    return { id, val, items };
}

function saveBossBoxes(body) {
    const id = String(body.id || '').trim();
    let boxes = (Array.isArray(body.boxes) ? body.boxes : []).map((s) => String(s).trim());
    if (!/^\d+$/.test(id)) return { error: 'ID boss không hợp lệ' };
    boxes = [...new Set(boxes)];
    if (boxes.length > 20) return { error: 'Mỗi quái gắn tối đa 20 hộp' };
    if (boxes.some((b) => !/^\d+$/.test(b))) return { error: 'ID hộp phải là số' };
    const boxIds = new Set(readF(F_BOX).lines.filter(isRow).map((l) => l.split('\t')[0]));
    const miss = boxes.filter((b) => !boxIds.has(b));
    if (miss.length) return { error: 'Hộp chưa tồn tại: ' + miss.join(', ') };
    const { eol, lines } = readF(F_MDB);
    let li = lines.findIndex((l) => l.split('\t')[0] === id);
    backup();
    if (li < 0) {   // boss chưa từng có dòng rơi đồ -> tạo từ dòng mẫu
        const tplI = lines.findIndex(isRow);
        const c = lines[tplI].split('\t');
        c[0] = id; c[1] = '100'; c[2] = '1';
        for (let k = 0; k < 20; k++) c[3 + k] = boxes[k] || '-1';
        insertRows(lines, [c.join('\t')]);
    } else {
        const c = lines[li].split('\t');
        for (let k = 0; k < 20; k++) c[3 + k] = boxes[k] || '-1';
        lines[li] = c.join('\t');
    }
    fs.writeFileSync(F_MDB, lines.join(eol), 'latin1');
    return { id, boxes };
}

function cloneBox(body) {
    const src = String(body.box || '').trim();
    const boss = String(body.boss || '').trim();
    const { eol, lines } = readF(F_BOX);
    const li = lines.findIndex((l) => l.split('\t')[0] === src);
    if (li < 0) return { error: 'Không thấy hộp ' + src };
    const ids = new Set(lines.filter(isRow).map((l) => l.split('\t')[0]));
    let n = 90002;
    while (ids.has(String(n))) n++;
    const newId = String(n);
    const c = lines[li].split('\t');
    c[0] = newId;
    backup();
    insertRows(lines, [c.join('\t')]);
    fs.writeFileSync(F_BOX, lines.join(eol), 'latin1');
    let boxes = null;
    if (/^\d+$/.test(boss)) {   // trỏ boss sang bản sao luôn
        const mdb = readF(F_MDB);
        const bi = mdb.lines.findIndex((l) => l.split('\t')[0] === boss);
        if (bi >= 0) {
            const bc = mdb.lines[bi].split('\t');
            for (let k = 3; k <= 22; k++) if (bc[k] === src) bc[k] = newId;
            mdb.lines[bi] = bc.join('\t');
            fs.writeFileSync(F_MDB, mdb.lines.join(mdb.eol), 'latin1');
            boxes = bc.slice(3, 23).filter((v) => /^\d+$/.test(v));
        }
    }
    return { newId, boxes };
}

module.exports = { state, saveBox, saveBossBoxes, cloneBox, F_MDB, F_BOX };
