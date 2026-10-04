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
// 04/10 (chủ server: "khó hiểu quá, chỉ show Tài Xỉu ván có người đặt, Dò Mìn, nạp rút web"): nhật ký CHỈ hiện 3 mục,
// mỗi mục là 1 DÒNG GỌN (không phải log thô): tên · chi tiết · số tiền (+ xanh / − đỏ). Log gốc đi kèm trong raw (bấm dòng để xem).
//   tx     [TÀI XỈU] Ván #N: ... · A đặt X → ±Y · B ... -> mỗi NGƯỜI 1 dòng (bỏ ván "không ai đặt"); ván HUỶ có hoàn; [HŨ BÃO] bú
//   mine   mỗi VÁN 1 dòng: gộp "cược" + khiên/🍀 + kết quả (BÙM / DỪNG / JACKPOT / NỔ HŨ / hoàn treo). Lãi lỗ lấy từ dòng
//          [DÒ MÌN VÁN] (bot ghi từ 04/10, đã gồm phí cỏ + thưởng hộp 🍀); ván cũ hơn thì tự tính = nhận − cược − phí
//   naprut [RÚT WEB] / [RÚT WEB VÀNG] (+ LỖI, đã hoàn) = web -> game; [NẠP GAME] = game -> web
// Mọi dòng khác không hiện. Thêm mục: sửa mucCua + MUC_TEN + phần dựng mục trong doc().
const MUC_TEN = { tx: '🎲 Tài Xỉu', mine: '💣 Dò Mìn', naprut: '💰 Nạp / Rút', shop: '🛒 Shop' };   // shop: 04/10
const NAPRUT = ['RÚT WEB', 'RÚT WEB LỖI', 'RÚT WEB VÀNG', 'RÚT WEB VÀNG LỖI', 'NẠP GAME'];
const MINE_TAG = ['WEB DÒ MÌN', 'DÒ MÌN VÁN', '⚠️ NỔ HŨ DÒ MÌN', '⚠️ DÒ MÌN TRẢ LỚN'];
function mucCua(r) {
    const t = r.tag, m = r.msg;
    if (t === 'TÀI XỈU') {
        if (/^\[TÀI XỈU\] Ván #\d+: /.test(m)) return /không ai đặt\s*$/.test(m) ? null : 'tx';
        return /HUỶ.*hoàn/.test(m) ? 'tx' : null;
    }
    if (t === 'HŨ BÃO') return /Ván #\d+ bú/.test(m) ? 'tx' : null;
    if (MINE_TAG.includes(t)) return 'mine';
    if (NAPRUT.includes(t)) return 'naprut';
    // 🛒 04/10: mua shop web - giao thẳng vào game ([SHOP ITEM] ... mua X xN (id) -> nhân vật (-giá)), vào rương, hoặc lỗi
    if (t === 'SHOP ITEM') return /^\[SHOP ITEM\] .+ mua .+ x\d+ \(\d+\) -> /.test(m) ? 'shop' : null;
    if (t === 'SHOP ITEM LỖI') return 'shop';
    if (t === 'RƯƠNG ÍCH KỶ') return / mua .+ x\d+ vào rương \(-\d+\)/.test(m) ? 'shop' : null;
    return null;
}

const so = (x) => Number(String(x == null ? '' : x).replace(/[.,\s]/g, '')) || 0;   // "1.000" / "1,000" / "1000" -> 1000
const vn = (n) => Number(n || 0).toLocaleString('vi-VN');
const boTag = (m) => m.replace(/^\[[^\]]+\]\s*/, '');

