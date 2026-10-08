// ============================================================
//  WEB PANEL CAN THIỆP KẾT QUẢ - dùng http built-in (0 dependency)
// ============================================================
const http = require('http');
const crypto = require('crypto');
// 29/09 NetCo4: tab 🛠️ GM Thiên Long gọi API nội bộ panel GM qua tlbb.gmCall (xem tlbb.js)
const { gmCall } = require('./tlbb');
const ITEMICON = require('./itemicon');   // 🍀 02/10: icon vật phẩm game cho tab Quà tặng (vòng quay)
const NHATKY = require('./nhatky');       // 📒 04/10: nhật ký theo ngày (tab 📜 Log, cổng mod)

function startPanel(ctx) {
    const PASSWORD = ctx.password;
    // 29/09: phiên bản bảng shop = hash nội dung, dùng cho khoá Lưu shop
    const shopVer = () => crypto.createHash('sha1').update(JSON.stringify(ctx.getItemShop ? ctx.getItemShop() : [])).digest('hex').slice(0, 12);
    // 10/09: mật khẩu RIÊNG cổng SUPER - đặt PANEL_SUPER_PASSWORD trong .env.
    // Có nó thì cổng SUPER bắt đăng nhập BẤT KỂ cổng thường đang mở toang.
    const SUPER_PASSWORD = ctx.superPassword || '';
    const tokens = new Set();        // token cổng thường
    const superTokens = new Set();   // token cổng SUPER - hai bộ TÁCH RIÊNG, không dùng chéo

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
    // cộng/trừ KNB, ép kết quả game, tặng item thật trong game. Chỉ tắt khi bạn
    // chấp nhận rủi ro đó, hoặc đã chặn cổng bằng firewall/SSH tunnel.
    const AUTH_OFF = !PASSWORD;
    // 05/10 (chủ server): CỔNG MOD MỞ KHÔNG CẦN MẬT KHẨU. An toàn vì ngay sau isAuthed, cổng mod bị chặn MỌI /api/* trừ các route chỉ-xem
    // (nhật ký che IP, túi boss xem, vòng quay xem, ghép ngọc xem) - không route nào sửa được gì. Cổng SUPER vẫn bắt mật khẩu SUPER riêng.
    // Muốn bật lại mật khẩu cổng mod: đặt PANEL_MOD_MO=0 trong .env rồi restart bot.
    const MO_MOD = process.env.PANEL_MOD_MO !== '0';
    const laCongMod = (req) => req.socket.localPort !== ctx.port;
    let BR_CACHE = null;   // 📊 05/10 /br-data.json

    const isAuthed = (req) => {
        // Cổng SUPER có mật khẩu riêng: bắt buộc token SUPER, kệ AUTH_OFF của cổng thường
        if (req.socket.localPort === ctx.port && SUPER_PASSWORD) {
            const h0 = req.headers['authorization'] || '';
            const t0 = h0.startsWith('Bearer ') ? h0.slice(7) : '';
            return !!t0 && superTokens.has(t0);
        }
        if (AUTH_OFF) return true;
        if (MO_MOD && laCongMod(req)) return true;   // 05/10: cổng mod mở (chỉ xem)
        const h = req.headers['authorization'] || '';
        const t = h.startsWith('Bearer ') ? h.slice(7) : '';
        return t && tokens.has(t);
    };

    // ===== PHÂN QUYỀN 2 CỔNG =====
    // ctx.port (1508)       = SUPER ADMIN: vào là full quyền - hiện cụm can thiệp,
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
                id, name: db[id].name || '(chưa rõ tên)', points: db[id].points || 0, ingameName: db[id].ingameName || '', tlbbGuid: db[id].tlbbGuid || '',
                clone: !!db[id].clone,   // 🧬 07/10: ví clone (chỉ Thương Phố)
                // 📒 nợ: hiện thẳng số trong db (index.js có vòng quét cộng lãi mỗi giờ)
                debt: db[id].debt ? ((db[id].debt.loan || 0) + (db[id].debt.admin || 0)) : 0,
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
                // ⚠️ Gộp ĐỦ MỌI CỬA. Bản cũ khởi tạo sẵn 5 khoá rồi lọc
                // `if (agg[b.choice] !== undefined)` nên tiền đặt vào 47 cửa mới bị
                // VỨT SẠCH, admin nhìn panel tưởng bàn trống.
                const agg = {};
                bets.forEach(b => { agg[b.choice] = (agg[b.choice] || 0) + (b.amount || 0); });
                // ⚠️ 17/09: index.js đổi txLockS thành HÀM (admin chỉnh giây nặn ở panel).
                // Quên gọi thì lockS là cả cái hàm -> phép trừ dưới ra NaN -> secsToBet = NaN ->
                // panel LÚC NÀO CŨNG báo "ĐÃ KHÓA SỔ", admin không ép được kết quả. Đã dính đúng lỗi này.
                // Sổ đóng trước giờ mở bát (hiện nhân + nặn) giây. Lấy thẳng từ index,
                // đừng chỉ trừ giây nặn, trừ thiếu là panel báo còn giờ ép trong khi
                // sổ đã đóng, admin ép nhầm sang ván sau.
                const lockS = Number(ctx.txKhoaSoS ? ctx.txKhoaSoS()
                    : (typeof ctx.txLockS === 'function' ? ctx.txLockS() : ctx.txLockS)) || 24;
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
                    // 🎯 gợi ý ép: MÁY CHỦ tính bằng lõi tiền trên đủ 216 kết quả
                    epGoiY: ctx.txTimEpReNhat ? ctx.txTimEpReNhat() : null,
                    rtp: ctx.txRTP ? ctx.txRTP() : null,
                    thang: ctx.txThang ? ctx.txThang() : null,
                    tenCua: ctx.txCua ? Object.fromEntries(ctx.txCua().map(c => [c.id, c.ten])) : {},
                    bets: bets.slice(-40).map(b => ({ name: b.username || b.userId, choice: b.choice, amount: b.amount || 0 })),
                    secsToBet,
                    baoRate: ctx.txBaoRate || 30,
                    maxBet: ctx.getTXMaxBet ? ctx.getTXMaxBet() : 0,   // 💰 trần cược/người/ván
                    time: ctx.getTxTime ? ctx.getTxTime() : null,        // ⏱️ 17/09: giây đặt cược + giây nặn
                    noti: ctx.getTxNoti ? ctx.getTxNoti() : null,        // 🔔 17/09: báo cược về Discord
                    tran: ctx.getTxTran ? ctx.getTxTran() : null,        // 🎲 trần cược 5 nhóm cửa Sic Bo
                };
            })(),
            // ⚡ SIÊU TÀI XỈU, game RIÊNG, để ngang hàng poker/tienlen chứ đừng nhét
            // vào trong cục tx (nhét vào đó thì panel phải đọc STATE.tx.stx, dễ nhầm).
            stx: (ctx.stx && ctx.stx.adminXem) ? ctx.stx.adminXem() : null,
            rl: (ctx.rl && ctx.rl.adminXem) ? ctx.rl.adminXem() : null,   // 🎡 Roulette
            stxBoard: ctx.getStxBoard ? ctx.getStxBoard() : null,   // 📋 bảng Siêu trên Discord
            forcedMines: ctx.getForcedMines(),
            forcedLucky: ctx.getForcedLucky ? ctx.getForcedLucky() : {},
            pokerAdmin: ctx.getPokerAdmin ? ctx.getPokerAdmin() : [],   // 🃏 ai mở được giải poker
            pokerOn: ctx.getPokerOn ? ctx.getPokerOn() : false,          // 🃏 tab poker đang hiện/ẩn trên web
            poker: ctx.pokerQuanLy ? ctx.pokerQuanLy.tomTat() : null,    // 🃏 ghế, chip, thang, giải đang chạy
            tienlenAdmin: ctx.getTienlenAdmin ? ctx.getTienlenAdmin() : [],   // 🀄 ai chỉnh được bàn Tiến Lên
            tienlenOn: ctx.getTienlenOn ? ctx.getTienlenOn() : false,          // 🀄 tab Tiến Lên hiện/ẩn
            tienlen: ctx.tienlenQuanLy ? ctx.tienlenQuanLy.tomTat() : null,    // 🀄 ghế, cấu hình, bàn đang đánh
            gameOpen: ctx.getGameOpen ? ctx.getGameOpen() : { mines: true, stairs: true },
            dogBridge: ctx.getDogBridge ? ctx.getDogBridge() : { rut: true, nap: true },
            dogBridgeDayMax: ctx.getDogBridgeDayMax ? ctx.getDogBridgeDayMax() : null,
            txSimple: ctx.getTxSimple ? ctx.getTxSimple() : null, minesCfg: ctx.getMinesCfg ? ctx.getMinesCfg() : null,   // 30/09
            dogVangDayMax: ctx.getDogVangDayMax ? ctx.getDogVangDayMax() : null,   // 📅 11/09 (06/10: trước bị kẹt trong comment dòng trên -> ô "đổi vàng/ngày" không hiện số đang lưu)
            withdraw: {
                live: !!wd.message,
                channelId: (wd.channel && wd.channel.id) || db._withdrawChannelId || '',
            },
            vay: ctx.getVay ? ctx.getVay() : { live: false, channelId: '' },
            itemCats: ctx.getItemCats ? ctx.getItemCats() : [],   // 🏷️ 16/09
            giveaway: { channelId: db._giveawayChannelId || '', roleId: db._giveawayRoleId || '' },
            withdrawRequests: ctx.getWithdrawRequests ? ctx.getWithdrawRequests() : [],
            players: buildPlayers(),
            txHistory: (ctx.getTXDash ? ctx.getTXDash() : []),
            // ⚡ 22/09 log Siêu TÁCH RIÊNG (30 ván có cược, đúng thứ bangDiscord đã lọc)
            stxHistory: (ctx.stx && ctx.stx.bangDiscord) ? (ctx.stx.bangDiscord(30).history || []) : [],
            rlHistory: (ctx.rl && ctx.rl.adminXem) ? (ctx.rl.adminXem().hisCuoc || []) : [],   // 🎡 sổ ván CÓ CƯỢC
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
            spmCfg: ctx.getSpmCfg ? ctx.getSpmCfg() : null,
            spmState: ctx.getSpmState ? ctx.getSpmState() : null,
            spmBoard: ctx.getSpmBoard ? ctx.getSpmBoard() : { on: false, channelId: '' },
            dailyCfg: ctx.getDailyCfg ? ctx.getDailyCfg() : null,   // 🪪 mức điểm danh/nghiện/chuỗi
            taxiCfg: ctx.getTaxiCfg ? ctx.getTaxiCfg() : null,       // 🚕 vé "Xu đi taxi về"
            itemShop: ctx.getItemShop ? ctx.getItemShop() : [],
            itemShopVer: shopVer(),   // 29/09: khoá phiên bản - Lưu shop với bảng cũ bị từ chối (2 admin cùng sửa)
            giftShop: ctx.getGiftShop ? ctx.getGiftShop() : [],   // 🎁 15/09: quà admin tặng (danh sách riêng)
            feats: ctx.featList ? ctx.featList() : [],   // 🔌 15/09: công tắc chức năng người chơi
            itemShopDayMax: ctx.getItemShopDayMax ? ctx.getItemShopDayMax() : null,   // 📅 10/09
            itemShopDayMode: ctx.getItemShopDayMode ? ctx.getItemShopDayMode() : null,   // 📅 'server' | 'user'
            itemShopImplantMax: ctx.getItemShopImplantMax ? ctx.getItemShopImplantMax() : null,   // 🧬
            itemShopGroupQuota: ctx.getItemShopGroupQuota ? ctx.getItemShopGroupQuota() : null,   // 🗂️ 12/09 v2
            loanCfg: ctx.getLoanCfg ? ctx.getLoanCfg() : null,
        };
    };

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;
            if (req.method === 'GET' && path.startsWith('/itemicon/')) return ITEMICON.serve(req, res, path.slice(10));   // 🍀 02/10
            if (req.method === 'GET' && path === '/br.js') {   // 📊 05/10 giao diện Bảng rơi / đề xuất farm (đọc lại mỗi lần, sửa không cần restart)
                const s = require('fs').readFileSync(require('path').join(__dirname, 'bangroi.panel.js'));
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
                return res.end(s);
            }
            if (req.method === 'GET' && path === '/tl.js') {   // 🐉 08/10 giao diện Custom Trùng Lâu (tab GM, chỉ SUPER thao tác; đọc lại mỗi lần, sửa không cần restart)
                const s = require('fs').readFileSync(require('path').join(__dirname, 'trunglau.panel.js'));
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
                return res.end(s);
            }
            if (req.method === 'GET' && path === '/br-data.json') {   // 📊 05/10 data.json của tools/bang-roi (deploy lên /var/www/netco4/) + icon từng món, cache theo mtime
                const f = process.env.BANGROI_DATA || '/var/www/netco4/data.json';
                try {
                    const mt = require('fs').statSync(f).mtimeMs;
                    if (!BR_CACHE || BR_CACHE.mt !== mt) {
                        const d = JSON.parse(require('fs').readFileSync(f, 'utf8')); d.ic = {};
                        for (const id of Object.keys(d.items || {})) { const x = ITEMICON.icon(id); if (x) d.ic[id] = x; }
                        BR_CACHE = { mt, body: Buffer.from(JSON.stringify(d)) };
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
                    return res.end(BR_CACHE.body);
                } catch (e) { return sendJSON(res, 404, { ok: false, error: 'Chưa có dữ liệu bảng rơi (' + e.message + ')' }); }
            }
            if (req.method === 'GET' && path === '/gn-admin.js') {   // 💎 05/10 script admin Ghép Ngọc (API vẫn chỉ SUPER)
                const s = require('fs').readFileSync(require('path').join(__dirname, 'ghepngoc.admin.js'));
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
                return res.end(s);
            }

            // Trang chủ. Nhúng thẳng trạng thái auth vào HTML thay vì để client tự dò
            // - client dò bằng fetch dễ hỏng khi trình duyệt còn cache bản JS cũ.
            // no-store để lần sau sửa panel là thấy ngay, không phải xóa cache.
            if (req.method === 'GET' && path === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(HTML.replace('__AUTH_OFF__', (AUTH_OFF || (MO_MOD && laCongMod(req))) ? 'true' : 'false').replace('__CONG_MOD__', epOk(req) ? 'false' : 'true'));   // 04/10: cổng mod chỉ hiện 📒 Nhật ký
            }

            // Đăng nhập
            if (req.method === 'POST' && path === '/api/login') {
                const body = await readBody(req);
                // Cổng SUPER: so với mật khẩu SUPER riêng (nếu có đặt)
                if (req.socket.localPort === ctx.port && SUPER_PASSWORD) {
                    if (body.password === SUPER_PASSWORD) {
                        const token = crypto.randomBytes(24).toString('hex');
                        superTokens.add(token);
                        return sendJSON(res, 200, { ok: true, token });
                    }
                    ctx.writeLog('ADMIN', `[PANEL] Đăng nhập SAI mật khẩu SUPER từ ${req.headers['x-real-ip'] || req.socket.remoteAddress}`);
                    return sendJSON(res, 401, { ok: false, error: 'Sai mật khẩu' });
                }
                if (AUTH_OFF || (MO_MOD && laCongMod(req))) {
                    return sendJSON(res, 200, { ok: true, token: 'no-auth' });
                }
                if (body.password === PASSWORD) {
                    const token = crypto.randomBytes(24).toString('hex');
                    tokens.add(token);
                    return sendJSON(res, 200, { ok: true, token });
                }
                ctx.writeLog('ADMIN', `[PANEL] Đăng nhập SAI mật khẩu từ ${req.headers['x-real-ip'] || req.socket.remoteAddress}`);
                return sendJSON(res, 401, { ok: false, error: 'Sai mật khẩu' });
            }

            // Các API còn lại đều cần auth
            if (path.startsWith('/api/')) {
                if (!isAuthed(req)) return sendJSON(res, 401, { ok: false, error: 'Chưa đăng nhập' });

                // 📒 04/10 MỞ SERVER: cổng mod (admin thường, mod.netco4.click) CHỈ còn xem 📒 Nhật ký.
                // Chặn tại ĐÂY = mọi route bên dưới (kể cả ĐỌC /api/state: ví, KNB, cấu hình, shop) đều 403
                // với cổng mod - thêm route mới cho mod thì phải đặt TRƯỚC dòng chặn này.
                if (path === '/api/whoami') return sendJSON(res, 200, { ok: true, superAdmin: epOk(req) });
                if (path === '/api/nhatky') {
                    const b = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
                    // nhật ký chỉ 3 mục (Tài Xỉu ván có cược, Dò Mìn, Nạp/Rút web) cho cả 2 cổng; cổng mod che thêm 2 số cuối IP
                    const mod = epOk(req) ? {} : { anIP: true, cheKin: true };
                    return sendJSON(res, 200, { ok: true, ...NHATKY.doc({ ...b, anIP: false, cheKin: false, ...mod }) });
                }
                // 🎒 04/10: XEM túi đồ boss (cả 2 cổng, CHỈ ĐỌC): hoạt động + món + số lượng + KNB/trần/lượt quay + hình.
                // Không trả lịch sử sửa (có IP), không lưu được - /api/tuiboss/save|reset vẫn bị chặn ở dòng dưới với cổng mod.
                if (path === '/api/tuiboss/xem' && ctx.tuiBossCfg) {
                    const st = ctx.tuiBossCfg.state();
                    const ds = st.ds.map((h) => ({ hd: h.hd, ten: h.ten, on: h.on, knb: h.knb, ngay: h.ngay, luot: h.luot, mon: h.mon }));
                    const ids = [...new Set(ds.flatMap((h) => h.mon.flatMap((r) => r.ids.map(String))))];
                    return sendJSON(res, 200, { ok: true, ds, ten: st.ten || {}, hinh: ctx.itemIconTra ? ctx.itemIconTra(ids) : {} });
                }
                // 🍀 05/10: XEM vòng quay may mắn (cả 2 cổng, CHỈ ĐỌC): bật/tắt, giá, số lần/vòng, bộ quà đang bật + trọng số,
                // 80 lượt quay gần nhất. KHÔNG trả danh sách ví / uid / IP; sửa vẫn chỉ ở tab 🎁 Quà tặng cổng SUPER.
                // 💎 05/10: XEM nhật ký Ghép Ngọc (cả 2 cổng, CHỈ ĐỌC, không uid/cấu hình) - đặt TRƯỚC chốt chặn mod + khối /api/gn/ chỉ SUPER
                if (path === '/api/gn/xem' && ctx.ghepNgoc && ctx.ghepNgoc.xem) {
                    return sendJSON(res, 200, { ok: true, ...ctx.ghepNgoc.xem() });
                }
                if (path === '/api/vq/xem' && ctx.vongQuay) {
                    const st = ctx.vongQuay.state();
                    const pool = st.pool.filter((x) => !x.off).map((x) => ({ id: x.id, ten: x.ten, sl: x.sl, w: x.w, ic: x.ic }));
                    const log = (st.log || []).slice(0, 80).map((x) => ({ t: x.t, ten: x.ten, tenMon: x.tenMon, sl: x.sl }));
                    return sendJSON(res, 200, { ok: true, cfg: { on: st.cfg.on, gia: st.cfg.gia, max: st.cfg.max, macDinh: st.cfg.macDinh }, pool, log });
                }
                if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Cổng mod chỉ xem 📒 Nhật ký, 🎒 Túi đồ boss và 🍀 Vòng quay' });

                if (path === '/api/state') {
                    const st = buildState();
                    st.superAdmin = epOk(req); // cổng SUPER thì client tự hiện cụm can thiệp
                    return sendJSON(res, 200, { ok: true, state: st });
                }

                const body = req.method === 'POST' ? await readBody(req) : {};

                // 04/09: cổng ADMIN THƯỜNG chỉ được XEM 2 tab 👥 Người chơi + 🐉 Thiên Long
                // & KNB - mọi route GHI của 2 tab đó phải vào từ cổng SUPER. Chặn ở
                // MỘT chỗ này (kèm ẩn/khoá nút phía client) cho khỏi sót route lẻ.
                const VIEWONLY_PATHS = [
                    // tab 👥: ví/nợ/phát quà/mức thưởng
                    '/api/points/set', '/api/points/add', '/api/points/subtract', '/api/points/delete',
                    '/api/points/resetall', '/api/points/setall', '/api/points/reset-daily', '/api/points/addall',
                    '/api/giveaway/config', '/api/debt/add', '/api/debt/clear', '/api/daily/cfg',
                    // tab 🐉: bảng KNB/duyệt đơn/liên kết nhân vật/shop item
                    '/api/withdraw/start', '/api/withdraw/stop', '/api/withdraw/approve', '/api/withdraw/reject',
                    '/api/tlbb/lienket', '/api/tlbb/taoclone', '/api/tpik/save', '/api/tpik/sync', '/api/gm/act', '/api/gm/doche', '/api/gm/amkhi', '/api/gm/trunglau', /* 04/10: cổng mod giờ bị chặn MỌI route (trừ /api/nhatky, /api/whoami) ngay sau isAuthed - danh sách này chỉ còn là lớp phụ */
                    // 29/09 NetCo4: admin THƯỜNG được sửa SHOP (giá, nhóm, hạn, hình) để bạn bè giúp đặt giá:
                    // bỏ '/api/itemshop/save', '/api/itemcats/save', '/api/itemshop/daymax', '/api/itemshop/upload' khỏi danh sách chặn.
                    '/api/pot/cfg', /* 02/10: '/api/gift/save' mở cho mod (tab 🎁 Quà tặng) */ '/api/gift/grant', '/api/ichkyban/cfg', '/api/ichkyban/save', '/api/feat/set',
                    // 🃏 admin poker: ai mở được giải - chỉ SUPER (đây là danh sách CHẶN trên cổng thường,
                    // quên thêm route mới vào đây là cổng thường gọi được luôn)
                    // 🎲 trần cược từng cửa Sic Bo: đây là cài đặt TIỀN, cổng thường không được sửa
                    '/api/tx/tran', '/api/tx/rtp', '/api/tx/thang', '/api/tx/simple', '/api/mines/cfg',
                    // ⚡ Siêu Tài Xỉu, ĂN KNB THẬT, càng phải chặn chắc
                    '/api/stx/on', '/api/stx/time', '/api/stx/tran', '/api/stx/an',
                    '/api/stx/thang', '/api/stx/maxbet', '/api/stx/ep', '/api/stx/epclear',
                    '/api/stx/epnhan', '/api/stx/epnhanclear',
                    '/api/stx/board/start', '/api/stx/board/stop',
                    // 🎡 Roulette, ĂN KNB THẬT, chỉ SUPER
                    '/api/rl/on', '/api/rl/time', '/api/rl/tran', '/api/rl/an', '/api/rl/thang',
                    '/api/rl/maxbet', '/api/rl/ep', '/api/rl/epclear', '/api/rl/epnhan', '/api/rl/epnhanclear', '/api/rl/set', '/api/rl/khongphi',
                    '/api/poker/admin', '/api/poker/on', '/api/poker/chip', '/api/poker/batdau',
                    // 🀄 Tiến Lên ĂN KNB THẬT -> càng phải chặn chắc ở cổng thường
                    '/api/tienlen/admin', '/api/tienlen/on', '/api/tienlen/cauhinh', '/api/tienlen/batdau', '/api/tienlen/giaitan',
                    '/api/poker/giaitan', '/api/poker/nghi', '/api/poker/tiep',
                    // 📜 lịch sử sửa Drop Boss có IP người sửa -> chỉ SUPER (route cũng tự kiểm epOk)
                    '/api/drop/log', '/api/drop/rollback',
                ];
                if (req.method === 'POST' && VIEWONLY_PATHS.includes(path) && !epOk(req)) {
                    return sendJSON(res, 403, { ok: false, error: 'Cổng admin này CHỈ XEM 2 tab 👥/🐉 - muốn chỉnh phải vào cổng SUPER' });
                }
                // ===== 📈 SÀN CỔ PHIẾU: chỉnh thông số + thả tin =====
                if (ctx.setStockCfg && req.method === 'POST' && path === '/api/stock/cfg') {
                    return sendJSON(res, 200, { ok: true, cfg: ctx.setStockCfg(body) });
                }
                // 25/08: can thiệp KÍN - giá trôi dần tới đích, không banner, không toast
                // 04/09: CHỈ cổng SUPER được kéo giá (chủ server chuyển khỏi admin thường)
                if (ctx.stockPush && req.method === 'POST' && path === '/api/stock/push') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                    const pct = Number(body.pct);
                    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 40) {
                        return sendJSON(res, 400, { ok: false, error: 'Biên độ phải trong ±1..40%' });
                    }
                    return sendJSON(res, 200, { ok: true, ...ctx.stockPush(pct, Number(body.secs) || 150) });
                }

                // 🚀 PHI THUYỀN: cấu hình + ép điểm nổ (ép chỉ ở cổng SUPER)
                if (ctx.setSpmCfg && req.method === 'POST' && path === '/api/spm/cfg') {
                    return sendJSON(res, 200, { ok: true, cfg: ctx.setSpmCfg(body) });
                }
                if (ctx.spmForceCrash && req.method === 'POST' && path === '/api/spm/force') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                    const r = ctx.spmForceCrash(body.m);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    ctx.writeLog('ADMIN', `[PHI THUYỀN] Ép điểm nổ chuyến tới = ${r.forced}x`);
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🛒 SHOP ITEM: lưu toàn bộ danh mục item (id/name/price/max/img/cat)
                if (ctx.setItemShopDayMax && req.method === 'POST' && path === '/api/itemshop/daymax') {
                    const r = ctx.setItemShopDayMax(body.dayMax);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    if (body.dayMode !== undefined && ctx.setItemShopDayMode) {
                        const m = ctx.setItemShopDayMode(body.dayMode);
                        if (m.error) return sendJSON(res, 400, { ok: false, error: m.error });
                        r.dayMode = m.dayMode;
                    }
                    if (body.implantMax !== undefined && ctx.setItemShopImplantMax) {
                        const im = ctx.setItemShopImplantMax(body.implantMax);
                        if (im.error) return sendJSON(res, 400, { ok: false, error: im.error });
                        r.implantMax = im.implantMax;
                    }
                    if (body.groupQuota !== undefined && ctx.setItemShopGroupQuota) {
                        const gg = ctx.setItemShopGroupQuota(body.groupQuota);
                        if (gg.error) return sendJSON(res, 400, { ok: false, error: gg.error });
                        r.groupQuota = gg.groupQuota;
                    }
                    ctx.writeLog('ADMIN', `[PANEL SHOP ITEM] Giới hạn mua mỗi món/ngày = ${r.dayMax || 'không giới hạn'} · chế độ ${r.dayMode === 'user' ? 'mỗi người' : 'toàn server'}`);
                    return sendJSON(res, 200, r);
                }
                // 🔌 15/09: bật/tắt chức năng người chơi (chỉ SUPER)
                if (ctx.setFeatOff && req.method === 'POST' && path === '/api/feat/set') {
                    const r = ctx.setFeatOff(String(body.key || ''), !!body.off);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // 🎁 15/09: quà admin tặng - danh sách riêng (chỉ SUPER, xem VIEWONLY_PATHS)
                if (ctx.setGiftShop && req.method === 'POST' && path === '/api/gift/save') {
                    const list = ctx.setGiftShop(Array.isArray(body.items) ? body.items : []);
                    ctx.writeLog('ADMIN', `[PANEL QUÀ TẶNG] Lưu ${list.length} quà`);
                    return sendJSON(res, 200, { ok: true, items: list });
                }
                // 🎯 18/09: tặng RIÊNG 1 người từ tab 🎁 - where 'ruong' = bỏ thẳng vào Rương Ích Kỷ (không hạn,
                // không cần online, không cần liên kết); 'game' = giao thẳng vào túi (phải liên kết + online,
                // đi lại đúng đường Kho đồ adminGiveItem nên cùng deliverLock, cùng log).
                // 💰 05/10: bán ngọc 6 / Yếu Quyết trong Rương Ích Kỷ - chỉ cổng SUPER (tab 📦 Kho đồ)
                if (ctx.ichKyBan && (path === '/api/ichkyban/cfg' || (req.method === 'POST' && path === '/api/ichkyban/save'))) {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                    const B = ctx.ichKyBan;
                    if (path === '/api/ichkyban/save') {
                        const so = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100000000 ? n : null; };
                        const o = { on: body.on === true, nhom: {}, rieng: {} };
                        for (const k of Object.keys(B.nhom())) {
                            const g = (body.nhom && body.nhom[k]) || {};
                            const gia = so(g.gia); if (gia === null) return sendJSON(res, 400, { ok: false, error: 'Giá nhóm không hợp lệ' });
                            o.nhom[k] = { on: g.on === true, gia };
                        }
                        // giá riêng: mỗi dòng "ID=giá" (hoặc "ID giá"); dòng trống / # bỏ qua
                        for (const dong of String(body.rieng || '').split(/\r?\n/)) {
                            const t = dong.trim(); if (!t || t.startsWith('#')) continue;
                            const m = t.match(/^(\d{8})\s*[=\s:]\s*(\d+)$/);
                            if (!m || so(m[2]) === null) return sendJSON(res, 400, { ok: false, error: `Dòng giá riêng sai: "${t.slice(0, 40)}" (đúng: 50601001=20000)` });
                            o.rieng[m[1]] = so(m[2]);
                        }
                        const nm = so(body.ngayMax); if (nm === null) return sendJSON(res, 400, { ok: false, error: 'Giới hạn/ngày không hợp lệ' });
                        o.ngayMax = nm;
                        const c = B.set(o);
                        ctx.writeLog('ADMIN', `[PANEL] Bán rương: ${c.on ? 'BẬT' : 'TẮT'} · ${Object.entries(c.nhom).map(([k, g]) => `${k} ${g.on ? g.gia : 'tắt'}`).join(' · ')} · riêng ${Object.keys(c.rieng).length} món · ${c.ngayMax || '∞'}/ngày`);
                    }
                    return sendJSON(res, 200, { ok: true, cfg: B.cfg(), ds: B.ds(), nhom: B.nhom(), tranShop: B.tranShop });
                }
                if (ctx.adminIchKyGrant && req.method === 'POST' && path === '/api/gift/grant') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                    const uid = String(body.userId || '').trim();
                    const rec = ctx.getDb()[uid];
                    if (!uid || !rec || typeof rec !== 'object') return sendJSON(res, 400, { ok: false, error: 'Chưa chọn người nhận' });
                    let r;
                    if (body.where === 'game') {
                        const gname = String(rec.ingameName || '').trim();
                        if (!gname) return sendJSON(res, 400, { ok: false, error: 'Người này chưa liên kết tên nhân vật - chỉ bỏ vào rương được' });
                        if (!ctx.adminGiveItem) return sendJSON(res, 400, { ok: false, error: 'Kho đồ chưa bật' });
                        r = await ctx.adminGiveItem(gname, body.itemId, body.qty);
                    } else r = ctx.adminIchKyGrant(uid, body.itemId, body.qty, body.note);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    ctx.writeLog('ADMIN', `[PANEL QUÀ RIÊNG] ${body.where === 'game' ? 'vào game' : 'vào rương'}: ${body.itemId} x${body.qty} -> ${rec.name || uid}`);
                    return sendJSON(res, 200, { ok: true, message: r.message });
                }
                // 🖼️ 02/10: hình + tên game theo ID (chỉ đọc, cả 2 cổng) cho bảng Shop Item / Quà admin tặng
                if (ctx.itemIconTra && path === '/api/itemicon/tra') {
                    return sendJSON(res, 200, { ok: true, items: ctx.itemIconTra((body || {}).ids) });
                }
                // 💎 05/10: Ghép Ngọc - cấu hình (CHỈ cổng SUPER, cả xem)
                if (ctx.ghepNgoc && path.startsWith('/api/gn/')) {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Ghép Ngọc chỉ chỉnh ở cổng SUPER' });
                    const who = 'SUPER ' + String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
                    const b = body || {};
                    let r;
                    if (path === '/api/gn/cfg') r = ctx.ghepNgoc.state();
                    else if (path === '/api/gn/save') r = ctx.ghepNgoc.save(b, who);
                    else if (path === '/api/gn/chuyen' && ctx.ghepNgoc.chuyen) r = ctx.ghepNgoc.chuyen(who);   // ⤵️ 07/10 shop/nhóm -> 2 danh sách, giữ giá
                    else if (path === '/api/gn/tim') r = { items: ctx.ghepNgoc.tim(b.q) };
                    else if (path === '/api/gn/thu') r = await ctx.ghepNgoc.thu();
                    else if (path === '/api/gn/hoan') r = ctx.ghepNgoc.hoan(b.k, who);
                    else return sendJSON(res, 404, { ok: false, error: 'Không có API này' });
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🍀 02/10: Vòng quay may mắn - cấu hình (chỉ cổng SUPER)
                // 02/10: mod (cổng thường) sửa được cấu hình + bộ quà; CẤP LƯỢT QUAY chỉ SUPER (như cấp tiền)
                if (ctx.vongQuay && path.startsWith('/api/vq/')) {
                    if (path === '/api/vq/cap' && !epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Cấp lượt quay chỉ làm được ở cổng SUPER' });
                    const who = (epOk(req) ? 'SUPER ' : 'mod ') + String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
                    const b = body || {};
                    let r;
                    if (path === '/api/vq/cfg') r = ctx.vongQuay.state();
                    else if (path === '/api/vq/save') r = ctx.vongQuay.save(b, who);
                    else if (path === '/api/vq/macdinh') r = ctx.vongQuay.macDinh(who);
                    else if (path === '/api/vq/cap') r = ctx.vongQuay.cap(b.uid, b.n, who);
                    else if (path === '/api/vq/tim') r = { items: ctx.vongQuay.tim(b.q) };
                    else return sendJSON(res, 404, { ok: false, error: 'Không có API này' });
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🎒 01/10: Túi đồ boss - cấu hình (admin + mod đều sửa được; mọi lần lưu ghi cổng + IP vào lịch sử)
                if (ctx.tuiBossCfg && path === '/api/tuiboss/cfg') {
                    return sendJSON(res, 200, { ok: true, ...ctx.tuiBossCfg.state() });
                }
                if (ctx.tuiBossCfg && req.method === 'POST' && (path === '/api/tuiboss/save' || path === '/api/tuiboss/reset')) {
                    const who = (epOk(req) ? 'SUPER' : 'mod') + ' ' + String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
                    const laReset = path === '/api/tuiboss/reset';
                    const r = laReset ? ctx.tuiBossCfg.reset(body && body.hd, who) : ctx.tuiBossCfg.save(body, who);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    ctx.writeLog('ADMIN', `[PANEL TÚI BOSS] ${laReset ? 'Về mặc định' : 'Lưu'} ${String((body && body.hd) || '')} (${who})`);
                    return sendJSON(res, 200, { ok: true, ...ctx.tuiBossCfg.state() });
                }
                // 🐾 01/10: Chọn Pet Boss - cấu hình + danh sách đã nhận (xem petboss.js)
                if (ctx.petBoss && path === '/api/petboss/state') {
                    return sendJSON(res, 200, { ok: true, ...ctx.petBoss.state() });
                }
                if (ctx.petBoss && req.method === 'POST' && path === '/api/petboss/save') {
                    const s = ctx.petBoss.save(body || {});
                    ctx.writeLog('ADMIN', `[PANEL PET BOSS] Lưu cấu hình: ${s.cfg.on ? 'BẬT' : 'tắt'}, bản ${s.cfg.ban}, giá ${s.cfg.price} (IP ${req.headers['x-real-ip'] || req.socket.remoteAddress})`);
                    return sendJSON(res, 200, { ok: true, ...s });
                }
                if (ctx.petBoss && req.method === 'POST' && path === '/api/petboss/reset') {
                    const r = ctx.petBoss.reset(String((body && body.uid) || ''));
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, message: r.message, ...ctx.petBoss.state() });
                }
                if (ctx.setItemShop && req.method === 'POST' && path === '/api/itemshop/save') {
                    // 29/09: nút Lưu gửi CẢ bảng đang hiển thị -> ai mở panel với bảng cũ mà bấm Lưu là ghi đè
                    // thay đổi của người khác (đã mất 5 món 17:03). Client gửi ver lúc tải bảng; lệch = từ chối.
                    if (body.ver !== undefined && String(body.ver) !== shopVer()) {
                        return sendJSON(res, 409, { ok: false, error: 'Có người vừa lưu shop trước bạn - bảng bạn đang xem đã cũ. Bấm F5 tải lại rồi sửa tiếp (thay đổi của bạn CHƯA được lưu).' });
                    }
                    const list = ctx.setItemShop(Array.isArray(body.items) ? body.items : []);
                    ctx.writeLog('ADMIN', `[PANEL SHOP ITEM] Lưu ${list.length} món (cổng ${epOk(req) ? 'SUPER' : 'thường'}, IP ${req.headers['x-real-ip'] || req.socket.remoteAddress})`);
                    return sendJSON(res, 200, { ok: true, items: list });
                }
                // 📦 08/09: KHO ĐỒ TOÀN GAME - CHỈ cổng SUPER (thay CreativeMenu client)
                if (ctx.gameItems && path === '/api/gameitems') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                    return sendJSON(res, 200, { ok: true, items: ctx.gameItems(), targets: ctx.giveTargets ? ctx.giveTargets() : [], wallets: ctx.giftTargets ? ctx.giftTargets() : [] });
                }
                if (ctx.adminGiveItem && req.method === 'POST' && path === '/api/give/item') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                    const r = await ctx.adminGiveItem(body.target, body.itemId, body.qty);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    ctx.writeLog('ADMIN', `[PANEL] Kho đồ: giao ${body.itemId} x${body.qty} cho ${body.target}`);
                    return sendJSON(res, 200, { ok: true, message: r.message });
                }
                // 🖼️ 04/09: up hình item thẳng từ panel (base64) - phục vụ ngay, khỏi restart
                if (ctx.uploadItemImage && req.method === 'POST' && path === '/api/itemshop/upload') {
                    const r = ctx.uploadItemImage(body.name, body.data);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, file: r.file });
                }
                // 🪪 mức điểm danh / nghiện / thưởng chuỗi (tab 👥)
                if (ctx.setDailyCfg && req.method === 'POST' && path === '/api/daily/cfg') {
                    const num = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
                    const o = {};
                    if (num(body.daily) !== null) o.daily = num(body.daily);
                    if (num(body.nghien) !== null) o.nghien = num(body.nghien);
                    if (num(body.streakEvery) !== null && num(body.streakEvery) >= 1) o.streakEvery = num(body.streakEvery);
                    if (num(body.streakBonus) !== null) o.streakBonus = num(body.streakBonus);
                    if (typeof body.nghienOn === 'boolean') o.nghienOn = body.nghienOn;   // 💉 04/10 công tắc /nghien
                    if (!Object.keys(o).length) return sendJSON(res, 400, { ok: false, error: 'Không có số hợp lệ' });
                    const r = ctx.setDailyCfg(o);
                    ctx.writeLog('ADMIN', `[PANEL] Mức điểm danh: ngày ${r.cfg.daily} · nghiện ${r.cfg.nghien} (${r.cfg.nghienOn ? 'BẬT' : 'TẮT'}) · đủ ${r.cfg.streakEvery} ngày thưởng ${r.cfg.streakBonus}`);
                    return sendJSON(res, 200, { ok: true, cfg: r.cfg });
                }
                // 🚕 vé "Xu đi taxi về" (tab 👥)
                if (ctx.setTaxiCfg && req.method === 'POST' && path === '/api/taxi/cfg') {
                    const num = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
                    const o = {};
                    if (body.on !== undefined) o.on = !!body.on;
                    if (num(body.tien) !== null) o.tien = num(body.tien);
                    if (num(body.loMin) !== null) o.loMin = num(body.loMin);
                    if (num(body.viMax) !== null) o.viMax = num(body.viMax);
                    if (num(body.gioCho) !== null && num(body.gioCho) >= 1) o.gioCho = num(body.gioCho);
                    if (!Object.keys(o).length) return sendJSON(res, 400, { ok: false, error: 'Không có số hợp lệ' });
                    const r = ctx.setTaxiCfg(o);
                    ctx.writeLog('ADMIN', `[PANEL] Xu đi taxi về: ${r.cfg.on ? 'BẬT' : 'TẮT'} · phát ${r.cfg.tien} · cần thua ${r.cfg.loMin}/ngày · ví còn ≤ ${r.cfg.viMax} · cách ${r.cfg.gioCho}h`);
                    return sendJSON(res, 200, { ok: true, cfg: r.cfg });
                }
                // 🏷️ 16/09: lưu danh sách nhóm hàng (đổi tên / thêm / bớt)
                if (ctx.setItemCats && req.method === 'POST' && path === '/api/itemcats/save') {
                    const r = ctx.setItemCats(body.cats);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
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
                    ctx.getTX().forcedResult = null; ctx.getTX().epNhaCai = null;   // 05/10: hủy luôn 'nhà cái ăn nhiều nhất' bật từ nút Discord
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Hủy ép kết quả Big Small`);
                    return sendJSON(res, 200, { ok: true });
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
                // 💰 trần cược TX mỗi người mỗi ván (0 = không giới hạn)
                if (path === '/api/tx/maxbet') {
                    if (!ctx.setTXMaxBet) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setTXMaxBet(body.maxBet);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    ctx.writeLog('ADMIN', `[PANEL] Trần cược Big Small: ${r.maxBet.toLocaleString()}/người/ván${r.maxBet ? '' : ' (KHÔNG giới hạn)'}`);
                    return sendJSON(res, 200, { ok: true, maxBet: r.maxBet });
                }
                // ⏱️ 17/09: nhịp ván - giây ĐẶT CƯỢC + giây NẶN
                if (path === '/api/tx/time') {
                    if (!ctx.setTxTime) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setTxTime(body.bet, body.nan, body.nhan);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, bet: r.bet, nhan: r.nhan, nan: r.nan, round: r.round });
                }
                // 🎲 trần cược từng nhóm cửa của bàn Sic Bo 52 cửa
                if (path === '/api/tx/simple') {   // 🎲 30/09: bàn Tài Xỉu đơn giản 4 cửa
                    if (!ctx.setTxSimple) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    return sendJSON(res, 200, ctx.setTxSimple(!!body.on));
                }
                if (path === '/api/mines/cfg') {   // 💣 30/09: RTP / trần hệ số / cược tối đa / cỏ 🍀
                    if (!ctx.setMinesCfg) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setMinesCfg(body);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                if (path === '/api/tx/tran') {
                    if (!ctx.setTxTran) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setTxTran(body.tran || {});
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...ctx.getTxTran() });
                }
                // 🎯 RTP: đổi là cả 48 cửa tính lại tần suất được bốc hệ số nhân
                if (path === '/api/tx/rtp') {
                    if (!ctx.setTxRTP) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    // nhận cả 95 lẫn 0.95 cho đỡ nhầm
                    let r = Number(body.rtp);
                    if (Number.isFinite(r) && r > 1) r = r / 100;
                    const kq = ctx.setTxRTP(r);
                    if (kq.error) return sendJSON(res, 400, { ok: false, error: kq.error });
                    return sendJSON(res, 200, { ok: true, ...kq });
                }
                // 🎰 Thang hệ số nhân: admin chỉnh giá trị + độ hiếm từng bậc
                if (path === '/api/tx/thang') {
                    if (!ctx.setTxThang) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const kq = ctx.setTxThang(body.macDinh ? null : body.thang);
                    if (kq.error) return sendJSON(res, 400, { ok: false, error: kq.error });
                    return sendJSON(res, 200, { ok: true, ...kq });
                }
                // 📋 BẢNG SIÊU TÀI XỈU trên Discord. Phải đứng TRƯỚC khối '/api/stx/'
                // chung ở dưới, không thì rơi vào đó rồi trả "Không có đường này".
                if (path === '/api/stx/board/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    if (!ctx.startStxBoard) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    try {
                        const name = await ctx.startStxBoard(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Đăng bảng Siêu Tài Xỉu tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) {
                        return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' });
                    }
                }
                if (path === '/api/stx/board/stop') {
                    if (ctx.stopStxBoard) ctx.stopStxBoard();
                    ctx.writeLog('ADMIN', '[PANEL] Gỡ bảng Siêu Tài Xỉu');
                    return sendJSON(res, 200, { ok: true });
                }

                // 🎡 ROULETTE: toàn bộ luật nằm ở Roulette/ban.js
                if (path.indexOf('/api/rl/') === 0) {
                    const B = ctx.rl;
                    if (!B) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ Roulette' });
                    let r = null;
                    if (path === '/api/rl/on') r = B.datBatTat(!!body.on);
                    else if (path === '/api/rl/time') r = B.datGio(body.bet, body.quay, body.roi);
                    else if (path === '/api/rl/tran') r = B.datTran(body.tran || {});
                    else if (path === '/api/rl/an') r = B.datMucAn(body.an);
                    else if (path === '/api/rl/thang') r = B.datThang(body.macDinh ? null : body.thang);
                    else if (path === '/api/rl/set') r = B.datKhoangSet(body.macDinh ? null : body.set);
                    else if (path === '/api/rl/khongphi') r = B.datKhongPhi(!!body.on);
                    else if (path === '/api/rl/maxbet') r = B.datMaxBet(body.maxBet);
                    else if (path === '/api/rl/ep') r = B.epKetQua(body.so);
                    else if (path === '/api/rl/epclear') r = B.huyEp();
                    else if (path === '/api/rl/epnhan') r = B.epNhan(body.nhan || {});
                    else if (path === '/api/rl/epnhanclear') r = B.huyEpNhan();
                    else return sendJSON(res, 404, { ok: false, error: 'Không có đường này' });
                    if (r && r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // ⚡ SIÊU TÀI XỈU: toàn bộ luật nằm ở SieuTaiXiu/ban.js
                if (path.indexOf('/api/stx/') === 0) {
                    const B = ctx.stx;
                    if (!B) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ Siêu Tài Xỉu' });
                    let r = null;
                    if (path === '/api/stx/on') r = B.datBatTat(!!body.on);
                    else if (path === '/api/stx/time') r = B.datGio(body.bet, body.nhan, body.nan);
                    else if (path === '/api/stx/tran') r = B.datTran(body.tran || {});
                    else if (path === '/api/stx/an') r = B.datMucAn(body.an);
                    else if (path === '/api/stx/thang') r = B.datThang(body.macDinh ? null : body.thang);
                    else if (path === '/api/stx/maxbet') r = B.datMaxBet(body.maxBet);
                    else if (path === '/api/stx/ep') r = B.epKetQua(body.d1, body.d2, body.d3);
                    else if (path === '/api/stx/epclear') r = B.huyEp();
                    else if (path === '/api/stx/epnhan') r = B.epNhan(body.nhan || {});
                    else if (path === '/api/stx/epnhanclear') r = B.huyEpNhan();
                    else return sendJSON(res, 404, { ok: false, error: 'Không có đường này' });
                    if (r && r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r });
                }
                // 🔔 17/09: báo cược Tài Xỉu về Discord cho chủ server
                if (path === '/api/tx/noti') {
                    if (!ctx.setTxNoti) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setTxNoti(body.id, body.on, body.min);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, id: r.id, on: r.on, min: r.min });
                }
                // 🃏 admin poker: ai được mở giải ở Poker/ (tiến trình riêng, đọc _pokerAdmin)
                if (path === '/api/poker/admin') {
                    if (!ctx.setPokerAdmin) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setPokerAdmin(body.ids);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ids: r.ids });
                }
                // 🃏 tab Poker (SUPER): bật/tắt tab trên web, đặt chip, bắt đầu, giải tán, tạm nghỉ.
                // Toàn bộ thao tác giải ở đây, trang người chơi không có nút admin.
                if (path === '/api/poker/on') {
                    if (!ctx.setPokerOn) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    return sendJSON(res, 200, ctx.setPokerOn(!!body.on));
                }
                if (path.startsWith('/api/poker/') && ctx.pokerQuanLy) {
                    const Q = ctx.pokerQuanLy;
                    const r = path === '/api/poker/chip' ? Q.datChip(body.chipDau)
                        : path === '/api/poker/batdau' ? Q.batDau()
                        : path === '/api/poker/giaitan' ? Q.giaiTan()
                        : path === '/api/poker/nghi' ? Q.tamNghi('admin')
                        : path === '/api/poker/tiep' ? Q.choiTiep()
                        : null;
                    if (r === null) return sendJSON(res, 404, { ok: false, error: 'Không có đường này' });
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, ...r, tomTat: Q.tomTat() });
                }
                // ===== 🀄 TIẾN LÊN =====
                if (path === '/api/tienlen/admin') {
                    if (!ctx.setTienlenAdmin) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setTienlenAdmin(body.ids);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                if (path === '/api/tienlen/on') {
                    if (!ctx.setTienlenOn) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    return sendJSON(res, 200, ctx.setTienlenOn(!!body.on));
                }
                // 🀄 Tiến Lên giờ có NHIỀU PHÒNG -> đường phải kèm mã phòng:
                //    /api/tienlen/<ma>/cauhinh | /batdau | /giaitan      · /api/tienlen/tao
                if (path.startsWith('/api/tienlen/') && ctx.tienlenQuanLy) {
                    const Q = ctx.tienlenQuanLy;
                    if (path === '/api/tienlen/tao') {
                        const r = Q.taoPhong(String(body.cheDo || ''), body.mucCuoc, null);
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        ctx.writeLog('ADMIN', `[PANEL TIẾN LÊN] Mở phòng ${r.ma} · ${body.cheDo} · cược ${body.mucCuoc}`);
                        return sendJSON(res, 200, { ok: true, ma: r.ma, tomTat: Q.tomTat() });
                    }
                    const m = path.match(/^\/api\/tienlen\/([A-Za-z0-9_-]+)\/(cauhinh|batdau|giaitan)$/);
                    if (m) {
                        const q = Q.cua(m[1]);
                        if (!q) return sendJSON(res, 404, { ok: false, error: 'Phòng ' + m[1] + ' không còn nữa' });
                        const r = m[2] === 'cauhinh' ? q.datCauHinh(body || {})
                            : m[2] === 'batdau' ? q.batDau() : q.giaiTan();
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        return sendJSON(res, 200, { ok: true, ...r, tomTat: Q.tomTat() });
                    }
                    return sendJSON(res, 404, { ok: false, error: 'Không có đường này' });
                }
                if (path === '/api/tx/notitest') {
                    if (!ctx.txNotiTest) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = await ctx.txNotiTest();
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, { ok: true, kieu: r.kieu });
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
                // 🏆 09/09: luật ăn hũ theo cược (x mult) + trần hũ (0 = vô hạn) - Dò Mìn/Leo Thang, SUPER
                if (path === '/api/pot/cfg') {
                    if (!ctx.setPotCfg) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setPotCfg(String(body.key || ''), { mults: body.mults });
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // 🎯 14/09: đặt THẲNG số tiền trong hũ (khác /api/pot/add là cộng thêm)
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
                // ---- BẢNG KẾT QUẢ PHI THUYỀN ----
                if (path === '/api/spm/board/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    if (!ctx.startSpmBoard) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    try {
                        const name = await ctx.startSpmBoard(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Đăng bảng Phi Thuyền tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) {
                        return sendJSON(res, 400, { ok: false, error: e.message });
                    }
                }
                if (path === '/api/spm/board/stop') {
                    if (ctx.stopSpmBoard) ctx.stopSpmBoard();
                    ctx.writeLog('ADMIN', `[PANEL] Gỡ bảng Phi Thuyền`);
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
                // 🎫 3 mốc giá vé bánh vòng 1 (04/09)
                if (path === '/api/wheel/prices') {
                    if (!ctx.setWheelPrices) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    const r = ctx.setWheelPrices(body.prices);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    ctx.writeLog('ADMIN', `[PANEL] Vòng quay: 3 mốc giá vé ${r.prices.join('/')}`);
                    return sendJSON(res, 200, { ok: true, prices: r.prices });
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
                // 🍀 09/09: ép QUÀ hộp may mắn kế tiếp (dựng kịch bản test)
                if (path === '/api/lucky/force') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    if (!ctx.setForcedLucky) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const key = String(body.key || '').trim(), prize = String(body.prize || '').trim();
                    if (!key) return sendJSON(res, 400, { ok: false, error: 'Thiếu người chơi' });
                    // 17/09: thêm 'none' (🍂 Hụt) - đã vào lại bảng quà Dò Mìn nên phải ép được
                    if (!['shield', 'dig', 'cash', 'rocket', 'jackpot', 'dbl', 'scout', 'refund', 'none'].includes(prize)) return sendJSON(res, 400, { ok: false, error: 'Quà không hợp lệ' });
                    ctx.setForcedLucky(key, prize);
                    ctx.writeLog('ADMIN', `[PANEL ÉP HỘP 🍀] ${key} -> ${prize}`);
                    return sendJSON(res, 200, { ok: true });
                }
                // 🎚️ 09/09: sàn cược Dò Mìn/Leo Thang
                if (path === '/api/games/minbet') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    if (!ctx.setMinBet) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setMinBet(body.minBet);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // 🔁 09/09: cầu KNB web ↔ game (rut / nap)
                if (path === '/api/dogbridge/daymax') {   // 📅 11/09: hạn chuyển mỗi người/chiều/ngày (SUPER)
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    if (!ctx.setDogBridgeDayMax) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setDogBridgeDayMax(body.dayMax);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    if (body.vangDayMax !== undefined && ctx.setDogVangDayMax) {   // 🪙 29/09 hạn riêng đổi vàng
                        const vr = ctx.setDogVangDayMax(body.vangDayMax);
                        if (vr.error) return sendJSON(res, 400, { ok: false, error: vr.error });
                        r.vangDayMax = vr.vangDayMax;
                    }
                    return sendJSON(res, 200, r);
                }
                if (path === '/api/dogbridge/open') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    if (!ctx.setDogBridge) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setDogBridge(String(body.key || ''), !!body.open);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                // ⏸️ 09/09: mở/đóng Dò Mìn + Leo Thang
                if (path === '/api/games/open') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    if (!ctx.setGameOpen) return sendJSON(res, 503, { ok: false, error: 'Bot chưa hỗ trợ' });
                    const r = ctx.setGameOpen(String(body.key || ''), !!body.open);
                    if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                    return sendJSON(res, 200, r);
                }
                if (path === '/api/lucky/clear') {
                    if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền' });
                    if (ctx.clearForcedLucky) ctx.clearForcedLucky(String(body.key || '').trim());
                    return sendJSON(res, 200, { ok: true });
                }

                // ---- ĐIỂM ----
                if (path === '/api/points/set') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount)) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
                    // Set tăng số dư cũng là "thêm tiền" - tính vào trần ngày (nếu chưa mở khóa #)
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
                // ---- RÚT KNB ----
                if (path === '/api/withdraw/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startWithdraw(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo kênh Rút KNB tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/withdraw/stop') {
                    ctx.stopWithdraw();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng kênh Rút KNB`);
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
                // Chỉnh hạn mức/trần/phí vay (27/08) - lưu _loanCfg, bảng đăng lại mới đổi text
                if (ctx.setLoanCfg && path === '/api/loan/cfg') {
                    const r = ctx.setLoanCfg(body);
                    ctx.writeLog('ADMIN', `[PANEL] Cấu hình vay: ngày ${r.dailyMax}, trần ${r.cap}, phí vay + lãi ${r.feePct}%/ngày`);
                    return sendJSON(res, 200, { ok: true, cfg: r });
                }
                // Admin ghi nợ tay: KHÔNG trần (số âm = giảm nợ đã ghi); 04/09 nợ này cũng đẻ lãi ngày
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
                // Kênh + role thông báo khi phát KNB toàn server (đổi Discord mới
                // chỉ cần lưu lại ở đây, không phải sửa code)
                if (path === '/api/giveaway/config') {
                    const channelId = String(body.channelId || '').trim();
                    const roleId = String(body.roleId || '').replace(/\D/g, '');
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    if (!ctx.setGiveawayConfig) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    try {
                        const name = await ctx.setGiveawayConfig(channelId, roleId);
                        ctx.writeLog('ADMIN', `[PANEL] Kênh thông báo phát KNB: #${name}${roleId ? ` + tag role ${roleId}` : ' (không tag role)'}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                // Reset điểm danh cả danh sách - ai cũng /diemdanh nhận thưởng lại được ngay
                if (path === '/api/points/reset-daily') {
                    if (!ctx.resetAllDaily) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    const count = ctx.resetAllDaily();
                    ctx.writeLog('ADMIN', `[PANEL] Reset điểm danh cho ${count} ví`);
                    return sendJSON(res, 200, { ok: true, count });
                }
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

                // 🐉 08/10: Custom Trùng Lâu dòng mới -> panel GM /api/trunglau (đọc: xem / giu; ghi: mon / xoa / hu / tra / restart - chỉ SUPER)
                if (path === '/api/gm/trunglau') {
                    try {
                        const op = String(body.op || 'xem');
                        let j;
                        if (op === 'xem') j = await gmCall('GET', '/api/trunglau');
                        else if (op === 'giu') j = await gmCall('GET', '/api/trunglau/giu');
                        else if (['mon', 'xoa', 'chep', 'hu', 'tra', 'restart'].includes(op)) {   // 08/10: chep = 📋 chép dòng Thường sang Chân
                            if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Chỉ cổng SUPER được chỉnh Trùng Lâu' });
                            const who = 'SUPER ' + String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
                            j = await gmCall('POST', '/api/trunglau', { op, id: String(body.id || ''), dong: body.dong, diem: body.diem, hu: body.hu, ai: who });
                            if (j && j.ok) ctx.writeLog('ADMIN', `[TRÙNG LÂU] ${who} ${op} ${body.id || ''}: ${String(j.msg || '').slice(0, 220)}`);
                        } else return sendJSON(res, 400, { ok: false, error: 'op không hợp lệ' });
                        return sendJSON(res, j && j.ok ? 200 : 502, j || { ok: false, error: 'panel GM không trả lời' });
                    } catch (e) {
                        return sendJSON(res, 502, { ok: false, error: String(e.message).slice(0, 200) });
                    }
                }
                // 🛠️ GM Thiên Long (29/09): chuyển tiếp sang panel GM nội bộ
                if (path === '/api/gm/state' || path === '/api/gm/items' || path === '/api/gm/pets' || path === '/api/gm/act' || path === '/api/gm/doche' || path === '/api/gm/amkhi') {
                    try {
                        let j;
                        if (path === '/api/gm/state') j = await gmCall('GET', '/api/state');
                        else if (path === '/api/gm/items') j = await gmCall('GET', '/api/items?q=' + encodeURIComponent(String(body.q || '').slice(0, 80)));
                        else if (path === '/api/gm/pets') j = await gmCall('GET', '/api/pets');
                        else if (path === '/api/gm/amkhi') j = await gmCall('GET', '/api/amkhi');   // 🗡️ 04/10: trọng số tẩy 3 dòng ám khí (chỉ đọc; áp/trả qua /api/gm/act)
                        else if (path === '/api/gm/doche') j = await gmCall('GET', '/api/doche');   // 🧵 02/10: mẫu đồ chế 8x/9x (chỉ đọc; áp/trả đi qua /api/gm/act - chỉ SUPER)   // 30/09: nhom pet cho o chon (V2 / 12000 / tat ca)
                        else {
                            const form = {};
                            for (const [k, v] of Object.entries(body || {})) if (/^[a-z_]{1,12}$/.test(k)) form[k] = String(v).slice(0, 80);
                            const ganUid = /^\d{15,20}$/.test(String(form.uid || '')) ? String(form.uid) : '';
                            delete form.uid;
                            j = await gmCall('POST', '/api/act', form);
                            // 🎮 30/09: tạo tài khoản game kèm Discord ID -> gắn ví luôn (đăng nhập web bằng tài khoản game + Discord hiện lại mật khẩu)
                            if (j && j.ok && j.done && form.a === 'tao_tk' && ganUid && ctx.getDb()[ganUid]) {
                                const u = ctx.getUserData(ganUid);
                                u.gameAcc = String(form.ten || '').toLowerCase(); u.gamePass = String(form.mk || '');
                                ctx.saveDbNow();
                                ctx.writeLog('ADMIN', `[GM] tài khoản game ${u.gameAcc} gắn ví Discord ${ganUid} (${u.name || ''})`);
                                j = { ...j, msg: j.msg + ' - đã gắn ví Discord ' + (u.name || ganUid) };
                            }
                            if (j && j.ok) ctx.writeLog('ADMIN', `[GM] ${form.a || '?'} ${form.guid || form.ten || ''} ${form.loai || ''} ${form.gt || ''} -> ${String(j.msg || '').slice(0, 160)}`);
                        }
                        return sendJSON(res, j && j.ok ? 200 : 502, j || { ok: false, error: 'panel GM không trả lời' });
                    } catch (e) {
                        return sendJSON(res, 502, { ok: false, error: String(e.message).slice(0, 200) });
                    }
                }
                // 💥 29/09: Drop Boss - sua bang roi do cua game (ghi thang file VPS, hieu luc sau restart)
                if (path === '/api/drop/state' || path === '/api/drop/box' || path === '/api/drop/boss' || path === '/api/drop/clone' || path === '/api/drop/log' || path === '/api/drop/rollback') {
                    let drop;
                    try { drop = require('./dropboss'); } catch (e) { return sendJSON(res, 503, { ok: false, error: 'dropboss.js loi: ' + e.message }); }
                    if (!require('fs').existsSync(drop.F_MDB)) return sendJSON(res, 503, { ok: false, error: 'Không thấy file game - tính năng này chỉ chạy trên VPS game' });
                    try {
                        if (path === '/api/drop/state') return sendJSON(res, 200, { ok: true, ...drop.state(require('./tlbb').items()) });
                        // 📜 29/09: lịch sử sửa Drop Boss (có IP) - CHỈ cổng SUPER
                        if (path === '/api/drop/log') {
                            if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                            const n = Math.max(1, Math.min(2000, Math.floor(Number(body.n)) || 200));
                            return sendJSON(res, 200, { ok: true, ...drop.auditTail(n, body.q) });
                        }
                        // cổng + IP ghi vào nhật ký dropboss-audit.jsonl (ghi TRƯỚC khi sửa file game)
                        const meta = { gate: epOk(req) ? 'SUPER' : 'thường', ip: req.headers['x-real-ip'] || req.socket.remoteAddress };
                        let r;
                        // ↩ 29/09: rollback 1 dòng nhật ký về trạng thái TRƯỚC lần sửa - CHỈ cổng SUPER
                        if (path === '/api/drop/rollback') {
                            if (!epOk(req)) return sendJSON(res, 403, { ok: false, error: 'Không có quyền (cần cổng SUPER)' });
                            r = drop.rollback(body, meta);
                        }
                        else if (path === '/api/drop/box') r = drop.saveBox(body, meta);
                        else if (path === '/api/drop/boss') r = drop.saveBossBoxes(body, meta);
                        else r = drop.cloneBox(body, meta);
                        if (r.error) return sendJSON(res, 400, { ok: false, error: r.error });
                        ctx.writeLog('ADMIN', '[DROP BOSS] ' + path.slice(10) + ' ' + JSON.stringify(body).slice(0, 200));
                        return sendJSON(res, 200, { ok: true, ...r });
                    } catch (e) { return sendJSON(res, 500, { ok: false, error: String(e.message).slice(0, 200) }); }
                }
                // 🧰 08/10: món Thương Phố được RÚT QUA RƯƠNG ÍCH KỶ (thuongpho.js cfg().ik) - tab 🛠️ GM Thiên Long. Chỉ SUPER (VIEWONLY_PATHS).
                if (path === '/api/tpik/state') {
                    if (!ctx.tpIk) return sendJSON(res, 503, { ok: false, error: 'Chưa nối Thương Phố' });
                    return sendJSON(res, 200, { ok: true, ds: ctx.tpIk.get() });
                }
                // 🔄 08/10: thêm MỌI món trade được (bảng giá đồ bỏ vào Ghép Ngọc, giá > 0) vào danh sách - giữ món đang có
                if (path === '/api/tpik/sync') {
                    if (!ctx.tpIk || !ctx.ghepNgoc) return sendJSON(res, 503, { ok: false, error: 'Chưa nối Thương Phố / Ghép Ngọc' });
                    const truoc = ctx.tpIk.get().map(x => x.id);
                    const trade = ((ctx.ghepNgoc.state() || {}).bangGia || []).filter(x => x.gia > 0).map(x => String(x.id));
                    const ds = ctx.tpIk.set([...truoc, ...trade]);
                    ctx.writeLog('ADMIN', `[THƯƠNG PHỐ → RƯƠNG ÍCH KỶ] SUPER đồng bộ đồ trade Ghép Ngọc: ${truoc.length} -> ${ds.length} món`);
                    return sendJSON(res, 200, { ok: true, ds, them: ds.length - truoc.length });
                }
                if (path === '/api/tpik/save') {
                    if (!ctx.tpIk) return sendJSON(res, 503, { ok: false, error: 'Chưa nối Thương Phố' });
                    const truoc = ctx.tpIk.get().map(x => x.id);
                    const ds = ctx.tpIk.set(body.ids);
                    ctx.writeLog('ADMIN', `[THƯƠNG PHỐ → RƯƠNG ÍCH KỶ] SUPER đổi danh sách món: ${truoc.join(',') || '(trống)'} -> ${ds.map(x => x.id).join(',') || '(trống)'}`);
                    return sendJSON(res, 200, { ok: true, ds });
                }
                // 🧬 07/10: TẠO VÍ CHO CLONE - nhân vật phụ không có Discord nên không có ví để liên kết, đăng nhập web báo
                // "chưa gắn với ví Discord nào". Tạo ví mới (ID '99' + giờ, 15 số - Discord thật 17-19 số, không đụng), 0 KNB,
                // gắn nhân vật + cờ clone + gameAcc = tài khoản game của nhân vật -> đăng nhập web bằng tài khoản/mật khẩu game là vào.
                // Từ chối nếu tài khoản game đó đã có nhân vật gắn ví khác: đăng nhập tài khoản đó sẽ không biết vào ví nào.
                if (path === '/api/tlbb/taoclone') {
                    const q = String(body.name || '').trim().slice(0, 50);
                    if (!q) return sendJSON(res, 400, { ok: false, error: 'Nhập tên nhân vật clone (hoặc GUID)' });
                    let ch = null, rows = [];
                    try { ch = await ctx.tlbbFindChar(q); rows = ctx.tlbbListChars ? await ctx.tlbbListChars() : []; } catch (e) { return sendJSON(res, 500, { ok: false, error: 'Không đọc được danh sách nhân vật: ' + String(e.message).slice(0, 120) }); }
                    if (!ch) return sendJSON(res, 400, { ok: false, error: `Không có nhân vật "${q}" trong game (gõ đúng tên hoặc GUID)` });
                    const acc = String(ch.account || '').toLowerCase();
                    const guidCungAcc = new Set(rows.filter((r) => String(r.account || '').toLowerCase() === acc).map((r) => String(r.guid)));
                    const db = ctx.getDb();
                    for (const [k, v] of Object.entries(db)) {
                        if (k.startsWith('_') || !v || typeof v !== 'object') continue;
                        if (String(v.tlbbGuid || '') === ch.guid) return sendJSON(res, 400, { ok: false, error: `Nhân vật ${ch.name} đã gắn ví ${v.name || k} - tích 🧬 Clone ở dòng đó là được` });
                        if (acc && (String(v.gameAcc || '').toLowerCase() === acc || (v.tlbbGuid && guidCungAcc.has(String(v.tlbbGuid))))) {
                            return sendJSON(res, 400, { ok: false, error: `Tài khoản game "${ch.account}" đã có ví ${v.name || k} (nhân vật ${v.ingameName || '?'}) - clone phải là tài khoản game riêng` });
                        }
                    }
                    let id = '99' + Date.now();
                    while (db[id]) id = String(Number(id) + 1);
                    const u = ctx.getUserData(id);
                    u.points = 0; u.lastDaily = 0; u.name = ch.name + ' (clone)';
                    u.ingameName = ch.name; u.tlbbGuid = ch.guid; u.clone = true; u.gameAcc = acc;
                    ctx.saveDbNow();
                    ctx.writeLog('ADMIN', `[PANEL TLBB] Tạo ví CLONE ${id} ↔ nhân vật "${ch.name}" (GUID ${ch.guid}, tài khoản ${ch.account}) - chỉ Thương Phố`);
                    return sendJSON(res, 200, { ok: true, id, name: ch.name, guid: ch.guid, account: ch.account });
                }
                // 🔗 Liên kết ví ↔ nhân vật Thiên Long (tên hoặc GUID). Cầu KNB chỉ chạy cho ví đã gắn.
                // CHỈ admin đặt được (người chơi tự đặt là lỗ hổng: gắn nhân vật người khác rồi rút về ví mình).
                // Tên rỗng = hủy liên kết. (06/10: đổi tên route cũ của bản Palworld)
                if (path === '/api/tlbb/lienket') {
                    const uid = String(body.userId || '').trim();
                    if (!uid || !ctx.getDb()[uid]) return sendJSON(res, 400, { ok: false, error: 'Không tìm thấy ví này' });
                    // 29/09 NetCo4: nhập TÊN nhân vật Thiên Long (hoặc GUID) -> tra MySQL của game -> lưu tên + GUID
                    const q = String(body.name || '').trim().slice(0, 50);
                    const u = ctx.getUserData(uid);
                    // 🧬 07/10: body.clone (true/false) = ví CLONE - chỉ dùng Thương Phố, không túi boss. Không gửi = giữ nguyên.
                    if (!q) {
                        if (body.clone === true) return sendJSON(res, 400, { ok: false, error: 'Nhập tên nhân vật rồi mới tích Clone được' });
                        u.ingameName = ''; u.tlbbGuid = ''; delete u.clone;
                        ctx.saveDbNow();
                        ctx.writeLog('ADMIN', `[PANEL TLBB] Hủy liên kết nhân vật của ${uid}`);
                        return sendJSON(res, 200, { ok: true, name: '' });
                    }
                    let ch = null;
                    try { ch = await ctx.tlbbFindChar(q); } catch (e) { return sendJSON(res, 500, { ok: false, error: 'Không đọc được danh sách nhân vật: ' + String(e.message).slice(0, 120) }); }
                    if (!ch) return sendJSON(res, 400, { ok: false, error: `Không có nhân vật "${q}" trong game (gõ đúng tên hoặc GUID)` });
                    for (const [k, v] of Object.entries(ctx.getDb())) {
                        if (k !== uid && v && typeof v === 'object' && String(v.tlbbGuid || '') === ch.guid) {
                            return sendJSON(res, 400, { ok: false, error: `Nhân vật ${ch.name} đã liên kết với ví ${v.name || k}` });
                        }
                    }
                    u.ingameName = ch.name; u.tlbbGuid = ch.guid;
                    if (typeof body.clone === 'boolean') { if (body.clone) u.clone = true; else delete u.clone; }
                    ctx.saveDbNow();
                    ctx.writeLog('ADMIN', `[PANEL TLBB] Liên kết ${uid} ↔ nhân vật "${ch.name}" (GUID ${ch.guid}, tài khoản ${ch.account})${u.clone ? ' [CLONE - chỉ Thương Phố]' : ''}`);
                    return sendJSON(res, 200, { ok: true, name: ch.name, guid: ch.guid, clone: !!u.clone });
                }

                if (path === '/api/points/subtract') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
                    ctx.updatePoints(uid, -amount);
                    if (ctx.logDog) ctx.logDog('admin-', uid, (ctx.getDb()[uid]||{}).name || uid, -amount, 'panel: tru tay');
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Trừ ${amount} của ${uid} (rút KNB ra ngoài game)`);
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
                // Phát KNB cho TẤT CẢ ví + bot đăng thông báo tag role vào kênh thông báo
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
//  GIAO DIỆN (single-page) - vanilla JS, theme tối kiểu Discord
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
  /* CHỈ 3 MÀU NÚT (23/09). Thêm màu thứ 4 là panel loạn lại, đừng dựng lại btn-blue/btn-yellow.
     xanh lá = lưu / thêm / bật · đỏ = xoá / tắt / ép (việc nguy hiểm) · xám = phụ trợ */
  .btn-green{background:var(--green)} .btn-red{background:var(--red)} .btn-grey{background:#4e5058}
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
  /* THANH CHỌN gom nhóm 23/09: mỗi nhóm một hàng, nhãn nhóm nằm bên trái.
     Vẫn MỘT cú bấm tới mọi tab, nhóm chỉ để mắt quét cho nhanh, không phải menu 2 tầng. */
  .tabs{margin-bottom:16px}
  .grp{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px}
  .grp .glb{flex:0 0 92px;padding-top:13px;text-align:right;font-size:11px;font-weight:800;
            color:var(--mut);letter-spacing:.6px;white-space:nowrap}
  .grp .gbt{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap}
  .tabs button{background:var(--card);color:var(--mut)}
  .tabs button.active{background:var(--blue);color:#fff}
  /* 08/10: chức năng người chơi đang TẮT (khung 🔌) -> tab admin tương ứng ẩn luôn; nhóm trống ẩn cả nhãn */
  .tabs .featHide{display:none!important}
  /* 08/10: tab 🎁 Phát quà & GM - 3 mục (Phát quà / Cài đặt server / Công cụ) */
  .wrap:has(#tab-qua:not(.hidden)){max-width:1400px}
  .quaTop{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .quaTop h2{margin:0}
  .quaNav{display:flex;gap:6px;flex-wrap:wrap}
  .quaNav button{background:var(--card2);color:var(--mut);border:1px solid var(--line)}
  .quaNav button.on{background:var(--blue);color:#fff;border-color:var(--blue)}
  .quaGrid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}
  @media(max-width:1100px){.quaGrid{grid-template-columns:minmax(0,1fr)}}
  .quaAll{border:1px solid rgba(242,63,67,.45);background:linear-gradient(180deg,rgba(242,63,67,.08),transparent 70%),var(--card)}
  .quaAll h3{margin-top:0;color:#ff8a8d}
  .quaBar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .quaChk{display:inline-flex;align-items:center;gap:6px;margin:0;font-size:13px;color:var(--mut);white-space:nowrap}
  .quaChk input{margin:0}
  .quaTb{width:100%;border-collapse:collapse}
  .quaTb th{font-size:11.5px;color:var(--mut);text-align:left;font-weight:700;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
  .quaTb td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
  .quaTb tr.qOn td:first-child{box-shadow:inset 3px 0 0 var(--green)}
  .quaTb .qNm b{font-size:14px}
  .quaTb .qNm small{display:block;color:var(--mut);font-size:11.5px;margin-top:2px}
  .qDot{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;white-space:nowrap}
  .qDot i{width:8px;height:8px;border-radius:50%;background:#5c6070;display:inline-block}
  .qDot.on i{background:var(--green);box-shadow:0 0 6px var(--green)}
  .qDot.on{color:var(--green);font-weight:700}
  .qCho{font-size:12px;line-height:1.5;max-width:220px}
  .qCho .qChoN{display:inline-block;background:rgba(240,177,50,.15);color:var(--yellow);border-radius:999px;padding:1px 8px;font-weight:700;margin-bottom:3px}
  .quaSet{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
  .quaTile{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--card2)}
  .quaTile .qT{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800;margin-bottom:8px}
  .quaTile .qH{font-size:12.5px;color:var(--mut);margin-top:8px;line-height:1.5}
  .qBadge{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;white-space:nowrap}
  .qBadge.rs{background:rgba(242,63,67,.15);color:#ff8a8d}
  .qBadge.ok{background:rgba(35,165,90,.15);color:#5fd38d}
  .quaSave{position:sticky;bottom:0;background:var(--card);padding:12px 0 2px;margin-top:12px;border-top:1px solid var(--line)}
  .quaTool{border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--card2)}
  .quaTool .qT{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-weight:800;margin-bottom:6px}
  .quaTool .qT .muted{flex-basis:100%;font-weight:400;font-size:12.5px;line-height:1.55}
  .quaFind{position:sticky;top:10px}
  /* màn hẹp: nhãn nhóm xuống dòng riêng cho khỏi bóp mất chỗ của nút */
  @media(max-width:820px){
    .grp{display:block;margin-bottom:12px}
    .grp .glb{display:block;flex:none;text-align:left;padding:0 0 5px}
  }
  .card{background:var(--card);border-radius:14px;padding:18px;margin-bottom:16px}
  /* 29/09 NetCo4: thẻ Shop Item nở ra gần hết màn hình (khung .wrap chỉ 840px nên bảng phải kéo ngang) */
  @media(min-width:1000px){
    #shopCard,#dropCard{position:relative;left:50%;transform:translateX(-50%);width:min(1700px,calc(100vw - 32px))}
    #itemShopTable{table-layout:auto}
    #itemShopTable td:nth-child(3),#itemShopTable td:nth-child(7){width:auto}
    #itemShopTable .isf-name{width:100%!important;min-width:160px}
    #itemShopTable .isf-note{width:100%!important;min-width:240px}
  }
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
  /* ===== BỘ KHUNG CHUNG CHO CẢ PANEL (23/09) =====
     Trước đây mỗi tab tự bịa cỡ chữ + khoảng cách nên nhìn như mấy phần mềm khác nhau.
     Khoảng cách chỉ 3 mức: 8 (trong khối) · 14 (giữa phần) · 22 (giữa khối).
     ⚠️ Thêm khối cài đặt mới thì DÙNG LẠI mấy lớp này, đừng dán style vào thẻ. */
  h2{margin:0 0 4px;font-size:19px}
  .sub{font-size:13px;font-weight:400;color:var(--mut)}
  /* 37 thẻ h3 trước đây ăn cỡ mặc định của trình duyệt (to đùng, thưa, lệch nhau) */
  h3{margin:0 0 8px;font-size:14.5px;font-weight:700;color:var(--txt);letter-spacing:.2px}
  /* mỗi KHỐI cách nhau 22px + một vạch mảnh; khối đầu trong thẻ không có vạch */
  .blk{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}
  .blk:first-of-type{margin-top:0;padding-top:0;border-top:0}
  /* một ô cài đặt: tự co, nhưng không bóp hẹp tới mức đọc không ra nhãn */
  .fld{flex:1 1 180px;min-width:0}
  /* dòng "đang chạy", MỌI khối dùng đúng kiểu này, đúng chỗ này (ngay trên hàng nút) */
  .stat{font-size:12.5px;color:var(--mut);margin-top:8px;line-height:1.5}
  .stat b{color:var(--txt);font-weight:700}
  .stat:empty{display:none}
  /* hàng nút cuối khối: nút chính bên trái, nút phụ bên phải */
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .acts button{flex:0 0 auto}
  .acts .wide{flex:1 1 auto}
  /* công tắc bật/tắt - một dải bấm được cả hàng, không phải ô vuông tí xíu */
  .sw{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;
      background:var(--card2);border:1px solid var(--line);cursor:pointer;user-select:none}
  .sw input{flex:0 0 auto;width:18px;height:18px;margin:0;accent-color:var(--green);cursor:pointer}
  .note{margin-top:8px}
  .quick{margin-top:8px}
  .quick button{background:#4e5058;font-size:13px;padding:8px 12px}
  .preview{margin-top:8px}
  textarea{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px;
           padding:10px 12px;border-radius:8px;border:1px solid var(--line);
           background:var(--card2);color:var(--txt);margin-top:6px}
  /* 08/09: toast XẾP CHỒNG (nhiều tin cùng lúc không đè nhau), hiện lâu theo độ dài chữ,
     lỗi viền đỏ + ở lâu hơn, thành công viền xanh, bấm vào là tắt. Trước đây 1 ô duy nhất
     1.8s là biến - admin phải F12 mới đọc kịp kết quả giao đồ. */
  #toasts{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;z-index:80;max-width:min(92vw,720px);pointer-events:none}
  .toast{background:#0b0f1a;color:#fff;padding:10px 18px;border-radius:9px;border:1px solid #2a3146;box-shadow:0 6px 24px rgba(0,0,0,.45);font-size:14px;line-height:1.35;opacity:0;transform:translateY(8px);transition:.25s;pointer-events:auto;cursor:pointer;max-width:100%;word-break:break-word}
  .toast.show{opacity:1;transform:none}
  .toast.err{border-color:#e5484d;background:#2a1215}
  .toast.ok{border-color:#3dd68c;background:#0f2a1c}
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
  /* 04/09: cổng admin thường - 2 tab 👥/🐉 CHỈ XEM: khoá mọi ô nhập/nút (kể cả hàng
     render động sau này vì là CSS), chừa ô 🔍 tìm kiếm. Server cũng chặn 403 song song. */
  body.viewonly #tab-user input,body.viewonly #tab-user button,body.viewonly #tab-user select,
  body.viewonly #tab-tlbb input,body.viewonly #tab-tlbb button,body.viewonly #tab-tlbb select{pointer-events:none;opacity:.4}
  body.viewonly #tab-user #search{pointer-events:auto;opacity:1}
  /* 29/09 NetCo4: cổng admin THƯỜNG được sửa SHOP (server đã mở 4 route shop) - chỉ thẻ này mở khoá */
  body.viewonly #tab-tlbb #shopCard input,body.viewonly #tab-tlbb #shopCard button,body.viewonly #tab-tlbb #shopCard select,body.viewonly #tab-tlbb #shopCard label{pointer-events:auto;opacity:1}
.pwOff{display:none!important} /* 29/09 NetCo4: muc Palworld da tat */
/* 📒 04/10: nhật ký - mỗi dòng 1 hàng gọn: giờ · icon · tên + chi tiết (cắt ...) · số tiền; bấm dòng = mở log gốc */
.nkRow{display:grid;grid-template-columns:64px 24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 10px 7px 8px;border-bottom:1px solid var(--line);border-left:3px solid transparent;font-size:13.5px;line-height:1.4;cursor:pointer}
.nkRow:hover{background:var(--card2)}
.nkRow.nk-xanh{border-left-color:#23a55a}.nkRow.nk-do{border-left-color:#f23f43}
.nkT{font-family:ui-monospace,Consolas,monospace;color:var(--mut);font-size:12px}
.nkI{text-align:center;font-size:15px}
.nkB{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--txt)}
.nkB b{color:#fff;font-weight:600;margin-right:6px}
.nkL2{color:var(--mut)}
.nkS{font-weight:700;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;min-width:64px}
.nk-xanh .nkS{color:#3ddc84}.nk-do .nkS{color:#ff6b6b}.nk-xam .nkS{color:var(--mut)}
.nkRaw{display:none;white-space:normal;overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--mut);margin-top:5px;padding:6px 8px;background:var(--bg);border-radius:6px}
.nkRow.mo .nkB,.nkRow.mo .nkL1,.nkRow.mo .nkL2{white-space:normal}.nkRow.mo .nkRaw{display:block}
#nkStats{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
/* 🎒 04/10: túi đồ boss bản chỉ xem (cổng mod) */
#tbxDs{display:flex;flex-direction:column;gap:6px;min-width:220px}
#tbxDs button{text-align:left;padding:8px 12px;font-size:13.5px}
.tbxRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px;background:var(--card2)}
.tbxHint{grid-column:1/-1;font-size:12px;color:var(--yellow)}
.tbxIds{display:flex;flex-wrap:wrap;gap:6px 16px;min-width:0}
.tbxMon{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;min-width:0}
.tbxNo{display:inline-block;width:32px;text-align:center}
.tbxSl{font-weight:700;font-size:15px;color:#fff;white-space:nowrap}
@media (max-width:700px){#tbxDs{flex-direction:row;flex-wrap:wrap;min-width:0}#tbxDs button{padding:6px 10px;font-size:13px}}
.nkStat{background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:5px 10px;font-size:12.5px}
.nkStat b{font-variant-numeric:tabular-nums}.nkStat .xanh{color:#3ddc84}.nkStat .do{color:#ff6b6b}
/* điện thoại: hàng trên = tên + cược, hàng dưới = kết quả (mỗi hàng tự cắt ...) - không mất phần BÙM/dừng như khi dồn 1 hàng */
@media (max-width:560px){.nkRow{grid-template-columns:42px minmax(0,1fr) auto;gap:6px;padding:7px 6px;font-size:13px}.nkI{display:none}.nkT .nkSec{display:none}
  .nkL1,.nkL2{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nkL2{font-size:12px;margin-top:1px}.nkL2 .nkMuiTen{display:none}}
.nkOn{outline:2px solid var(--green)}
#nkNgays button,#nkMucs button{padding:6px 10px;font-size:13px}
</style>
</head>
<body>

<div id="login">
  <div class="box">
    <h2>🔐 Đăng nhập</h2>
    <label>Mật khẩu quản trị</label>
    <input id="pw" type="password" placeholder="••••••••" autocomplete="current-password">
    <button class="btn-green" style="width:100%;margin-top:14px" onclick="login()">Vào</button>
    <div id="loginErr" class="muted" style="margin-top:10px;color:var(--red)"></div>
  </div>
</div>

<div id="app" class="hidden">
  <header>
    <div class="dot" id="connDot"></div>
    <strong>Bảng Điều Khiển</strong>
    <span id="connText" style="font-size:13px;font-weight:600"></span>
    <span id="holdText" style="font-size:12px;font-weight:700;color:var(--gold,#e6b13a)"></span>
    <span id="statusLine" class="muted" style="margin-left:auto;font-size:13px"></span>
    <button id="holdBtn" class="btn-grey" style="padding:6px 10px;font-size:12px" type="button" onclick="holdToggle()" title="Tạm dừng vẽ lại màn hình (để bôi chữ / copy / Ctrl+F). Dữ liệu vẫn tải, bấm lần nữa để chạy lại">⏸ Dừng cập nhật</button>
  </header>

  <div class="wrap">
    <div class="tabs">
      <!-- Xếp theo NHÓM VIỆC. Hai bàn Sic Bo đứng cạnh nhau (trước Siêu bị đẩy xuống
           cuối chỉ vì là tab SUPER). Nhóm nào cũng có ít nhất 1 nút luôn hiện, nên
           cổng thường không bao giờ thấy hàng trống. -->
      <div class="grp"><span class="glb">TRÒ CHƠI</span><div class="gbt">
        <button data-tab="tx" class="active" onclick="tab('tx')">🎲 Tài Xỉu</button>
        <button data-tab="stx" class="epOnly" style="display:none" onclick="tab('stx')">⚡ Siêu Tài Xỉu</button>
        <button data-tab="rl" class="epOnly" style="display:none" onclick="tab('rl')">🎡 Roulette</button>
        <button data-tab="mine" onclick="tab('mine')">💣 Dò Mìn</button>
        <button data-tab="stair" onclick="tab('stair')">🪜 Leo Thang</button>
        <button data-tab="bj" onclick="tab('bj')">🎡 Vòng Quay</button>
        <button data-tab="spm" onclick="tab('spm')">🚀 Phi Thuyền</button>
        <button data-tab="stock" onclick="tab('stock')">📈 Cổ phiếu</button>
        <button data-tab="poker" class="epOnly" style="display:none" onclick="tab('poker')">🃏 Poker</button>
        <button data-tab="tienlen" class="epOnly" style="display:none" onclick="tab('tienlen')">🀄 Tiến Lên</button>
      </div></div>
      <div class="grp"><span class="glb">NGƯỜI CHƠI</span><div class="gbt">
        <button data-tab="user" onclick="tab('user')">👥 Người chơi</button>
        <button data-tab="gift" onclick="tab('gift')">🎁 Quà tặng</button><button data-tab="gn" class="epOnly" style="display:none" onclick="tab('gn')">💎 Ghép Ngọc</button><button data-tab="vqx" style="display:none" onclick="tab('vqx')">🍀 Vòng quay</button><button data-tab="gnx" style="display:none" onclick="tab('gnx')">💎 Ghép Ngọc</button><button data-tab="br" onclick="tab('br')">📊 Bảng rơi</button><!-- 05/10: bản chỉ xem, chỉ cổng mod (modApp hiện) --><!-- 05/10: giá bán rương, chỉ SUPER --><!-- 02/10: mở cho mod (sửa quà + vòng quay; cấp lượt quay vẫn chỉ SUPER) -->
        <button data-tab="give" class="epOnly" style="display:none" onclick="tab('give')">📦 Kho đồ</button><!-- 05/10: bỏ pwOff - tab này là đồ THIÊN LONG (Giao vào game / 🧰 bỏ vào Rương Ích Kỷ), không phải Palworld -->
      </div></div>
      <div class="grp"><span class="glb">THIÊN LONG</span><div class="gbt">
        <button data-tab="gm" onclick="tab('gm')">🛠️ GM Thiên Long</button>
        <button data-tab="qua" onclick="tab('qua')">🎁 Phát quà &amp; GM</button>
        <button data-tab="drop" onclick="tab('drop')">💥 Drop Boss</button><button data-tab="tb" onclick="tab('tb')">🎒 Túi Boss</button><!-- 29/09: tạm mở cho mod cùng test; đóng lại = thêm class="epOnly" style="display:none" -->
        <button data-tab="tlbb" onclick="tab('tlbb')">🐉 Thiên Long &amp; KNB<span id="wdBadge" class="hidden"></span></button>
      </div></div>
      <div class="grp"><span class="glb">HỆ THỐNG</span><div class="gbt">
        <button data-tab="log" onclick="tab('log')">📜 Log</button>
      </div></div>
    </div>

    <!-- BIG SMALL -->
    <div id="tab-tx">
      <div class="card">
        <h2>🎲 Big Small</h2>
        <div class="muted" id="txInfo" style="font-size:13px;margin-bottom:10px"></div>
        <div class="row epOnly" style="display:none;align-items:center;gap:8px;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="txSimpleOn" style="width:auto;margin:0" onchange="txSimpleSave(this)"> 🎲 Bàn ĐƠN GIẢN: chỉ Tài/Xỉu/Chẵn/Lẻ, 1 ăn 1, bão tính theo tổng điểm, không quay nhân</label>
          <span class="muted" style="font-size:12px">bỏ tick = bàn 52 cửa như cũ (Siêu Tài Xỉu không liên quan)</span>
        </div>
        <div class="epOnly" style="display:none">
        <h3>🎲 Ép kết quả ván tới</h3>
        <div class="note" id="txBetsLive"></div>
        <div class="row" style="margin-top:14px">
          <div class="fld" style="max-width:110px"><label>Xúc xắc 1</label><select id="d1"></select></div>
          <div class="fld" style="max-width:110px"><label>Xúc xắc 2</label><select id="d2"></select></div>
          <div class="fld" style="max-width:110px"><label>Xúc xắc 3</label><select id="d3"></select></div>
        </div>
        <div class="preview" id="txPrev"></div>
        <div class="quick">
          <button onclick="setDice(6,6,4)">Tài + Chẵn (16)</button>
          <button onclick="setDice(6,5,4)">Tài + Lẻ (15)</button>
          <button onclick="setDice(1,2,3)">Xỉu + Chẵn (6)</button>
          <button onclick="setDice(1,2,2)">Xỉu + Lẻ (5)</button>
        </div>
        <div class="acts">
          <button class="btn-grey wide" onclick="txAutoForce()">🎯 Chọn xúc xắc cho nhà cái ĂN NHIỀU NHẤT</button>
        </div>
        <div class="acts">
          <button class="btn-red wide" onclick="txForce()">⚡ Ép kết quả ván tới</button>
          <button class="btn-grey" onclick="api('/api/tx/clear',{}).then(()=>{toast('Đã hủy ép');refresh()})">↩️ Huỷ ép</button>
        </div>
        <div class="note">Ép cứng 100% cho <b>lần khóa sổ kế tiếp</b>. ⚠️ Chỉ ăn nếu ép <b>lúc còn MỞ CƯỢC</b> (xem đồng hồ ở khung cược trên); khóa sổ rồi mới ép thì trôi sang ván sau. Nút 🎯 tự tính 3 xúc xắc khiến cửa đang gánh nhiều tiền nhất bị thua.</div>
        </div>
      </div>
      <div class="card">
        <h3>🎛️ Điều khiển bàn Big Small</h3>
        <label>Channel ID (kênh đăng bàn chơi)</label>
        <input id="txChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="txSaved"></div>
        <div class="row" style="margin-top:8px">
          <div style="flex:2"><input id="txSaveId" placeholder="Channel ID"></div>
          <div style="flex:3"><input id="txSaveNote" placeholder="Ghi chú"></div>
          <button class="btn-green" onclick="saveChannel('tx')">💾 Lưu kênh</button>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="txStart()">▶️ Bật / Tạo bàn mới</button>
          <button class="btn-red" onclick="txStop()">⏹️ Tắt bàn</button>
          <button class="btn-grey" onclick="chatDelete('txChannel',this)">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Lấy Channel ID: bật <b>Developer Mode</b> (Cài đặt Discord → Advanced) → chuột phải kênh → <b>Copy Channel ID</b>. "Bật" sẽ tạo bàn mới ngay trong kênh đó.</div>
        <div class="row blk">
          <div style="flex:1"><label>💰 Trần cược / người / ván (0 = không giới hạn)</label><input id="txMaxBet" type="number" min="0" placeholder="vd: 400000"></div>
          <button class="btn-green" onclick="txSaveMaxBet()">💾 Lưu trần mỗi người</button>
        </div>
        <div class="row blk">
          <div style="flex:1"><label>⏱️ Giây ĐẶT CƯỢC (5 - 600)</label><input id="txBetS" type="number" min="5" max="600" placeholder="vd: 35" oninput="txDirty(this)"></div>
          <div style="flex:1"><label>⚡ Giây HIỆN NHÂN (0 - 60)</label><input id="txNhanS" type="number" min="0" max="60" placeholder="vd: 4" oninput="txDirty(this)"></div>
          <div style="flex:1"><label>⏱️ Giây NẶN (6 - 300)</label><input id="txNanS" type="number" min="6" max="300" placeholder="vd: 20" oninput="txDirty(this)"></div>
          <button class="btn-green" onclick="txSaveTime()">💾 Lưu nhịp ván</button>
        </div>
        <div class="note" id="txTimeNow">Một ván = giây đặt cược + giây nặn. Đổi lúc nào cũng được; <b>ván đang chạy giữ nguyên mốc cũ</b>, ván sau mới theo số mới.</div>
        <div class="row blk">
          <div style="flex:1"><label>🔔 ID Discord nhận báo cược</label><input id="txNotiId" type="text" placeholder="ID người hoặc ID kênh" oninput="txDirty(this)"></div>
          <div style="flex:1"><label>Chỉ báo từ mức (0 = báo hết)</label><input id="txNotiMin" type="number" min="0" placeholder="vd: 5000" oninput="txDirty(this)"></div>
          <label style="display:flex;align-items:center;gap:6px;white-space:nowrap"><input id="txNotiOn" type="checkbox" onchange="txDirty(this)"> Bật báo</label>
          <button class="btn-green" onclick="txSaveNoti()">💾 Lưu</button>
          <button class="btn-grey" onclick="txTestNoti()">📨 Gửi thử</button>
        </div>
        <div class="blk">
          <h3>🎲 Trần cược từng cửa (bàn Sic Bo 52 cửa)</h3>
          <div class="row" id="txTranHang" style="flex-wrap:wrap;gap:8px"></div>
          <div class="note" id="txTranNow">Cửa trả càng cao thì trần càng thấp, cửa Bão trả tới 999:1 nên chỉ cho đặt 5.000/ván, không thì một ván xui mất gần 400 triệu. Các cửa cùng mức gom chung một ô: sửa một ô là cả nhóm nhảy theo.</div>
          <div class="acts"><button class="btn-green" onclick="txSaveTran()">💾 Lưu trần từng cửa</button></div>
        </div>
        <div class="row" style="margin-top:14px;align-items:flex-end">
          <div style="flex:1"><label>🎯 RTP - phần trăm trả lại người chơi (80 - 99)</label>
            <input id="txRTP" type="number" min="80" max="99" step="0.5" placeholder="vd: 95" oninput="txDirty(this)"></div>
          <div style="flex:0 0 auto"><button class="btn-green" onclick="txSaveRTP()">💾 Lưu RTP</button></div>
        </div>
        <div class="note" id="txRTPNote"></div>
        <div class="note">Hạ RTP = <b>ít ô được bốc hệ số nhân hơn</b>, nhà cái ăn dày hơn. Máy tự tính lại tần suất sáng đèn cho cả 48 cửa, KHÔNG đụng vào bảng trả gốc in trên bàn. Ván đang chạy đã bốc bảng nhân từ lúc khoá sổ nên không đổi giữa chừng.</div>
        <div class="blk">
          <label>🎰 Thang hệ số nhân, mỗi dòng một nhóm: <code>tên: hệ_số×độ_hiếm, ...</code></label>
          <textarea id="txThang" rows="13" spellcheck="false" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px" oninput="txDirty(this)"></textarea>
          <div class="row" style="margin-top:8px">
            <button class="btn-green" onclick="txSaveThang()">💾 Lưu thang nhân</button>
            <button class="btn-grey" onclick="txThangMacDinh()">↩️ Về mặc định</button>
          </div>
          <div class="note" id="txThangNote"></div>
          <div class="note"><b>Độ hiếm</b> là trọng số: số càng nhỏ càng ít ra. Ví dụ <code>200×45</code> và <code>999×1</code> nghĩa là x200 ra nhiều gấp 45 lần x999. Hệ số phải <b>tăng dần</b>, mỗi nhóm 2-12 bậc. Sửa xong máy <b>tự tính lại tần suất sáng đèn</b> theo RTP đang đặt nên nhà cái không lệch. ⚠️ Nâng <b>hệ số cao nhất</b> của nhóm nào thì nhớ hạ trần cược nhóm đó, vì thắng tối đa một ô = trần × hệ số cao nhất.</div>
        </div>
        <div class="note" id="txNotiNow">Có người đặt cược là bot nhắn cho bạn: ai, cửa nào, bao nhiêu, ván mấy, ví còn bao nhiêu. Điền <b>ID người</b> thì bot nhắn riêng, điền <b>ID kênh</b> thì bot đăng vào kênh - bot tự dò, không cần chọn. Ván đông người mà ngập tin thì đặt mức tối thiểu.</div>
        <div class="note">Tính TỔNG mọi cửa + mọi lần đặt của 1 người trong 1 ván (đặt lắt nhắt nhiều lần cũng không lách được). Áp cả web lẫn Discord; nút ALL IN tự kẹp về phần trần còn lại. Trần hiện lên bảng Discord + trang web.</div>
      </div>
      <!-- (📜 Lịch sử Big Small đã chuyển sang tab 📜 Log - 04/09) -->
    </div>

    <!-- DÒ MÌN -->
    <div id="tab-mine" class="hidden">
      <div class="card epOnly" style="display:none">
        <h3>🎛️ Dò Mìn - luật chơi (30/09)</h3>
        <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap">
          <span>RTP</span><input class="mini-in" id="mnRtp" type="number" min="50" max="100" step="0.5" style="width:80px"><span>%</span>
          <span style="margin-left:8px">Trần hệ số</span><input class="mini-in" id="mnMaxMult" type="number" min="0" style="width:80px"><span>x (0 = không trần)</span>
          <span style="margin-left:8px">Cược tối đa</span><input class="mini-in" id="mnMaxBet" type="number" min="0" style="width:120px"><span>KNB (0 = không giới hạn)</span>
          <label style="display:flex;align-items:center;gap:6px;margin-left:8px"><input type="checkbox" id="mnLucky" style="width:auto;margin:0"> 🍀 cho mua cỏ may mắn</label>
          <button class="btn-green mini" onclick="minesCfgSave(this)">💾 Lưu</button>
        </div>
        <div class="note">RTP = phần trả lại người chơi: 88% = nhà cái ăn 12% trên MỌI số mìn (hạ RTP là hạ thưởng 3 mìn lẫn các mức khác). Trần hệ số: hệ số dừng ở x này, web báo người chơi "chạm trần, nên dừng". Có hiệu lực cho ván MỚI.</div>
      </div>
      <div class="card">
        <h3>🏆 Bội số nổ hũ 🍀 (Dò Mìn · Leo Thang)</h3>
        <div class="stat" id="potInfo"></div>
        <div id="potRows"></div>
        <div class="note">Nổ ở trò nào ăn hũ trò đó, 2 hũ kia không suy suyển. Mỗi ván/lượt quay tự trích 5% tiền cược vào hũ của trò đó (<b>nhà cái bao, không thu thêm của người chơi</b>), <b>Dò Mìn/Leo Thang (09/09) KHÔNG còn hũ nuôi</b>: trúng 🏆 trong hộp 🍀 là bốc ngẫu nhiên 1 bội số trong danh sách (mặc định x10 / x15 / x20) NHÂN tiền cược, cộng trần ván như cũ, ván dừng ngay - nhà cái trả thẳng. Sửa danh sách ở ô bên dưới.</div>
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
          <button class="btn-grey" onclick="chatDelete('mineChannel',this)">🧹 Xóa chat bot</button>
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
        <!-- 🍀 09/09: ép quà hộp may mắn kế tiếp - dựng kịch bản test (ép khiên -> đạp mìn -> xem cảnh báo trần x2000) -->
        <div class="row" style="margin-top:10px;align-items:flex-end">
          <div style="flex:3"><label>🍀 Ép QUÀ hộp may mắn kế tiếp (cùng người chơi mục tiêu ở trên)</label>
            <select id="luckyPrize"><option value="shield">🛡️ Khiên</option><option value="dig">⛏️ Máy đào (Dò Mìn)</option><option value="rocket">🚀 Thang máy (Leo Thang)</option><option value="cash">💰 Lì xì</option><option value="jackpot">🏆 Nổ hũ</option><option value="dbl">🎲 Gấp đôi/không</option><option value="scout">🧭 La bàn</option><option value="refund">↩️ Hoàn vé cỏ</option><option value="none">🍂 Hụt (chỉ Dò Mìn)</option></select></div>
          <button class="btn-green" style="flex:2" onclick="luckyForce()">🍀 Ép quà hộp kế tiếp</button>
        </div>
        <div class="flist" id="luckyList"></div>
        <div class="note">⚠️ <b>25 ô grid (5×5):</b> Mìn ẩn, người chơi tự click trên web - đặt mìn chỉ <b>tăng xác suất</b> trúng, không ép 100%. Số ô đánh dấu (💣) sẽ là mìn chắc chắn; nếu họ chọn số mìn ít hơn thì chỉ lấy bấy nhiêu ô đầu tiên. Muốn dễ thua: đặt mìn ở các ô trên-trái (hay bấm trước).</div>
        <div class="flist" id="mineList"></div>
      </div>
      <!-- (📜 Lịch sử Dò Mìn đã chuyển sang tab 📜 Log - 04/09) -->
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
          <button class="btn-grey" onclick="chatDelete('stairChannel',this)">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Leo <b>10 tầng</b>, mỗi tầng <b>8 ô</b>, người chơi chọn <b>1–5 cầu lửa</b> mỗi tầng. Bấm trúng ô trống thì lên tầng, hệ số nhân thêm; trúng lửa là mất cược. Chơi trên web, mỗi ván xong bot đăng kết quả kèm bản đồ tháp về kênh này. Bot restart sẽ tự nối lại bảng cũ.</div>
      </div>
      <!-- (📜 Lịch sử Leo Thang đã chuyển sang tab 📜 Log - 04/09) -->
    </div>

    <!-- BLACKJACK -->
    <div id="tab-bj" class="hidden">
      <div class="card">
        <h3>🎡 Vòng Quay May Mắn (trên web - thay Blackjack)</h3>
        <div class="muted" id="whInfo" style="font-size:13px;margin-bottom:8px"></div>
        <label>Số người READY để vòng quay khởi động (1–50)</label>
        <input id="whMin" type="number" placeholder="vd: 3">
        <label style="margin-top:10px">🎫 3 mốc giá vé bánh vòng 1 (KNB) - tự sắp từ thấp tới cao</label>
        <div class="row" style="gap:6px">
          <input id="whP1" type="number" placeholder="8000">
          <input id="whP2" type="number" placeholder="9000">
          <input id="whP3" type="number" placeholder="10000">
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="whSaveMin()">💾 Lưu</button>
          <button class="btn-red" onclick="whReset()">🔄 Cho quay lại NGAY (reset lượt)</button>
        </div>
        <div class="note">HAI vòng: <b>vòng vé</b> (1 mũi tên) quay <b>MIỄN PHÍ</b> ra giá vé chung theo <b>3 mốc chỉnh ở trên</b> (04/09 mặc định 8.000/9.000/10.000) - vé chốt là trừ đúng giá đó mỗi người, ai không đủ bị mời ra (không mất gì, không mất lượt); rồi <b>vòng hệ số</b> (3 mũi tên 🟡🔵🟢 lệch 120°) nhân tiền vé - sàn x1.5 (buff 19/08, kỳ vọng ~x2.33), độc đắc <b>x10</b> bêu tên ở kênh nghiện. Vé chốt xong mà 60s không ai bấm thì tự quay (không giam vé). Mỗi người 1 lượt mỗi khung, <b>4 khung 6 tiếng</b> - reset <b>00:00, 06:00, 12:00, 18:00</b> - nút đỏ bên trên cho cả server quay lại ngay không cần đợi.</div>
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
        <h3>👥 Ai đang giữ lệnh - lời/lỗ TỨC THÌ</h3>
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

      <div class="card epOnly" style="display:none">
        <h3>🕹️ Can thiệp giá - KÍN, trôi từ từ (cổng SUPER)</h3>
        <div id="skDrift" class="note" style="display:none;margin-bottom:8px"></div>
        <label>Số GIÁ muốn cộng/trừ - vd giá đang 900, nhập <b>5</b> bấm ➖ là trôi về ~<b>895</b></label>
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
        <!-- Hai nút nói THẲNG phe nào thua - khỏi tự dịch dấu cộng trừ -->
        <div class="row" style="margin-top:10px">
          <button class="btn-red" style="flex:1;line-height:1.35" onclick="skPush(-1)">➖ TRỪ GIÁ<br><small>kéo XUỐNG · phe 🟢 MUA thua</small></button>
          <button class="btn-green" style="flex:1;line-height:1.35" onclick="skPush(1)">➕ CỘNG GIÁ<br><small>kéo LÊN · phe 🔴 BÁN thua</small></button>
        </div>
        <div id="skPushPrev" class="note" style="margin-top:8px;display:none"></div>
        <div class="note"><b>Nhắm MỘT NGƯỜI cụ thể</b>: bấm 💀 (cho thua) hoặc 🎁 (cho thắng) ngay cạnh tên họ ở bảng 👥 phía trên - panel tự chọn hướng kéo đúng, khỏi nghĩ. Nhớ là kéo giá ảnh hưởng CẢ SÀN: ai cùng phe cũng thua/thắng theo, phe kia thì ngược lại. Giá <b>trôi dần</b> trong số giây đã đặt, trộn với sóng tự nhiên - người chơi không nhận thông báo nào và vẫn kịp đóng lệnh giữa đường. Game cũng <b>tự tạo sóng ±10–15%</b> khoảng 40 phút một lần.</div>
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
            <label>Sức nặng lãi/lỗ (x) - 1 đồng giá × 1 CP = bấy nhiêu KNB</label>
            <input id="skPoint" type="number" min="1" max="20" placeholder="vd: 5">
          </div>
          <div style="flex:0 0 auto;display:flex;align-items:flex-end;padding-bottom:6px">
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="skWaveOn"> Nhốt giá trong band</label>
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1">
            <label>🌊 Đáy band - giá KHÔNG xuống dưới mức này (10–4000)</label>
            <input id="skWaveLow" type="number" step="10" placeholder="vd: 1000">
          </div>
          <div style="flex:1">
            <label>🌊 Trần band - giá KHÔNG lên trên mức này (10–4000)</label>
            <input id="skWaveHigh" type="number" step="10" placeholder="vd: 1300">
          </div>
        </div>
        <div class="note" id="skWaveNow" style="margin-top:4px"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="skSave()">💾 Lưu cấu hình</button>
          <button id="skOpenBtn" class="btn-red" onclick="skToggle()">⏸ Tạm đóng sàn</button>
        </div>
        <div class="note">Người chơi nhập <b>số KNB làm vốn</b> + chọn <b>khối lượng (đòn bẩy)</b>; vốn × đòn bẩy = số CP nắm giữ. <b>Sức nặng lãi/lỗ</b> nhân thẳng vào tiền - mỗi 1% giá đi = <b>đòn bẩy × sức nặng %</b> trên vốn. ⚠️ Tăng sức nặng thì hạ chênh mua–bán theo (mặc định 0,1%/chiều). Muốn siết rủi ro thì hạ <b>trần CP toàn sàn</b> hoặc <b>đòn bẩy tối đa</b>. <b>Chôn vốn</b>: vào lệnh phải giữ đủ giây mới đóng được, 0 là tắt. Sàn đóng <b>vẫn cho đóng lệnh</b>, chỉ chặn mở mới.</div>
      </div>
    </div>

    <div id="tab-spm" class="hidden">
      <div class="card">
        <h3>🚀 Phi Thuyền (crash game) <button id="spOpenBtn" class="btn-red" style="margin-left:10px;font-size:13px;padding:6px 12px" onclick="spToggle()">⏸ Tạm đóng Phi Thuyền</button></h3>
        <div class="note">Vòng chơi chung ở web. <b>House edge</b> = % nhà cái ăn dài hạn (RTP = 100−edge). <b>Tốc độ bay</b>: số nhân = e^(tốc độ·giây) - 0.14 thì x1→x2 ~5s, càng cao càng nhanh. <b>Hệ số tối đa</b>: bay hết ăn tới đây (kịch trần). <b>Cược tối đa/người</b>: khoá rủi ro nhà cái (max ăn 1 ván = cược × hệ số tối đa).</div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1"><label>Cửa cược (giây)</label><input id="spBetS" type="number" placeholder="8"></div>
          <div style="flex:1"><label>Tốc độ bay</label><input id="spGrowth" type="number" step="0.01" placeholder="0.14"></div>
          <div style="flex:1"><label>House edge (%)</label><input id="spEdge" type="number" step="0.5" placeholder="8"></div>
          <div style="flex:1"><label>Hệ số tối đa (x)</label><input id="spMaxMult" type="number" placeholder="200"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:1"><label>Cược tối thiểu</label><input id="spMinBet" type="number" placeholder="400"></div>
          <div style="flex:1"><label>Cược tối đa / người</label><input id="spMaxBet" type="number" placeholder="15000"></div>
          <div style="flex:1"><label>Hiện kết quả nổ (giây)</label><input id="spReveal" type="number" placeholder="4"></div>
          <label style="display:flex;align-items:center;gap:6px;flex:1"><input type="checkbox" id="spOpen" style="width:auto"> Mở game</label>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn-green" onclick="spSave()">💾 Lưu cấu hình</button></div>
        <div class="note" id="spNow">-</div>
        <div id="spSuper" class="epOnly blk" style="display:none">
          <div class="note">⚡ <b>NHÀ CÁI CAN THIỆP</b> - ép điểm nổ chuyến TỚI (chuyến đang bay không đổi được). Nhập x thấp (vd 1.10) để bào cả sàn, hoặc cao để thả cho ăn. Chỉ hiện ở cổng SUPER.</div>
          <div id="spLive" style="font-size:13px;margin:6px 0">-</div>
          <div class="row"><input id="spForce" type="number" step="0.1" min="1" placeholder="vd 1.10 (nổ sớm)" style="flex:2"><button class="btn-red" onclick="spForceCrash()">⚡ Ép điểm nổ</button></div>
        </div>
      </div>
      <div class="card">
        <h3>🎛️ Bảng kết quả Phi Thuyền trên Discord</h3>
        <div class="muted" id="spmBoardInfo" style="font-size:13px;margin-bottom:8px"></div>
        <label>Channel ID (kênh đăng bảng)</label>
        <input id="spmChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="spmSaved"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="spmBoardStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="spmBoardStop()">⏹️ Gỡ bảng</button>
          <button class="btn-grey" onclick="chatDelete('spmChannel',this)">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Sau mỗi chuyến NỔ, bảng tự khoe kết quả từng người (💰 thắng x… được … / 💥 NỔ x… thua hết …) kèm số dư, và có nút <b>🌐 Chơi Phi Thuyền trên web</b> phát link + mã PIN. Bảng tự đăng lại tối đa 1 phút/lần, bot restart tự nối lại bảng cũ.</div>
      </div>
    </div>

    <!-- (tab 📊 THỐNG KÊ đã bỏ 19/08) -->

    <!-- NGƯỜI CHƠI -->
    <!-- 💥 DROP BOSS -->
    <div id="tab-drop" class="hidden">
      <div class="card" id="dropCard">
        <h3>💥 Drop Boss - sửa đồ rơi của boss</h3>
        <div class="note">Mỗi boss có tối đa 20 <b>hộp rơi</b>; giết boss thì mỗi hộp bốc ra 1 món ngẫu nhiên trong hộp (BoxValue càng <b>nhỏ</b> so với Mvalue của boss thì hộp càng dễ rơi; 1 = gần như chắc chắn). Hộp có dấu <b>⚠</b> là dùng chung với quái thường - sửa nó là đổi cho tất cả, muốn chỉ đổi boss này thì bấm 🧬 Tách riêng. Mọi thay đổi <b>chỉ có hiệu lực sau khi RESTART game</b> (tab 🛠️ GM → Restart server).</div>
        <div class="row" style="margin-top:8px">
          <input id="dpQ" class="mini-in" style="width:260px" placeholder="tìm boss (tên không dấu / ID)" oninput="dropDraw()">
          <label style="display:flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="dpSp" checked style="width:auto;margin:0" onchange="dropDraw()"> chỉ boss xuất hiện trong game</label>
          <button onclick="dropLoad()">🔄 Tải lại</button>
          <button class="epOnly" style="display:none" onclick="dropLogToggle()">📜 Lịch sử sửa</button>
          <span class="muted" id="dpInfo">chưa tải</span>
        </div>
        <div id="dpLogBox" class="hidden" style="margin-top:10px;border:1px solid #3a4258;border-radius:10px;padding:10px;background:rgba(0,0,0,.18)">
          <div class="row">
            <b>📜 Lịch sử sửa Drop Boss</b>
            <input id="dpLogQ" class="mini-in" style="width:240px" placeholder="lọc: ID/tên boss, ID hộp, ID món, IP">
            <button class="mini" onclick="dropLogLoad('dp')">🔄 Tải</button>
            <span class="muted" id="dpLogInfo"></span>
          </div>
          <div class="note">Mỗi lần 💾 Lưu / gắn-gỡ hộp / 🧬 Tách riêng ghi 1 dòng: ai (cổng + IP), lúc nào, trước → sau. Ghi <b>trước</b> khi sửa file game (ghi nhật ký lỗi thì không lưu). File <code>/opt/tlbb-backup/dropboss-audit.jsonl</code> chỉ ghi thêm (chattr +a), không bị cắt như log_admin.txt. Chỉ cổng SUPER xem được.</div>
          <div id="dpLog" style="margin-top:8px;max-height:480px;overflow:auto"></div>
        </div>
        <div id="dpList" style="margin-top:10px;overflow-x:auto"></div>
      </div>
    </div>
    <div id="tab-tb" class="hidden"><!-- 🎒 01/10: Túi đồ boss -->
      <!-- 🎒 04/10: bản CHỈ XEM cho cổng mod (modApp ẩn thẻ sửa #tbSuaCard, hiện thẻ này) -->
      <div class="card hidden" id="tbXemCard">
        <h3>🎒 Túi đồ boss <span class="muted" style="font-size:12px;font-weight:400">đồ người chơi nhận khi hạ boss cuối · chỉ xem</span></h3>
        <div class="note">Hạ boss cuối → người chơi nhận 1 túi trên web, bấm <b>Nhận</b> để chuyển đồ vào game. Dòng <span style="color:var(--yellow)">🎲 ngẫu nhiên 1 trong…</span> = bốc 1 món trong nhóm đó. Số bên phải là số lượng.</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">
          <div id="tbxDs"><span class="muted">đang tải...</span></div>
          <div id="tbxCt" style="flex:1;min-width:260px"></div>
        </div>
      </div>
      <div class="card" id="tbSuaCard">
        <h3>🎒 Túi đồ boss - đồ người chơi nhận khi hạ boss cuối</h3>
        <div class="note">Chọn hoạt động bên trái, sửa bảng bên phải rồi bấm <b>💾 Lưu</b>. Áp cho túi <b>tạo sau khi lưu</b> (túi đã có giữ nguyên đồ đã bốc). Mỗi dòng: <b>1 ID</b> = món cố định; <b>nhiều ID cách nhau dấu phẩy</b> = mỗi cái bốc ngẫu nhiên 1 trong các ID (vd Miên Bố / Bí Ngân trộn). Số lượng <b>từ - đến</b> = ngẫu nhiên trong khoảng. <b>Trần/ngày</b> = số túi tối đa mỗi người mỗi ngày (0 = không giới hạn). KNB cộng vào ví web khi bấm Nhận. Mọi lần lưu ghi cổng + IP.</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">
          <div id="tbHd" style="min-width:220px;display:flex;flex-direction:column;gap:6px"><span class="muted">chưa tải</span></div>
          <div id="tbEd" style="flex:1;min-width:340px"></div>
        </div>
        <div style="margin-top:14px;border-top:1px solid #3a4258;padding-top:10px">
          <div class="row" style="gap:8px;flex-wrap:wrap"><b>🔍 Tìm vật phẩm</b><input id="tbQ" class="mini-in" style="width:240px" placeholder="gõ tên hoặc ID (vd miên bố)" onkeydown="if(event.key==='Enter')tbFind()"><button onclick="tbFind()">Tìm</button><span class="muted">bấm 1 kết quả = thêm vào dòng đang chọn (viền vàng)</span></div>
          <div id="tbRes" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>
        <div style="margin-top:14px"><b>📜 Lịch sử sửa</b><div id="tbLog" style="font-size:12px;margin-top:6px;max-height:240px;overflow:auto"></div></div>
      </div>
    </div>
    <div id="tab-gm" class="hidden">
      <div class="card">
        <h3>🛠️ GM Thiên Long - Server</h3>
        <div id="gmStatus" class="note">Đang tải...</div>
        <div class="row" style="margin-top:10px">
          <button onclick="gmLoad()">🔄 Tải lại</button>
          <button data-gm="go_ket" data-confirm="Gỡ kẹt đăng nhập cho TẤT CẢ tài khoản? (chỉ khởi động lại Login, người đang chơi không bị văng)">🩹 Gỡ kẹt đăng nhập (tất cả)</button>
          <button class="btn-red" data-gm="restart" data-confirm="RESTART server game? Người đang chơi sẽ bị ngắt khoảng 3 phút.">♻️ Restart server</button>
        </div>
        <div class="note">Gỡ kẹt = bị disconnect mà không vào lại được: chỉ khởi động lại Login, người đang chơi không bị văng. Restart: người online bị ngắt ~3 phút; đổi GM cần restart mới có hiệu lực.</div>
      </div>
      <div class="card">
        <h3>🏪 Thương Phố → 🧰 Rương Ích Kỷ <span class="muted" id="tpikN"></span></h3>
        <div class="note">Gắn <b>ID món</b> nào thì người chơi được bấm <b>Rút qua Rương Ích Kỷ</b> cho món đó trong Thương Phố (trống = không món nào). Đồ <b>🔒 cố định không bao giờ</b> được rút qua (rương tặng / Ghép Ngọc được). Lưu là có hiệu lực ngay.</div>
        <style>
          #tpikBox .tpkBar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
          #tpikBox .tpkBar input{background:#0f131c;border:1px solid #2c3a52;color:#e6ebf5;border-radius:8px;padding:7px 10px;font-size:13px}
          #tpikBox .tpkBar button{padding:7px 12px;font-size:13px;border-radius:8px}
          #tpikBox .tpkTabs{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 8px}
          #tpikBox .tpkTab{background:#151b28;border:1px solid #2c3a52;color:#c9d3e6;border-radius:999px;padding:4px 11px;font-size:12px;font-weight:700;cursor:pointer}
          #tpikBox .tpkTab.on{background:#2a2140;border-color:#8f6ff0;color:#e2d6ff}
          #tpikBox .tpkTab span{opacity:.65;margin-left:3px}
          #tpikBox .tpkGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px;max-height:430px;overflow:auto;padding-right:4px}
          #tpikBox .tpkIt{display:flex;align-items:center;gap:8px;background:#121825;border:1px solid #232d40;border-radius:9px;padding:5px 6px 5px 5px;min-width:0}
          #tpikBox .tpkIt:hover{border-color:#3a4a66}
          #tpikBox .tpkNm{flex:1;min-width:0}
          #tpikBox .tpkNm b{display:block;font-size:12.5px;font-weight:700;color:#e6ebf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          #tpikBox .tpkNm small{font-size:11px;color:#8a96ad}
          #tpikBox .tpkX{flex:0 0 auto;width:24px;height:24px;padding:0;border-radius:6px;border:1px solid transparent;background:transparent;color:#8a96ad;font-size:13px;line-height:22px;cursor:pointer}
          #tpikBox .tpkX:hover{background:#3a1d24;border-color:#7a3434;color:#ff9a9a}
          #tpikBox .tpkWarn{color:#ffb070;font-size:11px}
          #tpikBox .tpkEmpty{grid-column:1/-1;padding:18px;text-align:center;color:#8a96ad;border:1px dashed #2c3a52;border-radius:9px;font-size:12px}
        </style>
        <div id="tpikBox">
          <div class="tpkBar">
            <input id="tpikQ" style="flex:1 1 200px;min-width:160px" placeholder="🔎 Lọc theo tên hoặc ID" oninput="tpikVe()">
            <input id="tpikIn" style="flex:1 1 220px;min-width:180px" placeholder="Thêm ID (nhiều ID cách dấu phẩy)">
            <button class="btn-green" onclick="tpikThem()">➕ Thêm</button>
            <button onclick="tpikSync()" title="Thêm mọi món đang trade được trong Ghép Ngọc (giá đồ bỏ vào > 0), giữ món đang có">🔄 Đồng bộ đồ trade Ghép Ngọc</button>
            <button onclick="tpikLoad()">↻ Tải lại</button>
          </div>
          <div class="tpkTabs" id="tpikTabs"></div>
          <div class="tpkGrid" id="tpikDs"></div>
        </div>
      </div>
      <div class="card">
        <h3>👤 Tài khoản game <span class="muted" id="gmAccN"></span></h3>
        <div class="row">
          <input id="gmNewAcc" class="mini-in" style="width:170px" placeholder="tên đăng nhập (a-z 0-9 _)">
          <input id="gmNewPw" class="mini-in" style="width:170px" placeholder="mật khẩu (6-32 ký tự)">
          <input id="gmNewUid" class="mini-in" style="width:190px" placeholder="Discord ID gắn ví (tuỳ chọn)">
          <button class="btn-green" onclick="gmCreateAcc()">➕ Tạo tài khoản</button>
        </div>
        <div id="gmAccs" style="margin-top:10px;overflow-x:auto"></div>
      </div>
    </div>
    <div id="tab-qua" class="hidden"><!-- 🎁 08/10: tách khỏi 🛠️ GM Thiên Long thành tab riêng, chia 3 mục cho đỡ rối (chủ server). ID phần tử giữ nguyên: JS gm* dùng chung -->
      <div class="card">
        <div class="quaTop">
          <h2>🎁 Phát quà &amp; GM nhân vật <span class="muted" id="gmCharN"></span></h2>
          <div class="quaNav" id="quaNav">
            <button data-qsec="phat" onclick="quaSec('phat')">🎁 Phát quà</button>
            <button data-qsec="caidat" onclick="quaSec('caidat')">⚙️ Cài đặt server</button>
            <button data-qsec="congcu" class="epOnly" style="display:none" onclick="quaSec('congcu')">🧰 Công cụ</button>
          </div>
        </div>
      </div>
      <div id="qsec-phat" class="qsec">
        <div class="quaGrid">
          <div>
            <div class="card quaAll">
              <h3>📣 Gửi cho TẤT CẢ nhân vật</h3>
              <div class="muted" style="font-size:13px;margin-bottom:8px">Mọi nhân vật đều nhận, kể cả đang offline (nhận khi đăng nhập). Kiểm kỹ loại + số lượng trước khi bấm.</div>
              <div id="gmAllForm"></div>
            </div>
            <div class="card">
              <div class="quaBar">
                <h3 style="margin:0">👤 Từng nhân vật</h3>
                <input id="gmLocQ" class="mini-in" style="width:230px" placeholder="🔎 Lọc tên / tài khoản / GUID" oninput="gmLoc()">
                <label class="quaChk"><input id="gmLocOn" type="checkbox" onchange="gmLoc()"> chỉ online</label>
                <label class="quaChk"><input id="gmLocCho" type="checkbox" onchange="gmLoc()"> có quà đang chờ</label>
                <span class="muted" id="gmLocN" style="font-size:12.5px"></span>
              </div>
              <div id="gmChars" style="margin-top:10px;overflow-x:auto"></div>
              <div class="note">Quà vào túi khi nhân vật <b>đăng nhập hoặc đổi bản đồ</b> (đang online: dùng truyền tống / qua cổng). Túi đầy thì phần còn lại nhận lần sau. KNB tới 10 triệu/lần (tự chia dòng), Vàng tính theo vàng. Đổi GM cần restart.</div>
            </div>
          </div>
          <div>
            <div class="card quaFind">
              <h3 style="margin-top:0">🔎 Tìm ID vật phẩm</h3>
              <div class="row" style="flex-wrap:nowrap">
                <input id="gmQ" class="mini-in" style="flex:1;min-width:0" placeholder="vd: trung lau giap, nhan thach, 10553110" onkeydown="if(event.key==='Enter')gmSearch()">
                <button onclick="gmSearch()">Tìm</button>
              </div>
              <div class="muted" id="gmItemN" style="font-size:12px;margin-top:4px"></div>
              <div id="gmItems" style="margin-top:10px;max-height:62vh;overflow:auto"></div>
              <div class="note">Bấm vào ID để chép, rồi dán vào ô phát quà (không cần dấu khi tìm).</div>
            </div>
          </div>
        </div>
      </div>
      <div id="qsec-caidat" class="qsec hidden">
        <div class="card">
          <h3 style="margin-top:0">⚙️ Cài đặt toàn server</h3>
          <div class="quaSet">
            <div class="quaTile"><div class="qT">⬆️ Cấp tối thiểu <span class="qBadge ok">không cần restart</span></div>
              <input id="gmCapmin" class="mini-in" style="width:90px" oninput="gmDanhDau(this)">
              <div class="qH"><b>0 = tắt.</b> Nhân vật thấp hơn tự lên cấp khi đăng nhập / đổi bản đồ, kể cả nhân vật tạo sau này.</div></div>
            <div class="quaTile"><div class="qT">🔒 Cấp tối đa (khóa cấp) <span class="qBadge rs">cần restart</span></div>
              <input id="gmCapmax" class="mini-in" style="width:90px" type="number" min="10" max="119" oninput="gmDanhDau(this)">
              <div class="qH">Người chơi cày exp tối đa tới cấp này (10–119, 119 = mở hết). Nhân vật đã cao hơn giữ nguyên.</div></div>
            <div class="quaTile"><div class="qT">⚡ EXP toàn server <span class="qBadge rs">cần restart</span></div>
              <div class="row" style="flex-wrap:nowrap;gap:6px"><b>x</b><input id="gmExp" class="mini-in" style="width:90px" type="number" min="0.1" max="50" step="0.1" oninput="gmDanhDau(this)">
              <button onclick="gmExpMacDinh()">↩ Mặc định (x<span id="gmExpDef">?</span>)</button></div>
              <div class="qH">Hệ số EXP đánh quái cả server (ConfigInfo.ini ExpParam), 0.1–50. Deploy code sau vẫn giữ số này.</div></div>
            <div class="quaTile"><div class="qT">📘 Tâm pháp tối đa <span class="qBadge ok">không cần restart</span></div>
              <input id="gmTpmax" class="mini-in" style="width:90px" type="number" min="0" max="159" oninput="gmDanhDau(this)">
              <div class="qH">Người chơi <b>tự học</b> tâm pháp (tốn vàng + EXP) tới tối đa cấp này, 10–159, không phụ thuộc cấp nhân vật. <b>0 = luật gốc</b>: tối đa cấp nhân vật + 10 (tâm pháp thứ 8 tới 159). Không đặt sẵn cấp cho ai.<br>📜 <b>Chiêu môn phái mở theo tâm pháp</b>: tâm pháp lên tới đâu thì chiêu hiện ra tới đó, ở các mốc 1, 10, 20, 30, 40, 45, 50, 60. Tới 60 là đủ hết chiêu; trên 60 không thêm chiêu mới nhưng chiêu và thuộc tính mạnh dần theo cấp tâm pháp.</div></div>
          </div>
          <div class="row quaSave">
            <button class="btn-red" onclick="gmLuuChung()">💾 Lưu thay đổi</button>
            <button class="btn-grey" onclick="gmHuySua()">✖ Hủy thay đổi</button>
            <span id="gmSuaNote" class="muted"></span>
          </div>
        </div>
      </div>
      <div id="qsec-congcu" class="qsec hidden">
        <div class="card">
          <h3 style="margin-top:0">🧰 Công cụ <span class="muted" style="font-size:13px;font-weight:400">(chỉ cổng SUPER)</span></h3>
          <div class="quaTool">
            <div class="qT">
              <b>🧵 Mẫu đồ chế 8x/9x + Thái Cổ Thần Khí</b>
              <button class="btn-grey" onclick="mdLoad()">🔄 Tải</button>
              <span class="muted">Chọn dòng, số dòng, cấp phẩm chất cho 1 món chế (chỉ trong những gì món đó tự ra được). Áp mẫu → restart → chế + giám định (đồ chế) hoặc tẩy bằng <b>Ma Huyết Thạch 30505813</b> (Thái Cổ Thần Khí 9 sao) → <b>Trả mẫu</b> → restart. Đồ chế: số mỗi dòng ngẫu nhiên trong khoảng của cấp đã chọn. Thái Cổ: số cố định. Chốt lúc chế/tẩy, trả mẫu không đổi. Vũ khí chế không có trong danh sách (vũ khí đi đường thần khí). Trong lúc mẫu đang áp, <b>ai chế / tẩy món đó cũng ra y hệt</b>.</span>
            </div>
            <div id="mdBox" class="muted epOnly" style="display:none;margin-top:6px">Bấm 🔄 Tải để xem đồ chế 8x/9x (trừ vũ khí) và 108 Thái Cổ Thần Khí.</div>
          </div>
          <div class="quaTool">
            <div class="qT">
              <b>🗡️ Tẩy 3 dòng ám khí (Pháp bảo)</b>
              <button class="btn-grey" onclick="akLoad()">🔄 Tải</button>
              <span class="muted">Ám khí có 3 dòng kỹ năng học ở mốc cấp <b>40 / 70 / 90</b>. Khi người chơi tẩy kỹ năng (vật phẩm <b>30503118</b> + 50.000 tiền), game bốc lại theo <b>trọng số</b> dưới đây: tỉ lệ = trọng số ÷ tổng trọng số của dòng. Đổi trọng số → <b>restart</b> mới có hiệu lực, áp cho mọi lần tẩy / học kỹ năng sau đó (ám khí đã có giữ nguyên).</span>
            </div>
            <div id="akBox" class="muted epOnly" style="display:none;margin-top:6px">Bấm 🔄 Tải để xem 3 dòng ám khí.</div>
          </div>
          <div class="quaTool">
            <div class="qT">
              <b>🐉 Custom Trùng Lâu (dòng mới 10553100-10553114)</b>
              <button class="btn-grey" onclick="tlLoad()">🔄 Tải</button>
              <span class="muted">Chỉnh dòng thuộc tính + điểm từng mã, tỉ lệ dính / thời gian hiệu ứng toàn server, xem ai đang giữ / đang mặc. Có hiệu lực sau restart game.</span>
            </div>
            <div id="tlBox" class="epOnly" style="display:none;container-type:inline-size"></div>
          </div>
        </div>
      </div>
    </div>
    <div id="tab-tlbb" class="hidden">
      <div class="card">
        <h3>🎛️ Kênh KNB (bảng Discord)</h3>
        <label>Channel ID (kênh đăng bảng)</label>
        <input id="wdChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="wdStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="wdStop()">⏹️ Tắt</button>
        </div>
        <div class="note">Đăng 1 bảng vào kênh Discord với 2 nút: <b>🎮 Chuyển vào game</b> (trừ ví, KNB vào túi khi nhân vật đăng nhập / đổi bản đồ, tối đa 30.000/ngày) và <b>💬 Chuyển ra ví</b> (hướng dẫn tới NPC Ví Web trong game, không giới hạn). Sửa code xong bấm <b>Đăng lại</b>.</div>
      </div>
      <div class="card">
        <h3>🔗 Liên kết tên trong game</h3>
        <div class="note">Gắn ví mini game với <b>nhân vật Thiên Long</b>: gõ <b>tên nhân vật</b> (hoặc <b>GUID</b>) rồi Lưu, bot tra database game và điền GUID. Cầu KNB chỉ chạy cho ví đã gắn. 1 nhân vật chỉ gắn 1 ví; người chơi không tự gắn được (chống rút trộm). Để trống + Lưu = hủy liên kết.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0 10px;padding:8px;border:1px dashed #3a4a66;border-radius:8px">
          <b>🧬 Tạo ví cho clone</b>
          <input class="mini-in" id="lkCloneTen" placeholder="Tên nhân vật clone (hoặc GUID)" style="width:230px">
          <button class="mini btn-green" onclick="lkTaoClone()">➕ Tạo ví clone</button>
          <span class="muted" style="font-size:12px">Nhân vật phụ không có Discord: tạo ví 0 KNB, gắn sẵn nhân vật + tích Clone (chỉ dùng Thương Phố, không túi boss). Đăng nhập web bằng <b>tài khoản + mật khẩu game</b> của clone. Clone phải ở tài khoản game riêng.</span>
        </div>
        <div id="lienKetList"></div>
      </div>
      <!-- Hàng đợi đơn: từ khi bỏ cầu nối tự động (server Linux không có UE4SS),
           MỌI giao dịch với game đều nằm ở đây chờ admin xử lý tay trong game. -->
      <div class="card hidden pwOff" id="wdPendingCard">
        <h3>📨 Đơn đang chờ xử lý</h3>
        <div class="note"><b>🎮 Chuyển vào game</b>: ví đã trừ sẵn - bạn vào game ĐƯA KNB rồi bấm ✅. <b>💬 Chuyển ra Discord</b>: bạn vào game NHẬN KNB rồi bấm ✅ (lúc đó ví mới được cộng). ❌ Từ chối = hoàn ví nếu đã trừ.</div>
        <div id="wdPending"></div>
      </div>
      <div id="wdDone" class="hidden"></div>
      <div class="card" id="shopCard">
        <h3>🛒 Shop Item - đồ vào túi khi nhân vật đăng nhập / đổi bản đồ</h3>
        <div class="card">
          <h3>🏷️ Nhóm hàng trong shop</h3>
          <div class="muted" style="font-size:13px;margin-bottom:8px">Sửa tên nhóm (kèm emoji) hoặc thêm nhóm mới. Tên này hiện <b>cả trên web người chơi lẫn mọi ô chọn nhóm ở đây</b>.</div>
          <div id="icBody"></div>
          <div class="row" style="margin-top:10px">
            <button class="btn-grey" onclick="icAdd()">➕ Thêm nhóm</button>
            <button class="btn-green" onclick="icSave(this)">💾 Lưu nhóm</button>
          </div>
          <div class="note">🔒 = nhóm có luật riêng trong code (⭐ mua 1 lần · 🔥 Hàng giới hạn · 🏪 nhóm mặc định khi món chưa rõ nhóm) - đổi tên được, <b>xoá thì không</b>. Nhóm đang có món cũng không xoá được: đổi nhóm cho mấy món đó trước đã. <b>Mã nhóm</b> (chữ xám) là thứ lưu trong từng món - server tự đặt, không sửa được, đổi là món mất nhóm.</div>
        </div>
        <div class="note">🎁 Quà admin tặng đã chuyển sang tab riêng <b>🎁 Quà tặng</b> cạnh Kho đồ (danh sách riêng, không dính shop) - đừng tạo quà ở đây nữa. Người chơi mua ở web (👤 HỒ SƠ → 🛒 Shop Item) + số lượng → bot đưa vào túi khi nhân vật đăng nhập / đổi bản đồ. <b>Mã item</b> = ID vật phẩm Thiên Long (tra ở tab 🛠️ GM Thiên Long, bấm ID để chép). <b>Nhóm</b> quyết định món nằm mục nào trên web (sửa tên nhóm ở bảng 🏷️ phía trên). <b>Hình</b>: bấm <b>📷 Up</b> chọn ảnh từ máy là xong - ảnh lưu vào <code>assets/itemimage/</code> và dùng được NGAY, không cần restart (trống = ô 📦). Sửa xong bấm 💾 Lưu shop.</div>
        <div class="row" style="margin-top:8px;align-items:center;gap:8px">
          <span>📅 Giới hạn mua <b>mỗi món / ngày</b>:</span>
          <input class="mini-in" id="isDayMax" type="number" min="0" max="100000" placeholder="99" style="width:90px">
          <select class="mini-in" id="isDayMode" style="width:auto"><option value="server">🌐 gộp CẢ SERVER</option><option value="user">👤 mỗi người riêng</option></select>
          <button class="btn-green mini" onclick="isDayMaxSave(this)">💾 Lưu hạn mua</button>
          <span class="muted" style="font-size:12px">áp cho TẤT CẢ món · 0 = không giới hạn · đếm lại 00:00 giờ VN · "cả server" = ai mua trước được trước</span>
        </div>
        <div class="row" style="margin-top:6px;align-items:center;gap:8px">
          <span>🔥 Hàng giới hạn: <b>mỗi người</b> tối đa</span>
          <input class="mini-in" id="isImplantMax" type="number" min="0" max="1000" placeholder="2" style="width:70px">
          <span>cái/ngày</span>
          <span class="muted" style="font-size:12px">(hạn riêng nhóm 🔥 Hàng giới hạn, luôn đếm theo người · lưu bằng nút 💾 ở trên · 0 = không giới hạn)</span>
        </div>
        <div style="margin-top:8px">
          <b>🗂️ Hạn theo NHÓM</b> <span class="muted" style="font-size:12px">- mỗi nhóm chọn <b>🌐 toàn server</b> (cả server chia nhau, ai mua trước được trước) hoặc <b>👤 cá nhân</b> (mỗi người riêng) + số lượng/ngày · 0 = không giới hạn · nhóm có hạn thì MIỄN hạn 📅 chung · reset 00:00 giờ VN · lưu bằng nút 💾 ở trên</span>
          <div id="isGroupQuota" style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap"></div>
        </div>
        <div class="row" style="margin-top:8px;align-items:center;gap:8px">
          <input class="mini-in" id="isfFilter" placeholder="🔍 Lọc: gõ id, tên món hoặc tên nhóm" style="flex:1;min-width:200px" oninput="itemShopFilter()">
          <select class="mini-in" id="isfFilterCat" style="width:170px" onchange="itemShopFilter()">
            <option value="">Mọi nhóm</option>
          </select>
          <label style="display:flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" id="isfFilterOff" style="width:auto;margin:0" onchange="itemShopFilter()"> chỉ món đang tắt</label>
          <span class="muted" id="isfFilterN" style="font-size:12px;white-space:nowrap"></span>
        </div>
        <div style="overflow-x:auto;margin-top:8px">
          <table id="itemShopTable">
            <thead><tr><th title="Tick = đang bán trên web · bỏ tick = ẩn, người chơi không thấy/không mua được (dòng vẫn giữ)">Bán</th><th>ID vật phẩm</th><th>Tên hiện</th><th>Nhóm</th><th>Giá/cái</th><th>Max/lần</th><th>Ghi chú tác dụng</th><th>Hình (file)</th><th></th></tr></thead>
            <tbody id="itemShopBody"></tbody>
          </table>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn-green" onclick="itemShopAddRow();itemShopDirty(true)">➕ Thêm món</button>
          <button class="btn-green" id="itemShopSaveBtn" onclick="itemShopSave()">💾 Lưu shop</button>
        </div>
      </div>
      <div class="card" id="petBossCard">
        <h3>🐾 Chọn Pet Boss - mỗi người nhận 1 con (thẻ nằm trong nhóm ⭐ Quan trọng của shop web)</h3>
        <div class="muted" style="font-size:13px;margin-bottom:8px">Người chơi bấm thẻ → chọn <b>ngoại hình</b> → chọn <b>kiểu</b> (Ngoại / Nội / Cân bằng) → <b>Nhận</b>. Mỗi ví đúng 1 lần, pet vào túi khi đăng nhập / đổi bản đồ. Tư chất cố định theo bảng game. Bản Admin 12000 không bao giờ bán. Hình: up từng skin bên dưới (để trống = 🐾).</div>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" id="pbaOn" style="width:auto;margin:0"> <b>Bật</b> trên web</label>
          <input class="mini-in" id="pbaName" placeholder="Tên thẻ (vd 🐾 Chọn Pet Boss)" style="width:220px">
          <select class="mini-in" id="pbaBan" style="width:210px"></select>
          <input class="mini-in" id="pbaPrice" type="number" min="0" placeholder="Giá KNB (0 = miễn phí)" style="width:170px">
          <input class="mini-in" id="pbaImg" placeholder="Hình thẻ (file)" style="width:150px">
          <label class="btn-grey" style="cursor:pointer;padding:6px 10px">🖼️ Up hình thẻ<input type="file" accept="image/*" style="display:none" onchange="pbaUp(this,'pbaImg')"></label>
        </div>
        <input class="mini-in" id="pbaNote" placeholder="Ghi chú hiện trên thẻ (vd: Pet boss tân thủ, tư chất cố định)" style="width:100%;margin-top:8px">
        <div style="overflow-x:auto;margin-top:8px">
          <table><thead><tr><th>Bán</th><th>Hình</th><th>Skin</th><th>Lựa chọn (kiểu · tư chất Cường/Thể/Nội/Thân/Trí)</th><th>File hình</th><th></th></tr></thead><tbody id="pbaSkins"><tr><td colspan="6" class="muted">Đang tải...</td></tr></tbody></table>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn-green" onclick="pbaSave(this)">💾 Lưu Pet Boss</button>
          <button class="btn-grey" onclick="pbaLoad()">🔄 Tải lại</button>
          <span class="muted" id="pbaInfo" style="font-size:12px"></span>
        </div>
        <h3 style="margin-top:14px">Đã nhận <span class="muted" id="pbaPickN" style="font-size:12px"></span></h3>
        <div id="pbaPicks" class="muted">-</div>
      </div>
      <!-- (💰 Sổ biến động KNB đã chuyển sang tab 📜 Log - 04/09) -->
    </div>

    <!-- 📦 KHO ĐỒ TOÀN GAME (08/09) - CHỈ CỔNG SUPER: thay CreativeMenu client mod -->
    <div id="tab-gift" class="hidden">
      <div class="card">
        <h2>🎁 Quà admin tặng <span class="muted" style="font-size:13px;font-weight:400">(admin + mod)</span></h2>
        <div class="note">Danh sách <b>riêng</b>, không dính shop item - nên cùng một mã item vừa bán ở shop vừa làm quà cũng không lẫn nhau nữa. Mỗi người <b>mỗi ngày nhận 1 lần</b> một quà (qua 00:00 nhận lại), số cái mỗi lần ở cột <b>Số cái/lần</b>. Bỏ tick <b>Phát</b> là quà biến mất với mọi người (dòng vẫn giữ). Người chơi nhận ở web: tab vàng <b>🎁 Quà</b> trong Hồ sơ, chỉ hiện khi còn quà chưa nhận hôm nay. Phải <b>online trong game</b> mới nhận được. Không dính tiền, không dính hạn ngày hay nợ.</div>
        <div class="row" style="margin-top:8px;gap:8px">
          <button class="btn-green" onclick="giftAddRow();giftDirty(true)">➕ Thêm quà</button>
          <button class="btn-green" id="giftSaveBtn" onclick="giftSave()">💾 Lưu quà</button>
          <span class="muted" id="giftN" style="font-size:12px"></span>
        </div>
        <div style="overflow-x:auto;margin-top:8px">
          <table id="giftTable">
            <thead><tr><th title="Tick = đang phát">Phát</th><th>ID vật phẩm</th><th>Tên hiện</th><th>Số cái/lần</th><th>Ghi chú</th><th>Hình</th><th></th></tr></thead>
            <tbody id="giftBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card" id="vqCard">
        <h2>🍀 Vòng quay may mắn <span class="muted" style="font-size:13px;font-weight:400">(web người chơi → nhóm 🪪 Cá nhân → 🍀 Vòng Quay)</span></h2>
        <div class="note">Giống vòng quay trong game: người chơi trả <b>KNB</b> để <b>mở / làm mới</b> vòng (server bốc 24 món từ bộ quà dưới đây theo trọng số, không còn VIP - ai cũng quay được mọi món). Mỗi vòng quay tối đa <b>số lần quay / vòng</b> (mặc định 40), đủ thì người chơi phải Làm mới. Mỗi lần <b>rút thăm</b> tốn <b>1 lượt quay</b> (có trong 🎒 Túi đồ boss, hoặc admin cấp ở dưới), server bốc 1 trong 24 ô theo trọng số. Quà vào <b>rương vòng quay</b> trên web, người chơi bấm Nhận để gửi vào game. Trọng số càng nhỏ càng hiếm.</div>
        <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="vqOn" style="width:auto;margin:0"> <b>Bật</b> trên web</label>
          <label>Giá mở / làm mới (KNB) <input class="mini-in" id="vqGia" type="number" min="0" style="width:110px"></label>
          <label title="Quay đủ số lần này thì người chơi phải Làm mới vòng (trả KNB) mới quay tiếp">Số lần quay / vòng <input class="mini-in" id="vqMax" type="number" min="1" max="1000" style="width:70px"></label>
          <button class="btn-green" onclick="vqaSave()">💾 Lưu vòng quay</button>
          <button class="btn-grey" onclick="vqaMacDinh()">↩ Bộ quà mặc định</button>
          <button class="btn-grey" onclick="vqaLoad()">🔄 Tải lại</button>
        </div>
        <div id="vqaSum" class="muted" style="font-size:12px;margin-top:6px">Bấm vào tab là tải...</div>
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          <input id="vqaQ" placeholder="🔎 Tìm vật phẩm trong game để thêm (tên không dấu hoặc ID)" style="flex:1;min-width:220px" onkeydown="if(event.key==='Enter')vqaTim()">
          <button onclick="vqaTim()">Tìm</button>
          <input id="vqaLoc" placeholder="Lọc bộ quà đang có..." style="width:200px" oninput="vqaDraw()">
        </div>
        <div id="vqaKq" style="margin-top:6px"></div>
        <div style="overflow:auto;margin-top:8px;max-height:520px">
          <table><thead><tr><th title="Bỏ tick = không bốc vào vòng (giữ dòng)">Bật</th><th></th><th>Vật phẩm</th><th>SL</th><th>Trọng số</th><th title="Xác suất trúng trong 1 lượt NẾU món có trên vòng">~ %/lượt</th><th></th></tr></thead><tbody id="vqaPool"></tbody></table>
        </div>
        <h3 class="epOnly" style="display:none;margin-top:14px">🎟️ Cấp lượt quay <span class="muted" style="font-size:12px;font-weight:400">(chỉ cổng SUPER)</span></h3>
        <div class="row epOnly" style="display:none;gap:8px;flex-wrap:wrap;align-items:center"><select id="vqaVi" style="min-width:240px"></select><input class="mini-in" id="vqaN" type="number" value="10" style="width:90px"><button class="btn-green" onclick="vqaCap()">➕ Cấp lượt</button><span class="muted" style="font-size:12px">số âm = trừ lượt</span></div>
        <div id="vqaNguoi" style="margin-top:8px"></div>
        <h3 style="margin-top:14px">📜 Lượt quay gần đây</h3>
        <div id="vqaLog" class="muted" style="font-size:13px;max-height:260px;overflow:auto"></div>
      </div>
    </div>
    <div id="tab-gn" class="hidden"><!-- 💎 05/10: Ghép Ngọc - tab riêng, chỉ cổng SUPER (API /api/gn/* cũng chặn cổng mod) -->
      <div class="card">
        <h2>💎 Ghép Ngọc <span class="muted" style="font-size:13px;font-weight:400">(web người chơi → 🎮 Mini game → 💎 Ghép Ngọc · chỉ cổng SUPER)</span></h2>
        <div class="row" style="gap:8px"><button class="btn-grey" onclick="gnaLoad()">🔄 Tải lại</button></div>
        <div id="gnaApp" class="muted" style="margin-top:8px">Đang tải...</div>
      </div>
    </div>
    <div id="tab-br" class="hidden"><!-- 📊 05/10: bảng rơi + đề xuất farm = nhúng https://netco4.click/#farm (1 bản duy nhất, đổi tỉ lệ thì dựng lại trang đó) -->
      <div class="card">
        <h2>📊 Bảng rơi &amp; đề xuất farm <span class="muted" style="font-size:13px;font-weight:400">chọn món muốn farm → gợi ý nên đi đâu, đánh con gì</span></h2>
        <div id="brApp" class="muted">đang tải...</div>
      </div>
    </div>
    <div id="tab-gnx" class="hidden"><!-- 💎 05/10: nhật ký Ghép Ngọc - bản CHỈ XEM cho cổng mod (hoàn đồ / cấu hình ở tab 💎 cổng SUPER) -->
      <div class="card">
        <h2>💎 Ghép Ngọc <span class="muted" style="font-size:13px;font-weight:400">nhật ký luyện · chỉ xem</span></h2>
        <div id="gnxApp" class="muted">đang tải...</div>
      </div>
    </div>
    <div id="tab-vqx" class="hidden"><!-- 🍀 05/10: Vòng quay may mắn - bản CHỈ XEM cho cổng mod (sửa ở 🎁 Quà tặng cổng SUPER) -->
      <div class="card">
        <h2>🍀 Vòng quay may mắn <span class="muted" style="font-size:13px;font-weight:400">giống trang người chơi (🪪 Cá nhân → 🍀 Vòng Quay) · chỉ xem</span></h2>
        <div class="note">Mở hoặc làm mới vòng: game bốc <b>24 ô</b> theo trọng số từ bộ quà dưới đây; mỗi lần quay trúng 1 ô. Tỉ lệ ghi ở bảng là ước tính mỗi lần quay (trọng số ÷ tổng trọng số trung bình của 24 ô), cùng cách tính với tab sửa của admin.</div>
        <div id="vqxSum" class="muted" style="font-size:13px;margin-top:6px">đang tải...</div>
        <input id="vqxLoc" placeholder="🔎 Lọc theo tên hoặc ID..." oninput="vqxDraw()" style="margin-top:8px;max-width:340px">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-top:8px">
          <div style="flex:2;min-width:320px;max-height:560px;overflow:auto"><table><thead><tr><th></th><th>Vật phẩm</th><th>SL</th><th>Trọng số</th><th>Tỉ lệ / lần quay</th></tr></thead><tbody id="vqxPool"></tbody></table></div>
          <div style="flex:1;min-width:260px"><h3 style="margin-top:0">📜 Lượt quay gần đây</h3><div id="vqxLog" class="muted" style="font-size:13px;max-height:520px;overflow:auto"></div></div>
        </div>
      </div>
    </div>
    <div id="tab-give" class="hidden">
      <div class="card">
        <h2>📦 Kho đồ toàn game <span class="muted" style="font-size:13px;font-weight:400">(chỉ cổng SUPER)</span></h2>
        <div class="note">Mỗi món có 2 nút. <b>🎁 Giao</b>: vào túi trong game ngay - họ phải <b>liên kết + đang ONLINE</b>. <b>🧰 Rương</b> (18/09): bỏ thẳng vào <b>Rương Ích Kỷ</b> của họ - <b>không</b> tính hạn mua 100/ngày, <b>không</b> tính sức chứa 100, <b>không</b> cần online, <b>không</b> cần liên kết; họ tự NHẬN vào game hoặc tặng tiếp, <b>00:00 không nhận là mất</b> như mọi món trong rương. Ghi chú hiện ở sổ "ai tặng" trong rương của họ. Danh mục vật phẩm Thiên Long (tên tiếng Việt) bot đọc từ panel GM lúc khởi động. Mọi lượt đều ghi log. ⚠️ Dùng cho <b>đền bù / sự kiện</b> - spawn bừa là tự phá giá shop item của chính mình.</div>
        <div class="row" style="margin-top:8px">
          <div style="flex:2"><label>Người nhận (mọi ví · 🎮 = đã liên kết · 🧰 = số món đang trong rương)</label><select id="gvTarget"></select></div>
          <div style="flex:2"><label>Hoặc gõ tên nhân vật khác (chỉ 🎁 Giao vào game)</label><input id="gvTargetFree" placeholder="trống = dùng ô bên trái"></div>
          <div style="flex:1"><label>Số lượng</label><input id="gvQty" type="number" min="1" max="1000000" value="1" title="Bao nhiêu cũng được (tối đa 1.000.000)"></div>
          <div style="flex:2"><label>Ghi chú (chỉ 🧰 Rương - hiện ở sổ "ai tặng")</label><input id="gvNote" placeholder="vd: đền bù rớt đồ" maxlength="60"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div style="flex:2"><input id="gvFind" placeholder="🔎 Tìm theo tên / mô tả / id..." oninput="gvRender()"></div>
          <div style="flex:1"><select id="gvType" onchange="gvRender()"><option value="">Tất cả nhóm</option></select></div>
        </div>
        <div class="muted" id="gvStat" style="font-size:12px;margin-top:6px">Bấm vào tab là tải danh sách...</div>
        <div id="gvResult" class="hidden" style="margin-top:8px;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--card2);font-size:13px"></div>
        <div id="gvList" style="margin-top:8px;max-height:540px;overflow-y:auto"></div>
      </div>
    </div>

    <!-- 🃏 POKER (chỉ SUPER): toàn bộ thao tác giải nằm đây - trang người chơi không có nút admin.
         Chip trong giải là chip ảo, không đụng ví. Trang chơi nhúng ở /poker/ cùng cổng web. -->
    <!-- ⚡ TAB MẪU giao diện 23/09. Xếp theo VIỆC HAY LÀM: công tắc + 2 ô ép nằm trên
         (ngày nào cũng đụng), cài đặt bàn nằm dưới (chỉnh một lần rồi thôi). -->
    <div id="tab-rl" class="hidden">

      <div class="card">
        <h2>🎡 Roulette</h2>
        <div class="sub">Chỉ cổng SUPER · 154 cửa · hệ số nhân CHỈ rơi vào số đơn (29:1 rồi nhân tới x500) · phí suy từ mức nhà cái ăn</div>
        <div class="acts">
          <label class="sw wide"><input id="rlOn" type="checkbox" onchange="rlBat(this.checked)"><b>BẬT bàn Roulette</b></label>
        </div>
        <div class="stat" id="rlNow"></div>
        <div class="note" id="rlLive"></div>
      </div>

      <div class="card">
        <div class="blk">
          <h3>🎯 Ép kết quả</h3>
          <div class="note">Bấm lúc bàn <b>còn nhận cược</b> thì áp ngay ván này (lúc khoá sổ), đã khoá rồi thì vào ván sau. Dùng một lần rồi tự xoá.</div>
          <div class="row">
            <div class="fld" style="max-width:140px"><label>Số ra (0 – 36)</label><input id="rlEpSo" type="number" min="0" max="36" placeholder="vd: 17"></div>
          </div>
          <div class="acts">
            <button class="btn-grey wide" onclick="rlTuEp()">🎯 Chọn số cho nhà cái ĂN NHIỀU NHẤT</button>
          </div>
          <div class="stat" id="rlEpNow"></div>
          <div class="acts">
            <button class="btn-red wide" onclick="rlEp()">⚡ Ép kết quả</button>
            <button class="btn-grey" onclick="rlHuyEp()">↩️ Huỷ ép kết quả</button>
          </div>
        </div>

        <div class="blk">
          <h3>✋ Ép số sét (hệ số nhân của số đơn)</h3>
          <div class="note">Ghi <code>số×hệ_số</code>, cách nhau bằng phẩy. <b>0</b> = tắt sét ô đó. Ô không ghi thì máy tự bốc. Khoảng ép ghi ở dòng dưới, muốn cao hơn thì nâng thang trước.</div>
          <div class="row">
            <div class="fld"><label>Ví dụ: 7×100, 12×0, 3×500</label><input id="rlEpNhanTxt" type="text" placeholder="7×100, 12×0"></div>
          </div>
          <div class="stat" id="rlNhanNow"></div>
          <div class="acts">
            <button class="btn-red wide" onclick="rlEpNhan()">✋ Ép số sét</button>
            <button class="btn-grey" onclick="rlHuyEpNhan()">↩️ Huỷ ép số sét</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="blk">
          <h3>⏱️ Nhịp ván</h3>
          <div class="row">
            <div class="fld"><label>Giây ĐẶT CƯỢC, bi đứng yên (5 – 600)</label><input id="rlBetS" type="number" min="5" max="600" placeholder="vd: 15" oninput="txDirty(this)"></div>
            <div class="fld"><label>Giây BI CHẠY vẫn nhận cược (0 – 60)</label><input id="rlQuayS" type="number" min="0" max="60" placeholder="vd: 5" oninput="txDirty(this)"></div>
            <div class="fld"><label>Giây KHOÁ SỔ tới lúc trả tiền (6 – 60)</label><input id="rlRoiS" type="number" min="6" max="60" placeholder="vd: 14" oninput="txDirty(this)"></div>
          </div>
          <div class="note">Khoá sổ xong <b>2 giây</b> mới hiện số sét, bi giảm tốc dần rồi rơi vào ô trước <b>3 giây cuối</b> khoe kết quả (mặc định 14 giây thì rơi ở giây 11).</div>
          <div class="acts"><button class="btn-green" onclick="rlSaveTime()">💾 Lưu nhịp ván</button></div>
        </div>

        <div class="blk">
          <h3>🎯 Nhà cái ăn & trần cược mỗi người</h3>
          <div class="acts">
            <label class="sw wide"><input id="rlKhongPhi" type="checkbox" onchange="rlKhongPhiBat(this.checked)"><b>KHÔNG PHÍ, giống nhà cái</b> · đặt bao nhiêu trừ bấy nhiêu, nhà cái ăn cố định 2,70%</label>
          </div>
          <div class="note">Tắt công tắc = <b>có phí</b> trên tiền cược, khi đó mới chỉnh được mức ăn ở ô dưới (3 – 20%, phí máy tự suy). Hệ số nhân và số ô sét không đổi theo chế độ.</div>
          <div class="row">
            <div class="fld"><label>Nhà cái ăn bao nhiêu % (3 – 20, chỉ khi CÓ PHÍ)</label><input id="rlAn" type="number" min="3" max="20" step="0.5" placeholder="vd: 8" oninput="txDirty(this)"></div>
            <div class="fld"><label>Trần cược mỗi người mỗi ván (0 = không giới hạn)</label><input id="rlMax" type="number" min="0" placeholder="vd: 300000" oninput="txDirty(this)"></div>
          </div>
          <div class="stat" id="rlAnNote"></div>
          <div class="note">Roulette chuẩn chỉ ăn 2,70%. Muốn ăn hơn mà không phá bảng trả quen thuộc thì thu <b>phí trên tiền cược</b>, máy tự suy: ăn 8% thì phí 5,76%. <b>Không hạ dưới 3%</b>: phí sẽ âm, bàn tự phát tiền.</div>
          <div class="acts"><button class="btn-green" onclick="rlSaveAn()">💾 Lưu</button></div>
        </div>

        <div class="blk">
          <h3>🧱 Trần cược từng nhóm</h3>
          <div class="note">Số đơn trần thấp nhất vì có thể x500. Nhóm khác trả chuẩn nên trần cao hơn, thắng đậm nhất một ô quanh 300.000.</div>
          <div id="rlTran" class="row" style="margin-top:14px"></div>
          <div class="stat" id="rlTranNow"></div>
          <div class="acts"><button class="btn-green" onclick="rlSaveTran()">💾 Lưu trần cược</button></div>
        </div>

        <div class="blk">
          <h3>🎰 Thang hệ số nhân (số đơn)</h3>
          <div class="note">Một dòng: <code>so: hệ_số×độ_hiếm, ...</code>, tới 16 bậc. Độ hiếm chỉ quyết định bậc nào hay ra, <b>không</b> đổi phần trăm nhà cái ăn. Bậc thấp nhất phải trên 29. Thang càng cao thì số ô sét mỗi ván càng ít (máy tự tính: <code>37×6 ÷ (trung bình thang − 29)</code>).</div>
          <textarea id="rlThang" rows="6" spellcheck="false" oninput="txDirty(this)"></textarea>
          <div class="stat" id="rlThangNow"></div>
          <div class="acts">
            <button class="btn-green" onclick="rlSaveThang()">💾 Lưu thang</button>
            <button class="btn-grey" onclick="rlThangMacDinh()">↩️ Về mặc định</button>
          </div>
        </div>

        <div class="blk">
          <h3>🔢 Số ô sét mỗi ván</h3>
          <div class="note">Mỗi mục <code>số_ô×độ_hiếm</code>, cách nhau bằng phẩy, ví dụ <code>2×10, 3×9, …, 11×5</code>: 2 ô hay gặp, 11 ô hiếm. Máy giữ hình dạng bảng rồi nghiêng nhẹ cho trung bình khớp thang nhân, nên nhà cái vẫn ăn đúng mức. Bảng phải bao được số ô mà thang đòi, không thì máy báo và không lưu.</div>
          <textarea id="rlSet" rows="2" spellcheck="false" oninput="txDirty(this)"></textarea>
          <div class="stat" id="rlSetNow"></div>
          <div class="acts">
            <button class="btn-green" onclick="rlSaveSet()">💾 Lưu bảng số ô sét</button>
            <button class="btn-grey" onclick="rlSetMacDinh()">↩️ Về mặc định</button>
          </div>
        </div>
      </div>

    </div>
    <div id="tab-stx" class="hidden">

      <div class="card">
        <h2>⚡ Siêu Tài Xỉu</h2>
        <div class="sub">Chỉ cổng SUPER · phí 20% trên tiền cược · Tài/Xỉu/Chẵn/Lẻ cũng được nhân tới 14:1</div>
        <div class="acts">
          <label class="sw wide"><input id="stxOn" type="checkbox" onchange="stxBat(this.checked)"><b>BẬT bàn Siêu Tài Xỉu</b></label>
        </div>
        <div class="stat" id="stxNow"></div>
        <div class="note" id="stxLive"></div>
      </div>

      <div class="card">
        <div class="blk">
          <h3>🎲 Ép kết quả ván sau</h3>
          <div class="row">
            <div class="fld" style="max-width:110px"><label>Xúc xắc 1</label><input id="stxD1" type="number" min="1" max="6" value="1" oninput="stxPreview()"></div>
            <div class="fld" style="max-width:110px"><label>Xúc xắc 2</label><input id="stxD2" type="number" min="1" max="6" value="2" oninput="stxPreview()"></div>
            <div class="fld" style="max-width:110px"><label>Xúc xắc 3</label><input id="stxD3" type="number" min="1" max="6" value="3" oninput="stxPreview()"></div>
          </div>
          <div class="preview" id="stxPrev"></div>
          <div class="quick">
            <button onclick="stxSetDice(6,6,4)">Tài + Chẵn (16)</button>
            <button onclick="stxSetDice(6,5,4)">Tài + Lẻ (15)</button>
            <button onclick="stxSetDice(1,2,3)">Xỉu + Chẵn (6)</button>
            <button onclick="stxSetDice(1,2,2)">Xỉu + Lẻ (5)</button>
          </div>
          <div class="acts">
            <button class="btn-grey wide" onclick="stxTuEp()">🎯 Chọn xúc xắc cho nhà cái ĂN NHIỀU NHẤT</button>
          </div>
          <div class="stat" id="stxEpNow"></div>
          <div class="acts">
            <button class="btn-red wide" onclick="stxEp()">⚡ Ép kết quả ván sau</button>
            <button class="btn-grey" onclick="stxHuyEp()">↩️ Huỷ ép xúc xắc</button>
          </div>
        </div>

        <div class="blk">
          <h3>✋ Ép hệ số nhân, Tài · Xỉu · Chẵn · Lẻ và 🌪️ Bão</h3>
          <div class="note">Bấm lúc bàn <b>còn nhận cược</b> thì hệ số hiện ngay ở 4 giây khoe nhân của ván đang chạy; bấm lúc đã khoá sổ thì chờ ván sau. <b>Dùng một lần rồi tự xoá</b>, để thường trực x14 là nhà cái đổ tiền mỗi ván.<br>Mỗi ô: <b>để trống</b> = máy tự bốc · <b>0</b> = tắt, ô không sáng · <b>số</b> = ép đúng hệ số đó.</div>
          <div id="stxNhanO" class="row" style="margin-top:14px"></div>
          <div class="quick">
            <button onclick="stxNhanDat(14)">Tất cả x14</button>
            <button onclick="stxNhanDat(8)">Tất cả x8</button>
            <button onclick="stxNhanDat(2)">Tất cả x2</button>
            <button onclick="stxNhanDat(0)">Tắt hết 4 ô</button>
            <button onclick="stxNhanDatBao('max')">🌪️ Bão tối đa</button>
            <button onclick="stxNhanDatBao(0)">🌪️ Bão tắt hết</button>
            <button onclick="stxNhanDat('');stxNhanDatBao('')">Xoá ô nhập</button>
          </div>
          <div class="stat" id="stxNhanNow"></div>
          <div class="acts">
            <button class="btn-red wide" onclick="stxEpNhan()">✋ Ép hệ số nhân</button>
            <button class="btn-grey" onclick="stxHuyEpNhan()">↩️ Huỷ ép hệ số</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="blk">
          <h3>⏱️ Nhịp ván</h3>
          <div class="row">
            <div class="fld"><label>Giây ĐẶT CƯỢC (5 – 600)</label><input id="stxBetS" type="number" min="5" max="600" placeholder="vd: 30" oninput="txDirty(this)"></div>
            <div class="fld"><label>Giây HIỆN NHÂN (0 – 60)</label><input id="stxNhanS" type="number" min="0" max="60" placeholder="vd: 4" oninput="txDirty(this)"></div>
            <div class="fld"><label>Giây NẶN (6 – 300)</label><input id="stxNanS" type="number" min="6" max="300" placeholder="vd: 20" oninput="txDirty(this)"></div>
          </div>
          <div class="acts"><button class="btn-green" onclick="stxSaveTime()">💾 Lưu nhịp ván</button></div>
        </div>

        <div class="blk">
          <h3>🎯 Nhà cái ăn & trần cược mỗi người</h3>
          <div class="row">
            <div class="fld"><label>Nhà cái ăn bao nhiêu % (2 – 30)</label><input id="stxAn" type="number" min="2" max="30" step="0.5" placeholder="vd: 8" oninput="txDirty(this)"></div>
            <div class="fld"><label>Trần cược mỗi người mỗi ván (0 = không giới hạn)</label><input id="stxMax" type="number" min="0" placeholder="vd: 300000" oninput="txDirty(this)"></div>
          </div>
          <div class="stat" id="stxAnNote"></div>
          <div class="note">Bàn này thu <b>phí 20%</b> trên tiền cược, đó là nguồn thu duy nhất, nên bảng trả cố tình vượt 100%. Hạ "nhà cái ăn" thì bảng trả rộng ra và ít ô sáng hơn.</div>
          <div class="acts"><button class="btn-green" onclick="stxSaveAn()">💾 Lưu</button></div>
        </div>

        <div class="blk">
          <h3>🧱 Trần cược từng cửa</h3>
          <div class="note">Bàn Siêu trả cao gấp mấy lần bàn thường nên trần phải thấp hơn hẳn. Cửa trả càng cao trần càng thấp, sửa một ô là cả nhóm nhảy theo.</div>
          <div id="stxTran" class="row" style="margin-top:14px"></div>
          <div class="stat" id="stxTranNow"></div>
          <div class="acts"><button class="btn-green" onclick="stxSaveTran()">💾 Lưu trần cược</button></div>
        </div>

        <div class="blk">
          <h3>🎰 Thang hệ số nhân</h3>
          <div class="note">Mỗi dòng một nhóm: <code>tên: hệ_số×độ_hiếm, ...</code>, số sau dấu × là "vé số", chỉ quyết định bậc nào hay ra, <b>không</b> đổi phần trăm nhà cái ăn.</div>
          <textarea id="stxThang" rows="13" spellcheck="false" oninput="txDirty(this)"></textarea>
          <div class="acts">
            <button class="btn-green" onclick="stxSaveThang()">💾 Lưu thang</button>
            <button class="btn-grey" onclick="stxThangMacDinh()">↩️ Về mặc định</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="blk">
          <h3>📋 Bảng kết quả trên Discord</h3>
          <div class="note">Bảng chỉ khoe kết quả và rủ vào web, <b>không đặt cược được từ Discord</b>. Dán chung kênh với bảng Tài Xỉu thường cũng được, hai bảng nằm cạnh nhau, chỉ nhảy xuống cuối khi có người nhắn đè.</div>
          <div class="row" style="margin-top:14px">
            <div class="fld"><label>Channel ID</label><input id="stxChannel" placeholder="vd: 1234567890123456789"></div>
          </div>
          <div class="stat" id="stxBoardInfo"></div>
          <div class="acts">
            <button class="btn-green" onclick="stxBoardStart()">▶️ Đăng bảng</button>
            <button class="btn-red" onclick="stxBoardStop()">⏹️ Gỡ bảng</button>
          </div>
        </div>
      </div>

    </div>
    <div id="tab-poker" class="hidden">
      <div class="card">
        <h2>🃏 Giải Poker <span class="muted" style="font-size:13px;font-weight:400">(chỉ cổng SUPER · chip ảo, không ăn KNB)</span></h2>
        <div class="row" style="align-items:center;gap:14px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;white-space:nowrap"><input id="pkOn" type="checkbox" onchange="pokerOn(this.checked)"> <b>Hiện tab 🃏 GIẢI POKER</b> trên web người chơi</label>
          <span class="muted" id="pkOnNow" style="font-size:12px"></span>
        </div>
        <div class="note" style="margin-top:8px">Người chơi vào <b>web cược → tab GIẢI POKER → bấm ghế trống để ngồi</b> (cần liên kết + ≥ 10.000 KNB, chỉ kiểm không trừ). Đủ người thì bấm <b>Bắt đầu</b> ở đây. <b>Giải tán</b> dọn sạch ghế. Ai được thưởng/phạt thì anh tự trao trong game, bot chỉ báo hạng.</div>
        <div class="row" style="margin-top:10px;align-items:flex-end;flex-wrap:wrap">
          <div style="flex:1;min-width:160px"><label>Chip khởi điểm mỗi người</label>
            <select id="pkChip" onchange="pokerChip()">
              <option value="2000">2.000</option><option value="5000">5.000, mặc định</option>
              <option value="10000">10.000</option><option value="20000">20.000</option>
            </select></div>
          <button class="btn-green" id="pkBatDau" onclick="pokerBatDau()">▶️ Bắt đầu</button>
          <button class="btn-red" onclick="pokerGiaiTan()">🧹 Giải tán</button>
          <button class="btn-grey" id="pkNghi" onclick="pokerNghi()">⏸️ Tạm nghỉ</button>
          <button class="btn-grey" id="pkTiep" onclick="pokerTiep()">▶️ Chơi tiếp</button>
        </div>
        <div class="row blk">
          <div style="flex:1"><label>🃏 Admin POKER (ID Discord, cách nhau bằng phẩy)</label><input id="pokerAdminIds" type="text" placeholder="vd: 456136500011335698, 111111111111111111" oninput="txDirty(this)"></div>
          <button class="btn-green" onclick="pokerSaveAdmin()">💾 Lưu</button>
        </div>
        <div class="note" id="pokerAdminNow">Ai trong danh sách này mới có nút <b>Bắt đầu / Giải tán</b> ở trang poker. Poker chạy riêng tiến trình, chỉ ĐỌC file dữ liệu của bot, đổi ở đây là ăn ngay, không cần khởi động lại.</div>
        <div class="muted" id="pkThang" style="font-size:12px;margin-top:6px"></div>
        <div id="pkGhe" style="margin-top:10px"></div>
        <div id="pkGiai" style="margin-top:10px"></div>
      </div>
    </div>

    <div id="tab-tienlen" class="hidden">
      <div class="card">
        <h2>🀄 Tiến Lên Miền Nam <span class="muted" style="font-size:13px;font-weight:400">(chỉ cổng SUPER · ⚠️ ĂN KNB THẬT)</span></h2>
        <div class="row" style="align-items:center;gap:14px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;white-space:nowrap"><input id="tlOn" type="checkbox" onchange="tlBat(this.checked)"> <b>Hiện tab 🀄 TIẾN LÊN</b> trên web người chơi</label>
          <span class="muted" id="tlOnNow" style="font-size:12px"></span>
        </div>
        <div class="note" style="margin-top:8px">Người chơi vào <b>web cược → tab TIẾN LÊN</b>, thấy <b>SẢNH</b> liệt kê các phòng. Bấm một phòng để ngồi, hoặc <b>➕ TẠO PHÒNG MỚI</b> rồi chọn kiểu chơi + mức cược. Đủ 2–4 người cùng bấm ✅ SẴN SÀNG là vào ván, <b>không cần admin bấm gì</b>. Ở bàn, người chơi <b>vote đổi mức cược</b>, quá nửa đồng ý thì ván sau áp dụng. Nhà cái ăn <b>10% tiền thắng</b> mỗi ván.
        <br>Thang cược: <b>Đếm lá</b> 1.000–6.000 (mỗi lá) · <b>Truyền thống 1-2-3-4</b> 10.000–100.000 (giải nhất, nhì ăn một nửa).
        <br>Vốn tối thiểu: đếm lá <b>120×</b> mức cược, truyền thống <b>30×</b>, khác nhau vì thua đậm nhất một ván ở đếm lá nặng hơn nhiều (cóng + nhốt hàng đều nhân đôi).</div>

        <div class="row" style="margin-top:10px;align-items:flex-end;flex-wrap:wrap">
          <div style="flex:1;min-width:160px"><label>Mở thêm phòng, kiểu chơi</label>
            <select id="tlTaoCheDo">
              <option value="hang">🏅 Truyền thống 1-2-3-4</option>
              <option value="anhet">🔢 Đếm lá</option>
            </select></div>
          <div style="flex:1;min-width:150px"><label>Mức cược</label><input class="mini-in" id="tlTaoMuc" type="number" min="1000" max="1000000" step="1000" value="10000"></div>
          <button class="btn-green" onclick="tlTaoPhong()">➕ Mở phòng</button>
        </div>
        <div id="tlDs" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <h3>🔑 Admin Tiến Lên</h3>
        <div class="note">ID Discord (cách nhau bởi dấu phẩy) được phép chỉnh cấu hình bàn qua web. Panel SUPER thì luôn chỉnh được, ô này chỉ để mở thêm đường web.</div>
        <div class="row" style="margin-top:8px"><input class="mini-in" id="tlAdminIds" placeholder="123456789012345678, ..."><button class="btn-green" onclick="tlLuuAdmin()">💾 Lưu</button></div>
      </div>
    </div>

    <!-- 📜 LOG: gom toàn bộ lịch sử thắng/thua về một chỗ (04/09) - mỗi mục 30 ván CÓ CƯỢC.
         Chọn mục nào hiện mục đó, khỏi kéo dài (05/09). -->
    <div id="tab-log" class="hidden">
      <div class="card" id="logPickCard">
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <button class="btn-grey logPick" data-log="nk" onclick="logPick('nk')">📒 Nhật ký</button>
          <button class="btn-grey logPick" data-log="tx" onclick="logPick('tx')">🎲 Tài Xỉu</button>
          <!-- 04/10: web người chơi chỉ còn 3 game (Tài Xỉu, Roulette, Dò Mìn) -> ẩn lịch sử Siêu TX / Leo Thang / Phi Thuyền (pwOff = display:none) -->
          <button class="btn-grey logPick pwOff" data-log="stx" onclick="logPick('stx')">⚡ Siêu Tài Xỉu</button>
          <button class="btn-grey logPick" data-log="rl" onclick="logPick('rl')">🎡 Roulette</button>
          <button class="btn-grey logPick" data-log="mine" onclick="logPick('mine')">💣 Dò Mìn</button>
          <button class="btn-grey logPick pwOff" data-log="stair" onclick="logPick('stair')">🪜 Leo Thang</button>
          <button class="btn-grey logPick pwOff" data-log="spm" onclick="logPick('spm')">🚀 Phi Thuyền</button>
          <button class="btn-grey logPick" data-log="dog" onclick="logPick('dog')">💰 Sổ KNB</button>
          <button class="btn-grey logPick epOnly" style="display:none" data-log="drop" onclick="logPick('drop')">💥 Drop Boss</button>
        </div>
      </div>
      <!-- 💥 29/09: lịch sử sửa Drop Boss (cùng nguồn với nút 📜 trong tab Drop Boss) - có IP nên chỉ SUPER -->
      <div class="card logSec hidden" id="logSec-drop">
        <h3>💥 Lịch sử sửa Drop Boss</h3>
        <div class="note">Mỗi lần 💾 Lưu hộp / gắn-gỡ hộp / 🧬 Tách riêng: ai (cổng + IP), lúc nào, trước → sau. Nhật ký <code>/opt/tlbb-backup/dropboss-audit.jsonl</code> chỉ ghi thêm (chattr +a), không bao giờ bị cắt.</div>
        <div class="row" style="margin-top:6px">
          <input id="lgLogQ" class="mini-in" style="width:240px" placeholder="lọc: ID/tên boss, ID hộp, ID món, IP">
          <button class="mini" onclick="dropLogLoad('lg')">🔄 Tải</button>
          <span class="muted" id="lgLogInfo"></span>
        </div>
        <div id="lgLog" style="margin-top:8px;max-height:640px;overflow:auto"></div>
      </div>
      <!-- 📒 04/10: NHẬT KÝ (nhatky.js) - CHỈ 3 mục: Tài Xỉu (ván có người đặt), Dò Mìn, Nạp/Rút web. Giữ 3 ngày. Cổng mod chỉ thấy mục này. -->
      <div class="card logSec hidden" id="logSec-nk">
        <h3>📒 Nhật ký</h3>
        <div class="note">Chỉ 3 mục: <b>🎲 Tài Xỉu</b> (mỗi người đặt 1 dòng), <b>💣 Dò Mìn</b> (mỗi ván 1 dòng: cược → kết quả), <b>💰 Nạp / Rút</b> (KNB giữa web và game), <b>🛒 Shop</b> (mua đồ shop web, số bên phải = KNB đã chi). Với game, số bên phải là <b>lãi/lỗ của người chơi</b>: <span style="color:#3ddc84">+ xanh = thắng</span>, <span style="color:#ff6b6b">− đỏ = thua</span>. Bấm vào 1 dòng để xem log gốc. Giữ 3 ngày.</div>
        <div class="row" id="nkNgays" style="gap:6px;flex-wrap:wrap;margin-top:10px"></div>
        <div class="row" id="nkMucs" style="gap:6px;flex-wrap:wrap;margin-top:6px"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center">
          <input id="nkQ" class="mini-in" style="width:240px;margin-top:0" placeholder="tìm tên người chơi, số ván, số KNB..." oninput="nkGo()">
          <label class="muted" style="font-size:13px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="nkAuto" style="width:auto;margin:0" checked>Tự cập nhật 10s</label>
          <button class="mini" onclick="nkTai(true)">🔄 Tải</button>
        </div>
        <div id="nkStats"></div>
        <div class="muted" id="nkInfo" style="font-size:12px;margin-top:6px"></div>
        <div id="nkList" style="margin-top:6px;max-height:70vh;overflow:auto"></div>
        <div style="margin-top:8px"><button class="mini hidden" id="nkMore" onclick="nkThem()">⬇️ Xem thêm</button></div>
      </div>
      <div class="card logSec" id="logSec-tx">
        <h3>📜 Lịch sử Big Small</h3>
        <div class="note">Mỗi ván: kết quả, ai đặt bao nhiêu, nhận về bao nhiêu, lãi/lỗ. Số lấy từ sổ trả tiền, không tính lại.</div>
        <div id="txHist" class="hist"></div>
      </div>
      <!-- ⚡ 22/09: log Siêu Tài Xỉu TÁCH RIÊNG (chủ server: "làm thêm 1 siêu tài xỉu log nữa rồi tách log ra") -->
      <div class="card logSec hidden" id="logSec-rl">
        <h3>🎡 Lịch sử Roulette</h3>
        <div class="note">Mỗi ván: số ra, số sét đã bốc, ai đặt bao nhiêu (kèm phí), nhận về bao nhiêu, lãi/lỗ so với tiền đã rời ví.</div>
        <div id="rlHist" class="hist"></div>
      </div>
      <div class="card logSec hidden" id="logSec-stx">
        <h3>⚡ Lịch sử Siêu Tài Xỉu</h3>
        <div class="note">Mỗi ván: kết quả, ai đặt bao nhiêu (kèm phí 20%), nhận về bao nhiêu, lãi/lỗ so với tiền đã rời ví.</div>
        <div id="stxHist" class="hist"></div>
      </div>
      <div class="card logSec hidden" id="logSec-mine">
        <h3>📜 Lịch sử Dò Mìn</h3>
        <div id="mineHist" class="hist"></div>
      </div>
      <div class="card logSec hidden" id="logSec-stair">
        <h3>📜 Lịch sử Leo Thang</h3>
        <div id="stairHist" class="hist"></div>
      </div>
      <div class="card logSec hidden" id="logSec-spm">
        <h3>📜 Lịch sử Phi Thuyền</h3>
        <div id="spmHist" class="hist"></div>
      </div>
      <div class="card logSec hidden" id="logSec-dog">
        <h3>💰 Sổ biến động KNB</h3>
        <div class="note">Chỉ ghi: <b>chuyển</b> giữa người chơi · <b>nạp / rút</b> KNB (vào/ra game) · <b>admin cộng/trừ</b> · mua shop, vay/trả nợ, hoàn tiền. <b>Không</b> ghi bất cứ gì của mini game (Tài Xỉu, Siêu Tài Xỉu, Phi Thuyền, Tiến Lên, Cổ phiếu, hũ) - từng ván tra ở mục riêng bên trên (22/09).</div>
        <div id="dogLedger" class="hist"></div>
      </div>
    </div>

    <div id="tab-user" class="hidden">
      <!-- ⏸️ 09/09: GOM công tắc mở/đóng 5 trò về 1 chỗ (chủ server: "dễ thao tác 1 lần"). Big Small là bàn
           Discord, tắt/mở bằng ▶️/⏹ ở tab của nó (cần Channel ID) nên chỉ hiện trạng thái + nút tắt. -->
      <div class="card epOnly" style="display:none">
        <h2>⏸️ Mở / Đóng trò chơi</h2>
        <div class="row" style="gap:18px;flex-wrap:wrap" id="gsRow">
          <label id="gs_mines_lb" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="gs_mines" style="width:auto;margin:0" onchange="gameSwitch('mines',this)"> 💣 Dò Mìn</label>
          <label id="gs_stairs_lb" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="gs_stairs" style="width:auto;margin:0" onchange="gameSwitch('stairs',this)"> 🪜 Leo Thang</label>
          <label id="gs_spm_lb" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="gs_spm" style="width:auto;margin:0" onchange="gameSwitch('spm',this)"> 🚀 Phi Thuyền</label>
          <label id="gs_stock_lb" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="gs_stock" style="width:auto;margin:0" onchange="gameSwitch('stock',this)"> 📈 Sàn cổ phiếu</label>
          <span id="gs_tx" class="muted" style="font-size:13px"></span>
        </div>
        <div class="row" style="gap:18px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
          <label id="gs_rut_lb" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="gs_rut" style="width:auto;margin:0" onchange="gameSwitch('rut',this)"> 🎮 Rút KNB web → game</label>
          <label id="gs_nap_lb" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700"><input type="checkbox" id="gs_nap" style="width:auto;margin:0" onchange="gameSwitch('nap',this)"> 💬 Nạp KNB game → web</label>
        </div>
        <div class="row" style="gap:8px;align-items:center;margin-top:6px">
          <span>📅 <b>Mỗi người</b> rút KNB vào game tối đa</span>
          <input class="mini-in" id="gsDogDay" type="number" min="0" placeholder="30000" style="width:110px">
          <span>KNB/ngày</span>
          <span style="margin-left:10px">🪙 Đổi KNB → <b>vàng không khoá</b> tối đa</span>
          <input class="mini-in" id="gsVangDay" type="number" min="0" placeholder="30000" style="width:110px">
          <span>vàng/ngày</span>
          <button class="btn-green mini" onclick="dogDaySave(this)">💾 Lưu hạn</button>
          <span class="muted" style="font-size:12px">1 KNB = 1 vàng · 2 hạn đếm RIÊNG · 0 = không giới hạn · reset 00:00 giờ VN · game → web (NPC Ví Web) không giới hạn</span>
        </div>
        <div class="row" style="gap:10px;align-items:flex-end;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
          <div style="flex:2"><label>🎚️ Cược tối thiểu Dò Mìn + Leo Thang (KNB/ván)</label><input id="gsMinBet" type="number" min="1" placeholder="vd: 400"></div>
          <button class="btn-green" onclick="minBetSave(this)">💾 Lưu sàn cược</button>
          <div class="muted" style="flex:3;font-size:12px">Áp dụng ngay cho ván MỚI, web tự đổi số. Big Small và Phi Thuyền có sàn/trần riêng ở tab của chúng.</div>
        </div>
        <div class="note">Bỏ tick = ĐÓNG ngay, không cần Lưu: người chơi không vào ván/đặt cược/quay MỚI (web hiện ⛔ ĐÓNG), ván đang chơi vẫn xong bình thường, không ai mất tiền. Tick lại là mở. Big Small: dùng ▶️ Tạo bàn / ⏹ Tắt bàn ở tab 🎲. Hàng dưới: 2 chiều cầu KNB ↔ game trên web (đóng chiều nào thì nút chiều đó trên web thành ⛔, chống hack trong game rồi chuyển ra).</div>
      </div>
      <div class="card">
        <h2>👥 Ví điểm người chơi</h2>
        <div class="row">
          <div style="flex:1"><label>🎁 Phát KNB cho TẤT CẢ (bot tag role + thông báo)</label><input id="addAllAmount" type="number" placeholder="vd: 500"></div>
          <div style="flex:2"><label>💬 Lời nhắn (trống = câu mặc định)</label><input id="addAllMsg" placeholder="vd: 🎉 Quà 2/9! · Ăn mừng VN vô địch cúp!"></div>
          <button class="btn-green" onclick="addAllCoins()">Phát tất cả</button>
        </div>
        <div class="row" style="margin-top:12px">
          <div style="flex:2"><label>📢 Kênh thông báo phát (Channel ID)</label><input id="gaChannel" placeholder="vd: 123456789012345678"></div>
          <div style="flex:2"><label>🔔 Role được tag (Role ID, trống = không tag)</label><input id="gaRole" placeholder="vd: 123456789012345678"></div>
          <button class="btn-green" onclick="gaSave()">💾 Lưu kênh phát</button>
        </div>
        <div class="note">Đổi qua Discord khác chỉ cần lưu lại <b>kênh + role</b> ở đây (bot gửi 1 tin xác nhận vào kênh, không tag ai). Chưa lưu thì bot vẫn dùng kênh/role của server cũ.</div>
        <div class="row" style="margin-top:12px">
          <button class="btn-red" style="flex:1" onclick="resetDaily()">🔄 Reset điểm danh cả danh sách - ai cũng /diemdanh nhận lại được ngay</button>
        </div>
        <div class="row" style="margin-top:12px">
          <div style="flex:3"><label>Set tất cả người chơi về</label><input id="setAllAmount" type="number" placeholder="vd: 50000"></div>
          <button class="btn-red" onclick="setAll()">Set tất cả</button>
        </div>
        <div class="row blk">
          <div style="flex:0 0 auto;display:flex;align-items:center;padding-bottom:6px">
            <label style="display:inline-flex;align-items:center;gap:7px;line-height:1;margin:0"><input id="dcNghienOn" type="checkbox" style="margin:0" onchange="dcNghienToggle(this)"> <b>💉 Bật lệnh /nghien</b></label>
          </div>
          <div class="muted" id="dcNghienNow" style="flex:1;align-self:center;font-size:13px"></div>
        </div>
        <div class="row blk">
          <div style="flex:1"><label>🪪 Điểm danh/ngày</label><input id="dcDaily" type="number" min="0" placeholder="vd: 600"></div>
          <div style="flex:1"><label>💉 Nghiện/giờ</label><input id="dcNghien" type="number" min="0" placeholder="vd: 200"></div>
          <div style="flex:1"><label>🔥 Đủ chuỗi (ngày)</label><input id="dcStreakEvery" type="number" min="1" placeholder="vd: 2"></div>
          <div style="flex:1"><label>🎁 Thưởng chuỗi</label><input id="dcStreakBonus" type="number" min="0" placeholder="vd: 800"></div>
          <button class="btn-green" onclick="dcSave()">💾 Lưu mức thưởng</button>
        </div>
        <div class="row blk">
          <div style="flex:0 0 auto;display:flex;align-items:flex-end;padding-bottom:6px">
            <label style="display:inline-flex;align-items:center;gap:7px;line-height:1;margin:0"><input id="txOn" type="checkbox" style="margin:0"> <b>🚕 Bật "Xu đi taxi về"</b></label>
          </div>
          <div style="flex:1"><label>💸 Phát mỗi lần</label><input id="txTien" type="number" min="0" placeholder="vd: 10000"></div>
          <div style="flex:1"><label>📉 Phải thua tối thiểu / ngày</label><input id="txLoMin" type="number" min="0" placeholder="vd: 2000000"></div>
          <div style="flex:1"><label>👛 Ví còn tối đa</label><input id="txViMax" type="number" min="0" placeholder="0 = phải hết sạch"></div>
          <div style="flex:1"><label>⏳ Cách nhau (giờ)</label><input id="txGio" type="number" min="1" placeholder="vd: 24"></div>
          <button class="btn-green" onclick="txSave()">💾 Lưu vé taxi</button>
        </div>
        <div class="note">🚕 Người chơi <b>cháy ví</b> (còn ≤ "ví còn tối đa") và hôm nay đã <b>thua từ mức trên trở lên</b> thì thấy nút <b>🚕 Xu đi taxi về</b> cạnh số dư, bấm là nhận. Nhận xong phải chờ đủ số giờ đặt ở đây mới nhận lại được (mặc định 24h = mỗi ngày một lần).<br>
          <b>Tiền thua đếm theo ví thật</b>: tổng mọi đồng ra vào ví trong ngày, trừ đi nạp/rút/chuyển/admin cộng/mua shop/vay/hoàn, nên đúng với mọi trò, kể cả trò thêm sau này. Sổ về 0 lúc <b>00:00 giờ VN</b>.</div>
        <div class="note">Áp NGAY cho lượt nhận kế tiếp (cả Discord lẫn web), không cần restart. <b>Đủ chuỗi</b>: điểm danh đủ ngần này ngày LIÊN TIẾP là được ghi 1 gói thưởng chuỗi chờ nhận trên web. Số hiện trong mô tả lệnh /diemdanh, /nghien chỉ cập nhật sau restart bot (không ảnh hưởng số tiền thật).</div>
        <input id="search" placeholder="🔍 Tìm theo tên hoặc ID..." oninput="renderPlayers()" style="margin-top:12px">
        <div style="overflow-x:auto">
          <table id="playerTable">
            <thead><tr><th>Tên</th><th>ID</th><th>Điểm</th><th>📒 Nợ</th><th>Thao tác</th></tr></thead>
            <tbody id="playerBody"></tbody>
          </table>
        </div>
        <div class="card epOnly" style="display:none">
          <h2>🔌 Bật / tắt chức năng người chơi <span class="muted" style="font-size:13px;font-weight:400">(chỉ cổng SUPER)</span></h2>
          <div class="note">Tắt mục nào thì mục đó <b>biến mất khỏi web</b> của người chơi <b>và tab tương ứng trong header admin ẩn luôn</b> và <b>mọi thao tác của mục đó bị server từ chối</b> - sửa trình duyệt cũng không lách được. Ván đang chơi dở vẫn rút tiền ra được bình thường. Không đụng tới 🪪 Cá nhân, 📒 Nợ, 🎁 Quà.</div>
          <div id="featBox" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
        </div>
        <div class="note">Cột <b>📒 Nợ</b>: còn nợ là người chơi KHÔNG mua được đồ ở shop item, KHÔNG nhận quà admin tặng, KHÔNG tặng đồ trong rương, KHÔNG ghép ngọc / mở vòng quay / nhận pet boss (rút KNB và đồ vào game vẫn được; 14/09 bỏ hẳn nhãn nợ xấu). Nút <b>Ghi nợ</b> dùng ô số bên cạnh - cộng vào khoản nợ ADMIN (không trần, số âm = giảm; từ 04/09 khoản này CŨNG đẻ lãi ngày như nợ vay); <b>Xóa nợ</b> xóa sạch cả nợ vay lẫn nợ ghi.</div>
      </div>

      <div class="card">
        <h3>📒 Bảng VAY NỢ trong Discord</h3>
        <label>Channel ID (kênh đăng bảng - trạng thái: <span id="vayLive">?</span>)</label>
        <input id="vayChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="vayStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="vayStop()">⏹️ Gỡ bảng</button>
        </div>
        <div class="row" style="margin-top:12px">
          <div style="flex:1"><label>💰 Vay tối đa / ngày</label><input id="loanDaily" type="number" placeholder="vd: 20000"></div>
          <div style="flex:1"><label>📦 Ôm nợ tối đa (trần)</label><input id="loanCap" type="number" placeholder="vd: 60000"></div>
          <div style="flex:1"><label>🩸 Phí vay + lãi mỗi ngày (%)</label><input id="loanFee" type="number" step="1" placeholder="vd: 20"></div>
          <button class="btn-green" onclick="loanCfgSave()">💾 Lưu cấu hình vay</button>
        </div>
        <div class="note">Bảng có 3 nút: <b>💰 Vay</b> · <b>💳 Trả nợ</b> · <b>📄 Nợ của tôi</b>. % ở trên dùng cho CẢ HAI lớp: <b>phí cộng NGAY lúc vay</b> (20%: vay 10.000 ghi sổ 12.000) và <b>LÃI KÉP mỗi ngày qua mốc 00:00</b> trên CẢ CỤC NỢ - kể cả nợ admin ghi tay (12.000 qua 1 ngày = 14.400, lì 3 ngày = 20.736), có thông báo réo tên ở kênh bảng vay. Sửa 3 ô trên rồi <b>Lưu</b> + <b>Đăng lại bảng</b> để text mới có hiệu lực. <b>14/09 bỏ hẳn nhãn NỢ XẤU</b>: giờ cứ CÒN NỢ MỘT ĐỒNG là bị khoá đúng 3 việc - không mua đồ ở <b>shop item</b>, không nhận <b>quà admin tặng</b>, không <b>tặng đồ trong rương</b>. Chuyển tiền, chuyển KNB vào game, minigame, cổ phiếu, vay thêm đều KHÔNG bị đụng. Trả sạch nợ là mở khoá ngay.</div>
      </div>

      <div class="card danger">
        <h3>🧨 Reset mùa mới - xóa sạch ví người chơi cũ</h3>
        <div class="note">Dùng khi mở lại mini game (vd: bắt đầu lại ví KNB Thiên Long). Toàn bộ ví hiện tại bị <b>xóa khỏi database</b>, ai chơi lại sẽ được tạo ví mới với số dư khởi điểm mặc định. Yêu cầu rút đang chờ sẽ bị hủy và lệnh ép mìn bị gỡ. Bot tự lưu 1 file <b>database.backup-reset-*.json</b> cạnh database trước khi xóa.</div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="resetHistory" style="width:auto;margin:0">
          Xóa luôn lịch sử Big Small / Dò Mìn + lịch sử rút KNB
        </label>
        <div class="row" style="margin-top:12px">
          <button class="btn-red" style="flex:1" onclick="resetAllPlayers()">🗑️ Xóa toàn bộ ví (<span id="resetCount">0</span> người)</button>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="toasts"></div>

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
// 10/09: innerHTML "lười" - gán lại ĐÚNG chuỗi đã gán lần trước (và số con không đổi) thì
// KHÔNG đụng DOM. Nhịp 3s dựng lại ~40 khối; khối nào dữ liệu y cũ giờ đứng yên -> giữ
// được bôi đen + vệt Ctrl+F ở cả 2 cổng, chỉ khối có số đổi (sàn CP, giờ) mới vẽ lại.
// Đếm childNodes để chỗ nào gán '' rồi appendChild vẫn reset đúng như cũ.
(function(){
  const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!d||!d.set)return;
  Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,enumerable:d.enumerable,get:d.get,
    set:function(v){v=String(v);if(this.__hs===v&&this.__hn===this.childNodes.length)return;d.set.call(this,v);this.__hs=v;this.__hn=this.childNodes.length;}});
})();
// Server nhúng giá trị này vào trang (xem handler GET '/'). true = panel không có
// mật khẩu, vào thẳng, không hiện bảng đăng nhập.
const AUTH_OFF = __AUTH_OFF__;
// 04/10: true = đang vào cổng mod (server nhúng theo cổng) -> chỉ hiện 📒 Nhật ký, không gọi /api/state (server chặn 403)
const CONG_MOD = __CONG_MOD__;
let TOKEN = localStorage.getItem('panel_token') || '';
let STATE = null;
let mineSel = new Set();

// Thông báo nổi: xếp chồng (tối đa 5), thời gian hiện theo độ dài chữ (lỗi ≥6s), tin TRÙNG
// trong 1.5s thì bỏ qua (api() đã toast lỗi rồi, caller toast lại không bị hiện đôi).
// Bấm vào toast để tắt sớm.
let lastToast={msg:'',at:0};
function toast(msg){
  msg=String(msg==null?'':msg);
  const now=Date.now();
  if(msg===lastToast.msg&&now-lastToast.at<1500)return;
  lastToast={msg:msg,at:now};
  const box=document.getElementById('toasts');
  if(!box)return;
  const isErr=/^(❌|⚠️|⛔)/.test(msg), isOk=/^(✅|🎁|💾|▶️|🔄|🎲|⚡|🏆|🧹|🔗|📒|↩️|⏹️|🗑️|🌊)/.test(msg);
  const el=document.createElement('div');
  el.className='toast'+(isErr?' err':(isOk?' ok':''));
  el.textContent=msg;
  const kill=()=>{el.classList.remove('show');setTimeout(()=>el.remove(),260);};
  el.onclick=kill;
  box.appendChild(el);
  while(box.children.length>5)box.firstChild.remove();
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(kill,Math.min(10000,Math.max(isErr?6000:2600,1200+msg.length*55)));
}

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
  let r;
  // 08/09: fetch đứt (bot tắt / mạng rớt / proxy) trước đây KHÔNG toast gì - admin bấm nút mà
  // im lặng, phải F12 mới biết. Giờ mọi đường lỗi đều ra toast, kèm cờ toasted để caller nào
  // .catch(e=>toast(...)) cũng không hiện đôi.
  try{ r=await fetch(path,opt); }
  catch(e){ throw apiErr('Không gọi được bot ('+(e.message||'mạng đứt')+') - bot tắt hay mất mạng?'); }
  const j=await r.json().catch(()=>({}));
  if(r.status===401){logout();throw new Error('401');}
  if(!j.ok){
    let m=j.error;
    if(!m){
      if(r.status===403)m='Cổng này chỉ được XEM - vào cổng SUPER để thao tác';
      else if(r.status===502||r.status===504)m='Bot/proxy không phản hồi kịp (HTTP '+r.status+') - lệnh có thể VẪN đang chạy, kiểm tra log trước khi bấm lại';
      else m='Bot trả về lỗi HTTP '+r.status;
    }
    throw apiErr(m);
  }
  return j;
}
function apiErr(m){toast('❌ '+m);const e=new Error(m);e.toasted=true;return e;}
// Lưới an toàn: lỗi JS nào lọt ra ngoài (promise không .catch, code trong .then ném) đều hiện
// toast thay vì chỉ nằm trong Console.
window.addEventListener('unhandledrejection',e=>{const r=e.reason;if(r&&(r.toasted||r.message==='401'))return;toast('❌ '+((r&&r.message)||r||'Lỗi không rõ'));});
window.addEventListener('error',e=>{if(e&&e.message)toast('❌ Lỗi trang: '+e.message);});
// Nút bận dùng chung (như bảng người chơi): khoá nút + đổi chữ ⏳ tới khi việc xong, thành công
// hay lỗi đều trả nút về như cũ. Dùng: onclick="chatDelete('x',this)" → runBtn(this,'Đang xóa...',fn)
async function runBtn(btn,label,fn){
  if(!btn||!btn.tagName)return fn();
  if(btn.dataset.busy)return;
  const orig=btn.innerHTML;btn.dataset.busy='1';btn.disabled=true;btn.textContent='⏳ '+label;
  try{return await fn();}
  catch(e){if(!(e&&e.toasted))toast('❌ '+(e.message||'Lỗi'));}
  finally{btn.disabled=false;delete btn.dataset.busy;btn.innerHTML=orig;}
}

// ===== CỤM CAN THIỆP =====
// Quyền theo CỔNG đang vào (server trả state.superAdmin): cổng SUPER thấy hết,
// cổng admin thường ẩn + server chặn cứng.
function epApply(on){document.querySelectorAll('.epOnly').forEach(el=>{el.style.display=on?'':'none';});
  // 04/09: cổng thường = 2 tab 👥/🐉 chỉ XEM (CSS khoá mọi input/nút, server cũng chặn 403)
  document.body.classList.toggle('viewonly',!on);}

async function login(){
  const pw=document.getElementById('pw').value;
  let r;
  try{r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});}
  catch(e){document.getElementById('loginErr').textContent='Không gọi được bot ('+e.message+') - bot tắt hay mất mạng?';return;}
  const j=await r.json().catch(()=>({}));
  if(j.ok){TOKEN=j.token;localStorage.setItem('panel_token',TOKEN);showApp();}
  else document.getElementById('loginErr').textContent='Sai mật khẩu';
}
function logout(){TOKEN='';localStorage.removeItem('panel_token');document.getElementById('login').classList.remove('hidden');document.getElementById('app').classList.add('hidden');}

function showApp(){
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  nkBatDau();
  if(CONG_MOD){modApp();return;}   // 📒 04/10: cổng mod chỉ có Nhật ký
  initSelects();
  // F5 đứng nguyên tab đang xem (lưu ở localStorage), không nhảy về tab đầu
  const saved0=localStorage.getItem('panel_tab');
  const saved=saved0==='pal'?'tlbb':saved0;   // 06/10: tab 'pal' đổi tên thành 'tlbb'
  // 'bc'/'xs' bỏ khỏi danh sách: ai từng mở 2 tab đó trước khi tắt thì nay về Big Small.
  // 28/08: thêm 'stock' (Cổ phiếu) - trước bị sót nên F5 ở tab đó cũng nhảy về Big Small.
  // 05/10: khôi phục MỌI tab đang có (trước chỉ 1 danh sách cũ -> F5 ở 🧰 Rương / 💎 Ghép Ngọc / 📊 Bảng rơi nhảy về tab đầu)
  if(saved&&document.getElementById('tab-'+saved)&&document.querySelector('.tabs button[data-tab="'+saved+'"]')) tab(saved);
  const savedLog=localStorage.getItem('panel_log');
  logPick(['nk','tx','rl','mine','dog'].includes(savedLog)?savedLog:'nk');   // 04/10: bỏ stair/spm (game không dùng, nút đã ẩn)
  refresh();
  // 10/09: nhịp 3s = refresh(false) (tự động, tôn trọng "giữ màn hình"); refresh() sau khi bấm
  // nút = ép vẽ lại ngay (admin vừa thao tác thì muốn thấy kết quả, kể cả đang bôi chữ / ⏸).
  setInterval(()=>refresh(false),3000);
}

function tab(t){
  // 17/09: bỏ 'xs' (tab Xổ Số đã xoá 17/09 nhưng còn sót ở đây -> null.classList, bấm tab nào cũng chết).
  // Chốt if(el): sau này gỡ tab khác mà quên sửa danh sách thì tab đó im lặng, KHÔNG làm chết cả panel.
  ['tx','stx','rl','mine','stair','bj','stock','spm','user','tlbb','gm','drop','tb','log','gift','gn','gnx','vqx','br','give','poker','tienlen','qua'].forEach(x=>{const el=document.getElementById('tab-'+x);if(el)el.classList.toggle('hidden',x!==t)});
  if(t==='give')gvLoad();if(t==='gn'&&typeof gnaLoad==='function')gnaLoad();if(t==='vqx')vqxLoad();if(t==='gnx'&&typeof gnxLoad==='function')gnxLoad();if(t==='br'&&typeof brLoad==='function')brLoad();if(t==='gm')gmLoad();if(t==='qua'){gmLoad();quaSec();}if(t==='drop'&&!DP.st)dropLoad();if(t==='tb'){if(CONG_MOD)tbXemLoad();else if(!TB.st)tbLoad();}if(t==='gift'){giftFill(true);vqaLoad();}if(t==='poker')pokerFill();
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  localStorage.setItem('panel_tab',t);
}

// 🏷️ 16/09: danh sách nhóm hàng - vẽ 1 lần rồi giữ nguyên (poll 3s không cuốn chữ admin đang gõ)
let ICROWS=null;
// force=true khi THÊM/XOÁ/LƯU. Nhịp làm mới 3 giây gọi icDraw() không force -> chỉ dựng lần đầu,
// nhờ vậy chữ admin đang gõ không bị thay mới mất (oninput đã ghi thẳng vào ICROWS rồi).
function icDraw(force){
  const box=document.getElementById('icBody'); if(!box) return;
  if(!ICROWS) ICROWS=(STATE.itemCats||[]).map(c=>({key:c.key,label:c.label,lock:!!c.lock}));
  if(!force && box.dataset.built==='1') return;
  box.dataset.built='1';
  box.innerHTML=ICROWS.map((c,i)=>
    '<div class="row" style="align-items:center;gap:8px;margin-bottom:6px">'+
      '<span class="muted" style="flex:0 0 96px;font-size:12px">'+(c.lock?'🔒 ':'')+esc(c.key||'(mới)')+'</span>'+
      '<input class="mini-in" style="flex:1" value="'+esc(c.label)+'" oninput="icSet('+i+',this.value)">'+
      (c.lock?'<span class="muted" style="font-size:12px;flex:0 0 74px">khoá</span>'
             :'<button class="btn-red" style="flex:0 0 74px;padding:6px 8px" onclick="icDel('+i+')">🗑️ Xoá</button>')+
    '</div>').join('')||'<div class="muted">Chưa có nhóm nào.</div>';
}
function icSet(i,v){ if(ICROWS&&ICROWS[i]) ICROWS[i].label=v; }
// <option> dùng chung cho mọi ô chọn nhóm (dòng shop + ô lọc) - luôn theo danh sách hiện tại
function icOpts(){ return ((STATE&&STATE.itemCats)||[]).map(c=>'<option value="'+esc(c.key)+'">'+esc(c.label)+'</option>').join(''); }
// ô LỌC nhóm: dựng lại khi danh sách đổi, giữ nguyên lựa chọn đang có
function icFillFilter(){
  const el=document.getElementById('isfFilterCat'); if(!el) return;
  const sig=((STATE&&STATE.itemCats)||[]).map(c=>c.key+'|'+c.label).join(',');
  if(el.dataset.built===sig) return;
  const keep=el.value; el.dataset.built=sig;
  el.innerHTML='<option value="">Mọi nhóm</option>'+icOpts();
  el.value=keep;
}
function icAdd(){ if(!ICROWS)ICROWS=[]; ICROWS.push({key:'',label:'🆕 Nhóm mới',lock:false}); icDraw(true); }
async function icDel(i){
  if(!ICROWS||!ICROWS[i]) return;
  if(!await uiConfirm('Xoá nhóm <b>'+esc(ICROWS[i].label)+'</b>? Nhóm còn món thì server sẽ từ chối.','🗑️ Xoá','btn-red')) return;
  ICROWS.splice(i,1); icDraw(true);
}
async function icSave(btn){
  if(!ICROWS) return;
  await runBtn(btn,'Lưu...',()=>api('/api/itemcats/save',{cats:ICROWS.map(c=>({key:c.key,label:c.label}))})
    .then(j=>{ICROWS=(j.cats||[]).map(c=>({key:c.key,label:c.label,lock:!!c.lock}));toast('💾 Đã lưu '+ICROWS.length+' nhóm');icDraw(true);refresh();})
    .catch(e=>{toast('❌ '+e.message);}));
}

// Kênh + role thông báo phát KNB toàn server (đổi Discord mới chỉ cần lưu lại ở đây)
function gaSave(){
  const c=document.getElementById('gaChannel').value.trim();
  const r=document.getElementById('gaRole').value.trim();
  if(!c)return toast('Nhập Channel ID');
  api('/api/giveaway/config',{channelId:c,roleId:r}).then(j=>{toast('✅ Thông báo phát sẽ vào #'+j.name);refresh();}).catch(()=>{});
}
function renderGiveaway(){
  if(!STATE||!STATE.giveaway)return;
  const c=document.getElementById('gaChannel'); if(c&&!c.value&&STATE.giveaway.channelId)c.value=STATE.giveaway.channelId;
  const r=document.getElementById('gaRole'); if(r&&!r.value&&STATE.giveaway.roleId)r.value=STATE.giveaway.roleId;
}
async function resetDaily(){
  if(!await uiConfirm('Reset điểm danh cho CẢ danh sách? Mọi người /diemdanh nhận thưởng lại được ngay hôm nay.','🔄 Reset','btn-red'))return;
  api('/api/points/reset-daily',{}).then(j=>{toast('🔄 Đã reset điểm danh cho '+j.count+' ví');refresh();}).catch(()=>{});
}

// Sổ biến động KNB - dữ liệu đến từ STATE (poll mỗi 3s) nên không cần gọi riêng.
const DOG_TYPE_LABEL = {
  'admin+':'➕ Admin cộng', 'admin-':'➖ Admin trừ', 'transfer':'🔁 Chuyển',
  'to-game':'🎮 Rút vào game', 'from-game':'💬 Nạp ra Discord', 'shop':'🛒 Mua shop', 'refund':'↩️ Hoàn tiền',
  'vay':'🏦 Vay', 'trano':'💳 Trả nợ', 'taxi':'🚕 Xu đi taxi về',
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

// Bảng liên kết Discord ↔ tên nhân vật (cầu KNB tự động đọc ingameName này)
// ===== 🛠️ GM THIÊN LONG (29/09): dùng chung logic panel GM qua /api/gm/* =====
var GM={st:null,timer:null};
var GM_KINDS=[['item','Vật phẩm (ID)'],['xoa','XOÁ vật phẩm (ID)'],['knb','KNB'],['vang','Vàng'],['diemtang','Điểm Tặng'],['level','Lên cấp (1-119)'],['vip','Cấp VIP (0-10)'],['popup','Quà popup (cửa sổ, chọn người)'],['pet12','🐾 Pet Huyễn Hóa 12000 (admin cấp)'],['petv2','🐾 Pet Huyễn Hóa V2 (chỉ số bình thường)'],['pettt','🐾 Pet Huyễn Hóa Tân Thủ (cấp mang 5)'],['petall','🐾 Pet khác (tất cả)']];
var GM_PH={item:'ID vật phẩm',xoa:'ID cần xoá',knb:'Số KNB (1-10.000.000)',vang:'Số vàng (1-100.000)',diemtang:'Số Điểm Tặng',level:'Cấp (1-119)',vip:'Cấp VIP 0-10',popup:'ID vật phẩm',pet12:'',petv2:'',petall:'',pettt:'',pet:'ID pet (vd 25351 Tần Vương - docs/pet-huyen-hoa.md)'};
function gmGiveForm(g){
  var o=GM_KINDS.map(function(k){return '<option value="'+k[0]+'">'+k[1]+'</option>';}).join('');
  return '<span class="row" style="gap:6px;flex-wrap:wrap;min-width:300px"><select class="mini-in" id="gmL'+g+'" data-kindfor="'+g+'" style="min-width:165px;max-width:230px">'+o+'</select>'+
    '<input class="mini-in" style="width:130px" id="gmV'+g+'" placeholder="ID vật phẩm">'+
    '<select class="mini-in" id="gmP'+g+'" style="display:none;max-width:300px"></select>'+   // 🐾 30/09: chọn pet V2 theo tên (từ st.pets)
    '<input class="mini-in" style="width:52px" id="gmS'+g+'" value="1" placeholder="SL">'+
    '<button class="mini '+(g==='all'?'btn-red':'btn-green')+'" data-give="'+g+'">'+(g==='all'?'Gửi tất cả':'Gửi')+'</button></span>';
}
var GM_PETS=null;   // 30/09: nhom pet (V2 / 12000 / tat ca 6.320) tai 1 lan tu /api/gm/pets
function gmPetsFill(sel,gi){   // gi: 0 = V2, 1 = 12000, 2 = tat ca, 3 = Tan Thu cap 5 (thu tu nhom tu /api/gm/pets)
  var fill=function(){var gr=GM_PETS[gi]||{pets:[]};sel.innerHTML=gr.pets.map(function(x){return '<option value="'+x.id+'">'+x.id+' - '+esc(x.name)+'</option>';}).join('');sel.dataset.gi=String(gi);};
  if(GM_PETS)return fill();
  sel.innerHTML='<option value="">đang tải danh sách pet...</option>';
  api('/api/gm/pets',{}).then(function(j){GM_PETS=j.groups||[];fill();}).catch(function(){sel.innerHTML='<option value="">lỗi tải - bấm 🔄</option>';});
}
function gmKind(g){
  var s=document.getElementById('gmL'+g),v=document.getElementById('gmV'+g),q=document.getElementById('gmS'+g);
  if(!s||!v||!q)return;var it=s.value==='item'||s.value==='xoa';v.placeholder=GM_PH[s.value]||'';q.style.display=it?'':'none';
  var p=document.getElementById('gmP'+g),gi={pet12:1,petv2:0,petall:2,pettt:3}[s.value],pet=gi!==undefined;v.style.display=pet?'none':'';
  if(p){p.style.display=pet?'':'none';if(pet&&p.dataset.gi!==String(gi))gmPetsFill(p,gi);}
}
function gmRender(){
  var st=GM.st;if(!st)return;
  var procs=Object.keys(st.procs).map(function(p){return '<span style="color:'+(st.procs[p]?'#35c46a':'#e0566b')+'">'+p+'</span>';}).join(' · ');
  document.getElementById('gmStatus').innerHTML=procs+' &nbsp;|&nbsp; Online: <b>'+st.online+'</b> &nbsp;|&nbsp; RAM: '+st.ram[0]+'/'+st.ram[1]+' MB'+(st.dbError?'<br><b style="color:#e0566b">Không đọc được database: '+esc(st.dbError)+'</b>':'');
  document.getElementById('gmAccN').textContent='('+st.accounts.length+')';
  document.getElementById('gmCharN').textContent='('+st.chars.length+')';
  document.getElementById('gmItemN').textContent=st.itemCount.toLocaleString('vi-VN')+' vật phẩm trong danh mục';
  // 03/10: ô đã sửa mà chưa lưu (data-sua) KHÔNG bị lần tải lại 15 giây ghi đè - trước đây gõ ô này, bấm sang ô khác là ô trước bị trả về số cũ
  GM_O.forEach(function(o){var el=document.getElementById(o[0]);if(el&&el.dataset.sua!=='1'&&document.activeElement!==el&&st[o[1]]!==undefined)el.value=st[o[1]];});
  var ed=document.getElementById('gmExpDef');if(ed&&st.expDefault!==undefined)ed.textContent=st.expDefault;
  gmSuaNote();
  document.getElementById('gmAccs').innerHTML='<table><tr><th>ID</th><th>Tài khoản</th><th>Online</th><th></th></tr>'+
    st.accounts.map(function(a){
      return '<tr><td>'+esc(a.id)+'</td><td><b>'+esc(a.name)+'</b></td><td>'+(a.online?'<b style="color:#35c46a">online</b>':'<span class="muted">-</span>')+'</td>'+
        '<td><span class="row" style="gap:6px;flex-wrap:nowrap"><input class="mini-in" style="width:120px" id="gmPw_'+esc(a.name)+'" placeholder="mật khẩu mới">'+
        '<button class="mini" data-gm="doi_mk" data-ten="'+esc(a.name)+'">Đổi MK</button>'+
        '<button class="mini" data-gm="go_ket" data-ten="'+esc(a.name)+'">🩹 Gỡ kẹt</button>'+
        (a.name!=='admin'?'<button class="mini btn-red" data-gm="xoa_tk" data-ten="'+esc(a.name)+'" data-confirm="Xoá tài khoản '+esc(a.name)+'?">Xoá</button>':'')+'</span></td></tr>';
    }).join('')+'</table>';
  // 08/10: bảng nhân vật gọn - online lên đầu, GUID + tài khoản dưới tên, lọc tại chỗ (gmLoc) không gọi lại server
  var dsNv=st.chars.slice().sort(function(x,y){return (y.online?1:0)-(x.online?1:0)||String(x.name).localeCompare(String(y.name),'vi');});
  document.getElementById('gmChars').innerHTML='<table class="quaTb"><tr><th>Nhân vật</th><th>Cấp</th><th>Trạng thái</th><th>GM</th><th>Quà đang chờ</th><th>Phát quà</th></tr>'+
    dsNv.map(function(c){
      var pend=c.pending.length?'<span class="qChoN">'+c.pending.length+' món</span><br>'+c.pending.map(esc).join('<br>')+'<br><button class="mini" data-gm="huy_qua" data-guid="'+c.guid+'" data-confirm="Huỷ toàn bộ quà đang chờ của '+esc(c.name)+'?">Huỷ</button>':'<span class="muted">-</span>';
      var gm=c.gm?'<b style="color:#f1c40f">GM</b> <button class="mini btn-red" data-gm="gm_tat" data-guid="'+c.guid+'">Tắt</button>':'<button class="mini" data-gm="gm_bat" data-guid="'+c.guid+'">Cấp GM</button>';
      return '<tr class="'+(c.online?'qOn':'')+'" data-q="'+esc(String(c.name+' '+c.account+' '+c.guid).toLowerCase())+'" data-on="'+(c.online?1:0)+'" data-cho="'+(c.pending.length?1:0)+'">'+
        '<td class="qNm"><b>'+esc(c.name)+'</b><small>'+esc(c.account)+' · '+c.guid+'</small></td><td>'+esc(c.level)+'</td>'+
        '<td><span class="qDot'+(c.online?' on':'')+'"><i></i>'+(c.online?'online':'offline')+'</span></td>'+
        '<td>'+gm+'</td><td class="qCho">'+pend+'</td><td>'+gmGiveForm(c.guid)+'</td></tr>';
    }).join('')+'</table>';
  if(!document.getElementById('gmLall'))document.getElementById('gmAllForm').innerHTML=gmGiveForm('all');
  gmLoc();
  document.querySelectorAll('#tab-gm select[data-kindfor], #tab-qua select[data-kindfor]').forEach(function(s){gmKind(s.dataset.kindfor);});
}
// ===== 🧰 08/10: món Thương Phố được rút qua Rương Ích Kỷ (thuongpho.js cfg().ik) =====
var TPIK=[],TPIKTAB='all';
// nhom theo ten (khong dung regex co dau gach nguoc - panel.js la template literal)
var TPIKNHOM=[['yq','📜 Yếu Quyết'],['ngoc','💎 Ngọc / Minh Thạch'],['dv','🪡 Điêu Văn'],['nh','🔮 Nhuận Hồn'],['phu','📃 Phù'],['khac','📦 Khác']];
function tpikLoai(x){var n=String(x.ten||'').toLowerCase(),id=String(x.id);
  if(n.indexOf('yếu quyết')>=0)return 'yq';if(n.indexOf('nhuận hồn')>=0)return 'nh';if(n.indexOf('điêu văn')>=0)return 'dv';
  if(id.charAt(0)==='5'||n.indexOf('minh thạch')>=0||n.indexOf('bảo thạch (cấp')>=0)return 'ngoc';if(n.indexOf('phù')>=0)return 'phu';return 'khac';}
function tpikVe(){
  TPIK.forEach(function(x){x.ten=String(x.ten||'').replace(/#c[0-9A-Fa-f]{6}|#[GYWRBK]/g,'');});
  var b=document.getElementById('tpikDs'),tb=document.getElementById('tpikTabs');if(!b)return;
  document.getElementById('tpikN').textContent=TPIK.length?('('+TPIK.length+' món)'):'(chưa có món nào)';
  var dem={};TPIK.forEach(function(x){var l=tpikLoai(x);dem[l]=(dem[l]||0)+1;});
  if(TPIKTAB!=='all'&&!dem[TPIKTAB])TPIKTAB='all';
  tb.innerHTML='<button class="tpkTab'+(TPIKTAB==='all'?' on':'')+'" data-k="all" onclick="tpikTab(this.dataset.k)">Tất cả<span>'+TPIK.length+'</span></button>'+
    TPIKNHOM.filter(function(g){return dem[g[0]];}).map(function(g){return '<button class="tpkTab'+(TPIKTAB===g[0]?' on':'')+'" data-k="'+g[0]+'" onclick="tpikTab(this.dataset.k)">'+g[1]+'<span>'+dem[g[0]]+'</span></button>';}).join('');
  var q=String((document.getElementById('tpikQ')||{}).value||'').trim().toLowerCase();
  var TH={};TPIKNHOM.forEach(function(g,i){TH[g[0]]=i;});
  var L=TPIK.slice().sort(function(x,y){return (TH[tpikLoai(x)]-TH[tpikLoai(y)])||String(x.ten).localeCompare(String(y.ten),'vi');}).filter(function(x){if(TPIKTAB!=='all'&&tpikLoai(x)!==TPIKTAB)return false;if(!q)return true;return String(x.ten).toLowerCase().indexOf(q)>=0||String(x.id).indexOf(q)>=0;});
  b.innerHTML=!TPIK.length?'<div class="tpkEmpty">Trống - người chơi chưa rút qua Rương Ích Kỷ được món nào. Bấm 🔄 Đồng bộ đồ trade Ghép Ngọc hoặc thêm ID.</div>'
    :!L.length?'<div class="tpkEmpty">Không có món khớp bộ lọc</div>'
    :L.map(function(x){return '<div class="tpkIt">'+vqaIc(x.ic)+'<div class="tpkNm"><b title="'+esc(x.ten)+'">'+esc(x.ten)+'</b><small>'+x.id+(x.cho?'':' · <span class="tpkWarn" title="NPC Ví Web không chuyển món này ra Thương Phố">⚠ không ra Thương Phố được</span>')+'</small></div>'
      +'<button class="tpkX" title="Bỏ khỏi danh sách" data-id="'+x.id+'" onclick="tpikXoa(this.dataset.id)">✕</button></div>';}).join('');
}
function tpikTab(k){TPIKTAB=k;tpikVe();}
function tpikLoad(){api('/api/tpik/state',{}).then(function(j){TPIK=j.ds||[];tpikVe();}).catch(function(){});}
// luu theo ban MOI NHAT tren server (trang mo lau khong ghi de mat thay doi cua nguoi khac / cua script)
function tpikDoi(them,bo,msg){api('/api/tpik/state',{}).then(function(j){
  var ids=(j.ds||[]).map(function(x){return x.id;}).filter(function(x){return bo.indexOf(x)<0;}).concat(them);
  return api('/api/tpik/save',{ids:ids});}).then(function(j){TPIK=j.ds||[];tpikVe();toast(msg+' · còn '+TPIK.length+' món');}).catch(function(){tpikLoad();});}
function tpikThem(){
  var i=document.getElementById('tpikIn');var moi=(i.value.match(/[0-9]{8}/g)||[]);
  if(!moi.length){toast('Nhập ID món (8 chữ số)');return;}
  i.value='';tpikDoi(moi,[],'🧰 Đã thêm '+moi.length+' ID');
}
function tpikXoa(id){tpikDoi([],[id],'🗑️ Đã bỏ '+id);}
function tpikSync(){api('/api/tpik/sync',{}).then(function(j){TPIK=j.ds||[];tpikVe();toast('🔄 Đồng bộ xong: thêm '+(j.them||0)+' món trade · tổng '+TPIK.length);}).catch(function(){tpikLoad();});}
// 08/10: lọc bảng nhân vật tại chỗ (tên / tài khoản / GUID, chỉ online, có quà chờ)
function gmLoc(){
  var q=String((document.getElementById('gmLocQ')||{}).value||'').trim().toLowerCase(),on=(document.getElementById('gmLocOn')||{}).checked,cho=(document.getElementById('gmLocCho')||{}).checked;
  var rs=document.querySelectorAll('#gmChars tr[data-q]'),n=0;
  rs.forEach(function(r){var ok=(!q||r.dataset.q.indexOf(q)>=0)&&(!on||r.dataset.on==='1')&&(!cho||r.dataset.cho==='1');r.style.display=ok?'':'none';if(ok)n++;});
  var el=document.getElementById('gmLocN');if(el)el.textContent=rs.length?('hiện '+n+'/'+rs.length):'';
}
// 08/10: 3 mục của tab 🎁 Phát quà & GM, nhớ mục đang mở
function quaSec(k){
  if(!k){try{k=localStorage.getItem('qua_sec')||'phat';}catch(e){k='phat';}}
  if(k==='congcu'&&typeof CONG_MOD!=='undefined'&&CONG_MOD)k='phat';
  ['phat','caidat','congcu'].forEach(function(x){var el=document.getElementById('qsec-'+x);if(el)el.classList.toggle('hidden',x!==k);});
  document.querySelectorAll('#quaNav button').forEach(function(b){b.classList.toggle('on',b.dataset.qsec===k);});
  try{localStorage.setItem('qua_sec',k);}catch(e){}
}
function gmLoad(){
  if(typeof TOKEN==='undefined'||!TOKEN)return;
  tpikLoad();
  api('/api/gm/state',{}).then(function(j){GM.st=j.state;gmRender();}).catch(function(){});
  if(!GM.timer)GM.timer=setInterval(function(){
    var tb=['tab-gm','tab-qua'].map(function(x){return document.getElementById(x);}).filter(function(x){return x&&!x.classList.contains('hidden');})[0];if(!tb)return;
    var ae=document.activeElement;if(ae&&tb.contains(ae)&&(ae.tagName==='INPUT'||ae.tagName==='SELECT'))return;
    api('/api/gm/state',{}).then(function(j){GM.st=j.state;gmRender();}).catch(function(){});
  },15000);
}
// 🧵 02/10: Mẫu đồ chế 8x/9x (panel GM maudoche.py). MD = {data:{mon,rate,dongTen}, mau:{id:{dong,capPC,tuChat,t}}}
var MD=null,MDSEL='';
function mdLoad(){api('/api/gm/doche',{}).then(function(j){MD=j;mdDraw();}).catch(function(e){toast('❌ '+e.message);});}
function mdMon(id){var a=MD.data.mon;for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function mdTen(k){return String(MD.data.dongTen[k]||('dòng '+k)).replace('*','');}
function mdKhoang(m,k,cap){var r=MD.data.rate,v=m.v[String(k)]||0,ra=r[String(cap)],rb=r[String(cap+1)]||ra;if(!ra)return '?';
  var a=ra[k],b=rb[k],lo=Math.ceil(v*a/100),hi=m.T>0?Math.ceil(v*(a+(b-a)*0.99/m.T)/100):lo;return lo===hi?String(lo):lo+'–'+hi;}
function mdDraw(){if(!MD)return;var box=document.getElementById('mdBox'),h='',ids=Object.keys(MD.mau||{});
  if(ids.length){h+='<div class="note" style="margin:0 0 8px;border-color:#c0392b"><b>⚠️ Đang áp '+ids.length+' mẫu</b> (ai chế / tẩy các món này cũng ra y hệt - xong nhớ trả):';
    ids.forEach(function(id){var x=MD.mau[id],m=mdMon(id);h+='<div style="margin-top:4px">• <b>'+esc(m?m.ten:id)+'</b> #'+(x.ids||[id]).join(', #')+' · '+x.dong.length+' dòng: '+x.dong.map(mdTen).map(esc).join(', ')+' · cấp '+x.capPC+(x.tuChat?' · tư chất '+x.tuChat:'')+' · '+new Date(x.t*1000).toLocaleString('vi-VN')
      +' <button class="btn-grey" onclick="mdTra(&quot;'+id+'&quot;,0)">↩ Trả mẫu</button> <button class="btn-red" onclick="mdTra(&quot;'+id+'&quot;,1)">↩ Trả + Restart</button></div>';});
    h+='</div>';}
  var opt='<option value="">-- chọn món --</option>',vt='';
  MD.data.mon.forEach(function(m){if(m.vitri!==vt){if(vt)opt+='</optgroup>';vt=m.vitri;opt+='<optgroup label="'+esc(vt)+'">';}
    opt+='<option value="'+m.id+'"'+(m.id===MDSEL?' selected':'')+'>'+esc(m.ten)+(m.loai&&m.loai!==m.vitri?' ('+esc(m.loai)+')':'')+' · cấp '+m.cap+' · #'+m.id+(m.ids&&m.ids.length>1?' (+'+(m.ids.length-1)+' ID giống hệt, áp chung)':'')+(MD.mau[m.id]?' ⚠️ đang áp':'')+'</option>';});
  opt+='</optgroup>';
  h+='<div class="row" style="gap:8px;flex-wrap:wrap"><select id="mdSel" onchange="MDSEL=this.value;mdPick()" style="min-width:320px">'+opt+'</select></div><div id="mdForm" style="margin-top:8px"></div>';
  box.className='epOnly';box.innerHTML=h;mdPick();}
function mdPick(){var el=document.getElementById('mdForm');if(!el)return;var m=MDSEL?mdMon(MDSEL):null;if(!m){el.innerHTML='';return;}
  var cur=MD.mau[m.id],cap=cur?cur.capPC:m.capMax,on={};(cur?cur.dong:[]).forEach(function(k){on[k]=1;});
  var h='<div class="muted" style="margin-bottom:6px">'+(m.ids&&m.ids.length>1?'<b>Áp chung '+m.ids.length+' ID giống hệt</b> (#'+m.ids.join(', #')+') - cầm ID nào cũng ăn mẫu · ':'')+esc(m.vitri)+' cấp '+m.cap+' · tự nhiên ra <b>'+m.min+'–'+m.max+' dòng</b> trong '+m.dong.length+' loại dòng dưới đây · cấp phẩm chất tự nhiên '+m.capMin+'–'+m.capMax+(m.coTuChat?' · tư chất '+m.tcMin+'–'+m.tcMax:'')+'</div>';
  h+='<div class="row" style="gap:12px;flex-wrap:wrap;margin-bottom:6px"><label>Cấp phẩm chất <select id="mdCap" onchange="mdRange()">';
  for(var c=1;c<=m.capMax;c++)h+='<option value="'+c+'"'+(c===cap?' selected':'')+'>'+c+(c===m.capMax?' (cao nhất)':'')+'</option>';
  h+='</select></label>'+(m.coTuChat?'<label>Tư chất <input id="mdTc" class="mini-in" type="number" min="'+m.tcMin+'" max="'+m.tcMax+'" style="width:70px" value="'+(cur&&cur.tuChat?cur.tuChat:m.tcMax)+'"></label>':'')
    +'<span id="mdDem" class="muted"></span></div>';
  h+='<table><thead><tr><th></th><th>Dòng</th><th>Khoảng số ở cấp đã chọn</th></tr></thead><tbody>';
  m.dong.forEach(function(k){h+='<tr><td><input type="checkbox" class="md-k" value="'+k+'" style="width:auto"'+(on[k]?' checked':'')+' onchange="mdRange()"></td><td>'+esc(mdTen(k))+'</td><td class="md-r" data-k="'+k+'"></td></tr>';});
  h+='</tbody></table><div class="row" style="gap:8px;margin-top:8px"><button class="btn-green" onclick="mdAp(0)">💾 Áp mẫu</button><button class="btn-red" onclick="mdAp(1)">💾 Áp mẫu + Restart</button>'
    +(cur?'<button class="btn-grey" onclick="mdTra(&quot;'+m.id+'&quot;,0)">↩ Trả mẫu món này</button>':'')+'</div>';
  el.innerHTML=h;mdRange();}
function mdRange(){var m=mdMon(MDSEL);if(!m)return;var cap=Number(document.getElementById('mdCap').value);
  [].slice.call(document.querySelectorAll('#mdForm .md-r')).forEach(function(td){td.textContent=mdKhoang(m,Number(td.getAttribute('data-k')),cap);});
  var n=document.querySelectorAll('#mdForm .md-k:checked').length,d=document.getElementById('mdDem');
  d.innerHTML='Đã chọn <b>'+n+'</b> / tối đa '+m.max+' dòng'+(n>m.max?' <b style="color:#ff7b7b">quá số dòng</b>':'');}
function mdAp(rs){var m=mdMon(MDSEL);if(!m)return;var ks=[].slice.call(document.querySelectorAll('#mdForm .md-k:checked')).map(function(x){return x.value;});
  if(!ks.length)return toast('Chọn ít nhất 1 dòng');if(ks.length>m.max)return toast('Món này tối đa '+m.max+' dòng');
  var cap=document.getElementById('mdCap').value,tc=document.getElementById('mdTc')?document.getElementById('mdTc').value:'';
  if(!confirm('Áp mẫu '+m.ten+': '+ks.length+' dòng ('+ks.map(function(k){return mdTen(Number(k));}).join(', ')+'), cấp phẩm chất '+cap+(tc?', tư chất '+tc:'')+'?'+(rs?' Server sẽ RESTART ngay (~3 phút, người online bị ngắt).':' Có hiệu lực sau lần restart tới.')+' Trong lúc áp, ai chế / tẩy món này cũng ra y hệt.'))return;
  api('/api/gm/act',{a:'doche_ap',id:m.id,dong:ks.join(','),cap:cap,tc:tc,restart:rs?'1':''}).then(function(j){toast((j.done?'✅ ':'⚠️ ')+j.msg);mdLoad();}).catch(function(){});}
function mdTra(id,rs){var m=mdMon(id);if(!confirm('Trả mẫu '+(m?m.ten:id)+' về gốc?'+(rs?' Server sẽ RESTART ngay.':' Có hiệu lực sau lần restart tới.')+' Đồ đã chế giữ nguyên dòng và số.'))return;
  api('/api/gm/act',{a:'doche_tra',id:id,restart:rs?'1':''}).then(function(j){toast((j.done?'✅ ':'⚠️ ')+j.msg);mdLoad();}).catch(function(){});}
// 🗡️ 04/10: Tẩy 3 dòng ám khí (panel GM amkhi.py). AK = {dong:[{cap, ds:[{id,ten,goc,hien}]}], dangAp, t}
var AK=null;
var AK_TEN_DONG={40:'Dòng 1 · cấp 40 (cộng công)',70:'Dòng 2 · cấp 70 (hiệu ứng lên địch)',90:'Dòng 3 · cấp 90 (chỉ số)'};
// Gợi ý theo chủ server (04/10): dòng 1 giữ ngẫu nhiên như gốc; dòng 2 chủ yếu hiệu ứng khống chế; dòng 3 chủ yếu % máu / % mana
var AK_GOIY={70:{32150:20,32166:20,32182:60,32198:100,32214:100,32230:100,32262:100,32278:100,32294:100,32310:100},
  90:{32328:25,32344:25,32360:25,32376:25,32392:25,32400:400,32401:400,32402:25,32403:25,32404:25,32405:25}};
function akLoad(){api('/api/gm/amkhi',{}).then(function(j){AK=j.data;akDraw();}).catch(function(e){toast('❌ '+e.message);});}
function akDraw(){if(!AK)return;var box=document.getElementById('akBox'),h='';
  h+=AK.dangAp?'<div class="note" style="margin:0 0 8px;border-color:#c0392b"><b>⚠️ Đang dùng trọng số riêng</b> (áp lúc '+new Date(AK.t*1000).toLocaleString('vi-VN')+'). Restart rồi mới có hiệu lực nếu vừa áp.</div>'
    :'<div class="muted" style="margin-bottom:6px">Đang dùng trọng số gốc của game.</div>';
  AK.dong.forEach(function(d){
    h+='<div style="margin-top:8px"><b>'+esc(AK_TEN_DONG[d.cap]||('Dòng cấp '+d.cap))+'</b><table style="width:100%;margin-top:4px"><thead><tr><th style="text-align:left">Kỹ năng</th><th>Gốc</th><th>Trọng số</th><th>Tỉ lệ khi tẩy</th></tr></thead><tbody>';
    var tg=d.ds.reduce(function(a,o){return a+o.goc;},0);
    d.ds.forEach(function(o){h+='<tr><td>'+esc(o.ten)+' <span class="muted">#'+o.id+'</span></td><td style="text-align:center">'+o.goc+' <span class="muted">('+(100*o.goc/tg).toFixed(1)+'%)</span></td>'
      +'<td style="text-align:center"><input class="mini-in ak-w" data-cap="'+d.cap+'" data-id="'+o.id+'" type="number" min="0" max="9999" style="width:80px" value="'+o.hien+'" oninput="akSum()"></td>'
      +'<td style="text-align:center" class="ak-p" data-cap="'+d.cap+'" data-id="'+o.id+'"></td></tr>';});
    h+='</tbody></table></div>';});
  h+='<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button onclick="akGoiY()">✨ Gợi ý: dòng 2 hiệu ứng, dòng 3 % máu / mana</button><button class="btn-grey" onclick="akGoc()">↺ Điền trọng số gốc</button>'
    +'<button class="btn-green" onclick="akAp(0)">💾 Áp</button><button class="btn-red" onclick="akAp(1)">💾 Áp + Restart</button>'
    +(AK.dangAp?'<button class="btn-grey" onclick="akTra(0)">↩ Trả về gốc</button>':'')+'</div>';
  box.className='epOnly';box.innerHTML=h;akSum();}
function akW(cap){return [].slice.call(document.querySelectorAll('#akBox .ak-w[data-cap="'+cap+'"]'));}
function akSum(){[40,70,90].forEach(function(cap){var ws=akW(cap),t=ws.reduce(function(a,x){return a+(Number(x.value)||0);},0);
  ws.forEach(function(x){var td=document.querySelector('#akBox .ak-p[data-cap="'+cap+'"][data-id="'+x.getAttribute('data-id')+'"]');
    if(td)td.innerHTML=t>0?'<b>'+(100*(Number(x.value)||0)/t).toFixed(1)+'%</b>':'<b style="color:#ff7b7b">tổng = 0</b>';});});}
function akGoiY(){[70,90].forEach(function(cap){akW(cap).forEach(function(x){var v=AK_GOIY[cap][x.getAttribute('data-id')];if(v!==undefined)x.value=v;});});
  akW(40).forEach(function(x){var o=null;AK.dong[0].ds.forEach(function(y){if(String(y.id)===x.getAttribute('data-id'))o=y;});if(o)x.value=o.goc;});akSum();toast('Đã điền gợi ý - xem % rồi bấm Áp');}
function akGoc(){AK.dong.forEach(function(d){akW(d.cap).forEach(function(x){var o=null;d.ds.forEach(function(y){if(String(y.id)===x.getAttribute('data-id'))o=y;});if(o)x.value=o.goc;});});akSum();}
function akAp(rs){var f={a:'amkhi_ap',restart:rs?'1':''},ten={40:'wa',70:'wb',90:'wc'},loi='';
  [40,70,90].forEach(function(cap){var ws=akW(cap).map(function(x){return Math.max(0,Math.min(9999,Math.round(Number(x.value)||0)));});if(!ws.reduce(function(a,b){return a+b;},0))loi='Dòng cấp '+cap+' tổng trọng số = 0';f[ten[cap]]=ws.join(',');});
  if(loi)return toast(loi);
  if(!confirm('Áp trọng số tẩy 3 dòng ám khí?'+(rs?' Server sẽ RESTART ngay.':' Có hiệu lực sau lần restart tới.')))return;
  api('/api/gm/act',f).then(function(j){toast((j.done?'✅ ':'⚠️ ')+j.msg);akLoad();}).catch(function(){});}
function akTra(rs){if(!confirm('Trả trọng số tẩy ám khí về gốc của game?'+(rs?' Server sẽ RESTART ngay.':' Có hiệu lực sau lần restart tới.')))return;
  api('/api/gm/act',{a:'amkhi_tra',restart:rs?'1':''}).then(function(j){toast((j.done?'✅ ':'⚠️ ')+j.msg);akLoad();}).catch(function(){});}
function gmDo(form,confirmMsg){
  if(confirmMsg&&!confirm(confirmMsg))return;
  api('/api/gm/act',form).then(function(j){toast((j.done?'✅ ':'⚠️ ')+j.msg);gmLoad();}).catch(function(){});
}
function gmCreateAcc(){
  var n=document.getElementById('gmNewAcc').value.trim(),p=document.getElementById('gmNewPw').value.trim();
  if(!n||!p)return toast('Nhập tên đăng nhập và mật khẩu');
  var uid=(document.getElementById('gmNewUid')||{}).value||'';uid=uid.trim();
  if(uid&&!/^[0-9]{15,20}$/.test(uid))return toast('Discord ID phải là 15-20 chữ số');
  gmDo({a:'tao_tk',ten:n,mk:p,uid:uid});document.getElementById('gmNewPw').value='';
}
// 🎲 04/10: GỠ khung "Rơi thêm qua script" (chỉ có 2 khóa Kỳ Cuộc, không thêm quái được). File Server/txt/NetCo4Cfg/roithem.txt + Lua roimap x950001_RoiCfg + panel game roi_them/roi_xoa VẪN CHẠY (ngọc 6 1.75% + Tử Vi 20% mỗi quân cờ) - sửa tỉ lệ qua SSH
// ⚙️ 03/10: cấp tối thiểu / khóa cấp / EXP - sửa bao nhiêu ô cũng được, 1 nút Lưu chung (panel game act luu_chung), restart 1 lần nếu có ô cần restart
var GM_O=[['gmCapmin','capmin','Cấp tối thiểu',''],['gmCapmax','capmax','Cấp tối đa',''],['gmExp','expparam','EXP','x'],['gmTpmax','tpmax','Tâm pháp tối đa','']];   // tpmax: script đọc mỗi lần học, không restart
function gmDanhDau(el){el.dataset.sua='1';delete el.dataset.macdinh;gmSuaNote();}
function gmDoi(){var st=GM.st||{},out=[];
  GM_O.forEach(function(o){var el=document.getElementById(o[0]);if(!el||el.dataset.sua!=='1')return;var v=String(el.value).trim(),c=st[o[1]];
    if(v!==''&&c!==undefined&&+v===+c)return;out.push({k:o[1],ten:o[2],cu:o[3]+c,moi:v,hien:o[3]+v,md:el.dataset.macdinh==='1'});});
  return out;}
function gmSuaNote(){var n=document.getElementById('gmSuaNote');if(!n)return;var d=gmDoi(),k={};d.forEach(function(x){k[x.k]=1;});
  GM_O.forEach(function(o){var el=document.getElementById(o[0]);if(el)el.style.outline=k[o[1]]?'2px solid #f1c40f':'';});
  n.innerHTML=d.length?'<b style="color:#f1c40f">Chưa lưu: '+d.map(function(x){return esc(x.ten)+' '+esc(x.cu)+' → '+esc(x.hien);}).join(' · ')+'</b>'
    :'Sửa 1 hoặc nhiều ô rồi bấm Lưu 1 lần. Cấp tối thiểu và Tâm pháp tối đa có hiệu lực ngay; có đổi Cấp tối đa / EXP thì server restart 1 lần (~3 phút, người online bị ngắt).';}
function gmBoDanhDau(){GM_O.forEach(function(o){var el=document.getElementById(o[0]);if(el){delete el.dataset.sua;delete el.dataset.macdinh;}});}
function gmHuySua(){gmBoDanhDau();gmRender();}
function gmExpMacDinh(){var el=document.getElementById('gmExp'),d=GM.st&&GM.st.expDefault;if(!el||d===undefined)return;el.value=d;el.dataset.sua='1';el.dataset.macdinh='1';gmSuaNote();}
function gmLuuChung(){
  var d=gmDoi();if(!d.length)return toast('Chưa có ô nào thay đổi');
  var f={a:'luu_chung'},rs=false;
  for(var i=0;i<d.length;i++){var x=d[i],v=x.moi;
    if(x.k==='capmin'){if(!/^[0-9]{1,3}$/.test(v)||+v>119)return toast('Cấp tối thiểu 0–119 (0 = tắt)');f.capmin=v;}
    if(x.k==='capmax'){if(!/^[0-9]{2,3}$/.test(v)||+v<10||+v>119)return toast('Cấp tối đa 10–119');f.capmax=v;rs=true;}
    if(x.k==='tpmax'){if(!/^[0-9]{1,3}$/.test(v)||!(+v===0||(+v>=10&&+v<=159)))return toast('Tâm pháp tối đa 10–159 (0 = luật gốc: cấp nhân vật + 10)');f.tpmax=String(+v);}
    if(x.k==='expparam'){if(x.md)f.exp='macdinh';else{if(!/^[0-9]{1,2}([.][0-9])?$/.test(v)||+v<0.1||+v>50)return toast('EXP 0.1–50, tối đa 1 số lẻ (vd 3 hoặc 2.5)');f.exp=v;}rs=true;}
  }
  var NL=String.fromCharCode(10),on=GM.st&&GM.st.online!==undefined?GM.st.online:'?';
  if(!confirm('Lưu '+d.length+' thay đổi?'+NL+NL+d.map(function(x){return '• '+x.ten+': '+x.cu+' → '+x.hien+(x.md?' (mặc định)':'');}).join(NL)+NL+NL+
    (rs?'Server sẽ RESTART ngay 1 lần (~3 phút), '+on+' người đang online bị ngắt.':'Không cần restart.')))return;
  api('/api/gm/act',f).then(function(j){toast((j.done?'✅ ':'⚠️ ')+j.msg);if(j.done)gmBoDanhDau();gmLoad();}).catch(function(){});
}
function gmGive(g){
  var k=document.getElementById('gmL'+g).value,v=document.getElementById('gmV'+g).value.trim(),s=document.getElementById('gmS'+g).value.trim()||'1';
  if(k==='pet12'||k==='petv2'||k==='petall'||k==='pettt'){var p=document.getElementById('gmP'+g);v=p&&p.value?p.value:'';if(!v)return toast('Chưa có danh sách pet - đợi tải hoặc bấm 🔄');k='pet';}   // 3 o chon cung loai 'pet' phia server
  if(!v)return toast('Nhập '+(GM_PH[k]||'giá trị'));
  gmDo({a:'qua',guid:g,loai:k,gt:v,sl:s},g==='all'?'Gửi cho TẤT CẢ nhân vật?':null);
}
function gmSearch(){
  var q=document.getElementById('gmQ').value.trim();if(!q)return;
  api('/api/gm/items',{q:q}).then(function(j){
    var box=document.getElementById('gmItems');
    if(!j.items.length){box.innerHTML='<div class="muted">Không thấy</div>';return;}
    box.innerHTML='<table><tr><th>ID</th><th>Tên</th><th>Loại</th></tr>'+j.items.map(function(it){
      return '<tr><td><code style="cursor:pointer" data-copy="'+it.id+'" title="Bấm để chép">'+it.id+'</code></td><td>'+esc(it.name)+'</td><td class="muted">'+esc(it.kind)+'</td></tr>';
    }).join('')+'</table>';
  }).catch(function(){});
}
document.addEventListener('click',function(ev){
  var b=ev.target.closest&&ev.target.closest('#tab-gm [data-gm], #tab-gm [data-give], #tab-gm [data-copy], #tab-qua [data-gm], #tab-qua [data-give], #tab-qua [data-copy]');if(!b)return;
  if(b.dataset.copy){navigator.clipboard.writeText(b.dataset.copy).then(function(){toast('📋 Đã chép ID '+b.dataset.copy);});return;}
  if(b.dataset.give){gmGive(b.dataset.give);return;}
  var f={a:b.dataset.gm};if(b.dataset.ten)f.ten=b.dataset.ten;if(b.dataset.guid)f.guid=b.dataset.guid;
  if(f.a==='doi_mk'){var pw=document.getElementById('gmPw_'+f.ten);f.mk=pw?pw.value.trim():'';if(!f.mk)return toast('Nhập mật khẩu mới');}
  gmDo(f,b.dataset.confirm||null);
});
document.addEventListener('change',function(ev){var s=ev.target;if(s&&s.dataset&&s.dataset.kindfor&&s.closest('#tab-gm,#tab-qua'))gmKind(s.dataset.kindfor);});
// ===== 💥 DROP BOSS (29/09): sua bang roi do, ghi thang file game qua /api/drop/* =====
var DP={st:null,open:null,box:null,found:[]};
function dropLoad(){
  document.getElementById('dpInfo').textContent='đang tải (lần đầu quét script hơi lâu)...';
  api('/api/drop/state',{}).then(function(j){DP.st=j;DP.open=null;DP.box=null;dropDraw();}).catch(function(e){document.getElementById('dpInfo').textContent='';toast('❌ '+e.message);});
}
function dropBossRow(id){for(var i=0;i<DP.st.bosses.length;i++)if(DP.st.bosses[i].id===id)return DP.st.bosses[i];return null;}
// 📜 lịch sử sửa (29/09) - /api/drop/log, chỉ cổng SUPER
function dropLogToggle(){var b=document.getElementById('dpLogBox');b.classList.toggle('hidden');if(!b.classList.contains('hidden'))dropLogLoad('dp');}
function dpItems(a){return (a||[]).map(function(x){return x.id+(x.n?' '+esc(x.n):'');}).join(', ');}
function dpDiffItems(b,a){
  var bi={},ai={},add=[],rm=[];(b||[]).forEach(function(x){bi[x.id]=x;});(a||[]).forEach(function(x){ai[x.id]=x;});
  (a||[]).forEach(function(x){if(!bi[x.id])add.push(x);});(b||[]).forEach(function(x){if(!ai[x.id])rm.push(x);});
  var s='';if(add.length)s+='<br><span style="color:#7ee787">+ thêm:</span> '+dpItems(add);if(rm.length)s+='<br><span style="color:#ff7b72">− bớt:</span> '+dpItems(rm);
  return s||'<br><span class="muted">danh sách món không đổi</span>';
}
function dpDiffBoxes(b,a){
  b=b||[];a=a||[];var add=a.filter(function(x){return b.indexOf(x)<0;}),rm=b.filter(function(x){return a.indexOf(x)<0;});
  return (add.length?'<span style="color:#7ee787">+ gắn hộp '+add.join(', ')+'</span> ':'')+(rm.length?'<span style="color:#ff7b72">− gỡ hộp '+rm.join(', ')+'</span>':'')+(!add.length&&!rm.length?'<span class="muted">không đổi</span>':'')
    +'<br><span class="muted">'+(b.join(', ')||'(trống)')+' → '+(a.join(', ')||'(trống)')+'</span>';
}
// ↩ 29/09: rollback 1 dòng nhật ký (SUPER). Xung đột (đã có lần sửa sau / đã rollback) -> hỏi lại rồi force.
async function dropRollback(id,vn){
  if(!await uiConfirm('Trả về trạng thái TRƯỚC lần sửa lúc '+vn+'? - Hiệu lực sau RESTART game. Lần rollback cũng ghi nhật ký (rollback lại được).','↩ Rollback','btn-red'))return;
  var j;
  try{j=await api('/api/drop/rollback',{id:id});}
  catch(e){
    if(String(e.message).indexOf('XUNG ĐỘT')<0){if(!e.toasted)toast('❌ '+e.message);return;}
    if(!await uiConfirm(e.message+'. - Vẫn rollback (ghi đè)?','↩ Vẫn rollback','btn-red'))return;
    try{j=await api('/api/drop/rollback',{id:id,force:true});}catch(e2){if(!e2.toasted)toast('❌ '+e2.message);return;}
  }
  toast('↩ Đã rollback '+j.n+' dòng'+(j.kept&&j.kept.length?' · giữ hộp '+j.kept.join(', '):'')+' - hiệu lực sau RESTART game');
  DP.st=null;if(!document.getElementById('tab-drop').classList.contains('hidden'))dropLoad();   // bảng boss đã đổi
  ['dp','lg'].forEach(function(p){var el=document.getElementById(p+'Log');if(el&&el.innerHTML)dropLogLoad(p);});
}
document.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('[data-dprb]');if(b)dropRollback(b.dataset.dprb,b.dataset.dprbvn);});
// p = 'dp' (khung trong tab Drop Boss) hoặc 'lg' (mục 💥 trong tab 📜 Log): cùng API, khác chỗ hiện
function dropLogLoad(p){
  p=p||'dp';
  document.getElementById(p+'LogInfo').textContent='đang tải...';
  api('/api/drop/log',{n:300,q:document.getElementById(p+'LogQ').value||''}).then(function(j){
    var h='<table><tr><th>Lúc</th><th>Cổng / IP</th><th>Việc</th><th>Chi tiết (trước → sau)</th><th>↩</th></tr>';
    for(var i=0;i<j.rows.length;i++){var r=j.rows[i],d='',v='';
      if(r.act==='box'){v='💾 Sửa hộp '+esc(r.box);var b=r.before||{},a=r.after||{};
        d='BoxValue '+(b.val===a.val?b.val+' (không đổi)':'<b>'+b.val+' → '+a.val+'</b>')+' · '+(a.items||[]).length+' món'+dpDiffItems(b.items,a.items);}
      else if(r.act==='boss'){v='🎯 Hộp của boss '+esc(r.boss)+(r.bossName?' <b>'+esc(r.bossName)+'</b>':'');d=dpDiffBoxes(r.before,r.after);}
      else if(r.act==='clone'){v='🧬 Tách hộp '+esc(r.src)+' → '+esc(r.box);d='bản sao '+((r.after&&r.after.items)||[]).length+' món, BoxValue '+((r.after&&r.after.val)||'?')+(r.boss?'<br>boss '+esc(r.boss)+' '+esc(r.bossName||'')+': '+dpDiffBoxes(r.before,r.bossAfter):'');}
      else if(r.act==='loi'){v='<span style="color:#ff7b72">❌ Lỗi ghi file game</span>';d=esc(r.error||'')+' <span class="muted">(lần lưu lúc '+esc(r.ref||'')+' KHÔNG vào file)</span>';}
      else if(r.act==='rollback'){v='↩ <b>Rollback</b> lần sửa lúc '+esc(r.refVn||'?')+(r.force?' <span style="color:#ffcf5c">(ghi đè)</span>':'');
        d=(r.show||[]).map(function(s){
          if(s.f==='box')return 'Hộp '+esc(s.id)+': '+(s.gone?'<span style="color:#ff7b72">xoá hộp bản sao</span>':(s.back?'khôi phục hộp':'BoxValue '+((s.b||{}).val)+' → '+((s.a||{}).val)+dpDiffItems((s.b||{}).items,(s.a||{}).items)));
          return 'Boss '+esc(s.id)+' '+esc(s.name||'')+': '+dpDiffBoxes(s.b,s.a);}).join('<br>')+((r.kept&&r.kept.length)?'<br><span class="muted">giữ hộp '+esc(r.kept.join(', '))+'</span>':'');}
      else{v=esc(r.act||'?');}
      // ↩ nút rollback cuối dòng: chỉ dòng có dữ liệu trước/sau (changes); đã rollback thì ghi chú thay nút
      var rb=(r.changes&&r.changes.length&&r.act!=='loi')
        ?(r.rolledBack?'<span class="muted" style="font-size:11px">↩ đã rollback<br>'+esc(r.rolledBack)+'</span>'
          :'<button class="mini btn-red" data-dprb="'+esc(r.id)+'" data-dprbvn="'+esc(r.vn||'')+'">↩ Rollback</button>'):'';
      h+='<tr><td style="white-space:nowrap">'+esc(r.vn||r.t||'')+'</td><td style="white-space:nowrap">'+esc(r.gate||'')+'<br><span class="muted">'+esc(r.ip||'')+'</span></td><td>'+v+'</td><td style="font-size:12px">'+d+'</td><td>'+rb+'</td></tr>';}
    document.getElementById(p+'Log').innerHTML=j.rows.length?h+'</table>':'<span class="muted">Chưa có lần sửa nào'+(j.total?' khớp bộ lọc':'')+'.</span>';
    document.getElementById(p+'LogInfo').textContent='hiện '+j.rows.length+' / '+j.total+' dòng (mới nhất trước)';
  }).catch(function(e){document.getElementById(p+'LogInfo').textContent='';toast('❌ '+e.message);});
}
function dropBoxHtml(){
  var b=DP.box;
  if(b.addMode){return '<div class="row" style="border:1px solid #3a4258;border-radius:10px;padding:10px"><b>Thêm hộp cho boss '+DP.open+':</b> <input id="dpNewBox" class="mini-in" style="width:110px" placeholder="ID hộp"> <button class="mini btn-green" data-dpaddgo="1">Thêm</button> <button class="mini" data-dpclose="1">Đóng</button> <span class="muted">nhập ID một hộp CÓ SẴN (xem cột Hộp rơi của boss khác, vd 90001 = phiếu 2000). Muốn hộp mới toanh: mở hộp gần giống rồi 🧬 Tách riêng.</span></div>';}
  var sh=(b.nOther>0)?'<span style="color:#ffcf5c">⚠ dùng chung với '+b.nOther+' quái thường'+(b.nBoss>1?' + '+(b.nBoss-1)+' boss khác':'')+' - sửa là đổi cho TẤT CẢ</span>':(b.nBoss>1?'<span class="muted">dùng bởi '+b.nBoss+' boss</span>':'<span class="muted">chỉ hộp này của boss này</span>');
  var rows='';
  for(var i=0;i<b.items.length;i++){var it=b.items[i];rows+='<tr><td class="muted">'+it.id+'</td><td>'+esc(it.name||'?')+'</td><td><button class="mini btn-red" data-dpdel="'+i+'">×</button></td></tr>';}
  return '<div style="border:1px solid #3a4258;border-radius:10px;padding:12px;background:rgba(0,0,0,.18)">'
    +'<div class="row"><b>Hộp '+b.id+'</b> <span>BoxValue</span> <input id="dpVal" class="mini-in" style="width:100px" value="'+b.val+'"> '+sh+'</div>'
    +'<div class="row" style="margin-top:6px"><button class="mini btn-green" data-dpsave="1">💾 Lưu hộp</button> '
    +((b.nOther>0||b.nBoss>1)?'<button class="mini" data-dpclone="1">🧬 Tách riêng cho boss '+DP.open+'</button> ':'')
    +'<button class="mini" data-dpclose="1">Đóng</button> <span class="muted">'+b.items.length+' món - rơi 1 món ngẫu nhiên</span></div>'
    +'<div style="max-height:300px;overflow:auto;margin-top:8px"><table><tr><th>ID</th><th>Tên</th><th></th></tr>'+rows+'</table></div>'
    +'<div class="row" style="margin-top:8px"><input id="dpItemQ" class="mini-in" style="width:260px" placeholder="tìm vật phẩm thêm vào (không dấu / ID)"><button class="mini" data-dpsearch="1">Tìm</button></div><div id="dpFound" style="margin-top:6px"></div></div>';
}
function dropDraw(){
  if(!DP.st)return;
  var q=(document.getElementById('dpQ').value||'').trim().toLowerCase();
  var sp=document.getElementById('dpSp').checked;
  var rows=DP.st.bosses.filter(function(b){if(sp&&!b.sp)return false;if(!q)return true;return b.k.indexOf(q)>=0||b.name.toLowerCase().indexOf(q)>=0||b.id.indexOf(q)>=0;});
  document.getElementById('dpInfo').textContent=rows.length+' boss'+(rows.length>150?' (hiện 150 đầu - gõ tên để lọc)':'');
  rows=rows.slice(0,150);
  var h='<table><tr><th>ID</th><th>Tên</th><th>Cấp</th><th>Xuất hiện ở</th><th>Hộp rơi (bấm để sửa)</th><th></th></tr>';
  for(var i=0;i<rows.length;i++){var b=rows[i];var chips='';
    for(var j=0;j<b.boxes.length;j++){var x=b.boxes[j];var bx=DP.st.boxes[x]||{};var shared=(bx.nOther||0)>0;
      chips+='<span style="white-space:nowrap"><button class="mini'+(shared?'':' btn-green')+'" data-dpbox="'+x+'" data-dpboss="'+b.id+'" title="'+(bx.missing?'hộp KHÔNG tồn tại':(bx.items?bx.items.length+' món, BoxValue '+bx.val:''))+'">'+x+(shared?'⚠':'')+'</button><button class="mini" style="padding:2px 5px;opacity:.6" title="Gỡ hộp '+x+' khỏi boss này" data-dprm="'+x+'" data-dpboss="'+b.id+'">×</button></span> ';}
    h+='<tr><td class="muted">'+b.id+'</td><td><b>'+esc(b.name)+'</b></td><td>'+b.lv+(b.mv?'<br><span class="muted" style="font-size:11px" title="Mvalue: giá trị quái - so với BoxValue của hộp để đoán tỉ lệ rơi (Mv ÷ BV)">Mv '+b.mv+'</span>':'')+'</td><td class="muted" style="font-size:11px;max-width:180px">'+esc(b.sp||'-')+'</td><td>'+(chips||'<span class="muted">không rơi gì</span>')+'</td><td><button class="mini" data-dpadd="'+b.id+'">+ hộp</button></td></tr>';
    if(DP.open===b.id&&DP.box)h+='<tr><td colspan="6">'+dropBoxHtml()+'</td></tr>';
  }
  document.getElementById('dpList').innerHTML=h+'</table>';
}
function dropSaveBoss(id,boxes){
  api('/api/drop/boss',{id:id,boxes:boxes}).then(function(j){
    var b=dropBossRow(id);if(b)b.boxes=j.boxes;
    toast('💾 Đã lưu hộp của boss '+id+' - hiệu lực sau RESTART game');dropDraw();
  }).catch(function(e){toast('❌ '+e.message);});
}
function dropItemSearch(){
  var q=(document.getElementById('dpItemQ').value||'').trim();if(!q)return;
  api('/api/gm/items',{q:q}).then(function(j){
    DP.found=(j.items||[]).slice(0,20);
    var h='';for(var i=0;i<DP.found.length;i++){var it=DP.found[i];h+='<button class="mini" data-dpai="'+i+'">➕ '+it.id+' '+esc(it.name)+'</button> ';}
    document.getElementById('dpFound').innerHTML=h||'<span class="muted">Không thấy</span>';
  }).catch(function(e){toast('❌ '+e.message);});
}
document.addEventListener('click',function(ev){
  var el=ev.target.closest&&ev.target.closest('#tab-drop [data-dpbox],#tab-drop [data-dprm],#tab-drop [data-dpadd],#tab-drop [data-dpdel],#tab-drop [data-dpsave],#tab-drop [data-dpclone],#tab-drop [data-dpclose],#tab-drop [data-dpaddgo],#tab-drop [data-dpai],#tab-drop [data-dpsearch]');
  if(!el||!DP.st)return;
  var d=el.dataset;
  if(d.dpbox){var src=DP.st.boxes[d.dpbox];if(!src||src.missing)return toast('Hộp '+d.dpbox+' không có trong DropBoxContent');
    DP.open=d.dpboss;DP.box={id:d.dpbox,val:src.val,nBoss:src.nBoss,nOther:src.nOther,items:src.items.map(function(x){return {id:x.id,name:x.name};})};dropDraw();return;}
  if(d.dprm){var b=dropBossRow(d.dpboss);if(!b)return;
    if(!confirm('Gỡ hộp '+d.dprm+' khỏi boss '+b.name+'? (hộp vẫn còn cho quái khác)'))return;
    dropSaveBoss(b.id,b.boxes.filter(function(x){return x!==d.dprm;}));return;}
  if(d.dpadd){DP.open=d.dpadd;DP.box={addMode:true};dropDraw();return;}
  if(d.dpaddgo){var v=(document.getElementById('dpNewBox').value||'').trim();var bb=dropBossRow(DP.open);if(!bb)return;
    if(!DP.st.boxes[v]||DP.st.boxes[v].missing)return toast('Không có hộp '+v+' - xem ID ở cột Hộp rơi của boss khác');
    if(bb.boxes.indexOf(v)>=0)return toast('Boss đã có hộp này');
    DP.box=null;DP.open=null;dropSaveBoss(bb.id,bb.boxes.concat([v]));return;}
  if(d.dpdel){DP.box.items.splice(+d.dpdel,1);dropDraw();return;}
  if(d.dpai){var it=DP.found[+d.dpai];if(!it)return;
    for(var i=0;i<DP.box.items.length;i++)if(DP.box.items[i].id===it.id)return toast('Món này đã có trong hộp');
    DP.box.items.push({id:it.id,name:it.name});dropDraw();return;}
  if(d.dpsearch){dropItemSearch();return;}
  if(d.dpsave){var val=parseInt(document.getElementById('dpVal').value);
    if(!(val>=4))return toast('BoxValue phải ≥ 4 (BoxValue 1-3 làm boss KHÔNG rơi gì; tỉ lệ rơi ≈ Mvalue ÷ BoxValue)');
    if(!DP.box.items.length)return toast('Hộp phải có ít nhất 1 món');
    var bx=DP.box;
    api('/api/drop/box',{id:bx.id,val:val,items:bx.items.map(function(x){return x.id;})}).then(function(){
      DP.st.boxes[bx.id]={val:val,items:bx.items.slice(),nBoss:bx.nBoss,nOther:bx.nOther};bx.val=val;
      toast('💾 Đã lưu hộp '+bx.id+' - hiệu lực sau RESTART game');dropDraw();
    }).catch(function(e){toast('❌ '+e.message);});return;}
  if(d.dpclone){var old=DP.box;
    api('/api/drop/clone',{box:old.id,boss:DP.open}).then(function(j){
      DP.st.boxes[j.newId]={val:old.val,items:old.items.slice(),nBoss:1,nOther:0};
      var ob=DP.st.boxes[old.id];if(ob&&ob.nBoss>0)ob.nBoss--;
      var b=dropBossRow(DP.open);if(b&&j.boxes)b.boxes=j.boxes;
      DP.box={id:j.newId,val:old.val,nBoss:1,nOther:0,items:old.items.slice()};
      toast('🧬 Đã tách hộp '+old.id+' → '+j.newId+' riêng cho boss '+DP.open+' - sửa rồi 💾 Lưu');dropDraw();
    }).catch(function(e){toast('❌ '+e.message);});return;}
  if(d.dpclose){DP.box=null;DP.open=null;dropDraw();return;}
});
document.addEventListener('keydown',function(ev){
  if(ev.key==='Enter'&&ev.target&&ev.target.id==='dpItemQ'){ev.preventDefault();dropItemSearch();}
});
// ===== TAB 🐉 THIÊN LONG & KNB: liên kết ví ↔ nhân vật =====
function renderLienKet(){
  if(!STATE)return;
  const box=document.getElementById('lienKetList');
  if(!box)return;
  // Đang gõ trong ô tên thì đừng vẽ lại (poll 3s sẽ nuốt chữ đang gõ)
  const af=document.activeElement;
  if(af&&af.id&&af.id.indexOf('pn_')===0)return;
  // Ví đã liên kết lên trước, trong nhóm thì giàu trước
  const rows=(STATE.players||[]).slice().sort((a,b)=>((b.ingameName?1:0)-(a.ingameName?1:0))||(b.points-a.points));
  if(!rows.length){box.innerHTML='<div class="muted">Chưa có ví nào.</div>';return;}
  // 🧬 07/10: cột Clone - tích là lưu ngay (ví clone chỉ dùng 🏪 Thương Phố của nhân vật đó, không nhận túi boss)
  box.innerHTML='<table><tr><th>Discord</th><th>Ví KNB</th><th>Nhân vật Thiên Long</th><th>GUID</th><th title="Tài khoản clone: chỉ dùng Thương Phố, không túi boss">🧬 Clone</th><th></th></tr>'+
    rows.map(p=>'<tr><td>'+esc(p.name)+'<br><span class="muted" style="font-size:11px">'+p.id+'</span></td>'+
      '<td>'+Number(p.points||0).toLocaleString()+'</td>'+
      '<td><input class="mini-in" style="width:150px" placeholder="(chưa liên kết)" id="pn_'+p.id+'" value="'+esc(p.ingameName||'').replace(/"/g,'&quot;')+'"></td>'+
      '<td class="muted" style="font-size:12px">'+(p.tlbbGuid?esc(p.tlbbGuid):'-')+'</td>'+
      '<td style="text-align:center"><input type="checkbox" style="width:18px;height:18px" id="pc_'+p.id+'"'+(p.clone?' checked':'')+(p.ingameName?'':' disabled title="Liên kết nhân vật trước"')+' onchange="lkSetName(\\''+p.id+'\\')"></td>'+
      '<td><button class="mini btn-green" onclick="lkSetName(\\''+p.id+'\\')">💾 Lưu</button></td></tr>').join('')+
    '</table>';
}
function lkTaoClone(){
  const i=document.getElementById('lkCloneTen');const v=(i&&i.value||'').trim();
  if(!v){toast('Nhập tên nhân vật clone');return;}
  api('/api/tlbb/taoclone',{name:v}).then(j=>{toast('🧬 Đã tạo ví clone cho '+j.name+' (tài khoản game '+j.account+') - đăng nhập web bằng tài khoản + mật khẩu game đó');i.value='';refresh();}).catch(()=>{});
}
function lkSetName(id){
  const v=document.getElementById('pn_'+id).value;
  const c=document.getElementById('pc_'+id);
  api('/api/tlbb/lienket',{userId:id,name:v,clone:!!(c&&c.checked)}).then(j=>{toast(j.name?('🔗 Đã liên kết: '+j.name+(j.clone?' · 🧬 CLONE (chỉ Thương Phố)':'')):'🔓 Đã hủy liên kết');refresh();}).catch(()=>{refresh();});
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
  const sum=a+b+c;const tai=sum>=11;const chan=sum%2===0;const bao=(a===b&&b===c);
  document.getElementById('txPrev').textContent='Tổng '+sum+' → '+(bao?'🌪️ BÃO, Tài/Xỉu/Chẵn/Lẻ thua sạch':((tai?'TÀI 🟢':'XỈU 🔴')+' | '+(chan?'CHẴN 🔵':'LẺ 🟣')));
}
function txForce(){
  const v=[document.getElementById('d1').value,document.getElementById('d2').value,document.getElementById('d3').value].join(',');
  api('/api/tx/force',{values:v}).then(()=>{toast('⚡ Đã ép Big Small: '+v);refresh();}).catch(e=>toast('❌ '+e.message));
}
// 27/08: chọn 3 xúc xắc khiến nhà cái trả ÍT NHẤT (cửa gánh nhiều tiền nhất thua)
// 🎯 Gợi ý ép: lấy THẲNG kết quả máy chủ đã duyệt đủ 216 kết cục bằng lõi tiền.
// KHÔNG tự đoán ở đây nữa, bản cũ chỉ tính 5 cửa và luôn ra 1-1-1 (cửa 'bao' của
// bàn cũ không còn nên tiền cửa đó vĩnh viễn 0), tức là luôn ép ra BÃO, tự bơm tiền.
function txAutoForce(){
  if(!STATE||!STATE.tx)return;
  const g=STATE.tx.epGoiY;
  if(!g||!g.dice){toast('❌ Máy chủ chưa gửi gợi ý ép - thử lại sau vài giây');return;}
  if(!g.soCuoc){toast('Ván này chưa ai đặt - ép kiểu gì cũng như nhau');return;}
  setDice(g.dice[0],g.dice[1],g.dice[2]);
  const sum=g.dice[0]+g.dice[1]+g.dice[2];
  toast('🎯 '+g.dice.join('-')+' (tổng '+sum+'): nhà cái trả ít nhất '+g.tra.toLocaleString()
    +' / tổng cược '+g.tongDat.toLocaleString()+'. Bấm ⚡ Ép để chốt.');
}
// đổ trạng thái bàn Siêu vào tab (chỉ điền ô nào admin chưa gõ dở)
function stxDo(){
  const S=STATE&&STATE.stx; if(!S)return;
  const cb=document.getElementById('stxOn'); if(cb&&cb.checked!==S.on)cb.checked=S.on;
  const now=document.getElementById('stxNow');
  if(now)now.textContent=S.on?('Ván #'+S.gameId+' · '+(S.secsToBet>0?('còn '+S.secsToBet+'s để ép'):'ĐÃ KHOÁ SỔ')):'bàn đang tắt';
  const live=document.getElementById('stxLive');
  if(live){const co=Object.keys(S.betAgg||{}).filter(k=>S.betAgg[k]>0).sort((a,b)=>S.betAgg[b]-S.betAgg[a]);
    const tong=co.reduce((s,k)=>s+S.betAgg[k],0);
    const TC=S.tenCua||{};
    const cua=co.length?('💰 tổng cược <b>'+tong.toLocaleString()+'</b> · '+co.slice(0,12).map(k=>esc(TC[k]||k)+' <b>'+S.betAgg[k].toLocaleString()+'</b>').join(' · ')+(co.length>12?(' · +'+(co.length-12)+' cửa nữa'):'')):'chưa ai đặt';
    // 22/09: TỪNG NGƯỜI MỘT DÒNG (tên · tổng · từng ô), người đặt nhiều lên đầu, admin nhìn phát biết ai
    // đang gánh ô nào trước khi bấm ép. Bản cũ nối hết bằng "•" thành một dải chữ, không đọc nổi.
    const per={};
    (S.bets||[]).forEach(b=>{const k=b.name||'?';if(!per[k])per[k]={tong:0,o:[]};per[k].tong+=Number(b.amount)||0;per[k].o.push(esc(TC[b.choice]||b.choice)+' <b>'+Number(b.amount).toLocaleString()+'</b>');});
    const ds=Object.keys(per).sort((a,b)=>per[b].tong-per[a].tong);
    const list=ds.length?ds.map(k=>'<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px dashed #263159">'
      +'<b style="min-width:110px;color:#ffe193">'+esc(k)+'</b><span style="min-width:90px;color:#3ddc84;font-weight:800">'+per[k].tong.toLocaleString()+'</span>'
      +'<span class="muted" style="font-size:12px;flex:1">'+per[k].o.join(' · ')+'</span></div>').join(''):'<div class="muted" style="font-size:12px">chưa ai đặt</div>';
    live.innerHTML='<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#141824">'
      +'<div style="margin-bottom:5px">👥 <b>Ván #'+S.gameId+'</b> · '+ds.length+' người · '+(S.betsCount||0)+' lượt đặt'+(S.secsToBet>0?' · <span style="color:#3ddc84">còn '+S.secsToBet+'s</span>':' · <span style="color:#ff7a7a">đã khoá sổ</span>')+'</div>'
      +'<div style="margin-bottom:6px;font-size:12.5px">'+cua+'</div>'
      +list+'</div>';}
  const pv=document.getElementById('stxPrev'); if(pv&&!pv.textContent)stxPreview();
  const put=(id,v)=>{const e=document.getElementById(id);if(e&&e.dataset.dirty!=='1'&&e.value===''&&document.activeElement!==e)e.value=v;};
  put('stxBetS',S.time.bet);put('stxNhanS',S.time.nhan);put('stxNanS',S.time.nan);
  put('stxMax',S.maxBet);
  if(S.rtp)put('stxAn',(S.rtp.an*100).toFixed(1).replace(/\.0$/,''));
  const an=document.getElementById('stxAnNote');
  if(an&&S.rtp)an.textContent='Đang chạy: nhà cái ăn '+(S.rtp.an*100).toFixed(1)+'% · người chơi thực nhận '+(S.rtp.rtpThuc*100).toFixed(2)+'% · trung bình '+S.rtp.oSangMoiVan.toFixed(1)+' ô sáng/ván (từng ván lệch quanh số này) · phí '+(S.rtp.phi*100)+'%';
  // trần cược: dựng 1 lần với NHÃN TIẾNG VIỆT máy bàn gửi, sau đó chỉ đổ giá trị
  // (ô đang gõ thì chừa ra), đúng cách khối trần của bàn thường đang làm.
  const box=document.getElementById('stxTran'), TEN=S.tenNhom||{};
  if(box&&!box.dataset.xong&&S.tran){box.dataset.xong='1';
    box.innerHTML=Object.keys(S.tran).map(k=>'<div style="flex:1 1 180px"><label>'+esc(TEN[k]||k)+'</label><input data-stxtran="'+k+'" type="number" min="1000" oninput="txDirty(this)"></div>').join('');}
  document.querySelectorAll('[data-stxtran]').forEach(el=>{if(el.dataset.dirty!=='1'&&document.activeElement!==el)el.value=S.tran[el.dataset.stxtran];});
  const tn=document.getElementById('stxTranNow');
  if(tn&&S.thangToiDa)tn.innerHTML='Thắng tối đa mỗi cửa theo trần đang đặt: '+
    Object.keys(S.tran||{}).map(k=>'<b>'+esc((TEN[k]||k).split(' · ')[0].replace(/ \\(.*$/,''))+'</b> '+(S.thangToiDa[k]||0).toLocaleString('vi-VN')).join(' · ')+
    '. Cửa trả càng cao trần càng thấp, sửa một ô là cả nhóm nhảy theo.';
  const tt=document.getElementById('stxThang');
  if(tt&&S.thang&&tt.dataset.dirty!=='1'&&tt.value===''&&document.activeElement!==tt)
    tt.value=Object.keys(S.thang).map(k=>k+': '+S.thang[k].map(b=>b[0]+'×'+b[1]).join(', ')).join('\\n');
  const ep=document.getElementById('stxEpNow');
  if(ep)ep.textContent=S.ep?('⚡ Ván sau đã bị ép ra '+S.ep.join('-')):'';
  // ✋ bảng ép hệ số nhân: dựng 4 ô theo danh sách máy bàn gửi + kể lệnh đang chờ
  stxVeNhanO(S);
  const nn=document.getElementById('stxNhanNow');
  if(nn){
    const TEN2=Object.fromEntries(stxDsEp(S).map(c=>[c.id,c.ten]));
    // Bàn còn nhận cược -> lệnh ép ăn ngay ván này (4 giây khoe nhân sắp tới).
    // Đã khoá sổ -> ăn ván sau. Nói rõ ra, y khối ép kết quả của bàn thường.
    const khi=S.secsToBet>0
      ? '<span style="color:#3ddc84;font-weight:800">🟢 CÒN '+S.secsToBet+'s - ép giờ HIỆN NGAY ván #'+S.gameId+'</span>'
      : '<span style="color:#ff7a7a;font-weight:800">🔒 ĐÃ KHOÁ SỔ - ép giờ vào VÁN SAU</span>';
    const dang=S.epNhan
      ? ('<br>✋ <b>Đang chờ áp:</b> '+Object.keys(S.epNhan).map(k=>esc(TEN2[k]||k)+(S.epNhan[k]===0?' TẮT':' x'+S.epNhan[k])).join(' · '))
      : '';
    nn.innerHTML=khi+' &nbsp;·&nbsp; 0 = tắt ô · khoảng ép ghi sẵn trong từng ô'+dang;
  }
  const bi=document.getElementById('stxBoardInfo'), sb=STATE.stxBoard;
  if(bi&&sb)bi.innerHTML='<span class="run '+(sb.on?'on':'off')+'">'+(sb.on?'🟢 ĐANG HIỆN':'🔴 CHƯA ĐĂNG')+'</span>'+(sb.channelId?' &nbsp; kênh <code>'+esc(sb.channelId)+'</code>':'');
  const ci=document.getElementById('stxChannel');
  if(ci&&sb&&sb.channelId&&!ci.value&&document.activeElement!==ci)ci.value=sb.channelId;
}
function stxBoardStart(){const c=document.getElementById('stxChannel').value.trim();if(!c)return toast('Nhập Channel ID');
  api('/api/stx/board/start',{channelId:c}).then(j=>{toast('▶️ Đã đăng bảng Siêu ở #'+j.name);refresh();}).catch(e=>toast('❌ '+e.message));}
async function stxBoardStop(){if(!await uiConfirm('Gỡ bảng Siêu Tài Xỉu khỏi Discord?','Gỡ bảng','btn-red'))return;
  api('/api/stx/board/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng Siêu');refresh();}).catch(e=>toast('❌ '+e.message));}
function renderTxBetsLive(){
  const box=document.getElementById('txBetsLive'); if(!box||!STATE||!STATE.tx)return;
  const a=STATE.tx.betAgg||{}; const t=STATE.tx;
  const win=t.secsToBet>0
    ? '<span style="color:#3ddc84;font-weight:800">🟢 CÒN '+t.secsToBet+'s ĐỂ ÉP - ép giờ ĂN ván này</span>'
    : '<span style="color:#ff7a7a;font-weight:800">🔒 ĐÃ KHÓA SỔ - ép giờ sẽ vào VÁN SAU</span>';
  // Bàn 52 cửa: liệt kê MỌI cửa đang có tiền, nặng nhất lên đầu (admin cần thấy
  // đúng chỗ đang gánh). Bản cũ in cứng 5 cửa nên 47 cửa mới vô hình.
  const ten=(t.tenCua)||{};
  const tenOf=function(id){return ten[id]||id;};
  const co=Object.keys(a).filter(function(k){return (a[k]||0)>0;}).sort(function(x,y){return a[y]-a[x];});
  const tong=co.reduce(function(s2,k){return s2+a[k];},0);
  const cua=co.length
    ? ('💰 tổng <b>'+tong.toLocaleString()+'</b> · '+co.slice(0,12).map(function(k){
        return esc(tenOf(k))+' <b>'+a[k].toLocaleString()+'</b>';}).join(' · ')
        +(co.length>12?(' · +'+(co.length-12)+' cửa nữa'):''))
    : 'chưa ai đặt';
  const list=(t.bets||[]).length
    ? (t.bets||[]).slice().reverse().map(b=>esc(b.name)+': '+esc(tenOf(b.choice))+' '+Number(b.amount).toLocaleString()).join(' • ')
    : 'chưa ai đặt';
  box.innerHTML='<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#141824">'
    +'<div style="margin-bottom:5px">'+win+' &nbsp;·&nbsp; Ván #'+padId(t.gameId)+' · '+t.betsCount+' lượt đặt</div>'
    +'<div style="margin-bottom:5px">'+cua+'</div>'
    +'<div class="muted" style="font-size:12px">'+list+'</div></div>';
}


function txStart(){const c=document.getElementById('txChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/tx/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bàn ở #'+j.name);refresh();});}
// 17/09: ô nào người dùng vừa sửa thì vòng làm mới 3 giây KHÔNG được đụng vào nữa,
// không thì tick xong 3 giây là bị đạp về giá trị đã lưu (chủ server báo lỗi này).
function txDirty(el){ if(el) el.dataset.dirty='1'; }
function txClean(ids){ ids.forEach(function(id){ const el=document.getElementById(id); if(el) el.dataset.dirty=''; }); }
function txSaveTime(){
  const b=parseInt(document.getElementById('txBetS').value),n=parseInt(document.getElementById('txNanS').value);
  const h=parseInt(document.getElementById('txNhanS').value);
  if(!(b>=5&&b<=600))return toast('Giây đặt cược: 5 - 600');
  if(!(h>=0&&h<=60))return toast('Giây hiện nhân: 0 - 60');
  if(!(n>=6&&n<=300))return toast('Giây nặn: 6 - 300 (4 giây cuối là lúc bàn tự mở kết quả)');
  api('/api/tx/time',{bet:b,nan:n,nhan:h}).then(j=>{txClean(['txBetS','txNanS','txNhanS']);toast('⏱️ Ván '+j.round+'s = '+j.bet+'s đặt + '+j.nhan+'s nhân + '+j.nan+'s nặn');refresh();}).catch(e=>toast('❌ '+e.message));
}
// 🎲 trần cược từng nhóm cửa, 5 ô, sửa 1 ô là cả nhóm nhảy theo
// Thang nhân: mỗi dòng "tên: hệ_số×độ_hiếm, ...". Chấp nhận cả x, *, X thay cho ×.
function txDocThang(){
  const chu=(document.getElementById('txThang').value||'').trim();
  const bang={}; const dong=chu.split(/\\r?\\n/).filter(d=>d.trim()&&!d.trim().startsWith('#'));
  for(const d of dong){
    const i=d.indexOf(':'); if(i<0) throw new Error('Thiếu dấu hai chấm ở dòng: '+d.trim());
    const ten=d.slice(0,i).trim();
    const bac=d.slice(i+1).split(',').map(x=>x.trim()).filter(Boolean).map(x=>{
      const m=x.match(/^(\\d+)\\s*[x×*X]\\s*(\\d+)$/);
      if(!m) throw new Error('Sai kiểu "'+x+'" (phải là hệ_số×độ_hiếm, ví dụ 200×45)');
      return [parseInt(m[1]),parseInt(m[2])];
    });
    if(!bac.length) throw new Error('Nhóm "'+ten+'" trống');
    bang[ten]=bac;
  }
  if(!Object.keys(bang).length) throw new Error('Chưa nhập gì');
  return bang;
}
function txSaveThang(){
  let bang; try{bang=txDocThang();}catch(e){return toast('❌ '+e.message);}
  api('/api/tx/thang',{thang:bang}).then(j=>{
    txClean(['txThang']);
    toast('🎰 Đã lưu thang nhân · nhà cái ăn ~'+(j.nhaCaiAn*100).toFixed(2)+'% · trung bình '+j.oSangMoiVan.toFixed(1)+' ô sáng/ván');
    refresh();
  }).catch(e=>toast('❌ '+e.message));
}
function txThangMacDinh(){
  if(!confirm('Trả thang hệ số nhân về mặc định?'))return;
  api('/api/tx/thang',{macDinh:true}).then(j=>{
    const t=document.getElementById('txThang'); if(t){t.dataset.dirty='';t.value='';}
    toast('↩️ Đã về thang mặc định');refresh();
  }).catch(e=>toast('❌ '+e.message));
}
// ================= 🎡 ROULETTE (25/09) =================
function rlBat(v){api('/api/rl/on',{on:v}).then(j=>{toast(j.on?'🎡 Đã BẬT bàn Roulette':'🎡 Đã TẮT bàn Roulette (cược đang có đã hoàn đủ)');refresh();}).catch(e=>toast('❌ '+e.message));}
function rlSaveTime(){
  const b=parseInt(document.getElementById('rlBetS').value),q=parseInt(document.getElementById('rlQuayS').value),r=parseInt(document.getElementById('rlRoiS').value);
  if(!(b>=5&&b<=600))return toast('Giây đặt: 5 - 600');
  if(!(q>=0&&q<=60))return toast('Giây bi chạy: 0 - 60');
  if(!(r>=6&&r<=60))return toast('Giây khoá sổ: 6 - 60');
  api('/api/rl/time',{bet:b,quay:q,roi:r}).then(j=>{txClean(['rlBetS','rlQuayS','rlRoiS']);toast('⏱️ Ván '+j.round+'s = '+j.bet+'+'+j.quay+'+'+j.roi);refresh();}).catch(e=>toast('❌ '+e.message));
}
function rlKhongPhiBat(v){api('/api/rl/khongphi',{on:v}).then(j=>{toast(j.khongPhi?'✅ KHÔNG PHÍ giống nhà cái · nhà cái ăn cố định '+(j.an*100).toFixed(2)+'%':'💸 CÓ PHÍ · nhà cái ăn '+(j.an*100).toFixed(1)+'% · phí '+(j.phi*100).toFixed(2)+'%');refresh();}).catch(e=>toast('❌ '+e.message));}
function rlSaveAn(){
  const S0=STATE&&STATE.rl;
  if(S0&&S0.rtp&&S0.rtp.khongPhi&&document.getElementById('rlAn').value!==''){toast('❌ Đang KHÔNG PHÍ: mức ăn cố định 2,70%. Tắt công tắc "Không phí" rồi mới chỉnh.');return;}
  const a=parseFloat(document.getElementById('rlAn').value);
  const m=parseInt(document.getElementById('rlMax').value);
  const xong=()=>{txClean(['rlAn','rlMax']);refresh();};
  if(!isNaN(a)){ if(!(a>=3&&a<=20))return toast('Nhà cái ăn: 3 - 20%');
    api('/api/rl/an',{an:a}).then(j=>{toast('🎯 Nhà cái ăn '+(j.an*100).toFixed(1)+'% · phí '+(j.phi*100).toFixed(2)+'% · trung bình '+j.oSangMoiVan.toFixed(1)+' số sét/ván');xong();}).catch(e=>toast('❌ '+e.message)); }
  if(!isNaN(m)) api('/api/rl/maxbet',{maxBet:m}).then(()=>{toast('💰 Đã lưu trần mỗi người');xong();}).catch(e=>toast('❌ '+e.message));
}
function rlSaveTran(){
  const t={};document.querySelectorAll('[data-rltran]').forEach(el=>{const v=parseInt(el.value);if(v>0)t[el.dataset.rltran]=v;});
  api('/api/rl/tran',{tran:t}).then(j=>{document.querySelectorAll('[data-rltran]').forEach(el=>{el.dataset.dirty='';});toast('🧱 Đã lưu trần Roulette');refresh();}).catch(e=>toast('❌ '+e.message));
}
function rlSaveThang(){
  let bang;try{bang=txDocThangO('rlThang');}catch(e){return toast('❌ '+e.message);}
  api('/api/rl/thang',{thang:bang}).then(j=>{txClean(['rlThang']);toast('🎰 Đã lưu thang · '+j.oSangMoiVan.toFixed(1)+' số sét/ván · nhà cái vẫn ăn '+(j.anThuc*100).toFixed(2)+'%');refresh();}).catch(e=>toast('❌ '+e.message));
}
function rlThangMacDinh(){
  if(!confirm('Trả thang hệ số nhân của bàn ROULETTE về mặc định?'))return;
  api('/api/rl/thang',{macDinh:true}).then(()=>{const t=document.getElementById('rlThang');if(t){t.dataset.dirty='';t.value='';}toast('↩️ Đã về mặc định');refresh();}).catch(e=>toast('❌ '+e.message));
}
function rlEp(){
  const so=parseInt(document.getElementById('rlEpSo').value,10);
  if(isNaN(so)||so<0||so>36)return toast('Số phải từ 0 đến 36');
  api('/api/rl/ep',{so:so}).then(j=>{toast('⚡ '+(j.ngay?('Ván #'+j.gameId+' sẽ ra '):'Ván sau sẽ ra ')+j.ep);refresh();}).catch(e=>toast('❌ '+e.message));
}
function rlHuyEp(){api('/api/rl/epclear',{}).then(j=>{toast(j.daHuy?'↩️ Đã huỷ ép - quay ngẫu nhiên':'Không có ép nào đang chờ');refresh();}).catch(e=>toast('❌ '+e.message));}
// 🎯 lấy THẲNG gợi ý máy chủ đã duyệt 37 số bằng lõi tiền
function rlTuEp(){
  const S=STATE&&STATE.rl; if(!S)return;
  const g=S.epGoiY;
  if(!g||typeof g.so!=='number'){toast('❌ Máy chủ chưa gửi gợi ý - thử lại sau vài giây');return;}
  if(!g.soCuoc){toast('Ván này chưa ai đặt - ép kiểu gì cũng như nhau');return;}
  document.getElementById('rlEpSo').value=g.so;
  toast('🎯 Số '+g.so+': nhà cái trả ít nhất '+g.tra.toLocaleString()+' / tổng cược '+g.tongDat.toLocaleString()+'. Bấm ⚡ Ép để chốt.');
}
// ✋ đọc "7×100, 12×0" -> {s7:100, s12:0}. Không dùng regex có dấu gạch chéo ngược (file này là template literal).
function rlEpNhan(){
  const txt=(document.getElementById('rlEpNhanTxt').value||'').trim();
  if(!txt)return toast('❌ Chưa ghi ô nào - ví dụ 7×100, 12×0');
  const nhan={};
  try{
    txt.split(',').forEach(function(p){
      p=p.trim(); if(!p)return;
      const m=p.split(/[x×*X:]/);
      if(m.length!==2)throw new Error('Sai kiểu "'+p+'" (phải là số×hệ_số, ví dụ 7×100)');
      const so=parseInt(m[0],10),he=parseInt(m[1],10);
      if(isNaN(so)||so<0||so>36)throw new Error('Số "'+m[0].trim()+'" phải từ 0 đến 36');
      if(isNaN(he)||he<0)throw new Error('Hệ số của số '+so+' phải là số ≥ 0 (0 = tắt)');
      nhan['s'+so]=he;
    });
  }catch(e){return toast('❌ '+e.message);}
  api('/api/rl/epnhan',{nhan:nhan}).then(function(j){
    const ke=Object.keys(j.epNhan).map(k=>'Số '+k.slice(1)+(j.epNhan[k]===0?' TẮT':' x'+j.epNhan[k])).join(' · ');
    toast('✋ '+(j.ngay?('Áp NGAY ván #'+j.gameId):'Áp từ ván sau')+': '+ke);
    document.getElementById('rlEpNhanTxt').value='';
    refresh();
  }).catch(function(e){toast('❌ '+e.message)});
}
function rlHuyEpNhan(){
  api('/api/rl/epnhanclear',{}).then(function(j){toast(j.daHuy?'↩️ Đã huỷ lệnh ép số sét':'(không có lệnh ép nào đang chờ)');refresh();}).catch(function(e){toast('❌ '+e.message)});
}
// 🔢 đọc "2×10, 3×9" -> [[2,10],[3,9]]. Không dùng regex có dấu gạch chéo ngược (file này là template literal).
function rlDocSetO(){
  const txt=(document.getElementById('rlSet').value||'').trim();
  if(!txt)throw new Error('Chưa nhập gì');
  return txt.split(',').map(p=>p.trim()).filter(Boolean).map(p=>{
    const m=p.split(/[x×*X:]/);
    if(m.length!==2)throw new Error('Sai kiểu "'+p+'" (phải là số_ô×độ_hiếm, ví dụ 2×10)');
    const k=parseInt(m[0],10),w=parseInt(m[1],10);
    if(isNaN(k)||isNaN(w))throw new Error('Sai số ở "'+p+'"');
    return [k,w];
  });
}
function rlSaveSet(){
  let bang;try{bang=rlDocSetO();}catch(e){return toast('❌ '+e.message);}
  api('/api/rl/set',{set:bang}).then(j=>{txClean(['rlSet']);toast('🔢 Đã lưu · trung bình '+j.oSangMoiVan.toFixed(1)+' ô sét/ván · nhà cái vẫn ăn '+(j.anThuc*100).toFixed(2)+'%');refresh();}).catch(e=>toast('❌ '+e.message));
}
function rlSetMacDinh(){
  if(!confirm('Trả bảng số ô sét về mặc định (2×30, 3×26, 4×20, 5×13, 6×7, 7×4)?'))return;
  api('/api/rl/set',{macDinh:true}).then(()=>{const t=document.getElementById('rlSet');if(t){t.dataset.dirty='';t.value='';}toast('↩️ Đã về mặc định');refresh();}).catch(e=>toast('❌ '+e.message));
}
// đổ trạng thái bàn Roulette vào tab (chỉ điền ô nào admin chưa gõ dở)
function rlDo(){
  const S=STATE&&STATE.rl; if(!S)return;
  const cb=document.getElementById('rlOn'); if(cb&&cb.checked!==S.on)cb.checked=S.on;
  const TC=S.tenCua||{};
  const now=document.getElementById('rlNow');
  if(now)now.textContent=S.on?('Ván #'+S.gameId+' · '+(S.secsToLock>0?('còn '+S.secsToLock+'s nhận cược'):('ĐÃ KHOÁ SỔ'+(S.kq?' · ra '+S.kq.so:'')))):'bàn đang tắt';
  const live=document.getElementById('rlLive');
  if(live){const co=Object.keys(S.betAgg||{}).filter(k=>S.betAgg[k]>0).sort((a,b)=>S.betAgg[b]-S.betAgg[a]);
    const tong=co.reduce((s,k)=>s+S.betAgg[k],0);
    const cua=co.length?('💰 tổng cược <b>'+tong.toLocaleString()+'</b> · '+co.slice(0,12).map(k=>esc(TC[k]||k)+' <b>'+S.betAgg[k].toLocaleString()+'</b>').join(' · ')+(co.length>12?(' · +'+(co.length-12)+' cửa nữa'):'')):'chưa ai đặt';
    const per={};
    (S.bets||[]).forEach(b=>{const k=b.name||'?';if(!per[k])per[k]={tong:0,o:[]};per[k].tong+=Number(b.amount)||0;per[k].o.push(esc(TC[b.choice]||b.choice)+' <b>'+Number(b.amount).toLocaleString()+'</b>');});
    const ds=Object.keys(per).sort((a,b)=>per[b].tong-per[a].tong);
    const list=ds.length?ds.map(k=>'<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px dashed #263159">'
      +'<b style="min-width:110px;color:#ffe193">'+esc(k)+'</b><span style="min-width:90px;color:#3ddc84;font-weight:800">'+per[k].tong.toLocaleString()+'</span>'
      +'<span class="muted" style="font-size:12px;flex:1">'+per[k].o.join(' · ')+'</span></div>').join(''):'<div class="muted" style="font-size:12px">chưa ai đặt</div>';
    const setKe=S.nhanHienTai?Object.keys(S.nhanHienTai).map(k=>'Số '+k.slice(1)+' x'+S.nhanHienTai[k]).join(' · '):'';
    live.innerHTML='<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#141824">'
      +'<div style="margin-bottom:5px">👥 <b>Ván #'+S.gameId+'</b> · '+ds.length+' người · '+(S.betsCount||0)+' lượt đặt'+(S.secsToLock>0?' · <span style="color:#3ddc84">còn '+S.secsToLock+'s</span>':' · <span style="color:#ff7a7a">đã khoá sổ</span>')+(setKe?' · ⚡ '+esc(setKe):'')+'</div>'
      +'<div style="margin-bottom:6px;font-size:12.5px">'+cua+'</div>'
      +list+'</div>';}
  const put=(id,v)=>{const e=document.getElementById(id);if(e&&e.dataset.dirty!=='1'&&e.value===''&&document.activeElement!==e)e.value=v;};
  if(S.time){put('rlBetS',S.time.bet);put('rlQuayS',S.time.quay);put('rlRoiS',S.time.roi);}
  put('rlMax',S.maxBet);
  const kp=document.getElementById('rlKhongPhi'); if(kp&&S.rtp&&kp.checked!==!!S.rtp.khongPhi)kp.checked=!!S.rtp.khongPhi;
  if(S.rtp&&!S.rtp.khongPhi)put('rlAn',(S.rtp.an*100).toFixed(1).replace('.0',''));
  const an=document.getElementById('rlAnNote');
  if(an&&S.rtp)an.textContent=S.rtp.khongPhi
    ?('Đang chạy: KHÔNG PHÍ giống nhà cái · nhà cái ăn cố định '+(S.rtp.an*100).toFixed(2)+'% (36/37) · trung bình '+S.rtp.oSangMoiVan.toFixed(1)+' số sét/ván · '+S.rtp.soCua+' cửa')
    :('Đang chạy: CÓ PHÍ · nhà cái ăn '+(S.rtp.an*100).toFixed(1)+'% · phí '+(S.rtp.phi*100).toFixed(2)+'% trên tiền cược · trung bình '+S.rtp.oSangMoiVan.toFixed(1)+' số sét/ván · '+S.rtp.soCua+' cửa');
  const box=document.getElementById('rlTran'), TEN=S.tenNhom||{};
  if(box&&!box.dataset.xong&&S.tran){box.dataset.xong='1';
    box.innerHTML=Object.keys(S.tran).map(k=>'<div style="flex:1 1 180px"><label>'+esc(TEN[k]||k)+'</label><input data-rltran="'+k+'" type="number" min="1000" oninput="txDirty(this)"></div>').join('');}
  document.querySelectorAll('[data-rltran]').forEach(el=>{if(el.dataset.dirty!=='1'&&document.activeElement!==el)el.value=S.tran[el.dataset.rltran];});
  const tn=document.getElementById('rlTranNow');
  if(tn&&S.thangToiDa)tn.innerHTML='Thắng tối đa mỗi cửa theo trần đang đặt: '+
    Object.keys(S.tran||{}).map(k=>'<b>'+esc((TEN[k]||k).split(' (')[0])+'</b> '+(S.thangToiDa[k]||0).toLocaleString('vi-VN')).join(' · ')+'.';
  const tt=document.getElementById('rlThang');
  if(tt&&S.thang&&tt.dataset.dirty!=='1'&&tt.value===''&&document.activeElement!==tt)
    tt.value=Object.keys(S.thang).map(k=>k+': '+S.thang[k].map(b=>b[0]+'×'+b[1]).join(', ')).join(String.fromCharCode(10));
  const tnw=document.getElementById('rlThangNow');
  if(tnw&&S.rtp)tnw.textContent='Thang này đòi trung bình '+S.rtp.oSangMoiVan.toFixed(2)+' ô sét mỗi ván.';
  const ts=document.getElementById('rlSet');
  if(ts&&S.set&&ts.dataset.dirty!=='1'&&ts.value===''&&document.activeElement!==ts)
    ts.value=S.set.map(b=>b[0]+'×'+b[1]).join(', ');
  const snw=document.getElementById('rlSetNow');
  if(snw&&S.rtp&&S.rtp.phanPhoiSet)snw.innerHTML='Xác suất THẬT mỗi ván (sau khi máy nghiêng cho khớp thang): '+S.rtp.phanPhoiSet.map(x=>'<b>'+x.k+' ô</b> '+(x.p*100).toFixed(1)+'%').join(' · ');
  const ep=document.getElementById('rlEpNow');
  if(ep)ep.textContent=(typeof S.ep==='number')?('⚡ Đang chờ áp: ra số '+S.ep):'';
  const nn=document.getElementById('rlNhanNow');
  if(nn){
    const kh=S.epNhanKhoang||{min:30,max:500};
    const khi=S.secsToLock>0
      ? '<span style="color:#3ddc84;font-weight:800">🟢 CÒN '+S.secsToLock+'s - ép giờ áp NGAY lúc khoá sổ ván #'+S.gameId+'</span>'
      : '<span style="color:#ff7a7a;font-weight:800">🔒 ĐÃ KHOÁ SỔ - ép giờ vào VÁN SAU</span>';
    const dang=S.epNhan?('<br>✋ <b>Đang chờ áp:</b> '+Object.keys(S.epNhan).map(k=>'Số '+k.slice(1)+(S.epNhan[k]===0?' TẮT':' x'+S.epNhan[k])).join(' · ')):'';
    nn.innerHTML=khi+' &nbsp;·&nbsp; khoảng ép x'+kh.min+' đến x'+kh.max+' · 0 = tắt ô'+dang;
  }
}
// 📜 một ván Roulette trong tab LOG: số ra + số sét + từng người (đặt, phí, nhận, lãi/lỗ)
function veVanRl(g){
  const per={};
  (g.bets||[]).forEach(b=>{const k=b.u||b.name;if(!per[k])per[k]={name:b.name,dat:0,phi:0,nhan:0,cua:[]};
    per[k].dat+=(b.amount||0);per[k].phi+=(b.phi||0);per[k].nhan+=(Number(b.nhan)||0);per[k].cua.push((b.choice||b.cua)+' '+Number(b.amount||0).toLocaleString());});
  const ds=Object.values(per).map(p=>({...p,net:p.nhan-p.dat-p.phi})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net));
  const nh=g.nhanBoc||g.nhan||{};
  const setKe=Object.keys(nh).map(k=>'x'+nh[k]+' Số '+k.slice(1)).join(' · ');
  const mau=g.so===0?'🟢':(g.mau==='r'?'🔴':'⚫');
  const dong=ds.map(p=>'<div class="'+(p.net>0?'win':(p.net<0?'lose':'b'))+'">'+(p.net>0?'💰':(p.net<0?'💥':'⚖️'))+' <b>'+esc(p.name)+'</b> đặt '+p.dat.toLocaleString()+(p.phi?' (+phí '+p.phi.toLocaleString()+')':'')+' → nhận '+p.nhan.toLocaleString()+' · <b>'+fmtAmt(p.net)+'</b>'+
    '<span class="muted" style="font-size:11px"> · '+esc(p.cua.join(', '))+'</span></div>').join('');
  return '<div class="h"><div class="top"><span>Ván #'+padId(g.gameId)+' · 🎡 ra <b>'+g.so+'</b> '+mau+(setKe?' · ⚡ '+esc(setKe):'')+'</span><span class="t">'+(g.time||'')+'</span></div>'+(dong||'<div class="b">không ai đặt</div>')+'</div>';
}
// ================= ⚡ SIÊU TÀI XỈU =================
function stxBat(v){api('/api/stx/on',{on:v}).then(j=>{toast(j.on?'⚡ Đã BẬT bàn Siêu':'⚡ Đã TẮT bàn Siêu (cược đang có đã hoàn đủ)');refresh();}).catch(e=>toast('❌ '+e.message));}
function stxSaveTime(){
  const b=parseInt(document.getElementById('stxBetS').value),h=parseInt(document.getElementById('stxNhanS').value),n=parseInt(document.getElementById('stxNanS').value);
  if(!(b>=5&&b<=600))return toast('Giây đặt: 5 - 600');
  if(!(h>=0&&h<=60))return toast('Giây hiện nhân: 0 - 60');
  if(!(n>=6&&n<=300))return toast('Giây nặn: 6 - 300');
  api('/api/stx/time',{bet:b,nhan:h,nan:n}).then(j=>{txClean(['stxBetS','stxNhanS','stxNanS']);toast('⏱️ Ván '+j.round+'s = '+j.bet+'+'+j.nhan+'+'+j.nan);refresh();}).catch(e=>toast('❌ '+e.message));
}
function stxSaveAn(){
  const a=parseFloat(document.getElementById('stxAn').value);
  const m=parseInt(document.getElementById('stxMax').value);
  const xong=()=>{txClean(['stxAn','stxMax']);refresh();};
  if(!isNaN(a)){ if(!(a>=2&&a<=30))return toast('Nhà cái ăn: 2 - 30%');
    api('/api/stx/an',{an:a}).then(j=>{toast('🎯 Nhà cái ăn '+(j.an*100).toFixed(1)+'% · người chơi thực nhận '+(j.rtpThuc*100).toFixed(2)+'% · trung bình '+j.oSangMoiVan.toFixed(1)+' ô sáng/ván');xong();}).catch(e=>toast('❌ '+e.message)); }
  if(!isNaN(m)) api('/api/stx/maxbet',{maxBet:m}).then(()=>{toast('💰 Đã lưu trần mỗi người');xong();}).catch(e=>toast('❌ '+e.message));
}
function stxSaveTran(){
  const t={};document.querySelectorAll('[data-stxtran]').forEach(el=>{const v=parseInt(el.value);if(v>0)t[el.dataset.stxtran]=v;});
  api('/api/stx/tran',{tran:t}).then(j=>{document.querySelectorAll('[data-stxtran]').forEach(el=>{el.dataset.dirty='';});toast('🧱 Đã lưu trần Siêu');refresh();}).catch(e=>toast('❌ '+e.message));
}
function stxSaveThang(){
  let bang;try{bang=txDocThangO('stxThang');}catch(e){return toast('❌ '+e.message);}
  api('/api/stx/thang',{thang:bang}).then(j=>{txClean(['stxThang']);toast('🎰 Đã lưu thang · nhà cái ăn ~'+(j.anThuc*100).toFixed(2)+'%');refresh();}).catch(e=>toast('❌ '+e.message));
}
function stxThangMacDinh(){
  if(!confirm('Trả thang hệ số nhân của bàn SIÊU về mặc định?'))return;
  api('/api/stx/thang',{macDinh:true}).then(()=>{const t=document.getElementById('stxThang');if(t){t.dataset.dirty='';t.value='';}toast('↩️ Đã về mặc định');refresh();}).catch(e=>toast('❌ '+e.message));
}
// ---------------------------------------------------------------- ✋ ÉP HỆ SỐ NHÂN (22/09)
// 4 ô đều tiền (TÀI · XỈU · CHẴN · LẺ) + 7 ô bão (22/09 mở thêm). Tên cửa + khoảng hệ số TỪNG Ô
// đều LẤY TỪ MÁY BÀN gửi lên (stx.cuaEp), panel KHÔNG tự bịa, y như khối trần cược đã chốt.
var STX_NHAN_VE='';
// 22/09: danh sách ô ép = S.cuaEp (11 ô, mỗi ô kèm min/max/nhóm). Bản cũ chỉ có cuaDeu (4 ô)
// - vẫn nhận làm dự phòng để bot cũ không vỡ bảng.
function stxDsEp(stx){
  var s=stx||(STATE&&STATE.stx)||{};
  if(Array.isArray(s.cuaEp)&&s.cuaEp.length)return s.cuaEp;
  var kh=s.epNhanKhoang||{min:2,max:14};
  return (s.cuaDeu||[]).map(function(c){return {id:c.id,ten:c.ten,nhom:'deu',min:kh.min,max:kh.max}});
}
function stxVeNhanO(stx){
  var box=document.getElementById('stxNhanO');if(!box||!stx)return;
  var ds=stxDsEp(stx);
  // chỉ vẽ lại khi DANH SÁCH đổi - vẽ mỗi 3 giây là admin đang gõ bị mất chữ
  var sig=JSON.stringify(ds);if(sig===STX_NHAN_VE)return;STX_NHAN_VE=sig;
  var hang=function(nhom,nhan){
    var l=ds.filter(function(c){return c.nhom===nhom});if(!l.length)return '';
    return '<div style="flex:1 1 100%;font-size:12px;color:var(--muted);margin-top:'+(nhom==='deu'?0:6)+'px">'+nhan+'</div>'+
      l.map(function(c){
        return '<label style="display:flex;align-items:center;gap:6px;white-space:nowrap">'+
          '<b style="min-width:86px">'+esc(c.ten)+'</b>'+
          '<input id="stxN_'+c.id+'" type="number" min="0" max="'+c.max+'" placeholder="x'+c.min+'–x'+c.max+'" title="để trống = tự bốc · 0 = tắt · x'+c.min+' đến x'+c.max+'" style="width:110px">'+
          '</label>';
      }).join('');
  };
  box.innerHTML=hang('deu','Đều tiền (x2 → x14)')+hang('bao','🌪️ Bão, 3 con giống nhau (Bão bất kỳ x31 → x499 · Bão 1–6 x151 → x1999)');
}
function stxNhanDat(v){
  stxDsEp().filter(function(c){return c.nhom==='deu'}).forEach(function(c){var e=document.getElementById('stxN_'+c.id);if(e)e.value=(v===''?'':v)});
}
// 🌪️ nút nhanh cho hàng bão: 'max' = từng ô đúng trần riêng của nó, 0 = tắt, '' = xoá
function stxNhanDatBao(v){
  stxDsEp().filter(function(c){return c.nhom==='bao'}).forEach(function(c){var e=document.getElementById('stxN_'+c.id);if(!e)return;e.value=(v===''?'':(v==='max'?c.max:v))});
}
function stxEpNhan(){
  var ds=stxDsEp(),nhan={},co=false;
  ds.forEach(function(c){
    var e=document.getElementById('stxN_'+c.id);if(!e)return;
    var v=(e.value||'').trim();if(v==='')return;
    nhan[c.id]=parseInt(v,10);co=true;
  });
  if(!co)return toast('❌ Chưa nhập ô nào - để trống hết thì có gì mà ép');
  api('/api/stx/epnhan',{nhan:nhan}).then(function(j){
    var ke=Object.keys(j.epNhan).map(function(k){
      var c=(ds.filter(function(x){return x.id===k})[0]||{ten:k});
      return c.ten+(j.epNhan[k]===0?' TẮT':' x'+j.epNhan[k]);
    }).join(' · ');
    toast('✋ '+(j.ngay?('Áp NGAY ván #'+j.gameId):'Áp từ ván sau')+': '+ke);
    refresh();
  }).catch(function(e){toast('❌ '+e.message)});
}
function stxHuyEpNhan(){
  api('/api/stx/epnhanclear',{}).then(function(j){
    toast(j.daHuy?'↩️ Đã huỷ lệnh ép hệ số nhân':'(không có lệnh ép nào đang chờ)');refresh();
  }).catch(function(e){toast('❌ '+e.message)});
}
function stxEp(){
  const d1=+document.getElementById('stxD1').value,d2=+document.getElementById('stxD2').value,d3=+document.getElementById('stxD3').value;
  api('/api/stx/ep',{d1:d1,d2:d2,d3:d3}).then(j=>{toast('⚡ Ván sau ra '+j.ep.join('-'));refresh();}).catch(e=>toast('❌ '+e.message));
}
function stxSetDice(a,b,c){document.getElementById('stxD1').value=a;document.getElementById('stxD2').value=b;document.getElementById('stxD3').value=c;stxPreview();}
function stxPreview(){
  const e=document.getElementById('stxPrev'); if(!e)return;
  const a=+document.getElementById('stxD1').value,b=+document.getElementById('stxD2').value,c=+document.getElementById('stxD3').value;
  const sum=a+b+c, bao=(a===b&&b===c);
  e.textContent='Tổng '+sum+' → '+(bao?'🌪️ BÃO, Tài/Xỉu/Chẵn/Lẻ thua sạch':((sum>=11?'TÀI 🟢':'XỈU 🔴')+' | '+(sum%2===0?'CHẴN 🔵':'LẺ 🟣')));
}
// 🎯 lấy THẲNG gợi ý máy chủ đã duyệt 216 kết cục bằng lõi tiền, không tự đoán ở đây
function stxTuEp(){
  const S=STATE&&STATE.stx; if(!S)return;
  const g=S.epGoiY;
  if(!g||!g.dice){toast('❌ Máy chủ chưa gửi gợi ý ép - thử lại sau vài giây');return;}
  if(!g.soCuoc){toast('Ván này chưa ai đặt - ép kiểu gì cũng như nhau');return;}
  stxSetDice(g.dice[0],g.dice[1],g.dice[2]);
  toast('🎯 '+g.dice.join('-')+' (tổng '+(g.dice[0]+g.dice[1]+g.dice[2])+'): nhà cái trả ít nhất '+g.tra.toLocaleString()+' / tổng cược '+g.tongDat.toLocaleString()+'. Bấm ⚡ Ép để chốt.');
}
function stxHuyEp(){api('/api/stx/epclear',{}).then(j=>{toast(j.daHuy?'↩️ Đã huỷ ép - ván sau quay ngẫu nhiên':'Không có ép nào đang chờ');refresh();}).catch(e=>toast('❌ '+e.message));}
// đọc ô văn bản thang nhân (dùng chung cho cả 2 bàn)
function txDocThangO(id){
  const chu=(document.getElementById(id).value||'').trim();
  const bang={}; const dong=chu.split(/\\r?\\n/).filter(d=>d.trim()&&!d.trim().startsWith('#'));
  for(const d of dong){
    const i=d.indexOf(':'); if(i<0) throw new Error('Thiếu dấu hai chấm ở dòng: '+d.trim());
    const ten=d.slice(0,i).trim();
    const bac=d.slice(i+1).split(',').map(x=>x.trim()).filter(Boolean).map(x=>{
      const m=x.match(/^(\\d+)\\s*[x×*X]\\s*(\\d+)$/);
      if(!m) throw new Error('Sai kiểu "'+x+'" (phải là hệ_số×độ_hiếm, ví dụ 200×45)');
      return [parseInt(m[1]),parseInt(m[2])];
    });
    if(!bac.length) throw new Error('Nhóm "'+ten+'" trống');
    bang[ten]=bac;
  }
  if(!Object.keys(bang).length) throw new Error('Chưa nhập gì');
  return bang;
}
function txSaveRTP(){
  const v=parseFloat(document.getElementById('txRTP').value);
  if(!(v>=80&&v<=99))return toast('RTP: 80 - 99');
  api('/api/tx/rtp',{rtp:v}).then(j=>{
    txClean(['txRTP']);
    toast('🎯 RTP '+(j.rtp*100).toFixed(1)+'% · nhà cái ăn ~'+(j.nhaCaiAn*100).toFixed(2)+'% · trung bình '+j.oSangMoiVan.toFixed(1)+' ô sáng/ván');
    refresh();
  }).catch(e=>toast('❌ '+e.message));
}
function txSaveTran(){
  const tran={}; let xau=null;
  document.querySelectorAll('.txTranO').forEach(function(el){
    const v=parseInt(el.value);
    if(!(v>=1&&v<=100000000)) xau=el.dataset.ten;
    tran[el.dataset.nhom]=v;
  });
  if(xau)return toast('Trần nhóm "'+xau+'" phải từ 1 đến 100.000.000');
  api('/api/tx/tran',{tran:tran}).then(function(){
    document.querySelectorAll('.txTranO').forEach(function(el){el.dataset.dirty='';});
    toast('💾 Đã lưu trần cược từng cửa');refresh();
  }).catch(e=>toast('❌ '+e.message));
}
function txSaveNoti(){
  const id=(document.getElementById('txNotiId').value||'').trim();
  const on=document.getElementById('txNotiOn').checked;
  const min=parseInt(document.getElementById('txNotiMin').value)||0;
  if(on&&!id)return toast('Bật báo thì phải điền ID Discord');
  api('/api/tx/noti',{id:id,on:on,min:min}).then(j=>{txClean(['txNotiId','txNotiMin','txNotiOn']);toast(j.on?'🔔 Đã BẬT báo cược':'🔕 Đã TẮT báo cược');refresh();}).catch(e=>toast('❌ '+e.message));
}
function pokerSaveAdmin(){
  const ids=(document.getElementById('pokerAdminIds').value||'').trim();
  api('/api/poker/admin',{ids:ids}).then(j=>{txClean(['pokerAdminIds']);toast('🃏 Admin poker: '+(j.ids.length?j.ids.join(', '):'(trống, không ai mở được giải)'));refresh();}).catch(e=>toast('❌ '+e.message));
}
// ===== 🀄 TAB TIẾN LÊN (SUPER), bàn ăn KNB thật =====
// Vẽ từ STATE.tienlen (tomTat) mỗi 3 giây. Mọi ô nhập đều theo khuôn "đang sửa thì đừng ghi đè"
// (document.activeElement), không thì vòng làm mới 3 giây cướp chữ đang gõ.
function tlFill(){
  const DS=STATE.tienlen, on=!!STATE.tienlenOn;
  const ck=document.getElementById('tlOn'); if(ck&&document.activeElement!==ck) ck.checked=on;
  const now=document.getElementById('tlOnNow'); if(now) now.textContent=on?'Đang HIỆN, người chơi thấy tab TIẾN LÊN':'Đang ẨN, người chơi không thấy tab';
  const ai=document.getElementById('tlAdminIds'); if(ai&&document.activeElement!==ai&&!ai.value) ai.value=(STATE.tienlenAdmin||[]).join(', ');
  const ds=document.getElementById('tlDs'); if(!ds) return;
  if(!DS||!DS.length){ ds.innerHTML='<div class="muted">'+(DS?'Chưa có phòng nào đang mở.':'Bot chưa nạp mô-đun Tiến Lên.')+'</div>'; return; }
  // Vẽ lại cả khối mỗi 3 giây thì cướp mất ô đang gõ -> chỉ vẽ khi KHÔNG ai đang gõ trong đó.
  const dangGo=document.activeElement&&ds.contains(document.activeElement);
  if(dangGo) return;
  ds.innerHTML=DS.map(T=>{
    const C=T.cauHinh||{}, chay=T.ban&&T.ban.trangThai==='DANG_CHAY';
    let h='<div class="card" style="margin-bottom:10px;padding:12px">';
    h+='<div style="font-weight:800;font-size:14px">'+esc(T.ten||T.ma)+' <span class="muted" style="font-weight:400;font-size:12px">('+T.ma+')</span></div>';
    h+='<div class="muted" style="font-size:12px;margin-top:2px">'+esc(T.cheDoTen)+' · cược '+(C.mucCuoc||0).toLocaleString('vi-VN')+
       ' · vốn tối thiểu '+(T.vonToiThieu||0).toLocaleString('vi-VN')+' · phế '+Math.round((T.pheTram||0)*100)+'%</div>';
    h+='<div class="row" style="margin-top:8px;gap:12px;flex-wrap:wrap">'+
       [['baBichOn','3♠ đi đầu'],['toiTrangOn','Tới trắng'],['chatHeoOn','Chặt có thưởng'],['thoiHeoOn','Nhốt (thối)']].map(([k,t])=>
         '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" data-tl="'+T.ma+'" data-k="'+k+'"'+(C[k]?' checked':'')+'> '+t+'</label>').join('')+
       '<input class="mini-in" style="width:120px" type="number" min="100" max="1000000" step="1000" data-tl="'+T.ma+'" data-k="mucCuoc" value="'+(C.mucCuoc||0)+'">'+
       '<button class="btn-green" onclick="tlLuu(\\''+T.ma+'\\')">💾 Lưu</button>'+
       '<button class="btn-green" onclick="tlBatDau(\\''+T.ma+'\\')"'+((chay||T.soNgoi<T.toiThieu)?' disabled':'')+'>▶️ Mở bàn ('+T.soNgoi+')</button>'+
       '<button class="btn-red" onclick="tlGiaiTan(\\''+T.ma+'\\')">🧹 Giải tán</button></div>';
    h+='<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px">'+T.ghe.map((x,k)=>
       '<span style="padding:5px 9px;border-radius:9px;border:1px solid var(--line);background:'+(x?'var(--card2)':'transparent')+';font-size:12px">'+
       (k+1)+'. '+(x?('<b>'+esc(x.ten)+'</b>'):'<span class="muted">trống</span>')+'</span>').join('')+'</div>';
    if(T.ban){
      h+='<div style="margin-top:8px;font-size:12px"><b>Ván #'+T.ban.soVan+'</b> · '+(chay?'đang đánh':'nghỉ giữa ván')+'</div>';
      h+='<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px">'+T.ban.nguoi.map(p=>
         '<span style="padding:5px 9px;border-radius:9px;border:1px solid var(--line);background:var(--card2);font-size:12px">'+
         esc(p.ten)+' · '+p.soLa+' lá · <b style="color:'+(p.tong>=0?'#3dd68c':'#ff6b6b')+'">'+(p.tong>=0?'+':'')+p.tong.toLocaleString('vi-VN')+'</b>'+(p.afk?' 📵':'')+'</span>').join('')+'</div>';
      const nk=T.ban.nhatKy||[];
      if(nk.length) h+='<div class="muted" style="font-size:11.5px;margin-top:6px">Ván gần đây: '+nk.slice(0,5).map(x=>'#'+x.van+' '+Object.keys(x.tien).map(id=>(x.tien[id]>=0?'+':'')+x.tien[id].toLocaleString('vi-VN')).join('/').slice(0,40)).join(' · ')+'</div>';
    }
    return h+'</div>';
  }).join('');
}
function tlBat(on){ api('/api/tienlen/on',{on:on}).then(j=>{toast(j.on?'🀄 Đã HIỆN tab Tiến Lên':'🀄 Đã ẨN tab Tiến Lên');refresh();}).catch(e=>toast('❌ '+e.message)); }
function tlTaoPhong(){
  const o={cheDo:document.getElementById('tlTaoCheDo').value, mucCuoc:parseInt(document.getElementById('tlTaoMuc').value)||0};
  api('/api/tienlen/tao',o).then(j=>{toast('➕ Đã mở phòng '+j.ma);refresh();}).catch(e=>toast('❌ '+e.message));
}
function tlLuu(ma){
  const o={};
  document.querySelectorAll('[data-tl="'+ma+'"]').forEach(e=>{
    o[e.dataset.k] = e.type==='checkbox' ? e.checked : (parseInt(e.value)||0);
  });
  api('/api/tienlen/'+ma+'/cauhinh',o).then(()=>{toast('💾 Đã lưu cấu hình phòng '+ma);refresh();}).catch(e=>toast('❌ '+e.message));
}
function tlBatDau(ma){ api('/api/tienlen/'+ma+'/batdau',{}).then(j=>{toast('▶️ Đã mở bàn '+j.soNguoi+' người');refresh();}).catch(e=>toast('❌ '+e.message)); }
function tlGiaiTan(ma){ api('/api/tienlen/'+ma+'/giaitan',{}).then(()=>{toast('🧹 Đã giải tán bàn '+ma);refresh();}).catch(e=>toast('❌ '+e.message)); }
function tlLuuAdmin(){
  const ids=(document.getElementById('tlAdminIds').value||'').trim();
  api('/api/tienlen/admin',{ids:ids}).then(j=>{toast('🀄 Admin Tiến Lên: '+(j.ids.length?j.ids.join(', '):'(trống)'));refresh();}).catch(e=>toast('❌ '+e.message));
}

// ===== 🃏 TAB POKER (SUPER) =====
// Vẽ từ STATE.poker (tomTat) mỗi 3 giây. Ô chọn chip: không ghi đè khi admin đang mở nó.
function pokerFill(){
  const P=STATE.poker, on=!!STATE.pokerOn;
  const ck=document.getElementById('pkOn'); if(ck&&document.activeElement!==ck) ck.checked=on;
  const now=document.getElementById('pkOnNow'); if(now) now.textContent=on?'Đang HIỆN, người chơi thấy tab GIẢI POKER':'Đang ẨN, người chơi không thấy tab (API vẫn sống cho ván đang đánh)';
  if(!P){ const g=document.getElementById('pkGhe'); if(g) g.innerHTML='<div class="muted">Bot chưa nạp mô-đun poker.</div>'; return; }
  const sel=document.getElementById('pkChip'); if(sel&&document.activeElement!==sel&&String(sel.value)!==String(P.chipDau)) sel.value=String(P.chipDau);
  const th=document.getElementById('pkThang'); if(th) th.textContent='Thang blind: '+P.lichBlind.map(x=>x.toLocaleString('vi-VN')).join(' → ')+' · lên mức mỗi 8 phút hoặc mỗi vòng (tối thiểu 6 ván)';
  const chay=P.giai&&P.giai.trangThai==='DANG_CHAY';
  const bd=document.getElementById('pkBatDau'); if(bd){ bd.textContent='▶️ Bắt đầu ('+P.soNgoi+' người)'; bd.disabled=chay||P.soNgoi<P.toiThieu; }
  const ng=document.getElementById('pkNghi'); if(ng) ng.disabled=!chay||P.giai.nghi;
  const tp=document.getElementById('pkTiep'); if(tp) tp.disabled=!chay||!P.giai.nghi;
  const ghe=document.getElementById('pkGhe');
  if(ghe){
    let h='<div style="font-weight:700;margin-bottom:6px">Ghế ('+P.soNgoi+'/'+P.toiDa+')</div><div class="row" style="flex-wrap:wrap;gap:6px">';
    P.ghe.forEach((x,i)=>{ h+='<span style="padding:6px 10px;border-radius:9px;border:1px solid var(--line);background:'+(x?'var(--card2)':'transparent')+';font-size:12px">'+(i+1)+'. '+(x?('<b>'+esc(x.ten)+'</b>'):'<span class="muted">trống</span>')+'</span>'; });
    ghe.innerHTML=h+'</div>';
  }
  const gi=document.getElementById('pkGiai');
  if(gi){
    if(!P.giai){ gi.innerHTML='<div class="muted">Chưa có giải nào đang chạy.</div>'; }
    else{
      const g=P.giai;
      let h='<div style="font-weight:700;margin-bottom:6px">Giải: '+(g.trangThai==='XONG'?'ĐÃ XONG':(g.nghi?'ĐANG TẠM NGHỈ':'ĐANG CHẠY'))+' · ván #'+g.soVan+' · mức '+g.mucBlind+' ('+g.blind.sb+'/'+g.blind.bb+')</div>';
      h+='<table style="width:100%;font-size:12.5px"><tr><th style="text-align:left">Người</th><th style="text-align:right">Chip</th><th></th></tr>';
      g.nguoi.forEach(p=>{ h+='<tr><td>'+esc(p.ten)+'</td><td style="text-align:right;font-variant-numeric:tabular-nums">'+p.chip.toLocaleString('vi-VN')+'</td><td>'+(p.chip<=0?'💀 cháy':(p.afk?'📵 rớt mạng':''))+'</td></tr>'; });
      h+='</table>';
      if(g.ketQua){ h+='<div style="margin-top:8px;font-weight:700">🏆 Kết quả</div>'; g.ketQua.forEach(k=>{ h+='<div>'+k.hang+'. '+esc(k.ten)+'</div>'; }); }
      gi.innerHTML=h;
    }
  }
}
function pokerOn(on){ api('/api/poker/on',{on:on}).then(j=>{toast(j.on?'🃏 Đã HIỆN tab poker':'🃏 Đã ẨN tab poker');refresh();}).catch(e=>toast('❌ '+e.message)); }
function pokerChip(){ api('/api/poker/chip',{chipDau:Number(document.getElementById('pkChip').value)}).then(j=>{toast('🃏 Chip khởi điểm: '+j.chipDau.toLocaleString('vi-VN'));refresh();}).catch(e=>toast('❌ '+e.message)); }
function pokerBatDau(){ api('/api/poker/batdau',{}).then(j=>{toast('▶️ Đã mở giải '+j.soNguoi+' người');refresh();}).catch(e=>toast('❌ '+e.message)); }
function pokerGiaiTan(){ if(!confirm('Giải tán: dọn sạch bàn, ai muốn thì ngồi lại từ đầu?'))return; api('/api/poker/giaitan',{}).then(()=>{toast('🧹 Đã giải tán');refresh();}).catch(e=>toast('❌ '+e.message)); }
function pokerNghi(){ api('/api/poker/nghi',{}).then(()=>{toast('⏸️ Cả bàn tạm nghỉ');refresh();}).catch(e=>toast('❌ '+e.message)); }
function pokerTiep(){ api('/api/poker/tiep',{}).then(()=>{toast('▶️ Chơi tiếp');refresh();}).catch(e=>toast('❌ '+e.message)); }
setInterval(function(){ if(localStorage.getItem('panel_tab')==='poker'&&STATE&&STATE.poker!==undefined) pokerFill(); },3000);
function txTestNoti(){
  api('/api/tx/notitest',{}).then(j=>toast('📨 Đã gửi thử - kiểm '+(j.kieu==='user'?'tin nhắn riêng':'kênh')+' xem có nhận được không')).catch(e=>toast('❌ '+e.message));
}
function txSaveMaxBet(){const n=parseInt(document.getElementById('txMaxBet').value);if(!(n>=0))return toast('Nhập số ≥ 0 (0 = không giới hạn)');api('/api/tx/maxbet',{maxBet:n}).then(j=>{toast('💰 Trần cược Big Small: '+(j.maxBet?j.maxBet.toLocaleString('vi-VN')+'/người/ván':'KHÔNG giới hạn'));refresh();}).catch(e=>toast('❌ '+e.message));}
async function txStop(){if(!await uiConfirm('Tắt bàn Big Small?','Tắt bàn','btn-red'))return;api('/api/tx/stop',{}).then(()=>{toast('⏹️ Đã tắt bàn Big Small');refresh();});}

// 🎯 14/09: đặt THẲNG số tiền trong hũ - gõ số rồi bấm, hũ thành đúng số đó
// 🏆 09/09: bội số nổ hũ (Dò Mìn/Leo Thang) - danh sách "10,15,20", trúng 🏆 bốc ngẫu nhiên 1 số × tiền cược
async function potCfgSave(key,btn){
  const raw=(document.getElementById('potMults_'+key).value||'').trim();
  const mults=[...new Set(raw.split(/[,\s;\/x]+/).map(Number).filter(x=>x>=1&&x<=1000))].sort((a,b)=>a-b);
  if(!mults.length||mults.length>6)return toast('❌ Nhập 1-6 bội số từ 1 đến 1000, vd: 10,15,20');
  const lb=(STATE.pot&&STATE.pot.labels&&STATE.pot.labels[key])||key;
  if(!await uiConfirm(lb+': trúng 🏆 bốc ngẫu nhiên x'+mults.join(' / x')+' tiền cược (cược 1.000 → '+(1000*mults[0]).toLocaleString('vi-VN')+' tới '+(1000*mults[mults.length-1]).toLocaleString('vi-VN')+') + trần ván?','💾 Lưu bội số','btn-green'))return;
  await runBtn(btn,'Lưu...',()=>api('/api/pot/cfg',{key:key,mults:mults}).then(j=>{toast('💾 '+lb+': nổ hũ bốc x'+j.cfg.mults.join(' / x')+' tiền cược');refresh();}));
}
function mineBoardStart(){const c=document.getElementById('mineChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/mines/board/start',{channelId:c}).then(j=>{toast('▶️ Đã đăng bảng Dò Mìn ở #'+j.name);refresh();});}
async function mineBoardStop(){if(!await uiConfirm('Gỡ bảng Dò Mìn khỏi Discord?','Gỡ bảng','btn-red'))return;api('/api/mines/board/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng Dò Mìn');refresh();});}
function spmBoardStart(){const c=document.getElementById('spmChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/spm/board/start',{channelId:c}).then(j=>{toast('▶️ Đã đăng bảng Phi Thuyền ở #'+j.name);refresh();});}
async function spmBoardStop(){if(!await uiConfirm('Gỡ bảng Phi Thuyền khỏi Discord?','Gỡ bảng','btn-red'))return;api('/api/spm/board/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng Phi Thuyền');refresh();});}
function stairBoardStart(){const c=document.getElementById('stairChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/stairs/board/start',{channelId:c}).then(j=>{toast('▶️ Đã đăng bảng Leo Thang ở #'+j.name);refresh();});}
async function stairBoardStop(){if(!await uiConfirm('Gỡ bảng Leo Thang khỏi Discord?','Gỡ bảng','btn-red'))return;api('/api/stairs/board/stop',{}).then(()=>{toast('⏹️ Đã gỡ bảng Leo Thang');refresh();});}
function whSaveMin(){
  const n=parseInt(document.getElementById('whMin').value);
  const ps=['whP1','whP2','whP3'].map(id=>parseInt(document.getElementById(id).value));
  const hasP=ps.every(v=>Number.isFinite(v));
  if(!n&&!hasP)return toast('Nhập số người hoặc đủ 3 mốc giá vé');
  if(n&&(n<1||n>50))return toast('Số người 1–50');
  if(hasP&&!ps.every(v=>v>=100&&v<=1000000))return toast('Mốc giá vé trong 100 – 1.000.000');
  const steps=[];
  if(n)steps.push(()=>api('/api/wheel/min',{minPlayers:n}));
  if(hasP)steps.push(()=>api('/api/wheel/prices',{prices:ps}));
  steps.reduce((p,f)=>p.then(f),Promise.resolve()).then(()=>{toast('💾 Đã lưu vòng quay');refresh();}).catch(e=>toast('❌ '+(e.message||'Lỗi')));
}
async function whReset(){if(!await uiConfirm('Reset lượt vòng quay: CẢ SERVER quay lại được ngay, không đợi 00:00/12:00?','Reset lượt','btn-red'))return;api('/api/wheel/reset',{}).then(j=>{toast('🔄 Đã reset lượt cho '+j.n+' người');refresh();}).catch(()=>{});}
// ===== 📈 SÀN CỔ PHIẾU =====
// ===== 📈 SÀN CỔ PHIẾU (panel) =====
// Ô số to + bảng 2 phe MUA/BÁN lời lỗ màu; can thiệp là TRÔI KÍN - người chơi
// không được báo, nên panel phải cho admin XEM TRƯỚC từng người ±bao nhiêu.
function skRow(p){
  const w=p.pl>=0;
  // _i = vị trí trong STATE.stock.positions - nút 💀/🎁 tra ngược qua đây,
  // không nhét tên vào onclick (tên có dấu nháy là vỡ HTML)
  // 04/09: nút 💀/🎁 (kéo giá nhắm người) CHỈ hiện ở cổng SUPER - admin thường chỉ xem
  const hitBtns=(STATE&&STATE.superAdmin)?('<button class="skmini" title="Cho người này THUA" onclick="skHit('+p._i+',0)">💀</button>'+
    '<button class="skmini" title="Cho người này THẮNG" onclick="skHit('+p._i+',1)">🎁</button>'):'';
  return '<div class="skrow2"><span>'+esc(p.name)+' <span style="color:var(--mut)">x'+p.lev+' · '+p.shares+' CP · '+p.mins+'p</span></span>'+
    '<span><b style="color:'+(w?'var(--green)':'var(--red)')+'">'+(w?'+':'')+p.pl.toLocaleString()+'</b>'+hitBtns+'</span></div>';
}
function skFill(k){
  if(!k)return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&document.activeElement!==e&&!e.value)e.value=v;};
  set('skTickAmp',k.tickAmp);set('skSpread',k.spreadPct);set('skMaxShares',k.maxShares);set('skMaxPer',k.maxPer);
  set('skMaxLev',k.maxLev);set('skHold',k.holdS);set('skPoint',k.pointX);
  set('skWaveLow',k.waveLow);set('skWaveHigh',k.waveHigh);
  if(!skWaveTicked){skWaveTicked=true;const cb=document.getElementById('skWaveOn');if(cb)cb.checked=k.waveOn!==false;}
  const wn=document.getElementById('skWaveNow');
  if(wn)wn.innerHTML=(k.waveOn!==false?('🌊 Nhốt giá trong band BẬT - giá <b>chỉ loanh quanh</b> trong <b>'+(k.waveLow||1000).toLocaleString()+'–'+(k.waveHigh||1300).toLocaleString()+'</b>'+(k.anchor?(', neo đang ở ~<b>'+k.anchor.v.toLocaleString()+'</b>'):'')+'. Chạm mép bị đẩy vào, ~98% thời gian nằm gọn trong band (thỉnh thoảng chạm nhẹ mép rồi bật ra).'):'Nhốt giá TẮT - giá thả rông cả <b>10–4.000</b>, bám mốc gốc 1.000.');
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
    k.capWorst.toLocaleString()+'</b> - đã nhân sức nặng.';
  // bảng 2 phe - đánh số _i trước khi lọc để nút 💀/🎁 tra đúng người
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
    dr.innerHTML='🌊 Giá đang trôi về <b>'+k.drift.target.toLocaleString()+'</b> ('+(k.drift.by==='admin'?'admin can thiệp':'sóng tự động')+') - còn ~<b>'+k.drift.secsLeft+' giây</b>. Can thiệp mới sẽ ĐÈ lên sóng này.';}
  else dr.style.display='none';
  const b=document.getElementById('skOpenBtn');
  if(b){b.textContent=k.open?'⏸ Tạm đóng sàn':'▶️ Mở lại sàn';b.className=k.open?'btn-red':'btn-green';}
  skPushPrev();
}
// Nhập theo SỐ GIÁ (điểm), không phải % - chủ server chốt 25/08: "giá 900, nhập 5
// bấm trừ là về 895". Server vẫn nhận %, panel tự quy đổi theo giá hiện tại; vì
// target = giá×(1+amt/giá) = giá+amt nên đích ra ĐÚNG số điểm đã nhập.
function skAmtGet(){let v=Math.abs(parseFloat(document.getElementById('skPushPct').value));if(!(v>0))v=5;return Math.round(v)}
function skAmtSet(v){document.getElementById('skPushPct').value=v;skPushPrev();}
function skSecsGet(){let v=parseInt(document.getElementById('skPushSecs').value)||150;if(v<30)v=30;if(v>600)v=600;return v}
// XEM TRƯỚC CẢ HAI HƯỚNG - theo điểm giá thì CHÍNH XÁC TUYỆT ĐỐI:
// delta = shares × sốGiá × sức nặng (MUA ăn khi ➕, BÁN ăn khi ➖).
function skPushPrev(){
  const k=STATE&&STATE.stock,box=document.getElementById('skPushPrev');
  if(!box||!k)return;
  const amt=skAmtGet();
  const ps=k.positions||[];
  if(!ps.length){box.style.display='block';box.innerHTML='Không ai đang giữ lệnh - kéo giá lúc này không tốn của bot đồng nào.';return}
  const money=v=>'<b style="color:'+(v>=0?'var(--green)':'var(--red)')+'">'+(v>=0?'+':'')+v.toLocaleString()+'</b>';
  let up=0;
  const rows=ps.map(p=>{
    const d=(p.side==='long'?1:-1)*p.shares*amt*(k.pointX||1);
    up+=d;
    return '<div class="skrow2"><span>'+(p.side==='long'?'🟢':'🔴')+' '+esc(p.name)+'</span>'+
      '<span>➖ '+money(-d)+' &nbsp;·&nbsp; ➕ '+money(d)+'</span></div>';
  }).join('');
  box.style.display='block';
  box.innerHTML='<b>Nếu giá đi '+amt+' điểm</b> ('+k.price.toLocaleString()+' → ➖ '+(k.price-amt).toLocaleString()+' hoặc ➕ '+(k.price+amt).toLocaleString()+') - mỗi người sẽ ±:'+rows+
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
// 💀/🎁 cạnh tên: tự chọn hướng - MUA thua = ➖ trừ giá, BÁN thua = ➕ cộng giá (và ngược lại)
function skHit(i,win){
  const k=STATE&&STATE.stock,p=k&&(k.positions||[])[i];
  if(!p)return toast('Người này vừa đóng lệnh - bảng sẽ tự cập nhật');
  const sign=(p.side==='long')===(win===1)?1:-1;
  const amt=skAmtGet();
  const d=(p.side==='long'?1:-1)*sign*p.shares*amt*(k.pointX||1);
  skPush(sign,(win?'🎁 Cho ':'💀 Cho ')+p.name+(win?' THẮNG':' THUA')+': '+(sign>0?'➕ cộng ':'➖ trừ ')+amt+' giá ('+k.price.toLocaleString()+' → ~'+(k.price+amt*sign).toLocaleString()+') → '+p.name+' ('+(p.side==='long'?'MUA':'BÁN')+') sẽ '+(d>=0?'+':'')+d.toLocaleString()+' KNB. Ai cùng phe cũng '+(win?'thắng':'thua')+' theo, phe kia ngược lại.');
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
  if(!(o.waveLow>=10&&o.waveLow<=4000))return toast('Đáy band phải trong 10–4000');
  if(!(o.waveHigh>=10&&o.waveHigh<=4000))return toast('Trần band phải trong 10–4000');
  if(!(o.waveLow<o.waveHigh))return toast('Đáy band phải NHỎ HƠN trần band');
  if(o.waveHigh-o.waveLow<50)return toast('Band quá hẹp - để chênh đáy/trần ít nhất 50 cho nến còn đường chạy');
  api('/api/stock/cfg',o).then(()=>{toast('💾 Đã lưu cấu hình sàn');refresh();}).catch(e=>toast('❌ '+e.message));
}

let skWaveTicked=false;
// 🚀 Phi Thuyền config + can thiệp
let spTicked=false;
function spFill(k){
  if(!k)return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&document.activeElement!==e&&!e.value)e.value=v;};
  set('spBetS',k.betS);set('spGrowth',k.growth);set('spEdge',+(k.houseEdge*100).toFixed(2));set('spMaxMult',k.maxMult);
  set('spMinBet',k.minBet);set('spMaxBet',k.maxBet);set('spReveal',k.crashRevealS);
  if(!spTicked){spTicked=true;document.getElementById('spOpen').checked=!!k.open;}
  // 09/09: nút to mở/đóng - luôn theo trạng thái thật (ô tick chỉ đồng bộ khi không đang bấm)
  const ob=document.getElementById('spOpenBtn');if(ob&&!ob.disabled){ob.textContent=k.open?'⏸ Tạm đóng Phi Thuyền':'▶️ Mở lại Phi Thuyền';ob.className=k.open?'btn-red':'btn-green';}
  const oc=document.getElementById('spOpen');if(oc&&document.activeElement!==oc)oc.checked=!!k.open;
  document.getElementById('spNow').innerHTML='Đang áp dụng: edge <b>'+(k.houseEdge*100).toFixed(1)+'%</b> (RTP '+(100-k.houseEdge*100).toFixed(1)+'%) · cược '+k.minBet.toLocaleString()+'–'+k.maxBet.toLocaleString()+' · tối đa <b>'+k.maxMult+'x</b> · tốc độ '+k.growth+' · cửa '+k.betS+'s · '+(k.open?'ĐANG MỞ':'<b style="color:var(--red)">ĐANG ĐÓNG</b>');
}
function spLiveRender(){
  const s=STATE&&STATE.spmState;const box=document.getElementById('spLive');if(!box)return;
  if(!s){box.textContent='-';return;}
  const lbl={bet:'⏳ chờ cược',fly:'🚀 đang bay',crash:'💥 nổ'}[s.phase]||s.phase;
  let t='Chuyến #'+s.roundId+' · '+lbl;
  if(s.phase==='fly'&&s.liveMult)t+=' <b>'+s.liveMult+'x</b>';
  if(s.phase==='crash')t+=' <b>'+s.crashPoint+'x</b>';
  t+=' · '+(s.bets?s.bets.length:0)+' người · tổng cược <b>'+(s.totalStake||0).toLocaleString()+'</b>';
  if(s.forced)t+=' · ⚡ <b style="color:#ffcf5c">đã ép '+s.forced+'x (chuyến tới)</b>';
  box.innerHTML=t;
}
// 09/09: đóng/mở Phi Thuyền 1 nút (chủ server không thấy ô tick "Mở game" nhỏ). Đóng = không đặt
// cược mới (chuyến đang bay vẫn bay + rút được), web hiện "ĐANG ĐÓNG" và khoá nút đặt.
async function spToggle(){
  if(!STATE||!STATE.spmCfg){toast('⏳ Panel chưa tải xong cấu hình Phi Thuyền - chờ 2 giây bấm lại');return;}
  const open=!STATE.spmCfg.open;
  if(!open&&!await uiConfirm('Tạm đóng Phi Thuyền? Không nhận cược mới, chuyến đang bay vẫn bay và rút được.','⏸ Đóng','btn-red'))return;
  const b=document.getElementById('spOpenBtn');if(b)b.disabled=true;
  api('/api/spm/cfg',{open}).then(j=>{
    const real=!!(j.cfg&&j.cfg.open);
    if(STATE&&STATE.spmCfg)STATE.spmCfg.open=real;
    if(b){b.disabled=false;b.textContent=real?'⏸ Tạm đóng Phi Thuyền':'▶️ Mở lại Phi Thuyền';b.className=real?'btn-red':'btn-green';}
    const oc=document.getElementById('spOpen');if(oc)oc.checked=real;
    toast(real?'▶️ Phi Thuyền ĐANG MỞ':'⏸ Phi Thuyền ĐÃ ĐÓNG - không nhận cược mới');
  }).catch(()=>{if(b)b.disabled=false;});
}
function spSave(){
  const o={betS:parseInt(document.getElementById('spBetS').value),growth:parseFloat(document.getElementById('spGrowth').value),
    houseEdge:(parseFloat(document.getElementById('spEdge').value)||0)/100,maxMult:parseInt(document.getElementById('spMaxMult').value),
    minBet:parseInt(document.getElementById('spMinBet').value),maxBet:parseInt(document.getElementById('spMaxBet').value),
    crashRevealS:parseInt(document.getElementById('spReveal').value),open:document.getElementById('spOpen').checked};
  if(!(o.minBet>=1))return toast('Cược tối thiểu ≥ 1');
  if(!(o.maxBet>=o.minBet))return toast('Cược tối đa phải ≥ tối thiểu');
  if(!(o.houseEdge>=0&&o.houseEdge<=0.2))return toast('House edge trong 0–20%');
  if(!(o.maxMult>=2))return toast('Hệ số tối đa ≥ 2');
  if(!(o.growth>=0.02&&o.growth<=1))return toast('Tốc độ bay trong 0.02–1');
  api('/api/spm/cfg',o).then(()=>{toast('💾 Đã lưu Phi Thuyền');refresh();}).catch(e=>toast('❌ '+e.message));
}
function spForceCrash(){
  const v=parseFloat(document.getElementById('spForce').value);if(!(v>=1))return toast('Nhập điểm nổ ≥ 1.00');
  api('/api/spm/force',{m:v}).then(j=>{toast('⚡ Đã ép chuyến tới nổ '+j.forced+'x');document.getElementById('spForce').value='';refresh();}).catch(e=>toast('❌ '+e.message));
}
async function skToggle(){
  // 26/08: KHÔNG đoán mò khi chưa có state - trước đây STATE.stock chưa tải xong mà
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
// 📦 KHO ĐỒ TOÀN GAME (chỉ SUPER) - tải 1 lần khi mở tab, tìm client-side
let GV=null,GVBUSY=false;
// 06/10: món = tlbb.items() {id, n, kind}; kind do panel GM đặt theo file nguồn
const GV_TYPES={'Vat pham':'🧪 Vật phẩm','Ngoc':'💎 Ngọc','Trang bi':'🗡️ Trang bị'};
async function gvLoad(){
  if(GV)return;
  try{
    const j=await api('/api/gameitems');
    GV=j;
    const ts=document.getElementById('gvTarget');
    // 18/09: mọi ví (value = Discord ID) - 🎮 tên nhân vật nếu đã liên kết, 🧰 số món đang trong rương hôm nay
    const cur=ts.value;
    ts.innerHTML=(j.wallets||[]).map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+(w.ingame?' · 🎮 '+esc(w.ingame):' · (chưa liên kết)')+(w.ichky?' · 🧰 '+w.ichky:'')+'</option>').join('')||'<option value="">(chưa có ví nào)</option>';
    if(cur)ts.value=cur;
    const seen=[...new Set((j.items||[]).map(x=>x.kind).filter(Boolean))];
    document.getElementById('gvType').innerHTML='<option value="">Tất cả nhóm</option>'+seen.map(t=>'<option value="'+esc(t)+'">'+esc(GV_TYPES[t]||t)+'</option>').join('');
    gvRender();
  }catch(e){document.getElementById('gvStat').textContent='❌ '+e.message+' (tab này chỉ chạy ở cổng SUPER)';}
}
function gvRender(){
  if(!GV)return;
  const q=(document.getElementById('gvFind').value||'').trim().toLowerCase();
  const ty=document.getElementById('gvType').value;
  let rows=(GV.items||[]).filter(x=>(!ty||x.kind===ty)&&(!q||x.n.toLowerCase().includes(q)||x.id.toLowerCase().includes(q)||(x.d||'').toLowerCase().includes(q)));
  document.getElementById('gvStat').textContent=rows.length.toLocaleString()+' món khớp'+(rows.length>80?' - hiện 80 đầu, gõ thêm để lọc':'');
  rows=rows.slice(0,80);
  document.getElementById('gvList').innerHTML=rows.map(x=>{
    const ic='<span style="font-size:24px">📦</span>';
    const rc=x.r>=4?'#ffd76a':(x.r===3?'#c9a2ff':(x.r===2?'#7ab6ff':'var(--tx)'));
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;margin-top:5px;border:1px solid var(--line);border-radius:9px;background:var(--card2)">'+ic
      +'<div style="flex:1;min-width:0"><div style="font-weight:700;color:'+rc+'">'+esc(x.n)+' <span class="muted" style="font-weight:400;font-size:11px">'+esc(x.id)+(x.kind?' · '+esc(GV_TYPES[x.kind]||x.kind):'')+'</span></div>'
      +(x.d?'<div class="muted" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(x.d)+'</div>':'')+'</div>'
      +'<button class="mini btn-green gv-give" data-lbl="🎁 Giao" style="flex:0 0 auto" '+(GVBUSY?'disabled':'')+' onclick="gvGive(\\''+x.id+'\\',this,\\'game\\')">'+(GVBUSY&&GVBUSY.id===x.id&&GVBUSY.where==='game'?'⏳ Đang giao...':'🎁 Giao')+'</button>'
      +'<button class="mini btn-grey gv-give" data-lbl="🧰 Rương" title="Bỏ thẳng vào Rương Ích Kỷ - không tính hạn, không cần online/liên kết" style="flex:0 0 auto" '+(GVBUSY?'disabled':'')+' onclick="gvGive(\\''+x.id+'\\',this,\\'ruong\\')">'+(GVBUSY&&GVBUSY.id===x.id&&GVBUSY.where==='ruong'?'⏳...':'🧰 Rương')+'</button></div>';
  }).join('')||'<div class="empty">Không món nào khớp.</div>';
}
// Nút "Giao": bấm → khoá TẤT CẢ nút Giao, nút vừa bấm đổi chữ ⏳ (như bảng người chơi), xong
// (thành công hay lỗi) mới mở lại. Kết quả ghi vào khung #gvResult (giữ 8 dòng mới nhất) để
// không phải F12; server cũng có deliverLock nên không bao giờ 2 lệnh chạy chồng.
// where: 'game' = /api/give/item vào túi (ô gõ tay ưu tiên, không thì tên nhân vật của ví đã chọn);
//        'ruong' = /api/gift/grant bỏ thẳng vào Rương Ích Kỷ theo Discord ID (không dùng ô gõ tay).
async function gvGive(id,btn,where){
  where=where||'game';
  if(GVBUSY)return toast('⏳ Đang giao món khác - chờ xong rồi bấm tiếp');
  const free=(document.getElementById('gvTargetFree').value||'').trim();
  const sel=document.getElementById('gvTarget');const uid=sel.value;
  const w=((GV&&GV.wallets)||[]).find(x=>x.id===uid);
  const qty=parseInt(document.getElementById('gvQty').value)||1;
  const it=(GV&&GV.items||[]).find(x=>x.id===id);
  const what=qty.toLocaleString()+' × '+(it?it.n:id);
  let target,label;
  if(where==='ruong'){
    if(free)return toast('❌ 🧰 Rương chỉ nhận người trong danh sách - xoá ô gõ tay hoặc dùng 🎁 Giao');
    if(!uid||!w)return toast('❌ Chọn người nhận trong danh sách');
    target=uid;label=w.name;
    if(!await uiConfirm('🧰 Bỏ '+what+' vào RƯƠNG ÍCH KỶ của '+label+'? Không tính hạn, không cần online - họ phải NHẬN trước 00:00.','🧰 Bỏ vào rương','btn-green'))return;
  }else{
    target=free||(w&&w.ingame)||'';label=target;
    if(!target)return toast(w?'❌ '+w.name+' chưa liên kết nhân vật - chỉ 🧰 Rương được':'❌ Chọn/nhập người nhận');
    if(!await uiConfirm('Giao '+what+' vào túi '+label+'? (phải đang online)','🎁 Giao','btn-green'))return;
  }
  GVBUSY={id:id,where:where};
  document.querySelectorAll('.gv-give').forEach(b=>{b.disabled=true;});
  if(btn)btn.textContent=where==='ruong'?'⏳...':'⏳ Đang giao...';
  gvNote(where==='ruong'?('⏳ Đang bỏ '+what+' vào rương của '+label+'...'):('⏳ Đang giao '+what+' cho '+label+'... (mod cần tới 1-2 phút, đừng tắt tab)'),'');
  try{
    const j=where==='ruong'
      ?await api('/api/gift/grant',{userId:target,itemId:id,qty:qty,where:'ruong',note:(document.getElementById('gvNote').value||'').trim()})
      :await api('/api/give/item',{target:target,itemId:id,qty:qty});
    const m=j.message||('✅ Xong '+what+' cho '+label);toast(m);gvNote(m,'ok');
    if(where==='ruong'){GV=null;gvLoad();}   // tải lại để số 🧰 cạnh tên nhảy ngay
  }catch(e){gvNote('❌ '+(e.message||'Lỗi')+' | '+what+' cho '+label,'err');}
  GVBUSY=null;
  document.querySelectorAll('.gv-give').forEach(b=>{b.disabled=false;b.textContent=(b.dataset&&b.dataset.lbl)||b.textContent;});
}
// Khung kết quả trong tab: dòng mới nhất trên cùng; dòng ⏳ đang chạy được thay bằng kết quả.
let GVLOG=[];
function gvNote(msg,kind){
  const t=new Date();const hh=[t.getHours(),t.getMinutes(),t.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
  if(GVLOG.length&&GVLOG[0].kind==='')GVLOG.shift();
  GVLOG.unshift({t:hh,msg:msg,kind:kind});
  GVLOG=GVLOG.slice(0,8);
  const box=document.getElementById('gvResult');if(!box)return;
  box.classList.remove('hidden');
  box.innerHTML=GVLOG.map((r,i)=>'<div style="padding:3px 0;'+(i?'opacity:.7;font-size:12px;':'font-weight:600;')+'color:'+(r.kind==='err'?'#ff8a8a':(r.kind==='ok'?'#7ee2a8':'var(--tx)'))+'"><span class="muted" style="font-weight:400;font-size:11px">'+r.t+'</span> '+esc(r.msg)+'</div>').join('');
}
// 📜 tab Log: chọn mục nào hiện mục đó (lưu lựa chọn qua F5)
function logPick(k){
  localStorage.setItem('panel_log',k);
  document.querySelectorAll('.logSec').forEach(el=>el.classList.toggle('hidden',el.id!=='logSec-'+k));
  document.querySelectorAll('.logPick').forEach(b=>{b.style.outline=b.dataset.log===k?'2px solid var(--green)':'';});
  if(k==='drop'&&typeof dropLogLoad==='function')dropLogLoad('lg');   // 💥 lịch sử Drop Boss: tải khi mở mục
  if(k==='nk')nkTai(true);
}
// ===== 📒 04/10: NHẬT KÝ (nhatky.js, POST /api/nhatky) - 3 mục: Tài Xỉu / Dò Mìn / Nạp-Rút =====
// Cổng SUPER: mục đầu của tab 📜 Log. Cổng mod: thứ DUY NHẤT nhìn thấy (modApp).
const NK={ngay:'',muc:'',rows:[],dangTai:false,lai:null,goT:null,chay:false};
const NK_MAU={tx:'#f0b132',mine:'#ff8a8a',naprut:'#7ee2a8',shop:'#8ab4ff'};
function nkA(x){return esc(x).replace(/"/g,'&quot;');}
function nkBody(them){return {ngay:NK.ngay,muc:NK.muc,q:document.getElementById('nkQ').value||'',truoc:them?NK.rows.length:0,gioiHan:300};}
async function nkTai(dau,them){
  if(NK.dangTai){NK.lai=[dau,them];return;}   // đang tải (vd tự cập nhật) mà bấm đổi -> chạy lại ngay sau, không bỏ mất
  NK.dangTai=true;
  try{const j=await api('/api/nhatky',nkBody(them));NK.ngay=j.ngay;NK.rows=them?NK.rows.concat(j.rows):j.rows;nkVe(j);}
  catch(e){}finally{NK.dangTai=false;if(NK.lai){const l=NK.lai;NK.lai=null;nkTai(l[0],l[1]);}}
}
function nkThem(){nkTai(false,true);}
function nkMo(el,e){if(e&&String(window.getSelection()||''))return;el.classList.toggle('mo');}   // bấm dòng: mở/đóng log gốc (đang bôi chữ thì thôi)
function nkGo(){clearTimeout(NK.goT);NK.goT=setTimeout(()=>nkTai(true),350);}
function nkChonNgay(n){if(n===NK.ngay)return;NK.ngay=n;nkTai(true);}
function nkChonMuc(m){NK.muc=m;nkTai(true);}
function nkVe(j){
  document.getElementById('nkNgays').innerHTML=j.ngays.map(x=>{const p=x.ngay.split('-');
    return '<button class="btn-grey'+(x.ngay===j.ngay?' nkOn':'')+'" data-n="'+nkA(x.ngay)+'" onclick="nkChonNgay(this.dataset.n)">📅 '+(x.homNay?'Hôm nay ':'')+p[2]+'/'+p[1]+'</button>';}).join('');
  const T=j.mucTen||{},tong=Object.values(j.mucs||{}).reduce((a,b)=>a+b,0);
  document.getElementById('nkMucs').innerHTML=[['','Tất cả',tong]].concat(Object.keys(T).map(k=>[k,T[k],(j.mucs||{})[k]||0]))
    .map(x=>'<button class="btn-grey'+(x[0]===NK.muc?' nkOn':'')+'" data-n="'+x[0]+'" onclick="nkChonMuc(this.dataset.n)">'+esc(x[1])+' <span class="muted">'+x[2].toLocaleString('vi-VN')+'</span></button>').join('');
  const vn=n=>Number(n||0).toLocaleString('vi-VN'),ky=n=>(n>0?'+':n<0?'−':'')+vn(Math.abs(n)),lop=n=>n>0?'xanh':n<0?'do':'';
  const tk=j.thongKe||{},st=[];
  const hien=k=>NK.muc===''||NK.muc===k;
  if(tk.mine&&tk.mine.van&&hien('mine'))st.push('💣 <b>'+vn(tk.mine.van)+'</b> ván · cược <b>'+vn(tk.mine.cuoc)+'</b> · người chơi <b class="'+lop(tk.mine.lai)+'">'+ky(tk.mine.lai)+'</b> <span class="muted">('+tk.mine.thang+' thắng / '+tk.mine.thua+' thua)</span>');
  if(tk.tx&&tk.tx.luot&&hien('tx'))st.push('🎲 <b>'+vn(tk.tx.luot)+'</b> lượt đặt · đặt <b>'+vn(tk.tx.dat)+'</b> · người chơi <b class="'+lop(tk.tx.lai)+'">'+ky(tk.tx.lai)+'</b>');
  if(tk.shop&&tk.shop.luot&&hien('shop'))st.push('🛒 <b>'+vn(tk.shop.luot)+'</b> lượt mua · chi <b>'+vn(tk.shop.knb)+'</b> KNB');
  if(tk.naprut&&tk.naprut.n&&hien('naprut'))st.push('💰 rút web → game <b>'+vn(tk.naprut.rut)+'</b> · nạp game → web <b>'+vn(tk.naprut.nap)+'</b>');
  document.getElementById('nkStats').innerHTML=st.map(x=>'<span class="nkStat">'+x+'</span>').join('');
  document.getElementById('nkInfo').textContent='Đang hiện '+vn(NK.rows.length)+' / '+vn(j.tong)+' dòng'+(document.getElementById('nkQ').value.trim()?' khớp tìm kiếm (tổng phía trên cũng tính theo tìm kiếm)':'')+' · tải lúc '+new Date().toLocaleTimeString('vi-VN');
  document.getElementById('nkList').innerHTML=NK.rows.length?NK.rows.map(r=>{
    const tien=r.so==null?'':(r.mau==='xanh'||r.mau==='do'?ky(r.so):vn(r.so));
    const t=String(r.t||'');
    return '<div class="nkRow nk-'+(r.mau||'tron')+'" onclick="nkMo(this,event)" title="Bấm để xem log gốc">'+
      '<span class="nkT">'+esc(t.slice(0,5))+'<span class="nkSec">'+esc(t.slice(5))+'</span></span>'+
      '<span class="nkI">'+esc(r.icon||'')+'</span>'+
      '<div class="nkB"><span class="nkL1">'+(r.ten?'<b>'+esc(r.ten)+'</b>':'')+esc(r.chinh||'')+'</span>'+(r.phu?'<span class="nkL2"><span class="nkMuiTen"> → </span>'+esc(r.phu)+'</span>':'')+
        '<div class="nkRaw">'+(r.raw||[]).map(esc).join('<br>')+'</div></div>'+
      '<span class="nkS">'+tien+'</span></div>';
  }).join(''):'<div class="muted" style="padding:10px 4px">Chưa có dòng nào.</div>';
  document.getElementById('nkMore').classList.toggle('hidden',!j.conNua);
}
// Tự cập nhật 10s: chỉ khi đang mở mục Nhật ký, xem hôm nay, chưa bấm Xem thêm, chưa cuộn xuống, không bôi chữ
function nkBatDau(){if(NK.chay)return;NK.chay=true;setInterval(()=>{
  const sec=document.getElementById('logSec-nk'),tl=document.getElementById('tab-log'),ls=document.getElementById('nkList');
  if(!sec||sec.classList.contains('hidden')||!tl||tl.classList.contains('hidden'))return;
  if(!document.getElementById('nkAuto').checked||document.hidden)return;
  const nb=document.querySelector('#nkNgays .nkOn');if(nb&&nb.textContent.indexOf('Hôm nay')<0)return;
  if(NK.rows.length>300||(ls&&ls.scrollTop>40)||String(window.getSelection()||'')||document.querySelector('#nkList .nkRow.mo'))return;
  nkTai(true);
},10000);}
// Cổng mod: giấu mọi tab trừ 📜 Log, giấu bảng chọn mục log cũ (cần /api/state), không chạy refresh()
function modApp(){
  document.body.classList.add('congmod');epApply(false);
  const DUOC=['log','tb','vqx','gnx','br'];   // 05/10 + 📊 Bảng rơi (nhúng netco4.click)   // 04/10: cổng mod thấy 📜 Log + 🎒 Túi Boss (bản chỉ xem); 05/10 + 🍀 Vòng quay (chỉ xem)
  document.querySelectorAll('.tabs .grp').forEach(g=>{const bs=[...g.querySelectorAll('button')],co=bs.some(b=>DUOC.includes(b.dataset.tab));g.style.display=co?'':'none';
    bs.forEach(b=>{b.style.display=DUOC.includes(b.dataset.tab)?'':'none';});});
  document.getElementById('tbSuaCard').classList.add('hidden');document.getElementById('tbXemCard').classList.remove('hidden');
  const pc=document.getElementById('logPickCard');if(pc)pc.style.display='none';
  const hb=document.getElementById('holdBtn');if(hb)hb.style.display='none';
  const ct=document.getElementById('connText');if(ct){ct.style.color='var(--green)';ct.textContent='Cổng mod · chỉ xem';}
  const sv=localStorage.getItem('panel_tab');   // 05/10: F5 giữ nguyên tab đang xem
  tab(DUOC.includes(sv)?sv:'log');logPick('nk');
}
// 🛒 SHOP ITEM (28/08): admin sửa bảng item (id/tên/giá/max/hình) rồi 💾 Lưu shop
function itemShopFill(){
  var body=document.getElementById('itemShopBody');if(!body||!STATE)return;
  if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#itemShopBody'))return; // đang gõ thì đừng vẽ lại
  // 09/09: (1) đang có sửa CHƯA LƯU thì tuyệt đối không vẽ lại (trước đây rời chuột khỏi ô là 3s sau
  // số về mặc định); (2) dữ liệu server không đổi thì cũng không vẽ lại (đỡ nháy, đỡ mất chọn)
  if(ISDIRTY)return;
  var rows=STATE.itemShop||[];
  var sig=JSON.stringify(rows);if(sig===ISSIG&&body.children.length)return;ISSIG=sig;ISVER=STATE.itemShopVer||'';
  body.innerHTML='';
  if(!rows.length){itemShopAddRow();return;}
  rows.forEach(function(it){itemShopAddRow(it)});
  icAll('itemShopBody','isf');   // 🖼️ 02/10 hình game theo ID
}
var ISDIRTY=false,ISSIG='',ISVER='';
// 📅 10/09: giới hạn mua mỗi món/người/ngày (SUPER)
// 🗂️ bảng hạn theo nhóm (12/09 v2)
// 🏷️ 16/09: lấy từ danh sách nhóm admin đặt. Bỏ 2 nhóm có sổ hạn riêng (⭐ mua 1 lần, 🔥 Hàng giới hạn = key 'implant').
function GQ_CATS_NOW(){return ((STATE&&STATE.itemCats)||[]).filter(c=>c.key!=='important'&&c.key!=='implant').map(c=>[c.key,c.label]);}
function gqRender(){const box=document.getElementById('isGroupQuota');if(!box)return;
  const GQ_CATS=GQ_CATS_NOW();const sig=GQ_CATS.map(g=>g[0]+'|'+g[1]).join(',');
  if(box.dataset.built===sig)return;box.dataset.built=sig;
  box.innerHTML=GQ_CATS.map(g=>'<div style="display:flex;align-items:center;gap:5px;border:1px solid #2a3142;border-radius:8px;padding:5px 8px"><span style="font-size:12px;min-width:96px">'+g[1]+'</span>'+
    '<select class="mini-in" id="gqm_'+g[0]+'" style="width:auto"><option value="user">👤 cá nhân</option><option value="server">🌐 toàn server</option></select>'+
    '<select class="mini-in" id="gqp_'+g[0]+'" style="width:auto" title="gộp mọi loại = cả nhóm chung 1 sổ · riêng từng món = số này áp cho TỪNG item (mua 1000 trứng gà xong vẫn còn 1000 sữa bò)"><option value="group">gộp mọi loại</option><option value="item">riêng từng món</option></select>'+
    '<input class="mini-in" id="gqx_'+g[0]+'" type="number" min="0" max="1000000" placeholder="0" style="width:84px"><span class="muted" style="font-size:11px">/ngày</span></div>').join('');}
function gqFill(q){if(!q)return;GQ_CATS_NOW().forEach(g=>{const x=document.getElementById('gqx_'+g[0]),md=document.getElementById('gqm_'+g[0]),pd=document.getElementById('gqp_'+g[0]),v=q[g[0]];if(!v)return;
  if(x&&x.value===''&&document.activeElement!==x)x.value=v.max;
  if(md&&!md.dataset.touched&&document.activeElement!==md){md.value=v.mode;md.onchange=()=>{md.dataset.touched='1';};}
  if(pd&&!pd.dataset.touched&&document.activeElement!==pd){pd.value=v.per||'group';pd.onchange=()=>{pd.dataset.touched='1';};}});}
async function isDayMaxSave(btn){
  const v=parseInt(document.getElementById('isDayMax').value);
  if(!(v>=0))return toast('❌ Nhập số ≥ 0 (0 = không giới hạn)');
  const mode=(document.getElementById('isDayMode')||{}).value||'server';
  const imEl=document.getElementById('isImplantMax');const im=imEl&&imEl.value!==''?parseInt(imEl.value):undefined;
  if(im!==undefined&&!(im>=0))return toast('❌ Hạn 🔥 Hàng giới hạn: nhập số ≥ 0');
  const gq={};let gqErr=null;
  GQ_CATS_NOW().forEach(g=>{const x=document.getElementById('gqx_'+g[0]);const md=document.getElementById('gqm_'+g[0]);
    if(!x||x.value==='')return;const n=parseInt(x.value);
    if(!(n>=0))gqErr='❌ Hạn nhóm '+g[1]+': nhập số ≥ 0';
    gq[g[0]]={mode:(md||{}).value==='server'?'server':'user',per:(document.getElementById('gqp_'+g[0])||{}).value==='item'?'item':'group',max:n||0};});
  if(gqErr)return toast(gqErr);
  await runBtn(btn,'Lưu...',()=>api('/api/itemshop/daymax',{dayMax:v,dayMode:mode,implantMax:im,groupQuota:gq}).then(j=>{toast('📅 Giới hạn mua/ngày: '+(j.dayMax||'không giới hạn')+' · '+(j.dayMode==='user'?'mỗi người':'cả server')+(j.implantMax!==undefined?' · 🔥 Hàng giới hạn '+(j.implantMax||'không giới hạn')+'/người/ngày':''));HOLD_SIG='';refresh();}));
}
function itemShopDirty(on){ISDIRTY=!!on;var b=document.getElementById('itemShopSaveBtn');if(b){b.textContent=on?'💾 Lưu shop ● CHƯA LƯU':'💾 Lưu shop';b.classList.toggle('btn-red',!!on);b.classList.toggle('btn-green',!on);}}
(function(){var b=document.getElementById('itemShopBody');if(b){b.addEventListener('input',function(){itemShopDirty(true)});b.addEventListener('change',function(){itemShopDirty(true)});}})();
// 🔌 15/09: công tắc chức năng người chơi - mỗi mục 1 nút, xanh = đang mở, đỏ = đang tắt
// 08/10: mục nào đang TẮT cho người chơi -> tab admin tương ứng ẩn luôn (đỡ rối). Shop Item / Chuyển-Rút không có tab riêng.
var FEAT_TAB={tx:['tx'],mine:['mine'],stair:['stair'],wheel:['bj'],stock:['stock'],spm:['spm']};
function featTabs(){
  if(!STATE)return;var off={};
  (STATE.feats||[]).forEach(function(f){if(f.off)(FEAT_TAB[f.key]||[]).forEach(function(t){off[t]=1;});});
  if(STATE.pokerOn===false)off.poker=1;if(STATE.tienlenOn===false)off.tienlen=1;
  document.querySelectorAll('.tabs button[data-tab]').forEach(function(b){b.classList.toggle('featHide',!!off[b.dataset.tab]);});
  document.querySelectorAll('.tabs .grp').forEach(function(g){var co=[].some.call(g.querySelectorAll('button[data-tab]'),function(b){return !b.classList.contains('featHide')&&b.style.display!=='none';});g.classList.toggle('featHide',!co);});
  var cur=document.querySelector('.tabs button.active');if(cur&&cur.classList.contains('featHide'))tab('user');
}
function featRender(){
  featTabs();
  var box=document.getElementById('featBox');if(!box||!STATE||!STATE.feats)return;
  var sig=JSON.stringify([STATE.feats,STATE.pokerOn,STATE.tienlenOn]);if(box.dataset.sig===sig)return;box.dataset.sig=sig;
  var nut=function(onclick,off,label){return '<button class="'+(off?'btn-red':'btn-green')+'" style="min-width:150px" onclick="'+onclick+'">'+(off?'⛔ ':'✅ ')+label+'</button>';};
  box.innerHTML=STATE.feats.map(function(f){return nut('featSet(&quot;'+f.key+'&quot;,'+(f.off?'false':'true')+')',f.off,f.label);}).join('')+
    nut('featBai(&quot;poker&quot;,'+(STATE.pokerOn?'true':'false')+')',!STATE.pokerOn,'🃏 Poker')+
    nut('featBai(&quot;tienlen&quot;,'+(STATE.tienlenOn?'true':'false')+')',!STATE.tienlenOn,'🀄 Tiến Lên');
}
// 08/10: Poker / Tiến Lên bật-tắt ngay trong khung 🔌 (công tắc cũ nằm trong tab của chính nó - tab ẩn khi tắt thì hết chỗ bật lại)
async function featBai(k,off){
  var ten=k==='poker'?'🃏 Poker':'🀄 Tiến Lên';
  if(!await uiConfirm(off?('TẮT '+ten+'? Tab biến mất khỏi web người chơi + header admin; không ai vào bàn / tạo phòng được (ván đang dở vẫn đánh nốt).'):('MỞ lại '+ten+' cho người chơi?'),off?'⛔ Tắt':'✅ Mở',off?'btn-red':'btn-green'))return;
  if(k==='poker')pokerOn(!off);else tlBat(!off);
}
async function featSet(key,off){
  var f=(STATE.feats||[]).find(function(x){return x.key===key})||{label:key};
  if(!await uiConfirm(off?('TẮT '+f.label+' cho người chơi? Mục này sẽ biến mất khỏi web và mọi thao tác bị chặn.'):('MỞ lại '+f.label+' cho người chơi?'),off?'⛔ Tắt':'✅ Mở',off?'btn-red':'btn-green'))return;
  try{await api('/api/feat/set',{key:key,off:off});toast((off?'⛔ Đã tắt ':'✅ Đã mở ')+f.label);refresh();}catch(e){}
}
// 🎁 15/09 (chiều): QUÀ ADMIN TẶNG - bảng riêng, lưu vào _giftShop, không dính shop item
var GFDIRTY=false,GFSIG='';
function giftDirty(on){GFDIRTY=!!on;var b=document.getElementById('giftSaveBtn');if(b)b.textContent=on?'💾 Lưu quà (CHƯA LƯU)':'💾 Lưu quà';}
// 🍀 02/10: Vòng quay may mắn (tab 🎁 Quà tặng, chỉ SUPER). Tải khi mở tab, lưu xong tải lại.
var VQA=null,VQAKQ=[];
function vqaIc(ic){if(!ic)return '<span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center">📦</span>';var sx=ic.w/64*100,sy=ic.h/64*100,px=ic.w>64?ic.x/(ic.w-64)*100:0,py=ic.h>64?ic.y/(ic.h-64)*100:0;
  return '<i style="display:inline-block;width:32px;height:32px;vertical-align:middle;border-radius:5px;background-repeat:no-repeat;background-image:url(/itemicon/'+encodeURIComponent(ic.f)+');background-size:'+sx+'% '+sy+'%;background-position:'+px.toFixed(3)+'% '+py.toFixed(3)+'%"></i>';}
function vqaEl(id){return document.getElementById(id);}
function vqaLoad(){api('/api/vq/cfg').then(function(j){VQA=j;vqaFill();}).catch(function(e){toast('❌ '+e.message);});}
function vqaFill(){var c=VQA.cfg;vqaEl('vqOn').checked=!!c.on;vqaEl('vqGia').value=c.gia;vqaEl('vqMax').value=c.max||40;
  vqaEl('vqaVi').innerHTML=VQA.vi.map(function(v){return '<option value="'+v.uid+'">'+esc(v.ten)+(v.game?' · 🎮 '+esc(v.game):'')+'</option>';}).join('');
  vqaDraw();vqaNguoi();vqaLogDraw();}
// 🍀 05/10: bản CHỈ XEM vòng quay cho cổng mod (/api/vq/xem)
var VQX=null;
function vqxLoad(){api('/api/vq/xem').then(function(j){VQX=j;VQX.pool.sort(function(a,b){return b.w-a.w;});vqxDraw();}).catch(function(e){vqaEl('vqxSum').textContent='❌ '+e.message;});}
function vqxDraw(){if(!VQX)return;var P=VQX.pool,c=VQX.cfg,loc=(vqaEl('vqxLoc').value||'').toLowerCase();
  var at=P.length?P.reduce(function(s,x){return s+x.w;},0)/P.length:0,E=Math.min(24,P.length||24)*at;
  vqaEl('vqxSum').innerHTML=(c.on?'<b style="color:var(--green)">ĐANG BẬT</b>':'<b style="color:var(--red)">ĐANG TẮT</b>')+' · mở / làm mới vòng: <b>'+Number(c.gia||0).toLocaleString('vi-VN')+'</b> KNB · tối đa <b>'+c.max+'</b> lần quay mỗi vòng · bộ quà <b>'+P.length+'</b> món'+(c.macDinh?' (bộ mặc định của server)':'');
  vqaEl('vqxPool').innerHTML=P.map(function(x){if(loc&&String(x.id).indexOf(loc)<0&&String(x.ten).toLowerCase().indexOf(loc)<0)return '';var p=E>0?x.w/E*100:0;
    return '<tr><td>'+vqaIc(x.ic)+'</td><td>'+esc(x.ten)+' <span class="muted">#'+x.id+'</span></td><td>'+x.sl+'</td><td>'+x.w+'</td><td><b>'+(p>=1?p.toFixed(1):p.toFixed(3))+'%</b></td></tr>';}).join('')||'<tr><td colspan="5" class="muted">Không có món nào.</td></tr>';
  var gio=function(t){var d=new Date(t);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+' '+d.getDate()+'/'+(d.getMonth()+1);};
  vqaEl('vqxLog').innerHTML=(VQX.log||[]).map(function(x){return '<div style="padding:3px 0;border-bottom:1px solid var(--line)"><span class="muted">'+gio(x.t)+'</span> <b>'+esc(x.ten)+'</b> trúng '+esc(x.tenMon)+' ×'+x.sl+'</div>';}).join('')||'Chưa có lượt quay nào.';}
function vqaTong(){var on=VQA.pool.filter(function(x){return !x.off;});
  var at=on.length?on.reduce(function(s,x){return s+x.w;},0)/on.length:0;return {n:on.length,E:Math.min(24,on.length||24)*at};}
function vqaDraw(){if(!VQA)return;var loc=(vqaEl('vqaLoc').value||'').toLowerCase();var s=vqaTong();
  vqaEl('vqaSum').innerHTML='Bộ quà: <b>'+VQA.pool.length+'</b> món · đang bật '+s.n+' món'+(VQA.cfg.macDinh?' · <b>đang dùng bộ mặc định</b> (377 món vòng quay gốc của server)':'')+' · tổng trọng số 1 vòng ước tính '+Math.round(s.E)+'. Sửa xong nhớ bấm <b>💾 Lưu vòng quay</b>.';
  vqaEl('vqaPool').innerHTML=VQA.pool.map(function(x,i){if(loc&&String(x.id).indexOf(loc)<0&&String(x.ten).toLowerCase().indexOf(loc)<0)return '';var pct=s.E>0?x.w/s.E*100:0;
    return '<tr style="'+(x.off?'opacity:.45;':'')+'"><td><input type="checkbox" style="width:auto" '+(x.off?'':'checked')+' onchange="VQA.pool['+i+'].off=!this.checked;vqaDraw()"></td><td>'+vqaIc(x.ic)+'</td><td>'+esc(x.ten)+' <span class="muted">#'+x.id+'</span></td>'
    +'<td><input class="mini-in" style="width:64px" type="number" min="1" max="999" value="'+x.sl+'" onchange="VQA.pool['+i+'].sl=Number(this.value)"></td>'
    +'<td><input class="mini-in" style="width:84px" type="number" min="1" max="100000" value="'+x.w+'" onchange="VQA.pool['+i+'].w=Number(this.value);vqaDraw()"></td>'
    +'<td>'+(pct>=1?pct.toFixed(1):pct.toFixed(3))+'%</td><td><button class="btn-red" onclick="VQA.pool.splice('+i+',1);vqaDraw()">🗑</button></td></tr>';}).join('');}
function vqaTim(){var q=vqaEl('vqaQ').value.trim();if(!q)return;api('/api/vq/tim',{q:q}).then(function(j){VQAKQ=j.items;var b=vqaEl('vqaKq');
  if(!j.items.length){b.innerHTML='<span class="muted">Không thấy vật phẩm nào.</span>';return;}
  b.innerHTML=j.items.map(function(it,k){return '<button class="btn-grey" style="margin:2px;padding:3px 8px;display:inline-flex;align-items:center;gap:6px" onclick="vqaThem('+k+')">'+vqaIc(it.ic)+esc(it.ten)+' <span class="muted">#'+it.id+'</span> ➕</button>';}).join('');}).catch(function(e){toast('❌ '+e.message);});}
function vqaThem(k){var it=VQAKQ[k];if(!it||!VQA)return;VQA.pool.unshift({id:it.id,sl:1,w:100,off:false,ten:it.ten,ic:it.ic});vqaDraw();toast('➕ Đã thêm '+it.ten+' (trọng số 100) - nhớ bấm 💾 Lưu');}
function vqaSave(){if(!VQA)return;var x={on:vqaEl('vqOn').checked,gia:Number(vqaEl('vqGia').value),max:Number(vqaEl('vqMax').value),pool:VQA.pool.map(function(p){return {id:p.id,sl:p.sl,w:p.w,off:p.off};})};
  api('/api/vq/save',x).then(function(j){VQA=j;vqaFill();toast('💾 Đã lưu vòng quay - '+(j.cfg.on?'đang BẬT trên web':'đang tắt'));}).catch(function(e){toast('❌ '+e.message);});}
async function vqaMacDinh(){if(!await uiConfirm('Đưa bộ quà về mặc định (377 món vòng quay gốc của server)? Bộ quà đang sửa sẽ mất. Giá và số lần quay / vòng giữ nguyên.','Về mặc định','btn-red'))return;
  api('/api/vq/macdinh',{}).then(function(j){VQA=j;vqaFill();toast('↩ Đã về bộ quà mặc định');}).catch(function(e){toast('❌ '+e.message);});}
function vqaCap(){var uid=vqaEl('vqaVi').value,n=Number(vqaEl('vqaN').value);if(!uid||!n)return toast('Chọn ví và nhập số lượt');
  api('/api/vq/cap',{uid:uid,n:n}).then(function(j){VQA=j;vqaFill();toast('🎟️ '+j.message);}).catch(function(e){toast('❌ '+e.message);});}
function vqaNguoi(){var d=VQA.nguoi;vqaEl('vqaNguoi').innerHTML=d.length?'<table><thead><tr><th>Ví</th><th>Nhân vật</th><th>Lượt quay</th><th>Món trong rương</th><th>Đã mở vòng</th></tr></thead><tbody>'
  +d.map(function(x){return '<tr><td>'+esc(x.ten)+'</td><td>'+esc(x.game)+'</td><td><b>'+x.luot+'</b></td><td>'+x.ruong+'</td><td>'+(x.coVong?'✅':'-')+'</td></tr>';}).join('')+'</tbody></table>'
  :'<span class="muted">Chưa ai có lượt quay.</span>';}
function vqaLogDraw(){var l=VQA.log;vqaEl('vqaLog').innerHTML=l.length?l.map(function(x){return '<div>'+new Date(x.t).toLocaleString('vi-VN')+' · <b>'+esc(x.ten)+'</b> → '+esc(x.tenMon)+' ×'+x.sl+'</div>';}).join(''):'Chưa có lượt quay nào.';}
// 🖼️ 02/10: hình game theo ID cho bảng Shop Item + Quà admin tặng. Ảnh up riêng (cột tên file) vẫn ưu tiên.
// Ô "Tên hiện" đang trống thì tự điền tên game.
var ICMAP={};
function icTra(ids,cb){var can=ids.filter(function(x){return x&&!(x in ICMAP);});if(!can.length){if(cb)cb();return;}
  api('/api/itemicon/tra',{ids:can.slice(0,600)}).then(function(j){can.forEach(function(x){ICMAP[x]=(j.items||{})[x]||null;});if(cb)cb();}).catch(function(){if(cb)cb();});}
function icPrevHtml(id,img){if(img)return '<img src="/itemimage/'+encodeURIComponent(img)+'" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;border-radius:5px">';
  var x=ICMAP[id];return x&&x.ic?vqaIc(x.ic):'<span class="muted" title="Không có hình game cho ID này" style="display:inline-block;width:32px;text-align:center">📦</span>';}
function icRow(tr,pre){if(!tr)return;var ie=tr.querySelector('.'+pre+'-id'),me=tr.querySelector('.'+pre+'-img'),pv=tr.querySelector('.ic-prev');if(!ie||!pv)return;
  var id=ie.value.trim(),img=me?me.value.trim():'';
  var ve=function(){pv.innerHTML=icPrevHtml(id,img);var nm=tr.querySelector('.'+pre+'-name'),x=ICMAP[id];if(nm&&!nm.value.trim()&&x&&x.ten){nm.value=x.ten;}};
  if(id&&!(id in ICMAP))icTra([id],ve);else ve();}
function icAll(bodyId,pre){var trs=[].slice.call(document.querySelectorAll('#'+bodyId+' tr'));
  var ids=trs.map(function(tr){var e=tr.querySelector('.'+pre+'-id');return e?e.value.trim():'';});
  icTra(ids,function(){trs.forEach(function(tr){icRow(tr,pre);});});}
function giftFill(force){
  var body=document.getElementById('giftBody');if(!body||!STATE)return;
  if(!force){if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#giftBody'))return;if(GFDIRTY)return;}
  var rows=STATE.giftShop||[];var sig=JSON.stringify(rows);if(!force&&sig===GFSIG&&body.children.length)return;GFSIG=sig;
  body.innerHTML='';if(!rows.length){giftAddRow();}else rows.forEach(function(g){giftAddRow(g)});
  icAll('giftBody','gf');   // 🖼️ 02/10 hình game theo ID
  var n=document.getElementById('giftN');if(n)n.textContent=rows.length+' quà · '+rows.filter(function(g){return !g.off}).length+' đang phát';
}
function giftDelRow(b){var tr=b.closest('tr');if(tr)tr.remove();giftDirty(true);}
function giftAddRow(g){
  g=g||{};var body=document.getElementById('giftBody');if(!body)return;var tr=document.createElement('tr');
  tr.innerHTML='<td style="text-align:center"><input type="checkbox" class="gf-on" style="width:auto;margin:0" title="Đang phát / tắt" onchange="this.parentNode.parentNode.style.opacity=this.checked?1:.45;giftDirty(true)"></td>'
    +'<td><input class="mini-in gf-id" style="width:170px" placeholder="Mã item" oninput="giftDirty(true)" onchange="icRow(this.closest(&quot;tr&quot;),&quot;gf&quot;)"></td>'
    +'<td><input class="mini-in gf-name" style="width:150px" placeholder="Tên hiện" oninput="giftDirty(true)"></td>'
    +'<td><input class="mini-in gf-qty" type="number" min="1" style="width:80px" placeholder="số cái" oninput="giftDirty(true)"></td>'
    +'<td><input class="mini-in gf-note" style="width:200px" placeholder="ghi chú hiện trên web" oninput="giftDirty(true)"></td>'
    +'<td style="white-space:nowrap"><span class="ic-prev" style="display:inline-block;width:36px;vertical-align:middle"></span><input class="mini-in gf-img" style="width:150px" placeholder="trống = hình game" oninput="giftDirty(true)" onchange="icRow(this.closest(&quot;tr&quot;),&quot;gf&quot;)">'
    +'<input type="file" class="gf-file" accept=".png,.jpg,.jpeg,.gif,.webp" style="display:none" onchange="giftUpload(this)">'
    +'<button class="mini" style="margin-left:4px" onclick="this.previousElementSibling.click()">📷 Up</button></td>'
    +'<td><button class="mini btn-red" onclick="giftDelRow(this)">🗑️</button></td>';
  body.appendChild(tr);
  tr.dataset.gid=g.gid||'';
  tr.querySelector('.gf-on').checked=!g.off;tr.style.opacity=g.off?.45:1;
  tr.querySelector('.gf-id').value=g.id||'';tr.querySelector('.gf-name').value=g.name||'';
  tr.querySelector('.gf-qty').value=(g.qty!==undefined?g.qty:1);tr.querySelector('.gf-note').value=g.note||'';tr.querySelector('.gf-img').value=g.img||'';
}
function giftUpload(inp){
  var f=inp.files&&inp.files[0];if(!f)return;if(f.size>600*1024){toast('❌ Ảnh quá 600KB - nén nhỏ lại');inp.value='';return;}
  var tr=inp.closest('tr');var rd=new FileReader();
  rd.onload=function(){var b64=String(rd.result).split(',')[1]||'';api('/api/itemshop/upload',{name:f.name,data:b64}).then(function(j){if(tr){tr.querySelector('.gf-img').value=j.file;icRow(tr,'gf');}giftDirty(true);toast('🖼️ Đã up '+j.file+' - nhớ bấm 💾 Lưu quà');}).catch(function(e){toast('❌ '+e.message)});inp.value='';};
  rd.readAsDataURL(f);
}
function giftSave(){
  var items=[].slice.call(document.querySelectorAll('#giftBody tr')).map(function(tr){return {gid:tr.dataset.gid||'',id:tr.querySelector('.gf-id').value.trim(),name:tr.querySelector('.gf-name').value.trim(),qty:parseInt(tr.querySelector('.gf-qty').value)||1,note:tr.querySelector('.gf-note').value.trim(),off:!tr.querySelector('.gf-on').checked,img:tr.querySelector('.gf-img').value.trim()};}).filter(function(x){return x.id;});
  api('/api/gift/save',{items:items}).then(function(j){toast('💾 Đã lưu '+j.items.length+' quà');giftDirty(false);GFSIG='';refresh();}).catch(function(e){toast('❌ '+e.message)});
}
// 🔍 15/09: lọc bảng vật phẩm theo chữ (id/tên/nhóm), theo nhóm, theo trạng thái tắt. Chỉ ẨN dòng,
// không xoá - bấm 💾 vẫn lưu đủ mọi dòng kể cả dòng đang bị ẩn.
function itemShopRowMatch(tr){
  var q=((document.getElementById('isfFilter')||{}).value||'').trim().toLowerCase();
  var c=(document.getElementById('isfFilterCat')||{}).value||'';
  var offOnly=!!((document.getElementById('isfFilterOff')||{}).checked);
  var g=function(cls){var el=tr.querySelector(cls);return el?String(el.value||''):''};
  var cat=g('.isf-cat');
  if(c&&cat!==c)return false;
  if(offOnly){var on=tr.querySelector('.isf-on');if(on&&on.checked)return false}
  if(!q)return true;
  var hay=(g('.isf-id')+' '+g('.isf-name')+' '+cat+' '+g('.isf-note')).toLowerCase();
  return hay.indexOf(q)>=0;
}
function itemShopFilter(){
  var body=document.getElementById('itemShopBody');if(!body)return;
  var rows=body.querySelectorAll('tr'),show=0;
  rows.forEach(function(tr){var m=itemShopRowMatch(tr);tr.style.display=m?'':'none';if(m)show++});
  var n=document.getElementById('isfFilterN');if(n)n.textContent=show===rows.length?(rows.length+' món'):('hiện '+show+'/'+rows.length+' món');
}
function itemShopAddRow(it){
  it=it||{};
  var body=document.getElementById('itemShopBody');if(!body)return;
  var tr=document.createElement('tr');
  tr.innerHTML='<td style="text-align:center"><input type="checkbox" class="isf-on" style="width:auto;margin:0" title="Đang bán / ẩn" onchange="this.parentNode.parentNode.style.opacity=this.checked?1:.45"></td>'
    +'<td><input class="mini-in isf-id" style="width:170px" placeholder="Mã item" onchange="icRow(this.closest(&quot;tr&quot;),&quot;isf&quot;)"></td>'
    +'<td><input class="mini-in isf-name" style="width:150px" placeholder="Tên hiện"></td>'
    +'<td><select class="mini-in isf-cat" style="width:110px">'+icOpts()+'</select></td>'
    +'<td><input class="mini-in isf-price" type="number" style="width:90px"></td>'
    +'<td><input class="mini-in isf-max" type="number" style="width:70px"></td>'
    +'<td><input class="mini-in isf-note" style="width:200px" placeholder="tác dụng (hiện trên web + search được)"></td>'
    +'<td style="white-space:nowrap"><span class="ic-prev" style="display:inline-block;width:36px;vertical-align:middle"></span><input class="mini-in isf-img" style="width:150px" placeholder="trống = hình game" onchange="icRow(this.closest(&quot;tr&quot;),&quot;isf&quot;)">'
    +'<input type="file" class="isf-file" accept=".png,.jpg,.jpeg,.gif,.webp" style="display:none" onchange="itemShopUpload(this)">'
    +'<button class="mini" style="margin-left:4px" onclick="this.previousElementSibling.click()">📷 Up</button></td>'
    +'<td><button class="mini btn-red" onclick="itemShopDelRow(this)">🗑️</button></td>';
  body.appendChild(tr);
  tr.style.display=itemShopRowMatch(tr)?'':'none';   // 🔍 15/09: dòng mới thêm cũng theo bộ lọc đang gõ
  tr.querySelector('.isf-on').checked=!it.off;tr.style.opacity=it.off?.45:1;   // 09/09 công tắc bán
  tr.querySelector('.isf-id').value=it.id||'';
  tr.querySelector('.isf-name').value=it.name||'';
  // 08/09: thiếu 'accessory' → mọi phụ kiện nạp lên form thành Tiêu hao, bấm Lưu là mất nhóm cả 38 món
  // 🏷️ 16/09: nhóm nào KHÔNG còn trong danh sách thì rơi về 🏪 Thương nhân (nhóm mặc định)
  tr.querySelector('.isf-cat').value=(STATE.itemCats||[]).some(c=>c.key===it.cat)?it.cat:'consume';   // 09/09 food/ammo · 10/09 material + implant · 11/09 important
  tr.querySelector('.isf-price').value=(it.price!==undefined?it.price:0);
  tr.querySelector('.isf-max').value=(it.max!==undefined?it.max:999);
  tr.querySelector('.isf-note').value=it.note||'';
  tr.querySelector('.isf-img').value=it.img||'';
}
// 🖼️ up hình item: đọc file -> base64 -> POST, server ghi assets/itemimage/ + phục vụ ngay
function itemShopUpload(inp){
  var f=inp.files&&inp.files[0];if(!f)return;
  if(f.size>600*1024){toast('❌ Ảnh quá 600KB - nén nhỏ lại (icon ~50KB là đẹp)');inp.value='';return;}
  var tr=inp.closest('tr');
  var rd=new FileReader();
  rd.onload=function(){
    var b64=String(rd.result).split(',')[1]||'';
    api('/api/itemshop/upload',{name:f.name,data:b64}).then(function(j){
      if(tr&&tr.querySelector('.isf-img')){tr.querySelector('.isf-img').value=j.file;icRow(tr,'isf');}
      toast('🖼️ Đã up '+j.file+' - nhớ bấm 💾 Lưu shop');
    }).catch(function(e){toast('❌ '+e.message)});
    inp.value='';
  };
  rd.readAsDataURL(f);
}
// 🐾 01/10: Chọn Pet Boss - tải 1 lần (khỏi đè chữ admin đang gõ mỗi lần refresh), lưu xong tải lại
var PBA=null;
function pbaEl(id){return document.getElementById(id);}
function pbaEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function pbaLoad(){api('/api/petboss/state').then(function(j){PBA=j;pbaFill();}).catch(function(e){toast('❌ '+e.message);});}
function pbaFill(){if(!PBA)return;var c=PBA.cfg;
  pbaEl('pbaOn').checked=!!c.on;pbaEl('pbaName').value=c.name||'';pbaEl('pbaPrice').value=c.price||0;pbaEl('pbaImg').value=c.img||'';pbaEl('pbaNote').value=c.note||'';
  pbaEl('pbaBan').innerHTML=(PBA.bans||[]).map(function(b){return '<option value="'+b[0]+'"'+(b[0]===c.ban?' selected':'')+'>Bán bản: '+pbaEsc(b[1])+'</option>';}).join('');
  var sk=PBA.skins||[];
  pbaEl('pbaSkins').innerHTML=sk.length?sk.map(function(s){
    var opts=s.opts.map(function(o){return '<div>'+pbaEsc(o.kieu)+(o.cap!=='5'?' · cấp '+pbaEsc(o.cap):'')+' · '+(o.tc||[]).join('/')+'</div>';}).join('');
    var im=s.img?'<img src="/itemimage/'+encodeURIComponent(s.img)+'" style="width:44px;height:44px;object-fit:contain;border-radius:6px">':'🐾';
    return '<tr data-skin="'+pbaEsc(s.skin)+'"><td><input type="checkbox" class="pba-on" style="width:auto"'+(s.off?'':' checked')+'></td><td>'+im+'</td><td><b>'+pbaEsc(s.skin)+'</b></td><td style="font-size:12px">'+opts+'</td>'
      +'<td><input class="mini-in pba-img" value="'+pbaEsc(s.img)+'" style="width:140px"></td>'
      +'<td><label class="btn-grey" style="cursor:pointer;padding:4px 8px;white-space:nowrap">🖼️ Up<input type="file" accept="image/*" style="display:none" onchange="pbaUp(this)"></label></td></tr>';
  }).join(''):'<tr><td colspan="6" class="muted">Chưa tải được danh mục pet từ panel GM'+(PBA.catErr?' ('+pbaEsc(PBA.catErr)+')':'')+'</td></tr>';
  pbaEl('pbaInfo').textContent=PBA.catTs?('Danh mục pet tải lúc '+new Date(PBA.catTs).toLocaleTimeString('vi-VN')):'';
  var pk=PBA.picks||[];pbaEl('pbaPickN').textContent='('+pk.length+' người)';
  pbaEl('pbaPicks').innerHTML=pk.length?'<table><thead><tr><th>Ví</th><th>Nhân vật</th><th>Pet</th><th>Lúc</th><th></th></tr></thead><tbody>'+pk.map(function(x){
    return '<tr><td>'+pbaEsc(x.name)+'</td><td>'+pbaEsc(x.game)+'</td><td>'+pbaEsc(x.pet)+' <span class="muted">('+pbaEsc(x.id)+')</span></td><td>'+new Date(x.ts).toLocaleString('vi-VN')+'</td>'
      +'<td><button class="btn-grey" onclick="pbaReset(&quot;'+pbaEsc(x.uid)+'&quot;,this)">↩️ Cho chọn lại</button></td></tr>';}).join('')+'</tbody></table>':'Chưa ai nhận.';
}
function pbaUp(inp,targetId){var fl=inp.files&&inp.files[0];if(!fl)return;
  if(fl.size>600*1024){toast('❌ Ảnh quá 600KB - nén nhỏ lại');inp.value='';return;}
  var tr=inp.closest('tr');var rd=new FileReader();
  rd.onload=function(){var b64=String(rd.result).split(',')[1]||'';
    api('/api/itemshop/upload',{name:fl.name,data:b64}).then(function(j){
      var box=targetId?pbaEl(targetId):(tr&&tr.querySelector('.pba-img'));if(box)box.value=j.file;
      toast('🖼️ Đã up '+j.file+' - nhớ bấm 💾 Lưu Pet Boss');}).catch(function(e){toast('❌ '+e.message);});
    inp.value='';};
  rd.readAsDataURL(fl);}
function pbaSave(btn){var skins={};
  [].slice.call(document.querySelectorAll('#pbaSkins tr[data-skin]')).forEach(function(tr){skins[tr.getAttribute('data-skin')]={img:tr.querySelector('.pba-img').value.trim(),off:!tr.querySelector('.pba-on').checked};});
  var x={on:pbaEl('pbaOn').checked,name:pbaEl('pbaName').value.trim(),ban:pbaEl('pbaBan').value,price:parseInt(pbaEl('pbaPrice').value)||0,img:pbaEl('pbaImg').value.trim(),note:pbaEl('pbaNote').value.trim(),skins:skins};
  api('/api/petboss/save',x).then(function(j){PBA=j;pbaFill();toast('💾 Đã lưu Pet Boss'+(j.cfg.on?' - đang BẬT trên web':' - đang tắt'));}).catch(function(e){toast('❌ '+e.message);});}
async function pbaReset(uid,btn){if(!await uiConfirm('Xoá lượt nhận của người này để họ chọn lại? Pet cũ trong game KHÔNG bị thu hồi, KNB KHÔNG tự hoàn.','Cho chọn lại','btn-red'))return;
  api('/api/petboss/reset',{uid:uid}).then(function(j){PBA=j;pbaFill();toast(j.message);}).catch(function(e){toast('❌ '+e.message);});}
function itemShopDelRow(b){var tr=b.closest('tr');if(tr)tr.remove();itemShopDirty(true);}
function itemShopSave(){
  var items=[].slice.call(document.querySelectorAll('#itemShopBody tr')).map(function(tr){
    return {id:tr.querySelector('.isf-id').value.trim(),
      name:tr.querySelector('.isf-name').value.trim(),
      cat:tr.querySelector('.isf-cat').value,
      price:parseInt(tr.querySelector('.isf-price').value)||0,
      max:parseInt(tr.querySelector('.isf-max').value)||1,
      note:tr.querySelector('.isf-note').value.trim(),
      off:!tr.querySelector('.isf-on').checked,
      img:tr.querySelector('.isf-img').value.trim()};
  }).filter(function(x){return x.id;});
  api('/api/itemshop/save',{items:items,ver:ISVER}).then(function(j){toast('💾 Đã lưu '+j.items.length+' món shop');itemShopDirty(false);ISSIG='';HOLD_SIG='';refresh();}).catch(function(e){toast('❌ '+e.message);});
}
// (stBoardStart/stBoardStop/stReset/jpAdd đã xóa 19/08 cùng tab 📊 Thống kê)
async function chatDelete(inputId,btn){const c=document.getElementById(inputId).value.trim();if(!c)return toast('❌ Nhập Channel ID');if(!await uiConfirm('Xóa tin nhắn của bot trong kênh này?','Xóa','btn-red'))return;await runBtn(btn,'Đang xóa...',()=>api('/api/chat/delete',{channelId:c}).then(j=>{toast('🧹 Đã xóa '+j.count+' tin nhắn');}));}

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
  // 4 tab có ô "kênh đã lưu". Trước còn 'bc' (trò đã gỡ) và 'bj' (Vòng Quay không có
  // ô kênh), chạy không rồi thoát, chỉ tổ làm người đọc tưởng còn 6 chỗ.
  ['tx','mine','stair','spm'].forEach(prefix=>{
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
// 🍀 09/09: ép quà hộp may mắn kế tiếp (dùng 1 lần) - cùng ô chọn người chơi của ép mìn
// ⏸️ 09/09: công tắc GOM 5 trò (tab 👥) - mỗi trò gọi đúng API sẵn có của nó
const GS_LB={mines:'💣 Dò Mìn',stairs:'🪜 Leo Thang',spm:'🚀 Phi Thuyền',stock:'📈 Sàn cổ phiếu',rut:'🎮 Rút KNB web → game',nap:'💬 Nạp KNB game → web'};
function gsState(){const S=STATE||{};return {mines:(S.gameOpen||{}).mines!==false,stairs:(S.gameOpen||{}).stairs!==false,spm:!S.spmCfg||S.spmCfg.open!==false,stock:!S.stock||S.stock.open!==false,rut:!S.dogBridge||S.dogBridge.rut!==false,nap:!S.dogBridge||S.dogBridge.nap!==false};}
async function gameSwitch(key,cb){
  const on=cb.checked, lb=GS_LB[key]||key;
  if(!on&&!await uiConfirm('ĐÓNG '+lb+'? Không nhận ván/cược/quay mới, ván đang chơi vẫn xong bình thường.','⏸ Đóng','btn-red')){cb.checked=true;return;}
  const call=key==='mines'||key==='stairs'?api('/api/games/open',{key:key,open:on})
    :key==='spm'?api('/api/spm/cfg',{open:on})
    :(key==='rut'||key==='nap')?api('/api/dogbridge/open',{key:key,open:on})
    :api('/api/stock/cfg',{open:on});
  call.then(()=>{toast(on?'▶️ Đã MỞ '+lb:'⏸ Đã ĐÓNG '+lb);refresh();}).catch(()=>{cb.checked=!on;});
}
// 🎚️ 09/09: sàn cược 2 minigame
async function minBetSave(btn){
  const v=parseInt(document.getElementById('gsMinBet').value,10);
  if(!(v>=1))return toast('❌ Nhập số ≥ 1');
  if(!await uiConfirm('Đặt cược tối thiểu Dò Mìn + Leo Thang = '+v.toLocaleString('vi-VN')+' KNB/ván?','💾 Lưu','btn-green'))return;
  await runBtn(btn,'Lưu...',()=>api('/api/games/minbet',{minBet:v}).then(j=>{toast('🎚️ Sàn cược Dò Mìn/Leo Thang: '+j.minBet.toLocaleString('vi-VN'));refresh();}));
}
async function dogDaySave(btn){
  const v=parseInt(document.getElementById('gsDogDay').value);
  if(!(v>=0))return toast('❌ Nhập số ≥ 0 (0 = không giới hạn)');
  const vv=parseInt(document.getElementById('gsVangDay').value);
  if(!(vv>=0))return toast('❌ Hạn vàng: nhập số ≥ 0 (0 = không giới hạn)');
  const kg=n=>n?n.toLocaleString('vi-VN'):'không giới hạn';
  await runBtn(btn,'Lưu...',()=>api('/api/dogbridge/daymax',{dayMax:v,vangDayMax:vv}).then(j=>{toast('📅 Rút KNB '+kg(j.dayMax)+'/ngày · 🪙 đổi vàng '+kg(j.vangDayMax)+'/ngày');HOLD_SIG='';refresh();}));
}
function mnFill(){if(!STATE)return;var s=document.getElementById('txSimpleOn');if(s&&document.activeElement!==s&&STATE.txSimple!==null&&STATE.txSimple!==undefined)s.checked=!!STATE.txSimple;
  var c=STATE.minesCfg;if(!c)return;var f=function(id,v){var e=document.getElementById(id);if(e&&e.value===''&&document.activeElement!==e)e.value=v};
  f('mnRtp',Math.round(c.rtp*1000)/10);f('mnMaxMult',c.maxMult);f('mnMaxBet',c.maxBet);var l=document.getElementById('mnLucky');if(l&&!l.dataset.touched){l.checked=!!c.luckyOn;l.onchange=function(){l.dataset.touched='1'}}}
function txSimpleSave(el){api('/api/tx/simple',{on:el.checked}).then(function(j){toast('🎲 Bàn Tài Xỉu: '+(j.simple?'ĐƠN GIẢN 4 cửa':'52 cửa'));refresh();}).catch(function(e){toast('❌ '+e.message);refresh();});}
async function minesCfgSave(btn){var rtp=parseFloat(document.getElementById('mnRtp').value)/100,mm=parseInt(document.getElementById('mnMaxMult').value),mb=parseInt(document.getElementById('mnMaxBet').value),lk=document.getElementById('mnLucky').checked;
  if(!(rtp>=0.5&&rtp<=1))return toast('RTP phải 50-100%');if(!(mm>=0))return toast('Trần hệ số ≥ 0');if(!(mb>=0))return toast('Cược tối đa ≥ 0');
  await runBtn(btn,'Lưu...',()=>api('/api/mines/cfg',{rtp:rtp,maxMult:mm,maxBet:mb,luckyOn:lk}).then(function(j){toast('💣 Dò Mìn: RTP '+Math.round(j.cfg.rtp*100)+'% · trần x'+(j.cfg.maxMult||'∞')+' · cược tối đa '+(j.cfg.maxBet||'∞')+' · cỏ '+(j.cfg.luckyOn?'bật':'tắt'));refresh();}));}
function gsFill(){mnFill();
  const vgx=document.getElementById('gsVangDay');if(vgx&&vgx.value===''&&document.activeElement!==vgx&&STATE&&STATE.dogVangDayMax!==null&&STATE.dogVangDayMax!==undefined)vgx.value=STATE.dogVangDayMax;
  const dd=document.getElementById('gsDogDay');if(dd&&dd.value===''&&document.activeElement!==dd&&STATE&&STATE.dogBridgeDayMax!==null&&STATE.dogBridgeDayMax!==undefined)dd.value=STATE.dogBridgeDayMax;
  const mb=document.getElementById('gsMinBet');if(mb&&mb.value===''&&document.activeElement!==mb&&STATE&&STATE.pot&&STATE.pot.minBet)mb.value=STATE.pot.minBet;
  const st=gsState();
  Object.keys(GS_LB).forEach(k=>{const cb=document.getElementById('gs_'+k),lb=document.getElementById('gs_'+k+'_lb');if(!cb)return;if(document.activeElement!==cb)cb.checked=st[k];if(lb){lb.style.color=st[k]?'':'var(--red)';lb.lastChild.textContent=' '+GS_LB[k]+(st[k]?' - MỞ':' - ĐANG ĐÓNG');}});
  const tx=document.getElementById('gs_tx');if(tx&&STATE&&STATE.tx){const run=STATE.tx.live&&STATE.tx.status!=='stopped';tx.innerHTML='🎲 Tài Xỉu: '+(run?'<b style="color:#3dd68c">ĐANG CHẠY</b> · <button class="mini btn-red" onclick="txStop()">⏹ Tắt bàn</button>':'<b style="color:var(--red)">ĐÃ TẮT</b> (mở lại ở tab 🎲)');}
}
function luckyForce(){
  const any=document.getElementById('mineAny').checked;
  const key=any?'_any':document.getElementById('mineUser').value;
  if(!key){toast('❌ Chọn người chơi');return;}
  const prize=document.getElementById('luckyPrize').value;
  api('/api/lucky/force',{key,prize}).then(()=>{toast('🍀 Hộp may mắn kế tiếp sẽ ra: '+document.getElementById('luckyPrize').selectedOptions[0].textContent);refresh();});
}
function luckyClear(k){api('/api/lucky/clear',{key:k}).then(()=>{toast('Đã xóa ép hộp 🍀');refresh();});}
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
  // 10/09: dựng CẢ bảng thành 1 chuỗi rồi gán 1 lần - ví/nợ không đổi thì setter lười bỏ
  // qua, bảng đứng yên (trước: xóa sạch + appendChild từng dòng mỗi 3s -> mất bôi đen).
  const tb=document.getElementById('playerBody');let tbHtml='';
  STATE.players.filter(p=>p.name.toLowerCase().includes(q)||p.id.includes(q)).forEach(p=>{
    const debtCell=p.debt>0?('<b style="color:#e74c3c">'+p.debt.toLocaleString()+'</b>'):'<span class="muted">0</span>';
    // (cột 🍀 may mắn đã gỡ 04/09 - chủ server để mặc định, bảng đỡ banh ngang)
    tbHtml+='<tr><td>'+esc(p.name)+'</td><td class="muted" style="font-size:12px">'+p.id+'</td><td><b>'+p.points.toLocaleString()+'</b></td>'+
      '<td>'+debtCell+'</td>'+
      '<td><input class="mini-in" type="number" placeholder="số" id="amt_'+p.id+'">'+
      ' <button class="mini btn-green" onclick="pSet(\\''+p.id+'\\')">Set</button>'+
      ' <button class="mini btn-green" onclick="pAdd(\\''+p.id+'\\')">Cộng</button>'+
      ' <button class="mini btn-red" onclick="pSub(\\''+p.id+'\\')">Trừ</button>'+
      ' <button class="mini btn-red" onclick="pDebt(\\''+p.id+'\\')">📒 Ghi nợ</button>'+
      (p.debt>0?' <button class="mini btn-grey" onclick="pDebtClear(\\''+p.id+'\\')">Xóa nợ</button>':'')+
      ' <button class="mini btn-grey" onclick="pDel(\\''+p.id+'\\')">🗑️ Xóa ví</button></td></tr>';
  });
  tb.innerHTML=tbHtml;
  Object.keys(kept).forEach(id=>{const i=document.getElementById(id);if(i)i.value=kept[id];});
}
// 🎒 01/10: Túi đồ boss - tải 1 lần, sửa trên bản nháp TB.ed, Lưu gửi cả hoạt động
let TB={st:null,hd:null,ed:null,row:0,dirty:false};
function tbLoad(){api('/api/tuiboss/cfg').then(j=>{TB.st=j;if(!TB.hd||!j.ds.find(x=>x.hd===TB.hd))TB.hd=j.ds[0].hd;tbPick(TB.hd,true);}).catch(e=>toast('❌ '+e.message));}
function tbCur(){return TB.st.ds.find(x=>x.hd===TB.hd);}
// 🎒 04/10: bản CHỈ XEM cho cổng mod (/api/tuiboss/xem: không lịch sử sửa, không lưu)
let TBX={st:null,hd:null};
function tbXemLoad(){api('/api/tuiboss/xem').then(j=>{TBX.st=j;if(!TBX.hd||!j.ds.find(x=>x.hd===TBX.hd)){const b=j.ds.find(x=>x.on)||j.ds[0];TBX.hd=b?b.hd:null;}tbXemDraw();}).catch(()=>{});}
function tbXemChon(hd){TBX.hd=hd;tbXemDraw();}
function tbXemMon(id){const s=TBX.st,h=(s.hinh||{})[id]||{},ten=String((s.ten||{})[id]||h.ten||'').replace(/#c[0-9A-Fa-f]{6}|#e[0-9A-Fa-f]{6}|#[A-Za-z]/g,'')||('#'+id);   // bỏ mã màu game (#G, #cFF0000...)
  return '<span class="tbxMon">'+(h.ic?vqaIc(h.ic):'<span class="tbxNo">📦</span>')+'<span>'+esc(ten)+'</span></span>';}
function tbXemDraw(){
  const s=TBX.st;if(!s)return;
  document.getElementById('tbxDs').innerHTML=s.ds.map(h=>'<button class="btn-grey'+(h.hd===TBX.hd?' nkOn':'')+'" style="'+(h.on?'':'opacity:.5')+'" data-n="'+nkA(h.hd)+'" onclick="tbXemChon(this.dataset.n)">'+(h.on?'🟢 ':'⚫ ')+esc(h.ten)+'</button>').join('');
  const h=s.ds.find(x=>x.hd===TBX.hd);if(!h){document.getElementById('tbxCt').innerHTML='';return;}
  const chip=[];
  if(!h.on)chip.push('⚫ đang tắt - chưa phát túi');
  if(h.knb)chip.push('💰 '+h.knb.toLocaleString('vi-VN')+' KNB');
  if(h.luot)chip.push('🍀 +'+h.luot+' lượt quay web');
  chip.push(h.ngay?('📅 tối đa '+h.ngay+' túi/ngày'):'📅 không giới hạn túi/ngày');
  document.getElementById('tbxCt').innerHTML='<h3 style="margin:0 0 8px">'+esc(h.ten)+'</h3>'
    +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+chip.map(c=>'<span class="nkStat">'+esc(c)+'</span>').join('')+'</div>'
    +(h.mon.length?h.mon.map(r=>{const sl=r.min===r.max?('×'+r.min):('×'+r.min+'–'+r.max);
      return '<div class="tbxRow">'+(r.ids.length>1?'<div class="tbxHint">🎲 ngẫu nhiên 1 trong '+r.ids.length+' món</div>':'')
        +'<div class="tbxIds">'+r.ids.map(tbXemMon).join('')+'</div><div class="tbxSl">'+sl+'</div></div>';}).join('')
      :'<div class="muted">Túi này chưa có món nào.</div>');
}
function tbTen(id){return (TB.st&&TB.st.ten[id])||'';}
function tbHdDraw(){
  document.getElementById('tbHd').innerHTML=TB.st.ds.map(h=>'<button style="text-align:left;padding:7px 10px;'+(h.hd===TB.hd?'outline:2px solid #ffcf5c;':'')+(h.on?'':'opacity:.55;')+'" onclick="tbPick(\\''+h.hd+'\\')">'+(h.on?'🟢':'⚫')+' '+esc(h.ten)+(h.sua?' <span style="color:#ffcf5c">✎</span>':'')+'</button>').join('')
    +'<div class="muted" style="font-size:12px">✎ = đã sửa khác mặc định · ⚫ = đang tắt</div>';
}
function tbPick(hd,force){
  if(!force&&TB.dirty&&!confirm('Hoạt động này đang sửa dở chưa Lưu - bỏ thay đổi?'))return;
  TB.hd=hd;const h=tbCur();
  TB.ed=JSON.parse(JSON.stringify({on:h.on,knb:h.knb,ngay:h.ngay,luot:h.luot||0,mon:h.mon}));
  TB.dirty=false;TB.row=0;tbHdDraw();tbEdDraw();tbLogDraw();
}
function tbNames(r){
  return r.ids.length?r.ids.map(id=>tbTen(id)?esc(tbTen(id)):'<span style="color:#ff8a8a">#'+id+' (chưa rõ tên, Lưu sẽ kiểm)</span>').join(' · ')
    :'<span class="muted">trống - gõ ID hoặc dùng ô tìm bên dưới</span>';
}
function tbSl(r){return r.min===r.max?r.min:r.min+'-'+r.max;}
function tbEdDraw(){
  const h=tbCur(),e=TB.ed;
  let x='<div class="row" style="gap:14px;flex-wrap:wrap;align-items:center">'
    +'<b style="font-size:16px">'+esc(h.ten)+'</b>'
    +'<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto;margin:0" '+(e.on?'checked':'')+' onchange="TB.ed.on=this.checked;TB.dirty=true"> Bật</label>'
    +'<label>KNB <input class="mini-in" type="number" min="0" max="100000" value="'+e.knb+'" oninput="TB.ed.knb=Number(this.value);TB.dirty=true"></label>'
    +'<label>Trần/ngày <input class="mini-in" style="width:70px" type="number" min="0" max="50" value="'+e.ngay+'" oninput="TB.ed.ngay=Number(this.value);TB.dirty=true"></label>'
    +'<label title="Cộng vào vòng quay may mắn trên web khi người chơi bấm Nhận túi (thay Hạnh Vận Quả)">🍀 Lượt quay web <input class="mini-in" style="width:70px" type="number" min="0" max="50" value="'+(e.luot||0)+'" oninput="TB.ed.luot=Number(this.value);TB.dirty=true"></label></div>'
    +'<div class="muted" style="font-size:12px;margin-top:4px">Boss cuối (ID game, cố định): '+h.boss.join(', ')+'</div>'
    +'<table style="width:100%;margin-top:8px"><tr><th style="text-align:left">Món (ID; nhiều ID = trộn ngẫu nhiên)</th><th>SL từ</th><th>đến</th><th></th></tr>';
  e.mon.forEach((r,i)=>{
    x+='<tr onclick="tbRow('+i+')" style="'+(i===TB.row?'outline:2px solid #ffcf5c;':'')+'">'
      +'<td style="width:60%"><input style="width:100%;margin:0;box-sizing:border-box" value="'+r.ids.join(', ')+'" oninput="tbSet('+i+',\\'ids\\',this.value)"><div id="tbN'+i+'" style="font-size:12px;margin-top:3px">'+tbNames(r)+'</div></td>'
      +'<td><input class="mini-in" style="width:70px" type="number" min="0" max="999" title="0 = có lúc không rớt (vd 0-2: 1/3 không rớt)" value="'+r.min+'" oninput="tbSet('+i+',\\'min\\',this.value)"></td>'
      +'<td><input class="mini-in" style="width:70px" type="number" min="1" max="999" value="'+r.max+'" oninput="tbSet('+i+',\\'max\\',this.value)"></td>'
      +'<td><button class="btn-red" onclick="event.stopPropagation();tbDel('+i+')">🗑</button></td></tr>';
  });
  x+='</table><div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button onclick="tbAdd()">➕ Thêm dòng</button><button class="btn-green" onclick="tbSave()">💾 Lưu</button>'
    +(h.sua?'<button class="btn-grey" onclick="tbReset()">↩ Về mặc định</button>':'')
    +'<button class="btn-grey" onclick="tbLoad()">🔄 Tải lại</button></div>'
    +'<div class="muted" style="font-size:12px;margin-top:6px">Mặc định: '+h.macDinh.mon.map(r=>r.ids.map(id=>tbTen(id)||('#'+id)).join('/')+' ×'+tbSl(r)).join(' · ')
    +(h.macDinh.knb?' · '+h.macDinh.knb+' KNB':'')+(h.macDinh.ngay?' · trần '+h.macDinh.ngay+'/ngày':'')+(h.macDinh.luot?' · '+h.macDinh.luot+' lượt quay web':'')+'</div>';
  document.getElementById('tbEd').innerHTML=x;
}
function tbRow(i){if(TB.row===i)return;TB.row=i;document.querySelectorAll('#tbEd tr[onclick]').forEach((tr,k)=>tr.style.outline=k===i?'2px solid #ffcf5c':'');}
function tbSet(i,k,v){
  const r=TB.ed.mon[i];TB.dirty=true;
  if(k==='ids'){r.ids=String(v).split(/[\\s,;]+/).map(Number).filter(n=>n>0);const d=document.getElementById('tbN'+i);if(d)d.innerHTML=tbNames(r);}
  else r[k]=Number(v);
}
function tbAdd(){TB.ed.mon.push({ids:[],min:1,max:1});TB.row=TB.ed.mon.length-1;TB.dirty=true;tbEdDraw();}
function tbDel(i){TB.ed.mon.splice(i,1);TB.dirty=true;if(TB.row>=TB.ed.mon.length)TB.row=Math.max(0,TB.ed.mon.length-1);tbEdDraw();}
function tbSave(){
  const e=TB.ed;
  api('/api/tuiboss/save',{hd:TB.hd,on:e.on,knb:e.knb,ngay:e.ngay,luot:e.luot||0,mon:e.mon})
    .then(j=>{TB.st=j;TB.dirty=false;tbPick(TB.hd,true);toast('💾 Đã lưu túi '+tbCur().ten+' - áp cho túi tạo từ giờ');})
    .catch(e=>toast('❌ '+e.message));
}
function tbReset(){
  if(!confirm('Đưa túi "'+tbCur().ten+'" về mặc định?'))return;
  api('/api/tuiboss/reset',{hd:TB.hd}).then(j=>{TB.st=j;TB.dirty=false;tbPick(TB.hd,true);toast('↩ Đã về mặc định');}).catch(e=>toast('❌ '+e.message));
}
function tbFind(){
  const q=document.getElementById('tbQ').value.trim();if(!q)return;
  api('/api/gm/items',{q:q}).then(j=>{
    const b=document.getElementById('tbRes');
    if(!j.items||!j.items.length){b.innerHTML='<span class="muted">Không thấy</span>';return;}
    b.innerHTML=j.items.slice(0,40).map(it=>'<button class="btn-grey" style="font-size:12px;padding:4px 8px" data-n="'+esc(it.name)+'" onclick="tbPut('+Number(it.id)+',this.dataset.n)">'+it.id+' · '+esc(it.name)+'</button>').join('');
  }).catch(e=>toast('❌ '+e.message));
}
function tbPut(id,name){
  if(!TB.ed)return;TB.st.ten[id]=name;
  if(!TB.ed.mon[TB.row]){TB.ed.mon.push({ids:[],min:1,max:1});TB.row=TB.ed.mon.length-1;}
  const r=TB.ed.mon[TB.row];if(!r.ids.includes(id))r.ids.push(id);
  TB.dirty=true;tbEdDraw();toast('➕ '+name+' vào dòng '+(TB.row+1)+' (nhớ Lưu)');
}
function tbTom(c){return (c.on?'bật':'TẮT')+', '+c.knb+' KNB, trần '+(c.ngay||'∞')+', '+c.mon.map(r=>r.ids.map(id=>tbTen(id)||('#'+id)).join('/')+'×'+tbSl(r)).join(' · ');}
function tbLogDraw(){
  const ds=TB.st.log||[];
  document.getElementById('tbLog').innerHTML=ds.length?'<table style="width:100%">'+ds.map(l=>{const d=new Date(l.t);
    return '<tr style="'+(l.hd===TB.hd?'':'opacity:.6')+'"><td class="muted" style="white-space:nowrap;vertical-align:top">'+d.toLocaleString('vi-VN')+'</td>'
      +'<td style="vertical-align:top"><b>'+esc(l.ten)+'</b><br><span class="muted">'+esc(l.who)+'</span></td>'
      +'<td><div class="muted">trước: '+esc(tbTom(l.truoc))+'</div><div>sau: '+esc(tbTom(l.sau))+'</div></td></tr>';}).join('')+'</table>'
    :'<span class="muted">Chưa ai sửa</span>';
}

function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function fmtAmt(n){return (n>0?'+':'')+Number(n).toLocaleString();}
function padId(n){return String(n).padStart(5,'0');}

function renderHistories(){
  if(!STATE)return;
  // 04/09: tab 📜 Log - mỗi mục CHỈ HIỆN 30 ván có cược cho gọn
  // Big Small
  // 📜 22/09 chủ server: "ván đó người nào đặt nhiêu ăn thua nhiêu, kết quả là được" - gộp theo NGƯỒI,
  // số lấy từ sổ b.nhan (đã gồm vốn) của kế hoạch trả tiền, KHÔNG tính lại. Dùng chung 2 bàn (Siêu có b.phi).
  const TENCUA=(STATE.stx&&STATE.stx.tenCua)||{};
  const veVanLog=(g)=>{
    const per={};
    (g.bets||[]).forEach(b=>{const k=b.u||b.name;if(!per[k])per[k]={name:b.name,dat:0,phi:0,nhan:0,cua:[],cu:false};
      per[k].dat+=(b.amount||0);per[k].phi+=(b.phi||0);per[k].cua.push(b.choice+' '+Number(b.amount||0).toLocaleString());
      if(b.nhan===undefined)per[k].cu=true;else per[k].nhan+=(Number(b.nhan)||0);});
    // ván ghi trước bản vá không có b.nhan -> lấy tổng nhận từ winners
    (g.winners||[]).forEach(w=>{const k=w.u||w.name;if(per[k]&&per[k].cu)per[k].nhan+=(w.amount||0);});
    const ds=Object.values(per).map(p=>({...p,net:p.nhan-p.dat-p.phi})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net));
    const nh=g.nhan||{};const nhanTxt=Object.keys(nh).length?' · ⚡ '+Object.keys(nh).map(k=>'x'+nh[k]+' '+(TENCUA[k]||k)).join(' · '):'';
    const dong=ds.map(p=>'<div class="'+(p.net>0?'win':(p.net<0?'lose':'b'))+'">'+(p.net>0?'💰':(p.net<0?'💥':'⚖️'))+' <b>'+esc(p.name)+'</b> đặt '+p.dat.toLocaleString()+(p.phi?' (+phí '+p.phi.toLocaleString()+')':'')+' → nhận '+p.nhan.toLocaleString()+' · <b>'+fmtAmt(p.net)+'</b>'+
      '<span class="muted" style="font-size:11px"> · '+esc(p.cua.join(', '))+'</span></div>').join('');
    return '<div class="h"><div class="top"><span>Ván #'+padId(g.gameId)+' · 🎲 '+(g.dice||[]).join('-')+' (Tổng '+g.sum+') · '+esc(g.tx)+(g.storm?'':' | '+esc(g.cl))+esc(nhanTxt)+'</span><span class="t">'+(g.time||'')+'</span></div>'+(dong||'<div class="b">không ai đặt</div>')+'</div>';
  };
  const tx=(STATE.txHistory||[]).slice(0,30);
  document.getElementById('txHist').innerHTML = tx.length? tx.map(veVanLog).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // ⚡ Siêu Tài Xỉu - mục riêng
  const sx=(STATE.stxHistory||[]).slice(0,30), sxEl=document.getElementById('stxHist');
  if(sxEl)sxEl.innerHTML = sx.length? sx.map(veVanLog).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // 🎡 Roulette - mục riêng, hàm vẽ riêng vì ván có số ra chứ không có xúc xắc
  const rlx=(STATE.rlHistory||[]).slice(0,30), rlEl=document.getElementById('rlHist');
  if(rlEl)rlEl.innerHTML = rlx.length? rlx.map(veVanRl).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // Dò Mìn
  const mn=(STATE.minesHistory||[]).slice(0,30);
  document.getElementById('mineHist').innerHTML = mn.length? mn.map(g=>{
    const win=g.amount>=0;
    return '<div class="h"><div class="top"><span>'+esc(g.name)+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">💣 '+g.mines+' mìn · 💎 '+(g.diamonds||0)+' kim cương · cược '+Number(g.bet).toLocaleString()+'</div>'+
      '<div class="'+(win?'win':'lose')+'">'+(win?'✅':'💥')+' '+esc(g.result)+' '+fmtAmt(g.amount)+' KNB</div></div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';

  const sh=(STATE.stairsHistory||[]).slice(0,30);
  document.getElementById('stairHist').innerHTML = sh.length? sh.map(g=>{
    const win=g.amount>=0;
    return '<div class="h"><div class="top"><span>'+esc(g.name)+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">🔥 '+g.fire+' lửa/tầng · 🪜 lên '+(g.floor||0)+' tầng · cược '+Number(g.bet).toLocaleString()+'</div>'+
      '<div class="'+(win?'win':'lose')+'">'+(win?'✅':'🔥')+' '+esc(g.result)+' '+fmtAmt(g.amount)+' KNB</div></div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // 🚀 Phi Thuyền (04/09): mỗi dòng = 1 lượt cược đã chốt (thắng/thua)
  const spEl=document.getElementById('spmHist');
  if(spEl){
    const sp=((STATE.spmState&&STATE.spmState.betHistory)||[]).slice(0,30);
    spEl.innerHTML = sp.length? sp.map(r=>{
      const win=!!r.cashed;
      return '<div class="h"><div class="top"><span>'+esc(r.name)+'</span><span class="t">'+(win?('rút x'+r.cashed):('NỔ x'+(r.crash||1)))+'</span></div>'+
        '<div class="'+(win?'win':'lose')+'">'+(win?('💰 cược '+Number(r.amount).toLocaleString()+' → +'+Number(r.win||0).toLocaleString()):('💥 cược '+Number(r.amount).toLocaleString()+' → thua hết'))+
        (typeof r.bal==='number'?(' · số dư '+r.bal.toLocaleString()):'')+'</div></div>';
    }).join('') : '<div class="empty">Chưa có lượt nào.</div>';
  }
}
// Xóa số trong ô sau khi thao tác xong - renderPlayers giờ GIỮ số chưa dùng qua các lần
// refresh, nên không xóa ở đây là số cũ nằm lại, dễ bấm nhầm cộng/trừ 2 lần.
function pClear(id){const i=document.getElementById('amt_'+id);if(i)i.value='';}
function pSet(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/set',{userId:id,amount:+v}).then(()=>{toast('✅ Đã set');pClear(id);refresh();});}
function pAdd(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/add',{userId:id,amount:+v}).then(()=>{toast('✅ Đã cộng');pClear(id);refresh();});}
function pSub(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/subtract',{userId:id,amount:+v}).then(()=>{toast('✅ Đã trừ (đã rút KNB)');pClear(id);refresh();}).catch(()=>{});}
// 🪪 mức điểm danh / nghiện / thưởng chuỗi
function txSave(){
  const g=id=>{const v=document.getElementById(id).value.trim();return v===''?null:Math.floor(Number(v))};
  const o={on:document.getElementById('txOn').checked,tien:g('txTien'),loMin:g('txLoMin'),viMax:g('txViMax'),gioCho:g('txGio')};
  if(!(o.tien>=0&&o.loMin>=0&&o.viMax>=0&&o.gioCho>=1))return toast('Điền đủ 4 ô (giờ ≥ 1, còn lại ≥ 0)');
  api('/api/taxi/cfg',o).then(j=>{toast('🚕 '+(j.cfg.on?'BẬT':'TẮT')+' · phát '+j.cfg.tien.toLocaleString('vi-VN')+' khi thua ≥ '+j.cfg.loMin.toLocaleString('vi-VN')+'/ngày · ví còn ≤ '+j.cfg.viMax.toLocaleString('vi-VN')+' · cách '+j.cfg.gioCho+'h');refresh();}).catch(e=>toast('❌ '+e.message));
}
function dcSave(){
  const g=id=>parseInt(document.getElementById(id).value);
  const o={daily:g('dcDaily'),nghien:g('dcNghien'),streakEvery:g('dcStreakEvery'),streakBonus:g('dcStreakBonus')};
  if(!(o.daily>=0&&o.nghien>=0&&o.streakBonus>=0&&o.streakEvery>=1))return toast('Điền đủ 4 ô (chuỗi ≥ 1 ngày, còn lại ≥ 0)');
  api('/api/daily/cfg',o).then(j=>{toast('💾 Điểm danh '+j.cfg.daily.toLocaleString('vi-VN')+' · nghiện '+j.cfg.nghien.toLocaleString('vi-VN')+' · đủ '+j.cfg.streakEvery+' ngày thưởng '+j.cfg.streakBonus.toLocaleString('vi-VN'));refresh();}).catch(e=>toast('❌ '+e.message));
}
// 💰 05/10 -> 07/10: bỏ tab 🧰 Rương Ích Kỷ (bán ngọc 6 / Yếu Quyết lấy KNB) - đã tắt bán từ 06/10, chủ server bỏ cho đỡ rối; API /api/ichkyban/* vẫn còn (server từ chối bán)
// 💉 04/10: bật/tắt /nghien (Discord + nút web) - lưu ngay khi tick, không cần bấm Lưu
function dcNghienToggle(el){
  const on=el.checked;el.disabled=true;
  api('/api/daily/cfg',{nghienOn:on}).then(j=>{toast('💉 /nghien '+(j.cfg.nghienOn?'BẬT · '+j.cfg.nghien.toLocaleString('vi-VN')+' KNB / 1 tiếng':'TẮT'));el.disabled=false;refresh();})
    .catch(e=>{el.checked=!on;el.disabled=false;toast('❌ '+e.message);});
}

function wdStart(){const c=document.getElementById('wdChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/withdraw/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bảng ở #'+j.name);refresh();});}
async function wdStop(){if(!await uiConfirm('Tắt bảng KNB?','Tắt','btn-red'))return;api('/api/withdraw/stop',{}).then(()=>{toast('⏹️ Đã tắt');refresh();});}

// ---- 📒 VAY NỢ ----
function vayStart(){const c=document.getElementById('vayChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/vay/start',{channelId:c}).then(j=>{toast('▶️ Đã đặt bảng VAY NỢ ở #'+j.name);refresh();});}
function loanCfgSave(){
  const o={dailyMax:parseInt(document.getElementById('loanDaily').value),cap:parseInt(document.getElementById('loanCap').value),feePct:parseFloat(document.getElementById('loanFee').value)};
  if(!(o.dailyMax>=100))return toast('Vay/ngày tối thiểu 100');
  if(!(o.cap>=o.dailyMax))return toast('Trần nợ phải ≥ vay/ngày');
  if(!(o.feePct>=0&&o.feePct<=1000))return toast('Lãi ngày 0–1000%');
  api('/api/loan/cfg',o).then(j=>{toast('💾 Đã lưu - nhớ Đăng lại bảng để text đổi');refresh();}).catch(e=>toast('❌ '+e.message));
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
// Xác nhận theo loại đơn - duyệt 'to-discord' là CỘNG TIỀN vào ví, phải nói rõ.
async function wdApprove(id,kind){
  const msg=kind==='to-discord'
    ? 'Xác nhận bạn ĐÃ NHẬN đủ KNB trong game? Ví Discord của người chơi sẽ được CỘNG ngay khi bấm.'
    : 'Xác nhận bạn ĐÃ ĐƯA đủ KNB trong game? (ví người chơi đã trừ từ lúc tạo đơn)';
  if(!await uiConfirm(msg,'✅ Xong','btn-green'))return;
  api('/api/withdraw/approve',{id}).then(()=>{toast('✅ Đã duyệt');refresh();});
}
async function wdReject(id,kind){
  const msg=kind==='to-discord'
    ? 'Từ chối đơn này? (ví người chơi chưa bị trừ nên không có gì để hoàn)'
    : 'Từ chối và HOÀN LẠI KNB cho người chơi?';
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
    ? {label:'💬 Ra Discord', act:'NHẬN '+r.amount.toLocaleString()+' KNB trong game rồi bấm ✅ (lúc đó ví mới được cộng)'}
    : {label:'🎮 Vào game', act:'ĐƯA '+r.amount.toLocaleString()+' KNB trong game (ví đã trừ sẵn)'};
  const p=document.getElementById('wdPending');
  p.innerHTML=pending.length?pending.map(r=>{
    const k=kindInfo(r);
    return '<div class="wd-row"><div class="info">'+
      '<span class="amt">'+k.label+' · '+esc(r.username)+(r.ingameName?' <span class="meta">(game: '+esc(r.ingameName)+')</span>':'')+' - <b>'+r.amount.toLocaleString()+' KNB</b></span>'+
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
    return '<div class="h"><div class="top"><span>#'+r.id+' '+k.label+' '+esc(r.username)+' - '+r.amount.toLocaleString()+' KNB</span><span class="t">'+esc(r.time||'')+'</span></div>'+
    '<div class="'+(r.status==='approved'?'win':'lose')+'">'+(r.status==='approved'?'✅ Đã xong':'❌ Đã từ chối')+'</div></div>';
  }).join(''):'<div class="empty">Chưa xử lý đơn nào.</div>';
  // prefill channel id
  const wc=document.getElementById('wdChannel'); if(wc&&!wc.value&&STATE.withdraw&&STATE.withdraw.channelId) wc.value=STATE.withdraw.channelId;
  const vc=document.getElementById('vayChannel'); if(vc&&!vc.value&&STATE.vay&&STATE.vay.channelId) vc.value=STATE.vay.channelId;
  const vl=document.getElementById('vayLive'); if(vl&&STATE.vay) vl.textContent=STATE.vay.live?'🟢 đang treo trong kênh':'⚫ chưa đặt';
}
async function pDel(id){
  const p=(STATE&&STATE.players||[]).find(x=>x.id===id);
  const who=p?(p.name+' - '+p.points.toLocaleString()+' KNB'):id;
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
  if(!await uiConfirm('Phát '+(+v).toLocaleString()+' KNB cho TẤT CẢ người chơi'+(msg?' với lời nhắn "'+msg+'"':'')+' và tag role?','Phát tất cả','btn-green'))return;
  api('/api/points/addall',{amount:+v,msg:msg}).then(j=>{
    toast(j.announced?('✅ Đã phát cho '+j.count+' người + đã thông báo'):('✅ Đã phát cho '+j.count+' người - ⚠️ KHÔNG đăng được thông báo (kiểm tra quyền bot ở kênh)'));
    document.getElementById('addAllAmount').value='';document.getElementById('addAllMsg').value='';
    refresh();
  }).catch(()=>{});
}

function fmtTime(target){
  const left=target-Math.floor(Date.now()/1000);
  if(left<=0)return 'đang mở bát...';
  return 'mở bát sau '+left+'s';
}

// ===== 10/09: GIỮ MÀN HÌNH khi bôi chữ / Ctrl+F / bấm ⏸ =====
var HOLD_SIG='',HOLD_MANUAL=false,HOLD_FIND=false,HOLD_SEL_SINCE=0;
function holdReason(){
  if(HOLD_MANUAL)return '⏸ ĐÃ DỪNG CẬP NHẬT (bấm ▶ để chạy lại)';
  if(HOLD_FIND&&!document.hasFocus())return '⏸ giữ màn hình: đang Ctrl+F (Esc để chạy lại)';
  HOLD_FIND=false;
  try{
    const sl=window.getSelection(),app=document.getElementById('app');
    if(sl&&!sl.isCollapsed&&sl.rangeCount&&app&&app.contains(sl.anchorNode)){
      // bôi chữ để copy: giữ tối đa 5 phút, quá hạn tự chạy lại (kẻo quên bôi rồi đi chơi)
      if(!HOLD_SEL_SINCE)HOLD_SEL_SINCE=Date.now();
      if(Date.now()-HOLD_SEL_SINCE<5*60*1000)return '⏸ giữ màn hình: đang bôi chữ (bấm chỗ trống để chạy lại)';
    }else HOLD_SEL_SINCE=0;
  }catch(e){HOLD_SEL_SINCE=0;}
  return '';
}
function holdShow(t){
  const el=document.getElementById('holdText');if(el)el.textContent=t;
  const b=document.getElementById('holdBtn');if(b){b.textContent=HOLD_MANUAL?'▶ Chạy lại':'⏸ Dừng cập nhật';b.style.borderColor=HOLD_MANUAL?'var(--gold,#e6b13a)':'';}
}
function holdToggle(){HOLD_MANUAL=!HOLD_MANUAL;holdShow(HOLD_MANUAL?holdReason():'');if(!HOLD_MANUAL){HOLD_SIG='';refresh();}}
// Ctrl+F / F3: trình duyệt mở khung tìm -> trang mất focus; giữ tới khi focus quay lại (Esc/bấm vào trang)
document.addEventListener('keydown',e=>{
  if(((e.ctrlKey||e.metaKey)&&(e.key==='f'||e.key==='F'||e.key==='g'||e.key==='G'))||e.key==='F3'){HOLD_FIND=true;holdShow(holdReason()||'⏸ giữ màn hình: đang Ctrl+F');}
});
window.addEventListener('focus',()=>{if(HOLD_FIND){HOLD_FIND=false;holdShow('');}});
// vừa bỏ bôi chữ (bấm chỗ trống) -> vẽ lại ngay, không đợi 3s
document.addEventListener('selectionchange',()=>{if(HOLD_SEL_SINCE&&!holdReason()){HOLD_SEL_SINCE=0;HOLD_SIG='';holdShow('');}});
function setConn(ok){
  const dot=document.getElementById('connDot'), txt=document.getElementById('connText');
  if(ok){dot.classList.remove('down');txt.style.color='var(--green)';txt.textContent='Online · cập nhật '+new Date().toLocaleTimeString('vi-VN');}
  else{dot.classList.add('down');txt.style.color='var(--red)';txt.textContent='🔴 MẤT KẾT NỐI - bot có thể đã sập';}
}

async function refresh(force){
  const auto=force===false;
  let j;
  try{j=await api('/api/state');}catch(e){ if(e.message!=='401') setConn(false); return; }
  setConn(true);
  // 10/09: KHÔNG vẽ lại DOM khi (a) admin đang bôi chữ trong trang, (b) đang Ctrl+F,
  // (c) bấm ⏸ Dừng cập nhật, (d) state y như lần vẽ trước (đứng yên = không đụng DOM,
  // Ctrl+F giữ được vệt vàng). Trước đây innerHTML bị dựng lại mỗi 3s -> mất bôi đen,
  // mất vệt tìm kiếm ở CẢ 2 cổng (SUPER + thường). STATE vẫn cập nhật cho nút bấm dùng.
  STATE=j.state;
  const holdWhy=auto?holdReason():'';
  const sig=JSON.stringify(j.state);
  if(holdWhy){holdShow(holdWhy);return;}
  if(auto&&sig===HOLD_SIG&&document.getElementById('statusLine').textContent){holdShow('');return;}
  HOLD_SIG=sig;holdShow(HOLD_MANUAL?holdReason():'');
  epApply(!!STATE.superAdmin); // cổng SUPER hiện cụm can thiệp, cổng thường ẩn
  // status line
  document.getElementById('statusLine').textContent='TX #'+padId(STATE.tx.gameId)+' • '+STATE.players.length+' người chơi';
  // prefill channel id (chỉ khi ô đang trống, không đè lúc admin đang gõ)
  const txC=document.getElementById('txChannel'); if(txC&&!txC.value&&STATE.tx.channelId) txC.value=STATE.tx.channelId;
  // CHỈ điền khi ô còn TRỐNG (lần đầu mở trang) - refresh 3s không được đè số admin
  // vừa gõ (kể cả khi đã rời focus qua ô khác; bấm 💾 xong giá trị gõ = giá trị lưu).
  const txM=document.getElementById('txMaxBet'); if(txM&&txM.value===''&&document.activeElement!==txM&&STATE.tx.maxBet!==undefined) txM.value=STATE.tx.maxBet;
  if(STATE.tx.time){
    const tb=document.getElementById('txBetS'); if(tb&&tb.dataset.dirty!=='1'&&tb.value===''&&document.activeElement!==tb) tb.value=STATE.tx.time.bet;
    const tn=document.getElementById('txNanS'); if(tn&&tn.dataset.dirty!=='1'&&tn.value===''&&document.activeElement!==tn) tn.value=STATE.tx.time.nan;
    const tt=document.getElementById('txThang');
    if(tt&&STATE.tx.thang&&tt.dataset.dirty!=='1'&&tt.value===''&&document.activeElement!==tt){
      tt.value=Object.keys(STATE.tx.thang).map(k=>k+': '+STATE.tx.thang[k].map(b=>b[0]+'×'+b[1]).join(', ')).join('\\n');
    }
    const tnt=document.getElementById('txThangNote');
    if(tnt&&STATE.tx.rtp) tnt.textContent='Đang có '+STATE.tx.rtp.soCuaDuocNhan+'/52 cửa được nhân · trung bình '+STATE.tx.rtp.oSangMoiVan.toFixed(1)+' ô sáng mỗi ván.';
    stxDo();
    rlDo();
    const rt=document.getElementById('txRTP');
    if(rt&&STATE.tx.rtp){
      if(rt.dataset.dirty!=='1'&&rt.value===''&&document.activeElement!==rt) rt.value=(STATE.tx.rtp.rtp*100).toFixed(1).replace(/\.0$/,'');
      const nt=document.getElementById('txRTPNote');
      if(nt)nt.textContent='Đang chạy RTP '+(STATE.tx.rtp.rtp*100).toFixed(1)+'% → nhà cái ăn ~'+(STATE.tx.rtp.nhaCaiAn*100).toFixed(2)+'% · trung bình '+STATE.tx.rtp.oSangMoiVan.toFixed(1)+' ô sáng hệ số nhân mỗi ván · '+STATE.tx.rtp.soCuaDuocNhan+'/52 cửa có cơ hội được nhân';
    }
    const th=document.getElementById('txNhanS'); if(th&&th.dataset.dirty!=='1'&&th.value===''&&document.activeElement!==th) th.value=STATE.tx.time.nhan;
    const tw=document.getElementById('txTimeNow');
    if(tw) tw.innerHTML='Đang áp dụng: ván <b>'+STATE.tx.time.round+'s</b> = '+STATE.tx.time.bet+'s đặt cược + <b>'+STATE.tx.time.nhan+'s hiện nhân (cấm đặt)</b> + '+STATE.tx.time.nan+'s nặn. Đổi lúc nào cũng được; <b>ván đang chạy giữ nguyên mốc cũ</b>, ván sau mới theo số mới.';
  }
  // 🎲 trần cược 5 nhóm cửa, dựng 1 lần, sau đó chỉ đổ giá trị (ô đang gõ thì chừa ra)
  if(STATE.tx&&STATE.tx.tran){
    const T=STATE.tx.tran, hang=document.getElementById('txTranHang');
    if(hang&&!hang.dataset.xong){
      hang.dataset.xong='1';
      hang.innerHTML=Object.keys(T.nhom).map(function(k){
        return '<div style="flex:1 1 180px"><label>'+esc(T.nhom[k].ten)+'</label>'+
          '<input class="txTranO" data-nhom="'+k+'" data-ten="'+esc(T.nhom[k].ten)+'" type="number" min="1" oninput="txDirty(this)"></div>';
      }).join('');
    }
    document.querySelectorAll('.txTranO').forEach(function(el){
      if(el.dataset.dirty!=='1'&&document.activeElement!==el) el.value=T.tran[el.dataset.nhom];
    });
    const tn=document.getElementById('txTranNow');
    if(tn) tn.innerHTML='Thắng tối đa mỗi cửa theo trần đang đặt: '+
      Object.keys(T.nhom).map(function(k){return '<b>'+esc(T.nhom[k].ten.split(' · ')[0])+'</b> '+(T.thangToiDa[k]||0).toLocaleString('vi-VN');}).join(' · ')+
      '. Cửa trả càng cao trần càng thấp, sửa một ô là cả nhóm nhảy theo.';
  }
  if(Array.isArray(STATE.pokerAdmin)){
    // 🃏 cùng kiểu dataset.dirty như ô báo cược: đang gõ thì 3 giây refresh không được ghi đè
    const pa=document.getElementById('pokerAdminIds'); if(pa&&pa.dataset.dirty!=='1'&&pa.value===''&&document.activeElement!==pa) pa.value=STATE.pokerAdmin.join(', ');
    const pn=document.getElementById('pokerAdminNow'); if(pn) pn.innerHTML=STATE.pokerAdmin.length?('Đang là admin poker: <b>'+STATE.pokerAdmin.join(', ')+'</b>. Đổi ở đây là poker ăn ngay, không cần khởi động lại.'):'<b>Chưa đặt ai</b>, không ai mở được giải poker. Điền ID Discord của anh vào rồi Lưu.';
  }
  if(STATE.tx.noti){
    const ni=document.getElementById('txNotiId'); if(ni&&ni.dataset.dirty!=='1'&&ni.value===''&&document.activeElement!==ni) ni.value=STATE.tx.noti.id||'';
    const nm=document.getElementById('txNotiMin'); if(nm&&nm.dataset.dirty!=='1'&&nm.value===''&&document.activeElement!==nm) nm.value=STATE.tx.noti.min||0;
    const no=document.getElementById('txNotiOn'); if(no&&no.dataset.dirty!=='1'&&document.activeElement!==no) no.checked=!!STATE.tx.noti.on;
    const nw=document.getElementById('txNotiNow');
    if(nw) nw.innerHTML=(STATE.tx.noti.on&&STATE.tx.noti.id?'<b style="color:var(--green)">ĐANG BẬT</b> - gửi tới <b>'+STATE.tx.noti.id+'</b>'+(STATE.tx.noti.min>0?' (chỉ báo từ '+Number(STATE.tx.noti.min).toLocaleString('vi-VN')+' trở lên)':' (báo mọi mức)'):'<b style="color:var(--red)">ĐANG TẮT</b>')+'. Điền <b>ID người</b> thì bot nhắn riêng, <b>ID kênh</b> thì bot đăng vào kênh - bot tự dò.';
  }
  if(STATE.dailyCfg){[['dcDaily','daily'],['dcNghien','nghien'],['dcStreakEvery','streakEvery'],['dcStreakBonus','streakBonus']].forEach(([id,k])=>{const el=document.getElementById(id);if(el&&el.value===''&&document.activeElement!==el)el.value=STATE.dailyCfg[k];});
    const ns=document.getElementById('dcNghienOn');if(ns&&!ns.disabled)ns.checked=!!STATE.dailyCfg.nghienOn;
    const nn=document.getElementById('dcNghienNow');if(nn)nn.innerHTML=STATE.dailyCfg.nghienOn?'<b style="color:var(--green)">ĐANG BẬT</b> - mỗi người lụm <b>'+Number(STATE.dailyCfg.nghien).toLocaleString('vi-VN')+'</b> KNB / 1 tiếng (gõ /nghien trên Discord hoặc nút 💉 trên web)':'<b style="color:var(--red)">ĐANG TẮT</b> - /nghien báo "đang tắt", nút 💉 trên web bị ẩn';}
  // 🚕 vé taxi: ô đang gõ thì chừa ra, công tắc luôn theo máy chủ
  if(STATE.taxiCfg){[['txTien','tien'],['txLoMin','loMin'],['txViMax','viMax'],['txGio','gioCho']].forEach(([id,k])=>{const el=document.getElementById(id);if(el&&el.value===''&&document.activeElement!==el)el.value=STATE.taxiCfg[k];});
    const sw=document.getElementById('txOn');if(sw&&document.activeElement!==sw)sw.checked=!!STATE.taxiCfg.on;}
  // tx info
  const txRun=STATE.tx.live&&STATE.tx.status!=='stopped';
  document.getElementById('txInfo').innerHTML='<span class="run '+(txRun?'on':'off')+'">'+(txRun?'🟢 ĐANG CHẠY':'🔴 ĐÃ TẮT')+'</span> &nbsp; Game #'+padId(STATE.tx.gameId)+' • <span class="badge '+(STATE.tx.status==='betting'?'on':'off')+'">'+STATE.tx.status+'</span> • '+fmtTime(STATE.tx.targetTime)+' • '+STATE.tx.betsCount+' cược'+(STATE.tx.forced?' • <span class="badge on">ĐANG ÉP: '+STATE.tx.forced+'</span>':'');
  renderTxBetsLive();
  // 🏆 BỘI SỐ NỔ HŨ 🍀 (Dò Mìn / Leo Thang). Hũ NUÔI đã gỡ 23/09: tiền vào không, ra
  // không (potFeed luôn nạp 0 · potTake không ai gọi · txPotPaid hằng số 0).
  const pt=STATE.pot;
  if(pt){
    const mu=pt.mults||{}, muTxt=(k)=>'x'+((mu[k]&&mu[k].length)?mu[k]:[10,15,20]).join(' / x');
    document.getElementById('potInfo').innerHTML='Trúng 🏆 trong hộp 🍀 bốc ngẫu nhiên <b>'+muTxt('mines')
      +'</b> (Dò Mìn) · <b>'+muTxt('stairs')+'</b> (Leo Thang) nhân tiền cược'
      +' · sàn cược 2 minigame '+Number(pt.minBet||0).toLocaleString('vi-VN')+'/ván';
    // Panel tự làm mới 3 giây/lần: CHỈ dựng khung 1 lần rồi cập nhật con số,
    // không vẽ lại cả khối - vẽ lại là cuốn mất số admin đang gõ dở (bug 20/08).
    const box=document.getElementById('potRows');
    if(!box.dataset.built){
      box.innerHTML=''
        // 🏆 09/09: bội số nổ hũ 2 minigame (hết hũ nuôi) - ô text "10,15,20", SUPER
        +['mines','stairs'].map(k=>'<div class="row epOnly" style="align-items:center;margin-bottom:8px"><div style="flex:3"><b>'+(k==='mines'?'💣 Dò Mìn':'🪜 Leo Thang')+'</b><br><span class="muted" style="font-size:12px">🏆 bội số nổ hũ (bốc ngẫu nhiên × tiền cược)'+(pt.leftover&&pt.leftover[k]>0?' · hũ cũ còn '+Number(pt.leftover[k]).toLocaleString('vi-VN')+' không dùng':'')+'</span></div>'
          +'<div style="flex:3"><input id="potMults_'+k+'" placeholder="vd: 10,15,20" title="1-6 số, cách nhau bằng dấu phẩy"></div>'
          +'<button class="btn-green" onclick="potCfgSave(\\''+k+'\\',this)">💾 Lưu</button></div>').join('')
      box.dataset.built='1';
    }
    // ô bội số: chỉ điền khi còn TRỐNG và không đang gõ (poll 3s không cuốn số đang sửa)
    ['mines','stairs'].forEach(k=>{const m=document.getElementById('potMults_'+k);if(m&&m.value===''&&document.activeElement!==m&&pt.mults&&pt.mults[k])m.value=pt.mults[k].join(',');});
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
  // trang thai bang Phi Thuyen
  const spb=STATE.spmBoard||{on:false,channelId:''};
  const spbEl=document.getElementById('spmBoardInfo');
  if(spbEl){spbEl.innerHTML='<span class="run '+(spb.on?'on':'off')+'">'+(spb.on?'🟢 ĐANG HIỆN':'🔴 CHƯA ĐĂNG')+'</span>'+(spb.channelId?' &nbsp; kênh <code>'+esc(spb.channelId)+'</code>':'');
  const spch=document.getElementById('spmChannel');if(spb.channelId&&spch&&!spch.value)spch.value=spb.channelId;}
  // 🎡 vòng quay: đang chờ mấy người / cần mấy người
  const wh=STATE.wheel;
  if(wh){document.getElementById('whInfo').innerHTML='Vé <b>'+Number(wh.ticket||0).toLocaleString()+'</b> · đang chờ <b>'+wh.waiting+'</b>/'+wh.minPlayers+' người';
  const wmi=document.getElementById('whMin');if(wmi&&!wmi.value&&document.activeElement!==wmi)wmi.value=wh.minPlayers;
  (wh.prices||[]).forEach((v,i)=>{const e=document.getElementById('whP'+(i+1));if(e&&!e.value&&document.activeElement!==e)e.value=v;});}
  if(STATE.stock)skFill(STATE.stock);
  if(STATE.spmCfg)spFill(STATE.spmCfg);
  spLiveRender();
  if(STATE.loanCfg)loanCfgFill(STATE.loanCfg);
  itemShopFill();giftFill();featRender();tlFill();if(!PBA)pbaLoad();   // 🐾 Pet Boss: tải 1 lần
  // 📅 hạn mua/ngày: chỉ điền khi ô TRỐNG + không focus (không đè số admin đang gõ)
  const dmx=document.getElementById('isDayMax');if(dmx&&dmx.value===''&&document.activeElement!==dmx&&STATE.itemShopDayMax!==null&&STATE.itemShopDayMax!==undefined)dmx.value=STATE.itemShopDayMax;
  // chế độ đếm: điền theo state khi select chưa được admin đụng (cờ dataset.touched đặt lúc đổi)
  const imx=document.getElementById('isImplantMax');if(imx&&imx.value===''&&document.activeElement!==imx&&STATE.itemShopImplantMax!==null&&STATE.itemShopImplantMax!==undefined)imx.value=STATE.itemShopImplantMax;
  gqRender();gqFill(STATE.itemShopGroupQuota);
  const dmo=document.getElementById('isDayMode');if(dmo&&STATE.itemShopDayMode&&!dmo.dataset.touched&&document.activeElement!==dmo){dmo.value=STATE.itemShopDayMode;dmo.onchange=()=>{dmo.dataset.touched='1';};}
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
  gsFill();   // ⏸️ công tắc gom 5 trò ở tab 👥
  // 🍀 ép quà hộp kế tiếp
  const ll=document.getElementById('luckyList');
  if(ll){ll.innerHTML='';const fl2=STATE.forcedLucky||{};const lk=Object.keys(fl2);const PZ={shield:'🛡️ Khiên',dig:'⛏️ Máy đào',rocket:'🚀 Thang máy',cash:'💰 Lì xì',jackpot:'🏆 Nổ hũ',none:'🍂 Hụt',dbl:'🎲 Gấp đôi/không',scout:'🧭 La bàn',refund:'↩️ Hoàn vé cỏ'};
    if(lk.length){ll.innerHTML='<div class="muted" style="font-size:13px;margin-top:6px">Đang ép hộp 🍀:</div>';
      lk.forEach(k=>{const p=STATE.players.find(x=>x.id===k);const name=k==='_any'?'🎯 Người tiếp theo bất kỳ':(p?p.name:k);
        const item=document.createElement('div');item.className='item';
        item.innerHTML='<span>'+esc(name)+' → hộp kế tiếp ra '+(PZ[fl2[k]]||fl2[k])+'</span><button class="mini btn-red" onclick="luckyClear(\\''+k+'\\')">Xóa</button>';
        ll.appendChild(item);});}}
  // xổ số
  // 🏷️ nhóm hàng shop (trước gọi kèm trong renderGacha - đã gỡ cùng card khoe quay Pal)
  icDraw(); icFillFilter();
  // kênh + role thông báo phát KNB
  renderGiveaway();
  // players table
  renderPlayers();
  document.getElementById('resetCount').textContent=STATE.players.length;
  // lịch sử các trò
  renderHistories();
  // kênh đã lưu
  renderSavedChannels();
  // yêu cầu rút KNB
  renderWithdraw();
  renderDogLedger();
  renderLienKet();
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
  // 04/10: kiểm token bằng /api/whoami (cổng mod bị chặn /api/state -> trước đây sẽ tự đăng xuất)
  fetch('/api/whoami',{headers:{'Authorization':'Bearer '+TOKEN}}).then(r=>{if(r.ok)showApp();else logout();}).catch(()=>logout());
}
</script>
<script src="/gn-admin.js"></script><script src="/br.js"></script><script src="/tl.js"></script>
</body>
</html>`;

module.exports = { startPanel };
