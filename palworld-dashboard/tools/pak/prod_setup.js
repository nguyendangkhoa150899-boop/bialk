// Cài lại prod sau reset (chủ server yêu cầu 09/09): mod GiveGoldCommand, PalDefender (+Config từ test),
// 4 pak, ShockPal.ini + PalWorldSettings.ini (bAllowClientMod=False, AdminPassword cũ). Mọi file ghi xong ĐỌC LẠI so byte.
const { Client } = require("c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/server/node_modules/ssh2");
const fs = require('fs'), path = require('path');
const USER = process.env.PROD_USER, PASS = process.env.PROD_PASS;
if (!USER || !PASS || /50533a43/.test(USER)) { console.log('thiếu creds / HARD-BLOCK'); process.exit(1); }
const HOST = 'sftp.discord.sgp2.shockbyte.host', PORT = 2222;
const ROOT = '/1. Cô 4 vui vẻ';
const REPO = 'c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/';
const PD = 'c:/Users/nguye/Desktop/PalDefender (Windows-Proton-WINE) 451 1.9.1 2026-09-07T20-00Z Pjk6aEW0D/';
const ADMIN_PW = process.env.PROD_ADMIN_PW || '';   // chỉ dùng khi ini đang AdminPassword="" - truyền qua env, KHÔNG hardcode
const env = fs.readFileSync(REPO + 'server/.env', 'utf8'); const g = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim();
const TEST = { host: g('SFTP_HOST'), port: +g('SFTP_PORT'), username: g('SFTP_USERNAME'), password: g('SFTP_PASSWORD') };
const TEST_ROOT = g('SFTP_MOD_PATH').split('/Pal/')[0];

const p = (fn) => new Promise((res, rej) => fn((e, v) => e ? rej(e) : res(v)));
const readBuf = (sftp, rp) => new Promise((res) => { const ch = []; const st = sftp.createReadStream(rp); st.on('data', d => ch.push(d)); st.on('error', () => res(null)); st.on('end', () => res(Buffer.concat(ch))); });
const writeBuf = (sftp, rp, buf) => new Promise((res, rej) => { const w = sftp.createWriteStream(rp); w.on('error', rej); w.on('close', res); w.end(buf); });
const mkdirp = async (sftp, dir) => { const parts = dir.split('/').filter(Boolean); let cur = ''; for (const s of parts) { cur += '/' + s; try { await p(cb => sftp.mkdir(cur, cb)); } catch { } } };
async function put(sftp, rp, buf, label) {
    await mkdirp(sftp, path.posix.dirname(rp));
    await writeBuf(sftp, rp, buf);
    let back = await readBuf(sftp, rp); if (!back) { await new Promise(r => setTimeout(r, 1500)); back = await readBuf(sftp, rp); }
    const ok = back && back.equals(buf);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' -> ' + rp.replace(ROOT, '') + ' (' + buf.length + ' B' + (ok ? ', đọc lại khớp' : ', ĐỌC LẠI KHÔNG KHỚP') + ')');
    if (!ok) throw new Error('ghi không khớp: ' + rp);
}
function connect(cfg) { return new Promise((res, rej) => { const c = new Client(); c.on('ready', () => c.sftp((e, s) => e ? rej(e) : res({ c, s }))); c.on('error', rej); c.connect({ ...cfg, readyTimeout: 20000 }); }); }

