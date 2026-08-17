// ===== ENGINE BLACKJACK (xì dách) — thuần logic, KHÔNG dính Discord/web =====
//
// Đây chỉ là "bộ luật + bộ bài": chia bài, tính điểm, xử lý Hit/Stand/Double/Split,
// cho nhà cái đánh, tính thưởng. Toàn bộ chuyện ghế ngồi, đồng hồ đếm giờ, người bỏ
// đi giữa chừng, bảng Discord, giao diện web... nằm ở lớp điều phối (index.js) gọi vào
// đây. Tách ra vậy để test được từng nước bài mà không cần dựng cả bot.
//
// TIỀN: engine KHÔNG tự cộng/trừ ví. Nó chỉ trả về số cược cần trừ (lúc chia) và bảng
// thưởng (lúc kết thúc). Lớp gọi tự updatePoints — giống 3 game kia.
//
// Luật áp dụng (chuẩn casino phổ biến, hợp server nhỏ):
//   - 4 bộ bài (208 lá). Xáo lại khi còn dưới 1/2 shoe (báo trước cho người chơi).
//   - Blackjack (2 lá = 21) trả 3:2. Thắng thường 1:1. Hoà (push) trả lại cược.
//   - Nhà cái rút tới khi đủ 17, DỪNG Ở MỌI 17 (kể cả 17 mềm — luật "S17", lợi người chơi).
//   - Double: chỉ khi 2 lá đầu, nhân đôi cược, rút ĐÚNG 1 lá rồi tự dừng.
//   - Split: 2 lá đầu cùng HẠNG, tách thành 2 tay, mỗi tay cược bằng cược gốc.
//         Tách Át thì mỗi tay chỉ được rút thêm ĐÚNG 1 lá (luật phổ biến).
//         Không cho tách lại lần nữa (giữ đơn giản, tránh đệ quy vô hạn).

const RANK_NAME = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const NUM_DECKS = 4;
const RESHUFFLE_AT = 0.5;   // còn dưới 50% shoe thì xáo lại
const BLACKJACK_PAYS = 1.5; // 3:2

// ---- bộ bài / shoe ----
function buildShoe() {
    const cards = [];
    for (let d = 0; d < NUM_DECKS; d++)
        for (let s = 0; s < 4; s++)
            for (let r = 1; r <= 13; r++) cards.push({ r, s });
    return cards;
}
// Xáo Fisher–Yates. rng bơm vào được để test lặp lại; mặc định Math.random.
function shuffle(cards, rng = Math.random) {
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

function createShoe(rng = Math.random) {
    let cards = shuffle(buildShoe(), rng);
    return {
        rng,
        get remaining() { return cards.length; },
        total: NUM_DECKS * 52,
        // Trả true nếu shoe đã mỏng, lớp gọi dựa vào đây để báo "đang xáo bài".
        lowBeforeRound() { return cards.length < NUM_DECKS * 52 * RESHUFFLE_AT; },
        reshuffle() { cards = shuffle(buildShoe(), rng); },
        draw() {
            if (!cards.length) cards = shuffle(buildShoe(), rng); // cạn giữa ván: nạp bộ mới (hiếm)
            return cards.pop();
        },
    };
}

// ---- tính điểm ----
const cardValue = (c) => (c.r >= 10 ? 10 : (c.r === 1 ? 11 : c.r));
function handValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) { total += cardValue(c); if (c.r === 1) aces++; }
    // hạ Át từ 11 xuống 1 khi bị quá 21
    let soft = aces > 0;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    soft = aces > 0 && total <= 21; // còn Át đang tính là 11
    return { total, soft, bust: total > 21 };
}
const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
const cardStr = (c) => RANK_NAME[c.r] + SUITS[c.s];

