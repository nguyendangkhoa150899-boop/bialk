// ============================================================================
//  web.js — MÔ-ĐUN TIẾN LÊN GẮN VÀO WEB BOTDOMIN (cùng cổng, cùng phiên đăng nhập)
//
//  Giống hệt cách Poker/web.js gắn vào: webplay.js phục vụ ../TienLen/trang.html tại
//  /tienlen/ và giao mọi /api/tienlen/* cho xuLy() ở đây (SAU cổng liên kết).
//
//  ⚠️ KHÁC POKER Ở CHỖ QUAN TRỌNG NHẤT: bàn này ĂN DOGCOIN THẬT. Mọi phép cộng/trừ ví
//  nằm GỌN trong hàm traTien() ở file này; van.js chỉ tính ra con số, không đụng ví.
//  Bốn chốt an toàn:
//    1. VỐN TỐI THIỂU mới được ngồi, và kiểm LẠI trước mỗi ván. Hệ số theo chế độ (xem
//       VON_HE_SO): truyền thống 30×, đếm lá 120×. Thua nặng nhất một ván vẫn nằm dưới mức
//       đó -> không ai âm ví, và người thắng luôn được trả đủ.
//    2. traTien() chạy ĐÚNG MỘT LẦN cho mỗi ván (khoá bằng daTraVan = số ván).
//    3. Ai tụt dưới vốn tối thiểu thì bị mời khỏi bàn TRƯỚC ván kế, không phải giữa ván.
//    4. MỖI LÚC CHỈ NGỒI MỘT PHÒNG (xem taoSanh) — hai bàn cùng trừ một ví là vỡ.
//  Nuốt mọi lỗi (trả 400) vì chạy chung tiến trình với bot — ném ra là kéo cả bot theo.
// ============================================================================
'use strict';
const V = require('./van.js');

const GIAY_AFK_MAC_DINH = 25;       // không hỏi thăm quá lâu = coi như rớt mạng
// 8 giây, KHÔNG phải 5. Cuối ván có nhiều thứ phải nhìn cùng lúc: bài ngửa của người còn
// cầm (có khi 13 lá), nhãn "THỐI ...", bảng tiền, câu chọc — mà 2,4 giây đầu còn bị chữ
// "VỀ NHẤT" che giữa bàn. 5 giây là chưa kịp đọc đã chia ván mới (chủ server báo 20/09).
const GIAY_XEM_KET_MAC_DINH = 8;
// Vốn tối thiểu = HỆ SỐ × giá 1 cược. Hai chế độ hai hệ số vì thua tối đa một ván khác nhau XA:
//   · 'hang'  thua đậm nhất ≈ 11 cược (bét cóng −2, nhốt 4 đôi thông + tứ quý + heo ×2) -> 30× là thừa sức.
//   · 'anhet' thua đậm nhất ≈ 110 cược (cóng: 13 lá ×2 = 26, nhốt tối đa 42 cược ×2 = 84) -> phải 120×.
// Để chung 30× thì phòng đếm lá có ngày người chơi thua nhiều hơn số tiền họ có, ví bị kẹp
// về 0 và NGƯỜI THẮNG lãnh đủ (không được trả hết). Xem traTien().
const VON_HE_SO = { hang: 30, anhet: 120 };
const MUC_CUOC_MAC_DINH = 1000;

// THANG MỨC CƯỢC chủ server chốt 20/09. Người chơi chỉ được chọn trong thang này (lúc tạo
// phòng và lúc vote đổi cược). Admin ở panel thì vẫn đặt được số bất kỳ.
//   · 'anhet' ĐẾM LÁ      — con số là giá MỖI LÁ (cũng chính là 1 cược).
//   · 'hang'  TRUYỀN THỐNG — con số là GIẢI NHẤT (1 cược). Nhì ăn đúng một nửa.
const MUC_CUOC_CHO_PHEP = {
    anhet: [1000, 2000, 3000, 4000, 5000, 6000],
    hang: [10000, 20000, 40000, 60000, 80000, 100000],
};
const TOI_DA_PHONG = 8;             // trần số phòng cùng lúc, chặn nghịch tạo tràn
const TEN_CHE_DO = { hang: 'Truyền thống 1-2-3-4', anhet: 'Đếm lá' };
const MO_CHE_DO = { hang: '🏅', anhet: '🔢' };

// Hai phòng dựng sẵn cho sảnh khỏi trống, đều ở bậc THẤP NHẤT để ai cũng vào được.
const PHONG_MAC_DINH = [
    { cheDo: 'hang', mucCuoc: 10000 },
    { cheDo: 'anhet', mucCuoc: 1000 },
];

/**
 * deps:
 *   layNguoi(id)            -> { name, points, ingameName } hoặc null
 *   congVi(id, tien, lyDo)  -> cộng (âm = trừ) Dogcoin vào ví người chơi
 *   thuPhe(tien, lyDo)      -> nhà cái thu phế (tuỳ chọn, chỉ để ghi sổ)
 *   laAdmin(id)             -> true nếu được chỉnh cấu hình bàn
 *   tenCua(id), ghiLog(dong), giayAfk, giayXemKet (tuỳ chọn)
 */
