// ===== TRANG BLACKJACK (giao diện kiểu casino) — dùng chung harness test lẫn bot thật =====
// Trang tĩnh, không nội suy dữ liệu server (${}) -> không lo XSS. Mọi thứ động qua WebSocket.
// Nút bấm dùng data-attribute + uỷ quyền sự kiện (không có onclick inline dính dấu nháy) —
// tránh hẳn cái bẫy escape dấu nháy trong template literal mà README đã cảnh báo.
// Hiệu ứng: lá bài BAY từ shoe về chỗ khi chia. Lá NHÂN ĐÔI úp lại cho người chơi tự nặn.

const PAGE = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Blackjack — Xì Dách</title>
<style>
:root{--gold:#ffcf5c;--tx:#f2f6f3;--muted:#a9c2b4;--red:#e0474b;--green:#2ec26a}
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{background:#06121a;color:var(--tx);min-height:100vh;max-width:1000px;margin:0 auto;display:flex;flex-direction:column;touch-action:pan-x pan-y}
button{border:0;border-radius:12px;font-weight:800;cursor:pointer;color:#0a1410}
/* ---- đăng nhập ---- */
#login{background:#0e2018;border:1px solid #1f4a34;border-radius:16px;padding:18px;margin:auto;max-width:360px}
#login h1{font-size:20px;margin-bottom:6px}
#login .sub{font-size:13px;color:var(--muted);margin-bottom:6px}
#login input{width:100%;background:#0a1712;border:1px solid #1f4a34;border-radius:10px;color:var(--tx);padding:12px;font-size:16px;margin-top:8px}
.btn-gold{background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05}
.full{width:100%;margin-top:10px;padding:12px}
/* ---- bàn nỉ ---- */
/* border-radius vừa phải + KHÔNG overflow:hidden để hàng ghế (bài của người chơi)
   ở đáy không bị bo tròn cắt mất. min-height cho bàn luôn đủ cao dù ít nội dung. */
#felt{flex:1;position:relative;margin:8px;border-radius:28px;min-height:360px;
  background:radial-gradient(130% 110% at 50% 6%,#2f8fd6 0%,#1f6fb0 30%,#124a7d 62%,#0c3358 100%);
  border:6px solid #0a2740;box-shadow:inset 0 0 80px #0007,0 6px 24px #0008;padding:12px 10px 14px}
.rail{position:absolute;inset:0;border-radius:28px;border:2px solid #ffffff22;pointer-events:none}
.dealer{display:flex;flex-direction:column;align-items:center;margin-top:2px;min-height:96px}
.dealerlbl{font-size:11px;letter-spacing:2px;color:#dbeeff;opacity:.8}
.banner{text-align:center;margin:8px 0 4px}
.banner .b1{font-family:Georgia,serif;font-weight:900;color:var(--gold);letter-spacing:1px;font-size:15px;text-shadow:0 1px 0 #0008}
.banner .b2{font-size:11px;color:#dbeeff;opacity:.85;letter-spacing:.5px}
#status{text-align:center;font-size:13px;color:#eafff2;min-height:18px;margin:2px 0}
.clock{display:inline-block;min-width:24px;font-weight:900;color:var(--gold)}
/* ---- ghế ---- */
#seatRow{display:flex;gap:6px;justify-content:center;align-items:flex-end;margin-top:6px;flex-wrap:wrap}
.seat{flex:1 1 150px;min-width:132px;max-width:184px;display:flex;flex-direction:column;align-items:center;gap:3px}
.seat.turn .ava{box-shadow:0 0 0 3px var(--gold),0 0 18px #ffcf5c99}
/* Nhiều tay CUỘN NGANG TRONG GHẾ — ghế GIỮ NGUYÊN vị trí, không dời layout ra giữa. */
/* KHÔNG cuộn — tách nhiều tay thì LÁ NHỎ LẠI cho vừa ghế (đẹp hơn thanh cuộn). */
.handzone{display:flex;gap:8px;justify-content:center;align-items:flex-start;min-height:96px;max-width:100%;padding-bottom:2px}
.hand{display:flex;flex-direction:column;align-items:center;flex:0 0 auto}
.hand.active .cards{filter:drop-shadow(0 0 8px #ffcf5ccc)}
.tulbl{font-size:10px;font-weight:800;color:#cfe7ff;background:#0007;border-radius:8px;padding:1px 7px;margin-bottom:2px}
.hand.active .tulbl{background:var(--gold);color:#3d2c05}
.tot{margin-top:3px;font-size:12px;font-weight:900;background:#0009;border:1px solid #ffffff33;border-radius:20px;padding:2px 9px;color:#fff}
.tot.bust{background:#5c1616;border-color:#e0474b}
.bomb{margin-top:2px;font-size:12px;font-weight:900;color:#ff8a8a}
.out{font-size:11px;font-weight:900;padding:2px 8px;border-radius:8px;margin-top:3px}
.out.win{background:#12351f;color:#4fe38a}.out.lose{background:#3a1616;color:#ff8a8a}.out.push{background:#2b2b2b;color:#ddd}.out.bj{background:#4a3a10;color:var(--gold)}
/* Nút thao tác NẰM DƯỚI lá bài của tụ đang chơi (không phải thanh đáy). */
.handacts{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;width:100%;max-width:190px}
.handacts button{padding:11px 2px;font-size:12px;border-radius:8px}
.handacts button:disabled{background:#16281d;color:#4a6152}
.ava{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px;color:#08120b;border:2px solid #ffffffcc;box-shadow:0 2px 6px #0007;margin-top:2px}
.pname{font-size:12px;font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* ---- Ô CƯỢC TRÒN trên mặt bàn: bấm để ngồi, chip cược nằm ngay trong ô ---- */
.betspot{width:58px;height:58px;border-radius:50%;border:2px dashed #ffcf5c99;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:4px auto 2px;background:#ffffff0d;cursor:pointer;transition:box-shadow .2s,transform .1s}
.betspot.open:hover{box-shadow:0 0 16px #ffcf5c99;transform:scale(1.06)}
.betspot .bs-plus{font-size:20px;font-weight:900;color:var(--gold);line-height:1}
.betspot .bs-lbl{font-size:9px;color:#ffe9a8;letter-spacing:1px;font-weight:800;margin-top:1px}
.betspot.mine{border-style:solid;border-color:var(--gold)}
.betspot.haschip{border-style:solid;cursor:default}
/* chip trong ô cược = ĐỒNG DOGCOIN thật + số tiền đè lên */
.chipv{width:50px;height:50px;border-radius:50%;background:url(/dogcoin.png) center/cover no-repeat;border:3px solid var(--gold);box-shadow:0 3px 8px #0009;display:flex;align-items:flex-end;justify-content:center;position:relative}
.pv{background:#000d;color:#ffd977;border-radius:8px;padding:0 6px;font-size:10px;font-weight:900;line-height:15px;margin-bottom:-4px;white-space:nowrap}
/* ---- cụm QUYẾT ĐỊNH nằm ở THANH ĐÁY (không che bài trên bàn) ---- */
.dec-row{display:flex;gap:14px;align-items:flex-start;justify-content:center}
.bardec{display:flex;gap:16px;align-items:center;justify-content:center;padding:2px 0}
.rb-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;width:62px}
.rb{width:56px;height:56px;border-radius:50%;font-size:24px;font-weight:900;color:#fff;border:3px solid #ffffffcc;box-shadow:0 3px 10px #000a;display:flex;align-items:center;justify-content:center;padding:0;line-height:1}
.rb:disabled{background:#3a4a42!important;color:#7a8a80;border-color:#ffffff44;box-shadow:none}
.rb-hit{background:radial-gradient(circle at 50% 35%,#4fd07a,#1f9a4e)}
.rb-stand{background:radial-gradient(circle at 50% 35%,#ff6b6b,#c0392b)}
.rb-double{background:radial-gradient(circle at 50% 35%,#ffb35c,#d06a1a);font-size:19px}
.rb-split{background:radial-gradient(circle at 50% 35%,#7db4ff,#2c6fd0);font-size:16px;letter-spacing:-2px}
.rbl{font-size:10px;font-weight:800;letter-spacing:1px;color:#fff;text-shadow:0 1px 4px #000}
.ringwrap{display:flex;justify-content:center;align-items:center}
#ring{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative}
#ring:before{content:"";position:absolute;inset:5px;border-radius:50%;background:#0c1f16}
#ring span{position:relative;font-weight:900;font-size:17px;color:#fff}
/* ---- lá bài ---- */
.cards{display:flex}
.card{width:54px;height:78px;border-radius:7px;background:#fbfbf7;color:#16202a;border:1px solid #0003;
  box-shadow:0 2px 5px #0007;margin-left:-20px;display:flex;flex-direction:column;justify-content:space-between;
  padding:5px 6px;font-weight:900;font-size:18px;position:relative}
.card:first-child{margin-left:0}
.card.red{color:#c0392b}
.card .s{align-self:flex-end;font-size:22px;line-height:1}
.card .c{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);font-size:25px;opacity:.9}
.card.back{background:repeating-linear-gradient(45deg,#b6362a,#b6362a 6px,#8f281f 6px,#8f281f 12px);border:2px solid #ffce6b;color:transparent}
/* Tách nhiều tay -> lá NHỎ DẦN cho vừa ghế, không cuộn.
   Mỗi tụ có Ô NỀN MỜ riêng + giãn cách rộng để nhìn rõ tụ nào ra tụ đó. */
.handzone.n2{gap:16px}
.handzone.n2 .hand,.handzone.n3 .hand,.handzone.nx .hand{background:#00000033;border:1px solid #ffffff1c;border-radius:10px;padding:4px 7px 5px}
.handzone.n2 .card{width:40px;height:58px;font-size:13px;margin-left:-14px}
.handzone.n2 .card .s{font-size:16px}.handzone.n2 .card .c{font-size:18px}
.handzone.n3{gap:11px}
.handzone.n3 .card{width:33px;height:48px;font-size:11px;margin-left:-11px}
.handzone.n3 .card .s{font-size:13px}.handzone.n3 .card .c{font-size:14px}
.handzone.nx{gap:8px}
.handzone.nx .card{width:26px;height:38px;font-size:9px;margin-left:-8px;padding:3px 3px}
.handzone.nx .card .s{font-size:10px}.handzone.nx .card .c{font-size:11px}
.handzone.nx .tulbl{font-size:8px;padding:0 4px}.handzone.nx .tot{font-size:10px;padding:1px 5px}
/* Chia bài: lá BAY TỪ CHỖ NHÀ CÁI (trên) xuống người chơi, từng lá một. Không lật. */
.card.reveal{animation:reveal .55s cubic-bezier(.25,.8,.3,1) both}
@keyframes reveal{0%{transform:translate(40px,-230px) rotate(8deg);opacity:0}30%{opacity:1}100%{transform:none;opacity:1}}
/* ---- thanh điều khiển đáy ---- */
#bar{padding:8px 10px 12px;background:#081a12;border-top:1px solid #14361f}
.betbox{display:flex;gap:8px;align-items:center}
#betInput{flex:1;background:#0a1712;border:1px solid #1f4a34;border-radius:10px;color:var(--tx);padding:12px;font-size:17px;text-align:center;font-weight:900}
.chips{display:flex;gap:6px;margin-top:8px}
.chip{flex:1;min-width:52px;background:#1a3a28;color:#d6f0dd;padding:10px 0;font-size:13px}
/* ---- CHIP MỆNH GIÁ kiểu phỉnh casino: bấm là cộng dồn + bay vào ô cược ---- */
.betrow{display:flex;gap:10px;align-items:center;justify-content:center;font-size:13px;margin-bottom:8px;flex-wrap:wrap}
.betrow .binfo{background:#0a1712;border:1px solid #1f4a34;border-radius:10px;padding:7px 12px;font-weight:700;color:var(--muted)}
.betrow .binfo b{color:var(--gold);font-size:15px}
.betrow button{padding:8px 14px;font-size:13px;background:#1a3a28;color:#d6f0dd}
.chiprow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
/* chip mệnh giá = ĐỒNG DOGCOIN + số tiền đè dưới */
.pchip{width:54px;height:54px;border-radius:50%;border:3px solid var(--gold);box-shadow:0 3px 8px #0009;
  background:url(/dogcoin.png) center/cover no-repeat;display:flex;align-items:flex-end;justify-content:center;cursor:pointer;padding:0;transition:transform .1s;position:relative}
.pchip:active{transform:scale(.9)}
.pchip.fly{position:fixed;z-index:120;margin:0;transition:transform .55s cubic-bezier(.3,.7,.4,1),opacity .55s;pointer-events:none}
/* ---- điện thoại XOAY NGANG: dồn hết màn hình cho BÀN, giấu phần phụ.
   KHÓA CUỘN (body fixed + overflow hidden, cao 100dvh) — bàn khít đúng khung nhìn,
   không vuốt lên xuống được. Chừa safe-area né tai thỏ + thanh vuốt iPhone. ---- */
@media (orientation:landscape) and (pointer:coarse) and (max-height:540px){
  html,body{height:100dvh;overflow:hidden;overscroll-behavior:none}
  body{position:fixed;inset:0;width:100%;max-width:none}
  .hbar{display:none}
  #chatBar{display:none}
  .banner{display:none}
  #felt{min-height:0;padding:4px 8px 6px;border-width:4px;display:flex;flex-direction:column;
    margin:3px calc(4px + env(safe-area-inset-right)) 2px calc(4px + env(safe-area-inset-left))}
  .dealer{min-height:56px;margin-top:0}
  #status{font-size:11px;min-height:14px;margin:0}
  /* 5 ghế BẮT BUỘC 1 hàng (không wrap — trước bị Ghế 5 rớt xuống dòng), ghim đáy bàn */
  #seatRow{flex-wrap:nowrap;gap:4px;margin-top:auto}
  .seat{flex:1 1 0;min-width:0;max-width:none}
  .rb{width:44px;height:44px;font-size:18px}
  .rbl{font-size:8px}
  #ring{width:38px;height:38px}#ring span{font-size:12px}
  .bardec{gap:12px}
  .card{width:40px;height:57px;font-size:13px;margin-left:-14px;padding:4px 5px}
  .card .s{font-size:16px}.card .c{font-size:18px}
  .handzone{min-height:62px}
  .tot{font-size:10px;padding:1px 7px;margin-top:2px}
  .betspot{width:42px;height:42px;margin:2px auto 1px}
  .betspot .bs-plus{font-size:15px}.betspot .bs-lbl{font-size:8px}
  .chipv{width:36px;height:36px}
  .ava{width:28px;height:28px;font-size:11px}
  .pname{font-size:10px}
  .seat{min-width:110px}
  /* thanh đáy nhỏ gọn + đệm đáy né thanh vuốt iPhone (safe-area) */
  #bar{padding:2px calc(8px + env(safe-area-inset-right)) calc(3px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))}
  .pchip{width:40px;height:40px}
  .pv{font-size:9px;line-height:13px;padding:0 4px;margin-bottom:-3px}
  .betrow{gap:6px;margin-bottom:3px}
  .betrow .binfo{padding:3px 8px;font-size:11px}.betrow .binfo b{font-size:12px}
  .betrow button{padding:4px 10px;font-size:11px}
  .chiprow{gap:6px}
  .waiting{padding:5px 0;font-size:11px}
}
.acts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.acts button{padding:16px 4px;font-size:15px;letter-spacing:.5px}
.a-hit{background:linear-gradient(180deg,#4fd07a,#1f9a4e);color:#04240f}
.a-stand{background:linear-gradient(180deg,#ff6b6b,#c0392b);color:#fff}
.a-double{background:linear-gradient(180deg,#7db4ff,#2c6fd0);color:#fff}
.a-split{background:linear-gradient(180deg,#c79bff,#7b3fd0);color:#fff}
.acts button:disabled{background:#16281d;color:#4a6152}
.seatpick{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.seatpick button{padding:12px 2px;font-size:13px;background:#1a3a28;color:#d6f0dd}
.seatpick button:disabled{background:#132018;color:#3d5346}
.waiting{text-align:center;color:var(--muted);font-size:13px;padding:12px 0}
.hbar{display:flex;justify-content:space-between;align-items:center;padding:8px 12px}
.hbar .bal{font-weight:900;color:var(--gold)}
.conn{font-size:12px}
#toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#000e;padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:99;max-width:90%}
#pop{position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);font-size:44px;font-weight:900;opacity:0;pointer-events:none;z-index:98;text-shadow:0 2px 14px #000d}
#pop.show{animation:pf 2.8s ease-out forwards}
@keyframes pf{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-100%) scale(.9)}}
.hidden{display:none}
.btn-blue{background:linear-gradient(180deg,#5aa9ff,#2c6fd0);color:#fff}
.dc{width:1.05em;height:1.05em;vertical-align:-.16em;object-fit:contain;display:inline-block}
/* bong bóng chat nổi trên đầu avatar */
.bubble{max-width:120px;margin:0 auto 3px;background:#fff;color:#12202a;font-size:12px;font-weight:700;
  padding:4px 9px;border-radius:12px;position:relative;box-shadow:0 2px 6px #0007;
  white-space:normal;word-break:break-word;line-height:1.2}
/* animation CHỈ gắn cho bong bóng mới toanh (lớp .fresh). Nếu để mặc định, renderSeats
   vẽ lại mỗi giây sẽ replay animation -> nhấp nháy. Vẽ lại chỉ giữ .bubble, không .fresh. */
.bubble.fresh{animation:bubIn .2s ease-out}
.bubble:after{content:"";position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);border:5px solid transparent;border-top-color:#fff;border-bottom:0}
@keyframes bubIn{0%{opacity:0;transform:translateY(6px) scale(.8)}100%{opacity:1;transform:none}}
/* chat dưới cùng */
#chatBar{padding:6px 10px 10px;background:#081a12;border-top:1px solid #14361f}
#chatLog{height:64px;overflow-y:auto;font-size:13px;margin-bottom:6px}
.cmsg{padding:2px 0;word-break:break-word}
.chatIn{display:flex;gap:8px}
.chatIn input{flex:1;background:#0a1712;border:1px solid #1f4a34;border-radius:10px;color:var(--tx);padding:10px;font-size:16px}
.chatIn button{padding:10px 16px}
/* Xoay ngang: overlay nhắc khi cầm dọc trên điện thoại nhỏ */
#rotate{display:none}
/* pointer:coarse = màn cảm ứng thật. Máy tính (chuột) dù khung hẹp/nhúng iframe dọc
   vẫn KHÔNG che — cho chơi luôn, chỉ điện thoại cầm dọc mới nhắc xoay ngang. */
@media (orientation:portrait) and (max-width:820px) and (pointer:coarse){
  #rotate{display:flex;position:fixed;inset:0;z-index:200;background:#06121a;color:var(--gold);
    flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:20px;font-weight:900;gap:10px;padding:24px;line-height:1.5}
  #app{filter:blur(2px)}
}
</style></head><body>

<div id="login">
  <h1>🂡 Blackjack — Xì Dách</h1>
  <div class="sub">Ăn 1.5 (3:2) · Nhà cái dừng ở mọi 17</div>
  <div class="sub">Nhập Discord ID + mã PIN (lấy bằng nút 🌐 trên bảng trong Discord).</div>
  <input id="uid" inputmode="numeric" placeholder="Discord ID">
  <input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">
  <button class="btn-gold full" id="loginBtn">Vào bàn</button>
  <div id="loginErr" class="sub" style="color:var(--red)"></div>
</div>

<div id="app" class="hidden">
  <div class="hbar">
    <div><span class="conn" id="conn">•</span> <b>Blackjack</b></div>
    <div class="bal"><span id="bal">0</span> <img class="dc" src="/dogcoin.png" alt=""></div>
  </div>
  <div id="felt">
    <div class="rail"></div>
    <div class="dealer"><div class="dealerlbl">NHÀ CÁI <span id="dtot"></span></div><div class="cards" id="dealerCards"></div></div>
    <div class="banner"><div class="b1">BLACKJACK ĂN 1.5 (3 : 2)</div><div class="b2">Nhà cái dừng ở mọi 17</div></div>
    <div id="status"></div>
    <div id="seatRow"></div>
  </div>
  <div id="bar"></div>
  <div id="chatBar">
    <div id="chatLog"></div>
    <div class="chatIn"><input id="chatIn" maxlength="200" placeholder="Chat...">
      <button id="chatSend" class="btn-blue">Gửi</button></div>
  </div>
</div>

<div id="rotate">📱↻<br>Xoay ngang điện thoại để chơi Blackjack cho dễ</div>
<div id="pop"></div>
<div id="toast"></div>

<script>
// Khi nhúng làm tab thứ 4 trong trang chính, token được truyền qua #tok=... để
// KHỎI đăng nhập lại. Ưu tiên token trên URL, sau đó mới tới localStorage.
var EMBED=/[#&]tok=/.test(location.hash);
var TOKEN=(location.hash.match(/tok=([a-f0-9]+)/)||[])[1]||localStorage.getItem("bj_token")||"";
var WS=null, ST=null, MYID="", BAL=0, seenCards={};
// Bong bóng chat nổi trên đầu: hàng đợi TUẦN TỰ để không đè/nhấp nháy.
// Mỗi câu hiện 3s -> biến mất -> trống 3s -> mới tới câu kế.
var chatList=[], bubQ=[], bubCur=null, bubLock=false;   // bubCur:{u,text,shown}
var BUB_SHOW=3000, BUB_GAP=3000;
function pumpBub(){
  if(bubLock||bubCur||!bubQ.length)return;
  bubCur=bubQ.shift();bubCur.shown=false;
  if(ST)renderSeats(ST);                       // hiện (lần đầu có .fresh -> pop 1 lần)
  setTimeout(function(){
    bubCur=null;if(ST)renderSeats(ST);         // ẩn sau 3s
    bubLock=true;
    setTimeout(function(){bubLock=false;pumpBub();},BUB_GAP);  // trống 3s rồi tới câu kế
  },BUB_SHOW);
}
function $(id){return document.getElementById(id)}
function toast(m){var t=$("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2400)}
var COIN='<img class="dc" src="/dogcoin.png" alt="">';
function pop(txt,color){var e=$("pop");e.innerHTML=txt;e.style.color=color;e.classList.remove("show");void e.offsetWidth;e.classList.add("show")}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":"&gt;"})}
function fmt(n){return Number(n||0).toLocaleString("vi-VN")}
function setBal(v){if(typeof v!=="number")return;BAL=v;$("bal").textContent=fmt(v)}

// ---- đăng nhập ----
function doLogin(){
  var u=$("uid").value.trim(), p=$("pin").value.trim();
  if(!u||!p){$("loginErr").textContent="Nhập đủ ID và PIN";return}
  fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})})
    .then(function(r){return r.json()}).then(function(j){
      if(!j.ok){$("loginErr").textContent=j.error||"Sai thông tin";return}
      TOKEN=j.token;localStorage.setItem("bj_token",TOKEN);enter(j.balance);
    }).catch(function(){$("loginErr").textContent="Lỗi mạng"});
}
function enter(bal){$("login").classList.add("hidden");$("app").classList.remove("hidden");if(typeof bal==="number")setBal(bal);connect()}

function connect(){
  var proto=location.protocol==="https:"?"wss":"ws";
  WS=new WebSocket(proto+"://"+location.host+"/ws");
  WS.onopen=function(){$("conn").textContent="🟢";WS.send(JSON.stringify({type:"auth",token:TOKEN}))};
  WS.onclose=function(){$("conn").textContent="🔴";setTimeout(connect,1500)};
  WS.onmessage=function(ev){var m;try{m=JSON.parse(ev.data)}catch(e){return}
    if(m.type==="state")render(m);
    else if(m.type==="balance")setBal(m.balance);
    else if(m.type==="toast")toast(m.msg);
    else if(m.type==="denied")toast("❌ "+(m.error||"không được"));
    else if(m.type==="result"){pendingPop=m;                      // giữ tới khi nhà cái lật xong
      if(ST&&ST.phase==="result"&&dReveal.done)flushPop()}        // (lật xong rồi mới tới thì bung luôn)
    else if(m.type==="authok"){MYID=m.userId;if(typeof m.balance==="number")setBal(m.balance)}
    else if(m.type==="authfail"){localStorage.removeItem("bj_token");
      // token hỏng: xoá luôn #tok trên URL kẻo reload đọc lại token hỏng -> lặp vô hạn
      if(EMBED)location.hash="";location.reload()}
    else if(m.type==="chat"){chatList=m.list||[];renderChat()}
    else if(m.type==="say"){chatList.push(m.line);if(chatList.length>60)chatList.shift();renderChat();
      // Vào hàng đợi bong bóng; giữ tối đa 5 câu chờ để khỏi tồn đọng quá xa thực tế.
      bubQ.push({u:m.line.u,text:m.line.text});while(bubQ.length>5)bubQ.shift();pumpBub();
      setTimeout(function(){if(ST)renderSeats(ST)},4600)}
  };
}
function send(o){if(WS&&WS.readyState===1)WS.send(JSON.stringify(o))}
function cmd(c,extra){send(Object.assign({type:"bj",cmd:c},extra||{}))}

// ---- vẽ bài ----
var SUIT_RED={"♥":1,"♦":1};
function cardEl(str){
  var d=document.createElement("div");
  if(str==="🂠"){d.className="card back";return d}
  var suit=str.slice(-1), rank=str.slice(0,-1);
  d.className="card"+(SUIT_RED[suit]?" red":"");
  d.innerHTML='<div>'+rank+'</div><div class="c">'+suit+'</div><div class="s">'+suit+'</div>';
  return d;
}
function drawCards(container,cards,pfx,stag){
  container.innerHTML="";
  cards.forEach(function(c,i){
    var key=pfx+"|"+i+"|"+c;
    var isNew=!seenCards[key];seenCards[key]=1;
    var el=cardEl(c);
    // lá MỚI: bay tới. Giãn thời gian giữa các lá cho dễ nhìn (stag=0 khi tự canh nhịp ngoài).
    if(isNew){el.className+=" reveal";el.style.animationDelay=(i*(typeof stag==="number"?stag:0.22))+"s"}
    container.appendChild(el);
  });
}

// ---- nhà cái lật/rút TỪNG LÁ cách nhau 1 giây (server kết toán 1 phát, client canh nhịp hiển thị) ----
var DEALER_STEP_MS=1000; // nhịp rút của nhà cái — chậm cho dễ theo dõi
var dReveal={sig:"",n:0,cards:[],timer:0,done:true};
var pendingPop=null;                 // popup ăn/thua giữ tới khi nhà cái lật xong mới bung
function flushPop(){if(!pendingPop)return;var m=pendingPop;pendingPop=null;
  if(typeof m.net==="number"&&m.net!==0)pop((m.net>0?"+":"")+fmt(m.net)+" "+COIN,m.net>0?"#4fe38a":"#ff6b6b")}
function dStop(){if(dReveal.timer){clearTimeout(dReveal.timer);dReveal.timer=0}dReveal.done=true}
function dStep(){
  if(dReveal.n>=dReveal.cards.length){dReveal.done=true;
    if(ST&&ST.table&&ST.table.dealer)$("dtot").textContent="• "+ST.table.dealer.total;
    if(ST)renderSeats(ST);           // giờ mới hiện THẮNG/THUA từng tụ
    flushPop();return}
  dReveal.n++;
  drawCards($("dealerCards"),dReveal.cards.slice(0,dReveal.n),"D",0);
  dReveal.timer=setTimeout(dStep,DEALER_STEP_MS);
}
function paintDealer(m){
  var t=m.table;
  if(!t||!t.dealer){$("dealerCards").innerHTML="";$("dtot").textContent="";dStop();return}
  var d=t.dealer;
  if(m.phase==="result"&&!d.hidden&&d.cards.length>2){
    var sig=(m.lastResult?m.lastResult.at:0)+"|"+d.cards.join(",");
    if(sig!==dReveal.sig){            // kết quả MỚI: lật lá úp trước, rồi 1s/lá tới hết
      dStop();dReveal={sig:sig,n:2,cards:d.cards,timer:0,done:false};
      drawCards($("dealerCards"),d.cards.slice(0,2),"D",0);$("dtot").textContent="";
      dReveal.timer=setTimeout(dStep,DEALER_STEP_MS);
    }else if(dReveal.done){drawCards($("dealerCards"),d.cards,"D",0);$("dtot").textContent="• "+d.total}
    else if($("dealerCards").children.length!==dReveal.n){drawCards($("dealerCards"),d.cards.slice(0,dReveal.n),"D",0)}
  }else{
    dStop();
    drawCards($("dealerCards"),d.cards,"D");
    $("dtot").textContent=d.hidden?"":("• "+d.total);
    if(m.phase==="result")setTimeout(flushPop,500); // không rút thêm: chỉ chờ lá úp lật xong
  }
}

function render(m){
  ST=m;
  if(typeof m.balance==="number")setBal(m.balance);
  var t=m.table;
  paintDealer(m);
  // trạng thái + đồng hồ
  var s=$("status"),clk=m.timeLeft>0?'<span class="clock">'+m.timeLeft+'s</span>':"";
  if(m.phase==="idle")s.innerHTML="Chờ người đặt cược để mở ván...";
  else if(m.phase==="betting")s.innerHTML="🟢 Đặt cược — chia sau "+clk;
  else if(m.phase==="playing"){var tn=t&&t.turn;
    var tuTxt="";
    if(tn){var ts=t.seats.find(function(x){return x.seat===tn.seat});if(ts&&ts.hands&&ts.hands.length>1)tuTxt=" · Tụ "+((tn.handIdx|0)+1);}
    s.innerHTML=tn?("Lượt: <b>"+esc(seatName(tn.seat))+"</b>"+tuTxt+" "+clk):"Nhà cái đang rút...";}
  else if(m.phase==="result")s.innerHTML="Kết quả — ván mới sau "+clk;
  if(m.phase==="idle"||m.phase==="betting"){seenCards={}}
  renderSeats(m);renderBar(m);updateDecide(m);
}
// Cụm quyết định (đang nằm ở thanh đáy): bật/tắt nút theo lượt + vòng đếm xanh -> đỏ 5s cuối
function updateDecide(m){
  if(!$("ring"))return; // không phải lượt mình -> thanh đáy không có cụm này
  var myTurn=m.phase==="playing"&&m.table&&m.table.turn&&m.table.turn.userId===MYID;
  if(!myTurn)return;
  var opts=(m.table.turn.options)||[];
  [["rbHit","hit"],["rbStand","stand"],["rbDouble","double"],["rbSplit","split"]].forEach(function(p){var b=$(p[0]);if(b)b.disabled=opts.indexOf(p[1])<0});
  var left=m.timeLeft||0,pct=Math.max(0,Math.min(100,left/15*100));
  var col=left<=5?"#ff6b6b":"#2ec26a";
  $("ring").style.background="conic-gradient("+col+" "+pct+"%, #ffffff22 0)";
  $("ringNum").textContent=left;
}
function seatName(i){if(!ST)return "#"+(i+1);var s=ST.seats[i];return s&&!s.empty?s.name:("Ghế "+(i+1))}
function avaColor(u){var h=0;u=String(u||"");for(var i=0;i<u.length;i++)h=(h*31+u.charCodeAt(i))>>>0;return "hsl("+(h%360)+",70%,62%)"}

function renderSeats(m){
  var box=$("seatRow");box.innerHTML="";var tbl=m.table;
  for(var i=0;i<m.seats.length;i++){
    var seat=m.seats[i];
    var div=document.createElement("div");div.className="seat";
    var isTurn=tbl&&tbl.turn&&tbl.turn.seat===i;if(isTurn)div.className+=" turn";
    // Ghế trống = Ô TRÒN trên bàn, bấm thẳng vào ô để ngồi (kiểu bàn casino thật)
    if(seat.empty){div.innerHTML='<div class="handzone"></div>'+
      '<div class="betspot open" data-sit="'+i+'"><div class="bs-plus">＋</div><div class="bs-lbl">NGỒI</div></div>'+
      '<div class="pname" style="opacity:.5">Ghế '+(i+1)+'</div>';
      box.appendChild(div);continue}
    var tseat=tbl?tbl.seats.find(function(x){return x.seat===i}):null;
    var nHands=tseat&&tseat.hands?tseat.hands.length:0;
    var myTurn=tbl&&tbl.turn&&tbl.turn.userId===MYID;
    var turnOpts=(tbl&&tbl.turn&&tbl.turn.options)||[];
    // bài (trên) — nhiều tay thì LÁ NHỎ LẠI cho vừa ghế (không cuộn)
    var hz=document.createElement("div");
    hz.className="handzone"+(nHands===2?" n2":nHands===3?" n3":nHands>=4?" nx":"");
    if(tseat&&tseat.hands){
      tseat.hands.forEach(function(h,hi){
        var hd=document.createElement("div");hd.className="hand"+(h.active?" active":"");
        // Nhãn "Tụ N" khi có từ 2 tay trở lên, cho khỏi nhìn lộn giữa các tay đã tách.
        if(nHands>1){var lb=document.createElement("div");lb.className="tulbl";lb.textContent=(h.active?"▶ ":"")+"Tụ "+(hi+1);hd.appendChild(lb)}
        var cc=document.createElement("div");cc.className="cards";
        drawCards(cc,h.cards,"S"+i+"H"+hi);
        hd.appendChild(cc);
        var tot=document.createElement("div");tot.className="tot"+(h.bust?" bust":"");tot.textContent=h.total+(h.soft?"ˢ":"");hd.appendChild(tot);
        // QUẮC: hiện trái bom + số Dogcoin mất ngay tại tụ đó
        if(h.bust){var bo=document.createElement("div");bo.className="bomb";bo.innerHTML="💣 -"+fmt(h.bet)+" "+COIN;hd.appendChild(bo)}
        // THẮNG/THUA chỉ hiện khi nhà cái đã lật xong hết bài (đang rút từng lá thì chưa)
        if(m.lastResult&&dReveal.done){var oc=outClass(h.outcome);if(oc){var ob=document.createElement("div");ob.className="out "+oc.c;ob.textContent=oc.t;hd.appendChild(ob)}}
        hz.appendChild(hd);
      });
    }
    div.appendChild(hz);
    // Ô CƯỢC TRÒN của ghế: có cược thì CHIP nằm trong ô, chưa cược thì ô mờ chờ
    // (nút hành động giờ là cụm nút tròn giữa bàn — overlay #decide)
    var spot=document.createElement("div");
    spot.className="betspot"+(seat.userId===MYID?" mine":"")+(seat.bet>0?" haschip":"");
    if(seat.bet>0){var ch=document.createElement("div");ch.className="chipv";ch.innerHTML='<span class="pv">'+fmt(seat.bet)+'</span>';spot.appendChild(ch)}
    else{spot.innerHTML='<div class="bs-lbl">CƯỢC</div>'}
    div.appendChild(spot);
    // bong bóng chat nổi trên đầu người này (nếu vừa chat, còn hạn)
    if(bubCur&&bubCur.u===seat.userId){var sb=document.createElement("div");
      sb.className="bubble"+(bubCur.shown?"":" fresh");   // .fresh chỉ ở lần vẽ đầu -> pop 1 lần, không nhấp nháy
      sb.textContent=bubCur.text;div.appendChild(sb);bubCur.shown=true;}
    var ava=document.createElement("div");ava.className="ava";ava.style.background=avaColor(seat.userId);ava.textContent=(seat.name||"?").slice(0,2).toUpperCase();div.appendChild(ava);
    var nm=document.createElement("div");nm.className="pname";nm.textContent=(seat.userId===MYID?"★ ":"")+seat.name;div.appendChild(nm);
    box.appendChild(div);
  }
}
function outClass(o){if(o==="thắng")return{c:"win",t:"THẮNG"};if(o==="thua")return{c:"lose",t:"THUA"};if(o==="hoà")return{c:"push",t:"HOÀ"};if(o==="blackjack")return{c:"bj",t:"BLACKJACK"};return null}

// Thanh điều khiển CHỈ dựng lại khi chế độ/nội dung thực sự đổi (so bằng chữ ký).
// Server phát trạng thái mỗi giây — nếu cứ thế innerHTML lại thì ô nhập cược bị dựng
// mới và chữ đang gõ mất sạch. Chữ ký CỐ TÌNH không chứa giá trị ô nhập.
var lastBarSig="";
function renderBar(m){
  var bar=$("bar"), sig, html;
  var seat=m.mySeat>=0?m.seats[m.mySeat]:null;
  var myTurn=m.table&&m.table.turn&&m.table.turn.userId===MYID;
  if(m.mySeat<0){
    sig="pick";
    if(sig===lastBarSig)return;
    html='<div class="waiting">👆 Bấm vào <b style="color:var(--gold)">Ô TRÒN vàng</b> trên bàn để ngồi vào ghế</div>';
  }else if(myTurn){
    // CỤM NÚT TRÒN + vòng đếm nằm Ở ĐÂY (thanh đáy) — không che bài trên bàn.
    sig="acts|"+m.table.turn.handIdx;
    if(sig===lastBarSig)return;
    html='<div class="bardec">'+
      '<div class="rb-wrap"><button class="rb rb-double" id="rbDouble" data-act="double">2x</button><div class="rbl">NHÂN ĐÔI</div></div>'+
      '<div class="rb-wrap"><button class="rb rb-hit" id="rbHit" data-act="hit">＋</button><div class="rbl">RÚT</div></div>'+
      '<div class="rb-wrap"><button class="rb rb-stand" id="rbStand" data-act="stand">－</button><div class="rbl">NGƯNG</div></div>'+
      '<div class="rb-wrap"><button class="rb rb-split" id="rbSplit" data-act="split">◄►</button><div class="rbl">TÁCH</div></div>'+
      '<div class="ringwrap"><div id="ring"><span id="ringNum"></span></div></div></div>';
  }else if(m.phase==="idle"||m.phase==="betting"){
    // CHIP MỆNH GIÁ: bấm chip = CỘNG DỒN vào cược + chip bay vào ô. Hiện số dư kế bên.
    var placed=seat&&seat.bet>0;
    sig="bet|"+(placed?seat.bet:0)+"|"+BAL;   // vẽ lại khi cược hoặc số dư đổi
    if(sig===lastBarSig)return;
    html='<div class="betrow">'+
      '<span class="binfo">💰 Dư: <b>'+fmt(BAL)+'</b></span>'+
      '<span class="binfo">🎯 Cược: <b>'+fmt(placed?seat.bet:0)+'</b></span>'+
      (placed?'<button data-clear="1">Xoá cược</button>':'')+
      '<button data-leave="1">Rời bàn</button></div>'+
      '<div class="chiprow">'+CHIP_DENOMS.map(function(d){
        return '<button class="pchip" data-chip="'+d.v+'"><span class="pv">'+d.t+'</span></button>';
      }).join("")+'</div>';
  }else{
    var txt=m.phase==="result"?"Ván kết thúc — chờ ván mới":(seat&&seat.bet>0?"Đang trong ván — chờ tới lượt bạn":"Bạn không đặt ván này — chờ ván sau");
    sig="wait|"+txt;
    if(sig===lastBarSig)return;
    html='<div class="waiting">'+txt+'</div>';
  }
  lastBarSig=sig;
  bar.innerHTML=html;
}
function ab(a,label,opts){var on=opts.indexOf(a)>=0;return '<button class="a-'+a+'"'+(on?"":" disabled")+' data-act="'+a+'">'+label+'</button>'}

// ---- chip mệnh giá: màu kiểu phỉnh casino ----
var CHIP_DENOMS=[
  {v:100,t:"100",c1:"#6fb7ff",c2:"#1d5fa8"},
  {v:200,t:"200",c1:"#63d68c",c2:"#1d7a44"},
  {v:500,t:"500",c1:"#c79bff",c2:"#6b32b0"},
  {v:1000,t:"1K",c1:"#ffd977",c2:"#b8860b"},
  {v:5000,t:"5K",c1:"#ff9b6a",c2:"#c2531d"},
  {v:10000,t:"10K",c1:"#ff6b8a",c2:"#b02545"}
];
// Bấm chip: cộng dồn cược (server thay bằng tổng mới) + hiệu ứng chip BAY vào ô của mình
function addChip(denom,fromEl){
  if(!ST)return;
  var seat=ST.mySeat>=0?ST.seats[ST.mySeat]:null;
  if(!seat)return toast("Ngồi vào ghế trước đã");
  if(ST.phase!=="idle"&&ST.phase!=="betting")return toast("Đang trong ván — chờ ván sau");
  var total=(seat.bet||0)+denom;
  if(total>BAL)return toast("Không đủ Dogcoin (dư "+fmt(BAL)+")");
  cmd("bet",{amount:total});
  flyChip(fromEl,denom);
}
function flyChip(fromEl,denom){
  var spot=document.querySelector(".betspot.mine");
  if(!spot||!fromEl)return;
  var a=fromEl.getBoundingClientRect(),b=spot.getBoundingClientRect();
  var d=CHIP_DENOMS.find(function(x){return x.v===denom})||CHIP_DENOMS[0];
  var c=document.createElement("div");c.className="pchip fly";c.innerHTML='<span class="pv">'+d.t+'</span>';
  c.style.left=(a.left+a.width/2-27)+"px";c.style.top=(a.top+a.height/2-27)+"px";
  document.body.appendChild(c);
  requestAnimationFrame(function(){
    c.style.transform="translate("+(b.left+b.width/2-(a.left+a.width/2))+"px,"+(b.top+b.height/2-(a.top+a.height/2))+"px) scale(.72)";
    c.style.opacity="0.92";
  });
  setTimeout(function(){c.remove()},640);
}

// ---- uỷ quyền sự kiện (không onclick inline) ----
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-sit],[data-act],[data-chip],[data-clear],[data-leave]");
  if(!el)return;
  if(el.id==="loginBtn")return;
  if(el.dataset.sit!==undefined)cmd("sit",{seat:+el.dataset.sit});
  else if(el.dataset.act!==undefined)cmd("act",{action:el.dataset.act});
  else if(el.dataset.chip!==undefined)addChip(+el.dataset.chip,el);
  else if(el.dataset.clear!==undefined)cmd("clearbet");
  else if(el.dataset.leave!==undefined)cmd("leave");
});
$("loginBtn").addEventListener("click",doLogin);
$("pin").addEventListener("keydown",function(e){if(e.key==="Enter")doLogin()});
// ---- điện thoại xoay ngang -> TOÀN MÀN HÌNH (trình duyệt bắt phải có cử chỉ chạm,
// nên vào fullscreen ở lần chạm ĐẦU TIÊN sau khi xoay; xoay dọc lại thì thoát) ----
var COARSE=window.matchMedia&&matchMedia("(pointer:coarse)").matches;
function isLand(){return matchMedia("(orientation:landscape)").matches}
var fsWant=false;
function fsEnter(){var el=document.documentElement;var f=el.requestFullscreen||el.webkitRequestFullscreen;if(f)try{f.call(el)}catch(e){}}
function fsExit(){var f=document.exitFullscreen||document.webkitExitFullscreen;if(document.fullscreenElement&&f)try{f.call(document)}catch(e){}}
if(COARSE&&window.matchMedia){
  matchMedia("(orientation:landscape)").addEventListener("change",function(ev){
    if(ev.matches){fsWant=true;toast("📱 Chạm màn hình để chơi TOÀN MÀN HÌNH")}
    else{fsWant=false;fsExit()}
  });
  document.addEventListener("touchend",function(){
    if(fsWant&&isLand()&&!document.fullscreenElement){fsEnter();fsWant=false}
  },{passive:true});
}
// ---- chat ----
function renderChat(){var box=$("chatLog");if(!box)return;
  box.innerHTML=chatList.slice(-40).map(function(m){
    return '<div class="cmsg"><b style="color:'+avaColor(m.u)+'">'+esc(m.name)+'</b>: '+esc(m.text)+'</div>';
  }).join("");
  box.scrollTop=box.scrollHeight;
}
function sendChat(){var i=$("chatIn");if(!i)return;var v=i.value.trim();if(!v)return;send({type:"chat",text:v});i.value=""}
$("chatSend")&&$("chatSend").addEventListener("click",sendChat);
$("chatIn")&&$("chatIn").addEventListener("keydown",function(e){if(e.key==="Enter")sendChat()});
if(TOKEN)enter();
</script></body></html>`;

module.exports = { PAGE };
