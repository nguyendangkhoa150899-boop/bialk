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
const { createTable: createBlackjackTable } = require('./blackjackTable');

// Link hiển thị cho người chơi vào web cược (đổi trong .env nếu khác)
const WEB_PLAY_URL = process.env.WEB_PLAY_URL || 'http://103.72.98.37:3002';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const TOKEN = process.env.TOKEN;
const DATA_FILE = './database.json';
const STARTING_DOGCOIN = 20;
const DAILY_DOGCOIN = 400;
const HOURLY_DOGCOIN = 100; // /nghien — điểm danh con nghiện, 1 tiếng/lần
const NGHIEN_COOLDOWN_MS = 60 * 60 * 1000;
const DAILY_MONTH_BONUS = 5000; // điểm danh đủ MỌI ngày trong tháng nhận thêm cục này
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

// Gom các mảng đang giữ ở RAM vào dbCache trước khi ghi ra file.
function syncCache() {
    dbCache._minesHistory = minesHistory;
    dbCache._txDashHistory = txDashHistory;
    dbCache._bcDashHistory = bcDashHistory;
    dbCache._withdrawRequests = withdrawRequests;
    dbCache._withdrawSeq = withdrawSeq;
    // Xổ số: cược đang treo là TIỀN THẬT đã trừ ví -> bắt buộc giữ qua restart
    dbCache._xsBets = xsState.bets;
    dbCache._xsRound = xsState.round;
    dbCache._xsForced = xsState.forced;
    dbCache._xsHistory = xsState.history;
    dbCache._xsResultMsgIds = xsState.resultMsgIds;
}

// Ghi thẳng xuống file ngay (dùng cho thao tác quan trọng như xóa ví, không đợi 10s).
function saveDbNow() {
    syncCache();
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(dbCache, null, 2));
    } catch (err) {
        writeLog('SYSTEM', `[LỖI DATABASE] Không thể lưu file database: ${err.message}`);
    }
}

setInterval(() => {
    syncCache();
    fs.writeFile(DATA_FILE, JSON.stringify(dbCache, null, 2), (err) => {
        if (err) writeLog('SYSTEM', `[LỖI DATABASE] Không thể lưu file database: ${err.message}`);
    });
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
// chuyển vào/ra game, mua pal). CỐ TÌNH không ghi tiền cược thắng/thua của mini game —
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

    // Nuôi bảng THỐNG KÊ 📊 — mọi biến động "hệ thống" đều đi qua logDog nên móc 1 chỗ
    if (type === 'admin+' || type === 'admin-') statAdd(userId, 'adminIn', amount);
    else if (type === 'transfer') statAdd(userId, amount < 0 ? 'sentOut' : 'recvIn', Math.abs(amount));
    else if (type === 'to-game') statAdd(userId, 'toGame', Math.abs(amount));
    else if (type === 'from-game') statAdd(userId, 'fromGame', amount);
}

// ===== THỐNG KÊ TÍCH LŨY THEO NGƯỜI CHƠI (bảng 📊 trên Discord) =====
// Đếm TỪ LÚC TÍNH NĂNG BẬT: sổ cái chỉ giữ 500 dòng gần nhất nên không dựng lại
// được lịch sử cũ trung thực — thà bắt đầu từ 0 còn hơn số nửa đúng nửa sai.
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
    statsBoard.needsUpdate = true;   // bảng đăng lại trong vòng 1 phút (repostBoard)
}

// ===== CHUYỂN DOGCOIN GIỮA NGƯỜI CHƠI — nút 🧧 Lộc lá trên web =====
// Cùng luật với lệnh /chuyentien trong Discord, thêm 2 lớp bảo vệ vì web dễ spam hơn:
//  - chỉ chuyển cho người ĐÃ CÓ VÍ (từng chơi / được liên kết) — dán nhầm ID lạ là
//    tiền bay vào ví ma không ai nhận, nên chặn từ đầu;
//  - mỗi người 10 giây mới được chuyển 1 lần — kênh thông báo không bị dội bom.
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
    if (Date.now() - last < 10000) return { error: 'Từ từ — 10 giây mới được chuyển 1 lần' };
    const me = getUserData(fromId);
    if ((me.points || 0) < amount) return { error: 'Không đủ Dogcoin!' };

    transferLastAt.set(fromId, Date.now());
    const fromName = me.name || fromId;
    const toName = getUserData(toId).name || toId;
    updatePoints(fromId, -amount);
    updatePoints(toId, amount);
    logDog('transfer', fromId, fromName, -amount, `chuyển cho ${toName} (web)`);
    logDog('transfer', toId, toName, amount, `nhận từ ${fromName} (web)`);
    writeLog('ADMIN', `[CHUYỂN TIỀN][WEB] ${fromName} → ${toName} | ${amount.toLocaleString()} Dogcoin`);

    // Thông báo Discord — giữ nguyên khuôn của /chuyentien
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

// Danh sách người nhận cho ô tìm trên web: ai có ví là hiện (id + tên đã liên kết).
// KHÔNG kèm số dư — không để cả sòng soi ví nhau.
function listTransferTargets() {
    const out = [];
    for (const [k, v] of Object.entries(dbCache)) {
        if (k.startsWith('_') || !/^\d{15,20}$/.test(k)) continue;
        if (!v || typeof v !== 'object') continue;
        out.push({ id: k, name: NAME_OVERRIDE[k] || v.name || '' });
    }
    return out;
}

// ===== 📅 ĐIỂM DANH THÁNG + 💉 NGHIỆN — logic DÙNG CHUNG Discord & web =====
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
function dailyState(userId) {
    const u = dailyBookOf(getUserData(userId));
    const { y, m, d } = vnParts();
    const daysInMonth = new Date(y, m, 0).getDate();
    // chuỗi = số ngày liên tiếp tính đến hôm nay (chưa điểm danh hôm nay thì tính đến hôm qua)
    const set = new Set(u.dailyDays);
    let streak = 0;
    for (let cur = set.has(d) ? d : d - 1; cur >= 1 && set.has(cur); cur--) streak++;
    return {
        year: y, month: m, today: d, daysInMonth,
        days: u.dailyDays.slice().sort((a, b) => a - b),
        checkedToday: set.has(d),
        streak,
        amount: DAILY_DOGCOIN,
        monthBonus: DAILY_MONTH_BONUS,
        nghien: { amount: HOURLY_DOGCOIN, nextAt: (u.lastNghien || 0) + NGHIEN_COOLDOWN_MS, now: Date.now() },
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
    u.dailyDays.push(d);
    u.lastDaily = Date.now();
    updatePoints(userId, DAILY_DOGCOIN);
    // đủ mọi ngày trong tháng -> thưởng thêm cục bonus (mỗi tháng 1 lần là tự nhiên
    // vì mỗi ngày chỉ điểm danh được 1 lần, đủ tháng đúng vào ngày cuối)
    const daysInMonth = new Date(y, m, 0).getDate();
    let bonus = 0;
    if (u.dailyDays.length >= daysInMonth) {
        bonus = DAILY_MONTH_BONUS;
        updatePoints(userId, bonus);
    }
    saveDbNow();
    writeLog('ADMIN', `[ĐIỂM DANH] ${u.name || userId} nhận ${DAILY_DOGCOIN.toLocaleString()}${bonus ? ` + BONUS đủ tháng ${bonus.toLocaleString()}` : ''} Dogcoin | Số dư: ${(u.points || 0).toLocaleString()}`);
    return { ok: true, amount: DAILY_DOGCOIN, bonus, state: dailyState(userId), balance: u.points || 0 };
}
function claimNghien(userId) {
    const u = getUserData(userId);
    const passed = Date.now() - (u.lastNghien || 0);
    if (passed < NGHIEN_COOLDOWN_MS) {
        const msLeft = NGHIEN_COOLDOWN_MS - passed;
        return { error: `Nghiện vừa thôi! Còn ${Math.ceil(msLeft / 60000)} phút nữa mới lụm tiếp được.`, msLeft };
    }
    updatePoints(userId, HOURLY_DOGCOIN);
    u.lastNghien = Date.now();
    writeLog('ADMIN', `[NGHIỆN] ${u.name || userId} nhận ${HOURLY_DOGCOIN.toLocaleString()} Dogcoin | Số dư: ${(u.points || 0).toLocaleString()}`);
    // Đăng công khai vào kênh nghiện — lỗi kênh không được chặn việc nhận tiền
    client.channels.fetch(NGHIEN_ANNOUNCE_CHANNEL_ID)
        .then(ch => ch.send({ content: `💉 **${u.name || userId}** vừa lụm **${HOURLY_DOGCOIN.toLocaleString()}** ${DOGCOIN_EMOJI} nghiện — gõ \`/nghien\` hoặc vào web lụm theo!`, allowedMentions: { parse: [] } }))
        .catch(() => {});
    return { ok: true, amount: HOURLY_DOGCOIN, nextAt: u.lastNghien + NGHIEN_COOLDOWN_MS, now: Date.now(), balance: u.points || 0 };
}

// ===== PHÁT DOGCOIN TOÀN SERVER (gọi từ dashboard) =====
// Cộng `amount` cho MỌI ví đang tồn tại rồi đăng thông báo tag role vào kênh thông báo.
// Chỉ cộng ví đã có (ai từng chơi); người mới vào sau vẫn nhận STARTING_DOGCOIN như thường.
async function addAllPlayersAndAnnounce(amount, onlyIds = null) {
    // Khóa _ là dữ liệu nội bộ (lịch sử, đơn rút...), không phải ví người chơi.
    // onlyIds: panel truyền danh sách còn hạn mức trần/ngày (null = phát tất cả).
    const allow = onlyIds ? new Set(onlyIds) : null;
    const userIds = Object.keys(dbCache).filter(k => !k.startsWith('_') && (!allow || allow.has(k)));
    userIds.forEach(id => updatePoints(id, amount));
    saveDbNow();
    writeLog('ADMIN', `[CỘNG TIỀN ALL] Dashboard cộng ${amount.toLocaleString()} Dogcoin cho ${userIds.length} người chơi`);

    // Kênh + role đặt ở panel (tab 👥, lưu database) — đổi Discord server không phải
    // sửa code. Chưa đặt thì rơi về ID hardcode của server cũ.
    const announceChannelId = dbCache._giveawayChannelId || GIVEAWAY_ANNOUNCE_CHANNEL_ID;
    const pingRoleId = dbCache._giveawayRoleId || GIVEAWAY_PING_ROLE_ID;
    let announced = false;
    try {
        const ch = await client.channels.fetch(announceChannelId);
        if (ch) {
            await ch.send({
                content: `<@&${pingRoleId}> 🎁 Tặng cho mấy con nghiện **${amount.toLocaleString()}** ${DOGCOIN_EMOJI}!\n(Đã cộng vào ví của **${userIds.length}** người chơi — gõ \`/sodu\` mà xem)`,
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
    randomPrice: 2000,   // random pal — quay TRƯỚC, biết trúng con gì rồi mới chọn passive/linh hồn
    adminDiscordId: '456136500011335698',
    // Chỉ số mặc định cho mọi pal mua ở shop
    stars: 4,
    ivs: 100,
    soulPercent: 60,
    soulSlots: 1,        // số dòng linh hồn người chơi được chọn (cả 2 loại đều 1 dòng)
    passiveSlots: 4,
};

// Passive Cây Thế Giới KHÔNG bán kèm pal shop — muốn thì mua cấy ghép ở sạp trong game.
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
    // __dirname chứ không phải './' — pm2 có thể chạy tiến trình từ thư mục khác.
    PAL_DATA = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'pals.json'), 'utf8'));
} catch (e) {
    console.error('Khong doc duoc pals.json (shop pal se khong hoat dong):', e.message);
}

// Danh sách được phép MUA (nút 3000): bỏ pal raid.
// Nút random (1000) thì lấy toàn bộ, kể cả raid — theo yêu cầu, coi như phần thưởng may mắn.
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

// (Shop vật phẩm + đổi vàng đã bỏ khỏi Discord — bán ở sạp trong game.)

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

const WITHDRAW_MAX_PER_REQUEST = 20000; // trần mỗi lần chuyển vào game, chặn thiệt hại nếu có lỗi
// Chiều game -> Discord KHÔNG giới hạn: admin cầm đồ thật trong tay rồi mới duyệt,
// không có đường lợi dụng.

// Hiển thị số ván dạng 5 chữ số: 1 -> #00001
const padId = (n) => String(n).padStart(5, '0');

// --- CONFIG BẦU CUA ---
const MASCOTS = [
    { id: 'hu', name: 'Hổ', emoji: '🐯' }, { id: 'cua', name: 'Cua', emoji: '🦀' },
    { id: 'tom', name: 'Tôm', emoji: '🦞' }, { id: 'ca', name: 'Cá', emoji: '🐟' },
    { id: 'ga', name: 'Gà', emoji: '🐓' }, { id: 'nai', name: 'Nai', emoji: '🦌' }
];
let bcState = {
    // 'stopped' chứ KHÔNG phải 'betting': Bầu Cua đang tắt (không chạy vòng lặp mở bát).
    // Nếu để 'betting' thì bảng cũ còn sót trong Discord vẫn nhận cược, trừ tiền thật rồi
    // không bao giờ trả — tiền bốc hơi im lặng. startBaucua() sẽ tự đặt lại 'betting'
    // khi admin bật bàn, nên không ảnh hưởng lúc mở lại game.
    status: 'stopped',
    timeLeft: 60,
    targetTime: 0,
    bets: [],
    message: null,
    channel: null,
    gameId: Math.floor(Math.random() * 9999),
    needsUpdate: false,
    activeMascot: null,
    isProcessing: false,
    processingStart: 0,
    lastGameInfo: null,
    history: [],
    msgHistory: [],
    resultPromise: null
};
let userBCSelections = {};

// --- CONFIG TÀI XỈU ---
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
    // bets: { userId: { name, de: {'27': 500}, lo: {'27': 300} } } — tiền đã trừ ví
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
let bcDashHistory = Array.isArray(dbCache._bcDashHistory) ? dbCache._bcDashHistory : [];

// Yêu cầu rút Dogcoin (người chơi bấm nút -> chờ admin duyệt trên dashboard).
// Trừ Dogcoin NGAY khi tạo yêu cầu (khoá số dư lại, tránh vừa xin rút vừa đem đi cược tiếp).
// "approve" = admin đã đưa Dog Coin thật trong game, chỉ đánh dấu xong (không trừ thêm).
// "reject" = hoàn lại Dogcoin đã trừ.
let withdrawRequests = Array.isArray(dbCache._withdrawRequests) ? dbCache._withdrawRequests : [];
let withdrawSeq = dbCache._withdrawSeq || 1;

// Kênh riêng để người chơi bấm nút xin rút Dogcoin (giống cơ chế kênh Bầu Cua/Tài Xỉu,
// nhưng chỉ 1 tin nhắn tĩnh, không có vòng lặp đếm giờ).
let withdrawState = { channel: null, message: null };

// Tài Xỉu & Bầu Cua: MỖI LẦN KHỞI ĐỘNG BOT đếm lại từ #0001 và làm mới SOI CẦU (RAM).
// (Trước đây gameId random mỗi lần restart -> soi cầu loạn số. Giờ reset gọn gàng.)
// Lưu ý: chỉ reset soi cầu Discord (txState/bcState.history), KHÔNG đụng lịch sử dashboard.
bcState.gameId = 0;
txState.gameId = 0;
bcState.history = [];
txState.history = [];

const DICE_EMOJIS = [
    '',
    '<:1410537564418605146:1493488539642499153>',
    '<:1410537562589626368:1493488535934861523>',
    '<:1410537554276777994:1493488533468610692>',
    '<:1410537560580685866:1493488531274989628>',
    '<:1410537558823403675:1493488529219522560>',
    '<:1410537557069926470:1493488527013318657>'
];

// ===== NẶN XÍ NGẦU TRÊN WEB (Tài Xỉu) =====
// Ván TX_ROUND_S (50) giây = 35 giây đặt cược + TX_LOCK_S (15) giây nặn. Lúc khóa sổ
// xí ngầu lắc NGẦM (txState.nan), người chơi lên web tự "nặn" — kéo tờ giấy che
// tự do 4 chiều, kéo tới đâu lộ tới đó, ai kéo người đó thấy riêng. Đúng giờ mở bát:
// trả thưởng + đăng kết quả công khai ở Discord.
const TX_LOCK_S = 15;
const TX_ROUND_S = 50;
// BÃO = 3 viên giống nhau: chỉ cửa Bão ăn (×TX_BAO_RATE), mọi cửa thường thua sạch.
const TX_BAO_RATE = 30;
// txState.nan = { gameId, dice: [d1,d2,d3] } — chỉ tồn tại trong cửa sổ nặn

const TX_CHOICES = {
    'tai': { name: 'TÀI' },
    'xiu': { name: 'XỈU' },
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
// 24 ô + RTP 1.0 — giữ nguyên như bản dò mìn chạy trong Discord trước đây,
// người chơi đã quen bảng hệ số này (từng đổi sang 25 ô/RTP 0.95 rồi trả lại).
//
// ⚠️ RTP 1.0 = nhà cái KHÔNG ăn đồng nào: dài hạn dò mìn không hút được chút
// Dogcoin nào ra khỏi server, chỉ làm tổng cung dao động. Muốn nó thành chỗ
// tiêu tiền thì hạ xuống 0.97 (ăn 3%) hoặc 0.95 (ăn 5%, mức sòng thật hay dùng).
const TOTAL_TILES = 24;
const RTP = 1.0;

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
    // Cắt xuống 2 số lẻ — đúng như bản Discord cũ, để hệ số khớp cái người chơi đã quen.
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
// client chỉ vẽ lại những gì server trả về. Không bao giờ tin số client gửi lên —
// nếu để client tự tính thưởng thì sửa JS là tự cộng tiền.
const webMines = new Map(); // userId -> { mines, revealed[], totalMines, bet, name }

// Ván VỪA XONG của mỗi người, giữ lại để màn kết thúc (lộ hết mìn) không biến mất:
// người chơi xem bao lâu tùy thích, thoát ra vào lại vẫn thấy, tới khi bấm "VÁN MỚI".
const webMinesLast = new Map();
function setMinesLast(userId, g, result, amount, hitIdx) {
    webMinesLast.set(userId, {
        result, amount, bet: g.bet, totalMines: g.totalMines,
        revealed: g.revealed.slice(), mines: g.mines.slice(),
        hit: (hitIdx === undefined ? -1 : hitIdx),
        multi: calculateMulti(g.revealed.length, g.totalMines),
        // lộ ô 🍀 chưa mở + các ô mìn khiên đã đỡ, để màn kết thúc vẽ lại đúng
        lucky: (g.luckySpun || g.luckyPending) ? -1 : (g.lucky !== undefined ? g.lucky : -1),
        defused: (g.defused || []).slice(),
    });
}

// ⚠️ HAI CÁI TRẦN NÀY ĐANG TẮT (= 0) theo yêu cầu chủ server: hệ số y hệt sòng thật,
// không cắt gì. Đặt số > 0 là bật lại ngay, không cần sửa chỗ nào khác.
//
// Rủi ro đã biết khi để 0 — nếu thấy Dogcoin lạm phát thì đây là chỗ siết đầu tiên:
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
            writeLog('SYSTEM', `[WEB DÒ MÌN] Hoàn ${g.bet} cho ${g.name || uid} — ván treo quá 2 tiếng`);
        }
    }
}
setInterval(webMinesRefundStale, 10 * 60 * 1000);