// ---- một ván ----
// players: [{userId, name, bet}] — những người ĐÃ đặt cược ở ghế của mình.
// Trả về round state; caller đã trừ `bet` của mỗi người TRƯỚC khi gọi (an toàn kiểu
// 3 game kia). Split/Double sẽ trừ THÊM và trả về trong `extraCharge` để caller trừ tiếp.
function startRound(players, shoe) {
    const seats = players.map((p, i) => ({
        seat: i, userId: p.userId, name: p.name, baseBet: p.bet,
        hands: [{ cards: [], bet: p.bet, done: false, doubled: false, fromSplit: false, splitAces: false }],
        hi: 0, // tay đang chơi
    }));
    const dealer = { cards: [], hidden: true };

    // chia 2 vòng: mỗi người 1 lá, nhà cái 1 lá, lặp lại
    for (let round = 0; round < 2; round++) {
        for (const s of seats) s.hands[0].cards.push(shoe.draw());
        dealer.cards.push(shoe.draw());
    }

    const round = { seats, dealer, phase: 'playing', turnPtr: -1, extraCharge: {} };

    // Ai có blackjack tự nhiên thì tay đó xong luôn.
    for (const s of seats) if (isBlackjack(s.hands[0].cards)) s.hands[0].done = true;

    advanceTurn(round);                     // đặt lượt vào tay đầu tiên còn chơi được
    if (round.turnPtr === -1) finishToDealer(round, shoe); // ai cũng BJ -> nhà cái mở luôn
    return round;
}

// Danh sách lượt: đi từng ghế, trong ghế đi từng tay (phục vụ split).
function* handIterator(round) {
    for (const s of round.seats)
        for (let h = 0; h < s.hands.length; h++) yield { s, h };
}
function advanceTurn(round) {
    const order = [...handIterator(round)];
    let start = round.turnPtr + 1;
    for (let i = start; i < order.length; i++) {
        const { s, h } = order[i];
        if (!s.hands[h].done) { round.turnPtr = i; return; }
    }
    round.turnPtr = -1; // hết người chơi
}
function actorAt(round) {
    if (round.turnPtr < 0) return null;
    const order = [...handIterator(round)];
    const cur = order[round.turnPtr];
    if (!cur) return null;
    return cur;
}

const MAX_SPLIT_HANDS = 4; // mỗi ghế tối đa 4 tay (tách được 3 lần)

// Các nước được phép cho tay đang tới lượt.
function options(round) {
    const cur = actorAt(round);
    if (!cur) return [];
    const hand = cur.s.hands[cur.h];
    const opts = ['hit', 'stand'];
    const twoCards = hand.cards.length === 2;
    // Double: 2 lá đầu, cả tay gốc lẫn tay sau khi tách. Tách Át (chỉ 1 lá) không double.
    if (twoCards && !hand.splitAces) opts.push('double');
    if (twoCards && s2Splittable(cur.s, hand)) opts.push('split');
    return opts;
}
function s2Splittable(seat, hand) {
    return hand.cards.length === 2
        && !hand.splitAces                                       // không tách lại Át
        && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) // cùng giá trị (10=J=Q=K)
        && seat.hands.length < MAX_SPLIT_HANDS;                  // còn được tách tiếp
}

// Thực hiện một nước. Trả {ok} hoặc {error}. Với double/split, ghi thêm tiền cần trừ
// vào round.extraCharge[userId] để caller trừ ví.
function act(round, userId, action, shoe) {
    const cur = actorAt(round);
    if (!cur) return { error: 'Chưa tới lượt ai' };
    if (cur.s.userId !== userId) return { error: 'Chưa tới lượt bạn' };
    const seat = cur.s, hand = seat.hands[cur.h];
    if (!options(round).includes(action)) return { error: 'Nước đi không hợp lệ' };

    if (action === 'hit') {
        hand.cards.push(shoe.draw());
        const v = handValue(hand.cards);
        if (v.bust || v.total === 21) { hand.done = true; advanceTurn(round); }
        return afterAct(round, shoe);
    }
    if (action === 'stand') {
        hand.done = true; advanceTurn(round);
        return afterAct(round, shoe);
    }
    if (action === 'double') {
        hand.bet *= 2; hand.doubled = true;
        round.extraCharge[userId] = (round.extraCharge[userId] || 0) + seat.baseBet; // trừ thêm 1 lần cược gốc
        hand.cards.push(shoe.draw());
        hand.done = true; advanceTurn(round);
        return afterAct(round, shoe);
    }
    if (action === 'split') {
        const moved = hand.cards.pop();                     // tách 1 lá sang tay mới
        const acesSplit = hand.cards[0].r === 1;
        const newHand = { cards: [moved], bet: seat.baseBet, done: false, doubled: false, fromSplit: true, splitAces: acesSplit };
        hand.fromSplit = true; hand.splitAces = acesSplit;
        round.extraCharge[userId] = (round.extraCharge[userId] || 0) + seat.baseBet; // tay thứ 2 = thêm 1 cược gốc
        // chèn tay mới ngay sau tay hiện tại
        seat.hands.splice(cur.h + 1, 0, newHand);
        // mỗi tay rút thêm 1 lá cho đủ 2 lá
        hand.cards.push(shoe.draw());
        newHand.cards.push(shoe.draw());
        // Tách Át: mỗi tay chỉ 1 lá thêm rồi dừng luôn (luật phổ biến)
        if (acesSplit) {
            hand.done = true; newHand.done = true;
            advanceTurn(round);
        }
        return afterAct(round, shoe);
    }
    return { error: 'Nước đi lạ' };
}

