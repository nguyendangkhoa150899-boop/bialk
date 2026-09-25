// ============================================================================
//  ban.js, MÁY BÀN "ROULETTE": vòng ván + tiền nong, gói gọn một chỗ.
//
//  Dựng theo đúng khuôn SieuTaiXiu/ban.js: một hàm taoBan(ctx) nhận mấy cửa đụng
//  ví/ghi log/lưu DB từ BotDoMin, rồi tự lo phần còn lại. index.js chỉ nối vào.
//
//  ── NHỊP VÁN (chủ server chốt 25/09) ─────────────────────────────────────────
//     bet  15s  bi đứng yên, nhận cược
//     quay  5s  bi được hút lên vành ngoài và chạy, VẪN nhận cược
//     roi  14s  KHOÁ SỔ. +2s hiện hệ số nhân. Bi rơi vào ô ở giây thứ 11, 3 giây cuối
//               khoe kết quả. Hết 10s là trả tiền, mở ván mới.
//  Kết quả và hệ số nhân được CHỐT NGAY LÚC KHOÁ SỔ (không phải lúc bi rơi), vì
//  web cần biết ô đích để vẽ bi lăn đúng vào ô đó. Đã khoá sổ nên lộ sớm không sao.
//
//  ── LUẬT TIỀN KHÔNG ĐƯỢC MẤT (chép đúng bài học đau của bàn Tài Xỉu) ──────────
//   · Cược là tiền ĐÃ TRỪ KHỎI VÍ. Chỗ nào xoá sổ cược đều phải gọi donSoCuoc()
//     trước: ván đã chốt thì trả nốt theo bảng, chưa chốt thì hoàn cược KÈM phí.
//   · KHÔNG bao giờ dựng lại bảng trả tiền khi không tìm thấy bảng cũ.
//   · Cờ paid ghi xuống đĩa NGAY.
//   · Bot bật lại giữa ván: hoàn cược theo _rlBets NHƯNG bỏ qua ai đã có phần
//     trong _rlPlan, kẻo vừa hoàn vừa trả.
//   · Hoàn tiền dùng b.phi ĐÃ GHI trên phiếu, không tính lại: phí suy từ mức
//     nhà cái ăn, admin đổi mức giữa ván thì tính lại sẽ hoàn sai.
// ============================================================================
'use strict';
const CUA = require('./cua.js');

const BET_S_DEF = 15, QUAY_S_DEF = 5, ROI_S_DEF = 14;   // roi 10 -> 14 (chủ server 25/09: "thêm 4 giây quay")
const BET_S_MIN = 5, BET_S_MAX = 600;
const QUAY_S_MIN = 0, QUAY_S_MAX = 60;
const ROI_S_MIN = 6, ROI_S_MAX = 60;
const NHAN_TRE_S = 2;        // hiện hệ số nhân sau khi khoá sổ bao lâu (web đọc để canh)
const KQ_S = 3;              // 3 giây cuối pha rơi: bi đã nằm trong ô, khoe kết quả
const HIST_N = 100;          // lịch sử giữ trong RAM (kể cả ván trống)
const HIST_WEB = 20;         // gửi xuống web (dải kết quả cho người chơi)
const HIST_CUOC_N = 100;     // ván CÓ CƯỢC giữ riêng, ván trống không đẩy đi được
const SAN_CUOC = 1000;       // sàn cược mỗi ô
const MAX_O_MOT_LAN = 80;    // 154 cửa, một lần gửi giỏ tối đa nhiêu ô

