// ============================================================================
//  giai.js — MÁY TRẠNG THÁI GIẢI POKER 2–8 NGƯỜI (Texas Hold'em, loại dần)
//  Thuần logic: không web, không Discord, không đụng ví Dogcoin.
//  Chip trong đây là CHIP GIẢI (ảo). Không ai ăn tiền thật của ai — giải chỉ đẻ ra
//  THỨ HẠNG (nhất/nhì/ba/tư...), còn thưởng Pal và phạt là chủ server tự làm tay.
//
//  Bộ kiểm:  node Poker/kiemtra/giai-test.js
//
//  LUẬT ĐÃ CHỌN (khác sòng thật một chút, cố ý — ghi ra để sau khỏi tưởng là bug):
//   1. Tố ngắn (all-in nhỏ hơn mức tố tối thiểu) VẪN mở lại lượt cho người đã đi.
//      Sòng thật thì không. Chọn vậy vì luật thật ở chỗ này đẻ rất nhiều ca hiếm,
//      mà bàn toàn người quen thì lợi bất cập hại.
//   2. Mức blind chỉ lên GIỮA HAI VÁN, không bao giờ lên giữa ván đang đánh.
//   3. Hết giờ suy nghĩ: miễn phí thì tự THEO, phải bỏ tiền thì tự BỎ BÀI.
//   4. Hai người cháy cùng một ván: ai vào ván với NHIỀU chip hơn thì hạng cao hơn.
//   5. Rớt mạng (AFK) VẪN đóng blind như thường — ngồi im là chip cụt dần rồi cháy.
//      Chỉ khác: tới lượt thì máy đánh giùm NGAY, không bắt cả bàn đợi hết 30 giây.
//   6. Tạm ngưng đông cứng CẢ HAI đồng hồ (giờ suy nghĩ + giờ lên mức blind); lúc
//      chơi tiếp cộng bù đúng bằng thời gian đã nghỉ, nên không ai bị xử oan.
//      Mỗi người xin nghỉ 1 lần/giải, cả bàn đồng ý mới nghỉ, bị từ chối vẫn mất lượt,
//      người rớt mạng không tính phiếu.
//   7. Khoe bài: mỗi ván ĐÚNG 1 lá, cả bàn thấy 4 giây. Đã bỏ bài vẫn khoe được.
//   8. Chip lẻ khi chia hũ về người CÒN BÀI sát trái nút cái nhất (bỏ qua người đã bỏ).
//   9. Nút cái ván đầu NGẪU NHIÊN. Lên mức blind khi hết 8 phút HOẶC đủ max(số người, 6)
//      ván — cái nào tới trước. Thang blind sinh từ chip khởi điểm, leo tới >= tổng chip bàn.
// ============================================================================
'use strict';
const B = require('./bai.js');

// Mỗi mức kéo 10 phút, mức sau gấp đôi mức trước. Thang phải kéo đủ dài cho bàn
// ĐÔNG: 8 người × 5.000 = 40.000 chip, nếu blind đứng ở mức thấp thì giải chạy
// mấy tiếng không xong. Mức chót 12.000/24.000 nuốt trọn 40.000 trong vài ván.
const LICH_BLIND_MAC_DINH = [
    { sb: 25, bb: 50 }, { sb: 50, bb: 100 }, { sb: 100, bb: 200 },
    { sb: 200, bb: 400 }, { sb: 400, bb: 800 }, { sb: 800, bb: 1600 },
    { sb: 1500, bb: 3000 }, { sb: 3000, bb: 6000 },
    { sb: 6000, bb: 12000 }, { sb: 12000, bb: 24000 },
];
// 8 phút/mức + sàn 6 ván/mức: mô phỏng 40 giải × 8 cỡ bàn cho 4 người ≈ 36-41 phút,
// 6 người ≈ 48-52, 8 người ≈ 60-68, tay đôi ≈ 23-26 (tay đôi nhanh là đúng bản chất).
const PHUT_MOI_MUC = 8;
const GIAY_MOI_LUOT = 30;
const GIAY_KHOE = 4;           // khoe 1 lá thì cả bàn thấy trong chừng này giây
const CHIP_DAU = 5000;
const TOI_DA_NGUOI = 8;        // 8 ghế quanh bàn - chủ server chốt
const TOI_THIEU_NGUOI = 2;     // admin mở giải, 2 người là chạy được
// Ví phải CÓ chừng này Dogcoin mới được ngồi vào bàn. CHỈ KIỂM TRA, KHÔNG TRỪ -
// giải không đụng tới tiền thật của ai. Tầng web là chỗ kiểm, không phải file này.
const DOGCOIN_VAO_GIAI = 10000;

const VONG_SAU = { PREFLOP: 'FLOP', FLOP: 'TURN', TURN: 'RIVER' };
const SO_LA_CHIA = { FLOP: 3, TURN: 1, RIVER: 1 };

// Các mốc BB "đẹp" theo kiểu sòng thật (mỗi bậc ×1,33–1,5). Thang của một giải là
// khúc cắt từ đây: bắt đầu ở chipDau/100 (sâu 100 BB, chuẩn giải), kết thúc khi BB
// đủ lớn để nuốt cả một stack khởi điểm trong một ván.
const BB_DEP = [10, 20, 30, 50, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000,
    4000, 6000, 8000, 10000, 15000, 20000, 30000, 40000, 60000, 80000, 100000,
    150000, 200000, 300000, 400000, 600000, 800000, 1000000];   // đủ cho 100.000 chip × 8 người
