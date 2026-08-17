// ===== BÀN BLACKJACK — lớp điều phối (bước 2/3) =====
//
// Quản lý MỘT bàn chung: 5 ghế, vòng cược, đồng hồ mỗi lượt, tự Dừng khi hết giờ,
// người bỏ đi giữa chừng, xáo bài, hoàn cược khi bot tắt giữa ván. Gọi engine
// (blackjack.js) để lo luật + tính tiền.
//
// Đồng hồ BƠM VÀO (deps.clock) để test được bằng đồng hồ giả — không phải chờ thật.
// Tiền: bàn tự trừ/cộng qua deps.addPoints; engine chỉ báo SỐ, không đụng ví.
//
// Luồng: idle → (ai đó đặt cược) betting 7s → playing (lần lượt theo ghế, 15s/lượt)
//        → nhà cái mở → result 6s → idle.

const BJ = require('./blackjack');

function createTable(deps) {
    const {
        clock, addPoints, getPoints, announce = () => { }, log = () => { },
        SEATS = 5, BET_WINDOW_MS = 7000, TURN_MS = 15000, RESULT_MS = 6000,
        MIN_BET = 1, MAX_BET = 0, // MAX_BET=0 = không giới hạn
    } = deps;

    const shoe = BJ.createShoe();
    const seats = Array.from({ length: SEATS }, () => null); // {userId, name, bet}
    let phase = 'idle';           // idle | betting | playing | result
    let deadline = 0;             // mốc ms cho betting / turn / result
    let round = null;             // engine round khi đang playing/result
    let charged = {};             // userId -> tổng đã trừ ván này (để hoàn khi restart)
    let extraCharged = {};        // userId -> phần double/split đã trừ (để chỉ trừ phần tăng thêm)
    let lastResult = null;        // giữ để hiện màn kết quả

    const seatOf = (userId) => seats.findIndex(s => s && s.userId === userId);
    const now = () => clock();

    function sit(userId, name, seatIdx) {
        if (seatIdx < 0 || seatIdx >= SEATS) return { error: 'Ghế không hợp lệ' };
        if (seats[seatIdx]) return { error: 'Ghế này có người ngồi rồi' };
        if (seatOf(userId) >= 0) return { error: 'Bạn đang ngồi ghế khác' };
        seats[seatIdx] = { userId, name, bet: 0 };
        return { ok: true, seat: seatIdx };
    }

    function leave(userId) {
        const i = seatOf(userId);
        if (i < 0) return { error: 'Bạn chưa ngồi bàn' };
        // Đang trong ván mà đã đặt cược thì không cho rời (tiền đang trong ván).
        if (phase === 'playing' && charged[userId]) return { error: 'Đang trong ván — chơi xong mới rời được' };
        // Chưa vào ván nhưng đã đặt cược chờ chia: hoàn lại rồi cho rời.
        if (seats[i].bet > 0 && phase === 'betting') { /* chưa trừ tiền, chỉ xoá cược */ }
        seats[i] = null;
        return { ok: true };
    }

    function bet(userId, amount) {
        const i = seatOf(userId);
        if (i < 0) return { error: 'Ngồi vào ghế trước đã' };
        if (phase === 'playing' || phase === 'result') return { error: 'Đang có ván — chờ ván sau nhé' };
        amount = Math.floor(Number(amount));
        if (!Number.isInteger(amount) || amount < MIN_BET) return { error: `Cược tối thiểu ${MIN_BET}` };
        if (MAX_BET > 0 && amount > MAX_BET) return { error: `Cược tối đa ${MAX_BET}` };
        if ((getPoints(userId) || 0) < amount) return { error: 'Không đủ Dogcoin' };
        seats[i].bet = amount;
        if (phase === 'idle') { phase = 'betting'; deadline = now() + BET_WINDOW_MS; }
        return { ok: true, betCloseIn: Math.max(0, deadline - now()) };
    }

    function clearBet(userId) {
        const i = seatOf(userId);
        if (i < 0 || phase !== 'betting') return { error: 'Không huỷ được lúc này' };
        seats[i].bet = 0;
        if (seats.every(s => !s || !s.bet)) { phase = 'idle'; deadline = 0; } // hết người cược
        return { ok: true };
    }

    function closeBetting() {
        const players = seats
            .map((s, idx) => s && s.bet > 0 ? { seat: idx, userId: s.userId, name: s.name, bet: s.bet } : null)
            .filter(Boolean); // đã đúng thứ tự ghế vì duyệt theo index
        if (!players.length) { phase = 'idle'; deadline = 0; return; }

        // Xáo bài nếu shoe mỏng — báo cho mọi người biết trước khi chia.
        if (shoe.lowBeforeRound()) { shoe.reshuffle(); announce('🔀 Bàn xáo lại bài (4 bộ)'); }

        // Trừ cược ngay khi chia (giống 3 game kia). Ghi lại để hoàn nếu bot tắt giữa ván.
        charged = {}; extraCharged = {};
        for (const p of players) { addPoints(p.userId, -p.bet); charged[p.userId] = p.bet; }

        round = BJ.startRound(players, shoe);
        phase = 'playing';
        deadline = now() + TURN_MS;
        // Ai cũng blackjack -> engine tự sang 'done' -> chốt luôn
        if (round.phase === 'done') return finishRound();
        // Trừ tiếp nếu ngay đầu ván có double/split (không có, nhưng cho chắc)
        applyExtraCharge();
    }

    // round.extraCharge[uid] là TỔNG luỹ kế tiền double/split của ván. Mỗi lần gọi chỉ
    // trừ thêm phần MỚI tăng so với lần trước (một ván tách/tụ nhiều lần vẫn trừ đúng).
    function applyExtraCharge() {
        if (!round) return;
        for (const [uid, total] of Object.entries(round.extraCharge)) {
            const prev = extraCharged[uid] || 0;
            if (total > prev) {
                addPoints(uid, -(total - prev));
                charged[uid] = (charged[uid] || 0) + (total - prev);
                extraCharged[uid] = total;
            }
        }
    }

    function act(userId, action) {
        if (phase !== 'playing' || !round) return { error: 'Chưa tới lúc đánh bài' };
        const r = BJ.act(round, userId, action, shoe);
        if (r.error) return r;
        applyExtraCharge();
        if (round.phase === 'done') finishRound();
        else deadline = now() + TURN_MS; // sang lượt mới, reset đồng hồ
        return { ok: true };
    }

    function forceStandTimeout() {
        const cur = BJ.actorAt(round);
        if (!cur) return;
        BJ.act(round, cur.s.userId, 'stand', shoe);
        applyExtraCharge();
        if (round.phase === 'done') finishRound();
        else deadline = now() + TURN_MS;
    }

    function finishRound() {
        // Trả thưởng
        for (const d of round.result) if (d.totalPayout > 0) addPoints(d.userId, d.totalPayout);
        lastResult = { dealer: BJ.view(round).dealer, result: round.result, at: now() };
        for (const d of round.result) {
            const net = d.totalPayout - (charged[d.userId] || 0);
            log('RESULT', `[BLACKJACK] ${d.name}: ${d.hands.map(h => h.outcome).join(',')} | net ${net >= 0 ? '+' : ''}${net}`);
        }
        charged = {}; extraCharged = {};
        // Xoá cược khỏi ghế: ván sau phải đặt lại
        for (const s of seats) if (s) s.bet = 0;
        phase = 'result';
        deadline = now() + RESULT_MS;
    }

    // Gọi mỗi giây bởi vòng lặp thật (hoặc đồng hồ giả trong test).
    function tick() {
        const t = now();
        if (phase === 'betting' && t >= deadline) closeBetting();
        else if (phase === 'playing' && t >= deadline) forceStandTimeout();
        else if (phase === 'result' && t >= deadline) { round = null; phase = 'idle'; deadline = 0; }
    }

    // Hoàn toàn bộ cược đã trừ của ván đang chơi — gọi khi bot chuẩn bị tắt.
    function refundOnShutdown() {
        if (phase !== 'playing') return 0;
        let n = 0;
        for (const [uid, amt] of Object.entries(charged)) { addPoints(uid, amt); n++; }
        if (n) log('SYSTEM', `[BLACKJACK] Hoàn cược ${n} người do bot tắt giữa ván`);
        charged = {};
        return n;
    }

    function view(userId) {
        const base = round ? BJ.view(round) : null;
        return {
            phase,
            timeLeft: deadline ? Math.max(0, Math.ceil((deadline - now()) / 1000)) : 0,
            seats: seats.map((s, i) => s ? { seat: i, userId: s.userId, name: s.name, bet: s.bet } : { seat: i, empty: true }),
            mySeat: seatOf(userId),
            table: base, // dealer + hands khi đang chơi
            lastResult: (phase === 'result' && lastResult) ? lastResult : null,
            reshuffleAt: BJ.RESHUFFLE_AT,
        };
    }

    return { sit, leave, bet, clearBet, act, tick, view, refundOnShutdown,
        _debug: () => ({ phase, deadline, seats, round, charged }) };
}

module.exports = { createTable };
