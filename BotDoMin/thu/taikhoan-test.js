// Test tab Tai khoan tren may Windows: chay panel.js THAT voi ctx gia + panel GM gia (gmCall), roi chay taikhoan.panel.js THAT
// trong vm voi DOM gia (goi API that cua panel) de kiem ghep tai khoan + nhan vat + vi va 1 thao tac tu giao dien.
// Chay (tu BotDoMin): node thu/taikhoan-test.js   (khong dung toi VPS / game / Discord)
const path = require('path'), fs = require('fs'), vm = require('vm');
const D = path.join(__dirname, '..') + path.sep;
process.env.PANEL_MOD_MO = '0';

// panel GM gia: ghi lai moi lenh /api/act
const ACT = [];
const ACCOUNTS = [
  { id: 1, name: 'admin', online: false, khoa: false }, { id: 2, name: 'bialk', online: true, khoa: false },
  { id: 3, name: 'hoang01', online: false, khoa: false }, { id: 4, name: 'test9', online: true, khoa: false },
  { id: 5, name: 'khoaacc', online: false, khoa: true },
];
const CHARS = [
  { guid: '1010100001', name: 'AdminNV', account: 'admin', level: 119, online: false, gm: true, pending: [] },
  { guid: '1010100017', name: 'bialk', account: 'bialk', level: 103, online: true, gm: false, pending: [] },
  { guid: '1010100020', name: 'KimJongUn', account: 'hoang01', level: 109, online: false, gm: false, pending: ['Hồn Băng Châu x3'] },
  { guid: '1010100021', name: 'Alt', account: 'hoang01', level: 30, online: false, gm: false, pending: [] },
  { guid: '1010100099', name: 'ChuaCoVi', account: 'test9', level: 50, online: true, gm: false, pending: [] },
];
// tai khoan 'solo' KHONG nam trong danh sach tai khoan / nhan vat cua giao dien (chi tlbbFindChar thay) -> test rieng kiem gameAcc trung
const CHAR_AN = [{ guid: '1010100050', name: 'SoloNV', account: 'Solo', level: 20 }];
const tlbbPath = require.resolve(D + 'tlbb.js');
require.cache[tlbbPath] = { id: tlbbPath, filename: tlbbPath, loaded: true, exports: { gmCall: async (m, p, f) => {
  if (m === 'GET' && p === '/api/state') return { ok: true, state: { online: 2, procs: {}, ram: [1, 2], itemCount: 0, accounts: ACCOUNTS, chars: CHARS } };
  if (m === 'POST' && p === '/api/act') {
    ACT.push(f);
    if (f.ten === 'failacc') return { ok: true, done: false, msg: 'Khong co tai khoan failacc' };
    return { ok: true, done: true, msg: 'Da ' + f.a + ' ' + (f.ten || f.guid || '') };
  }
  return { ok: false, error: 'gia: ' + p };
} } };

