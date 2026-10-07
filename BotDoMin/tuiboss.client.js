// 🎒 05/10: giao dien TUI DO BOSS (trang Ca nhan) - phuc vu o /tb.js, doc lai moi lan tai -> sua khong can restart bot.
// Ve vao #tbList (tui CHUA nhan, the lon co hinh) + #tbDone (tui DA nhan, thu gon, bam de mo).
// Dung chung: api, esc, toast, vqIcon (trang choi). Ghi de window.tbSync / window.tbNhan cu trong webplay.js.
(function () {
  var css = [
    '#tbCard .tbHead{display:flex;align-items:center;gap:8px}',
    '#tbCard .tbBadge{margin-left:auto;background:#3a2a0c;border:1px solid #f5c542;color:#ffd76a;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800;white-space:nowrap}',
    '#tbCard .tbBadge.zero{background:#1a1f2d;border-color:#2a3340;color:var(--muted)}',
    '#tbCard .tbHint{font-size:12px;margin-top:4px}',
    '#tbCard .tbAll{display:block;width:100%;margin-top:10px;padding:10px;font-size:15px;font-weight:900;border:0;border-radius:11px;color:#0c2417;background:linear-gradient(180deg,#5ef0a0,#2fbf71);box-shadow:0 2px 0 #14683a;cursor:pointer}',
    '#tbCard .tbBag{position:relative;margin-top:10px;border:1px solid #6b5420;border-radius:13px;padding:10px 12px;background:linear-gradient(180deg,#1f1a10,#141824 60%)}',
    '#tbCard .tbBag:before{content:"";position:absolute;inset:0 0 auto 0;height:3px;border-radius:13px 13px 0 0;background:linear-gradient(90deg,#f5c542,#ff8a3d)}',
    '#tbCard .tbTop{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '#tbCard .tbTen{font-size:16px;font-weight:900;color:#ffe08a}',
    '#tbCard .tbTg{font-size:12px;color:var(--muted)}',
    '#tbCard .tbHan{margin-left:auto;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:#13261b;color:#7ee2a8;border:1px solid #2f6b46}',
    '#tbCard .tbHan.gap{background:#2a1416;color:#ffb4b4;border-color:#7a3434}',
    '#tbCard .tbGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-top:8px}',
    '#tbCard .tbIt{display:flex;align-items:center;gap:8px;background:#11141e;border:1px solid #262c3d;border-radius:10px;padding:5px 7px;min-width:0}',
    '#tbCard .tbIc{display:block;width:36px;height:36px;flex:0 0 36px;border-radius:7px;background-repeat:no-repeat;border:1px solid #6b4a1a}',
    '#tbCard .tbIc.vqNo{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:20px;background:#1a1f2d}',
    '#tbCard .tbIt .n{flex:1;min-width:0;font-size:12px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '#tbCard .tbIt .q{font-size:13px;font-weight:900;color:#ffd76a;white-space:nowrap}',
    '#tbCard .tbIt.knb{border-color:#6b5420;background:#1d180c}#tbCard .tbIt.luot{border-color:#2f6b46;background:#10201a}',
    '#tbCard .tbIt .emo{width:36px;height:36px;flex:0 0 36px;display:flex;align-items:center;justify-content:center;font-size:22px}',
    '#tbCard .tbGo{display:block;width:100%;margin-top:10px;padding:10px;font-size:15px;font-weight:900;border:0;border-radius:11px;color:#fff;background:linear-gradient(180deg,#2fbf71,#1f9a57);box-shadow:0 2px 0 #14683a;cursor:pointer}',
    '#tbCard .tbGo:disabled,#tbCard .tbAll:disabled{opacity:.5;cursor:wait}',
    '#tbCard .tbEmpty{margin-top:10px;padding:10px 12px;border:1px dashed #2a3340;border-radius:11px;color:var(--muted);font-size:13px}',
    '#tbCard .tbDoneBtn{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;padding:9px 12px;background:#151826;border:1px solid #2a3340;border-radius:11px;color:var(--tx);font-size:13px;font-weight:800;cursor:pointer;text-align:left}',
    '#tbCard .tbDoneBtn span{margin-left:auto;color:var(--muted)}',
    '#tbCard .tbDoneList{margin-top:6px;max-height:340px;overflow:auto}',
    '#tbCard .tbRow{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #ffffff0d;font-size:12px}',
    '#tbCard .tbRow .t{min-width:0;flex:1}#tbCard .tbRow .t b{color:var(--tx)}',
    '#tbCard .tbMini{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;max-width:55%}',
    '#tbCard .tbMini .tbIc{width:22px;height:22px;flex:0 0 22px;border-radius:4px}',
    '#tbCard .tbMini .tbIc.vqNo{font-size:12px}',
  ].join('');
  var MO = false; try { MO = localStorage.getItem('tb_mo') === '1'; } catch (e) {}
  var BUSY = false;
  function ic(j, id, cls) { return typeof vqIcon === 'function' ? vqIcon((j.ic || {})[id], cls || 'tbIc') : ''; }
  function tg(t) { var d = new Date(t); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function han(t) { var ms = t - Date.now(); if (!(ms > 0)) return '<span class="tbHan gap">sắp hết hạn</span>'; var ng = Math.floor(ms / 86400000), gio = Math.floor(ms % 86400000 / 3600000); return '<span class="tbHan' + (ms < 86400000 ? ' gap' : '') + '">⏳ còn ' + (ng ? ng + ' ngày ' : '') + gio + ' giờ</span>'; }
  function tenMon(j, id) { return (j.ten || {})[id] || ('#' + id); }
  function veTui(j, x) {
    var h = '<div class="tbBag"><div class="tbTop"><span class="tbTen">🎒 ' + esc(x.ten) + '</span><span class="tbTg">' + tg(x.t) + '</span>' + han(x.han) + '</div><div class="tbGrid">';
    x.mon.forEach(function (m) { h += '<div class="tbIt" title="' + esc(tenMon(j, m[0])) + '">' + ic(j, m[0]) + '<div class="n">' + esc(tenMon(j, m[0])) + '</div><div class="q">×' + m[1] + '</div></div>'; });
    if (x.knb) h += '<div class="tbIt knb"><div class="emo">💰</div><div class="n">KNB vào ví</div><div class="q">' + Number(x.knb).toLocaleString('vi-VN') + '</div></div>';
    if (x.luot) h += '<div class="tbIt luot"><div class="emo">🍀</div><div class="n">Lượt Vòng May Mắn</div><div class="q">×' + x.luot + '</div></div>';
    return h + '</div><button class="tbGo" onclick="tbNhan(\'' + x.id + '\',this)">🎁 NHẬN TÚI</button></div>';
  }
  function veDa(j, x) {
    var tom = x.mon.slice(0, 8).map(function (m) { return ic(j, m[0]); }).join('');
    return '<div class="tbRow"><div class="t">✅ <b>' + esc(x.ten) + '</b> <span class="muted">' + tg(x.t) + '</span><br><span class="muted">' + x.mon.length + ' món' + (x.knb ? ' · ' + Number(x.knb).toLocaleString('vi-VN') + ' KNB' : '') + (x.luot ? ' · 🍀 ' + x.luot : '') + '</span></div><div class="tbMini">' + tom + '</div></div>';
  }
  window.tbSync = function () {
    api('/api/tuiboss/list').then(function (j) {
      var st = document.getElementById('tbStat'), box = document.getElementById('tbList'), da = document.getElementById('tbDone');
      if (!st || !box) return;
      if (!document.getElementById('tbCss')) { var s = document.createElement('style'); s.id = 'tbCss'; s.textContent = css; document.head.appendChild(s); }
      if (!j.linked) { st.textContent = ''; st.className = 'tbBadge zero'; box.innerHTML = '<div class="tbEmpty">Chưa liên kết nhân vật trong game - nhắn admin liên kết để nhận túi boss.</div>'; if (da) da.innerHTML = ''; return; }
      var cho = j.tui.filter(function (x) { return !x.nhan; }), xong = j.tui.filter(function (x) { return x.nhan; });
      st.textContent = cho.length ? cho.length + ' túi chờ nhận' : 'không có túi mới'; st.className = 'tbBadge' + (cho.length ? '' : ' zero');
      var h = '';
      if (!cho.length) h = '<div class="tbEmpty">🎒 Chưa có túi mới' + (j.ingameName ? ' cho <b>' + esc(j.ingameName) + '</b>' : '') + ' · hạ boss cuối phó bản / hoạt động rồi quay lại sau ~10 giây.</div>';
      else { if (cho.length > 1) h += '<button class="tbAll" onclick="tbNhanHet(this)">🎁 NHẬN TẤT CẢ (' + cho.length + ' túi)</button>'; cho.forEach(function (x) { h += veTui(j, x); }); }
      box.innerHTML = h;
      if (da) da.innerHTML = xong.length ? '<button class="tbDoneBtn" onclick="tbMo()">✅ Túi đã nhận (' + xong.length + ')<span>' + (MO ? 'thu gọn ▴' : 'xem ▾') + '</span></button>' + (MO ? '<div class="tbDoneList">' + xong.map(function (x) { return veDa(j, x); }).join('') + '</div>' : '') : '';
    }).catch(function () {});
  };
  window.tbMo = function () { MO = !MO; try { localStorage.setItem('tb_mo', MO ? '1' : '0'); } catch (e) {} window.tbSync(); };
  function nhan1(id) { return api('/api/tuiboss/nhan', { id: id }); }
  window.tbNhan = function (id, b) {
    if (BUSY) return; BUSY = true; if (b) { b.disabled = true; b.textContent = '⏳ Đang nhận...'; }
    nhan1(id).then(function () { BUSY = false; toast('✅ Đã nhận túi - đồ vào 🧰 Rương Ích Kỷ, KNB vào ví'); if (typeof dailySync === 'function') dailySync(); else window.tbSync(); })
      .catch(function (e) { BUSY = false; toast('❌ ' + ((e && e.message) || 'Lỗi')); if (b) { b.disabled = false; b.textContent = '🎁 NHẬN TÚI'; } });
  };
  // nhan lan luot tung tui (server giao tung tui, khong goi song song)
  window.tbNhanHet = function (b) {
    if (BUSY) return; BUSY = true; if (b) { b.disabled = true; b.textContent = '⏳ Đang nhận...'; }
    api('/api/tuiboss/list').then(function (j) {
      var ids = j.tui.filter(function (x) { return !x.nhan; }).map(function (x) { return x.id; }), ok = 0, loi = '';
      var tiep = function (i) {
        if (i >= ids.length) { BUSY = false; toast(loi ? '⚠️ Nhận ' + ok + '/' + ids.length + ' túi - ' + loi : '✅ Đã nhận ' + ok + ' túi - đồ vào 🧰 Rương Ích Kỷ'); if (typeof dailySync === 'function') dailySync(); else window.tbSync(); return; }
        nhan1(ids[i]).then(function () { ok++; tiep(i + 1); }).catch(function (e) { loi = (e && e.message) || 'Lỗi'; tiep(i + 1); });
      };
      tiep(0);
    }).catch(function (e) { BUSY = false; toast('❌ ' + ((e && e.message) || 'Lỗi')); if (b) b.disabled = false; });
  };
  if (document.getElementById('tbList')) window.tbSync();
})();
