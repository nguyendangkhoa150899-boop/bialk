// ===== CỔNG WEB CƯỢC CHO NGƯỜI CHƠI (Big Small) =====
// Chạy CỔNG RIÊNG (mặc định 3002), tách hẳn panel admin (150899).
// Đăng nhập: Discord ID + mã PIN (bot phát PIN qua nút 🌐 trên bảng Big Small).
// TOÀN BỘ thao tác Big Small ở đây: đặt cược + NẶN XÍ NGẦU (kéo tờ giấy che 3 viên).
// 15 giây cuối ván khóa sổ, xí ngầu lắc ngầm - ai kéo giấy người đó thấy riêng,
// hết giờ tự mở + trả tiền. Cược đi thẳng vào txState của bot nên bảng Discord
// vẫn hiển thị như thường, không dính deadline 3 giây / rate limit của Discord.
const http = require('http');
const crypto = require('crypto');

// Toàn bộ ảnh + âm thanh gom ở assets.js (tự quét thư mục assets/) - thêm file mới
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
    // gửi body quá cỡ sẽ treo Promise vĩnh viễn - mỗi lần như vậy rò một request + closure,
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

            // (Blackjack đã hủy 18/08 - /blackjack không còn; tab thay bằng 🎡 Vòng Quay.)

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
                        // Chỉ đưa xí ngầu ra trong cửa sổ nặn - lúc này sổ ĐÃ khóa,
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
                // Toàn bộ luật + tiền nằm ở index.js (ctx.daily) - dùng chung với
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

                // ===== 🎁 QUAY PAL kiểu CSGO + RƯƠNG/HỒ SƠ (logic + tiền ở index.js) =====
                if (ctx.palwheel && path === '/api/palwheel/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.palwheel.state(userId) });
                }
                if (ctx.palwheel && req.method === 'POST' && path === '/api/palwheel/spin') {
                    const r = ctx.palwheel.spin(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🍀 quay vòng RAID (tốn 1 vé đầy thanh may mắn) — 27/08
                if (ctx.palwheel && ctx.palwheel.raidSpin && req.method === 'POST' && path === '/api/palwheel/raidspin') {
                    const r = ctx.palwheel.raidSpin(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🎯 chọn pal đích danh (25/08, thay shop Discord)
                if (ctx.palwheel && ctx.palwheel.pickState && path === '/api/palpick/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.palwheel.pickState(userId) });
                }
                if (ctx.palwheel && ctx.palwheel.pick && req.method === 'POST' && path === '/api/palpick/buy') {
                    const body = await readBody(req);
                    const r = ctx.palwheel.pick(userId, body.code);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.profile && path === '/api/profile') {
                    return sendJSON(res, 200, { ok: true, ...ctx.profile.state(userId) });
                }
                if (ctx.profile && req.method === 'POST' && path === '/api/pal/sell') {
                    const body = await readBody(req);
                    const r = ctx.profile.sell(userId, body.id);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // Nhận pal vào game: kiểm online qua mod nên CHẬM (vài giây tới ~90s khi
                // dashboard/mod kẹt) - client phải khóa nút trong lúc chờ.
                if (ctx.profile && req.method === 'POST' && path === '/api/pal/claim') {
                    const body = await readBody(req);
                    // 💎 26/08: kèm mức nâng cấp người chơi mua (soulPct/iv) - server tự tính phí
                    const r = await ctx.profile.claim(userId, body.id, body.souls, body.passives, {
                        soulHpPct: body.soulHpPct, soulAtkPct: body.soulAtkPct, soulDefPct: body.soulDefPct, soulWorkPct: body.soulWorkPct,
                        ivHp: body.ivHp, ivAtk: body.ivAtk, ivDef: body.ivDef,
                        gender: body.gender,   // 🚻 27/08: bắt buộc chọn 1=Đực / 2=Cái
                    });
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // ⭐ build passive riêng: lưu / xoá (danh sách trả về trong cùng phản hồi)
                if (ctx.profile && ctx.profile.saveBuild && req.method === 'POST' && path === '/api/pal/build/save') {
                    const body = await readBody(req);
                    const r = ctx.profile.saveBuild(userId, body.name, body.ids);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.profile && ctx.profile.delBuild && req.method === 'POST' && path === '/api/pal/build/del') {
                    const body = await readBody(req);
                    const r = ctx.profile.delBuild(userId, body.name);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }

                // ===== 📈 SÀN CỔ PHIẾU DOG (logic + tiền ở index.js - ctx.stock) =====
                // Mua nhận theo TIỀN (amount) hoặc theo KHỐI LƯỢNG (shares) - người chơi chọn.
                if (ctx.stock && path === '/api/stock/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.stock.state(userId) });
                }
                // CẢ KHO NẾN 2 ngày (26/08) cho khung to + kéo lùi. Route riêng vì nhét
                // vào state là mỗi người ngốn ~160KB MỖI 2 GIÂY — client cache 60s là đủ
                if (ctx.stock && ctx.stock.hist && path === '/api/stock/hist') {
                    return sendJSON(res, 200, { ok: true, candles: ctx.stock.hist() });
                }
                // MỞ lệnh: side='long' ăn khi giá LÊN, side='short' ăn khi giá XUỐNG.
                // Khối lượng gửi theo lot (0.1/0.5/1...) hoặc theo số Dogcoin muốn xuống.
                if (ctx.stock && req.method === 'POST' && path === '/api/stock/open') {
                    const body = await readBody(req);
                    const side = body.side === 'short' ? 'short' : 'long';
                    const lot = Number(body.lot);
                    const shares = Number.isFinite(lot) && lot > 0
                        ? Math.round(lot * (ctx.stock.lotSize || 10))
                        : Math.floor(Number(body.shares) || 0);
                    const r = ctx.stock.open(userId, side, Math.floor(Number(body.amount) || 0), shares, Math.floor(Number(body.lev) || 1));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, bought: r.shares, fill: r.price, cost: r.cost, opened: r.side, ...r.state });
                }
                // ĐÓNG lệnh (một phần hoặc tất cả) - chiều nào cũng dùng route này
                if (ctx.stock && req.method === 'POST' && path === '/api/stock/close') {
                    const body = await readBody(req);
                    const r = ctx.stock.close(userId, Math.floor(Number(body.shares) || 0));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, sold: r.shares, fill: r.price, proceeds: r.proceeds, pl: r.pl, ...r.state });
                }
                // 🤖 mốc tự đóng lệnh (25/08): low/high = 0 hoặc bỏ trống là xoá mốc đó
                if (ctx.stock && ctx.stock.auto && req.method === 'POST' && path === '/api/stock/auto') {
                    const body = await readBody(req);
                    const r = ctx.stock.auto(userId, Number(body.low) || 0, Number(body.high) || 0);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
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

                // ===== 🎡 VÒNG QUAY MAY MẮN NHÓM (logic + tiền ở index.js - ctx.wheel) =====
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
                // nút QUAY VÒNG VÉ (vòng 1) - đủ người mới sáng, chốt giá vé chung cả bàn
                if (ctx.wheel && ctx.wheel.spin1 && req.method === 'POST' && path === '/api/wheel/spin1') {
                    const r = ctx.wheel.spin1(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r.state });
                }
                // nút QUAY VÒNG HỆ SỐ (vòng 2) - chỉ sáng sau khi vé đã chốt (stake)
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
                // KHÔNG nhận số tiền thắng do client gửi lên - client sửa được.
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

    // (Khối Blackjack qua WebSocket đã XÓA 19/08 cùng toàn bộ trò - xem git history
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
    // (div mặc định là block - rơi vào ngữ cảnh inline là mỗi viên một dòng)
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
    // Header + nav ép mỏng (19/08): mobile đỡ phải kéo - trước đây riêng cụm đầu
    // trang đã ngốn ~150px dọc.
    '#topbar{padding:8px 12px;margin-bottom:8px}',
    '#topbar .big{font-size:20px}',
    '#topbar .muted{font-size:11px}',
    '#topbar button{padding:8px 10px}',
    '#nav{display:flex;gap:6px;margin-bottom:8px}',
    '#nav button{flex:1;background:var(--card);border:1px solid var(--line);color:var(--muted);font-size:13px;padding:9px 2px}',
    '#nav button.on{background:linear-gradient(180deg,#2b3346,#222839);color:var(--tx);border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c55}',
    // tầng 1: 2 nút nhóm to rõ; nhóm đang chọn viền vàng
    '#navGrp{display:flex;gap:6px;margin-bottom:6px}',
    '#navGrp button{flex:1;background:#1a1f2d;border:1px solid var(--line);color:var(--muted);font-size:14px;font-weight:800;padding:11px 2px;letter-spacing:.5px}',
    '#navGrp button.on{background:linear-gradient(180deg,#33405c,#252c40);color:var(--tx);border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c55}',
    // 🎁 Quay Pal: reel kiểu CSGO (dải thẻ chạy ngang, vạch giữa là kim)
    '#pwWrap{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#141824;height:126px;margin-top:10px}',
    '#pwMark{position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--gold);z-index:2;box-shadow:0 0 8px #ffcf5c}',
    '#pwStrip{display:flex;gap:6px;position:absolute;left:0;top:8px;will-change:transform}',
    // 27/08: thẻ có HÌNH pal (icon 60px) + tên dưới. Con thiếu hình thì onerror ẩn <img>, chừa tên.
    '.pwCard{flex:0 0 110px;height:110px;border:1px solid var(--line);border-radius:8px;background:linear-gradient(180deg,#232839,#1b2030);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px;text-align:center;overflow:hidden}',
    '.pwCard img{width:62px;height:62px;object-fit:contain;image-rendering:auto;margin-bottom:2px;filter:drop-shadow(0 2px 3px #0007)}',
    '.pwCard .nm{font-size:12px;font-weight:700;line-height:1.1;word-break:break-word}',
    '.pwCard .dx{font-size:10px;color:var(--muted);margin-top:2px}',
    '.pwCard.raid{border-color:#ff6b6b;background:linear-gradient(180deg,#3a2330,#241a22)}',
    '.pwCard.raid .nm{color:#ff8f8f}',
    // 🔥 thẻ raid ở ô trúng: viền lửa nhấp nháy + hào quang (chỉ gắn vào thẻ kết quả)
    '.pwCard.raidhit{border-color:#ffcf5c;box-shadow:0 0 14px #ff8f3c,0 0 4px #ffcf5c inset;animation:raidGlow .7s ease-in-out infinite alternate}',
    '@keyframes raidGlow{from{box-shadow:0 0 8px #ff6b3c,0 0 3px #ffcf5c inset}to{box-shadow:0 0 22px #ffb03c,0 0 8px #ff8f5c inset}}',
    '#pwRes{margin-top:10px;border:1px solid var(--gold);border-radius:10px;padding:10px;text-align:center;background:#1d2130}',
    '#pwRes.raidwin{border-color:#ff8f3c;background:linear-gradient(180deg,#2a1c1a,#1d1518);box-shadow:0 0 18px #ff6b3c55}',
    // 🍀 THANH MAY MẮN (27/08)
    '#pwLuckWrap{margin-top:12px;background:#141824;border:1px solid var(--line);border-radius:10px;padding:10px}',
    '#pwLuckHead{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;margin-bottom:6px}',
    '#pwLuckBar{position:relative;height:16px;border-radius:9px;background:#0e1220;border:1px solid var(--line);overflow:hidden}',
    '#pwLuckFill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:9px;background:linear-gradient(90deg,#3fe0a0,#7cff5c,#ffe45c);transition:width .5s ease}',
    '#pwLuckPct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;text-shadow:0 0 2px #000,0 0 4px #000,0 1px 2px #000;letter-spacing:.3px}',
    '#pwLuckNote{font-size:11px;color:var(--muted);margin-top:5px}',
    // 🔥 VÒNG QUAY RAID (hiện khi có vé) — reel giống trên nhưng đỏ lửa
    '#pwRaidBox{margin-top:12px;border:1px solid #ff6b6b;border-radius:12px;padding:12px;background:linear-gradient(180deg,#241820,#191114);box-shadow:0 0 18px #ff5b3c33}',
    '#pwRaidBox.hidden{display:none}',
    '#pwRaidWrap{position:relative;overflow:hidden;border:1px solid #7a3540;border-radius:10px;background:#160f13;height:126px;margin-top:8px}',
    '#pwRaidMark{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#ffcf5c;z-index:2;box-shadow:0 0 8px #ff8f3c}',
    '#pwRaidStrip{display:flex;gap:6px;position:absolute;left:0;top:8px;will-change:transform}',
    '#pwRaidRes{margin-top:10px;border:1px solid #ff8f3c;border-radius:10px;padding:10px;text-align:center;background:#231619}',
    // 🎒 Rương pal + hộp nhận
    // 27/08: thẻ Rương gọn — trên: hình pal + tên/tag/giờ · dưới: nút Bán/Nhận full ngang
    '.pcItem{border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:8px;background:#141824}',
    '.pcItem.raid{border-color:#ff6b6b;background:linear-gradient(180deg,#241820,#191114)}',
    '.pcItem .pcTop{display:flex;align-items:center;gap:10px}',
    '.pcItem .pcTop img{width:54px;height:54px;flex:0 0 54px;object-fit:contain;background:#1b2030;border:1px solid var(--line);border-radius:9px;padding:3px}',
    '.pcItem.raid .pcTop img{border-color:#ff8f5c;box-shadow:0 0 8px #ff6b3c55}',
    '.pcItem .pcMeta{min-width:0;flex:1}',
    '.pcItem .nm{font-weight:800;font-size:15px}',
    '.pcItem.raid .nm{color:#ff9f5c}',
    '.pcItem .tag{font-size:10px;border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--muted);vertical-align:middle}',
    '.pcItem .tag.raid{color:#ff8f8f;border-color:#ff6b6b}',
    '.pcItem .tag.wait{color:#ffd27a;border-color:#ffcf5c}',
    '.pcItem .tm{font-size:11px;color:var(--muted);margin-top:2px}',
    '.pcActs{display:flex;gap:8px;margin-top:10px}',
    '.pcActs button{flex:1;padding:10px;font-size:13px;font-weight:700}',
    '.pcActs .tag{flex:1;text-align:center;padding:9px;font-size:12px;border-radius:8px}',
    '#pcModal{position:fixed;inset:0;background:#000a;z-index:50;display:flex;align-items:center;justify-content:center;padding:12px}',
    '#pcModal.hidden{display:none}',
    '#pcBox{background:var(--card);border:1px solid var(--gold);border-radius:12px;padding:14px;max-width:460px;width:100%;max-height:92vh;overflow-y:auto}',
    // máy tính (>=920px): hộp nhận nở rộng 2 cột - trái linh hồn+IV, phải passive cao hơn
    '@media(min-width:920px){',
    '#pcBox{max-width:940px;padding:18px 20px}',
    '#pcmGenderWrap{margin:10px 0 2px}',
    '.pcmGbtn{flex:1;border-radius:8px;padding:11px;font-weight:800;font-size:15px;cursor:pointer;transition:all .12s}',
    // luôn có màu rõ: Đực xanh dương, Cái hồng (dễ nhìn ngay cả khi chưa chọn)
    '.pcmGbtn.male{border:2px solid #4f9dff;background:#17253c;color:#9fcaff}',
    '.pcmGbtn.female{border:2px solid #ff7ab6;background:#351826;color:#ffb2d6}',
    // đang chọn: tô nền đặc + chữ trắng + viền sáng
    '.pcmGbtn.male.on{background:#2f7dff;color:#fff;box-shadow:0 0 0 3px rgba(79,157,255,.35)}',
    '.pcmGbtn.female.on{background:#ff5fa8;color:#fff;box-shadow:0 0 0 3px rgba(255,122,182,.35)}',
    // hover: nhấc nhẹ + sáng thêm (cả lúc chưa chọn lẫn đang chọn)',
    '.pcmGbtn:hover{transform:translateY(-1px)}',
    '.pcmGbtn.male:hover{background:#213a63;color:#c9e0ff;border-color:#7ab6ff}',
    '.pcmGbtn.female:hover{background:#4a2236;color:#ffd0e7;border-color:#ff9ccb}',
    '.pcmGbtn.male.on:hover{background:#4a8dff}',
    '.pcmGbtn.female.on:hover{background:#ff74b6}',
    // chip passive đã chọn (luôn thấy dù cuộn list) — bấm ✕ để bỏ
    '#pcmChips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 7px;min-height:22px}',
    '.pchip{display:inline-flex;align-items:center;gap:6px;background:#1b1f2c;border:1px solid var(--line);border-radius:13px;padding:3px 6px 3px 10px;font-size:12px}',
    '.pchip .x{cursor:pointer;background:#3a4155;color:#fff;border-radius:50%;width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;line-height:1}',
    '.pchip .x:hover{background:var(--red)}',
    '#pcmCols{display:flex;gap:20px;align-items:flex-start}',
    '#pcmColL{flex:1;min-width:0}',
    '#pcmColR{flex:1.15;min-width:0}',
    '#pcmColR>div:first-child{margin-top:10px}',
    '#pcmPass{max-height:380px}',
    '}',
    '#pcmSummary{border:1px solid var(--line);border-radius:10px;background:#141824;padding:10px 12px;margin-top:10px}',
    '#pcmSummary .sline{display:flex;justify-content:space-between;gap:10px;padding:2px 0}',
    '#pcmSummary .sline .muted{flex:1}',
    '.pcmSoul{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;margin-top:5px;cursor:pointer;font-size:13px}',
    '.pcmSoul input{width:16px;height:16px}',
    // danh sách passive: cuộn dọc, mỗi dòng tên MÀU THEO BẬC + chú thích kế bên, bấm để chọn
    '#pcmPass{max-height:240px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;background:#141824}',
    '.pcmP{padding:7px 10px;border-bottom:1px solid #1e2434;cursor:pointer;font-size:13px;line-height:1.35}',
    '.pcmP:last-child{border-bottom:0}',
    '.pcmP .pd{color:var(--muted);font-size:11px}',
    '.pcmP.sel{background:#233049;box-shadow:inset 3px 0 0 var(--gold)}',
    // checkbox trong dòng passive: chỉ hiển thị cho dễ bấm/dễ thấy, click do cả dòng xử lý
    '.ppcb{pointer-events:none;width:15px;height:15px;margin-right:7px;vertical-align:middle;accent-color:#ffcf5c}',
    // 🌈 tên passive Cây Thế Giới màu cầu vồng
    '.pwt{background:linear-gradient(90deg,#ff6b6b,#ffd76a,#7fd98a,#3fe0cf,#8ab6ff,#c69cff);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}',
    // nút build: đang chọn sáng viền vàng; build riêng viền xanh ngọc; ✕ đỏ; ➕ nét đứt
    '.pcb{padding:5px 9px;font-size:11px;background:#232b3f;border:1px solid var(--line)}',
    '.pcb.on{border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c66;background:#2f3854;color:#ffe9b0}',
    '.pcb.my{border-color:#3fe0cf66}',
    '.pcb.x{padding:5px 7px;color:#ff7a7a;margin-left:-3px}',
    '.pcb.add{border-style:dashed;color:var(--muted)}',
    // 🏆 số hũ cạnh tên game: chữ vàng, viền vàng mờ cho nổi
    '.hdrpot{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:8px;font-size:13px;font-weight:bold;color:var(--gold);background:#3a2f0e;border:1px solid #ffcf5c55;vertical-align:middle}',
    '.hdrpot:empty{display:none}',
    // ---- dò mìn (bố cục theo sòng: thanh hệ số trên, 2 cột đếm kẹp lưới) ----
    // icon Dog Coin thật (ảnh trong game) - thay cho emoji 🐕 ở mọi chỗ
    '.dc{width:1.05em;height:1.05em;vertical-align:-.16em;object-fit:contain;display:inline-block}',
    '.dc.big{width:1.5em;height:1.5em;vertical-align:-.3em}',
    '#mineCard{background:linear-gradient(180deg,#1b2440,#141a2e);border:1px solid #2b3557}',
    // thanh mốc hệ số cuộn ngang: mốc đã ăn sáng vàng, mốc kế tiếp nhấp nháy xanh
    // Thanh hệ số PHÂN TRANG 7 ô/trang (bỏ scroll 19/08 - scroll tự động cứ giành
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
    // 🍀 ô cỏ 4 lá (vừa mở trúng / lộ ra cuối ván) - XANH LÁ, khác hẳn ô khiên xanh dương
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
    // 🌟 ô vàng leo thang (đạp là lên thẳng đỉnh) - nhấp nháy cho ai cũng thấy
    '.scell.gold{background:linear-gradient(180deg,#ffe9a8,#d8a90f);border-color:#ffd977;animation:baoPulse 1.6s ease-in-out infinite;font-size:18px}',
    '.scell img.dc{width:20px;height:20px}',
    // nhân vật đứng trên bậc vừa leo tới
    // Neo THẤP (bottom âm) + cao 34px: đầu nhân vật nằm gọn trong ô đang đứng,
    // không thò lên đè ô tầng trên (tầng đang cần bấm) - tràn xuống dưới thì chỉ
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
    // Nhân vật đứng dưới chân tháp lúc CHƯA vào ván: ĐÃ TẮT 19/08 theo yêu cầu -
    // chiếm 50px dọc trên mobile mà không có thông tin gì; vào ván thì nhân vật
    // vẫn hiện trên tháp như thường (HEROIMG trong ô).
    '#heroBase{display:none}',
    // ---- sân khấu xí ngầu + tờ giấy ----
    '#stage{position:relative;height:150px;border-radius:12px;background:radial-gradient(ellipse at center,#1e3d2b 0%,#152a1e 100%);border:1px solid #2b4a37;overflow:hidden;margin-top:10px;touch-action:none}',
    '#diceRow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:14px}',
    '.die{width:56px;height:56px;background:#f4f1e8;border-radius:12px;position:relative;box-shadow:0 3px 8px #0008}',
    // chấm xí ngầu ĐỎ toàn bộ (yêu cầu chủ sòng) - thuần CSS, không cần hình
    '.pip{position:absolute;width:11px;height:11px;border-radius:50%;background:#c0392b;transform:translate(-50%,-50%)}',
    '#sumBadge{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);background:#000a;border-radius:8px;padding:3px 12px;font-weight:800;font-size:15px}',
    '#paper{position:absolute;inset:-4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-weight:800;box-shadow:0 6px 18px #000a;user-select:none;border-bottom:3px dashed}',
    '#paper .hint{font-size:16px}#paper .sub{font-size:12px;font-weight:600;opacity:.8;text-align:center;padding:0 14px}',
    // đỏ = CHƯA cho mở (đang giờ đặt cược) - xanh lá = mở được (giờ nặn)
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
    // chế độ VÒNG VÉ (vòng 1): chỉ 1 mũi tên - giấu mũi xanh dương + xanh lá
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
    // Dựng theo app giao dịch thật: thanh 3 ô số dư/lãi lỗ trên cùng, tab khung
    // thời gian dạng viên, nến có trục giá bên phải, ô đặt lệnh 2 input liên động.
    '#skTop{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:12px}',
    '#skTop>div{background:var(--card);padding:11px 6px;text-align:center}',
    '#skTop .v{font-size:19px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
    '#skTop .t{font-size:10px;color:var(--muted);letter-spacing:.06em;margin-top:2px}',
    '#skHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}',
    '#skPrice{font-size:32px;font-weight:800;letter-spacing:-.02em;line-height:1.05;font-variant-numeric:tabular-nums}',
    '#skOhlc{display:grid;grid-template-columns:auto auto;gap:1px 10px;font-size:11px;color:var(--muted);text-align:right}',
    '#skOhlc b{color:var(--tx);font-variant-numeric:tabular-nums;font-weight:600}',
    '#skTf{display:flex;gap:4px;margin-top:10px;overflow-x:auto;-webkit-overflow-scrolling:touch}',
    '#skTf button{flex:0 0 auto;padding:6px 13px;border-radius:9px;font-size:12.5px;font-weight:700;background:transparent;border:1px solid transparent;color:var(--muted)}',
    '#skTf button.on{background:#2a2e3b;color:var(--tx)}',
    '#skTf button.ma.on{background:#2a2110;color:var(--gold)}',
    '#skWrap{position:relative;margin-top:8px;padding-right:52px;touch-action:pan-y;user-select:none;cursor:grab}',
    '#skChart{width:100%;height:190px;display:block}',
    '#skAxis{position:absolute;top:0;right:0;bottom:0;width:52px;pointer-events:none;font-size:9.5px;font-variant-numeric:tabular-nums;color:var(--muted)}',
    '#skAxis div{position:absolute;right:0;transform:translateY(-50%);white-space:nowrap}',
    '#skAxis div.now{color:#05240f;background:var(--green);border-radius:3px;padding:1px 5px;font-weight:800}',
    '#skAxis div.now.dn{background:var(--red);color:#2a0606}',
    '#skAxis div.avg{color:var(--gold)}',
    '#skPcts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px;text-align:center}',
    '#skPcts div{background:#12141a;border:1px solid var(--line);border-radius:9px;padding:6px 2px}',
    '#skPcts .t{font-size:10.5px;color:var(--muted)}',
    '#skPcts .v{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:1px}',
    '.skchip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em}',
    '.skchip.g{background:#12351f;color:var(--green)}.skchip.r{background:#3a1414;color:var(--red)}',
    '.skchip.y{background:#2a2110;color:var(--gold)}',
    '.skpl{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}',
    '.skkv{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}',
    '.skn{font-variant-numeric:tabular-nums;font-weight:700}',
    '#skPair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}',
    '#skPair label{display:block;font-size:10.5px;color:var(--muted);letter-spacing:.05em;margin-bottom:3px}',
    '#skPair input{margin-top:0;text-align:center;font-weight:700}',
    '#skQuick{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:7px}',
    '#skLevRow{display:flex;gap:6px;margin-top:8px;align-items:stretch}',
    '#skLevRow input{margin-top:0;flex:0 0 74px;text-align:center;font-weight:800}',
    '#skLevQ{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex:1}',
    '#skLevQ button{border-radius:8px;font-size:12.5px;font-weight:800;background:#12141a;border:1px solid var(--line);color:var(--muted);padding:0}',
    '#skLevQ button.on{background:#2a2110;border-color:var(--gold);color:var(--gold)}',
    '#skLock{background:#241d0e;border:1px solid #4a3a18;border-radius:10px;padding:8px;margin-top:7px;font-size:12px;text-align:center}',
    '#skQuick button{padding:9px 0;border-radius:8px;font-size:12px;font-weight:800;background:#12141a;border:1px solid var(--line);color:var(--muted)}',
    '#skGo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}',
    '#skGo button{padding:15px 4px;border-radius:12px;font-size:13px;font-weight:800;line-height:1.3;border:0}',
    '#skBuyBtn{background:linear-gradient(180deg,#48e090,#25a663);color:#05240f}',
    '#skSellOpenBtn{background:linear-gradient(180deg,#ff8a8a,#e04a4a);color:#2a0606}',
    '#skGo button:disabled{background:#2a2e3b;color:var(--muted)}',
    '#skSellBtn{background:linear-gradient(180deg,#ffd977,#e0a63f);color:#3d2c05}',
    '#skPart{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:7px}',
    '#skPart button{padding:9px 0;border-radius:9px;font-size:12px;font-weight:700;background:#232735;border:0;color:var(--tx)}',
    '.skrow{display:flex;justify-content:space-between;padding:5px 0;font-size:12.5px;border-bottom:1px solid var(--line)}',
    '.skrow:last-child{border-bottom:0}',
    '.skside{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:800;margin-right:5px}',
    '.skside.l{background:#12351f;color:var(--green)}.skside.s{background:#3a1414;color:var(--red)}',
    '#skNews{background:#241d0e;border:1px solid #4a3a18;border-radius:12px;padding:10px;margin-top:8px;font-size:12.5px}',
    '#skHelpHd{display:flex;justify-content:space-between;align-items:center;cursor:pointer}',
    '#skHelpBody{display:none;margin-top:10px;font-size:13px;line-height:1.65}',
    '#skHelpBody.on{display:block}',
    '#skHelpBody ol{padding-left:20px;margin:0 0 10px}',
    '#skHelpBody li{margin-bottom:6px}',
    '.skex{background:#12141a;border:1px solid var(--line);border-radius:10px;padding:9px;margin-top:6px;font-size:12.5px}',
    '.skex .l{color:var(--green);font-weight:700}.skex .s{color:var(--red);font-weight:700}',
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
    // .dcell chứ KHÔNG phải .dd - .dd là hàng xúc xắc của lịch sử Big Small,
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

    // 25/08: điều hướng 2 TẦNG cho đỡ chồng chéo - tầng 1 chọn NHÓM (Hồ sơ / Mini game),
    // tầng 2 chỉ hiện các trang thuộc nhóm đó. Quay Pal nằm bên nhóm Hồ sơ.
    '<div id="navGrp">',
    '<button id="ngProfile" onclick="grpGo(\'profile\')">👤 HỒ SƠ</button>',
    '<button id="ngGames" class="on" onclick="grpGo(\'games\')">🎮 MINI GAME</button>',
    '</div>',
    '<div id="nav">',
    '<button id="navTx" class="on" onclick="go(\'tx\')">🎲 Big Small</button>',
    '<button id="navMine" onclick="go(\'mine\')">💣 Dò Mìn</button>',
    '<button id="navStair" onclick="go(\'stair\')">🪜 Leo Thang</button>',
    '<button id="navWheel" onclick="go(\'wheel\')">🎡 Vòng Quay</button>',
    '<button id="navStock" onclick="go(\'stock\')">📈 Cổ phiếu</button>',
    '<button id="navDaily" onclick="go(\'daily\')">🪪 Cá nhân</button>',
    '<button id="navPal" onclick="go(\'pal\')">🎁 Quay Pal</button>',
    '<button id="navPick" onclick="go(\'pick\')">🎯 Chọn Pal</button>',
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
    '<div class="box"><div class="lab">Tiền cược</div><input id="mBet" inputmode="numeric" value="400" oninput="mBand()"></div>',
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
    '<div class="box"><div class="lab">Tiền cược</div><input id="sBet" inputmode="numeric" value="400" oninput="sBand()"></div>',
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

    // ================= TRANG 🎡 VÒNG QUAY (thay Blackjack - đã hủy 18/08) =================
    // Bánh xe SVG 27 nan + 3 mũi tên 🟡🔵🟢 gắn quanh vành lệch 120°. Server chốt kết
    // quả trước, client chỉ diễn hoạt hình quay - không gian lận được.
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

    // ================= TRANG 🎁 QUAY PAL (kiểu CSGO, 25/08) =================
    // Server quyết định kết quả TRƯỚC khi client chạy hoạt hình (không gian lận được).
    // Trước mắt reel chạy theo TÊN pal (ảnh bổ sung sau khi gom đủ bộ ảnh).
    // Trúng ô 🔥 PAL RAID thì chạy tiếp reel thứ 2 chia đều các pal raid - như mở rương CSGO.
    '<div id="pagePal" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎁 Quay Pal</h2><div class="muted" id="pwStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pwInfo">Quay TẤT CẢ pal, mọi ô <b>chia đều</b>. Có thể ra thẳng <b>🔥 boss RAID</b> ngay trong vòng này (ô trúng bốc lửa). Mỗi lượt quay còn nạp <b>🍀 thanh may mắn</b> phía dưới - đầy 100% được quay <b>vòng RAID</b> ăn boss + thưởng Dogcoin. Pal trúng nằm trong <b>RƯƠNG</b> ở tab 🪪 Cá nhân.</div>',
    '<div id="pwWrap"><div id="pwMark"></div><div id="pwStrip"></div></div>',
    '<div id="pwRes" class="hidden"></div>',
    '<button class="btn-full" id="pwGo" onclick="pwSpin()">🎁 QUAY</button>',
    '<div class="muted" style="font-size:12px;margin-top:6px;text-align:center" id="pwPot">-</div>',
    // 🍀 THANH MAY MẮN
    '<div id="pwLuckWrap">',
    '<div id="pwLuckHead"><span>🍀 Thanh may mắn</span><span id="pwLuckTix"></span></div>',
    '<div id="pwLuckBar"><div id="pwLuckFill"></div><div id="pwLuckPct">0%</div></div>',
    '<div id="pwLuckNote">Mỗi lượt quay tích thêm may mắn. Đầy 100% được 1 vé quay vòng RAID bên dưới.</div>',
    '</div>',
    '</div>',
    // 🔥 VÒNG QUAY RAID (chỉ hiện khi có vé)
    '<div class="card" id="pwRaidBox">',
    '<div class="row"><h2 style="margin:0">🔥 Vòng quay RAID</h2><div class="muted" id="pwRaidStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pwRaidInfo">-</div>',
    '<div id="pwRaidWrap"><div id="pwRaidMark"></div><div id="pwRaidStrip"></div></div>',
    '<div id="pwRaidRes" class="hidden"></div>',
    '<button class="btn-full" id="pwRaidGo" onclick="pwRaidSpin()">🔥 QUAY RAID (dùng 1 vé)</button>',
    '</div>',
    '</div>', // hết #pagePal

    // ================= TRANG 🎯 CHỌN PAL (25/08, thay nút Pal tùy chọn Discord) =================
    // Chọn ĐÍCH DANH 1 pal thường (không raid) - trả tiền là vào 🎒 RƯƠNG, nhận/bán như quay trúng.
    '<div id="pagePick" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎯 Chọn Pal</h2><div class="muted" id="pkStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pkInfo">Chọn đúng con mình thích. 🔥 4 BOSS RAID (Bellanoir Libero, Blazamut Ryu, Xenolord, Hartalis) bán giá riêng ngay đầu danh sách. Mua xong pal nằm trong 🎒 RƯƠNG ở tab 🪪 Cá nhân - chọn linh hồn + passive rồi nhận vào game.</div>',
    '<input id="pkFind" placeholder="🔎 Tìm pal theo tên hoặc số paldex..." oninput="pkRender()" style="width:100%;margin-top:8px">',
    '<div id="pkList" style="margin-top:6px;max-height:420px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;background:#141824"><div class="muted" style="padding:10px">Đang tải...</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:6px;text-align:center" id="pkPot">-</div>',
    '</div>',
    '</div>', // hết #pagePick

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
    // 🎒 RƯƠNG PAL (25/08): pal quay trúng nằm ở đây - bán lấy Dogcoin hoặc NHẬN vào game
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎒 Rương Pal</h2><div class="muted" id="pcStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pcLink">-</div>',
    '<div id="pcList" style="margin-top:8px"><div class="muted">Đang tải...</div></div>',
    '</div>',
    '</div>', // hết #pageDaily

    // Hộp chọn linh hồn + passive khi NHẬN pal (overlay cố định, dùng chung mọi trang)
    // 26/08: bố cục lại theo góp ý chủ server - máy tính rộng thì chia 2 CỘT (trái:
    // linh hồn + IV, phải: passive), thêm khung 🧾 TỔNG KẾT trước nút nhận.
    '<div id="pcModal" class="hidden">',
    '<div id="pcBox">',
    '<div class="row"><h2 style="margin:0" id="pcmTitle">Nhận pal</h2><button onclick="pcClose()" style="background:#232735;padding:4px 12px">✕</button></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pcmBase">-</div>',
    // 🚻 GIỚI TÍNH (27/08): bắt buộc chọn, không có mặc định — server chặn nếu bỏ trống
    '<div id="pcmGenderWrap">',
    '<div style="font-weight:700">🚻 Giới tính <span style="color:var(--red);font-weight:400;font-size:12px">* bắt buộc chọn</span></div>',
    '<div class="row" style="gap:8px;margin-top:5px">',
    '<button type="button" id="pcmGM" class="pcmGbtn male" onclick="pcGenderPick(1)">♂ Đực</button>',
    '<button type="button" id="pcmGF" class="pcmGbtn female" onclick="pcGenderPick(2)">♀ Cái</button>',
    '</div></div>',
    '<div id="pcmCols">',
    '<div id="pcmColL">',
    '<div style="font-weight:700;margin:10px 0 4px">💠 Linh hồn <span class="muted" style="font-weight:400">(ít nhất 1, tối đa <span id="pcmSoulMax">4</span> dòng · dòng đầu MIỄN PHÍ · tick rồi kéo % riêng từng dòng)</span></div>',
    '<div id="pcmSouls"></div>',
    '<div class="muted" style="font-size:11px;margin-top:3px" id="pcmLineCost"></div>',
    '<div style="font-weight:700;margin:12px 0 2px">🧬 IV <span class="muted" style="font-weight:400">(gốc <span id="pcmIvBase">100</span> miễn phí, kéo thêm tính phí từng điểm)</span></div>',
    '<div class="row" style="margin-top:4px;gap:10px;align-items:flex-start">',
    '<div style="flex:1"><div style="font-weight:700;font-size:13px">❤️ Máu: <span id="pcmIvHShow">100</span></div>',
    '<input id="pcmIvH" type="range" min="100" max="255" step="1" value="100" oninput="pcUpCalc()" style="width:100%"></div>',
    '<div style="flex:1"><div style="font-weight:700;font-size:13px">⚔️ Công: <span id="pcmIvAShow">100</span></div>',
    '<input id="pcmIvA" type="range" min="100" max="255" step="1" value="100" oninput="pcUpCalc()" style="width:100%"></div>',
    '<div style="flex:1"><div style="font-weight:700;font-size:13px">🛡️ Thủ: <span id="pcmIvDShow">100</span></div>',
    '<input id="pcmIvD" type="range" min="100" max="255" step="1" value="100" oninput="pcUpCalc()" style="width:100%"></div>',
    '</div>',
    '<div class="muted" style="font-size:11px" id="pcmIvCost">gốc miễn phí</div>',
    '</div>', // hết cột trái
    '<div id="pcmColR">',
    '<div style="font-weight:700;margin:12px 0 4px">✨ Passive <span class="muted" style="font-weight:400">(<span id="pcmPassMax">4</span> ô đầu MIỄN PHÍ, mở tới 8 ô tính phí · đã chọn <span id="pcmPk">0</span>/<span id="pcmPkMax">8</span>)</span> <span id="pcmPassCost" style="color:var(--gold);font-size:11px"></span></div>',
    // hàng chip passive ĐÃ CHỌN — luôn thấy dù cuộn list, bấm ✕ bỏ nhanh
    '<div id="pcmChips"></div>',
    '<div class="muted" style="font-size:11px;margin-bottom:4px">Màu như trong game: <b style="color:#e8ecf5">■ thường</b> · <b style="color:#ffd76a">■ bậc 3</b> · <b style="color:#3fe0cf">■ bậc 4</b> · <b style="color:#ff7a7a">■ có mặt trái</b>. Con nào có ⚠ là đang chờ kiểm mã trong game.</div>',
    '<div id="pcmBuilds" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px"></div>',
    '<input id="pcmFind" placeholder="🔎 Tìm passive..." oninput="pcPassFilter()" style="width:100%;margin-bottom:5px">',
    '<div id="pcmFull" class="hidden muted" style="font-size:11px;margin-bottom:5px">✅ Đã chọn đủ số passive. Bấm vào 1 con để bỏ chọn và hiện lại danh sách.</div>',
    '<div id="pcmPass"></div>',
    '</div>', // hết cột phải
    '</div>', // hết pcmCols
    // 🧾 tổng kết đơn: mua gì, tốn bao nhiêu - người mua nhìn 1 phát là biết
    '<div id="pcmSummary"><div style="font-weight:700;margin-bottom:4px">🧾 TỔNG KẾT ĐƠN</div><div id="pcmSumBody" style="font-size:12.5px">-</div><div id="pcmUpTotal" style="margin-top:6px;font-size:13px">-</div></div>',
    '<button class="btn-full" id="pcmOk" onclick="pcClaimGo()">✅ NHẬN VÀO GAME</button>',
    '<div class="muted" style="font-size:11px;margin-top:6px">Phải đang <b>ONLINE trong game</b>. Pal vào hộp ngay nhưng <b>DÙNG ĐƯỢC sau đợt khởi động lại server kế tiếp</b>.</div>',
    '</div>',
    '</div>',

    // ================= TRANG 📈 CỔ PHIẾU DOG =================
    // Sàn thuần web: nến 30s, vào lệnh HAI CHIỀU (MUA ăn khi lên · BÁN ăn khi xuống),
    // giữ bao lâu cũng được (gồng), đóng lệnh lúc nào cũng được. Không có bảng Discord.
    '<div id="pageStock" class="hidden">',

    // thanh 3 ô như app giao dịch: số dư · lãi/lỗ lệnh đang gồng · lãi/lỗ chốt hôm nay
    '<div id="skTop">',
    '<div><div class="v" id="skTBal">-</div><div class="t">SỐ DƯ</div></div>',
    '<div><div class="v" id="skTLive">-</div><div class="t">ĐANG GỒNG</div></div>',
    '<div><div class="v" id="skTDay">-</div><div class="t">HÔM NAY</div></div>',
    '</div>',

    // ❓ hướng dẫn: mở sẵn lần đầu, ai gập rồi thì tôn trọng
    '<div class="card">',
    '<div id="skHelpHd" onclick="skHelpT()"><h2 style="margin:0;font-size:16px">❓ Cách chơi</h2>',
    '<span class="muted" id="skHelpAr" style="font-size:18px">▾</span></div>',
    '<div id="skHelpBody">',
    '<ol>',
    '<li>Giá DOG <b>nhảy 2 giây một lần</b>, cây nến cuối lớn dần theo giá và <b>cứ 50 giây chốt thành một cây</b>. Nến <b style="color:var(--green)">xanh</b> là giá lên, <b style="color:var(--red)">đỏ</b> là giá xuống.</li>',
    '<li>Bạn đoán giá <b>sắp tới</b> lên hay xuống. Nghĩ <b>lên</b> thì bấm <b style="color:var(--green)">🟢 MUA</b>, nghĩ <b>xuống</b> thì bấm <b style="color:var(--red)">🔴 BÁN</b>.</li>',
    '<li>Điền <b>số Dogcoin</b> làm vốn (hoặc bấm 25% / 50% / 75% / TẤT TAY theo ví).</li>',
    '<li>Chọn <b>khối lượng (đòn bẩy)</b> - tự nhập số hoặc bấm nhanh. Mỗi <b>1% giá nhích = đòn bẩy × sức nặng % vốn</b> (sức nặng của sàn hiện ở dưới ô đặt lệnh - mặc định 5: x10 nghĩa là 1% giá = <b>50% vốn</b>). Càng nhiều khối lượng, ăn càng đậm mà chết càng nhanh.</li>',
    '<li>💀 <b style="color:var(--red)">Lỗ KHÔNG dừng ở số vốn bạn nhập.</b> Ăn hết vốn thì nó ăn tiếp vào <b>số dư trong ví</b>, tới khi <b>cháy sạch ví</b> mới dừng. Ví càng nhiều tiền thì gồng được càng sâu - nhưng một lệnh sai là <b>mất hết</b>. Thẻ lệnh có dòng <b>💀 CHÁY VÍ nếu giá tới</b>, nhìn mốc đó mà chơi.</li>',
    '<li>Vào lệnh là <b>vốn bị chôn một lúc</b> (xem đồng hồ 🔒) - hết giờ mới đóng được, không có chuyện thấy xanh một nhịp là rút.</li>',
    '<li>Vào lệnh xong tiền bị trừ ngay, lệnh nằm đó và <b>lãi/lỗ nhảy theo giá</b>. Đây chính là lúc <b>gồng</b> - không hạn giờ, giữ bao lâu cũng được.</li>',
    '<li>Muốn ăn tiền thì bấm <b>ĐÓNG LỆNH</b>. Lãi hay lỗ về ví ngay lập tức.</li>',
    '</ol>',
    '<div class="skex"><div class="l">Ví dụ MUA vốn 1.000 · x10 · sức nặng 5 (giá đang ~1.000)</div>',
    '<div class="muted" style="margin-top:3px">Giá lên 1% (1.010) → <b style="color:var(--green)">lãi ~+360</b> · lên 2% → <b style="color:var(--green)">~+810</b><br>',
    'Giá xuống 1% (990) → <b style="color:var(--red)">lỗ ~-540</b> - nhích xíu là thấy tiền nhảy liền</div></div>',
    '<div class="skex"><div class="s">Ví dụ BÁN cùng cỡ lệnh - chiều ngược lại</div>',
    '<div class="muted" style="margin-top:3px">Giá xuống 1% → <b style="color:var(--green)">lãi ~+360</b><br>',
    'Giá lên 1% → <b style="color:var(--red)">lỗ ~-540</b></div></div>',
    '<div class="muted" style="font-size:12px;margin-top:9px">⚠️ Vào lệnh là mất ngay tiền <b>chênh mua–bán</b> (phí sàn - % hiện dưới ô đặt lệnh, và bị nhân theo đòn bẩy × sức nặng), nên giá phải nhích qua điểm <b>Hoà vốn ở giá</b> bạn mới bắt đầu có lãi. Lệnh <b>BÁN</b> còn <b>cháy cọc</b> nếu giá lên gấp đôi giá vào: mất hết cọc và không mất thêm.</div>',
    '</div></div>',

    '<div class="card">',
    '<div id="skHead">',
    '<div><div class="muted" style="font-size:12px">DOG · Cổ phiếu Dogcoin</div>',
    '<div id="skPrice">-</div>',
    '<div id="skChgLine" style="font-size:13px;font-weight:700">-</div>',
    '<div class="muted" style="font-size:11.5px;margin-top:2px">chốt nến sau <b id="skNext">-</b> · giá nhảy mỗi <b>2s</b> · mốc gốc <b id="skBase">1.000</b></div></div>',
    '<div id="skOhlc">',
    '<span>Cao</span><b id="skHi">-</b>',
    '<span>Mở</span><b id="skOp">-</b>',
    '<span>Thấp</span><b id="skLo">-</b>',
    '<span>Đóng</span><b id="skCl">-</b>',
    '</div>',
    '</div>',
    '<div id="skTf">',
    '<button id="sktf1" class="on" onclick="skTf(1)">50s</button>',
    '<button id="sktf6" onclick="skTf(6)">5m</button>',
    '<button id="sktf12" onclick="skTf(12)">10m</button>',
    '<button id="sktf24" onclick="skTf(24)">20m</button>',
    '<button id="sktfma" class="ma" onclick="skMa()">MA</button>',
    '</div>',
    '<div id="skWrap">',
    '<svg id="skChart" viewBox="0 0 300 190" preserveAspectRatio="none"></svg>',
    '<div id="skAxis"></div>',
    // onpointerdown chặn lan xuống skWrap — không chặn thì cú nhích chuột sau khi click
    // bị handler kéo hiểu là kéo tiếp, SKPAN nhảy về giá trị cũ và nút không chịu mất
    '<div id="skPanBtn" class="hidden" onclick="skPanReset()" onpointerdown="event.stopPropagation()" style="position:absolute;left:8px;top:6px;background:#232b3f;border:1px solid var(--gold);border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;z-index:3">⏩ Về hiện tại</div>',
    '</div>',
    '<div id="skPcts">',
    '<div><div class="t">5 phút</div><div class="v" id="skP5">-</div></div>',
    '<div><div class="t">30 phút</div><div class="v" id="skP30">-</div></div>',
    '<div><div class="t">2,5 giờ</div><div class="v" id="skP120">-</div></div>',
    '</div>',
    '<div id="skNews" style="display:none"></div>',
    '</div>',

    '<div id="skPosCard" class="card" style="display:none">',
    '<div class="row"><span class="muted" style="font-size:12px">LỆNH ĐANG MỞ</span><span id="skPosChip" class="skchip y">-</span></div>',
    '<div id="skPl" class="skpl">-</div>',
    '<div class="muted" id="skPosLine" style="font-size:12.5px">-</div>',
    '<div style="height:1px;background:var(--line);margin:9px 0"></div>',
    '<div class="skkv"><span class="muted">Đóng lệnh bây giờ nhận</span><b class="skn" id="skPosVal">-</b></div>',
    '<div class="skkv"><span class="muted">Đỉnh lãi từng gồng qua</span><b class="skn" id="skPeak">-</b></div>',
    '<div class="skkv" id="skBurnRow" style="display:none"><span class="muted" id="skBurnL">💀 CHÁY VÍ nếu giá tới</span><b class="skn" id="skBurn">-</b></div>',
    '<div class="muted" id="skBurnNote" style="display:none;font-size:11.5px;color:var(--red)"></div>',
    // 🤖 mốc tự đóng (25/08): nhìn cột giá bên phải đồ thị rồi điền. Input là markup TĨNH
    // (không nằm trong vùng render lại mỗi nhịp) - bài học cũ: render đè là mất chữ đang gõ.
    '<div class="skkv" style="margin-top:8px"><span class="muted">🤖 Tự đóng khi giá chạm mốc</span><b class="skn" id="skAutoNow">chưa đặt</b></div>',
    '<div class="row" style="margin-top:4px;gap:6px">',
    '<input id="skAutoLow" type="number" min="1" placeholder="⬇ Rớt tới... (vd 900)" style="flex:1">',
    '<input id="skAutoHigh" type="number" min="1" placeholder="⬆ Tăng tới... (vd 1000)" style="flex:1">',
    '<button onclick="skAutoSet()" style="flex:0 0 auto;padding:8px 12px;font-size:12px;background:#232b3f;border:1px solid var(--line)">💾 Đặt</button>',
    '</div>',
    '<div class="muted" style="font-size:11px;margin-top:3px">Giá trên đồ thị chạm mốc là bot tự đóng CẢ lệnh (cắt lỗ hay chốt lời tuỳ vị thế). Vẫn chờ hết thời gian chôn vốn. Để trống cả 2 ô rồi bấm Đặt = xoá mốc.</div>',
    '<div id="skLock" style="display:none"></div>',
    '<button class="btn-full" id="skSellBtn" onclick="skCloseP(0)">ĐÓNG LỆNH</button>',
    '<div id="skPart"><button onclick="skPart(4)">Đóng 1/4</button><button onclick="skPart(2)">Đóng 1/2</button><button onclick="skPart(1.333)">Đóng 3/4</button></div>',
    '</div>',

    // Ô ĐẶT LỆNH: điền CẢ HAI số như chủ server yêu cầu - sửa ô nào ô kia tự tính.
    '<div class="card">',
    '<div class="row"><span class="muted" style="font-size:12px">ĐẶT LỆNH</span><span class="muted" style="font-size:12px">mua <b id="skAsk">-</b> · bán <b id="skBid">-</b></span></div>',
    '<input id="skMoney" type="number" min="1" placeholder="Nhập số Dogcoin muốn xuống" oninput="skPrev()">',
    '<div id="skQuick"><button onclick="skQ(25)">25%</button><button onclick="skQ(50)">50%</button><button onclick="skQ(75)">75%</button><button onclick="skQ(100)">TẤT TAY</button></div>',
    '<div class="muted" style="font-size:10.5px;letter-spacing:.05em;margin-top:11px">KHỐI LƯỢNG (ĐÒN BẨY) - TỰ NHẬP HOẶC BẤM NHANH</div>',
    '<div id="skLevRow">',
    '<input id="skLev" type="number" min="1" step="1" value="1" oninput="skLevIn()">',
    '<div id="skLevQ"></div>',
    '</div>',
    '<div class="skkv" style="margin-top:9px"><span class="muted" id="skPvCL">Trừ ví</span><b class="skn" id="skPvC">0</b></div>',
    '<div class="skkv"><span class="muted">Khối lượng quy đổi</span><b class="skn" id="skPvKl">-</b></div>',
    '<div class="skkv"><span class="muted">Hoà vốn ở giá</span><b class="skn" id="skPvE">-</b></div>',
    '<div class="muted" id="skPvNote" style="font-size:11.5px;margin-top:2px"></div>',
    '<div id="skGo"><button id="skBuyBtn" onclick="skOpen(0)">🟢 MUA · ăn khi giá LÊN</button>',
    '<button id="skSellOpenBtn" onclick="skOpen(1)">🔴 BÁN · ăn khi giá XUỐNG</button></div>',
    '<div class="muted" style="font-size:11.5px;margin-top:8px">Chọn một chiều, muốn đổi thì đóng lệnh cũ trước. Lệnh <b>BÁN</b> phải cọc đúng bằng giá trị lệnh. Chênh mua–bán <b id="skSpr">2</b>% mỗi chiều là phí sàn. Sức nặng lãi/lỗ <b id="skPX">5</b>x. Còn <b id="skLeft">-</b> khối lượng, mỗi người tối đa <b id="skPer">-</b>.</div>',
    '</div>',

    '<div class="card"><h2 style="margin:0 0 8px">🏆 Bảng vàng gồng</h2>',
    '<div id="skBoard" class="muted" style="font-size:12.5px">Chưa có ai chốt lệnh nào.</div>',
    '<div style="height:1px;background:var(--line);margin:9px 0"></div>',
    '<div class="muted" style="font-size:12px;margin-bottom:4px">ĐANG GỒNG</div>',
    '<div id="skHolders" class="muted" style="font-size:12.5px">Chưa ai vào lệnh.</div>',
    '</div>',

    '<div class="card"><h2 style="margin:0 0 8px">📜 Lệnh của bạn</h2>',
    '<div id="skMine" class="muted" style="font-size:12.5px">Chưa có lệnh nào.</div>',
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
    // Tắt/bật tiếng - chơi lúc nửa đêm hay trong giờ làm thì cần tắt được.
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
    // CHỈ nhét id vào data-attribute, tên tra lại từ danh sách lúc bấm - esc() không
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
    'go(saved==="mine"||saved==="stair"||saved==="wheel"||saved==="daily"||saved==="pal"||saved==="pick"||saved==="stock"?saved:"tx")}',
    'function pick(c){SEL=c;["tai","xiu","chan","le","bao"].forEach(function(x){document.getElementById("c_"+x).classList.toggle("sel",x===c)})}',
    'function addAmt(n){var a=document.getElementById("amt");a.value=(parseInt(a.value||"0")||0)+n}',
    'function allIn(){document.getElementById("amt").value=BAL}',
    // vẽ 1 viên xí ngầu bằng chấm CSS
    'var PIPS={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};',
    'function dieHTML(v){var s=\'<div class="die">\';PIPS[v].forEach(function(p){s+=\'<div class="pip" style="left:\'+p[0]+\'%;top:\'+p[1]+\'%"></div>\'});return s+"</div>"}',
    'function showDice(dice,withSum){document.getElementById("diceRow").innerHTML=dice.map(dieHTML).join("");var b=document.getElementById("sumBadge");if(withSum){var s=dice[0]+dice[1]+dice[2];b.textContent="Tổng "+s+" - "+(s>=11?"BIG":"SMALL")+" · "+(s%2===0?"CHẴN":"LẺ");b.classList.remove("hidden")}else b.classList.add("hidden")}',
    // tờ giấy: che kín, kéo TỰ DO 4 CHIỀU - kéo tới đâu lộ tới đó.
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
    // giấy ĐỎ che sẵn (khóa) - kết quả ván trước xuống dòng chú thích dưới sân khấu
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
    // Bảng 20 ván gần nhất - bố cục như bảng soi cầu trong Discord:
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
    'var MT=25;var MPOT=-1;var MINBET=400;var POTSEED=5000;var MG=null;var mBusy=false;var MTAB=[];var MOVER=false;var MLAST=null;var MAXWIN=0;var MAXBET=0;',
    'var MMIN=3,MMAX=20;',   // giới hạn số mìn - server là nguồn chuẩn, mSync ghi đè
    // Bấm nhanh: cú bấm trong lúc chờ server KHÔNG bị nuốt nữa - xếp hàng đào tuần tự.
    // mBusyAt = chốt an toàn: request treo quá 8s thì tự gỡ cờ, không phải F5.
    'var mQ=[];var mBusyAt=0;',
    'function $(id){return document.getElementById(id)}',
    // Rút gọn y như sòng Mines thật: x798.37 · x2.07k · x114.16k · x1.02M
    // (cắt xuống 2 số lẻ sau khi chia, tự bỏ số 0 thừa)
    'function fx(m){if(m>=1e6)return "x"+(Math.floor(m/1e4)/100)+"M";if(m>=1e3)return "x"+(Math.floor(m/10)/100)+"k";return "x"+m.toFixed(2)}',
    'function vnd(n){return Math.floor(n).toLocaleString("vi-VN")}',
    'var PAGE_GRP={tx:"games",mine:"games",stair:"games",wheel:"games",stock:"games",daily:"profile",pal:"profile",pick:"profile"};',
    'var GRP_LAST={games:"tx",profile:"daily"};',
    'function go(p){',
    '$("pageTx").classList.toggle("hidden",p!=="tx");',
    '$("pageMine").classList.toggle("hidden",p!=="mine");',
    '$("pageStair").classList.toggle("hidden",p!=="stair");',
    '$("pageWheel").classList.toggle("hidden",p!=="wheel");',
    '$("pagePal").classList.toggle("hidden",p!=="pal");',
    '$("pagePick").classList.toggle("hidden",p!=="pick");',
    '$("pageDaily").classList.toggle("hidden",p!=="daily");',
    '$("pageStock").classList.toggle("hidden",p!=="stock");',
    '$("histCard").classList.toggle("hidden",p!=="tx");', // lịch sử là của Big Small
    '$("navTx").classList.toggle("on",p==="tx");',
    '$("navMine").classList.toggle("on",p==="mine");',
    '$("navStair").classList.toggle("on",p==="stair");',
    '$("navWheel").classList.toggle("on",p==="wheel");',
    '$("navPal").classList.toggle("on",p==="pal");',
    '$("navPick").classList.toggle("on",p==="pick");',
    '$("navDaily").classList.toggle("on",p==="daily");',
    '$("navStock").classList.toggle("on",p==="stock");',
    // nhóm trang: tầng 1 chọn nhóm, tầng 2 chỉ hiện trang trong nhóm (nhớ trang cuối mỗi nhóm)
    'var g=PAGE_GRP[p]||"games";GRP_LAST[g]=p;',
    '$("ngProfile").classList.toggle("on",g==="profile");',
    '$("ngGames").classList.toggle("on",g==="games");',
    '["navTx","navMine","navStair","navWheel","navStock"].forEach(function(id){$(id).style.display=(g==="games")?"":"none"});',
    '["navDaily","navPal","navPick"].forEach(function(id){$(id).style.display=(g==="profile")?"":"none"});',
    'localStorage.setItem("play_page",p);',
    'if(p==="mine")mSync();else if(p==="stair")sSync();else if(p==="daily"){dailySync();pcSync()}else if(p==="wheel")wheelSync();else if(p==="pal")pwSync();else if(p==="pick")pkSync();else if(p==="stock"){skSync();skHist(1)}else refresh()}',
    'function grpGo(g2){go(GRP_LAST[g2]||(g2==="profile"?"daily":"tx"))}',
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
    // Mốc nào cược hiện tại đã vượt trần thì hiện thẳng "TRẦN" - người chơi thấy ngay
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
    // Vẽ lại màn kết thúc ván vừa xong (server còn giữ) - thoát ra vào lại vẫn thấy.
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
    // LẬT CẢ 4 HỘP: hộp mình chọn sáng vàng, 3 hộp kia mờ - thấy rõ trúng gì, hụt gì
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
    // VÁN MỚI - trước đây tự xoá sau 2 giây, chưa kịp nhìn đã mất.
    'function mEnd(msg,net,mines,luckyAt){mRevealAll(mines);MG=null;MOVER=true;',
    // lộ ô 🍀 chưa kịp mở - cho người chơi tiếc mà chơi ván nữa 😏
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
    // - sự kiện lớn: bỏ hàng đợi, để người chơi nhìn lại bàn rồi tự bấm tiếp
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
    // mìn - mỗi bước đổi tầng, cú bấm xếp hàng sẽ áp vào TẦNG KẾ TIẾP ngoài ý muốn.
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
    // 🌟 ô vàng HIỆN RÕ (đạp là lên thẳng đỉnh) - thấy mà thèm, phải leo tới mới ăn
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
    // bậc THẬT cao nhất (bỏ qua các tầng -1 do 🚀/🌟 nhảy) - chỗ đặt nhân vật kết cục
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
    // lộ ô 🍀 / 🌟 chưa đạp tới - "nó ở NGAY ĐÓ mà không leo tới, tiếc chưa"
    'else if(SLAST.luckyCells&&SLAST.luckyCells.some(function(l){return l.f===f&&l.c===c})){el.className="scell lucky";el.innerHTML="🍀"}',
    'else if(SLAST.goldPos&&SLAST.goldPos.f===f&&SLAST.goldPos.c===c){el.className="scell gold";el.innerHTML="🌟"}',
    'else{el.className="scell";el.innerHTML=""}}}',
    '$("heroBase").style.display="none";',
    'var w=SLAST.amount>=0;',
    '$("sStat").textContent=(w?(SLAST.result==="Lên đỉnh"?"🏆 Lên đỉnh - nhận ":"✅ Đã dừng - nhận "):"🔥 Trúng cầu lửa - thua ")+',
    'vnd(Math.abs(w?SLAST.amount+SLAST.bet:SLAST.bet))}',
    // lộ hết bẫy của tầng vừa cháy rồi khóa tháp
    // Ván xong: dựng SLAST từ dữ liệu server rồi vẽ lại CẢ THÁP - lộ cầu lửa của
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
    // Client chỉ quay bánh xe tới đúng nan - WOFF3 bù lệch đồng hồ như bên nghiện.
    // WBMODE: bánh đang vẽ - 1 = VÒNG VÉ (15 nan tiền, 1 mũi tên) · 2 = VÒNG HỆ SỐ
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
    // LƯỢT ĐÃ TÍNH từ lúc quay vé - nói thẳng, không để tưởng được quay lại.
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
    // Chỉ vẽ lại khi đổi chế độ - đổi bảng nan chỉ cần sửa server.
    'function whBuild(mode){if(!WST||WBMODE===mode)return;WBMODE=mode;WROT=0;',
    '$("whWrap").classList.toggle("one",mode===1);',   // vòng vé: giấu 2 mũi tên phụ
    'var segs=whSegs(),N=segs.length,step=360/N,R=138,cx=150,cy=150;',
    'var FILL={"1.5":"#3949ab","1.8":"#00838f","2":"#1e8e4d","2.5":"#9c27b0","3":"#c96f14","5":"#d13b55","10":"#f0b90b"};',   // bậc mới 19/08: sàn 1.5, thêm 3/5

    // 26/08: tô màu vé theo THỨ HẠNG (rẻ -> đắt), khỏi chết màu khi admin đổi giá vé
    'var uniq1=segs.slice().map(Number).filter(function(v,i,a){return a.indexOf(v)===i}).sort(function(a,b){return a-b});',
    'var PAL1=["#1fa15c","#8b5cf6","#f0b90b","#d13b55","#2e7dd1"];',   // xanh lá / tím / vàng gold / đỏ / dương
    'var h=\'<circle cx="150" cy="150" r="146" fill="#0e1016"/><g id="whRot">\';',
    'for(var i=0;i<N;i++){var m=segs[i];',
    'var a0=(i*step-90)*Math.PI/180,a1=((i+1)*step-90)*Math.PI/180;',
    'var x0=cx+R*Math.cos(a0),y0=cy+R*Math.sin(a0),x1=cx+R*Math.cos(a1),y1=cy+R*Math.sin(a1);',
    'var fill=mode===1?(PAL1[uniq1.indexOf(Number(m))%PAL1.length]||"#2c3350"):(FILL[String(m)]||"#2c3350");',
    'h+=\'<path d="M150 150L\'+x0.toFixed(1)+" "+y0.toFixed(1)+\'A\'+R+" "+R+\' 0 0 1 \'+x1.toFixed(1)+" "+y1.toFixed(1)+\'Z" fill="\'+fill+\'" stroke="#0e1016" stroke-width="1.5"/>\';',
    // Chữ xoay DỌC THEO BÁN KÍNH (đọc từ tâm ra ngoài) như bàn quay thật - 27 nan
    // chữ nằm ngang theo vành là đè lên nhau, xoay dọc thì mỗi nan một làn riêng.
    'var mid=i*step+step/2,am=(mid-90)*Math.PI/180,tx=cx+92*Math.cos(am),ty=cy+92*Math.sin(am);',
    'var lbl=mode===1?m.toLocaleString("vi-VN"):(m>=10?"x10 🏆":"x"+m);',
    'var tfill=mode===1?(uniq1.indexOf(Number(m))===2?"#3d2c05":"#fff"):(m>=10?"#3d2c05":"#fff");',   // chữ tối trên nan VÀNG (hạng 3) / x10
    'var tsz=mode===1?14:(m>=10?16:13);',
    'h+=\'<text x="\'+tx.toFixed(1)+\'" y="\'+ty.toFixed(1)+\'" fill="\'+tfill+\'" font-size="\'+tsz+\'" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(\'+(mid-90)+\' \'+tx.toFixed(1)+" "+ty.toFixed(1)+\')">\'+lbl+"</text>"}',
    'h+=\'</g><circle cx="150" cy="150" r="30" fill="#161926" stroke="#2a2f42" stroke-width="2"/><text x="150" y="150" font-size="22" text-anchor="middle" dominant-baseline="central">\'+(mode===1?"🎟️":"🎡")+\'</text>\';',
    '$("whSvg").innerHTML=h}',
    // Quay bánh xe tới nan idx: 15 GIÂY, 12 vòng - vọt nhanh lúc đầu rồi chậm
    // từ từ rất dài về cuối (bezier đuôi sát 1), đứng hẳn mới báo kết quả.
    // fast=true: vòng vé - 8 giây 8 vòng (nhanh gọn); vòng hệ số giữ 15 giây 12 vòng
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
    // 26/08: ai bị bỏ lại (hết 120s chưa chọn màu/thiếu vé) phải được NÓI RÕ, khỏi tưởng bug
    'if(sp.dropped&&sp.dropped.length)h+="<br><span style=\\"color:var(--red);font-size:12px\\">❌ Bị bỏ lại vì hết giờ chưa chọn màu/không đủ vé: "+sp.dropped.map(esc).join(", ")+" (mất lượt khung này, KHÔNG mất tiền)</span>";',
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
    // Vòng ĐANG quay đã nằm đầu lịch sử (server ghi ngay lúc bấm) - bánh xe chưa
    // dừng thì cắt nó đi, kẻo kết quả hiện ở dưới trước khi quay xong.
    'if(hh.length&&(WANIM||(WST.spin&&(Date.now()+WOFF3)<WST.spin.endsAt)))hh=hh.slice(1);',
    '$("whHist").innerHTML=hh.length?hh.map(function(e){return \'<div style="padding:5px 0;border-bottom:1px solid var(--line)">\'+(e.time||"")+(e.price?" · 🎟️ vé "+Number(e.price).toLocaleString("vi-VN"):"")+" · "+["yellow","blue","green"].map(function(c){return WEM[c]+" x"+(e.results?e.results[c]:"?")}).join(" ")+"<br>"+(e.players||[]).map(function(p){return WEM[p.color]+" "+esc(p.name)+" +"+Number(p.win).toLocaleString("vi-VN")}).join(" · ")+((e.dropped&&e.dropped.length)?"<br><span style=\\"color:var(--red);font-size:11.5px\\">❌ bỏ lại: "+e.dropped.map(esc).join(", ")+"</span>":"")+"</div>"}).join(""):"Chưa có vòng nào.";',
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
    // (nút 🎠 quay thử đã bỏ 19/08 theo yêu cầu chủ server - gọn giao diện)
    // poll khi đang đứng ở tab vòng quay (bắt vòng quay do người khác kích hoạt)
    'setInterval(function(){if(TOKEN&&!WANIM&&localStorage.getItem("play_page")==="wheel")wheelSync()},2000);',
    'setInterval(function(){if(localStorage.getItem("play_page")==="wheel")whBtn()},1000);',
    '',
    // ===== 📈 SÀN CỔ PHIẾU DOG =====
    // SKTF = mấy nến 30s gộp thành 1 cây (1=30s · 4=2m · 10=5m · 30=15m).
    // SKMA = bật đường trung bình 10 cây. SOFF bù lệch đồng hồ máy so với server.
    'var SKS=null,SOFF=0,SKBUSY=false;',
    // khung 54 ("2 ngày") đã bỏ 26/08 tối — ai còn lưu trong máy thì ép về 50s
    'var SKTF=parseInt(localStorage.getItem("sk_tf"))||1;if([1,6,12,24].indexOf(SKTF)<0)SKTF=1;',
    // 26/08 tối: mỗi màn 15 nến — nến to rõ, dễ nhìn (chủ server chốt, hạ dần 64->30->15)
    'var SKVIEW=15;',
    // KÉO XEM LẠI: SKPAN = số cây lùi về quá khứ (0 = bám hiện tại); kéo ngang trên đồ thị
    'var SKPAN=0;',
    'function skPanBtn(){var b=$("skPanBtn");if(b)b.classList.toggle("hidden",SKPAN<=0)}',
    'function skPanReset(){SKPAN=0;skPanBtn();skRender()}',
    'function skPanInit(){var w=$("skWrap");if(!w||w._pan)return;w._pan=1;var sx=0,sp=0,on=false;',
    'w.addEventListener("pointerdown",function(e){skHist();on=true;sx=e.clientX;sp=SKPAN;try{w.setPointerCapture(e.pointerId)}catch(x){}});',
    'w.addEventListener("pointermove",function(e){if(!on)return;var bw=Math.max(2,(w.clientWidth-52)/SKVIEW);var d=Math.round((e.clientX-sx)/bw);var np=sp+d;if(np<0)np=0;if(np!==SKPAN){SKPAN=np;skPanBtn();skChart()}});',
    'var end=function(){on=false};w.addEventListener("pointerup",end);w.addEventListener("pointercancel",end)}',
    'var SKMA=localStorage.getItem("sk_ma")==="1";',
    'function skLot(){return (SKS&&SKS.lotSize)||10}',
    // giá vào lệnh theo chiều đang giữ (chưa giữ gì thì lấy giá mua làm mốc quy đổi)
    'function skRef(){return (SKS&&SKS.pos&&SKS.pos.side==="short")?SKS.bid:(SKS?SKS.ask:0)}',
    'function skSync(){api("/api/stock/state").then(function(j){SKS=j;SOFF=j.now-Date.now();setBal(j.balance);skRender()}).catch(function(e){toast("❌ "+e.message)})}',
    // KHO NẾN 2 NGÀY (26/08): state 2s chỉ mang 180 nến cuối cho nhẹ; phần cũ hơn lấy
    // qua /api/stock/hist, cache 60 giây — khung 5m/10m/20m/2 ngày + kéo lùi ăn từ đây
    'var SKH=null,SKHat=0;',
    'function skHist(force){if(!force&&SKH&&Date.now()-SKHat<60000)return;SKHat=Date.now();api("/api/stock/hist").then(function(j){SKH=j.candles||[];skRender()}).catch(function(e){})}',
    'function skTf(n){SKTF=n;localStorage.setItem("sk_tf",n);SKPAN=0;skPanBtn();skHist();',
    '[1,6,12,24].forEach(function(k){var b=$("sktf"+k);if(b)b.classList.toggle("on",k===n)});skRender()}',
    'function skMa(){SKMA=!SKMA;localStorage.setItem("sk_ma",SKMA?"1":"0");',
    '$("sktfma").classList.toggle("on",SKMA);skRender()}',
    'function skHelpT(){var b=$("skHelpBody");var on=b.classList.toggle("on");',
    '$("skHelpAr").textContent=on?"▴":"▾";localStorage.setItem("sk_help",on?"1":"0")}',
    // CHỈ NHẬP TIỀN (22/08 theo yêu cầu chủ server): bot tự quy ra khối lượng.
    // Nút nhanh ăn theo % ví, nhưng vẫn kẹp trong trần mỗi người và trần còn lại của sàn.
    // Đòn bẩy: người chơi TỰ NHẬP số, nút nhanh chỉ là lối tắt. Kẹp trong trần của sàn.
    'function skLevGet(){var v=Math.floor(parseFloat($("skLev").value)||1);',
    'if(v<1)v=1;var mx=(SKS&&SKS.maxLev)||1;if(v>mx)v=mx;return v}',
    'function skLevIn(){var v=skLevGet();if(String(v)!==$("skLev").value)$("skLev").value=v;',
    'skLevBtns();skPrev()}',
    'function skLevSet(v){$("skLev").value=v;skLevIn()}',
    'function skLevBtns(){var box=$("skLevQ");if(!box||!SKS)return;var cur=skLevGet();',
    'box.innerHTML=(SKS.levs||[1]).map(function(v){',
    'return \'<button class="\'+(v===cur?"on":"")+\'" onclick="skLevSet(\'+v+\')">x\'+v+\'</button>\'}).join("")}',
    'function skQ(p){if(!SKS)return;',
    'var cap=Math.floor(SKS.balance*p/100),L=skLevGet();',
    'var byPer=SKS.maxPer-(SKS.pos?SKS.pos.shares:0),bySan=SKS.maxShares-SKS.outstanding;',
    'var shCap=Math.max(0,Math.min(byPer,bySan));',
    // vốn tối đa để không vượt trần khối lượng = (trần CP × giá) / đòn bẩy
    'var m=Math.min(cap,Math.floor(shCap*skRef()/L));',
    'var minM=Math.ceil(skRef()/L);',
    'if(m<minM)return toast("Không đủ vào lệnh nhỏ nhất ("+vnd(minM)+" Dogcoin ở x"+L+")");',
    '$("skMoney").value=m;skPrev()}',
    // Gộp nến 30s thành khung lớn: mở của cây đầu, đóng của cây cuối, cao/thấp là biên
    'function skGroup(cs,n){if(n<=1)return cs.slice();var out=[];',
    'for(var i=0;i<cs.length;i+=n){var g=cs.slice(i,i+n);if(!g.length)continue;',
    'var h=g[0].h,l=g[0].l;for(var k=1;k<g.length;k++){if(g[k].h>h)h=g[k].h;if(g[k].l<l)l=g[k].l}',
    'out.push({o:g[0].o,h:h,l:l,c:g[g.length-1].c})}return out}',
    // Nến + trục giá bên phải. Nhãn trục vẽ bằng HTML (SVG kéo méo chữ vì
    // preserveAspectRatio=none), nên toạ độ phải quy từ viewBox 190 sang px thật.
    'function skChart(){var el=$("skChart"),ax=$("skAxis");if(!el||!SKS)return;skPanInit();',
    // ghép kho nến cũ (SKH) trước 180 nến sống — mọi khung đều đủ 64 cây, kéo lùi thoải mái
    'var raw=SKS.candles||[];',
    'if(SKH&&SKH.length&&SKS.histLen>raw.length){var pre=Math.min(SKH.length,SKS.histLen-raw.length);if(pre>0)raw=SKH.slice(0,pre).concat(raw)}',
    'var cs=skGroup(raw,SKTF);',
    // KÉO XEM LẠI (26/08): SKPAN = số cây lùi về quá khứ; kéo chuột/ngón tay trên đồ thị
    'var maxPan=Math.max(0,cs.length-SKVIEW);if(SKPAN>maxPan)SKPAN=maxPan;',
    'if(SKPAN>0)cs=cs.slice(Math.max(0,cs.length-SKVIEW-SKPAN),cs.length-SKPAN);',
    'else if(cs.length>SKVIEW)cs=cs.slice(cs.length-SKVIEW);',
    'if(cs.length<2){el.innerHTML="";if(ax)ax.innerHTML="<div class=\\"muted\\" style=\\"position:absolute;left:-240px;top:80px;width:230px;text-align:center;font-size:12px\\">Chưa đủ nến cho khung này - chờ vài phút hoặc chọn khung nhỏ hơn (50s)</div>";return}',
    'var lo=1e9,hi=0;for(var i=0;i<cs.length;i++){if(cs[i].l<lo)lo=cs[i].l;if(cs[i].h>hi)hi=cs[i].h}',
    'if(SKS.price<lo)lo=SKS.price;if(SKS.price>hi)hi=SKS.price;',
    'var pad=(hi-lo)*0.1||20;lo-=pad;hi+=pad;',
    'var n=cs.length,w=300/n,bw=Math.max(1.4,w*0.6);',
    'var Y=function(v){return 182-(v-lo)/(hi-lo)*174};',
    'var g="";',
    'for(var q=0;q<4;q++){var gy=(8+q*58).toFixed(1);',
    'g+=\'<line x1="0" y1="\'+gy+\'" x2="300" y2="\'+gy+\'" stroke="#1b1f28" stroke-width="1"/>\'}',
    'for(var k=0;k<n;k++){var c=cs[k],cx=(k+0.5)*w,up=c.c>=c.o,col=up?"#3ddc84":"#ff5d5d";',
    'var yh=Y(c.h).toFixed(1),yl=Y(c.l).toFixed(1);',
    'var yo=Y(c.o),yc=Y(c.c),top=Math.min(yo,yc),bh=Math.max(0.8,Math.abs(yc-yo));',
    'g+=\'<line x1="\'+cx.toFixed(1)+\'" y1="\'+yh+\'" x2="\'+cx.toFixed(1)+\'" y2="\'+yl+\'" stroke="\'+col+\'" stroke-width="1" vector-effect="non-scaling-stroke"/>\';',
    'g+=\'<rect x="\'+(cx-bw/2).toFixed(1)+\'" y="\'+top.toFixed(1)+\'" width="\'+bw.toFixed(1)+\'" height="\'+bh.toFixed(1)+\'" fill="\'+col+\'"/>\'}',
    'if(SKMA&&n>=10){var d="",m=0;',
    'for(var t=9;t<n;t++){var sum=0;for(var u=t-9;u<=t;u++)sum+=cs[u].c;',
    'd+=(m++?" L":"M")+((t+0.5)*w).toFixed(1)+" "+Y(sum/10).toFixed(1)}',
    'g+=\'<path d="\'+d+\'" fill="none" stroke="#8a90a3" stroke-width="1.4" vector-effect="non-scaling-stroke"/>\'}',
    // kẻ chấm ngang ở GIÁ HIỆN TẠI như app thật
    'var yn=Y(SKS.price).toFixed(1);',
    'g+=\'<line x1="0" y1="\'+yn+\'" x2="300" y2="\'+yn+\'" stroke="#8a90a3" stroke-width="1" stroke-dasharray="2 3"/>\';',
    'if(SKS.pos){var ya=Y(SKS.pos.avg);if(ya>2&&ya<188){',
    'g+=\'<line x1="0" y1="\'+ya.toFixed(1)+\'" x2="300" y2="\'+ya.toFixed(1)+\'" stroke="#ffcf5c" stroke-width="1" stroke-dasharray="4 3"/>\'}}',
    'el.innerHTML=g;',
    'if(ax){var hp=el.clientHeight||190,K=hp/190,ah="";',
    'for(var z=0;z<5;z++){var vv=hi-(hi-lo)*(z/4);',
    'ah+=\'<div style="top:\'+(Y(vv)*K).toFixed(1)+\'px">\'+vnd(vv)+\'</div>\'}',
    'ah+=\'<div class="now\'+(SKS.price>=SKS.base?"":" dn")+\'" style="top:\'+(Y(SKS.price)*K).toFixed(1)+\'px">\'+vnd(SKS.price)+\'</div>\';',
    'if(SKS.pos){var yp=Y(SKS.pos.avg);if(yp>4&&yp<186)',
    'ah+=\'<div class="avg" style="top:\'+(yp*K).toFixed(1)+\'px">\'+vnd(SKS.pos.avg)+\'</div>\'}',
    'ax.innerHTML=ah}}',
    // Xem trước cho CẢ HAI chiều. Đang giữ lệnh thì chỉ cho vào thêm ĐÚNG chiều đó.
    'function skPrev(){if(!SKS)return;var m=parseInt($("skMoney").value)||0;',
    'var held=SKS.pos?SKS.pos.side:null,LV=skLevGet();',
    // vốn × đòn bẩy = giá trị lệnh -> số CP; vốn thực trừ ví tính lại từ số CP nguyên
    'var mk=function(e){var sh=Math.floor(m*LV/e);if(sh<0)sh=0;',
    'return {e:e,sh:sh,c:Math.max(sh>0?1:0,Math.round(sh*e/LV)),basis:sh*e}};',
    'var L=mk(SKS.ask),S=mk(SKS.bid),ref=held==="short"?S:L;',
    'var sh=ref.sh;',
    // Trần tính bằng CP nên đòn bẩy càng cao thì vốn dùng được càng ÍT (10.000 ở x20 đã
    // là ~199 CP, quá trần 80). Tính sẵn ở đây để CHẶN TẠI CHỖ, khỏi để người chơi bấm
    // rồi mới ăn lỗi "tối đa 80 CP, bạn đang có 0" - chủ server đã dính 22/08.
    'var heldSh=SKS.pos?SKS.pos.shares:0;',
    'var roomSh=Math.max(0,Math.min(SKS.maxPer-heldSh,SKS.maxShares-SKS.outstanding));',
    'var maxMoney=Math.floor(roomSh*ref.e/LV),over=sh>roomSh;',
    '$("skPvC").textContent=vnd(ref.c);',
    '$("skPvCL").textContent=held==="short"?"Cọc (trừ ví)":"Trừ ví";',
    'var sp=SKS.spreadPct/100;',
    'var evenL=Math.round(SKS.ask/(1-sp)),evenS=Math.round(SKS.bid*(1-sp));',
    'var even=held==="short"?evenS:evenL;',
    '$("skPvE").textContent=sh<1?"-":(held?vnd(even):(vnd(evenL)+" ↑ MUA / "+vnd(evenS)+" ↓ BÁN"));',
    'var kl=$("skPvKl");if(kl)kl.textContent=sh<1?("còn "+roomSh+" CP · vốn tối đa "+vnd(maxMoney)+" ở x"+LV)',
    ':((over?"⚠️ ":"")+"x"+LV+" → "+sh+" CP"+(over?(" / sàn chỉ còn "+roomSh+" CP"):(" ("+vnd(ref.basis)+" Dogcoin giá trị lệnh)")));',
    'var note="";',
    'if(over)note="⚠️ Quá trần khối lượng: lệnh cần "+sh+" CP mà chỉ còn "+roomSh+" CP. Ở x"+LV+" thì vốn tối đa là "+vnd(maxMoney)+" Dogcoin - hạ vốn hoặc hạ đòn bẩy. ";',
    'if(!over&&sh>0&&m>ref.c)note="Dư "+vnd(m-ref.c)+" không đủ thêm khối lượng nên giữ lại trong ví. ";',
    // 24/08: sức nặng điểm giá (pointX) nhân thẳng vào tiền -> mỗi 1% giá = lev × pointX % vốn
    'var PX=SKS.pointX||1;',
    'if(!over&&sh>0&&(LV>1||PX>1))note+="Mỗi 1% giá nhích = "+(LV*PX)+"% vốn ("+vnd(Math.round(ref.c*LV*PX/100))+" Dogcoin). ";',
    'if(!over&&sh>0)note+="⚠️ Lỗ KHÔNG dừng ở vốn: ăn hết vốn thì ăn tiếp vào ví, tới khi CHÁY SẠCH VÍ ("+vnd(SKS.balance)+" Dogcoin đang có). ";',
    'if(SKS.holdS>0)note+="Vào lệnh là vốn bị chôn "+SKS.holdS+" giây, chưa hết giờ không đóng được. ";',
    'if(sh>0)note+=held==="short"?("Giá phải xuống "+(Math.round((1-even/SKS.price)*1000)/10)+"% bạn mới có lãi.")',
    ':held==="long"?("Giá phải lên "+(Math.round((even/SKS.price-1)*1000)/10)+"% bạn mới có lãi.")',
    ':("MUA cần giá lên "+(Math.round((evenL/SKS.price-1)*1000)/10)+"%, BÁN cần giá xuống "+(Math.round((1-evenS/SKS.price)*1000)/10)+"% mới có lãi.");',
    '$("skPvNote").textContent=note;',
    'var lock=!SKS.open?"SÀN TẠM ĐÓNG":SKS.blocked?"ĐANG NỢ XẤU":"";',
    'var setB=function(id,o,lbl,sd){var b=$(id);if(!b)return;var wrong=held&&held!==sd;',
    // mỗi chiều vào ở giá khác nhau -> số CP khác nhau, nên kiểm trần RIÊNG từng nút
    'var ov=o.sh>roomSh;',
    'b.disabled=SKBUSY||!!lock||wrong||ov||o.sh<1||o.c>SKS.balance;',
    'b.textContent=lock?(lbl+" · "+lock):wrong?(lbl+" · đóng lệnh cũ trước")',
    ':o.sh<1?(lbl+" · nhập tiền đã")',
    ':ov?(lbl+" · quá trần, tối đa "+vnd(Math.floor(roomSh*o.e/LV)))',
    ':o.c>SKS.balance?(lbl+" · thiếu Dogcoin"):(lbl+" · "+vnd(o.c))};',
    'setB("skBuyBtn",L,"🟢 MUA · giá LÊN","long");setB("skSellOpenBtn",S,"🔴 BÁN · giá XUỐNG","short")}',
    'function skOpen(short){if(!SKS||SKBUSY)return;var m=parseInt($("skMoney").value)||0;',
    'if(m<=0)return toast("Nhập số Dogcoin đã");',
    'SKBUSY=true;skPrev();',
    'api("/api/stock/open",{amount:m,side:short?"short":"long",lev:skLevGet()}).then(function(j){SKBUSY=false;SKS=j;',
    'setBal(j.balance);$("skMoney").value="";',
    'toast((short?"🔴 Vào lệnh BÁN ":"🟢 Vào lệnh MUA ")+(Math.round(j.bought/skLot()*100)/100)+" · "+vnd(j.cost)+" Dogcoin @ "+vnd(j.fill));',
    'skRender()}).catch(function(e){SKBUSY=false;toast("❌ "+e.message);skSync()})}',
    'function skCloseP(n){if(!SKS||!SKS.pos||SKBUSY)return;SKBUSY=true;',
    'api("/api/stock/close",{shares:n||0}).then(function(j){SKBUSY=false;SKS=j;setBal(j.balance);',
    'toast((j.pl>=0?"💰 Chốt lãi +":"💥 Cắt lỗ ")+vnd(j.pl)+" Dogcoin (đóng "+(Math.round(j.sold/skLot()*100)/100)+" @ "+vnd(j.fill)+")");',
    'if(j.pl>0)celebrate();skRender()}).catch(function(e){SKBUSY=false;toast("❌ "+e.message);skSync()})}',
    'function skPart(d){if(!SKS||!SKS.pos)return;var n=Math.floor(SKS.pos.shares/d);if(n<1)n=1;skCloseP(n)}',
    // 🤖 đặt/xoá mốc tự đóng - trống cả 2 ô = xoá
    'function skAutoSet(){if(!SKS||!SKS.pos)return toast("Chưa có lệnh đang mở");',
    'var lo=parseInt($("skAutoLow").value)||0,hi=parseInt($("skAutoHigh").value)||0;',
    'api("/api/stock/auto",{low:lo,high:hi}).then(function(j){',
    '$("skAutoLow").value="";$("skAutoHigh").value="";',
    'toast((j.autoLow||j.autoHigh)?("🤖 Đã đặt mốc tự đóng"+(j.autoLow?" ⬇"+vnd(j.autoLow):"")+(j.autoHigh?" ⬆"+vnd(j.autoHigh):"")):"🗑️ Đã xoá mốc tự đóng");',
    'skSync()}).catch(function(e){toast("❌ "+e.message)})}',
    'function skRender(){if(!SKS)return;',
    // thanh 3 ô đầu trang
    '$("skTBal").textContent=vnd(SKS.balance);',
    'var live=SKS.pos?SKS.pos.pl:0,day=SKS.todayPl||0;',
    'var pnl=function(id,v,zero){var e=$(id);e.textContent=v===0?zero:((v>0?"+":"")+vnd(v));',
    'e.style.color=v>0?"var(--green)":v<0?"var(--red)":"var(--muted)"};',
    'pnl("skTLive",live,"-");pnl("skTDay",day,"0");',
    '$("skPrice").textContent=vnd(SKS.price);',
    'var pc=Math.round((SKS.price/SKS.base-1)*1000)/10;',
    'var col=pc>0?"var(--green)":pc<0?"var(--red)":"var(--muted)";',
    '$("skPrice").style.color=col;',
    'var cl2=$("skChgLine");cl2.style.color=col;',
    'var dfB=SKS.price-SKS.base;',
    'cl2.textContent=(dfB>0?"+":"")+vnd(dfB)+" ("+(pc>0?"+":"")+pc+"%)";',
    'var rc=SKS.candles||[],lastC=rc.length?rc[rc.length-1]:null;',
    'if(lastC){$("skHi").textContent=vnd(lastC.h);$("skOp").textContent=vnd(lastC.o);',
    '$("skLo").textContent=vnd(lastC.l);$("skCl").textContent=vnd(lastC.c);',
    '$("skHi").style.color="var(--green)";$("skLo").style.color="var(--red)"}',
    'var pctAt=function(back,id){var e=$(id);if(!e)return;',
    'if(rc.length<2){e.textContent="-";return}',
    'var v0=rc[Math.max(0,rc.length-1-back)].c;',
    'var d=Math.round((SKS.price/v0-1)*1000)/10;',
    'e.textContent=(d>=0?"+":"")+d+"%";',
    'e.style.color=d>0?"var(--green)":d<0?"var(--red)":"var(--muted)"};',
    'pctAt(6,"skP5");pctAt(36,"skP30");pctAt(rc.length,"skP120");',
    '$("skBase").textContent=vnd(SKS.base);$("skAsk").textContent=vnd(SKS.ask);$("skBid").textContent=vnd(SKS.bid);',
    '$("skSpr").textContent=SKS.spreadPct;var px=$("skPX");if(px)px.textContent=SKS.pointX||1;',
    '$("skPer").textContent=Math.round(SKS.maxPer/skLot()*10)/10;',
    '$("skLeft").textContent=Math.round(Math.max(0,SKS.maxShares-SKS.outstanding)/skLot()*10)/10;',
    'skChart();',
    'var nw=SKS.news,nb=$("skNews");',
    'if(nw&&Date.now()-nw.t<30*60000){nb.style.display="block";',
    'nb.innerHTML=(nw.pct>=0?"📈 <b style=\\"color:var(--green)\\">TIN TỐT":"📉 <b style=\\"color:var(--red)\\">TIN XẤU")+" "+(nw.pct>0?"+":"")+nw.pct+"%</b> - "+esc(nw.text)+" ("+vnd(nw.from)+" → "+vnd(nw.to)+")"}',
    'else nb.style.display="none";',
    'var p=SKS.pos,pc2=$("skPosCard");',
    'if(p){pc2.style.display="block";',
    'var win=p.pl>=0,sht=p.side==="short";',
    '$("skPl").textContent=(win?"+":"")+vnd(p.pl);',
    '$("skPl").style.color=win?"var(--green)":"var(--red)";',
    'pc2.style.borderColor=win?"#2f6b48":"#6b2f2f";',
    'var mins=Math.floor((Date.now()+SOFF-p.openedAt)/60000);',
    'var dur=mins<60?(mins+" phút"):(Math.floor(mins/60)+" giờ "+(mins%60));',
    'var ch=$("skPosChip");ch.textContent=(win?"ĐANG GỒNG LÃI ":"GỒNG LỖ ")+dur;',
    'ch.className="skchip "+(win?"g":"r");',
    '$("skPosLine").innerHTML=\'<span class="skside \'+(sht?"s":"l")+\'">\'+(sht?"BÁN · ăn khi XUỐNG":"MUA · ăn khi LÊN")+\'</span>\'',
    '+"<b>x"+p.lev+"</b> · "+p.shares+" CP · vốn <b>"+vnd(p.margin)+"</b> · vào <b>"+vnd(p.avg)+"</b> → nay <b>"+vnd(sht?SKS.ask:SKS.bid)+"</b> · <b style=\\"color:"+(win?"var(--green)":"var(--red)")+"\\">"+(win?"+":"")+p.plPct+"%</b>";',
    '$("skPosVal").textContent=vnd(p.value);',
    '$("skPeak").textContent=p.peak>0?("+"+vnd(p.peak)):"chưa từng có lãi";',
    '$("skAutoNow").textContent=(p.autoLow||p.autoHigh)?((p.autoLow?"⬇ "+vnd(p.autoLow):"")+(p.autoLow&&p.autoHigh?" · ":"")+(p.autoHigh?"⬆ "+vnd(p.autoHigh):"")):"chưa đặt";',
    // cháy vốn giờ áp cả 2 chiều (có đòn bẩy) - chỉ ẩn khi x1 chiều MUA vì giá sàn 300
    'var br=$("skBurnRow");var showB=p.burnAt>0&&p.burnAt>=300&&p.burnAt<=3000;',
    'br.style.display=showB?"flex":"none";',
    'if(showB){$("skBurn").textContent=vnd(p.burnAt);',
    '$("skBurnL").textContent=sht?"💀 CHÁY VÍ nếu giá LÊN tới":"💀 CHÁY VÍ nếu giá XUỐNG tới";',
    'var bn=$("skBurnNote");if(bn){bn.style.display="block";',
    'bn.textContent="Lỗ ăn hết vốn rồi ăn tiếp vào ví - đang gồng bằng "+vnd(p.buffer)+" Dogcoin (vốn "+vnd(p.margin)+" + ví "+vnd(SKS.balance)+"). Tới mức đó là MẤT SẠCH VÍ."}}',
    'else{var bn2=$("skBurnNote");if(bn2)bn2.style.display="none"}',
    // đồng hồ chôn vốn: chưa hết giờ thì khoá nút đóng lệnh
    'var lk=$("skLock"),leftS=Math.ceil(((p.unlockAt||0)-(Date.now()+SOFF))/1000);',
    'var locked=leftS>0;',
    'if(locked){lk.style.display="block";',
    'lk.innerHTML="🔒 Vốn đang bị chôn - còn <b>"+leftS+" giây</b> nữa mới đóng lệnh được"}',
    'else lk.style.display="none";',
    '$("skSellBtn").textContent=locked?("🔒 CHÔN VỐN - CÒN "+leftS+"s")',
    ':((win?"CHỐT LÃI - ĐÓNG LỆNH → ":"CẮT LỖ - ĐÓNG LỆNH → ")+vnd(p.value));',
    '$("skSellBtn").disabled=SKBUSY||locked;',
    '[4,2,1.333].forEach(function(d,i){var bs=$("skPart").children[i];if(bs)bs.disabled=locked});}',
    'else pc2.style.display="none";',
    'var bd=SKS.board||[];',
    '$("skBoard").innerHTML=bd.length?bd.map(function(b,i){var w=b.pl>=0;',
    'return \'<div class="skrow"><span><b>\'+(i+1)+\'</b> \'+esc(b.name)+\' <span class="muted">\'+b.n+\' lệnh</span></span><b style="color:\'+(w?"var(--green)":"var(--red)")+\'">\'+(w?"+":"")+vnd(b.pl)+\'</b></div>\'}).join(""):"Chưa có ai chốt lệnh nào.";',
    'var hd=SKS.holders||[];',
    '$("skHolders").innerHTML=hd.length?hd.map(function(x){',
    'var m=Math.floor((Date.now()+SOFF-x.since)/60000);var d2=m<60?(m+"p"):(Math.floor(m/60)+"g"+(m%60));',
    'return \'<div class="skrow"><span>\'+(x.mine?"<b>":"")+esc(x.name)+(x.mine?"</b>":"")+\' <span class="muted">gồng \'+d2+\'</span></span><b>\'+(Math.round(x.shares/skLot()*100)/100)+\'</b></div>\'}).join(""):"Chưa ai vào lệnh.";',
    'var mn=SKS.mine||[];',
    '$("skMine").innerHTML=mn.length?(mn.map(function(c){var w=c.pl>=0,sh2=c.side==="short";',
    'return \'<div class="skrow"><span><span class="skside \'+(sh2?"s":"l")+\'">\'+(sh2?"BÁN":"MUA")+\'</span>\'+(Math.round(c.shares/skLot()*100)/100)+\' · \'+vnd(c.avg)+\' → \'+vnd(c.price)+(c.forced?\' <b style="color:var(--red)">CHÁY</b>\':"")+\'</span><b style="color:\'+(w?"var(--green)":"var(--red)")+\'">\'+(w?"+":"")+vnd(c.pl)+\'</b></div>\'}).join("")',
    '+\'<div class="skrow" style="border-bottom:0"><span><b>Tổng \'+mn.length+\' lệnh</b></span><b style="color:\'+(SKS.mineTotal>=0?"var(--green)":"var(--red)")+\'">\'+(SKS.mineTotal>=0?"+":"")+vnd(SKS.mineTotal)+\'</b></div>\'):"Chưa có lệnh nào.";',
    'var lg=SKS.log||[];',
    '$("skLog").innerHTML=lg.length?lg.map(function(l){var b=l.side==="mua"||l.side==="đóng bán";',
    'return \'<div class="skrow"><span>\'+esc(l.name)+\' <span style="color:\'+(b?"var(--green)":"var(--red)")+\'">\'+l.side+\' \'+(Math.round(l.shares/skLot()*100)/100)+\'</span></span><span class="muted">\'+vnd(l.price)+\'</span></div>\'}).join(""):"Chưa có lệnh nào.";',
    'skLevBtns();skPrev()}',
    // Đồng hồ đếm tới lúc CHỐT NẾN (50s). Giá nhảy mỗi 2 giây nên nạp lại mỗi 2 giây
    // để cây nến cuối lớn/nhỏ ngay trên màn hình, không phải đợi hết cây mới thấy.
    'setInterval(function(){if(localStorage.getItem("play_page")!=="stock"||!SKS)return;',
    'var left=Math.ceil(((SKS.candleAt||SKS.nextTick)-(Date.now()+SOFF))/1000);',
    'if(left<0)left=0;$("skNext").textContent=left+"s";',
    // đếm ngược chôn vốn mỗi giây, hết giờ thì mở nút ngay không cần đợi nạp lại
    'if(SKS.pos&&SKS.pos.unlockAt){var lf=Math.ceil((SKS.pos.unlockAt-(Date.now()+SOFF))/1000);',
    'var lk2=$("skLock"),bt=$("skSellBtn");',
    'if(lf>0){lk2.innerHTML="🔒 Vốn đang bị chôn - còn <b>"+lf+" giây</b> nữa mới đóng lệnh được";',
    'bt.textContent="🔒 CHÔN VỐN - CÒN "+lf+"s";bt.disabled=true}',
    'else if(lk2.style.display!=="none"){skRender()}}},1000);',
    'setInterval(function(){if(TOKEN&&!SKBUSY&&localStorage.getItem("play_page")==="stock"){skSync();skHist()}},2000);',
    // lần đầu MỞ SẴN hướng dẫn; ai đã gập thì tôn trọng. Khôi phục khung giờ + MA.
    '(function(){if(localStorage.getItem("sk_help")!=="0"){var b=$("skHelpBody");',
    'if(b){b.classList.add("on");$("skHelpAr").textContent="▴"}}',
    '[1,6,12,24].forEach(function(k){var q=$("sktf"+k);if(q)q.classList.toggle("on",k===SKTF)});',
    'var qm=$("sktfma");if(qm)qm.classList.toggle("on",SKMA)})();',
    // ===== 📅 ĐIỂM DANH + 💉 NGHIỆN =====
    // DOFF = lệch giờ máy người chơi so với server - đồng hồ đếm ngược nghiện chạy
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
    // bấm ô 🎁 để nhận thưởng chuỗi - MỖI LẦN BẤM 1 gói, còn gói thì ô vẫn sáng
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
    // ===== 🎁 QUAY PAL kiểu CSGO =====
    // Server chốt kết quả TRƯỚC (trong /spin), client chỉ diễn hoạt hình dải thẻ
    // chạy ngang rồi dừng đúng thẻ kết quả. Thẻ 128px + khe 6px = bước 134px.
    'var PW=null,PWBUSY=false,PWRBUSY=false,PWLOCK=0,PWTICKING=false;',
    // keepMain/keepRaid: sau khi quay xong GIỮ NGUYÊN dải ở ô trúng (không chạy lại idle),
    // để pal trúng đứng yên tại chỗ cho người chơi nhìn — quay lượt mới mới dựng dải mới.
    'function pwSync(keepMain,keepRaid){api("/api/palwheel/state").then(function(j){PW=j;',
    '$("pwStat").textContent=(j.pals.length+(j.raids.length?1:0))+" ô · rương có "+j.chestCount+" pal";',
    '$("pwPot").innerHTML="🏆 Hũ quay pal: <b>"+vnd(j.pot)+"</b> Dogcoin (mỗi lượt 1% nổ) · Bán lại pal: "+vnd(j.sellPrice)+" · Ô 🔥 RAID: "+j.raids.length+" boss, ra thẳng ngay vòng này (ô trúng bốc lửa)";',
    // ⏳ dựng lại đếm ngược sau F5: server báo còn bao nhiêu ms -> đặt PWLOCK, chạy ticker
    'if(j.spinRemain>0){var uu=Date.now()+j.spinRemain+300;if(uu>PWLOCK)PWLOCK=uu}',
    'pwRenderLuck();pwLockKick();',
    'if(!PWBUSY&&!keepMain)pwIdle();if(!PWRBUSY&&!keepRaid)pwRaidIdle()}).catch(function(e){toast("❌ "+e.message)})}',
    // ⏳ nút quay + nút raid: hiện đếm ngược khoá (~10,5s/lượt) rồi mới bấm lại được —
    // khớp khoá chống-spam ở server. F5 xong pwSync đọc spinRemain dựng lại đếm ngược này.
    'function pwGoLabel(){if(!PW)return;var now=Date.now(),lk=PWLOCK>now,w=Math.ceil((PWLOCK-now)/1000);var g=$("pwGo");',
    'if(!PW.open){g.textContent="⛔ ĐANG ĐÓNG BẢO TRÌ";g.disabled=true}',
    'else if(lk){g.textContent="⏳ Chờ "+w+"s để quay tiếp";g.disabled=true}',
    'else if(PWBUSY){g.textContent="⏳ Đang quay...";g.disabled=true}',
    'else{g.textContent="🎁 QUAY ("+vnd(PW.price)+" Dogcoin)";g.disabled=false}',
    'var rg=$("pwRaidGo");if(rg){if(lk){rg.textContent="⏳ Chờ "+w+"s";rg.disabled=true}',
    'else if(PWRBUSY){rg.textContent="⏳ Đang quay...";rg.disabled=true}',
    'else if(PW.raidReady){rg.textContent="🔥 QUAY RAID (đầy may mắn)";rg.disabled=false}',
    'else{rg.textContent="🔒 Đầy 100% may mắn mới quay được";rg.disabled=true}}}',
    'function pwLockStart(){PWLOCK=Date.now()+10800;pwLockKick()}',
    // kick: cập nhật nút + chạy ticker nếu đang khoá mà chưa chạy (tránh 2 ticker chồng nhau)
    'function pwLockKick(){pwGoLabel();if(PWLOCK>Date.now()&&!PWTICKING){PWTICKING=true;pwLockTick()}}',
    'function pwLockTick(){pwGoLabel();if(Date.now()<PWLOCK){setTimeout(pwLockTick,300)}else{PWTICKING=false;pwGoLabel()}}',
    'function pwPick(a){return a[Math.floor(Math.random()*a.length)]}',
    // 🖼️ gắn hình pal (assets/palimage/T_<code>_icon_normal.png) — con thiếu hình thì ẩn <img>, chừa tên
    'function pwImg(code){return code?("<img src=\\"/palimage/T_"+code+"_icon_normal.png\\" alt=\\"\\" onerror=\\"this.style.display=\'none\'\\">"):""}',
    'function pwCardHtml(p,raid,hit){var nm=(p&&p.name!==undefined)?p.name:(p||"");var code=(p&&p.code)||"";',
    'return "<div class=\\"pwCard"+(raid?" raid":"")+(hit?" raidhit":"")+"\\">"+pwImg(code)+"<div class=\\"nm\\">"+(raid?"🔥 ":"")+esc(nm)+"</div><div class=\\"dx\\">"+(raid?"PAL RAID":(p&&p.dex?"#"+p.dex:"&nbsp;"))+"</div></div>"}',
    'function pwIdle(){if(!PW||!PW.pals||!PW.pals.length)return;var h="";for(var i=0;i<14;i++){var r=PW.raids.length&&Math.random()<0.06;h+=r?pwCardHtml(pwPick(PW.raids),true,false):pwCardHtml(pwPick(PW.pals),false,false)}',
    'var s=$("pwStrip");s.style.transition="none";s.style.transform="translateX(0px)";s.innerHTML=h}',
    // dải quay dùng chung cho cả 2 vòng: 60 thẻ, kết quả ở thẻ 52; jitter ±35px. Thẻ 110px + khe 6px = bước 116px.
    'function pwRollEl(strip,wrap,cards,cb){var s=$(strip),W=$(wrap).clientWidth;',
    's.innerHTML=cards.join("");s.style.transition="none";s.style.transform="translateX(0px)";void s.offsetWidth;',
    'var STEP=116,HALF=55;var jit=Math.floor(Math.random()*70)-35;var target=52*STEP+HALF-W/2+jit;',
    's.style.transition="transform 10s cubic-bezier(.06,.72,.05,1)";',
    's.style.transform="translateX("+(-target)+"px)";setTimeout(cb,10300)}',
    // 27/08: GỘP 1 reel — raid ra thẳng ở vòng thường, ô trúng (thẻ 52) gắn hiệu ứng lửa nếu là raid
    'function pwStrip1(it){var out=[];for(var i=0;i<60;i++){',
    'if(i===52)out.push(pwCardHtml(it,!!it.raid,!!it.raid));',
    'else{var r=PW.raids.length&&Math.random()<0.06;out.push(r?pwCardHtml(pwPick(PW.raids),true,false):pwCardHtml(pwPick(PW.pals),false,false))}}return out}',
    'function pwSpin(){if(PWBUSY||!PW||!PW.open||PWLOCK>Date.now())return;PWBUSY=true;pwGoLabel();$("pwRes").classList.add("hidden");',
    'api("/api/palwheel/spin",{}).then(function(j){setBal(j.balance);pwLockStart();',
    'pwRollEl("pwStrip","pwWrap",pwStrip1(j.item),function(){pwDone(j)})',
    '}).catch(function(e){PWBUSY=false;pwGoLabel();toast("❌ "+e.message)})}',
    'function pwDone(j){PWBUSY=false;pwGoLabel();var it=j.item;var res=$("pwRes");',
    'res.classList.remove("hidden");if(it.raid)res.classList.add("raidwin");else res.classList.remove("raidwin");',
    'res.innerHTML=(it.raid?"🔥 TRÚNG BOSS RAID! ":"🎉 Trúng ")+"<b style=\\"font-size:17px\\">"+esc(it.name)+"</b>"+(it.raid?" <span style=\\"color:#ff9f5c;font-weight:700\\">PAL RAID</span>":"")+(it.dex?" <span class=\\"muted\\">#"+it.dex+"</span>":"")+"<div class=\\"muted\\" style=\\"font-size:12px;margin-top:4px\\">Đã vào 🎒 RƯƠNG - qua tab 🪪 Cá nhân để 💰 bán hoặc 🎁 nhận vào game</div>";',
    'if(it.raid)toast("🔥🔥 CỰC HIẾM! Bạn quay trúng BOSS RAID "+it.name+" — khác hẳn pal thường!");',
    'if(j.potWin)toast("💥🏆 NỔ HŨ QUAY PAL +"+vnd(j.potWin)+" Dogcoin!");',
    'if(j.luckJustFull)toast("🍀 ĐẦY THANH MAY MẮN! Kéo xuống quay 🔥 VÒNG RAID nhận boss + thưởng Dogcoin!");',
    'pwSync(true,false)}',
    '',
    // ===== 🍀 THANH MAY MẮN + 🔥 VÒNG QUAY RAID (27/08) =====
    'function pwRenderLuck(){if(!PW)return;var l=Math.max(0,Math.min(100,PW.luck||0));',
    '$("pwLuckFill").style.width=l+"%";$("pwLuckPct").textContent=l+"%";',
    '$("pwLuckTix").innerHTML=PW.raidReady?"<span style=\\"color:#ffcf5c;font-weight:800\\">🔥 ĐỦ 100%! quay vòng RAID</span>":(PW.raidWheelOn?("<span class=\\"muted\\">còn "+(100-l)+"% nữa</span>"):"<span class=\\"muted\\">vòng RAID đang tắt</span>");',
    'var box=$("pwRaidBox");if(PW.raidWheelOn)box.classList.remove("hidden");else box.classList.add("hidden");',
    'if(PW.raidWheelOn){var rp=PW.raidWheelPals||[];',
    '$("pwRaidStat").textContent=rp.length+" boss · thưởng "+vnd(PW.raidBonus)+" Dogcoin";',
    '$("pwRaidInfo").innerHTML="Đầy <b>100%</b> may mắn mới quay được. Chỉ toàn boss RAID: "+rp.map(function(p){return esc(p.name)}).join(", ")+". Trúng 1 boss + <b style=\\"color:#7cff9c\\">"+vnd(PW.raidBonus)+"</b> Dogcoin. Quay xong thanh may mắn <b>về 0</b>.";}',
    'pwGoLabel()}',
    'function pwRaidIdle(){if(!PW||!PW.raidWheelPals||!PW.raidWheelPals.length)return;var h="";for(var i=0;i<14;i++)h+=pwCardHtml(pwPick(PW.raidWheelPals),true,false);',
    'var s=$("pwRaidStrip");if(!s)return;s.style.transition="none";s.style.transform="translateX(0px)";s.innerHTML=h}',
    'function pwRaidStrip1(it){var out=[];for(var i=0;i<60;i++)out.push(pwCardHtml(i===52?it:pwPick(PW.raidWheelPals),true,i===52));return out}',
    'function pwRaidSpin(){if(PWRBUSY||!PW||!PW.raidReady||PWLOCK>Date.now())return;PWRBUSY=true;pwGoLabel();$("pwRaidRes").classList.add("hidden");',
    'api("/api/palwheel/raidspin",{}).then(function(j){setBal(j.balance);pwLockStart();',
    'pwRollEl("pwRaidStrip","pwRaidWrap",pwRaidStrip1(j.item),function(){pwRaidDone(j)})',
    '}).catch(function(e){PWRBUSY=false;pwGoLabel();toast("❌ "+e.message)})}',
    'function pwRaidDone(j){PWRBUSY=false;pwGoLabel();var it=j.item;',
    '$("pwRaidRes").classList.remove("hidden");',
    '$("pwRaidRes").innerHTML="🔥🍀 TRÚNG <b style=\\"font-size:18px;color:#ff9f5c\\">"+esc(it.name)+"</b>"+(it.dex?" <span class=\\"muted\\">#"+it.dex+"</span>":"")+(j.bonus?" <span style=\\"color:#7cff9c;font-weight:800\\">+"+vnd(j.bonus)+" Dogcoin</span>":"")+"<div class=\\"muted\\" style=\\"font-size:12px;margin-top:4px\\">Boss vào 🎒 RƯƠNG - qua tab 🪪 Cá nhân để nhận vào game. Thanh may mắn đã về 0.</div>";',
    'toast("🔥 Trúng boss RAID "+it.name+(j.bonus?" + "+vnd(j.bonus)+" Dogcoin":"")+"!");',
    'pwSync(false,true)}',
    '',
    // ===== 🎯 CHỌN PAL ĐÍCH DANH =====
    'var PK=null,PKBUSY=false;',
    'function pkSync(){api("/api/palpick/state").then(function(j){PK=j;',
    '$("pkStat").textContent=vnd(j.price)+" Dogcoin/con · rương có "+j.chestCount+" pal";',
    '$("pkPot").innerHTML="🏆 Hũ quay pal: <b>"+vnd(j.pot)+"</b> Dogcoin - mua đích danh cũng nuôi hũ 5% và có 1% nổ";',
    'pkRender()}).catch(function(e){toast("❌ "+e.message)})}',
    'function pkRender(){if(!PK)return;var q=($("pkFind").value||"").toLowerCase();',
    'var h="";PK.list.forEach(function(p){',
    'if(q&&(p.name+" #"+p.dex).toLowerCase().indexOf(q)<0)return;',
    // boss raid: viền đỏ nổi bật + giá riêng từng con (26/08)
    'var st=p.raid?"border:1px solid var(--red);border-radius:8px;margin:4px;background:#1d1420":"";',
    'h+="<div class=\\"pcmP\\" style=\\"display:flex;align-items:center;gap:8px;cursor:default;"+st+"\\"><b>"+esc(p.name)+"</b>"+(p.raid?" <span style=\\"color:#ff8f8f;font-size:11px;font-weight:700\\">🔥 BOSS RAID</span>":"")+(p.dex?"<span class=\\"muted\\" style=\\"font-size:11px\\">#"+p.dex+"</span>":"")+"<span style=\\"flex:1\\"></span><button style=\\"padding:5px 10px;font-size:12px;background:linear-gradient(180deg,#2f8f4f,#256e3e)\\" onclick=\\"pkBuy(\'"+p.code+"\')\\">🎯 Mua "+vnd(p.price||PK.price)+"</button></div>"});',
    '$("pkList").innerHTML=h||"<div class=\\"muted\\" style=\\"padding:10px\\">Không thấy pal nào khớp.</div>"}',
    'function pkBuy(code){if(PKBUSY||!PK)return;var p=null;PK.list.forEach(function(x){if(x.code===code)p=x});if(!p)return;',
    'if(!confirm("Mua đích danh "+p.name+(p.raid?" (BOSS RAID)":"")+" với "+vnd(p.price||PK.price)+" Dogcoin? Pal sẽ vào 🎒 RƯƠNG."))return;',
    'PKBUSY=true;api("/api/palpick/buy",{code:code}).then(function(j){PKBUSY=false;setBal(j.balance);',
    // chủ server chốt 25/08: KHÔNG bật bảng chọn ngay - pal về rương, nhắn rõ chỗ nhận là đủ
    'toast("🎯 Đã mua "+j.item.name+" - pal nằm trong 🎒 RƯƠNG (tab 🪪 Cá nhân), vào đó chọn linh hồn + passive rồi nhận");',
    'if(j.potWin)toast("💥🏆 NỔ HŨ +"+vnd(j.potWin)+" Dogcoin!");',
    'pkSync()}).catch(function(e){PKBUSY=false;toast("❌ "+e.message)})}',
    '',
    // ===== 🎒 RƯƠNG PAL (trang Hồ sơ) =====
    'var PC=null,PCIT=null,PCBUSY=false;',
    // cb: mua/quay xong gọi pcSync(function(){pcOpen(id)}) để bật ngay bảng chọn linh hồn+passive
    'function pcSync(cb){api("/api/profile").then(function(j){PC=j;',
    'var inChest=0;j.chest.forEach(function(i){if(i.status==="chest")inChest++});',
    '$("pcStat").textContent=inChest+" pal trong rương";',
    '$("pcLink").innerHTML=j.ingameName?("Nhân vật liên kết: <b>"+esc(j.ingameName)+"</b> - bấm 🎁 Nhận là giao thẳng vào game (phải đang online trong game)"):"⚠️ Chưa liên kết tên nhân vật - nhắn <b>admin</b> liên kết rồi mới NHẬN pal được (bán thì vẫn bán được)";',
    'var h="";j.chest.forEach(function(it){',
    'var acts;',
    'if(it.status==="chest")acts="<button style=\\"background:linear-gradient(180deg,#ffd76a,#e0ac3f);color:#241d0a\\" onclick=\\"pcSell("+it.id+")\\">💰 Bán "+vnd(j.sellPrice)+"</button><button style=\\"background:linear-gradient(180deg,#2f8f4f,#256e3e)\\" onclick=\\"pcOpen("+it.id+")\\">🎁 Nhận vào game</button>";',
    'else if(it.status==="delivering")acts="<span class=\\"tag wait\\">⏳ ĐANG GIAO - admin đang kiểm</span>";',
    'else if(it.status==="sold")acts="<span class=\\"tag\\">ĐÃ BÁN</span>";',
    'else acts="<span class=\\"tag\\">✅ ĐÃ NHẬN"+(it.deliveredTo?" → "+esc(it.deliveredTo):"")+"</span>";',
    'var img=it.code?("<img src=\\"/palimage/T_"+it.code+"_icon_normal.png\\" alt=\\"\\" onerror=\\"this.style.display=\'none\'\\">"):"";',
    'h+="<div class=\\"pcItem"+(it.raid?" raid":"")+"\\"><div class=\\"pcTop\\">"+img+"<div class=\\"pcMeta\\"><div><span class=\\"nm\\">"+esc(it.name)+"</span> "+(it.raid?"<span class=\\"tag raid\\">RAID</span> ":"")+(it.dex?"<span class=\\"tag\\">#"+it.dex+"</span>":"")+"</div><div class=\\"tm\\">"+esc(it.wonAt||"")+"</div></div></div><div class=\\"pcActs\\">"+acts+"</div></div>"});',
    '$("pcList").innerHTML=h||"<div class=\\"muted\\">Rương trống - qua tab 🎁 Quay Pal thử vận may!</div>";',
    'if(cb)cb()',
    '}).catch(function(e){toast("❌ "+e.message)})}',
    'function pcSell(id){if(!PC)return;if(!confirm("Bán pal này lấy "+vnd(PC.sellPrice)+" Dogcoin? Không hoàn tác được."))return;',
    'api("/api/pal/sell",{id:id}).then(function(j){setBal(j.balance);toast("💰 +"+vnd(j.sold)+" Dogcoin");pcSync()}).catch(function(e){toast("❌ "+e.message)})}',
    'function pcOpen(id){if(!PC)return;PCIT=null;PC.chest.forEach(function(i){if(i.id===id)PCIT=i});if(!PCIT)return;',
    'if(!PC.ingameName)return toast("⚠️ Chưa liên kết tên nhân vật - nhắn admin trước đã");',
    '$("pcmTitle").textContent="🎁 Nhận "+PCIT.name;',
    '$("pcmBase").innerHTML="Mặc định: <b>Lv "+PC.level+"</b> · <b>"+PC.stars+" sao</b> · <b>IV 100</b> cả 3 chỉ số"+(PC.boss?" · bản <b>PAL BOSS</b>":"");',
    '$("pcmSoulMax").textContent=PC.soulMax;',
    // mỗi dòng linh hồn: tick chọn + THANH KÉO % RIÊNG (26/08 - mua Công 201% mà Máu 102% được)
    'var souls=[["atk","💥 Damage (Tấn công)"],["def","🛡️ Thủ (Phòng thủ)"],["hp","❤️ Máu"],["work","⚒️ Tốc độ làm việc"]];',
    'var sb0=PC.soulPct||60;',
    '$("pcmSouls").innerHTML=souls.map(function(s){return "<div class=\\"pcmSoul\\" style=\\"flex-wrap:wrap\\">"',
    '+"<label style=\\"display:flex;align-items:center;gap:8px;flex:1;cursor:pointer\\"><input type=\\"checkbox\\" value=\\""+s[0]+"\\" onchange=\\"pcSoulLim(this)\\"> "+s[1]+"</label>"',
    '+"<b style=\\"margin-left:auto\\"><span id=\\"ss_"+s[0]+"\\">"+sb0+"</span>%</b>"',
    '+"<input type=\\"range\\" id=\\"sr_"+s[0]+"\\" min=\\""+sb0+"\\" max=\\"201\\" step=\\"3\\" value=\\""+sb0+"\\" oninput=\\"pcUpCalc()\\" disabled style=\\"width:100%;margin-top:4px\\">"',
    '+"<span class=\\"muted\\" id=\\"sc_"+s[0]+"\\" style=\\"font-size:11px;width:100%\\"></span>"',
    '+"</div>"}).join("");',
    '$("pcmPassMax").textContent=(PC.passiveMax||4);$("pcmPkMax").textContent=8;',
    '$("pcmSoulMax").textContent=PC.soulMax||4;',
    // thanh IV: min = mức gốc miễn phí admin đặt, reset về gốc mỗi lần mở
    '["pcmIvH","pcmIvA","pcmIvD"].forEach(function(id){var e=$(id);e.min=PC.ivs||100;e.value=PC.ivs||100});',
    'pcUpCalc();',
    // danh sách passive: xếp bậc cao trước, tên tô MÀU THEO BẬC, chú thích kế bên, bấm chọn
    'PCSEL={};$("pcmPk").textContent="0";',
    'PCGENDER=0;$("pcmGM").classList.remove("on");$("pcmGF").classList.remove("on");',
    // màu giống trong game: trắng (bậc 1-2) · vàng (bậc 3) · xanh ngọc (bậc 4) · đỏ (có mặt trái)
    'var rows=PC.passives.slice().sort(function(a,b){return (b.tier||1)-(a.tier||1)});',
    '$("pcmPass").innerHTML=rows.map(function(p){var c=p.bad?"#ff7a7a":(p.tier===4?"#3fe0cf":(p.tier===3?"#ffd76a":"#e8ecf5"));',
    // 🌈 passive Cây Thế Giới: tên màu cầu vồng + giá bán ngay cạnh
    'var nameHtml=p.wt?("<b class=\\"pwt\\">"+esc(p.name)+"</b> <span style=\\"color:var(--gold);font-size:10px\\">💎 "+vnd((PC.up&&PC.up.wt)||1000)+"</span>"):("<b style=\\"color:"+c+"\\">"+esc(p.name)+"</b>");',
    'return "<div class=\\"pcmP\\" id=\\"pp_"+p.id+"\\" data-t=\\""+esc((p.name+" "+p.desc).toLowerCase())+"\\" onclick=\\"pcPassTog(\'"+p.id+"\')\\"><input type=\\"checkbox\\" class=\\"ppcb\\" tabindex=\\"-1\\">"+nameHtml+(p.unsure?" <span style=\\"color:#ffcf5c;font-size:10px\\">⚠</span>":"")+" <span class=\\"pd\\">"+esc(p.desc)+"</span></div>"}).join("");',
    'var ff=$("pcmFind");if(ff){ff.value="";pcPassFilter()}',
    'PCBK="";pcBuildsRender();pcChipsRender();',
    '$("pcModal").classList.remove("hidden")}',
    // Hàng nút build: bộ của SERVER + bộ RIÊNG (⭐, có nút ✕ xoá) + nút lưu bộ mới.
    // Bộ đang chọn sáng viền vàng (PCBK); tự tay đổi passive thì tắt sáng (đã lệch bộ).
    'var PCBK="";',
    'function pcBuildsRender(){if(!PC)return;var h="";',
    '(PC.builds||[]).forEach(function(b,i){h+="<button class=\\"pcb"+(PCBK==="s"+i?" on":"")+"\\" onclick=\\"pcBuild(\'s\',"+i+")\\">"+esc(b.name)+"</button>"});',
    '(PC.myBuilds||[]).forEach(function(b,i){h+="<button class=\\"pcb my"+(PCBK==="m"+i?" on":"")+"\\" onclick=\\"pcBuild(\'m\',"+i+")\\">⭐ "+esc(b.name)+"</button><button class=\\"pcb x\\" title=\\"Xoá build này\\" onclick=\\"pcBuildDel("+i+")\\">✕</button>"});',
    'h+="<button class=\\"pcb add\\" onclick=\\"pcBuildSave()\\">➕ Lưu build của tôi</button>";',
    '$("pcmBuilds").innerHTML=h}',
    // bấm build: xoá lựa chọn cũ, tick đủ passive của bộ (id lạ tự bỏ qua), nút sáng lên
    'function pcBuild(k,i){var arr=k==="m"?(PC.myBuilds||[]):(PC.builds||[]);var b=arr[i];if(!b)return;',
    'PCSEL={};PCBK=k+i;',
    '[].slice.call($("pcmPass").children).forEach(function(el){el.classList.remove("sel")});',
    'b.ids.forEach(function(id){if(Object.keys(PCSEL).length>=8)return;var el=$("pp_"+id);if(el){PCSEL[id]=1;el.classList.add("sel")}});',
    '[].slice.call($("pcmPass").children).forEach(function(el2){var cb2=el2.querySelector(".ppcb");if(cb2)cb2.checked=el2.classList.contains("sel")});',
    '$("pcmPk").textContent=Object.keys(PCSEL).length;pcBuildsRender();pcPassFilter();pcChipsRender();pcUpCalc();',
    'toast("⚡ Đã chọn bộ "+b.name+" ("+Object.keys(PCSEL).length+" passive) - nhớ tick thêm linh hồn")}',
    // lưu bộ đang chọn thành build riêng (đặt tên qua hộp thoại), trùng tên = ghi đè
    'function pcBuildSave(){var ids=Object.keys(PCSEL);if(!ids.length)return toast("Chọn passive trước rồi hãy lưu");',
    'var nm=prompt("Đặt tên cho build này (tối đa 24 ký tự):");if(!nm||!nm.trim())return;',
    'api("/api/pal/build/save",{name:nm.trim(),ids:ids}).then(function(j){PC.myBuilds=j.myBuilds;pcBuildsRender();toast("⭐ Đã lưu build "+nm.trim())}).catch(function(e){toast("❌ "+e.message)})}',
    'function pcBuildDel(i){var b=(PC.myBuilds||[])[i];if(!b)return;',
    'if(!confirm("Xoá build ⭐ "+b.name+"?"))return;',
    'api("/api/pal/build/del",{name:b.name}).then(function(j){PC.myBuilds=j.myBuilds;if(PCBK==="m"+i)PCBK="";pcBuildsRender();toast("🗑️ Đã xoá build "+b.name)}).catch(function(e){toast("❌ "+e.message)})}',
    // Hiển thị danh sách passive theo trạng thái (25/08, góp ý chủ server):
    // - ĐỦ 4 con đã chọn -> CHỈ hiện 4 con đó (dễ soát, khỏi cuộn tìm), ẩn ô tìm kiếm
    // - chưa đủ 4 -> hiện đầy đủ + lọc theo ô 🔎 như thường
    'function pcPassFilter(){var full=Object.keys(PCSEL).length>=8;',
    'var q=($("pcmFind").value||"").toLowerCase();',
    '[].slice.call($("pcmPass").children).forEach(function(el){',
    'if(full){el.style.display=el.classList.contains("sel")?"":"none"}',
    'else{el.style.display=(!q||(el.getAttribute("data-t")||"").indexOf(q)>=0)?"":"none"}});',
    'var ff=$("pcmFind");if(ff)ff.style.display=full?"none":"";',
    'var fh=$("pcmFull");if(fh)fh.classList.toggle("hidden",!full)}',
    // 💎 tính phụ phí nâng cấp - GƯƠNG của công thức server (palUpSoulCost/palUpIvCost/palUpPassiveCost)
    'var PCUP=0;',
    'function pcUpSoulStep(p){var s=(PC&&PC.up&&PC.up.soul)||[1000,1500,2500,3500,6000];return p<=72?s[0]:p<=81?s[1]:p<=90?s[2]:p<=102?s[3]:s[4]}',
    // GƯƠNG công thức server: %linh hồn tính MỖI 1% (1 nấc 3% = x3 giá), TỪNG DÒNG riêng;
    // thêm dòng cấp số nhân (dòng 2 = soulLine, dòng 3 = x2, dòng 4 = x4); IV 3 chỉ số riêng.
    'function pcSoulLineCost(sp,base){var c=0;for(var p=base+3;p<=sp;p+=3)c+=3*pcUpSoulStep(p);return c}',
    'var SOUL_LBL={atk:"💥 Tấn công",def:"🛡️ Phòng thủ",hp:"❤️ Máu",work:"⚒️ Làm việc"};',
    'function pcUpCalc(){if(!PC)return;var base=PC.soulPct||60,bi=PC.ivs||100,up=PC.up||{};',
    '$("pcmIvBase").textContent=bi;',
    'var ih=parseInt($("pcmIvH").value)||bi,ia=parseInt($("pcmIvA").value)||bi,idf=parseInt($("pcmIvD").value)||bi;',
    '$("pcmIvHShow").textContent=ih;$("pcmIvAShow").textContent=ia;$("pcmIvDShow").textContent=idf;',
    'var sc=0,lines=0,soulRows=[];',
    '["atk","def","hp","work"].forEach(function(k){',
    'var cb=$("pcmSouls").querySelector("input[value="+k+"]"),r=$("sr_"+k);if(!cb||!r)return;',
    'var on=cb.checked;r.disabled=!on;if(!on){r.value=base}',
    'var sp=parseInt(r.value)||base;$("ss_"+k).textContent=sp;',
    'var c1=on?pcSoulLineCost(sp,base):0;',
    '$("sc_"+k).textContent=on?(c1?("💎 +"+vnd(c1)):"gốc miễn phí"):"";',
    'if(on){lines++;sc+=c1;soulRows.push({k:k,sp:sp,c:c1})}});',
    'var lc=0;for(var k2=2;k2<=lines;k2++)lc+=(up.soulLine||0)*Math.pow(2,k2-2);',
    'var ivc=(Math.max(0,ih-bi)+Math.max(0,ia-bi)+Math.max(0,idf-bi))*(up.iv||0);',
    'var pk=Object.keys(PCSEL).length,pc=0,pr={5:up.slot5||0,6:up.slot6||0,7:up.slot7||0,8:up.slot8||0};',
    'for(var i=Math.max(5,(PC.passiveMax||4)+1);i<=pk;i++)pc+=pr[i]||0;',
    'var wtn=0;(PC.passives||[]).forEach(function(pp){if(pp.wt&&PCSEL[pp.id])wtn++});',
    'var wtc=wtn*(up.wt||0);',
    '$("pcmLineCost").textContent=lc?("💎 phí thêm dòng ("+lines+" dòng): +"+vnd(lc)):"";',
    '$("pcmIvCost").textContent=ivc?("💎 phụ phí IV: +"+vnd(ivc)+" ("+vnd(up.iv||0)+"/điểm mỗi chỉ số)"):"gốc miễn phí";',
    '$("pcmPassCost").textContent=pc?("💎 +"+vnd(pc)):"";',
    'PCUP=sc+lc+ivc+pc+wtc;',
    // 🧾 tổng kết: mua gì, tốn gì - từng dòng một, phí bên phải
    'var line=function(l,v){return "<div class=\\"sline\\"><span class=\\"muted\\">"+l+"</span><b>"+v+"</b></div>"};',
    'var sum=line("Pal",esc(PCIT?PCIT.name:"?")+(PC.boss?" · BOSS":"")+" · Lv"+(PC.level||80)+" · "+(PC.stars||4)+"⭐");',
    'soulRows.forEach(function(s){sum+=line("💠 Linh hồn "+SOUL_LBL[s.k]+" +"+s.sp+"%",s.c?"+"+vnd(s.c):"miễn phí")});',
    'if(!soulRows.length)sum+=line("💠 Linh hồn","<span style=\\"color:var(--red)\\">chưa chọn dòng nào</span>");',
    'if(lc)sum+=line("💠 Phí thêm dòng ("+lines+" dòng)","+"+vnd(lc));',
    'sum+=line("🧬 IV Máu/Công/Thủ",ih+" / "+ia+" / "+idf+(ivc?" · +"+vnd(ivc):" · miễn phí"));',
    'sum+=line("✨ Passive "+pk+" con",pc?"+"+vnd(pc):(pk?"miễn phí":"game tự random"));',
    'if(wtn)sum+=line("🌈 Passive Cây Thế Giới x"+wtn,"+"+vnd(wtc));',
    '$("pcmSumBody").innerHTML=sum;',
    '$("pcmUpTotal").innerHTML=PCUP?("💎 Tổng phụ phí: <b style=\\"color:var(--gold)\\">"+vnd(PCUP)+"</b> Dogcoin (trừ ví khi nhận, giao hụt tự hoàn) · Ví: "+vnd(BAL)):"✅ Đang ở mức gốc, không tốn phụ phí · Ví: "+vnd(BAL)}',
    'function pcSoulLim(cb){var n=$("pcmSouls").querySelectorAll("input:checked").length;',
    'if(n>PC.soulMax){cb.checked=false;toast("Chỉ được chọn tối đa "+PC.soulMax+" dòng linh hồn")}pcUpCalc()}',
    'var PCSEL={};',
    'function pcPassTog(id){var el=$("pp_"+id);if(!el)return;',
    'if(PCSEL[id]){delete PCSEL[id];el.classList.remove("sel")}',
    'else{if(Object.keys(PCSEL).length>=8)return toast("Tối đa 8 ô passive - bỏ bớt rồi chọn tiếp");PCSEL[id]=1;el.classList.add("sel")}',
    'var cb0=el.querySelector(".ppcb");if(cb0)cb0.checked=!!PCSEL[id];',
    'if(PCBK){PCBK="";pcBuildsRender()}', // tự tay đổi passive -> đã lệch bộ, tắt nút sáng
    '$("pcmPk").textContent=Object.keys(PCSEL).length;pcPassFilter();pcChipsRender();pcUpCalc()}',
    // hàng chip passive đã chọn — luôn hiện dù cuộn list, ✕ để bỏ (màu theo bậc/Cây Thế Giới)
    'function pcChipsRender(){var box=$("pcmChips");if(!box||!PC)return;var ids=Object.keys(PCSEL);',
    'if(!ids.length){box.innerHTML="<span class=\\"muted\\" style=\\"font-size:11.5px\\">Chưa chọn passive nào — bấm trong danh sách bên dưới</span>";return}',
    'var map={};(PC.passives||[]).forEach(function(p){map[p.id]=p});',
    'box.innerHTML=ids.map(function(id){var p=map[id]||{name:id};var c=p.wt?"#c9a2ff":(p.tier===4?"#3fe0cf":(p.tier===3?"#ffd76a":(p.bad?"#ff7a7a":"#e8ecf5")));',
    'return "<span class=\\"pchip\\" style=\\"border-color:"+c+"\\"><b style=\\"color:"+c+"\\">"+esc(p.name||id)+"</b><span class=\\"x\\" title=\\"bỏ chọn\\" onclick=\\"pcPassTog(\'"+id+"\')\\">✕</span></span>"}).join("")}',
    'function pcClose(){$("pcModal").classList.add("hidden");PCIT=null}',
    // 🚻 giới tính: 0=chưa chọn, 1=Đực, 2=Cái. Bắt buộc chọn mới nhận được.
    'var PCGENDER=0;',
    'function pcGenderPick(g){PCGENDER=g;$("pcmGM").classList.toggle("on",g===1);$("pcmGF").classList.toggle("on",g===2)}',
    'function pcClaimGo(){if(!PCIT||PCBUSY)return;',
    'var souls=[].slice.call($("pcmSouls").querySelectorAll("input:checked")).map(function(c){return c.value});',
    'if(souls.length<1)return toast("💠 Chọn ít nhất 1 dòng linh hồn trước đã (dòng đầu miễn phí)");',
    'if(PCGENDER!==1&&PCGENDER!==2)return toast("🚻 Chọn giới tính ♂ Đực hoặc ♀ Cái trước đã");',
    'var passives=Object.keys(PCSEL);',
    'if(PCUP>0&&!confirm("💎 Nâng cấp vượt trần tốn "+vnd(PCUP)+" Dogcoin, trừ ví ngay khi nhận (giao hụt tự hoàn). Đồng ý?"))return;',
    'PCBUSY=true;var b=$("pcmOk");b.disabled=true;b.textContent="⏳ Đang giao... (có thể mất 1-2 phút, ĐỪNG tắt trang)";',
    'api("/api/pal/claim",{id:PCIT.id,souls:souls,passives:passives,gender:PCGENDER,',
    'soulHpPct:parseInt($("sr_hp").value)||0,soulAtkPct:parseInt($("sr_atk").value)||0,soulDefPct:parseInt($("sr_def").value)||0,soulWorkPct:parseInt($("sr_work").value)||0,',
    'ivHp:parseInt($("pcmIvH").value)||0,ivAtk:parseInt($("pcmIvA").value)||0,ivDef:parseInt($("pcmIvD").value)||0}).then(function(j){',
    'PCBUSY=false;b.disabled=false;b.textContent="✅ NHẬN VÀO GAME";pcClose();toast(j.message||"✅ Đã giao!");pcSync()',
    '}).catch(function(e){PCBUSY=false;b.disabled=false;b.textContent="✅ NHẬN VÀO GAME";toast("❌ "+e.message);pcSync()})}',
    '',
    // Safari trên iPhone vẫn cho chụm 2 ngón dù CSS đã cấm - nó dùng sự kiện riêng
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
