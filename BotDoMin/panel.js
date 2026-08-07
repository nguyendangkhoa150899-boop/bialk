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

    const buildPlayers = () => {
        const db = ctx.getDb();
        return Object.keys(db)
            .filter(k => !k.startsWith('_') && db[k] && typeof db[k] === 'object')
            .map(id => ({ id, name: db[id].name || '(chưa rõ tên)', points: db[id].points || 0 }))
            .sort((a, b) => b.points - a.points);
    };

    const buildState = () => {
        const tx = ctx.getTX();
        const bc = ctx.getBC();
        const db = ctx.getDb();
        const wd = ctx.getWithdraw ? ctx.getWithdraw() : {};
        return {
            tx: {
                gameId: tx.gameId,
                status: tx.status,
                targetTime: tx.targetTime,
                betsCount: tx.bets ? tx.bets.length : 0,
                forced: tx.forcedResult || null,
                live: !!tx.message,
                channelId: (tx.channel && tx.channel.id) || db._txChannelId || '',
            },
            bc: {
                gameId: bc.gameId,
                status: bc.status,
                targetTime: bc.targetTime,
                betsCount: bc.bets ? bc.bets.length : 0,
                forced: bc.forcedResult || null,
                live: !!bc.message,
                channelId: (bc.channel && bc.channel.id) || db._bcChannelId || '',
            },
            forcedMines: ctx.getForcedMines(),
            withdraw: {
                live: !!wd.message,
                channelId: (wd.channel && wd.channel.id) || db._withdrawChannelId || '',
            },
            withdrawRequests: ctx.getWithdrawRequests ? ctx.getWithdrawRequests() : [],
            players: buildPlayers(),
            mascots: ctx.mascots.map(m => ({ id: m.id, name: m.name, emoji: m.emoji })),
            txHistory: (ctx.getTXDash ? ctx.getTXDash() : []),
            bcHistory: (ctx.getBCDash ? ctx.getBCDash() : []),
            minesHistory: ctx.getMinesHistory ? ctx.getMinesHistory() : [],
            savedChannels: db._savedChannels || [],
            dogLedger: (ctx.getDogLedger ? ctx.getDogLedger() : []).slice(0, 80),
            palOrders: (ctx.getPalOrders ? ctx.getPalOrders() : []).slice(0, 30),
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
                    return sendJSON(res, 200, { ok: true, state: buildState() });
                }

                // Dữ liệu Palworld để riêng, KHÔNG nhét vào /api/state: nó phải gọi
                // sang dashboard Palworld qua mạng, chậm và có thể lỗi — không nên
                // làm cả panel chậm/vỡ theo. Chỉ tải khi mở tab Palworld.
                if (path === '/api/pal/state') {
                    if (!ctx.palGetOnlinePlayers) {
                        return sendJSON(res, 200, { ok: false, error: 'Bot chưa nối với dashboard Palworld' });
                    }
                    try {
                        const [players, links] = await Promise.all([
                            ctx.palGetOnlinePlayers(),
                            ctx.palListLinks(),
                        ]);
                        return sendJSON(res, 200, { ok: true, players, links });
                    } catch (e) {
                        return sendJSON(res, 200, { ok: false, error: e.message });
                    }
                }

                const body = req.method === 'POST' ? await readBody(req) : {};

                // ---- TÀI XỈU ----
                if (path === '/api/tx/force') {
                    const vals = String(body.values || '').trim();
                    const parts = vals.split(',').map(s => parseInt(s.trim()));
                    if (parts.length !== 3 || parts.some(n => isNaN(n) || n < 1 || n > 6)) {
                        return sendJSON(res, 400, { ok: false, error: 'Cần 3 số xúc xắc 1-6, vd: 6,5,4' });
                    }
                    ctx.getTX().forcedResult = parts.join(',');
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Ép kết quả Tài Xỉu ván tới: ${parts.join(',')}`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/tx/clear') {
                    ctx.getTX().forcedResult = null;
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Hủy ép kết quả Tài Xỉu`);
                    return sendJSON(res, 200, { ok: true });
                }

                // ---- BẦU CUA ----
                if (path === '/api/bc/force') {
                    const vals = String(body.values || '').trim();
                    const ids = vals.split(',').map(s => s.trim());
                    const valid = new Set(ctx.mascots.map(m => m.id));
                    if (ids.length !== 3 || ids.some(id => !valid.has(id))) {
                        return sendJSON(res, 400, { ok: false, error: 'Cần 3 con vật hợp lệ' });
                    }
                    ctx.getBC().forcedResult = ids.join(',');
                    ctx.writeLog('ADMIN', `[PANEL ÉP BC] Ép kết quả Bầu Cua ván tới: ${ids.join(',')}`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/bc/clear') {
                    ctx.getBC().forcedResult = null;
                    ctx.writeLog('ADMIN', `[PANEL ÉP BC] Hủy ép kết quả Bầu Cua`);
                    return sendJSON(res, 200, { ok: true });
                }

                // ---- ĐIỀU KHIỂN BÀN CHƠI ----
                if (path === '/api/bc/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startBC(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo Bầu Cua tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/bc/stop') {
                    ctx.stopBC();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng Bầu Cua`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/tx/start') {
                    const channelId = String(body.channelId || '').trim();
                    if (!channelId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Channel ID' });
                    try {
                        const name = await ctx.startTX(channelId);
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo Tài Xỉu tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/tx/stop') {
                    ctx.stopTX();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng Tài Xỉu`);
                    return sendJSON(res, 200, { ok: true });
                }
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
                    ctx.getUserData(uid).points = amount;
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Set ${uid} = ${amount}`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/points/add') {
                    const uid = String(body.userId || '').trim();
                    const amount = parseInt(body.amount);
                    if (!uid || isNaN(amount)) return sendJSON(res, 400, { ok: false, error: 'Dữ liệu không hợp lệ' });
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
                // Giao tay 1 yêu cầu đang chờ (khi người chơi đã vào game, không muốn đợi vòng quét 60s)
                if (path === '/api/withdraw/deliver') {
                    const id = parseInt(body.id);
                    if (!ctx.deliverWithdrawById) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ giao tự động' });
                    const r = await ctx.deliverWithdrawById(id);
                    return sendJSON(res, r.ok ? 200 : 400, r);
                }

                // ---- LIÊN KẾT PALWORLD ----
                // Dữ liệu liên kết do dashboard Palworld giữ; panel này chỉ gọi qua.
                if (path === '/api/pal/link') {
                    const discordId = String(body.discordId || '').trim();
                    const ingameName = String(body.ingameName || '').trim();
                    const steamId = String(body.steamId || '').trim();
                    if (!discordId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Discord ID' });
                    if (!ingameName && !steamId) return sendJSON(res, 400, { ok: false, error: 'Chưa chọn nhân vật' });
                    try {
                        const link = await ctx.palSaveLink({ discordId, discordName: String(body.discordName || ''), ingameName, steamId });
                        ctx.writeLog('ADMIN', `[PANEL LIÊN KẾT] ${discordId} -> ${link.ingameName || ''} (${link.steamId})`);
                        return sendJSON(res, 200, { ok: true, link });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
                }
                // Admin đã tạo pal trong game xong -> đóng đơn + nhắn cho người mua
                if (path === '/api/pal/order-done') {
                    const id = parseInt(body.id);
                    if (!ctx.completePalOrder) return sendJSON(res, 400, { ok: false, error: 'Bot chưa hỗ trợ (bản cũ)' });
                    const r = await ctx.completePalOrder(id);
                    return sendJSON(res, r.ok ? 200 : 400, r);
                }

                if (path === '/api/pal/unlink') {
                    const discordId = String(body.discordId || '').trim();
                    if (!discordId) return sendJSON(res, 400, { ok: false, error: 'Thiếu Discord ID' });
                    try {
                        await ctx.palDeleteLink(discordId);
                        ctx.writeLog('ADMIN', `[PANEL LIÊN KẾT] Hủy liên kết ${discordId}`);
                        return sendJSON(res, 200, { ok: true });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
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
                    ids.forEach(id => { db[id].points = amount; });
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Set tất cả ${ids.length} người = ${amount}`);
                    return sendJSON(res, 200, { ok: true, count: ids.length });
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
<title>Bảng Điều Khiển Casino</title>
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
  button{cursor:pointer;border:0;border-radius:8px;padding:10px 14px;font-weight:600;color:#fff}
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
    <strong>Bảng Điều Khiển Casino</strong>
    <span id="connText" style="font-size:13px;font-weight:600"></span>
    <span id="statusLine" class="muted" style="margin-left:auto;font-size:13px"></span>
  </header>

  <div class="wrap">
    <div class="tabs">
      <button data-tab="tx" class="active" onclick="tab('tx')">🎲 Tài Xỉu</button>
      <button data-tab="bc" onclick="tab('bc')">🦀 Bầu Cua</button>
      <button data-tab="mine" onclick="tab('mine')">💎 Dò Mìn</button>
      <button data-tab="user" onclick="tab('user')">👥 Người chơi</button>
      <button data-tab="pal" onclick="tab('pal')">🎮 Palworld & Dogcoin<span id="wdBadge" class="hidden"></span></button>
    </div>

    <!-- TÀI XỈU -->
    <div id="tab-tx">
      <div class="card">
        <h3>🎛️ Điều khiển bàn Tài Xỉu</h3>
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
        <h2>🎲 Tài Xỉu</h2>
        <div class="muted" id="txInfo" style="font-size:13px;margin-bottom:10px"></div>
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
        <div class="row" style="margin-top:14px">
          <button class="btn-green" style="flex:2" onclick="txForce()">⚡ Ép kết quả ván tới</button>
          <button class="btn-grey" onclick="api('/api/tx/clear',{}).then(()=>{toast('Đã hủy ép');refresh()})">Hủy ép</button>
        </div>
        <div class="note">Ép cứng 100%: ván mở bát kế tiếp sẽ ra đúng 3 xúc xắc này. Nên ép trong lúc trạng thái còn <b>betting</b>.</div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử Tài Xỉu</h3>
        <div id="txHist" class="hist"></div>
      </div>
    </div>

    <!-- BẦU CUA -->
    <div id="tab-bc" class="hidden">
      <div class="card">
        <h3>🎛️ Điều khiển bàn Bầu Cua</h3>
        <label>Channel ID (kênh đăng bàn chơi)</label>
        <input id="bcChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="bcSaved"></div>
        <div class="row" style="margin-top:8px">
          <div style="flex:2"><input id="bcSaveId" placeholder="Channel ID"></div>
          <div style="flex:3"><input id="bcSaveNote" placeholder="Ghi chú"></div>
          <button class="btn-blue" onclick="saveChannel('bc')">💾 Lưu kênh</button>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="bcStart()">▶️ Bật / Tạo bàn mới</button>
          <button class="btn-red" onclick="bcStop()">⏹️ Tắt bàn</button>
          <button class="btn-grey" onclick="chatDelete('bcChannel')">🧹 Xóa chat bot</button>
        </div>
        <div class="note">Lấy Channel ID: bật <b>Developer Mode</b> → chuột phải kênh → <b>Copy Channel ID</b>.</div>
      </div>
      <div class="card">
        <h2>🦀 Bầu Cua</h2>
        <div class="muted" id="bcInfo" style="font-size:13px;margin-bottom:10px"></div>
        <div class="row">
          <div><label>Con 1</label><select id="m1"></select></div>
          <div><label>Con 2</label><select id="m2"></select></div>
          <div><label>Con 3</label><select id="m3"></select></div>
        </div>
        <div class="preview" id="bcPrev"></div>
        <div class="quick" id="bcQuick"></div>
        <div class="row" style="margin-top:14px">
          <button class="btn-green" style="flex:2" onclick="bcForce()">⚡ Ép kết quả ván tới</button>
          <button class="btn-grey" onclick="api('/api/bc/clear',{}).then(()=>{toast('Đã hủy ép');refresh()})">Hủy ép</button>
        </div>
        <div class="note">Ép cứng 100%: ván mở bát kế tiếp sẽ ra đúng 3 con vật này.</div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử Bầu Cua</h3>
        <div id="bcHist" class="hist"></div>
      </div>
    </div>

    <!-- DÒ MÌN -->
    <div id="tab-mine" class="hidden">
      <div class="card">
        <h2>💎 Dò Mìn — đặt vị trí mìn</h2>
        <div class="row">
          <div style="flex:3">
            <label>Người chơi mục tiêu</label>
            <select id="mineUser"></select>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="mineAny" checked style="width:auto;margin:0" onchange="renderMineTarget()">
          Áp dụng cho người tiếp theo bất kỳ (ai chơi /domin trước thì dính)
        </label>
        <div class="grid" id="mineGrid"></div>
        <div class="row" style="margin-top:12px">
          <div class="muted" style="flex:2;font-size:13px">Đã đánh dấu: <b id="mineCount">0</b> ô mìn</div>
          <button class="btn-grey" onclick="clearGrid()">Xóa lưới</button>
          <button class="btn-green" style="flex:2" onclick="mineForce()">💣 Đặt mìn cho ván tới</button>
        </div>
        <div class="note">⚠️ Mìn ẩn, người chơi tự bấm — đặt mìn chỉ <b>tăng xác suất</b> trúng, không ép cứng 100%. Số ô đánh dấu sẽ là mìn chắc chắn; nếu họ chọn số mìn ít hơn thì chỉ lấy bấy nhiêu ô đầu. Muốn dễ thua: đặt mìn ở các ô trên-trái (hay bấm trước).</div>
        <div class="flist" id="mineList"></div>
      </div>
      <div class="card">
        <h3>📜 Lịch sử Dò Mìn</h3>
        <div id="mineHist" class="hist"></div>
      </div>
    </div>

    <!-- NGƯỜI CHƠI -->
    <!-- RÚT DOGCOIN -->
    <!-- PALWORLD -->
    <div id="tab-pal" class="hidden">
      <div class="card">
        <h3>🎛️ Kênh chuyển Dogcoin & Shop Pal</h3>
        <label>Channel ID (kênh đăng bảng)</label>
        <input id="wdChannel" placeholder="vd: 123456789012345678">
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="wdStart()">▶️ Bật / Đăng lại bảng</button>
          <button class="btn-red" onclick="wdStop()">⏹️ Tắt</button>
        </div>
        <div class="note">Bot đăng <b>2 tin nhắn</b> vào kênh: bảng <b>Chuyển Dogcoin</b> (Chuyển vào game, Chuyển ra Discord, Đổi vàng — kèm bảng số dư tự cập nhật mỗi 60 giây) và bảng <b>Shop Pal</b> (Chọn pal, Ngẫu nhiên, Lõi Văn Minh, Cấy ghép). <b>Sửa code xong phải bấm Đăng lại</b> để tin nhắn có nút mới.</div>
      </div>
      <!-- Chỉ hiện khi CÓ việc cần xử lý: người chơi offline lúc bấm, hoặc yêu cầu
           bị treo vì bot crash giữa lúc giao. Bình thường tự động chạy xong nên khung
           này ẩn. Đừng bỏ hẳn — đây là chỗ duy nhất nhìn thấy tiền đang bị treo. -->
      <div class="card hidden" id="wdPendingCard">
        <h3>⚠️ Yêu cầu chuyển vào game cần xử lý</h3>
        <div class="note">Bình thường bot tự giao. Yêu cầu nằm ở đây là do người chơi <b>offline</b> lúc bấm (bot sẽ tự giao khi họ vào game), hoặc <b>bị treo</b> giữa lúc giao. 🎮 <b>Giao ngay</b> = thử giao lại. ✅ <b>Đánh dấu xong</b> = bạn tự đưa trong game rồi. ❌ <b>Từ chối</b> = hoàn Dogcoin.</div>
        <div id="wdPending"></div>
      </div>
      <div id="wdDone" class="hidden"></div>
      <div class="card">
        <h3>🐾 Đơn mua Pal<span id="palOrderBadge" class="hidden"></span></h3>
        <div class="note">Người chơi mua ở Discord, bot gửi đơn cho admin qua tin nhắn riêng. Bạn dùng CreativeMenu tạo pal rồi giao trong game.</div>
        <div id="palOrders" class="hist"></div>
      </div>
      <div class="card">
        <h3>💰 Sổ biến động Dogcoin</h3>
        <div class="note">Ghi mọi khoản <b>điều chỉnh và chuyển đổi</b>: admin cộng/trừ tay, chuyển giữa người chơi, chuyển vào/ra game, mua pal, hoàn tiền. <b>Không</b> ghi tiền cược thắng/thua mini game (mỗi ván đều sinh giao dịch, ghi hết thì không tra được gì).</div>
        <div id="dogLedger" class="hist"></div>
      </div>

      <div class="card">
        <h3>🎮 Người chơi đang online trong game <button class="btn-blue" style="padding:4px 10px;font-size:12px" onclick="palRefresh()">🔄 Tải lại</button></h3>
        <div class="note">Cần dashboard Palworld đang chạy cùng máy. Người chơi phải <b>đang online</b> mới lấy được SteamID để liên kết.</div>
        <div id="palOnline"></div>
      </div>
      <div class="card">
        <h3>🔗 Liên kết Discord ↔ nhân vật Palworld</h3>
        <div class="note">Liên kết theo <b>SteamID</b> nên người chơi đổi tên nhân vật vẫn không hỏng. Khi họ rút Dogcoin, bot tự đưa Dog Coin vào game cho nhân vật đã liên kết.</div>
        <label>Tài khoản Discord</label>
        <select id="palDiscord"></select>
        <label style="margin-top:10px">Nhân vật đang online</label>
        <select id="palPlayer"></select>
        <div class="row" style="margin-top:12px">
          <button class="btn-green" onclick="palLink()">🔗 Liên kết</button>
        </div>
        <div id="palLinkErr" class="muted" style="margin-top:10px"></div>
      </div>
      <div class="card">
        <h3>📋 Danh sách đã liên kết</h3>
        <div id="palLinks"></div>
      </div>
    </div>

    <div id="tab-user" class="hidden">
      <div class="card">
        <h2>👥 Ví điểm người chơi</h2>
        <div class="row">
          <div style="flex:3"><label>Set tất cả người chơi về</label><input id="setAllAmount" type="number" placeholder="vd: 50000"></div>
          <button class="btn-red" onclick="setAll()">Set tất cả</button>
        </div>
        <input id="search" placeholder="🔍 Tìm theo tên hoặc ID..." oninput="renderPlayers()" style="margin-top:12px">
        <div style="overflow-x:auto">
          <table id="playerTable">
            <thead><tr><th>Tên</th><th>ID</th><th>Điểm</th><th>Thao tác</th></tr></thead>
            <tbody id="playerBody"></tbody>
          </table>
        </div>
      </div>

      <div class="card danger">
        <h3>🧨 Reset mùa mới — xóa sạch ví người chơi cũ</h3>
        <div class="note">Dùng khi mở lại mini game (vd: chuyển sang Dog Coin của Palworld). Toàn bộ ví hiện tại bị <b>xóa khỏi database</b>, ai chơi lại sẽ được tạo ví mới với số dư khởi điểm mặc định. Yêu cầu rút đang chờ sẽ bị hủy và lệnh ép mìn bị gỡ. Bot tự lưu 1 file <b>database.backup-reset-*.json</b> cạnh database trước khi xóa.</div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="resetHistory" style="width:auto;margin:0">
          Xóa luôn lịch sử Tài Xỉu / Bầu Cua / Dò Mìn + lịch sử rút Dogcoin
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

// Hộp xác nhận tự vẽ — hiện giữa màn hình, đúng theme web (thay confirm() của trình duyệt)
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
  refresh();
  setInterval(refresh,3000);
}

