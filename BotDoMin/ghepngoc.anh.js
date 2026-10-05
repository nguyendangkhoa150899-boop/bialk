// 📸 05/10: ẢNH KẾT QUẢ GHÉP NGỌC gửi Discord (thay câu chữ).
// Server tự vẽ từ dữ liệu thật của lượt luyện (không nhận ảnh chụp từ máy người chơi -> không giả được kết quả).
// Bố cục chép màn hình 💎 Ghép Ngọc trên web: Bỏ vào | vòng tỉ lệ + kim + kết quả | món muốn luyện ra.
// SVG -> PNG bằng @resvg/resvg-js (bản dựng sẵn, không cần biên dịch). Font: DejaVu Sans (VPS có sẵn, đủ dấu tiếng Việt).
// Không có thư viện / lỗi vẽ -> trả null, ghepngoc.js tự quay về gửi câu chữ.
const fs = require('fs');
const path = require('path');

let Resvg = null;
try { ({ Resvg } = require('@resvg/resvg-js')); } catch { /* chưa cài -> co() = false */ }

const FONT = (process.env.GN_ANH_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf,/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
    .split(',').map((s) => s.trim()).filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
const HO_FONT = process.env.GN_ANH_FONT_HO || 'DejaVu Sans';

const W = 1100, H = 560;
const MAU = { nen: '#0f1218', khung: '#151926', vien: '#262a3d', chu: '#e8eaf2', mo: '#8a90a6', vang: '#f5c542', xanh: '#3ddc84', do: '#ff5d5d' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// bỏ emoji / ký tự font không có (DejaVu không có emoji -> ra ô vuông)
const sach = (s) => String(s == null ? '' : s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/#[a-zA-Z]/g, '').trim();
const cat = (s, n) => { s = sach(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// chia dòng theo từ, tối đa n dòng (dòng cuối cắt …)
function xuong(s, rong, n) {
    const L = []; let d = '';
    for (const w of sach(s).split(/\s+/)) { if ((d + ' ' + w).trim().length > rong && d) { L.push(d); d = w; } else d = (d + ' ' + w).trim(); }
    if (d) L.push(d);
    return L.length > n ? L.slice(0, n - 1).concat(cat(L.slice(n - 1).join(' '), rong)) : L;
}
const vnd = (n) => Math.floor(Number(n) || 0).toLocaleString('vi-VN');

// ---- icon vật phẩm: cắt 1 ô trong tấm ảnh (itemicon.js), nhúng base64. Nhớ tối đa 40 tấm.
const BO_NHO = new Map();
function anhTam(file, dir) {
    if (BO_NHO.has(file)) return BO_NHO.get(file);
    let uri = null;
    try { const b = fs.readFileSync(path.join(dir, file)); uri = 'data:' + (/\.png$/i.test(file) ? 'image/png' : 'image/jpeg') + ';base64,' + b.toString('base64'); } catch { /* thiếu tấm -> ô trống */ }
    BO_NHO.set(file, uri);
    if (BO_NHO.size > 40) BO_NHO.delete(BO_NHO.keys().next().value);
    return uri;
}
function oIcon(icon, dir, id, x, y, s) {
    const ic = icon && icon(id), uri = ic && anhTam(ic.f, dir);
    const vien = `<rect x="${x - 1}" y="${y - 1}" width="${s + 2}" height="${s + 2}" rx="4" fill="#0b0d14" stroke="#c9a227" stroke-width="1.5"/>`;
    if (!uri) return vien;
    return vien + `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="${ic.x} ${ic.y} 64 64"><image width="${ic.w}" height="${ic.h}" href="${uri}"/></svg>`;
}

function chu(x, y, s, o) {
    o = o || {};
    return `<text x="${x}" y="${y}" font-family="${HO_FONT}" font-size="${o.c || 14}" font-weight="${o.d ? 700 : 400}" fill="${o.m || MAU.chu}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(s)}</text>`;
}

// vòng tỉ lệ: đúng hình học client (ghepngoc.client.js ringSvg): vùng trúng = cung tiLe% bắt đầu ở lech, kim ở roll (0..100, từ đỉnh, chiều kim đồng hồ)
function vong(cx, cy, k, o) {
    const R = 96, CIR = 2 * Math.PI * R, w = Math.max(0, Math.min(100, o.tiLe)) / 100 * CIR, mau = o.thang ? MAU.xanh : MAU.do;
    let vach = '';
    for (let i = 0; i < 40; i++) {
        const g = i / 40 * 2 * Math.PI, r1 = R + 12, r2 = R + (i % 5 ? 15 : 18);
        vach += `<line x1="${(120 + r1 * Math.sin(g)).toFixed(1)}" y1="${(120 - r1 * Math.cos(g)).toFixed(1)}" x2="${(120 + r2 * Math.sin(g)).toFixed(1)}" y2="${(120 - r2 * Math.cos(g)).toFixed(1)}" stroke="#33384f" stroke-width="2"/>`;
    }
    const xoay = (-90 + (o.lech || 0) * 3.6).toFixed(2);
    return `<g transform="translate(${cx - 120 * k} ${cy - 120 * k}) scale(${k})">`
        + `<circle cx="120" cy="120" r="116" fill="#11131f" stroke="#262a3d" stroke-width="2"/>${vach}`
        + `<circle cx="120" cy="120" r="${R}" fill="none" stroke="#2a2440" stroke-width="16"/>`
        + (o.thang ? `<circle cx="120" cy="120" r="${R}" fill="none" stroke="${mau}" stroke-opacity=".25" stroke-width="28" stroke-dasharray="${w.toFixed(2)} ${CIR.toFixed(2)}" transform="rotate(${xoay} 120 120)"/>` : '')
        + `<circle cx="120" cy="120" r="${R}" fill="none" stroke="${mau}" stroke-width="16" stroke-dasharray="${w.toFixed(2)} ${CIR.toFixed(2)}" transform="rotate(${xoay} 120 120)"/>`
        + `<g transform="rotate(${((o.roll || 0) * 3.6).toFixed(2)} 120 120)"><polygon points="120,6 112,26 128,26" fill="#ff4d6d" stroke="#fff" stroke-width="1.5"/></g>`
        + `</g>`;
}

// o = { ten, t, thang, tiLe, roll, lech, tong, knb, dich: { id, ten, sl, gia }, vao: [{ id, ten, sl, gia }] }
function svg(o, icon, dir) {
    const mau = o.thang ? MAU.xanh : MAU.do;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
        + `<rect width="${W}" height="${H}" fill="${MAU.nen}"/>`;
    // tiêu đề
    s += `<polygon points="28,22 38,12 48,22 38,36" fill="#7dd3fc" stroke="#e0f2fe" stroke-width="1"/>`
        + chu(58, 31, 'Ghép Ngọc', { c: 20, d: 1 })
        + chu(W - 24, 31, cat(o.ten, 28) + '  ·  ' + new Date(o.t || Date.now()).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }), { c: 14, m: MAU.mo, a: 'end' });
    const Y = 52, HK = H - Y - 16;
    const khung = (x, w) => `<rect x="${x}" y="${Y}" width="${w}" height="${HK}" rx="14" fill="${MAU.khung}" stroke="${MAU.vien}"/>`;
    // ---- cột 1: BỎ VÀO
    const X1 = 16, W1 = 390;
    s += khung(X1, W1) + chu(X1 + 18, Y + 32, 'BỎ VÀO (' + o.vao.reduce((t, x) => t + x.sl, 0) + ' món)', { c: 14, d: 1, m: '#cfd3e3', ls: 1 });
    const TOI_DA = o.knb ? 7 : 8, hien = o.vao.slice(0, TOI_DA);
    let y = Y + 50;
    for (const x of hien) {
        s += oIcon(icon, dir, x.id, X1 + 18, y, 40)
            + chu(X1 + 70, y + 17, cat(x.ten, 33), { c: 14 })
            + chu(X1 + 70, y + 35, vnd(x.gia) + ' / cái', { c: 12, m: MAU.mo })
            + chu(X1 + W1 - 18, y + 27, '×' + vnd(x.sl), { c: 15, d: 1, a: 'end' })
            + `<line x1="${X1 + 18}" y1="${y + 47}" x2="${X1 + W1 - 18}" y2="${y + 47}" stroke="#ffffff10"/>`;
        y += 50;
    }
    if (o.vao.length > hien.length) { s += chu(X1 + 70, y + 16, '+ ' + (o.vao.length - hien.length) + ' loại khác', { c: 13, m: MAU.mo }); y += 26; }
    if (o.knb) s += `<circle cx="${X1 + 38}" cy="${y + 14}" r="9" fill="#c9a227"/>` + chu(X1 + 70, y + 19, 'KNB web', { c: 14 }) + chu(X1 + W1 - 18, y + 19, vnd(o.knb), { c: 15, d: 1, a: 'end' });
    s += `<line x1="${X1 + 18}" y1="${Y + HK - 52}" x2="${X1 + W1 - 18}" y2="${Y + HK - 52}" stroke="${MAU.vien}"/>`
        + chu(X1 + 18, Y + HK - 22, 'Tổng giá trị', { c: 17, d: 1 }) + chu(X1 + W1 - 18, Y + HK - 22, vnd(o.tong), { c: 18, d: 1, a: 'end' });
    // ---- cột 2: vòng + kết quả
    const X2 = X1 + W1 + 14, W2 = 300, CX = X2 + W2 / 2, CY = Y + 140;
    s += khung(X2, W2) + vong(CX, CY, 1.05, o)
        + chu(CX, CY + 8, (Math.round(o.tiLe * 1000) / 1000) + '%', { c: 30, d: 1, a: 'middle' })
        + chu(CX, CY + 32, (o.thang ? 'THÀNH CÔNG' : 'THẤT BẠI') + ' · TUNG ' + o.roll, { c: 11, m: o.thang ? MAU.xanh : '#ff8a8a', a: 'middle', ls: 1 });
    const KY = CY + 148, KH = 150;
    s += `<rect x="${X2 + 14}" y="${KY}" width="${W2 - 28}" height="${KH}" rx="12" fill="${o.thang ? '#123020' : '#2a1416'}" stroke="${o.thang ? MAU.xanh : '#7a3434'}"/>`
        + chu(CX, KY + 34, o.thang ? 'CHÚC MỪNG!' : 'THẤT BẠI', { c: 22, d: 1, m: o.thang ? MAU.xanh : '#ff8a8a', a: 'middle', ls: 1 })
        + oIcon(icon, dir, o.dich.id, X2 + 30, KY + 50, 40)
        + xuong(o.dich.ten + (o.dich.sl > 1 ? ' ×' + o.dich.sl : ''), 22, 2).map((l, i) => chu(X2 + 80, KY + 66 + i * 19, l, { c: 14, d: 1 })).join('')
        + chu(CX, KY + 118, o.tiLe + '% · tung ' + o.roll, { c: 12, m: MAU.mo, a: 'middle' })
        + chu(CX, KY + 137, o.thang ? 'đã vào Rương Ích Kỷ' : 'đồ đã bỏ vào bị mất', { c: 12, m: MAU.mo, a: 'middle' });
    // ---- cột 3: món muốn luyện ra
    const X3 = X2 + W2 + 14, W3 = W - X3 - 16, C3 = X3 + W3 / 2;
    s += khung(X3, W3) + chu(X3 + 18, Y + 32, 'MÓN MUỐN LUYỆN RA', { c: 14, d: 1, m: '#cfd3e3', ls: 1 })
        + (o.thang ? `<circle cx="${C3}" cy="${Y + 190}" r="70" fill="${MAU.xanh}" fill-opacity=".10"/>` : '')
        + oIcon(icon, dir, o.dich.id, C3 - 40, Y + 150, 80)
        + xuong(o.dich.ten + (o.dich.sl > 1 ? ' ×' + o.dich.sl : ''), 28, 2).map((l, i, a) => chu(C3, Y + 274 - (a.length - 1) * 24 + i * 24, l, { c: 18, d: 1, a: 'middle' })).join('')
        + chu(C3, Y + 304, 'giá trị ' + vnd(o.dich.gia), { c: 14, m: MAU.mo, a: 'middle' })
        + `<rect x="${C3 - 135}" y="${Y + 330}" width="270" height="44" rx="22" fill="${mau}" fill-opacity=".14" stroke="${mau}"/>`
        + chu(C3, Y + 358, o.thang ? 'LUYỆN THÀNH CÔNG' : 'LUYỆN THẤT BẠI', { c: 16, d: 1, m: mau, a: 'middle', ls: 1 })
        + chu(C3, Y + HK - 18, 'play.netco4.click · Ghép Ngọc', { c: 12, m: '#5b6178', a: 'middle' });
    return s + '</svg>';
}

// -> Buffer PNG | null
function ve(o, icon, dir) {
    if (!Resvg) return null;
    const r = new Resvg(svg(o, icon, dir), {
        fitTo: { mode: 'width', value: Math.round(W * 1.5) },
        font: { fontFiles: FONT, loadSystemFonts: !FONT.length, defaultFontFamily: HO_FONT },
        background: MAU.nen,
    });
    return r.render().asPng();
}

module.exports = { ve, svg, co: () => !!Resvg, font: () => FONT.slice() };