function webMinesLog(g, result, amount, hitIdx) {
    const entry = {
        name: g.name, bet: g.bet, mines: g.totalMines, diamonds: g.revealed.length,
        result, amount, time: new Date().toLocaleTimeString('vi-VN'),
        // Số dư SAU KHI đã trả thưởng (mọi chỗ gọi hàm này đều updatePoints trước) —
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
    // Trần đang tắt nên một ván có thể trả rất lớn — hú còi để admin biết ngay.
    if (amount >= MINES_BIG_WIN_ALERT) {
        writeLog('ADMIN', `[⚠️ DÒ MÌN TRẢ LỚN] ${g.name} +${amount.toLocaleString()} Dogcoin ` +
            `(cược ${g.bet.toLocaleString()}, ${g.totalMines} mìn, mở ${g.revealed.length} ô, ` +
            `hệ số x${calculateMulti(g.revealed.length, g.totalMines)})`);
    }
}

// ===== Ô MAY MẮN 🍀 (dùng chung Dò Mìn + Leo Thang) =====
// Chạm ô 🍀 -> quay ngẫu nhiên 1 phần thưởng. Ô 🍀 GIẤU (không hiện trên bàn):
// hiện là lộ ô an toàn, ai cũng bấm nó đầu tiên thành vòng quay miễn phí mỗi ván.
// Ô "hụt" 🍂 CỐ TÌNH có: nó là van chỉnh kỳ vọng — sòng chảy máu thì tăng % hụt.
// 'jackpot' = 🏆 NỔ HŨ: ăn min(giải cao nhất của ván, x2000 cược).
// Tỉ lệ 10% THEO VOTE CỦA NGƯỜI CHƠI (game vui vẻ) — các giải còn lại giảm đều.
// ⚠️ CẢNH BÁO KINH TẾ: 10% × trần x2000 nghĩa là mỗi lượt mở hộp cõng kỳ vọng
// tới ~x200 tiền cược ở ván mìn nhiều/lửa cao. Ví cả server SẼ phình nhanh.
// Muốn hãm lại chỉ cần hạ số 0.10 bên dưới (và nâng 'none' lên tương ứng).
// Cân theo chủ server chốt: hũ 5% · hụt 30% · lì xì 30%; 35% còn lại chia
// khiên 20% / đào-tên lửa 15% (quà đẩy tiến độ nặng kinh tế hơn nên hiếm hơn khiên).
const MINES_LUCKY_WHEEL = [
    { p: 0.20, prize: 'shield' },   // 🛡️ trúng mìn 1 lần không chết
    { p: 0.15, prize: 'dig' },      // ⛏️ mở ngay 1–2 ô an toàn ngẫu nhiên
    { p: 0.30, prize: 'cash' },     // 💰 +10% tiền cược tức thì
    { p: 0.30, prize: 'none' },     // 🍂 hụt
    { p: 0.05, prize: 'jackpot' },  // 🏆 NỔ HŨ
];
const STAIRS_LUCKY_WHEEL = [
    { p: 0.15, prize: 'rocket' },   // 🚀 thang máy: +2 tầng ngay
    { p: 0.20, prize: 'shield' },   // 🛡️ đạp lửa 1 lần không cháy
    { p: 0.30, prize: 'cash' },     // 💰 +10% tiền cược tức thì
    { p: 0.30, prize: 'none' },     // 🍂 hụt
    { p: 0.05, prize: 'jackpot' },  // 🏆 NỔ HŨ
];
// Ô VÀNG 🌟 Leo Thang: 2% ván MỚI xuất hiện, HIỆN RÕ trên bàn ở tầng 5–8 — thấy mà
// thèm, phải sống sót leo tới mới đạp được; đạp là lên thẳng đỉnh. Mọi mức lửa đều
// có thể ra ô vàng: ván lửa cao không sập sòng nhờ TRẦN x2000 bên dưới.
const STAIRS_GOLDEN_RATE = 0.02;

// TRẦN THƯỞNG x2000 tiền cược — CHỈ áp cho ván ĂN NHỜ ô may mắn (🚀/🌟/⛏️ hoặc
// khiên ĐÃ dùng để thoát chết). Tự lực 100% thì trả đủ như bảng — cày thật ăn thật.
// Lý do: một cú nhảy 🌟 trong ván 5 lửa ăn nguyên x17k là bơm lạm phát cả server.
const LUCKY_WIN_CAP_MULTI = 2000;
function luckyAssisted(g) {
    return (g.luck || []).some(x => x === '🚀' || x === '🌟' || x === '⛏️')
        || (g.defused || []).length > 0 || (g.burned || []).length > 0;
}
function capIfAssisted(g, win) {
    return luckyAssisted(g) ? Math.min(win, g.bet * LUCKY_WIN_CAP_MULTI) : win;
}

function spinWheel(wheel) {
    let r = Math.random();
    for (const w of wheel) { r -= w.p; if (r < 0) return w.prize; }
    return wheel[wheel.length - 1].prize;
}

const webMinesApi = {
    tiles: TOTAL_TILES,
    maxWin: MINES_MAX_WIN,
    maxBet: MINES_MAX_BET,
    // Bảng hệ số để client hiện trước khi đặt — tính ở server nên client không bịa được.
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
            shield: !!g.shield,                    // 🛡️ đang cầm khiên
            defused: (g.defused || []).slice(),    // các ô mìn đã bị khiên đỡ (hiện 🛡️)
            luckyPick: !!g.luckyPending,           // đang chờ chọn 1 trong 4 hộp 🍀
            // KHÔNG lộ g.lucky — ô may mắn phải giấu, lộ là lộ luôn ô an toàn
        };
    },
    // 3–20 mìn: chặn ván 1–2 mìn gần như không rủi ro (khiên thành bất tử) và ván
    // 21+ mìn toàn cầu may. minMines/maxMines đẩy xuống client để đồng bộ 1 nguồn.
    minMines: 3,
    maxMines: 20,
    start: (userId, name, numMines, bet) => {
        if (webMines.has(userId)) return { error: 'Bạn đang có ván dở — chơi nốt hoặc bấm DỪNG đã.' };
        if (!Number.isInteger(numMines) || numMines < webMinesApi.minMines || numMines > webMinesApi.maxMines) {
            return { error: `Số mìn phải từ ${webMinesApi.minMines} đến ${webMinesApi.maxMines}` };
        }
        if (!Number.isInteger(bet) || bet <= 0) return { error: 'Số Dogcoin không hợp lệ' };
        if (MINES_MAX_BET > 0 && bet > MINES_MAX_BET) return { error: `Cược tối đa ${MINES_MAX_BET.toLocaleString()} Dogcoin mỗi ván` };
        const me = getUserData(userId);
        if ((me.points || 0) < bet) return { error: `Không đủ Dogcoin! Số dư: ${(me.points || 0).toLocaleString()}` };

        // Tạo ván TRƯỚC rồi mới trừ tiền: createGame lỗi thì người chơi không mất gì.
        const g = createGame(numMines, userId);
        g.bet = bet; g.name = name; g.startedAt = Date.now();
        g.userId = userId;   // để lúc ghi lịch sử tra được số dư còn lại
        // 1 ô 🍀 giấu trên một ô AN TOÀN ngẫu nhiên; mở trúng thì hiện 4 hộp cho chọn.
        // Ép số khi so với mìn: layout ép từ panel có thể chứa chuỗi ("5" thay vì 5),
        // so lệch kiểu là ô 🍀 rơi trúng ô mìn ngay.
        const mineSet = new Set(g.mines.map(Number));
        const safes = [];
        for (let i = 0; i < TOTAL_TILES; i++) if (!mineSet.has(i)) safes.push(i);
        g.lucky = safes[Math.floor(Math.random() * safes.length)];
        g.shield = false; g.defused = []; g.luck = []; g.luckyPending = false;
        webMines.set(userId, g);
        webMinesLast.delete(userId); // vào ván mới thì bỏ màn kết thúc cũ
        updatePoints(userId, -bet);
        writeLog('BET', `[WEB DÒ MÌN] ${name} cược ${bet} | ${numMines} mìn`);
        return { ok: true, balance: getUserData(userId).points || 0, state: webMinesApi.current(userId) };
    },
    reveal: (userId, idx) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!Number.isInteger(idx) || idx < 0 || idx >= TOTAL_TILES) return { error: 'Ô không hợp lệ' };
        if (g.revealed.includes(idx)) return { error: 'Ô này mở rồi' };

        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        if ((g.defused || []).includes(idx)) return { error: 'Ô này khiên đỡ rồi — chọn ô khác' };

        if (g.mines.includes(idx)) {
            // 🛡️ Có khiên: quả mìn XỊT, hiện ra trên bàn, ĐỨNG YÊN chơi tiếp.
            // Không tính là ô an toàn (không nhảy hệ số) — khiên cứu mạng, không in tiền.
            if (g.shield) {
                g.shield = false;
                g.defused.push(idx);
                writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🛡️ khiên đỡ mìn ô ${idx} — chơi tiếp`);
                return { ok: true, hit: false, defused: idx, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
            }
            webMines.delete(userId);
            webMinesLog(g, 'Trúng mìn (Thua)', -g.bet, idx);
            setMinesLast(userId, g, 'Trúng mìn (Thua)', -g.bet, idx);
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} BÙM ở ô ${idx} — mất ${g.bet}`);
            // Tiền đã trừ từ lúc bắt đầu, thua thì không trừ thêm lần nữa.
            // luckyAt: lộ ô 🍀 chưa kịp mở cho người chơi tiếc chơi ván nữa
            return { ok: true, hit: true, mines: g.mines, luckyAt: (g.luckySpun ? -1 : g.lucky), balance: getUserData(userId).points || 0 };
        }

        g.revealed.push(idx);

        // 🍀 Mở trúng CỎ 4 LÁ (vẫn tính 1 ô an toàn như thường) -> DỪNG lại, hiện 4 hộp
        // cho người chơi tự chọn. Phần thưởng quyết định lúc CHỌN (luckyPick) ở server —
        // 4 hộp là sân khấu, không có gì cho client gian lận.
        if (idx === g.lucky && !g.luckySpun) {
            g.luckyPending = true;
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🍀 mở trúng cỏ 4 lá — đang chọn hộp`);
            return { ok: true, hit: false, luckyPick: true, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
        }

        const lucky = null;
        const maxDiamonds = TOTAL_TILES - g.totalMines;
        if (g.revealed.length >= maxDiamonds) {
            const raw = minesWin(g.bet, maxDiamonds, g.totalMines);
            const win = capIfAssisted(g, raw);   // ăn nhờ 🍀 -> trần x2000; tự lực -> đủ
            webMines.delete(userId);
            updatePoints(userId, win);
            webMinesLog(g, 'Jackpot', win - g.bet);
            setMinesLast(userId, g, 'Jackpot', win - g.bet);
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} JACKPOT — nhận ${win}${win < raw ? ` (trần x${LUCKY_WIN_CAP_MULTI} vì có trợ giúp 🍀)` : ''}`);
            return { ok: true, hit: false, jackpot: true, win, luckCapped: win < raw, mines: g.mines, lucky, balance: getUserData(userId).points || 0 };
        }
        return { ok: true, hit: false, lucky, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
    },
    // Chọn 1 trong 4 hộp sau khi mở trúng cỏ 4 lá. box chỉ là sân khấu — phần thưởng
    // quay ngẫu nhiên tại đây, người chơi chọn hộp nào cũng cùng phân phối.
    luckyPick: (userId, box) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!g.luckyPending) return { error: 'Không có cỏ 4 lá nào đang chờ' };
        g.luckyPending = false; g.luckySpun = true;
        box = Math.min(4, Math.max(1, box || 1));
        const prize = spinWheel(MINES_LUCKY_WHEEL);
        // Lật cả 4 hộp: hộp đã chọn = quà thật, 3 hộp kia là hàng mẫu (quà thật đã chốt
        // ở dòng trên). 🏆 CHỈ ĐƯỢC HIỆN Ở ĐÚNG 1 VỊ TRÍ — hàng mẫu không bao giờ ra hũ,
        // kẻo lật ra 2-3 cái hũ ảo nhìn loạn.
        const decoy = () => { let d; do { d = spinWheel(MINES_LUCKY_WHEEL); } while (d === 'jackpot'); return d; };
        const reveal = [];
        for (let i = 1; i <= 4; i++) reveal.push(i === box ? prize : decoy());
        const lucky = { prize, box, reveal };
        if (prize === 'shield') { g.shield = true; g.luck.push('🛡️'); }
        else if (prize === 'dig') {
            // mở giúp 1–2 ô an toàn ngẫu nhiên (server chọn — cho tự chọn là quá tay)
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
            const bonus = Math.max(1, Math.floor(g.bet * 0.1));
            updatePoints(userId, bonus);
            lucky.bonus = bonus;
            g.luck.push('💰');
        }
        else if (prize === 'jackpot') {
            // 🏆 NỔ HŨ = GIẢI CAO NHẤT của chính cấu hình ván này, trần x2000 cược.
            // Chọn 1 mìn rồi ngồi câu hũ vẫn chỉ ăn giải bé của ván 1 mìn — hết cửa farm.
            const top = minesWin(g.bet, TOTAL_TILES - g.totalMines, g.totalMines);
            const jp = Math.min(g.bet * LUCKY_WIN_CAP_MULTI, top);
            updatePoints(userId, jp);
            statAdd(userId, 'jpCount', 1); statAdd(userId, 'jpTotal', jp);   // bảng 📊
            lucky.bonus = jp;
            g.luck.push('🏆');
            writeLog('ADMIN', `[⚠️ NỔ HŨ DÒ MÌN] ${g.name} trúng hộp 🏆 +${jp.toLocaleString()} Dogcoin (cược ${g.bet.toLocaleString()}, ${g.totalMines} mìn)`);
        }
        else g.luck.push('🍂');
        writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} 🍀 chọn hộp ${box} — trúng ${prize}`);

        // ⛏️ có thể vừa mở đủ ô an toàn -> chốt jackpot ván luôn
        const maxDiamonds = TOTAL_TILES - g.totalMines;
        if (g.revealed.length >= maxDiamonds) {
            const raw = minesWin(g.bet, maxDiamonds, g.totalMines);
            const win = capIfAssisted(g, raw);
            webMines.delete(userId);
            updatePoints(userId, win);
            webMinesLog(g, 'Jackpot', win - g.bet);
            setMinesLast(userId, g, 'Jackpot', win - g.bet);
            writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} JACKPOT (⛏️ hộp may mắn) — nhận ${win}`);
            return { ok: true, lucky, jackpot: true, win, luckCapped: win < raw, mines: g.mines, balance: getUserData(userId).points || 0 };
        }
        return { ok: true, lucky, state: webMinesApi.current(userId), balance: getUserData(userId).points || 0 };
    },
    cashout: (userId) => {
        const g = webMines.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        // (đánh dấu để bảng Discord vẽ lại — xem minesBoard bên dưới)
        if (!g.revealed.length) return { error: 'Mở ít nhất 1 ô rồi mới dừng được' };
        const raw = minesWin(g.bet, g.revealed.length, g.totalMines);
        const win = capIfAssisted(g, raw);
        webMines.delete(userId);
        updatePoints(userId, win);
        webMinesLog(g, 'Dừng (Thắng)', win - g.bet);
        setMinesLast(userId, g, 'Dừng (Thắng)', win - g.bet);
        writeLog('RESULT', `[WEB DÒ MÌN] ${g.name} DỪNG ở ${g.revealed.length} ô — nhận ${win}${win < raw ? ` (trần x${LUCKY_WIN_CAP_MULTI})` : ''}`);
        return { ok: true, win, luckCapped: win < raw, mines: g.mines, luckyAt: (g.luckySpun ? -1 : g.lucky), balance: getUserData(userId).points || 0 };
    },
};

