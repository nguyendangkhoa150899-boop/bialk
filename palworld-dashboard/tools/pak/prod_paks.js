// CHỈ ĐỌC prod: thử mở các pak theo tên đã biết trong ~mods, tải về scratchpad/prodmods, so với repo.
const { Client } = require("c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/server/node_modules/ssh2");
const fs = require('fs'), path = require('path');
const USER = process.env.PROD_USER, PASS = process.env.PROD_PASS;
if (!USER || !PASS) { console.log('thiếu PROD_USER/PROD_PASS'); process.exit(1); }
if (/50533a43/.test(USER)) { console.log('HARD-BLOCK'); process.exit(1); }
const ROOT = '/1. Cô 4 vui vẻ';
const MODS = ROOT + '/Pal/Content/Paks/~mods';
const REPO = 'c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/pak-mods/';
const names = ['BialkServer_P.pak', 'BialkSilvanceNoDrop_P.pak', 'BialkRaidTimer_P.pak', 'BialkSurgeryOff_P.pak', 'BialkShopOff_P.pak',
    'BialkRaidTimerLv77_P.pak', 'BialkRaidTimerLv76_P.pak', 'BialkDandilordNoDrop_P.pak', 'BialkNoDrop_P.pak', 'BialkDrop_P.pak', 'BialkSilvanceDandilordNoDrop_P.pak', 'CreativeMenu_P.pak'];
const OUT = path.resolve(__dirname, 'prodmods'); fs.mkdirSync(OUT, { recursive: true });
const conn = new Client();
const p = (fn) => new Promise((res, rej) => fn((e, v) => e ? rej(e) : res(v)));
conn.on('ready', () => conn.sftp(async (err, sftp) => {
    if (err) throw err;
    // thử readdir (Shockbyte thường chỉ trả 1 entry)
    try { const h = await p(cb => sftp.opendir(MODS, cb)); const list = await p(cb => sftp.readdir(h, cb)); console.log('readdir ~mods (không tin hoàn toàn):', list.map(x => x.filename + ' ' + (x.attrs && x.attrs.size)).join(' | ')); try { sftp.close(h, () => {}); } catch {} } catch (e) { console.log('readdir ~mods lỗi:', e.message); }
    for (const n of names) {
        const rp = MODS + '/' + n;
        const buf = await new Promise((res) => { const ch = []; const st = sftp.createReadStream(rp); st.on('data', d => ch.push(d)); st.on('error', () => res(null)); st.on('end', () => res(Buffer.concat(ch))); });
        if (!buf) { console.log('  --  ', n, ': không có'); continue; }
        fs.writeFileSync(path.join(OUT, n), buf);
        let cmp = 'không có trong repo';
        if (fs.existsSync(REPO + n)) cmp = fs.readFileSync(REPO + n).equals(buf) ? 'GIỐNG repo' : 'KHÁC repo (repo ' + fs.statSync(REPO + n).size + ' B)';
        console.log('  CÓ  ', n, buf.length, 'B ->', cmp);
    }
    conn.end();
}));
conn.on('error', e => console.log('conn error', e.message));
conn.connect({ host: 'sftp.discord.sgp2.shockbyte.host', port: 2222, username: USER, password: PASS, readyTimeout: 20000 });
