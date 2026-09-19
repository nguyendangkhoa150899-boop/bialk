// ============================================================================
//  van.js — MÁY BÀN + MÁY VÁN TIẾN LÊN MIỀN NAM (thuần logic, KHÔNG đụng ví)
//  File này chỉ TÍNH ra ai ăn ai thua bao nhiêu; việc cộng/trừ Dogcoin là của
//  web.js. Nhờ vậy bộ kiểm chạy được toàn bộ luật tiền mà không cần database.
//  Chạy kiểm: node TienLen/kiemtra/van-test.js
//
//  LUẬT CHỦ SERVER CHỐT 19/09 (đừng tự đổi, hỏi trước):
//   1. Bàn 2–4 người, mỗi người 13 lá, bàn CHẠY LIÊN TỤC (xong ván chia tiếp).
//   2. Ván ĐẦU của bàn: ai cầm 3♠ đi trước và BẮT BUỘC đánh bộ có 3♠.
//      Ván sau: người về nhất ván trước đi đầu, đánh gì cũng được.
//   3. Hai chế độ tính tiền:
//      - 'hang'  Nhất nhì ba tư: nhất ăn của tư, nhì ăn của ba (4 người).
//                3 người: nhất ăn của ba, nhì hoà. 2 người: nhất ăn của nhì.
//      - 'anhet' Nhất ăn hết + đếm lá: nhất ăn cược của tất cả, CỘNG mỗi lá còn
//                trên tay người thua × đơn giá lá.
//   4. Chặt heo có thưởng: chặt trúng heo thì người bị chặt trả NGAY cho người
//      chặt — heo đen 1 phần cược, heo đỏ 2 phần.
//   5. Thối 2: hết ván còn heo trên tay thì phạt đúng mức trên, trả cho người nhất.
//   6. Tới trắng: chia bài xong có bài đẹp là thắng ngay, mỗi người thua trả
//      số phần cược ghi ở bai.js (TOI_TRANG).
//   7. PHẾ 10%: ai ăn ròng dương thì nhà cái cắt 10% phần ăn đó. Đây là chỗ DUY
//      NHẤT bàn này không phải tổng bằng 0 — cũng là chỗ duy nhất nhà cái có thu.
// ============================================================================
'use strict';
const B = require('./bai.js');

const TOI_DA_NGUOI = 4;
const TOI_THIEU_NGUOI = 2;
const SO_LA_CHIA = 13;
const GIAY_MOI_LUOT = 25;        // hết giờ: đang mở lượt -> đánh lá nhỏ nhất; đang theo -> bỏ lượt
const PHE_TRAM = 0.10;           // nhà cái cắt 10% TIỀN ĂN RÒNG của người thắng
const CHE_DO = { hang: 'Nhất nhì ba tư', anhet: 'Nhất ăn hết + đếm lá' };
// phạt heo tính theo PHẦN CƯỢC: heo đen 1 phần, heo đỏ 2 phần (dùng cho cả chặt heo lẫn thối 2)
const PHAT_HEO_DEN = 1, PHAT_HEO_DO = 2;

/** Tiền phạt heo của một mớ lá (đơn vị: phần cược). */
function phanHeo(la) {
    const h = B.demHeo(la);
    return h.den * PHAT_HEO_DEN + h.do * PHAT_HEO_DO;
}