(async () => {
    // 0. lấy Config.json PalDefender đang chạy ổn trên TEST
    const t = await connect(TEST);
    const pdCfg = await readBuf(t.s, TEST_ROOT + '/Pal/Binaries/Win64/PalDefender/Config.json');
    t.c.end();
    if (!pdCfg) throw new Error('không đọc được Config.json trên test');
    console.log('PalDefender Config.json từ test:', pdCfg.length, 'B');

    const { c, s } = await connect({ host: HOST, port: PORT, username: USER, password: PASS });
    console.log('== 1. Mod giao pal GiveGoldCommand ==');
    const modDir = ROOT + '/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand';
    await put(s, modDir + '/Scripts/main.lua', fs.readFileSync(REPO + 'ue4ss-mod/GiveGoldCommand/Scripts/main.lua'), 'main.lua');
    await put(s, modDir + '/enabled.txt', Buffer.alloc(0), 'enabled.txt');
    await put(s, modDir + '/queue.txt', Buffer.alloc(0), 'queue.txt');
    await put(s, modDir + '/results.log', Buffer.alloc(0), 'results.log');
    const modsTxtPath = ROOT + '/Pal/Binaries/Win64/ue4ss/Mods/mods.txt';
    const modsTxt = (await readBuf(s, modsTxtPath)) || Buffer.alloc(0);
    if (!/GiveGoldCommand\s*:\s*1/.test(modsTxt.toString())) {
        // chèn TRƯỚC khối "; Built-in keybinds" (UE4SS yêu cầu Keybinds đứng cuối)
        let txt = modsTxt.toString('utf8'); const i = txt.indexOf('; Built-in keybinds');
        const line = 'GiveGoldCommand : 1\r\n';
        txt = i >= 0 ? txt.slice(0, i) + line + txt.slice(i) : txt + (txt.endsWith('\n') ? '' : '\r\n') + line;
        await put(s, modsTxtPath, Buffer.from(txt, 'utf8'), 'mods.txt (+GiveGoldCommand : 1)');
    } else console.log('  ✓ mods.txt đã có GiveGoldCommand : 1');

    console.log('== 2. PalDefender 1.9.1 (đúng chỗ Win64/, không phải ue4ss/Mods) ==');
    await put(s, ROOT + '/Pal/Binaries/Win64/d3d9.dll', fs.readFileSync(PD + 'd3d9.dll'), 'd3d9.dll');
    await put(s, ROOT + '/Pal/Binaries/Win64/PalDefender.dll', fs.readFileSync(PD + 'PalDefender.dll'), 'PalDefender.dll');
    await put(s, ROOT + '/Pal/Binaries/Win64/PalDefender/Config.json', pdCfg, 'PalDefender/Config.json (bản test)');

    console.log('== 3. Pak mods ==');
    for (const n of ['BialkServer_P.pak', 'BialkNoDrop_P.pak', 'BialkRaidTimer_P.pak', 'BialkShopOff_P.pak']) await put(s, ROOT + '/Pal/Content/Paks/~mods/' + n, fs.readFileSync(REPO + 'pak-mods/' + n), n);

    console.log('== 4. Config ini ==');
    for (const f of ['ShockPal.ini', 'PalWorldSettings.ini']) {
        const rp = ROOT + '/Pal/Saved/Config/WindowsServer/' + f;
        const cur = await readBuf(s, rp); if (!cur) { console.log('  -- không đọc được', f); continue; }
        let txt = cur.toString('utf8'); const before = txt;
        const chg = [];
        if (/bAllowClientMod=True/i.test(txt)) { txt = txt.replace(/bAllowClientMod=True/gi, 'bAllowClientMod=False'); chg.push('bAllowClientMod=False'); }
        if (/AdminPassword=""/.test(txt)) { txt = txt.replace(/AdminPassword=""/, 'AdminPassword="' + ADMIN_PW + '"'); chg.push('AdminPassword=<cũ>'); }
        if (txt !== before) { fs.writeFileSync(path.join(__dirname, 'prod_' + f + '.before'), before); await put(s, rp, Buffer.from(txt, 'utf8'), f + ' [' + chg.join(', ') + ']'); }
        else console.log('  = ' + f + ' không cần đổi (bAllowClientMod=' + (txt.match(/bAllowClientMod=(\w+)/) || [])[1] + ', AdminPassword ' + (/AdminPassword=""/.test(txt) ? 'trống' : 'có') + ')');
    }
    console.log('== 5. Còn sót? =='); for (const n of ['CreativeMenu_P.pak']) console.log('  ', n, (await readBuf(s, ROOT + '/Pal/Content/Paks/~mods/' + n)) ? 'CÓ' : 'không');
    c.end(); console.log('XONG - cần RESTART server để nạp UE4SS mod + PalDefender + pak + ini');
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
