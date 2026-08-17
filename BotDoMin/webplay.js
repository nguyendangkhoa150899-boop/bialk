// ===== CỔNG WEB CƯỢC CHO NGƯỜI CHƠI (Tài Xỉu) =====
// Chạy CỔNG RIÊNG (mặc định 3002), tách hẳn panel admin (150899).
// Đăng nhập: Discord ID + mã PIN (bot phát PIN qua nút 🌐 trên bảng Tài Xỉu).
// TOÀN BỘ thao tác Tài Xỉu ở đây: đặt cược + NẶN XÍ NGẦU (kéo tờ giấy che 3 viên).
// 15 giây cuối ván khóa sổ, xí ngầu lắc ngầm — ai kéo giấy người đó thấy riêng,
// hết giờ tự mở + trả tiền. Cược đi thẳng vào txState của bot nên bảng Discord
// vẫn hiển thị như thường, không dính deadline 3 giây / rate limit của Discord.
const http = require('http');
const crypto = require('crypto');

function startWebPlay(ctx) {
    const PORT = ctx.port || 3002;
    const LOCK_S = ctx.lockSeconds || 15;
    const TOTAL_TILES = ctx.TOTAL_TILES || 25;
    const calculateMulti = ctx.calculateMulti;
    const getInfo = ctx.getInfo;
    const createMinesGame = ctx.createMinesGame;
    const revealMine = ctx.revealMine;
    const finishMinesGame = ctx.finishMinesGame;

    const sendJSON = (res, code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
    };
    const readBody = (req) => new Promise((resolve) => {
        let raw = '';
        req.on('data', (d) => { raw += d; if (raw.length > 10000) req.destroy(); });
        req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    });

    // Chống dò PIN: mỗi IP tối đa 10 lần đăng nhập sai / 10 phút
    const loginFails = new Map();
    const tooManyFails = (ip) => {
        const e = loginFails.get(ip);
        if (!e) return false;
        if (Date.now() - e.ts > 600000) { loginFails.delete(ip); return false; }
        return e.count >= 10;
    };
    const recordFail = (ip) => {
        const e = loginFails.get(ip) || { count: 0, ts: Date.now() };
        e.count++; loginFails.set(ip, e);
    };

    // Phiên đăng nhập lưu trong database (sống qua restart), tự dọn phiên > 30 ngày
    const sessions = () => {
        const db = ctx.getDb();
        if (!db._webSessions || typeof db._webSessions !== 'object') db._webSessions = {};
        return db._webSessions;
    };

    // Chat sòng: giữ 100 tin gần nhất trong database, mỗi người 1 tin / 2 giây
    const chatLog = () => {
        const db = ctx.getDb();
        if (!Array.isArray(db._webChat)) db._webChat = [];
        return db._webChat;
    };
    const lastChatAt = new Map();
    const getSessionUser = (req) => {
        const h = req.headers['authorization'] || '';
        const t = h.startsWith('Bearer ') ? h.slice(7) : '';
        const s = t && sessions()[t];
        return s ? s.u : null;
    };

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;

            if (req.method === 'GET' && path === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(PAGE);
            }

            if (req.method === 'POST' && path === '/api/login') {
                const ip = req.socket.remoteAddress || '?';
                if (tooManyFails(ip)) return sendJSON(res, 429, { ok: false, error: 'Sai quá nhiều lần, chờ 10 phút' });
                const body = await readBody(req);
                const userId = String(body.userId || '').trim();
                const pin = String(body.pin || '').trim();
                const db = ctx.getDb();
                const rec = /^\d{15,20}$/.test(userId) ? db[userId] : null;
                if (!rec || typeof rec !== 'object' || !rec.webPin || rec.webPin !== pin) {
                    recordFail(ip);
                    return sendJSON(res, 401, { ok: false, error: 'Sai ID hoặc PIN. Lấy PIN bằng nút 🌐 trên bảng Tài Xỉu trong Discord.' });
                }
                const token = crypto.randomBytes(24).toString('hex');
                const ss = sessions();
                const now = Date.now();
                for (const [t, s] of Object.entries(ss)) if (now - (s.ts || 0) > 30 * 24 * 3600 * 1000) delete ss[t];
                ss[token] = { u: userId, ts: now };
                ctx.saveDbNow();
                ctx.writeLog('ADMIN', `[WEB CƯỢC] ${rec.name || userId} đăng nhập web`);
                return sendJSON(res, 200, { ok: true, token, name: rec.name || '', balance: rec.points || 0 });
            }

            // Các API dưới cần đăng nhập
            if (path.startsWith('/api/')) {
                const userId = getSessionUser(req);
                if (!userId) return sendJSON(res, 401, { ok: false, error: 'unauth' });

                if (path === '/api/state') {
                    const tx = ctx.getTX();
                    const me = ctx.getUserData(userId);
                    const totals = { tai: 0, xiu: 0, chan: 0, le: 0, bao: 0 };
                    const my = [];
                    const whoAgg = {}; // ai đang đặt ván này (gộp theo người + cửa)
                    for (const b of (tx.bets || [])) {
                        totals[b.choice] = (totals[b.choice] || 0) + b.amount;
                        if (b.userId === userId) my.push({ choice: b.choice, amount: b.amount });
                        const k = b.userId + '_' + b.choice;
                        if (!whoAgg[k]) whoAgg[k] = { u: b.userId, name: b.username, choice: b.choice, amount: 0 };
                        whoAgg[k].amount += b.amount;
                    }
                    const live = !!tx.message && tx.status !== 'stopped';
                    // phase: bet (đang nhận cược) | nan (khóa sổ, kéo giấy xem riêng) | wait
                    let phase = 'off';
                    if (live) phase = tx.status === 'betting' ? 'bet' : (tx.nan ? 'nan' : 'wait');
                    return sendJSON(res, 200, {
                        ok: true,
                        me: userId,
                        balance: me.points || 0,
                        live, phase,
                        gameId: tx.gameId,
                        targetTime: tx.targetTime,
                        // giờ server: client dùng để hiệu chỉnh lệch đồng hồ máy người chơi
                        now: Math.floor(Date.now() / 1000),
                        lockSeconds: LOCK_S,
                        totals,
                        myBets: my,
                        // Chỉ đưa xí ngầu ra trong cửa sổ nặn — lúc này sổ ĐÃ khóa,
                        // biết trước vài giây cũng không đặt thêm được gì.
                        nan: (phase === 'nan' && tx.nan) ? { gameId: tx.nan.gameId, dice: tx.nan.dice } : null,
                        betsList: Object.values(whoAgg),
                        // kèm bets/winners (có u) để client tính thắng/thua CÁ NHÂN từng ván
                        history: (tx.history || []).slice(0, 15).map(h => ({ gameId: h.gameId, dice: h.dice, sum: h.sum, tx: h.tx, cl: h.cl, storm: !!h.storm, bets: h.bets || [], winners: h.winners || [] })),
                        chat: chatLog().slice(-30),
                    });
                }

                if (req.method === 'POST' && path === '/api/chat') {
                    const body = await readBody(req);
                    const text = String(body.text || '').trim().slice(0, 200);
                    if (!text) return sendJSON(res, 400, { ok: false, error: 'Tin nhắn trống' });
                    const last = lastChatAt.get(userId) || 0;
                    if (Date.now() - last < 2000) return sendJSON(res, 429, { ok: false, error: 'Chậm thôi, 2 giây 1 tin' });
                    lastChatAt.set(userId, Date.now());
                    const me = ctx.getUserData(userId);
                    const log = chatLog();
                    log.push({ u: userId, name: me.name || ('web_' + userId.slice(-4)), text, ts: Date.now() });
                    while (log.length > 100) log.shift();
                    return sendJSON(res, 200, { ok: true });
                }

                if (req.method === 'POST' && path === '/api/bet') {
                    const body = await readBody(req);
                    const tx = ctx.getTX();
                    const choice = String(body.choice || '');
                    const amount = Math.floor(Number(body.amount));
                    if (!['tai', 'xiu', 'chan', 'le', 'bao'].includes(choice)) return sendJSON(res, 400, { ok: false, error: 'Cửa không hợp lệ' });
                    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Số tiền không hợp lệ' });
                    if (!tx.message || tx.status !== 'betting') return sendJSON(res, 400, { ok: false, error: 'Đã khóa sổ — đợi ván sau, giờ là lúc NẶN!' });
                    const me = ctx.getUserData(userId);
                    if ((me.points || 0) < amount) return sendJSON(res, 400, { ok: false, error: 'Không đủ Dogcoin! Số dư: ' + (me.points || 0).toLocaleString() });
                    ctx.updatePoints(userId, -amount);
                    tx.bets.push({ userId, username: me.name || ('web_' + userId.slice(-4)), choice, amount });
                    tx.needsUpdate = true; // bảng Discord tự vẽ lại trong 1 giây
                    ctx.writeLog('BET', `[WEB CƯỢC TX] ${me.name || userId} đặt ${amount} vào ${choice} (ván #${tx.gameId})`);
                    return sendJSON(res, 200, { ok: true, balance: ctx.getUserData(userId).points || 0 });
                }

                if (req.method === 'POST' && path === '/api/mines/init') {
                    const body = await readBody(req);
                    const numMines = Math.floor(Number(body.numMines));
                    const amount = Math.floor(Number(body.amount));
                    const me = ctx.getUserData(userId);
                    if (!Number.isFinite(numMines) || numMines < 1 || numMines >= TOTAL_TILES) return sendJSON(res, 400, { ok: false, error: `Số mìn phải từ 1 đến ${TOTAL_TILES - 1}` });
                    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Số tiền không hợp lệ' });
                    if ((me.points || 0) < amount) return sendJSON(res, 400, { ok: false, error: 'Không đủ Dogcoin! Số dư: ' + (me.points || 0).toLocaleString() });
                    ctx.updatePoints(userId, -amount);
                    const game = createMinesGame(numMines, userId);
                    const maxDiamonds = TOTAL_TILES - numMines;
                    const multi = getInfo(0, numMines).multi;
                    ctx.writeLog('BET', `[WEB DÒ MÌN INIT] ${me.name || userId} đặt ${amount} | Mìn: ${numMines} | Multi: ${multi}x`);
                    return sendJSON(res, 200, { ok: true, gameId: game.gameId, balance: me.points - amount, totalMines: numMines, maxDiamonds });
                }

                if (req.method === 'POST' && path === '/api/mines/reveal') {
                    const body = await readBody(req);
                    const tileIdx = Math.floor(Number(body.tile));
                    if (!Number.isFinite(tileIdx) || tileIdx < 0 || tileIdx >= TOTAL_TILES) return sendJSON(res, 400, { ok: false, error: 'Ô không hợp lệ' });
                    const result = revealMine(userId, tileIdx);
                    if (!result.ok) return sendJSON(res, 400, { ok: false, error: result.error });
                    const { isMine, revealed, isWin, game } = result;
                    if (isMine) {
                        finishMinesGame(userId);
                        return sendJSON(res, 200, { ok: true, isMine: true, revealed, isWin: false, balance: ctx.getUserData(userId).points || 0 });
                    }
                    if (isWin) {
                        const maxDiamonds = TOTAL_TILES - game.totalMines;
                        const winAmount = Math.floor(0 * getInfo(maxDiamonds, game.totalMines).multi); // placeholder, tính ở client
                        finishMinesGame(userId);
                        return sendJSON(res, 200, { ok: true, isMine: false, revealed, isWin: true, balance: ctx.getUserData(userId).points || 0 });
                    }
                    return sendJSON(res, 200, { ok: true, isMine: false, revealed, isWin: false });
                }

                if (req.method === 'POST' && path === '/api/mines/cashout') {
                    const game = finishMinesGame(userId);
                    if (!game) return sendJSON(res, 400, { ok: false, error: 'Không tìm thấy ván' });
                    // Tính thưởng dựa trên số ô đã mở (bet được tính ở client)
                    return sendJSON(res, 200, { ok: true, balance: ctx.getUserData(userId).points || 0 });
                }

                return sendJSON(res, 404, { ok: false, error: 'not found' });
            }

            res.writeHead(404); res.end('not found');
        } catch (e) {
            ctx.writeLog('SYSTEM', `[WEB CƯỢC] Lỗi: ${e.message}`);
            try { sendJSON(res, 500, { ok: false, error: 'server error' }); } catch { }
        }
    });

    server.listen(PORT, '0.0.0.0', () => ctx.writeLog('SYSTEM', `[WEB CƯỢC] Cổng web cược chạy ở cổng ${PORT}`));
    return server;
}

