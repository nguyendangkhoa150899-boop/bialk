// ============================================================
//  📒 04/10: NHẬT KÝ THEO NGÀY
//  Mọi dòng writeLog (index.js) ghi THÊM vào nhatky/YYYY-MM-DD.log (ngày giờ VN), mỗi
//  dòng: "HH:MM:SS<TAB>NHÓM<TAB>nội dung". Không cắt số dòng như log_*.txt (log_admin chỉ
//  giữ 1.000 dòng, Phi Thuyền chiếm ~95% -> thao tác thật trôi mất sau vài giờ).
//  Giữ GIU_NGAY ngày (hôm nay + 2 ngày trước), file cũ hơn tự xóa khi sang ngày mới.
//  Panel đọc qua doc(): CHỈ 3 mục (Tài Xỉu ván có cược, Dò Mìn, Nạp/Rút web), lọc ngày / mục / chữ, mới nhất trước.
//  File vẫn ghi ĐỦ mọi dòng (đổi mục hiển thị chỉ cần sửa mucCua, không mất dữ liệu cũ).
// ============================================================
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'nhatky');
const GIU_NGAY = 3;
const TZ = 'Asia/Ho_Chi_Minh';
const RE_FILE = /^(\d{4}-\d{2}-\d{2})\.log$/;

const ngayVN = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);   // 2026-10-04
const gioVN = (d = new Date()) => d.toLocaleTimeString('vi-VN', { timeZone: TZ, hour12: false });   // 14:04:10
const ngayToiThieu = () => ngayVN(new Date(Date.now() - (GIU_NGAY - 1) * 86400000));

let homNay = '';

function cacNgay() {
    let ds = [];
    try { ds = fs.readdirSync(DIR).map((f) => (RE_FILE.exec(f) || [])[1]).filter(Boolean); } catch { return []; }
    const min = ngayToiThieu();
    return ds.filter((n) => n >= min).sort().reverse();
}

function don() {
    const min = ngayToiThieu();
    try {
        for (const f of fs.readdirSync(DIR)) {
            const m = RE_FILE.exec(f);
            if (m && m[1] < min) fs.unlinkSync(path.join(DIR, f));
        }
    } catch (e) { console.error('[NHẬT KÝ] dọn lỗi:', e.message); }
}

