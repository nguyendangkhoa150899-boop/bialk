// 🎁 19/10 TAB PHÁT QUÀ (chủ server: "chỗ add đồ có 3 phần") - phục vụ ở /pq.js, đọc lại mỗi lần tải (sửa không cần restart bot).
// Gom mọi chỗ admin gửi quà cho NHÂN VẬT về 1 tab: ① chọn người nhận ② chọn quà ③ chọn cách nhận (chỉ vật phẩm):
//   🗺️ Đổi bản đồ   = hàng quà game NetCo4Qua (panel GM a=qua): vào túi khi đăng nhập / đổi bản đồ, túi đầy thì phần còn lại chờ
//   🧙 NPC Ví Web    = kênh Thương Phố .tpin, giống Rương Ích Kỷ chuyển vào game: nhận ở NPC Ví Web "Nhận đồ Thương Phố"
//                      (hoặc khi đăng nhập / đổi bản đồ), game kiểm đủ ô túi mới phát, không phát trùng
//   🧰 Rương Ích Kỷ  = rương web của ví đã liên kết nhân vật, người chơi tự chuyển vào game
// API: /api/pq/data (nhân vật + quà chờ + ví liên kết), /api/pq/gui (gửi, trả kết quả từng nhân vật), /api/gm/pets, /api/gameitems,
// /api/gm/act a=huy_qua. Dùng hàm chung của panel: api, toast, uiConfirm, tab, icTra, ICMAP, vqaIc.
(function () {
  var PQ = { d: null, sel: {}, q: '', chiOn: false, loai: 'item', tien: 'knb', tien2: 'level', kenh: 'map', item: null, sl: 1, sao: 9, gt: '',
    items: null, itemsLoading: false, iq: '', pets: null, petGi: 0, petId: '', kq: null, busy: false, built: false };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loi(er) { if (!er || !er.toasted) toast('❌ ' + ((er && er.message) || er)); }
  function $(id) { return document.getElementById(id); }
  function icOf(id) { var v = ICMAP[id]; return v && v.ic ? v.ic : null; }   // ICMAP[id] = { ic: {f,x,y,w,h}, ten }
  function so(x) { return Number(x || 0).toLocaleString('vi-VN'); }
  function boDau(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }

  // loại quà: [mã gửi lên panel GM, nhãn, gợi ý ô giá trị, min, max]
  var TIEN = { knb: ['knb', 'KNB trong game', 'Số KNB', 1, 10000000], vang: ['vang', 'Vàng', 'Số vàng', 1, 100000],
    diemtang: ['diemtang', 'Điểm Tặng', 'Số Điểm Tặng', 1, 10000000], knbweb: ['knbweb', 'KNB ví web', 'Số KNB web', 1, 100000000] };
  var TIEN2 = { level: ['level', 'Lên cấp', 'Cấp 1 - 119', 1, 119], exp: ['exp', 'EXP', 'EXP 1 - 2 tỉ', 1, 2000000000],
    vip: ['vip', 'Cấp VIP', 'VIP 0 - 10', 0, 10], tamphap: ['tamphap', 'Tâm pháp môn phái', 'Cấp 1 - 159', 1, 159] };
  var LOAI = [['item', '📦 Vật phẩm'], ['itemsao', '⭐ Trang bị có sao'], ['pet', '🐾 Pet'], ['tien', '💰 Tiền'], ['tien2', '📈 Cấp / EXP / VIP'], ['popup', '🪟 Cửa sổ quà'], ['xoa', '🗑️ Xoá vật phẩm']];
  function laTimMon() { return PQ.loai === 'item' || PQ.loai === 'itemsao' || PQ.loai === 'popup' || PQ.loai === 'xoa'; }
  var PETG = [[0, 'Huyễn Hóa V2'], [1, 'Huyễn Hóa 12000'], [3, 'Huyễn Hóa Tân Thủ'], [2, 'Tất cả pet']];
  var KENH = [
    ['map', '🗺️ Đổi bản đồ', 'Vào túi khi đăng nhập hoặc đổi bản đồ (đang online: qua cổng / truyền tống). Túi đầy thì phần còn lại nhận lần sau.'],
    ['npc', '🧙 NPC Ví Web', 'Giống Rương Ích Kỷ chuyển vào game: tới NPC Ví Web bấm "Nhận đồ Thương Phố" (hoặc đổi bản đồ). Game kiểm đủ ô túi mới phát, không phát trùng. Tối đa 9.999.'],
    ['ruong', '🧰 Rương Ích Kỷ', 'Bỏ vào Rương Ích Kỷ trên web của ví đã liên kết, người chơi tự chuyển vào game. Nhân vật chưa liên kết ví sẽ báo lỗi.']];

  function css() {
    if ($('pqCss')) return;
    var s = document.createElement('style'); s.id = 'pqCss';
    s.textContent =
      '#pqRoot{display:grid;gap:14px}#pqRoot .pqGrid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}' +
      '@media(max-width:900px){#pqRoot .pqGrid{grid-template-columns:1fr}}' +
      '#pqRoot .card{margin:0}#pqRoot h3{margin:0 0 10px;font-size:16px}#pqRoot h3 small{font-weight:400;color:var(--mut);font-size:12.5px;margin-left:6px}' +
      '#pqRoot button{padding:7px 12px;font-size:13px;border-radius:8px}#pqRoot input,#pqRoot select{margin:0}' +
      '#pqRoot .pqBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}#pqRoot .pqBar input[type=text]{flex:1;min-width:160px;width:auto}' +
      '#pqRoot .pqChk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--mut);white-space:nowrap}#pqRoot .pqChk input{width:16px;height:16px}' +
      '#pqRoot .pqList{max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:10px}' +
      '#pqRoot .pqNv{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer}#pqRoot .pqNv:last-child{border-bottom:0}' +
      '#pqRoot .pqNv:hover{background:var(--card2)}#pqRoot .pqNv.on{background:rgba(53,196,106,.12)}#pqRoot .pqNv input{width:17px;height:17px;flex:0 0 auto}' +
      '#pqRoot .pqNv b{font-size:14px}#pqRoot .pqNv small{display:block;color:var(--mut);font-size:11.5px}#pqRoot .pqNv .pqR{margin-left:auto;text-align:right;font-size:12px;color:var(--mut);white-space:nowrap}' +
      '#pqRoot .pqDot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#59606e;margin-right:5px}#pqRoot .pqDot.on{background:#35c46a}' +
      '#pqRoot .pqTag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;background:var(--card2);border:1px solid var(--line);margin-left:4px}' +
      '#pqRoot .pqTag.vi{color:#8fd3a8;border-color:#2f6b4a}#pqRoot .pqTag.cho{color:#f3cf8a;border-color:#5a4a22}' +
      '#pqRoot .pqSeg{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}#pqRoot .pqSeg button{background:var(--card2);border:1px solid var(--line);color:var(--tx)}' +
      '#pqRoot .pqSeg button.on{background:#2f6b4a;border-color:#3f8a60;color:#fff;font-weight:700}' +
      '#pqRoot .pqF{display:grid;gap:8px}#pqRoot .pqF label{font-size:12.5px;color:var(--mut)}#pqRoot .pqRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
      '#pqRoot .pqRow input,#pqRoot .pqRow select{flex:1;min-width:120px;width:auto;padding:8px 10px}' +
      '#pqRoot .pqItems{max-height:250px;overflow:auto;border:1px solid var(--line);border-radius:10px}' +
      '#pqRoot .pqIt{display:flex;align-items:center;gap:9px;padding:6px 9px;border-bottom:1px solid var(--line);cursor:pointer}#pqRoot .pqIt:hover{background:var(--card2)}' +
      '#pqRoot .pqIt.on{background:rgba(53,196,106,.14)}#pqRoot .pqIt small{color:var(--mut);font-size:11px;margin-left:4px}' +
      '#pqRoot .pqPick{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;background:var(--card2);border:1px solid #3f8a60}' +
      '#pqRoot .pqKenh{display:grid;gap:8px}#pqRoot .pqK{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:10px;cursor:pointer;background:var(--card2)}' +
      '#pqRoot .pqK.on{border-color:#3f8a60;background:rgba(53,196,106,.12)}#pqRoot .pqK.off{opacity:.45;cursor:not-allowed}#pqRoot .pqK input{width:17px;height:17px;margin-top:2px}' +
      '#pqRoot .pqK b{display:block;font-size:14px}#pqRoot .pqK span{font-size:12.5px;color:var(--mut);line-height:1.45}' +
      '#pqRoot .pqSum{padding:12px;border-radius:10px;background:var(--card2);border:1px solid var(--line);font-size:13.5px;line-height:1.6}' +
      '#pqRoot .pqGo{width:100%;padding:12px;font-size:15px;font-weight:800;margin-top:10px}' +
      '#pqRoot table{border-collapse:collapse;width:100%;font-size:13px}#pqRoot td,#pqRoot th{padding:6px 7px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}' +
      '#pqRoot th{color:var(--mut);font-weight:600;font-size:12px}#pqRoot .ok{color:#35c46a}#pqRoot .bad{color:#ff7b7b}';
    document.head.appendChild(s);
  }

  function khung() {
    css();
    var r = $('pqRoot'); if (!r) return;
    r.innerHTML =
      '<div class="card"><h2 style="margin:0">🎁 Phát quà <small class="muted" style="font-size:13px;font-weight:400">1 chỗ duy nhất gửi quà cho nhân vật · chọn người nhận → quà → cách nhận</small></h2></div>' +
      '<div class="pqGrid"><div class="card"><h3>① Người nhận <small id="pqSelN"></small></h3>' +
      '<div class="pqBar"><input type="text" id="pqQ" placeholder="🔎 Tên nhân vật / tài khoản / GUID"><label class="pqChk"><input type="checkbox" id="pqOn"> chỉ online</label></div>' +
      '<div class="pqBar"><button class="btn-grey" data-pq="chonloc">Chọn hết đang lọc</button><button class="btn-grey" data-pq="chonon">Chọn người online</button><button class="btn-grey" data-pq="bo">Bỏ chọn</button><button class="btn-grey" data-pq="tai">🔄</button></div>' +
      '<div class="pqList" id="pqNvs"><div class="empty">Đang tải...</div></div></div>' +
      '<div class="card"><h3>② Gửi gì</h3><div class="pqSeg" id="pqLoai"></div><div class="pqF" id="pqForm"></div>' +
      '<h3 style="margin-top:16px">③ Cách nhận</h3><div class="pqKenh" id="pqKenh"></div>' +
      '<div class="pqSum" id="pqSum" style="margin-top:14px"></div><button class="btn-green pqGo" id="pqGo" data-pq="gui">Gửi quà</button></div></div>' +
      '<div class="card" id="pqKqCard" style="display:none"><h3>Kết quả lần gửi vừa rồi <small id="pqKqN"></small></h3><div id="pqKq"></div></div>' +
      '<div class="card"><h3>⏳ Quà đang chờ nhận (cách 🗺️ Đổi bản đồ) <small>nhân vật chưa đổi bản đồ / chưa đăng nhập</small></h3><div id="pqCho"></div>' +
      '<div class="note">Nhật ký đầy đủ: tab 📜 Log, lọc chữ "PHÁT QUÀ". Quà gửi qua 🧙 NPC xem ở tab 🛠️ Server (Thương Phố → kho từng nhân vật).</div></div>';
    $('pqQ').addEventListener('input', function () { PQ.q = this.value; veNv(); });
    $('pqOn').addEventListener('change', function () { PQ.chiOn = this.checked; veNv(); });
    PQ.built = true;
  }

  function locNv() {
    var q = boDau(PQ.q.trim());
    return (PQ.d ? PQ.d.chars : []).filter(function (c) {
      if (PQ.chiOn && !c.on) return false;
      return !q || boDau(c.ten + ' ' + c.tk + ' ' + c.guid).indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.on ? 1 : 0) - (a.on ? 1 : 0) || String(a.ten).localeCompare(String(b.ten), 'vi'); });
  }
  function dsChon() { return Object.keys(PQ.sel).filter(function (g) { return PQ.sel[g]; }); }
  function veNv() {
    var el = $('pqNvs'); if (!el) return;
    if (!PQ.d) { el.innerHTML = '<div class="empty">Đang tải...</div>'; return; }
    var L = locNv();
    el.innerHTML = L.map(function (c) {
      var on = !!PQ.sel[c.guid];
      return '<div class="pqNv' + (on ? ' on' : '') + '" data-pqnv="' + e(c.guid) + '"><input type="checkbox"' + (on ? ' checked' : '') + ' tabindex="-1">' +
        '<div><b>' + e(c.ten) + '</b><small>' + e(c.tk) + ' · ' + e(c.guid) + ' · cấp ' + e(c.cap) + '</small></div>' +
        '<div class="pqR"><span class="pqDot' + (c.on ? ' on' : '') + '"></span>' + (c.on ? 'online' : 'offline') +
        (c.vi.length ? c.vi.map(function (v) { return v.clone ? '<span class="pqTag" title="Ví clone: chỉ mở được Thương Phố, không nhận Rương Ích Kỷ / KNB web">🧬 ' + e(v.ten) + '</span>' : '<span class="pqTag vi" title="Ví web liên kết">🔗 ' + e(v.ten) + '</span>'; }).join('') : '<span class="pqTag" title="Chưa liên kết ví web: không gửi được Rương Ích Kỷ / KNB ví">chưa có ví</span>') +
        (c.cho.length ? '<span class="pqTag cho">⏳ ' + c.cho.length + ' chờ</span>' : '') + '</div></div>';
    }).join('') || '<div class="empty">Không nhân vật nào khớp.</div>';
    var n = dsChon().length, tong = PQ.d.chars.length;
    var thay = {}; L.forEach(function (c) { thay[c.guid] = 1; });
    var an = dsChon().filter(function (g) { return !thay[g]; }).length;   // đã chọn nhưng đang bị bộ lọc che -> vẫn được gửi
    $('pqSelN').textContent = 'đã chọn ' + n + ' / ' + tong + ' nhân vật · ' + (PQ.d.online || 0) + ' online' + (an ? ' · ⚠️ ' + an + ' người đã chọn đang bị lọc ẩn (vẫn được gửi)' : '');
    veSum();
  }

  function laItem() { return PQ.loai === 'item'; }
  function veLoai() {
    $('pqLoai').innerHTML = LOAI.map(function (x) { return '<button data-pqloai="' + x[0] + '" class="' + (PQ.loai === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('');
    var f = $('pqForm'), h = '';
    if (laTimMon()) {
      h += '<label>' + (PQ.loai === 'itemsao' ? 'Tìm TRANG BỊ (tên hoặc ID) rồi bấm để chọn' : 'Tìm vật phẩm (tên hoặc ID) rồi bấm để chọn') + '</label><div class="pqRow"><input type="text" id="pqIq" placeholder="vd: Hồn Băng Châu, 20309101" value="' + e(PQ.iq) + '"></div>' +
        '<div class="pqItems" id="pqItems"></div><div id="pqPicked"></div>';
      if (PQ.loai === 'item' || PQ.loai === 'xoa') h += '<div class="pqRow"><label style="flex:0 0 auto">Số lượng</label><input type="number" id="pqSl" min="1" value="' + e(PQ.sl) + '"></div>';
      if (PQ.loai === 'itemsao') h += '<div class="pqRow"><label style="flex:0 0 auto">Số sao (1 - 9)</label><input type="number" id="pqSao" min="1" max="9" value="' + e(PQ.sao) + '"></div>';
      if (PQ.loai === 'xoa') h += '<div class="note" style="margin-top:0;color:#ffb0b0">🗑️ <b>XOÁ</b> món này khỏi túi nhân vật (không phải tặng). Xoá khi nhân vật đăng nhập / đổi bản đồ.</div>';
      if (PQ.loai === 'popup') h += '<div class="note" style="margin-top:0">Cửa sổ "Quà ngày lễ" hiện khi người chơi vào game, bấm Nhận. Mỗi nhân vật chỉ giữ <b>1 món</b>: gửi món mới sẽ <b>thay</b> món cũ chưa nhận.</div>';
    } else if (PQ.loai === 'pet') {
      h += '<div class="pqRow"><select id="pqPetG">' + PETG.map(function (g) { return '<option value="' + g[0] + '"' + (PQ.petGi === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="pqRow"><select id="pqPet"><option value="">đang tải danh sách pet...</option></select></div>';
    } else if (PQ.loai === 'tien' || PQ.loai === 'tien2') {
      var M = PQ.loai === 'tien' ? TIEN : TIEN2, k = PQ.loai === 'tien' ? PQ.tien : PQ.tien2, m = M[k];
      h += '<div class="pqRow"><select id="pqTien">' + Object.keys(M).map(function (x) { return '<option value="' + x + '"' + (x === k ? ' selected' : '') + '>' + M[x][1] + '</option>'; }).join('') + '</select>' +
        '<input type="number" id="pqGt" placeholder="' + e(m[2]) + '" value="' + e(PQ.gt) + '"></div>' +
        (k === 'knbweb' ? '<div class="note" style="margin-top:0">Cộng thẳng vào <b>ví web</b> liên kết với nhân vật (không qua game). Nhân vật chưa liên kết ví sẽ báo lỗi.</div>' : '');
    }
    f.innerHTML = h;
    if ($('pqIq')) { $('pqIq').addEventListener('input', function () { PQ.iq = this.value; veItems(); }); veItems(); vePicked(); }
    if ($('pqSl')) $('pqSl').addEventListener('input', function () { PQ.sl = this.value; veSum(); });
    if ($('pqSao')) $('pqSao').addEventListener('input', function () { PQ.sao = this.value; veSum(); });
    if ($('pqGt')) $('pqGt').addEventListener('input', function () { PQ.gt = this.value; veSum(); });
    if ($('pqTien')) $('pqTien').addEventListener('change', function () { if (PQ.loai === 'tien') PQ.tien = this.value; else PQ.tien2 = this.value; PQ.gt = ''; veLoai(); });
    if ($('pqPetG')) { $('pqPetG').addEventListener('change', function () { PQ.petGi = Number(this.value); PQ.petId = ''; vePets(); }); vePets(); }
    veKenh(); veSum();
  }
  function taiItems() {
    if (PQ.items || PQ.itemsLoading) return;
    PQ.itemsLoading = true;
    api('/api/gameitems').then(function (j) {
      PQ.items = (j.items || []).map(function (x) { return { id: String(x.id), n: x.n, tb: x.kind === 'Trang bi', k: boDau(x.n + ' ' + x.id) }; });
      PQ.itemsLoading = false; veItems();
    }).catch(function (er) { PQ.itemsLoading = false; loi(er); });
  }
  function veItems() {
    var el = $('pqItems'); if (!el) return;
    if (!PQ.items) { taiItems(); el.innerHTML = '<div class="empty">Đang tải danh mục vật phẩm...</div>'; return; }
    var q = boDau(PQ.iq.trim());
    if (!q) { el.innerHTML = '<div class="empty">Gõ tên hoặc ID để tìm (' + so(PQ.items.length) + ' vật phẩm).</div>'; return; }
    var chiTb = PQ.loai === 'itemsao', q0 = PQ.iq;
    var L = PQ.items.filter(function (x) { return (!chiTb || x.tb) && x.k.indexOf(q) >= 0; });
    var hien = L.slice(0, 60);
    var ve = function () {
      el.innerHTML = hien.map(function (x) {
        return '<div class="pqIt' + (PQ.item && PQ.item.id === x.id ? ' on' : '') + '" data-pqit="' + x.id + '">' + vqaIc(icOf(x.id)) + '<div>' + e(x.n) + '<small>' + x.id + '</small></div></div>';
      }).join('') + (L.length > 60 ? '<div class="empty">' + so(L.length) + ' món khớp, đang hiện 60 - gõ thêm để lọc</div>' : '') || '<div class="empty">Không món nào khớp.</div>';
    };
    ve(); icTra(hien.map(function (x) { return x.id; }), function () { if (PQ.iq === q0 && $('pqItems') === el) ve(); });   // icon về muộn: chỉ vẽ lại nếu ô tìm chưa đổi
  }
  function vePicked() {
    var el = $('pqPicked'); if (!el) return;
    el.innerHTML = PQ.item ? '<div class="pqPick">' + vqaIc(icOf(PQ.item.id)) + '<div><b>' + e(PQ.item.n) + '</b> <small class="muted">' + PQ.item.id + '</small></div></div>' : '<div class="muted" style="font-size:12.5px">Chưa chọn vật phẩm.</div>';
  }
  function vePets() {
    var sel = $('pqPet'); if (!sel) return;
    var fill = function () {
      var gr = (PQ.pets || [])[PQ.petGi] || { pets: [] };
      sel.innerHTML = '<option value="">- chọn pet (' + gr.pets.length + ') -</option>' + gr.pets.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === PQ.petId ? ' selected' : '') + '>' + x.id + ' - ' + e(x.name) + '</option>'; }).join('');
      sel.onchange = function () { PQ.petId = this.value; veSum(); };
    };
    if (PQ.pets) return fill();
    api('/api/gm/pets', {}).then(function (j) { PQ.pets = j.groups || []; fill(); })
      .catch(function (er) { sel.innerHTML = '<option value="">lỗi tải danh sách pet - chọn lại nhóm để thử lại</option>'; loi(er); });
  }
  function veKenh() {
    var it = laItem();
    if (!it) PQ.kenh = 'map';
    if (!it) {   // chỉ vật phẩm mới chọn cách nhận; loại khác chỉ ghi chú cách đi (không hiện thẻ "đã chọn" gây hiểu nhầm)
      $('pqKenh').innerHTML = '<div class="pqK on" style="cursor:default"><div><b>' + (PQ.loai === 'tien' && PQ.tien === 'knbweb' ? '💰 Ví web' : PQ.loai === 'popup' ? '🪟 Cửa sổ quà' : PQ.loai === 'xoa' ? '🗑️ Xoá khi đổi bản đồ' : '🗺️ Đổi bản đồ') + '</b><span>' +
        (PQ.loai === 'tien' && PQ.tien === 'knbweb' ? 'Cộng thẳng vào ví web liên kết, không qua game.' : PQ.loai === 'popup' ? 'Cửa sổ "Quà ngày lễ" hiện khi vào game, người chơi bấm Nhận.' : 'Loại này chỉ đi qua hàng quà game: có hiệu lực khi nhân vật đăng nhập / đổi bản đồ.') + '</span></div></div>';
      return;
    }
    $('pqKenh').innerHTML = KENH.map(function (k) {
      var off = !it && k[0] !== 'map', on = PQ.kenh === k[0];
      return '<label class="pqK' + (on ? ' on' : '') + (off ? ' off' : '') + '" data-pqkenh="' + k[0] + '"><input type="radio" name="pqKenh"' + (on ? ' checked' : '') + (off ? ' disabled' : '') + '><div><b>' + k[1] + '</b><span>' + k[2] + '</span></div></label>';
    }).join('') + (it ? '' : '<div class="muted" style="font-size:12.5px">' + (PQ.loai === 'tien' && PQ.tien === 'knbweb' ? 'KNB ví web cộng thẳng vào ví, không qua game.' : PQ.loai === 'popup' ? 'Cửa sổ quà hiện khi vào game.' : 'Loại quà này chỉ gửi được qua 🗺️ Đổi bản đồ.') + '</div>');
  }

  // gom dữ liệu gửi: { loai, gt, sl, mo } hoặc { loi }
  function goi() {
    if (laTimMon()) {
      if (!PQ.item) return { loi: 'Chưa chọn vật phẩm' };
      var sl = Math.floor(Number(PQ.loai === 'popup' ? 1 : PQ.loai === 'itemsao' ? PQ.sao : PQ.sl));
      // Đổi bản đồ / Rương: 1 - 999 (panel GM); NPC: server tự giới hạn theo ô túi (tối đa 100 ô)
      if ((PQ.loai === 'item' || PQ.loai === 'xoa') && !(sl >= 1 && sl <= (PQ.loai === 'item' && PQ.kenh === 'npc' ? 99999 : 999))) return { loi: 'Số lượng 1 - ' + (PQ.loai === 'item' && PQ.kenh === 'npc' ? '99.999 (tối đa 100 ô túi)' : '999') };
      if (PQ.loai === 'itemsao' && !(sl >= 1 && sl <= 9)) return { loi: 'Số sao 1 - 9' };
      return { loai: PQ.loai, gt: PQ.item.id, sl: sl, mo: (PQ.loai === 'xoa' ? 'XOÁ ' : '') + PQ.item.n + (PQ.loai === 'item' || PQ.loai === 'xoa' ? ' x' + so(sl) : PQ.loai === 'itemsao' ? ' (' + sl + ' sao)' : ' (cửa sổ quà)') };
    }
    if (PQ.loai === 'pet') { if (!PQ.petId) return { loi: 'Chưa chọn pet' }; return { loai: 'pet', gt: PQ.petId, sl: 1, mo: 'pet ' + (($('pqPet') || {}).selectedOptions ? $('pqPet').selectedOptions[0].textContent : PQ.petId) }; }
    var M = PQ.loai === 'tien' ? TIEN : TIEN2, m = M[PQ.loai === 'tien' ? PQ.tien : PQ.tien2], v = Math.floor(Number(PQ.gt));
    if (String(PQ.gt).trim() === '' || !(v >= m[3] && v <= m[4])) return { loi: m[1] + ': ' + so(m[3]) + ' - ' + so(m[4]) };
    return { loai: m[0], gt: v, sl: 1, mo: m[1] + ' ' + so(v) };
  }
  function veSum() {
    var el = $('pqSum'); if (!el) return;
    var n = dsChon().length, g = goi(), k = KENH.filter(function (x) { return x[0] === PQ.kenh; })[0];
    el.innerHTML = '<div>Người nhận: <b>' + (n ? n + ' nhân vật' : '<span class="bad">chưa chọn</span>') + '</b></div>' +
      '<div>Quà: <b>' + (g.loi ? '<span class="bad">' + e(g.loi) + '</span>' : e(g.mo)) + '</b></div>' +
      '<div>Cách nhận: <b>' + kenhTen() + '</b></div>';
    var b = $('pqGo'); if (b) { b.disabled = PQ.busy || !n || !!g.loi; b.textContent = PQ.busy ? '⏳ Đang gửi...' : (PQ.loai === 'xoa' ? '🗑️ Xoá vật phẩm' : 'Gửi quà') + (n ? ' cho ' + n + ' nhân vật' : ''); b.className = 'pqGo ' + (n >= 5 || PQ.loai === 'xoa' ? 'btn-red' : 'btn-green'); }
  }
  function kenhTen() {
    if (PQ.loai === 'tien' && PQ.tien === 'knbweb') return '💰 Ví web';
    if (PQ.loai === 'popup') return '🪟 Cửa sổ quà';
    if (PQ.loai === 'xoa') return '🗑️ Xoá khi đổi bản đồ';
    return laItem() ? KENH.filter(function (x) { return x[0] === PQ.kenh; })[0][1] : '🗺️ Đổi bản đồ';
  }

  function veCho() {
    var el = $('pqCho'); if (!el || !PQ.d) return;
    var L = PQ.d.chars.filter(function (c) { return c.cho.length; });
    el.innerHTML = L.length ? '<table><tr><th>Nhân vật</th><th>Đang chờ</th><th></th></tr>' + L.map(function (c) {
      return '<tr><td><b>' + e(c.ten) + '</b><br><small class="muted">' + e(c.tk) + ' · ' + (c.on ? 'online' : 'offline') + '</small></td><td>' + c.cho.map(e).join('<br>') + '</td>' +
        '<td><button class="btn-red" data-pqhuy="' + e(c.guid) + '" data-ten="' + e(c.ten) + '">Huỷ</button></td></tr>';
    }).join('') + '</table>' : '<div class="empty">Không có quà nào đang chờ.</div>';
  }
  function veKq() {
    var c = $('pqKqCard'); if (!c || !PQ.kq) return;
    c.style.display = '';
    var ok = PQ.kq.kq.filter(function (x) { return x.ok; }).length;
    $('pqKqN').textContent = PQ.kq.mo + ' · ' + ok + ' / ' + PQ.kq.kq.length + ' thành công';
    $('pqKq').innerHTML = '<table><tr><th>Nhân vật</th><th>Kết quả</th></tr>' + PQ.kq.kq.map(function (x) {
      return '<tr><td><b>' + e(x.ten) + '</b></td><td class="' + (x.ok ? 'ok' : 'bad') + '">' + (x.ok ? '✅ ' : '❌ ') + e(x.msg) + '</td></tr>';
    }).join('') + '</table>';
  }

  function tai() {
    return api('/api/pq/data', {}).then(function (j) {
      PQ.d = j;
      var co = {}; j.chars.forEach(function (c) { co[c.guid] = 1; });
      Object.keys(PQ.sel).forEach(function (g) { if (!co[g]) delete PQ.sel[g]; });
      veNv(); veCho();
    }).catch(loi);
  }
  window.pqLoad = function () {
    if (!$('pqRoot')) return;
    if (!PQ.built) { khung(); veLoai(); }
    tai();
  };
  // nút "🎁 Gửi quà" ở bảng nhân vật (tab ⚙️) -> mở tab này, chọn sẵn đúng nhân vật đó
  window.pqMo = function (guid) { PQ.sel = {}; PQ.sel[String(guid)] = true; tab('pq'); };

  function gui() {
    var ds = dsChon(), g = goi();
    if (!ds.length || g.loi || PQ.busy) return;
    var xoa = PQ.loai === 'xoa', nhieu = ds.length >= 5;
    var msg = (xoa ? 'XOÁ ' + g.mo.replace(/^XOÁ /, '') + ' khỏi túi ' : 'Gửi ' + g.mo + ' cho ') + ds.length + ' nhân vật (' + kenhTen() + ')?' +
      (xoa ? ' Gõ XOA để xác nhận.' : nhieu ? ' Gửi nhiều người: gõ GUI để xác nhận.' : '');
    uiConfirm(msg, xoa ? 'Xoá' : 'Gửi', xoa || nhieu ? 'btn-red' : 'btn-green', xoa ? 'XOA' : nhieu ? 'GUI' : '').then(function (ok) {
      if (!ok) return;
      PQ.busy = true; veSum();
      // luôn gửi đúng danh sách GUID đã xác nhận (không gửi 'all': nhân vật mới tạo sau khi tải tab sẽ bị gửi thêm ngoài ý)
      api('/api/pq/gui', { nguoi: ds, loai: g.loai, gt: g.gt, sl: g.sl, kenh: laItem() ? PQ.kenh : 'map' }).then(function (j) {
        PQ.kq = { mo: g.mo, kq: j.kq || [] }; veKq();
        toast((j.okN === (j.kq || []).length ? '✅ ' : '⚠️ ') + (xoa ? 'Đã xếp lệnh xoá ' : 'Đã gửi ') + j.okN + ' / ' + (j.kq || []).length + ' nhân vật');
        PQ.busy = false; veSum(); tai();
      }).catch(function (er) { PQ.busy = false; veSum(); loi(er); });
    });
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var mo = t.closest && t.closest('[data-pqmo]'); if (mo) { pqMo(mo.getAttribute('data-pqmo')); return; }
    if (!t.closest || !t.closest('#pqRoot')) return;
    var nv = t.closest('[data-pqnv]'); if (nv) { var g = nv.getAttribute('data-pqnv'); PQ.sel[g] = !PQ.sel[g]; veNv(); return; }
    var lo = t.closest('[data-pqloai]'); if (lo) { var cu = PQ.loai; PQ.loai = lo.getAttribute('data-pqloai'); PQ.gt = '';
      if ((cu === 'itemsao') !== (PQ.loai === 'itemsao')) PQ.item = null;   // trang bị có sao chỉ chọn trang bị -> đổi qua lại thì bỏ món đang chọn
      veLoai(); return; }
    var it = t.closest('[data-pqit]'); if (it) { var id = it.getAttribute('data-pqit'); PQ.item = (PQ.items || []).filter(function (x) { return x.id === id; })[0] || null; veItems(); vePicked(); veSum(); return; }
    var ke = t.closest('[data-pqkenh]'); if (ke) { ev.preventDefault(); if (!laItem() && ke.getAttribute('data-pqkenh') !== 'map') return; PQ.kenh = ke.getAttribute('data-pqkenh'); veKenh(); veSum(); return; }
    var hu = t.closest('[data-pqhuy]'); if (hu) {
      var gu = hu.getAttribute('data-pqhuy'), ten = hu.getAttribute('data-ten');
      uiConfirm('Huỷ toàn bộ quà đang chờ (cách Đổi bản đồ) của ' + ten + '? Cửa sổ quà chưa nhận (nếu có) cũng bị huỷ.', 'Huỷ quà', 'btn-red').then(function (ok) {
        if (!ok) return;
        api('/api/gm/act', { a: 'huy_qua', guid: gu }).then(function (j) { toast((j.done ? '✅ ' : '⚠️ ') + j.msg); tai(); }).catch(loi);
      });
      return;
    }
    var b = t.closest('[data-pq]'); if (!b) return;
    var a = b.getAttribute('data-pq');
    if (a === 'tai') tai();
    else if (a === 'bo') { PQ.sel = {}; veNv(); }
    else if (a === 'chonloc') { locNv().forEach(function (c) { PQ.sel[c.guid] = true; }); veNv(); }
    else if (a === 'chonon') { PQ.sel = {}; (PQ.d ? PQ.d.chars : []).forEach(function (c) { if (c.on) PQ.sel[c.guid] = true; }); veNv(); }
    else if (a === 'gui') gui();
  });
})();