// ===== TRANG WEB (mobile-first, tiếng Việt) =====
const PAGE = [
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<title>Tài Xỉu — Cược nhanh</title>',
    '<style>',
    ':root{--bg:#12141a;--card:#1b1e27;--line:#2a2e3b;--tx:#e8eaf0;--muted:#8a90a3;--green:#3ddc84;--red:#ff5d5d;--blue:#4da3ff;--gold:#ffcf5c}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
    'body{background:var(--bg);color:var(--tx);min-height:100vh;padding:14px;max-width:520px;margin:0 auto}',
    '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}',
    'h1{font-size:19px;margin-bottom:4px}h2{font-size:15px;margin-bottom:10px}',
    '.muted{color:var(--muted);font-size:13px}',
    'input{width:100%;background:#12141a;border:1px solid var(--line);border-radius:10px;color:var(--tx);padding:12px;font-size:16px;margin-top:8px}',
    'button{border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;color:#fff}',
    '.btn-full{width:100%;margin-top:10px;background:var(--blue)}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    // nút kiểu sòng bài thật: nền ngà 3D, chữ đen đậm (theo hình mẫu SMALL 4-10)
    '.cbtn{padding:12px 0 10px;font-size:21px;font-weight:900;letter-spacing:2px;color:#221c10;text-shadow:0 1px 0 #fff9;position:relative;',
    'background:linear-gradient(180deg,#fbf7ea 0%,#f0e9d2 55%,#ddd2b0 100%);border:1px solid #b3a67f;border-bottom:5px solid #94865e;border-radius:10px}',
    '.cbtn small{display:block;font-size:14px;font-weight:800;letter-spacing:1px;color:#3d3418;margin-top:1px}',
    '.cbtn .muted{color:#8a7c55;font-size:12px;font-weight:700}',
    '.cbtn.tai small{color:#a32626}.cbtn.xiu small{color:#1d4f8f}.cbtn.chan small{color:#1d6f4f}.cbtn.le small{color:#6b3fa0}',
    '.cbtn.bao{margin:10px 0;font-size:23px;letter-spacing:3px;background:linear-gradient(180deg,#ffe9a8 0%,#f2d071 55%,#d3ab45 100%);border:2px solid #a8842f;border-bottom:6px solid #7d5f1e;color:#3d2c05;animation:baoPulse 2.2s ease-in-out infinite}',
    '.cbtn.bao small{color:#8a4a12;font-size:12px;letter-spacing:0}',
    '@keyframes baoPulse{0%,100%{box-shadow:0 0 0 0 #ffcf5c00}50%{box-shadow:0 0 16px 3px #ffcf5c77}}',
    // popup +/- tiền sau mỗi ván mình có đặt
    '#winpop{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);font-size:46px;font-weight:900;pointer-events:none;opacity:0;z-index:98;text-shadow:0 2px 14px #000c}',
    '#winpop.show{animation:winfloat 3.4s ease-out forwards}',
    '@keyframes winfloat{0%{opacity:0;transform:translate(-50%,-30%) scale(.5)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.18)}25%{transform:translate(-50%,-52%) scale(1)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-100%) scale(.9)}}',
    // hiệu ứng BÃO: rung màn hình + mưa emoji
    '@keyframes shakeX{0%,100%{transform:translate(0,0)}20%{transform:translate(-9px,4px)}40%{transform:translate(8px,-5px)}60%{transform:translate(-7px,3px)}80%{transform:translate(6px,-2px)}}',
    'body.storm{animation:shakeX .65s ease-in-out 2}',
    '.fx{position:fixed;top:-50px;z-index:97;pointer-events:none;animation-name:fxfall;animation-timing-function:linear;animation-fill-mode:forwards}',
    '@keyframes fxfall{to{transform:translateY(115vh) rotate(680deg)}}',
    // lịch sử cá nhân
    '.mh{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px}',
    '.mh .win{color:var(--green);font-weight:800}.mh .lose{color:var(--red);font-weight:800}',
    '.cbtn.sel{border-color:var(--gold);border-bottom-width:2px;transform:translateY(3px);box-shadow:0 0 0 3px var(--gold),0 0 16px #ffcf5c88}',
    '.chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.chip{flex:1;background:#232735;padding:9px 0;font-size:13px;min-width:56px}',
    '.bet-btn{width:100%;margin-top:10px;background:var(--green);color:#0c2417;font-size:17px}',
    '.bet-btn:disabled{background:#2a2e3b;color:var(--muted)}',
    '.row{display:flex;justify-content:space-between;align-items:center}',
    '.hist{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}',
    '.dot{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}',
    '.dot.t{background:#173423;color:var(--green)}.dot.x{background:#3a1d1d;color:var(--red)}.dot.b{background:#4a3a10;color:var(--gold)}',
    '#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;padding:10px 18px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90%;z-index:99}',
    '.big{font-size:26px;font-weight:800}',
    '.hidden{display:none}',
    '.mine{font-size:13px;margin-top:6px;color:var(--gold)}',
    // ---- dò mìn ----
    '#mineCard{display:none}',
    '#mineCard.active{display:block}',
    '.mineGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0}',
    '.mineTile{aspect-ratio:1;background:#232735;border:1px solid var(--line);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;transition:all .2s}',
    '.mineTile:hover:not(.disabled){background:#2d3139;border-color:#4da3ff}',
    '.mineTile.opened{background:var(--green);color:#0c2417;cursor:default}',
    '.mineTile.mine{background:var(--red);color:#fff;cursor:default}',
    '.mineTile.disabled{cursor:not-allowed;opacity:.6}',
    '.mineSetup{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}',
    '.mineSetup input{margin-top:6px;padding:10px}',
    '.mineMulti{text-align:center;padding:10px;background:#232735;border-radius:8px;margin:10px 0;font-size:18px;font-weight:800;color:var(--gold)}',
    '.mineCashout{width:100%;padding:12px;background:var(--blue);color:#fff;border:0;border-radius:10px;font-weight:800;cursor:pointer;margin-top:10px;font-size:15px}',
    '.mineCashout:disabled{background:#2a2e3b;cursor:not-allowed}',
    '.mineHist{max-height:150px;overflow-y:auto;font-size:12px}',
    '.mineEntry{padding:6px 0;border-bottom:1px solid var(--line)}',
    '.mineEntry .result{font-weight:800}',
    '.mineEntry .win{color:var(--green)}',
    '.mineEntry .lose{color:var(--red)}',
    // ---- sân khấu xí ngầu + tờ giấy ----
    '#stage{position:relative;height:150px;border-radius:12px;background:radial-gradient(ellipse at center,#1e3d2b 0%,#152a1e 100%);border:1px solid #2b4a37;overflow:hidden;margin-top:10px;touch-action:none}',
    '#diceRow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:14px}',
    '.die{width:56px;height:56px;background:#f4f1e8;border-radius:12px;position:relative;box-shadow:0 3px 8px #0008}',
    // chấm xí ngầu ĐỎ toàn bộ (yêu cầu chủ sòng) — thuần CSS, không cần hình
    '.pip{position:absolute;width:11px;height:11px;border-radius:50%;background:#c0392b;transform:translate(-50%,-50%)}',
    '#sumBadge{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);background:#000a;border-radius:8px;padding:3px 12px;font-weight:800;font-size:15px}',
    '#paper{position:absolute;inset:-4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-weight:800;box-shadow:0 6px 18px #000a;user-select:none;border-bottom:3px dashed}',
    '#paper .hint{font-size:16px}#paper .sub{font-size:12px;font-weight:600;opacity:.8;text-align:center;padding:0 14px}',
    // đỏ = CHƯA cho mở (đang giờ đặt cược) — xanh lá = mở được (giờ nặn)
    '#paper.locked{background:linear-gradient(175deg,#7e2f2f 0%,#6b2626 60%,#571e1e 100%);color:#ffdfdf;border-color:#b95c5c;cursor:not-allowed}',
    '#paper.open{background:linear-gradient(175deg,#2f7e46 0%,#26663a 60%,#1e5230 100%);color:#e2ffe9;border-color:#6cc287;cursor:grab}',
    '#stageCap{margin-top:8px;font-size:13px;color:var(--muted);text-align:center}',
    // ---- chat ----
    '#chatBox{height:190px;overflow-y:auto;background:#12141a;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px}',
    '.cmsg{padding:3px 0;word-break:break-word}.cmsg b{color:var(--gold)}.cmsg .ct{color:var(--muted);font-size:11px;margin-left:6px}',
    '</style></head><body>',

    '<div id="login" class="card">',
    '<h1>🎲 Tài Xỉu — Cược trên web</h1>',
    '<div class="muted">Đặt cược và <b>nặn xí ngầu</b> đều ở đây. Lấy mã PIN bằng nút <b>🌐 Cược trên web</b> ở bảng Tài Xỉu trong Discord.</div>',
    '<input id="uid" inputmode="numeric" placeholder="Discord ID của bạn">',
    '<input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">',
    '<button class="btn-full" onclick="login()">Vào sòng</button>',
    '</div>',

    '<div id="app" class="hidden">',
    '<div class="card row"><div><div class="muted">Số dư của <b id="myName"></b></div><div class="big" id="bal">0</div></div><button style="background:#232735" onclick="logout()">Thoát</button></div>',

    '<div class="card">',
    '<div class="row"><h2 id="round" style="margin:0">Ván #—</h2><div id="clock" class="big">--</div></div>',
    '<div id="stt" class="muted"></div>',
    '<div id="stage">',
    '<div id="diceRow"></div>',
    '<div id="sumBadge" class="hidden"></div>',
    '<div id="paper" class="hidden locked"><div class="hint" id="paperHint">🔒 CHƯA TỚI GIỜ NẶN</div><div class="sub" id="paperSub">đặt cược đi — giấy chuyển XANH là kéo được</div></div>',
    '</div>',
    '<div id="stageCap"></div>',
    '</div>',

    '<div class="card" id="mineCard">',
    '<h2>💎 DÒ MÌN</h2>',
    '<div class="mineSetup">',
    '<div><label>Số mìn (1-24):</label><input id="mineNumMines" type="number" min="1" max="24" value="5" onchange="updateMineMulti()"></div>',
    '<div><label>Dogcoin đặt:</label><input id="mineBet" type="number" min="1" value="100" onchange="updateMineMulti()"></div>',
    '</div>',
    '<div class="mineMulti" id="mineMultiDisplay">Chọn số để xem thưởng</div>',
    '<button class="bet-btn" id="mineBetBtn" onclick="mineBetStart()">BẮT ĐẦU ĐÒ MÌN</button>',
    '<div class="mineGrid" id="mineGrid"></div>',
    '<button class="mineCashout" id="mineCashoutBtn" onclick="mineCashout()" disabled>💰 DỪNG & NHẬN TIỀN</button>',
    '<div class="mineHist" id="mineHist"></div>',
    '</div>',
    '',
    '<div class="card" id="betCard">',
    '<div class="grid2">',
    '<button class="cbtn tai" id="c_tai" onclick="pick(\'tai\')">TÀI<small>11 - 17</small><div class="muted" id="t_tai">0</div></button>',
    '<button class="cbtn xiu" id="c_xiu" onclick="pick(\'xiu\')">XỈU<small>4 - 10</small><div class="muted" id="t_xiu">0</div></button>',
    '</div>',
    '<button class="cbtn bao" id="c_bao" style="width:100%" onclick="pick(\'bao\')">🌪️ BÃO<small>3 viên giống nhau · 1 ăn 30 — ra Bão mọi cửa khác THUA</small><div class="muted" id="t_bao">0</div></button>',
    '<div class="grid2">',
    '<button class="cbtn chan" id="c_chan" onclick="pick(\'chan\')">CHẴN<small>tổng chẵn</small><div class="muted" id="t_chan">0</div></button>',
    '<button class="cbtn le" id="c_le" onclick="pick(\'le\')">LẺ<small>tổng lẻ</small><div class="muted" id="t_le">0</div></button>',
    '</div>',
    '<input id="amt" inputmode="numeric" placeholder="Số Dogcoin đặt">',
    '<div class="chips">',
    '<button class="chip" onclick="addAmt(10)">+10</button><button class="chip" onclick="addAmt(50)">+50</button>',
    '<button class="chip" onclick="addAmt(100)">+100</button><button class="chip" onclick="addAmt(500)">+500</button>',
    '<button class="chip" onclick="allIn()">ALL IN</button>',
    '</div>',
    '<button class="bet-btn" id="betBtn" onclick="bet()">ĐẶT CƯỢC</button>',
    '<div class="mine" id="mine"></div>',
    '</div>',

    '<div class="card"><h2>👥 Ai đang đặt ván này</h2><div id="whoBox" class="muted" style="font-size:13px">Chưa ai đặt.</div></div>',

    '<div class="card"><h2>🕵️ Soi cầu 15 ván</h2><div class="hist" id="hist"></div></div>',

    '<div class="card"><h2>💬 Chat sòng</h2>',
    '<div id="chatBox"></div>',
    '<div style="display:flex;gap:8px;margin-top:8px">',
    '<input id="chatIn" maxlength="200" placeholder="Chém gió..." style="margin-top:0;flex:1">',
    '<button style="background:var(--blue);min-width:64px" onclick="sendChat()">Gửi</button>',
    '</div></div>',

    '<div class="card"><h2>📒 10 ván gần nhất của bạn</h2><div id="myHist" class="muted" style="font-size:13px">Chưa có ván nào bạn đặt.</div></div>',
    '</div>',

    '<div id="winpop"></div>',
    '<div id="toast"></div>',
    '<script>',
    'var TOKEN=localStorage.getItem("play_token")||"";var SEL="";var TT=0;var LOCKS=10;var PHASE="off";var BAL=0;',
    'var NAN=null;var revealedGame=0;var dragging=false;var paperX=0,paperY=0,baseX=0,baseY=0,dragX0=0,dragY0=0;',
    'var MYID="";var lastSettled=-1;',
    // đồng hồ máy người chơi có thể lệch server vài giây -> đếm giờ theo GIỜ SERVER
    'var CLOCK_OFF=0;function srvNow(){return Math.floor(Date.now()/1000)+CLOCK_OFF}',
    'function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2500)}',
    'function api(p,body){return fetch(p,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!j.ok)throw new Error(j.error||("HTTP "+r.status));return j})})}',
    'function login(){var u=document.getElementById("uid").value.trim();var p=document.getElementById("pin").value.trim();if(!u||!p)return toast("Nhập đủ ID + PIN");fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})}).then(function(r){return r.json()}).then(function(j){if(!j.ok)return toast(j.error||"Sai thông tin");TOKEN=j.token;localStorage.setItem("play_token",TOKEN);show(j.name)}).catch(function(){toast("Lỗi mạng")})}',
    'function logout(){TOKEN="";localStorage.removeItem("play_token");location.reload()}',
    'function show(n){document.getElementById("login").classList.add("hidden");document.getElementById("app").classList.remove("hidden");document.getElementById("mineCard").classList.add("active");if(n)document.getElementById("myName").textContent=n;initPaper();updateMineMulti();refresh();setInterval(refresh,2000);setInterval(tick,250)}',
    'function pick(c){SEL=c;["tai","xiu","chan","le","bao"].forEach(function(x){document.getElementById("c_"+x).classList.toggle("sel",x===c)})}',
    'function addAmt(n){var a=document.getElementById("amt");a.value=(parseInt(a.value||"0")||0)+n}',
    'function allIn(){document.getElementById("amt").value=BAL}',
    // vẽ 1 viên xí ngầu bằng chấm CSS
    'var PIPS={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};',
    'function dieHTML(v){var s=\'<div class="die">\';PIPS[v].forEach(function(p){s+=\'<div class="pip" style="left:\'+p[0]+\'%;top:\'+p[1]+\'%"></div>\'});return s+"</div>"}',
    'function showDice(dice,withSum){document.getElementById("diceRow").innerHTML=dice.map(dieHTML).join("");var b=document.getElementById("sumBadge");if(withSum){var s=dice[0]+dice[1]+dice[2];b.textContent="Tổng "+s+" — "+(s>=11?"TÀI":"XỈU")+" · "+(s%2===0?"CHẴN":"LẺ");b.classList.remove("hidden")}else b.classList.add("hidden")}',
    // tờ giấy: che kín, kéo TỰ DO 4 CHIỀU — kéo tới đâu lộ tới đó.
    // Chỉ kéo được trong pha nặn (PHASE==="nan") và khi chưa nặn xong ván này.
    'function initPaper(){var p=document.getElementById("paper");',
    'p.addEventListener("pointerdown",function(e){if(PHASE!=="nan"||!NAN||revealedGame===NAN.gameId)return;dragging=true;dragX0=e.clientX;dragY0=e.clientY;baseX=paperX;baseY=paperY;p.setPointerCapture(e.pointerId);e.preventDefault()});',
    'p.addEventListener("pointermove",function(e){if(!dragging)return;var st=document.getElementById("stage");var mw=st.offsetWidth+30,mh=st.offsetHeight+30;',
    'paperX=Math.max(-mw,Math.min(mw,baseX+(e.clientX-dragX0)));paperY=Math.max(-mh,Math.min(mh,baseY+(e.clientY-dragY0)));',
    'p.style.transform="translate("+paperX+"px,"+paperY+"px)";checkReveal()});',
    'function up(){dragging=false}p.addEventListener("pointerup",up);p.addEventListener("pointercancel",up);}',
    // lộ đủ cả 3 viên (giấy không còn đè lên viên nào) mới tính là nặn xong
    'function rectOverlap(a,b){return !(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom)}',
    'function checkReveal(){if(!NAN||revealedGame===NAN.gameId)return;var pr=document.getElementById("paper").getBoundingClientRect();var dies=document.querySelectorAll("#diceRow .die");if(dies.length<3)return;for(var i=0;i<dies.length;i++){if(rectOverlap(pr,dies[i].getBoundingClientRect()))return}revealDone()}',
    'function revealDone(){if(!NAN||revealedGame===NAN.gameId)return;revealedGame=NAN.gameId;var p=document.getElementById("paper");p.classList.add("hidden");showDice(NAN.dice,true);',
    'if(NAN.dice[0]===NAN.dice[1]&&NAN.dice[1]===NAN.dice[2])stormFx(NAN.gameId);else toast("🀫 Bạn nặn xong — giữ kín tới giờ mở bát 😏")}',
    // BÃO: rung màn hình + mưa emoji (mỗi ván chỉ nổ 1 lần)
    'var stormFor=0;',
    'function stormFx(gid){if(gid&&stormFor===gid)return;if(gid)stormFor=gid;',
    'document.body.classList.remove("storm");void document.body.offsetWidth;document.body.classList.add("storm");',
    'toast("🌪️🌪️ BÃOOOO !!! 🌪️🌪️");',
    'var EM=["🌪️","💥","🪙","💰","⚡"];',
    'for(var i=0;i<26;i++){var s=document.createElement("div");s.className="fx";s.textContent=EM[i%EM.length];',
    's.style.left=(Math.random()*96)+"vw";s.style.fontSize=(18+Math.random()*28)+"px";',
    's.style.animationDuration=(1.2+Math.random()*1.6)+"s";s.style.animationDelay=(Math.random()*0.7)+"s";',
    'document.body.appendChild(s);(function(el){setTimeout(function(){el.remove()},3800)})(s)}',
    'setTimeout(function(){document.body.classList.remove("storm")},1600)}',
    // popup +X xanh / -X đỏ sau ván mình có đặt, hiện rồi trôi lên mờ dần
    'function showNet(net){var el=document.getElementById("winpop");',
    'el.textContent=(net>=0?"+":"")+net.toLocaleString("vi-VN")+" 🐕";',
    'el.style.color=net>=0?"#3ddc84":"#ff5d5d";',
    'el.classList.remove("show");void el.offsetWidth;el.classList.add("show")}',
    'function resetPaper(){paperX=0;paperY=0;dragging=false;var p=document.getElementById("paper");p.style.transition="";p.style.transform="translate(0,0)"}',
    'function tick(){var now=srvNow();var el=document.getElementById("clock");',
    'if(PHASE==="bet"){var s=TT-LOCKS-now;el.textContent=(s>0?s:0)+"s";el.style.color=""}',
    'else if(PHASE==="nan"){var s2=TT-now;el.textContent="🀫 "+(s2>0?s2:0)+"s";el.style.color="#ffcf5c";',
    // 3 giây cuối chưa nặn -> tự kéo giấy giùm để kịp thấy kết quả
    'if(s2<=3&&NAN&&revealedGame!==NAN.gameId)autoReveal()}',
    'else{el.textContent="--";el.style.color=""}}',
    'var autoRevealing=0;',
    'function autoReveal(){if(!NAN||autoRevealing===NAN.gameId)return;autoRevealing=NAN.gameId;',
    'var p=document.getElementById("paper");var h=document.getElementById("stage").offsetHeight;',
    'p.style.transition="transform .6s ease-in";p.style.transform="translate("+paperX+"px,"+(h+60)+"px)";',
    'setTimeout(function(){revealDone();toast("⏰ Hết giờ nặn — tự mở giùm bạn!")},600)}',
    'function bet(){if(PHASE!=="bet")return toast("Đang khóa sổ — chờ ván sau!");if(!SEL)return toast("Chọn cửa trước!");var v=parseInt(document.getElementById("amt").value);if(!v||v<=0)return toast("Nhập số Dogcoin");api("/api/bet",{choice:SEL,amount:v}).then(function(j){BAL=j.balance;document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");document.getElementById("amt").value="";toast("💸 Đã đặt "+v.toLocaleString("vi-VN")+" vào "+SEL.toUpperCase());refresh()}).catch(function(e){toast("❌ "+e.message)})}',
    'var NAMES={tai:"TÀI",xiu:"XỈU",chan:"CHẴN",le:"LẺ",bao:"BÃO"};',
    'function refresh(){api("/api/state").then(function(j){',
    'MYID=j.me||MYID;',
    'BAL=j.balance;document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");',
    // ván vừa chốt: tính thắng/thua CÁ NHÂN -> popup; ra bão -> hiệu ứng
    'var h0s=j.history[0];',
    'if(h0s){if(lastSettled===-1)lastSettled=h0s.gameId;',
    'else if(h0s.gameId>lastSettled){lastSettled=h0s.gameId;',
    'var stake=0,winAmt=0;(h0s.bets||[]).forEach(function(b){if(b.u===MYID)stake+=b.amount});(h0s.winners||[]).forEach(function(w){if(w.u===MYID)winAmt+=w.amount});',
    'if(stake>0)showNet(winAmt-stake);',
    'if(h0s.storm)stormFx(h0s.gameId)}}',
    'document.getElementById("round").textContent="Ván #"+String(j.gameId).padStart(5,"0");',
    'if(j.now)CLOCK_OFF=j.now-Math.floor(Date.now()/1000);',
    'TT=j.targetTime;LOCKS=j.lockSeconds;var prevPhase=PHASE;PHASE=j.phase;NAN=j.nan;',
    'document.getElementById("betBtn").disabled=(PHASE!=="bet");',
    'var stt=document.getElementById("stt");var cap=document.getElementById("stageCap");var paper=document.getElementById("paper");',
    'var hint=document.getElementById("paperHint"),sub=document.getElementById("paperSub");',
    'if(PHASE==="bet"){stt.textContent="🟢 Đang nhận cược";',
    // giấy ĐỎ che sẵn (khóa) — kết quả ván trước xuống dòng chú thích dưới sân khấu
    'resetPaper();paper.classList.remove("hidden","open");paper.classList.add("locked");',
    'hint.textContent="🔒 CHƯA TỚI GIỜ NẶN";sub.textContent="đặt cược đi — giấy chuyển XANH là kéo được";',
    'var h0=j.history[0];cap.textContent=h0?("Ván trước #"+String(h0.gameId).padStart(5,"0")+": "+h0.dice.join("-")+" = "+h0.sum+" ("+h0.tx+" · "+h0.cl+")"):"Đặt cược đi!";',
    'if(h0)showDice(h0.dice,false);else document.getElementById("diceRow").innerHTML="";document.getElementById("sumBadge").classList.add("hidden")}',
    'else if(PHASE==="nan"&&NAN){stt.textContent="🀫 Khóa sổ — GIỜ NẶN ĐÂY!";',
    'if(revealedGame===NAN.gameId){paper.classList.add("hidden");showDice(NAN.dice,true);cap.textContent="Bạn nặn xong rồi — chờ mở bát trả tiền..."}',
    'else{showDice(NAN.dice,false);paper.classList.remove("hidden","locked");paper.classList.add("open");',
    'hint.textContent="🀫 NẶN ĐI — GIẤY XANH LÀ MỞ ĐƯỢC!";sub.textContent="giữ và kéo tờ giấy về bất kỳ hướng nào, lộ đủ 3 viên là ra điểm";',
    'cap.textContent="Ai kéo người đó thấy — người khác KHÔNG thấy của bạn 🤫"}}',
    'else if(PHASE==="wait"){stt.textContent="⏳ Đang mở bát...";cap.textContent="";paper.classList.add("hidden")}',
    'else{stt.textContent="🔴 Bàn Tài Xỉu đang tắt";cap.textContent="";paper.classList.add("hidden")}',
    'if(prevPhase==="nan"&&PHASE!=="nan"){resetPaper()}',
    '["tai","xiu","chan","le","bao"].forEach(function(c){document.getElementById("t_"+c).textContent=(j.totals[c]||0).toLocaleString("vi-VN")});',
    'var m=j.myBets.map(function(b){return NAMES[b.choice]+": "+b.amount.toLocaleString("vi-VN")}).join(" · ");',
    'document.getElementById("mine").textContent=m?("🧾 Ván này bạn đặt — "+m):"";',
    'renderWho(j.betsList||[]);',
    'document.getElementById("hist").innerHTML=j.history.map(function(h){var cls=h.storm?"b":((h.tx==="TÀI"||h.tx==="TAI")?"t":"x");return \'<div class="dot \'+cls+\'" title="#\'+h.gameId+(h.storm?" BÃO":"")+\'">\'+(h.storm?"🌪️":h.sum)+"</div>"}).join("");',
    'renderMyHist(j.history||[]);',
    'renderChat(j.chat||[]);',
    '}).catch(function(e){if(String(e.message).indexOf("unauth")>=0)logout()})}',
    // 10 ván gần nhất MÌNH có đặt: id ván + kết quả + ăn/thua bao nhiêu
    'function renderMyHist(list){var box=document.getElementById("myHist");',
    'var mine=list.filter(function(h){return (h.bets||[]).some(function(b){return b.u===MYID})}).slice(0,10);',
    'if(!mine.length){box.innerHTML="Chưa có ván nào bạn đặt.";return}',
    'box.innerHTML=mine.map(function(h){var stake=0,winAmt=0;',
    'h.bets.forEach(function(b){if(b.u===MYID)stake+=b.amount});h.winners.forEach(function(w){if(w.u===MYID)winAmt+=w.amount});',
    'var net=winAmt-stake;var kq=h.storm?("🌪️ BÃO "+h.dice.join("-")):(h.dice.join("-")+" = "+h.sum+" ("+h.tx+" · "+h.cl+")");',
    'return \'<div class="mh"><span>#\'+String(h.gameId).padStart(5,"0")+" · "+kq+\'</span><span class="\'+(net>=0?"win":"lose")+\'">\'+(net>=0?"+":"")+net.toLocaleString("vi-VN")+"</span></div>"}).join("")}',
    // danh sách ai đang đặt ván này, gộp theo cửa, tên tô màu riêng từng người
    'var CHOICE_COLOR={tai:"#ff7b86",xiu:"#7db4ff",chan:"#6fd3b8",le:"#c39bf0",bao:"#ffcf5c"};',
    'function renderWho(list){var box=document.getElementById("whoBox");if(!list.length){box.innerHTML="Chưa ai đặt.";return}',
    'var by={};list.forEach(function(b){(by[b.choice]=by[b.choice]||[]).push(b)});',
    'box.innerHTML=["tai","xiu","chan","le","bao"].filter(function(c){return by[c]}).map(function(c){',
    'return \'<div style="padding:3px 0"><b style="color:\'+CHOICE_COLOR[c]+\'">\'+NAMES[c]+"</b>: "+by[c].map(function(b){return \'<span style="color:\'+userColor(b.u)+\'">\'+esc(b.name)+"</span> "+b.amount.toLocaleString("vi-VN")}).join(" · ")+"</div>"}).join("")}',
    'function esc(s){return String(s).replace(/[&<>]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":"&gt;"})}',
    // mỗi user 1 màu cố định: băm userId ra hue HSL, sáng vừa đủ đọc trên nền tối
    'function userColor(u){var h=0;u=String(u||"");for(var i=0;i<u.length;i++){h=(h*31+u.charCodeAt(i))>>>0}return "hsl("+(h%360)+",75%,68%)"}',
    'var lastChatTs=0;',
    'function renderChat(list){var box=document.getElementById("chatBox");var newest=list.length?list[list.length-1].ts:0;if(newest===lastChatTs)return;',
    'var atBottom=box.scrollTop+box.clientHeight>=box.scrollHeight-30;',
    'box.innerHTML=list.map(function(m){var t=new Date(m.ts);var hh=String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");return \'<div class="cmsg"><b style="color:\'+userColor(m.u)+\'">\'+esc(m.name)+"</b>: "+esc(m.text)+\'<span class="ct">\'+hh+"</span></div>"}).join("");',
    'if(atBottom||lastChatTs===0)box.scrollTop=box.scrollHeight;lastChatTs=newest}',
    'function sendChat(){var i=document.getElementById("chatIn");var v=i.value.trim();if(!v)return;api("/api/chat",{text:v}).then(function(){i.value="";lastChatTs=0;refresh()}).catch(function(e){toast("❌ "+e.message)})}',
    'document.getElementById("chatIn").addEventListener("keydown",function(e){if(e.key==="Enter")sendChat()});',
    '',
    '// ===== DÒ MÌN =====',
    'var MINE_TOTAL_TILES=25;var MINE_CURRENT_GAME=null;var MINE_BET=0;',
    'function updateMineMulti(){',
    'var numMines=parseInt(document.getElementById("mineNumMines").value)||0;',
    'var bet=parseInt(document.getElementById("mineBet").value)||0;',
    'if(numMines<1||numMines>=MINE_TOTAL_TILES||bet<=0){document.getElementById("mineMultiDisplay").textContent="⚠️ Số mìn/cược không hợp lệ";return}',
    'var maxDiamonds=MINE_TOTAL_TILES-numMines;',
    'var multi=calculateMinesMulti(maxDiamonds,numMines);',
    'document.getElementById("mineMultiDisplay").textContent="💰 Thưởng tối đa: x"+multi.toFixed(2)+" = "+Math.floor(bet*multi).toLocaleString("vi-VN")+" 🐕";',
    '}',
    'function calculateMinesMulti(diamonds,numMines){',
    'if(diamonds<=0)return 1;',
    'var prob=nCr(MINE_TOTAL_TILES-numMines,diamonds)/nCr(MINE_TOTAL_TILES,diamonds);',
    'if(prob<=0)return 1;',
    'return Math.floor((1/prob)*0.95*100)/100;',
    '}',
    'function nCr(n,r){if(r>n)return 0;if(r===0||r===n)return 1;var res=1;for(var i=1;i<=r;i++){res=res*(n-i+1)/i}return res}',
    'function renderMineGrid(){',
    'var grid=document.getElementById("mineGrid");grid.innerHTML="";',
    'for(var i=0;i<MINE_TOTAL_TILES;i++){',
    'var t=document.createElement("div");t.className="mineTile";t.id="mt_"+i;t.textContent="?";t.dataset.idx=i;',
    't.onclick=function(){revealMineTile(parseInt(this.dataset.idx))};',
    'grid.appendChild(t);',
    '}',
    '}',
    'function mineBetStart(){',
    'var numMines=parseInt(document.getElementById("mineNumMines").value);',
    'var bet=parseInt(document.getElementById("mineBet").value);',
    'var bal=parseInt(document.getElementById("bal").textContent.replace(/[^0-9]/g,""));',
    'if(numMines<1||numMines>=MINE_TOTAL_TILES)return toast("❌ Số mìn từ 1 đến "+(MINE_TOTAL_TILES-1));',
    'if(bet<=0)return toast("❌ Cược phải > 0");',
    'if(bal<bet)return toast("❌ Không đủ Dogcoin!");',
    'api("/api/mines/init",{numMines:numMines,amount:bet}).then(function(j){',
    'MINE_CURRENT_GAME={gameId:j.gameId,bet:bet,numMines:numMines,maxDiamonds:j.maxDiamonds,revealed:0};',
    'MINE_BET=bet;',
    'document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");',
    'document.getElementById("mineBetBtn").disabled=true;',
    'document.getElementById("mineNumMines").disabled=true;',
    'document.getElementById("mineBet").disabled=true;',
    'document.getElementById("mineCashoutBtn").disabled=false;',
    'renderMineGrid();',
    'document.getElementById("mineMultiDisplay").textContent="🎮 Chơi đi — mở càng nhiều ô an toàn càng được!";',
    '}).catch(function(e){toast("❌ "+e.message);',
    '})}',
    'function revealMineTile(idx){',
    'if(!MINE_CURRENT_GAME)return;',
    'var t=document.getElementById("mt_"+idx);',
    'if(!t||t.classList.contains("disabled"))return;',
    'api("/api/mines/reveal",{tile:idx}).then(function(j){',
    'if(!j.ok)return toast("❌ "+j.error);',
    't.classList.add("disabled");',
    'if(j.isMine){t.textContent="💣";t.classList.add("mine");',
    'showNet(-MINE_BET);updatePoints(MYID,-MINE_BET);document.getElementById("bal").textContent=(BAL-MINE_BET).toLocaleString("vi-VN");',
    'disableMineGrid();toast("💥 BÙM! Trúng mìn!");setTimeout(finishMineGame,1500);return}',
    'MINE_CURRENT_GAME.revealed++;t.textContent="✓";t.classList.add("opened");',
    'var multi=calculateMinesMulti(MINE_CURRENT_GAME.revealed,MINE_CURRENT_GAME.numMines);',
    'var currentWin=Math.floor(MINE_BET*multi);',
    'document.getElementById("mineMultiDisplay").textContent="💰 x"+multi.toFixed(2)+" = "+currentWin.toLocaleString("vi-VN")+" 🐕 ("+MINE_CURRENT_GAME.revealed+"/"+MINE_CURRENT_GAME.maxDiamonds+")";',
    'if(j.isWin){',
    'disableMineGrid();toast("🎉 JACKPOT! Mở hết ô an toàn!");setTimeout(finishMineGame,1500);',
    '}',
    '}).catch(function(e){toast("❌ "+e.message)})}',
    'function mineCashout(){',
    'if(!MINE_CURRENT_GAME)return;',
    'var multi=calculateMinesMulti(MINE_CURRENT_GAME.revealed,MINE_CURRENT_GAME.numMines);',
    'var winAmount=Math.floor(MINE_BET*multi);',
    'var profit=winAmount-MINE_BET;',
    'updatePoints(MYID,profit);',
    'showNet(profit);',
    'document.getElementById("bal").textContent=(BAL+profit).toLocaleString("vi-VN");',
    'disableMineGrid();toast("✅ Dừng được "+winAmount.toLocaleString("vi-VN")+" Dogcoin!");',
    'api("/api/mines/cashout",{}).catch(function(e){});',
    'setTimeout(finishMineGame,1500);',
    '}',
    'function disableMineGrid(){',
    'var grid=document.getElementById("mineGrid");',
    'for(var i=0;i<MINE_TOTAL_TILES;i++){',
    'var t=document.getElementById("mt_"+i);',
    'if(t&&!t.classList.contains("opened")&&!t.classList.contains("mine")){t.classList.add("disabled")}',
    '}',
    '}',
    'function finishMineGame(){',
    'MINE_CURRENT_GAME=null;',
    'document.getElementById("mineBetBtn").disabled=false;',
    'document.getElementById("mineNumMines").disabled=false;',
    'document.getElementById("mineBet").disabled=false;',
    'document.getElementById("mineCashoutBtn").disabled=true;',
    'document.getElementById("mineMultiDisplay").textContent="Chọn số để xem thưởng";',
    '}',
    'function updatePoints(userId,amount){BAL+=amount}',
    '',
    'if(TOKEN){show("")}',
    'document.getElementById("pin").addEventListener("keydown",function(e){if(e.key==="Enter")login()});',
    '</script></body></html>',
].join('\n');

module.exports = { startWebPlay };
