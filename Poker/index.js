// ============================================================================
//  index.js — MÁY CHỦ POKER ĐỨNG RIÊNG (dev local + bộ kiểm web-test.js)
//
//  PRODUCTION KHÔNG CHẠY FILE NÀY. Poker nhúng thẳng vào web BotDoMin (cùng cổng, cùng
//  phiên): xem BotDoMin/webplay.js (/poker/, /api/poker/*) và BotDoMin/index.js (ctx.poker).
//  Toàn bộ logic phòng/giải nằm ở Poker/web.js — file này chỉ thêm đăng nhập riêng + phục vụ
//  file để chạy một mình được:
//
//     POKER_PORT=4003 POKER_DB="c:/Users/nguye/Desktop/bialk-test/database.json" node Poker/index.js
//
//  Chỉ ĐỌC database.json. Tuyệt đối không ghi.
// ============================================================================
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { taoPoker } = require('./web.js');

const CONG = Number(process.env.POKER_PORT) || 3003;
const DUONG_DB = process.env.POKER_DB || path.join(__dirname, '..', 'BotDoMin', 'database.json');
const ADMIN_ENV = String(process.env.POKER_ADMIN || '').split(',').map(s => s.trim()).filter(Boolean);

// ---------------------------------------------------------------- đọc DB (chỉ đọc, cache 3s)
let dbCache = { luc: 0, data: {} };
function docDb() {
    const bayGio = Date.now();
    if (bayGio - dbCache.luc < 3000) return dbCache.data;
    try { dbCache = { luc: bayGio, data: JSON.parse(fs.readFileSync(DUONG_DB, 'utf8')) }; }
    catch (e) { console.error('[poker] đọc database.json hỏng:', e.message); }
    return dbCache.data;
}
const layNguoi = (id) => (docDb() || {})[id] || null;
/** Admin = _pokerAdmin trong DB (đặt ở panel BotDoMin SUPER) + biến POKER_ADMIN nếu có. */
function danhSachAdmin() {
    const db = docDb() || {};
    const trongDb = Array.isArray(db._pokerAdmin) ? db._pokerAdmin.map(String) : [];
    return [...new Set([...ADMIN_ENV, ...trongDb])];
}
const laAdmin = (id) => danhSachAdmin().includes(String(id));

const poker = taoPoker({
    layNguoi, laAdmin,
    giayAfk: Number(process.env.POKER_AFK_GIAY) || undefined,
    giayXemLat: Number(process.env.POKER_GIAY_LAT) || undefined,
});
setInterval(() => poker.nhip(), 1000);

// ---------------------------------------------------------------- phiên riêng (chỉ bản đứng riêng)
const phien = new Map();   // token -> id
function aiDo(req) {
    const h = String(req.headers.authorization || '');
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    return phien.get(t) || null;
}

// ---------------------------------------------------------------- tiện ích
const traJson = (res, ma, obj) => {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(ma, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
    res.end(b);
};
function docThan(req) {
    return new Promise((ok) => {
        let s = '', qua = false;
        req.on('data', (c) => { s += c; if (s.length > 64 * 1024) { qua = true; req.destroy(); } });
        req.on('end', () => { if (qua) return ok({}); try { ok(JSON.parse(s || '{}')); } catch { ok({}); } });
        req.on('error', () => ok({}));
    });
}
const KIEU = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp' };
function guiFile(res, ten) {
    if (ten !== 'trang.html' && !/^bai\/[A-Za-z0-9]{1,4}\.webp$/.test(ten)) return traJson(res, 404, { ok: false, error: 'Không có' });
    fs.readFile(path.join(__dirname, ten), (e, b) => {
        if (e) return traJson(res, 404, { ok: false, error: 'Không có' });
        res.writeHead(200, { 'Content-Type': KIEU[path.extname(ten)] || 'application/octet-stream',
            'Cache-Control': ten.startsWith('bai/') ? 'public, max-age=604800' : 'no-store' });
        res.end(b);
    });
}

// Tên đường bản đứng riêng -> tên đường trong web.js (giữ tên cũ để bộ kiểm khỏi đổi)
const DOI_TEN = { '/api/trangthai': '/state', '/api/dondep': '/giaitan' };

const may = http.createServer(async (req, res) => {
    const duong = new URL(req.url, 'http://x').pathname;
    try {
        if (duong === '/' || duong === '/trang.html') return guiFile(res, 'trang.html');
        if (duong.startsWith('/bai/')) return guiFile(res, duong.slice(1));
        if (!duong.startsWith('/api/')) return traJson(res, 404, { ok: false, error: 'Không có đường này' });

        if (req.method === 'POST' && duong === '/api/dangnhap') {
            const b = await docThan(req);
            const id = String(b.id || '').trim();
            const u = layNguoi(id);
            if (!u || !u.webPin || String(u.webPin) !== String(b.pin || '')) return traJson(res, 401, { ok: false, error: 'Sai ID hoặc mã PIN' });
            const t = crypto.randomBytes(24).toString('hex');
            phien.set(t, id);
            return traJson(res, 200, { ok: true, token: t, ten: u.ingameName || u.name || id });
        }

        const toi = aiDo(req);
        if (!toi) return traJson(res, 401, { ok: false, error: 'Chưa đăng nhập' });
        const body = req.method === 'POST' ? await docThan(req) : {};
        const p = DOI_TEN[duong] || duong.slice('/api'.length);
        return poker.xuLy({ path: p, method: req.method, body, userId: toi }, res, traJson);
    } catch (e) {
        return traJson(res, 400, { ok: false, error: e.message || 'Lỗi không rõ' });
    }
});

if (require.main === module) {
    may.listen(CONG, () => {
        const ad = danhSachAdmin();
        console.log('🃏 Poker (đứng riêng) chạy ở http://127.0.0.1:' + CONG);
        console.log('   dữ liệu (chỉ đọc): ' + DUONG_DB);
        console.log('   admin: ' + (ad.length ? ad.join(', ') : '(CHƯA ĐẶT)') + '   [đặt ở panel BotDoMin SUPER, hoặc POKER_ADMIN]');
    });
}

module.exports = { may, phong: poker.phong, canNgoi: poker.canNgoi, laAdmin, CONG, poker };
