// CHỈ ĐỌC prod sau reset: root name, config, ue4ss/mod, PalDefender, paks, save
const { Client } = require("c:/Users/nguye/Desktop/bialk-main/bialk-main/palworld-dashboard/server/node_modules/ssh2");
const USER = process.env.PROD_USER, PASS = process.env.PROD_PASS;
if (!USER || !PASS || /50533a43/.test(USER)) { console.log('thiếu creds / HARD-BLOCK'); process.exit(1); }
const conn = new Client();
const p = (fn) => new Promise((res, rej) => fn((e, v) => e ? rej(e) : res(v)));
const exists = (sftp, path) => new Promise(res => sftp.open(path, 'r', (e, h) => { if (h) sftp.close(h, () => {}); res(!e); }));
const readText = (sftp, path) => new Promise((res) => { const ch = []; const st = sftp.createReadStream(path); st.on('data', d => ch.push(d)); st.on('error', e => res(null)); st.on('end', () => res(Buffer.concat(ch).toString('utf8'))); });
conn.on('ready', () => conn.sftp(async (err, sftp) => {
    if (err) throw err;
    const h = await p(cb => sftp.opendir('/', cb)); const list = await p(cb => sftp.readdir(h, cb)); try { sftp.close(h, () => {}); } catch {}
    const names = list.map(x => x.filename); console.log('root:', JSON.stringify(names));
    const ROOT = '/' + names[0];
    const chk = async (label, path) => console.log((await exists(sftp, ROOT + path)) ? '  CÓ   ' : '  --   ', label, path);
    console.log('== core =='); await chk('server exe', '/Pal/Binaries/Win64/PalServer-Win64-Shipping.exe'); await chk('PalServer.exe', '/PalServer.exe');
    console.log('== config =='); await chk('ShockPal.ini', '/Pal/Saved/Config/WindowsServer/ShockPal.ini'); await chk('PalWorldSettings.ini', '/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini'); await chk('GameUserSettings.ini', '/Pal/Saved/Config/WindowsServer/GameUserSettings.ini');
    const ini = await readText(sftp, ROOT + '/Pal/Saved/Config/WindowsServer/ShockPal.ini');
    if (ini) console.log('  ShockPal: bAllowClientMod=' + (ini.match(/bAllowClientMod=(\w+)/) || [])[1], '| AdminPassword=' + ((ini.match(/AdminPassword="([^"]*)"/) || [])[1] ? 'có' : 'trống'), '| RESTAPIEnabled=' + (ini.match(/RESTAPIEnabled=(\w+)/) || [])[1], '| RESTAPIPort=' + (ini.match(/RESTAPIPort=(\d+)/) || [])[1], '| ServerName=' + (ini.match(/ServerName="([^"]*)"/) || [])[1]);
    const gus = await readText(sftp, ROOT + '/Pal/Saved/Config/WindowsServer/GameUserSettings.ini');
    const wid = gus ? (gus.match(/DedicatedServerName=(\w+)/) || [])[1] : null; console.log('  world id:', wid || '(chưa có)');
    if (wid) await chk('Level.sav (world cũ còn?)', '/Pal/Saved/SaveGames/0/' + wid + '/Level.sav');
    console.log('== UE4SS / mod giao pal =='); await chk('dwmapi.dll (UE4SS)', '/Pal/Binaries/Win64/dwmapi.dll'); await chk('UE4SS.dll', '/Pal/Binaries/Win64/ue4ss/UE4SS.dll'); await chk('mods.txt', '/Pal/Binaries/Win64/ue4ss/Mods/mods.txt'); await chk('GiveGoldCommand main.lua', '/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/Scripts/main.lua'); await chk('GiveGoldCommand enabled.txt', '/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/enabled.txt'); await chk('queue.txt', '/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/queue.txt'); await chk('results.log', '/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand/results.log');
    console.log('== PalDefender =='); await chk('d3d9.dll', '/Pal/Binaries/Win64/d3d9.dll'); await chk('PalDefender.dll', '/Pal/Binaries/Win64/PalDefender.dll'); await chk('Config.json', '/Pal/Binaries/Win64/PalDefender/Config.json'); await chk('(nhầm chỗ) Mods/PalDefender.dll', '/Pal/Binaries/Win64/ue4ss/Mods/PalDefender.dll');
    console.log('== paks =='); for (const n of ['BialkServer_P.pak', 'BialkNoDrop_P.pak', 'BialkRaidTimer_P.pak', 'BialkShopOff_P.pak', 'BialkSilvanceNoDrop_P.pak', 'BialkSurgeryOff_P.pak', 'CreativeMenu_P.pak']) await chk(n, '/Pal/Content/Paks/~mods/' + n);
    await chk('Pal-WindowsServer.pak', '/Pal/Content/Paks/Pal-WindowsServer.pak');
    conn.end();
}));
conn.on('error', e => console.log('conn error', e.message));
conn.connect({ host: 'sftp.discord.sgp2.shockbyte.host', port: 2222, username: USER, password: PASS, readyTimeout: 20000 });
