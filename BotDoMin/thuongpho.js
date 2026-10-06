// 🏪 06/10 THƯƠNG PHỐ - kho đồ trên web cho TỪNG NHÂN VẬT (chủ server chốt 06/10):
//   - NPC Ví Web (repo tlbbnetco4, CDK/CDK.lua) chuyển TOÀN BỘ túi Đạo cụ hoặc Nguyên liệu ra kho (món an toàn).
//   - Kho gắn theo GUID nhân vật, KHÔNG theo người dùng web: đồ chỉ rút về ĐÚNG nhân vật đã gửi,
//     không tặng / bán / giao dịch trên web. Đồ CỐ ĐỊNH (khoá) giữ cờ khoá, rút về game khoá lại.
//
// GAME -> WEB: game XOÁ món khỏi túi trước rồi ghi phiếu outtp/<GUID>_<giờ>_<số>.txt, mỗi dòng
//   "<GUID> <ID> <số> <khoá 0/1> <túi 1=Đạo cụ 2=Nguyên liệu>", dòng cuối "END". Ghi phiếu lỗi thì game trả lại đồ.
//   Bot cộng kho, ghi tên phiếu vào dbCache._tpSeen + lưu đĩa TRƯỚC khi chuyển phiếu sang outtp/xong/ (không cộng trùng).
//   Phiếu game tự HOÀN (phát lỗi giữa chừng) cũng đi đường này, dòng đầu "HOAN".
// WEB -> GAME: bot trừ kho rồi ghi <GUID>.tpin (ghi tạm + đổi tên = nguyên tử), mỗi dòng
//   "<mã> <ID> <số> <khoá> <túi> <số chồng tối đa>". Game (x999999_NhanTP, lúc đăng nhập / đổi bản đồ / bấm NPC)
//   chỉ phát dòng nào đủ ô trống, ghi mã vào <GUID>.tpdone TRƯỚC khi phát (không bao giờ phát trùng).
//   KHÔNG có nút huỷ lệnh đang chờ: huỷ mà game đang đọc dở là thành 2 bộ đồ.
//   Bot KHÔNG BAO GIỜ ghi .tpdone (game ghi nối đuôi; bot đổi tên file là mất dấu "đã phát" -> phát lại).
//
// Món được chuyển (danh sách chừa, thiếu dữ liệu = KHÔNG cho): file thuongpho-cho.txt bot dựng từ bảng game
//   CommonItem.txt + GemInfo.txt + ItemRule.txt: cất được ngân hàng, không "duy nhất", không giới hạn số lượng
//   sở hữu, script của món không ghi tham số riêng (SetBagItemParam). Trang bị (1xxxxxxx) không có trong 2 bảng.
//   Game kiểm thêm lúc chuyển: món có tham số riêng khác 0 (ngân phiếu, đồ đã dùng dở...) để lại trong túi.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.TLBB_ROOT || '/opt/tlbb-root';
const GAME = path.join(ROOT, 'home/tlbb');
const CFG_DIR = path.join(GAME, 'Public/Config');
const SCRIPT_DIR = path.join(GAME, 'Public/Data/Script');
const DIR = path.join(GAME, 'Server/txt/NetCo4Web');
const OUTTP = path.join(DIR, 'outtp');
const OUTTP_DONE = path.join(OUTTP, 'xong');
const CHO_FILE = path.join(DIR, 'thuongpho-cho.txt');
// 🚨 TẮT KHẨN CẤP: có file này là NPC không nhận đồ + web khoá rút (bot kiểm 5 giây/lần, còn hiệu lực sau restart).
//   touch /opt/tlbb-root/home/tlbb/Server/txt/NetCo4Web/thuongpho-tat   (xoá file = mở lại)
const TAT_FILE = path.join(DIR, 'thuongpho-tat');

const RUT_DONG_MAX = 60;      // 1 lần xác nhận tối đa 60 loại món
const RUT_O_MOI_DONG = 5;     // chia lệnh rút thành dòng <= 5 ô túi -> túi gần đầy vẫn nhận được từng phần
const NK_MAX = 100;           // lịch sử mỗi nhân vật giữ 100 lần cuối
const guidOk = (g) => /^\d{6,12}$/.test(String(g));

