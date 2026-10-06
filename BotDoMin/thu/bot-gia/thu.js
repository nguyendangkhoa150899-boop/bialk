// 06/10: CHAY THU BOT voi discord.js GIA (chay.js): bot tuong da vao Discord -> mo 3 web server o cong 13002/11508/11234 -> goi thu trang + API.
// Cach dung: chep repo ra thu muc tam, npm i trong BotDoMin cua ban sao, roi: node BotDoMin/thu/bot-gia/thu.js "<ban sao>/BotDoMin"
// Bat bot gia (chay.js) roi goi thu: trang nguoi choi, /tp.js, panel SUPER (dang nhap) + /api/state, cac API pal phai 404/khong con.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const SP = __dirname;
const DIR = process.argv[2];   // ban SAO cua BotDoMin (co node_modules) - khong chay thang trong repo (se tao database.json)
if (!DIR) { console.error('Dung: node thu.js <ban sao BotDoMin>'); process.exit(2); }
const env = { ...process.env, TOKEN: 'gia', PLAY_PORT: '13002', PANEL_PORT: '11508', PANEL_PUBLIC_PORT: '11234', PANEL_SUPER_PASSWORD: 'thu-123', PANEL_PASSWORD: 'thu-mod', TLBB_ROOT: process.env.TLBB_ROOT || path.join(require('os').tmpdir(), 'tlbb-root-gia'), NODE_ENV: 'test' };
const p = spawn(process.execPath, [path.join(SP, 'chay.js'), DIR], { env, cwd: DIR });
let log = '';
p.stdout.on('data', (d) => { log += d; }); p.stderr.on('data', (d) => { log += d; });
function goi(port, method, url, body, token) {
  return new Promise((ok) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': data.length } : {}) } }, (res) => {
      const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => ok({ st: res.statusCode, body: Buffer.concat(c).toString('utf8') }));
    });
    r.on('error', (e) => ok({ st: 'ERR ' + e.code, body: '' })); if (data) r.write(data); r.end();
  });
}
const cho = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await cho(9000);
  const kq = [];
  const a = await goi(13002, 'GET', '/'); kq.push(['web /', a.st, a.body.length + 'B', /navTp/.test(a.body) && !/navPal|pagePal|pcModal/.test(a.body) ? 'khong con pal, co Thuong Pho' : 'KIEM LAI']);
  const b = await goi(13002, 'GET', '/tp.js'); kq.push(['web /tp.js', b.st, b.body.length + 'B']);
  for (const u of ['/api/palwheel/state', '/api/profile', '/api/pal/cd']) { const r = await goi(13002, 'GET', u); kq.push(['web ' + u, r.st, r.body.slice(0, 60)]); }
  const lg = await goi(11508, 'POST', '/api/login', { password: 'thu-123' });
  let tok = ''; try { tok = JSON.parse(lg.body).token; } catch (e) { }
  kq.push(['panel login', lg.st, tok ? 'co token' : lg.body.slice(0, 80)]);
  const pg = await goi(11508, 'GET', '/'); kq.push(['panel /', pg.st, pg.body.length + 'B', /gs_pal|palWheelCfg|renderPalChests/.test(pg.body) ? 'CON PAL!' : 'khong con pal']);
  for (const u of ['/api/state', '/api/users', '/api/tuiboss/cfg', '/api/gn/cfg', '/api/pot/cfg', '/api/itemshop']) { const r = await goi(11508, 'GET', u, null, tok); let ok = ''; try { ok = JSON.parse(r.body).ok; } catch (e) { ok = 'khong JSON'; } kq.push(['panel ' + u, r.st, 'ok=' + ok, r.st >= 400 ? r.body.slice(0, 80) : '']); }
  for (const u of ['/api/palwheel/cfg', '/api/rescue/point', '/api/gacha/channel']) { const r = await goi(11508, 'POST', u, {}, tok); kq.push(['panel ' + u + ' (da go)', r.st, r.body.slice(0, 60)]); }
  for (const k of kq) console.log(k.join(' | '));
  p.kill();
  await cho(500);
  const loi = log.split('\n').filter((l) => /!!!|Error|ReferenceError|TypeError|is not defined|LỖI/.test(l));
  console.log('\n--- dong log loi (' + loi.length + '):'); console.log(loi.slice(0, 25).join('\n'));
  console.log('\n--- 15 dong log dau:'); console.log(log.split('\n').slice(0, 15).join('\n'));
})();
