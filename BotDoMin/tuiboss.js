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
const CHUNG = [[[MB6, BN6], 10], [PHIEU_QUAY, 2]];
const KNB = 4000;
const HD = {
    qtc: { ten: 'Q Tô Châu', mon: [...CHUNG, [CUU_THIEN, 1]], knb: KNB },
    qll: { ten: 'Q Lâu Lan', mon: [...CHUNG, [CUU_THIEN, 1]], knb: KNB },
    yto: { ten: 'Yến Tử Ổ', mon: [...CHUNG, [TBP[2], [2, 3]], [MA_HUYET, [2, 5]]], knb: KNB },
    btkt: { ten: 'Binh Thánh Kỳ Trận', mon: [...CHUNG, [LONG_VAN5, 1], [CHUE, 10]], knb: KNB },
    ttt: { ten: 'Tứ Tuyệt Trang', mon: [...CHUNG, [HON_NGOC, 10]], knb: KNB },
    pmf: { ten: 'Phiêu Miểu Phong', mon: [...CHUNG, [NGU_DOC, 20], [GIAM_KHANG6, 1]], knb: KNB },
    pmfkc: { ten: 'Phiêu Miểu Phong (khiêu chiến)', mon: [...CHUNG, [NGU_DOC, 20], [DIEU_VAN5, 1]], knb: KNB },
    sattinh: { ten: 'Sát Tinh Bang', mon: [...CHUNG, [NGU_DOC, 20], [TBP, 5], [MA_HUYET, [1, 3]]], knb: KNB },
    tts: { ten: 'Thiếu Thất Sơn', mon: [...CHUNG, [CCHTP, 5]], knb: KNB },
    longquy: { ten: 'Long Quy', mon: [...CHUNG, [CCHTP, 3], [CHI_TON, 5], [CLD, [3, 5]]], knb: KNB, ngay: 3 },
    lltb: { ten: 'Lâu Lan Tầm Bảo', mon: [[TAM_DAC, 15], [TAN_HIET, 10], [VO_HON, 1]], knb: 0, ngay: 2 },
    actac: { ten: 'Ác Tặc', mon: [[YQ45.concat(YQ80), 1], [CCHTP, [1, 2]], [CLD, [1, 3]], [HON_BANG, [1, 3]]], knb: 0, ngay: 3 },
    acba: { ten: 'Ác Bá', mon: [[YQ65.concat(YQ_TIEN), 1], [CCHTP, [1, 2]], [CLD, [1, 3]], [NHUAN_HON, [1, 3]]], knb: 0, ngay: 3 },
};
// ID boss cuối -> hoạt động (khớp bảng x950001_TB_g_Boss trong roimap.lua)
const BOSS = {};
const gan = (hd, ids) => { for (const i of ids) BOSS[String(i)] = hd; };
gan('qtc', [...range(4130, 4139), ...range(34130, 34139)]);
gan('qll', range(13220, 13229));
gan('yto', [...range(9430, 9439), 39430, 39431, 39432]);
gan('btkt', [15175, 15073]);
gan('ttt', [14145]);
gan('pmf', [9666]);
gan('pmfkc', [9546]);
gan('sattinh', [13447, 13456, 13465, 13474, 13483, 13492, 13501, 13510, 13519, 13528, 13537]);
gan('tts', [14234]);
gan('longquy', [11353]);
gan('lltb', range(12138, 12146));
gan('actac', [473]);
gan('acba', range(1910, 1919));

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

// Đọc phần mới của file log. Trả về số túi vừa tạo.
function poll(db) {
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
            const ds = K[guid] || (K[guid] = []);
            const cfg = HD[hd];
            if (cfg.ngay) {   // trần túi/ngày cho hoạt động ngoài phó bản (không có giới hạn lượt của game)
                const hom = ngayVN(t);
                if (ds.filter((x) => x.hd === hd && ngayVN(x.t) === hom).length >= cfg.ngay) continue;
            }
            ds.push({ id: t.toString(36) + '-' + boss + '-' + guid.slice(-4), hd, ten: cfg.ten, boss: Number(boss), t,
                mon: boc(cfg.mon), knb: cfg.knb, nhan: 0 });
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
async function nhan(db, guid, tuiId, giveItem, congKnb) {
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
        tui.nhan = Date.now();
        return { ok: true, tui };
    } catch (e) {
        return { error: 'Giao lỗi: ' + e.message + '. Bấm Nhận lại để giao tiếp phần còn lại.' };
    } finally { delete tui.dang; }
}

module.exports = { poll, list, nhan, HD, BOSS, FILE };