module.exports = function (ctx) {
    // ctx: db(), getUserData, saveDbNow, writeLog, icon(id), items() [{id,n}]
    let CHO = new Map();   // id -> { chong, tui? } món được phép (dựng từ bảng game)
    let CHO_LOI = '';

    function ensureDirs() { for (const d of [DIR, OUTTP, OUTTP_DONE]) fs.mkdirSync(d, { recursive: true }); }
    function readLines(file) { try { return fs.readFileSync(file, 'latin1').split(/\r?\n/).filter(Boolean); } catch { return []; } }
    function writeAtomic(file, text) {
        const tmp = `${file}.tmp${process.pid}`;
        fs.writeFileSync(tmp, text, 'latin1');
        fs.renameSync(tmp, file);
    }
    function cfg() {
        const db = ctx.db();
        if (!db._tpCfg || typeof db._tpCfg !== 'object') db._tpCfg = { tat: false, chan: [] };
        if (!Array.isArray(db._tpCfg.chan)) db._tpCfg.chan = [];
        return db._tpCfg;
    }
    function kho(guid) {
        const db = ctx.db();
        if (!db._tp || typeof db._tp !== 'object') db._tp = {};
        let k = db._tp[guid];
        if (!k || typeof k !== 'object') k = db._tp[guid] = { it: {}, t: {}, tui: {}, nk: [] };
        for (const f of ['it', 't', 'tui']) if (!k[f] || typeof k[f] !== 'object') k[f] = {};
        if (!Array.isArray(k.nk)) k.nk = [];
        return k;
    }
    // 📜 lịch sử: ds = món ĐÃ GỘP theo ID + khoá [{id,k,n}]; tx = mã lệnh (lần rút) để web biết đã vào game chưa (.tpdone)
    function ghiNk(k, loai, moTa, ds, tx) {
        const e = { at: Date.now(), loai, moTa, ds: ds || [] };
        if (tx && tx.length) e.tx = tx;
        k.nk.push(e); if (k.nk.length > NK_MAX) k.nk = k.nk.slice(-NK_MAX);
    }
    function gopDs(L) {
        const m = new Map();
        for (const x of L) { const key = x.id + '|' + (x.k ? 1 : 0); m.set(key, (m.get(key) || 0) + Number(x.n)); }
        return [...m].map(([key, n]) => { const [id, k] = key.split('|'); return { id, k: +k, n }; });
    }

    const tat = () => !!cfg().tat || fs.existsSync(TAT_FILE);
    let _tatDung = null;   // trạng thái tắt lúc ghi file danh sách gần nhất
    // ===== danh sách món được chuyển =====
    function walk(d, out) {
        let L; try { L = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
        for (const f of L) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.lua$/i.test(f.name)) out.push(p); }
        return out;
    }
    function dungCho() {
        const rule = {};
        for (const l of readLines(path.join(CFG_DIR, 'ItemRule.txt')).slice(2)) {
            const c = l.split('\t'); if (!/^\d+$/.test(c[0] || '')) continue;
            rule[c[0]] = { chong: +c[2] === 1, uniq: +c[9] === 1, bank: +c[12] === 1 };
        }
        if (!Object.keys(rule).length) throw new Error('không đọc được ItemRule.txt');
        // script ghi tham số riêng vào món (SetBagItemParam) -> món dùng script đó không chuyển (rút về là món mới, mất / hồi tham số)
        const coThamSo = new Set();
        for (const f of walk(SCRIPT_DIR, [])) {
            let t; try { t = fs.readFileSync(f, 'latin1'); } catch { continue; }
            if (!/SetBagItemParam/.test(t)) continue;
            const m = t.match(/x\d+_g_[sS]cript[iI][dD]\s*=\s*(\d+)/); if (m) coThamSo.add(+m[1]);
        }
        const chan = new Set(cfg().chan.map(String));
        const out = new Map();
        const ci = readLines(path.join(CFG_DIR, 'CommonItem.txt')).slice(2);
        if (!ci.length) throw new Error('không đọc được CommonItem.txt');
        for (const l of ci) {
            const c = l.split('\t'); if (!/^\d{8}$/.test(c[0] || '')) continue;
            const r = rule[c[11]]; if (!r || !r.bank || r.uniq) continue;
            if (+c[18] > 0) continue;                       // giới hạn số lượng sở hữu -> rút về dễ kẹt
            if (coThamSo.has(+c[13])) continue;
            if (chan.has(c[0])) continue;
            // số chồng = cột "叠放数量" của bảng (195 món cờ ItemRule "chồng" = 0 mà cột > 1: game kiểm "chồng không cố định chưa đầy"
            // theo số này nên lấy số LỚN cho an toàn; ước số ô có thể thiếu -> túi đầy giữa chừng thì game HOÀN phần còn lại về kho)
            out.set(c[0], { chong: Math.max(1, +c[12] || 1) });
        }
        for (const l of readLines(path.join(CFG_DIR, 'GemInfo.txt')).slice(2)) {
            const c = l.split('\t'); if (!/^\d{8}$/.test(c[0] || '')) continue;
            const r = rule[c[6]]; if (!r || !r.bank || r.uniq) continue;
            if (chan.has(c[0])) continue;
            out.set(c[0], { chong: 1 });                    // ngọc: mỗi viên 1 ô
        }
        return out;
    }
    // Dựng lại danh sách + ghi file cho game. Tắt Thương Phố = file rỗng -> NPC báo tạm khoá, không xoá gì.
    function napCho() {
        try {
            CHO = dungCho(); CHO_LOI = '';
            ensureDirs();
            _tatDung = tat(); writeAtomic(CHO_FILE, _tatDung ? '' : [...CHO.keys()].join('\n') + '\n');
        } catch (e) {
            CHO_LOI = e.message;
            ctx.writeLog('ADMIN', `[THƯƠNG PHỐ] Không dựng được danh sách món: ${e.message} - NPC sẽ không chuyển gì`);
        }
        return CHO.size;
    }

    // ===== GAME -> WEB: phiếu outtp/ =====
    function docPhieu() {
        let names; try { names = fs.readdirSync(OUTTP); } catch { return []; }
        const out = [];
        for (const f of names) {
            if (!/^\d+_\d+_\d+\.txt$/.test(f)) continue;
            const L = readLines(path.join(OUTTP, f));
            if (L[L.length - 1] !== 'END') continue;          // game đang ghi dở
            const ds = []; let guid = '', hong = false;
            const hoan = L[0] === 'HOAN';   // game tự hoàn (phát lỗi giữa chừng)
            for (const l of L.slice(hoan ? 1 : 0, -1)) {
                const m = l.match(/^(\d+) (\d{8}) (\d+) ([01]) ([12])$/);
                if (!m || (guid && guid !== m[1]) || !(+m[3] > 0 && +m[3] <= 1000000)) { hong = true; break; }
                guid = m[1]; ds.push({ id: m[2], n: +m[3], k: +m[4], tui: +m[5] });
            }
            out.push({ file: f, guid, ds, hoan, hong: hong || !ds.length });
        }
        return out;
    }
    const _baoHong = new Set();
    function pollPhieu() {
        if (_tatDung !== null && tat() !== _tatDung) { napCho(); ctx.writeLog('ADMIN', `[THƯƠNG PHỐ] ${_tatDung ? 'ĐÃ TẮT' : 'Đã mở lại'} (file thuongpho-tat / cấu hình)`); }
        const L = docPhieu(); if (!L.length) return;
        const db = ctx.db();
        if (!db._tpSeen || typeof db._tpSeen !== 'object') db._tpSeen = {};
        const seen = db._tpSeen;
        for (const rc of L) {
            const src = path.join(OUTTP, rc.file), dst = path.join(OUTTP_DONE, rc.file);
            if (seen[rc.file]) { try { fs.renameSync(src, dst); } catch { } continue; }
            if (rc.hong) {
                if (!_baoHong.has(rc.file)) { _baoHong.add(rc.file); ctx.writeLog('ADMIN', `[THƯƠNG PHỐ] Phiếu ${rc.file} sai định dạng - GIỮ NGUYÊN, admin kiểm tay (đồ đã rời túi game)`); }
                continue;
            }
            const k = kho(rc.guid);
            for (const x of rc.ds) {
                const key = x.id + '|' + x.k;
                k.it[key] = (Number(k.it[key]) || 0) + x.n;
                k.t[key] = Date.now();
                k.tui[x.id] = x.tui;
            }
            const dsGop = gopDs(rc.ds);   // phiếu ghi TỪNG Ô -> gộp số lượng cùng món
            const moTa = dsGop.map(x => `${tenMon(x.id)} x${x.n}${x.k ? ' (cố định)' : ''}`).join(', ');
            ghiNk(k, rc.hoan ? 'hoan' : 'gui', moTa, dsGop);
            seen[rc.file] = Date.now();
            ctx.saveDbNow();
            ctx.writeLog('ADMIN', `[THƯƠNG PHỐ] GUID ${rc.guid} ${rc.hoan ? 'game HOÀN về kho' : 'gửi ra kho'}: ${moTa} (${rc.file})`);
            try { fs.renameSync(src, dst); } catch { /* đã ghi seen, lần sau chỉ dọn file */ }
        }
        const cut = Date.now() - 30 * 86400000;
        for (const [f, t] of Object.entries(seen)) if (t < cut) delete seen[f];
    }

    // ===== WEB -> GAME =====
    const tpin = (g) => path.join(DIR, `${g}.tpin`), tpdone = (g) => path.join(DIR, `${g}.tpdone`);
    function choGame(guid) {
        const done = new Set(readLines(tpdone(guid)));
        return readLines(tpin(guid)).map(l => l.match(/^(\w+) (\d{8}) (\d+) ([01]) ([12]) (\d+)$/))
            .filter(m => m && !done.has(m[1])).map(m => ({ tx: m[1], id: m[2], n: +m[3], k: +m[4], tui: +m[5] }));
    }
    // Dọn dòng game đã phát khỏi .tpin (game chỉ ĐỌC .tpin; .tpdone để nguyên)
    function donTpin() {
        const db = ctx.db(); if (!db._tp) return;
        for (const g of Object.keys(db._tp)) {
            const L = readLines(tpin(g)); if (!L.length) continue;
            const done = new Set(readLines(tpdone(g)));
            const con = L.filter(l => { const m = l.match(/^(\w+) /); return m && !done.has(m[1]); });
            if (con.length !== L.length) { try { writeAtomic(tpin(g), con.length ? con.join('\n') + '\n' : ''); } catch { } }
        }
    }

    function tenMon(id) { const L = ctx.items() || []; const g = L.find(t => t && String(t.id) === String(id)); return (g && g.n) || ('#' + id); }

    function guidCua(userId) {
        const u = ctx.getUserData(userId);
        const g = String(u.tlbbGuid || '');
        return guidOk(g) ? { u, guid: g } : { u, guid: '' };
    }

    function state(userId) {
        const { u, guid } = guidCua(userId);
        const base = { tat: tat(), loi: CHO_LOI, rutMax: RUT_DONG_MAX };
        if (!guid) return { ...base, guid: '', nhanVat: '', kho: [], cho: [], nk: [] };
        const k = kho(guid);
        const tenMap = new Map((ctx.items() || []).map(t => [String(t.id), t.n]));
        const ds = Object.entries(k.it).filter(([, n]) => Number(n) > 0).map(([key, n]) => {
            const [id, kk] = key.split('|');
            const c = CHO.get(id);
            return { id, k: +kk, n: Number(n), ten: tenMap.get(id) || ('#' + id), ic: ctx.icon(id), tui: Number(k.tui[id]) || (/^5/.test(id) ? 2 : 1),
                chong: c ? c.chong : 1, rut: !!c, t: Number(k.t[key]) || 0 };
        });
        const cho = choGame(guid).map(x => ({ ...x, ten: tenMap.get(x.id) || ('#' + x.id), ic: ctx.icon(x.id) }));
        // lịch sử: trạng thái lần rút đọc từ .tpdone (game ghi mã lệnh trước khi phát) - khớp thực tế, không đoán
        const done = new Set(readLines(tpdone(guid)));
        const nk = k.nk.slice().reverse().map(e => {
            const o = { at: e.at, loai: e.loai, moTa: e.moTa,
                ds: (e.ds || []).map(x => ({ id: x.id, k: x.k, n: x.n, ten: tenMap.get(x.id) || ('#' + x.id), ic: ctx.icon(x.id) })) };
            if (e.loai === 'rut' && Array.isArray(e.tx) && e.tx.length) {
                const xong = e.tx.filter(t => done.has(t)).length;
                o.tt = xong === e.tx.length ? 'xong' : xong ? 'motphan' : 'cho';
            }
            return o;
        });
        return { ...base, guid, nhanVat: u.ingameName || '', kho: ds, cho, nk };
    }

    // ds = [{ id, k, n }] -> trừ kho, xếp lệnh vào game. Đồng bộ hoàn toàn (không await) = không 2 lệnh chen nhau.
    function rut(userId, ds, who) {
        if (tat()) return { error: '🏪 Thương Phố đang tạm khoá - admin đang bảo trì' };
        const { u, guid } = guidCua(userId);
        if (!guid) return { error: 'Chưa liên kết nhân vật trong game - nhắn admin liên kết trước đã' };
        if (!Array.isArray(ds) || !ds.length) return { error: 'Chưa chọn món nào để rút' };
        const k = kho(guid);
        const gop = new Map();
        for (const x of ds) {
            const id = String(x && x.id || ''), kk = Number(x && x.k) === 1 ? 1 : 0, n = Math.floor(Number(x && x.n));
            if (!/^\d{8}$/.test(id) || !(n > 0)) return { error: 'Dữ liệu món không hợp lệ' };
            const key = id + '|' + kk; gop.set(key, (gop.get(key) || 0) + n);
        }
        if (gop.size > RUT_DONG_MAX) return { error: `Mỗi lần rút tối đa ${RUT_DONG_MAX} loại món` };
        for (const [key, n] of gop) {
            const [id] = key.split('|');
            const co = Number(k.it[key]) || 0;
            if (n > co) return { error: `${tenMon(id)}: kho chỉ còn ${co}` };
            if (!CHO.has(id)) return { error: `${tenMon(id)} đang bị khoá rút - nhắn admin` };
        }
        // trừ kho trước, ghi lệnh sau; ghi lỗi thì trả lại ngay
        const dong = [], moTa = [];
        for (const [key, n] of gop) {
            const [id, kk] = key.split('|');
            const chong = CHO.get(id).chong, tui = Number(k.tui[id]) || (/^5/.test(id) ? 2 : 1);
            const moiDong = Math.max(1, chong * RUT_O_MOI_DONG);
            for (let con = n; con > 0; con -= moiDong) {
                const tx = 't' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
                dong.push(`${tx} ${id} ${Math.min(con, moiDong)} ${kk} ${tui} ${chong}`);
            }
            moTa.push(`${tenMon(id)} x${n}${kk === '1' ? ' (cố định)' : ''}`);
        }
        const truoc = {};
        for (const [key, n] of gop) { truoc[key] = Number(k.it[key]) || 0; k.it[key] = truoc[key] - n; if (k.it[key] <= 0) delete k.it[key]; }
        try {
            ensureDirs();
            const cu = readLines(tpin(guid));
            writeAtomic(tpin(guid), cu.concat(dong).join('\n') + '\n');
        } catch (e) {
            for (const key of Object.keys(truoc)) { if (truoc[key] > 0) k.it[key] = truoc[key]; }
            return { error: 'Lỗi ghi lệnh vào game, đồ vẫn nằm trong kho: ' + e.message };
        }
        ghiNk(k, 'rut', moTa.join(', '), [...gop].map(([key, n]) => { const [id, kk] = key.split('|'); return { id, k: +kk, n }; }), dong.map(l => l.split(' ')[0]));
        ctx.saveDbNow();
        ctx.writeLog('ADMIN', `[THƯƠNG PHỐ] ${who || u.name || userId} rút về game (GUID ${guid}): ${moTa.join(', ')}`);
        return { message: `📦 Đã xếp ${dong.length} lệnh vào game - nhận khi đăng nhập / đổi bản đồ, hoặc bấm NPC Ví Web → Nhận đồ Thương Phố`, state: state(userId) };
    }

    // Panel SUPER: bật/tắt + chặn thêm ID (vd phát hiện món lỗi). Đổi xong dựng lại danh sách ngay.
    function setCfg(o) {
        const c = cfg();
        if (typeof o.tat === 'boolean') c.tat = o.tat;
        if (Array.isArray(o.chan)) c.chan = [...new Set(o.chan.map(String).filter(x => /^\d{8}$/.test(x)))];
        ctx.saveDbNow(); napCho();
        return { tat: c.tat, chan: c.chan, soMon: CHO.size, loi: CHO_LOI };
    }
    function adminDs() {
        const db = ctx.db(), out = [];
        for (const [g, k] of Object.entries(db._tp || {})) {
            const loai = Object.values(k.it || {}).filter(n => Number(n) > 0).length;
            out.push({ guid: g, loai, cho: choGame(g).length, nk: (k.nk || []).slice(-5) });
        }
        return { tatFile: fs.existsSync(TAT_FILE), cfg: { tat: !!cfg().tat, chan: cfg().chan }, soMon: CHO.size, loi: CHO_LOI, ds: out };
    }

    return { napCho, pollPhieu, donTpin, state, rut, setCfg, adminDs, laCho: (id) => CHO.has(String(id)) };
};
