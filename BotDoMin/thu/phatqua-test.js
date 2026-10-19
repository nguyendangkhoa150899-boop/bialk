// Test tab Phat qua tren may Windows: chay panel.js THAT voi ctx gia + panel GM gia (gmCall), thuongpho.js THAT ghi .tpin vao thu muc tam.
// Chay (tu BotDoMin): node thu/phatqua-test.js   (khong dung toi VPS / game / Discord; KEEP=1 de giu server chay)
const path = require('path'), fs = require('fs'), os = require('os');
const D = path.join(__dirname, '..') + path.sep;
const ROOT = path.join(__dirname, '.pqtest-root');   // thu muc tam, xoa o dau moi lan chay
fs.rmSync(ROOT, { recursive: true, force: true });
process.env.TLBB_ROOT = ROOT;
process.env.PANEL_MOD_MO = '0';

// panel GM gia: ghi lai moi lenh /api/act
const ACT = [];
const CHARS = [
  { guid: '1010100017', name: 'bialk', account: 'bialk', level: 103, online: true, pending: [] },
  { guid: '1010100020', name: 'KimJongUn', account: 'hoang01', level: 109, online: false, pending: ['Hồn Băng Châu x3'] },
  { guid: '1010100099', name: 'ChuaCoVi', account: 'test9', level: 50, online: true, pending: [] },
  { guid: '1010100098', name: 'ChiCoClone', account: 'test8', level: 60, online: false, pending: [] },
];
const tlbbPath = require.resolve(D + 'tlbb.js');
require.cache[tlbbPath] = { id: tlbbPath, filename: tlbbPath, loaded: true, exports: { gmCall: async (m, p, f) => {
  if (m === 'GET' && p === '/api/state') return { ok: true, state: { online: 2, chars: CHARS } };   // dung dang that: boc trong state
  if (m === 'POST' && p === '/api/act') {
    if (f.gt === '7777') await new Promise(r => setTimeout(r, 600));   // gia lap panel GM cham (test khoa chong gui 2 lan)
    ACT.push(f); return { ok: true, msg: 'Da xep hang qua cho GUID ' + f.guid + ': ' + f.loai + ' ' + f.gt, done: true };
  }
  if (m === 'GET' && p === '/api/pets') return { ok: true, groups: [{ pets: [{ id: 25351, name: 'Tần Vương' }] }] };
  return { ok: false, error: 'gia: ' + p };
} } };

const db = {
  '456136500011335698': { name: 'BiaLK', tlbbGuid: '1010100017', points: 1000, ingameName: 'bialk' },
  '991792167830536': { name: 'KimJongUn (clone)', tlbbGuid: '1010100020', points: 0 },
  '991792167830999': { name: 'ChiCoClone (clone)', tlbbGuid: '1010100098', points: 0, clone: true },
};
const LOG = [];
const getUserData = (uid) => (db[uid] = db[uid] || { points: 0 });
const ITEMS = [{ id: '20309101', n: 'Hồn Băng Châu [1 cấp]' }, { id: '10156108', n: 'Ngự Dao Bàn' }];
const ichKy = {};
const TP = require(D + 'thuongpho.js')({ db: () => db, getUserData, saveDbNow: () => {}, writeLog: (a, b) => LOG.push(b), icon: () => null, items: () => ITEMS, ichKyAdd: () => {} });
const ctx = {
  port: 18508, publicPort: 18234, password: 'mod', superPassword: 'sup',
  getDb: () => db, getUserData, saveDbNow: () => {}, writeLog: (a, b) => LOG.push(b),
  updatePoints: (uid, n) => { getUserData(uid).points = (getUserData(uid).points || 0) + n; },
  logDog: () => {}, gameItems: () => ITEMS,
  adminIchKyGrant: (uid, id, n) => { if (!db[uid]) return { error: 'khong co vi' }; (ichKy[uid] = ichKy[uid] || {})[id] = (ichKy[uid][id] || 0) + n; return { ok: true }; },
  tpAdminGui: (g, id, n, who, khongLuu) => TP.adminGui(g, id, n, who, khongLuu),
};
require(D + "panel.js").startPanel(ctx);

