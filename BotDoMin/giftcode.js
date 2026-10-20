// 🎟️ 20/10 GIFTCODE TRONG GAME (chủ server). Bot quản lý mã, game kiểm + phát quà.
// Người chơi: NPC "Hồi Ức Thiên Long" > Nhập Giftcode -> eprize.lua x888899_GCNhap (repo game tools/giftcode-20-10.js).
// Ba file trong Server/txt/NetCo4Web/ (cùng DIR với tlbb.js / thuongpho.js), ASCII, xuống dòng LF, ghi nguyên tử (tmp + rename):
//   giftcode.txt       BOT GHI   CODE|hetHan|tongLuot|qua      (mỗi mã ĐANG BẬT 1 dòng; mã tắt / xoá không ghi; mã hết hạn vẫn ghi để game báo "hết hạn")
//                                 hetHan = epoch giây (0 = không hết hạn), tongLuot = tổng lượt cả server (0 = không giới hạn)
//                                 qua = các dòng hàng quà NetCo4Qua nối bằng ";" : item <id> <n> ; knb <n> ; vang <đồng> ; diemtang <n>
//                                 (game chép NGUYÊN từng đoạn vào NetCo4Qua/<GUID>.txt -> vang là ĐỒNG: 1 vàng = 10000, knb chia dòng <= 99999 như panel GM)
//   giftcode-acc.txt   BOT GHI   <guid> <tài khoản>   (tài khoản chữ thường) - làm mới mỗi 60 giây + ngay sau khi đổi mã. Game từ chối GUID chưa có.
//   giftcode-dung.txt  GAME GHI  CODE|tài khoản|guid|epoch   (game ghi thêm; bot CHỈ ĐỌC, không bao giờ ghi lại)
// "Mỗi tài khoản 1 lần / mã" và "tổng lượt" do game kiểm (đếm dòng trong giftcode-dung.txt).
// Lưu ở database bot: db._giftcode = { ds: [{ ma, hetHan, tongLuot, qua: { items: [{ id, n }], knb, vangDong, diemtang }, ghiChu, on, tao, boi }] }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('./tlbb');

const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // bỏ 0 O 1 I L (dễ đọc nhầm)
// 20/10 (client game): mã đúng 8 ký tự = "TL" + 6 ký tự A-Z / 0-9. Client chỉ gửi mã gõ "TL" viết hoa + 6 ký tự, không gõ được dấu "-".
const RE_MA = /^TL[A-Z0-9]{6}$/;
const F_CODE = 'giftcode.txt', F_ACC = 'giftcode-acc.txt', F_DUNG = 'giftcode-dung.txt';
const KNB_DONG = 99999;          // YuanBao mỗi dòng tối đa 99.999 (panel GM chia dòng y vậy)
const VANG_DONG = 10000;         // 1 vàng = 100 bạc = 10000 đồng (AddMoney nhận đồng)
const MAX = { items: 20, sl: 9999, knb: 10000000, vang: 100000, diemtang: 10000000, luot: 100000, ghiChu: 200 };
const EPOCH_MAX = 2147483647;

