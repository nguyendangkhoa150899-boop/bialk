// Script kiểm tra (CHỈ ĐỌC): tải file .sav thật của 1 người chơi qua SFTP,
// convert sang JSON bằng palworld-save-tools, rồi tìm xem "DogCoin" nằm ở đâu
// trong cấu trúc — để biết có nằm trong file riêng của người chơi hay không
// (nếu không thấy, khả năng cao inventory nằm trong Level.sav dùng chung cả server).
// Chạy: node inspect-save.js
require('dotenv').config();
const SftpClient = require('ssh2-sftp-client');
const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SAVE_TOOLS_BIN = process.env.PALWORLD_SAVE_TOOLS_BIN
    || path.join(os.homedir(), 'palworld-tools-venv', 'bin', 'palworld-save-tools');
const TEST_PLAYER_ID = process.env.PALWORLD_TEST_PLAYER_ID;

function findDogCoin(obj, pathSoFar = '$') {
    const hits = [];
    if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) {
            obj.forEach((v, i) => hits.push(...findDogCoin(v, `${pathSoFar}[${i}]`)));
        } else {
            for (const [k, v] of Object.entries(obj)) {
                if (typeof k === 'string' && k.includes('DogCoin')) {
                    hits.push(`${pathSoFar} có KEY "${k}"`);
                }
                if (typeof v === 'string' && v.includes('DogCoin')) {
                    hits.push(`${pathSoFar}.${k} = "${v}"`);
                }
                hits.push(...findDogCoin(v, `${pathSoFar}.${k}`));
            }
        }
    } else if (typeof obj === 'string' && obj.includes('DogCoin')) {
        hits.push(`${pathSoFar} = "${obj}"`);
    }
    return hits;
}

function convertSavToJson(savPath) {
    return new Promise((resolve, reject) => {
        execFile(SAVE_TOOLS_BIN, ['--to-json', '--force', savPath], (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(savPath + '.json');
        });
    });
}

(async () => {
    if (!TEST_PLAYER_ID) {
        console.error('Thiếu PALWORLD_TEST_PLAYER_ID trong .env (lấy playerId từ check-players.js)');
        process.exit(1);
    }

    const sftp = new SftpClient();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'palworld-save-'));

    try {
        await sftp.connect({
            host: process.env.SFTP_HOST,
            port: parseInt(process.env.SFTP_PORT) || 22,
            username: process.env.SFTP_USER,
            password: process.env.SFTP_PASS,
        });

        const saveGamesRoot = 'Pal/Saved/SaveGames/0';
        console.log(`--- ${saveGamesRoot} ---`);
        const worldDirs = await sftp.list(saveGamesRoot);
        console.log(worldDirs.map(f => `${f.name}${f.type === 'd' ? '/' : ''}`).join(', '));

        let playerSavRemote = null;
        for (const dir of worldDirs) {
            if (dir.type !== 'd') continue;
            const candidate = `${saveGamesRoot}/${dir.name}/Players/${TEST_PLAYER_ID}.sav`;
            if (await sftp.exists(candidate)) { playerSavRemote = candidate; break; }
        }

        if (!playerSavRemote) {
            console.error('Không tìm thấy file .sav của player này trong bất kỳ world nào đã liệt kê ở trên.');
            return;
        }

        console.log(`--- Tìm thấy: ${playerSavRemote} ---`);
        const localSav = path.join(tmpDir, 'player.sav');
        await sftp.get(playerSavRemote, localSav);
        console.log(`Đã tải về: ${localSav}`);

        const localJson = await convertSavToJson(localSav);
        console.log(`Đã convert: ${localJson}`);

        const data = JSON.parse(fs.readFileSync(localJson, 'utf8'));
        const hits = findDogCoin(data);

        if (hits.length === 0) {
            console.log('KHÔNG tìm thấy "DogCoin" trong file .sav của player này.');
            console.log('=> Khả năng cao inventory nằm ở Level.sav (dùng chung server) — cần kiểm tra tiếp.');
        } else {
            console.log(`Tìm thấy ${hits.length} chỗ có "DogCoin":`);
            hits.forEach(h => console.log(' - ' + h));
        }
    } catch (e) {
        console.error('LỖI:', e.message);
    } finally {
        await sftp.end().catch(() => {});
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
})();
