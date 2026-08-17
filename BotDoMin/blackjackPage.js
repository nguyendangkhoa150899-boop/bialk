// ===== TRANG BLACKJACK (dùng chung cho harness test lẫn bot thật) =====
// Không nội suy dữ liệu server (${}) — mọi thứ động đến qua WebSocket. Nhờ vậy trang
// là hằng số tĩnh, không lo XSS server-side, và require() được ở cả hai nơi.
// Hiệu ứng: lá bài BAY từ shoe (góc phải trên) về đúng chỗ khi chia.

const PAGE = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Blackjack — Xì Dách</title>
<style>
:root{--bg:#0d1a12;--felt:#0f5132;--felt2:#0b3d26;--gold:#ffcf5c;--tx:#eaf2ec;--muted:#9fb3a6;--red:#e0474b;--line:#1f4a34}
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{background:radial-gradient(120% 90% at 50% 0%,#143a26 0%,#0c2418 55%,#07130c 100%);color:var(--tx);min-height:100vh;padding:10px;max-width:760px;margin:0 auto;touch-action:pan-x pan-y}
.hbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.hbar h1{font-size:18px;letter-spacing:1px}.hbar .bal{font-weight:900;color:var(--gold)}
#login{background:#12261a;border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:40px}
#login input{width:100%;background:#0c1c13;border:1px solid var(--line);border-radius:10px;color:var(--tx);padding:12px;font-size:16px;margin-top:8px}
button{border:0;border-radius:10px;padding:11px 14px;font-size:15px;font-weight:800;cursor:pointer;color:#08120b}
.btn-gold{background:linear-gradient(180deg,#ffe9a8,#e0b750);color:#3d2c05}
.btn-blue{background:linear-gradient(180deg,#5aa9ff,#2c6fd0);color:#fff}
.btn-grey{background:#22402e;color:#cfe0d4}
.full{width:100%;margin-top:10px}
/* ---- bàn ---- */
#table{background:linear-gradient(180deg,var(--felt),var(--felt2));border:2px solid #093;border-radius:18px;padding:12px;position:relative;overflow:hidden;box-shadow:inset 0 0 60px #0006}
#shoe{position:absolute;top:8px;right:10px;width:34px;height:46px;border-radius:5px;background:linear-gradient(135deg,#c0392b,#7d1f16);border:2px solid #ffce6b;box-shadow:0 2px 5px #0007}
.status{text-align:center;font-size:13px;color:#d6ffe4;min-height:18px;margin:2px 0 8px}
.clock{display:inline-block;min-width:26px;font-weight:900;color:var(--gold)}
/* nhà cái */
.dealer{text-align:center;margin-bottom:10px}
.dealer .lbl{font-size:12px;color:var(--muted);letter-spacing:1px}
/* hàng ghế */
.seats{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.seat{flex:1 1 128px;min-width:118px;max-width:150px;background:#0c2417cc;border:1px solid var(--line);border-radius:12px;padding:7px;min-height:150px;display:flex;flex-direction:column;align-items:center;gap:4px}
.seat.turn{border-color:var(--gold);box-shadow:0 0 0 2px #ffcf5c55,0 0 16px #ffcf5c44}
.seat.mine{background:#0e3020cc}
.seat .who{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.seat .bet{font-size:11px;color:var(--gold)}
.seat .empty{color:var(--muted);font-size:12px;margin-top:30px}
.hands{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}
.hand{display:flex;flex-direction:column;align-items:center;padding:3px;border-radius:8px}
.hand.active{background:#ffcf5c22;outline:1px dashed #ffcf5c88}
.hand .tot{font-size:12px;font-weight:800;margin-top:2px}
.hand .out{font-size:11px;font-weight:800;padding:1px 6px;border-radius:6px;margin-top:2px}
.out.win{background:#173423;color:#3ddc84}.out.lose{background:#3a1d1d;color:#ff7b7b}.out.push{background:#333;color:#ddd}.out.bj{background:#4a3a10;color:var(--gold)}
/* lá bài */
.cards{display:flex}
.card{width:38px;height:54px;border-radius:6px;background:#fbfbf7;color:#111;border:1px solid #0002;box-shadow:0 1px 3px #0006;
  margin-left:-14px;display:flex;flex-direction:column;justify-content:space-between;padding:3px 4px;font-weight:900;font-size:13px;position:relative}
.card:first-child{margin-left:0}
.card.red{color:#c0392b}
.card .s{align-self:flex-end;font-size:15px;line-height:1}
.card.back{background:repeating-linear-gradient(45deg,#7d1f16,#7d1f16 5px,#a5342a 5px,#a5342a 10px);border:2px solid #ffce6b;color:transparent}
.card.fly{animation:deal .42s cubic-bezier(.2,.8,.25,1) both}
@keyframes deal{0%{transform:translate(200px,-160px) rotate(24deg);opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}
/* khu điều khiển */
#ctl{margin-top:12px;background:#0c2417;border:1px solid var(--line);border-radius:12px;padding:10px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.chip{flex:1;min-width:56px;background:#22402e;color:#cfe0d4}
.acts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.acts button{padding:14px 4px;font-size:14px}
.act-hit{background:linear-gradient(180deg,#5aa9ff,#2c6fd0);color:#fff}
.act-stand{background:linear-gradient(180deg,#ff9a5c,#d9541e);color:#fff}
.act-double{background:linear-gradient(180deg,#b98cff,#7b3fd0);color:#fff}
.act-split{background:linear-gradient(180deg,#4dd07a,#249a52);color:#04240f}
.acts button:disabled{background:#22402e;color:#5a7264}
#betInput{width:100%;background:#0c1c13;border:1px solid var(--line);border-radius:10px;color:var(--tx);padding:11px;font-size:16px;text-align:center;font-weight:800}
.seatbtns{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:8px}
.seatbtns button{padding:10px 2px;font-size:12px;background:#22402e;color:#cfe0d4}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#000d;padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:99;max-width:90%}
#pop{position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);font-size:40px;font-weight:900;opacity:0;pointer-events:none;z-index:98;text-shadow:0 2px 12px #000c}
#pop.show{animation:pf 2.6s ease-out forwards}
@keyframes pf{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}15%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-95%) scale(.9)}}
.hidden{display:none}
.conn{font-size:11px;color:var(--muted)}
</style></head><body>

<div id="login">
<h1>🂡 Blackjack — Xì Dách</h1>
<div class="conn" style="margin-top:6px">Nhập Discord ID + mã PIN (lấy bằng nút 🌐 trên bảng trong Discord).</div>
<input id="uid" inputmode="numeric" placeholder="Discord ID">
<input id="pin" inputmode="numeric" placeholder="Mã PIN 6 số">
<button class="btn-gold full" onclick="doLogin()">Vào bàn</button>
<div id="loginErr" class="conn" style="color:var(--red);margin-top:8px"></div>
</div>

<div id="app" class="hidden">
  <div class="hbar">
    <h1>🂡 Blackjack</h1>
    <div><span class="conn" id="conn">•</span> &nbsp; <span class="bal"><span id="bal">0</span> 🐕</span></div>
  </div>

  <div id="table">
    <div id="shoe"></div>
    <div class="dealer">
      <div class="lbl">NHÀ CÁI <span id="dtot"></span></div>
      <div class="cards" id="dealerCards" style="justify-content:center"></div>
    </div>
    <div class="status" id="status"></div>
    <div class="seats" id="seats"></div>
  </div>

  <div id="ctl"></div>
</div>

<div id="pop"></div>
<div id="toast"></div>

<script>
var TOKEN=localStorage.getItem("bj_token")||"";
var WS=null, ST=null, MYID="", BAL=0, seenCards={};
function $(id){return document.getElementById(id)}
function toast(m){var t=$("toast");t.textContent=m;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity=0},2400)}
function pop(txt,color){var e=$("pop");e.textContent=txt;e.style.color=color;e.classList.remove("show");void e.offsetWidth;e.classList.add("show")}

function doLogin(){
  var u=$("uid").value.trim(), p=$("pin").value.trim();
  if(!u||!p){$("loginErr").textContent="Nhập đủ ID và PIN";return}
  fetch("/bj/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:u,pin:p})})
    .then(function(r){return r.json()}).then(function(j){
      if(!j.ok){$("loginErr").textContent=j.error||"Sai thông tin";return}
      TOKEN=j.token;localStorage.setItem("bj_token",TOKEN);enter(j.balance);
    }).catch(function(){$("loginErr").textContent="Lỗi mạng"});
}
function enter(bal){
  $("login").classList.add("hidden");$("app").classList.remove("hidden");
  if(typeof bal==="number")setBal(bal);
  connect();
}
function setBal(v){BAL=v;$("bal").textContent=Number(v).toLocaleString("vi-VN")}

function connect(){
  var proto=location.protocol==="https:"?"wss":"ws";
  WS=new WebSocket(proto+"://"+location.host+"/ws");
  WS.onopen=function(){$("conn").textContent="🟢";WS.send(JSON.stringify({type:"auth",token:TOKEN}))};
  WS.onclose=function(){$("conn").textContent="🔴";setTimeout(connect,1500)};
  WS.onmessage=function(ev){var m;try{m=JSON.parse(ev.data)}catch(e){return}
    if(m.type==="state"){render(m)}
    else if(m.type==="balance"){setBal(m.balance)}
    else if(m.type==="toast"){toast(m.msg)}
    else if(m.type==="denied"){toast("❌ "+(m.error||"không được"))}
    else if(m.type==="result"){/* nhấn mạnh ăn/thua của mình */ if(typeof m.net==="number"&&m.net!==0)pop((m.net>0?"+":"")+Number(m.net).toLocaleString("vi-VN")+" 🐕",m.net>0?"#3ddc84":"#ff5d5d")}
    else if(m.type==="authok"){MYID=m.userId;if(typeof m.balance==="number")setBal(m.balance)}
    else if(m.type==="authfail"){localStorage.removeItem("bj_token");location.reload()}
  };
}
function send(o){if(WS&&WS.readyState===1)WS.send(JSON.stringify(o))}
function cmd(c,extra){send(Object.assign({type:"bj",cmd:c},extra||{}))}

// ---- vẽ 1 lá bài ----
var SUIT_RED={"♥":1,"♦":1};
function cardEl(str,key,fly){
  var d=document.createElement("div");
  if(str==="🂠"){d.className="card back";if(fly)d.classList.add("fly");return d}
  var suit=str.slice(-1), rank=str.slice(0,-1);
  d.className="card"+(SUIT_RED[suit]?" red":"")+(fly?" fly":"");
  d.innerHTML='<div>'+rank+'</div><div class="s">'+suit+'</div>';
  return d;
}
function drawCards(container,cards,idpfx){
  container.innerHTML="";
  cards.forEach(function(c,i){
    var key=idpfx+"|"+i+"|"+c;
    var isNew=!seenCards[key];
    seenCards[key]=1;
    var el=cardEl(c,key,isNew);
    if(isNew)el.style.animationDelay=(i*0.08)+"s";
    container.appendChild(el);
  });
}

function render(m){
  ST=m;
  if(typeof m.balance==="number")setBal(m.balance);
  // nhà cái
  var t=m.table;
  if(t&&t.dealer){drawCards($("dealerCards"),t.dealer.cards,"D");$("dtot").textContent=t.dealer.hidden?"":("• "+t.dealer.total)}
  else{$("dealerCards").innerHTML="";$("dtot").textContent=""}
  // trạng thái + đồng hồ
  var s=$("status");
  var clk=m.timeLeft>0?'<span class="clock">'+m.timeLeft+'s</span>':"";
  if(m.phase==="idle")s.innerHTML="Chờ người đặt cược để mở ván...";
  else if(m.phase==="betting")s.innerHTML="🟢 Đặt cược — chia sau "+clk;
  else if(m.phase==="playing"){var tn=t&&t.turn;s.innerHTML=tn?("Lượt: <b>"+seatName(tn.seat)+"</b> "+clk):"Nhà cái đang rút...";}
  else if(m.phase==="result")s.innerHTML="Kết quả — ván mới sau "+clk;
  // ghế
  renderSeats(m);
  // reset seenCards khi bắt đầu ván mới (không còn bài trên bàn)
  if(m.phase==="idle"||m.phase==="betting")seenCards={};
  // điều khiển
  renderCtl(m);
}
function seatName(i){if(!ST)return "#"+(i+1);var s=ST.seats[i];return s&&!s.empty?s.name:("Ghế "+(i+1))}

function renderSeats(m){
  var box=$("seats");box.innerHTML="";
  var tbl=m.table;
  for(var i=0;i<m.seats.length;i++){
    var seat=m.seats[i];
    var div=document.createElement("div");
    div.className="seat"+(i===m.mySeat?" mine":"");
    var tseat=tbl?tbl.seats.find(function(x){return x.seat===i}):null;
    var isTurn=tbl&&tbl.turn&&tbl.turn.seat===i;
    if(isTurn)div.className+=" turn";
    if(seat.empty){
      div.innerHTML='<div class="empty">Ghế '+(i+1)+'<br>(trống)</div>';
    }else{
      var html='<div class="who">'+esc(seat.name)+(seat.userId===MYID?" (bạn)":"")+'</div>';
      if(seat.bet>0)html+='<div class="bet">cược '+Number(seat.bet).toLocaleString("vi-VN")+'</div>';
      div.innerHTML=html;
      var hwrap=document.createElement("div");hwrap.className="hands";
      if(tseat&&tseat.hands){
        tseat.hands.forEach(function(h,hi){
          var hd=document.createElement("div");hd.className="hand"+(h.active?" active":"");
          var cc=document.createElement("div");cc.className="cards";
          drawCards(cc,h.cards,"S"+i+"H"+hi);
          hd.appendChild(cc);
          var tot=document.createElement("div");tot.className="tot";tot.textContent=h.total+(h.soft?" (mềm)":"")+(h.bust?" QUẮC":"");hd.appendChild(tot);
          if(m.lastResult){var oc=outClass(h.outcome);if(oc){var ob=document.createElement("div");ob.className="out "+oc.c;ob.textContent=oc.t;hd.appendChild(ob)}}
          hwrap.appendChild(hd);
        });
      }
      div.appendChild(hwrap);
    }
    box.appendChild(div);
  }
  // gắn kết quả từng tay vào (result phase)
  if(m.lastResult&&m.lastResult.result){
    m.lastResult.result.forEach(function(d){ /* outcome đã vẽ qua tseat.hands ở trên nếu có */ });
  }
}
function outClass(o){if(!o)return null;if(o==="thắng")return{c:"win",t:"THẮNG"};if(o==="thua")return{c:"lose",t:"THUA"};if(o==="hoà")return{c:"push",t:"HOÀ"};if(o==="blackjack")return{c:"bj",t:"BLACKJACK"};return null}

function renderCtl(m){
  var c=$("ctl");
  // chưa ngồi -> nút chọn ghế
  if(m.mySeat<0){
    var h='<div style="font-size:13px;color:var(--muted)">Chọn một ghế để ngồi vào bàn:</div><div class="seatbtns">';
    for(var i=0;i<m.seats.length;i++){
      var e=m.seats[i].empty;
      h+='<button onclick="cmd(\\'sit\\',{seat:'+i+'})"'+(e?"":" disabled")+'>Ghế '+(i+1)+(e?"":" ✕")+'</button>';
    }
    h+='</div>';c.innerHTML=h;return;
  }
  // đã ngồi
  var myTurn=m.table&&m.table.turn&&m.table.turn.userId===MYID;
  var seat=m.seats[m.mySeat];
  if(myTurn){
    var opts=m.table.turn.options;
    c.innerHTML='<div style="font-size:13px;color:var(--gold);text-align:center">TỚI LƯỢT BẠN</div>'+
      '<div class="acts">'+
      actBtn("hit","Rút",opts)+actBtn("stand","Dừng",opts)+
      actBtn("double","Nhân đôi",opts)+actBtn("split","Tách",opts)+'</div>';
    return;
  }
  if(m.phase==="idle"||m.phase==="betting"){
    var placed=seat&&seat.bet>0;
    c.innerHTML=
      '<div style="display:flex;gap:8px;align-items:center">'+
      '<input id="betInput" inputmode="numeric" placeholder="Số Dogcoin cược" value="'+(placed?seat.bet:"")+'">'+
      '<button class="btn-grey" onclick="cmd(\\'leave\\')">Rời ghế</button></div>'+
      '<div class="chips">'+
      chip(50)+chip(100)+chip(500)+chip(1000)+'<button class="chip" onclick="betAll()">MAX</button></div>'+
      '<button class="btn-gold full" onclick="placeBet()">'+(placed?"Đổi cược":"ĐẶT CƯỢC")+'</button>'+
      (placed?'<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:6px">Đã đặt — chờ chia bài</div>':"");
    return;
  }
  // đang chơi nhưng không phải lượt mình / đang result
  c.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px">'+
    (m.phase==="result"?"Ván kết thúc — chờ ván mới":(seat&&seat.bet>0?"Đang trong ván — chờ tới lượt bạn":"Bạn không đặt ván này — chờ ván sau"))+
    '</div>';
}
function actBtn(a,label,opts){var on=opts.indexOf(a)>=0;return '<button class="act-'+a+'" '+(on?"":"disabled")+' onclick="cmd(\\'act\\',{action:\\''+a+'\\'})">'+label+'</button>'}
function chip(n){return '<button class="chip" onclick="addBet('+n+')">+'+n+'</button>'}
function addBet(n){var b=$("betInput");b.value=(parseInt(b.value||"0")||0)+n}
function betAll(){$("betInput").value=BAL}
function placeBet(){var v=parseInt($("betInput").value);if(!v||v<=0)return toast("Nhập số Dogcoin");cmd("bet",{amount:v})}

function esc(s){return String(s).replace(/[&<>]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":"&gt;"})}

if(TOKEN)enter();
$("pin")&&$("pin").addEventListener("keydown",function(e){if(e.key==="Enter")doLogin()});
</script></body></html>`;

module.exports = { PAGE };
