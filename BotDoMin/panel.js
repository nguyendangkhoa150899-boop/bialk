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

    const isAuthed = (req) => {
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
            players: buildPlayers(),
            mascots: ctx.mascots.map(m => ({ id: m.id, name: m.name, emoji: m.emoji })),
            txHistory: ctx.getTX().history || [],
            bcHistory: ctx.getBC().history || [],
            minesHistory: ctx.getMinesHistory ? ctx.getMinesHistory() : [],
            savedChannels: db._savedChannels || [],
        };
    };

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;

            // Trang chủ
            if (req.method === 'GET' && path === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(HTML);
            }

            // Đăng nhập
            if (req.method === 'POST' && path === '/api/login') {
                const body = await readBody(req);
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

                const body = req.method === 'POST' ? await readBody(req) : {};

                // ---- TÀI XỈU ----
                if (path === '/api/tx/force') {
                    const vals = String(body.values || '').trim();
                    const parts = vals.split(',').map(s => parseInt(s.trim()));
                    if (parts.length !== 3 || parts.some(n => isNaN(n) || n < 1 || n > 6)) {
                        return sendJSON(res, 400, { ok: false, error: 'Cần 3 số xúc xắc 1-6, vd: 6,5,4' });
                    }
                    ctx.getTX().forcedResult = parts.join(',');
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Ép kết quả Lớn Nhỏ ván tới: ${parts.join(',')}`);
                    return sendJSON(res, 200, { ok: true });
                }
                if (path === '/api/tx/clear') {
                    ctx.getTX().forcedResult = null;
                    ctx.writeLog('ADMIN', `[PANEL ÉP TX] Hủy ép kết quả Lớn Nhỏ`);
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
                        ctx.writeLog('ADMIN', `[PANEL] Khởi tạo Lớn Nhỏ tại #${name}`);
                        return sendJSON(res, 200, { ok: true, name });
                    } catch (e) { return sendJSON(res, 400, { ok: false, error: 'Không gửi được vào kênh này (sai ID hoặc bot thiếu quyền)' }); }
                }
                if (path === '/api/tx/stop') {
                    ctx.stopTX();
                    ctx.writeLog('ADMIN', `[PANEL] Dừng Lớn Nhỏ`);
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
                    ctx.writeLog('ADMIN', `[PANEL ĐIỂM] Cộng ${amount} cho ${uid}`);
                    return sendJSON(res, 200, { ok: true });
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
  .wrap{max-width:840px;margin:0 auto;padding:16px}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .tabs button{background:var(--card);color:var(--mut)}
  .tabs button.active{background:var(--blue);color:#fff}
  .card{background:var(--card);border-radius:14px;padding:18px;margin-bottom:16px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .row>div{flex:1;min-width:90px}
  label{font-size:13px;color:var(--mut)}
  .badge{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:600;background:var(--card2)}
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
  #toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:10px 18px;border-radius:8px;opacity:0;transition:.25s;pointer-events:none;z-index:60}
  #toast.show{opacity:1}
  .flist{margin-top:10px}
  .flist .item{display:flex;justify-content:space-between;align-items:center;background:var(--card2);padding:8px 12px;border-radius:8px;margin-top:6px;font-size:13px}
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
    <div class="dot"></div>
    <strong>Bảng Điều Khiển Casino</strong>
    <span id="statusLine" class="muted" style="margin-left:auto;font-size:13px"></span>
  </header>

  <div class="wrap">
    <div class="tabs">
      <button data-tab="tx" class="active" onclick="tab('tx')">🎲 Lớn Nhỏ</button>
      <button data-tab="bc" onclick="tab('bc')">🦀 Bầu Cua</button>
      <button data-tab="mine" onclick="tab('mine')">💎 Dò Mìn</button>
      <button data-tab="user" onclick="tab('user')">👥 Người chơi</button>
    </div>

    <!-- TÀI XỈU -->
    <div id="tab-tx">
      <div class="card">
        <h3>🎛️ Điều khiển bàn Lớn Nhỏ</h3>
        <label>Channel ID (kênh đăng bàn chơi)</label>
        <input id="txChannel" placeholder="vd: 123456789012345678">
        <div class="chips" id="txSaved"></div>
        <div class="row" style="margin-top:8px">
          <div style="flex:2"><input id="txSaveId" placeholder="Channel ID"></div>
          <div style="flex:3"><input id="txSaveNote" placeholder="Ghi chú (vd: Server A · sảnh chính)"></div>
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
        <h2>🎲 Lớn Nhỏ (Tài Xỉu)</h2>
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
        <h3>📜 Lịch sử Lớn Nhỏ</h3>
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
          <div style="flex:3"><input id="bcSaveNote" placeholder="Ghi chú (vd: Server A · sảnh chính)"></div>
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
          <input type="checkbox" id="mineAny" style="width:auto;margin:0" onchange="renderMineTarget()">
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
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
let TOKEN = localStorage.getItem('panel_token') || '';
let STATE = null;
let mineSel = new Set();

function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}

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
  ['tx','bc','mine','user'].forEach(x=>document.getElementById('tab-'+x).classList.toggle('hidden',x!==t));
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
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
}
function clearGrid(){mineSel.clear();document.querySelectorAll('#mineGrid .tile').forEach((d,i)=>{d.classList.remove('mine');d.textContent=i+1;});document.getElementById('mineCount').textContent=0;}

function setDice(a,b,c){document.getElementById('d1').value=a;document.getElementById('d2').value=b;document.getElementById('d3').value=c;txPreview();}
function txPreview(){
  const a=+document.getElementById('d1').value,b=+document.getElementById('d2').value,c=+document.getElementById('d3').value;
  const sum=a+b+c;const tai=sum>=11;const chan=sum%2===0;
  document.getElementById('txPrev').textContent='Tổng '+sum+' → '+(tai?'11-18 🟢':'3-10 🔴')+' | '+(chan?'CHẴN 🔵':'LẺ 🟣');
}
function txForce(){
  const v=[document.getElementById('d1').value,document.getElementById('d2').value,document.getElementById('d3').value].join(',');
  api('/api/tx/force',{values:v}).then(()=>{toast('⚡ Đã ép Lớn Nhỏ: '+v);refresh();});
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
function txStop(){if(!confirm('Tắt bàn Lớn Nhỏ?'))return;api('/api/tx/stop',{}).then(()=>{toast('⏹️ Đã tắt bàn Lớn Nhỏ');refresh();});}
function bcStart(){const c=document.getElementById('bcChannel').value.trim();if(!c)return toast('Nhập Channel ID');api('/api/bc/start',{channelId:c}).then(j=>{toast('▶️ Đã tạo bàn ở #'+j.name);refresh();});}
function bcStop(){if(!confirm('Tắt bàn Bầu Cua?'))return;api('/api/bc/stop',{}).then(()=>{toast('⏹️ Đã tắt bàn Bầu Cua');refresh();});}
function chatDelete(inputId){const c=document.getElementById(inputId).value.trim();if(!c)return toast('Nhập Channel ID');if(!confirm('Xóa tin nhắn của bot trong kênh này?'))return;api('/api/chat/delete',{channelId:c}).then(j=>{toast('🧹 Đã xóa '+j.count+' tin nhắn');});}

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
function delChannel(id){if(!confirm('Xóa kênh đã lưu này?'))return;api('/api/channels/delete',{channelId:id}).then(()=>{toast('Đã xóa');refresh();});}
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
  const q=(document.getElementById('search').value||'').toLowerCase();
  const tb=document.getElementById('playerBody');tb.innerHTML='';
  STATE.players.filter(p=>p.name.toLowerCase().includes(q)||p.id.includes(q)).forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+esc(p.name)+'</td><td class="muted" style="font-size:12px">'+p.id+'</td><td><b>'+p.points.toLocaleString()+'</b></td>'+
      '<td><input class="mini-in" type="number" placeholder="số" id="amt_'+p.id+'">'+
      ' <button class="mini btn-blue" onclick="pSet(\\''+p.id+'\\')">Set</button>'+
      ' <button class="mini btn-green" onclick="pAdd(\\''+p.id+'\\')">Cộng</button></td>';
    tb.appendChild(tr);
  });
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function fmtAmt(n){return (n>0?'+':'')+Number(n).toLocaleString();}