/**
 * Sinh thang blind từ chip khởi điểm. Admin đổi chipDau là thang tự đổi theo, khỏi tự gõ.
 * Thang phải leo tới BB >= TỔNG chip tối đa của bàn (chipDau × 8), KHÔNG dừng ở 1 stack:
 * bộ kiểm "cả bàn AFK" từng lộ ra — thang dừng ở BB 4.000 với stack 5.000 thì bốn bot
 * chỉ-bỏ-bài cứ BB ăn đúng tiền SB, đi giáp vòng là hoà, không ai cháy, giải treo mãi.
 * BB >= tổng chip thì ai làm BB cũng all-in, ván nào cũng phải có người cháy.
 */
function taoLichBlind(chipDau) {
    const dau = chipDau / 100;
    const tran = chipDau * TOI_DA_NGUOI;
    // lấy mọi mốc >= dau, và DỪNG SAU mốc đầu tiên >= trần (giữ luôn mốc đó). Lọc kiểu
    // "bb <= trần" là loại đúng mốc cần giữ: 2.000 chip → trần 16.000 → mất 20.000, kẹt ở 15.000.
    const lich = [];
    for (const bb of BB_DEP) {
        if (bb < dau) continue;
        lich.push({ sb: bb / 2, bb });
        if (bb >= tran) break;
    }
    return lich.length ? lich : LICH_BLIND_MAC_DINH;
}

// Mỗi mức tối thiểu chừng này ván dù bàn ít người. Không có sàn này thì bàn 2 người
// cứ 2 ván lên một mức (~1 phút), 4 người ~2,6 phút — giải tàn trong 10-20 phút, trái
// mục tiêu 30-60 phút. Số này do mô phỏng chọn, xem Poker/README.md.
const VAN_TOI_THIEU_MOI_MUC = 6;