// ==========================================
// --- LEO THANG (Fury Stairs) ---
// ==========================================
// Leo 10 tầng, mỗi tầng 8 ô, người chơi chọn trước mỗi tầng có mấy quả cầu lửa (1–5).
// Mỗi tầng bấm 1 ô: trúng ô trống thì lên tầng trên và hệ số nhân thêm, trúng lửa là
// mất tiền cược. Dừng lúc nào cũng được. Toàn bộ bẫy sinh sẵn lúc bắt đầu ván nên
// server không thể "đổi ý" giữa chừng, và tiền tính hết ở đây — web chỉ vẽ lại.
const STAIRS_FLOORS = 10;
const STAIRS_COLS = 8;
const STAIRS_RTP = 0.95;    // nhà cái ăn 5%, cùng mức các sòng thật hay dùng
const STAIRS_MAX_FIRE = 5;  // nhiều lửa nhất mỗi tầng (phải nhỏ hơn số ô)

const webStairs = new Map(); // userId -> { bet, fire, floor, traps[][], name, startedAt }

// Ván vừa xong: giữ để màn kết thúc (lộ hết cầu lửa) không tự biến mất.
const webStairsLast = new Map();
function setStairsLast(userId, g, result, amount, hitFloor, hitCol) {
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

function stairsMulti(cleared, fire) {
    if (cleared <= 0) return 1;
    const m = STAIRS_RTP * Math.pow(STAIRS_COLS / (STAIRS_COLS - fire), cleared);
    return Math.floor(m * 100) / 100;
}

function stairsWin(bet, cleared, fire) {
    return Math.floor(bet * stairsMulti(cleared, fire));
}

function stairsLog(g, result, amount) {
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
            writeLog('SYSTEM', `[LEO THANG] Hoàn ${g.bet} cho ${g.name || uid} — ván treo quá 2 tiếng`);
        }
    }
}
setInterval(stairsRefundStale, 10 * 60 * 1000);

