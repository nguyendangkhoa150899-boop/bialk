// 🎒 01/10: TÚI ĐỒ GIẾT BOSS
//
// Game (repo tlbbnetco4, NetCo4/roimap.lua x950001_TB_GhiId) ghi 1 dòng mỗi khi BOSS CUỐI của một hoạt động chết:
//   <unix giây> TAB <sceneId> TAB <ID quái> TAB <GUID1,GUID2,...>
// vào Server/txt/NetCo4Web/tuiboss.log. Ở phó bản: mọi người đang trong phó bản; ngoài map: người giết + tổ ở gần.
// Bot đọc file (10 giây/lần), tạo 1 TÚI cho mỗi GUID với đồ đã bốc sẵn (để web hiện đúng thứ sẽ nhận).
// Người chơi bấm Nhận trên web: đồ vào hàng đợi quà (tlbb.giveItem -> NetCo4Qua, nhận khi đổi bản đồ), KNB cộng ví web.
// Túi giữ theo GUID (chưa liên kết ví vẫn giữ, liên kết xong là thấy). Hết hạn sau HAN_NGAY ngày.
const fs = require('fs');
const path = require('path');

const ROOT = process.env.TLBB_ROOT || '/opt/tlbb-root';
const FILE = path.join(ROOT, 'home/tlbb/Server/txt/NetCo4Web/tuiboss.log');
const HAN_NGAY = 7, GIU_TOI_DA = 60, GOP_GIAY = 20;

// ===== Vật phẩm (ID trong docs/TUI-BOSS.md repo tlbbnetco4) =====
const MB6 = 20501006, BN6 = 20502006, PHIEU_QUAY = 30070501, CUU_THIEN = 20800034;
const TBP = [30505817, 30505818, 30505819], MA_HUYET = 30505813;
const LONG_VAN5 = 10157005, CHUE = [20310181, 20310182, 20310183];
const HON_NGOC = [38002045, 38002043, 38002041], NGU_DOC = 38000448;
const GIAM_KHANG6 = [30110126, 30110136, 30110146, 30110156];
const DIEU_VAN5 = [30110045, 30110055, 30110065, 30110075];          // Băng/Hỏa/Huyền/Độc Công Điêu Văn cấp 5
const CCHTP = 30900016, CHI_TON = 38000571, CLD = 39999901;
const TAM_DAC = 38000531, TAN_HIET = 38000529;
const VO_HON = [10156102, 10156103, 10156104, 10156202, 10156203, 10156204];   // Ngự Dao Bàn / Lưu Ly Diễm cấp 2-4
const HON_BANG = [20309102, 20309103, 20309104];
const NHUAN_HON = [20310122, 20310131, 20310140, 20310149].flatMap((b) => [b, b + 2, b + 4]);   // 4 loại × cấp 1/3/5
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const YQ45 = range(30307211, 30307221).filter((x) => x !== 30307219).concat([30308136]);       // trừ Thanh Tâm Phổ Thiện Chú
const YQ65 = range(30307200, 30307210).concat([30308135]);
const YQ80 = range(30307222, 30307232);
const YQ_TIEN = [30308112, 30308113, 30308114, 30308115, 30308116, 30308117, 30308119, 30308120, 30308122, 30308123,
    30308124, 30308125, 30308126, 30308127, 30308128, 30308130, 30308131, 30308133, 30308139, 30308140];