// Lần đầu (chưa có thư mục): nạp lại các dòng còn trong log_*.txt thuộc GIU_NGAY ngày gần nhất,
// để vừa deploy đã có lịch sử. Dòng cũ dạng "[HH:MM:SS d/m/yyyy] nội dung" (giờ máy = giờ VN).
function napCu(baseDir) {
    const NGUON = { ADMIN: 'log_admin.txt', BET: 'log_bet.txt', RESULT: 'log_result.txt', SYSTEM: 'log_system.txt' };
    const min = ngayToiThieu();
    const theoNgay = {};
    for (const [nhom, f] of Object.entries(NGUON)) {
        let txt = '';
        try { txt = fs.readFileSync(path.join(baseDir, f), 'utf8'); } catch { continue; }
        txt.split('\n').forEach((dong, i) => {
            const m = /^\[(\d{1,2}):(\d{2}):(\d{2}) (\d{1,2})\/(\d{1,2})\/(\d{4})\] (.*)$/.exec(dong);
            if (!m) return;
            const ngay = `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
            if (ngay < min) return;
            const gio = `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}`;
            (theoNgay[ngay] = theoNgay[ngay] || []).push({ gio, nhom, msg: m[7].replace(/[\r\n\t]+/g, ' '), i });
        });
    }
    for (const [ngay, ds] of Object.entries(theoNgay)) {
        ds.sort((a, b) => (a.gio < b.gio ? -1 : a.gio > b.gio ? 1 : a.i - b.i));
        fs.appendFileSync(path.join(DIR, ngay + '.log'), ds.map((x) => `${x.gio}\t${x.nhom}\t${x.msg}\n`).join(''));
    }
    return Object.values(theoNgay).reduce((s, ds) => s + ds.length, 0);
}

function khoiDong(baseDir) {
    try {
        if (!fs.existsSync(DIR)) {
            fs.mkdirSync(DIR, { recursive: true });
            const n = napCu(baseDir);
            console.log(`[NHẬT KÝ] tạo ${DIR}, nạp ${n} dòng cũ từ log_*.txt`);
        }
        homNay = ngayVN();
        don();
    } catch (e) { console.error('[NHẬT KÝ] khởi động lỗi:', e.message); }
}

function ghi(nhom, msg) {
    try {
        const now = new Date();
        const ngay = ngayVN(now);
        if (ngay !== homNay) {   // sang ngày mới: tạo thư mục nếu bị xóa tay + dọn file quá hạn
            homNay = ngay;
            fs.mkdirSync(DIR, { recursive: true });
            don();
        }
        fs.appendFileSync(path.join(DIR, ngay + '.log'), `${gioVN(now)}\t${nhom}\t${String(msg).replace(/[\r\n\t]+/g, ' ')}\n`);
    } catch (e) { console.error('[NHẬT KÝ] ghi lỗi:', e.message); }
}

// Che bí mật trong mọi cổng (log không bao giờ cần mật khẩu); cổng mod che thêm 2 số cuối IP.
const RE_BIMAT = /((?:"?)(?:mk|pass|password|matkhau|mat_khau|token|gamePass)(?:"?)\s*[:=]\s*"?)([^",\s}]+)/gi;
const RE_IP = /\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g;
// Cổng mod KHÔNG được thấy thông tin kín / can thiệp: Phi Thuyền ghi điểm nổ lúc cất cánh "(kín)", mọi lệnh ÉP kết quả
// (TX, Roulette, Dò Mìn, điểm nổ), RTP, % may mắn từng người. Lọc TRƯỚC khi đếm để số đếm cũng không lộ.
const RE_KIN = /\(kín\)|ép|RTP|MAY MẮN|epnhan/i;
// 04/10 (chủ server: "khó hiểu quá, chỉ show Tài Xỉu ván có người đặt, Dò Mìn, nạp rút web"): nhật ký CHỈ hiện 3 mục.
//   tx     [TÀI XỈU] Ván #N: ... · ai đặt bao nhiêu → +/- (bỏ "· không ai đặt"); ván HUỶ có hoàn tiền; [HŨ BÃO] Ván #N bú ...
//   mine   [WEB DÒ MÌN] cược / BÙM / DỪNG nhận / JACKPOT / hộp...; [⚠️ NỔ HŨ DÒ MÌN]; [⚠️ DÒ MÌN TRẢ LỚN]
//   naprut [RÚT WEB] / [RÚT WEB VÀNG] (+ LỖI, đã hoàn) = web -> game; [NẠP GAME] = game -> web
// Mọi dòng khác (GM, panel, game khác, hệ thống, điểm danh...) không hiện. Thêm mục: sửa mucCua + MUC_TEN.
const MUC_TEN = { tx: '🎲 Tài Xỉu', mine: '💣 Dò Mìn', naprut: '💰 Nạp / Rút' };
const NAPRUT_TEN = { 'RÚT WEB': 'Rút web → game', 'RÚT WEB LỖI': 'Rút web lỗi', 'RÚT WEB VÀNG': 'Đổi vàng → game', 'RÚT WEB VÀNG LỖI': 'Đổi vàng lỗi', 'NẠP GAME': 'Nạp game → web' };
function mucCua(r) {
    const t = r.tag, m = r.msg;
    if (t === 'TÀI XỈU') {
        if (/^\[TÀI XỈU\] Ván #\d+: /.test(m)) return /không ai đặt\s*$/.test(m) ? null : 'tx';
        return /HUỶ.*hoàn/.test(m) ? 'tx' : null;
    }
    if (t === 'HŨ BÃO') return /Ván #\d+ bú/.test(m) ? 'tx' : null;
    if (t === 'WEB DÒ MÌN' || t === '⚠️ NỔ HŨ DÒ MÌN' || t === '⚠️ DÒ MÌN TRẢ LỚN') return 'mine';
    if (NAPRUT_TEN[t]) return 'naprut';
    return null;
}

function doc(o = {}) {
    const ds = cacNgay();
    const ngay = ds.includes(o.ngay) ? o.ngay : (ds[0] || ngayVN());
    let txt = '';
    try { txt = fs.readFileSync(path.join(DIR, ngay + '.log'), 'utf8'); } catch { /* ngày chưa có dòng */ }
    let rows = [];
    for (const dong of txt.split('\n')) {
        if (!dong) continue;
        const a = dong.indexOf('\t'), b = dong.indexOf('\t', a + 1);
        if (a < 0 || b < 0) continue;
        const msg = dong.slice(b + 1);
        const tm = /^\[([^\]]{1,40})\]/.exec(msg);
        const r = { t: dong.slice(0, a), tag: tm ? tm[1] : '', msg };
        r.muc = mucCua(r);
        if (r.muc) rows.push(r);
    }
    if (o.cheKin === true) rows = rows.filter((r) => !RE_KIN.test(r.msg));   // cổng mod: lớp phụ, 3 mục vốn không có dòng kín
    const mucs = { tx: 0, mine: 0, naprut: 0 };
    rows.forEach((r) => { mucs[r.muc]++; });
    let loc = MUC_TEN[o.muc] ? rows.filter((r) => r.muc === o.muc) : rows;
    const q = String(o.q || '').trim().toLowerCase();
    if (q) loc = loc.filter((r) => (r.t + ' ' + r.msg).toLowerCase().includes(q));
    loc.reverse();   // mới nhất lên đầu
    const truoc = Math.max(0, Math.floor(Number(o.truoc) || 0));
    const gioiHan = Math.min(1000, Math.max(50, Math.floor(Number(o.gioiHan) || 300)));
    const trang = loc.slice(truoc, truoc + gioiHan).map((r) => {
        let msg = r.msg.replace(RE_BIMAT, '$1***');
        if (o.anIP) msg = msg.replace(RE_IP, '$1.$2.*.*');
        if (r.tag && msg.indexOf('[' + r.tag + ']') === 0) msg = msg.slice(r.tag.length + 2).trim();   // bỏ [TAG] đầu dòng, giao diện đã có nhãn
        return { t: r.t, muc: r.muc, nhan: r.muc === 'naprut' ? NAPRUT_TEN[r.tag] : (r.tag.startsWith('⚠️') || r.tag === 'HŨ BÃO' ? r.tag : ''), msg };
    });
    return {
        ngay,
        ngays: (ds.length ? ds : [ngay]).map((n) => ({ ngay: n, homNay: n === ngayVN() })),
        mucTen: MUC_TEN,
        mucs,
        tongNgay: rows.length,
        tong: loc.length,
        truoc,
        rows: trang,
        conNua: truoc + gioiHan < loc.length,
    };
}

module.exports = { khoiDong, ghi, doc, GIU_NGAY };
