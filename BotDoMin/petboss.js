// 🐾 01/10: SHOP "CHỌN PET BOSS" - mỗi ví nhận ĐÚNG 1 con pet Huyễn Hóa: chọn skin (hình admin up) + kiểu
// (Ngoại / Nội / Cân bằng, = tư chất) rồi bấm Nhận. Hiện như 1 món trong nhóm ⭐ QUAN TRỌNG của shop web.
//  - Danh mục: panel GM /api/pets -> skins (đọc docs/pet-skin.tsv + tư chất PetAttrTable của repo game).
//    Cache trong RAM, nạp lại 10 phút/lần + khi admin lưu. Panel GM chết thì giữ bản cũ.
//  - Cấu hình: dbCache._petBoss = { on, name, price, note, img, ban, skins: { <tên skin>: { img, off } } }
//    ban = 'tanthu' (cấp mang 5) | 'v2' (cấp mang 85/95). Bản 'admin' (12000) KHÔNG bao giờ bán.
//  - Đã nhận: userData.petBoss = { id, name, ts }. Admin xoá dòng này (panel) là chọn lại được.
//  - Giao: tlbb.givePet -> hàng đợi quà, game phát khi đăng nhập / đổi bản đồ. Trừ KNB TRƯỚC, chắc chắn
//    chưa giao thì hoàn; mơ hồ (timeout) thì giữ + báo admin (chống giao 2 con) - cùng luật shop item.
const BAN = { tanthu: 'Tân Thủ (cấp mang 5)', v2: 'V2 (cấp mang 85 / 95)' };
const TC_TEN = ['Cường lực', 'Thể lực', 'Nội lực', 'Thân pháp', 'Trí lực'];

