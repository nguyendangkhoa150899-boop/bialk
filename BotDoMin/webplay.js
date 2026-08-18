// ===== CỔNG WEB CƯỢC CHO NGƯỜI CHƠI (Tài Xỉu) =====
// Chạy CỔNG RIÊNG (mặc định 3002), tách hẳn panel admin (150899).
// Đăng nhập: Discord ID + mã PIN (bot phát PIN qua nút 🌐 trên bảng Tài Xỉu).
// TOÀN BỘ thao tác Tài Xỉu ở đây: đặt cược + NẶN XÍ NGẦU (kéo tờ giấy che 3 viên).
// 15 giây cuối ván khóa sổ, xí ngầu lắc ngầm — ai kéo giấy người đó thấy riêng,
// hết giờ tự mở + trả tiền. Cược đi thẳng vào txState của bot nên bảng Discord
// vẫn hiển thị như thường, không dính deadline 3 giây / rate limit của Discord.
const http = require('http');
const crypto = require('crypto');
const { attachWebSocket } = require('./wsserver');
const BLACKJACK_PAGE = require('./blackjackPage').PAGE;

// Toàn bộ ảnh gom ở images.js — thêm ảnh mới chỉ cần sửa bảng FILES bên đó,
// không phải đụng vào file này nữa.
const IMAGES = require('./images');

function startWebPlay(ctx) {
    const PORT = ctx.port || 3002;
    const LOCK_S = ctx.lockSeconds || 15;
    const mines = ctx.mines;   // toàn bộ logic + tiền của dò mìn nằm ở index.js
    const stairs = ctx.stairs; // leo thang cũng vậy

    const sendJSON = (res, code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
    };
    // Phải resolve ở MỌI lối ra. req.destroy() không phát 'end', nếu chỉ nghe 'end' thì
    // gửi body quá cỡ sẽ treo Promise vĩnh viễn — mỗi lần như vậy rò một request + closure,
    // spam vài phút là hết RAM.
    const readBody = (req) => new Promise((resolve) => {
        let raw = '', done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        req.on('data', (d) => { raw += d; if (raw.length > 10000) { req.destroy(); finish({}); } });
        req.on('end', () => { try { finish(JSON.parse(raw || '{}')); } catch { finish({}); } });
        req.on('aborted', () => finish({}));
        req.on('error', () => finish({}));
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
    // Hạn 30 ngày phải kiểm ở ĐÂY. Trước chỉ dọn lúc có người đăng nhập, nên token cũ
    // vẫn dùng được vô thời hạn nếu không ai đăng nhập để kích hoạt vòng dọn.
    const SESSION_TTL = 30 * 24 * 3600 * 1000;
    const getSessionUser = (req) => {
        const h = req.headers['authorization'] || '';
        const t = h.startsWith('Bearer ') ? h.slice(7) : '';
        if (!t) return null;
        const ss = sessions();
        const s = ss[t];
        if (!s) return null;
        if (Date.now() - (s.ts || 0) > SESSION_TTL) { delete ss[t]; return null; }
        return s.u;
    };

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;

            if (req.method === 'GET' && path === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(PAGE);
            }

            // Blackjack = TRANG RIÊNG (yêu cầu xoay ngang điện thoại). Đăng nhập dùng chung
            // /api/login; chơi qua WebSocket /ws.
            if (req.method === 'GET' && path === '/blackjack') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(BLACKJACK_PAGE);
            }

            if (IMAGES.serve(req, res, path)) return;

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
                // dọn phiên quá hạn + phiên cũ của chính người này (đăng nhập lại = thu hồi máy cũ)
                for (const [t, s] of Object.entries(ss)) {
                    if (now - (s.ts || 0) > 30 * 24 * 3600 * 1000 || s.u === userId) delete ss[t];
                }
                ss[token] = { u: userId, ts: now };
                // CỐ TÌNH không gọi saveDbNow ở đây: hàm đó ghi ĐỒNG BỘ cả database, ai spam
                // đăng nhập là chặn đứng cả bot. Phiên nằm trong dbCache nên vòng lưu tự động
                // (10 giây/lần) vẫn giữ được qua restart.
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
                        history: (tx.history || []).slice(0, 20).map(h => ({ gameId: h.gameId, dice: h.dice, sum: h.sum, tx: h.tx, cl: h.cl, storm: !!h.storm, bets: h.bets || [], winners: h.winners || [] })),
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

                // ===== DÒ MÌN =====
                // Mọi phép tính tiền/hệ số nằm ở index.js (ctx.mines). Ở đây chỉ chuyển tiếp,
                // KHÔNG nhận số tiền thắng do client gửi lên — client sửa được.
                if (path.startsWith('/api/mines/')) {
                    if (!mines) return sendJSON(res, 503, { ok: false, error: 'Dò mìn chưa sẵn sàng' });
                    const me = ctx.getUserData(userId);

                    if (path === '/api/mines/state') {
                        return sendJSON(res, 200, {
                            ok: true, tiles: mines.tiles,
                            maxWin: mines.maxWin, maxBet: mines.maxBet,
                            balance: me.points || 0,
                            game: mines.current(userId),
                            last: mines.last ? mines.last(userId) : null, // ván vừa xong, để vẽ lại màn kết thúc
                        });
                    }
                    // người chơi bấm "VÁN MỚI" -> bỏ màn kết thúc đang giữ
                    if (req.method === 'POST' && path === '/api/mines/dismiss') {
                        if (mines.dismiss) mines.dismiss(userId);
                        return sendJSON(res, 200, { ok: true });
                    }

                    if (req.method === 'POST' && path === '/api/mines/table') {
                        const body = await readBody(req);
                        const n = Math.floor(Number(body.numMines));
                        if (!Number.isFinite(n) || n < 1 || n > mines.tiles - 1) return sendJSON(res, 400, { ok: false, error: 'Số mìn không hợp lệ' });
                        return sendJSON(res, 200, { ok: true, table: mines.table(n) });
                    }

                    if (req.method === 'POST' && path === '/api/mines/start') {
                        const body = await readBody(req);
                        const r = mines.start(userId, me.name || ('web_' + userId.slice(-4)),
                            Math.floor(Number(body.numMines)), Math.floor(Number(body.bet)));
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, r);
                    }

                    if (req.method === 'POST' && path === '/api/mines/reveal') {
                        const body = await readBody(req);
                        const r = mines.reveal(userId, Math.floor(Number(body.tile)));
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, r);
                    }

                    if (req.method === 'POST' && path === '/api/mines/cashout') {
                        const r = mines.cashout(userId);
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, r);
                    }
                }

                // ===== LEO THANG ===== (giống dò mìn: tiền và hệ số tính ở index.js)
                if (path.startsWith('/api/stairs/')) {
                    if (!stairs) return sendJSON(res, 503, { ok: false, error: 'Leo thang chưa sẵn sàng' });
                    const me = ctx.getUserData(userId);

                    if (path === '/api/stairs/state') {
                        return sendJSON(res, 200, {
                            ok: true, floors: stairs.floors, cols: stairs.cols, maxFire: stairs.maxFire,
                            balance: me.points || 0, game: stairs.current(userId),
                            last: stairs.last ? stairs.last(userId) : null,
                        });
                    }
                    if (req.method === 'POST' && path === '/api/stairs/dismiss') {
                        if (stairs.dismiss) stairs.dismiss(userId);
                        return sendJSON(res, 200, { ok: true });
                    }
                    if (req.method === 'POST' && path === '/api/stairs/table') {
                        const body = await readBody(req);
                        const f = Math.floor(Number(body.fire));
                        if (!Number.isFinite(f) || f < 1 || f > stairs.maxFire) return sendJSON(res, 400, { ok: false, error: 'Số cầu lửa không hợp lệ' });
                        return sendJSON(res, 200, { ok: true, table: stairs.table(f) });
                    }
                    if (req.method === 'POST' && path === '/api/stairs/start') {
                        const body = await readBody(req);
                        const r = stairs.start(userId, me.name || ('web_' + userId.slice(-4)),
                            Math.floor(Number(body.fire)), Math.floor(Number(body.bet)));
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, r);
                    }
                    if (req.method === 'POST' && path === '/api/stairs/step') {
                        const body = await readBody(req);
                        const r = stairs.step(userId, Math.floor(Number(body.col)));
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, r);
                    }
                    if (req.method === 'POST' && path === '/api/stairs/cashout') {
                        const r = stairs.cashout(userId);
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, r);
                    }
                }

                return sendJSON(res, 404, { ok: false, error: 'not found' });
            }

            res.writeHead(404); res.end('not found');
        } catch (e) {
            ctx.writeLog('SYSTEM', `[WEB CƯỢC] Lỗi: ${e.message}`);
            try { sendJSON(res, 500, { ok: false, error: 'server error' }); } catch { }
        }
    });

    // ===== BLACKJACK QUA WEBSOCKET =====
    const bj = ctx.blackjack;
    if (bj) {
        // chat riêng của bàn blackjack (giữ 60 tin gần nhất, mỗi người 1 tin / 2 giây)
        const bjChat = () => { const db = ctx.getDb(); if (!Array.isArray(db._bjChat)) db._bjChat = []; return db._bjChat; };
        const bjChatAt = new Map();

        const wss = attachWebSocket(server, {
            path: '/ws',
            onMessage: (client, msg) => {
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'auth') {
                    const s = sessions()[msg.token];
                    const uid = s && (Date.now() - (s.ts || 0) <= SESSION_TTL) ? s.u : null;
                    if (!uid) { client.send({ type: 'authfail' }); return; }
                    client.meta.userId = uid;
                    const me = ctx.getUserData(uid);
                    client.send({ type: 'authok', userId: uid, balance: me.points || 0 });
                    client.send({ type: 'chat', list: bjChat().slice(-40) });
                    client.send(bjStateFor(uid));
                    return;
                }
                const uid = client.meta.userId;
                if (!uid) return;
                if (msg.type === 'chat') {
                    const text = String(msg.text || '').trim().slice(0, 200);
                    if (!text) return;
                    const last = bjChatAt.get(uid) || 0;
                    if (Date.now() - last < 2000) { client.send({ type: 'denied', error: 'Chậm thôi, 2 giây 1 tin' }); return; }
                    bjChatAt.set(uid, Date.now());
                    const me = ctx.getUserData(uid);
                    const line = { u: uid, name: me.name || ('web_' + uid.slice(-4)), text, ts: Date.now() };
                    const log = bjChat(); log.push(line); while (log.length > 60) log.shift();
                    // gửi cho mọi người: vừa vào khung chat, vừa bong bóng nổi trên đầu người nói
                    for (const c of wss.clients) c.send({ type: 'say', line });
                    return;
                }
                if (msg.type === 'bj') {
                    const me = ctx.getUserData(uid);
                    const name = me.name || ('web_' + uid.slice(-4));
                    let r;
                    if (msg.cmd === 'sit') r = bj.sit(uid, name, msg.seat | 0);
                    else if (msg.cmd === 'leave') r = bj.leave(uid);
                    else if (msg.cmd === 'bet') r = bj.bet(uid, msg.amount);
                    else if (msg.cmd === 'clearbet') r = bj.clearBet(uid);
                    else if (msg.cmd === 'act') r = bj.act(uid, msg.action);
                    if (r && r.error) client.send({ type: 'denied', error: r.error });
                    bjBroadcast();
                }
            },
        });

        const bjStateFor = (uid) => {
            const v = bj.view(uid);
            v.type = 'state'; v.balance = ctx.getUserData(uid).points || 0;
            return v;
        };
        let bjLastPhase = 'idle';
        function bjBroadcast() {
            const v = bj.view('_');
            // vừa sang kết quả -> bắn popup ăn/thua riêng từng người (bắt cả khi kết thúc do bấm Dừng)
            if (bjLastPhase !== 'result' && v.phase === 'result' && v.lastResult) {
                for (const c of wss.clients) {
                    const uid = c.meta.userId; if (!uid) continue;
                    const d = v.lastResult.result.find(x => x.userId === uid);
                    if (d) { const staked = d.hands.reduce((a, h) => a + h.bet, 0); c.send({ type: 'result', net: d.totalPayout - staked }); }
                }
            }
            bjLastPhase = v.phase;
            for (const c of wss.clients) if (c.meta.userId) c.send(bjStateFor(c.meta.userId));
        }
        setInterval(() => { try { bj.tick(); bjBroadcast(); } catch (e) { ctx.writeLog('SYSTEM', `[BLACKJACK] loop lỗi: ${e.message}`); } }, 1000);
    }

    server.listen(PORT, '0.0.0.0', () => ctx.writeLog('SYSTEM', `[WEB CƯỢC] Cổng web cược chạy ở cổng ${PORT}`));
    return server;
}