function tab(t){
  ['tx','bc','mine','user','pal'].forEach(x=>document.getElementById('tab-'+x).classList.toggle('hidden',x!==t));
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  // Dữ liệu Palworld phải gọi sang dashboard qua mạng nên chỉ tải khi mở tab.
  if(t==='pal') palRefresh();
}

// ===== TAB PALWORLD =====
let PAL={players:[],links:[]};

// esc() của panel chỉ escape &<> nên không an toàn khi nhét vào trong thuộc tính
// HTML (tên nhân vật có dấu " sẽ làm hỏng thẻ). Dùng hàm này cho value/data-*.
function escA(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function palRefresh(){
  const onlineBox=document.getElementById('palOnline');
  onlineBox.innerHTML='<div class="muted">Đang tải...</div>';
  try{
    const r=await fetch('/api/pal/state',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}});
    const j=await r.json().catch(()=>({}));
    if(!j.ok){
      onlineBox.innerHTML='<div class="muted" style="color:var(--red)">❌ '+(j.error||'Không gọi được dashboard Palworld')+'</div>';
      document.getElementById('palLinks').innerHTML='';
      return;
    }
    PAL={players:j.players||[],links:j.links||[]};
    renderPalOnline();
    renderPalLinks();
    fillPalSelects();
  }catch(e){
    onlineBox.innerHTML='<div class="muted" style="color:var(--red)">❌ '+e.message+'</div>';
  }
}

