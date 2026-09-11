require('dotenv').config();
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const { startPanel } = require('./panel');
const { startWebPlay } = require('./webplay');
// Cầu nối tự động nạp/rút Dogcoin với game (qua dashboard -> SFTP -> mod UE4SS).
// CHỈ dùng giveItem/takeItem (không REST, không polling) để nhẹ VPS.
const pal = require('./palworld');

// Link hiển thị cho người chơi vào web cược (đổi trong .env nếu khác)
const WEB_PLAY_URL = process.env.WEB_PLAY_URL || 'http://103.72.98.37:3002';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const TOKEN = process.env.TOKEN;
const DATA_FILE = './database.json';
const STARTING_DOGCOIN = 20;
// 🪪 04/09: mức điểm danh / nghiện / thưởng chuỗi cho ADMIN CHỈNH ở panel
// (tab 👥 Ví điểm người chơi), lưu dbCache._dailyCfg - trước là hằng cứng.
// Mặc định giữ nguyên số cũ: điểm danh 600 · nghiện 200 · đủ 2 ngày thưởng 800.
const DAILY_CFG_DEF = { daily: 600, nghien: 200, streakEvery: 2, streakBonus: 800 };
function dailyCfg() {
    const c = dbCache._dailyCfg && typeof dbCache._dailyCfg === 'object' ? dbCache._dailyCfg : {};
    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.floor(n) : d; };
    return {
        daily: num(c.daily, DAILY_CFG_DEF.daily, 0, 100000000),
        nghien: num(c.nghien, DAILY_CFG_DEF.nghien, 0, 100000000),
        streakEvery: num(c.streakEvery, DAILY_CFG_DEF.streakEvery, 1, 365),
        streakBonus: num(c.streakBonus, DAILY_CFG_DEF.streakBonus, 0, 100000000),
    };
}
const NGHIEN_COOLDOWN_MS = 60 * 60 * 1000;
// THƯỞNG CHUỖI (thay bonus đủ tháng cũ): cứ điểm danh đủ 2 NGÀY LIÊN TIẾP thì ghi
// 1 gói 800 vào sổ, người chơi tự bấm nhận. Gói đã ghi là của họ, chuỗi có đứt sau
// đó cũng không mất. Nhiều gói chưa nhận thì bấm 1 lần lấy hết.
// (DAILY_STREAK_EVERY/BONUS đã chuyển vào dailyCfg() - admin chỉnh ở panel, 04/09)
// Kênh đăng công khai mỗi lần có người lụm nghiện (cả /nghien lẫn nút trên web)
const NGHIEN_ANNOUNCE_CHANNEL_ID = '1538752789499347037';
const DOGCOIN_EMOJI = '<:dogcoin:1533903243028205579>';
const DOGCOIN_EMOJI_ID = '1533903243028205579';
// /addtienall: role được tag + kênh đăng thông báo phát Dogcoin toàn server
const GIVEAWAY_PING_ROLE_ID = '1535223682857705522';
const GIVEAWAY_ANNOUNCE_CHANNEL_ID = '1535224374897016862';

// --- HỆ THỐNG GHI LOG CHIA FILE ---
const LOG_SYSTEM = './log_system.txt'; // lỗi, crash, khởi động bot
const LOG_RESULT = './log_result.txt'; // kết quả bầu cua + lớn nhỏ + dò mìn
const LOG_BET = './log_bet.txt';       // cược + kết quả ván, 3 game
const LOG_ADMIN = './log_admin.txt';   // toàn bộ thao tác admin

const LOG_MAX_LINES = {
    RESULT: 2000,
    ADMIN:  1000,
    BET:    1000,
    SYSTEM:  500
};

function writeLog(category, message) {
    const time = new Date().toLocaleString('vi-VN');
    const entry = `[${time}] ${message}`;

    let targetFile = LOG_SYSTEM;
    if (category === 'RESULT') targetFile = LOG_RESULT;
    else if (category === 'BET') targetFile = LOG_BET;
    else if (category === 'ADMIN') targetFile = LOG_ADMIN;

    console.log(`[${category}] ${entry}`);

    try {
        let lines = [];
        if (fs.existsSync(targetFile)) {
            const data = fs.readFileSync(targetFile, 'utf8');
            lines = data.split('\n').filter(line => line.trim() !== '');
        }
        lines.push(entry);
        const maxLines = LOG_MAX_LINES[category] || 1000;
        if (lines.length > maxLines) {
            lines = lines.slice(lines.length - maxLines);
        }
        fs.writeFileSync(targetFile, lines.join('\n') + '\n');
    } catch (err) {
        console.error(`Lỗi ghi log ${category}:`, err);
    }
}

// --- HỆ THỐNG DATABASE TỐI ƯU (RAM CACHE) ---
let dbCache = {};

if (fs.existsSync(DATA_FILE)) {
    try {
        dbCache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        console.error("Lỗi đọc file database ban đầu, tạo mới.");
        dbCache = {};
    }
} else {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

// ẢNH CHỤP cược đang treo của PHIÊN TRƯỚC - đọc NGAY khi vừa nạp database, trước
// khi syncCache/vòng lưu 10s kịp ghi đè bằng state rỗng của phiên mới. Hoàn tiền ở
// refundBootPendingBets() lúc client ready. (Fix 19/08: trước đây TX/BC/Mìn/Thang
// giữ ván thuần RAM - mỗi lần restart là tiền cược của ván dở mất trắng.)
const bootPendingBets = {
    tx: Array.isArray(dbCache._txBets) ? dbCache._txBets : [],
    bc: Array.isArray(dbCache._bcBets) ? dbCache._bcBets : [],
    mines: (dbCache._minesPending && typeof dbCache._minesPending === 'object') ? dbCache._minesPending : {},
    stairs: (dbCache._stairsPending && typeof dbCache._stairsPending === 'object') ? dbCache._stairsPending : {},
};

// Gom các mảng đang giữ ở RAM vào dbCache trước khi ghi ra file.
function syncCache() {
    dbCache._minesHistory = minesHistory;
    dbCache._txDashHistory = txDashHistory;
    dbCache._withdrawRequests = withdrawRequests;
    dbCache._withdrawSeq = withdrawSeq;
    // Xổ số: cược đang treo là TIỀN THẬT đã trừ ví -> bắt buộc giữ qua restart
    dbCache._xsBets = xsState.bets;
    dbCache._xsRound = xsState.round;
    dbCache._xsForced = xsState.forced;
    dbCache._xsHistory = xsState.history;
    dbCache._xsResultMsgIds = xsState.resultMsgIds;
    // Big Small: cược ván đang mở cũng là tiền thật đã trừ ví - giữ để restart còn
    // biết đường hoàn (bảng kết ván bình thường sẽ tự rỗng lại).
    dbCache._txBets = txState.bets || [];
    // (Dò Mìn / Leo Thang ghi thẳng vào dbCache._minesPending/_stairsPending lúc
    //  vào/kết ván - không cần gom ở đây.)
}

// Sổ vé đang treo của Dò Mìn / Leo Thang: {userId: tiềnCược} - vào ván ghi, kết ván
// xóa. Nằm trong dbCache nên đi cùng mọi lần lưu, restart đọc lại hoàn được.
function minesPending() {
    if (!dbCache._minesPending || typeof dbCache._minesPending !== 'object') dbCache._minesPending = {};
    return dbCache._minesPending;
}
function stairsPending() {
    if (!dbCache._stairsPending || typeof dbCache._stairsPending !== 'object') dbCache._stairsPending = {};
    return dbCache._stairsPending;
}

// Hoàn tiền cược treo từ phiên trước - gọi 1 lần lúc client ready.
function refundBootPendingBets() {
    let count = 0, total = 0;
    const give = (uid, amount, label) => {
        if (!uid || !Number.isFinite(amount) || amount <= 0) return;
        updatePoints(uid, amount);
        count++; total += amount;
        writeLog('SYSTEM', `[HOÀN CƯỢC RESTART] ${label}: hoàn ${amount.toLocaleString()} cho ${uid}`);
    };
    for (const b of bootPendingBets.tx) give(b && b.userId, b && b.amount, 'Big Small');
    for (const b of bootPendingBets.bc) give(b && b.userId, b && b.amount, 'Bầu Cua');
    for (const [uid, bet] of Object.entries(bootPendingBets.mines)) give(uid, bet, 'Dò Mìn');
    for (const [uid, bet] of Object.entries(bootPendingBets.stairs)) give(uid, bet, 'Leo Thang');
    dbCache._minesPending = {};
    dbCache._stairsPending = {};
    if (count) {
        saveDbNow();
        writeLog('ADMIN', `[HOÀN CƯỢC RESTART] Hoàn ${count} khoản, tổng ${total.toLocaleString()} Dogcoin (ván dở trước restart)`);
    }
}

// Ghi ATOMIC: ghi ra file .tmp rồi rename đè lên database.json - process bị kill /
// mất điện GIỮA lúc ghi thì file cũ vẫn nguyên vẹn (trước đây ghi đè thẳng, đứt giữa
// chừng là JSON cụt nửa file = mất sạch ví cả server). Bỏ pretty-print: file nhỏ
// ~2.5 lần, stringify nhanh hơn - trên VPS xem bằng `jq . database.json` khi cần.
const DATA_TMP = DATA_FILE + '.tmp';
let lastDbJson = ''; // vòng 10s so chuỗi: không có gì đổi thì khỏi chạm đĩa
function writeDbAtomicSync() {
    const json = JSON.stringify(dbCache);
    fs.writeFileSync(DATA_TMP, json);
    fs.renameSync(DATA_TMP, DATA_FILE);
    lastDbJson = json;
}

// Ghi thẳng xuống file ngay (dùng cho thao tác quan trọng như xóa ví, không đợi 10s).
function saveDbNow() {
    syncCache();
    try {
        writeDbAtomicSync();
    } catch (err) {
        writeLog('SYSTEM', `[LỖI DATABASE] Không thể lưu file database: ${err.message}`);
    }
}

setInterval(() => {
    syncCache();
    try {
        if (JSON.stringify(dbCache) === lastDbJson) return; // đêm vắng không ai chơi: 0 lần ghi
        writeDbAtomicSync();
    } catch (err) {
        writeLog('SYSTEM', `[LỖI DATABASE] Không thể lưu file database: ${err.message}`);
    }
}, 10000);

// Tên hiển thị ép cứng cho vài ID quen (cho dễ nhìn trên bàn game). ID khác chạy như cũ.
const NAME_OVERRIDE = {
    '456136500011335698': 'BiaLK',
    '875643315733790740': 'HoangFour',
    '464666163591249934': 'Anh Vinh Q',
    '537485304819351552': 'Hân Z',
};

function getUserData(userId) {
    if (!dbCache[userId]) {
        dbCache[userId] = { points: STARTING_DOGCOIN, lastDaily: 0 };
    } else if (typeof dbCache[userId] === 'number') {
        dbCache[userId] = { points: dbCache[userId], lastDaily: 0 };
    }
    if (NAME_OVERRIDE[userId]) dbCache[userId].name = NAME_OVERRIDE[userId]; // ép tên quen
    return dbCache[userId];
}

function updatePoints(userId, amount) {
    const data = getUserData(userId);
    data.points += amount;
}

// ===== SỔ GHI BIẾN ĐỘNG DOGCOIN =====
// Chỉ ghi các khoản ĐIỀU CHỈNH và CHUYỂN ĐỔI (admin cộng/trừ, chuyển giữa người chơi,
// chuyển vào/ra game, mua pal). CỐ TÌNH không ghi tiền cược thắng/thua của mini game -
// mỗi ván 3 game đều sinh giao dịch, ghi hết thì sổ thành rác không tra được gì.
function logDog(type, userId, username, amount, note) {
    if (!Array.isArray(dbCache._dogLedger)) dbCache._dogLedger = [];
    dbCache._dogLedger.unshift({
        time: new Date().toLocaleString('vi-VN'),
        ts: Date.now(),
        type,                 // 'admin+' | 'admin-' | 'transfer' | 'to-game' | 'from-game' | 'shop' | 'refund'
        userId,
        username: username || userId,
        amount,               // dương = cộng vào ví Discord, âm = trừ
        balance: getUserData(userId).points || 0,
        note: note || '',
    });
    if (dbCache._dogLedger.length > 500) dbCache._dogLedger.length = 500;

    // Nuôi bảng THỐNG KÊ 📊 - mọi biến động "hệ thống" đều đi qua logDog nên móc 1 chỗ
    if (type === 'admin+' || type === 'admin-') statAdd(userId, 'adminIn', amount);
    else if (type === 'transfer') statAdd(userId, amount < 0 ? 'sentOut' : 'recvIn', Math.abs(amount));
    else if (type === 'to-game') statAdd(userId, 'toGame', Math.abs(amount));
    else if (type === 'from-game') statAdd(userId, 'fromGame', amount);
}

// ===== THỐNG KÊ TÍCH LŨY THEO NGƯỜI CHƠI (bảng 📊 trên Discord) =====
// Đếm TỪ LÚC TÍNH NĂNG BẬT: sổ cái chỉ giữ 500 dòng gần nhất nên không dựng lại
// được lịch sử cũ trung thực - thà bắt đầu từ 0 còn hơn số nửa đúng nửa sai.
// Lưu trong dbCache._pstats nên sống qua restart.
const STAT_KEYS = ['adminIn', 'sentOut', 'recvIn', 'toGame', 'fromGame', 'tx', 'mines', 'stairs', 'bj', 'jpCount', 'jpTotal'];
function statsOf(userId) {
    if (!dbCache._pstats) dbCache._pstats = {};
    if (!dbCache._pstats[userId]) dbCache._pstats[userId] = {};
    const s = dbCache._pstats[userId];
    // backfill: bản ghi tạo từ phiên bản cũ thiếu cột mới -> đắp 0, kẻo cộng ra NaN
    for (const k of STAT_KEYS) if (typeof s[k] !== 'number') s[k] = 0;
    return s;
}
function statAdd(userId, key, delta) {
    if (!userId || !Number.isFinite(delta) || !delta) return;
    statsOf(userId)[key] += delta;
    // (bảng 📊 hiển thị đã bỏ 19/08 - số liệu vẫn đếm ngầm trong _pstats, muốn xem
    //  lại thì dựng bảng từ git history là có dữ liệu đầy đủ từ trước tới giờ)
}

// ===== CHUYỂN DOGCOIN GIỮA NGƯỜI CHƠI - nút 🧧 Lộc lá trên web =====
// Cùng luật với lệnh /chuyentien trong Discord, thêm 2 lớp bảo vệ vì web dễ spam hơn:
//  - chỉ chuyển cho người ĐÃ CÓ VÍ (từng chơi / được liên kết) - dán nhầm ID lạ là
//    tiền bay vào ví ma không ai nhận, nên chặn từ đầu;
//  - mỗi người 10 giây mới được chuyển 1 lần - kênh thông báo không bị dội bom.
const TRANSFER_ANNOUNCE_CHANNEL = '1538752789499347037';
const transferLastAt = new Map(); // userId -> lần chuyển gần nhất (ms)

function webTransfer(fromId, toId, amount) {
    toId = String(toId || '').trim();
    amount = Math.floor(Number(amount));
    if (!/^\d{15,20}$/.test(toId)) return { error: 'ID người nhận không hợp lệ' };
    if (toId === fromId) return { error: 'Không thể tự chuyển cho mình!' };
    if (!Number.isInteger(amount) || amount < 1) return { error: 'Số Dogcoin không hợp lệ' };
    if (!dbCache[toId] || typeof dbCache[toId] !== 'object') return { error: 'Người này chưa có ví (chưa từng chơi)' };
    const last = transferLastAt.get(fromId) || 0;
    if (Date.now() - last < 10000) return { error: 'Từ từ - 10 giây mới được chuyển 1 lần' };
    const me = getUserData(fromId);
    if ((me.points || 0) < amount) return { error: 'Không đủ Dogcoin!' };
    // Chỉ NỢ XẤU (admin gắn) mới cấm chuyển cho người khác - nợ thường vẫn chuyển
    // bình thường (chủ server chốt 20/08). Chặn để dân nợ xấu khỏi tuồn tiền qua nick phụ.
    debtAccrue(fromId);
    if (debtOf(me).bad) return { error: `⚠️ Đang bị gắn NỢ XẤU (nợ ${debtTotal(me).toLocaleString()}) - trả nợ (nút 💳 ở bảng 📒 VAY NỢ) rồi nhờ admin gỡ nhãn mới chuyển được.` };

    transferLastAt.set(fromId, Date.now());
    const fromName = me.name || fromId;
    const toName = getUserData(toId).name || toId;
    updatePoints(fromId, -amount);
    updatePoints(toId, amount);
    logDog('transfer', fromId, fromName, -amount, `chuyển cho ${toName} (web)`);
    logDog('transfer', toId, toName, amount, `nhận từ ${fromName} (web)`);
    writeLog('ADMIN', `[CHUYỂN TIỀN][WEB] ${fromName} → ${toName} | ${amount.toLocaleString()} Dogcoin`);
    // 27/08: người NHẬN đang nợ xấu -> tiền vừa nhận bị xiết thẳng trả nợ (chừa sàn 1.000)
    debtBadSweep(toId);

    // Thông báo Discord - giữ nguyên khuôn của /chuyentien
    client.channels.fetch(TRANSFER_ANNOUNCE_CHANNEL).then(ch => ch.send({
        embeds: [new EmbedBuilder().setTitle('💸 GIAO DỊCH')
            .setDescription(`✅ <@${fromId}> đã chuyển **${amount.toLocaleString()}** ${DOGCOIN_EMOJI} cho <@${toId}>!`)
            .setColor(0x00aeef)],
    })).catch(e => writeLog('SYSTEM', `[CHUYỂN TIỀN] Không gửi được thông báo: ${e.message}`));

    // Và một dòng vào 💬 Chat sòng trên web (cùng kho _webChat với chat thường)
    if (!Array.isArray(dbCache._webChat)) dbCache._webChat = [];
    dbCache._webChat.push({
        u: 'sys-transfer', name: '💸 GIAO DỊCH',
        text: `${fromName} đã chuyển ${amount.toLocaleString()} Dogcoin cho ${toName}!`, ts: Date.now(),
    });
    while (dbCache._webChat.length > 100) dbCache._webChat.shift();

    return { ok: true, balance: getUserData(fromId).points || 0, toName };
}

// 💸 03/09: chuyển cho NHIỀU người 1 lần (tick chọn từ danh sách, MỖI NGƯỜI nhận cùng
// số tiền, trừ tổng = tiền × số người). Vẫn 10s/lần dùng chung đồng hồ với chuyển đơn;
// gộp 1 thông báo Discord + 1 dòng chat sòng cho đỡ rác kênh.
function webTransferMulti(fromId, toIds, amount) {
    const ids = [...new Set((Array.isArray(toIds) ? toIds : []).map(x => String(x || '').trim()))];
    amount = Math.floor(Number(amount));
    if (!ids.length) return { error: 'Chọn ít nhất 1 người nhận' };
    if (ids.length > 20) return { error: 'Tối đa 20 người/lần' };
    if (!Number.isInteger(amount) || amount < 1) return { error: 'Số Dogcoin không hợp lệ' };
    for (const id of ids) {
        if (!/^\d{15,20}$/.test(id)) return { error: 'ID người nhận không hợp lệ' };
        if (id === fromId) return { error: 'Không thể tự chuyển cho mình!' };
        if (!dbCache[id] || typeof dbCache[id] !== 'object') return { error: `Có người trong danh sách chưa có ví (${id})` };
    }
    const last = transferLastAt.get(fromId) || 0;
    if (Date.now() - last < 10000) return { error: 'Từ từ - 10 giây mới được chuyển 1 lần' };
    const total = amount * ids.length;
    const me = getUserData(fromId);
    if ((me.points || 0) < total) return { error: `Không đủ Dogcoin! Cần ${total.toLocaleString()} (${amount.toLocaleString()} × ${ids.length} người), bạn có ${(me.points || 0).toLocaleString()}` };
    debtAccrue(fromId);
    if (debtOf(me).bad) return { error: `⚠️ Đang bị gắn NỢ XẤU (nợ ${debtTotal(me).toLocaleString()}) - trả nợ (nút 💳 ở bảng 📒 VAY NỢ) rồi nhờ admin gỡ nhãn mới chuyển được.` };

    transferLastAt.set(fromId, Date.now());
    const fromName = me.name || fromId;
    const names = [];
    updatePoints(fromId, -total);
    logDog('transfer', fromId, fromName, -total, `chuyển cho ${ids.length} người × ${amount.toLocaleString()} (web)`);
    for (const id of ids) {
        const toName = getUserData(id).name || id;
        names.push(toName);
        updatePoints(id, amount);
        logDog('transfer', id, toName, amount, `nhận từ ${fromName} (web${ids.length > 1 ? ', chuyển nhóm' : ''})`);
        debtBadSweep(id);   // người nhận nợ xấu -> tiền vừa nhận bị xiết trả nợ
    }
    writeLog('ADMIN', `[CHUYỂN TIỀN][WEB] ${fromName} → ${names.join(', ')} | ${amount.toLocaleString()} × ${ids.length} = ${total.toLocaleString()} Dogcoin`);
    client.channels.fetch(TRANSFER_ANNOUNCE_CHANNEL).then(ch => ch.send({
        embeds: [new EmbedBuilder().setTitle('💸 GIAO DỊCH')
            .setDescription(`✅ <@${fromId}> đã chuyển **${amount.toLocaleString()}** ${DOGCOIN_EMOJI} cho ${ids.map(id => `<@${id}>`).join(', ')}${ids.length > 1 ? ` (tổng **${total.toLocaleString()}** ${DOGCOIN_EMOJI})` : ''}!`)
            .setColor(0x00aeef)],
    })).catch(e => writeLog('SYSTEM', `[CHUYỂN TIỀN] Không gửi được thông báo: ${e.message}`));
    if (!Array.isArray(dbCache._webChat)) dbCache._webChat = [];
    dbCache._webChat.push({
        u: 'sys-transfer', name: '💸 GIAO DỊCH',
        text: `${fromName} đã chuyển ${amount.toLocaleString()} Dogcoin cho ${names.join(', ')}!`, ts: Date.now(),
    });
    while (dbCache._webChat.length > 100) dbCache._webChat.shift();
    return { ok: true, balance: getUserData(fromId).points || 0, names, total };
}

// Danh sách người nhận cho ô tìm trên web: ai có ví là hiện (id + tên đã liên kết).
// KHÔNG kèm số dư - không để cả sòng soi ví nhau. excludeId = bỏ chính mình khỏi list.
function listTransferTargets(excludeId) {
    const out = [];
    for (const [k, v] of Object.entries(dbCache)) {
        if (k.startsWith('_') || !/^\d{15,20}$/.test(k)) continue;
        if (!v || typeof v !== 'object') continue;
        if (excludeId && k === excludeId) continue;
        out.push({ id: k, name: NAME_OVERRIDE[k] || v.name || '' });
    }
    return out;
}

// 🎮 RÚT Dogcoin vào game (ví Discord -> túi game): trừ ví TRƯỚC, giveItem DogCoin. Hụt
// CHẮC CHẮN (dashboard chết / player not found) -> hoàn; mơ hồ (timeout) -> giữ + báo admin
// (chống double-give). Dùng chung khoá giao đơn (deliverBusy) + trần WITHDRAW_MAX như cầu Discord.
// 🔁 09/09: công tắc cầu Dogcoin web ↔ game (panel SUPER tab 👥). rut = web -> game, nap = game -> web.
// Mặc định MỞ cả 2; lưu dbCache._dogBridge. Đóng = từ chối ngay ở đầu hàm, web khoá nút + ghi lý do.
function dogBridgeCfg() { const o = dbCache._dogBridge; return { rut: !(o && o.rut === false), nap: !(o && o.nap === false) }; }
function setDogBridge(key, on) {
    if (!['rut', 'nap'].includes(key)) return { error: 'Chiều không hợp lệ (rut/nap)' };
    if (!dbCache._dogBridge || typeof dbCache._dogBridge !== 'object') dbCache._dogBridge = {};
    dbCache._dogBridge[key] = !!on;
    saveDbNow();
    writeLog('ADMIN', `[CẦU DOGCOIN] Panel ${on ? 'MỞ' : 'ĐÓNG'} chiều ${key === 'rut' ? 'RÚT web → game' : 'NẠP game → web'}`);
    return { ok: true, key, open: !!on, cfg: dogBridgeCfg() };
}
// 📅 11/09: HẠN NGÀY cầu Dogcoin - MỖI NGƯỜI, MỖI CHIỀU (rút web→game / nạp game→web), tổng trong ngày (giờ VN).
// Chủ server: "chuyển tối đa 10.000 Dogcoin từ game ra web và ngược lại, limit 1 ngày, admin set được".
// dbCache._dogBridgeDayMax (mặc định 10.000, 0 = không giới hạn). Đếm ở user.dogDay { day, rut, nap }.
// Trần mỗi lần (WITHDRAW_MAX_PER_REQUEST 500k) vẫn giữ - hạn ngày nhỏ hơn nên thực tế hạn ngày chặn trước.
const DOG_BRIDGE_DAY_DEF = 10000;
function dogBridgeDayMax() {
    const v = Number(dbCache._dogBridgeDayMax);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : DOG_BRIDGE_DAY_DEF;
}
function setDogBridgeDayMax(v) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v) || v < 0 || v > 1000000000) return { error: 'Hạn chuyển/ngày phải là số 0–1.000.000.000 (0 = không giới hạn)' };
    dbCache._dogBridgeDayMax = v;
    saveDbNow();
    writeLog('ADMIN', `[CẦU DOGCOIN] Panel đặt hạn chuyển mỗi người/chiều/ngày = ${v ? v.toLocaleString() : 'không giới hạn'}`);
    return { ok: true, dayMax: v };
}
function dogBridgeToday(user) {
    const d = vnDayISO(Date.now());
    if (!user.dogDay || user.dogDay.day !== d) user.dogDay = { day: d, rut: 0, nap: 0 };
    return user.dogDay;
}
function dogBridgeDayCheck(user, key, amount) {
    const dayMax = dogBridgeDayMax();
    if (dayMax <= 0) return null;
    const used = dogBridgeToday(user)[key] || 0;
    if (used + amount <= dayMax) return null;
    const left = Math.max(0, dayMax - used);
    const lb = key === 'rut' ? 'rút vào game' : 'nạp ra web';
    return left
        ? `📅 Mỗi người ${lb} tối đa ${dayMax.toLocaleString()} Dogcoin/ngày - hôm nay bạn còn ${left.toLocaleString()}`
        : `📅 Hôm nay bạn đã ${lb} đủ ${dayMax.toLocaleString()} Dogcoin - mai 00:00 chuyển tiếp`;
}
async function webRutGame(userId, amount) {
    if (!dogBridgeCfg().rut) return { error: '⛔ Rút Dogcoin vào game đang ĐÓNG - admin tạm khoá chiều này' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < 1) return { error: 'Số Dogcoin không hợp lệ' };
    if (amount > WITHDRAW_MAX_PER_REQUEST) return { error: `Mỗi lần tối đa ${WITHDRAW_MAX_PER_REQUEST.toLocaleString()} Dogcoin` };
    const u = getUserData(userId);
    const dayErr = dogBridgeDayCheck(u, 'rut', amount);   // 📅 hạn ngày
    if (dayErr) return { error: dayErr };
    debtAccrue(userId);
    if (debtOf(u).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới chuyển vào game được' };
    if ((u.points || 0) < amount) return { error: `Không đủ Dogcoin (bạn có ${(u.points || 0).toLocaleString()})` };
    const gameName = (u.ingameName || '').trim();
    if (!gameName) return { error: 'Chưa liên kết tên nhân vật trong game - nhắn admin liên kết trước đã' };
    if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi thử lại (chưa trừ đồng nào)' };
    deliverLock();
    const on = await requireOnline(gameName);
    if (on.unknown) { deliverUnlock(); return { error: `Không kiểm tra được trạng thái online (${on.msg || 'timeout'}) - thử lại sau (chưa trừ đồng nào)` }; }
    if (!on.online) { deliverUnlock(); return { error: `Nhân vật ${gameName} chưa online trong game - vào game rồi rút nhé (chưa trừ đồng nào)` }; }
    updatePoints(userId, -amount);
    dogBridgeToday(u).rut += amount;   // 📅 tính vào hạn ngày lúc trừ ví
    logDog('to-game', userId, u.name || userId, -amount, `rút vào game (web, nhân vật ${gameName})`);
    saveDbNow();
    let r = null, err = null;
    try { r = await pal.giveItem(gameName, 'DogCoin', amount); } catch (e) { err = e; }
    deliverUnlock();
    if (r && r.ok) {
        writeLog('ADMIN', `[RÚT WEB] ${u.name || userId} chuyển ${amount} Dogcoin vào game "${gameName}"`);
        return { ok: true, message: `✅ Đã giao ${amount.toLocaleString()} Dogcoin vào túi ${gameName} trong game!`, balance: getUserData(userId).points || 0 };
    }
    const msg = (r && r.message) || (err && err.message) || 'không nhận được phản hồi';
    if (/lỗi 404|lỗi 401|fetch failed|ECONNREFUSED|aborted|player not found/i.test(msg)) {
        updatePoints(userId, amount);
        dogBridgeToday(u).rut = Math.max(0, dogBridgeToday(u).rut - amount);   // 📅 chưa giao -> trả lại hạn
        logDog('refund', userId, u.name || userId, amount, `hoàn rút web (chưa giao: ${msg})`);
        saveDbNow();
        return { error: `↩️ Chưa giao được (${/player not found/i.test(msg) ? 'chưa online/sai tên' : 'hệ thống bảo trì'}) - đã hoàn ${amount.toLocaleString()} Dogcoin` };
    }
    writeLog('ADMIN', `[RÚT WEB LỖI] ${u.name || userId} ${amount} -> "${gameName}" | ${msg} - ví đã trừ, kiểm results.log rồi hoàn tay nếu chưa nhận`);
    return { error: `⏳ Chưa xác nhận được với game - ví đã trừ, admin sẽ kiểm (không nhận được sẽ hoàn). Đừng rút lại kẻo trùng.`, balance: getUserData(userId).points || 0 };
}
// 🎮 NẠP Dogcoin từ game (túi game -> ví Discord): takeItem trước (trừ trong game), rồi cộng
// ví ĐÚNG số đã lấy được (r.took) - an toàn, không cộng khống, không mất tiền game.
async function webNapGame(userId, amount) {
    if (!dogBridgeCfg().nap) return { error: '⛔ Nạp Dogcoin ra web đang ĐÓNG - admin tạm khoá chiều này' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < 1) return { error: 'Số Dogcoin không hợp lệ' };
    if (amount > WITHDRAW_MAX_PER_REQUEST) return { error: `Mỗi lần tối đa ${WITHDRAW_MAX_PER_REQUEST.toLocaleString()} Dogcoin` };
    const u = getUserData(userId);
    const dayErrN = dogBridgeDayCheck(u, 'nap', amount);   // 📅 hạn ngày
    if (dayErrN) return { error: dayErrN };
    const gameName = (u.ingameName || '').trim();
    if (!gameName) return { error: 'Chưa liên kết tên nhân vật trong game - nhắn admin liên kết trước đã' };
    if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi thử lại' };
    deliverLock();
    const on = await requireOnline(gameName);
    if (on.unknown) { deliverUnlock(); return { error: `Không kiểm tra được trạng thái online (${on.msg || 'timeout'}) - thử lại sau` }; }
    if (!on.online) { deliverUnlock(); return { error: `Nhân vật ${gameName} chưa online trong game - vào game rồi nạp nhé` }; }
    if (typeof on.count === 'number' && on.count < amount) { deliverUnlock(); return { error: `Túi game chỉ có ${on.count.toLocaleString()} Dogcoin (cần ${amount.toLocaleString()}) - chỉ tính Dogcoin TRONG TÚI, không tính trong hòm` }; }
    let r = null, err = null;
    try { r = await pal.takeItem(gameName, 'DogCoin', amount); } catch (e) { err = e; }
    deliverUnlock();
    if (r && r.ok && r.took > 0) {
        updatePoints(userId, r.took);
        dogBridgeToday(u).nap += r.took;   // 📅 đếm đúng số đã lấy được
        logDog('from-game', userId, u.name || userId, r.took, `nạp từ game (web, nhân vật ${gameName})`);
        debtBadSweep(userId);
        saveDbNow();
        return { ok: true, message: `✅ Đã chuyển ${r.took.toLocaleString()} Dogcoin từ game vào ví!`, balance: getUserData(userId).points || 0 };
    }
    const msg = (r && r.message) || (err && err.message) || 'không rõ kết quả';
    writeLog('ADMIN', `[NẠP WEB LỖI] ${u.name || userId} ${amount} từ "${gameName}" | took=${r ? r.took : '?'} | ${msg}`);
    return { error: `⏳ Chưa nạp được (${msg}) - chưa cộng ví. Thử lại; nếu trong game đã trừ mà ví chưa cộng thì báo admin.` };
}

// ===== 📒 VAY NỢ - bảng nút trong kênh Discord, KHÔNG dùng lệnh =====
// Luật chủ server chốt 20/08:
//  - Vay tối đa loanCfg().dailyMax/ngày (giờ VN), tổng nợ vay không quá loanCfg().cap.
//  - ⚠️ NỢ XẤU do ADMIN GẮN TAY trên panel (chủ server chọn thủ công cho đỡ bug):
//    bị bêu tên trên bảng + CẤM VAY THÊM. Admin gỡ nhãn thì vay lại được.
//  - Đang nợ (vay hoặc admin ghi): CHẶN chuyển Dogcoin vào game + CHẶN chuyển
//    tiền cho người khác + TRÍCH LOAN_INCOME_CUT thu nhập điểm danh/nghiện/chuỗi
//    tự trả nợ (trả nợ vay trước, dư mới trừ nợ admin).
// 04/09 (tối) - chủ server chốt lại lần nữa, cả 2 lớp cùng feePct (mặc định 20):
//  - PHÍ CỘNG NGAY LÚC VAY: vay X ghi sổ X×(1+phí%) - vay 40.000 là ôm nợ 48.000.
//  - LÃI KÉP MỖI NGÀY (mốc 00:00 giờ VN): còn nợ qua ngày là CẢ CỤC NỢ nhân (1+lãi%),
//    TÍNH CẢ NỢ ADMIN ghi tay (trước đây nợ admin không lãi), kèm thông báo réo tên.
const LOAN_INCOME_CUT = 0.5;   // (Phần 2 sẽ xiết mạnh hơn cho nợ xấu)
const LOAN_CFG_DEF = { dailyMax: 20000, cap: 60000, feePct: 20 };
function loanCfg() {
    const c = dbCache._loanCfg && typeof dbCache._loanCfg === 'object' ? dbCache._loanCfg : {};
    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
    return {
        dailyMax: Math.floor(num(c.dailyMax, LOAN_CFG_DEF.dailyMax, 100, 100000000)),
        cap: Math.floor(num(c.cap, LOAN_CFG_DEF.cap, 100, 1000000000)),
        feePct: num(c.feePct, LOAN_CFG_DEF.feePct, 0, 1000),   // lãi %/NGÀY khi còn nợ vay (04/09)
    };
}

// Ngày VN dạng sắp xếp/parse được ('2026-08-20') - vnDayStr bên dưới ra 'vi-VN'
// (20/8/2026) nên KHÔNG dùng cho tính khoảng cách ngày được.
function vnDayISO(ts) {
    return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function vnDayGap(isoNew, isoOld) {
    const a = Date.parse(isoNew), b = Date.parse(isoOld);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((a - b) / 86400000);
}

function debtOf(u) {
    if (!u.debt || typeof u.debt !== 'object') {
        u.debt = { loan: 0, admin: 0, lastAccrue: '', bad: false, bDay: '', bToday: 0 };
    }
    return u.debt;
}
function debtTotal(u) { const d = debtOf(u); return (d.loan || 0) + (d.admin || 0); }

// Cộng lãi dồn tới hôm nay. Gọi TRƯỚC mọi thao tác đọc/đụng tới nợ (lazy) -
// kèm một vòng quét định kỳ bên dưới để bảng tự cập nhật theo ngày.
// (Nhãn nợ xấu KHÔNG tự gắn ở đây - admin gắn/gỡ tay trên panel.)
// 04/09 (tối): LÃI KÉP MỖI NGÀY (mốc 00:00 giờ VN) trên CẢ CỤC NỢ - vay LẪN admin
// ghi tay đều đẻ (chủ server chốt). Gọi lazy ở mọi đường đụng nợ + vòng quét mỗi
// giờ bên dưới, nên có trốn không bấm gì thì nợ vẫn đẻ đúng ngày, kèm thông báo.
function debtAccrue(userId) {
    const u = getUserData(userId);
    const d = debtOf(u);
    const today = vnDayISO(Date.now());
    if (!d.lastAccrue) { d.lastAccrue = today; return d; }
    const gap = vnDayGap(today, d.lastAccrue);
    if (gap <= 0) return d;
    d.lastAccrue = today;
    const before = (d.loan || 0) + (d.admin || 0);
    if (before > 0) {
        const pct = loanCfg().feePct;
        const k = Math.pow(1 + pct / 100, gap);
        d.loan = Math.round((d.loan || 0) * k);
        d.admin = Math.round((d.admin || 0) * k);
        const after = d.loan + d.admin;
        if (after > before) {
            writeLog('ADMIN', `[VAY NỢ] Lãi ${gap} ngày x${pct}% (cả nợ admin): ${u.name || userId} ${before.toLocaleString()} -> ${after.toLocaleString()}`);
            vayAnnounce(`🩸 <@${userId}> ôm nợ qua ${gap} ngày, lãi ${pct}%/ngày đẻ trên CẢ CỤC NỢ: **${before.toLocaleString()} → ${after.toLocaleString()}** ${DOGCOIN_EMOJI} - trả sớm đi kẻo nợ nuốt ví!`, [userId]);
        }
    }
    return d;
}

// Trừ một khoản vào sổ nợ (KHÔNG đụng ví - chỗ gọi tự lo tiền). Trừ nợ vay trước,
// dư mới trừ nợ admin (giờ cả 2 đều có lãi - thứ tự giữ nguyên cho quen sổ sách).
// TRẢ SẠCH LÀ NHÃN NỢ XẤU TỰ BAY - admin khỏi gỡ tay.
function debtReduce(d, amount) {
    let rest = amount;
    const payLoan = Math.min(d.loan || 0, rest);
    d.loan -= payLoan; rest -= payLoan;
    const payAdmin = Math.min(d.admin || 0, rest);
    d.admin -= payAdmin; rest -= payAdmin;
    // Trả sạch = về vạch xuất phát: nhãn nợ xấu bay + HẠN MỨC NGÀY MỞ LẠI ĐỦ 10.000
    // (chủ server chốt 20/08: trả hết là được vay tiếp luôn, không phải chờ qua ngày)
    if ((d.loan || 0) + (d.admin || 0) <= 0) { d.loan = 0; d.admin = 0; d.bad = false; d.bToday = 0; }
    return payLoan + payAdmin;
}

// Đăng thông báo vào kênh đang treo bảng 📒 VAY NỢ (lãi đẻ / gắn / thoát nợ xấu...).
// tagIds: danh sách userId được PING thật (chủ server muốn con nợ bị réo tên công khai).
// Không có kênh thì thôi, lỗi cũng kệ - thông báo không được chặn dòng tiền.
function vayAnnounce(text, tagIds) {
    const chId = (vayState.channel && vayState.channel.id) || dbCache._vayChannelId;
    if (!chId) return;
    client.channels.fetch(chId)
        .then(ch => ch && ch.send({ content: text, allowedMentions: { users: tagIds || [] } }))
        .catch(() => {});
}

function debtBorrow(userId, username, amount) {
    const cfg = loanCfg();
    amount = Math.floor(Number(amount));
    if (!Number.isInteger(amount) || amount < 100) return { error: 'Vay ít nhất 100 Dogcoin' };
    const d = debtAccrue(userId);
    const u = getUserData(userId);
    if (d.bad) return { error: `⚠️ Đang ôm nhãn NỢ XẤU mà còn đòi vay nữa hả?! Trả sạch nợ đi, nhãn tự bay, lúc đó vay lại thoải mái.` };
    const today = vnDayISO(Date.now());
    if (d.bDay !== today) { d.bDay = today; d.bToday = 0; }
    if (d.bToday + amount > cfg.dailyMax) {
        const left = cfg.dailyMax - d.bToday;
        return { error: `Mỗi ngày vay tối đa ${cfg.dailyMax.toLocaleString()} - hôm nay bạn còn vay được ${Math.max(0, left).toLocaleString()}.` };
    }
    // 04/09 (tối): PHÍ CỘNG NGAY LÚC VAY - vay 40.000 ghi sổ 48.000, rồi qua ngày
    // (00:00 VN) chưa trả là cả cục nợ đẻ tiếp feePct%/ngày ở debtAccrue.
    const owed = Math.round(amount * (1 + cfg.feePct / 100));
    if (d.loan + owed > cfg.cap) {
        return { error: `Tổng nợ vay tối đa ${cfg.cap.toLocaleString()} (tính cả phí ${cfg.feePct}%: vay ${amount.toLocaleString()} là ghi sổ ${owed.toLocaleString()}) - bạn đang nợ vay ${d.loan.toLocaleString()}, vay thêm là vượt.` };
    }
    d.loan += owed;
    d.bToday += amount;
    updatePoints(userId, amount);
    logDog('vay', userId, username, amount, `vay nợ (ghi sổ ${owed.toLocaleString()} = vay + phí ${cfg.feePct}%; chưa trả thì +${cfg.feePct}%/ngày)`);
    writeLog('ADMIN', `[VAY NỢ] ${username} vay ${amount.toLocaleString()} (ghi nợ ${owed.toLocaleString()}, phí ${cfg.feePct}%) | nợ vay ${d.loan.toLocaleString()} + admin ${d.admin.toLocaleString()} | Số dư: ${(u.points || 0).toLocaleString()}`);
    saveDbNow();
    vayBoardRefresh();
    return { ok: true, amount, owed, debt: debtStatus(userId), balance: u.points || 0 };
}

// amount bỏ trống/0 = trả hết. Yêu cầu đủ số dư cho đúng khoản định trả.
function debtPay(userId, username, amount) {
    const d = debtAccrue(userId);
    const u = getUserData(userId);
    const total = debtTotal(u);
    if (total <= 0) return { error: 'Bạn không nợ đồng nào.' };
    let want = Math.floor(Number(amount) || 0);
    if (want <= 0 || want > total) want = total;
    if ((u.points || 0) < want) {
        return { error: `Ví có ${(u.points || 0).toLocaleString()} mà đòi trả ${want.toLocaleString()}?! Đi cày thêm rồi quay lại.` };
    }
    const wasBad = !!d.bad;
    updatePoints(userId, -want);
    debtReduce(d, want);
    if (wasBad && debtTotal(u) <= 0) {
        vayAnnounce(`🎉 <@${userId}> vừa trả SẠCH NỢ, nhãn ⚠️ nợ xấu tự bay - uy tín hồi sinh, anh em cho vay lại được rồi!`, [userId]);
    }
    logDog('trano', userId, username, -want, `trả nợ (còn ${debtTotal(u).toLocaleString()})`);
    writeLog('ADMIN', `[VAY NỢ] ${username} trả ${want.toLocaleString()} | còn nợ vay ${d.loan.toLocaleString()} + admin ${d.admin.toLocaleString()} | Số dư: ${(u.points || 0).toLocaleString()}`);
    saveDbNow();
    vayBoardRefresh();
    return { ok: true, paid: want, debt: debtStatus(userId), balance: u.points || 0 };
}

// Sàn ví tối thiểu cho người NỢ XẤU (27/08): mọi khoản thu bị xiết trả nợ, ví chỉ
// được giữ tới mốc này cho tới khi trả sạch nợ.
const DEBT_BAD_FLOOR = 1000;

// Thu nhập (điểm danh/nghiện/chuỗi) - chỉ NỢ XẤU mới bị xiết. 27/08 đổi từ "cắt 50%"
// sang "chỉ giữ ví tới sàn 1.000, phần còn lại trả nợ" (mạnh hơn, ép trả nợ).
// Trả { keep: phần thực vào ví, cut: phần đã trừ nợ, left: nợ còn lại }.
function debtCutIncome(userId, amount) {
    const d = debtAccrue(userId);
    const u = getUserData(userId);
    const total = debtTotal(u);
    if (total <= 0) return { keep: amount, cut: 0, left: 0 };
    if (!d.bad) return { keep: amount, cut: 0, left: total };   // nợ thường: nhận đủ
    const walletNow = u.points || 0;
    const keep = Math.max(0, Math.min(amount, DEBT_BAD_FLOOR - walletNow));  // chỉ giữ đủ chạm sàn 1.000
    const cut = Math.min(total, amount - keep);
    if (cut < 1) return { keep: amount, cut: 0, left: total };
    debtReduce(d, cut);
    if (debtTotal(u) <= 0) {
        vayAnnounce(`🎉 <@${userId}> cày trả SẠCH NỢ, nhãn ⚠️ nợ xấu tự bay - nghị lực đấy!`, [userId]);
    }
    vayBoardRefresh();
    return { keep, cut, left: debtTotal(u) };
}

// XIẾT VÍ về sàn 1.000 khi NỢ XẤU (27/08): lấy phần ví vượt 1.000 trừ thẳng vào nợ.
// Gọi khi: gắn nhãn nợ xấu, nhận chuyển từ người khác, nhận tiền event. Trả số đã xiết.
function debtBadSweep(userId) {
    const u = getUserData(userId);
    const d = debtOf(u);
    if (!d.bad) return 0;
    const total = debtTotal(u);
    if (total <= 0) return 0;
    const avail = Math.max(0, (u.points || 0) - DEBT_BAD_FLOOR);
    const take = Math.min(avail, total);
    if (take < 1) return 0;
    updatePoints(userId, -take);
    debtReduce(d, take);
    logDog('debt', userId, u.name || userId, -take, `nợ xấu: xiết ví về ${DEBT_BAD_FLOOR.toLocaleString()} trả nợ`);
    if (debtTotal(u) <= 0) vayAnnounce(`🎉 <@${userId}> đã trả SẠCH NỢ (bị xiết ví), nhãn ⚠️ nợ xấu tự bay!`, [userId]);
    vayBoardRefresh();
    saveDbNow();
    return take;
}

function debtStatus(userId) {
    const d = debtAccrue(userId);
    const u = getUserData(userId);
    const today = vnDayISO(Date.now());
    const bToday = d.bDay === today ? d.bToday : 0;
    return {
        loan: d.loan || 0, admin: d.admin || 0, total: debtTotal(u),
        bad: !!d.bad,
        canBorrowToday: d.bad ? 0 : Math.max(0, Math.min(loanCfg().dailyMax - bToday, loanCfg().cap - (d.loan || 0))),
        dailyMax: loanCfg().dailyMax, cap: loanCfg().cap, feePct: loanCfg().feePct,
        ratePct: loanCfg().feePct,   // web + nút "Nợ của tôi" đọc tên này (trước đây thiếu -> in "undefined")
        cutPct: LOAN_INCOME_CUT * 100,
    };
}

// Danh sách người đang nợ (đã cộng lãi tới hôm nay) - cho bảng Discord + panel.
function debtList() {
    const out = [];
    for (const [k, v] of Object.entries(dbCache)) {
        if (k.startsWith('_') || !/^\d{15,20}$/.test(k) || !v || typeof v !== 'object') continue;
        if (!v.debt || ((v.debt.loan || 0) + (v.debt.admin || 0)) <= 0) continue;
        const d = debtAccrue(k);
        if ((d.loan + d.admin) <= 0) continue;
        out.push({ id: k, name: NAME_OVERRIDE[k] || v.name || k, loan: d.loan, admin: d.admin, total: d.loan + d.admin, bad: !!d.bad });
    }
    return out.sort((a, b) => b.total - a.total);
}

// Trả RIÊNG khoản nợ admin (mua đồ ghi sổ) - không đụng nợ vay. Đủ số dư mới trả.
function debtPayAdmin(userId, username, amount) {
    const d = debtAccrue(userId);
    const u = getUserData(userId);
    if ((d.admin || 0) <= 0) return { error: 'Bạn không có khoản nợ admin nào.' };
    let want = Math.floor(Number(amount) || 0);
    if (want <= 0 || want > d.admin) want = d.admin;
    if ((u.points || 0) < want) {
        return { error: `Ví có ${(u.points || 0).toLocaleString()} mà đòi trả ${want.toLocaleString()}?! Đi cày thêm rồi quay lại.` };
    }
    const wasBad = !!d.bad;
    updatePoints(userId, -want);
    d.admin -= want;
    if (debtTotal(u) <= 0) { d.loan = 0; d.admin = 0; d.bad = false; d.bToday = 0; }   // sạch nợ = hạn mức ngày mở lại
    if (wasBad && debtTotal(u) <= 0) {
        vayAnnounce(`🎉 <@${userId}> vừa trả SẠCH NỢ, nhãn ⚠️ nợ xấu tự bay - uy tín hồi sinh, anh em cho vay lại được rồi!`, [userId]);
    }
    logDog('trano', userId, username, -want, `trả nợ admin (còn ${debtTotal(u).toLocaleString()})`);
    writeLog('ADMIN', `[VAY NỢ] ${username} trả ${want.toLocaleString()} nợ admin | còn vay ${d.loan.toLocaleString()} + admin ${d.admin.toLocaleString()}`);
    saveDbNow();
    vayBoardRefresh();
    return { ok: true, paid: want, debt: debtStatus(userId), balance: u.points || 0 };
}

// Admin ghi nợ tay (panel tab 👥): cộng vào khoản 'admin' - KHÔNG trần. Số âm =
// giảm nợ đã ghi. Dùng để ghi "mua pal/lõi trong game còn thiếu tiền".
// 04/09 (tối): nợ admin giờ CŨNG đẻ lãi ngày như nợ vay (xem debtAccrue) - vì vậy
// tính lãi phần nợ cũ dồn tới hôm nay TRƯỚC rồi mới cộng khoản mới (khoản mới
// chỉ bắt đầu chịu lãi từ mốc 00:00 kế tiếp, không bị dính lãi hồi tố).
function adminDebtAdd(userId, amount) {
    amount = Math.floor(Number(amount) || 0);
    if (!amount) return { error: 'Số không hợp lệ' };
    const u = getUserData(userId);
    const d = debtAccrue(userId);
    d.admin = Math.max(0, (d.admin || 0) + amount);
    writeLog('ADMIN', `[VAY NỢ] Panel ghi nợ ${amount > 0 ? '+' : ''}${amount.toLocaleString()} cho ${u.name || userId} | nợ admin ${d.admin.toLocaleString()} + vay ${d.loan.toLocaleString()}`);
    saveDbNow();
    vayBoardRefresh();
    return { ok: true, total: debtTotal(u) };
}
// Admin gắn/gỡ nhãn ⚠️ NỢ XẤU (thủ công theo yêu cầu chủ server - không tự động).
// Gắn = bêu tên trên bảng + cấm vay thêm. Có DM báo cho người chơi (hỏng cũng kệ).
function adminDebtBad(userId, bad) {
    const u = getUserData(userId);
    const d = debtOf(u);
    d.bad = !!bad;
    writeLog('ADMIN', `[VAY NỢ] Panel ${bad ? 'GẮN' : 'GỠ'} nhãn NỢ XẤU cho ${u.name || userId} (đang nợ ${debtTotal(u).toLocaleString()})`);
    saveDbNow();
    // 27/08: vừa gắn nợ xấu -> xiết ngay ví về sàn 1.000 trả nợ
    if (d.bad) debtBadSweep(userId);
    vayBoardRefresh();
    // Bêu/ân xá công khai + TAG thẳng tên ở kênh bảng vay. LUÔN nói "hệ thống"
    // chứ không nói admin - chủ server không muốn bị chửi 🙈
    vayAnnounce(bad
        ? `🚨 HỆ THỐNG vừa đóng dấu ⚠️ **NỢ XẤU** lên <@${userId}> (đang ôm **${debtTotal(u).toLocaleString()}** ${DOGCOIN_EMOJI})! Hết cửa vay, hết cửa chuyển tiền - trả sạch nợ là nhãn tự bay, cố lên chiến hữu 🫡`
        : `🕊️ Hệ thống **ân xá nợ xấu** cho <@${userId}> - vay lại được rồi, đừng để dính lần nữa nha!`,
        [userId]);
    client.users.fetch(userId).then(us => us.send(bad
        ? `⚠️ HỆ THỐNG vừa đóng dấu **NỢ XẤU** lên trán bạn (đang nợ **${debtTotal(u).toLocaleString()}** Dogcoin). Hậu quả: không vay thêm, không chuyển tiền, không chuyển vào game, không mua/quay pal, và MỌI khoản thu (điểm danh/event/ai chuyển cho) bị xiết thẳng trả nợ - ví chỉ được giữ tối đa **1.000** cho tới khi trả sạch. Bị bêu tên ở bảng 📒 VAY NỢ. Trả sạch nợ (nút 💳) là nhãn TỰ BAY - cày đi!`
        : `🕊️ Hệ thống đã gỡ nhãn NỢ XẤU cho bạn - vay lại được rồi. Lần này nhớ trả đúng hẹn nha!`
    )).catch(() => {});
    return { ok: true, bad: d.bad };
}

function adminDebtClear(userId) {
    const u = getUserData(userId);
    const d = debtOf(u);
    const was = debtTotal(u);
    d.loan = 0; d.admin = 0; d.bad = false; d.bToday = 0;
    writeLog('ADMIN', `[VAY NỢ] Panel XÓA nợ ${was.toLocaleString()} của ${u.name || userId}`);
    saveDbNow();
    vayBoardRefresh();
    return { ok: true, cleared: was };
}

// ---- bảng 📒 VAY NỢ trong kênh Discord (khuôn y bảng Dogcoin & Shop Pal) ----
const vayState = { channel: null, message: null };
function getVayMessageData() {
    const rows = debtList();
    const lc = loanCfg();
    const feeEx0 = Math.round(10000 * (1 + lc.feePct / 100));                            // vay 10k -> ghi sổ
    const feeEx1 = Math.round(feeEx0 * (1 + lc.feePct / 100));                           // để qua 1 ngày
    const feeEx3 = Math.round(feeEx0 * Math.pow(1 + lc.feePct / 100, 3));                // lì 3 ngày
    const lines = [
        `Cháy túi giữa ván? Thua con đề sát nút? Vay liền tay - không cần admin duyệt, không cần thế chấp pal. 🙏`,
        '',
        `**💰 Vay** - bơm tối đa **${lc.dailyMax.toLocaleString()}/ngày** thẳng vào ví, sổ nợ ôm tối đa **${lc.cap.toLocaleString()}**. ` +
            `Phí **${lc.feePct}%** cộng NGAY lúc vay: vay 10.000 là ghi sổ **${feeEx0.toLocaleString()}** 😏`,
        `Chưa trả thì cứ qua mốc **00:00** là CẢ CỤC NỢ (kể cả nợ admin ghi) **LÃI KÉP ${lc.feePct}%/NGÀY**: ghi sổ ${feeEx0.toLocaleString()} để 1 ngày thành **${feeEx1.toLocaleString()}**, lì 3 ngày thành **${feeEx3.toLocaleString()}** - nợ đẻ nhanh hơn pal, trả sớm đi. 💀`,
        `Nợ mà chây ì là HỆ THỐNG đóng dấu ⚠️ **NỢ XẤU**: bêu tên ngay bảng này · 🚫 hết cửa vay · ` +
            `🚫 không chuyển tiền · 🚫 không mua/quay pal · 💸 mọi khoản thu (điểm danh, event, ai chuyển cho) bị **xiết thẳng trả nợ**, ví chỉ chừa **1.000**.`,
        `**💳 Trả nợ** tại đây hoặc trên web - trả sạch là nhãn nợ xấu **TỰ BAY**, uy tín sáng lại như chưa từng vay. ✨`,
        '',
        // Server ít người nên danh sách NỢ XẤU bêu thẳng trên bảng, tách khối riêng cho nổi
        ...(rows.some(r => r.bad) ? [
            `🚨 **BẢNG PHONG THẦN NỢ XẤU** (cho vay mượn gì thì tự cân nhắc):`,
            ...rows.filter(r => r.bad).map(r => `⚠️ **${r.name}** - đang ôm **${r.total.toLocaleString()}** ${DOGCOIN_EMOJI}`),
            '',
        ] : []),
        rows.length ? `**📋 SỔ NỢ (${rows.length} con nợ):**` : `**📋 SỔ NỢ:** chưa ai nợ đồng nào - cả server sạch nợ, hơi lạ đấy 🤨`,
        ...rows.slice(0, 15).map(r =>
            `${r.bad ? '⚠️' : '•'} **${r.name}** - nợ **${r.total.toLocaleString()}**` +
            (r.admin > 0 ? ` (vay ${r.loan.toLocaleString()} + admin ghi ${r.admin.toLocaleString()})` : '')),
        rows.length > 15 ? `... và ${rows.length - 15} người nữa` : null,
    ].filter(s => s !== null);   // chỉ bỏ dòng điều kiện rỗng, GIỮ dòng '' giãn cách

    const embed = new EmbedBuilder()
        .setTitle('📒 VAY NỢ DOGCOIN')
        .setColor(rows.some(r => r.bad) ? 0xe74c3c : 0x2ecc71)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Cập nhật ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vay_open').setLabel('Vay').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('vay_pay_open').setLabel('Trả nợ').setEmoji('💳').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('vay_my').setLabel('Nợ của tôi').setEmoji('📄').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}
async function startVay(channel) {
    if (vayState.message) await vayState.message.delete().catch(() => {});
    vayState.channel = channel;
    vayState.message = await channel.send(getVayMessageData());
    dbCache._vayChannelId = channel.id;
    dbCache._vayMsgId = vayState.message.id;
    saveDbNow();
}
function stopVay() {
    if (vayState.message) vayState.message.delete().catch(() => {});
    vayState.channel = null;
    vayState.message = null;
    dbCache._vayChannelId = null;
    dbCache._vayMsgId = null;
}
// Vẽ lại bảng sau mỗi biến động - gom 3 giây một lần kẻo spam API Discord.
let vayRefreshTimer = null;
function vayBoardRefresh() {
    if (!vayState.message || vayRefreshTimer) return;
    vayRefreshTimer = setTimeout(() => {
        vayRefreshTimer = null;
        if (vayState.message) vayState.message.edit(getVayMessageData()).catch(() => {});
    }, 3000);
}
// Quét mỗi giờ: cộng lãi + cập nhật nhãn nợ xấu cho MỌI người nợ, kể cả khi họ
// không bấm gì - để bảng và lệnh chặn luôn đúng theo ngày.
setInterval(() => {
    try {
        const before = JSON.stringify(Object.entries(dbCache).filter(([k, v]) => v && v.debt).map(([k, v]) => v.debt));
        debtList();
        const after = JSON.stringify(Object.entries(dbCache).filter(([k, v]) => v && v.debt).map(([k, v]) => v.debt));
        if (before !== after) { saveDbNow(); vayBoardRefresh(); }
    } catch (e) { writeLog('SYSTEM', `[VAY NỢ] Lỗi quét lãi: ${e.message}`); }
}, 60 * 60 * 1000);

// ===== 📅 ĐIỂM DANH THÁNG + 💉 NGHIỆN - logic DÙNG CHUNG Discord & web =====
// Sổ tháng lưu ở userData.dailyMonth ('2026-08') + dailyDays ([1,5,18...]);
// lastDaily (timestamp) giữ lại để tương thích /diemdanh cũ + chặn double
// nhận đúng ngày deploy (người đã /diemdanh bản cũ hôm đó có lastDaily nhưng
// dailyDays còn trống).
function vnParts() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
function dailyBookOf(userData) {
    const { y, m } = vnParts();
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (userData.dailyMonth !== key || !Array.isArray(userData.dailyDays)) {
        userData.dailyMonth = key;
        userData.dailyDays = [];
    }
    return userData;
}
// Chuỗi đếm bằng NGÀY THẬT (userData.streakRun), không tính từ lịch tháng - lịch
// tháng reset mỗi mùng 1 nên tính kiểu đó là sang tháng mới đứt chuỗi oan.
function vnDayStr(ts) {
    return new Date(ts).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
// Chuỗi hiện tại: đã điểm danh hôm nay thì lấy thẳng streakRun; chưa thì streakRun
// chỉ còn giá trị nếu lần trước là HÔM QUA (nếu không thì chuỗi đã đứt = 0).
function streakNow(u) {
    if (u.streakRun === undefined) {
        // di cư từ bản cũ (chưa có streakRun): tạm suy từ lịch tháng
        const { d } = vnParts();
        const set = new Set(u.dailyDays || []);
        let s = 0;
        for (let cur = set.has(d) ? d : d - 1; cur >= 1 && set.has(cur); cur--) s++;
        return s;
    }
    const today = vnDayStr(Date.now());
    const last = u.lastDaily ? vnDayStr(u.lastDaily) : '';
    if (last === today) return u.streakRun;
    if (last === vnDayStr(Date.now() - 86400000)) return u.streakRun;   // hôm qua, chuỗi còn sống
    return 0;
}
// BÙ gói thưởng chuỗi cho khớp chuỗi hiện tại. Gọi ở CẢ dailyState và claimDaily,
// nên ai đã có chuỗi từ bản cũ (điểm danh trước khi có tính năng này) mở trang lên
// là được bù ngay, không phải đợi thêm 2 ngày.
// streakRunPaid = số gói ĐÃ ghi cho đợt chuỗi đang chạy; claimDaily reset về 0 mỗi
// khi mở đợt mới (streakRun về 1) nên không bao giờ ghi trùng.
function streakTopUp(u) {
    const run = streakNow(u);
    if (u.streakRun === undefined) u.streakRun = run;   // di cư từ bản cũ
    if (run <= 0) return run;                            // chuỗi đứt: không bù
    const due = Math.floor(run / dailyCfg().streakEvery);
    const paid = u.streakRunPaid || 0;
    if (due > paid) {
        const add = due - paid;
        u.streakPacks = (u.streakPacks || 0) + add;
        u.streakTotal = (u.streakTotal || 0) + add;
        u.streakRunPaid = due;
        saveDbNow();
    }
    return run;
}
function dailyState(userId) {
    const u = dailyBookOf(getUserData(userId));
    streakTopUp(u);
    const { y, m, d } = vnParts();
    const daysInMonth = new Date(y, m, 0).getDate();
    const set = new Set(u.dailyDays);
    return {
        year: y, month: m, today: d, daysInMonth,
        days: u.dailyDays.slice().sort((a, b) => a - b),
        checkedToday: set.has(d),
        streak: streakNow(u),
        amount: dailyCfg().daily,
        streakEvery: dailyCfg().streakEvery,
        streakBonus: dailyCfg().streakBonus,
        streakPacks: u.streakPacks || 0,     // số gói ĐANG CHỜ nhận
        streakTotal: u.streakTotal || 0,     // tổng số lần đủ chuỗi từ đầu
        nghien: { amount: dailyCfg().nghien, nextAt: (u.lastNghien || 0) + NGHIEN_COOLDOWN_MS, now: Date.now() },
        balance: u.points || 0,
    };
}
function claimDaily(userId) {
    const u = dailyBookOf(getUserData(userId));
    const { y, m, d } = vnParts();
    const todayVN = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const lastDayVN = u.lastDaily ? new Date(u.lastDaily).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
    if (u.dailyDays.includes(d) || lastDayVN === todayVN) {
        if (!u.dailyDays.includes(d)) u.dailyDays.push(d); // đồng bộ lịch cho người /diemdanh bản cũ hôm nay
        // còn bao lâu tới 00:00 VN
        const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const minsLeft = (24 * 60) - (nowVN.getHours() * 60 + nowVN.getMinutes());
        return { error: `Hôm nay điểm danh rồi! Qua 00:00 (còn ${Math.floor(minsLeft / 60)} giờ ${minsLeft % 60} phút) là điểm danh tiếp được.` };
    }
    // Nối chuỗi TRƯỚC khi ghi đè lastDaily: lần trước là hôm qua thì +1, không thì về 1.
    const prevRun = (u.streakRun !== undefined) ? u.streakRun : streakNow(u);
    const lastVNday = u.lastDaily ? vnDayStr(u.lastDaily) : '';
    u.streakRun = (lastVNday === vnDayStr(Date.now() - 86400000)) ? prevRun + 1 : 1;
    if (u.streakRun === 1) u.streakRunPaid = 0;   // mở đợt chuỗi mới

    u.dailyDays.push(d);
    u.lastDaily = Date.now();
    // Đang nợ thì một phần tiền điểm danh tự trừ vào nợ (xem khối VAY NỢ)
    const inc = debtCutIncome(userId, dailyCfg().daily);
    updatePoints(userId, inc.keep);

    // Đủ mốc chuỗi -> GHI gói vào sổ, chưa cộng tiền. Người chơi tự bấm nhận;
    // gói đã ghi thì chuỗi đứt sau đó cũng không mất.
    const packsBefore = u.streakPacks || 0;
    streakTopUp(u);
    const streakEarned = (u.streakPacks || 0) > packsBefore;
    saveDbNow();
    writeLog('ADMIN', `[ĐIỂM DANH] ${u.name || userId} nhận ${dailyCfg().daily.toLocaleString()} Dogcoin | chuỗi ${u.streakRun}${streakEarned ? ` | ĐỦ CHUỖI ${dailyCfg().streakEvery} - ghi 1 gói ${dailyCfg().streakBonus} chờ nhận` : ''} | Số dư: ${(u.points || 0).toLocaleString()}`);
    return {
        ok: true, amount: dailyCfg().daily, streakEarned,
        debtCut: inc.cut, debtLeft: inc.left,
        state: dailyState(userId), balance: u.points || 0,
    };
}

// Bấm nhận thưởng chuỗi: MỖI LẦN BẤM lấy 1 gói 800. Gói dồn lại được - điểm danh 4
// ngày liên tiếp là 2 gói, bấm 2 lần; hết gói thì ô tắt, không nhận nữa.
function claimStreak(userId) {
    const u = dailyBookOf(getUserData(userId));
    streakTopUp(u);
    const packs = u.streakPacks || 0;
    if (packs < 1) {
        return { error: `Hết gói thưởng chuỗi - điểm danh thêm ${dailyCfg().streakEvery} ngày LIÊN TIẾP là có gói mới (${dailyCfg().streakBonus.toLocaleString()} Dogcoin).` };
    }
    u.streakPacks = packs - 1;
    const inc = debtCutIncome(userId, dailyCfg().streakBonus);
    updatePoints(userId, inc.keep);
    saveDbNow();
    writeLog('ADMIN', `[ĐIỂM DANH] ${u.name || userId} nhận 1 gói thưởng chuỗi ${dailyCfg().streakBonus.toLocaleString()} Dogcoin (còn ${u.streakPacks} gói)${inc.cut ? ` | trừ nợ ${inc.cut}` : ''} | Số dư: ${(u.points || 0).toLocaleString()}`);
    return {
        ok: true, amount: dailyCfg().streakBonus, left: u.streakPacks,
        debtCut: inc.cut, debtLeft: inc.left,
        state: dailyState(userId), balance: u.points || 0,
    };
}
// announce: CHỈ bật khi lụm từ WEB. Gõ /nghien trong Discord thì lời đáp đã hiện
// ngay tại kênh rồi, đăng thêm là ra 2 tin trùng nội dung. Mặc định TẮT để chỗ gọi
// mới sau này có quên cũng không tự dưng spam kênh.
function claimNghien(userId, announce = false) {
    const u = getUserData(userId);
    const passed = Date.now() - (u.lastNghien || 0);
    if (passed < NGHIEN_COOLDOWN_MS) {
        const msLeft = NGHIEN_COOLDOWN_MS - passed;
        return { error: `Nghiện vừa thôi! Còn ${Math.ceil(msLeft / 60000)} phút nữa mới lụm tiếp được.`, msLeft };
    }
    const inc = debtCutIncome(userId, dailyCfg().nghien);
    updatePoints(userId, inc.keep);
    u.lastNghien = Date.now();
    writeLog('ADMIN', `[NGHIỆN] ${u.name || userId} nhận ${dailyCfg().nghien.toLocaleString()} Dogcoin | Số dư: ${(u.points || 0).toLocaleString()}`);
    // Đăng công khai vào kênh nghiện - lỗi kênh không được chặn việc nhận tiền
    if (announce) {
        client.channels.fetch(NGHIEN_ANNOUNCE_CHANNEL_ID)
            .then(ch => ch.send({ content: `💉 **${u.name || userId}** vừa lụm **${dailyCfg().nghien.toLocaleString()}** ${DOGCOIN_EMOJI} nghiện - gõ \`/nghien\` hoặc vào web lụm theo!`, allowedMentions: { parse: [] } }))
            .catch(() => { });
    }
    return { ok: true, amount: dailyCfg().nghien, debtCut: inc.cut, debtLeft: inc.left, nextAt: u.lastNghien + NGHIEN_COOLDOWN_MS, now: Date.now(), balance: u.points || 0 };
}

// ===== PHÁT DOGCOIN TOÀN SERVER (gọi từ dashboard) =====
// Cộng `amount` cho MỌI ví đang tồn tại rồi đăng thông báo tag role vào kênh thông báo.
// Chỉ cộng ví đã có (ai từng chơi); người mới vào sau vẫn nhận STARTING_DOGCOIN như thường.
async function addAllPlayersAndAnnounce(amount, onlyIds = null, msg = '') {
    // Khóa _ là dữ liệu nội bộ (lịch sử, đơn rút...), không phải ví người chơi.
    // onlyIds: panel truyền danh sách còn hạn mức trần/ngày (null = phát tất cả).
    const allow = onlyIds ? new Set(onlyIds) : null;
    const userIds = Object.keys(dbCache).filter(k => !k.startsWith('_') && (!allow || allow.has(k)));
    userIds.forEach(id => updatePoints(id, amount));
    // 27/08: ai đang nợ xấu thì tiền event vừa nhận bị xiết thẳng trả nợ (chừa sàn 1.000)
    userIds.forEach(id => { if (debtOf(getUserData(id)).bad) debtBadSweep(id); });
    saveDbNow();
    writeLog('ADMIN', `[CỘNG TIỀN ALL] Dashboard cộng ${amount.toLocaleString()} Dogcoin cho ${userIds.length} người chơi`);

    // Kênh + role đặt ở panel (tab 👥, lưu database) - đổi Discord server không phải
    // sửa code. Chưa đặt thì rơi về ID hardcode của server cũ.
    const announceChannelId = dbCache._giveawayChannelId || GIVEAWAY_ANNOUNCE_CHANNEL_ID;
    const pingRoleId = dbCache._giveawayRoleId || GIVEAWAY_PING_ROLE_ID;
    // 27/08: lời nhắn CUSTOM từ panel (vd "Quà 2/9", "Ăn mừng VN vô địch") làm dòng
    // tiêu đề; bỏ trống thì dùng câu mặc định. allowedMentions chỉ cho tag đúng role
    // nên @everyone/@here lọt trong text cũng KHÔNG ping ai - vẫn cắt bớt cho gọn.
    const custom = String(msg || '').trim().replace(/@(everyone|here)/gi, '$1').slice(0, 400);
    const headline = custom || `🎁 Tặng cho mấy con nghiện!`;
    let announced = false;
    try {
        const ch = await client.channels.fetch(announceChannelId);
        if (ch) {
            await ch.send({
                content: `<@&${pingRoleId}> ${headline}\n🎁 Mỗi người nhận **${amount.toLocaleString()}** ${DOGCOIN_EMOJI}! (đã cộng ví **${userIds.length}** người - gõ \`/sodu\` mà xem)`,
                allowedMentions: { roles: [pingRoleId] },
            });
            announced = true;
        }
    } catch (e) {
        writeLog('SYSTEM', `[LỖI THÔNG BÁO CỘNG TIỀN ALL] Không gửi được vào kênh ${announceChannelId}: ${e.message}`);
    }
    return { count: userIds.length, announced };
}

// ===== SHOP PAL =====
// Người chơi trả Dogcoin để đặt 1 con pal; bot gửi đơn cho admin, admin dùng
// CreativeMenu tạo pal trong game. Cố tình KHÔNG tự spawn pal: đã kiểm chứng là mod
// Lua không có cách thêm pal vào túi cho đúng (pal bị treo tới khi restart server).
const PAL_SHOP = {
    customPrice: 6000,   // tự chọn pal
    randomPrice: 2000,   // random pal - quay TRƯỚC, biết trúng con gì rồi mới chọn passive/linh hồn
    randomSellBack: 1000, // quay random trúng con không ưng thì bán lại: đóng đơn, hoàn chừng này
    adminDiscordId: '456136500011335698',
    // Chỉ số mặc định cho mọi pal mua ở shop
    stars: 4,
    ivs: 100,
    soulPercent: 60,
    soulSlots: 1,        // số dòng linh hồn người chơi được chọn (cả 2 loại đều 1 dòng)
    passiveSlots: 4,
};

// Passive Cây Thế Giới KHÔNG bán kèm pal shop - muốn thì mua cấy ghép ở sạp trong game.
// So khớp sau khi bỏ dấu tiếng Việt để "Thần Hủy Diệt" hay "than huy diet" đều bắt được.
const BANNED_PASSIVES = [
    'Thánh Kiếm Hai Lưỡi', 'Thành Trì Thịt Sống', 'Thần Hủy Diệt', 'Bàn Tay Ác Quỷ',
    'Cú Nhảy Không Gian', 'Tiên Nhân', 'Vườn Ươm Cây Thần',
];
const stripAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
function findBannedPassive(text) {
    const t = stripAccents(text);
    if (/world\s*tree/.test(t)) return 'World Tree';
    return BANNED_PASSIVES.find((n) => t.includes(stripAccents(n))) || null;
}

let PAL_DATA = { all: [], raidOnly: [] };
try {
    // __dirname chứ không phải './' - pm2 có thể chạy tiến trình từ thư mục khác.
    PAL_DATA = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'pals.json'), 'utf8'));
} catch (e) {
    console.error('Khong doc duoc pals.json (shop pal se khong hoat dong):', e.message);
}

// Danh sách được phép MUA (nút 3000): bỏ pal raid.
// Nút random (1000) thì lấy toàn bộ, kể cả raid - theo yêu cầu, coi như phần thưởng may mắn.
function shopBuyableList() {
    const raid = new Set(PAL_DATA.raidOnly || []);
    return (PAL_DATA.all || []).filter((p) => !raid.has(p.name));
}

// Tìm pal theo tên người chơi nhập: khớp chính xác trước, rồi tới khớp một phần.
function findPalByName(input) {
    const q = String(input || '').trim().toLowerCase();
    if (!q) return null;
    const list = shopBuyableList();
    return (
        list.find((p) => p.name.toLowerCase() === q) ||
        list.find((p) => p.name.toLowerCase().replace(/\s+/g, '') === q.replace(/\s+/g, '')) ||
        list.find((p) => p.name.toLowerCase().includes(q)) ||
        null
    );
}

// (Shop vật phẩm + đổi vàng đã bỏ khỏi Discord - bán ở sạp trong game.)

// ===== QUAY PAL NGẪU NHIÊN (gacha) =====
// Kênh đăng công khai kết quả quay: cấu hình trên dashboard (tab Palworld & Dogcoin),
// lưu ở dbCache._gachaChannelId. Không có thì không đăng.
// Pool quay: chỉ pal từ paldex #80 (Helzephyr) trở lên; loại Xenolord + Hartalis.
// Boltmane/Dragostrophe (pal Predator, không có số paldex) cũng bị loại theo luật này.
const GACHA_MIN_DEX = 80;
const GACHA_EXCLUDE_CODES = ['DarkMechaDragon', 'LegendDeer', 'KingBahamut_Dragon']; // Xenolord, Hartalis, Blazamut Ryu
function gachaPool() {
    return (PAL_DATA.all || []).filter(p => (p.dex || 0) >= GACHA_MIN_DEX && !GACHA_EXCLUDE_CODES.includes(p.code));
}

// ===== 🎁 QUAY PAL TRÊN WEB (rương + vòng quay kiểu CSGO, 25/08) =====
// Thay cho nút quay random trong Discord. Trúng thì pal vào RƯƠNG ở trang Hồ sơ web:
// bán lại lấy Dogcoin, hoặc NHẬN - chọn linh hồn/passive rồi bot tự giao vào game qua
// dashboard (spawn+bắt của mod). Pal DÙNG ĐƯỢC sau đợt restart server kế tiếp - game
// chỉ "nhận nuôi" pal lúc load thế giới, đã dò hết API và không có đường sống nào khác.
//
// Pool: TẤT CẢ pal thường (kể cả Predator không số dex) trừ #203 Panthalus + #204
// Astralym (bug game: chưa cho bắt/thả). Ô "PAL RAID" nổ theo TỈ LỆ RIÊNG (25/08: 1%);
// trúng nó thì mở vòng 2 chia đều trong các pal raid - giống mở rương CSGO.
const PALWHEEL_EXCLUDE_DEX = [203, 204]; // Panthalus, Astralym
// 27/08: loại thêm theo CODE (2 con này dex=undefined nên không loại theo dex được) -
// chủ server không muốn (chưa gom hình): Boltmane, Dragostrophe.
const PALWHEEL_EXCLUDE_CODE = ['ElecLion', 'BlackFurDragon'];
// Chỉ các boss triệu hồi được ở Summoning Altar server này (chủ server chốt 25/08,
// nguồn paldb.cc/en/Raid). Moon Lord KHÔNG lấy được -> không có.
// (03/09: Xenovader #145 + Xenogard #146 RA KHỎI raidOnly theo yêu cầu chủ server -
// thành pal thường, quay được ở vòng thường + mua tùy chọn; hình T_DarkAlien /
// T_WhiteAlienDragon _icon_normal.png đều có sẵn. Chúng vẫn KHÔNG nằm trong ô RAID.)
const PALWHEEL_RAID_NAMES = ['Bellanoir', 'Bellanoir Libero', 'Blazamut Ryu', 'Xenolord', 'Hartalis'];
// 🍀 VÒNG QUAY RAID MAY MẮN (27/08): đầy thanh may mắn (100%) mới được quay. Đúng 4 boss
// chủ server chốt (KHÔNG có Bellanoir Libero) + thưởng thêm Dogcoin. Khác pool ô RAID
// của vòng thường ở trên.
const PALWHEEL_LUCKY_RAID_NAMES = ['Hartalis', 'Bellanoir', 'Blazamut Ryu', 'Xenolord'];

let PASSIVE_DATA = { list: [] };
try {
    PASSIVE_DATA = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'passives.json'), 'utf8'));
} catch (e) {
    console.error('Khong doc duoc passives.json (nhan pal se khong chon duoc passive):', e.message);
}
function passiveCatalog() { return Array.isArray(PASSIVE_DATA.list) ? PASSIVE_DATA.list : []; }

// Bộ 4 passive chọn nhanh ("build") - lọc id lạ ngay lúc đọc để passives.json sửa tay
// sai cũng không lọt id hỏng xuống client/claim.
function passiveBuilds() {
    const catalog = new Set(passiveCatalog().map(p => p.id));
    const raw = Array.isArray(PASSIVE_DATA.builds) ? PASSIVE_DATA.builds : [];
    return raw
        .map(b => ({ name: String(b.name || ''), ids: (Array.isArray(b.ids) ? b.ids.map(String).filter(id => catalog.has(id)) : []).slice(0, 4) }))
        .filter(b => b.name && b.ids.length);
}

function palWheelCfg() {
    const c = dbCache._palWheelCfg || {};
    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    return {
        price: Math.floor(num(c.price, 2000, 100, 1000000)),      // vé mỗi lượt quay
        customPrice: Math.floor(num(c.customPrice, 6000, 100, 1000000)), // 🎯 chọn pal đích danh (25/08, thay shop Discord)
        sellPrice: Math.floor(num(c.sellPrice, 1000, 0, 1000000)), // bán pal trong rương
        soulMax: Math.floor(num(c.soulMax, 1, 1, 4)),             // 09/09: ĐỔI NGHĨA = số dòng linh hồn GỐC MIỄN PHÍ (giữ tên key cho db cũ). Luôn chọn được tới 4 dòng, dòng vượt gốc trả upSoulLine/dòng - y như passiveMax
        level: Math.floor(num(c.level, 80, 1, 100)),
        stars: Math.floor(num(c.stars, 4, 0, 4)),   // SỐ SAO thật (tối đa 4 - mod tự đổi sang Rank 1..5 của save)
        // 26/08: PAL VƯỢT TRẦN (chủ server đã kiểm chứng bằng Creative Menu, game chịu).
        // 3 giá trị dưới là mức GỐC MIỄN PHÍ - người chơi muốn hơn thì MUA từng nấc
        // ngay trong bảng nhận (bảng giá up* bên dưới, admin chỉnh ở panel).
        ivs: Math.floor(num(c.ivs, 100, 1, 255)),                 // IV gốc miễn phí
        soulPct: Math.floor(num(c.soulPct, 60, 3, 201)),          // % linh hồn gốc miễn phí mỗi dòng (rank = %/3)
        passiveMax: Math.floor(num(c.passiveMax, 4, 1, 8)),       // số ô passive gốc miễn phí
        // 💎 bảng giá nâng cấp (26/08, chủ server đưa): ô passive 5-8 giá RIÊNG TỪNG Ô;
        // linh hồn tính theo BẬC 3% với 5 khung giá; IV tính theo điểm.
        upSlot5: Math.floor(num(c.upSlot5, 8000, 0, 10000000)),
        upSlot6: Math.floor(num(c.upSlot6, 16000, 0, 10000000)),
        upSlot7: Math.floor(num(c.upSlot7, 32000, 0, 10000000)),
        upSlot8: Math.floor(num(c.upSlot8, 64000, 0, 10000000)),
        upSlotLow: Math.floor(num(c.upSlotLow, 5000, 0, 10000000)),   // 💎 09/09: giá MỖI ô passive 2-4 khi admin hạ "ô gốc miễn phí" xuống dưới 4 (ô 5-8 vẫn giá riêng)
        upIv: Math.floor(num(c.upIv, 500, 0, 1000000)),           // giá mỗi ĐIỂM IV trên mức gốc, TÍNH RIÊNG TỪNG CHỈ SỐ (Máu/Công/Thủ)
        upSoulLine: Math.floor(num(c.upSoulLine, 5000, 0, 10000000)), // phí THÊM DÒNG linh hồn: 09/09 giá PHẲNG mỗi dòng thêm (dòng 1 miễn phí, dòng 2/3/4 mỗi dòng = giá này)
        upSoul1: Math.floor(num(c.upSoul1, 1000, 0, 10000000)),   // giá MỖI 1% tới 72% (kéo 1 nấc 3% = x3 giá)
        upSoul2: Math.floor(num(c.upSoul2, 1500, 0, 10000000)),   // mỗi 1%: 72 -> 81%
        upSoul3: Math.floor(num(c.upSoul3, 2500, 0, 10000000)),   // mỗi 1%: 81 -> 90%
        upSoul4: Math.floor(num(c.upSoul4, 3500, 0, 10000000)),   // mỗi 1%: 90 -> 102%
        upSoul5: Math.floor(num(c.upSoul5, 6000, 0, 10000000)),   // mỗi 1%: 102 -> 201%
        upWtPassive: Math.floor(num(c.upWtPassive, 1000, 0, 10000000)), // 🌈 giá MỖI passive Cây Thế Giới (26/08 mở bán trong bảng nhận)
        upTier4: Math.floor(num(c.upTier4, 0, 0, 10000000)),          // 💎 09/09: giá MỖI passive HẠNG 4 thường (tier 4, không phải Cây Thế Giới: Huyền Thoại, May Mắn, Thần Tốc...). 0 = miễn phí như cũ
        upBoss: Math.floor(num(c.upBoss, 10000, 0, 10000000)),   // 👑 07/09: bản PAL BOSS thành TUỲ CHỌN trả phí (mặc định giao bản thường)
        // 🎯 4 boss raid bán ĐÍCH DANH ở trang Chọn Pal, giá riêng từng con (26/08); 0 = ngừng bán
        pickBellaLib: Math.floor(num(c.pickBellaLib, 9000, 0, 10000000)),   // Bellanoir Libero
        pickBlaza: Math.floor(num(c.pickBlaza, 20000, 0, 10000000)),        // Blazamut Ryu
        pickXeno: Math.floor(num(c.pickXeno, 20000, 0, 10000000)),          // Xenolord
        pickHarta: Math.floor(num(c.pickHarta, 20000, 0, 10000000)),        // Hartalis
        boss: c.boss === undefined ? true : !!c.boss,             // giao bản BOSS_ (pal boss)
        raw: !!c.raw,   // 🔒 09/09: TẮT CHỈ SỐ - mọi pal giao ra Lv1 · 0 sao · IV 1 · không linh hồn · không BOSS (team chơi lại, sợ pal quá mạnh). Passive vẫn chọn/mua như cũ
        open: c.open === undefined ? true : !!c.open,
        // 🍀 THANH MAY MẮN + VÒNG RAID (27/08): mỗi lượt quay thường nạp luckMin..luckMax %
        // (admin còn đặt riêng %/quay TỪNG NGƯỜI ở panel - xem palLuckStep). Đầy 100% được
        // 1 vé quay vòng RAID: trúng 1/4 boss + thưởng raidBonus Dogcoin.
        luckMin: Math.floor(num(c.luckMin, 1, 0, 100)),
        luckMax: Math.floor(num(c.luckMax, 3, 0, 100)),
        raidBonus: Math.floor(num(c.raidBonus, 18000, 0, 100000000)),
        raidWheelOn: c.raidWheelOn === undefined ? true : !!c.raidWheelOn,
        // ⏳ COOLDOWN NHẬN PAL CHUNG TOÀN SERVER (28/08): ai nhận 1 con thì CẢ SERVER phải
        // chờ ngần này giây mới nhận con tiếp (giảm tải hàng đợi mod/SFTP). 0 = tắt.
        // 03/09: hạ 300 -> 120 theo yêu cầu chủ server (kèm migration 1 lần ở ready).
        claimCd: Math.floor(num(c.claimCd, 120, 0, 86400)),
        // 📅 HẠN MỨC PAL/NGÀY từng người (09/09): mỗi người chỉ chuyển được ngần này pal
        // vào game mỗi ngày (giờ VN, reset 00:00). 0 = tắt. Chỉ đếm lượt giao THÀNH CÔNG.
        dayMax: Math.floor(num(c.dayMax, 5, 0, 1000)),
    };
}

// ===== 🆘 TẨU THOÁT KHẨN CẤP (09/09): nút trên Hồ sơ web, 1 tiếng/người/lần =====
// PalDefender chặn Emergency Respawn gốc (né được DeathPenalty=All). Bản có kiểm soát
// này KHÔNG giết nhân vật - mod chỉ dịch chuyển về điểm xuất phát, nên không có hình
// phạt nào để né. Cooldown chỉ tính khi mod xác nhận OK - lỗi/timeout không tốn lượt.
const RESCUE_CD_MS = 1 * 3600 * 1000;   // 10/09: 4 tiếng -> 1 tiếng (chủ server);
async function palRescue(userId) {
    const u = getUserData(userId);
    const gameName = (u.ingameName || '').trim();
    if (!gameName) return { error: 'Chưa liên kết tên nhân vật trong game - nhờ admin liên kết ở panel trước đã' };
    const left = (u.lastRescue || 0) + RESCUE_CD_MS - Date.now();
    if (left > 0) return { error: `🆘 Tẩu thoát 1 tiếng mới dùng được 1 lần - còn ${Math.ceil(left / 60000)} phút nữa` };
    if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi bấm lại' };
    deliverLock();
    // 10/09: KIỂM ONLINE TRƯỚC như mọi luồng giao đồ - offline vẫn còn PlayerState nhưng không có
    // nhân vật, mod báo lỗi kỹ thuật thô ("khong lay duoc pawn") làm người chơi hoảng.
    const on = await requireOnline(gameName);
    if (on.unknown) { deliverUnlock(); return { error: `Không kiểm tra được trạng thái online (${on.msg || 'timeout'}) - thử lại sau vài phút (chưa tính lượt)` }; }
    if (!on.online) { deliverUnlock(); return { error: `Nhân vật ${gameName} chưa ONLINE trong game - vào game, đứng yên vài giây rồi bấm 🆘 (chưa tính lượt)` }; }
    // 📍 điểm đích do admin đặt ở panel (dbCache._rescuePoint); chưa đặt -> mod fallback
    // PlayerStart (10/09 đo ra là World Tree - nhắc admin đặt điểm cho tử tế)
    const pt = dbCache._rescuePoint;
    const point = pt && [pt.x, pt.y, pt.z].every(Number.isFinite) ? pt : null;
    let r = null, err = null;
    try { r = await pal.rescuePlayer(gameName, point); } catch (e) { err = e; }
    deliverUnlock();
    if (r && r.ok) {
        u.lastRescue = Date.now();
        saveDbNow();
        writeLog('ADMIN', `[TẨU THOÁT] ${u.name || userId} (${gameName}) dịch chuyển về điểm xuất phát`);
        return { ok: true, message: '🆘 Đã dịch chuyển nhân vật về ĐIỂM XUẤT PHÁT! Không chết, không rớt gì - hẹn 1 tiếng nữa.' };
    }
    const msg = (r && r.message) || (err && err.message) || 'không nhận được phản hồi';
    if (/player not found|khong lay duoc pawn/i.test(msg)) return { error: `Nhân vật ${gameName} chưa ONLINE trong game (hoặc vừa thoát) - vào game rồi bấm 🆘 lại (chưa tính lượt)` };
    if (/timeout|aborted|không phản hồi/i.test(msg)) return { error: 'Mod trong game không trả lời kịp - server đang bận, thử lại sau 1 phút (chưa tính lượt)' };
    return { error: 'Chưa dịch chuyển được: ' + msg.slice(0, 120) + ' - thử lại sau (chưa tính lượt)' };
}

// ===== 🛒 SHOP ITEM (28/08): mua item game + số lượng -> giao thẳng vào túi qua mod =====
// Danh mục admin tự quản ở panel (dbCache._itemShop): { id (StaticItemId game), name, price, max }.
// Bộ mặc định: seed 1 LẦN khi DB chưa từng có _itemShop (deploy mới là có sẵn). Admin sửa/
// xoá sau thì thôi (kể cả xoá sạch thành [] cũng KHÔNG seed lại - chỉ seed khi undefined).
// StaticItemId tra từ paldb (mục "Code"); hình ở assets/itemimage/.
const DEFAULT_ITEM_SHOP = [
    { cat: 'consume', id: 'ExpBoost_04', name: 'Sách Huấn Luyện (XL)', price: 50, max: 999, img: 'T_itemicon_Consume_ExpBoost_04.webp' },
    { cat: 'consume', id: 'AffectionFruit_01', name: 'Đào Tâm Giao', price: 2500, max: 999, img: 'T_itemicon_Consume_AffectionFruit_01.webp' },
    { cat: 'consume', id: 'LvUP_01', name: 'Tinh Thể Bồi Dưỡng', price: 1300, max: 999, img: 'T_itemicon_Consume_LvUP_01.webp' },
    { cat: 'armor', id: 'AncientArmorWeight_5', name: 'Áo Giáp Cổ Đại Hạng Nhẹ (Huyền Thoại)', price: 40000, max: 99, img: 'T_itemicon_Armor_AncientArmorWeight.webp' },
    { cat: 'armor', id: 'AncientHelmet_5', name: 'Mũ Cổ Đại (Huyền Thoại)', price: 40000, max: 99, img: 'T_itemicon_Armor_AncientHelmet.webp' },
    { cat: 'consume', id: 'AncientParts2', name: 'Lõi Văn Minh Cổ Đại', price: 500, max: 999, img: 'T_itemicon_Material_AncientParts2.webp' },
    // 04/09: 12 vũ khí Huyền Thoại - Code chuẩn theo paldb (Legendary = hậu tố _5;
    // riêng LaserMiningTool chỉ có 1 bản legendary không hậu tố, cần câu Depresso
    // là FishingRod_03_2 - FishingRod_6 chỉ là TÊN ICON, không phải id). Tên = paldb /vi.
    { cat: 'weapon', id: 'BeamLauncher_5', name: 'Thiết Bị Phóng Chùm Tia (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_BeamLauncher.webp' },
    { cat: 'weapon', id: 'ElectricArcAssaultRifle_5', name: 'Súng Trường Plasma (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_ElectricArcAssaultRifle.webp' },
    { cat: 'weapon', id: 'DroneLauncher_5', name: 'Thiết Bị Phóng Drone (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_DroneLauncher.webp' },
    { cat: 'weapon', id: 'SkyBeamSword_5', name: 'Kiếm Laser (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_SkyBeamSword.webp' },
    { cat: 'weapon', id: 'SkyGrenadeLauncher_5', name: 'Súng Phóng Lựu Chiến Thuật (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_SkyGrenadeLauncher.webp' },
    { cat: 'weapon', id: 'SkyAssaultRifle_5', name: 'Súng Trường Tấn Công Hạng Nặng (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_SkyAssaultRifle.webp' },
    { cat: 'weapon', id: 'SkyShotgun_5', name: 'Súng Săn Nguyên Mẫu (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_SkyShotgun.webp' },
    { cat: 'weapon', id: 'LaserMiningTool', name: 'Máy Cắt Plasma Đa Năng (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_LaserMiningTool.webp' },
    { cat: 'weapon', id: 'SkyBow_5', name: 'Cung Cơ Khí (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_SkyBow.webp' },
    { cat: 'weapon', id: 'SkySubmachineGun_5', name: 'Súng Tiểu Liên Chiến Đấu (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_SkySubmachineGun.webp' },
    { cat: 'weapon', id: 'YakushimaBlade003_5', name: 'Terraprisma (Huyền Thoại)', price: 45000, max: 99, img: 'T_itemicon_Weapon_YakushimaBlade003.webp' },
    { cat: 'weapon', id: 'FishingRod_03_2', name: 'Cần Câu Cao Cấp (Depresso)', price: 70000, max: 99, img: 'T_itemicon_Weapon_FishingRod_6.webp' },
    // 04/09 (chiều): 9 viên ĐÁ THỨC TỈNH (Awakening Crystal) 10k/viên - code chuẩn paldb
    // PalAwakening_<Hệ>, tên tiếng Việt theo paldb /vi. Ghép vào DB đang chạy bằng cờ
    // RIÊNG _migItemShopAwaken0409 (không chạy lại merge tổng).
    { cat: 'consume', id: 'PalAwakening_Water', name: 'Tinh Thể Thức Tỉnh Hệ Nước', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Water.webp' },
    { cat: 'consume', id: 'PalAwakening_Electric', name: 'Tinh Thể Thức Tỉnh Hệ Sấm', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Electric.webp' },
    { cat: 'consume', id: 'PalAwakening_Ground', name: 'Tinh Thể Thức Tỉnh Hệ Đất', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Ground.webp' },
    { cat: 'consume', id: 'PalAwakening_Grass', name: 'Tinh Thể Thức Tỉnh Hệ Cỏ', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Grass.webp' },
    { cat: 'consume', id: 'PalAwakening_Fire', name: 'Tinh Thể Thức Tỉnh Hệ Lửa', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Fire.webp' },
    { cat: 'consume', id: 'PalAwakening_Ice', name: 'Tinh Thể Thức Tỉnh Hệ Băng', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Ice.webp' },
    { cat: 'consume', id: 'PalAwakening_Dragon', name: 'Tinh Thể Thức Tỉnh Hệ Rồng', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Dragon.webp' },
    { cat: 'consume', id: 'PalAwakening_Dark', name: 'Tinh Thể Thức Tỉnh Hệ Bóng Tối', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Dark.webp' },
    { cat: 'consume', id: 'PalAwakening_Neutral', name: 'Tinh Thể Thức Tỉnh Hệ Thường', price: 10000, max: 999, img: 'T_itemicon_Consume_PalAwakening_Neutral.webp' },
    // 07/09: 💍 PHỤ KIỆN - code + tên VN + tác dụng đối chiếu registry save-editor (icon->code
    // khớp 38/38, lưu ý game gõ sai "Dargon" trong code nhẫn Elphidran). Không ghi giá = 60k.
    { cat: 'accessory', id: 'Accessory_AirDash3', name: 'Giày Lướt Gió Ba Bước', price: 20000, max: 99, img: 'T_itemicon_Accessory_AirDash.webp', note: 'Lướt nhanh trên không 3 lần' },
    { cat: 'accessory', id: 'Otomo_PalExp_Increase_3', name: 'Chuông Thúc Đẩy Tăng Trưởng (Cấp 3)', price: 20000, max: 99, img: 'T_itemicon_Accessory_Otomo_Exp_up.webp', note: 'Tăng kinh nghiệm nhận được cho Pal (cấp 3)' },
    { cat: 'accessory', id: 'Accessory_PPAT_1', name: 'Huy Hiệu Dogen', price: 50000, max: 99, img: 'T_itemicon_Accessory_PPAT_1.webp', note: 'Tăng Tấn Công người chơi + Tấn Công Pal' },
    { cat: 'accessory', id: 'Accessory_PPDF_1', name: 'Huy Hiệu Silvegis', price: 50000, max: 99, img: 'T_itemicon_Accessory_PPDF_1.webp', note: 'Tăng Phòng Thủ người chơi + Phòng Thủ Pal' },
    { cat: 'accessory', id: 'Accessory_HCMW_1', name: 'Bùa Hộ Mệnh Thương Nhân Lang Thang', price: 50000, max: 99, img: 'T_itemicon_Accessory_HCMW_1.webp', note: 'Chịu nhiệt/lạnh tốt + tăng giới hạn sức mang' },
    { cat: 'accessory', id: 'Accessory_HCHP_1', name: 'Bùa Hộ Mệnh Đội Tiền Trạm', price: 50000, max: 99, img: 'T_itemicon_Accessory_HCHP_1.webp', note: 'Chịu nhiệt/lạnh tốt + tăng đáng kể Máu' },
    { cat: 'accessory', id: 'Accessory_ExplosionResist', name: 'Trang Phục Chống Cháy Nổ', price: 50000, max: 99, img: 'T_itemicon_Accessory_ExplosionResist.webp', note: 'Miễn nhiễm sát thương cháy nổ' },
    { cat: 'accessory', id: 'Accessory_DFHP_1', name: 'Đai Warsect Terra', price: 50000, max: 99, img: 'T_itemicon_Accessory_DFHP_1.webp', note: 'Tăng đáng kể Phòng Thủ và Máu' },
    { cat: 'accessory', id: 'Accessory_WKMC_1', name: 'Đai Dụng Cụ Dân Đảo', price: 50000, max: 99, img: 'T_itemicon_Accessory_WKMC_1.webp', note: 'Tăng sức mang + tốc độ làm việc' },
    // 9 gậy chỉ huy: tăng TẤN CÔNG Pal cùng chiến đấu + buff sát thương theo hệ
    { cat: 'accessory', id: 'Otomo_ATNormal_ElementBoost_1', name: 'Gậy Chỉ Huy Thiên Vương', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATNormal_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Thường' },
    { cat: 'accessory', id: 'Otomo_ATFire_ElementBoost_1', name: 'Gậy Chỉ Huy Viêm Đế', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATFire_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Lửa' },
    { cat: 'accessory', id: 'Otomo_ATWater_ElementBoost_1', name: 'Gậy Chỉ Huy Hải Vương', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATWater_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Nước' },
    { cat: 'accessory', id: 'Otomo_ATElectricity_ElementBoost_1', name: 'Gậy Chỉ Huy Lôi Đế', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATElectricity_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Sấm' },
    { cat: 'accessory', id: 'Otomo_ATLeaf_ElementBoost_1', name: 'Gậy Chỉ Huy Tinh Linh Vương', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATLeaf_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Cỏ' },
    { cat: 'accessory', id: 'Otomo_ATIce_ElementBoost_1', name: 'Gậy Chỉ Huy Băng Đế', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATIce_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Băng' },
    { cat: 'accessory', id: 'Otomo_ATEarth_ElementBoost_1', name: 'Gậy Chỉ Huy Địa Đế', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATEarth_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Đất' },
    { cat: 'accessory', id: 'Otomo_ATDark_ElementBoost_1', name: 'Gậy Chỉ Huy Minh Vương', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATDark_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Bóng Tối' },
    { cat: 'accessory', id: 'Otomo_ATDragon_ElementBoost_1', name: 'Gậy Chỉ Huy Thần Long', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_ATDragon_ElementBoost_1.webp', note: 'Tăng Tấn Công Pal cùng đánh + buff sát thương hệ Rồng' },
    // 9 bùa hộ mệnh: tăng PHÒNG THỦ Pal cùng chiến đấu + buff sát thương theo hệ
    { cat: 'accessory', id: 'Otomo_DFNormal_ElementBoost_1', name: 'Bùa Hộ Mệnh Hartalis', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFNormal_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Thường' },
    { cat: 'accessory', id: 'Otomo_DFFire_ElementBoost_1', name: 'Bùa Hộ Mệnh Blazamut', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFFire_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Lửa' },
    { cat: 'accessory', id: 'Otomo_DFWater_ElementBoost_1', name: 'Bùa Hộ Mệnh Neptilius', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFWater_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Nước' },
    { cat: 'accessory', id: 'Otomo_DFElectricity_ElementBoost_1', name: 'Bùa Hộ Mệnh Orserk', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFElectricity_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Sấm' },
    { cat: 'accessory', id: 'Otomo_DFLeaf_ElementBoost_1', name: 'Bùa Hộ Mệnh Lyleen', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFLeaf_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Cỏ' },
    { cat: 'accessory', id: 'Otomo_DFIce_ElementBoost_1', name: 'Bùa Hộ Mệnh Frostallion', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFIce_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Băng' },
    { cat: 'accessory', id: 'Otomo_DFEarth_ElementBoost_1', name: 'Bùa Hộ Mệnh Anubis', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFEarth_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Đất' },
    { cat: 'accessory', id: 'Otomo_DFDark_ElementBoost_1', name: 'Bùa Hộ Mệnh Lyleen Noct', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFDark_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Bóng Tối' },
    { cat: 'accessory', id: 'Otomo_DFDragon_ElementBoost_1', name: 'Bùa Hộ Mệnh Jetragon', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_DFDragon_ElementBoost_1.webp', note: 'Tăng Phòng Thủ Pal cùng đánh + buff sát thương hệ Rồng' },
    // 9 nhẫn hệ: GIẢM sát thương nhận vào 1 hệ + buff sát thương 1 hệ cho Pal
    { cat: 'accessory', id: 'Accessory_Otomo_Fire_1', name: 'Nhẫn Blazehowl', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Fire_1.webp', note: 'Giảm sát thương hệ Cỏ nhận vào + buff hệ Lửa cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Fire_2', name: 'Nhẫn Faleris', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Fire_2.webp', note: 'Giảm sát thương hệ Băng nhận vào + buff hệ Lửa cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Water_1', name: 'Nhẫn Faleris Aqua', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Water_1.webp', note: 'Giảm sát thương hệ Lửa nhận vào + buff hệ Nước cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Electricity_1', name: 'Nhẫn Fenglope Lux', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Electricity_1.webp', note: 'Giảm sát thương hệ Nước nhận vào + buff hệ Sấm cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Earth_1', name: 'Nhẫn Menasting Terra', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Earth_1.webp', note: 'Giảm sát thương hệ Sấm nhận vào + buff hệ Đất cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Leaf_1', name: 'Nhẫn Vaelet', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Leaf_1.webp', note: 'Giảm sát thương hệ Đất nhận vào + buff hệ Cỏ cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Dark_1', name: 'Nhẫn Katress', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Dark_1.webp', note: 'Giảm sát thương hệ Thường nhận vào + buff hệ Bóng Tối cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Dargon_1', name: 'Nhẫn Elphidran', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Dargon_1.webp', note: 'Giảm sát thương hệ Bóng Tối nhận vào + buff hệ Rồng cho Pal' },
    { cat: 'accessory', id: 'Accessory_Otomo_Ice_1', name: 'Nhẫn Cryolinx', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_Ice_1.webp', note: 'Giảm sát thương hệ Rồng nhận vào + buff hệ Băng cho Pal' },
    // 2 nhẫn lẻ (chủ server tải icon sẵn, giá mặc định 60k)
    { cat: 'accessory', id: 'Accessory_Avoid_1', name: 'Nhẫn Huyễn Ảnh', price: 60000, max: 99, img: 'T_itemicon_Accessory_Accessory_Avoid_1.webp', note: 'Kéo dài thời gian bất tử khi lăn/nhảy né' },
    { cat: 'accessory', id: 'Otomo_PalConfidence_Increase_1', name: 'Nhẫn Tin Cậy', price: 60000, max: 99, img: 'T_itemicon_Accessory_Otomo_PalConfidence_Increase_1.webp', note: 'Dễ chiếm lòng tin của Pal hơn' },
    // 10/09: 🍖 13 thức ăn (thịt sống + mật ong) + 🧱 6 nguyên liệu (nhóm material MỚI) - chủ server
    // tải icon sẵn. Giá 2 Dogcoin/cái (chủ server chốt 10/09: cần số lượng rất lớn) - bù bằng giới hạn/ngày.
    { cat: 'food', id: 'Meat_ChickenPal', name: 'Thịt Gà Chikipi', price: 2, max: 999, img: 'T_itemicon_Food_Meat_ChickenPal.webp' },
    { cat: 'food', id: 'Meat_SheepBall', name: 'Thịt Cừu Lamball', price: 2, max: 999, img: 'T_itemicon_Food_Meat_SheepBall.webp' },
    { cat: 'food', id: 'Meat_Boar', name: 'Thịt Lợn Rushoar', price: 2, max: 999, img: 'T_itemicon_Food_Meat_Boar.webp' },
    { cat: 'food', id: 'Meat_CowPal', name: 'Thịt Bò Mozzarina', price: 2, max: 999, img: 'T_itemicon_Food_Meat_CowPal.webp' },
    { cat: 'food', id: 'Meat_BerryGoat', name: 'Thịt Caprity Thảo Mộc', price: 2, max: 999, img: 'T_itemicon_Food_Meat_BerryGoat.webp' },
    { cat: 'food', id: 'Meat_Deer', name: 'Thịt Nai Eikthyrdeer', price: 2, max: 999, img: 'T_itemicon_Food_Meat_Deer.webp' },
    { cat: 'food', id: 'Meat_IceDeer', name: 'Thịt Nai Reindrix', price: 2, max: 999, img: 'T_itemicon_Food_Meat_IceDeer.webp' },
    { cat: 'food', id: 'Meat_Eagle', name: 'Thịt Gà Galeclaw', price: 2, max: 999, img: 'T_itemicon_Food_Meat_Eagle.webp' },
    { cat: 'food', id: 'Meat_Kelpie', name: 'Thịt Cá Kelpsea', price: 2, max: 999, img: 'T_itemicon_Food_Meat_Kelpie.webp' },
    { cat: 'food', id: 'Meat_LazyCatfish', name: 'Thịt Cá Dumud', price: 2, max: 999, img: 'T_itemicon_Food_Meat_LazyCatfish.webp' },
    { cat: 'food', id: 'Meat_SakuraSaurus', name: 'Thịt Khủng Long Broncherry', price: 2, max: 999, img: 'T_itemicon_Food_Meat_SakuraSaurus.webp' },
    { cat: 'food', id: 'Meat_GrassMammoth', name: 'Thịt Quái Thú Mammorest', price: 2, max: 999, img: 'T_itemicon_Food_Meat_GrassMammoth.webp' },
    { cat: 'food', id: 'Honey', name: 'Mật Ong', price: 2, max: 999, img: 'T_itemicon_Food_Honey.webp' },
    { cat: 'material', id: 'FireOrgan', name: 'Cơ Quan Tạo Lửa', price: 2, max: 999, img: 'T_itemicon_Material_FireOrgan.webp' },
    { cat: 'material', id: 'IceOrgan', name: 'Cơ Quan Kết Băng', price: 2, max: 999, img: 'T_itemicon_Material_IceOrgan.webp' },
    { cat: 'material', id: 'ElectricOrgan', name: 'Cơ Quan Sinh Điện', price: 2, max: 999, img: 'T_itemicon_Material_ElectricOrgan.webp' },
    { cat: 'material', id: 'Venom', name: 'Tuyến Độc', price: 2, max: 999, img: 'T_itemicon_Material_Venom.webp' },
    { cat: 'material', id: 'PalOil', name: 'Dầu Pal Thượng Hạng', price: 2, max: 999, img: 'T_itemicon_Material_PalOil.webp' },
    { cat: 'material', id: 'PalItem_RaijinDaughter', name: 'Mây Dazzi', price: 2, max: 999, img: 'T_itemicon_Material_PalItem_RaijinDaughter.webp' },
    // 10/09: 🔫 32 loại đạn (mọi Ammo trong game trừ Magnum + Súng Máy chưa có), 1 Dogcoin/cái - thương nhân
    // đã tắt (BialkShopOff) nên đạn chỉ mua được ở đây. Tên = tên tiếng Việt trong game (gameitems.json).
    { cat: 'ammo', id: 'Arrow', name: 'Mũi Tên', price: 1, max: 999, img: 'T_itemicon_Ammo_Arrow.webp' },
    { cat: 'ammo', id: 'Arrow_Poison', name: 'Mũi Tên Độc', price: 1, max: 999, img: 'T_itemicon_Ammo_Arrow_Poison.webp' },
    { cat: 'ammo', id: 'Arrow_Fire', name: 'Mũi Tên Lửa', price: 1, max: 999, img: 'T_itemicon_Ammo_Arrow_Fire.webp' },
    { cat: 'ammo', id: 'ReinforcedArrow', name: 'Mũi Tên Cường Hóa', price: 1, max: 999, img: 'T_itemicon_Ammo_ReinforcedArrow.webp' },
    { cat: 'ammo', id: 'SFArrow', name: 'Mũi Tên Nâng Cấp', price: 1, max: 999, img: 'T_itemicon_Ammo_SFArrow.webp' },
    { cat: 'ammo', id: 'RoughBullet', name: 'Đạn Thô', price: 1, max: 999, img: 'T_itemicon_Ammo_RoughBullet.webp' },
    { cat: 'ammo', id: 'HandgunBullet', name: 'Đạn Súng Ngắn', price: 1, max: 999, img: 'T_itemicon_Ammo_HandgunBullet.webp' },
    { cat: 'ammo', id: 'RifleBullet', name: 'Đạn Súng Trường', price: 1, max: 999, img: 'T_itemicon_Ammo_RifleBullet.webp' },
    { cat: 'ammo', id: 'ShotgunBullet', name: 'Đạn Súng Săn', price: 1, max: 999, img: 'T_itemicon_Ammo_ShotgunBullet.webp' },
    { cat: 'ammo', id: 'AssaultRifleBullet', name: 'Đạn Súng Trường Tấn Công', price: 1, max: 999, img: 'T_itemicon_Ammo_AssaultRifleBullet.webp' },
    { cat: 'ammo', id: 'ExplosiveBullet', name: 'Tên Lửa', price: 1, max: 999, img: 'T_itemicon_Ammo_ExplosiveBullet.webp' },
    { cat: 'ammo', id: 'InkBullet', name: 'Đạn Súng Bắn Decal', price: 1, max: 999, img: 'T_itemicon_Ammo_InkBullet.webp' },
    { cat: 'ammo', id: 'FlamethrowerBullet', name: 'Nhiên Liệu Súng Phun Lửa', price: 1, max: 999, img: 'T_itemicon_Ammo_FlamethrowerBullet.webp' },
    { cat: 'ammo', id: 'MissileBullet', name: 'Tên Lửa Điều Khiển', price: 1, max: 999, img: 'T_itemicon_Ammo_MissileBullet.webp' },
    { cat: 'ammo', id: 'GrenadeBullet', name: 'Lựu Đạn', price: 1, max: 999, img: 'T_itemicon_Ammo_GrenadeBullet.webp' },
    { cat: 'ammo', id: 'GatlingBullet', name: 'Đạn Súng Nòng Xoay', price: 1, max: 999, img: 'T_itemicon_Ammo_GatlingBullet.webp' },
    { cat: 'ammo', id: 'MeteorBullet', name: 'Đạn Thiên Thạch', price: 1, max: 999, img: 'T_itemicon_Ammo_MeteorBullet.webp' },
    { cat: 'ammo', id: 'LaserBullet', name: 'Đạn Năng Lượng', price: 1, max: 999, img: 'T_itemicon_Ammo_LaserBullet.webp' },
    { cat: 'ammo', id: 'EnergyLauncherBullet', name: 'Đạn Plasma', price: 1, max: 999, img: 'T_itemicon_Ammo_EnergyLauncherBullet.webp' },
    { cat: 'ammo', id: 'LaserGatlingBullet', name: 'Đạn Súng Nòng Xoay Laser', price: 1, max: 999, img: 'T_itemicon_Ammo_LaserGatlingBullet.webp' },
    { cat: 'ammo', id: 'ChargeLaserRifleBullet', name: 'Đạn Súng Trường Năng Lượng', price: 1, max: 999, img: 'T_itemicon_Ammo_ChargeLaserRifleBullet.webp' },
    { cat: 'ammo', id: 'OverheatRifleBullet', name: 'Đạn Súng Trường Quá Nhiệt', price: 1, max: 999, img: 'T_itemicon_Ammo_OverheatRifleBullet.webp' },
    { cat: 'ammo', id: 'EnergyShotgunBullet', name: 'Đạn Súng Săn Năng Lượng', price: 1, max: 999, img: 'T_itemicon_Ammo_EnergyShotgunBullet.webp' },
    { cat: 'ammo', id: 'PalDopingShotBullet', name: 'Đạn Súng Cường Lực', price: 1, max: 999, img: 'T_itemicon_Ammo_PalDopingShotBullet.webp' },
    { cat: 'ammo', id: 'WidePenetrateShotgunBullet', name: 'Đạn Súng Năng Lượng Tán Xạ', price: 1, max: 999, img: 'T_itemicon_Ammo_WidePenetrateShotgunBullet.webp' },
    { cat: 'ammo', id: 'ElectricArcAssaultRifleBullet', name: 'Đạn Súng Trường Plasma', price: 1, max: 999, img: 'T_itemicon_Ammo_ElectricArcAssaultRifleBullet.webp' },
    { cat: 'ammo', id: 'BeamLauncherBullet', name: 'Đạn Thiết Bị Phóng Chùm Tia', price: 1, max: 999, img: 'T_itemicon_Ammo_BeamLauncherBullet.webp' },
    { cat: 'ammo', id: 'SkyBowArrow', name: 'Mũi Tên Cung Cơ Khí', price: 1, max: 999, img: 'T_itemicon_Ammo_SkyBowArrow.webp' },
    { cat: 'ammo', id: 'SkySubmachineGunBullet', name: 'Đạn Súng Tiểu Liên Chiến Đấu', price: 1, max: 999, img: 'T_itemicon_Ammo_SkySubmachineGunBullet.webp' },
    { cat: 'ammo', id: 'SkyShotgunBullet', name: 'Đạn Súng Săn Nguyên Mẫu', price: 1, max: 999, img: 'T_itemicon_Ammo_SkyShotgunBullet.webp' },
    { cat: 'ammo', id: 'SkyAssaultRifleBullet', name: 'Đạn Súng Trường Tấn Công Hạng Nặng', price: 1, max: 999, img: 'T_itemicon_Ammo_SkyAssaultRifleBullet.webp' },
    { cat: 'ammo', id: 'SkyGrenadeLauncherBullet', name: 'Đạn Súng Phóng Lựu Chiến Thuật', price: 1, max: 999, img: 'T_itemicon_Ammo_SkyGrenadeLauncherBullet.webp' },
    // 10/09: 🧬 IMPLANT (nhóm implant MỚI) - 14 cấy ghép mở từ Đấu Trường (Arena) + Truy Nã (Bounty) và Chuyển Đổi
    // giới tính. 6.000/cái, dùng chung 1 icon. Hạn RIÊNG: mỗi người tối đa 2 cái/ngày mọi loại gộp (itemShopImplantMax).
    // Tên = tên item trong game (gameitems.json), chú thích = mô tả passive (passives.json).
    // Thứ tự hiện trên web: Chuyển Đổi (icon riêng) → 7 🌳 Cây Thế Giới (12.000, hạn RIÊNG 1/người/ngày, card cầu vồng)
    // → 14 implant thường (6.000, hạn 2/người/ngày). Cả nhóm implant MIỄN hạn chung 📅 (có hạn riêng rồi).
    { cat: 'implant', id: 'PalGenderReverse', name: 'Chuyển Đổi Giới Tính Pal', price: 6000, max: 99, img: 'T_itemicon_Material_PalGenderReverse.webp', note: '⚧ Dùng ở Bàn Phẫu Thuật Pal: đổi giới tính đực ↔ cái của 1 pal (dùng 1 lần)' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_ATK', name: 'Thánh Kiếm Hai Lưỡi', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tấn công +50%, Phòng thủ -30%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_DEF', name: 'Thành Trì Thịt Sống', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Phòng thủ +50%, Tấn công -30%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_ATK_DEF', name: 'Thần Hủy Diệt', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tấn công +40%, Phòng thủ +20%, Máu tối đa -50%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_CraftSpeed', name: 'Bàn Tay Ác Quỷ', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tốc độ làm việc +90%, Minh Mẫn giảm nhanh +15%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_MoveSpeed', name: 'Cú Nhảy Không Gian', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tốc độ di chuyển tăng +50%, Mức Độ No giảm nhanh +15%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_Sanity', name: 'Tiên Nhân', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Minh Mẫn giảm chậm +50%, Tốc độ làm việc -20%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_WorldTree_FullStomach', name: 'Vườn Ươm Cây Thần', price: 12000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Mức Độ No giảm chậm +50%, Máu -20%, cây và đá khu vực Cây Thế Giới không biến mất khi đến gần' },
    // 10/09 (tối): +14 implant DÙNG MỘT LẦN còn lại (5 Đột biến + 9 Cao cấp) 9.000/cái, gộp quota 🧬 2/người/ngày.
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_MutationPal_Immortal', name: 'Thân Thể Bất Tử', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Hút Sinh Mệnh +5%, hồi Máu tự nhiên của Pal +100%, Tấn công +15%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_MutationPal_Mutant', name: 'Thể Chất Đặc Dị', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Hồi Máu tự nhiên của Pal và người chơi +50%, Phòng thủ +25%, sát thương do trúng độc/thiêu đốt vô hiệu' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_MutationPal_Babysitter', name: 'Bảo Mẫu Trông Trẻ', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Ở căn cứ: tốc độ tạo trứng của Pal tại Trang Trại Phối Giống +30%, tốc độ ấp trứng +30%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_MutationPal_ExplosionResist', name: 'Thiết Giáp Hạng Nặng', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Sát thương do nổ vô hiệu' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_RideJumpCount_Increase2', name: 'Bước Đi Trên Không', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Số lần nhảy khi đang cưỡi +2' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_CraftSpeed_up3', name: 'Siêu Cấp Kỹ Năng', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tốc độ làm việc +75%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_Deffence_up3', name: 'Thân Thể Kim Cương', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Phòng thủ +30%, trạng thái choáng bị vô hiệu, thổi bay bị vô hiệu' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_PAL_ALLAttack_up3', name: 'Quỷ Thần', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tấn công +30%, Phòng thủ +5%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_PAL_FullStomach_Down_3', name: 'Nhịn Ăn Thành Thạo', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'No lâu +20,0%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_PAL_Sanity_Down_3', name: 'Bất Động Minh Vương Chi Tâm', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Minh mẫn giảm chậm hơn +20,0%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_MoveSpeed_up_3', name: 'Thần Tốc', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tăng tốc độ di chuyển 30%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_Stamina_Up_3', name: 'Động Cơ Vĩnh Cửu', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Thể lực tối đa +75% (*chỉ hiệu lực đối với Pal có thể cưỡi)' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_Vampire', name: 'Ma Cà Rồng', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Gây sát thương, hấp thụ một phần sát thương đó và hồi phục Máu. Tiếp tục làm việc mà không ngủ, ngay cả vào ban đêm' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Consumable_SwimSpeed_up_3', name: 'Vua Lướt Sóng', price: 9000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tăng tốc độ di chuyển trên mặt nước 50%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_CoolTimeReduction_Up_1', name: 'Điềm Tĩnh', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Thời gian hồi chiêu của kỹ năng chủ động giảm 30%, Tấn công +10%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Stamina_Up_1', name: 'Sức Bền Vô Hạn', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Thể lực tối đa +50% (*chỉ hiệu lực đối với Pal có thể cưỡi)' },
    { cat: 'implant', id: 'PalPassiveSkillChange_MoveSpeed_up_2', name: 'Cấp Tốc', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tăng tốc độ di chuyển 20%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_SwimSpeed_up_2', name: 'Bơi Lội Siêu Phàm', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tăng tốc độ di chuyển trên mặt nước 40%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_SalePrice_Up_1', name: 'Cao Quý', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Giá giao dịch tăng +5%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_AutoHPRegeneRate_Passive', name: 'Hỗ Trợ Hồi Phục', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tốc độ tự hồi Máu của người chơi +5%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_ReloadSpeedUp_Passive', name: 'Bậc Thầy Nạp Đạn', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tăng tốc độ nạp đạn của người chơi +4%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Noukin', name: 'Cơ Bắp', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tấn công +30% NHƯNG Tốc độ làm việc −50%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_Deffence_up2', name: 'Cường Tráng', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Phòng thủ +20%, trạng thái choáng bị vô hiệu' },
    { cat: 'implant', id: 'PalPassiveSkillChange_CraftSpeed_up2', name: 'Nghệ Nhân Đích Thực', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tốc độ làm việc +50%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_TrainerATK_UP_1', name: 'Kẻ Tiên Phong', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tấn công của người chơi tăng 10%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_TrainerDEF_UP_1', name: 'Quân Sư Phòng Thủ', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Phòng thủ của người chơi tăng 10%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_TrainerWorkSpeed_UP_1', name: 'Thúc Đẩy Động Lực', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Tốc độ làm việc của người chơi tăng 25%' },
    { cat: 'implant', id: 'PalPassiveSkillChange_PlayerSP_DecreaseRate_Passive', name: 'Chống Kiệt Sức', price: 6000, max: 99, img: 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp', note: 'Giảm tiêu hao thể lực của người chơi +5,0%' },
    // 11/09: ⭐ QUAN TRỌNG (nhóm important MỚI) - mỗi người chỉ mua ĐÚNG 1 LẦN (vĩnh viễn, không theo ngày).
    // Chủ server tải icon; 2 Hộp Phụ Kiện mở ô phụ kiện. Giá chủ server chốt: Kỳ Lạ 3.000 (tím), Bí Ẩn 10.000 (vàng).
    { cat: 'important', id: 'UnlockEquipmentSlot_Accessory_01', name: 'Hộp Phụ Kiện Kỳ Lạ', price: 3000, max: 1, img: 'T_itemicon_Essential_UnlockEquipmentSlot_Accessory.webp', note: 'Chiếc hộp bí ẩn có phần bên trong đồng bộ với cơ thể người sở hữu. Sở hữu vật phẩm sẽ mở 1 ô trang bị phụ kiện' },
    { cat: 'important', id: 'UnlockEquipmentSlot_Accessory_02', name: 'Hộp Phụ Kiện Bí Ẩn', price: 10000, max: 1, img: 'T_itemicon_Essential_UnlockEquipmentSlot_Accessory_1.webp', note: 'Chiếc hộp bí ẩn có phần bên trong đồng bộ với cơ thể người sở hữu. Sở hữu vật phẩm sẽ mở thêm 1 ô trang bị phụ' },
];
function seedItemShopIfEmpty() {
    if (dbCache._itemShop === undefined) { setItemShop(DEFAULT_ITEM_SHOP); writeLog('SYSTEM', `[SHOP ITEM] Seed ${DEFAULT_ITEM_SHOP.length} món mặc định (DB chưa có danh mục)`); return; }
    // 04/09: shop ĐÃ có danh mục trong DB -> GHÉP THÊM món mặc định còn thiếu (so theo
    // id, không đè món admin đã sửa). Chạy ĐÚNG 1 LẦN theo cờ - sau đợt này admin xoá
    // món nào thì nó không tự mọc lại; đợt bổ sung sau thì THÊM CỜ MỚI + lọc đúng nhóm
    // id mới (đừng chạy lại merge tổng kẻo hồi sinh món admin đã xoá).
    if (!dbCache._migItemShopWeapons0409) {
        dbCache._migItemShopWeapons0409 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const missing = DEFAULT_ITEM_SHOP.filter(x => !have.has(x.id));
        if (missing.length) {
            setItemShop(cur.concat(missing));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${missing.length} món mặc định còn thiếu: ${missing.map(x => x.id).join(', ')}`);
        } else saveDbNow();
    }
    // 04/09 (chiều): đợt 2 - CHỈ ghép 9 viên đá thức tỉnh (PalAwakening_*), cờ riêng
    if (!dbCache._migItemShopAwaken0409) {
        dbCache._migItemShopAwaken0409 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.id.startsWith('PalAwakening_') && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} viên đá thức tỉnh: ${add.map(x => x.id).join(', ')}`);
        } else saveDbNow();
    }
    // 07/09: đợt 3 - CHỈ ghép 38 món 💍 phụ kiện (cat accessory), cờ riêng
    if (!dbCache._migItemShopAcc0709) {
        dbCache._migItemShopAcc0709 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.cat === 'accessory' && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} món phụ kiện`);
        } else saveDbNow();
    }
    // 10/09: đợt 4 - CHỈ ghép 13 🍖 thức ăn + 6 🧱 nguyên liệu mới (cat food/material), cờ riêng
    if (!dbCache._migItemShopFood1009) {
        dbCache._migItemShopFood1009 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => (x.cat === 'food' || x.cat === 'material') && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} món thức ăn + nguyên liệu: ${add.map(x => x.id).join(', ')}`);
        } else saveDbNow();
    }
    // 10/09: đợt 5 - CHỈ ghép 32 🔫 đạn (cat ammo), cờ riêng
    if (!dbCache._migItemShopAmmo1009) {
        dbCache._migItemShopAmmo1009 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.cat === 'ammo' && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} loại đạn (1 Dogcoin/cái)`);
        } else saveDbNow();
    }
    // 10/09: đợt 6 - CHỈ ghép 15 🧬 implant (cat implant), cờ riêng
    if (!dbCache._migItemShopImplant1009) {
        dbCache._migItemShopImplant1009 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.cat === 'implant' && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} implant (6.000/cái, mỗi người 2/ngày)`);
        } else saveDbNow();
    }
    // 10/09: đợt 7 - ghép 7 🌳 implant Cây Thế Giới + đổi icon Chuyển Đổi sang icon riêng, cờ riêng
    if (!dbCache._migItemShopWT1009) {
        dbCache._migItemShopWT1009 = 1;
        const cur = itemShopList().map(x => {
            const y = (x.id === 'PalGenderReverse' && x.img === 'T_itemicon_Material_PalPassiveSkillChange_Consumable.webp') ? { ...x, img: 'T_itemicon_Material_PalGenderReverse.webp' } : { ...x };
            if (y.cat === 'implant') y.note = String(y.note || '').replace(/^(🏟️ Đấu Trường|🎯 Truy Nã|🌳 Cây Thế Giới( \(dùng 1 lần\))?) · /, '');   // chú thích chỉ còn tác dụng
            return y;
        });
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.cat === 'implant' && !have.has(x.id));
        setItemShop(cur.concat(add));
        writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} implant Cây Thế Giới (12.000/cái, 1/người/ngày) + icon Chuyển Đổi riêng`);
    }
    // 10/09: đợt 9 - tên implant chỉ còn tiếng Việt (bỏ "Cấy ghép dùng một lần: " / "Cấy ghép: " / " (English)"), cờ riêng
    // (b: tên từng bị cắt 60 ký tự nên có đuôi " (Twin-Edged Holy" mất ngoặc đóng -> gọt cả đuôi hở)
    if (!dbCache._migItemShopImplantName1009b) {
        dbCache._migItemShopImplantName1009b = 1;
        const strip = (v) => String(v || '').replace(/^Cấy ghép( dùng một lần)?: /, '').replace(/ \([^()]*\)?$/, '').trim();
        const cur = itemShopList();
        let n = 0;
        const fixed = cur.map(x => { if (x.cat !== 'implant') return x; const v = strip(x.name); if (v !== x.name) n++; return { ...x, name: v }; });
        if (n) setItemShop(fixed); else saveDbNow();
        writeLog('SYSTEM', `[SHOP ITEM] Gọt tên ${n} implant về tiếng Việt thuần`);
    }
    // 10/09: đợt 10 - ghép 14 implant dùng một lần còn lại (cat implant còn thiếu), cờ riêng
    if (!dbCache._migItemShopImplant14_1009) {
        dbCache._migItemShopImplant14_1009 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.cat === 'implant' && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} implant dùng một lần (9.000/cái)`);
        } else saveDbNow();
    }
    // 11/09: đợt 11 - ghép nhóm ⭐ QUAN TRỌNG (cat important) còn thiếu, cờ riêng
    if (!dbCache._migItemShopImportant1109) {
        dbCache._migItemShopImportant1109 = 1;
        const cur = itemShopList();
        const have = new Set(cur.map(x => x.id));
        const add = DEFAULT_ITEM_SHOP.filter(x => x.cat === 'important' && !have.has(x.id));
        if (add.length) {
            setItemShop(cur.concat(add));
            writeLog('SYSTEM', `[SHOP ITEM] Ghép thêm ${add.length} món ⭐ QUAN TRỌNG (mỗi người mua 1 lần)`);
        } else saveDbNow();
    }
    // 07/09: điền GHI CHÚ tác dụng cho món cũ còn thiếu (tra id trong DEFAULT) - idempotent
    const rawN = Array.isArray(dbCache._itemShop) ? dbCache._itemShop : [];
    let noted = 0;
    for (const x of rawN) {
        if (!x || x.note) continue;
        const def = DEFAULT_ITEM_SHOP.find(d => d.id === x.id && d.note);
        if (def) { x.note = def.note; noted++; }
    }
    if (noted) { saveDbNow(); writeLog('SYSTEM', `[SHOP ITEM] Điền ghi chú cho ${noted} món cũ`); }
}
// 04/09: điền nhóm (cat) cho món CŨ trong DB còn thiếu - tra theo id trong DEFAULT,
// lạ thì về 'consume'. Idempotent (chỉ đụng món thiếu cat), chạy mỗi boot, không cần cờ.
function backfillItemShopCat() {
    const raw = Array.isArray(dbCache._itemShop) ? dbCache._itemShop : [];
    let fixed = 0;
    for (const x of raw) {
        if (!x || ITEM_SHOP_CATS.includes(x.cat)) continue;
        const def = DEFAULT_ITEM_SHOP.find(d => d.id === x.id);
        x.cat = def ? def.cat : 'consume';
        fixed++;
    }
    if (fixed) { saveDbNow(); writeLog('SYSTEM', `[SHOP ITEM] Điền nhóm cho ${fixed} món cũ trong DB`); }
}

// 🖼️ 04/09: admin UP HÌNH ITEM từ panel - ghi thẳng vào assets/itemimage/ trên đĩa
// + nạp luôn vào RAM assets để phục vụ NGAY, không cần sửa code/đẩy git/restart bot.
// Chỉ nhận ảnh, trần 600KB (body panel cap 1MB, base64 phình 4/3 nên 600KB là an toàn).
// Lưu ý vận hành: file up kiểu này nằm NGOÀI git - muốn giữ bền qua deploy-lại-từ-đầu
// thì thỉnh thoảng gom về repo, còn git pull thường KHÔNG đụng file lạ, cứ yên tâm.
const ASSETS = require('./assets');
function uploadItemImage(fileName, dataB64) {
    const name = String(fileName || '').trim().replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 80);
    if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return { error: 'Chỉ nhận .png .jpg .gif .webp' };
    let buf;
    try { buf = Buffer.from(String(dataB64 || ''), 'base64'); } catch { return { error: 'Dữ liệu ảnh hỏng' }; }
    if (!buf || buf.length < 100) return { error: 'File rỗng/hỏng' };
    if (buf.length > 600 * 1024) return { error: 'Ảnh quá 600KB - icon webp/png ~50KB là đẹp, nén bớt đi' };
    try {
        const dir = require('path').join(__dirname, 'assets', 'itemimage');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(require('path').join(dir, name), buf);
    } catch (e) { return { error: 'Không ghi được file: ' + e.message }; }
    ASSETS.add('itemimage/' + name, buf);
    writeLog('ADMIN', `[SHOP ITEM] Panel up hình itemimage/${name} (${(buf.length / 1024).toFixed(1)}KB)`);
    return { ok: true, file: name };
}
// Giao dùng pal.giveItem (đã có sẵn, cùng đường DogCoin). Trừ tiền TRƯỚC, giao hụt CHẮC
// CHẮN thì hoàn; mơ hồ (timeout) thì giữ tiền + báo admin (chống double-give).
// 🛒 nhóm shop item (1 nguồn cho server; panel/web có bản sao cùng thứ tự). 09/09 thêm food + ammo theo yêu cầu chủ server.
const ITEM_SHOP_CATS = ['weapon', 'armor', 'consume', 'accessory', 'food', 'ammo', 'material', 'implant', 'important'];   // 10/09 +material +implant · 11/09 +important (⭐ mua 1 lần)
function itemShopList() {
    const arr = dbCache._itemShop;
    return (Array.isArray(arr) ? arr : []).filter(x => x && x.id).map(x => ({
        id: String(x.id), name: String(x.name || x.id),
        price: Math.max(0, Math.floor(Number(x.price) || 0)),
        max: Math.max(1, Math.floor(Number(x.max) || 999)),
        img: String(x.img || ''),   // tên file trong assets/itemimage/ (trống = ô 📦)
        cat: ITEM_SHOP_CATS.includes(x.cat) ? x.cat : 'consume',   // 04/09 nhóm · 07/09 💍 phụ kiện · 09/09 🍖 thức ăn + 🔫 đạn
        note: String(x.note || '').slice(0, 240),   // 07/09: ghi chú tác dụng (hiện trên card + search được) · 10/09 nới 140→240
        off: !!x.off,   // 09/09: ẨN khỏi web (admin tắt bán từng món, giữ nguyên dòng trong bảng)
    }));
}
function setItemShop(list) {
    dbCache._itemShop = (Array.isArray(list) ? list : [])
        .map(x => ({
            id: String((x && x.id) || '').trim().replace(/[^A-Za-z0-9_]/g, ''),   // StaticItemId: chỉ chữ/số/_
            name: String((x && x.name) || (x && x.id) || '').trim().slice(0, 60),
            price: Math.max(0, Math.floor(Number(x && x.price) || 0)),
            max: Math.max(1, Math.floor(Number(x && x.max) || 999)),
            img: String((x && x.img) || '').trim().replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 80),
            cat: (x && ITEM_SHOP_CATS.includes(x.cat)) ? x.cat : 'consume',
            note: String((x && x.note) || '').trim().slice(0, 240),
            off: !!(x && x.off),
        }))
        .filter(x => x.id)
        .slice(0, 300);   // 10/09: trần 100 -> 300 (84 món + 32 đạn = 116 đã vượt 100)
    saveDbNow();
    return itemShopList();
}
// 📦 08/09: KHO ĐỒ TOÀN GAME cho cổng SUPER - thay CreativeMenu (client mod đã bị
// bAllowClientMod=false chặn). Data gameitems.json build từ registry save-editor +
// icon paldb (2.299 món, tên + mô tả tiếng Việt). KHÔNG dính tiền - chỉ SUPER admin
// giao tay cho đền bù/sự kiện; mọi lượt giao đều ghi log ADMIN.
let GAME_ITEMS = null;
function gameItems() {
    if (!GAME_ITEMS) {
        try { GAME_ITEMS = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'gameitems.json'), 'utf8')); }
        catch (e) { GAME_ITEMS = []; writeLog('SYSTEM', `[KHO ĐỒ] Không đọc được gameitems.json: ${e.message}`); }
    }
    return GAME_ITEMS;
}
// Danh sách nhân vật đã liên kết (để panel làm dropdown người nhận)
function giveTargets() {
    const out = [];
    for (const [k, v] of Object.entries(dbCache)) {
        if (k.startsWith('_') || !/^\d{15,20}$/.test(k) || !v || typeof v !== 'object') continue;
        const g = (v.ingameName || '').trim();
        if (g) out.push({ name: v.name || k, ingame: g });
    }
    return out;
}
async function adminGiveItem(gameName, itemId, qty) {
    gameName = String(gameName || '').trim();
    itemId = String(itemId || '').trim().replace(/[^A-Za-z0-9_]/g, '');
    qty = Math.floor(Number(qty) || 0);
    if (!gameName) return { error: 'Chọn/nhập tên nhân vật nhận' };
    if (!itemId) return { error: 'Thiếu item id' };
    if (qty < 1 || qty > 999) return { error: 'Số lượng 1-999' };
    const it = gameItems().find(x => x.id === itemId);
    if (!it) return { error: `Không thấy '${itemId}' trong kho dữ liệu` };
    if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi bấm lại' };
    deliverLock();
    const on = await requireOnline(gameName);
    if (on.unknown) { deliverUnlock(); return { error: `Không kiểm tra được online (${on.msg || 'timeout'}) - thử lại sau` }; }
    if (!on.online) { deliverUnlock(); return { error: `Nhân vật ${gameName} chưa online trong game` }; }
    let r = null, err = null;
    try { r = await pal.giveItem(gameName, itemId, qty); } catch (e) { err = e; }
    deliverUnlock();
    if (r && r.ok) {
        writeLog('ADMIN', `[KHO ĐỒ] SUPER giao ${it.n} x${qty} (${itemId}) -> ${gameName}`);
        return { ok: true, message: `✅ Đã giao ${qty} × ${it.n} vào túi ${gameName}` };
    }
    const msg = (r && r.message) || (err && err.message) || 'không nhận được phản hồi';
    writeLog('ADMIN', `[KHO ĐỒ LỖI] giao ${itemId} x${qty} -> ${gameName} | ${msg}`);
    return { error: `Giao hụt: ${msg}` };
}

// 📅 10/09: GIỚI HẠN MUA mỗi món / mỗi người / ngày (giờ VN, reset 00:00). Admin đặt 1 số chung
// ở panel (dbCache._itemShopDayMax, mặc định 99, 0 = không giới hạn) - áp cho TẤT CẢ món vì có
// món 2 Dogcoin (thịt/nguyên liệu) mà không chặn thì 1 người vét cả kho. Đếm ở user.shopDay
// { day: 'YYYY-MM-DD', bought: { itemId: n } }; đổi ngày là đếm lại từ 0.
const ITEM_SHOP_DAYMAX_DEF = 99;
function itemShopDayMax() {
    const v = Number(dbCache._itemShopDayMax);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : ITEM_SHOP_DAYMAX_DEF;
}
function setItemShopDayMax(v) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v) || v < 0 || v > 100000) return { error: 'Giới hạn/ngày phải là số 0–100000 (0 = không giới hạn)' };
    dbCache._itemShopDayMax = v;
    saveDbNow();
    return { ok: true, dayMax: v };
}
// 10/09 (chiều): CHẾ ĐỘ đếm - 'server' = gộp CẢ SERVER (mặc định, chủ server: "toàn server được mua thay
// vì cá nhân") / 'user' = mỗi người riêng. Bộ đếm server ở dbCache._itemShopDay, mỗi người ở user.shopDay.
function itemShopDayMode() { return dbCache._itemShopDayMode === 'user' ? 'user' : 'server'; }
function setItemShopDayMode(m) {
    if (m !== 'user' && m !== 'server') return { error: "Chế độ phải là 'user' (mỗi người) hoặc 'server' (toàn server)" };
    dbCache._itemShopDayMode = m;
    saveDbNow();
    return { ok: true, dayMode: m };
}
// 🧬 10/09: hạn RIÊNG cho nhóm implant - MỖI NGƯỜI tối đa N cái/ngày, MỌI LOẠI GỘP (mặc định 2, 0 = không),
// luôn đếm theo người bất kể chế độ server/user ở trên. Bộ đếm user.implantDay { day, n }.
const ITEM_SHOP_IMPLANT_MAX_DEF = 2;
function itemShopImplantMax() {
    const v = Number(dbCache._itemShopImplantMax);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : ITEM_SHOP_IMPLANT_MAX_DEF;
}
function setItemShopImplantMax(v) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v) || v < 0 || v > 1000) return { error: 'Hạn implant/ngày phải là số 0–1000 (0 = không giới hạn)' };
    dbCache._itemShopImplantMax = v;
    saveDbNow();
    return { ok: true, implantMax: v };
}
// 🌳 implant CÂY THẾ GIỚI (PalPassiveSkillChange_Consumable_WorldTree_*): hạn riêng nữa - mặc định 1/người/ngày
const ITEM_SHOP_WT_MAX_DEF = 1;
function isWtImplant(id) { return /^PalPassiveSkillChange_Consumable_WorldTree_/.test(String(id)); }
function itemShopWtMax() {
    const v = Number(dbCache._itemShopWtMax);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : ITEM_SHOP_WT_MAX_DEF;
}
function setItemShopWtMax(v) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v) || v < 0 || v > 1000) return { error: 'Hạn implant Cây Thế Giới/ngày phải là số 0–1000 (0 = không giới hạn)' };
    dbCache._itemShopWtMax = v;
    saveDbNow();
    return { ok: true, wtMax: v };
}
function wtToday(user) {
    const d = vnDayISO(Date.now());
    if (!user.wtDay || user.wtDay.day !== d) user.wtDay = { day: d, n: 0 };
    return user.wtDay;
}
// thứ tự cho web: trong nhóm implant -> Chuyển Đổi, rồi Cây Thế Giới, rồi implant thường; nhóm khác giữ nguyên
// 💎 10/09: HẠNG implant theo passive (passives.json: tier 4 = kim cương/xanh ngọc, 3 = vàng, 1-2 = thường; Cây Thế Giới
// riêng 'wt'). Chủ server: "cái nào kim cương xếp kim cương, cái nào vàng xếp vàng" -> web tô màu card + xếp thứ tự.
function implantTier(id) {
    id = String(id || '');
    if (id === 'PalGenderReverse') return 'gender';
    if (isWtImplant(id)) return 'wt';
    const pid = id.replace(/^PalPassiveSkillChange_(Consumable_)?/, '');
    const pv = passiveCatalog().find(p => p && p.id === pid) || (Array.isArray(PASSIVE_DATA.builds) ? PASSIVE_DATA.builds : []).find(p => p && p.id === pid);
    const t = pv ? Number(pv.tier) : 0;
    return t >= 4 ? 'diamond' : (t === 3 ? 'gold' : 'normal');
}
const IMPLANT_TIER_RANK = { gender: 0, wt: 0.2, diamond: 0.4, gold: 0.6, normal: 0.8 };
function itemShopWebList() {
    const rank = (x) => x.cat !== 'implant' ? 1 : IMPLANT_TIER_RANK[implantTier(x.id)];
    // trong CÙNG bậc implant: giá cao xếp trước (chủ server 10/09: "12000 xếp trước 8000"); nhóm khác giữ thứ tự admin
    const priceKey = (x) => x.cat === 'implant' ? -(Number(x.price) || 0) : 0;
    return itemShopList().filter(x => !x.off).map((x, i) => [x, i]).sort((a, b) => (rank(a[0]) - rank(b[0])) || (priceKey(a[0]) - priceKey(b[0])) || (a[1] - b[1]))
        .map(a => a[0].cat === 'implant' ? { ...a[0], tier: implantTier(a[0].id) } : (a[0].cat === 'important' ? { ...a[0], tier: importantTier(a[0].id) } : a[0]));   // web tô màu theo tier
}
// ⭐ 11/09: nhóm QUAN TRỌNG - mỗi người mua ĐÚNG 1 lần, vĩnh viễn. user.shopOnce = { itemId: timestamp }.
function shopOnceBought(user, id) { return !!(user.shopOnce && user.shopOnce[id]); }
function shopOnceMark(user, id, on) { if (!user.shopOnce || typeof user.shopOnce !== 'object') user.shopOnce = {}; if (on) user.shopOnce[id] = Date.now(); else delete user.shopOnce[id]; }
// màu card web cho nhóm ⭐: theo độ hiếm item trong gameitems (r 3 = tím, r ≥ 4 = vàng)
function importantTier(id) { const gi = (typeof gameItems === 'function' ? gameItems() : []).find(x => x && x.id === id); const r = gi ? Number(gi.r) : 0; return r >= 4 ? 'gold' : (r === 3 ? 'purple' : 'normal'); }
function implantToday(user) {
    const d = vnDayISO(Date.now());
    if (!user.implantDay || user.implantDay.day !== d) user.implantDay = { day: d, n: 0 };
    return user.implantDay;
}
function itemShopToday(user) {
    const d = vnDayISO(Date.now());
    if (itemShopDayMode() === 'server') {
        if (!dbCache._itemShopDay || dbCache._itemShopDay.day !== d) dbCache._itemShopDay = { day: d, bought: {} };
        return dbCache._itemShopDay.bought;
    }
    if (!user.shopDay || user.shopDay.day !== d) user.shopDay = { day: d, bought: {} };
    return user.shopDay.bought;
}
async function itemShopBuy(userId, itemId, qty, username) {
    if (debtOf(getUserData(userId)).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới mua item được' };
    const it = itemShopList().find(x => x.id === String(itemId));
    if (!it || it.off) return { error: 'Không thấy món này trong shop' };   // 09/09: món đang tắt bán coi như không có
    qty = Math.floor(Number(qty) || 0);
    if (qty < 1 || qty > it.max) return { error: `Số lượng phải trong 1–${it.max}` };
    const cost = it.price * qty;
    const user = getUserData(userId);
    // 📅 giới hạn/ngày (kiểm TRƯỚC khi trừ tiền / mở SFTP)
    // 🧬 implant: hạn riêng theo người, mọi loại gộp
    // ⭐ QUAN TRỌNG: mỗi người 1 lần, số lượng luôn 1, miễn hạn ngày chung
    const isOnce = it.cat === 'important';
    if (isOnce) {
        if (shopOnceBought(user, it.id)) return { error: `⭐ ${it.name}: mỗi người chỉ mua được 1 LẦN - bạn đã mua rồi` };
        if (qty !== 1) return { error: `⭐ ${it.name} mỗi người chỉ mua 1 cái duy nhất - đặt số lượng 1` };
    }
    const isImplantCat = it.cat === 'implant';
    const isWt = isImplantCat && isWtImplant(it.id);
    const isImplant = isImplantCat && !isWt;
    const impMax = isImplant ? itemShopImplantMax() : 0;
    const imp = isImplant ? implantToday(user) : null;
    if (isImplant && impMax > 0 && imp.n + qty > impMax) {
        const left = Math.max(0, impMax - imp.n);
        return { error: left ? `🧬 Implant mỗi người chỉ mua tối đa ${impMax} cái/ngày (mọi loại gộp) - hôm nay bạn còn ${left}` : `🧬 Hôm nay bạn đã mua đủ ${impMax} implant - mai 00:00 mua tiếp` };
    }
    // 🌳 Cây Thế Giới: hạn riêng nữa (mặc định 1/người/ngày), không ăn vào quota implant thường
    const wtMax = isWt ? itemShopWtMax() : 0;
    const wt = isWt ? wtToday(user) : null;
    if (isWt && wtMax > 0 && wt.n + qty > wtMax) {
        const left = Math.max(0, wtMax - wt.n);
        return { error: left ? `🌳 Implant Cây Thế Giới mỗi người chỉ mua tối đa ${wtMax} cái/ngày - hôm nay bạn còn ${left}` : `🌳 Hôm nay bạn đã mua đủ ${wtMax} implant Cây Thế Giới - mai 00:00 mua tiếp` };
    }
    const dayMax = itemShopDayMax();
    const today = itemShopToday(user);
    // nhóm implant MIỄN hạn chung 📅 (đã có hạn riêng theo người) - chủ server 10/09
    if (!isImplantCat && !isOnce && dayMax > 0 && (today[it.id] || 0) + qty > dayMax) {
        const left = Math.max(0, dayMax - (today[it.id] || 0));
        const srv = itemShopDayMode() === 'server';
        return { error: left
            ? (srv ? `📅 Cả server chỉ mua tối đa ${dayMax} ${it.name}/ngày - hôm nay còn ${left} (ai nhanh thì được)` : `📅 Mỗi người chỉ mua tối đa ${dayMax} ${it.name}/ngày - hôm nay bạn còn mua được ${left}`)
            : (srv ? `📅 Hôm nay cả server đã mua hết ${dayMax} ${it.name} - mai 00:00 mở lại` : `📅 Hôm nay bạn đã mua đủ ${dayMax} ${it.name} - mai quay lại (reset 00:00)`) };
    }
    if ((user.points || 0) < cost) return { error: `Cần ${cost.toLocaleString()} Dogcoin (bạn có ${(user.points || 0).toLocaleString()})` };
    const gameName = (user.ingameName || '').trim();
    if (!gameName) return { error: 'Chưa liên kết tên nhân vật trong game - nhắn admin liên kết trước đã' };
    // 🚦 đang giao đơn khác (pal/item) -> chặn (khỏi mở nhiều phiên SFTP cùng lúc)
    if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi mua nhé (chưa trừ đồng nào)' };
    deliverLock();
    const on = await requireOnline(gameName);
    if (on.unknown) { deliverUnlock(); return { error: `Không kiểm tra được trạng thái online (${on.msg || 'timeout'}) - thử lại sau (chưa trừ đồng nào)` }; }
    if (!on.online) { deliverUnlock(); return { error: `Nhân vật ${gameName} chưa online trong game - vào game rồi mua nhé (chưa trừ đồng nào)` }; }

    updatePoints(userId, -cost);   // trừ TRƯỚC (giữ chỗ)
    today[it.id] = (today[it.id] || 0) + qty;   // 📅 tính vào hạn ngày ngay lúc trừ tiền
    if (imp) imp.n += qty;                       // 🧬 hạn implant/người
    if (wt) wt.n += qty;                         // 🌳 hạn Cây Thế Giới/người
    if (isOnce) shopOnceMark(user, it.id, true);  // ⭐ đánh dấu đã mua (vĩnh viễn)
    logDog('shop', userId, username || userId, -cost, `mua item ${it.name} x${qty} (${it.id}) -> ${gameName}`);
    saveDbNow();
    let r = null, err = null;
    try { r = await pal.giveItem(gameName, it.id, qty); } catch (e) { err = e; }
    deliverUnlock();   // 🚦 SFTP xong -> mở khoá
    if (r && r.ok) {
        writeLog('ADMIN', `[SHOP ITEM] ${username || userId} mua ${it.name} x${qty} (${it.id}) -> ${gameName} (-${cost})`);
        return { ok: true, message: `✅ Đã giao ${qty.toLocaleString()} ${it.name} vào túi ${gameName} trong game!`, balance: getUserData(userId).points || 0 };
    }
    const msg = (r && r.message) || (err && err.message) || 'không nhận được phản hồi';
    // CHẮC CHẮN chưa giao (dashboard chết / mod báo không thấy người) -> hoàn ngay
    if (/lỗi 404|lỗi 401|fetch failed|ECONNREFUSED|aborted|player not found/i.test(msg)) {
        updatePoints(userId, cost);
        today[it.id] = Math.max(0, (today[it.id] || 0) - qty);   // 📅 chưa giao -> trả lại hạn ngày
        if (imp) imp.n = Math.max(0, imp.n - qty);
        if (wt) wt.n = Math.max(0, wt.n - qty);
        if (isOnce) shopOnceMark(user, it.id, false);   // ⭐ chưa giao -> cho mua lại
        logDog('refund', userId, username || userId, cost, `hoàn mua item ${it.name} x${qty} (chưa giao: ${msg})`);
        saveDbNow();
        return { error: `↩️ Chưa giao được (${/player not found/i.test(msg) ? 'chưa online/sai tên' : 'hệ thống bảo trì'}) - đã hoàn ${cost.toLocaleString()} Dogcoin` };
    }
    // mơ hồ (timeout) -> KHÔNG hoàn, báo admin kiểm (chống double-give)
    writeLog('ADMIN', `[SHOP ITEM LỖI] ${username || userId} mua ${it.name} x${qty} (${it.id}) -> ${gameName} | ${msg} - kiểm results.log, chưa nhận thì hoàn tay`);
    return { error: `⏳ Chưa xác nhận được với game - ví đã trừ, admin sẽ kiểm (không nhận được sẽ hoàn). Đừng mua lại kẻo trùng.`, balance: getUserData(userId).points || 0 };
}

// ===== 🚀 PHI THUYỀN (crash game kiểu Spaceman, 28/08) - thuần web =====
// Vòng chơi CHUNG: chờ cược -> bay (hệ số nhân tăng dần) -> nổ -> lặp. Server chốt điểm nổ
// KÍN lúc cất cánh; client tự vẽ số nhân theo thời gian (đồng bộ đồng hồ server gửi kèm);
// bấm RÚT thì server tính hệ số TẠI thời điểm đó (chống gian lận, không tin client). Trần:
// cược mỗi người (admin đặt) + hệ số tối đa 2000x (bay hết ăn x2000). Nhà cái ép điểm nổ
// ở panel SUPER (giống ép Tài Xỉu). Tiền: trừ lúc cược, cộng lúc rút, nổ = mất (đã trừ).
const SPM_TICK_MS = 250;
const SPM_MAX_MULT = 5000;   // trần CỨNG tuyệt đối (cfg.maxMult không vượt quá)
// growth 0.14: x1->x2 ~5s, x2->x3 ~2.9s, x50->x55 ~0.7s (chậm đầu, càng cao càng nhanh - kiểu Spaceman)
const SPM_CFG_DEF = { betS: 8, crashRevealS: 4, growth: 0.14, houseEdge: 0.06, minBet: 400, maxBet: 15000, maxMult: 200, open: true };
function spmCfg() {
    const c = dbCache._spmCfg || {};
    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    return {
        betS: Math.floor(num(c.betS, SPM_CFG_DEF.betS, 3, 60)),                    // cửa cược (giây)
        crashRevealS: Math.floor(num(c.crashRevealS, SPM_CFG_DEF.crashRevealS, 1, 15)), // hiện kết quả nổ (giây)
        growth: num(c.growth, SPM_CFG_DEF.growth, 0.02, 1),                        // tốc độ bay (số nhân = e^(growth·giây))
        houseEdge: num(c.houseEdge, SPM_CFG_DEF.houseEdge, 0, 0.2),                // % lợi nhà cái (xác suất nổ sớm)
        minBet: Math.floor(num(c.minBet, SPM_CFG_DEF.minBet, 1, 1000000000)),
        maxBet: Math.floor(num(c.maxBet, SPM_CFG_DEF.maxBet, 1, 1000000000)),      // TRẦN cược mỗi người (khoá rủi ro nhà cái)
        maxMult: num(c.maxMult, SPM_CFG_DEF.maxMult, 2, SPM_MAX_MULT),             // hệ số TỐI ĐA (bay hết ăn x này)
        open: c.open === undefined ? true : !!c.open,
    };
}
function setSpmCfg(o) { dbCache._spmCfg = { ...spmCfg(), ...o }; saveDbNow(); return spmCfg(); }
// điểm nổ ngẫu nhiên: house edge baked in (r nhỏ -> nổ ~1.00x), đuôi nặng, kẹp trần 2000x
function spmDrawCrash(cfg) {
    const r = Math.random();
    const m = (1 - cfg.houseEdge) / (1 - r);
    return Math.min(cfg.maxMult, Math.max(1.00, Math.floor(m * 100) / 100));
}
function spmMultAt(elapsedMs, cfg) { return Math.exp(cfg.growth * elapsedMs / 1000); }

let spmState = { phase: 'bet', roundId: 0, betEndAt: 0, flightStart: 0, crashAt: 0, crashEndAt: 0, crashPoint: 0, maxWin: false, won: false, forced: null, bets: {}, nextBets: {}, history: [], betHistory: [] };

function spmResetRound() {
    const cfg = spmCfg();
    spmState.phase = 'bet';
    spmState.roundId = (spmState.roundId || 0) + 1;
    spmState.betEndAt = Date.now() + cfg.betS * 1000;
    spmState.flightStart = 0; spmState.crashAt = 0; spmState.crashEndAt = 0; spmState.crashPoint = 0;
    spmState.maxWin = false; spmState.won = false;
    spmState.bets = {};
    // áp các cược đã ĐẶT TRƯỚC (tiền đã trừ) vào chuyến mới này
    const nb = spmState.nextBets || {}; spmState.nextBets = {};
    for (const [uid, b] of Object.entries(nb)) {
        spmState.bets[uid] = { amount: b.amount, name: b.name, auto: b.auto || null, cashed: null, win: 0, at: Date.now() };
        dbCache._spmBets = dbCache._spmBets || {};
        dbCache._spmBets[uid] = { amount: b.amount, roundId: spmState.roundId };
    }
    if (Object.keys(nb).length) saveDbNow();
}
function spmStartFlight() {
    const cfg = spmCfg();
    spmState.phase = 'fly';
    spmState.flightStart = Date.now();
    const cp = Number.isFinite(spmState.forced) ? Math.min(cfg.maxMult, Math.max(1.00, spmState.forced)) : spmDrawCrash(cfg);
    spmState.forced = null;
    spmState.crashPoint = cp;
    // 05/09: bốc trúng TRẦN maxMult = chuyến THẮNG TUYỆT ĐỐI (bay tới đỉnh, không nổ)
    spmState.maxWin = cp >= cfg.maxMult - 1e-9;
    const T = Math.log(cp) / cfg.growth;   // số giây bay tới điểm nổ
    spmState.crashAt = spmState.flightStart + Math.max(0, T) * 1000;
    writeLog('ADMIN', `[PHI THUYỀN] Chuyến #${spmState.roundId} cất cánh - điểm nổ ${cp}x (kín)${spmState.maxWin ? ' — TRÚNG TRẦN, chuyến THẮNG TUYỆT ĐỐI' : ''} · ${Object.keys(spmState.bets).length} người cược`);
}
function spmCashoutInternal(uid, m) {
    const b = spmState.bets[uid];
    if (!b || b.cashed) return null;
    const win = Math.floor(b.amount * m);
    b.cashed = m; b.win = win;
    updatePoints(uid, win);
    if (dbCache._spmBets) delete dbCache._spmBets[uid];
    logDog('bet', uid, b.name || uid, win - b.amount, `Phi Thuyền #${spmState.roundId} rút ${m}x (cược ${b.amount} → +${win})`);
    return { m, win };
}
// 05/09: bay chạm TRẦN — tự rút cho MỌI người còn trên tàu ở đúng trần rồi mới
// settle; không ai thua, client nhìn cờ won để bung hiệu ứng chiến thắng thay vì nổ.
function spmWin() {
    const cp = spmState.crashPoint;
    let n = 0;
    for (const uid of Object.keys(spmState.bets)) {
        if (!spmState.bets[uid].cashed) { spmCashoutInternal(uid, cp); n++; }
    }
    spmState.won = true;
    writeLog('ADMIN', `[PHI THUYỀN] Chuyến #${spmState.roundId} 🏆 BAY TỚI ĐỈNH ${cp}x - tự rút cho ${n} người còn trên tàu`);
    spmCrash();   // settle + lịch sử như thường, nhưng ai cũng đã rút nên không ai thua
}
function spmCrash() {
    const cfg = spmCfg();
    spmState.phase = 'crash';
    spmState.crashEndAt = Date.now() + cfg.crashRevealS * 1000;
    // 📜 lịch sử từng lượt cược (thắng/thua) - thắng lên trước, ghi log đơn thua
    const rows = Object.entries(spmState.bets).map(([uid, b]) => ({
        name: b.name, amount: b.amount, cashed: b.cashed || null, win: b.win || 0,
        crash: spmState.crashPoint, bal: (getUserData(uid).points || 0),
    })).sort((a, b) => (b.cashed ? 1 : 0) - (a.cashed ? 1 : 0) || b.amount - a.amount);
    for (const [uid, b] of Object.entries(spmState.bets)) {
        if (!b.cashed) logDog('bet', uid, b.name || uid, -b.amount, `Phi Thuyền #${spmState.roundId} NỔ ${spmState.crashPoint}x - thua ${b.amount}`);
    }
    for (const r of rows) spmState.betHistory.unshift(r);
    if (spmState.betHistory.length > 100) spmState.betHistory.length = 100;
    spmState.history.unshift({ id: spmState.roundId, crash: spmState.crashPoint, win: !!spmState.won, time: new Date().toLocaleString('vi-VN') });
    if (spmState.history.length > 50) spmState.history.length = 50;
    // đã settle chuyến này - nhưng GIỮ lại đơn đặt trước (chưa vào chuyến) để restart còn hoàn
    const keep = {};
    for (const [uid, b] of Object.entries(spmState.nextBets || {})) keep[uid] = { amount: b.amount, roundId: spmState.roundId + 1, queued: true };
    dbCache._spmBets = keep;
    saveDbNow();
    spmBoard.needsUpdate = true;   // bảng Discord đăng lại kết quả chuyến (tối đa 1 phút/lần)
    if (!spmState.won) writeLog('ADMIN', `[PHI THUYỀN] Chuyến #${spmState.roundId} NỔ ${spmState.crashPoint}x`);
}
function spmTick() {
    const now = Date.now();
    const cfg = spmCfg();
    if (spmState.phase === 'bet') {
        if (now >= spmState.betEndAt) spmStartFlight();
    } else if (spmState.phase === 'fly') {
        const m = spmMultAt(now - spmState.flightStart, cfg);
        for (const [uid, b] of Object.entries(spmState.bets)) {
            if (!b.cashed && b.auto && m >= b.auto && now < spmState.crashAt) spmCashoutInternal(uid, b.auto);
        }
        if (now >= spmState.crashAt) { if (spmState.maxWin) spmWin(); else spmCrash(); }
    } else if (spmState.phase === 'crash') {
        if (now >= (spmState.crashEndAt || 0)) spmResetRound();
    }
}
function spmBet(uid, username, amount, auto) {
    const cfg = spmCfg();
    if (!cfg.open) return { error: 'Phi Thuyền đang đóng bảo trì' };
    if (debtOf(getUserData(uid)).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới chơi được' };
    if (spmState.phase !== 'bet') return spmQueueBet(uid, username, amount, auto);   // đang bay/nổ -> đặt cho chuyến sau
    if (spmState.bets[uid]) return { error: 'Bạn đã cược chuyến này rồi' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < cfg.minBet) return { error: `Cược tối thiểu ${cfg.minBet.toLocaleString()} Dogcoin` };
    if (amount > cfg.maxBet) return { error: `Cược tối đa ${cfg.maxBet.toLocaleString()} Dogcoin/chuyến` };
    const u = getUserData(uid);
    if ((u.points || 0) < amount) return { error: `Không đủ Dogcoin (bạn có ${(u.points || 0).toLocaleString()})` };
    let autoM = Number(auto);
    autoM = Number.isFinite(autoM) && autoM >= 1.01 ? Math.floor(autoM * 100) / 100 : null;
    updatePoints(uid, -amount);
    spmState.bets[uid] = { amount, name: u.name || uid, auto: autoM, cashed: null, win: 0, at: Date.now() };
    dbCache._spmBets = dbCache._spmBets || {};
    dbCache._spmBets[uid] = { amount, roundId: spmState.roundId };
    logDog('bet', uid, username || uid, -amount, `Phi Thuyền #${spmState.roundId} cược ${amount}${autoM ? ` (auto rút ${autoM}x)` : ''}`);
    saveDbNow();
    return { ok: true, balance: getUserData(uid).points || 0 };
}
// đặt cược cho CHUYẾN SAU (khi đang bay/nổ) - trừ tiền ngay, áp vào lúc mở chuyến mới
function spmQueueBet(uid, username, amount, auto) {
    const cfg = spmCfg();
    if (!cfg.open) return { error: 'Phi Thuyền đang đóng bảo trì' };
    if (debtOf(getUserData(uid)).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới chơi được' };
    if (spmState.nextBets[uid]) return { error: 'Bạn đã đặt cược cho chuyến sau rồi' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < cfg.minBet) return { error: `Cược tối thiểu ${cfg.minBet.toLocaleString()} Dogcoin` };
    if (amount > cfg.maxBet) return { error: `Cược tối đa ${cfg.maxBet.toLocaleString()} Dogcoin/chuyến` };
    const u = getUserData(uid);
    if ((u.points || 0) < amount) return { error: `Không đủ Dogcoin (bạn có ${(u.points || 0).toLocaleString()})` };
    let autoM = Number(auto);
    autoM = Number.isFinite(autoM) && autoM >= 1.01 ? Math.floor(autoM * 100) / 100 : null;
    updatePoints(uid, -amount);
    spmState.nextBets[uid] = { amount, name: u.name || uid, auto: autoM };
    dbCache._spmBets = dbCache._spmBets || {};
    dbCache._spmBets[uid] = { amount, roundId: spmState.roundId + 1, queued: true };
    logDog('bet', uid, username || uid, -amount, `Phi Thuyền đặt trước chuyến sau - cược ${amount}${autoM ? ` (auto rút ${autoM}x)` : ''}`);
    saveDbNow();
    return { ok: true, queued: true, balance: getUserData(uid).points || 0 };
}
// huỷ đặt cược trước -> hoàn tiền (chỉ khi chưa vào chuyến)
function spmCancelNext(uid) {
    const b = spmState.nextBets[uid];
    if (!b) return { error: 'Bạn chưa đặt cược trước' };
    updatePoints(uid, b.amount);
    delete spmState.nextBets[uid];
    if (dbCache._spmBets) delete dbCache._spmBets[uid];
    logDog('refund', uid, b.name || uid, b.amount, `Huỷ đặt cược trước Phi Thuyền - hoàn ${b.amount}`);
    saveDbNow();
    return { ok: true, balance: getUserData(uid).points || 0 };
}
function spmCashout(uid) {
    if (spmState.phase !== 'fly') return { error: 'Chưa bay hoặc đã nổ rồi' };
    const now = Date.now();
    if (now >= spmState.crashAt) return { error: 'Nổ mất rồi!' };
    const m = Math.floor(spmMultAt(now - spmState.flightStart, spmCfg()) * 100) / 100;
    const r = spmCashoutInternal(uid, m);
    if (!r) return { error: 'Bạn không có cược đang bay' };
    saveDbNow();
    return { ok: true, m: r.m, win: r.win, balance: getUserData(uid).points || 0 };
}
// state cho web: KHÔNG lộ crashPoint khi đang bay (chống xem trộm). now = đồng hồ server.
function spmWebState(uid) {
    const cfg = spmCfg();
    const me = spmState.bets[uid] || null;
    const players = Object.entries(spmState.bets)
        .map(([, b]) => ({ name: b.name, amount: b.amount, cashed: b.cashed, win: b.win }))
        .sort((a, b) => b.amount - a.amount).slice(0, 40);
    return {
        phase: spmState.phase, roundId: spmState.roundId, now: Date.now(),
        betEndAt: spmState.betEndAt, flightStart: spmState.flightStart,
        growth: cfg.growth, minBet: cfg.minBet, maxBet: cfg.maxBet, open: cfg.open, maxMult: cfg.maxMult,
        crashPoint: spmState.phase === 'crash' ? spmState.crashPoint : null,   // chỉ lộ khi đã nổ
        won: spmState.phase === 'crash' ? !!spmState.won : false,              // 05/09: chuyến chạm trần = thắng tuyệt đối
        me: me ? { amount: me.amount, auto: me.auto, cashed: me.cashed, win: me.win } : null,
        myNext: spmState.nextBets[uid] ? { amount: spmState.nextBets[uid].amount, auto: spmState.nextBets[uid].auto } : null,
        // 04/09: AI đang đặt trước chuyến sau - web hiện danh sách "Hân đặt 5.000 cho chuyến sau"
        nextPlayers: Object.values(spmState.nextBets)
            .map(b => ({ name: b.name, amount: b.amount }))
            .sort((a, b) => b.amount - a.amount).slice(0, 20),
        players, history: spmState.history.slice(0, 20),
        betHistory: spmState.betHistory.slice(0, 20),
        balance: getUserData(uid).points || 0,
    };
}
function runSpmLoop() {
    // refund đơn treo từ trước khi restart (đã trừ mà chưa settle -> hoàn cho công bằng)
    if (dbCache._spmBets && Object.keys(dbCache._spmBets).length) {
        for (const [uid, b] of Object.entries(dbCache._spmBets)) {
            updatePoints(uid, b.amount);
            logDog('refund', uid, (getUserData(uid).name) || uid, b.amount, `hoàn cược Phi Thuyền (bot restart giữa vòng)`);
        }
        dbCache._spmBets = {}; saveDbNow();
    }
    spmResetRound();
    setInterval(spmTick, SPM_TICK_MS);
}

// ===== BẢNG PHI THUYỀN TRÊN DISCORD =====
// Giống bảng Dò Mìn: chỗ mời chơi + khoe kết quả gần đây (thắng/thua từng người),
// KHÔNG có nút cược. Có chuyến nổ thì đăng lại (tối đa 1 phút/lần - xem repostBoard).
const spmBoard = { channel: null, message: null, needsUpdate: false, lastEdit: 0 };

// 💰 thắng x… được … · 💥 NỔ x… thua hết … · số dư … (PHÁ SẢN nếu hết)
function spmHistoryLine(h, i) {
    const bal = typeof h.bal === 'number'
        ? ` · số dư ${h.bal.toLocaleString()} ${DOGCOIN_EMOJI}` + (h.bal <= 0 ? ` **PHÁ SẢN** ${BANKRUPT_EMOJI[i % BANKRUPT_EMOJI.length]}` : '')
        : '';
    if (h.cashed) {
        return `💰 **${h.name}** · cược ${h.amount.toLocaleString()} · thắng **x${h.cashed.toFixed(2)}** được **${(h.win || 0).toLocaleString()}** ${DOGCOIN_EMOJI}${bal}`;
    }
    return `💥 **${h.name}** · cược ${h.amount.toLocaleString()} · NỔ **x${(h.crash || 1).toFixed(2)}** thua hết **${h.amount.toLocaleString()}** ${DOGCOIN_EMOJI}${bal}`;
}

function getSpmBoardData() {
    const cfg = spmCfg();
    const recent = spmState.betHistory.slice(0, BOARD_HISTORY_N);
    let desc =
        `Một chiếc **phi thuyền 🚀** cất cánh mỗi chuyến, hệ số nhân tăng dần - **rút kịp trước khi NỔ** là ăn.\n` +
        `Đặt cược trong cửa **${cfg.betS}s** (đang bay vẫn đặt được cho chuyến sau), đang bay bấm **RÚT** để chốt tiền; để trễ là mất cược.\n` +
        `🎯 Bay càng cao ăn càng đậm (tối đa **x${cfg.maxMult}**) nhưng có thể nổ bất cứ lúc nào. Cả nhà chung một chuyến.\n\n`;
    if (recent.length) desc += `**🚀 ${recent.length} lượt gần đây:**\n` + recent.map(spmHistoryLine).join('\n');
    else desc += `*Chưa có ai bay. Mở hàng đi!*`;

    const embed = new EmbedBuilder()
        .setTitle('🚀 PHI THUYỀN - chơi trên web')
        .setColor(0x22d3ee)
        .setDescription(desc)
        .setFooter({ text: 'Bấm nút bên dưới để lấy link + mã PIN' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('web_pin').setLabel('🌐 Chơi Phi Thuyền trên web').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row] };
}

async function startSpmBoard(channel) {
    if (spmBoard.message) await spmBoard.message.delete().catch(() => { });
    spmBoard.channel = channel;
    spmBoard.message = await channel.send(getSpmBoardData());
    spmBoard.needsUpdate = false;
    spmBoard.lastEdit = Date.now();
    dbCache._spmChannelId = channel.id;
    dbCache._spmMsgId = spmBoard.message.id;
    saveDbNow();
}
function stopSpmBoard() {
    if (spmBoard.message) spmBoard.message.delete().catch(() => { });
    spmBoard.channel = null;
    spmBoard.message = null;
    dbCache._spmChannelId = null;
    dbCache._spmMsgId = null;
    saveDbNow();
}
async function resumeSpmBoard() {
    const chId = dbCache._spmChannelId;
    if (!chId) return;
    const ch = await client.channels.fetch(chId);
    const old = dbCache._spmMsgId ? await ch.messages.fetch(dbCache._spmMsgId).catch(() => null) : null;
    if (old) {
        spmBoard.channel = ch;
        spmBoard.message = old;
        spmBoard.lastEdit = Date.now();
        await old.edit(getSpmBoardData()).catch(() => { });
        writeLog('SYSTEM', `[BẢNG PHI THUYỀN] Nối lại bảng cũ ở #${ch.name}`);
        return;
    }
    await startSpmBoard(ch);
    writeLog('SYSTEM', `[BẢNG PHI THUYỀN] Bảng cũ mất, đã đăng bảng mới ở #${ch.name}`);
}
function runSpmBoardLoop() {
    setInterval(() => { repostBoard(spmBoard, getSpmBoardData, '_spmMsgId', 'BẢNG PHI THUYỀN', 'PHI THUYỀN').catch(() => { }); }, 5000);
}

function setPalWheelCfg(o) {
    dbCache._palWheelCfg = { ...palWheelCfg(), ...o };
    saveDbNow();
    return palWheelCfg();
}
// 10/09: 6 pal huyền thoại TRỞ LẠI vòng quay kể cả ở chế độ PAL GỐC (chủ server đổi ý:
// pal gốc Lv1 · 0 sao · không chỉ số thì huyền thoại cũng không còn quá mạnh).
// Bản ẩn cũ (PALWHEEL_RAW_EXCLUDE_CODE) nằm ở git history commit 09/09 nếu cần dựng lại.
// Danh sách giờ chỉ còn dùng để TÔ VÀNG cho đẹp trên web (cờ legend trong state).
const PALWHEEL_LEGEND_CODE = ['SaintCentaur', 'BlackCentaur', 'IceHorse', 'IceHorse_Dark', 'JetDragon', 'PoseidonOrca'];   // Paladius · Necromus · Frostallion · Frostallion Noct · Jetragon · Neptilius
const palIsLegend = (code) => PALWHEEL_LEGEND_CODE.includes(code);
function palWheelNormalPool() {
    const raid = new Set(PAL_DATA.raidOnly || []);
    return (PAL_DATA.all || []).filter(p => !raid.has(p.name) && !PALWHEEL_EXCLUDE_DEX.includes(p.dex || 0) && !PALWHEEL_EXCLUDE_CODE.includes(p.code));
}
function palWheelRaidPool() {
    // 11/09: PAL GỐC vẫn CÓ ô RAID trên vòng quay random (chủ server: "thêm lại pal raid, chỉ cho quay random").
    // Mua raid ĐÍCH DANH + vòng RAID MAY MẮN vẫn khoá khi raw - xem palPickBuy / pickState / palLuckyRaidPool.
    return (PAL_DATA.all || []).filter(p => PALWHEEL_RAID_NAMES.includes(p.name));
}
// 🍀 4 boss của vòng quay RAID may mắn (khác pool ô RAID vòng thường)
function palLuckyRaidPool() {
    if (palWheelCfg().raw) return [];   // 🔒 PAL GỐC: vòng RAID may mắn cũng tắt
    return (PAL_DATA.all || []).filter(p => PALWHEEL_LUCKY_RAID_NAMES.includes(p.name));
}
// %/quay nạp thanh may mắn của 1 người: admin đặt riêng (u.palLuckRate, số cố định) thì
// dùng số đó; chưa đặt thì random trong [luckMin, luckMax] toàn sàn. Đây là NÚT GIAN LẬN
// công khai của chủ server - đặt cao cho bạn bè để họ đầy thanh nhanh.
function palLuckStep(userId) {
    const u = getUserData(userId);
    if (Number.isFinite(u.palLuckRate)) return Math.max(0, Math.min(100, u.palLuckRate));
    const cfg = palWheelCfg();
    const lo = Math.min(cfg.luckMin, cfg.luckMax), hi = Math.max(cfg.luckMin, cfg.luckMax);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}
// Panel gọi để đặt/xoá %/quay riêng của 1 người (null/'' = xoá về mặc định toàn sàn)
function setPalLuckRate(userId, rate) {
    const u = getUserData(userId);
    if (rate === null || rate === undefined || rate === '') { delete u.palLuckRate; }
    else { const n = Number(rate); if (!Number.isFinite(n)) return { error: 'Số không hợp lệ' }; u.palLuckRate = Math.max(0, Math.min(100, n)); }
    saveDbNow();
    return { ok: true, rate: Number.isFinite(u.palLuckRate) ? u.palLuckRate : null };
}

// Rương pal của từng người - mảng trên userData, phần tử: { id, code, name, dex, raid,
// wonAt, status: 'chest' (trong rương) | 'sold' | 'delivering' (đang giao, chờ mod xác
// nhận) | 'claimed', souls: ['hp'|'atk'|'def'|'work'], passives: [id], deliveredTo }
function palChest(userId) {
    const u = getUserData(userId);
    if (!Array.isArray(u.palChest)) u.palChest = [];
    return u.palChest;
}
// 🚫 CHỐNG SPAM: đang có 1 lượt quay CHƯA HIỆN kết quả (revealAt còn tương lai) thì khoá
// quay lượt mới - chặn kiểu "quay → F5 → quay → F5" tạo cả đống lượt chồng chéo gây lỗi.
// Tự mở khoá sau khi reel hiện xong (~10,5s). Enforce ở SERVER nên F5/gọi tay đều vô ích.
function palSpinLocked(userId) {
    const now = Date.now();
    return palChest(userId).some(i => i.revealAt && i.revealAt > now);
}
// 🚦 KHOÁ GIAO ĐƠN CHUNG (28/08): đang giao 1 đơn (nhận pal / mua item - đều mở phiên
// SFTP) thì CHẶN mọi đơn khác (pal lẫn item) tới khi xong. Tránh mở nhiều phiên SFTP
// cùng lúc (Shockbyte khoá brute-force ~10 phút nếu dồn dập). Tự hết sau 2 phút phòng kẹt.
let _deliverBusyUntil = 0;
function deliverBusy() { return Date.now() < _deliverBusyUntil; }
function deliverLock() { _deliverBusyUntil = Date.now() + 120000; }
function deliverUnlock() { _deliverBusyUntil = 0; }

function palWheelSpin(userId, username) {
    const cfg = palWheelCfg();
    if (!cfg.open) return { error: 'Vòng quay pal đang đóng bảo trì' };
    if (debtOf(getUserData(userId)).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới quay pal được' };
    if (palSpinLocked(userId)) return { error: '⏳ Đang quay dở một lượt - chờ vài giây cho hiện kết quả rồi quay tiếp nhé' };
    const normals = palWheelNormalPool();
    const raids = palWheelRaidPool();
    if (!normals.length) return { error: 'Danh sách pal chưa nạp được, báo admin' };
    const user = getUserData(userId);
    if ((user.points || 0) < cfg.price) {
        return { error: `Cần ${cfg.price.toLocaleString()} Dogcoin mỗi lượt quay (bạn có ${(user.points || 0).toLocaleString()})` };
    }
    updatePoints(userId, -cfg.price);

    // CHIA ĐỀU TẤT CẢ Ô (chủ server chốt 25/08 sau vài vòng đổi ý): ô RAID chiếm đúng
    // 1 suất như từng con pal thường - pool 281 con thì mỗi ô 1/282 (~0,35%). Trúng ô
    // RAID thì chia đều tiếp trong các boss raid.
    const total = normals.length + (raids.length ? 1 : 0);
    const roll = Math.floor(Math.random() * total);
    const isRaid = raids.length > 0 && roll === normals.length;
    const win = isRaid ? raids[Math.floor(Math.random() * raids.length)] : normals[roll];

    // 27/08: gộp 1 reel (raid ra thẳng) nên cả thường lẫn raid đều ~10,5s. revealAt vẫn
    // chặn F5 sang tab Cá nhân xem trộm giữa chừng + là mốc tự mở khoá chống spam.
    const revealMs = 10500;
    const item = {
        id: dbCache._palChestSeq = (dbCache._palChestSeq || 0) + 1,
        code: win.code, name: win.name, dex: win.dex || 0, raid: isRaid, legend: palIsLegend(win.code),
        wonAt: new Date().toLocaleString('vi-VN'), status: 'chest',
        revealAt: Date.now() + revealMs,
    };
    palChest(userId).unshift(item);

    // 🏆 Hũ quay pal: giữ nguyên luật cũ của gacha Discord (nuôi 5% vé, nổ 1%)
    potFeed('gacha', luckyPotCut('gacha', cfg.price));
    let potWin = 0;
    if (potGet('gacha') > 0 && Math.random() < POT_HIT_RATE) {
        potWin = luckyPotPop('gacha');
        updatePoints(userId, potWin);
        logDog('jackpot', userId, username || userId, potWin, 'nổ hũ quay pal (web)');
    }

    // 🍀 THANH MAY MẮN: mỗi lượt quay nạp %/quay của người này (mặc định 1-3, admin đặt
    // riêng từng người). CHẶN TRẦN 100 - đầy thì mở nút quay vòng RAID, quay raid xong về 0
    // (chủ server chốt 27/08: không cộng dồn quá 100, không tích nhiều vé).
    if (typeof user.palLuck !== 'number' || user.palLuck < 0) user.palLuck = 0;
    const luckBefore = user.palLuck;
    user.palLuck = Math.min(100, user.palLuck + palLuckStep(userId));
    const luckJustFull = luckBefore < 100 && user.palLuck >= 100;

    logDog('shop', userId, username || userId, -cfg.price, `quay pal web trúng ${item.name}${isRaid ? ' (PAL RAID)' : ''} - rương #${item.id}`);
    writeLog('ADMIN', `[QUAY PAL WEB] ${username || userId} quay trúng ${item.name}${isRaid ? ' (PAL RAID)' : ''} - rương #${item.id}${potWin ? ` | NỔ HŨ +${potWin}` : ''}${luckJustFull ? ' | ĐẦY THANH MAY MẮN -> mở vòng RAID' : ''}`);
    saveDbNow();

    // Đăng công khai vào kênh gacha (nếu admin có cấu hình kênh) - ĐỢI reel quay xong
    // mới đăng, kẻo bạn bè trong Discord biết kết quả trước người đang quay.
    const gachaCh = dbCache._gachaChannelId;
    if (gachaCh && typeof client !== 'undefined' && client && client.channels) {
        const msg = isRaid
            ? `🎁🔥 **${username || 'Ai đó'}** quay pal trên web trúng ô **PAL RAID** và mở ra **${item.name}**!`
            : `🎁 **${username || 'Ai đó'}** quay pal trên web trúng **${item.name}**${item.dex ? ` (#${item.dex})` : ''}!`;
        setTimeout(() => {
            client.channels.fetch(gachaCh)
                .then(ch => ch.send(msg + (potWin ? `\n💥🏆 Và NỔ LUÔN HŨ QUAY PAL: +**${potWin.toLocaleString()}** ${DOGCOIN_EMOJI}!` : '')))
                .catch(e => writeLog('SYSTEM', `[QUAY PAL WEB] Khong dang duoc vao kenh ${gachaCh}: ${e.message}`));
        }, revealMs);
        if (potWin) potAnnounce(gachaCh, `💥🏆 <@${userId}> quay pal web NỔ HŨ: +**${potWin.toLocaleString()}** ${DOGCOIN_EMOJI}! Hũ đặt lại về ${potSeed('gacha').toLocaleString()} 🌱`, userId);
    }

    return { ok: true, item, potWin, balance: getUserData(userId).points || 0, luck: user.palLuck, raidReady: cfg.raidWheelOn && user.palLuck >= 100, luckJustFull };
}

// 🍀 QUAY VÒNG RAID (27/08): đầy thanh may mắn (100%) mới quay được. Trúng đều 1/4 boss
// + thưởng raidBonus Dogcoin. Quay xong THANH VỀ 0. Pal vào rương như quay thường.
function palRaidSpin(userId, username) {
    const cfg = palWheelCfg();
    if (!cfg.raidWheelOn) return { error: 'Vòng quay RAID đang tắt' };
    if (cfg.raw) return { error: '🔒 Đang chế độ PAL GỐC - vòng quay RAID tạm tắt (thanh may mắn vẫn giữ)' };
    if (debtOf(getUserData(userId)).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới quay được' };
    if (palSpinLocked(userId)) return { error: '⏳ Đang quay dở một lượt - chờ vài giây rồi quay tiếp nhé' };
    const user = getUserData(userId);
    if ((user.palLuck || 0) < 100) return { error: 'Chưa đủ thanh may mắn (cần đầy 100%)' };
    const pool = palLuckyRaidPool();
    if (!pool.length) return { error: 'Danh sách boss raid chưa nạp được, báo admin' };
    user.palLuck = 0; // quay xong may mắn về 0
    const win = pool[Math.floor(Math.random() * pool.length)];
    const item = {
        id: dbCache._palChestSeq = (dbCache._palChestSeq || 0) + 1,
        code: win.code, name: win.name, dex: win.dex || 0, raid: true,
        wonAt: new Date().toLocaleString('vi-VN') + ' (thưởng may mắn)', status: 'chest',
        revealAt: Date.now() + 10500,
    };
    palChest(userId).unshift(item);
    const bonus = cfg.raidBonus;
    if (bonus > 0) updatePoints(userId, bonus);
    logDog('shop', userId, username || userId, bonus, `THƯỞNG vòng RAID may mắn: ${item.name} + ${bonus} Dogcoin - rương #${item.id}`);
    writeLog('ADMIN', `[VÒNG RAID] ${username || userId} đầy thanh may mắn -> ${item.name}${bonus ? ` + ${bonus} Dogcoin` : ''} - rương #${item.id}`);
    saveDbNow();

    const gachaCh = dbCache._gachaChannelId;
    if (gachaCh && typeof client !== 'undefined' && client && client.channels) {
        const msg = `🍀🔥 **${username || 'Ai đó'}** đầy THANH MAY MẮN, quay vòng RAID ra **${item.name}**${bonus > 0 ? ` + **${bonus.toLocaleString()}** ${DOGCOIN_EMOJI}` : ''}!`;
        setTimeout(() => {
            client.channels.fetch(gachaCh).then(ch => ch.send(msg))
                .catch(e => writeLog('SYSTEM', `[VÒNG RAID] Khong dang duoc vao kenh ${gachaCh}: ${e.message}`));
        }, 10500);
    }
    return { ok: true, item, bonus, luck: user.palLuck, raidReady: false, balance: getUserData(userId).points || 0 };
}

// 🎯 CHỌN PAL ĐÍCH DANH (25/08, thay nút "Pal tùy chọn" 6.000 trong Discord): chọn
// đúng con mình thích trong pool pal THƯỜNG (không raid, không Panthalus/Astralym),
// trả tiền, pal vào RƯƠNG như quay trúng - nhận/bán cùng một luồng. Nuôi hũ + xổ hũ
// giống vé quay cho công bằng giữa hai đường mua.
// 4 boss raid được bán đích danh (26/08) - tên khớp pals.json, giá theo key trong cfg
const PALPICK_RAID = [
    { name: 'Bellanoir Libero', key: 'pickBellaLib' },
    { name: 'Blazamut Ryu', key: 'pickBlaza' },
    { name: 'Xenolord', key: 'pickXeno' },
    { name: 'Hartalis', key: 'pickHarta' },
];
function palPickPrice(pal, cfg) {
    const r = PALPICK_RAID.find(x => x.name === pal.name);
    return r ? cfg[r.key] : cfg.customPrice;
}
function palPickBuy(userId, code, username) {
    const cfg = palWheelCfg();
    if (!cfg.open) return { error: 'Vòng quay pal đang đóng bảo trì' };
    if (debtOf(getUserData(userId)).bad) return { error: '⚠️ Đang nợ xấu - trả sạch nợ mới mua pal được' };
    // pool thường + 4 boss raid đang mở bán (giá > 0) - 🔒 PAL GỐC: KHÔNG bán raid đích danh (chỉ quay random mới ra)
    const raidNames = new Set(cfg.raw ? [] : PALPICK_RAID.filter(x => cfg[x.key] > 0).map(x => x.name));
    const pal = palWheelNormalPool().find(p => p.code === String(code || ''))
        || palWheelRaidPool().find(p => raidNames.has(p.name) && p.code === String(code || ''));
    if (!pal) return { error: 'Không thấy pal này trong danh sách bán' };
    const isRaid = raidNames.has(pal.name);
    const price = palPickPrice(pal, cfg);
    const user = getUserData(userId);
    if ((user.points || 0) < price) {
        return { error: `Cần ${price.toLocaleString()} Dogcoin (bạn có ${(user.points || 0).toLocaleString()})` };
    }
    updatePoints(userId, -price);

    const item = {
        id: dbCache._palChestSeq = (dbCache._palChestSeq || 0) + 1,
        code: pal.code, name: pal.name, dex: pal.dex || 0, raid: isRaid,
        wonAt: new Date().toLocaleString('vi-VN') + ' (chọn mua)', status: 'chest',
    };
    palChest(userId).unshift(item);

    potFeed('gacha', luckyPotCut('gacha', price));
    let potWin = 0;
    if (potGet('gacha') > 0 && Math.random() < POT_HIT_RATE) {
        potWin = luckyPotPop('gacha');
        updatePoints(userId, potWin);
        logDog('jackpot', userId, username || userId, potWin, 'nổ hũ khi chọn mua pal (web)');
    }

    logDog('shop', userId, username || userId, -price, `chọn mua pal ${item.name}${isRaid ? ' (BOSS RAID)' : ''} (web) - rương #${item.id}`);
    writeLog('ADMIN', `[CHỌN PAL WEB] ${username || userId} mua đích danh ${item.name} - rương #${item.id}${potWin ? ` | NỔ HŨ +${potWin}` : ''}`);
    saveDbNow();

    const gachaCh = dbCache._gachaChannelId;
    if (gachaCh && typeof client !== 'undefined' && client && client.channels) {
        client.channels.fetch(gachaCh)
            .then(ch => ch.send(`🎯 **${username || 'Ai đó'}** chọn mua **${item.name}**${item.dex ? ` (#${item.dex})` : ''} trên web!` + (potWin ? `\n💥🏆 Và NỔ LUÔN HŨ QUAY PAL: +**${potWin.toLocaleString()}** ${DOGCOIN_EMOJI}!` : '')))
            .catch(e => writeLog('SYSTEM', `[CHỌN PAL WEB] Khong dang duoc vao kenh ${gachaCh}: ${e.message}`));
        if (potWin) potAnnounce(gachaCh, `💥🏆 <@${userId}> chọn mua pal mà NỔ HŨ: +**${potWin.toLocaleString()}** ${DOGCOIN_EMOJI}! Hũ đặt lại về ${potSeed('gacha').toLocaleString()} 🌱`, userId);
    }

    return { ok: true, item, potWin, balance: getUserData(userId).points || 0 };
}

function palChestSell(userId, itemId, username) {
    const cfg = palWheelCfg();
    const item = palChest(userId).find(i => i.id === Number(itemId));
    if (!item) return { error: 'Không thấy pal này trong rương' };
    if (item.revealAt && item.revealAt > Date.now()) return { error: 'Pal đang trong vòng quay - chờ quay xong đã' };
    if (item.status !== 'chest') return { error: item.status === 'delivering' ? 'Pal đang giao dở, không bán được' : 'Pal này đã xử lý rồi' };
    item.status = 'sold';
    item.soldAt = new Date().toLocaleString('vi-VN');
    updatePoints(userId, cfg.sellPrice);
    logDog('shop', userId, username || userId, cfg.sellPrice, `bán ${item.name} trong rương pal (#${item.id})`);
    writeLog('ADMIN', `[RƯƠNG PAL] ${username || userId} bán ${item.name} (#${item.id}) +${cfg.sellPrice} Dogcoin`);
    saveDbNow();
    return { ok: true, sold: cfg.sellPrice, balance: getUserData(userId).points || 0 };
}

// ===== 💎 TÍNH PHÍ NÂNG CẤP VƯỢT TRẦN (26/08) =====
// Ô passive: 4 ô đầu (hoặc mức gốc admin đặt) miễn phí, mỗi ô tiếp theo giá riêng.
function palUpPassiveCost(count, cfg) {
    const prices = { 5: cfg.upSlot5, 6: cfg.upSlot6, 7: cfg.upSlot7, 8: cfg.upSlot8 };
    let cost = 0;
    // 09/09: ô vượt "gốc miễn phí" đều tính tiền - ô 2-4 giá upSlotLow (hạ gốc xuống 1 là bán
    // ô 2/3/4), ô 5-8 giá riêng từng ô như cũ. Trước đây ô 2-4 luôn miễn phí dù hạ gốc.
    for (let i = cfg.passiveMax + 1; i <= count; i++) cost += i >= 5 ? (prices[i] || 0) : cfg.upSlotLow;
    return cost;
}
// Linh hồn: giá niêm yết là MỖI 1% (chủ server chốt 26/08: "1 lần kéo 3% thì x3 sẵn"),
// chia 5 khung theo % SAU khi bước: tới 72% / 81% / 90% / 102% / 201%.
// Ví dụ 60->72 = 12% x 1.000 = 12.000; 60->201 = 684.000 MỖI DÒNG.
function palUpSoulStepPrice(pctAfter, cfg) {
    if (pctAfter <= 72) return cfg.upSoul1;
    if (pctAfter <= 81) return cfg.upSoul2;
    if (pctAfter <= 90) return cfg.upSoul3;
    if (pctAfter <= 102) return cfg.upSoul4;
    return cfg.upSoul5;
}
function palUpSoulCost(targetPct, cfg) {   // phí % cho MỘT dòng linh hồn (mỗi nấc 3% = 3 x giá/1%)
    let cost = 0;
    for (let p = cfg.soulPct + 3; p <= targetPct; p += 3) cost += 3 * palUpSoulStepPrice(p, cfg);
    return cost;
}
// Phí THÊM DÒNG linh hồn (09/09, chủ server chốt): cfg.soulMax dòng đầu MIỄN PHÍ (mặc định 1),
// MỖI dòng vượt = upSoulLine (giá PHẲNG, mặc định 5.000): gốc 1 -> 2 dòng = 5k, 3 dòng = 10k,
// 4 dòng = 15k; gốc 2 -> 3 dòng = 5k. Trước là cấp số nhân và soulMax là trần chọn.
function palUpSoulLineCost(lines, cfg) {
    return Math.max(0, lines - cfg.soulMax) * cfg.upSoulLine;
}
// IV: 3 chỉ số RIÊNG (Máu / Công / Thủ), mỗi điểm trên mức gốc = upIv, tính từng chỉ số.
function palUpIvCost(ivHp, ivAtk, ivDef, cfg) {
    const d = (v) => Math.max(0, v - cfg.ivs);
    return (d(ivHp) + d(ivAtk) + d(ivDef)) * cfg.upIv;
}

const PAL_SOUL_KEYS = ['hp', 'atk', 'def', 'work'];
async function palChestClaim(userId, itemId, soulsIn, passivesIn, username, extra) {
    const cfg = palWheelCfg();
    const item = palChest(userId).find(i => i.id === Number(itemId));
    if (!item) return { error: 'Không thấy pal này trong rương' };
    if (item.revealAt && item.revealAt > Date.now()) return { error: 'Pal đang trong vòng quay - chờ quay xong đã' };
    if (item.status === 'delivering') return { error: 'Pal này đang giao dở - chờ vài phút hoặc nhắn admin' };
    if (item.status !== 'chest') return { error: 'Pal này đã xử lý rồi' };

    // ⏳ COOLDOWN NHẬN PAL CHUNG (28/08): đặt SAU khi giao thành công, chặn CẢ SERVER tới hết giờ.
    if (cfg.claimCd > 0) {
        const left = Math.ceil(((dbCache._palClaimCdUntil || 0) - Date.now()) / 1000);
        if (left > 0) return { error: `⏳ Kho pal đang bận (cooldown chung toàn server) - chờ ${left}s rồi nhận con tiếp nhé` };
    }
    // 📅 HẠN MỨC PAL/NGÀY (09/09): sổ đếm nằm ở u.palDayKey (ngày VN) + u.palDayN.
    // Chỉ CHẶN ở đây - lượt chỉ bị TRỪ ở nhánh giao thành công bên dưới, nên giao lỗi
    // (hoàn về rương / treo chờ admin) không ăn mất lượt của người chơi.
    if (cfg.dayMax > 0) {
        const uQ = getUserData(userId);
        const todayQ = vnDayISO(Date.now());
        if (uQ.palDayKey !== todayQ) { uQ.palDayKey = todayQ; uQ.palDayN = 0; }
        if ((uQ.palDayN || 0) >= cfg.dayMax) {
            return { error: `📅 Hôm nay bạn đã chuyển đủ ${cfg.dayMax} pal vào game - qua 00:00 lại nhận tiếp được nhé` };
        }
    }
    // 🚦 đang giao đơn khác (pal/item) -> chặn, khỏi mở nhiều phiên SFTP cùng lúc
    if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi thử lại nhé' };

    const souls = Array.isArray(soulsIn) ? [...new Set(soulsIn.map(String).filter(s => PAL_SOUL_KEYS.includes(s)))] : [];
    if (souls.length > 4) return { error: 'Chỉ có 4 dòng linh hồn (Tấn công/Phòng thủ/Máu/Làm việc)' };   // 09/09: soulMax giờ là số dòng MIỄN PHÍ, không còn chặn chọn
    // 26/08: BẮT BUỘC ít nhất 1 dòng; dòng đầu miễn phí, thêm dòng tính phí cấp số nhân
    // 🔒 09/09: chế độ PAL GỐC (cfg.raw) bỏ qua linh hồn/IV/BOSS người chơi gửi lên - không bắt chọn dòng
    if (souls.length < 1 && !palWheelCfg().raw) {
        return { error: 'Phải chọn ít nhất 1 dòng linh hồn rồi mới nhận được' };
    }
    const catalog = new Set(passiveCatalog().map(p => p.id));
    // 🔒 09/09: PAL GỐC không có passive (chỉ chọn giới tính) - client gửi gì cũng bỏ
    const passives = palWheelCfg().raw ? [] : (Array.isArray(passivesIn) ? [...new Set(passivesIn.map(String).filter(p => catalog.has(p)))] : []);
    if (passives.length > 8) return { error: 'Tối đa 8 passive' };

    // 💎 NÂNG CẤP TRẢ PHÍ (26/08, chủ server chốt bảng giá): mức vượt gốc miễn phí
    // (ô passive 5-8, linh hồn quá cfg.soulPct, IV quá cfg.ivs) bị tính tiền -
    // trừ ví ngay lúc nhận; nhánh nào CHẮC CHẮN chưa giao thì hoàn đủ.
    const want = (extra && typeof extra === 'object') ? extra : {};
    // 26/08 (chốt lại): % linh hồn kéo RIÊNG TỪNG DÒNG (mua Công 201% mà Máu 102% được),
    // phí tính riêng từng dòng theo bảng mỗi-1%. Dòng không chọn thì bỏ qua.
    const soulPcts = {};
    for (const k of souls) {
        const field = 'soul' + k.charAt(0).toUpperCase() + k.slice(1) + 'Pct'; // soulHpPct...
        const v = Math.floor(Number(want[field]) || cfg.soulPct);
        if (v < cfg.soulPct || v > 201 || v % 3 !== 0) {
            return { error: `Mức linh hồn dòng ${k} không hợp lệ (${cfg.soulPct}–201%, bước 3%)` };
        }
        soulPcts[k] = v;
    }
    // 3 chỉ số IV RIÊNG: Máu / Công / Thủ (game hiện đúng 3 dòng này)
    const ivHp = Math.floor(Number(want.ivHp) || cfg.ivs);
    const ivAtk = Math.floor(Number(want.ivAtk) || cfg.ivs);
    const ivDef = Math.floor(Number(want.ivDef) || cfg.ivs);
    for (const v of [ivHp, ivAtk, ivDef]) {
        if (v < cfg.ivs || v > 255) return { error: `Mức IV không hợp lệ (${cfg.ivs}–255)` };
    }
    // 🚻 GIỚI TÍNH (27/08, chủ server chốt BẮT BUỘC chọn - không có mặc định): 1=Đực, 2=Cái.
    // Verify tận game: mod ghi sp.Gender số nguyên ăn (cừu ra đúng đực/cái).
    const gender = Math.floor(Number(want.gender) || 0);
    if (gender !== 1 && gender !== 2) {
        return { error: 'Phải chọn giới tính pal (♂ Đực hoặc ♀ Cái) rồi mới nhận được' };
    }
    // 👑 07/09 (chủ server chốt): MẶC ĐỊNH giao bản THƯỜNG; muốn bản PAL BOSS thì
    // TÍCH CHỌN + trả thêm cfg.upBoss (mặc định 10k). cfg.boss giờ = công tắc MỞ BÁN.
    // Không có bản BOSS = Yakushima (biết trước) + _noBossCodes (bot TỰ HỌC từ lần
    // spawn BOSS_ fail - xem khối retry bên dưới) -> chặn từ đầu, khỏi mất công thử.
    const noBossVariant = /^Yakushima/i.test(item.code)
        || (Array.isArray(dbCache._noBossCodes) && dbCache._noBossCodes.includes(item.code));
    const wantBoss = Math.floor(Number(want.boss) || 0) === 1;
    if (wantBoss && !cfg.boss) return { error: '👑 Bản PAL BOSS đang không mở bán' };
    if (wantBoss && noBossVariant) return { error: '👑 Pal này game không có bản BOSS - nhận bản thường nhé' };
    const soulPctCost = souls.reduce((s, k) => s + palUpSoulCost(soulPcts[k], cfg), 0);
    // 🌈 passive Cây Thế Giới bán riêng theo con (26/08)
    const wtSet = new Set(passiveCatalog().filter(p => p.wt).map(p => p.id));
    const wtCount = passives.filter(id => wtSet.has(id)).length;
    // 💎 09/09: passive hạng 4 thường tính giá riêng/con (Cây Thế Giới đã tính ở trên, không tính đôi)
    const t4Set = new Set(passiveCatalog().filter(p => p.tier === 4 && !p.wt).map(p => p.id));
    const t4Count = passives.filter(id => t4Set.has(id)).length;
    const upCost = palUpPassiveCost(passives.length, cfg)
        + wtCount * cfg.upWtPassive
        + t4Count * cfg.upTier4
        // 🔒 09/09: PAL GỐC bỏ hết phí chỉ số (linh hồn/IV/dòng/BOSS) vì không giao mấy thứ đó
        + (cfg.raw ? 0 : soulPctCost + palUpSoulLineCost(souls.length, cfg) + palUpIvCost(ivHp, ivAtk, ivDef, cfg) + (wantBoss ? cfg.upBoss : 0));
    if (upCost > 0 && (getUserData(userId).points || 0) < upCost) {
        return { error: `💎 Nâng cấp này tốn ${upCost.toLocaleString()} Dogcoin - ví bạn không đủ` };
    }

    const gameName = (getUserData(userId).ingameName || '').trim();
    if (!gameName) return { error: 'Chưa liên kết tên nhân vật trong game - nhắn admin liên kết trước đã' };
    deliverLock();   // 🚦 giữ khoá suốt phiên SFTP (online-check + giao)
    const on = await requireOnline(gameName);
    if (on.unknown) { deliverUnlock(); return { error: `Không kiểm tra được trạng thái online (${on.msg || 'timeout'}) - thử lại sau vài phút` }; }
    if (!on.online) { deliverUnlock(); return { error: `Nhân vật ${gameName} chưa online trong game - vào game rồi bấm nhận nhé` }; }

    // Đánh dấu ĐANG GIAO trước khi gửi lệnh: nếu kết quả không rõ (timeout) thì giữ
    // nguyên trạng thái này cho admin xử, tuyệt đối không cho bấm nhận lần 2 (sợ trùng pal).
    item.status = 'delivering';
    item.souls = souls;
    item.passives = passives;
    item.claimAt = new Date().toLocaleString('vi-VN');
    // trừ phí nâng cấp NGAY (chủ server chốt "bấm thêm thì trừ tiền luôn")
    const soulDesc = souls.map(k => `${k} ${soulPcts[k]}%`).join(' ');
    item.upCost = 0;
    item.upPick = { soulPcts, ivHp, ivAtk, ivDef, soulLines: souls.length, passiveCount: passives.length, boss: wantBoss };
    if (upCost > 0) {
        updatePoints(userId, -upCost);
        item.upCost = upCost;
        logDog('shop', userId, username || userId, -upCost, `💎 nâng cấp pal vượt trần (rương #${item.id}): ${passives.length} passive · linh hồn ${soulDesc} · IV ${ivHp}/${ivAtk}/${ivDef}`);
    }
    saveDbNow();
    // hoàn phí nâng cấp cho các nhánh CHẮC CHẮN chưa giao gì
    const refundUp = () => {
        if (item.upCost > 0) {
            updatePoints(userId, item.upCost);
            logDog('refund', userId, username || userId, item.upCost, `hoàn phí nâng cấp pal (rương #${item.id} chưa giao được)`);
            item.upCost = 0;
        }
    };

    // 07/09: BOSS_ chỉ khi người chơi MUA bản boss (wantBoss - đã chặn Yakushima ở trên)
    let species = (wantBoss ? 'BOSS_' : '') + item.code;
    // linh hồn theo % TỪNG DÒNG người chơi mua - rank trong save = %/3 (60% -> 20, 201% -> 67)
    const soulRank = (k) => souls.includes(k) ? Math.max(0, Math.min(255, Math.round(soulPcts[k] / 3))) : 0;
    const specBase = cfg.raw ? {
        // 🔒 PAL GỐC: Lv1 · 0 sao · IV 1 · linh hồn 0 · bản thường - chỉ giữ giới tính + passive đã chọn
        level: 1, rank: 0,
        ivHp: 1, ivMelee: 1, ivShot: 1, ivDef: 1,
        soulHp: 0, soulAtk: 0, soulDef: 0, soulWork: 0,
        gender,
        passives,
    } : {
        level: cfg.level, rank: cfg.stars,
        // Công trong game = Talent_Shot; Talent_Melee đã bỏ nhưng ghi cùng giá cho chắc
        ivHp: ivHp, ivMelee: ivAtk, ivShot: ivAtk, ivDef: ivDef,
        soulHp: soulRank('hp'),
        soulAtk: soulRank('atk'),
        soulDef: soulRank('def'),
        soulWork: soulRank('work'),
        gender,
        passives,
    };
    if (cfg.raw) species = item.code;   // 🔒 không BOSS_ khi tắt chỉ số
    let r = null, err = null;
    try {
        r = await pal.givePal(gameName, { species, ...specBase });
    } catch (e) { err = e; }
    // 07/09: "spawn failed" từ mod = game KHÔNG có id này và CHƯA giao gì. Nếu đang gắn
    // BOSS_ thì tự thử lại bản thường 1 lần - pal đặc biệt nào thiếu bản BOSS_ (kiểu
    // Demon Eye) tự lành theo đường này, khỏi nuôi danh sách ngoại lệ.
    // Người chơi ĐÃ TRẢ PHÍ bản boss -> hoàn ngay phần phí đó (giao bản thường mà giữ
    // 10k là ăn gian tiền người ta), và GHI NHỚ code này để lần sau chặn từ đầu.
    let bossFellBack = false;
    if (!(r && r.ok) && /spawn failed/i.test((r && r.message) || (err && err.message) || '') && species !== item.code) {
        writeLog('ADMIN', `[RƯƠNG PAL] ${species} spawn fail (không có bản BOSS) - tự thử lại bản thường ${item.code} (rương #${item.id})`);
        species = item.code;
        bossFellBack = true;
        if (wantBoss && cfg.upBoss > 0 && (Number(item.upCost) || 0) >= cfg.upBoss) {
            updatePoints(userId, cfg.upBoss);
            item.upCost -= cfg.upBoss;
            logDog('refund', userId, username || userId, cfg.upBoss, `hoàn phí bản BOSS (pal ${item.code} game không có bản boss - giao bản thường)`);
        }
        if (item.upPick) item.upPick.boss = false;
        dbCache._noBossCodes = Array.isArray(dbCache._noBossCodes) ? dbCache._noBossCodes : [];
        if (!dbCache._noBossCodes.includes(item.code)) dbCache._noBossCodes.push(item.code);
        err = null;
        try {
            r = await pal.givePal(gameName, { species, ...specBase });
        } catch (e) { err = e; }
    }
    deliverUnlock();   // 🚦 SFTP xong -> mở khoá cho đơn khác (phần xử lý kết quả dưới không đụng SFTP)

    if (r && r.ok) {
        item.status = 'claimed';
        item.deliveredTo = gameName;
        // ⏳ đặt cooldown CHUNG toàn server sau khi giao xong
        if (cfg.claimCd > 0) dbCache._palClaimCdUntil = Date.now() + cfg.claimCd * 1000;
        // 📅 trừ 1 lượt hạn mức ngày (chỉ lượt giao THÀNH CÔNG mới tốn)
        {
            const uQ = getUserData(userId);
            const todayQ = vnDayISO(Date.now());
            if (uQ.palDayKey !== todayQ) { uQ.palDayKey = todayQ; uQ.palDayN = 0; }
            uQ.palDayN = (uQ.palDayN || 0) + 1;
        }
        saveDbNow();
        writeLog('ADMIN', `[RƯƠNG PAL] Đã giao ${species} Lv${cfg.level} cho ${gameName} (rương #${item.id} của ${username || userId}) | linh hồn: ${soulDesc || '-'} | IV ${ivHp}/${ivAtk}/${ivDef} | passive: ${passives.join(',') || '-'}${upCost ? ` | 💎 phí nâng cấp ${upCost.toLocaleString()}` : ''}`);
        return { ok: true, message: `${bossFellBack ? `⚠️ Pal này game KHÔNG có bản BOSS - đã giao BẢN THƯỜNG và hoàn ${cfg.upBoss.toLocaleString()} phí BOSS. ` : ''}✅ Đã giao vào hộp pal trong game!${(Number(item.upCost) || 0) ? ` (💎 phí nâng cấp −${Number(item.upCost).toLocaleString()} Dogcoin)` : ''} Pal sẽ DÙNG ĐƯỢC sau đợt khởi động lại server kế tiếp.` };
    }

    const msg = (r && r.message) || (err && err.message) || 'không nhận được phản hồi';
    // 25/08 (rút từ đơn #64 kẹt trên server chính): lỗi 404/401/mất kết nối dashboard
    // là CHẮC CHẮN chưa ghi gì vào queue -> tự trả về rương, khỏi phiền admin gỡ tay.
    // Lỗi 500/timeout thì KHÔNG - có thể đã ghi queue rồi mới hỏng, vẫn phải treo chờ kiểm.
    if (/lỗi 404|lỗi 401|fetch failed|ECONNREFUSED|aborted/i.test(msg)) {
        item.status = 'chest';
        refundUp();
        saveDbNow();
        writeLog('ADMIN', `[RƯƠNG PAL] Dashboard không nhận lệnh (${msg}) - trả rương #${item.id} về cho ${username || userId} bấm lại`);
        return { error: '⚠️ Hệ thống giao đang bảo trì (dashboard chưa sẵn sàng) - pal vẫn trong rương, phí nâng cấp đã hoàn, thử lại sau ít phút' };
    }
    if (/PALBOX DAY/i.test(msg)) {
        item.status = 'chest'; // mod từ chối vì hộp đầy, CHƯA giao gì - pal còn nguyên trong rương
        refundUp();
        saveDbNow();
        return { error: '📦 Hộp pal trong game ĐẦY - dọn bớt chỗ trong palbox rồi bấm nhận lại (pal + phí nâng cấp còn nguyên)' };
    }
    if (/player not found|not found|chưa online/i.test(msg)) {
        item.status = 'chest'; // mod xác nhận CHƯA giao gì - trả về rương cho bấm lại
        refundUp();
        saveDbNow();
        return { error: `Không thấy ${gameName} trong game - vào game rồi thử lại (phí nâng cấp đã hoàn)` };
    }
    // 07/09: spawn fail (đã thử cả bản thường ở trên) = mod CHƯA giao gì - trả về rương,
    // đừng treo 'delivering' bắt admin gỡ tay như vụ Demon Eye.
    if (/spawn failed/i.test(msg)) {
        item.status = 'chest';
        refundUp();
        saveDbNow();
        writeLog('ADMIN', `[RƯƠNG PAL] Spawn fail cả 2 kiểu id cho ${item.code} (rương #${item.id} của ${username || userId}) - đã trả về rương; kiểm lại id pal trong pals.json`);
        return { error: '⚠️ Game không spawn được pal này - pal + phí nâng cấp đã hoàn về rương, báo admin kiểm giùm' };
    }
    // Không rõ đã giao hay chưa: giữ 'delivering', admin kiểm results.log rồi xử ở panel
    writeLog('ADMIN', `[RƯƠNG PAL] KHÔNG RÕ KẾT QUẢ giao ${species} cho ${gameName} (rương #${item.id} của ${username || userId}): ${msg} - kiểm results.log: đã giao thì bấm "đã giao", chưa thì "trả về rương"`);
    return { error: '⚠️ Chưa xác nhận được kết quả giao. ĐỪNG quay/bấm lại - admin sẽ kiểm và xử lý sớm.' };
}

// Panel gọi: admin chốt kết quả cho pal đang kẹt 'delivering' sau khi kiểm results.log
function palChestResolve(ownerId, itemId, delivered) {
    const item = palChest(ownerId).find(i => i.id === Number(itemId));
    if (!item || item.status !== 'delivering') return { error: 'Không thấy pal đang giao dở với id này' };
    item.status = delivered ? 'claimed' : 'chest';
    if (delivered) item.deliveredTo = item.deliveredTo || (getUserData(ownerId).ingameName || '').trim();
    // 26/08: admin trả về rương = xác nhận CHƯA giao -> hoàn phí nâng cấp đã trừ
    if (!delivered && (Number(item.upCost) || 0) > 0) {
        updatePoints(ownerId, item.upCost);
        logDog('refund', ownerId, getUserData(ownerId).name || ownerId, item.upCost, `admin hoàn phí nâng cấp pal (rương #${item.id} trả về rương)`);
        item.upCost = 0;
    }
    saveDbNow();
    writeLog('ADMIN', `[RƯƠNG PAL] Admin chốt rương #${item.id} của ${ownerId}: ${delivered ? 'ĐÃ GIAO' : 'trả về rương'}`);
    return { ok: true };
}

// ⭐ Build passive RIÊNG của từng người (25/08): tự chọn 4 con ưng ý rồi lưu, lần sau
// bấm 1 phát lấy lại. Lưu trên userData nên qua restart vẫn còn. Tối đa 8 bộ/người,
// trùng tên = ghi đè. id lạ bị lọc ngay lúc lưu.
function palBuildSave(userId, name, idsIn) {
    const u = getUserData(userId);
    const nm = String(name || '').trim().slice(0, 24);
    if (!nm) return { error: 'Đặt tên cho build đã (tối đa 24 ký tự)' };
    const catalog = new Set(passiveCatalog().map(p => p.id));
    const ids = Array.isArray(idsIn) ? [...new Set(idsIn.map(String).filter(id => catalog.has(id)))].slice(0, 8) : [];
    if (!ids.length) return { error: 'Chọn ít nhất 1 passive rồi hãy lưu build' };
    if (!Array.isArray(u.palBuilds)) u.palBuilds = [];
    const i = u.palBuilds.findIndex(b => b.name === nm);
    if (i >= 0) u.palBuilds[i] = { name: nm, ids };
    else {
        if (u.palBuilds.length >= 8) return { error: 'Tối đa 8 build riêng - xoá bớt rồi lưu' };
        u.palBuilds.push({ name: nm, ids });
    }
    saveDbNow();
    return { ok: true, myBuilds: u.palBuilds };
}
function palBuildDel(userId, name) {
    const u = getUserData(userId);
    if (!Array.isArray(u.palBuilds)) u.palBuilds = [];
    const before = u.palBuilds.length;
    u.palBuilds = u.palBuilds.filter(b => b.name !== String(name || ''));
    if (u.palBuilds.length === before) return { error: 'Không thấy build này' };
    saveDbNow();
    return { ok: true, myBuilds: u.palBuilds };
}

// Panel gọi: liệt kê rương của mọi người (ưu tiên đơn đang giao dở lên đầu)
// 🗑️ 09/09: xoá SẠCH rương pal của MỌI người chơi (panel SUPER, gõ XOA). Giữ lại pal đang
// 'delivering' (đang giao dở - admin phải chốt ✅/↩️ trước) để không mất dấu đơn. KHÔNG hoàn tiền
// (chủ server reset kinh tế cho team chơi lại). Trả số đã xoá / còn giữ.
function palChestClearAll() {
    let removed = 0, kept = 0, users = 0;
    for (const [uid, rec] of Object.entries(dbCache)) {
        if (!/^\d{15,20}$/.test(uid) || !rec || !Array.isArray(rec.palChest) || !rec.palChest.length) continue;
        const keep = rec.palChest.filter(i => i.status === 'delivering');
        removed += rec.palChest.length - keep.length; kept += keep.length; users++;
        rec.palChest = keep;
    }
    saveDbNow();
    writeLog('ADMIN', `[🗑️ RƯƠNG PAL] Panel XOÁ SẠCH rương: bỏ ${removed} pal của ${users} người, giữ ${kept} đơn đang giao`);
    return { ok: true, removed, kept, users };
}
function palChestOverview() {
    const out = [];
    for (const [uid, rec] of Object.entries(dbCache)) {
        if (!/^\d{15,20}$/.test(uid) || !rec || !Array.isArray(rec.palChest)) continue;
        for (const item of rec.palChest) {
            out.push({ ownerId: uid, ownerName: rec.name || uid, ingameName: (rec.ingameName || '').trim(), ...item });
        }
    }
    const rank = { delivering: 0, chest: 1, claimed: 2, sold: 3 };
    out.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.id - a.id);
    return out;
}

// Panel gọi: admin tặng thẳng 1 pal vào rương (đền bù/sự kiện). name khớp theo tên.
function palChestGrant(ownerId, palName) {
    const all = PAL_DATA.all || [];
    const q = String(palName || '').trim().toLowerCase();
    const win = all.find(p => p.name.toLowerCase() === q) || all.find(p => p.name.toLowerCase().includes(q));
    if (!win) return { error: `Không thấy pal tên "${palName}"` };
    const raidSet = new Set(PAL_DATA.raidOnly || []);
    const item = {
        id: dbCache._palChestSeq = (dbCache._palChestSeq || 0) + 1,
        code: win.code, name: win.name, dex: win.dex || 0, raid: raidSet.has(win.name),
        wonAt: new Date().toLocaleString('vi-VN') + ' (admin tặng)', status: 'chest',
    };
    palChest(ownerId).unshift(item);
    saveDbNow();
    writeLog('ADMIN', `[RƯƠNG PAL] Admin tặng ${win.name} vào rương của ${ownerId} (#${item.id})`);
    return { ok: true, item };
}

const WITHDRAW_MAX_PER_REQUEST = 500000; // trần mỗi lần chuyển CẢ 2 CHIỀU (28/08: 90k -> 500k), chặn thiệt hại nếu có lỗi
// Chiều game -> Discord KHÔNG giới hạn: admin cầm đồ thật trong tay rồi mới duyệt,
// không có đường lợi dụng.

// Hiển thị số ván dạng 5 chữ số: 1 -> #00001
const padId = (n) => String(n).padStart(5, '0');

// --- CONFIG BẦU CUA ---
// (Bầu Cua ĐÃ GỠ HẲN 27/08 - game tắt lâu rồi, dọn cho nhẹ. Muốn dựng lại thì lục
//  git history: MASCOTS/bcState + getBCMessageData/runBầuCuaLoop/finishBCGame/
//  startBaucua/stopBaucua + các nút bc_* + card panel Bầu Cua.)

// --- CONFIG BIG SMALL ---
let txState = {
    status: 'betting',
    timeLeft: 60,
    targetTime: 0,
    bets: [],
    message: null,
    channel: null,
    gameId: Math.floor(Math.random() * 9999),
    needsUpdate: false,
    activeChoice: null,
    isProcessing: false,
    processingStart: 0,
    history: [],
    lastGameInfo: null,
    msgHistory: [],
    resultPromise: null
};
let userTXSelections = {};

// 💰 04/09: TRẦN CƯỢC Tài Xỉu mỗi NGƯỜI mỗi VÁN - cộng dồn MỌI cửa, MỌI lần đặt
// trong ván (đặt lắt nhắt nhiều lần cũng không lách được). Admin chỉnh ở panel
// (tab Big Small), lưu dbCache._txMaxBet; 0 = không giới hạn. Mặc định 400.000.
const TX_MAX_BET_DEF = 400000;
function txMaxBet() {
    const n = Number(dbCache._txMaxBet);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : TX_MAX_BET_DEF;
}
function txBetTotalOf(userId) {
    return (txState.bets || []).reduce((s, b) => s + (b.userId === userId ? (b.amount || 0) : 0), 0);
}
// Trả chuỗi lỗi nếu đặt thêm `amount` là vượt trần; null = ok. Dùng chung web + Discord.
function txCapCheck(userId, amount) {
    const cap = txMaxBet();
    if (cap <= 0) return null;
    const cur = txBetTotalOf(userId);
    if (cur + amount > cap) {
        return `Trần cược ${cap.toLocaleString()} Dogcoin/người/ván - ván này bạn đã đặt ${cur.toLocaleString()}${cap > cur ? `, còn đặt được ${(cap - cur).toLocaleString()}` : ''}.`;
    }
    return null;
}

// --- CONFIG XỔ SỐ MIỀN BẮC ---
// Bot tự quay đủ bảng 27 lô như XSMB thật, mỗi giờ 1 kỳ vào ĐÚNG ĐẦU GIỜ (giờ VN),
// khóa sổ từ phút 50. Đề = 2 số cuối giải Đặc Biệt (1 ăn XS_DE_RATE).
// Lô = số về trong bất kỳ lô nào của 27 lô, mỗi nháy ăn XS_LO_RATE lần tiền.
const XS_DE_RATE = 70;
const XS_LO_RATE = 3.5;
const XS_MAX_NUMBERS_PER_TYPE = 5;   // mỗi người tối đa 5 số đề + 5 số lô mỗi kỳ
const XS_MAX_PER_NUMBER = 1000;      // tối đa 1000 Dogcoin mỗi số
const XS_LOCK_MINUTE = 50;           // phút 50 trở đi: khóa sổ
const XS_RESULT_KEEP = 5;            // giữ 5 tin kết quả gần nhất trong kênh
// Cơ cấu giải XSMB: [tên giải, số lượng, số chữ số]
const XS_PRIZE_SPEC = [
    ['ĐB', 1, 5], ['G1', 1, 5], ['G2', 2, 5], ['G3', 6, 5],
    ['G4', 4, 4], ['G5', 6, 4], ['G6', 3, 3], ['G7', 4, 2],
];

let xsState = {
    channel: null,
    message: null,          // bảng cược (edit tại chỗ)
    status: 'stopped',      // 'betting' | 'locked' | 'stopped'
    round: dbCache._xsRound || 1,
    // bets: { userId: { name, de: {'27': 500}, lo: {'27': 300} } } - tiền đã trừ ví
    bets: (dbCache._xsBets && typeof dbCache._xsBets === 'object') ? dbCache._xsBets : {},
    // forced.de: '27' | null; mustHit/mustMiss: các số lô ép về / cấm về (một-kỳ, quay xong tự xóa)
    forced: dbCache._xsForced || { de: null, mustHit: [], mustMiss: [] },
    history: Array.isArray(dbCache._xsHistory) ? dbCache._xsHistory : [],
    resultMsgIds: Array.isArray(dbCache._xsResultMsgIds) ? dbCache._xsResultMsgIds : [],
    needsUpdate: false,
    isProcessing: false,
};

// Lịch sử các ván dò mìn (để hiển thị trên web panel)
let minesHistory = [];

// Lịch sử dò mìn giữ qua mỗi lần restart (kết quả người chơi).
if (dbCache._minesHistory) minesHistory = dbCache._minesHistory;

// Lịch sử DASHBOARD (web): CHỈ ván có người đặt, LƯU VĨNH VIỄN vào database.json
// (giữ qua restart/deploy, KHÔNG tự xóa). Khác với soi cầu Discord ở RAM bên dưới.
let txDashHistory = Array.isArray(dbCache._txDashHistory) ? dbCache._txDashHistory : [];
// 27/08: dọn 1 lần lúc boot - bản cũ lưu KHÔNG cap khiến database.json phình (57%).
// Giữ 100 ván cược gần nhất, dư cắt bỏ cho nhẹ máy chủ.
if (txDashHistory.length > 100) { txDashHistory.length = 100; dbCache._txDashHistory = txDashHistory; }

// Yêu cầu rút Dogcoin (người chơi bấm nút -> chờ admin duyệt trên dashboard).
// Trừ Dogcoin NGAY khi tạo yêu cầu (khoá số dư lại, tránh vừa xin rút vừa đem đi cược tiếp).
// "approve" = admin đã đưa Dog Coin thật trong game, chỉ đánh dấu xong (không trừ thêm).
// "reject" = hoàn lại Dogcoin đã trừ.
let withdrawRequests = Array.isArray(dbCache._withdrawRequests) ? dbCache._withdrawRequests : [];
let withdrawSeq = dbCache._withdrawSeq || 1;

// Kênh riêng để người chơi bấm nút xin rút Dogcoin (giống cơ chế kênh Bầu Cua/Big Small,
// nhưng chỉ 1 tin nhắn tĩnh, không có vòng lặp đếm giờ).
let withdrawState = { channel: null, message: null };

// Big Small: 27/08 GIỮ LỊCH SỬ qua restart - khôi phục 20 ván gần nhất (web đọc
// txState.history để vẽ "Lịch sử 20 ván"), gameId NỐI TIẾP ván cuối cho số liền mạch
// (không nhảy về #0001, không loạn soi cầu). Chỉ giữ 20 ván nên DB không phình.
txState.history = Array.isArray(dbCache._txHist20) ? dbCache._txHist20.slice(0, 20) : [];
txState.gameId = (txState.history[0] && Number(txState.history[0].gameId)) || 0;

const DICE_EMOJIS = [
    '',
    '<:1410537564418605146:1493488539642499153>',
    '<:1410537562589626368:1493488535934861523>',
    '<:1410537554276777994:1493488533468610692>',
    '<:1410537560580685866:1493488531274989628>',
    '<:1410537558823403675:1493488529219522560>',
    '<:1410537557069926470:1493488527013318657>'
];

// ===== NẶN XÍ NGẦU TRÊN WEB (Big Small) =====
// Ván TX_ROUND_S (40) giây = 25 giây đặt cược + TX_LOCK_S (15) giây nặn. Lúc khóa sổ
// xí ngầu lắc NGẦM (txState.nan), người chơi lên web tự "nặn" - kéo tờ giấy che
// tự do 4 chiều, kéo tới đâu lộ tới đó, ai kéo người đó thấy riêng. Đúng giờ mở bát:
// trả thưởng + đăng kết quả công khai ở Discord.
const TX_LOCK_S = 15;
const TX_ROUND_S = 40; // hạ 50 -> 40 (19/08): đặt cược còn 25 giây, nặn giữ nguyên 15
// BÃO = 3 viên giống nhau: chỉ cửa Bão ăn (×TX_BAO_RATE), mọi cửa thường thua sạch.
const TX_BAO_RATE = 30;
// txState.nan = { gameId, dice: [d1,d2,d3] } - chỉ tồn tại trong cửa sổ nặn

// CHÚ Ý: tên ở đây vừa để HIỂN THỊ vừa là giá trị LƯU vào lịch sử (histEntry.tx/cl
// và bets[].choice), và txHistoryLine so khớp bằng chính các tên này. Đổi tên thì
// PHẢI so sánh qua TX_CHOICES.* chứ không viết chữ cứng, kẻo cửa Bão hết được trả.
const TX_CHOICES = {
    'tai': { name: 'BIG' },
    'xiu': { name: 'SMALL' },
    'chan': { name: 'CHẴN' },
    'le': { name: 'LẺ' },
    'bao': { name: 'BÃO' }
};

async function manageHistory(state, sessionMsgs) {
    state.msgHistory.push(sessionMsgs); 
    if (state.msgHistory.length > 20) {
        const oldSession = state.msgHistory.shift();
        for (const msgId of oldSession) {
            try {
                const msg = await state.channel.messages.fetch(msgId);
                if (msg) await msg.delete().catch(() => {});
            } catch (e) {}
        }
    }
}

// ==========================================
// --- LOGIC DÒ MÌN MỚI TỐI ƯU ---
// ==========================================
// 25 ô (lưới 5×5 tròn trịa) + RTP 0.95 - chủ server chốt 20/08: "dễ ăn quá" nên
// nerf. Hai núm này cùng lúc làm HỆ SỐ KHÚC GIỮA giảm rõ (người chơi dừng-sớm-ăn-chắc
// bị chạm nhiều nhất), còn các mốc CỐ ĐỊNH (trần nổ hũ 100/200/500, trần có khiên
// 350/700) giữ nguyên. Lịch sử: 19/08 từng chạy 24 ô/RTP 1.0 theo bảng Discord cũ.
// ⚠️ /domin bản Discord (đang comment) KHÔNG bật lại được với 25 ô: 25 ô + nút DỪNG
// = 26 nút, vượt trần 25 nút/tin của Discord.
const TOTAL_TILES = 25;
const RTP = 0.95;

function nCr(n, r) {
    if (r > n) return 0;
    if (r === 0 || r === n) return 1;
    let res = 1;
    for (let i = 1; i <= r; i++) {
        res = res * (n - i + 1) / i;
    }
    return res;
}

function calculateMulti(diamonds, numMines) {
    const waysToWin = nCr(TOTAL_TILES - numMines, diamonds);
    const totalWays = nCr(TOTAL_TILES, diamonds);
    if (waysToWin === 0) return 1;
    const prob = waysToWin / totalWays;
    let multi = (1 / prob) * RTP;
    // TỰ LỰC ĂN ĐỦ, KHÔNG TRẦN (chủ server chốt CUỐI CÙNG 20/08 sau 3 lần cân
    // nhắc): mở hết bàn cực khó (12-13 mìn = 1/5,2 triệu) nên đủ may mắn thì trả
    // nguyên tỉ lệ x4,9 TRIỆU lần cược - chủ server đã nghe cảnh báo "cú đó in
    // nửa tỷ Dogcoin" và CHẤP NHẬN. Trần CHỈ nằm ở đường may mắn: nổ hũ
    // (jackpotCapOf) và khiên/⛏️ ĐÃ DÙNG (assistCapOf). Đừng thêm Math.min vào
    // đây nữa - đã thêm rồi gỡ 2 lần theo đúng lệnh chủ server.
    return Math.floor(multi * 100) / 100;
}

const getInfo = (diamonds, numMines) => {
    const maxDiamonds = TOTAL_TILES - numMines;

    if (diamonds === 0) {
        return {
            multi: 1,
            nextMulti: calculateMulti(1, numMines)
        };
    }

    return {
        multi: calculateMulti(diamonds, numMines),
        nextMulti: diamonds < maxDiamonds ? calculateMulti(diamonds + 1, numMines) : calculateMulti(diamonds, numMines)
    };
};

// Mìn bị ép bởi admin (qua web panel). Key = userId, hoặc '_any' cho người tiếp theo bất kỳ.
// Value = mảng vị trí ô (0-23) sẽ chắc chắn là mìn ở ván dò mìn kế tiếp.
let forcedMines = {};
// 09/09: admin ÉP QUÀ hộp 🍀 kế tiếp (panel SUPER, tab 💣) - để dựng kịch bản test (vd: ép khiên
// rồi cố tình đạp mìn -> ván "có trợ giúp" -> xem cảnh báo chạm trần x2000). Key = userId hoặc
// '_any'; dùng đúng 1 lần rồi xoá. Quà không có trong bàn quay của trò đó thì bỏ qua (quay thường).
let forcedLucky = {};
function takeForcedLucky(userId, wheel) {
    const key = forcedLucky[userId] ? userId : (forcedLucky['_any'] ? '_any' : null);
    if (!key) return null;
    const prize = forcedLucky[key];
    delete forcedLucky[key];
    if (!wheel.some(w => w.prize === prize)) return null;
    writeLog('ADMIN', `[ÉP HỘP 🍀] ${key === '_any' ? 'Người tiếp theo' : 'User ' + userId} -> hộp kế tiếp ra "${prize}"`);
    return prize;
}

const createGame = (numMines, userId) => {
    let mines = [];

    // Ưu tiên layout ép riêng cho user, rồi tới layout ép chung (_any)
    let forced = null, forcedKey = null;
    if (userId && Array.isArray(forcedMines[userId]) && forcedMines[userId].length) {
        forced = forcedMines[userId]; forcedKey = userId;
    } else if (Array.isArray(forcedMines['_any']) && forcedMines['_any'].length) {
        forced = forcedMines['_any']; forcedKey = '_any';
    }

    if (forced) {
        for (const p of forced) {
            if (mines.length >= numMines) break;
            if (Number.isInteger(p) && p >= 0 && p < TOTAL_TILES && !mines.includes(p)) mines.push(p);
        }
        delete forcedMines[forcedKey];
        writeLog('ADMIN', `[ÉP DÒ MÌN] ${forcedKey === '_any' ? 'Người tiếp theo' : 'User ' + userId} - ván tới mìn ép tại: [${forced.join(',')}] (numMines=${numMines})`);
    }

    while (mines.length < numMines) {
        let r = Math.floor(Math.random() * TOTAL_TILES);
        if (!mines.includes(r)) mines.push(r);
    }
    return { mines, revealed: [], totalMines: numMines };
};

// ===== DÒ MÌN TRÊN WEB =====
// Ván đang chơi giữ trong RAM, mỗi người tối đa 1 ván. TIỀN TÍNH HOÀN TOÀN Ở ĐÂY:
// client chỉ vẽ lại những gì server trả về. Không bao giờ tin số client gửi lên -
// nếu để client tự tính thưởng thì sửa JS là tự cộng tiền.
const webMines = new Map(); // userId -> { mines, revealed[], totalMines, bet, name }

// Ván VỪA XONG của mỗi người, giữ lại để màn kết thúc (lộ hết mìn) không biến mất:
// người chơi xem bao lâu tùy thích, thoát ra vào lại vẫn thấy, tới khi bấm "VÁN MỚI".
const webMinesLast = new Map();
function setMinesLast(userId, g, result, amount, hitIdx) {
    // Cộng tiền hộp 🍀 đã trả GIỮA ván (💰 lì xì / 🏆 hũ) vào net - không cộng thì
    // ván nổ hũ hiện "Thắng 68" trong khi ví nhận thêm cả nghìn.
    amount += (g.bonus || 0);
    webMinesLast.set(userId, {
        result, amount, bet: g.bet, totalMines: g.totalMines,
        revealed: g.revealed.slice(), mines: g.mines.slice(),
        hit: (hitIdx === undefined ? -1 : hitIdx),
        multi: calculateMulti(g.revealed.length, g.totalMines),
        // lộ ô 🍀 chưa mở + các ô mìn khiên đã đỡ, để màn kết thúc vẽ lại đúng
        lucky: (g.lucky || []).slice(),   // các ô 🍀 CHƯA mở (đã mở là bị filter khỏi g.lucky rồi)
        defused: (g.defused || []).slice(),
    });
}

// ⚠️ HAI CÁI TRẦN NÀY ĐANG TẮT (= 0) theo yêu cầu chủ server: hệ số y hệt sòng thật,
// không cắt gì. Đặt số > 0 là bật lại ngay, không cần sửa chỗ nào khác.
//
// Rủi ro đã biết khi để 0 - nếu thấy Dogcoin lạm phát thì đây là chỗ siết đầu tiên:
//   5 mìn mở 15 ô  = tỉ lệ 1/211  -> x204   (chơi vài trăm ván là có người trúng)
//   12 mìn mở 8 ô  = tỉ lệ 1/840  -> x815
// RTP 0.95 chỉ đảm bảo nhà cái lãi sau HÀNG CHỤC NGHÌN ván; server nhỏ có thể
// dính một cú trả lớn trước khi tới đó.
const MINES_MAX_WIN = 0; // 0 = không giới hạn tiền nhận 1 ván
const MINES_MAX_BET = 0; // 0 = không giới hạn tiền cược 1 ván

// Ván trả từ mức này trở lên thì ghi log cảnh báo, để còn biết mà phản ứng sớm
// thay vì phát hiện khi ví cả server đã phình. Xem: log_result.txt / log_admin.txt
const MINES_BIG_WIN_ALERT = 50000;

// Thưởng thực nhận = bet × hệ số (cắt theo trần nếu trần đang bật).
function minesWin(bet, diamonds, numMines) {
    const raw = Math.floor(bet * calculateMulti(diamonds, numMines));
    return MINES_MAX_WIN > 0 ? Math.min(raw, MINES_MAX_WIN) : raw;
}

// Bot restart là mất ván đang chơi (RAM). Tiền cược đã trừ lúc bắt đầu nên phải HOÀN
// khi khôi phục lại, chứ không được im lặng nuốt. Ván treo quá 2 tiếng cũng tự hoàn.
function webMinesRefundStale() {
    const now = Date.now();
    for (const [uid, g] of webMines) {
        if (now - (g.startedAt || 0) > 2 * 3600 * 1000) {
            updatePoints(uid, g.bet);
            webMines.delete(uid);
            delete minesPending()[uid];
            writeLog('SYSTEM', `[WEB DÒ MÌN] Hoàn ${g.bet} cho ${g.name || uid} - ván treo quá 2 tiếng`);
        }
    }
}
setInterval(webMinesRefundStale, 10 * 60 * 1000);

function webMinesLog(g, result, amount, hitIdx) {
    // Cộng tiền hộp 🍀 đã trả GIỮA ván (💰/🏆) vào net của lịch sử + bảng Discord.
    amount += (g.bonus || 0);
    const entry = {
        name: g.name, bet: g.bet, mines: g.totalMines, diamonds: g.revealed.length,
        result, amount, time: new Date().toLocaleTimeString('vi-VN'),
        // Số dư SAU KHI đã trả thưởng (mọi chỗ gọi hàm này đều updatePoints trước) -
        // chốt lại tại thời điểm đó, không tra lúc vẽ bảng vì số dư sẽ trôi.
        bal: g.userId ? (getUserData(g.userId).points || 0) : null,
        luck: (g.luck || []).slice(),   // 🍀 các phần thưởng đã quay trúng ván này
        // giữ lại bàn cờ để vẽ lại y như bảng dò mìn cũ trong Discord
        board: { open: g.revealed.slice(), bombs: g.mines.slice(), hit: (hitIdx === undefined ? -1 : hitIdx) },
    };
    minesHistory.unshift(entry);
    if (minesHistory.length > 20) minesHistory.pop();
    minesBoard.needsUpdate = true;        // bảng đăng lại (tối đa 1 phút/lần, xem repostBoard)
    statAdd(g.userId, 'mines', amount);   // net ván này cho bảng 📊
    // Trần đang tắt nên một ván có thể trả rất lớn - hú còi để admin biết ngay.
    if (amount >= MINES_BIG_WIN_ALERT) {
        writeLog('ADMIN', `[⚠️ DÒ MÌN TRẢ LỚN] ${g.name} +${amount.toLocaleString()} Dogcoin ` +
            `(cược ${g.bet.toLocaleString()}, ${g.totalMines} mìn, mở ${g.revealed.length} ô, ` +
            `hệ số x${calculateMulti(g.revealed.length, g.totalMines)})`);
    }
}

// ===== Ô MAY MẮN 🍀 (dùng chung Dò Mìn + Leo Thang) =====
// Chạm ô 🍀 -> quay ngẫu nhiên 1 phần thưởng. Ô 🍀 GIẤU (không hiện trên bàn):
// hiện là lộ ô an toàn, ai cũng bấm nó đầu tiên thành vòng quay miễn phí mỗi ván.
// Ô "hụt" 🍂 CỐ TÌNH có: nó là van chỉnh kỳ vọng - sòng chảy máu thì tăng % hụt.
// 'jackpot' = 🏆 NỔ HŨ: ăn min(giải cao nhất của ván, x2000 cược).
// ⚠️ CẢNH BÁO KINH TẾ: hũ 5% × trần x2000 nghĩa là mỗi lượt mở hộp cõng kỳ vọng
// ~x100 tiền cược ở ván mìn nhiều/lửa cao. Ví cả server SẼ phình nhanh.
// Muốn hãm lại chỉ cần hạ số 0.05 bên dưới (và nâng 'none' lên tương ứng).
// Cân theo chủ server chốt (19/08): hũ 5% · hụt 20% · lì xì 40% · khiên 20% ·
// đào/tên lửa 15% (quà đẩy tiến độ nặng kinh tế hơn nên hiếm hơn khiên).
const MINES_LUCKY_WHEEL = [
    { p: 0.15, prize: 'shield' },   // 🛡️ trúng mìn 1 lần không chết (cộng dồn)
    { p: 0.15, prize: 'dig' },      // ⛏️ mở ngay 1–2 ô an toàn ngẫu nhiên
    { p: 0.46, prize: 'cash' },     // 💰 +30% tiền cược tức thì
    { p: 0.23, prize: 'none' },     // 🍂 hụt (nhận phần dư mỗi lần hạ tỉ lệ hũ)
    { p: 0.01, prize: 'jackpot' },  // 🏆 NỔ HŨ (hạ 5% -> 3% -> 2% -> 1% ngày 21/08)
];
const STAIRS_LUCKY_WHEEL = [
    { p: 0.15, prize: 'rocket' },   // 🚀 thang máy: +2 tầng ngay
    { p: 0.20, prize: 'shield' },   // 🛡️ đạp lửa 1 lần không cháy
    { p: 0.40, prize: 'cash' },     // 💰 +30% tiền cược tức thì
    { p: 0.24, prize: 'none' },     // 🍂 hụt (nhận phần dư mỗi lần hạ tỉ lệ hũ)
    { p: 0.01, prize: 'jackpot' },  // 🏆 NỔ HŨ (hạ 5% -> 3% -> 2% -> 1% ngày 21/08)
];
// Ô VÀNG 🌟 Leo Thang: 2% ván MỚI xuất hiện, HIỆN RÕ trên bàn ở tầng 5–8 - thấy mà
// thèm, phải sống sót leo tới mới đạp được; đạp là lên thẳng đỉnh. Mọi mức lửa đều
// có thể ra ô vàng: ván lửa cao không sập sòng nhờ TRẦN x2000 bên dưới.
const STAIRS_GOLDEN_RATE = 0.02;

// TRẦN THƯỞNG x2000 tiền cược - CHỈ áp cho ván ĂN NHỜ ô may mắn (🚀/🌟/⛏️ hoặc
// khiên ĐÃ dùng để thoát chết). Tự lực 100% thì trả đủ như bảng - cày thật ăn thật.
// Lý do: một cú nhảy 🌟 trong ván 5 lửa ăn nguyên x17k là bơm lạm phát cả server.
const LUCKY_WIN_CAP_MULTI = 2000;

// ===== 🏆 HŨ NUÔI: MỖI TRÒ MỘT HŨ RIÊNG, chung MỘT tỉ lệ nổ =====
// (chủ server chốt 20/08, bản 3 - bản 2 gộp 1 hũ đã bỏ)
//
//  - 3 hũ riêng: 'mines' (Dò Mìn) · 'stairs' (Leo Thang) · 'gacha' (quay Pal).
//    Nổ ở trò nào ăn hũ trò đó, hũ 2 trò kia không suy suyển.
//  - NUÔI: mỗi ván/lượt quay trích LUCKY_POT_RATE (5%) tiền cược, nhưng KHÔNG THU
//    THÊM của người chơi - cược 100 vẫn trừ đúng 100; khoản nuôi là NHÀ CÁI BAO
//    (lấy từ phần RTP đang giữ). Tự trích DỪNG khi hũ chạm LUCKY_POT_MAX (20.000).
//  - ADMIN nạp tay thì KHÔNG bị trần 20.000 (chủ server muốn mồi hũ to hơn được);
//    chỉ chặn không cho âm.
//  - MỘT TỈ LỆ NỔ DUY NHẤT: POT_HIT_RATE = 1%, đúng bằng ô 🏆 của 2 bàn quay hộp
//    may mắn. Minigame: trúng 🏆 = trần hũ của ván + NGUYÊN hũ trò đó. Quay Pal:
//    mỗi lượt tự bốc 1% ăn nguyên hũ gacha (gacha không có hộp để bấm).
const LUCKY_POT_RATE = 0.05;
const LUCKY_POT_MAX = 20000;      // trần TỰ TRÍCH mỗi hũ (admin nạp tay vượt được)
const POT_HIT_RATE = 0.01;        // = p của 'jackpot' trong MINES/STAIRS_LUCKY_WHEEL
// SÀN CƯỢC BẮT BUỘC của 2 minigame (chủ server chốt 21/08): cược dưới mức này là
// server TỪ CHỐI ván luôn. Trước đó làm kiểu "cược dưới 200 thì vẫn chơi được nhưng
// không ăn hũ" - chủ server bảo không phải vậy, phải BUỘC đặt tối thiểu 200.
// Nhờ vậy mọi ván đều đủ điều kiện nuôi/ăn hũ, không cần cửa xét riêng nữa.
const MIN_BET = 400;   // 26/08: 200 -> 400 (Big Small không dính sàn này) - 09/09: chỉ còn là MẶC ĐỊNH, số thật ở minBet()
// 🎚️ 09/09: sàn cược Dò Mìn + Leo Thang admin chỉnh ở panel tab 👥 (lưu dbCache._minBet), chủ server muốn hạ về 100.
function minBet() { const v = Number(dbCache._minBet); return Number.isFinite(v) && v >= 1 ? Math.floor(v) : MIN_BET; }
function setMinBet(v) {
    const n = Math.floor(Number(v));
    if (!(n >= 1 && n <= 10000000)) return { error: 'Sàn cược phải từ 1 đến 10.000.000' };
    dbCache._minBet = n; saveDbNow();
    writeLog('ADMIN', `[SÀN CƯỢC] Panel đặt cược tối thiểu Dò Mìn/Leo Thang = ${n.toLocaleString()}`);
    return { ok: true, minBet: n };
}
// Nổ hũ xong hũ KHÔNG về 0 mà về mức mồi này, để người vào sau không thấy hũ rỗng
// (chủ server: "về 0 thì bất công"). Nhà cái bao khoản mồi này mỗi lần nổ.
// 26/08: mồi + trần TÁCH THEO TỪNG HŨ - Dò Mìn/Leo Thang mồi 5.000 trần nuôi 50.000,
// hũ Quay Pal giữ 1.500/20.000 như cũ.
const POT_SEED = 1500;            // (giữ cho chỗ nào chưa theo key - gacha dùng mức này)
const POT_SEED_BY = { mines: 5000, stairs: 5000, gacha: 1500 };
const LUCKY_POT_MAX_BY = { mines: 50000, stairs: 50000, gacha: 20000 };
const potSeed = (key) => POT_SEED_BY[key] !== undefined ? POT_SEED_BY[key] : POT_SEED;
const potMax = (key) => LUCKY_POT_MAX_BY[key] !== undefined ? LUCKY_POT_MAX_BY[key] : LUCKY_POT_MAX;
const POT_KEYS = ['mines', 'stairs', 'gacha'];
const POT_LABEL = { mines: '💣 Dò Mìn', stairs: '🪜 Leo Thang', gacha: '🎲 Quay Pal' };
// ===== 🏆 NỔ HŨ = BỘI SỐ TIỀN CƯỢC (09/09, chủ server chốt lần cuối) - chỉ Dò Mìn + Leo Thang =====
// BỎ HẲN hũ nuôi ở 2 minigame (không trích 5%, không hiện hũ, không trần hũ). Trúng 🏆 trong
// hộp 🍀 -> bốc NGẪU NHIÊN 1 bội số trong danh sách (mặc định x10 / x15 / x20) nhân với tiền
// cược, CỘNG trần ván như cũ (jackpotCapOf - "ăn toàn bộ ô của bàn, có trần khi có trợ giúp"),
// ván DỪNG NGAY. Danh sách bội số panel SUPER chỉnh được (tab 💣), lưu dbCache._potCfg[key].mults.
// Tiền hũ cũ còn trong dbCache._pots.mines/stairs KHÔNG dùng nữa (admin muốn thì rút tay
// bằng adminPotAdd số âm). Hũ Quay Pal (gacha) GIỮ NGUYÊN luật nuôi 5%/nổ 1%/ẵm nguyên.
// Lịch sử 09/09: (1) đề xuất chia % hũ theo cược -> (2) ăn x10 cược từ hũ, hũ vô hạn ->
// (3) bản này: bỏ hũ, bội số ngẫu nhiên. Kinh tế: kỳ vọng thưởng thêm mỗi hộp = 1% x 15 x cược
// = 15% cược, nhà cái bao thẳng (không còn quỹ nuôi) - chủ server đã nghe và chấp nhận.
const POT_CFG_KEYS = ['mines', 'stairs'];
const POT_MULTS_DEF = [10, 15, 20];
function potCfg(key) {
    const all = dbCache._potCfg && typeof dbCache._potCfg === 'object' ? dbCache._potCfg : {};
    const c = all[key] && typeof all[key] === 'object' ? all[key] : {};
    const m = Array.isArray(c.mults) ? c.mults.map(Number).filter(x => Number.isFinite(x) && x >= 1 && x <= 1000) : [];
    return { mults: m.length ? m : POT_MULTS_DEF.slice() };
}
// o.mults: mảng số hoặc chuỗi "10,15,20" (1-6 bội số, mỗi số 1-1000, tự sắp tăng, bỏ trùng)
function setPotCfg(key, o) {
    if (!POT_CFG_KEYS.includes(key)) return { error: 'Trò này không có luật bội số nổ hũ' };
    const raw = o && o.mults !== undefined ? o.mults : null;
    const arr = Array.isArray(raw) ? raw : String(raw || '').split(/[,\s;\/x]+/);
    const mults = [...new Set(arr.map(v => Math.floor(Number(v) * 100) / 100).filter(x => Number.isFinite(x) && x >= 1 && x <= 1000))].sort((a, b) => a - b);
    if (!mults.length || mults.length > 6) return { error: 'Nhập 1-6 bội số, mỗi số từ 1 đến 1000 (vd: 10,15,20)' };
    if (!dbCache._potCfg || typeof dbCache._potCfg !== 'object') dbCache._potCfg = {};
    dbCache._potCfg[key] = { mults };
    saveDbNow();
    writeLog('ADMIN', `[NỔ HŨ ${POT_LABEL[key]}] Panel đổi bội số: trúng 🏆 bốc ngẫu nhiên x${mults.join(' / x')} tiền cược`);
    return { ok: true, key, cfg: potCfg(key) };
}

function potBook() {
    if (!dbCache._pots || typeof dbCache._pots !== 'object') dbCache._pots = {};
    // chuyển tiền từ bản 1 hũ chung (nếu có) sang hũ Dò Mìn, chạy đúng 1 lần
    if (dbCache._luckyPot) {
        dbCache._pots.mines = (dbCache._pots.mines || 0) + dbCache._luckyPot;
        delete dbCache._luckyPot;
    }
    // hũ mới lập thì mồi sẵn POT_SEED cho khỏi rỗng ngay từ đầu
    for (const k of POT_KEYS) if (typeof dbCache._pots[k] !== 'number') dbCache._pots[k] = potSeed(k);
    return dbCache._pots;
}
function potGet(key) { return potBook()[key] || 0; }
// Phần được phép trích thêm vào hũ này (hũ đã quá trần thì 0)
function luckyPotCut(key, bet) {
    if (POT_CFG_KEYS.includes(key)) return 0;   // 09/09: Dò Mìn/Leo Thang BỎ hũ nuôi - không trích
    return Math.max(0, Math.min(Math.floor(bet * LUCKY_POT_RATE), potMax(key) - potGet(key)));
}
function potFeed(key, cut) {
    if (cut > 0) potBook()[key] = potGet(key) + cut;
    return potGet(key);
}
// Người nổ ẵm nguyên hũ, hũ đặt lại về mức mồi POT_SEED (không về 0).
// (Không còn xét cược tối thiểu ở đây: sàn cược MIN_BET đã chặn ngay lúc start.)
function luckyPotPop(key) {
    const pot = potGet(key);
    potBook()[key] = potSeed(key);
    return pot;
}
// 🏆 NỔ HŨ = bốc 1 bội số ngẫu nhiên trong danh sách (đều nhau) nhân tiền cược (09/09).
// Tốn đúng 1 Math.random() SAU khi đã quay hộp + 3 hàng mẫu (test đẩy RQ theo thứ tự này).
// Trả { mult, win, mults }.
function jackpotMult(key, bet) {
    const { mults } = potCfg(key);
    const mult = mults[Math.min(mults.length - 1, Math.floor(Math.random() * mults.length))];
    return { mult, win: Math.max(0, Math.floor((Number(bet) || 0) * mult)), mults };
}
// Admin cộng/trừ tay từng hũ (số âm = rút bớt). KHÔNG chặn trần, chỉ chặn âm.
function adminPotAdd(key, amount) {
    if (!POT_KEYS.includes(key)) return { error: 'Hũ không hợp lệ' };
    const n = Math.floor(Number(amount) || 0);
    if (!n) return { error: 'Nhập số khác 0 (số âm = rút bớt hũ)' };
    const before = potGet(key);
    potBook()[key] = Math.max(0, before + n);
    writeLog('ADMIN', `[HŨ ${POT_LABEL[key]}] Panel ${n > 0 ? 'nạp' : 'rút'} ${Math.abs(n).toLocaleString()} - hũ ${before.toLocaleString()} -> ${potGet(key).toLocaleString()}`);
    saveDbNow();
    if (key === 'gacha' && typeof withdrawBoardRefresh === 'function') withdrawBoardRefresh();
    return { ok: true, key, pot: potGet(key), max: potMax(key) };
}
// Thông báo nổ hũ vào kênh bảng của game (kênh chưa set thì thôi, lỗi cũng kệ)
function potAnnounce(chId, text, tagId) {
    if (!chId) return;
    client.channels.fetch(chId)
        .then(ch => ch && ch.send({ content: text, allowedMentions: { users: tagId ? [tagId] : [] } }))
        .catch(() => {});
}
function luckyAssisted(g) {
    return (g.luck || []).some(x => x === '🚀' || x === '🌟' || x === '⛏️')
        || (g.defused || []).length > 0 || (g.burned || []).length > 0;
}
// Hai TRẦN may mắn riêng cho Dò Mìn - CHỐT CUỐI của chủ server 20/08:
// - Trần NỔ HŨ 🏆:  3 mìn ×50 · 4 mìn ×100 · 5 mìn ×200 · 6+ không can thiệp (×2000)
// - Trần THẮNG CUỐI VÁN khi TRỢ GIÚP ĐÃ DÙNG (khiên đỡ mìn/⛏️): 3 mìn ×100 ·
//   4 mìn ×300 · 5 mìn ×500 · 6+ không can thiệp (×2000).
// Tự lực (khiên chưa dùng cũng tính tự lực) trả đủ theo bảng, chỉ đụng trần tuyệt
// đối ×2000 trong calculateMulti. Leo Thang giữ ×2000 cho cả hai.
function jackpotCapOf(g) {
    if (g.totalMines === undefined) return LUCKY_WIN_CAP_MULTI;   // Leo Thang
    if (g.totalMines <= 3) return 50;
    if (g.totalMines === 4) return 100;
    if (g.totalMines === 5) return 200;
    return LUCKY_WIN_CAP_MULTI;
}
function assistCapOf(g) {
    if (g.totalMines === undefined) return LUCKY_WIN_CAP_MULTI;   // Leo Thang
    if (g.totalMines <= 3) return 100;
    if (g.totalMines === 4) return 300;
    if (g.totalMines === 5) return 500;
    return LUCKY_WIN_CAP_MULTI;
}
// 09/09: liệt kê trợ giúp ĐÃ DÙNG trong ván để câu cảnh báo nói đúng lý do bị trần
// ("mở được nhờ KHIÊN đỡ mìn nên chỉ thưởng tối đa x2000"). Rỗng = ván tự lực.
function assistWhyOf(g) {
    const why = [];
    if ((g.defused || []).length) why.push('KHIÊN đỡ mìn');
    if ((g.burned || []).length) why.push('KHIÊN đỡ lửa');
    if ((g.luck || []).includes('⛏️')) why.push('MÁY ĐÀO mở ô');
    if ((g.luck || []).includes('🚀')) why.push('THANG MÁY');
    if ((g.luck || []).includes('🌟')) why.push('Ô VÀNG');
    return why.join(' + ');
}
function capIfAssisted(g, win) {
    return luckyAssisted(g) ? Math.min(win, g.bet * assistCapOf(g)) : win;
}

function spinWheel(wheel) {
    let r = Math.random();
    for (const w of wheel) { r -= w.p; if (r < 0) return w.prize; }
    return wheel[wheel.length - 1].prize;
}

// ⏸️ 09/09: công tắc MỞ/ĐÓNG Dò Mìn + Leo Thang (panel SUPER, tab 💣). Đóng = không cho vào ván
// MỚI; ván đang chơi vẫn chơi nốt/dừng được (không nuốt tiền ai). Lưu dbCache._gameOpen.
// (Phi Thuyền / Vòng quay Pal / Cổ phiếu / Big Small đã có công tắc riêng từ trước.)
function gameOpen(key) { const o = dbCache._gameOpen; return !(o && typeof o === 'object' && o[key] === false); }
function setGameOpen(key, on) {
    if (!['mines', 'stairs'].includes(key)) return { error: 'Trò không hợp lệ' };
    if (!dbCache._gameOpen || typeof dbCache._gameOpen !== 'object') dbCache._gameOpen = {};
    dbCache._gameOpen[key] = !!on;
    saveDbNow();
    writeLog('ADMIN', `[${key === 'mines' ? '💣 DÒ MÌN' : '🪜 LEO THANG'}] Panel ${on ? 'MỞ' : 'ĐÓNG'} trò`);
    return { ok: true, key, open: !!on };
}

const webMinesApi = {
    tiles: TOTAL_TILES,
    potMults: () => potCfg('mines').mults,   // 🏆 09/09: bội số nổ hũ (hết hũ nuôi ở Dò Mìn)
    open: () => gameOpen('mines'),   // ⏸️ công tắc panel
    minBet: () => minBet(),   // 09/09 getter - panel đổi là web thấy ngay
    maxWin: MINES_MAX_WIN,
    maxBet: MINES_MAX_BET,
    // Bảng hệ số để client hiện trước khi đặt - tính ở server nên client không bịa được.
    table: (numMines) => {
        const max = TOTAL_TILES - numMines;
        const rows = [];
        for (let d = 1; d <= max; d++) rows.push(calculateMulti(d, numMines));
        return rows;
    },
    last: (userId) => webMinesLast.get(userId) || null,
    dismiss: (userId) => { webMinesLast.delete(userId); return { ok: true }; },
    current: (userId) => {
        const g = webMines.get(userId);
        // (bản dò mìn)
        if (!g) return null;
        const info = getInfo(g.revealed.length, g.totalMines);
        // ván có trợ giúp 🍀 thì số hiện trên nút NHẬN TIỀN cũng phải theo trần x2000
        const raw = capIfAssisted(g, Math.floor(g.bet * info.multi));
        return {
            bet: g.bet, totalMines: g.totalMines, revealed: g.revealed.slice(),
            maxDiamonds: TOTAL_TILES - g.totalMines,
            multi: info.multi, nextMulti: info.nextMulti,
            cashout: MINES_MAX_WIN > 0 ? Math.min(raw, MINES_MAX_WIN) : raw,
            capped: MINES_MAX_WIN > 0 && raw > MINES_MAX_WIN, // web nói rõ "chạm trần", đỡ tưởng bị ăn bớt
            // 09/09: ván CÓ TRỢ GIÚP (khiên đã đỡ/⛏️/🏆) mà hệ số đã tới trần -> web cảnh báo "mở thêm không tăng tiền"
            assistCap: assistCapOf(g),
            assistCapHit: luckyAssisted(g) && Math.floor(g.bet * info.multi) >= g.bet * assistCapOf(g),
            assistWhy: assistWhyOf(g),   // "khiên đỡ mìn" / "máy đào mở ô" - web ghép vào câu cảnh báo
            shield: g.shield || 0,                 // 🛡️ số khiên đang cầm (cộng dồn được)
            defused: (g.defused || []).slice(),    // các ô mìn đã bị khiên đỡ (hiện 🛡️)
            luckyPick: !!g.luckyPending,           // đang chờ chọn 1 trong 4 hộp 🍀
            jpPick: !!g.jpPending, jpMults: g.jpPending ? potCfg('mines').mults : undefined,   // 🏆 09/09 v2: đang chờ chọn hộp bội số
            // Chỉ đẩy SỐ LƯỢNG ô 🍀, KHÔNG lộ g.lucky - lộ vị trí là lộ luôn ô an toàn.
            // Có số này thì web nói được "ván này 2 ô 🍀", hết cảnh mua cỏ rồi tưởng bị mất.
            luckyTotal: g.luckyTotal || (g.lucky || []).length,
            luckyLeft: (g.lucky || []).length,
            extraLucky: !!g.fee,                   // ván này CÓ trả phí mua cỏ thêm hay không
        };
    },
    // 3–20 mìn: chặn ván 1–2 mìn gần như không rủi ro (khiên thành bất tử) và ván
    // 21+ mìn toàn cầu may. minMines/maxMines đẩy xuống client để đồng bộ 1 nguồn.
    minMines: 3,
    maxMines: 20,
    start: (userId, name, numMines, bet, extraLucky) => {
        if (webMines.has(userId)) return { error: 'Bạn đang có ván dở - chơi nốt hoặc bấm DỪNG đã.' };
        if (!gameOpen('mines')) return { error: '⛔ Dò Mìn đang ĐÓNG bảo trì - admin sẽ mở lại sau' };
        if (!Number.isInteger(numMines) || numMines < webMinesApi.minMines || numMines > webMinesApi.maxMines) {
            return { error: `Số mìn phải từ ${webMinesApi.minMines} đến ${webMinesApi.maxMines}` };
        }
        if (!Number.isInteger(bet) || bet <= 0) return { error: 'Số Dogcoin không hợp lệ' };
        if (bet < minBet()) return { error: `Cược tối thiểu ${minBet().toLocaleString()} Dogcoin mỗi ván` };
        if (MINES_MAX_BET > 0 && bet > MINES_MAX_BET) return { error: `Cược tối đa ${MINES_MAX_BET.toLocaleString()} Dogcoin mỗi ván` };
        // 🍀 09/09 (chủ server chốt): KHÔNG còn cỏ miễn phí - muốn cỏ phải MUA,
        // phí 20% tiền cược, TỐI ĐA 1 ô/ván. (Luật cũ 20/08: 1 free + mua thêm 1.)
        const fee = extraLucky ? Math.floor(bet * 0.2) : 0;
        // 🏆 nuôi hũ RIÊNG của Dò Mìn: trích 5% cược, KHÔNG thu thêm (nhà cái bao)
        const potCut = luckyPotCut('mines', bet);
        const me = getUserData(userId);
        if ((me.points || 0) < bet + fee) {
            return { error: `Không đủ Dogcoin! Cần ${(bet + fee).toLocaleString()}${fee ? ` (${bet.toLocaleString()} cược + ${fee.toLocaleString()} phí cỏ thêm)` : ''} - số dư: ${(me.points || 0).toLocaleString()}` };
        }

        // Tạo ván TRƯỚC rồi mới trừ tiền: createGame lỗi thì người chơi không mất gì.
        const g = createGame(numMines, userId);
        g.bet = bet; g.name = name; g.startedAt = Date.now();
        g.userId = userId;   // để lúc ghi lịch sử tra được số dư còn lại
        g.fee = fee;         // phí cỏ thêm - tính vào net của lịch sử cuối ván
        // Ô 🍀 giấu trên ô AN TOÀN; 09/09: CHỈ có khi mua (tối đa 1 ô), dùng 1 lần.
        // Ép số khi so với mìn: layout ép từ panel có thể chứa chuỗi ("5" thay vì 5),
        // so lệch kiểu là ô 🍀 rơi trúng ô mìn ngay.
        const mineSet = new Set(g.mines.map(Number));
        const safes = [];
        for (let i = 0; i < TOTAL_TILES; i++) if (!mineSet.has(i)) safes.push(i);
        const wantLucky = extraLucky ? 1 : 0;
        g.lucky = [];
        while (g.lucky.length < wantLucky && safes.length > g.lucky.length) {
            const pick = safes[Math.floor(Math.random() * safes.length)];
            if (!g.lucky.includes(pick)) g.lucky.push(pick);
        }
        g.luckyTotal = g.lucky.length;   // giữ số ban đầu để web hiện "ván này N ô 🍀"
        g.shield = 0; g.defused = []; g.luck = []; g.luckyPending = false;
        webMines.set(userId, g);
        webMinesLast.delete(userId); // vào ván mới thì bỏ màn kết thúc cũ
        updatePoints(userId, -(bet + fee));
        potFeed('mines', potCut);   // nhà cái bao, KHÔNG trừ người chơi
        minesPending()[userId] = bet + fee; // restart giữa ván -> hoàn lại cả cược lẫn phí cỏ
        writeLog('BET', `[WEB DÒ MÌN] ${name} cược ${bet}${fee ? ` + ${fee} phí cỏ` : ''} | ${numMines} mìn | ${wantLucky} ô 🍀${potCut ? ` | hũ mìn +${potCut} = ${potGet('mines')}` : ''}`);
        return { ok: true, balance: getUserData(userId).points || 0, state: webMinesApi.current(userId) };
    },
    reveal: (userId, idx) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!Number.isInteger(idx) || idx < 0 || idx >= TOTAL_TILES) return { error: 'Ô không hợp lệ' };
        if (g.revealed.includes(idx)) return { error: 'Ô này mở rồi' };

        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        if (g.jpPending) return { error: 'Chọn 1 hộp NỔ HŨ đã!' };
        if ((g.defused || []).includes(idx)) return { error: 'Ô này khiên đỡ rồi - chọn ô khác' };

        if (g.mines.includes(idx)) {
            // 🛡️ Có khiên: quả mìn XỊT, hiện ra trên bàn, ĐỨNG YÊN chơi tiếp.
            // Không tính là ô an toàn (không nhảy hệ số) - khiên cứu mạng, không in tiền.
            if (g.shield > 0) {   // khiên CỘNG DỒN (fix 20/08: trước là boolean, khiên thứ 2 mất trắng)
                g.shield--;
                g.defused.push(idx);
                writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🛡️ khiên đỡ mìn ô ${idx} - chơi tiếp`);
                return { ok: true, hit: false, defused: idx, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
            }
            webMines.delete(userId);
            delete minesPending()[userId];
            webMinesLog(g, 'Trúng mìn (Thua)', -(g.bet + (g.fee || 0)), idx);
            setMinesLast(userId, g, 'Trúng mìn (Thua)', -(g.bet + (g.fee || 0)), idx);
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} BÙM ở ô ${idx} - mất ${g.bet}`);
            // Tiền đã trừ từ lúc bắt đầu, thua thì không trừ thêm lần nữa.
            // luckyAt: lộ các ô 🍀 chưa kịp mở cho người chơi tiếc chơi ván nữa
            return { ok: true, hit: true, mines: g.mines, luckyAt: (g.lucky || []), balance: getUserData(userId).points || 0 };
        }

        g.revealed.push(idx);

        // 🍀 Mở trúng CỎ 4 LÁ (vẫn tính 1 ô an toàn như thường) -> DỪNG lại, hiện 4 hộp
        // cho người chơi tự chọn. Phần thưởng quyết định lúc CHỌN (luckyPick) ở server -
        // 4 hộp là sân khấu, không có gì cho client gian lận.
        if ((g.lucky || []).includes(idx)) {
            g.lucky = g.lucky.filter(i => i !== idx);   // mỗi ô 🍀 dùng đúng 1 lần
            g.luckyPending = true;
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🍀 mở trúng cỏ 4 lá - đang chọn hộp`);
            return { ok: true, hit: false, luckyPick: true, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
        }

        const lucky = null;
        const maxDiamonds = TOTAL_TILES - g.totalMines;
        if (g.revealed.length >= maxDiamonds) {
            const raw = minesWin(g.bet, maxDiamonds, g.totalMines);
            const win = capIfAssisted(g, raw);   // ăn nhờ 🍀 -> trần x2000; tự lực -> đủ
            webMines.delete(userId);
            delete minesPending()[userId];
            updatePoints(userId, win);
            webMinesLog(g, 'Jackpot', win - g.bet - (g.fee || 0));
            setMinesLast(userId, g, 'Jackpot', win - g.bet - (g.fee || 0));
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} JACKPOT - nhận ${win}${win < raw ? ` (kịch khung x${assistCapOf(g)} vì có trợ giúp 🍀)` : ''}`);
            return { ok: true, hit: false, jackpot: true, win, luckCapped: win < raw, mines: g.mines, lucky, balance: getUserData(userId).points || 0 };
        }
        return { ok: true, hit: false, lucky, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
    },
    // Chọn 1 trong 4 hộp sau khi mở trúng cỏ 4 lá. box chỉ là sân khấu - phần thưởng
    // quay ngẫu nhiên tại đây, người chơi chọn hộp nào cũng cùng phân phối.
    // 🏆 09/09 v2: chọn 1 trong N hộp bội số sau khi trúng 🏆. Hộp chỉ là sân khấu - bội số bốc
    // ngẫu nhiên tại đây (jackpotMult, đều nhau), N-1 hộp kia lật ra các bội số còn lại (trộn).
    // Trả trần ván (jackpotCapOf) + bội số × cược, CHỐT VÁN.
    jackpotPick: (userId, box) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!g.jpPending) return { error: 'Không có hộp nổ hũ nào đang chờ' };
        g.jpPending = false;
        const top = minesWin(g.bet, TOTAL_TILES - g.totalMines, g.totalMines);
        const jp = Math.min(g.bet * jackpotCapOf(g), top);
        const pt = jackpotMult('mines', g.bet);
        const potWin = pt.win;
        const n = pt.mults.length;
        box = Math.min(n, Math.max(1, Math.floor(Number(box)) || 1));
        const hit = pt.mults.indexOf(pt.mult);
        const others = pt.mults.filter((m, i) => i !== hit);   // bỏ ĐÚNG 1 bản của bội số trúng
        for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
        const reveal = []; for (let i = 1; i <= n; i++) reveal.push(i === box ? pt.mult : others.shift());
        statAdd(userId, 'jpCount', 1); statAdd(userId, 'jpTotal', jp + potWin);   // bảng 📊
        webMines.delete(userId);
        delete minesPending()[userId];
        updatePoints(userId, jp + potWin);
        webMinesLog(g, 'Jackpot', jp + potWin - g.bet - (g.fee || 0));
        setMinesLast(userId, g, 'Jackpot', jp + potWin - g.bet - (g.fee || 0));
        writeLog('ADMIN', `[⚠️ NỔ HŨ DÒ MÌN] ${g.name} chọn hộp bội số ${box}/${n} ra x${pt.mult} (trong x${pt.mults.join('/x')}) × cược ${g.bet.toLocaleString()} = ${potWin.toLocaleString()} + trần ván ${jp.toLocaleString()} (${g.totalMines} mìn) - CHỐT VÁN`);
        writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🏆 chọn hộp bội số ${box} - x${pt.mult}, chốt ván`);
        potAnnounce(dbCache._minesChannelId,
            `💥🏆 <@${userId}> vừa NỔ HŨ ở 💣 DÒ MÌN: **${jp.toLocaleString()}** kịch khung ván (${g.totalMines} mìn)` +
            ` + **${potWin.toLocaleString()}** bội số 🎲 tự tay bốc **x${pt.mult}** tiền cược = **${(jp + potWin).toLocaleString()}** ${DOGCOIN_EMOJI}!`,
            userId);
        return { ok: true, jackpot: true, box, reveal, mult: pt.mult, mults: pt.mults, jp, potWin, win: jp + potWin, luckCapped: jp < top, mines: g.mines, balance: getUserData(userId).points || 0 };
    },
    luckyPick: (userId, box) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!g.luckyPending) return { error: 'Không có cỏ 4 lá nào đang chờ' };
        g.luckyPending = false;   // (bỏ luckySpun: giờ 2 ô 🍀, mỗi ô tự quay 1 lần)
        box = Math.min(4, Math.max(1, box || 1));
        const prize = takeForcedLucky(userId, MINES_LUCKY_WHEEL) || spinWheel(MINES_LUCKY_WHEEL);   // 09/09: admin ép quà thì khỏi quay
        // Lật cả 4 hộp: hộp đã chọn = quà thật, 3 hộp kia là hàng mẫu (quà thật đã chốt
        // ở dòng trên). 🏆 CHỈ ĐƯỢC HIỆN Ở ĐÚNG 1 VỊ TRÍ - hàng mẫu không bao giờ ra hũ,
        // kẻo lật ra 2-3 cái hũ ảo nhìn loạn.
        const decoy = () => { let d; do { d = spinWheel(MINES_LUCKY_WHEEL); } while (d === 'jackpot'); return d; };
        const reveal = [];
        for (let i = 1; i <= 4; i++) reveal.push(i === box ? prize : decoy());
        const lucky = { prize, box, reveal };
        if (prize === 'shield') { g.shield = (g.shield || 0) + 1; g.luck.push('🛡️'); }   // cộng dồn
        else if (prize === 'dig') {
            // mở giúp 1–2 ô an toàn ngẫu nhiên (server chọn - cho tự chọn là quá tay)
            const n = 1 + Math.floor(Math.random() * 2);
            const pool = [];
            for (let i = 0; i < TOTAL_TILES; i++) {
                if (!g.mines.includes(i) && !g.revealed.includes(i)) pool.push(i);
            }
            const opened = [];
            for (let k = 0; k < n && pool.length; k++) {
                opened.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
            opened.forEach(i => g.revealed.push(i));
            lucky.opened = opened;
            g.luck.push('⛏️');
        }
        else if (prize === 'cash') {
            const bonus = Math.max(1, Math.floor(g.bet * 0.3));   // lì xì 20% -> 30% (20/08)
            updatePoints(userId, bonus);
            lucky.bonus = bonus;
            g.bonus = (g.bonus || 0) + bonus;   // để lịch sử cuối ván ghi đúng tổng tiền ăn
            g.luck.push('💰');
        }
        else if (prize === 'jackpot') {
            // 🏆 NỔ HŨ = GIẢI CAO NHẤT của chính cấu hình ván này, trần theo jackpotCapOf
            // (ván 3-4 mìn chỉ x100 - dễ quá không cho farm hũ; 5+ mìn trần x2000),
            // và CHỐT VÁN NGAY TẠI ĐÂY. Bug 19/08: trước ván vẫn chạy tiếp sau hũ,
            // người chơi bấm dừng được trả thêm lần nữa - ăn gần x2.
            // 🏆 09/09 v2 (chủ server chốt): CHƯA trả ngay - TREO ván, bung thêm N hộp úp (mỗi hộp
            // 1 bội số x10/x15/x20 theo cấu hình) cho người chơi TỰ CHỌN ở jackpotPick() bên dưới.
            // Trong lúc treo không mở ô / không dừng được (guard jpPending). Tiền trần ván + bội số
            // trả ở jackpotPick. F5 giữa chừng: current().jpPick=true -> web mở lại hộp.
            g.jpPending = true;
            g.luck.push('🏆');
            lucky.jpPick = true;
            lucky.mults = potCfg('mines').mults.slice();
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🍀 chọn hộp ${box} - trúng 🏆, chờ chọn hộp bội số`);
            return { ok: true, lucky, jackpotPick: true, mults: lucky.mults, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
        }
        else g.luck.push('🍂');
        writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🍀 chọn hộp ${box} - trúng ${prize}`);

        // ⛏️ có thể vừa mở đủ ô an toàn -> chốt jackpot ván luôn
        const maxDiamonds = TOTAL_TILES - g.totalMines;
        if (g.revealed.length >= maxDiamonds) {
            const raw = minesWin(g.bet, maxDiamonds, g.totalMines);
            const win = capIfAssisted(g, raw);
            webMines.delete(userId);
            delete minesPending()[userId];
            updatePoints(userId, win);
            webMinesLog(g, 'Jackpot', win - g.bet - (g.fee || 0));
            setMinesLast(userId, g, 'Jackpot', win - g.bet - (g.fee || 0));
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} JACKPOT (⛏️ hộp may mắn) - nhận ${win}`);
            return { ok: true, lucky, jackpot: true, win, luckCapped: win < raw, mines: g.mines, balance: getUserData(userId).points || 0 };
        }
        return { ok: true, lucky, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
    },
    cashout: (userId) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        if (g.jpPending) return { error: 'Chọn 1 hộp NỔ HŨ đã!' };
        // (đánh dấu để bảng Discord vẽ lại - xem minesBoard bên dưới)
        if (!g.revealed.length) return { error: 'Mở ít nhất 1 ô rồi mới dừng được' };
        const raw = minesWin(g.bet, g.revealed.length, g.totalMines);
        const win = capIfAssisted(g, raw);
        webMines.delete(userId);
        delete minesPending()[userId];
        updatePoints(userId, win);
        webMinesLog(g, 'Dừng (Thắng)', win - g.bet - (g.fee || 0));
        setMinesLast(userId, g, 'Dừng (Thắng)', win - g.bet - (g.fee || 0));
        writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} DỪNG ở ${g.revealed.length} ô - nhận ${win}${win < raw ? ` (kịch khung x${assistCapOf(g)})` : ''}`);
        return { ok: true, win, luckCapped: win < raw, mines: g.mines, luckyAt: (g.lucky || []), balance: getUserData(userId).points || 0 };
    },
};

// ==========================================
// --- LEO THANG (Fury Stairs) ---
// ==========================================
// Leo 10 tầng, mỗi tầng 8 ô, người chơi chọn trước mỗi tầng có mấy quả cầu lửa (1–5).
// Mỗi tầng bấm 1 ô: trúng ô trống thì lên tầng trên và hệ số nhân thêm, trúng lửa là
// mất tiền cược. Dừng lúc nào cũng được. Toàn bộ bẫy sinh sẵn lúc bắt đầu ván nên
// server không thể "đổi ý" giữa chừng, và tiền tính hết ở đây - web chỉ vẽ lại.
const STAIRS_FLOORS = 10;
const STAIRS_COLS = 8;
const STAIRS_RTP = 0.92;    // hạ 0.95 -> 0.92 (20/08, nerf nhẹ toàn bảng - mốc ép tay 2 lửa tầng 9/10 vẫn cố định)
const STAIRS_MAX_FIRE = 5;  // nhiều lửa nhất mỗi tầng (phải nhỏ hơn số ô)

const webStairs = new Map(); // userId -> { bet, fire, floor, traps[][], name, startedAt }

// Ván vừa xong: giữ để màn kết thúc (lộ hết cầu lửa) không tự biến mất.
const webStairsLast = new Map();
function setStairsLast(userId, g, result, amount, hitFloor, hitCol) {
    // Cộng tiền hộp 🍀 đã trả GIỮA ván (💰 lì xì / 🏆 hũ) vào net - xem webMinesLog.
    amount += (g.bonus || 0);
    webStairsLast.set(userId, {
        result, amount, bet: g.bet, fire: g.fire, floor: g.floor,
        safe: g.safe.slice(), traps: g.traps.map(r => r.slice()),
        hitFloor: (hitFloor === undefined ? -1 : hitFloor),
        hitCol: (hitCol === undefined ? -1 : hitCol),
        multi: stairsMulti(g.floor, g.fire),
        // lộ các ô 🍀 chưa đạp + ô vàng, để màn kết thúc cho người chơi thấy "nó ở đó"
        luckyCells: (g.lucky || []).map(l => ({ f: l.f, c: l.c })),
        goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
    });
}

// Ép tay hệ số vài mốc theo yêu cầu chủ server. Key 'lửa:tầng'; ảnh hưởng CẢ tiền trả
// (stairsWin), bảng hệ số client (webStairsApi.table đọc chính hàm này) LẪN trần hũ 🏆.
// - 19/08: hạ nhẹ đỉnh 2 lửa, tầng 9/10 từ 12.65/16.86 -> 11.86/14.86.
// - 21/08: chủ server gửi bảng mới cho 2 lửa, hạ khúc GIỮA-CUỐI (tầng 1-5 giữ nguyên
//   đúng công thức, không ép):
//     tầng 6: 5.16 -> 4.16 · tầng 7: 6.89 -> 5.89 · tầng 8: 9.18 -> 8.18
//     tầng 9: 11.86 -> 10.86 · tầng 10: 14.86 -> 11.86
//   (Bảng chủ server gửi THIẾU tầng 9; lấy 10.86 theo đúng mạch "-1.00" của tầng 6/7/8
//    và để hệ số vẫn tăng dần từ 8.18 lên 11.86. Muốn số khác thì sửa đúng dòng này.)
const STAIRS_MULTI_OVERRIDE = {
    '2:6': 4.16, '2:7': 5.89, '2:8': 8.18, '2:9': 10.86, '2:10': 11.86,
};
function stairsMulti(cleared, fire) {
    if (cleared <= 0) return 1;
    const ov = STAIRS_MULTI_OVERRIDE[`${fire}:${cleared}`];
    if (ov) return ov;
    const m = STAIRS_RTP * Math.pow(STAIRS_COLS / (STAIRS_COLS - fire), cleared);
    // Tự lực ăn đủ, không trần (như Dò Mìn - lên đỉnh 5 lửa x16.8k, 1/1,7 triệu)
    return Math.floor(m * 100) / 100;
}

function stairsWin(bet, cleared, fire) {
    return Math.floor(bet * stairsMulti(cleared, fire));
}

function stairsLog(g, result, amount) {
    // Cộng tiền hộp 🍀 đã trả GIỮA ván (💰 lì xì / 🏆 hũ) vào net - không cộng thì
    // ván nổ hũ hiện "Thắng 68" trong khi ví nhận thêm cả nghìn (bug 18/08).
    amount += (g.bonus || 0);
    const entry = {
        name: g.name, bet: g.bet, fire: g.fire, floor: g.floor,
        result, amount, time: new Date().toLocaleTimeString('vi-VN'),
        // Số dư SAU KHI đã trả thưởng (mọi chỗ gọi hàm này đều updatePoints trước).
        bal: g.userId ? (getUserData(g.userId).points || 0) : null,
        luck: (g.luck || []).slice(),   // 🍀 các phần thưởng đã quay trúng ván này
    };
    if (!Array.isArray(dbCache._stairsHistory)) dbCache._stairsHistory = [];
    dbCache._stairsHistory.unshift(entry);
    if (dbCache._stairsHistory.length > 20) dbCache._stairsHistory.pop();
    statAdd(g.userId, 'stairs', amount);   // net ván này cho bảng 📊
    return entry;
}

// Ván treo quá 2 tiếng (bot restart / người chơi bỏ ngang) thì hoàn tiền cược,
// không im lặng nuốt như trước.
function stairsRefundStale() {
    const now = Date.now();
    for (const [uid, g] of webStairs) {
        if (now - (g.startedAt || 0) > 2 * 3600 * 1000) {
            updatePoints(uid, g.bet);
            webStairs.delete(uid);
            delete stairsPending()[uid];
            writeLog('SYSTEM', `[LEO THANG] Hoàn ${g.bet} cho ${g.name || uid} - ván treo quá 2 tiếng`);
        }
    }
}
setInterval(stairsRefundStale, 10 * 60 * 1000);

const webStairsApi = {
    floors: STAIRS_FLOORS,
    cols: STAIRS_COLS,
    maxFire: STAIRS_MAX_FIRE,
    potMults: () => potCfg('stairs').mults,   // 🏆 09/09: bội số nổ hũ (hết hũ nuôi ở Leo Thang)
    open: () => gameOpen('stairs'),
    minBet: () => minBet(),   // 09/09 getter - panel đổi là web thấy ngay
    last: (userId) => webStairsLast.get(userId) || null,
    dismiss: (userId) => { webStairsLast.delete(userId); return { ok: true }; },
    table: (fire) => {
        const rows = [];
        for (let k = 1; k <= STAIRS_FLOORS; k++) rows.push(stairsMulti(k, fire));
        return rows;
    },
    current: (userId) => {
        const g = webStairs.get(userId);
        if (!g) return null;
        return {
            bet: g.bet, fire: g.fire, floor: g.floor,
            floors: STAIRS_FLOORS, cols: STAIRS_COLS,
            multi: stairsMulti(g.floor, g.fire),
            nextMulti: stairsMulti(g.floor + 1, g.fire),
            cashout: capIfAssisted(g, stairsWin(g.bet, g.floor, g.fire)), // trợ giúp 🍀 -> trần x2000
            assistCap: assistCapOf(g),   // 09/09: web cảnh báo khi ván có trợ giúp đã chạm trần
            assistCapHit: luckyAssisted(g) && stairsWin(g.bet, g.floor, g.fire) >= g.bet * assistCapOf(g),
            assistWhy: assistWhyOf(g),
            safe: g.safe.slice(0, g.floor), // ô đã bấm đúng ở các tầng đã qua (-1 = tầng nhảy qua)
            shield: g.shield || 0,                  // 🛡️ số khiên đang cầm (cộng dồn được)
            burned: (g.burned || []).slice(),       // ô lửa đã bị khiên đỡ (lộ 🔥, cấm bấm lại)
            golden: g.golden ? { floor: g.golden.f, col: g.golden.c } : null, // 🌟 HIỆN RÕ
            luckyPick: !!g.luckyPending,            // đang chờ chọn 1 trong 4 hộp 🍀
            jpPick: !!g.jpPending, jpMults: g.jpPending ? potCfg('stairs').mults : undefined,   // 🏆 09/09 v2
            // 🍀 09/09: chỉ đưa SỐ LƯỢNG (0 hoặc 1), KHÔNG lộ vị trí g.lucky
            luckyTotal: g.luckyTotal || 0, luckyLeft: (g.lucky || []).length, extraLucky: !!g.fee,
        };
    },
    start: (userId, name, fire, bet, extraLucky) => {
        if (webStairs.has(userId)) return { error: 'Bạn đang có ván dở - leo tiếp hoặc bấm DỪNG đã.' };
        if (!gameOpen('stairs')) return { error: '⛔ Leo Thang đang ĐÓNG bảo trì - admin sẽ mở lại sau' };
        if (!Number.isInteger(fire) || fire < 1 || fire > STAIRS_MAX_FIRE) {
            return { error: `Số cầu lửa phải từ 1 đến ${STAIRS_MAX_FIRE}` };
        }
        if (!Number.isInteger(bet) || bet <= 0) return { error: 'Số Dogcoin không hợp lệ' };
        if (bet < minBet()) return { error: `Cược tối thiểu ${minBet().toLocaleString()} Dogcoin mỗi ván` };
        // 🍀 09/09: cỏ KHÔNG miễn phí - tick mua 1 ô, phí 20% cược (cùng luật Dò Mìn)
        const fee = extraLucky ? Math.floor(bet * 0.2) : 0;
        // 🏆 nuôi hũ RIÊNG của Leo Thang: trích 5% cược, KHÔNG thu thêm (nhà cái bao)
        const potCut = luckyPotCut('stairs', bet);
        const me = getUserData(userId);
        if ((me.points || 0) < bet + fee) {
            return { error: `Không đủ Dogcoin! Cần ${(bet + fee).toLocaleString()}${fee ? ` (${bet.toLocaleString()} cược + ${fee.toLocaleString()} phí cỏ)` : ''} - số dư: ${(me.points || 0).toLocaleString()}` };
        }

        // Bẫy sinh sẵn cho cả 10 tầng ngay từ đầu ván. (luckyPending khởi tạo false)
        const traps = [];
        for (let f = 0; f < STAIRS_FLOORS; f++) {
            const row = [];
            while (row.length < fire) {
                const c = Math.floor(Math.random() * STAIRS_COLS);
                if (!row.includes(c)) row.push(c);
            }
            traps.push(row);
        }
        const g = { bet, fire, floor: 0, traps, safe: [], name, userId, startedAt: Date.now() };
        g.fee = fee;   // phí mua cỏ - tính vào net lịch sử cuối ván (các dòng g.fee||0 có sẵn)
        // Ô 🍀 GIẤU trên ô trống tầng 1–8 (không rải tầng 9–10: sát đỉnh còn quà là quá
        // tay). 09/09: CHỈ có khi mua, tối đa 1 ô (luật cũ: 3 ô free).
        g.lucky = []; g.shield = 0; g.burned = []; g.luck = []; g.luckyPending = false;
        while (g.lucky.length < (extraLucky ? 1 : 0)) {
            const f = Math.floor(Math.random() * 8);
            const c = Math.floor(Math.random() * STAIRS_COLS);
            if (traps[f].includes(c)) continue;
            if (g.lucky.some(l => l.f === f && l.c === c)) continue;
            g.lucky.push({ f, c });
        }
        g.luckyTotal = g.lucky.length;   // web hiện "ván này có mua cỏ hay không"
        // 🌟 Ô VÀNG (2% ván, mọi mức lửa - ăn nhờ nó đã có trần x2000): tầng 5–8
        g.golden = null;
        if (Math.random() < STAIRS_GOLDEN_RATE) {
            for (let t = 0; t < 50 && !g.golden; t++) {
                const f = 4 + Math.floor(Math.random() * 4);
                const c = Math.floor(Math.random() * STAIRS_COLS);
                if (!traps[f].includes(c) && !g.lucky.some(l => l.f === f && l.c === c)) g.golden = { f, c };
            }
            if (g.golden) writeLog('SYSTEM', `[LEO THANG] 🌟 Ván của ${name} có Ô VÀNG ở tầng ${g.golden.f + 1}`);
        }
        webStairs.set(userId, g);
        webStairsLast.delete(userId); // vào ván mới thì bỏ màn kết thúc cũ
        updatePoints(userId, -(bet + fee));
        potFeed('stairs', potCut);   // nhà cái bao, KHÔNG trừ người chơi
        stairsPending()[userId] = bet + fee; // restart giữa ván -> hoàn cả cược lẫn phí cỏ
        writeLog('BET', `[LEO THANG] ${name} cược ${bet}${fee ? ` + ${fee} phí cỏ` : ''} | ${fire} lửa/tầng | ${g.lucky.length} ô 🍀${potCut ? ` | hũ thang +${potCut} = ${potGet('stairs')}` : ''}`);
        return { ok: true, balance: getUserData(userId).points || 0, state: webStairsApi.current(userId) };
    },
    step: (userId, col) => {
        const g = webStairs.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!Number.isInteger(col) || col < 0 || col >= STAIRS_COLS) return { error: 'Ô không hợp lệ' };

        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        if (g.jpPending) return { error: 'Chọn 1 hộp NỔ HŨ đã!' };
        if ((g.burned || []).some(b => b.f === g.floor && b.c === col)) {
            return { error: 'Ô này lộ lửa rồi - chọn ô khác' };
        }

        const row = g.traps[g.floor];
        if (row.includes(col)) {
            // 🛡️ Có khiên: lửa XỊT, ô lửa LỘ RA, ĐỨNG YÊN tầng này chọn ô khác.
            // Không leo lên - leo lên là khiên thành vé qua tầng miễn phí, quá mạnh.
            if (g.shield > 0) {   // khiên CỘNG DỒN
                g.shield--;
                g.burned.push({ f: g.floor, c: col });
                writeLog('RESULT', `[LEO THANG] ${g.name} 🛡️ khiên đỡ lửa tầng ${g.floor + 1} - đứng lại chọn ô khác`);
                return { ok: true, burn: false, shielded: true, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
            }
            const hitFloor = g.floor;
            webStairs.delete(userId);
            delete stairsPending()[userId];
            const entry = stairsLog(g, 'Trúng lửa (Thua)', -(g.bet + (g.fee || 0)));
            setStairsLast(userId, g, 'Trúng lửa (Thua)', -(g.bet + (g.fee || 0)), hitFloor, col);
            writeLog('RESULT', `[LEO THANG] ${g.name} CHÁY ở tầng ${hitFloor + 1} - mất ${g.bet}`);
            stairsBoardPush(entry, { hitFloor, hitCol: col, traps: g.traps, safe: g.safe.slice() });
            // Trả BẢN ĐỒ ĐẦY ĐỦ để web lộ hết cầu lửa mọi tầng ngay lúc thua,
            // không phải chỉ tầng vừa cháy (trước phải F5 mới thấy hết).
            // tiền đã trừ lúc bắt đầu, thua thì không trừ thêm
            return {
                ok: true, burn: true, floor: hitFloor, hitCol: col,
                traps: g.traps, safe: g.safe.slice(),
                luckyCells: g.lucky, goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
                balance: getUserData(userId).points || 0,
            };
        }

        const curFloor = g.floor;
        g.safe.push(col);
        g.floor++;

        // 🌟 đạp trúng Ô VÀNG -> lên thẳng đỉnh (các tầng nhảy qua ghi -1: không có ô bấm)
        let lucky = null, golden = false;
        if (g.golden && g.golden.f === curFloor && g.golden.c === col) {
            golden = true; g.luck.push('🌟');
            while (g.floor < STAIRS_FLOORS) { g.safe.push(-1); g.floor++; }
            writeLog('RESULT', `[LEO THANG] ${g.name} 🌟 ĐẠP Ô VÀNG - bay thẳng lên đỉnh!`);
        }
        // 🍀 đạp trúng CỎ 4 LÁ (ô trống bình thường, vẫn lên tầng) -> DỪNG, hiện 4 hộp
        else if (g.lucky.some(l => l.f === curFloor && l.c === col)) {
            g.lucky = g.lucky.filter(l => !(l.f === curFloor && l.c === col)); // mỗi ô 1 lần
            g.luckyPending = true;
            writeLog('RESULT', `[LEO THANG] ${g.name} 🍀 đạp cỏ 4 lá tầng ${curFloor + 1} - đang chọn hộp`);
            return { ok: true, burn: false, luckyPick: true, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
        }

        if (g.floor >= STAIRS_FLOORS) {
            const raw = stairsWin(g.bet, STAIRS_FLOORS, g.fire);
            const win = capIfAssisted(g, raw);   // ăn nhờ 🚀/🌟/khiên -> trần x2000; tự lực -> đủ x17k
            webStairs.delete(userId);
            delete stairsPending()[userId];
            updatePoints(userId, win);
            const entry = stairsLog(g, 'Lên đỉnh', win - g.bet - (g.fee || 0));
            setStairsLast(userId, g, 'Lên đỉnh', win - g.bet - (g.fee || 0));
            writeLog('RESULT', `[LEO THANG] ${g.name} LÊN ĐỈNH - nhận ${win}${win < raw ? ` (kịch khung x${assistCapOf(g)} vì có trợ giúp 🍀)` : ''}`);
            stairsBoardPush(entry, { hitFloor: -1, hitCol: -1, traps: g.traps, safe: g.safe.slice() });
            return {
                ok: true, burn: false, top: true, win, luckCapped: win < raw, lucky, golden,
                traps: g.traps, safe: g.safe.slice(),
                luckyCells: g.lucky, goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
                balance: getUserData(userId).points || 0,
            };
        }
        return { ok: true, burn: false, lucky, golden, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
    },
    // Chọn hộp 🍀 bên Leo Thang - 🚀 có thể đẩy lên đỉnh, chốt thưởng luôn tại đây
    // 🏆 09/09 v2: chọn hộp bội số sau khi trúng 🏆 (xem chú thích bên Dò Mìn). Trả trần lên đỉnh
    // (x2000) + bội số × cược, CHỐT VÁN, ghi 'Lên đỉnh' như trước.
    jackpotPick: (userId, box) => {
        const g = webStairs.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!g.jpPending) return { error: 'Không có hộp nổ hũ nào đang chờ' };
        g.jpPending = false;
        const top = stairsWin(g.bet, STAIRS_FLOORS, g.fire);
        const jp = Math.min(g.bet * LUCKY_WIN_CAP_MULTI, top);
        const pt = jackpotMult('stairs', g.bet);
        const potWin = pt.win;
        const n = pt.mults.length;
        box = Math.min(n, Math.max(1, Math.floor(Number(box)) || 1));
        const hit = pt.mults.indexOf(pt.mult);
        const others = pt.mults.filter((m, i) => i !== hit);
        for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
        const reveal = []; for (let i = 1; i <= n; i++) reveal.push(i === box ? pt.mult : others.shift());
        statAdd(userId, 'jpCount', 1); statAdd(userId, 'jpTotal', jp + potWin);   // bảng 📊
        webStairs.delete(userId);
        delete stairsPending()[userId];
        updatePoints(userId, jp + potWin);
        const entry = stairsLog(g, 'Lên đỉnh', jp + potWin - g.bet - (g.fee || 0));
        setStairsLast(userId, g, 'Lên đỉnh', jp + potWin - g.bet - (g.fee || 0));
        writeLog('ADMIN', `[⚠️ NỔ HŨ LEO THANG] ${g.name} chọn hộp bội số ${box}/${n} ra x${pt.mult} (trong x${pt.mults.join('/x')}) × cược ${g.bet.toLocaleString()} = ${potWin.toLocaleString()} + trần ván ${jp.toLocaleString()} (${g.fire} lửa) - CHỐT VÁN`);
        potAnnounce(dbCache._stairsChannelId,
            `💥🏆 <@${userId}> vừa NỔ HŨ ở 🪜 LEO THANG: **${jp.toLocaleString()}** kịch khung ván (${g.fire} lửa)` +
            ` + **${potWin.toLocaleString()}** bội số 🎲 tự tay bốc **x${pt.mult}** tiền cược = **${(jp + potWin).toLocaleString()}** ${DOGCOIN_EMOJI}!`,
            userId);
        writeLog('RESULT', `[LEO THANG] ${g.name} 🏆 chọn hộp bội số ${box} - x${pt.mult}, chốt ván`);
        stairsBoardPush(entry, { hitFloor: -1, hitCol: -1, traps: g.traps, safe: g.safe.slice() });
        return {
            ok: true, jackpot: true, top: true, box, reveal, mult: pt.mult, mults: pt.mults, jp, potWin, win: jp + potWin, luckCapped: jp < top,
            traps: g.traps, safe: g.safe.slice(),
            luckyCells: g.lucky, goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
            balance: getUserData(userId).points || 0,
        };
    },
    luckyPick: (userId, box) => {
        const g = webStairs.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!g.luckyPending) return { error: 'Không có cỏ 4 lá nào đang chờ' };
        g.luckyPending = false;
        box = Math.min(4, Math.max(1, box || 1));
        const prize = takeForcedLucky(userId, STAIRS_LUCKY_WHEEL) || spinWheel(STAIRS_LUCKY_WHEEL);   // 09/09: admin ép quà thì khỏi quay
        // Lật cả 4 hộp - 🏆 chỉ hiện ở đúng 1 vị trí (xem chú thích bên Dò Mìn)
        const decoy = () => { let d; do { d = spinWheel(STAIRS_LUCKY_WHEEL); } while (d === 'jackpot'); return d; };
        const reveal = [];
        for (let i = 1; i <= 4; i++) reveal.push(i === box ? prize : decoy());
        const lucky = { prize, box, reveal };
        if (prize === 'rocket') {
            let up = 2;
            while (up-- > 0 && g.floor < STAIRS_FLOORS) { g.safe.push(-1); g.floor++; }
            g.luck.push('🚀');
        }
        else if (prize === 'shield') { g.shield = (g.shield || 0) + 1; g.luck.push('🛡️'); }   // cộng dồn
        else if (prize === 'cash') {
            const bonus = Math.max(1, Math.floor(g.bet * 0.3));   // lì xì 20% -> 30% (20/08, cùng Dò Mìn)
            updatePoints(userId, bonus);
            lucky.bonus = bonus;
            g.bonus = (g.bonus || 0) + bonus;   // để lịch sử cuối ván ghi đúng tổng tiền ăn
            g.luck.push('💰');
        }
        else if (prize === 'jackpot') {
            // 🏆 NỔ HŨ = giải LÊN ĐỈNH của chính mức lửa ván này, trần x2000 cược,
            // và CHỐT VÁN NGAY (bug 19/08: ván chạy tiếp sau hũ, dừng là ăn thêm lần nữa).
            // Chơi 1 lửa câu hũ chỉ ăn x3.49 (2 lửa x11.86) - muốn hũ to phải dám chơi lửa cao.
            // 🏆 09/09 v2: TREO ván, bung N hộp bội số cho người chơi tự chọn ở jackpotPick() (xem Dò Mìn)
            g.jpPending = true;
            g.luck.push('🏆');
            lucky.jpPick = true;
            lucky.mults = potCfg('stairs').mults.slice();
            writeLog('RESULT', `[LEO THANG] ${g.name} 🍀 chọn hộp ${box} - trúng 🏆, chờ chọn hộp bội số`);
            return { ok: true, lucky, jackpotPick: true, mults: lucky.mults, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
        }
        else g.luck.push('🍂');
        writeLog('RESULT', `[LEO THANG] ${g.name} 🍀 chọn hộp ${box} - trúng ${prize}`);

        // 🚀 có thể vừa đẩy lên đỉnh
        if (g.floor >= STAIRS_FLOORS) {
            const raw = stairsWin(g.bet, STAIRS_FLOORS, g.fire);
            const win = capIfAssisted(g, raw);
            webStairs.delete(userId);
            delete stairsPending()[userId];
            updatePoints(userId, win);
            const entry = stairsLog(g, 'Lên đỉnh', win - g.bet - (g.fee || 0));
            setStairsLast(userId, g, 'Lên đỉnh', win - g.bet - (g.fee || 0));
            writeLog('RESULT', `[LEO THANG] ${g.name} LÊN ĐỈNH (🚀 hộp may mắn) - nhận ${win}${win < raw ? ` (kịch khung x${assistCapOf(g)})` : ''}`);
            stairsBoardPush(entry, { hitFloor: -1, hitCol: -1, traps: g.traps, safe: g.safe.slice() });
            return {
                ok: true, lucky, top: true, win, luckCapped: win < raw,
                traps: g.traps, safe: g.safe.slice(),
                luckyCells: g.lucky, goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
                balance: getUserData(userId).points || 0,
            };
        }
        return { ok: true, lucky, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
    },
    cashout: (userId) => {
        const g = webStairs.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        if (g.jpPending) return { error: 'Chọn 1 hộp NỔ HŨ đã!' };
        if (!g.floor) return { error: 'Leo ít nhất 1 tầng rồi mới dừng được' };
        const raw = stairsWin(g.bet, g.floor, g.fire);
        const win = capIfAssisted(g, raw);
        webStairs.delete(userId);
        delete stairsPending()[userId];
        updatePoints(userId, win);
        const entry = stairsLog(g, 'Dừng (Thắng)', win - g.bet - (g.fee || 0));
        setStairsLast(userId, g, 'Dừng (Thắng)', win - g.bet - (g.fee || 0));
        writeLog('RESULT', `[LEO THANG] ${g.name} DỪNG ở tầng ${g.floor} - nhận ${win}${win < raw ? ` (kịch khung x${assistCapOf(g)})` : ''}`);
        stairsBoardPush(entry, { hitFloor: -1, hitCol: -1, traps: g.traps, safe: g.safe.slice() });
        // Lộ 🍀/🌟 chưa đạp cả khi DỪNG - đồng bộ với lúc cháy/lên đỉnh (và với Dò Mìn,
        // vốn đã lộ luckyAt khi dừng). Trước đây thiếu 2 field này nên dừng thì không
        // thấy, F5 lại thấy (setStairsLast vẫn lưu) - hành xử tự đá nhau.
        return {
            ok: true, win, luckCapped: win < raw, traps: g.traps, safe: g.safe.slice(),
            luckyCells: g.lucky, goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
            balance: getUserData(userId).points || 0,
        };
    },
};

// ===== 🎡 VÒNG QUAY MAY MẮN NHÓM - thay Blackjack (cả server thống nhất 18/08) =====
// Vé cố định, CHẮC CHẮN thắng (sàn x1.5). 3 mũi tên 🟡🔵🟢 gắn quanh vành lệch nhau
// 120° (= 9 nan); mỗi người chọn 1 màu, CHỌN TRÙNG thoải mái - cùng màu ăn cùng nan.
// Đủ N người ready (admin chỉnh ở panel, mặc định 3) thì NÚT QUAY SÁNG LÊN -
// KHÔNG tự quay: ai trong bàn bấm nút là quay MỘT vòng chung cho tất cả.
// Mỗi người 1 lượt mỗi khung giờ VN, 4 khung 6 tiếng (xem wheelWindowKey bên dưới).
const WHEEL_TICKET = 1000;   // chỉ còn làm fallback hoàn vé pending đời cũ (thiếu amount)
const WHEEL_COLORS = ['yellow', 'blue', 'green'];
const WHEEL_ARROW_OFFSET = { yellow: 0, blue: 9, green: 18 };
// 27 nan (PHẢI chia hết cho 3 - mũi tên lệch 120° = 9 nan), thứ tự XÁO LỘN XỘN
// theo yêu cầu chủ server, không nhịp đối xứng, không 2 nan giống nhau kề nhau.
// 19/08 BUFF theo yêu cầu chủ server: bỏ đám nan lẻ 1.1–1.4 (quay ra +200 nhìn
// chán), nâng sàn lên x1.5 + thêm bậc x3/x5 cho lần quay nào cũng đã tay.
// x1.5×9 · x1.8×6 · x2×5 · x2.5×3 · x3×2 · x5×1 · x10×1
// (độc đắc ~3,7%). Kỳ vọng ~x2.33 vé - quà định kỳ, nhà cái chịu lỗ vòng này.
const WHEEL_SEGMENTS = [1.5, 2.0, 1.8, 2.5, 1.5, 3.0, 1.8, 1.5, 2.0, 5.0, 1.5, 1.8, 10, 1.5, 2.5, 2.0, 1.8, 1.5, 3.0, 2.0, 1.5, 1.8, 2.5, 1.5, 2.0, 1.5, 1.8];

// ===== VÒNG VÉ (vòng 1) - 15 nan: 2.000×5 · 2.500×5 · 3.000×5 xen kẽ, MỘT mũi tên =====
// (19/08 nâng vé 1.000/1.500/2.000 -> 1.500/2.000/2.500; 21/08 -> 2.000/2.500/3.000; 26/08 -> 3.000/4.000/5.000)
// Vào bàn + quay vòng vé MIỄN PHÍ. Quay ra giá nào thì TRỪ ĐÚNG GIÁ ĐÓ mỗi người
// để được quay vòng hệ số; ai không đủ tiền lúc vé chốt thì bị mời ra (không mất
// gì, không mất lượt). Xen kẽ không 2 nan giống kề nhau (kể cả chỗ nối vòng tròn).
// 04/09: 3 mốc giá vé cho admin chỉnh sống ở panel (lưu _wheelPrices), mặc định 8k/9k/10k.
const WHEEL_PRICE_DEF = [8000, 9000, 10000];
function wheelPrices() {
    const a = Array.isArray(dbCache._wheelPrices) ? dbCache._wheelPrices.map(Number) : [];
    return (a.length === 3 && a.every(v => Number.isFinite(v) && v >= 100 && v <= 1000000))
        ? a.map(v => Math.floor(v)) : WHEEL_PRICE_DEF.slice();
}
// Bánh vé 15 ô: giữ nguyên hoa văn xen kẽ của bản cũ, chỉ thay 3 giá trị vào khuôn
const WHEEL_STAGE1_PAT = [0, 1, 2, 0, 2, 1, 0, 1, 2, 1, 0, 2, 1, 0, 2];
function wheelStage1() { const p = wheelPrices(); return WHEEL_STAGE1_PAT.map(i => p[i]); }
function wheelMaxTicket() { return Math.max(...wheelPrices()); }

// status: waiting -> spin1 (bánh vé đang quay ~8s) -> stake (vé đã chốt, chờ bấm
// vòng hệ số; 60s không ai bấm thì tự quay - không giam vé cả bàn) -> spinning -> waiting
const wheelRoom = { status: 'waiting', players: new Map(), spin: null, spin1: null, price: null, stakeEndsAt: null, spinSeq: 0 };

// 4 KHUNG 6 TIẾNG (chủ server chốt 21/08, trước đó là 2 khung 12 tiếng):
// 00:00–05:59 · 06:00–11:59 · 12:00–17:59 · 18:00–23:59 -> reset 00:00, 06:00, 12:00, 18:00.
const WHEEL_SLOT_HOURS = 6;
const WHEEL_SLOT_MARKS = [0, 6, 12, 18];   // chỉ để hiển thị cho người chơi
function wheelWindowKey() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const slot = Math.floor(now.getHours() / WHEEL_SLOT_HOURS);   // 0..3
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-S${slot}`;
}
function wheelNextReset() { // epoch ms của mốc 00/06/12/18 giờ VN kế tiếp (cho đồng hồ đếm ngược)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const next = new Date(now);
    const nextHour = (Math.floor(now.getHours() / WHEEL_SLOT_HOURS) + 1) * WHEEL_SLOT_HOURS;
    if (nextHour >= 24) { next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0); }
    else next.setHours(nextHour, 0, 0, 0);
    return Date.now() + (next.getTime() - now.getTime());
}
// Câu chữ dùng chung cho mọi chỗ báo mốc reset - đổi khung chỉ phải sửa 1 nơi
const WHEEL_RESET_TEXT = WHEEL_SLOT_MARKS.map(h => String(h).padStart(2, '0') + ':00').join(', ');
function wheelMinPlayers() {
    const n = parseInt(dbCache._wheelMinPlayers);
    return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 3;
}
// Vé đang treo lưu database - bot restart giữa lúc chờ đủ người thì hoàn lại hết
function wheelPending() {
    if (!dbCache._wheelPending || typeof dbCache._wheelPending !== 'object') dbCache._wheelPending = {};
    return dbCache._wheelPending;
}
function wheelRefundPending() {
    for (const [uid, e] of Object.entries(wheelPending())) {
        // vé cũ (trước khi pending có amount) rơi về giá hiện tại
        const amount = (e && Number.isFinite(e.amount) && e.amount > 0) ? e.amount : WHEEL_TICKET;
        updatePoints(uid, amount);
        writeLog('SYSTEM', `[VÒNG QUAY] Hoàn vé ${amount} cho ${uid} (bot restart giữa lúc chờ đủ người)`);
    }
    dbCache._wheelPending = {};
}

function wheelState(userId) {
    const me = getUserData(userId);
    return {
        me: userId,
        ticket: wheelMaxTicket(),          // vé đắt nhất (hiển thị) - vào bàn MIỄN PHÍ, vé trừ sau vòng vé
        segments: WHEEL_SEGMENTS,
        segments1: wheelStage1(),          // bánh vé (vòng 1)
        arrows: WHEEL_ARROW_OFFSET,
        minPlayers: wheelMinPlayers(),
        status: wheelRoom.status,
        spin1: wheelRoom.spin1,            // {seq, idx, price, endsAt} - vòng vé đang/vừa quay
        price: wheelRoom.price,            // giá vé đã chốt (null khi chưa quay vòng vé)
        // đủ người + đang chờ = nút QUAY VÒNG VÉ sáng lên cho người trong bàn bấm
        armed: wheelRoom.status === 'waiting' && wheelRoom.players.size >= wheelMinPlayers(),
        // vé chốt + đủ số người + TẤT CẢ đủ tiền + TẤT CẢ đã chọn màu -> nút sáng
        stakeShort: wheelRoom.status === 'stake' ? wheelShort() : [],
        noColor: wheelRoom.status === 'stake' ? wheelNoColor() : [],
        stakeEndsAt: wheelRoom.stakeEndsAt || null,   // đếm ngược 120s pha chọn màu/gom vé
        armed2: wheelRoom.status === 'stake' && wheelShort().length === 0
            && wheelNoColor().length === 0
            && wheelRoom.players.size >= wheelMinPlayers(),
        players: [...wheelRoom.players.values()].map(p => ({ name: p.name, color: p.color })),
        seated: wheelRoom.players.has(userId),   // giờ ngồi-chưa-chọn-màu là hợp lệ, cần cờ riêng
        myColor: wheelRoom.players.has(userId) ? wheelRoom.players.get(userId).color : null,
        played: me.lastWheelKey === wheelWindowKey(),
        spin: wheelRoom.spin,
        nextReset: wheelNextReset(),
        now: Date.now(),
        history: (dbCache._wheelHistory || []).slice(0, 10),
        balance: me.points || 0,
    };
}
// VÒNG 1 KHÔNG CẦN MÀU - màu mũi tên chỉ chọn ở vòng hệ số (stake). Vào bàn không
// màu cũng được; đã ngồi thì gọi lại hàm này với màu để chọn/đổi (cả lúc waiting
// lẫn lúc vé đã chốt).
function wheelReady(userId, color) {
    const hasColor = WHEEL_COLORS.includes(color);
    const me = getUserData(userId);
    if (wheelRoom.players.has(userId)) {
        if (!hasColor) return { error: 'Chọn màu mũi tên 🟡/🔵/🟢' };
        if (wheelRoom.status !== 'waiting' && wheelRoom.status !== 'stake') return { error: 'Đang quay - chờ bánh dừng đã' };
        wheelRoom.players.get(userId).color = color;
        return { ok: true, state: wheelState(userId) };
    }
    if (wheelRoom.status !== 'waiting') return { error: 'Vòng đang quay - chờ chút rồi vào ván sau' };
    if (me.lastWheelKey === wheelWindowKey()) return { error: `Khung này bạn quay rồi - reset lúc ${WHEEL_RESET_TEXT}` };
    // VÀO BÀN MIỄN PHÍ, KHÔNG điều kiện tiền, KHÔNG cần màu (chốt của chủ server)
    wheelRoom.players.set(userId, { userId, name: me.name || ('web_' + userId.slice(-4)), color: hasColor ? color : null });
    writeLog('BET', `[VÒNG QUAY] ${me.name || userId} vào bàn (${wheelRoom.players.size}/${wheelMinPlayers()})`);
    // KHÔNG tự quay khi đủ người - chỉ bật `armed`, người trong bàn tự bấm nút QUAY.
    return { ok: true, state: wheelState(userId) };
}

// Ai đang ngồi mà CHƯA chọn màu - vòng hệ số chỉ quay khi danh sách này rỗng
function wheelNoColor() {
    const out = [];
    for (const p of wheelRoom.players.values()) if (!p.color) out.push(p.name);
    return out;
}
// Người trong bàn bấm nút QUAY (chỉ sáng khi đủ người). Hai người bấm gần nhau:
// người sau nhận luôn state đang quay để client diễn hoạt hình, không báo lỗi.
function wheelSpin(userId) {
    if (wheelRoom.status === 'spinning') return { ok: true, state: wheelState(userId) };
    // Vòng hệ số CHỈ quay sau khi vòng vé đã chốt giá (stake). Bàn đã khoá người từ
    // vòng vé nên không cần đếm lại min người.
    if (wheelRoom.status !== 'stake') return { error: 'Quay VÒNG VÉ trước đã - vé chốt xong mới quay vòng hệ số' };
    if (!wheelRoom.players.has(userId)) return { error: 'Vào bàn đã rồi mới bấm quay được' };
    // Vòng 2 cùng luật vòng 1 (đủ số người) + TẤT CẢ đủ tiền vé + TẤT CẢ đã chọn màu
    if (wheelRoom.players.size < wheelMinPlayers()) return { error: `Chưa đủ ${wheelMinPlayers()} người - rủ thêm bạn bè` };
    const noc = wheelNoColor();
    if (noc.length) return { error: `${noc.join(', ')} chưa chọn màu mũi tên 🟡/🔵/🟢` };
    const short = wheelShort();
    if (short.length) return { error: `Chưa quay được - ${short.join(', ')} chưa đủ vé ${(wheelRoom.price || 0).toLocaleString()}` };
    const me = wheelRoom.players.get(userId);
    writeLog('RESULT', `[VÒNG QUAY] ${me.name} bấm vòng hệ số (vé ${(wheelRoom.price || 0).toLocaleString()}, ${wheelRoom.players.size} người)`);
    wheelDoSpin();
    return { ok: true, state: wheelState(userId) };
}
function wheelUnready(userId) {
    if (wheelRoom.status !== 'waiting') return { error: 'Đang quay rồi, không rút được' };
    if (!wheelRoom.players.has(userId)) return { error: 'Bạn chưa vào bàn' };
    // vào bàn miễn phí -> rút cũng không có gì để hoàn
    wheelRoom.players.delete(userId);
    return { ok: true, state: wheelState(userId) };
}

// ===== VÒNG 1: QUAY VÒNG VÉ (1 mũi tên, chốt giá vé chung cả bàn) =====
function wheelSpin1(userId) {
    if (wheelRoom.status === 'spin1') return { ok: true, state: wheelState(userId) };   // 2 người bấm sát nhau
    if (wheelRoom.status !== 'waiting') return { error: 'Không phải lúc quay vòng vé' };
    if (!wheelRoom.players.has(userId)) return { error: 'Vào bàn đã rồi mới bấm quay được' };
    if (wheelRoom.players.size < wheelMinPlayers()) return { error: `Chưa đủ ${wheelMinPlayers()} người - rủ thêm bạn bè` };

    // Chốt ngay tại server; client chỉ diễn hoạt hình. Vòng vé MIỄN PHÍ HOÀN TOÀN -
    // KHÔNG trừ ai, KHÔNG mời ai ra. Tiền chỉ trừ ở vòng hệ số, và vòng đó chỉ quay
    // được khi TẤT CẢ người ngồi đủ tiền vé (xem wheelSpin/wheelShort).
    const seg1 = wheelStage1();
    const idx = Math.floor(Math.random() * seg1.length);
    const price = seg1[idx];
    wheelRoom.price = price;
    wheelRoom.spinSeq++;
    wheelRoom.spin1 = { seq: wheelRoom.spinSeq, idx, price, endsAt: Date.now() + 9000 };
    wheelRoom.status = 'spin1';
    // KHOÁ LƯỢT NGAY KHI VÉ QUAY - vé đã quay là lượt khung này ĐÃ DÙNG với cả bàn.
    // Không có chuyện câu giờ cho vòng trôi để quay lại vé đẹp hơn: trôi là mất lượt.
    const turnKey = wheelWindowKey();
    for (const p of wheelRoom.players.values()) getUserData(p.userId).lastWheelKey = turnKey;
    writeLog('RESULT', `[VÒNG QUAY] ${getUserData(userId).name || userId} bấm vòng vé - ra vé ${price.toLocaleString()} (${wheelRoom.players.size} người, lượt đã tính)`);
    saveDbNow();
    setTimeout(() => {
        if (wheelRoom.status !== 'spin1') return;
        wheelRoom.status = 'stake';
        wheelRoom.stakeEndsAt = Date.now() + 120000;   // client hiện đồng hồ đếm ngược
        const seq = wheelRoom.spinSeq;
        // 120 GIÂY để chọn màu + gom đủ tiền vé. Hết giờ KHÔNG HUỶ (huỷ là mở đường
        // câu giờ quay lại vé): ai sẵn sàng thì quay với những người đó; ai chưa thì
        // bị bỏ lại - lượt đã tính từ lúc quay vé, ráng chịu.
        setTimeout(() => {
            if (wheelRoom.status !== 'stake' || wheelRoom.spinSeq !== seq) return;
            const dropped = [];
            for (const p of [...wheelRoom.players.values()]) {
                const okMoney = (getUserData(p.userId).points || 0) >= (wheelRoom.price || 0);
                if (!p.color || !okMoney) { wheelRoom.players.delete(p.userId); dropped.push(p.name); }
            }
            if (dropped.length) writeLog('SYSTEM', `[VÒNG QUAY] Quá giờ - bỏ lại (mất lượt, không mất tiền): ${dropped.join(', ')}`);
            // 26/08: ghi danh sách bị bỏ lại vào kết quả quay cho MINH BẠCH - trước đây
            // bỏ lại trong im lặng, người chơi tưởng bug "3 người quay 1 người nhận"
            wheelRoom.droppedLast = dropped;
            if (wheelRoom.players.size) { wheelDoSpin(); return; }
            writeLog('SYSTEM', '[VÒNG QUAY] Quá giờ - không ai sẵn sàng, đóng vòng (lượt cả bàn đã tính)');
            wheelRoom.status = 'waiting';
            wheelRoom.price = null;
            wheelRoom.stakeEndsAt = null;
        }, 120000);
    }, 9500);
    return { ok: true, state: wheelState(userId) };
}

// Ai đang ngồi mà ví < giá vé - nút vòng hệ số khoá tới khi danh sách này RỖNG
// (nạp thêm / được bạn chuyển Lộc lá là mở khoá, client poll 2s tự cập nhật).
function wheelShort() {
    if (!wheelRoom.price) return [];
    const out = [];
    for (const p of wheelRoom.players.values()) {
        if ((getUserData(p.userId).points || 0) < wheelRoom.price) out.push(p.name);
    }
    return out;
}
function wheelDoSpin() {
    if (wheelRoom.status !== 'stake' || !wheelRoom.players.size) return;
    if (wheelShort().length || wheelNoColor().length) return;   // phòng hờ - thiếu vé/màu thì không quay
    const price = wheelRoom.price || wheelMaxTicket();
    // Chốt kết quả NGAY tại server; client chỉ diễn hoạt hình quay tới nan idx.
    const idx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const key = wheelWindowKey();
    const results = {};
    for (const c of WHEEL_COLORS) results[c] = WHEEL_SEGMENTS[(idx + WHEEL_ARROW_OFFSET[c]) % WHEEL_SEGMENTS.length];
    const players = [];
    for (const p of wheelRoom.players.values()) {
        const multi = results[p.color];
        const win = Math.floor(price * multi);
        // TRỪ VÉ + TRẢ THƯỞNG cùng một nhịp đồng bộ - không có khe restart mất tiền
        updatePoints(p.userId, -price);
        updatePoints(p.userId, win);
        getUserData(p.userId).lastWheelKey = key;
        players.push({ userId: p.userId, name: p.name, color: p.color, multi, win });
        writeLog('RESULT', `[VÒNG QUAY] ${p.name} (${p.color}) trúng x${multi} - +${win}`);
        if (multi >= 10) {
            writeLog('ADMIN', `[⚠️ VÒNG QUAY ĐỘC ĐẮC] ${p.name} trúng x10 - +${win.toLocaleString()} Dogcoin`);
            client.channels.fetch(NGHIEN_ANNOUNCE_CHANNEL_ID)
                .then(ch => ch.send({ content: `🎡 **${p.name}** quay trúng **ĐỘC ĐẮC x10** - +**${win.toLocaleString()}** ${DOGCOIN_EMOJI}!!!`, allowedMentions: { parse: [] } }))
                .catch(() => { });
        }
    }
    wheelRoom.spinSeq++;
    // danh sách bị bỏ lại (hết giờ chưa chọn màu/thiếu vé) - đưa vào kết quả cho ai cũng thấy
    const dropped = wheelRoom.droppedLast || [];
    wheelRoom.droppedLast = null;
    // hoạt hình client 15s - endsAt 16s (ai vào trong lúc quay vẫn kịp xem đoạn cuối)
    wheelRoom.spin = { seq: wheelRoom.spinSeq, idx, results, players, dropped, endsAt: Date.now() + 16000 };
    wheelRoom.status = 'spinning';
    dbCache._wheelPending = {};   // tiền đã trả - không còn gì để hoàn
    if (!Array.isArray(dbCache._wheelHistory)) dbCache._wheelHistory = [];
    dbCache._wheelHistory.unshift({ time: new Date().toLocaleTimeString('vi-VN'), price, results, players, dropped });
    if (dbCache._wheelHistory.length > 20) dbCache._wheelHistory.pop();
    saveDbNow();
    // giữ spin lại sau khi quay xong để ai vào trễ vẫn thấy kết quả gần nhất
    // (hoạt hình 15s nên bàn mở lại sau 20s)
    setTimeout(() => { wheelRoom.status = 'waiting'; wheelRoom.players.clear(); wheelRoom.spin1 = null; wheelRoom.price = null; wheelRoom.stakeEndsAt = null; }, 20000);
}

// Admin reset lượt quay (nút ở panel): xoá dấu "đã quay khung này" của MỌI ví -
// cả server quay lại được ngay, khỏi đợi 00:00/12:00. Trả về số người được reset.
function wheelResetTurns() {
    let n = 0;
    for (const k of Object.keys(dbCache)) {
        if (k.startsWith('_')) continue;
        const v = dbCache[k];
        if (v && typeof v === 'object' && v.lastWheelKey) { delete v.lastWheelKey; n++; }
    }
    saveDbNow();
    writeLog('ADMIN', `[VÒNG QUAY] Reset lượt quay cho ${n} người - quay lại được ngay`);
    return n;
}

// (Blackjack ĐÃ XÓA HẲN 19/08 - cả server thống nhất hủy, nhường chỗ cho Vòng Quay.
//  Muốn dựng lại thì lục git history: blackjack.js / blackjackTable.js /
//  blackjackPage.js / wsserver.js + khối wiring ở đây và webplay.js.)

// ===== 📈 SÀN CỔ PHIẾU DOGCOIN (DOG) - CHỈ CHƠI TRÊN WEB (22/08) =====
// Khác MỌI game khác của bot: các trò kia chốt xong là sạch sổ, còn cổ phiếu thì mỗi
// người đang giữ là một khoản bot ĐANG NỢ họ, phình theo giá. Nên có 2 cái phanh:
//   1. Giá bị KÉO VỀ MỐC GỐC (mean reversion) + chặn cứng [STOCK_MIN..STOCK_MAX]
//      -> giá không chạy lên trời được, thiệt hại tối đa luôn có trần.
//   2. Trần tổng CP lưu hành (cfg.maxShares) -> trần thiệt hại = maxShares × STOCK_MAX.
// Lợi thế nhà cái DUY NHẤT là chênh mua–bán (spread): mua đắt 2%, bán rẻ 2%, tức mỗi
// vòng người chơi mất ~4% dù giá đi đâu. Nói thẳng ở màn đặt mua, không giấu.
const STOCK_BASE = 1000;             // mốc gốc (26/08 tối: chủ server chốt về 1000, biên 100-1.500)
// 22/08: giá nhảy mỗi 2 GIÂY, nhưng nến chỉ CHỐT mỗi 50 GIÂY (25 nhịp) - nến cuối
// "sống", cao/thấp/đóng của nó thay đổi theo từng nhịp như bàn giao dịch thật.
const STOCK_TICK_MS = 2 * 1000;
const STOCK_CANDLE_TICKS = 30;       // 30 × 2s = 60 giây một cây nến (chủ server chốt 26/08 tối)
// vol/pull/spread PHẢI tính lại theo nhịp, không thì trò thành không thể thắng:
//   · Bề rộng dao động quanh mốc gốc ≈ vol / căn(2 × pull) - với 0.003 và 0.0024 thì
//     ra ±4,3%, đủ rộng để có kèo.
//   · Biên độ một cây nến ≈ vol × căn(25) = 1,5% - nến nhìn ra hình nến, không phải
//     cột dài phi từ đáy lên đỉnh.
//   · Nhịp nhanh gấp 2,5 lần so với bản 5 giây nên vol chia căn(2,5) và pull chia 2,5
//     -> cảm giác chơi GIỮ NGUYÊN, chỉ là nến động mắt hơn.
//   · Chênh mua–bán 0,5%/chiều = 1% mỗi vòng. Để 2% như trước thì mỗi vòng mất 4%
//     trên biên độ chỉ ±4,6% -> người chơi gần như không bao giờ thắng, chơi vài lần
//     là bỏ. 1% vẫn là lợi thế nhà cái rất lớn khi tính trên nhiều lượt.
const STOCK_PULL = 0.004;            // lực kéo giá về NEO hiện tại (đủ chặt để bám neo lang thang)
const STOCK_MIN = 10, STOCK_MAX = 4000;    // 28/08: chủ server nới biên 10-4.000
const STOCK_TICK_CAP = 0.08;         // (nghỉ hưu 26/08 tối: trần mỗi nhịp giờ là ±tickAmp ĐƠN VỊ trong stockTick)
const STOCK_HIST_N = 288;            // 26/08 tối: chủ server chốt kho nến chỉ 4 GIỜ (288 cây 50s) - nhẹ db,
                                     // bài học _txDashHistory phình 1.348 ván = 57% database.json.
const STOCK_LOG_N = 20;              // lệnh vừa khớp hiện trên web
const STOCK_CLOSED_N = 60;           // ván đã đóng (dùng cho bảng vàng + lịch sử)
// 24/08 - SỨC NẶNG ĐIỂM GIÁ (pointX): mỗi 1 đồng giá nhích × 1 CP = pointX Dogcoin
// lãi/lỗ (như point value của hợp đồng tương lai). Chủ server chê "cháy quá thấp":
// vốn 1.000 x10 chỉ ~9 CP, giá nhích 0,3%/nhịp -> lãi/lỗ đung đưa ~27/nhịp. Với
// pointX=5 + spread 0,1%: giá ±1% là ±360..540 trên vốn 1.000 x10 - đúng đề bài
// "nhích xíu là ±400". BẮT BUỘC hạ spread cùng lúc (0,5% -> 0,1%/chiều) vì pointX
// khuếch đại luôn phí chênh: giữ 0,5% thì mở lệnh xong đã lỗ sẵn ~nửa vốn ở x10.
// Chi phí vòng tuyệt đối (Dogcoin) sau đổi ≈ y như cũ: 0,1% × 5 = 0,5%.
// tickAmp = độ lệch chuẩn nhiễu mỗi nhịp 2s (ĐƠN VỊ GIÁ), mặc định 3 = nến lình xình.
// NEO LANG THANG bật lại (26/08 tối): waveOn mặc định BẬT - một "nhà" vô hình tự đi
// bộ chậm khắp dải 100-2000, giá bám theo -> lúc thấp lúc cao, random, nhưng bước mỗi
// nhịp vẫn nhỏ. waveLow/waveHigh = ngưỡng mềm: dưới waveLow neo thiên đi LÊN, trên
// waveHigh thiên đi XUỐNG; ở giữa hướng random (chủ server chỉnh sống ở panel).
const STOCK_CFG_DEF = { tickAmp: 3, spread: 0.001, maxShares: 500, maxPer: 80, open: true, maxLev: 20, holdS: 60, pointX: 5, waveOn: true, waveLow: 550, waveHigh: 3650 };
// Bậc đòn bẩy hiện trên web - lọc theo maxLev nên hạ trần ở panel là mất bậc cao luôn.
const STOCK_LEVS = [1, 5, 10, 20];
// Khối lượng nhập theo LOT như bàn giao dịch thật (0.1 · 0.5 · 1 · 2...) cho quen mắt;
// bên trong vẫn quy ra CP để mọi phép tính tiền không đổi. 1 lot = 10 CP.
const STOCK_LOT = 10;

function stockCfg() {
    const c = dbCache._stockCfg && typeof dbCache._stockCfg === 'object' ? dbCache._stockCfg : {};
    const num = (v, d, lo, hi) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
    };
    return {
        tickAmp: Math.floor(num(c.tickAmp, STOCK_CFG_DEF.tickAmp, 1, 200)),   // giá nhảy ±X đơn vị mỗi nhịp 2s
        spread: num(c.spread, STOCK_CFG_DEF.spread, 0, 0.2),
        maxShares: Math.floor(num(c.maxShares, STOCK_CFG_DEF.maxShares, 10, 100000)),
        maxPer: Math.floor(num(c.maxPer, STOCK_CFG_DEF.maxPer, 1, 100000)),
        maxLev: Math.floor(num(c.maxLev, STOCK_CFG_DEF.maxLev, 1, 100)),
        holdS: Math.floor(num(c.holdS, STOCK_CFG_DEF.holdS, 0, 3600)),   // giây CHÔN VỐN
        pointX: Math.floor(num(c.pointX, STOCK_CFG_DEF.pointX, 1, 20)),  // sức nặng điểm giá
        open: c.open !== false,
        // 🌊 NEO LANG THANG (bật lại 26/08 tối): neo tự đi bộ khắp dải, giá bám theo.
        waveOn: c.waveOn !== false,                                      // mặc định BẬT
        // 28/08: đáy/trần band GIÁ (waveOn thì giá nhốt trong đây). Cho set bất kỳ trong
        // [STOCK_MIN, STOCK_MAX]; stockTick tự lấy min/max nên đảo ngược cũng không vỡ.
        waveLow: Math.floor(num(c.waveLow, STOCK_CFG_DEF.waveLow, STOCK_MIN, STOCK_MAX)),
        waveHigh: Math.floor(num(c.waveHigh, STOCK_CFG_DEF.waveHigh, STOCK_MIN, STOCK_MAX)),
    };
}
function stockPrice() {
    const p = Number(dbCache._stockPrice);
    return Number.isFinite(p) && p >= STOCK_MIN && p <= STOCK_MAX ? p : STOCK_BASE;
}
// giá MUA (ask) đắt hơn, giá BÁN (bid) rẻ hơn - chênh này là lợi thế nhà cái
function stockAsk() { return Math.round(stockPrice() * (1 + stockCfg().spread)); }
function stockBid() { return Math.round(stockPrice() * (1 - stockCfg().spread)); }

// Nến thay cho mảng giá trơn (22/08, theo ảnh MT4 chủ server gửi): mỗi nhịp 30s là
// MỘT cây nến {o,h,l,c}. Nến xanh = đóng cao hơn mở (giá lên), đỏ = ngược lại.
function stockCandles() {
    if (!Array.isArray(dbCache._stockCandles)) {
        const p = stockPrice();
        dbCache._stockCandles = [{ o: p, h: p, l: p, c: p, n: 0 }];
        delete dbCache._stockHist;   // bỏ mảng giá trơn đời đầu
    }
    return dbCache._stockCandles;
}
function stockPos() {
    if (!dbCache._stockPos || typeof dbCache._stockPos !== 'object') dbCache._stockPos = {};
    return dbCache._stockPos;
}
function stockShareCount() {   // tổng CP đang lưu hành = mức bot đang gánh
    return Object.values(stockPos()).reduce((s, p) => s + (Number(p.shares) || 0), 0);
}
// nhiễu chuẩn xấp xỉ (tổng 6 số ngẫu nhiên) - đủ tốt, không cần Box-Muller
function stockGauss() {
    let s = 0;
    for (let i = 0; i < 6; i++) s += Math.random();
    return (s - 3) / 1.2247;
}
// Đẩy giá thêm MỘT nhịp. KHÔNG chạy bù khi bot vừa bật lại sau lúc chết: hàm này chỉ
// được setInterval gọi, nên bot tắt 2 tiếng thì giá đứng nguyên 2 tiếng - người đang
// gồng mở mắt ra không bị cháy vì những nhịp họ không có cơ hội phản ứng.
// MỘT NHỊP = 5 giây, chỉ nhích giá MỘT bước. Nến cuối mảng là nến ĐANG SỐNG: mỗi
// nhịp cập nhật đóng/cao/thấp của nó; đủ STOCK_CANDLE_TICKS nhịp (40s) thì mở cây mới.
// Trường n đếm số nhịp đã vào cây đó - nhờ vậy bot restart giữa cây vẫn chốt đúng chỗ.
function stockTick(forcePct) {
    const cfg = stockCfg();
    const before = stockPrice();
    const clamp = (v) => Math.min(STOCK_MAX, Math.max(STOCK_MIN, v));
    let p;
    if (Number.isFinite(forcePct)) {
        p = clamp(before * (1 + forcePct));   // đường cũ: nhảy thẳng (không còn ai gọi từ panel)
    } else {
        // TRÔI TỪ TỪ (25/08): có đích thì mỗi nhịp nhích 1/ticksLeft khoảng cách còn lại
        // (đo bằng log để tự bù lực kéo về mốc), nhân nhiễu 0.5–1.5 cho khỏi đều tăm tắp.
        // Nhiễu vol bình thường vẫn phủ lên trên -> nhìn như một xu hướng thật, không ai
        // phân biệt được với sóng tự nhiên. Dùng chung cho admin can thiệp + sự kiện tự động.
        let drift = 0;
        const d = dbCache._stockDrift;
        if (d && d.ticksLeft > 0 && Number.isFinite(d.target)) {
            drift = Math.log(d.target / before) / d.ticksLeft * (0.5 + Math.random());
            d.ticksLeft--;
            if (d.ticksLeft <= 0) dbCache._stockDrift = null;
        }
        // 🌊 NEO LANG THANG (26/08 tối, chốt cuối): một "nhà" vô hình (_stockAnchor.v)
        // tự đi bộ chậm khắp dải; giá bám theo neo + nhiễu nhỏ -> lang thang cả 100-2000
        // mà bước mỗi nhịp vẫn nhỏ (nến lình xình). Mỗi chặng 20-50 phút bốc đích mới:
        // ở giữa hướng RANDOM, dưới waveLow thiên LÊN, trên waveHigh thiên XUỐNG.
        let a = dbCache._stockAnchor;
        if (!a || !Number.isFinite(a.v)) a = dbCache._stockAnchor = { v: STOCK_BASE, target: STOCK_BASE, legLeft: 0 };
        // 28/08 (tối) - chủ server chốt: "set band nào GIÁ LOANH QUANH TRONG ĐÓ". waveOn =
        // giá bị NHỐT trong [waveLow, waveHigh]: neo đi bộ TRONG band (không lún ra ngoài),
        // bước theo bề rộng band; giá bám neo + đẩy mềm khi chạm mép + CHỐT CỨNG về band.
        // Mô phỏng 300k nhịp: ~98% thời gian nằm gọn trong band, chỉ ~2% chạm nhẹ mép rồi
        // bật ra (không dán phẳng vào tường). waveOn=false = thả rông cả [STOCK_MIN,MAX].
        const bandLo = Math.max(STOCK_MIN, Math.min(cfg.waveLow, cfg.waveHigh));
        const bandHi = Math.min(STOCK_MAX, Math.max(cfg.waveLow, cfg.waveHigh));
        if (cfg.waveOn) {
            if ((a.legLeft | 0) <= 0) {
                const dir = a.v < bandLo ? 1 : a.v > bandHi ? -1 : (Math.random() < 0.5 ? 1 : -1);
                const bw = Math.max(1, bandHi - bandLo);
                const step = (0.15 + Math.random() * 0.5) * bw;               // dời 15-65% bề rộng band
                a.target = Math.round(Math.min(bandHi, Math.max(bandLo, a.v + dir * step)));
                a.legLeft = 600 + Math.floor(Math.random() * 900);            // 20-50 phút mỗi chặng (nhịp 2s)
            }
            a.legLeft--;
            a.v += (a.target - a.v) * 0.01;                                   // neo trôi mượt tới đích
            if (a.v < bandLo) a.v = bandLo; if (a.v > bandHi) a.v = bandHi;   // đổi band giữa chừng vẫn an toàn
        } else {
            a.v = STOCK_BASE; a.target = STOCK_BASE; a.legLeft = 0;           // tắt sóng -> neo đứng ở mốc
        }
        const anchor = a.v;
        // đẩy mềm khi giá lỡ ra ngoài band: càng ra càng bị kéo vào (tối đa 0.05/nhịp) -
        // nhờ vậy giá bật khỏi tường ngay, không bị kẹp dính phẳng ở mép.
        let edge = 0;
        if (cfg.waveOn) {
            const bw = Math.max(1, bandHi - bandLo);
            if (before > bandHi) edge = -Math.min(0.05, (before - bandHi) / bw * 0.4);
            else if (before < bandLo) edge = Math.min(0.05, (bandLo - before) / bw * 0.4);
        }
        let m = -STOCK_PULL * Math.log(before / anchor) + (cfg.tickAmp * stockGauss()) / before + drift + edge;
        // 26/08 tối (chủ server chốt "nến đẹp có râu như hình 2"): tickAmp = ĐỘ LỆCH
        // CHUẨN nhiễu mỗi nhịp (đơn vị giá) - std ~tickAmp, thi thoảng lớn hơn để nến
        // có thân + râu tự nhiên. Trần LỎNG 4×tickAmp: chỉ chặn cú sốc, KHÔNG kẹp phẳng
        // từng nhịp (kẹp chặt = nến dẹp không đầu đuôi, đúng lỗi hình 1).
        const capU = (cfg.tickAmp * 4) / before;
        if (m > capU) m = capU;
        if (m < -capU) m = -capU;
        // CHỐT CỨNG: waveOn thì nhốt trong band, không thì cả [STOCK_MIN, STOCK_MAX]
        p = cfg.waveOn ? Math.min(bandHi, Math.max(bandLo, before * (1 + m))) : clamp(before * (1 + m));
    }
    p = Math.round(p);
    dbCache._stockPrice = p;

    const cs = stockCandles();
    const live = cs[cs.length - 1];
    if (!live || (Number(live.n) || 0) >= STOCK_CANDLE_TICKS) {
        // chốt cây cũ, mở cây mới: giá mở = giá đóng cây trước (liền mạch)
        cs.push({ o: Math.round(before), h: Math.max(Math.round(before), p), l: Math.min(Math.round(before), p), c: p, n: 1 });
        while (cs.length > STOCK_HIST_N) cs.shift();
    } else {
        live.c = p;
        if (p > live.h) live.h = p;
        if (p < live.l) live.l = p;
        live.n = (Number(live.n) || 0) + 1;
    }
    return p;
}
// Còn mấy giây nữa chốt nến - web hiện đồng hồ này thay vì đồng hồ nhịp giá
function stockCandleLeftMs() {
    const cs = stockCandles();
    const live = cs[cs.length - 1];
    const done = live ? Math.min(STOCK_CANDLE_TICKS, Number(live.n) || 0) : STOCK_CANDLE_TICKS;
    const ticksLeft = STOCK_CANDLE_TICKS - done;
    const nextTickIn = Math.max(0, (dbCache._stockNextTick || Date.now()) - Date.now());
    return nextTickIn + Math.max(0, ticksLeft - 1) * STOCK_TICK_MS;
}
function stockLog(entry) {
    if (!Array.isArray(dbCache._stockLog)) dbCache._stockLog = [];
    dbCache._stockLog.unshift(entry);
    while (dbCache._stockLog.length > STOCK_LOG_N) dbCache._stockLog.pop();
}
function stockClosed() {
    if (!Array.isArray(dbCache._stockClosed)) dbCache._stockClosed = [];
    return dbCache._stockClosed;
}

// Vốn thực đã trừ khỏi ví. Vị thế đời trước (chưa có đòn bẩy) thì vốn = giá trị lệnh,
// nên margin thiếu thì rơi về cost - không cần migrate database.
function posMargin(p) {
    const m = Number(p && p.margin);
    return Number.isFinite(m) && m > 0 ? m : (Number(p && p.cost) || 0);
}
// Đòn bẩy hiệu dụng: mua thêm ở đòn bẩy khác nhau thì ra số lẻ, đó là đúng.
function posLev(p) {
    const m = posMargin(p);
    return m > 0 ? (Number(p.cost) || 0) / m : 1;
}
// ĐỆM CHỊU LỖ = vốn đã bỏ ra + TOÀN BỘ SỐ DƯ CÒN LẠI TRONG VÍ (22/08 theo yêu cầu chủ
// server: "gồng bằng dogcoin từ trong ví luôn tới khi nào cháy ví thì thôi"). Trước đây
// lỗ dừng ở vốn, phần ví ngoài vốn là an toàn - GIỜ KHÔNG CÒN AN TOÀN NỮA.
function posBuffer(userId, p) {
    return posMargin(p) + Math.max(0, Number(getUserData(userId).points) || 0);
}
// Giá làm CHÁY VÍ (lỗ ăn hết vốn + hết ví). Hiện lên thẻ vị thế cho cả hai chiều.
// Giá này TỰ ĐỘNG XA RA khi người chơi nạp thêm tiền vào ví, và gần lại khi họ tiêu.
function posBurnPrice(userId, p) {
    const sh = Number(p && p.shares) || 0;
    if (sh < 1) return 0;
    const cfg = stockCfg();
    const basis = Number(p.cost) || 0, buf = posBuffer(userId, p), sp = cfg.spread;
    // 24/08: lãi/lỗ đã nhân pointX nên đệm chịu lỗ quy về "đồng giá" phải CHIA pointX -
    // sức nặng càng cao thì giá cháy càng GẦN, đúng bản chất đòn bẩy nặng hơn.
    const bufPts = buf / cfg.pointX;
    return p.side === 'short'
        ? Math.round((basis + bufPts) / sh / (1 + sp))
        : Math.round((basis - bufPts) / sh / (1 - sp));
}
// Lãi/lỗ tạm tính của một vị thế - DÙNG CHUNG mọi nơi để không bao giờ lệch nhau.
//   MUA (long) : ăn khi giá LÊN   -> lãi = bán ra bây giờ (shares × bid) − tiền đã bỏ
//   BÁN (short): ăn khi giá XUỐNG -> lãi = tiền đã cọc − mua lại bây giờ (shares × ask)
// Cả hai chiều đều bị trừ tiền đúng bằng "invested" lúc mở, nên vốn đối xứng.
// 24/08: nhân SỨC NẶNG ĐIỂM GIÁ (cfg.pointX) - 1 đồng giá × 1 CP = pointX Dogcoin.
// Điểm hoà vốn KHÔNG đổi theo pointX (nhân cả hai vế của pl=0), chỉ biên độ tiền đổi.
function stockPL(pos) {
    const sh = Number(pos && pos.shares) || 0;
    if (sh < 1) return 0;
    const inv = Number(pos.cost) || 0;
    const raw = pos.side === 'short' ? (inv - sh * stockAsk()) : (sh * stockBid() - inv);
    return stockCfg().pointX * raw;
}
function stockState(userId) {
    const cfg = stockCfg();
    const me = getUserData(userId);
    const pos = stockPos()[userId] || null;
    const bid = stockBid(), price = stockPrice();
    const shares = pos ? (Number(pos.shares) || 0) : 0;
    const cost = pos ? (Number(pos.cost) || 0) : 0;
    const pl = stockPL(pos);
    const closed = stockClosed();
    // Bảng vàng: gộp theo người từ các ván đã đóng (lãi/lỗ thực), + ai đang gồng lâu nhất
    const byUser = {};
    for (const c of closed) {
        if (!byUser[c.userId]) byUser[c.userId] = { name: c.name, pl: 0, n: 0 };
        byUser[c.userId].pl += Number(c.pl) || 0;
        byUser[c.userId].n++;
    }
    const board = Object.entries(byUser)
        .map(([uid, v]) => ({ name: v.name, pl: v.pl, n: v.n }))
        .sort((a, b) => b.pl - a.pl);
    const holders = Object.entries(stockPos())
        .filter(([, p]) => (Number(p.shares) || 0) > 0)
        .map(([uid, p]) => ({
            name: (getUserData(uid).name || uid),
            shares: p.shares,
            since: p.openedAt || Date.now(),
            mine: uid === userId,
        }))
        .sort((a, b) => a.since - b.since);
    return {
        open: cfg.open,
        price, ask: stockAsk(), bid,
        base: STOCK_BASE,
        spreadPct: Math.round(cfg.spread * 1000) / 10,
        tickMs: STOCK_TICK_MS,
        candleMs: STOCK_CANDLE_TICKS * STOCK_TICK_MS,
        candleAt: Date.now() + stockCandleLeftMs(),   // lúc cây nến hiện tại chốt
        lotSize: STOCK_LOT,
        nextTick: dbCache._stockNextTick || (Date.now() + STOCK_TICK_MS),
        now: Date.now(),
        candles: stockCandles().slice(-180),  // 2 giờ nến - web tự gộp sang khung lớn
        histLen: stockCandles().length,       // tổng nến trong kho - client biết còn bao nhiêu để kéo lùi
        outstanding: stockShareCount(),
        maxShares: cfg.maxShares,
        maxPer: cfg.maxPer,
        levs: STOCK_LEVS.filter(v => v <= cfg.maxLev),
        maxLev: cfg.maxLev,
        pointX: cfg.pointX,      // sức nặng điểm giá - web hiện "mỗi 1% = lev×pointX% vốn"
        holdS: cfg.holdS,
        balance: me.points || 0,
        blocked: !!(debtStatus(userId) || {}).bad,   // nợ xấu thì cấm mua (vẫn cho bán)
        pos: shares > 0 ? {
            side: pos.side === 'short' ? 'short' : 'long',
            shares, cost,
            margin: posMargin(pos),                    // vốn đã trừ ví = mức lỗ tối đa
            lev: Math.round(posLev(pos) * 10) / 10,
            avg: Math.round(cost / shares),
            // đóng lệnh bây giờ nhận về bao nhiêu = vốn + lãi/lỗ (không âm)
            value: Math.max(0, posMargin(pos) + pl),   // nhận về ví; lỗ quá vốn thì 0 + trừ ví
            pl,
            plPct: Math.round(pl / posMargin(pos) * 1000) / 10,   // % tính trên VỐN
            openedAt: pos.openedAt || Date.now(),
            peak: Number(pos.peak) || 0,
            burnAt: posBurnPrice(userId, pos),         // giá làm CHÁY VÍ (cả 2 chiều)
            buffer: posBuffer(userId, pos),            // vốn + ví = tổng chịu lỗ được
            // VỐN BỊ CHÔN: chưa đủ giờ thì không đóng lệnh được - chặn kiểu "lời là rút"
            unlockAt: (pos.openedAt || Date.now()) + cfg.holdS * 1000,
            // 🤖 mốc tự đóng (25/08): giá mid chạm mốc là bot đóng hộ cả lệnh
            autoLow: Number(pos.autoLow) || 0,
            autoHigh: Number(pos.autoHigh) || 0,
        } : null,
        log: (dbCache._stockLog || []).slice(0, 8),
        board: board.slice(0, 5),
        holders: holders.slice(0, 8),
        mine: closed.filter(c => c.userId === userId).slice(0, 8),
        mineTotal: closed.filter(c => c.userId === userId).reduce((s, c) => s + (Number(c.pl) || 0), 0),
        // lãi/lỗ CHỐT trong ngày (giờ VN) - ô "hôm nay" ở thanh đầu trang
        todayPl: closed.filter(c => c.userId === userId && vnDayStr(c.t) === vnDayStr(Date.now()))
            .reduce((s, c) => s + (Number(c.pl) || 0), 0),
        news: null,   // 25/08: bỏ banner tin - admin can thiệp KÍN, người chơi không được báo
    };
}

// MUA: nhận theo số Dogcoin muốn xuống (amount) HOẶC theo khối lượng CP (want).
// Tiền trừ ngay + lưu database ngay (saveDbNow) - vị thế là tiền thật, không đợi vòng 10s.
// MỞ LỆNH - hai chiều như bàn giao dịch thật (22/08 theo yêu cầu chủ server):
//   side='long'  (MUA) : ăn khi giá LÊN.  Vào ở giá mua (ask), tiền bỏ ra = shares × ask
//   side='short' (BÁN) : ăn khi giá XUỐNG. Vào ở giá bán (bid), CỌC = shares × bid
// Chiều BÁN phải cọc bằng đúng giá trị lệnh vì lỗ của nó là giá đi LÊN - cọc chính là
// mức lỗ tối đa, và lệnh tự CHÁY khi lỗ ăn hết cọc (giá mua lại gấp đôi giá vào).
// KHÔNG cho giữ 2 chiều cùng lúc: muốn đổi chiều thì đóng lệnh cũ trước.
function stockOpen(userId, side, amount, want, lev) {
    const cfg = stockCfg();
    const short = side === 'short';
    if (!cfg.open) return { error: 'Sàn đang tạm đóng - chỉ đóng lệnh được, chưa mở lệnh mới' };
    if ((debtStatus(userId) || {}).bad) return { error: 'Bạn đang bị gắn ⚠️ nợ xấu - trả nợ xong mới vào lệnh được' };
    const me = getUserData(userId);
    const entry = short ? stockBid() : stockAsk();
    // ĐÒN BẨY: vốn bỏ ra × đòn bẩy = giá trị lệnh -> số CP nắm. Vốn vẫn là mức lỗ tối đa.
    const L = Math.max(1, Math.min(cfg.maxLev, Math.floor(Number(lev) || 1)));
    let shares = 0;
    if (Number.isFinite(want) && want > 0) shares = Math.floor(want);
    else if (Number.isFinite(amount) && amount > 0) shares = Math.floor(amount * L / entry);
    if (shares < 1) return { error: `Không đủ vào 1 CP (giá ${short ? 'bán' : 'mua'} đang ${entry.toLocaleString()}, đòn bẩy x${L})` };

    const pos = stockPos()[userId] || { side: short ? 'short' : 'long', shares: 0, cost: 0, margin: 0, openedAt: Date.now(), peak: 0 };
    if ((Number(pos.shares) || 0) > 0 && (pos.side === 'short') !== short) {
        return { error: `Bạn đang giữ lệnh ${pos.side === 'short' ? 'BÁN' : 'MUA'} - đóng lệnh đó trước rồi mới đổi chiều` };
    }
    pos.side = short ? 'short' : 'long';
    // Trần tính bằng CP (khối lượng), mà đòn bẩy làm CP phình lên rất nhanh: 10.000 vốn
    // ở x20 đã là ~199 CP. Nên báo lỗi phải nói THẲNG số vốn tối đa dùng được ở đòn bẩy
    // đang chọn, chứ không chỉ nói "tối đa 80 CP, bạn đang có 0" (chủ server đã dính).
    const held = Number(pos.shares) || 0;
    const capMoney = (capShares) => Math.max(0, Math.floor(capShares * entry / L));
    if (held + shares > cfg.maxPer) {
        const room = cfg.maxPer - held;
        if (room < 1) return { error: `Bạn đã giữ kịch trần ${cfg.maxPer} CP - đóng bớt lệnh rồi mới vào thêm được` };
        return {
            error: `Lệnh này cần ${shares} CP, quá trần ${cfg.maxPer} CP/người${held ? ` (đang giữ ${held})` : ''}. `
                + `Ở đòn bẩy x${L} thì vốn tối đa là ${capMoney(room).toLocaleString()} Dogcoin - hạ vốn hoặc hạ đòn bẩy.`,
        };
    }
    const leftSan = cfg.maxShares - stockShareCount();
    if (shares > leftSan) {
        if (leftSan < 1) return { error: 'Sàn đã kịch trần khối lượng - chờ người khác đóng lệnh' };
        return {
            error: `Sàn chỉ còn ${leftSan} CP. Ở đòn bẩy x${L} thì vốn tối đa là `
                + `${capMoney(leftSan).toLocaleString()} Dogcoin - hạ vốn hoặc hạ đòn bẩy.`,
        };
    }
    const basis = shares * entry;                 // giá trị lệnh (dùng tính lãi/lỗ)
    const margin = Math.max(1, Math.round(basis / L));   // VỐN trừ khỏi ví = lỗ tối đa
    if ((me.points || 0) < margin) return { error: `Cần ${margin.toLocaleString()} Dogcoin vốn, ví bạn có ${(me.points || 0).toLocaleString()}` };

    updatePoints(userId, -margin);
    // PHẢI đọc vốn cũ TRƯỚC khi đụng cost: posMargin() rơi về cost khi margin còn rỗng
    // (vị thế đời cũ chưa có đòn bẩy), nên đọc sau là lấy luôn giá trị lệnh làm vốn -
    // vào 10.000 mà ghi sổ 18.090 (check-stock3.js bắt được).
    const prevMargin = posMargin(pos);
    pos.shares = (Number(pos.shares) || 0) + shares;
    pos.cost = (Number(pos.cost) || 0) + basis;
    pos.margin = prevMargin + margin;
    if (!pos.openedAt) pos.openedAt = Date.now();
    stockPos()[userId] = pos;
    const nhan = short ? 'BÁN (ăn khi giá xuống)' : 'MUA (ăn khi giá lên)';
    logDog('cophieu', userId, me.name || userId, -margin, `${short ? 'lệnh BÁN' : 'lệnh MUA'} ${shares} CP DOG @ ${entry.toLocaleString()} (đòn bẩy x${L})`);
    stockLog({ t: Date.now(), name: me.name || userId, side: short ? 'bán' : 'mua', shares, price: entry, lev: L });
    writeLog('BET', `[CỔ PHIẾU] ${me.name || userId} ${nhan} ${shares} CP @ ${entry.toLocaleString()} - vốn ${margin.toLocaleString()} đòn bẩy x${L}`);
    saveDbNow();
    return { ok: true, shares, price: entry, cost: margin, basis, lev: L, side: pos.side, state: stockState(userId) };
}

// BÁN: bán bao nhiêu CP cũng được (mặc định bán hết). Đóng hẳn vị thế thì ghi vào lịch sử.
// ĐÓNG LỆNH (một phần hoặc tất cả) - chiều nào cũng đi qua đây.
//   long : nhận shares × bid
//   short: nhận cọc phần đóng + lãi/lỗ = cọc + (cọc − shares × ask)
// forced=true là bị CHÁY (short lỗ hết cọc) - ghi log khác cho dễ truy.
function stockClose(userId, want, forced) {
    const pos = stockPos()[userId];
    const have = pos ? (Number(pos.shares) || 0) : 0;
    if (have < 1) return { error: 'Bạn không có lệnh nào đang mở' };
    let shares = Number.isFinite(want) && want > 0 ? Math.floor(want) : have;
    if (shares > have) shares = have;

    // VỐN BỊ CHÔN (22/08 theo yêu cầu chủ server): chưa đủ giờ giữ thì KHÔNG cho đóng,
    // hết cảnh vào lệnh thấy xanh một nhịp là rút ngay. Bot tự đóng vì CHÁY VỐN
    // (forced) thì bỏ qua chốt này, kẻo giam người chơi trong lệnh đã hết vốn.
    if (!forced) {
        const holdMs = stockCfg().holdS * 1000;
        const left = (Number(pos.openedAt) || 0) + holdMs - Date.now();
        if (holdMs > 0 && left > 0) {
            return { error: `Vốn đang bị chôn - còn ${Math.ceil(left / 1000)} giây nữa mới đóng lệnh được` };
        }
    }

    const me = getUserData(userId);
    const short = pos.side === 'short';
    const exit = short ? stockAsk() : stockBid();
    const part = shares / have;
    const basisPart = Math.round((Number(pos.cost) || 0) * part);      // giá trị lệnh phần đóng
    const marginPart = Math.round(posMargin(pos) * part);              // VỐN phần đóng
    const lev = Math.round(posLev(pos) * 10) / 10;
    // Lỗ ăn hết vốn thì ĂN TIẾP VÀO VÍ, chặn ở đúng lúc ví cạn (không bao giờ âm ví).
    // Kẹp lại để lịch sử/bảng vàng khớp đúng số tiền đã dịch chuyển, không phóng đại
    // (kiểu lỗi check-stock2.js từng bắt được).
    const walletNow = Math.max(0, Number(getUserData(userId).points) || 0);
    const room = marginPart + walletNow;         // đóng phần này thì chịu lỗ được tới đây
    // 24/08: nhân sức nặng điểm giá - PHẢI cùng hệ số với stockPL, lệch là burn check
    // đóng lệnh ở mức lỗ khác với số tiền thật sự trừ ví.
    let pl = stockCfg().pointX * (short ? (basisPart - shares * exit) : (shares * exit - basisPart));
    if (pl < -room) pl = -room;
    const back = marginPart + pl;   // CÓ THỂ ÂM -> trừ tiếp vào ví; theo cách kẹp trên
                                    // thì ví + back luôn >= 0

    updatePoints(userId, back);
    pos.shares = have - shares;
    pos.cost = Math.max(0, (Number(pos.cost) || 0) - basisPart);
    pos.margin = Math.max(0, posMargin(pos) - marginPart);
    if (pos.shares < 1) delete stockPos()[userId];
    else stockPos()[userId] = pos;

    stockClosed().unshift({
        t: Date.now(), userId, name: me.name || userId, side: short ? 'short' : 'long',
        shares, avg: Math.round(basisPart / shares), price: exit, pl, lev, forced: !!forced,
    });
    while (stockClosed().length > STOCK_CLOSED_N) stockClosed().pop();
    logDog('cophieu', userId, me.name || userId, back, `đóng lệnh ${short ? 'BÁN' : 'MUA'} ${shares} CP @ ${exit.toLocaleString()} x${lev} (${pl >= 0 ? '+' : ''}${pl.toLocaleString()})${forced ? ' [CHÁY VỐN]' : ''}`);
    stockLog({ t: Date.now(), name: me.name || userId, side: short ? 'đóng bán' : 'đóng mua', shares, price: exit, pl });
    writeLog('RESULT', `[CỔ PHIẾU] ${me.name || userId} ĐÓNG ${short ? 'BÁN' : 'MUA'} ${shares} CP @ ${exit.toLocaleString()} -> ${pl >= 0 ? 'lãi' : 'lỗ'} ${Math.abs(pl).toLocaleString()}${forced ? ' (CHÁY CỌC)' : ''}`);
    saveDbNow();
    return { ok: true, shares, price: exit, proceeds: back, pl, forced: !!forced, state: stockState(userId) };
}
// CHÁY VỐN - giờ áp cho CẢ HAI CHIỀU vì có đòn bẩy: lệnh MUA đòn bẩy x20 chỉ cần giá
// đi ngược 5% là hết vốn. Chạy mỗi nhịp giá, bot đóng hộ để không ai âm ví.
function stockBurnCheck() {
    for (const [uid, p] of Object.entries(stockPos())) {
        if ((Number(p.shares) || 0) < 1) continue;
        // CHÁY VÍ: lỗ ăn hết vốn LẪN số dư còn lại. Ai nhiều tiền trong ví thì gồng
        // được sâu hơn - đó là ý đồ, nhưng cũng nghĩa là mất sạch ví trong một lệnh.
        if (stockPL(p) <= -posBuffer(uid, p)) {
            const lev = Math.round(posLev(p) * 10) / 10;
            stockClose(uid, p.shares, true);
            writeLog('SYSTEM', `[CỔ PHIẾU] Lệnh ${p.side === 'short' ? 'BÁN' : 'MUA'} x${lev} của ${getUserData(uid).name || uid} CHÁY VÍ (lỗ ăn hết vốn + số dư)`);
        }
    }
}

// 🤖 TỰ ĐỘNG ĐÓNG LỆNH theo 2 mốc giá (25/08, chủ server yêu cầu): người chơi nhìn cột
// giá bên phải đồ thị rồi điền - "rớt tới X thì tự cắt" và/hoặc "tăng tới Y thì tự cắt"
// (cắt lỗ hay chốt lời là tuỳ vị thế, bot không phân biệt - chạm mốc là đóng CẢ lệnh).
// So với giá MID (giá đang hiện trên đồ thị) cho khớp mắt người chơi; đóng thì vẫn ăn
// giá bid/ask như đóng tay. Để trống cả 2 mốc = xoá.
function stockAuto(userId, low, high) {
    const pos = stockPos()[userId];
    if (!pos || (Number(pos.shares) || 0) < 1) return { error: 'Bạn không có lệnh nào đang mở' };
    const l = Math.max(0, Math.floor(Number(low) || 0));
    const h = Math.max(0, Math.floor(Number(high) || 0));
    if (l && h && l >= h) return { error: 'Mốc dưới phải NHỎ hơn mốc trên' };
    const p = stockPrice();
    if (l && l >= p) return { error: `Mốc dưới (${l.toLocaleString()}) phải NHỎ hơn giá hiện tại (${p.toLocaleString()})` };
    if (h && h <= p) return { error: `Mốc trên (${h.toLocaleString()}) phải LỚN hơn giá hiện tại (${p.toLocaleString()})` };
    pos.autoLow = l || null;
    pos.autoHigh = h || null;
    saveDbNow();
    writeLog('SYSTEM', `[CỔ PHIẾU] ${getUserData(userId).name || userId} đặt mốc tự đóng: dưới ${l || '-'} / trên ${h || '-'}`);
    return { ok: true, autoLow: l || 0, autoHigh: h || 0 };
}
// Chạy mỗi nhịp giá, SAU burn check (cháy ví ưu tiên). Vẫn tôn trọng thời gian chôn
// vốn như đóng tay: chưa đủ giờ giữ thì chờ nhịp sau, mốc vẫn còn nguyên.
function stockAutoCheck() {
    const p = stockPrice();
    const holdMs = stockCfg().holdS * 1000;
    for (const [uid, pos] of Object.entries(stockPos())) {
        if ((Number(pos.shares) || 0) < 1) continue;
        const l = Number(pos.autoLow) || 0;
        const h = Number(pos.autoHigh) || 0;
        if (!l && !h) continue;
        const hitLow = l > 0 && p <= l;
        const hitHigh = h > 0 && p >= h;
        if (!hitLow && !hitHigh) continue;
        if (holdMs > 0 && Date.now() - (Number(pos.openedAt) || 0) < holdMs) continue;
        const r = stockClose(uid, Number(pos.shares) || 0, false);
        if (r && r.ok) {
            writeLog('SYSTEM', `[CỔ PHIẾU] 🤖 TỰ ĐÓNG lệnh của ${getUserData(uid).name || uid}: giá ${p.toLocaleString()} chạm mốc ${hitLow ? 'DƯỚI ' + l.toLocaleString() : 'TRÊN ' + h.toLocaleString()} -> ${r.pl >= 0 ? 'lãi' : 'lỗ'} ${Math.abs(r.pl).toLocaleString()}`);
        }
    }
}

// Tin tốt/tin xấu do admin thả ở panel - giá bật/sụp NGAY một nhịp
// CAN THIỆP KÍN (25/08, thay "thả tin"): admin đặt ±% -> giá TRÔI DẦN tới đích trong
// ~2-3 phút, KHÔNG banner, KHÔNG toast cho người chơi - trên web nó chỉ là một xu hướng.
// Người chơi vẫn phản ứng được (bán giữa đường) vì giá đi từ từ, không nhảy cột.
function stockPush(pct, ticks) {
    const p0 = stockPrice();
    const target = Math.round(Math.min(STOCK_MAX, Math.max(STOCK_MIN, p0 * (1 + pct / 100))));
    const t = Math.max(15, Math.min(300, Math.floor(ticks) || 75));   // mặc định 75 nhịp = 150 giây
    dbCache._stockDrift = { target, ticksLeft: t, by: 'admin' };
    writeLog('ADMIN', `[CỔ PHIẾU] Can thiệp KÍN ${pct > 0 ? '+' : ''}${pct}%: ${p0.toLocaleString()} -> đích ${target.toLocaleString()} trong ${Math.round(t * STOCK_TICK_MS / 1000)} giây`);
    saveDbNow();
    return { pct, from: p0, target, secs: Math.round(t * STOCK_TICK_MS / 1000) };
}
// (26/08 tối: stockAutoDrift + stockBigWave đời cũ ĐÃ GỠ - neo lang thang giờ chạy
//  gọn trong stockTick, không cần hàm riêng. Admin can thiệp tay vẫn qua stockPush.)
// Cập nhật "đỉnh lãi từng gồng qua" của từng người - chạy mỗi nhịp giá
function stockTouchPeaks() {
    for (const p of Object.values(stockPos())) {
        if ((Number(p.shares) || 0) < 1) continue;
        const pl = stockPL(p);
        if (pl > (Number(p.peak) || 0)) p.peak = pl;
    }
}
function runStockLoop() {
    if (!Number.isFinite(Number(dbCache._stockPrice))) dbCache._stockPrice = STOCK_BASE;
    // RESET MỘT LẦN v3 (26/08 tối, chủ server chốt): BỎ HẲN data giả lập - đồ thị chạy
    // bằng nến THẬT từ đầu, giá xuất phát 4000 (mốc gốc mới). Đóng hộ mọi lệnh đang mở
    // theo giá hiện tại TRƯỚC khi đổi giá (tiền về ví đúng luật đóng, không ai cháy oan
    // vì giá nhảy cóc). _stockSeedV=3 đánh dấu đã chạy - boot sau không đụng nữa.
    // (Gộp luôn vai trò của migrate 1000->5000 cũ: server chính còn giá đời cũ vào đây.)
    // RESET MỘT LẦN v5 (26/08 tối, chủ server chốt: bỏ sóng lớn, về mốc 1.000 biên
    // 100-1.500). Đóng hộ mọi lệnh đang mở theo giá hiện tại TRƯỚC khi đổi mốc (tiền
    // về ví đúng luật đóng), xoá NEO/DRIFT sóng cũ (hết "🌊 ĐANG NEO vùng..."), đưa
    // giá về 1.000, tắt waveOn, làm mới nến. _stockSeedV=5 - chạy đúng 1 lần.
    if ((dbCache._stockSeedV | 0) < 6) {
        for (const [uid, p] of Object.entries(stockPos())) {
            if ((Number(p.shares) || 0) < 1) continue;
            const r = stockClose(uid, Number(p.shares) || 0, true);
            writeLog('SYSTEM', `[CỔ PHIẾU] RESET neo lang thang: đóng hộ lệnh của ${getUserData(uid).name || uid} (${r && r.ok ? (r.pl >= 0 ? '+' : '') + r.pl : 'lỗi'})`);
        }
        dbCache._stockPrice = STOCK_BASE;
        dbCache._stockDrift = null;
        dbCache._stockAnchor = { v: STOCK_BASE, target: STOCK_BASE, legLeft: 0 };
        dbCache._stockCandles = [];
        // 28/08: ngưỡng đời cũ 350/1650 lưu trong db -> nâng lên 550/3650 theo biên mới,
        // và ép neo bốc chặng lại ngay (chặng cũ có thể đang nhắm đích ~150 dưới đáy mới)
        if (dbCache._stockCfg && Number(dbCache._stockCfg.waveLow) === 350 && Number(dbCache._stockCfg.waveHigh) === 1650) {
            dbCache._stockCfg.waveLow = 550; dbCache._stockCfg.waveHigh = 3650;
            writeLog('SYSTEM', '[CỔ PHIẾU] Biên mới 10-4.000: nâng ngưỡng mềm 350/1650 -> 550/3650');
        }
        if (dbCache._stockAnchor) dbCache._stockAnchor.legLeft = 0;
        // bật lại neo lang thang (v5 đã tắt) - xoá cờ waveOn=false cũ để ăn mặc định BẬT
        if (dbCache._stockCfg && typeof dbCache._stockCfg === 'object') delete dbCache._stockCfg.waveOn;
        dbCache._stockSeedV = 6;
        writeLog('SYSTEM', '[CỔ PHIẾU] RESET v6: neo lang thang 100-2.000, giá về 1.000, nến 60s lình xình');
        saveDbNow();
    }
    // kho đổi cỡ (2 ngày -> 4 giờ): nến cũ dư thì cắt ngay lúc boot cho gọn db
    if (Array.isArray(dbCache._stockCandles) && dbCache._stockCandles.length > STOCK_HIST_N) {
        dbCache._stockCandles = dbCache._stockCandles.slice(-STOCK_HIST_N);
        saveDbNow();
    }
    // MIGRATE MỘT LẦN (24/08): cấu hình đời trước sức-nặng còn lưu cứng spread 0.5%.
    // Có pointX=5 mà giữ 0.5% thì phí vòng bị nhân 5 -> mở lệnh x10 lỗ sẵn ~50% vốn.
    // Chỉ đụng khi admin CHƯA từng biết tới pointX (chưa có field) VÀ spread đúng 0.005.
    const mcfg = dbCache._stockCfg;
    if (mcfg && typeof mcfg === 'object' && mcfg.pointX === undefined && Number(mcfg.spread) === 0.005) {
        mcfg.spread = 0.001;
        writeLog('SYSTEM', '[CỔ PHIẾU] Có SỨC NẶNG điểm giá (x5) - tự hạ chênh mua-bán 0.5% -> 0.1%/chiều cho phí vòng giữ nguyên');
        saveDbNow();
    }
    stockCandles();
    // Nến đời trước (mỗi cây = 1 nhịp, không có trường n) không trộn được với nến
    // 40 giây: cây cuối coi như đã chốt để cây kế mở sạch, khỏi nối lệch cấu trúc.
    const csBoot = dbCache._stockCandles;
    if (csBoot.length && csBoot[csBoot.length - 1].n === undefined) {
        csBoot[csBoot.length - 1].n = STOCK_CANDLE_TICKS;
        writeLog('SYSTEM', '[CỔ PHIẾU] Nến đời cũ - chốt cây cuối để chuyển sang nến 40 giây');
    }
    delete dbCache._stockNews;   // 25/08: bỏ banner tin - can thiệp giờ là TRÔI KÍN
    dbCache._stockNextTick = Date.now() + STOCK_TICK_MS;
    setInterval(() => {
        try {
            // 26/08 tối: NEO LANG THANG chạy gọn trong stockTick (neo tự đi bộ khắp
            // dải 100-2000, giá bám theo). Admin can thiệp tay qua stockPush (_stockDrift).
            stockTick();
            stockBurnCheck();   // lệnh BÁN lỗ hết cọc thì đóng hộ, không để ai âm ví
            stockAutoCheck();   // 🤖 mốc tự đóng người chơi đặt (25/08)
            stockTouchPeaks();
            dbCache._stockNextTick = Date.now() + STOCK_TICK_MS;
        } catch (e) { writeLog('SYSTEM', `[CỔ PHIẾU] Lỗi nhịp giá: ${e.message}`); }
    }, STOCK_TICK_MS);
    writeLog('SYSTEM', `[CỔ PHIẾU] Sàn DOG chạy - giá ${stockPrice().toLocaleString()}, nhịp ${STOCK_TICK_MS / 1000}s`);
}

// ===== BẢNG DÒ MÌN TRÊN DISCORD =====
// Khác Big Small: dò mìn không có ván chung theo giờ, mỗi người chơi ván riêng trên web.
// Nên bảng này chỉ là chỗ mời chơi + khoe 10 ván gần nhất, KHÔNG có nút đặt cược.
// Có ván mới thì XOÁ tin cũ + ĐĂNG lại (tối đa 1 lần/phút) - xem repostBoard.
const minesBoard = { channel: null, message: null, needsUpdate: false, lastEdit: 0 };

// ===== DÒNG LỊCH SỬ DÙNG CHUNG CHO DÒ MÌN + LEO THANG =====
// Hai bảng trước đây mỗi bảng một kiểu chữ. Giờ cùng một khuôn:
//   <emoji> **Tên** · <mô tả ván> · <±tiền> 🐕 · <thắng/thua> · còn <số dư> 🐕
// Hết tiền thì thay số dư bằng "PHÁ SẢN".
const BANKRUPT_EMOJI = ['💀', '🪦', '🍜', '🥲', '📉'];   // đổi vòng cho khỏi nhàm

function historyTail(h, i) {
    const win = h.amount >= 0;
    let out = `${win ? 'Thắng' : 'Thua'} **${Math.abs(h.amount).toLocaleString()}** ${DOGCOIN_EMOJI}`;
    // bal có thể thiếu ở các ván ghi từ bản cũ -> bỏ phần số dư, đừng in "số dư null"
    if (typeof h.bal === 'number') {
        out += ` · số dư ${h.bal.toLocaleString()} ${DOGCOIN_EMOJI}`;
        if (h.bal <= 0) out += ` **PHÁ SẢN** ${BANKRUPT_EMOJI[i % BANKRUPT_EMOJI.length]}`;
    }
    return out;
}

// Đuôi 🍀: ván có quay trúng ô may mắn thì khoe luôn trên bảng (quảng cáo miễn phí)
function luckBadge(h) {
    return (h.luck && h.luck.length) ? ` · 🍀${h.luck.join('')}` : '';
}

// Dò Mìn: 🏆/💰/💥 **Tên** · 8 mìn · mở 4 ô · Thắng 26 🐕 · số dư 1.234 🐕 · 🍀🛡️
function minesHistoryLine(h, i) {
    const head = h.result === 'Jackpot' ? '🏆' : (h.amount >= 0 ? '💰' : '💥');
    return `${head} **${h.name}** · ${h.mines} mìn · mở **${h.diamonds}** ô · ${historyTail(h, i)}${luckBadge(h)}`;
}

// Leo Thang: 🏆/💰/🔥 **Tên** · 1 lửa · tầng 7 · Thua 26 🐕 · số dư 0 🐕 PHÁ SẢN 💀 · 🍀🚀
function stairsHistoryLine(h, i) {
    const head = h.result === 'Lên đỉnh' ? '🏆' : (h.amount >= 0 ? '💰' : '🔥');
    return `${head} **${h.name}** · ${h.fire} lửa · tầng **${h.floor}** · ${historyTail(h, i)}${luckBadge(h)}`;
}



const BOARD_HISTORY_N = 10;   // 10 ván gần nhất của TẤT CẢ người chơi

function getMinesBoardData() {
    const recent = minesHistory.slice(0, BOARD_HISTORY_N);
    let desc =
        `Lưới **${TOTAL_TILES} ô**, bạn chọn **số mìn** và **tiền cược**, rồi đào từng ô.\n` +
        `Mỗi ô an toàn hệ số tăng thêm - **dừng lúc nào cũng được**, trúng mìn là mất tiền cược ván đó.\n\n` +
        `🎯 Càng nhiều mìn, hệ số càng cao. Kéo thanh bên dưới lưới để xem trước ăn bao nhiêu.\n\n`;

    if (recent.length) {
        desc += `**💣 ${recent.length} ván gần đây:**\n` + recent.map(minesHistoryLine).join('\n');
    } else {
        desc += `*Chưa có ai chơi ván nào. Mở hàng đi!*`;
    }

    const embed = new EmbedBuilder()
        .setTitle('💣 DÒ MÌN - chơi trên web')
        .setColor(0x8b5cf6)
        .setDescription(desc)
        .setFooter({ text: 'Bấm nút bên dưới để lấy link + mã PIN' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('web_pin').setLabel('🌐 Chơi Dò Mìn trên web').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row] };
}

async function startMinesBoard(channel) {
    if (minesBoard.message) await minesBoard.message.delete().catch(() => { });
    minesBoard.channel = channel;
    minesBoard.message = await channel.send(getMinesBoardData());
    minesBoard.needsUpdate = false;
    minesBoard.lastEdit = Date.now();
    dbCache._minesChannelId = channel.id;
    dbCache._minesMsgId = minesBoard.message.id;
    saveDbNow();
}

function stopMinesBoard() {
    if (minesBoard.message) minesBoard.message.delete().catch(() => { });
    minesBoard.channel = null;
    minesBoard.message = null;
    dbCache._minesChannelId = null;
    dbCache._minesMsgId = null;
    saveDbNow();
}

// Bot restart thì nối lại bảng cũ thay vì đăng bảng mới - đỡ rác kênh và người chơi
// không phải đi tìm bảng khác. Bảng dò mìn không có ván chung nên nối lại là an toàn.
async function resumeMinesBoard() {
    const chId = dbCache._minesChannelId;
    if (!chId) return;
    const ch = await client.channels.fetch(chId);
    const old = dbCache._minesMsgId ? await ch.messages.fetch(dbCache._minesMsgId).catch(() => null) : null;
    if (old) {
        minesBoard.channel = ch;
        minesBoard.message = old;
        minesBoard.lastEdit = Date.now();
        await old.edit(getMinesBoardData()).catch(() => { });
        writeLog('SYSTEM', `[BẢNG DÒ MÌN] Nối lại bảng cũ ở #${ch.name}`);
        return;
    }
    await startMinesBoard(ch);
    writeLog('SYSTEM', `[BẢNG DÒ MÌN] Bảng cũ mất, đã đăng bảng mới ở #${ch.name}`);
}

// ===== BẢNG LEO THANG TRÊN DISCORD =====
// Cùng cách làm với bảng dò mìn: KÊNH RIÊNG (admin tự đặt từng bảng ở panel),
// có ván mới thì xoá tin cũ + đăng lại, tối đa 1 phút/lần - xem repostBoard.
const stairsBoard = { channel: null, message: null, needsUpdate: false, lastEdit: 0 };

function stairsBoardPush(entry, view) {
    stairsBoard.needsUpdate = true;
}

function stairsHistory() {
    return Array.isArray(dbCache._stairsHistory) ? dbCache._stairsHistory : [];
}

function getStairsBoardData() {
    const recent = stairsHistory().slice(0, BOARD_HISTORY_N);
    let desc =
        `Leo **${STAIRS_FLOORS} tầng**, mỗi tầng **${STAIRS_COLS} ô**. Bạn chọn mỗi tầng có mấy **cầu lửa** (1–${STAIRS_MAX_FIRE}).\n` +
        `Mỗi tầng bấm 1 ô: trúng ô trống thì lên tầng trên, hệ số nhân thêm - **dừng lúc nào cũng được**.\n` +
        `Trúng cầu lửa 🔥 là mất tiền cược ván đó.\n\n` +
        `🔥 Càng nhiều lửa mỗi tầng, hệ số càng cao (1 lửa lên đỉnh x3.61 · 5 lửa lên đỉnh x17k).\n` +
        `🍀 Có ô may mắn giấu trong tháp + 🌟 ô vàng hiếm lên thẳng đỉnh. Ăn NHỜ may mắn kịch khung x2.000 - tự lực thì ăn đủ.\n\n`;
    if (recent.length) {
        desc += `**🪜 ${recent.length} ván gần đây:**\n` + recent.map(stairsHistoryLine).join('\n');
    } else {
        desc += `*Chưa có ai leo. Mở hàng đi!*`;
    }

    const embed = new EmbedBuilder()
        .setTitle('🪜 LEO THANG - chơi trên web')
        .setColor(0xe67e22)
        .setDescription(desc)
        .setFooter({ text: 'Bấm nút bên dưới để lấy link + mã PIN' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('web_pin').setLabel('🌐 Chơi Leo Thang trên web').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row] };
}


async function startStairsBoard(channel) {
    if (stairsBoard.message) await stairsBoard.message.delete().catch(() => { });
    stairsBoard.channel = channel;
    stairsBoard.message = await channel.send(getStairsBoardData());
    stairsBoard.needsUpdate = false;
    stairsBoard.lastEdit = Date.now();
    dbCache._stairsChannelId = channel.id;
    dbCache._stairsMsgId = stairsBoard.message.id;
    saveDbNow();
}

function stopStairsBoard() {
    if (stairsBoard.message) stairsBoard.message.delete().catch(() => { });
    stairsBoard.channel = null;
    stairsBoard.message = null;
    dbCache._stairsChannelId = null;
    dbCache._stairsMsgId = null;
    saveDbNow();
}

async function resumeStairsBoard() {
    const chId = dbCache._stairsChannelId;
    if (!chId) return;
    const ch = await client.channels.fetch(chId);
    const old = dbCache._stairsMsgId ? await ch.messages.fetch(dbCache._stairsMsgId).catch(() => null) : null;
    if (old) {
        stairsBoard.channel = ch;
        stairsBoard.message = old;
        stairsBoard.lastEdit = Date.now();
        await old.edit(getStairsBoardData()).catch(() => { });
        writeLog('SYSTEM', `[BẢNG LEO THANG] Nối lại bảng cũ ở #${ch.name}`);
        return;
    }
    await startStairsBoard(ch);
}

// CÁCH CẬP NHẬT BẢNG (đổi 21/08 - trước đó ván nào cũng xoá-rồi-đăng-mới):
//   · Bảng vẫn là tin CUỐI kênh  -> SỬA TẠI CHỖ. Không đẻ tin mới thì không thể có
//     bảng mồ côi, lại đỡ nửa số Discord API call. Kênh bảng thường không ai nhắn
//     nên đây là đường chạy gần như luôn luôn.
//   · Có người nhắn đè xuống dưới -> mới ĐĂNG TIN MỚI cho bảng nổi về cuối kênh,
//     giữ đúng ý ban đầu: người chơi khỏi cuộn lên tìm.
// Sửa tại chỗ rẻ và không spam nên cho nhanh hơn (10s); đăng tin mới vẫn 1 phút/lần.
// GỬI TRƯỚC, XOÁ SAU: lỡ gửi lỗi thì bảng cũ còn đó, kênh không bao giờ trống bảng.
const BOARD_REPOST_MS = 60 * 1000;
const BOARD_EDIT_MS = 10 * 1000;
// Dọn bảng mồ côi - DÙNG CHUNG cho Big Small / Dò Mìn / Leo Thang (bug 21/08).
// Cả 3 bàn đều xoá bảng cũ kiểu fire-and-forget rồi nuốt lỗi; VPS này có Connect
// Timeout tới Discord nên xoá hụt là chuyện thường, và mỗi lần restart lại bỏ thêm
// một bảng chết. Thay vì tin vào lệnh xoá, quét kênh gỡ mọi bảng CÙNG LOẠI không
// phải bảng đang dùng - hỏng kiểu gì thì lượt đăng sau kênh cũng tự sạch.
async function sweepBoards(channel, keepId, titleMatch, label) {
    if (!channel || !client.user) return;
    try {
        const msgs = await channel.messages.fetch({ limit: 30 });
        const junk = msgs.filter(m => m.author?.id === client.user.id
            && m.id !== keepId
            && (m.embeds?.[0]?.title || '').includes(titleMatch));
        for (const m of junk.values()) await m.delete().catch(() => { });
        if (junk.size) writeLog('SYSTEM', `[${label}] Dọn ${junk.size} bảng mồ côi ở #${channel.name}`);
    } catch (e) {
        writeLog('SYSTEM', `[${label}] Không dọn được bảng mồ côi: ${e.message}`);
    }
}

async function repostBoard(board, getData, msgKey, label, titleMatch) {
    if (!board.channel || !board.needsUpdate) return;
    // lastMessageId do gateway đẩy về (bot có intent GuildMessages) - không tốn API call
    const isLast = !!board.message && board.channel.lastMessageId === board.message.id;
    if (Date.now() - board.lastEdit < (isLast ? BOARD_EDIT_MS : BOARD_REPOST_MS)) return;
    board.needsUpdate = false;
    board.lastEdit = Date.now();
    if (isLast) {
        try {
            await board.message.edit(getData());
        } catch (e) {
            writeLog('SYSTEM', `[${label}] Sửa bảng tại chỗ hụt: ${e.message}`);
            board.needsUpdate = true;   // lượt sau thử lại, hụt mãi thì đăng tin mới
        }
        return;
    }
    const old = board.message;
    try {
        board.message = await board.channel.send(getData());
        dbCache[msgKey] = board.message.id;   // để restart nối lại đúng tin mới nhất
        // KHÔNG nuốt lỗi nữa - xoá hụt phải để lại dấu vết thì lần sau mới truy được
        if (old) old.delete().catch((e) => writeLog('SYSTEM', `[${label}] Xoá bảng cũ hụt: ${e.message}`));
        if (titleMatch) await sweepBoards(board.channel, board.message.id, titleMatch, label);
    } catch (e) {
        writeLog('SYSTEM', `[${label}] Không đăng lại được bảng: ${e.message}`);
        board.needsUpdate = true; // giữ cờ, phút sau thử lại
    }
}

function runStairsBoardLoop() {
    setInterval(() => { repostBoard(stairsBoard, getStairsBoardData, '_stairsMsgId', 'BẢNG LEO THANG', 'LEO THANG').catch(() => { }); }, 5000);
}

// (Bảng 📊 THỐNG KÊ NGƯỜI CHƠI đã BỎ 19/08 theo yêu cầu chủ server - cả bảng
// Discord lẫn tab panel. Dữ liệu _pstats vẫn được statAdd đếm ngầm; muốn dựng lại
// thì lục git history: getStatsBoardData/start/stop/resume/runStatsBoardLoop,
// resetStats, addJackpotStat + tab-st bên panel.js.)

function runMinesBoardLoop() {
    setInterval(() => { repostBoard(minesBoard, getMinesBoardData, '_minesMsgId', 'BẢNG DÒ MÌN', 'DÒ MÌN').catch(() => { }); }, 5000);
}

// --- ĐĂNG KÝ LỆNH SLASH ---
const commands = [
    // (DÒ MÌN đã chuyển hẳn lên web; khối lệnh /domin cũ đã XÓA hẳn 04/09 - cần thì lục git history.)
    new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví của bạn'),
    new SlashCommandBuilder().setName('diemdanh').setDescription(`Nhận ${dailyCfg().daily.toLocaleString()} Dogcoin mỗi ngày (reset 00:00)`),
    new SlashCommandBuilder().setName('nghien').setDescription(`Điểm danh con nghiện: nhận ${dailyCfg().nghien.toLocaleString()} Dogcoin, 1 tiếng/lần`),
    new SlashCommandBuilder().setName('chuyentien').setDescription('Chuyển Dogcoin')
        .addUserOption(opt => opt.setName('nguoi').setDescription('Người nhận Dogcoin').setRequired(true))
        .addIntegerOption(opt => opt.setName('sotien').setDescription('Số Dogcoin muốn chuyển').setRequired(true)),
    // (/addtien /trutien đã XÓA: nhiều người cầm key admin Discord, quyền
    //  Administrator không còn đồng nghĩa "được đụng ví". Cộng/trừ tay giờ
    //  CHỈ làm ở web panel.)

].map(c => c.toJSON());

client.once('ready', async (c) => {
    writeLog('SYSTEM', `✅ Bot ${c.user.tag} online!`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    } catch (e) { writeLog('SYSTEM', `[LỖI ĐĂNG KÝ LỆNH] ${e.message}`); }
    // (Bầu Cua đã gỡ hẳn; Xổ số tạm tắt)
    seedItemShopIfEmpty();   // 🛒 seed món mặc định nếu DB chưa có danh mục item
    backfillItemShopCat();   // 🛒 điền nhóm (vũ khí/giáp/tiêu hao) cho món cũ thiếu cat
    // ⏳ 03/09: hạ cooldown nhận pal 5 phút -> 2 phút. Chạy ĐÚNG 1 LẦN (cờ _migClaimCd120):
    // cfg đã lưu trong DB đè default nên phải sửa tận nơi; sau này admin chỉnh panel thì giữ nguyên.
    if (!dbCache._migClaimCd120) {
        dbCache._migClaimCd120 = 1;
        if (dbCache._palWheelCfg && dbCache._palWheelCfg.claimCd === 300) dbCache._palWheelCfg.claimCd = 120;
        saveDbNow();
    }
    // 🍀 04/09: bỏ mục "May mắn admin set" ở panel - chủ server chốt chơi mặc định.
    // Xoá 1 lần mọi % override còn sót trên người chơi (không thì nó âm thầm áp mãi
    // mà không còn UI nào để thấy/gỡ).
    if (!dbCache._migClearPalLuckRate0409) {
        dbCache._migClearPalLuckRate0409 = 1;
        let cleared = 0;
        for (const [k, v] of Object.entries(dbCache)) {
            if (k.startsWith('_') || !v || typeof v !== 'object') continue;
            if (v.palLuckRate !== undefined) { delete v.palLuckRate; cleared++; }
        }
        if (cleared) writeLog('SYSTEM', `[VÒNG QUAY PAL] Xoá % may mắn admin set của ${cleared} người - tất cả về mặc định`);
        saveDbNow();
    }
    runSpmLoop();    // 🚀 Phi Thuyền (crash game) - vòng chơi chung
    runTaiXiuLoop(); // BIG SMALL vẫn chạy
    // runXoSoLoop();
    // resumeXosoAfterRestart().catch(() => {});
    runMinesBoardLoop();
    resumeMinesBoard().catch(e => writeLog('SYSTEM', `[BẢNG DÒ MÌN] Không nối lại được: ${e.message}`));
    runSpmBoardLoop();
    resumeSpmBoard().catch(e => writeLog('SYSTEM', `[BẢNG PHI THUYỀN] Không nối lại được: ${e.message}`));
    // Blackjack ĐÃ HỦY - không nối lại bảng Discord; nếu bảng cũ còn treo thì gỡ luôn.
    (async () => {
        try {
            if (dbCache._bjChannelId && dbCache._bjMsgId) {
                const ch = await client.channels.fetch(dbCache._bjChannelId);
                const old = await ch.messages.fetch(dbCache._bjMsgId).catch(() => null);
                if (old) await old.delete().catch(() => { });
                writeLog('SYSTEM', '[BẢNG BLACKJACK] Đã gỡ bảng cũ (trò đã hủy)');
            }
        } catch (e) { /* kênh cũ mất cũng kệ */ }
        dbCache._bjChannelId = null; dbCache._bjMsgId = null;
    })();
    // 🎡 hoàn vé vòng quay còn treo từ trước khi restart
    wheelRefundPending();
    // 💸 hoàn tiền cược ván dở (Big Small / Bầu Cua / Dò Mìn / Leo Thang) của phiên trước
    refundBootPendingBets();
    // 🎲 27/08: TỰ KHỞI ĐỘNG Big Small ở kênh đã lưu (_txChannelId) - khỏi cần admin
    // bấm mở bảng lại mỗi lần restart. Chưa từng mở (không có kênh lưu) thì bỏ qua.
    (async () => {
        try {
            if (dbCache._txChannelId) {
                const ch = await client.channels.fetch(dbCache._txChannelId).catch(() => null);
                if (ch) { await startLonnho(ch); writeLog('SYSTEM', `[BIG SMALL] Tự khởi động lại ở #${ch.name || ch.id}`); }
            }
        } catch (e) { writeLog('SYSTEM', `[BIG SMALL] Không tự mở lại được: ${e.message}`); }
    })();
    runStairsBoardLoop();
    runStockLoop();   // 📈 sàn cổ phiếu DOG (chỉ chơi trên web)
    resumeStairsBoard().catch(e => writeLog('SYSTEM', `[BẢNG LEO THANG] Không nối lại được: ${e.message}`));
    // Bảng 📊 THỐNG KÊ ĐÃ BỎ (19/08 theo yêu cầu chủ server) - bảng cũ còn treo thì gỡ.
    (async () => {
        try {
            if (dbCache._statsChannelId && dbCache._statsMsgId) {
                const ch = await client.channels.fetch(dbCache._statsChannelId);
                const old = await ch.messages.fetch(dbCache._statsMsgId).catch(() => null);
                if (old) await old.delete().catch(() => { });
                writeLog('SYSTEM', '[BẢNG THỐNG KÊ] Đã gỡ bảng cũ (tính năng đã bỏ)');
            }
        } catch (e) { /* kênh cũ mất cũng kệ */ }
        dbCache._statsChannelId = null; dbCache._statsMsgId = null;
    })();

    // Cổng web cược cho người chơi (tách hẳn panel admin)
    try {
        startWebPlay({
            port: parseInt(process.env.PLAY_PORT) || 3002,
            lockSeconds: TX_LOCK_S,
            getTX: () => txState,
            txMaxBet,        // 💰 trần cược TX/người/ván (hiện trên trang cược)
            txCapCheck,      // 💰 chặn vượt trần (dùng chung luật với Discord)
            getDb: () => dbCache,
            getUserData,
            updatePoints,
            saveDbNow,
            writeLog,
            mines: webMinesApi,
            stairs: webStairsApi,
            webPlayUrl: WEB_PLAY_URL,
            transfer: webTransfer,
            transferMulti: webTransferMulti,
            transferTargets: listTransferTargets,
            // 🎮 nạp/rút Dogcoin ↔ game qua web (28/08)
            dogbridge: {
                rut: (uid, amount) => webRutGame(uid, amount),
                nap: (uid, amount) => webNapGame(uid, amount),
                state: (uid) => ({ ingameName: (getUserData(uid).ingameName || '').trim(), balance: getUserData(uid).points || 0, max: WITHDRAW_MAX_PER_REQUEST, rutOpen: dogBridgeCfg().rut, napOpen: dogBridgeCfg().nap,
                    dayMax: dogBridgeDayMax(), rutToday: dogBridgeToday(getUserData(uid)).rut, napToday: dogBridgeToday(getUserData(uid)).nap }),   // 🔁 09/09 công tắc · 📅 11/09 hạn ngày
            },
            // 📅 điểm danh tháng + 💉 nghiện - cùng logic với /diemdanh, /nghien
            // lụm từ WEB thì mới đăng công khai vào kênh nghiện (xem claimNghien)
            daily: {
                state: dailyState, claim: claimDaily, streak: claimStreak,
                nghien: (uid) => claimNghien(uid, true),   // lụm từ WEB thì đăng công khai
            },
            // 🎡 vòng quay may mắn nhóm (thay blackjack)
            wheel: { state: wheelState, ready: wheelReady, unready: wheelUnready, spin: wheelSpin, spin1: wheelSpin1 },
            // 📈 sàn cổ phiếu DOG - game thuần web, không có bảng Discord
            stock: {
                lotSize: STOCK_LOT,
                state: stockState,
                hist: () => stockCandles(),   // cả kho 2 ngày - route riêng, client cache 60s
                open: (uid, side, amount, want, lev) => stockOpen(uid, side, amount, want, lev),
                close: (uid, want) => stockClose(uid, want),
                auto: (uid, low, high) => stockAuto(uid, low, high),   // 🤖 mốc tự đóng
            },
            // 📒 vay nợ: xem + trả ngay trên web (vay thì qua bảng Discord)
            debt: {
                state: (uid) => debtStatus(uid),
                pay: (uid, amt) => debtPay(uid, getUserData(uid).name || uid, amt),
            },
            // 🎁 quay pal kiểu CSGO + rương/hồ sơ (25/08)
            palwheel: {
                state: (uid) => {
                    const cfg = palWheelCfg();
                    const u = getUserData(uid);
                    // ⏳ còn bao nhiêu ms nữa mới mở khoá quay (lượt mới nhất chưa hiện xong).
                    // CHỈ để client dựng lại NÚT ĐẾM NGƯỢC sau F5 - KHÔNG kèm kết quả nên
                    // không xem trộm được, và KHÔNG chạy lại hoạt hình (tránh lỗi resume cũ).
                    const newest = palChest(uid)[0];
                    const spinRemain = (newest && newest.revealAt && newest.status === 'chest' && newest.revealAt > Date.now())
                        ? (newest.revealAt - Date.now()) : 0;
                    return {
                        price: cfg.price, sellPrice: cfg.sellPrice, open: cfg.open,
                        pot: potGet('gacha'), spinRemain,
                        // 27/08: kèm code để web gắn hình (/palimage/T_<code>_icon_normal.png)
                        pals: palWheelNormalPool().map(p => ({ name: p.name, code: p.code, dex: p.dex || 0, legend: palIsLegend(p.code) })),
                        raids: palWheelRaidPool().map(p => ({ name: p.name, code: p.code, dex: p.dex || 0 })),
                        // 🍀 thanh may mắn + vòng raid (27/08): đầy 100 mới quay raid, xong về 0
                        luck: typeof u.palLuck === 'number' ? u.palLuck : 0,
                        raidReady: cfg.raidWheelOn && (u.palLuck || 0) >= 100,
                        raidWheelOn: cfg.raidWheelOn,
                        raidBonus: cfg.raidBonus,
                        raidWheelPals: palLuckyRaidPool().map(p => ({ name: p.name, code: p.code, dex: p.dex || 0 })),
                        // không đếm pal đang quay dở (chưa tới revealAt) - khỏi lộ kết quả sớm
                        chestCount: palChest(uid).filter(i => i.status === 'chest' && (!i.revealAt || i.revealAt <= Date.now())).length,
                    };
                },
                spin: (uid) => palWheelSpin(uid, getUserData(uid).name || uid),
                raidSpin: (uid) => palRaidSpin(uid, getUserData(uid).name || uid),
                // 🎯 chọn pal đích danh (danh sách + mua)
                pickState: (uid) => {
                    const cfg = palWheelCfg();
                    // 26/08: 4 boss raid bán đích danh giá riêng, xếp LÊN ĐẦU danh sách · 🔒 PAL GỐC: ẩn (chỉ quay random)
                    const raidRows = (cfg.raw ? [] : PALPICK_RAID.filter(x => cfg[x.key] > 0))
                        .map(x => palWheelRaidPool().find(p => p.name === x.name))
                        .filter(Boolean)
                        .map(p => ({ code: p.code, name: p.name, dex: p.dex || 0, raid: true, price: palPickPrice(p, cfg) }));
                    return {
                        price: cfg.customPrice,
                        open: cfg.open,
                        pot: potGet('gacha'),
                        chestCount: palChest(uid).filter(i => i.status === 'chest').length,
                        list: raidRows.concat(palWheelNormalPool().map(p => ({ code: p.code, name: p.name, dex: p.dex || 0, raid: false, legend: palIsLegend(p.code), price: cfg.customPrice }))),
                    };
                },
                pick: (uid, code) => palPickBuy(uid, code, getUserData(uid).name || uid),
            },
            profile: {
                state: (uid) => {
                    const cfg = palWheelCfg();
                    return {
                        // pal quay dở (chưa tới revealAt) KHÔNG hiện - F5 cũng không xem trộm được
                        chest: palChest(uid).filter(i => !i.revealAt || i.revealAt <= Date.now()),
                        sellPrice: cfg.sellPrice, soulMax: cfg.soulMax,
                        soulPct: cfg.soulPct, passiveMax: cfg.passiveMax, ivs: cfg.ivs,
                        // 💎 bảng giá nâng cấp để client tính phí y hệt server
                        up: { slot5: cfg.upSlot5, slot6: cfg.upSlot6, slot7: cfg.upSlot7, slot8: cfg.upSlot8, slotLow: cfg.upSlotLow, iv: cfg.upIv, soulLine: cfg.upSoulLine, wt: cfg.upWtPassive, t4: cfg.upTier4, boss: cfg.upBoss, soul: [cfg.upSoul1, cfg.upSoul2, cfg.upSoul3, cfg.upSoul4, cfg.upSoul5] },
                        level: cfg.level, stars: cfg.stars, boss: cfg.boss, raw: cfg.raw,   // 🔒 tắt chỉ số
                        noBoss: Array.isArray(dbCache._noBossCodes) ? dbCache._noBossCodes : [],   // 👑 code không có bản BOSS (bot tự học) - client ẩn nút
                        // ⏳ cooldown nhận pal CHUNG toàn server (ms còn lại + quy tắc giây/lần)
                        claimCdLeft: Math.max(0, (dbCache._palClaimCdUntil || 0) - Date.now()),
                        claimCd: cfg.claimCd,
                        // 🆘 tẩu thoát khẩn cấp: đồng hồ của TÔI (ms còn lại + độ dài cooldown)
                        rescueCdLeft: Math.max(0, ((getUserData(uid).lastRescue || 0) + RESCUE_CD_MS) - Date.now()),
                        rescueCd: RESCUE_CD_MS,
                        // 📅 hạn mức pal/ngày của TÔI (dayMax 0 = tắt)
                        palDayMax: cfg.dayMax,
                        palDayUsed: getUserData(uid).palDayKey === vnDayISO(Date.now()) ? (getUserData(uid).palDayN || 0) : 0,
                        passives: passiveCatalog(),
                        builds: passiveBuilds(),
                        myBuilds: Array.isArray(getUserData(uid).palBuilds) ? getUserData(uid).palBuilds : [],
                        ingameName: (getUserData(uid).ingameName || '').trim(),
                    };
                },
                sell: (uid, itemId) => palChestSell(uid, itemId, getUserData(uid).name || uid),
                claim: (uid, itemId, souls, passives, extra) => palChestClaim(uid, itemId, souls, passives, getUserData(uid).name || uid, extra),
                // đồng hồ cooldown NHẸ cho client poll (không kéo cả rương)
                claimCdInfo: () => ({ left: Math.max(0, (dbCache._palClaimCdUntil || 0) - Date.now()), cd: palWheelCfg().claimCd }),
                // 🆘 tẩu thoát khẩn cấp (09/09) - 1 tiếng/người/lần
                rescue: (uid) => palRescue(uid),
                saveBuild: (uid, name, ids) => palBuildSave(uid, name, ids),
                delBuild: (uid, name) => palBuildDel(uid, name),
            },
            // 🛒 shop item (28/08): mua item game + số lượng -> giao vào túi qua mod
            itemshop: {
                state: (uid) => ({
                    items: itemShopWebList(),                        // 09/09 bỏ món tắt · 10/09 implant: Chuyển Đổi → 🌳 → thường
                    dayMax: itemShopDayMax(),                        // 📅 10/09: hạn mua mỗi món/ngày (0 = không)
                    dayMode: itemShopDayMode(),                      // 📅 'server' (gộp cả server) | 'user' (mỗi người)
                    implantMax: itemShopImplantMax(),                // 🧬 mỗi người tối đa N implant/ngày (0 = không)
                    implantToday: implantToday(getUserData(uid)).n,  // 🧬 đã mua hôm nay
                    once: Object.keys((getUserData(uid).shopOnce) || {}),   // ⭐ id đã mua 1 lần
                    wtMax: itemShopWtMax(),                          // 🌳 Cây Thế Giới: mỗi người tối đa N/ngày
                    wtToday: wtToday(getUserData(uid)).n,
                    today: itemShopToday(getUserData(uid)),          // 📅 { itemId: đã mua hôm nay }
                    ingameName: (getUserData(uid).ingameName || '').trim(),
                    balance: getUserData(uid).points || 0,
                }),
                buy: (uid, itemId, qty) => itemShopBuy(uid, itemId, qty, getUserData(uid).name || uid),
            },
            // 🚀 Phi Thuyền (crash game, 28/08) - vòng chơi chung
            spm: {
                state: (uid) => spmWebState(uid),
                bet: (uid, amount, auto) => spmBet(uid, getUserData(uid).name || uid, amount, auto),
                cashout: (uid) => spmCashout(uid),
                cancelNext: (uid) => spmCancelNext(uid),
            },
        });
    } catch (e) { writeLog('SYSTEM', `[WEB CƯỢC] Không khởi động được: ${e.message}`); }

    // Khởi động web panel: cổng SUPER (mở can thiệp bằng #khóa) + cổng admin thường
    try {
        startPanel({
            port: parseInt(process.env.PANEL_PORT) || 1508,
            publicPort: parseInt(process.env.PANEL_PUBLIC_PORT) || 1234,
            // MẶC ĐỊNH KHÔNG CÓ MẬT KHẨU: panel vào thẳng, không hỏi đăng nhập.
            // Muốn bật lại thì đặt PANEL_PASSWORD=<mật khẩu> trong .env.
            password: process.env.PANEL_PASSWORD || '',
            // 10/09: mật khẩu RIÊNG cổng SUPER (đặt trong .env, KHÔNG hardcode vào repo)
            superPassword: process.env.PANEL_SUPER_PASSWORD || '',
            txChoices: TX_CHOICES,
            txBaoRate: TX_BAO_RATE,
            // 💰 trần cược TX/người/ván: panel xem + chỉnh (0 = không giới hạn)
            getTXMaxBet: txMaxBet,
            setTXMaxBet: (n) => {
                n = Math.floor(Number(n));
                if (!Number.isFinite(n) || n < 0 || n > 1000000000) return { error: 'Số không hợp lệ (0 - 1 tỷ, 0 = không giới hạn)' };
                dbCache._txMaxBet = n;
                saveDbNow();
                txState.needsUpdate = true;   // bảng Discord vẽ lại dòng trần cược
                return { ok: true, maxBet: txMaxBet() };
            },
            txLockS: TX_LOCK_S,
            diceEmojis: DICE_EMOJIS,
            totalTiles: TOTAL_TILES,
            getTX: () => txState,
            getDb: () => dbCache,
            getForcedMines: () => forcedMines,
            setForcedMines: (key, positions) => { forcedMines[key] = positions; },
            clearForcedMines: (key) => { delete forcedMines[key]; },
            // 🍀 09/09: ép quà hộp may mắn kế tiếp (test kịch bản khiên/⛏️/🏆)
            getForcedLucky: () => forcedLucky,
            setForcedLucky: (key, prize) => { forcedLucky[key] = prize; },
            clearForcedLucky: (key) => { delete forcedLucky[key]; },
            // ⏸️ 09/09: mở/đóng Dò Mìn + Leo Thang
            getGameOpen: () => ({ mines: gameOpen('mines'), stairs: gameOpen('stairs') }),
            // 🔁 09/09: cầu Dogcoin web ↔ game
            getDogBridge: () => dogBridgeCfg(),
            getDogBridgeDayMax: dogBridgeDayMax, setDogBridgeDayMax,   // 📅 11/09 hạn chuyển/ngày
            // 🎚️ 09/09: sàn cược 2 minigame
            setMinBet: (v) => setMinBet(v),
            setDogBridge: (key, on) => setDogBridge(key, on),
            setGameOpen: (key, on) => setGameOpen(key, on),
            getMinesHistory: () => minesHistory,
            getTXDash: () => txDashHistory,
            getUserData,
            updatePoints,
            logDog,
            getDogLedger: () => dbCache._dogLedger || [],
            getPalOrders: () => dbCache._palOrders || [],
            completePalOrder,
            // 🎁 rương pal + vòng quay web (25/08)
            getPalWheelCfg: palWheelCfg,
            setPalWheelCfg,
            setPalLuckRate,   // 🍀 đặt %/quay may mắn riêng từng người (rig cho bạn bè)
            // 🪪 mức điểm danh/nghiện/thưởng chuỗi (panel tab 👥 chỉnh)
            getDailyCfg: dailyCfg,
            setDailyCfg: (o) => {
                const cur = dailyCfg();
                dbCache._dailyCfg = { ...cur, ...(o && typeof o === 'object' ? o : {}) };
                saveDbNow();
                return { ok: true, cfg: dailyCfg() };
            },
            getItemShop: itemShopList,   // 🛒 danh mục shop item (admin quản)
            getItemShopDayMax: itemShopDayMax, setItemShopDayMax,   // 📅 10/09 hạn mua/ngày
            getItemShopDayMode: itemShopDayMode, setItemShopDayMode,   // 📅 chế độ đếm server/user
            getItemShopImplantMax: itemShopImplantMax, setItemShopImplantMax,   // 🧬 hạn implant/người/ngày
            getItemShopWtMax: itemShopWtMax, setItemShopWtMax,   // 🌳 hạn implant Cây Thế Giới/người/ngày
            setItemShop,
            uploadItemImage,   // 🖼️ up hình item từ panel (ghi assets/itemimage/ + nạp RAM, khỏi restart)
            // 📦 kho đồ toàn game (CHỈ cổng SUPER - panel tự gate epOk)
            gameItems,
            giveTargets,
            adminGiveItem,
            // 🚀 Phi Thuyền (crash game): config + xem vòng + ép điểm nổ (SUPER)
            getSpmCfg: spmCfg,
            setSpmCfg,
            getSpmState: () => ({
                phase: spmState.phase, roundId: spmState.roundId, betEndAt: spmState.betEndAt,
                flightStart: spmState.flightStart, crashAt: spmState.crashAt, now: Date.now(),
                crashPoint: spmState.crashPoint, forced: spmState.forced,
                bets: Object.entries(spmState.bets).map(([id, b]) => ({ id, name: b.name, amount: b.amount, auto: b.auto, cashed: b.cashed, win: b.win })),
                totalStake: Object.values(spmState.bets).reduce((s, b) => s + b.amount, 0),
                liveMult: spmState.phase === 'fly' ? Math.floor(spmMultAt(Date.now() - spmState.flightStart, spmCfg()) * 100) / 100 : null,
                history: spmState.history.slice(0, 15),
                betHistory: spmState.betHistory.slice(0, 30),   // 📜 tab Log panel (30 lượt cược)
            }),
            spmForceCrash: (m) => { const v = Number(m); if (!Number.isFinite(v) || v < 1) return { error: 'Điểm nổ phải ≥ 1.00' }; spmState.forced = Math.min(spmCfg().maxMult, v); return { ok: true, forced: spmState.forced, phase: spmState.phase }; },
            palChestOverview,
            palChestGrant,
            palChestClearAll,   // 🗑️ 09/09 xoá sạch rương mọi người (SUPER)
            palChestResolve,
            deletePlayer,
            resetAllPlayers,
            addAllPlayers: addAllPlayersAndAnnounce,
            saveDbNow,
            writeLog,
            startTX: async (channelId) => { const ch = await client.channels.fetch(channelId); await startLonnho(ch); return ch.name; },
            stopTX: () => stopLonnho(),
            // Bảng mời chơi Dò Mìn (không có ván chung, chỉ khoe kết quả + nút vào web)
            // 🏆 hũ nuôi chung: xem + nạp/rút tay để mồi hũ cho anh em chơi
            // 09/09: chỉ còn hũ nuôi Quay Pal; Dò Mìn/Leo Thang = bội số nổ hũ (mults)
            getPot: () => ({ pots: { gacha: potGet('gacha') }, labels: POT_LABEL, maxBy: { gacha: LUCKY_POT_MAX_BY.gacha }, mults: { mines: potCfg('mines').mults, stairs: potCfg('stairs').mults }, leftover: { mines: potGet('mines'), stairs: potGet('stairs') }, rate: LUCKY_POT_RATE, hit: POT_HIT_RATE, minBet: minBet(), seedBy: { gacha: POT_SEED_BY.gacha } }),
            addPot: (key, amount) => adminPotAdd(key, amount),
            setPotCfg: (key, o) => setPotCfg(key, o),   // 🏆 09/09: danh sách bội số nổ hũ (x10/x15/x20) của Dò Mìn/Leo Thang
            getMines: () => ({ on: !!minesBoard.message, channelId: dbCache._minesChannelId || '' }),
            startMines: async (channelId) => { const ch = await client.channels.fetch(channelId); await startMinesBoard(ch); return ch.name; },
            stopMines: () => stopMinesBoard(),
            // 🚀 Bảng Phi Thuyền: khoe kết quả từng chuyến (thắng/thua) + nút vào web
            getSpmBoard: () => ({ on: !!spmBoard.message, channelId: dbCache._spmChannelId || '' }),
            startSpmBoard: async (channelId) => { const ch = await client.channels.fetch(channelId); await startSpmBoard(ch); return ch.name; },
            stopSpmBoard: () => stopSpmBoard(),
            // 🎡 vòng quay: panel chỉnh số người tối thiểu để khởi động
            getWheel: () => ({ minPlayers: wheelMinPlayers(), waiting: wheelRoom.players.size, ticket: wheelMaxTicket(), prices: wheelPrices() }),
            resetWheelTurns: wheelResetTurns,
            // 🆘 điểm tẩu thoát (10/09): admin đặt/xoá toạ độ đích + đo toạ độ người online
            getRescuePoint: () => {
                const p = dbCache._rescuePoint;
                return p && [p.x, p.y, p.z].every(Number.isFinite) ? p : null;
            },
            setRescuePoint: (p) => {
                if (p && [p.x, p.y, p.z].every(Number.isFinite)) {
                    dbCache._rescuePoint = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) };
                } else {
                    delete dbCache._rescuePoint;
                }
                saveDbNow();
                return dbCache._rescuePoint || null;
            },
            palWhereIs: (name) => pal.whereIs(name),
            // 🧪 admin thử dịch chuyển ngay (không tính lượt/cooldown của ai) - cổng SUPER
            palRescueTest: async (name) => {
                if (deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây' };
                deliverLock();
                let r = null, err = null;
                const p0 = dbCache._rescuePoint;
                const point = p0 && [p0.x, p0.y, p0.z].every(Number.isFinite) ? p0 : null;
                try { r = await pal.rescuePlayer(String(name || '').trim(), point); } catch (e) { err = e; }
                deliverUnlock();
                if (r && r.ok) return { ok: true, point };
                return { error: ((r && r.message) || (err && err.message) || 'không rõ').slice(0, 150) };
            },
            setWheelMin: (n) => {
                dbCache._wheelMinPlayers = n;
                saveDbNow();
                // hạ số xuống ≤ số người đang chờ thì nút QUAY sáng ngay cho họ tự bấm
            },
            // 04/09: admin tự đặt 3 mốc giá vé của bánh vòng 1 (ván đang chạy không bị
            // đụng - giá đã chốt nằm trong wheelRoom.price, mốc mới ăn từ ván sau)
            setWheelPrices: (arr) => {
                const a = (Array.isArray(arr) ? arr : []).map(v => Math.floor(Number(v)));
                if (a.length !== 3 || !a.every(v => Number.isFinite(v) && v >= 100 && v <= 1000000))
                    return { error: 'Cần đúng 3 số trong khoảng 100 - 1.000.000' };
                a.sort((x, y) => x - y);
                dbCache._wheelPrices = a;
                saveDbNow();
                return { ok: true, prices: a };
            },
            // 📈 sàn cổ phiếu: xem mức bot đang gánh + chỉnh thông số + thả tin
            getStock: () => {
                const cfg = stockCfg();
                const out = stockShareCount();
                const bid = stockBid();
                return {
                    price: stockPrice(), ask: stockAsk(), bid, base: STOCK_BASE,
                    outstanding: out, holders: Object.keys(stockPos()).length,
                    // với đòn bẩy, VỐN người chơi gửi ít hơn giá trị lệnh rất nhiều
                    marginIn: Object.values(stockPos()).reduce((a, p) => a + posMargin(p), 0),
                    // 24/08 pointX: "tất cả đóng ngay" tính bằng công thức tiền THẬT
                    // (vốn + lãi/lỗ đã nhân sức nặng), không còn ước bằng out×bid -
                    // số cũ đã sai từ khi có đòn bẩy, có pointX thì sai gấp bội.
                    payNow: Object.values(stockPos()).reduce((a, p) => a + Math.max(0, posMargin(p) + stockPL(p)), 0),
                    worstCase: out * STOCK_MAX * cfg.pointX,        // trần thiệt hại tuyệt đối (đã nhân sức nặng)
                    capWorst: cfg.maxShares * STOCK_MAX * cfg.pointX,
                    tickAmp: cfg.tickAmp,
                    spreadPct: Math.round(cfg.spread * 1000) / 10,
                    pointX: cfg.pointX,
                    maxShares: cfg.maxShares, maxPer: cfg.maxPer, maxLev: cfg.maxLev, holdS: cfg.holdS, open: cfg.open,
                    waveOn: cfg.waveOn, waveLow: cfg.waveLow, waveHigh: cfg.waveHigh,
                    anchor: (dbCache._stockAnchor && Number.isFinite(dbCache._stockAnchor.v))
                        ? { v: Math.round(dbCache._stockAnchor.v) } : null,
                    // 25/08: từng người đang giữ lệnh - panel hiện ai MUA/BÁN lời lỗ bao nhiêu,
                    // và là dữ liệu cho ô XEM TRƯỚC tác động khi admin chỉnh %.
                    positions: Object.entries(stockPos())
                        .filter(([, p]) => (Number(p.shares) || 0) > 0)
                        .map(([uid, p]) => ({
                            name: getUserData(uid).name || uid,
                            side: p.side === 'short' ? 'short' : 'long',
                            shares: Number(p.shares) || 0,
                            lev: Math.round(posLev(p) * 10) / 10,
                            margin: posMargin(p),
                            wallet: Math.max(0, Number(getUserData(uid).points) || 0),
                            pl: stockPL(p),
                            mins: Math.floor((Date.now() - (Number(p.openedAt) || Date.now())) / 60000),
                        }))
                        .sort((a, b) => b.pl - a.pl),
                    drift: dbCache._stockDrift ? {
                        target: dbCache._stockDrift.target,
                        secsLeft: Math.round((dbCache._stockDrift.ticksLeft || 0) * STOCK_TICK_MS / 1000),
                        by: dbCache._stockDrift.by || 'auto',
                    } : null,
                };
            },
            setStockCfg: (o) => {
                const cur = stockCfg();
                dbCache._stockCfg = {
                    tickAmp: Number.isFinite(Number(o.tickAmp)) ? Math.floor(Number(o.tickAmp)) : cur.tickAmp,
                    spread: Number.isFinite(Number(o.spreadPct)) ? Number(o.spreadPct) / 100 : cur.spread,
                    maxShares: Number.isFinite(Number(o.maxShares)) ? Math.floor(Number(o.maxShares)) : cur.maxShares,
                    maxPer: Number.isFinite(Number(o.maxPer)) ? Math.floor(Number(o.maxPer)) : cur.maxPer,
                    maxLev: Number.isFinite(Number(o.maxLev)) ? Math.floor(Number(o.maxLev)) : cur.maxLev,
                    pointX: Number.isFinite(Number(o.pointX)) ? Math.floor(Number(o.pointX)) : cur.pointX,
                    // 24/08: trước đây THIẾU holdS - panel gửi lên nhưng server vứt,
                    // mỗi lần bấm Lưu là "chôn vốn" lặng lẽ về mặc định 60 giây.
                    holdS: Number.isFinite(Number(o.holdS)) ? Math.floor(Number(o.holdS)) : cur.holdS,
                    open: o.open === undefined ? cur.open : !!o.open,
                    // 🌊 neo lang thang (26/08 tối) - ngưỡng mềm chỉnh được
                    waveOn: o.waveOn === undefined ? cur.waveOn : !!o.waveOn,
                    waveLow: Number.isFinite(Number(o.waveLow)) ? Math.floor(Number(o.waveLow)) : cur.waveLow,
                    waveHigh: Number.isFinite(Number(o.waveHigh)) ? Math.floor(Number(o.waveHigh)) : cur.waveHigh,
                };
                saveDbNow();
                const c = stockCfg();
                writeLog('ADMIN', `[CỔ PHIẾU] Đổi cấu hình: nhảy ±${c.tickAmp}/nhịp, chênh ${c.spread * 100}%, sức nặng x${c.pointX}, trần sàn ${c.maxShares}, trần/người ${c.maxPer}, ${c.open ? 'MỞ' : 'ĐÓNG'}`);
                return c;
            },
            stockPush: (pct, secs) => stockPush(
                Math.max(-40, Math.min(40, Number(pct) || 0)),
                Math.round((Math.max(30, Math.min(600, Number(secs) || 150))) * 1000 / STOCK_TICK_MS)
            ),
            // (Bảng thống kê 📊 đã bỏ 19/08 - panel không còn tab)
            // Bảng mời chơi Leo Thang
            getStairs: () => ({ on: !!stairsBoard.message, channelId: dbCache._stairsChannelId || '' }),
            startStairs: async (channelId) => { const ch = await client.channels.fetch(channelId); await startStairsBoard(ch); return ch.name; },
            stopStairs: () => stopStairsBoard(),
            getStairsHistory: () => stairsHistory(),
            deleteChat: async (channelId) => { const ch = await client.channels.fetch(channelId); return await deleteBotChat(ch); },
            getWithdraw: () => withdrawState,
            startWithdraw: async (channelId) => { const ch = await client.channels.fetch(channelId); await startWithdraw(ch); return ch.name; },
            stopWithdraw: () => stopWithdraw(),
            // Kênh khoe kết quả quay pal ngẫu nhiên (gacha)
            setGachaChannel: async (channelId) => {
                if (!channelId) { dbCache._gachaChannelId = null; saveDbNow(); return null; }
                const ch = await client.channels.fetch(channelId);
                await ch.send('🎲 Kênh này sẽ hiện kết quả **quay Pal ngẫu nhiên** của mọi người!');
                dbCache._gachaChannelId = ch.id;
                saveDbNow();
                return ch.name;
            },
            // Kênh + role thông báo phát Dogcoin toàn server (đổi được từ panel,
            // tin xác nhận không tag ai - allowedMentions rỗng)
            setGiveawayConfig: async (channelId, roleId) => {
                const ch = await client.channels.fetch(channelId);
                await ch.send({ content: '🎁 Kênh này sẽ nhận thông báo **phát Dogcoin toàn server**.', allowedMentions: { parse: [] } });
                dbCache._giveawayChannelId = ch.id;
                dbCache._giveawayRoleId = roleId || null;
                saveDbNow();
                return ch.name;
            },
            // Reset điểm danh: xóa lastDaily của MỌI ví - ai cũng /diemdanh lại được ngay
            resetAllDaily: () => {
                const ids = Object.keys(dbCache).filter(k => !k.startsWith('_') && dbCache[k] && typeof dbCache[k] === 'object' && dbCache[k].lastDaily);
                ids.forEach(id => { delete dbCache[id].lastDaily; });
                saveDbNow();
                return ids.length;
            },
            // Xổ số miền Bắc
            getXS: () => xsState,
            startXS: async (channelId) => { const ch = await client.channels.fetch(channelId); await startXoso(ch); return ch.name; },
            stopXS: () => stopXoso(),
            xsDrawNow: () => xsDraw('panel'),
            xsSetForce: (de, mustHit, mustMiss) => { xsState.forced = { de: de || null, mustHit: mustHit || [], mustMiss: mustMiss || [] }; saveDbNow(); },
            xsClearForce: () => { xsState.forced = { de: null, mustHit: [], mustMiss: [] }; saveDbNow(); },
            getWithdrawRequests: () => withdrawRequests,
            approveWithdraw,
            rejectWithdraw,
            // 📒 vay nợ: bảng trong kênh + admin ghi/xóa nợ ở tab 👥
            getVay: () => ({ live: !!vayState.message, channelId: (vayState.channel && vayState.channel.id) || dbCache._vayChannelId || '' }),
            startVay: async (channelId) => { const ch = await client.channels.fetch(channelId); await startVay(ch); return ch.name; },
            stopVay: () => stopVay(),
            debtAdd: adminDebtAdd,
            debtClear: adminDebtClear,
            debtBad: adminDebtBad,
            getLoanCfg: () => loanCfg(),
            setLoanCfg: (o) => {
                const cur = loanCfg();
                dbCache._loanCfg = {
                    dailyMax: Number.isFinite(Number(o.dailyMax)) ? Math.floor(Number(o.dailyMax)) : cur.dailyMax,
                    cap: Number.isFinite(Number(o.cap)) ? Math.floor(Number(o.cap)) : cur.cap,
                    feePct: Number.isFinite(Number(o.feePct)) ? Number(o.feePct) : cur.feePct,
                };
                saveDbNow();
                return loanCfg();
            },

        });
        writeLog('SYSTEM', `🌐 Web panel: SUPER cổng ${parseInt(process.env.PANEL_PORT) || 1508} | admin thường cổng ${parseInt(process.env.PANEL_PUBLIC_PORT) || 1234}`);
        // Không còn vòng quét tự động nào: mọi giao dịch với game là ticket, admin xử lý tay.
    } catch (e) {
        writeLog('SYSTEM', `[LỖI PANEL] ${e.message}`);
    }

    // Nối lại bảng 📒 VAY NỢ sau restart (admin đã đặt bảng từ trước thì tự bám lại)
    if (dbCache._vayChannelId && dbCache._vayMsgId) {
        try {
            const ch = await client.channels.fetch(dbCache._vayChannelId);
            vayState.channel = ch;
            vayState.message = await ch.messages.fetch(dbCache._vayMsgId);
            vayState.message.edit(getVayMessageData()).catch(() => {});
        } catch { /* kênh/tin nhắn đã mất - admin đặt lại từ panel tab 👥 */ }
    }

    // Backfill tên cho các ví cũ chưa có tên (kéo từ Discord)
    (async () => {
        const ids = Object.keys(dbCache).filter(k =>
            !k.startsWith('_') && dbCache[k] && typeof dbCache[k] === 'object' && !dbCache[k].name);
        let done = 0;
        for (const id of ids) {
            try {
                const u = await client.users.fetch(id);
                if (u) { dbCache[id].name = u.username; done++; }
            } catch {}
        }
        if (done) writeLog('SYSTEM', `[BACKFILL TÊN] Đã lấy tên cho ${done}/${ids.length} ví`);
    })();
});

// --- UI BIG SMALL ---
// Big Small đã CHUYỂN HẾT LÊN WEB: bảng Discord chỉ hiển thị tình hình + nút lấy link/PIN.
// Đặt cược + nặn xí ngầu (kéo tờ giấy) đều làm trên web (webplay.js).
// Big Small: 🔺 🎲🎲🎲 · Tổng 16 · TÀI · CHẴN - ⚖️ BiaLK đặt tài +100 · lẻ −100
// Xí ngầu dùng icon thật (DICE_EMOJIS). Net tính TỪNG CỬA của từng người (đặt
// tài+lẻ mà ra TÀI CHẴN thì thấy rõ "tài +100 · lẻ −100" chứ không gộp một cục);
// icon đầu theo TỔNG của người đó: 💰 lời · 💥 lỗ · ⚖️ hòa. Luật ăn tính lại y hệt
// settleTXPayout: cửa trúng ×2, BÃO chỉ cửa bão ăn ×TX_BAO_RATE.
function txHistoryLine(h) {
    const head = h.storm ? '🌪️' : (h.tx === TX_CHOICES.tai.name ? '🔺' : '🔻');
    const dice = (h.dice || []).map(d => DICE_EMOJIS[d] || d).join(' ');
    const line = `${head} ${dice} · Tổng **${h.sum}** · **${h.tx}${h.storm ? '' : ' · ' + h.cl}**`;
    const per = {};
    (h.bets || []).forEach(b => {
        const cua = String(b.choice || '');
        let win = 0;
        if (h.storm) { if (cua === TX_CHOICES.bao.name) win = b.amount * TX_BAO_RATE; }
        else if (cua === h.tx || cua === h.cl) win = b.amount * 2;
        const net = win - b.amount;
        if (!per[b.u]) per[b.u] = { name: b.name, total: 0, parts: [] };
        per[b.u].total += net;
        per[b.u].parts.push(`${cua.toLowerCase()} ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}`);
    });
    const parts = Object.values(per).map(p =>
        `${p.total > 0 ? '💰' : p.total < 0 ? '💥' : '⚖️'} **${p.name}** đặt ${p.parts.join(' · ')}`);
    return line + (parts.length ? ` - ${parts.join(' | ')}` : '');
}

function getTXMessageData(customStatus = null) {
    let desc = `⏳ **Mở bát:** <t:${txState.targetTime}:R>\n\n`;

    desc += `📝 **Người đặt hiện tại:**\n`;

    const groups = { 'tai': [], 'xiu': [], 'chan': [], 'le': [], 'bao': [] };
    txState.bets.forEach(b => (groups[b.choice] || (groups[b.choice] = [])).push(b));

    let hasBets = false;
    ['tai', 'xiu', 'chan', 'le', 'bao'].forEach(c => {
        if (groups[c].length > 0) {
            hasBets = true;
            desc += `**${TX_CHOICES[c].name}:**\n`;
            // Gộp cược trùng của cùng 1 người vào cùng 1 cửa
            const byUser = {};
            groups[c].forEach(b => {
                if (!byUser[b.userId]) byUser[b.userId] = { username: b.username, amount: 0 };
                byUser[b.userId].amount += b.amount;
            });
            Object.values(byUser).forEach(u => desc += `• **${u.username}**: ${u.amount.toLocaleString()} ${DOGCOIN_EMOJI}\n`);
        }
    });
    if (!hasBets) desc += "*Chưa có ai đặt*";

    desc = desc.trimEnd();
    // 🎲 Lịch sử ván nằm NGAY TRÊN bảng, mỗi ván 1 dòng trực quan như bảng Dò Mìn /
    // Leo Thang (19/08) - thay cho embed kết quả riêng từng ván (đã bỏ: hết spam
    // "không ai thắng" mỗi 50 giây, đỡ ~nửa số Discord API call của bàn).
    // Chỉ hiện ván CÓ NGƯỜI ĐẶT - ván trống vẫn nằm trong txState.history cho Soi Cầu,
    // nhưng lên bảng thì chỉ tổ chiếm chỗ.
    const recent = (txState.history || []).filter(h => (h.bets || []).length).slice(0, BOARD_HISTORY_N);
    if (recent.length) {
        desc += `\n\n**🎲 ${recent.length} ván gần đây:**\n` + recent.map(txHistoryLine).join('\n');
    }
    desc += `\n\n${customStatus || `👉 Bấm **🌐 Cược trên web** lấy link + PIN - đặt cược và **nặn xí ngầu** (kéo tờ giấy) đều trên web, ${TX_LOCK_S} giây cuối khóa sổ để nặn!${txMaxBet() > 0 ? ` · 💰 Trần cược **${txMaxBet().toLocaleString()}**/người/ván` : ''}`}`;

    const embed = new EmbedBuilder()
        .setTitle(`🎲 BIG SMALL LIVE - Game #${padId(txState.gameId)}`)
        .setColor(txState.status === 'betting' ? 0x2ecc71 : 0xe74c3c)
        // slice 4000: đông người đặt + 10 dòng lịch sử có thể chạm trần 4096 của embed
        .setDescription(desc.slice(0, 4000));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('web_pin').setLabel('🌐 Chơi trên web (Big Small + Dò Mìn)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('tx_soicau').setLabel('Soi Cầu').setEmoji('🕵️').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

async function updateTXMessage(customStatus = null) {
    if (!txState.message) return;
    const data = getTXMessageData(customStatus);
    await txState.message.edit(data).catch((e) => { writeLog('SYSTEM', `[LỖI UPDATE TX BẢNG CƯỢC] ${e.message}`); });
}

async function sweepTXBoards() {
    return sweepBoards(txState.channel, txState.message?.id, 'BIG SMALL LIVE', 'BẢNG TX');
}

// --- VÒNG LẶP BIG SMALL ---
function runTaiXiuLoop() {
    setInterval(async () => {
        // Auto-recover nếu message bị mất do timeout mạng
        if (!txState.message && txState.channel && !txState.isProcessing) {
            txState.isProcessing = true;
            txState.processingStart = Date.now();
            txState.targetTime = Math.floor(Date.now() / 1000) + TX_ROUND_S;
            txState.status = 'betting';
            txState.bets = [];
            txState.activeChoice = null;
            txState.resultPromise = null;
            txState.message = await txState.channel.send(getTXMessageData()).catch(() => null);
            if (txState.message) dbCache._txMsgId = txState.message.id;
            sweepTXBoards().catch(() => { });   // bảng cũ (trước restart/mất mạng) gỡ luôn ở đây
            txState.isProcessing = false;
            txState.processingStart = 0;
            return;
        }
        if (!txState.message || !txState.channel) return;
        if (txState.isProcessing) {
            // Watchdog: nếu kẹt quá 120 giây thì tự reset, auto-recover sẽ gửi bảng mới
            if (txState.processingStart && Date.now() - txState.processingStart > 120000) {
                writeLog('SYSTEM', '[WATCHDOG TX] isProcessing kẹt, tự reset');
                txState.isProcessing = false;
                txState.processingStart = 0;
                txState.status = 'betting';
                txState.resultPromise = null;
                txState.bets = [];
                txState.activeChoice = null;
                txState.targetTime = Math.floor(Date.now() / 1000) + TX_ROUND_S;
                txState.message = null;
            }
            return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const lockTime = txState.targetTime - TX_LOCK_S;

        if (nowSec >= txState.targetTime) {
            // Mở bát: kết quả đã được tính từ lúc đóng phiên, chỉ cần await
            txState.status = 'ending';
            txState.isProcessing = true;
            txState.processingStart = Date.now();
            const prevMsgId = txState.message?.id;

            // Bảng còn nằm cuối kênh thì ván mới SỬA TẠI CHỖ, khỏi xoá-tạo (21/08).
            const txIsLast = !!prevMsgId && txState.channel?.lastMessageId === prevMsgId;

            try {
                await (txState.resultPromise || Promise.resolve(null));
                txState.targetTime = Math.floor(Date.now() / 1000) + TX_ROUND_S;
                txState.status = 'betting';
                txState.bets = [];
                txState.gameId++;
                txState.activeChoice = null;
                txState.resultPromise = null;
                txState.needsUpdate = false;
                const data = getTXMessageData();
                if (txIsLast && txState.message) {
                    // Đường chạy thường ngày: không đẻ tin mới nên KHÔNG THỂ mồ côi.
                    // Sửa hụt thì bỏ bảng đi, auto-recover ở đầu vòng lặp đăng bảng mới.
                    await txState.message.edit(data).catch((e) => {
                        writeLog('SYSTEM', `[BẢNG TX] Sửa bảng tại chỗ hụt: ${e.message}`);
                        txState.message = null;
                    });
                    if (txState.message) dbCache._txMsgId = txState.message.id;
                } else {
                    // Có người nhắn đè xuống dưới -> đăng bảng mới cho nổi về cuối kênh
                    if (prevMsgId && txState.channel) {
                        txState.channel.messages.delete(prevMsgId).catch((e) => {
                            writeLog('SYSTEM', `[BẢNG TX] Xoá bảng cũ ${prevMsgId} hụt: ${e.message}`);
                        });
                    }
                    txState.message = await txState.channel.send(data).catch((e) => { writeLog('SYSTEM', `[LỖI GỬI BẢNG MỚI TX] ${e.message}`); return null; });
                    if (txState.message) dbCache._txMsgId = txState.message.id;   // restart còn biết bảng nào mà gỡ
                    sweepTXBoards().catch(() => { });   // lưới an toàn, dọn bảng sót
                }
            } catch (e) {
                writeLog('SYSTEM', `[LỖI LOOP TX] ${e.message}`);
                // Recovery: reset để ván tiếp theo vẫn chạy được
                txState.targetTime = Math.floor(Date.now() / 1000) + TX_ROUND_S;
                txState.status = 'betting';
                txState.bets = [];
                txState.activeChoice = null;
                txState.resultPromise = null;
            }

            txState.isProcessing = false;
            txState.processingStart = 0;

        } else if (nowSec >= lockTime && txState.status === 'betting') {
            txState.status = 'ending';
            txState.activeChoice = null;
            const snapGameId = txState.gameId;
            const snapBets = txState.bets.slice();
            txState.resultPromise = finishTXGame(snapGameId, snapBets);
            updateTXMessage().catch(() => {});

        } else if (txState.status === 'betting' && txState.needsUpdate) {
            updateTXMessage().catch(() => {});
            txState.needsUpdate = false;
        }
    }, 1000);
}

function rollTXDice() {
    let d1, d2, d3;
    if (txState.forcedResult) {
        [d1, d2, d3] = txState.forcedResult.split(',').map(Number);
        txState.forcedResult = null;
    } else {
        d1 = Math.floor(Math.random() * 6) + 1;
        d2 = Math.floor(Math.random() * 6) + 1;
        d3 = Math.floor(Math.random() * 6) + 1;
    }
    return [d1, d2, d3];
}

// Tính kết quả + TRẢ thưởng + ghi log/lịch sử/soi cầu. Với ván có nặn, hàm này chỉ được
// gọi lúc lật đủ 3 viên (hoặc hết hạn tự mở) - KHÔNG gọi lúc lắc, kẻo trả tiền 2 lần.
function settleTXPayout(gameId, bets, d1, d2, d3) {
    const sum = d1 + d2 + d3;

    const isStorm = d1 === d2 && d2 === d3; // BÃO: 3 viên giống nhau
    const isTai = sum >= 11;
    const isChan = sum % 2 === 0;

    const resultTX = isTai ? 'tai' : 'xiu';
    const resultCL = isChan ? 'chan' : 'le';

    // Gộp tiền thắng theo người (1 người đặt nhiều lần / nhiều cửa -> 1 dòng)
    // Luật BÃO: ra 3 viên giống nhau thì CHỈ cửa Bão ăn ×TX_BAO_RATE, mọi cửa
    // thường (tài/xỉu/chẵn/lẻ) thua sạch. Không bão thì cửa Bão thua, cửa thường ×2.
    const winAgg = {};
    bets.forEach(b => {
        let win = 0;
        if (isStorm) {
            if (b.choice === 'bao') win = b.amount * TX_BAO_RATE;
        } else if (b.choice === resultTX || b.choice === resultCL) {
            win = b.amount * 2;
        }
        if (win > 0) {
            updatePoints(b.userId, win);
            if (!winAgg[b.userId]) winAgg[b.userId] = { userId: b.userId, name: b.username, amount: 0 };
            winAgg[b.userId].amount += win;
        }
        statAdd(b.userId, 'tx', win - b.amount);   // net từng lệnh cược cho bảng 📊
    });
    const winners = Object.values(winAgg).map(w => ({ u: w.userId, name: w.name, amount: w.amount }));
    const winLog = Object.values(winAgg).map(w => `• <@${w.userId}> thắng **${w.amount.toLocaleString()}** ${DOGCOIN_EMOJI}`).join('\n');

    const txIcon = isStorm ? `🌪️ BÃO ${d1}-${d1}-${d1}` : (isTai ? `${TX_CHOICES.tai.name} 🔺` : `${TX_CHOICES.xiu.name} 🔻`);
    const clIcon = isStorm ? 'cửa thường thua hết' : (isChan ? 'CHẴN 🔵' : 'LẺ 🟣');
    writeLog('RESULT', `[KẾT QUẢ BIG SMALL] Game #${gameId}: ${d1}-${d2}-${d3} (Tổng ${sum} | ${isStorm ? 'BÃO' : (isTai ? TX_CHOICES.tai.name : TX_CHOICES.xiu.name)} | ${isStorm ? 'BÃO' : (isChan ? 'CHẴN' : 'LẺ')})`);

    if (bets.length > 0) {
        let betLogDetails = bets.map(b => `${b.username} đặt ${b.amount} vào ${TX_CHOICES[b.choice].name}`).join(' | ');
        writeLog('BET', `[CƯỢC BIG SMALL] Game #${gameId} | Đặt: ${betLogDetails} | KQ: ${d1}-${d2}-${d3} (${sum})`);
    }

    // (lastGameInfo đã bỏ 19/08 - kết quả vòng trước giờ nằm trong danh sách
    //  "🎲 ván gần đây" ngay trên bảng, vẽ từ txState.history)
    // Gộp cược trùng để lưu gọn (rỗng nếu không ai đặt).
    const betAgg = {};
    bets.forEach(b => {
        const k = `${b.userId}_${b.choice}`;
        if (!betAgg[k]) betAgg[k] = { u: b.userId, name: b.username, choice: TX_CHOICES[b.choice].name, amount: 0 };
        betAgg[k].amount += b.amount;
    });
    const histEntry = {
        gameId,
        dice: [d1, d2, d3],
        sum,
        storm: isStorm,
        tx: isStorm ? TX_CHOICES.bao.name : (isTai ? TX_CHOICES.tai.name : TX_CHOICES.xiu.name),
        cl: isStorm ? TX_CHOICES.bao.name : (isChan ? TX_CHOICES.chan.name : TX_CHOICES.le.name),
        bets: Object.values(betAgg),
        winners,
        time: new Date().toLocaleTimeString('vi-VN')
    };
    // 27/08 (dọn cho nhẹ RAM): soi cầu RAM giữ 100 ván (trước 1000).
    txState.history.unshift(histEntry);
    if (txState.history.length > 100) txState.history.pop();
    // Web đọc 20 ván; boot khôi phục từ đây (bounded 20, DB không phình).
    dbCache._txHist20 = txState.history.slice(0, 20);
    // Dashboard: CHỈ ván có người đặt. 27/08 CAP 100 ván (trước KHÔNG cap -> phình
    // database.json tới 57%). Giữ 100 ván cược gần nhất, dư dọn hết cho đỡ nặng.
    if (bets.length > 0) {
        txDashHistory.unshift(histEntry);
        if (txDashHistory.length > 100) txDashHistory.length = 100;
    }

    return { sum, txIcon, clIcon, winLog };
}

// Ván Big Small: được gọi NGAY LÚC KHÓA SỔ (T-15s). Lắc ngầm liền để web mở cửa sổ nặn,
// rồi ngủ tới đúng giờ mở bát mới trả thưởng. KHÔNG còn gửi embed kết quả riêng
// (bỏ 19/08): kết quả hiện thẳng trên bảng cược dạng dòng 🎲 như bảng Dò Mìn/Leo
// Thang - hết spam "không ai thắng" mỗi 50 giây, đỡ nửa số Discord API call.
async function finishTXGame(gameId, bets) {
    const [d1, d2, d3] = rollTXDice();
    // Mở cửa sổ nặn trên web: ai đăng nhập cũng kéo giấy xem riêng được
    txState.nan = { gameId, dice: [d1, d2, d3] };

    const revealAtMs = txState.targetTime * 1000;
    const waitMs = revealAtMs - Date.now();
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    txState.nan = null; // đóng cửa sổ nặn
    // Admin có thể bấm Dừng Big Small ngay trong lúc chờ nặn - tiền vẫn phải trả đủ.
    settleTXPayout(gameId, bets, d1, d2, d3);
    return null;
}

// ==========================================
// --- ĐIỀU KHIỂN BÀN CHƠI (gọi từ web panel) ---
// ==========================================
async function startLonnho(channel) {
    if (txState.message) await txState.message.delete().catch(() => {});
    // Sau restart txState.message rỗng nhưng bảng cũ VẪN nằm trong kênh - xoá theo id
    // đã lưu, kẻo mỗi lần deploy rồi bật lại bảng là bỏ lại một bảng chết (bug 21/08).
    else if (dbCache._txMsgId) await channel.messages.delete(dbCache._txMsgId).catch(() => {});
    txState.message = null;
    txState.channel = channel;
    txState.gameId++;
    txState.timeLeft = 55;
    txState.targetTime = Math.floor(Date.now() / 1000) + TX_ROUND_S;
    txState.status = 'betting';
    txState.bets = [];
    txState.needsUpdate = false;
    txState.activeChoice = null;
    txState.isProcessing = true;
    txState.processingStart = Date.now();
    try {
        txState.message = await txState.channel.send(getTXMessageData());
        dbCache._txChannelId = channel.id;
        dbCache._txMsgId = txState.message.id;
        sweepTXBoards().catch(() => { });   // dọn sạch bảng mồ côi còn sót trong kênh
    } finally {
        txState.isProcessing = false;
        txState.processingStart = 0;
    }
}

function stopLonnho() {
    if (txState.message) txState.message.delete().catch(() => {});
    txState.channel = null;
    txState.message = null;
    txState.status = 'stopped';
    // Ván đang chạy (kể cả đang trong cửa sổ nặn) vẫn được finishTXGame trả thưởng
    // đúng giờ qua resultPromise - không om tiền người chơi.
}

// ===== XỔ SỐ MIỀN BẮC =====

function vnNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

// Epoch (giây) của đầu giờ kế tiếp - múi giờ VN lệch UTC đúng số giờ chẵn nên đầu giờ trùng nhau.
function xsNextDrawEpoch() {
    return (Math.floor(Date.now() / 3600000) + 1) * 3600;
}

function xsRandDigits(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
}

// Quay đủ bảng 27 giải. forced = {de, mustHit[], mustMiss[]} - áp một kỳ rồi xóa.
function xsGenerateBoard(forced) {
    const board = []; // [{prize, value}]
    for (const [prize, count, digits] of XS_PRIZE_SPEC) {
        for (let i = 0; i < count; i++) board.push({ prize, value: xsRandDigits(digits) });
    }
    const last2 = (v) => v.slice(-2);
    const setLast2 = (entry, two) => { entry.value = entry.value.slice(0, -2) + two; };
    const miss = new Set((forced.mustMiss || []).filter(n => !(forced.mustHit || []).includes(n)));

    // 1) cấm về lô: re-roll 2 số cuối của giải nào dính số cấm (trừ ĐB nếu đang ép đề)
    for (const entry of board) {
        if (forced.de && entry.prize === 'ĐB') continue;
        let guard = 0;
        while (miss.has(last2(entry.value)) && guard++ < 50) {
            setLast2(entry, xsRandDigits(2));
        }
    }
    // 2) ép đề: gán 2 số cuối giải ĐB
    if (forced.de) setLast2(board[0], forced.de);
    // 3) ép lô phải về: mỗi số gán vào 1 giải ngẫu nhiên (không đụng ĐB, không đè lên nhau).
    // Số "tự về" sẵn cũng phải GIỮ CHỖ vị trí đó, không thì số ép sau bốc trúng
    // đúng vị trí đó và đè mất (bug đã bắt được khi test 500 lần).
    const used = new Set();
    for (const num of (forced.mustHit || [])) {
        const existing = board.findIndex((e, i) => last2(e.value) === num && !used.has(i));
        if (existing >= 0) { used.add(existing); continue; }
        let idx, guard = 0;
        do { idx = 1 + Math.floor(Math.random() * (board.length - 1)); } while (used.has(idx) && guard++ < 50);
        used.add(idx);
        setLast2(board[idx], num);
    }
    return board;
}

function getXSMessageData() {
    const locked = xsState.status === 'locked';
    const nextDraw = xsNextDrawEpoch();
    const users = Object.keys(xsState.bets).length;
    let stake = 0;
    for (const b of Object.values(xsState.bets)) {
        for (const v of Object.values(b.de || {})) stake += v;
        for (const v of Object.values(b.lo || {})) stake += v;
    }
    const embed = new EmbedBuilder()
        .setTitle(`🎰 XỔ SỐ MIỀN BẮC #${padId(xsState.round)}`)
        .setColor(locked ? 0xe67e22 : 0x9b59b6)
        .setDescription(
            `Quay **mỗi giờ một ván** vào đúng đầu giờ, ván này mở thưởng <t:${nextDraw}:t> (<t:${nextDraw}:R>).\n` +
            `⛔ **Khóa sổ từ phút ${XS_LOCK_MINUTE}** (10 phút cuối không nhận cược).\n\n` +
            `🎯 **ĐỀ**: đoán 2 số cuối giải Đặc Biệt. Trúng **1 ăn ${XS_DE_RATE}**.\n` +
            `🎰 **LÔ**: số về trong bất kỳ giải nào của bảng 27 lô. Mỗi nháy **1 ăn ${XS_LO_RATE}** (về nhiều nháy ăn nhiều lần).\n` +
            `Giới hạn: tối đa **${XS_MAX_NUMBERS_PER_TYPE} số mỗi kiểu**, mỗi số tối đa **${XS_MAX_PER_NUMBER.toLocaleString()}** ${DOGCOIN_EMOJI}.\n\n` +
            (locked
                ? `🔒 **ĐÃ KHÓA SỔ**, chờ mở thưởng <t:${nextDraw}:R>.`
                : `🟢 **ĐANG NHẬN CƯỢC**, bấm nút bên dưới để đánh!`) +
            `\n\n📝 Ván này: **${users}** người chơi, tổng cược **${stake.toLocaleString()}** ${DOGCOIN_EMOJI}`
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('xs_de').setLabel('🎯 Đánh Đề').setStyle(ButtonStyle.Danger).setDisabled(locked),
        new ButtonBuilder().setCustomId('xs_lo').setLabel('🎰 Đánh Lô').setStyle(ButtonStyle.Primary).setDisabled(locked),
        new ButtonBuilder().setCustomId('xs_mybets').setLabel('🧾 Cược của tôi').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('xs_help').setLabel('📖 Cách chơi').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row] };
}

async function updateXSMessage() {
    if (!xsState.message) return;
    await xsState.message.edit(getXSMessageData()).catch((e) => { writeLog('SYSTEM', `[LỖI UPDATE BẢNG XS] ${e.message}`); });
}

function xsBoardText(board) {
    const byPrize = {};
    for (const e of board) (byPrize[e.prize] = byPrize[e.prize] || []).push(e.value);
    const label = { 'ĐB': '💎 ĐB', 'G1': 'G.1', 'G2': 'G.2', 'G3': 'G.3', 'G4': 'G.4', 'G5': 'G.5', 'G6': 'G.6', 'G7': 'G.7' };
    return Object.keys(byPrize).map(p => `**${label[p]}**: \`${byPrize[p].join('` `')}\``).join('\n');
}

// Quay + trả thưởng + đăng kết quả. trigger: 'auto' | 'panel'
async function xsDraw(trigger) {
    if (xsState.isProcessing) return null;
    xsState.isProcessing = true;
    try {
        const forced = xsState.forced || { de: null, mustHit: [], mustMiss: [] };
        const board = xsGenerateBoard(forced);
        const de = board[0].value.slice(-2);
        const loCount = {};
        for (const e of board) { const n = e.value.slice(-2); loCount[n] = (loCount[n] || 0) + 1; }

        const winners = [];
        const betDetails = []; // từng lệnh cược để soi lại trên panel
        let totalStake = 0, totalPaid = 0;
        for (const [uid, b] of Object.entries(xsState.bets)) {
            let win = 0;
            const details = [];
            for (const [num, amt] of Object.entries(b.de || {})) {
                totalStake += amt;
                const hit = num === de ? 1 : 0;
                const w = hit ? amt * XS_DE_RATE : 0;
                betDetails.push({ name: b.name, kind: 'đề', num, amt, hits: hit, win: w });
                if (w > 0) { win += w; details.push(`đề **${num}** +${w.toLocaleString()}`); }
            }
            for (const [num, amt] of Object.entries(b.lo || {})) {
                totalStake += amt;
                const c = loCount[num] || 0;
                const w = c > 0 ? Math.floor(amt * XS_LO_RATE * c) : 0;
                betDetails.push({ name: b.name, kind: 'lô', num, amt, hits: c, win: w });
                if (w > 0) { win += w; details.push(`lô **${num}** ×${c} nháy +${w.toLocaleString()}`); }
            }
            if (win > 0) {
                updatePoints(uid, win);
                totalPaid += win;
                winners.push({ userId: uid, name: b.name, amount: win, details });
            }
        }

        const entry = {
            round: xsState.round,
            time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            de,
            board: board.map(e => ({ p: e.prize, v: e.value })),
            trigger,
            forced: (forced.de || (forced.mustHit || []).length || (forced.mustMiss || []).length) ? forced : null,
            totalStake, totalPaid,
            winners: winners.map(w => ({ name: w.name, amount: w.amount })),
            bets: betDetails,
        };
        xsState.history.unshift(entry);
        if (xsState.history.length > 30) xsState.history.length = 30;

        writeLog('RESULT', `[XỔ SỐ] Kỳ #${padId(xsState.round)} (${trigger}) ĐB=${board[0].value} đề=${de} | cược ${totalStake} | trả ${totalPaid}${entry.forced ? ' | CÓ ÉP' : ''}`);

        // reset kỳ: ép chỉ áp 1 kỳ
        const drawnRound = xsState.round;
        xsState.bets = {};
        xsState.forced = { de: null, mustHit: [], mustMiss: [] };
        xsState.round++;
        saveDbNow();

        // đăng kết quả + dọn còn XS_RESULT_KEEP tin gần nhất
        if (xsState.channel) {
            const winText = winners.length
                ? winners.map(w => `• <@${w.userId}> **+${w.amount.toLocaleString()}** ${DOGCOIN_EMOJI} (${w.details.join(', ')})`).join('\n')
                : '🚫 Không ai trúng, nhà cái húp sạch.';
            const resEmbed = new EmbedBuilder()
                .setTitle(`🧧 KẾT QUẢ XỔ SỐ MIỀN BẮC #${padId(drawnRound)}`)
                .setColor(0xf1c40f)
                .setDescription(`${xsBoardText(board)}\n\n🎯 **Đề về: ${de}**\n\n${winText}`)
                .setFooter({ text: `Quay lúc ${entry.time} • Cờ bạc có thể gây nghiện` });
            // Tag người trúng ở content (mention trong embed KHÔNG ping) - phải khai allowedMentions
            const winnerIds = winners.map(w => w.userId);
            const msg = await xsState.channel.send({
                content: winnerIds.length
                    ? `🏆 Chúc mừng ${winnerIds.map(id => `<@${id}>`).join(' ')} trúng ván #${padId(drawnRound)}! Tiền đã vào ví 💰`
                    : undefined,
                embeds: [resEmbed],
                allowedMentions: { users: winnerIds },
            }).catch(() => null);
            if (msg) {
                xsState.resultMsgIds.push(msg.id);
                while (xsState.resultMsgIds.length > XS_RESULT_KEEP) {
                    const oldId = xsState.resultMsgIds.shift();
                    xsState.channel.messages.delete(oldId).catch(() => {});
                }
            }
            // Xóa bảng cũ, mở bảng ván MỚI ngay DƯỚI kết quả (không edit tại chỗ -
            // edit thì bảng nằm kẹt phía trên, nhìn như ván cũ vẫn chạy)
            if (xsState.message) { await xsState.message.delete().catch(() => {}); xsState.message = null; }
            xsState.status = vnNow().getMinutes() >= XS_LOCK_MINUTE ? 'locked' : 'betting';
            xsState.message = await xsState.channel.send(getXSMessageData()).catch(() => null);
        }
        xsState.needsUpdate = false;
        return entry;
    } finally {
        xsState.isProcessing = false;
    }
}

// Vòng lặp: tự quay khi sang giờ mới, tự khóa sổ từ phút 50.
// Bot restart giữa lúc offline qua đầu giờ: kỳ đó sẽ quay ở đầu giờ kế tiếp
// (hoặc admin bấm QUAY NGAY trên panel) - cược không mất vì đã lưu database.
let xsLastHourKey = null;
function runXoSoLoop() {
    setInterval(async () => {
        if (!xsState.channel || xsState.status === 'stopped') return;
        const now = vnNow();
        const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        if (xsLastHourKey === null) xsLastHourKey = hourKey;
        if (hourKey !== xsLastHourKey) {
            xsLastHourKey = hourKey;
            try { await xsDraw('auto'); } catch (e) { writeLog('SYSTEM', `[LỖI QUAY XS] ${e.message}`); }
        }
        const want = now.getMinutes() >= XS_LOCK_MINUTE ? 'locked' : 'betting';
        if (xsState.status !== want) { xsState.status = want; xsState.needsUpdate = true; }
        if (xsState.needsUpdate) { xsState.needsUpdate = false; updateXSMessage().catch(() => {}); }
    }, 5000);
}

async function startXoso(channel) {
    if (xsState.message) await xsState.message.delete().catch(() => {});
    xsState.channel = channel;
    xsState.status = vnNow().getMinutes() >= XS_LOCK_MINUTE ? 'locked' : 'betting';
    xsState.message = await channel.send(getXSMessageData());
    dbCache._xsChannelId = channel.id;
    saveDbNow();
}

function stopXoso() {
    if (xsState.message) xsState.message.delete().catch(() => {});
    xsState.channel = null;
    xsState.message = null;
    xsState.status = 'stopped';
    dbCache._xsChannelId = null;
    saveDbNow();
}

// Bot restart: tự nối lại kênh xổ số (cược đang treo là tiền thật, không chờ admin bật tay).
async function resumeXosoAfterRestart() {
    const chId = dbCache._xsChannelId;
    if (!chId) return;
    try {
        const ch = await client.channels.fetch(chId);
        if (ch) { await startXoso(ch); writeLog('SYSTEM', `[XỔ SỐ] Nối lại kênh sau restart: #${ch.name}`); }
    } catch (e) {
        writeLog('SYSTEM', `[XỔ SỐ] Không nối lại được kênh ${chId}: ${e.message}`);
    }
}

// --- UI CHUYỂN DOGCOIN (TỰ ĐỘNG qua cầu SFTP -> mod UE4SS trong game) ---
// Server test Windows (Shockbyte, 17/08/2026) có UE4SS nên cầu tự động chạy lại.
// Hai nút chuyển xử lý NGAY (~5-20 giây), không cần admin. Chỉ khi KHÔNG CHẮC
// kết quả (timeout/mất kết nối) mới rơi về đơn cho admin kiểm tra results.log.
// Tên nhân vật do ADMIN liên kết ở panel (tab 🎮 Palworld & Dogcoin, ghi vào
// userData.ingameName) - người chơi không tự đặt được (chống giả tên rút trộm).
// Không dùng hệ liên kết SteamID/REST cũ nữa (REST đã tắt, chỉ còn SFTP).

function getWithdrawMessageData() {
    // 25/08: SHOP PAL đã DỜI HẾT LÊN WEB (Quay Pal + Chọn Pal ở nhóm 👤 HỒ SƠ).
    // Bảng Discord này giờ CHỈ còn chuyển Dogcoin hai chiều - không nút pal nữa.
    const lines = [
        `Chuyển Dogcoin **tự động** giữa ví Discord và Dog Coin trong game - xử lý ngay trong ~10 giây, không cần chờ admin.`,
        '',
        `**🎮 Chuyển vào game** - trừ ví Discord, Dog Coin rơi thẳng vào túi trong game (bạn phải **đang online**). Tối đa ${WITHDRAW_MAX_PER_REQUEST.toLocaleString()}/lần.`,
        `**💬 Chuyển ra Discord** - trừ Dog Coin **trong túi** (không tính đồ trong hòm), cộng thẳng vào ví Discord. Tối đa ${WITHDRAW_MAX_PER_REQUEST.toLocaleString()}/lần.`,
        '',
        `**🎁 Pal chuyển hết lên WEB**: ${WEB_PLAY_URL} → nhóm 👤 HỒ SƠ có **🎁 Quay Pal** (${palWheelCfg().price.toLocaleString()}/lượt, kiểu CSGO, có ô PAL RAID) và **🎯 Chọn Pal** (${palWheelCfg().customPrice.toLocaleString()}, tự chọn con mình thích, không raid). Trúng/mua xong pal nằm trong 🎒 RƯƠNG: bán lại ${palWheelCfg().sellPrice.toLocaleString()} hoặc chọn linh hồn + passive rồi bot GIAO THẲNG vào game.`,
    ];

    const embed = new EmbedBuilder()
        // hũ quay Pal hiện ngay trên tiêu đề (bảng tự vẽ lại nên số luôn tươi)
        .setTitle(`🔄 DOGCOIN - HŨ QUAY PAL ĐANG CÓ ${potGet('gacha').toLocaleString()} DOGCOIN`)
        .setColor(0xf1c40f)
        .setDescription(lines.join('\n'));

    const rowTransfer = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rut_open').setLabel('Chuyển vào game').setEmoji('🎮').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('nap_open').setLabel('Chuyển ra Discord').setEmoji('💬').setStyle(ButtonStyle.Primary)
    );
    return { embeds: [embed], components: [rowTransfer] };
}

// (Bảng shop pal riêng đã gộp vào bảng chuyển Dogcoin ở trên - 1 kênh, 1 thông báo.
//  Lõi Văn Minh / cấy ghép / đổi vàng bỏ khỏi Discord: bán ở sạp trong game.)

// Gửi đơn hàng cho admin qua DM. Đây là bước QUAN TRỌNG: tiền đã trừ rồi, nếu admin
// không nhận được đơn thì người chơi mất tiền mà không có pal. Nên khi gửi DM thất
// bại, ghi log ADMIN thật rõ để còn lần ra được đơn đó.
async function sendPalOrderToAdmin(order) {
    const text =
        `🐾 **ĐƠN PAL MỚI** #${order.id}\n` +
        `Người mua: <@${order.userId}> (\`${order.username}\`)\n` +
        `Giá: **${order.price.toLocaleString()}** Dogcoin (${order.kind === 'random' ? '🎲 ngẫu nhiên' : '🎯 tự chọn'})\n\n` +
        `**Pal: ${order.palName}**\n` +
        `• Boss (Alpha), ${PAL_SHOP.stars} sao, IV ${PAL_SHOP.ivs} cả 3 chỉ số\n` +
        `• Linh hồn ${PAL_SHOP.soulPercent}%: ${order.souls || '(đang chọn - sẽ có tin bổ sung)'}\n` +
        `• Passive: ${order.passives || '(đang chọn - sẽ có tin bổ sung)'}\n\n` +
        `Lúc: ${order.time}`;

    try {
        const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
        await admin.send(text);
        return true;
    } catch (e) {
        writeLog('ADMIN', `[SHOP PAL] KHONG GUI DUOC DM cho admin - don #${order.id}: ${order.username} mua ${order.palName} (${order.price} Dogcoin). Loi: ${e.message}`);
        return false;
    }
}

// Admin đã tạo pal trong game xong -> đánh dấu đơn hoàn thành và nhắn cho người mua.
async function completePalOrder(id) {
    const orders = dbCache._palOrders || [];
    const order = orders.find((o) => o.id === id);
    if (!order) return { ok: false, error: 'Không tìm thấy đơn' };
    if (order.status === 'done') return { ok: false, error: 'Đơn này đã hoàn thành rồi' };

    order.status = 'done';
    order.doneAt = new Date().toLocaleString('vi-VN');
    writeLog('ADMIN', `[SHOP PAL] Hoan thanh don #${order.id} - ${order.palName} cho ${order.username}`);

    // Nhắn cho người mua; DM thất bại thì vẫn coi là xong (pal đã giao trong game rồi).
    try {
        const user = await client.users.fetch(order.userId);
        await user.send(`🐾 Đơn pal **#${order.id}** đã xong! Admin đã giao **${order.palName}** cho bạn trong game.`);
    } catch { /* người chơi tắt DM */ }

    return { ok: true };
}

// Vẽ lại bảng 🔄 DOGCOIN & SHOP PAL (tiêu đề có số hũ quay Pal nên phải cập nhật
// mỗi lần hũ đổi). Bảng chưa đăng thì thôi, lỗi cũng kệ - không chặn dòng tiền.
function withdrawBoardRefresh() {
    if (!withdrawState.message) return;
    withdrawState.message.edit(getWithdrawMessageData()).catch(() => {});
}

async function startWithdraw(channel) {
    if (withdrawState.message) await withdrawState.message.delete().catch(() => {});
    withdrawState.channel = channel;
    withdrawState.message = await channel.send(getWithdrawMessageData());
    dbCache._withdrawChannelId = channel.id;
}

function stopWithdraw() {
    if (withdrawState.message) withdrawState.message.delete().catch(() => {});
    withdrawState.channel = null;
    withdrawState.message = null;
}

// ===== HỆ TICKET GIAO DỊCH VỚI GAME =====
// Mọi giao dịch chạm tới game đều thành ĐƠN (ticket) nằm trong withdrawRequests,
// admin xử lý tay trong game rồi duyệt trên panel. Nguyên tắc tiền bạc:
//
//  - kind 'to-game' (Discord -> game) và 'item' (mua đồ): TRỪ VÍ NGAY khi tạo đơn
//    (giữ chỗ). Duyệt = admin đã giao trong game, không đụng ví nữa. Từ chối = hoàn đủ.
//  - kind 'to-discord' (game -> Discord) và 'gold' (đổi vàng): KHÔNG đụng ví khi tạo
//    đơn. Duyệt = admin xác nhận ĐÃ NHẬN đồ trong game -> lúc đó mới cộng ví.
//    Từ chối = không có gì để hoàn.
//
// Cách này không có đường nào tự in tiền: chiều nào ví cũng chỉ tăng SAU khi admin
// xác nhận đã cầm được đồ thật.

const TICKET_KIND_LABEL = {
    'to-game': '🎮 Chuyển Dogcoin vào game',
    'to-discord': '💬 Chuyển Dog Coin ra Discord',
};

// CỔNG BẮT BUỘC ONLINE cho nạp/rút (yêu cầu chủ server): hỏi mod đếm túi người đó
// TRƯỚC khi đụng tới tiền. Mod chạy TRONG game nên chỉ thấy người đang online:
//   đếm được                         -> chắc chắn ONLINE (kèm luôn số dư túi)
//   "player not found"               -> OFFLINE
//   "Tried calling a member function"-> cũng là OFFLINE: người vừa thoát game để lại
//        PalPlayerState "xác" (IsValid vẫn true, còn đọc được tên) nhưng mod gọi
//        GetInventoryData() là nổ đúng câu lỗi này (main.lua:679)
//   lỗi khác / cầu SFTP chết         -> KHÔNG RÕ -> cũng chặn: chưa chắc online thì
//        không cho thao tác, chưa đụng đồng nào của ai.
// Chậm hơn (~5-20s cho lượt đếm) - đó là giá của việc kiểm chắc trước khi chuyển.
async function requireOnline(gameName) {
    // 08/09: COUNT là thao tác CHỈ ĐỌC nên đứt giữa chừng (abort/timeout - hay gặp
    // ngay sau khi game server restart, SFTP còn ì) thì THỬ LẠI 1 lần sau 3s.
    // An toàn tuyệt đối: không giao gì ở bước này, không có cửa giao trùng.
    for (let attempt = 0; attempt < 2; attempt++) {
        let c = null, err = null;
        try { c = await pal.countItem(gameName, 'DogCoin'); } catch (e) { err = e; }
        const msg = (c && c.message) || (err && err.message) || '';
        if (c && c.ok && typeof c.count === 'number') return { online: true, count: c.count };
        if (/player not found/i.test(msg) || /Tried calling a member function/i.test(msg)) {
            return { online: false };
        }
        if (attempt === 0 && /aborted|timeout|timed out/i.test(msg)) {
            writeLog('SYSTEM', `[ONLINE CHECK] ${gameName} đứt lần 1 (${msg}) - thử lại sau 3s`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }
        return { unknown: true, msg };
    }
    return { unknown: true, msg: 'timeout sau 2 lần thử' };
}

function createTicket(fields) {
    const req = {
        id: withdrawSeq++,
        status: 'pending',
        time: new Date().toLocaleString('vi-VN'),
        ...fields,
    };
    withdrawRequests.unshift(req);
    if (withdrawRequests.length > 300) withdrawRequests.length = 300;
    return req;
}

// Mô tả việc admin cần làm trong game, dùng chung cho DM và panel.
function ticketActionText(req) {
    if (req.kind === 'to-discord') {
        return `NHẬN **${req.amount.toLocaleString()} Dog Coin** từ người chơi trong game, rồi duyệt để cộng ví Discord`;
    }
    // 'to-game'
    return `GIAO **${req.amount.toLocaleString()} Dog Coin** cho người chơi trong game (đã trừ ví Discord)`;
}

// Gửi đơn cho admin qua DM. DM hỏng không sao - panel vẫn là nguồn chính, chỉ ghi log.
async function sendTicketToAdmin(req) {
    const text =
        `📨 **ĐƠN MỚI** #${req.id} - ${TICKET_KIND_LABEL[req.kind] || req.kind}\n` +
        `Người chơi: <@${req.userId}> (\`${req.username}\`)` +
        (req.ingameName ? ` - trong game: **${req.ingameName}**` : '') + '\n' +
        `Việc cần làm: ${ticketActionText(req)}\n` +
        `Lúc: ${req.time}\n` +
        `Duyệt/từ chối trên panel.`;
    try {
        const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
        await admin.send(text);
    } catch (e) {
        writeLog('ADMIN', `[TICKET] Khong gui duoc DM cho admin - don #${req.id} (${req.kind}) cua ${req.username}: ${e.message}. Xem tren panel.`);
    }
}

// Nhắn cho người chơi khi đơn được xử lý. DM hỏng thì bỏ qua.
async function notifyTicketUser(req, text) {
    try {
        const user = await client.users.fetch(req.userId);
        await user.send(text);
    } catch { /* người chơi tắt DM */ }
}

// Admin duyệt đơn trên panel.
function approveWithdraw(id) {
    const req = withdrawRequests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'approved';
    req.doneAt = new Date().toLocaleString('vi-VN');

    if (req.kind === 'to-discord') {
        // Admin xác nhận đã nhận Dog Coin trong game -> giờ mới cộng ví.
        updatePoints(req.userId, req.amount);
        logDog('from-game', req.userId, req.username, req.amount, `admin xác nhận nhận Dog Coin trong game - đơn #${id}`);
        notifyTicketUser(req, `✅ Đơn **#${id}** xong: admin đã nhận Dog Coin, ví Discord của bạn +**${req.amount.toLocaleString()}** ${DOGCOIN_EMOJI}`).catch(() => {});
    } else { // 'to-game'
        notifyTicketUser(req, `✅ Đơn **#${id}** xong: admin đã đưa **${req.amount.toLocaleString()}** Dog Coin cho bạn trong game.`).catch(() => {});
    }

    writeLog('ADMIN', `[DUYỆT ĐƠN] #${id} (${req.kind || 'to-game'}) ${req.username} - ${ticketActionText(req)}`);
    return true;
}

// Admin từ chối. Chỉ hoàn với loại đã trừ ví lúc tạo đơn (to-game).
function rejectWithdraw(id) {
    const req = withdrawRequests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'rejected';
    req.doneAt = new Date().toLocaleString('vi-VN');

    const deducted = (!req.kind || req.kind === 'to-game') ? req.amount : 0;
    if (deducted > 0) {
        updatePoints(req.userId, deducted);
        logDog('refund', req.userId, req.username, deducted, `admin từ chối đơn #${id}`);
        notifyTicketUser(req, `↩️ Đơn **#${id}** bị admin từ chối. Đã hoàn lại **${deducted.toLocaleString()}** ${DOGCOIN_EMOJI} vào ví.`).catch(() => {});
    } else {
        notifyTicketUser(req, `❌ Đơn **#${id}** bị admin từ chối. Ví của bạn không thay đổi.`).catch(() => {});
    }
    writeLog('ADMIN', `[TỪ CHỐI ĐƠN] #${id} (${req.kind || 'to-game'}) ${req.username}${deducted > 0 ? ` - đã hoàn ${deducted.toLocaleString()} Dogcoin` : ''}`);
    return true;
}

// --- XÓA / RESET VÍ NGƯỜI CHƠI (từ dashboard) ---
// Khi mở mùa mới (vd: đổi sang Dog Coin của Palworld) thì xóa sạch ví cũ để mọi người
// chơi lại từ đầu. Xóa ví thì phải xóa luôn thứ bám theo userId, nếu không sẽ thành rác:
//   - yêu cầu rút đang chờ (duyệt/từ chối sau này sẽ cộng tiền cho ví đã xóa)
//   - lệnh ép mìn đang treo cho user đó
function backupDb(tag) {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = `./database.backup-${tag}-${stamp}.json`;
        fs.writeFileSync(file, JSON.stringify(dbCache, null, 2));
        return file;
    } catch (e) {
        writeLog('SYSTEM', `[LỖI BACKUP DB] ${e.message}`);
        return null;
    }
}

function deletePlayer(userId) {
    if (!userId || userId.startsWith('_')) return false;
    if (!dbCache[userId] || typeof dbCache[userId] !== 'object') return false;
    const name = dbCache[userId].name || userId;
    delete dbCache[userId];
    delete forcedMines[userId];
    withdrawRequests = withdrawRequests.filter(r => !(r.userId === userId && r.status === 'pending'));
    saveDbNow();
    writeLog('ADMIN', `[PANEL VÍ] Xóa ví ${name} (${userId})`);
    return true;
}

function resetAllPlayers(alsoHistory) {
    const ids = Object.keys(dbCache).filter(k => !k.startsWith('_') && dbCache[k] && typeof dbCache[k] === 'object');
    const backup = ids.length ? backupDb('reset') : null;
    ids.forEach(id => { delete dbCache[id]; });
    forcedMines = {};
    const pending = withdrawRequests.filter(r => r.status === 'pending').length;
    // Yêu cầu đang chờ luôn bị hủy (ví chủ nhân không còn tồn tại).
    withdrawRequests = alsoHistory ? [] : withdrawRequests.filter(r => r.status !== 'pending');
    if (alsoHistory) {
        withdrawSeq = 1;
        minesHistory = [];
        txDashHistory = [];
    }
    saveDbNow();
    writeLog('ADMIN', `[PANEL RESET] Xóa toàn bộ ${ids.length} ví`
        + (pending ? `, hủy ${pending} yêu cầu rút đang chờ` : '')
        + (alsoHistory ? ', xóa lịch sử ván + lịch sử rút' : '')
        + (backup ? ` | backup: ${backup}` : ''));
    return { count: ids.length, pending, backup };
}

async function deleteBotChat(channel) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    if (botMessages.size === 0) return 0;
    await channel.bulkDelete(botMessages, true);
    return botMessages.size;
}

// --- XỬ LÝ TƯƠNG TÁC ---
client.on('interactionCreate', async interaction => {
  try {
    const userId = interaction.user.id;
    // Đóng dấu tên hiển thị NGAY TƯƠNG TÁC ĐẦU TIÊN - getUserData tự tạo ví cho người
    // mới. Trước đây chỉ ghi tên khi ví ĐÃ tồn tại, nên acc mới vừa /diemdanh xong
    // hiện trong 🧧 Lộc lá là "(chưa đặt tên)", gõ tên không tìm ra, phải đợi lần
    // tương tác thứ 2 hoặc bot restart (backfill) mới có tên.
    // NAME_OVERRIDE không bị ảnh hưởng: getUserData ép lại tên đó ở mỗi lần đọc.
    getUserData(userId).name = interaction.user.username;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'diemdanh') {
            // Logic chung với web (claimDaily): reset theo NGÀY LỊCH giờ VN, ghi sổ
            // tháng cho lịch điểm danh trên web, đủ tháng nhận thêm bonus.
            const r = claimDaily(userId);
            if (r.error) return interaction.reply({ content: `⏳ ${r.error}`, ephemeral: true });
            return interaction.reply(
                `🎁 **Điểm danh thành công!** Bạn nhận được **${r.amount.toLocaleString()}** ${DOGCOIN_EMOJI}` +
                (r.debtCut ? ` (📒 trừ **${r.debtCut.toLocaleString()}** trả nợ, còn nợ ${r.debtLeft.toLocaleString()})` : '') + `. ` +
                `Số dư mới: **${r.balance.toLocaleString()}** ${DOGCOIN_EMOJI}\n` +
                `Chuỗi: **${r.state.streak} ngày**` +
                (r.streakEarned ? ` - 🔥 **ĐỦ CHUỖI ${dailyCfg().streakEvery}!** Vào web (tab 📅) bấm nhận **${dailyCfg().streakBonus.toLocaleString()}** ${DOGCOIN_EMOJI}` : '') +
                (r.state.streakPacks > 0 && !r.streakEarned ? ` - còn **${r.state.streakPacks}** gói thưởng chuỗi chưa nhận, vào web lấy nhé` : '')
            );
        }

        if (interaction.commandName === 'nghien') {
            // Cooldown LĂN 60 phút từ lần nhận trước - logic chung với web (claimNghien).
            // KHÔNG đăng công khai: lời đáp dưới đây đã hiện ngay tại kênh, đăng thêm
            // là ra 2 tin trùng nội dung.
            const r = claimNghien(userId);
            if (r.error) return interaction.reply({ content: `⏳ ${r.error}`, ephemeral: true });
            return interaction.reply(`💉 **Điểm danh con nghiện!** Bạn nhận được **${r.amount.toLocaleString()}** ${DOGCOIN_EMOJI}` +
                (r.debtCut ? ` (📒 trừ **${r.debtCut.toLocaleString()}** trả nợ, còn nợ ${r.debtLeft.toLocaleString()})` : '') +
                `. Số dư mới: **${r.balance.toLocaleString()}** ${DOGCOIN_EMOJI} - quay lại sau 1 tiếng nhé.`);
        }

        if (interaction.commandName === 'sodu') {
            const points = getUserData(userId).points;
            const st = debtStatus(userId);
            const desc = [
                `Số dư hiện tại: **${points.toLocaleString()}** ${DOGCOIN_EMOJI}`,
                ...(st.loan > 0 ? [`📒 Nợ vay: **${st.loan.toLocaleString()}** (đã gồm phí ${st.feePct}%; chưa trả là +${st.feePct}%/ngày)`] : []),
                ...(st.admin > 0 ? [`🧾 Nợ admin: **${st.admin.toLocaleString()}** (mua đồ ghi sổ - cũng đẻ lãi ${st.feePct}%/ngày)`] : []),
                ...(st.bad ? [`⚠️ **ĐANG DÍNH NỢ XẤU** - trả sạch là nhãn tự bay`] : []),
            ].join('\n');
            const embed = new EmbedBuilder()
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .setTitle("💳 VÍ DOGCOIN CỦA BẠN")
                .setDescription(desc)
                .setColor(st.bad ? 0xe74c3c : st.total > 0 ? 0xf1c40f : 0x00ff00);
            // Đang nợ thì kèm nút trả ngay tại chỗ - khỏi chạy qua kênh bảng vay
            const btns = [];
            if (st.loan > 0) btns.push(new ButtonBuilder().setCustomId('vay_pay_open').setLabel('Trả nợ vay').setEmoji('💳').setStyle(ButtonStyle.Primary));
            if (st.admin > 0) btns.push(new ButtonBuilder().setCustomId('vay_pay_admin_open').setLabel('Trả nợ admin').setEmoji('🧾').setStyle(ButtonStyle.Secondary));
            return interaction.reply({
                embeds: [embed],
                components: btns.length ? [new ActionRowBuilder().addComponents(...btns)] : [],
            });
        }

        if (interaction.commandName === 'chuyentien') {
            const receiver = interaction.options.getUser('nguoi');
            const amount = interaction.options.getInteger('sotien');
            if (receiver.id === userId) return interaction.reply({ content: "❌ Không thể tự chuyển cho mình!", ephemeral: true });
            if (amount <= 0) return interaction.reply({ content: "❌ Số Dogcoin không hợp lệ!", ephemeral: true });
            
            const senderData = getUserData(userId);
            if (senderData.points < amount) return interaction.reply({ content: `❌ Bạn không đủ Dogcoin!`, ephemeral: true });
            debtAccrue(userId);
            if (debtOf(senderData).bad) {
                return interaction.reply({ content: `⚠️ Bạn đang bị gắn **NỢ XẤU** (nợ ${debtTotal(senderData).toLocaleString()} ${DOGCOIN_EMOJI}) - trả nợ (nút 💳 ở bảng VAY NỢ) rồi nhờ admin gỡ nhãn mới chuyển tiền được.`, ephemeral: true });
            }

            updatePoints(userId, -amount);
            updatePoints(receiver.id, amount);
            logDog('transfer', userId, interaction.user.tag, -amount, `chuyển cho ${receiver.tag}`);
            logDog('transfer', receiver.id, receiver.tag, amount, `nhận từ ${interaction.user.tag}`);
            writeLog('ADMIN', `[CHUYỂN TIỀN] ${interaction.user.tag} → ${receiver.tag} | ${amount.toLocaleString()} Dogcoin`);
            debtBadSweep(receiver.id);   // 27/08: người nhận nợ xấu -> xiết trả nợ (chừa 1.000)
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle("💸 GIAO DỊCH").setDescription(`✅ <@${userId}> đã chuyển **${amount.toLocaleString()}** ${DOGCOIN_EMOJI} cho <@${receiver.id}>!`).setColor(0x00aeef)] });
        }

        // Lệnh /domin đã gỡ. Discord còn cache lệnh cũ ở máy người chơi một lúc nên vẫn
        // bắt ở đây để chỉ đường sang web, thay vì để họ bấm rồi không thấy gì.
        if (interaction.commandName === 'domin') {
            return interaction.reply({
                content: `💎 **Dò Mìn đã chuyển lên web** - lưới 25 ô, đào tới đâu ăn tới đó.\n` +
                         `👉 ${WEB_PLAY_URL} → tab **💎 Dò Mìn**\n` +
                         `Lấy mã PIN bằng nút **🌐 Cược trên web** ở bảng Big Small.`,
                ephemeral: true,
            });
        }

        // (Bản dò mìn cũ chạy trong Discord đã XÓA hẳn 04/09 - bản web là chuẩn; cần xem lại thì lục git history.)
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'tx_modal_custom') {
            if (txState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
            const sel = userTXSelections[userId];
            if (!sel) return interaction.reply({ content: "❌ Bạn chưa chọn cửa cược!", ephemeral: true });

            const amountStr = interaction.fields.getTextInputValue('tx_input_amount');
            const amt = parseInt(amountStr);

            if (isNaN(amt) || amt <= 0 || getUserData(userId).points < amt) {
                return interaction.reply({ content: "❌ Số Dogcoin không hợp lệ hoặc bạn không đủ Dogcoin!", ephemeral: true });
            }
            const txCapErr = txCapCheck(userId, amt);
            if (txCapErr) return interaction.reply({ content: '❌ ' + txCapErr, ephemeral: true });

            updatePoints(userId, -amt);
            txState.bets.push({ userId, username: interaction.user.username, choice: sel.choice, amount: amt });

            userTXSelections[userId] = null;
            txState.activeChoice = null;
            // Reply ngay, KHÔNG await edit bảng: edit message bị Discord rate-limit,
            // đông người là chờ quá 3s -> interaction chết. Vòng lặp 1s tự vẽ lại.
            txState.needsUpdate = true;

            return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()}** ${DOGCOIN_EMOJI} vào **${TX_CHOICES[sel.choice].name}**!`, ephemeral: true });
        }

        // ===== SHOP PAL TỰ CHỌN: nhận đơn =====
        // Thứ tự: kiểm tra passive cấm + số dư + tên pal -> TRỪ TIỀN -> gửi đơn cho admin.
        // Nếu gửi DM cho admin thất bại thì HOÀN TIỀN ngay, vì không có đơn thì người
        // chơi sẽ không bao giờ nhận được pal.
        if (interaction.customId === 'shop_modal_custom') {
            const price = PAL_SHOP.customPrice;
            const souls = interaction.fields.getTextInputValue('shop_souls').trim().slice(0, 200);
            const passives = interaction.fields.getTextInputValue('shop_passives').trim().slice(0, 400);

            // Chặn TRƯỚC khi trừ tiền - người chơi sửa lại rồi mua tiếp, không mất gì.
            const banned = findBannedPassive(passives);
            if (banned) {
                return interaction.reply({
                    content: `🚫 Passive **${banned}** thuộc nhóm Cây Thế Giới - không bán kèm pal.\nMuốn passive đó thì mua **cấy ghép ở sạp trong game**. Chọn passive khác rồi mua lại nhé (chưa bị trừ tiền).`,
                    ephemeral: true,
                });
            }

            const balance = getUserData(userId).points || 0;
            if (balance < price) {
                return interaction.reply({
                    content: `❌ Không đủ Dogcoin! Cần **${price.toLocaleString()}**, bạn có **${balance.toLocaleString()}** ${DOGCOIN_EMOJI}`,
                    ephemeral: true,
                });
            }

            const input = interaction.fields.getTextInputValue('shop_pal');
            const pal = findPalByName(input);
            if (!pal) {
                return interaction.reply({
                    content: `❌ Không tìm thấy pal **${input}**. Gõ tên tiếng Anh (vd: Anubis, Jetragon, Lamball).\n` +
                             `Nếu là pal raid (${(PAL_DATA.raidOnly || []).join(', ')}) thì không mua được - chỉ có thể trúng ở nút ngẫu nhiên.`,
                    ephemeral: true,
                });
            }

            await interaction.deferReply({ ephemeral: true });

            updatePoints(userId, -price);
            const order = {
                id: dbCache._palOrderSeq = (dbCache._palOrderSeq || 0) + 1,
                userId,
                username: interaction.user.tag,
                kind: 'custom',
                price,
                palName: pal.name,
                palCode: pal.code,
                souls,
                passives,
                status: 'pending',   // admin bấm "Hoàn thành" trên panel sau khi đã tạo pal trong game
                time: new Date().toLocaleString('vi-VN'),
            };

            const sent = await sendPalOrderToAdmin(order);
            if (!sent) {
                updatePoints(userId, price); // hoàn tiền vì admin không nhận được đơn
                logDog('refund', userId, interaction.user.tag, price, `hoàn đơn pal #${order.id} (không gửi được cho admin)`);
                return interaction.editReply(
                    '❌ Không gửi được đơn cho admin (admin chặn tin nhắn riêng?). ' +
                    `Đã **hoàn lại ${price.toLocaleString()}** ${DOGCOIN_EMOJI} cho bạn. Nhờ admin kiểm tra cài đặt tin nhắn riêng.`
                );
            }

            if (!Array.isArray(dbCache._palOrders)) dbCache._palOrders = [];
            dbCache._palOrders.unshift(order);
            if (dbCache._palOrders.length > 200) dbCache._palOrders.length = 200;

            logDog('shop', userId, interaction.user.tag, -price, `mua pal ${pal.name} (tự chọn) - đơn #${order.id}`);
            writeLog('ADMIN', `[SHOP PAL] #${order.id} ${order.username} mua ${order.palName} (custom, ${price} Dogcoin) | linh hon: ${souls} | passive: ${passives}`);

            return interaction.editReply(
                `🎯 Đã đặt: **${pal.name}** 👑\n` +
                `• Bản Boss, ${PAL_SHOP.stars} sao, IV ${PAL_SHOP.ivs} cả 3 chỉ số\n` +
                `• Linh hồn ${PAL_SHOP.soulPercent}%: ${souls}\n` +
                `• Passive: ${passives}\n\n` +
                `Đã trừ **${price.toLocaleString()}** ${DOGCOIN_EMOJI} (còn **${getUserData(userId).points.toLocaleString()}**).\n` +
                `Mã đơn **#${order.id}** đã gửi cho admin - chờ admin tạo pal và giao trong game.`
            );
        }

        // ===== SHOP PAL NGẪU NHIÊN: người chơi điền passive/linh hồn cho đơn đã quay =====
        // Tiền đã trừ từ lúc quay; ở đây chỉ bổ sung lựa chọn rồi báo admin.
        if (interaction.customId.startsWith('shop_fill_modal_')) {
            const oid = parseInt(interaction.customId.slice('shop_fill_modal_'.length));
            const order = (dbCache._palOrders || []).find((o) => o.id === oid);
            if (!order) return interaction.reply({ content: '❌ Không tìm thấy đơn này.', ephemeral: true });
            if (order.userId !== userId) return interaction.reply({ content: '❌ Đơn này không phải của bạn.', ephemeral: true });
            if (order.resold) return interaction.reply({ content: `💰 Đơn #${oid} đã bán lại rồi - không chọn được nữa.`, ephemeral: true });
            if (order.souls || order.passives) {
                return interaction.reply({ content: `✅ Đơn #${oid} đã chọn rồi: linh hồn **${order.souls}** | passive **${order.passives}**`, ephemeral: true });
            }

            const souls = interaction.fields.getTextInputValue('shop_souls').trim().slice(0, 200);
            const passives = interaction.fields.getTextInputValue('shop_passives').trim().slice(0, 400);

            const banned = findBannedPassive(passives);
            if (banned) {
                // Không lưu gì - nút "Chọn passive & linh hồn" vẫn dùng lại được.
                return interaction.reply({
                    content: `🚫 Passive **${banned}** thuộc nhóm Cây Thế Giới - không bán kèm pal.\nMuốn passive đó thì mua **cấy ghép ở sạp trong game**. Bấm lại nút và chọn passive khác nhé.`,
                    ephemeral: true,
                });
            }

            order.souls = souls;
            order.passives = passives;
            writeLog('ADMIN', `[SHOP PAL] #${oid} ${order.username} chot lua chon cho ${order.palName}: linh hon ${souls} | passive ${passives}`);

            // Báo admin phần bổ sung. DM hỏng không sao - panel đã có đủ thông tin.
            (async () => {
                try {
                    const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
                    await admin.send(
                        `📝 **BỔ SUNG ĐƠN PAL** #${oid} - **${order.palName}** của \`${order.username}\`\n` +
                        `• Linh hồn ${PAL_SHOP.soulPercent}%: ${souls}\n` +
                        `• Passive: ${passives}`
                    );
                } catch (e) {
                    writeLog('ADMIN', `[SHOP PAL] Khong DM duoc phan bo sung don #${oid}: ${e.message} - xem tren panel`);
                }
            })();

            return interaction.reply({
                content:
                    `✅ Đã chốt cho **${order.palName}** (đơn #${oid}):\n` +
                    `• Linh hồn ${PAL_SHOP.soulPercent}%: ${souls}\n` +
                    `• Passive: ${passives}\n` +
                    `Chờ admin tạo pal và giao trong game.`,
                ephemeral: true,
            });
        }

        // ===== CHUYỂN DOG COIN TỪ GAME RA DISCORD (ticket) =====
        // KHÔNG cộng ví ở đây. Người chơi đưa Dog Coin cho admin trong game;
        // admin duyệt đơn trên panel thì ví mới được cộng (xem approveWithdraw).
        // ===== XỔ SỐ: nhận cược đề / lô =====
        if (interaction.customId === 'xs_modal_de' || interaction.customId === 'xs_modal_lo') {
            const kind = interaction.customId === 'xs_modal_de' ? 'de' : 'lo';
            const kindLabel = kind === 'de' ? 'ĐỀ' : 'LÔ';
            if (xsState.status !== 'betting') {
                return interaction.reply({ content: `🔒 Đã khóa sổ (từ phút ${XS_LOCK_MINUTE}). Chờ kỳ sau nhé!`, ephemeral: true });
            }
            const numRaw = interaction.fields.getTextInputValue('xs_num').trim();
            const amtRaw = interaction.fields.getTextInputValue('xs_amt').trim();
            if (!/^\d{1,2}$/.test(numRaw)) {
                return interaction.reply({ content: '❌ Số phải từ **00** đến **99** (ví dụ: 07, 27, 68).', ephemeral: true });
            }
            const num = numRaw.padStart(2, '0');
            const amt = parseInt(amtRaw);
            if (isNaN(amt) || amt <= 0) {
                return interaction.reply({ content: '❌ Tiền cược không hợp lệ!', ephemeral: true });
            }
            const userData = getUserData(userId);
            if (userData.points < amt) {
                return interaction.reply({ content: `❌ Không đủ Dogcoin! Số dư: **${userData.points.toLocaleString()}** ${DOGCOIN_EMOJI}`, ephemeral: true });
            }
            if (!xsState.bets[userId]) xsState.bets[userId] = { name: interaction.user.username, de: {}, lo: {} };
            const my = xsState.bets[userId];
            my.name = interaction.user.username;
            const bucket = my[kind];
            const existing = bucket[num] || 0;
            if (existing + amt > XS_MAX_PER_NUMBER) {
                return interaction.reply({ content: `❌ Tiền cược tối đa **${XS_MAX_PER_NUMBER.toLocaleString()}** ${DOGCOIN_EMOJI} mỗi số (số ${num} bạn đã đặt ${existing.toLocaleString()}, số dư ${userData.points.toLocaleString()} ${DOGCOIN_EMOJI}).`, ephemeral: true });
            }
            if (!existing && Object.keys(bucket).length >= XS_MAX_NUMBERS_PER_TYPE) {
                return interaction.reply({ content: `❌ Mỗi kỳ tối đa **${XS_MAX_NUMBERS_PER_TYPE} số ${kindLabel}**. Bạn đã đặt: ${Object.keys(bucket).map(n => `**${n}**`).join(', ')}.`, ephemeral: true });
            }
            updatePoints(userId, -amt);
            bucket[num] = existing + amt;
            xsState.needsUpdate = true; // vòng lặp 5s vẽ lại bảng - không await edit kẻo trễ 3s
            const rate = kind === 'de' ? `trúng ăn ×${XS_DE_RATE}` : `mỗi nháy ăn ×${XS_LO_RATE}`;
            return interaction.reply({
                content: `💸 Đã đánh ${kindLabel} số **${num}** - **${bucket[num].toLocaleString()}** ${DOGCOIN_EMOJI} (${rate}). Số dư còn **${getUserData(userId).points.toLocaleString()}** ${DOGCOIN_EMOJI}`,
                ephemeral: true,
            });
        }

        // (Nút 📛 tự đặt tên đã bỏ: người chơi tự đặt được tên là tự nhận tên nhân
        //  vật NGƯỜI KHÁC rồi bấm 💬 rút trộm túi họ. Giờ CHỈ admin liên kết tên
        //  ở panel, tab 🎮 Palworld & Dogcoin - ghi vào userData.ingameName.)

        // ===== NẠP (game -> Discord) TỰ ĐỘNG qua cầu SFTP =====
        // Luật tiền (README): TRỪ ITEM TRONG GAME TRƯỚC, mod xác nhận trừ đủ đúng số
        // (`took` === amt) rồi mới cộng ví. Mod trả ERROR là CHẮC CHẮN chưa mất gì
        // (thiếu tiền nó không trừ, trừ lệch nó tự hoàn - xem main.lua) -> chỉ báo
        // người chơi. Riêng timeout/không phản hồi là KHÔNG CHẮC -> đơn cho admin
        // đối chiếu results.log, KHÔNG cộng ví trước.
        // ======== 📒 VAY NỢ: nhận modal vay / trả ========
        if (interaction.customId === 'vay_modal') {
            const amt = parseInt(interaction.fields.getTextInputValue('vay_amount'));
            const r = debtBorrow(userId, interaction.user.tag, amt);
            if (r.error) return interaction.reply({ content: '❌ ' + r.error, ephemeral: true });
            return interaction.reply({
                content:
                    `💰 Bơm **${r.amount.toLocaleString()}** ${DOGCOIN_EMOJI} vào ví thành công - ví hiện có **${r.balance.toLocaleString()}**. Gỡ đẹp nha! 🙏\n` +
                    `Ghi sổ **${r.owed.toLocaleString()}** (vay + phí ${r.debt.feePct}%) - đang ôm nợ tổng: **${r.debt.total.toLocaleString()}**.\n` +
                    `⏰ Qua mỗi mốc **00:00** chưa trả là CẢ CỤC NỢ đẻ thêm **${r.debt.feePct}%** (kể cả nợ admin). Trả sớm cho nhẹ, chây ì là ăn dấu ⚠️ nợ xấu!`,
                ephemeral: true,
            });
        }
        if (interaction.customId === 'vay_pay_modal') {
            const raw = (interaction.fields.getTextInputValue('vay_pay_amount') || '').trim();
            const r = debtPay(userId, interaction.user.tag, raw ? parseInt(raw) : 0);
            if (r.error) return interaction.reply({ content: '❌ ' + r.error, ephemeral: true });
            return interaction.reply({
                content: r.debt.total > 0
                    ? `💳 Trả **${r.paid.toLocaleString()}** ${DOGCOIN_EMOJI}, còn ôm **${r.debt.total.toLocaleString()}**${r.debt.bad ? ' (⚠️ vẫn nợ xấu - trả SẠCH là nhãn tự bay)' : ''}. Ví còn **${r.balance.toLocaleString()}**. Cố lên, sắp thoát kiếp con nợ rồi!`
                    : `✅ Trả **${r.paid.toLocaleString()}** ${DOGCOIN_EMOJI} - **SẠCH NỢ, NGẨNG CAO ĐẦU!** Ví còn **${r.balance.toLocaleString()}**. Giờ thì... vay tiếp không? 😏`,
                ephemeral: true,
            });
        }

        if (interaction.customId === 'vay_pay_admin_modal') {
            const raw = (interaction.fields.getTextInputValue('vay_pay_admin_amount') || '').trim();
            const r = debtPayAdmin(userId, interaction.user.tag, raw ? parseInt(raw) : 0);
            if (r.error) return interaction.reply({ content: '❌ ' + r.error, ephemeral: true });
            return interaction.reply({
                content: r.debt.total > 0
                    ? `🧾 Trả **${r.paid.toLocaleString()}** ${DOGCOIN_EMOJI} nợ admin, còn ôm tổng **${r.debt.total.toLocaleString()}**. Ví còn **${r.balance.toLocaleString()}**.`
                    : `✅ Trả **${r.paid.toLocaleString()}** ${DOGCOIN_EMOJI} - **SẠCH NỢ, NGẨNG CAO ĐẦU!** Ví còn **${r.balance.toLocaleString()}**.`,
                ephemeral: true,
            });
        }

        if (interaction.customId === 'nap_modal') {
            const amt = parseInt(interaction.fields.getTextInputValue('nap_input_amount'));
            if (isNaN(amt) || amt <= 0) {
                return interaction.reply({ content: '❌ Số Dog Coin không hợp lệ!', ephemeral: true });
            }
            // 27/08: trần mỗi lần chiều game -> Discord, đối xứng với chiều kia (50.000)
            if (amt > WITHDRAW_MAX_PER_REQUEST) {
                return interaction.reply({ content: `❌ Mỗi lần chỉ chuyển tối đa **${WITHDRAW_MAX_PER_REQUEST.toLocaleString()}** ${DOGCOIN_EMOJI} ra Discord. Muốn nhiều hơn thì chuyển nhiều lần.`, ephemeral: true });
            }
            const gameName = (getUserData(userId).ingameName || '').trim();
            if (!gameName) {
                return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game - nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true }); // đếm + take mỗi lượt 5-20s, quá deadline 3s của Discord

            // BẮT BUỘC ONLINE trước, chưa online thì không thao tác gì cả
            const on = await requireOnline(gameName);
            if (on.online === false) {
                return interaction.editReply(`🔴 Nhân vật **${gameName}** chưa online trong game - chưa trừ gì cả.\nVào game rồi bấm lại nhé; nếu sai tên thì nhắn **admin** sửa liên kết.`);
            }
            if (on.unknown) {
                return interaction.editReply(`⏳ Chưa hỏi được server game nên chưa dám thao tác - chưa trừ gì cả. Thử lại sau chút nhé.`);
            }
            if (on.count < amt) {
                return interaction.editReply(`❌ Trong túi bạn chỉ có **${on.count.toLocaleString()}** Dog Coin, không đủ ${amt.toLocaleString()} - chưa trừ gì cả.\n(Chỉ tính Dog Coin **trong túi** - để trong hòm thì cầm ra túi trước nhé.)`);
            }

            writeLog('ADMIN', `[NẠP TỰ ĐỘNG] ${interaction.user.tag} chuyển ${amt.toLocaleString()} Dog Coin từ game ("${gameName}") ra Discord (túi đang có ${on.count})`);

            let r = null, err = null;
            try { r = await pal.takeItem(gameName, 'DogCoin', amt); } catch (e) { err = e; }

            if (r && r.ok && r.took === amt) {
                updatePoints(userId, amt);
                logDog('from-game', userId, interaction.user.tag, amt, `nạp từ game (tự động, nhân vật ${gameName})`);
                saveDbNow();
                return interaction.editReply(`✅ Đã chuyển **${amt.toLocaleString()}** Dog Coin từ game vào ví Discord! Ví hiện có **${getUserData(userId).points.toLocaleString()}** ${DOGCOIN_EMOJI}`);
            }

            const msg = (r && r.message) || (err && err.message) || '';
            if (/player not found/i.test(msg)) {
                return interaction.editReply(`↩️ Không thấy **${gameName}** trong game (chưa online hoặc sai tên) - chưa trừ gì cả.\nVào game rồi bấm lại; nếu sai tên thì nhắn **admin** sửa liên kết.`);
            }
            const thieu = /khong du/i.test(msg) && msg.match(/trong game co (\d+)/);
            if (thieu) {
                return interaction.editReply(`❌ Trong túi bạn chỉ có **${Number(thieu[1]).toLocaleString()}** Dog Coin, không đủ ${amt.toLocaleString()} - chưa trừ gì cả.\n(Chỉ tính Dog Coin **trong túi** - để trong hòm thì cầm ra túi trước nhé.)`);
            }
            if (/ERROR/.test(msg) && !/LUA ERROR/i.test(msg)) {
                // Mod từ chối rõ ràng -> trong game không mất gì
                return interaction.editReply(`❌ Không trừ được Dog Coin trong game - chưa mất gì cả. Mod báo: \`${msg.slice(0, 250)}\``);
            }
            // Không rõ item đã bị trừ trong game hay chưa -> đơn cho admin, KHÔNG cộng ví
            const req = createTicket({ kind: 'to-discord', userId, username: interaction.user.username, ingameName: gameName, amount: amt });
            writeLog('ADMIN', `[NẠP TỰ ĐỘNG LỖI] #${req.id} ${interaction.user.tag} ${amt} Dog Coin từ "${gameName}" | ${msg || 'timeout'} - xem results.log: item ĐÃ trừ thì DUYỆT (cộng ví), chưa trừ thì TỪ CHỐI`);
            sendTicketToAdmin(req).catch(() => {});
            return interaction.editReply(`⏳ Chưa xác nhận được với server game (đơn **#${req.id}**). Admin sẽ đối chiếu: Dog Coin trong game đã bị trừ thì ví Discord được cộng đủ, chưa trừ thì hủy đơn - không mất tiền đâu.`);
        }

        // (Mua Lõi Văn Minh / cấy ghép / đổi vàng đã bỏ khỏi Discord - bán ở sạp trong game.)

        // ===== RÚT (Discord -> game) TỰ ĐỘNG qua cầu SFTP =====
        // Luật tiền (README): trừ ví TRƯỚC; mod báo "player not found" (chưa vào game/
        // sai tên) là lỗi CHẮC CHẮN chưa giao -> hoàn ngay; timeout/lỗi lạ thì KHÔNG
        // tự hoàn (có thể đã giao) -> đơn cho admin kiểm tra results.log.
        if (interaction.customId === 'rut_modal') {
            const amountStr = interaction.fields.getTextInputValue('rut_input_amount');
            const amt = parseInt(amountStr);
            const userData = getUserData(userId);

            if (isNaN(amt) || amt <= 0) {
                return interaction.reply({ content: "❌ Số Dogcoin không hợp lệ!", ephemeral: true });
            }
            if (amt > WITHDRAW_MAX_PER_REQUEST) {
                return interaction.reply({ content: `❌ Mỗi lần chỉ rút tối đa **${WITHDRAW_MAX_PER_REQUEST.toLocaleString()}** ${DOGCOIN_EMOJI}. Muốn rút nhiều hơn thì rút nhiều lần.`, ephemeral: true });
            }
            if (userData.points < amt) {
                return interaction.reply({ content: `❌ Bạn không đủ Dogcoin! Số dư hiện tại: **${userData.points.toLocaleString()}** ${DOGCOIN_EMOJI}`, ephemeral: true });
            }
            const gameName = (userData.ingameName || '').trim();
            if (!gameName) {
                return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game - nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
            }
            // Chỉ NỢ XẤU mới cấm chuyển vào game (nợ thường vẫn chuyển bình thường)
            debtAccrue(userId);
            if (debtOf(userData).bad) {
                return interaction.reply({ content: `⚠️ Bạn đang bị gắn **NỢ XẤU** (nợ ${debtTotal(userData).toLocaleString()} ${DOGCOIN_EMOJI}) - trả nợ (nút 💳 ở bảng VAY NỢ) rồi nhờ admin gỡ nhãn mới chuyển vào game được.`, ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true }); // đếm + give mỗi lượt 5-20s, quá deadline 3s của Discord

            // BẮT BUỘC ONLINE trước, chưa online thì không trừ ví, không thao tác gì cả
            const on = await requireOnline(gameName);
            if (on.online === false) {
                return interaction.editReply(`🔴 Nhân vật **${gameName}** chưa online trong game - chưa trừ đồng nào của bạn.\nVào game rồi bấm rút lại nhé; nếu sai tên thì nhắn **admin** sửa liên kết.`);
            }
            if (on.unknown) {
                return interaction.editReply(`⏳ Chưa hỏi được server game nên chưa dám thao tác - chưa trừ đồng nào. Thử lại sau chút nhé.`);
            }

            updatePoints(userId, -amt); // trừ ví TRƯỚC (giữ chỗ)
            logDog('to-game', userId, interaction.user.tag, -amt, `rút vào game (tự động, nhân vật ${gameName})`);
            writeLog('ADMIN', `[RÚT TỰ ĐỘNG] ${interaction.user.tag} chuyển ${amt.toLocaleString()} Dogcoin vào game cho "${gameName}"`);

            let r = null, err = null;
            try { r = await pal.giveItem(gameName, 'DogCoin', amt); } catch (e) { err = e; }

            if (r && r.ok) {
                saveDbNow();
                return interaction.editReply(`✅ Đã giao **${amt.toLocaleString()}** Dog Coin cho **${gameName}** trong game! Ví còn **${getUserData(userId).points.toLocaleString()}** ${DOGCOIN_EMOJI}`);
            }
            const msg = (r && r.message) || (err && err.message) || '';
            if (/player not found/i.test(msg)) {
                // Mod xác nhận CHƯA giao -> hoàn ngay, an toàn
                updatePoints(userId, amt);
                logDog('refund', userId, interaction.user.tag, amt, 'hoàn rút tự động: chưa vào game / sai tên');
                return interaction.editReply(`↩️ Không thấy **${gameName}** trong game (chưa online hoặc sai tên) - đã hoàn **${amt.toLocaleString()}** ${DOGCOIN_EMOJI}.\nVào game rồi bấm rút lại; nếu sai tên thì nhắn **admin** sửa liên kết.`);
            }
            // Không rõ đã giao hay chưa -> đơn cho admin, KHÔNG tự hoàn
            const req = createTicket({ kind: 'to-game', userId, username: interaction.user.username, ingameName: gameName, amount: amt });
            writeLog('ADMIN', `[RÚT TỰ ĐỘNG LỖI] #${req.id} ${interaction.user.tag} ${amt} Dogcoin -> "${gameName}" | ${msg || 'timeout'} - kiểm tra results.log rồi duyệt/hoàn`);
            sendTicketToAdmin(req).catch(() => {});
            return interaction.editReply(`⏳ Chưa xác nhận được với server game (đơn **#${req.id}**). Ví đã trừ; admin sẽ kiểm tra - nếu chưa nhận được trong game thì admin hoàn lại, đừng lo mất tiền.`);
        }
    }

    if (!interaction.isButton()) return;

    // ======== NÚT LẤY PIN WEB CƯỢC ========
    if (interaction.customId === 'web_pin') {
        const userData = getUserData(userId);
        userData.name = userData.name || interaction.user.username;
        if (!userData.webPin) {
            userData.webPin = String(Math.floor(100000 + Math.random() * 900000));
            saveDbNow();
        }
        return interaction.reply({
            content:
                `🌐 **Chơi trên web - nhanh, không lag Discord:**\n${WEB_PLAY_URL}\n\n` +
                `🎲 **Big Small** - đặt cược + nặn xí ngầu\n💣 **Dò Mìn** - lưới 25 ô, đào tới đâu ăn tới đó\n\n` +
                `🆔 Discord ID: \`${userId}\`\n🔑 Mã PIN: **${userData.webPin}**\n\n` +
                `Vào web nhập ID + PIN là chơi được. PIN dùng mãi, bấm lại nút này để xem lại. ĐỪNG đưa PIN cho ai - ai có PIN là tiêu được ví bạn!`,
            ephemeral: true,
        });
    }

    // (Nút bj_link đã xóa cùng Blackjack 19/08 - bảng cũ nào còn nút này thì bấm
    //  vào sẽ không phản hồi, bảng đó cũng đã bị gỡ lúc bot khởi động.)

    // ======== NÚT XỔ SỐ ========
    if (interaction.customId === 'xs_de' || interaction.customId === 'xs_lo') {
        if (xsState.status !== 'betting') {
            return interaction.reply({ content: `🔒 Đã khóa sổ (từ phút ${XS_LOCK_MINUTE}). Chờ kỳ sau nhé!`, ephemeral: true });
        }
        const kind = interaction.customId === 'xs_de' ? 'de' : 'lo';
        const balance = getUserData(userId).points || 0;
        const modal = new ModalBuilder()
            .setCustomId(kind === 'de' ? 'xs_modal_de' : 'xs_modal_lo')
            .setTitle(kind === 'de' ? `🎯 Đánh Đề (1 ăn ${XS_DE_RATE})` : `🎰 Đánh Lô (1 ăn ${XS_LO_RATE}/nháy)`);
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('xs_num').setLabel('Số muốn đánh (00-99)').setPlaceholder('Ví dụ: 27')
                    .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                // label Discord tối đa 45 ký tự - format gọn + cắt cho chắc
                new TextInputBuilder().setCustomId('xs_amt')
                    .setLabel(`Tiền cược tối đa ${XS_MAX_PER_NUMBER.toLocaleString('vi-VN')} Dogcoin (dư ${balance.toLocaleString('vi-VN')})`.slice(0, 45))
                    .setPlaceholder('Ví dụ: 100')
                    .setStyle(TextInputStyle.Short).setRequired(true)
            ),
        );
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'xs_mybets') {
        const my = xsState.bets[userId];
        const deList = my ? Object.entries(my.de || {}) : [];
        const loList = my ? Object.entries(my.lo || {}) : [];
        if (!deList.length && !loList.length) {
            return interaction.reply({ content: `🧾 Ván #${padId(xsState.round)}: bạn chưa đặt số nào.`, ephemeral: true });
        }
        const fmt = (list) => list.map(([n, a]) => `**${n}**: ${a.toLocaleString()} ${DOGCOIN_EMOJI}`).join('\n');
        let text = `🧾 **Cược của bạn, ván #${padId(xsState.round)}**\n`;
        if (deList.length) text += `\n🎯 **Đề:**\n${fmt(deList)}`;
        if (loList.length) text += `\n🎰 **Lô:**\n${fmt(loList)}`;
        return interaction.reply({ content: text, ephemeral: true });
    }

    if (interaction.customId === 'xs_help') {
        return interaction.reply({
            content:
                `📖 **CÁCH CHƠI XỔ SỐ MIỀN BẮC**\n\n` +
                `Mỗi giờ bot quay 1 ván vào **đúng đầu giờ** (bảng 27 lô như XSMB thật). **Phút ${XS_LOCK_MINUTE} khóa sổ.**\n\n` +
                `🎯 **ĐỀ**: đoán 2 số cuối của **giải Đặc Biệt**. Trúng ăn **×${XS_DE_RATE}** tiền cược.\n` +
                `   Ví dụ: đánh đề 27 hết 100 ${DOGCOIN_EMOJI}, ĐB về ...27 → nhận **7.000** ${DOGCOIN_EMOJI}.\n\n` +
                `🎰 **LÔ**: số của bạn về trong **bất kỳ giải nào** của bảng 27 lô. Mỗi nháy ăn **×${XS_LO_RATE}**.\n` +
                `   Ví dụ: đánh lô 27 hết 100 ${DOGCOIN_EMOJI}, số 27 về 2 nháy → nhận **700** ${DOGCOIN_EMOJI}.\n\n` +
                `Giới hạn mỗi ván: **${XS_MAX_NUMBERS_PER_TYPE} số đề + ${XS_MAX_NUMBERS_PER_TYPE} số lô**, mỗi số tối đa **${XS_MAX_PER_NUMBER.toLocaleString()}** ${DOGCOIN_EMOJI}.\n` +
                `Tiền trừ ngay khi đặt, trúng tự cộng vào ví khi mở thưởng. Kết quả 5 ván gần nhất nằm ngay trong kênh.`,
            ephemeral: true,
        });
    }

    // ======== NÚT RÚT DOGCOIN ========
    // ======== 📒 VAY NỢ: các nút trên bảng ========
    if (interaction.customId === 'vay_open') {
        const st = debtStatus(userId);
        if (st.bad) {
            return interaction.reply({ content: `⚠️ Đang ôm nhãn **NỢ XẤU** mà còn mò vào vay tiếp?! Bấm 💳 trả sạch đi, nhãn tự bay là lại được bơm tiền.`, ephemeral: true });
        }
        if (st.canBorrowToday < 100) {
            return interaction.reply({ content: `🥱 Hút cạn hạn mức rồi: mỗi ngày bơm tối đa **${st.dailyMax.toLocaleString()}**, ôm tối đa **${st.cap.toLocaleString()}** (đang nợ vay ${st.loan.toLocaleString()}). Mai quay lại, hoặc... trả bớt đi?`, ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('vay_modal').setTitle(`Vay Dogcoin - phí ${st.feePct}% 1 lần`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vay_amount')
                .setLabel(`Số muốn vay (hôm nay còn ${st.canBorrowToday.toLocaleString()})`)
                .setPlaceholder(`vd: ${Math.min(2000, st.canBorrowToday)}`)
                .setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
    }
    if (interaction.customId === 'vay_pay_open') {
        const st = debtStatus(userId);
        if (st.total <= 0) return interaction.reply({ content: '✅ Bạn không nợ đồng nào.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('vay_pay_modal').setTitle('Trả nợ Dogcoin');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vay_pay_amount')
                .setLabel(`Đang nợ ${st.total.toLocaleString()} - bỏ trống = trả hết`)
                .setPlaceholder('vd: 1000 (hoặc bỏ trống)')
                .setStyle(TextInputStyle.Short).setRequired(false)
        ));
        return interaction.showModal(modal);
    }
    if (interaction.customId === 'vay_pay_admin_open') {
        const st = debtStatus(userId);
        if (st.admin <= 0) return interaction.reply({ content: '✅ Bạn không có khoản nợ admin nào.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('vay_pay_admin_modal').setTitle('Trả nợ admin (mua đồ ghi sổ)');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vay_pay_admin_amount')
                .setLabel(`Đang nợ admin ${st.admin.toLocaleString()} - trống = trả hết`)
                .setPlaceholder('vd: 500 (hoặc bỏ trống)')
                .setStyle(TextInputStyle.Short).setRequired(false)
        ));
        return interaction.showModal(modal);
    }
    if (interaction.customId === 'vay_my') {
        const st = debtStatus(userId);
        if (st.total <= 0) return interaction.reply({ content: `✨ Sạch nợ, uy tín đầy mình! Hôm nay có thể vay tới **${st.canBorrowToday.toLocaleString()}** ${DOGCOIN_EMOJI} - nhưng mà... có chắc cần không? 😏`, ephemeral: true });
        return interaction.reply({
            content:
                `📄 **Đang ôm nợ: ${st.total.toLocaleString()}** ${DOGCOIN_EMOJI}` +
                (st.admin > 0 ? `\n• Vay: **${st.loan.toLocaleString()}** · Admin ghi sổ: **${st.admin.toLocaleString()}** (giờ khoản này cũng đẻ lãi)` : '') +
                `\n• Lãi kép **${st.ratePct}%/ngày** trên CẢ CỤC NỢ - qua 00:00 đêm nay là nó lại đẻ. Hôm nay còn vay được **${st.canBorrowToday.toLocaleString()}**` +
                (st.bad ? `\n• ⚠️ **ĐANG DÍNH NỢ XẤU**: hết cửa vay, không chuyển tiền, không chuyển vào game, điểm danh bị xiết ${st.cutPct}% trả nợ. Trả SẠCH là nhãn tự bay!` : ''),
            ephemeral: true,
        });
    }

    if (interaction.customId === 'rut_open') {
        if (!(getUserData(userId).ingameName || '').trim()) {
            return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game - nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
        }
        const modal = new ModalBuilder()
            .setCustomId('rut_modal')
            .setTitle('Rút Dogcoin');

        const amountInput = new TextInputBuilder()
            .setCustomId('rut_input_amount')
            .setLabel(`Số dư hiện tại: ${getUserData(userId).points.toLocaleString()} Dogcoin`)
            .setPlaceholder('Ví dụ: 20')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
        return;
    }

    // ======== NÚT CHUYỂN DOG COIN TỪ GAME RA DISCORD ========
    if (interaction.customId === 'nap_open') {
        // KHÔNG gọi API nào trước showModal (Discord chỉ cho 3 giây, SFTP mất ~6s).
        if (!(getUserData(userId).ingameName || '').trim()) {
            return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game - nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('nap_modal').setTitle('Chuyển Dog Coin ra Discord');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nap_input_amount')
                .setLabel('Số Dog Coin muốn chuyển ra Discord')
                .setPlaceholder('Ví dụ: 20')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ));
        await interaction.showModal(modal);
        return;
    }

    // ======== SHOP PAL: TỰ CHỌN (3000) - modal chọn pal + passive + linh hồn ========
    if (interaction.customId === 'shop_custom') {
        // 25/08: mua pal tùy chọn đã DỜI LÊN WEB (tab 🎯 Chọn Pal, nhóm 👤 HỒ SƠ).
        return interaction.reply({
            content: `🎯 Chọn pal đã chuyển lên **web**: ${WEB_PLAY_URL}\nVào nhóm **👤 HỒ SƠ → 🎯 Chọn Pal** - chọn đích danh con mình thích (${palWheelCfg().customPrice.toLocaleString()} Dogcoin, không pal raid), pal vào 🎒 RƯƠNG rồi chọn linh hồn/passive nhận vào game.`,
            ephemeral: true,
        });
    }
    if (interaction.customId === 'shop_custom_CU_DA_TAT') {
        const price = PAL_SHOP.customPrice;
        const balance = getUserData(userId).points || 0;

        if (balance < price) {
            return interaction.reply({
                content: `❌ Không đủ Dogcoin! Cần **${price.toLocaleString()}**, bạn có **${balance.toLocaleString()}** ${DOGCOIN_EMOJI}`,
                ephemeral: true,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('shop_modal_custom')
            .setTitle(`Chọn pal - ${price.toLocaleString()}`);

        // Chọn pal bằng ô nhập chứ không dùng menu: Discord chỉ cho 25 lựa chọn mỗi
        // menu, mà danh sách có gần 300 pal.
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('shop_pal')
                    .setLabel('Tên pal (vd: Anubis, Jetragon)')
                    .setPlaceholder('Gõ tên tiếng Anh của pal')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('shop_souls')
                    .setLabel(`${PAL_SHOP.soulSlots} dòng linh hồn ${PAL_SHOP.soulPercent}%`)
                    .setPlaceholder('vd: Tấn công')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('shop_passives')
                    .setLabel(`${PAL_SHOP.passiveSlots} passive (không nhận Cây Thế Giới)`)
                    .setPlaceholder('vd: Huyền Thoại, Quỷ Thần, Ma Cà Rồng, Thân Thể Kim Cương')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );

        await interaction.showModal(modal);
        return;
    }

    // ======== SHOP PAL: NGẪU NHIÊN (1000) - quay TRƯỚC, chọn passive/linh hồn SAU ========
    // Trừ tiền + quay ngay khi bấm. Người chơi thấy trúng con gì rồi mới bấm nút
    // "Chọn passive & linh hồn" để điền (shop_fill_<id> bên dưới).
    if (interaction.customId === 'shop_random') {
        // 25/08: quay pal đã DỜI LÊN WEB (vòng quay kiểu CSGO + rương ở trang Hồ sơ).
        // Giữ nút để chỉ đường, không trừ tiền ở đây nữa.
        return interaction.reply({
            content: `🎁 Quay pal đã chuyển lên **web**: ${WEB_PLAY_URL}\nVào tab **🎁 Quay Pal** - trúng thì pal nằm trong **RƯƠNG** ở trang 👤 Hồ sơ: bán lại lấy Dogcoin hoặc chọn linh hồn/passive rồi nhận vào game.`,
            ephemeral: true,
        });
    }
    if (interaction.customId === 'shop_random_CU_DA_TAT') {
        const price = PAL_SHOP.randomPrice;
        const balance = getUserData(userId).points || 0;

        if (balance < price) {
            return interaction.reply({
                content: `❌ Không đủ Dogcoin! Cần **${price.toLocaleString()}**, bạn có **${balance.toLocaleString()}** ${DOGCOIN_EMOJI}`,
                ephemeral: true,
            });
        }
        const pool = gachaPool();
        if (pool.length === 0) {
            return interaction.reply({ content: '❌ Danh sách pal chưa nạp được, báo admin.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const pal = pool[Math.floor(Math.random() * pool.length)];
        updatePoints(userId, -price);
        const order = {
            id: dbCache._palOrderSeq = (dbCache._palOrderSeq || 0) + 1,
            userId,
            username: interaction.user.tag,
            kind: 'random',
            price,
            palName: pal.name,
            palCode: pal.code,
            souls: '',
            passives: '',
            status: 'pending',
            time: new Date().toLocaleString('vi-VN'),
        };

        const sent = await sendPalOrderToAdmin(order);
        if (!sent) {
            updatePoints(userId, price); // hoàn tiền vì admin không nhận được đơn
            logDog('refund', userId, interaction.user.tag, price, `hoàn đơn pal #${order.id} (không gửi được cho admin)`);
            return interaction.editReply(
                '❌ Không gửi được đơn cho admin (admin chặn tin nhắn riêng?). ' +
                `Đã **hoàn lại ${price.toLocaleString()}** ${DOGCOIN_EMOJI} cho bạn.`
            );
        }

        if (!Array.isArray(dbCache._palOrders)) dbCache._palOrders = [];
        dbCache._palOrders.unshift(order);
        if (dbCache._palOrders.length > 200) dbCache._palOrders.length = 200;

        logDog('shop', userId, interaction.user.tag, -price, `mua pal ${pal.name} (ngẫu nhiên) - đơn #${order.id}`);
        writeLog('ADMIN', `[SHOP PAL] #${order.id} ${order.username} quay trung ${order.palName} (random, ${price} Dogcoin) - cho chon passive/linh hon`);

        // 🏆 HŨ RIÊNG của quay Pal: nuôi 5% giá vé, nổ theo CHUNG tỉ lệ 1% với 2 minigame
        potFeed('gacha', luckyPotCut('gacha', price));
        withdrawBoardRefresh();   // tiêu đề bảng có số hũ -> vẽ lại cho tươi
        let palPotWin = 0;
        if (potGet('gacha') > 0 && Math.random() < POT_HIT_RATE) {
            palPotWin = luckyPotPop('gacha');
            updatePoints(userId, palPotWin);
            logDog('hu', userId, interaction.user.tag, palPotWin, 'nổ hũ quay Pal 🏆');
            writeLog('ADMIN', `[⚠️ NỔ HŨ GACHA] ${interaction.user.tag} quay pal trúng hũ +${palPotWin.toLocaleString()} Dogcoin`);
        }

        // Đăng công khai kết quả quay cho cả server thấy (không chặn luồng trả lời)
        const gachaCh = dbCache._gachaChannelId;
        if (palPotWin > 0) {
            potAnnounce(gachaCh, `💥🏆 <@${userId}> quay Pal mà NỔ LUÔN HŨ QUAY PAL: +**${palPotWin.toLocaleString()}** ${DOGCOIN_EMOJI}! Hũ đặt lại về ${potSeed('gacha').toLocaleString()}, mỗi lượt quay lại nuôi tiếp 🌱`, userId);
        }
        if (gachaCh) {
            client.channels.fetch(gachaCh)
                .then(ch => ch && ch.send({
                    content: `🎲 <@${userId}> vừa chi **${price.toLocaleString()}** ${DOGCOIN_EMOJI} quay Pal ngẫu nhiên và trúng **${pal.name}** 👑${pal.dex ? ` (paldex #${pal.dex})` : ''}!`,
                    allowedMentions: { users: [userId] },
                }))
                .catch(e => writeLog('SYSTEM', `[SHOP PAL] Khong dang duoc thong bao quay random vao kenh ${gachaCh}: ${e.message}`));
        }

        return interaction.editReply({
            content:
                `🎲 Bạn trúng: **${pal.name}** 👑\n` +
                `• Bản Boss, ${PAL_SHOP.stars} sao, IV ${PAL_SHOP.ivs} cả 3 chỉ số\n` +
                `Đã trừ **${price.toLocaleString()}** ${DOGCOIN_EMOJI} (còn **${getUserData(userId).points.toLocaleString()}**) - mã đơn **#${order.id}**.\n` +
                (palPotWin > 0
                    ? `💥🏆 **VÀ BẠN NỔ HŨ CHUNG: +${palPotWin.toLocaleString()}** ${DOGCOIN_EMOJI}!\n\n`
                    : `🏆 Hũ quay Pal đang nuôi: **${potGet('gacha').toLocaleString()}** ${DOGCOIN_EMOJI} (mỗi lượt quay ${POT_HIT_RATE * 100}% cơ hội nổ)\n\n`) +
                `👇 Bấm nút để chọn **${PAL_SHOP.passiveSlots} passive + ${PAL_SHOP.soulSlots} dòng linh hồn ${PAL_SHOP.soulPercent}%** cho nó.`,
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`shop_fill_${order.id}`).setLabel('Chọn passive & linh hồn').setEmoji('📝').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`shop_sell_${order.id}`).setLabel(`Bán lại ${PAL_SHOP.randomSellBack.toLocaleString()}`).setEmoji('💰').setStyle(ButtonStyle.Secondary)
            )],
        });
    }

    // ======== SHOP PAL: BÁN LẠI pal random không ưng - đóng đơn luôn, hoàn tiền ========
    // Chỉ bán được khi CHƯA chọn passive/linh hồn (chọn rồi coi như admin đã bắt tay làm).
    if (interaction.customId.startsWith('shop_sell_')) {
        const oid = parseInt(interaction.customId.slice('shop_sell_'.length));
        const order = (dbCache._palOrders || []).find((o) => o.id === oid);
        if (!order) return interaction.reply({ content: '❌ Không tìm thấy đơn này.', ephemeral: true });
        if (order.userId !== userId) return interaction.reply({ content: '❌ Đơn này không phải của bạn.', ephemeral: true });
        if (order.status === 'done') {
            return interaction.reply({
                content: order.resold ? `💰 Đơn #${oid} đã bán lại rồi.` : `✅ Đơn #${oid} admin đã giao rồi - không bán lại được nữa.`,
                ephemeral: true,
            });
        }
        if (order.souls || order.passives) {
            return interaction.reply({ content: `❌ Đơn #${oid} đã chốt passive/linh hồn, admin đang làm - không bán lại được nữa.`, ephemeral: true });
        }

        const refund = PAL_SHOP.randomSellBack;
        order.status = 'done';
        order.resold = true;
        order.doneAt = new Date().toLocaleString('vi-VN');
        updatePoints(userId, refund);
        saveDbNow(); // tiền + trạng thái đơn đổi cùng lúc - lưu ngay kẻo mất
        logDog('refund', userId, interaction.user.tag, refund, `bán lại pal ${order.palName} - đơn #${oid}`);
        writeLog('ADMIN', `[SHOP PAL] #${oid} ${order.username} BAN LAI ${order.palName} - hoan ${refund} Dogcoin, dong don`);

        // Báo admin khỏi làm đơn này nữa. DM hỏng không sao - panel đã đánh dấu bán lại.
        (async () => {
            try {
                const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
                await admin.send(`💰 **BÁN LẠI** đơn pal #${oid} - **${order.palName}** của \`${order.username}\` - KHÔNG cần giao nữa (bot đã hoàn ${refund.toLocaleString()} Dogcoin).`);
            } catch (e) {
                writeLog('ADMIN', `[SHOP PAL] Khong DM duoc tin ban lai don #${oid}: ${e.message} - xem tren panel`);
            }
        })();

        return interaction.update({
            content:
                `💰 Đã bán lại **${order.palName}** (đơn #${oid}) giá **${refund.toLocaleString()}** ${DOGCOIN_EMOJI}.\n` +
                `Ví hiện có **${getUserData(userId).points.toLocaleString()}** ${DOGCOIN_EMOJI}. Quay tiếp thì bấm lại nút 🎲 ở kênh shop nhé!`,
            components: [],
        });
    }

    // ======== SHOP PAL: điền passive/linh hồn cho đơn random đã quay ========
    if (interaction.customId.startsWith('shop_fill_')) {
        const oid = parseInt(interaction.customId.slice('shop_fill_'.length));
        const order = (dbCache._palOrders || []).find((o) => o.id === oid);
        if (!order) return interaction.reply({ content: '❌ Không tìm thấy đơn này.', ephemeral: true });
        if (order.userId !== userId) return interaction.reply({ content: '❌ Đơn này không phải của bạn.', ephemeral: true });
        if (order.resold) return interaction.reply({ content: `💰 Đơn #${oid} đã bán lại rồi - không chọn được nữa.`, ephemeral: true });
        if (order.souls || order.passives) return interaction.reply({ content: `✅ Đơn #${oid} đã chọn rồi: linh hồn **${order.souls}** | passive **${order.passives}**`, ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`shop_fill_modal_${oid}`)
            .setTitle(`${order.palName} - đơn #${oid}`.slice(0, 45));
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('shop_souls')
                    .setLabel(`${PAL_SHOP.soulSlots} dòng linh hồn ${PAL_SHOP.soulPercent}%`)
                    .setPlaceholder('vd: Tấn công')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('shop_passives')
                    .setLabel(`${PAL_SHOP.passiveSlots} passive (không nhận Cây Thế Giới)`)
                    .setPlaceholder('vd: Huyền Thoại, Quỷ Thần, Ma Cà Rồng, Thân Thể Kim Cương')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
        return;
    }

    // ======== NÚT BIG SMALL ========
    if (interaction.customId.startsWith('tx_c_')) {
        const choice = interaction.customId.split('_')[2];
        userTXSelections[userId] = { choice };

        txState.activeChoice = choice;
        txState.needsUpdate = true; // vòng lặp 1s tự vẽ lại - không await edit kẻo trễ 3s

        return interaction.reply({ content: `✅ Đã chọn **${TX_CHOICES[choice].name}**. Nhấn nút số Dogcoin ở dưới để chốt!`, ephemeral: true });
    }

    if (interaction.customId === 'tx_soicau') {
        if (txState.history.length === 0) return interaction.reply({ content: "Chưa có lịch sử ván nào!", ephemeral: true });
        
        let hisDesc = txState.history.slice(0, 10).map(h => {
            return `Game ${padId(h.gameId)}: ${DICE_EMOJIS[h.dice[0]]} ${DICE_EMOJIS[h.dice[1]]} ${DICE_EMOJIS[h.dice[2]]} (${h.sum}) - ${h.tx} | ${h.cl}`;
        }).join('\n');

        const emb = new EmbedBuilder()
            .setTitle('🔮 Soi Cầu - Lịch sử 10 ván gần nhất')
            .setDescription(hisDesc)
            .setFooter({ text: 'Cờ bạc có thể gây nghiện - Chơi có trách nhiệm' })
            .setColor(0x2b2d31);
        
        return interaction.reply({ embeds: [emb], ephemeral: true });
    }

    if (interaction.customId === 'tx_a_custom') {
        const sel = userTXSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Bạn phải bấm chọn cửa trước!", ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId('tx_modal_custom')
            .setTitle('Nhập Số Dogcoin Đặt');

        const amountInput = new TextInputBuilder()
            .setCustomId('tx_input_amount')
            .setLabel('Ví dụ: 15000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
        return;
    }

    // (Nặn xí ngầu đã chuyển lên web - kéo tờ giấy trong webplay.js, không còn nút Discord.)

    if (interaction.customId.startsWith('tx_a_') && interaction.customId !== 'tx_a_custom') {
        if (txState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
        const sel = userTXSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Chọn cửa trước!", ephemeral: true });

        let amt = interaction.customId === 'tx_a_all' ? getUserData(userId).points : parseInt(interaction.customId.split('_')[2]);
        // 💰 ALL-IN thì tự kẹp về phần trần còn lại của ván (đỡ bực); mức cố định vượt trần thì báo
        if (interaction.customId === 'tx_a_all' && txMaxBet() > 0) amt = Math.min(amt, Math.max(0, txMaxBet() - txBetTotalOf(userId)));
        if (amt <= 0 || getUserData(userId).points < amt) return interaction.reply({ content: "❌ Bạn không đủ Dogcoin để đặt mức này (hoặc đã chạm trần cược ván này)!", ephemeral: true });
        const txCapErr2 = txCapCheck(userId, amt);
        if (txCapErr2) return interaction.reply({ content: '❌ ' + txCapErr2, ephemeral: true });

        updatePoints(userId, -amt);
        txState.bets.push({ userId, username: interaction.user.username, choice: sel.choice, amount: amt });

        userTXSelections[userId] = null;
        txState.activeChoice = null;
        txState.needsUpdate = true; // reply ngay, vòng lặp 1s vẽ lại bảng

        return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()}** ${DOGCOIN_EMOJI} vào **${TX_CHOICES[sel.choice].name}**!`, ephemeral: true });
    }
  } catch (e) {
    if (e.code !== 10062) writeLog('SYSTEM', `[LỖI INTERACTION] ${e.message}`);
  }
});

// Dọn memory userSelections mỗi 10 phút (tránh leak)
setInterval(() => {
    userTXSelections = {};
}, 10 * 60 * 1000);

client.on('error', (e) => writeLog('SYSTEM', `[DISCORD ERROR] ${e.message}`));
client.on('warn', (msg) => writeLog('SYSTEM', `[DISCORD WARN] ${msg}`));
client.on('shardError', (e) => writeLog('SYSTEM', `[SHARD ERROR] ${e.message}`));

process.on('unhandledRejection', (reason, promise) => {
    writeLog('SYSTEM', `[CRASH] Unhandled Rejection at: ${promise}, reason: ${reason}`);
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    writeLog('SYSTEM', `[CRASH] Uncaught Exception: ${err.message || err}`);
    console.error('Uncaught Exception:', err);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    writeLog('SYSTEM', `[CRASH] Uncaught Exception Monitor: ${err.message || err}, origin: ${origin}`);
    console.error('Uncaught Exception Monitor:', err, origin);
});

// Lưu database NGAY khi bot bị tắt/restart (PM2 restart, max_memory_restart, stop...)
// để không mất 20 kết quả cuối khi process bị kill giữa 2 lần lưu định kỳ.
let isShuttingDown = false;
function flushAndExit(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    try {
        syncCache();
        writeDbAtomicSync();
        writeLog('SYSTEM', `[SHUTDOWN] ${signal} - đã lưu database trước khi thoát`);
    } catch (e) {
        console.error('[SHUTDOWN] Lỗi lưu database:', e.message);
    }
    process.exit(0);
}
process.on('SIGINT', () => flushAndExit('SIGINT'));
process.on('SIGTERM', () => flushAndExit('SIGTERM'));

client.login(TOKEN);        
    