// Cách viết món: [id, sl] cố định · [[id...], sl] trộn (mỗi cái bốc 1 trong danh sách) · sl có thể là [min, max]
// 02/10: bỏ Hạnh Vận Quả ×2 (vật phẩm game) -> LUOT lượt quay vòng quay trên web (vongquay.js), cộng khi bấm Nhận túi.
const CHUNG = [[[MB6, BN6], 10]];
const KNB = 4000, LUOT = 2;
const HD = {
    qtc: { ten: 'Q Tô Châu', mon: [...CHUNG, [CUU_THIEN, 1]], knb: KNB, luot: LUOT },
    qll: { ten: 'Q Lâu Lan', mon: [...CHUNG, [CUU_THIEN, 1]], knb: KNB, luot: LUOT },
    yto: { ten: 'Yến Tử Ổ', mon: [...CHUNG, [TBP[2], [2, 3]], [MA_HUYET, [2, 5]]], knb: KNB, luot: LUOT },
    btkt: { ten: 'Binh Thánh Kỳ Trận', mon: [...CHUNG, [LONG_VAN5, 1], [CHUE, 10]], knb: KNB, luot: LUOT },
    ttt: { ten: 'Tứ Tuyệt Trang', mon: [...CHUNG, [HON_NGOC, 10]], knb: KNB, luot: LUOT },
    pmf: { ten: 'Phiêu Miểu Phong', mon: [...CHUNG, [NGU_DOC, 20], [GIAM_KHANG6, 1]], knb: KNB, luot: LUOT },
    pmfkc: { ten: 'Phiêu Miểu Phong (khiêu chiến)', mon: [...CHUNG, [NGU_DOC, 20], [DIEU_VAN5, 1]], knb: KNB, luot: LUOT },
    sattinh: { ten: 'Sát Tinh Bang', mon: [...CHUNG, [NGU_DOC, 20], [TBP, 5], [MA_HUYET, [1, 3]]], knb: KNB, luot: LUOT },
    tts: { ten: 'Thiếu Thất Sơn', mon: [...CHUNG, [CCHTP, 5]], knb: KNB, luot: LUOT },
    longquy: { ten: 'Long Quy', mon: [...CHUNG, [CCHTP, 3], [CHI_TON, 5], [CLD, [3, 5]]], knb: KNB, luot: LUOT, ngay: 3 },
    lltb: { ten: 'Lâu Lan Tầm Bảo', mon: [[TAM_DAC, 15], [TAN_HIET, 10], [VO_HON, 1]], knb: 0, ngay: 2 },
    // 02/10: "Cờ 12h" = Kỳ Cuộc (Trân Long Kỳ Cuộc, thường 11:30-14:30 / 20:30-22:00 + chế độ nhanh). Game cho 1 lượt/ngày (MD_LAST_QIJU_DAY).
    kycuoc: { ten: 'Kỳ Cuộc (Cờ 12h)', mon: [[TAM_DAC, 15], [TAN_HIET, 5], [VO_HON, 1]], knb: 0, ngay: 1 },
    // 05/10: Túc Cầu (efuben_cuju 402040, boss cuối Tôn Mỹ Mỹ). Game cho 1 lượt / 24 giờ (MD_CUJU_PRE_TIME). Mặc định như phó bản khác, sửa ở Admin -> Túi boss.
    tuccau: { ten: 'Túc Cầu', mon: [...CHUNG], knb: KNB, luot: LUOT, ngay: 1 },
    actac: { ten: 'Ác Tặc', mon: [[YQ45.concat(YQ80), 1], [CCHTP, [1, 2]], [CLD, [1, 3]], [HON_BANG, [1, 3]]], knb: 0, ngay: 3 },
    acba: { ten: 'Ác Bá', mon: [[YQ65.concat(YQ_TIEN), 1], [CCHTP, [1, 2]], [CLD, [1, 3]], [NHUAN_HON, [1, 3]]], knb: 0, ngay: 3 },
    // 04/10: Lang Huyên Phúc Địa (thường 002052 / khó 002047). Túi chỉ ghi khi đủ 4 boss chết (odali_lanlan/yahuan OnDie đếm ô 30).
    // Mặc định tối thiểu, quà riêng chủ server đặt ở Admin -> Túi boss.
    langhuyen: { ten: 'Lang Huyên Phúc Địa', mon: [...CHUNG], knb: 0, luot: 0 },
};
// ID boss cuối -> hoạt động (khớp bảng x950001_TB_g_Boss trong roimap.lua)
const BOSS = {};
const gan = (hd, ids) => { for (const i of ids) BOSS[String(i)] = hd; };
gan('qtc', [...range(4130, 4139), ...range(34130, 34139)]);
gan('qll', range(13260, 13269));  // 02/10: Hoa Diem Yeu Ma (boss cuoi ai 3); truoc la Hong Kich Yeu Vuong 13220-13229 (cuoi ai 2)
gan('yto', [...range(9430, 9439), 39430, 39431, 39432]);
gan('btkt', [15190, 15073]);  // 02/10: Binh Thanh lon = Gia Luat Lien Thanh 15190 (boss cuoi that); truoc la Gia Luat Dien 15175 (ai 3). Nho: 15073
gan('ttt', [14145]);
gan('pmf', [9666]);
gan('pmfkc', [9546]);
gan('sattinh', [13447, 13456, 13465, 13474, 13483, 13492, 13501, 13510, 13519, 13528, 13537]);
gan('tts', [14234]);
gan('longquy', [11353]);
gan('lltb', range(12138, 12146));
// Kỳ Cuộc: boss cuối Viễn Cổ Kỳ Hồn - thường / tân thủ 3 / tân thủ 6, mỗi mức 20 bậc cấp (khớp vòng for trong roimap.lua)
gan('kycuoc', [...range(1850, 1859), ...range(31850, 31859), ...range(12040, 12049), ...range(42040, 42049), ...range(12090, 12099), ...range(42090, 42099)]);
gan('tuccau', [...range(3720, 3729), ...range(33720, 33729)]);   // 05/10: Tôn Mỹ Mỹ (khớp roimap.lua, OnDie efuben_cuju gọi TB_Ghi)
gan('actac', range(3650, 3659));   // 04/10: boss cuoi pho ban Tac binh (truoc 473 = NPC bat tu, khong bao gio ghi)
gan('acba', range(1910, 1919).concat(range(31910, 31919), range(3670, 3679), range(33670, 33679)));   // 04/10: + Ác Bá tấn công môn phái (eTouximenpai_NPC_*)   // 04/10: them 3191x cho cap 110+
gan('langhuyen', [43970, 43971, 43973, 43975, 43982, 43983, 43985, 43986]);  // 04/10: boss chet thu 4 (thu tu nao cung duoc) -> 1 tui / luot

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function boc(spec) {
    const out = new Map();
    for (const [ids, sl] of spec) {
        const n = Array.isArray(sl) ? rnd(sl[0], sl[1]) : sl;
        for (let k = 0; k < n; k++) {
            const id = Array.isArray(ids) ? ids[rnd(0, ids.length - 1)] : ids;
            if (!Array.isArray(ids)) { out.set(id, (out.get(id) || 0) + n); break; }   // món cố định: cộng 1 lần
            out.set(id, (out.get(id) || 0) + 1);
        }
    }
    return [...out].map(([id, n]) => [id, n]);
}