function renderPalOnline(){
  const box=document.getElementById('palOnline');
  if(PAL.players.length===0){box.innerHTML='<div class="muted">Chưa có ai online trong game</div>';return;}
  box.innerHTML=PAL.players.map(p=>{
    const linked=PAL.links.find(l=>l.steamId===p.userId);
    return '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">'+
      '<div><b>'+esc(p.cleanName||p.name)+'</b> <span class="muted" style="font-size:12px">Lv'+(p.level||'?')+' · '+esc(p.userId)+'</span></div>'+
      '<div>'+(linked?'<span style="color:var(--green)">🔗 '+esc(linked.discordName||linked.discordId)+'</span>':'<span class="muted">chưa liên kết</span>')+'</div>'+
    '</div>';
  }).join('');
}

function renderPalLinks(){
  const box=document.getElementById('palLinks');
  if(PAL.links.length===0){box.innerHTML='<div class="muted">Chưa có liên kết nào</div>';return;}
  box.innerHTML=PAL.links.map(l=>{
    const online=PAL.players.some(p=>p.userId===l.steamId);
    return '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">'+
      '<div><b>'+esc(l.discordName||l.discordId)+'</b> → <b>'+esc(l.ingameName||'?')+'</b>'+
      '<br><span class="muted" style="font-size:12px">'+esc(l.discordId)+' · '+esc(l.steamId)+'</span></div>'+
      '<div class="row">'+(online?'<span style="color:var(--green);font-size:12px">● online</span>':'<span class="muted" style="font-size:12px">○ offline</span>')+
      '<button class="btn-red" style="padding:4px 10px;font-size:12px" onclick="palUnlink(\\''+escA(l.discordId)+'\\')">Hủy</button></div>'+
    '</div>';
  }).join('');
}