module.exports = function petBoss(d) {
    // d: { db(), getUserData, updatePoints, saveDbNow, logDog, writeLog, featGuard, debtBlock, deliverBusy, deliverLock, deliverUnlock, tlbb }
    let CAT = [], catTs = 0, catErr = '';

    async function refresh() {
        try {
            const j = await d.tlbb.gmCall('GET', '/api/pets');
            if (!j || !j.ok || !Array.isArray(j.skins)) throw new Error((j && j.error) || 'panel GM chưa có danh sách skin');
            CAT = j.skins.filter((x) => x && BAN[x.ban]).map((x) => ({
                id: String(x.id), skin: String(x.skin), cap: String(x.cap), kieu: String(x.kieu), ban: String(x.ban),
                tc: Array.isArray(x.tc) ? x.tc.map((n) => Math.floor(Number(n) || 0)) : [],
            }));
            catTs = Date.now(); catErr = '';
        } catch (e) { catErr = e.message; d.writeLog('SYSTEM', `[PET BOSS] Không tải được danh mục pet: ${e.message}`); }
        return CAT.length;
    }

    function cfg() {
        const c = d.db()._petBoss || {};
        return {
            on: !!c.on,
            name: String(c.name || '🐾 Chọn Pet Boss').slice(0, 60),
            price: Math.max(0, Math.floor(Number(c.price) || 0)),
            note: String(c.note || '').slice(0, 240),
            img: String(c.img || ''),
            ban: BAN[c.ban] ? c.ban : 'tanthu',
            skins: (c.skins && typeof c.skins === 'object') ? c.skins : {},
        };
    }
    const cleanImg = (s) => String(s || '').trim().replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 80);
    function setCfg(x) {
        x = x || {};
        const skins = {};
        if (x.skins && typeof x.skins === 'object') {
            for (const [k, v] of Object.entries(x.skins).slice(0, 60)) {
                const key = String(k).slice(0, 40);
                if (key) skins[key] = { img: cleanImg(v && v.img), off: !!(v && v.off) };
            }
        }
        d.db()._petBoss = {
            on: !!x.on,
            name: String(x.name || '').trim().slice(0, 60) || '🐾 Chọn Pet Boss',
            price: Math.max(0, Math.floor(Number(x.price) || 0)),
            note: String(x.note || '').trim().slice(0, 240),
            img: cleanImg(x.img),
            ban: BAN[x.ban] ? x.ban : 'tanthu',
            skins,
        };
        d.saveDbNow();
        refresh().catch(() => {});
        return adminState();
    }

    // skin của bản đang bán, giữ thứ tự pet-skin.tsv; mỗi skin các lựa chọn (cấp mang + kiểu) kèm tư chất
    function catalog(c, chiConMo) {
        const by = new Map();
        for (const r of CAT) {
            if (r.ban !== c.ban) continue;
            const sc = c.skins[r.skin] || {};
            if (chiConMo && sc.off) continue;
            if (!by.has(r.skin)) by.set(r.skin, { skin: r.skin, img: sc.img || '', off: !!sc.off, opts: [] });
            by.get(r.skin).opts.push({ cap: r.cap, kieu: r.kieu, tc: r.tc });
        }
        return [...by.values()];
    }

    function webState(uid) {
        const c = cfg();
        if (!c.on) return { on: false };
        const u = d.getUserData(uid);
        return {
            on: true, name: c.name, price: c.price, note: c.note, img: c.img, ban: c.ban, banLabel: BAN[c.ban], tcTen: TC_TEN,
            skins: catalog(c, true),
            picked: u.petBoss ? { name: u.petBoss.name, ts: u.petBoss.ts } : null,
        };
    }

    async function pick(uid, skin, cap, kieu) {
        const ft = d.featGuard('shop'); if (ft) return { error: ft };
        const debt = d.debtBlock(uid, 'nhận pet boss'); if (debt) return { error: debt };
        const c = cfg();
        if (!c.on) return { error: '🐾 Chọn Pet Boss đang tắt' };
        const u = d.getUserData(uid);
        if (u.petBoss) return { error: `🐾 Bạn đã nhận ${u.petBoss.name} rồi - mỗi người chỉ 1 con` };
        skin = String(skin || ''); cap = String(cap || ''); kieu = String(kieu || '');
        const r = CAT.find((x) => x.ban === c.ban && x.skin === skin && x.cap === cap && x.kieu === kieu);
        if (!r || (c.skins[skin] && c.skins[skin].off)) return { error: 'Pet này không có trong danh sách - tải lại trang rồi chọn lại' };
        if ((u.points || 0) < c.price) return { error: `Cần ${c.price.toLocaleString()} KNB (bạn có ${(u.points || 0).toLocaleString()})` };
        const target = String(u.tlbbGuid || '').trim() || String(u.ingameName || '').trim();
        if (!target) return { error: 'Chưa liên kết nhân vật trong game - nhắn admin liên kết trước đã' };
        if (d.deliverBusy()) return { error: '⏳ Đang giao một đơn khác - chờ vài giây rồi bấm lại (chưa trừ đồng nào)' };
        d.deliverLock();
        const ten = `${skin} ${r.cap === '5' ? '' : r.cap + ' '}${kieu}`.replace(/\s+/g, ' ');
        const who = u.name || uid;
        // giữ chỗ TRƯỚC khi gọi game: bấm 2 lần / 2 tab cùng lúc cũng chỉ 1 lượt lọt qua
        u.petBoss = { id: r.id, name: ten, ts: Date.now() };
        if (c.price) d.updatePoints(uid, -c.price);
        d.logDog('shop', uid, who, -c.price, `nhận pet boss ${ten} (${r.id})`);
        d.saveDbNow();
        let res = null, err = null;
        try { res = await d.tlbb.givePet(target, r.id); } catch (e) { err = e; }
        d.deliverUnlock();
        if (res && res.ok) {
            d.writeLog('ADMIN', `[PET BOSS] ${who} nhận ${ten} (${r.id}) -> ${res.name} (-${c.price})`);
            return { ok: true, message: `✅ Đã gửi ${ten} cho ${res.name} - pet vào túi khi đăng nhập hoặc đổi bản đồ (ô pet đầy thì lần sau nhận)`, balance: d.getUserData(uid).points || 0 };
        }
        const msg = (err && err.message) || 'không nhận được phản hồi';
        if (/player not found/i.test(msg)) {
            delete u.petBoss;
            if (c.price) { d.updatePoints(uid, c.price); d.logDog('refund', uid, who, c.price, `hoàn pet boss ${ten} (chưa giao: ${msg})`); }
            d.saveDbNow();
            return { error: `↩️ Chưa giao được (${msg.replace(/\s*\(player not found\)/i, '')})${c.price ? ` - đã hoàn ${c.price.toLocaleString()} KNB` : ''}, chọn lại được` };
        }
        d.writeLog('ADMIN', `[PET BOSS LỖI] ${who} nhận ${ten} (${r.id}) -> ${target} | ${msg} - kiểm hàng đợi quà, chưa có thì xoá lượt + hoàn tay`);
        return { error: '⏳ Chưa xác nhận được với game - admin sẽ kiểm (không nhận được sẽ cho chọn lại). Đừng chọn tiếp kẻo trùng.', balance: d.getUserData(uid).points || 0 };
    }

    function picks() {
        const db = d.db();
        return Object.entries(db).filter(([k, v]) => /^\d{5,20}$/.test(k) && v && v.petBoss)
            .map(([k, v]) => ({ uid: k, name: v.name || k, game: v.ingameName || '', pet: v.petBoss.name, id: v.petBoss.id, ts: v.petBoss.ts }))
            .sort((a, b) => b.ts - a.ts);
    }
    function resetPick(uid) {
        const u = d.db()[String(uid)];
        if (!u || !u.petBoss) return { error: 'Người này chưa nhận pet boss' };
        const old = u.petBoss.name;
        delete u.petBoss;
        d.saveDbNow();
        d.writeLog('ADMIN', `[PET BOSS] Xoá lượt của ${u.name || uid} (đã nhận ${old}) - được chọn lại`);
        return { ok: true, message: `Đã xoá lượt của ${u.name || uid} (${old}) - người này chọn lại được. KNB KHÔNG tự hoàn.` };
    }
    function adminState() {
        const c = cfg();
        return { cfg: c, bans: Object.entries(BAN).map(([k, l]) => [k, l]), skins: catalog(c, false), picks: picks(), catTs, catErr, tcTen: TC_TEN };
    }

    setTimeout(() => refresh().catch(() => {}), 5000);
    setInterval(() => refresh().catch(() => {}), 10 * 60 * 1000);
    return { webState, pick, adminState, setCfg, resetPick, refresh };
};
