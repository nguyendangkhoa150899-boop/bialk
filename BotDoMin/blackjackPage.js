// ===== TRANG BLACKJACK (giao diện kiểu casino) — dùng chung harness test lẫn bot thật =====
// Trang tĩnh, không nội suy dữ liệu server (${}) -> không lo XSS. Mọi thứ động qua WebSocket.
// Nút bấm dùng data-attribute + uỷ quyền sự kiện (không có onclick inline dính dấu nháy) —
// tránh hẳn cái bẫy escape dấu nháy trong template literal mà README đã cảnh báo.
// Hiệu ứng: lá bài BAY từ shoe về chỗ khi chia. Lá NHÂN ĐÔI úp lại cho người chơi tự nặn.

const PAGE = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
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
.topbar{display:flex;justify-content:space-between;font-size:11px;color:#cfe7ff;opacity:.85;padding:2px 8px}
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
.handzone{display:flex;gap:8px;justify-content:center;align-items:flex-start;min-height:96px;max-width:100%;overflow-x:auto;overflow-y:visible;padding-bottom:2px}
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
.handacts{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;width:150px;max-width:150px}
.handacts button{padding:11px 2px;font-size:12px;border-radius:8px}
.handacts button:disabled{background:#16281d;color:#4a6152}
.ava{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px;color:#08120b;border:2px solid #ffffffcc;box-shadow:0 2px 6px #0007;margin-top:2px}
.pname{font-size:12px;font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pbet{font-size:11px;color:var(--gold);font-weight:800;background:#0007;border-radius:10px;padding:1px 7px}
.emptyseat{opacity:.5;font-size:12px;color:#dbeeff;text-align:center;padding:24px 0}
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
/* NẶN: lá bay tới rồi TỰ LẬT từ từ mở mặt (không cần bấm). Chưa "nặn" thì cũng tự hiện. */
.card.reveal{animation:reveal .8s cubic-bezier(.2,.7,.3,1) both}
@keyframes reveal{0%{transform:translate(200px,-160px) rotateY(90deg) rotate(16deg);opacity:0}
  45%{opacity:1;transform:translateY(0) rotateY(90deg)}75%{transform:rotateY(55deg)}100%{transform:none;opacity:1}}
/* ---- thanh điều khiển đáy ---- */
#bar{padding:8px 10px 12px;background:#081a12;border-top:1px solid #14361f}
.betbox{display:flex;gap:8px;align-items:center}
#betInput{flex:1;background:#0a1712;border:1px solid #1f4a34;border-radius:10px;color:var(--tx);padding:12px;font-size:17px;text-align:center;font-weight:900}
.chips{display:flex;gap:6px;margin-top:8px}
.chip{flex:1;min-width:52px;background:#1a3a28;color:#d6f0dd;padding:10px 0;font-size:13px}
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
</style></head><body>

<div id="login">
  <h1>🂡 Blackjack — Xì Dách</h1>
  <div class="sub">Ăn 1.5 (3:2) · Nhà cái dừng ở mọi 17 · 4 bộ bài</div>
  <div class="sub">Nhập Discord ID + mã PIN (lấy bằng nút 🌐 trên bảng trong Discord).</div>
  <input id="uid" inputmode="numeric" placeholder="Discord ID">
  <input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">
  <button class="btn-gold full" id="loginBtn">Vào bàn</button>
  <div id="loginErr" class="sub" style="color:var(--red)"></div>
</div>

<div id="app" class="hidden">
  <div class="hbar">
    <div><span class="conn" id="conn">•</span> <b>Blackjack</b></div>
    <div class="bal"><span id="bal">0</span> 🐕</div>
  </div>
  <div id="felt">
    <div class="rail"></div>
    <div class="topbar"><span>4 BỘ BÀI</span><span id="shoeInfo"></span></div>
    <div class="dealer"><div class="dealerlbl">NHÀ CÁI <span id="dtot"></span></div><div class="cards" id="dealerCards"></div></div>
    <div class="banner"><div class="b1">BLACKJACK ĂN 1.5 (3 : 2)</div><div class="b2">Nhà cái dừng ở mọi 17</div></div>
    <div id="status"></div>
    <div id="seatRow"></div>
  </div>
  <div id="bar"></div>
</div>

<div id="pop"></div>
<div id="toast"></div>

<script>
var TOKEN=localStorage.getItem("bj_token")||"";
var WS=null, ST=null, MYID="", BAL=0, seenCards={};
function $(id){return document.getElementById(id)}
function toast(m){var t=$("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2400)}
function pop(txt,color){var e=$("pop");e.textContent=txt;e.style.color=color;e.classList.remove("show");void e.offsetWidth;e.classList.add("show")}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":"&gt;"})}
function fmt(n){return Number(n||0).toLocaleString("vi-VN")}
function setBal(v){if(typeof v!=="number")return;BAL=v;$("bal").textContent=fmt(v)}

// ---- đăng nhập ----
function doLogin(){
  var u=$("uid").value.trim(), p=$("pin").value.trim();
  if(!u||!p){$("loginErr").textContent="Nhập đủ ID và PIN";return}
  fetch("/bj/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})})
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
    else if(m.type==="result"){if(typeof m.net==="number"&&m.net!==0)pop((m.net>0?"+":"")+fmt(m.net)+" 🐕",m.net>0?"#4fe38a":"#ff6b6b")}
    else if(m.type==="authok"){MYID=m.userId;if(typeof m.balance==="number")setBal(m.balance)}
    else if(m.type==="authfail"){localStorage.removeItem("bj_token");location.reload()}
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
function drawCards(container,cards,pfx){
  container.innerHTML="";
  cards.forEach(function(c,i){
    var key=pfx+"|"+i+"|"+c;
    var isNew=!seenCards[key];seenCards[key]=1;
    var el=cardEl(c);
    // lá MỚI: bay tới + tự lật (nặn). Giãn thời gian giữa các lá cho dễ nhìn.
    if(isNew){el.className+=" reveal";el.style.animationDelay=(i*0.22)+"s"}
    container.appendChild(el);
  });
}

function render(m){
  ST=m;
  if(typeof m.balance==="number")setBal(m.balance);
  var t=m.table;
  if(t&&t.dealer){drawCards($("dealerCards"),t.dealer.cards,"D",{});$("dtot").textContent=t.dealer.hidden?"":("• "+t.dealer.total)}
  else{$("dealerCards").innerHTML="";$("dtot").textContent=""}
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
  renderSeats(m);renderBar(m);
}
function seatName(i){if(!ST)return "#"+(i+1);var s=ST.seats[i];return s&&!s.empty?s.name:("Ghế "+(i+1))}
function avaColor(u){var h=0;u=String(u||"");for(var i=0;i<u.length;i++)h=(h*31+u.charCodeAt(i))>>>0;return "hsl("+(h%360)+",70%,62%)"}

function renderSeats(m){
  var box=$("seatRow");box.innerHTML="";var tbl=m.table;
  for(var i=0;i<m.seats.length;i++){
    var seat=m.seats[i];
    var div=document.createElement("div");div.className="seat";
    var isTurn=tbl&&tbl.turn&&tbl.turn.seat===i;if(isTurn)div.className+=" turn";
    if(seat.empty){div.innerHTML='<div class="emptyseat">Ghế '+(i+1)+'<br>trống</div>';box.appendChild(div);continue}
    var tseat=tbl?tbl.seats.find(function(x){return x.seat===i}):null;
    var nHands=tseat&&tseat.hands?tseat.hands.length:0;
    var myTurn=tbl&&tbl.turn&&tbl.turn.userId===MYID;
    var turnOpts=(tbl&&tbl.turn&&tbl.turn.options)||[];
    // bài (trên) — nhiều tay thì CUỘN NGANG trong ghế, ghế không đổi vị trí
    var hz=document.createElement("div");hz.className="handzone";
    var activeEl=null;
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
        if(h.bust){var bo=document.createElement("div");bo.className="bomb";bo.textContent="💣 -"+fmt(h.bet);hd.appendChild(bo)}
        if(m.lastResult){var oc=outClass(h.outcome);if(oc){var ob=document.createElement("div");ob.className="out "+oc.c;ob.textContent=oc.t;hd.appendChild(ob)}}
        // NÚT thao tác ngay DƯỚI lá bài của tụ đang chơi (chỉ ghế mình, đúng lượt)
        if(h.active&&myTurn){var acts=document.createElement("div");acts.className="handacts";
          acts.innerHTML=ab("hit","🃏 Rút",turnOpts)+ab("stand","✋ Dừng",turnOpts)+ab("double","💰 Nhân đôi",turnOpts)+ab("split","✂️ Tách",turnOpts);
          hd.appendChild(acts);}
        if(h.active)activeEl=hd;
        hz.appendChild(hd);
      });
    }
    div.appendChild(hz);
    // cuộn tới tụ đang chơi cho khỏi lạc khi có nhiều tay
    if(activeEl)setTimeout(function(){try{activeEl.scrollIntoView({inline:"center",block:"nearest"})}catch(e){}},0);
    // avatar + tên + số dư/cược (dưới)
    var ava=document.createElement("div");ava.className="ava";ava.style.background=avaColor(seat.userId);ava.textContent=(seat.name||"?").slice(0,2).toUpperCase();div.appendChild(ava);
    var nm=document.createElement("div");nm.className="pname";nm.textContent=(seat.userId===MYID?"★ ":"")+seat.name;div.appendChild(nm);
    if(seat.bet>0){var bt=document.createElement("div");bt.className="pbet";bt.textContent="🐕 "+fmt(seat.bet);div.appendChild(bt)}
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
    sig="pick|"+m.seats.map(function(s){return s.empty?1:0}).join("");
    if(sig===lastBarSig)return;
    html='<div class="waiting">Chọn ghế để vào bàn</div><div class="seatpick">';
    for(var i=0;i<m.seats.length;i++)html+='<button data-sit="'+i+'"'+(m.seats[i].empty?"":" disabled")+'>Ghế '+(i+1)+(m.seats[i].empty?"":" ✕")+'</button>';
    html+='</div>';
  }else if(myTurn){
    // Nút thao tác giờ nằm DƯỚI lá bài của tụ (trong bàn), không ở thanh đáy nữa.
    sig="acts|"+m.table.turn.handIdx;
    if(sig===lastBarSig)return;
    html='<div class="waiting">👆 Tới lượt bạn — bấm nút ngay dưới lá bài của tụ đang chơi</div>';
  }else if(m.phase==="idle"||m.phase==="betting"){
    var placed=seat&&seat.bet>0;
    sig="bet|"+(placed?seat.bet:0);          // đổi khi ĐẶT xong, không đổi khi đang gõ
    if(sig===lastBarSig)return;
    html='<div class="betbox"><input id="betInput" inputmode="numeric" placeholder="Số Dogcoin cược" value="'+(placed?seat.bet:"")+'">'+
      '<button class="chip" data-leave="1" style="flex:0 0 auto;padding:12px 14px">Rời</button></div>'+
      '<div class="chips"><button class="chip" data-add="50">+50</button><button class="chip" data-add="100">+100</button>'+
      '<button class="chip" data-add="500">+500</button><button class="chip" data-add="1000">+1k</button><button class="chip" data-max="1">MAX</button></div>'+
      '<button class="btn-gold full" data-place="1">'+(placed?"ĐỔI CƯỢC":"ĐẶT CƯỢC")+'</button>';
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

// ---- uỷ quyền sự kiện (không onclick inline) ----
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-sit],[data-act],[data-add],[data-max],[data-place],[data-leave]");
  if(!el)return;
  if(el.id==="loginBtn")return;
  if(el.dataset.sit!==undefined)cmd("sit",{seat:+el.dataset.sit});
  else if(el.dataset.act!==undefined)cmd("act",{action:el.dataset.act});
  else if(el.dataset.add!==undefined){var b=$("betInput");if(b)b.value=(parseInt(b.value||"0")||0)+(+el.dataset.add)}
  else if(el.dataset.max!==undefined){var b2=$("betInput");if(b2)b2.value=BAL}
  else if(el.dataset.place!==undefined){var v=parseInt(($("betInput")||{}).value);if(!v||v<=0)return toast("Nhập số Dogcoin");cmd("bet",{amount:v})}
  else if(el.dataset.leave!==undefined)cmd("leave");
});
$("loginBtn").addEventListener("click",doLogin);
$("pin").addEventListener("keydown",function(e){if(e.key==="Enter")doLogin()});
if(TOKEN)enter();
</script></body></html>`;

module.exports = { PAGE };
