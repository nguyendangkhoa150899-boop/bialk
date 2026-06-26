require('dotenv').config();
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const fs = require('fs');
const { startPanel } = require('./panel');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const TOKEN = process.env.TOKEN;
const DATA_FILE = './database.json';

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

setInterval(() => {
    dbCache._minesHistory = minesHistory;
    dbCache._txDashHistory = txDashHistory;
    dbCache._bcDashHistory = bcDashHistory;
    fs.writeFile(DATA_FILE, JSON.stringify(dbCache, null, 2), (err) => {
        if (err) writeLog('SYSTEM', `[LỖI DATABASE] Không thể lưu file database: ${err.message}`);
    });
}, 10000);

function getUserData(userId) {
    if (!dbCache[userId]) {
        dbCache[userId] = { points: 50000000000, lastDaily: 0 };
    } else if (typeof dbCache[userId] === 'number') {
        dbCache[userId] = { points: dbCache[userId], lastDaily: 0 };
    }
    return dbCache[userId];
}

function updatePoints(userId, amount) {
    const data = getUserData(userId);
    data.points += amount;
}

// Hiển thị số ván dạng 5 chữ số: 1 -> #00001
const padId = (n) => String(n).padStart(5, '0');

// --- CONFIG BẦU CUA ---
const MASCOTS = [
    { id: 'hu', name: 'Hổ', emoji: '🐯' }, { id: 'cua', name: 'Cua', emoji: '🦀' },
    { id: 'tom', name: 'Tôm', emoji: '🦞' }, { id: 'ca', name: 'Cá', emoji: '🐟' },
    { id: 'ga', name: 'Gà', emoji: '🐓' }, { id: 'nai', name: 'Nai', emoji: '🦌' }
];
let bcState = {
    status: 'betting',
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

// --- CONFIG TÀI XỈU (LỚN NHỎ) ---
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

// Lịch sử các ván dò mìn (để hiển thị trên web panel)
let minesHistory = [];

// Lịch sử dò mìn giữ qua mỗi lần restart (kết quả người chơi).
if (dbCache._minesHistory) minesHistory = dbCache._minesHistory;

// Lịch sử DASHBOARD (web): CHỈ ván có người đặt, LƯU VĨNH VIỄN vào database.json
// (giữ qua restart/deploy, KHÔNG tự xóa). Khác với soi cầu Discord ở RAM bên dưới.
let txDashHistory = Array.isArray(dbCache._txDashHistory) ? dbCache._txDashHistory : [];
let bcDashHistory = Array.isArray(dbCache._bcDashHistory) ? dbCache._bcDashHistory : [];

// Lớn Nhỏ & Bầu Cua: MỖI LẦN KHỞI ĐỘNG BOT đếm lại từ #0001 và làm mới SOI CẦU (RAM).
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

const TX_CHOICES = {
    'tai': { name: '11-18' },
    'xiu': { name: '3-10' },
    'chan': { name: 'CHẴN' },
    'le': { name: 'LẺ' }
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
const TOTAL_TILES = 24;
const RTP = 1.0; 

const CUSTOM_START = {
    6: 4.0, 
    8: 6.0   
};

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
    return Math.floor(multi * 100) / 100;
}

const getInfo = (diamonds, numMines) => {
    let mathCurrent = calculateMulti(diamonds === 0 ? 1 : diamonds, numMines);
    let maxDiamonds = TOTAL_TILES - numMines;
    let mathNext = diamonds < maxDiamonds ? calculateMulti(diamonds + 1, numMines) : mathCurrent;
    
    let boostRatio = 1; 
    if (CUSTOM_START[numMines]) {
        let mathStart1 = calculateMulti(1, numMines); 
        boostRatio = CUSTOM_START[numMines] / mathStart1; 
    }

    if (diamonds === 0) {
        return { 
            multi: 1, 
            nextMulti: Math.floor((mathCurrent * boostRatio) * 100) / 100 
        };
    }
    
    return { 
        multi: Math.floor((mathCurrent * boostRatio) * 100) / 100, 
        nextMulti: Math.floor((mathNext * boostRatio) * 100) / 100 
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

// --- ĐĂNG KÝ LỆNH SLASH ---
const commands = [
    new SlashCommandBuilder()
        .setName('domin')
        .setDescription('Bắt đầu ván dò mìn')
        .addSubcommand(sub => sub.setName('all').setDescription('Cược toàn bộ số dư')
            .addIntegerOption(opt => opt.setName('so_min').setDescription('Số mìn (1-23)').setMinValue(1).setMaxValue(23).setRequired(true))
        )
        .addSubcommand(sub => sub.setName('point').setDescription('Tùy chọn số point cược')
            .addIntegerOption(opt => opt.setName('cuoc').setDescription('Số point đặt').setRequired(true))
            .addIntegerOption(opt => opt.setName('so_min').setDescription('Số mìn (1-23)').setMinValue(1).setMaxValue(23).setRequired(true))
        ),
    new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví của bạn'),
    new SlashCommandBuilder().setName('diemdanh').setDescription('Nhận 50.000.000.000 point mỗi 24 giờ'),
    new SlashCommandBuilder().setName('chuyentien').setDescription('Chuyển point')
        .addUserOption(opt => opt.setName('nguoi').setDescription('Người nhận point').setRequired(true))
        .addIntegerOption(opt => opt.setName('sotien').setDescription('Số point muốn chuyển').setRequired(true)),
    new SlashCommandBuilder().setName('addtien').setDescription('Admin cộng point')
        .addUserOption(opt => opt.setName('user').setDescription('Người nhận').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Số point cộng').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('trutien').setDescription('Admin trừ point')
        .addUserOption(opt => opt.setName('user').setDescription('Người bị trừ').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Số point trừ').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

client.once('ready', async (c) => {
    writeLog('SYSTEM', `✅ Bot ${c.user.tag} online!`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    } catch (e) { writeLog('SYSTEM', `[LỖI ĐĂNG KÝ LỆNH] ${e.message}`); }
    runBầuCuaLoop();
    runTaiXiuLoop();

    // Khởi động web panel can thiệp kết quả
    try {
        startPanel({
            port: parseInt(process.env.PANEL_PORT) || 3001,
            password: process.env.PANEL_PASSWORD || 'Aa123456789!@',
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
            writeLog,
            startBC: async (channelId) => { const ch = await client.channels.fetch(channelId); await startBaucua(ch); return ch.name; },
            stopBC: () => stopBaucua(),
            startTX: async (channelId) => { const ch = await client.channels.fetch(channelId); await startLonnho(ch); return ch.name; },
            stopTX: () => stopLonnho(),
            deleteChat: async (channelId) => { const ch = await client.channels.fetch(channelId); return await deleteBotChat(ch); },
        });
        writeLog('SYSTEM', `🌐 Web panel chạy ở cổng ${parseInt(process.env.PANEL_PORT) || 3001}`);
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
            .map(b => `• **${b.username}**: ${MASCOTS.find(m => m.id === b.mascotId).emoji} **${b.amount.toLocaleString()} point**`)
            .join('\n');
    } else {
        desc += "*Chưa có ai đặt*";
    }
    desc = desc.trimEnd();
    desc += `\n\n${customStatus || "👉 Chọn con vật rồi chọn số point đặt!"}`;

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
        { id: '100', label: '100' },
        { id: '200', label: '200' },
        { id: '500', label: '500' },
        { id: '1000', label: '1000' }
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
    const winLog = Object.values(winAgg).map(w => `• <@${w.userId}> thắng **${w.amount.toLocaleString()} point**`).join('\n');

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

// --- UI TÀI XỈU (LỚN NHỎ) ---
function getTXMessageData(customStatus = null) {
    const lockTime = txState.targetTime - 5;

    let desc = `⏳ **Mở bát:** <t:${txState.targetTime}:R>\n\n`;

    if (txState.lastGameInfo) {
        desc += `🔙 **Kết quả vòng trước (#${padId(txState.lastGameInfo.gameId)}):** ${txState.lastGameInfo.result}\n`;
        desc += `💸 **Người đặt vòng trước:** ${txState.lastGameInfo.betDetails}\n\n`;
    }

    desc += `📝 **Người đặt hiện tại:**\n`;

    const groups = { 'tai': [], 'xiu': [], 'chan': [], 'le': [] };
    txState.bets.forEach(b => groups[b.choice].push(b));

    let hasBets = false;
    ['tai', 'xiu', 'chan', 'le'].forEach(c => {
        if (groups[c].length > 0) {
            hasBets = true;
            desc += `**${TX_CHOICES[c].name}:**\n`;
            // Gộp cược trùng của cùng 1 người vào cùng 1 cửa
            const byUser = {};
            groups[c].forEach(b => {
                if (!byUser[b.userId]) byUser[b.userId] = { username: b.username, amount: 0 };
                byUser[b.userId].amount += b.amount;
            });
            Object.values(byUser).forEach(u => desc += `• **${u.username}**: ${u.amount.toLocaleString()} point\n`);
        }
    });
    if (!hasBets) desc += "*Chưa có ai đặt*";

    desc = desc.trimEnd();
    desc += `\n\n${customStatus || "👉 Chọn cửa cược rồi chọn số point đặt!"}`;

    const embed = new EmbedBuilder()
        .setTitle(`🎲 LỚN NHỎ LIVE - Game #${padId(txState.gameId)}`)
        .setColor(txState.status === 'betting' ? 0x2ecc71 : 0xe74c3c)
        .setDescription(desc);

    const choiceRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tx_c_xiu').setLabel('3-10').setEmoji('🔴').setStyle(txState.activeChoice === 'xiu' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(txState.status !== 'betting'),
        new ButtonBuilder().setCustomId('tx_c_tai').setLabel('11-18').setEmoji('🟢').setStyle(txState.activeChoice === 'tai' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(txState.status !== 'betting'),
        new ButtonBuilder().setCustomId('tx_c_chan').setLabel('CHẴN').setEmoji('🔵').setStyle(txState.activeChoice === 'chan' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(txState.status !== 'betting'),
        new ButtonBuilder().setCustomId('tx_c_le').setLabel('LẺ').setEmoji('🟣').setStyle(txState.activeChoice === 'le' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(txState.status !== 'betting'),
        new ButtonBuilder().setCustomId('tx_soicau').setLabel('Soi Cầu').setEmoji('🕵️').setStyle(ButtonStyle.Secondary)
    );

    const amountRow1 = new ActionRowBuilder().addComponents(
        ['100', '200', '500', '1000'].map(amt =>
            new ButtonBuilder().setCustomId(`tx_a_${amt}`).setLabel(amt).setStyle(ButtonStyle.Primary).setDisabled(txState.status !== 'betting')
        )
    );

    const amountRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tx_a_custom').setLabel('💰 Tùy Chọn').setStyle(ButtonStyle.Success).setDisabled(txState.status !== 'betting'),
        new ButtonBuilder().setCustomId('tx_a_all').setLabel('💸 All In').setStyle(ButtonStyle.Danger).setDisabled(txState.status !== 'betting')
    );

    return { embeds: [embed], components: [choiceRow, amountRow1, amountRow2] };
}

async function updateTXMessage(customStatus = null) {
    if (!txState.message) return;
    const data = getTXMessageData(customStatus);
    await txState.message.edit(data).catch((e) => { writeLog('SYSTEM', `[LỖI UPDATE TX BẢNG CƯỢC] ${e.message}`); });
}

// --- VÒNG LẶP TÀI XỈU (LỚN NHỎ) ---
function runTaiXiuLoop() {
    setInterval(async () => {
        // Auto-recover nếu message bị mất do timeout mạng
        if (!txState.message && txState.channel && !txState.isProcessing) {
            txState.isProcessing = true;
            txState.processingStart = Date.now();
            txState.targetTime = Math.floor(Date.now() / 1000) + 61;
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
                txState.targetTime = Math.floor(Date.now() / 1000) + 61;
                txState.message = null;
            }
            return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const lockTime = txState.targetTime - 5;

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
                                txState.targetTime = Math.floor(Date.now() / 1000) + 61;
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
                txState.targetTime = Math.floor(Date.now() / 1000) + 61;
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

async function finishTXGame(gameId, bets) {
    let d1, d2, d3;
    if (txState.forcedResult) {
        [d1, d2, d3] = txState.forcedResult.split(',').map(Number);
        txState.forcedResult = null;
    } else {
        d1 = Math.floor(Math.random() * 6) + 1;
        d2 = Math.floor(Math.random() * 6) + 1;
        d3 = Math.floor(Math.random() * 6) + 1;
    }
    const sum = d1 + d2 + d3;

    const isTai = sum >= 11;
    const isChan = sum % 2 === 0;

    const resultTX = isTai ? 'tai' : 'xiu';
    const resultCL = isChan ? 'chan' : 'le';

    let prevBetsDisplay = bets.map(b => `${b.username} (${b.amount} -> ${TX_CHOICES[b.choice].name})`).join(', ');

    // Gộp tiền thắng theo người (1 người đặt nhiều lần / nhiều cửa -> 1 dòng)
    const winAgg = {};
    bets.forEach(b => {
        if (b.choice === resultTX || b.choice === resultCL) {
            const win = b.amount * 2;
            updatePoints(b.userId, win);
            if (!winAgg[b.userId]) winAgg[b.userId] = { userId: b.userId, name: b.username, amount: 0 };
            winAgg[b.userId].amount += win;
        }
    });
    const winners = Object.values(winAgg).map(w => ({ name: w.name, amount: w.amount }));
    const winLog = Object.values(winAgg).map(w => `• <@${w.userId}> thắng **${w.amount.toLocaleString()} point**`).join('\n');

    const txIcon = isTai ? '11-18 🔺' : '3-10 🔻';
    const clIcon = isChan ? 'CHẴN 🔵' : 'LẺ 🟣';
    const txLogText = isTai ? '11-18' : '3-10';
    const clLogText = isChan ? 'CHẴN' : 'LẺ';
    writeLog('RESULT', `[KẾT QUẢ TÀI XỈU] Game #${gameId}: ${d1}-${d2}-${d3} (Tổng ${sum} | ${txLogText} | ${clLogText})`);

    if (bets.length > 0) {
        let betLogDetails = bets.map(b => `${b.username} đặt ${b.amount} vào ${TX_CHOICES[b.choice].name}`).join(' | ');
        writeLog('BET', `[CƯỢC TÀI XỈU] Game #${gameId} | Đặt: ${betLogDetails} | KQ: ${d1}-${d2}-${d3} (${sum})`);
    }

    const resEmb = new EmbedBuilder()
        .setTitle(`🎲 KẾT QUẢ SÒNG LỚN NHỎ`)
        .setColor(0x2b2d31)
        .setDescription(`**Game #${padId(gameId)}**\n\n` +
                        `🎲 **Xúc xắc:** ${DICE_EMOJIS[d1]} ${DICE_EMOJIS[d2]} ${DICE_EMOJIS[d3]}\n` +
                        `📊 **Tổng:** ${sum}\n` +
                        `🎯 **Kết quả:** ${txIcon} | ${clIcon}\n\n` +
                        `🏆 **Người thắng:**\n${winLog || "🚫 \`Không ai thắng ván này!\`"}`)
        .setFooter({ text: 'Game tiếp theo sẽ bắt đầu sau 55 giây...' });

    const sentMsg = await txState.channel.send({ embeds: [resEmb] }).catch((e) => { writeLog('SYSTEM', `[LỖI GỬI KQ TX] ${e.message}`); return null; });

    txState.lastGameInfo = {
        gameId,
        result: `${DICE_EMOJIS[d1]} ${DICE_EMOJIS[d2]} ${DICE_EMOJIS[d3]} (Tổng: ${sum}) | ${txIcon} ${clIcon}`,
        betDetails: prevBetsDisplay || "Không có ai đặt"
    };
    // Gộp cược trùng để lưu gọn (rỗng nếu không ai đặt).
    const betAgg = {};
    bets.forEach(b => {
        const k = `${b.userId}_${b.choice}`;
        if (!betAgg[k]) betAgg[k] = { name: b.username, choice: TX_CHOICES[b.choice].name, amount: 0 };
        betAgg[k].amount += b.amount;
    });
    const histEntry = {
        gameId,
        dice: [d1, d2, d3],
        sum,
        tx: isTai ? '11-18' : '3-10',
        cl: isChan ? 'CHẴN' : 'LẺ',
        bets: Object.values(betAgg),
        winners,
        time: new Date().toLocaleTimeString('vi-VN')
    };
    // Soi cầu Discord: lưu MỌI ván (cầu liền mạch), RAM, giữ 1000 ván, mất khi restart.
    txState.history.unshift(histEntry);
    if (txState.history.length > 1000) txState.history.pop();
    // Dashboard web: CHỈ ván có người đặt, lưu vĩnh viễn vào database.json, KHÔNG xóa.
    if (bets.length > 0) txDashHistory.unshift(histEntry);

    return sentMsg;
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
    txState.targetTime = Math.floor(Date.now() / 1000) + 61;
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
    // Ghi lại tên hiển thị cho ví đã tồn tại (để web panel show tên thay vì ID)
    if (dbCache[userId] && typeof dbCache[userId] === 'object') {
        dbCache[userId].name = interaction.user.username;
    }

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'diemdanh') {
            const userData = getUserData(userId);
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;

            if (now - userData.lastDaily < cooldown) {
                const remaining = cooldown - (now - userData.lastDaily);
                const hours = Math.floor(remaining / (60 * 60 * 1000));
                const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
                return interaction.reply({ content: `⏳ Bạn đã điểm danh rồi! Hãy quay lại sau **${hours} giờ ${mins} phút**.`, ephemeral: true });
            }

            updatePoints(userId, 50000000000);
            userData.lastDaily = now; 
            writeLog('ADMIN', `[ĐIỂM DANH] ${interaction.user.tag} nhận 50.000.000.000 point | Số dư: ${getUserData(userId).points.toLocaleString()}`);
            return interaction.reply(`🎁 **Điểm danh thành công!** Bạn nhận được **50.000.000.000 point**. Số dư mới: **${userData.points.toLocaleString()} point**`);
        }

        if (interaction.commandName === 'sodu') {
            const points = getUserData(userId).points;
            const embed = new EmbedBuilder()
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .setTitle("💳 VÍ POINT CỦA BẠN")
                .setDescription(`Số dư hiện tại: **${points.toLocaleString()} point**`)
                .setColor(0x00ff00);
            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'addtien') {
            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            updatePoints(target.id, amount);
            writeLog('ADMIN', `[CỘNG TIỀN] Admin ${interaction.user.tag} cộng ${amount} point cho ${target.tag}`);
            return interaction.reply(`✅ Đã cộng **${amount.toLocaleString()} point** cho <@${target.id}>. Số dư mới: **${getUserData(target.id).points.toLocaleString()} point**`);
        }

        if (interaction.commandName === 'trutien') {
            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            updatePoints(target.id, -amount);
            writeLog('ADMIN', `[TRỪ TIỀN] Admin ${interaction.user.tag} trừ ${amount} point của ${target.tag}`);
            return interaction.reply(`⚠️ Đã trừ **${amount.toLocaleString()} point** từ <@${target.id}>. Số dư mới: **${getUserData(target.id).points.toLocaleString()} point**`);
        }

        if (interaction.commandName === 'chuyentien') {
            const receiver = interaction.options.getUser('nguoi');
            const amount = interaction.options.getInteger('sotien');
            if (receiver.id === userId) return interaction.reply({ content: "❌ Không thể tự chuyển cho mình!", ephemeral: true });
            if (amount <= 0) return interaction.reply({ content: "❌ Số point không hợp lệ!", ephemeral: true });
            
            const senderData = getUserData(userId);
            if (senderData.points < amount) return interaction.reply({ content: `❌ Bạn không đủ point!`, ephemeral: true });
            
            updatePoints(userId, -amount); 
            updatePoints(receiver.id, amount);
            writeLog('ADMIN', `[CHUYỂN TIỀN] ${interaction.user.tag} → ${receiver.tag} | ${amount.toLocaleString()} point`);
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle("💸 GIAO DỊCH").setDescription(`✅ <@${userId}> đã chuyển **${amount.toLocaleString()} point** cho <@${receiver.id}>!`).setColor(0x00aeef)] });
        }

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
            if (userData.points < bet) return interaction.reply({ content: `❌ Bạn không đủ point!`, ephemeral: true });

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
                    desc = `👤 Người chơi: <@${userId}>\n💣 Số mìn: **${game.totalMines}**\n💰 Mức đặt: **${bet.toLocaleString()} point**\n💳 Số dư: **${liveBalance.toLocaleString()} point**\n\n💎 Kim cương: **${diamonds}/${maxDiamonds}**\n🔥 Hệ số hiện tại: **x${multi}**\n💵 Đang có: **${currentTotalWin.toLocaleString()} point**\n`;
                    desc += diamonds < maxDiamonds ? `\n👉 Mở ô tiếp theo sẽ đạt: **x${nextMulti}** (*${nextTotalWin.toLocaleString()} point*)` : `\nĐã đạt mức tối đa!`;
                } else if (status === "won") {
                    desc = `🎉 **THẮNG RỒI!**\nBạn nhận được **${currentTotalWin.toLocaleString()} point** (Hệ số: **x${multi}**)\n💰 Số dư mới: **${liveBalance.toLocaleString()} point**`;
                } else if (status === "lost") {
                    desc = `💥 **BÙM!** Trúng mìn rồi!\nBạn mất **${bet.toLocaleString()} point**\n💰 Số dư còn lại: **${liveBalance.toLocaleString()} point**`;
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
                        if (game.revealed.includes(idx)) btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
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
                    if (game.revealed.includes(idx)) btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
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
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'bc_modal_custom') {
            if (bcState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
            const sel = userBCSelections[userId];
            if (!sel) return interaction.reply({ content: "❌ Bạn chưa chọn con vật!", ephemeral: true });

            const amountStr = interaction.fields.getTextInputValue('bc_input_amount');
            const amt = parseInt(amountStr);

            if (isNaN(amt) || amt <= 0 || getUserData(userId).points < amt) {
                return interaction.reply({ content: "❌ Số point không hợp lệ hoặc bạn không đủ point!", ephemeral: true });
            }

            updatePoints(userId, -amt);
            bcState.bets.push({ userId, username: interaction.user.username, mascotId: sel.mascotId, amount: amt });

            userBCSelections[userId] = null;
            bcState.activeMascot = null; 
            bcState.needsUpdate = true;
            await updateBCMessage();

            return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()} point** vào **${MASCOTS.find(m => m.id === sel.mascotId).name}**!`, ephemeral: true });
        }

        if (interaction.customId === 'tx_modal_custom') {
            if (txState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
            const sel = userTXSelections[userId];
            if (!sel) return interaction.reply({ content: "❌ Bạn chưa chọn cửa cược!", ephemeral: true });

            const amountStr = interaction.fields.getTextInputValue('tx_input_amount');
            const amt = parseInt(amountStr);

            if (isNaN(amt) || amt <= 0 || getUserData(userId).points < amt) {
                return interaction.reply({ content: "❌ Số point không hợp lệ hoặc bạn không đủ point!", ephemeral: true });
            }

            updatePoints(userId, -amt);
            txState.bets.push({ userId, username: interaction.user.username, choice: sel.choice, amount: amt });

            userTXSelections[userId] = null;
            txState.activeChoice = null; 
            txState.needsUpdate = true;
            await updateTXMessage();

            return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()} point** vào **${TX_CHOICES[sel.choice].name}**!`, ephemeral: true });
        }
    }

    if (!interaction.isButton()) return;
    
    // ======== NÚT BẦU CUA ========
    if (interaction.customId.startsWith('bc_m_')) {
        const mascotId = interaction.customId.split('_')[2];
        userBCSelections[userId] = { mascotId };
        
        bcState.activeMascot = mascotId;
        await updateBCMessage();

        return interaction.reply({ content: `✅ Đã chọn **${MASCOTS.find(m => m.id === mascotId).name}**. Nhấn nút số point ở dưới để chốt!`, ephemeral: true });
    }
    
    if (interaction.customId === 'bc_a_custom') {
        const sel = userBCSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Bạn phải bấm chọn con vật trước!", ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId('bc_modal_custom')
            .setTitle('Nhập Số Point Đặt');

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
        if (amt <= 0 || getUserData(userId).points < amt) return interaction.reply({ content: "❌ Bạn không đủ point để đặt mức này!", ephemeral: true });
        
        updatePoints(userId, -amt);
        bcState.bets.push({ userId, username: interaction.user.username, mascotId: sel.mascotId, amount: amt });

        userBCSelections[userId] = null;
        bcState.activeMascot = null; 
        bcState.needsUpdate = true; 
        await updateBCMessage();
        
        return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()} point** vào **${MASCOTS.find(m => m.id === sel.mascotId).name}**!`, ephemeral: true });
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
        await updateTXMessage();

        return interaction.reply({ content: `✅ Đã chọn **${TX_CHOICES[choice].name}**. Nhấn nút số point ở dưới để chốt!`, ephemeral: true });
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
            .setTitle('Nhập Số Point Đặt');

        const amountInput = new TextInputBuilder()
            .setCustomId('tx_input_amount')
            .setLabel('Ví dụ: 15000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('tx_a_') && interaction.customId !== 'tx_a_custom') {
        if (txState.status !== 'betting') return interaction.reply({ content: "❌ Phiên đặt cược đã đóng!", ephemeral: true });
        const sel = userTXSelections[userId];
        if (!sel) return interaction.reply({ content: "❌ Chọn cửa trước!", ephemeral: true });

        let amt = interaction.customId === 'tx_a_all' ? getUserData(userId).points : parseInt(interaction.customId.split('_')[2]);
        if (amt <= 0 || getUserData(userId).points < amt) return interaction.reply({ content: "❌ Bạn không đủ point để đặt mức này!", ephemeral: true });
        
        updatePoints(userId, -amt);
        txState.bets.push({ userId, username: interaction.user.username, choice: sel.choice, amount: amt });

        userTXSelections[userId] = null;
        txState.activeChoice = null; 
        txState.needsUpdate = true; 
        await updateTXMessage();
        
        return interaction.reply({ content: `💸 Đã đặt **${amt.toLocaleString()} point** vào **${TX_CHOICES[sel.choice].name}**!`, ephemeral: true });
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
        dbCache._minesHistory = minesHistory;
        dbCache._txDashHistory = txDashHistory;
        dbCache._bcDashHistory = bcDashHistory;
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