// thư mục file giao tiếp: lấy từ tlbb.js (TLBB_ROOT), test đặt GIFTCODE_DIR / TLBB_ROOT
function dir() {
    if (process.env.GIFTCODE_DIR) return process.env.GIFTCODE_DIR;
    if (T && T.DIR) return T.DIR;
    return path.join(process.env.TLBB_ROOT || '/opt/tlbb-root', 'home/tlbb/Server/txt/NetCo4Web');
}
// chỉ ghi khi thư mục game có thật (máy dev Windows không có /opt/... -> không tạo thư mục rác)
function gameOk() {
    const d = dir();
    return fs.existsSync(d) || fs.existsSync(path.dirname(path.dirname(d)));
}
function writeAtomic(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp${process.pid}`;
    fs.writeFileSync(tmp, text, 'latin1');
    fs.renameSync(tmp, file);
}
function docFile(file) {
    try { return fs.readFileSync(file, 'latin1'); } catch { return ''; }
}

const chuanMa = (s) => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '');
// ô nhập của admin: gõ 6 ký tự sau "TL" (tự thêm TL) hoặc cả mã 8 ký tự
const maTuNhap = (s) => { const m = chuanMa(s); return m.length === 6 ? 'TL' + m : m; };
function taoMa(co) {
    for (;;) {
        let s = 'TL';
        for (let i = 0; i < 6; i++) s += ABC[crypto.randomInt(ABC.length)];
        if (!co || !co(s)) return s;
    }
}

// qua (dạng lưu) -> chuỗi cho giftcode.txt
function quaChuoi(q) {
    const out = [];
    for (const it of (q && q.items) || []) out.push(`item ${it.id} ${it.n}`);
    let k = Math.floor(Number(q && q.knb) || 0);
    while (k > 0) { const n = Math.min(KNB_DONG, k); out.push(`knb ${n}`); k -= n; }
    const v = Math.floor(Number(q && q.vangDong) || 0);
    if (v > 0) out.push(`vang ${v}`);
    const d = Math.floor(Number(q && q.diemtang) || 0);
    if (d > 0) out.push(`diemtang ${d}`);
    return out.join(';');
}
const dongCode = (c) => `${c.ma}|${Math.floor(Number(c.hetHan) || 0)}|${Math.floor(Number(c.tongLuot) || 0)}|${quaChuoi(c.qua)}`;
function noiDungCode(ds) {
    const L = (ds || []).filter((c) => c.on).map(dongCode);
    return L.length ? L.join('\n') + '\n' : '';
}

// chuỗi quà trong file -> dạng lưu (nhập file tay). Đoạn lạ bị bỏ (game cũng bỏ: chỉ nhận item / knb / vang / diemtang).
function parseQua(s) {
    const q = { items: [], knb: 0, vangDong: 0, diemtang: 0 }, bo = [];
    for (const doan of String(s || '').split(';')) {
        const t = doan.trim();
        if (!t) continue;
        let m;
        if ((m = t.match(/^item (\d{1,10}) (\d{1,6})$/)) && Number(m[2]) > 0) {
            const co = q.items.find((x) => x.id === m[1]);
            if (co) co.n += Number(m[2]); else q.items.push({ id: m[1], n: Number(m[2]) });
        } else if ((m = t.match(/^(knb|vang|diemtang) (\d{1,10})$/))) {
            q[m[1] === 'vang' ? 'vangDong' : m[1]] += Number(m[2]);
        } else bo.push(t);
    }
    return { q, bo };
}
const coQua = (q) => !!(q && ((q.items && q.items.length) || q.knb > 0 || q.vangDong > 0 || q.diemtang > 0));

// giftcode.txt -> [{ ma, hetHan, tongLuot, qua }] + dòng hỏng
function parseCodeFile(text) {
    const ds = [], hong = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
        const l = raw.trim();
        if (!l) continue;
        const m = l.match(/^([^|]+)\|(\d+)\|(\d+)\|(.*)$/);
        const ma = m ? chuanMa(m[1]) : '';
        if (!m || !RE_MA.test(ma)) { hong.push(l); continue; }
        const { q, bo } = parseQua(m[4]);
        if (!coQua(q)) { hong.push(l); continue; }
        if (ds.some((x) => x.ma === ma)) { hong.push(l); continue; }   // game lấy dòng ĐẦU, bỏ dòng trùng sau
        ds.push({ ma, hetHan: Number(m[2]), tongLuot: Number(m[3]), qua: q, bo });
    }
    return { ds, hong };
}

// giftcode-dung.txt -> [{ ma, acc, guid, t }]
function parseDung(text) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
        const m = raw.trim().match(/^([A-Za-z0-9-]{1,32})\|([^|\s]+)\|(\d{1,12})\|(\d{1,12})$/);
        if (m) out.push({ ma: m[1].toUpperCase(), acc: m[2].toLowerCase(), guid: m[3], t: Number(m[4]) });
    }
    return out;
}

// dòng giftcode-acc.txt: tài khoản ASCII in được, không cách, không "|" (game ghi tài khoản vào giftcode-dung.txt bằng "|")
const accOk = (a) => /^[\x21-\x7b\x7d\x7e]{1,40}$/.test(a);
function noiDungAcc(rows) {
    const L = [];
    for (const r of rows || []) {
        const g = String(r && r.guid || ''), a = String(r && r.account || '').trim().toLowerCase();
        if (/^\d{1,12}$/.test(g) && accOk(a)) L.push(`${g} ${a}`);
    }
    return L.length ? L.join('\n') + '\n' : '';
}

const soNguyen = (v, def) => {
    if (v === undefined || v === null || String(v).trim() === '') return def;
    const n = Number(v);
    return Number.isInteger(n) ? n : NaN;
};

// kiểm form tạo mã. ds = mã đang có; idOk(id) = ID có trong danh mục; dungMa = { MA: số lượt trong giftcode-dung.txt }
function kiemTao(b, ds, idOk, dungMa, now) {
    b = b || {};
    let ma = maTuNhap(b.ma);
    if (!ma) ma = taoMa((s) => ds.some((x) => x.ma === s) || !!(dungMa && dungMa[s]));
    if (!RE_MA.test(ma)) return { error: 'Mã phải đúng 8 ký tự: TL + 6 ký tự chữ A-Z hoặc số 0-9 (không có dấu -). Người chơi gõ TL viết hoa + 6 ký tự' };
    if (ds.some((x) => x.ma === ma)) return { error: `Mã ${ma} đã có (không phân biệt hoa thường)` };
    if (dungMa && dungMa[ma]) return { error: `Mã ${ma} từng có ${dungMa[ma]} lượt dùng (mã cũ đã xoá) - tạo lại sẽ bị tính lượt cũ, hãy đặt mã khác` };
    const hetHan = soNguyen(b.hetHan, 0);
    if (!(hetHan === 0 || (hetHan > 0 && hetHan <= EPOCH_MAX))) return { error: 'Hạn dùng không hợp lệ' };
    if (hetHan && hetHan <= now) return { error: 'Hạn dùng đã qua - chọn thời điểm trong tương lai (hoặc để trống = không hết hạn)' };
    const tongLuot = soNguyen(b.tongLuot, 1);
    if (!(tongLuot >= 0 && tongLuot <= MAX.luot)) return { error: 'Tổng lượt 0 - 100.000 (0 = không giới hạn)' };
    const items = [];
    const vao = Array.isArray(b.items) ? b.items : [];
    for (const x of vao) {
        const id = String(x && x.id != null ? x.id : '').trim(), n = soNguyen(x && x.n, NaN);
        if (!/^\d{1,10}$/.test(id)) return { error: 'ID vật phẩm không hợp lệ: ' + id.slice(0, 20) };
        if (!idOk(id)) return { error: 'ID ' + id + ' không có trong danh mục vật phẩm game' };
        if (!(n >= 1 && n <= MAX.sl)) return { error: 'Số lượng vật phẩm ' + id + ' phải 1 - 9.999' };
        const co = items.find((y) => y.id === id);
        if (co) { co.n += n; if (co.n > MAX.sl) return { error: 'Tổng số lượng vật phẩm ' + id + ' vượt 9.999' }; } else items.push({ id, n });
    }
    if (items.length > MAX.items) return { error: 'Tối đa ' + MAX.items + ' loại vật phẩm mỗi mã' };
    const knb = soNguyen(b.knb, 0), vang = soNguyen(b.vang, 0), diemtang = soNguyen(b.diemtang, 0);
    if (!(knb >= 0 && knb <= MAX.knb)) return { error: 'KNB 0 - 10.000.000' };
    if (!(vang >= 0 && vang <= MAX.vang)) return { error: 'Vàng 0 - 100.000' };
    if (!(diemtang >= 0 && diemtang <= MAX.diemtang)) return { error: 'Điểm Tặng 0 - 10.000.000' };
    const qua = { items, knb, vangDong: vang * VANG_DONG, diemtang };
    if (!coQua(qua)) return { error: 'Chưa có quà: thêm ít nhất 1 vật phẩm hoặc KNB / Vàng / Điểm Tặng' };
    const ghiChu = String(b.ghiChu == null ? '' : b.ghiChu).replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX.ghiChu);
    return { code: { ma, hetHan, tongLuot, qua, ghiChu, on: true } };
}

function trangThai(c, daDung, now) {
    if (!c.on) return 'tat';
    if (c.hetHan > 0 && now > c.hetHan) return 'hethan';
    if (c.tongLuot > 0 && daDung >= c.tongLuot) return 'hetluot';
    return 'bat';
}

// ctx: { getDb, saveDbNow, writeLog }
function taoGiftcode(ctx) {
    const log = (s) => { try { ctx.writeLog('ADMIN', '[GIFTCODE] ' + s); } catch { /* bỏ qua */ } };
    const logHt = (s) => { try { ctx.writeLog('SYSTEM', '[GIFTCODE] ' + s); } catch { /* bỏ qua */ } };
    const st = () => {
        const db = ctx.getDb();
        if (!db._giftcode || typeof db._giftcode !== 'object' || !Array.isArray(db._giftcode.ds)) db._giftcode = { ds: [] };
        return db._giftcode;
    };
    const fileOf = (f) => path.join(dir(), f);
    let chars = [], charsAt = 0, accN = 0, accLoi = '', dangLam = null, lastAcc = null, timer = null;

    const items = () => { try { return (T.items && T.items()) || []; } catch { return []; } };
    const dungAll = () => parseDung(docFile(fileOf(F_DUNG)));
    const demDung = (L) => { const d = {}; for (const x of L) d[x.ma] = (d[x.ma] || 0) + 1; return d; };

    // ghi giftcode.txt từ danh sách ds (chưa đổi database). Trả '' hoặc cảnh báo (thư mục game không có).
    function ghiCode(ds) {
        if (!gameOk()) return 'Không thấy thư mục game (' + dir() + ') - mã đã lưu ở bot nhưng CHƯA ghi file giftcode.txt';
        writeAtomic(fileOf(F_CODE), noiDungCode(ds));
        return '';
    }

    // giftcode-acc.txt: GUID -> tài khoản. Lỗi đọc database game thì GIỮ file cũ.
    function lamMoiAcc() {
        if (dangLam) return dangLam;
        dangLam = (async () => {
            try {
                if (typeof T.listChars !== 'function') throw new Error('tlbb.listChars không có');
                const rows = await T.listChars();
                chars = Array.isArray(rows) ? rows : []; charsAt = Date.now();
                if (!gameOk()) return { ok: false, msg: 'Không thấy thư mục game' };
                const text = noiDungAcc(chars), f = fileOf(F_ACC);
                if (!text && docFile(f).trim()) return { ok: false, msg: 'Danh sách nhân vật rỗng - giữ file cũ' };
                if (text !== lastAcc || !fs.existsSync(f)) { writeAtomic(f, text); lastAcc = text; }
                accN = text ? text.split('\n').length - 1 : 0;
                if (accLoi) { logHt('Đọc lại được danh sách nhân vật (' + accN + ' nhân vật)'); accLoi = ''; }
                return { ok: true, n: accN };
            } catch (e) {
                const m = String(e && e.message || e).slice(0, 160);
                if (m !== accLoi) logHt('Không làm mới được giftcode-acc.txt: ' + m);
                accLoi = m;
                return { ok: false, msg: m };
            } finally { dangLam = null; }
        })();
        return dangLam;
    }

    // khởi động: database chưa có mã mà giftcode.txt có -> nhập (giữ mã admin tự viết tay để thử). Rồi ghi lại file theo database.
    function init() {
        const s = st();
        if (!s.ds.length && gameOk()) {
            const text = docFile(fileOf(F_CODE));
            if (text.trim()) {
                const { ds, hong } = parseCodeFile(text);
                for (const x of ds) s.ds.push({ ma: x.ma, hetHan: x.hetHan, tongLuot: x.tongLuot, qua: x.qua, ghiChu: 'nhập từ file', on: true, tao: Date.now(), boi: 'file' });
                if (ds.length) { ctx.saveDbNow(); log('Nhập ' + ds.length + ' mã từ giftcode.txt: ' + ds.map((x) => x.ma).join(', ')); }
                if (hong.length) logHt('giftcode.txt có ' + hong.length + ' dòng bỏ qua khi nhập (mã phải TL + 6 ký tự A-Z/0-9, hoặc dòng sai dạng / không có quà / trùng): ' + hong.slice(0, 5).join(' / ').slice(0, 300));
            }
        }
        try { ghiCode(s.ds); } catch (e) { logHt('Không ghi được giftcode.txt: ' + e.message); }
        lamMoiAcc();
        if (!timer) { timer = setInterval(lamMoiAcc, 60000); if (timer.unref) timer.unref(); }
    }

    function tenMon() { const m = new Map(); for (const x of items()) m.set(String(x.id), x.n); return m; }

    function list() {
        const now = Math.floor(Date.now() / 1000), dung = dungAll(), dem = demDung(dung), ten = tenMon();
        const co = new Set(st().ds.map((c) => c.ma));
        const ds = st().ds.map((c) => ({
            ma: c.ma, hetHan: c.hetHan, tongLuot: c.tongLuot, ghiChu: c.ghiChu || '', on: !!c.on, tao: c.tao || 0, boi: c.boi || '',
            qua: { items: c.qua.items.map((x) => ({ id: x.id, n: x.n, ten: ten.get(String(x.id)) || '' })), knb: c.qua.knb || 0, vang: (c.qua.vangDong || 0) / VANG_DONG, diemtang: c.qua.diemtang || 0 },
            chuoi: quaChuoi(c.qua), daDung: dem[c.ma] || 0, trangThai: trangThai(c, dem[c.ma] || 0, now),
        }));
        const le = Object.keys(dem).filter((m) => !co.has(m)).map((m) => ({ ma: m, n: dem[m] }));
        return { now, ds, le, gameOk: gameOk(), accN, accAt: charsAt, accLoi };
    }

    function dung(ma) {
        ma = chuanMa(ma);
        const ten = new Map(chars.map((r) => [String(r.guid), r.name]));
        const ds = dungAll().filter((x) => x.ma === ma).map((x) => ({ ten: ten.get(x.guid) || '', acc: x.acc, guid: x.guid, t: x.t })).sort((a, b) => b.t - a.t);
        return { ma, ds };
    }

    async function tao(body, who) {
        const now = Math.floor(Date.now() / 1000), s = st();
        const gi = items();
        if (!gi.length && Array.isArray(body && body.items) && body.items.length) return { error: 'Bot chưa tải xong danh mục vật phẩm game, thử lại sau 1 phút' };
        const ids = new Set(gi.map((x) => String(x.id)));
        const r = kiemTao(body, s.ds, (id) => ids.has(id), demDung(dungAll()), now);
        if (r.error) return r;
        const c = { ...r.code, tao: Date.now(), boi: String(who || '') };
        const moi = s.ds.concat([c]);
        let canhBao;
        try { canhBao = ghiCode(moi); } catch (e) { return { error: 'Không ghi được giftcode.txt: ' + e.message, st: 500 }; }
        s.ds = moi; ctx.saveDbNow();
        log(`${who} tạo mã ${c.ma}: ${quaChuoi(c.qua)} | hạn ${c.hetHan ? new Date(c.hetHan * 1000).toISOString() : 'không'} | ${c.tongLuot || 'không giới hạn'} lượt${c.ghiChu ? ' | ' + c.ghiChu : ''}`);
        await lamMoiAcc();
        return { ma: c.ma, dong: dongCode(c), canhBao: canhBao || undefined };
    }

    async function doi(ma, fn, moTa, who) {
        ma = chuanMa(ma);
        const s = st(), i = s.ds.findIndex((c) => c.ma === ma);
        if (i < 0) return { error: 'Không có mã ' + ma, st: 404 };
        const moi = fn(s.ds.slice(), i);
        let canhBao;
        try { canhBao = ghiCode(moi); } catch (e) { return { error: 'Không ghi được giftcode.txt: ' + e.message, st: 500 }; }
        s.ds = moi; ctx.saveDbNow();
        log(`${who} ${moTa} mã ${ma}`);
        await lamMoiAcc();
        return { ma, canhBao: canhBao || undefined };
    }
    const bat = (ma, on, who) => doi(ma, (ds, i) => { ds[i] = { ...ds[i], on: !!on }; return ds; }, on ? 'BẬT' : 'TẮT', who);
    const xoa = (ma, who) => doi(ma, (ds, i) => { ds.splice(i, 1); return ds; }, 'XOÁ', who);

    return { init, list, dung, tao, bat, xoa, lamMoiAcc, _st: st };
}

module.exports = taoGiftcode;
Object.assign(module.exports, { ABC, RE_MA, F_CODE, F_ACC, F_DUNG, dir, chuanMa, maTuNhap, taoMa, quaChuoi, dongCode, noiDungCode, parseQua, parseCodeFile, parseDung, noiDungAcc, kiemTao, trangThai });
