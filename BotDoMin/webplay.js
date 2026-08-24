// ===== CỔNG WEB CƯỢC CHO NGƯỜI CHƠI (Big Small) =====
// Chạy CỔNG RIÊNG (mặc định 3002), tách hẳn panel admin (150899).
// Đăng nhập: Discord ID + mã PIN (bot phát PIN qua nút 🌐 trên bảng Big Small).
// TOÀN BỘ thao tác Big Small ở đây: đặt cược + NẶN XÍ NGẦU (kéo tờ giấy che 3 viên).
// 15 giây cuối ván khóa sổ, xí ngầu lắc ngầm — ai kéo giấy người đó thấy riêng,
// hết giờ tự mở + trả tiền. Cược đi thẳng vào txState của bot nên bảng Discord
// vẫn hiển thị như thường, không dính deadline 3 giây / rate limit của Discord.
const http = require('http');
const crypto = require('crypto');

// Toàn bộ ảnh + âm thanh gom ở assets.js (tự quét thư mục assets/) — thêm file mới
// chỉ cần thả vào thư mục đó, không phải đụng vào file này nữa.
const ASSETS = require('./assets');

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

            // (Blackjack đã hủy 18/08 — /blackjack không còn; tab thay bằng 🎡 Vòng Quay.)

            if (ASSETS.serve(req, res, path)) return;

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
                    return sendJSON(res, 401, { ok: false, error: 'Sai ID hoặc PIN. Lấy PIN bằng nút 🌐 trên bảng Big Small trong Discord.' });
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
                        // 🏆 hũ 2 minigame gửi kèm nhịp 2 giây -> nhãn hũ trên tab luôn tươi,
                        // thấy người khác nuôi hũ mà không cần bấm sang tab đó
                        pots: {
                            mines: (ctx.mines && ctx.mines.pot) ? ctx.mines.pot() : 0,
                            stairs: (ctx.stairs && ctx.stairs.pot) ? ctx.stairs.pot() : 0,
                        },
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

                // ===== 🧧 LỘC LÁ: chuyển Dogcoin cho nhau =====
                // Luật + thông báo Discord + dòng chat sòng đều nằm ở index.js (ctx.transfer).
                if (path === '/api/players') {
                    return sendJSON(res, 200, { ok: true, list: ctx.transferTargets ? ctx.transferTargets() : [] });
                }
                if (req.method === 'POST' && path === '/api/transfer') {
                    if (!ctx.transfer) return sendJSON(res, 400, { ok: false, error: 'Chuyển tiền chưa bật' });
                    const body = await readBody(req);
                    const r = ctx.transfer(userId, body.toId, body.amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, balance: r.balance, toName: r.toName });
                }

                // ===== 📅 ĐIỂM DANH THÁNG + 💉 NGHIỆN =====
                // Toàn bộ luật + tiền nằm ở index.js (ctx.daily) — dùng chung với
                // /diemdanh, /nghien bên Discord nên không bao giờ lệch nhau.
                if (ctx.daily && path === '/api/daily/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.daily.state(userId) });
                }
                if (ctx.daily && req.method === 'POST' && path === '/api/daily/claim') {
                    const r = ctx.daily.claim(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // bấm nhận thưởng chuỗi (2 ngày liên tiếp = 1 gói, lấy hết 1 lần)
                if (ctx.daily && ctx.daily.streak && req.method === 'POST' && path === '/api/daily/streak') {
                    const r = ctx.daily.streak(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                if (ctx.daily && req.method === 'POST' && path === '/api/daily/nghien') {
                    const r = ctx.daily.nghien(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }

                // ===== 📈 SÀN CỔ PHIẾU DOG (logic + tiền ở index.js — ctx.stock) =====
                // Mua nhận theo TIỀN (amount) hoặc theo KHỐI LƯỢNG (shares) — người chơi chọn.
                if (ctx.stock && path === '/api/stock/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.stock.state(userId) });
                }
                if (ctx.stock && req.method === 'POST' && path === '/api/stock/buy') {
                    const body = await readBody(req);
                    const r = ctx.stock.buy(userId, Math.floor(Number(body.amount) || 0), Math.floor(Number(body.shares) || 0));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, bought: r.shares, fill: r.price, cost: r.cost, ...r.state });
                }
                if (ctx.stock && req.method === 'POST' && path === '/api/stock/sell') {
                    const body = await readBody(req);
                    const r = ctx.stock.sell(userId, Math.floor(Number(body.shares) || 0));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, sold: r.shares, fill: r.price, proceeds: r.proceeds, pl: r.pl, ...r.state });
                }

                // ===== 📒 VAY NỢ: xem + trả trên web (vay thì qua bảng Discord) =====
                if (ctx.debt && path === '/api/debt/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.debt.state(userId) });
                }
                if (ctx.debt && req.method === 'POST' && path === '/api/debt/pay') {
                    const body = await readBody(req);
                    const r = ctx.debt.pay(userId, Math.floor(Number(body.amount) || 0));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }

                // ===== 🎡 VÒNG QUAY MAY MẮN NHÓM (logic + tiền ở index.js — ctx.wheel) =====
                if (ctx.wheel && path === '/api/wheel/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.wheel.state(userId) });
                }
                if (ctx.wheel && req.method === 'POST' && path === '/api/wheel/ready') {
                    const body = await readBody(req);
                    const r = ctx.wheel.ready(userId, String(body.color || ''));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r.state });
                }
                if (ctx.wheel && req.method === 'POST' && path === '/api/wheel/unready') {
                    const r = ctx.wheel.unready(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r.state });
                }
                // nút QUAY VÒNG VÉ (vòng 1) — đủ người mới sáng, chốt giá vé chung cả bàn
                if (ctx.wheel && ctx.wheel.spin1 && req.method === 'POST' && path === '/api/wheel/spin1') {
                    const r = ctx.wheel.spin1(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r.state });
                }
                // nút QUAY VÒNG HỆ SỐ (vòng 2) — chỉ sáng sau khi vé đã chốt (stake)
                if (ctx.wheel && ctx.wheel.spin && req.method === 'POST' && path === '/api/wheel/spin') {
                    const r = ctx.wheel.spin(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r.state });
                }

                if (req.method === 'POST' && path === '/api/bet') {
                    const body = await readBody(req);
                    const tx = ctx.getTX();
                    const choice = String(body.choice || '');
                    const amount = Math.floor(Number(body.amount));
                    if (!['tai', 'xiu', 'chan', 'le', 'bao'].includes(choice)) return sendJSON(res, 400, { ok: false, error: 'Cửa không hợp lệ' });
                    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Số tiền không hợp lệ' });
                    if (!tx.message || tx.status !== 'betting') return sendJSON(res, 400, { ok: false, error: 'Đã khóa sổ - đợi ván sau, giờ là lúc NẶN!' });
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
                            pot: mines.pot ? mines.pot() : 0, potRate: mines.potRate || 0, minBet: mines.minBet || 0, potSeed: mines.potSeed || 0,
                            maxWin: mines.maxWin, maxBet: mines.maxBet,
                            minMines: mines.minMines || 1, maxMines: mines.maxMines || (mines.tiles - 1),
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
                            Math.floor(Number(body.numMines)), Math.floor(Number(body.bet)), body.extra === true);
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

                    // 🍀 chọn 1 trong 4 hộp sau khi mở trúng cỏ 4 lá
                    if (req.method === 'POST' && path === '/api/mines/lucky') {
                        const body = await readBody(req);
                        const r = mines.luckyPick(userId, Math.floor(Number(body.box)) || 0);
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
                            pot: stairs.pot ? stairs.pot() : 0, potRate: stairs.potRate || 0, minBet: stairs.minBet || 0, potSeed: stairs.potSeed || 0,
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

                    // 🍀 chọn 1 trong 4 hộp sau khi đạp trúng cỏ 4 lá
                    if (req.method === 'POST' && path === '/api/stairs/lucky') {
                        const body = await readBody(req);
                        const r = stairs.luckyPick(userId, Math.floor(Number(body.box)) || 0);
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

    // (Khối Blackjack qua WebSocket đã XÓA 19/08 cùng toàn bộ trò — xem git history
    //  nếu cần dựng lại: blackjack.js / blackjackTable.js / blackjackPage.js / wsserver.js)

    server.listen(PORT, '0.0.0.0', () => ctx.writeLog('SYSTEM', `[WEB CƯỢC] Cổng web cược chạy ở cổng ${PORT}`));
    return server;
}

// ===== TRANG WEB (mobile-first, tiếng Việt) =====
const PAGE = [
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    '<title>Minigame Palworld</title>',
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
    // nút/ô bấm: tắt hẳn double-tap zoom + không bôi đen chữ khi bấm nhanh
    'button,.mtile,.mstep,.cbtn,.chip{touch-action:manipulation;-webkit-user-select:none;user-select:none}',
    '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}',
    'h1{font-size:19px;margin-bottom:4px}h2{font-size:15px;margin-bottom:10px}',
    '.muted{color:var(--muted);font-size:13px}',
    'input{width:100%;background:#12141a;border:1px solid var(--line);border-radius:10px;color:var(--tx);padding:12px;font-size:16px;margin-top:8px}',
    'button{border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;color:#fff}',
    '.btn-full{width:100%;margin-top:10px;background:var(--blue)}',
    '.btn-full:disabled{opacity:.45;cursor:not-allowed}',
    // ---- khung điều khoản ở trang đăng nhập ----
    '#terms{margin-top:12px;background:#2a1a12;border:1px solid #7a4a22;border-radius:12px;padding:12px}',
    '#terms .tt{color:#ffb26b;font-weight:900;font-size:14px;margin-bottom:6px}',
    '#terms .tb{font-size:12.5px;color:#e6d3c4;line-height:1.65}',
    '#terms .tk{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;color:#fff;cursor:pointer}',
    '#terms .tk input{width:18px;height:18px;margin:1px 0 0;flex:0 0 auto}',
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
    // ---- 🧧 Lộc lá ----
    '#lolaPop{position:fixed;inset:0;z-index:100;display:none;align-items:flex-start;justify-content:center;background:#000a;padding:24px 16px}',
    '#lolaPop.show{display:flex}',
    '#lolaPop .box{background:#161a24;border:1px solid #2a3142;border-radius:16px;padding:16px;max-width:380px;width:100%;box-shadow:0 12px 40px #000c}',
    '#lolaList{max-height:170px;overflow-y:auto;margin-top:6px}',
    '#lolaList button{display:flex;justify-content:space-between;width:100%;text-align:left;background:#1c2130;color:#dfe6f5;padding:9px 10px;border-radius:8px;margin-top:4px;font-size:13px}',
    '#lolaList button.on{background:#3d2c10;color:#ffd977;box-shadow:0 0 0 2px var(--gold) inset}',
    '#lolaList .lid{color:#6f7a90;font-size:11px}',
    '@keyframes fxfall{to{transform:translateY(115vh) rotate(680deg)}}',
    // bảng 20 ván gần nhất (kiểu soi cầu trong Discord: mã ván · 3 viên · tổng · kết quả)
    '.hrow{display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px}',
    '.hrow:last-child{border-bottom:0}',
    '.hrow .gid{color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 auto}',
    '.hrow .dd{display:flex;gap:3px;flex:0 0 auto}',
    // inline-block để 3 viên LUÔN nằm ngang kể cả khi flex của .dd không ăn
    // (div mặc định là block — rơi vào ngữ cảnh inline là mỗi viên một dòng)
    '.mdie{display:inline-block;vertical-align:middle;width:17px;height:17px;background:#f4f1e8;border-radius:4px;position:relative;flex:0 0 auto}',
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
    // ---- thanh chuyển trang (Big Small | Dò Mìn) ----
    // Header + nav ép mỏng (19/08): mobile đỡ phải kéo — trước đây riêng cụm đầu
    // trang đã ngốn ~150px dọc.
    '#topbar{padding:8px 12px;margin-bottom:8px}',
    '#topbar .big{font-size:20px}',
    '#topbar .muted{font-size:11px}',
    '#topbar button{padding:8px 10px}',
    '#nav{display:flex;gap:6px;margin-bottom:8px}',
    '#nav button{flex:1;background:var(--card);border:1px solid var(--line);color:var(--muted);font-size:13px;padding:9px 2px}',
    '#nav button.on{background:linear-gradient(180deg,#2b3346,#222839);color:var(--tx);border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c55}',
    // 🏆 số hũ cạnh tên game: chữ vàng, viền vàng mờ cho nổi
    '.hdrpot{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:8px;font-size:13px;font-weight:bold;color:var(--gold);background:#3a2f0e;border:1px solid #ffcf5c55;vertical-align:middle}',
    '.hdrpot:empty{display:none}',
    // ---- dò mìn (bố cục theo sòng: thanh hệ số trên, 2 cột đếm kẹp lưới) ----
    // icon Dog Coin thật (ảnh trong game) — thay cho emoji 🐕 ở mọi chỗ
    '.dc{width:1.05em;height:1.05em;vertical-align:-.16em;object-fit:contain;display:inline-block}',
    '.dc.big{width:1.5em;height:1.5em;vertical-align:-.3em}',
    '#mineCard{background:linear-gradient(180deg,#1b2440,#141a2e);border:1px solid #2b3557}',
    // thanh mốc hệ số cuộn ngang: mốc đã ăn sáng vàng, mốc kế tiếp nhấp nháy xanh
    // Thanh hệ số PHÂN TRANG 7 ô/trang (bỏ scroll 19/08 — scroll tự động cứ giành
    // thanh với người dùng, chốt chuyển sang bấm nút ◀ ▶ cho dứt điểm)
    '#mbar{display:flex;gap:4px;padding:6px;background:#0d1226;border:1px solid #2b3557;border-radius:10px}',
    '.mstep{flex:1 1 0;min-width:0;text-align:center;padding:8px 2px;border-radius:7px;font-size:13px;font-weight:800;background:#1a2340;color:#5f6c96;border:1px solid #263159;white-space:nowrap;overflow:hidden}',
    '.mpg{flex:0 0 34px;border-radius:7px;background:#232b4d;color:#8fa2d9;border:1px solid #2b3557;font-size:14px;font-weight:800;padding:0}',
    '.mpg:disabled{opacity:.3}',
    '.mstep.hit{background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05;border-color:#a8842f}',
    '.mstep.now{background:linear-gradient(180deg,#4da3ff,#2c6fd0);color:#fff;border-color:#7dc0ff;animation:stepGlow 1.4s ease-in-out infinite}',
    '.mstep.capped{background:#3a2415;color:#ff9a5c;border-color:#7d4a1e;font-size:11px}',
    '.mstep.last{border-color:#c39bf0;box-shadow:inset 0 0 0 1px #c39bf055}',
    '.mstep.last .tag{display:block;font-size:9px;letter-spacing:.5px;color:#c39bf0;font-weight:700}',
    '.mstep.last.hit .tag{color:#7d5f1e}',
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
    // 🛡️ ô mìn đã bị khiên đỡ: xịt rồi, hiện khiên, chết cứng
    '.mtile.shieldsave{background:linear-gradient(180deg,#2a3b55,#1d2a40);border-color:#6fa8ff;border-bottom-color:#14213a;color:#fff;cursor:default;animation:boomPop .32s ease-out}',
    // 🍀 ô cỏ 4 lá (vừa mở trúng / lộ ra cuối ván) — XANH LÁ, khác hẳn ô khiên xanh dương
    '.mtile.lucky{background:linear-gradient(180deg,#2ec26a,#1a7a40);border-color:#7dffb0;border-bottom-color:#0f4a26;color:#fff;cursor:default;animation:boomPop .32s ease-out}',
    '.scell.lucky{background:linear-gradient(180deg,#2ec26a,#1a7a40);border-color:#7dffb0;color:#fff}',
    // hộp chọn quà 🍀
    '#luckyPick{position:fixed;inset:0;z-index:110;display:none;align-items:center;justify-content:center;background:#000c;padding:16px}',
    '#luckyPick.show{display:flex}',
    '#luckyPick .box{background:#12241a;border:2px solid #2ec26a;border-radius:18px;padding:20px;max-width:360px;width:100%;text-align:center;box-shadow:0 12px 44px #000d}',
    '#luckyPick .clover{font-size:52px;animation:cloverPulse 1.4s ease-in-out infinite}',
    '@keyframes cloverPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
    '#luckyPick h2{color:#7dffb0;font-size:19px;margin:4px 0 2px}',
    '#luckyPick .sub{font-size:13px;color:#a9c2b4;margin-bottom:14px}',
    '#luckyPick .gifts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}',
    '#luckyPick .gifts button{font-size:34px;padding:14px 0;background:#1a3a28;border:1px solid #2ec26a55;border-radius:14px;transition:transform .12s}',
    '#luckyPick .gifts button:active{transform:scale(.88)}',
    '#luckyPick .gifts button:disabled{opacity:.9}',
    // lật hộp: hộp mình chọn SÁNG VÀNG + phóng to, 3 hộp kia mờ đi
    '#luckyPick .gifts button.win{background:#3d2c10;border:2px solid var(--gold);box-shadow:0 0 18px #ffcf5c99;transform:scale(1.12);opacity:1}',
    '#luckyPick .gifts button.dim{opacity:.35}',
    // dòng kết quả to rõ + nút đóng (ẩn tới khi lật xong)
    '#luckyRes{display:none;margin-top:14px;font-size:15px;font-weight:800;color:#ffe9a8;line-height:1.45;background:#0d1f15;border:1px solid #2ec26a55;border-radius:12px;padding:10px}',
    '#luckyClose{display:none;width:100%;margin-top:12px;padding:13px;background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05;border-radius:12px;font-size:15px}',
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
    // 🌟 ô vàng leo thang (đạp là lên thẳng đỉnh) — nhấp nháy cho ai cũng thấy
    '.scell.gold{background:linear-gradient(180deg,#ffe9a8,#d8a90f);border-color:#ffd977;animation:baoPulse 1.6s ease-in-out infinite;font-size:18px}',
    '.scell img.dc{width:20px;height:20px}',
    // nhân vật đứng trên bậc vừa leo tới
    // Neo THẤP (bottom âm) + cao 34px: đầu nhân vật nằm gọn trong ô đang đứng,
    // không thò lên đè ô tầng trên (tầng đang cần bấm) — tràn xuống dưới thì chỉ
    // đè tầng đã leo qua, không ai bấm nữa.
    '.hero{position:absolute;bottom:-8px;left:50%;width:auto;height:34px;transform:translateX(-50%);',
    'pointer-events:none;filter:drop-shadow(0 3px 4px #000a);animation:heroHop .45s ease-out;z-index:2}',
    '@keyframes heroHop{0%{transform:translate(-50%,26px) scale(.7)}55%{transform:translate(-50%,-7px) scale(1.08)}100%{transform:translate(-50%,0) scale(1)}}',
    '.hero.idle{animation:heroIdle 2.2s ease-in-out infinite}',
    // Nhân vật lúc KẾT THÚC ván: đổi thành ảnh phản ứng (lên đỉnh / ngưng đúng lúc /
    // đạp lửa). To hơn nhân vật thường cho thấy rõ mặt; #tower không cắt tràn nên
    // ảnh vượt khỏi ô vẫn hiện đủ.
    '.hero.end{height:58px;animation:endPop .42s cubic-bezier(.2,1.4,.5,1);z-index:3}',
    '@keyframes endPop{0%{transform:translate(-50%,10px) scale(.4);opacity:0}60%{transform:translate(-50%,-4px) scale(1.14)}100%{transform:translate(-50%,0) scale(1);opacity:1}}',
    '@keyframes heroIdle{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-3px)}}',
    // Nhân vật đứng dưới chân tháp lúc CHƯA vào ván: ĐÃ TẮT 19/08 theo yêu cầu —
    // chiếm 50px dọc trên mobile mà không có thông tin gì; vào ván thì nhân vật
    // vẫn hiện trên tháp như thường (HEROIMG trong ô).
    '#heroBase{display:none}',
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
    // ---- 🎡 vòng quay ----
    // bánh xe chiếm gần hết bề ngang điện thoại, máy tính thì trần 520px cho khỏi lố.
    // KHÔNG dựa aspect-ratio: svg có viewBox vuông + width 100% tự giữ khung vuông,
    // trình duyệt cũ không bị vòng tròn teo nhỏ / chữ đè nhau.
    '#whWrap{position:relative;max-width:min(94vw,520px);margin:14px auto 0}',
    '#whSvg{width:100%;height:auto;display:block;filter:drop-shadow(0 6px 18px #0009)}',
    '#whRot{transform-origin:150px 150px;transform-box:view-box}',
    // 3 mũi tên gắn quanh vành: 🟡 đỉnh, 🔵 xoay 120°, 🟢 xoay 240°
    '.warr{position:absolute;inset:0;pointer-events:none}',
    '.warr .tri{position:absolute;top:-3px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;border-top:26px solid #f5c518;filter:drop-shadow(0 2px 3px #000b)}',
    '.warr.b{transform:rotate(120deg)}.warr.g{transform:rotate(240deg)}',
    '.warr.b .tri{border-top-color:#3b82f6}.warr.g .tri{border-top-color:#22c55e}',
    // chế độ VÒNG VÉ (vòng 1): chỉ 1 mũi tên — giấu mũi xanh dương + xanh lá
    '#whWrap.one .warr.b,#whWrap.one .warr.g{display:none}',
    '#whPick{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}',
    '#whPick button{padding:11px 0;border-radius:12px;border:2px solid transparent;background:#12141a;font-weight:800;font-size:14px}',
    '#whPick button.y{color:#f5c518}#whPick button.b{color:#60a5fa}#whPick button.g{color:#4ade80}',
    '#whPick button.sel{border-color:currentColor;background:#1a1e2a}',
    '#whRes{display:none;margin-top:10px;font-size:14px;font-weight:700;line-height:1.6;text-align:center;background:#12141a;border:1px solid var(--line);border-radius:12px;padding:10px}',
    '#whGo:disabled,#whOut:disabled{opacity:.55}',
    // đủ người -> nút QUAY phát sáng nhấp nháy vàng cho cả bàn thấy mà bấm
    '#whGo.arm{background:linear-gradient(180deg,#ffd977,#e0a63f);color:#3d2c05;animation:whArm 1s ease-in-out infinite}',
    '@keyframes whArm{0%,100%{box-shadow:0 0 6px #f5c51877}50%{box-shadow:0 0 26px #f5c518ee;transform:scale(1.02)}}',
    // ---- 📈 cổ phiếu ----
    // Giá là thứ to nhất trang; đồ thị vẽ bằng SVG dựng từ mảng giá server gửi.
    '#skHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}',
    '#skPrice{font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.05;font-variant-numeric:tabular-nums}',
    '#skChart{width:100%;height:120px;display:block;margin-top:10px}',
    '.skchip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em}',
    '.skchip.g{background:#12351f;color:var(--green)}.skchip.r{background:#3a1414;color:var(--red)}',
    '.skchip.y{background:#2a2110;color:var(--gold)}',
    '.skpl{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}',
    '.skkv{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}',
    '.skn{font-variant-numeric:tabular-nums;font-weight:700}',
    '#skSeg{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}',
    '#skSeg button{padding:9px 4px;border-radius:9px;font-size:12.5px;font-weight:800;background:#12141a;border:1px solid var(--line);color:var(--muted)}',
    '#skSeg button.on{background:#2a2110;border-color:var(--gold);color:var(--gold)}',
    '#skQuick{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:7px}',
    '#skQuick button{padding:8px 0;border-radius:8px;font-size:11.5px;font-weight:800;background:#12141a;border:1px solid var(--line);color:var(--muted)}',
    '#skPart{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:7px}',
    '#skPart button{padding:9px 0;border-radius:9px;font-size:12px;font-weight:700;background:#232735;border:0;color:var(--tx)}',
    '.skrow{display:flex;justify-content:space-between;padding:5px 0;font-size:12.5px;border-bottom:1px solid var(--line)}',
    '.skrow:last-child{border-bottom:0}',
    '#skBuyBtn{background:linear-gradient(180deg,#48e090,#25a663);color:#05240f}',
    '#skSellBtn{background:linear-gradient(180deg,#ff8a8a,#e04a4a);color:#2a0606}',
    '#skNews{background:#241d0e;border:1px solid #4a3a18;border-radius:12px;padding:10px;margin-top:8px;font-size:12.5px}',
    // ---- 📅 điểm danh ----
    '#dChips{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}',
    '.dchip{background:#12141a;border:1px solid var(--line);border-radius:12px;padding:8px;text-align:center}',
    '.dchip .t{font-size:11px;color:var(--muted)}.dchip .v{font-weight:800;font-size:15px;color:var(--gold);margin-top:2px}',
    // ô thưởng chuỗi: có gói chờ nhận thì SÁNG LÊN + nhấp nháy, bấm được
    '#dStreakChip.on{background:linear-gradient(180deg,#3d2c10,#241a08);border-color:var(--gold);cursor:pointer;animation:baoPulse 1.8s ease-in-out infinite}',
    '#dStreakChip.on .t{color:#ffd977}',
    '#dStreakChip.on:active{transform:scale(.96)}',
    '#dcal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px}',
    '.dw{text-align:center;font-size:11px;color:var(--muted);padding:2px 0}',
    // .dcell chứ KHÔNG phải .dd — .dd là hàng xúc xắc của lịch sử Big Small,
    // trùng tên là rule flex-direction:column ở đây đè sang, 3 viên xếp dọc (bug 19/08)
    '.dcell{border-radius:10px;border:1px solid var(--line);background:#12141a;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#5a6072}',
    '.dcell small{font-size:8px;font-weight:700;letter-spacing:.4px;color:#c98a2b}',
    '.dcell.done{background:linear-gradient(180deg,#3a2c14,#2a1f0e);border-color:#e0b750;color:#ffd977}',
    '.dcell.today{border:2px solid #8b5cf6;color:#cbb6ff;background:#1a1430}',
    '.dcell.today.done{border-color:#e0b750;color:#ffd977;background:linear-gradient(180deg,#3a2c14,#2a1f0e)}',
    '#dprog{height:10px;background:#12141a;border:1px solid var(--line);border-radius:99px;overflow:hidden;margin-top:8px}',
    '#dprogIn{height:100%;background:linear-gradient(90deg,#e0b750,#ffd977);width:0%;transition:width .4s}',
    '#dClaim:disabled,#ngBtn:disabled{opacity:.55}',
    // ---- chat ----
    '#chatBox{height:190px;overflow-y:auto;background:#12141a;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px}',
    '.cmsg{padding:3px 0;word-break:break-word}.cmsg b{color:var(--gold)}.cmsg .ct{color:var(--muted);font-size:11px;margin-left:6px}',
    '</style></head><body>',

    '<div id="login" class="card">',
    '<h1>🎮 Minigame Palworld</h1>',
    '<div class="muted">Có <b>Big Small</b>, <b>Dò Mìn</b>, <b>Leo Thang</b> và <b>Vòng Quay</b>. Lấy mã PIN bằng nút <b>🌐 Chơi trên web</b> ở bảng trong Discord.</div>',
    // ĐIỀU KHOẢN: phải tick mới bấm được nút vào. Nói rõ Dogcoin là điểm giải trí,
    // nghiêm cấm mua bán bằng tiền thật.
    '<div id="terms">',
    '<div class="tt">⚠️ ĐỌC TRƯỚC KHI VÀO</div>',
    '<div class="tb">',
    '<b>1.</b> Dogcoin là <b>điểm giải trí nội bộ</b> của server, do bot phát miễn phí. Dogcoin <b>KHÔNG có giá trị quy đổi</b> và không phải tiền tệ.<br>',
    '<b>2.</b> <b>NGHIÊM CẤM</b> mua, bán, trao đổi Dogcoin bằng <b>tiền thật</b> (chuyển khoản, thẻ cào, ví điện tử) dưới mọi hình thức.<br>',
    '<b>3.</b> Ai vi phạm sẽ bị <b>xoá ví, khoá quyền chơi</b> và mời khỏi server.<br>',
    '<b>4.</b> Đây là sân chơi vui giữa bạn bè trong server. Chơi cho vui, đừng cay.',
    '</div>',
    '<label class="tk"><input type="checkbox" id="agree" onchange="agreeChg()"> Tôi đã đọc và <b>đồng ý</b> các điều khoản trên</label>',
    '</div>',
    '<input id="uid" inputmode="numeric" placeholder="Discord ID của bạn">',
    '<input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">',
    '<button class="btn-full" id="loginBtn" onclick="login()" disabled>✅ ĐỒNG Ý VÀ VÀO CHƠI</button>',
    '</div>',

    '<div id="app" class="hidden">',
    '<div id="topbar" class="card row"><div><div class="muted">Số dư của <b id="myName"></b></div>',
    '<div class="big"><img class="dc" src="/dogcoin.png" alt=""> <span id="bal">0</span></div></div>',
    '<div style="display:flex;gap:6px;align-items:center">',
    '<button style="background:#3d2c10;color:#ffd977;font-size:12px" onclick="lolaOpen()">🧧 Lộc lá</button>',
    '<button id="sndBtn" title="Tắt/bật tiếng" style="background:#232735;min-width:40px;font-size:15px" onclick="toggleSnd()">🔊</button>',
    '<button style="background:#232735;font-size:12px" onclick="logout()">Thoát</button></div></div>',

    '<div id="nav">',
    '<button id="navTx" class="on" onclick="go(\'tx\')">🎲 Big Small</button>',
    '<button id="navMine" onclick="go(\'mine\')">💣 Dò Mìn</button>',
    '<button id="navStair" onclick="go(\'stair\')">🪜 Leo Thang</button>',
    '<button id="navWheel" onclick="go(\'wheel\')">🎡 Vòng Quay</button>',
    '<button id="navDaily" onclick="go(\'daily\')">📅 Điểm danh</button>',
    '<button id="navStock" onclick="go(\'stock\')">📈 Cổ phiếu</button>',
    '</div>',

    // ================= TRANG BIG SMALL =================
    '<div id="pageTx">',
    '<div class="card">',
    '<div class="row"><h2 id="round" style="margin:0">Ván #-</h2><div id="clock" class="big">--</div></div>',
    '<div id="stt" class="muted"></div>',
    '<div id="stage">',
    '<div id="diceRow"></div>',
    '<div id="sumBadge" class="hidden"></div>',
    '<div id="paper" class="hidden locked"><div class="hint" id="paperHint">🔒 CHƯA TỚI GIỜ NẶN</div><div class="sub" id="paperSub">đặt cược đi - giấy chuyển XANH là kéo được</div></div>',
    '</div>',
    '<div id="stageCap"></div>',
    '</div>',

    '<div class="card" id="betCard">',
    '<div class="grid2">',
    '<button class="cbtn tai" id="c_tai" onclick="pick(\'tai\')">BIG<small>11 - 17</small><div class="muted" id="t_tai">0</div></button>',
    '<button class="cbtn xiu" id="c_xiu" onclick="pick(\'xiu\')">SMALL<small>4 - 10</small><div class="muted" id="t_xiu">0</div></button>',
    '</div>',
    '<button class="cbtn bao" id="c_bao" style="width:100%" onclick="pick(\'bao\')">🌪️ BÃO<small>3 viên giống nhau · 1 ăn 30 - ra Bão mọi cửa khác THUA</small><div class="muted" id="t_bao">0</div></button>',
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
    '<div class="card" id="mineCard">', // KHÔNG đặt id="mine": trùng với dòng cược ở trang Big Small
    // 🏆 số hũ nằm ngay cạnh tên game cho dễ thấy (chủ server chốt 20/08)
    '<div class="row" style="margin-bottom:8px"><h2 style="margin:0">💣 Dò Mìn<span class="hdrpot" id="mPotHdr"></span></h2><div class="muted" id="mStat">Chọn số mìn và tiền cược</div></div>',

    '<div id="mbar"></div>',

    '<div id="mstage">',
    '<div class="mside coin"><img class="dc big" src="/dogcoin.png" alt=""><div class="n" id="mLeft">–</div></div>',
    '<div class="mgrid" id="mGrid"></div>',
    '<div class="mside bomb"><div class="ic">💣</div><div class="n" id="mBombN">–</div></div>',
    '</div>',

    '<div class="mctl">',
    '<div class="box"><div class="lab">Tiền cược</div><input id="mBet" inputmode="numeric" value="200" oninput="mBand()"></div>',
    '<button id="mDouble" onclick="mMul(2)">x2</button>',
    '<button id="mMax" onclick="mAllIn()">MAX</button>',
    '</div>',

    '<div class="mctl">',
    '<button id="mMinus" onclick="mStep(-1)">−</button>',
    '<div class="box"><div class="lab" id="mMinesLab">Số mìn</div><input id="mMines" inputmode="numeric" value="3" oninput="mTable()"></div>',
    '<button id="mPlus" onclick="mStep(1)">+</button>',
    '</div>',

    // 🍀 mặc định 1 ô; tick = mua thêm 1 ô, phí 20% tiền cược (server tự trừ lúc bắt đầu)
    '<label class="muted" id="mExtraWrap" style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;margin-top:8px;cursor:pointer">',
    '<input type="checkbox" id="mExtra" onchange="mBand()" style="width:16px;height:16px;accent-color:#2ec26a">',
    '<span id="mExtraTxt">🍀 Mua thêm 1 cỏ may mắn (phí <b id="mExtraFee">20</b> = 20% cược)</span></label>',
    '<button class="mgo start" id="mGo" onclick="mGoClick()">⛏️ BẮT ĐẦU ĐÀO</button>',
    '<div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Mở ô càng nhiều hệ số càng cao - trúng mìn là mất tiền cược ván đó. Mỗi ván giấu sẵn 1 ô 🍀.</div>',
    '<div class="muted" id="mPotLine" style="font-size:12px;margin-top:4px;text-align:center;color:#ffd24a"></div>',
    '<div class="muted" id="mNote" style="font-size:12px;margin-top:3px;text-align:center;color:#ff9a5c"></div>',
    '</div>',
    '</div>', // hết #pageMine

    // ================= TRANG LEO THANG =================
    '<div id="pageStair" class="hidden">',
    '<div class="card" id="stair">',
    '<div class="row" style="margin-bottom:6px"><h2 style="margin:0">🪜 Leo Thang<span class="hdrpot" id="sPotHdr"></span></h2><div class="muted" id="sStat">Chọn số cầu lửa và tiền cược</div></div>',
    '<div id="tower"></div>',
    '<div id="heroBase"><img src="/hero.png" alt=""></div>',

    '<div class="mctl">',
    // nút MAX tàng hình bên trái = đối trọng cho MAX thật bên phải -> ô cược
    // rộng đúng bằng ô cầu lửa (hàng dưới có nút − / + hai bên), nhìn thẳng hàng
    '<button style="visibility:hidden" tabindex="-1">MAX</button>',
    '<div class="box"><div class="lab">Tiền cược</div><input id="sBet" inputmode="numeric" value="200" oninput="sBand()"></div>',
    '<button id="sMax" onclick="sAllIn()">MAX</button>',
    '</div>',
    '<div class="mctl">',
    '<button id="sMinus" onclick="sStep(-1)">−</button>',
    '<div class="box"><div class="lab big" id="sFireLab">🔥 Cầu lửa mỗi tầng</div><input id="sFire" inputmode="numeric" value="2" oninput="sTable()"></div>',
    '<button id="sPlus" onclick="sStep(1)">+</button>',
    '</div>',
    '<button class="mgo start" id="sGo" onclick="sGoClick()">🪜 BẮT ĐẦU LEO</button>',
    '<div class="muted" id="sPotLine" style="font-size:12px;margin-top:6px;text-align:center;color:#ffd24a"></div>',
    '<div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Càng nhiều cầu lửa hệ số càng cao - đạp trúng lửa là mất tiền cược ván đó.</div>',
    '</div>',
    '</div>', // hết #pageStair

    // ================= TRANG 🎡 VÒNG QUAY (thay Blackjack — đã hủy 18/08) =================
    // Bánh xe SVG 27 nan + 3 mũi tên 🟡🔵🟢 gắn quanh vành lệch 120°. Server chốt kết
    // quả trước, client chỉ diễn hoạt hình quay — không gian lận được.
    '<div id="pageWheel" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎡 Vòng Quay May Mắn</h2><div class="muted" id="whStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px"><b>VÒNG VÉ</b> quay miễn phí ra giá vé chung → cả bàn đủ tiền vé là quay <b>VÒNG HỆ SỐ</b> ăn vé × hệ số, ĐỘC ĐẮC <b>x10</b> 🏆. Mỗi người 1 lượt mỗi khung <b>6 tiếng</b> - reset <b>00:00, 06:00, 12:00, 18:00</b>.</div>',
    '<div id="whWrap">',
    '<svg id="whSvg" viewBox="0 0 300 300"></svg>',
    '<div class="warr y"><div class="tri"></div></div>',
    '<div class="warr b"><div class="tri"></div></div>',
    '<div class="warr g"><div class="tri"></div></div>',
    '</div>',
    '<div id="whPick">',
    '<button id="wp_yellow" class="y" onclick="whPickC(\'yellow\')">🟡 VÀNG</button>',
    '<button id="wp_blue" class="b" onclick="whPickC(\'blue\')">🔵 DƯƠNG</button>',
    '<button id="wp_green" class="g" onclick="whPickC(\'green\')">🟢 LÁ</button>',
    '</div>',
    '<div class="muted" id="whPlayers" style="font-size:13px;margin-top:8px;text-align:center">-</div>',
    '<div id="whRes"></div>',
    '<button class="btn-full" id="whGo" onclick="whGoClick()">🎟️ VÀO BÀN</button>',
    '<button id="whOut" style="display:none;width:100%;margin-top:8px;background:#232735;font-size:13px" onclick="whOutClick()">❌ Rút khỏi bàn (chưa mất gì)</button>',
    '</div>',
    '<div class="card"><h2>🕘 10 vòng gần nhất</h2><div id="whHist" class="muted" style="font-size:13px">Chưa có vòng nào.</div></div>',
    '</div>', // hết #pageWheel

    // ================= TRANG ĐIỂM DANH (dashboard người chơi) =================
    // Lịch tháng kiểu app điểm danh: ngày đã nhận vàng + nhãn CHUỖI, hôm nay viền tím,
    // progress đủ tháng ăn bonus. Nghiện = nút đếm ngược 60 phút theo GIỜ SERVER.
    '<div id="pageDaily" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">📅 Điểm Danh</h2><div class="muted" id="dMonth">Tháng -</div></div>',
    '<div id="dChips">',
    '<div class="dchip"><div class="t">🔥 Chuỗi</div><div class="v" id="dStreak">-</div></div>',
    '<div class="dchip"><div class="t">🎁 Mỗi ngày</div><div class="v" id="dAmt">-</div></div>',
    // Ô này BẤM ĐƯỢC: đủ chuỗi 2 ngày là sáng lên, bấm nhận 800 (nhiều gói lấy hết 1 lần)
    '<div class="dchip" id="dStreakChip" onclick="streakClaim()"><div class="t" id="dStreakT">🔥 Đủ chuỗi 2</div><div class="v" id="dBonus">-</div></div>',
    '</div>',
    '<div id="dcal"></div>',
    '<div class="row" style="margin-top:10px"><div class="muted" id="dCount" style="font-size:13px">-</div><div class="muted" id="dBonusNote" style="font-size:13px"></div></div>',
    '<div id="dprog"><div id="dprogIn"></div></div>',
    '<button class="btn-full" id="dClaim" onclick="dailyClaim()">✨ ĐIỂM DANH NGAY</button>',
    '<div class="muted" style="font-size:12px;margin-top:6px;text-align:center">Điểm danh ở đây hay gõ <b>/diemdanh</b> trong Discord đều tính chung 1 lượt/ngày.</div>',
    '</div>',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">💉 Nghiện</h2><div class="muted" id="ngInfo"></div></div>',
    '<div class="muted" style="font-size:13px;margin-top:4px">Cứ 1 tiếng lụm 1 lần - bấm ở đây hoặc gõ <b>/nghien</b> trong Discord đều tính chung. Ai lụm sẽ bị bêu tên ở kênh nghiện 💉 trong Discord.</div>',
    '<button class="btn-full" id="ngBtn" onclick="nghienClaim()">💉 LỤM NGAY</button>',
    '</div>',
    // 📒 Nợ: chỉ hiện khi ĐANG NỢ. Vay thì qua bảng trong Discord; ở web chỉ xem + trả.
    '<div class="card" id="debtCard" style="display:none">',
    '<div class="row"><h2 style="margin:0">📒 Nợ Dogcoin</h2><div class="muted" id="debtBad"></div></div>',
    '<div id="debtInfo" style="font-size:14px;margin-top:6px">-</div>',
    '<div class="row" style="margin-top:8px">',
    '<input id="debtAmt" type="number" min="1" placeholder="Số muốn trả (trống = trả hết)" style="flex:1">',
    '<button class="btn-full" id="debtPayBtn" style="flex:1;margin-top:0" onclick="debtPay()">💳 TRẢ NỢ</button>',
    '</div>',
    '<div class="muted" style="font-size:12px;margin-top:6px">Dính ⚠️ nợ xấu thì: không chuyển vào game, không chuyển tiền cho người khác, 50% tiền điểm danh/nghiện/chuỗi tự trừ vào nợ. Muốn vay: bảng <b>📒 VAY NỢ</b> trong Discord.</div>',
    '</div>',
    '</div>', // hết #pageDaily

    // ================= TRANG 📈 CỔ PHIẾU DOG =================
    // Sàn thuần web: giá tự nhảy mỗi 30s, mua bằng Dogcoin hoặc theo khối lượng,
    // giữ bao lâu cũng được (gồng), bán lúc nào cũng được. Không có bảng Discord.
    '<div id="pageStock" class="hidden">',
    '<div class="card">',
    '<div id="skHead">',
    '<div><div class="muted" style="font-size:12px">CỔ PHIẾU DOGCOIN · DOG</div>',
    '<div id="skPrice">-</div></div>',
    '<div style="text-align:right"><span id="skChg" class="skchip y">-</span>',
    '<div class="muted" style="font-size:12px;margin-top:5px">nhịp sau <b id="skNext">-</b></div></div>',
    '</div>',
    '<svg id="skChart" viewBox="0 0 300 120" preserveAspectRatio="none"></svg>',
    '<div class="muted" style="display:flex;justify-content:space-between;font-size:11.5px">',
    '<span>1 giờ gần nhất</span><span>mốc gốc <b id="skBase">1.000</b></span></div>',
    '<div id="skNews" style="display:none"></div>',
    '</div>',

    '<div id="skPosCard" class="card" style="display:none">',
    '<div class="row"><span class="muted" style="font-size:12px">VỊ THẾ CỦA BẠN</span><span id="skPosChip" class="skchip y">-</span></div>',
    '<div id="skPl" class="skpl">-</div>',
    '<div class="muted" id="skPosLine" style="font-size:12.5px">-</div>',
    '<div style="height:1px;background:var(--line);margin:9px 0"></div>',
    '<div class="skkv"><span class="muted">Bán hết bây giờ nhận</span><b class="skn" id="skPosVal">-</b></div>',
    '<div class="skkv"><span class="muted">Đỉnh lãi từng gồng qua</span><b class="skn" id="skPeak">-</b></div>',
    '<button class="btn-full" id="skSellBtn" onclick="skSell(0)">BÁN HẾT</button>',
    '<div id="skPart"><button onclick="skPart(4)">Bán 1/4</button><button onclick="skPart(2)">Bán 1/2</button><button onclick="skPart(1.333)">Bán 3/4</button></div>',
    '</div>',

    '<div class="card">',
    '<div class="row"><span class="muted" style="font-size:12px">MUA DOG</span><span class="muted" style="font-size:12px">giá mua <b id="skAsk">-</b></span></div>',
    '<div id="skSeg"><button id="skModeM" class="on" onclick="skMode(1)">Theo Dogcoin</button><button id="skModeS" onclick="skMode(0)">Theo khối lượng</button></div>',
    '<input id="skInp" type="number" min="1" placeholder="Số Dogcoin muốn xuống" oninput="skPrev()">',
    '<div id="skQuick"><button onclick="skPct(25)">25%</button><button onclick="skPct(50)">50%</button><button onclick="skPct(75)">75%</button><button onclick="skPct(100)">TẤT TAY</button></div>',
    '<div style="height:1px;background:var(--line);margin:10px 0"></div>',
    '<div class="skkv"><span class="muted">Khối lượng nhận</span><b class="skn" id="skPvS">0 CP</b></div>',
    '<div class="skkv"><span class="muted">Trừ ví</span><b class="skn" id="skPvC">0</b></div>',
    '<div class="skkv"><span class="muted">Hoà vốn ở giá</span><b class="skn" id="skPvE">-</b></div>',
    '<div class="muted" id="skPvNote" style="font-size:11.5px;margin-top:4px"></div>',
    '<button class="btn-full" id="skBuyBtn" onclick="skBuy()">XÁC NHẬN MUA</button>',
    '<div class="muted" style="font-size:11.5px;margin-top:7px">Chênh mua–bán <b id="skSpr">2</b>% mỗi chiều là phí của sàn - giá phải nhích hơn mức hoà vốn bạn mới có lãi. Sàn còn <b id="skLeft">-</b> CP, mỗi người giữ tối đa <b id="skPer">-</b> CP.</div>',
    '</div>',

    '<div class="card"><h2 style="margin:0 0 8px">🏆 Bảng vàng gồng</h2>',
    '<div id="skBoard" class="muted" style="font-size:12.5px">Chưa có ai chốt ván nào.</div>',
    '<div style="height:1px;background:var(--line);margin:9px 0"></div>',
    '<div class="muted" style="font-size:12px;margin-bottom:4px">ĐANG GỒNG</div>',
    '<div id="skHolders" class="muted" style="font-size:12.5px">Chưa ai giữ CP.</div>',
    '</div>',

    '<div class="card"><h2 style="margin:0 0 8px">📜 Ván của bạn</h2>',
    '<div id="skMine" class="muted" style="font-size:12.5px">Chưa có ván nào.</div>',
    '<div style="height:1px;background:var(--line);margin:9px 0"></div>',
    '<div class="muted" style="font-size:12px;margin-bottom:4px">LỆNH VỪA KHỚP</div>',
    '<div id="skLog" class="muted" style="font-size:12px">Chưa có lệnh nào.</div>',
    '</div>',
    '</div>', // hết #pageStock

    // Chat nằm NGOÀI cả ba trang -> mọi game dùng chung một phòng, đổi tab vẫn thấy
    // nguyên cuộc trò chuyện. Đặt TRÊN bảng lịch sử để khỏi phải cuộn xa mới tới ô chat.
    '<div class="card" id="chatCard"><h2>💬 Chat sòng</h2>',
    '<div id="chatBox"></div>',
    '<div style="display:flex;gap:8px;margin-top:8px">',
    '<input id="chatIn" maxlength="200" placeholder="Chém gió..." style="margin-top:0;flex:1">',
    '<button style="background:var(--blue);min-width:64px" onclick="sendChat()">Gửi</button>',
    '</div></div>',

    // Bảng lịch sử Big Small: nằm dưới cùng, chỉ hiện khi đang ở trang Big Small.
    '<div class="card" id="histCard"><h2>🔮 Lịch sử 20 ván gần nhất</h2>',
    '<div id="hist20" class="muted" style="font-size:13px">Chưa có ván nào.</div></div>',

    '<div id="winpop"></div>',
    // 🍀 CỎ 4 LÁ: chọn 1 trong 4 hộp quà (phần thưởng do server quay lúc bấm)
    '<div id="luckyPick"><div class="box">',
    '<div class="clover">🍀</div>',
    '<h2>CỎ 4 LÁ MAY MẮN!</h2>',
    '<div class="sub" id="luckySub">Chọn 1 hộp quà!</div>',
    '<div class="gifts">',
    '<button data-g="1">🎁</button><button data-g="2">🎁</button>',
    '<button data-g="3">🎁</button><button data-g="4">🎁</button>',
    '</div>',
    '<div id="luckyRes"></div>',
    '<button id="luckyClose" onclick="luckyDone()">OK, CHƠI TIẾP</button>',
    '</div></div>',
    // 🧧 Lộc lá: chuyển Dogcoin cho người chơi khác. Gõ tên để lọc danh sách ví đã có,
    // hoặc dán thẳng Discord ID (cho người chưa hiện trong danh sách).
    '<div id="lolaPop"><div class="box">',
    '<h2 style="margin-bottom:8px">🧧 Lộc lá - chuyển Dogcoin</h2>',
    '<input id="lolaQ" placeholder="Gõ tên người nhận (hoặc dán Discord ID)" oninput="lolaRender()">',
    '<div id="lolaList"></div>',
    '<div id="lolaSel" class="muted" style="font-size:13px;margin:6px 0">Chưa chọn người nhận</div>',
    '<input id="lolaAmt" inputmode="numeric" placeholder="Số Dogcoin muốn gửi">',
    '<div style="display:flex;gap:8px;margin-top:10px">',
    '<button style="flex:1;background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05;padding:12px" onclick="lolaSend()">💸 CHUYỂN</button>',
    '<button style="background:#232735;min-width:80px" onclick="lolaClose()">Đóng</button>',
    '</div></div></div>',
    '<div id="toast"></div>',
    '<script>',
    'var TOKEN=localStorage.getItem("play_token")||"";var SEL="";var TT=0;var LOCKS=10;var PHASE="off";var BAL=0;',
    'var NAN=null;var revealedGame=0;var dragging=false;var paperX=0,paperY=0,baseX=0,baseY=0,dragX0=0,dragY0=0;',
    'var MYID="";var lastSettled=-1;',
    // đồng hồ máy người chơi có thể lệch server vài giây -> đếm giờ theo GIỜ SERVER
    'var CLOCK_OFF=0;function srvNow(){return Math.floor(Date.now()/1000)+CLOCK_OFF}',
    'function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2500)}',
    // ===== ÂM THANH: DÙNG CHUNG MỘT FILE assets/dry-fart.mp3 =====
    // Mìn nổ và đạp trúng lửa đều phát cùng tiếng này.
    'var AC=null;var SND=localStorage.getItem("play_snd")!=="0";var SFX=null;',
    'function acGet(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}',
    'if(AC.state==="suspended")AC.resume();return AC}',
    // Tải + giải mã SẴN ngay lúc mở trang: tiếng phát trong .then() của fetch, nếu đợi
    // tới lúc đó mới tải thì lần nổ đầu tiên bị câm. Tạo AudioContext không cần cử chỉ
    // (nó chỉ nằm im ở trạng thái suspended), chỉ PHÁT mới cần.
    'function loadSfx(){var c=acGet();if(!c||SFX)return;',
    'fetch("/dry-fart.mp3").then(function(r){return r.arrayBuffer()}).then(function(ab){',
    // Safari đời cũ chỉ có dạng callback, đời mới trả Promise -> đỡ cả hai kiểu
    'var p=c.decodeAudioData(ab,function(b){SFX=b},function(){});',
    'if(p&&p.then)p.then(function(b){SFX=b}).catch(function(){})}).catch(function(){})}',
    'loadSfx();',
    // Điện thoại chỉ cho phát tiếng SAU khi người dùng chạm màn hình -> mở khoá ở lần
    // chạm ĐẦU TIÊN, vì tiếng nổ phát trong .then() (đã rời khỏi cú chạm).
    'document.addEventListener("pointerdown",function(){acGet();loadSfx()},{once:true});',
    'function playBoom(){',
    'if(!SND)return;var c=acGet();if(!c)return;',
    'if(!SFX){loadSfx();return}',           // chưa tải xong thì bỏ qua lượt này, không kêu sai
    'var s=c.createBufferSource();s.buffer=SFX;s.connect(c.destination);s.start(0)}',
    // Tắt/bật tiếng — chơi lúc nửa đêm hay trong giờ làm thì cần tắt được.
    'function toggleSnd(){SND=!SND;localStorage.setItem("play_snd",SND?"1":"0");',
    'document.getElementById("sndBtn").textContent=SND?"🔊":"🔇";if(SND)playBoom()}',
    // ===== 🧧 LỘC LÁ: chuyển Dogcoin =====
    'var LOLALIST=[],LOLATO=null;',
    'function lolaOpen(){LOLATO=null;$("lolaQ").value="";$("lolaAmt").value="";',
    '$("lolaSel").textContent="Chưa chọn người nhận";',
    'api("/api/players").then(function(j){LOLALIST=j.list||[];lolaRender()}).catch(function(){LOLALIST=[]});',
    '$("lolaPop").classList.add("show")}',
    'function lolaClose(){$("lolaPop").classList.remove("show")}',
    'function lolaRender(){var q=$("lolaQ").value.trim().toLowerCase();var box=$("lolaList");',
    // lọc theo tên, giấu chính mình; gõ ID 15-20 số thì cho chọn thẳng ID đó
    'var items=LOLALIST.filter(function(p){return p.id!==MYID&&(p.name||"").toLowerCase().indexOf(q)>=0}).slice(0,8);',
    // CHỈ nhét id vào data-attribute, tên tra lại từ danh sách lúc bấm — esc() không
    // escape dấu nháy nên tên chứa " sẽ phá vỡ attribute nếu nhét thẳng.
    'var html=items.map(function(p){return \'<button data-id="\'+p.id+\'" class="\'+(LOLATO&&LOLATO.id===p.id?"on":"")+\'"><span>\'+esc(p.name||"(chưa đặt tên)")+\'</span><span class="lid">\'+p.id.slice(-4)+\'</span></button>\'}).join("");',
    'if(/^\\d{15,20}$/.test(q)&&q!==MYID)html=\'<button data-id="\'+q+\'" class="\'+(LOLATO&&LOLATO.id===q?"on":"")+\'"><span>Dùng thẳng ID này</span><span class="lid">\'+q+\'</span></button>\'+html;',
    'box.innerHTML=html||\'<div class="muted" style="font-size:12px;padding:6px">Không thấy ai khớp - thử gõ khác hoặc dán Discord ID</div>\'}',
    'document.getElementById("lolaList").addEventListener("click",function(e){var b=e.target.closest("button[data-id]");if(!b)return;',
    'var id=b.dataset.id;var p=LOLALIST.find(function(x){return x.id===id});',
    'LOLATO={id:id,name:p?(p.name||"(chưa đặt tên)"):("ID …"+id.slice(-4))};',
    '$("lolaSel").innerHTML="Gửi cho: <b style=\\"color:var(--gold)\\">"+esc(LOLATO.name)+"</b>";lolaRender()});',
    'function lolaSend(){if(!LOLATO)return toast("❌ Chọn người nhận đã");',
    'var amt=parseInt($("lolaAmt").value)||0;if(amt<1)return toast("❌ Nhập số Dogcoin");',
    'api("/api/transfer",{toId:LOLATO.id,amount:amt}).then(function(j){setBal(j.balance);',
    'toast("✅ Đã gửi "+amt.toLocaleString("vi-VN")+" cho "+(j.toName||LOLATO.name));lolaClose();lastChatTs=0;refresh()',
    '}).catch(function(e){toast("❌ "+e.message)})}',
    'function api(p,body){return fetch(p,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!j.ok)throw new Error(j.error||("HTTP "+r.status));return j})})}',
    // tick điều khoản mới mở nút vào chơi
    'function agreeChg(){var c=document.getElementById("agree"),b=document.getElementById("loginBtn");if(c&&b)b.disabled=!c.checked}',
    'function login(){var c=document.getElementById("agree");if(c&&!c.checked)return toast("Phải đồng ý điều khoản trước đã");',
    'var u=document.getElementById("uid").value.trim();var p=document.getElementById("pin").value.trim();if(!u||!p)return toast("Nhập đủ ID + PIN");fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})}).then(function(r){return r.json()}).then(function(j){if(!j.ok)return toast(j.error||"Sai thông tin");TOKEN=j.token;localStorage.setItem("play_token",TOKEN);show(j.name)}).catch(function(){toast("Lỗi mạng")})}',
    'function logout(){TOKEN="";localStorage.removeItem("play_token");location.reload()}',
    'function show(n){document.getElementById("login").classList.add("hidden");document.getElementById("app").classList.remove("hidden");',
    'if(n)document.getElementById("myName").textContent=n;initPaper();',
    'document.getElementById("sndBtn").textContent=SND?"🔊":"🔇";',   // nhớ lựa chọn tắt tiếng lần trước
    // Big Small vẫn tự làm mới ngầm kể cả khi đang ở trang Dò Mìn (số dư luôn đúng,
    // quay lại là thấy ván hiện tại ngay, không phải chờ).
    'refresh();setInterval(refresh,2000);setInterval(tick,250);',
    'mSync();sSync();',
    'var saved=localStorage.getItem("play_page");',
    'go(saved==="mine"||saved==="stair"||saved==="wheel"||saved==="daily"?saved:"tx")}',
    'function pick(c){SEL=c;["tai","xiu","chan","le","bao"].forEach(function(x){document.getElementById("c_"+x).classList.toggle("sel",x===c)})}',
    'function addAmt(n){var a=document.getElementById("amt");a.value=(parseInt(a.value||"0")||0)+n}',
    'function allIn(){document.getElementById("amt").value=BAL}',
    // vẽ 1 viên xí ngầu bằng chấm CSS
    'var PIPS={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};',
    'function dieHTML(v){var s=\'<div class="die">\';PIPS[v].forEach(function(p){s+=\'<div class="pip" style="left:\'+p[0]+\'%;top:\'+p[1]+\'%"></div>\'});return s+"</div>"}',
    'function showDice(dice,withSum){document.getElementById("diceRow").innerHTML=dice.map(dieHTML).join("");var b=document.getElementById("sumBadge");if(withSum){var s=dice[0]+dice[1]+dice[2];b.textContent="Tổng "+s+" - "+(s>=11?"BIG":"SMALL")+" · "+(s%2===0?"CHẴN":"LẺ");b.classList.remove("hidden")}else b.classList.add("hidden")}',
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
    'if(NAN.dice[0]===NAN.dice[1]&&NAN.dice[1]===NAN.dice[2])stormFx(NAN.gameId);else toast("🀫 Bạn nặn xong - giữ kín tới giờ mở bát 😏")}',
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
    'setTimeout(function(){revealDone();toast("⏰ Hết giờ nặn - tự mở giùm bạn!")},600)}',
    'function bet(){if(PHASE!=="bet")return toast("Đang khóa sổ - chờ ván sau!");if(!SEL)return toast("Chọn cửa trước!");var v=parseInt(document.getElementById("amt").value);if(!v||v<=0)return toast("Nhập số Dogcoin");api("/api/bet",{choice:SEL,amount:v}).then(function(j){BAL=j.balance;document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");document.getElementById("amt").value="";toast("💸 Đã đặt "+v.toLocaleString("vi-VN")+" vào "+SEL.toUpperCase());refresh()}).catch(function(e){toast("❌ "+e.message)})}',
    'var NAMES={tai:"BIG",xiu:"SMALL",chan:"CHẴN",le:"LẺ",bao:"BÃO"};',
    'function refresh(){api("/api/state").then(function(j){',
    'MYID=j.me||MYID;',
    // 🏆 nhãn hũ trên tab: cập nhật mỗi nhịp 2 giây, kể cả khi người khác đang nuôi hũ
    'if(j.pots){if(typeof j.pots.mines==="number"){MPOT=j.pots.mines;potTab("mPotHdr",MPOT)}',
    'if(typeof j.pots.stairs==="number"){SPOT=j.pots.stairs;potTab("sPotHdr",SPOT)}}',
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
    'hint.textContent="🔒 CHƯA TỚI GIỜ NẶN";sub.textContent="đặt cược đi - giấy chuyển XANH là kéo được";',
    'var h0=j.history[0];cap.textContent=h0?("Ván trước #"+String(h0.gameId).padStart(5,"0")+": "+h0.dice.join("-")+" = "+h0.sum+" ("+h0.tx+" · "+h0.cl+")"):"Đặt cược đi!";',
    'if(h0)showDice(h0.dice,false);else document.getElementById("diceRow").innerHTML="";document.getElementById("sumBadge").classList.add("hidden")}',
    'else if(PHASE==="nan"&&NAN){stt.textContent="🀫 Khóa sổ - GIỜ NẶN ĐÂY!";',
    'if(revealedGame===NAN.gameId){paper.classList.add("hidden");showDice(NAN.dice,true);cap.textContent="Bạn nặn xong rồi - chờ mở bát trả tiền..."}',
    'else{showDice(NAN.dice,false);paper.classList.remove("hidden","locked");paper.classList.add("open");',
    'hint.textContent="🀫 NẶN ĐI - GIẤY XANH LÀ MỞ ĐƯỢC!";sub.textContent="giữ và kéo tờ giấy về bất kỳ hướng nào, lộ đủ 3 viên là ra điểm";',
    'cap.textContent="Ai kéo người đó thấy - người khác KHÔNG thấy của bạn 🤫"}}',
    'else if(PHASE==="wait"){stt.textContent="⏳ Đang mở bát...";cap.textContent="";paper.classList.add("hidden")}',
    'else{stt.textContent="🔴 Bàn Big Small đang tắt";cap.textContent="";paper.classList.add("hidden")}',
    'if(prevPhase==="nan"&&PHASE!=="nan"){resetPaper()}',
    '["tai","xiu","chan","le","bao"].forEach(function(c){document.getElementById("t_"+c).textContent=(j.totals[c]||0).toLocaleString("vi-VN")});',
    'var m=j.myBets.map(function(b){return NAMES[b.choice]+": "+b.amount.toLocaleString("vi-VN")}).join(" · ");',
    'document.getElementById("mine").textContent=m?("🧾 Ván này bạn đặt - "+m):"";',
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
    'var tai=(h.tx==="BIG"||h.tx==="TÀI"||h.tx==="TAI");',
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
    'var MT=25;var MPOT=-1;var MINBET=200;var POTSEED=1500;var MG=null;var mBusy=false;var MTAB=[];var MOVER=false;var MLAST=null;var MAXWIN=0;var MAXBET=0;',
    'var MMIN=3,MMAX=20;',   // giới hạn số mìn - server là nguồn chuẩn, mSync ghi đè
    // Bấm nhanh: cú bấm trong lúc chờ server KHÔNG bị nuốt nữa — xếp hàng đào tuần tự.
    // mBusyAt = chốt an toàn: request treo quá 8s thì tự gỡ cờ, không phải F5.
    'var mQ=[];var mBusyAt=0;',
    'function $(id){return document.getElementById(id)}',
    // Rút gọn y như sòng Mines thật: x798.37 · x2.07k · x114.16k · x1.02M
    // (cắt xuống 2 số lẻ sau khi chia, tự bỏ số 0 thừa)
    'function fx(m){if(m>=1e6)return "x"+(Math.floor(m/1e4)/100)+"M";if(m>=1e3)return "x"+(Math.floor(m/10)/100)+"k";return "x"+m.toFixed(2)}',
    'function vnd(n){return Math.floor(n).toLocaleString("vi-VN")}',
    'function go(p){',
    '$("pageTx").classList.toggle("hidden",p!=="tx");',
    '$("pageMine").classList.toggle("hidden",p!=="mine");',
    '$("pageStair").classList.toggle("hidden",p!=="stair");',
    '$("pageWheel").classList.toggle("hidden",p!=="wheel");',
    '$("pageDaily").classList.toggle("hidden",p!=="daily");',
    '$("pageStock").classList.toggle("hidden",p!=="stock");',
    '$("histCard").classList.toggle("hidden",p!=="tx");', // lịch sử là của Big Small
    '$("navTx").classList.toggle("on",p==="tx");',
    '$("navMine").classList.toggle("on",p==="mine");',
    '$("navStair").classList.toggle("on",p==="stair");',
    '$("navWheel").classList.toggle("on",p==="wheel");',
    '$("navDaily").classList.toggle("on",p==="daily");',
    '$("navStock").classList.toggle("on",p==="stock");',
    'localStorage.setItem("play_page",p);',
    'if(p==="mine")mSync();else if(p==="stair")sSync();else if(p==="daily")dailySync();else if(p==="wheel")wheelSync();else if(p==="stock")skSync();else refresh()}',
    'function mNum(id){return parseInt($(id).value)||0}',
    'function mCap(){return Math.min(BAL,MAXBET||BAL)}', // cược không quá số dư và không quá trần
    'function mMul(k){if(MG)return;var b=Math.floor(mNum("mBet")*k);if(b<MINBET)b=MINBET;if(b>mCap())b=mCap();$("mBet").value=b;mBand()}',
    'function mAllIn(){if(MG)return;$("mBet").value=mCap();mBand()}',
    'function mStep(d){if(MG)return;var n=mNum("mMines")+d;if(n<MMIN)n=MMIN;if(n>MMAX)n=MMAX;$("mMines").value=n;mTable()}',
    // Bảng hệ số lấy TỪ SERVER (client không tự tính, để không lệch với tiền thật khi trả).
    'var mTimer=0;',
    'function mTable(){clearTimeout(mTimer);mTimer=setTimeout(function(){',
    'var n=mNum("mMines");if(n<MMIN||n>MMAX){n=Math.min(Math.max(n,MMIN),MMAX);$("mMines").value=n}',
    'api("/api/mines/table",{numMines:n}).then(function(j){MTAB=j.table||[];mBar();mBand()}).catch(function(){})},150)}',
    // thanh mốc hệ số: đã ăn = vàng, mốc kế tiếp = xanh nhấp nháy, tự cuộn theo
    // Mốc nào cược hiện tại đã vượt trần thì hiện thẳng "TRẦN" — người chơi thấy ngay
    // đào tới đâu là hết ăn thêm, thay vì đào tiếp rồi mới biết bị cắt.
    // Thanh hệ số PHÂN TRANG: 7 mốc/trang + nút ◀ ▶. Trang tự bám theo MỐC KẾ TIẾP
    // (mở hết 7 mốc đầu là tự sang trang 2); bấm ◀ ▶ xem trang khác thì giữ nguyên
    // lựa chọn đó tới khi mở thêm ô mới (lúc đó nhảy về trang đang chơi).
    'var MPAGE=0,MPGMAN=false,MDONE0=-1,MPER=7;',
    'function mBar(){var done=MG?MG.revealed.length:0;var bet=MG?MG.bet:mNum("mBet");',
    // Đuôi bảng chạm TRẦN x2000 là một dải mốc GIỐNG HỆT NHAU (5 mìn: ô 17-20 đều x2k)
    // -> gộp cả dải thành MỘT ô "TRẦN" cho khỏi thấy x2k lặp 4 lần như lỗi.
    'var LASTV=MTAB.length?MTAB[MTAB.length-1]:0;var CUT=MTAB.length;',
    'for(var q=0;q<MTAB.length;q++){if(MTAB[q]===LASTV){CUT=q+1;break}}',
    'var FLAT=CUT<MTAB.length;var TAB=MTAB.slice(0,CUT);',
    'var np=Math.max(1,Math.ceil(TAB.length/MPER));',
    'if(done!==MDONE0){MDONE0=done;MPGMAN=false}',   // vừa mở thêm ô -> về trang tự động
    'if(!MPGMAN)MPAGE=Math.floor(Math.min(done,Math.max(TAB.length-1,0))/MPER);',   // trang chứa mốc kế tiếp
    'if(MPAGE>=np)MPAGE=np-1;if(MPAGE<0)MPAGE=0;',
    'var cells=TAB.slice(MPAGE*MPER,MPAGE*MPER+MPER).map(function(m,j){var k=MPAGE*MPER+j+1;',
    'var c=k<=done?"hit":(k===done+1?"now":"");',
    'var cap=MAXWIN&&bet>0&&Math.floor(bet*m)>MAXWIN;if(cap)c+=" capped";',
    // Mốc cuối = mở hết ô an toàn. Đánh dấu hẳn để không ai tưởng bảng bị thiếu.
    'if(k===TAB.length)c+=" last";',
    'return \'<div class="mstep \'+c+\'" id="ms\'+k+\'">\'+(cap?"TRẦN":fx(m))+',
    '(k===TAB.length?\'<span class="tag">\'+(FLAT?("Ô "+CUT+"+ · TRẦN"):"MỞ HẾT")+\'</span>\':"")+"</div>"}).join("");',
    '$("mbar").innerHTML=\'<button class="mpg" onclick="mPg(-1)"\'+(MPAGE<=0?" disabled":"")+">◀</button>"+cells+',
    '\'<button class="mpg" onclick="mPg(1)"\'+(MPAGE>=np-1?" disabled":"")+">▶</button>"}',
    'function mPg(d){var L=MTAB.length?MTAB[MTAB.length-1]:0,C=MTAB.length;',
    'for(var q=0;q<MTAB.length;q++){if(MTAB[q]===L){C=q+1;break}}',   // cùng cách gộp trần như mBar
    'var np=Math.max(1,Math.ceil(C/MPER));',
    'MPAGE=Math.min(np-1,Math.max(0,MPAGE+d));MPGMAN=true;mBar()}',
    // hai cột đếm + nút hành động (nút đổi giữa BẮT ĐẦU và NHẬN TIỀN)
    'function potTab(id,v){var e=$(id);if(e)e.textContent=(v>=0?("🏆 HŨ "+vnd(v)):"")}',
    'function mBand(){var go=$("mGo");',
    'potTab("mPotHdr",MPOT);var mpl=$("mPotLine");if(mpl&&MPOT>=0)mpl.textContent="🏆 Hũ Dò Mìn: "+vnd(MPOT)+" · cược tối thiểu "+vnd(MINBET)+"/ván · nhà cái trích 5% cược nuôi hũ (KHÔNG thu thêm của bạn) · nổ xong hũ về "+vnd(POTSEED);',
    'var fe=$("mExtraFee");if(fe)fe.textContent=vnd(Math.floor((mNum("mBet")||0)*0.2));',
    // Ô tick chỉ có tác dụng cho VÁN MỚI. Đang giữa ván thì khoá lại + nói thẳng ván này
    // đang có mấy ô 🍀, hết cảnh tick giữa ván rồi tưởng ván đang chạy được thêm cỏ.
    'var xb=$("mExtra"),xt=$("mExtraTxt"),xw=$("mExtraWrap");',
    'if(xb&&xt&&xw){if(MG){xb.disabled=true;xb.checked=!!MG.extraLucky;xw.style.cursor="default";xw.style.opacity="0.85";',
    'xt.innerHTML="🍀 Ván này giấu <b>"+(MG.luckyTotal||1)+"</b> ô cỏ may mắn"+(MG.extraLucky?" (đã mua thêm)":"")+" · còn <b>"+(MG.luckyLeft||0)+"</b> ô chưa mở";',
    '}else{xb.disabled=false;xw.style.cursor="pointer";xw.style.opacity="1";',
    'xt.innerHTML=\'🍀 Mua thêm 1 cỏ may mắn (phí <b id="mExtraFee">\'+vnd(Math.floor((mNum("mBet")||0)*0.2))+\'</b> = 20% cược)\';}}',
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
    'function mSync(){api("/api/mines/state").then(function(j){MT=j.tiles||25;if(j.pot!==undefined)MPOT=j.pot;if(j.minBet)MINBET=j.minBet;if(j.potSeed)POTSEED=j.potSeed;setBal(j.balance);',
    'MMIN=j.minMines||3;MMAX=j.maxMines||20;',
    '$("mMinesLab").textContent="Số mìn ("+MMIN+"–"+MMAX+")";',
    'MAXWIN=j.maxWin||0;MAXBET=j.maxBet||0;',
    'MG=j.game||null;MLAST=(!MG&&j.last)?j.last:null;MOVER=!!MLAST;mDrawGrid();',
    'if(MG&&MG.luckyPick)luckyOpen("mines");',   // F5 giữa lúc đang chọn hộp -> mở lại
    'if(MG){$("mMines").value=MG.totalMines;$("mBet").value=MG.bet}',
    'else if(MLAST){$("mMines").value=MLAST.totalMines;$("mBet").value=MLAST.bet;mPaintLast()}',
    'if(MAXBET)$("mNote").textContent="Cược tối đa "+vnd(MAXBET)+" · nhận tối đa "+vnd(MAXWIN)+" mỗi ván";',
    'mTable();mBar();mBand()}).catch(function(){})}',
    // Vẽ lại màn kết thúc ván vừa xong (server còn giữ) — thoát ra vào lại vẫn thấy.
    'function mPaintLast(){if(!MLAST)return;',
    'for(var i=0;i<MT;i++){var t=$("mk"+i);if(!t)continue;t.onclick=null;',
    'if(i===MLAST.hit){t.className="mtile boom";t.innerHTML="💣"}',
    'else if(MLAST.revealed.indexOf(i)>=0){t.className="mtile coin";t.innerHTML=COINIMG}',
    'else if(MLAST.defused&&MLAST.defused.indexOf(i)>=0){t.className="mtile shieldsave";t.textContent="🛡️"}',
    'else if(MLAST.lucky&&MLAST.lucky.indexOf&&MLAST.lucky.indexOf(i)>=0){t.className="mtile lucky";t.textContent="🍀"}',   // lộ các ô 🍀 chưa mở (giờ 2 ô/ván)
    'else if(MLAST.mines.indexOf(i)>=0){t.className="mtile shown";t.innerHTML="💣"}',
    'else{t.className="mtile dead";t.textContent="?"}}',
    'var w=MLAST.amount>=0;',
    '$("mStat").textContent=(w?(MLAST.result==="Jackpot"?"🎉 Jackpot - nhận ":"✅ Đã dừng - nhận "):"💥 Trúng mìn - thua ")+',
    'vnd(Math.abs(w?MLAST.amount+MLAST.bet:MLAST.bet))}',
    // Chữ mô tả từng loại quà 🍀 (dùng cho cả dòng kết quả trong hộp lẫn toast)
    'var PRIZE_EMO={shield:"🛡️",dig:"⛏️",cash:"💰",rocket:"🚀",jackpot:"🏆",none:"🍂"};',
    'function luckyMsg(L){if(!L)return "";return {',
    'shield:"🛡️ KHIÊN - trúng mìn/lửa 1 lần không chết!",',
    'dig:"⛏️ MÁY ĐÀO - mở giúp "+((L.opened||[]).length)+" ô an toàn!",',
    'cash:"💰 LÌ XÌ - +"+(L.bonus||0).toLocaleString("vi-VN")+" Dogcoin vào ví luôn!",',
    'rocket:"🚀 THANG MÁY - vọt lên 2 tầng!",',
    'jackpot:"🏆 NỔ HŨ!!! +"+(L.bonus||0).toLocaleString("vi-VN")+" DOGCOIN!!!",',
    'none:"🍂 Trống trơn... kiếp sau may hơn!"',
    '}[L.prize]||"🍀"}',
    'function luckyToast(L){if(L)toast("🎁 "+luckyMsg(L))}',
    // ===== 🍀 CHỌN 1 TRONG 4 HỘP =====
    'var LUCKGAME="";',
    'function luckyOpen(game){LUCKGAME=game;',
    // Hũ hiện SỐ THẬT SẼ NHẬN: trần nổ hũ của ván (Dò Mìn theo SỐ MÌN: 3 mìn x50,
    // 4 mìn x100, 5 mìn x200, 6+ x2000; Leo Thang x2000) rồi kẹp theo giải cao nhất
    // của bàn, CỘNG hũ nuôi đang có. Trước đây treo x2000 cho mọi ván -> hứa lố
    // (ván 3 mìn cược 1.800 ghi 3.600.000 mà thực nhận 100.270 - bug 20/08).
    'function jpCapMines(m){return m<=3?50:(m===4?100:(m===5?200:2000))}',
    'var jp=0;',
    'if(game==="mines"&&MG&&MTAB.length)jp=Math.min(MG.bet*jpCapMines(MG.totalMines),Math.floor(MG.bet*MTAB[MTAB.length-1]))+(MPOT>0?MPOT:0);',
    'if(game==="stairs"&&SG&&STAB.length)jp=Math.min(SG.bet*2000,Math.floor(SG.bet*STAB[STAB.length-1]))+(SPOT>0?SPOT:0);',
    '$("luckySub").textContent=jp>0?("Chọn 1 hộp - biết đâu 🏆 NỔ HŨ "+jp.toLocaleString("vi-VN")+" Dogcoin!"):"Chọn 1 hộp quà!";',
    // dựng lại 4 hộp kín + giấu kết quả/nút đóng của lần trước
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b){',
    'b.disabled=false;b.textContent="🎁";b.classList.remove("win","dim")});',
    '$("luckyRes").style.display="none";$("luckyClose").style.display="none";',
    '$("luckyPick").classList.add("show")}',
    'function luckySend(n){if(!LUCKGAME)return;var game=LUCKGAME;LUCKGAME="";',
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b){b.disabled=true});',
    'api("/api/"+game+"/lucky",{box:n}).then(function(j){',
    'if(typeof j.balance==="number")setBal(j.balance);',
    // LẬT CẢ 4 HỘP: hộp mình chọn sáng vàng, 3 hộp kia mờ — thấy rõ trúng gì, hụt gì
    'var rv=(j.lucky&&j.lucky.reveal)||[];',
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b,i){',
    'b.textContent=PRIZE_EMO[rv[i]]||"🍂";',
    'if(i===n-1)b.classList.add("win");else b.classList.add("dim")});',
    '$("luckyRes").innerHTML="Hộp của bạn: "+luckyMsg(j.lucky);$("luckyRes").style.display="block";',
    '$("luckyClose").style.display="block";',
    'if(j.lucky&&j.lucky.prize==="jackpot")celebrate();',
    // cập nhật bàn chơi NGAY phía sau hộp (đóng hộp là thấy liền, không khựng)
    'if(game==="mines"){if(j.pot!==undefined)MPOT=j.pot;',
    'if(j.jackpot){if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng chạm trần may mắn")},2400);',
    'mEnd("🎉 Jackpot - nhận "+j.win.toLocaleString("vi-VN"),j.win-(MG?MG.bet:0),j.mines)}',
    'else{MG=j.state;mDrawGrid();mBar();mBand()}',
    '}else{',
    'if(j.pot!==undefined)SPOT=j.pot;',
    'if(j.top){if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng chạm trần may mắn")},2400);',
    'var stk=SG?SG.bet:0,fr=SG?SG.fire:0;',
    'sFinish(j,"Lên đỉnh",j.win-stk,stk,fr,SF)}',
    'else{SG=j.state;sTower();sBand()}}',
    '}).catch(function(e){$("luckyPick").classList.remove("show");toast("❌ "+e.message);',
    'if(game==="mines")mSync();else sSync()})}',
    'function luckyDone(){$("luckyPick").classList.remove("show")}',
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b){',
    'b.addEventListener("click",function(){luckySend(parseInt(this.dataset.g))})});',
    'function mDrawGrid(){var g=$("mGrid");g.innerHTML="";',
    'for(var i=0;i<MT;i++){var t=document.createElement("div");t.id="mk"+i;t.dataset.i=i;',
    'if(MG&&MG.revealed.indexOf(i)>=0){t.className="mtile coin";t.innerHTML=COINIMG}',
    // ô mìn đã bị khiên đỡ: lộ 🛡️, chết cứng, không bấm lại được
    'else if(MG&&MG.defused&&MG.defused.indexOf(i)>=0){t.className="mtile shieldsave";t.textContent="🛡️"}',
    'else if(MG){t.className="mtile can";t.textContent="?";t.onclick=function(){mDig(parseInt(this.dataset.i))}}',
    'else{t.className="mtile dead";t.textContent="?"}',
    'g.appendChild(t)}',
    // đang cầm khiên thì nhắc thường trực; không có khiên thì trả lại dòng trần cược cũ
    '$("mNote").textContent=(MG&&MG.shield)?("🛡️ Đang có "+MG.shield+" khiên - trúng mìn "+MG.shield+" lần không chết"):',
    '(MAXBET?"Cược tối đa "+vnd(MAXBET)+" · nhận tối đa "+vnd(MAXWIN)+" mỗi ván":"")}',
    'function mRevealAll(mines){for(var i=0;i<MT;i++){var t=$("mk"+i);if(!t)continue;t.onclick=null;',
    'if(t.classList.contains("coin")||t.classList.contains("boom"))continue;',
    'if(mines&&mines.indexOf(i)>=0){t.className="mtile shown";t.textContent="💣"}else{t.className="mtile dead"}}}',
    // Ván xong thì GIỮ NGUYÊN màn hình (đã lộ hết mìn) cho tới khi người chơi bấm
    // VÁN MỚI — trước đây tự xoá sau 2 giây, chưa kịp nhìn đã mất.
    'function mEnd(msg,net,mines,luckyAt){mRevealAll(mines);MG=null;MOVER=true;',
    // lộ ô 🍀 chưa kịp mở — cho người chơi tiếc mà chơi ván nữa 😏
    'if(luckyAt&&luckyAt.length){luckyAt.forEach(function(la){var lt=$("mk"+la);',
    'if(lt&&!lt.classList.contains("coin")){lt.className="mtile lucky";lt.textContent="🍀"}})}',
    '$("mStat").textContent=msg;',
    'if(net!==null)showNet(net);',
    'mBand()}',
    'function mDig(i){if(!MG)return;',
    // cờ kẹt quá 8s (request treo/mạng chập chờn) -> tự gỡ, không bắt người chơi F5
    'if(mBusy&&Date.now()-mBusyAt>8000){mBusy=false;mQ.length=0}',
    'var t=$("mk"+i);if(!t||!t.classList.contains("can"))return;',
    // đang chờ server: XẾP HÀNG thay vì nuốt im lặng (tối đa 4 ô, không trùng)
    'if(mBusy){if(mQ.length<4&&mQ.indexOf(i)<0)mQ.push(i);return}',
    'mBusy=true;mBusyAt=Date.now();',
    'var stake=MG.bet;',
    'api("/api/mines/reveal",{tile:i}).then(function(j){mBusy=false;',
    'if(typeof j.balance==="number")setBal(j.balance);',
    // 🛡️ khiên đỡ: mìn xịt, hiện 🛡️ tại ô, ĐỨNG YÊN chơi tiếp (không thua, không ăn hệ số)
    // — sự kiện lớn: bỏ hàng đợi, để người chơi nhìn lại bàn rồi tự bấm tiếp
    'if(j.defused!==undefined){mQ.length=0;playBoom();toast("🛡️ KHIÊN đỡ quả mìn - sống! Chơi tiếp đi");',
    'MG=j.state;mDrawGrid();mBar();mBand();return}',
    // 🍀 mở trúng CỎ 4 LÁ: ô hoá xanh lá + bung 4 hộp cho chọn
    'if(j.luckyPick){mQ.length=0;t.className="mtile lucky";t.textContent="🍀";t.onclick=null;',
    'MG=j.state;mBar();mBand();luckyOpen("mines");return}',
    'if(j.hit){mQ.length=0;t.className="mtile boom";t.textContent="💣";playBoom();',
    'toast("💥 BÙM! Mất "+stake.toLocaleString("vi-VN")+" Dogcoin");',
    'return mEnd("💥 Trúng mìn - thua "+stake.toLocaleString("vi-VN"),-stake,j.mines,j.luckyAt)}',
    't.className="mtile coin";t.innerHTML=COINIMG;t.onclick=null;',
    'if(j.jackpot){mQ.length=0;toast("🎉 JACKPOT! Nhận "+j.win.toLocaleString("vi-VN"));',
    'return mEnd("🎉 Jackpot - nhận "+j.win.toLocaleString("vi-VN"),j.win-stake,j.mines)}',
    // vẽ lại cả lưới từ state: ô ⛏️ server mở giúp + ô khiên đỡ đều hiện đúng
    'MG=j.state;mDrawGrid();mBar();mBand();',
    // đào tiếp ô đã xếp hàng lúc chờ (setTimeout 0: thoát chuỗi promise cho sạch lỗi)
    'if(mQ.length){var nx=mQ.shift();setTimeout(function(){mDig(nx)},0)}',
    '}).catch(function(e){mBusy=false;mQ.length=0;toast("❌ "+e.message);mSync()})}',
    'function mStartGame(){if(mBusy||MOVER)return;var n=mNum("mMines"),b=mNum("mBet");',
    'if(n<MMIN||n>MMAX)return toast("❌ Số mìn từ "+MMIN+" đến "+MMAX);',
    'if(b<=0)return toast("❌ Nhập số Dogcoin");',
    'if(b<MINBET)return toast("❌ Cược tối thiểu "+vnd(MINBET)+" Dogcoin mỗi ván");',
    'if(b>BAL)return toast("❌ Không đủ Dogcoin!");',
    'mBusy=true;api("/api/mines/start",{numMines:n,bet:b,extra:$("mExtra").checked}).then(function(j){mBusy=false;if(j.pot!==undefined)MPOT=j.pot;',
    'setBal(j.balance);MG=j.state;mDrawGrid();mBar();mBand()',
    '}).catch(function(e){mBusy=false;toast("❌ "+e.message);mSync()})}',
    'function mCashout(){if(!MG||mBusy)return;mBusy=true;var stake=MG.bet;',
    'api("/api/mines/cashout",{}).then(function(j){mBusy=false;setBal(j.balance);',
    'toast("✅ Nhận "+j.win.toLocaleString("vi-VN")+" Dogcoin");',
    'if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng chạm trần may mắn")},2400);',
    'mEnd("✅ Đã dừng - nhận "+j.win.toLocaleString("vi-VN"),j.win-stake,j.mines,j.luckyAt)',
    '}).catch(function(e){mBusy=false;toast("❌ "+e.message);mSync()})}',
    'function setBal(v){if(typeof v!=="number")return;BAL=v;$("bal").textContent=v.toLocaleString("vi-VN")}',
    '',
    // ===== LEO THANG =====
    // Cùng nguyên tắc với dò mìn: client không tự tính tiền, mọi hệ số lấy từ server.
    'var SF=10,SC=8,SMAXF=5,SPOT=-1,SG=null,sBusy=false,STAB=[],SOVER=false,SLAST=null;',
    // sBusyAt: chốt an toàn gỡ cờ kẹt. Leo thang CỐ TÌNH không xếp hàng cú bấm như dò
    // mìn — mỗi bước đổi tầng, cú bấm xếp hàng sẽ áp vào TẦNG KẾ TIẾP ngoài ý muốn.
    'var sBusyAt=0;',
    'function sNum(id){return parseInt($(id).value)||0}',
    'function sMul(k){if(SG)return;var b=Math.floor(sNum("sBet")*k);if(b<MINBET)b=MINBET;if(b>BAL)b=BAL;$("sBet").value=b;sBand()}',
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
    // nhân vật đứng ở BẬC THẬT cao nhất đã bấm (safe[f] = -1 là tầng 🚀 nhảy qua, không có ô)
    'var heroF=-1;if(SG)for(var hf=0;hf<done;hf++)if(SG.safe[hf]>=0)heroF=hf;',
    'for(var f=SF-1;f>=0;f--){',
    'var cls=f<done?"done":(SG&&f===done?"now":"");',
    // tầng cách chỗ đang đứng hơn 3 bậc thì làm mờ, mắt đỡ rối
    'if(SG&&f>done+3)cls+=" far";',
    'var cells="";',
    'for(var c=0;c<SC;c++){',
    'var cc="scell",inner="";',
    'if(SG&&f<done&&SG.safe[f]===c){cc+=" step";',
    // nhân vật đứng ở bậc vừa leo tới, các bậc dưới để lại đồng Dogcoin
    'inner=(f===heroF)?HEROIMG:COINCELL}',
    // 🌟 ô vàng HIỆN RÕ (đạp là lên thẳng đỉnh) — thấy mà thèm, phải leo tới mới ăn
    'else if(SG&&SG.golden&&SG.golden.floor===f&&SG.golden.col===c&&f>=done){cc+=" gold";inner="🌟"}',
    // ô lửa đã bị khiên đỡ: lộ 🔥, cấm bấm lại
    'else if(SG&&SG.burned&&SG.burned.some(function(b){return b.f===f&&b.c===c})){cc+=" fire";inner="🔥"}',
    'cells+=\'<div class="\'+cc+\'" id="sc_\'+f+"_"+c+\'" data-c="\'+c+\'">\'+inner+"</div>"}',
    'html+=\'<div class="srow \'+cls+\'" id="sr\'+f+\'"><div class="cells">\'+cells+\'</div><div class="mx">\'+fx(STAB[f])+"</div></div>"}',
    'box.innerHTML=html;',
    // chưa vào ván thì nhân vật đứng dưới chân tháp
    '$("heroBase").style.display="none";',   // hero chân tháp đã tắt hẳn (19/08)
    'if(SG){var row=$("sr"+done);if(row)row.querySelectorAll(".scell").forEach(function(el){',
    'if(el.classList.contains("fire"))return;', // ô lửa đã lộ (khiên đỡ) - cấm bấm lại
    'el.onclick=function(){sTap(parseInt(this.dataset.c))}})}}',
    'function sBand(){var go=$("sGo");',
    'potTab("sPotHdr",SPOT);var spl=$("sPotLine");if(spl&&SPOT>=0)spl.textContent="🏆 Hũ Leo Thang: "+vnd(SPOT)+" · cược tối thiểu "+vnd(MINBET)+"/ván · nhà cái trích 5% cược nuôi hũ (KHÔNG thu thêm của bạn) · nổ xong hũ về "+vnd(POTSEED);',
    'if(SG){',
    '$("sStat").textContent=SG.fire+" lửa · cược "+vnd(SG.bet)+" · tầng "+SG.floor+"/"+SF+" · "+fx(SG.multi)+(SG.shield?(" · 🛡️ x"+SG.shield):"");',
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
    'SF=j.floors||10;SC=j.cols||8;SMAXF=j.maxFire||5;if(j.pot!==undefined)SPOT=j.pot;if(j.minBet)MINBET=j.minBet;if(j.potSeed)POTSEED=j.potSeed;setBal(j.balance);',
    'SG=j.game||null;SLAST=(!SG&&j.last)?j.last:null;SOVER=!!SLAST;',
    'if(SG&&SG.luckyPick)luckyOpen("stairs");',   // F5 giữa lúc đang chọn hộp -> mở lại
    '$("sFireLab").textContent="🔥 Cầu lửa mỗi tầng (1–"+SMAXF+")";',
    'if(SG){$("sFire").value=SG.fire;$("sBet").value=SG.bet}',
    'else if(SLAST){$("sFire").value=SLAST.fire;$("sBet").value=SLAST.bet}',
    'sTable()}).catch(function(){})}',
    // Vẽ lại tháp của ván vừa xong: lộ hết cầu lửa, đánh dấu chỗ cháy.
    // Nhân vật cuối ván ĐỔI THÀNH ảnh phản ứng theo kết cục (thông báo tiền giữ nguyên).
    'function endHero(){var src=SLAST.hitFloor>=0?"/thuahet1.png":(SLAST.result==="Lên đỉnh"?"/thang100.png":"/ngungdungluc.png");',
    'return \'<img class="hero end" src="\'+src+\'" alt="">\'}',
    'function sPaintLast(){if(!SLAST)return;',
    // bậc THẬT cao nhất (bỏ qua các tầng -1 do 🚀/🌟 nhảy) — chỗ đặt nhân vật kết cục
    'var heroF=-1;for(var hf=0;hf<SLAST.safe.length;hf++)if(SLAST.safe[hf]>=0)heroF=hf;',
    'for(var f=0;f<SF;f++){var row=$("sr"+f);if(row)row.classList.remove("now","far");',
    'for(var c=0;c<SC;c++){var el=$("sc_"+f+"_"+c);if(!el)continue;el.onclick=null;',
    // Chết ngay tầng 1 (chưa leo được bậc nào an toàn) -> không có bậc nào để đứng,
    // đặt luôn nhân vật ở ô cháy, kẻo mất hình.
    'if(f===SLAST.hitFloor&&c===SLAST.hitCol){el.className="scell boom";',
    'el.innerHTML="💥"+(SLAST.safe.length===0?endHero():"")}',
    'else if(f<SLAST.safe.length&&SLAST.safe[f]===c){el.className="scell step";',
    // Bậc cao nhất đã leo tới = chỗ nhân vật đứng. Chỉ ĐỔI HÌNH nhân vật theo kết cục,
    // vị trí và dấu 💥 giữ y như trước.
    'el.innerHTML=(f===heroF)?endHero():COINCELL}',
    'else if(SLAST.traps[f]&&SLAST.traps[f].indexOf(c)>=0){el.className="scell fire";el.innerHTML="🔥"}',
    // lộ ô 🍀 / 🌟 chưa đạp tới — "nó ở NGAY ĐÓ mà không leo tới, tiếc chưa"
    'else if(SLAST.luckyCells&&SLAST.luckyCells.some(function(l){return l.f===f&&l.c===c})){el.className="scell lucky";el.innerHTML="🍀"}',
    'else if(SLAST.goldPos&&SLAST.goldPos.f===f&&SLAST.goldPos.c===c){el.className="scell gold";el.innerHTML="🌟"}',
    'else{el.className="scell";el.innerHTML=""}}}',
    '$("heroBase").style.display="none";',
    'var w=SLAST.amount>=0;',
    '$("sStat").textContent=(w?(SLAST.result==="Lên đỉnh"?"🏆 Lên đỉnh - nhận ":"✅ Đã dừng - nhận "):"🔥 Trúng cầu lửa - thua ")+',
    'vnd(Math.abs(w?SLAST.amount+SLAST.bet:SLAST.bet))}',
    // lộ hết bẫy của tầng vừa cháy rồi khóa tháp
    // Ván xong: dựng SLAST từ dữ liệu server rồi vẽ lại CẢ THÁP — lộ cầu lửa của
    // MỌI TẦNG, không riêng tầng vừa cháy. Giữ nguyên tới khi bấm VÁN MỚI.
    'function sFinish(j,res,net,stake,fire,floor,hitFloor,hitCol){',
    'SLAST={result:res,amount:net,bet:stake,fire:fire,floor:floor,',
    'safe:j.safe||[],traps:j.traps||[],',
    'luckyCells:j.luckyCells||[],goldPos:j.goldPos||null,',   // lộ 🍀/🌟 chưa đạp
    'hitFloor:(hitFloor===undefined?-1:hitFloor),hitCol:(hitCol===undefined?-1:hitCol)};',
    // Lên đỉnh thì ăn mừng; thông báo tiền vẫn là showNet + dòng sStat như cũ.
    'SG=null;SOVER=true;sTower();sPaintLast();showNet(net);sBand();',
    'if(res==="Lên đỉnh")celebrate()}',
    // mưa emoji ăn mừng (dùng lại .fx của hiệu ứng Bão bên Big Small)
    'function celebrate(){',
    'document.body.classList.remove("storm");void document.body.offsetWidth;document.body.classList.add("storm");',
    'var EM=["🎉","🏆","🪙","💰","✨","🎊"];',
    'for(var i=0;i<34;i++){var s=document.createElement("div");s.className="fx";s.textContent=EM[i%EM.length];',
    's.style.left=(Math.random()*96)+"vw";s.style.fontSize=(18+Math.random()*30)+"px";',
    's.style.animationDuration=(1.4+Math.random()*1.8)+"s";s.style.animationDelay=(Math.random()*0.9)+"s";',
    'document.body.appendChild(s);(function(el){setTimeout(function(){el.remove()},4200)})(s)}',
    'setTimeout(function(){document.body.classList.remove("storm")},1500)}',
    'function sTap(c){if(!SG)return;',
    'if(sBusy&&Date.now()-sBusyAt>8000)sBusy=false;',   // request treo -> tự gỡ, khỏi F5
    'if(sBusy)return;sBusy=true;sBusyAt=Date.now();',
    'var stake=SG.bet,fire=SG.fire,f=SG.floor;',
    'api("/api/stairs/step",{col:c}).then(function(j){sBusy=false;',
    'if(typeof j.balance==="number")setBal(j.balance);',
    // 🛡️ khiên đỡ lửa: ĐỨNG YÊN tầng này, ô lửa lộ ra, chọn ô khác
    'if(j.shielded){playBoom();toast("🛡️ KHIÊN đỡ cầu lửa - đứng lại, chọn ô khác!");',
    'SG=j.state;sTower();sBand();return}',
    // 🍀 đạp trúng CỎ 4 LÁ: bung 4 hộp cho chọn
    'if(j.luckyPick){toast("🍀 CỎ 4 LÁ MAY MẮN!");SG=j.state;sTower();sBand();luckyOpen("stairs");return}',
    'if(j.golden){toast("🌟 Ô VÀNG!! BAY THẲNG LÊN ĐỈNH!!");celebrate()}',
    'if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng chạm trần may mắn")},2400);',
    'if(j.burn){playBoom();toast("🔥 CHÁY! Mất "+vnd(stake)+" Dogcoin");',
    'return sFinish(j,"Trúng lửa (Thua)",-stake,stake,fire,f,f,c)}',
    'var el=$("sc_"+f+"_"+c);if(el){el.className="scell step";el.innerHTML=HEROIMG}',
    'if(j.top){toast("🏆 LÊN ĐỈNH! Nhận "+vnd(j.win));',
    'return sFinish(j,"Lên đỉnh",j.win-stake,stake,fire,SF)}',
    'SG=j.state;sTower();sBand()}).catch(function(e){sBusy=false;toast("❌ "+e.message);sSync()})}',
    'function sStart(){if(sBusy||SOVER)return;var f=sNum("sFire"),b=sNum("sBet");',
    'if(f<1||f>SMAXF)return toast("❌ Cầu lửa từ 1 đến "+SMAXF);',
    'if(b<=0)return toast("❌ Nhập số Dogcoin");',
    'if(b<MINBET)return toast("❌ Cược tối thiểu "+vnd(MINBET)+" Dogcoin mỗi ván");',
    'if(b>BAL)return toast("❌ Không đủ Dogcoin!");',
    'sBusy=true;api("/api/stairs/start",{fire:f,bet:b}).then(function(j){sBusy=false;if(j.pot!==undefined)SPOT=j.pot;',
    'setBal(j.balance);SG=j.state;sTower();sBand()',
    '}).catch(function(e){sBusy=false;toast("❌ "+e.message);sSync()})}',
    'function sCashout(){if(!SG||sBusy)return;sBusy=true;',
    'var stake=SG.bet,fire=SG.fire,floor=SG.floor;',
    'api("/api/stairs/cashout",{}).then(function(j){sBusy=false;setBal(j.balance);',
    'toast("✅ Nhận "+vnd(j.win)+" Dogcoin");',
    'sFinish(j,"Dừng (Thắng)",j.win-stake,stake,fire,floor)',
    '}).catch(function(e){sBusy=false;toast("❌ "+e.message);sSync()})}',
    '',
    // ===== 🎡 VÒNG QUAY MAY MẮN =====
    // Server chốt nan trúng (idx dưới mũi tên 🟡 đỉnh); 🔵 = idx+9, 🟢 = idx+18.
    // Client chỉ quay bánh xe tới đúng nan — WOFF3 bù lệch đồng hồ như bên nghiện.
    // WBMODE: bánh đang vẽ — 1 = VÒNG VÉ (15 nan tiền, 1 mũi tên) · 2 = VÒNG HỆ SỐ
    // (27 nan x..., 3 mũi tên). WSEQ1 = seq vòng vé đã diễn (như WSEQ0 của vòng hệ số).
    'var WST=null,WOFF3=0,WBMODE=0,WSEQ0=0,WSEQ1=0,WANIM=false,WROT=0,WSEL=localStorage.getItem("wh_color")||"yellow";',
    'var WEM={yellow:"🟡",blue:"🔵",green:"🟢"};',
    'function whMode(){if(!WST)return 1;return (WST.status==="stake"||WST.status==="spinning")?2:1}',
    'function whSegs(){return WBMODE===1?(WST.segments1||[]):(WST.segments||[])}',
    // Server trả tiền + ghi lịch sử NGAY lúc bấm quay (chống mất tiền khi crash),
    // nên client phải TỰ GIẤU kết quả tới khi bánh xe dừng: chưa hết vòng quay thì
    // không setBal (số dư nhảy trước là lộ), lịch sử thì whRender tự cắt vòng đang quay.
    'function wheelSync(){api("/api/wheel/state").then(function(j){',
    // pha stake tụt về waiting mà KHÔNG có vòng quay mới = vòng đóng vì quá giờ.
    // LƯỢT ĐÃ TÍNH từ lúc quay vé — nói thẳng, không để tưởng được quay lại.
    'if(WST&&WST.status==="stake"&&j.status==="waiting"&&(!j.spin||j.spin.seq===WSEQ0)){',
    'toast("⏳ Quá giờ - vòng đã đóng. Lượt khung này ĐÃ DÙNG (vé quay là tính lượt)");$("whRes").style.display="none"}',
    'WST=j;WOFF3=j.now-Date.now();',
    'if(!WANIM)whBuild(whMode());',   // KHÔNG đập bánh xe giữa lúc đang diễn hoạt hình
    'var fresh=j.spin&&j.spin.seq!==WSEQ0;',
    'var fresh1=j.spin1&&j.spin1.seq!==WSEQ1;',
    'if(!fresh&&!fresh1)setBal(j.balance);',   // vòng vé hoàn chênh cũng giấu tới khi bánh dừng
    'whRender();',
    // ưu tiên vòng hệ số (đến sau); vòng vé chỉ diễn khi chưa có vòng hệ số mới
    'if(fresh){WSEQ0=j.spin.seq;if(j.spin1)WSEQ1=j.spin1.seq;',
    'if(Date.now()+WOFF3<j.spin.endsAt){whBuild(2);whAnimate(j.spin)}else{setBal(j.balance);whBuild(2);whShowRes(j.spin,true)}}',
    'else if(fresh1){WSEQ1=j.spin1.seq;',
    'if(Date.now()+WOFF3<j.spin1.endsAt){whBuild(1);whAnimate1(j.spin1)}else{setBal(j.balance);whShowRes1(j.spin1,true)}}',
    '}).catch(function(e){toast("❌ "+e.message)})}',
    // Vẽ bánh xe theo CHẾ ĐỘ: 1 = vòng vé (15 nan tiền, 1 mũi tên) · 2 = vòng hệ số.
    // Chỉ vẽ lại khi đổi chế độ — đổi bảng nan chỉ cần sửa server.
    'function whBuild(mode){if(!WST||WBMODE===mode)return;WBMODE=mode;WROT=0;',
    '$("whWrap").classList.toggle("one",mode===1);',   // vòng vé: giấu 2 mũi tên phụ
    'var segs=whSegs(),N=segs.length,step=360/N,R=138,cx=150,cy=150;',
    'var FILL={"1.5":"#3949ab","1.8":"#00838f","2":"#1e8e4d","2.5":"#9c27b0","3":"#c96f14","5":"#d13b55","10":"#f0b90b"};',   // bậc mới 19/08: sàn 1.5, thêm 3/5

    'var FILL1={"2000":"#1e8e4d","2500":"#2e7dd1","3000":"#f0b90b"};',   // vé: xanh lá / dương / vàng
    'var h=\'<circle cx="150" cy="150" r="146" fill="#0e1016"/><g id="whRot">\';',
    'for(var i=0;i<N;i++){var m=segs[i];',
    'var a0=(i*step-90)*Math.PI/180,a1=((i+1)*step-90)*Math.PI/180;',
    'var x0=cx+R*Math.cos(a0),y0=cy+R*Math.sin(a0),x1=cx+R*Math.cos(a1),y1=cy+R*Math.sin(a1);',
    'var fill=mode===1?(FILL1[String(m)]||"#2c3350"):(FILL[String(m)]||"#2c3350");',
    'h+=\'<path d="M150 150L\'+x0.toFixed(1)+" "+y0.toFixed(1)+\'A\'+R+" "+R+\' 0 0 1 \'+x1.toFixed(1)+" "+y1.toFixed(1)+\'Z" fill="\'+fill+\'" stroke="#0e1016" stroke-width="1.5"/>\';',
    // Chữ xoay DỌC THEO BÁN KÍNH (đọc từ tâm ra ngoài) như bàn quay thật — 27 nan
    // chữ nằm ngang theo vành là đè lên nhau, xoay dọc thì mỗi nan một làn riêng.
    'var mid=i*step+step/2,am=(mid-90)*Math.PI/180,tx=cx+92*Math.cos(am),ty=cy+92*Math.sin(am);',
    'var lbl=mode===1?m.toLocaleString("vi-VN"):(m>=10?"x10 🏆":"x"+m);',
    'var tfill=mode===1?(m>=3000?"#3d2c05":"#fff"):(m>=10?"#3d2c05":"#fff");',   // chữ tối trên nan vàng (vé đắt nhất / x10)
    'var tsz=mode===1?14:(m>=10?16:13);',
    'h+=\'<text x="\'+tx.toFixed(1)+\'" y="\'+ty.toFixed(1)+\'" fill="\'+tfill+\'" font-size="\'+tsz+\'" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(\'+(mid-90)+\' \'+tx.toFixed(1)+" "+ty.toFixed(1)+\')">\'+lbl+"</text>"}',
    'h+=\'</g><circle cx="150" cy="150" r="30" fill="#161926" stroke="#2a2f42" stroke-width="2"/><text x="150" y="150" font-size="22" text-anchor="middle" dominant-baseline="central">\'+(mode===1?"🎟️":"🎡")+\'</text>\';',
    '$("whSvg").innerHTML=h}',
    // Quay bánh xe tới nan idx: 15 GIÂY, 12 vòng — vọt nhanh lúc đầu rồi chậm
    // từ từ rất dài về cuối (bezier đuôi sát 1), đứng hẳn mới báo kết quả.
    // fast=true: vòng vé — 8 giây 8 vòng (nhanh gọn); vòng hệ số giữ 15 giây 12 vòng
    'function whSpinTo(idx,cb,fast){var g=$("whRot");if(!g)return;var N=whSegs().length,step=360/N;',
    'var target=((-(idx*step+step/2))%360+360)%360;',
    'WROT=((WROT%360)+360)%360;',
    'g.style.transition="none";g.style.transform="rotate("+WROT+"deg)";',
    'void g.getBoundingClientRect();',
    'var turns=fast?8:12,secs=fast?8:15;',
    'var final=WROT+turns*360+((target-WROT)%360+360)%360;',
    'g.style.transition="transform "+secs+"s cubic-bezier(.09,.6,.05,1)";g.style.transform="rotate("+final+"deg)";WROT=final;',
    'if(cb)setTimeout(cb,secs*1000+300)}',
    'function whAnimate(sp){WANIM=true;$("whRes").style.display="none";whBtn();',
    'whSpinTo(sp.idx,function(){WANIM=false;whShowRes(sp,false);wheelSync()})}',
    // vòng vé quay xong: báo giá vé + tiền hoàn chênh, rồi sync để bánh đổi sang vòng hệ số
    'function whAnimate1(sp){WANIM=true;$("whRes").style.display="none";whBtn();',
    'whSpinTo(sp.idx,function(){WANIM=false;whShowRes1(sp,false);wheelSync()},true)}',
    'function whShowRes1(sp,quiet){var box=$("whRes");if(!box)return;',
    'box.innerHTML="🎟️ VÉ VÒNG NÀY: <b>"+sp.price.toLocaleString("vi-VN")+"</b> Dogcoin/người - đủ cả bàn là quay VÒNG HỆ SỐ!";',
    'box.style.display="block";',
    'if(!quiet)toast("🎟️ Vé "+sp.price.toLocaleString("vi-VN")+" - cần đủ trong ví để quay tiếp");',
    'whBtn()}',
    'function whShowRes(sp,quiet){var box=$("whRes");if(!box)return;',
    'var h="Kết quả: "+["yellow","blue","green"].map(function(c){return WEM[c]+" <b>x"+sp.results[c]+"</b>"}).join(" · ");',
    'h+="<br>"+sp.players.map(function(p){return WEM[p.color]+" "+esc(p.name)+" <b>+"+p.win.toLocaleString("vi-VN")+"</b>"}).join(" · ");',
    'box.innerHTML=h;box.style.display="block";',
    'var mine=null;sp.players.forEach(function(p){if(WST&&p.userId===WST.me)mine=p});',
    'if(!quiet&&mine){if(mine.multi>=10){celebrate();toast("🏆 ĐỘC ĐẮC x10!!! +"+mine.win.toLocaleString("vi-VN")+" Dogcoin!!!")}',
    'else toast("🎡 x"+mine.multi+" - +"+mine.win.toLocaleString("vi-VN")+" Dogcoin")}',
    'whBtn()}',
    'function whRender(){if(!WST)return;',
    // đếm ngược 120s pha chọn màu/gom vé
    'var cd="";if(WST.status==="stake"&&WST.stakeEndsAt){var s2=Math.max(0,Math.ceil((WST.stakeEndsAt-(Date.now()+WOFF3))/1000));cd=" · còn "+s2+"s"}',
    '$("whStat").textContent=WST.status==="spinning"?"🎡 ĐANG QUAY...":WST.status==="spin1"?"🎟️ ĐANG QUAY VÉ...":WST.status==="stake"?("🎟️ vé "+(WST.price||0).toLocaleString("vi-VN")+cd):("chờ "+WST.players.length+"/"+WST.minPlayers+" người");',
    // vòng 1 không màu -> hiện ⬜; màu chỉ chọn ở vòng hệ số
    '$("whPlayers").innerHTML=WST.players.length?("Đang chờ: "+WST.players.map(function(p){return (p.color?WEM[p.color]:"⬜")+" "+esc(p.name)}).join(" · ")):"Chưa ai vào bàn - rủ bạn bè vào cùng!";',
    // bảng chọn màu CHỈ hiện ở vòng 2 (vé đã chốt)
    '$("whPick").style.display=(WST.status==="stake")?"":"none";',
    'if(WST.myColor)WSEL=WST.myColor;',
    '["yellow","blue","green"].forEach(function(c){var b=$("wp_"+c);if(b)b.classList.toggle("sel",WST.myColor===c)});',
    'var hh=WST.history||[];',
    // Vòng ĐANG quay đã nằm đầu lịch sử (server ghi ngay lúc bấm) — bánh xe chưa
    // dừng thì cắt nó đi, kẻo kết quả hiện ở dưới trước khi quay xong.
    'if(hh.length&&(WANIM||(WST.spin&&(Date.now()+WOFF3)<WST.spin.endsAt)))hh=hh.slice(1);',
    '$("whHist").innerHTML=hh.length?hh.map(function(e){return \'<div style="padding:5px 0;border-bottom:1px solid var(--line)">\'+(e.time||"")+(e.price?" · 🎟️ vé "+Number(e.price).toLocaleString("vi-VN"):"")+" · "+["yellow","blue","green"].map(function(c){return WEM[c]+" x"+(e.results?e.results[c]:"?")}).join(" ")+"<br>"+(e.players||[]).map(function(p){return WEM[p.color]+" "+esc(p.name)+" +"+Number(p.win).toLocaleString("vi-VN")}).join(" · ")+"</div>"}).join(""):"Chưa có vòng nào.";',
    'whBtn()}',
    // Nút chính 3 trạng thái: chưa vào bàn = VÀO BÀN · vào rồi chưa đủ người = chờ
    // (disabled) · đủ người (armed) = QUAY!!! phát sáng, ai trong bàn bấm cũng được.
    // Nút rút #whOut tách riêng, chỉ hiện khi mình đang trong bàn và chưa quay.
    'function whBtn(){var b=$("whGo");if(!b||!WST)return;',
    'var o=$("whOut");if(o)o.style.display=(WST.seated&&WST.status==="waiting"&&!WANIM)?"block":"none";',
    'b.classList.remove("arm");',
    'if(WANIM){b.disabled=true;b.textContent=WBMODE===1?"🎟️ ĐANG QUAY VÒNG VÉ...":"🎡 ĐANG QUAY...";return}',
    'if(WST.status==="spinning"){b.disabled=true;b.textContent="🎡 ĐANG QUAY...";return}',
    'if(WST.status==="spin1"){b.disabled=true;b.textContent="🎟️ ĐANG QUAY VÒNG VÉ...";return}',
    // vé đã chốt: TẤT CẢ chọn màu + đủ tiền vé thì nút mới sáng
    'if(WST.status==="stake"){',
    'var sh=WST.stakeShort||[],noc=WST.noColor||[];',
    'if(!WST.seated){b.disabled=true;b.textContent="🎡 BÀN ĐANG GIỮA VÒNG - CHỜ VÒNG SAU";return}',
    'if(!WST.myColor){b.disabled=true;b.textContent="🎯 CHỌN MÀU MŨI TÊN Ở TRÊN ĐỂ QUAY!";return}',
    'if(noc.length){b.disabled=true;b.textContent="⏳ CHỜ CHỌN MÀU: "+noc.join(", ");return}',
    'if(sh.length){b.disabled=true;b.textContent="⏳ CHỜ ĐỦ VÉ "+(WST.price||0).toLocaleString("vi-VN")+" - THIẾU: "+sh.join(", ");return}',
    'b.disabled=false;b.classList.add("arm");b.textContent="🎡 VÉ "+(WST.price||0).toLocaleString("vi-VN")+" - QUAY VÒNG HỆ SỐ!!!";return}',
    'if(WST.seated){',
    'if(WST.armed){b.disabled=false;b.classList.add("arm");b.textContent="🎟️ ĐỦ NGƯỜI - QUAY VÒNG VÉ!!!";return}',
    'b.disabled=true;b.textContent="⏳ CHỜ ĐỦ NGƯỜI ("+WST.players.length+"/"+WST.minPlayers+")...";return}',
    'if(WST.played){b.disabled=true;',
    'var left=WST.nextReset-(Date.now()+WOFF3);if(left<0)left=0;',
    'var hh2=Math.floor(left/3600000),mm2=Math.floor(left%3600000/60000);',
    'b.textContent="⏳ KHUNG NÀY QUAY RỒI - CÒN "+hh2+" GIỜ "+(mm2<10?"0":"")+mm2+" PHÚT";return}',
    'b.disabled=false;',
    'b.textContent="🎟️ VÀO BÀN - QUAY VÉ MIỄN PHÍ (vé 2.000–3.000 trừ sau)"}',
    // chọn màu (chỉ hiện ở vòng hệ số): đang ngồi thì gửi server luôn
    'function whPickC(c){WSEL=c;localStorage.setItem("wh_color",c);',
    'if(WST&&WST.seated&&WST.myColor!==c){api("/api/wheel/ready",{color:c}).then(function(j){WST=j;whRender();whBtn();toast("Mũi tên của bạn: "+WEM[c])}).catch(function(e){toast("❌ "+e.message)})}',
    'else whRender()}',
    'function whGoClick(){if(!WST)return;var b=$("whGo");b.disabled=true;',
    // 3 pha: chưa vào bàn -> VÀO BÀN (không cần màu) · chờ đủ người -> QUAY VÒNG VÉ · vé chốt -> QUAY VÒNG HỆ SỐ
    'var p;',
    'if(!WST.seated)p=api("/api/wheel/ready",{color:""});',
    'else if(WST.status==="stake")p=api("/api/wheel/spin",{});',
    'else p=api("/api/wheel/spin1",{});',
    'p.then(function(j){WST=j;',
    'var fresh=j.spin&&j.spin.seq!==WSEQ0;',
    'var fresh1=j.spin1&&j.spin1.seq!==WSEQ1;',
    'if(!fresh&&!fresh1)setBal(j.balance);',   // vòng mới thì số dư chờ bánh xe dừng mới nhảy
    'whRender();',
    'if(fresh){WSEQ0=j.spin.seq;if(j.spin1)WSEQ1=j.spin1.seq;whBuild(2);whAnimate(j.spin)}',
    'else if(fresh1){WSEQ1=j.spin1.seq;whBuild(1);whAnimate1(j.spin1)}',   // mình bấm -> diễn ngay
    '}).catch(function(e){toast("❌ "+e.message);wheelSync()})}',
    'function whOutClick(){var o=$("whOut");o.disabled=true;',
    'api("/api/wheel/unready",{}).then(function(j){WST=j;setBal(j.balance);o.disabled=false;whRender();toast("↩️ Đã rút khỏi bàn")}).catch(function(e){o.disabled=false;toast("❌ "+e.message);wheelSync()})}',
    // (nút 🎠 quay thử đã bỏ 19/08 theo yêu cầu chủ server — gọn giao diện)
    // poll khi đang đứng ở tab vòng quay (bắt vòng quay do người khác kích hoạt)
    'setInterval(function(){if(TOKEN&&!WANIM&&localStorage.getItem("play_page")==="wheel")wheelSync()},2000);',
    'setInterval(function(){if(localStorage.getItem("play_page")==="wheel")whBtn()},1000);',
    '',
    // ===== 📈 SÀN CỔ PHIẾU DOG =====
    // SKM=1 nhập theo tiền, 0 nhập theo khối lượng. SOFF bù lệch đồng hồ như bên nghiện.
    'var SKS=null,SKM=1,SOFF=0,SKBUSY=false;',
    'function skSync(){api("/api/stock/state").then(function(j){SKS=j;SOFF=j.now-Date.now();setBal(j.balance);skRender()}).catch(function(e){toast("❌ "+e.message)})}',
    'function skMode(m){SKM=m;$("skModeM").classList.toggle("on",m===1);$("skModeS").classList.toggle("on",m===0);',
    '$("skInp").placeholder=m?"Số Dogcoin muốn xuống":"Số CP muốn mua";$("skInp").value="";skPrev()}',
    'function skPct(p){if(!SKS)return;var v=Math.floor(SKS.balance*p/100);',
    'if(!SKM)v=Math.floor(v/SKS.ask);$("skInp").value=v>0?v:"";skPrev()}',
    'function skPart(d){if(!SKS||!SKS.pos)return;var n=Math.floor(SKS.pos.shares/d);if(n<1)n=1;skSell(n)}',
    // Xem trước: quy đổi ngay tại giá mua, nói thẳng mức hoà vốn TRƯỚC khi bấm
    'function skPrev(){if(!SKS)return;var raw=parseInt($("skInp").value)||0;',
    'var sh=SKM?Math.floor(raw/SKS.ask):raw;if(sh<0)sh=0;',
    'var cost=sh*SKS.ask;',
    '$("skPvS").textContent=sh+" CP";$("skPvC").textContent=vnd(cost);',
    // hoà vốn = giá mà giá BÁN phủ đúng tiền đã bỏ ra
    'var even=SKS.spreadPct<100?Math.round(SKS.ask/(1-SKS.spreadPct/100)):0;',
    '$("skPvE").textContent=sh>0?vnd(even):"-";',
    'var note="";',
    'if(sh>0&&SKM){var du=raw-cost;if(du>0)note="Dư "+vnd(du)+" không đủ 1 CP nên giữ lại trong ví. ";}',
    'if(sh>0)note+="Giá phải nhích thêm "+(Math.round((even/SKS.price-1)*1000)/10)+"% bạn mới bắt đầu có lãi.";',
    '$("skPvNote").textContent=note;',
    'var b=$("skBuyBtn");b.disabled=SKBUSY||sh<1||cost>SKS.balance||!SKS.open||SKS.blocked;',
    'b.textContent=!SKS.open?"SÀN ĐANG TẠM ĐÓNG":SKS.blocked?"ĐANG NỢ XẤU - KHÔNG MUA ĐƯỢC":sh<1?"XÁC NHẬN MUA":cost>SKS.balance?"KHÔNG ĐỦ DOGCOIN":("XÁC NHẬN MUA "+sh+" CP")}',
    'function skBuy(){if(!SKS||SKBUSY)return;var raw=parseInt($("skInp").value)||0;if(raw<1)return toast("Nhập số đã");',
    'SKBUSY=true;skPrev();var body=SKM?{amount:raw}:{shares:raw};',
    'api("/api/stock/buy",body).then(function(j){SKBUSY=false;SKS=j;setBal(j.balance);$("skInp").value="";',
    'toast("📈 Mua "+j.bought+" CP @ "+vnd(j.fill));skRender()}).catch(function(e){SKBUSY=false;toast("❌ "+e.message);skSync()})}',
    'function skSell(n){if(!SKS||!SKS.pos||SKBUSY)return;SKBUSY=true;',
    'api("/api/stock/sell",{shares:n||0}).then(function(j){SKBUSY=false;SKS=j;setBal(j.balance);',
    'toast((j.pl>=0?"💰 Chốt lãi +":"💥 Cắt lỗ ")+vnd(j.pl)+" ("+j.sold+" CP @ "+vnd(j.fill)+")");',
    'if(j.pl>0)celebrate();skRender()}).catch(function(e){SKBUSY=false;toast("❌ "+e.message);skSync()})}',
    // Đồ thị: đường + vùng tô + điểm cuối nhấn, thêm đường kẻ mốc gốc cho dễ đọc
    'function skChart(){var el=$("skChart");if(!el||!SKS)return;var h=SKS.hist||[];',
    'if(h.length<2){el.innerHTML="";return}',
    'var lo=Math.min.apply(null,h),hi=Math.max.apply(null,h);',
    'if(Math.min(lo,SKS.base)<lo)lo=Math.min(lo,SKS.base);if(Math.max(hi,SKS.base)>hi)hi=Math.max(hi,SKS.base);',
    'var pad=(hi-lo)*0.15||20;lo-=pad;hi+=pad;',
    'var X=function(i){return (i/(h.length-1)*300).toFixed(1)};',
    'var Y=function(v){return (112-(v-lo)/(hi-lo)*104).toFixed(1)};',
    'var up=h[h.length-1]>=h[0],col=up?"#3ddc84":"#ff5d5d";',
    'var d="M"+X(0)+" "+Y(h[0]);for(var i=1;i<h.length;i++)d+=" L"+X(i)+" "+Y(h[i]);',
    'var g="<defs><linearGradient id=\\"skg\\" x1=\\"0\\" y1=\\"0\\" x2=\\"0\\" y2=\\"1\\">";',
    'g+="<stop offset=\\"0\\" stop-color=\\""+col+"\\" stop-opacity=\\".32\\"/>";',
    'g+="<stop offset=\\"1\\" stop-color=\\""+col+"\\" stop-opacity=\\"0\\"/></linearGradient></defs>";',
    'var by=Y(SKS.base);',
    'g+=\'<line x1="0" y1="\'+by+\'" x2="300" y2="\'+by+\'" stroke="#2a2e3b" stroke-width="1" stroke-dasharray="4 4"/>\';',
    'g+=\'<path d="\'+d+\' L300 120 L0 120 Z" fill="url(#skg)"/>\';',
    'g+=\'<path d="\'+d+\'" fill="none" stroke="\'+col+\'" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>\';',
    'g+=\'<circle cx="\'+X(h.length-1)+\'" cy="\'+Y(h[h.length-1])+\'" r="3" fill="\'+col+\'"/>\';',
    'el.innerHTML=g}',
    'function skRender(){if(!SKS)return;',
    '$("skPrice").textContent=vnd(SKS.price);',
    'var pc=Math.round((SKS.price/SKS.base-1)*1000)/10;',
    'var chip=$("skChg");chip.textContent=(pc>=0?"▲ +":"▼ ")+pc+"% so mốc gốc";',
    'chip.className="skchip "+(pc>0?"g":pc<0?"r":"y");',
    '$("skPrice").style.color=pc>0?"var(--green)":pc<0?"var(--red)":"var(--tx)";',
    '$("skBase").textContent=vnd(SKS.base);$("skAsk").textContent=vnd(SKS.ask);',
    '$("skSpr").textContent=SKS.spreadPct;$("skPer").textContent=SKS.maxPer;',
    '$("skLeft").textContent=vnd(Math.max(0,SKS.maxShares-SKS.outstanding));',
    'skChart();',
    'var nw=SKS.news,nb=$("skNews");',
    'if(nw&&Date.now()-nw.t<30*60000){nb.style.display="block";',
    'nb.innerHTML=(nw.pct>=0?"📈 <b style=\\"color:var(--green)\\">TIN TỐT":"📉 <b style=\\"color:var(--red)\\">TIN XẤU")+" "+(nw.pct>0?"+":"")+nw.pct+"%</b> - "+esc(nw.text)+" ("+vnd(nw.from)+" → "+vnd(nw.to)+")"}',
    'else nb.style.display="none";',
    'var p=SKS.pos,pc2=$("skPosCard");',
    'if(p){pc2.style.display="block";',
    'var win=p.pl>=0;',
    '$("skPl").textContent=(win?"+":"")+vnd(p.pl);',
    '$("skPl").style.color=win?"var(--green)":"var(--red)";',
    'pc2.style.borderColor=win?"#2f6b48":"#6b2f2f";',
    'var mins=Math.floor((Date.now()+SOFF-p.openedAt)/60000);',
    'var dur=mins<60?(mins+" phút"):(Math.floor(mins/60)+" giờ "+(mins%60));',
    'var ch=$("skPosChip");ch.textContent=(win?"ĐANG GỒNG LÃI ":"GỒNG LỖ ")+dur;',
    'ch.className="skchip "+(win?"g":"r");',
    '$("skPosLine").innerHTML=p.shares+" CP · vốn <b>"+vnd(p.avg)+"</b> → nay <b>"+vnd(SKS.bid)+"</b> · <b style=\\"color:"+(win?"var(--green)":"var(--red)")+"\\">"+(win?"+":"")+p.plPct+"%</b>";',
    '$("skPosVal").textContent=vnd(p.value);',
    '$("skPeak").textContent=p.peak>0?("+"+vnd(p.peak)):"chưa từng có lãi";',
    '$("skSellBtn").textContent=(win?"CHỐT LÃI - BÁN HẾT ":"CẮT LỖ - BÁN HẾT ")+p.shares+" CP → "+vnd(p.value);',
    '$("skSellBtn").disabled=SKBUSY}',
    'else pc2.style.display="none";',
    'var bd=SKS.board||[];',
    '$("skBoard").innerHTML=bd.length?bd.map(function(b,i){var w=b.pl>=0;',
    'return \'<div class="skrow"><span><b>\'+(i+1)+\'</b> \'+esc(b.name)+\' <span class="muted">\'+b.n+\' ván</span></span><b style="color:\'+(w?"var(--green)":"var(--red)")+\'">\'+(w?"+":"")+vnd(b.pl)+\'</b></div>\'}).join(""):"Chưa có ai chốt ván nào.";',
    'var hd=SKS.holders||[];',
    '$("skHolders").innerHTML=hd.length?hd.map(function(x){',
    'var m=Math.floor((Date.now()+SOFF-x.since)/60000);var d2=m<60?(m+"p"):(Math.floor(m/60)+"g"+(m%60));',
    'return \'<div class="skrow"><span>\'+(x.mine?"<b>":"")+esc(x.name)+(x.mine?"</b>":"")+\' <span class="muted">gồng \'+d2+\'</span></span><b>\'+x.shares+\' CP</b></div>\'}).join(""):"Chưa ai giữ CP.";',
    'var mn=SKS.mine||[];',
    '$("skMine").innerHTML=mn.length?(mn.map(function(c){var w=c.pl>=0;',
    'return \'<div class="skrow"><span>\'+c.shares+\' CP · \'+vnd(c.avg)+\' → \'+vnd(c.price)+\'</span><b style="color:\'+(w?"var(--green)":"var(--red)")+\'">\'+(w?"+":"")+vnd(c.pl)+\'</b></div>\'}).join("")',
    '+\'<div class="skrow" style="border-bottom:0"><span><b>Tổng \'+mn.length+\' ván</b></span><b style="color:\'+(SKS.mineTotal>=0?"var(--green)":"var(--red)")+\'">\'+(SKS.mineTotal>=0?"+":"")+vnd(SKS.mineTotal)+\'</b></div>\'):"Chưa có ván nào.";',
    'var lg=SKS.log||[];',
    '$("skLog").innerHTML=lg.length?lg.map(function(l){var b=l.side==="mua";',
    'return \'<div class="skrow"><span>\'+esc(l.name)+\' <span style="color:\'+(b?"var(--green)":"var(--red)")+\'">\'+l.side+\' \'+l.shares+\' CP</span></span><span class="muted">\'+vnd(l.price)+\'</span></div>\'}).join(""):"Chưa có lệnh nào.";',
    'skPrev()}',
    // đếm ngược tới nhịp giá kế + tự nạp lại đúng lúc giá nhảy
    'setInterval(function(){if(localStorage.getItem("play_page")!=="stock"||!SKS)return;',
    'var left=Math.ceil((SKS.nextTick-(Date.now()+SOFF))/1000);',
    'if(left<0)left=0;$("skNext").textContent=left+"s";',
    'if(left<=0&&!SKBUSY)skSync()},1000);',
    'setInterval(function(){if(TOKEN&&!SKBUSY&&localStorage.getItem("play_page")==="stock")skSync()},15000);',
    // ===== 📅 ĐIỂM DANH + 💉 NGHIỆN =====
    // DOFF = lệch giờ máy người chơi so với server — đồng hồ đếm ngược nghiện chạy
    // theo giờ SERVER, chỉnh đồng hồ máy không ăn gian được.
    'var DST=null,DOFF=0;',
    'function dailySync(){api("/api/daily/state").then(function(j){DST=j;DOFF=j.nghien.now-Date.now();setBal(j.balance);dRender()}).catch(function(e){toast("❌ "+e.message)});debtSync()}',
    // 📒 nợ: chỉ hiện card khi đang nợ; trả xong card tự ẩn
    'function debtSync(){api("/api/debt/state").then(function(j){',
    'var c=$("debtCard");if(!c)return;',
    'if(!(j.total>0)){c.style.display="none";return}',
    'c.style.display="";',
    '$("debtBad").textContent=j.bad?"⚠️ NỢ XẤU (hệ thống đóng dấu)":"";',
    '$("debtInfo").innerHTML="Đang nợ <b>"+j.total.toLocaleString("vi-VN")+"</b> 🐕"+(j.admin>0?" (vay "+j.loan.toLocaleString("vi-VN")+" + admin ghi "+j.admin.toLocaleString("vi-VN")+")":"")+" · lãi kép "+j.ratePct+"%/ngày trên nợ vay";',
    '}).catch(function(){})}',
    'function debtPay(){var b=$("debtPayBtn");if(b.disabled)return;b.disabled=true;',
    'var v=parseInt($("debtAmt").value)||0;',
    'api("/api/debt/pay",{amount:v}).then(function(j){setBal(j.balance);$("debtAmt").value="";',
    'toast(j.debt.total>0?("💳 Đã trả "+j.paid.toLocaleString("vi-VN")+" - còn nợ "+j.debt.total.toLocaleString("vi-VN")):"✅ Đã trả "+j.paid.toLocaleString("vi-VN")+" - SẠCH NỢ!");',
    'debtSync();b.disabled=false',
    '}).catch(function(e){toast("❌ "+e.message);b.disabled=false})}',
    'function dRender(){if(!DST)return;',
    '$("dMonth").textContent="Tháng "+DST.month+" · "+DST.year;',
    '$("dStreak").textContent=DST.streak+" ngày";',
    '$("dAmt").textContent="+"+DST.amount.toLocaleString("vi-VN");',
    // Ô thưởng chuỗi: mỗi lần bấm nhận 1 gói. Có gói thì SÁNG LÊN + ghi rõ còn mấy lần.
    'var pk=DST.streakPacks||0;',
    '$("dStreakT").textContent=pk>0?("🎁 BẤM NHẬN +"+DST.streakBonus.toLocaleString("vi-VN")):("🔥 Đủ chuỗi "+DST.streakEvery);',
    '$("dBonus").textContent=pk>0?("còn "+pk+" lần bấm"):((DST.streakTotal||0)+" lần");',
    '$("dStreakChip").classList.toggle("on",pk>0);',
    '$("dStreakChip").title=pk>0?("Bấm 1 lần nhận "+DST.streakBonus.toLocaleString("vi-VN")+" - đang có "+pk+" gói"):("Điểm danh "+DST.streakEvery+" ngày liên tiếp để có 1 gói "+DST.streakBonus.toLocaleString("vi-VN"));',
    'var done={};DST.days.forEach(function(d){done[d]=1});',
    'var first=new Date(DST.year,DST.month-1,1).getDay();', // 0 = Chủ nhật
    'var html=["CN","T2","T3","T4","T5","T6","T7"].map(function(w){return \'<div class="dw">\'+w+"</div>"}).join("");',
    'for(var i=0;i<first;i++)html+="<div></div>";',
    'for(var d=1;d<=DST.daysInMonth;d++){var cls="dcell";if(done[d])cls+=" done";if(d===DST.today)cls+=" today";',
    'html+=\'<div class="\'+cls+\'">\'+d+(done[d]?"<small>CHUỖI</small>":"")+"</div>"}',
    '$("dcal").innerHTML=html;',
    '$("dCount").textContent=DST.days.length+"/"+DST.daysInMonth+" ngày";',
    '$("dBonusNote").textContent="chuỗi "+DST.streak+" ngày · cứ "+DST.streakEvery+" ngày liên tiếp = +"+DST.streakBonus.toLocaleString("vi-VN")+" 🔥";',
    '$("dprogIn").style.width=Math.round(DST.days.length*100/DST.daysInMonth)+"%";',
    'var b=$("dClaim");b.disabled=DST.checkedToday;',
    'b.textContent=DST.checkedToday?"✅ HÔM NAY ĐIỂM DANH RỒI - MAI QUAY LẠI":"✨ ĐIỂM DANH NGAY (+"+DST.amount.toLocaleString("vi-VN")+")";',
    '$("ngInfo").textContent="+"+DST.nghien.amount.toLocaleString("vi-VN")+" / tiếng";',
    'ngTick()}',
    'function dailyClaim(){var b=$("dClaim");if(b.disabled)return;b.disabled=true;',
    'api("/api/daily/claim",{}).then(function(j){setBal(j.balance);DST=j.state;DOFF=j.state.nghien.now-Date.now();dRender();',
    'toast("🎁 +"+j.amount.toLocaleString("vi-VN")+" Dogcoin"+(j.debtCut?" (−"+j.debtCut.toLocaleString("vi-VN")+" trả nợ)":"")+(j.streakEarned?" · 🔥 ĐỦ CHUỖI! Bấm ô 🔥 nhận "+j.state.streakBonus.toLocaleString("vi-VN"):""));',
    'if(j.debtCut)debtSync();',
    'if(j.streakEarned)celebrate()}).catch(function(e){toast("❌ "+e.message);dailySync()})}',
    // bấm ô 🎁 để nhận thưởng chuỗi — MỖI LẦN BẤM 1 gói, còn gói thì ô vẫn sáng
    'function streakClaim(){if(!DST||!(DST.streakPacks>0))return;',
    'var c=$("dStreakChip");c.classList.remove("on");',   // tắt tạm, chặn bấm 2 lần khi đang gửi
    'api("/api/daily/streak",{}).then(function(j){setBal(j.balance);DST=j.state;dRender();',
    'toast("🎁 +"+j.amount.toLocaleString("vi-VN")+" Dogcoin thưởng chuỗi!"+(j.debtCut?" (−"+j.debtCut.toLocaleString("vi-VN")+" trả nợ)":"")+(j.left>0?" Còn "+j.left+" lần bấm nữa.":" Hết gói - điểm danh tiếp nhé!"));',
    'if(j.debtCut)debtSync();',
    'celebrate()}).catch(function(e){toast("❌ "+e.message);dailySync()})}',
    'function nghienClaim(){var b=$("ngBtn");if(b.disabled)return;b.disabled=true;',
    'api("/api/daily/nghien",{}).then(function(j){setBal(j.balance);',
    'if(DST){DST.nghien.nextAt=j.nextAt;DOFF=j.now-Date.now()}',
    'toast("💉 +"+j.amount.toLocaleString("vi-VN")+" Dogcoin"+(j.debtCut?" (−"+j.debtCut.toLocaleString("vi-VN")+" trả nợ)":"")+" - hẹn 1 tiếng nữa!");',
    'if(j.debtCut)debtSync();ngTick()',
    '}).catch(function(e){toast("❌ "+e.message);dailySync()})}',
    'function ngTick(){var b=$("ngBtn");if(!b||!DST)return;',
    'var left=DST.nghien.nextAt-(Date.now()+DOFF);',
    'if(left<=0){b.disabled=false;b.textContent="💉 LỤM "+DST.nghien.amount.toLocaleString("vi-VN")+" NGAY";return}',
    'b.disabled=true;var mm=Math.floor(left/60000),ss=Math.floor(left%60000/1000);',
    'b.textContent="⏳ CÒN "+(mm<10?"0":"")+mm+":"+(ss<10?"0":"")+ss+" NỮA MỚI LỤM ĐƯỢC"}',
    'setInterval(ngTick,1000);',
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
