// ============================================================
//  WEB PANEL CAN THIỆP KẾT QUẢ - dùng http built-in (0 dependency)
// ============================================================
const http = require('http');
const crypto = require('crypto');

function startPanel(ctx) {
    const PASSWORD = ctx.password;
    const tokens = new Set();

    const sendJSON = (res, code, obj) => {
        const body = JSON.stringify(obj);
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(body);
    };

    const readBody = (req) => new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
            if (data.length > 1e6) req.destroy(); // chặn body quá lớn
        });
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch { resolve({}); }
        });
        req.on('error', () => resolve({}));
    });

    // Để PANEL_PASSWORD trống = TẮT đăng nhập, ai mở được trang là vào được luôn.
    // Panel này nghe mọi interface nên tắt mật khẩu đồng nghĩa mở cho cả internet:
    // cộng/trừ Dogcoin, ép kết quả game, tặng item thật trong game. Chỉ tắt khi bạn
    // chấp nhận rủi ro đó, hoặc đã chặn cổng bằng firewall/SSH tunnel.
    const AUTH_OFF = !PASSWORD;

    const isAuthed = (req) => {
        if (AUTH_OFF) return true;
        const h = req.headers['authorization'] || '';
        const t = h.startsWith('Bearer ') ? h.slice(7) : '';
        return t && tokens.has(t);
    };

    // ===== PHÂN QUYỀN 2 CỔNG =====
    // ctx.port (1508)       = SUPER ADMIN: vào là full quyền — hiện cụm can thiệp,
    //                         nạp tiền không trần. Cổng này KHÔNG share cho ai.
    // ctx.publicPort (3001) = ADMIN THƯỜNG: cùng panel nhưng can thiệp bị khóa CỨNG
    //                         + trần nạp/ngày luôn áp.
    // Nhận diện theo cổng người gọi đang vào (req.socket.localPort).
    const SUPER_PORT = ctx.port;
    const epOk = (req) => req.socket.localPort === SUPER_PORT;

    // Trần nạp tiền khi KHÔNG mở khóa #: mỗi người chơi nhận tối đa 5 TỈ/ngày
    // qua panel (Cộng + phần TĂNG của Set + Phát tất cả). Mở khóa # = không trần.
    // Sổ theo ngày VN, lưu database để restart không mất. Muốn đổi trần: sửa số dưới.
    const DAILY_ADD_CAP = 5000000000;
    const vnToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const dailyBook = () => {
        const db = ctx.getDb();
        if (!db._panelAddDaily || db._panelAddDaily.date !== vnToday()) {
            db._panelAddDaily = { date: vnToday(), added: {} };
        }
        return db._panelAddDaily;
    };
    // Trả về null nếu được phép (và GHI SỔ), hoặc số còn lại nếu vượt trần.
    const takeDailyQuota = (uid, delta) => {
        if (delta <= 0) return null;
        const book = dailyBook();
        const used = book.added[uid] || 0;
        if (used + delta > DAILY_ADD_CAP) return DAILY_ADD_CAP - used;
        book.added[uid] = used + delta;
        return null;
    };

    const buildPlayers = () => {
        const db = ctx.getDb();
        return Object.keys(db)
            .filter(k => !k.startsWith('_') && db[k] && typeof db[k] === 'object')
            .map(id => ({
                id, name: db[id].name || '(chưa rõ tên)', points: db[id].points || 0, ingameName: db[id].ingameName || '',
                // 📒 nợ: hiện thẳng số trong db (index.js có vòng quét cộng lãi mỗi giờ)
                debt: db[id].debt ? ((db[id].debt.loan || 0) + (db[id].debt.admin || 0)) : 0,
                debtBad: !!(db[id].debt && db[id].debt.bad),
            }))
            .sort((a, b) => b.points - a.points);
    };

    const buildState = () => {
        const tx = ctx.getTX();
        const db = ctx.getDb();
        const wd = ctx.getWithdraw ? ctx.getWithdraw() : {};
        return {
            tx: (() => {
                const bets = Array.isArray(tx.bets) ? tx.bets : [];
                // gộp theo cửa cho admin thấy tiền đang gánh ở đâu (ép cho cửa nặng thua)
                const agg = { tai: 0, xiu: 0, chan: 0, le: 0, bao: 0 };
                bets.forEach(b => { if (agg[b.choice] !== undefined) agg[b.choice] += (b.amount || 0); });
                const lockS = ctx.txLockS || 15;
                const secsToBet = Math.max(0, (tx.targetTime || 0) - lockS - Math.floor(Date.now() / 1000));
                return {
                    gameId: tx.gameId,
                    status: tx.status,
                    targetTime: tx.targetTime,
                    betsCount: bets.length,
                    forced: tx.forcedResult || null,
                    live: !!tx.message,
                    channelId: (tx.channel && tx.channel.id) || db._txChannelId || '',
                    // 27/08: cho admin xem cược trực tiếp + ép tối ưu + biết cửa sổ còn mấy giây
                    betAgg: agg,
                    bets: bets.slice(-40).map(b => ({ name: b.username || b.userId, choice: b.choice, amount: b.amount || 0 })),
                    secsToBet,
                    baoRate: ctx.txBaoRate || 30,
                };
            })(),
            forcedMines: ctx.getForcedMines(),
            xs: (() => {
                if (!ctx.getXS) return null;
                const xs = ctx.getXS();
                let stake = 0, users = 0;
                for (const b of Object.values(xs.bets || {})) {
                    users++;
                    for (const v of Object.values(b.de || {})) stake += v;
                    for (const v of Object.values(b.lo || {})) stake += v;
                }
                return {
                    live: !!xs.message,
                    status: xs.status,
                    round: xs.round,
                    channelId: (xs.channel && xs.channel.id) || db._xsChannelId || '',
                    usersCount: users,
                    totalStake: stake,
                    forced: xs.forced,
                    bets: Object.entries(xs.bets || {}).map(([id, b]) => ({ id, name: b.name, de: b.de || {}, lo: b.lo || {} })),
                    history: (xs.history || []).slice(0, 10),
                };
            })(),
            withdraw: {
                live: !!wd.message,
                channelId: (wd.channel && wd.channel.id) || db._withdrawChannelId || '',
            },
            vay: ctx.getVay ? ctx.getVay() : { live: false, channelId: '' },
            gachaChannelId: db._gachaChannelId || '',
            giveaway: { channelId: db._giveawayChannelId || '', roleId: db._giveawayRoleId || '' },
            withdrawRequests: ctx.getWithdrawRequests ? ctx.getWithdrawRequests() : [],
            players: buildPlayers(),
            txHistory: (ctx.getTXDash ? ctx.getTXDash() : []),
            minesHistory: ctx.getMinesHistory ? ctx.getMinesHistory() : [],
            totalTiles: ctx.totalTiles || 24, // để lưới ép mìn luôn khớp bot, khỏi sửa 2 chỗ
            minesBoard: ctx.getMines ? ctx.getMines() : { on: false, channelId: '' },
            pot: ctx.getPot ? ctx.getPot() : null,   // 🏆 hũ nuôi chung 3 game
            stairsBoard: ctx.getStairs ? ctx.getStairs() : { on: false, channelId: '' },
            wheel: ctx.getWheel ? ctx.getWheel() : null,
            stock: ctx.getStock ? ctx.getStock() : null,
            stairsHistory: ctx.getStairsHistory ? ctx.getStairsHistory() : [],
            savedChannels: db._savedChannels || [],
            dogLedger: (ctx.getDogLedger ? ctx.getDogLedger() : []).slice(0, 80),
            palOrders: (ctx.getPalOrders ? ctx.getPalOrders() : []).slice(0, 30),
            // 🎁 vòng quay pal web + rương (25/08)
            palWheelCfg: ctx.getPalWheelCfg ? ctx.getPalWheelCfg() : null,
            palChests: ctx.palChestOverview ? ctx.palChestOverview().slice(0, 60) : [],
            loanCfg: ctx.getLoanCfg ? ctx.getLoanCfg() : null,
        };
    };

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;

            // Trang chủ. Nhúng thẳng trạng thái auth vào HTML thay vì để client tự dò
            // — client dò bằng fetch dễ hỏng khi trình duyệt còn cache bản JS cũ.
            // no-store để lần sau sửa panel là thấy ngay, không phải xóa cache.
            if (req.method === 'GET' && path === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(HTML.replace('__AUTH_OFF__', AUTH_OFF ? 'true' : 'false'));
            }

            // Đăng nhập
            if (req.method === 'POST' && path === '/api/login') {
                const body = await readBody(req);
                if (AUTH_OFF) {
                    return sendJSON(res, 200, { ok: true, token: 'no-auth' });
                }
                if (body.password === PASSWORD) {
                    const token = crypto.randomBytes(24).toString('hex');
                    tokens.add(token);
                    return sendJSON(res, 200, { ok: true, token });
                }
                ctx.writeLog('ADMIN', `[PANEL] Đăng nhập SAI mật khẩu từ ${req.socket.remoteAddress}`);
                return sendJSON(res, 401, { ok: false, error: 'Sai mật khẩu' });
            }

            // Các API còn lại đều cần auth
            if (path.startsWith('/api/')) {
                if (!isAuthed(req)) return sendJSON(res, 401, { ok: false, error: 'Chưa đăng nhập' });

                if (path === '/api/state') {
                    const st = buildState();
                    st.superAdmin = epOk(req); // cổng SUPER thì client tự hiện cụm can thiệp
                    return sendJSON(res, 200, { ok: true, state: st });
                }

                const body = req.method === 'POST' ? await readBody(req) : {};
                // ===== 📈 SÀN CỔ PHIẾU: chỉnh thông số + thả tin =====
                if (ctx.setStockCfg && req.method === 'POST' && path === '/api/stock/cfg') {
                    return sendJSON(res, 200, { ok: true, cfg: ctx.setStockCfg(body) });
                }
                // 25/08: can thiệp KÍN — giá trôi dần tới đích, không banner, không toast
                if (ctx.stockPush && req.method === 'POST' && path === '/api/stock/push') {
                    const pct = Number(body.pct);
                    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 40) {
                        return sendJSON(res, 400, { ok: false, error: 'Biên độ phải trong ±1..40%' });
                    }
                    return sendJSON(res, 200, { ok: true, ...ctx.stockPush(pct, Number(body.secs) || 150) });
                }

                // ===== 🎁 VÒNG QUAY PAL WEB + RƯƠNG (25/08) =====
                if (ctx.setPalWheelCfg && req.method === 'POST' && path === '/api/palwheel/cfg') {
                    return sendJSON(res, 200, { ok: true, cfg: ctx.setPalWheelCfg(body) });
                }
                if (ctx.palChestGrant && req.method === 'POST' && path === '/api/palchest/grant') {
                    const uid = String(body.userId || '').trim();
                    if (!/^\d{15,20}$/.test(uid)) return sendJSON(res, 400, { ok: false, error: 'Discord ID không hợp lệ' });
                    const r = ctx.palChestGrant(uid, body.palName);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // Chốt đơn đang giao dở: delivered=true (mod đã giao thật) / false (trả về rương)
                if (ctx.palChestResolve && req.method === 'POST' && path === '/api/palchest/resolve') {
                    const r = ctx.palChestResolve(String(body.ownerId || ''), body.id, !!body.delivered);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true });
                }


                // ---- KHÓA ĐIỀU KHIỂN (ẩn mọi can thiệp) ----
                // Mọi API ép kết quả yêu cầu header X-Ep-Key đúng EP_KEY. UI tương ứng
                // ẩn mặc định, chỉ hiện khi mở panel với #<EP_KEY> trên URL.
                if (path === '/api/epcheck') {
                    // Quyền theo cổng: cổng SUPER = true, cổng thường = false
                    const ok = epOk(req);
                    return sendJSON(res, ok ? 200 : 403, { ok });
                }

                // ---- BIG SMALL ----
                if (path === '/api/tx/force') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    const vals = String(body.values || '').trim();
                    const parts = vals.split(',').map(s => parseInt(s.trim()));
                    if (parts.length !== 3 || parts.some(n => isNaN(n) || n < 1 || n > 6)) {
                        return sendJSON(res, 400, { ok: false, error: 'Cần 3 số xúc xắc 1-6, vd: 6,5,4' });
                    }
                    ctx.getTX().forcedResult = parts.join(',');
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Ép kết quả Big Small ván tới: ${parts.join(',')}`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/tx/clear') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    ctx.getTX().forcedResult = null;
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Hủy ép kết quả Big Small`);
                    return sendJSON(res, 200, { ok: true });
                }

                // (Bầu Cua đã gỡ 27/08)

                // ---- XỔ SỐ MIỀN BẮC ----
                if (path === '/api/xs/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startXS(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo Xổ Số tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/xs/stop') {
                    ctx.stopXS();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng Xổ Số`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/xs/draw') {
                    const r = await ctx.xsDrawNow();
                    if (!r) return sendJSON(res, 400, { ok: false, error: 'Đang quay dở, thử lại sau vài giây' });
                    ctx.writeLog('ADMIN', `[PANEL XS] QUAY NGAY kỳ #${r.round} - đề về ${r.de}`);
                    return sendJSON(res, 200, { ok: true, de: r.de, round: r.round });
                }
                // Ép = áp kết quả cho VÁN HIỆN TẠI và quay luôn (không chờ đầu giờ)
                if (path === '/api/xs/force') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    const de = String(body.de || '').trim();
                    const parse2 = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean).map(x => x.padStart(2, '0'));
                    const mustHit = parse2(body.mustHit);
                    const mustMiss = parse2(body.mustMiss);
                    if (de && !/^\d{1,2}$/.test(de)) return sendJSON(res, 400, { ok: false, error: 'Đề phải là số 00-99' });
                    if ([...mustHit, ...mustMiss].some(n => !/^\d{2}$/.test(n))) return sendJSON(res, 400, { ok: false, error: 'Danh sách lô phải là các số 00-99, cách nhau dấu phẩy' });
                    const overlap = mustHit.filter(n => mustMiss.includes(n));
                    if (overlap.length) return sendJSON(res, 400, { ok: false, error: 'Số vừa ép về vừa cấm về: ' + overlap.join(', ') });
                    if (!de && !mustHit.length && !mustMiss.length) return sendJSON(res, 400, { ok: false, error: 'Chưa nhập gì để ép' });
                    ctx.xsSetForce(de ? de.padStart(2, '0') : null, mustHit, mustMiss);
                    const r = await ctx.xsDrawNow();
                    if (!r) return sendJSON(res, 400, { ok: false, error: 'Đang quay dở, thử lại sau vài giây' });
                    ctx.writeLog('ADMIN', `[PANEL XS] ÉP + QUAY ván #${r.round}: đề=${r.de} lô về=[${mustHit.join(',')}] cấm=[${mustMiss.join(',')}]`);
                    return sendJSON(res, 200, { ok: true, de: r.de, round: r.round });
                }

                // ---- ĐIỀU KHIỂN BÀN CHƠI ----
                if (path === '/api/tx/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startTX(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo Big Small tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/tx/stop') {
                    ctx.stopTX();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng Big Small`);
                    return sendJSON(res, 200, { ok: true });
                }
                // ---- 🏆 HŨ NUÔI CHUNG: nạp/rút tay để mồi hũ ----
                if (path === '/api/pot/add') {
                    if (!ctx.addPot) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.addPot(String(body.key || ''), body.amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // ---- BẢNG MỜI CHƠI DÒ MÌN (không có ván chung, chỉ nút vào web) ----
                if (path === '/api/mines/board/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    if (!ctx.startMines) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    try {
                        const name = await ctx.startMines(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Đăng bảng Dò Mìn tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) {
                        return sendJSON(res, 400, { ok: false, error: e.message });
                    }
                }
                if (path === '/api/mines/board/stop') {
                    if (ctx.stopMines) ctx.stopMines();
                    ctx.writeLog('ADMIN', `[PANEL] Gỡ bảng Dò Mìn`);
                    return sendJSON(res, 200, { ok: true });
                }
                // ---- BẢNG MỜI CHƠI LEO THANG ----
                if (path === '/api/stairs/board/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    if (!ctx.startStairs) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    try {
                        const name = await ctx.startStairs(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Đăng bảng Leo Thang tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) {
                        return sendJSON(res, 400, { ok: false, error: e.message });
                    }
                }
                if (path === '/api/stairs/board/stop') {
                    if (ctx.stopStairs) ctx.stopStairs();
                    ctx.writeLog('ADMIN', `[PANEL] Gỡ bảng Leo Thang`);
                    return sendJSON(res, 200, { ok: true });
                }
                // 🎡 số người tối thiểu để vòng quay khởi động
                if (path === '/api/wheel/min') {
                    const n = parseInt(body.minPlayers);
                    if (!Number.isInteger(n) || n < 1 || n > 50) return sendJSON(res, 400, { ok: false, error: 'Số người phải từ 1 đến 50' });
                    if (!ctx.setWheelMin) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    ctx.setWheelMin(n);
                    ctx.writeLog('ADMIN', `[PANEL] Vòng quay: cần ${n} người ready để khởi động`);
                    return sendJSON(res, 200, { ok: true, minPlayers: n });
                }
                // reset lượt quay: cả server quay lại được ngay, khỏi đợi 00:00/12:00
                if (path === '/api/wheel/reset') {
                    if (!ctx.resetWheelTurns) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    const n = ctx.resetWheelTurns();
                    ctx.writeLog('ADMIN', `[PANEL] Vòng quay: reset lượt cho ${n} người`);
                    return sendJSON(res, 200, { ok: true, n });
                }
                // (route bảng Blackjack đã xóa 19/08 cùng cả trò)
                // (route bảng/reset thống kê 📊 đã xóa 19/08 cùng tính năng)
                // ---- KÊNH ĐÃ LƯU (id + ghi chú) ----
                if (path === '/api/channels/add') {
                    const channelId = String(body.channelId || '').trim();
                    const note = String(body.note || '').trim().slice(0, 80);
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    const db = ctx.getDb();
                    if (!Array.isArray(db._savedChannels)) db._savedChannels = [];
                    const existing = db._savedChannels.find(c => c.id === channelId);
                    if (existing) existing.note = note;
                    else db._savedChannels.push({ id: channelId, note });
                    ctx.writeLog('ADMIN', `[PANEL] Lưu kênh ${channelId} (${note})`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/channels/delete') {
                    const channelId = String(body.channelId || '').trim();
                    const db = ctx.getDb();
                    if (Array.isArray(db._savedChannels)) db._savedChannels = db._savedChannels.filter(c => c.id !== channelId);
                    ctx.writeLog('ADMIN', `[PANEL] Xóa kênh đã lưu ${channelId}`);
                    return sendJSON(res, 200, { ok: true });
                }

                if (path === '/api/chat/delete') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const n = await ctx.deleteChat(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Xóa ${n} tin nhắn bot ở kênh ${channelId}`);
                        return sendJSON(res, 200, { ok: true, count: n });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không xóa được (sai ID, tin quá cũ >14 ngày, hoặc thiếu quyền)' }); }
                }

                // ---- DÒ MÌN ----
                if (path === '/api/mines/force') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    const key = String(body.key || '').trim();
                    const positions = Array.isArray(body.positions) ? body.positions.map(Number) : [];
                    if (!key) return sendJSON(res, 400, { ok: false, error: 'Thiếu người chơi' });
                    const clean = [...new Set(positions)].filter(p => Number.isInteger(p) && p >= 0 && p < ctx.totalTiles);
                    if (clean.length === 0) return sendJSON(res, 400, { ok: false, error: 'Chưa đánh dấu ô mìn nào' });
                    ctx.setForcedMines(key, clean);
                    ctx.writeLog('ADMIN', `[PANEL ÉP MÌN] ${key} -> [${clean.join(',')}]`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/mines/clear') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    const key = String(body.key || '').trim();
                    ctx.clearForcedMines(key);
                    ctx.writeLog('ADMIN', `[PANEL ÉP MÌN] Hủy ép mìn cho ${key}`);
                    return sendJSON(res, 200, { ok: true });
                }

                // ---- ĐIỂM ----
                if (path === '/api/points/set') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount)) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
                    // Set tăng số dư cũng là "thêm tiền" — tính vào trần ngày (nếu chưa mở khóa #)
                    if (!epOk(req)) {
                        const delta = amount - (ctx.getUserData(uid).points || 0);
                        const rem = takeDailyQuota(uid, delta);
                        if (rem !== null) return sendJSON(res, 400, { ok: false, error: `Vượt trần ${DAILY_ADD_CAP.toLocaleString()}/người/ngày - hôm nay còn thêm được ${rem.toLocaleString()} cho người này` });
                    }
                    ctx.getUserData(uid).points = amount;
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Set ${uid} = ${amount}`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/points/add') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount)) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
                    if (!epOk(req)) {
                        const rem = takeDailyQuota(uid, amount);
                        if (rem !== null) return sendJSON(res, 400, { ok: false, error: `Vượt trần ${DAILY_ADD_CAP.toLocaleString()}/người/ngày - hôm nay còn thêm được ${rem.toLocaleString()} cho người này` });
                    }
                    ctx.updatePoints(uid, amount);
                    if (ctx.logDog) ctx.logDog(amount >= 0 ? 'admin+' : 'admin-', uid, (ctx.getDb()[uid]||{}).name || uid, amount, 'panel: cong/tru tay');
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Cộng ${amount} cho ${uid}`);
                    return sendJSON(res, 200, { ok: true });
                }
                // ---- RÚT DOGCOIN ----
                if (path === '/api/withdraw/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startWithdraw(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo kênh Rút Dogcoin tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/withdraw/stop') {
                    ctx.stopWithdraw();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng kênh Rút Dogcoin`);
                    return sendJSON(res, 200, { ok: true });
                }
                // ---- 📒 VAY NỢ ----
                if (path === '/api/vay/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startVay(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Đặt bảng VAY NỢ tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/vay/stop') {
                    ctx.stopVay();
                    ctx.writeLog('ADMIN', `[PANEL] Gỡ bảng VAY NỢ`);
                    return sendJSON(res, 200, { ok: true });
                }
                // Chỉnh hạn mức/trần/phí vay (27/08) — lưu _loanCfg, bảng đăng lại mới đổi text
                if (ctx.setLoanCfg && path === '/api/loan/cfg') {
                    const r = ctx.setLoanCfg(body);
                    ctx.writeLog('ADMIN', `[PANEL] Cấu hình vay: ngày ${r.dailyMax}, trần ${r.cap}, phí ${r.feePct}%`);
                    return sendJSON(res, 200, { ok: true, cfg: r });
                }
                // Admin ghi nợ tay: KHÔNG lãi, KHÔNG trần (số âm = giảm nợ đã ghi)
                if (path === '/api/debt/add') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount) || !amount) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
                    const r = ctx.debtAdd(uid, amount);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, total: r.total });
                }
                if (path === '/api/debt/clear') {
                    const uid = String(body.userId || '').trim();
                    if (!uid) return sendJSON(res, 400, { ok: false, error: 'Thiếu userId' });
                    const r = ctx.debtClear(uid);
                    return sendJSON(res, 200, { ok: true, cleared: r.cleared });
                }
                // Gắn/gỡ nhãn ⚠️ nợ xấu (thủ công) — bot DM báo người chơi + vẽ lại bảng
                if (path === '/api/debt/bad') {
                    const uid = String(body.userId || '').trim();
                    if (!uid) return sendJSON(res, 400, { ok: false, error: 'Thiếu userId' });
                    const r = ctx.debtBad(uid, !!body.bad);
                    return sendJSON(res, 200, { ok: true, bad: r.bad });
                }
                // Kênh khoe kết quả quay pal ngẫu nhiên (channelId rỗng = tắt)
                if (path === '/api/gacha/channel') {
                    const channelId = String(body.channelId || '').trim();
                    if (!ctx.setGachaChannel) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    try {
                        const name = await ctx.setGachaChannel(channelId);
                        ctx.writeLog('ADMIN', channelId ? `[PANEL] Kênh khoe quay pal: #${name}` : '[PANEL] Tắt kênh khoe quay pal');
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                // Kênh + role thông báo khi phát Dogcoin toàn server (đổi Discord mới
                // chỉ cần lưu lại ở đây, không phải sửa code)
                if (path === '/api/giveaway/config') {
                    const channelId = String(body.channelId || '').trim();
                    const roleId = String(body.roleId || '').replace(/\D/g, '');
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    if (!ctx.setGiveawayConfig) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    try {
                        const name = await ctx.setGiveawayConfig(channelId, roleId);
                        ctx.writeLog('ADMIN', `[PANEL] Kênh thông báo phát Dogcoin: #${name}${roleId ? ` + tag role ${roleId}` : ' (không tag role)'}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                // Reset điểm danh cả danh sách — ai cũng /diemdanh nhận thưởng lại được ngay
                if (path === '/api/points/reset-daily') {
                    if (!ctx.resetAllDaily) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    const count = ctx.resetAllDaily();
                    ctx.writeLog('ADMIN', `[PANEL] Reset điểm danh cho ${count} ví`);
                    return sendJSON(res, 200, { ok: true, count });
                }
                // (Bảng Shop Pal riêng đã gộp vào bảng Rút Dogcoin — không còn API riêng.)
                if (path === '/api/withdraw/approve') {
                    const id = parseInt(body.id);
                    if (!ctx.approveWithdraw(id)) return sendJSON(res, 400, { ok: false, error: 'Yêu cầu không tồn tại hoặc đã xử lý' });
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/withdraw/reject') {
                    const id = parseInt(body.id);
                    if (!ctx.rejectWithdraw(id)) return sendJSON(res, 400, { ok: false, error: 'Yêu cầu không tồn tại hoặc đã xử lý' });
                    return sendJSON(res, 200, { ok: true });
                }

                // Admin đã tạo pal trong game xong -> đóng đơn + nhắn cho người mua
                if (path === '/api/pal/order-done') {
                    const id = parseInt(body.id);
                    if (!ctx.completePalOrder) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    const r = await ctx.completePalOrder(id);
                    return sendJSON(res, r.ok ? 200 : 400, r);
                }

                // Liên kết Discord ↔ tên nhân vật trong game. Cầu Dogcoin TỰ ĐỘNG
                // give/take theo ingameName này — CHỈ admin đặt được (người chơi tự
                // đặt là lỗ hổng: đặt tên nhân vật người khác rồi rút túi họ về ví mình).
                // Tên rỗng = hủy liên kết. Lọc về ASCII in được cho khớp normalizeName
                // của mod trong game.
                if (path === '/api/pal/set-name') {
                    const uid = String(body.userId || '').trim();
                    if (!uid || !ctx.getDb()[uid]) return sendJSON(res, 400, { ok: false, error: 'Không tìm thấy ví này' });
                    const name = String(body.name || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 50);
                    ctx.getUserData(uid).ingameName = name;
                    ctx.saveDbNow();
                    ctx.writeLog('ADMIN', name
                        ? `[PANEL PAL] Liên kết ${uid} ↔ nhân vật "${name}"`
                        : `[PANEL PAL] Hủy liên kết tên nhân vật của ${uid}`);
                    return sendJSON(res, 200, { ok: true, name });
                }

                if (path === '/api/points/subtract') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
                    ctx.updatePoints(uid, -amount);
                    if (ctx.logDog) ctx.logDog('admin-', uid, (ctx.getDb()[uid]||{}).name || uid, -amount, 'panel: tru tay');
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Trừ ${amount} của ${uid} (rút Dogcoin ra ngoài game)`);
                    return sendJSON(res, 200, { ok: true });
                }
                // Xóa 1 ví
                if (path === '/api/points/delete') {
                    const uid = String(body.userId || '').trim();
                    if (!uid) return sendJSON(res, 400, { ok: false, error: 'Thiếu User ID' });
                    if (!ctx.deletePlayer) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ xóa ví (bản cũ)' });
                    if (!ctx.deletePlayer(uid)) return sendJSON(res, 400, { ok: false, error: 'Không tìm thấy ví này' });
                    return sendJSON(res, 200, { ok: true });
                }
                // Reset mùa mới: xóa sạch ví người chơi cũ
                if (path === '/api/points/resetall') {
                    if (!ctx.resetAllPlayers) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ reset (bản cũ)' });
                    const alsoHistory = body.alsoHistory === true;
                    const r = ctx.resetAllPlayers(alsoHistory);
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                if (path === '/api/points/setall') {
                    const amount = parseInt(body.amount);
                    if (isNaN(amount)) return sendJSON(res, 400, { ok: false, error: 'Số không hợp lệ' });
                    const db = ctx.getDb();
                    const ids = Object.keys(db).filter(k => !k.startsWith('_') && db[k] && typeof db[k] === 'object');
                    let skipped = 0;
                    ids.forEach(id => {
                        // Không mở khóa #: phần TĂNG so với số dư hiện tại tính vào trần ngày,
                        // ai hết hạn mức thì BỎ QUA người đó (không set), không chặn cả lệnh.
                        if (!epOk(req)) {
                            const delta = amount - (db[id].points || 0);
                            if (takeDailyQuota(id, delta) !== null) { skipped++; return; }
                        }
                        db[id].points = amount;
                    });
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Set tất cả ${ids.length - skipped} người = ${amount}${skipped ? ` (bỏ qua ${skipped} người vượt trần ngày)` : ''}`);
                    return sendJSON(res, 200, { ok: true, count: ids.length - skipped, skipped });
                }
                // Phát Dogcoin cho TẤT CẢ ví + bot đăng thông báo tag role vào kênh thông báo
                if (path === '/api/points/addall') {
                    const amount = parseInt(body.amount);
                    if (isNaN(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Số không hợp lệ' });
                    if (!ctx.addAllPlayers) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    let onlyIds = null, skipped = 0;
                    if (!epOk(req)) {
                        // Trần ngày: chỉ phát cho người còn hạn mức, người vượt thì bỏ qua
                        const db = ctx.getDb();
                        const ids = Object.keys(db).filter(k => !k.startsWith('_') && db[k] && typeof db[k] === 'object');
                        onlyIds = ids.filter(id => takeDailyQuota(id, amount) === null);
                        skipped = ids.length - onlyIds.length;
                        if (onlyIds.length === 0) return sendJSON(res, 400, { ok: false, error: `Tất cả người chơi đều vượt trần ${DAILY_ADD_CAP.toLocaleString()}/ngày rồi` });
                    }
                    const r = await ctx.addAllPlayers(amount, onlyIds, body.msg);
                    return sendJSON(res, 200, { ok: true, ...r, skipped });
                }

                return sendJSON(res, 404, { ok: false, error: 'API không tồn tại' });
            }

            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        } catch (e) {
            ctx.writeLog('SYSTEM', `[PANEL LỖI] ${e.message}`);
            try { sendJSON(res, 500, { ok: false, error: 'Lỗi server' }); } catch {}
        }
    });

    server.on('error', (e) => {
        ctx.writeLog('SYSTEM', `[PANEL LỖI SERVER] ${e.message}`);
    });
    server.listen(ctx.port, '0.0.0.0');

    // Cổng ADMIN THƯỜNG: cùng handler, nhưng isSuperPort=false nên cụm can thiệp
    // khóa cứng và trần nạp/ngày luôn áp (share link này cho admin phụ).
    if (ctx.publicPort && ctx.publicPort !== ctx.port) {
        const publicServer = http.createServer(server.listeners('request')[0]);
        publicServer.on('error', (e) => {
            ctx.writeLog('SYSTEM', `[PANEL LỖI SERVER CỔNG THƯỜNG] ${e.message}`);
        });
        publicServer.listen(ctx.publicPort, '0.0.0.0');
    }
    return server;
}

// ============================================================
//  GIAO DIỆN (single-page) — vanilla JS, theme tối kiểu Discord
// ============================================================
const HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Bảng Điều Khiển</title>
<style>
  :root{--bg:#1e1f22;--card:#2b2d31;--card2:#313338;--line:#3f4147;--txt:#dbdee1;--mut:#949ba4;
        --green:#23a55a;--red:#f23f43;--blue:#5865f2;--yellow:#f0b132;--purple:#b362f2;}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;font-family:'Segoe UI',system-ui,Roboto,sans-serif;background:var(--bg);color:var(--txt);font-size:15px}
  h1,h2,h3{margin:0 0 10px}
  .hidden{display:none!important}
  /* login */
  #login{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:50}
  #login .box{background:var(--card);padding:28px;border-radius:14px;width:320px;max-width:90vw;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  input,select,button{font-family:inherit;font-size:15px}
  input,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card2);color:var(--txt);margin-top:6px}
  button{cursor:pointer;border:0;border-radius:8px;padding:10px 14px;font-weight:600;color:#fff;background:#3a4155}
  .btn-green{background:var(--green)} .btn-red{background:var(--red)} .btn-blue{background:var(--blue)}
  .btn-grey{background:#4e5058} .btn-yellow{background:var(--yellow);color:#000}
  button:active{transform:translateY(1px)}
  /* layout */
  header{background:var(--card);padding:14px 18px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
  header .dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
  header .dot.down{background:var(--red);box-shadow:0 0 8px var(--red);animation:blink 1s infinite}
  @keyframes blink{50%{opacity:.3}}
  .run{display:inline-block;padding:4px 12px;border-radius:8px;font-size:14px;font-weight:700}
  .run.on{background:var(--green);color:#fff} .run.off{background:#4e5058;color:#dbdee1}
  .wrap{max-width:840px;margin:0 auto;padding:16px}
  .sktile{background:#12141a;border:1px solid var(--line,#2a2e3b);border-radius:10px;padding:9px 6px;text-align:center}
  .sktile .t{font-size:9.5px;color:var(--mut);letter-spacing:.05em}
  .sktile .v{font-size:17px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums}
  .skgrp{border:1px solid;border-radius:10px;padding:9px;height:100%}
  .skgrp .gh{font-size:12px;font-weight:800;margin-bottom:6px}
  .skrow2{display:flex;justify-content:space-between;gap:6px;padding:4px 0;border-bottom:1px solid #2a2e3b;font-size:12.5px;align-items:center}
  .skmini{padding:2px 7px;font-size:12px;margin-left:4px;border-radius:6px;background:#232735;border:1px solid #2a2e3b}
  .skpct{padding:6px 12px;border-radius:8px;background:#232735;font-size:12.5px}
  .skrow2:last-child{border-bottom:0}
  .skrow2 b{font-variant-numeric:tabular-nums}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .tabs button{background:var(--card);color:var(--mut)}
  .tabs button.active{background:var(--blue);color:#fff}
  .card{background:var(--card);border-radius:14px;padding:18px;margin-bottom:16px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .row>div{flex:1;min-width:90px}
  label{font-size:13px;color:var(--mut)}
  .badge{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:600;background:var(--card2);color:#fff}
  .badge.on{background:var(--green)} .badge.off{background:#4e5058}
  .preview{font-size:18px;font-weight:700;padding:10px;background:var(--card2);border-radius:8px;text-align:center;margin-top:8px}
  .quick{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .quick button{flex:1;min-width:120px;background:var(--card2)}
  /* mines grid */
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px}
  .tile{aspect-ratio:1;border-radius:10px;background:var(--card2);border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;user-select:none;color:var(--mut)}
  .tile.mine{background:var(--red);border-color:#ff7a7a;color:#fff}
  /* table */
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600}
  td .mini{padding:6px 8px;font-size:13px}
  .mini-in{width:110px;padding:6px 8px;margin:0}
  .note{font-size:13px;color:var(--mut);background:var(--card2);padding:10px 12px;border-radius:8px;margin-top:10px;line-height:1.5}
  #toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:10px 18px;border-radius:8px;opacity:0;transition:.25s;pointer-events:none;z-index:80}
  #toast.show{opacity:1}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:70;padding:16px}
  .modal-box{background:var(--card);border-radius:14px;padding:24px;width:360px;max-width:100%;box-shadow:0 12px 48px rgba(0,0,0,.6);animation:pop .15s ease}
  @keyframes pop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
  .modal-msg{font-size:15px;line-height:1.55;margin-bottom:22px}
  .modal-actions{display:flex;gap:10px;justify-content:flex-end}
  .modal-actions button{min-width:96px}
  .flist{margin-top:10px}
  .flist .item{display:flex;justify-content:space-between;align-items:center;background:var(--card2);padding:8px 12px;border-radius:8px;margin-top:6px;font-size:13px}
  .wd-row{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;background:var(--card2);border:1px solid var(--line);padding:12px 14px;border-radius:10px;margin-top:10px}
  .wd-row .info{display:flex;flex-direction:column;gap:3px;font-size:14px;min-width:0}
  .wd-row .info .amt{font-size:15px}
  .wd-row .info .meta{color:var(--mut);font-size:12px}
  .wd-row .acts{display:flex;gap:8px;flex-shrink:0}
  .wd-row .acts button{padding:8px 14px}
  .muted{color:var(--mut)}
  .hist .h{background:var(--card2);border-radius:10px;padding:10px 12px;margin-top:8px;font-size:13px;line-height:1.55}
  .hist .h .top{display:flex;justify-content:space-between;font-weight:600;margin-bottom:4px}
  .hist .h .top .t{color:var(--mut);font-weight:400;font-size:12px}
  .hist .win{color:#3ce078} .hist .lose{color:#ff7a7a}
  .hist .b{color:var(--mut)}
  .hist .empty{color:var(--mut);font-size:13px;padding:8px 2px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .chips .chip{display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--line);border-radius:20px;padding:6px 6px 6px 12px;font-size:13px}
  .chips .chip .lbl{cursor:pointer}
  .chips .chip .lbl b{color:var(--txt)} .chips .chip .lbl span{color:var(--mut);font-size:11px;margin-left:4px}
  .chips .chip .x{cursor:pointer;background:#4e5058;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1}
  .chips .empty{color:var(--mut);font-size:12px}
  .card.danger{border:1px solid #6b2326}
  .card.danger h3{color:#ff7a7a}
  #modalInput{margin-top:0;margin-bottom:18px}
</style>
</head>
<body>

<div id="login">
  <div class="box">
    <h2>🔐 Đăng nhập</h2>
    <label>Mật khẩu quản trị</label>
    <input id="pw" type="password" placeholder="••••••••" autocomplete="current-password">
    <button class="btn-blue" style="width:100%;margin-top:14px" onclick="login()">Vào</button>
    <div id="loginErr" class="muted" style="margin-top:10px;color:var(--red)"></div>
  </div>
</div>

<div id="app" class="hidden">
  <header>
    <div class="dot" id="connDot"></div>
    <strong>Bảng Điều Khiển</strong>
    <span id="connText" style="font-size:13px;font-weight:600"></span>
    <span id="statusLine" class="muted" style="margin-left:auto;font-size:13px"></span>
  </header>

  <div class="wrap">
    <div class="tabs">
      <button data-tab="tx" class="active" onclick="tab('tx')">🎲 Big Small</button>
      <button data-tab="mine" onclick="tab('mine')">💣 Dò Mìn</button>
      <button data-tab="stair" onclick="tab('stair')">🪜 Leo Thang</button>
      <button data-tab="bj" onclick="tab('bj')">🎡 Vòng Quay</button>
      <button data-tab="stock" onclick="tab('stock')">📈 Cổ phiếu</button>
      <!-- TẠM TẮT (bot không chạy 2 game này nữa, bỏ comment là hiện lại):
      <button data-tab="xs" onclick="tab('xs')">🎰 Xổ Số</button>
      -->
      <button data-tab="user" onclick="tab('user')">👥 Người chơi</button>
      <button data-tab="pal" onclick="tab('pal')">🎮 Palworld & Dogcoin<span id="wdBadge" class="hidden"></span></button>
    </div>

    <!-- XỔ SỐ MIỀN BẮC -->
    <div id="tab-xs" class="hidden">
      <div class="card">
        <h3>🎛️ Điều khiển Xổ Số Miền Bắc</h3>
        <label>Channel ID (kênh đăng bảng xổ số)</label>
        <input id="xsChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="xsStart()">▶️ Bật / Tạo bảng mới</button>
          <button class="btn-red" onclick="xsStop()">⏹️ Tắt bảng</button>
        </div>
        <div class="note">Quay tự động <b>mỗi giờ đúng đầu giờ</b> (giờ VN), khóa sổ từ <b>phút 50</b>. Đề 1 ăn 70 · Lô 1 ăn 3.5/nháy · tối đa 5 số/kiểu, 1.000/số. Bot restart tự nối lại kênh, cược đang treo không mất.</div>
      </div>
      <div class="card">
        <h2>🎰 Kỳ hiện tại</h2>
        <div class="muted" id="xsInfo" style="font-size:13px;margin-bottom:10px"></div>
        <div id="xsBets" style="font-size:13px;margin-bottom:10px"></div>
        <div class="row">
          <button class="btn-green" style="flex:1" onclick="xsDrawNow()">🎲 QUAY NGAY LẬP TỨC</button>
        </div>
        <div class="note">Quay ngay = chốt kỳ hiện tại với cược đang có, trả thưởng, đăng kết quả, mở kỳ mới luôn. Kỳ tự động đầu giờ kế vẫn chạy bình thường.</div>
      </div>
      <div class="card epOnly" style="display:none">
        <h2>⚡ Ép kết quả ván HIỆN TẠI</h2>
        <div class="row">
          <div style="flex:1"><label>Đề về (2 số cuối ĐB)</label><input id="xsForceDe" placeholder="vd: 27" maxlength="2"></div>
          <div style="flex:2"><label>Lô PHẢI về (cách nhau phẩy)</label><input id="xsForceHit" placeholder="vd: 11,22"></div>
          <div style="flex:2"><label>Lô CẤM về</label><input id="xsForceMiss" placeholder="vd: 68,86"></div>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" style="flex:1" onclick="xsForce()">⚡ ÉP VÀ CHỐT VÁN NGAY</button>
        </div>
        <div class="note">Bấm là <b>chốt ván đang chạy NGAY LẬP TỨC</b> với kết quả này (trả thưởng, đăng kết quả, mở ván mới luôn). Bỏ trống ô nào thì phần đó quay ngẫu nhiên. Ô "đề về" cũng quyết định 2 số cuối giải ĐB trên bảng lô.</div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử xổ số</h3>
        <div id="xsHist" class="hist"></div>
      </div>
    </div>

    <!-- BIG SMALL -->
    <div id="tab-tx">
      <div class="card">
        <h3>🎛️ Điều khiển bàn Big Small</h3>
        <label>Channel ID (kênh đăng bàn chơi)</label>
        <input id="txChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="txSaved"></div>
        <div class="row" style="margin-top:8px">
          <div style="flex:2"><input id="txSaveId" placeholder="Channel ID"></div>
          <div style="flex:3"><input id="txSaveNote" placeholder="Ghi chú"></div>
          <button class="btn-blue" onclick="saveChannel('tx')">💾 Lưu kênh</button>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="txStart()">▶️ Bật / Tạo bàn mới</button>
          <button class="btn-red" onclick="txStop()">⏹️ Tắt bàn</button>
          <button class="btn-grey" onclick="chatDelete('txChannel')">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Lấy Channel ID: bật <b>Developer Mode</b> (Cài đặt Discord → Advanced) → chuột phải kênh → <b>Copy Channel ID</b>. "Bật" sẽ tạo bàn mới ngay trong kênh đó.</div>
      </div>
      <div class="card">
        <h2>🎲 Big Small</h2>
        <div class="muted" id="txInfo" style="font-size:13px;margin-bottom:10px"></div>
        <div class="epOnly" style="display:none">
        <div id="txBetsLive" style="margin-bottom:10px"></div>
        <div class="row">
          <div><label>Xúc xắc 1</label><select id="d1"></select></div>
          <div><label>Xúc xắc 2</label><select id="d2"></select></div>
          <div><label>Xúc xắc 3</label><select id="d3"></select></div>
        </div>
        <div class="preview" id="txPrev"></div>
        <div class="quick">
          <button onclick="setDice(6,6,4)">Tài + Chẵn (16)</button>
          <button onclick="setDice(6,5,4)">Tài + Lẻ (15)</button>
          <button onclick="setDice(1,2,3)">Xỉu + Chẵn (6)</button>
          <button onclick="setDice(1,2,2)">Xỉu + Lẻ (5)</button>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn-yellow" style="flex:1" onclick="txAutoForce()">🎯 Chọn xúc xắc cho nhà cái ĂN NHIỀU NHẤT</button>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn-green" style="flex:2" onclick="txForce()">⚡ Ép kết quả ván tới</button>
          <button class="btn-grey" onclick="api('/api/tx/clear',{}).then(()=>{toast('Đã hủy ép');refresh()})">Hủy ép</button>
        </div>
        <div class="note">Ép cứng 100% cho <b>lần khóa sổ kế tiếp</b>. ⚠️ Chỉ ăn nếu ép <b>lúc còn MỞ CƯỢC</b> (xem đồng hồ ở khung cược trên); khóa sổ rồi mới ép thì trôi sang ván sau. Nút 🎯 tự tính 3 xúc xắc khiến cửa đang gánh nhiều tiền nhất bị thua.</div>
        </div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử Big Small</h3>
        <div id="txHist" class="hist"></div>
      </div>
    </div>

    <!-- DÒ MÌN -->
    <div id="tab-mine" class="hidden">
      <div class="card">
        <h3>🏆 Hũ nuôi - mỗi trò một hũ riêng</h3>
        <div class="muted" id="potInfo" style="font-size:13px;margin-bottom:8px"></div>
        <div id="potRows"></div>
        <div class="note">Nổ ở trò nào ăn hũ trò đó, 2 hũ kia không suy suyển. Mỗi ván/lượt quay tự trích 5% tiền cược vào hũ của trò đó (<b>nhà cái bao, không thu thêm của người chơi</b>), tự trích dừng khi chạm trần - nhưng <b>admin nạp tay thì vượt trần được</b>. Nhập số âm để rút bớt.</div>
      </div>
      <div class="card">
        <h3>🎛️ Bảng mời chơi Dò Mìn trên Discord</h3>
        <div class="muted" id="mineBoardInfo" style="font-size:13px;margin-bottom:8px"></div>
        <label>Channel ID (kênh đăng bảng)</label>
        <input id="mineChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="mineSaved"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="mineBoardStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="mineBoardStop()">⏹️ Gỡ bảng</button>
          <button class="btn-grey" onclick="chatDelete('mineChannel')">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Dò mìn <b>không có ván chung theo giờ</b> như Big Small - mỗi người chơi ván riêng trên web. Bảng này chỉ để mời chơi: có nút <b>🌐 Chơi Dò Mìn trên web</b> phát link + mã PIN, và tự khoe 6 ván gần nhất (ai ăn bao nhiêu, ai dính mìn). Bảng tự vẽ lại tối đa 15 giây/lần. Bot restart sẽ tự nối lại bảng cũ.</div>
      </div>
      <div class="card epOnly" style="display:none">
        <h2>💎 Dò Mìn - Ép vị trí mìn (Web 25 ô)</h2>
        <div class="note">🌐 Dò mìn chính thức đã chuyển lên web cược (http://103.72.98.37:3002/). Phần này dùng để <b>ép vị trí mìn</b> cho ván web tiếp theo (25 ô grid 5×5).</div>
        <div class="row">
          <div style="flex:3">
            <label>Người chơi mục tiêu</label>
            <select id="mineUser"></select>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="mineAny" checked style="width:auto;margin:0" onchange="renderMineTarget()">
          Áp dụng cho người tiếp theo bất kỳ (ai chơi trên web trước thì dính)
        </label>
        <div class="grid" id="mineGrid"></div>
        <div class="row" style="margin-top:12px">
          <div class="muted" style="flex:2;font-size:13px">Đã đánh dấu: <b id="mineCount">0</b> ô mìn</div>
          <button class="btn-grey" onclick="clearGrid()">Xóa lưới</button>
          <button class="btn-green" style="flex:2" onclick="mineForce()">💣 Đặt mìn cho ván tới</button>
        </div>
        <div class="note">⚠️ <b>25 ô grid (5×5):</b> Mìn ẩn, người chơi tự click trên web - đặt mìn chỉ <b>tăng xác suất</b> trúng, không ép 100%. Số ô đánh dấu (💣) sẽ là mìn chắc chắn; nếu họ chọn số mìn ít hơn thì chỉ lấy bấy nhiêu ô đầu tiên. Muốn dễ thua: đặt mìn ở các ô trên-trái (hay bấm trước).</div>
        <div class="flist" id="mineList"></div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử Dò Mìn</h3>
        <div id="mineHist" class="hist"></div>
      </div>
    </div>

    <!-- LEO THANG -->
    <div id="tab-stair" class="hidden">
      <div class="card">
        <h3>🎛️ Bảng mời chơi Leo Thang trên Discord</h3>
        <div class="muted" id="stairBoardInfo" style="font-size:13px;margin-bottom:8px"></div>
        <label>Channel ID (kênh đăng bảng)</label>
        <input id="stairChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="stairSaved"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="stairBoardStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="stairBoardStop()">⏹️ Gỡ bảng</button>
          <button class="btn-grey" onclick="chatDelete('stairChannel')">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Leo <b>10 tầng</b>, mỗi tầng <b>8 ô</b>, người chơi chọn <b>1–5 cầu lửa</b> mỗi tầng. Bấm trúng ô trống thì lên tầng, hệ số nhân thêm; trúng lửa là mất cược. Chơi trên web, mỗi ván xong bot đăng kết quả kèm bản đồ tháp về kênh này. Bot restart sẽ tự nối lại bảng cũ.</div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử Leo Thang</h3>
        <div id="stairHist" class="hist"></div>
      </div>
    </div>

    <!-- BLACKJACK -->
    <div id="tab-bj" class="hidden">
      <div class="card">
        <h3>🎡 Vòng Quay May Mắn (trên web - thay Blackjack)</h3>
        <div class="muted" id="whInfo" style="font-size:13px;margin-bottom:8px"></div>
        <label>Số người READY để vòng quay khởi động (1–50)</label>
        <input id="whMin" type="number" placeholder="vd: 3">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="whSaveMin()">💾 Lưu</button>
          <button class="btn-red" onclick="whReset()">🔄 Cho quay lại NGAY (reset lượt)</button>
        </div>
        <div class="note">HAI vòng: <b>vòng vé</b> (1 mũi tên) quay <b>MIỄN PHÍ</b> ra giá vé chung <b>3.000/4.000/5.000</b> (26/08 nâng từ 2k/2.5k/3k) - vé chốt là trừ đúng giá đó mỗi người, ai không đủ bị mời ra (không mất gì, không mất lượt); rồi <b>vòng hệ số</b> (3 mũi tên 🟡🔵🟢 lệch 120°) nhân tiền vé - sàn x1.5 (buff 19/08, kỳ vọng ~x2.33), độc đắc <b>x10</b> bêu tên ở kênh nghiện. Vé chốt xong mà 60s không ai bấm thì tự quay (không giam vé). Mỗi người 1 lượt mỗi khung, <b>4 khung 6 tiếng</b> - reset <b>00:00, 06:00, 12:00, 18:00</b> - nút đỏ bên trên cho cả server quay lại ngay không cần đợi.</div>
      </div>
    </div>

    <div id="tab-stock" class="hidden">
      <div class="card">
        <h3>📈 Sàn Cổ Phiếu DOG</h3>
        <!-- 4 ô số to: liếc 2 giây là biết sàn đang thế nào, khỏi đọc cả đoạn văn -->
        <div id="skTiles" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0">
          <div class="sktile"><div class="t">GIÁ (mốc 1.000)</div><div class="v" id="skTPrice">-</div></div>
          <div class="sktile"><div class="t">CP LƯU HÀNH</div><div class="v" id="skTOut">-</div></div>
          <div class="sktile"><div class="t">NGƯỜI ĐANG GỒNG</div><div class="v" id="skTHold">-</div></div>
          <div class="sktile"><div class="t">BOT TRẢ NẾU ĐÓNG HẾT</div><div class="v" id="skTPay">-</div></div>
        </div>
        <div class="muted" id="skInfo" style="font-size:12.5px;margin-bottom:6px"></div>
        <div class="note" id="skRisk"></div>
      </div>

      <div class="card">
        <h3>👥 Ai đang giữ lệnh — lời/lỗ TỨC THÌ</h3>
        <div class="row" style="gap:8px;align-items:stretch">
          <div style="flex:1">
            <div class="skgrp" style="border-color:#2f6b48"><div class="gh" style="color:var(--green)">🟢 ĐANG MUA (ăn khi giá lên) · <span id="skLongSum">-</span></div><div id="skLongs" class="muted" style="font-size:12.5px">Không có ai.</div></div>
          </div>
          <div style="flex:1">
            <div class="skgrp" style="border-color:#6b2f2f"><div class="gh" style="color:var(--red)">🔴 ĐANG BÁN (ăn khi giá xuống) · <span id="skShortSum">-</span></div><div id="skShorts" class="muted" style="font-size:12.5px">Không có ai.</div></div>
          </div>
        </div>
        <div class="note" style="margin-top:8px">Lời/lỗ tính theo giá hiện tại, đã nhân đòn bẩy + sức nặng. <b>Dương = bot sẽ trả thêm</b> khi họ đóng lệnh, âm = bot thu về. Bảng tự cập nhật mỗi 3 giây.</div>
      </div>

      <div class="card">
        <h3>🕹️ Can thiệp giá — KÍN, trôi từ từ</h3>
        <div id="skDrift" class="note" style="display:none;margin-bottom:8px"></div>
        <label>Số GIÁ muốn cộng/trừ — vd giá đang 900, nhập <b>5</b> bấm ➖ là trôi về ~<b>895</b></label>
        <div class="row" style="gap:6px;align-items:center">
          <button class="skpct" onclick="skAmtSet(5)">5</button>
          <button class="skpct" onclick="skAmtSet(10)">10</button>
          <button class="skpct" onclick="skAmtSet(25)">25</button>
          <button class="skpct" onclick="skAmtSet(50)">50</button>
          <input id="skPushPct" type="number" min="1" value="5" style="flex:0 0 84px;text-align:center" oninput="skPushPrev()">
          <span class="muted" style="font-size:12px">giá · trôi trong</span>
          <input id="skPushSecs" type="number" min="30" max="600" value="150" style="flex:0 0 84px;text-align:center">
          <span class="muted" style="font-size:12px">giây</span>
        </div>
        <!-- Hai nút nói THẲNG phe nào thua — khỏi tự dịch dấu cộng trừ -->
        <div class="row" style="margin-top:10px">
          <button class="btn-red" style="flex:1;line-height:1.35" onclick="skPush(-1)">➖ TRỪ GIÁ<br><small>kéo XUỐNG · phe 🟢 MUA thua</small></button>
          <button class="btn-green" style="flex:1;line-height:1.35" onclick="skPush(1)">➕ CỘNG GIÁ<br><small>kéo LÊN · phe 🔴 BÁN thua</small></button>
        </div>
        <div id="skPushPrev" class="note" style="margin-top:8px;display:none"></div>
        <div class="note"><b>Nhắm MỘT NGƯỜI cụ thể</b>: bấm 💀 (cho thua) hoặc 🎁 (cho thắng) ngay cạnh tên họ ở bảng 👥 phía trên — panel tự chọn hướng kéo đúng, khỏi nghĩ. Nhớ là kéo giá ảnh hưởng CẢ SÀN: ai cùng phe cũng thua/thắng theo, phe kia thì ngược lại. Giá <b>trôi dần</b> trong số giây đã đặt, trộn với sóng tự nhiên — người chơi không nhận thông báo nào và vẫn kịp đóng lệnh giữa đường. Game cũng <b>tự tạo sóng ±10–15%</b> khoảng 40 phút một lần.</div>
      </div>

      <div class="card">
        <h3>⚙️ Cấu hình sàn</h3>
        <div class="row">
          <div style="flex:1">
            <label>🫨 Giá nhảy mỗi nhịp 2s (± đơn vị, 1–200)</label>
            <input id="skTickAmp" type="number" step="1" placeholder="vd: 3 (lình xình) · 8-10 (dứt khoát)">
          </div>
          <div style="flex:1">
            <label>Chênh mua–bán mỗi chiều (%)</label>
            <input id="skSpread" type="number" step="0.1" placeholder="vd: 0.1">
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1">
            <label>Trần CP toàn sàn</label>
            <input id="skMaxShares" type="number" placeholder="vd: 500">
          </div>
          <div style="flex:1">
            <label>Trần CP mỗi người</label>
            <input id="skMaxPer" type="number" placeholder="vd: 80">
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1">
            <label>Đòn bẩy tối đa (x)</label>
            <input id="skMaxLev" type="number" min="1" max="100" placeholder="vd: 20">
          </div>
          <div style="flex:1">
            <label>Chôn vốn (giây)</label>
            <input id="skHold" type="number" min="0" max="3600" placeholder="vd: 60">
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1">
            <label>Sức nặng lãi/lỗ (x) — 1 đồng giá × 1 CP = bấy nhiêu Dogcoin</label>
            <input id="skPoint" type="number" min="1" max="20" placeholder="vd: 5">
          </div>
          <div style="flex:0 0 auto;display:flex;align-items:flex-end;padding-bottom:6px">
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="skWaveOn"> Bật neo lang thang</label>
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1">
            <label>🌊 Đáy mềm — dưới mức này neo thiên đi LÊN (100–1000)</label>
            <input id="skWaveLow" type="number" step="10" placeholder="vd: 350">
          </div>
          <div style="flex:1">
            <label>🌊 Trần mềm — trên mức này neo thiên đi XUỐNG (1000–2000)</label>
            <input id="skWaveHigh" type="number" step="10" placeholder="vd: 1650">
          </div>
        </div>
        <div class="note" id="skWaveNow" style="margin-top:4px"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="skSave()">💾 Lưu cấu hình</button>
          <button id="skOpenBtn" onclick="skToggle()">⏸ Tạm đóng sàn</button>
        </div>
        <div class="note">Người chơi nhập <b>số Dogcoin làm vốn</b> + chọn <b>khối lượng (đòn bẩy)</b>; vốn × đòn bẩy = số CP nắm giữ. <b>Sức nặng lãi/lỗ</b> nhân thẳng vào tiền — mỗi 1% giá đi = <b>đòn bẩy × sức nặng %</b> trên vốn. ⚠️ Tăng sức nặng thì hạ chênh mua–bán theo (mặc định 0,1%/chiều). Muốn siết rủi ro thì hạ <b>trần CP toàn sàn</b> hoặc <b>đòn bẩy tối đa</b>. <b>Chôn vốn</b>: vào lệnh phải giữ đủ giây mới đóng được, 0 là tắt. Sàn đóng <b>vẫn cho đóng lệnh</b>, chỉ chặn mở mới.</div>
      </div>
    </div>

    <!-- (tab 📊 THỐNG KÊ đã bỏ 19/08) -->

    <!-- NGƯỜI CHƠI -->
    <!-- RÚT DOGCOIN -->
    <!-- PALWORLD -->
    <div id="tab-pal" class="hidden">
      <div class="card">
        <h3>🎛️ Kênh Dogcoin & Shop Pal</h3>
        <label>Channel ID (kênh đăng bảng)</label>
        <input id="wdChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="wdStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="wdStop()">⏹️ Tắt</button>
        </div>
        <div class="note">MỘT bảng duy nhất với 4 nút: <b>Chuyển vào game</b>, <b>Chuyển ra Discord</b>, <b>Pal ngẫu nhiên 2.000</b>, <b>Pal tùy chọn 6.000</b>. Lõi Văn Minh / cấy ghép / đổi vàng bán ở <b>sạp trong game</b>, không qua Discord. <b>Sửa code xong phải bấm Đăng lại</b> để tin nhắn có nút mới.</div>
      </div>
      <div class="card">
        <h3>🔗 Liên kết tên trong game</h3>
        <div class="note">Cầu chuyển Dogcoin <b>tự động</b> give/take theo bảng này: người chơi bấm 🎮/💬 là bot giao/trừ Dog Coin cho đúng nhân vật đã liên kết. Người chơi <b>không tự đặt tên được</b> - chỉ admin sửa ở đây (chống giả tên rút trộm túi người khác). Gõ <b>ĐÚNG tên nhân vật trong game</b> (không dấu, bỏ ký tự lạ cũng khớp); để trống rồi 💾 = hủy liên kết.</div>
        <div id="palLinks"></div>
      </div>
      <div class="card">
        <h3>🎲 Kênh khoe kết quả quay Pal</h3>
        <div class="muted" id="gachaInfo" style="font-size:13px;margin-bottom:8px"></div>
        <label>Channel ID (kênh đăng công khai ai quay trúng con gì)</label>
        <input id="gachaChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="gachaSave()">💾 Lưu kênh</button>
          <button class="btn-red" onclick="gachaOff()">⏹️ Tắt khoe</button>
        </div>
        <div class="note">Lưu xong bot gửi 1 tin xác nhận vào kênh đó. Từ đó mỗi lượt quay Pal ngẫu nhiên 2.000 sẽ đăng công khai: <b>ai quay, trúng con gì</b> (tag người quay). Tắt = chỉ người quay tự thấy như cũ.</div>
      </div>
      <!-- Hàng đợi đơn: từ khi bỏ cầu nối tự động (server Linux không có UE4SS),
           MỌI giao dịch với game đều nằm ở đây chờ admin xử lý tay trong game. -->
      <div class="card hidden" id="wdPendingCard">
        <h3>📨 Đơn đang chờ xử lý</h3>
        <div class="note"><b>🎮 Chuyển vào game</b>: ví đã trừ sẵn - bạn vào game ĐƯA Dog Coin rồi bấm ✅. <b>💬 Chuyển ra Discord</b>: bạn vào game NHẬN Dog Coin rồi bấm ✅ (lúc đó ví mới được cộng). ❌ Từ chối = hoàn ví nếu đã trừ.</div>
        <div id="wdPending"></div>
      </div>
      <div id="wdDone" class="hidden"></div>
      <!-- 🐾 Đơn mua Pal ĐÃ GỠ (27/08): mua pal giờ TỰ ĐỘNG qua web → dashboard → mod,
           không còn đơn tay cho admin. Backend getPalOrders/completePalOrder giữ nguyên
           (vô hại, không gọi tới) để lịch sử đơn cũ không mất nếu cần tra. -->

      <!-- 🎁 Vòng quay pal WEB (25/08): quay ở tab Quay Pal trên web chơi, trúng vào
           RƯƠNG trang Hồ sơ. NHẬN = bot tự giao qua dashboard (lệnh PAL2 của mod) —
           KHÔNG cần admin đưa tay nữa. Pal dùng được sau restart server. -->
      <div class="card">
        <h3>🎁 Vòng quay Pal web + Rương</h3>
        <div class="note">Vé quay trừ thẳng ví, nuôi hũ gacha 5%/vé và nổ 1% như cũ. Đơn kẹt <b>ĐANG GIAO</b> = gửi lệnh xong không rõ kết quả: mở results.log của mod kiểm — mod ĐÃ giao thì bấm ✅, chưa thì ↩️ trả về rương.</div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1"><label>Vé mỗi lượt quay (Dogcoin)</label><input id="pwPrice" type="number" placeholder="vd: 2000"></div>
          <div style="flex:1"><label>🎯 Chọn pal đích danh (Dogcoin)</label><input id="pwCustom" type="number" placeholder="vd: 6000"></div>
          <div style="flex:1"><label>Bán lại pal (Dogcoin)</label><input id="pwSell" type="number" placeholder="vd: 1000"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1"><label>Số dòng linh hồn TỐI ĐA (1–4)</label><input id="pwSoul" type="number" placeholder="vd: 1"></div>
          <div style="flex:1"><label>Level pal giao (1–100)</label><input id="pwLevel" type="number" placeholder="vd: 80"></div>
          <div style="flex:1"><label>Sao (0–4, sao THẬT trên pal)</label><input id="pwStars" type="number" placeholder="vd: 4"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1"><label>% linh hồn GỐC miễn phí (bội của 3)</label><input id="pwSoulPct" type="number" placeholder="vd: 60"></div>
          <div style="flex:1"><label>IV GỐC miễn phí (1–255)</label><input id="pwIvs" type="number" placeholder="vd: 100"></div>
          <div style="flex:1"><label>Ô passive GỐC miễn phí (1–8)</label><input id="pwPassMax" type="number" placeholder="vd: 4"></div>
        </div>
        <div class="note" style="margin-top:8px">💎 <b>GIÁ NÂNG CẤP VƯỢT TRẦN</b> — người chơi tự mua trong bảng nhận, trừ ví ngay (giao hụt tự hoàn). Trần cứng: 8 passive · 201% linh hồn · 255 IV.</div>
        <div class="row" style="margin-top:4px">
          <div style="flex:1"><label>Ô passive thứ 5</label><input id="pwUp5" type="number" placeholder="vd: 8000"></div>
          <div style="flex:1"><label>Ô thứ 6</label><input id="pwUp6" type="number" placeholder="vd: 16000"></div>
          <div style="flex:1"><label>Ô thứ 7</label><input id="pwUp7" type="number" placeholder="vd: 32000"></div>
          <div style="flex:1"><label>Ô thứ 8</label><input id="pwUp8" type="number" placeholder="vd: 64000"></div>
          <div style="flex:1"><label>IV: giá mỗi ĐIỂM (từng chỉ số Máu/Công/Thủ)</label><input id="pwUpIv" type="number" placeholder="vd: 500"></div>
          <div style="flex:1"><label>Thêm DÒNG linh hồn (dòng 2; dòng 3 ×2, dòng 4 ×4)</label><input id="pwUpLine" type="number" placeholder="vd: 2000"></div>
        </div>
        <div class="row" style="margin-top:4px">
          <div style="flex:1"><label>🌈 Passive Cây Thế Giới (giá/con)</label><input id="pwUpWt" type="number" placeholder="vd: 1000"></div>
          <div style="flex:1"><label>🔥 Bellanoir Libero (0 = ngừng bán)</label><input id="pwPkBL" type="number" placeholder="vd: 9000"></div>
          <div style="flex:1"><label>🔥 Blazamut Ryu</label><input id="pwPkBR" type="number" placeholder="vd: 20000"></div>
          <div style="flex:1"><label>🔥 Xenolord</label><input id="pwPkXe" type="number" placeholder="vd: 20000"></div>
          <div style="flex:1"><label>🔥 Hartalis</label><input id="pwPkHa" type="number" placeholder="vd: 20000"></div>
        </div>
        <div class="row" style="margin-top:4px">
          <div style="flex:1"><label>Linh hồn →72% (giá MỖI 1%)</label><input id="pwUpS1" type="number" placeholder="vd: 1000"></div>
          <div style="flex:1"><label>→81% (mỗi 1%)</label><input id="pwUpS2" type="number" placeholder="vd: 1500"></div>
          <div style="flex:1"><label>→90% (mỗi 1%)</label><input id="pwUpS3" type="number" placeholder="vd: 2500"></div>
          <div style="flex:1"><label>→102% (mỗi 1%)</label><input id="pwUpS4" type="number" placeholder="vd: 3500"></div>
          <div style="flex:1"><label>→201% (mỗi 1%)</label><input id="pwUpS5" type="number" placeholder="vd: 6000"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="pwBoss" style="width:auto"> Giao bản PAL BOSS</label>
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="pwOpen" style="width:auto"> Mở vòng quay</label>
          <button onclick="pwCfgSave()">💾 Lưu</button>
        </div>
        <div class="note" id="pwCfgNow">-</div>
        <div class="row" style="margin-top:10px">
          <input id="pgUid" placeholder="Discord ID người nhận" style="flex:2">
          <input id="pgPal" placeholder="Tên pal (vd: Anubis)" style="flex:2">
          <button onclick="pgGrant()">🎁 Tặng vào rương</button>
        </div>
        <div id="palChests" class="hist"></div>
      </div>
      <div class="card">
        <h3>💰 Sổ biến động Dogcoin</h3>
        <div class="note">Ghi mọi khoản <b>điều chỉnh và chuyển đổi</b>: admin cộng/trừ tay, chuyển giữa người chơi, chuyển vào/ra game, mua pal, hoàn tiền. <b>Không</b> ghi tiền cược thắng/thua mini game (mỗi ván đều sinh giao dịch, ghi hết thì không tra được gì).</div>
        <div id="dogLedger" class="hist"></div>
      </div>
    </div>

    <div id="tab-user" class="hidden">
      <div class="card">
        <h2>👥 Ví điểm người chơi</h2>
        <div class="row">
          <div style="flex:1"><label>🎁 Phát Dogcoin cho TẤT CẢ (bot tag role + thông báo)</label><input id="addAllAmount" type="number" placeholder="vd: 500"></div>
          <div style="flex:2"><label>💬 Lời nhắn (trống = câu mặc định)</label><input id="addAllMsg" placeholder="vd: 🎉 Quà 2/9! · Ăn mừng VN vô địch cúp!"></div>
          <button class="btn-green" onclick="addAllCoins()">Phát tất cả</button>
        </div>
        <div class="row" style="margin-top:12px">
          <div style="flex:2"><label>📢 Kênh thông báo phát (Channel ID)</label><input id="gaChannel" placeholder="vd: 123456789012345678"></div>
          <div style="flex:2"><label>🔔 Role được tag (Role ID, trống = không tag)</label><input id="gaRole" placeholder="vd: 123456789012345678"></div>
          <button class="btn-blue" onclick="gaSave()">💾 Lưu</button>
        </div>
        <div class="note">Đổi qua Discord khác chỉ cần lưu lại <b>kênh + role</b> ở đây (bot gửi 1 tin xác nhận vào kênh, không tag ai). Chưa lưu thì bot vẫn dùng kênh/role của server cũ.</div>
        <div class="row" style="margin-top:12px">
          <button class="btn-blue" style="flex:1" onclick="resetDaily()">🔄 Reset điểm danh cả danh sách - ai cũng /diemdanh nhận lại được ngay</button>
        </div>
        <div class="row" style="margin-top:12px">
          <div style="flex:3"><label>Set tất cả người chơi về</label><input id="setAllAmount" type="number" placeholder="vd: 50000"></div>
          <button class="btn-red" onclick="setAll()">Set tất cả</button>
        </div>
        <input id="search" placeholder="🔍 Tìm theo tên hoặc ID..." oninput="renderPlayers()" style="margin-top:12px">
        <div style="overflow-x:auto">
          <table id="playerTable">
            <thead><tr><th>Tên</th><th>ID</th><th>Điểm</th><th>📒 Nợ</th><th>Thao tác</th></tr></thead>
            <tbody id="playerBody"></tbody>
          </table>
        </div>
        <div class="note">Cột <b>📒 Nợ</b>: ⚠️ = nợ xấu (quá 1 ngày chưa trả lãi, bị cấm vay thêm). Nút <b>Ghi nợ</b> dùng ô số bên cạnh — cộng vào khoản nợ ADMIN (không lãi, không trần, số âm = giảm); <b>Xóa nợ</b> xóa sạch cả nợ vay lẫn nợ ghi.</div>
      </div>

      <div class="card">
        <h3>📒 Bảng VAY NỢ trong Discord</h3>
        <label>Channel ID (kênh đăng bảng — trạng thái: <span id="vayLive">?</span>)</label>
        <input id="vayChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="vayStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="vayStop()">⏹️ Gỡ bảng</button>
        </div>
        <div class="row" style="margin-top:12px">
          <div style="flex:1"><label>💰 Vay tối đa / ngày</label><input id="loanDaily" type="number" placeholder="vd: 20000"></div>
          <div style="flex:1"><label>📦 Ôm nợ tối đa (trần)</label><input id="loanCap" type="number" placeholder="vd: 60000"></div>
          <div style="flex:1"><label>💸 Phí vay 1 lần (%)</label><input id="loanFee" type="number" step="1" placeholder="vd: 20"></div>
          <button class="btn-blue" onclick="loanCfgSave()">💾 Lưu</button>
        </div>
        <div class="note">Bảng có 3 nút: <b>💰 Vay</b> · <b>💳 Trả nợ</b> · <b>📄 Nợ của tôi</b>. Phí vay thu <b>1 LẦN</b> lúc vay (vay 10.000 phí 20% = ghi sổ 12.000), <b>KHÔNG lãi kép ngày</b>. Sửa 3 ô trên rồi <b>Lưu</b> + <b>Đăng lại bảng</b> để text mới có hiệu lực. Nợ thường KHÔNG bị siết; dính ⚠️ <b>NỢ XẤU</b> mới bị: cấm vay + không chuyển tiền + không mua/quay pal + mọi khoản thu (điểm danh/event/ai chuyển cho) bị xiết trả nợ, ví chỉ chừa 1.000. Trả sạch nợ là nhãn TỰ BAY.</div>
      </div>

      <div class="card danger">
        <h3>🧨 Reset mùa mới - xóa sạch ví người chơi cũ</h3>
        <div class="note">Dùng khi mở lại mini game (vd: chuyển sang Dog Coin của Palworld). Toàn bộ ví hiện tại bị <b>xóa khỏi database</b>, ai chơi lại sẽ được tạo ví mới với số dư khởi điểm mặc định. Yêu cầu rút đang chờ sẽ bị hủy và lệnh ép mìn bị gỡ. Bot tự lưu 1 file <b>database.backup-reset-*.json</b> cạnh database trước khi xóa.</div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="resetHistory" style="width:auto;margin:0">
          Xóa luôn lịch sử Big Small / Bầu Cua / Dò Mìn + lịch sử rút Dogcoin
        </label>
        <div class="row" style="margin-top:12px">
          <button class="btn-red" style="flex:1" onclick="resetAllPlayers()">🗑️ Xóa toàn bộ ví (<span id="resetCount">0</span> người)</button>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="toast"></div>

<div id="modal" class="modal-overlay hidden" onclick="if(event.target===this)modalClose(false)">
  <div class="modal-box">
    <div id="modalMsg" class="modal-msg"></div>
    <input id="modalInput" class="hidden" autocomplete="off">
    <div class="modal-actions">
      <button id="modalCancel" class="btn-grey" onclick="modalClose(false)">Hủy</button>
      <button id="modalOk" class="btn-green" onclick="modalClose(true)">Đồng ý</button>
    </div>
  </div>
</div>

<script>
// Server nhúng giá trị này vào trang (xem handler GET '/'). true = panel không có
// mật khẩu, vào thẳng, không hiện bảng đăng nhập.
const AUTH_OFF = __AUTH_OFF__;
let TOKEN = localStorage.getItem('panel_token') || '';
let STATE = null;
let mineSel = new Set();

function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}

// Hộp xác nhận tự vẽ - hiện giữa màn hình, đúng theme web (thay confirm() của trình duyệt)
let modalResolve=null,modalRequire='';
// requireText: bắt admin gõ đúng 1 từ khóa mới cho bấm Đồng ý (dùng cho thao tác xóa sạch)
function uiConfirm(msg,okLabel,okClass,requireText){
  return new Promise(resolve=>{
    modalResolve=resolve;
    modalRequire=requireText||'';
    document.getElementById('modalMsg').textContent=msg;
    const ok=document.getElementById('modalOk');
    ok.textContent=okLabel||'Đồng ý';
    ok.className=okClass||'btn-green';
    const inp=document.getElementById('modalInput');
    inp.value='';
    inp.placeholder=modalRequire?('Gõ '+modalRequire+' để xác nhận'):'';
    inp.classList.toggle('hidden',!modalRequire);
    document.getElementById('modal').classList.remove('hidden');
    if(modalRequire)setTimeout(()=>inp.focus(),50);
  });
}
function modalClose(ok){
  const inp=document.getElementById('modalInput');
  if(ok&&modalRequire&&inp.value.trim().toUpperCase()!==modalRequire.toUpperCase()){
    toast('❌ Gõ đúng "'+modalRequire+'" để xác nhận');return;
  }
  document.getElementById('modal').classList.add('hidden');
  modalRequire='';
  if(modalResolve){const r=modalResolve;modalResolve=null;r(ok);}
}
document.getElementById('modalInput').addEventListener('keydown',e=>{if(e.key==='Enter')modalClose(true);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('modal').classList.contains('hidden'))modalClose(false);});

async function api(path, body){
  const opt={method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}};
  if(body!==undefined) opt.body=JSON.stringify(body);
  const r=await fetch(path,opt);
  const j=await r.json().catch(()=>({}));
  if(r.status===401){logout();throw new Error('401');}
  if(!j.ok){toast('❌ '+(j.error||'Lỗi'));throw new Error(j.error||'err');}
  return j;
}

// ===== CỤM CAN THIỆP =====
// Quyền theo CỔNG đang vào (server trả state.superAdmin): cổng SUPER thấy hết,
// cổng admin thường ẩn + server chặn cứng.
function epApply(on){document.querySelectorAll('.epOnly').forEach(el=>{el.style.display=on?'':'none';});}

async function login(){
  const pw=document.getElementById('pw').value;
  const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  const j=await r.json().catch(()=>({}));
  if(j.ok){TOKEN=j.token;localStorage.setItem('panel_token',TOKEN);showApp();}
  else document.getElementById('loginErr').textContent='Sai mật khẩu';
}
function logout(){TOKEN='';localStorage.removeItem('panel_token');document.getElementById('login').classList.remove('hidden');document.getElementById('app').classList.add('hidden');}

function showApp(){
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initSelects();
  // F5 đứng nguyên tab đang xem (lưu ở localStorage), không nhảy về tab đầu
  const saved=localStorage.getItem('panel_tab');
  // 'bc'/'xs' bỏ khỏi danh sách: ai từng mở 2 tab đó trước khi tắt thì nay về Big Small
  if(['tx','mine','stair','bj','user','pal'].includes(saved)) tab(saved);
  refresh();
  setInterval(refresh,3000);
}

function tab(t){
  ['tx','mine','stair','bj','stock','xs','user','pal'].forEach(x=>document.getElementById('tab-'+x).classList.toggle('hidden',x!==t));
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  localStorage.setItem('panel_tab',t);
}

// ===== KÊNH KHOE QUAY PAL =====
function gachaSave(){const id=document.getElementById('gachaChannel').value.trim();if(!id)return toast('Nhập Channel ID');api('/api/gacha/channel',{channelId:id}).then(j=>{toast('✅ Đã bật khoe tại #'+j.name);refresh();}).catch(e=>toast('❌ '+e.message));}
async function gachaOff(){if(!await uiConfirm('Tắt đăng công khai kết quả quay Pal?','Tắt','btn-red'))return;api('/api/gacha/channel',{channelId:''}).then(()=>{toast('⏹️ Đã tắt');document.getElementById('gachaChannel').value='';refresh();});}

// Kênh + role thông báo phát Dogcoin toàn server (đổi Discord mới chỉ cần lưu lại ở đây)
function gaSave(){
  const c=document.getElementById('gaChannel').value.trim();
  const r=document.getElementById('gaRole').value.trim();
  if(!c)return toast('Nhập Channel ID');
  api('/api/giveaway/config',{channelId:c,roleId:r}).then(j=>{toast('✅ Thông báo phát sẽ vào #'+j.name);refresh();}).catch(()=>toast('❌ Lỗi'));
}
function renderGiveaway(){
  if(!STATE||!STATE.giveaway)return;
  const c=document.getElementById('gaChannel'); if(c&&!c.value&&STATE.giveaway.channelId)c.value=STATE.giveaway.channelId;
  const r=document.getElementById('gaRole'); if(r&&!r.value&&STATE.giveaway.roleId)r.value=STATE.giveaway.roleId;
}
async function resetDaily(){
  if(!await uiConfirm('Reset điểm danh cho CẢ danh sách? Mọi người /diemdanh nhận thưởng lại được ngay hôm nay.','🔄 Reset','btn-blue'))return;
  api('/api/points/reset-daily',{}).then(j=>{toast('🔄 Đã reset điểm danh cho '+j.count+' ví');refresh();}).catch(()=>toast('❌ Lỗi'));
}
function renderGacha(){
  if(!STATE)return;
  const on=!!STATE.gachaChannelId;
  const c=document.getElementById('gachaChannel'); if(c&&!c.value&&STATE.gachaChannelId) c.value=STATE.gachaChannelId;
  document.getElementById('gachaInfo').innerHTML='<span class="run '+(on?'on':'off')+'">'+(on?'🟢 ĐANG KHOE công khai':'🔴 ĐANG TẮT (chỉ người quay tự thấy)')+'</span>';
}

// ===== XỔ SỐ =====
function xsStart(){const id=document.getElementById('xsChannel').value.trim();if(!id)return toast('Nhập Channel ID');api('/api/xs/start',{channelId:id}).then(j=>{toast('✅ Đã bật xổ số tại #'+j.name);refresh();}).catch(e=>toast('❌ '+e.message));}
async function xsStop(){if(!await uiConfirm('Tắt bảng Xổ Số? Cược đang treo vẫn được giữ trong database.','Tắt','btn-red'))return;api('/api/xs/stop',{}).then(()=>{toast('⏹️ Đã tắt');refresh();});}
async function xsDrawNow(){if(!await uiConfirm('QUAY NGAY kỳ hiện tại? Chốt cược đang có, trả thưởng và mở kỳ mới.','Quay ngay','btn-green'))return;api('/api/xs/draw',{}).then(j=>{toast('🎲 Đã quay kỳ #'+j.round+' - đề về '+j.de);refresh();}).catch(e=>toast('❌ '+e.message));}
async function xsForce(){
  const de=document.getElementById('xsForceDe').value.trim();
  const mustHit=document.getElementById('xsForceHit').value.trim();
  const mustMiss=document.getElementById('xsForceMiss').value.trim();
  if(!await uiConfirm('CHỐT VÁN NGAY với kết quả ép này? Trả thưởng và mở ván mới lập tức.','Ép và chốt','btn-green'))return;
  api('/api/xs/force',{de,mustHit,mustMiss}).then(j=>{toast('⚡ Đã chốt ván #'+j.round+': đề về '+j.de);refresh();}).catch(e=>toast('❌ '+e.message));
}
function renderXS(){
  const xs=STATE.xs; if(!xs) return;
  const c=document.getElementById('xsChannel'); if(c&&!c.value&&xs.channelId) c.value=xs.channelId;
  const run=xs.live&&xs.status!=='stopped';
  const f=xs.forced||{};
  const fParts=[];
  if(f.de)fParts.push('đề='+f.de);
  if(f.mustHit&&f.mustHit.length)fParts.push('lô về '+f.mustHit.join(','));
  if(f.mustMiss&&f.mustMiss.length)fParts.push('cấm '+f.mustMiss.join(','));
  document.getElementById('xsInfo').innerHTML='<span class="run '+(run?'on':'off')+'">'+(run?'🟢 ĐANG CHẠY':'🔴 ĐÃ TẮT')+'</span> &nbsp; Ván #'+padId(xs.round)+' • <span class="badge '+(xs.status==='betting'?'on':'off')+'">'+xs.status+'</span> • '+xs.usersCount+' người • tổng cược '+Number(xs.totalStake).toLocaleString()+(fParts.length?' • <span class="badge on">ĐANG ÉP: '+esc(fParts.join(' | '))+'</span>':'');
  const box=document.getElementById('xsBets');
  if(!xs.bets||!xs.bets.length){box.innerHTML='<div class="muted">Kỳ này chưa ai đặt.</div>';}
  else{
    box.innerHTML=xs.bets.map(b=>{
      const fmt=o=>Object.entries(o).map(([n,a])=>n+' ('+Number(a).toLocaleString()+')').join(', ');
      const de=Object.keys(b.de).length?('🎯 đề: '+fmt(b.de)):'';
      const lo=Object.keys(b.lo).length?('🎰 lô: '+fmt(b.lo)):'';
      return '<div style="padding:4px 0;border-bottom:1px solid var(--line)"><b>'+esc(b.name)+'</b> - '+[de,lo].filter(Boolean).join(' · ')+'</div>';
    }).join('');
  }
  const hist=xs.history||[];
  document.getElementById('xsHist').innerHTML = hist.length? hist.map(h=>{
    const wins=(h.winners||[]).map(w=>esc(w.name)+' +'+Number(w.amount).toLocaleString()).join(' • ');
    const board=(h.board||[]).map(x=>x.v).join(' ');
    // từng lệnh cược của ván: ai đặt bao nhiêu vào số nào, trúng mấy nháy, thưởng bao nhiêu
    const betLines=(h.bets||[]).map(b=>{
      const hit=b.win>0;
      const result=hit?('trúng'+(b.kind==='lô'?' '+b.hits+' nháy':'')+' <b>+'+Number(b.win).toLocaleString()+'</b>'):'không trúng';
      return '<div class="'+(hit?'win':'lose')+'" style="font-size:12px;padding:1px 0">• '+esc(b.name)+' đặt '+Number(b.amt).toLocaleString()+' vào '+b.kind+' <b>'+b.num+'</b> → '+result+'</div>';
    }).join('');
    return '<div class="h"><div class="top"><span>Ván #'+padId(h.round)+' • 🎯 đề về <b>'+h.de+'</b>'+(h.forced?' <span class="badge on">CÓ ÉP</span>':'')+'</span><span class="t">'+esc(h.time||'')+'</span></div>'+
      '<div class="b" style="font-size:12px">'+esc(board)+'</div>'+
      '<div class="b">💰 cược '+Number(h.totalStake).toLocaleString()+' → trả '+Number(h.totalPaid).toLocaleString()+'</div>'+
      (betLines||'<div class="muted" style="font-size:12px">ván trống, không ai đặt</div>')+
      (wins?'<div class="win">🏆 '+wins+'</div>':'')+'</div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
}

// ===== TAB PALWORLD =====
// (Liên kết Discord ↔ SteamID đã bỏ: server Linux không còn cầu nối tự động,
//  mọi giao dịch là ticket admin xử lý tay nên không cần biết SteamID nữa.)

// Sổ biến động Dogcoin - dữ liệu đến từ STATE (poll mỗi 3s) nên không cần gọi riêng.
const DOG_TYPE_LABEL = {
  'admin+':'➕ Admin cộng', 'admin-':'➖ Admin trừ', 'transfer':'🔁 Chuyển',
  'to-game':'🎮 Vào game', 'from-game':'💬 Ra Discord', 'shop':'🐾 Mua pal', 'refund':'↩️ Hoàn tiền',
};

function renderDogLedger(){
  const box=document.getElementById('dogLedger');
  if(!box||!STATE) return;
  const rows=STATE.dogLedger||[];
  if(rows.length===0){ box.innerHTML='<div class="muted">Chưa có biến động nào.</div>'; return; }
  box.innerHTML=rows.map(r=>{
    const sign=r.amount>=0?'win':'lose';
    const amt=(r.amount>0?'+':'')+Number(r.amount).toLocaleString();
    return '<div style="padding:6px 0;border-bottom:1px solid var(--line)">'+
      '<span class="'+sign+'"><b>'+amt+'</b></span> · '+esc(DOG_TYPE_LABEL[r.type]||r.type)+
      ' · <b>'+esc(r.username||r.userId)+'</b>'+
      '<br><span class="muted" style="font-size:12px">'+esc(r.time||'')+' · còn '+Number(r.balance||0).toLocaleString()+
      (r.note?' · '+esc(r.note):'')+'</span></div>';
  }).join('');
}

function renderPalOrders(){
  const box=document.getElementById('palOrders');
  if(!box||!STATE) return;
  const rows=STATE.palOrders||[];
  // Đơn chưa làm lên trước - đó là việc cần làm; đơn xong hiện mờ bên dưới.
  const todo=rows.filter(o=>o.status!=='done');
  const done=rows.filter(o=>o.status==='done');

  const badge=document.getElementById('palOrderBadge');
  if(badge){
    if(todo.length){ badge.textContent=' 🔴'+todo.length; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  if(rows.length===0){ box.innerHTML='<div class="muted">Chưa có đơn nào.</div>'; return; }

  const line=(o,isDone)=>
    '<div style="padding:8px 0;border-bottom:1px solid var(--line)'+(isDone?';opacity:.55':'')+'">'+
      '<div class="row" style="justify-content:space-between;align-items:flex-start">'+
        '<div>'+
          '<b>#'+o.id+' '+esc(o.palName)+'</b>'+
          ' · '+(o.kind==='random'?'🎲':'🎯')+' '+Number(o.price||0).toLocaleString()+
          '<br><span class="muted" style="font-size:12px">'+esc(o.username||o.userId)+' · '+esc(o.time||'')+
            (isDone&&o.doneAt?' · xong '+esc(o.doneAt):'')+'</span>'+
          '<br><span style="font-size:12px">Linh hồn: <b>'+esc(o.souls||'-')+'</b> | Passive: <b>'+esc(o.passives||'-')+'</b></span>'+
        '</div>'+
        (isDone
          ? '<span class="win" style="font-size:12px;white-space:nowrap">'+(o.resold?'💰 Bán lại':'✅ Đã giao')+'</span>'
          : '<button class="btn-green" style="padding:4px 10px;font-size:12px;white-space:nowrap" onclick="palOrderDone('+o.id+')">✅ Hoàn thành</button>')+
      '</div>'+
    '</div>';

  box.innerHTML =
    (todo.length? todo.map(o=>line(o,false)).join('') : '<div class="muted">Không có đơn nào đang chờ.</div>') +
    (done.length? '<div class="muted" style="margin-top:10px;font-size:12px">Đã giao ('+done.length+'):</div>'+done.slice(0,15).map(o=>line(o,true)).join('') : '');
}

async function palOrderDone(id){
  if(!await uiConfirm('Xác nhận ĐÃ tạo pal và giao cho người này trong game?','✅ Hoàn thành','btn-green'))return;
  try{ await api('/api/pal/order-done',{id}); toast('✅ Đã đóng đơn #'+id); refresh(); }catch(e){}
}

// Bảng liên kết Discord ↔ tên nhân vật (cầu Dogcoin tự động đọc ingameName này)
function renderPalLinks(){
  if(!STATE)return;
  const box=document.getElementById('palLinks');
  if(!box)return;
  // Đang gõ trong ô tên thì đừng vẽ lại (poll 3s sẽ nuốt chữ đang gõ)
  const af=document.activeElement;
  if(af&&af.id&&af.id.indexOf('pn_')===0)return;
  // Ví đã liên kết lên trước, trong nhóm thì giàu trước
  const rows=(STATE.players||[]).slice().sort((a,b)=>((b.ingameName?1:0)-(a.ingameName?1:0))||(b.points-a.points));
  if(!rows.length){box.innerHTML='<div class="muted">Chưa có ví nào.</div>';return;}
  box.innerHTML='<table><tr><th>Discord</th><th>Ví</th><th>Tên nhân vật trong game</th><th></th></tr>'+
    rows.map(p=>'<tr><td>'+esc(p.name)+'<br><span class="muted" style="font-size:11px">'+p.id+'</span></td>'+
      '<td>'+Number(p.points||0).toLocaleString()+'</td>'+
      '<td><input class="mini-in" style="width:150px" placeholder="(chưa liên kết)" id="pn_'+p.id+'" value="'+esc(p.ingameName||'').replace(/"/g,'&quot;')+'"></td>'+
      '<td><button class="mini btn-green" onclick="palSetName(\\''+p.id+'\\')">💾 Lưu</button></td></tr>').join('')+
    '</table>';
}
function palSetName(id){
  const v=document.getElementById('pn_'+id).value;
  api('/api/pal/set-name',{userId:id,name:v}).then(j=>{toast(j.name?('🔗 Đã liên kết: '+j.name):'🔓 Đã hủy liên kết');refresh();}).catch(()=>toast('❌ Lỗi'));
}

function initSelects(){
  ['d1','d2','d3'].forEach(id=>{
    const s=document.getElementById(id);s.innerHTML='';
    for(let i=1;i<=6;i++){const o=document.createElement('option');o.value=i;o.textContent=i;s.appendChild(o);}
    s.onchange=txPreview;
  });
  setDice(1,1,1);
  // lưới dò mìn - lấy số ô từ bot (STATE.totalTiles) để khỏi phải sửa 2 nơi
  const g=document.getElementById('mineGrid');g.innerHTML='';
  for(let i=0;i<(STATE&&STATE.totalTiles?STATE.totalTiles:24);i++){
    const d=document.createElement('div');d.className='tile';d.textContent=i+1;d.dataset.idx=i;
    d.onclick=()=>{if(mineSel.has(i)){mineSel.delete(i);d.classList.remove('mine');d.textContent=i+1;}else{mineSel.add(i);d.classList.add('mine');d.textContent='💣';}document.getElementById('mineCount').textContent=mineSel.size;};
    g.appendChild(d);
  }
  renderMineTarget(); // áp dụng trạng thái checkbox "người tiếp theo" mặc định
}
function clearGrid(){mineSel.clear();document.querySelectorAll('#mineGrid .tile').forEach((d,i)=>{d.classList.remove('mine');d.textContent=i+1;});document.getElementById('mineCount').textContent=0;}

function setDice(a,b,c){document.getElementById('d1').value=a;document.getElementById('d2').value=b;document.getElementById('d3').value=c;txPreview();}
function txPreview(){
  const a=+document.getElementById('d1').value,b=+document.getElementById('d2').value,c=+document.getElementById('d3').value;
  const sum=a+b+c;const tai=sum>=11;const chan=sum%2===0;
  document.getElementById('txPrev').textContent='Tổng '+sum+' → '+(tai?'TÀI 🟢':'XỈU 🔴')+' | '+(chan?'CHẴN 🔵':'LẺ 🟣');
}
function txForce(){
  const v=[document.getElementById('d1').value,document.getElementById('d2').value,document.getElementById('d3').value].join(',');
  api('/api/tx/force',{values:v}).then(()=>{toast('⚡ Đã ép Big Small: '+v);refresh();}).catch(e=>toast('❌ '+e.message));
}
// 27/08: chọn 3 xúc xắc khiến nhà cái trả ÍT NHẤT (cửa gánh nhiều tiền nhất thua)
function txAutoForce(){
  if(!STATE||!STATE.tx)return; const a=STATE.tx.betAgg||{tai:0,xiu:0,chan:0,le:0,bao:0}; const br=STATE.tx.baoRate||30;
  // 5 kết cục ứng viên: [nhãn, xúc xắc, tiền phải trả]
  const opts=[
    ['Tài+Chẵn',[6,6,4],a.tai*2+a.chan*2],
    ['Tài+Lẻ',[6,5,4],a.tai*2+a.le*2],
    ['Xỉu+Chẵn',[1,2,3],a.xiu*2+a.chan*2],
    ['Xỉu+Lẻ',[1,2,2],a.xiu*2+a.le*2],
    ['Bão',[1,1,1],a.bao*br],
  ];
  opts.sort((x,y)=>x[2]-y[2]); const best=opts[0];
  setDice(best[1][0],best[1][1],best[1][2]);
  const totalBet=a.tai+a.xiu+a.chan+a.le+a.bao;
  toast('🎯 '+best[0]+': nhà cái chỉ trả '+best[2].toLocaleString()+' (tổng cược '+totalBet.toLocaleString()+'). Bấm ⚡ Ép để chốt.');
}
function renderTxBetsLive(){
  const box=document.getElementById('txBetsLive'); if(!box||!STATE||!STATE.tx)return;
  const a=STATE.tx.betAgg||{}; const t=STATE.tx;
  const win=t.secsToBet>0
    ? '<span style="color:#3ddc84;font-weight:800">🟢 CÒN '+t.secsToBet+'s ĐỂ ÉP — ép giờ ĂN ván này</span>'
    : '<span style="color:#ff7a7a;font-weight:800">🔒 ĐÃ KHÓA SỔ — ép giờ sẽ vào VÁN SAU</span>';
  const cua='🟢 Tài <b>'+(a.tai||0).toLocaleString()+'</b> · 🔴 Xỉu <b>'+(a.xiu||0).toLocaleString()+'</b> · 🔵 Chẵn <b>'+(a.chan||0).toLocaleString()+'</b> · 🟣 Lẻ <b>'+(a.le||0).toLocaleString()+'</b> · 🌩️ Bão <b>'+(a.bao||0).toLocaleString()+'</b>';
  const list=(t.bets||[]).length
    ? (t.bets||[]).slice().reverse().map(b=>esc(b.name)+': '+({tai:'Tài',xiu:'Xỉu',chan:'Chẵn',le:'Lẻ',bao:'Bão'}[b.choice]||b.choice)+' '+Number(b.amount).toLocaleString()).join(' • ')
    : 'chưa ai đặt';
  box.innerHTML='<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#141824">'
    +'<div style="margin-bottom:5px">'+win+' &nbsp;·&nbsp; Ván #'+padId(t.gameId)+' · '+t.betsCount+' lượt đặt</div>'
    +'<div style="margin-bottom:5px">'+cua+'</div>'
    +'<div class="muted" style="font-size:12px">'+list+'</div></div>';
}


function txStart(){const c=document.getElementById('txChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/tx/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bàn ở #'+j.name);refresh();});}
async function txStop(){if(!await uiConfirm('Tắt bàn Big Small?','Tắt bàn','btn-red'))return;api('/api/tx/stop',{}).then(()=>{toast('⏹️ Đã tắt bàn Big Small');refresh();});}
async function potAdd(key){
  const el=document.getElementById('potAmt_'+key);
  const n=parseInt(el.value,10);
  if(!n)return toast('Nhập số Dogcoin (âm = rút bớt)');
  const lb=(STATE.pot&&STATE.pot.labels&&STATE.pot.labels[key])||key;
  if(!await uiConfirm((n>0?'Nạp ':'Rút ')+Math.abs(n).toLocaleString('vi-VN')+' Dogcoin '+(n>0?'vào':'khỏi')+' hũ '+lb+'?',n>0?'➕ Nạp hũ':'➖ Rút hũ',n>0?'btn-green':'btn-red'))return;
  try{const j=await api('/api/pot/add',{key:key,amount:n});toast('🏆 Hũ '+lb+' hiện có '+Number(j.pot).toLocaleString('vi-VN'));el.value='';refresh();}catch(e){}
}
function mineBoardStart(){const c=document.getElementById('mineChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/mines/board/start',{channelId:c}).then(j=>{toast('▶️ Đã đăng bảng Dò Mìn ở #'+j.name);refresh();});}
async function mineBoardStop(){if(!await uiConfirm('Gỡ bảng Dò Mìn khỏi Discord?','Gỡ bảng','btn-red'))return;api('/api/mines/board/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng Dò Mìn');refresh();});}
function stairBoardStart(){const c=document.getElementById('stairChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/stairs/board/start',{channelId:c}).then(j=>{toast('▶️ Đã đăng bảng Leo Thang ở #'+j.name);refresh();});}
async function stairBoardStop(){if(!await uiConfirm('Gỡ bảng Leo Thang khỏi Discord?','Gỡ bảng','btn-red'))return;api('/api/stairs/board/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng Leo Thang');refresh();});}
function whSaveMin(){const n=parseInt(document.getElementById('whMin').value);if(!n||n<1||n>50)return toast('Nhập số 1–50');api('/api/wheel/min',{minPlayers:n}).then(()=>{toast('💾 Vòng quay cần '+n+' người');refresh();}).catch(()=>toast('❌ Lỗi'));}
async function whReset(){if(!await uiConfirm('Reset lượt vòng quay: CẢ SERVER quay lại được ngay, không đợi 00:00/12:00?','Reset lượt','btn-red'))return;api('/api/wheel/reset',{}).then(j=>{toast('🔄 Đã reset lượt cho '+j.n+' người');refresh();}).catch(()=>toast('❌ Lỗi'));}
// ===== 📈 SÀN CỔ PHIẾU =====
// ===== 📈 SÀN CỔ PHIẾU (panel) =====
// Ô số to + bảng 2 phe MUA/BÁN lời lỗ màu; can thiệp là TRÔI KÍN — người chơi
// không được báo, nên panel phải cho admin XEM TRƯỚC từng người ±bao nhiêu.
function skRow(p){
  const w=p.pl>=0;
  // _i = vị trí trong STATE.stock.positions — nút 💀/🎁 tra ngược qua đây,
  // không nhét tên vào onclick (tên có dấu nháy là vỡ HTML)
  return '<div class="skrow2"><span>'+esc(p.name)+' <span style="color:var(--mut)">x'+p.lev+' · '+p.shares+' CP · '+p.mins+'p</span></span>'+
    '<span><b style="color:'+(w?'var(--green)':'var(--red)')+'">'+(w?'+':'')+p.pl.toLocaleString()+'</b>'+
    '<button class="skmini" title="Cho người này THUA" onclick="skHit('+p._i+',0)">💀</button>'+
    '<button class="skmini" title="Cho người này THẮNG" onclick="skHit('+p._i+',1)">🎁</button></span></div>';
}
function skFill(k){
  if(!k)return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&document.activeElement!==e&&!e.value)e.value=v;};
  set('skTickAmp',k.tickAmp);set('skSpread',k.spreadPct);set('skMaxShares',k.maxShares);set('skMaxPer',k.maxPer);
  set('skMaxLev',k.maxLev);set('skHold',k.holdS);set('skPoint',k.pointX);
  set('skWaveLow',k.waveLow);set('skWaveHigh',k.waveHigh);
  if(!skWaveTicked){skWaveTicked=true;const cb=document.getElementById('skWaveOn');if(cb)cb.checked=k.waveOn!==false;}
  const wn=document.getElementById('skWaveNow');
  if(wn)wn.innerHTML=(k.waveOn!==false?('🌊 Neo lang thang BẬT — giá tự đi bộ khắp <b>100–2.000</b>'+(k.anchor?(', neo đang ở ~<b>'+k.anchor.v.toLocaleString()+'</b>'):'')+'. Dưới <b>'+(k.waveLow||350)+'</b> thiên lên, trên <b>'+(k.waveHigh||1650)+'</b> thiên xuống, ở giữa random.'):'Neo lang thang TẮT — giá bám mốc gốc 1.000.');
  const pc=Math.round((k.price/k.base-1)*1000)/10;
  const tp=document.getElementById('skTPrice');
  tp.textContent=k.price.toLocaleString()+' ('+(pc>=0?'+':'')+pc+'%)';
  tp.style.color=pc>0?'var(--green)':pc<0?'var(--red)':'';
  document.getElementById('skTOut').textContent=k.outstanding+'/'+k.maxShares;
  document.getElementById('skTHold').textContent=k.holders;
  const pay=document.getElementById('skTPay');
  pay.textContent=k.payNow.toLocaleString();
  pay.style.color=k.payNow>(k.marginIn||0)?'var(--red)':'var(--green)';
  document.getElementById('skInfo').innerHTML='Mua <b>'+k.ask.toLocaleString()+'</b> / bán <b>'+k.bid.toLocaleString()+
    '</b> · sức nặng <b>x'+(k.pointX||1)+'</b> · người chơi đã gửi <b>'+(k.marginIn||0).toLocaleString()+'</b> vốn'+
    (k.open?'':' · <b style="color:var(--red)">SÀN ĐANG ĐÓNG</b>');
  document.getElementById('skRisk').innerHTML='Trần thiệt hại với CP đang lưu hành: <b style="color:var(--red)">'+
    k.worstCase.toLocaleString()+'</b> · trần tuyệt đối ('+k.maxShares+' CP): <b style="color:var(--red)">'+
    k.capWorst.toLocaleString()+'</b> — đã nhân sức nặng.';
  // bảng 2 phe — đánh số _i trước khi lọc để nút 💀/🎁 tra đúng người
  const ps=k.positions||[];
  ps.forEach((p,i)=>{p._i=i});
  const side=(arr,boxId,sumId)=>{
    const box=document.getElementById(boxId),sum=document.getElementById(sumId);
    if(!box)return;
    box.innerHTML=arr.length?arr.map(skRow).join(''):'Không có ai.';
    const t=arr.reduce((a,p)=>a+p.pl,0);
    sum.innerHTML=arr.length+' người · <b style="color:'+(t>=0?'var(--green)':'var(--red)')+'">'+(t>=0?'+':'')+t.toLocaleString()+'</b>';
  };
  side(ps.filter(p=>p.side==='long'),'skLongs','skLongSum');
  side(ps.filter(p=>p.side==='short'),'skShorts','skShortSum');
  // sóng đang chạy?
  const dr=document.getElementById('skDrift');
  if(k.drift){dr.style.display='block';
    dr.innerHTML='🌊 Giá đang trôi về <b>'+k.drift.target.toLocaleString()+'</b> ('+(k.drift.by==='admin'?'admin can thiệp':'sóng tự động')+') — còn ~<b>'+k.drift.secsLeft+' giây</b>. Can thiệp mới sẽ ĐÈ lên sóng này.';}
  else dr.style.display='none';
  const b=document.getElementById('skOpenBtn');
  if(b){b.textContent=k.open?'⏸ Tạm đóng sàn':'▶️ Mở lại sàn';b.className=k.open?'btn-red':'btn-green';}
  skPushPrev();
}
// Nhập theo SỐ GIÁ (điểm), không phải % — chủ server chốt 25/08: "giá 900, nhập 5
// bấm trừ là về 895". Server vẫn nhận %, panel tự quy đổi theo giá hiện tại; vì
// target = giá×(1+amt/giá) = giá+amt nên đích ra ĐÚNG số điểm đã nhập.
function skAmtGet(){let v=Math.abs(parseFloat(document.getElementById('skPushPct').value));if(!(v>0))v=5;return Math.round(v)}
function skAmtSet(v){document.getElementById('skPushPct').value=v;skPushPrev();}
function skSecsGet(){let v=parseInt(document.getElementById('skPushSecs').value)||150;if(v<30)v=30;if(v>600)v=600;return v}
// XEM TRƯỚC CẢ HAI HƯỚNG — theo điểm giá thì CHÍNH XÁC TUYỆT ĐỐI:
// delta = shares × sốGiá × sức nặng (MUA ăn khi ➕, BÁN ăn khi ➖).
function skPushPrev(){
  const k=STATE&&STATE.stock,box=document.getElementById('skPushPrev');
  if(!box||!k)return;
  const amt=skAmtGet();
  const ps=k.positions||[];
  if(!ps.length){box.style.display='block';box.innerHTML='Không ai đang giữ lệnh — kéo giá lúc này không tốn của bot đồng nào.';return}
  const money=v=>'<b style="color:'+(v>=0?'var(--green)':'var(--red)')+'">'+(v>=0?'+':'')+v.toLocaleString()+'</b>';
  let up=0;
  const rows=ps.map(p=>{
    const d=(p.side==='long'?1:-1)*p.shares*amt*(k.pointX||1);
    up+=d;
    return '<div class="skrow2"><span>'+(p.side==='long'?'🟢':'🔴')+' '+esc(p.name)+'</span>'+
      '<span>➖ '+money(-d)+' &nbsp;·&nbsp; ➕ '+money(d)+'</span></div>';
  }).join('');
  box.style.display='block';
  box.innerHTML='<b>Nếu giá đi '+amt+' điểm</b> ('+k.price.toLocaleString()+' → ➖ '+(k.price-amt).toLocaleString()+' hoặc ➕ '+(k.price+amt).toLocaleString()+') — mỗi người sẽ ±:'+rows+
    '<div class="skrow2" style="border-top:1px solid #2a2e3b;margin-top:2px"><span><b>BOT</b></span>'+
    '<span>➖ '+(up<=0?'trả thêm':'thu về')+' <b>'+Math.abs(up).toLocaleString()+'</b> &nbsp;·&nbsp; ➕ '+(up>=0?'trả thêm':'thu về')+' <b>'+Math.abs(up).toLocaleString()+'</b></span></div>'+
    '<div style="color:var(--mut);font-size:11.5px;margin-top:3px">Chưa tính người đóng lệnh giữa đường hay cháy ví sớm.</div>';
}
async function skPush(sign,label){
  const k=STATE&&STATE.stock;if(!k)return;
  const amt=skAmtGet(),secs=skSecsGet();
  const maxAmt=Math.floor(k.price*0.4);
  if(amt>maxAmt)return toast('Tối đa '+maxAmt+' giá một lần (40% giá hiện tại)');
  const pct=amt/k.price*100*sign;   // server nhận %, quy đổi tại đây
  const den=k.price+amt*sign;
  const msg=label||((sign>0?'➕ CỘNG ':'➖ TRỪ ')+amt+' giá: '+k.price.toLocaleString()+' → ~'+den.toLocaleString()+'. '+(sign>0?'Phe 🔴 BÁN thua, phe 🟢 MUA thắng.':'Phe 🟢 MUA thua, phe 🔴 BÁN thắng.'));
  if(!await uiConfirm(msg+' Trôi kín trong '+secs+' giây, người chơi không được báo?','Kéo giá',sign>0?'btn-green':'btn-red'))return;
  api('/api/stock/push',{pct,secs})
    .then(j=>{toast('🌊 Đang trôi: '+j.from.toLocaleString()+' → '+j.target.toLocaleString()+' trong '+j.secs+'s');refresh();})
    .catch(e=>toast('❌ '+e.message));
}
// 💀/🎁 cạnh tên: tự chọn hướng — MUA thua = ➖ trừ giá, BÁN thua = ➕ cộng giá (và ngược lại)
function skHit(i,win){
  const k=STATE&&STATE.stock,p=k&&(k.positions||[])[i];
  if(!p)return toast('Người này vừa đóng lệnh — bảng sẽ tự cập nhật');
  const sign=(p.side==='long')===(win===1)?1:-1;
  const amt=skAmtGet();
  const d=(p.side==='long'?1:-1)*sign*p.shares*amt*(k.pointX||1);
  skPush(sign,(win?'🎁 Cho ':'💀 Cho ')+p.name+(win?' THẮNG':' THUA')+': '+(sign>0?'➕ cộng ':'➖ trừ ')+amt+' giá ('+k.price.toLocaleString()+' → ~'+(k.price+amt*sign).toLocaleString()+') → '+p.name+' ('+(p.side==='long'?'MUA':'BÁN')+') sẽ '+(d>=0?'+':'')+d.toLocaleString()+' Dogcoin. Ai cùng phe cũng '+(win?'thắng':'thua')+' theo, phe kia ngược lại.');
}

// ===== 7 HAM DUOI DAY PHUC HOI TU 053c96a (25/08) =====
// Bi xoa oan khi viet lai khoi JS co phieu: patch thay CA VUNG giua 2 moc trong khi
// phien khac vua chen ham Vong quay Pal/Ruong vao dung vung do. Bai hoc: THAY THEO
// TUNG HAM, dung thay theo vung khi file co nguoi khac cung sua.
function skSave(){
  const o={tickAmp:parseInt(document.getElementById('skTickAmp').value),
           spreadPct:parseFloat(document.getElementById('skSpread').value),
           maxShares:parseInt(document.getElementById('skMaxShares').value),
           maxPer:parseInt(document.getElementById('skMaxPer').value),
           maxLev:parseInt(document.getElementById('skMaxLev').value),
           holdS:parseInt(document.getElementById('skHold').value),
           pointX:parseInt(document.getElementById('skPoint').value),
           waveOn:document.getElementById('skWaveOn').checked,
           waveLow:parseInt(document.getElementById('skWaveLow').value),
           waveHigh:parseInt(document.getElementById('skWaveHigh').value)};
  if(!(o.tickAmp>=1&&o.tickAmp<=200))return toast('Giá nhảy mỗi nhịp phải trong 1–200 đơn vị');
  if(!(o.spreadPct>=0&&o.spreadPct<=20))return toast('Chênh mua–bán phải trong 0–20%');
  if(!(o.maxShares>=10))return toast('Trần sàn phải từ 10 CP');
  if(!(o.maxPer>=1))return toast('Trần mỗi người phải từ 1 CP');
  if(!(o.maxLev>=1&&o.maxLev<=100))return toast('Đòn bẩy tối đa phải trong 1–100');
  if(!(o.holdS>=0&&o.holdS<=3600))return toast('Chôn vốn phải trong 0–3600 giây');
  if(!(o.pointX>=1&&o.pointX<=20))return toast('Sức nặng phải trong 1–20');
  if(!(o.waveLow>=100&&o.waveLow<=1000))return toast('Đáy mềm phải trong 100–1000');
  if(!(o.waveHigh>=1000&&o.waveHigh<=2000))return toast('Trần mềm phải trong 1000–2000');
  api('/api/stock/cfg',o).then(()=>{toast('💾 Đã lưu cấu hình sàn');refresh();}).catch(e=>toast('❌ '+e.message));
}

// ===== 🎁 VÒNG QUAY PAL WEB + RƯƠNG (25/08) =====
// Ô số đổ theo kiểu skFill (chỉ khi trống + không focus). Checkbox đổ đúng 1 LẦN —
// panel tự refresh 3 giây/lần, đổ lại liên tục sẽ đè tay admin đang bấm.
let pwCfgTicked=false;
let skWaveTicked=false;
async function skToggle(){
  // 26/08: KHÔNG đoán mò khi chưa có state — trước đây STATE.stock chưa tải xong mà
  // bấm là open tính ra true, nút "Tạm đóng sàn" lại gửi lệnh MỞ sàn (nút coi như hỏng)
  if(!STATE||!STATE.stock){toast('⏳ Panel chưa tải xong trạng thái sàn - chờ 2 giây bấm lại');return;}
  const open=!STATE.stock.open;
  if(!open&&!await uiConfirm('Tạm đóng sàn? Người chơi vẫn bán được, chỉ không mua thêm.','Đóng sàn','btn-red'))return;
  const b=document.getElementById('skOpenBtn');if(b)b.disabled=true;
  api('/api/stock/cfg',{open}).then(j=>{
    // tin theo KẾT QUẢ THẬT server trả về + đổi nút NGAY, khỏi đợi vòng refresh 3s
    const real=!!(j.cfg&&j.cfg.open);
    if(STATE&&STATE.stock)STATE.stock.open=real;
    if(b){b.disabled=false;b.textContent=real?'⏸ Tạm đóng sàn':'▶️ Mở lại sàn';b.className=real?'btn-red':'btn-green';}
    toast(real?'▶️ Sàn ĐANG MỞ':'⏸ Sàn ĐÃ ĐÓNG - người chơi chỉ đóng lệnh được');
    refresh();
  }).catch(e=>{if(b)b.disabled=false;toast('❌ '+e.message);});
}
function pwCfgFill(k){
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&document.activeElement!==e&&!e.value)e.value=v;};
  set('pwPrice',k.price);set('pwCustom',k.customPrice);set('pwSell',k.sellPrice);set('pwSoul',k.soulMax);set('pwLevel',k.level);set('pwStars',k.stars);
  set('pwSoulPct',k.soulPct);set('pwIvs',k.ivs);set('pwPassMax',k.passiveMax);
  set('pwUp5',k.upSlot5);set('pwUp6',k.upSlot6);set('pwUp7',k.upSlot7);set('pwUp8',k.upSlot8);set('pwUpIv',k.upIv);set('pwUpLine',k.upSoulLine);
  set('pwUpWt',k.upWtPassive);set('pwPkBL',k.pickBellaLib);set('pwPkBR',k.pickBlaza);set('pwPkXe',k.pickXeno);set('pwPkHa',k.pickHarta);
  set('pwUpS1',k.upSoul1);set('pwUpS2',k.upSoul2);set('pwUpS3',k.upSoul3);set('pwUpS4',k.upSoul4);set('pwUpS5',k.upSoul5);
  if(!pwCfgTicked){pwCfgTicked=true;document.getElementById('pwBoss').checked=!!k.boss;document.getElementById('pwOpen').checked=!!k.open;}
  document.getElementById('pwCfgNow').innerHTML='Đang áp dụng: vé quay <b>'+k.price.toLocaleString()+'</b> · chọn đích danh <b>'+(k.customPrice||0).toLocaleString()+'</b> · bán lại <b>'+k.sellPrice.toLocaleString()+
    '</b> · linh hồn <b>'+k.soulMax+'</b> dòng × <b>'+(k.soulPct||60)+'%</b> · IV <b>'+(k.ivs||100)+'</b> · passive tối đa <b>'+(k.passiveMax||4)+'</b> · Lv <b>'+k.level+'</b> · <b>'+k.stars+'</b> sao · '+
    (k.boss?'bản <b>PAL BOSS</b>':'bản thường')+' · '+(k.open?'ĐANG MỞ':'<b style="color:var(--red)">ĐANG ĐÓNG</b>');
}
function pwCfgSave(){
  const o={price:parseInt(document.getElementById('pwPrice').value),
           customPrice:parseInt(document.getElementById('pwCustom').value),
           sellPrice:parseInt(document.getElementById('pwSell').value),
           soulMax:parseInt(document.getElementById('pwSoul').value),
           soulPct:parseInt(document.getElementById('pwSoulPct').value),
           ivs:parseInt(document.getElementById('pwIvs').value),
           passiveMax:parseInt(document.getElementById('pwPassMax').value),
           upSlot5:parseInt(document.getElementById('pwUp5').value),
           upSlot6:parseInt(document.getElementById('pwUp6').value),
           upSlot7:parseInt(document.getElementById('pwUp7').value),
           upSlot8:parseInt(document.getElementById('pwUp8').value),
           upIv:parseInt(document.getElementById('pwUpIv').value),
           upSoulLine:parseInt(document.getElementById('pwUpLine').value),
           upWtPassive:parseInt(document.getElementById('pwUpWt').value),
           pickBellaLib:parseInt(document.getElementById('pwPkBL').value),
           pickBlaza:parseInt(document.getElementById('pwPkBR').value),
           pickXeno:parseInt(document.getElementById('pwPkXe').value),
           pickHarta:parseInt(document.getElementById('pwPkHa').value),
           upSoul1:parseInt(document.getElementById('pwUpS1').value),
           upSoul2:parseInt(document.getElementById('pwUpS2').value),
           upSoul3:parseInt(document.getElementById('pwUpS3').value),
           upSoul4:parseInt(document.getElementById('pwUpS4').value),
           upSoul5:parseInt(document.getElementById('pwUpS5').value),
           level:parseInt(document.getElementById('pwLevel').value),
           stars:parseInt(document.getElementById('pwStars').value),
           boss:document.getElementById('pwBoss').checked,
           open:document.getElementById('pwOpen').checked};
  if(!(o.price>=100))return toast('Vé phải từ 100');
  if(!(o.customPrice>=100))return toast('Giá chọn đích danh phải từ 100');
  if(!(o.sellPrice>=0))return toast('Giá bán lại phải từ 0');
  if(!(o.soulMax>=1&&o.soulMax<=4))return toast('Linh hồn 1–4 dòng');
  if(!(o.soulPct>=3&&o.soulPct<=201))return toast('% linh hồn gốc trong 3–201');
  if(o.soulPct%3!==0)return toast('% linh hồn phải là BỘI CỦA 3 (mỗi bậc trong save = 3%) — vd 60, 201');
  if(!(o.ivs>=1&&o.ivs<=255))return toast('IV gốc trong 1–255');
  if(!(o.passiveMax>=1&&o.passiveMax<=8))return toast('Ô passive gốc trong 1–8');
  for(const kk of ['upSlot5','upSlot6','upSlot7','upSlot8','upIv','upSoulLine','upWtPassive','pickBellaLib','pickBlaza','pickXeno','pickHarta','upSoul1','upSoul2','upSoul3','upSoul4','upSoul5'])
    if(!(o[kk]>=0))return toast('Giá nâng cấp không được âm/trống');
  if(!(o.level>=1&&o.level<=100))return toast('Level 1–100');
  if(!(o.stars>=0&&o.stars<=4))return toast('Sao 0–4');
  api('/api/palwheel/cfg',o).then(()=>{toast('💾 Đã lưu vòng quay pal');refresh();}).catch(e=>toast('❌ '+e.message));
}
function pgGrant(){
  const uid=document.getElementById('pgUid').value.trim(), pal=document.getElementById('pgPal').value.trim();
  if(!uid||!pal)return toast('Nhập Discord ID + tên pal');
  api('/api/palchest/grant',{userId:uid,palName:pal}).then(j=>{toast('🎁 Đã tặng '+j.item.name+' vào rương');document.getElementById('pgPal').value='';refresh();}).catch(e=>toast('❌ '+e.message));
}
function pcResolve(ownerId,id,delivered){
  if(!confirm(delivered?'Xác nhận mod ĐÃ GIAO pal này trong game (đã kiểm results.log)?':'Trả pal về rương cho người chơi bấm nhận lại?'))return;
  api('/api/palchest/resolve',{ownerId:ownerId,id:id,delivered:delivered}).then(()=>{toast('✅ Đã chốt');refresh();}).catch(e=>toast('❌ '+e.message));
}
function renderPalChests(){
  const box=document.getElementById('palChests');
  if(!box||!STATE)return;
  const rows=STATE.palChests||[];
  if(!rows.length){box.innerHTML='<div class="muted">Chưa ai có pal trong rương.</div>';return;}
  // 25/08: làm lại cho dễ đọc (góp ý chủ server) — mỗi đơn 1 khung, ĐANG GIAO viền đỏ,
  // trạng thái là nhãn màu, nút gọn nằm phải, đơn đã xong mờ đi.
  const chipCss='font-size:11px;border-radius:6px;padding:2px 8px;white-space:nowrap;';
  box.innerHTML=rows.map(r=>{
    const dim=(r.status==='sold'||r.status==='claimed');
    const chip=r.status==='chest'?'<span style="'+chipCss+'border:1px solid #4b5568;color:#aab3c5">🎒 trong rương</span>'
      :r.status==='sold'?'<span style="'+chipCss+'border:1px solid #4b5568;color:#8f97a8">💰 đã bán</span>'
      :r.status==='claimed'?'<span style="'+chipCss+'border:1px solid #2f8f4f;color:#7fd98a">✅ đã nhận'+(r.deliveredTo?' → '+esc(r.deliveredTo):'')+'</span>'
      :'<span style="'+chipCss+'border:1px solid var(--red);color:var(--red);font-weight:700">⏳ ĐANG GIAO</span>';
    const btn=r.status==='delivering'
      ?('<button style="padding:5px 10px;font-size:12px" onclick="pcResolve(\\''+r.ownerId+'\\','+r.id+',true)">✅ đã giao</button>'
       +'<button style="padding:5px 10px;font-size:12px;background:#3a4155" onclick="pcResolve(\\''+r.ownerId+'\\','+r.id+',false)">↩️ về rương</button>')
      :'';
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid '+(r.status==='delivering'?'var(--red)':'var(--line)')+';border-radius:10px;margin-top:6px'+(dim?';opacity:.55':'')+'">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:14px"><b>'+esc(r.name)+'</b>'+(r.raid?' <span style="color:#ff8f8f;font-size:11px;font-weight:700">🔥 RAID</span>':'')
      +' <span class="muted" style="font-size:11px">rương #'+r.id+(r.dex?' · paldex #'+r.dex:'')+'</span></div>'
      +'<div class="muted" style="font-size:11.5px;margin-top:2px">'+esc(r.ownerName)+(r.ingameName?' — nhân vật <b>'+esc(r.ingameName)+'</b>':'')+' · '+esc(r.wonAt||'')+'</div>'
      +'</div>'+chip+btn+'</div>';
  }).join('');
}
// (stBoardStart/stBoardStop/stReset/jpAdd đã xóa 19/08 cùng tab 📊 Thống kê)
async function chatDelete(inputId){const c=document.getElementById(inputId).value.trim();if(!c)return toast('Nhập Channel ID');if(!await uiConfirm('Xóa tin nhắn của bot trong kênh này?','Xóa','btn-red'))return;api('/api/chat/delete',{channelId:c}).then(j=>{toast('🧹 Đã xóa '+j.count+' tin nhắn');});}

function saveChannel(prefix){
  const id=document.getElementById(prefix+'SaveId').value.trim();
  const note=document.getElementById(prefix+'SaveNote').value.trim();
  if(!id)return toast('Nhập Channel ID');
  api('/api/channels/add',{channelId:id,note}).then(()=>{
    document.getElementById(prefix+'SaveId').value='';
    document.getElementById(prefix+'SaveNote').value='';
    toast('💾 Đã lưu kênh');refresh();
  });
}
async function delChannel(id){if(!await uiConfirm('Xóa kênh đã lưu này?','Xóa','btn-red'))return;api('/api/channels/delete',{channelId:id}).then(()=>{toast('Đã xóa');refresh();});}
function useChannel(prefix,id){document.getElementById(prefix+'Channel').value=id;toast('Đã điền Channel ID');}
function renderSavedChannels(){
  if(!STATE)return;
  const list=STATE.savedChannels||[];
  ['tx','bc','mine','stair','bj'].forEach(prefix=>{
    const el=document.getElementById(prefix+'Saved');if(!el)return;
    if(!list.length){el.innerHTML='<span class="empty">Chưa lưu kênh nào. Nhập ID + ghi chú rồi bấm 💾 Lưu kênh.</span>';return;}
    el.innerHTML=list.map(c=>
      '<div class="chip"><span class="lbl" onclick="useChannel(\\''+prefix+'\\',\\''+c.id+'\\')"><b>'+esc(c.note||'(không ghi chú)')+'</b><span>'+c.id+'</span></span><span class="x" onclick="delChannel(\\''+c.id+'\\')">✕</span></div>'
    ).join('');
  });
}

function renderMineTarget(){
  const any=document.getElementById('mineAny').checked;
  document.getElementById('mineUser').disabled=any;
}
function mineForce(){
  const any=document.getElementById('mineAny').checked;
  const key=any?'_any':document.getElementById('mineUser').value;
  if(!key){toast('❌ Chọn người chơi');return;}
  if(mineSel.size===0){toast('❌ Chưa đánh dấu ô mìn');return;}
  api('/api/mines/force',{key,positions:[...mineSel]}).then(()=>{toast('💣 Đã đặt mìn cho ván tới');clearGrid();refresh();});
}

function renderPlayers(){
  if(!STATE)return;
  // Đừng vẽ lại bảng khi admin đang gõ vào ô nhập số (tránh mất focus + reset số)
  const af=document.activeElement;
  if(af&&af.id&&af.id.indexOf('amt_')===0)return;
  // Giữ lại số đã gõ nhưng chưa bấm nút: refresh 3s/lần vẽ lại bảng không được xóa nó
  // (guard focus ở trên không đủ - admin gõ xong rê chuột/bấm chỗ khác là mất focus).
  const kept={};
  document.querySelectorAll('input[id^="amt_"]').forEach(i=>{if(i.value!=='')kept[i.id]=i.value;});
  const q=(document.getElementById('search').value||'').toLowerCase();
  const tb=document.getElementById('playerBody');tb.innerHTML='';
  STATE.players.filter(p=>p.name.toLowerCase().includes(q)||p.id.includes(q)).forEach(p=>{
    const tr=document.createElement('tr');
    const debtCell=p.debt>0?('<b style="color:#e74c3c">'+p.debt.toLocaleString()+'</b>'+(p.debtBad?' ⚠️':'')):'<span class="muted">0</span>';
    tr.innerHTML='<td>'+esc(p.name)+'</td><td class="muted" style="font-size:12px">'+p.id+'</td><td><b>'+p.points.toLocaleString()+'</b></td>'+
      '<td>'+debtCell+'</td>'+
      '<td><input class="mini-in" type="number" placeholder="số" id="amt_'+p.id+'">'+
      ' <button class="mini btn-blue" onclick="pSet(\\''+p.id+'\\')">Set</button>'+
      ' <button class="mini btn-green" onclick="pAdd(\\''+p.id+'\\')">Cộng</button>'+
      ' <button class="mini btn-red" onclick="pSub(\\''+p.id+'\\')">Trừ</button>'+
      ' <button class="mini btn-red" onclick="pDebt(\\''+p.id+'\\')">📒 Ghi nợ</button>'+
      ((p.debt>0||p.debtBad)?' <button class="mini '+(p.debtBad?'btn-green':'btn-red')+'" onclick="pDebtBad(\\''+p.id+'\\','+(p.debtBad?'false':'true')+')">'+(p.debtBad?'Gỡ ⚠️':'⚠️ Nợ xấu')+'</button>':'')+
      (p.debt>0?' <button class="mini btn-grey" onclick="pDebtClear(\\''+p.id+'\\')">Xóa nợ</button>':'')+
      ' <button class="mini btn-grey" onclick="pDel(\\''+p.id+'\\')">🗑️ Xóa ví</button></td>';
    tb.appendChild(tr);
  });
  Object.keys(kept).forEach(id=>{const i=document.getElementById(id);if(i)i.value=kept[id];});
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function fmtAmt(n){return (n>0?'+':'')+Number(n).toLocaleString();}
function padId(n){return String(n).padStart(5,'0');}

function renderHistories(){
  if(!STATE)return;
  // Big Small
  const tx=STATE.txHistory||[];
  document.getElementById('txHist').innerHTML = tx.length? tx.map(g=>{
    const bets=(g.bets||[]).map(b=>esc(b.name)+': '+b.amount.toLocaleString()+' ('+b.choice+')').join(' • ')||'không ai đặt';
    const wins=(g.winners||[]).map(w=>esc(w.name)+' +'+w.amount.toLocaleString()).join(' • ');
    return '<div class="h"><div class="top"><span>Game #'+padId(g.gameId)+' - 🎲 '+g.dice.join('-')+' (Tổng '+g.sum+') · '+g.tx+' | '+g.cl+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">📝 '+bets+'</div>'+(wins?'<div class="win">🏆 '+wins+'</div>':'<div class="lose">🚫 không ai thắng</div>')+'</div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // Dò Mìn
  const mn=STATE.minesHistory||[];
  document.getElementById('mineHist').innerHTML = mn.length? mn.map(g=>{
    const win=g.amount>=0;
    return '<div class="h"><div class="top"><span>'+esc(g.name)+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">💣 '+g.mines+' mìn · 💎 '+(g.diamonds||0)+' kim cương · cược '+Number(g.bet).toLocaleString()+'</div>'+
      '<div class="'+(win?'win':'lose')+'">'+(win?'✅':'💥')+' '+esc(g.result)+' '+fmtAmt(g.amount)+' Dogcoin</div></div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';

  const sh=STATE.stairsHistory||[];
  document.getElementById('stairHist').innerHTML = sh.length? sh.map(g=>{
    const win=g.amount>=0;
    return '<div class="h"><div class="top"><span>'+esc(g.name)+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">🔥 '+g.fire+' lửa/tầng · 🪜 lên '+(g.floor||0)+' tầng · cược '+Number(g.bet).toLocaleString()+'</div>'+
      '<div class="'+(win?'win':'lose')+'">'+(win?'✅':'🔥')+' '+esc(g.result)+' '+fmtAmt(g.amount)+' Dogcoin</div></div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
}
// Xóa số trong ô sau khi thao tác xong - renderPlayers giờ GIỮ số chưa dùng qua các lần
// refresh, nên không xóa ở đây là số cũ nằm lại, dễ bấm nhầm cộng/trừ 2 lần.
function pClear(id){const i=document.getElementById('amt_'+id);if(i)i.value='';}
function pSet(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/set',{userId:id,amount:+v}).then(()=>{toast('✅ Đã set');pClear(id);refresh();});}
function pAdd(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/add',{userId:id,amount:+v}).then(()=>{toast('✅ Đã cộng');pClear(id);refresh();});}
function pSub(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/subtract',{userId:id,amount:+v}).then(()=>{toast('✅ Đã trừ (đã rút Dogcoin)');pClear(id);refresh();}).catch(()=>toast('❌ Lỗi'));}

function wdStart(){const c=document.getElementById('wdChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/withdraw/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bảng ở #'+j.name);refresh();});}
async function wdStop(){if(!await uiConfirm('Tắt bảng Dogcoin & Shop Pal?','Tắt','btn-red'))return;api('/api/withdraw/stop',{}).then(()=>{toast('⏹️ Đã tắt');refresh();});}

// ---- 📒 VAY NỢ ----
function vayStart(){const c=document.getElementById('vayChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/vay/start',{channelId:c}).then(j=>{toast('▶️ Đã đặt bảng VAY NỢ ở #'+j.name);refresh();});}
function loanCfgSave(){
  const o={dailyMax:parseInt(document.getElementById('loanDaily').value),cap:parseInt(document.getElementById('loanCap').value),feePct:parseFloat(document.getElementById('loanFee').value)};
  if(!(o.dailyMax>=100))return toast('Vay/ngày tối thiểu 100');
  if(!(o.cap>=o.dailyMax))return toast('Trần nợ phải ≥ vay/ngày');
  if(!(o.feePct>=0&&o.feePct<=1000))return toast('Phí vay 0–1000%');
  api('/api/loan/cfg',o).then(j=>{toast('💾 Đã lưu — nhớ Đăng lại bảng để text đổi');refresh();}).catch(e=>toast('❌ '+e.message));
}
function loanCfgFill(k){if(!k)return;const set=(id,v)=>{const e=document.getElementById(id);if(e&&document.activeElement!==e&&!e.value)e.value=v;};set('loanDaily',k.dailyMax);set('loanCap',k.cap);set('loanFee',k.feePct);}
async function vayStop(){if(!await uiConfirm('Gỡ bảng VAY NỢ khỏi kênh? (sổ nợ vẫn giữ nguyên)','Gỡ bảng','btn-red'))return;api('/api/vay/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng');refresh();});}
async function pDebt(id){
  const v=parseInt((document.getElementById('amt_'+id)||{}).value);
  if(isNaN(v)||!v)return toast('Gõ số vào ô trước (âm = giảm nợ đã ghi)');
  if(!await uiConfirm('Ghi nợ '+fmtAmt(v)+' cho người này? (nợ ADMIN: không lãi, không trần)','📒 Ghi nợ','btn-red'))return;
  api('/api/debt/add',{userId:id,amount:v}).then(j=>{toast('📒 Đã ghi - tổng nợ '+j.total.toLocaleString());pClear(id);refresh();});
}
async function pDebtClear(id){
  if(!await uiConfirm('Xóa SẠCH nợ (cả vay lẫn admin ghi) của người này?','Xóa nợ','btn-red'))return;
  api('/api/debt/clear',{userId:id}).then(j=>{toast('✅ Đã xóa '+j.cleared.toLocaleString()+' nợ');refresh();});
}
async function pDebtBad(id,bad){
  if(!await uiConfirm(bad?'Gắn nhãn ⚠️ NỢ XẤU? (bêu tên trên bảng, cấm vay thêm, bot DM báo họ)':'Gỡ nhãn nợ xấu? (họ vay lại được, bot DM báo)',bad?'⚠️ Gắn':'Gỡ nhãn',bad?'btn-red':'btn-green'))return;
  api('/api/debt/bad',{userId:id,bad:bad}).then(()=>{toast(bad?'⚠️ Đã gắn nợ xấu':'✅ Đã gỡ nhãn');refresh();});
}
// Xác nhận theo loại đơn - duyệt 'to-discord' là CỘNG TIỀN vào ví, phải nói rõ.
async function wdApprove(id,kind){
  const msg=kind==='to-discord'
    ? 'Xác nhận bạn ĐÃ NHẬN đủ Dog Coin trong game? Ví Discord của người chơi sẽ được CỘNG ngay khi bấm.'
    : 'Xác nhận bạn ĐÃ ĐƯA đủ Dog Coin trong game? (ví người chơi đã trừ từ lúc tạo đơn)';
  if(!await uiConfirm(msg,'✅ Xong','btn-green'))return;
  api('/api/withdraw/approve',{id}).then(()=>{toast('✅ Đã duyệt');refresh();});
}
async function wdReject(id,kind){
  const msg=kind==='to-discord'
    ? 'Từ chối đơn này? (ví người chơi chưa bị trừ nên không có gì để hoàn)'
    : 'Từ chối và HOÀN LẠI Dogcoin cho người chơi?';
  if(!await uiConfirm(msg,'❌ Từ chối','btn-red'))return;
  api('/api/withdraw/reject',{id}).then(()=>{toast('↩️ Đã từ chối');refresh();});
}

function renderWithdraw(){
  if(!STATE)return;
  const reqs=STATE.withdrawRequests||[];
  const pending=reqs.filter(r=>r.status==='pending');
  const done=reqs.filter(r=>r.status!=='pending');
  // badge số yêu cầu chờ trên tab
  const badge=document.getElementById('wdBadge');
  if(pending.length){badge.textContent=' 🔴'+pending.length;badge.classList.remove('hidden');}
  else badge.classList.add('hidden');
  // Khung chỉ hiện khi có việc cần xử lý (offline / bị treo).
  const card=document.getElementById('wdPendingCard');
  if(card) card.classList.toggle('hidden', pending.length===0);
  // danh sách chờ duyệt
  // Nhãn + việc admin cần làm theo loại đơn.
  const kindInfo=r=>r.kind==='to-discord'
    ? {label:'💬 Ra Discord', act:'NHẬN '+r.amount.toLocaleString()+' Dog Coin trong game rồi bấm ✅ (lúc đó ví mới được cộng)'}
    : {label:'🎮 Vào game', act:'ĐƯA '+r.amount.toLocaleString()+' Dog Coin trong game (ví đã trừ sẵn)'};
  const p=document.getElementById('wdPending');
  p.innerHTML=pending.length?pending.map(r=>{
    const k=kindInfo(r);
    return '<div class="wd-row"><div class="info">'+
      '<span class="amt">'+k.label+' · '+esc(r.username)+(r.ingameName?' <span class="meta">(game: '+esc(r.ingameName)+')</span>':'')+' - <b>'+r.amount.toLocaleString()+' Dogcoin</b></span>'+
      '<span class="meta">Mã #'+r.id+' · '+esc(r.time||'')+' · '+esc(k.act)+'</span>'+
    '</div><div class="acts">'+
      '<button class="btn-green" onclick="wdApprove('+r.id+',\\''+(r.kind||'to-game')+'\\')">✅ Xong</button>'+
      '<button class="btn-red" onclick="wdReject('+r.id+',\\''+(r.kind||'to-game')+'\\')">❌ Từ chối</button>'+
    '</div></div>';
  }).join(''):'<div class="empty" style="color:var(--mut);font-size:13px;padding:8px 2px">Không có đơn nào đang chờ.</div>';
  // lịch sử đã xử lý
  const d=document.getElementById('wdDone');
  d.innerHTML=done.length?done.slice(0,30).map(r=>{
    const k=kindInfo(r);
    return '<div class="h"><div class="top"><span>#'+r.id+' '+k.label+' '+esc(r.username)+' - '+r.amount.toLocaleString()+' Dogcoin</span><span class="t">'+esc(r.time||'')+'</span></div>'+
    '<div class="'+(r.status==='approved'?'win':'lose')+'">'+(r.status==='approved'?'✅ Đã xong':'❌ Đã từ chối')+'</div></div>';
  }).join(''):'<div class="empty">Chưa xử lý đơn nào.</div>';
  // prefill channel id
  const wc=document.getElementById('wdChannel'); if(wc&&!wc.value&&STATE.withdraw&&STATE.withdraw.channelId) wc.value=STATE.withdraw.channelId;
  const vc=document.getElementById('vayChannel'); if(vc&&!vc.value&&STATE.vay&&STATE.vay.channelId) vc.value=STATE.vay.channelId;
  const vl=document.getElementById('vayLive'); if(vl&&STATE.vay) vl.textContent=STATE.vay.live?'🟢 đang treo trong kênh':'⚫ chưa đặt';
}
async function pDel(id){
  const p=(STATE&&STATE.players||[]).find(x=>x.id===id);
  const who=p?(p.name+' - '+p.points.toLocaleString()+' Dogcoin'):id;
  if(!await uiConfirm('Xóa ví của '+who+'? Ví bị xóa khỏi database, lần chơi sau họ được tạo ví mới từ số dư khởi điểm.','🗑️ Xóa ví','btn-red'))return;
  api('/api/points/delete',{userId:id}).then(()=>{toast('🗑️ Đã xóa ví');refresh();});
}

async function resetAllPlayers(){
  const n=(STATE&&STATE.players||[]).length;
  if(!n)return toast('Không còn ví nào để xóa');
  const alsoHistory=document.getElementById('resetHistory').checked;
  if(!await uiConfirm('Xóa TOÀN BỘ '+n+' ví người chơi'+(alsoHistory?' + toàn bộ lịch sử ván và lịch sử rút':'')+'? Không thể hoàn tác trên dashboard (chỉ khôi phục được từ file backup trên VPS).','Tiếp tục','btn-red'))return;
  if(!await uiConfirm('Xác nhận lần cuối: xóa sạch '+n+' ví để mở mùa mới.','🧨 XÓA SẠCH','btn-red','XOA'))return;
  api('/api/points/resetall',{alsoHistory}).then(j=>{
    toast('🧨 Đã xóa '+j.count+' ví'+(j.pending?' · hủy '+j.pending+' yêu cầu rút':''));
    document.getElementById('resetHistory').checked=false;
    refresh();
  });
}

async function setAll(){const v=document.getElementById('setAllAmount').value;if(v==='')return toast('Nhập số');if(!await uiConfirm('Set TẤT CẢ người chơi về '+(+v).toLocaleString()+' điểm?','Set tất cả','btn-red'))return;api('/api/points/setall',{amount:+v}).then(j=>{toast('✅ Đã set '+j.count+' người');refresh();});}

async function addAllCoins(){
  const v=document.getElementById('addAllAmount').value;
  if(v===''||+v<=0)return toast('Nhập số dương');
  const msg=(document.getElementById('addAllMsg').value||'').trim();
  if(!await uiConfirm('Phát '+(+v).toLocaleString()+' Dogcoin cho TẤT CẢ người chơi'+(msg?' với lời nhắn "'+msg+'"':'')+' và tag role?','Phát tất cả','btn-green'))return;
  api('/api/points/addall',{amount:+v,msg:msg}).then(j=>{
    toast(j.announced?('✅ Đã phát cho '+j.count+' người + đã thông báo'):('✅ Đã phát cho '+j.count+' người - ⚠️ KHÔNG đăng được thông báo (kiểm tra quyền bot ở kênh)'));
    document.getElementById('addAllAmount').value='';document.getElementById('addAllMsg').value='';
    refresh();
  }).catch(()=>toast('❌ Lỗi'));
}

function fmtTime(target){
  const left=target-Math.floor(Date.now()/1000);
  if(left<=0)return 'đang mở bát...';
  return 'mở bát sau '+left+'s';
}

function setConn(ok){
  const dot=document.getElementById('connDot'), txt=document.getElementById('connText');
  if(ok){dot.classList.remove('down');txt.style.color='var(--green)';txt.textContent='Online · cập nhật '+new Date().toLocaleTimeString('vi-VN');}
  else{dot.classList.add('down');txt.style.color='var(--red)';txt.textContent='🔴 MẤT KẾT NỐI - bot có thể đã sập';}
}

async function refresh(){
  let j;
  try{j=await api('/api/state');}catch(e){ if(e.message!=='401') setConn(false); return; }
  setConn(true);
  STATE=j.state;
  epApply(!!STATE.superAdmin); // cổng SUPER hiện cụm can thiệp, cổng thường ẩn
  // status line
  document.getElementById('statusLine').textContent='TX #'+padId(STATE.tx.gameId)+' • '+STATE.players.length+' người chơi';
  // prefill channel id (chỉ khi ô đang trống, không đè lúc admin đang gõ)
  const txC=document.getElementById('txChannel'); if(txC&&!txC.value&&STATE.tx.channelId) txC.value=STATE.tx.channelId;
  // tx info
  const txRun=STATE.tx.live&&STATE.tx.status!=='stopped';
  document.getElementById('txInfo').innerHTML='<span class="run '+(txRun?'on':'off')+'">'+(txRun?'🟢 ĐANG CHẠY':'🔴 ĐÃ TẮT')+'</span> &nbsp; Game #'+padId(STATE.tx.gameId)+' • <span class="badge '+(STATE.tx.status==='betting'?'on':'off')+'">'+STATE.tx.status+'</span> • '+fmtTime(STATE.tx.targetTime)+' • '+STATE.tx.betsCount+' cược'+(STATE.tx.forced?' • <span class="badge on">ĐANG ÉP: '+STATE.tx.forced+'</span>':'');
  renderTxBetsLive();
  // 🏆 hu nuoi: moi tro mot hu rieng
  const pt=STATE.pot;
  if(pt&&pt.pots){
    const seedTxt=pt.seedBy?('mồi Dò Mìn/Leo Thang '+Number(pt.seedBy.mines||0).toLocaleString('vi-VN')+' · mồi Quay Pal '+Number((pt.seedBy.gacha)||0).toLocaleString('vi-VN')):('nổ xong hũ về '+Number(pt.seed||0).toLocaleString('vi-VN'));
    const maxTxt=pt.maxBy?('trần nuôi Dò Mìn/Leo Thang '+Number(pt.maxBy.mines||0).toLocaleString('vi-VN')+' · trần Quay Pal '+Number(pt.maxBy.gacha||0).toLocaleString('vi-VN')):('Trần tự trích '+Number(pt.max||0).toLocaleString('vi-VN'));
    document.getElementById('potInfo').textContent=maxTxt
      +' mỗi hũ · trích '+Math.round((pt.rate||0)*100)+'% tiền cược (nhà cái bao) · tỉ lệ nổ chung '+Math.round((pt.hit||0)*100)+'%'
      +' · sàn cược 2 minigame '+Number(pt.minBet||0).toLocaleString('vi-VN')+'/ván · '+seedTxt;
    // Panel tự làm mới 3 giây/lần: CHỈ dựng khung 1 lần rồi cập nhật con số,
    // không vẽ lại cả khối — vẽ lại là cuốn mất số admin đang gõ dở (bug 20/08).
    const keys=Object.keys(pt.pots), box=document.getElementById('potRows');
    if(box.dataset.built!==keys.join(',')){
      box.innerHTML=keys.map(k=>
        '<div class="row" style="align-items:center;margin-bottom:8px">'+
          '<div style="flex:3"><b>'+esc((pt.labels&&pt.labels[k])||k)+'</b><br>'+
            '<span id="potVal_'+k+'" style="font-size:20px;color:#f0b90b">-</span>'+
            '<span id="potFull_'+k+'" class="badge on" style="display:none"> đầy - ngừng tự trích</span></div>'+
          '<div style="flex:3"><input id="potAmt_'+k+'" inputmode="numeric" placeholder="Số Dogcoin (âm = rút)"></div>'+
          '<button class="btn-green" onclick="potAdd(\\''+k+'\\')">➕ Nạp</button>'+
        '</div>').join('');
      box.dataset.built=keys.join(',');
    }
    keys.forEach(k=>{
      const v=Number(pt.pots[k]||0), full=v>=Number((pt.maxBy&&pt.maxBy[k])||pt.max||0);
      const el=document.getElementById('potVal_'+k);
      if(el){el.textContent=v.toLocaleString('vi-VN')+' 🐕';el.style.color=full?'#ff9a5c':'#f0b90b';}
      const fg=document.getElementById('potFull_'+k);
      if(fg)fg.style.display=full?'':'none';
    });
  }
  // trang thai bang moi choi Do Min
  const mb=STATE.minesBoard||{on:false,channelId:''};
  document.getElementById('mineBoardInfo').innerHTML='<span class="run '+(mb.on?'on':'off')+'">'+(mb.on?'🟢 ĐANG HIỆN':'🔴 CHƯA ĐĂNG')+'</span>'+(mb.channelId?' &nbsp; kênh <code>'+esc(mb.channelId)+'</code>':'');
  const mch=document.getElementById('mineChannel');
  if(mb.channelId&&!mch.value)mch.value=mb.channelId; // điền sẵn kênh đang dùng
  // trang thai bang Leo Thang
  const sb2=STATE.stairsBoard||{on:false,channelId:''};
  document.getElementById('stairBoardInfo').innerHTML='<span class="run '+(sb2.on?'on':'off')+'">'+(sb2.on?'🟢 ĐANG HIỆN':'🔴 CHƯA ĐĂNG')+'</span>'+(sb2.channelId?' &nbsp; kênh <code>'+esc(sb2.channelId)+'</code>':'');
  const sch=document.getElementById('stairChannel');
  if(sb2.channelId&&!sch.value)sch.value=sb2.channelId;
  // 🎡 vòng quay: đang chờ mấy người / cần mấy người
  const wh=STATE.wheel;
  if(wh){document.getElementById('whInfo').innerHTML='Vé <b>'+Number(wh.ticket||0).toLocaleString()+'</b> · đang chờ <b>'+wh.waiting+'</b>/'+wh.minPlayers+' người';
  const wmi=document.getElementById('whMin');if(wmi&&!wmi.value&&document.activeElement!==wmi)wmi.value=wh.minPlayers;}
  if(STATE.stock)skFill(STATE.stock);
  if(STATE.palWheelCfg)pwCfgFill(STATE.palWheelCfg);
  if(STATE.loanCfg)loanCfgFill(STATE.loanCfg);
  renderPalChests();
  // mine user select
  const sel=document.getElementById('mineUser');const cur=sel.value;
  sel.innerHTML='';
  STATE.players.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name+' ('+p.points.toLocaleString()+')';sel.appendChild(o);});
  if(cur)sel.value=cur;
  // forced mines list
  const fl=document.getElementById('mineList');fl.innerHTML='';
  const fm=STATE.forcedMines||{};
  const keys=Object.keys(fm);
  if(keys.length){
    fl.innerHTML='<div class="muted" style="font-size:13px;margin-top:6px">Đang ép mìn:</div>';
    keys.forEach(k=>{
      const p=STATE.players.find(x=>x.id===k);
      const name=k==='_any'?'🎯 Người tiếp theo bất kỳ':(p?p.name:k);
      const item=document.createElement('div');item.className='item';
      item.innerHTML='<span>'+esc(name)+' → ô ['+fm[k].map(x=>x+1).join(', ')+']</span><button class="mini btn-red" onclick="mineClear(\\''+k+'\\')">Xóa</button>';
      fl.appendChild(item);
    });
  }
  // xổ số
  renderXS();
  // kênh khoe quay pal
  renderGacha();
  // kênh + role thông báo phát Dogcoin
  renderGiveaway();
  // players table
  renderPlayers();
  document.getElementById('resetCount').textContent=STATE.players.length;
  // lịch sử các trò
  renderHistories();
  // kênh đã lưu
  renderSavedChannels();
  // yêu cầu rút Dogcoin
  renderWithdraw();
  renderDogLedger();
  renderPalOrders();
  renderPalLinks();
}
function mineClear(k){api('/api/mines/clear',{key:k}).then(()=>{toast('Đã xóa ép mìn');refresh();});}

document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')login();});

if(AUTH_OFF){
  // Không có mật khẩu: vào thẳng, không hiện bảng đăng nhập.
  TOKEN='no-auth';
  localStorage.setItem('panel_token',TOKEN);
  showApp();
} else if(TOKEN){
  // auto-login nếu token cũ còn hiệu lực
  fetch('/api/state',{headers:{'Authorization':'Bearer '+TOKEN}}).then(r=>{if(r.ok)showApp();else logout();}).catch(()=>logout());
}
</script>
</body>
</html>`;

module.exports = { startPanel };
