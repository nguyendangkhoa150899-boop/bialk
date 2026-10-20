// Test Giftcode (giftcode.js + route /api/gc/* trong panel.js + giao dien giftcode.panel.js = /gc.js) tren may Windows.
// Chay panel.js THAT + tlbb.js THAT (TLBB_ROOT = thu muc tam), chi thay tlbb.listChars / tlbb.items / tlbb.gmCall bang ham gia.
// Chay (tu BotDoMin): node thu/giftcode-test.js   (khong dung toi VPS / game / Discord; KEEP=1 de giu server chay xem giao dien)
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm');
const D = path.join(__dirname, '..') + path.sep;
const SCRATCH = 'D:/Thiên Long Bát Bộ NetCo4/scratchpad-claude';
const ROOT = process.env.GC_TEST_ROOT || path.join(fs.existsSync(SCRATCH) ? SCRATCH : os.tmpdir(), 'gctest-root');   // xoa o dau moi lan chay
fs.rmSync(ROOT, { recursive: true, force: true });
process.env.TLBB_ROOT = ROOT;
process.env.PANEL_MOD_MO = '0';
delete process.env.GIFTCODE_DIR;
const DIR = path.join(ROOT, 'home/tlbb/Server/txt/NetCo4Web');
fs.mkdirSync(DIR, { recursive: true });
const F = (f) => path.join(DIR, f);
const doc = (f) => { try { return fs.readFileSync(F(f), 'latin1'); } catch { return null; } };

let soOk = 0, soLoi = 0;
const chk = (ten, dk, them) => { console.log((dk ? 'OK  ' : 'LOI ') + ten + (them ? ' | ' + them : '')); if (dk) soOk++; else { soLoi++; process.exitCode = 1; } };
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

// giftcode.txt viet tay de thu (truoc khi co bot): 1 ma dung dang TL, 2 ma NC4- cu (phai bo), 1 dong trung, 1 dong khong co qua, CRLF
fs.writeFileSync(F('giftcode.txt'), [
  'tlabc234|0|5|item 20309101 2;knb 100;level 50',
  'NC4-7KQ9X2MP|1793000000|1|item 20310185 1;knb 100',
  'NC4-AAAABBBB|0|0|knb 5',
  'TLABC234|0|1|knb 1',
  'TLZZZZZ9|0|1|level 9',
].join('\r\n') + '\r\n', 'latin1');

// ----- tlbb.js THAT (DIR theo TLBB_ROOT), thay 3 ham goi ra ngoai -----
const T = require(D + 'tlbb.js');
let CHARS = [
  { guid: '1010100017', account: 'bialk', name: 'bialk', level: 103 },
  { guid: '1010100020', account: 'Hoang01', name: 'KimJongUn', level: 109 },   // tai khoan viet hoa -> file ghi chu thuong
  { guid: '1010100021', account: 'hoang01', name: 'KimClone', level: 60 },
  { guid: '1010100030', account: 'co cach', name: 'Loi1', level: 1 },           // tai khoan co dau cach -> bo
  { guid: '1010100031', account: 'a|b', name: 'Loi2', level: 1 },               // co "|" -> bo
  { guid: '1010100032', account: 'tiếng', name: 'Loi3', level: 1 },             // khong phai ASCII -> bo
  { guid: 'abc', account: 'xx', name: 'Loi4', level: 1 },                       // GUID sai -> bo
];
let LIST_LOI = false, LIST_N = 0;
T.listChars = async () => { LIST_N++; if (LIST_LOI) throw new Error('mysql gia loi'); return CHARS.map((c) => ({ ...c })); };
const ITEMS = [{ id: '20309101', n: 'Hồn Băng Châu [1 cấp]', kind: '' }, { id: '20310185', n: 'Lệnh Bài Thử', kind: '' }, { id: '10156108', n: 'Ngự Dao Bàn', kind: 'Trang bi' }];
T.items = () => ITEMS;
T.gmCall = async () => ({ ok: false, error: 'gia' });
chk('tlbb.DIR theo TLBB_ROOT', path.resolve(T.DIR) === path.resolve(DIR), T.DIR);