function kho(db) {
    if (!db._tuiBoss || typeof db._tuiBoss !== 'object') db._tuiBoss = {};   // { guid: [tui...] }
    return db._tuiBoss;
}
const ngayVN = (t) => new Date(t + 7 * 3600000).toISOString().slice(0, 10);

// 02/10: chuyển đổi 1 lần - Hạnh Vận Quả (30070501) trong cấu hình đã sửa và trong túi CHƯA nhận -> lượt quay web.
// Dòng món chỉ có Hạnh Vận Quả thì bỏ, số lượng thành luot. Túi đã nhận giữ nguyên (lịch sử).
const HVQ = 30070501;
function chuyenHVQ(db) {
    if (db._vqMigHVQ) return 0;
    let n = 0;
    const laHvq = (ids) => (Array.isArray(ids) ? ids.length === 1 && Number(ids[0]) === HVQ : Number(ids) === HVQ);
    for (const c of Object.values(db._tuiBossCfg || {})) {
        if (!c || !Array.isArray(c.mon)) continue;
        let them = 0;
        c.mon = c.mon.filter(([ids, sl]) => { if (!laHvq(ids)) return true; them += Array.isArray(sl) ? sl[1] : Number(sl) || 0; return false; });
        if (them) { c.luot = (c.luot || 0) + them; n++; }
    }
    for (const ds of Object.values(db._tuiBoss || {})) {
        for (const tui of ds) {
            if (tui.nhan || !Array.isArray(tui.mon)) continue;
            let them = 0;
            tui.mon = tui.mon.filter(([id, sl]) => { if (Number(id) !== HVQ) return true; if (!(tui.xong || []).includes(id)) them += Number(sl) || 0; return false; });
            if (them) { tui.luot = (tui.luot || 0) + them; n++; }
        }
    }
    db._vqMigHVQ = Date.now();
    return n;
}