const webStairsApi = {
    floors: STAIRS_FLOORS,
    cols: STAIRS_COLS,
    maxFire: STAIRS_MAX_FIRE,
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
            safe: g.safe.slice(0, g.floor), // ô đã bấm đúng ở các tầng đã qua (-1 = tầng nhảy qua)
            shield: !!g.shield,                     // 🛡️ đang cầm khiên
            burned: (g.burned || []).slice(),       // ô lửa đã bị khiên đỡ (lộ 🔥, cấm bấm lại)
            golden: g.golden ? { floor: g.golden.f, col: g.golden.c } : null, // 🌟 HIỆN RÕ
            luckyPick: !!g.luckyPending,            // đang chờ chọn 1 trong 4 hộp 🍀
            // KHÔNG lộ g.lucky — ô 🍀 phải giấu
        };
    },
    start: (userId, name, fire, bet) => {
        if (webStairs.has(userId)) return { error: 'Bạn đang có ván dở — leo tiếp hoặc bấm DỪNG đã.' };
        if (!Number.isInteger(fire) || fire < 1 || fire > STAIRS_MAX_FIRE) {
            return { error: `Số cầu lửa phải từ 1 đến ${STAIRS_MAX_FIRE}` };
        }
        if (!Number.isInteger(bet) || bet <= 0) return { error: 'Số Dogcoin không hợp lệ' };
        const me = getUserData(userId);
        if ((me.points || 0) < bet) return { error: `Không đủ Dogcoin! Số dư: ${(me.points || 0).toLocaleString()}` };

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
        // 3 ô 🍀 GIẤU trên ô trống tầng 1–8 (không rải tầng 9–10: sát đỉnh còn quà là quá tay)
        g.lucky = []; g.shield = false; g.burned = []; g.luck = []; g.luckyPending = false;
        while (g.lucky.length < 3) {
            const f = Math.floor(Math.random() * 8);
            const c = Math.floor(Math.random() * STAIRS_COLS);
            if (traps[f].includes(c)) continue;
            if (g.lucky.some(l => l.f === f && l.c === c)) continue;
            g.lucky.push({ f, c });
        }
        // 🌟 Ô VÀNG (2% ván, mọi mức lửa — ăn nhờ nó đã có trần x2000): tầng 5–8
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
        updatePoints(userId, -bet);
        writeLog('BET', `[LEO THANG] ${name} cược ${bet} | ${fire} lửa/tầng`);
        return { ok: true, balance: getUserData(userId).points || 0, state: webStairsApi.current(userId) };
    },
    step: (userId, col) => {
        const g = webStairs.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!Number.isInteger(col) || col < 0 || col >= STAIRS_COLS) return { error: 'Ô không hợp lệ' };

        if (g.luckyPending) return { error: 'Chọn 1 trong 4 hộp cỏ 4 lá đã!' };
        if ((g.burned || []).some(b => b.f === g.floor && b.c === col)) {
            return { error: 'Ô này lộ lửa rồi — chọn ô khác' };
        }

        const row = g.traps[g.floor];
        if (row.includes(col)) {
            // 🛡️ Có khiên: lửa XỊT, ô lửa LỘ RA, ĐỨNG YÊN tầng này chọn ô khác.
            // Không leo lên — leo lên là khiên thành vé qua tầng miễn phí, quá mạnh.
            if (g.shield) {
                g.shield = false;
                g.burned.push({ f: g.floor, c: col });
                writeLog('RESULT', `[LEO THANG] ${g.name} 🛡️ khiên đỡ lửa tầng ${g.floor + 1} — đứng lại chọn ô khác`);
                return { ok: true, burn: false, shielded: true, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
            }
            const hitFloor = g.floor;
            webStairs.delete(userId);
            const entry = stairsLog(g, 'Trúng lửa (Thua)', -g.bet);
            setStairsLast(userId, g, 'Trúng lửa (Thua)', -g.bet, hitFloor, col);
            writeLog('RESULT', `[LEO THANG] ${g.name} CHÁY ở tầng ${hitFloor + 1} — mất ${g.bet}`);
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
            writeLog('RESULT', `[LEO THANG] ${g.name} 🌟 ĐẠP Ô VÀNG — bay thẳng lên đỉnh!`);
        }
        // 🍀 đạp trúng CỎ 4 LÁ (ô trống bình thường, vẫn lên tầng) -> DỪNG, hiện 4 hộp
        else if (g.lucky.some(l => l.f === curFloor && l.c === col)) {
            g.lucky = g.lucky.filter(l => !(l.f === curFloor && l.c === col)); // mỗi ô 1 lần
            g.luckyPending = true;
            writeLog('RESULT', `[LEO THANG] ${g.name} 🍀 đạp cỏ 4 lá tầng ${curFloor + 1} — đang chọn hộp`);
            return { ok: true, burn: false, luckyPick: true, state: webStairsApi.current(userId), balance: getUserData(userId).points || 0 };
        }

        if (g.floor >= STAIRS_FLOORS) {
            const raw = stairsWin(g.bet, STAIRS_FLOORS, g.fire);
            const win = capIfAssisted(g, raw);   // ăn nhờ 🚀/🌟/khiên -> trần x2000; tự lực -> đủ x17k
            webStairs.delete(userId);
            updatePoints(userId, win);
            const entry = stairsLog(g, 'Lên đỉnh', win - g.bet);
            setStairsLast(userId, g, 'Lên đỉnh', win - g.bet);
            writeLog('RESULT', `[LEO THANG] ${g.name} LÊN ĐỈNH — nhận ${win}${win < raw ? ` (trần x${LUCKY_WIN_CAP_MULTI} vì có trợ giúp 🍀)` : ''}`);
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
    // Chọn hộp 🍀 bên Leo Thang — 🚀 có thể đẩy lên đỉnh, chốt thưởng luôn tại đây
    luckyPick: (userId, box) => {
        const g = webStairs.get(userId);
        if (!g) return { error: 'Chưa có ván nào đang chơi' };
        if (!g.luckyPending) return { error: 'Không có cỏ 4 lá nào đang chờ' };
        g.luckyPending = false;
        box = Math.min(4, Math.max(1, box || 1));
        const prize = spinWheel(STAIRS_LUCKY_WHEEL);
        // Lật cả 4 hộp — 🏆 chỉ hiện ở đúng 1 vị trí (xem chú thích bên Dò Mìn)
        const decoy = () => { let d; do { d = spinWheel(STAIRS_LUCKY_WHEEL); } while (d === 'jackpot'); return d; };
        const reveal = [];
        for (let i = 1; i <= 4; i++) reveal.push(i === box ? prize : decoy());
        const lucky = { prize, box, reveal };
        if (prize === 'rocket') {
            let up = 2;
            while (up-- > 0 && g.floor < STAIRS_FLOORS) { g.safe.push(-1); g.floor++; }
            g.luck.push('🚀');
        }
        else if (prize === 'shield') { g.shield = true; g.luck.push('🛡️'); }
        else if (prize === 'cash') {
            const bonus = Math.max(1, Math.floor(g.bet * 0.1));
            updatePoints(userId, bonus);
            lucky.bonus = bonus;
            g.luck.push('💰');
        }
        else if (prize === 'jackpot') {
            // 🏆 NỔ HŨ = giải LÊN ĐỈNH của chính mức lửa ván này, trần x2000 cược.
            // Chơi 1 lửa câu hũ chỉ ăn x3.61 — muốn hũ to phải dám chơi lửa cao.
            const top = stairsWin(g.bet, STAIRS_FLOORS, g.fire);
            const jp = Math.min(g.bet * LUCKY_WIN_CAP_MULTI, top);
            updatePoints(userId, jp);
            statAdd(userId, 'jpCount', 1); statAdd(userId, 'jpTotal', jp);   // bảng 📊
            lucky.bonus = jp;
            g.luck.push('🏆');
            writeLog('ADMIN', `[⚠️ NỔ HŨ LEO THANG] ${g.name} trúng hộp 🏆 +${jp.toLocaleString()} Dogcoin (cược ${g.bet.toLocaleString()}, ${g.fire} lửa)`);
        }
        else g.luck.push('🍂');
        writeLog('RESULT', `[LEO THANG] ${g.name} 🍀 chọn hộp ${box} — trúng ${prize}`);

        // 🚀 có thể vừa đẩy lên đỉnh
        if (g.floor >= STAIRS_FLOORS) {
            const raw = stairsWin(g.bet, STAIRS_FLOORS, g.fire);
            const win = capIfAssisted(g, raw);
            webStairs.delete(userId);
            updatePoints(userId, win);
            const entry = stairsLog(g, 'Lên đỉnh', win - g.bet);
            setStairsLast(userId, g, 'Lên đỉnh', win - g.bet);
            writeLog('RESULT', `[LEO THANG] ${g.name} LÊN ĐỈNH (🚀 hộp may mắn) — nhận ${win}${win < raw ? ` (trần x${LUCKY_WIN_CAP_MULTI})` : ''}`);
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
        if (!g.floor) return { error: 'Leo ít nhất 1 tầng rồi mới dừng được' };
        const raw = stairsWin(g.bet, g.floor, g.fire);
        const win = capIfAssisted(g, raw);
        webStairs.delete(userId);
        updatePoints(userId, win);
        const entry = stairsLog(g, 'Dừng (Thắng)', win - g.bet);
        setStairsLast(userId, g, 'Dừng (Thắng)', win - g.bet);
        writeLog('RESULT', `[LEO THANG] ${g.name} DỪNG ở tầng ${g.floor} — nhận ${win}${win < raw ? ` (trần x${LUCKY_WIN_CAP_MULTI})` : ''}`);
        stairsBoardPush(entry, { hitFloor: -1, hitCol: -1, traps: g.traps, safe: g.safe.slice() });
        // Lộ 🍀/🌟 chưa đạp cả khi DỪNG — đồng bộ với lúc cháy/lên đỉnh (và với Dò Mìn,
        // vốn đã lộ luckyAt khi dừng). Trước đây thiếu 2 field này nên dừng thì không
        // thấy, F5 lại thấy (setStairsLast vẫn lưu) — hành xử tự đá nhau.
        return {
            ok: true, win, luckCapped: win < raw, traps: g.traps, safe: g.safe.slice(),
            luckyCells: g.lucky, goldPos: g.golden ? { f: g.golden.f, c: g.golden.c } : null,
            balance: getUserData(userId).points || 0,
        };
    },
};

// ===== BLACKJACK — bàn chung (logic ở blackjack.js/blackjackTable.js) =====
// Tiền dùng ví thật (getUserData/updatePoints). webplay.js lo WebSocket + trang riêng.
const blackjackTable = createBlackjackTable({
    clock: () => Date.now(),
    getPoints: (u) => (getUserData(u).points || 0),
    // Mọi dòng tiền blackjack (trừ cược, trả thưởng, hoàn) đều qua đây -> cộng dồn
    // là ra net cho bảng 📊, không phải đục vào engine.
    addPoints: (u, a) => { updatePoints(u, a); statAdd(u, 'bj', a); },
    announce: (m) => writeLog('SYSTEM', `[BLACKJACK] ${m}`),
    log: (cat, msg) => writeLog(cat, msg),
    SEATS: 5, BET_WINDOW_MS: 7000, TURN_MS: 15000, RESULT_MS: 6000,
    MIN_BET: 1, MAX_BET: 0,
});

// ===== BẢNG MỜI CHƠI BLACKJACK TRÊN DISCORD (để lấy link) =====
const blackjackBoard = { channel: null, message: null, lastEdit: 0 };
function getBlackjackBoardData() {
    const v = blackjackTable.view('_');
    const nSeated = (v.seats || []).filter(s => !s.empty).length;
    const phaseTxt = v.phase === 'playing' ? '🟢 đang chơi' : v.phase === 'betting' ? '🟢 đang đặt cược' : v.phase === 'result' ? 'đang trả thưởng' : 'bàn trống';
    const desc =
        `Xì Dách 5 ghế · **ăn 1.5 (3:2)** · nhà cái dừng ở mọi 17 · 2 bộ bài.\n` +
        `Có **Rút / Dừng / Nhân đôi / Tách** (tách được nhiều tay). Chơi trên web, xoay ngang cho dễ.\n\n` +
        `👥 Đang ngồi: **${nSeated}/5** · ${phaseTxt}`;
    const embed = new EmbedBuilder()
        .setTitle('🂡 BLACKJACK — chơi trên web')
        .setColor(0x2e8b57)
        .setDescription(desc)
        .setFooter({ text: 'Bấm nút bên dưới để lấy link + mã PIN' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_link').setLabel('🂡 Chơi Blackjack trên web').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row] };
}
async function startBlackjackBoard(channel) {
    if (blackjackBoard.message) await blackjackBoard.message.delete().catch(() => { });
    blackjackBoard.channel = channel;
    blackjackBoard.message = await channel.send(getBlackjackBoardData());
    blackjackBoard.lastEdit = Date.now();
    dbCache._bjChannelId = channel.id;
    dbCache._bjMsgId = blackjackBoard.message.id;
    saveDbNow();
}
function stopBlackjackBoard() {
    if (blackjackBoard.message) blackjackBoard.message.delete().catch(() => { });
    blackjackBoard.channel = null; blackjackBoard.message = null;
    dbCache._bjChannelId = null; dbCache._bjMsgId = null;
    saveDbNow();
}
async function resumeBlackjackBoard() {
    const chId = dbCache._bjChannelId;
    if (!chId) return;
    const ch = await client.channels.fetch(chId);
    const old = dbCache._bjMsgId ? await ch.messages.fetch(dbCache._bjMsgId).catch(() => null) : null;
    if (old) { blackjackBoard.channel = ch; blackjackBoard.message = old; blackjackBoard.lastEdit = Date.now(); await old.edit(getBlackjackBoardData()).catch(() => { }); return; }
    await startBlackjackBoard(ch);
}
function runBlackjackBoardLoop() {
    // cập nhật nhẹ mỗi 15s (số người ngồi / trạng thái), không dính rate limit
    setInterval(() => {
        if (!blackjackBoard.message) return;
        if (Date.now() - blackjackBoard.lastEdit < 15000) return;
        blackjackBoard.lastEdit = Date.now();
        blackjackBoard.message.edit(getBlackjackBoardData()).catch(e => writeLog('SYSTEM', `[BẢNG BLACKJACK] ${e.message}`));
    }, 5000);
}

// ===== BẢNG DÒ MÌN TRÊN DISCORD =====
// Khác Tài Xỉu: dò mìn không có ván chung theo giờ, mỗi người chơi ván riêng trên web.
// Nên bảng này chỉ là chỗ mời chơi + khoe 10 ván gần nhất, KHÔNG có nút đặt cược.
// Có ván mới thì XOÁ tin cũ + ĐĂNG lại (tối đa 1 lần/phút) — xem repostBoard.
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
        `Mỗi ô an toàn hệ số tăng thêm — **dừng lúc nào cũng được**, trúng mìn là mất tiền cược ván đó.\n\n` +
        `🎯 Càng nhiều mìn, hệ số càng cao. Kéo thanh bên dưới lưới để xem trước ăn bao nhiêu.\n\n`;

    if (recent.length) {
        desc += `**💣 ${recent.length} ván gần đây:**\n` + recent.map(minesHistoryLine).join('\n');
    } else {
        desc += `*Chưa có ai chơi ván nào. Mở hàng đi!*`;
    }

    const embed = new EmbedBuilder()
        .setTitle('💣 DÒ MÌN — chơi trên web')
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

// Bot restart thì nối lại bảng cũ thay vì đăng bảng mới — đỡ rác kênh và người chơi
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
// có ván mới thì xoá tin cũ + đăng lại, tối đa 1 phút/lần — xem repostBoard.
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
        `Mỗi tầng bấm 1 ô: trúng ô trống thì lên tầng trên, hệ số nhân thêm — **dừng lúc nào cũng được**.\n` +
        `Trúng cầu lửa 🔥 là mất tiền cược ván đó.\n\n` +
        `🔥 Càng nhiều lửa mỗi tầng, hệ số càng cao (1 lửa lên đỉnh x3.61 · 5 lửa lên đỉnh x17k).\n` +
        `🍀 Có ô may mắn giấu trong tháp + 🌟 ô vàng hiếm lên thẳng đỉnh. Ăn NHỜ may mắn trần x2.000 — tự lực thì ăn đủ.\n\n`;
    if (recent.length) {
        desc += `**🪜 ${recent.length} ván gần đây:**\n` + recent.map(stairsHistoryLine).join('\n');
    } else {
        desc += `*Chưa có ai leo. Mở hàng đi!*`;
    }

    const embed = new EmbedBuilder()
        .setTitle('🪜 LEO THANG — chơi trên web')
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

// Có ván mới thì XOÁ tin cũ + ĐĂNG tin mới (không sửa tại chỗ) — bảng luôn nằm cuối
// kênh như một thông báo mới, người chơi khỏi cuộn lên tìm. Tối đa 1 lần/phút, mọi
// ván trong phút đó gom chung một lần đăng. GỬI TRƯỚC, XOÁ SAU: lỡ gửi lỗi thì bảng
// cũ còn đó, kênh không bao giờ trống bảng.
const BOARD_REPOST_MS = 60 * 1000;
async function repostBoard(board, getData, msgKey, label) {
    if (!board.channel || !board.needsUpdate) return;
    if (Date.now() - board.lastEdit < BOARD_REPOST_MS) return;
    board.needsUpdate = false;
    board.lastEdit = Date.now();
    const old = board.message;
    try {
        board.message = await board.channel.send(getData());
        dbCache[msgKey] = board.message.id;   // để restart nối lại đúng tin mới nhất
        if (old) old.delete().catch(() => { });
    } catch (e) {
        writeLog('SYSTEM', `[${label}] Không đăng lại được bảng: ${e.message}`);
        board.needsUpdate = true; // giữ cờ, phút sau thử lại
    }
}

function runStairsBoardLoop() {
    setInterval(() => { repostBoard(stairsBoard, getStairsBoardData, '_stairsMsgId', 'BẢNG LEO THANG').catch(() => { }); }, 5000);
}

// ===== BẢNG THỐNG KÊ 📊 NGƯỜI CHƠI TRÊN DISCORD =====
// Kênh riêng admin tự đặt ở panel. Có thay đổi thì xoá tin cũ + đăng lại, tối đa
// 1 phút/lần (repostBoard). Màu: khối ```diff — dòng "+" Discord tô XANH, "-" tô ĐỎ.
const statsBoard = { channel: null, message: null, needsUpdate: false, lastEdit: 0 };

function getStatsBoardData() {
    const st = dbCache._pstats || {};
    const rows = Object.entries(st).map(([id, s]) => {
        // Chỉ tính DÒNG TIỀN — thắng/thua mini game + nổ hũ đã BỎ khỏi bảng theo
        // yêu cầu chủ server (dữ liệu vẫn đếm ngầm trong _pstats, muốn là bật lại).
        const act = Math.abs(s.adminIn) + s.sentOut + s.recvIn + s.toGame + Math.abs(s.fromGame);
        const name = NAME_OVERRIDE[id] || (dbCache[id] && dbCache[id].name) || ('…' + id.slice(-4));
        const bal = (dbCache[id] && dbCache[id].points) || 0;   // số dư ví hiện tại
        return { id, s, act, name, bal };
    }).filter(r => r.act > 0).sort((a, b) => b.act - a.act);

    const fmt = n => (n || 0).toLocaleString('vi-VN');
    // Dòng tiền trong khối ```diff: "+" Discord tô XANH = tiền VÀO ví,
    // "-" tô ĐỎ = tiền RA khỏi ví, 0 thì để trắng cho đỡ rối.
    const ml = (sign, label, v) => {
        const n = Math.abs(v || 0);
        return n ? `${sign} ${label.padEnd(17)}: ${fmt(n)}` : `  ${label.padEnd(17)}: 0`;
    };

    let desc = '';
    const shown = rows.slice(0, 12);   // embed tối đa 4096 ký tự — 12 người sôi nổi nhất
    for (const r of shown) {
        desc += `👤 **${r.name}** · ví **${fmt(r.bal)}** ${DOGCOIN_EMOJI}\n` + '```diff\n' +
            ml(r.s.adminIn >= 0 ? '+' : '-', 'Admin cho', r.s.adminIn) + '\n' +
            ml('+', 'Nhận từ bạn bè', r.s.recvIn) + '\n' +
            ml('+', 'Game ➜ Discord', r.s.fromGame) + '\n' +
            ml('-', 'Chuyển cho bạn bè', r.s.sentOut) + '\n' +
            ml('-', 'Discord ➜ game', r.s.toGame) + '\n' +
            '```\n';
    }
    if (!desc) desc = '*Chưa có dữ liệu — thống kê đếm từ lúc bật tính năng, chuyển tiền vài lần là có số.*';
    if (rows.length > shown.length) desc += `\n*…và ${rows.length - shown.length} người nữa (chỉ hiện 12 người sôi nổi nhất).*`;

    const embed = new EmbedBuilder()
        .setTitle('📊 THỐNG KÊ NGƯỜI CHƠI')
        .setColor(0x00aeef)
        .setDescription(desc.slice(0, 4000))
        .setFooter({ text: 'Xanh = tiền vào ví · Đỏ = tiền ra khỏi ví · cập nhật tối đa 1 phút/lần' })
        .setTimestamp();
    return { embeds: [embed] };
}

async function startStatsBoard(channel) {
    if (statsBoard.message) await statsBoard.message.delete().catch(() => { });
    statsBoard.channel = channel;
    statsBoard.message = await channel.send(getStatsBoardData());
    statsBoard.needsUpdate = false;
    statsBoard.lastEdit = Date.now();
    dbCache._statsChannelId = channel.id;
    dbCache._statsMsgId = statsBoard.message.id;
    saveDbNow();
}

function stopStatsBoard() {
    if (statsBoard.message) statsBoard.message.delete().catch(() => { });
    statsBoard.channel = null;
    statsBoard.message = null;
    dbCache._statsChannelId = null;
    dbCache._statsMsgId = null;
    saveDbNow();
}

async function resumeStatsBoard() {
    const chId = dbCache._statsChannelId;
    if (!chId) return;
    const ch = await client.channels.fetch(chId);
    const old = dbCache._statsMsgId ? await ch.messages.fetch(dbCache._statsMsgId).catch(() => null) : null;
    if (old) {
        statsBoard.channel = ch;
        statsBoard.message = old;
        statsBoard.lastEdit = Date.now();
        await old.edit(getStatsBoardData()).catch(() => { });
        writeLog('SYSTEM', `[BẢNG THỐNG KÊ] Nối lại bảng cũ ở #${ch.name}`);
        return;
    }
    await startStatsBoard(ch);
}

function runStatsBoardLoop() {
    setInterval(() => { repostBoard(statsBoard, getStatsBoardData, '_statsMsgId', 'BẢNG THỐNG KÊ').catch(() => { }); }, 5000);
}

// Bù tay dữ liệu NỔ HŨ cũ (trúng trước khi bảng thống kê ra đời) — CỘNG THÊM vào
// thống kê, KHÔNG đụng ví. Tra số tiền hũ cũ trong log: grep "NỔ HŨ" pm2 log.
function addJackpotStat(userId, count, total) {
    userId = String(userId || '').trim();
    count = Math.floor(Number(count) || 0);
    total = Math.floor(Number(total) || 0);
    if (!/^\d{15,20}$/.test(userId)) return { error: 'Discord ID không hợp lệ' };
    if (!dbCache[userId] || typeof dbCache[userId] !== 'object') return { error: 'Người này chưa có ví' };
    if (count < 0 || total < 0 || (!count && !total)) return { error: 'Nhập số lần hoặc số tiền (≥ 0, không cùng 0)' };
    if (count) statAdd(userId, 'jpCount', count);
    if (total) statAdd(userId, 'jpTotal', total);
    saveDbNow();
    const name = NAME_OVERRIDE[userId] || (dbCache[userId].name || userId);
    writeLog('ADMIN', `[THỐNG KÊ] Bù nổ hũ cho ${name}: +${count} lần · +${total.toLocaleString()} Dogcoin`);
    return { ok: true, name };
}

// Reset từng loại (admin bấm ở panel): key = 1 trong 9 cột, hoặc 'all' = xoá sạch
function resetStats(key) {
    const KEYS = ['adminIn', 'sentOut', 'recvIn', 'toGame', 'fromGame', 'tx', 'mines', 'stairs', 'bj'];
    if (key === 'all') dbCache._pstats = {};
    else if (key === 'jackpot') {   // nổ hũ gồm 2 cột (số lần + tổng tiền) — reset chung
        for (const id of Object.keys(dbCache._pstats || {})) { dbCache._pstats[id].jpCount = 0; dbCache._pstats[id].jpTotal = 0; }
    }
    else if (KEYS.includes(key)) {
        for (const id of Object.keys(dbCache._pstats || {})) dbCache._pstats[id][key] = 0;
    }
    else return { error: 'Loại thống kê không hợp lệ' };
    statsBoard.needsUpdate = true;
    saveDbNow();
    writeLog('ADMIN', `[THỐNG KÊ] Reset "${key}"`);
    return { ok: true };
}

function runMinesBoardLoop() {
    setInterval(() => { repostBoard(minesBoard, getMinesBoardData, '_minesMsgId', 'BẢNG DÒ MÌN').catch(() => { }); }, 5000);
}

// --- ĐĂNG KÝ LỆNH SLASH ---
const commands = [
    // DÒ MÌN đã chuyển hẳn lên web (WEB_PLAY_URL, trang 💣 Dò Mìn), kết quả từng ván
    // vẫn được đăng về kênh Discord kèm nút vào web.
    // Khối lệnh /domin dưới đây chạy được với TOTAL_TILES = 24 (24 ô + nút DỪNG = 25,
    // vừa đúng giới hạn 25 nút/tin nhắn của Discord). Bỏ comment cả khối này lẫn khối
    // xử lý ở phần interaction là dùng lại được — nhưng đang cố tình tắt vì chơi trên
    // web mượt hơn, không dính deadline 3 giây của Discord.
    // new SlashCommandBuilder()
    //     .setName('domin')
    //     .setDescription('Bắt đầu ván dò mìn')
    //     .addSubcommand(sub => sub.setName('all').setDescription('Cược toàn bộ số dư')
    //         .addIntegerOption(opt => opt.setName('so_min').setDescription('Số mìn (1-23)').setMinValue(1).setMaxValue(23).setRequired(true))
    //     )
    //     .addSubcommand(sub => sub.setName('point').setDescription('Tùy chọn số Dogcoin cược')
    //         .addIntegerOption(opt => opt.setName('cuoc').setDescription('Số Dogcoin đặt').setRequired(true))
    //         .addIntegerOption(opt => opt.setName('so_min').setDescription('Số mìn (1-23)').setMinValue(1).setMaxValue(23).setRequired(true))
    //     ),
    new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví của bạn'),
    new SlashCommandBuilder().setName('diemdanh').setDescription(`Nhận ${DAILY_DOGCOIN.toLocaleString()} Dogcoin mỗi ngày (reset 00:00)`),
    new SlashCommandBuilder().setName('nghien').setDescription(`Điểm danh con nghiện: nhận ${HOURLY_DOGCOIN.toLocaleString()} Dogcoin, 1 tiếng/lần`),
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
    // TẠM TẮT: Bầu cua + Xổ số
    // runBầuCuaLoop();
    runTaiXiuLoop(); // TÀI XỈU vẫn chạy
    // runXoSoLoop();
    // resumeXosoAfterRestart().catch(() => {});
    runMinesBoardLoop();
    resumeMinesBoard().catch(e => writeLog('SYSTEM', `[BẢNG DÒ MÌN] Không nối lại được: ${e.message}`));
    runBlackjackBoardLoop();
    resumeBlackjackBoard().catch(e => writeLog('SYSTEM', `[BẢNG BLACKJACK] Không nối lại được: ${e.message}`));
    runStairsBoardLoop();
    resumeStairsBoard().catch(e => writeLog('SYSTEM', `[BẢNG LEO THANG] Không nối lại được: ${e.message}`));
    runStatsBoardLoop();
    resumeStatsBoard().catch(e => writeLog('SYSTEM', `[BẢNG THỐNG KÊ] Không nối lại được: ${e.message}`));

    // Cổng web cược cho người chơi (tách hẳn panel admin)
    try {
        startWebPlay({
            port: parseInt(process.env.PLAY_PORT) || 3002,
            lockSeconds: TX_LOCK_S,
            getTX: () => txState,
            getDb: () => dbCache,
            getUserData,
            updatePoints,
            saveDbNow,
            writeLog,
            mines: webMinesApi,
            stairs: webStairsApi,
            blackjack: blackjackTable,
            webPlayUrl: WEB_PLAY_URL,
            transfer: webTransfer,
            transferTargets: listTransferTargets,
            // 📅 điểm danh tháng + 💉 nghiện — cùng logic với /diemdanh, /nghien
            daily: { state: dailyState, claim: claimDaily, nghien: claimNghien },
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
            mascots: MASCOTS,
            txChoices: TX_CHOICES,
            diceEmojis: DICE_EMOJIS,
            totalTiles: TOTAL_TILES,
            getTX: () => txState,
            getBC: () => bcState,
            getDb: () => dbCache,
            getForcedMines: () => forcedMines,
            setForcedMines: (key, positions) => { forcedMines[key] = positions; },
            clearForcedMines: (key) => { delete forcedMines[key]; },
            getMinesHistory: () => minesHistory,
            getTXDash: () => txDashHistory,
            getBCDash: () => bcDashHistory,
            getUserData,
            updatePoints,
            logDog,
            getDogLedger: () => dbCache._dogLedger || [],
            getPalOrders: () => dbCache._palOrders || [],
            completePalOrder,
            deletePlayer,
            resetAllPlayers,
            addAllPlayers: addAllPlayersAndAnnounce,
            saveDbNow,
            writeLog,
            startBC: async (channelId) => { const ch = await client.channels.fetch(channelId); await startBaucua(ch); return ch.name; },
            stopBC: () => stopBaucua(),
            startTX: async (channelId) => { const ch = await client.channels.fetch(channelId); await startLonnho(ch); return ch.name; },
            stopTX: () => stopLonnho(),
            // Bảng mời chơi Dò Mìn (không có ván chung, chỉ khoe kết quả + nút vào web)
            getMines: () => ({ on: !!minesBoard.message, channelId: dbCache._minesChannelId || '' }),
            startMines: async (channelId) => { const ch = await client.channels.fetch(channelId); await startMinesBoard(ch); return ch.name; },
            stopMines: () => stopMinesBoard(),
            getBJBoard: () => ({ on: !!blackjackBoard.message, channelId: dbCache._bjChannelId || '' }),
            startBJBoard: async (channelId) => { const ch = await client.channels.fetch(channelId); await startBlackjackBoard(ch); return ch.name; },
            stopBJBoard: () => stopBlackjackBoard(),
            // Bảng thống kê 📊
            getStatsBoard: () => ({ on: !!statsBoard.message, channelId: dbCache._statsChannelId || '' }),
            startStatsBoard: async (channelId) => { const ch = await client.channels.fetch(channelId); await startStatsBoard(ch); return ch.name; },
            stopStatsBoard: () => stopStatsBoard(),
            resetStats,
            addJackpotStat,
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
            // tin xác nhận không tag ai — allowedMentions rỗng)
            setGiveawayConfig: async (channelId, roleId) => {
                const ch = await client.channels.fetch(channelId);
                await ch.send({ content: '🎁 Kênh này sẽ nhận thông báo **phát Dogcoin toàn server**.', allowedMentions: { parse: [] } });
                dbCache._giveawayChannelId = ch.id;
                dbCache._giveawayRoleId = roleId || null;
                saveDbNow();
                return ch.name;
            },
            // Reset điểm danh: xóa lastDaily của MỌI ví — ai cũng /diemdanh lại được ngay
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

        });
        writeLog('SYSTEM', `🌐 Web panel: SUPER cổng ${parseInt(process.env.PANEL_PORT) || 1508} | admin thường cổng ${parseInt(process.env.PANEL_PUBLIC_PORT) || 1234}`);
        // Không còn vòng quét tự động nào: mọi giao dịch với game là ticket, admin xử lý tay.
    } catch (e) {
        writeLog('SYSTEM', `[LỖI PANEL] ${e.message}`);
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

// --- UI BẦU CUA ---
function getBCMessageData(customStatus = null) {
    const lockTime = bcState.targetTime - 6;
    
    let desc = `⏳ **Mở bát:** <t:${bcState.targetTime}:R>\n\n`;

    if (bcState.lastGameInfo) {
        desc += `🔙 **Kết quả vòng trước (#${padId(bcState.lastGameInfo.gameId)}):** ${bcState.lastGameInfo.result}\n`;
        desc += `💸 **Người đặt vòng trước:** ${bcState.lastGameInfo.betDetails}\n\n`;
    }

    desc += `📝 **Người đặt hiện tại:**\n`;
    if (bcState.bets.length > 0) {
        // Gộp cược trùng của cùng 1 người vào cùng 1 con vật
        const byUser = {};
        bcState.bets.forEach(b => {
            const k = `${b.userId}_${b.mascotId}`;
            if (!byUser[k]) byUser[k] = { username: b.username, mascotId: b.mascotId, amount: 0 };
            byUser[k].amount += b.amount;
        });
        desc += Object.values(byUser)
            .map(b => `• **${b.username}**: ${MASCOTS.find(m => m.id === b.mascotId).emoji} **${b.amount.toLocaleString()}** ${DOGCOIN_EMOJI}`)
            .join('\n');
    } else {
        desc += "*Chưa có ai đặt*";
    }
    desc = desc.trimEnd();
    desc += `\n\n${customStatus || "👉 Chọn con vật rồi chọn số Dogcoin đặt!"}`;

    const embed = new EmbedBuilder()
        .setTitle(`🎲 BẦU CUA LIVE - Phiên #${padId(bcState.gameId)}`)
        .setColor(bcState.status === 'betting' ? 0x2ecc71 : 0xe74c3c)
        .setDescription(desc);

    const mascotRows1 = MASCOTS.slice(0, 3).map(m => 
        new ButtonBuilder().setCustomId(`bc_m_${m.id}`).setLabel(m.name).setEmoji(m.emoji)
        .setStyle(bcState.activeMascot === m.id ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(bcState.status !== 'betting')
    );
    const mascotRows2 = MASCOTS.slice(3, 6).map(m => 
        new ButtonBuilder().setCustomId(`bc_m_${m.id}`).setLabel(m.name).setEmoji(m.emoji)
        .setStyle(bcState.activeMascot === m.id ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(bcState.status !== 'betting')
    );

    const amountBets = [
        { id: '10', label: '10' },
        { id: '20', label: '20' },
        { id: '50', label: '50' },
        { id: '100', label: '100' }
    ];
    const amountRows = amountBets.map(v => 
        new ButtonBuilder().setCustomId(`bc_a_${v.id}`).setLabel(v.label)
        .setStyle(ButtonStyle.Primary).setDisabled(bcState.status !== 'betting')
    );

    const rows = [
        new ActionRowBuilder().addComponents(mascotRows1),
        new ActionRowBuilder().addComponents(mascotRows2),
        new ActionRowBuilder().addComponents(amountRows),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bc_a_custom').setLabel('💰 Tùy Chọn').setStyle(ButtonStyle.Success).setDisabled(bcState.status !== 'betting'),
            new ButtonBuilder().setCustomId('bc_a_all').setLabel('💸 All In').setStyle(ButtonStyle.Danger).setDisabled(bcState.status !== 'betting'),
            new ButtonBuilder().setCustomId('bc_soicau').setLabel('Soi Cầu').setEmoji('🕵️').setStyle(ButtonStyle.Secondary)
        )
    ];
    return { embeds: [embed], components: rows };
}

async function updateBCMessage(customStatus = null) {
    if (!bcState.message) return;
    const data = getBCMessageData(customStatus);
    await bcState.message.edit(data).catch((e) => { writeLog('SYSTEM', `[LỖI UPDATE BC BẢNG CƯỢC] ${e.message}`); });
}

// --- VÒNG LẶP BẦU CUA ---
function runBầuCuaLoop() {
    setInterval(async () => {
        // Auto-recover nếu message bị mất do timeout mạng
        if (!bcState.message && bcState.channel && !bcState.isProcessing) {
            bcState.isProcessing = true;
            bcState.processingStart = Date.now();
            bcState.targetTime = Math.floor(Date.now() / 1000) + 61;
            bcState.status = 'betting';
            bcState.bets = [];
            bcState.activeMascot = null;
            bcState.resultPromise = null;
            bcState.message = await bcState.channel.send(getBCMessageData()).catch(() => null);
            bcState.isProcessing = false;
            bcState.processingStart = 0;
            return;
        }
        if (!bcState.message || !bcState.channel) return;
        if (bcState.isProcessing) {
            // Watchdog: nếu kẹt quá 120 giây thì tự reset, auto-recover sẽ gửi bảng mới
            if (bcState.processingStart && Date.now() - bcState.processingStart > 120000) {
                writeLog('SYSTEM', '[WATCHDOG BC] isProcessing kẹt, tự reset');
                bcState.isProcessing = false;
                bcState.processingStart = 0;
                bcState.status = 'betting';
                bcState.resultPromise = null;
                bcState.bets = [];
                bcState.activeMascot = null;
                bcState.targetTime = Math.floor(Date.now() / 1000) + 61;
                bcState.message = null;
            }
            return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const lockTime = bcState.targetTime - 5;

        if (nowSec >= bcState.targetTime) {
            // Mở bát: kết quả đã được tính từ lúc đóng phiên, chỉ cần await
            bcState.status = 'ending';
            bcState.isProcessing = true;
            bcState.processingStart = Date.now();
            const prevMsgId = bcState.message?.id;

            try {
                const resultMsg = await (bcState.resultPromise || Promise.resolve(null));
                if (resultMsg?.id && prevMsgId) {
                    manageHistory(bcState, [prevMsgId, resultMsg.id]).catch(() => {});
                }
                                bcState.targetTime = Math.floor(Date.now() / 1000) + 61;
                bcState.status = 'betting';
                bcState.bets = [];
                bcState.gameId++;
                bcState.activeMascot = null;
                bcState.resultPromise = null;
                bcState.needsUpdate = false;
                const data = getBCMessageData();
                bcState.message = await bcState.channel.send(data).catch((e) => { writeLog('SYSTEM', `[LỖI GỬI BẢNG MỚI BC] ${e.message}`); return null; });
            } catch (e) {
                writeLog('SYSTEM', `[LỖI LOOP BC] ${e.message}`);
                // Recovery: reset để ván tiếp theo vẫn chạy được
                bcState.targetTime = Math.floor(Date.now() / 1000) + 61;
                bcState.status = 'betting';
                bcState.bets = [];
                bcState.activeMascot = null;
                bcState.resultPromise = null;
            }

            bcState.isProcessing = false;
            bcState.processingStart = 0;

        } else if (nowSec >= lockTime && bcState.status === 'betting') {
            bcState.status = 'ending';
            bcState.activeMascot = null;
            const snapGameId = bcState.gameId;
            const snapBets = bcState.bets.slice();
            bcState.resultPromise = finishBCGame(snapGameId, snapBets);
            updateBCMessage().catch(() => {});

        } else if (bcState.status === 'betting' && bcState.needsUpdate) {
            updateBCMessage().catch(() => {});
            bcState.needsUpdate = false;
        }
    }, 1000);
}

async function finishBCGame(gameId, bets) {
    // Hàm này được gọi từ lúc KHÓA BÁT (T-5s). Ngủ chờ tới đúng giờ mở bát rồi mới
    // tính kết quả + trả thưởng + đăng — không thì kết quả lòi ra sớm 5-7 giây so
    // với đồng hồ đếm ngược người chơi đang nhìn.
    const revealAtMs = bcState.targetTime * 1000;
    const waitMs = revealAtMs - Date.now();
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    let res = [];
    if (bcState.forcedResult) {
        res = bcState.forcedResult.split(',').map(id => MASCOTS.find(m => m.id === id.trim()) || MASCOTS[0]);
        bcState.forcedResult = null;
    } else {
        for (let i = 0; i < 3; i++) res.push(MASCOTS[Math.floor(Math.random() * MASCOTS.length)]);
    }

    let prevBetsDisplay = bets.map(b => `${b.username} (${b.amount})`).join(', ');

    // Gộp tiền thắng theo người (1 người đặt nhiều lần -> 1 dòng)
    const winAgg = {};
    bets.forEach(b => {
        const count = res.filter(r => r.id === b.mascotId).length;
        if (count > 0) {
            const win = b.amount * (count + 1);
            updatePoints(b.userId, win);
            if (!winAgg[b.userId]) winAgg[b.userId] = { userId: b.userId, name: b.username, amount: 0 };
            winAgg[b.userId].amount += win;
        }
    });
    const winners = Object.values(winAgg).map(w => ({ name: w.name, amount: w.amount }));
    const winLog = Object.values(winAgg).map(w => `• <@${w.userId}> thắng **${w.amount.toLocaleString()}** ${DOGCOIN_EMOJI}`).join('\n');

    const resultNames = res.map(r => r.name).join(', ');
    writeLog('RESULT', `[KẾT QUẢ BẦU CUA] Phiên #${gameId}: ${resultNames}`);

    if (bets.length > 0) {
        let betLogDetails = bets.map(b => `${b.username} đặt ${b.amount} vào ${MASCOTS.find(m => m.id === b.mascotId).name}`).join(' | ');
        writeLog('BET', `[CƯỢC BẦU CUA] Phiên #${gameId} | Đặt: ${betLogDetails} | KQ: ${resultNames}`);
    }

    const resEmb = new EmbedBuilder()
        .setTitle(`🎰 KẾT QUẢ #${padId(gameId)}`)
        .setColor(0xf1c40f)
        .setDescription(`🎲: ${res.map(r => r.emoji).join(' ')}\n\n🏆 **Thắng:**\n${winLog || "Ván này nhà cái húp sạch!"}`);

    const sentMsg = await bcState.channel.send({ embeds: [resEmb] }).catch((e) => { writeLog('SYSTEM', `[LỖI GỬI KẾT QUẢ BC] ${e.message}`); return null; });

    bcState.lastGameInfo = {
        gameId,
        result: res.map(r => r.emoji).join(' '),
        betDetails: prevBetsDisplay || "Không có ai đặt"
    };
    // Gộp cược trùng để lưu gọn (rỗng nếu không ai đặt).
    const betAgg = {};
    bets.forEach(b => {
        const k = `${b.userId}_${b.mascotId}`;
        if (!betAgg[k]) betAgg[k] = { name: b.username, mascot: MASCOTS.find(m => m.id === b.mascotId).name, emoji: MASCOTS.find(m => m.id === b.mascotId).emoji, amount: 0 };
        betAgg[k].amount += b.amount;
    });
    const histEntry = {
        gameId,
        result: resultNames,
        resultEmoji: res.map(r => r.emoji).join(' '),
        bets: Object.values(betAgg),
        winners,
        time: new Date().toLocaleTimeString('vi-VN')
    };
    // Soi cầu Discord: lưu MỌI ván (cầu liền mạch), RAM, giữ 1000 ván, mất khi restart.
    bcState.history.unshift(histEntry);
    if (bcState.history.length > 1000) bcState.history.pop();
    // Dashboard web: CHỈ ván có người đặt, lưu vĩnh viễn vào database.json, KHÔNG xóa.
    if (bets.length > 0) bcDashHistory.unshift(histEntry);

    return sentMsg;
}

// --- UI TÀI XỈU ---
// Tài Xỉu đã CHUYỂN HẾT LÊN WEB: bảng Discord chỉ hiển thị tình hình + nút lấy link/PIN.
// Đặt cược + nặn xí ngầu (kéo tờ giấy) đều làm trên web (webplay.js).
function getTXMessageData(customStatus = null) {
    let desc = `⏳ **Mở bát:** <t:${txState.targetTime}:R>\n\n`;

    if (txState.lastGameInfo) {
        desc += `🔙 **Kết quả vòng trước (#${padId(txState.lastGameInfo.gameId)}):** ${txState.lastGameInfo.result}\n`;
        desc += `💸 **Người đặt vòng trước:** ${txState.lastGameInfo.betDetails}\n\n`;
    }

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
    desc += `\n\n${customStatus || `👉 Bấm **🌐 Cược trên web** lấy link + PIN — đặt cược và **nặn xí ngầu** (kéo tờ giấy) đều trên web, ${TX_LOCK_S} giây cuối khóa sổ để nặn!`}`;

    const embed = new EmbedBuilder()
        .setTitle(`🎲 TÀI XỈU LIVE - Game #${padId(txState.gameId)}`)
        .setColor(txState.status === 'betting' ? 0x2ecc71 : 0xe74c3c)
        .setDescription(desc);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('web_pin').setLabel('🌐 Chơi trên web (Tài Xỉu + Dò Mìn)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('tx_soicau').setLabel('Soi Cầu').setEmoji('🕵️').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

async function updateTXMessage(customStatus = null) {
    if (!txState.message) return;
    const data = getTXMessageData(customStatus);
    await txState.message.edit(data).catch((e) => { writeLog('SYSTEM', `[LỖI UPDATE TX BẢNG CƯỢC] ${e.message}`); });
}

// --- VÒNG LẶP TÀI XỈU ---
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

            try {
                const resultMsg = await (txState.resultPromise || Promise.resolve(null));
                if (resultMsg?.id && prevMsgId) {
                    manageHistory(txState, [prevMsgId, resultMsg.id]).catch(() => {});
                }
                                txState.targetTime = Math.floor(Date.now() / 1000) + TX_ROUND_S;
                txState.status = 'betting';
                txState.bets = [];
                txState.gameId++;
                txState.activeChoice = null;
                txState.resultPromise = null;
                txState.needsUpdate = false;
                const data = getTXMessageData();
                txState.message = await txState.channel.send(data).catch((e) => { writeLog('SYSTEM', `[LỖI GỬI BẢNG MỚI TX] ${e.message}`); return null; });
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
// gọi lúc lật đủ 3 viên (hoặc hết hạn tự mở) — KHÔNG gọi lúc lắc, kẻo trả tiền 2 lần.
function settleTXPayout(gameId, bets, d1, d2, d3) {
    const sum = d1 + d2 + d3;

    const isStorm = d1 === d2 && d2 === d3; // BÃO: 3 viên giống nhau
    const isTai = sum >= 11;
    const isChan = sum % 2 === 0;

    const resultTX = isTai ? 'tai' : 'xiu';
    const resultCL = isChan ? 'chan' : 'le';

    let prevBetsDisplay = bets.map(b => `${b.username} (${b.amount} -> ${TX_CHOICES[b.choice].name})`).join(', ');

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

    const txIcon = isStorm ? `🌪️ BÃO ${d1}-${d1}-${d1}` : (isTai ? 'TÀI 🔺' : 'XỈU 🔻');
    const clIcon = isStorm ? 'cửa thường thua hết' : (isChan ? 'CHẴN 🔵' : 'LẺ 🟣');
    writeLog('RESULT', `[KẾT QUẢ TÀI XỈU] Game #${gameId}: ${d1}-${d2}-${d3} (Tổng ${sum} | ${isStorm ? 'BÃO' : (isTai ? 'TÀI' : 'XỈU')} | ${isStorm ? 'BÃO' : (isChan ? 'CHẴN' : 'LẺ')})`);

    if (bets.length > 0) {
        let betLogDetails = bets.map(b => `${b.username} đặt ${b.amount} vào ${TX_CHOICES[b.choice].name}`).join(' | ');
        writeLog('BET', `[CƯỢC TÀI XỈU] Game #${gameId} | Đặt: ${betLogDetails} | KQ: ${d1}-${d2}-${d3} (${sum})`);
    }

    txState.lastGameInfo = {
        gameId,
        result: `${DICE_EMOJIS[d1]} ${DICE_EMOJIS[d2]} ${DICE_EMOJIS[d3]} (Tổng: ${sum}) | ${txIcon} ${clIcon}`,
        betDetails: prevBetsDisplay || "Không có ai đặt"
    };
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
        tx: isStorm ? 'BÃO' : (isTai ? 'TÀI' : 'XỈU'),
        cl: isStorm ? 'BÃO' : (isChan ? 'CHẴN' : 'LẺ'),
        bets: Object.values(betAgg),
        winners,
        time: new Date().toLocaleTimeString('vi-VN')
    };
    // Soi cầu Discord: lưu MỌI ván (cầu liền mạch), RAM, giữ 1000 ván, mất khi restart.
    txState.history.unshift(histEntry);
    if (txState.history.length > 1000) txState.history.pop();
    // Dashboard web: CHỈ ván có người đặt, lưu vĩnh viễn vào database.json, KHÔNG xóa.
    if (bets.length > 0) txDashHistory.unshift(histEntry);

    return { sum, txIcon, clIcon, winLog };
}

function buildTXResultEmbed(gameId, d1, d2, d3, info, footerText) {
    return new EmbedBuilder()
        .setTitle(`🎲 KẾT QUẢ SÒNG TÀI XỈU`)
        .setColor(0x2b2d31)
        .setDescription(`**Game #${padId(gameId)}**\n\n` +
                        `🎲 **Xúc xắc:** ${DICE_EMOJIS[d1]} ${DICE_EMOJIS[d2]} ${DICE_EMOJIS[d3]}\n` +
                        `📊 **Tổng:** ${info.sum}\n` +
                        `🎯 **Kết quả:** ${info.txIcon} | ${info.clIcon}\n\n` +
                        `🏆 **Người thắng:**\n${info.winLog || "🚫 \`Không ai thắng ván này!\`"}`)
        .setFooter({ text: footerText });
}

// Ván Tài Xỉu: được gọi NGAY LÚC KHÓA SỔ (T-15s). Lắc ngầm liền để web mở cửa sổ nặn,
// rồi ngủ tới đúng giờ mở bát mới trả thưởng + đăng kết quả công khai.
async function finishTXGame(gameId, bets) {
    const [d1, d2, d3] = rollTXDice();
    // Mở cửa sổ nặn trên web: ai đăng nhập cũng kéo giấy xem riêng được
    txState.nan = { gameId, dice: [d1, d2, d3] };

    const revealAtMs = txState.targetTime * 1000;
    const waitMs = revealAtMs - Date.now();
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    txState.nan = null; // đóng cửa sổ nặn
    const info = settleTXPayout(gameId, bets, d1, d2, d3);
    // Admin có thể bấm Dừng Tài Xỉu NGAY TRONG lúc chờ nặn ở trên -> channel bị gỡ (null).
    // Tiền đã trả xong ở settleTXPayout, chỉ không gửi được tin kết quả — bỏ qua, đừng sập bot.
    const ch = txState.channel;
    if (!ch) { writeLog('SYSTEM', `[TX] Game #${gameId}: bàn đã dừng trước khi gửi kết quả — bỏ qua tin nhắn`); return null; }
    const emb = buildTXResultEmbed(gameId, d1, d2, d3, info, 'Ván mới bắt đầu ngay — cược trên web!');
    return await ch.send({ embeds: [emb] }).catch((e) => { writeLog('SYSTEM', `[LỖI GỬI KQ TX] ${e.message}`); return null; });
}

// ==========================================
// --- ĐIỀU KHIỂN BÀN CHƠI (gọi từ web panel) ---
// ==========================================
async function startBaucua(channel) {
    if (bcState.message) await bcState.message.delete().catch(() => {});
    bcState.message = null;
    bcState.channel = channel;
    bcState.gameId++;
    bcState.timeLeft = 55;
    bcState.targetTime = Math.floor(Date.now() / 1000) + 61;
    bcState.status = 'betting';
    bcState.bets = [];
    bcState.needsUpdate = false;
    bcState.activeMascot = null;
    bcState.isProcessing = true;
    bcState.processingStart = Date.now();
    try {
        bcState.message = await bcState.channel.send(getBCMessageData());
        dbCache._bcChannelId = channel.id;
    } finally {
        bcState.isProcessing = false;
        bcState.processingStart = 0;
    }
}

function stopBaucua() {
    if (bcState.message) bcState.message.delete().catch(() => {});
    bcState.channel = null;
    bcState.message = null;
    bcState.status = 'stopped';
}

async function startLonnho(channel) {
    if (txState.message) await txState.message.delete().catch(() => {});
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
    // đúng giờ qua resultPromise — không om tiền người chơi.
}

// ===== XỔ SỐ MIỀN BẮC =====

function vnNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

// Epoch (giây) của đầu giờ kế tiếp — múi giờ VN lệch UTC đúng số giờ chẵn nên đầu giờ trùng nhau.
function xsNextDrawEpoch() {
    return (Math.floor(Date.now() / 3600000) + 1) * 3600;
}

function xsRandDigits(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
}

// Quay đủ bảng 27 giải. forced = {de, mustHit[], mustMiss[]} — áp một kỳ rồi xóa.
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
            // Tag người trúng ở content (mention trong embed KHÔNG ping) — phải khai allowedMentions
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
            // Xóa bảng cũ, mở bảng ván MỚI ngay DƯỚI kết quả (không edit tại chỗ —
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
// (hoặc admin bấm QUAY NGAY trên panel) — cược không mất vì đã lưu database.
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
// userData.ingameName) — người chơi không tự đặt được (chống giả tên rút trộm).
// Không dùng hệ liên kết SteamID/REST cũ nữa (REST đã tắt, chỉ còn SFTP).

function getWithdrawMessageData() {
    const buyable = shopBuyableList().length;
    const lines = [
        `Chuyển Dogcoin **tự động** giữa ví Discord và Dog Coin trong game — xử lý ngay trong ~10 giây, không cần chờ admin.`,
        '',
        `Lần đầu dùng: nhắn **admin liên kết tên nhân vật** với Discord của bạn (chỉ cần 1 lần).`,
        `**🎮 Chuyển vào game** — trừ ví Discord, Dog Coin rơi thẳng vào túi trong game (bạn phải **đang online**). Tối đa ${WITHDRAW_MAX_PER_REQUEST.toLocaleString()}/lần.`,
        `**💬 Chuyển ra Discord** — trừ Dog Coin **trong túi** (không tính đồ trong hòm), cộng thẳng vào ví Discord.`,
        '',
        `**🎲 Pal ngẫu nhiên — ${PAL_SHOP.randomPrice.toLocaleString()} Dogcoin** — quay từ ${gachaPool().length} pal MẠNH (paldex #${GACHA_MIN_DEX} Helzephyr trở lên, có cả pal raid, trừ Xenolord, Hartalis & Blazamut Ryu). Biết trúng con gì **rồi mới chọn** passive + linh hồn.`,
        `**🎯 Pal tùy chọn — ${PAL_SHOP.customPrice.toLocaleString()} Dogcoin** — tự chọn 1 trong ${buyable} pal (không có pal raid).`,
        `Pal nào cũng là bản **Boss (Alpha)** 👑, **${PAL_SHOP.stars} sao** ⭐, **IV ${PAL_SHOP.ivs}**, ` +
            `**${PAL_SHOP.soulSlots} dòng linh hồn ${PAL_SHOP.soulPercent}%** + **${PAL_SHOP.passiveSlots} passive** bạn tự chọn.`,
        `🚫 Passive nhóm **Cây Thế Giới** không bán kèm pal — mua cấy ghép ở sạp trong game.`,
        '',
        `🏪 Lõi Văn Minh, cấy ghép, đổi vàng... mua ở **sạp trong game**.`,
    ];

    const embed = new EmbedBuilder()
        .setTitle('🔄 DOGCOIN & SHOP PAL')
        .setColor(0xf1c40f)
        .setDescription(lines.join('\n'));

    // Màu theo HÀNG cho dễ nhìn: hàng chuyển tiền xanh dương, hàng shop pal xanh lá.
    const rowTransfer = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rut_open').setLabel('Chuyển vào game').setEmoji('🎮').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('nap_open').setLabel('Chuyển ra Discord').setEmoji('💬').setStyle(ButtonStyle.Primary)
    );
    const rowPal = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_random').setLabel(`Pal ngẫu nhiên — ${PAL_SHOP.randomPrice.toLocaleString()}`).setEmoji('🎲').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('shop_custom').setLabel(`Pal tùy chọn — ${PAL_SHOP.customPrice.toLocaleString()}`).setEmoji('🎯').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [rowTransfer, rowPal] };
}

// (Bảng shop pal riêng đã gộp vào bảng chuyển Dogcoin ở trên — 1 kênh, 1 thông báo.
//  Lõi Văn Minh / cấy ghép / đổi vàng bỏ khỏi Discord: bán ở sạp trong game.)

// Gửi đơn hàng cho admin qua DM. Đây là bước QUAN TRỌNG: tiền đã trừ rồi, nếu admin
// không nhận được đơn thì người chơi mất tiền mà không có pal. Nên khi gửi DM thất
// bại, ghi log ADMIN thật rõ để còn lần ra được đơn đó.
async function sendPalOrderToAdmin(order) {
    const text =
        `🐾 **ĐƠN PAL MỚI** #${order.id}\n` +
        `Người mua: <@${order.userId}> (\`${order.username}\`)\n` +
        `Giá: **${order.price.toLocaleString()}** Dogcoin (${order.kind === 'random' ? '🎲 ngẫu nhiên' : '🎯 tự chọn'})\n\n` +
        `**Pal: ${order.palName}** \`${order.palCode}\`\n` +
        `• Boss (Alpha), ${PAL_SHOP.stars} sao, IV ${PAL_SHOP.ivs} cả 3 chỉ số\n` +
        `• Linh hồn ${PAL_SHOP.soulPercent}%: ${order.souls || '(đang chọn — sẽ có tin bổ sung)'}\n` +
        `• Passive: ${order.passives || '(đang chọn — sẽ có tin bổ sung)'}\n\n` +
        `Lúc: ${order.time}`;

    try {
        const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
        await admin.send(text);
        return true;
    } catch (e) {
        writeLog('ADMIN', `[SHOP PAL] KHONG GUI DUOC DM cho admin — don #${order.id}: ${order.username} mua ${order.palName} (${order.price} Dogcoin). Loi: ${e.message}`);
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
    writeLog('ADMIN', `[SHOP PAL] Hoan thanh don #${order.id} — ${order.palName} cho ${order.username}`);

    // Nhắn cho người mua; DM thất bại thì vẫn coi là xong (pal đã giao trong game rồi).
    try {
        const user = await client.users.fetch(order.userId);
        await user.send(`🐾 Đơn pal **#${order.id}** đã xong! Admin đã giao **${order.palName}** cho bạn trong game.`);
    } catch { /* người chơi tắt DM */ }

    return { ok: true };
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

// Gửi đơn cho admin qua DM. DM hỏng không sao — panel vẫn là nguồn chính, chỉ ghi log.
async function sendTicketToAdmin(req) {
    const text =
        `📨 **ĐƠN MỚI** #${req.id} — ${TICKET_KIND_LABEL[req.kind] || req.kind}\n` +
        `Người chơi: <@${req.userId}> (\`${req.username}\`)` +
        (req.ingameName ? ` — trong game: **${req.ingameName}**` : '') + '\n' +
        `Việc cần làm: ${ticketActionText(req)}\n` +
        `Lúc: ${req.time}\n` +
        `Duyệt/từ chối trên panel.`;
    try {
        const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
        await admin.send(text);
    } catch (e) {
        writeLog('ADMIN', `[TICKET] Khong gui duoc DM cho admin — don #${req.id} (${req.kind}) cua ${req.username}: ${e.message}. Xem tren panel.`);
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
        logDog('from-game', req.userId, req.username, req.amount, `admin xác nhận nhận Dog Coin trong game — đơn #${id}`);
        notifyTicketUser(req, `✅ Đơn **#${id}** xong: admin đã nhận Dog Coin, ví Discord của bạn +**${req.amount.toLocaleString()}** ${DOGCOIN_EMOJI}`).catch(() => {});
    } else { // 'to-game'
        notifyTicketUser(req, `✅ Đơn **#${id}** xong: admin đã đưa **${req.amount.toLocaleString()}** Dog Coin cho bạn trong game.`).catch(() => {});
    }

    writeLog('ADMIN', `[DUYỆT ĐƠN] #${id} (${req.kind || 'to-game'}) ${req.username} — ${ticketActionText(req)}`);
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
    writeLog('ADMIN', `[TỪ CHỐI ĐƠN] #${id} (${req.kind || 'to-game'}) ${req.username}${deducted > 0 ? ` — đã hoàn ${deducted.toLocaleString()} Dogcoin` : ''}`);
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
        bcDashHistory = [];
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
    // Đóng dấu tên hiển thị NGAY TƯƠNG TÁC ĐẦU TIÊN — getUserData tự tạo ví cho người
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
            return interaction.reply(`🎁 **Điểm danh thành công!** Bạn nhận được **${r.amount.toLocaleString()}** ${DOGCOIN_EMOJI}${r.bonus ? ` + **${r.bonus.toLocaleString()}** ${DOGCOIN_EMOJI} BONUS đủ tháng 🏆` : ''}. Số dư mới: **${r.balance.toLocaleString()}** ${DOGCOIN_EMOJI}\nChuỗi: **${r.state.streak} ngày** — xem lịch tháng trên web (tab 📅).`);
        }

        if (interaction.commandName === 'nghien') {
            // Cooldown LĂN 60 phút từ lần nhận trước — logic chung với web (claimNghien),
            // có đăng công khai vào kênh nghiện.
            const r = claimNghien(userId);
            if (r.error) return interaction.reply({ content: `⏳ ${r.error}`, ephemeral: true });
            return interaction.reply(`💉 **Điểm danh con nghiện!** Bạn nhận được **${r.amount.toLocaleString()}** ${DOGCOIN_EMOJI}. Số dư mới: **${r.balance.toLocaleString()}** ${DOGCOIN_EMOJI} — quay lại sau 1 tiếng nhé.`);
        }

        if (interaction.commandName === 'sodu') {
            const points = getUserData(userId).points;
            const embed = new EmbedBuilder()
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .setTitle("💳 VÍ DOGCOIN CỦA BẠN")
                .setDescription(`Số dư hiện tại: **${points.toLocaleString()}** ${DOGCOIN_EMOJI}`)
                .setColor(0x00ff00);
            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'chuyentien') {
            const receiver = interaction.options.getUser('nguoi');
            const amount = interaction.options.getInteger('sotien');
            if (receiver.id === userId) return interaction.reply({ content: "❌ Không thể tự chuyển cho mình!", ephemeral: true });
            if (amount <= 0) return interaction.reply({ content: "❌ Số Dogcoin không hợp lệ!", ephemeral: true });
            
            const senderData = getUserData(userId);
            if (senderData.points < amount) return interaction.reply({ content: `❌ Bạn không đủ Dogcoin!`, ephemeral: true });
            
            updatePoints(userId, -amount); 
            updatePoints(receiver.id, amount);
            logDog('transfer', userId, interaction.user.tag, -amount, `chuyển cho ${receiver.tag}`);
            logDog('transfer', receiver.id, receiver.tag, amount, `nhận từ ${interaction.user.tag}`);
            writeLog('ADMIN', `[CHUYỂN TIỀN] ${interaction.user.tag} → ${receiver.tag} | ${amount.toLocaleString()} Dogcoin`);
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle("💸 GIAO DỊCH").setDescription(`✅ <@${userId}> đã chuyển **${amount.toLocaleString()}** ${DOGCOIN_EMOJI} cho <@${receiver.id}>!`).setColor(0x00aeef)] });
        }

        // Lệnh /domin đã gỡ. Discord còn cache lệnh cũ ở máy người chơi một lúc nên vẫn
        // bắt ở đây để chỉ đường sang web, thay vì để họ bấm rồi không thấy gì.
        if (interaction.commandName === 'domin') {
            return interaction.reply({
                content: `💎 **Dò Mìn đã chuyển lên web** — lưới 25 ô, đào tới đâu ăn tới đó.\n` +
                         `👉 ${WEB_PLAY_URL} → tab **💎 Dò Mìn**\n` +
                         `Lấy mã PIN bằng nút **🌐 Cược trên web** ở bảng Tài Xỉu.`,
                ephemeral: true,
            });
        }

        /* ===== BẢN DÒ MÌN CŨ CHẠY TRONG DISCORD — giữ lại, chưa xóa =====
           Muốn bật lại: đổi TOTAL_TILES về 24 (Discord tối đa 25 nút, 25 ô + nút DỪNG
           là tràn), bỏ comment khối lệnh /domin ở phần đăng ký slash, rồi bỏ comment khối này.
        if (interaction.commandName === 'domin') {
            let userData = getUserData(userId);
            const subCmd = interaction.options.getSubcommand();
            let bet = 0;
            const numMines = interaction.options.getInteger('so_min'); 
            const maxDiamonds = TOTAL_TILES - numMines;

            if (subCmd === 'all') {
                bet = userData.points;
            } else if (subCmd === 'point') {
                bet = interaction.options.getInteger('cuoc');
            }

            if (bet <= 0) return interaction.reply({ content: "❌ Đặt ít nhất 1 điểm!", ephemeral: true });
            if (userData.points < bet) return interaction.reply({ content: `❌ Bạn không đủ Dogcoin!`, ephemeral: true });

            await interaction.deferReply();

            let game = createGame(numMines, userId);
            
            const renderEmbed = (status = "playing") => {
                const diamonds = game.revealed.length;
                const { multi, nextMulti } = getInfo(diamonds, game.totalMines);
                const currentTotalWin = Math.floor(bet * multi);
                const nextTotalWin = Math.floor(bet * nextMulti);
                const liveBalance = getUserData(userId).points; 

                let color = status === "won" ? 0x2ecc71 : status === "lost" ? 0xe74c3c : 0x5865F2;
                
                let desc = "";
                if (status === "playing") {
                    desc = `👤 Người chơi: <@${userId}>\n💣 Số mìn: **${game.totalMines}**\n💰 Mức đặt: **${bet.toLocaleString()}** ${DOGCOIN_EMOJI}\n💳 Số dư: **${liveBalance.toLocaleString()}** ${DOGCOIN_EMOJI}\n\n${DOGCOIN_EMOJI} Dogcoin đào được: **${diamonds}/${maxDiamonds}**\n🔥 Hệ số hiện tại: **x${multi}**\n💵 Đang có: **${currentTotalWin.toLocaleString()}** ${DOGCOIN_EMOJI}\n`;
                    desc += diamonds < maxDiamonds ? `\n👉 Mở ô tiếp theo sẽ đạt: **x${nextMulti}** (*${nextTotalWin.toLocaleString()}* ${DOGCOIN_EMOJI})` : `\nĐã đạt mức tối đa!`;
                } else if (status === "won") {
                    desc = `🎉 **THẮNG RỒI!**\nBạn nhận được **${currentTotalWin.toLocaleString()}** ${DOGCOIN_EMOJI} (Hệ số: **x${multi}**)\n💰 Số dư mới: **${liveBalance.toLocaleString()}** ${DOGCOIN_EMOJI}`;
                } else if (status === "lost") {
                    desc = `💥 **BÙM!** Trúng mìn rồi!\nBạn mất **${bet.toLocaleString()}** ${DOGCOIN_EMOJI}\n💰 Số dư còn lại: **${liveBalance.toLocaleString()}** ${DOGCOIN_EMOJI}`;
                }

                return new EmbedBuilder()
                    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                    .setTitle("💎 TRÒ CHƠI DÒ MÌN")
                    .setDescription(desc)
                    .setColor(color)
                    .setTimestamp();
            };

            const renderButtons = (showAll = false) => {
                const rows = [];
                for (let i = 0; i < 4; i++) {
                    const row = new ActionRowBuilder();
                    for (let j = 0; j < 5; j++) {
                        const idx = i * 5 + j;
                        const btn = new ButtonBuilder().setCustomId(`m_${idx}`);
                        if (game.revealed.includes(idx)) btn.setEmoji(DOGCOIN_EMOJI_ID).setStyle(ButtonStyle.Success).setDisabled(true);
                        else if (showAll && game.mines.includes(idx)) btn.setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
                        else btn.setLabel('?').setStyle(ButtonStyle.Secondary).setDisabled(showAll);
                        row.addComponents(btn);
                    }
                    rows.push(row);
                }
                const row5 = new ActionRowBuilder();
                for (let j = 0; j < 4; j++) {
                    const idx = 20 + j;
                    const btn = new ButtonBuilder().setCustomId(`m_${idx}`);
                    if (game.revealed.includes(idx)) btn.setEmoji(DOGCOIN_EMOJI_ID).setStyle(ButtonStyle.Success).setDisabled(true);
                    else if (showAll && game.mines.includes(idx)) btn.setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
                    else btn.setLabel('?').setStyle(ButtonStyle.Secondary).setDisabled(showAll);
                    row5.addComponents(btn);
                }
                row5.addComponents(new ButtonBuilder().setCustomId('stop').setLabel('DỪNG').setStyle(ButtonStyle.Primary).setDisabled(showAll || game.revealed.length === 0));
                rows.push(row5);
                return rows;
            };

            const response = await interaction.editReply({ embeds: [renderEmbed()], components: renderButtons() });
            const collector = response.createMessageComponentCollector({ filter: i => i.user.id === userId, time: 300000 }); 

            let isProcessingClick = false; 

            collector.on('collect', async i => {
                if (isProcessingClick) return i.deferUpdate().catch(() => {});
                isProcessingClick = true;

                try {
                    await i.deferUpdate(); 

                    if (i.customId === 'stop') {
                        const winProfit = Math.floor(bet * getInfo(game.revealed.length, game.totalMines).multi) - bet;
                        updatePoints(userId, winProfit);
                        await i.editReply({ embeds: [renderEmbed("won")], components: renderButtons(true) });
                        
                        writeLog('RESULT', `[KẾT QUẢ DÒ MÌN] ${interaction.user.tag} DỪNG - Số mìn: ${game.totalMines}`);
                        writeLog('BET', `[CƯỢC DÒ MÌN] ${interaction.user.tag} cược ${bet} (Mìn: ${game.totalMines}) | KQ: Thắng ${winProfit}`);
                        minesHistory.unshift({ name: interaction.user.username, bet, mines: game.totalMines, diamonds: game.revealed.length, result: 'Dừng (Thắng)', amount: winProfit, time: new Date().toLocaleTimeString('vi-VN') });
                        if (minesHistory.length > 20) minesHistory.pop();

                        return collector.stop();
                    }

                    const idx = parseInt(i.customId.split('_')[1]);
                    if (game.mines.includes(idx)) {
                        updatePoints(userId, -bet);
                        await i.editReply({ embeds: [renderEmbed("lost")], components: renderButtons(true) });
                        
                        writeLog('RESULT', `[KẾT QUẢ DÒ MÌN] ${interaction.user.tag} BÙM - Số mìn: ${game.totalMines}`);
                        writeLog('BET', `[CƯỢC DÒ MÌN] ${interaction.user.tag} cược ${bet} (Mìn: ${game.totalMines}) | KQ: Thua ${bet}`);
                        minesHistory.unshift({ name: interaction.user.username, bet, mines: game.totalMines, diamonds: game.revealed.length, result: 'Trúng mìn (Thua)', amount: -bet, time: new Date().toLocaleTimeString('vi-VN') });
                        if (minesHistory.length > 20) minesHistory.pop();

                        collector.stop();
                    } else {
                        if (!game.revealed.includes(idx)) game.revealed.push(idx);
                        
                        if (game.revealed.length === maxDiamonds) {
                            const jackpotWin = Math.floor(bet * getInfo(maxDiamonds, game.totalMines).multi) - bet;
                            updatePoints(userId, jackpotWin);
                            await i.editReply({ embeds: [renderEmbed("won")], components: renderButtons(true) });
                            
                            writeLog('RESULT', `[KẾT QUẢ DÒ MÌN] ${interaction.user.tag} JACKPOT - Số mìn: ${game.totalMines}`);
                            writeLog('BET', `[CƯỢC DÒ MÌN] ${interaction.user.tag} cược ${bet} (Mìn: ${game.totalMines}) | KQ: Jackpot ${jackpotWin}`);
                            minesHistory.unshift({ name: interaction.user.username, bet, mines: game.totalMines, diamonds: game.revealed.length, result: 'Jackpot', amount: jackpotWin, time: new Date().toLocaleTimeString('vi-VN') });
                            if (minesHistory.length > 20) minesHistory.pop();

                            collector.stop();
                        } else {
                            await i.editReply({ embeds: [renderEmbed()], components: renderButtons() });
                        }
                    }
                } catch (err) {
                    console.error("[LỖI DÒ MÌN]", err);
                } finally {
                    isProcessingClick = false;
                }
            });
        }
        ===== hết bản dò mìn cũ trên Discord ===== */
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'bc_modal_custom') {
            if (bcState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
            const sel = userBCSelections[userId];
            if (!sel) return interaction.reply({ content: "❌ Bạn chưa chọn con vật!", ephemeral: true });

            const amountStr = interaction.fields.getTextInputValue('bc_input_amount');
            const amt = parseInt(amountStr);

            if (isNaN(amt) || amt <= 0 || getUserData(userId).points < amt) {
                return interaction.reply({ content: "❌ Số Dogcoin không hợp lệ hoặc bạn không đủ Dogcoin!", ephemeral: true });
            }

            updatePoints(userId, -amt);
            bcState.bets.push({ userId, username: interaction.user.username, mascotId: sel.mascotId, amount: amt });

            userBCSelections[userId] = null;
            bcState.activeMascot = null;
            // KHÔNG await edit bảng ở đây: edit message bị Discord rate-limit, đông người
            // cược là chờ quá 3 giây -> interaction chết (10062) -> người chơi không thấy
            // phản hồi gì. Reply ngay, vòng lặp 1s thấy needsUpdate sẽ tự vẽ lại bảng.
            bcState.needsUpdate = true;

            return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()}** ${DOGCOIN_EMOJI} vào **${MASCOTS.find(m => m.id === sel.mascotId).name}**!`, ephemeral: true });
        }

        if (interaction.customId === 'tx_modal_custom') {
            if (txState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
            const sel = userTXSelections[userId];
            if (!sel) return interaction.reply({ content: "❌ Bạn chưa chọn cửa cược!", ephemeral: true });

            const amountStr = interaction.fields.getTextInputValue('tx_input_amount');
            const amt = parseInt(amountStr);

            if (isNaN(amt) || amt <= 0 || getUserData(userId).points < amt) {
                return interaction.reply({ content: "❌ Số Dogcoin không hợp lệ hoặc bạn không đủ Dogcoin!", ephemeral: true });
            }

            updatePoints(userId, -amt);
            txState.bets.push({ userId, username: interaction.user.username, choice: sel.choice, amount: amt });

            userTXSelections[userId] = null;
            txState.activeChoice = null;
            // Reply ngay, không await edit bảng (lý do: xem chú thích ở bc_modal_custom).
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

            // Chặn TRƯỚC khi trừ tiền — người chơi sửa lại rồi mua tiếp, không mất gì.
            const banned = findBannedPassive(passives);
            if (banned) {
                return interaction.reply({
                    content: `🚫 Passive **${banned}** thuộc nhóm Cây Thế Giới — không bán kèm pal.\nMuốn passive đó thì mua **cấy ghép ở sạp trong game**. Chọn passive khác rồi mua lại nhé (chưa bị trừ tiền).`,
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
                             `Nếu là pal raid (${(PAL_DATA.raidOnly || []).join(', ')}) thì không mua được — chỉ có thể trúng ở nút ngẫu nhiên.`,
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

            logDog('shop', userId, interaction.user.tag, -price, `mua pal ${pal.name} (tự chọn) — đơn #${order.id}`);
            writeLog('ADMIN', `[SHOP PAL] #${order.id} ${order.username} mua ${order.palName} (custom, ${price} Dogcoin) | linh hon: ${souls} | passive: ${passives}`);

            return interaction.editReply(
                `🎯 Đã đặt: **${pal.name}** 👑\n` +
                `• Bản Boss, ${PAL_SHOP.stars} sao, IV ${PAL_SHOP.ivs} cả 3 chỉ số\n` +
                `• Linh hồn ${PAL_SHOP.soulPercent}%: ${souls}\n` +
                `• Passive: ${passives}\n\n` +
                `Đã trừ **${price.toLocaleString()}** ${DOGCOIN_EMOJI} (còn **${getUserData(userId).points.toLocaleString()}**).\n` +
                `Mã đơn **#${order.id}** đã gửi cho admin — chờ admin tạo pal và giao trong game.`
            );
        }

        // ===== SHOP PAL NGẪU NHIÊN: người chơi điền passive/linh hồn cho đơn đã quay =====
        // Tiền đã trừ từ lúc quay; ở đây chỉ bổ sung lựa chọn rồi báo admin.
        if (interaction.customId.startsWith('shop_fill_modal_')) {
            const oid = parseInt(interaction.customId.slice('shop_fill_modal_'.length));
            const order = (dbCache._palOrders || []).find((o) => o.id === oid);
            if (!order) return interaction.reply({ content: '❌ Không tìm thấy đơn này.', ephemeral: true });
            if (order.userId !== userId) return interaction.reply({ content: '❌ Đơn này không phải của bạn.', ephemeral: true });
            if (order.souls || order.passives) {
                return interaction.reply({ content: `✅ Đơn #${oid} đã chọn rồi: linh hồn **${order.souls}** | passive **${order.passives}**`, ephemeral: true });
            }

            const souls = interaction.fields.getTextInputValue('shop_souls').trim().slice(0, 200);
            const passives = interaction.fields.getTextInputValue('shop_passives').trim().slice(0, 400);

            const banned = findBannedPassive(passives);
            if (banned) {
                // Không lưu gì — nút "Chọn passive & linh hồn" vẫn dùng lại được.
                return interaction.reply({
                    content: `🚫 Passive **${banned}** thuộc nhóm Cây Thế Giới — không bán kèm pal.\nMuốn passive đó thì mua **cấy ghép ở sạp trong game**. Bấm lại nút và chọn passive khác nhé.`,
                    ephemeral: true,
                });
            }

            order.souls = souls;
            order.passives = passives;
            writeLog('ADMIN', `[SHOP PAL] #${oid} ${order.username} chot lua chon cho ${order.palName}: linh hon ${souls} | passive ${passives}`);

            // Báo admin phần bổ sung. DM hỏng không sao — panel đã có đủ thông tin.
            (async () => {
                try {
                    const admin = await client.users.fetch(PAL_SHOP.adminDiscordId);
                    await admin.send(
                        `📝 **BỔ SUNG ĐƠN PAL** #${oid} — **${order.palName}** (\`${order.palCode}\`) của \`${order.username}\`\n` +
                        `• Linh hồn ${PAL_SHOP.soulPercent}%: ${souls}\n` +
                        `• Passive: ${passives}`
                    );
                } catch (e) {
                    writeLog('ADMIN', `[SHOP PAL] Khong DM duoc phan bo sung don #${oid}: ${e.message} — xem tren panel`);
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
            xsState.needsUpdate = true; // vòng lặp 5s vẽ lại bảng — không await edit kẻo trễ 3s
            const rate = kind === 'de' ? `trúng ăn ×${XS_DE_RATE}` : `mỗi nháy ăn ×${XS_LO_RATE}`;
            return interaction.reply({
                content: `💸 Đã đánh ${kindLabel} số **${num}** — **${bucket[num].toLocaleString()}** ${DOGCOIN_EMOJI} (${rate}). Số dư còn **${getUserData(userId).points.toLocaleString()}** ${DOGCOIN_EMOJI}`,
                ephemeral: true,
            });
        }

        // (Nút 📛 tự đặt tên đã bỏ: người chơi tự đặt được tên là tự nhận tên nhân
        //  vật NGƯỜI KHÁC rồi bấm 💬 rút trộm túi họ. Giờ CHỈ admin liên kết tên
        //  ở panel, tab 🎮 Palworld & Dogcoin — ghi vào userData.ingameName.)

        // ===== NẠP (game -> Discord) TỰ ĐỘNG qua cầu SFTP =====
        // Luật tiền (README): TRỪ ITEM TRONG GAME TRƯỚC, mod xác nhận trừ đủ đúng số
        // (`took` === amt) rồi mới cộng ví. Mod trả ERROR là CHẮC CHẮN chưa mất gì
        // (thiếu tiền nó không trừ, trừ lệch nó tự hoàn — xem main.lua) -> chỉ báo
        // người chơi. Riêng timeout/không phản hồi là KHÔNG CHẮC -> đơn cho admin
        // đối chiếu results.log, KHÔNG cộng ví trước.
        if (interaction.customId === 'nap_modal') {
            const amt = parseInt(interaction.fields.getTextInputValue('nap_input_amount'));
            if (isNaN(amt) || amt <= 0) {
                return interaction.reply({ content: '❌ Số Dog Coin không hợp lệ!', ephemeral: true });
            }
            const gameName = (getUserData(userId).ingameName || '').trim();
            if (!gameName) {
                return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game — nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true }); // take mất 5-20s, quá deadline 3s của Discord
            writeLog('ADMIN', `[NẠP TỰ ĐỘNG] ${interaction.user.tag} chuyển ${amt.toLocaleString()} Dog Coin từ game ("${gameName}") ra Discord`);

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
                return interaction.editReply(`↩️ Không thấy **${gameName}** trong game (chưa online hoặc sai tên) — chưa trừ gì cả.\nVào game rồi bấm lại; nếu sai tên thì nhắn **admin** sửa liên kết.`);
            }
            const thieu = /khong du/i.test(msg) && msg.match(/trong game co (\d+)/);
            if (thieu) {
                return interaction.editReply(`❌ Trong túi bạn chỉ có **${Number(thieu[1]).toLocaleString()}** Dog Coin, không đủ ${amt.toLocaleString()} — chưa trừ gì cả.\n(Chỉ tính Dog Coin **trong túi** — để trong hòm thì cầm ra túi trước nhé.)`);
            }
            if (/ERROR/.test(msg) && !/LUA ERROR/i.test(msg)) {
                // Mod từ chối rõ ràng -> trong game không mất gì
                return interaction.editReply(`❌ Không trừ được Dog Coin trong game — chưa mất gì cả. Mod báo: \`${msg.slice(0, 250)}\``);
            }
            // Không rõ item đã bị trừ trong game hay chưa -> đơn cho admin, KHÔNG cộng ví
            const req = createTicket({ kind: 'to-discord', userId, username: interaction.user.username, ingameName: gameName, amount: amt });
            writeLog('ADMIN', `[NẠP TỰ ĐỘNG LỖI] #${req.id} ${interaction.user.tag} ${amt} Dog Coin từ "${gameName}" | ${msg || 'timeout'} — xem results.log: item ĐÃ trừ thì DUYỆT (cộng ví), chưa trừ thì TỪ CHỐI`);
            sendTicketToAdmin(req).catch(() => {});
            return interaction.editReply(`⏳ Chưa xác nhận được với server game (đơn **#${req.id}**). Admin sẽ đối chiếu: Dog Coin trong game đã bị trừ thì ví Discord được cộng đủ, chưa trừ thì hủy đơn — không mất tiền đâu.`);
        }

        // (Mua Lõi Văn Minh / cấy ghép / đổi vàng đã bỏ khỏi Discord — bán ở sạp trong game.)

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
                return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game — nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true }); // give mất 5-20s, quá deadline 3s của Discord
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
                return interaction.editReply(`↩️ Không thấy **${gameName}** trong game (chưa online hoặc sai tên) — đã hoàn **${amt.toLocaleString()}** ${DOGCOIN_EMOJI}.\nVào game rồi bấm rút lại; nếu sai tên thì nhắn **admin** sửa liên kết.`);
            }
            // Không rõ đã giao hay chưa -> đơn cho admin, KHÔNG tự hoàn
            const req = createTicket({ kind: 'to-game', userId, username: interaction.user.username, ingameName: gameName, amount: amt });
            writeLog('ADMIN', `[RÚT TỰ ĐỘNG LỖI] #${req.id} ${interaction.user.tag} ${amt} Dogcoin -> "${gameName}" | ${msg || 'timeout'} — kiểm tra results.log rồi duyệt/hoàn`);
            sendTicketToAdmin(req).catch(() => {});
            return interaction.editReply(`⏳ Chưa xác nhận được với server game (đơn **#${req.id}**). Ví đã trừ; admin sẽ kiểm tra — nếu chưa nhận được trong game thì admin hoàn lại, đừng lo mất tiền.`);
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
                `🌐 **Chơi trên web — nhanh, không lag Discord:**\n${WEB_PLAY_URL}\n\n` +
                `🎲 **Tài Xỉu** — đặt cược + nặn xí ngầu\n💣 **Dò Mìn** — lưới 25 ô, đào tới đâu ăn tới đó\n\n` +
                `🆔 Discord ID: \`${userId}\`\n🔑 Mã PIN: **${userData.webPin}**\n\n` +
                `Vào web nhập ID + PIN là chơi được. PIN dùng mãi, bấm lại nút này để xem lại. ĐỪNG đưa PIN cho ai — ai có PIN là tiêu được ví bạn!`,
            ephemeral: true,
        });
    }

    if (interaction.customId === 'bj_link') {
        const userData = getUserData(userId);
        userData.name = userData.name || interaction.user.username;
        if (!userData.webPin) { userData.webPin = String(Math.floor(100000 + Math.random() * 900000)); saveDbNow(); }
        return interaction.reply({
            content:
                `🂡 **Blackjack (Xì Dách) — vào sòng web rồi bấm tab 🂡 Blackjack (xoay ngang cho dễ):**\n${WEB_PLAY_URL}\n\n` +
                `🆔 Discord ID: \`${userId}\`\n🔑 Mã PIN: **${userData.webPin}**\n\n` +
                `Đăng nhập 1 lần là chơi được hết các game (PIN dùng chung). ĐỪNG đưa PIN cho ai!`,
            ephemeral: true,
        });
    }

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
                // label Discord tối đa 45 ký tự — format gọn + cắt cho chắc
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
    if (interaction.customId === 'rut_open') {
        if (!(getUserData(userId).ingameName || '').trim()) {
            return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game — nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
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
            return interaction.reply({ content: '🔗 Ví của bạn chưa được liên kết tên nhân vật trong game — nhắn **admin** liên kết giúp (chỉ cần 1 lần).', ephemeral: true });
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

    // ======== SHOP PAL: TỰ CHỌN (3000) — modal chọn pal + passive + linh hồn ========
    if (interaction.customId === 'shop_custom') {
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
            .setTitle(`Chọn pal — ${price.toLocaleString()}`);

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

    // ======== SHOP PAL: NGẪU NHIÊN (1000) — quay TRƯỚC, chọn passive/linh hồn SAU ========
    // Trừ tiền + quay ngay khi bấm. Người chơi thấy trúng con gì rồi mới bấm nút
    // "Chọn passive & linh hồn" để điền (shop_fill_<id> bên dưới).
    if (interaction.customId === 'shop_random') {
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

        logDog('shop', userId, interaction.user.tag, -price, `mua pal ${pal.name} (ngẫu nhiên) — đơn #${order.id}`);
        writeLog('ADMIN', `[SHOP PAL] #${order.id} ${order.username} quay trung ${order.palName} (random, ${price} Dogcoin) — cho chon passive/linh hon`);

        // Đăng công khai kết quả quay cho cả server thấy (không chặn luồng trả lời)
        const gachaCh = dbCache._gachaChannelId;
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
                `Đã trừ **${price.toLocaleString()}** ${DOGCOIN_EMOJI} (còn **${getUserData(userId).points.toLocaleString()}**) — mã đơn **#${order.id}**.\n\n` +
                `👇 Bấm nút để chọn **${PAL_SHOP.passiveSlots} passive + ${PAL_SHOP.soulSlots} dòng linh hồn ${PAL_SHOP.soulPercent}%** cho nó.`,
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`shop_fill_${order.id}`).setLabel('Chọn passive & linh hồn').setEmoji('📝').setStyle(ButtonStyle.Primary)
            )],
        });
    }

    // ======== SHOP PAL: điền passive/linh hồn cho đơn random đã quay ========
    if (interaction.customId.startsWith('shop_fill_')) {
        const oid = parseInt(interaction.customId.slice('shop_fill_'.length));
        const order = (dbCache._palOrders || []).find((o) => o.id === oid);
        if (!order) return interaction.reply({ content: '❌ Không tìm thấy đơn này.', ephemeral: true });
        if (order.userId !== userId) return interaction.reply({ content: '❌ Đơn này không phải của bạn.', ephemeral: true });
        if (order.souls || order.passives) return interaction.reply({ content: `✅ Đơn #${oid} đã chọn rồi: linh hồn **${order.souls}** | passive **${order.passives}**`, ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`shop_fill_modal_${oid}`)
            .setTitle(`${order.palName} — đơn #${oid}`.slice(0, 45));
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

    // ======== NÚT BẦU CUA ========
    if (interaction.customId.startsWith('bc_m_')) {
        const mascotId = interaction.customId.split('_')[2];
        userBCSelections[userId] = { mascotId };

        bcState.activeMascot = mascotId;
        bcState.needsUpdate = true; // vòng lặp 1s tự vẽ lại — không await edit kẻo trễ 3s

        return interaction.reply({ content: `✅ Đã chọn **${MASCOTS.find(m => m.id === mascotId).name}**. Nhấn nút số Dogcoin ở dưới để chốt!`, ephemeral: true });
    }
    
    if (interaction.customId === 'bc_a_custom') {
        const sel = userBCSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Bạn phải bấm chọn con vật trước!", ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId('bc_modal_custom')
            .setTitle('Nhập Số Dogcoin Đặt');

        const amountInput = new TextInputBuilder()
            .setCustomId('bc_input_amount')
            .setLabel('Ví dụ: 15000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('bc_a_')) {
        if (bcState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
        const sel = userBCSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Chọn con vật trước!", ephemeral: true });

        let amt = interaction.customId === 'bc_a_all' ? getUserData(userId).points : parseInt(interaction.customId.split('_')[2]);
        if (amt <= 0 || getUserData(userId).points < amt) return interaction.reply({ content: "❌ Bạn không đủ Dogcoin để đặt mức này!", ephemeral: true });
        
        updatePoints(userId, -amt);
        bcState.bets.push({ userId, username: interaction.user.username, mascotId: sel.mascotId, amount: amt });

        userBCSelections[userId] = null;
        bcState.activeMascot = null;
        bcState.needsUpdate = true; // reply ngay, vòng lặp 1s vẽ lại bảng

        return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()}** ${DOGCOIN_EMOJI} vào **${MASCOTS.find(m => m.id === sel.mascotId).name}**!`, ephemeral: true });
    }

    if (interaction.customId === 'bc_soicau') {
        if (bcState.history.length === 0) return interaction.reply({ content: "Chưa có lịch sử phiên nào!", ephemeral: true });
        const hisDesc = bcState.history.slice(0, 10).map(h => `Phiên ${padId(h.gameId)}: ${h.resultEmoji} (${h.result})`).join('\n');
        const emb = new EmbedBuilder()
            .setTitle('🔮 Soi Cầu Bầu Cua - Lịch sử 10 phiên gần nhất')
            .setDescription(hisDesc)
            .setFooter({ text: 'Cờ bạc có thể gây nghiện - Chơi có trách nhiệm' })
            .setColor(0x2b2d31);
        return interaction.reply({ embeds: [emb], ephemeral: true });
    }

    // ======== NÚT TÀI XỈU ========
    if (interaction.customId.startsWith('tx_c_')) {
        const choice = interaction.customId.split('_')[2];
        userTXSelections[userId] = { choice };

        txState.activeChoice = choice;
        txState.needsUpdate = true; // vòng lặp 1s tự vẽ lại — không await edit kẻo trễ 3s

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

    // (Nặn xí ngầu đã chuyển lên web — kéo tờ giấy trong webplay.js, không còn nút Discord.)

    if (interaction.customId.startsWith('tx_a_') && interaction.customId !== 'tx_a_custom') {
        if (txState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
        const sel = userTXSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Chọn cửa trước!", ephemeral: true });

        let amt = interaction.customId === 'tx_a_all' ? getUserData(userId).points : parseInt(interaction.customId.split('_')[2]);
        if (amt <= 0 || getUserData(userId).points < amt) return interaction.reply({ content: "❌ Bạn không đủ Dogcoin để đặt mức này!", ephemeral: true });
        
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
    userBCSelections = {};
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
        blackjackTable.refundOnShutdown(); // hoàn cược ván blackjack đang chơi trước khi lưu
    } catch (e) { }
    try {
        syncCache();
        fs.writeFileSync(DATA_FILE, JSON.stringify(dbCache, null, 2));
        writeLog('SYSTEM', `[SHUTDOWN] ${signal} - đã lưu database trước khi thoát`);
    } catch (e) {
        console.error('[SHUTDOWN] Lỗi lưu database:', e.message);
    }
    process.exit(0);
}
process.on('SIGINT', () => flushAndExit('SIGINT'));
process.on('SIGTERM', () => flushAndExit('SIGTERM'));

client.login(TOKEN);        