// Tài Xỉu: 1 dòng ván -> 1 mục mỗi người đặt
function dungTx(r) {
    const m = boTag(r.msg);
    let x = /^Ván #(\d+): (\d-\d-\d) \(Tổng (\d+) \| ([^)]+)\)(.*)$/.exec(m);
    if (x) {
        const kq = x[2] + ' = ' + x[4].replace(/ \| /g, ' · ');
        return x[5].split(' · ').filter(Boolean).map((p) => {
            const y = /^(.+?) đặt ([\d.,]+) → ([+-]?[\d.,]+)$/.exec(p.trim());
            if (!y) return null;
            const lai = (y[3].trim().startsWith('-') ? -1 : 1) * so(y[3].replace(/^[+-]/, ''));
            return { t: r.t, muc: 'tx', icon: '🎲', ten: y[1], dat: so(y[2]), chinh: 'đặt ' + vn(so(y[2])), phu: 'Ván #' + x[1] + ' · ' + kq, so: lai, mau: lai > 0 ? 'xanh' : lai < 0 ? 'do' : 'xam', raw: [r.msg] };
        }).filter(Boolean);
    }
    if ((x = /^Ván #(\d+) HUỶ - (.*)$/.exec(m))) return [{ t: r.t, muc: 'tx', icon: '🎲', ten: '', chinh: 'Hủy ván #' + x[1], phu: x[2], so: null, mau: 'xam', raw: [r.msg] }];
    if ((x = /^Ván #(\d+) bú ([\d.,]+) cho (\d+) người/.exec(m))) return [{ t: r.t, muc: 'tx', icon: '🌪️', ten: '', chinh: 'Hũ bão ván #' + x[1], phu: 'trả cho ' + x[3] + ' người', so: so(x[2]), mau: 'xanh', raw: [r.msg] }];
    return [];
}

// Dò Mìn: duyệt theo thời gian, gộp mọi dòng của 1 ván thành 1 mục
function gopDoMin(rs, homNayDangChoi) {
    const ds = [], mo = {}, cuoi = {};
    const ketThuc = (g, kq, lai, phu) => {
        g.phu = phu;
        if (!g.chuan) { g.lai = lai; g.kq = kq; } else if (g.kq === 'dang') g.kq = kq;
        delete mo[g.ten];
    };
    for (const r of rs) {
        const m = boTag(r.msg);
        let x;
        if (r.tag === 'WEB DÒ MÌN' && (x = /^(.+?) cược (\d+)(?: \+ (\d+) phí cỏ)? \| (\d+) mìn \| (\d+) ô/.exec(m))) {
            const g = { t: r.t, i: r.i, ten: x[1], cuoc: +x[2], phi: +(x[3] || 0), min: +x[4], co: +x[5], lai: null, kq: 'dang', phu: '', them: '', raw: [r.msg], chuan: false };
            ds.push(g); mo[g.ten] = g; cuoi[g.ten] = g;
            continue;
        }
        if (r.tag === 'DÒ MÌN VÁN' && (x = /^(.+?) \| cược (\d+) \| phí (\d+) \| (\d+) mìn \| mở (\d+) ô \| (.+?) \| lãi (-?\d+)$/.exec(m))) {
            let g = mo[x[1]] || cuoi[x[1]];
            if (!g || g.chuan) {   // thiếu dòng cược (log cũ bị cắt) -> dựng ván từ dòng tổng kết
                g = { t: r.t, i: r.i, ten: x[1], cuoc: +x[2], phi: +x[3], min: +x[4], co: 0, lai: null, kq: 'dang', phu: '', them: '', raw: [], chuan: false };
                ds.push(g); cuoi[g.ten] = g;
            }
            g.chuan = true; g.lai = Number(x[7]); g.raw.push(r.msg);
            if (g.kq === 'dang') { g.kq = g.lai >= 0 ? 'thang' : 'thua'; g.phu = x[6] + ' · mở ' + x[5] + ' ô'; delete mo[g.ten]; }
            continue;
        }
        let ten = null;
        if ((x = /^Hoàn (\d+) cho (.+?) - /.exec(m))) ten = x[2];
        else if ((x = /^(.+?) (BÙM|DỪNG|JACKPOT|🛡️|🍀|🏆|chọn hộp|\+)/.exec(m))) ten = x[1];
        const g = ten && (mo[ten] || cuoi[ten]);
        if (!g) continue;   // dòng lẻ không ghép được ván nào -> bỏ
        g.raw.push(r.msg);
        if ((x = /BÙM ở ô (\d+) - mất (\d+)/.exec(m))) ketThuc(g, 'thua', -(g.cuoc + g.phi), '💥 BÙM ô ' + x[1]);
        else if ((x = /DỪNG ở (\d+) ô - nhận (\d+)/.exec(m))) ketThuc(g, 'thang', so(x[2]) - g.cuoc - g.phi, 'dừng ở ' + x[1] + ' ô · nhận ' + vn(so(x[2])));
        else if ((x = /JACKPOT.*nhận (\d+)/.exec(m))) ketThuc(g, 'thang', so(x[1]) - g.cuoc - g.phi, '🏆 JACKPOT · nhận ' + vn(so(x[1])));
        else if ((x = /= ([\d.,]+) \+ trần ván ([\d.,]+)/.exec(m))) g.noHu = so(x[1]) + so(x[2]);
        else if ((x = /🏆 chọn hộp bội số \d+ - x(\d+)/.exec(m))) ketThuc(g, 'thang', (g.noHu || 0) - g.cuoc - g.phi, '🏆 NỔ HŨ x' + x[1] + (g.noHu ? ' · nhận ' + vn(g.noHu) : ''));
        else if (/^Hoàn/.test(m)) ketThuc(g, 'hoan', 0, 'ván treo quá 2 tiếng · đã hoàn');
        else if (/🛡️/.test(m)) g.them += '🛡️';
        else if (/🍀/.test(m) && !/chờ chọn/.test(m)) g.them += '🍀';
    }
    return ds.map((g) => {
        const dang = g.kq === 'dang';
        const phu = dang ? (homNayDangChoi(g.t) ? '⏳ đang chơi' : 'không có kết quả (bot restart giữa ván → đã hoàn)') : g.phu;
        return {
            t: g.t, i: g.i, muc: 'mine', icon: '💣', ten: g.ten,
            chinh: 'cược ' + vn(g.cuoc) + (g.phi ? ' +' + vn(g.phi) + ' phí' : '') + ' · ' + g.min + ' mìn' + (g.co ? ' · ' + g.co + '🍀' : ''),
            phu: phu + (g.them ? ' ' + g.them : ''),
            so: dang ? null : g.lai, mau: dang || g.kq === 'hoan' ? 'xam' : (g.lai > 0 ? 'xanh' : g.lai < 0 ? 'do' : 'xam'),
            cuoc: g.cuoc, raw: g.raw,
        };
    });
}

// Nạp / Rút: 1 dòng -> 1 mục
function dungNapRut(r) {
    const m = boTag(r.msg);
    let x;
    const muc = (icon, ten, chinh, phu, n, kieu) => ({ t: r.t, muc: 'naprut', icon, ten, chinh, phu, so: n, mau: kieu === 'loi' ? 'xam' : '', kieu, raw: [r.msg] });
    if (r.tag === 'RÚT WEB' && (x = /^(.+?) chuyển (\d+) KNB vào game "(.*?)"/.exec(m))) return muc('📤', x[1], 'Rút web → game', 'nhân vật "' + x[3] + '"', +x[2], 'rut');
    if (r.tag === 'RÚT WEB VÀNG' && (x = /^(.+?) đổi (\d+) KNB -> (\d+) vàng vào game "(.*?)"/.exec(m))) return muc('🪙', x[1], 'Đổi KNB → vàng', vn(+x[3]) + ' vàng vào "' + x[4] + '"', +x[2], 'rut');
    if (/LỖI$/.test(r.tag) && (x = /^(.+?) (\d+) -> "(.*?)" \| (.*)$/.exec(m))) return muc('⚠️', x[1], r.tag === 'RÚT WEB LỖI' ? 'Rút lỗi' : 'Đổi vàng lỗi', x[4], +x[2], 'loi');
    if (r.tag === 'NẠP GAME' && (x = /^(.+?) \+(\d+) KNB từ game \(GUID (\d+)/.exec(m))) return muc('📥', x[1], 'Nạp game → web', 'GUID ' + x[3], +x[2], 'nap');
    if (r.tag === 'NẠP GAME' && (x = /^Phiếu .*?: (\d+) KNB của GUID (\d+) CHƯA liên kết/.exec(m))) return muc('⏳', 'GUID ' + x[2], 'Nạp game → web', 'chưa liên kết ví - giữ phiếu, liên kết xong tự cộng', +x[1], 'loi');
    return muc('💰', '', boTag(r.msg), '', null, 'khac');
}

// 🛒 Shop: 1 lần mua -> 1 mục. Số bên phải = KNB đã chi (không tô xanh/đỏ, không phải thắng thua)
function dungShop(r) {
    const m = boTag(r.msg);
    let x;
    const muc = (icon, ten, chinh, phu, n, kieu) => ({ t: r.t, muc: 'shop', icon, ten, chinh, phu, so: n, mau: kieu === 'loi' ? 'xam' : '', kieu, raw: [r.msg] });
    if (r.tag === 'SHOP ITEM' && (x = /^(.+?) mua (.+) x(\d+) \((\d+)\) -> (.*) \(-(\d+)\)$/.exec(m))) return muc('🛒', x[1], 'mua ' + x[2] + ' ×' + vn(+x[3]), 'vào game · ' + x[5], +x[6], 'mua');
    if (r.tag === 'RƯƠNG ÍCH KỶ' && (x = /^(.+?) mua (.+) x(\d+) vào rương \(-(\d+)\)$/.exec(m))) return muc('🧰', x[1], 'mua ' + x[2] + ' ×' + vn(+x[3]), 'vào Rương Ích Kỷ', +x[4], 'mua');
    if (r.tag === 'SHOP ITEM LỖI' && (x = /^(.+?) mua (.+) x(\d+) \((\d+)\) -> (.*?) \| (.*)$/.exec(m))) return muc('⚠️', x[1], 'mua lỗi: ' + x[2] + ' ×' + vn(+x[3]), x[6], null, 'loi');
    return muc('🛒', '', m, '', null, 'khac');
}

function thongKe(ds) {
    const tk = { tx: { luot: 0, dat: 0, lai: 0 }, mine: { van: 0, cuoc: 0, lai: 0, thang: 0, thua: 0 }, naprut: { rut: 0, nap: 0, n: 0 }, shop: { luot: 0, knb: 0, mon: 0 } };
    for (const d of ds) {
        if (d.muc === 'tx' && d.ten) { tk.tx.luot++; tk.tx.dat += d.dat || 0; tk.tx.lai += d.so || 0; }
        if (d.muc === 'mine' && d.so !== null) {   // ván đã có kết quả (kể cả hoàn = 0); ván đang chơi chưa tính
            tk.mine.van++; tk.mine.cuoc += d.cuoc || 0; tk.mine.lai += d.so || 0;
            if (d.so > 0) tk.mine.thang++; else if (d.so < 0) tk.mine.thua++;
        }
        if (d.muc === 'shop' && d.kieu === 'mua') { tk.shop.luot++; tk.shop.knb += d.so || 0; }
        if (d.muc === 'naprut') { tk.naprut.n++; if (d.kieu === 'rut') tk.naprut.rut += d.so || 0; if (d.kieu === 'nap') tk.naprut.nap += d.so || 0; }
    }
    return tk;
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
    // ván Dò Mìn chưa có kết quả: hôm nay + bắt đầu < 30 phút trước = "đang chơi"
    const laHomNay = ngay === ngayVN(), bayGio = gioVN();
    const giay = (t) => { const p = String(t).split(':').map(Number); return p[0] * 3600 + p[1] * 60 + (p[2] || 0); };
    const dangChoi = (t) => laHomNay && giay(bayGio) - giay(t) < 1800;
    let muc = [];
    rows.forEach((r, i) => { r.i = i; });
    for (const r of rows) {
        if (r.muc === 'tx') muc.push(...dungTx(r).map((d) => ({ ...d, i: r.i })));
        else if (r.muc === 'naprut') muc.push({ ...dungNapRut(r), i: r.i });
        else if (r.muc === 'shop') muc.push({ ...dungShop(r), i: r.i });
    }
    muc.push(...gopDoMin(rows.filter((r) => r.muc === 'mine'), dangChoi));   // mỗi ván mang i = dòng cược đầu tiên
    muc.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i));
    const mucs = { tx: 0, mine: 0, naprut: 0, shop: 0 };
    muc.forEach((d) => { mucs[d.muc]++; });
    let loc = MUC_TEN[o.muc] ? muc.filter((d) => d.muc === o.muc) : muc;
    const q = String(o.q || '').trim().toLowerCase();
    // Tài Xỉu: nhiều người chung 1 dòng log gốc -> chỉ tìm trong phần của chính người đó (không tìm trong raw)
    if (q) loc = loc.filter((d) => [d.t, d.ten, d.chinh, d.phu].concat(d.muc === 'tx' ? [] : d.raw).join(' ').toLowerCase().includes(q));
    const tk = thongKe(loc);
    loc.reverse();   // mới nhất lên đầu
    const truoc = Math.max(0, Math.floor(Number(o.truoc) || 0));
    const gioiHan = Math.min(1000, Math.max(50, Math.floor(Number(o.gioiHan) || 300)));
    const che = (s) => { let x = String(s == null ? '' : s).replace(RE_BIMAT, '$1***'); if (o.anIP) x = x.replace(RE_IP, '$1.$2.*.*'); return x; };
    const trang = loc.slice(truoc, truoc + gioiHan).map((d) => ({
        t: d.t, muc: d.muc, icon: d.icon, ten: che(d.ten), chinh: che(d.chinh), phu: che(d.phu), so: d.so, mau: d.mau, raw: d.raw.map(che),
    }));
    return {
        ngay,
        ngays: (ds.length ? ds : [ngay]).map((n) => ({ ngay: n, homNay: n === ngayVN() })),
        mucTen: MUC_TEN,
        mucs,
        thongKe: tk,
        tong: loc.length,
        truoc,
        rows: trang,
        conNua: truoc + gioiHan < loc.length,
    };
}

module.exports = { khoiDong, ghi, doc, GIU_NGAY };
