// ============================================================================
//  web.js, MÔ-ĐUN POKER GẮN VÀO WEB BOTDOMIN (cùng cổng, cùng phiên đăng nhập)
//
//  Chủ server chốt "gộp chung lên BotDoMin, xài chung 1 link". webplay.js:
//    - phục vụ ../Poker/trang.html tại /poker/ và ảnh tại /poker/bai/*
//    - giao mọi /api/poker/* cho xuLy() ở đây, SAU khi đã xác thực + qua cổng liên kết
//  Người đã đăng nhập web bot = đã đăng nhập poker. Không có login riêng nữa.
//
//  Không đụng ví Dogcoin. Chỉ ĐỌC hồ sơ (qua deps.layNguoi) để kiểm điều kiện vào giải.
//  Mọi thao tác admin (đặt chip, bắt đầu, giải tán, bật/tắt tab) làm ở PANEL SUPER qua
//  các hàm quanLy.*, trang người chơi không có nút admin.
//
//  Poker/index.js (máy chủ đứng riêng cổng 3003) vẫn dùng chung mô-đun này để chạy
//  bộ kiểm web-test.js; production chạy nhúng.
// ============================================================================
'use strict';
const { taoGiai, taoLichBlind, TOI_DA_NGUOI, TOI_THIEU_NGUOI, DOGCOIN_VAO_GIAI, CHIP_DAU } = require('./giai.js');

const GIAY_AFK_MAC_DINH = 25;      // không hỏi thăm quá lâu = rớt mạng
const GIAY_XEM_LAT_MAC_DINH = 3;   // ván xong KHÔNG lật bài (mọi người bỏ) -> 3s rồi chia ván mới
// 18/09: ván có LẬT BÀI (showdown) giữ lâu hơn để đọc được ai thắng bằng bài gì, 5 lá nào
// chủ server thử 2 người all-in: "kết thúc quá lẹ, chưa hiểu chuyện gì đã qua tổng kết".
const GIAY_XEM_LAT_LAT_MAC_DINH = 6;

/**
 * deps:
 *   layNguoi(id)  -> bản ghi người chơi { name, points, ingameName, webPin } hoặc null
 *   laAdmin(id)   -> true nếu được mở giải
 *   tenCua(id)    -> tên hiển thị (mặc định: ingameName || name || id)
 *   giayAfk, giayXemLat (tùy chọn)
 */