// ===== TRANG WEB (mobile-first, tiếng Việt) =====
const PAGE = [
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    '<title>Tài Xỉu — Cược nhanh</title>',
    '<style>',
    ':root{--bg:#12141a;--card:#1b1e27;--line:#2a2e3b;--tx:#e8eaf0;--muted:#8a90a3;--green:#3ddc84;--red:#ff5d5d;--blue:#4da3ff;--gold:#ffcf5c}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
    // KHÓA ZOOM TRÊN ĐIỆN THOẠI. iOS Safari bỏ qua user-scalable=no ở thẻ meta từ iOS 10,
    // nên phải chặn ở đây: pan-x pan-y = vẫn cuộn được nhưng CẤM chụm 2 ngón và
    // CẤM chạm 2 lần để phóng (trước đây bấm nhanh 2 ô là màn hình nhảy zoom).
    // Ô nhập chữ đều để font >= 16px, dưới mức đó iOS tự phóng khi bấm vào ô.
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-x pan-y}',
    'body{background:var(--bg);color:var(--tx);min-height:100vh;padding:14px;max-width:520px;margin:0 auto;',
    'touch-action:pan-x pan-y;-webkit-tap-highlight-color:transparent}',
    // Tab Blackjack trên MÀN RỘNG (máy tính): bung ra khỏi cột 520px cho bàn 5 ghế đủ chỗ.
    '@media (min-width:900px){#pageBj{width:min(96vw,1100px);margin-left:calc(50% - min(48vw,550px))}}',
    // nút/ô bấm: tắt hẳn double-tap zoom + không bôi đen chữ khi bấm nhanh
    'button,.mtile,.mstep,.cbtn,.chip{touch-action:manipulation;-webkit-user-select:none;user-select:none}',
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
    // Chữ chính TÀI/XỈU/CHẴN/LẺ tô màu theo cửa (trước đây đen thui giống hệt nhau,
    // liếc nhanh rất dễ bấm nhầm CHẴN với LẺ). Cùng tông với dòng small bên dưới.
    '.cbtn.tai{color:#a32626}.cbtn.xiu{color:#1d4f8f}.cbtn.chan{color:#156b4c}.cbtn.le{color:#63389b}',
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
    // ---- Bảng kết quả Leo Thang: ảnh phản ứng theo 3 kết cục (lên đỉnh / dừng đúng lúc / cháy) ----
    '#sPop{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;background:#000a;padding:16px}',
    '#sPop.show{display:flex;animation:popFade .18s ease-out}',
    '@keyframes popFade{from{opacity:0}to{opacity:1}}',
    '#sPop .box{background:#161a24;border-radius:18px;padding:14px 14px 16px;max-width:330px;width:100%;text-align:center;border:3px solid #2a3142;box-shadow:0 12px 40px #000c;animation:popIn .32s cubic-bezier(.2,1.3,.5,1)}',
    '@keyframes popIn{0%{transform:scale(.6) translateY(20px);opacity:0}100%{transform:none;opacity:1}}',
    '#sPop img{width:100%;max-width:230px;border-radius:12px;display:block;margin:0 auto 10px;background:#fff}',
    '#sPop .ttl{font-size:21px;font-weight:900;margin-bottom:2px}',
    '#sPop .amt{font-size:26px;font-weight:900;margin:4px 0 2px}',
    '#sPop .sub{font-size:13px;color:var(--muted)}',
    '#sPop .cls{margin-top:12px;width:100%;padding:11px;background:#232735;color:#dfe6f5;font-weight:800;border-radius:10px}',
    // viền + màu chữ đổi theo kết cục
    '#sPop.win .box{border-color:#2ec26a}#sPop.win .amt{color:#4fe38a}',
    '#sPop.top .box{border-color:var(--gold)}#sPop.top .amt{color:var(--gold)}',
    '#sPop.lose .box{border-color:#e0474b}#sPop.lose .amt{color:#ff8a8a}',
    '@keyframes fxfall{to{transform:translateY(115vh) rotate(680deg)}}',
    // bảng 20 ván gần nhất (kiểu soi cầu trong Discord: mã ván · 3 viên · tổng · kết quả)
    '.hrow{display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px}',
    '.hrow:last-child{border-bottom:0}',
    '.hrow .gid{color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 auto}',
    '.hrow .dd{display:flex;gap:3px;flex:0 0 auto}',
    '.mdie{width:17px;height:17px;background:#f4f1e8;border-radius:4px;position:relative;flex:0 0 auto}',
    '.mdie .p{position:absolute;width:3.4px;height:3.4px;border-radius:50%;background:#c0392b;transform:translate(-50%,-50%)}',
    '.hrow .sum{font-weight:800;flex:0 0 auto}',
    '.hrow .kq{font-weight:700;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.hrow .kq .t{color:#ff7b86}.hrow .kq .x{color:#7db4ff}.hrow .kq .sep{color:var(--muted);font-weight:400}',
    '.hrow .net{flex:0 0 auto;font-weight:800;font-variant-numeric:tabular-nums}',
    '.hrow .net.w{color:var(--green)}.hrow .net.l{color:var(--red)}',
    '.hrow.storm{background:linear-gradient(90deg,#4a3a1033,transparent);border-radius:6px;padding-left:5px}',
    '.hrow.storm .kq{color:var(--gold)}',
    '.cbtn.sel{border-color:var(--gold);border-bottom-width:2px;transform:translateY(3px);box-shadow:0 0 0 3px var(--gold),0 0 16px #ffcf5c88}',
    '.chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.chip{flex:1;background:#232735;padding:9px 0;font-size:13px;min-width:56px}',
    '.bet-btn{width:100%;margin-top:10px;background:var(--green);color:#0c2417;font-size:17px}',
    '.bet-btn:disabled{background:#2a2e3b;color:var(--muted)}',
    '.row{display:flex;justify-content:space-between;align-items:center}',
    '#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;padding:10px 18px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90%;z-index:99}',
    '.big{font-size:26px;font-weight:800}',
    '.hidden{display:none}',
    '.mine{font-size:13px;margin-top:6px;color:var(--gold)}',
    // ---- thanh chuyển trang (Tài Xỉu | Dò Mìn) ----
    '#nav{display:flex;gap:8px;margin-bottom:12px}',
    '#nav button{flex:1;background:var(--card);border:1px solid var(--line);color:var(--muted);font-size:14px;padding:13px 2px}',
    '#nav button.on{background:linear-gradient(180deg,#2b3346,#222839);color:var(--tx);border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c55}',
    // ---- dò mìn (bố cục theo sòng: thanh hệ số trên, 2 cột đếm kẹp lưới) ----
    // icon Dog Coin thật (ảnh trong game) — thay cho emoji 🐕 ở mọi chỗ
    '.dc{width:1.05em;height:1.05em;vertical-align:-.16em;object-fit:contain;display:inline-block}',
    '.dc.big{width:1.5em;height:1.5em;vertical-align:-.3em}',
    '#mineCard{background:linear-gradient(180deg,#1b2440,#141a2e);border:1px solid #2b3557}',
    // thanh mốc hệ số cuộn ngang: mốc đã ăn sáng vàng, mốc kế tiếp nhấp nháy xanh
    '#mbar{display:flex;gap:4px;overflow-x:auto;padding:6px;background:#0d1226;border:1px solid #2b3557;border-radius:10px;scrollbar-width:none}',
    '#mbar::-webkit-scrollbar{display:none}',
    '.mstep{flex:0 0 auto;min-width:54px;text-align:center;padding:6px 8px;border-radius:7px;font-size:12px;font-weight:800;background:#1a2340;color:#5f6c96;border:1px solid #263159}',
    '.mstep.hit{background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05;border-color:#a8842f}',
    '.mstep.now{background:linear-gradient(180deg,#4da3ff,#2c6fd0);color:#fff;border-color:#7dc0ff;animation:stepGlow 1.4s ease-in-out infinite}',
    '.mstep.capped{background:#3a2415;color:#ff9a5c;border-color:#7d4a1e;font-size:11px}',
    '.mstep.last{border-color:#c39bf0;box-shadow:inset 0 0 0 1px #c39bf055}',
    '.mstep.last .tag{display:block;font-size:9px;letter-spacing:.5px;color:#c39bf0;font-weight:700}',
    '.mstep.last.hit .tag{color:#7d5f1e}',
    '#mbar{cursor:grab}#mbar.drag{cursor:grabbing}',
    '@keyframes stepGlow{0%,100%{box-shadow:0 0 0 0 #4da3ff00}50%{box-shadow:0 0 12px 2px #4da3ff88}}',
    // sân: cột đếm Dogcoin còn lại | lưới 5×5 | cột đếm mìn
    '#mstage{display:grid;grid-template-columns:46px 1fr 46px;gap:8px;margin-top:10px}',
    '.mside{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:12px;background:#0d1226;border:1px solid #2b3557;padding:8px 0}',
    '.mside .ic{font-size:19px;line-height:1}.mside .n{font-size:20px;font-weight:900}',
    '.mside.coin .n{color:var(--gold)}.mside.bomb .n{color:#ff8a8a}',
    '.mgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}',
    '.mtile{aspect-ratio:1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:21px;font-weight:800;user-select:none;',
    'background:linear-gradient(180deg,#2f7fd6,#215aa8);border:1px solid #4b9ae8;border-bottom:4px solid #14346a;color:#bcdcff;cursor:pointer;transition:transform .08s}',
    '.mtile.can:active{transform:translateY(2px);border-bottom-width:2px}',
    '.mtile.dead{background:linear-gradient(180deg,#232a3d,#1a2030);border-color:#2c3450;border-bottom-color:#141824;color:#4a5372;cursor:default}',
    '.mtile.coin{background:linear-gradient(180deg,#ffe9a8,#e8bf58);border-color:#a8842f;border-bottom-color:#7d5f1e;cursor:default;animation:coinPop .28s ease-out}',
    '@keyframes coinPop{0%{transform:scale(.55)}60%{transform:scale(1.14)}100%{transform:scale(1)}}',
    '.mtile.boom{background:linear-gradient(180deg,#e05555,#8e2020);border-color:#ff9a9a;border-bottom-color:#5d1414;color:#fff;cursor:default;animation:boomPop .32s ease-out}',
    '@keyframes boomPop{0%{transform:scale(.5) rotate(-20deg)}70%{transform:scale(1.28) rotate(8deg)}100%{transform:scale(1)}}',
    '.mtile.shown{background:linear-gradient(180deg,#3a2030,#2a1622);border-color:#6b3a4a;border-bottom-color:#1e1017;color:#c46b7b;cursor:default}',
    // hàng chỉnh tiền cược / số mìn
    '.mctl{display:flex;align-items:center;gap:6px;margin-top:10px}',
    '.mctl .box{flex:1;background:#0d1226;border:1px solid #2b3557;border-radius:10px;padding:5px 8px;text-align:center}',
    '.mctl .lab{font-size:11px;color:var(--muted)}',
    '.mctl .lab.big{font-size:13px;font-weight:800;color:#ffb35c}',
    '.mctl button{background:#1a2340;border:1px solid #2b3557;color:#cfe0ff;min-width:44px;padding:12px 8px;font-size:14px}',
    '.mctl button:disabled{opacity:.35}',
    '.mctl button.mp{min-width:38px;padding:12px 4px;color:#8fa6d8}',
    '.mctl button.mp.on{background:linear-gradient(180deg,#2f7fd6,#215aa8);border-color:#4b9ae8;color:#fff}',
    '#mBet,#mMines{width:100%;background:transparent;border:0;text-align:center;font-size:17px;font-weight:900;color:var(--gold);padding:0;margin:0}',
    '.mgo{width:100%;margin-top:10px;font-size:16px;font-weight:900;padding:14px 0}',
    '.mgo.start{background:linear-gradient(180deg,#4dd07a,#249a52);color:#04240f}',
    '.mgo.cash{background:linear-gradient(180deg,#ffe9a8,#e8bf58);color:#3d2c05}',
    '.mgo:disabled{background:#232a3d;color:#5a6480}',
    // ---- leo thang: tháp 10 tầng, tầng trên cùng ở trên ----
    '#stair{background:radial-gradient(120% 80% at 50% 0%,#3a2020 0%,#22161a 55%,#170f12 100%);border:1px solid #4a2c2c}',
    '#tower{display:flex;flex-direction:column;gap:5px;margin-top:10px}',
    '.srow{display:flex;align-items:center;gap:5px;transition:opacity .2s}',
    '.srow.far{opacity:.45}',                       // tầng còn xa thì mờ đi cho đỡ rối
    '.srow .cells{display:flex;gap:4px;flex:1}',
    '.srow .mx{flex:0 0 56px;text-align:center;font-size:11px;font-weight:800;padding:5px 2px;border-radius:7px;',
    'background:#241820;color:#8a6a72;border:1px solid #3d2830}',
    '.srow.done .mx{background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05;border-color:#a8842f}',
    '.srow.now .mx{background:linear-gradient(180deg,#ff8a5c,#d9541e);color:#fff;border-color:#ffb08a;animation:sGlow 1.4s ease-in-out infinite}',
    '@keyframes sGlow{0%,100%{box-shadow:0 0 0 0 #ff8a5c00}50%{box-shadow:0 0 12px 2px #ff8a5c88}}',
    '.scell{flex:1;aspect-ratio:1.6;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:16px;position:relative;',
    'background:linear-gradient(180deg,#3a2a30,#2a1e24);border:1px solid #4a3640;border-bottom:3px solid #1c1418;color:#6b5560}',
    // tầng đang đứng: bậc sáng lên, mời gọi bấm
    '.srow.now .scell{background:linear-gradient(180deg,#6b4038,#472823);border-color:#a5675a;cursor:pointer}',
    '.srow.now .scell:hover{background:linear-gradient(180deg,#875046,#5a322b);border-color:#d18a76}',
    '.srow.now .scell:active{transform:translateY(2px);border-bottom-width:1px}',
    // ô đã bước qua: sáng vàng, có đồng Dogcoin
    '.scell.step{background:linear-gradient(180deg,#ffe9a8,#e8bf58);border-color:#a8842f;border-bottom-color:#7d5f1e}',
    '.scell.fire{background:linear-gradient(180deg,#e05555,#8e2020);border-color:#ff9a9a;color:#fff}',
    '.scell.boom{background:linear-gradient(180deg,#ff7b3a,#c23c10);border-color:#ffb08a;color:#fff;animation:boomPop .32s ease-out}',
    '.scell img.dc{width:20px;height:20px}',
    // nhân vật đứng trên bậc vừa leo tới
    '.hero{position:absolute;bottom:2px;left:50%;width:auto;height:38px;transform:translateX(-50%);',
    'pointer-events:none;filter:drop-shadow(0 3px 4px #000a);animation:heroHop .45s ease-out;z-index:2}',
    '@keyframes heroHop{0%{transform:translate(-50%,26px) scale(.7)}55%{transform:translate(-50%,-7px) scale(1.08)}100%{transform:translate(-50%,0) scale(1)}}',
    '.hero.idle{animation:heroIdle 2.2s ease-in-out infinite}',
    '@keyframes heroIdle{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-3px)}}',
    // nhân vật lúc chưa vào ván: đứng dưới chân tháp
    '#heroBase{display:flex;align-items:flex-end;justify-content:center;height:44px;margin-top:6px}',
    '#heroBase img{height:42px;filter:drop-shadow(0 3px 4px #000a);animation:heroIdle 2.2s ease-in-out infinite}',
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
    '<h1>🎰 Sòng Dogcoin — chơi trên web</h1>',
    '<div class="muted">Có <b>Tài Xỉu</b> (đặt cược + nặn xí ngầu) và <b>Dò Mìn</b>. Lấy mã PIN bằng nút <b>🌐 Cược trên web</b> ở bảng Tài Xỉu trong Discord.</div>',
    '<input id="uid" inputmode="numeric" placeholder="Discord ID của bạn">',
    '<input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">',
    '<button class="btn-full" onclick="login()">Vào sòng</button>',
    '</div>',

    '<div id="app" class="hidden">',
    '<div class="card row"><div><div class="muted">Số dư của <b id="myName"></b></div>',
    '<div class="big"><img class="dc" src="/dogcoin.png" alt=""> <span id="bal">0</span></div></div>',
    '<div style="display:flex;gap:8px;align-items:center">',
    '<button id="sndBtn" title="Tắt/bật tiếng" style="background:#232735;min-width:46px;font-size:17px" onclick="toggleSnd()">🔊</button>',
    '<button style="background:#232735" onclick="logout()">Thoát</button></div></div>',

    '<div id="nav">',
    '<button id="navTx" class="on" onclick="go(\'tx\')">🎲 Tài Xỉu</button>',
    '<button id="navMine" onclick="go(\'mine\')">💣 Dò Mìn</button>',
    '<button id="navStair" onclick="go(\'stair\')">🪜 Leo Thang</button>',
    '<button id="navBj" onclick="go(\'bj\')">🂡 Blackjack</button>',
    '</div>',

    // ================= TRANG TÀI XỈU =================
    '<div id="pageTx">',
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

    '</div>', // hết #pageTx

    // ================= TRANG DÒ MÌN =================
    '<div id="pageMine" class="hidden">',
    '<div class="card" id="mineCard">', // KHÔNG đặt id="mine": trùng với dòng cược ở trang Tài Xỉu
    '<div class="row" style="margin-bottom:8px"><h2 style="margin:0">💣 Dò Mìn</h2><div class="muted" id="mStat">Chọn số mìn và tiền cược</div></div>',

    '<div id="mbar"></div>',

    '<div id="mstage">',
    '<div class="mside coin"><img class="dc big" src="/dogcoin.png" alt=""><div class="n" id="mLeft">–</div></div>',
    '<div class="mgrid" id="mGrid"></div>',
    '<div class="mside bomb"><div class="ic">💣</div><div class="n" id="mBombN">–</div></div>',
    '</div>',

    '<div class="mctl">',
    '<div class="box"><div class="lab">Tiền cược</div><input id="mBet" inputmode="numeric" value="100" oninput="mBand()"></div>',
    '<button id="mDouble" onclick="mMul(2)">x2</button>',
    '<button id="mMax" onclick="mAllIn()">MAX</button>',
    '</div>',

    '<div class="mctl">',
    '<button id="mMinus" onclick="mStep(-1)">−</button>',
    '<div class="box"><div class="lab" id="mMinesLab">Số mìn</div><input id="mMines" inputmode="numeric" value="3" oninput="mTable()"></div>',
    '<button id="mPlus" onclick="mStep(1)">+</button>',
    '</div>',

    '<button class="mgo start" id="mGo" onclick="mGoClick()">⛏️ BẮT ĐẦU ĐÀO</button>',
    '<div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Mở ô càng nhiều hệ số càng cao — trúng mìn là mất tiền cược ván đó.</div>',
    '<div class="muted" id="mNote" style="font-size:12px;margin-top:3px;text-align:center;color:#ff9a5c"></div>',
    '</div>',
    '</div>', // hết #pageMine

    // ================= TRANG LEO THANG =================
    '<div id="pageStair" class="hidden">',
    '<div class="card" id="stair">',
    '<div class="row" style="margin-bottom:6px"><h2 style="margin:0">🪜 Leo Thang</h2><div class="muted" id="sStat">Chọn số cầu lửa và tiền cược</div></div>',
    '<div id="tower"></div>',
    '<div id="heroBase"><img src="/hero.png" alt=""></div>',

    '<div class="mctl">',
    // nút MAX tàng hình bên trái = đối trọng cho MAX thật bên phải -> ô cược
    // rộng đúng bằng ô cầu lửa (hàng dưới có nút − / + hai bên), nhìn thẳng hàng
    '<button style="visibility:hidden" tabindex="-1">MAX</button>',
    '<div class="box"><div class="lab">Tiền cược</div><input id="sBet" inputmode="numeric" value="100" oninput="sBand()"></div>',
    '<button id="sMax" onclick="sAllIn()">MAX</button>',
    '</div>',
    '<div class="mctl">',
    '<button id="sMinus" onclick="sStep(-1)">−</button>',
    '<div class="box"><div class="lab big" id="sFireLab">🔥 Cầu lửa mỗi tầng</div><input id="sFire" inputmode="numeric" value="2" oninput="sTable()"></div>',
    '<button id="sPlus" onclick="sStep(1)">+</button>',
    '</div>',
    '<button class="mgo start" id="sGo" onclick="sGoClick()">🪜 BẮT ĐẦU LEO</button>',
    '<div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Càng nhiều cầu lửa hệ số càng cao — đạp trúng lửa là mất tiền cược ván đó.</div>',
    '</div>',
    '</div>', // hết #pageStair

    // ================= TRANG BLACKJACK (tab thứ 4) =================
    // Nhúng nguyên trang /blackjack bằng iframe cho gọn & CÁCH LY hoàn toàn (hai bên
    // đều xài .card/$/render/WS... trộn chung là vỡ). Token đăng nhập truyền qua #tok
    // để KHỎI đăng nhập lại. Chỉ nạp src lần đầu mở tab (lazy) — xem go().
    '<div id="pageBj" class="hidden">',
    '<iframe id="bjFrame" title="Blackjack" style="display:block;width:100%;height:82vh;min-height:540px;border:0;border-radius:12px;background:#0a1f14"></iframe>',
    '</div>',

    // Chat nằm NGOÀI cả ba trang -> mọi game dùng chung một phòng, đổi tab vẫn thấy
    // nguyên cuộc trò chuyện. Đặt TRÊN bảng lịch sử để khỏi phải cuộn xa mới tới ô chat.
    '<div class="card" id="chatCard"><h2>💬 Chat sòng</h2>',
    '<div id="chatBox"></div>',
    '<div style="display:flex;gap:8px;margin-top:8px">',
    '<input id="chatIn" maxlength="200" placeholder="Chém gió..." style="margin-top:0;flex:1">',
    '<button style="background:var(--blue);min-width:64px" onclick="sendChat()">Gửi</button>',
    '</div></div>',

    // Bảng lịch sử Tài Xỉu: nằm dưới cùng, chỉ hiện khi đang ở trang Tài Xỉu.
    '<div class="card" id="histCard"><h2>🔮 Lịch sử 20 ván gần nhất</h2>',
    '<div id="hist20" class="muted" style="font-size:13px">Chưa có ván nào.</div></div>',

    '<div id="winpop"></div>',
    // Bảng kết quả Leo Thang (ảnh phản ứng). Nằm ngoài mọi trang, chỉ Leo Thang gọi.
    '<div id="sPop"><div class="box">',
    '<img id="sPopImg" src="" alt="">',
    '<div class="ttl" id="sPopTtl"></div>',
    '<div class="amt" id="sPopAmt"></div>',
    '<div class="sub" id="sPopSub"></div>',
    '<button class="cls" onclick="sPopClose()">Đóng</button>',
    '</div></div>',
    '<div id="toast"></div>',
    '<script>',
    'var TOKEN=localStorage.getItem("play_token")||"";var SEL="";var TT=0;var LOCKS=10;var PHASE="off";var BAL=0;',
    'var NAN=null;var revealedGame=0;var dragging=false;var paperX=0,paperY=0,baseX=0,baseY=0,dragX0=0,dragY0=0;',
    'var MYID="";var lastSettled=-1;',
    // đồng hồ máy người chơi có thể lệch server vài giây -> đếm giờ theo GIỜ SERVER
    'var CLOCK_OFF=0;function srvNow(){return Math.floor(Date.now()/1000)+CLOCK_OFF}',
    'function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2500)}',
    // ===== ÂM THANH NỔ / CHÁY =====
    // TỔNG HỢP bằng Web Audio, KHÔNG kèm file mp3 nào: giữ đúng nguyên tắc dự án
    // (không thêm asset/phụ thuộc), không lo bản quyền, không tốn băng thông tải file.
    // Tiếng nổ = ồn trắng tắt dần qua bộ lọc quét từ cao xuống trầm + một cú thụp bass.
    'var AC=null;var SND=localStorage.getItem("play_snd")!=="0";',
    'function acGet(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}',
    'if(AC.state==="suspended")AC.resume();return AC}',
    // Điện thoại chỉ cho phát tiếng SAU khi người dùng chạm màn hình. Tiếng nổ lại phát
    // trong .then() của fetch (đã rời khỏi cú chạm) -> mở khoá sẵn ở lần chạm ĐẦU TIÊN.
    'document.addEventListener("pointerdown",function(){acGet()},{once:true});',
    // kind: "boom" = mìn nổ (trầm, nặng) | "fire" = bén lửa (rát, xì hơi)
    'function playBoom(kind){',
    'if(!SND)return;var c=acGet();if(!c)return;var t=c.currentTime;var fire=kind==="fire";',
    'var dur=fire?0.75:0.95;',
    // 1) mảnh vỡ / lửa bén: ồn trắng biên độ tắt dần
    'var len=Math.floor(c.sampleRate*dur),buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);',
    'for(var i=0;i<len;i++){d[i]=(Math.random()*2-1)*Math.pow(1-i/len,fire?1.4:2.2)}',
    'var src=c.createBufferSource();src.buffer=buf;',
    'var f=c.createBiquadFilter();',
    'if(fire){f.type="bandpass";f.Q.value=0.8;f.frequency.setValueAtTime(2600,t);f.frequency.exponentialRampToValueAtTime(420,t+dur)}',
    'else{f.type="lowpass";f.frequency.setValueAtTime(1800,t);f.frequency.exponentialRampToValueAtTime(70,t+0.7)}',
    'var g=c.createGain();g.gain.setValueAtTime(fire?0.55:0.85,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);',
    'src.connect(f);f.connect(g);g.connect(c.destination);src.start(t);src.stop(t+dur);',
    // 2) cú thụp trầm cho có LỰC (mìn nặng hơn lửa)
    'var o=c.createOscillator();o.type="sine";',
    'o.frequency.setValueAtTime(fire?90:150,t);o.frequency.exponentialRampToValueAtTime(fire?40:28,t+0.35);',
    'var g2=c.createGain();g2.gain.setValueAtTime(fire?0.35:0.8,t);g2.gain.exponentialRampToValueAtTime(0.001,t+(fire?0.4:0.55));',
    'o.connect(g2);g2.connect(c.destination);o.start(t);o.stop(t+0.6)}',
    // Tắt/bật tiếng — chơi lúc nửa đêm hay trong giờ làm thì cần tắt được.
    'function toggleSnd(){SND=!SND;localStorage.setItem("play_snd",SND?"1":"0");',
    'document.getElementById("sndBtn").textContent=SND?"🔊":"🔇";if(SND)playBoom("boom")}',
    'function api(p,body){return fetch(p,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!j.ok)throw new Error(j.error||("HTTP "+r.status));return j})})}',
    'function login(){var u=document.getElementById("uid").value.trim();var p=document.getElementById("pin").value.trim();if(!u||!p)return toast("Nhập đủ ID + PIN");fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})}).then(function(r){return r.json()}).then(function(j){if(!j.ok)return toast(j.error||"Sai thông tin");TOKEN=j.token;localStorage.setItem("play_token",TOKEN);show(j.name)}).catch(function(){toast("Lỗi mạng")})}',
    'function logout(){TOKEN="";localStorage.removeItem("play_token");location.reload()}',
    'function show(n){document.getElementById("login").classList.add("hidden");document.getElementById("app").classList.remove("hidden");',
    'if(n)document.getElementById("myName").textContent=n;initPaper();',
    'document.getElementById("sndBtn").textContent=SND?"🔊":"🔇";',   // nhớ lựa chọn tắt tiếng lần trước
    // Tài Xỉu vẫn tự làm mới ngầm kể cả khi đang ở trang Dò Mìn (số dư luôn đúng,
    // quay lại là thấy ván hiện tại ngay, không phải chờ).
    'refresh();setInterval(refresh,2000);setInterval(tick,250);',
    'mBarDrag();mSync();sSync();',
    'var saved=localStorage.getItem("play_page");',
    'go(saved==="mine"||saved==="stair"||saved==="bj"?saved:"tx")}',
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
    'el.innerHTML=(net>=0?"+":"")+net.toLocaleString("vi-VN")+\' <img class="dc" src="/dogcoin.png" alt="">\';',
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
    'renderHist20(j.history||[]);',
    'renderChat(j.chat||[]);',
    '}).catch(function(e){if(String(e.message).indexOf("unauth")>=0)logout()})}',
    // Bảng 20 ván gần nhất — bố cục như bảng soi cầu trong Discord:
    // mã ván · 3 viên xí ngầu · tổng · TÀI/XỈU | CHẴN/LẺ. Ván nào mình có đặt thì
    // hiện thêm ăn/thua ở cuối dòng (thay cho card "10 ván của bạn" đã bỏ).
    'function mdie(v){var s=\'<div class="mdie">\';(PIPS[v]||[]).forEach(function(p){',
    's+=\'<div class="p" style="left:\'+p[0]+\'%;top:\'+p[1]+\'%"></div>\'});return s+"</div>"}',
    'function renderHist20(list){var box=document.getElementById("hist20");',
    'if(!list.length){box.innerHTML="Chưa có ván nào.";return}',
    'box.innerHTML=list.slice(0,20).map(function(h){',
    'var stake=0,winAmt=0,joined=false;',
    '(h.bets||[]).forEach(function(b){if(b.u===MYID){stake+=b.amount;joined=true}});',
    '(h.winners||[]).forEach(function(w){if(w.u===MYID)winAmt+=w.amount});',
    'var net=winAmt-stake;',
    'var tai=(h.tx==="TÀI"||h.tx==="TAI");',
    'var kq=h.storm?"🌪️ BÃO":(\'<span class="\'+(tai?"t":"x")+\'">\'+h.tx+\'</span><span class="sep"> | </span>\'+h.cl);',
    'return \'<div class="hrow\'+(h.storm?" storm":"")+\'">\'+',
    '\'<span class="gid">#\'+String(h.gameId).padStart(5,"0")+"</span>"+',
    '\'<span class="dd">\'+h.dice.map(mdie).join("")+"</span>"+',
    '\'<span class="sum">(\'+h.sum+")</span>"+',
    '\'<span class="kq">\'+kq+"</span>"+',
    '(joined?\'<span class="net \'+(net>=0?"w":"l")+\'">\'+(net>=0?"+":"")+net.toLocaleString("vi-VN")+"</span>":"")+',
    '"</div>"}).join("")}',
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
    // ===== DÒ MÌN =====
    // Client KHÔNG tự tính tiền: mọi hệ số/thưởng lấy từ server. Ở đây chỉ vẽ.
    'var COINIMG=\'<img class="dc big" src="/dogcoin.png" alt="">\';',
    'var MT=24;var MG=null;var mBusy=false;var MTAB=[];var MOVER=false;var MLAST=null;var MAXWIN=0;var MAXBET=0;',
    'function $(id){return document.getElementById(id)}',
    // Rút gọn y như sòng Mines thật: x798.37 · x2.07k · x114.16k · x1.02M
    // (cắt xuống 2 số lẻ sau khi chia, tự bỏ số 0 thừa)
    'function fx(m){if(m>=1e6)return "x"+(Math.floor(m/1e4)/100)+"M";if(m>=1e3)return "x"+(Math.floor(m/10)/100)+"k";return "x"+m.toFixed(2)}',
    'function vnd(n){return Math.floor(n).toLocaleString("vi-VN")}',
    'function go(p){',
    '$("pageTx").classList.toggle("hidden",p!=="tx");',
    '$("pageMine").classList.toggle("hidden",p!=="mine");',
    '$("pageStair").classList.toggle("hidden",p!=="stair");',
    '$("pageBj").classList.toggle("hidden",p!=="bj");',
    '$("histCard").classList.toggle("hidden",p!=="tx");', // lịch sử là của Tài Xỉu
    '$("chatCard")&&$("chatCard").classList.toggle("hidden",p==="bj");', // blackjack có chat riêng bên trong
    '$("navTx").classList.toggle("on",p==="tx");',
    '$("navMine").classList.toggle("on",p==="mine");',
    '$("navStair").classList.toggle("on",p==="stair");',
    '$("navBj").classList.toggle("on",p==="bj");',
    // Mở tab blackjack: nạp iframe LẦN ĐẦU, kèm token để tự đăng nhập (không nhập lại).
    'if(p==="bj"){var _f=$("bjFrame");if(_f&&!_f.src&&TOKEN)_f.src="/blackjack#tok="+encodeURIComponent(TOKEN)}',
    'localStorage.setItem("play_page",p);',
    'if(p==="mine")mSync();else if(p==="stair")sSync();else if(p!=="bj")refresh()}',
    'function mNum(id){return parseInt($(id).value)||0}',
    'function mCap(){return Math.min(BAL,MAXBET||BAL)}', // cược không quá số dư và không quá trần
    'function mMul(k){if(MG)return;var b=Math.floor(mNum("mBet")*k);if(b<1)b=1;if(b>mCap())b=mCap();$("mBet").value=b;mBand()}',
    'function mAllIn(){if(MG)return;$("mBet").value=mCap();mBand()}',
    'function mStep(d){if(MG)return;var n=mNum("mMines")+d;if(n<1)n=1;if(n>MT-1)n=MT-1;$("mMines").value=n;mTable()}',
    // Bảng hệ số lấy TỪ SERVER (client không tự tính, để không lệch với tiền thật khi trả).
    'var mTimer=0;',
    'function mTable(){clearTimeout(mTimer);mTimer=setTimeout(function(){',
    'var n=mNum("mMines");if(n<1||n>MT-1){n=Math.min(Math.max(n,1),MT-1);$("mMines").value=n}',
    'api("/api/mines/table",{numMines:n}).then(function(j){MTAB=j.table||[];mBar();mBand()}).catch(function(){})},150)}',
    // thanh mốc hệ số: đã ăn = vàng, mốc kế tiếp = xanh nhấp nháy, tự cuộn theo
    // Mốc nào cược hiện tại đã vượt trần thì hiện thẳng "TRẦN" — người chơi thấy ngay
    // đào tới đâu là hết ăn thêm, thay vì đào tiếp rồi mới biết bị cắt.
    'function mBar(){var done=MG?MG.revealed.length:0;var bet=MG?MG.bet:mNum("mBet");',
    '$("mbar").innerHTML=MTAB.map(function(m,i){var k=i+1;',
    'var c=k<=done?"hit":(k===done+1?"now":"");',
    'var cap=MAXWIN&&bet>0&&Math.floor(bet*m)>MAXWIN;if(cap)c+=" capped";',
    // Mốc cuối = mở hết ô an toàn. Đánh dấu hẳn để không ai tưởng bảng bị thiếu.
    'if(k===MTAB.length)c+=" last";',
    'return \'<div class="mstep \'+c+\'" id="ms\'+k+\'">\'+(cap?"TRẦN":fx(m))+',
    '(k===MTAB.length?\'<span class="tag">MỞ HẾT</span>\':"")+"</div>"}).join("");',
    'mBarScroll(done)}',
    // Đào tới đâu thanh hệ số chạy theo tới đó, luôn giữ mốc kế tiếp ở giữa.
    // Tự tính scrollLeft chứ không dùng scrollIntoView — hàm đó có thể kéo trôi cả trang.
    'function mBarScroll(done){var bar=$("mbar");var el=$("ms"+(done+1))||$("ms"+done);if(!bar||!el)return;',
    'var to=el.offsetLeft-(bar.clientWidth/2)+(el.offsetWidth/2);',
    'if(to<0)to=0;var max=bar.scrollWidth-bar.clientWidth;if(to>max)to=max;',
    'if(bar.scrollTo)bar.scrollTo({left:to,behavior:"smooth"});else bar.scrollLeft=to}',
    // Trên máy tính không vuốt được như điện thoại -> cho giữ chuột kéo ngang thanh hệ số.
    // Kéo quá 4px thì coi là đang cuộn, không tính là bấm chọn mốc.
    'function mBarDrag(){var b=$("mbar");var down=false,x0=0,sl=0,moved=0;',
    'b.addEventListener("mousedown",function(e){down=true;moved=0;x0=e.pageX;sl=b.scrollLeft;b.classList.add("drag");e.preventDefault()});',
    'window.addEventListener("mousemove",function(e){if(!down)return;var d=e.pageX-x0;moved=Math.max(moved,Math.abs(d));b.scrollLeft=sl-d});',
    'window.addEventListener("mouseup",function(){down=false;b.classList.remove("drag")});',
    'b.addEventListener("click",function(e){if(moved>4){e.stopPropagation();e.preventDefault()}},true);',
    // lăn chuột dọc cũng cuộn ngang được cho tiện
    'b.addEventListener("wheel",function(e){if(!e.deltaY)return;b.scrollLeft+=e.deltaY;e.preventDefault()},{passive:false})}',
    // hai cột đếm + nút hành động (nút đổi giữa BẮT ĐẦU và NHẬN TIỀN)
    'function mBand(){var go=$("mGo");',
    'if(MG){',
    '$("mLeft").textContent=(MG.maxDiamonds-MG.revealed.length);',
    '$("mBombN").textContent=MG.totalMines;',
    '$("mStat").textContent=MG.totalMines+" mìn · cược "+vnd(MG.bet)+" · "+fx(MG.multi)+(MG.capped?" · chạm trần":"");',
    'go.className="mgo cash";',
    'go.innerHTML=MG.revealed.length?("NHẬN TIỀN "+vnd(MG.cashout)+\' <img class="dc" src="/dogcoin.png" alt="">\'):"⛏️ MỞ 1 Ô ĐỂ BẮT ĐẦU ĂN";',
    'go.disabled=!MG.revealed.length;',
    '}else if(MOVER){',                                   // ván vừa xong, đang xem lại bàn
    'go.className="mgo start";go.textContent="🔄 VÁN MỚI";go.disabled=false;',
    '}else{',
    'var n=Math.min(Math.max(mNum("mMines"),1),MT-1);',
    '$("mLeft").textContent=(MT-n);$("mBombN").textContent=n;',
    'go.className="mgo start";go.textContent="⛏️ BẮT ĐẦU ĐÀO";go.disabled=false;',
    '$("mStat").textContent=MTAB.length?("mở 1 ô "+fx(MTAB[0])+" · mở hết "+fx(MTAB[MTAB.length-1])):"Chọn số mìn và tiền cược";}',
    '["mDouble","mMax","mMinus","mPlus"].forEach(function(id){$(id).disabled=!!MG});',
    '$("mBet").disabled=!!MG;$("mMines").disabled=!!MG;mBar()}',
    'function mGoClick(){if(MG)mCashout();else if(MOVER)mNewGame();else mStartGame()}',
    'function mNewGame(){MOVER=false;MLAST=null;api("/api/mines/dismiss",{}).catch(function(){});',
    'mDrawGrid();mTable();mBar();mBand()}',
    // Lấy trạng thái từ server: F5 hay mất mạng giữa ván thì quay lại vẫn đúng chỗ cũ.
    'function mSync(){api("/api/mines/state").then(function(j){MT=j.tiles||24;setBal(j.balance);',
    '$("mMinesLab").textContent="Số mìn (1–"+(MT-1)+")";',
    'MAXWIN=j.maxWin||0;MAXBET=j.maxBet||0;',
    'MG=j.game||null;MLAST=(!MG&&j.last)?j.last:null;MOVER=!!MLAST;mDrawGrid();',
    'if(MG){$("mMines").value=MG.totalMines;$("mBet").value=MG.bet}',
    'else if(MLAST){$("mMines").value=MLAST.totalMines;$("mBet").value=MLAST.bet;mPaintLast()}',
    'if(MAXBET)$("mNote").textContent="Cược tối đa "+vnd(MAXBET)+" · nhận tối đa "+vnd(MAXWIN)+" mỗi ván";',
    'mTable();mBar();mBand()}).catch(function(){})}',
    // Vẽ lại màn kết thúc ván vừa xong (server còn giữ) — thoát ra vào lại vẫn thấy.
    'function mPaintLast(){if(!MLAST)return;',
    'for(var i=0;i<MT;i++){var t=$("mk"+i);if(!t)continue;t.onclick=null;',
    'if(i===MLAST.hit){t.className="mtile boom";t.innerHTML="💣"}',
    'else if(MLAST.revealed.indexOf(i)>=0){t.className="mtile coin";t.innerHTML=COINIMG}',
    'else if(MLAST.mines.indexOf(i)>=0){t.className="mtile shown";t.innerHTML="💣"}',
    'else{t.className="mtile dead";t.textContent="?"}}',
    'var w=MLAST.amount>=0;',
    '$("mStat").textContent=(w?(MLAST.result==="Jackpot"?"🎉 Jackpot — nhận ":"✅ Đã dừng — nhận "):"💥 Trúng mìn — thua ")+',
    'vnd(Math.abs(w?MLAST.amount+MLAST.bet:MLAST.bet))}',
    'function mDrawGrid(){var g=$("mGrid");g.innerHTML="";',
    'for(var i=0;i<MT;i++){var t=document.createElement("div");t.id="mk"+i;t.dataset.i=i;',
    'if(MG&&MG.revealed.indexOf(i)>=0){t.className="mtile coin";t.innerHTML=COINIMG}',
    'else if(MG){t.className="mtile can";t.textContent="?";t.onclick=function(){mDig(parseInt(this.dataset.i))}}',
    'else{t.className="mtile dead";t.textContent="?"}',
    'g.appendChild(t)}}',
    'function mRevealAll(mines){for(var i=0;i<MT;i++){var t=$("mk"+i);if(!t)continue;t.onclick=null;',
    'if(t.classList.contains("coin")||t.classList.contains("boom"))continue;',
    'if(mines&&mines.indexOf(i)>=0){t.className="mtile shown";t.textContent="💣"}else{t.className="mtile dead"}}}',
    // Ván xong thì GIỮ NGUYÊN màn hình (đã lộ hết mìn) cho tới khi người chơi bấm
    // VÁN MỚI — trước đây tự xoá sau 2 giây, chưa kịp nhìn đã mất.
    'function mEnd(msg,net,mines){mRevealAll(mines);MG=null;MOVER=true;',
    '$("mStat").textContent=msg;',
    'if(net!==null)showNet(net);',
    'mBand()}',
    'function mDig(i){if(!MG||mBusy)return;var t=$("mk"+i);',
    'if(!t||!t.classList.contains("can"))return;mBusy=true;',
    'var stake=MG.bet;',
    'api("/api/mines/reveal",{tile:i}).then(function(j){mBusy=false;',
    'if(typeof j.balance==="number")setBal(j.balance);',
    'if(j.hit){t.className="mtile boom";t.textContent="💣";playBoom("boom");',
    'toast("💥 BÙM! Mất "+stake.toLocaleString("vi-VN")+" Dogcoin");',
    'return mEnd("💥 Trúng mìn — thua "+stake.toLocaleString("vi-VN"),-stake,j.mines)}',
    't.className="mtile coin";t.innerHTML=COINIMG;t.onclick=null;',
    'if(j.jackpot){toast("🎉 JACKPOT! Nhận "+j.win.toLocaleString("vi-VN"));',
    'return mEnd("🎉 Jackpot — nhận "+j.win.toLocaleString("vi-VN"),j.win-stake,j.mines)}',
    'MG=j.state;mBar();mBand()}).catch(function(e){mBusy=false;toast("❌ "+e.message);mSync()})}',
    'function mStartGame(){if(mBusy||MOVER)return;var n=mNum("mMines"),b=mNum("mBet");',
    'if(n<1||n>MT-1)return toast("❌ Số mìn từ 1 đến "+(MT-1));',
    'if(b<=0)return toast("❌ Nhập số Dogcoin");',
    'if(b>BAL)return toast("❌ Không đủ Dogcoin!");',
    'mBusy=true;api("/api/mines/start",{numMines:n,bet:b}).then(function(j){mBusy=false;',
    'setBal(j.balance);MG=j.state;mDrawGrid();mBar();mBand()',
    '}).catch(function(e){mBusy=false;toast("❌ "+e.message);mSync()})}',
    'function mCashout(){if(!MG||mBusy)return;mBusy=true;var stake=MG.bet;',
    'api("/api/mines/cashout",{}).then(function(j){mBusy=false;setBal(j.balance);',
    'toast("✅ Nhận "+j.win.toLocaleString("vi-VN")+" Dogcoin");',
    'mEnd("✅ Đã dừng — nhận "+j.win.toLocaleString("vi-VN"),j.win-stake,j.mines)',
    '}).catch(function(e){mBusy=false;toast("❌ "+e.message);mSync()})}',
    'function setBal(v){if(typeof v!=="number")return;BAL=v;$("bal").textContent=v.toLocaleString("vi-VN")}',
    '',
    // ===== LEO THANG =====
    // Cùng nguyên tắc với dò mìn: client không tự tính tiền, mọi hệ số lấy từ server.
    'var SF=10,SC=8,SMAXF=5,SG=null,sBusy=false,STAB=[],SOVER=false,SLAST=null;',
    'function sNum(id){return parseInt($(id).value)||0}',
    'function sMul(k){if(SG)return;var b=Math.floor(sNum("sBet")*k);if(b<1)b=1;if(b>BAL)b=BAL;$("sBet").value=b;sBand()}',
    'function sAllIn(){if(SG)return;$("sBet").value=BAL;sBand()}',
    'function sStep(d){if(SG)return;var f=sNum("sFire")+d;if(f<1)f=1;if(f>SMAXF)f=SMAXF;$("sFire").value=f;sTable()}',
    'var sTimer=0;',
    'function sTable(){clearTimeout(sTimer);sTimer=setTimeout(function(){',
    'var f=sNum("sFire");if(f<1||f>SMAXF){f=Math.min(Math.max(f,1),SMAXF);$("sFire").value=f}',
    'api("/api/stairs/table",{fire:f}).then(function(j){STAB=j.table||[];sTower();',
    'if(SLAST)sPaintLast();sBand()}).catch(function(){})},150)}',
    // Tháp vẽ từ TẦNG CAO xuống thấp cho giống hình leo lên.
    'var HEROIMG=\'<img class="hero" src="/hero.png" alt="">\';',
    'var COINCELL=\'<img class="dc" src="/dogcoin.png" alt="">\';',
    'function sTower(){var box=$("tower");if(!STAB.length){box.innerHTML="";return}',
    'var done=SG?SG.floor:0;var html="";',
    'for(var f=SF-1;f>=0;f--){',
    'var cls=f<done?"done":(SG&&f===done?"now":"");',
    // tầng cách chỗ đang đứng hơn 3 bậc thì làm mờ, mắt đỡ rối
    'if(SG&&f>done+3)cls+=" far";',
    'var cells="";',
    'for(var c=0;c<SC;c++){',
    'var cc="scell",inner="";',
    'if(SG&&f<done&&SG.safe[f]===c){cc+=" step";',
    // nhân vật đứng ở bậc vừa leo tới, các bậc dưới để lại đồng Dogcoin
    'inner=(f===done-1)?HEROIMG:COINCELL}',
    'cells+=\'<div class="\'+cc+\'" id="sc_\'+f+"_"+c+\'" data-c="\'+c+\'">\'+inner+"</div>"}',
    'html+=\'<div class="srow \'+cls+\'" id="sr\'+f+\'"><div class="cells">\'+cells+\'</div><div class="mx">\'+fx(STAB[f])+"</div></div>"}',
    'box.innerHTML=html;',
    // chưa vào ván thì nhân vật đứng dưới chân tháp
    '$("heroBase").style.display=SG?"none":"flex";',
    'if(SG){var row=$("sr"+done);if(row)row.querySelectorAll(".scell").forEach(function(el){',
    'el.onclick=function(){sTap(parseInt(this.dataset.c))}})}}',
    'function sBand(){var go=$("sGo");',
    'if(SG){',
    '$("sStat").textContent=SG.fire+" lửa · cược "+vnd(SG.bet)+" · tầng "+SG.floor+"/"+SF+" · "+fx(SG.multi);',
    'go.className="mgo cash";',
    'go.innerHTML=SG.floor?("NHẬN TIỀN "+vnd(SG.cashout)+\' <img class="dc" src="/dogcoin.png" alt="">\'):"🪜 BƯỚC LÊN TẦNG 1 ĐI";',
    'go.disabled=!SG.floor;',
    '}else if(SOVER){',
    'go.className="mgo start";go.textContent="🔄 VÁN MỚI";go.disabled=false;',
    '}else{',
    'go.className="mgo start";go.textContent="🪜 BẮT ĐẦU LEO";go.disabled=false;',
    '$("sStat").textContent=STAB.length?("tầng 1 "+fx(STAB[0])+" · lên đỉnh "+fx(STAB[STAB.length-1])):"Chọn số cầu lửa và tiền cược";}',
    '["sMax","sMinus","sPlus"].forEach(function(id){$(id).disabled=!!SG});',
    '$("sBet").disabled=!!SG;$("sFire").disabled=!!SG}',
    'function sGoClick(){if(SG)sCashout();else if(SOVER)sNewGame();else sStart()}',
    'function sNewGame(){SOVER=false;SLAST=null;api("/api/stairs/dismiss",{}).catch(function(){});',
    'sTower();sBand()}',
    'function sSync(){api("/api/stairs/state").then(function(j){',
    'SF=j.floors||10;SC=j.cols||8;SMAXF=j.maxFire||5;setBal(j.balance);',
    'SG=j.game||null;SLAST=(!SG&&j.last)?j.last:null;SOVER=!!SLAST;',
    '$("sFireLab").textContent="🔥 Cầu lửa mỗi tầng (1–"+SMAXF+")";',
    'if(SG){$("sFire").value=SG.fire;$("sBet").value=SG.bet}',
    'else if(SLAST){$("sFire").value=SLAST.fire;$("sBet").value=SLAST.bet}',
    'sTable()}).catch(function(){})}',
    // Vẽ lại tháp của ván vừa xong: lộ hết cầu lửa, đánh dấu chỗ cháy.
    'function sPaintLast(){if(!SLAST)return;',
    'for(var f=0;f<SF;f++){var row=$("sr"+f);if(row)row.classList.remove("now","far");',
    'for(var c=0;c<SC;c++){var el=$("sc_"+f+"_"+c);if(!el)continue;el.onclick=null;',
    'if(f===SLAST.hitFloor&&c===SLAST.hitCol){el.className="scell boom";el.innerHTML="💥"}',
    'else if(f<SLAST.safe.length&&SLAST.safe[f]===c){el.className="scell step";',
    'el.innerHTML=(f===SLAST.safe.length-1)?HEROIMG:COINCELL}',
    'else if(SLAST.traps[f]&&SLAST.traps[f].indexOf(c)>=0){el.className="scell fire";el.innerHTML="🔥"}',
    'else{el.className="scell";el.innerHTML=""}}}',
    '$("heroBase").style.display="none";',
    'var w=SLAST.amount>=0;',
    '$("sStat").textContent=(w?(SLAST.result==="Lên đỉnh"?"🏆 Lên đỉnh — nhận ":"✅ Đã dừng — nhận "):"🔥 Trúng cầu lửa — thua ")+',
    'vnd(Math.abs(w?SLAST.amount+SLAST.bet:SLAST.bet))}',
    // lộ hết bẫy của tầng vừa cháy rồi khóa tháp
    // Ván xong: dựng SLAST từ dữ liệu server rồi vẽ lại CẢ THÁP — lộ cầu lửa của
    // MỌI TẦNG, không riêng tầng vừa cháy. Giữ nguyên tới khi bấm VÁN MỚI.
    'function sFinish(j,res,net,stake,fire,floor,hitFloor,hitCol){',
    'SLAST={result:res,amount:net,bet:stake,fire:fire,floor:floor,',
    'safe:j.safe||[],traps:j.traps||[],',
    'hitFloor:(hitFloor===undefined?-1:hitFloor),hitCol:(hitCol===undefined?-1:hitCol)};',
    'SG=null;SOVER=true;sTower();sPaintLast();showNet(net);sBand();sPop(res,net,stake)}',
    // ---- Bảng kết quả kèm ảnh phản ứng theo 3 kết cục ----
    'function sPopClose(){var p=$("sPop");p.className="";p.style.display=""}',
    'function sPop(res,net,stake){',
    'var p=$("sPop"),kind,img,ttl,sub;',
    'if(res==="Lên đỉnh"){kind="top";img="/thang100.jpg";ttl="🏆 LÊN TỚI ĐỈNH!";sub="Leo trọn thang, không dính cầu lửa nào"}',
    'else if(net>=0){kind="win";img="/ngungdungluc.jpg";ttl="✅ NGƯNG ĐÚNG LÚC!";sub="Dừng ở tầng "+SLAST.floor+"/"+SF+" — khôn đấy"}',
    'else{kind="lose";img="/thua.jpg";ttl="🔥 ĐẠP TRÚNG LỬA";sub="Cháy ở tầng "+(SLAST.hitFloor+1)+"/"+SF}',
    '$("sPopImg").src=img;$("sPopTtl").textContent=ttl;$("sPopSub").textContent=sub;',
    '$("sPopAmt").textContent=(net>=0?"+":"−")+vnd(Math.abs(net))+" Dogcoin";',
    'p.className="show "+kind;',
    // lên đỉnh: mưa emoji + rung màn hình cho ra chất ăn mừng
    'if(kind==="top"){celebrate()}',
    'clearTimeout(p._h);p._h=setTimeout(sPopClose,kind==="top"?5200:3600)}',
    // mưa emoji ăn mừng (dùng lại .fx của hiệu ứng Bão bên Tài Xỉu)
    'function celebrate(){',
    'document.body.classList.remove("storm");void document.body.offsetWidth;document.body.classList.add("storm");',
    'var EM=["🎉","🏆","🪙","💰","✨","🎊"];',
    'for(var i=0;i<34;i++){var s=document.createElement("div");s.className="fx";s.textContent=EM[i%EM.length];',
    's.style.left=(Math.random()*96)+"vw";s.style.fontSize=(18+Math.random()*30)+"px";',
    's.style.zIndex="101";',   // trên cả bảng kết quả, không thì bị che
    's.style.animationDuration=(1.4+Math.random()*1.8)+"s";s.style.animationDelay=(Math.random()*0.9)+"s";',
    'document.body.appendChild(s);(function(el){setTimeout(function(){el.remove()},4200)})(s)}',
    'setTimeout(function(){document.body.classList.remove("storm")},1500)}',
    'function sTap(c){if(!SG||sBusy)return;sBusy=true;',
    'var stake=SG.bet,fire=SG.fire,f=SG.floor;',
    'api("/api/stairs/step",{col:c}).then(function(j){sBusy=false;',
    'if(typeof j.balance==="number")setBal(j.balance);',
    'if(j.burn){playBoom("fire");toast("🔥 CHÁY! Mất "+vnd(stake)+" Dogcoin");',
    'return sFinish(j,"Trúng lửa (Thua)",-stake,stake,fire,f,f,c)}',
    'var el=$("sc_"+f+"_"+c);if(el){el.className="scell step";el.innerHTML=HEROIMG}',
    'if(j.top){toast("🏆 LÊN ĐỈNH! Nhận "+vnd(j.win));',
    'return sFinish(j,"Lên đỉnh",j.win-stake,stake,fire,SF)}',
    'SG=j.state;sTower();sBand()}).catch(function(e){sBusy=false;toast("❌ "+e.message);sSync()})}',
    'function sStart(){if(sBusy||SOVER)return;var f=sNum("sFire"),b=sNum("sBet");',
    'if(f<1||f>SMAXF)return toast("❌ Cầu lửa từ 1 đến "+SMAXF);',
    'if(b<=0)return toast("❌ Nhập số Dogcoin");',
    'if(b>BAL)return toast("❌ Không đủ Dogcoin!");',
    'sBusy=true;api("/api/stairs/start",{fire:f,bet:b}).then(function(j){sBusy=false;',
    'setBal(j.balance);SG=j.state;sTower();sBand()',
    '}).catch(function(e){sBusy=false;toast("❌ "+e.message);sSync()})}',
    'function sCashout(){if(!SG||sBusy)return;sBusy=true;',
    'var stake=SG.bet,fire=SG.fire,floor=SG.floor;',
    'api("/api/stairs/cashout",{}).then(function(j){sBusy=false;setBal(j.balance);',
    'toast("✅ Nhận "+vnd(j.win)+" Dogcoin");',
    'sFinish(j,"Dừng (Thắng)",j.win-stake,stake,fire,floor)',
    '}).catch(function(e){sBusy=false;toast("❌ "+e.message);sSync()})}',
    '',
    // Safari trên iPhone vẫn cho chụm 2 ngón dù CSS đã cấm — nó dùng sự kiện riêng
    // (gesture*), phải chặn thêm ở đây. Không đụng tới touchend/click nên bấm nhanh
    // nhiều ô liên tiếp vẫn ăn đủ, không bị nuốt cú chạm nào.
    '["gesturestart","gesturechange","gestureend"].forEach(function(ev){',
    'document.addEventListener(ev,function(e){e.preventDefault()},{passive:false})});',
    'document.addEventListener("dblclick",function(e){e.preventDefault()},{passive:false});',
    'if(TOKEN){show("")}',
    'document.getElementById("pin").addEventListener("keydown",function(e){if(e.key==="Enter")login()});',
    '</script></body></html>',
].join('\n');

module.exports = { startWebPlay };