const A = '456136500011335698', C = '991792167830536', W2 = '888888888888888888', O = '777777777777777777', W3 = '999999999999999999', F = '666666666666666666', X = '555555555555555555';
const db = {
  [A]: { name: 'BiaLK', tlbbGuid: '1010100017', ingameName: 'bialk', gameAcc: 'BiaLK', gamePass: 'old', points: 1000, debt: { loan: 100, admin: 50 } },
  [C]: { name: 'KimJongUn (clone)', tlbbGuid: '1010100020', ingameName: 'KimJongUn', points: 0, clone: true },
  [W2]: { name: 'Hai', gameAcc: 'hoang01', gamePass: 'p2', points: 300 },
  [O]: { name: 'MoCoi', points: 5, gamePass: 'zzz' },
  [W3]: { name: 'Ba', points: 7 },
  [F]: { name: 'Fail', gameAcc: 'failacc', gamePass: 'x', points: 0 },
  [X]: { name: 'Xoa', gameAcc: 'xoaacc', gamePass: 'y', points: 0 },
  _panelAddDaily: { date: 'x', added: {} },
};
const LOG = [];
const getUserData = (uid) => (db[uid] = db[uid] || { points: 0 });
const ctx = {
  port: 18518, publicPort: 18244, password: 'mod', superPassword: 'sup',
  getDb: () => db, getUserData, saveDbNow: () => {}, writeLog: (a, b) => LOG.push(b),
  getTX: () => ({}), getForcedMines: () => ({}), getDogLedger: () => [],
  updatePoints: (uid, n) => { getUserData(uid).points = (getUserData(uid).points || 0) + n; }, logDog: () => {},
  deletePlayer: (uid) => { if (!db[uid]) return false; delete db[uid]; return true; },
  debtAdd: (uid, n) => { const u = getUserData(uid); u.debt = u.debt || { loan: 0, admin: 0 }; u.debt.admin += n; return { total: u.debt.loan + u.debt.admin }; },
  debtClear: (uid) => { const u = getUserData(uid), d = u.debt || {}; const c = (d.loan || 0) + (d.admin || 0); delete u.debt; return { cleared: c }; },
  tlbbFindChar: async (q) => { q = String(q).toLowerCase(); const c = CHARS.concat(CHAR_AN).find((x) => x.guid === q || x.name.toLowerCase() === q); return c ? { guid: c.guid, account: c.account, name: c.name, level: c.level } : null; },
  tlbbListChars: async () => CHARS.concat(CHAR_AN).map((c) => ({ guid: c.guid, account: c.account, name: c.name })),
  tpIk: { get: () => [], set: (ids) => ids.map((id) => ({ id })) },
  gameItems: () => [{ id: '20309101', n: 'Hồn Băng Châu [1 cấp]', kind: 'Khac' }],
};
require(D + 'panel.js').startPanel(ctx);

const B = 'http://127.0.0.1:' + ctx.port;
let H = { 'Content-Type': 'application/json' };
const post = async (p, b, base, h) => { const r = await fetch((base || B) + p, { method: 'POST', headers: h || H, body: JSON.stringify(b || {}) }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
let soOk = 0, soLoi = 0;
const chk = (ten, dk, them) => { console.log((dk ? 'OK  ' : 'LOI ') + ten + (them ? ' | ' + them : '')); if (dk) soOk++; else { soLoi++; process.exitCode = 1; } };
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== DOM gia cho taikhoan.panel.js =====
function chayGiaoDien(token, file, them) {
  const els = {}, L = {}, TOAST = [], HOI = [];
  const mkEl = (id) => {
    const s = new Set();
    return { id, innerHTML: '', textContent: '', value: '', checked: false, style: {}, scrollTop: 0, disabled: false, dataset: {},
      classList: { toggle(c, on) { if (on === undefined) on = !s.has(c); if (on) s.add(c); else s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) },
      addEventListener() {}, querySelectorAll: () => [], contains: () => false, focus() {}, getAttribute: () => null };
  };
  const document = { getElementById: (id) => els[id] || (els[id] = mkEl(id)), createElement: () => mkEl(''), head: { appendChild() {} }, activeElement: null, hidden: false,
    querySelector: () => null, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); } };
  const api = async (p, b) => { const r = await post(p, b); if (!r.j.ok) { const e = new Error(r.j.error || 'HTTP ' + r.st); e.toasted = true; TOAST.push('❌ ' + e.message); throw e; } return r.j; };
  const sb = { document, TOKEN: token, console, Promise, Date, Number, String, Object, Array, Math, JSON, Error, RegExp, Set,
    fetch: (p, o) => fetch(B + p, o), setInterval: () => 0, api, toast: (m) => TOAST.push(m), uiConfirm: (m) => { HOI.push(m); return Promise.resolve(true); },
    runBtn: async (b, l, fn) => { try { return await fn(); } catch (e) { /* api da toast */ } }, tab: () => {}, logout: () => {} };
  Object.assign(sb, them || {});
  sb.window = sb;
  vm.createContext(sb);
  file = file || 'taikhoan.panel.js';
  vm.runInContext(fs.readFileSync(D + file, 'utf8'), sb, { filename: file });   // tab-tk dang hien -> tu goi tkLoad()
  const click = (attrs) => { const ev = { target: { closest: (s) => {
    if (s === '#tab-tk' || s === '#pqRoot') return {};
    const m = s.match(/^\[([a-z-]+)\]$/); if (m && attrs[m[1]] !== undefined) return { disabled: false, getAttribute: (k) => (attrs[k] === undefined ? null : attrs[k]) };
    return null; } } }; (L.click || []).forEach((f) => f(ev)); };
  return { els, TOAST, HOI, sb, click, el: (id) => document.getElementById(id) };
}

