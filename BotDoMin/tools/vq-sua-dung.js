// 📜 22/10: dựng lại LỊCH SỬ SỬA BỘ QUÀ VÒNG QUAY trước khi có ghi tự động (vqsua.js) -> data/vq-sua-cu.json.
// Chạy trên VPS (thư mục bot):  node tools/vq-sua-dung.js [--ghi]
// Nguồn:
//   - mốc cấu hình: bản sao lưu DB hằng ngày /opt/tlbb-backup/hang-ngay/bot-*.json.gz (04:00), bản sao lưu cấu hình vòng quay
//     /opt/tlbb-backup/{vq-cfg,vqcfg,vongquay}*.json (lúc admin sửa), database.json hiện tại.
//   - lần bấm lưu: log nginx /var/log/nginx/access.log* (POST /api/vq/modsave | save | macdinh; referer mod.netco4.click = cổng mod).
//   - dấu vết sửa tạm (sửa rồi trả lại giữa 2 mốc): _vqLog (400 lượt gần nhất) + bảng quay đang mở của người chơi có SL khác cả 2 mốc.
// Giữa 2 mốc chỉ biết TỔNG thay đổi (tonghop: true). Giữ 10 ngày.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vqSua = require('../vqsua');

const BK = '/opt/tlbb-backup', NGINX = '/var/log/nginx';
const HAN = Date.now() - vqSua.GIU_NGAY * 86400e3;
let MAC_DINH = [];
try { MAC_DINH = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vongquay-macdinh.json'), 'utf8')); } catch { /* */ }
const chuan = (c) => (c ? { on: !!c.on, gia: c.gia, max: c.max, pool: (Array.isArray(c.pool) ? c.pool : MAC_DINH).map((p) => ({ id: +p.id, sl: +p.sl, w: +p.w, off: !!p.off })) } : null);

// 1. mốc
const moc = [];
for (const f of fs.readdirSync(path.join(BK, 'hang-ngay')).filter((f) => /^bot-\d{8}-\d{4}\.json\.gz$/.test(f))) {
    const m = f.match(/bot-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)/);
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`);
    try { const db = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(BK, 'hang-ngay', f))).toString('utf8')); moc.push({ t, nguon: f, cfg: chuan(db._vqCfg) }); } catch (e) { console.log('bo qua', f, e.message); }
}
for (const f of fs.readdirSync(BK).filter((f) => /^(vq-?cfg|vongquay-bo-qua).*\.json$/.test(f))) {
    let t = NaN; const iso = f.match(/(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/), ng = f.match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)\.json$/);
    if (iso) t = Date.parse(`${iso[1]}T${iso[2]}:${iso[3]}:${iso[4]}.${iso[5]}Z`);
    else if (ng) t = Date.parse(`${ng[1]}-${ng[2]}-${ng[3]}T${ng[4]}:${ng[5]}:00+07:00`);
    if (!(t > 0)) continue;
    try { const j = JSON.parse(fs.readFileSync(path.join(BK, f), 'utf8')); moc.push({ t, nguon: f, cfg: chuan({ ...(j.cfg || {}), pool: j.pool }) }); } catch (e) { console.log('bo qua', f, e.message); }
}
const dbNay = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.json'), 'utf8'));
moc.push({ t: Date.now(), nguon: 'database.json (hiện tại)', cfg: chuan(dbNay._vqCfg) });
moc.sort((a, b) => a.t - b.t);

// 2. lần bấm lưu (nginx)
const TH = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const lan = [];
for (const f of fs.readdirSync(NGINX).filter((f) => /^access\.log/.test(f))) {
    let txt = fs.readFileSync(path.join(NGINX, f)); if (f.endsWith('.gz')) txt = zlib.gunzipSync(txt);
    for (const l of txt.toString('utf8').split('\n')) {
        const m = l.match(/^(\S+) \S+ \S+ \[(\d\d)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-]\d{4})\] "POST \/api\/vq\/(modsave|save|macdinh) [^"]*" (\d{3}) \d+ "([^"]*)"/);
        if (!m || m[10] !== '200') continue;
        const t = Date.parse(`${m[4]}-${String(TH[m[3]] + 1).padStart(2, '0')}-${m[2]}T${m[5]}:${m[6]}:${m[7]}${m[8].slice(0, 3)}:${m[8].slice(3)}`);
        const cong = /\/\/mod\./.test(m[11]) ? 'cổng mod' : 'cổng SUPER';
        lan.push({ t, who: `${cong} ${m[1]}${m[9] === 'macdinh' ? ' (về mặc định)' : ''}` });
    }
}
lan.sort((a, b) => a.t - b.t);

// 3. dấu vết SL lạ: lượt trúng / bảng quay có SL không có ở cả 2 mốc
const trung = (dbNay._vqLog || []).map((x) => ({ t: x.t, id: +x.id, sl: +x.sl, ai: x.ten, loai: 'trúng' }));
for (const [, u] of Object.entries(dbNay)) {
    if (!u || !u.vq || !Array.isArray(u.vq.board) || !u.vq.boardT) continue;
    for (const x of u.vq.board) trung.push({ t: u.vq.boardT, id: +x.id, sl: +x.sl, ai: u.name, loai: 'bảng quay' });
}

// 4. ghép
const out = [];
for (let i = 1; i < moc.length; i++) {
    const a = moc[i - 1], b = moc[i];
    if (b.t < HAN || !a.cfg || !b.cfg) continue;
    const d = vqSua.soSanh(a.cfg, b.cfg);
    const slCo = (id) => new Set([...(vqSua.nhom(a.cfg.pool).get(String(id)) || []), ...(vqSua.nhom(b.cfg.pool).get(String(id)) || [])].map((x) => x[0]));
    const g = new Map();
    for (const x of trung) {
        if (x.t <= a.t || x.t > b.t) continue;
        const co = slCo(x.id); if (!co.size || co.has(x.sl)) continue;
        const k = x.id + ':' + x.sl; const y = g.get(k) || { id: x.id, sl: x.sl, slMoc: [...co], n: 0, tu: x.t, den: x.t, ai: new Set() };
        y.n++; y.tu = Math.min(y.tu, x.t); y.den = Math.max(y.den, x.t); y.ai.add(`${x.ai} (${x.loai})`); g.set(k, y);
    }
    const dauVet = [...g.values()].map((y) => ({ ...y, ai: [...y.ai].slice(0, 8) }));
    const l = lan.filter((x) => x.t > a.t && x.t <= b.t);
    if (vqSua.rong(d) && !dauVet.length) continue;
    out.push({ tonghop: true, tu: a.t, den: b.t, tuNguon: a.nguon, denNguon: b.nguon, lan: l, dauVet, soMon: b.cfg.pool.length, ...d });
}
const f = (t) => new Date(t + 7 * 3600e3).toISOString().replace('T', ' ').slice(5, 16);
console.log(`moc: ${moc.length}, lan bam luu: ${lan.length}, khoang co thay doi: ${out.length}`);
for (const e of out) console.log(`${f(e.tu)} -> ${f(e.den)} | luu ${e.lan.length} lan | sua ${e.sua.length} them ${e.them.length} bo ${e.bo.length} cfg ${e.cfg.length} | dau vet ${e.dauVet.map((y) => y.id + ' x' + y.sl + ' (' + y.n + ')').join(', ')}`);
if (process.argv.includes('--ghi')) { fs.writeFileSync(path.join(__dirname, '..', 'data', 'vq-sua-cu.json'), JSON.stringify(out)); console.log('DA GHI data/vq-sua-cu.json'); }