const B = 'http://127.0.0.1:' + ctx.port;
let H = { 'Content-Type': 'application/json' };
const post = async (p, b) => { const r = await fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const chk = (ten, dk, them) => { console.log((dk ? 'OK  ' : 'LOI ') + ten + (them ? ' | ' + them : '')); if (!dk) process.exitCode = 1; };
if (process.env.KEEP) { console.log("PREVIEW http://127.0.0.1:" + ctx.port + "  (mat khau SUPER: sup)"); } else (async () => {
  await new Promise(r => setTimeout(r, 400));
  const html = await (await fetch(B + '/')).text();
  chk('trang chu co tab pq + /pq.js', html.includes('data-tab="pq"') && html.includes('/pq.js'));
  const js = await (await fetch(B + '/pq.js')).text();
  chk('/pq.js phuc vu duoc', js.includes('window.pqLoad'));
  const lg = await post('/api/login', { password: 'sup' }); H.Authorization = 'Bearer ' + lg.j.token;
  chk('dang nhap SUPER', !!lg.j.token);
  let r = await post('/api/pq/data');
  chk('/api/pq/data', r.j.ok && r.j.chars.length === 4 && r.j.chars[0].vi.length === 1 && r.j.chars[2].vi.length === 0 && r.j.chars[3].vi[0].clone === true, JSON.stringify(r.j.chars.map(c => c.ten + ':' + c.vi.length)));
  r = await post('/api/pq/gui', { nguoi: ['1010100017', '1010100020'], loai: 'item', gt: '20309101', sl: 5, kenh: 'map' });
  chk('map: 2 nhan vat qua panel GM a=qua', r.j.okN === 2 && ACT.length === 2 && ACT[0].a === 'qua' && ACT[0].sl === '5', JSON.stringify(ACT));
  r = await post('/api/pq/gui', { nguoi: ['1010100099'], loai: 'item', gt: '10156108', sl: 12, kenh: 'npc' });
  const tp = path.join(ROOT, 'home/tlbb/Server/txt/NetCo4Web/1010100099.tpin');
  const dong = fs.existsSync(tp) ? fs.readFileSync(tp, 'latin1').trim().split('\n') : [];
  chk('npc: trang bi ghi .tpin theo GUID (khong can vi)', r.j.okN === 1 && dong.length >= 1 && /^a\w+ 10156108 \d+ 0 1 \d+$/.test(dong[0]), dong.join(' / '));
  chk('npc: tong so luong dung 12', dong.reduce((t, l) => t + Number(l.split(' ')[2]), 0) === 12);
  r = await post('/api/pq/gui', { nguoi: ['1010100099'], loai: 'item', gt: '20309101', sl: 1, kenh: 'npc' });
  chk('npc: chan mon ngoai danh sach Thuong Pho (khong phai trang bi)', r.j.okN === 0 && /không đi kênh NPC/.test(r.j.kq[0].msg), r.j.kq[0].msg);
  r = await post('/api/pq/gui', { nguoi: ['1010100099'], loai: 'item', gt: '10156108', sl: 101, kenh: 'npc' });
  chk('npc: chan qua 100 o tui', r.j.okN === 0 && /100 ô/.test(r.j.kq[0].msg), r.j.kq[0].msg);
  r = await post('/api/pq/gui', { nguoi: ['1010100098'], loai: 'item', gt: '10156108', sl: 1, kenh: 'ruong' });
  chk('ruong: chan vi clone', r.j.okN === 0 && /clone/.test(r.j.kq[0].msg), r.j.kq[0].msg);
  r = await post('/api/pq/gui', { nguoi: ['1010100017'], loai: 'xoa', gt: '20309101', sl: 3, kenh: 'map' });
  chk('xoa vat pham: qua panel GM a=qua loai=xoa', r.j.okN === 1 && ACT[ACT.length - 1].loai === 'xoa' && ACT[ACT.length - 1].sl === '3');
  const [p1, p2] = await Promise.all([post('/api/pq/gui', { nguoi: ['1010100017'], loai: 'knb', gt: '7777', kenh: 'map' }),
    new Promise(r => setTimeout(r, 150)).then(() => post('/api/pq/gui', { nguoi: ['1010100017'], loai: 'knb', gt: '7777', kenh: 'map' }))]);
  chk('khoa chong gui 2 lan (lan 2 -> 409)', p1.j.okN === 1 && p2.st === 409, 'HTTP ' + p1.st + ' / ' + p2.st);
  r = await post('/api/pq/gui', { nguoi: ['1010100017'], loai: 'knb', gt: '1', kenh: 'map' });
  chk('khoa duoc mo lai sau khi xong', r.j.okN === 1);
  r = await post('/api/pq/gui', { nguoi: ['1010100020', '1010100099'], loai: 'item', gt: '10156108', sl: 1, kenh: 'ruong' });
  chk('ruong: co vi -> OK, chua vi -> loi', r.j.okN === 1 && ichKy['991792167830536']['10156108'] === 1 && /Chưa liên kết ví/.test(r.j.kq[1].msg), JSON.stringify(r.j.kq));
  r = await post('/api/pq/gui', { nguoi: 'all', loai: 'knbweb', gt: 500, kenh: 'map' });
  chk('knbweb: cong vi lien ket, bo qua nhan vat chua vi', r.j.okN === 2 && db['456136500011335698'].points === 1500, JSON.stringify(r.j.kq.map(x => x.ok)));
  r = await post('/api/pq/gui', { nguoi: 'online', loai: 'knb', gt: 1000, kenh: 'map' });
  chk('online: chi 2 nhan vat online', r.j.okN === 2 && ACT.slice(-2).every(a => a.loai === 'knb'));
  r = await post('/api/pq/gui', { nguoi: ['1010100017'], loai: 'knb', gt: 1000, kenh: 'npc' });
  chk('chan: KNB khong di qua NPC', r.st === 400, r.j.error);
  r = await post('/api/pq/gui', { nguoi: ['1010100017'], loai: 'item', gt: '99999999', sl: 1, kenh: 'npc' });
  chk('chan: ID khong co trong danh muc', r.st === 400, r.j.error);
  r = await post('/api/pq/gui', { nguoi: [], loai: 'item', gt: '20309101', sl: 1, kenh: 'map' });
  chk('chan: chua chon nguoi', r.st === 400, r.j.error);
  // cong mod khong goi duoc
  const rm = await fetch('http://127.0.0.1:' + ctx.publicPort + '/api/pq/data', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: '{}' });
  chk('cong mod bi chan', rm.status === 401 || rm.status === 403, 'HTTP ' + rm.status);
  chk('nhat ky ghi [PHÁT QUÀ]', LOG.some(l => l.startsWith('[PHÁT QUÀ]')), LOG.filter(l => /PHÁT QUÀ/.test(l)).length + ' dong');
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('LOI', e); process.exit(1); });
