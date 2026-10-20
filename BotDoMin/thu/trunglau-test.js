// Test giao dien Custom Trung Lau (trunglau.panel.js = /tl.js) tren may Windows: chay file THAT trong vm voi DOM gia + api() gia
// tra du lieu that (tl-xem.json, op 'xem' cua panel GM). Bam qua: chon mon, tick dong, doi diem, so dong ra, loc, lay tu ma khac,
// hieu ung, chep sang Chan, chep giong, tra goc, restart, ai giu, Long Van. So payload gui server voi ban CU (9b2a9ef = truoc khi lam lai UI, doi bang TL_CU) tung byte.
// Chay (tu BotDoMin): node thu/trunglau-test.js   (TL_XEM=duong/dan/tl-xem.json neu de cho khac; khong dung VPS / game)
const path = require('path'), fs = require('fs'), vm = require('vm'), cp = require('child_process');
const D = path.join(__dirname, '..') + path.sep;
const XEM = process.env.TL_XEM || 'D:/Thiên Long Bát Bộ NetCo4/scratchpad-claude/tl-xem.json';
if (!fs.existsSync(XEM)) { console.log('Thieu ' + XEM + ' (lay bang POST /api/gm/trunglau {op:"xem"}), dat TL_XEM=...'); process.exit(2); }
const GOC = JSON.parse(fs.readFileSync(XEM, 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
let soOk = 0, soLoi = 0;
const chk = (ten, dk, them) => { console.log((dk ? 'OK  ' : 'LOI ') + ten + (them ? ' | ' + them : '')); if (dk) soOk++; else { soLoi++; process.exitCode = 1; } };
const ngu = () => new Promise((r) => setImmediate(r));
const cho = async () => { for (let i = 0; i < 8; i++) await ngu(); };
const chu = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const LOI_JS = [];
process.on('unhandledRejection', (e) => { LOI_JS.push('unhandledRejection: ' + (e && e.stack || e)); });

// du lieu: tl-xem.json + 10422018 (server them sau lan deploy toi, clone 10422016) + chanDich admin (server se doi)
function taoData(coMaMoi) {
  const d = clone(GOC.data);
  if (coMaMoi !== false && !d.mon.some((m) => m.id === '10422018')) {
    const g = clone(d.mon.find((m) => m.id === '10422016'));
    g.id = '10422018'; g.gd = 'giao dịch được'; g.chanDich = ''; d.mon.push(g);
  }
  if (coMaMoi === false) d.mon = d.mon.filter((m) => m.id !== '10422018');
  d.mon.forEach((m) => { if (m.id === '10553113') m.chanDich = coMaMoi === false ? m.chanDich : '10422018'; if (m.id === '10553114') m.chanDich = '10423025'; });
  return d;
}

// server gia: ghi lai moi body, ap thay doi don gian vao du lieu de giao dien ve lai dung
function taoServer(data) {
  const S = { data, CALLS: [], loi: false };
  S.api = async (p, b) => {
    S.CALLS.push(JSON.stringify(b));
    if (p !== '/api/gm/trunglau') throw new Error('sai duong dan ' + p);
    if (b.op === 'xem') return { ok: true, data: clone(S.data), online: 7 };
    if (b.op === 'giu') return { ok: true, giu: [{ guid: '1010100017', nv: 'bialk', acc: 'bialk', id: '10553101', ten: 'Trùng Lâu Giới', pos: 101, cho: 'đang mặc' }, { guid: '1010100020', nv: 'Kim', acc: 'hoang01', id: '10422016', ten: 'Trùng Lâu Giới', pos: 3, cho: 'túi' }, { guid: '1', nv: 'x', acc: 'x', id: '99999999', ten: 'khac', pos: 1, cho: 'túi' }] };
    if (S.loi) { const e = new Error('panel GM gia loi'); e.toasted = true; throw e; }
    const d = S.data, cfg = d.cfg = d.cfg || {}, m = d.mon.find((x) => x.id === b.id);
    if (b.op === 'mon') {
      cfg.mon = cfg.mon || {}; cfg.mon[b.id] = { dong: b.dong.slice().sort((a, c) => a - c), diem: b.diem, t: 1792500000, ai: 'SUPER test' };
      if (b.so) cfg.mon[b.id].so = b.so;
      m.dong = cfg.mon[b.id].dong; Object.keys(b.diem).forEach((k) => { m.diem[k] = b.diem[k]; }); m.soDong = b.so || [b.dong.length, b.dong.length];
    } else if (b.op === 'xoa') {
      if (cfg.mon) delete cfg.mon[b.id]; if (m) { m.dong = m.dongGoc.slice(); m.diem = m.diemGoc.slice(); m.soDong = m.soDongGoc.slice(); }
    } else if (b.op === 'hu') {
      cfg.hu = b.hu; d.mon.forEach((x) => { if (x.hu && b.hu[x.hu.id]) Object.assign(x.hu.tham, b.hu[x.hu.id]); });
    } else if (b.op === 'chep') {
      const c = d.mon.find((x) => x.id === m.chanDich); c.dong = m.dong.slice(); cfg.mon = cfg.mon || {}; cfg.mon[c.id] = { dong: c.dong, diem: {}, t: 1, ai: 'chep' };
    }
    return { ok: true, msg: 'Da ' + b.op + ' ' + (b.id || ''), data: clone(d) };
  };
  return S;
}

// DOM gia: phan tu chi "ton tai" khi id cua no nam trong HTML dang ve (hoac la khung goc) -> bat loi getElementById tra null
function taoDom() {
  const els = {}, goc = new Set();
  const mk = (id) => {
    const cls = new Set(); let html = '';
    const o = { id, style: {}, dataset: {}, value: '', textContent: '', className: '', cuon: 0,
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle(c, on) { if (on === undefined) on = !cls.has(c); if (on) cls.add(c); else cls.delete(c); return on; } },
      get innerHTML() { return html; },
      set innerHTML(v) { html = String(v); if (goc.has(o.id)) Object.keys(els).forEach((k) => { if (!goc.has(k)) delete els[k]; }); },
      scrollIntoView() { o.cuon++; }, focus() {}, addEventListener() {} };
    return o;
  };
  const coTrongHtml = (id) => Object.values(els).some((x) => x.innerHTML.includes('id="' + id + '"'));
  const them = (id) => { const x = mk(id); els[id] = x; goc.add(id); return x; };
  const tlBox = them('tlBox');
  tlBox.parentNode = { className: 'quaTool', nextSibling: null, parentNode: { insertBefore: (m) => { if (m.innerHTML.includes('id="lvBox"')) them('lvBox'); } } };
  const document = {
    getElementById: (id) => els[id] || (coTrongHtml(id) ? (els[id] = mk(id)) : null),
    createElement: () => mk(''), head: { appendChild: (s) => { if (s.id) { els[s.id] = s; goc.add(s.id); } } },
  };
  return { els, document };
}

function chay(file, src, data, traLoi) {
  const S = taoServer(data), DOM = taoDom(), TOAST = [], HOI = [];
  const sb = { document: DOM.document, console, Promise, Date, Number, String, Object, Array, Math, JSON, Error, RegExp, isFinite, setTimeout: () => 0, clearTimeout: () => {},
    api: S.api, toast: (m) => TOAST.push(String(m)), uiConfirm: (m, nut, cls) => { HOI.push({ m: String(m), nut, cls }); return Promise.resolve(sb.TRA_LOI); }, TRA_LOI: traLoi !== false };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: file });
  const html = (id) => { const x = DOM.document.getElementById(id); return x ? x.innerHTML : ''; };
  // bam nut that: tim <button ...onclick="..."> co chu chua `chuBtn` trong HTML khung, chay dung chuoi onclick
  const bam = (box, chuBtn) => {
    const re = /<button([^>]*)onclick="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g; let m;
    const h = Object.values(DOM.els).map((x) => x.innerHTML).join('\n');
    while ((m = re.exec(h))) if (chu(m[4]).includes(chuBtn)) { if (/\bdisabled\b/.test(m[1] + m[3])) return 'disabled'; vm.runInContext(m[2].replace(/&quot;/g, '"').replace(/&#39;/g, "'"), sb); return true; }
    return false;
  };
  return { S, DOM, TOAST, HOI, sb, html, bam, el: (id) => DOM.document.getElementById(id) };
}
const MOI = fs.readFileSync(D + 'trunglau.panel.js', 'utf8');
let CU = '';
try { CU = cp.execSync('git show ' + (process.env.TL_CU || '9b2a9ef') + ':BotDoMin/trunglau.panel.js', { cwd: path.join(D, '..'), maxBuffer: 16 << 20 }).toString('utf8'); } catch (e) { CU = ''; }
const oNhap = (h, k, v, c) => { const s = new Set(); return { dataset: { h, k, c: String(c || 1) }, value: String(v), classList: { add: (x) => s.add(x), toggle() {}, contains: (x) => s.has(x) } }; };

// kich ban gui lenh giong nhau cho ban CU va ban MOI -> so payload
async function kichBan(G, moi) {
  const sb = G.sb, xn = async (fn) => { sb[fn](); await cho(); if (!moi) { sb[fn](); await cho(); } };   // ban cu: bam 2 lan; ban moi: uiConfirm
  sb.tlLoad(); await cho();
  sb.tlChon('10553101'); sb.tlDong(1, true); sb.tlDong(3, false); sb.tlDiem(0, '15000'); sb.tlDiem(6, '301'); sb.tlLuuMon(); await cho();
  sb.tlChon('10553102'); sb.tlSo(0, '10'); sb.tlLuuMon(); await cho();
  sb.tlChon('10553106'); sb.tlDong(2, true); sb.tlSo(0, '9'); sb.tlSo(1, '11'); sb.tlLuuMon(); await cho();
  sb.tlHuSua(oNhap('7509', 'rate', 5)); sb.tlHuSua(oNhap('7514', 'dur', 12, 1000)); sb.tlLuuHu(); await cho();
  sb.tlChon('10553113'); await xn('tlChep');
  sb.tlChon('10553104'); await xn('tlGiong');
  sb.tlChon('10553100'); if (moi) { sb.tlBoMon(); } else { sb.tlBoMon(); } await cho();
  await xn('tlRestart');
  sb.lvLoad(); await cho();
  sb.lvChon('10157009'); sb.lvDong(0, false); sb.lvDiem(1, '77'); sb.lvLuuMon(); await cho();
  return G.S.CALLS.filter((c) => !/"op":"(xem|giu)"/.test(c));
}

(async () => {
  // ===== 0. ma nguon
  chk('node --check trunglau.panel.js', (() => { try { new vm.Script(MOI); return true; } catch (e) { return false; } })());
  chk('khong dung confirm()/alert()/prompt()', !/(^|[^.\w])(confirm|alert|prompt)\s*\(/m.test(MOI.replace(/uiConfirm/g, '')));
  chk('khong co dau gach dai (U+2014)', !MOI.includes('\u2014'));
  chk('file giu CRLF', !/(^|[^\r])\n/.test(MOI) && MOI.includes('\r\n'));

  // ===== 1. ve trang Trung Lau
  const G = chay('trunglau.panel.js', MOI, taoData());
  chk('tai file tao tlLoad + lvLoad + khung lvBox chen sau tlBox', typeof G.sb.tlLoad === 'function' && typeof G.sb.lvLoad === 'function' && !!G.DOM.els.lvBox);
  G.sb.tlLoad(); await cho();
  let h = G.html('tlBox'), t = chu(h);
  chk('ve xong, goi op xem', G.S.CALLS[0] === '{"op":"xem"}' && h.length > 5000, 'HTML ' + h.length);
  chk('khong co undefined / NaN / [object', !/undefined|NaN|\[object/.test(h), (h.match(/.{40}(undefined|NaN|\[object).{20}/) || [''])[0]);
  const thuTu = ['Giới (nhẫn) người chơi', 'Ngọc (hộ phù) người chơi', 'Giới admin (chỉ admin / gift code)', 'Ngọc admin (chỉ admin / gift code)', 'Liên (dây chuyền)', 'Đai (thắt lưng)', 'Vai (hộ kiên)', 'Giáp (áo)', 'Mũ Giáng Sinh'];
  const viTri = thuTu.map((x) => t.indexOf(x));
  chk('9 nhom dung thu tu chu server 20/10', viTri.every((x, i) => x >= 0 && (i === 0 || x > viTri[i - 1])), viTri.join(','));
  const nhomHtml = (ten) => { const a = h.indexOf(ten), b = h.indexOf('class="tlG', a); return h.slice(a, b < 0 ? undefined : b); };
  const gG = nhomHtml('Giới (nhẫn) người chơi'), gA = nhomHtml('Giới admin'), gNA = nhomHtml('Ngọc admin'), gMu = nhomHtml('Mũ Giáng Sinh');
  chk('Gioi nguoi choi: Su kien 10422016 + Doi NPC 10553101 -> Chan 10553104, nhan Nguoi choi', /Sự kiện[\s\S]*10422016[\s\S]*Đổi NPC[\s\S]*10553101[\s\S]*nâng lên Chân[\s\S]*Chân[\s\S]*10553104/.test(gG) && gG.includes('👤 Người chơi'));
  chk('Gioi admin: Ban thuong 10553113 -> Chan (admin) 10422018, nhan Chi admin', /Bản thường[\s\S]*10553113[\s\S]*nâng lên Chân admin \(NPC\)[\s\S]*Chân \(admin\)[\s\S]*10422018/.test(gA) && gA.includes('🛡️ Chỉ admin'));
  chk('Ngoc admin: 10553114 -> Chan (admin) 10423025', /10553114[\s\S]*Chân \(admin\)[\s\S]*10423025/.test(gNA));
  chk('Mu: 3 mu + % sat thuong lay tu server (khong ghi cung)', /10410121[\s\S]*\+10% sát thương[\s\S]*10410127[\s\S]*\+9% sát thương[\s\S]*10410126[\s\S]*\+8% sát thương/.test(gMu), chu(gMu).slice(0, 200));
  chk('khong con nhom rieng "ban cu" 10423025', !t.includes('bản cũ'));
  const d0 = G.S.data, IDS = [].concat(...thuTu.map(() => [])), coMa = d0.mon.map((m) => m.id);
  const nCfg = Object.keys(d0.cfg.mon).filter((i) => coMa.includes(i) && !/^10157/.test(i)).length, nTong = coMa.filter((i) => !/^10157/.test(i)).length;
  chk('thanh tren: ' + nCfg + ' / ' + nTong + ' ma da chinh, ' + Object.keys(d0.cfg.hu).length + ' hieu ung, 7 online', t.includes(nCfg + ' / ' + nTong + ' mã đã chỉnh') && t.includes(Object.keys(d0.cfg.hu).length + ' hiệu ứng đã chỉnh') && t.includes('7 người online'), (t.match(/\d+ \/ \d+ mã đã chỉnh/) || [''])[0]);
  const soChinh = (h.match(/tlB-chinh">● Đã chỉnh/g) || []).length, soGoc = (h.match(/tlB-goc">Gốc</g) || []).length;
  chk('trang thai tung mon: Da chinh / Goc', soChinh >= nCfg && soGoc >= 1, soChinh + ' đã chỉnh, ' + soGoc + ' gốc');
  const tenHam = (s) => [...s.matchAll(/on(?:click|input|change)="(\w+)\(/g)].map((m) => m[1]);
  const thieuHam = (s) => [...new Set(tenHam(s))].filter((f) => typeof G.sb[f] !== 'function');
  chk('moi onclick/oninput/onchange tro toi ham co that', !thieuHam(h).length, thieuHam(h).join(','));
  chk('ma mac dinh 10553102 (Ngoc doi NPC) dang mo, co luong Su kien + Doi NPC -> Chan', /Luồng:[\s\S]*10423024[\s\S]*10553102[\s\S]*→[\s\S]*10553105/.test(h) && t.includes('Trùng Lâu Ngọc Đổi NPC'));

  // ===== 2. bang dong: tick, doi diem, diff, thanh luu
  G.bam('tlBox', 'Đổi NPC 10553101'); await cho();
  h = G.html('tlBox'); t = chu(h);
  const m101 = d0.mon.find((m) => m.id === '10553101');
  chk('bam chon 10553101 (bang onclick that)', t.includes('Trùng Lâu Giới Đổi NPC') && h.includes('id="tlRow0"'));
  chk('bang co cot Goc / Dang / Diem moi / Engine ra / Thay doi', ['Gốc', 'Đang', 'Điểm mới', 'Engine ra', 'Thay đổi'].every((x) => h.includes('>' + x + '</th>')));
  const hang = [...h.matchAll(/id="tlRow(\d+)"/g)].map((m) => Number(m[1]));
  chk('hang: dong dang bat len truoc (thu tu co dinh), du dong goc + dang bat', hang.slice(0, m101.dong.length).every((k) => m101.dong.includes(k)) && [...new Set(m101.dong.concat(m101.dongGoc))].every((k) => hang.includes(k)), hang.join(','));
  chk('dong 3 (MP) khac goc -> cot Dang xanh', /id="tlRow3"[\s\S]*?tlKhacGoc">6\.000/.test(h));
  chk('thanh luu: khong co thay doi, nut Luu bi khoa', G.html('tlBox').includes('không có thay đổi chưa lưu') && G.bam('tlBox', 'Lưu mã 10553101') === 'disabled');
  G.sb.tlDong(1, true); G.sb.tlDong(3, false);
  h = G.html('tlBox');
  const hang2 = [...h.matchAll(/id="tlRow(\d+)"/g)].map((m) => Number(m[1]));
  chk('tick / bo tick: hang khong nhay cho', JSON.stringify(hang.filter((k) => hang2.includes(k))) === JSON.stringify(hang2.filter((k) => hang.includes(k))));
  chk('dong 1 "+ bat moi", dong 3 "− se bo"', /id="tlRow1" class="doi"[\s\S]*?\+ bật mới/.test(h) && /id="tlRow3" class="off doi"[\s\S]*?− sẽ bỏ/.test(h));
  chk('thanh luu: 2 thay doi (+1 dong, −1 dong), o Nhap ben bang chon', chu(h).includes('✎ 2 thay đổi chưa lưu ở Đổi NPC 10553101: +1 dòng, −1 dòng') && /10553101[\s\S]{0,400}✎ Nháp/.test(h) && chu(h).includes('1 mã có nháp chưa lưu'));
  G.sb.tlDiem(0, '15000', oNhap()); G.sb.tlDiem(6, '301');
  chk('go diem: chi cap nhat o (khong ve lai ca trang), Doi "12.000 → 15.000"', G.el('tlDoi0').innerHTML.includes('12.000 → 15.000') && G.el('tlRa0').textContent === '15.000' && G.el('tlRow0').className === 'doi');
  chk('go 301 o dong he so 180 -> canh bao "chi co 299 / 301" hoac tuong tu', /⚠ chỉ có/.test(G.el('tlRa6').textContent) || G.el('tlRa6').textContent === '301', G.el('tlRa6').textContent);
  chk('thanh luu cap nhat: 4 thay doi, 2 diem', G.el('tlBar').innerHTML.includes('4 thay đổi chưa lưu') && G.el('tlBar').innerHTML.includes('2 điểm') && G.el('tlBar').className.includes('doi'));
  chk('o so dem nhap tren thanh tren cap nhat', G.el('tlTop').innerHTML.includes('mã có nháp chưa lưu'));

  // ===== 3. loc dong theo ten + che do xem
  G.sb.tlTim('công');
  let tb = G.el('tlTb').innerHTML, hTim = [...tb.matchAll(/id="tlRow(\d+)"/g)].map((m) => d0.dongTen[m[1]]);
  chk('loc "công": chi hang co chu "công" (7 dong)', hTim.length === 7 && hTim.every((x) => /công/.test(x)), hTim.join(', '));
  G.sb.tlTim('CONG');
  chk('loc khong dau / hoa thuong ra cung ket qua', G.el('tlTb').innerHTML === tb);
  G.sb.tlTim('zzz');
  chk('loc khong khop -> bao "Khong co dong nao khop"', G.el('tlTb').innerHTML.includes('Không có dòng nào khớp'));
  G.sb.tlTim(''); G.sb.tlXem('het');
  h = G.html('tlBox');
  chk('xem "Moi dong game co": du ' + m101.dongCo.length + ' dong + dong "ngoai goc"', [...h.matchAll(/id="tlRow(\d+)"/g)].length >= m101.dongCo.length && h.includes('ngoài gốc'));
  G.sb.tlXem('tick');
  chk('xem "Chi dong dang bat": van hien dong vua bo (de thay "se bo")', [...G.html('tlBox').matchAll(/id="tlRow(\d+)"/g)].length === 17 && G.html('tlBox').includes('− sẽ bỏ'));
  G.sb.tlXem('goc');

  // ===== 4. luu ma -> payload
  let n0 = G.S.CALLS.length;
  chk('bam 💾 Luu ma 10553101 (nut that)', G.bam('tlBox', 'Lưu mã 10553101') === true); await cho();
  const p1 = JSON.parse(G.S.CALLS[n0] || '{}');
  chk('payload mon: op,id,dong,diem dung thu tu + gia tri', Object.keys(p1).join() === 'op,id,dong,diem' && p1.id === '10553101' && p1.dong.includes(1) && !p1.dong.includes(3) && p1.diem[0] === 15000 && p1.diem[6] === 301 && !('3' in p1.diem), G.S.CALLS[n0]);
  h = G.html('tlBox');
  chk('sau luu: Da chinh, het nhap, toast ✅', /Đổi NPC[\s\S]{0,300}10553101[\s\S]{0,400}● Đã chỉnh/.test(h) && !h.includes('mã có nháp chưa lưu') && G.TOAST.some((x) => x.startsWith('✅ Da mon')));

  // ===== 5. so dong ra
  G.sb.tlSo(0, '10');
  chk('so dong ra 10-16: ghi chu cap nhat tai cho (boc ngau nhien + xac suat)', /bốc ngẫu nhiên <b>10-16<\/b>/.test(G.el('tlSoNote').innerHTML) && /Xác suất ra/.test(G.el('tlSoNote').innerHTML));
  G.sb.tlSo(1, '40');
  chk('so dong ra sai (40 > so dong) -> canh bao + khoa Luu', G.el('tlSoNote').innerHTML.includes('⚠ Phải 1') && /disabled>💾 Lưu mã/.test(G.el('tlBar').innerHTML));
  G.sb.tlSo(-1);
  chk('↺ ra du moi dong bat -> het thay doi', G.html('tlBox').includes('không có thay đổi chưa lưu'));

  // ===== 6. nhan he so + lay tu ma khac cung nhom
  G.sb.tlChon('10553102'); G.el('tlHeSo').value = '2'; G.sb.tlNhan();
  chk('nhan × 2: diem dong 0 gap doi trong nhap', G.html('tlBox').includes('12.000 → 24.000') && G.TOAST.some((x) => /nhân điểm 16 dòng × 2/.test(x)));
  G.sb.tlHuyMon();
  chk('✖ Huy -> bo nhap', G.html('tlBox').includes('không có thay đổi chưa lưu'));
  h = G.html('tlBox');
  chk('nut 📥 Lay tu ma cung nhom: Su kien 10423024 + Chan 10553105', /📥 Lấy dòng \+ điểm đang lưu của:[\s\S]*Sự kiện[\s\S]*10423024[\s\S]*10553105/.test(h));
  const m424 = d0.mon.find((m) => m.id === '10423024');
  G.sb.tlLay('10423024');
  n0 = G.S.CALLS.length; G.sb.tlLuuMon(); await cho();
  const p2 = JSON.parse(G.S.CALLS[n0] || '{}');
  chk('lay 10423024 roi luu: dong = dong 10423024 (ma nay co so), diem theo 10423024', p2.op === 'mon' && p2.id === '10553102' && JSON.stringify(p2.dong) === JSON.stringify(m424.dong.filter((k) => d0.mon.find((m) => m.id === '10553102').dongCo.includes(k))) && p2.diem[19] === m424.diem[19], G.S.CALLS[n0]);

  // ===== 7. hieu ung
  G.sb.tlChon('10553113'); G.sb.tlTab('hu');
  h = G.html('tlBox'); t = chu(h);
  chk('10553113 tab hieu ung: canh bao DUNG CHUNG voi 10553101 (Gioi doi NPC)', t.includes('DÙNG CHUNG cho 2 mã') && t.includes('Giới (nhẫn) người chơi: Đổi NPC (10553101)') && h.includes('tlWarnTo'));
  chk('tab hieu ung co nhan "dung chung 2 ma" ngay tren nut tab', /class="tlTab on"[^>]*>✨ Hiệu ứng: Phong huyệt <span class="tlB tlB-doi">⚠ dùng chung 2 mã/.test(h));
  G.sb.tlHuSua(oNhap('7509', 'rate', 5));
  chk('sua ti le -> thanh luu "1 o hieu ung chua luu" + nut Luu hieu ung', G.el('tlBar').innerHTML.includes('1 ô hiệu ứng chưa lưu') && G.el('tlBar').innerHTML.includes('Lưu hiệu ứng (1)'));
  G.sb.tlChon('10553106'); G.sb.tlDong(2, true); G.sb.tlLuuMon(); await cho();
  chk('luu 1 ma khac KHONG lam mat o hieu ung dang sua (loi cu)', G.html('tlBox').includes('1 ô hiệu ứng chưa lưu'));
  G.sb.tlChon('10423025'); G.sb.tlTab('hu');
  chk('10423025 (cfg rate 4 = goc 4): khong hien nut ve goc thua', !G.html('tlBox').includes("tlHuGoc('5965','rate')"));
  G.sb.tlChon('10410126'); G.sb.tlTab('hu');
  chk('mu top 3: o "Sat thuong them (%)", cfg 8 = goc 8 -> chua co nut ve goc', chu(G.html('tlBox')).includes('Sát thương thêm (%) khi dính') && !G.html('tlBox').includes("tlHuGoc('7582','hs')"));
  G.sb.tlHuSua(oNhap('7582', 'hs', 12)); G.sb.tlTab('hu');
  chk('sua hs 12 (khac goc) -> hien nut "↺ ve goc", dem 2 o', G.html('tlBox').includes("tlHuGoc('7582','hs')") && G.html('tlBox').includes('2 ô hiệu ứng chưa lưu'));
  G.sb.tlHuGoc('7582', 'hs');
  chk('↺ ve goc: o hien "ve goc khi luu", dem 2 o', G.html('tlBox').includes('về gốc khi lưu') && G.html('tlBox').includes('2 ô hiệu ứng chưa lưu'));
  G.sb.tlChon('10553107'); G.sb.tlTab('hu'); G.sb.tlHuSua(oNhap('7508', 'dur', 45, 1000));
  n0 = G.S.CALLS.length; G.bam('tlBox', 'Lưu hiệu ứng (3)'); await cho();
  const p3 = JSON.parse(G.S.CALLS[n0] || '{}');
  chk('payload hu: {op,hu} co 7509 rate 5, 7508 dur 45000, bo 7582, giu 5965', Object.keys(p3).join() === 'op,hu' && p3.hu['7509'].rate === 5 && p3.hu['7508'].dur === 45000 && !p3.hu['7582'] && p3.hu['5965'].rate === 4, G.S.CALLS[n0]);
  chk('sau luu hieu ung: het o chua luu', !G.html('tlBox').includes('ô hiệu ứng chưa lưu'));

  // ===== 8. chep sang Chan / chep giong / tra goc / restart (hop xac nhan uiConfirm)
  G.sb.tlChon('10553113'); G.sb.tlTab('chep');
  h = G.html('tlBox');
  chk('10553113 tab "Chep sang Chan 10422018" (Chan admin)', h.includes('📋 Chép sang Chân 10422018') && chu(h).includes('✦ Chân (admin) 10422018'));
  G.sb.tlDong(2, true); G.sb.tlTab('chep');
  chk('dang co nhap -> khong cho chep, chi canh bao', G.html('tlBox').includes('đang có thay đổi chưa lưu') && G.bam('tlBox', 'Chép dòng sang Chân 10422018') === false);
  n0 = G.S.CALLS.length; G.sb.tlChep(); await cho();
  chk('goi tlChep khi co nhap -> toast loi, khong gui', G.S.CALLS.length === n0 && G.TOAST[G.TOAST.length - 1].includes('chưa lưu'));
  G.sb.tlHuyMon(); G.sb.TRA_LOI = false; G.bam('tlBox', 'Chép dòng sang Chân 10422018'); await cho();
  chk('hop xac nhan: bam Huy -> khong gui', G.S.CALLS.length === n0 && G.HOI.length && G.HOI[G.HOI.length - 1].m.includes('sang Chân 10422018'));
  G.sb.TRA_LOI = true; G.bam('tlBox', 'Chép dòng sang Chân 10422018'); await cho();
  chk('hop xac nhan Dong y -> {"op":"chep","id":"10553113"}', G.S.CALLS[n0] === '{"op":"chep","id":"10553113"}', G.S.CALLS[n0]);
  G.sb.tlChon('10422018');
  h = G.html('tlBox');
  chk('10422018: nhan "Chan (admin)" + ghi chu ten game khong co chu Chan + nhan dong tu 10553113', chu(h).includes('Trùng Lâu Giới ✦ Chân (admin)') && h.includes('không có chữ Chân') && /nhận dòng khi bấm 📋 Chép ở:[\s\S]*10553113/.test(h));
  G.sb.tlChon('10553104'); G.sb.tlTab('giong'); n0 = G.S.CALLS.length; G.bam('tlBox', 'Chép giống hệt sang 10553105'); await cho();
  chk('chep giong het -> {"op":"giong","id":"10553104"}', G.S.CALLS[n0] === '{"op":"giong","id":"10553104"}', G.S.CALLS[n0]);
  G.sb.tlChon('10553100'); n0 = G.S.CALLS.length; G.bam('tlBox', 'Trả mã này về gốc'); await cho();
  chk('↩ Tra ma nay ve goc -> hoi truoc roi {"op":"xoa","id":"10553100"}', G.S.CALLS[n0] === '{"op":"xoa","id":"10553100"}' && G.HOI[G.HOI.length - 1].m.includes('10553100'));
  chk('sau tra goc: 10553100 het nut Tra ve goc', !G.html('tlBox').includes('Trả mã này về gốc'));
  G.sb.tlChon('10553101'); G.sb.tlDong(1, false);
  n0 = G.S.CALLS.length; G.bam('tlBox', 'Restart game'); await cho();
  chk('restart: hoi kem so online + canh bao nhap chua luu -> {"op":"restart"}', G.S.CALLS[n0] === '{"op":"restart"}' && /7 người đang online/.test(G.HOI[G.HOI.length - 1].m) && /CHƯA LƯU/.test(G.HOI[G.HOI.length - 1].m));
  // tai lai khi con nhap -> hoi; Huy -> khong tai
  G.sb.TRA_LOI = false; n0 = G.S.CALLS.length; G.sb.tlLoad(); await cho();
  chk('tai lai khi con nhap: hoi, bam Huy -> khong goi xem, nhap con', G.S.CALLS.length === n0 && G.HOI[G.HOI.length - 1].m.includes('10553101') && G.html('tlBox').includes('thay đổi chưa lưu'));
  G.sb.TRA_LOI = true; G.sb.tlLoad(); await cho();
  chk('Dong y -> tai lai, het nhap', G.S.CALLS[n0] === '{"op":"xem"}' && !G.html('tlBox').includes('mã có nháp chưa lưu'));
  // tra tat ca
  n0 = G.S.CALLS.length; G.bam('tlBox', 'Trả tất cả Trùng Lâu về gốc'); await cho();
  const buoc = G.S.CALLS.slice(n0).filter((c) => c !== '{"op":"xem"}');
  chk('tra tat ca: moi buoc {"op":"xoa","id"} + {"op":"hu","hu":{}} cuoi, khong dung Long Van', buoc.length > 3 && buoc.slice(0, -1).every((c) => /^\{"op":"xoa","id":"\d+"\}$/.test(c) && !/1015700/.test(c)) && buoc[buoc.length - 1] === '{"op":"hu","hu":{}}', buoc.length + ' bước');
  chk('sau tra tat ca: 0 ma da chinh', chu(G.html('tlBox')).includes('0 / ' + nTong + ' mã đã chỉnh'));
  // ai dang giu
  G.sb.tlGiu(); await cho();
  h = G.html('tlBox');
  chk('ai dang giu: 2 mon Trung Lau (bo ma la), nhan nhom', /Ai đang giữ Trùng Lâu \(2\)/.test(h) && h.includes('(Đổi NPC)') && h.includes('(Sự kiện)') && !h.includes('99999999'));
  G.sb.tlChon('10553101'); G.sb.tlChiMa(true);
  chk('chi ma dang chon -> 1 nguoi', /Ai đang giữ Trùng Lâu \(1\)/.test(G.el('tlGiuBox').innerHTML));
  // loi server -> khong vo, mo khoa lai
  G.S.loi = true; G.sb.tlDong(1, true); G.sb.tlLuuMon(); await cho();
  G.S.loi = false; n0 = G.S.CALLS.length; G.sb.tlLuuMon(); await cho();
  chk('server loi -> giu nhap, lan sau gui lai duoc (khong ket "dang gui")', G.S.CALLS.length === n0 + 1 && JSON.parse(G.S.CALLS[n0]).op === 'mon');
  chk('moi ham sau khi bam van ton tai', !thieuHam(G.html('tlBox')).length, thieuHam(G.html('tlBox')).join(','));

  // ===== 9. Long Van (cung lap())
  G.sb.lvLoad(); await cho();
  h = G.html('lvBox');
  chk('Long Van ve duoc: 9 cap +1..+9, khong nhom nguoi choi / admin, khong tab hieu ung', ['+1', '+5', '+9'].every((x) => h.includes('<b>' + x + '</b>')) && !h.includes('Người chơi') && !h.includes('Hiệu ứng:') && !/undefined|NaN/.test(h));
  G.sb.lvChon('10157009'); G.sb.lvDong(0, false); n0 = G.S.CALLS.length; G.sb.lvLuuMon(); await cho();
  chk('Long Van luu -> {"op":"mon","id":"10157009",...}', /^\{"op":"mon","id":"10157009","dong":\[/.test(G.S.CALLS[n0] || ''), G.S.CALLS[n0]);
  chk('Long Van va Trung Lau khong lan ham (lvTra chi xoa ma Long Van)', typeof G.sb.lvTra === 'function' && G.sb.lvTra !== G.sb.tlTra);

  // ===== 10. ma chua co tren server (10422018 truoc deploy) -> khong vo
  const G2 = chay('trunglau.panel.js', MOI, taoData(false));
  G2.sb.tlLoad(); await cho();
  h = G2.html('tlBox');
  chk('thieu 10422018: van ve, bang chon khong co 10422018', h.length > 5000 && !/Chân \(admin\)[\s\S]{0,80}10422018/.test(veNhom(h)));
  G2.sb.tlChon('10553113');
  h = G2.html('tlBox');
  chk('thieu 10422018: luong hien "chua co tren server", chep dung chanDich server (10553104)', h.includes('10422018: chưa có trên server') && h.includes('Chép sang Chân 10553104') && h.includes('server chưa cập nhật'));

  // ===== 11. payload ban MOI == ban CU (git HEAD) tung byte, cung kich ban
  if (!CU) chk('lay ban cu tu git HEAD', false, 'khong doc duoc git show');
  else {
    const A = await kichBan(chay('cu.js', CU, taoData()), false);
    const B = await kichBan(chay('moi.js', MOI, taoData()), true);
    chk('kich ban: ' + A.length + ' lenh ghi, ban moi gui GIONG HET ban cu', A.length >= 9 && JSON.stringify(A) === JSON.stringify(B), A.map((x, i) => x === B[i] ? '=' : '\n  CU ' + x + '\n  MOI ' + B[i]).join(''));
  }
  chk('khong co loi JS ngam (unhandledRejection)', !LOI_JS.length, LOI_JS.join(' | '));
  console.log('\n' + soOk + ' / ' + (soOk + soLoi) + ' OK');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('LOI', e); process.exit(1); });
function veNhom(h) { const a = h.indexOf('class="tlGrid"'), b = h.indexOf('class="tlPane"'); return h.slice(a, b); }
