// 👪 20/10 FAMILY - nhiều tài khoản game dùng chung 1 ví web (thiết kế: docs/FAMILY.md repo tlbbnetco4).
// Ví GỐC = ví trưởng family: giữ KNB + Rương Ích Kỷ chung. Ví thành viên mang famOf = id ví gốc.
// db._fam[idGoc] = { tv: [idGoc, id...], t }. Đăng nhập tài khoản nào trong family cũng vào ví gốc (webplay getSessionUser -> goc()).
// Liên kết: nhập tài khoản + mật khẩu game của acc kia -> gộp KNB + rương của nó vào ví gốc.
// Rời / bị đuổi (chỉ trưởng đuổi): acc đó mất hết (tài sản ở lại family), ví về 0. Trưởng không rời khi còn thành viên.
// Giai đoạn 1: link / rời / đuổi / đăng nhập vào ví chung. Chưa làm: điểm danh hết acc, túi boss mọi nhân vật, chọn nhân vật khi rút,
// Thương Phố gộp + rương đồ khoá, nạp từ NPC Ví Web về ví gốc, Discord.
'use strict';

module.exports = function taoFamily(ctx) {
    const db = () => ctx.getDb();
    const bang = () => { const d = db(); if (!d._fam || typeof d._fam !== 'object') d._fam = {}; return d._fam; };
    const laVi = (id) => { const u = db()[id]; return /^\d{15,20}$/.test(String(id)) && !!u && typeof u === 'object'; };

    // id ví gốc của 1 ví (không trong family thì là chính nó)
    function goc(id) {
        const u = db()[id];
        return u && u.famOf && laVi(u.famOf) ? String(u.famOf) : id;
    }
    // [gốc, thành viên...] - chỉ tính ví còn trỏ đúng về gốc
    function thanhVien(g) {
        const f = bang()[g];
        if (!f || !Array.isArray(f.tv)) return [g];
        return [g].concat(f.tv.filter((x) => x !== g && laVi(x) && String(db()[x].famOf || '') === g));
    }
    function moTa(id, g, toi) {
        const u = db()[id] || {};
        return { vi: id, acc: u.gameAcc || '', ten: u.ingameName || u.name || '', guid: u.tlbbGuid || '', truong: id === g, toi: id === toi };
    }
    function state(toi) {
        const g = goc(toi), ds = thanhVien(g);
        return { ok: true, coFam: ds.length > 1, laTruong: toi === g, tv: ds.map((id) => moTa(id, g, toi)) };
    }
    // Chuyển KNB + đồ Rương Ích Kỷ từ ví `tu` sang ví `ve` (chuyển nội bộ - không qua updatePoints, không tính lãi/lỗ ngày)
    function gop(tu, ve) {
        const a = ctx.getUserData(tu), b = ctx.getUserData(ve);
        const knb = Math.max(0, Math.floor(Number(a.points) || 0));
        if (knb) { a.points = 0; b.points = (Number(b.points) || 0) + knb; }
        const ka = ctx.fam.ichKyOf(a), kb = ctx.fam.ichKyOf(b);
        let loai = 0, mon = 0;
        for (const [id, n0] of Object.entries(ka.items)) {
            const n = Math.floor(Number(n0) || 0);
            if (n > 0) { kb.items[id] = (Number(kb.items[id]) || 0) + n; loai++; mon += n; }
        }
        ka.items = {};
        return { knb, loai, mon };
    }
    function tenVi(id) { const u = db()[id] || {}; return (u.gameAcc || u.name || id) + (u.ingameName ? ' (' + u.ingameName + ')' : ''); }

    // toi = ví của tài khoản đang đăng nhập; tim(acc) = async -> id ví của tài khoản game đó (cùng cách đăng nhập web)
    async function lienKet(toi, acc, pass, tim, biKhoa) {
        acc = String(acc || '').trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(acc)) return { error: 'Tài khoản game không hợp lệ' };
        if (!/^[A-Za-z0-9_@.!-]{6,32}$/.test(String(pass || ''))) return { error: 'Sai tài khoản hoặc mật khẩu game', sai: true };
        let ok = false;
        try { ok = await ctx.tlbbKiemMk(acc, pass); } catch (e) { return { error: 'Không kiểm được với server game: ' + String(e.message).slice(0, 120) }; }
        if (!ok) return { error: 'Sai tài khoản hoặc mật khẩu game', sai: true };
        if (biKhoa(acc)) return { error: '🔒 Tài khoản game này đã bị khoá' };
        const kia = await tim(acc);
        // ⚠️ từ đây tới lúc ghi KHÔNG await - 2 lần bấm không chen nhau được
        if (!kia || !laVi(kia)) return { error: 'Tài khoản "' + acc + '" chưa có ví web - nhắn admin gắn nhân vật trước' };
        const g = goc(toi), uk = db()[kia];
        if (kia === toi || goc(kia) === g) return { error: 'Tài khoản này đã ở trong family của bạn' };
        if (uk.clone) return { error: 'Ví của "' + acc + '" là ví clone (chỉ Thương Phố) - nhắn admin đổi thành ví thường trước' };
        if (uk.famOf) return { error: '"' + acc + '" đang ở family khác - rời family đó trước' };
        if (thanhVien(kia).length > 1) return { error: '"' + acc + '" đang là trưởng family khác (còn thành viên)' };
        if (ctx.fam.noCua(kia) > 0) return { error: '"' + acc + '" đang nợ KNB - trả sạch nợ rồi mới liên kết' };
        const gp = gop(kia, g);
        uk.famOf = g;
        const f = bang()[g] || (bang()[g] = { tv: [g], t: Date.now() });
        f.tv = thanhVien(g).filter((x) => x !== kia).concat([kia]);
        delete bang()[kia];
        ctx.saveDbNow();
        ctx.writeLog('ADMIN', `[FAMILY] ${tenVi(kia)} vào family của ${tenVi(g)} - gộp ${gp.knb.toLocaleString('vi-VN')} KNB + ${gp.mon.toLocaleString('vi-VN')} món rương (${gp.loai} loại)`);
        return { ok: true, acc, gop: gp };
    }
    function boRa(id, g, ai) {   // id ra khỏi family g: mất hết - gom phần còn sót trên ví nó về gốc
        const gp = gop(id, g);
        delete ctx.getUserData(id).famOf;
        const f = bang()[g];
        if (f) { f.tv = thanhVien(g).filter((x) => x !== id); if (f.tv.length <= 1) delete bang()[g]; }
        ctx.saveDbNow();
        ctx.writeLog('ADMIN', `[FAMILY] ${tenVi(id)} ${ai} family của ${tenVi(g)}` + (gp.knb || gp.mon ? ` (gom thêm ${gp.knb} KNB + ${gp.mon} món về family)` : ''));
    }
    function roi(toi) {
        const g = goc(toi);
        if (toi === g) return thanhVien(g).length > 1 ? { error: 'Trưởng family không rời được khi còn thành viên - đuổi hết thành viên trước' } : { error: 'Bạn chưa ở trong family nào' };
        boRa(toi, g, 'rời');
        return { ok: true };
    }
    function duoi(toi, vi) {
        const g = goc(toi);
        if (toi !== g) return { error: 'Chỉ trưởng family (tài khoản tạo family) mới đuổi được' };
        vi = String(vi || '');
        if (vi === g || !thanhVien(g).includes(vi)) return { error: 'Tài khoản này không phải thành viên family' };
        boRa(vi, g, 'bị đuổi khỏi');
        return { ok: true };
    }
    return { goc, thanhVien, state, lienKet, roi, duoi };
};