function taoBan(ctx) {
    const db = () => ctx.db();
    const nguoi = (id) => ctx.layNguoi(id) || {};
    const log = (d) => { try { ctx.ghiLog(d); } catch (e) { } };
    const luu = () => { try { ctx.luuDb(); } catch (e) { } };
    const vn = (n) => Number(n).toLocaleString('vi-VN');

    // ---------------------------------------------------------------- trạng thái
    const S = {
        gameId: 1, targetTime: 0, status: 'off',
        bets: [], nhan: null, kq: null, plan: null, history: [], hisCuoc: [],
        vanTruoc: new Map(),
        dangChot: false,
        daKhoiDong: false,
    };

    // ---------------------------------------------------------------- cấu hình
    function gio() {
        const c = db()._rlTime || {};
        const b = Number(c.bet), q = Number(c.quay), r = Number(c.roi);
        return {
            bet: Number.isFinite(b) && b >= BET_S_MIN && b <= BET_S_MAX ? Math.floor(b) : BET_S_DEF,
            quay: Number.isFinite(q) && q >= QUAY_S_MIN && q <= QUAY_S_MAX ? Math.floor(q) : QUAY_S_DEF,
            roi: Number.isFinite(r) && r >= ROI_S_MIN && r <= ROI_S_MAX ? Math.floor(r) : ROI_S_DEF,
        };
    }
    const vanS = () => { const g = gio(); return g.bet + g.quay + g.roi; };

    function datGio(bet, quay, roi) {
        bet = Math.floor(Number(bet)); quay = Math.floor(Number(quay)); roi = Math.floor(Number(roi));
        if (!Number.isFinite(bet) || bet < BET_S_MIN || bet > BET_S_MAX) return { error: `Giây đặt cược phải từ ${BET_S_MIN} đến ${BET_S_MAX}` };
        if (!Number.isFinite(quay) || quay < QUAY_S_MIN || quay > QUAY_S_MAX) return { error: `Giây bi chạy (vẫn nhận cược) phải từ ${QUAY_S_MIN} đến ${QUAY_S_MAX}` };
        if (!Number.isFinite(roi) || roi < ROI_S_MIN || roi > ROI_S_MAX) return { error: `Giây khoá sổ tới lúc trả tiền phải từ ${ROI_S_MIN} đến ${ROI_S_MAX} (3 giây cuối là khoe kết quả)` };
        db()._rlTime = { bet, quay, roi }; luu();
        log(`[ROULETTE] Đổi nhịp ván: ${bet}s đặt + ${quay}s bi chạy + ${roi}s khoá = ván ${bet + quay + roi}s`);
        return { ok: true, ...gio(), round: vanS(), kq: KQ_S, nhanTre: NHAN_TRE_S };
    }

    const tranCfg = () => {
        const t = db()._rlTran;
        const mac = CUA.tranMacDinh();
        if (!t || typeof t !== 'object') return mac;
        const r = { ...mac };
        for (const k of Object.keys(mac)) { const n = Number(t[k]); if (Number.isFinite(n) && n > 0) r[k] = Math.floor(n); }
        return r;
    };
    function datTran(bang) {
        if (!bang || typeof bang !== 'object') return { error: 'Thiếu bảng trần' };
        const mac = CUA.tranMacDinh(), moi = { ...tranCfg() };
        for (const k of Object.keys(bang)) {
            if (!(k in mac)) return { error: 'Không có nhóm trần "' + k + '"' };
            const n = Math.floor(Number(bang[k]));
            if (!Number.isFinite(n) || n < SAN_CUOC) return { error: `Trần nhóm ${CUA.NHOM_TRAN[k].ten} phải ≥ ${vn(SAN_CUOC)}` };
            moi[k] = n;
        }
        db()._rlTran = moi; luu();
        log(`[ROULETTE] Đổi trần cược: ` + Object.keys(moi).map(k => k + ' ' + vn(moi[k])).join(' · '));
        return { ok: true, tran: moi, thangToiDa: thangToiDaNhom(moi) };
    }
    function thangToiDaNhom(tran) {
        const r = {};
        for (const k of Object.keys(tran)) {
            const cua = CUA.DS.filter(c => c.nhom === k);
            r[k] = Math.max(...cua.map(c => tran[k] * CUA.tiLeToiDa(c.id)));
        }
        return r;
    }

    const tranToiDaNguoi = () => {
        const n = Number(db()._rlMaxBet);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 300000;
    };
    function datMaxBet(n) {
        n = Math.floor(Number(n));
        if (!Number.isFinite(n) || n < 0) return { error: 'Trần mỗi người phải ≥ 0 (0 = không giới hạn)' };
        db()._rlMaxBet = n; luu();
        log(`[ROULETTE] Trần cược mỗi người mỗi ván: ${n ? vn(n) : 'KHÔNG giới hạn'}`);
        return { ok: true, maxBet: n };
    }

    function napCauHinh() {
        const a = Number(db()._rlAn);
        if (Number.isFinite(a)) { const r = CUA.datMucAn(a); if (r.error) log(`[ROULETTE] Mức ăn lưu trong DB sai, dùng mặc định: ${r.error}`); }
        const t = db()._rlThang;
        if (t && typeof t === 'object') { const r = CUA.datThang(t); if (r.error) { delete db()._rlThang; log(`[ROULETTE] Thang nhân lưu trong DB sai, về mặc định: ${r.error}`); } }
        const st = db()._rlSet;
        if (Array.isArray(st)) { const r = CUA.datKhoangSet(st); if (r.error) { delete db()._rlSet; log(`[ROULETTE] Bảng số ô sét lưu trong DB sai, về mặc định: ${r.error}`); } }
    }
    /** Bảng SỐ Ô SÉT mỗi ván (admin): [[số ô, độ hiếm], ...]. null = về mặc định. */
    function datKhoangSet(bang) {
        const r = CUA.datKhoangSet(bang || CUA.setMacDinh());
        if (r.error) return r;
        if (bang) db()._rlSet = r.set; else delete db()._rlSet;
        luu();
        log(`[ROULETTE] Đổi bảng số ô sét: ${r.set.map(b => b[0] + '×' + b[1]).join(', ')} · trung bình ${r.oSangMoiVan.toFixed(1)} ô/ván`);
        return r;
    }
    function datMucAn(v) {
        const r = CUA.datMucAn(v);
        if (r.error) return r;
        db()._rlAn = r.an; luu();
        log(`[ROULETTE] Nhà cái ăn ${(r.an * 100).toFixed(1)}% · phí ${(r.phi * 100).toFixed(2)}% · ${r.oSangMoiVan.toFixed(1)} số sét/ván`);
        return r;
    }
    function datThang(bang) {
        const r = CUA.datThang(bang || CUA.thangMacDinh());
        if (r.error) return r;
        if (bang) db()._rlThang = r.thang; else delete db()._rlThang;
        luu();
        log(`[ROULETTE] Đổi thang hệ số nhân · nhà cái ăn ${(r.anThuc * 100).toFixed(2)}% · ${r.oSangMoiVan.toFixed(1)} số sét/ván`);
        return r;
    }

    const batTat = () => !!db()._rlOn;
    function datBatTat(on) {
        db()._rlOn = !!on; luu();
        if (!db()._rlOn) { donSoCuoc('admin tắt bàn'); S.status = 'off'; S.kq = null; S.nhan = null; }
        else if (S.status === 'off') moVanMoi();
        log(`[ROULETTE] ${db()._rlOn ? 'BẬT' : 'TẮT'} bàn`);
        return { ok: true, on: batTat() };
    }

    // ---------------------------------------------------------------- tiền
    function cuocCuaToi(userId) {
        const g = {};
        for (const b of S.bets) if (b.userId === userId) g[b.choice] = (g[b.choice] || 0) + b.amount;
        return g;
    }
    const tongCuocCua = (userId) => S.bets.reduce((s, b) => s + (b.userId === userId ? b.amount : 0), 0);
    const cuocOCua = (userId, cua) => S.bets.reduce((s, b) => s + (b.userId === userId && b.choice === cua ? b.amount : 0), 0);

    function dangNhanCuoc() {
        if (!batTat()) return 'Bàn Roulette đang tắt';
        if (S.status !== 'betting') return 'Đã khoá sổ, bi đang rơi - chờ ván sau!';
        return null;
    }

    /** Đặt cả giỏ một lần. Kiểm HẾT rồi mới trừ tiền. Trừ ví = tiền cược + phí. */
    function dat(userId, ten, giohang) {
        const chan = dangNhanCuoc();
        if (chan) return { error: chan };
        if (!Array.isArray(giohang) || !giohang.length) return { error: 'Chưa xếp cược nào' };
        if (giohang.length > MAX_O_MOT_LAN) return { error: `Một lần đặt tối đa ${MAX_O_MOT_LAN} ô` };

        const gop = {};
        for (const g of giohang) {
            const cua = String(g.choice || '');
            const tien = Math.floor(Number(g.amount));
            if (!CUA.THEO_ID[cua]) return { error: 'Cửa không hợp lệ: ' + cua };
            if (!Number.isFinite(tien) || tien <= 0) return { error: 'Số tiền không hợp lệ' };
            gop[cua] = (gop[cua] || 0) + tien;
        }
        const ds = Object.keys(gop);
        const tongCuoc = ds.reduce((s, k) => s + gop[k], 0);
        const tongTru = ds.reduce((s, k) => s + CUA.tienTru(gop[k]), 0);
        const phiPt = (CUA.phiSuat() * 100).toFixed(2) + '%';

        for (const k of ds) if (gop[k] < SAN_CUOC) {
            return { error: `Mỗi cửa tối thiểu ${vn(SAN_CUOC)} Dogcoin (cửa ${CUA.THEO_ID[k].ten} mới ${vn(gop[k])})` };
        }
        const vi = nguoi(userId).points || 0;
        if (vi < tongTru) {
            return { error: `Không đủ Dogcoin! Cần ${vn(tongTru)} (đã gồm phí ${phiPt}), ví có ${vn(vi)}` };
        }
        const tran = tranCfg();
        for (const k of ds) {
            const tO = CUA.tranCua(k, tran), daCo = cuocOCua(userId, k);
            if (tO > 0 && daCo + gop[k] > tO) {
                return { error: `Cửa ${CUA.THEO_ID[k].ten} tối đa ${vn(tO)}/ván (trả tới ${CUA.tiLeToiDa(k)}:1)` + (daCo ? ` - đã đặt ${vn(daCo)}` : '') };
            }
        }
        const capTong = tranToiDaNguoi();
        if (capTong > 0 && tongCuocCua(userId) + tongCuoc > capTong) {
            return { error: `Giới hạn ${vn(capTong)} Dogcoin/người/ván - ván này bạn đã đặt ${vn(tongCuocCua(userId))}` };
        }

        // qua hết mới đụng ví
        ctx.congVi(userId, -tongTru, `Roulette ván #${S.gameId} (cược ${vn(tongCuoc)} + phí ${vn(tongTru - tongCuoc)})`);
        for (const k of ds) S.bets.push({ userId, username: ten, choice: k, amount: gop[k], phi: CUA.tienPhi(gop[k]) });
        db()._rlBets = S.bets;   // ghi sổ NGAY: đây là tiền đã trừ ví
        if (ctx.baoCuoc) for (const k of ds) { try { ctx.baoCuoc(userId, ten, k, gop[k]); } catch (e) { } }
        log(`[ROULETTE CƯỢC] ${ten} đặt ${vn(tongCuoc)} (+phí ${vn(tongTru - tongCuoc)}) vào ${ds.length} cửa (ván #${S.gameId})`);
        return { ok: true, tong: tongCuoc, phi: tongTru - tongCuoc, truVi: tongTru, soCua: ds.length, balance: nguoi(userId).points || 0 };
    }

    function nhanDoi(userId, ten) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        const cur = cuocCuaToi(userId); const ks = Object.keys(cur);
        if (!ks.length) return { error: 'Ván này bạn chưa đặt cửa nào để nhân đôi' };
        return dat(userId, ten, ks.map(k => ({ choice: k, amount: cur[k] })));
    }
    function datLai(userId, ten) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        const cu = S.vanTruoc.get(userId);
        if (!cu || !Object.keys(cu).length) return { error: 'Chưa có ván trước để đặt lại' };
        if (Object.keys(cuocCuaToi(userId)).length) return { error: 'Ván này bạn đã đặt rồi - bấm 🗑️ Xoá cược trước nếu muốn xếp y ván trước' };
        return dat(userId, ten, Object.keys(cu).map(k => ({ choice: k, amount: cu[k] })));
    }
    const coVanTruoc = (userId) => { const c = S.vanTruoc.get(userId); return !!(c && Object.keys(c).length); };

    // Hoàn theo phiếu: vốn + phí ĐÃ GHI. Không tính lại phí vì mức ăn có thể đã đổi.
    const tienHoanPhieu = (b) => Math.floor(b.amount) + Math.floor(b.phi || 0);

    /** Xoá cược: ván CHƯA chốt nên hoàn ĐỦ cả phí. */
    function xoaCuoc(userId) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        let hoan = 0; const giu = [];
        for (const b of S.bets) {
            if (b.userId === userId) hoan += tienHoanPhieu(b);
            else giu.push(b);
        }
        if (hoan <= 0) return { error: 'Ván này bạn chưa đặt cửa nào' };
        S.bets = giu;
        db()._rlBets = S.bets;
        ctx.congVi(userId, hoan, `Roulette ván #${S.gameId} - xoá cược, hoàn cả phí`);
        log(`[ROULETTE] ${nguoi(userId).name || userId} xoá cược ván #${S.gameId}, hoàn ${vn(hoan)} (gồm phí)`);
        return { ok: true, hoan, balance: nguoi(userId).points || 0 };
    }

    /** 🗑️ Huỷ cược ĐÚNG MỘT ô (thả chip vào vùng huỷ). Ván chưa chốt → hoàn ĐỦ cả phí. */
    function xoaCua(userId, cua) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        cua = String(cua || '');
        if (!CUA.THEO_ID[cua]) return { error: 'Cửa không hợp lệ: ' + cua };
        let hoan = 0; const giu = [];
        for (const b of S.bets) {
            if (b.userId === userId && b.choice === cua) hoan += tienHoanPhieu(b);
            else giu.push(b);
        }
        if (hoan <= 0) return { error: 'Bạn chưa đặt gì ở cửa ' + CUA.THEO_ID[cua].ten };
        S.bets = giu;
        db()._rlBets = S.bets;
        ctx.congVi(userId, hoan, `Roulette ván #${S.gameId} - huỷ cược ô ${CUA.THEO_ID[cua].ten}, hoàn cả phí`);
        log(`[ROULETTE] ${nguoi(userId).name || userId} huỷ cược ô ${CUA.THEO_ID[cua].ten} ván #${S.gameId}, hoàn ${vn(hoan)} (gồm phí)`);
        return { ok: true, hoan, cua, balance: nguoi(userId).points || 0 };
    }

    /**
     * 🔀 Dời toàn bộ tiền (kèm phần phí đã thu) từ ô `tu` sang ô `den`. Không đi qua ví,
     * chỉ phải kiểm TRẦN RIÊNG của ô đích. Kiểm xong mới đụng sổ.
     */
    function doiCua(userId, ten, tu, den) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        tu = String(tu || ''); den = String(den || '');
        if (!CUA.THEO_ID[tu]) return { error: 'Cửa không hợp lệ: ' + tu };
        if (!CUA.THEO_ID[den]) return { error: 'Cửa không hợp lệ: ' + den };
        if (tu === den) return { error: 'Thả lại đúng ô cũ - không dời' };
        const tien = cuocOCua(userId, tu);
        if (tien <= 0) return { error: 'Bạn chưa đặt gì ở cửa ' + CUA.THEO_ID[tu].ten };
        const tO = CUA.tranCua(den, tranCfg()), daCo = cuocOCua(userId, den);
        if (tO > 0 && daCo + tien > tO) {
            return { error: `Cửa ${CUA.THEO_ID[den].ten} tối đa ${vn(tO)}/ván (trả tới ${CUA.tiLeToiDa(den)}:1)` + (daCo ? ` - đã đặt ${vn(daCo)}` : '') + `, dời thêm ${vn(tien)} là vượt.` };
        }
        let phi = 0;
        S.bets = S.bets.filter(b => { if (b.userId === userId && b.choice === tu) { phi += (b.phi || 0); return false; } return true; });
        S.bets.push({ userId, username: ten || nguoi(userId).name || ('web_' + String(userId).slice(-4)), choice: den, amount: tien, phi });
        db()._rlBets = S.bets;
        log(`[ROULETTE] ${ten || userId} dời ${vn(tien)} từ ${CUA.THEO_ID[tu].ten} sang ${CUA.THEO_ID[den].ten} (ván #${S.gameId})`);
        return { ok: true, tien, tu, den, balance: nguoi(userId).points || 0 };
    }

    // ---------------------------------------------------------------- chốt ván
    function lapKeHoach(gameId, bets, so) {
        const bangNhan = (S.nhan && S.nhan.gameId === gameId) ? (S.nhan.o || {}) : {};
        const byUser = {}, cuaAgg = {};
        for (const b of bets) {
            const an = CUA.tinhTra(b.choice, b.amount, so, bangNhan);
            if (!byUser[b.userId]) byUser[b.userId] = { name: b.username, stake: 0, phi: 0, win: 0 };
            const e = byUser[b.userId];
            e.stake += b.amount; e.phi += (b.phi || 0); e.win += an;
            const k = b.userId + '_' + b.choice;
            if (!cuaAgg[k]) cuaAgg[k] = { u: b.userId, name: b.username, choice: CUA.THEO_ID[b.choice].ten, cua: b.choice, amount: b.amount, phi: 0, nhan: 0 };
            else cuaAgg[k].amount += b.amount;
            cuaAgg[k].phi += (b.phi || 0);
            cuaAgg[k].nhan += an;
        }
        const plan = { gameId, so, byUser, paid: {}, cuaAgg: Object.values(cuaAgg), bangNhan };
        S.plan = plan; db()._rlPlan = plan;
        return plan;
    }
    function traNguoi(gameId, userId) {
        const p = S.plan;
        if (!p || p.gameId !== gameId) return null;
        const e = p.byUser[userId];
        if (!e || p.paid[userId]) return null;
        p.paid[userId] = true;
        if (db()._rlPlan && db()._rlPlan.gameId === p.gameId) {
            if (!db()._rlPlan.paid) db()._rlPlan.paid = {};
            db()._rlPlan.paid[userId] = true;
        }
        if (e.win > 0) ctx.congVi(userId, e.win, `Roulette ván #${gameId} thắng`);
        return { got: e.win, stake: e.stake, phi: e.phi, net: e.win - e.stake - e.phi };
    }

    /** 🧯 Dọn sổ cược an toàn, MỌI chỗ xoá S.bets phải đi qua đây. */
    function donSoCuoc(lyDo) {
        let tra = 0, hoan = 0, tienHoan = 0;
        try {
            if (S.plan && S.plan.byUser) {
                for (const uid of Object.keys(S.plan.byUser)) if (traNguoi(S.plan.gameId, uid)) tra++;
                S.plan = null; delete db()._rlPlan;
            } else {
                for (const b of S.bets) {
                    if (!b || !b.userId || !(b.amount > 0)) continue;
                    const t = tienHoanPhieu(b);
                    ctx.congVi(b.userId, t, `Roulette - ${lyDo}, hoàn cả phí`);
                    hoan++; tienHoan += t;
                }
            }
        } catch (e) { log(`[LỖI DỌN SỔ ROULETTE] ${lyDo}: ${e.message}`); }
        S.bets = []; db()._rlBets = [];
        if (tra || hoan) {
            log(`[DỌN SỔ ROULETTE] ${lyDo}: ` + (tra ? `trả nốt cho ${tra} người` : '') + (hoan ? `hoàn ${hoan} phiếu (${vn(tienHoan)} gồm phí)` : ''));
            luu();
        }
        return { tra, hoan, tienHoan };
    }

    function ghiSo(gameId, so, p) {
        const trung = new Set(CUA.cuaAnNhan(so, p.bangNhan || {}));
        const nh = {};
        for (const k of Object.keys(p.bangNhan || {})) if (trung.has(k)) nh[k] = p.bangNhan[k];
        const winners = Object.keys(p.byUser).filter(u => p.byUser[u].win > 0)
            .map(u => ({ u, name: p.byUser[u].name, amount: p.byUser[u].win }));
        const h = {
            gameId, so, mau: so === 0 ? 'x' : (CUA.laDo(so) ? 'r' : 'd'),
            bets: p.cuaAgg, winners, nhan: nh, nhanBoc: p.bangNhan || {},
            time: new Date().toLocaleTimeString('vi-VN'),
        };
        S.history.unshift(h);
        if (S.history.length > HIST_N) S.history.pop();
        db()._rlHist = S.history.slice(0, HIST_N);
        if ((h.bets || []).length) {
            S.hisCuoc.unshift(h);
            if (S.hisCuoc.length > HIST_CUOC_N) S.hisCuoc.pop();
            db()._rlHistCuoc = S.hisCuoc;
        }
        const dongNguoi = Object.values(p.byUser || {}).map(e => {
            const net = (e.win || 0) - (e.stake || 0) - (e.phi || 0);
            return `${e.name} đặt ${vn(e.stake || 0)} (+phí ${vn(e.phi || 0)}) → ${net >= 0 ? '+' : ''}${vn(net)}`;
        });
        const setKe = Object.keys(p.bangNhan || {}).map(k => k.slice(1) + ' x' + p.bangNhan[k]).join(', ');
        log(`[ROULETTE KẾT QUẢ] Ván #${gameId}: ra ${so}${setKe ? ' · số sét: ' + setKe : ''}`
            + (dongNguoi.length ? ' · ' + dongNguoi.join(' · ') : ' · không ai đặt'));
    }

    /** Khoá sổ: bốc số sét + chốt kết quả NGAY, lập bảng trả tiền. */
    function chotVan(gameId, bets) {
        let so;
        const ep = db()._rlEp;
        if (Number.isInteger(ep) && ep >= 0 && ep <= 36) {
            so = ep; delete db()._rlEp; luu();
            log(`[ROULETTE] Ván #${gameId} dùng kết quả ADMIN ÉP: ${so}`);
        } else so = require('crypto').randomInt(0, 37);

        S.nhan = { gameId, o: apEpNhan(CUA.taoNhan()), luc: Date.now() };
        S.vanTruoc.clear();
        for (const b of bets) {
            const g = S.vanTruoc.get(b.userId) || {};
            g[b.choice] = (g[b.choice] || 0) + b.amount;
            S.vanTruoc.set(b.userId, g);
        }
        const p = lapKeHoach(gameId, bets, so);
        S.kq = { gameId, so, thang: CUA.cuaThang(so) };
        const soO = Object.keys(S.nhan.o).length;
        log(`[ROULETTE] Ván #${gameId} khoá sổ - ${soO} số sét - kết quả ${so}`);
        return { so, p };
    }

    function traHet(gameId, so, p) {
        for (const uid of Object.keys(p.byUser)) {
            try { traNguoi(gameId, uid); } catch (e) { log(`[LỖI TRẢ TIỀN ROULETTE] ván #${gameId} người ${uid}: ${e.message}`); }
        }
        try { ghiSo(gameId, so, p); }
        catch (e) { log(`[LỖI GHI SỔ ROULETTE] ván #${gameId}: ${e.message} - tiền ĐÃ trả xong`); }
        S.plan = null; delete db()._rlPlan; db()._rlBets = []; luu();
    }

    function moVanMoi() {
        S.gameId++;
        S.targetTime = Math.floor(Date.now() / 1000) + vanS();
        S.status = 'betting';
        S.bets = []; S.nhan = null; S.kq = null;
        db()._rlGameId = S.gameId;
    }

    // ---------------------------------------------------------------- nhịp 1 giây
    function nhip() {
        if (!S.daKhoiDong) return;
        try {
            if (!batTat()) { if (S.status !== 'off') S.status = 'off'; return; }
            if (S.status === 'off') { moVanMoi(); return; }
            if (S.dangChot) return;

            const now = Math.floor(Date.now() / 1000);
            const g = gio();
            const lockTime = S.targetTime - g.roi;

            if (now >= S.targetTime) {
                S.dangChot = true;
                try {
                    if (S.kq && S.plan && S.plan.gameId === S.gameId) {
                        traHet(S.gameId, S.kq.so, S.plan);
                    } else {
                        const r = donSoCuoc('lỡ mốc chốt ván #' + S.gameId);
                        if (r.hoan) log(`[ROULETTE] Ván #${S.gameId} lỡ mốc, đã hoàn ${r.hoan} phiếu`);
                    }
                } finally {
                    S.kq = null; S.nhan = null;
                    moVanMoi();
                    S.dangChot = false;
                }
                return;
            }
            if (now >= lockTime && S.status === 'betting') {
                S.status = 'roi';
                chotVan(S.gameId, S.bets.slice());
                return;
            }
        } catch (e) {
            log(`[LỖI VÒNG VÁN ROULETTE] ${e.message}`);
            try { donSoCuoc('lỗi vòng ván #' + S.gameId); } catch (e2) { }
            S.kq = null; S.nhan = null; S.dangChot = false;
            moVanMoi();
        }
        db()._rlBets = S.bets;
    }

    // ---------------------------------------------------------------- lúc bot bật lại
    function khoiDong() {
        napCauHinh();
        const gid = Number(db()._rlGameId);
        if (Number.isFinite(gid) && gid > 0) S.gameId = Math.floor(gid);
        if (Array.isArray(db()._rlHist)) S.history = db()._rlHist.slice(0, HIST_N);
        if (Array.isArray(db()._rlHistCuoc)) S.hisCuoc = db()._rlHistCuoc.slice(0, HIST_CUOC_N);
        else S.hisCuoc = S.history.filter(h => (h.bets || []).length).slice(0, HIST_CUOC_N);

        const keHoach = (db()._rlPlan && db()._rlPlan.byUser) ? db()._rlPlan.byUser : null;
        const cuoc = Array.isArray(db()._rlBets) ? db()._rlBets : [];
        let hoan = 0, tien = 0, boQua = 0;
        for (const b of cuoc) {
            if (!b || !b.userId || !(b.amount > 0)) continue;
            if (keHoach && keHoach[b.userId]) { boQua++; continue; }
            const t = tienHoanPhieu(b);
            ctx.congVi(b.userId, t, 'Roulette - hoàn cược ván dở trước khi bot bật lại');
            hoan++; tien += t;
        }
        if (hoan) log(`[ROULETTE] Bật lại: hoàn ${hoan} phiếu (${vn(tien)} gồm phí)`);
        if (boQua) log(`[ROULETTE] Bật lại: bỏ qua ${boQua} khoản đã có trong bảng trả tiền (tránh trả kép)`);

        if (keHoach) {
            S.plan = db()._rlPlan; if (!S.plan.paid) S.plan.paid = {};
            let n = 0;
            for (const uid of Object.keys(keHoach)) if (traNguoi(S.plan.gameId, uid)) n++;
            if (n) log(`[ROULETTE] Bật lại giữa ván #${S.plan.gameId} - trả nốt ${n} người`);
            S.plan = null; delete db()._rlPlan;
        }
        db()._rlBets = []; S.bets = []; luu();
        if (batTat()) moVanMoi(); else S.status = 'off';
        S.daKhoiDong = true;
    }

    // ---------------------------------------------------------------- web đọc
    function trangThai(userId) {
        const g = gio();
        const my = {}; let phiToi = 0;
        for (const b of S.bets) if (b.userId === userId) { my[b.choice] = (my[b.choice] || 0) + b.amount; phiToi += (b.phi || 0); }
        const totals = {};
        for (const b of S.bets) totals[b.choice] = (totals[b.choice] || 0) + b.amount;
        const who = {};
        for (const b of S.bets) {
            const k = b.userId + '_' + b.choice;
            if (!who[k]) who[k] = { u: b.userId, name: b.username, choice: b.choice, amount: 0 };
            who[k].amount += b.amount;
        }
        const now = Math.floor(Date.now() / 1000);
        const lockTime = S.targetTime - g.roi;
        return {
            on: batTat(),
            phase: !batTat() ? 'off' : (S.status === 'betting' ? 'bet' : 'roi'),
            // bi đang chạy chưa? (mấy giây cuối pha đặt, vẫn nhận cược)
            biChay: S.status === 'betting' && now >= lockTime - g.quay,
            gameId: S.gameId,
            targetTime: S.targetTime,
            lockTime,
            now,
            gio: { ...g, kq: KQ_S, nhanTre: NHAN_TRE_S },
            phi: CUA.phiSuat(),
            sanCuoc: SAN_CUOC,
            tran: tranCfg(),
            maxBet: tranToiDaNguoi(),
            // khoá sổ rồi mới gửi số sét + kết quả xuống (web tự canh 2 giây rồi mới hiện nhân)
            nhan: (S.nhan && S.nhan.gameId === S.gameId && S.status !== 'betting') ? S.nhan.o : null,
            kq: (S.status === 'roi' && S.kq) ? { gameId: S.kq.gameId, so: S.kq.so } : null,
            myBets: Object.keys(my).map(k => ({ choice: k, amount: my[k] })).sort((a, b) => b.amount - a.amount),
            phiToi,
            totals,
            coVanTruoc: coVanTruoc(userId),
            betsList: Object.values(who),
            history: S.history.slice(0, HIST_WEB).map(h => ({
                gameId: h.gameId, so: h.so, mau: h.mau, nhan: h.nhan || {}, nhanBoc: h.nhanBoc || {},
                bets: h.bets || [], winners: h.winners || [], time: h.time,
            })),
        };
    }

    // ---------------------------------------------------------------- admin đọc
    function adminXem() {
        const agg = {};
        for (const b of S.bets) agg[b.choice] = (agg[b.choice] || 0) + b.amount;
        const g = gio();
        return {
            on: batTat(), gameId: S.gameId, status: S.status, targetTime: S.targetTime,
            secsToLock: Math.max(0, S.targetTime - g.roi - Math.floor(Date.now() / 1000)),
            time: { ...g, round: vanS(), kq: KQ_S, nhanTre: NHAN_TRE_S },
            tran: tranCfg(), thangToiDa: thangToiDaNhom(tranCfg()),
            tenNhom: Object.fromEntries(Object.keys(CUA.NHOM_TRAN).map(k => [k, CUA.NHOM_TRAN[k].ten])),
            maxBet: tranToiDaNguoi(),
            rtp: CUA.thongKe(), thang: CUA.thangHienTai(), set: CUA.setHienTai(),
            betAgg: agg, tenCua: Object.fromEntries(CUA.DS.map(c => [c.id, c.ten])),
            bets: S.bets.map(b => ({ name: b.username, choice: b.choice, amount: b.amount })),
            ep: Number.isInteger(db()._rlEp) ? db()._rlEp : null,
            epNhan: db()._rlEpNhan || null, epNhanKhoang: khoangEp(),
            nhanHienTai: (S.nhan && S.nhan.gameId === S.gameId) ? S.nhan.o : null,
            kq: S.kq ? { gameId: S.kq.gameId, so: S.kq.so } : null,
            epGoiY: timEpReNhat(), betsCount: S.bets.length,
            hisCuoc: S.hisCuoc.slice(0, 30),
        };
    }

    // ---------------------------------------------------------------- ✋ ÉP
    /** Khoảng ép hệ số nhân của số đơn: (29+1) → bậc cao nhất thang đang chạy. */
    function khoangEp() {
        const bac = (CUA.thangHienTai().so) || [];
        const cao = bac.reduce((m, b) => Math.max(m, Math.floor(Number(b[0])) || 0), 0);
        const goc = CUA.SO_GOC;
        return { min: goc + 1, max: cao > goc + 1 ? cao : goc + 1 };
    }
    /** Áp lệnh ép số sét của admin lên bảng vừa bốc. DÙNG MỘT LẦN rồi xoá. */
    function apEpNhan(o) {
        const ep = db()._rlEpNhan;
        if (!ep || typeof ep !== 'object') return o;
        const ke = [];
        for (const id of Object.keys(ep)) {
            if (!CUA.THEO_ID[id] || CUA.THEO_ID[id].nhom !== 'so') continue;
            const v = ep[id];
            if (v === undefined || v === null || v === '') continue;
            const n = Math.floor(Number(v));
            if (n === 0) { delete o[id]; ke.push(CUA.THEO_ID[id].ten + ' TẮT'); }
            else if (n > 1) { o[id] = n; ke.push(CUA.THEO_ID[id].ten + ' x' + n); }
        }
        delete db()._rlEpNhan; luu();
        if (ke.length) log(`[ROULETTE] Ván #${S.gameId} ÁP LỆNH ÉP SỐ SÉT của admin: ${ke.join(' · ')}`);
        return o;
    }
    /**
     * Đặt lệnh ép số sét cho lần khoá sổ tới. map = { s7: 100, s12: 0, s3: '' }
     *   số > 1 -> ép đúng hệ số đó  ·  0 -> TẮT ô (không sét)  ·  rỗng -> máy tự bốc
     */
    function epNhan(map) {
        if (!map || typeof map !== 'object') return { error: 'Thiếu bảng ép số sét' };
        const ra = {}; const ke = [];
        const { min, max } = khoangEp();
        for (const id of Object.keys(map)) {
            const c = CUA.THEO_ID[id];
            if (!c) return { error: 'Cửa không hợp lệ: ' + id };
            if (c.nhom !== 'so') return { error: c.ten + ': chỉ SỐ ĐƠN mới có số sét' };
            const v = map[id];
            if (v === undefined || v === null || v === '') continue;
            const n = Math.floor(Number(v));
            if (!Number.isFinite(n) || n < 0) return { error: c.ten + ': hệ số phải là số ≥ 0 (0 = tắt ô)' };
            if (n > 0 && (n < min || n > max)) {
                return { error: c.ten + ': x' + n + ' ngoài khoảng - ép được từ x' + min + ' đến x' + max + ' (hoặc 0 để TẮT). Muốn cao hơn thì nâng thang trước.' };
            }
            ra[id] = n; ke.push(c.ten + (n === 0 ? ' TẮT' : ' x' + n));
        }
        if (!ke.length) return { error: 'Chưa chọn ô nào - để trống hết thì có gì mà ép' };
        db()._rlEpNhan = ra; luu();
        const ngay = S.status === 'betting';
        log(`[ROULETTE] Admin ép số sét (${ngay ? 'ván #' + S.gameId : 'ván sau'}): ${ke.join(' · ')}`);
        return { ok: true, epNhan: ra, min, max, ngay, gameId: S.gameId };
    }
    function huyEpNhan() {
        const co = !!db()._rlEpNhan;
        delete db()._rlEpNhan; luu();
        if (co) log('[ROULETTE] Admin HUỶ ép số sét');
        return { ok: true, daHuy: co };
    }
    function epKetQua(so) {
        so = Math.floor(Number(so));
        if (!Number.isFinite(so) || so < 0 || so > 36) return { error: 'Số phải từ 0 đến 36' };
        db()._rlEp = so; luu();
        const ngay = S.status === 'betting';
        log(`[ROULETTE] Admin ép kết quả (${ngay ? 'ván #' + S.gameId : 'ván sau'}): ${so}`);
        return { ok: true, ep: so, ngay, gameId: S.gameId };
    }
    function huyEp() {
        const co = Number.isInteger(db()._rlEp);
        delete db()._rlEp; luu();
        if (co) log('[ROULETTE] Admin HUỶ ép kết quả');
        return { ok: true, daHuy: co };
    }
    /** 🎯 Gợi ý: duyệt 37 số bằng LÕI TIỀN, tìm số nhà cái TRẢ ÍT NHẤT với sổ cược hiện tại. */
    function timEpReNhat() {
        const nhan = (S.nhan && S.nhan.gameId === S.gameId) ? (S.nhan.o || null) : null;
        const tongDat = S.bets.reduce((s, b) => s + b.amount, 0);
        let re = null;
        for (const x of CUA.MOI_KET_QUA) {
            let tra = 0;
            for (const b of S.bets) tra += CUA.tinhTra(b.choice, b.amount, x, nhan);
            if (!re || tra < re.tra) re = { so: x, tra };
        }
        return re ? { ...re, tongDat, soCuoc: S.bets.length } : { so: 0, tra: 0, tongDat: 0, soCuoc: 0 };
    }

    return {
        nhip, khoiDong, trangThai, adminXem,
        dat, nhanDoi, datLai, xoaCuoc, xoaCua, doiCua,
        datGio, datTran, datMaxBet, datMucAn, datThang, datKhoangSet, datBatTat,
        epKetQua, huyEp, timEpReNhat, epNhan, huyEpNhan,
        thangMacDinh: () => CUA.thangMacDinh(),
        _S: S,
    };
}

module.exports = { taoBan, CUA, KQ_S, NHAN_TRE_S, SAN_CUOC };