function afterAct(round, shoe) {
    if (round.turnPtr === -1 && round.phase === 'playing') finishToDealer(round, shoe);
    return { ok: true };
}

// Nhà cái mở bài úp và rút theo luật, rồi tính thưởng.
function finishToDealer(round, shoe) {
    round.dealer.hidden = false;
    // Nếu tất cả các tay của mọi người đều bust/blackjack thì nhà cái vẫn phải mở để
    // so blackjack, nhưng không cần rút nếu không còn tay nào cần so. Cho đơn giản &
    // minh bạch: nhà cái luôn rút đủ luật (người xem thấy bài rõ ràng).
    while (true) {
        const v = handValue(round.dealer.cards);
        if (v.total >= 17) break;   // dừng ở mọi 17 (S17)
        round.dealer.cards.push(shoe.draw());
    }
    round.phase = 'done';
    round.result = settle(round);
}

// Tính thưởng từng tay. Trả [{userId, name, seat, hands:[{cards,total,outcome,bet,payout}], totalPayout}]
function settle(round) {
    const dv = handValue(round.dealer.cards);
    const dealerBJ = isBlackjack(round.dealer.cards);
    const out = [];
    for (const s of round.seats) {
        const detail = { userId: s.userId, name: s.name, seat: s.seat, hands: [], totalPayout: 0 };
        for (const h of s.hands) {
            const hv = handValue(h.cards);
            const playerBJ = isBlackjack(h.cards) && !h.fromSplit; // 21 sau split KHÔNG tính blackjack
            let outcome, payout;
            if (hv.bust) { outcome = 'thua'; payout = 0; }
            else if (playerBJ && dealerBJ) { outcome = 'hoà'; payout = h.bet; }
            else if (playerBJ) { outcome = 'blackjack'; payout = Math.floor(h.bet * (1 + BLACKJACK_PAYS)); }
            else if (dealerBJ) { outcome = 'thua'; payout = 0; }
            else if (dv.bust) { outcome = 'thắng'; payout = h.bet * 2; }
            else if (hv.total > dv.total) { outcome = 'thắng'; payout = h.bet * 2; }
            else if (hv.total < dv.total) { outcome = 'thua'; payout = 0; }
            else { outcome = 'hoà'; payout = h.bet; }
            detail.hands.push({ cards: h.cards.slice(), total: hv.total, soft: hv.soft, outcome, bet: h.bet, payout, doubled: h.doubled });
            detail.totalPayout += payout;
        }
        out.push(detail);
    }
    return out;
}

// Ảnh chụp trạng thái để gửi cho client (giấu lá úp của nhà cái khi chưa tới lúc).
function view(round) {
    const cur = actorAt(round);
    return {
        phase: round.phase,
        dealer: {
            cards: round.dealer.hidden
                ? [cardStr(round.dealer.cards[0]), '🂠']              // chỉ lộ 1 lá
                : round.dealer.cards.map(cardStr),
            total: round.dealer.hidden ? handValue([round.dealer.cards[0]]).total : handValue(round.dealer.cards).total,
            hidden: round.dealer.hidden,
        },
        seats: round.seats.map(s => ({
            seat: s.seat, userId: s.userId, name: s.name,
            hands: s.hands.map((h, i) => {
                const hv = handValue(h.cards);
                return {
                    cards: h.cards.map(cardStr), total: hv.total, soft: hv.soft, bust: hv.bust,
                    bet: h.bet, doubled: h.doubled, done: h.done,
                    active: cur && cur.s.seat === s.seat && cur.h === i && round.phase === 'playing',
                };
            }),
        })),
        turn: cur ? { userId: cur.s.userId, seat: cur.s.seat, handIdx: cur.h, options: options(round) } : null,
        result: round.result || null,
    };
}

module.exports = {
    createShoe, startRound, act, actorAt, options, view, settle,
    handValue, isBlackjack, cardStr,
    NUM_DECKS, BLACKJACK_PAYS, RESHUFFLE_AT,
};