const G = require(D + 'giftcode.js');
chk('giftcode.dir() = tlbb.DIR', path.resolve(G.dir()) === path.resolve(DIR));

// ===== 1. ham thuan =====
{
  const ABC = G.ABC;
  chk('bang chu ma ngau nhien khong co 0 O 1 I L', !/[0O1IL]/.test(ABC) && ABC.length === 31 && new Set(ABC).size === 31, ABC);
  let tot = true; const thay = new Set();
  for (let i = 0; i < 3000; i++) { const m = G.taoMa(); m.slice(2).split('').forEach((c) => thay.add(c)); if (!/^TL[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(m) || m.includes('-') || !G.RE_MA.test(m)) { tot = false; console.log('   ma sai', m); break; } }
  chk('taoMa: TL + 6 ky tu dung bang chu, khong "-"', tot);
  chk('taoMa: 3000 ma dung du 31 ky tu', thay.size === 31, thay.size + '');
  let lan = 0; const m2 = G.taoMa((s) => ++lan < 4);
  chk('taoMa: trung thi tao lai', lan === 4 && G.RE_MA.test(m2));
  chk('RE_MA', G.RE_MA.test('TL2026AB') && !G.RE_MA.test('TL2026A') && !G.RE_MA.test('TL2026ABC') && !G.RE_MA.test('tl2026ab') && !G.RE_MA.test('TL-026AB') && !G.RE_MA.test('XX2026AB') && !G.RE_MA.test('NC4-7KQ9X2MP'));
  chk('maTuNhap: 6 ky tu -> them TL, 8 ky tu giu nguyen, viet hoa + bo cach', G.maTuNhap('20 26ab') === 'TL2026AB' && G.maTuNhap('tl2026ab') === 'TL2026AB' && G.maTuNhap('') === '');

  const q = { items: [{ id: '20310185', n: 1 }, { id: '20309101', n: 25 }], knb: 250000, vangDong: 50000, diemtang: 7 };
  chk('quaChuoi: item / knb chia dong 99999 / vang (dong) / diemtang', G.quaChuoi(q) === 'item 20310185 1;item 20309101 25;knb 99999;knb 99999;knb 50002;vang 50000;diemtang 7', G.quaChuoi(q));
  chk('dongCode dung mau CODE|hetHan|tongLuot|qua', G.dongCode({ ma: 'TL7KQ9X2', hetHan: 1793000000, tongLuot: 1, qua: { items: [{ id: '20310185', n: 1 }], knb: 100 } }) === 'TL7KQ9X2|1793000000|1|item 20310185 1;knb 100');
  const ds = [{ ma: 'TLAAAAAA', hetHan: 0, tongLuot: 0, on: true, qua: { items: [], knb: 5 } }, { ma: 'TLBBBBBB', hetHan: 1, tongLuot: 1, on: false, qua: { items: [], knb: 5 } },
    { ma: 'TLCCCCCC', hetHan: 1000, tongLuot: 2, on: true, qua: { items: [], diemtang: 3 } }];
  chk('noiDungCode: bo ma tat, GIU ma het han, LF, dong cuoi co \\n', G.noiDungCode(ds) === 'TLAAAAAA|0|0|knb 5\nTLCCCCCC|1000|2|diemtang 3\n');
  chk('noiDungCode rong = chuoi rong', G.noiDungCode([]) === '' && G.noiDungCode([{ ...ds[1] }]) === '');
  const p = G.parseQua('item 20309101 2; knb 100;knb 5;vang 10000;diemtang 3;level 50;item 20309101 1;');
  chk('parseQua: gop item trung, cong knb, vang -> vangDong, bo doan la', JSON.stringify(p.q) === JSON.stringify({ items: [{ id: '20309101', n: 3 }], knb: 105, vangDong: 10000, diemtang: 3 }) && p.bo.join() === 'level 50', JSON.stringify(p));
  const pf = G.parseCodeFile(doc('giftcode.txt'));
  chk('parseCodeFile: chi nhan TL + 6, bo NC4- / trung / khong qua', pf.ds.length === 1 && pf.ds[0].ma === 'TLABC234' && pf.hong.length === 4, JSON.stringify(pf.hong));
  const dg = G.parseDung('TLAAAAAA|bialk|1010100017|1790000000\r\nhong\nTLAAAAAA|Hoang01|1010100020|1790000100\nTLAAAAAA|x y|1|2\n\n');
  chk('parseDung: CRLF, bo dong hong, tai khoan chu thuong', dg.length === 2 && dg[1].acc === 'hoang01' && dg[0].t === 1790000000 && dg[0].guid === '1010100017', JSON.stringify(dg));
  chk('noiDungAcc: "<guid> <tk>" chu thuong, bo tk co cach / | / khong ASCII / GUID sai', G.noiDungAcc(CHARS) === '1010100017 bialk\n1010100020 hoang01\n1010100021 hoang01\n', JSON.stringify(G.noiDungAcc(CHARS)));
  const now = 1790000000, idOk = (id) => ITEMS.some((x) => x.id === id);
  const kt = (b, ds2, dung) => G.kiemTao(b, ds2 || [], idOk, dung || {}, now);
  const L = [
    ['ma co dau -', { ma: 'TL-26AB', knb: 1 }, /TL \+ 6/],
    ['ma 7 ky tu', { ma: 'TL2026A', knb: 1 }, /8 ký tự/],
    ['ma 9 ky tu', { ma: 'TL2026ABC', knb: 1 }, /8 ký tự/],
    ['ma khong bat dau TL', { ma: 'XX2026AB', knb: 1 }, /TL/],
    ['ma ky tu la', { ma: 'TL2026A#', knb: 1 }, /A-Z/],
    ['trung ma (khong phan biet hoa thuong)', { ma: 'tl2026ab', knb: 1 }, /đã có/, [{ ma: 'TL2026AB' }]],
    ['ma da xoa con luot dung', { ma: '2026AB', knb: 1 }, /từng có 3 lượt/, [], { TL2026AB: 3 }],
    ['chua co qua', { ma: 'TL2026AB' }, /Chưa có quà/],
    ['ID khong co trong danh muc', { items: [{ id: '99999999', n: 1 }] }, /không có trong danh mục/],
    ['ID khong phai so', { items: [{ id: 'abc', n: 1 }] }, /không hợp lệ/],
    ['so luong 0', { items: [{ id: '20309101', n: 0 }] }, /1 - 9.999/],
    ['so luong 10000', { items: [{ id: '20309101', n: 10000 }] }, /1 - 9.999/],
    ['so luong le', { items: [{ id: '20309101', n: 1.5 }] }, /1 - 9.999/],
    ['gop trung vuot 9999', { items: [{ id: '20309101', n: 5000 }, { id: '20309101', n: 5000 }] }, /vượt 9.999/],
    ['21 loai vat pham', { items: Array.from({ length: 21 }, (_, i) => ({ id: '20309101', n: 1 })).map((x, i) => ({ id: String(20309101 + i), n: 1 })) }, /danh mục|Tối đa 20/],
    ['knb am', { knb: -1 }, /KNB 0/], ['knb qua tran', { knb: 10000001 }, /KNB 0/], ['vang qua tran', { vang: 100001 }, /Vàng 0/],
    ['diem tang qua tran', { diemtang: 10000001 }, /Điểm Tặng 0/], ['knb chu', { knb: 'abc' }, /KNB 0/],
    ['tong luot am', { knb: 1, tongLuot: -1 }, /Tổng lượt/], ['tong luot qua tran', { knb: 1, tongLuot: 100001 }, /Tổng lượt/],
    ['han da qua', { knb: 1, hetHan: now - 10 }, /đã qua/], ['han qua int32', { knb: 1, hetHan: 2147483648 }, /không hợp lệ/],
  ];
  for (const [ten, b, re, ds2, dung] of L) { const r = kt(b, ds2, dung); chk('kiemTao chan: ' + ten, !!r.error && re.test(r.error), r.error || JSON.stringify(r)); }
  const ITEMS2 = ITEMS.concat(Array.from({ length: 25 }, (_, i) => ({ id: String(30000000 + i), n: 'x' + i })));
  const r21 = G.kiemTao({ items: ITEMS2.slice(3, 24).map((x) => ({ id: x.id, n: 1 })) }, [], (id) => ITEMS2.some((x) => x.id === id), {}, now);
  chk('kiemTao chan: 21 loai vat pham (ID co that)', /Tối đa 20/.test(r21.error || ''), r21.error);
  const ok = kt({ ma: ' 20 26ab ', hetHan: '', tongLuot: '', items: [{ id: '20309101', n: '3' }, { id: '20309101', n: 2 }], knb: '', vang: '5', diemtang: 0, ghiChu: ' a\nb ' });
  chk('kiemTao OK: TL tu them, mac dinh 1 luot / khong han, gop item, vang -> dong, ghi chu 1 dong',
    ok.code && ok.code.ma === 'TL2026AB' && ok.code.tongLuot === 1 && ok.code.hetHan === 0 && ok.code.qua.items.length === 1 && ok.code.qua.items[0].n === 5 && ok.code.qua.vangDong === 50000 && ok.code.ghiChu === 'a b', JSON.stringify(ok));
  const rd = kt({ knb: 1 }, [{ ma: 'TLAAAAAA' }]);
  chk('kiemTao: ma trong -> ngau nhien TL + 6', rd.code && G.RE_MA.test(rd.code.ma), rd.code && rd.code.ma);
  chk('trangThai', G.trangThai({ on: false, hetHan: 0 }, 0, now) === 'tat' && G.trangThai({ on: true, hetHan: now - 1 }, 0, now) === 'hethan' && G.trangThai({ on: true, hetHan: 0, tongLuot: 2 }, 2, now) === 'hetluot' && G.trangThai({ on: true, hetHan: now + 9, tongLuot: 0 }, 99, now) === 'bat');
}

// ===== 2. panel THAT =====
const db = { '456136500011335698': { name: 'BiaLK', points: 0 } };
const LOG = []; let SAVE = 0;
const ctx = {
  port: 18511, publicPort: 18237, password: 'mod', superPassword: 'sup',
  getDb: () => db, getUserData: (u) => (db[u] = db[u] || { points: 0 }), saveDbNow: () => { SAVE++; }, writeLog: (a, b) => LOG.push(a + ' ' + b),
  gameItems: () => ITEMS,
};
require(D + 'panel.js').startPanel(ctx);
const B = 'http://127.0.0.1:' + ctx.port;
const H = { 'Content-Type': 'application/json' };
const post = async (p, b, base) => { const r = await fetch((base || B) + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const LF_ASCII = (s) => s !== null && !s.includes('\r') && [...s].every((c) => c.charCodeAt(0) < 128);

if (process.env.KEEP) { console.log('PREVIEW http://127.0.0.1:' + ctx.port + '  (mat khau SUPER: sup)'); } else (async () => {
  await ngu(300);
  // nhap file luc khoi dong
  const gc0 = db._giftcode && db._giftcode.ds;
  chk('khoi dong: nhap 1 ma TL tu giftcode.txt, ghi chu "nhập từ file"', gc0 && gc0.length === 1 && gc0[0].ma === 'TLABC234' && gc0[0].ghiChu === 'nhập từ file' && gc0[0].tongLuot === 5 && gc0[0].on === true && SAVE >= 1, JSON.stringify(gc0));
  chk('khoi dong: nhat ky bao bo dong NC4- / sai dang', LOG.some((l) => /GIFTCODE.*bỏ qua khi nhập.*NC4-7KQ9X2MP/.test(l)), LOG.filter((l) => /GIFTCODE/.test(l)).join(' || ').slice(0, 300));
  chk('khoi dong: giftcode.txt ghi lai theo database (LF, ASCII, bo doan "level")', doc('giftcode.txt') === 'TLABC234|0|5|item 20309101 2;knb 100\n', JSON.stringify(doc('giftcode.txt')));
  chk('khoi dong: giftcode-acc.txt dung tung dong', doc('giftcode-acc.txt') === '1010100017 bialk\n1010100020 hoang01\n1010100021 hoang01\n' && LF_ASCII(doc('giftcode-acc.txt')), JSON.stringify(doc('giftcode-acc.txt')));
  chk('khong de file tam', !fs.readdirSync(DIR).some((f) => /\.tmp/.test(f)), fs.readdirSync(DIR).join(','));

  const html = await (await fetch(B + '/')).text();
  chk('trang chu co tab gc (epOnly) + khung #gcRoot + /gc.js', html.includes('data-tab="gc" class="epOnly"') && html.includes('id="gcRoot"') && html.includes('<script src="/gc.js"></script>') && html.includes("t==='gc'&&typeof gcLoad"));
  const js = await (await fetch(B + '/gc.js')).text();
  chk('/gc.js phuc vu duoc', js.includes('window.gcLoad') && js === fs.readFileSync(D + 'giftcode.panel.js', 'utf8'));
  chk('giao dien khong co dau gach dai', !js.includes('\u2014') && !fs.readFileSync(D + 'giftcode.js', 'utf8').includes('\u2014'));
  chk('chua dang nhap -> 401', (await post('/api/gc/list')).st === 401);
  const lg = await post('/api/login', { password: 'sup' }); H.Authorization = 'Bearer ' + lg.j.token;
  chk('dang nhap SUPER', !!lg.j.token);

  let r = await post('/api/gc/list');
  chk('/api/gc/list', r.j.ok && r.j.ds.length === 1 && r.j.ds[0].qua.items[0].ten === 'Hồn Băng Châu [1 cấp]' && r.j.ds[0].trangThai === 'bat' && r.j.gameOk === true && r.j.accN === 3, JSON.stringify(r.j).slice(0, 300));

  // tao ma
  const now = Math.floor(Date.now() / 1000), han = now + 86400 * 7;
  r = await post('/api/gc/tao', { ma: '7kq9x2', hetHan: han, tongLuot: 1, items: [{ id: '20310185', n: 1 }], knb: 100, ghiChu: 'thử' });
  chk('tao ma 6 ky tu -> TL7KQ9X2', r.j.ok && r.j.ma === 'TL7KQ9X2' && r.j.dong === 'TL7KQ9X2|' + han + '|1|item 20310185 1;knb 100' && !r.j.canhBao, JSON.stringify(r.j));
  r = await post('/api/gc/tao', { ma: 'TLKNB999', tongLuot: 0, knb: 250000, vang: 3, diemtang: 9 });
  chk('tao ma 8 ky tu, khong gioi han luot, chia KNB, vang ra dong', r.j.ok && r.j.ma === 'TLKNB999', JSON.stringify(r.j));
  r = await post('/api/gc/tao', { knb: 1 });
  const maNN = r.j.ma;
  chk('tao ma de trong -> ngau nhien TL + 6', r.j.ok && G.RE_MA.test(maNN) && !maNN.includes('-'), maNN);
  const mong = 'TLABC234|0|5|item 20309101 2;knb 100\nTL7KQ9X2|' + han + '|1|item 20310185 1;knb 100\nTLKNB999|0|0|knb 99999;knb 99999;knb 50002;vang 30000;diemtang 9\n' + maNN + '|0|1|knb 1\n';
  chk('giftcode.txt dung tung byte sau 3 lan tao', doc('giftcode.txt') === mong, JSON.stringify(doc('giftcode.txt')));
  chk('giftcode.txt LF + ASCII', LF_ASCII(doc('giftcode.txt')));

  // validate qua API
  const chan = [
    ['trung ma (chu thuong)', { ma: 'tl7kq9x2', knb: 1 }, /đã có/],
    ['co dau -', { ma: 'TL-KQ9X2', knb: 1 }, /không có dấu -/],
    ['ID la', { ma: 'TLAAAAA2', items: [{ id: '12345678', n: 1 }] }, /không có trong danh mục/],
    ['so luong 10000', { ma: 'TLAAAAA2', items: [{ id: '20309101', n: 10000 }] }, /9.999/],
    ['khong qua', { ma: 'TLAAAAA2' }, /Chưa có quà/],
    ['han qua', { ma: 'TLAAAAA2', knb: 1, hetHan: now - 60 }, /đã qua/],
  ];
  for (const [ten, b, re] of chan) { r = await post('/api/gc/tao', b); chk('API chan: ' + ten, r.st === 400 && re.test(r.j.error || ''), r.j.error); }
  chk('ma bi chan khong vao file', doc('giftcode.txt') === mong);

  // nguoi choi dung ma (game ghi them giftcode-dung.txt) -> dem luot, het luot, ai da dung
  const dungTxt = 'TL7KQ9X2|hoang01|1010100020|' + (now - 100) + '\nTLKNB999|bialk|1010100017|' + (now - 50) + '\nTLKNB999|hoang01|1010100021|' + (now - 10) + '\nrac rac\nTLDAXOA1|bialk|1010100017|' + (now - 999) + '\n';
  fs.writeFileSync(F('giftcode-dung.txt'), dungTxt, 'latin1');
  r = await post('/api/gc/list');
  const theo = {}; r.j.ds.forEach((c) => { theo[c.ma] = c; });
  chk('list: dem luot dung + het luot', theo.TL7KQ9X2.daDung === 1 && theo.TL7KQ9X2.trangThai === 'hetluot' && theo.TLKNB999.daDung === 2 && theo.TLKNB999.trangThai === 'bat' && theo.TLKNB999.qua.vang === 3, JSON.stringify(r.j.ds.map((c) => c.ma + ':' + c.daDung + ':' + c.trangThai)));
  chk('list: ma da xoa con luot (le)', r.j.le.length === 1 && r.j.le[0].ma === 'TLDAXOA1' && r.j.le[0].n === 1, JSON.stringify(r.j.le));
  r = await post('/api/gc/dung', { ma: 'tlknb999' });
  chk('/api/gc/dung: ten nhan vat + tai khoan + gio, moi nhat truoc', r.j.ok && r.j.ds.length === 2 && r.j.ds[0].ten === 'KimClone' && r.j.ds[0].acc === 'hoang01' && r.j.ds[1].ten === 'bialk' && r.j.ds[0].t === now - 10, JSON.stringify(r.j));
  r = await post('/api/gc/tao', { ma: 'TLDAXOA1', knb: 1 });
  chk('tao lai ma da xoa con luot -> chan', r.st === 400 && /từng có 1 lượt/.test(r.j.error), r.j.error);

  // tat / bat / xoa
  r = await post('/api/gc/bat', { ma: 'TL7KQ9X2', on: false });
  chk('tat ma -> khong ghi vao file', r.j.ok && !doc('giftcode.txt').includes('TL7KQ9X2') && db._giftcode.ds.find((c) => c.ma === 'TL7KQ9X2').on === false);
  r = await post('/api/gc/list');
  chk('list: trang thai Da tat', r.j.ds.find((c) => c.ma === 'TL7KQ9X2').trangThai === 'tat');
  r = await post('/api/gc/bat', { ma: 'tl7kq9x2', on: true });
  chk('bat lai -> ghi lai dung vi tri', r.j.ok && doc('giftcode.txt') === mong, JSON.stringify(doc('giftcode.txt')));
  // ma het han van ghi (game bao "het han")
  db._giftcode.ds.find((c) => c.ma === 'TL7KQ9X2').hetHan = now - 5;
  r = await post('/api/gc/bat', { ma: 'TL7KQ9X2', on: true });
  r = await post('/api/gc/list');
  chk('ma het han: van ghi vao file, trang thai Het han', doc('giftcode.txt').includes('TL7KQ9X2|' + (now - 5) + '|1|') && r.j.ds.find((c) => c.ma === 'TL7KQ9X2').trangThai === 'hethan');
  r = await post('/api/gc/xoa', { ma: maNN });
  chk('xoa ma -> mat khoi file + database', r.j.ok && !doc('giftcode.txt').includes(maNN) && !db._giftcode.ds.some((c) => c.ma === maNN));
  r = await post('/api/gc/xoa', { ma: 'TLKHONGCO' });
  chk('xoa ma khong co -> 404', r.st === 404, r.j.error);
  chk('bot KHONG ghi lai giftcode-dung.txt', doc('giftcode-dung.txt') === dungTxt);
  chk('nhat ky ADMIN [GIFTCODE] tao / tat / bat / xoa', ['tạo mã TL7KQ9X2', 'TẮT mã TL7KQ9X2', 'BẬT mã TL7KQ9X2', 'XOÁ mã ' + maNN].every((s) => LOG.some((l) => l.startsWith('ADMIN [GIFTCODE]') && l.includes(s))));

  // giftcode-acc.txt lam moi ngay sau khi doi ma; loi doc database giu file cu
  CHARS.push({ guid: '1010100099', account: 'MoiTao', name: 'NguoiMoi', level: 1 });
  const n0 = LIST_N;
  await post('/api/gc/bat', { ma: 'TLKNB999', on: true });
  chk('doi ma -> lam moi giftcode-acc.txt ngay (nhan vat moi vao file)', LIST_N > n0 && doc('giftcode-acc.txt').endsWith('1010100099 moitao\n'), JSON.stringify(doc('giftcode-acc.txt')));
  const accTruoc = doc('giftcode-acc.txt');
  LIST_LOI = true;
  await post('/api/gc/bat', { ma: 'TLKNB999', on: true });
  r = await post('/api/gc/list');
  chk('listChars loi -> giu file cu, list bao accLoi', doc('giftcode-acc.txt') === accTruoc && /mysql gia loi/.test(r.j.accLoi), r.j.accLoi);
  LIST_LOI = false;
  const keep = CHARS; CHARS = [];
  await post('/api/gc/bat', { ma: 'TLKNB999', on: true });
  chk('listChars tra rong -> giu file cu (khong khoa ca server)', doc('giftcode-acc.txt') === accTruoc);
  CHARS = keep;

  // cong mod khong goi duoc
  const lm = await fetch('http://127.0.0.1:' + ctx.publicPort + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'mod' }) }).then((x) => x.json());
  for (const p of ['/api/gc/list', '/api/gc/tao', '/api/gc/xoa']) {
    const rm = await fetch('http://127.0.0.1:' + ctx.publicPort + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lm.token }, body: JSON.stringify({ ma: 'TLKNB999', knb: 1 }) });
    chk('cong mod bi chan ' + p, rm.status === 403, 'HTTP ' + rm.status);
  }
  chk('cong mod khong xoa duoc gi', db._giftcode.ds.some((c) => c.ma === 'TLKNB999'));

  // ===== 3. giao dien /gc.js chay trong vm voi DOM gia, api() goi server THAT =====
  const EL = {}, HANDLERS = { click: [], input: [] }, TOAST = [];
  const mkEl = (id) => ({ id, innerHTML: '', textContent: '', value: '', style: {}, disabled: false, h: {},
    addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); }, classList: { contains: () => true }, select() {}, remove() {}, appendChild() {} });
  const document = {
    getElementById: (id) => (EL[id] = EL[id] || mkEl(id)),
    createElement: (t) => mkEl('_' + t), head: { appendChild() {} }, body: { appendChild() {} },
    addEventListener: (t, f) => (HANDLERS[t] = HANDLERS[t] || []).push(f), execCommand: () => true,
  };
  const api = async (p, b) => { const x = await post(p, b === undefined ? {} : b); if (!x.j.ok) throw new Error(x.j.error || ('HTTP ' + x.st)); return x.j; };
  const sb = { document, api, toast: (m) => TOAST.push(m), uiConfirm: async () => true, icTra: (ids, cb) => { if (cb) cb(); }, ICMAP: {}, vqaIc: () => '<i></i>', navigator: {}, console };
  sb.window = sb;
  vm.runInNewContext(fs.readFileSync(D + 'giftcode.panel.js', 'utf8'), vm.createContext(sb));
  const nut = (attrs) => ({ attrs, closest(sel) { if (sel === '#gcRoot') return {}; const m = sel.match(/^\[(.+)\]$/); return m && m[1] in this.attrs ? this : null; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } });
  const bam = (attrs) => HANDLERS.click.forEach((f) => f({ target: nut(attrs), preventDefault() {} }));
  const cho = async () => { for (let i = 0; i < 30; i++) await ngu(15); };
  chk('gcLoad co tren window', typeof sb.window.gcLoad === 'function');
  sb.window.gcLoad(); await cho();
  const root = EL.gcRoot.innerHTML;
  chk('UI: khung co o TL + goi y go TL viet hoa', root.includes('class="gcTL">TL<') && root.includes('Người chơi gõ TL viết hoa + 6 ký tự (không có dấu -)') && root.includes('maxlength="8"'));
  chk('UI: danh sach ve du ma + nut copy / tat / xoa / ai da dung', ['TLABC234', 'TL7KQ9X2', 'TLKNB999'].every((m) => EL.gcList.innerHTML.includes('data-gccopy="' + m + '"')) && EL.gcList.innerHTML.includes('data-gcxoa="TLKNB999"') && EL.gcList.innerHTML.includes('data-gcdung="TLKNB999"'));
  chk('UI: ma het han hien "Đã hết hạn" + nhan Het han', EL.gcList.innerHTML.includes('Đã hết hạn') && EL.gcList.innerHTML.includes('gcB exp'));
  chk('UI: khong co dau gach dai', !/\u2014/.test(root + EL.gcList.innerHTML + EL.gcInfo.innerHTML));
  bam({ 'data-gc': 'ngaunhien' });
  chk('UI: nut Ngau nhien dien 6 ky tu (khong TL, khong -)', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(EL.gcMa.value), EL.gcMa.value);
  EL.gcMa.value = 'tl-abc'; EL.gcKnb.value = '5'; EL.gcMa.h.input[0]();
  chk('UI: ma co dau - bao loi + khoa nut Tao', /không có dấu -/.test(EL.gcSum.innerHTML) && EL.gcGo.disabled === true, EL.gcSum.innerHTML);
  EL.gcIq.value = 'hồn băng'; EL.gcIq.h.input[0].call(EL.gcIq); await cho();
  chk('UI: tim vat pham theo ten (bo dau)', EL.gcItems.innerHTML.includes('data-gcit="20309101"'), EL.gcItems.innerHTML.slice(0, 200));
  bam({ 'data-gcit': '20309101' });
  chk('UI: bam -> them vao Qua da chon SL 1', EL.gcChon.innerHTML.includes('data-gcsl="0"') && EL.gcChon.innerHTML.includes('Hồn Băng Châu'));
  HANDLERS.input.forEach((f) => f({ target: { getAttribute: (k) => (k === 'data-gcsl' ? '0' : null), value: '7' } }));
  EL.gcMa.value = 'ui2026'; EL.gcMa.h.input[0]();
  chk('UI: tom tat dung ma TLUI2026 + qua', EL.gcSum.innerHTML.includes('TLUI2026') && EL.gcSum.innerHTML.includes('Hồn Băng Châu [1 cấp] x7') && EL.gcSum.innerHTML.includes('5 KNB') && EL.gcGo.disabled === false, EL.gcSum.innerHTML);
  bam({ 'data-gc': 'tao' }); await cho();
  chk('UI: Tao ma -> server co TLUI2026 dung qua', doc('giftcode.txt').includes('TLUI2026|0|1|item 20309101 7;knb 5\n') && TOAST.some((t) => t === '✅ Đã tạo mã TLUI2026'), TOAST.join(' / '));
  chk('UI: khung "Vua tao" + form xoa trang', EL.gcMoi.innerHTML.includes('TLUI2026') && EL.gcMa.value === '' && EL.gcChon.innerHTML.includes('Chưa chọn vật phẩm'));
  bam({ 'data-gcdung': 'TLKNB999' }); await cho();
  chk('UI: Ai da dung -> bang ten nhan vat + tai khoan', EL.gcList.innerHTML.includes('KimClone') && EL.gcList.innerHTML.includes('hoang01'));
  bam({ 'data-gcbat': '0', 'data-ma': 'TLUI2026' }); await cho();
  chk('UI: nut Tat -> server tat', db._giftcode.ds.find((c) => c.ma === 'TLUI2026').on === false && !doc('giftcode.txt').includes('TLUI2026'));
  bam({ 'data-gcxoa': 'TLUI2026' }); await cho();
  chk('UI: nut Xoa (uiConfirm) -> server xoa', !db._giftcode.ds.some((c) => c.ma === 'TLUI2026'));
  chk('UI: khong goi confirm/alert/prompt', !/\b(confirm|alert|prompt)\s*\(/.test(js.replace(/uiConfirm/g, '')));

  console.log('\n' + soOk + ' OK, ' + soLoi + ' LOI');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('LOI', e); process.exit(1); });