// Đọc phần mới của file log. Trả về số túi vừa tạo.
function poll(db) {
    chuyenHVQ(db);
    let st;
    try { st = fs.statSync(FILE); } catch { return 0; }
    const pos = db._tuiBossPos || { off: 0, rest: '' };
    if (st.size < pos.off) { pos.off = 0; pos.rest = ''; }   // file bị xóa/ghi lại (reset ngày mở)
    if (st.size === pos.off) return 0;
    let txt;
    const fd = fs.openSync(FILE, 'r');
    try { const buf = Buffer.alloc(st.size - pos.off); fs.readSync(fd, buf, 0, buf.length, pos.off); txt = buf.toString('latin1'); }
    finally { fs.closeSync(fd); }
    pos.off = st.size;
    const lines = (pos.rest + txt).split('\n');
    pos.rest = lines.pop();
    db._tuiBossPos = pos;
    // gộp các dòng cùng scene + boss trong GOP_GIAY giây (Ác Bá ghi 1 dòng cho mỗi thành viên có nhiệm vụ)
    if (!db._tuiBossGop) db._tuiBossGop = {};
    const gop = db._tuiBossGop, K = kho(db);
    // 🧬 07/10 (chủ server): nhân vật CLONE (admin tích ở tab liên kết, userData.clone) KHÔNG có túi boss - không tạo túi luôn
    const CLONE = new Set();
    for (const [k, v] of Object.entries(db)) if (!k.startsWith('_') && v && typeof v === 'object' && v.clone && v.tlbbGuid) CLONE.add(String(v.tlbbGuid));
    let tao = 0;
    for (const l of lines) {
        const c = l.trim().split('\t');
        if (c.length < 4) continue;
        const t = Number(c[0]) * 1000, scene = c[1], boss = c[2], hd = BOSS[boss];
        if (!hd || !t) continue;
        const key = scene + ':' + boss;
        const g = gop[key] && t - gop[key].t <= GOP_GIAY * 1000 ? gop[key] : (gop[key] = { t, da: [] });
        for (const guid of c[3].split(',').map((x) => x.trim()).filter((x) => /^\d{6,}$/.test(x))) {
            if (g.da.includes(guid)) continue;
            g.da.push(guid);
            if (CLONE.has(guid)) continue;
            const ds = K[guid] || (K[guid] = []);
            const cfg = cfgOf(db, hd);
            if (cfg.on === false) continue;
            if (cfg.ngay) {   // trần túi/ngày cho hoạt động ngoài phó bản (không có giới hạn lượt của game)
                const hom = ngayVN(t);
                if (ds.filter((x) => x.hd === hd && ngayVN(x.t) === hom).length >= cfg.ngay) continue;
            }
            ds.push({ id: t.toString(36) + '-' + boss + '-' + guid.slice(-4), hd, ten: cfg.ten, boss: Number(boss), t,
                mon: boc(cfg.mon), knb: cfg.knb, luot: cfg.luot || 0, nhan: 0 });
            tao++;
        }
    }
    // dọn: túi hết hạn chưa nhận, túi đã nhận cũ, giữ tối đa GIU_TOI_DA mỗi người; dọn khóa gộp cũ
    const han = Date.now() - HAN_NGAY * 86400000;
    for (const guid of Object.keys(K)) {
        K[guid] = K[guid].filter((x) => x.t >= han).slice(-GIU_TOI_DA);
        if (!K[guid].length) delete K[guid];
    }
    for (const k of Object.keys(gop)) if (Date.now() - gop[k].t > 3600000) delete gop[k];
    return tao;
}

