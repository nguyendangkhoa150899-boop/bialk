// CHỈ ĐỌC server TEST: đọc ngẫu nhiên Pal-WindowsServer.pak qua SFTP -> parse index pak V11 ->
// liệt kê / rút entry (ghi từng block nén ra file + manifest để PowerShell giải Oodle).
// Dùng: node sftp_pakget.js list <regex>        | node sftp_pakget.js get <regex> <outdir>
const { Client } = require("c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/server/node_modules/ssh2");
const fs = require('fs'), path = require('path');
const env = fs.readFileSync('c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/server/.env', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const USER = get('SFTP_USERNAME'), PASS = get('SFTP_PASSWORD'), HOST = get('SFTP_HOST'), PORT = Number(get('SFTP_PORT') || 22);
if (/50533a43/.test(USER)) throw new Error('HARD-BLOCK');
const ROOT = get('SFTP_MOD_PATH').split('/Pal/')[0];
const PAK = ROOT + '/Pal/Content/Paks/Pal-WindowsServer.pak';
const [mode, rx, outdir] = process.argv.slice(2);
const RX = new RegExp(rx || 'ItemShop|PalShop', 'i');

const conn = new Client();
const p = (fn) => new Promise((res, rej) => fn((e, v) => e ? rej(e) : res(v)));
async function main(sftp) {
    const h = await p(cb => sftp.open(PAK, 'r', cb));
    const CH = 32768;
    async function readAt(pos, len) {
        const out = Buffer.alloc(len); let got = 0;
        while (got < len) {
            const n = await p(cb => sftp.read(h, out, got, Math.min(CH, len - got), pos + got, (e, nn) => cb(e, nn)));
            if (!n) throw new Error('EOF sớm tại ' + (pos + got));
            got += n;
        }
        return out;
    }
    async function probe(pos) { // true nếu còn dữ liệu tại pos
        try { const b = Buffer.alloc(1); const n = await p(cb => sftp.read(h, b, 0, 1, pos, (e, nn) => cb(e, nn))); return n === 1; } catch { return false; }
    }
    // dò kích thước: nhân đôi tới khi hết, rồi chia đôi
    let lo = 1, hi = 2;
    while (await probe(hi - 1)) { lo = hi; hi *= 2; if (hi > 64 * 1024 ** 3) throw new Error('quá lớn'); }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (await probe(mid - 1)) lo = mid; else hi = mid; }
    const size = lo;
    console.log('pak size =', size, '(' + (size / 1048576).toFixed(1) + ' MB)');
    const foot = await readAt(size - 204, 204);
    if (foot.readUInt32LE(0) !== 0x5A6F12E1) throw new Error('magic sai');
    const version = foot.readUInt32LE(4), idxOff = Number(foot.readBigUInt64LE(8)), idxSize = Number(foot.readBigUInt64LE(16));
    const methods = ['None']; for (let i = 0; i < 5; i++) { const s = foot.slice(44 + i * 32, 44 + i * 32 + 32).toString('latin1').replace(/\0.*$/, ''); if (s) methods.push(s); }
    console.log('version', version, 'index @', idxOff, 'size', idxSize, 'methods', JSON.stringify(methods));
    const idx = await readAt(idxOff, idxSize);
    let o = 0;
    const rdStr = (b) => { const n = b.readInt32LE(o); o += 4; let s; if (n >= 0) { s = b.slice(o, o + n - 1).toString('utf8'); o += n; } else { const len = -n; s = b.slice(o, o + len * 2 - 2).toString('utf16le'); o += len * 2; } return s; };
    const mount = rdStr(idx); const numEntries = idx.readInt32LE(o); o += 4; const seed = idx.readBigUInt64LE(o); o += 8;
    const hasPH = idx.readUInt32LE(o); o += 4; if (hasPH) o += 8 + 8 + 20;
    const hasFDI = idx.readUInt32LE(o); o += 4; let fdiOff = 0, fdiSize = 0; if (hasFDI) { fdiOff = Number(idx.readBigInt64LE(o)); o += 8; fdiSize = Number(idx.readBigInt64LE(o)); o += 8; o += 20; }
    const encSize = idx.readInt32LE(o); o += 4; const enc = idx.slice(o, o + encSize); o += encSize;
    console.log('mount', mount, 'entries', numEntries, 'seed', seed.toString(16), 'FDI @', fdiOff, fdiSize, 'encoded', encSize);
    const fdi = await readAt(fdiOff, fdiSize);
    o = 0; const dirCount = fdi.readInt32LE(o); o += 4; const files = [];
    for (let d = 0; d < dirCount; d++) { const dir = rdStr(fdi); const fc = fdi.readInt32LE(o); o += 4; for (let f = 0; f < fc; f++) { const fn = rdStr(fdi); const eo = fdi.readInt32LE(o); o += 4; files.push({ path: dir + fn, eo }); } }
    console.log('files total', files.length);
    const hits = files.filter(f => RX.test(f.path));
    hits.forEach(f => console.log('  ', f.path));
    if (mode !== 'get') { await p(cb => sftp.close(h, cb)); return; }
    fs.mkdirSync(outdir, { recursive: true });
    const manifest = [];
    for (const f of hits) {
        // decode encoded entry
        let q = f.eo; const v = enc.readUInt32LE(q); q += 4;
        const compIdx = (v >> 23) & 0x3f, off32 = v & (1 << 31), usz32 = v & (1 << 30), sz32 = v & (1 << 29), encrypted = v & (1 << 22), blockCount = (v >> 6) & 0xffff;
        const offset = off32 ? enc.readUInt32LE(q) : Number(enc.readBigInt64LE(q)); q += off32 ? 4 : 8;
        const usize = usz32 ? enc.readUInt32LE(q) : Number(enc.readBigInt64LE(q)); q += usz32 ? 4 : 8;
        let csize = usize; if (compIdx !== 0) { csize = sz32 ? enc.readUInt32LE(q) : Number(enc.readBigInt64LE(q)); q += sz32 ? 4 : 8; }
        let blockSize = 0; if (blockCount) { if ((v & 0x3f) === 0x3f) { blockSize = enc.readUInt32LE(q); q += 4; } else blockSize = (v & 0x3f) << 11; }
        const header = 53 + (compIdx !== 0 ? 4 + 16 * blockCount : 0);
        const blocks = [];
        if (blockCount === 1 && !encrypted) blocks.push({ start: header, end: header + csize });
        else { let start = header; for (let i = 0; i < blockCount; i++) { const bs = enc.readUInt32LE(q); q += 4; blocks.push({ start, end: start + bs }); start += bs; } }
        const method = methods[compIdx] || 'None';
        console.log('GET', f.path, 'method', method, 'usize', usize, 'csize', csize, 'blocks', blockCount, 'blockSize', blockSize);
        const base = path.join(outdir, f.path.replace(/[\/\\]/g, '__'));
        if (compIdx === 0) { const data = await readAt(offset + header, usize); fs.writeFileSync(base, data); manifest.push({ out: base, method: 'None', blocks: [], usize }); continue; }
        const parts = [];
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i]; const data = await readAt(offset + b.start, b.end - b.start);
            const bf = base + '.blk' + i; fs.writeFileSync(bf, data);
            const rawLen = i === blocks.length - 1 ? usize - blockSize * (blocks.length - 1) : blockSize;
            parts.push({ file: bf, rawLen });
        }
        manifest.push({ out: base, method, blocks: parts, usize });
    }
    fs.writeFileSync(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('manifest:', path.join(outdir, 'manifest.json'));
    await p(cb => sftp.close(h, cb));
}
conn.on('ready', () => conn.sftp((err, sftp) => { if (err) throw err; main(sftp).then(() => conn.end()).catch(e => { console.error('LỖI:', e.message); conn.end(); process.exit(1); }); }));
conn.on('error', e => console.log('conn error', e.message));
conn.connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 });