// Danh sách Discord lấy từ ví người chơi (STATE.players) — khỏi phải copy ID tay.
function fillPalSelects(){
  const ds=document.getElementById('palDiscord');
  const wallets=(STATE.players||[]);
  const cur=ds.value;
  ds.innerHTML=wallets.length
    ? wallets.map(p=>'<option value="'+escA(p.id)+'">'+esc(p.name)+' — '+esc(p.id)+'</option>').join('')
    : '<option value="">-- chưa có ví nào --</option>';
  if([...ds.options].some(o=>o.value===cur)) ds.value=cur;

  const ps=document.getElementById('palPlayer');
  const curP=ps.value;
  ps.innerHTML=PAL.players.length
    ? PAL.players.map(p=>'<option value="'+escA(p.userId)+'" data-name="'+escA(p.cleanName||p.name)+'">'+esc(p.cleanName||p.name)+' — '+esc(p.userId)+'</option>').join('')
    : '<option value="">-- chưa có ai online --</option>';
  if([...ps.options].some(o=>o.value===curP)) ps.value=curP;
}

async function palLink(){
  const ds=document.getElementById('palDiscord');
  const ps=document.getElementById('palPlayer');
  const err=document.getElementById('palLinkErr');
  const discordId=ds.value;
  const steamId=ps.value;
  if(!discordId){err.style.color='var(--red)';err.textContent='Chưa chọn tài khoản Discord';return;}
  if(!steamId){err.style.color='var(--red)';err.textContent='Người chơi phải đang online mới lấy được SteamID';return;}
  const discordName=(ds.selectedOptions[0]?ds.selectedOptions[0].textContent.split(' — ')[0]:'');
  const ingameName=(ps.selectedOptions[0]?ps.selectedOptions[0].dataset.name:'');
  try{
    await api('/api/pal/link',{discordId,discordName,steamId,ingameName});
    err.style.color='var(--green)';err.textContent='✅ Đã liên kết '+ingameName;
    toast('🔗 Đã liên kết');
    palRefresh();
  }catch(e){err.style.color='var(--red)';err.textContent='❌ '+e.message;}
}

