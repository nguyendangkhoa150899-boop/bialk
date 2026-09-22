// ============================================================================
//  ban.js — MÁY BÀN "SIÊU TÀI XỈU": vòng ván + tiền nong, gói gọn một chỗ.
//
//  Dựng theo đúng khuôn TienLen/web.js: một hàm taoBan(ctx) nhận mấy cửa đụng
//  ví/ghi log/lưu DB từ BotDoMin, rồi tự lo phần còn lại. index.js chỉ nối vào,
//  không phình thêm.
//
//  ── LUẬT TIỀN KHÔNG ĐƯỢC MẤT (chép đúng bài học đau của bàn Tài Xỉu thường) ──
//  Cược là tiền ĐÃ TRỪ KHỎI VÍ. Vì vậy:
//   · Chỗ nào xoá sổ cược đều phải gọi donSoCuoc() trước — ván đã quay thì trả
//     nốt theo bảng, ván chưa quay thì hoàn nguyên cược (KÈM phí).
//   · KHÔNG bao giờ dựng lại bảng trả tiền khi không tìm thấy bảng cũ (bảng mới
//     có cờ paid rỗng = trả hai lần cho cả bàn).
//   · Cờ paid ghi xuống đĩa NGAY, không để trong RAM.
//   · Bot bật lại giữa ván: hoàn cược theo _stxBets NHƯNG bỏ qua ai đã có phần
//     trong _stxPlan, kẻo vừa hoàn vừa trả.
//
//  ── PHÍ 20% ─────────────────────────────────────────────────────────────────
//  Đặt X thì trừ ví X + 20%. Thắng thì ăn trên X. Phí KHÔNG hoàn, kể cả khi huỷ
//  cược giữa chừng thì... KHÔNG: huỷ cược hoàn ĐỦ cả phí, vì ván chưa diễn ra.
//  Chỉ khi ván đã quay thì phí mới coi như đã thu.
// ============================================================================
'use strict';
const CUA = require('./cua.js');

// 3 mốc giờ mặc định — y bàn thường để người chơi khỏi phải học lại nhịp.
const BET_S_DEF = 30, NHAN_S_DEF = 4, NAN_S_DEF = 20;
const BET_S_MIN = 5, BET_S_MAX = 600;
const NHAN_S_MIN = 0, NHAN_S_MAX = 60;
const NAN_S_MIN = 6, NAN_S_MAX = 300;
const KQ_S = 4;              // giây cuối pha nặn: bàn tự mở kết quả
const HIST_N = 100;          // lịch sử giữ trong RAM
const HIST_WEB = 20;         // gửi xuống web
const SAN_CUOC = 1000;       // sàn cược mỗi ô