function list(db, guid) {
    const ds = (kho(db)[String(guid)] || []).slice().reverse();
    return ds.map((x) => ({ ...x, han: x.t + HAN_NGAY * 86400000 }));
}

// Nhận 1 túi. giveItem(guid, id, sl) xếp hàng quà (lỗi chắc chắn chưa ghi = 'player not found').
// congKnb(n) cộng ví web. Giao từng món, món nào xong đánh dấu, lỗi giữa chừng thì lần sau giao tiếp phần còn lại.
async function nhan(db, guid, tuiId, giveItem, congKnb, congLuot) {
    const ds = kho(db)[String(guid)] || [];
    const tui = ds.find((x) => x.id === tuiId);
    if (!tui) return { error: 'Không thấy túi này (hết hạn hoặc không phải của bạn)' };
    if (tui.nhan) return { error: 'Túi này đã nhận rồi' };
    if (tui.dang) return { error: 'Đang giao túi này, chờ vài giây' };
    tui.dang = 1;
    try {
        tui.xong = tui.xong || [];
        for (const [id, n] of tui.mon) {
            if (tui.xong.includes(id)) continue;
            const r = await giveItem(String(guid), id, n);
            if (!r || !r.ok) return { error: 'Giao lỗi ở món ' + id + ': ' + ((r && r.message) || 'panel GM từ chối') + '. Bấm Nhận lại để giao tiếp phần còn lại.' };
            tui.xong.push(id);
        }
        if (tui.knb && !tui.daKnb) { congKnb(tui.knb, tui); tui.daKnb = 1; }
        if (tui.luot && !tui.daLuot && congLuot) { congLuot(tui.luot, tui); tui.daLuot = 1; }
        tui.nhan = Date.now();
        return { ok: true, tui };
    } catch (e) {
        return { error: 'Giao lỗi: ' + e.message + '. Bấm Nhận lại để giao tiếp phần còn lại.' };
    } finally { delete tui.dang; }
}