function taoTienLen(deps) {
    const layNguoi = deps.layNguoi;
    const congVi = deps.congVi || (() => { });
    const thuPhe = deps.thuPhe || (() => { });
    const laAdmin = deps.laAdmin || (() => false);
    const ghiLog = deps.ghiLog || (() => { });
    const tenCua = deps.tenCua || ((id) => { const u = layNguoi(id); return (u && (u.ingameName || u.name)) || id; });
    // ⚠️ dùng != null chứ KHÔNG dùng || : giayXemKet = 0 (chia ván kế ngay) sẽ bị || nuốt thành mặc định.
    const GIAY_AFK = deps.giayAfk != null ? deps.giayAfk : GIAY_AFK_MAC_DINH;
    const GIAY_XEM_KET = deps.giayXemKet != null ? deps.giayXemKet : GIAY_XEM_KET_MAC_DINH;

    const phong = {
        ghe: Array(V.TOI_DA_NGUOI).fill(null),    // 4 ghế, null = trống
        ban: null,
        sanSang: new Set(),                        // ai đã bấm ✅ Sẵn sàng ở phòng chờ
        // 🗳️ VOTE ĐỔI MỨC CƯỢC — { mucCuoc, boi, dong:Set<id> }. Quá nửa số người ngồi đồng ý
        // thì ván SAU áp dụng (đang giữa ván thì chờ, xem vanKe). Ai rời bàn thì bỏ phiếu theo.
        vote: null,
        // 🚪 XIN RỜI SAU VÁN NÀY. Đang cầm bài thì không rời giữa chừng được (bỏ bàn giữa ván
        // là quỵt tiền người khác), nhưng bắt ngồi đực chờ hết ván rồi mới bấm được thì người
        // ta đóng tab luôn — và đóng tab là thành "mất kết nối", máy đánh giùm, thua oan.
        // Bấm nút này là ghi tên vào sổ, hết ván tự cho ra (xem vanKe).
        xinRoi: new Set(),
        cauHinh: {
            mucCuoc: MUC_CUOC_MAC_DINH, cheDo: 'hang',   // KHÔNG còn giaLa: mỗi lá = đúng 1 cược
            toiTrangOn: true, chatHeoOn: true, thoiHeoOn: true, baBichOn: true,
        },
    };
    const chamCuoi = new Map();     // id -> lần hỏi thăm gần nhất (dò AFK)
    let vanXongLuc = 0;             // mốc ván vừa chốt, để đếm ngược chia ván mới
    let daTraVan = 0;               // số ván đã TRẢ TIỀN xong (khoá chống trả 2 lần)
    // 💥 CHẶT TRẢ NGAY GIỮA VÁN (chủ server chốt 20/09: "bị chặt hay bị gì trừ dogcoin tại chỗ").
    // traChatNgay() cộng/trừ ví liền, ghi lại đã trả cho ai bao nhiêu; chotVan vẫn tính chặt vào
    // ketQua.tien như thường, nên traTien() phải TRỪ ĐI phần đã trả trước, không thì trả hai lần.
    let daTraChat = {};             // id -> đã cộng/trừ trước bao nhiêu trong ván này
    let vanChat = 0;                // bảng trên thuộc ván số mấy

    const dangNgoi = () => phong.ghe.map((id, ghe) => id ? { id, ghe } : null).filter(Boolean);
    const gheCua = (id) => phong.ghe.indexOf(id);
    const vonToiThieu = () => phong.cauHinh.mucCuoc * (VON_HE_SO[phong.cauHinh.cheDo] || 30);
    const banDangDanh = () => !!(phong.ban && phong.ban.xemChung().trangThai === 'DANG_CHAY');

    /** Đủ điều kiện ngồi chưa? null = được, chuỗi = lý do không. */
    function canNgoi(id) {
        const u = layNguoi(id);
        if (!u) return 'Chưa có tài khoản trong bot';
        if (!u.ingameName) return 'Chưa liên kết tên nhân vật — nhờ admin liên kết trước đã';
        const von = vonToiThieu();
        if ((u.points || 0) < von)
            return 'Cần ít nhất ' + von.toLocaleString('vi-VN') + ' Dogcoin mới vào bàn cược ' +
                phong.cauHinh.mucCuoc.toLocaleString('vi-VN') + ' (đang có ' + (u.points || 0).toLocaleString('vi-VN') + ')';
        return null;
    }

    // ------------------------------------------------------------ TIỀN (chỗ duy nhất đụng ví)
    /**
     * Trả tiền một ván ĐÚNG MỘT LẦN. van.js đã tính sẵn ketQua.tien (đã trừ phế) và ketQua.phe.
     * Có lưới an toàn: nếu ví ai đó không đủ trả (đáng lẽ không xảy ra vì có vốn tối thiểu) thì
     * kẹp lại đúng số họ có, ghi log để chủ server biết, và cắt bớt phần ăn của người thắng cho khớp.
     */
    /**
     * 💥 Trả tiền CHẶT ngay lúc nó xảy ra. Gọi sau mỗi nước đánh (và trong nhịp, vì máy có thể
     * đánh giùm). Mỗi cú chặt chỉ trả MỘT LẦN — khoá bằng cờ daTra ghi thẳng vào máy ván.
     * Có kẹp ví y như traTien: người bị chặt không đủ tiền thì lấy đúng số họ có.
     */
    function traChatNgay() {
        const b = phong.ban; if (!b) return;
        const v = b._trong.van; if (!v || !v.chatHeo || !v.chatHeo.length) return;
        if (vanChat !== v.so) { daTraChat = {}; vanChat = v.so; }
        for (const c of v.chatHeo) {
            if (c.daTra) continue;
            c.daTra = true;
            const co = (layNguoi(c.bi) || {}).points || 0;
            const tien = Math.min(c.tien, co);       // kẹp: không để ai âm ví giữa ván
            if (tien < c.tien)
                ghiLog('[TIẾN LÊN] ⚠️ ' + tenCua(c.bi) + ' bị chặt ' + c.tien.toLocaleString('vi-VN') +
                    ' nhưng ví chỉ có ' + co.toLocaleString('vi-VN') + ' — trả tại chỗ ' + tien.toLocaleString('vi-VN'));
            if (!tien) continue;
            congVi(c.bi, -tien, 'Tiến Lên ván #' + v.so + ' (bị chặt)');
            congVi(c.chatBoi, tien, 'Tiến Lên ván #' + v.so + ' (chặt được)');
            daTraChat[c.bi] = (daTraChat[c.bi] || 0) - tien;
            daTraChat[c.chatBoi] = (daTraChat[c.chatBoi] || 0) + tien;
            ghiLog('[TIẾN LÊN] 💥 ' + tenCua(c.chatBoi) + ' chặt ' + tenCua(c.bi) + ' — trả ngay ' +
                tien.toLocaleString('vi-VN'));
        }
    }

    function traTien(kq, soVan) {
        if (!kq || daTraVan >= soVan) return;
        daTraVan = soVan;
        const tien = { ...kq.tien };
        // Trừ đi phần CHẶT đã trả tại chỗ. chotVan vẫn cộng chặt vào ketQua.tien (phế tính trên
        // tổng ăn ròng, kể cả tiền chặt), ở đây chỉ trả nốt phần CÒN LẠI.
        if (vanChat === soVan) for (const id of Object.keys(daTraChat)) {
            if (tien[id] !== undefined) tien[id] -= daTraChat[id];
        }

        // lưới an toàn: không để ai âm ví
        let hut = 0;
        for (const id of Object.keys(tien)) {
            if (tien[id] >= 0) continue;
            const co = (layNguoi(id) || {}).points || 0;
            if (co < -tien[id]) {
                hut += (-tien[id]) - co;
                ghiLog('[TIẾN LÊN] ⚠️ ' + tenCua(id) + ' thua ' + (-tien[id]).toLocaleString('vi-VN') +
                    ' nhưng ví chỉ có ' + co.toLocaleString('vi-VN') + ' — kẹp lại, xem lại vốn tối thiểu');
                tien[id] = -co;
            }
        }
        if (hut > 0) {
            // cắt bớt phần ăn của người thắng theo tỉ lệ cho khớp số tiền thật sự thu được
            const an = Object.keys(tien).filter(id => tien[id] > 0);
            const tongAn = an.reduce((s, id) => s + tien[id], 0);
            for (const id of an) tien[id] = Math.max(0, tien[id] - Math.round(hut * tien[id] / tongAn));
        }

        for (const id of Object.keys(tien)) {
            if (!tien[id]) continue;
            congVi(id, tien[id], 'Tiến Lên ván #' + soVan + (tien[id] > 0 ? ' (thắng)' : ' (thua)'));
        }
        if (kq.pheTong > 0) thuPhe(kq.pheTong, 'phế 10% Tiến Lên ván #' + soVan);
        const bang = Object.keys(tien).map(id => tenCua(id) + ' ' + (tien[id] >= 0 ? '+' : '') + tien[id].toLocaleString('vi-VN')).join(' · ');
        ghiLog('[TIẾN LÊN] Ván #' + soVan + ' (' + (kq.toiTrang ? 'tới trắng ' + tenCua(kq.toiTrang.id) : 'nhất ' + tenCua(kq.hang[0])) +
            '): ' + bang + ' · phế ' + (kq.pheTong || 0).toLocaleString('vi-VN'));
    }

    // ------------------------------------------------------------ mở bàn / ván
    function moBan() {
        if (banDangDanh()) return { error: 'Bàn đang đánh rồi' };
        const ds = dangNgoi();
        if (ds.length < V.TOI_THIEU_NGUOI) return { error: 'Cần ít nhất ' + V.TOI_THIEU_NGUOI + ' người đang ngồi' };
        const rot = ds.filter(x => canNgoi(x.id) !== null);
        if (rot.length) return { error: tenCua(rot[0].id) + ': ' + canNgoi(rot[0].id), rot: rot.map(x => x.id) };
        phong.ban = V.taoBan({ ...phong.cauHinh });
        for (const x of ds) phong.ban.themNguoi({ id: x.id, ten: tenCua(x.id), ghe: x.ghe });
        phong.sanSang.clear();
        vanXongLuc = 0; daTraVan = 0;
        phong.ban.vanMoi();
        thanhToanNeuXong();   // tới trắng: ván chốt ngay trong vanMoi
        return { ok: true, soNguoi: ds.length };
    }
    /**
     * Ván vừa chốt thì TRẢ TIỀN NGAY, không đợi nhịp kế. Phải gọi sau MỌI nước có thể kết thúc ván:
     * đánh bài, bỏ lượt, và cả lúc chia bài (tới trắng chốt ván ngay trong vanMoi). traTien tự khoá
     * theo số ván nên gọi thừa bao nhiêu lần cũng vô hại.
     */
    function thanhToanNeuXong() {
        const s = phong.ban && phong.ban.xemChung();
        if (!s || !s.van || !s.van.ketQua) return;
        traTien(s.van.ketQua, s.van.so);
        if (!vanXongLuc) vanXongLuc = Date.now();
    }
    /** ≥2 người ngồi và AI CŨNG sẵn sàng -> mở bàn, không cần admin (giống Poker). */
    function tuMoBan() {
        const ds = dangNgoi();
        if (ds.length < V.TOI_THIEU_NGUOI || !ds.every(x => phong.sanSang.has(x.id))) return;
        const r = moBan();
        if (r.error && r.rot) for (const id of r.rot) phong.sanSang.delete(id);
    }

    /** Số phiếu cần để vote đổi cược thắng: QUÁ NỬA số người đang ngồi. */
    function canPhieu() { return Math.floor(dangNgoi().length / 2) + 1; }
    function voteXong() { return !!(phong.vote && phong.vote.dong.size >= canPhieu()); }
    /** Áp mức cược đã vote. Gọi lúc GIỮA HAI VÁN thôi — datCauHinh chặn khi đang đánh. */
    function apVote() {
        if (!voteXong()) return false;
        const m = phong.vote.mucCuoc;
        const r = quanLy.datCauHinh({ mucCuoc: m });
        phong.vote = null;
        if (r.error) { ghiLog('[TIẾN LÊN] Vote đổi cược hỏng: ' + r.error); return false; }
        ghiLog('[TIẾN LÊN] Cả bàn đồng ý đổi mức cược thành ' + m.toLocaleString('vi-VN'));
        return true;
    }

    /** Cho ra những ai đã bấm "rời sau ván này". Gọi lúc GIỮA HAI VÁN. */
    function choRaNhungAiXin() {
        if (!phong.xinRoi.size) return;
        for (const id of [...phong.xinRoi]) {
            phong.xinRoi.delete(id);
            const ghe = gheCua(id);
            if (ghe >= 0) phong.ghe[ghe] = null;
            phong.sanSang.delete(id);
            if (phong.vote) { phong.vote.dong.delete(id); if (!phong.vote.dong.size) phong.vote = null; }
            if (phong.ban) { try { phong.ban.roiBan(id); } catch (e) { } }
            ghiLog('[TIẾN LÊN] ' + tenCua(id) + ' rời bàn (đã xin rời sau ván)');
        }
        if (phong.ban && phong.ban.xemChung().nguoi.length < V.TOI_THIEU_NGUOI) phong.ban = null;
    }

    /** Chia ván kế: cho ra ai xin rời, áp vote đổi cược, mời ra ai hết vốn, còn đủ 2 người thì chia tiếp. */
    function vanKe() {
        choRaNhungAiXin();
        const b = phong.ban;
        if (!b) return;
        // Áp vote TRƯỚC khi mời người ra: đổi cược là đổi luôn vốn tối thiểu, ai không đủ
        // theo mức MỚI thì phải bị mời ra ngay ván này, không để nợ sang ván sau.
        apVote();
        for (const p of b.xemChung().nguoi.slice()) {
            const vi = canNgoi(p.id);
            if (!vi) continue;
            b.roiBan(p.id);
            phong.ghe[gheCua(p.id)] = null;
            phong.sanSang.delete(p.id);
            ghiLog('[TIẾN LÊN] Mời ' + tenCua(p.id) + ' rời bàn: ' + vi);
        }
        if (b.xemChung().nguoi.length < V.TOI_THIEU_NGUOI) { phong.ban = null; return; }
        vanXongLuc = 0;
        b.vanKe();
        thanhToanNeuXong();   // ván kế có thể tới trắng -> chốt ngay
    }

    // ------------------------------------------------------------ nhịp
    function ratSoatAfk() {
        if (!phong.ban) return;
        const bayGio = Date.now();
        for (const p of phong.ban._trong.nguoi) {
            const mat = bayGio - (chamCuoi.get(p.id) || 0) > GIAY_AFK * 1000;
            if (mat && !p.afk) phong.ban.roiMang(p.id);
            if (!mat && p.afk) phong.ban.noiLai(p.id);
        }
    }
    /** Gọi mỗi giây từ ngoài. Nuốt lỗi để không kéo bot theo. */
    function nhip() {
        try {
            if (!phong.ban) { tuMoBan(); return; }
            ratSoatAfk();
            phong.ban.nhip();
            traChatNgay();          // máy đánh giùm cũng có thể chặt -> trả ngay như người thật
            const s = phong.ban.xemChung();
            if (s.van && s.van.ketQua) {
                const cu = vanXongLuc;
                thanhToanNeuXong();                      // tự khoá, gọi bao nhiêu lần cũng chỉ trả 1 lần
                if (cu && Date.now() - cu >= GIAY_XEM_KET * 1000) vanKe();
            }
        } catch (e) { console.error('[tienlen] nhịp lỗi:', e.message); }
    }

    // ------------------------------------------------------------ trạng thái gửi cho web
    function trangThai(id) {
        const u = layNguoi(id);
        const nen = {
            ok: true,
            toi: {
                id, ten: tenCua(id), dogcoin: (u && u.points) || 0,
                admin: laAdmin(id), duocNgoi: canNgoi(id) === null, viSaoKhong: canNgoi(id),
            },
            ghe: phong.ghe.map(x => x ? { id: x, ten: tenCua(x), dogcoin: (layNguoi(x) || {}).points || 0 } : null),
            gheCuaToi: gheCua(id),
            sanSang: [...phong.sanSang], toiSanSang: phong.sanSang.has(id),
            xinRoi: phong.xinRoi.has(id),          // 🚪 đã bấm "rời sau ván này" chưa
            toiDa: V.TOI_DA_NGUOI, toiThieu: V.TOI_THIEU_NGUOI,
            cauHinh: { ...phong.cauHinh }, cheDoTen: V.CHE_DO[phong.cauHinh.cheDo],
            vonToiThieu: vonToiThieu(), pheTram: V.PHE_TRAM,
            mucChoPhep: (MUC_CUOC_CHO_PHEP[phong.cauHinh.cheDo] || []).slice(),
            vote: phong.vote ? {
                mucCuoc: phong.vote.mucCuoc, boi: tenCua(phong.vote.boi),
                dong: [...phong.vote.dong], soDong: phong.vote.dong.size,
                can: canPhieu(), toiDaDong: phong.vote.dong.has(id),
                vonMoi: phong.vote.mucCuoc * (VON_HE_SO[phong.cauHinh.cheDo] || 30),
            } : null,
        };
        if (!phong.ban) return { ...nen, ban: null };
        const trongBan = phong.ban._trong.nguoi.some(p => p.id === id);
        nen.demVanKe = vanXongLuc
            ? Math.max(0, Math.ceil((vanXongLuc + GIAY_XEM_KET * 1000 - Date.now()) / 1000)) : null;
        // khán giả chỉ nhận bản CHUNG — không có bài riêng của ai
        return { ...nen, ban: trongBan ? phong.ban.xem(id) : phong.ban.xemChung() };
    }

    // ------------------------------------------------------------ panel SUPER
    const quanLy = {
        tomTat() {
            const s = phong.ban ? phong.ban.xemChung() : null;
            return {
                ghe: phong.ghe.map(x => x ? { id: x, ten: tenCua(x) } : null),
                soNgoi: dangNgoi().length, toiDa: V.TOI_DA_NGUOI, toiThieu: V.TOI_THIEU_NGUOI,
                cauHinh: { ...phong.cauHinh }, cheDoTen: V.CHE_DO[phong.cauHinh.cheDo],
                vonToiThieu: vonToiThieu(), pheTram: V.PHE_TRAM,
                ban: s ? {
                    trangThai: s.trangThai, soVan: s.soVan,
                    // panel là của ADMIN nên vẫn cho thấy số lá (người chơi thì không) — đọc thẳng máy ván
                    nguoi: s.nguoi.map(p => ({
                        id: p.id, ten: p.ten, tong: p.tong, afk: p.afk,
                        soLa: (phong.ban._trong.van && (phong.ban._trong.van.tay[p.id] || []).length) || 0,
                    })),
                    nhatKy: s.nhatKy,
                } : null,
            };
        },
        datCauHinh(o) {
            if (banDangDanh()) return { error: 'Bàn đang đánh, chỉnh sau' };
            const c = phong.cauHinh;
            if (o.mucCuoc != null) {
                const m = Math.floor(Number(o.mucCuoc));
                if (!(m >= 100 && m <= 1000000)) return { error: 'Mức cược từ 100 đến 1.000.000' };
                c.mucCuoc = m;
            }
            // ⚠️ Bỏ hẳn ô 'giaLa'. Luật gốc Ba Bích: ở chế độ đếm lá, mỗi lá còn trên tay =
            // ĐÚNG 1 cược. Để hai con số rời nhau thì có ngày chỉnh lệch rồi tính sai tiền cả bàn.
            if (o.giaLa != null) return { error: 'Không còn ô đơn giá lá — mỗi lá tính đúng 1 cược' };
            if (o.cheDo != null) {
                if (!V.CHE_DO[o.cheDo]) return { error: 'Chế độ lạ' };
                c.cheDo = o.cheDo;
            }
            for (const k of ['toiTrangOn', 'chatHeoOn', 'thoiHeoOn', 'baBichOn'])
                if (o[k] != null) c[k] = !!o[k];
            return { ok: true, cauHinh: { ...c } };
        },
        batDau() { return moBan(); },
        giaiTan() {
            phong.ban = null; phong.ghe = Array(V.TOI_DA_NGUOI).fill(null);
            phong.sanSang.clear(); vanXongLuc = 0; daTraVan = 0;
            return { ok: true };
        },
    };

    // ------------------------------------------------------------ API người chơi
    function xuLy(req, res, sendJSON) {
        const { path: duong, body, userId: toi } = req;
        const post = req.method === 'POST';
        chamCuoi.set(toi, Date.now());
        const tra = () => sendJSON(res, 200, trangThai(toi));
        const loi = (ma, msg) => sendJSON(res, ma, { ok: false, error: msg });
        try {
            if (duong === '/state') return tra();

            if (post && duong === '/ngoi') {
                if (banDangDanh()) return loi(400, 'Bàn đang đánh — chờ hết ván rồi vào');
                const vi = canNgoi(toi); if (vi) return loi(400, vi);
                let ghe = Number.isInteger(body.ghe) ? body.ghe : phong.ghe.indexOf(null);
                if (ghe < 0 || ghe >= V.TOI_DA_NGUOI) return loi(400, 'Bàn đủ ' + V.TOI_DA_NGUOI + ' người rồi');
                if (phong.ghe[ghe] && phong.ghe[ghe] !== toi) return loi(400, 'Ghế này có người rồi');
                const cu = gheCua(toi); if (cu >= 0) phong.ghe[cu] = null;
                phong.ghe[ghe] = toi;
                // bàn đang nghỉ giữa 2 ván -> vào luôn cho ván kế
                if (phong.ban) { try { phong.ban.themNguoi({ id: toi, ten: tenCua(toi), ghe }); } catch (e) { } }
                return tra();
            }
            if (post && duong === '/roi') {
                if (banDangDanh() && phong.ban._trong.van && (phong.ban._trong.van.tay[toi] || []).length > 0)
                    return loi(400, 'Đang giữa ván — đánh hết bài rồi mới rời được (rớt mạng thì máy đánh giùm)');
                const cu = gheCua(toi); if (cu >= 0) phong.ghe[cu] = null;
                phong.sanSang.delete(toi);
                phong.xinRoi.delete(toi);
                if (phong.vote) { phong.vote.dong.delete(toi); if (!phong.vote.dong.size) phong.vote = null; }
                // Bớt một người ngồi là NGƯỠNG QUÁ NỬA tụt theo -> vote đang treo có thể vừa đủ
                // phiếu ngay lúc này. Không chốt lại ở đây thì nó nằm im tới tận ván sau.
                if (!banDangDanh()) apVote();
                if (phong.ban) { try { phong.ban.roiBan(toi); } catch (e) { } }
                if (phong.ban && phong.ban.xemChung().nguoi.length < V.TOI_THIEU_NGUOI) phong.ban = null;
                return tra();
            }
            // 🗳️ Vote đổi mức cược. Ai đang ngồi cũng mở hoặc theo được.
            if (post && duong === '/vote') {
                if (gheCua(toi) < 0) return loi(400, 'Phải đang ngồi trong phòng mới vote được');
                const m = Math.floor(Number(body.mucCuoc));
                const thang = MUC_CUOC_CHO_PHEP[phong.cauHinh.cheDo] || [];
                if (!thang.includes(m)) return loi(400, 'Mức cược phải nằm trong: ' + thang.map(x => x.toLocaleString('vi-VN')).join(' · '));
                if (m === phong.cauHinh.mucCuoc) return loi(400, 'Bàn đang chơi đúng mức đó rồi');
                // vote mức KHÁC với vote đang mở -> mở lại từ đầu, người đổi ý tính là phiếu đầu
                if (!phong.vote || phong.vote.mucCuoc !== m) phong.vote = { mucCuoc: m, boi: toi, dong: new Set() };
                phong.vote.dong.add(toi);
                // giữa hai ván mà đủ phiếu thì áp luôn, khỏi bắt chờ thêm một ván
                if (!banDangDanh()) apVote();
                return tra();
            }
            // 🚪 Xin rời sau ván này. Không đang đánh thì cho ra LUÔN, khỏi bắt chờ.
            if (post && duong === '/roisau') {
                if (gheCua(toi) < 0) return loi(400, 'Bạn không ngồi trong phòng này');
                if (!banDangDanh()) return xuLy({ ...req, path: '/roi' }, res, sendJSON);
                if (phong.xinRoi.has(toi)) phong.xinRoi.delete(toi); else phong.xinRoi.add(toi);
                return tra();
            }
            if (post && duong === '/huyvote') {
                if (!phong.vote) return tra();
                phong.vote.dong.delete(toi);
                if (!phong.vote.dong.size) phong.vote = null;
                return tra();
            }
            if (post && duong === '/sansang') {
                if (banDangDanh()) return loi(400, 'Bàn đang đánh rồi');
                if (gheCua(toi) < 0) return loi(400, 'Ngồi vào ghế trước đã');
                if (phong.sanSang.has(toi)) phong.sanSang.delete(toi); else phong.sanSang.add(toi);
                tuMoBan();
                return tra();
            }

            // ⚠️ Khối admin phải đứng TRƯỚC chốt "chưa có bàn" — không thì đổi cấu hình lúc bàn
            // chưa mở lại báo "chưa có bàn nào đang chạy", mà đó chính là lúc cần đổi nhất.
            if (post && ['/cauhinh', '/batdau', '/giaitan'].includes(duong)) {
                if (!laAdmin(toi)) return loi(403, 'Chỉ admin mới làm được — vào panel SUPER');
                const r = duong === '/cauhinh' ? quanLy.datCauHinh(body || {})
                    : duong === '/batdau' ? quanLy.batDau() : quanLy.giaiTan();
                if (r.error) return loi(400, r.error);
                return tra();
            }

            if (!phong.ban) return loi(400, 'Chưa có bàn nào đang chạy');
            if (post && duong === '/danh') { phong.ban.danh(toi, Array.isArray(body.la) ? body.la : []); traChatNgay(); thanhToanNeuXong(); return tra(); }
            if (post && duong === '/boluot') { phong.ban.boLuot(toi); thanhToanNeuXong(); return tra(); }

            return loi(404, 'Đường lạ: ' + duong);
        } catch (e) {
            return loi(400, e.message || 'Lỗi lạ');
        }
    }

    return { xuLy, nhip, quanLy, phong, trangThai };
}