// Sổ biến động Dogcoin — dữ liệu đến từ STATE (poll mỗi 3s) nên không cần gọi riêng.
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
  // Đơn chưa làm lên trước — đó là việc cần làm; đơn xong hiện mờ bên dưới.
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
          '<b>#'+o.id+' '+esc(o.palName)+'</b> <span class="muted" style="font-size:12px">'+esc(o.palCode)+'</span>'+
          ' · '+(o.kind==='random'?'🎲':'🎯')+' '+Number(o.price||0).toLocaleString()+
          '<br><span class="muted" style="font-size:12px">'+esc(o.username||o.userId)+' · '+esc(o.time||'')+
            (isDone&&o.doneAt?' · xong '+esc(o.doneAt):'')+'</span>'+
          '<br><span style="font-size:12px">Linh hồn: <b>'+esc(o.souls||'-')+'</b> | Passive: <b>'+esc(o.passives||'-')+'</b></span>'+
        '</div>'+
        (isDone
          ? '<span class="win" style="font-size:12px;white-space:nowrap">✅ Đã giao</span>'
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

async function palUnlink(discordId){
  if(!await uiConfirm('Hủy liên kết của '+discordId+'?','Hủy liên kết','btn-red'))return;
  try{await api('/api/pal/unlink',{discordId});toast('↩️ Đã hủy liên kết');palRefresh();}catch(e){}
}

function initSelects(){
  ['d1','d2','d3'].forEach(id=>{
    const s=document.getElementById(id);s.innerHTML='';
    for(let i=1;i<=6;i++){const o=document.createElement('option');o.value=i;o.textContent=i;s.appendChild(o);}
    s.onchange=txPreview;
  });
  setDice(1,1,1);
  // lưới dò mìn
  const g=document.getElementById('mineGrid');g.innerHTML='';
  for(let i=0;i<24;i++){
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
  api('/api/tx/force',{values:v}).then(()=>{toast('⚡ Đã ép Tài Xỉu: '+v);refresh();});
}

function mascotOptions(sel){
  if(!STATE)return;
  ['m1','m2','m3'].forEach(id=>{
    const s=document.getElementById(id);if(s.dataset.filled)return;
    STATE.mascots.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.emoji+' '+m.name;s.appendChild(o);});
    s.dataset.filled='1';s.onchange=bcPreview;
  });
  // quick buttons: 3 con giống nhau
  const q=document.getElementById('bcQuick');
  if(!q.dataset.filled){
    STATE.mascots.forEach(m=>{const b=document.createElement('button');b.textContent=m.emoji+'x3';b.onclick=()=>{document.getElementById('m1').value=m.id;document.getElementById('m2').value=m.id;document.getElementById('m3').value=m.id;bcPreview();};q.appendChild(b);});
    q.dataset.filled='1';
  }
}
function bcPreview(){
  if(!STATE)return;
  const ids=[document.getElementById('m1').value,document.getElementById('m2').value,document.getElementById('m3').value];
  const txt=ids.map(id=>{const m=STATE.mascots.find(x=>x.id===id);return m?m.emoji:'?';}).join(' ');
  document.getElementById('bcPrev').textContent=txt;
}
function bcForce(){
  const v=[document.getElementById('m1').value,document.getElementById('m2').value,document.getElementById('m3').value].join(',');
  api('/api/bc/force',{values:v}).then(()=>{toast('⚡ Đã ép Bầu Cua');refresh();});
}

