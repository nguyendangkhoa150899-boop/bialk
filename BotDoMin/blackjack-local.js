// ===== SERVER TEST BLACKJACK CHẠY RIÊNG (DEV — không dính bot thật) =====
// Chạy:  node BotDoMin/blackjack-local.js
// Rồi mở http://localhost:4000 trên trình duyệt. Mở NHIỀU TAB, mỗi tab nhập một
// Discord ID khác nhau (số bất kỳ) để giả nhiều người ngồi chung bàn.
// Ví ảo 100.000 mỗi người, KHÔNG cần PIN thật, KHÔNG cần Discord token.
// File này CHỈ để test giao diện — index.js không import nó.

const http = require('http');
const crypto = require('crypto');
const { PAGE } = require('./blackjackPage');
const { createTable } = require('./blackjackTable');
const { attachWebSocket } = require('./wsserver');

const PORT = process.env.BJ_LOCAL_PORT || 4000;
const wallets = {};                 // userId -> số dư
const sessions = {};                // token -> userId
const nameOf = {};                  // userId -> tên hiển thị
const getPoints = (u) => wallets[u] || 0;
const addPoints = (u, a) => { wallets[u] = (wallets[u] || 0) + a; };

const table = createTable({
    clock: () => Date.now(),
    getPoints, addPoints,
    announce: (m) => wsBroadcastToast(m),
    log: (cat, msg) => console.log('[' + cat + '] ' + msg),
    // mặc định 7s/15s/6s; smoke test rút ngắn qua env cho nhanh
    BET_WINDOW_MS: +(process.env.BJ_BET_MS || 7000),
    TURN_MS: +(process.env.BJ_TURN_MS || 15000),
    RESULT_MS: +(process.env.BJ_RESULT_MS || 6000),
    MIN_BET: 1,
});

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(PAGE);
    }
    if (req.method === 'POST' && req.url === '/bj/login') {
        let raw = '';
        req.on('data', d => raw += d);
        req.on('end', () => {
            let b = {}; try { b = JSON.parse(raw || '{}'); } catch { }
            const userId = String(b.userId || '').trim() || ('guest' + Math.floor(Math.random() * 1e6));
            if (!(userId in wallets)) wallets[userId] = 100000;      // ví ảo khởi tạo
            nameOf[userId] = 'P' + userId.slice(-4);
            const token = crypto.randomBytes(12).toString('hex');
            sessions[token] = userId;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, token, balance: wallets[userId] }));
        });
        return;
    }
    res.writeHead(404); res.end('not found');
});

const ws = attachWebSocket(server, {
    path: '/ws',
    onConnect: () => { },
    onMessage: (client, msg) => {
        if (msg.type === 'auth') {
            const uid = sessions[msg.token];
            if (!uid) { client.send({ type: 'authfail' }); return; }
            client.meta.userId = uid;
            client.send({ type: 'authok', userId: uid, balance: getPoints(uid) });
            client.send(stateFor(uid));
            return;
        }
        const uid = client.meta.userId;
        if (!uid) return;
        if (msg.type === 'bj') {
            let r;
            if (msg.cmd === 'sit') r = table.sit(uid, nameOf[uid] || uid, msg.seat | 0);
            else if (msg.cmd === 'leave') r = table.leave(uid);
            else if (msg.cmd === 'bet') r = table.bet(uid, msg.amount);
            else if (msg.cmd === 'act') r = table.act(uid, msg.action);
            else r = { error: 'lệnh lạ' };
            if (r && r.error) client.send({ type: 'denied', error: r.error });
            broadcastState();       // ai thao tác thì mọi người thấy ngay
        }
    },
    onClose: () => { },
});

function stateFor(uid) {
    const v = table.view(uid);
    v.type = 'state';
    v.balance = getPoints(uid);
    return v;
}
// Phát hiện chuyển sang 'result' NGAY TẠI ĐÂY (dù ván kết thúc do bấm Dừng hay do hết
// giờ trong tick) rồi bắn popup ăn/thua riêng từng người — trước khi gửi state.
let lastPhase = 'idle';
function broadcastState() {
    const v = table.view('_');
    if (lastPhase !== 'result' && v.phase === 'result' && v.lastResult) {
        for (const c of ws.clients) {
            const uid = c.meta.userId; if (!uid) continue;
            const d = v.lastResult.result.find(x => x.userId === uid);
            if (d) {
                const staked = d.hands.reduce((a, h) => a + h.bet, 0);
                c.send({ type: 'result', net: d.totalPayout - staked });
            }
        }
    }
    lastPhase = v.phase;
    for (const c of ws.clients) if (c.meta.userId) c.send(stateFor(c.meta.userId));
}
function wsBroadcastToast(msg) {
    for (const c of ws.clients) c.send({ type: 'toast', msg });
}

// Vòng lặp 1 giây: đẩy đồng hồ bàn + phát trạng thái.
setInterval(() => { table.tick(); broadcastState(); }, 1000);

server.listen(PORT, () => {
    console.log('');
    console.log('  ♠♥ BLACKJACK TEST chạy ở  http://localhost:' + PORT);
    console.log('  Mở nhiều TAB, mỗi tab nhập 1 Discord ID khác (số bất kỳ) để giả nhiều người.');
    console.log('  Ví ảo 100.000 mỗi người. Ctrl+C để dừng.');
    console.log('');
});
