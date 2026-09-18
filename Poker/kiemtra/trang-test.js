// Bộ kiểm trang web — chạy: node Poker/kiemtra/trang-test.js
//
// Không mở được trình duyệt thật ở đây, nên kiểm 3 tầng:
//   1. Cú pháp JS của trang (tách phần <script> ra rồi bắt máy đọc thử)
//   2. HTML: mọi id mà JS gọi $('...') đều phải CÓ trong trang (bẫy kinh điển:
//      đổi tên id ở HTML, quên đổi ở JS -> null.textContent, trắng trang)
//   3. Luật hiệu ứng: những chỗ dễ làm animation đứt phải còn nguyên
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const F = path.join(__dirname, '..', 'trang.html');
const H = fs.readFileSync(F, 'utf8');

let P = 0, F_ = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F_++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- cú pháp
muc('cú pháp');
const kb = H.match(/<script>([\s\S]*?)<\/script>/);
ok('tìm được khối <script>', !!kb);
const JS = kb ? kb[1] : '';
{
    let loi = null;
    try { new vm.Script(JS, { filename: 'trang.html <script>' }); } catch (e) { loi = e.message; }
    ok('JS của trang không lỗi cú pháp', loi === null, loi);
}
ok('có <!doctype html>', /^<!doctype html>/i.test(H.trim()));
ok('khai báo utf-8', /charset=["']?utf-8/i.test(H));
ok('có thẻ viewport cho điện thoại', /name=["']viewport["']/.test(H));

// ---------------------------------------------------------------- id
muc('mọi id JS gọi tới đều có trong HTML');
{
    const idHtml = new Set();
    let m; const reId = /\sid="([^"]+)"/g;
    while ((m = reId.exec(H))) idHtml.add(m[1]);
    const goi = new Set();
    const reGoi = /\$\('([^']+)'\)/g;
    while ((m = reGoi.exec(JS))) goi.add(m[1]);
    const thieu = [...goi].filter(x => !idHtml.has(x));
    ok('không id nào bị gọi mà không tồn tại', thieu.length === 0, thieu.join(', '));
    ok('có đủ id then chốt',
        ['manDangNhap', 'manCho', 'manBan', 'manKetQua', 'banGhe', 'banChung', 'banCuoc',
         'banAct', 'banNutD', 'san', 'hopNghi'].every(x => idHtml.has(x)));
    console.log('       (' + goi.size + ' id được gọi, ' + idHtml.size + ' id có trong trang)');
}

// ---------------------------------------------------------------- hàm
muc('hàm nào onclick gọi thì phải có thật');
{
    const co = new Set();
    let m; const reHam = /function\s+([A-Za-z0-9_$]+)\s*\(/g;
    while ((m = reHam.exec(JS))) co.add(m[1]);
    const dung = new Set();
    const reOn = /on(?:click|input|change)="([A-Za-z0-9_$]+)\(/g;
    while ((m = reOn.exec(H))) dung.add(m[1]);
    const thieu = [...dung].filter(x => !co.has(x));
    ok('không onclick nào gọi hàm không tồn tại', thieu.length === 0, thieu.join(', '));
}

// ---------------------------------------------------------------- hiệu ứng
muc('ba hiệu ứng + mấy chốt chống đứt hiệu ứng');
ok('có kiểu lá bài lật được (.the với --g)', /\.the\{[^}]*--g:/.test(H.replace(/\s+/g, ' ')) || /--g:180deg/.test(H));
ok('hai mặt bài giấu lưng bằng backface-visibility', /backface-visibility:hidden/.test(H));
ok('mặt và lưng xoay ngược chiều nhau',
    /\.the \.mat\{transform:rotateY\(calc\(var\(--g\) - 180deg\)\)\}/.test(H) &&
    /\.the \.lung\{transform:rotateY\(var\(--g\)\)\}/.test(H));

ok('CHIA BÀI: có lá bay + hàm chiaBai', /\.bay\{/.test(H) && /function chiaBai\(/.test(JS));
ok('chia bài phát 2 vòng quanh bàn', /for \(var vong = 0; vong < 2; vong\+\+\)/.test(JS));
ok('chia bài bay từ chỗ nhà cái', /banNutD/.test(JS) && /VITRI/.test(JS));

ok('NẶN BÀI: có hàm gắn tay nặn', /function gan1La\(/.test(JS));
ok('nặn theo ngón tay (pointerdown/move/up)',
    /pointerdown/.test(JS) && /pointermove/.test(JS) && /pointerup/.test(JS));
ok('bấm phát là lật luôn, kéo quá nửa thì lật nốt', /dich < 6 \|\| NAN\.goc\[i\] > 80/.test(JS));
ok('góc nặn giữ trong biến JS (sống qua mỗi lần vẽ lại)', /var NAN = \{ van: -1, goc: \[0, 0\]/.test(JS));
ok('ván mới thì bài úp lại', /NAN\.van !== v\.so/.test(JS));

ok('LẬT BÀI CHUNG: chỉ dựng lại khi có lá mới', /function veChung\(/.test(JS) && /CHUNG_CU/.test(JS));
ok('lá mới lật lệch nhau cho ra kiểu chia thật', /90 \+ k \* 160/.test(JS));

ok('NẶN GIỮA MÀN HÌNH: có lớp phủ + hàm veNan', /#nanLop\{/.test(H) && /function veNan\(/.test(JS));
ok('lớp nặn KHÔNG chặn bấm nút bên dưới (pointer-events:none)',
    /#nanLop\{[^}]*pointer-events:none/.test(H.replace(/\s*\n\s*/g, '')));
ok('lá bài ở lớp nặn được phóng to', /\.the\.to\{width:clamp/.test(H));
ok('mở hết 2 lá thì tự cất lớp nặn', /NAN\.goc\[0\] >= 180 && NAN\.goc\[1\] >= 180/.test(JS));
ok('có nút "Lật cả hai" và "Để sau"', /function latHet\(/.test(JS) && /function boQuaNan\(/.test(JS));
ok('qua vòng bài chung thì lớp nặn tắt', /!QUA_PREFLOP && conUp/.test(JS));
ok('LẬT GIÙM: qua bài chung mà còn úp thì máy tự lật',
    /QUA_PREFLOP && \(NAN\.goc\[0\] < 180 \|\| NAN\.goc\[1\] < 180\)/.test(JS));

muc('bỏ bài / thắng ván / đếm ngược / khoe bài');
ok('BỎ BÀI: hai lá tối đen hẳn',
    /\.ghe\.bo \.bai2 \.the \.mat[^{]*\{[^}]*brightness\(\.18\)/.test(H.replace(/\s*\n\s*/g, '')),
    'không thấy bộ lọc làm tối bài người bỏ');
ok('THẮNG VÁN: ghế nảy lên + viền vàng', /\.ghe\.thang\{animation:anVan/.test(H) && /@keyframes anVan/.test(H));
ok('THẮNG VÁN: số chip ăn được bay lên', /@keyframes hao/.test(H) && /class="an">\+/.test(JS));
ok('THẮNG VÁN: lấy từ ketQua.an của máy chủ, không tự đoán',
    /var an = \(v\.ketQua && v\.ketQua\.an\)/.test(JS));
ok('ĐẾM NGƯỢC: có ô đếm + đọc demChiaBai từ máy chủ',
    /id="demChia"/.test(H) && /s\.demChiaBai/.test(JS));
ok('ĐẾM NGƯỢC: chạy lại hoạt ảnh nảy mỗi lần đổi số', /void \$\('demSo'\)\.offsetWidth/.test(JS));
ok('KHOE BÀI: bấm lá đã mở thì hỏi lại trước', /function gan1Khoe\(/.test(JS) && /confirm\(/.test(JS));
ok('KHOE BÀI: gửi đúng chỉ số lá lên máy chủ', /goi\('\/khoe', \{ la: i \}\)/.test(JS));
ok('KHOE BÀI: khoe rồi thì hết bấm được', /!daKhoe/.test(JS));
ok('KHOE BÀI: lá người khác khoe có viền nháy', /\.the\.khoeRa \.mat\{animation:khoeNhay/.test(H));
ok('KHOE BÀI: trang KHÔNG tự quyết lộ bài, chỉ vẽ cái máy chủ gửi',
    /var khoe = v\.khoe \|\| \[\]/.test(JS));
ok('ĐÃ CHÁY: báo thẳng "Bạn đã bị loại" kèm hạng, không để thanh "đang chờ"',
    /if \(t\.daChay\)\{/.test(JS) && /Bạn đã bị loại/.test(JS) && /t\.hang/.test(JS));

muc('phòng chờ: chọn ghế trên bàn · KHÔNG nút admin · nhãn D/SB/BB · viền nhà cái');
ok('phòng chờ vẽ bàn oval với 8 ghế (không còn danh sách chữ)',
    /id="sanCho"/.test(H) && /id="choGhe"/.test(H) && !/id="choDs"/.test(H));
ok('ghế trống bấm được để ngồi, ghế mình bấm để rời',
    /onclick="ngoi\(' \+ k \+ '\)"/.test(JS) && /onclick="roi\(\)"/.test(JS) &&
    /function ngoi\(k\)\{ goi\('\/ngoi', \{ ghe: k \}\); \}/.test(JS) && /function roi\(\)\{ goi\('\/roi'\); \}/.test(JS));
ok('ghế phòng chờ lấy từ s.ghe (8 ô) của máy chủ, không tự đoán', /var n = s\.ghe\.length/.test(JS));
// Chủ server chốt: mọi thao tác giải (chip / Bắt đầu / Giải tán / Tạm nghỉ) ở PANEL SUPER.
ok('trang người chơi KHÔNG còn hộp admin, ô chip, nút Bắt đầu / Giải tán',
    !/id="hopAdmin"/.test(H) && !/id="oChip"/.test(H) && !/id="ntGiaiTan"/.test(H) && !/id="ntBatDau"/.test(H) && !/id="kqDon"/.test(H));
ok('trang KHÔNG còn hàm datChip / giaiTan / donDep',
    !/function datChip\(/.test(JS) && !/function giaiTan\(/.test(JS) && !/donDep\(/.test(JS));
ok('trang KHÔNG gọi route admin (/cauhinh, /batdau, /giaitan)',
    !/goi\('\/cauhinh'/.test(JS) && !/goi\('\/batdau'/.test(JS) && !/goi\('\/giaitan'/.test(JS));
ok('vẫn hiện thang blind cho mọi người xem trước', /Thang blind: /.test(JS) && /s\.lichBlind/.test(JS));

muc('chạy NHÚNG trong web BotDoMin (cùng cổng, cùng phiên) hoặc đứng riêng');
ok('tự nhận biết đang nhúng ở /poker/', /var NHUNG = \/\\\/poker\\\/\?\$\/\.test\(location\.pathname\)/.test(JS));
ok('gốc API đổi theo: /api/poker khi nhúng, /api khi đứng riêng', /var GOC_API = NHUNG \? '\/api\/poker' : '\/api'/.test(JS));
ok('mọi lời gọi đi qua GOC_API', /fetch\(GOC_API \+ duong/.test(JS));
ok('không còn đường cứng "/api/..." nào trong trang', !/['"]\/api\//.test(JS.replace(/var GOC_API[^\n]*\n/, '')));
ok('nhúng thì dùng CHUNG play_token của trang chính, không đăng nhập lần 2',
    /NHUNG \? localStorage\.getItem\('play_token'\) : localStorage\.getItem\('poker_token'\)/.test(JS));
ok('401 khi nhúng KHÔNG xoá play_token (của trang chính)', /if \(!NHUNG\) localStorage\.removeItem\('poker_token'\)/.test(JS));
ok('đọc lỗi theo quy ước BotDoMin ({ok:false, error})', /j\.error \|\| j\.loi/.test(JS));
ok('nhúng mà chưa có phiên thì hiện hướng dẫn, không hiện form đăng nhập riêng',
    /if \(!s && NHUNG\) datHTML\(\$\('manDangNhap'\)/.test(JS));
ok('trạng thái lấy ở /state (khớp regex XEM của cổng liên kết)', /api\('\/state'\)/.test(JS));
ok('NHÀ CÁI: viền vàng đậm quanh bảng tên', /\.ghe\.dealer \.bang\{border:2px solid var\(--gold\)/.test(H));
ok('NHÀ CÁI: ghế được gắn class dealer theo g.nutCai', /\(p\.id===g\.nutCai\?' dealer':''\)/.test(JS));
ok('nhãn D / SB / BB gắn cạnh tên, đọc từ van.sb / van.bb của máy chủ',
    /class="vt d">D</.test(JS) && /p\.id===v\.sb \? '<span class="vt sb">SB/.test(JS) && /p\.id===v\.bb \? '<span class="vt bb">BB/.test(JS));
ok('CSS cho 3 nhãn', /\.vt\.d\{/.test(H) && /\.vt\.sb\{/.test(H) && /\.vt\.bb\{/.test(H));
ok('mọi id mới đều có trong trang', ['sanCho', 'choGhe', 'choGiua', 'choThang']
    .every(x => new RegExp('id="' + x + '"').test(H)));

muc('chống dựng lại DOM mỗi giây (lỗi thanh kéo tố nhảy về đầu)');
// cả veGhe lẫn veNan đều phải có chốt "đang thao tác thì thôi vẽ"
ok('CHỐNG ĐỨT 1: đang kéo tay thì không vẽ lại',
    (JS.match(/if \(DANG_KEO[^)]*\) return;/g) || []).length >= 2,
    String((JS.match(/if \(DANG_KEO[^)]*\) return;/g) || []).length) + ' chốt');
ok('CHỐNG ĐỨT 4: đang đóng lớp nặn thì cũng không vẽ đè lên',
    /DANG_KEO \|\| DANG_DONG/.test(JS));
ok('NẶN XONG giữ lại 2 giây rồi mới hạ xuống (không tắt phụp)',
    /var GIU_SAU_NAN = 2000/.test(JS) && /\.nanHop\.haXuong\{transform:translate\(-50%,44vh\)/.test(H));
ok('CHỐNG ĐỨT 2: có hàm datHTML chỉ đụng DOM khi nội dung đổi thật',
    /function datHTML\(el, html\)\{/.test(JS) && /if \(!el \|\| el\.__cu === html\) return false;/.test(JS));
ok('CHỐNG ĐỨT 3: thả tay xong chờ hiệu ứng chạy hết mới vẽ lại',
    /setTimeout\(function\(\)\{ GHE_CU = ''; \$\('banGhe'\)\.__cu = ''; \}, 34\d\)/.test(JS));
ok('bài chung so trước khi dựng lại', /if \(chung\.join\(\) === CHUNG_CU\.join\(\)\) return;/.test(JS));

// Đây là lỗi chủ server báo: kéo thanh tố xong 1 giây sau nó nhảy về đầu.
ok('THANH TỐ: giá trị giữ trong biến JS, không đọc từ DOM', /var TO = \{ khoa: '', gt: 0 \}/.test(JS));
ok('THANH TỐ: chỉ đặt lại khi tình huống cược đổi thật (ván/vòng/mức/chip)',
    /var khoa = v\.so \+ '\|' \+ v\.vong \+ '\|' \+ muc \+ '\|' \+ toiDa/.test(JS));
ok('THANH TỐ: thẻ input KHÔNG còn value cứng (thứ làm nó nhảy về đầu)',
    !/id="thanhTo"[^>]*value=/.test(JS), 'vẫn còn value= trong thẻ range');
ok('THANH TỐ: kéo tới đâu nhớ tới đó', /TO\.gt = Number\(r\.value\);/.test(JS));
ok('THANH TỐ: bấm Tố gửi đúng số đã kéo', /kieu:'to', tien: TO\.gt/.test(JS));
ok('SỐ ĐẾM LÙI tách ra ô riêng, không nằm trong chuỗi so sánh',
    /id="actDem"/.test(JS) && /function capNhatDem\(/.test(JS));
{
    // Quy ước: mọi chỗ vẽ lại phải qua datHTML(). Chỗ nào buộc phải gán thẳng
    // innerHTML thì phải TỰ CÓ chốt chặn riêng và đánh dấu /*CHAN-ROI*/ ngay trước
    // — có dấu này nghĩa là "đã nghĩ tới chuyện dựng lại DOM rồi". Không dấu = lọt lưới.
    const xau = [];
    JS.split('\n').forEach(function (d, i) {
        if (!/\.innerHTML\s*=/.test(d)) return;
        if (/el\.innerHTML = html/.test(d)) return;     // chính hàm datHTML
        if (/\/\*CHAN-ROI\*\//.test(d)) return;         // đã có chốt riêng, có đánh dấu
        xau.push('dòng ' + (i + 1) + ': ' + d.trim().slice(0, 60));
    });
    ok('mọi chỗ vẽ lại đều qua datHTML (hoặc có dấu /*CHAN-ROI*/)', xau.length === 0, xau.join(' | '));
    ok('3 chỗ có chốt riêng đều được đánh dấu',
        (JS.match(/\/\*CHAN-ROI\*\//g) || []).length === 3,
        String((JS.match(/\/\*CHAN-ROI\*\//g) || []).length));
}

// ---------------------------------------------------------------- không lộ bài
muc('trang không tự đoán bài của ai');
ok('trang chỉ vẽ cái máy chủ đưa, không tự sinh bộ bài',
    !/\['2','3','4','5','6','7','8','9'/.test(JS) && !/shuffle|xao\(/.test(JS));
ok('bài người khác chỉ vẽ khi máy chủ gửi ketQua.lat', /lat \? lat\.filter/.test(JS));
ok('không lưu bài vào localStorage', !/localStorage\.setItem\([^)]*la/.test(JS));

// ---------------------------------------------------------------- ảnh
muc('ảnh lá bài');
{
    const thuMuc = path.join(__dirname, '..', 'bai');
    // trang ghép: src="bai/' + (ma||'back') + '.webp"  -> dò phần "bai/" rồi dấu cộng
    ok('đường dẫn ảnh ghép từ mã lá', /bai\/'\s*\+/.test(JS), 'không thấy chỗ ghép "bai/" + mã');
    ok('lưng bài dùng back.webp', /back\.webp/.test(H) && fs.existsSync(path.join(thuMuc, 'back.webp')));
    const anh = fs.readdirSync(thuMuc).filter(x => x.endsWith('.webp'));
    ok('đủ 53 file ảnh (52 lá + lưng)', anh.length === 53, String(anh.length));
    // mọi ảnh trang gọi đích danh trong CSS/HTML đều phải có thật
    const goiThang = [...new Set((H.match(/bai\/[A-Za-z0-9]{1,4}\.webp/g) || []))];
    const thieu = goiThang.filter(x => !fs.existsSync(path.join(__dirname, '..', x)));
    ok('ảnh nào trang gọi đích danh cũng có thật', thieu.length === 0, thieu.join(', '));
}

console.log('\n🎬 TRANG WEB + HIỆU ỨNG: ' + P + ' đạt, ' + F_ + ' hỏng');
process.exit(F_ ? 1 : 0);