function renderHistories(){
  if(!STATE)return;
  // Lớn Nhỏ
  const tx=STATE.txHistory||[];
  document.getElementById('txHist').innerHTML = tx.length? tx.map(g=>{
    const bets=(g.bets||[]).map(b=>esc(b.name)+': '+b.amount.toLocaleString()+' ('+b.choice+')').join(' • ')||'không ai đặt';
    const wins=(g.winners||[]).map(w=>esc(w.name)+' +'+w.amount.toLocaleString()).join(' • ');
    return '<div class="h"><div class="top"><span>Game #'+g.gameId+' — 🎲 '+g.dice.join('-')+' (Tổng '+g.sum+') · '+g.tx+' | '+g.cl+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">📝 '+bets+'</div>'+(wins?'<div class="win">🏆 '+wins+'</div>':'<div class="lose">🚫 không ai thắng</div>')+'</div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
  // Bầu Cua
  const bc=STATE.bcHistory||[];
  document.getElementById('bcHist').innerHTML = bc.length? bc.map(g=>{
    const bets=(g.bets||[]).map(b=>esc(b.name)+': '+b.amount.toLocaleString()+' '+(b.emoji||b.mascot||'')).join(' • ')||'không ai đặt';
    const wins=(g.winners||[]).map(w=>esc(w.name)+' +'+w.amount.toLocaleString()).join(' • ');
    return '<div class="h"><div class="top"><span>Phiên #'+g.gameId+' — '+(g.resultEmoji||'')+' ('+esc(g.result||'')+')</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">📝 '+bets+'</div>'+(wins?'<div class="win">🏆 '+wins+'</div>':'<div class="lose">🚫 nhà cái húp sạch</div>')+'</div>';
  }).join('') : '<div class="empty">Chưa có phiên nào.</div>';
  // Dò Mìn
  const mn=STATE.minesHistory||[];
  document.getElementById('mineHist').innerHTML = mn.length? mn.map(g=>{
    const win=g.amount>=0;
    return '<div class="h"><div class="top"><span>'+esc(g.name)+'</span><span class="t">'+(g.time||'')+'</span></div>'+
      '<div class="b">💣 '+g.mines+' mìn · 💎 '+(g.diamonds||0)+' kim cương · cược '+Number(g.bet).toLocaleString()+'</div>'+
      '<div class="'+(win?'win':'lose')+'">'+(win?'✅':'💥')+' '+esc(g.result)+' '+fmtAmt(g.amount)+' point</div></div>';
  }).join('') : '<div class="empty">Chưa có ván nào.</div>';
}
function pSet(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/set',{userId:id,amount:+v}).then(()=>{toast('✅ Đã set');refresh();});}
function pAdd(id){const v=document.getElementById('amt_'+id).value;if(v==='')return toast('Nhập số');api('/api/points/add',{userId:id,amount:+v}).then(()=>{toast('✅ Đã cộng');refresh();});}
function setAll(){const v=document.getElementById('setAllAmount').value;if(v==='')return toast('Nhập số');if(!confirm('Set TẤT CẢ người chơi về '+(+v).toLocaleString()+' điểm?'))return;api('/api/points/setall',{amount:+v}).then(j=>{toast('✅ Đã set '+j.count+' người');refresh();});}

function fmtTime(target){
  const left=target-Math.floor(Date.now()/1000);
  if(left<=0)return 'đang mở bát...';
  return 'mở bát sau '+left+'s';
}

async function refresh(){
  let j;
  try{j=await api('/api/state');}catch(e){return;}
  STATE=j.state;
  mascotOptions();
  bcPreview();
  // status line
  document.getElementById('statusLine').textContent='TX #'+STATE.tx.gameId+' • BC #'+STATE.bc.gameId+' • '+STATE.players.length+' người chơi';
  // prefill channel id (chỉ khi ô đang trống, không đè lúc admin đang gõ)
  const txC=document.getElementById('txChannel'); if(txC&&!txC.value&&STATE.tx.channelId) txC.value=STATE.tx.channelId;
  const bcC=document.getElementById('bcChannel'); if(bcC&&!bcC.value&&STATE.bc.channelId) bcC.value=STATE.bc.channelId;
  // tx info
  document.getElementById('txInfo').innerHTML='Game #'+STATE.tx.gameId+' • <span class="badge '+(STATE.tx.status==='betting'?'on':'off')+'">'+STATE.tx.status+'</span> • '+fmtTime(STATE.tx.targetTime)+' • '+STATE.tx.betsCount+' cược'+(STATE.tx.forced?' • <span class="badge on">ĐANG ÉP: '+STATE.tx.forced+'</span>':'');
  document.getElementById('bcInfo').innerHTML='Phiên #'+STATE.bc.gameId+' • <span class="badge '+(STATE.bc.status==='betting'?'on':'off')+'">'+STATE.bc.status+'</span> • '+fmtTime(STATE.bc.targetTime)+' • '+STATE.bc.betsCount+' cược'+(STATE.bc.forced?' • <span class="badge on">ĐANG ÉP: '+STATE.bc.forced+'</span>':'');
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
  // lịch sử các trò
  renderHistories();
  // kênh đã lưu
  renderSavedChannels();
}
function mineClear(k){api('/api/mines/clear',{key:k}).then(()=>{toast('Đã xóa ép mìn');refresh();});}

// auto-login nếu có token
document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
if(TOKEN){ fetch('/api/state',{headers:{'Authorization':'Bearer '+TOKEN}}).then(r=>{if(r.ok)showApp();else logout();}).catch(()=>logout()); }
</script>
</body>
</html>`;

module.exports = { startPanel };