// ===== 01/10: CẤU HÌNH SỬA ĐƯỢC TỪ PANEL (admin + mod) =====
// db._tuiBossCfg[hd] = { on, mon, knb, ngay, luot } ghi đè mặc định HD[hd]. ID boss cuối KHÔNG sửa ở đây (phải khớp roimap.lua của game).
// Mỗi dòng món: [id | [id,...], sl | [min,max]]  (nhiều ID = mỗi cái bốc ngẫu nhiên 1 trong danh sách).
function cfgOf(db, hd) {
    const d = HD[hd]; const o = (db._tuiBossCfg || {})[hd];
    return o ? { ...d, ...o, ten: d.ten } : { on: true, ...d };
}
const bossCua = (hd) => Object.keys(BOSS).filter((k) => BOSS[k] === hd).map(Number);
const toRow = ([ids, sl]) => ({ ids: Array.isArray(ids) ? ids.slice() : [ids], min: Array.isArray(sl) ? sl[0] : sl, max: Array.isArray(sl) ? sl[1] : sl });
function state(db) {
    return {
        ds: Object.keys(HD).map((hd) => { const c = cfgOf(db, hd); return { hd, ten: c.ten, on: c.on !== false, knb: c.knb || 0, ngay: c.ngay || 0, luot: c.luot || 0,
            mon: c.mon.map(toRow), macDinh: { knb: HD[hd].knb || 0, ngay: HD[hd].ngay || 0, luot: HD[hd].luot || 0, mon: HD[hd].mon.map(toRow) },
            sua: !!(db._tuiBossCfg || {})[hd], boss: bossCua(hd) }; }),
        log: (db._tuiBossCfgLog || []).slice(-40).reverse(),
    };
}
function ghiLog(db, hd, who, truoc, sau) {
    if (!Array.isArray(db._tuiBossCfgLog)) db._tuiBossCfgLog = [];
    db._tuiBossCfgLog.push({ t: Date.now(), hd, ten: HD[hd].ten, who, truoc, sau });
    if (db._tuiBossCfgLog.length > 300) db._tuiBossCfgLog.splice(0, db._tuiBossCfgLog.length - 300);
}
const tom = (c) => ({ on: c.on !== false, knb: c.knb || 0, ngay: c.ngay || 0, luot: c.luot || 0, mon: c.mon.map(toRow) });
// inp = { hd, on, knb, ngay, mon: [{ ids:[...], min, max }] }; coItem(id) -> true nếu ID có trong game
function save(db, inp, coItem, who) {
    const hd = String((inp && inp.hd) || '');
    if (!HD[hd]) return { error: 'Không có hoạt động này' };
    const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);
    const knb = int(inp.knb), ngay = int(inp.ngay);
    const luot = inp.luot === undefined ? (cfgOf(db, hd).luot || 0) : int(inp.luot);
    if (!(luot >= 0 && luot <= 50)) return { error: 'Lượt quay web phải 0 - 50' };
    if (!(knb >= 0 && knb <= 100000)) return { error: 'KNB phải là số nguyên 0 - 100.000' };
    if (!(ngay >= 0 && ngay <= 50)) return { error: 'Trần túi/ngày phải 0 - 50 (0 = không giới hạn)' };
    if (!Array.isArray(inp.mon) || !inp.mon.length || inp.mon.length > 20) return { error: 'Cần 1 - 20 dòng món' };
    const mon = [];
    for (let i = 0; i < inp.mon.length; i++) {
        const r = inp.mon[i] || {}; const ids = (Array.isArray(r.ids) ? r.ids : String(r.ids || '').split(/[\s,;]+/)).map((x) => int(x)).filter((x) => x > 0);
        const min = int(r.min), max = int(r.max);
        if (!ids.length || ids.length > 50) return { error: 'Dòng ' + (i + 1) + ': cần 1 - 50 ID vật phẩm' };
        const sai = ids.filter((x) => !coItem(x));
        if (sai.length) return { error: 'Dòng ' + (i + 1) + ': ID không có trong game: ' + sai.join(', ') };
        // 05/10: 'từ' được = 0 -> tung ra 0 thì dòng đó không rớt (vd 0-2 = 33% không rớt). 'đến' >= 1 (0-0 là dòng vô nghĩa)
        if (!(min >= 0 && max >= 1 && max >= min && max <= 999)) return { error: 'Dòng ' + (i + 1) + ': số lượng "từ" 0 - 999, "đến" 1 - 999, "từ" ≤ "đến"' };
        mon.push([ids.length === 1 ? ids[0] : ids, min === max ? min : [min, max]]);
    }
    const truoc = tom(cfgOf(db, hd));
    if (!db._tuiBossCfg || typeof db._tuiBossCfg !== 'object') db._tuiBossCfg = {};
    db._tuiBossCfg[hd] = { on: inp.on !== false, mon, knb, ngay, luot };
    ghiLog(db, hd, who, truoc, tom(cfgOf(db, hd)));
    return { ok: true };
}
function reset(db, hd, who) {
    hd = String(hd || '');
    if (!HD[hd]) return { error: 'Không có hoạt động này' };
    if (!(db._tuiBossCfg || {})[hd]) return { error: 'Hoạt động này đang dùng mặc định rồi' };
    const truoc = tom(cfgOf(db, hd));
    delete db._tuiBossCfg[hd];
    ghiLog(db, hd, who, truoc, tom(cfgOf(db, hd)));
    return { ok: true };
}

module.exports = { poll, list, nhan, state, save, reset, cfgOf, chuyenHVQ, HD, BOSS, FILE };