// ============================================================================
//  NHIỀU PHÒNG — mỗi phòng là MỘT taoTienLen() độc lập, ghế riêng, ván riêng, cấu hình
//  riêng. Lớp này chỉ làm hai việc: lái đường dẫn về đúng phòng, và không cho một người
//  ngồi hai phòng cùng lúc.
//
//  Đường API:  /api/tienlen/ds              -> danh sách phòng (màn chọn phòng)
//              /api/tienlen/<ma>/state      -> trạng thái phòng đó
//              /api/tienlen/<ma>/ngoi|roi|sansang|danh|boluot|cauhinh|batdau|giaitan
// ============================================================================
function taoSanh(deps, ds) {
    const dsPhong = [];
    let dem = 0;

    /** Dựng một phòng mới. Trả phòng, hoặc { error }. */
    function taoPhong(cheDo, mucCuoc, boiAi) {
        if (!TEN_CHE_DO[cheDo]) return { error: 'Chế độ lạ' };
        const thang = MUC_CUOC_CHO_PHEP[cheDo];
        const m = Math.floor(Number(mucCuoc));
        if (!thang.includes(m)) return { error: 'Mức cược phải chọn trong: ' + thang.map(x => x.toLocaleString('vi-VN')).join(' · ') };
        if (dsPhong.length >= TOI_DA_PHONG) return { error: 'Đang có đủ ' + TOI_DA_PHONG + ' phòng rồi — vào phòng sẵn có hoặc chờ phòng trống tan' };
        // Không cho tạo phòng mình không đủ tiền vào. Thiếu chốt này thì người ta bấm tạo xong
        // bị đá ra ngay, phòng rỗng nằm chình ình giữa sảnh tới lúc bị dọn.
        if (boiAi) {
            const von = m * (VON_HE_SO[cheDo] || 30);
            const u = deps.layNguoi(boiAi);
            if (!u || (u.points || 0) < von)
                return {
                    error: 'Phòng cược ' + m.toLocaleString('vi-VN') + ' cần ít nhất ' +
                        von.toLocaleString('vi-VN') + ' Dogcoin mới vào được (bạn đang có ' +
                        (((u && u.points) || 0)).toLocaleString('vi-VN') + ')',
                };
        }
        const may = taoTienLen(deps);
        const r = may.quanLy.datCauHinh({ cheDo, mucCuoc: m });
        if (r.error) return r;
        const p = { ma: 'p' + (++dem), cheDo, boi: boiAi || null, luc: Date.now(), may };
        dsPhong.push(p);
        return p;
    }

    const tim = (ma) => dsPhong.find(p => p.ma === ma);
    const dangNgoiO = (id) => dsPhong.find(p => p.may.phong.ghe.indexOf(id) >= 0);
    const tenPhong = (p) => MO_CHE_DO[p.cheDo] + ' ' + TEN_CHE_DO[p.cheDo] + ' · ' +
        p.may.phong.cauHinh.mucCuoc.toLocaleString('vi-VN');

    /**
     * Dọn phòng TRỐNG. Giữ lại mấy phòng dựng sẵn (boi === null) để sảnh không bao giờ trắng,
     * còn phòng người chơi tự tạo mà hết người thì xoá, khỏi đọng rác đầy sảnh.
     */
    function donPhongTrong() {
        for (let k = dsPhong.length - 1; k >= 0; k--) {
            const p = dsPhong[k];
            if (!p.boi) continue;                                   // phòng dựng sẵn: giữ
            if (p.may.phong.ghe.some(Boolean)) continue;            // còn người ngồi: giữ
            if (Date.now() - p.luc < 30000) continue;               // mới tạo 30 giây: chờ người tạo vào
            dsPhong.splice(k, 1);
        }
    }

    /** Màn SẢNH: mỗi phòng một dòng, đủ thứ để quyết định vào đâu. */
    function danhSach(id) {
        const u = deps.layNguoi(id);
        const dangO = dangNgoiO(id);
        return {
            ok: true,
            toi: { id, ten: deps.tenCua(id), dogcoin: (u && u.points) || 0, admin: deps.laAdmin(id) },
            dangO: dangO ? dangO.ma : null,
            toiDaPhong: TOI_DA_PHONG,
            mucChoPhep: { hang: MUC_CUOC_CHO_PHEP.hang.slice(), anhet: MUC_CUOC_CHO_PHEP.anhet.slice() },
            heSoVon: { hang: VON_HE_SO.hang, anhet: VON_HE_SO.anhet },
            tenCheDo: { ...TEN_CHE_DO }, moCheDo: { ...MO_CHE_DO },
            phong: dsPhong.map(p => {
                const t = p.may.trangThai(id);
                return {
                    ma: p.ma, ten: tenPhong(p), mo: MO_CHE_DO[p.cheDo],
                    cheDo: p.cheDo, cheDoTen: t.cheDoTen, mucCuoc: t.cauHinh.mucCuoc,
                    vonToiThieu: t.vonToiThieu, pheTram: t.pheTram,
                    boi: p.boi ? deps.tenCua(p.boi) : null,
                    soNgoi: t.ghe.filter(Boolean).length, toiDa: t.toiDa, toiThieu: t.toiThieu,
                    nguoi: t.ghe.filter(Boolean).map(g => g.ten),
                    dangDanh: !!(t.ban && t.ban.trangThai === 'DANG_CHAY'),
                    soVan: t.ban ? t.ban.soVan : 0,
                    duocNgoi: t.toi.duocNgoi, viSaoKhong: t.toi.viSaoKhong,
                };
            }),
        };
    }

    function xuLy(req, res, sendJSON) {
        const duong = req.path || '/';
        const post = req.method === 'POST';
        const loi = (ma, msg) => sendJSON(res, ma, { ok: false, error: msg });
        if (duong === '/' || duong === '/ds') { donPhongTrong(); return sendJSON(res, 200, danhSach(req.userId)); }
        if (post && duong === '/tao') {
            donPhongTrong();
            const b = req.body || {};
            const p = taoPhong(b.cheDo, b.mucCuoc, req.userId);
            if (p.error) return loi(400, p.error);
            // tạo xong CHO NGỒI LUÔN — không thì người tạo phải bấm thêm một nhát, mà phòng
            // trống vừa tạo lại dễ bị dọn mất ngay.
            p.may.xuLy({ ...req, path: '/ngoi', method: 'POST', body: { ghe: 0 } }, res, () => { });
            return sendJSON(res, 200, { ...danhSach(req.userId), vaoPhong: p.ma });
        }
        const m = duong.match(/^\/([A-Za-z0-9_-]+)(\/.*)?$/);
        const p = m && tim(m[1]);
        if (!p) return loi(404, 'Phòng "' + (m ? m[1] : duong) + '" không còn nữa — quay ra sảnh chọn phòng khác');
        const con = m[2] || '/state';
        // Một người CHỈ ngồi được MỘT phòng. Ngồi phòng mới thì tự đứng dậy khỏi phòng cũ —
        // không thì vốn tối thiểu tính hai nơi mà ví chỉ có một, hai bàn cùng trừ là vỡ ví.
        if (post && con === '/ngoi') {
            const cu = dangNgoiO(req.userId);
            if (cu && cu.ma !== p.ma) {
                // ⚠️ PHẢI XEM PHÒNG CŨ CÓ THẢ RA THẬT KHÔNG. Bản đầu bỏ qua kết quả:
                // đang giữa ván thì /roi trả 400, người đó VẪN ngồi phòng cũ, mà vẫn được
                // ngồi tiếp phòng mới -> một ví hai bàn cùng trừ, đúng cái vỡ ví mà luật
                // "mỗi lúc một phòng" sinh ra để chặn.
                cu.may.xuLy({ ...req, path: '/roi' }, res, () => { });
                if (cu.may.phong.ghe.indexOf(req.userId) >= 0)
                    return loi(400, 'Bạn đang giữa ván ở phòng khác — đánh hết bài rồi mới đổi phòng được');
            }
        }
        return p.may.xuLy({ ...req, path: con }, res, sendJSON);
    }

    function nhip() { for (const p of dsPhong) p.may.nhip(); donPhongTrong(); }

    const quanLy = {
        tomTat: () => dsPhong.map(p => ({ ma: p.ma, ten: tenPhong(p), cheDo: p.cheDo, ...p.may.quanLy.tomTat() })),
        cua: (ma) => { const p = tim(ma); return p ? p.may.quanLy : null; },
        taoPhong, donPhongTrong,
        /** Dẹp sạch mọi phòng — dùng khi admin tắt trò chơi. */
        dongHet() { for (const p of dsPhong) { try { p.may.quanLy.giaiTan(); } catch (e) { } } dsPhong.length = 0; },
    };

    for (const p of (ds && ds.length ? ds : PHONG_MAC_DINH)) taoPhong(p.cheDo, p.mucCuoc, null);
    return { xuLy, nhip, quanLy, danhSach, phong: dsPhong, cua: tim };
}

module.exports = {
    taoTienLen, taoSanh, VON_HE_SO, PHONG_MAC_DINH, MUC_CUOC_CHO_PHEP,
    TOI_DA_PHONG, TEN_CHE_DO, MO_CHE_DO, GIAY_XEM_KET_MAC_DINH,
};
