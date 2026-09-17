#!/usr/bin/env node
// ============================================================================
// sftp-dtmap.cjs — gửi lệnh cho mod GiveGoldCommand qua SFTP (queue.txt) rồi tải kết quả về.
// Dùng chính để đọc BẢNG SỐNG trong game bằng lệnh DTMAP (main.lua 16/09) mà không cần file game.
//
// Cách chạy (từ thư mục palworld-dashboard/server để có ssh2 trong node_modules):
//   SFTP_USER='default@...' SFTP_PASS='...' SFTP_MOD_PATH='/1. test mod/Pal/Binaries/Win64/ue4ss/Mods/GiveGoldCommand' \
//   node ../tools/sftp-dtmap.cjs "DTMAP PalMasterDataTableAccess_FieldLotteryNameData ItemSlot11_ProbabilityPercent,ItemSlot12_ProbabilityPercent Expedition_"
//   -> in các dòng MAP của khối vừa chạy; dump.log đầy đủ lưu vào ./dump-<giờ>.log
//
// Kiểm "pak nào đang thắng" (nhóm A, thám hiểm): Expedition_Grass slot 11 = 0 -> pak Z thắng; = 100 -> pak recycler-only thắng.
// Nhiều lệnh: truyền nhiều tham số, mỗi tham số 1 lệnh. Chỉ dùng cho lệnh CHỈ ĐỌC (DTINFO/DTMAP/DUMP...).
//
// ⚠️ SFTP Shockbyte: KHÔNG dùng fastPut/fastGet (xáo khúc 32KB). File này chỉ dùng stream tuần tự.
// ⚠️ Game server phải đang chạy mod (mod poll queue.txt 2s/lần). Mod chết/server tắt -> hết 90s báo timeout.
// Creds qua ENV, không hard-code. Hard-block server không phải của chủ này.
// ============================================================================
const path = require('path'); const fs = require('fs');
let Client;
try { ({ Client } = require('ssh2')); }
catch { ({ Client } = require(path.join(__dirname, '..', 'server', 'node_modules', 'ssh2'))); }

const HOST = process.env.SFTP_HOST || 'sftp.discord.sgp2.shockbyte.host';
const PORT = Number(process.env.SFTP_PORT || 2222);
const USER = process.env.SFTP_USER, PASS = process.env.SFTP_PASS, BASE = process.env.SFTP_MOD_PATH;
const CMDS = process.argv.slice(2).filter(Boolean);
if (!USER || !PASS || !BASE || !CMDS.length) {
    console.log('Thiếu SFTP_USER / SFTP_PASS / SFTP_MOD_PATH hoặc chưa truyền lệnh. Xem chú thích đầu file.');
    process.exit(1);
}
if (/50533a43|103\.72\.98\.37|MOD PALWORLD TEST/.test(USER + BASE)) { console.log('HARD-BLOCK: server không phải của chủ này'); process.exit(1); }
// Git Bash (MSYS) trên Windows tự đổi biến bắt đầu bằng "/" thành "C:/Program Files/Git/..." -> SFTP báo
// "agent with path 'C:' was not found". Chạy: MSYS_NO_PATHCONV=1 node ... hoặc dùng PowerShell/cmd.
if (/^[A-Za-z]:[\\/]/.test(BASE)) {
    console.log('SFTP_MOD_PATH bị Git Bash đổi thành đường dẫn Windows: ' + BASE);
    console.log('-> chạy lại với MSYS_NO_PATHCONV=1 đặt trước lệnh, hoặc chạy từ PowerShell/cmd.');
    process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readAll = (s, p) => new Promise((res, rej) => { const b = []; const r = s.createReadStream(p); r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); r.on('error', rej); });
const writeAll = (s, p, txt) => new Promise((res, rej) => { const w = s.createWriteStream(p, { flags: 'w' }); w.on('close', res); w.on('error', rej); w.end(txt); });

const c = new Client();
c.on('ready', () => c.sftp(async (e, sftp) => {
    if (e) { console.log('sftp err:', e.message); c.end(); process.exit(1); }
    try {
        const r0 = (await readAll(sftp, BASE + '/results.log')).toString('utf8');
        const n0 = (r0.match(/^(DTMAP|DTINFO|DUMPP?|DTROW) (OK|FAILED)/gm) || []).length;
        await writeAll(sftp, BASE + '/queue.txt', CMDS.join('\n') + '\n');
        console.log('đã ghi', CMDS.length, 'lệnh vào queue.txt, chờ mod...');
        let done = false;
        for (let i = 0; i < 30; i++) {
            await sleep(3000);
            const r = (await readAll(sftp, BASE + '/results.log')).toString('utf8');
            const n = (r.match(/^(DTMAP|DTINFO|DUMPP?|DTROW) (OK|FAILED)/gm) || []).length;
            if (n >= n0 + CMDS.length) { done = true; console.log(r.trim().split('\n').slice(-CMDS.length).map(l => '  ' + l).join('\n')); break; }
        }
        if (!done) console.log('⚠️ 90s không thấy đủ kết quả - mod có đang chạy không? (results.log không đổi)');
        const dump = (await readAll(sftp, BASE + '/dump.log')).toString('utf8');
        const out = path.resolve('dump-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.log');
        fs.writeFileSync(out, dump); console.log('dump.log ->', out, '(' + dump.length + ' B)');
        // in khối cuối của từng lệnh DTMAP (dòng MAP)
        for (const cmd of CMDS) {
            const m = /^DTMAP\s+(\S+)/.exec(cmd); if (!m) continue;
            const blocks = dump.split('=========== DTMAP ' + m[1]); const last = blocks[blocks.length - 1] || '';
            const maps = (last.match(/^\s*(HEADER|MAP) .*$/gm) || []).map(l => l.trim());
            console.log('\n== ' + cmd.slice(0, 110) + (cmd.length > 110 ? '…' : '') + ' → ' + Math.max(0, maps.length - 1) + ' dòng');
            maps.slice(0, 40).forEach(l => console.log('  ' + l)); if (maps.length > 40) console.log('  … (xem file dump)');
        }
    } catch (er) { console.log('lỗi:', er.message); }
    c.end();
})).on('error', e => { console.log('lỗi nối:', e.message); process.exit(1); })
    .connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 });