function taoBan(ctx) {
    const db = () => ctx.db();
    const nguoi = (id) => ctx.layNguoi(id) || {};
    const log = (d) => { try { ctx.ghiLog(d); } catch (e) { } };
    const luu = () => { try { ctx.luuDb(); } catch (e) { } };

    // ---------------------------------------------------------------- trạng thái
    const S = {
        gameId: 1, targetTime: 0, status: 'off',
        bets: [], nhan: null, nan: null, plan: null, history: [],
        vanTruoc: new Map(),      // giỏ ván trước của từng người (cho nút Đặt lại)
        dangChot: false,
        // nhip() là no-op cho tới khi khoiDong() cứu tiền ván dở xong. Không có cờ này
        // thì mấy giây đầu sau khi nạp file, nhip() tự mở ván / dọn sổ trước cả khoiDong().
        daKhoiDong: false,
    };

    // ---------------------------------------------------------------- cấu hình
    function gio() {
        const c = db()._stxTime || {};
        const b = Number(c.bet), h = Number(c.nhan), n = Number(c.nan);
        return {
            bet: Number.isFinite(b) && b >= BET_S_MIN && b <= BET_S_MAX ? Math.floor(b) : BET_S_DEF,
            nhan: Number.isFinite(h) && h >= NHAN_S_MIN && h <= NHAN_S_MAX ? Math.floor(h) : NHAN_S_DEF,
            nan: Number.isFinite(n) && n >= NAN_S_MIN && n <= NAN_S_MAX ? Math.floor(n) : NAN_S_DEF,
        };
    }
    const vanS = () => { const g = gio(); return g.bet + g.nhan + g.nan; };
    const khoaSoS = () => { const g = gio(); return g.nhan + g.nan; };

    function datGio(bet, nhan, nan) {
        bet = Math.floor(Number(bet)); nan = Math.floor(Number(nan));
        nhan = (nhan === undefined || nhan === null || nhan === '') ? gio().nhan : Math.floor(Number(nhan));
        if (!Number.isFinite(bet) || bet < BET_S_MIN || bet > BET_S_MAX) return { error: `Giây đặt cược phải từ ${BET_S_MIN} đến ${BET_S_MAX}` };
        if (!Number.isFinite(nhan) || nhan < NHAN_S_MIN || nhan > NHAN_S_MAX) return { error: `Giây hiện nhân phải từ ${NHAN_S_MIN} đến ${NHAN_S_MAX}` };
        if (!Number.isFinite(nan) || nan < NAN_S_MIN || nan > NAN_S_MAX) return { error: `Giây nặn phải từ ${NAN_S_MIN} đến ${NAN_S_MAX} (4 giây cuối là lúc bàn tự mở)` };
        db()._stxTime = { bet, nhan, nan }; luu();
        log(`[SIÊU TX] Đổi nhịp ván: ${bet}s đặt + ${nhan}s nhân + ${nan}s nặn = ván ${bet + nhan + nan}s`);
        return { ok: true, ...gio(), round: vanS(), kq: KQ_S };
    }

    const tranCfg = () => {
        const t = db()._stxTran;
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
            if (!Number.isFinite(n) || n < SAN_CUOC) return { error: `Trần nhóm ${CUA.NHOM_TRAN[k].ten} phải ≥ ${SAN_CUOC.toLocaleString('vi-VN')}` };
            moi[k] = n;
        }
        db()._stxTran = moi; luu();
        log(`[SIÊU TX] Đổi trần cược: ` + Object.keys(moi).map(k => k + ' ' + moi[k].toLocaleString('vi-VN')).join(' · '));
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
        const n = Number(db()._stxMaxBet);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 300000;
    };
    function datMaxBet(n) {
        n = Math.floor(Number(n));
        if (!Number.isFinite(n) || n < 0) return { error: 'Trần mỗi người phải ≥ 0 (0 = không giới hạn)' };
        db()._stxMaxBet = n; luu();
        log(`[SIÊU TX] Trần cược mỗi người mỗi ván: ${n ? n.toLocaleString('vi-VN') : 'KHÔNG giới hạn'}`);
        return { ok: true, maxBet: n };
    }

    // nhà cái ăn % + thang nhân: nạp lúc dựng bàn, admin chỉnh sau
    function napCauHinh() {
        const a = Number(db()._stxAn);
        if (Number.isFinite(a)) { const r = CUA.datMucAn(a); if (r.error) log(`[SIÊU TX] Mức ăn lưu trong DB sai, dùng mặc định: ${r.error}`); }
        const t = db()._stxThang;
        if (t && typeof t === 'object') { const r = CUA.datThang(t); if (r.error) { delete db()._stxThang; log(`[SIÊU TX] Thang nhân lưu trong DB sai, về mặc định: ${r.error}`); } }
    }
    function datMucAn(v) {
        const r = CUA.datMucAn(v);
        if (r.error) return r;
        db()._stxAn = r.an; luu();
        log(`[SIÊU TX] Nhà cái ăn ${(r.an * 100).toFixed(1)}% · người chơi thực nhận ${(r.rtpThuc * 100).toFixed(2)}% · ${r.oSangMoiVan.toFixed(1)} ô sáng/ván`);
        return r;
    }
    function datThang(bang) {
        const r = CUA.datThang(bang || CUA.thangMacDinh());
        if (r.error) return r;
        if (bang) db()._stxThang = r.thang; else delete db()._stxThang;
        luu();
        log(`[SIÊU TX] Đổi thang hệ số nhân · nhà cái ăn ${(r.anThuc * 100).toFixed(2)}% · ${r.oSangMoiVan.toFixed(1)} ô sáng/ván`);
        return r;
    }

    const batTat = () => !!db()._stxOn;
    function datBatTat(on) {
        db()._stxOn = !!on; luu();
        if (!db()._stxOn) { donSoCuoc('admin tắt bàn'); S.status = 'off'; S.nan = null; S.nhan = null; }
        else if (S.status === 'off') moVanMoi();
        log(`[SIÊU TX] ${db()._stxOn ? 'BẬT' : 'TẮT'} bàn`);
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
        if (!batTat()) return 'Bàn Siêu Tài Xỉu đang tắt';
        if (S.status !== 'betting') return S.status === 'nhan' ? '⚡ Đang hiện hệ số nhân - hết cửa đặt rồi!' : 'Đã khoá sổ - chờ ván sau!';
        return null;
    }

    /**
     * Đặt cả giỏ một lần. Kiểm HẾT rồi mới trừ tiền — không trừ nửa chừng.
     * Trừ ví = tiền cược + PHÍ 20%.
     */
    function dat(userId, ten, giohang) {
        const chan = dangNhanCuoc();
        if (chan) return { error: chan };
        if (!Array.isArray(giohang) || !giohang.length) return { error: 'Chưa xếp cược nào' };
        if (giohang.length > 60) return { error: 'Một lần đặt tối đa 60 ô' };

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

        for (const k of ds) if (gop[k] < SAN_CUOC) {
            return { error: `Mỗi cửa tối thiểu ${SAN_CUOC.toLocaleString('vi-VN')} Dogcoin (cửa ${CUA.THEO_ID[k].ten} mới ${gop[k].toLocaleString('vi-VN')})` };
        }
        const vi = nguoi(userId).points || 0;
        if (vi < tongTru) {
            return { error: `Không đủ Dogcoin! Cần ${tongTru.toLocaleString('vi-VN')} (đã gồm phí 20%), ví có ${vi.toLocaleString('vi-VN')}` };
        }
        const tran = tranCfg();
        for (const k of ds) {
            const tO = CUA.tranCua(k, tran), daCo = cuocOCua(userId, k);
            if (tO > 0 && daCo + gop[k] > tO) {
                return { error: `Cửa ${CUA.THEO_ID[k].ten} tối đa ${tO.toLocaleString('vi-VN')}/ván (trả tới ${CUA.tiLeToiDa(k)}:1)` + (daCo ? ` - đã đặt ${daCo.toLocaleString('vi-VN')}` : '') };
            }
        }
        const capTong = tranToiDaNguoi();
        if (capTong > 0 && tongCuocCua(userId) + tongCuoc > capTong) {
            return { error: `Giới hạn ${capTong.toLocaleString('vi-VN')} Dogcoin/người/ván - ván này bạn đã đặt ${tongCuocCua(userId).toLocaleString('vi-VN')}` };
        }

        // qua hết mới đụng ví
        ctx.congVi(userId, -tongTru, `Siêu Tài Xỉu ván #${S.gameId} (cược ${tongCuoc.toLocaleString('vi-VN')} + phí ${(tongTru - tongCuoc).toLocaleString('vi-VN')})`);
        for (const k of ds) S.bets.push({ userId, username: ten, choice: k, amount: gop[k], phi: CUA.tienPhi(gop[k]) });
        db()._stxBets = S.bets;   // ghi sổ NGAY, đừng chờ nhịp sau (đây là tiền đã trừ ví)
        // 🔔 báo cược cho chủ server (bot nối vào qua ctx.baoCuoc). Gửi hỏng KHÔNG được làm hỏng ván.
        if (ctx.baoCuoc) for (const k of ds) { try { ctx.baoCuoc(userId, ten, k, gop[k]); } catch (e) { } }
        log(`[SIÊU TX CƯỢC] ${ten} đặt ${tongCuoc.toLocaleString('vi-VN')} (+phí ${(tongTru - tongCuoc).toLocaleString('vi-VN')}) vào ${ds.length} cửa (ván #${S.gameId})`);
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

    /** Xoá cược: ván CHƯA quay nên hoàn ĐỦ cả phí. */
    function xoaCuoc(userId) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        let hoan = 0; const giu = [];
        for (const b of S.bets) {
            if (b.userId === userId) hoan += CUA.tienTru(b.amount);
            else giu.push(b);
        }
        if (hoan <= 0) return { error: 'Ván này bạn chưa đặt cửa nào' };
        S.bets = giu;
        db()._stxBets = S.bets;
        ctx.congVi(userId, hoan, `Siêu Tài Xỉu ván #${S.gameId} - xoá cược, hoàn cả phí`);
        log(`[SIÊU TX] ${nguoi(userId).name || userId} xoá cược ván #${S.gameId}, hoàn ${hoan.toLocaleString('vi-VN')} (gồm phí)`);
        return { ok: true, hoan, balance: nguoi(userId).points || 0 };
    }

    /** 🗑️ Huỷ cược ĐÚNG MỘT ô (thả chip vào vùng huỷ). Ván chưa quay → hoàn ĐỦ cả phí. */
    function xoaCua(userId, cua) {
        const chan = dangNhanCuoc(); if (chan) return { error: chan };
        cua = String(cua || '');
        if (!CUA.THEO_ID[cua]) return { error: 'Cửa không hợp lệ: ' + cua };
        let hoan = 0; const giu = [];
        for (const b of S.bets) {
            if (b.userId === userId && b.choice === cua) hoan += CUA.tienTru(b.amount);
            else giu.push(b);
        }
        if (hoan <= 0) return { error: 'Bạn chưa đặt gì ở cửa ' + CUA.THEO_ID[cua].ten };
        S.bets = giu;
        db()._stxBets = S.bets;
        ctx.congVi(userId, hoan, `Siêu Tài Xỉu ván #${S.gameId} - huỷ cược ô ${CUA.THEO_ID[cua].ten}, hoàn cả phí`);
        log(`[SIÊU TX] ${nguoi(userId).name || userId} huỷ cược ô ${CUA.THEO_ID[cua].ten} ván #${S.gameId}, hoàn ${hoan.toLocaleString('vi-VN')} (gồm phí)`);
        return { ok: true, hoan, cua, balance: nguoi(userId).points || 0 };
    }

    /**
     * 🔀 Dời toàn bộ tiền (kèm phần phí đã thu) từ ô `tu` sang ô `den` — kéo chip thả sang ô khác.
     * Không đi qua ví, tổng cược không đổi → chỉ phải kiểm TRẦN RIÊNG của ô đích. Kiểm xong mới đụng sổ.
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
            return { error: `Cửa ${CUA.THEO_ID[den].ten} tối đa ${tO.toLocaleString('vi-VN')}/ván (trả tới ${CUA.tiLeToiDa(den)}:1)` + (daCo ? ` - đã đặt ${daCo.toLocaleString('vi-VN')}` : '') + `, dời thêm ${tien.toLocaleString('vi-VN')} là vượt.` };
        }
        let phi = 0;
        S.bets = S.bets.filter(b => { if (b.userId === userId && b.choice === tu) { phi += (b.phi || 0); return false; } return true; });
        S.bets.push({ userId, username: ten || nguoi(userId).name || ('web_' + String(userId).slice(-4)), choice: den, amount: tien, phi });
        db()._stxBets = S.bets;
        log(`[SIÊU TX] ${ten || userId} dời ${tien.toLocaleString('vi-VN')} từ ${CUA.THEO_ID[tu].ten} sang ${CUA.THEO_ID[den].ten} (ván #${S.gameId})`);
        return { ok: true, tien, tu, den, balance: nguoi(userId).points || 0 };
    }

    // ---------------------------------------------------------------- chốt ván
    function lapKeHoach(gameId, bets, xx) {
        const bangNhan = (S.nhan && S.nhan.gameId === gameId) ? (S.nhan.o || {}) : {};
        const byUser = {}, cuaAgg = {};
        for (const b of bets) {
            const an = CUA.tinhTra(b.choice, b.amount, xx, bangNhan);
            if (!byUser[b.userId]) byUser[b.userId] = { name: b.username, stake: 0, phi: 0, win: 0 };
            const e = byUser[b.userId];
            e.stake += b.amount; e.phi += (b.phi || 0); e.win += an;
            const k = b.userId + '_' + b.choice;
            if (!cuaAgg[k]) cuaAgg[k] = { u: b.userId, name: b.username, choice: CUA.THEO_ID[b.choice].ten, amount: b.amount, phi: 0, nhan: 0 };
            else cuaAgg[k].amount += b.amount;
            // phí ghi theo từng ô: bảng Discord lấy đây để tính lãi/lỗ THẬT (cược + phí)
            cuaAgg[k].phi += (b.phi || 0);
            cuaAgg[k].nhan += an;
        }
        const plan = { gameId, dice: xx, byUser, paid: {}, cuaAgg: Object.values(cuaAgg), bangNhan };
        S.plan = plan; db()._stxPlan = plan;
        return plan;
    }
    function traNguoi(gameId, userId) {
        const p = S.plan;
        if (!p || p.gameId !== gameId) return null;
        const e = p.byUser[userId];
        if (!e || p.paid[userId]) return null;
        p.paid[userId] = true;
        if (db()._stxPlan && db()._stxPlan.gameId === p.gameId) {
            if (!db()._stxPlan.paid) db()._stxPlan.paid = {};
            db()._stxPlan.paid[userId] = true;
        }
        if (e.win > 0) ctx.congVi(userId, e.win, `Siêu Tài Xỉu ván #${gameId} thắng`);
        return { got: e.win, stake: e.stake, phi: e.phi, net: e.win - e.stake - e.phi };
    }
    /** Người chơi nặn xong -> trả riêng cho họ ngay. */
    function nanXong(userId) {
        const p = S.plan;
        if (!p) return { ok: true, net: 0, balance: nguoi(userId).points || 0 };
        const r = traNguoi(p.gameId, userId);
        const bal = nguoi(userId).points || 0;
        if (!r) return { ok: true, gameId: p.gameId, net: 0, balance: bal, already: true };
        return { ok: true, gameId: p.gameId, ...r, balance: bal };
    }

    /**
     * 🧯 Dọn sổ cược an toàn — MỌI chỗ xoá S.bets phải đi qua đây.
     * Ván đã quay: trả nốt theo bảng. Ván chưa quay: hoàn nguyên cược KÈM phí.
     */
    function donSoCuoc(lyDo) {
        let tra = 0, hoan = 0, tienHoan = 0;
        try {
            if (S.plan && S.plan.byUser) {
                for (const uid of Object.keys(S.plan.byUser)) if (traNguoi(S.plan.gameId, uid)) tra++;
                S.plan = null; delete db()._stxPlan;
            } else {
                for (const b of S.bets) {
                    if (!b || !b.userId || !(b.amount > 0)) continue;
                    const t = CUA.tienTru(b.amount);
                    ctx.congVi(b.userId, t, `Siêu Tài Xỉu - ${lyDo}, hoàn cả phí`);
                    hoan++; tienHoan += t;
                }
            }
        } catch (e) { log(`[LỖI DỌN SỔ SIÊU TX] ${lyDo}: ${e.message}`); }
        S.bets = []; db()._stxBets = [];
        if (tra || hoan) {
            log(`[DỌN SỔ SIÊU TX] ${lyDo}: ` + (tra ? `trả nốt cho ${tra} người` : '') + (hoan ? `hoàn ${hoan} phiếu (${tienHoan.toLocaleString('vi-VN')} gồm phí)` : ''));
            luu();
        }
        return { tra, hoan, tienHoan };
    }

    function ghiSo(gameId, bets, xx, p) {
        const tong = CUA.tongXx(xx), bao = CUA.laBao(xx);
        const trung = new Set(CUA.cuaThang(xx));
        const nh = {};
        for (const k of Object.keys(p.bangNhan || {})) if (trung.has(k)) nh[k] = p.bangNhan[k];
        const winners = Object.keys(p.byUser).filter(u => p.byUser[u].win > 0)
            .map(u => ({ u, name: p.byUser[u].name, amount: p.byUser[u].win }));
        const h = {
            gameId, dice: xx.slice(), sum: tong, storm: bao,
            tx: bao ? 'BÃO' : (tong >= 11 ? 'TÀI' : 'XỈU'),
            cl: bao ? 'BÃO' : (tong % 2 === 0 ? 'CHẴN' : 'LẺ'),
            bets: p.cuaAgg, winners, nhan: nh,
            time: new Date().toLocaleTimeString('vi-VN'),
        };
        S.history.unshift(h);
        if (S.history.length > HIST_N) S.history.pop();
        db()._stxHist = S.history.slice(0, HIST_WEB);
        log(`[SIÊU TX KẾT QUẢ] Ván #${gameId}: ${xx.join('-')} (Tổng ${tong} | ${h.tx}${bao ? '' : ' | ' + h.cl})`);
    }

    function chotVan(gameId, bets) {
        const r = () => require('crypto').randomInt(1, 7);
        let xx;
        const ep = db()._stxEp;
        if (Array.isArray(ep) && ep.length === 3 && ep.every(v => v >= 1 && v <= 6)) {
            xx = ep.map(v => Math.floor(v)); delete db()._stxEp; luu();
            log(`[SIÊU TX] Ván #${gameId} dùng kết quả ADMIN ÉP: ${xx.join('-')}`);
        } else xx = [r(), r(), r()];

        // nhớ giỏ ván này cho nút Đặt lại
        S.vanTruoc.clear();
        for (const b of bets) {
            const g = S.vanTruoc.get(b.userId) || {};
            g[b.choice] = (g[b.choice] || 0) + b.amount;
            S.vanTruoc.set(b.userId, g);
        }
        const p = lapKeHoach(gameId, bets, xx);
        S.nan = { gameId, dice: xx, thang: CUA.cuaThang(xx) };
        return { xx, p };
    }

    function traHet(gameId, bets, xx, p) {
        for (const uid of Object.keys(p.byUser)) {
            try { traNguoi(gameId, uid); } catch (e) { log(`[LỖI TRẢ TIỀN SIÊU TX] ván #${gameId} người ${uid}: ${e.message}`); }
        }
        try { ghiSo(gameId, bets, xx, p); }
        catch (e) { log(`[LỖI GHI SỔ SIÊU TX] ván #${gameId}: ${e.message} - tiền ĐÃ trả xong`); }
        S.plan = null; delete db()._stxPlan; db()._stxBets = []; luu();
    }

    function moVanMoi() {
        S.gameId++;
        S.targetTime = Math.floor(Date.now() / 1000) + vanS();
        S.status = 'betting';
        S.bets = []; S.nhan = null; S.nan = null;
        db()._stxGameId = S.gameId;
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
            const nanTime = S.targetTime - g.nan;
            const lockTime = nanTime - g.nhan;

            if (now >= S.targetTime) {
                S.dangChot = true;
                try {
                    if (S.nan && S.plan && S.plan.gameId === S.gameId) {
                        traHet(S.gameId, S.bets.slice(), S.nan.dice, S.plan);
                    } else {
                        // Lỡ mốc chốt (máy kẹt) -> ván không quay được, HOÀN cược
                        const r = donSoCuoc('lỡ mốc chốt ván #' + S.gameId);
                        if (r.hoan) log(`[SIÊU TX] Ván #${S.gameId} lỡ mốc, đã hoàn ${r.hoan} phiếu`);
                    }
                } finally {
                    S.nan = null; S.nhan = null;
                    moVanMoi();
                    S.dangChot = false;
                }
                return;
            }
            if (now >= nanTime && S.status === 'nhan') {
                S.status = 'nan';
                const { xx } = chotVan(S.gameId, S.bets.slice());
                void xx;
                return;
            }
            if (now >= lockTime && S.status === 'betting') {
                S.status = 'nhan';
                S.nhan = { gameId: S.gameId, o: CUA.taoNhan(), luc: Date.now() };
                const soO = Object.keys(S.nhan.o).length;
                log(`[SIÊU TX] Ván #${S.gameId} khoá sổ - sáng ${soO} ô nhân`);
                return;
            }
        } catch (e) {
            log(`[LỖI VÒNG VÁN SIÊU TX] ${e.message}`);
            try { donSoCuoc('lỗi vòng ván #' + S.gameId); } catch (e2) { }
            S.nan = null; S.nhan = null; S.dangChot = false;
            moVanMoi();
        }
        // giữ sổ cược trên đĩa để restart còn biết đường hoàn
        db()._stxBets = S.bets;
    }

    // ---------------------------------------------------------------- lúc bot bật lại
    function khoiDong() {
        napCauHinh();
        const gid = Number(db()._stxGameId);
        if (Number.isFinite(gid) && gid > 0) S.gameId = Math.floor(gid);
        if (Array.isArray(db()._stxHist)) S.history = db()._stxHist.slice(0, HIST_N);

        // ⚠️ Hai đường cứu tiền KHÔNG được giẫm chân nhau: ai đã có phần trong bảng
        // trả tiền thì KHÔNG hoàn cược nữa (hoàn nữa là vừa hoàn vừa trả).
        const keHoach = (db()._stxPlan && db()._stxPlan.byUser) ? db()._stxPlan.byUser : null;
        const cuoc = Array.isArray(db()._stxBets) ? db()._stxBets : [];
        let hoan = 0, tien = 0, boQua = 0;
        for (const b of cuoc) {
            if (!b || !b.userId || !(b.amount > 0)) continue;
            if (keHoach && keHoach[b.userId]) { boQua++; continue; }
            const t = CUA.tienTru(b.amount);
            ctx.congVi(b.userId, t, 'Siêu Tài Xỉu - hoàn cược ván dở trước khi bot bật lại');
            hoan++; tien += t;
        }
        if (hoan) log(`[SIÊU TX] Bật lại: hoàn ${hoan} phiếu (${tien.toLocaleString('vi-VN')} gồm phí)`);
        if (boQua) log(`[SIÊU TX] Bật lại: bỏ qua ${boQua} khoản đã có trong bảng trả tiền (tránh trả kép)`);

        if (keHoach) {
            S.plan = db()._stxPlan; if (!S.plan.paid) S.plan.paid = {};
            let n = 0;
            for (const uid of Object.keys(keHoach)) if (traNguoi(S.plan.gameId, uid)) n++;
            if (n) log(`[SIÊU TX] Bật lại giữa ván #${S.plan.gameId} - trả nốt ${n} người`);
            S.plan = null; delete db()._stxPlan;
        }
        db()._stxBets = []; S.bets = []; luu();
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
        // ai đang đặt ván này — gộp theo người + cửa (giống bàn thường)
        const who = {};
        for (const b of S.bets) {
            const k = b.userId + '_' + b.choice;
            if (!who[k]) who[k] = { u: b.userId, name: b.username, choice: b.choice, amount: 0 };
            who[k].amount += b.amount;
        }
        const trung = (h) => {
            const nh = h.nhan || {};
            if (!Array.isArray(h.dice) || h.dice.length !== 3) return {};
            const t = new Set(CUA.cuaThang(h.dice)); const r = {};
            for (const k of Object.keys(nh)) if (t.has(k)) r[k] = nh[k];
            return r;
        };
        return {
            on: batTat(),
            phase: !batTat() ? 'off' : (S.status === 'betting' ? 'bet' : (S.status === 'nhan' ? 'nhan' : (S.nan ? 'nan' : 'wait'))),
            gameId: S.gameId,
            targetTime: S.targetTime,
            now: Math.floor(Date.now() / 1000),
            khoaSoS: khoaSoS(),
            kqS: KQ_S,
            phi: CUA.PHI,
            sanCuoc: SAN_CUOC,
            cua: CUA.DS.map(c => ({ id: c.id, ten: c.ten, nhom: c.nhom, goc: c.goc, max: CUA.tiLeToiDa(c.id) })),
            tran: tranCfg(),
            maxBet: tranToiDaNguoi(),
            nhan: (S.nhan && S.nhan.gameId === S.gameId && S.status !== 'betting') ? S.nhan.o : null,
            nan: (S.status === 'nan' && S.nan) ? { gameId: S.nan.gameId, dice: S.nan.dice, thang: S.nan.thang } : null,
            myBets: Object.keys(my).map(k => ({ choice: k, amount: my[k] })).sort((a, b) => b.amount - a.amount),
            phiToi,
            totals,
            coVanTruoc: coVanTruoc(userId),
            betsList: Object.values(who),
            history: S.history.slice(0, HIST_WEB).map(h => ({ ...h, nhan: trung(h) })),
        };
    }

    // ---------------------------------------------------------------- admin đọc
    function adminXem() {
        const agg = {};
        for (const b of S.bets) agg[b.choice] = (agg[b.choice] || 0) + b.amount;
        return {
            on: batTat(), gameId: S.gameId, status: S.status, targetTime: S.targetTime,
            secsToBet: Math.max(0, S.targetTime - khoaSoS() - Math.floor(Date.now() / 1000)),
            time: { ...gio(), round: vanS(), kq: KQ_S },
            tran: tranCfg(), thangToiDa: thangToiDaNhom(tranCfg()),
            tenNhom: Object.fromEntries(Object.keys(CUA.NHOM_TRAN).map(k => [k, CUA.NHOM_TRAN[k].ten])),
            maxBet: tranToiDaNguoi(),
            rtp: CUA.thongKe(), thang: CUA.thangHienTai(),
            betAgg: agg, tenCua: Object.fromEntries(CUA.DS.map(c => [c.id, c.ten])),
            bets: S.bets.map(b => ({ name: b.username, choice: b.choice, amount: b.amount })),
            ep: db()._stxEp || null,
            epGoiY: timEpReNhat(), betsCount: S.bets.length,
        };
    }
    /**
     * 📋 Dữ liệu cho BẢNG DISCORD. Tách khỏi adminXem (panel hỏi 3 giây/lần, không cần
     * lịch sử) và khỏi trangThai (của riêng từng người chơi).
     */
    function bangDiscord(soVan) {
        return {
            on: batTat(), gameId: S.gameId, status: S.status, targetTime: S.targetTime,
            khoaSoS: khoaSoS(), phi: CUA.PHI, maxBet: tranToiDaNguoi(), sanCuoc: SAN_CUOC,
            bets: S.bets.map(b => ({ u: b.userId, name: b.username, choice: b.choice, tenCua: CUA.THEO_ID[b.choice].ten, amount: b.amount })),
            // ván trống chỉ tổ chiếm chỗ trên bảng — lịch sử đầy đủ vẫn nằm trong _stxHist
            history: S.history.filter(h => (h.bets || []).length).slice(0, soVan || 10),
        };
    }

    function epKetQua(a, b, c) {
        const v = [a, b, c].map(x => Math.floor(Number(x)));
        if (v.some(x => !Number.isFinite(x) || x < 1 || x > 6)) return { error: 'Mỗi viên phải từ 1 đến 6' };
        db()._stxEp = v; luu();
        log(`[SIÊU TX] Admin ép kết quả ván sau: ${v.join('-')}`);
        return { ok: true, ep: v };
    }
    /** ↩️ Huỷ ép: ván sau lại quay ngẫu nhiên. */
    function huyEp() {
        const co = Array.isArray(db()._stxEp);
        delete db()._stxEp; luu();
        if (co) log('[SIÊU TX] Admin HUỶ ép kết quả ván sau');
        return { ok: true, daHuy: co };
    }
    /**
     * 🎯 Gợi ý ép: duyệt đủ 216 kết cục bằng LÕI TIỀN, tìm bộ ba nhà cái TRẢ ÍT NHẤT với sổ
     * cược hiện tại. Đã khoá sổ (có bảng nhân của ván) thì tính theo bảng đó. Panel bấm là lấy
     * thẳng, không tự đoán ở trình duyệt — y bàn thường (txTimEpReNhat).
     */
    function timEpReNhat() {
        const nhan = (S.nhan && S.nhan.gameId === S.gameId) ? (S.nhan.o || null) : null;
        const tongDat = S.bets.reduce((s, b) => s + b.amount, 0);
        let re = null;
        for (const x of CUA.MOI_KET_QUA) {
            let tra = 0;
            for (const b of S.bets) tra += CUA.tinhTra(b.choice, b.amount, x, nhan);
            if (!re || tra < re.tra) re = { dice: x.slice(), tra };
        }
        return re ? { ...re, tongDat, soCuoc: S.bets.length } : { dice: [1, 2, 3], tra: 0, tongDat: 0, soCuoc: 0 };
    }

    return {
        nhip, khoiDong, trangThai, adminXem, bangDiscord,
        dat, nhanDoi, datLai, xoaCuoc, xoaCua, doiCua, nanXong,
        datGio, datTran, datMaxBet, datMucAn, datThang, datBatTat, epKetQua, huyEp, timEpReNhat,
        thangMacDinh: () => CUA.thangMacDinh(),
        cuaThang: (xx) => CUA.cuaThang(xx),
        _S: S,
    };
}

module.exports = { taoBan, CUA, KQ_S, SAN_CUOC };
