// ===== CỔNG WEB CƯỢC CHO NGƯỜI CHƠI (Big Small) =====
// Chạy CỔNG RIÊNG (mặc định 3002), tách hẳn panel admin (150899).
// Đăng nhập: Discord ID + mã PIN (bot phát PIN qua nút 🌐 trên bảng Big Small).
// TOÀN BỘ thao tác Big Small ở đây: đặt cược + NẶN XÍ NGẦU (kéo CHÉN che 3 viên - 14/09 đổi từ tờ giấy).
// 15 giây cuối ván khóa sổ, xí ngầu lắc ngầm - ai kéo chén người đó thấy riêng,
// hết giờ tự mở + trả tiền. Cược đi thẳng vào txState của bot nên bảng Discord
// vẫn hiển thị như thường, không dính deadline 3 giây / rate limit của Discord.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
// Đặt tên nodePath, KHÔNG phải path: trong handler bên dưới có `const path = url.pathname`
// (chuỗi) đè mất mô-đun -> path.join() nổ "is not a function" -> /poker/ trả 500. Đã dính.
const nodePath = require('path');
// 🃏 GIẢI POKER nhúng chung cổng này (chủ server chốt "xài chung 1 link"): trang là FILE HTML
// thật ở ../Poker/trang.html, phục vụ tại /poker/ ; ảnh lá ở /poker/bai/*.webp ; API ở /api/poker/*.
// Cùng cổng = cùng origin = trang poker đọc chung play_token, không đăng nhập lần hai.
// POKER_DIR: bản test chạy từ Desktop/bialk-test/ (chỉ chép 7 file BotDoMin) nên ../Poker không có
// -> bialk-test.js đặt biến này trỏ về repo. Prod chạy trong repo thì mặc định ../Poker là đúng.
const POKER_DIR = process.env.POKER_DIR || nodePath.join(__dirname, '..', 'Poker');
// 🀄 Tiến Lên dùng CHUNG 53 ảnh lá bài với Poker (POKER_DIR/bai/) — đừng nhân đôi thư mục ảnh.
const TIENLEN_DIR = process.env.TIENLEN_DIR || nodePath.join(__dirname, '..', 'TienLen');

// Toàn bộ ảnh + âm thanh gom ở assets.js (tự quét thư mục assets/) - thêm file mới
// chỉ cần thả vào thư mục đó, không phải đụng vào file này nữa.
const ASSETS = require('./assets');

function startWebPlay(ctx) {
    const PORT = ctx.port || 3002;
    // 17/09: admin chỉnh giây NẶN ở panel -> phải đọc lại mỗi lần, không chốt lúc khởi động.
    // index.js nay truyền HÀM; vẫn nhận số để bản cũ không vỡ.
    const LOCK_S = () => (typeof ctx.lockSeconds === 'function' ? ctx.lockSeconds() : (ctx.lockSeconds || 15));
    // ⚡ Chỉ gửi xuống trang những ô nhân ĐÃ RA TRÚNG. Ván CŨ (ghi trước bản vá) còn
    // nguyên bảng nhân đầy đủ trong DB — lọc ở đây thì chúng hiện đúng ngay, khỏi
    // chờ trôi. Danh sách ô trúng lấy từ lõi tiền, không tự đoán luật.
    const locNhanTrung = (h) => {
        const nh = h && h.nhan;
        if (!nh || !Array.isArray(h.dice) || h.dice.length !== 3) return {};
        try {
            const trung = new Set(ctx.txCuaThang ? ctx.txCuaThang(h.dice) : []);
            const r = {};
            for (const k of Object.keys(nh)) if (trung.has(k)) r[k] = nh[k];
            return r;
        } catch (e) { return {}; }
    };
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

            // 🃏 trang poker + ảnh lá bài. CHỈ 2 dạng đường dẫn, chặn mọi thứ khác (../ vân vân).
            // Đọc file MỖI LẦN gửi -> sửa trang.html là ăn ngay, không cần restart bot.
            if (req.method === 'GET' && path === '/poker') {
                res.writeHead(302, { Location: '/poker/' }); return res.end();   // cần dấu / cuối để "api/..." tương đối đúng chỗ
            }
            if (req.method === 'GET' && path === '/poker/') {
                return fs.readFile(nodePath.join(POKER_DIR, 'trang.html'), (e, b) => {
                    if (e) return sendJSON(res, 404, { ok: false, error: 'Chưa có trang poker' });
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(b);
                });
            }
            if (req.method === 'GET' && /^\/poker\/bai\/[A-Za-z0-9]{1,4}\.webp$/.test(path)) {
                return fs.readFile(nodePath.join(POKER_DIR, 'bai', path.slice('/poker/bai/'.length)), (e, b) => {
                    if (e) return sendJSON(res, 404, { ok: false, error: 'Không có lá này' });
                    res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800' });
                    res.end(b);
                });
            }

            // 🀄 trang Tiến Lên. Ảnh lá bài trỏ về THƯ MỤC ẢNH CỦA POKER (dùng chung bộ 52 lá).
            if (req.method === 'GET' && path === '/tienlen') {
                res.writeHead(302, { Location: '/tienlen/' }); return res.end();
            }
            if (req.method === 'GET' && path === '/tienlen/') {
                return fs.readFile(nodePath.join(TIENLEN_DIR, 'trang.html'), (e, b) => {
                    if (e) return sendJSON(res, 404, { ok: false, error: 'Chưa có trang Tiến Lên' });
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(b);
                });
            }
            if (req.method === 'GET' && /^\/tienlen\/bai\/[A-Za-z0-9]{1,4}\.webp$/.test(path)) {
                return fs.readFile(nodePath.join(POKER_DIR, 'bai', path.slice('/tienlen/bai/'.length)), (e, b) => {
                    if (e) return sendJSON(res, 404, { ok: false, error: 'Không có lá này' });
                    res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800' });
                    res.end(b);
                });
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

                // 🔌 15/09: mục admin TẮT thì chặn thẳng ở đây - client sửa gì cũng vô ích.
                // Chỉ chặn đường HÀNH ĐỘNG (đặt cược/mua/quay/rút), KHÔNG chặn đường xem trạng
                // thái, để trang đang mở không vỡ và người chơi vẫn rút được ván đang chơi dở.
                if (ctx.featOffList) {
                    const off = ctx.featOffList();
                    if (off.length) {
                        const HANH_DONG = [
                            ['tx', ['/api/bet']],
                            ['mine', ['/api/mines/start', '/api/mines/reveal', '/api/mines/lucky', '/api/mines/jackpot']],
                            ['stair', ['/api/stairs/start', '/api/stairs/step', '/api/stairs/lucky', '/api/stairs/jackpot']],
                            ['wheel', ['/api/wheel/ready', '/api/wheel/spin']],
                            ['stock', ['/api/stock/open', '/api/stock/auto']],
                            ['spm', ['/api/spm/bet']],
                            ['pal', ['/api/palwheel/spin', '/api/palwheel/raidspin']],
                            ['pick', ['/api/palpick/buy']],
                            ['shop', ['/api/itemshop/buy']],
                            ['dog', ['/api/dogbridge/rut', '/api/dogbridge/nap', '/api/dogbridge/napgold']],
                        ];
                        for (const [key, paths] of HANH_DONG) {
                            if (off.includes(key) && paths.includes(path)) {
                                return sendJSON(res, 403, { ok: false, error: '⛔ Mục này đang tạm khoá - admin đã tắt' });
                            }
                        }
                    }
                }

                // 🔗 18/09: CHƯA ĐƯỢC ADMIN LIÊN KẾT = KHÔNG HÀNH ĐỘNG GÌ (chủ server chốt: kể cả
                // chuyển tiền, mua shop, nạp/rút, chat, tặng rương, đổi pal...). Luật là DANH SÁCH CHỪA,
                // không phải danh sách chặn - đường mới thêm sau tự động bị chặn, khỏi quên.
                // Chừa đúng 2 loại: (1) XEM - .../state, /table, /hist, /cd, /api/state, /api/profile,
                // /api/players (trang đang mở không vỡ, admin thấy ID mà liên kết); (2) LẤY TIỀN VỀ của
                // ván/nợ đang dở - cashout/dismiss/stock close/debt pay/wheel unready (không thì tiền kẹt).
                // Điểm danh + chuyển tiền còn bị chặn lần 2 trong index.js -> Discord cũng dính.
                if (ctx.daLienKet && !ctx.daLienKet(userId)) {
                    // 'ds' = SẢNH Tiến Lên (danh sách phòng). Thêm 20/09: sảnh là màn ĐẦU TIÊN
                    // của trò chơi, chặn nó thì người chưa liên kết mở tab ra chỉ thấy lỗi mà
                    // không biết mình thiếu gì. Vẫn chỉ XEM — ngồi / tạo phòng / vote vẫn bị chặn.
                    const XEM = /\/(state|table|hist|cd|ds)$/.test(path) || ['/api/state', '/api/profile', '/api/players'].includes(path);
                    const LAY_VE = ['/api/mines/cashout', '/api/mines/dismiss', '/api/stairs/cashout', '/api/stairs/dismiss',
                        '/api/spm/cashout', '/api/spm/cancelnext', '/api/stock/close', '/api/debt/pay', '/api/wheel/unready'].includes(path);
                    if (!XEM && !LAY_VE) {
                        return sendJSON(res, 403, { ok: false, chuaLienKet: true, error: ctx.lienKetMsg ? ctx.lienKetMsg() : 'Ví của bạn chưa được liên kết tên nhân vật trong game - nhắn admin liên kết giúp.' });
                    }
                }

                // 🃏 POKER: mọi /api/poker/* giao cho mô-đun Poker/web.js. Đặt SAU cổng liên kết nên
                // người chưa liên kết chỉ qua được /api/poker/state (khớp regex XEM), còn ngồi/đánh
                // thì bị chặn sẵn — không phải viết chốt riêng. Lỗi luật chơi trả 400 kèm câu tiếng Việt.
                if (path.startsWith('/api/poker/')) {
                    if (!ctx.poker) return sendJSON(res, 503, { ok: false, error: 'Poker chưa bật' });
                    const body = req.method === 'POST' ? await readBody(req) : {};
                    return ctx.poker.xuLy({ path: path.slice('/api/poker'.length), method: req.method, body, userId }, res, sendJSON);
                }

                // 🀄 TIẾN LÊN: mọi /api/tienlen/* giao cho TienLen/web.js (SẢNH nhiều phòng — xem
                // taoSanh). Cũng đặt SAU cổng liên kết nên người chưa liên kết chỉ qua được
                //   /api/tienlen/ds           xem danh sách phòng
                //   /api/tienlen/<ma>/state   xem một phòng
                // còn /tao · /<ma>/ngoi · /<ma>/vote · /<ma>/danh… bị chặn sẵn, khỏi viết chốt riêng.
                if (path.startsWith('/api/tienlen/')) {
                    if (!ctx.tienlen) return sendJSON(res, 503, { ok: false, error: 'Tiến Lên chưa bật' });
                    const body = req.method === 'POST' ? await readBody(req) : {};
                    return ctx.tienlen.xuLy({ path: path.slice('/api/tienlen'.length), method: req.method, body, userId }, res, sendJSON);
                }

                if (path === '/api/state') {
                    const tx = ctx.getTX();
                    const me = ctx.getUserData(userId);
                    const totals = { tai: 0, xiu: 0, chan: 0, le: 0, bao: 0 };
                    // Bàn 52 cửa bấm-là-đặt nên một người bấm cả chục phát vào cùng
                    // một ô là chuyện thường -> GỘP THEO CỬA trước khi gửi, kẻo dòng
                    // "ván này bạn đặt" dài lê thê mà phản hồi cũng phình ra vô ích.
                    const myAgg = {};
                    const whoAgg = {}; // ai đang đặt ván này (gộp theo người + cửa)
                    for (const b of (tx.bets || [])) {
                        totals[b.choice] = (totals[b.choice] || 0) + b.amount;
                        if (b.userId === userId) myAgg[b.choice] = (myAgg[b.choice] || 0) + b.amount;
                        const k = b.userId + '_' + b.choice;
                        if (!whoAgg[k]) whoAgg[k] = { u: b.userId, name: b.username, choice: b.choice, amount: 0 };
                        whoAgg[k].amount += b.amount;
                    }
                    // cửa nhiều tiền lên trước cho dễ đọc
                    const my = Object.keys(myAgg).map(k => ({ choice: k, amount: myAgg[k] }))
                        .sort((a, b) => b.amount - a.amount);
                    const live = !!tx.message && tx.status !== 'stopped';
                    // phase: bet (đang nhận cược) | nhan (khoá sổ, khoe hệ số nhân, CẤM đặt)
                    //      | nan (kéo chén xem riêng) | wait
                    let phase = 'off';
                    if (live) phase = tx.status === 'betting' ? 'bet'
                        : (tx.status === 'nhan' ? 'nhan' : (tx.nan ? 'nan' : 'wait'));
                    return sendJSON(res, 200, {
                        ok: true,
                        me: userId,
                        balance: me.points || 0,
                        // 🔗 17/09: false = admin chưa liên kết tên nhân vật -> client hiện banner đỏ
                        linked: ctx.daLienKet ? !!ctx.daLienKet(userId) : true,
                        // 🧰 17/09: số món đang nằm trong Rương Ích Kỷ -> nhãn đỏ trên nút 🧰
                        ichKyTotal: ctx.ichKy ? (ctx.ichKy.state(userId).total || 0) : 0,
                        // 🏆 hũ 2 minigame gửi kèm nhịp 2 giây -> nhãn hũ trên tab luôn tươi,
                        // thấy người khác nuôi hũ mà không cần bấm sang tab đó
                        pots: {
                            mines: (ctx.mines && ctx.mines.pot) ? ctx.mines.pot() : 0,
                            stairs: (ctx.stairs && ctx.stairs.pot) ? ctx.stairs.pot() : 0,
                        },
                        // 🌪️ 14/09: hũ Bão + tỉ lệ bú hũ (1 ăn N) để trang Tài Xỉu hiện
                        featOff: ctx.featOffList ? ctx.featOffList() : [],   // 🔌 15/09: mục admin đang tắt
                        // 🃏 tab GIẢI POKER (tầng 1, nhóm thứ 3): admin bật/tắt ở panel SUPER
                        pokerOn: ctx.pokerOn ? !!ctx.pokerOn() : false,
                        // 🎲 BÀN SIC BO 52 CỬA: danh sách cửa + trần từng nhóm (vẽ bàn, chặn tại chỗ),
                        // và BẢNG NHÂN của ván đang chạy — chỉ gửi khi đã KHOÁ SỔ, không thì lộ sớm.
                        txCua: ctx.txCua ? ctx.txCua() : null,
                        txTran: ctx.txTran ? ctx.txTran() : null,
                        txNhan: (tx.nhan && tx.nhan.gameId === tx.gameId && tx.status !== 'betting') ? tx.nhan.o : null,
                        tienlenOn: ctx.tienlenOn ? !!ctx.tienlenOn() : false,   // 🀄 tab Tiến Lên hiện/ẩn
                        stxOn: (ctx.stx && ctx.stx.adminXem) ? !!ctx.stx.adminXem().on : false,  // ⚡ tab Siêu Tài Xỉu
                        txPot: ctx.txPot ? ctx.txPot() : 0,
                        txPotX: (typeof ctx.txPotX === 'function' ? ctx.txPotX() : ctx.txPotX) || 10,
                        txBaoRate: ctx.txBaoRate || 30,
                        live, phase,
                        gameId: tx.gameId,
                        targetTime: tx.targetTime,
                        txMax: ctx.txMaxBet ? ctx.txMaxBet() : 0,   // 💰 trần cược/người/ván (0 = không giới hạn)
                        // giờ server: client dùng để hiệu chỉnh lệch đồng hồ máy người chơi
                        now: Math.floor(Date.now() / 1000),
                        lockSeconds: LOCK_S(),
                        totals,
                        myBets: my,
                        // Chỉ đưa xí ngầu ra trong cửa sổ nặn - lúc này sổ ĐÃ khóa,
                        // biết trước vài giây cũng không đặt thêm được gì.
                        nan: (phase === 'nan' && tx.nan)
                            ? { gameId: tx.nan.gameId, dice: tx.nan.dice, thang: tx.nan.thang || [] }
                            : null,
                        // 4 giây cuối pha nặn là lúc chén tự rơi + bàn tô kết quả
                        txKqS: ctx.txKqS ? ctx.txKqS() : 4,
                        // có giỏ ván trước để bấm 🔁 ĐẶT LẠI không
                        txVanTruoc: ctx.txCoVanTruoc ? !!ctx.txCoVanTruoc(userId) : false,
                        betsList: Object.values(whoAgg),
                        // kèm bets/winners (có u) để client tính thắng/thua CÁ NHÂN từng ván
                        history: (tx.history || []).slice(0, 20).map(h => ({ gameId: h.gameId, dice: h.dice, sum: h.sum, tx: h.tx, cl: h.cl, storm: !!h.storm, bets: h.bets || [], winners: h.winners || [], nhan: locNhanTrung(h), huy: !!h.huy, lyDo: h.lyDo || '' })),
                        chat: chatLog().slice(-30),
                    });
                }

                // 🀫 14/09: người chơi nặn xong -> trả thưởng NGAY cho riêng họ.
                // Gọi mấy lần cũng chỉ trả 1 lần (bot tự chặn trùng), ai chưa nặn thì chưa ảnh hưởng.
                if (req.method === 'POST' && path === '/api/tx/reveal') {
                    if (!ctx.txReveal) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    return sendJSON(res, 200, ctx.txReveal(userId));
                }
                // ⚡ SIÊU TÀI XỈU — bàn thứ hai. Toàn bộ luật + tiền nằm ở
                // SieuTaiXiu/ban.js, đây chỉ chuyển tiếp và trả lỗi nguyên văn.
                if (path.indexOf('/api/stx/') === 0) {
                    const B = ctx.stx;
                    if (!B) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ Siêu Tài Xỉu' });
                    const me3 = ctx.getUserData(userId);
                    const ten = me3.name || ('web_' + userId.slice(-4));
                    if (path === '/api/stx/state') return sendJSON(res, 200, { ok: true, ...B.trangThai(userId) });
                    if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Sai cách gọi' });
                    let r = null;
                    if (path === '/api/stx/bet') {
                        const body = await readBody(req);
                        r = B.dat(userId, ten, body.gio);
                    }
                    else if (path === '/api/stx/x2') r = B.nhanDoi(userId, ten);
                    else if (path === '/api/stx/datlai') r = B.datLai(userId, ten);
                    else if (path === '/api/stx/xoacuoc') r = B.xoaCuoc(userId);
                    // 🖐️ kéo thả chip: huỷ đúng 1 ô / dời chip sang ô khác
                    else if (path === '/api/stx/xoacua') { const body = await readBody(req); r = B.xoaCua(userId, body.cua); }
                    else if (path === '/api/stx/doicua') { const body = await readBody(req); r = B.doiCua(userId, ten, body.tu, body.den); }
                    else if (path === '/api/stx/reveal') r = B.nanXong(userId);
                    else return sendJSON(res, 404, { ok: false, error: 'Không có đường này' });
                    if (r && r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
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
                    return sendJSON(res, 200, { ok: true, list: ctx.transferTargets ? ctx.transferTargets(userId) : [] });
                }
                if (req.method === 'POST' && path === '/api/transfer') {
                    if (!ctx.transfer) return sendJSON(res, 400, { ok: false, error: 'Chuyển tiền chưa bật' });
                    const body = await readBody(req);
                    const r = ctx.transfer(userId, body.toId, body.amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, balance: r.balance, toName: r.toName });
                }
                // 💸 03/09: chuyển cho NHIỀU người 1 lần (mỗi người cùng số tiền)
                if (req.method === 'POST' && path === '/api/transfer/multi') {
                    if (!ctx.transferMulti) return sendJSON(res, 400, { ok: false, error: 'Chuyển tiền chưa bật' });
                    const body = await readBody(req);
                    const r = ctx.transferMulti(userId, body.toIds, body.amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, balance: r.balance, names: r.names, total: r.total });
                }
                // ===== 🎮 NẠP/RÚT Dogcoin ↔ game qua web (28/08) =====
                if (ctx.dogbridge && path === '/api/dogbridge/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.dogbridge.state(userId) });
                }
                if (ctx.dogbridge && req.method === 'POST' && path === '/api/dogbridge/rut') {
                    const body = await readBody(req);
                    const r = await ctx.dogbridge.rut(userId, body.amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🪙 14/09: đổi VÀNG trong game -> Dogcoin web (chung giới hạn với /nap)
                if (ctx.dogbridge && ctx.dogbridge.napGold && req.method === 'POST' && path === '/api/dogbridge/napgold') {
                    const body = await readBody(req);
                    const r = await ctx.dogbridge.napGold(userId, body.gold);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.dogbridge && req.method === 'POST' && path === '/api/dogbridge/nap') {
                    const body = await readBody(req);
                    const r = await ctx.dogbridge.nap(userId, body.amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
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
                    // 🎒 16/09: kèm cờ chestFull xuống client để nút 🔁 tự động quay biết vì sao dừng
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error, chestFull: !!r.chestFull });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🍀 quay vòng RAID (tốn 1 vé đầy thanh may mắn) - 27/08
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
                // ⏳ đồng hồ cooldown nhận pal (nhẹ, client poll khi mở trang Hồ sơ)
                if (ctx.profile && ctx.profile.claimCdInfo && path === '/api/pal/cd') {
                    return sendJSON(res, 200, { ok: true, ...ctx.profile.claimCdInfo() });
                }
                // 🆘 tẩu thoát khẩn cấp (09/09)
                if (ctx.profile && ctx.profile.rescue && req.method === 'POST' && path === '/api/pal/rescue') {
                    const r = await ctx.profile.rescue(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // 🎁 15/09: quà admin tặng - danh sách riêng, không đi qua shop
                if (ctx.gift && path === '/api/gift/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.gift.state(userId) });
                }
                if (ctx.gift && req.method === 'POST' && path === '/api/gift/claim') {
                    const body = await readBody(req);
                    const r = await ctx.gift.claim(userId, body.gid);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🛒 shop item (28/08)
                if (ctx.itemshop && path === '/api/itemshop/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.itemshop.state(userId) });
                }
                if (ctx.itemshop && req.method === 'POST' && path === '/api/itemshop/buy') {
                    const body = await readBody(req);
                    // 🧰 17/09: vaoRuong = true -> bỏ vào Rương Ích Kỷ, KHÔNG cần online, không giao SFTP
                    const r = await ctx.itemshop.buy(userId, body.itemId, body.qty, body.vaoRuong === true);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }

                // ===== 🧰 RƯƠNG ÍCH KỶ (17/09) - 00:00 giờ VN là xoá sạch =====
                if (ctx.ichKy && path === '/api/ichky/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.ichKy.state(userId) });
                }
                if (ctx.ichKy && req.method === 'POST' && path === '/api/ichky/claim') {
                    const body = await readBody(req);
                    const me2 = ctx.getUserData(userId);
                    const r = await ctx.ichKy.claim(userId, String(body.itemId || ''), body.qty, me2.name || userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.ichKy && req.method === 'POST' && path === '/api/ichky/give') {
                    const body = await readBody(req);
                    const me2 = ctx.getUserData(userId);
                    const r = ctx.ichKy.give(userId, String(body.toId || ''), String(body.itemId || ''), body.qty, me2.name || userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🚀 Phi Thuyền (crash game, 28/08)
                if (ctx.spm && path === '/api/spm/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.spm.state(userId) });
                }
                if (ctx.spm && req.method === 'POST' && path === '/api/spm/bet') {
                    const body = await readBody(req);
                    const r = ctx.spm.bet(userId, body.amount, body.auto);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.spm && req.method === 'POST' && path === '/api/spm/cashout') {
                    const r = ctx.spm.cashout(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.spm && ctx.spm.cancelNext && req.method === 'POST' && path === '/api/spm/cancelnext') {
                    const r = ctx.spm.cancelNext(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🤝 11/09: bán/tặng pal cho người chơi khác
                if (ctx.profile && ctx.profile.tradeOffer && req.method === 'POST' && path === '/api/pal/trade/offer') {
                    const body = await readBody(req);
                    const r = ctx.profile.tradeOffer(userId, body.id, body.toId, body.price);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.profile && ctx.profile.tradeCancel && req.method === 'POST' && path === '/api/pal/trade/cancel') {
                    const body = await readBody(req);
                    const r = ctx.profile.tradeCancel(userId, body.tradeId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.profile && ctx.profile.tradeAccept && req.method === 'POST' && path === '/api/pal/trade/accept') {
                    const body = await readBody(req);
                    const r = ctx.profile.tradeAccept(userId, body.tradeId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (ctx.profile && req.method === 'POST' && path === '/api/pal/sell') {
                    const body = await readBody(req);
                    const r = ctx.profile.sell(userId, body.id);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🧺 16/09: bán HÀNG LOẠT - web tick checkbox rồi gửi mảng id
                if (ctx.profile && ctx.profile.sellMany && req.method === 'POST' && path === '/api/pal/sell-many') {
                    const body = await readBody(req);
                    const r = ctx.profile.sellMany(userId, body.ids);
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
                        boss: body.boss,       // 👑 07/09: bản PAL BOSS tuỳ chọn trả phí
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
                // vào state là mỗi người ngốn ~160KB MỖI 2 GIÂY - client cache 60s là đủ
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
                // 🆘 14/09: đăng lời cầu cứu ra kênh chat để người khác trả nợ giùm
                if (ctx.debt && ctx.debt.sos && req.method === 'POST' && path === '/api/debt/sos') {
                    const r = await ctx.debt.sos(userId);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
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

                // 🖐️ KÉO THẢ CHIP: huỷ đúng 1 ô / dời chip sang ô khác. Luật + tiền ở index.js.
                if (req.method === 'POST' && (path === '/api/tx/xoacua' || path === '/api/tx/doicua')) {
                    const body = await readBody(req);
                    const ham = path === '/api/tx/xoacua' ? ctx.txXoaCua : ctx.txDoiCua;
                    if (!ham) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = path === '/api/tx/xoacua' ? ham(userId, body.cua) : ham(userId, body.tu, body.den);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }

                // 🔁✖️🗑️ Ba nút thao tác nhanh. Toàn bộ luật + tiền ở index.js, đây chỉ
                // chuyển tiếp rồi trả lỗi nguyên văn cho người chơi đọc.
                if (req.method === 'POST' && (path === '/api/tx/datlai' || path === '/api/tx/x2' || path === '/api/tx/xoacuoc')) {
                    const ham = path === '/api/tx/datlai' ? ctx.txDatLai
                        : (path === '/api/tx/x2' ? ctx.txNhanDoi : ctx.txXoaCuoc);
                    if (!ham) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const me3 = ctx.getUserData(userId);
                    const r = ham(userId, me3.name || ('web_' + userId.slice(-4)));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }

                if (req.method === 'POST' && path === '/api/bet') {
                    const body = await readBody(req);
                    const tx = ctx.getTX();
                    // 🎲 GIỎ CƯỢC: bàn 52 cửa gửi nhiều ô một lần. Toàn bộ luật + tiền ở
                    // index.js (txDatLo) — hợp lệ hết mới trừ, không trừ nửa chừng.
                    if (Array.isArray(body.gio)) {
                        if (!ctx.txDatLo) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ giỏ cược' });
                        const me2 = ctx.getUserData(userId);
                        const r = ctx.txDatLo(userId, me2.name || ('web_' + userId.slice(-4)), body.gio);
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, { ok: true, ...r });
                    }
                    const choice = String(body.choice || '');
                    const amount = Math.floor(Number(body.amount));
                    // 🎲 bàn 52 cửa: danh sách cửa hợp lệ lấy THẲNG từ index.js, không gõ cứng ở đây
                    // (gõ cứng là mỗi lần thêm cửa lại quên sửa một chỗ).
                    // KHÔNG có danh sách dự phòng 5 cửa cũ: thiếu bảng cửa thì CHẶN hẳn, chứ
                    // nhận bừa 5 cửa cũ là lọt cả id 'bao' mà txDatLo đã cấm.
                    const dsCua = ctx.txCua ? ctx.txCua().map(c => c.id) : [];
                    if (!dsCua.includes(choice)) return sendJSON(res, 400, { ok: false, error: 'Cửa không hợp lệ' });
                    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Số tiền không hợp lệ' });
                    if (!tx.message || tx.status !== 'betting') {
                        return sendJSON(res, 400, {
                            ok: false,
                            error: tx.status === 'nhan' ? '⚡ Đang hiện hệ số nhân - hết cửa đặt rồi, đợi ván sau!'
                                : 'Đã khóa sổ - đợi ván sau, giờ là lúc NẶN!',
                        });
                    }
                    const me = ctx.getUserData(userId);
                    if ((me.points || 0) < amount) return sendJSON(res, 400, { ok: false, error: 'Không đủ Dogcoin! Số dư: ' + (me.points || 0).toLocaleString() });
                    // 💰 trần TỪNG CỬA + trần tổng/ván - luật ở index.js (txCapCheck), web chỉ chuyển tiếp
                    const capErr = ctx.txCapCheck ? ctx.txCapCheck(userId, amount, choice) : null;
                    if (capErr) return sendJSON(res, 400, { ok: false, error: capErr });
                    ctx.updatePoints(userId, -amount);
                    tx.bets.push({ userId, username: me.name || ('web_' + userId.slice(-4)), choice, amount });
                    tx.needsUpdate = true; // bảng Discord tự vẽ lại trong 1 giây
                    ctx.writeLog('BET', `[WEB CƯỢC TX] ${me.name || userId} đặt ${amount} vào ${choice} (ván #${tx.gameId})`);
                    // 🔔 17/09: nhắn cho chủ server. Gửi hỏng cũng KHÔNG được làm hỏng ván cược.
                    try { if (ctx.txNotifyBet) ctx.txNotifyBet(userId, me.name || ('web_' + userId.slice(-4)), choice, amount); } catch (e) { }
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
                            potMults: mines.potMults ? mines.potMults() : [10, 15, 20], open: mines.open ? mines.open() : true, minBet: typeof mines.minBet === 'function' ? mines.minBet() : (mines.minBet || 0),
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
                    // 🏆 09/09 v2: chọn 1 trong N hộp bội số sau khi trúng nổ hũ
                    if (req.method === 'POST' && path === '/api/mines/jackpot') {
                        const body = await readBody(req);
                        const r = mines.jackpotPick(userId, Math.floor(Number(body.box)) || 0);
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
                            potMults: stairs.potMults ? stairs.potMults() : [10, 15, 20], open: stairs.open ? stairs.open() : true, minBet: typeof stairs.minBet === 'function' ? stairs.minBet() : (stairs.minBet || 0),
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
                            Math.floor(Number(body.fire)), Math.floor(Number(body.bet)), !!body.extra);
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
                    if (req.method === 'POST' && path === '/api/stairs/jackpot') {
                        const body = await readBody(req);
                        const r = stairs.jackpotPick(userId, Math.floor(Number(body.box)) || 0);
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
    '.cbtn{padding:12px 0 10px;font-size:21px;font-weight:900;letter-spacing:.5px;color:#221c10;text-shadow:0 1px 0 #fff9;position:relative;',
    'background:linear-gradient(180deg,#fbf7ea 0%,#f0e9d2 55%,#ddd2b0 100%);border:1px solid #b3a67f;border-bottom:5px solid #94865e;border-radius:10px}',
    '.cbtn small{display:block;font-size:14px;font-weight:800;letter-spacing:0;color:#3d3418;margin-top:1px}',
    '.cbtn .muted{color:#8a7c55;font-size:12px;font-weight:700}',
    '.cbtn.tai small{color:#a32626}.cbtn.xiu small{color:#1d4f8f}.cbtn.chan small{color:#1d6f4f}.cbtn.le small{color:#6b3fa0}',
    // Chữ chính TÀI/XỈU/CHẴN/LẺ tô màu theo cửa (trước đây đen thui giống hệt nhau,
    // liếc nhanh rất dễ bấm nhầm CHẴN với LẺ). Cùng tông với dòng small bên dưới.
    '.cbtn.tai{color:#a32626}.cbtn.xiu{color:#1d4f8f}.cbtn.chan{color:#156b4c}.cbtn.le{color:#63389b}',
    '.cbtn.bao{margin:10px 0;font-size:23px;letter-spacing:1px;background:linear-gradient(180deg,#ffe9a8 0%,#f2d071 55%,#d3ab45 100%);border:2px solid #a8842f;border-bottom:6px solid #7d5f1e;color:#3d2c05;animation:baoPulse 2.2s ease-in-out infinite}',
    '.cbtn.bao small{color:#8a4a12;font-size:clamp(11px,3.4vw,13.5px);letter-spacing:0;padding:0 6px}',
    // 15/09: mỗi chú thích đúng 1 hàng - khoá nowrap, chữ đã co theo màn hình ở trên nên không cần cắt bớt
    '.cbtn.bao small .bl{display:block;white-space:nowrap}',
    '@keyframes baoPulse{0%,100%{box-shadow:0 0 0 0 #ffcf5c00}50%{box-shadow:0 0 16px 3px #ffcf5c77}}',
    // popup +/- tiền sau mỗi ván mình có đặt
    '#winpop{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);font-size:46px;font-weight:900;pointer-events:none;opacity:0;z-index:98;text-shadow:0 2px 14px #000c}',
    '#winpop.show{animation:winfloat 3.4s ease-out forwards}',
    // 💥🏆 11/09: NỔ HŨ QUAY PAL - lóe vàng 3 nhịp + chữ to vàng 5s + khung kết quả nhấp nháy (dùng lại mưa emoji .fx + rung .storm)
    '#jpFlash{position:fixed;inset:0;background:radial-gradient(circle at 50% 40%,#ffd76a99,#ffcf5c22 45%,#ffcf5c00 75%);pointer-events:none;opacity:0;z-index:96}',
    '#jpFlash.on{animation:jpFlash 1.1s ease-out 3}',
    '@keyframes jpFlash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}',
    '#winpop.jp{color:#ffcf5c;font-size:40px;text-align:center;line-height:1.15;text-shadow:0 0 18px #ff9f1c,0 2px 14px #000}',
    '#winpop.jp.show{animation:winfloat 5.2s ease-out forwards}',
    '.jpwin{border:2px solid #ffcf5c!important;animation:baoPulse .9s ease-in-out 8}',
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
    '.hrow{display:flex;align-items:center;gap:7px;padding:6px 0 2px;font-size:13px}',
    // dòng phụ: ⚡ ô được nhân + ô mình ăn. Tách hẳn ra cho dòng chính khỏi dài.
    // Dòng phụ là CHÚ THÍCH, không được tranh chỗ với dãy kết quả.
    '.hsub{padding:0 0 6px 2px;border-bottom:1px solid var(--line);font-size:11px;color:#6b7183;line-height:1.5}',
    '.hsub:empty{padding:0;border-bottom:1px solid var(--line)}',
    // huy hiệu hệ số nhân: nhỏ, xỉn, KHÔNG viền vàng - liếc qua là lướt được
    '.hsub .xx{display:inline-block;background:#2b2f3c;color:#b9a06a;border-radius:4px;',
    'padding:0 3px;margin-right:3px;font-weight:700;font-size:10.5px}',
    // phần MÌNH ăn mới là thứ đáng nổi
    '.hsub .an{color:#8fe0a8;font-weight:700}',
    // công tắc bật/tắt chi tiết hệ số nhân
    // 🔲 Ô tick từng bị lệch lên trên: input có margin mặc định của trình duyệt, lại
    // không cùng line-height với chữ. Ép margin 0 + line-height 1 cho hai bên bằng nhau.
    '.hTog{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer;',
    'line-height:1;',
    'user-select:none;margin:-4px 0 8px}',
    '.hTog input{width:14px;height:14px;margin:0;flex:0 0 auto;accent-color:var(--gold);',
    'vertical-align:middle;position:relative;top:0}',
    '.hrow:last-child{border-bottom:0}',
    // 🚫 ván huỷ: xám và mờ hẳn để không lẫn với dãy kết quả thật, nhưng VẪN CÓ MẶT
    // cho số ván liền mạch (trước đây biến mất luôn -> người chơi tưởng bị nuốt tiền).
    '.hrow.huy{opacity:.65;font-style:italic}',
    '.hrow.huy .kq{color:#ffb35c;font-style:normal;font-weight:800}',
    '.hrow .lydo{color:var(--muted);font-size:11.5px;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.hrow .gid{color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 auto}',
    '.hrow .dd{display:flex;gap:3px;flex:0 0 auto}',
    // inline-block để 3 viên LUÔN nằm ngang kể cả khi flex của .dd không ăn
    // (div mặc định là block - rơi vào ngữ cảnh inline là mỗi viên một dòng)
    '.mdie{display:inline-block;vertical-align:middle;width:17px;height:17px;min-width:17px;aspect-ratio:1/1;background:#f4f1e8;border-radius:4px;position:relative;flex:0 0 auto;align-self:center}',
    '.mdie .p{position:absolute;width:3.4px;height:3.4px;border-radius:50%;background:#c0392b;transform:translate(-50%,-50%)}',
    '.hrow .sum{font-weight:800;flex:0 0 auto}',
    '.hrow .kq{font-weight:700;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.hrow .kq .t{color:#ff7b86}.hrow .kq .x{color:#7db4ff}.hrow .kq .sep{color:var(--muted);font-weight:400}',
    // 14/09: CHẴN/LẺ cũng có màu riêng (trước chỉ TÀI/XỈU có màu, chẵn lẻ trắng trơn)
    '.hrow .kq .ce{color:#4fd6a0}.hrow .kq .od{color:#c79bff}',
    '#sumBadge .t,#stSumBadge .t{color:#ff7b86}#sumBadge .x,#stSumBadge .x{color:#7db4ff}#sumBadge .ce,#stSumBadge .ce{color:#4fd6a0}#sumBadge .od,#stSumBadge .od{color:#c79bff}',
    '.hrow .net{flex:0 0 auto;font-weight:800;font-variant-numeric:tabular-nums}',
    '.hrow .net.w{color:var(--green)}.hrow .net.l{color:var(--red)}',
    '.hrow.storm{background:linear-gradient(90deg,#4a3a1033,transparent);border-radius:6px;padding-left:5px}',
    '.hrow.storm .kq{color:var(--gold)}',
    '.cbtn.sel{border-color:var(--gold);border-bottom-width:2px;transform:translateY(3px);box-shadow:0 0 0 3px var(--gold),0 0 16px #ffcf5c88}',
    '.chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.chip{flex:1;background:#232735;padding:9px 0;font-size:13px;min-width:56px}',
    // 🔴 MAX CƯỢC - đỏ cho khác hẳn mấy nút mệnh giá
    '.chip.chipMax{background:linear-gradient(180deg,#8e2330,#5d141d);border-color:#c0394b;color:#ffd9de;font-weight:800}',
    '.chip.chipMax.on{background:linear-gradient(180deg,#d3374a,#96202f);border-color:#ff8a9c;color:#fff}',
    // ✨ đồng xu bay từ hàng mệnh giá vào ô vừa đặt
    '.sbBay{position:fixed;z-index:9999;pointer-events:none;transform:translate(-50%,-50%);',
    'transition:transform .5s cubic-bezier(.2,.75,.3,1),opacity .5s ease-in;',
    'display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1}',
    '.sbBay img{width:26px;height:26px;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,.7),0 0 0 2px #ffcf5c}',
    '.sbBay b{font-size:10px;font-weight:900;padding:1px 5px;border-radius:999px;background:#2a1f05;color:#ffd76a;border:1px solid #ffcf5c;white-space:nowrap}',
    '.bet-btn{width:100%;margin-top:10px;background:var(--green);color:#0c2417;font-size:17px}',
    '.bet-btn:disabled{background:#2a2e3b;color:var(--muted)}',
    '.row{display:flex;justify-content:space-between;align-items:center}',
    // 08/09: z-index 200 để nổi TRÊN mọi popup (Lộc lá 100, chọn quà 110, gmodal 120) - trước
    // đây toast lỗi trong popup bị chính popup che mất. color rõ, chữ dài tự xuống dòng.
    '#toast.err{background:#3a0f14;border-color:#e5484d;color:#ffd6d9;font-weight:700}',
    // 09/09: khung đỏ cảnh báo trần ngay trên nút NHẬN TIỀN (ván có trợ giúp đã chạm trần)
    '.capwarn{display:none;margin:8px 0;padding:10px 12px;border-radius:10px;background:#3a0f14;border:1px solid #e5484d;color:#ffd6d9;font-size:13.5px;font-weight:700;line-height:1.35;text-align:center;animation:capPulse 1.2s ease-in-out infinite}.capwarn.show{display:block}',
    '@keyframes capPulse{0%,100%{box-shadow:0 0 0 0 #e5484d00}50%{box-shadow:0 0 14px 2px #e5484d88}}',
    '#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000d;color:#fff;border:1px solid #2a3146;padding:10px 18px;border-radius:10px;font-size:14px;line-height:1.35;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90%;word-break:break-word;z-index:200}',
    '.lerr{display:none;color:#ff8a8a;background:#2a1215;border:1px solid #e5484d;border-radius:10px;padding:9px 12px;margin:8px 0;font-size:13.5px;font-weight:600;word-break:break-word}',
    // 28/08: popup xác nhận đồng bộ giống admin portal (thay confirm() mặc định nhảy lung tung)
    // 🔒 16/09: thân trang lúc có popup - fixed để iOS cũng đứng yên, top âm giữ đúng chỗ đang xem
    'body.noscroll{position:fixed;left:0;right:0;width:100%;overflow:hidden}',
    // cuộn trong hộp popup không "lây" ra trang phía sau
    '#pcBox{overscroll-behavior:contain}',
    '#gmodal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:120;padding:16px}',
    '#gmodal.hidden{display:none}',
    '#gmBox{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;width:370px;max-width:100%;box-shadow:0 12px 48px rgba(0,0,0,.6);animation:gmpop .15s ease}',
    '@keyframes gmpop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}',
    '#gmMsg{font-size:15px;line-height:1.55;margin-bottom:20px}',
    '#gmActs{display:flex;gap:10px;justify-content:flex-end}',
    '#gmActs button{min-width:100px;padding:10px 14px;font-weight:700;border-radius:9px}',
    '#gmCancel{background:#3a4155;color:#fff}',
    '.big{font-size:26px;font-weight:800}',
    '.hidden{display:none}',
    // ---- 🃏 poker TOÀN MÀN HÌNH (18/09) ----
    // #pagePoker.hidden vẫn phải tắt được: .hidden 10 điểm thua #id 100 điểm nên phải có
    // rule #pagePoker.hidden riêng, y như bẫy modal đã dính (xem README mục 11).
    '#pokerFrame{width:100%;height:calc(100vh - 150px);min-height:640px;border:0;border-radius:14px;background:#12141a}',
    'body.pokerFull{overflow:hidden}',
    'body.pokerFull #pagePoker{position:fixed;inset:0;z-index:70;background:#0d0f14}',
    'body.pokerFull #pagePoker.hidden{display:none}',
    'body.pokerFull #pokerFrame{width:100%;height:100%;min-height:0;border-radius:0}',
    '#tlFrame{width:100%;height:calc(100vh - 150px);min-height:640px;border:0;border-radius:14px;background:#12141a}',
    'body.pokerFull #pageTienlen{position:fixed;inset:0;z-index:70;background:#0d0f14}',
    'body.pokerFull #pageTienlen.hidden{display:none}',
    'body.pokerFull #tlFrame{width:100%;height:100%;min-height:0;border-radius:0}',
    '#tlOut{display:none}',
    'body.pokerFull #tlOut{display:block;position:fixed;top:8px;right:10px;z-index:72;',
    '  padding:5px 10px;font-size:12px;font-weight:800;border-radius:9px;cursor:pointer;',
    '  background:rgba(18,20,26,.82);color:#ffb4b4;border:1px solid #6b2f2f;backdrop-filter:blur(3px)}',
    '#pokerOut{display:none}',
    'body.pokerFull #pokerOut{display:block;position:fixed;top:8px;right:10px;z-index:72;',
    '  padding:5px 10px;font-size:12px;font-weight:800;border-radius:9px;cursor:pointer;',
    '  background:rgba(18,20,26,.82);color:#ffb4b4;border:1px solid #6b2f2f;backdrop-filter:blur(3px)}',
    'body.pokerFull #pokerOut:hover{background:#3a1717;color:#fff}',
    '.mine{font-size:13px;margin-top:6px;color:var(--gold)}',
    // ---- thanh chuyển trang (Big Small | Dò Mìn) ----
    // Header + nav ép mỏng (19/08): mobile đỡ phải kéo - trước đây riêng cụm đầu
    // trang đã ngốn ~150px dọc.
    '#topbar{padding:8px 12px;margin-bottom:8px;flex-wrap:wrap;gap:8px}',
    '#topbar .big{font-size:20px}',
    '#topbar .muted{font-size:11px}',
    '#topbar button{padding:8px 10px}',
    // 📒 14/09: ô NỢ nằm ngay cạnh số dư - bấm là xổ ô trả nợ ngay dưới thanh
    '#debtChip{flex:0 0 auto;white-space:nowrap;cursor:pointer;user-select:none;padding:6px 10px;border-radius:10px;border:1px solid #a33;background:linear-gradient(180deg,#3a1c1c,#2a1414);line-height:1.15;text-align:center}',
    '#debtChip .lb{font-size:10px;color:#ffb3b3;letter-spacing:.3px}',
    '#debtChip .vl{font-size:15px;font-weight:900;color:#ff8b8b}',
    '#debtChip:active{transform:translateY(1px)}',
    '#nav{display:flex;gap:6px;margin-bottom:8px}',
    '#nav button{flex:1;background:var(--card);border:1px solid var(--line);color:var(--muted);font-size:13px;padding:9px 2px}',
    '#nav button.on{background:linear-gradient(180deg,#2b3346,#222839);color:var(--tx);border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c55}',
    // 📒 14/09: tab Nợ tô ĐỎ, chỉ hiện khi đang nợ.
    // ⚠️ PHẢI viết '#nav button#navDebt' chứ không phải '#navDebt': luật '#nav button'
    // (id + thẻ = 101) mạnh hơn luật chỉ có id (100) nên sẽ đè mất màu đỏ. Bản đầu dính đúng bẫy này.
    '#nav button#navDebt{background:linear-gradient(180deg,#4a1f1f,#2e1414);border-color:#c04a4a;color:#ff9b9b;font-weight:900}',
    '#nav button#navGift{background:linear-gradient(180deg,#4a3a10,#2e2410);border-color:#c9a227;color:#ffd76a;font-weight:900}',
    '#nav button#navGift.on{background:linear-gradient(180deg,#7a5c14,#4a3a10);color:#fff3c4;border-color:#ffd76a;box-shadow:0 0 0 1px #ffd76a88}',
    '#nav button#navDebt.on{background:linear-gradient(180deg,#7a2a2a,#4a1a1a);color:#fff0f0;border-color:#ff6b6b;box-shadow:0 0 0 1px #ff6b6b88}',
    // tầng 1: 2 nút nhóm to rõ; nhóm đang chọn viền vàng
    '#navGrp{display:flex;gap:6px;margin-bottom:6px}',
    '#navGrp button{flex:1;background:#1a1f2d;border:1px solid var(--line);color:var(--muted);font-size:14px;font-weight:800;padding:11px 2px;letter-spacing:.5px}',
    '#navGrp button.on{background:linear-gradient(180deg,#33405c,#252c40);color:var(--tx);border-color:var(--gold);box-shadow:0 0 0 1px #ffcf5c55}',
    // 🎁 Quay Pal: reel kiểu CSGO (dải thẻ chạy ngang, vạch giữa là kim)
    '#pwWrap{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#141824;height:126px;margin-top:10px;touch-action:pan-y;cursor:grab;user-select:none;-webkit-user-select:none}',
    '#pwWrap.grabbing{cursor:grabbing}',
    '#pwWrap.nodrag{cursor:default}',   // đã quay 1 lượt -> hết kéo (F5 mới kéo lại)
    '#pwWrap img{-webkit-user-drag:none;pointer-events:none}',   // kéo dải không kéo nhầm ảnh
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
    // 👑 10/09: pal huyền thoại tô VÀNG (viền + tên); trúng thì phát sáng vàng
    '.pwCard.legend{border-color:#e7b53c;background:linear-gradient(180deg,#332b14,#221d10)}',
    '.pwCard.legend .nm{color:#ffd76a}',
    '.pwCard.legendhit{border-color:#ffe9a0;box-shadow:0 0 16px #ffd24a,0 0 5px #ffe9a0 inset;animation:raidGlow .7s ease-in-out infinite alternate}',
    // 💜 11/09: 16 pal TÍM (epic) - viền + tên tím; trúng thì phát sáng tím
    '.pwCard.epic{border-color:#9b6cff;background:linear-gradient(180deg,#2a1f45,#1c1530)}',
    '.pwCard.epic .nm{color:#c9a2ff}',
    '.pwCard.epichit{border-color:#e0ccff;box-shadow:0 0 16px #a97cff,0 0 5px #e0ccff inset;animation:epicGlow .7s ease-in-out infinite alternate}',
    '@keyframes epicGlow{from{box-shadow:0 0 8px #8a5cff,0 0 3px #c9a2ff inset}to{box-shadow:0 0 22px #b48cff,0 0 8px #d9c2ff inset}}',
    // 💰 15/09: Ô NỔ HŨ (Mimog) - vàng kho báu, luôn nhấp nháy để người chơi nhắm mà ngóng.
    // Không lộ kết quả: thẻ mồi trên dải cũng bốc trúng Mimog như mọi con khác.
    '.pwCard.jack{border-color:#ffd24a;background:linear-gradient(180deg,#3b2f0d,#1e2a15);animation:jackIdle 1.2s ease-in-out infinite alternate}',
    '.pwCard.jack .nm{color:#ffe98a}',
    '.pwCard.jack .dx{color:#7cff9c;font-weight:900}',
    '.pcItem.jack{border-color:#ffd24a;background:linear-gradient(180deg,#2e2510,#1a2213)}',
    '@keyframes jackIdle{from{box-shadow:0 0 6px #ffd24a77,0 0 2px #7cff9c44 inset}to{box-shadow:0 0 18px #ffd24a,0 0 7px #7cff9c66 inset}}',
    '.pwCard.jackhit{border-color:#fff3b0;z-index:3;animation:jackHit .45s ease-in-out infinite alternate}',
    '@keyframes jackHit{from{box-shadow:0 0 14px #ffd24a,0 0 5px #7cff9c inset;transform:scale(1)}to{box-shadow:0 0 34px #ffe98a,0 0 14px #7cff9c inset;transform:scale(1.07)}}',
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
    // 🔥 VÒNG QUAY RAID (hiện khi có vé) - reel giống trên nhưng đỏ lửa
    '#pwRaidBox{margin-top:12px;border:1px solid #ff6b6b;border-radius:12px;padding:12px;background:linear-gradient(180deg,#241820,#191114);box-shadow:0 0 18px #ff5b3c33}',
    '#pwRaidBox.hidden{display:none}',
    '#pwRaidWrap{position:relative;overflow:hidden;border:1px solid #7a3540;border-radius:10px;background:#160f13;height:126px;margin-top:8px}',
    '#pwRaidMark{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#ffcf5c;z-index:2;box-shadow:0 0 8px #ff8f3c}',
    '#pwRaidStrip{display:flex;gap:6px;position:absolute;left:0;top:8px;will-change:transform}',
    '#pwRaidRes{margin-top:10px;border:1px solid #ff8f3c;border-radius:10px;padding:10px;text-align:center;background:#231619}',
    // 🤝 11/09: thẻ giao dịch pal
    '.pcItem.trIn{border-color:#3ddc84;box-shadow:0 0 0 1px #3ddc8444 inset}.pcItem.trOut{border-color:#ffd76a;opacity:.95}',
    '#tmodal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:120;padding:16px}#tmodal.hidden{display:none}',
    '.tmBox{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;width:420px;max-width:100%;box-shadow:0 12px 48px rgba(0,0,0,.6);animation:gmpop .15s ease}',
    '.tmActs{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}.tmActs button{min-width:100px;padding:10px 14px;font-weight:700;border-radius:9px}',
    // 🎒 Rương pal + hộp nhận
    // 27/08: thẻ Rương gọn - trên: hình pal + tên/tag/giờ · dưới: nút Bán/Nhận full ngang
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
    // 🛒 shop item
    // 🛒 16/09: danh sách item = LƯỚI thẻ. Điện thoại hẹp -> 1 cột như cũ; máy tính -> 3-4 thẻ/hàng,
    // đỡ phải cuộn dài. Đề mục nhóm + dòng "không thấy món nào" chiếm trọn hàng (grid-column:1/-1).
    '#isList{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;align-items:start}',
    '#isList>.isCat,#isList>.muted{grid-column:1/-1}',
    '.isItem{border:1px solid var(--line);border-radius:14px;padding:12px;background:linear-gradient(180deg,#171c29,#131722);display:flex;align-items:flex-start;gap:11px;flex-wrap:wrap;transition:border-color .15s,transform .15s}',
    '.isItem:hover{border-color:#3a4155;transform:translateY(-1px)}',
    '.isItem img{width:62px;height:62px;flex:0 0 62px;object-fit:contain;background:#1b2030;border:1px solid var(--line);border-radius:11px;padding:4px}',
    '.isItem .isPh{width:62px;height:62px;flex:0 0 62px;display:flex;align-items:center;justify-content:center;font-size:30px;background:#1b2030;border:1px solid var(--line);border-radius:11px}',
    '.isItem .isMeta{flex:1;min-width:110px}',
    '.isItem .isNm{font-weight:800;font-size:15px;line-height:1.25}',
    // 🌳 10/09: implant Cây Thế Giới - viền + tên cầu vồng cho dễ nhận
    '.isItem.isWT{border:2px solid transparent;background:linear-gradient(#141824,#141824) padding-box,linear-gradient(90deg,#ff5f6d,#ffc371,#c6ff5f,#5fffd1,#5f9fff,#c85fff) border-box}',
    '.isItem.isWT .isNm{background:linear-gradient(90deg,#ff5f6d,#ffc371,#c6ff5f,#5fffd1,#5f9fff,#c85fff);-webkit-background-clip:text;background-clip:text;color:transparent}',
    // 💎 10/09: hạng implant - kim cương (tier 4) xanh ngọc, vàng (tier 3) - cùng màu với bảng passive lúc nhận pal
    '.isItem.isT4{border-color:#3fe0cf;box-shadow:0 0 0 1px #3fe0cf55 inset}.isItem.isT4 .isNm{color:#3fe0cf}',
    '.isItem.isT3{border-color:#ffd76a;box-shadow:0 0 0 1px #ffd76a55 inset}.isItem.isT3 .isNm{color:#ffd76a}',
    '.isItem.isPur{border-color:#c9a2ff;box-shadow:0 0 0 1px #c9a2ff55 inset}.isItem.isPur .isNm{color:#c9a2ff}',
    '.isItem.isDone{opacity:.72}.isItem.isDone .isBuyRow button{background:#2e7d4f;cursor:default}',
    '.isTier{font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px;vertical-align:middle}',
    '.isTier.t4{background:#3fe0cf22;color:#3fe0cf}.isTier.t3{background:#ffd76a22;color:#ffd76a}.isTier.twt{background:#c85fff22;color:#e0b3ff}',
    // giá: huy hiệu vàng cho nổi hẳn khỏi tên
    '.isItem .isPr{display:inline-block;color:var(--gold);font-size:13px;font-weight:800;margin-top:5px;background:#3a2f0d;border:1px solid #6b5613;border-radius:7px;padding:2px 8px}',
    // hàng mua nằm TRỌN đáy thẻ (width:100% ép xuống dòng riêng), nút chiếm hết chỗ còn lại
    '.isItem .isBuyRow{display:flex;align-items:center;gap:8px;width:100%;margin-top:10px}',
    '.isItem .isQty{width:66px;flex:0 0 66px;text-align:center}',
    '.isItem .isBuyRow button{flex:1;padding:10px 12px;font-weight:800;border-radius:9px;background:linear-gradient(180deg,#2f8f4f,#256e3e)}',
    '.isItem .isBuyRow button:disabled{opacity:.55}',
    // 🚀 Phi Thuyền (crash game)
    '#spmStage{position:relative;height:210px;border-radius:14px;margin-top:10px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(120% 100% at 50% 120%,#3a2a6e,#191233 70%);transition:background .3s}',
    '#spmStage.fly{background:radial-gradient(120% 100% at 50% 120%,#25407e,#0e1730 70%)}',
    '#spmStage.crash{background:radial-gradient(120% 100% at 50% 120%,#7e2a2a,#2a0f0f 70%)}',
    '#spmMult{font-size:54px;font-weight:900;color:#fff;text-shadow:0 2px 14px #000b;line-height:1}',
    '#spmStage.crash #spmMult{color:#ff8f8f}',
    '#spmStage.fly #spmMult{color:#8fffca}',
    '#spmRocket{font-size:40px;margin-top:6px}',
    '#spmStage.fly #spmRocket{animation:spmFloat 1s ease-in-out infinite alternate}',
    '@keyframes spmFloat{from{transform:translateY(5px) rotate(-8deg)}to{transform:translateY(-9px) rotate(7deg)}}',
    '#spmStage.crash #spmRocket{animation:spmBoom .5s ease-out}',
    // 05/09: chạm trần = THẮNG - nền vàng, số vàng, tên lửa vẫn lơ lửng + mưa 🎉
    '#spmStage.won{background:radial-gradient(120% 100% at 50% 120%,#8a6d1e,#2a230f 70%)}',
    '#spmStage.won #spmMult{color:#ffd76a;text-shadow:0 0 22px rgba(255,215,106,.55)}',
    '#spmStage.won #spmRocket{animation:spmFloat .45s ease-in-out infinite alternate}',
    '.spmConf{position:absolute;top:-26px;animation:spmConfFall 2.7s linear forwards;pointer-events:none;z-index:5}',
    '@keyframes spmConfFall{to{transform:translateY(250px) rotate(230deg);opacity:0}}',
    '@keyframes spmBoom{0%{transform:scale(1)}40%{transform:scale(1.6) rotate(40deg)}100%{transform:scale(.6) translateY(40px) rotate(120deg);opacity:.3}}',
    '#spmMsg{margin-top:8px;font-weight:800;font-size:15px;color:#cdd3e6;letter-spacing:.5px}',
    '#spmHistBar{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}',
    '#spmHistBar .h{font-size:11px;font-weight:800;border-radius:6px;padding:2px 7px;background:#1b1f2c;border:1px solid var(--line)}',
    '#spmBetBox{margin-top:12px}',
    '.spmP{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:9px;padding:7px 10px;margin-top:6px;font-size:13px}',
    '.spmP.me{border-color:var(--gold);background:#1d2130}',
    '.spmP.cashed{border-color:#3ddc84}',
    '.spmP .nm{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.spmP.lost{border-color:#ff6b6b;opacity:.7}',
    '.spmChip{flex:1;background:#232735;padding:10px 4px;font-weight:800;font-size:13px;border-radius:8px}',
    '.spmChip:hover{background:#2c3142}',
    '#spmFloats{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}',
    '.spmFloat{position:absolute;bottom:32%;font-size:13px;font-weight:800;color:#8fffca;white-space:nowrap;text-shadow:0 2px 6px #000;animation:spmJump 1.9s ease-out forwards}',
    '@keyframes spmJump{0%{opacity:0;transform:translateY(14px) scale(.7)}18%{opacity:1;transform:translateY(-8px) scale(1.15)}100%{opacity:0;transform:translateY(-130px) scale(1) rotate(-18deg)}}',
    // 🎒 đề mục 2 phần rương pal (bấm cả dòng để đóng/mở)
    '.pcSecH{display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:#181c28;cursor:pointer;user-select:none;font-size:13px}',
    '.pcSecH span{color:var(--muted);font-size:12px}',
    '.pcSecH:hover{border-color:#3a4155}',
    // 🧺 16/09: thanh bán hàng loạt + ô tick trên từng thẻ pal
    '#pcBulk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 4px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:#161b26}',
    '#pcBulk label{display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;user-select:none}',
    '#pcBulk button{padding:7px 12px;font-size:13px;background:linear-gradient(180deg,#ffd76a,#e0ac3f);color:#241d0a;border:0;border-radius:8px;font-weight:800;cursor:pointer}',
    '#pcBulk button:disabled{opacity:.45;cursor:not-allowed}',
    '#pcBulk.hidden{display:none}',
    'input.pcCk{width:20px;height:20px;flex:0 0 auto;accent-color:#ffd76a;cursor:pointer;margin-right:2px}',
    // ⏭️ hộp "đặt trước chuyến sau" của Phi Thuyền
    '.spmNxT{font-size:11px;font-weight:800;letter-spacing:.5px;color:#7aa2ff;margin-bottom:4px}',
    '.spmNx{display:flex;align-items:center;gap:8px;padding:6px 10px;margin-top:4px;border-radius:9px;background:#131a2b;border:1px solid #23304f;font-size:13px}',
    '.spmNx .nm{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    // 🛒 đề mục nhóm item trong shop (chỉ còn dùng khi TÌM KIẾM quét mọi nhóm)
    '.isCat{margin:16px 0 8px;font-weight:800;font-size:14px;letter-spacing:.5px;border-bottom:1px solid var(--line);padding-bottom:5px}',
    '.isCat:first-child{margin-top:4px}',
    // 🛒 4 nút nhóm shop (07/09) + dòng ghi chú tác dụng trên card
    '#isCats{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}',
    '.isCatBtn{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:#181c28;color:var(--tx);font-weight:700;font-size:12.5px;line-height:1.35;cursor:pointer;transition:border-color .15s,background .15s}',
    '.isCatBtn:hover{border-color:#3ddc84}',
    '.isCatBtn span{color:var(--muted);font-weight:700;font-size:11px;background:#0e1220;border-radius:999px;padding:0 6px;min-width:18px;text-align:center}',
    '.isCatBtn.on{background:linear-gradient(180deg,#2f8f4f,#256e3e);border-color:#3ddc84;color:#fff}',
    '.isCatBtn.on span{color:#c9f5d9;background:#0b2f1c}',
    // 🧺 16/09: nhóm LINH TINH (mã nhóm trong dữ liệu vẫn là 'admin') - xanh xám, tách khỏi các nhóm bán hàng
    '.isCatBtn.misc{border-color:#7aa2ff;color:#cfdcff}',
    '.isCatBtn.misc.on{background:linear-gradient(180deg,#42639e,#2c4570);border-color:#7aa2ff;color:#fff}',
    '.isCatBtn.misc.on span{background:#14203a;color:#cfdcff}',
    '.isItem.isMisc{border-color:#7aa2ff;background:linear-gradient(180deg,#171d2c,#12161f)}',
    '.isItem.isMisc .isNm{color:#b7caff}',
    '.isNote{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.35}',
    // 💸 chip chọn người nhận (chuyển tiền nhiều người 1 lần)
// 🪙 14/09: khung tỉ lệ đổi vàng (icon Đồng Vàng -> Dogcoin)
    // 🪙 14/09: icon Dogcoin/Vàng nhúng trong tiêu đề + nút
    '.tic{width:22px;height:22px;object-fit:contain;vertical-align:-5px;margin-right:4px}',
    '.bic{width:18px;height:18px;object-fit:contain;vertical-align:-4px;margin-right:4px}',

    '.dogRate{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding:8px 10px;border:1px solid #e0ac3f66;border-radius:10px;background:#241d10;font-weight:800}',
    '.dogRate img{width:24px;height:24px;object-fit:contain;vertical-align:middle}',
    '.dogRate .ar{color:var(--muted);margin:0 2px;font-weight:400}',
    '.dogChip{display:inline-flex;align-items:center;gap:4px;padding:7px 12px;border-radius:999px;background:#141824;border:1px solid var(--line);font-size:13px;font-weight:700;cursor:pointer;user-select:none}',
    '.dogChip.sel{background:#12351f;border-color:#3ddc84;color:#7cff9c}',
    // 📜 lịch sử cược
    '.spmH{display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:6px;border-radius:10px;background:#141824;border-left:3px solid var(--line);font-size:13px}',
    '.spmH.win{border-left-color:#3ddc84}',
    '.spmH.lose{border-left-color:#ff6b6b}',
    '.spmH .nm{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.spmH .bet{color:var(--muted);font-size:12px;white-space:nowrap}',
    '.spmH .rs{font-weight:800;white-space:nowrap}',
    '.spmH.win .rs{color:#3ddc84}',
    '.spmH.lose .rs{color:#ff8f8f}',
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
    // 👑 nút bản PAL BOSS: cùng khuôn nút giới tính - bấm là TÔ VÀNG cả ô, chữ đổi màu tối cho tương phản
    '.pcmGbtn.boss{border:2px solid #ffcf5c;background:#2b2312;color:#ffd76a;display:flex;align-items:center;justify-content:center;gap:8px}',
    '.pcmGbtn.boss:hover{background:#3d331b;color:#ffe49a;border-color:#ffe08a}',
    '.pcmGbtn.boss.on{background:linear-gradient(180deg,#ffd76a,#e0ac3f);color:#241d0a;box-shadow:0 0 0 3px rgba(255,207,92,.35)}',
    '.pcmGbtn.boss.on:hover{background:linear-gradient(180deg,#ffe08a,#e8b54a);color:#241d0a}',
    '.pcmGbtn.male.on:hover{background:#4a8dff}',
    '.pcmGbtn.female.on:hover{background:#ff74b6}',
    // chip passive đã chọn (luôn thấy dù cuộn list) - bấm ✕ để bỏ
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
    // 🏆 09/09 v2: hộp NỔ HŨ - chọn 1 trong N hộp bội số (vàng, nằm TRÊN hộp cỏ z-index 111)
    '#jpPick{position:fixed;inset:0;z-index:111;display:none;align-items:center;justify-content:center;background:#000d;padding:16px}#jpPick.show{display:flex}',
    '#jpPick .box{background:#2a1f08;border:2px solid var(--gold);border-radius:18px;padding:20px;max-width:380px;width:100%;text-align:center;box-shadow:0 12px 44px #000d}',
    '#jpPick .clover{font-size:56px;animation:cloverPulse 1.1s ease-in-out infinite}#jpPick h2{color:var(--gold);font-size:22px;margin:4px 0 2px}#jpPick .sub{font-size:13px;color:#e8d9a8;margin-bottom:14px}',
    '#jpPick .gifts{display:grid;gap:10px}#jpPick .gifts button{font-size:30px;padding:16px 0;background:#3d2c10;border:1px solid #ffcf5c66;border-radius:14px;color:var(--gold);font-weight:900;transition:transform .12s}#jpPick .gifts button:active{transform:scale(.88)}',
    '#jpPick .gifts button.win{border:2px solid var(--gold);box-shadow:0 0 18px #ffcf5c99;transform:scale(1.12);opacity:1}#jpPick .gifts button.dim{opacity:.35}',
    '#jpRes{display:none;margin-top:14px;font-size:15px;font-weight:800;color:#ffe9a8;line-height:1.5;background:#1a1408;border:1px solid #ffcf5c55;border-radius:12px;padding:10px}',
    '#jpClose{display:none;margin-top:12px;width:100%;padding:12px;background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05;font-weight:900;border-radius:12px}',
    // 🧭 ô bị la bàn soi: viền cam cảnh báo, vẫn bấm được (bấm là tự chọn cái chết)
    '.mtile.scoutmk{border-color:#ff9f3c!important;color:#ffb45c;box-shadow:0 0 8px #ff9f3c66 inset}',
    // 🪙 đồng xu quay (hộp 🎲) - rotateY liên tục tới khi setTimeout lộ kết quả
    '@keyframes coinSpin{from{transform:rotateY(0)}to{transform:rotateY(360deg)}}',
    '.coinflip{display:inline-block;font-size:46px;animation:coinSpin .28s linear infinite}',
    '.scell.scoutmk{outline:2px solid #ff9f3c;border-radius:6px}',
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
    // ---- sân khấu xí ngầu + chén nặn ----
    // ⚠️ Mấy rule sân khấu dưới đây khoá theo ID nên phải LIỆT KÊ CẢ id của bàn Siêu
    // (#st...). Quên là bàn Siêu vỡ bố cục: xúc xắc xếp dọc, chén to đùng (đã dính 22/09).
    '#stage,#stStage{position:relative;height:206px;border-radius:12px;background:radial-gradient(ellipse at center,#242424 0%,#080808 100%);border:1px solid #3a3a3a;overflow:hidden;margin-top:10px;touch-action:none}',
    // 14/09: xếp TAM GIÁC (1 trên · 2 dưới) cho gọn dưới chén, nặn hé một góc là thấy được
    '#diceRow,#stDiceRow{position:absolute;inset:0;display:grid;grid-template-columns:repeat(2,56px);grid-auto-rows:56px;gap:6px;align-content:center;justify-content:center}',
    '#diceRow .die:first-child,#stDiceRow .die:first-child{grid-column:1 / span 2}',
    '#diceRow .die,#stDiceRow .die{justify-self:center;align-self:center}',
    '.die{width:56px;height:56px;aspect-ratio:1/1;flex:0 0 auto;background:linear-gradient(160deg,#e0463a 0%,#c0271c 55%,#9c1b13 100%);border:1px solid #ff8b7a44;border-radius:12px;position:relative;box-shadow:0 3px 10px #000a,inset 0 1px 2px #ffffff33}',
    // 14/09 chủ sòng chốt: hột ĐỎ · nút TRẮNG · nền ĐEN - thuần CSS, không cần hình
    '.pip{position:absolute;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0006;transform:translate(-50%,-50%)}',
    // ⚠️ left:50% mà không có right -> bề ngang chỉ còn nửa sân khấu, phải nowrap kẻo rớt dòng
    '#sumBadge,#stSumBadge{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);background:#000a;border-radius:8px;padding:3px 12px;font-weight:800;font-size:15px;white-space:nowrap;max-width:96%;overflow:hidden;text-overflow:ellipsis}',
    '@media (max-width:420px){#sumBadge,#stSumBadge{font-size:13px;padding:3px 9px}}',
    // 14/09: CHÉN THẬT (assets/chennantaixiu.png) thay tờ giấy - kéo chén hé ra để nặn.
    // Chén 176px phủ trọn cụm xí ngầu 118px (góc xa tâm 83,4px < bán kính 88px) nên không lộ trước.
    '#paper,#stPaper{position:absolute;left:50%;top:50%;width:176px;height:176px;margin:-88px 0 0 -88px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none;will-change:transform}',
    '#paper.hidden,#stPaper.hidden{display:none}',   // ⚠️ phải có, không thì class hidden vô tác dụng
    '#paper img,#stPaper img{width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none;filter:drop-shadow(0 8px 18px #000b)}',
    // xám+mờ = CHƯA cho mở (đang giờ đặt cược) - sáng + viền xanh = tới giờ nặn
    '#paper.locked,#stPaper.locked{cursor:not-allowed}#paper.locked img,#stPaper.locked img{filter:grayscale(.7) brightness(.55)}',
    '#paper.open,#stPaper.open{cursor:grab}#paper.open:active,#stPaper.open:active{cursor:grabbing}',
    '#paper.open img,#stPaper.open img{animation:chenIdle 1.8s ease-in-out infinite}',
    '@keyframes chenIdle{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(-1.5deg)}}',
    // 🌪️ 14/09: khung hũ Bão ngay dưới cửa BÃO
    // 🌪️ 14/09: gom hết lên NÚT BÃO - số hũ, luật hoàn 30%, và câu nhẩm "đặt X ăn Y"
    // ===== BÀN SIC BO 52 Ô — bố cục theo ảnh sòng: nền đỏ sẫm, ô kem, có dải tiêu đề khu =====
    '#sbBan{background:#4a1418;border:2px solid #7d2a2a;border-radius:12px;padding:7px;margin-bottom:10px;',
    'display:flex;flex-direction:column;gap:4px}',
    '.sbHang{display:flex;gap:4px}',
    // ================= ⚡ BÀN SIÊU TÀI XỈU — tông ĐEN =================
    // Theo ảnh chủ server gửi: nền gần như đen, ô đen viền vàng đồng, chữ trắng ngà.
    // Cố tình KHÁC HẲN bàn thường (đỏ/kem) để nhìn phát biết mình đang ở bàn nào.
    '.stCard{background:linear-gradient(180deg,#0d0d10,#141216);border-color:#3a2f1a}',
    '#stBan{background:linear-gradient(180deg,#151317,#0b0b0d);border:1px solid #4a3a1c;border-radius:12px;',
    'padding:7px 6px;box-shadow:inset 0 0 40px rgba(0,0,0,.8)}',
    '.stKhu{background:linear-gradient(90deg,#3a2f14,#5a4720,#3a2f14);color:#ffe9a8;font-size:10.5px;font-weight:800;',
    'text-align:center;border-radius:6px;padding:3px 0;margin:6px 0 4px;letter-spacing:.3px}',
    '.sbO.stO{flex:1;min-width:0;position:relative;background:linear-gradient(180deg,#1c1a20,#0e0d11);color:#f2ead8;',
    'border:1px solid #5a4720;border-radius:6px;padding:7px 2px;cursor:pointer;display:flex;flex-direction:column;',
    'align-items:center;justify-content:center;gap:2px;min-height:44px;transition:transform .08s}',
    '.sbO.stO:active{transform:scale(.95)}',
    '.sbO.stO .sbTen{color:#f7f0dd}.sbO.stO .sbTl{color:#b99a55}',
    '.sbO.stO.sbDeu{background:linear-gradient(180deg,#241f16,#121016)}',
    '.sbO.stO.sbBaoAny{background:linear-gradient(180deg,#2c2414,#171209)}',
    '.sbO.stO.sbTai .sbTen{color:#ff8a7a}.sbO.stO.sbXiu .sbTen{color:#8ab8ff}',
    '.sbO.stO.sbKhoa{opacity:.94;cursor:not-allowed}',
    // ⚡ Ô được bốc hệ số nhân: GIẬT NHƯ CÓ SÉT (chủ server chốt), không chỉ nhấp nháy.
    '@keyframes stSet{0%,100%{box-shadow:0 0 0 2px #ffd76a,0 0 12px rgba(255,215,106,.7);filter:none;transform:none}',
    '46%{box-shadow:0 0 0 3px #fff6d0,0 0 26px rgba(255,246,208,1);filter:brightness(1.9) saturate(1.3);transform:translate(-1px,1px)}',
    '52%{box-shadow:0 0 0 2px #ffd76a,0 0 10px rgba(255,215,106,.8);filter:brightness(1);transform:translate(1px,-1px)}',
    '58%{box-shadow:0 0 0 4px #fff,0 0 30px #fff;filter:brightness(2.2);transform:translate(-1px,0)}}',
    '.sbO.stO.sbNhan{background:linear-gradient(180deg,#4a3a12,#241b06);border-color:#ffcf5c;',
    'animation:stSet 1.5s ease-in-out infinite}',
    '.sbO.stO .sbX{position:absolute;top:-7px;left:-3px;background:linear-gradient(180deg,#ffe9a8,#e8b923);color:#2a1f05;',
    'font-size:10.5px;font-weight:900;border-radius:999px;padding:1px 6px;z-index:3;',
    'box-shadow:0 2px 10px rgba(255,207,92,.8)}',
    // kết quả: ô trúng sáng, ô trượt chìm — khai SAU .sbNhan để thắng nó
    '@keyframes stTrungNhay{0%,100%{box-shadow:0 0 0 2px #ffd76a,0 0 14px rgba(255,215,106,.85)}',
    '50%{box-shadow:0 0 0 5px #ffd76a,0 0 32px rgba(255,215,106,1)}}',
    '.sbO.stO.sbTruot,.sbO.stO.sbTruot.sbKhoa,.sbO.stO.sbTruot.sbNhan{background:#17161a;border-color:#2e2a22;',
    'opacity:1;animation:none;box-shadow:none}',
    '.sbO.stO.sbTruot .sbTen,.sbO.stO.sbTruot .sbTl{color:#5c5850}',
    '.sbO.stO.sbTrung,.sbO.stO.sbTrung.sbKhoa,.sbO.stO.sbTrung.sbNhan{background:linear-gradient(180deg,#fff8e4,#f3e3b6);',
    'border-color:#ffd76a;color:#2a1f05;opacity:1;animation:stTrungNhay 1s ease-in-out infinite;z-index:4}',
    '.sbO.stO.sbTrung .sbTen,.sbO.stO.sbTrung .sbTl{color:#2a1f05}',
    // xúc xắc trên bàn đen: viền sáng hơn cho nổi
    '.sbO.stO .sbXx{border-color:#c0562f}',
    // 💸 dải phí — đỏ, to, không ai bỏ sót
    '.stPhi{background:linear-gradient(90deg,#4a1218,#7a1d27,#4a1218);border:1px solid #c0394b;color:#fff;',
    'border-radius:9px;padding:7px 10px;margin:8px 0;font-size:15px;font-weight:900;letter-spacing:.5px;text-align:center}',
    '.stPhi b{color:#fff}',
    '.stPhiNho{margin-top:6px;font-size:12px;text-align:center;color:#ffb3c0}',
    // 3 nút thao tác nhanh dưới hàng mệnh giá
    '.sbNut{display:flex;gap:6px;margin-top:8px}',
    '.sbNut button{flex:1;min-width:0;padding:9px 4px;border-radius:9px;font-size:12.5px;font-weight:800;',
    'background:linear-gradient(180deg,#2b3346,#222839);color:var(--tx);border:1px solid #3a4258;cursor:pointer}',
    '.sbNut button.xoa{background:linear-gradient(180deg,#472531,#331a22);border-color:#7a3b4a;color:#ffb3c0}',
    '.sbNut button:disabled{opacity:.42;cursor:not-allowed}',
    '.sbNut button:active:not(:disabled){transform:translateY(1px)}',
    // dòng báo ĐỨNG YÊN (không tự tắt kiểu toast)
    '.sbBao{margin-top:7px;padding:7px 10px;border-radius:8px;font-size:12.5px;font-weight:700;text-align:center}',
    '.sbBao.loi{background:#3a1d22;color:#ff9aa6;border:1px solid #7a3b4a}',
    '.sbBao.oke{background:#16301f;color:#8fe0a8;border:1px solid #2f6b45}',
    // dải tiêu đề từng khu (8:1 MỖI ĐÔI, 150:1 MỖI BỘ BA...)
    '.sbKhu{background:#6b1f22;color:#ffdca8;font-size:10.5px;font-weight:800;text-align:center;',
    'border-radius:5px;padding:3px 6px;letter-spacing:.3px;margin-top:2px}',
    '.sbO{flex:1;min-width:0;position:relative;background:#fff;color:#1a1208;border:1px solid #b09268;border-radius:6px;',
    'padding:6px 1px;cursor:pointer;text-align:center;font-family:inherit;font-weight:900;line-height:1.1;user-select:none;',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:44px}',
    '.sbO:active{transform:scale(.95)}',
    // 🖐️ KÉO THẢ CHIP. Chỉ ô ĐANG CÓ chip của mình mới khoá cuộn (touch-action:none) — ô trống
    // vẫn cho vuốt trang như thường. Con ma (ghost) nằm ngoài .sbO nên phải tự đủ CSS.
    '.sbO.sbCoChip{touch-action:none;-webkit-touch-callout:none}',
    '.sbO.sbKeoNguon .sbGio{opacity:.35}',
    '.sbO.sbKeoDich{outline:3px solid #ffcf5c;outline-offset:-2px;box-shadow:0 0 14px rgba(255,207,92,.85);transform:scale(1.05);z-index:6}',
    '.sbKeoGhost{position:fixed;z-index:9999;pointer-events:none;transform:translate(-50%,-50%) scale(1.35);',
    'display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1;filter:drop-shadow(0 10px 10px rgba(0,0,0,.65))}',
    '.sbKeoGhost img{width:22px;height:22px;display:block;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.6),0 0 0 2px #ffcf5c}',
    '.sbKeoGhost b{font-size:9.5px;font-weight:900;padding:1px 4px;border-radius:999px;background:#2a1f05;color:#ffd76a;border:1px solid #ffcf5c;white-space:nowrap}',
    '.sbKeoGhost.sbGioDen img{box-shadow:0 2px 8px rgba(0,0,0,.85),0 0 0 2px #000,0 0 0 3px #ffcf5c}',
    '.sbKeoGhost.sbGioDen b{background:#000}',
    '#sbKeoHuy{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9998;background:#7a1c1c;color:#fff;font-weight:900;font-size:13px;',
    'padding:14px 18px;border-radius:14px;border:2px dashed #ffb3b3;box-shadow:0 6px 20px rgba(0,0,0,.6);max-width:92vw;text-align:center;touch-action:none}',
    '#sbKeoHuy.hot{background:#c62828;border-style:solid;transform:translateX(-50%) scale(1.07)}',
    // ⚠️ nowrap KHÔNG kèm đường lùi = chữ dài ("Bão bất kỳ") tràn đè ô bên cạnh.
    // Cho chữ co theo màn, và chốt chặn cuối bằng cắt-ba-chấm chứ đừng tràn.
    '.sbO .sbTen{font-size:clamp(10px,2.7vw,12.5px);display:block;white-space:nowrap;',
    'max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.sbO .sbTl{font-size:9.5px;font-weight:700;color:#7a6440;display:block}',
    // ô to cho 4 cửa đều tiền (hay đặt nhất -> phải nổi nhất)
    '.sbO.sbDeu{min-height:56px;background:#fff}',
    '.sbO.sbDeu .sbTen{font-size:15px}',
    '.sbO.sbTai .sbTen{color:#b3241f}',
    '.sbO.sbXiu .sbTen{color:#1d4f9c}',
    '.sbO.sbBaoAny{background:#fff6e0}',
    // số tổng điểm to cho dễ nhắm
    '.sbO.sbTong .sbTen{font-size:17px}',
    // 🪙 DẤU CƯỢC CỦA CHÍNH MÌNH — ĐỒNG DOGCOIN thật đè giữa ô, số tiền là dòng
    // chú thích nhỏ ngay dưới đồng xu. Chỉ mình thấy phần của mình (máy chủ gửi
    // myBets riêng từng người). pointer-events:none để bấm xuyên qua đặt tiếp.
    '.sbO .sbGio{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;',
    'display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;line-height:1}',
    '.sbO .sbGio img{width:22px;height:22px;display:block;border-radius:50%;',
    'box-shadow:0 2px 6px rgba(0,0,0,.6),0 0 0 2px #ffcf5c}',
    '.sbO .sbGio b{font-size:9.5px;font-weight:900;padding:1px 4px;border-radius:999px;',
    'background:#2a1f05;color:#ffd76a;border:1px solid #ffcf5c;white-space:nowrap;',
    'box-shadow:0 1px 3px rgba(0,0,0,.6)}',
    // đồng NẶNG (>= CHIP_DEN Dogcoin): viền đen, chú thích nền đen chữ vàng
    '.sbO .sbGio.sbGioDen img{box-shadow:0 2px 8px rgba(0,0,0,.85),0 0 0 2px #000,0 0 0 3px #ffcf5c}',
    '.sbO .sbGio.sbGioDen b{background:#000;color:#ffd76a;border-color:#ffcf5c}',
    '.sbO .sbGioCu{position:absolute;top:-5px;right:-3px;background:var(--blue);color:#06121f;font-size:10px;font-weight:900;',
    'border-radius:999px;padding:1px 6px;box-shadow:0 2px 6px rgba(0,0,0,.5);z-index:2}',
    '.sbO .sbBan2{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#2a2e3b;color:#e8eaf0;z-index:4;',
    'font-size:9px;font-weight:800;border-radius:999px;padding:0 5px;white-space:nowrap;z-index:2}',
    '.sbO.sbKhoa{opacity:.94;cursor:not-allowed}',
    // ---- xúc xắc mini vẽ bằng chấm, giống bàn thật (đỏ trên nền trắng) ----
    // Ô xúc xắc PHẢI vuông: aspect-ratio giữ vuông kể cả khi flex co kéo.
    //
    // ⚠️ CỠ VIÊN PHẢI CO ĐƯỢC THEO BỀ NGANG MÀN. Bản cũ để width:20px + flex:0 0 auto:
    // hàng "MỖI BỘ BA" có 6 ô × 3 viên nên mỗi ô cần tối thiểu
    //     3×20 + 6×1.5 lề + 2×2 padding + 2 viền = 75px
    // mà điện thoại dọc chỉ chia được ~60px/ô -> xí ngầu đẩy nhau, lòi hẳn ra ngoài ô
    // (chủ server chụp lại 21/09). Hàng 2 viên chỉ cần 46px nên không vỡ — đúng ảnh.
    // Giờ cỡ viên nằm ở MỘT biến --xx, co theo vw, và chấm co theo viên.
    //   3,1vw: màn 430px -> 13,3px/viên -> 3 viên cả lề = 46px, lọt ô 60px.
    //   Trần 20px giữ nguyên cỡ cũ trên màn rộng.
    '.sbBoXx{--xx:clamp(11px,3.1vw,20px);display:flex;align-items:center;justify-content:center;',
    'flex-wrap:nowrap;line-height:0;max-width:100%}',
    '.sbXx{display:inline-block;width:var(--xx);aspect-ratio:1;background:#fff;border:1px solid #9c3b3b;border-radius:3px;',
    'position:relative;margin:0 1px;flex:0 1 auto;min-width:0;box-shadow:0 1px 2px rgba(0,0,0,.25)}',
    '.sbXx i{position:absolute;width:calc(var(--xx) * .16);height:calc(var(--xx) * .16);',
    'border-radius:50%;background:#d0241c;transform:translate(-50%,-50%)}',
    // ô đang sáng hệ số nhân
    '@keyframes sbNhay{0%,100%{box-shadow:0 0 0 2px #ffcf5c,0 0 12px rgba(255,207,92,.8)}50%{box-shadow:0 0 0 4px #ffcf5c,0 0 24px rgba(255,207,92,1)}}',
    '.sbO.sbNhan{background:linear-gradient(180deg,#fff3ca,#ffd978);animation:sbNhay 1s ease-in-out infinite;border-color:#ffcf5c}',
    '.sbO .sbX{position:absolute;top:-7px;left:-3px;background:#c62430;color:#fff;font-size:10.5px;font-weight:900;',
    'border-radius:999px;padding:1px 6px;box-shadow:0 2px 8px rgba(0,0,0,.65);z-index:3}',
    // 🎯 BÀN LÚC ĐÃ MỞ KẾT QUẢ — theo đúng ảnh sòng thật chủ server gửi:
    //    ô trượt = NỀN XÁM (xúc xắc vẫn đỏ) · ô trúng = NỀN TRẮNG.
    // Phải khai SAU .sbNhan, và dùng 2-3 lớp để thắng opacity của .sbKhoa.
    '@keyframes sbTrungNhay{0%,100%{box-shadow:0 0 0 2px #ffd76a,0 0 14px rgba(255,215,106,.85)}',
    '50%{box-shadow:0 0 0 5px #ffd76a,0 0 30px rgba(255,215,106,1)}}',
    '.sbO.sbTruot,.sbO.sbTruot.sbKhoa,.sbO.sbTruot.sbNhan{background:#bcc0c6;border-color:#90969e;',
    'opacity:1;animation:none;box-shadow:none}',
    '.sbO.sbTruot .sbTen,.sbO.sbTruot .sbTl{color:#5c6168}',
    // 🪙 Ra kết quả rồi thì đồng Dogcoin CHỈ nằm ở ô đang trả thưởng. Ô trượt giấu
    // chip + nhãn tiền bàn đi, kẻo rải 47 ô là 47 đồng xu che kín bàn.
    '.sbO.sbTruot .sbGio,.sbO.sbTruot .sbBan2{display:none}',
    // ô trúng thì đồng xu to hơn chút cho nổi
    '.sbO.sbTrung .sbGio img{width:26px;height:26px;box-shadow:0 2px 8px rgba(0,0,0,.6),0 0 0 2px #ffcf5c,0 0 10px rgba(255,207,92,.8)}',
    '.sbO.sbTrung,.sbO.sbTrung.sbKhoa,.sbO.sbTrung.sbNhan{background:#fff;border-color:#ffd76a;opacity:1;',
    'animation:sbTrungNhay 1s ease-in-out infinite;z-index:4;transform:translateY(-1px)}',
    '.sbO.sbTrung .sbTen,.sbO.sbTrung .sbTl{color:#111}',
    // ⚠️ ĐỪNG ghim lại width cố định ở đây. Ghim số là chọn đúng MỘT cỡ máy; máy hẹp hơn
    // vẫn tràn (390px thiếu 3px mỗi ô — chính là ảnh chủ server gửi 21/09). Ở đây chỉ hạ
    // TRẦN của biến --xx, còn co giãn để clamp lo.
    '@media (max-width:430px){.sbBoXx{--xx:clamp(9px,3vw,16px)}.sbXx{margin:0 1px}',
    '.sbO{min-height:38px;padding:4px 1px}.sbO .sbTen{font-size:11px}.sbO.sbDeu{min-height:48px}',
    '.sbO.sbDeu .sbTen{font-size:13px}.sbO.sbTong .sbTen{font-size:15px}.sbO .sbTl{font-size:8.5px}}',
    '#sbChips{margin-top:4px}',
    '#sbChips .chip.on{background:var(--gold);color:#3a2a06;border-color:var(--gold)}',
    '@media (max-width:520px){.sbO .sbTen{font-size:10.5px}.sbO .sbTl{font-size:9px}.sbO{padding:6px 2px}}',
    '#baoPot{display:inline-block;margin-left:7px;padding:2px 10px;border-radius:9px;background:#6b4f16;color:#ffe9a8;font-size:16px;font-weight:900;letter-spacing:0;vertical-align:2px;white-space:nowrap}',
    '#baoPot img{width:16px;height:16px;vertical-align:-3px;margin-left:3px}',
    '.cbtn.bao small{line-height:1.55}',
    '#baoCalc{font-size:14px;font-weight:900;color:#0f4d22;margin-top:5px;line-height:1.45;letter-spacing:0;padding:0 6px}',
    '@media (max-width:420px){#baoPot{font-size:14px;padding:2px 8px}#baoCalc{font-size:12.5px}}',
    '#stageCap,#stStageCap{margin-top:8px;font-size:13px;color:var(--muted);text-align:center}',
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
    '#ikBtn{background:linear-gradient(180deg,#4a1616,#2e0f0f);border:2px solid var(--red);color:#ffd9d9;font-weight:900;font-size:15px;padding:9px 10px;display:flex;align-items:center;gap:5px}',
    '#ikBtn .n{background:var(--red);color:#fff;border-radius:8px;font-size:12px;font-weight:900;padding:1px 6px;line-height:1.5;min-width:20px;text-align:center}',
    '#ikModal{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;z-index:60}',
    // BẮT BUỘC: #ikModal có display nên luật id (100) đè .hidden (10) -> phải có dòng này mới ẩn được
    '#ikModal.hidden{display:none}',
    '#ikBox{background:var(--card);border:1px solid var(--line);border-radius:14px;max-width:540px;width:100%;max-height:88vh;overflow:auto;padding:14px}',
    // 17/09: chủ server bảo nút + ô nhập nhỏ quá -> mỗi hàng 2 thẻ (ô 210px) cho rộng chỗ.
    '#ikList{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}',
    '.ikCard{border:1px solid var(--line);border-radius:12px;background:#161a24;padding:8px;display:flex;flex-direction:column;gap:6px}',
    '.ikPic{position:relative;background:#0f1218;border:1px solid var(--line);border-radius:10px;height:110px;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.ikPic img{width:68px;height:68px;object-fit:contain}',
    '.ikPic .isPh{font-size:38px}',
    '.ikQ{position:absolute;right:6px;bottom:6px;background:var(--red);color:#fff;font-weight:900;font-size:14px;border-radius:9px;padding:2px 9px;line-height:1.5}',
    '.ikNm{font-weight:800;font-size:14px;line-height:1.35;min-height:38px}',
    '.ikAct{display:flex;gap:7px;align-items:stretch}',
    '.ikAct input{width:64px;flex:0 0 auto;background:#0f1218;border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:11px 4px;font-size:16px;font-weight:800;text-align:center}',
    '.ikAct button{flex:1;padding:12px 6px;font-size:14px;font-weight:800;border-radius:10px}',
    '.ikAct .bn{background:var(--green);color:#0c2417}',
    '.ikAct .bt{background:linear-gradient(180deg,#7a5c14,#4a3a10);color:#fff3c4;border:1px solid #ffd76a}',
    '#ikTo{width:100%;background:#0f1218;border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:8px;font-size:13px;margin-bottom:8px}',
    '#ikWarn{background:linear-gradient(180deg,#4a3a10,#2e2410);border:1px solid #c9a227;color:#ffe9a8;border-radius:10px;padding:8px 10px;font-size:12px;margin-bottom:8px;line-height:1.5}',
    '#ikNhan{background:linear-gradient(180deg,#123a24,#0d2618);border:1px solid var(--green);color:#bff0d4;border-radius:10px;padding:8px 10px;font-size:12px;margin-bottom:8px;line-height:1.6}',
    '#ikNhan b{color:#fff}',
    '#lkWarn{background:linear-gradient(180deg,#4a1414,#2e0f0f);border:1px solid #e05a5a;color:#ffd9d9;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px;line-height:1.5}',
    '#lkWarn b{color:#fff}',
    '</style></head><body>',

    '<div id="login" class="card">',
    '<h1>🎮 Minigame Palworld</h1>',
    '<div class="muted">Có <b>Tài Xỉu</b>, <b>Dò Mìn</b>, <b>Leo Thang</b> và <b>Vòng Quay</b>. Lấy mã PIN bằng nút <b>🌐 Chơi trên web</b> ở bảng trong Discord.</div>',
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
    '<input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số" onkeydown="if(event.key===\'Enter\')login()">',
    // 08/09: lỗi login hiện NGAY DƯỚI ô PIN và đứng yên tới lần thử sau (toast đáy màn hình bị
    // bàn phím điện thoại che, người chơi nhập sai PIN mà tưởng web không phản hồi)
    '<div id="loginErr" class="lerr"></div>',
    '<button class="btn-full" id="loginBtn" onclick="login()" disabled>✅ ĐỒNG Ý VÀ VÀO CHƠI</button>',
    '</div>',

    '<div id="app" class="hidden">',
    '<div id="topbar" class="card row"><div><div class="muted">Số dư của <b id="myName"></b></div>',
    '<div class="big"><img class="dc" src="/dogcoin.png" alt=""> <span id="bal">0</span></div></div>',
    // 📒 14/09: ô NỢ kế bên số dư - chỉ hiện khi đang nợ, bấm vào là trả được luôn
    '<div id="debtChip" class="hidden" onclick="debtBarToggle()" title="Bấm để trả nợ"><div class="lb">📒 ĐANG NỢ</div><div class="vl" id="debtChipVal">0</div></div>',
    '<div style="display:flex;gap:6px;align-items:center">',
    // (nút Lộc lá gỡ 10/09 - chuyển tiền nằm trong Hồ sơ; nút 🆘 nằm ở card Hồ sơ)
    // 🧰 17/09: Rương Ích Kỷ - đứng ngay trước nút loa, đúng chỗ chủ server chỉ
    '<button id="ikBtn" title="Rương Ích Kỷ - 00:00 là xoá sạch" onclick="ikOpen()">🧰<span class="n" id="ikNum">0</span></button>',
    '<button id="sndBtn" title="Tắt/bật tiếng" style="background:#232735;min-width:40px;font-size:15px" onclick="toggleSnd()">🔊</button>',
    '<button style="background:#232735;font-size:12px" onclick="logout()">Thoát</button></div></div>',

    // 🔗 17/09: chưa được admin liên kết thì báo ngay, khỏi bấm rồi mới biết.
    '<div id="lkWarn" class="hidden">🔗 <b>Ví của bạn chưa được liên kết tên nhân vật trong game.</b><br>' +
    'Nhắn <b>admin</b> liên kết giúp (chỉ cần 1 lần). Chưa liên kết thì <b>không làm được gì</b>: không chơi, không điểm danh, ' +
    'không chuyển tiền, không mua bán, không nạp/rút. Chỉ xem số dư và trạng thái được.</div>',

    // 25/08: điều hướng 2 TẦNG cho đỡ chồng chéo - tầng 1 chọn NHÓM (Hồ sơ / Mini game),
    // tầng 2 chỉ hiện các trang thuộc nhóm đó. Quay Pal nằm bên nhóm Hồ sơ.
    '<div id="navGrp">',
    '<button id="ngProfile" onclick="grpGo(\'profile\')">👤 HỒ SƠ</button>',
    '<button id="ngGames" class="on" onclick="grpGo(\'games\')">🎮 MINI GAME</button>',
    // 🃏 nhóm thứ 3 — chỉ hiện khi admin bật ở panel SUPER (refresh() đọc j.pokerOn)
    '<button id="ngPoker" style="display:none" onclick="grpGo(\'poker\')">🃏 GIẢI POKER</button>',
    // 🀄 nhóm thứ 4 — cũng chỉ hiện khi admin bật ở panel SUPER (refresh() đọc j.tienlenOn)
    '<button id="ngTienlen" style="display:none" onclick="grpGo(\'tienlen\')">🀄 TIẾN LÊN</button>',
    '</div>',
    '<div id="nav">',
    '<button id="navTx" class="on" onclick="go(\'tx\')">🎲 Tài Xỉu</button>',
    '<button id="navStx" class="hidden" onclick="go(\'stx\')">⚡ Siêu Tài Xỉu</button>',
    '<button id="navMine" onclick="go(\'mine\')">💣 Dò Mìn</button>',
    '<button id="navStair" onclick="go(\'stair\')">🪜 Leo Thang</button>',
    '<button id="navWheel" onclick="go(\'wheel\')">🎡 Vòng Quay</button>',
    '<button id="navStock" onclick="go(\'stock\')">📈 Cổ phiếu</button>',
    '<button id="navSpm" onclick="go(\'spm\')">🚀 Phi Thuyền</button>',
    '<button id="navDebt" class="hidden" onclick="go(\'debt\')">📒 Nợ</button>',
    '<button id="navGift" class="hidden" onclick="go(\'gift\')">🎁 Quà</button>',
    '<button id="navDaily" onclick="go(\'daily\')">🪪 Cá nhân</button>',
    '<button id="navPal" onclick="go(\'pal\')">🎁 Quay Pal</button>',
    '<button id="navPick" onclick="go(\'pick\')">🎯 Chọn Pal</button>',
    '<button id="navShop" onclick="go(\'shop\')">🛒 Shop Item</button>',
    '<button id="navDog" onclick="go(\'dog\')">💸 Chuyển/Rút</button>',
    '</div>',

    // ================= TRANG BIG SMALL =================
    '<div id="pageTx">',
    '<div class="card">',
    '<div class="row"><h2 id="round" style="margin:0">Ván #-</h2><div id="clock" class="big">--</div></div>',
    '<div id="stt" class="muted"></div>',
    '<div id="stage">',
    '<div id="diceRow"></div>',
    '<div id="sumBadge" class="hidden"></div>',
    '<div id="paper" class="hidden locked"><img src="/chennantaixiu.png" alt="" draggable="false"></div>',
    '</div>',
    '<div id="stageCap"></div>',
    '</div>',

    // 🎲 BÀN SIC BO 52 CỬA — toàn bộ ô do JS sinh bằng vòng lặp (sbVe), không gõ tay 52 ô.
    // Cách đặt: chọn mệnh giá chip -> bấm vào ô -> chip xếp vào GIỎ (chưa trừ tiền).
    // Bấm ĐẶT CƯỢC mới gửi cả giỏ lên máy chủ. HOÀN TÁC / GẤP ĐÔI chỉ sửa giỏ, không đụng ví.
    '<div class="card" id="betCard">',
    '<div id="sbBan"></div>',
    // Chọn mệnh giá rồi BẤM THẲNG vào ô là đặt luôn (chủ server chốt: bỏ giỏ, bỏ 3 nút
    // Hoàn tác/Gấp đôi/Xoá giỏ). Không có hoàn tác - bấm nhầm là mất tiền thật.
    '<div id="sbChips" class="chips"></div>',
    // 3 nút thao tác nhanh + DÒNG BÁO đứng yên (không dùng toast: chủ server muốn
    // đọc kịp, không phải popup loé rồi tắt).
    '<div id="sbNut" class="sbNut">',
    '<button type="button" id="sbBtnLai" onclick="sbDatLai()">🔁 Đặt lại</button>',
    '<button type="button" id="sbBtnX2" onclick="sbX2()">✖️2 Gấp đôi</button>',
    '<button type="button" id="sbBtnXoa" class="xoa" onclick="sbXoaCuoc()">🗑️ Xoá cược</button>',
    '</div>',
    '<div id="sbBao" class="sbBao hidden"></div>',
    '<div class="muted" id="sbNhac" style="font-size:12.5px;margin-top:8px;text-align:center">Chọn mệnh giá rồi bấm vào ô trên bàn — bấm là đặt luôn</div>',
    '<div class="muted" id="txCapNote" style="font-size:12px;margin-top:6px;text-align:center"></div>',
    '<div class="mine" id="mine"></div>',
    '</div>',

    '<div class="card"><h2>👥 Ai đang đặt ván này</h2><div id="whoBox" class="muted" style="font-size:13px">Chưa ai đặt.</div></div>',

    '</div>', // hết #pageTx

    // ================= ⚡ TRANG SIÊU TÀI XỈU =================
    // Cùng luật chơi với bàn thường nhưng CÓ PHÍ 20% và trả thưởng khủng hơn nhiều.
    // Mọi id ở đây bắt đầu bằng "st" để không đụng bàn thường.
    '<div id="pageStx" class="hidden">',
    '<div class="card stCard">',
    '<div class="row"><h2 id="stRound" style="margin:0">Ván #-</h2><div id="stClock" class="big">--</div></div>',
    '<div id="stStt" class="muted"></div>',
    // 💸 Dải PHÍ — chỗ đập vào mắt nhất, ngay trên sân khấu
    // 💸 Chủ server chốt: chỉ một chữ PHÍ 20% ở giữa, gọn. Chi tiết số tiền thật sẽ bị
    // trừ đã nằm ở dòng ngay dưới hàng mệnh giá rồi.
    '<div class="stPhi">💸 PHÍ 20%</div>',
    '<div id="stStage">',
    '<div id="stDiceRow"></div>',
    '<div id="stSumBadge" class="hidden"></div>',
    '<div id="stPaper" class="hidden locked"><img src="/chennantaixiu.png" alt="" draggable="false"></div>',
    '</div>',
    '<div id="stStageCap"></div>',
    '</div>',

    '<div class="card stCard" id="stBetCard">',
    '<div id="stBan"></div>',
    '<div id="stChips" class="chips"></div>',
    '<div class="stPhiNho" id="stPhiNho"></div>',
    '<div id="stNut" class="sbNut">',
    '<button type="button" id="stBtnLai" onclick="stDatLai()">🔁 Đặt lại</button>',
    '<button type="button" id="stBtnX2" onclick="stX2()">✖️2 Gấp đôi</button>',
    '<button type="button" id="stBtnXoa" class="xoa" onclick="stXoaCuoc()">🗑️ Xoá cược</button>',
    '</div>',
    '<div id="stBao" class="sbBao hidden"></div>',
    '<div class="muted" id="stNhac" style="font-size:12.5px;margin-top:8px;text-align:center">Chọn mệnh giá rồi bấm vào ô trên bàn — bấm là đặt luôn</div>',
    '<div class="mine" id="stMine"></div>',
    '</div>',

    '<div class="card stCard"><h2>👥 Ai đang đặt ván này</h2><div id="stWho" class="muted" style="font-size:13px">Chưa ai đặt.</div></div>',
    '<div class="card stCard"><h2>🔮 Lịch sử 20 ván gần nhất</h2>',
    '<div id="stHist" class="muted" style="font-size:13px">Chưa có ván nào.</div></div>',
    '</div>', // hết #pageStx

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

    // 🍀 09/09: KHÔNG còn cỏ free - tick = MUA 1 ô, phí 30% cược (server tự trừ lúc bắt đầu)
    '<label class="muted" id="mExtraWrap" style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;margin-top:8px;cursor:pointer">',
    '<input type="checkbox" id="mExtra" onchange="mBand()" style="width:16px;height:16px;accent-color:#2ec26a">',
    '<span id="mExtraTxt">🍀 Mua 1 cỏ may mắn (phí <b id="mExtraFee">30</b> = 30% cược)</span></label>',
    '<div class="capwarn" id="mCapWarn"></div>',
    '<button class="mgo start" id="mGo" onclick="mGoClick()">⛏️ BẮT ĐẦU ĐÀO</button>',
    '<div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Mở ô càng nhiều hệ số càng cao - trúng mìn là mất tiền cược ván đó. Cỏ 🍀 KHÔNG tặng sẵn - muốn thì tick mua (30% cược).</div>',
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
    // 🍀 09/09: Leo Thang hết 3 cỏ free - muốn cỏ thì tick mua 1 ô, phí 30% cược
    '<label class="muted" id="sExtraWrap" style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;margin-top:8px;cursor:pointer">',
    '<input type="checkbox" id="sExtra" onchange="sBand()" style="width:16px;height:16px;accent-color:#2ec26a">',
    '<span id="sExtraTxt">🍀 Mua 1 cỏ may mắn (phí <b>30</b> = 30% cược)</span></label>',
    '<div class="capwarn" id="sCapWarn"></div>',
    '<button class="mgo start" id="sGo" onclick="sGoClick()">🪜 BẮT ĐẦU LEO</button>',
    '<div class="muted" id="sPotLine" style="font-size:12px;margin-top:6px;text-align:center;color:#ffd24a"></div>',
    '<div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Càng nhiều cầu lửa hệ số càng cao - đạp trúng lửa là mất tiền cược ván đó. Cỏ 🍀 KHÔNG tặng sẵn - muốn thì tick mua (30% cược).</div>',
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
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pwInfo">Quay TẤT CẢ pal thường + huyền thoại, mọi ô <b>chia đều</b> (không có boss raid ở vòng này). Mỗi lượt quay còn nạp <b>🍀 thanh may mắn</b> phía dưới - đầy 100% được quay <b>vòng may mắn</b>: huyền thoại hoặc ô RAID + thưởng Dogcoin. Pal trúng nằm trong <b>RƯƠNG</b> ở tab 🪪 Cá nhân.</div>',
    '<div id="pwWrap"><div id="pwMark"></div><div id="pwStrip"></div></div>',
    '<div id="pwRes" class="hidden"></div>',
    '<button class="btn-full" id="pwGo" onclick="pwSpin()">🎁 QUAY</button>',
    '<button class="btn-full" id="pwAuto" onclick="pwAutoTog()" style="margin-top:6px;background:linear-gradient(180deg,#5a6ad0,#3f4ca3)">🔁 TỰ ĐỘNG QUAY</button>',
    '<div class="muted" style="font-size:12px;margin-top:6px;text-align:center" id="pwPot">-</div>',
    // 🍀 THANH MAY MẮN
    '<div id="pwLuckWrap">',
    '<div id="pwLuckHead"><span>🍀 Thanh may mắn</span><span id="pwLuckTix"></span></div>',
    '<div id="pwLuckBar"><div id="pwLuckFill"></div><div id="pwLuckPct">0%</div></div>',
    '<div id="pwLuckNote">Mỗi lượt quay tích thêm may mắn. Đầy 100% được 1 vé quay 🍀 vòng may mắn bên dưới.</div>',
    '</div>',
    '</div>',
    // 🔥 VÒNG QUAY RAID (chỉ hiện khi có vé)
    '<div class="card" id="pwRaidBox">',
    '<div class="row"><h2 style="margin:0">🍀 Vòng quay may mắn</h2><div class="muted" id="pwRaidStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pwRaidInfo">-</div>',
    '<div id="pwRaidWrap"><div id="pwRaidMark"></div><div id="pwRaidStrip"></div></div>',
    '<div id="pwRaidRes" class="hidden"></div>',
    '<button class="btn-full" id="pwRaidGo" onclick="pwRaidSpin()">🍀 QUAY MAY MẮN (dùng 1 vé)</button>',
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

    // ================= TRANG 🛒 SHOP ITEM (28/08) =================
    // Mua item game + số lượng -> giao thẳng vào túi qua mod (phải đang ONLINE trong game).
    '<div id="pageShop" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🛒 Shop Item</h2><div class="muted" id="isStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="isInfo">Mua item + số lượng, bot giao <b>thẳng vào túi</b> trong game. Phải đang <b>ONLINE trong game</b> lúc mua. Trừ Dogcoin ngay; giao hụt tự hoàn.</div>',
    '<div id="isLink" class="muted" style="font-size:12px;margin-top:4px">-</div>',
    // 07/09: 4 nút nhóm + ô tìm kiếm (tìm theo tên LẪN ghi chú tác dụng, quét mọi nhóm)
    '<input id="isFind" placeholder="🔎 Tìm nhanh trong tất cả nhóm: tên item hoặc tác dụng..." oninput="isRender()" style="width:100%;margin-top:10px">',
    '<div id="isCats"></div>',
    '<div id="isList" style="margin-top:12px"><div class="muted">Đang tải...</div></div>',
    '</div>',
    '</div>', // hết #pageShop

    // ================= TRANG 💸 CHUYỂN / RÚT DOGCOIN (28/08) =================
    '<div id="pageDog" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">💸 Chuyển tiền</h2><div class="muted" id="dogTfStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px">Chuyển Dogcoin ví ↔ ví. Bấm chọn <b>1 hoặc nhiều người</b> bên dưới - <b>mỗi người</b> nhận cùng số tiền, ví bạn bị trừ tổng. 10 giây/lần.</div>',
    '<div id="dogTfPick" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"><span class="muted">Đang tải danh sách...</span></div>',
    '<div class="muted" id="dogTfSum" style="font-size:12px;margin-top:6px">Chưa chọn ai.</div>',
    '<div class="row" style="gap:8px;margin-top:8px"><input id="dogTfAmt" type="number" inputmode="numeric" placeholder="Số Dogcoin mỗi người" style="flex:1" oninput="dogTfSumDraw()"><button class="btn-full" style="flex:0 0 auto;margin-top:0;width:auto;padding:10px 18px" onclick="dogTransfer()">💸 Chuyển</button></div>',
    '</div>',
    // Rút vào game
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎮 Rút vào game</h2><div class="muted" id="dogLink">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="dogRutInfo">Trừ ví web, Dogcoin rơi thẳng vào <b>túi trong game</b> (phải đang ONLINE). Tối đa <span id="dogMax1">-</span>/lần.</div>',
    // 📅 11/09: hạn ngày mỗi chiều (server đếm) - hiện còn bao nhiêu hôm nay
    '<div class="muted" id="dogDayInfo" style="font-size:12px;margin-top:4px;color:#ffd76a"></div>',
    '<div id="dogRutPrev" style="font-size:12px;margin-top:4px;font-weight:700"></div>',
    '<div class="row" style="gap:8px;margin-top:8px"><input id="dogRutAmt" type="number" inputmode="numeric" placeholder="Số Dogcoin" style="flex:1" oninput="dogPreview()"><button class="btn-full" id="dogRutBtn" style="flex:0 0 auto;margin-top:0;width:auto;padding:10px 18px;background:linear-gradient(180deg,#2f8f4f,#256e3e)" onclick="dogRut()">🎮 Rút vào game</button></div>',
    '</div>',
    // Nạp từ game
    '<div class="card">',
    '<div class="row"><h2 style="margin:0"><img src="/itemimage/T_itemicon_Material_DogCoin.webp" class="tic" alt="">Chuyển Dogcoin từ game ra web</h2></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px">Trừ Dogcoin <b>trong túi game</b> (không tính đồ trong hòm), cộng thẳng vào ví web. Phải đang ONLINE. Tối đa <span id="dogMax2">-</span>/lần. <span id="dogNapRateInfo" style="color:#7cff9c;font-weight:700"></span></div>',
    '<div class="muted" id="dogNapDayInfo" style="font-size:12px;margin-top:4px;color:#ffd76a"></div>',
    '<div class="row" style="gap:8px;margin-top:8px"><input id="dogNapAmt" type="number" inputmode="numeric" placeholder="Số Dogcoin" style="flex:1" oninput="dogPreview()"><button class="btn-full" id="dogNapBtn" style="flex:0 0 auto;margin-top:0;width:auto;padding:10px 18px;background:linear-gradient(180deg,#4a7fbf,#356197)" onclick="dogNap()"><img src="/itemimage/T_itemicon_Material_DogCoin.webp" class="bic" alt="">Chuyển ra web</button></div>',
    '<div id="dogNapPrev" style="font-size:12px;margin-top:4px;font-weight:700"></div>',
    '</div>',
    // 🪙 14/09: ĐỔI VÀNG trong game -> Dogcoin web. UI riêng nhưng DÙNG CHUNG giới hạn ngày với Chuyển Dogcoin ra web.
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🪙 Đổi Vàng ra Dogcoin</h2><div class="muted" id="dogGoldStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px">Trừ <b>Đồng Vàng</b> trong túi game (không tính trong hòm), cộng Dogcoin vào ví web. Phải đang ONLINE. Chỉ nhập <b>bội số 10.000</b> vàng.</div>',
    '<div class="dogRate"><img src="/itemimage/T_itemicon_Material_Money.webp" alt=""><span id="dogGoldUnitG">-</span> Đồng Vàng <span class="ar">→</span> <img src="/itemimage/T_itemicon_Material_DogCoin.webp" alt=""><span id="dogGoldUnitD" style="color:#ffd76a">-</span> Dogcoin</div>',
    '<div class="muted" id="dogGoldDayInfo" style="font-size:12px;margin-top:4px;color:#ffd76a"></div>',
    '<div class="row" style="gap:8px;margin-top:8px"><input id="dogGoldAmt" type="text" inputmode="numeric" placeholder="Số vàng (vd 10.000)" style="flex:1" oninput="dogGoldFmt(this)"><button class="btn-full" id="dogGoldBtn" style="flex:0 0 auto;margin-top:0;width:auto;padding:10px 18px;background:linear-gradient(180deg,#e0ac3f,#b8862a);color:#241d0a" onclick="dogGold()">🪙 Đổi ra Dogcoin</button></div>',
    '<div id="dogGoldPrev" style="font-size:12px;margin-top:4px;font-weight:700"></div>',
    '</div>',
    '</div>', // hết #pageDog

    // ================= TRANG ĐIỂM DANH (dashboard người chơi) =================
    // Lịch tháng kiểu app điểm danh: ngày đã nhận vàng + nhãn CHUỖI, hôm nay viền tím,
    // progress đủ tháng ăn bonus. Nghiện = nút đếm ngược 60 phút theo GIỜ SERVER.
    // 🎁 15/09: TRANG QUÀ ADMIN TẶNG - tab vàng ở nhóm Hồ sơ, chỉ hiện khi còn quà chưa nhận hôm nay
    '<div id="pageGift" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎁 Quà admin tặng hôm nay</h2><div class="muted" id="giftStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px">Mỗi món nhận <b>1 lần/ngày</b>, số lượng do admin đặt. Nhận xong món ẩn tới 00:00 rồi hiện lại. Phải đang <b>online trong game</b> để bot giao vào túi.</div>',
    '<div id="giftList" style="margin-top:10px"><div class="muted">Đang tải...</div></div>',
    '</div>',
    '</div>',

    // 📒 14/09: TRANG NỢ riêng - tab đỏ ở nhóm Hồ sơ, chỉ hiện khi đang nợ
    '<div id="pageDebt" class="hidden">',
    '<div class="card" id="debtCard" style="display:none">',
    '<div class="row"><h2 style="margin:0">📒 Nợ Dogcoin</h2><div class="muted" id="debtBad"></div></div>',
    '<div id="debtInfo" style="font-size:14px;margin-top:6px">-</div>',
    '<div class="row" style="margin-top:8px">',
    '<input id="debtAmt" type="number" min="1" placeholder="Số muốn trả (trống = trả hết)" style="flex:1">',
    '<button class="btn-full" id="debtPayBtn" style="flex:1;margin-top:0" onclick="debtPay()">💳 TRẢ NỢ</button>',
    '</div>',
    '<div class="muted" style="font-size:12px;margin-top:6px">Còn nợ một đồng là <b>không mua được đồ ở shop item</b> và <b>không chuyển được pal vào game</b>. Mấy thứ khác vẫn chơi bình thường, trả sạch nợ là mở khoá ngay. Muốn vay: bảng <b>📒 VAY NỢ</b> trong Discord.</div>',
    // 🆘 14/09: réo anh em ra kênh chat trả giùm
    '<button class="btn-full" id="sosBtn" style="background:linear-gradient(180deg,#b5352f,#8a201b)" onclick="debtSos()">🆘 CẦU CỨU ANH EM</button>',
    '<div class="muted" style="font-size:12px;margin-top:6px">Đăng thẻ số dư + số nợ của bạn ra kênh chat, kèm nút để anh em bấm <b>trả nợ giùm</b>. Mỗi 1 phút réo được một lần thôi nha.</div>',
    '</div>',
    '</div>',

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
    // 🎒 RƯƠNG PAL (25/08): pal quay trúng nằm ở đây - bán lấy Dogcoin hoặc NHẬN vào game
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🎒 Rương Pal</h2><div class="muted" id="pcStat">-</div></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pcLink">-</div>',
    // ⏳ cooldown nhận pal CHUNG toàn server (28/08)
    '<div id="pcCdBanner" style="display:none;margin-top:8px;padding:8px 10px;border:1px solid #ffcf5c;border-radius:9px;background:#231d10;color:#ffd27a;font-size:13px;font-weight:700"></div>',
    '<div id="pcDayNote" style="display:none;margin-top:8px;padding:8px 10px;border:1px solid #3a4155;border-radius:9px;background:#1b1f2c;color:#aab3c5;font-size:13px"></div>',
    // 🆘 tẩu thoát khẩn cấp: kẹt đất/kẹt đá trong game thì bấm - 1 tiếng/lần (có popup xác nhận)
    '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">',
    '<button class="mini" id="pcRescueBtn" onclick="pcRescue()" style="background:#7e2a2a;color:#fff;font-weight:700;padding:8px 12px">🆘 TẨU THOÁT KHẨN CẤP</button>',
    '<span class="muted" style="font-size:12px">kẹt đất/kẹt đá? Dịch chuyển về điểm an toàn (phải đang ONLINE trong game) - 1 tiếng/lần</span>',
    '</div>',
    '<div id="pcBulk" class="hidden"><label><input type="checkbox" id="pcAll" onchange="pcCkAll(this)"><b>Chọn tất cả</b></label><span class="muted" id="pcSelN" style="font-size:12px">Chưa chọn con nào</span><span style="flex:1"></span><button id="pcSellN" onclick="pcSellMany()" disabled>🧺 Bán đã chọn</button></div>',
    '<div id="pcList" style="margin-top:8px"><div class="muted">Đang tải...</div></div>',
    '</div>',
    '</div>', // hết #pageDaily

    // Hộp chọn linh hồn + passive khi NHẬN pal (overlay cố định, dùng chung mọi trang)
    // 26/08: bố cục lại theo góp ý chủ server - máy tính rộng thì chia 2 CỘT (trái:
    // linh hồn + IV, phải: passive), thêm khung 🧾 TỔNG KẾT trước nút nhận.
    // 🧰 RƯƠNG ÍCH KỶ (17/09)
    '<div id="ikModal" class="hidden">',
    '<div id="ikBox">',
    '<div class="row"><h2 style="margin:0">🧰 RƯƠNG ÍCH KỶ</h2><button onclick="ikClose()" style="background:#232735;padding:4px 12px">✕</button></div>',
    '<div id="ikWarn">⏰ <b>00:00 là rương XOÁ SẠCH</b> - món nào chưa NHẬN vào game hoặc chưa TẶNG đi là mất trắng. <span id="ikCount"></span></div>',
    '<div class="muted" style="font-size:12px;margin-bottom:8px" id="ikStat">-</div>',
    '<div id="ikNhan" class="hidden"></div>',
    '<div style="font-size:12px;font-weight:700;margin-bottom:4px">🎁 Tặng cho</div>',
    '<select id="ikTo"><option value="">-- chọn người nhận --</option></select>',
    '<div id="ikList"></div>',
    '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5">Mua đồ ở <b>🏪 Shop Item</b> rồi bấm <b>🧰 Vào rương</b> - mua kiểu này <b>không cần đang online</b>. Lúc bấm <b>📦 Nhận</b> mới cần nhân vật online để bot giao vào túi.</div>',
    '</div></div>',

    '<div id="pcModal" class="hidden">',
    '<div id="pcBox">',
    '<div class="row"><h2 style="margin:0" id="pcmTitle">Nhận pal</h2><button onclick="pcClose()" style="background:#232735;padding:4px 12px">✕</button></div>',
    '<div class="muted" style="font-size:12px;margin-top:4px" id="pcmBase">-</div>',
    // 🚻 GIỚI TÍNH (27/08): bắt buộc chọn, không có mặc định - server chặn nếu bỏ trống
    '<div id="pcmGenderWrap">',
    '<div style="font-weight:700">🚻 Giới tính <span style="color:var(--red);font-weight:400;font-size:12px">* bắt buộc chọn</span></div>',
    '<div class="row" style="gap:8px;margin-top:5px">',
    '<button type="button" id="pcmGM" class="pcmGbtn male" onclick="pcGenderPick(1)">♂ Đực</button>',
    '<button type="button" id="pcmGF" class="pcmGbtn female" onclick="pcGenderPick(2)">♀ Cái</button>',
    '</div></div>',
    // 👑 07/09: bản PAL BOSS thành TUỲ CHỌN trả phí (mặc định bản thường) - nút full-width
    // cùng khuôn nút giới tính, bấm là tô vàng cả ô (class on)
    '<div id="pcmBossRow" style="display:none;margin-top:8px">',
    '<button type="button" id="pcmBossBtn" class="pcmGbtn boss" onclick="pcBossTog()" style="width:100%">',
    '<img src="/palboss.png" alt="" style="width:24px;height:24px;border-radius:6px" onerror="this.outerHTML=\'👑\'">',
    '<span>Bản PAL BOSS <span style="font-weight:400;font-size:12.5px;opacity:.85">· to đẹp trai hơn · +<span id="pcmBossPrice">10.000</span> Dogcoin</span></span>',
    '</button></div>',
    '<div id="pcmCols">',
    '<div id="pcmColL">',
    '<div style="font-weight:700;margin:10px 0 4px">💠 Linh hồn <span class="muted" style="font-weight:400">(ít nhất 1, tối đa 4 dòng · <span id="pcmSoulMax">1</span> dòng đầu MIỄN PHÍ, dòng thêm tính phí · tick rồi kéo % riêng từng dòng)</span></div>',
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
    // hàng chip passive ĐÃ CHỌN - luôn thấy dù cuộn list, bấm ✕ bỏ nhanh
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
    // onpointerdown chặn lan xuống skWrap - không chặn thì cú nhích chuột sau khi click
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

    // ================= TRANG 🚀 PHI THUYỀN (crash game, 28/08) =================
    // Vòng chơi CHUNG: chờ cược -> bay (số nhân tăng) -> nổ. Client vẽ số nhân theo giờ
    // server; RÚT thì server tính hệ số. Không rút kịp = mất cược.
    '<div id="pageSpm" class="hidden">',
    '<div class="card">',
    '<div class="row"><h2 style="margin:0">🚀 Phi Thuyền</h2><div class="muted" id="spmStat">-</div></div>',
    '<div id="spmHistBar"></div>',
    '<div id="spmStage"><div id="spmFloats"></div><div id="spmMult">1.00x</div><div id="spmRocket">🚀</div><div id="spmMsg">Chờ chuyến bay...</div></div>',
    '<div id="spmBetBox">',
    '<input id="spmAmt" type="number" inputmode="numeric" placeholder="Tiền cược (tối thiểu 400)" style="width:100%">',
    '<div class="row" id="spmChips" style="gap:6px;margin-top:7px">',
    '<button class="spmChip" onclick="spmSet(400)">400</button>',
    '<button class="spmChip" onclick="spmSet(1000)">1K</button>',
    '<button class="spmChip" onclick="spmSet(5000)">5K</button>',
    '<button class="spmChip" onclick="spmSet(10000)">10K</button>',
    '<button class="spmChip" onclick="spmMax()">MAX</button>',
    '</div>',
    '<label class="row" style="gap:8px;align-items:center;margin-top:8px;font-size:13px"><input type="checkbox" id="spmAutoOn" style="width:auto;margin:0"> 🤖 Tự rút ở <input id="spmAutoX" type="number" step="0.1" min="1.01" placeholder="2.0" style="width:80px"> x</label>',
    '<button class="btn-full" id="spmBtn" onclick="spmAction()">✅ ĐẶT CƯỢC</button>',
    '</div>',
    '<div class="muted" id="spmInfo" style="font-size:12px;margin-top:6px;text-align:center">-</div>',
    '<div id="spmNext" style="display:none;margin-top:8px"></div>',
    '</div>',
    '<div class="card">',
    '<div class="row"><h3 style="margin:0">👥 Trên chuyến</h3><div class="muted" id="spmPlayStat">-</div></div>',
    '<div id="spmPlayers" style="margin-top:8px"><div class="muted">Chưa ai lên chuyến.</div></div>',
    '</div>',
    '<div class="card">',
    '<div class="row"><h3 style="margin:0">📜 Lịch sử cược</h3><div class="muted">20 lượt gần nhất</div></div>',
    '<div id="spmBetHist" style="margin-top:8px"><div class="muted">Chưa có lượt nào.</div></div>',
    '</div>',
    '</div>', // hết #pageSpm

    // 🃏 GIẢI POKER: trang riêng (Poker/trang.html) nhúng bằng khung, cùng cổng nên dùng chung
    // play_token. src gán LÚC VÀO TAB (go()) để không tải khi người ta không chơi poker.
    // 18/09: poker chơi TOÀN MÀN HÌNH (chủ server: "bàn 8 người nhét trong khung nhỏ khó bấm lắm").
    // Vào tab là #pagePoker nhảy position:fixed phủ kín, che luôn thanh số dư + 2 hàng tab; thoát
    // bằng nút nổi góc phải. Thân trang phía sau khoá cuộn (body.pokerFull) để không cuộn ngầm.
    // 🀄 Tiến Lên: khung nhúng y hệt poker, dùng chung lớp toàn màn hình body.pokerFull
    '<div id="pageTienlen" class="hidden">',
    '<button id="tlOut" onclick="grpGo(\'games\')" title="Về mini game">✕ Thoát Tiến Lên</button>',
    '<iframe id="tlFrame" title="Tiến Lên Miền Nam"></iframe>',
    '</div>',
    '<div id="pagePoker" class="hidden">',
    '<button id="pokerOut" onclick="grpGo(\'games\')" title="Về mini game">✕ Thoát poker</button>',
    // ⚠️ KHÔNG đặt style= trên thẻ: style gắn thẳng đè mọi rule CSS, body.pokerFull sẽ không
    // kéo cao 100% được. Kích thước cả 2 trạng thái để trong khối CSS (#pokerFrame).
    '<iframe id="pokerFrame" title="Giải Poker"></iframe>',
    '</div>', // hết #pagePoker

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
    // Mặc định TẮT: bảng này để soi cầu, hiện hệ số nhân ở mọi ván là rối mắt.
    '<label class="hTog"><input type="checkbox" id="hNhanOn" onchange="hNhanBat(this.checked)"> ⚡ Hiện hệ số nhân từng ván</label>',
    '<div id="hist20" class="muted" style="font-size:13px">Chưa có ván nào.</div></div>',

    '<div id="winpop"></div>',
    '<div id="jpFlash"></div>',
    // 🍀 CỎ 4 LÁ: chọn 1 trong 4 hộp quà (phần thưởng do server quay lúc bấm)
    // 🏆 09/09 v2: hộp NỔ HŨ - N nút sinh động theo danh sách bội số
    '<div id="jpPick"><div class="box">',
    '<div class="clover">🏆</div>',
    '<h2>NỔ HŨ!!!</h2>',
    '<div class="sub" id="jpSub">Chọn 1 hộp - mỗi hộp giấu 1 bội số tiền cược!</div>',
    '<div class="gifts" id="jpGifts"></div>',
    '<div id="jpRes"></div>',
    '<button id="jpClose" onclick="jpDone()">💰 NHẬN THƯỞNG</button>',
    '</div></div>',
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
    // 28/08: popup xác nhận đồng bộ giống admin portal (gConfirm thay confirm mặc định)
    // 🤝 11/09: popup BÁN PAL - 2 lựa chọn: shop giá cố định | người chơi khác (nhập giá, 0 = tặng)
    '<div id="tmodal" class="hidden" onclick="if(event.target===this)tmClose()">',
    '<div class="tmBox">',
    '<div id="tmTitle" style="font-weight:800;font-size:16px;margin-bottom:8px"></div>',
    '<button class="btn-full" id="tmShop" onclick="tmSellShop()" style="background:linear-gradient(180deg,#ffd76a,#e0ac3f);color:#241d0a;margin-bottom:10px"></button>',
    '<div style="border-top:1px dashed var(--line);padding-top:10px"><b>🤝 Bán / tặng cho người chơi khác</b>',
    '<div class="muted" style="font-size:12px;margin:4px 0 6px">Pal rời rương của bạn và chờ bên kia bấm <b>Xác nhận mua</b>. Bên kia câu giờ thì bạn <b>Thu hồi</b> lấy lại. Giá <b>0</b> = tặng.</div>',
    '<input id="tmFind" placeholder="🔎 Gõ tên người nhận..." oninput="tmRenderPick()" style="width:100%;margin-bottom:6px">',
    '<div id="tmPick" style="display:flex;flex-wrap:wrap;gap:6px;max-height:150px;overflow:auto;margin-bottom:8px"></div>',
    '<div class="muted" id="tmToLbl" style="font-size:12px;margin-bottom:6px">Chưa chọn người nhận</div>',
    '<div class="row" style="gap:8px"><input id="tmPrice" type="number" inputmode="numeric" min="0" placeholder="Giá Dogcoin (0 = tặng)" style="flex:1"><button onclick="tmOffer()" style="flex:0 0 auto;background:linear-gradient(180deg,#4da3ff,#2b74c9)">📤 Gửi lời bán</button></div></div>',
    '<div class="tmActs"><button onclick="tmClose()" style="background:#3a4155;color:#fff">Đóng</button></div>',
    '</div></div>',
    '<div id="gmodal" class="hidden" onclick="if(event.target===this)gmClose(false)">',
    '<div id="gmBox">',
    '<div id="gmMsg"></div>',
    '<div id="gmActs"><button id="gmCancel" onclick="gmClose(false)">Hủy</button><button id="gmOk" onclick="gmClose(true)">Đồng ý</button></div>',
    '</div></div>',
    '<script>',
    'var TOKEN=localStorage.getItem("play_token")||"";var SEL="";var TT=0;var LOCKS=10;var PHASE="off";var BAL=0;',
    'var TXMAX=0;',   // trần cược mỗi người mỗi ván (0 = không giới hạn) - nút MAX cần

    'var TXKQS=4;var SBKQ=0;',   // TXKQS: giây cuối tự mở · SBKQ: ván đang tô kết quả trên bàn
    'var NAN=null;var revealedGame=0;var dragging=false;var paperX=0,paperY=0,baseX=0,baseY=0,dragX0=0,dragY0=0;',
    'var MYID="";var lastSettled=-1;',
    // đồng hồ máy người chơi có thể lệch server vài giây -> đếm giờ theo GIỜ SERVER
    'var CLOCK_OFF=0;function srvNow(){return Math.floor(Date.now()/1000)+CLOCK_OFF}',
    // 08/09: thời gian hiện theo độ dài chữ (2.5s → tối đa 8s), lỗi ❌/⚠️ tối thiểu 5s - trước
    // đây 2.5s cố định, câu lỗi dài chưa đọc xong đã biến.
    'function toast(m){var t=document.getElementById("toast");m=String(m==null?"":m);t.textContent=m;t.classList.toggle("err",/^(❌|⚠️|⛔)/.test(m));t.style.opacity=1;clearTimeout(t._h);var err=/^(❌|⚠️|⛔)/.test(m);t._h=setTimeout(function(){t.style.opacity=0},Math.min(8000,Math.max(err?5000:2500,1200+m.length*50)))}',
    // 28/08: popup xác nhận giống admin portal - trả Promise(true/false), thay confirm() mặc định
    // 🔒 16/09 KHOÁ CUỘN KHI CÓ POPUP (chủ server: "mở popup thì phần còn lại không được scroll").
    // 6 lớp phủ toàn màn hình - 3 cái bật/tắt bằng class hidden, 3 cái bằng class show.
    // KHÔNG gồm #winpop / #jpFlash / #toast: mấy cái đó pointer-events:none, chỉ là hiệu ứng.
    'var POPIDS=["gmodal","tmodal","pcModal","jpPick","luckyPick","lolaPop","ikModal"],POPY=0;',
    'function popAnyOpen(){for(var i=0;i<POPIDS.length;i++){var e=$(POPIDS[i]);',
    'if(e&&getComputedStyle(e).display!=="none")return true}return false}',
    'function popScrollSync(){var b=document.body,on=popAnyOpen(),dang=b.classList.contains("noscroll");',
    'if(on===dang)return;',
    'if(on){POPY=window.scrollY||document.documentElement.scrollTop||0;b.style.top=(-POPY)+"px";b.classList.add("noscroll")}',
    'else{b.classList.remove("noscroll");b.style.top="";window.scrollTo(0,POPY)}}',
    // gắn 1 lần: mọi lần popup đổi class/style là tự đồng bộ - popup thêm sau này chỉ cần bỏ id vào POPIDS
    'function popWatch(){if(!window.MutationObserver)return;POPIDS.forEach(function(id){var e=$(id);if(!e)return;',
    'new MutationObserver(popScrollSync).observe(e,{attributes:true,attributeFilter:["class","style"]})});popScrollSync()}',
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",popWatch);else popWatch();',
    'var GMRES=null;',
    'function gConfirm(msg,okLabel,danger){return new Promise(function(resolve){GMRES=resolve;',
    'var mm=document.getElementById("gmMsg");mm.innerHTML=msg;',   // cho phép <b>/emoji trong câu hỏi
    'var ok=document.getElementById("gmOk");ok.textContent=okLabel||"Đồng ý";',
    'ok.style.background=danger?"linear-gradient(180deg,#e86a6a,#c23c3c)":"linear-gradient(180deg,#3ddc84,#2aa564)";ok.style.color=danger?"#fff":"#08210f";',
    'document.getElementById("gmodal").classList.remove("hidden")})}',
    'function gmClose(ok){document.getElementById("gmodal").classList.add("hidden");if(GMRES){var r=GMRES;GMRES=null;r(!!ok)}}',
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
    // loginErr(m): ghi lỗi vào khung đỏ dưới ô PIN + toast; loginErr("") xoá khung.
    'function loginErr(m){var e=document.getElementById("loginErr");if(e){e.textContent=m||"";e.style.display=m?"block":"none"}if(m)toast(m)}',
    'function login(){var c=document.getElementById("agree");if(c&&!c.checked)return loginErr("⚠️ Phải tick đồng ý điều khoản trước đã");',
    'var u=document.getElementById("uid").value.trim();var p=document.getElementById("pin").value.trim();if(!u||!p)return loginErr("⚠️ Nhập đủ Discord ID + mã PIN");',
    'var b=document.getElementById("loginBtn");if(b.disabled&&b._busy)return;var ot=b.textContent;b._busy=true;b.disabled=true;b.textContent="⏳ Đang kiểm tra...";loginErr("");',
    'function done(){b._busy=false;b.disabled=false;b.textContent=ot}',
    'fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})})',
    '.then(function(r){return r.json().catch(function(){return{ok:false,error:"Bot trả về lỗi HTTP "+r.status}})})',
    '.then(function(j){done();if(!j.ok)return loginErr("❌ "+(j.error||"Sai thông tin"));TOKEN=j.token;localStorage.setItem("play_token",TOKEN);show(j.name)})',
    '.catch(function(e){done();loginErr("❌ Không gọi được bot ("+((e&&e.message)||"mạng đứt")+") - bot tắt hay mất mạng? Thử lại sau")})}',
    'function logout(){TOKEN="";localStorage.removeItem("play_token");location.reload()}',
    'function show(n){document.getElementById("login").classList.add("hidden");document.getElementById("app").classList.remove("hidden");',
    'if(n)document.getElementById("myName").textContent=n;initPaper();',
    'document.getElementById("sndBtn").textContent=SND?"🔊":"🔇";',   // nhớ lựa chọn tắt tiếng lần trước
    // Big Small vẫn tự làm mới ngầm kể cả khi đang ở trang Dò Mìn (số dư luôn đúng,
    // quay lại là thấy ván hiện tại ngay, không phải chờ).
    'refresh();setInterval(refresh,2000);setInterval(tick,250);',
    'debtSync();setInterval(function(){if(TOKEN)debtSync()},15000);',
    'giftSync();setInterval(function(){if(TOKEN)giftSync()},30000);',   // 🎁 15/09: tab Quà luôn đúng, qua 00:00 tự hiện lại   // 📒 14/09: ô nợ trên thanh luôn tươi
    'mSync();sSync();',
    // 28/08: F5 giữ nguyên tab đang xem - khôi phục MỌI tab hợp lệ (theo PAGE_GRP, tự
    // đúng cho cả tab thêm sau này như 🛒 Shop Item), không còn whitelist cứng thiếu tab.
    'var saved=localStorage.getItem("play_page");',
    'go(PAGE_GRP[saved]?saved:"tx")}',
    // (pick/addAmt/allIn của bàn 5 cửa đã bỏ - bàn 52 cửa dùng chip + giỏ, xem cụm sb* bên dưới)
    // vẽ 1 viên xí ngầu bằng chấm CSS
    'var PIPS={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};',
    'function dieHTML(v){var s=\'<div class="die">\';PIPS[v].forEach(function(p){s+=\'<div class="pip" style="left:\'+p[0]+\'%;top:\'+p[1]+\'%"></div>\'});return s+"</div>"}',
    'function showDice(dice,withSum){document.getElementById("diceRow").innerHTML=dice.map(dieHTML).join("");var b=document.getElementById("sumBadge");if(withSum){var s=dice[0]+dice[1]+dice[2];b.innerHTML="Tổng "+s+" - <span class=\'"+(s>=11?"t":"x")+"\'>"+(s>=11?"TÀI":"XỈU")+"</span> · <span class=\'"+(s%2===0?"ce":"od")+"\'>"+(s%2===0?"CHẴN":"LẺ")+"</span>";b.classList.remove("hidden")}else b.classList.add("hidden")}',
    // chén: che kín cụm xí ngầu, kéo TỰ DO 4 CHIỀU - kéo tới đâu lộ tới đó.
    // Chỉ kéo được trong pha nặn (PHASE==="nan") và khi chưa nặn xong ván này.
    'function initPaper(){var p=document.getElementById("paper");',
    'p.addEventListener("pointerdown",function(e){if(PHASE!=="nan"||!NAN||revealedGame===NAN.gameId)return;dragging=true;dragX0=e.clientX;dragY0=e.clientY;baseX=paperX;baseY=paperY;p.setPointerCapture(e.pointerId);e.preventDefault()});',
    'p.addEventListener("pointermove",function(e){if(!dragging)return;var st=document.getElementById("stage");var mw=st.offsetWidth+30,mh=st.offsetHeight+30;',
    'paperX=Math.max(-mw,Math.min(mw,baseX+(e.clientX-dragX0)));paperY=Math.max(-mh,Math.min(mh,baseY+(e.clientY-dragY0)));',
    'p.style.transform="translate("+paperX+"px,"+paperY+"px)";checkReveal()});',
    'function up(){dragging=false}p.addEventListener("pointerup",up);p.addEventListener("pointercancel",up);}',
    // lộ đủ cả 3 viên (chén không còn đè lên viên nào) mới tính là nặn xong
    'function rectOverlap(a,b){return !(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom)}',
    'function checkReveal(){if(!NAN||revealedGame===NAN.gameId)return;var pr=document.getElementById("paper").getBoundingClientRect();var dies=document.querySelectorAll("#diceRow .die");if(dies.length<3)return;for(var i=0;i<dies.length;i++){if(rectOverlap(pr,dies[i].getBoundingClientRect()))return}revealDone()}',
    'function revealDone(){if(!NAN||revealedGame===NAN.gameId)return;revealedGame=NAN.gameId;var p=document.getElementById("paper");p.classList.add("hidden");showDice(NAN.dice,true);',
    'sbToKetQua(NAN);',
    'var storm=(NAN.dice[0]===NAN.dice[1]&&NAN.dice[1]===NAN.dice[2]);var g=NAN.gameId;',
    // 🀫 14/09: nặn xong là tiền về ví ngay, không phải chờ hết giờ mở bát nữa
    'api("/api/tx/reveal",{gameId:g}).then(function(j){',
    // đánh dấu đã ăn tiền ván này để lát bảng lịch sử về không hiện popup lần hai
    'if(g>lastSettled)lastSettled=g;',
    'if(typeof j.balance==="number"){BAL=j.balance;$("bal").textContent=j.balance.toLocaleString("vi-VN")}',
    'if(j.stake>0)showNet(j.net);else if(!storm)toast("🀫 Bạn nặn xong - ván này bạn không đặt");',
    '}).catch(function(){});',
    'if(storm)stormFx(g)}',
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
    // TXKQS giây cuối chưa nặn -> chén tự rơi, bàn tô kết quả cho cả bàn cùng thấy
    'if(s2<=TXKQS&&NAN&&revealedGame!==NAN.gameId)autoReveal()}',
    'else{el.textContent="--";el.style.color=""}}',
    'var autoRevealing=0;',
    'function autoReveal(){if(!NAN||autoRevealing===NAN.gameId)return;autoRevealing=NAN.gameId;',
    'var p=document.getElementById("paper");var h=document.getElementById("stage").offsetHeight;',
    'p.style.transition="transform .6s ease-in";p.style.transform="translate("+paperX+"px,"+(h+60)+"px)";',
    'setTimeout(function(){revealDone();if(CURPAGE==="tx")toast("⏰ Hết giờ nặn - tự mở giùm bạn!")},600)}',
    // NAMES: tên hiển thị từng cửa. 5 cửa cũ gõ sẵn cho lịch sử ván cũ đọc được,
    // 52 cửa của bàn mới đổ thêm vào lúc máy chủ gửi bảng cửa (sbNapCua).
    'var NAMES={tai:"TÀI",xiu:"XỈU",chan:"CHẴN",le:"LẺ",bao:"BÃO"};',
    'var LINKED=true;',
    // 🔗 17/09: bật/tắt banner. Dùng classList chứ KHÔNG đặt style.display, để .hidden còn tác dụng.
    'function lkSet(v){LINKED=!!v;var b=$("lkWarn");if(b)b.classList.toggle("hidden",LINKED)}',
    'function refresh(){api("/api/state").then(function(j){',
    'MYID=j.me||MYID;',
    'if(typeof j.linked==="boolean")lkSet(j.linked);',
    // 🃏 tab GIẢI POKER: hiện/ẩn theo công tắc admin; đang đứng trong tab mà bị tắt thì về MINI GAME
    '$("ngPoker").style.display=j.pokerOn?"":"none";',
    '$("ngTienlen").style.display=j.tienlenOn?"":"none";',
    'if(!j.pokerOn&&PAGE_GRP[CURPAGE]==="poker")grpGo("games");',
    'var nst=$("navStx");if(nst){nst.classList.toggle("hidden",!j.stxOn);',
    'if(!j.stxOn&&CURPAGE==="stx")go("tx")}',
    // 🧰 17/09: nhãn số trên nút Rương Ích Kỷ. THIẾU dòng này thì F5 xong nút hiện 0 cho tới khi
    // bấm mở rương mới đúng - máy chủ vẫn gửi ichKyTotal đều, chỉ là không ai đọc. Đã dính thật.
    'if(typeof j.ichKyTotal==="number")ikBadge(j.ichKyTotal);',
    // 🏆 nhãn hũ trên tab: cập nhật mỗi nhịp 2 giây, kể cả khi người khác đang nuôi hũ
    'if(j.pots){if(typeof j.pots.mines==="number")MPOT=j.pots.mines;if(typeof j.pots.stairs==="number")SPOT=j.pots.stairs}',
    'BAL=j.balance;document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");',
    // ván vừa chốt: tính thắng/thua CÁ NHÂN -> popup; ra bão -> hiệu ứng
    'var h0s=j.history[0];',
    'if(h0s){if(lastSettled===-1)lastSettled=h0s.gameId;',
    'else if(h0s.gameId>lastSettled){lastSettled=h0s.gameId;',
    'var stake=0,winAmt=0;(h0s.bets||[]).forEach(function(b){if(b.u===MYID)stake+=b.amount});(h0s.winners||[]).forEach(function(w){if(w.u===MYID)winAmt+=w.amount});',
    'if(stake>0)showNet(winAmt-stake);',
    'if(h0s.storm)stormFx(h0s.gameId)}}',
    'document.getElementById("round").textContent="Ván #"+String(j.gameId).padStart(5,"0");',
    'txPotDraw(j);',   // 🌪️ 14/09 hũ Bão
    'featDraw(j.featOff||[]);',   // 🔌 15/09: giấu tab mục đang tắt
    'if(j.now)CLOCK_OFF=j.now-Math.floor(Date.now()/1000);',
    'TT=j.targetTime;LOCKS=j.lockSeconds;var prevPhase=PHASE;PHASE=j.phase;NAN=j.nan;',
    // betBtn đã bỏ (bấm ô là đặt luôn) -> phải có if, không thì null.disabled làm vỡ cả refresh
    'var bb=document.getElementById("betBtn");if(bb)bb.disabled=(PHASE!=="bet");',
    'var nhac=document.getElementById("sbNhac");',
    'if(nhac)nhac.textContent=PHASE==="bet"?"Chọn mệnh giá rồi bấm vào ô trên bàn — bấm là đặt luôn":(PHASE==="nhan"?"⚡ Đang quay hệ số nhân — không đặt được nữa":"Đã khoá sổ — chờ ván sau");',
    // 💰 trần cược/người/ván + đã đặt bao nhiêu ván này (server chặn, đây chỉ là nhắc)
    'var cpn=document.getElementById("txCapNote");if(cpn){var myTot=0;(j.myBets||[]).forEach(function(b){myTot+=b.amount||0});',
    'TXMAX=j.txMax||0;',
    'cpn.textContent=(j.txMax>0)?("💰 Giới hạn cược "+j.txMax.toLocaleString("vi-VN")+"/người/ván"+(myTot>0?" · ván này bạn đã đặt "+myTot.toLocaleString("vi-VN"):"")):""}',
    'var stt=document.getElementById("stt");var cap=document.getElementById("stageCap");var paper=document.getElementById("paper");',
    'if(PHASE==="bet"){stt.textContent="🟢 Đang nhận cược";',
    // chén xám che sẵn (khóa) - kết quả ván trước xuống dòng chú thích dưới sân khấu
    'resetPaper();paper.classList.remove("hidden","open");paper.classList.add("locked");',
    'var h0=j.history[0];cap.textContent=h0?("Ván trước #"+String(h0.gameId).padStart(5,"0")+": "+h0.dice.join("-")+" = "+h0.sum+" ("+h0.tx+" · "+h0.cl+")"):"Đặt cược đi!";',
    'if(h0)showDice(h0.dice,false);else document.getElementById("diceRow").innerHTML="";document.getElementById("sumBadge").classList.add("hidden")}',
    'else if(PHASE==="nan"&&NAN){stt.textContent="🀫 Khóa sổ - GIỜ NẶN ĐÂY!";',
    'if(revealedGame===NAN.gameId){paper.classList.add("hidden");showDice(NAN.dice,true);cap.textContent="Bạn nặn xong rồi - tiền đã về ví, chờ ván sau"}',
    'else{showDice(NAN.dice,false);paper.classList.remove("hidden","locked");paper.classList.add("open");',
    'cap.textContent="Giữ và kéo chén ra - lộ đủ 3 viên là ra điểm · ai kéo người đó thấy, người khác KHÔNG thấy của bạn 🤫"}}',
    // ⚡ pha HIỆN NHÂN: chén vẫn NẰM ĐÓ và KHOÁ (y như lúc đang đặt), chỉ đổi dòng chữ.
    // Giấu chén ở đây là sai - người chơi tưởng mất chén. Chưa được kéo vì máy chủ
    // CHƯA QUAY xúc xắc: /api/state chỉ gửi 3 viên khi phase==="nan", nên có mở F12
    // xoá chén cũng không moi ra được gì.
    'else if(PHASE==="nhan"){stt.textContent="⚡ KHÓA SỔ - đang quay hệ số nhân!";',
    'cap.textContent="Xúc xắc CHƯA lắc - hết 4 giây này mới tới lượt nặn chén.";',
    'resetPaper();paper.classList.remove("hidden","open");paper.classList.add("locked")}',
    'else if(PHASE==="wait"){stt.textContent="⏳ Đang mở bát...";cap.textContent="";paper.classList.add("hidden")}',
    'else{stt.textContent="🔴 Bàn Tài Xỉu đang tắt";cap.textContent="";paper.classList.add("hidden")}',
    'if(prevPhase==="nan"&&PHASE!=="nan"){resetPaper()}',
    'if(typeof j.txKqS==="number")TXKQS=j.txKqS;',
    'SBCOVT=!!j.txVanTruoc;',
    'sbNapCua(j);sbTong(j.totals||{},j.myBets||[]);sbNhanVe(j.txNhan);',
    // đã nặn xong ván nào thì bàn giữ màu ván đó tới khi mở ván mới
    'if(j.nan&&revealedGame===j.nan.gameId)sbToKetQua(j.nan);',
    'if(PHASE==="bet")sbXoaKetQua();',
    'sbNutVe();',
    // sang ván mới thì dọn dòng báo của ván cũ đi
    'if(prevPhase!=="bet"&&PHASE==="bet")sbBao("",false);',
    // KHÔNG liệt kê cược thành dòng chữ nữa: bàn 52 ô thì dòng nào cũng tràn.
    // Tiền đặt hiện bằng CHIP ngay trên từng ô (sbVeGio), chỉ còn kể tổng cho gọn.
    'var mb=j.myBets||[],mTong=0;mb.forEach(function(b){mTong+=b.amount||0});',
    'document.getElementById("mine").textContent=mb.length?("🧾 Ván này bạn đặt "+vnd(mTong)+" Dogcoin vào "+mb.length+" ô"):"";',
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
    'var tg=$("hNhanOn");if(tg&&tg.checked!==HNHAN)tg.checked=HNHAN;',
    'if(!list.length){box.innerHTML="Chưa có ván nào.";return}',
    'box.innerHTML=list.slice(0,20).map(function(h){',
    'var stake=0,winAmt=0,joined=false;',
    '(h.bets||[]).forEach(function(b){if(b.u===MYID){stake+=b.amount;joined=true}});',
    '(h.winners||[]).forEach(function(w){if(w.u===MYID)winAmt+=w.amount});',
    'var net=winAmt-stake;',
    'var tai=(h.tx==="BIG"||h.tx==="TÀI"||h.tx==="TAI");',
    'var chan=(h.cl==="CHẴN");',
    'var kq=h.storm?"🌪️ BÃO":(\'<span class="\'+(tai?"t":"x")+\'">\'+h.tx+\'</span><span class="sep"> | </span><span class="\'+(chan?"ce":"od")+\'">\'+h.cl+\'</span>\');',
    // 🚫 VÁN HUỶ: máy chủ kẹt nên ván không quay được, cược đã hoàn nguyên. Vẫn kể ra
    // để dãy số ván LIỀN MẠCH - trước đây ván huỷ biến mất luôn, người chơi thấy số
    // nhảy cóc và tưởng bị nuốt tiền (chủ server báo 21/09).
    'if(h.huy)return \'<div class="hrow huy"><span class="gid">#\'+String(h.gameId).padStart(5,"0")+\'</span>\'+',
    '\'<span class="kq">🚫 VÁN HUỶ — đã hoàn cược</span>\'+',
    '\'<span class="lydo">\'+esc(h.lyDo||"")+\'</span></div>\';',
    'return \'<div class="hrow\'+(h.storm?" storm":"")+\'">\'+',
    '\'<span class="gid">#\'+String(h.gameId).padStart(5,"0")+"</span>"+',
    '\'<span class="dd">\'+h.dice.map(mdie).join("")+"</span>"+',
    '\'<span class="sum">(\'+h.sum+")</span>"+',
    '\'<span class="kq">\'+kq+"</span>"+',
    '(joined?\'<span class="net \'+(net>=0?"w":"l")+\'">\'+(net>=0?"+":"")+net.toLocaleString("vi-VN")+"</span>":"")+',
    '"</div>"+hSub(h)}).join("")}',
    // Công tắc ⚡ nhớ trong máy người chơi.
    //   chưa từng chọn (null) -> BẬT (mặc định lúc deploy, chủ server chốt)
    //   "0" -> tắt · "1" -> bật
    // Phải viết !== "0". Viết === "1" là người mới vào bị tắt, sai ý.
    'var HNHAN=localStorage.getItem("tx_hnhan")!=="0";',
    'function hNhanBat(v){HNHAN=!!v;localStorage.setItem("tx_hnhan",v?"1":"0");refresh()}',
    // Dòng phụ: phần "bạn ăn" LUÔN hiện (thứ người chơi cần), phần ⚡ chỉ khi bật
    // công tắc — và chỉ 3 ô to nhất, để nó là chú thích chứ không át dãy kết quả.
    'function hSub(h){var p=[];',
    'var an=(h.bets||[]).filter(function(b){return b.u===MYID&&(b.nhan||0)>0});',
    'if(an.length)p.push(\'<span class="an">🎯 \'+an.slice(0,3).map(function(b){',
    'return b.choice+" +"+vnd((b.nhan||0)-b.amount)}).join(" · ")+(an.length>3?" …":"")+"</span>");',
    'if(HNHAN){var nh=h.nhan||{},ids=Object.keys(nh).sort(function(a,b){return nh[b]-nh[a]});',
    'if(ids.length)p.push(ids.slice(0,3).map(function(k){',
    'return \'<span class="xx">x\'+nh[k]+"</span>"+(NAMES[k]||k)}).join(" · ")+(ids.length>3?(" +"+(ids.length-3)):""))}',
    'return \'<div class="hsub">\'+p.join(" &nbsp;·&nbsp; ")+"</div>"}',
    // danh sách ai đang đặt ván này, gộp theo cửa, tên tô màu riêng từng người
    'var CHOICE_COLOR={tai:"#ff7b86",xiu:"#7db4ff",chan:"#6fd3b8",le:"#c39bf0",baoany:"#ffcf5c",bao:"#ffcf5c"};',
    'function cuaMau(c){return CHOICE_COLOR[c]||"#ffcf5c"}',
    'function renderWho(list){var box=document.getElementById("whoBox");if(!list.length){box.innerHTML="Chưa ai đặt.";return}',
    'var by={};list.forEach(function(b){(by[b.choice]=by[b.choice]||[]).push(b)});',
    // bàn 52 cửa: liệt kê mọi cửa CÓ người đặt, theo đúng thứ tự bảng cửa máy chủ gửi
    'box.innerHTML=(SBCUA.length?SBCUA.map(function(x){return x.id}):["tai","xiu","chan","le","bao"]).filter(function(c){return by[c]}).map(function(c){',
    'return \'<div style="padding:3px 0"><b style="color:\'+cuaMau(c)+\'">\'+(NAMES[c]||c)+"</b>: "+by[c].map(function(b){return \'<span style="color:\'+userColor(b.u)+\'">\'+esc(b.name)+"</span> "+b.amount.toLocaleString("vi-VN")}).join(" · ")+"</div>"}).join("")}',
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
    'var MT=25;var MOPEN=true;var MCAPWARN=false;var MPOT=-1;var MPOTMULTS=[10,15,20];var MINBET=400;var POTSEED=5000;var MG=null;var mBusy=false;var MTAB=[];var MOVER=false;var MLAST=null;var MAXWIN=0;var MAXBET=0;',
    'var MMIN=3,MMAX=20;',   // giới hạn số mìn - server là nguồn chuẩn, mSync ghi đè
    // Bấm nhanh: cú bấm trong lúc chờ server KHÔNG bị nuốt nữa - xếp hàng đào tuần tự.
    // mBusyAt = chốt an toàn: request treo quá 8s thì tự gỡ cờ, không phải F5.
    'var mQ=[];var mBusyAt=0;',
    'function $(id){return document.getElementById(id)}',
    // Rút gọn y như sòng Mines thật: x798.37 · x2.07k · x114.16k · x1.02M
    // (cắt xuống 2 số lẻ sau khi chia, tự bỏ số 0 thừa)
    'function fx(m){if(m>=1e6)return "x"+(Math.floor(m/1e4)/100)+"M";if(m>=1e3)return "x"+(Math.floor(m/10)/100)+"k";return "x"+m.toFixed(2)}',
    'function vnd(n){return Math.floor(n).toLocaleString("vi-VN")}',
    // rút gọn cho vừa đồng chip: 1.000 -> 1K · 50.000 -> 50K · 2.500.000 -> 2.5TR
    // từ mức này trở lên chip chuyển sang màu đen (chủ server chốt)
    'var CHIP_DEN=50000;',
    'function chipNgan(n){n=Math.floor(n||0);',
    'if(n>=1000000){var t=n/1000000;return (t>=10?Math.floor(t):Math.floor(t*10)/10)+"TR"}',
    'if(n>=1000){var k=n/1000;return (k>=10?Math.floor(k):Math.floor(k*10)/10)+"K"}',
    'return String(n)}',
    // 🌪️ HŨ BÃO ĐÃ BỎ 21/09 - bàn 52 cửa có sẵn Bão bất kỳ 30:1 và Bão từng số 150:1
    // (nhân tới 999:1). Giữ hàm rỗng để chỗ gọi cũ khỏi vỡ.
    'function txPotDraw(j){}',

    // ======================= 🎲 BÀN SIC BO 52 Ô =======================
    // SBCUA  = bảng cửa máy chủ gửi (id, tên, trả gốc, trả tối đa) - KHÔNG gõ cứng ở client
    // SBTONG = tiền cả bàn từng cửa + khoá "_toi_<cửa>" là tiền của chính mình.
    // SBCHIP = mệnh giá chip đang chọn.
    'var SBCUA=[],SBTRAN={},SBCHIP=0,SBVEROI=false,SBNHAN=null,SBDANGGUI=false;',
    // Bỏ 5.000 (chủ server), thêm "max" ở cuối — nút MAX CƯỢC màu đỏ.
    'var SBMENH=[1000,10000,20000,50000,100000,"max"];',
    // nạp bảng cửa 1 lần rồi vẽ bàn; các lần sau chỉ cập nhật số
    'function sbNapCua(j){if(!j.txCua||!j.txCua.length)return;',
    'SBTRAN=j.txTran||{};',
    'if(SBVEROI)return;',
    'SBCUA=j.txCua;SBCUA.forEach(function(c){NAMES[c.id]=c.ten});',
    'sbVe();sbVeChip();keoGan("sb");SBVEROI=true}',
    // 1 viên xúc xắc mini (dùng lại bảng chấm PIPS của phần lắc xí ngầu)
    'function sbXx(n){var s=\'<span class="sbXx">\';PIPS[n].forEach(function(p){s+=\'<i style="left:\'+p[0]+\'%;top:\'+p[1]+\'%"></i>\'});return s+"</span>"}',
    'function sbBoXx(ds){return \'<span class="sbBoXx">\'+ds.map(sbXx).join("")+"</span>"}',
    // dựng bàn theo ĐÚNG bố cục ảnh sòng: mỗi khu có dải tiêu đề, ô đôi/ba/cặp/đơn vẽ xúc xắc
    // ===== 🖐️ KÉO THẢ CHIP — dùng chung cho 2 bàn, chỉ khác tiền tố id (sb_/st_) và bộ biến =====
    // Vòng đời: pointerdown lên ô có chip -> CHỜ 0,28s (KEOCHO; nhích >8px hay nhả sớm = bấm thường)
    // -> KÉO (KEO: con ma bay theo tay, hiện vùng huỷ) -> THẢ: ô khác = dời, vùng huỷ = huỷ ô đó,
    // chỗ khác = về chỗ cũ. KEOCLICK chặn cái click trình duyệt bắn ra sau khi nhả tay.
    'var KEO=null,KEOCHO=null,KEOCLICK=0;',
    'function keoBan(pre){return pre==="sb"?{ban:$("sbBan"),phase:PHASE,tong:SBTONG,duong:"/api/tx/",bao:sbBao,tai:refresh}:{ban:$("stBan"),phase:STPHASE,tong:STTONG,duong:"/api/stx/",bao:stBao,tai:stLoad}}',
    'function keoGan(pre){var ban=$(pre+"Ban");if(!ban||ban.dataset.keo)return;ban.dataset.keo="1";',
    'ban.addEventListener("pointerdown",function(ev){keoXuong(pre,ev)});',
    'ban.addEventListener("contextmenu",function(ev){if(KEO||KEOCHO)ev.preventDefault()})}',
    'function keoXuong(pre,ev){if(ev.button&&ev.button!==0)return;var o=ev.target&&ev.target.closest?ev.target.closest(".sbO"):null;if(!o||!o.querySelector(".sbGio"))return;',
    'var B=keoBan(pre);if(B.phase!=="bet")return;var id=o.id.slice(3),tien=B.tong["_toi_"+id]||0;if(!tien)return;',
    'keoHuyCho();var x0=ev.clientX,y0=ev.clientY,pid=ev.pointerId;',
    'var c={pre:pre,o:o,id:id,tien:tien,x:x0,y:y0,pid:pid};',
    'c.move=function(e){if(e.pointerId!==pid)return;c.x=e.clientX;c.y=e.clientY;if(Math.abs(e.clientX-x0)>8||Math.abs(e.clientY-y0)>8)keoHuyCho()};',
    'c.up=function(e){if(e.pointerId!==pid)return;keoHuyCho()};',
    'c.timer=setTimeout(function(){keoHuyCho();keoBatDau(c)},280);',
    'KEOCHO=c;document.addEventListener("pointermove",c.move);document.addEventListener("pointerup",c.up);document.addEventListener("pointercancel",c.up)}',
    'function keoHuyCho(){if(!KEOCHO)return;var c=KEOCHO;KEOCHO=null;clearTimeout(c.timer);document.removeEventListener("pointermove",c.move);document.removeEventListener("pointerup",c.up);document.removeEventListener("pointercancel",c.up)}',
    'function keoVungHuy(){var h=$("sbKeoHuy");if(h)return h;h=document.createElement("div");h.id="sbKeoHuy";h.className="hidden";document.body.appendChild(h);return h}',
    'function keoTen(o){var t=o&&o.querySelector(".sbTen");return t?t.textContent:"?"}',
    'function keoBatDau(c){if(KEO)return;KEOCLICK=Date.now();try{c.o.setPointerCapture(c.pid)}catch(e){}',
    'var g=c.o.querySelector(".sbGio").cloneNode(true);g.classList.add("sbKeoGhost");document.body.appendChild(g);',
    'var huy=keoVungHuy();huy.textContent="🗑️ Thả vào đây để HUỶ cược ô "+keoTen(c.o)+" ("+vnd(c.tien)+")";huy.classList.remove("hidden","hot");',
    'c.o.classList.add("sbKeoNguon");',
    'var k={pre:c.pre,o:c.o,id:c.id,tien:c.tien,pid:c.pid,g:g,huy:huy,dich:null,trenHuy:false};',
    'k.move=function(e){if(e.pointerId!==k.pid)return;if(e.cancelable)e.preventDefault();keoTheo(e.clientX,e.clientY)};',
    'k.up=function(e){if(e.pointerId!==k.pid)return;keoTha(e.clientX,e.clientY)};',
    'k.cancel=function(e){if(e.pointerId!==k.pid)return;keoXong()};',
    'KEO=k;document.addEventListener("pointermove",k.move);document.addEventListener("pointerup",k.up);document.addEventListener("pointercancel",k.cancel);',
    'keoTheo(c.x,c.y);if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}}',
    'function keoTheo(x,y){if(!KEO)return;KEO.g.style.left=x+"px";KEO.g.style.top=y+"px";',
    'var el=document.elementFromPoint(x,y),o=el&&el.closest?el.closest(".sbO"):null,B=keoBan(KEO.pre);',
    'if(o&&!(B.ban&&B.ban.contains(o)))o=null;var trenHuy=!!(el&&el.closest&&el.closest("#sbKeoHuy"));',
    'var dich=(o&&o!==KEO.o)?o:null;if(KEO.dich&&KEO.dich!==dich)KEO.dich.classList.remove("sbKeoDich");KEO.dich=dich;if(dich)dich.classList.add("sbKeoDich");',
    'KEO.huy.classList.toggle("hot",trenHuy);KEO.trenHuy=trenHuy}',
    'function keoXong(){if(!KEO)return;var k=KEO;KEO=null;KEOCLICK=Date.now();',
    'document.removeEventListener("pointermove",k.move);document.removeEventListener("pointerup",k.up);document.removeEventListener("pointercancel",k.cancel);',
    'k.g.remove();k.huy.classList.add("hidden");k.huy.classList.remove("hot");k.o.classList.remove("sbKeoNguon");if(k.dich)k.dich.classList.remove("sbKeoDich");',
    'try{k.o.releasePointerCapture(k.pid)}catch(e){}return k}',
    'function keoTha(x,y){if(!KEO)return;keoTheo(x,y);var k=keoXong(),B=keoBan(k.pre);',
    'if(k.trenHuy){keoGoi(B,"xoacua",{cua:k.id},function(j){return "🗑️ Đã huỷ cược ô "+keoTen(k.o)+", hoàn "+vnd(j.hoan)+(k.pre==="st"?" (gồm cả phí)":" Dogcoin")});return}',
    'if(k.dich){keoGoi(B,"doicua",{tu:k.id,den:k.dich.id.slice(3)},function(j){return "🔀 Đã dời "+vnd(j.tien)+" từ "+keoTen(k.o)+" sang "+keoTen(k.dich)})}}',
    'function keoGoi(B,duong,body,chuXong){if(B.phase!=="bet")return B.bao("Hết giờ đặt rồi - chờ ván sau nhé",true);',
    'api(B.duong+duong,body).then(function(j){BAL=j.balance;$("bal").textContent=vnd(j.balance);B.bao(chuXong(j),false);B.tai()})',
    '.catch(function(e){B.bao(String(e.message||e),true)})}',
    'function sbVe(){var b=$("sbBan");if(!b)return;',
    'var g=function(id){return SBCUA.filter(function(c){return c.id===id})[0]};',
    // ruot = nội dung trong ô (mặc định tên + tỉ lệ); truyền vào để thay bằng hình xúc xắc
    'var o=function(c,them,ruot){if(!c)return "";',
    // CHỈ in tỉ lệ ăn THẬT của ô. c.max là mức cao nhất mà hệ số nhân CÓ THỂ bốc trúng,
    // in ra đây thì người chơi tưởng ô nào cũng ăn mức đó -> chỉ hiện khi ô thực sự sáng.
    'var tl=c.goc+":1";',
    'var trong=ruot!==undefined?ruot:(\'<span class="sbTen">\'+c.ten+\'</span><span class="sbTl">\'+tl+\'</span>\');',
    'return \'<button type="button" class="sbO \'+(them||"")+\'" id="sb_\'+c.id+\'" onclick="sbChon(&quot;\'+c.id+\'&quot;)">\'+trong+\'</button>\'};',
    'var khu=function(t){return \'<div class="sbKhu">\'+t+"</div>"};',
    'var h="";',
    // khu 1: 4 cửa đều tiền + bộ ba bất kỳ, ô to nhất vì hay đặt nhất
    'h+=khu("1:1 · THUA NẾU RA BÃO — riêng BỘ BA BẤT KỲ 30:1");',
    'h+=\'<div class="sbHang">\'+o(g("xiu"),"sbDeu sbXiu")+o(g("le"),"sbDeu")+o(g("baoany"),"sbDeu sbBaoAny")+o(g("chan"),"sbDeu")+o(g("tai"),"sbDeu sbTai")+"</div>";',
    // khu 2: 6 ô gấp đôi — vẽ 2 viên giống nhau
    'h+=khu("8:1 · MỖI ĐÔI");',
    'h+=\'<div class="sbHang">\'+[1,2,3,4,5,6].map(function(n){return o(g("doi"+n),"",sbBoXx([n,n]))}).join("")+"</div>";',
    // khu 3: 6 ô gấp ba — vẽ 3 viên giống nhau
    'h+=khu("150:1 · MỖI BỘ BA");',
    'h+=\'<div class="sbHang">\'+[1,2,3,4,5,6].map(function(n){return o(g("bao"+n),"",sbBoXx([n,n,n]))}).join("")+"</div>";',
    // khu 4: tổng điểm 4..17 — số to, tỉ lệ nhỏ bên dưới; cắt 2 dòng cho vừa điện thoại
    'h+=khu("TỔNG ĐIỂM 3 VIÊN");',
    'var oTong=function(n){var c=g("tong"+n);if(!c)return "";',
    'return o(c,"sbTong",\'<span class="sbTen">\'+n+\'</span><span class="sbTl">\'+c.goc+\':1</span>\')};',
    'h+=\'<div class="sbHang">\'+[4,5,6,7,8,9,10].map(oTong).join("")+"</div>";',
    'h+=\'<div class="sbHang">\'+[11,12,13,14,15,16,17].map(oTong).join("")+"</div>";',
    // khu 5: 15 cửa kết hợp 2 lá — vẽ 2 viên khác nhau
    'h+=khu("5:1 · KẾT HỢP 2 VIÊN");',
    'var cap=SBCUA.filter(function(c){return c.id.indexOf("cap")===0});',
    'var oCap=function(c){var a=+c.id[3],d=+c.id[4];return o(c,"",sbBoXx([a,d]))};',
    'h+=\'<div class="sbHang">\'+cap.slice(0,8).map(oCap).join("")+"</div>";',
    'h+=\'<div class="sbHang">\'+cap.slice(8).map(oCap).join("")+"</div>";',
    // khu 6: 6 cửa số đơn — 1 viên + chữ số
    'h+=khu("ĐƠN · 1 viên 1:1 · 2 viên 2:1 · 3 viên 3:1");',
    'h+=\'<div class="sbHang">\'+[1,2,3,4,5,6].map(function(n){return o(g("don"+n),"",sbBoXx([n]))}).join("")+"</div>";',
    'b.innerHTML=h}',
    // hàng chip: mệnh giá nào vượt số dư thì vẫn hiện, bấm mới báo
    'function sbVeChip(){var e=$("sbChips");if(!e)return;',
    'if(!SBCHIP)SBCHIP=SBMENH[0];',
    'e.innerHTML=SBMENH.map(function(v){',
    'var mx=(v==="max");',
    'var nhan=mx?(\'<img class="dc" src="/dogcoin.png" alt=""> MAX CƯỢC\'):(\'<img class="dc" src="/dogcoin.png" alt=""> \'+vnd(v));',
    'return \'<button class="chip\'+(mx?" chipMax":"")+(v===SBCHIP?" on":"")+\'" onclick="sbDatChip(\'+(mx?\'&quot;max&quot;\':v)+\')">\'+nhan+"</button>"}).join("")}',
    'function sbDatChip(v){SBCHIP=v;sbVeChip()}',
    // MAX CƯỢC = đổ nhiều nhất CÓ THỂ vào ĐÚNG ô đó, chặn bởi 3 thứ:
    //   ví còn bao nhiêu · trần riêng của ô · trần tổng cả ván của một người
    // Nhờ vậy trần ô 200.000 mà ví 400.000 thì chỉ 200.000 vào, không tràn.
    'function sbTienMax(id){',
    'var con=BAL;',
    'var tran=sbTranCua(id),daCo=(SBTONG&&SBTONG["_toi_"+id])||0;',
    'if(tran>0)con=Math.min(con,Math.max(0,tran-daCo));',
    'if(TXMAX>0){var tong=0;for(var k in SBTONG){if(k.indexOf("_toi_")===0)tong+=SBTONG[k]||0}',
    'con=Math.min(con,Math.max(0,TXMAX-tong))}',
    'return Math.floor(con)}',
    // ---- 3 nút thao tác nhanh ----
    // Báo bằng dòng chữ nằm yên dưới nút. Chỉ tự xoá khi thao tác sau thành công,
    // để người chơi đọc kịp câu "không đủ Dogcoin" thay vì popup loé một cái rồi mất.
    'function sbBao(chu,loi){var e=$("sbBao");if(!e)return;',
    'if(!chu){e.classList.add("hidden");e.textContent="";return}',
    'e.textContent=chu;e.classList.remove("hidden","loi","oke");e.classList.add(loi?"loi":"oke")}',
    'var SBNUTBAN=false;',
    'function sbNutGoi(duong,chuXong){',
    'if(PHASE!=="bet")return sbBao("Hết giờ đặt rồi - chờ ván sau nhé",true);',
    'if(!LINKED)return sbBao("Ví chưa được liên kết - nhắn admin",true);',
    'if(SBNUTBAN)return;SBNUTBAN=true;sbNutVe();',
    'api(duong,{}).then(function(j){SBNUTBAN=false;',
    'BAL=j.balance;$("bal").textContent=vnd(j.balance);',
    'sbBao(chuXong(j),false);refresh()})',
    '.catch(function(e){SBNUTBAN=false;sbBao(String(e.message||e),true);sbNutVe()})}',
    'function sbDatLai(){sbNutGoi("/api/tx/datlai",function(j){return "🔁 Đã xếp lại giỏ ván trước: "+vnd(j.tong)+" vào "+j.soCua+" ô"})}',
    'function sbX2(){sbNutGoi("/api/tx/x2",function(j){return "✖️2 Đã gấp đôi: đặt thêm "+vnd(j.tong)+" vào "+j.soCua+" ô"})}',
    'function sbXoaCuoc(){sbNutGoi("/api/tx/xoacuoc",function(j){return "🗑️ Đã xoá cược, hoàn lại "+vnd(j.hoan)+" Dogcoin"})}',
    // bật/tắt 3 nút theo tình hình: hết giờ đặt thì khoá hết, chưa đặt gì thì
    // x2 và xoá vô nghĩa, chưa có ván trước thì không đặt lại được.
    'var SBCOVT=false;',
    'function sbNutVe(){var coCuoc=false;',
    'for(var k in SBTONG){if(k.indexOf("_toi_")===0&&SBTONG[k]>0){coCuoc=true;break}}',
    'var mo=(PHASE==="bet")&&!SBNUTBAN;',
    'var b1=$("sbBtnLai"),b2=$("sbBtnX2"),b3=$("sbBtnXoa");',
    'if(b1)b1.disabled=!(mo&&SBCOVT&&!coCuoc);',
    'if(b2)b2.disabled=!(mo&&coCuoc);',
    'if(b3)b3.disabled=!(mo&&coCuoc)}',
    // BẤM Ô = ĐẶT LUÔN. Chặn sơ ở client cho đỡ gọi phí, nhưng luật thật vẫn ở máy chủ.
    // SBDANGGUI: chặn bấm dồn 2 lần lúc mạng chậm -> khỏi đặt trùng.
    'function sbChon(id){if(KEO||Date.now()-KEOCLICK<500)return;if(PHASE!=="bet")return toast(PHASE==="nhan"?"⚡ Đang hiện hệ số nhân - hết cửa đặt rồi!":"Đang khoá sổ - chờ ván sau!");',
    'if(!LINKED)return toast("Ví chưa được liên kết - nhắn admin");',
    'if(SBDANGGUI)return;',
    // MAX: tính ngay tại ô vừa bấm. Mệnh giá thường: kiểm như cũ.
    'var tien;',
    'if(SBCHIP==="max"){tien=sbTienMax(id);',
    'if(tien<=0)return toast(BAL<=0?"Ví hết Dogcoin rồi":"Cửa "+(NAMES[id]||id)+" đã kịch trần của bạn")}',
    'else{tien=SBCHIP;',
    'if(tien>BAL)return toast("Không đủ Dogcoin - ví còn "+vnd(BAL)+" · bấm MAX CƯỢC để đặt hết");',
    'var tran=sbTranCua(id),daCo=SBTONG&&SBTONG["_toi_"+id]||0;',
    'if(tran>0&&daCo+tien>tran)return toast("Cửa "+(NAMES[id]||id)+" tối đa "+vnd(tran)+"/ván")}',
    'SBDANGGUI=true;sbChipBay(id,tien);',
    'api("/api/bet",{gio:[{choice:id,amount:tien}]}).then(function(j){SBDANGGUI=false;',
    'BAL=j.balance;$("bal").textContent=vnd(j.balance);',
    'toast("💸 "+vnd(tien)+" vào "+(NAMES[id]||id));refresh()})',
    '.catch(function(e){SBDANGGUI=false;toast("❌ "+e.message)})}',
    // ✨ Chip BAY từ hàng mệnh giá vào ô vừa bấm. Thuần trang trí: tự dọn sau khi
    // bay xong, không đụng gì tới DOM của bàn (chip thật do sbVeGio vẽ ở nhịp sau).
    'function sbChipBay(id,tien){',
    'var o=$("sb_"+id),hang=$("sbChips");if(!o||!hang)return;',
    'var d=o.getBoundingClientRect(),n=hang.getBoundingClientRect();',
    'var b=document.createElement("div");b.className="sbBay";',
    'b.innerHTML=\'<img src="/dogcoin.png" alt=""><b>\'+chipNgan(tien)+"</b>";',
    'b.style.left=(n.left+n.width/2)+"px";b.style.top=(n.top+n.height/2)+"px";',
    'document.body.appendChild(b);',
    // ép trình duyệt vẽ vị trí đầu rồi mới đổi -> mới thấy được đường bay
    'void b.offsetWidth;',
    'b.style.transform="translate(-50%,-50%) translate("+((d.left+d.width/2)-(n.left+n.width/2))+"px,"+((d.top+d.height/2)-(n.top+n.height/2))+"px) scale(.8)";',
    'b.style.opacity="0";',
    'setTimeout(function(){b.remove()},520)}',
    'function sbTranCua(id){var c=SBCUA.filter(function(x){return x.id===id})[0];return c&&SBTRAN[c.nhom]?SBTRAN[c.nhom]:0}',
    // vẽ nhãn giỏ + nhãn tiền cả bàn lên từng ô
    // SBTONG: tiền CẢ BÀN từng cửa. Thêm khoá "_toi_<cửa>" = tiền CỦA MÌNH ở cửa đó,
    // để chặn trần ngay tại client trước khi gọi máy chủ.
    'var SBTONG={};',
    'function sbTong(t,cuaToi){SBTONG=t||{};',
    'if(cuaToi)cuaToi.forEach(function(b){SBTONG["_toi_"+b.choice]=(SBTONG["_toi_"+b.choice]||0)+b.amount});',
    'sbVeGio()}',
    // Lưu ý: hàm này chạy lại mỗi nhịp làm mới. Nó CHỈ thêm/bớt chip, KHÔNG đụng tới
    // class sbTrung/sbTruot — nhờ vậy khi đã tô kết quả thì CSS tự giấu chip ô trượt.
    'function sbVeGio(){SBCUA.forEach(function(c){var e=$("sb_"+c.id);if(!e)return;',
    'var cu=e.querySelector(".sbGio");if(cu)cu.remove();',
    'var cu2=e.querySelector(".sbBan2");if(cu2)cu2.remove();',
    'var toi=SBTONG["_toi_"+c.id]||0;e.classList.toggle("sbCoChip",toi>0);',
    'if(toi){var d=document.createElement("span");d.className="sbGio"+(toi>=CHIP_DEN?" sbGioDen":"");',
    'var im=document.createElement("img");im.src="/dogcoin.png";im.alt="";',
    'var sn=document.createElement("b");sn.textContent=chipNgan(toi);',
    'd.appendChild(im);d.appendChild(sn);d.title=vnd(toi)+" Dogcoin";e.appendChild(d)}',
    'if(SBTONG[c.id]){var d2=document.createElement("span");d2.className="sbBan2";d2.textContent="bàn "+vnd(SBTONG[c.id]);e.appendChild(d2)}',
    'e.classList.toggle("sbKhoa",PHASE!=="bet")})}',
    // 🎯 Tô kết quả lên bàn: ô trúng sáng, ô trượt xám. Danh sách ô trúng do MÁY CHỦ
    // gửi (tính từ lõi tiền), phía người chơi không tự đoán luật.
    'function sbToKetQua(nan){if(!nan||!nan.thang||SBKQ===nan.gameId)return;SBKQ=nan.gameId;',
    'var an={};nan.thang.forEach(function(k){an[k]=1});',
    'SBCUA.forEach(function(c){var e=$("sb_"+c.id);if(!e)return;',
    'e.classList.toggle("sbTrung",!!an[c.id]);e.classList.toggle("sbTruot",!an[c.id])})}',
    'function sbXoaKetQua(){if(!SBKQ)return;SBKQ=0;',
    'SBCUA.forEach(function(c){var e=$("sb_"+c.id);if(!e)return;',
    'e.classList.remove("sbTrung","sbTruot")})}',
    // hệ số nhân: máy chủ chỉ gửi sau khi KHOÁ SỔ nên không lộ sớm
    // Chỉ gắn huy hiệu x… lên đúng ô được bốc. KHÔNG liệt kê lại thành một dòng
    // phía trên nữa (chủ server: "nhân ở dưới show là được rồi").
    'function sbNhanVe(nh){SBNHAN=nh||null;',
    'SBCUA.forEach(function(c){var e=$("sb_"+c.id);if(!e)return;',
    'var cu=e.querySelector(".sbX");if(cu)cu.remove();',
    'var co=nh&&nh[c.id];e.classList.toggle("sbNhan",!!co);',
    'if(co){var d=document.createElement("span");d.className="sbX";d.textContent="x"+co;e.appendChild(d)}})}',
    // (không còn giỏ cược — bấm ô là gửi thẳng, xem sbChon bên trên)
    // ================= ⚡ BÀN SIÊU TÀI XỈU (phía người chơi) =================
    // Bàn riêng, nhịp riêng, đường gọi riêng /api/stx/*. Chỉ hỏi máy chủ khi đang
    // ĐỨNG Ở TAB NÀY, khỏi tốn băng thông cho người không chơi.
    'var STCUA=[],STTRAN={},STNAMES={},STCHIP=0,STMENH=[1000,10000,20000,50000,100000,"max"];',
    'var STPHASE="off",STTT=0,STKHOA=24,STKQ=4,STPHI=0.2,STSAN=1000,STMAX=0,STTONG={},STVEROI=false;',
    'var STNAN=null,STDANGGUI=false,STKQVAN=0,STDANAN=0,STCOVT=false,STPHITOI=0;',

    // ---- dựng bàn (cùng bố cục bàn thường, chỉ khác lớp CSS) ----
    'function stVe(){var b=$("stBan");if(!b)return;',
    'var g=function(id){return STCUA.filter(function(c){return c.id===id})[0]};',
    'var o=function(c,them,ruot){if(!c)return "";',
    'var tl=c.goc+":1";',
    'var trong=ruot!==undefined?ruot:(\'<span class="sbTen">\'+c.ten+\'</span><span class="sbTl">\'+tl+\'</span>\');',
    // "sbO stO": sbO để ăn mọi phụ kiện dùng chung (chip, nhãn, chữ), stO để tô tông đen.
    'return \'<button type="button" class="sbO stO \'+(them||"")+\'" id="st_\'+c.id+\'" onclick="stChon(&quot;\'+c.id+\'&quot;)">\'+trong+"</button>"};',
    'var khu=function(t){return \'<div class="stKhu">\'+t+"</div>"};',
    'var h="";',
    'h+=khu("1:1 tới 14:1 · THUA NẾU RA BÃO — riêng BỘ BA BẤT KỲ 30:1");',
    'h+=\'<div class="sbHang">\'+o(g("xiu"),"sbDeu sbXiu")+o(g("le"),"sbDeu")+o(g("baoany"),"sbDeu sbBaoAny")+o(g("chan"),"sbDeu")+o(g("tai"),"sbDeu sbTai")+"</div>";',
    'h+=khu("8:1 · MỖI ĐÔI");',
    'h+=\'<div class="sbHang">\'+[1,2,3,4,5,6].map(function(n){return o(g("doi"+n),"",sbBoXx([n,n]))}).join("")+"</div>";',
    'h+=khu("150:1 · MỖI BỘ BA");',
    'h+=\'<div class="sbHang">\'+[1,2,3,4,5,6].map(function(n){return o(g("bao"+n),"",sbBoXx([n,n,n]))}).join("")+"</div>";',
    'h+=khu("TỔNG ĐIỂM 3 VIÊN");',
    'var oTong=function(n){var c=g("tong"+n);if(!c)return "";',
    'return o(c,"sbTong",\'<span class="sbTen">\'+n+\'</span><span class="sbTl">\'+c.goc+\':1</span>\')};',
    'h+=\'<div class="sbHang">\'+[4,5,6,7,8,9,10].map(oTong).join("")+"</div>";',
    'h+=\'<div class="sbHang">\'+[11,12,13,14,15,16,17].map(oTong).join("")+"</div>";',
    'h+=khu("5:1 · KẾT HỢP 2 VIÊN");',
    'var cap=STCUA.filter(function(c){return c.id.indexOf("cap")===0});',
    'var oCap=function(c){var a=+c.id[3],d=+c.id[4];return o(c,"",sbBoXx([a,d]))};',
    'h+=\'<div class="sbHang">\'+cap.slice(0,8).map(oCap).join("")+"</div>";',
    'h+=\'<div class="sbHang">\'+cap.slice(8).map(oCap).join("")+"</div>";',
    'h+=khu("ĐƠN · 1 viên 1:1 · 2 viên 2:1 · 3 viên 3:1");',
    'h+=\'<div class="sbHang">\'+[1,2,3,4,5,6].map(function(n){return o(g("don"+n),"",sbBoXx([n]))}).join("")+"</div>";',
    'b.innerHTML=h}',

    // ---- hàng mệnh giá (có MAX như bàn thường) ----
    'function stVeChip(){var e=$("stChips");if(!e)return;',
    'if(!STCHIP)STCHIP=STMENH[0];',
    'e.innerHTML=STMENH.map(function(v){var mx=(v==="max");',
    'var nhan=mx?(\'<img class="dc" src="/dogcoin.png" alt=""> MAX CƯỢC\'):(\'<img class="dc" src="/dogcoin.png" alt=""> \'+vnd(v));',
    'return \'<button class="chip\'+(mx?" chipMax":"")+(v===STCHIP?" on":"")+\'" onclick="stDatChip(\'+(mx?\'&quot;max&quot;\':v)+\')">\'+nhan+"</button>"}).join("");',
    // 💸 nhắc phí NGAY DƯỚI hàng mệnh giá, kèm số tiền thật sẽ bị trừ
    'var p=$("stPhiNho");if(p){var m=(STCHIP==="max")?null:STCHIP;',
    'p.innerHTML=m?("💸 Bấm 1 ô là trừ <b>"+vnd(Math.floor(m*(1+STPHI)))+"</b> (cược "+vnd(m)+" + phí "+vnd(Math.floor(m*STPHI))+")")',
    ':("💸 MAX CƯỢC: đổ hết mức cho phép, ví bị trừ thêm <b>"+Math.round(STPHI*100)+"% phí</b>")}}',
    'function stDatChip(v){STCHIP=v;stVeChip()}',
    'function stTranCua(id){var c=STCUA.filter(function(x){return x.id===id})[0];return c&&STTRAN[c.nhom]?STTRAN[c.nhom]:0}',
    // MAX: chặn bởi VÍ (đã tính phí) + trần ô + trần tổng ván
    'function stTienMax(id){var con=Math.floor(BAL/(1+STPHI));',
    'var tran=stTranCua(id),daCo=STTONG["_toi_"+id]||0;',
    'if(tran>0)con=Math.min(con,Math.max(0,tran-daCo));',
    'if(STMAX>0){var t=0;for(var k in STTONG){if(k.indexOf("_toi_")===0)t+=STTONG[k]||0}',
    'con=Math.min(con,Math.max(0,STMAX-t))}',
    'return Math.floor(con)}',

    // ---- bấm ô là đặt ----
    'function stChon(id){if(KEO||Date.now()-KEOCLICK<500)return;if(STPHASE!=="bet")return stBao(STPHASE==="nhan"?"⚡ Đang hiện hệ số nhân - hết cửa đặt rồi!":"Đang khoá sổ - chờ ván sau!",true);',
    'if(!LINKED)return stBao("Ví chưa được liên kết - nhắn admin",true);',
    'if(STDANGGUI)return;',
    'var tien;',
    'if(STCHIP==="max"){tien=stTienMax(id);',
    'if(tien<STSAN)return stBao(tien<=0?"Ví hết Dogcoin rồi":("Còn quá ít - mỗi ô tối thiểu "+vnd(STSAN)),true)}',
    'else{tien=STCHIP;',
    'var can=Math.floor(tien*(1+STPHI));',
    'if(can>BAL)return stBao("Không đủ Dogcoin - cần "+vnd(can)+" (đã gồm phí), ví còn "+vnd(BAL),true);',
    'var tran=stTranCua(id),daCo=STTONG["_toi_"+id]||0;',
    'if(tran>0&&daCo+tien>tran)return stBao("Cửa "+(STNAMES[id]||id)+" tối đa "+vnd(tran)+"/ván",true)}',
    'STDANGGUI=true;sbChipBay2(id,tien);',
    'api("/api/stx/bet",{gio:[{choice:id,amount:tien}]}).then(function(j){STDANGGUI=false;',
    'BAL=j.balance;$("bal").textContent=vnd(j.balance);',
    'stBao("💸 Đặt "+vnd(j.tong)+" + phí "+vnd(j.phi)+" = trừ "+vnd(j.truVi),false);stLoad()})',
    '.catch(function(e){STDANGGUI=false;stBao(String(e.message||e),true)})}',
    // đồng xu bay — dùng lại hiệu ứng của bàn thường, chỉ đổi ô đích
    'function sbChipBay2(id,tien){var o=$("st_"+id),hang=$("stChips");if(!o||!hang)return;',
    'var d=o.getBoundingClientRect(),n=hang.getBoundingClientRect();',
    'var b=document.createElement("div");b.className="sbBay";',
    'b.innerHTML=\'<img src="/dogcoin.png" alt=""><b>\'+chipNgan(tien)+"</b>";',
    'b.style.left=(n.left+n.width/2)+"px";b.style.top=(n.top+n.height/2)+"px";',
    'document.body.appendChild(b);void b.offsetWidth;',
    'b.style.transform="translate(-50%,-50%) translate("+((d.left+d.width/2)-(n.left+n.width/2))+"px,"+((d.top+d.height/2)-(n.top+n.height/2))+"px) scale(.8)";',
    'b.style.opacity="0";setTimeout(function(){b.remove()},520)}',

    // ---- dòng báo đứng yên + 3 nút ----
    'function stBao(chu,loi){var e=$("stBao");if(!e)return;',
    'if(!chu){e.classList.add("hidden");e.textContent="";return}',
    'e.textContent=chu;e.classList.remove("hidden","loi","oke");e.classList.add(loi?"loi":"oke")}',
    'var STNUTBAN=false;',
    'function stNutGoi(duong,chuXong){',
    'if(STPHASE!=="bet")return stBao("Hết giờ đặt rồi - chờ ván sau nhé",true);',
    'if(!LINKED)return stBao("Ví chưa được liên kết - nhắn admin",true);',
    'if(STNUTBAN)return;STNUTBAN=true;stNutVe();',
    'api(duong,{}).then(function(j){STNUTBAN=false;BAL=j.balance;$("bal").textContent=vnd(j.balance);',
    'stBao(chuXong(j),false);stLoad()})',
    '.catch(function(e){STNUTBAN=false;stBao(String(e.message||e),true);stNutVe()})}',
    'function stDatLai(){stNutGoi("/api/stx/datlai",function(j){return "🔁 Xếp lại giỏ ván trước: "+vnd(j.tong)+" + phí "+vnd(j.phi)})}',
    'function stX2(){stNutGoi("/api/stx/x2",function(j){return "✖️2 Đặt thêm "+vnd(j.tong)+" + phí "+vnd(j.phi)})}',
    'function stXoaCuoc(){stNutGoi("/api/stx/xoacuoc",function(j){return "🗑️ Đã xoá cược, hoàn "+vnd(j.hoan)+" (gồm cả phí)"})}',
    'function stNutVe(){var coCuoc=false;',
    'for(var k in STTONG){if(k.indexOf("_toi_")===0&&STTONG[k]>0){coCuoc=true;break}}',
    'var mo=(STPHASE==="bet")&&!STNUTBAN;',
    'var b1=$("stBtnLai"),b2=$("stBtnX2"),b3=$("stBtnXoa");',
    'if(b1)b1.disabled=!(mo&&STCOVT&&!coCuoc);',
    'if(b2)b2.disabled=!(mo&&coCuoc);',
    'if(b3)b3.disabled=!(mo&&coCuoc)}',

    // ---- chip tiền trên ô + hệ số nhân + tô kết quả ----
    'function stVeGio(){STCUA.forEach(function(c){var e=$("st_"+c.id);if(!e)return;',
    'var cu=e.querySelector(".sbGio");if(cu)cu.remove();',
    'var cu2=e.querySelector(".sbBan2");if(cu2)cu2.remove();',
    'var toi=STTONG["_toi_"+c.id]||0;e.classList.toggle("sbCoChip",toi>0);',
    'if(toi){var d=document.createElement("span");d.className="sbGio"+(toi>=CHIP_DEN?" sbGioDen":"");',
    'var im=document.createElement("img");im.src="/dogcoin.png";im.alt="";',
    'var sn=document.createElement("b");sn.textContent=chipNgan(toi);',
    'd.appendChild(im);d.appendChild(sn);d.title=vnd(toi)+" Dogcoin";e.appendChild(d)}',
    'if(STTONG[c.id]){var d2=document.createElement("span");d2.className="sbBan2";d2.textContent="bàn "+vnd(STTONG[c.id]);e.appendChild(d2)}',
    'e.classList.toggle("sbKhoa",STPHASE!=="bet")})}',
    'function stNhanVe(nh){STCUA.forEach(function(c){var e=$("st_"+c.id);if(!e)return;',
    'var cu=e.querySelector(".sbX");if(cu)cu.remove();',
    'var co=nh&&nh[c.id];e.classList.toggle("sbNhan",!!co);',
    'if(co){var d=document.createElement("span");d.className="sbX";d.textContent="x"+co;e.appendChild(d)}})}',
    'function stToKetQua(nan){if(!nan||!nan.thang||STKQVAN===nan.gameId)return;STKQVAN=nan.gameId;',
    'var an={};nan.thang.forEach(function(k){an[k]=1});',
    'STCUA.forEach(function(c){var e=$("st_"+c.id);if(!e)return;',
    'e.classList.toggle("sbTrung",!!an[c.id]);e.classList.toggle("sbTruot",!an[c.id])})}',
    'function stXoaKetQua(){if(!STKQVAN)return;STKQVAN=0;',
    'STCUA.forEach(function(c){var e=$("st_"+c.id);if(!e)return;e.classList.remove("sbTrung","sbTruot")})}',

    // ---- nặn chén (dùng lại cơ chế kéo của bàn thường, id riêng) ----
    'var stDrag=false,stX=0,stY=0,stBX=0,stBY=0,stX0=0,stY0=0;',
    'function stInitPaper(){var p=$("stPaper");if(!p)return;',
    'p.addEventListener("pointerdown",function(e){if(STPHASE!=="nan"||!STNAN||STDANAN===STNAN.gameId)return;',
    'stDrag=true;stX0=e.clientX;stY0=e.clientY;stBX=stX;stBY=stY;p.setPointerCapture(e.pointerId);e.preventDefault()});',
    'p.addEventListener("pointermove",function(e){if(!stDrag)return;var st=$("stStage");',
    'var mw=st.offsetWidth+30,mh=st.offsetHeight+30;',
    'stX=Math.max(-mw,Math.min(mw,stBX+(e.clientX-stX0)));stY=Math.max(-mh,Math.min(mh,stBY+(e.clientY-stY0)));',
    'p.style.transform="translate("+stX+"px,"+stY+"px)";stCheck()});',
    'function up(){stDrag=false}p.addEventListener("pointerup",up);p.addEventListener("pointercancel",up)}',
    'function stCheck(){if(!STNAN||STDANAN===STNAN.gameId)return;',
    'var pr=$("stPaper").getBoundingClientRect(),dies=document.querySelectorAll("#stDiceRow .die");',
    'if(dies.length<3)return;',
    'for(var i=0;i<dies.length;i++){if(rectOverlap(pr,dies[i].getBoundingClientRect()))return}stNanXong()}',
    'function stNanXong(){if(!STNAN||STDANAN===STNAN.gameId)return;STDANAN=STNAN.gameId;',
    'var p=$("stPaper");p.classList.add("hidden");stShowDice(STNAN.dice,true);stToKetQua(STNAN);',
    'api("/api/stx/reveal",{}).then(function(j){',
    'if(typeof j.balance==="number"){BAL=j.balance;$("bal").textContent=vnd(j.balance)}',
    'if(j.stake>0)showNet(j.net)}).catch(function(){})}',
    'function stShowDice(dice,co){$("stDiceRow").innerHTML=dice.map(dieHTML).join("");',
    'var b=$("stSumBadge");if(co){var s2=dice[0]+dice[1]+dice[2];',
    'b.innerHTML="Tổng "+s2+" - <span class=\'"+(s2>=11?"t":"x")+"\'>"+(s2>=11?"TÀI":"XỈU")+"</span> · <span class=\'"+(s2%2===0?"ce":"od")+"\'>"+(s2%2===0?"CHẴN":"LẺ")+"</span>";',
    'b.classList.remove("hidden")}else b.classList.add("hidden")}',
    'function stResetPaper(){stX=0;stY=0;stDrag=false;var p=$("stPaper");p.style.transition="";p.style.transform="translate(0,0)"}',
    'var stTuMo=0;',
    'function stAutoMo(){if(!STNAN||stTuMo===STNAN.gameId)return;stTuMo=STNAN.gameId;',
    'var p=$("stPaper"),h=$("stStage").offsetHeight;',
    'p.style.transition="transform .6s ease-in";p.style.transform="translate("+stX+"px,"+(h+60)+"px)";',
    'setTimeout(function(){stNanXong()},600)}',

    // ---- nhịp: chỉ hỏi máy chủ khi đang ở tab này ----
    'function stLoad(){if(CURPAGE!=="stx")return;',
    'api("/api/stx/state").then(stVeTrang).catch(function(){})}',
    'function stVeTrang(j){',
    'STCUA=j.cua||[];STTRAN=j.tran||{};STMAX=j.maxBet||0;STPHI=j.phi||0.2;STSAN=j.sanCuoc||1000;',
    'STKHOA=j.khoaSoS||24;STKQ=j.kqS||4;STCOVT=!!j.coVanTruoc;STPHITOI=j.phiToi||0;',
    'STCUA.forEach(function(c){STNAMES[c.id]=c.ten});',
    'if(!STVEROI&&STCUA.length){stVe();stVeChip();stInitPaper();keoGan("st");STVEROI=true}',
    'var truoc=STPHASE;STPHASE=j.phase;STTT=j.targetTime;STNAN=j.nan;',
    'STTONG={};for(var k in (j.totals||{}))STTONG[k]=j.totals[k];',
    '(j.myBets||[]).forEach(function(b){STTONG["_toi_"+b.choice]=b.amount});',
    'stVeGio();stNhanVe(j.nhan);',
    'if(j.nan&&STDANAN===j.nan.gameId)stToKetQua(j.nan);',
    'if(STPHASE==="bet")stXoaKetQua();',
    'if(truoc!=="bet"&&STPHASE==="bet"){stBao("",false);stResetPaper();stTuMo=0}',
    '$("stRound").textContent="Ván #"+String(j.gameId).padStart(5,"0");',
    'var stt=$("stStt"),cap=$("stStageCap"),paper=$("stPaper");',
    'if(STPHASE==="bet"){stt.textContent="🟢 Đang nhận cược";',
    'stResetPaper();paper.classList.remove("hidden","open");paper.classList.add("locked");',
    'var h0=(j.history||[])[0];cap.textContent=h0?("Ván trước #"+String(h0.gameId).padStart(5,"0")+": "+h0.dice.join("-")+" = "+h0.sum+" ("+h0.tx+")"):"Đặt cược đi!";',
    'if(h0)stShowDice(h0.dice,false);else $("stDiceRow").innerHTML="";$("stSumBadge").classList.add("hidden")}',
    'else if(STPHASE==="nhan"){stt.textContent="⚡ KHÓA SỔ - đang quay hệ số nhân!";',
    'cap.textContent="Xúc xắc CHƯA lắc - hết mấy giây này mới tới lượt nặn chén.";',
    'stResetPaper();paper.classList.remove("hidden","open");paper.classList.add("locked")}',
    'else if(STPHASE==="nan"&&STNAN){stt.textContent="🀫 Khóa sổ - GIỜ NẶN ĐÂY!";',
    'if(STDANAN===STNAN.gameId){paper.classList.add("hidden");stShowDice(STNAN.dice,true);cap.textContent="Bạn nặn xong rồi - tiền đã về ví"}',
    'else{stShowDice(STNAN.dice,false);paper.classList.remove("hidden","locked");paper.classList.add("open");',
    'cap.textContent="Giữ và kéo chén ra - lộ đủ 3 viên là ra điểm 🤫"}}',
    'else if(STPHASE==="wait"){stt.textContent="⏳ Đang mở bát...";cap.textContent=""}',
    'else{stt.textContent="🔴 Bàn Siêu Tài Xỉu đang tắt";cap.textContent="";paper.classList.add("hidden")}',
    'var m=(j.myBets||[]),tong=0;m.forEach(function(b){tong+=b.amount});',
    '$("stMine").textContent=m.length?("🧾 Ván này bạn đặt "+vnd(tong)+" + phí "+vnd(STPHITOI)+" vào "+m.length+" ô"):"";',
    'stNutVe();stWho(j.betsList||[]);stHist(j.history||[])}',
    'function stWho(list){var box=$("stWho");if(!box)return;if(!list.length){box.innerHTML="Chưa ai đặt.";return}',
    'var by={};list.forEach(function(b){(by[b.choice]=by[b.choice]||[]).push(b)});',
    'box.innerHTML=STCUA.map(function(x){return x.id}).filter(function(c){return by[c]}).map(function(c){',
    'return \'<div style="padding:3px 0"><b style="color:\'+cuaMau(c)+\'">\'+(STNAMES[c]||c)+"</b>: "+by[c].map(function(b){return \'<span style="color:\'+userColor(b.u)+\'">\'+esc(b.name)+"</span> "+vnd(b.amount)}).join(" · ")+"</div>"}).join("")}',
    'function stHist(list){var box=$("stHist");if(!box)return;',
    'if(!list.length){box.innerHTML="Chưa có ván nào.";return}',
    'box.innerHTML=list.slice(0,20).map(function(h){',
    'var cuoc=0,an=0,co=false;',
    '(h.bets||[]).forEach(function(b){if(b.u===MYID){cuoc+=b.amount;co=true}});',
    '(h.winners||[]).forEach(function(w){if(w.u===MYID)an+=w.amount});',
    'var net=an-Math.floor(cuoc*(1+STPHI));',
    'var tai=(h.tx==="TÀI"),chan=(h.cl==="CHẴN");',
    'var kq=h.storm?"🌪️ BÃO":(\'<span class="\'+(tai?"t":"x")+\'">\'+h.tx+\'</span><span class="sep"> | </span><span class="\'+(chan?"ce":"od")+\'">\'+h.cl+"</span>");',
    'var nh=h.nhan||{},ids=Object.keys(nh).sort(function(a,b){return nh[b]-nh[a]});',
    'var phu=ids.length?(\'<div class="hsub">\'+ids.slice(0,3).map(function(k){return \'<span class="xx">x\'+nh[k]+"</span>"+(STNAMES[k]||k)}).join(" · ")+"</div>"):\'<div class="hsub"></div>\';',
    'return \'<div class="hrow\'+(h.storm?" storm":"")+\'">\'+',
    '\'<span class="gid">#\'+String(h.gameId).padStart(5,"0")+"</span>"+',
    '\'<span class="dd">\'+h.dice.map(mdie).join("")+"</span>"+',
    '\'<span class="sum">(\'+h.sum+")</span>"+',
    '\'<span class="kq">\'+kq+"</span>"+',
    '(co?\'<span class="net \'+(net>=0?"w":"l")+\'">\'+(net>=0?"+":"")+vnd(net)+"</span>":"")+',
    '"</div>"+phu}).join("")}',
    // đồng hồ riêng cho bàn siêu
    'setInterval(function(){if(CURPAGE!=="stx")return;var el=$("stClock");if(!el)return;',
    'var now=srvNow();',
    'if(STPHASE==="bet"){var s2=STTT-STKHOA-now;el.textContent=(s2>0?s2:0)+"s";el.style.color=""}',
    'else if(STPHASE==="nan"){var s3=STTT-now;el.textContent="🀫 "+(s3>0?s3:0)+"s";el.style.color="#ffcf5c";',
    'if(s3<=STKQ&&STNAN&&STDANAN!==STNAN.gameId)stAutoMo()}',
    'else{el.textContent="--";el.style.color=""}},1000);',
    'setInterval(stLoad,2000);',

    'var PAGE_GRP={tx:"games",stx:"games",mine:"games",stair:"games",wheel:"games",stock:"games",spm:"games",debt:"profile",gift:"profile",daily:"profile",pal:"profile",pick:"profile",shop:"profile",dog:"profile",poker:"poker",tienlen:"tienlen"};',
    'var GRP_LAST={games:"tx",profile:"daily",poker:"poker",tienlen:"tienlen"};',
    'var CURPAGE="tx";',
    'function go(p){CURPAGE=p;',
    '$("pageTx").classList.toggle("hidden",p!=="tx");',
    '$("pageStx").classList.toggle("hidden",p!=="stx");',
    'if(p==="stx")stLoad();',
    '$("pageMine").classList.toggle("hidden",p!=="mine");',
    '$("pageStair").classList.toggle("hidden",p!=="stair");',
    '$("pageWheel").classList.toggle("hidden",p!=="wheel");',
    '$("pagePal").classList.toggle("hidden",p!=="pal");',
    '$("pagePick").classList.toggle("hidden",p!=="pick");',
    '$("pageShop").classList.toggle("hidden",p!=="shop");',
    '$("pageDog").classList.toggle("hidden",p!=="dog");',
    '$("pageDaily").classList.toggle("hidden",p!=="daily");',
    '$("pageDebt").classList.toggle("hidden",p!=="debt");',
    '$("pageGift").classList.toggle("hidden",p!=="gift");if(p==="gift")giftSync();',
    '$("pageStock").classList.toggle("hidden",p!=="stock");',
    '$("pageSpm").classList.toggle("hidden",p!=="spm");',
    '$("pagePoker").classList.toggle("hidden",p!=="poker");',   // 🃏 khung nhúng /poker/
    '$("pageTienlen").classList.toggle("hidden",p!=="tienlen");',   // 🀄 khung nhúng /tienlen/
    '$("histCard").classList.toggle("hidden",p!=="tx");', // lịch sử là của Tài Xỉu
    '$("navTx").classList.toggle("on",p==="tx");',
    '$("navStx").classList.toggle("on",p==="stx");',
    '$("navMine").classList.toggle("on",p==="mine");',
    '$("navStair").classList.toggle("on",p==="stair");',
    '$("navWheel").classList.toggle("on",p==="wheel");',
    '$("navPal").classList.toggle("on",p==="pal");',
    '$("navPick").classList.toggle("on",p==="pick");',
    '$("navShop").classList.toggle("on",p==="shop");',
    '$("navDog").classList.toggle("on",p==="dog");',
    '$("navDaily").classList.toggle("on",p==="daily");',
    '$("navDebt").classList.toggle("on",p==="debt");',
    '$("navGift").classList.toggle("on",p==="gift");',
    '$("navStock").classList.toggle("on",p==="stock");',
    '$("navSpm").classList.toggle("on",p==="spm");',
    // nhóm trang: tầng 1 chọn nhóm, tầng 2 chỉ hiện trang trong nhóm (nhớ trang cuối mỗi nhóm)
    'var g=PAGE_GRP[p]||"games";GRP_LAST[g]=p;',
    '$("ngProfile").classList.toggle("on",g==="profile");',
    '$("ngGames").classList.toggle("on",g==="games");',
    '$("ngPoker").classList.toggle("on",g==="poker");',
    '$("ngTienlen").classList.toggle("on",g==="tienlen");',
    // vào nhóm poker thì giấu luôn tầng 2 (không có trang con) - khung nhúng tự lo phần còn lại
    '$("nav").style.display=(g==="poker"||g==="tienlen")?"none":"";',
    'document.body.classList.toggle("pokerFull",g==="poker"||g==="tienlen");',   // 🃏🀄 phủ kín màn hình
    '["navTx","navStx","navMine","navStair","navWheel","navStock","navSpm"].forEach(function(id){var e=$(id);if(e)e.style.display=(g==="games")?"":"none"});',
    '["navDaily","navPal","navPick","navShop","navDog","navDebt","navGift"].forEach(function(id){$(id).style.display=(g==="profile")?"":"none"});',
    'localStorage.setItem("play_page",p);',
    'if(p==="poker"){var pf=$("pokerFrame");if(pf&&!/\\/poker\\/$/.test(pf.src))pf.src="/poker/"}',   // 🃏 tải khung lúc vào tab
    'if(p==="tienlen"){var tf=$("tlFrame");if(tf&&!/\\/tienlen\\/$/.test(tf.src))tf.src="/tienlen/"}',   // 🀄
    'if(p==="mine")mSync();else if(p==="stair")sSync();else if(p==="daily"){dailySync();pcSync()}else if(p==="wheel")wheelSync();else if(p==="pal")pwSync();else if(p==="pick")pkSync();else if(p==="shop")isSync();else if(p==="spm")spmEnter();else if(p==="dog")dogSync();else if(p==="stock"){skSync();skHist(1)}else refresh()}',
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
    'return \'<div class="mstep \'+c+\'" id="ms\'+k+\'">\'+(cap?"TỐI ĐA":fx(m))+',
    '(k===TAB.length?\'<span class="tag">\'+(FLAT?("Ô "+CUT+"+ · TỐI ĐA"):"MỞ HẾT")+\'</span>\':"")+"</div>"}).join("");',
    '$("mbar").innerHTML=\'<button class="mpg" onclick="mPg(-1)"\'+(MPAGE<=0?" disabled":"")+">◀</button>"+cells+',
    '\'<button class="mpg" onclick="mPg(1)"\'+(MPAGE>=np-1?" disabled":"")+">▶</button>"}',
    'function mPg(d){var L=MTAB.length?MTAB[MTAB.length-1]:0,C=MTAB.length;',
    'for(var q=0;q<MTAB.length;q++){if(MTAB[q]===L){C=q+1;break}}',   // cùng cách gộp trần như mBar
    'var np=Math.max(1,Math.ceil(C/MPER));',
    'MPAGE=Math.min(np-1,Math.max(0,MPAGE+d));MPGMAN=true;mBar()}',
    // hai cột đếm + nút hành động (nút đổi giữa BẮT ĐẦU và NHẬN TIỀN)
    'function potTab(id,m){var e=$(id);if(e)e.textContent=(m&&m.length?("🏆 NỔ HŨ x"+m.join("/x")):"")}',
    'function mBand(){var go=$("mGo");',
    'potTab("mPotHdr",MPOTMULTS);var mpl=$("mPotLine");if(mpl){var mb0=mNum("mBet")||MINBET;mpl.textContent="🏆 NỔ HŨ: trúng 🏆 trong hộp 🍀 là bốc ngẫu nhiên x"+MPOTMULTS.join("/x")+" TIỀN CƯỢC (cược "+vnd(mb0)+" → "+vnd(mb0*Math.min.apply(null,MPOTMULTS))+" tới "+vnd(mb0*Math.max.apply(null,MPOTMULTS))+") + kịch khung ván, ván dừng ngay · cược tối thiểu "+vnd(MINBET)+"/ván"}',
    'var fe=$("mExtraFee");if(fe)fe.textContent=vnd(Math.floor((mNum("mBet")||0)*0.3));',
    // Ô tick chỉ có tác dụng cho VÁN MỚI. Đang giữa ván thì khoá lại + nói thẳng ván này
    // đang có mấy ô 🍀, hết cảnh tick giữa ván rồi tưởng ván đang chạy được thêm cỏ.
    'var xb=$("mExtra"),xt=$("mExtraTxt"),xw=$("mExtraWrap");',
    'if(xb&&xt&&xw){if(MG){xb.disabled=true;xb.checked=!!MG.extraLucky;xw.style.cursor="default";xw.style.opacity="0.85";',
    'xt.innerHTML=(MG.luckyTotal>0)?("🍀 Ván này giấu <b>"+MG.luckyTotal+"</b> ô cỏ may mắn (đã mua) · còn <b>"+(MG.luckyLeft||0)+"</b> ô chưa mở"):"🍀 Ván này KHÔNG mua cỏ may mắn";',
    '}else{xb.disabled=false;xw.style.cursor="pointer";xw.style.opacity="1";',
    'xt.innerHTML=\'🍀 Mua 1 cỏ may mắn (phí <b id="mExtraFee">\'+vnd(Math.floor((mNum("mBet")||0)*0.3))+\'</b> = 30% cược)\';}}',
    'if(MG){',
    '$("mLeft").textContent=(MG.maxDiamonds-MG.revealed.length);',
    '$("mBombN").textContent=MG.totalMines;',
    '$("mStat").textContent=MG.totalMines+" mìn · cược "+vnd(MG.bet)+" · "+fx(MG.multi)+(MG.capped?" · kịch khung":"")+(MG.assistCapHit?" · ⚠️ mở được nhờ "+(MG.assistWhy||"trợ giúp 🍀")+" nên chỉ thưởng TỐI ĐA ×"+MG.assistCap+" - mở thêm KHÔNG tăng tiền":"");',
    // 09/09: ván có trợ giúp chạm trần -> toast đỏ 1 lần/ván, nút NHẬN TIỀN ghi thẳng "NÊN DỪNG"
    'var mcw=$("mCapWarn");if(mcw){mcw.classList.toggle("show",!!MG.assistCapHit);if(MG.assistCapHit)mcw.textContent="⚠️ Ván này bạn mở được nhờ "+(MG.assistWhy||"trợ giúp 🍀")+" nên chỉ thưởng TỐI ĐA ×"+MG.assistCap+" = "+vnd(MG.cashout)+" Dogcoin. Mở thêm KHÔNG tăng tiền, chỉ thêm rủi ro - NÊN DỪNG!"}',
    'if(MG.assistCapHit&&!MCAPWARN){MCAPWARN=true;toast("⚠️ Ván này bạn mở được nhờ "+(MG.assistWhy||"trợ giúp 🍀")+" nên chỉ thưởng TỐI ĐA ×"+MG.assistCap+" = "+vnd(MG.cashout)+" Dogcoin. Đã chạm mức này - mở thêm KHÔNG tăng tiền, chỉ thêm rủi ro. NÊN DỪNG NHẬN TIỀN!")}if(!MG.assistCapHit)MCAPWARN=false;',
    'go.className="mgo cash";',
    'go.innerHTML=MG.revealed.length?("NHẬN TIỀN "+vnd(MG.cashout)+\' <img class="dc" src="/dogcoin.png" alt="">\'+(MG.assistCapHit?" · ⚠️ TỐI ĐA ×"+MG.assistCap+" (nhờ "+(MG.assistWhy||"trợ giúp")+") - NÊN DỪNG":"")):"⛏️ MỞ 1 Ô ĐỂ BẮT ĐẦU ĂN";',
    'go.disabled=!MG.revealed.length;',
    '}else if(MOVER){',                                   // ván vừa xong, đang xem lại bàn
    'go.className="mgo start";go.textContent="🔄 VÁN MỚI";go.disabled=false;',
    '}else{',
    'var n=Math.min(Math.max(mNum("mMines"),1),MT-1);',
    '$("mLeft").textContent=(MT-n);$("mBombN").textContent=n;',
    'go.className="mgo start";if(!MOPEN){go.textContent="⛔ DÒ MÌN ĐANG ĐÓNG BẢO TRÌ";go.disabled=true}else{go.textContent="⛏️ BẮT ĐẦU ĐÀO";go.disabled=false}',   // ⏸️ 09/09 công tắc panel
    '$("mStat").textContent=MTAB.length?("mở 1 ô "+fx(MTAB[0])+" · mở hết "+fx(MTAB[MTAB.length-1])):"Chọn số mìn và tiền cược";}',
    '["mDouble","mMax","mMinus","mPlus"].forEach(function(id){$(id).disabled=!!MG});',
    '$("mBet").disabled=!!MG;$("mMines").disabled=!!MG;mBar()}',
    'function mGoClick(){if(MG)mCashout();else if(MOVER)mNewGame();else mStartGame()}',
    'function mNewGame(){MOVER=false;MLAST=null;api("/api/mines/dismiss",{}).catch(function(){});',
    'mDrawGrid();mTable();mBar();mBand()}',
    // Lấy trạng thái từ server: F5 hay mất mạng giữa ván thì quay lại vẫn đúng chỗ cũ.
    'function mSync(){api("/api/mines/state").then(function(j){MT=j.tiles||25;MOPEN=j.open!==false;if(j.potMults&&j.potMults.length)MPOTMULTS=j.potMults;if(j.minBet)MINBET=j.minBet;setBal(j.balance);',
    'MMIN=j.minMines||3;MMAX=j.maxMines||20;',
    '$("mMinesLab").textContent="Số mìn ("+MMIN+"–"+MMAX+")";',
    'MAXWIN=j.maxWin||0;MAXBET=j.maxBet||0;',
    'MG=j.game||null;MLAST=(!MG&&j.last)?j.last:null;MOVER=!!MLAST;mDrawGrid();',
    'if(MG&&MG.luckyPick)luckyOpen("mines");',
    'if(MG&&MG.jpPick)jpOpen("mines",MG.jpMults);',   // F5 giữa lúc đang chọn hộp -> mở lại
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
    'var PRIZE_EMO={shield:"🛡️",dig:"⛏️",cash:"💰",rocket:"🚀",jackpot:"🏆",none:"🍂",dbl:"🎲",scout:"🧭",refund:"↩️"};',
    'function luckyMsg(L){if(!L)return "";return {',
    'shield:"🛡️ KHIÊN - trúng mìn/lửa 1 lần không chết!",',
    'dig:"⛏️ MÁY ĐÀO - mở giúp "+((L.opened||[]).length)+" ô an toàn!",',
    'cash:"💰 LÌ XÌ - +"+(L.bonus||0).toLocaleString("vi-VN")+" Dogcoin vào ví luôn!",',
    'rocket:"🚀 THANG MÁY - vọt lên 2 tầng!",',
    'jackpot:(L.jpPick?"🏆 NỔ HŨ!!! Bấm OK để tự tay chọn hộp bội số x"+((L.mults&&L.mults.length)?L.mults:[10,15,20]).join("/x")+" TIỀN CƯỢC + kịch khung ván!":"🏆 NỔ HŨ!!! +"+(L.bonus||0).toLocaleString("vi-VN")+" DOGCOIN!!!"+(L.potMult?" (🎲 bốc x"+L.potMult+" tiền cược = "+(L.potWin||0).toLocaleString("vi-VN")+" + kịch khung ván)":"")),',   // 09/09 v2: trúng 🏆 chưa trả tiền, mời qua hộp bội số
    'none:"🍂 Trống trơn... kiếp sau may hơn!",',
    'dbl:(L.dblWin?"🎲 GẤP ĐÔI HAY VỀ KHÔNG - tung xu... THẮNG! +"+(L.bonus||0).toLocaleString("vi-VN")+" Dogcoin (X2 TIỀN CƯỢC)!":"🎲 GẤP ĐÔI HAY VỀ KHÔNG - tung xu... sấp mặt, trắng tay! Được ăn cả ngã về không mà 😏"),',
    'scout:"🧭 LA BÀN - lộ 1 ô TỬ THẦN trên bàn (ô ⚠️ đó, liệu mà né)!",',
    'refund:"↩️ HOÀN VÉ CỎ - trả lại "+(L.refund||0).toLocaleString("vi-VN")+" Dogcoin phí mua cỏ. Hụt mà không thiệt!"',
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
    'if(game==="mines"&&MG&&MTAB.length)jp=Math.min(MG.bet*jpCapMines(MG.totalMines),Math.floor(MG.bet*MTAB[MTAB.length-1]))+Math.floor(MG.bet*Math.max.apply(null,MPOTMULTS));',
    'if(game==="stairs"&&SG&&STAB.length)jp=Math.min(SG.bet*2000,Math.floor(SG.bet*STAB[STAB.length-1]))+Math.floor(SG.bet*Math.max.apply(null,SPOTMULTS));',
    '$("luckySub").textContent=jp>0?("Chọn 1 hộp - biết đâu 🏆 NỔ HŨ tới "+jp.toLocaleString("vi-VN")+" Dogcoin (bốc x"+(game==="mines"?MPOTMULTS:SPOTMULTS).join("/x")+" tiền cược + kịch khung ván)!"):"Chọn 1 hộp quà!";',
    // dựng lại 4 hộp kín + giấu kết quả/nút đóng của lần trước
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b){',
    'b.disabled=false;b.textContent="🎁";b.classList.remove("win","dim")});',
    '$("luckyRes").style.display="none";$("luckyClose").style.display="none";',
    '$("luckyPick").classList.add("show")}',
    'function luckySend(n){if(!LUCKGAME)return;var game=LUCKGAME;LUCKGAME="";',
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b){b.disabled=true});',
    'api("/api/"+game+"/lucky",{box:n}).then(function(j){',
    // 🎲 giữ số dư đứng im tới lúc xu rơi - không thì nhìn ví là biết trước thắng thua
    'var isDbl=j.lucky&&j.lucky.prize==="dbl";',
    'if(!isDbl&&typeof j.balance==="number")setBal(j.balance);',
    // LẬT CẢ 4 HỘP: hộp mình chọn sáng vàng, 3 hộp kia mờ - thấy rõ trúng gì, hụt gì
    'var rv=(j.lucky&&j.lucky.reveal)||[];',
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b,i){',
    'b.textContent=PRIZE_EMO[rv[i]]||"🍂";',
    'if(i===n-1)b.classList.add("win");else b.classList.add("dim")});',
    'if(isDbl){',
    // pha 1: xu quay + giấu nút OK (bắt buộc xem hết màn tung xu)
    '$("luckyRes").innerHTML=\'<div style="font-size:15px;font-weight:800;color:#ffd76a">🎲 GẤP ĐÔI HAY VỀ KHÔNG!</div><div class="coinflip">🪙</div><div style="font-size:13px;color:#a9c2b4">Đang tung đồng xu...</div>\';',
    '$("luckyRes").style.display="block";$("luckyClose").style.display="none";',
    'setTimeout(function(){var w=j.lucky.dblWin;',
    '$("luckyRes").innerHTML=w?\'<div style="font-size:36px">🪙</div><div style="font-size:18px;font-weight:900;color:#ffd76a">NGỬA - THẮNG LỚN!</div><div style="font-size:16px;font-weight:800;color:#7dffb0">+\'+(j.lucky.bonus||0).toLocaleString("vi-VN")+\' DOGCOIN (X2 TIỀN CƯỢC)</div>\'',
    ':\'<div style="font-size:36px;filter:grayscale(1)">🪙</div><div style="font-size:18px;font-weight:900;color:#ff8a80">SẤP - TRẮNG TAY!</div><div style="font-size:13px;color:#a9c2b4">Được ăn cả ngã về không mà 😏</div>\';',
    'if(typeof j.balance==="number")setBal(j.balance);',
    'if(w)celebrate();',
    '$("luckyClose").style.display="block";$("luckyClose").textContent="OK, CHƠI TIẾP";},1700);',
    '}else{',
    '$("luckyRes").innerHTML="Hộp của bạn: "+luckyMsg(j.lucky);$("luckyRes").style.display="block";',
    '$("luckyClose").style.display="block";$("luckyClose").textContent=(j.lucky&&j.lucky.jpPick)?"🏆 CHỌN HỘP NỔ HŨ":"OK, CHƠI TIẾP";',   // 09/09 v2: nút đóng đổi chữ khi đang treo nổ hũ
    '}',
    'if(j.lucky&&j.lucky.prize==="jackpot")celebrate();',
    // cập nhật bàn chơi NGAY phía sau hộp (đóng hộp là thấy liền, không khựng)
    'if(game==="mines"){if(j.pot!==undefined)MPOT=j.pot;',
    'if(j.jackpotPick){MG=j.state;mDrawGrid();mBar();mBand()}',   // 🏆 v2: bàn treo, đóng hộp cỏ là mở hộp bội số (luckyDone)
    'else if(j.jackpot){if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng kịch khung may mắn")},2400);',
    'mEnd("🎉 Jackpot - nhận "+j.win.toLocaleString("vi-VN"),j.win-(MG?MG.bet:0),j.mines)}',
    'else{MG=j.state;mDrawGrid();mBar();mBand()}',
    '}else{',
    'if(j.pot!==undefined)SPOT=j.pot;',
    'if(j.jackpotPick){SG=j.state;sTower();sBand()}',
    'else if(j.top){if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng kịch khung may mắn")},2400);',
    'var stk=SG?SG.bet:0,fr=SG?SG.fire:0;',
    'sFinish(j,"Lên đỉnh",j.win-stk,stk,fr,SF)}',
    'else{SG=j.state;sTower();sBand()}}',
    '}).catch(function(e){$("luckyPick").classList.remove("show");toast("❌ "+e.message);',
    'if(game==="mines")mSync();else sSync()})}',
    // đóng hộp cỏ: nếu đang treo NỔ HŨ thì mở ngay hộp bội số
    'function luckyDone(){$("luckyPick").classList.remove("show");if(MG&&MG.jpPick)jpOpen("mines",MG.jpMults);else if(SG&&SG.jpPick)jpOpen("stairs",SG.jpMults)}',
    // ===== 🏆 HỘP NỔ HŨ: chọn 1 trong N hộp bội số (09/09 v2) =====
    'var JPGAME="",JPRES=null;',
    'function jpOpen(game,mults){JPGAME=game;JPRES=null;var ms=(mults&&mults.length)?mults:[10,15,20];var g=$("jpGifts");g.style.gridTemplateColumns="repeat("+ms.length+",1fr)";g.innerHTML="";',
    'ms.forEach(function(m,i){var b=document.createElement("button");b.textContent="🎁";b.onclick=function(){jpSend(i+1)};g.appendChild(b)});',
    'var bet=(game==="mines"&&MG)?MG.bet:((SG&&SG.bet)||0);$("jpSub").textContent="Chọn 1 hộp! Mỗi hộp giấu 1 bội số x"+ms.join("/x")+" TIỀN CƯỢC ("+vnd(bet*Math.min.apply(null,ms))+" tới "+vnd(bet*Math.max.apply(null,ms))+") + kịch khung ván";',
    '$("jpRes").style.display="none";$("jpClose").style.display="none";$("jpPick").classList.add("show")}',
    'function jpSend(n){if(!JPGAME)return;var game=JPGAME;JPGAME="";',
    'document.querySelectorAll("#jpGifts button").forEach(function(b){b.disabled=true});',
    'api("/api/"+game+"/jackpot",{box:n}).then(function(j){if(typeof j.balance==="number")setBal(j.balance);',
    'var rv=j.reveal||[];document.querySelectorAll("#jpGifts button").forEach(function(b,i){b.textContent="x"+(rv[i]!==undefined?rv[i]:"?");if(i===n-1)b.classList.add("win");else b.classList.add("dim")});',
    '$("jpRes").innerHTML="🎲 Bạn bốc <b>x"+j.mult+"</b> tiền cược = +"+vnd(j.potWin)+"<br>🏆 Kịch khung ván: +"+vnd(j.jp)+"<br>💰 TỔNG NHẬN: <b>"+vnd(j.win)+"</b> Dogcoin";$("jpRes").style.display="block";$("jpClose").style.display="block";celebrate();',
    'JPRES={game:game,j:j}}).catch(function(e){$("jpPick").classList.remove("show");toast("❌ "+e.message);if(game==="mines")mSync();else sSync()})}',
    'function jpDone(){$("jpPick").classList.remove("show");if(!JPRES)return;var game=JPRES.game,j=JPRES.j;JPRES=null;',
    'if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng kịch khung may mắn")},2400);',
    'if(game==="mines"){mEnd("🎉 Jackpot - nhận "+j.win.toLocaleString("vi-VN"),j.win-(MG?MG.bet:0),j.mines)}',
    'else{var stk=SG?SG.bet:0,fr=SG?SG.fire:0;sFinish(j,"Lên đỉnh",j.win-stk,stk,fr,SF)}}',
    'document.querySelectorAll("#luckyPick .gifts button").forEach(function(b){',
    'b.addEventListener("click",function(){luckySend(parseInt(this.dataset.g))})});',
    'function mDrawGrid(){var g=$("mGrid");g.innerHTML="";',
    'for(var i=0;i<MT;i++){var t=document.createElement("div");t.id="mk"+i;t.dataset.i=i;',
    'if(MG&&MG.revealed.indexOf(i)>=0){t.className="mtile coin";t.innerHTML=COINIMG}',
    // ô mìn đã bị khiên đỡ: lộ 🛡️, chết cứng, không bấm lại được
    'else if(MG&&MG.defused&&MG.defused.indexOf(i)>=0){t.className="mtile shieldsave";t.textContent="🛡️"}',
    'else if(MG&&MG.scouted&&MG.scouted.indexOf(i)>=0){t.className="mtile can scoutmk";t.textContent="⚠️";t.onclick=function(){mDig(parseInt(this.dataset.i))}}',
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
    'if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng kịch khung may mắn")},2400);',
    'mEnd("✅ Đã dừng - nhận "+j.win.toLocaleString("vi-VN"),j.win-stake,j.mines,j.luckyAt)',
    '}).catch(function(e){mBusy=false;toast("❌ "+e.message);mSync()})}',
    'function setBal(v){if(typeof v!=="number")return;BAL=v;$("bal").textContent=v.toLocaleString("vi-VN")}',
    '',
    // ===== LEO THANG =====
    // Cùng nguyên tắc với dò mìn: client không tự tính tiền, mọi hệ số lấy từ server.
    'var SF=10,SC=8,SMAXF=5,SOPEN=true,SCAPWARN=false,SPOT=-1,SPOTMULTS=[10,15,20],SG=null,sBusy=false,STAB=[],SOVER=false,SLAST=null;',
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
    'else if(SG&&SG.scouted&&SG.scouted.some(function(sq){return sq.f===f&&sq.c===c})&&f>=done){cc+=" scoutmk";inner="⚠️"}',
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
    // 🍀 khoá checkbox khi đang trong ván + cập nhật phí theo tiền cược đang gõ
    'var sxb=$("sExtra"),sxt=$("sExtraTxt"),sxw=$("sExtraWrap");',
    'if(sxb&&sxt&&sxw){if(SG){sxb.disabled=true;sxb.checked=!!SG.extraLucky;sxw.style.cursor="default";sxw.style.opacity="0.85";',
    'sxt.innerHTML=(SG.luckyTotal>0)?("🍀 Ván này giấu <b>"+SG.luckyTotal+"</b> ô cỏ may mắn (đã mua) · còn <b>"+(SG.luckyLeft||0)+"</b> ô chưa đạp"):"🍀 Ván này KHÔNG mua cỏ may mắn";}',
    'else{sxb.disabled=false;sxw.style.cursor="pointer";sxw.style.opacity="1";',
    'sxt.innerHTML=\'🍀 Mua 1 cỏ may mắn (phí <b>\'+vnd(Math.floor((sNum("sBet")||0)*0.3))+\'</b> = 30% cược)\';}}',
    'potTab("sPotHdr",SPOTMULTS);var spl=$("sPotLine");if(spl){var sb0=sNum("sBet")||MINBET;spl.textContent="🏆 NỔ HŨ: trúng 🏆 trong hộp 🍀 là bốc ngẫu nhiên x"+SPOTMULTS.join("/x")+" TIỀN CƯỢC (cược "+vnd(sb0)+" → "+vnd(sb0*Math.min.apply(null,SPOTMULTS))+" tới "+vnd(sb0*Math.max.apply(null,SPOTMULTS))+") + kịch khung lên đỉnh, ván dừng ngay · cược tối thiểu "+vnd(MINBET)+"/ván"}',
    'if(SG){',
    '$("sStat").textContent=SG.fire+" lửa · cược "+vnd(SG.bet)+" · tầng "+SG.floor+"/"+SF+" · "+fx(SG.multi)+(SG.shield?(" · 🛡️ x"+SG.shield):"")+(SG.assistCapHit?" · ⚠️ leo được nhờ "+(SG.assistWhy||"trợ giúp 🍀")+" nên chỉ thưởng TỐI ĐA ×"+SG.assistCap+" - leo thêm KHÔNG tăng tiền":"");',
    'var scw=$("sCapWarn");if(scw){scw.classList.toggle("show",!!SG.assistCapHit);if(SG.assistCapHit)scw.textContent="⚠️ Ván này bạn leo được nhờ "+(SG.assistWhy||"trợ giúp 🍀")+" nên chỉ thưởng TỐI ĐA ×"+SG.assistCap+" = "+vnd(SG.cashout)+" Dogcoin. Leo thêm KHÔNG tăng tiền, chỉ thêm rủi ro - NÊN DỪNG!"}',
    'if(SG.assistCapHit&&!SCAPWARN){SCAPWARN=true;toast("⚠️ Ván này bạn leo được nhờ "+(SG.assistWhy||"trợ giúp 🍀")+" nên chỉ thưởng TỐI ĐA ×"+SG.assistCap+" = "+vnd(SG.cashout)+" Dogcoin. Đã chạm mức này - leo thêm KHÔNG tăng tiền, chỉ thêm rủi ro. NÊN DỪNG NHẬN TIỀN!")}if(!SG.assistCapHit)SCAPWARN=false;',
    'go.className="mgo cash";',
    'go.innerHTML=SG.floor?("NHẬN TIỀN "+vnd(SG.cashout)+\' <img class="dc" src="/dogcoin.png" alt="">\'+(SG.assistCapHit?" · ⚠️ TỐI ĐA ×"+SG.assistCap+" (nhờ "+(SG.assistWhy||"trợ giúp")+") - NÊN DỪNG":"")):"🪜 BƯỚC LÊN TẦNG 1 ĐI";',
    'go.disabled=!SG.floor;',
    '}else if(SOVER){',
    'go.className="mgo start";go.textContent="🔄 VÁN MỚI";go.disabled=false;',
    '}else{',
    'go.className="mgo start";if(!SOPEN){go.textContent="⛔ LEO THANG ĐANG ĐÓNG BẢO TRÌ";go.disabled=true}else{go.textContent="🪜 BẮT ĐẦU LEO";go.disabled=false}',
    '$("sStat").textContent=STAB.length?("tầng 1 "+fx(STAB[0])+" · lên đỉnh "+fx(STAB[STAB.length-1])):"Chọn số cầu lửa và tiền cược";}',
    '["sMax","sMinus","sPlus"].forEach(function(id){$(id).disabled=!!SG});',
    '$("sBet").disabled=!!SG;$("sFire").disabled=!!SG}',
    'function sGoClick(){if(SG)sCashout();else if(SOVER)sNewGame();else sStart()}',
    'function sNewGame(){SOVER=false;SLAST=null;api("/api/stairs/dismiss",{}).catch(function(){});',
    'sTower();sBand()}',
    'function sSync(){api("/api/stairs/state").then(function(j){',
    'SF=j.floors||10;SC=j.cols||8;SMAXF=j.maxFire||5;SOPEN=j.open!==false;if(j.potMults&&j.potMults.length)SPOTMULTS=j.potMults;if(j.minBet)MINBET=j.minBet;setBal(j.balance);',
    'SG=j.game||null;SLAST=(!SG&&j.last)?j.last:null;SOVER=!!SLAST;',
    'if(SG&&SG.luckyPick)luckyOpen("stairs");',
    'if(SG&&SG.jpPick)jpOpen("stairs",SG.jpMults);',   // F5 giữa lúc đang chọn hộp -> mở lại
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
    // 💥🏆 11/09: NỔ HŨ QUAY PAL - dấu hiệu KHÔNG THỂ BỎ LỠ: lóe vàng + rung + mưa 🏆🪙 + chữ to giữa màn 5s + toast
    'function palJackpotFx(amount){var f=$("jpFlash");if(f){f.classList.remove("on");void f.offsetWidth;f.classList.add("on")}',
    'document.body.classList.remove("storm");void document.body.offsetWidth;document.body.classList.add("storm");',
    'var EM=["🏆","💥","🪙","💰","✨","🐶"];for(var i=0;i<44;i++){var s=document.createElement("div");s.className="fx";s.textContent=EM[i%EM.length];',
    's.style.left=(Math.random()*96)+"vw";s.style.fontSize=(20+Math.random()*32)+"px";s.style.animationDuration=(1.4+Math.random()*2)+"s";s.style.animationDelay=(Math.random()*1.2)+"s";',
    'document.body.appendChild(s);(function(el){setTimeout(function(){el.remove()},4800)})(s)}',
    'var el=$("winpop");if(el){el.className="jp";el.innerHTML="💥🏆 NỔ HŨ QUAY PAL 🏆💥<br>+"+vnd(amount)+" Dogcoin";void el.offsetWidth;el.classList.add("show");setTimeout(function(){el.className=""},5300)}',
    'setTimeout(function(){document.body.classList.remove("storm")},1600);toast("💥🏆 NỔ HŨ QUAY PAL +"+vnd(amount)+" Dogcoin!")}',
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
    'if(j.luckCapped)setTimeout(function(){toast("🍀 Có trợ giúp may mắn - thưởng kịch khung may mắn")},2400);',
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
    'sBusy=true;api("/api/stairs/start",{fire:f,bet:b,extra:$("sExtra")&&$("sExtra").checked}).then(function(j){sBusy=false;if(j.pot!==undefined)SPOT=j.pot;',
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
    // khung 54 ("2 ngày") đã bỏ 26/08 tối - ai còn lưu trong máy thì ép về 50s
    'var SKTF=parseInt(localStorage.getItem("sk_tf"))||1;if([1,6,12,24].indexOf(SKTF)<0)SKTF=1;',
    // 26/08 tối: mỗi màn 15 nến - nến to rõ, dễ nhìn (chủ server chốt, hạ dần 64->30->15)
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
    // qua /api/stock/hist, cache 60 giây - khung 5m/10m/20m/2 ngày + kéo lùi ăn từ đây
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
    // ghép kho nến cũ (SKH) trước 180 nến sống - mọi khung đều đủ 64 cây, kéo lùi thoải mái
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
    'if(over)note="⚠️ Quá giới hạn khối lượng: lệnh cần "+sh+" CP mà chỉ còn "+roomSh+" CP. Ở x"+LV+" thì vốn tối đa là "+vnd(maxMoney)+" Dogcoin - hạ vốn hoặc hạ đòn bẩy. ";',
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
    'var lock=!SKS.open?"SÀN TẠM ĐÓNG":SKS.blocked?"TẠM KHOÁ":"";',
    'var setB=function(id,o,lbl,sd){var b=$(id);if(!b)return;var wrong=held&&held!==sd;',
    // mỗi chiều vào ở giá khác nhau -> số CP khác nhau, nên kiểm trần RIÊNG từng nút
    'var ov=o.sh>roomSh;',
    'b.disabled=SKBUSY||!!lock||wrong||ov||o.sh<1||o.c>SKS.balance;',
    'b.textContent=lock?(lbl+" · "+lock):wrong?(lbl+" · đóng lệnh cũ trước")',
    ':o.sh<1?(lbl+" · nhập tiền đã")',
    ':ov?(lbl+" · quá giới hạn, tối đa "+vnd(Math.floor(roomSh*o.e/LV)))',
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
    'var br=$("skBurnRow");var showB=p.burnAt>0&&p.burnAt>=10&&p.burnAt<=4000;',
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
    // 🔌 15/09: giấu tab của mục admin tắt. Đang đứng trong mục bị tắt thì đá về Tài Xỉu.
    'var FEATNAV={tx:"navTx",mine:"navMine",stair:"navStair",wheel:"navWheel",stock:"navStock",spm:"navSpm",pal:"navPal",pick:"navPick",shop:"navShop",dog:"navDog"};',
    'var FEATOFF=[];',
    'function featDraw(off){FEATOFF=off||[];',
    'for(var k in FEATNAV){var b=$(FEATNAV[k]);if(b)b.classList.toggle("hidden",FEATOFF.indexOf(k)>=0)}',
    'if(FEATOFF.indexOf(CURPAGE)>=0){toast("⛔ Mục này đang tạm khoá");go("tx")}}',
    'var DEBTNOW=0;',   // 📒 14/09: số nợ hiện tại, cho ô trên thanh + điền sẵn ô trả
    'function debtChipDraw(){var ch=$("debtChip"),tb=$("navDebt");',
    'if(DEBTNOW>0){if(ch){ch.classList.remove("hidden");$("debtChipVal").textContent=DEBTNOW.toLocaleString("vi-VN")}if(tb)tb.classList.remove("hidden")}',
    // sạch nợ: giấu cả ô trên thanh lẫn tab, đang đứng ở trang Nợ thì tự về Cá nhân
    'else{if(ch)ch.classList.add("hidden");if(tb)tb.classList.add("hidden");if(CURPAGE==="debt")go("daily")}}',
    'function debtSync(){api("/api/debt/state").then(function(j){',
    'DEBTNOW=j.total||0;debtChipDraw();',
    'var c=$("debtCard");if(!c)return;',
    'if(!(j.total>0)){c.style.display="none";return}',
    'c.style.display="";',
    '$("debtBad").textContent=(j.total>0)?"⛔ Đang nợ - khoá mua shop item + chuyển pal vào game":"";',
    '$("debtInfo").innerHTML="Đang nợ <b>"+j.total.toLocaleString("vi-VN")+"</b> 🐕"+(j.admin>0?" (vay "+j.loan.toLocaleString("vi-VN")+" + admin ghi "+j.admin.toLocaleString("vi-VN")+")":"")+" · qua 00:00 chưa trả là CẢ CỤC NỢ +"+j.ratePct+"%/ngày (lãi kép, cả nợ admin)";',
    '}).catch(function(){})}',
    // 📒 14/09: một hàm trả nợ dùng chung cho thẻ nợ trong Hồ sơ LẪN ô nhanh trên thanh
    'function debtDo(inpId,btnId){var b=$(btnId);if(!b||b.disabled)return;b.disabled=true;',
    'var v=parseInt($(inpId).value)||0;',
    'api("/api/debt/pay",{amount:v}).then(function(j){setBal(j.balance);$(inpId).value="";',
    'toast(j.debt.total>0?("💳 Đã trả "+j.paid.toLocaleString("vi-VN")+" - còn nợ "+j.debt.total.toLocaleString("vi-VN")):"✅ Đã trả "+j.paid.toLocaleString("vi-VN")+" - SẠCH NỢ!");',
    'debtSync();b.disabled=false',
    '}).catch(function(e){toast("❌ "+e.message);b.disabled=false})}',
    'function debtPay(){debtDo("debtAmt","debtPayBtn")}',
    // 📒 14/09: bấm ô NỢ trên thanh -> nhảy thẳng sang tab 📒 Nợ, điền sẵn số trả hết
    'function debtBarToggle(){if(!(DEBTNOW>0))return;grpGo("profile");go("debt");',
    'var i=$("debtAmt");if(i){i.value=DEBTNOW;setTimeout(function(){i.focus();i.select()},60)}}',
    // 🆘 réo anh em ra kênh chat trả giùm
    'function debtSos(){var b=$("sosBtn");if(!b||b.disabled)return;b.disabled=true;',
    'api("/api/debt/sos",{}).then(function(){toast("🆘 Đã réo anh em ở kênh chat - chờ người tốt bụng nha!")})',
    '.catch(function(e){toast("❌ "+e.message)}).then(function(){b.disabled=false})}',
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
    // để pal trúng đứng yên tại chỗ cho người chơi nhìn - quay lượt mới mới dựng dải mới.
    'function pwSync(keepMain,keepRaid){api("/api/palwheel/state").then(function(j){PW=j;',
    '$("pwStat").textContent=(j.pals.length+(j.raids.length?1:0))+" ô ("+(j.jackSlots||1)+" ô 💰 "+(j.jackName||"Mimog")+") · rương có "+j.chestCount+" pal"+(PWSPUN?" · đã quay - F5 để kéo dải xem lại":" · 🖐️ kéo dải để xem hết các ô");',
    '$("pwPot").innerHTML="💰 Quay trúng ô <b style=\\"color:#ffe98a\\">💰 "+esc(j.jackName||"Mimog")+"</b> = NỔ HŨ <b>"+vnd(j.pot)+"</b> + thưởng <b>"+vnd(j.jackBonus||0)+"</b> = <b style=\\"color:#ffe98a\\">"+vnd((j.pot||0)+(j.jackBonus||0))+"</b> Dogcoin · Bán lại pal: "+vnd(j.sellPrice)+" · Ô 🔥 RAID: "+j.raids.length+" boss, ra thẳng ngay vòng này (ô trúng bốc lửa)";',
    // ⏳ dựng lại đếm ngược sau F5: server báo còn bao nhiêu ms -> đặt PWLOCK, chạy ticker
    'if(j.spinRemain>0){var uu=Date.now()+j.spinRemain+300;if(uu>PWLOCK)PWLOCK=uu}',
    'pwRenderLuck();pwLockKick();',
    'if(j.chestMax&&j.chestWait>=j.chestMax)pwAutoStop("rương đã đủ "+j.chestMax+" pal chưa nhận");pwAutoLabel();',
    'if(!PWBUSY&&!keepMain)pwIdle();if(!PWRBUSY&&!keepRaid)pwRaidIdle()}).catch(function(e){toast("❌ "+e.message)})}',
    // ⏳ nút quay + nút raid: hiện đếm ngược khoá (~10,5s/lượt) rồi mới bấm lại được -
    // khớp khoá chống-spam ở server. F5 xong pwSync đọc spinRemain dựng lại đếm ngược này.
    'function pwGoLabel(){if(!PW)return;var now=Date.now(),lk=PWLOCK>now,w=Math.ceil((PWLOCK-now)/1000);var g=$("pwGo");',
    'if(!PW.open){g.textContent="⛔ ĐANG ĐÓNG BẢO TRÌ";g.disabled=true}',
    'else if(lk){g.textContent="⏳ Chờ "+w+"s để quay tiếp";g.disabled=true}',
    'else if(PWBUSY){g.textContent="⏳ Đang quay...";g.disabled=true}',
    'else{g.textContent="🎁 QUAY ("+vnd(PW.price)+" Dogcoin)";g.disabled=false}',
    'var rg=$("pwRaidGo");if(rg){if(lk){rg.textContent="⏳ Chờ "+w+"s";rg.disabled=true}',
    'else if(PWRBUSY){rg.textContent="⏳ Đang quay...";rg.disabled=true}',
    'else if(PW.raidReady){rg.textContent="🍀 QUAY MAY MẮN (đầy 100%)";rg.disabled=false}',
    'else{rg.textContent="🔒 Đầy 100% may mắn mới quay được";rg.disabled=true}}}',
    'function pwLockStart(){PWLOCK=Date.now()+10800;pwLockKick()}',
    // kick: cập nhật nút + chạy ticker nếu đang khoá mà chưa chạy (tránh 2 ticker chồng nhau)
    'function pwLockKick(){pwGoLabel();if(PWLOCK>Date.now()&&!PWTICKING){PWTICKING=true;pwLockTick()}}',
    'function pwLockTick(){pwGoLabel();if(Date.now()<PWLOCK){setTimeout(pwLockTick,300)}else{PWTICKING=false;pwGoLabel()}}',
    'function pwPick(a){return a[Math.floor(Math.random()*a.length)]}',
    // 🖼️ gắn hình pal (assets/palimage/T_<code>_icon_normal.png) - con thiếu hình thì ẩn <img>, chừa tên
    'function pwImg(code,lazy){return code?("<img src=\\"/palimage/T_"+code+"_icon_normal.png\\" alt=\\""+(lazy?" loading=\\"lazy\\"":"")+" onerror=\\"this.style.display=\'none\'\\">"):""}',
    'function pwCardHtml(p,raid,hit,lazy){var nm=(p&&p.name!==undefined)?p.name:(p||"");var code=(p&&p.code)||"";',
    'var lg=!raid&&p&&p.legend,ep=!raid&&!lg&&p&&p.epic;',
    'var jk=!raid&&p&&(p.jack||(PW&&PW.jackCode&&p.code===PW.jackCode));',   // 💰 15/09: ô NỔ HŨ (Mimog) - cờ từ server, thiếu thì suy từ code
    'return "<div class=\\"pwCard"+(raid?" raid":"")+(jk?" jack":"")+(lg?" legend":"")+(ep?" epic":"")+(hit?(jk?" jackhit":(raid?" raidhit":(lg?" legendhit":(ep?" epichit":"")))):"")+"\\">"+pwImg(code,lazy)+"<div class=\\"nm\\">"+(jk?"💰 ":(raid?"🔥 ":(lg?"👑 ":(ep?"💜 ":""))))+esc(nm)+"</div><div class=\\"dx\\">"+(jk?"&nbsp;":(raid?"PAL RAID":(lg?"HUYỀN THOẠI":(ep?"PAL MẠNH":(p&&p.dex?"#"+p.dex:"&nbsp;")))))+"</div></div>"}',
    // 15/09: dải lúc RẢNH hiện ĐỦ mọi ô, thứ tự XÁO NGẪU NHIÊN mỗi lần dựng (chủ server: không xếp theo ID),
    // người chơi kéo xem. Chỉ là trưng bày - lúc quay dải dựng lại 60 thẻ như cũ, kết quả server đã chốt.
    'function pwIdleList(){var L=PW.pals.slice();for(var i=L.length-1;i>0;i--){var k=Math.floor(Math.random()*(i+1)),t=L[i];L[i]=L[k];L[k]=t}return L}',
    'function pwIdle(){if(!PW||!PW.pals||!PW.pals.length)return;var h="";pwIdleList().forEach(function(p){h+=pwCardHtml(p,false,false,true)});',
    'var s=$("pwStrip");s.style.transition="none";PWDX=0;s.style.transform="translateX(0px)";s.innerHTML=h;pwDragInit()}',
    // 🖐️ kéo dải: chuột / ngón tay (pointer events) + cuộn ngang. Khoá khi đang quay. Chỉ dịch chuyển hiển thị.
    'var PWDX=0,PWDRAG=null,PWSPUN=false;',   // PWSPUN: đã bấm quay trong phiên trang này -> hết kéo tới khi F5
    'function pwDragTo(x){var w=$("pwWrap"),s=$("pwStrip");if(!w||!s)return;var min=Math.min(0,w.clientWidth-s.offsetWidth);PWDX=Math.max(min,Math.min(0,x));s.style.transform="translateX("+PWDX+"px)"}',
    'function pwDragInit(){var w=$("pwWrap"),s=$("pwStrip");if(!w||!s||w.dataset.drag)return;w.dataset.drag="1";',
    'w.addEventListener("pointerdown",function(e){if(PWBUSY||PWSPUN)return;PWDRAG={x0:e.clientX,st:PWDX};try{w.setPointerCapture(e.pointerId)}catch(x){}w.classList.add("grabbing");s.style.transition="none"});',
    'w.addEventListener("pointermove",function(e){if(!PWDRAG)return;pwDragTo(PWDRAG.st+(e.clientX-PWDRAG.x0))});',
    'function pwDragEnd(){PWDRAG=null;w.classList.remove("grabbing")}w.addEventListener("pointerup",pwDragEnd);w.addEventListener("pointercancel",pwDragEnd);w.addEventListener("pointerleave",pwDragEnd);',
    'w.addEventListener("wheel",function(e){if(PWBUSY||PWSPUN)return;var d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;e.preventDefault();s.style.transition="none";pwDragTo(PWDX-d)},{passive:false})}',
    // dải quay dùng chung cho cả 2 vòng: 60 thẻ, kết quả ở thẻ 52; jitter ±35px. Thẻ 110px + khe 6px = bước 116px.
    'function pwRollEl(strip,wrap,cards,cb){var s=$(strip),W=$(wrap).clientWidth;',
    's.innerHTML=cards.join("");s.style.transition="none";s.style.transform="translateX(0px)";void s.offsetWidth;',
    'var STEP=116,HALF=55;var jit=Math.floor(Math.random()*70)-35;var target=52*STEP+HALF-W/2+jit;',
    's.style.transition="transform 10s cubic-bezier(.06,.72,.05,1)";',
    // 11/09: viền sáng ô trúng gắn SAU khi dừng (raid/legend/epic) - lúc quay mọi thẻ trông như nhau, không lộ kết quả
    's.style.transform="translateX("+(-target)+"px)";if(strip==="pwStrip")PWDX=-target;setTimeout(function(){var c=s.children[52];if(c){if(c.classList.contains("jack"))c.classList.add("jackhit");else if(c.classList.contains("raid"))c.classList.add("raidhit");else if(c.classList.contains("legend"))c.classList.add("legendhit");else if(c.classList.contains("epic"))c.classList.add("epichit")}cb()},10300)}',
    // 27/08: GỘP 1 reel - raid ra thẳng ở vòng thường, ô trúng (thẻ 52) gắn hiệu ứng lửa nếu là raid
    'function pwStrip1(it){var out=[];for(var i=0;i<60;i++){',
    'if(i===52)out.push(pwCardHtml(it,!!it.raid,false));',   // hit=false: viền sáng gắn lúc dừng (pwRollEl)
    'else{var r=PW.raids.length&&Math.random()<0.06;out.push(r?pwCardHtml(pwPick(PW.raids),true,false):pwCardHtml(pwPick(PW.pals),false,false))}}return out}',
    // 🔁 16/09 TỰ ĐỘNG QUAY: bấm 1 lần rồi tự quay tiếp cho tới khi rương đầy 100 con chưa nhận,
    // hết tiền, hoặc người chơi bấm dừng. Vẫn quay từng lượt qua /spin như bấm tay (server chốt kết
    // quả + khoá 10,5s mỗi lượt) - đây chỉ là bấm hộ, KHÔNG nhanh hơn và không đổi tỉ lệ.
    'var PWAUTO=false;',
    'function pwAutoLabel(){var a=$("pwAuto");if(!a||!PW)return;',
    'var room=(PW.chestMax&&PW.chestWait!==undefined)?Math.max(0,PW.chestMax-PW.chestWait):null;',
    'a.textContent=PWAUTO?"⏹️ DỪNG TỰ ĐỘNG":("🔁 TỰ ĐỘNG QUAY"+(room!==null?" (còn "+room+" chỗ)":""));',
    'a.disabled=!PW.open||(room!==null&&room<=0)}',
    'function pwAutoStop(lydo){if(!PWAUTO)return;PWAUTO=false;pwAutoLabel();if(lydo)toast("⏹️ Dừng tự động quay: "+lydo)}',
    'function pwAutoTog(){if(PWAUTO)return pwAutoStop("bạn bấm dừng");',
    'if(!PW||!PW.open)return;PWAUTO=true;pwAutoLabel();toast("🔁 Tự động quay - bấm lại để dừng");pwAutoTick()}',
    'function pwAutoTick(){if(!PWAUTO)return;if(PWBUSY)return;',
    'if(PWLOCK>Date.now()){setTimeout(pwAutoTick,400);return}pwSpin()}',
    'function pwSpin(){if(PWBUSY||!PW||!PW.open||PWLOCK>Date.now())return;PWBUSY=true;PWSPUN=true;var pww=$("pwWrap");if(pww)pww.classList.add("nodrag");pwGoLabel();$("pwRes").classList.add("hidden");',
    'api("/api/palwheel/spin",{}).then(function(j){setBal(j.balance);pwLockStart();',
    'pwRollEl("pwStrip","pwWrap",pwStrip1(j.item),function(){pwDone(j)})',
    '}).catch(function(e){PWBUSY=false;pwGoLabel();pwAutoStop(e.message);toast("❌ "+e.message)})}',
    'function pwDone(j){PWBUSY=false;pwGoLabel();var it=j.item;var res=$("pwRes");',
    'res.classList.remove("hidden");if(it.raid)res.classList.add("raidwin");else res.classList.remove("raidwin");',
    'res.innerHTML=(it.raid?"🔥 TRÚNG BOSS RAID! ":"🎉 Trúng ")+"<b style=\\"font-size:17px\\">"+esc(it.name)+"</b>"+(it.raid?" <span style=\\"color:#ff9f5c;font-weight:700\\">PAL RAID</span>":"")+(it.dex?" <span class=\\"muted\\">#"+it.dex+"</span>":"")+"<div class=\\"muted\\" style=\\"font-size:12px;margin-top:4px\\">Đã vào 🎒 RƯƠNG - qua tab 🪪 Cá nhân để 💰 bán hoặc 🎁 nhận vào game</div>";',
    'if(it.raid)toast("🔥🔥 CỰC HIẾM! Bạn quay trúng BOSS RAID "+it.name+" - khác hẳn pal thường!");',
    'if(j.jackpot){var tong=(j.potWin||0)+(j.palBonus||0);palJackpotFx(tong);res.classList.add("jpwin");res.innerHTML+="<div style=\\"color:#ffcf5c;font-weight:900;font-size:16px;margin-top:6px\\">💰💥 Ô NỔ HŨ! Nguyên hũ "+vnd(j.potWin||0)+" + thưởng "+vnd(j.palBonus||0)+" = <span style=\\"font-size:19px\\">+"+vnd(tong)+"</span> Dogcoin 💥💰</div>";setTimeout(function(){res.classList.remove("jpwin")},8000)}else res.classList.remove("jpwin");',
    'if(j.luckJustFull)toast("🍀 ĐẦY THANH MAY MẮN! Kéo xuống quay VÒNG MAY MẮN: huyền thoại hoặc boss RAID + thưởng Dogcoin!");',
    'pwSync(true,false);pwAutoLabel();setTimeout(pwAutoTick,600)}',
    '',
    // ===== 🍀 THANH MAY MẮN + 🔥 VÒNG QUAY RAID (27/08) =====
    'function pwRenderLuck(){if(!PW)return;var l=Math.max(0,Math.min(100,PW.luck||0));',
    '$("pwLuckFill").style.width=l+"%";$("pwLuckPct").textContent=l+"%";',
    '$("pwLuckTix").innerHTML=PW.raidReady?"<span style=\\"color:#ffcf5c;font-weight:800\\">🍀 ĐỦ 100%! quay vòng may mắn</span>":(PW.raidWheelOn?("<span class=\\"muted\\">còn "+(100-l)+"% nữa</span>"):"<span class=\\"muted\\">vòng may mắn đang tắt</span>");',
    'var box=$("pwRaidBox");if(PW.raidWheelOn)box.classList.remove("hidden");else box.classList.add("hidden");',
    'if(PW.raidWheelOn){var rp=PW.raidWheelPals||[];',
    'var lgs=PW.luckyLegends||[],rpct=PW.luckyRaidPct===undefined?40:PW.luckyRaidPct;',
    '$("pwRaidStat").textContent=lgs.length+" huyền thoại + ô RAID "+rpct+"% · thưởng "+vnd(PW.raidBonus)+" Dogcoin";',
    '$("pwRaidInfo").innerHTML="Đầy <b>100%</b> may mắn mới quay được. Vòng gồm <b style=\\"color:#ffd76a\\">👑 "+lgs.map(function(p){return esc(p.name)}).join(", ")+"</b> và <b style=\\"color:#ff8f8f\\">🔥 Ô RAID ("+rpct+"%)</b> - trúng ô RAID thì <b>quay thêm 1 vòng boss</b>: "+rp.map(function(p){return esc(p.name)}).join(", ")+". Kèm <b style=\\"color:#7cff9c\\">+"+vnd(PW.raidBonus)+"</b> Dogcoin. Quay xong thanh may mắn <b>về 0</b>.";}',
    'pwGoLabel()}',
    // 🍀 11/09: vòng may mắn = thẻ huyền thoại (vàng) + thẻ "Ô RAID" chung (đỏ) theo % - trúng ô RAID thì reel 2 toàn boss
    // 🖼️ 11/09: icon Ô RAID = hình Lamball (palimage) tô ĐỎ bằng CSS filter (chủ server: hình tự tải xấu, bỏ raid_slot.jpg)
    'function pwRaidSlotHtml(hit){return "<div class=\\"pwCard raid"+(hit?" raidhit":"")+"\\"><img src=\\"/palimage/T_SheepBall_icon_normal.png\\" alt=\\"\\" style=\\"filter:sepia(1) saturate(9) hue-rotate(-45deg) brightness(.9) drop-shadow(0 0 6px #ff3b3b)\\" onerror=\\"this.style.display=\'none\'\\"><div class=\\"nm\\">🔥 Ô RAID</div><div class=\\"dx\\">quay thêm boss</div></div>"}',
    'function pwLuckyCard(){var pct=PW.luckyRaidPct===undefined?40:PW.luckyRaidPct;var lgs=PW.luckyLegends||[];return (Math.random()*100<pct||!lgs.length)?pwRaidSlotHtml(false):pwCardHtml(pwPick(lgs),false,false)}',
    'function pwRaidIdle(){if(!PW||!PW.raidWheelOn)return;var h="";for(var i=0;i<14;i++)h+=pwLuckyCard();',
    'var s=$("pwRaidStrip");if(!s)return;s.style.transition="none";s.style.transform="translateX(0px)";s.innerHTML=h}',
    'function pwRaidStrip1(j){var out=[];for(var i=0;i<60;i++)out.push(i===52?(j.raidHit?pwRaidSlotHtml(false):pwCardHtml(j.item,false,false)):pwLuckyCard());return out}',
    'function pwRaidStrip2(it){var out=[];for(var i=0;i<60;i++)out.push(pwCardHtml(i===52?it:pwPick(PW.raidWheelPals),true,false));return out}',
    'function pwRaidSpin(){if(PWRBUSY||!PW||!PW.raidReady||PWLOCK>Date.now())return;PWRBUSY=true;pwGoLabel();$("pwRaidRes").classList.add("hidden");',
    'api("/api/palwheel/raidspin",{}).then(function(j){setBal(j.balance);pwLockStart();',
    'pwRollEl("pwRaidStrip","pwRaidWrap",pwRaidStrip1(j),function(){pwRaidDone(j)})',
    '}).catch(function(e){PWRBUSY=false;pwGoLabel();toast("❌ "+e.message)})}',
    // reel 1 dừng: trúng Ô RAID -> báo rồi quay reel 2 (toàn boss, dừng đúng con server đã chọn); huyền thoại -> kết quả luôn
    'function pwRaidDone(j){if(j.raidHit){toast("🔥🔥 TRÚNG Ô RAID! Quay tiếp xem ra boss nào...");$("pwRaidRes").classList.remove("hidden");$("pwRaidRes").innerHTML="🔥 <b>TRÚNG Ô RAID!</b> Đang quay vòng boss...";',
    'setTimeout(function(){pwRollEl("pwRaidStrip","pwRaidWrap",pwRaidStrip2(j.item),function(){pwRaidFinal(j)})},900);return}pwRaidFinal(j)}',
    'function pwRaidFinal(j){PWRBUSY=false;pwGoLabel();var it=j.item;var isR=!!j.raidHit;',
    '$("pwRaidRes").classList.remove("hidden");',
    '$("pwRaidRes").innerHTML=(isR?"🔥🍀 TRÚNG BOSS RAID ":"👑🍀 TRÚNG HUYỀN THOẠI ")+"<b style=\\"font-size:18px;color:"+(isR?"#ff9f5c":"#ffd76a")+"\\">"+esc(it.name)+"</b>"+(it.dex?" <span class=\\"muted\\">#"+it.dex+"</span>":"")+(j.bonus?" <span style=\\"color:#7cff9c;font-weight:800\\">+"+vnd(j.bonus)+" Dogcoin</span>":"")+"<div class=\\"muted\\" style=\\"font-size:12px;margin-top:4px\\">Pal vào 🎒 RƯƠNG - qua tab 🪪 Cá nhân để nhận vào game. Thanh may mắn đã về 0.</div>";',
    'toast((isR?"🔥 Trúng boss RAID ":"👑 Trúng huyền thoại ")+it.name+(j.bonus?" + "+vnd(j.bonus)+" Dogcoin":"")+"!");',
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
    // 07/09: gắn hình pal đầu dòng (loading lazy - 286 hình chỉ tải khi cuộn tới; thiếu hình tự ẩn)
    'h+="<div class=\\"pcmP\\" style=\\"display:flex;align-items:center;gap:8px;cursor:default;"+st+"\\"><img src=\\"/palimage/T_"+p.code+"_icon_normal.png\\" loading=\\"lazy\\" alt=\\"\\" style=\\"width:34px;height:34px;border-radius:8px;flex:0 0 auto\\" onerror=\\"this.style.display=\'none\'\\"><b>"+esc(p.name)+"</b>"+(p.raid?" <span style=\\"color:#ff8f8f;font-size:11px;font-weight:700\\">🔥 BOSS RAID</span>":"")+(p.dex?"<span class=\\"muted\\" style=\\"font-size:11px\\">#"+p.dex+"</span>":"")+"<span style=\\"flex:1\\"></span><button style=\\"padding:5px 10px;font-size:12px;background:linear-gradient(180deg,#2f8f4f,#256e3e)\\" onclick=\\"pkBuy(\'"+p.code+"\')\\">🎯 Mua "+vnd(p.price||PK.price)+"</button></div>"});',
    '$("pkList").innerHTML=h||"<div class=\\"muted\\" style=\\"padding:10px\\">Không thấy pal nào khớp.</div>"}',
    'async function pkBuy(code){if(PKBUSY||!PK)return;var p=null;PK.list.forEach(function(x){if(x.code===code)p=x});if(!p)return;',
    'if(!(await gConfirm("Mua đích danh <b>"+esc(p.name)+"</b>"+(p.raid?" (BOSS RAID)":"")+" với <b>"+vnd(p.price||PK.price)+"</b> Dogcoin? Pal sẽ vào 🎒 RƯƠNG.","🎯 Mua")))return;',
    'PKBUSY=true;api("/api/palpick/buy",{code:code}).then(function(j){PKBUSY=false;setBal(j.balance);',
    // chủ server chốt 25/08: KHÔNG bật bảng chọn ngay - pal về rương, nhắn rõ chỗ nhận là đủ
    'toast("🎯 Đã mua "+j.item.name+" - pal nằm trong 🎒 RƯƠNG (tab 🪪 Cá nhân), vào đó chọn linh hồn + passive rồi nhận");',
    'pkSync()}).catch(function(e){PKBUSY=false;toast("❌ "+e.message)})}',
    '',
    // ===== 🛒 SHOP ITEM (28/08): mua item + số lượng -> giao thẳng vào túi trong game =====
    'var IS=null,ISBUSY=false;',
    // 🎁 15/09 (chiều): QUÀ ADMIN TẶNG - danh sách riêng /api/gift/state, không dính shop.
    // Dựng thẻ bằng DOM (không nối chuỗi HTML) để khỏi vướng dấu nháy lồng nhau.
    'var GIFTS=[];',
    'function giftCard(g){var d=document.createElement("div");d.className="isItem"+(g.taken?" isDone":"");',
    'd.innerHTML=isImg(g.img)+"<div class=\\"isMeta\\"><div class=\\"isNm\\"></div><div class=\\"isPr\\">🎁 Miễn phí · x"+(g.qty||1)+" cái. Mỗi ngày nhận 1 lần</div><div class=\\"isNote gNote\\"></div><div class=\\"isNote gSt\\"></div></div><div class=\\"isBuyRow\\"><button class=\\"gBtn\\"></button></div>";',
    'd.querySelector(".isNm").textContent=g.name||g.id;var nt=d.querySelector(".gNote");if(g.note)nt.textContent=g.note;else nt.remove();',
    'var st=d.querySelector(".gSt");if(g.taken){st.style.color="#8fd18f";st.textContent="✅ Hôm nay bạn đã nhận - qua 00:00 nhận lại được"}else st.remove();',
    'var b=d.querySelector(".gBtn");if(g.taken){b.disabled=true;b.textContent="✅ ĐÃ NHẬN HÔM NAY"}else{b.textContent="🎁 Nhận quà (x"+(g.qty||1)+")";b.onclick=function(){giftClaim(g.gid,b)}}return d}',
    'function giftDraw(){if(GIFTBUSY)return;var tb=$("navGift"),box=$("giftList"),st=$("giftStat");var L=GIFTS.filter(function(g){return !g.taken});',
    // còn quà chưa nhận -> hiện tab kèm số; hết -> ẩn, đang ở trang Quà thì tự về Cá nhân (như tab Nợ)
    'if(tb){if(L.length>0){tb.classList.remove("hidden");tb.textContent="🎁 Quà ("+L.length+")"}else{tb.classList.add("hidden");if(CURPAGE==="gift")go("daily")}}',
    'if(!box)return;if(st)st.textContent=L.length?(L.length+" món chưa nhận"):(GIFTS.length?"đã nhận hết hôm nay":"chưa có quà");',
    'box.innerHTML="";if(!GIFTS.length){box.innerHTML="<div class=\\"muted\\">Hôm nay chưa có quà nào 🎁</div>";return}',
    'GIFTS.slice().sort(function(a,b){return (a.taken?1:0)-(b.taken?1:0)}).forEach(function(g){box.appendChild(giftCard(g))})}',
    'function giftSync(){api("/api/gift/state").then(function(j){GIFTS=j.items||[];giftDraw()}).catch(function(){})}',
    'var GIFTBUSY=false;',
    // khoá TẤT CẢ nút quà khi đang giao (bấm nút khác cũng vô ích vì bot giao từng đơn một)
    'function giftBtnLock(on,btn){var bs=document.querySelectorAll("#giftList .gBtn");',
    'for(var i=0;i<bs.length;i++){bs[i].disabled=on;if(on&&bs[i]!==btn)bs[i].style.opacity=.5;else bs[i].style.opacity=1}}',
    'function giftClaim(gid,btn){',
    'if(GIFTBUSY){toast("⏳ Đang giao quà vào game - chờ chút nhé");return}',
    'GIFTBUSY=true;giftBtnLock(true,btn);',
    'var chu=btn?btn.textContent:"";if(btn)btn.textContent="⏳ Đang giao vào game...";',
    'api("/api/gift/claim",{gid:gid}).then(function(j){toast(j.message||"🎁 Đã nhận!")})',
    '.catch(function(e){toast("❌ "+e.message);if(btn)btn.textContent=chu})',
    // mở khoá TRƯỚC rồi mới vẽ lại, vì giftDraw đang chặn khi GIFTBUSY
    '.then(function(){GIFTBUSY=false;giftBtnLock(false);giftSync()})}',
    'function isSync(){api("/api/itemshop/state").then(function(j){IS=j;if(j.cats&&j.cats.length)ISG=j.cats;',
    '$("isStat").textContent=j.items.length+" món · ví "+vnd(j.balance);',
    '$("isLink").innerHTML=j.ingameName?("Nhân vật liên kết: <b>"+esc(j.ingameName)+"</b> - item giao thẳng vào túi (phải đang ONLINE trong game)"):"⚠️ Chưa liên kết tên nhân vật - nhắn <b>admin</b> liên kết rồi mới mua được";',
    'isRender()}).catch(function(e){toast("❌ "+e.message)})}',
    // hình item: file trong assets/itemimage/ (thả file + restart như palimage); thiếu -> ô 📦
    'function isImg(f){return f?("<img src=\\"/itemimage/"+encodeURIComponent(f)+"\\" alt=\\"\\" onerror=\\"this.outerHTML=\'<div class=&quot;isPh&quot;>📦</div>\'\\">"):"<div class=\\"isPh\\">📦</div>"}',
    // 07/09: shop kiểu 4 NÚT NHÓM - bấm nhóm nào hiện đồ nhóm đó (nhớ qua F5);
    // gõ ô tìm là quét TÊN + GHI CHÚ trên mọi nhóm (kèm đề mục nhóm cho khỏi lạc)
    // 🏷️ 16/09: nhóm hàng do ADMIN đặt ở panel, server gửi kèm state. Dưới đây chỉ là bản dự phòng
    // lúc chưa tải xong state (isSync ghi đè ngay khi có dữ liệu).
    'var ISG=[["important","⭐ QUAN TRỌNG"],["admin","🧺 LINH TINH"],["weapon","🗡️ VŨ KHÍ"],["armor","🛡️ GIÁP"],["consume","🏪 THƯƠNG NHÂN"],["accessory","💍 PHỤ KIỆN"],["food","🍖 THỨC ĂN"],["ammo","🔫 ĐẠN"],["material","🐾 NGUYÊN LIỆU CHO PAL"],["implant","🧬 IMPLANT"]];',   // 15/09 +gift · đổi tên consume/material   // 09/09 +2 nhóm · 10/09 +material +implant
    'function isCatGet(){var c=localStorage.getItem("is_cat");return ISG.some(function(g){return g[0]===c})?c:"weapon"}',
    'function isCatPick(c){try{localStorage.setItem("is_cat",c)}catch(e){}var f=$("isFind");if(f)f.value="";isRender()}',
    'function isWT(it){return it.cat==="implant"&&/Consumable_WorldTree_/.test(it.id)}',
    'function isOnceCat(c){return c==="important"}',   // 15/09: quà 🎁 đã tách khỏi shop, chỉ còn ⭐
    'function isOnceBought(it){return !!(IS&&isOnceCat(it.cat)&&(IS.once||[]).indexOf(it.id)>=0)}',
    'function isTierCls(it){return (isWT(it)?" isWT":(it.tier==="diamond"?" isT4":(it.tier==="gold"?" isT3":(it.tier==="purple"?" isPur":""))))+(it.cat==="admin"?" isMisc":"")+(isOnceBought(it)?" isDone":"")}',
    'function isTierTag(it){return isWT(it)?"<span class=\\"isTier twt\\">🌈 CÂY THẾ GIỚI</span>":(it.tier==="diamond"?"<span class=\\"isTier t4\\">💎 KIM CƯƠNG</span>":(it.tier==="gold"?"<span class=\\"isTier t3\\">🥇 VÀNG</span>":""))}',
    'function isCard(it){return "<div class=\\"isItem"+isTierCls(it)+"\\">"+isImg(it.img)+"<div class=\\"isMeta\\"><div class=\\"isNm\\">"+esc(it.name)+"</div><div class=\\"isPr\\">"+(it.price>0?vnd(it.price)+" Dogcoin / cái":"🎁 Miễn phí")+"</div>"+(it.note?"<div class=\\"isNote\\">"+esc(it.note)+"</div>":"")+isDayLine(it)+"</div>"',
    '+isBuyRow(it)+"</div>"}',
    // ⭐ 11/09: nhóm QUAN TRỌNG mua 1 lần/người -> không ô số lượng; đã mua -> nút "✅ ĐÃ MUA" khoá
    'function isBuyRow(it){if(it.cat==="important"){return isOnceBought(it)?"<div class=\\"isBuyRow\\"><button disabled>✅ ĐÃ MUA (1 lần/người)</button></div>":"<div class=\\"isBuyRow\\"><button onclick=\\"isBuy(\'"+it.id+"\',this)\\">🛒 Mua (1 lần duy nhất)</button></div>"}',
    // 18/09 (chủ server): đổi chỗ 2 nút - 🧰 Vào rương đứng TRƯỚC, 🛒 Mua đứng sau.
    'return "<div class=\\"isBuyRow\\"><input class=\\"isQty\\" id=\\"isq_"+it.id+"\\" type=\\"number\\" min=\\"1\\" max=\\""+it.max+"\\" value=\\"1\\">"+(ikDuoc(it)?"<button style=\\"background:#3a2e10;border:1px solid #c9a227;color:#ffd76a\\" title=\\"Mua vào Rương Ích Kỷ - không cần đang online\\" onclick=\\"isBuy(\'"+it.id+"\',this,true)\\">🧰 Vào rương</button>":"")+"<button onclick=\\"isBuy(\'"+it.id+"\',this)\\">🛒 Mua</button></div>"}',
    // 📅 10/09: hạn mua mỗi món/người/ngày (server đếm, client chỉ hiện + chặn sớm cho đỡ gọi API)
    'function isDayLeft(id){return IS&&IS.dayMax>0?Math.max(0,IS.dayMax-((IS.today||{})[id]||0)):-1}',
    'function isImpLeft(){return IS&&IS.implantMax>0?Math.max(0,IS.implantMax-(IS.implantToday||0)):-1}',
    // 🗂️ 12/09 v2: hạn theo nhóm - server đưa groupQuota {cat:{mode,max}} + 2 sổ đếm
    // 🧰 MÓN NÀY CÓ BỎ VÀO RƯƠNG ĐƯỢC KHÔNG?
    // 21/09 (chủ server): MỌI NHÓM đều được — implant, nguyên liệu cho pal, đạn...
    // Trước chỉ cho món có hạn TOÀN SERVER; gỡ được vì hạn theo NGƯỜI vẫn bị trừ ngay lúc
    // mua nên vào rương không lách được hạn nào (xem itemShopBuy ở index.js).
    // ⚠️ Chừa đúng ⭐ món 1-LẦN-VĨNH-VIỄN: quên nhận trước 00:00 là mất cả tiền lẫn suất mua.
    // ⚠️ PHẢI CÙNG LUẬT VỚI MÁY CHỦ. Client chỉ ẩn nút cho đỡ bấm nhầm — nới ở đây mà quên
    // nới bên kia thì người chơi bấm được nút rồi ăn lỗi đỏ.
    'function ikDuoc(it){if(!IS||!it)return false;return !isOnceCat(it.cat)}',
    'function isGrpQ(it){var g=IS&&IS.groupQuota?IS.groupQuota[it.cat]:null;return g&&g.max>0?g:null}',
    'function isGrpLeft(it){var g=isGrpQ(it);if(!g)return -1;var key=g.per==="item"?("i:"+it.id):it.cat;var used=((g.mode==="server"?IS.groupSrvToday:IS.groupToday)||{})[key]||0;return Math.max(0,g.max-used)}',
    'function isWtLeft(){return IS&&IS.wtMax>0?Math.max(0,IS.wtMax-(IS.wtToday||0)):-1}',
    'function isOnceLine(it){if(!IS||!isOnceCat(it.cat))return "";return isOnceBought(it)?"<div class=\\"isNote\\" style=\\"color:#8fd18f\\">✅ Bạn đã mua món này - mỗi người chỉ 1 lần</div>":"<div class=\\"isNote\\" style=\\"color:#ffd76a\\">⭐ Mỗi người chỉ mua được 1 lần duy nhất</div>"}',
    'function isImpLine(it){var gg=isGrpQ(it);if(gg&&it.cat!=="implant"&&!isOnceCat(it.cat)){var gl=isGrpLeft(it),sv=gg.mode==="server";var un=gg.per==="item"?("món "+esc(it.name)):"món nhóm này";return "<div class=\\"isNote\\" style=\\"color:"+(gl?"#8fd18f":"#ff8a80")+"\\">🗂️ "+(gl?(sv?"cả server hôm nay còn ":"hôm nay bạn còn mua được ")+gl.toLocaleString()+"/"+gg.max.toLocaleString()+" "+un+(sv?" - ai nhanh thì được":""):(sv?"cả server":"bạn")+" đã mua đủ "+gg.max.toLocaleString()+" "+un+" hôm nay - mai quay lại")+"</div>"}if(!IS||it.cat!=="implant")return isOnceLine(it);if(isWT(it)){if(!(IS.wtMax>0))return "";var w=isWtLeft();return "<div class=\\"isNote\\" style=\\"color:"+(w?"#8fd18f":"#ff8a80")+"\\">🌳 "+(w?"hôm nay bạn còn mua được "+w+"/"+IS.wtMax+" implant Cây Thế Giới":"hôm nay bạn đã mua đủ "+IS.wtMax+" implant Cây Thế Giới - mai quay lại")+"</div>"}if(!(IS.implantMax>0))return "";var l=isImpLeft();return "<div class=\\"isNote\\" style=\\"color:"+(l?"#8fd18f":"#ff8a80")+"\\">🧬 "+(l?"hôm nay bạn còn mua được "+l+"/"+IS.implantMax+" implant":"hôm nay bạn đã mua đủ "+IS.implantMax+" implant - mai quay lại")+"</div>"}',
    'function isDayLine(it){var imp=isImpLine(it);if(!IS||!(IS.dayMax>0)||it.cat==="implant"||isOnceCat(it.cat)||isGrpQ(it))return imp;var l=isDayLeft(it.id),sv=IS.dayMode!=="user";return imp+"<div class=\\"isNote\\" style=\\"color:"+(l?"#8fd18f":"#ff8a80")+"\\">📅 "+(l?(sv?"cả server hôm nay còn ":"hôm nay bạn còn mua được ")+l+"/"+IS.dayMax:(sv?"cả server đã mua hết "+IS.dayMax+" hôm nay":"hôm nay bạn đã mua đủ "+IS.dayMax)+" - mai quay lại")+"</div>"}',
    'function isRender(){if(!IS||ISBUSY)return;var cat=isCatGet();',
    // nhóm đang chọn hết món (mua sạch nhóm ⭐, hoặc admin dọn hết nhóm) -> tự sang nhóm còn hàng
    'var isConHang=function(c){return IS.items.some(function(it){return (it.cat||"consume")===c&&!isOnceBought(it)})};',
    'if(!isConHang(cat)){for(var gi=0;gi<ISG.length;gi++){if(isConHang(ISG[gi][0])){cat=ISG[gi][0];break}}}',
    'var q=(($("isFind")||{}).value||"").trim().toLowerCase();',
    // hàng nút nhóm (đếm số món từng nhóm, nhóm đang xem sáng lên)
    'var cb=$("isCats");if(cb)cb.innerHTML=ISG.map(function(g){var n=IS.items.filter(function(it){return (it.cat||"consume")===g[0]&&!isOnceBought(it)}).length;',
    'if(!n)return "";return "<button class=\\"isCatBtn"+(g[0]==="admin"?" misc":"")+(g[0]===cat&&!q?" on":"")+"\\" onclick=\\"isCatPick(\'"+g[0]+"\')\\">"+g[1]+" <span>"+n+"</span></button>"}).join("");',
    'var h="";',
    'if(q){ISG.forEach(function(g){var rows=IS.items.filter(function(it){return !isOnceBought(it)&&(it.cat||"consume")===g[0]&&((it.name||"").toLowerCase().indexOf(q)>=0||(it.note||"").toLowerCase().indexOf(q)>=0)});if(!rows.length)return;',
    'h+="<div class=\\"isCat\\">"+g[1]+" <span style=\\"color:var(--muted);font-weight:400;font-size:12px\\">("+rows.length+" món khớp)</span></div>";rows.forEach(function(it){h+=isCard(it)})});',
    'if(!h)h="<div class=\\"muted\\" style=\\"margin-top:10px\\">Không thấy món nào khớp \\""+esc(q)+"\\".</div>"}',
    'else{var rows=IS.items.filter(function(it){return (it.cat||"consume")===cat&&!isOnceBought(it)});',
    'rows.forEach(function(it){h+=isCard(it)});',
    'if(!rows.length)h="<div class=\\"muted\\" style=\\"margin-top:10px\\">Nhóm này chưa có món nào.</div>"}',
    '$("isList").innerHTML=h}',
    // 🛒 15/09: khoá mọi nút mua khi đang giao, đổi chữ nút vừa bấm cho biết đang chạy
    'function isBtnLock(on,btn){var bs=document.querySelectorAll("#isList .isBuyRow button");',
    'for(var i=0;i<bs.length;i++){if(bs[i].dataset.done)continue;bs[i].disabled=on;bs[i].style.opacity=(on&&bs[i]!==btn)?.5:1}}',
    // ===== 🧰 RƯƠNG ÍCH KỶ =====
    'var IK=null,IKBUSY=false,IKTIMER=null,IKNG=null;',
    'function ikOpen(){$("ikModal").classList.remove("hidden");ikSync();ikLoadNguoi();if(!IKTIMER)IKTIMER=setInterval(ikTick,1000)}',
    'function ikClose(){$("ikModal").classList.add("hidden");if(IKTIMER){clearInterval(IKTIMER);IKTIMER=null}}',
    // đếm ngược tới 00:00 - trừ dần ở client, khỏi gọi server mỗi giây
    'function ikTick(){if(!IK)return;IK.msLeft=Math.max(0,(IK.msLeft||0)-1000);var e=$("ikCount");if(!e)return;',
    'if(IK.msLeft<=0){e.innerHTML="<b>Đã qua 00:00 - tải lại trang để thấy rương mới.</b>";return}',
    'var t=Math.floor(IK.msLeft/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),g=t%60;',
    'e.innerHTML="Còn <b>"+h+" giờ "+m+" phút "+g+" giây</b>."}',
    'function ikSync(){api("/api/ichky/state").then(function(j){IK=j;ikDraw()}).catch(function(e){toast("❌ "+e.message)})}',
    // nhãn số trên nút thanh số dư
    'function ikBadge(n){var b=$("ikNum");if(!b)return;b.textContent=n;var t=$("ikBtn");if(t)t.title="Rương Ích Kỷ: đang giữ "+n+" món - 00:00 là xoá sạch"}',
    'function ikLoadNguoi(){if(IKNG)return;api("/api/players").then(function(j){IKNG=(j.list||[]).filter(function(p){return String(p.id)!==String(MYID)});',
    'var sel=$("ikTo");if(!sel)return;var h="<option value=\\"\\">-- chọn người nhận --</option>";',
    'IKNG.forEach(function(p){h+="<option value=\\""+p.id+"\\">"+esc(p.name||p.id)+"</option>"});sel.innerHTML=h}).catch(function(){})}',
    'function ikDraw(){if(!IK)return;ikBadge(IK.total);ikTick();',
    '$("ikStat").innerHTML="Đang giữ <b>"+IK.total+"/"+IK.holdMax+"</b> món · hôm nay đã mua vào rương <b>"+IK.boughtToday+"/"+IK.dayMax+"</b> (còn "+IK.leftToday+")";',
    // 🎁 ai tặng mình hôm nay - gọn trong 1 khung, khỏi đẻ thêm màn hình
    'var nh=$("ikNhan"),NL=IK.nhan||[];nh.classList.toggle("hidden",!NL.length);',
    'if(NL.length){nh.innerHTML="🎁 <b>Hôm nay bạn được tặng:</b><br>"+NL.map(function(g){return "• <b>"+esc(g.tu)+"</b> tặng "+g.qty+" "+esc(g.ten)+" <span class=\\"muted\\">("+ikGio(g.at)+")</span>"}).join("<br>")}',
    'var L=IK.items||[];var box=$("ikList");',
    'if(!L.length){box.innerHTML="<div class=\\"muted\\" style=\\"text-align:center;padding:18px;grid-column:1/-1\\">Rương trống. Qua 🏪 Shop Item bấm <b>🧰 Vào rương</b> để mua đồ vào đây.</div>";return}',
    // thẻ món kiểu kho đồ: ảnh to, số lượng đè góc ảnh, tên, rồi 2 nút. Dùng lại isImg() của shop.
    'var h="";L.forEach(function(x){h+="<div class=\\"ikCard\\"><div class=\\"ikPic\\">"+isImg(x.img)+"<span class=\\"ikQ\\">x"+x.qty+"</span></div>"',
    '+"<div class=\\"ikNm\\">"+esc(x.name)+"</div>"',
    '+"<div class=\\"ikAct\\"><input id=\\"ikq_"+x.id+"\\" type=\\"number\\" min=\\"1\\" max=\\""+x.qty+"\\" value=\\""+x.qty+"\\">"',
    '+"<button class=\\"bn\\" onclick=\\"ikClaim(\'"+x.id+"\',this)\\">📦 Nhận</button>"',
    '+"<button class=\\"bt\\" onclick=\\"ikGive(\'"+x.id+"\',this)\\">🎁 Tặng</button></div></div>"});',
    'box.innerHTML=h}',
    'function ikGio(ts){var d=new Date(ts);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)}',
    'function ikMon(id){var it=null;(IK&&IK.items||[]).forEach(function(x){if(x.id===id)it=x});return it}',
    'function ikSoLuong(id,it){var q=parseInt(($("ikq_"+id)||{}).value)||0;if(q<1){toast("Nhập số lượng");return 0}if(q>it.qty){toast("Rương chỉ có "+it.qty+" cái");return 0}return q}',
    'async function ikClaim(id,btn){if(IKBUSY)return toast("⏳ Đang xử lý - chờ chút");var it=ikMon(id);if(!it)return;',
    'var q=ikSoLuong(id,it);if(!q)return;',
    'if(!(await gConfirm("Nhận <b>"+q+" "+esc(it.name)+"</b> vào túi trong game? Nhân vật phải đang <b>ONLINE</b>.","📦 Nhận vào game")))return;',
    'IKBUSY=true;var chu=btn?btn.textContent:"";if(btn){btn.disabled=true;btn.textContent="⏳ Đang giao..."}',
    'api("/api/ichky/claim",{itemId:id,qty:q}).then(function(j){IKBUSY=false;if(btn){btn.disabled=false;btn.textContent=chu}toast(j.message||"✅ Đã nhận");if(j.state){IK=j.state;ikDraw()}else ikSync()})',
    '.catch(function(e){IKBUSY=false;if(btn){btn.disabled=false;btn.textContent=chu}toast("❌ "+e.message);ikSync()})}',
    'async function ikGive(id,btn){if(IKBUSY)return toast("⏳ Đang xử lý - chờ chút");var it=ikMon(id);if(!it)return;',
    'var sel=$("ikTo");var to=sel?sel.value:"";if(!to)return toast("Chọn người nhận ở ô bên trên đã");',
    'var ten=sel.selectedOptions[0]?sel.selectedOptions[0].textContent:to;',
    'var q=ikSoLuong(id,it);if(!q)return;if(q>IK.giveMax)return toast("Mỗi lần tặng tối đa "+IK.giveMax+" món");',
    'if(!(await gConfirm("Tặng <b>"+q+" "+esc(it.name)+"</b> cho <b>"+esc(ten)+"</b>? Tặng rồi là <b>không lấy lại được</b>.","🎁 Tặng",true)))return;',
    'IKBUSY=true;if(btn)btn.disabled=true;',
    'api("/api/ichky/give",{toId:to,itemId:id,qty:q}).then(function(j){IKBUSY=false;if(btn)btn.disabled=false;toast(j.message||"🎁 Đã tặng");if(j.state){IK=j.state;ikDraw()}else ikSync()})',
    '.catch(function(e){IKBUSY=false;if(btn)btn.disabled=false;toast("❌ "+e.message);ikSync()})}',
    '',
    'async function isBuy(id,btn,vaoRuong){if(ISBUSY){toast("⏳ Đang giao đơn trước - chờ chút nhé");return}if(!IS)return;var it=null;IS.items.forEach(function(x){if(x.id===id)it=x});if(!it)return;',
    'if(isOnceCat(it.cat)&&isOnceBought(it))return toast("⭐ Bạn đã mua món này rồi - mỗi người chỉ 1 lần");',
    'var q=it.cat==="important"?1:(parseInt(($("isq_"+id)||{}).value)||0);if(q<1)return toast("Nhập số lượng");if(q>it.max)return toast("Tối đa "+it.max+"/lần");if(isWT(it)){var wl=isWtLeft();if(wl>=0&&q>wl)return toast(wl?"🌳 Hôm nay bạn còn mua được "+wl+" implant Cây Thế Giới":"🌳 Hôm nay bạn đã mua đủ "+IS.wtMax+" implant Cây Thế Giới - mai quay lại")}else if(it.cat==="implant"){var il=isImpLeft();if(il>=0&&q>il)return toast(il?"🧬 Hôm nay bạn còn mua được "+il+" implant":"🧬 Hôm nay bạn đã mua đủ "+IS.implantMax+" implant - mai quay lại")}else{var gq2=isGrpQ(it);if(gq2){var gl2=isGrpLeft(it);var un2=gq2.per==="item"?("món "+it.name):"món nhóm này";if(gl2>=0&&q>gl2)return toast(gl2?"🗂️ Hôm nay "+(gq2.mode==="server"?"cả server":"bạn")+" còn mua được "+gl2.toLocaleString()+" "+un2:"🗂️ Hôm nay "+(gq2.mode==="server"?"cả server":"bạn")+" đã mua đủ "+gq2.max.toLocaleString()+" "+un2+" - mai quay lại")}}var dl=(it.cat==="implant"||isGrpQ(it))?-1:isDayLeft(id);if(dl>=0&&q>dl)return toast(dl?"📅 Hôm nay "+(IS.dayMode!=="user"?"cả server":"bạn")+" còn mua được "+dl+" "+it.name:"📅 Hôm nay "+(IS.dayMode!=="user"?"cả server":"bạn")+" đã mua đủ "+IS.dayMax+" "+it.name+" - mai quay lại");',
    'if(!IS.ingameName)return toast("⚠️ Chưa liên kết tên nhân vật - nhắn admin trước đã");',
    'if(!(await gConfirm(vaoRuong?("Mua <b>"+q+" "+esc(it.name)+"</b> = <b>"+vnd(it.price*q)+"</b> Dogcoin bỏ vào <b>🧰 Rương Ích Kỷ</b>?<br>Không cần đang online. <b>00:00 chưa xài là mất trắng.</b>"):("Mua <b>"+q+" "+esc(it.name)+"</b> = <b>"+vnd(it.price*q)+"</b> Dogcoin? Giao thẳng vào túi trong game (phải đang ONLINE)."),vaoRuong?"🧰 Mua vào rương":"🛒 Mua")))return;',
    'ISBUSY=true;isBtnLock(true,btn);var chu=btn?btn.textContent:"";if(btn)btn.textContent=vaoRuong?"⏳ Đang bỏ vào rương...":"⏳ Đang giao vào game...";',
    'api("/api/itemshop/buy",{itemId:id,qty:q,vaoRuong:!!vaoRuong}).then(function(j){ISBUSY=false;isBtnLock(false);if(j.balance!==undefined)setBal(j.balance);toast(j.message||"✅ Đã giao!");if(j.ruong){IK=j.ruong;ikBadge(IK.total)}isSync()}).catch(function(e){ISBUSY=false;isBtnLock(false);if(btn)btn.textContent=chu;toast("❌ "+e.message);isSync()})}',
    '',
    // ===== 🚀 PHI THUYỀN (crash game, 28/08) - vòng chơi chung, số nhân đồng bộ giờ server =====
    'var SPM=null,SPMOFF=0,SPMBUSY=false,SPMTIMER=null,SPMANIM=null,SPMRID=0,SPMSEEN={},SPMFRESH=false;',
    // 🧑‍🚀 hiệu ứng người rút "nhảy ra khỏi phi thuyền": chữ bay lên rồi tan
    'function spmSpawnFloat(name,mult,win){var box=$("spmFloats");if(!box)return;var d=document.createElement("div");d.className="spmFloat";d.style.left=(12+Math.random()*62)+"%";d.textContent="🧑\\u200d🚀 "+name+" "+mult.toFixed(2)+"x +"+vnd(win);box.appendChild(d);setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d)},1850)}',
    'function spmNow(){return Date.now()+SPMOFF}',   // ước tính giờ server
    'function spmEnter(){spmSync();if(!SPMANIM)SPMANIM=setInterval(spmAnimTick,80)}',
    'function spmSync(){api("/api/spm/state").then(function(j){SPM=j;SPMOFF=(j.now||Date.now())-Date.now();if(j.balance!==undefined)setBal(j.balance);spmRender();',
    'if(SPMTIMER)clearTimeout(SPMTIMER);SPMTIMER=setTimeout(spmSync,j.phase==="fly"?350:1000)}).catch(function(){if(SPMTIMER)clearTimeout(SPMTIMER);SPMTIMER=setTimeout(spmSync,1500)})}',
    // vẽ số nhân chạy mượt (chỉ khi đang bay); nút RÚT hiện luôn tiền ăn hiện tại
    'function spmAnimTick(){if(!SPM||SPM.phase!=="fly")return;var el=(spmNow()-SPM.flightStart)/1000;if(el<0)el=0;var m=Math.exp((SPM.growth||0.1)*el);$("spmMult").textContent=m.toFixed(2)+"x";',
    'if(SPM.me&&!SPM.me.cashed&&!SPMBUSY){$("spmBtn").textContent="💰 RÚT "+m.toFixed(2)+"x  (+"+vnd(Math.floor(SPM.me.amount*m))+")"}}',
    'function spmHc(x,win){if(win)return "<span class=\\"h\\" style=\\"color:#ffd76a;border-color:#ffd76a\\">🏆"+x.toFixed(2)+"x</span>";var c=x>=10?"#c9a2ff":(x>=2?"#8fffca":(x>=1.5?"#ffd76a":"#ff8f8f"));return "<span class=\\"h\\" style=\\"color:"+c+"\\">"+x.toFixed(2)+"x</span>"}',
    // 05/09: mưa 🎉 khi chuyến bay tới đỉnh - bắn 1 lần mỗi chuyến (nhớ roundId)
    'var SPMWINFX=0;',
    'function spmWinFx(){var st=$("spmStage");if(!st)return;var EM=["🎉","🎆","✨","🏆","💰"];for(var i=0;i<26;i++){var e=document.createElement("div");e.className="spmConf";e.textContent=EM[i%EM.length];e.style.left=(Math.random()*96)+"%";e.style.animationDelay=(Math.random()*0.9)+"s";e.style.fontSize=(14+Math.random()*18)+"px";st.appendChild(e);(function(el){setTimeout(function(){try{el.remove()}catch(x){}},3800)})(e)}}',
    'function spmRender(){if(!SPM)return;var st=$("spmStage");st.classList.toggle("fly",SPM.phase==="fly");st.classList.toggle("crash",SPM.phase==="crash"&&!SPM.won);st.classList.toggle("won",SPM.phase==="crash"&&!!SPM.won);',
    'if(SPM.phase==="crash"&&SPM.won&&SPMWINFX!==SPM.roundId){SPMWINFX=SPM.roundId;spmWinFx();}',
    'var myname=($("myName")||{}).textContent||"";',
    '$("spmInfo").innerHTML="Cược "+vnd(SPM.minBet)+" – "+vnd(SPM.maxBet)+"/chuyến · bay hết ăn tới <b>"+SPM.maxMult+"x</b>"+(SPM.open?"":" · <b style=\\"color:var(--red)\\">ĐANG ĐÓNG</b>");',
    '$("spmHistBar").innerHTML=(SPM.history||[]).map(function(h){return spmHc(h.crash,h.win)}).join("")||"<span class=\\"muted\\" style=\\"font-size:11px\\">chưa có chuyến nào</span>";',
    'if(SPM.phase==="bet"){var left=Math.max(0,Math.ceil((SPM.betEndAt-spmNow())/1000));$("spmStat").textContent="Chuyến #"+SPM.roundId+" · chờ cược "+left+"s";',
    'if(!SPM.me)$("spmMult").textContent="1.00x";$("spmMsg").textContent=SPM.me?("✅ Đã lên chuyến "+vnd(SPM.me.amount)+" - bay sau "+left+"s"):("🛫 ĐẶT CƯỢC - bay sau "+left+"s")}',
    'else if(SPM.phase==="fly"){$("spmStat").textContent="Chuyến #"+SPM.roundId+" · ĐANG BAY";$("spmMsg").textContent=(SPM.me&&SPM.me.cashed)?("✅ Đã rút "+SPM.me.cashed.toFixed(2)+"x (+"+vnd(SPM.me.win)+")"):"🚀 ĐANG BAY - cảm thấy đủ rồi thì chạy đi các cháu ơi !!!"}',
    'else if(SPM.won){$("spmStat").textContent="Chuyến #"+SPM.roundId+" · 🏆 TỚI ĐỈNH";$("spmMult").textContent=(SPM.crashPoint||1).toFixed(2)+"x";$("spmMsg").textContent=SPM.me?("🏆 PHI THUYỀN BAY TỚI ĐỈNH "+(SPM.crashPoint||1).toFixed(0)+"x - bạn ăn trọn +"+vnd(SPM.me.win)+"!"):("🏆 PHI THUYỀN BAY TỚI ĐỈNH "+(SPM.crashPoint||1).toFixed(0)+"x - TẤT CẢ ĐỀU THẮNG!")}',
    'else{$("spmStat").textContent="Chuyến #"+SPM.roundId+" · NỔ";$("spmMult").textContent=(SPM.crashPoint||1).toFixed(2)+"x";$("spmMsg").textContent=(SPM.me&&SPM.me.cashed)?("✅ Bạn đã rút "+SPM.me.cashed.toFixed(2)+"x kịp!"):(SPM.me?"💥 NỔ - bạn mất cược":"💥 NỔ ở "+(SPM.crashPoint||1).toFixed(2)+"x")}',
    // 🔜 danh sách AI đang đặt trước chuyến sau - hộp riêng, không nhét vào spmMsg (hết chồng chữ)
    'var nx=SPM.nextPlayers||[];var nxBox=$("spmNext");',
    'if(nxBox){if(nx.length){nxBox.style.display="";nxBox.innerHTML="<div class=\\"spmNxT\\">⏭️ ĐẶT TRƯỚC CHUYẾN SAU ("+nx.length+")</div>"+nx.map(function(p){return "<div class=\\"spmNx\\"><span class=\\"nm\\">"+esc(p.name)+"</span><span>đặt <b style=\\"color:#7aa2ff\\">"+vnd(p.amount)+"</b> cho chuyến sau</span></div>"}).join("")}else{nxBox.style.display="none";nxBox.innerHTML=""}}',
    // nút + hộp cược theo phase (LUÔN bấm được: đang bay/nổ thì đặt cho chuyến sau)
    'var b=$("spmBtn"),box=$("spmBetBox");box.style.display="";',
    'if(SPM.phase==="fly"&&SPM.me&&!SPM.me.cashed){b.disabled=false;b.style.background="linear-gradient(180deg,#ffd76a,#e0ac3f)";b.style.color="#241d0a"}',
    'else if(SPM.myNext){b.disabled=!SPM.open;b.style.background="linear-gradient(180deg,#ff9d9d,#e06a6a)";b.style.color="#2a0f0f";b.textContent="❌ Huỷ đặt trước ("+vnd(SPM.myNext.amount)+")"}',
    'else if(SPM.phase==="bet"&&!SPM.me){b.disabled=!SPM.open;b.style.background="";b.style.color="";b.textContent="✅ ĐẶT CƯỢC"}',
    'else if(SPM.phase==="bet"&&SPM.me){b.disabled=true;b.style.background="";b.style.color="";b.textContent="✅ Đã lên chuyến - chờ bay"}',
    'else{b.disabled=!SPM.open;b.style.background="linear-gradient(180deg,#7aa2ff,#4f6fd6)";b.style.color="#0b1020";b.textContent="🔜 ĐẶT CHO CHUYẾN SAU"}',
    // người trên chuyến
    'var ps=SPM.players||[];$("spmPlayStat").textContent=ps.length+" người · "+vnd(ps.reduce(function(s,p){return s+p.amount},0))+" cược";',
    // vòng mới -> reset danh sách đã-bay-hiệu-ứng; SPMFRESH bỏ qua burst khi mới vào giữa vòng
    'if(SPM.roundId!==SPMRID){SPMRID=SPM.roundId;SPMSEEN={};SPMFRESH=true}',
    'ps.forEach(function(p){if(p.cashed){var k=p.name+"|"+p.cashed;if(!SPMSEEN[k]){SPMSEEN[k]=1;if(!SPMFRESH&&SPM.phase==="fly")spmSpawnFloat(p.name,p.cashed,p.win)}}});',
    '$("spmPlayers").innerHTML=ps.length?ps.map(function(p){var lost=(!p.cashed&&SPM.phase==="crash");var cl="spmP"+(p.cashed?" cashed":"")+(lost?" lost":"")+((p.name===myname)?" me":"");',
    'var res=p.cashed?("<span style=\\"color:#3ddc84;font-weight:800\\">"+p.cashed.toFixed(2)+"x → +"+vnd(p.win)+"</span>"):(lost?"<span style=\\"color:#ff8f8f;font-weight:800\\">💥 −"+vnd(p.amount)+"</span>":(SPM.phase==="fly"?"<span class=\\"muted\\">đang bay</span>":"<span class=\\"muted\\">đã cược</span>"));',
    'return "<div class=\\""+cl+"\\"><span class=\\"nm\\">"+esc(p.name)+(p.name===myname?" (bạn)":"")+"</span><span>"+vnd(p.amount)+"</span>"+res+"</div>"}).join(""):"<div class=\\"muted\\">Chưa ai lên chuyến.</div>";',
    'spmBetHistRender();SPMFRESH=false}',
    'function spmBetHistRender(){var box=$("spmBetHist");if(!box||!SPM)return;var h=SPM.betHistory||[];',
    'box.innerHTML=h.length?h.map(function(r){var win=!!r.cashed;',
    'var rs=win?("🚀 ×"+r.cashed.toFixed(2)+" +"+vnd(r.win)):("💥 thua hết −"+vnd(r.amount));',
    'return "<div class=\\"spmH "+(win?"win":"lose")+"\\"><span class=\\"nm\\">"+esc(r.name)+"</span><span class=\\"bet\\">cược "+vnd(r.amount)+"</span><span class=\\"rs\\">"+rs+"</span></div>"}).join(""):"<div class=\\"muted\\">Chưa có lượt nào.</div>"}',
    'function spmSet(n){$("spmAmt").value=n}',
    'function spmMax(){if(SPM)$("spmAmt").value=Math.min(SPM.maxBet,BAL)}',
    'function spmAction(){if(!SPM||SPMBUSY)return;',
    // (A) đang bay & có cược chưa rút -> RÚT
    'if(SPM.phase==="fly"&&SPM.me&&!SPM.me.cashed){SPMBUSY=true;var bb=$("spmBtn");bb.disabled=true;bb.textContent="⏳ Đang rút...";',
    'api("/api/spm/cashout",{}).then(function(j){SPMBUSY=false;setBal(j.balance);if(SPM&&SPM.me){SPM.me.cashed=j.m;SPM.me.win=j.win}spmRender();toast("💰 Rút "+j.m.toFixed(2)+"x - +"+vnd(j.win)+" Dogcoin!");spmSync()}).catch(function(e){SPMBUSY=false;toast("❌ "+e.message);spmSync()});return}',
    // (B) đã đặt trước -> bấm để HUỶ (hoàn tiền)
    'if(SPM.myNext){SPMBUSY=true;api("/api/spm/cancelnext",{}).then(function(j){SPMBUSY=false;setBal(j.balance);toast("↩️ Đã huỷ đặt trước - hoàn tiền");spmSync()}).catch(function(e){SPMBUSY=false;toast("❌ "+e.message);spmSync()});return}',
    // (C) đã cược chuyến này rồi, đang chờ bay -> khỏi làm gì
    'if(SPM.phase==="bet"&&SPM.me)return;',
    // (D) đặt cược: mở cửa -> vào chuyến này; đang bay/nổ -> server tự xếp cho chuyến sau
    'var amt=parseInt($("spmAmt").value)||0;if(amt<SPM.minBet)return toast("Cược tối thiểu "+vnd(SPM.minBet));',
    'var auto=$("spmAutoOn").checked?(parseFloat($("spmAutoX").value)||0):0;if($("spmAutoOn").checked&&auto<1.01)return toast("Mốc tự rút phải ≥ 1.01x");',
    'SPMBUSY=true;api("/api/spm/bet",{amount:amt,auto:auto}).then(function(j){SPMBUSY=false;setBal(j.balance);toast(j.queued?("🔜 Đã đặt "+vnd(amt)+" cho chuyến sau"):("🛫 Lên chuyến "+vnd(amt)+(auto>=1.01?" · tự rút "+auto+"x":"")));spmSync()}).catch(function(e){SPMBUSY=false;toast("❌ "+e.message);spmSync()});return}',
    '',
    // ===== 💸 CHUYỂN / RÚT DOGCOIN (28/08) - xử lý THẲNG (web -> dashboard/SFTP hoặc ví DB), không qua Discord =====
    'var DOGBUSY=false,DOGTARGETS=[],DOGSEL={};',
    'function dogSync(){api("/api/dogbridge/state").then(function(j){setBal(j.balance);',
    '$("dogLink").innerHTML=j.ingameName?("Nhân vật: <b>"+esc(j.ingameName)+"</b>"):"⚠️ Chưa liên kết tên nhân vật - nhắn admin";',
    '$("dogMax1").textContent=vnd(j.max);$("dogMax2").textContent=vnd(j.max);',
    // 💱 11/09: tỉ lệ nạp game->web (server quyết) - hiện rõ 1 game = N web
    'DOGRATE=j.napRate>0?j.napRate:1;var nri=$("dogNapRateInfo");if(nri)nri.textContent=DOGRATE!==1?("💱 Tỉ lệ 1 : "+DOGRATE+" - lấy 1 Dogcoin trong game được "+DOGRATE+" Dogcoin web!"):"";',
    // 📅 11/09: mỗi chiều 1 dòng hạn riêng + xem trước khi gõ (chủ server: "nạp ra web không có cảnh báo vượt")
    'DOGST=j;var ddm=j.dayMax>0?j.dayMax:0,ddi=$("dogDayInfo");if(ddi)ddi.innerHTML=ddm?("📅 Hạn rút vào game <b>"+vnd(ddm)+"</b>/ngày · hôm nay còn <b>"+vnd(Math.max(0,ddm-(j.rutToday||0)))+"</b>"):"";',
    'var ndi=$("dogNapDayInfo");if(ndi){var nl=Math.max(0,ddm-(j.napToday||0));ndi.innerHTML=ddm?("📅 Hạn nạp ra web <b>"+vnd(ddm)+"</b> Dogcoin TRONG GAME/ngày · hôm nay còn lấy được <b>"+vnd(nl)+"</b> trong game"+(DOGRATE!==1?" (= nhận <b>"+vnd(Math.floor(nl*DOGRATE))+"</b> web)":"")):""}dogPreview();',
    // 🪙 14/09: khung tỉ lệ + dòng giới hạn CHUNG quy ra vàng (per = 100 vàng/1 Dogcoin game, st = bội số nhập)
    'var per=j.goldPerDog||100,st=j.goldStep||10000;',
    'var gs=$("dogGoldStat");if(gs)gs.textContent="tỉ lệ 1 : "+DOGRATE+" · dùng chung giới hạn với Chuyển Dogcoin ra web";',
    'var gg=$("dogGoldUnitG"),gd=$("dogGoldUnitD");if(gg)gg.textContent=vnd(st);if(gd)gd.textContent=vnd(Math.floor(st*DOGRATE/per));',
    'var gdi=$("dogGoldDayInfo");if(gdi){var lg=Math.floor(Math.max(0,ddm-(j.napToday||0))*per/st)*st;gdi.innerHTML=ddm?("📅 Dùng CHUNG giới hạn với Chuyển Dogcoin ra web · hôm nay còn đổi được <b>"+vnd(lg)+"</b> vàng (= nhận <b>"+vnd(Math.floor(lg*DOGRATE/per))+"</b> Dogcoin)"):""}',
    'dogGoldPreview();',
    // 🔁 09/09: admin đóng chiều nào thì nút chiều đó khoá + đổi chữ (không mất nút, người chơi biết lý do)
    'var rb=$("dogRutBtn"),nb=$("dogNapBtn");var rOn=j.rutOpen!==false,nOn=j.napOpen!==false;',
    'rb.disabled=!j.ingameName||!rOn;nb.disabled=!j.ingameName||!nOn;',
    'rb.textContent=rOn?"🎮 Rút vào game":"⛔ RÚT VÀO GAME ĐANG ĐÓNG";nb.innerHTML=nOn?DOGNAPLB:"⛔ CHUYỂN RA WEB ĐANG ĐÓNG";',
    '}).catch(function(e){toast("❌ "+e.message)});',
    'api("/api/players").then(function(j){DOGTARGETS=j.list||[];',
    // người rời list (đổi ví...) thì bỏ khỏi lựa chọn cho khỏi gửi nhầm
    'var ok={};DOGTARGETS.forEach(function(p){ok[p.id]=1});Object.keys(DOGSEL).forEach(function(id){if(!ok[id])delete DOGSEL[id]});',
    '$("dogTfStat").textContent=DOGTARGETS.length+" người có ví";dogRenderPick()}).catch(function(){})}',
    // 💸 chọn NHIỀU người nhận bằng chip: bấm chọn/bỏ, tổng tiền cập nhật sống
    'function dogRenderPick(){var box=$("dogTfPick");if(!box)return;',
    'box.innerHTML=DOGTARGETS.length?DOGTARGETS.map(function(p){var on=!!DOGSEL[p.id];return "<span class=\\"dogChip"+(on?" sel":"")+"\\" onclick=\\"dogTogglePick(\'"+p.id+"\')\\">"+(on?"✅ ":"")+esc(p.name||p.id)+"</span>"}).join(""):"<span class=\\"muted\\">Chưa có ai khác có ví.</span>";dogTfSumDraw()}',
    'function dogTogglePick(id){if(DOGSEL[id])delete DOGSEL[id];else DOGSEL[id]=1;dogRenderPick()}',
    'function dogTfSumDraw(){var n=Object.keys(DOGSEL).length;var amt=parseInt($("dogTfAmt").value)||0;var el=$("dogTfSum");if(!el)return;',
    'el.innerHTML=n?("Đã chọn <b>"+n+"</b> người × "+vnd(amt)+" = trừ tổng <b style=\\"color:#ffd76a\\">"+vnd(n*amt)+"</b> Dogcoin"):"Chưa chọn ai."}',
    'function dogTransfer(){if(DOGBUSY)return;var ids=Object.keys(DOGSEL);if(!ids.length)return toast("Bấm chọn ít nhất 1 người nhận đã");',
    'var amt=parseInt($("dogTfAmt").value)||0;if(amt<1)return toast("Nhập số Dogcoin mỗi người");',
    'DOGBUSY=true;api("/api/transfer/multi",{toIds:ids,amount:amt}).then(function(j){DOGBUSY=false;setBal(j.balance);toast("💸 Đã chuyển "+vnd(amt)+"/người cho "+(j.names||[]).join(", ")+(ids.length>1?" - tổng "+vnd(j.total||amt*ids.length):""));$("dogTfAmt").value="";DOGSEL={};dogRenderPick()}).catch(function(e){DOGBUSY=false;toast("❌ "+e.message)})}',
    'function dogRut(){if(DOGBUSY)return;var amt=parseInt($("dogRutAmt").value)||0;if(amt<1)return toast("Nhập số Dogcoin");',
    'DOGBUSY=true;var b=$("dogRutBtn");b.disabled=true;b.textContent="⏳ Đang giao...";api("/api/dogbridge/rut",{amount:amt}).then(function(j){DOGBUSY=false;b.textContent="🎮 Rút vào game";setBal(j.balance);toast(j.message||"✅ Đã rút!");$("dogRutAmt").value="";dogSync()}).catch(function(e){DOGBUSY=false;b.disabled=false;b.textContent="🎮 Rút vào game";toast("❌ "+e.message);dogSync()})}',
    'var DOGRATE=1,DOGST=null;',
    'var DOGNAPLB="<img src=\\"/itemimage/T_itemicon_Material_DogCoin.webp\\" class=\\"bic\\" alt=\\"\\">Chuyển ra web";',

    // xem trước khi gõ số: rút -> còn/vượt hạn + trần/lần; nạp -> đổi ra web + còn/vượt hạn
    'function dogPreview(){if(!DOGST)return;var mx=DOGST.max||0,dm=DOGST.dayMax>0?DOGST.dayMax:0;',
    'var ra=parseInt(($("dogRutAmt")||{}).value)||0,rp=$("dogRutPrev");if(rp){if(!ra)rp.textContent="";else{var rl=dm?Math.max(0,dm-(DOGST.rutToday||0)):Infinity;if(mx&&ra>mx){rp.style.color="#ff8a80";rp.textContent="⚠️ Vượt giới hạn "+vnd(mx)+"/lần"}else if(ra>rl){rp.style.color="#ff8a80";rp.textContent="⚠️ Vượt hạn ngày - hôm nay chỉ còn rút được "+vnd(rl)+" Dogcoin"}else{rp.style.color="#8fd18f";rp.textContent="→ Túi game +"+vnd(ra)+" Dogcoin, ví web -"+vnd(ra)}}}',
    'var na=parseInt(($("dogNapAmt")||{}).value)||0,np=$("dogNapPrev");if(np){if(!na)np.textContent="";else{var web=Math.floor(na*DOGRATE),nlft=dm?Math.max(0,dm-(DOGST.napToday||0)):Infinity;if(mx&&na>mx){np.style.color="#ff8a80";np.textContent="⚠️ Vượt giới hạn "+vnd(mx)+"/lần"}else if(na>nlft){np.style.color="#ff8a80";np.textContent="⚠️ Vượt hạn ngày: hôm nay chỉ còn lấy được "+vnd(nlft)+" Dogcoin trong game (= nhận "+vnd(Math.floor(nlft*DOGRATE))+" web)"}else{np.style.color="#8fd18f";np.textContent="→ Lấy "+vnd(na)+" Dogcoin trong game, ví web +"+vnd(web)+(DOGRATE!==1?" (tỉ lệ 1 : "+DOGRATE+")":"")}}}}',
// 🪙 14/09: ô nhập vàng tự chèn dấu ngăn nghìn, chỉ nhận bội số 10.000, xem trước ra bao nhiêu Dogcoin
    'function dogGoldNum(){return parseInt(((($("dogGoldAmt")||{}).value)||"").replace(/[^0-9]/g,""))||0}',
    'function dogGoldFmt(el){var d=(el.value||"").replace(/[^0-9]/g,"");el.value=d?Number(d).toLocaleString("vi-VN"):"";dogGoldPreview()}',
    'function dogGoldPreview(){if(!DOGST)return;var p=$("dogGoldPrev");if(!p)return;var g=dogGoldNum();if(!g){p.textContent="";return}',
    'var per=DOGST.goldPerDog||100,st=DOGST.goldStep||10000,dm=DOGST.dayMax>0?DOGST.dayMax:0,mx=DOGST.max||0;',
    'if(g%st){p.style.color="#ff8a80";p.textContent="⚠️ Chỉ đổi theo bội số "+vnd(st)+" vàng ("+vnd(st)+" · "+vnd(st*2)+" · "+vnd(st*5)+"…)";return}',
    'if(mx&&g>mx){p.style.color="#ff8a80";p.textContent="⚠️ Vượt giới hạn "+vnd(mx)+" vàng/lần";return}',
    'var lg=dm?Math.floor(Math.max(0,dm-(DOGST.napToday||0))*per/st)*st:Infinity;',
    'if(g>lg){p.style.color="#ff8a80";p.textContent="⚠️ Vượt giới hạn ngày (chung với Chuyển Dogcoin ra web) - hôm nay chỉ còn đổi được "+vnd(lg)+" vàng";return}',
    'p.style.color="#8fd18f";p.textContent="→ Trừ "+vnd(g)+" vàng trong game, ví web +"+vnd(Math.floor(g*DOGRATE/per))+" Dogcoin"}',
    'function dogGold(){if(DOGBUSY)return;var g=dogGoldNum();if(!g)return toast("Nhập số vàng");',
    'var st=(DOGST&&DOGST.goldStep)||10000;if(g%st)return toast("⚠️ Chỉ đổi theo bội số "+vnd(st)+" vàng");',
    'DOGBUSY=true;var b=$("dogGoldBtn");b.disabled=true;b.textContent="⏳ Đang đổi...";',
    'api("/api/dogbridge/napgold",{gold:g}).then(function(j){DOGBUSY=false;b.disabled=false;b.textContent="🪙 Đổi ra Dogcoin";setBal(j.balance);toast(j.message);$("dogGoldAmt").value="";dogSync()}).catch(function(e){DOGBUSY=false;b.disabled=false;b.textContent="🪙 Đổi ra Dogcoin";toast("❌ "+e.message)})}',
    'function dogNap(){if(DOGBUSY)return;var amt=parseInt($("dogNapAmt").value)||0;if(amt<1)return toast("Nhập số Dogcoin");if(DOGRATE!==1)toast("💱 Lấy "+vnd(amt)+" trong game → +"+vnd(Math.floor(amt*DOGRATE))+" Dogcoin web");',
    'DOGBUSY=true;var b=$("dogNapBtn");b.disabled=true;b.textContent="⏳ Đang chuyển...";api("/api/dogbridge/nap",{amount:amt}).then(function(j){DOGBUSY=false;b.innerHTML=DOGNAPLB;setBal(j.balance);toast(j.message||"✅ Đã nạp!");$("dogNapAmt").value="";dogSync()}).catch(function(e){DOGBUSY=false;b.disabled=false;b.innerHTML=DOGNAPLB;toast("❌ "+e.message);dogSync()})}',
    '',
    // ===== 🎒 RƯƠNG PAL (trang Hồ sơ) =====
    'var PC=null,PCIT=null,PCBUSY=false,PCCDUNTIL=0,PCCDTICKING=false,PCCD=0;',
    // ⏳ cooldown nhận pal CHUNG toàn server: dựng lại từ claimCdLeft (F5 vẫn đúng)
    'function pcCdRule(){if(!PCCD)return"";return PCCD%60===0?(PCCD/60)+" phút/lần":PCCD+"s/lần"}',
    // 📅 hạn mức pal/ngày: server đưa palDayMax/palDayUsed trong state hồ sơ; nhận xong
    // client tải lại rương -> số tự cập nhật. Hết lượt thì đổi màu vàng cho dễ thấy.
    // 🆘 tẩu thoát: đồng hồ đếm theo state hồ sơ, chỉ khoá nút - luật thật ở server
    'var RSCUNTIL=0,RSCCD=14400000,RSCBUSY=false;',
    'function pcRescueTick(){var b=$("pcRescueBtn");if(!b)return;',
    'if(RSCBUSY){b.disabled=true;b.textContent="⏳ Đang dịch chuyển...";return}',
    'var left=RSCUNTIL-Date.now();',
    'if(left>0){b.disabled=true;b.textContent="🆘 TẨU THOÁT KHẨN CẤP ("+Math.ceil(left/60000)+"p nữa)"}else{b.disabled=false;b.textContent="🆘 TẨU THOÁT KHẨN CẤP"}}',
    'setInterval(pcRescueTick,30000);',
    'async function pcRescue(){if(RSCBUSY)return;',
    'if(!(await gConfirm("Dịch chuyển nhân vật về <b>ĐIỂM XUẤT PHÁT</b> ngay bây giờ? Dùng khi kẹt đất/kẹt đá - không chết, không rớt đồ.<br><b>1 tiếng mới dùng lại được.</b>","🆘 Tẩu thoát",true)))return;',
    'RSCBUSY=true;pcRescueTick();',
    'api("/api/pal/rescue",{}).then(function(j){RSCBUSY=false;RSCUNTIL=Date.now()+RSCCD;toast(j.message||"✅ Đã dịch chuyển!");pcRescueTick()})',
    '.catch(function(e){RSCBUSY=false;pcRescueTick();toast("❌ "+(e.message||"Lỗi"))});}',
    'var PDMAX=0,PDUSED=0;',
    'function pcDayNote(){var e=$("pcDayNote");if(!e)return;if(!(PDMAX>0)){e.style.display="none";return}var left=Math.max(0,PDMAX-PDUSED);e.style.display="";',
    'if(left>0){e.style.color="#aab3c5";e.style.borderColor="#3a4155";e.innerHTML="📅 Hôm nay bạn còn chuyển được <b style=\\"color:#8fffca\\">"+left+"/"+PDMAX+"</b> pal vào game (reset 00:00)"}',
    'else{e.style.color="#ffd27a";e.style.borderColor="#ffcf5c";e.innerHTML="📅 Hôm nay bạn đã chuyển đủ <b>"+PDMAX+"</b> pal vào game - qua 00:00 lại nhận tiếp được"}}',
    'function pcCdTick(){var left=Math.ceil((PCCDUNTIL-Date.now())/1000);var b=$("pcCdBanner");if(!b)return;',
    'if(left>0){b.style.display="";b.textContent="⏳ Kho pal chung đang bận - còn "+left+"s mới nhận được con tiếp ("+(pcCdRule()||"cooldown")+", dùng chung cả server)";if(!PCCDTICKING){PCCDTICKING=true;setTimeout(function tk(){pcCdTick();if(Date.now()<PCCDUNTIL)setTimeout(tk,500);else PCCDTICKING=false},500)}}else{b.style.display="none"}}',
    // người KHÁC vừa nhận pal thì mình đang ngồi trên trang cũng thấy đồng hồ: poll nhẹ 15s/lần
    'setInterval(function(){var pg=$("pageDaily");if(!pg||pg.classList.contains("hidden"))return;api("/api/pal/cd").then(function(j){PCCD=j.cd||PCCD;PCCDUNTIL=Date.now()+(j.left||0);pcCdTick()}).catch(function(){})},15000);',
    // 🎒 2 phần rương đóng/mở riêng - nhớ qua F5 (localStorage). Mặc định: chưa-nhận MỞ, đã-nhận ĐÓNG.
    'function pcSecState(){try{return JSON.parse(localStorage.getItem("pc_sec"))||{wait:1,done:0}}catch(e){return {wait:1,done:0}}}',
    'function pcSecOn(k){return !!pcSecState()[k]}',
    'function pcSecTog(k){var s=pcSecState();s[k]=s[k]?0:1;try{localStorage.setItem("pc_sec",JSON.stringify(s))}catch(e){}pcSync()}',
    // cb: mua/quay xong gọi pcSync(function(){pcOpen(id)}) để bật ngay bảng chọn linh hồn+passive
    'function pcSync(cb){api("/api/profile").then(function(j){PC=j;',
    'PCCD=j.claimCd||0;PCCDUNTIL=Date.now()+(j.claimCdLeft||0);pcCdTick();',
    'PDMAX=j.palDayMax||0;PDUSED=j.palDayUsed||0;pcDayNote();',
    'RSCCD=j.rescueCd||RSCCD;if(!RSCBUSY)RSCUNTIL=Date.now()+(j.rescueCdLeft||0);pcRescueTick();',
    'var inChest=0;j.chest.forEach(function(i){if(i.status==="chest")inChest++});',
    '$("pcStat").textContent=inChest+" pal trong rương";',
    '$("pcLink").innerHTML=j.ingameName?("Nhân vật liên kết: <b>"+esc(j.ingameName)+"</b> - bấm 🎁 Nhận là giao thẳng vào game (phải đang online trong game)"):"⚠️ Chưa liên kết tên nhân vật - nhắn <b>admin</b> liên kết rồi mới NHẬN pal được (bán thì vẫn bán được)";',
    // 07/09: rương tách 2 PHẦN - "chưa nhận" (chest/đang giao) và "đã nhận" (claimed/sold),
    // mỗi phần đóng/mở riêng, trạng thái lưu localStorage nên F5 giữ nguyên như đang xem
    'var row=function(it){var acts;',
    'if(it.status==="chest")acts="<button style=\\"background:linear-gradient(180deg,#ffd76a,#e0ac3f);color:#241d0a\\" onclick=\\"pcSell("+it.id+")\\">💰 Bán "+vnd(j.sellPrice)+"</button><button style=\\"background:linear-gradient(180deg,#2f8f4f,#256e3e)\\" onclick=\\"pcOpen("+it.id+")\\">🎁 Nhận vào game</button>";',
    'else if(it.status==="delivering")acts="<span class=\\"tag wait\\">⏳ ĐANG GIAO - admin đang kiểm</span>";',
    'else if(it.status==="sold")acts="<span class=\\"tag\\">ĐÃ BÁN</span>";',
    'else acts="<span class=\\"tag\\">✅ ĐÃ NHẬN"+(it.deliveredTo?" → "+esc(it.deliveredTo):"")+"</span>";',
    'var img=it.code?("<img src=\\"/palimage/T_"+it.code+"_icon_normal.png\\" loading=\\"lazy\\" alt=\\"\\" onerror=\\"this.style.display=\'none\'\\">"):"";',
    // 🧺 16/09: con đang CHỜ NHẬN mới có ô tick (đang giao / đã nhận / đã bán thì không bán được)
    'var ck=it.status==="chest"?("<input type=\\"checkbox\\" class=\\"pcCk\\" data-id=\\""+it.id+"\\" onchange=\\"pcCkSync()\\""+(PCSEL[it.id]?" checked":"")+">"):"";',
    'var jkc=!it.raid&&(it.jack||(PW&&PW.jackCode&&it.code===PW.jackCode));',
    'return "<div class=\\"pcItem"+(it.raid?" raid":"")+(jkc?" jack":"")+"\\"><div class=\\"pcTop\\">"+ck+img+"<div class=\\"pcMeta\\"><div><span class=\\"nm\\""+(jkc?" style=\\"color:#ffe98a\\"":"")+">"+(jkc?"💰 ":"")+esc(it.name)+"</span> "+(it.raid?"<span class=\\"tag raid\\">RAID</span> ":"")+(jkc?"<span class=\\"tag\\" style=\\"background:#3b2f0d;color:#ffe98a;border:1px solid #ffd24a\\">💰 NỔ HŨ</span> ":"")+(it.dex?"<span class=\\"tag\\">#"+it.dex+"</span>":"")+"</div><div class=\\"tm\\">"+esc(it.wonAt||"")+"</div></div></div><div class=\\"pcActs\\">"+acts+"</div></div>"};',
    // 🤝 11/09: pal đang giao dịch - của tôi đang rao (thu hồi) + lời bán gửi cho tôi (mua / từ chối)
    'var TR=j.trades||{out:[],in:[]};var trH="";',
    'var trImg=function(it){return it.code?("<img src=\\"/palimage/T_"+it.code+"_icon_normal.png\\" alt=\\"\\" onerror=\\"this.style.display=\'none\'\\">"):""};',
    'TR.in.forEach(function(t){trH+="<div class=\\"pcItem trIn\\"><div class=\\"pcTop\\">"+trImg(t.item)+"<div class=\\"pcMeta\\"><div><span class=\\"nm\\">"+esc(t.item.name)+"</span> "+(t.item.raid?"<span class=\\"tag raid\\">RAID</span> ":"")+(t.item.dex?"<span class=\\"tag\\">#"+t.item.dex+"</span>":"")+"</div><div class=\\"tm\\">📥 <b>"+esc(t.fromName)+"</b> muốn "+(t.price>0?"bán cho bạn giá <b style=\\"color:#ffd76a\\">"+vnd(t.price)+" Dogcoin</b>":"<b style=\\"color:#7cff9c\\">TẶNG</b> bạn")+" · "+esc(t.atText||"")+"</div></div></div>"',
    '+"<div class=\\"pcActs\\"><button style=\\"background:linear-gradient(180deg,#3ddc84,#2aa564);color:#08210f\\" onclick=\\"trAccept("+t.id+","+t.price+")\\">"+(t.price>0?"✅ Xác nhận mua với "+vnd(t.price):"🎁 Nhận tặng")+"</button><button style=\\"background:#4e5058\\" onclick=\\"trCancel("+t.id+",false)\\">❌ Từ chối</button></div></div>"});',
    'TR.out.forEach(function(t){trH+="<div class=\\"pcItem trOut\\"><div class=\\"pcTop\\">"+trImg(t.item)+"<div class=\\"pcMeta\\"><div><span class=\\"nm\\">"+esc(t.item.name)+"</span> "+(t.item.raid?"<span class=\\"tag raid\\">RAID</span> ":"")+(t.item.dex?"<span class=\\"tag\\">#"+t.item.dex+"</span>":"")+"</div><div class=\\"tm\\">📤 Đang rao cho <b>"+esc(t.toName)+"</b> giá <b style=\\"color:#ffd76a\\">"+(t.price>0?vnd(t.price)+" Dogcoin":"TẶNG (0)")+"</b> · chờ bên kia xác nhận · "+esc(t.atText||"")+"</div></div></div>"',
    '+"<div class=\\"pcActs\\"><button style=\\"background:linear-gradient(180deg,#e86a6a,#c23c3c)\\" onclick=\\"trCancel("+t.id+",true)\\">↩️ Thu hồi pal</button></div></div>"});',
    'if(TR.in.length||TR.out.length)trH="<div class=\\"pcSecH\\"><b>🤝 ĐANG GIAO DỊCH ("+(TR.in.length+TR.out.length)+")</b><span class=\\"muted\\">"+(TR.in.length?TR.in.length+" lời bán gửi cho bạn":"")+(TR.in.length&&TR.out.length?" · ":"")+(TR.out.length?TR.out.length+" pal bạn đang rao":"")+"</span></div>"+trH;',
    'var wait=j.chest.filter(function(i){return i.status==="chest"||i.status==="delivering"});',
    'var done=j.chest.filter(function(i){return i.status==="claimed"||i.status==="sold"});',
    'var cmax=j.chestMax||0,cwait=(j.chestWait!==undefined?j.chestWait:wait.length);',
    'var h="<div class=\\"pcSecH\\" onclick=\\"pcSecTog(\'wait\')\\"><b>🎁 CHƯA NHẬN ("+wait.length+(cmax?"/"+cmax:"")+")</b><span>"+(cmax&&cwait>=cmax?"⚠️ ĐẦY - bán bớt hoặc nhận vào game mới quay tiếp được · ":"")+(pcSecOn("wait")?"▾ thu gọn":"▸ mở ra")+"</span></div>";',
    'if(pcSecOn("wait"))h+=wait.map(row).join("")||"<div class=\\"muted\\" style=\\"margin:6px 0 10px\\">Không có pal chờ nhận - qua tab 🎁 Quay Pal thử vận may!</div>";',
    // 📜 16/09: server chỉ gửi 100 con gần nhất nên tiêu đề nói thẳng vậy, không hiện tổng số nữa
    'h+="<div class=\\"pcSecH\\" onclick=\\"pcSecTog(\'done\')\\"><b>✅ ĐÃ NHẬN / BÁN "+(j.doneShow||100)+" PAL GẦN NHẤT</b><span>"+(pcSecOn("done")?"▾ thu gọn":"▸ mở ra")+"</span></div>";',
    'if(pcSecOn("done"))h+=done.map(row).join("")||"<div class=\\"muted\\" style=\\"margin:6px 0\\">Chưa nhận/bán con nào.</div>";',
    '$("pcList").innerHTML=trH+h;',
    // 🧺 16/09: bỏ khỏi danh sách đã tick những con không còn bán được, rồi cập nhật thanh bán loạt
    'var live={};wait.forEach(function(i){if(i.status==="chest")live[i.id]=1});',
    'Object.keys(PCSEL).forEach(function(k){if(!live[k])delete PCSEL[k]});',
    'var nSell=Object.keys(live).length;',
    'var bulk=$("pcBulk");if(bulk){if(nSell&&pcSecOn("wait"))bulk.classList.remove("hidden");else bulk.classList.add("hidden")}',
    'pcCkSync();',
    'if(cb)cb()',
    '}).catch(function(e){toast("❌ "+e.message)})}',
    // 🤝 11/09: nút Bán -> popup 2 lựa chọn (shop | người chơi khác)
    'var TMID=null,TMTO="";',
    // 🧺 16/09 BÁN HÀNG LOẠT: PCSEL giữ id đang tick (sống qua mỗi lần vẽ lại danh sách).
    'var PCSEL={},PCSELBUSY=false;',
    'function pcCkAll(el){var on=el.checked;document.querySelectorAll("input.pcCk").forEach(function(c){c.checked=on;if(on)PCSEL[c.dataset.id]=1;else delete PCSEL[c.dataset.id]});pcCkSync()}',
    // đọc thẳng từ DOM để không lệch với cái người chơi đang thấy
    'function pcCkSync(){var all=document.querySelectorAll("input.pcCk"),n=0;',
    'all.forEach(function(c){if(c.checked){PCSEL[c.dataset.id]=1;n++}else delete PCSEL[c.dataset.id]});',
    'var b=$("pcSellN"),t=$("pcSelN"),a=$("pcAll");',
    'if(a)a.checked=all.length>0&&n===all.length;',
    'var gia=(PC&&PC.sellPrice)||0;',
    'if(t)t.textContent=n?("Đã chọn "+n+"/"+all.length+" con → +"+vnd(n*gia)+" Dogcoin"):("Chưa chọn con nào ("+all.length+" con bán được)");',
    'if(b){b.disabled=!n||PCSELBUSY;b.textContent=PCSELBUSY?"⏳ Đang bán...":(n?"🧺 Bán "+n+" con (+"+vnd(n*gia)+")":"🧺 Bán đã chọn")}}',
    'function pcSellMany(){if(PCSELBUSY)return;var ids=Object.keys(PCSEL).map(Number).filter(function(x){return x});',
    'if(!ids.length)return toast("Chưa chọn con nào");',
    // ⚠️ hộp xác nhận của WEB là gConfirm (uiConfirm là của panel admin - gọi nhầm là nút chết im lặng)
    'gConfirm("Bán <b>"+ids.length+"</b> pal đã chọn lấy <b>"+vnd(ids.length*((PC&&PC.sellPrice)||0))+"</b> Dogcoin?<br>Bán rồi KHÔNG lấy lại được.","💰 Bán hết").then(function(okk){',
    'if(!okk)return;PCSELBUSY=true;pcCkSync();',
    'api("/api/pal/sell-many",{ids:ids}).then(function(j){PCSELBUSY=false;PCSEL={};setBal(j.balance);',
    'toast("💰 Đã bán "+j.n+" pal, +"+vnd(j.sold)+" Dogcoin"+(j.bo?" ("+j.bo+" con bỏ qua vì đang giao/đang quay)":""));pcSync()',
    '}).catch(function(e){PCSELBUSY=false;pcCkSync();toast("❌ "+e.message)})})}',
    'function pcSell(id){if(!PC)return;var it=null;PC.chest.forEach(function(i){if(i.id===id)it=i});if(!it)return;TMID=id;',
    '$("tmTitle").textContent="💰 Bán "+it.name;$("tmShop").textContent="🏪 Bán cho shop +"+vnd(PC.sellPrice)+" Dogcoin";$("tmPrice").value="";',
    'TMTO="";$("tmFind").value="";$("tmToLbl").textContent="Chưa chọn người nhận";',
    'if(DOGTARGETS.length)tmRenderPick();else api("/api/players").then(function(j){DOGTARGETS=j.list||[];tmRenderPick()}).catch(function(){tmRenderPick()});',
    '$("tmodal").classList.remove("hidden")}',
    'function tmClose(){$("tmodal").classList.add("hidden");TMID=null}',
    // chọn người nhận bằng chip (1 người), có ô lọc tên - dùng lại style .dogChip của 🧧 Lộc lá
    'function tmRenderPick(){var q=(($("tmFind")||{}).value||"").trim().toLowerCase();var box=$("tmPick");if(!box)return;var list=DOGTARGETS.filter(function(p){return !q||(p.name||"").toLowerCase().indexOf(q)>=0});',
    'box.innerHTML=list.length?list.map(function(p){var on=TMTO===p.id;return "<span class=\\"dogChip"+(on?" sel":"")+"\\" onclick=\\"tmPickTo(\'"+p.id+"\')\\">"+(on?"✅ ":"")+esc(p.name||p.id)+"</span>"}).join(""):"<span class=\\"muted\\" style=\\"font-size:12px\\">"+(DOGTARGETS.length?"Không có ai khớp tên":"Chưa có người chơi khác có ví")+"</span>"}',
    'function tmPickTo(id){TMTO=(TMTO===id)?"":id;var p=null;DOGTARGETS.forEach(function(x){if(x.id===id)p=x});$("tmToLbl").innerHTML=TMTO?("Người nhận: <b style=\\"color:#7cff9c\\">"+esc(p?p.name:id)+"</b>"):"Chưa chọn người nhận";tmRenderPick()}',
    'async function tmSellShop(){if(TMID===null||!PC)return;var id=TMID;tmClose();if(!(await gConfirm("Bán pal này cho shop lấy <b>"+vnd(PC.sellPrice)+"</b> Dogcoin? Không hoàn tác được.","💰 Bán")))return;',
    'api("/api/pal/sell",{id:id}).then(function(j){setBal(j.balance);toast("💰 +"+vnd(j.sold)+" Dogcoin");pcSync()}).catch(function(e){toast("❌ "+e.message)})}',
    'function tmOffer(){if(TMID===null)return;var to=TMTO;var pr=parseInt($("tmPrice").value)||0;if(!to)return toast("Bấm chọn 1 người nhận trước");if(pr<0)return toast("Giá không hợp lệ");var id=TMID;',
    'api("/api/pal/trade/offer",{id:id,toId:to,price:pr}).then(function(j){tmClose();toast(pr>0?"📤 Đã gửi lời bán "+j.trade.item.name+" cho "+j.trade.toName+" giá "+vnd(pr)+" - chờ bên kia xác nhận":"🎁 Đã gửi lời tặng "+j.trade.item.name+" cho "+j.trade.toName);pcSync()}).catch(function(e){toast("❌ "+e.message)})}',
    'async function trCancel(tid,mine){if(!(await gConfirm(mine?"Thu hồi pal về rương của bạn? Lời bán sẽ huỷ.":"Từ chối lời bán này? Pal trả về cho người bán.",mine?"↩️ Thu hồi":"❌ Từ chối",true)))return;',
    'api("/api/pal/trade/cancel",{tradeId:tid}).then(function(j){toast(j.how==="cancel"?"↩️ Đã thu hồi "+j.item.name+" về rương":"❌ Đã từ chối, "+j.item.name+" trả về người bán");pcSync()}).catch(function(e){toast("❌ "+e.message)})}',
    'async function trAccept(tid,price){if(!(await gConfirm(price>0?"Xác nhận mua pal này với <b>"+vnd(price)+"</b> Dogcoin? Tiền chuyển thẳng cho người bán, pal vào rương bạn.":"Nhận pal được tặng vào rương?",price>0?"✅ Mua":"🎁 Nhận")))return;',
    'api("/api/pal/trade/accept",{tradeId:tid}).then(function(j){setBal(j.balance);toast(j.price>0?"✅ Đã mua "+j.item.name+" từ "+j.fromName+" với "+vnd(j.price)+" Dogcoin - pal trong rương":"🎁 Đã nhận "+j.item.name+" từ "+j.fromName);pcSync()}).catch(function(e){toast("❌ "+e.message)})}',
    'function pcOpen(id){if(!PC)return;',
    'if(PCCDUNTIL>Date.now())return toast("⏳ Kho pal đang bận (cooldown chung toàn server) - chờ "+Math.ceil((PCCDUNTIL-Date.now())/1000)+"s rồi nhận con tiếp");',
    'PCIT=null;PC.chest.forEach(function(i){if(i.id===id)PCIT=i});if(!PCIT)return;',
    'if(!PC.ingameName)return toast("⚠️ Chưa liên kết tên nhân vật - nhắn admin trước đã");',
    '$("pcmTitle").textContent="🎁 Nhận "+PCIT.name;',
    '$("pcmBase").innerHTML=PC.raw?"🔒 <b>CHẾ ĐỘ PAL GỐC</b> (admin tắt chỉ số): giao <b>Lv 1</b> · <b>0 sao</b> · <b>IV "+(PC.rawIv||0)+"</b> cả 3 · <b>linh hồn "+(PC.rawSoulPct||0)+"%</b> cả 4 dòng · <b>không passive</b> · bản <b>THƯỜNG</b> - chỉ chọn giới tính":"Mặc định: <b>Lv "+PC.level+"</b> · <b>"+PC.stars+" sao</b> · <b>IV 100</b> cả 3 chỉ số · bản <b>THƯỜNG</b>";',
    // 🔒 09/09: PAL GỐC -> ẩn cột linh hồn + IV và nút BOSS (server bỏ qua dù gửi lên)
    'var colL=$("pcmColL");if(colL)colL.style.display=PC.raw?"none":"";var colR=$("pcmColR");if(colR)colR.style.display=PC.raw?"none":"";if(PC.raw)PCSEL={};',   // 🔒 v2: ẩn luôn passive
    // 👑 reset lựa chọn boss mỗi lần mở bảng + chỉ hiện khi đang mở bán và pal CÓ bản boss
    'PCBOSS=0;var bbt=$("pcmBossBtn");if(bbt)bbt.classList.remove("on");',
    'var bRow=$("pcmBossRow");if(bRow)bRow.style.display=(!PC.raw&&PC.boss&&!/^Yakushima/i.test(PCIT.code||"")&&(PC.noBoss||[]).indexOf(PCIT.code)<0)?"":"none";',
    'var bpr=$("pcmBossPrice");if(bpr)bpr.textContent=vnd((PC.up&&PC.up.boss)||10000);',
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
    'var nameHtml=p.wt?("<b class=\\"pwt\\">"+esc(p.name)+"</b> <span style=\\"color:var(--gold);font-size:10px\\">💎 "+vnd((PC.up&&PC.up.wt)||1000)+"</span>"):("<b style=\\"color:"+c+"\\">"+esc(p.name)+"</b>"+((p.tier===4&&PC.up&&PC.up.t4>0)?" <span style=\\"color:var(--gold);font-size:10px\\">💎 "+vnd(PC.up.t4)+"</span>":""));',   // 09/09: hạng 4 thường có giá riêng
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
    'async function pcBuildDel(i){var b=(PC.myBuilds||[])[i];if(!b)return;',
    'if(!(await gConfirm("Xoá build ⭐ <b>"+esc(b.name)+"</b>?","🗑️ Xoá",true)))return;',
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
    // 09/09: phí THÊM DÒNG ghi ngay cạnh dòng (dòng vượt số dòng gốc miễn phí), tách với phí kéo %
    'var c1=on?pcSoulLineCost(sp,base):0;var lf=0;if(on){lines++;if(lines>(PC.soulMax||1))lf=(up.soulLine||0)}',
    '$("sc_"+k).textContent=on?((lf?("💎 +"+vnd(lf)+" thêm dòng"):"dòng gốc miễn phí")+(c1?(" · 💎 +"+vnd(c1)+" kéo %"):"")):"";',
    'if(on){sc+=c1;soulRows.push({k:k,sp:sp,c:c1,lf:lf})}});',
    'var lc=Math.max(0,lines-(PC.soulMax||1))*(up.soulLine||0);',   // 09/09: giá PHẲNG mỗi dòng vượt số dòng gốc miễn phí (PC.soulMax)
    'var ivc=(Math.max(0,ih-bi)+Math.max(0,ia-bi)+Math.max(0,idf-bi))*(up.iv||0);',
    'var pk=Object.keys(PCSEL).length,pc=0,pr={5:up.slot5||0,6:up.slot6||0,7:up.slot7||0,8:up.slot8||0};',
    'for(var i=(PC.passiveMax||4)+1;i<=pk;i++)pc+=(i>=5?(pr[i]||0):(up.slotLow||0));',   // 09/09: ô 2-4 vượt gốc miễn phí cũng tính (giá slotLow)
    'var wtn=0;(PC.passives||[]).forEach(function(pp){if(pp.wt&&PCSEL[pp.id])wtn++});',
    'var wtc=wtn*(up.wt||0);',
    'var t4n=0;(PC.passives||[]).forEach(function(pp){if(pp.tier===4&&!pp.wt&&PCSEL[pp.id])t4n++});var t4c=t4n*(up.t4||0);',   // 💎 09/09: passive hạng 4 thường
    'var bc=PCBOSS?((up.boss)||0):0;',   // 👑 phí bản PAL BOSS
    '$("pcmLineCost").textContent=lc?("💎 "+(lines-(PC.soulMax||1))+" dòng vượt "+(PC.soulMax||1)+" dòng gốc miễn phí × "+vnd(up.soulLine||0)+" = +"+vnd(lc)):"";',
    '$("pcmIvCost").textContent=ivc?("💎 phụ phí IV: +"+vnd(ivc)+" ("+vnd(up.iv||0)+"/điểm mỗi chỉ số)"):"gốc miễn phí";',
    '$("pcmPassCost").textContent=pc?("💎 +"+vnd(pc)):"";',
    'if(PC.raw){sc=0;lc=0;ivc=0;bc=0;pc=0;wtc=0;t4c=0;PCSEL={}}',   // 🔒 PAL GỐC v2: không phí gì cả (không passive)
    'PCUP=sc+lc+ivc+pc+wtc+t4c+bc;',
    // 🧾 tổng kết: mua gì, tốn gì - từng dòng một, phí bên phải
    'var line=function(l,v){return "<div class=\\"sline\\"><span class=\\"muted\\">"+l+"</span><b>"+v+"</b></div>"};',
    'var bIco="<img src=\\"/palboss.png\\" alt=\\"👑\\" style=\\"width:15px;height:15px;vertical-align:-3px;border-radius:3px\\" onerror=\\"this.outerHTML=\'👑\'\\"> ";',
    'var sum=PC.raw?line("Pal",esc(PCIT?PCIT.name:"?")+" · thường · <b>Lv1 · 0⭐ · IV "+(PC.rawIv||0)+" · linh hồn "+(PC.rawSoulPct||0)+"% x4 dòng · không passive</b> (🔒 admin tắt chỉ số)"):line("Pal",esc(PCIT?PCIT.name:"?")+(PCBOSS?" · "+bIco+"BOSS":" · thường")+" · Lv"+(PC.level||80)+" · "+(PC.stars||4)+"⭐");',
    'if(PCBOSS)sum+=line(bIco+"Bản PAL BOSS","+"+vnd(bc));',
    // 09/09: mỗi dòng linh hồn ghi đủ phí của chính nó (thêm dòng + kéo %), không gộp cục "phí thêm dòng" ở dưới nữa
    'if(!PC.raw){soulRows.forEach(function(s){var f=s.lf+s.c;sum+=line("💠 Linh hồn "+SOUL_LBL[s.k]+" +"+s.sp+"%"+(s.lf?" · thêm dòng":" · dòng gốc"),f?"+"+vnd(f):"miễn phí")});',
    'if(!soulRows.length)sum+=line("💠 Linh hồn","<span style=\\"color:var(--red)\\">chưa chọn dòng nào</span>");}',
    'if(!PC.raw)sum+=line("🧬 IV Máu/Công/Thủ",ih+" / "+ia+" / "+idf+(ivc?" · +"+vnd(ivc):" · miễn phí"));',
    // 09/09: từng passive một dòng, phí ô (ô vượt gốc: 2-4 giá slotLow, 5-8 giá riêng) + phí 🌈 Cây Thế Giới ngay cạnh
    'var pIdx=0,pfree=(PC.passiveMax||4),pr2={5:up.slot5||0,6:up.slot6||0,7:up.slot7||0,8:up.slot8||0};',
    'Object.keys(PCSEL).forEach(function(id){pIdx++;var pp=(PC.passives||[]).filter(function(x){return x.id===id})[0];var sf=pIdx>pfree?(pIdx>=5?(pr2[pIdx]||0):(up.slotLow||0)):0;var wf=(pp&&pp.wt)?(up.wt||0):((pp&&pp.tier===4)?(up.t4||0):0);',
    'sum+=line("✨ Passive #"+pIdx+" "+esc(pp?pp.name:id)+(pp&&pp.wt?" 🌈":(pp&&pp.tier===4&&wf?" 💎":""))+(sf?" · ô vượt gốc":""),(sf+wf)?"+"+vnd(sf+wf)+(sf&&wf?" (ô "+vnd(sf)+" + passive "+vnd(wf)+")":""):"miễn phí")});',
    'if(!pIdx)sum+=line("✨ Passive",PC.raw?"🔒 tắt chỉ số - không chọn, game tự random":"game tự random");',
    '$("pcmSumBody").innerHTML=sum;',
    '$("pcmUpTotal").innerHTML=PCUP?("💎 Tổng phụ phí: <b style=\\"color:var(--gold)\\">"+vnd(PCUP)+"</b> Dogcoin (trừ ví khi nhận, giao hụt tự hoàn) · Ví: "+vnd(BAL)):"✅ Đang ở mức gốc, không tốn phụ phí · Ví: "+vnd(BAL)}',
    'function pcSoulLim(cb){var n=$("pcmSouls").querySelectorAll("input:checked").length;',
    'if(n>4){cb.checked=false;toast("Chỉ có 4 dòng linh hồn")}pcUpCalc()}',   // 09/09: soulMax = số dòng miễn phí, không chặn chọn nữa
    'var PCSEL={};',
    'function pcPassTog(id){var el=$("pp_"+id);if(!el)return;',
    'if(PCSEL[id]){delete PCSEL[id];el.classList.remove("sel")}',
    'else{if(Object.keys(PCSEL).length>=8)return toast("Tối đa 8 ô passive - bỏ bớt rồi chọn tiếp");PCSEL[id]=1;el.classList.add("sel")}',
    'var cb0=el.querySelector(".ppcb");if(cb0)cb0.checked=!!PCSEL[id];',
    'if(PCBK){PCBK="";pcBuildsRender()}', // tự tay đổi passive -> đã lệch bộ, tắt nút sáng
    '$("pcmPk").textContent=Object.keys(PCSEL).length;pcPassFilter();pcChipsRender();pcUpCalc()}',
    // hàng chip passive đã chọn - luôn hiện dù cuộn list, ✕ để bỏ (màu theo bậc/Cây Thế Giới)
    'function pcChipsRender(){var box=$("pcmChips");if(!box||!PC)return;var ids=Object.keys(PCSEL);',
    'if(!ids.length){box.innerHTML="<span class=\\"muted\\" style=\\"font-size:11.5px\\">Chưa chọn passive nào - bấm trong danh sách bên dưới</span>";return}',
    'var map={};(PC.passives||[]).forEach(function(p){map[p.id]=p});',
    'box.innerHTML=ids.map(function(id){var p=map[id]||{name:id};var c=p.wt?"#c9a2ff":(p.tier===4?"#3fe0cf":(p.tier===3?"#ffd76a":(p.bad?"#ff7a7a":"#e8ecf5")));',
    'return "<span class=\\"pchip\\" style=\\"border-color:"+c+"\\"><b style=\\"color:"+c+"\\">"+esc(p.name||id)+"</b><span class=\\"x\\" title=\\"bỏ chọn\\" onclick=\\"pcPassTog(\'"+id+"\')\\">✕</span></span>"}).join("")}',
    'function pcClose(){$("pcModal").classList.add("hidden");PCIT=null}',
    // 🚻 giới tính: 0=chưa chọn, 1=Đực, 2=Cái. Bắt buộc chọn mới nhận được.
    'var PCGENDER=0;',
    'function pcGenderPick(g){PCGENDER=g;$("pcmGM").classList.toggle("on",g===1);$("pcmGF").classList.toggle("on",g===2)}',
    // 👑 chọn bản PAL BOSS: bấm nút toggle - class "on" tô vàng cả ô
    'var PCBOSS=0;',
    'function pcBossTog(){PCBOSS=PCBOSS?0:1;var b=$("pcmBossBtn");if(b)b.classList.toggle("on",!!PCBOSS);pcUpCalc()}',
    'async function pcClaimGo(){if(!PCIT||PCBUSY)return;',
    'var souls=[].slice.call($("pcmSouls").querySelectorAll("input:checked")).map(function(c){return c.value});',
    'if(souls.length<1&&!(PC&&PC.raw))return toast("💠 Chọn ít nhất 1 dòng linh hồn trước đã (dòng đầu miễn phí)");',   // 🔒 09/09: chế độ PAL GỐC không có linh hồn -> bỏ kiểm
    'if(PCGENDER!==1&&PCGENDER!==2)return toast("🚻 Chọn giới tính ♂ Đực hoặc ♀ Cái trước đã");',
    'var passives=Object.keys(PCSEL);',
    'if(PCUP>0&&!(await gConfirm("💎 Nâng cấp vượt giới hạn tốn <b>"+vnd(PCUP)+"</b> Dogcoin, trừ ví ngay khi nhận (giao hụt tự hoàn). Đồng ý?","✅ Nhận & trừ phí")))return;',
    'PCBUSY=true;var b=$("pcmOk");b.disabled=true;b.textContent="⏳ Đang giao... (có thể mất 1-2 phút, ĐỪNG tắt trang)";',
    'api("/api/pal/claim",{id:PCIT.id,souls:souls,passives:passives,gender:PCGENDER,boss:PCBOSS,',
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