function taoPoker(deps) {
    const layNguoi = deps.layNguoi;
    const laAdmin = deps.laAdmin || (() => false);
    const tenCua = deps.tenCua || ((id) => { const u = layNguoi(id); return (u && (u.ingameName || u.name)) || id; });
    const GIAY_AFK = deps.giayAfk || GIAY_AFK_MAC_DINH;
    const GIAY_XEM_LAT = deps.giayXemLat || GIAY_XEM_LAT_MAC_DINH;
    const GIAY_XEM_LAT_LAT = deps.giayXemLatLat || GIAY_XEM_LAT_LAT_MAC_DINH;
    let motVanGiu = GIAY_XEM_LAT;   // ván đang xong này giữ mấy giây (3 bỏ bài / 6 có lật)

    // ------------------------------------------------------------ phòng
    const phong = {
        ghe: Array(TOI_DA_NGUOI).fill(null),   // 8 ghế, null = trống, khác = id
        giai: null,
        cauHinh: { chipDau: CHIP_DAU },
        // 18/09: ai đã bấm ✅ SẴN SÀNG ở phòng chờ. Đủ ≥ 2 người ngồi và AI CŨNG sẵn sàng -> nhip() tự mở
        // giải, không cần admin. Rời ghế / giải tán / mở giải là xoá.
        sanSang: new Set(),
    };
    const chamCuoi = new Map();                 // id -> lần hỏi thăm gần nhất (dò AFK)
    let motVanXongLuc = 0;

    const dangNgoi = () => phong.ghe.map((id, ghe) => id ? { id, ghe } : null).filter(Boolean);
    const gheCua = (id) => phong.ghe.indexOf(id);
    const giaiDangChay = () => !!(phong.giai && phong.giai.xemChung().trangThai === 'DANG_CHAY');

    /** Đủ điều kiện ngồi chưa? null = được, chuỗi = lý do không. */
    function canNgoi(id) {
        const u = layNguoi(id);
        if (!u) return 'Chưa có tài khoản trong bot';
        if (!u.ingameName) return 'Chưa liên kết tên nhân vật, nhờ admin liên kết trước đã';
        if ((u.points || 0) < DOGCOIN_VAO_GIAI)
            return 'Cần có ít nhất ' + DOGCOIN_VAO_GIAI.toLocaleString('vi-VN') +
                   ' Dogcoin mới được vào giải (đang có ' + (u.points || 0).toLocaleString('vi-VN') + ')';
        return null;
    }

    // ------------------------------------------------------------ nhịp
    function ratSoatAfk() {
        if (!phong.giai) return;
        const bayGio = Date.now();
        for (const ng of phong.giai._trong.nguoi) {
            const mat = bayGio - (chamCuoi.get(ng.id) || 0) > GIAY_AFK * 1000;
            if (mat && !ng.afk) phong.giai.roiMang(ng.id);
            if (!mat && ng.afk) phong.giai.noiLai(ng.id);
        }
    }
    /** Gọi mỗi giây từ ngoài (webplay/index.js đứng riêng). Nuốt lỗi để không kéo bot theo. */
    /** Mở giải với những người đang ngồi. Dùng chung cho admin (panel) và tự mở khi ai cũng sẵn sàng. */
    function moGiai() {
        if (giaiDangChay()) return { error: 'Giải đang chạy rồi' };
        const ds = dangNgoi();
        if (ds.length < TOI_THIEU_NGUOI) return { error: 'Cần ít nhất ' + TOI_THIEU_NGUOI + ' người đang ngồi' };
        const rot = ds.filter(x => canNgoi(x.id) !== null);    // kiểm lại lúc mở
        if (rot.length) return { error: tenCua(rot[0].id) + ': ' + canNgoi(rot[0].id), rot: rot.map(x => x.id) };
        phong.giai = taoGiai({ chipDau: phong.cauHinh.chipDau });
        phong.giai.batDau(ds.map(x => ({ id: x.id, ten: tenCua(x.id), ghe: x.ghe })));
        phong.sanSang.clear();
        motVanXongLuc = 0;
        return { ok: true, soNguoi: ds.length };
    }
    /** 18/09: ≥ 2 người ngồi và AI CŨNG bấm sẵn sàng -> mở luôn, không cần admin. Ai rớt điều kiện
     *  (hết Dogcoin, bị huỷ liên kết) thì gỡ dấu sẵn sàng của họ để bàn không kẹt mãi. */
    function tuMoGiai() {
        const ds = dangNgoi();
        if (ds.length < TOI_THIEU_NGUOI || !ds.every(x => phong.sanSang.has(x.id))) return;
        const r = moGiai();
        if (r.error && r.rot) for (const id of r.rot) phong.sanSang.delete(id);
    }
    function nhip() {
        if (!phong.giai) { try { tuMoGiai(); } catch (e) { console.error('[poker] tự mở giải lỗi:', e.message); } return; }
        try {
            ratSoatAfk();
            phong.giai.nhip();
            const s = phong.giai.xemChung();
            if (s.trangThai === 'DANG_CHAY' && s.van && ['LAT', 'XONG'].includes(s.van.vong)) {
                if (!motVanXongLuc) {
                    motVanXongLuc = Date.now();
                    motVanGiu = (s.van.ketQua && s.van.ketQua.lat) ? GIAY_XEM_LAT_LAT : GIAY_XEM_LAT;
                }
                else if (Date.now() - motVanXongLuc > motVanGiu * 1000) { motVanXongLuc = 0; phong.giai.vanKe(); }
            } else motVanXongLuc = 0;
        } catch (e) { console.error('[poker] nhịp lỗi:', e.message); }
    }

    // ------------------------------------------------------------ trạng thái
    function trangThaiCho(id) {
        const u = layNguoi(id);
        const nen = {
            ok: true,
            toi: {
                id, ten: tenCua(id), dogcoin: (u && u.points) || 0,
                admin: laAdmin(id), duocNgoi: canNgoi(id) === null, viSaoKhong: canNgoi(id),
            },
            ghe: phong.ghe.map(x => x ? { id: x, ten: tenCua(x) } : null),
            cho: dangNgoi().map(x => ({ id: x.id, ten: tenCua(x.id), ghe: x.ghe })),
            gheCuaToi: gheCua(id),
            sanSang: [...phong.sanSang],                 // 18/09: ai đã bấm sẵn sàng (phòng chờ)
            toiSanSang: phong.sanSang.has(id),
            toiDa: TOI_DA_NGUOI, toiThieu: TOI_THIEU_NGUOI,
            chipDau: phong.cauHinh.chipDau, cauHinh: { ...phong.cauHinh },
            lichBlind: taoLichBlind(phong.cauHinh.chipDau).map(x => x.bb),
            dogcoinVao: DOGCOIN_VAO_GIAI,
        };
        if (!phong.giai) return { ...nen, giai: null };
        nen.demChiaBai = motVanXongLuc
            ? Math.max(0, Math.ceil((motVanXongLuc + motVanGiu * 1000 - Date.now()) / 1000)) : null;
        const trongGiai = phong.giai._trong.nguoi.some(p => p.id === id);
        // khán giả (kể cả người đã cháy) chỉ nhận bản CHUNG, không có bài riêng của ai
        return { ...nen, giai: trongGiai ? phong.giai.xem(id) : phong.giai.xemChung() };
    }

    // ------------------------------------------------------------ quản lý (panel SUPER gọi thẳng)
    const quanLy = {
        tomTat() {
            const s = phong.giai ? phong.giai.xemChung() : null;
            return {
                ghe: phong.ghe.map(x => x ? { id: x, ten: tenCua(x) } : null),
                soNgoi: dangNgoi().length, toiDa: TOI_DA_NGUOI, toiThieu: TOI_THIEU_NGUOI,
                chipDau: phong.cauHinh.chipDau,
                lichBlind: taoLichBlind(phong.cauHinh.chipDau).map(x => x.bb),
                giai: s ? { trangThai: s.trangThai, soVan: s.soVan, mucBlind: s.mucBlind, blind: s.blind,
                            nghi: s.nghi, nguoi: s.nguoi.map(p => ({ id: p.id, ten: p.ten, chip: p.chip, afk: p.afk })),
                            ketQua: s.ketQua } : null,
            };
        },
        datChip(chip) {
            if (giaiDangChay()) return { error: 'Giải đang chạy, đổi giải sau' };
            chip = Math.floor(Number(chip));
            if (!(chip >= 1000 && chip <= 100000) || chip % 500 !== 0) return { error: 'Chip khởi điểm từ 1.000 đến 100.000, bội số của 500' };
            phong.cauHinh.chipDau = chip;
            return { ok: true, chipDau: chip };
        },
        batDau() { return moGiai(); },   // admin bấm ở panel = đường tắt, không cần ai sẵn sàng
        giaiTan() {
            phong.giai = null; phong.ghe = Array(TOI_DA_NGUOI).fill(null); phong.sanSang.clear(); motVanXongLuc = 0;
            return { ok: true };
        },
        tamNghi(boi) { if (!phong.giai) return { error: 'Chưa có giải' }; phong.giai.tamNghi(boi || 'admin'); return { ok: true }; },
        choiTiep() { if (!phong.giai) return { error: 'Chưa có giải' }; phong.giai.choiTiep(); return { ok: true }; },
    };

    // ------------------------------------------------------------ API người chơi
    /**
     * req = { path ('/state', '/ngoi', ...), method, body, userId }, userId ĐÃ được xác thực ở ngoài.
     * res + sendJSON(res, code, obj) là của máy chủ gọi vào. Luôn trả { ok:true, ... } hoặc { ok:false, error }.
     */
    function xuLy(req, res, sendJSON) {
        const { path: duong, body, userId: toi } = req;
        const post = req.method === 'POST';
        chamCuoi.set(toi, Date.now());
        const tra = (obj) => sendJSON(res, 200, obj);
        const loi = (code, msg) => sendJSON(res, code, { ok: false, error: msg });
        try {
            if (duong === '/state') return tra(trangThaiCho(toi));

            if (post && duong === '/ngoi') {
                const vi = canNgoi(toi); if (vi) return loi(400, vi);
                let ghe = Number.isInteger(body.ghe) ? body.ghe : phong.ghe.indexOf(null);
                if (ghe < 0 || ghe >= TOI_DA_NGUOI) return loi(400, 'Bàn đủ ' + TOI_DA_NGUOI + ' người rồi');
                if (phong.ghe[ghe] && phong.ghe[ghe] !== toi) return loi(400, 'Ghế này có người rồi');
                if (giaiDangChay()) {
                    // 18/09: VÀO MUỘN, giải chạy chưa quá 1 phút thì vẫn nhận, đánh từ ván kế.
                    // themNguoi tự chặn: quá mốc / đủ 8 / đã trong giải. Ghế mới KHÔNG được đổi ghế cũ.
                    if (gheCua(toi) >= 0) return loi(400, 'Đang trong giải thì không đổi ghế được');
                    phong.giai.themNguoi({ id: toi, ten: tenCua(toi), ghe });
                    phong.ghe[ghe] = toi;
                    return tra(trangThaiCho(toi));
                }
                const cu = gheCua(toi); if (cu >= 0) phong.ghe[cu] = null;
                phong.ghe[ghe] = toi;
                return tra(trangThaiCho(toi));
            }
            if (post && duong === '/roi') {
                if (giaiDangChay()) return loi(400, 'Đang trong giải thì không rời được, rớt mạng thì máy tự bỏ bài giùm');
                const cu = gheCua(toi); if (cu >= 0) phong.ghe[cu] = null;
                phong.sanSang.delete(toi);
                return tra(trangThaiCho(toi));
            }
            // 18/09: ✅ SẴN SÀNG (bấm lại = huỷ). Ai cũng sẵn sàng là nhip() tự mở giải.
            if (post && duong === '/sansang') {
                if (giaiDangChay()) return loi(400, 'Giải đang chạy rồi');
                if (gheCua(toi) < 0) return loi(400, 'Ngồi vào ghế trước đã');
                if (phong.sanSang.has(toi)) phong.sanSang.delete(toi); else phong.sanSang.add(toi);
                tuMoGiai();   // người cuối bấm là mở ngay, khỏi chờ nhịp 1 giây
                return tra(trangThaiCho(toi));
            }

            // ---- admin qua web (dự phòng; đường chính là panel SUPER) ----
            if (post && ['/cauhinh', '/batdau', '/giaitan'].includes(duong)) {
                if (!laAdmin(toi)) return loi(403, 'Chỉ admin mới làm được, vào panel SUPER');
                const r = duong === '/cauhinh' ? quanLy.datChip(body.chipDau)
                        : duong === '/batdau' ? quanLy.batDau() : quanLy.giaiTan();
                if (r.error) return loi(400, r.error);
                return tra(trangThaiCho(toi));
            }

            if (!phong.giai) return loi(400, 'Chưa có giải nào');
            if (post && duong === '/danh') { phong.giai.hanhDong(toi, String(body.kieu || ''), Number(body.tien) || 0); return tra(trangThaiCho(toi)); }
            if (post && duong === '/khoe') { phong.giai.khoeBai(toi, body.la); return tra(trangThaiCho(toi)); }
            if (post && duong === '/xinnghi') { phong.giai.xinNghi(toi); return tra(trangThaiCho(toi)); }
            if (post && duong === '/dongy') { phong.giai.dongYNghi(toi); return tra(trangThaiCho(toi)); }
            if (post && duong === '/tuchoi') { phong.giai.tuChoiNghi(toi); return tra(trangThaiCho(toi)); }
            if (post && duong === '/choitiep') { phong.giai.choiTiep(); return tra(trangThaiCho(toi)); }

            return loi(404, 'Không có đường này');
        } catch (e) {
            // lỗi luật chơi (chưa tới lượt, tố sai...) -> 400 kèm câu tiếng Việt; KHÔNG để lọt ra ngoài
            return loi(400, e.message || 'Lỗi không rõ');
        }
    }

    return { xuLy, nhip, quanLy, canNgoi, phong };
}

module.exports = { taoPoker, TOI_DA_NGUOI, TOI_THIEU_NGUOI, DOGCOIN_VAO_GIAI, CHIP_DAU };