function taoBan(tuyChon = {}) {
    const C = {
        mucCuoc: Math.max(1, Math.floor(tuyChon.mucCuoc || 1000)),
        cheDo: CHE_DO[tuyChon.cheDo] ? tuyChon.cheDo : 'hang',
        // đơn giá mỗi lá còn lại ở chế độ 'anhet'. Mặc định = 1 phần cược / lá.
        giaLa: tuyChon.giaLa != null ? Math.max(0, Math.floor(tuyChon.giaLa)) : Math.max(1, Math.floor(tuyChon.mucCuoc || 1000)),
        giayMoiLuot: tuyChon.giayMoiLuot || GIAY_MOI_LUOT,
        pheTram: tuyChon.pheTram != null ? tuyChon.pheTram : PHE_TRAM,
        toiTrangOn: tuyChon.toiTrangOn !== false,     // 4 luật nâng cao, mặc định BẬT hết
        chatHeoOn: tuyChon.chatHeoOn !== false,
        thoiHeoOn: tuyChon.thoiHeoOn !== false,
        baBichOn: tuyChon.baBichOn !== false,
    };

    const T = {
        trangThai: 'CHO',        // CHO (chờ đủ người / giữa 2 ván) | DANG_CHAY (đang đánh)
        nguoi: [],               // [{ id, ten, ghe, afk, tong }] — tong = ăn/thua cộng dồn tại bàn
        van: null,
        soVan: 0,
        nhatKy: [],              // 20 ván gần nhất, để web hiện bảng
        nhatTruoc: null,         // ai về nhất ván trước (ván sau người này đi đầu)
    };

    const ai = (id) => T.nguoi.find(p => p.id === id);
    const V = () => T.van;
    const dangChoi = () => T.nguoi.filter(p => p.trongVan);
    const conBai = () => T.nguoi.filter(p => T.van && (T.van.tay[p.id] || []).length > 0);

    // ------------------------------------------------------------ người vào / ra bàn
    /** Thêm người. Chỉ nhận lúc KHÔNG có ván đang đánh (bàn chạy liên tục, chờ hết ván). */
    function themNguoi(p) {
        if (T.trangThai === 'DANG_CHAY') throw new Error('Đang giữa ván — chờ hết ván rồi vào');
        if (T.nguoi.length >= TOI_DA_NGUOI) throw new Error('Bàn đủ ' + TOI_DA_NGUOI + ' người rồi');
        if (ai(p.id)) throw new Error('Đang ngồi trong bàn rồi');
        if (T.nguoi.some(q => q.ghe === p.ghe)) throw new Error('Ghế này có người rồi');
        T.nguoi.push({ id: p.id, ten: p.ten || p.id, ghe: Number.isInteger(p.ghe) ? p.ghe : T.nguoi.length, afk: false, tong: 0, trongVan: false });
        T.nguoi.sort((a, b) => a.ghe - b.ghe);
        return xemChung();
    }
    /** Rời bàn — cũng chỉ giữa hai ván (đang đánh mà rớt mạng thì máy đánh giùm, xem nhip). */
    function roiBan(id) {
        if (T.trangThai === 'DANG_CHAY' && (V().tay[id] || []).length > 0)
            throw new Error('Đang giữa ván, đánh hết bài rồi mới rời được');
        T.nguoi = T.nguoi.filter(p => p.id !== id);
        if (T.nhatTruoc === id) T.nhatTruoc = null;
        return xemChung();
    }
    function roiMang(id) { const p = ai(id); if (p) p.afk = true; return xemChung(); }
    function noiLai(id) { const p = ai(id); if (p) p.afk = false; return xemChung(); }

    // ------------------------------------------------------------ ván mới
    function vanMoi(bayGio = Date.now()) {
        if (T.nguoi.length < TOI_THIEU_NGUOI) { T.trangThai = 'CHO'; T.van = null; return xemChung(); }
        const bo = B.boMoi();
        const thuTu = T.nguoi.map(p => p.ghe).sort((a, b) => a - b).map(g => T.nguoi.find(p => p.ghe === g).id);
        T.soVan++;
        const tay = {};
        for (const id of thuTu) tay[id] = B.xepBai(B.chia(bo, SO_LA_CHIA));
        for (const p of T.nguoi) p.trongVan = true;

        T.van = {
            so: T.soVan, tay,
            thuTu,                       // thứ tự ghế, dùng để tìm người kế tiếp
            bo: null, boCua: null,       // bộ đang nằm trên bàn + chủ của nó
            // 19/09: MỌI NƯỚC ĐÃ ĐÁNH TRONG VÒNG NÀY, để web xếp đè lên nhau cho thấy cả diễn biến
            // (nước cũ vẽ mờ, nước mới vẽ sáng). Hết vòng là xoá sạch cùng lúc với v.bo.
            chongBai: [],
            daBo: new Set(),             // ai đã bỏ lượt trong VÒNG này (hết vòng thì xoá)
            veNhat: [],                  // id theo thứ tự về (nhất, nhì, ba, tư)
            // 19/09: NHÃN VIỆC VỪA LÀM — id -> { viec:'danh'|'bo', ten, soLa, chat, may, luc }.
            // Cả bàn nhìn ghế là biết người đó vừa đánh bộ gì / vừa bỏ lượt, khỏi phải đoán.
            // Xoá sạch mỗi ván mới (không xoá theo vòng: biết "vừa bỏ lượt" vẫn có ích ở vòng sau).
            vuaLam: {},
            luot: null, hanChot: 0,
            batBuoc3Bich: false,         // ván đầu: người đi đầu phải đánh bộ có 3♠
            lichSu: [],                  // [{id, la, bo, chat}] — web vẽ lại nước vừa đánh
            ketQua: null,
        };
        const v = T.van;
        T.trangThai = 'DANG_CHAY';

        // ---- TỚI TRẮNG: chia xong là có người thắng luôn, không ai đánh lá nào ----
        if (C.toiTrangOn) {
            for (const id of thuTu) {
                const tt = B.toiTrang(tay[id]);
                if (tt) return chotVan(bayGio, { toiTrang: { id, ...tt } });
            }
        }

        // ---- ai đi đầu ----
        if (T.nhatTruoc && thuTu.includes(T.nhatTruoc)) {
            v.luot = T.nhatTruoc;                       // ván sau: người về nhất ván trước
        } else if (C.baBichOn) {
            const co3Bich = thuTu.find(id => tay[id].includes('3s'));
            v.luot = co3Bich || thuTu[0];
            v.batBuoc3Bich = !!co3Bich;                 // ván đầu bàn: 3♠ đi trước và phải đánh 3♠
        } else {
            v.luot = thuTu[Math.floor(Math.random() * thuTu.length)];
        }
        v.hanChot = bayGio + C.giayMoiLuot * 1000;
        return xemChung();
    }

    // ------------------------------------------------------------ tiện ích lượt
    /** Người kế tiếp (theo ghế) CÒN BÀI và CHƯA bỏ lượt trong vòng này. */
    function keTiep(tu) {
        const v = V(), n = v.thuTu.length, i = v.thuTu.indexOf(tu);
        for (let k = 1; k <= n; k++) {
            const id = v.thuTu[(i + k) % n];
            if ((v.tay[id] || []).length > 0 && !v.daBo.has(id)) return id;
        }
        return null;
    }
    /** Người kế tiếp còn bài (KHÔNG quan tâm bỏ lượt) — dùng khi mở vòng mới. */
    function keTiepConBai(tu) {
        const v = V(), n = v.thuTu.length, i = v.thuTu.indexOf(tu);
        for (let k = 1; k <= n; k++) {
            const id = v.thuTu[(i + k) % n];
            if ((v.tay[id] || []).length > 0) return id;
        }
        return null;
    }

    // ------------------------------------------------------------ đánh bài
    /**
     * id đánh mớ lá `la`. Ném Error với câu tiếng Việt nếu sai luật — web trả thẳng ra cho
     * người chơi, nên mọi câu lỗi ở đây đều phải đọc hiểu được.
     */
    function danh(id, la, bayGio = Date.now()) {
        const v = V();
        if (!v || T.trangThai !== 'DANG_CHAY') throw new Error('Chưa có ván nào đang đánh');
        if (v.luot !== id) throw new Error('Chưa tới lượt bạn');
        if (!Array.isArray(la) || !la.length) throw new Error('Chưa chọn lá nào');
        const tay = v.tay[id] || [];
        if (new Set(la).size !== la.length) throw new Error('Có lá bị chọn 2 lần');
        for (const x of la) if (!tay.includes(x)) throw new Error('Bạn không có lá ' + x);

        const bo = B.nhanDang(la);
        if (!bo) throw new Error('Mấy lá này không thành bộ hợp lệ');
        if (v.batBuoc3Bich && !la.includes('3s')) throw new Error('Ván đầu: người cầm 3♠ phải đánh bộ có 3♠');
        const kq = B.danhDuoc(bo, v.bo);
        if (!kq.ok) throw new Error(kq.vi);

        // ---- 💥 CHẶT HEO: người bị chặt trả ngay cho người chặt ----
        let thuongChat = 0;
        if (kq.chat && C.chatHeoOn && v.bo) {
            const phan = phanHeo(v.bo.la);              // chỉ heo mới có thưởng; chặt tứ quý/thông thì 0
            if (phan > 0) {
                thuongChat = phan * C.mucCuoc;
                v.chatHeo = v.chatHeo || [];
                v.chatHeo.push({ chatBoi: id, bi: v.boCua, tien: thuongChat, la: v.bo.la.slice() });
            }
        }

        v.tay[id] = tay.filter(x => !la.includes(x));
        v.bo = bo; v.boCua = id;
        v.batBuoc3Bich = false;
        v.daBo.clear();                                  // có người đánh -> vòng mới mở lại cho mọi người
        v.lichSu.push({ id, la: bo.la.slice(), ten: bo.ten, chat: !!kq.chat, thuong: thuongChat });
        v.vuaLam[id] = { viec: 'danh', ten: bo.ten, soLa: bo.la.length, chat: !!kq.chat, luc: bayGio };
        v.chongBai.push({ id: id, la: bo.la.slice(), ten: bo.ten, chat: !!kq.chat });
        if (v.chongBai.length > 6) v.chongBai = v.chongBai.slice(-6);
        if (v.lichSu.length > 30) v.lichSu = v.lichSu.slice(-30);

        // ---- hết bài = về hạng ----
        if (v.tay[id].length === 0) {
            v.veNhat.push(id);
            if (v.veNhat.length === 1) T.nhatTruoc = id;
            // 'anhet' = nhất ăn hết: có người về nhất là DỪNG NGAY, đếm lá còn lại của mọi người.
            // 'hang'  = nhất nhì ba tư: phải đánh tiếp tới khi chỉ còn 1 người cầm bài mới đủ hạng.
            if (C.cheDo === 'anhet' || conBai().length <= 1) return chotVan(bayGio);
        }
        return chuyenLuot(id, bayGio);
    }

    /** Bỏ lượt. Đang MỞ lượt (không có bộ trên bàn) thì không được bỏ. */
    function boLuot(id, bayGio = Date.now()) {
        const v = V();
        if (!v || T.trangThai !== 'DANG_CHAY') throw new Error('Chưa có ván nào đang đánh');
        if (v.luot !== id) throw new Error('Chưa tới lượt bạn');
        if (!v.bo) throw new Error('Bạn đang mở lượt — phải đánh, không bỏ được');
        v.daBo.add(id);
        v.lichSu.push({ id, la: [], ten: 'bỏ lượt', chat: false, thuong: 0 });
        v.vuaLam[id] = { viec: 'bo', ten: 'bỏ lượt', soLa: 0, chat: false, luc: bayGio };
        return chuyenLuot(id, bayGio);
    }

    /** Sau mỗi nước: tìm người kế; nếu cả bàn đã bỏ hết thì chủ bộ ăn vòng và mở vòng mới. */
    function chuyenLuot(tu, bayGio) {
        const v = V();
        const ke = keTiep(tu);
        if (ke && ke !== v.boCua) { v.luot = ke; v.hanChot = bayGio + C.giayMoiLuot * 1000; return xemChung(); }

        // ---- hết vòng: chủ bộ ăn vòng, được mở vòng mới ----
        const chu = v.boCua;
        v.bo = null; v.boCua = null; v.daBo.clear();
        v.chongBai = [];                          // hết vòng: dọn bàn, vòng sau xếp lại từ đầu
        // chủ bộ vừa đánh hết bài -> người kế tiếp (theo ghế) còn bài mở vòng
        const moVong = (v.tay[chu] || []).length > 0 ? chu : keTiepConBai(chu);
        if (!moVong) return chotVan(bayGio);
        v.luot = moVong;
        v.hanChot = bayGio + C.giayMoiLuot * 1000;
        return xemChung();
    }

    // ------------------------------------------------------------ chốt ván + TIỀN
    /**
     * Xếp nốt hạng cho người còn bài rồi tính tiền. `dacBiet.toiTrang` = { id, ten, thuong }
     * thì bỏ qua mọi luật thường, chỉ thu thưởng tới trắng.
     */
    function chotVan(bayGio, dacBiet = {}) {
        const v = V();
        v.luot = null; v.hanChot = 0;
        const tt = dacBiet.toiTrang || null;

        if (tt) {
            v.veNhat = [tt.id, ...v.thuTu.filter(x => x !== tt.id)];
            T.nhatTruoc = tt.id;
        } else {
            // người còn bài xếp sau, ai còn ÍT lá hơn thì hạng cao hơn
            const conLai = v.thuTu.filter(id => !v.veNhat.includes(id))
                .sort((a, b) => v.tay[a].length - v.tay[b].length);
            v.veNhat.push(...conLai);
        }

        const n = v.thuTu.length;
        const tien = {};                       // id -> ăn/thua RÒNG trước phế
        for (const id of v.thuTu) tien[id] = 0;
        const chiTiet = {};
        for (const id of v.thuTu) chiTiet[id] = { cuoc: 0, la: 0, demLa: 0, thoi: 0, chat: 0, toiTrang: 0 };

        if (tt) {
            // ---- TỚI TRẮNG: mỗi người thua trả `thuong` phần cược cho người tới trắng ----
            const moiNguoi = tt.thuong * C.mucCuoc;
            for (const id of v.thuTu) {
                if (id === tt.id) continue;
                tien[id] -= moiNguoi; chiTiet[id].toiTrang = -moiNguoi;
                tien[tt.id] += moiNguoi;
            }
            chiTiet[tt.id].toiTrang = tien[tt.id];
        } else {
            const nhat = v.veNhat[0];
            if (C.cheDo === 'hang') {
                // ---- NHẤT NHÌ BA TƯ: nhất ăn của bét, nhì ăn của áp bét; lẻ người thì giữa hoà ----
                for (let i = 0; i < Math.floor(n / 2); i++) {
                    const an = v.veNhat[i], tra = v.veNhat[n - 1 - i];
                    tien[an] += C.mucCuoc; chiTiet[an].cuoc += C.mucCuoc;
                    tien[tra] -= C.mucCuoc; chiTiet[tra].cuoc -= C.mucCuoc;
                }
            } else {
                // ---- NHẤT ĂN HẾT + ĐẾM LÁ ----
                for (const id of v.thuTu) {
                    if (id === nhat) continue;
                    tien[id] -= C.mucCuoc; chiTiet[id].cuoc -= C.mucCuoc;
                    tien[nhat] += C.mucCuoc; chiTiet[nhat].cuoc += C.mucCuoc;
                    const soLa = (v.tay[id] || []).length;
                    if (soLa > 0) {
                        const p = soLa * C.giaLa;
                        tien[id] -= p; chiTiet[id].la = soLa; chiTiet[id].demLa = -p;
                        tien[nhat] += p; chiTiet[nhat].demLa += p;
                    }
                }
            }
            // ---- THỐI 2: còn heo trên tay thì phạt, trả cho người nhất ----
            if (C.thoiHeoOn) {
                for (const id of v.thuTu) {
                    if (id === nhat) continue;
                    const p = phanHeo(v.tay[id] || []) * C.mucCuoc;
                    if (!p) continue;
                    tien[id] -= p; chiTiet[id].thoi = -p;
                    tien[nhat] += p; chiTiet[nhat].thoi += p;
                }
            }
        }

        // ---- 💥 CHẶT HEO: trả ngay trong ván, cộng vào bảng cuối ----
        for (const c of (v.chatHeo || [])) {
            tien[c.chatBoi] += c.tien; chiTiet[c.chatBoi].chat += c.tien;
            tien[c.bi] -= c.tien; chiTiet[c.bi].chat -= c.tien;
        }

        // ---- PHẾ 10% trên TIỀN ĂN RÒNG (chỗ duy nhất nhà cái có thu) ----
        const phe = {};
        let pheTong = 0;
        for (const id of v.thuTu) {
            phe[id] = 0;
            if (tien[id] > 0 && C.pheTram > 0) {
                phe[id] = Math.floor(tien[id] * C.pheTram);
                tien[id] -= phe[id];
                pheTong += phe[id];
            }
        }

        for (const id of v.thuTu) { const p = ai(id); if (p) p.tong += tien[id]; }
        v.ketQua = {
            hang: v.veNhat.slice(), tien, phe, pheTong, chiTiet,
            toiTrang: tt ? { id: tt.id, ten: tt.ten } : null,
            chatHeo: (v.chatHeo || []).slice(),
            // bài của mọi người lộ hết khi chốt ván (web vẽ ngửa)
            lat: v.thuTu.map(id => ({ id, la: (v.tay[id] || []).slice() })),
        };
        T.trangThai = 'CHO';
        T.nhatKy.unshift({ van: v.so, hang: v.veNhat.slice(), tien: { ...tien }, toiTrang: v.ketQua.toiTrang });
        if (T.nhatKy.length > 20) T.nhatKy.length = 20;
        return xemChung();
    }

    /** Mở ván kế — web gọi sau khi người chơi xem xong bảng kết quả. */
    function vanKe(bayGio = Date.now()) {
        if (T.trangThai === 'DANG_CHAY') throw new Error('Ván hiện tại chưa xong');
        return vanMoi(bayGio);
    }

    // ------------------------------------------------------------ nhịp (AFK / hết giờ)
    /**
     * Gọi mỗi giây. Hết giờ suy nghĩ (hoặc rớt mạng) thì máy đánh giùm:
     *   - đang THEO (có bộ trên bàn) -> bỏ lượt
     *   - đang MỞ lượt (không bỏ được) -> đánh LÁ NHỎ NHẤT
     * Lặp nhiều vòng vì có thể mấy người AFK liền nhau.
     */
    function nhip(bayGio = Date.now()) {
        for (let k = 0; k < TOI_DA_NGUOI + 2; k++) {
            const v = V();
            if (T.trangThai !== 'DANG_CHAY' || !v || !v.luot) break;
            const p = ai(v.luot);
            if (!p) break;
            if (!p.afk && bayGio < v.hanChot) break;
            const id = v.luot;
            if (v.bo) { boLuot(id, bayGio); if (V() && V().vuaLam[id]) V().vuaLam[id].may = true; }
            else {
                // mở lượt thì buộc phải đánh — chọn lá nhỏ nhất (ván đầu phải là 3♠, mà 3♠ CHÍNH LÀ lá nhỏ nhất)
                const nho = B.xepBai(v.tay[id])[0];
                danh(id, [nho], bayGio);
                if (V() && V().vuaLam[id]) V().vuaLam[id].may = true;
            }
        }
        return xemChung();
    }

    // ------------------------------------------------------------ xem
    function xemChung() {
        const v = V();
        return {
            trangThai: T.trangThai, soVan: T.soVan,
            cheDo: C.cheDo, cheDoTen: CHE_DO[C.cheDo], mucCuoc: C.mucCuoc, giaLa: C.giaLa,
            pheTram: C.pheTram, giayMoiLuot: C.giayMoiLuot,
            luat: { toiTrang: C.toiTrangOn, chatHeo: C.chatHeoOn, thoiHeo: C.thoiHeoOn, baBich: C.baBichOn },
            toiDa: TOI_DA_NGUOI, toiThieu: TOI_THIEU_NGUOI,
            nguoi: T.nguoi.map(p => ({
                id: p.id, ten: p.ten, ghe: p.ghe, afk: p.afk, tong: p.tong,
                // 19/09 chủ server: KHÔNG cho biết số lá của nhau nữa. Bản chung chỉ nói CÒN BÀI hay
                // HẾT BÀI; số lá thật chỉ có trong xem(id) và chỉ của CHÍNH người đó.
                conBai: v ? (v.tay[p.id] || []).length > 0 : false,
                trongVan: v ? v.thuTu.includes(p.id) : false,
                daBo: v ? v.daBo.has(p.id) : false,
                vuaLam: v && v.vuaLam[p.id] ? v.vuaLam[p.id] : null,   // 19/09: web vẽ nhãn "vừa đánh ..."
                hang: v && v.veNhat.indexOf(p.id) >= 0 ? v.veNhat.indexOf(p.id) + 1 : null,
            })),
            van: v ? {
                so: v.so, luot: v.luot, hanChot: v.hanChot,
                // ⚠️ PHAI co 'cao' (la lon nhat): may luat ban client (trang.html) so bo bang no.
                // Thieu truong nay -> client goi cTri(undefined) -> vo trang. Da dinh 19/09.
                bo: v.bo ? { kieu: v.bo.kieu, dai: v.bo.dai, la: v.bo.la.slice(), cao: v.bo.cao, ten: v.bo.ten } : null,
                boCua: v.boCua, batBuoc3Bich: v.batBuoc3Bich,
                chongBai: v.chongBai.map(x => ({ id: x.id, la: x.la.slice(), ten: x.ten, chat: x.chat })),
                lichSu: v.lichSu.slice(-8),
                ketQua: v.ketQua,
            } : null,
            nhatKy: T.nhatKy.slice(0, 10),
        };
    }
    /** Trạng thái CHO RIÊNG 1 người: thêm bài trên tay của chính họ. */
    function xem(id) {
        const v = V(), s = xemChung();
        // số lá của CHÍNH MÌNH thì được biết (gắn vào đúng dòng của mình trong danh sách)
        const toiTrongDs = s.nguoi.find(x => x.id === id);
        if (toiTrongDs && v) toiTrongDs.soLa = (v.tay[id] || []).length;
        s.toi = {
            id,
            la: v && v.tay[id] ? B.xepBai(v.tay[id]) : null,
            toiLuot: v ? v.luot === id : false,
            moLuot: v ? (v.luot === id && !v.bo) : false,
            tong: ai(id) ? ai(id).tong : 0,
        };
        return s;
    }

    return {
        themNguoi, roiBan, roiMang, noiLai,
        vanMoi, vanKe, danh, boLuot, nhip, xem, xemChung,
        _trong: T, _cauHinh: C,
    };
}

module.exports = {
    taoBan, CHE_DO, TOI_DA_NGUOI, TOI_THIEU_NGUOI, SO_LA_CHIA,
    GIAY_MOI_LUOT, PHE_TRAM, PHAT_HEO_DEN, PHAT_HEO_DO, phanHeo,
};
