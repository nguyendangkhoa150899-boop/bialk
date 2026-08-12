// ===== CỔNG WEB CƯỢC CHO NGƯỜI CHƠI (Tài Xỉu) =====
// Chạy CỔNG RIÊNG (mặc định 3002), tách hẳn panel admin 3001.
// Đăng nhập: Discord ID + mã PIN (bot phát PIN qua nút 🌐 trên bảng Tài Xỉu).
// Cược đặt ở đây đi thẳng vào txState của bot -> hiện trên bảng Discord như thường,
// không dính deadline 3 giây / rate limit của Discord nên không có vụ "bot không phản hồi".
const http = require('http');
const crypto = require('crypto');

function startWebPlay(ctx) {
    const PORT = ctx.port || 3002;

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
                // dọn phiên cũ
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
                    const totals = { tai: 0, xiu: 0, chan: 0, le: 0 };
                    const my = [];
                    for (const b of (tx.bets || [])) {
                        totals[b.choice] = (totals[b.choice] || 0) + b.amount;
                        if (b.userId === userId) my.push({ choice: b.choice, amount: b.amount });
                    }
                    return sendJSON(res, 200, {
                        ok: true,
                        balance: me.points || 0,
                        live: !!tx.message && tx.status !== 'stopped',
                        status: tx.status,
                        gameId: tx.gameId,
                        targetTime: tx.targetTime,
                        totals,
                        myBets: my,
                        history: (tx.history || []).slice(0, 15).map(h => ({ gameId: h.gameId, dice: h.dice, sum: h.sum, tx: h.tx, cl: h.cl })),
                    });
                }

                if (req.method === 'POST' && path === '/api/bet') {
                    const body = await readBody(req);
                    const tx = ctx.getTX();
                    const choice = String(body.choice || '');
                    const amount = Math.floor(Number(body.amount));
                    if (!['tai', 'xiu', 'chan', 'le'].includes(choice)) return sendJSON(res, 400, { ok: false, error: 'Cửa không hợp lệ' });
                    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { ok: false, error: 'Số tiền không hợp lệ' });
                    if (!tx.message || tx.status !== 'betting') return sendJSON(res, 400, { ok: false, error: 'Phiên đặt cược đã đóng, chờ ván sau!' });
                    const me = ctx.getUserData(userId);
                    if ((me.points || 0) < amount) return sendJSON(res, 400, { ok: false, error: 'Không đủ Dogcoin! Số dư: ' + (me.points || 0).toLocaleString() });
                    ctx.updatePoints(userId, -amount);
                    tx.bets.push({ userId, username: me.name || ('web_' + userId.slice(-4)), choice, amount });
                    tx.needsUpdate = true; // bảng Discord tự vẽ lại trong 1 giây
                    ctx.writeLog('BET', `[WEB CƯỢC TX] ${me.name || userId} đặt ${amount} vào ${choice} (ván #${tx.gameId})`);
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
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">',
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
    '.cbtn{padding:16px 0;font-size:17px;background:#232735;border:2px solid var(--line)}',
    '.cbtn.sel{border-color:var(--gold);background:#2c2f1e}',
    '.chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.chip{flex:1;background:#232735;padding:9px 0;font-size:13px;min-width:56px}',
    '.bet-btn{width:100%;margin-top:10px;background:var(--green);color:#0c2417;font-size:17px}',
    '.bet-btn:disabled{background:#2a2e3b;color:var(--muted)}',
    '.row{display:flex;justify-content:space-between;align-items:center}',
    '.hist{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}',
    '.dot{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}',
    '.dot.t{background:#173423;color:var(--green)}.dot.x{background:#3a1d1d;color:var(--red)}',
    '#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;padding:10px 18px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90%}',
    '.big{font-size:26px;font-weight:800}',
    '.hidden{display:none}',
    '.mine{font-size:13px;margin-top:6px;color:var(--gold)}',
    '.tag{font-size:11px;background:#232735;border-radius:6px;padding:2px 7px;margin-left:6px;color:var(--muted)}',
    '</style></head><body>',

    '<div id="login" class="card">',
    '<h1>🎲 Tài Xỉu — Cược trên web</h1>',
    '<div class="muted">Nhanh, không lag Discord. Lấy mã PIN bằng nút <b>🌐 Cược trên web</b> ở bảng Tài Xỉu trong Discord.</div>',
    '<input id="uid" inputmode="numeric" placeholder="Discord ID của bạn">',
    '<input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">',
    '<button class="btn-full" onclick="login()">Vào cược</button>',
    '</div>',

    '<div id="app" class="hidden">',
    '<div class="card row"><div><div class="muted">Số dư của <b id="myName"></b></div><div class="big" id="bal">0</div></div><button style="background:#232735" onclick="logout()">Thoát</button></div>',
    '<div class="card">',
    '<div class="row"><h2 id="round">Ván #—</h2><div id="clock" class="big">--</div></div>',
    '<div id="stt" class="muted"></div>',
    '<div class="grid2" style="margin-top:10px">',
    '<button class="cbtn" id="c_tai" onclick="pick(\'tai\')">⚫ TÀI<div class="muted" id="t_tai">0</div></button>',
    '<button class="cbtn" id="c_xiu" onclick="pick(\'xiu\')">⚪ XỈU<div class="muted" id="t_xiu">0</div></button>',
    '<button class="cbtn" id="c_chan" onclick="pick(\'chan\')">🔵 CHẴN<div class="muted" id="t_chan">0</div></button>',
    '<button class="cbtn" id="c_le" onclick="pick(\'le\')">🟣 LẺ<div class="muted" id="t_le">0</div></button>',
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
    '<div class="card"><h2>🕵️ Soi cầu 15 ván</h2><div class="hist" id="hist"></div></div>',
    '</div>',

    '<div id="toast"></div>',
    '<script>',
    'var TOKEN=localStorage.getItem("play_token")||"";var SEL="";var TT=0;var LOCKED=true;',
    'function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2500)}',
    'function api(p,body){return fetch(p,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!j.ok)throw new Error(j.error||("HTTP "+r.status));return j})})}',
    'function login(){var u=document.getElementById("uid").value.trim();var p=document.getElementById("pin").value.trim();if(!u||!p)return toast("Nhập đủ ID + PIN");fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})}).then(function(r){return r.json()}).then(function(j){if(!j.ok)return toast(j.error||"Sai thông tin");TOKEN=j.token;localStorage.setItem("play_token",TOKEN);show(j.name)}).catch(function(){toast("Lỗi mạng")})}',
    'function logout(){TOKEN="";localStorage.removeItem("play_token");location.reload()}',
    'function show(n){document.getElementById("login").classList.add("hidden");document.getElementById("app").classList.remove("hidden");if(n)document.getElementById("myName").textContent=n;refresh();setInterval(refresh,2000);setInterval(tick,250)}',
    'function pick(c){SEL=c;["tai","xiu","chan","le"].forEach(function(x){document.getElementById("c_"+x).classList.toggle("sel",x===c)})}',
    'function addAmt(n){var a=document.getElementById("amt");a.value=(parseInt(a.value||"0")||0)+n}',
    'var BAL=0;function allIn(){document.getElementById("amt").value=BAL}',
    'function tick(){var s=TT-Math.floor(Date.now()/1000);var el=document.getElementById("clock");if(s>5){el.textContent=(s-5)+"s";el.style.color=""}else{el.textContent="🔒";el.style.color="#ff5d5d"}}',
    'function bet(){if(!SEL)return toast("Chọn cửa trước!");var v=parseInt(document.getElementById("amt").value);if(!v||v<=0)return toast("Nhập số Dogcoin");api("/api/bet",{choice:SEL,amount:v}).then(function(j){BAL=j.balance;document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");document.getElementById("amt").value="";toast("💸 Đã đặt "+v.toLocaleString("vi-VN")+" vào "+SEL.toUpperCase());refresh()}).catch(function(e){toast("❌ "+e.message)})}',
    'var NAMES={tai:"TÀI",xiu:"XỈU",chan:"CHẴN",le:"LẺ"};',
    'function refresh(){api("/api/state").then(function(j){',
    'BAL=j.balance;document.getElementById("bal").textContent=j.balance.toLocaleString("vi-VN");',
    'document.getElementById("round").textContent="Ván #"+String(j.gameId).padStart(5,"0");',
    'TT=j.targetTime;LOCKED=(j.status!=="betting")||!j.live;',
    'document.getElementById("betBtn").disabled=LOCKED;',
    'document.getElementById("stt").textContent=j.live?(j.status==="betting"?"🟢 Đang nhận cược (khóa 5 giây cuối)":"🔒 Đã khóa, chờ mở bát..."):"🔴 Bàn Tài Xỉu đang tắt";',
    '["tai","xiu","chan","le"].forEach(function(c){document.getElementById("t_"+c).textContent=(j.totals[c]||0).toLocaleString("vi-VN")});',
    'var m=j.myBets.map(function(b){return NAMES[b.choice]+": "+b.amount.toLocaleString("vi-VN")}).join(" · ");',
    'document.getElementById("mine").textContent=m?("🧾 Ván này bạn đặt — "+m):"";',
    'document.getElementById("hist").innerHTML=j.history.map(function(h){var t=h.tx==="TÀI"||h.tx==="TAI";return \'<div class="dot \'+(t?"t":"x")+\'" title="#\'+h.gameId+\'">\'+h.sum+"</div>"}).join("");',
    '}).catch(function(e){if(String(e.message).indexOf("unauth")>=0)logout()})}',
    'if(TOKEN){show("")}',
    'document.getElementById("pin").addEventListener("keydown",function(e){if(e.key==="Enter")login()});',
    '</script></body></html>',
].join('\n');

module.exports = { startWebPlay };