function taoGiai(tuyChon = {}) {
    const C = {
        chipDau: tuyChon.chipDau || CHIP_DAU,
        lichBlind: tuyChon.lichBlind || taoLichBlind(tuyChon.chipDau || CHIP_DAU),
        phutMoiMuc: tuyChon.phutMoiMuc || PHUT_MOI_MUC,
        giayMoiLuot: tuyChon.giayMoiLuot || GIAY_MOI_LUOT,
        vanToiThieuMoiMuc: tuyChon.vanToiThieuMoiMuc != null ? tuyChon.vanToiThieuMoiMuc : VAN_TOI_THIEU_MOI_MUC,
    };

    const G = {
        trangThai: 'CHO',        // CHO | DANG_CHAY | XONG
        nguoi: [],               // [{ id, ten, chip, ghe, afk }]
        mucBlind: 0,
        gioLenMuc: 0,            // mốc thời gian được phép lên mức kế
        vanTuLenMuc: 0,          // đã đánh mấy ván kể từ lần lên mức gần nhất
        nutCai: 0,               // chỉ số GHẾ đang giữ nút nhà cái
        soVan: 0,
        thuTuChay: [],           // id theo thứ tự bị loại (cháy trước đứng đầu)
        nhatKy: [],              // tóm tắt từng ván, để xem lại
        van: null,               // ván đang đánh
        nghi: false,             // đang tạm ngưng?
        nghiTu: 0,               // mốc lúc bắt đầu nghỉ
        nghiBoi: null,           // ai làm nghỉ
        tongNghiMs: 0,           // tổng thời gian đã nghỉ (để báo cho người chơi)
        nghiXin: null,           // đề nghị đang chờ: { boi, dongY:Set, luc }
        daXinNghi: new Set(),    // ai đã dùng lượt xin nghỉ của mình rồi
    };

    // ---------------------------------------------------------------- tiện ích
    const ai = (id) => G.nguoi.find(p => p.id === id);
    const conSong = () => G.nguoi.filter(p => p.chip > 0);
    const V = () => G.van;
    /** Những người còn bài trong ván (chưa bỏ). */
    const conBai = () => V() ? V().thuTu.filter(id => !V().daBo.has(id)) : [];
    /** Những người còn bài VÀ còn chip để đánh tiếp. */
    const conDanh = () => conBai().filter(id => ai(id).chip > 0);

    /** Ghế kế tiếp (vòng tròn) còn chip — dùng để xoay nút cái. */
    function gheKe(g) {
        const n = G.nguoi.length;
        for (let i = 1; i <= n; i++) {
            const k = (g + i) % n;
            if (G.nguoi[k].chip > 0) return k;
        }
        return g;
    }

    // ---------------------------------------------------------------- bắt đầu
    function batDau(nguoiChoi, bayGio = Date.now()) {
        if (G.trangThai !== 'CHO') throw new Error('Giải đã bắt đầu rồi');
        if (nguoiChoi.length < 2) throw new Error('Cần ít nhất 2 người');
        if (nguoiChoi.length > TOI_DA_NGUOI) throw new Error('Bàn tối đa ' + TOI_DA_NGUOI + ' người');
        if (new Set(nguoiChoi.map(p => p.id)).size !== nguoiChoi.length) throw new Error('Có người bị ghi tên 2 lần');
        // ghe: giữ số ghế người chơi đã chọn ở phòng chờ (nếu có) để vào bàn ngồi đúng chỗ;
        // không có thì đánh số theo thứ tự. Mảng nguoi vẫn xếp theo thứ tự truyền vào.
        G.nguoi = nguoiChoi.map((p, i) => ({
            id: p.id, ten: p.ten || p.id, chip: C.chipDau,
            ghe: Number.isInteger(p.ghe) ? p.ghe : i, afk: false,
        }));
        G.trangThai = 'DANG_CHAY';
        G.mucBlind = 0;
        G.gioLenMuc = bayGio + C.phutMoiMuc * 60000;
        // Nút cái ván đầu chọn NGẪU NHIÊN (như sòng thật rút bài cao). vanMoi() sẽ
        // đẩy nút đi 1 ghế, nên đặt lùi 1 để sau khi đẩy nó rơi đúng ghế đã rút.
        const rut = require('crypto').randomInt(0, G.nguoi.length);
        G.nutCai = (rut - 1 + G.nguoi.length) % G.nguoi.length;
        vanMoi(bayGio);
        return xemChung();
    }

    // ---------------------------------------------------------------- ván mới
    function vanMoi(bayGio = Date.now()) {
        const song = conSong();
        if (song.length <= 1) return ketThuc();

        // ---- LÊN MỨC BLIND: theo GIỜ hoặc theo VÒNG, cái nào tới trước ----
        // Chỉ lên giữa hai ván, không bao giờ lên giữa ván đang đánh.
        const cuoiThang = () => G.mucBlind >= C.lichBlind.length - 1;
        // theo giờ: dùng while vì nghỉ lâu có thể phải nhảy mấy mức một lúc
        while (bayGio >= G.gioLenMuc && !cuoiThang()) {
            G.mucBlind++;
            G.gioLenMuc += C.phutMoiMuc * 60000;
            G.vanTuLenMuc = 0;
        }
        // theo vòng: nút cái đi giáp một vòng bàn (= số người còn sống) là lên mức,
        // dù chưa hết giờ. Người cháy dần -> vòng ngắn dần -> giải kết thúc nhanh hơn.
        // Nhưng có SÀN: bàn ít người thì mỗi mức vẫn phải đủ vanToiThieuMoiMuc ván.
        if (G.vanTuLenMuc >= Math.max(song.length, C.vanToiThieuMoiMuc) && !cuoiThang()) {
            G.mucBlind++;
            G.vanTuLenMuc = 0;
            G.gioLenMuc = bayGio + C.phutMoiMuc * 60000;   // lên mức rồi thì đếm giờ lại từ đầu
        }

        G.soVan++;
        G.vanTuLenMuc++;
        G.nutCai = gheKe(G.nutCai);

        const bl = C.lichBlind[G.mucBlind];
        const bo = B.boMoi();
        const thuTu = [];                       // thứ tự ghế, bắt đầu từ trái nút cái
        for (let i = 1; i <= G.nguoi.length; i++) {
            const p = G.nguoi[(G.nutCai + i) % G.nguoi.length];
            if (p.chip > 0) thuTu.push(p.id);
        }

        G.van = {
            so: G.soVan, vong: 'PREFLOP', bo,
            chung: [], tay: {},
            thuTu,                               // thứ tự hành động sau vòng preflop
            chipDauVan: Object.fromEntries(song.map(p => [p.id, p.chip])),
            cuoc: {},                            // đã đẩy trong VÒNG này
            tongCuoc: {},                        // đã đẩy cả VÁN (dùng chia hũ phụ)
            daBo: new Set(), daDi: new Set(),
            // 18/09: NHÃN VIỆC VỪA LÀM — id -> { viec, tien, luc }. Cả bàn nhìn ghế là biết
            // người đó vừa BỎ / XEM (miễn phí) / THEO / TỐ / ALL-IN bao nhiêu, không phải suy
            // từ đống chip. Xoá sạch mỗi khi sang vòng mới (flop/turn/river) — đúng như sòng
            // thật: nhãn là của VÒNG ĐANG ĐÁNH. Riêng người đã bỏ thì web tự giữ nhãn BỎ.
            vuaLam: {},
            khoe: {},                            // id -> { i, la, den } khoe 1 lá cho cả bàn xem
            muc: 0, toToiThieu: bl.bb,
            luot: null, hanChot: 0,
            ketQua: null,
        };
        const v = G.van;
        for (const id of thuTu) { v.cuoc[id] = 0; v.tongCuoc[id] = 0; v.tay[id] = B.chia(bo, 2); }

        // đặt blind. Heads-up (2 người): nút cái CHÍNH LÀ small blind.
        const hai = thuTu.length === 2;
        const idSB = hai ? G.nguoi[G.nutCai].id : thuTu[0];
        const idBB = hai ? thuTu.find(x => x !== idSB) : thuTu[1];
        dayChip(idSB, Math.min(bl.sb, ai(idSB).chip));
        dayChip(idBB, Math.min(bl.bb, ai(idBB).chip));
        v.muc = Math.max(v.cuoc[idSB], v.cuoc[idBB]);
        v.sb = idSB; v.bb = idBB;               // web vẽ nhãn SB/BB lên ghế

        // Preflop người đi đầu là người SAU big blind; heads-up thì là SB (cũng là nút cái).
        // Dùng doTim(..., true) để TÍNH LUÔN chính người đó. Trước đây chỗ này gọi
        // kiemTraVong() ngay, mà hàm đó lại đẩy lượt đi thêm một bước -> nút cái đi
        // trước UTG. Đừng gọi kiemTraVong ở đây nữa.
        const dauTien = hai ? idSB : (thuTu[2] || idSB);
        v.luot = doTim(thuTu.indexOf(dauTien), true);
        v.hanChot = bayGio + C.giayMoiLuot * 1000;
        // blind là cược bắt buộc, chưa tính là "đã hành động"
        // Không ai đi được (tất cả all-in vì blind) thì để kiemTraVong chia nốt bài.
        if (!v.luot) return kiemTraVong(bayGio);
        return xemChung();
    }

    /** Đẩy chip của 1 người vào hũ (tự kẹp nếu không đủ = all-in). */
    function dayChip(id, tien) {
        const p = ai(id), v = V();
        const that = Math.max(0, Math.min(tien, p.chip));
        p.chip -= that;
        v.cuoc[id] += that;
        v.tongCuoc[id] += that;
        return that;
    }

    // ---------------------------------------------------------------- hành động
    /** kieu: 'bo' | 'theo' | 'to'. Với 'to', tien là TỔNG muốn cược tới trong vòng này. */
    function hanhDong(id, kieu, tien = 0, bayGio = Date.now()) {
        const v = V();
        if (!v || G.trangThai !== 'DANG_CHAY') throw new Error('Không có ván nào đang đánh');
        // "Đang nghỉ" phải xét TRƯỚC mọi chốt khác: nó chặn cả bàn, không riêng ai.
        // Để sau thì người chơi nhận câu báo lỗi lạc đề ("chưa tới lượt", "ván đã xong").
        if (G.nghi) throw new Error('Đang tạm ngưng — bấm CHƠI TIẾP đã');
        // Ván đã lật bài/chốt xong thì cấm đánh thêm. Thiếu chốt chặn này thì gọi
        // hanhDong() trên ván đã xong vẫn lọt và chạy vô tận (đã dính một lần).
        if (['LAT', 'XONG'].includes(v.vong)) throw new Error('Ván đã xong — chờ ván sau');
        if (v.luot !== id) throw new Error('Chưa tới lượt ' + id);
        const p = ai(id);
        const canTheo = v.muc - v.cuoc[id];

        // nhãn cho cả bàn xem: tên việc + số chip vừa đẩy (xem mô tả v.vuaLam ở vanMoi)
        const ghiViec = (viec, tien = 0) => { v.vuaLam[id] = { viec, tien, luc: bayGio }; };

        if (kieu === 'bo') {
            // chặn bỏ bài khi đang MIỄN PHÍ - gần như luôn là bấm nhầm
            if (canTheo <= 0) throw new Error('Đang miễn phí, đừng bỏ bài — cứ THEO');
            v.daBo.add(id);
            ghiViec('bo');
        } else if (kieu === 'theo') {
            const day = dayChip(id, canTheo);
            // canTheo = 0 nghĩa là không phải bỏ đồng nào -> đó là "xem bài" (check), không phải "theo"
            ghiViec(canTheo <= 0 ? 'xem' : (p.chip === 0 ? 'allin' : 'theo'), day);
        } else if (kieu === 'to') {
            const toiDa = v.cuoc[id] + p.chip;
            if (tien > toiDa) throw new Error('Không đủ chip: tối đa tố tới ' + toiDa);
            const toiThieu = v.muc + v.toToiThieu;
            if (tien < toiThieu && tien < toiDa) throw new Error('Tố tối thiểu tới ' + toiThieu + ', hoặc all-in ' + toiDa);
            if (tien <= v.muc) throw new Error('Tố phải cao hơn mức hiện tại ' + v.muc);
            dayChip(id, tien - v.cuoc[id]);
            v.toToiThieu = Math.max(v.toToiThieu, v.cuoc[id] - v.muc);
            v.muc = v.cuoc[id];
            v.daDi.clear();                       // có người tố -> ai cũng phải đi lại
            ghiViec(p.chip === 0 ? 'allin' : 'to', v.cuoc[id]);   // tố: hiện TỔNG cược tới, đúng cái người khác phải theo
        } else throw new Error('Kiểu hành động lạ: ' + kieu);

        v.daDi.add(id);
        return kiemTraVong(bayGio);
    }

    // ------------------------------------------------------- khoe bài
    /**
     * Tự nguyện lật 1 lá cho CẢ BÀN xem trong vài giây — trò khích tướng kinh điển.
     * Luật chủ server chốt: MỖI VÁN CHỈ ĐƯỢC KHOE ĐÚNG 1 LÁ, chọn 1 trong 2.
     * Đã bỏ bài vẫn khoe được (khoe con bài mình vừa bỏ cũng là một kiểu chơi).
     * Quyết định nằm ở ĐÂY, không phải ở web — client không bao giờ được tự lộ bài.
     */
    function khoeBai(id, i, bayGio = Date.now()) {
        const v = V();
        if (!v || G.trangThai !== 'DANG_CHAY') throw new Error('Không có ván nào đang đánh');
        if (!v.tay[id]) throw new Error('Ván này bạn không có bài');
        if (v.khoe[id]) throw new Error('Mỗi ván chỉ khoe được 1 lá thôi');
        i = Number(i);
        if (i !== 0 && i !== 1) throw new Error('Chỉ khoe được lá 1 hoặc lá 2');
        v.khoe[id] = { i, la: v.tay[id][i], den: bayGio + GIAY_KHOE * 1000 };
        return xemChung();
    }

    /** Những lá đang khoe và CHƯA hết hạn. Hết 4 giây là tự biến mất. */
    function dangKhoe(bayGio = Date.now()) {
        const v = V();
        if (!v) return [];
        return Object.keys(v.khoe)
            .filter(k => v.khoe[k].den > bayGio)
            .map(k => ({ id: k, i: v.khoe[k].i, la: v.khoe[k].la }));
    }

    // ------------------------------------------------------- mất mạng (AFK)
    /**
     * Đánh dấu ai đó rớt mạng. Họ VẪN đóng blind như thường (luật giải thật: ngồi im
     * là chip cụt dần rồi cháy) nhưng tới lượt thì máy tự đánh giùm ngay, không bắt
     * cả bàn ngồi đợi hết 30 giây.
     */
    function roiMang(id) {
        const p = ai(id); if (!p) throw new Error('Không có người này: ' + id);
        p.afk = true; return xemChung();
    }
    /** Vào lại được rồi. Ván đang đánh mà đã bỏ bài thì vẫn coi như bỏ, chờ ván sau. */
    function noiLai(id) {
        const p = ai(id); if (!p) throw new Error('Không có người này: ' + id);
        p.afk = false; return xemChung();
    }

    // ------------------------------------------------------- tạm ngưng (bỏ phiếu)
    /**
     * Luật chủ server chốt: MỖI NGƯỜI được xin nghỉ ĐÚNG 1 LẦN mỗi giải, và phải
     * MỌI NGƯỜI ĐỒNG Ý mới nghỉ thật.
     *
     * Hai chỗ cố ý làm khác, ghi ra để sau khỏi tưởng là bug:
     *  - Người rớt mạng KHÔNG được tính phiếu. Họ có ở đó đâu mà bấm đồng ý; tính
     *    phiếu họ thì không bao giờ nghỉ được.
     *  - Bị từ chối thì VẪN MẤT lượt xin. Không thế thì một người cứ xin đi xin lại
     *    để câu giờ, cả bàn phải bấm từ chối mãi.
     */
    function nguoiBauCu() {
        return G.nguoi.filter(p => p.chip > 0 && !p.afk).map(p => p.id);
    }

    function xinNghi(id, bayGio = Date.now()) {
        if (G.trangThai !== 'DANG_CHAY') throw new Error('Giải không chạy thì nghỉ gì');
        if (G.nghi) throw new Error('Đang nghỉ rồi');
        if (G.nghiXin) throw new Error('Đang có người xin nghỉ, chờ cả bàn trả lời đã');
        const p = ai(id); if (!p) throw new Error('Không có người này: ' + id);
        if (p.chip <= 0) throw new Error('Đã cháy rồi, không xin nghỉ được');
        if (G.daXinNghi.has(id)) throw new Error('Mỗi người chỉ được xin nghỉ 1 lần mỗi giải');
        G.daXinNghi.add(id);
        G.nghiXin = { boi: id, dongY: new Set([id]), luc: bayGio };   // tự xin là tự đồng ý
        return kiemPhieu(bayGio);
    }

    function dongYNghi(id, bayGio = Date.now()) {
        if (!G.nghiXin) throw new Error('Không có đề nghị nghỉ nào');
        const p = ai(id); if (!p) throw new Error('Không có người này: ' + id);
        G.nghiXin.dongY.add(id);
        return kiemPhieu(bayGio);
    }

    /** Chỉ cần MỘT người từ chối là đề nghị tan. */
    function tuChoiNghi(id, bayGio = Date.now()) {
        if (!G.nghiXin) throw new Error('Không có đề nghị nghỉ nào');
        G.nghiXin = null;
        return xemChung();
    }

    function kiemPhieu(bayGio) {
        const can = nguoiBauCu();
        if (can.length && can.every(x => G.nghiXin.dongY.has(x))) {
            const boi = G.nghiXin.boi;
            G.nghiXin = null;
            batDauNghi(boi, bayGio);
        }
        return xemChung();
    }

    /**
     * Bật nghỉ. ĐÔNG CỨNG cả hai đồng hồ — giờ suy nghĩ của người đang tới lượt VÀ
     * giờ lên mức blind. Lúc chơi tiếp, cả hai mốc được đẩy lùi đúng bằng thời gian
     * đã nghỉ. Không làm vậy thì vừa bấm chơi tiếp là người đang đánh bị xử bỏ bài
     * ngay và blind nhảy mấy mức một lúc.
     */
    function batDauNghi(boi, bayGio) {
        G.nghi = true; G.nghiTu = bayGio; G.nghiBoi = boi;
    }

    /** Đường của ADMIN: ngưng thẳng, không cần bỏ phiếu. Tầng web tự chặn ai được gọi. */
    function tamNghi(boi = null, bayGio = Date.now()) {
        if (G.trangThai !== 'DANG_CHAY') throw new Error('Giải không chạy thì nghỉ gì');
        if (G.nghi) return xemChung();
        G.nghiXin = null;
        batDauNghi(boi, bayGio);
        return xemChung();
    }

    function choiTiep(bayGio = Date.now()) {
        if (!G.nghi) return xemChung();
        const daNghi = Math.max(0, bayGio - G.nghiTu);
        G.tongNghiMs += daNghi;
        G.gioLenMuc += daNghi;
        if (V() && V().hanChot) V().hanChot += daNghi;
        G.nghi = false; G.nghiBoi = null;
        return xemChung();
    }

    /**
     * Nhịp đồng hồ — server gọi đều đặn. Làm 2 việc:
     *   1. Ai rớt mạng mà tới lượt -> đánh giùm NGAY (không đợi hết giờ).
     *   2. Hết 30 giây suy nghĩ -> miễn phí thì THEO, phải bỏ tiền thì BỎ BÀI.
     * Lặp nhiều vòng vì có thể mấy người AFK liền nhau.
     */
    function nhip(bayGio = Date.now()) {
        if (G.nghi) return xemChung();   // đang nghỉ: đồng hồ đứng, không xử ai cả
        for (let vong = 0; vong < TOI_DA_NGUOI + 2; vong++) {
            const v = V();
            if (G.trangThai !== 'DANG_CHAY' || !v || !v.luot) break;
            const p = ai(v.luot);
            if (!p.afk && bayGio < v.hanChot) break;
            const mienPhi = v.muc - v.cuoc[v.luot] <= 0, aiDo = v.luot;
            hanhDong(aiDo, mienPhi ? 'theo' : 'bo', 0, bayGio);
            // đánh máy (rớt mạng hoặc hết giờ) -> đánh dấu để cả bàn biết đây không phải người bấm
            if (V() && V().vuaLam[aiDo]) V().vuaLam[aiDo].may = true;
        }
        return xemChung();
    }

    // ---------------------------------------------------------------- nhịp ván
    /** Vòng cược xong chưa? Xong thì sang vòng sau / lật bài. */
    function kiemTraVong(bayGio) {
        const v = V();

        if (conBai().length === 1) return chotVan(bayGio);    // chỉ còn 1 người -> ăn trọn

        const phaiDi = conDanh();
        const xong = phaiDi.every(id => v.daDi.has(id) && v.cuoc[id] === v.muc);
        if (!xong) {
            v.luot = keTiepDuocDi(v.luot);
            v.hanChot = bayGio + C.giayMoiLuot * 1000;
            return xemChung();
        }

        // hết đường cược (0 hoặc 1 người còn chip) -> chia nốt bài chung rồi lật
        if (phaiDi.length <= 1) {
            while (v.vong !== 'RIVER') {
                v.vong = VONG_SAU[v.vong];
                v.chung.push(...B.chia(v.bo, SO_LA_CHIA[v.vong]));
            }
            return chotVan(bayGio);
        }
        if (v.vong === 'RIVER') return chotVan(bayGio);

        // sang vòng sau
        v.vong = VONG_SAU[v.vong];
        v.chung.push(...B.chia(v.bo, SO_LA_CHIA[v.vong]));
        for (const id of Object.keys(v.cuoc)) v.cuoc[id] = 0;
        v.muc = 0;
        v.toToiThieu = C.lichBlind[G.mucBlind].bb;
        v.daDi.clear();
        v.vuaLam = {};                            // nhãn việc là của VÒNG vừa xong -> sang vòng mới thì xoá
        // Sau flop người đi đầu là người BÊN TRÁI nút cái, KHÔNG phải nút cái
        // (nút cái đi cuối — đó là cái lợi của vị trí này). Nên gomCaChinh = false.
        v.luot = keTiepDuocDi(G.nguoi[G.nutCai].id, false);
        v.hanChot = bayGio + C.giayMoiLuot * 1000;
        return xemChung();
    }

    /** Từ chỗ thứ i trong vòng, tìm người còn bài + còn chip. gomCaChinh = tính luôn chính chỗ đó. */
    function doTim(i, gomCaChinh) {
        const v = V(), vong = v.thuTu;
        for (let k = gomCaChinh ? 0 : 1; k <= vong.length; k++) {
            const id = vong[(i + k) % vong.length];
            if (!v.daBo.has(id) && ai(id).chip > 0) return id;
        }
        return null;
    }

    /**
     * Người kế tiếp được đi, tính từ tuId.
     * tuId có thể KHÔNG còn trong ván (vd nút cái đã cháy hết chip) — khi đó lùi về
     * số ghế, tìm người đầu tiên ngồi sau ghế đó mà còn trong ván, và tính luôn người đó.
     */
    function keTiepDuocDi(tuId, gomCaChinh = false) {
        const vong = V().thuTu;
        const i = vong.indexOf(tuId);
        if (i >= 0) return doTim(i, gomCaChinh);
        const ghe = G.nguoi.findIndex(p => p.id === tuId);
        for (let k = 1; k <= G.nguoi.length; k++) {
            const c = G.nguoi[(ghe + k) % G.nguoi.length].id;
            if (vong.includes(c)) return doTim(vong.indexOf(c), true);
        }
        return null;
    }

    // ---------------------------------------------------------------- chia hũ
    /**
     * Dựng các hũ từ tổng cược mỗi người. Người BỎ BÀI vẫn để chip lại trong hũ
     * nhưng không được ăn. Đây là chỗ hay sai nhất của poker.
     * Trả [{ chip, an: [id...] }] từ hũ chính ra hũ phụ.
     */
    function dungHu() {
        const v = V();
        const muc = [...new Set(Object.values(v.tongCuoc).filter(x => x > 0))].sort((a, b) => a - b);
        const hu = [];
        let truoc = 0;
        for (const m of muc) {
            let chip = 0;
            for (const id of Object.keys(v.tongCuoc))
                chip += Math.min(v.tongCuoc[id], m) - Math.min(v.tongCuoc[id], truoc);
            const an = Object.keys(v.tongCuoc).filter(id => !v.daBo.has(id) && v.tongCuoc[id] >= m);
            if (chip > 0 && an.length) hu.push({ chip, an });
            else if (chip > 0 && hu.length) hu[hu.length - 1].chip += chip;   // không ai ăn -> dồn vào hũ trước
            truoc = m;
        }
        return hu;
    }

    /** Lật bài, chia từng hũ, ghi nhật ký, loại người cháy, mở ván sau. */
    function chotVan(bayGio) {
        const v = V();
        v.luot = null;          // ván xong: không còn ai tới lượt, đồng hồ tắt
        v.hanChot = 0;
        const conL = conBai();
        const an = {};                                   // id -> chip nhận được
        const hu = dungHu();
        let batDauTu = (G.nutCai + 1) % G.nguoi.length;  // lẻ chip trả cho người gần trái nút cái nhất

        if (conL.length === 1) {
            // ăn trọn, không cần lật bài
            an[conL[0]] = hu.reduce((s, h) => s + h.chip, 0);
            v.vong = 'XONG';
        } else {
            v.vong = 'LAT';
            for (const h of hu) {
                const nhom = B.xepHang(h.an.map(id => ({ id, la: [...v.tay[id], ...v.chung] })));
                const thang = nhom[0];
                const moiNguoi = Math.floor(h.chip / thang.length);
                let le = h.chip - moiNguoi * thang.length;
                // trả phần chia đều
                for (const t of thang) an[t.id] = (an[t.id] || 0) + moiNguoi;
                // chip lẻ: người ngồi gần trái nút cái nhất lấy trước
                const xepGhe = thang.map(t => ai(t.id)).sort((p, q) =>
                    ((p.ghe - batDauTu + G.nguoi.length) % G.nguoi.length) -
                    ((q.ghe - batDauTu + G.nguoi.length) % G.nguoi.length));
                for (let i = 0; le > 0; i = (i + 1) % xepGhe.length, le--)
                    an[xepGhe[i].id] = (an[xepGhe[i].id] || 0) + 1;
            }
        }

        for (const id of Object.keys(an)) ai(id).chip += an[id];

        v.ketQua = {
            an, hu: hu.map(h => ({ chip: h.chip, an: h.an.slice() })),
            lat: conL.length > 1 ? conL.map(id => ({
                id, la: v.tay[id].slice(), cham: B.chamBai([...v.tay[id], ...v.chung]),
            })) : null,
        };
        G.nhatKy.push({
            van: v.so, mucBlind: G.mucBlind, chung: v.chung.slice(),
            an: { ...an }, soHu: hu.length,
        });

        // ai hết chip thì bị loại. Cùng ván cháy: vào ván nhiều chip hơn -> hạng cao hơn.
        const chay = G.nguoi.filter(p => p.chip <= 0 && !G.thuTuChay.includes(p.id) && v.chipDauVan[p.id] !== undefined);
        chay.sort((a, b) => v.chipDauVan[a.id] - v.chipDauVan[b.id]);
        for (const p of chay) G.thuTuChay.push(p.id);

        if (conSong().length <= 1) return ketThuc();
        return xemChung();
    }

    /** Mở ván kế (server gọi sau khi người chơi xem xong màn lật bài). */
    function vanKe(bayGio = Date.now()) {
        if (G.trangThai !== 'DANG_CHAY') return xemChung();
        if (V() && !['LAT', 'XONG'].includes(V().vong)) throw new Error('Ván hiện tại chưa xong');
        return vanMoi(bayGio);
    }

    function ketThuc() {
        G.trangThai = 'XONG';
        const conL = conSong();
        for (const p of conL) if (!G.thuTuChay.includes(p.id)) G.thuTuChay.push(p.id);
        return xemChung();
    }

    /** Thứ hạng: cháy sau cùng đứng trước. Trả [{hang, id, ten, chay}]. */
    function ketQua() {
        return G.thuTuChay.slice().reverse().map((id, i) => {
            const p = ai(id);
            return { hang: i + 1, id, ten: p.ten, chip: p.chip };
        });
    }

    // ---------------------------------------------------------------- xem
    /** Trạng thái chung, KHÔNG có bài riêng của ai. Đây là thứ an toàn để phát tán. */
    function xemChung() {
        const v = V();
        return {
            trangThai: G.trangThai, soVan: G.soVan,
            mucBlind: G.mucBlind + 1, blind: C.lichBlind[G.mucBlind], gioLenMuc: G.gioLenMuc,
            mucCuoiCung: G.mucBlind >= C.lichBlind.length - 1,
            // còn mấy ván nữa là hết vòng -> lên mức (web hiện cho người chơi biết)
            // phải tính cả SÀN, không thì bàn 4 người báo "còn 3 ván" trong khi thật ra còn 5
            vanConLai: Math.max(0, Math.max(conSong().length, C.vanToiThieuMoiMuc) - G.vanTuLenMuc),
            nutCai: G.nguoi[G.nutCai] ? G.nguoi[G.nutCai].id : null,
            nghi: G.nghi, nghiBoi: G.nghiBoi, tongNghiMs: G.tongNghiMs,
            // đề nghị nghỉ đang chờ: web vẽ nút "Đồng ý / Không" cho ai chưa bỏ phiếu
            xinNghi: G.nghiXin ? {
                boi: G.nghiXin.boi,
                dongY: [...G.nghiXin.dongY],
                conCho: nguoiBauCu().filter(x => !G.nghiXin.dongY.has(x)),
            } : null,
            nguoi: G.nguoi.map(p => ({
                id: p.id, ten: p.ten, chip: p.chip, ghe: p.ghe, afk: p.afk,
                conLuotXinNghi: !G.daXinNghi.has(p.id),
                daBo: v ? v.daBo.has(p.id) : false,
                cuoc: v && v.cuoc[p.id] !== undefined ? v.cuoc[p.id] : 0,
                trongVan: v ? v.thuTu.includes(p.id) : false,
                vuaLam: v && v.vuaLam[p.id] ? v.vuaLam[p.id] : null,   // 18/09: nhãn BỎ/XEM/THEO/TỐ/ALL-IN cho cả bàn thấy
            })),
            van: v ? {
                so: v.so, vong: v.vong, chung: v.chung.slice(),
                hu: Object.values(v.tongCuoc).reduce((a, b) => a + b, 0),
                muc: v.muc, toToiThieu: v.toToiThieu, luot: v.luot, hanChot: v.hanChot,
                sb: v.sb || null, bb: v.bb || null,   // ai đang là small/big blind ván này
                khoe: dangKhoe(),          // lá ai tự khoe cho cả bàn xem (tự hết sau 4 giây)
                daKhoe: Object.keys(v.khoe),
                ketQua: v.ketQua,
            } : null,
            ketQua: G.trangThai === 'XONG' ? ketQua() : null,
        };
    }

    /**
     * Trạng thái CHO RIÊNG 1 người: chỉ thêm bài của chính họ.
     * Bài người khác chỉ lộ ở màn lật bài (v.ketQua.lat) — server quyết, không phải client.
     */
    function xem(id) {
        const v = V();
        const s = xemChung();
        s.toi = {
            id,
            la: v && v.tay[id] ? v.tay[id].slice() : null,
            cham: v && v.tay[id] && v.chung.length >= 3
                ? B.chamBai([...v.tay[id], ...v.chung]) : null,
            toiLuot: v ? v.luot === id : false,
            canTheo: v && v.cuoc[id] !== undefined ? Math.max(0, v.muc - v.cuoc[id]) : 0,
            // trần all-in của chính mình (đã cược trong vòng này + chip còn lại),
            // để web vẽ đúng thanh kéo tố mà không phải tự đoán
            toiDa: v && v.cuoc[id] !== undefined && ai(id) ? v.cuoc[id] + ai(id).chip : 0,
        };
        // Đã cháy chưa, và cháy thì về hạng mấy. Thiếu hai số này thì web vẽ cho người
        // đã cháy cái thanh "đang chờ X" y như còn đang đánh — nhìn tưởng bị treo.
        const iChay = G.thuTuChay.indexOf(id);
        s.toi.daChay = !!(ai(id) && ai(id).chip <= 0 && iChay >= 0);
        s.toi.hang = iChay >= 0 ? G.nguoi.length - iChay : null;
        return s;
    }

    return {
        batDau, hanhDong, nhip, vanKe, ketQua, xem, xemChung,
        roiMang, noiLai,
        xinNghi, dongYNghi, tuChoiNghi, tamNghi, choiTiep, khoeBai,
        _trong: G, _cauHinh: C,
    };
}

module.exports = {
    taoGiai, taoLichBlind, LICH_BLIND_MAC_DINH, BB_DEP, CHIP_DAU, PHUT_MOI_MUC, GIAY_MOI_LUOT,
    VAN_TOI_THIEU_MOI_MUC, TOI_DA_NGUOI, TOI_THIEU_NGUOI, DOGCOIN_VAO_GIAI, GIAY_KHOE,
};