function txStart(){const c=document.getElementById('txChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/tx/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bàn ở #'+j.name);refresh();});}
async function txStop(){if(!await uiConfirm('Tắt bàn Tài Xỉu?','Tắt bàn','btn-red'))return;api('/api/tx/stop',{}).then(()=>{toast('⏹️ Đã tắt bàn Tài Xỉu');refresh();});}
function bcStart(){const c=document.getElementById('bcChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/bc/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bàn ở #'+j.name);refresh();});}
async function bcStop(){if(!await uiConfirm('Tắt bàn Bầu Cua?','Tắt bàn','btn-red'))return;api('/api/bc/stop',{}).then(()=>{toast('⏹️ Đã tắt bàn Bầu Cua');refresh();});}
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
  ['tx','bc'].forEach(prefix=>{
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
  const q=(document.getElementById('search').value||'').toLowerCase();
  const tb=document.getElementById('playerBody');tb.innerHTML='';
  STATE.players.filter(p=>p.name.toLowerCase().includes(q)||p.id.includes(q)).forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+esc(p.name)+'</td><td class="muted" style="font-size:12px">'+p.id+'</td><td><b>'+p.points.toLocaleString()+'</b></td>'+
      '<td><input class="mini-in" type="number" placeholder="số" id="amt_'+p.id+'">'+
      ' <button class="mini btn-blue" onclick="pSet(\\''+p.id+'\\')">Set</button>'+
      ' <button class="mini btn-green" onclick="pAdd(\\''+p.id+'\\')">Cộng</button>'+
      ' <button class="mini btn-red" onclick="pSub(\\''+p.id+'\\')">Trừ</button>'+
      ' <button class="mini btn-grey" onclick="pDel(\\''+p.id+'\\')">🗑️ Xóa ví</button></td>';
    tb.appendChild(tr);
  });
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function fmtAmt(n){return (n>0?'+':'')+Number(n).toLocaleString();}
function padId(n){return String(n).padStart(5,'0');}