(async () => {
  await ngu(400);
  const html = await (await fetch(B + '/')).text();
  chk('trang chu co tab tk (epOnly) + pane + /tk.js', /data-tab="tk" class="epOnly"/.test(html) && html.includes('id="tab-tk"') && html.includes('<script src="/tk.js"></script>'));
  chk('tab tk dung dau nhom NGUOI CHOI', /NGƯỜI CHƠI<\/span><div class="gbt">\s*<button data-tab="tk"/.test(html));
  chk('doi ten tab: Kinh te & Vi chung / Shop · KNB · Thuong Pho / Server game / Cai dat · Cong cu',
    html.includes('💰 Kinh tế &amp; Ví chung') && html.includes('🛒 Shop · KNB · Thương Phố') && html.includes('>🛠️ Server game<') && html.includes('>⚙️ Cài đặt · Công cụ<'));
  const iTlbb = html.indexOf('id="tab-tlbb"'), iTpik = html.indexOf('id="tpikCard"'), iShop = html.indexOf('id="shopCard"'), iPet = html.indexOf('id="petBossCard"');
  chk('the Thuong Pho -> Ruong Ich Ky nam trong tab tlbb, duoi Shop Item', iTlbb > 0 && iShop > iTlbb && iTpik > iShop && iPet > iTpik && (html.match(/id="tpikDs"/g) || []).length === 1);
  chk('go bang cu: vi tung nguoi / lien ket / tai khoan game / bang nhan vat', !html.includes('id="playerBody"') && !html.includes('id="lienKetList"') && !html.includes('id="gmAccs"') && !html.includes('id="gmChars"'));
  chk('giu cong tac chuc nang #featBox (the rieng)', (html.match(/id="featBox"/g) || []).length === 1);
  chk('tab() biet tk + goi tkLoad, tab tlbb goi tpikLoad', html.includes("'pq','tk']") && html.includes("if(t==='tk'&&typeof tkLoad==='function')tkLoad();") && html.includes("if(t==='tlbb')tpikLoad();"));
  const js = await (await fetch(B + '/tk.js')).text();
  chk('/tk.js phuc vu duoc', js.includes('window.tkLoad'));
  chk('giao dien khong co dau gach dai', !js.includes('—') && !/—/.test(html.slice(html.indexOf('id="tab-tk"') - 2000, html.indexOf('id="tab-tk"') + 200)));

  const lg = await post('/api/login', { password: 'sup' }); H.Authorization = 'Bearer ' + lg.j.token;
  chk('dang nhap SUPER', !!lg.j.token);
  let r = await post('/api/state');
  chk('/api/state van chay (refresh khong vo khi bo bang vi)', r.st === 200 && r.j.ok && r.j.state.players.length === 7, 'HTTP ' + r.st);

  r = await post('/api/tk/data');
  const wa = (r.j.wallets || []).find((w) => w.id === A);
  chk('/api/tk/data: 7 vi (bo khoa _), no tinh tong, gameAcc chu thuong', r.j.ok && r.j.wallets.length === 7 && wa.debt.total === 150 && wa.debt.loan === 100 && wa.gameAcc === 'bialk' && wa.points === 1000, JSON.stringify(wa));
  chk('/api/tk/data KHONG tra gamePass', !JSON.stringify(r.j).includes('gamePass') && !JSON.stringify(r.j).includes('"old"'));
  const lm = await post('/api/login', { password: 'mod' }, 'http://127.0.0.1:' + ctx.publicPort);
  r = await post('/api/tk/data', {}, 'http://127.0.0.1:' + ctx.publicPort, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lm.j.token });
  chk('cong mod bi chan /api/tk/data', r.st === 403, 'HTTP ' + r.st);

  // ===== giao dien that (vm) =====
  const G = chayGiaoDien(lg.j.token);
  for (let i = 0; i < 40 && !G.els.tkList.innerHTML.includes('data-tksel'); i++) await ngu(50);
  const st = G.els.tkStats.innerHTML, seg = G.els.tkSeg.innerHTML, li = G.els.tkList.innerHTML;
  chk('UI thong ke: 9 nguoi, 2 online, 1.312 KNB, 1 nguoi no', st.includes('<b>9</b>người') && st.includes('<b>2</b>online') && st.includes('<b>1.312</b>tổng KNB ví') && st.includes('<b>1</b>người còn nợ'), st.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  chk('UI loc: 2 vi chi co Discord + 2 vi gameAcc khong con (failacc, xoaacc), 3 tai khoan chua co vi', seg.includes('Ví chỉ có Discord<span>2</span>') && seg.includes('Liên kết không còn<span>2</span>') && seg.includes('Tài khoản chưa có ví<span>3</span>'), seg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  const iB = li.indexOf('data-tksel="a:bialk"'), iT = li.indexOf('data-tksel="a:test9"'), iH = li.indexOf('data-tksel="a:hoang01"');
  chk('UI sap xep: online truoc, roi KNB', iB >= 0 && iB < iT && iT < iH, [iB, iT, iH].join(' < '));
  const rowH = li.slice(iH, li.indexOf('data-tksel=', iH + 10));
  chk('UI hoang01: vi theo GUID + vi theo gameAcc, nhan 2 vi + clone', rowH.includes('KimJongUn (clone)') && rowH.includes('Hai') && rowH.includes('⚠ 2 ví cùng tài khoản') && rowH.includes('🧬 Clone') && rowH.includes('🎁 1 chờ'));
  chk('UI admin co nhan 👑 Admin, khoaacc co 🔒 Bị khóa', /a:admin[\s\S]*?👑 Admin/.test(li) && /a:khoaacc[\s\S]*?🔒 Bị khóa/.test(li));
  G.click({ 'data-tksel': 'a:hoang01' });
  let det = G.els.tkDet.innerHTML;
  chk('UI chi tiet hoang01: vi + tai khoan + nhan vat + lien ket', det.includes('data-tk="cong" data-uid="' + W2 + '"') && det.includes('data-tk="xoatk"') && det.includes('data-tk="huyqua"') && det.includes('id="tkLkSel_' + C + '"') && det.includes('Đổi mật khẩu'));
  G.click({ 'data-tksel': 'a:admin' });
  det = G.els.tkDet.innerHTML;
  chk('UI admin: khong co Khoa / Xoa tai khoan, co Tao vi clone', !det.includes('data-tk="xoatk"') && !det.includes('data-tk="khoa"') && det.includes('data-tk="taoclone"'));
  G.click({ 'data-tksel': 'w:' + O });
  det = G.els.tkDet.innerHTML;
  chk('UI vi chi co Discord: co vi + lien ket, khong co muc tai khoan game', det.includes('data-tk="lkluu" data-uid="' + O + '"') && !det.includes('data-tk="mk"'));
  // thao tac that tu giao dien: doi mat khau tai khoan bialk -> panel GM doi_mk + vi gan tai khoan do cap nhat gamePass
  G.click({ 'data-tksel': 'a:bialk' });
  G.sb.document.getElementById('tkPw').value = 'abc12345';
  const n0 = ACT.length;
  G.click({ 'data-tk': 'mk' });
  for (let i = 0; i < 40 && ACT.length === n0; i++) await ngu(50);
  await ngu(150);
  chk('UI doi mat khau -> /api/gm/act doi_mk', ACT.length === n0 + 1 && ACT[n0].a === 'doi_mk' && ACT[n0].ten === 'bialk' && ACT[n0].mk === 'abc12345', JSON.stringify(ACT[n0]));
  chk('BUG a: doi_mk xong -> gamePass vi gan tai khoan cap nhat', db[A].gamePass === 'abc12345');
  chk('BUG a: nhat ky khong ghi mat khau', !LOG.some((l) => l.includes('abc12345')) && LOG.some((l) => /đổi mật khẩu tài khoản game bialk/.test(l)));
  chk('UI thao tac xong: chi tiet van mo dung nguoi', G.els.tkDet.classList.contains('mo') && G.els.tkDet.innerHTML.includes('BiaLK'));

  // ===== /api/gm/act =====
  let n1 = ACT.length;
  r = await post('/api/gm/act', { a: 'khoa_tk', ten: 'admin', khoa: '1' });
  chk('chan khoa_tk admin (400, khong goi panel GM)', r.st === 400 && ACT.length === n1, r.j.error);
  r = await post('/api/gm/act', { a: 'xoa_tk', ten: ' Admin ' });
  chk('chan xoa_tk Admin (400, khong goi panel GM)', r.st === 400 && ACT.length === n1, r.j.error);
  r = await post('/api/gm/act', { a: 'doi_mk', ten: 'BIALK', mk: 'newpass123' });
  chk('doi_mk khong phan biet hoa thuong', r.j.ok && db[A].gamePass === 'newpass123' && db[W2].gamePass === 'p2');
  r = await post('/api/gm/act', { a: 'doi_mk', ten: 'failacc', mk: 'zzzzzz' });
  chk('doi_mk that bai (done=false) -> khong doi gamePass', r.j.ok && db[F].gamePass === 'x');
  r = await post('/api/gm/act', { a: 'xoa_tk', ten: 'xoaacc' });
  chk('BUG a: xoa_tk -> go gameAcc + gamePass khoi vi', r.j.ok && db[X].gameAcc === undefined && db[X].gamePass === undefined && db[X].points === 0);
  r = await post('/api/gm/act', { a: 'go_ket', ten: 'admin' });
  chk('go_ket admin van duoc', r.j.ok && ACT[ACT.length - 1].a === 'go_ket');

  // ===== /api/tlbb/lienket =====
  r = await post('/api/tlbb/lienket', { userId: O, name: 'ChuaCoVi' });
  chk('BUG b: lien ket -> gameAcc = tai khoan nhan vat, xoa gamePass cu', r.j.ok && db[O].gameAcc === 'test9' && db[O].gamePass === undefined && db[O].tlbbGuid === '1010100099', JSON.stringify(db[O]));
  r = await post('/api/tlbb/lienket', { userId: W3, name: 'Alt' });
  chk('BUG b: tu choi khi vi khac da gan tai khoan game do', r.st === 400 && /Tài khoản game "hoang01"/.test(r.j.error) && !db[W3].tlbbGuid, r.j.error);
  db['444444444444444444'] = { name: 'Solo', gameAcc: 'solo', gamePass: 's', points: 0 };   // chi gameAcc, khong lien ket nhan vat
  r = await post('/api/tlbb/lienket', { userId: W3, name: 'SoloNV' });
  chk('BUG b: tu choi chi vi gameAcc trung (khong hoa thuong)', r.st === 400 && /Tài khoản game "Solo" đã gắn với ví Solo/.test(r.j.error) && !db[W3].tlbbGuid, r.j.error);
  r = await post('/api/tlbb/lienket', { userId: W2, name: 'Alt' });
  chk('BUG b: tu choi khi vi khac lien ket nhan vat cung tai khoan', r.st === 400 && /hoang01/.test(r.j.error), r.j.error);
  r = await post('/api/tlbb/lienket', { userId: W2, name: 'KimJongUn' });
  chk('van chan nhan vat da lien ket vi khac', r.st === 400 && /đã liên kết với ví/.test(r.j.error), r.j.error);
  r = await post('/api/tlbb/lienket', { userId: A, name: 'bialk', clone: false });
  chk('lien ket lai cung tai khoan -> giu gamePass', r.j.ok && db[A].gameAcc === 'bialk' && db[A].gamePass === 'newpass123');
  r = await post('/api/tlbb/lienket', { userId: A, name: '' });
  chk('BUG b: bo lien ket -> xoa gameAcc + gamePass', r.j.ok && db[A].tlbbGuid === '' && db[A].gameAcc === undefined && db[A].gamePass === undefined);
  r = await post('/api/tlbb/lienket', { userId: W3, name: 'bialk' });
  chk('sau khi bo, vi khac lien ket duoc tai khoan do', r.j.ok && db[W3].gameAcc === 'bialk');

  // ===== cac route vi van chay (tab Tai khoan goi) =====
  r = await post('/api/points/add', { userId: W3, amount: 50 });
  chk('/api/points/add', r.j.ok && db[W3].points === 57);
  r = await post('/api/debt/add', { userId: W3, amount: 20 });
  chk('/api/debt/add + /api/tk/data thay no', r.j.ok && (await post('/api/tk/data')).j.wallets.find((w) => w.id === W3).debt.total === 20);
  r = await post('/api/points/delete', { userId: F });
  chk('/api/points/delete', r.j.ok && !db[F]);

  // ===== vong 2: ghep khi lech / mat lien ket, xoa o sau thao tac, an mat khau =====
  const L1 = '111111111111111111', M1 = '222222222222222222', N1 = '333333333333333333';
  db[L1] = { name: 'Lech', gameAcc: 'khoaacc', tlbbGuid: '1010100021', ingameName: 'Alt', points: 11 };   // gameAcc khoaacc, nhan vat thuoc hoang01
  db[M1] = { name: 'MatTk', gameAcc: 'goneacc', points: 12 };                                             // tai khoan game khong con
  db[N1] = { name: 'MatNv', tlbbGuid: '1010109999', ingameName: 'Ghost', points: 13 };                    // nhan vat lien ket khong con
  const G2 = chayGiaoDien(lg.j.token);
  for (let i = 0; i < 40 && !G2.els.tkList.innerHTML.includes('data-tksel'); i++) await ngu(50);
  const li2 = G2.els.tkList.innerHTML, seg2 = G2.els.tkSeg.innerHTML;
  const hang = (k) => { const i = li2.indexOf('data-tksel="' + k + '"'); return i < 0 ? '' : li2.slice(i, (li2.indexOf('data-tksel=', i + 10) + 1 || li2.length + 1) - 1); };
  chk('BUG 8: vi lech nam o tai khoan cua NHAN VAT (tlbbGuid thang) + nhan canh bao', hang('a:hoang01').includes('Lech') && hang('a:hoang01').includes('⚠ gameAcc khác tài khoản nhân vật') && !hang('a:khoaacc').includes('<b>Lech</b> 11'));
  chk('BUG 8: tai khoan gameAcc tro toi khong tinh "chua co vi"', hang('a:khoaacc').includes('ghi tài khoản này nhưng liên kết nhân vật ở tài khoản hoang01') && !/Tài khoản chưa có ví<span>3<\/span>/.test(seg2), seg2.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  chk('BUG 7: gameAcc khong con -> nhan "Tai khoan game khong con" (khong phai "Vi chi co Discord")', hang('w:' + M1).includes('⚠ Tài khoản game không còn') && !hang('w:' + M1).includes('Ví chỉ có Discord'));
  chk('nhan vat lien ket khong con -> nhan rieng + bo loc "Lien ket khong con 3" (them vi Solo gameAcc khong con)', hang('w:' + N1).includes('⚠ Nhân vật liên kết không còn') && seg2.includes('Liên kết không còn<span>3</span>') && seg2.includes('gameAcc lệch<span>1</span>'));
  G2.click({ 'data-tksel': 'a:bialk' });
  let det2 = G2.els.tkDet.innerHTML;
  chk('BUG 6: o mat khau la type=password + nut 👁', /type="password" id="tkPw"/.test(det2) && det2.includes('data-tk="xemmk"'));
  G2.click({ 'data-tk': 'xemmk' });
  chk('nut 👁 hien mat khau (type=text)', /type="text" id="tkPw"/.test(G2.els.tkDet.innerHTML));
  G2.el('tkAmt_' + W3).value = '10'; G2.el('tkPw').value = 'matkhau99'; G2.el('tkLkTxt_' + W3).value = 'xyz';
  const p0 = db[W3].points;
  G2.click({ 'data-tk': 'cong', 'data-uid': W3 });
  for (let i = 0; i < 40 && db[W3].points === p0; i++) await ngu(50);
  await ngu(150);
  chk('BUG 6: thao tac xong -> xoa o so KNB / mat khau / ten lien ket', db[W3].points === p0 + 10 && G2.el('tkAmt_' + W3).value === '' && G2.el('tkPw').value === '' && G2.el('tkLkTxt_' + W3).value === '', 'points ' + p0 + ' -> ' + db[W3].points);

  // ===== Phat qua: ten nguoi nhan + ✕ bo tung nguoi + ten trong hop xac nhan =====
  const P = chayGiaoDien(lg.j.token, 'phatqua.panel.js', { ICMAP: {}, vqaIc: () => '', icTra: () => {} });
  P.sb.pqLoad();
  for (let i = 0; i < 40 && !P.el('pqNvs').innerHTML.includes('data-pqnv'); i++) await ngu(50);
  ['1010100017', '1010100020'].forEach((g) => P.click({ 'data-pqnv': g }));
  let sum = P.el('pqSum').innerHTML;
  chk('BUG 2: o tom tat hien ten 2 nguoi nhan + nut ✕', sum.includes('2 nhân vật') && sum.includes('>bialk<') && sum.includes('>KimJongUn<') && sum.includes('data-pqbo="1010100020"'), sum.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  P.click({ 'data-pqbo': '1010100020' });
  sum = P.el('pqSum').innerHTML;
  chk('BUG 2: bam ✕ bo 1 nguoi', sum.includes('1 nhân vật') && !sum.includes('KimJongUn'));
  CHARS.slice(0, 5).forEach((c) => { if (c.guid !== '1010100017') P.click({ 'data-pqnv': c.guid }); });
  await ngu(300);   // danh muc vat pham (/api/gameitems) ve
  P.click({ 'data-pqit': '20309101' });
  const n2 = ACT.length;
  P.click({ 'data-pq': 'gui' });
  for (let i = 0; i < 40 && ACT.length < n2 + 5; i++) await ngu(50);
  const hoi = P.HOI[P.HOI.length - 1] || '';
  chk('BUG 2: hop xac nhan co ten nguoi nhan', /5 nhân vật .*: AdminNV, bialk, KimJongUn, Alt, ChuaCoVi/.test(hoi) && ACT.length === n2 + 5, hoi);

  console.log('\n' + soOk + ' / ' + (soOk + soLoi) + ' OK');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('LOI', e); process.exit(1); });