function renderHistories(){
  if(!STATE)return;
  // Tài Xỉu
  const tx=STATE.txHistory||[];
  document.getElementById('txHist').innerHTML = tx.length? tx.map(g=>{
    const bets=(g.bets||[]).map(b=>esc(b.name)+': '+b.amount.toLocaleString()+' ('+b.choice+')').join(' • ')||'không ai đặt';
    const wins=(g.winners||[]).map(w=>esc(w.name)+' +'+w.amount.toLocaleString()).join(' • ');
    return '<div class="h"><div class="top"><span>Game #'+padId(g.gameId)+' — 🎲 '+g.dice.join('-')+' (Tổng '+g.sum+') · '+g.tx+' | '+g.cl+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">📝 '+bets+'</div>'+(wins?'<div class="win">🏆 '+wins+'</div>':'<div class="lose">🚫 không ai thắng</div>')+'</div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // Bầu Cua
  const bc=STATE.bcHistory||[];
  document.getElementById('bcHist').innerHTML = bc.length? bc.map(g=>{
    const bets=(g.bets||[]).map(b=>esc(b.name)+': '+b.amount.toLocaleString()+' '+(b.emoji||b.mascot||'')).join(' • ')||'không ai đặt';
    const wins=(g.winners||[]).map(w=>esc(w.name)+' +'+w.amount.toLocaleString()).join(' • ');
    return '<div class="h"><div class="top"><span>Phiên #'+padId(g.gameId)+' — '+(g.resultEmoji||'')+' ('+esc(g.result||'')+')</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">📝 '+bets+'</div>'+(wins?'<div class="win">🏆 '+wins+'</div>':'<div class="lose">🚫 nhà cái húp sạch</div>')+'</div>';
  }).join('') : '<div class="empty">Chưa có phiên nào.</div>';
  // Dò Mìn
  const mn=STATE.minesHistory||[];
  document.getElementById('mineHist').innerHTML = mn.length? mn.map(g=>{
    const win=g.amount>=0;
    return '<div class="h"><div class="top"><span>'+esc(g.name)+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">💣 '+g.mines+' mìn · 💎 '+(g.diamonds||0)+' kim cương · cược '+Number(g.bet).toLocaleString()+'</div>'+
      '<div class="'+(win?'win':'lose')+'">'+(win?'✅':'💥')+' '+esc(g.result)+' '+fmtAmt(g.amount)+' Dogcoin</div></div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
}
function pSet(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/set',{userId:id,amount:+v}).then(()=>{toast('✅ Đã set');refresh();});}
function pAdd(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/add',{userId:id,amount:+v}).then(()=>{toast('✅ Đã cộng');refresh();});}
function pSub(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/subtract',{userId:id,amount:+v}).then(()=>{toast('✅ Đã trừ (đã rút Dogcoin)');refresh();}).catch(()=>toast('❌ Lỗi'));}

function wdStart(){const c=document.getElementById('wdChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/withdraw/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bảng rút ở #'+j.name);refresh();});}
async function wdStop(){if(!await uiConfirm('Tắt bảng Rút Dogcoin?','Tắt','btn-red'))return;api('/api/withdraw/stop',{}).then(()=>{toast('⏹️ Đã tắt');refresh();});}
// Giao TỰ ĐỘNG qua dashboard Palworld (không cần admin vào game). Người chơi phải
// đang online và đã liên kết nhân vật ở tab Palworld.
async function wdDeliver(id){
  if(!await uiConfirm('Bot sẽ tự đưa Dog Coin vào game cho người này. Tiếp tục?','🎮 Giao ngay','btn-blue'))return;
  toast('⏳ Đang đưa vào game, chờ vài giây...');
  try{
    const j=await api('/api/withdraw/deliver',{id});
    toast('✅ Đã giao cho '+(j.ingameName||'nhân vật'));
    refresh();
  }catch(e){refresh();}
}
async function wdApprove(id){if(!await uiConfirm('Đánh dấu yêu cầu này ĐÃ xử lý xong? (dùng khi bạn tự đưa Dog Coin trong game)','✅ Đánh dấu xong','btn-green'))return;api('/api/withdraw/approve',{id}).then(()=>{toast('✅ Đã duyệt');refresh();});}
async function wdReject(id){if(!await uiConfirm('Từ chối và HOÀN LẠI Dogcoin cho người chơi?','❌ Từ chối','btn-red'))return;api('/api/withdraw/reject',{id}).then(()=>{toast('↩️ Đã từ chối + hoàn Dogcoin');refresh();});}

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
  const p=document.getElementById('wdPending');
  p.innerHTML=pending.length?pending.map(r=>
    '<div class="wd-row"><div class="info">'+
      '<span class="amt">'+esc(r.username)+' — <b>'+r.amount.toLocaleString()+' Dogcoin</b></span>'+
      '<span class="meta">Mã #'+r.id+' · '+esc(r.time||'')+
        (r.lastError?' · <span style="color:var(--red)">'+esc(r.lastError)+'</span>':'')+'</span>'+
    '</div><div class="acts">'+
      '<button class="btn-blue" onclick="wdDeliver('+r.id+')">🎮 Giao ngay</button>'+
      '<button class="btn-green" onclick="wdApprove('+r.id+')">✅ Đánh dấu xong</button>'+
      '<button class="btn-red" onclick="wdReject('+r.id+')">❌ Từ chối</button>'+
    '</div></div>'
  ).join(''):'<div class="empty" style="color:var(--mut);font-size:13px;padding:8px 2px">Không có yêu cầu nào đang chờ.</div>';
  // lịch sử đã xử lý
  const d=document.getElementById('wdDone');
  d.innerHTML=done.length?done.slice(0,30).map(r=>
    '<div class="h"><div class="top"><span>#'+r.id+' '+esc(r.username)+' — '+r.amount.toLocaleString()+' Dogcoin</span><span class="t">'+esc(r.time||'')+'</span></div>'+
    '<div class="'+(r.status==='approved'?'win':'lose')+'">'+(r.status==='approved'?'✅ Đã duyệt (đã đưa Dog Coin trong game)':'❌ Đã từ chối (đã hoàn Dogcoin)')+'</div></div>'
  ).join(''):'<div class="empty">Chưa xử lý yêu cầu nào.</div>';
  // prefill channel id
  const wc=document.getElementById('wdChannel'); if(wc&&!wc.value&&STATE.withdraw&&STATE.withdraw.channelId) wc.value=STATE.withdraw.channelId;
}
async function pDel(id){
  const p=(STATE&&STATE.players||[]).find(x=>x.id===id);
  const who=p?(p.name+' — '+p.points.toLocaleString()+' Dogcoin'):id;
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

function fmtTime(target){
  const left=target-Math.floor(Date.now()/1000);
  if(left<=0)return 'đang mở bát...';
  return 'mở bát sau '+left+'s';
}

function setConn(ok){
  const dot=document.getElementById('connDot'), txt=document.getElementById('connText');
  if(ok){dot.classList.remove('down');txt.style.color='var(--green)';txt.textContent='Online · cập nhật '+new Date().toLocaleTimeString('vi-VN');}
  else{dot.classList.add('down');txt.style.color='var(--red)';txt.textContent='🔴 MẤT KẾT NỐI — bot có thể đã sập';}
}

async function refresh(){
  let j;
  try{j=await api('/api/state');}catch(e){ if(e.message!=='401') setConn(false); return; }
  setConn(true);
  STATE=j.state;
  mascotOptions();
  bcPreview();
  // status line
  document.getElementById('statusLine').textContent='TX #'+padId(STATE.tx.gameId)+' • BC #'+padId(STATE.bc.gameId)+' • '+STATE.players.length+' người chơi';
  // prefill channel id (chỉ khi ô đang trống, không đè lúc admin đang gõ)
  const txC=document.getElementById('txChannel'); if(txC&&!txC.value&&STATE.tx.channelId) txC.value=STATE.tx.channelId;
  const bcC=document.getElementById('bcChannel'); if(bcC&&!bcC.value&&STATE.bc.channelId) bcC.value=STATE.bc.channelId;
  // tx info
  const txRun=STATE.tx.live&&STATE.tx.status!=='stopped';
  const bcRun=STATE.bc.live&&STATE.bc.status!=='stopped';
  document.getElementById('txInfo').innerHTML='<span class="run '+(txRun?'on':'off')+'">'+(txRun?'🟢 ĐANG CHẠY':'🔴 ĐÃ TẮT')+'</span> &nbsp; Game #'+padId(STATE.tx.gameId)+' • <span class="badge '+(STATE.tx.status==='betting'?'on':'off')+'">'+STATE.tx.status+'</span> • '+fmtTime(STATE.tx.targetTime)+' • '+STATE.tx.betsCount+' cược'+(STATE.tx.forced?' • <span class="badge on">ĐANG ÉP: '+STATE.tx.forced+'</span>':'');
  document.getElementById('bcInfo').innerHTML='<span class="run '+(bcRun?'on':'off')+'">'+(bcRun?'🟢 ĐANG CHẠY':'🔴 ĐÃ TẮT')+'</span> &nbsp; Phiên #'+padId(STATE.bc.gameId)+' • <span class="badge '+(STATE.bc.status==='betting'?'on':'off')+'">'+STATE.bc.status+'</span> • '+fmtTime(STATE.bc.targetTime)+' • '+STATE.bc.betsCount+' cược'+(STATE.bc.forced?' • <span class="badge on">ĐANG ÉP: '+STATE.bc.forced+'</span>':'');
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
