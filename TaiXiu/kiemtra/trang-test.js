// Bộ kiểm GIAO DIỆN bàn Sic Bo trong webplay.js — chạy: node TaiXiu/kiemtra/trang-test.js
//
// Không mở được trình duyệt ở đây nên kiểm 3 tầng:
//   1. Cú pháp JS phía người chơi (mảng chuỗi PAGE nối lại rồi bắt máy đọc thử)
//   2. Hình học xúc xắc mini — tính tay xem chấm có chồng nhau / tràn viền không
//      (chủ server từng báo "hột xí ngầu méo mó" đúng vì chấm đè nhau)
//   3. Luật giao diện: không còn giỏ cược, mọi id JS gọi đều tồn tại
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const F = path.join(__dirname, '..', '..', 'BotDoMin', 'webplay.js');
const SRC = fs.readFileSync(F, 'utf8');
// panel.js: phần admin chỉnh RTP nằm ở đây
const PANEL = fs.readFileSync(path.join(__dirname, '..', '..', 'BotDoMin', 'panel.js'), 'utf8');
// index.js: dòng lịch sử gửi lên Discord dựng ở đây
const IDX = fs.readFileSync(path.join(__dirname, '..', '..', 'BotDoMin', 'index.js'), 'utf8');
const BAN = fs.readFileSync(path.join(__dirname, '..', '..', 'SieuTaiXiu', 'ban.js'), 'utf8');

let P = 0, F_ = 0;
const ok = (t, dk, them) => {
    if (dk) { P++; console.log('  OK   ' + t); }
    else { F_++; console.log('  HỎNG ' + t + (them ? '  ->  ' + them : '')); }
};
const muc = (t) => console.log('\n== ' + t + ' ==');

// ---------------------------------------------------------------- cú pháp
muc('cú pháp phần người chơi');
{
    let loi = null;
    try { new vm.Script(SRC, { filename: 'webplay.js' }); } catch (e) { loi = e.message; }
    ok('webplay.js không lỗi cú pháp', loi === null, loi);
}

// ---------------------------------------------------------------- hình học xúc xắc
muc('🎲 hình học xúc xắc mini (chấm không được chồng / tràn)');
// 21/09: cỡ viên KHÔNG còn là số cố định mà là biến --xx co theo màn (ghim số là chọn
// đúng một cỡ máy, máy hẹp hơn vẫn tràn). Nên kiểm ở CA XẤU NHẤT = cận dưới của clamp:
// viên nhỏ nhất mà chấm vẫn không chồng, không tràn viền thì mọi cỡ lớn hơn đều yên.
function clampMin(chuoi) {
    const m = chuoi && chuoi.match(/clamp\(\s*([\d.]+)px/);
    return m ? parseFloat(m[1]) : null;
}
function doHinhHoc(nhan) {
    // --xx khai ở .sbBoXx; .sbXx dùng width:var(--xx); chấm = tỉ lệ của --xx
    const mBien = SRC.match(/\.sbBoXx\{--xx:(clamp\([^)]*\))/);
    const mTi = SRC.match(/\.sbXx i\{[^']*width:calc\(var\(--xx\) \* ([\d.]+)\)/);
    const o = clampMin(mBien && mBien[1]);
    return { o, cham: (o != null && mTi) ? o * parseFloat(mTi[1]) : null };
}
function kiemCo(ten, oPx, chamPx) {
    const trong = oPx - 2;                       // box-sizing:border-box, viền 1px mỗi bên
    const tam = [25, 50, 75].map(p => trong * p / 100);
    const khoang = tam[1] - tam[0];              // 2 hàng chấm liền nhau
    const bien = tam[0] - chamPx / 2;            // chấm ngoài cùng cách mép
    ok(ten + ': chấm không chồng nhau (cách ' + khoang.toFixed(1) + 'px > chấm ' + chamPx + 'px)', khoang > chamPx,
        'ô ' + oPx + 'px, chấm ' + chamPx + 'px');
    ok(ten + ': chấm không tràn viền (còn ' + bien.toFixed(1) + 'px)', bien > 0.5, String(bien));
    return { khoang, bien };
}
{
    const d = doHinhHoc('sbXx');
    ok('đọc được cỡ ô + cỡ chấm từ CSS', d.o > 0 && d.cham > 0, JSON.stringify(d));
    kiemCo('máy tính', d.o, d.cham);
    ok('ô xúc xắc LUÔN vuông (có aspect-ratio, không để flex kéo méo)',
        /\.sbXx\{[^']*aspect-ratio:1/.test(SRC));
    // bản điện thoại khai trong @media
    const mm = SRC.match(/@media \(max-width:430px\)\{\.sbBoXx\{--xx:(clamp\([^)]*\))\}/);
    ok('có cỡ riêng cho điện thoại', !!mm, 'không thấy @media hạ trần --xx');
    const tiCham = parseFloat((SRC.match(/\.sbXx i\{[^']*width:calc\(var\(--xx\) \* ([\d.]+)\)/) || [])[1]);
    if (mm) { const dt = clampMin(mm[1]); kiemCo('điện thoại', dt, dt * tiCham); }

    // ⚠️ 21/09 — CÁI GÂY RA LỖI TRÀN: viên xúc xắc không co được.
    // ⚠️ mỗi phần tử của mảng PAGE là MỘT chuỗi, nên một rule CSS bị cắt làm nhiều dòng —
    // regex kiểu /\.sbXx\{[^']*flex/ không bao giờ khớp qua ranh giới. Soi từng mảnh.
    ok('⭐ viên xúc xắc CO ĐƯỢC (không flex:0 0 auto, không width cố định)',
        /\.sbXx\{[^']*width:var\(--xx\)/.test(SRC) &&
        SRC.includes('flex:0 1 auto;min-width:0') && !/\.sbXx\{width:\d/.test(SRC) &&
        !SRC.includes('flex:0 0 auto;box-shadow:0 1px 2px'));
    ok('...và @media điện thoại KHÔNG ghim lại số cố định (ghim là chọn đúng một cỡ máy)',
        !/@media \(max-width:430px\)\{\.sbXx\{width:\d/.test(SRC));
    ok('⭐ chữ dài ("Bão bất kỳ") có đường lùi, không tràn đè ô bên cạnh',
        /\.sbO \.sbTen\{font-size:clamp\(/.test(SRC) &&
        SRC.includes('max-width:100%;overflow:hidden;text-overflow:ellipsis'));
    {
        // Máy 390px là ca chật nhất còn phổ biến. Tính đúng phép mà bản cũ tính thiếu.
        const vw = 390, khungTrong = 350, soO = 6, khe = 4;
        const oRong = (khungTrong - (soO - 1) * khe) / soO;
        const xx = Math.min(Math.max(9, vw * 0.03), 16);       // clamp(9px,3vw,16px)
        const can = 3 * xx + 6 * 1 + 2 * 1 + 2;                 // 3 viên + lề + padding + viền
        ok('⭐ máy 390px: hàng 3 viên VỪA ô (cần ' + can.toFixed(1) + 'px, có ' + oRong.toFixed(1) + 'px)',
            can <= oRong, can.toFixed(1) + ' > ' + oRong.toFixed(1));
    }
}

// ---------------------------------------------------------------- dựng bàn
muc('bàn 52 ô');
ok('vẽ xúc xắc bằng hàm riêng, dùng lại bảng chấm PIPS sẵn có',
    /function sbXx\(n\)/.test(SRC) && /PIPS\[n\]/.test(SRC));
// ⚠️ Đếm trong THÂN sbVe() thôi. Từ 22/09 file còn có bàn Siêu Tài Xỉu (stVe) cũng
// dùng khu() — đếm cả file là ra 12, tưởng hỏng mà thật ra không phải.
{
    const than = SRC.slice(SRC.indexOf('function sbVe()'), SRC.indexOf('function sbVeChip()'));
    ok('bàn thường có 6 dải tiêu đề khu', (than.match(/h\+=khu\(/g) || []).length === 6,
        String((than.match(/h\+=khu\(/g) || []).length));
}
ok('4 cửa đều tiền + bộ ba bất kỳ nằm hàng đầu, ô to (sbDeu)',
    /o\(g\("xiu"\),"sbDeu sbXiu"\)/.test(SRC) && /o\(g\("tai"\),"sbDeu sbTai"\)/.test(SRC) &&
    /o\(g\("baoany"\),"sbDeu sbBaoAny"\)/.test(SRC));
ok('đôi vẽ 2 viên, bộ ba vẽ 3 viên, đơn vẽ 1 viên',
    /sbBoXx\(\[n,n\]\)/.test(SRC) && /sbBoXx\(\[n,n,n\]\)/.test(SRC) && /sbBoXx\(\[n\]\)/.test(SRC));
ok('kết hợp 2 lá vẽ 2 viên KHÁC nhau, số lấy từ id cửa', /sbBoXx\(\[a,d\]\)/.test(SRC));
ok('tổng điểm hiện số to + tỉ lệ nhỏ', /o\(c,"sbTong"/.test(SRC));

// Chủ server bắt lỗi: ô Tổng 4 in "50-499:1" trong khi ăn thật là 50:1, số 499 chỉ
// xảy ra khi ô đó được bốc trúng hệ số nhân. Ô KHÔNG được in mức cao nhất như mức ăn.
ok('ô chỉ in tỉ lệ GỐC, không in dải tới mức nhân cao nhất',
    /'var tl=c\.goc\+":1";'/.test(SRC) && !/c\.goc\+"-"\+c\.max/.test(SRC));
{
    const dai = [];
    let m; const re = /khu\("([^"]*)"\)/g;
    while ((m = re.exec(SRC))) if (/\d+-\d+:1/.test(m[1])) dai.push(m[1]);
    ok('dải tiêu đề khu cũng không in dải "gốc-nhân:1"', dai.length === 0, dai.join(' | '));
}
// Chủ server bỏ thanh liệt kê hệ số nhân: huy hiệu x… đã nằm ngay trên từng ô.
ok('KHÔNG còn thanh liệt kê hệ số nhân phía trên bàn', !/sbNhanBar/.test(SRC));
ok('huy hiệu x… vẫn gắn lên đúng ô được bốc',
    SRC.includes('d.className="sbX";d.textContent="x"+co') && SRC.includes("'.sbO .sbX{"));
ok('bàn lấy từ bảng cửa máy chủ gửi, không gõ cứng 52 ô', /SBCUA=j\.txCua/.test(SRC));

// ---------------------------------------------------------------- bấm là đặt
muc('bấm ô là đặt luôn (đã bỏ giỏ cược)');
ok('không còn hàm giỏ: sbHoanTac / sbGapDoi / sbXoaGio / sbGui',
    !/function sbHoanTac/.test(SRC) && !/function sbGapDoi/.test(SRC) &&
    !/function sbXoaGio/.test(SRC) && !/function sbGui/.test(SRC));
ok('không còn biến giỏ SBGIO / SBLICH', !/SBGIO/.test(SRC) && !/SBLICH/.test(SRC));
ok('bấm ô gọi thẳng /api/bet', /function sbChon\(id\)/.test(SRC) &&
    SRC.includes('api("/api/bet",{gio:[{choice:id,amount:tien}]})'));
ok('chặn bấm dồn 2 lần lúc mạng chậm (SBDANGGUI)', /if\(SBDANGGUI\)return;/.test(SRC));
ok('nút betBtn cũ nếu còn thì phải có if (tránh null.disabled làm vỡ refresh)',
    !/getElementById\("betBtn"\)\.disabled/.test(SRC));

// ---------------------------------------------------------------- pha hiện nhân
muc('pha hiện nhân');
ok('có nhánh hiển thị riêng, không rơi vào "bàn đang tắt"', /PHASE==="nhan"\)\{stt\.textContent/.test(SRC));
ok('chén VẪN nằm đó và bị khoá (không giấu đi)',
    /PHASE==="nhan"[\s\S]{0,400}?paper\.classList\.add\("locked"\)/.test(SRC));
ok('máy chủ chỉ gửi xúc xắc khi phase là "nan"', /phase === 'nan' && tx\.nan/.test(SRC));
ok('bảng nhân chỉ gửi sau khi đã khoá sổ', /tx\.status !== 'betting'\) \? tx\.nhan\.o : null/.test(SRC));

// ---------------------------------------------------------------- id
muc('mọi id JS gọi tới đều có trong trang');
{
    const idCo = new Set();
    let m; const reId = /id=\\?"([A-Za-z0-9_]+)\\?"/g;
    while ((m = reId.exec(SRC))) idCo.add(m[1]);
    const canCo = ['sbBan', 'sbChips', 'sbNhac', 'sbBao'];
    const thieu = canCo.filter(x => !idCo.has(x));
    ok('đủ id then chốt của bàn Sic Bo', thieu.length === 0, thieu.join(', '));
}

// ---------------------------------------------------------------- tô kết quả
muc('bàn tô kết quả sau khi nặn');
ok('có hàm tô kết quả + hàm xoá màu', /function sbToKetQua\(nan\)/.test(SRC) && /function sbXoaKetQua\(\)/.test(SRC));
ok('ô trúng / ô trượt có kiểu riêng trong CSS',
    /\.sbO\.sbTrung[,{]/.test(SRC) && /\.sbO\.sbTruot[,{]/.test(SRC));
// Lỗi thật đã dính: .sbO.sbKhoa đặt opacity .5 cho MỌI ô lúc khoá sổ, ô trúng cũng
// mờ theo nên tô sáng bằng thừa. Và .sbNhan khai sau .sbTruot nên ô trượt có hệ số
// nhân vẫn vàng chóe. Hai điều kiện dưới khoá lại đúng hai cái bẫy đó.
ok('kiểu kết quả đủ mạnh để thắng .sbKhoa và .sbNhan',
    /\.sbO\.sbTrung\.sbKhoa/.test(SRC) && /\.sbO\.sbTrung\.sbNhan/.test(SRC) &&
    /\.sbO\.sbTruot\.sbKhoa/.test(SRC) && /\.sbO\.sbTruot\.sbNhan/.test(SRC));
ok('kiểu kết quả khai SAU .sbNhan (khai trước là bị đè)',
    SRC.lastIndexOf('.sbO.sbTruot,') > SRC.indexOf(".sbO.sbNhan{"));
ok('khoá sổ không còn mờ nửa ô (opacity .5 nuốt hết tương phản)',
    !/\.sbO\.sbKhoa\{opacity:\.5/.test(SRC));
ok('ô nền TRẮNG ngay từ lúc đặt', /'\.sbO\{flex:1;min-width:0;position:relative;background:#fff;/.test(SRC));
// ảnh sòng thật: ô trượt chỉ xám NỀN, xúc xắc trong ô vẫn đỏ tươi
ok('ô trượt KHÔNG đổi màu xúc xắc (giống ảnh sòng thật)',
    !/\.sbO\.sbTruot \.sbXx/.test(SRC));
ok('KHÔNG tự đoán luật thắng ở máy người chơi — lấy danh sách máy chủ gửi',
    /nan\.thang\.forEach/.test(SRC));
ok('nặn xong (tay hoặc tự) là tô bàn ngay', /revealDone\(\)\{[\s\S]{0,400}?sbToKetQua\(NAN\)/.test(SRC));
ok('mở ván mới thì xoá màu cũ', /PHASE==="bet"\)sbXoaKetQua\(\)/.test(SRC));
ok('giây cuối tự mở lấy theo số máy chủ gửi, không gõ cứng 3',
    /s2<=TXKQS&&NAN/.test(SRC) && /j\.txKqS==="number"\)TXKQS=j\.txKqS/.test(SRC));
ok('vào lại giữa chừng vẫn thấy màu ván mình đã nặn',
    /revealedGame===j\.nan\.gameId\)sbToKetQua\(j\.nan\)/.test(SRC));

// ---------------------------------------------------------------- dòng tóm tắt
muc('tiền đặt hiện bằng CHIP trên ô');
// Chủ server: bàn 52 ô mà liệt kê cược thành dòng chữ thì kiểu gì cũng tràn màn hình.
// Tiền đặt là của riêng từng người -> đọc thẳng trên ô nhanh hơn nhiều.
ok('KHÔNG còn liệt kê từng cửa thành dòng chữ',
    !/j\.myBets\.map\(function\(b\)\{return NAMES/.test(SRC) && !/mb\.length>8/.test(SRC));
ok('dòng còn lại chỉ kể tổng tiền + số ô',
    /Ván này bạn đặt "\+vnd\(mTong\)\+" Dogcoin vào "\+mb\.length\+" ô/.test(SRC));
// Chủ server chốt: dấu cược là ĐỒNG DOGCOIN thật, số tiền là chú thích nhỏ dưới
// đồng xu; đồng nào từ 50.000 Dogcoin trở lên thì viền/nền đen cho nổi.
ok('dấu cược là ĐỒNG DOGCOIN thật, không phải chấm màu',
    /'\.sbO \.sbGio\{position:absolute;top:50%;left:50%/.test(SRC) &&
    /im\.src="\/dogcoin\.png"/.test(SRC) && /'\.sbO \.sbGio img\{/.test(SRC));
ok('số tiền là chú thích nhỏ NGAY DƯỚI đồng xu',
    /flex-direction:column/.test(SRC) && /'\.sbO \.sbGio b\{/.test(SRC) &&
    /sn\.textContent=chipNgan\(toi\)/.test(SRC));
ok('đồng nặng >= 50.000 đổi sang viền đen',
    /var CHIP_DEN=50000;/.test(SRC) && /toi>=CHIP_DEN\?" sbGioDen":""/.test(SRC) &&
    /'\.sbO \.sbGio\.sbGioDen img\{/.test(SRC) && /'\.sbO \.sbGio\.sbGioDen b\{/.test(SRC));
// markup nút mệnh giá giờ tách nhiều dòng (thêm nhánh MAX), nên soi cả cụm
ok('hàng mệnh giá chọn cũng kèm đồng Dogcoin',
    SRC.includes('onclick="sbDatChip(') && SRC.includes('MAX CƯỢC') &&
    /function sbVeChip\(\)[\s\S]{0,700}?src="\/dogcoin\.png"/.test(SRC));
ok('đồng xu không chắn chuột (bấm xuyên qua để đặt tiếp)', /pointer-events:none;line-height:1\}/.test(SRC));
ok('số tiền được rút gọn cho vừa (chipNgan)', /function chipNgan\(n\)/.test(SRC));
ok('rê chuột vào chip vẫn xem được số tiền đầy đủ', /d\.title=vnd\(toi\)\+" Dogcoin"/.test(SRC));
// Tiền bạc: rút gọn phải làm tròn XUỐNG, không được khai khống (999.999 -> 999K chứ không phải 1000K)
ok('rút gọn làm tròn XUỐNG, không khai khống tiền',
    /Math\.floor\(t\):Math\.floor\(t\*10\)/.test(SRC) && /Math\.floor\(k\):Math\.floor\(k\*10\)/.test(SRC) &&
    !/Math\.round\(k\)/.test(SRC));

// ---------------------------------------------------------------- 3 nút thao tác nhanh
muc('3 nút: 🔁 đặt lại · ✖️2 · 🗑️ xoá cược');
ok('có đủ 3 nút trên trang',
    /id="sbBtnLai"/.test(SRC) && /id="sbBtnX2"/.test(SRC) && /id="sbBtnXoa"/.test(SRC));
ok('mỗi nút gọi đúng đường của nó',
    /sbDatLai\(\)\{sbNutGoi\("\/api\/tx\/datlai"/.test(SRC) &&
    /sbX2\(\)\{sbNutGoi\("\/api\/tx\/x2"/.test(SRC) &&
    /sbXoaCuoc\(\)\{sbNutGoi\("\/api\/tx\/xoacuoc"/.test(SRC));
// Chủ server dặn rõ: thiếu số dư thì "show nhẹ, đừng show theo popup rồi tắt".
ok('báo lỗi bằng DÒNG ĐỨNG YÊN, không dùng toast tự tắt',
    /function sbBao\(chu,loi\)/.test(SRC) &&
    /\.catch\(function\(e\)\{SBNUTBAN=false;sbBao\(String\(e\.message\|\|e\),true\)/.test(SRC));
ok('dòng báo có ô riêng trên trang + kiểu lỗi/thành công',
    /id="sbBao"/.test(SRC) && /'\.sbBao\.loi\{/.test(SRC) && /'\.sbBao\.oke\{/.test(SRC));
ok('chặn bấm dồn lúc mạng chậm (SBNUTBAN)', /if\(SBNUTBAN\)return;SBNUTBAN=true/.test(SRC));
ok('nút tự khoá khi không dùng được (hết giờ / chưa đặt / chưa có ván trước)',
    /function sbNutVe\(\)/.test(SRC) && /b1\.disabled=!\(mo&&SBCOVT&&!coCuoc\)/.test(SRC) &&
    /b2\.disabled=!\(mo&&coCuoc\)/.test(SRC) && /b3\.disabled=!\(mo&&coCuoc\)/.test(SRC));
ok('sang ván mới thì dọn dòng báo cũ', /prevPhase!=="bet"&&PHASE==="bet"\)sbBao\(""/.test(SRC));
ok('máy chủ cho biết có giỏ ván trước không', /SBCOVT=!!j\.txVanTruoc/.test(SRC));

// Chủ server: ra kết quả rồi thì đồng Dogcoin chỉ nằm ở ô TRẢ THƯỞNG — rải 47 ô mà
// giữ hết chip thì 47 đồng xu che kín bàn, không thấy ô nào đang ăn.
muc('ra kết quả: chip chỉ nằm ở ô trả thưởng');
ok('ô trượt giấu hẳn đồng xu + nhãn tiền bàn',
    SRC.includes("'.sbO.sbTruot .sbGio,.sbO.sbTruot .sbBan2{display:none}'"));
ok('ô trúng thì đồng xu to hơn cho nổi', SRC.includes("'.sbO.sbTrung .sbGio img{width:26px"));
ok('lúc ĐANG ĐẶT vẫn hiện chip mọi ô đã đặt (không giấu sớm)',
    SRC.includes('d.className="sbGio"+(toi>=CHIP_DEN'));

muc('lịch sử kể được ô nào nhân, ô nào mình ăn');
// Chủ server: dòng lịch sử cũ dài không đọc nổi và KHÔNG kể ô nào được nhân.
// Chủ server: "chỉ show x ván đó mà RA TRÚNG thôi". Mỗi ván ~7 ô sáng nhưng đa số
// không ra — kể hết là rác. Lọc ngay lúc chốt ván cho nhẹ DB và mọi chỗ đều sạch.
ok('lịch sử CHỈ lưu ô nhân ĐÃ RA TRÚNG',
    IDX.includes('const trung = new Set(TX_CUA.cuaThang([d1, d2, d3]));') &&
    IDX.includes('for (const k of Object.keys(bn)) if (trung.has(k)) r[k] = bn[k];'));
ok('ván không ô nhân nào ra thì KHÔNG có dòng ⚡', IDX.includes("let dongNhan = '';"));
// Lọc 2 TẦNG: tầng ghi cho nhẹ DB, tầng hiển thị để 20 ván CŨ (ghi trước bản vá,
// còn nguyên bảng nhân đầy đủ trong DB) hiện đúng ngay, khỏi chờ trôi.
ok('Discord lọc LẠI lúc hiển thị, ván cũ cũng sạch',
    IDX.includes('const oTrung = new Set(Array.isArray(h.dice) && h.dice.length === 3 ? cuaThang(h.dice) : []);') &&
    IDX.includes('Object.keys(nh).filter(k => oTrung.has(k))'));
ok('web cũng lọc trước khi gửi xuống trang',
    SRC.includes('const locNhanTrung = (h) =>') && SRC.includes('nhan: locNhanTrung(h)'));
ok('danh sách ô trúng lấy từ lõi tiền qua ctx, không tự đoán',
    SRC.includes('ctx.txCuaThang ? ctx.txCuaThang(h.dice) : []') && IDX.includes('txCuaThang: (xx) => TX_CUA.cuaThang(xx),'));
// 2 lỗi chữ chủ server chụp được trên bảng Discord
// 22/09 chủ server chốt: dòng Discord chỉ cần KẾT QUẢ + AI + THẮNG/THUA BAO NHIÊU.
// Phần kể từng ô ("3 ô, trúng 2: …") và mặt xúc xắc đã BỎ — dài gấp đôi mà vẫn phải
// tự cộng trừ. Mấy phép dưới canh để không ai lỡ tay dựng lại.
ok('bỏ hẳn phần kể từng ô và mặt xúc xắc khỏi dòng Discord',
    !IDX.includes('const so = ` (${p.soO} ô`;') && !IDX.includes('`trúng ${thang.length}`') &&
    !/const dice = \(h\.dice \|\| \[\]\)\.map\(d => DICE_EMOJIS/.test(IDX));
ok('dòng gọn: đầu dòng kết quả, xuống dòng là người + lãi/lỗ',
    IDX.includes("const kq = h.storm") && /return `\${head} \${kq}\${dongNhan}` \+ \(parts\.length \? `\\n {3}\${parts\.join\(' · '\)}` : ''\);/.test(IDX));
ok('ai nhúc nhích mạnh nhất lên trước, cắt 6 người cho khỏi vỡ trần embed',
    IDX.includes('.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))') && IDX.includes("parts.push(`… +${ds.length - 6} người`)"));
ok('kế hoạch trả tiền giữ luôn bảng nhân (phòng khi đã dọn)', IDX.includes('bangNhan,'));
ok('web nhận được bảng nhân của ván (đã lọc chỉ ô ra trúng)',
    SRC.includes('winners: h.winners || [], nhan: locNhanTrung(h)'));

// 🚫 ván huỷ phải HIỆN RA trên bảng 20 ván, không được biến mất (21/09)
ok('web gửi kèm cờ huỷ + lý do', SRC.includes('huy: !!h.huy') && SRC.includes("lyDo: h.lyDo || ''"));
ok('bảng 20 ván vẽ riêng dòng VÁN HUỶ', /if\(h\.huy\)return/.test(SRC) && SRC.includes('VÁN HUỶ'));
ok('...và có kiểu riêng cho nó', SRC.includes("'.hrow.huy{") && SRC.includes(".hrow .lydo{"));
ok('bảng 20 ván có dòng phụ ⚡', SRC.includes('function hSub(h)') && SRC.includes("'.hsub{"));
// Chủ server kêu 'vướng mắt': hiện ⚡ ở mọi ván với 5 huy hiệu vàng thì át mất
// dãy kết quả - thứ chính của bảng soi cầu. Nên MẶC ĐỊNH TẮT, có công tắc.
// Chủ server chốt lại: lúc deploy phải BẬT sẵn, nhưng ai tự tắt thì F5 vẫn tắt.
// Điều kiện phải là !== "0" (chưa chọn -> bật). Viết === "1" là người mới vào bị tắt.
ok('mặc định BẬT, ai tự tắt thì F5 vẫn nhớ là tắt',
    SRC.includes('var HNHAN=localStorage.getItem("tx_hnhan")!=="0";') &&
    SRC.includes('function hNhanBat(v)') && SRC.includes('id="hNhanOn"'));
// Trong hSub, phần "bạn ăn" phải nằm TRƯỚC nhánh if(HNHAN) thì mới luôn hiện.
{
    const than = SRC.slice(SRC.indexOf('function hSub(h)'), SRC.indexOf('function hSub(h)') + 900);
    ok('phần MÌNH ăn vẫn luôn hiện dù tắt công tắc',
        than.indexOf('🎯 ') > 0 && than.indexOf('🎯 ') < than.indexOf('if(HNHAN){'),
        'vị trí trong hSub: ' + than.indexOf('🎯 ') + ' vs ' + than.indexOf('if(HNHAN){'));
}
ok('ô tick không bị lệch (margin 0 + line-height khớp chữ)',
    SRC.includes("'.hTog input{width:14px;height:14px;margin:0") && SRC.includes("'line-height:1;',"));
ok('huy hiệu ⚡ làm nhỏ + xỉn, không viền vàng tranh chỗ',
    SRC.includes("'.hsub .xx{display:inline-block;background:#2b2f3c") && !SRC.includes('.hsub .xx{display:inline-block;background:#3a2e10'));
// Dòng Discord: mỗi người CHỈ kể ô ăn được, ô thua gói lại thành một con số
ok('dòng Discord rút gọn tiền (k / tr)', IDX.includes('function txTienNgan(n)'));
ok('ván CŨ thiếu số nhận về vẫn tính đúng theo winners (không in ai cũng thua)',
    IDX.includes('const cuMoi = (h.bets || []).every(b => b && b.nhan !== undefined);') &&
    IDX.includes('Object.keys(per).forEach(u => { per[u].net = (nhan[u] || 0) - per[u].bo; });'));
ok('dòng Discord có kể ô được nhân', IDX.includes("dongNhan = ' · ⚡ '"));

muc('nút MAX CƯỢC + hiệu ứng chip bay');
ok('đã bỏ mệnh giá 5.000, thêm max ở cuối',
    SRC.includes('var SBMENH=[1000,10000,20000,50000,100000,"max"];'));
ok('nút MAX có kiểu riêng màu đỏ', SRC.includes('.chip.chipMax{') && SRC.includes('chipMax'));
// Chủ server: trần ô 200.000 mà ví 400.000 thì CHỈ 200.000 được vào.
// MAX phải bị chặn bởi cả 3: ví còn, trần riêng của ô, trần tổng cả ván.
ok('MAX bị chặn bởi VÍ + TRẦN Ô + TRẦN TỔNG VÁN',
    SRC.includes('function sbTienMax(id)') && SRC.includes('var con=BAL;') &&
    SRC.includes('con=Math.min(con,Math.max(0,tran-daCo))') &&
    SRC.includes('con=Math.min(con,Math.max(0,TXMAX-tong))'));
ok('client biết trần tổng ván (TXMAX lấy từ máy chủ)', SRC.includes('TXMAX=j.txMax||0;'));
ok('ví dưới 1.000 vẫn đặt được bằng MAX (không kẹt mệnh giá nhỏ nhất)',
    SRC.includes('if(SBCHIP==="max"){tien=sbTienMax(id);'));
ok('có hiệu ứng chip bay vào ô, tự dọn sau khi bay',
    SRC.includes('function sbChipBay(id,tien)') && SRC.includes("'.sbBay{") &&
    SRC.includes('b.remove()},520)'));
ok('chip bay KHÔNG chắn chuột',
    SRC.includes("'.sbBay{position:fixed;z-index:9999;pointer-events:none"));

muc('thang hệ số nhân admin chỉnh được');
ok('panel có ô nhập thang + nút lưu + về mặc định',
    /id="txThang"/.test(PANEL) && /function txSaveThang()/.test(PANEL) && /function txThangMacDinh()/.test(PANEL));
ok('route /api/tx/thang bị chặn ở cổng thường', PANEL.includes("'/api/tx/thang'"));
ok('ô Admin POKER đã rời khỏi tab Tài Xỉu, nằm trong tab Poker',
    PANEL.indexOf('pokerAdminIds') > PANEL.indexOf('id="tab-poker"'));

muc('RTP admin chỉnh được');
ok('panel có ô nhập RTP + nút lưu',
    /id="txRTP"/.test(PANEL) && /function txSaveRTP\(\)/.test(PANEL));
ok('route /api/tx/rtp bị chặn ở cổng thường', /'\/api\/tx\/tran', '\/api\/tx\/rtp',/.test(PANEL));
ok('panel nhận cả 95 lẫn 0.95 cho đỡ nhầm', /if \(Number\.isFinite\(r\) && r > 1\) r = r \/ 100;/.test(PANEL));
ok('panel hiện luôn tác động: nhà cái ăn + số ô sáng mỗi ván',
    /nhà cái ăn ~'\+\(STATE\.tx\.rtp\.nhaCaiAn\*100\)/.test(PANEL));

// ---------------------------------------------------------------- ⚡ bàn Siêu
muc('⚡ bàn Siêu Tài Xỉu dùng chung CSS sân khấu');
// 22/09 chủ server chụp: xúc xắc bàn Siêu xếp DỌC, chén to đùng — vì CSS sân khấu
// khoá theo ID bàn thường (#stage, #diceRow, #paper...) mà bàn Siêu dùng id khác.
// Mỗi rule sân khấu phải LIỆT KÊ cả id bàn Siêu.
for (const [a, b] of [['#stage', '#stStage'], ['#diceRow', '#stDiceRow'], ['#paper', '#stPaper'],
    ['#sumBadge', '#stSumBadge'], ['#stageCap', '#stStageCap']]) {
    ok('rule ' + a + '{ cũng áp cho ' + b, SRC.includes("'" + a + ',' + b + '{'), 'thiếu ' + a + ',' + b);
}
ok('chén bàn Siêu ẩn được (#stPaper.hidden)', SRC.includes('#stPaper.hidden{display:none}'));
ok('chén bàn Siêu kéo được (#stPaper.open)', SRC.includes('#stPaper.open{cursor:grab}'));
ok('xúc xắc bàn Siêu xếp tam giác (first-child span 2)', SRC.includes('#stDiceRow .die:first-child{grid-column:1 / span 2}'));
ok('dải phí gọn "PHÍ 20%" (chủ server bỏ dòng dài)', SRC.includes("'<div class=\"stPhi\">💸 PHÍ 20%</div>'"));
ok('phí vẫn hiện số tiền thật ngay dưới hàng mệnh giá', SRC.includes('id="stPhiNho"') && SRC.includes('Bấm 1 ô là trừ <b>'));
ok('ô nhân bàn Siêu GIẬT NHƯ CÓ SÉT', SRC.includes('@keyframes stSet{') && SRC.includes('animation:stSet 1.5s'));
ok('bàn Siêu chỉ hỏi máy chủ khi đang đứng ở tab đó', SRC.includes('function stLoad(){if(CURPAGE!=="stx")return;'));
// 22/09: giữ chip để nhấc lên, thả sang ô khác = dời, thả vào vùng huỷ giữa đáy màn = huỷ ô đó.
muc('kéo thả chip (một bộ dùng chung cho 2 bàn)');
ok('bộ kéo thả gắn vào CẢ HAI bàn', SRC.includes('keoGan("sb")') && SRC.includes('keoGan("st")'));
ok('giữ 0,28s mới nhấc; nhích >8px hay nhả sớm = bấm thường',
    /setTimeout\(function\(\)\{keoHuyCho\(\);keoBatDau\(c\)\},280\)/.test(SRC) && /Math\.abs\(e\.clientX-x0\)>8/.test(SRC));
ok('chỉ nhấc được ô ĐANG CÓ chip của mình, và chỉ trong pha đặt',
    /if\(!o\|\|!o\.querySelector\("\.sbGio"\)\)return;/.test(SRC) && /if\(B\.phase!=="bet"\)return;var id=o\.id\.slice\(3\)/.test(SRC));
ok('vùng huỷ nằm GIỮA ĐÁY màn, chỉ hiện khi đang kéo',
    SRC.includes("'#sbKeoHuy{position:fixed;left:50%;bottom:18px;transform:translateX(-50%)") && /h\.className="hidden";document\.body\.appendChild\(h\)/.test(SRC));
ok('thả vào vùng huỷ -> xoacua đúng ô; thả lên ô khác -> doicua',
    /keoGoi\(B,"xoacua",\{cua:k\.id\}/.test(SRC) && /keoGoi\(B,"doicua",\{tu:k\.id,den:k\.dich\.id\.slice\(3\)\}/.test(SRC));
ok('click trình duyệt bắn ra sau khi nhả tay bị chặn ở cả sbChon và stChon',
    /function sbChon\(id\)\{if\(KEO\|\|Date\.now\(\)-KEOCLICK<500\)return;/.test(SRC) && /function stChon\(id\)\{if\(KEO\|\|Date\.now\(\)-KEOCLICK<500\)return;/.test(SRC));
ok('chỉ ô có chip mới khoá cuộn (touch-action:none) — ô trống vẫn vuốt trang được',
    SRC.includes("'.sbO.sbCoChip{touch-action:none") && /e\.classList\.toggle\("sbCoChip",toi>0\)/.test(SRC) && !/'\.sbO\{[^']*touch-action:none/.test(SRC));
ok('con ma tự đủ CSS (nằm ngoài .sbO), giữ viền đen cho chip nặng',
    SRC.includes("'.sbKeoGhost{position:fixed;z-index:9999;pointer-events:none") && SRC.includes("'.sbKeoGhost.sbGioDen img{"));
ok('4 route kéo thả có mặt (tx + stx)',
    /path === '\/api\/tx\/xoacua' \|\| path === '\/api\/tx\/doicua'/.test(SRC) && SRC.includes("path === '/api/stx/xoacua'") && SRC.includes("path === '/api/stx/doicua'"));
ok('index.js có txXoaCua + txDoiCua và đưa vào ctx web',
    /function txXoaCua\(userId, cua\)/.test(IDX) && /function txDoiCua\(userId, tu, den\)/.test(IDX) &&
    /txXoaCua: \(uid, cua\) => txXoaCua\(uid, cua\)/.test(IDX) && /txDoiCua: \(uid, tu, den\) => txDoiCua\(uid, tu, den\)/.test(IDX));
ok('dời chip trên máy chủ kiểm trần ô đích RỒI MỚI đụng sổ',
    /const tranO = TX_CUA\.tranCua\(den, txTranCfg\(\)\);\s*const daCo = txBetCuaCua\(userId, den\);\s*if \(tranO > 0 && daCo \+ tien > tranO\)/.test(IDX));
ok('huỷ 1 ô / dời ô đều câm ngoài pha đặt (txDangNhanCuoc)',
    /function txXoaCua\(userId, cua\) \{\s*const chan = txDangNhanCuoc\(\);/.test(IDX) && /function txDoiCua\(userId, tu, den\) \{\s*const chan = txDangNhanCuoc\(\);/.test(IDX));

// Chủ server 22/09: "chọn mức cược nào thì highlight lên cho họ biết đang chọn".
muc('mệnh giá ĐANG CHỌN phải nhìn phát biết');
ok('rule chọn liệt kê CẢ HAI bàn (bản cũ chỉ #sbChips nên bàn Siêu không có dấu hiệu gì)',
    SRC.includes("'#sbChips .chip.on,#stChips .chip.on{"));
ok('dấu hiệu KHÔNG chỉ dựa vào màu: có ✓ ở góc',
    SRC.includes("'#sbChips .chip.on::after,#stChips .chip.on::after{content:\"✓\""));
ok('nhấc lên + viền sáng + nảy một cái khi bấm',
    /transform:translateY\(-3px\)/.test(SRC) && /box-shadow:0 0 0 3px rgba\(255,207,92,\.45\)/.test(SRC) &&
    SRC.includes('animation:chipNay .28s ease}') && SRC.includes("'@keyframes chipNay{"));
ok('.chip có position:relative (không thì ✓ bay ra góc màn) + transition',
    /'\.chip\{flex:1;position:relative;/.test(SRC) && /transition:transform \.12s ease,box-shadow \.12s ease,background \.12s ease\}/.test(SRC));
ok('MAX CƯỢC lúc chọn vẫn ĐỎ, không hoá vàng như mệnh giá thường',
    SRC.includes("'#sbChips .chip.chipMax.on,#stChips .chip.chipMax.on{background:linear-gradient(180deg,#ff4d63,#a51e30);"));
ok('máy tắt hiệu ứng chuyển động thì bỏ nảy, vẫn giữ nền vàng + ✓',
    SRC.includes("'@media (prefers-reduced-motion:reduce){#sbChips .chip.on,#stChips .chip.on{animation:none;transform:none}}'"));
ok('cả 2 bàn vẫn gắn lớp on đúng mệnh giá đang chọn',
    SRC.includes('(v===SBCHIP?" on":"")') && SRC.includes('(v===STCHIP?" on":"")'));

// 22/09: bàn Siêu có BẢNG DISCORD riêng, chạy chung kênh với bàn thường được.
muc('bảng Discord bàn Siêu + chung một kênh');
ok('một hàm dòng kết quả DÙNG CHUNG hai bàn (tên cửa + cửa thắng truyền vào)',
    IDX.includes('function dongVanDiscord(h, opt)') &&
    IDX.includes('const txHistoryLine = (h) => dongVanDiscord(h, { tenCua: txTenCua, cuaThang: (d) => TX_CUA.cuaThang(d) });') &&
    IDX.includes('tenCua: (id) => (SIEU_CUA.THEO_ID[id] || {}).ten || id,'));
ok('lãi/lỗ trừ CẢ PHÍ — bàn Siêu không được khoe lãi cao hơn tiền thật trong ví',
    IDX.includes("per[b.u].bo += (b.amount || 0) + (b.phi || 0);") &&
    BAN.includes('cuaAgg[k].phi += (b.phi || 0);'));
ok('máy bàn Siêu có bangDiscord (tách khỏi adminXem/trangThai) và lọc ván trống',
    BAN.includes('function bangDiscord(soVan)') &&
    BAN.includes('history: S.history.filter(h => (h.bets || []).length).slice(0, soVan || 10),') &&
    BAN.includes('nhip, khoiDong, trangThai, adminXem, bangDiscord,'));
ok('bảng Siêu: dựng/gỡ/nối-lại-sau-restart đủ bộ, có vòng lặp 5 giây',
    /function getStxBoardData\(\)/.test(IDX) && /async function startStxBoard\(channel\)/.test(IDX) &&
    /function stopStxBoard\(\)/.test(IDX) && /async function resumeStxBoard\(\)/.test(IDX) &&
    /function runStxBoardLoop\(\)/.test(IDX) && IDX.includes('runStxBoardLoop();') &&
    IDX.includes("resumeStxBoard().catch(e => writeLog('SYSTEM'"));
ok('bảng Siêu KHÔNG có nút đặt cược (thuần khoe kết quả, không đụng tiền)',
    /setCustomId\('web_pin'\)\.setLabel\('🌐 Chơi Siêu Tài Xỉu trên web'\)/.test(IDX) &&
    !/stx.*setCustomId\('bet/.test(IDX));
ok('bảng Siêu vẽ lại theo DẤU VẾT, không vẽ mỗi giây',
    IDX.includes("let stxDauVet = '';") && IDX.includes('if (vet !== stxDauVet) { stxDauVet = vet; stxBoard.needsUpdate = true; }'));
ok('CHUNG KÊNH: bảng thường không nhảy xuống cuối chỉ vì bảng Siêu vừa cập nhật',
    IDX.includes('const txIsLast = !!prevMsgId && (idCuoi === prevMsgId || (!!stxBoard.message && idCuoi === stxBoard.message.id));'));
ok('CHUNG KÊNH: repostBoard nhận danh sách bảng anh em',
    IDX.includes('async function repostBoard(board, getData, msgKey, label, titleMatch, idAnhEm) {') &&
    IDX.includes('const isLast = !!board.message && (idCuoi === board.message.id || anhEm.includes(idCuoi));') &&
    IDX.includes('() => (txState.message ? [txState.message.id] : [])'));
ok('panel bật/tắt được bảng Siêu, route nằm trong VIEWONLY',
    IDX.includes('startStxBoard: async (channelId)') && IDX.includes('getStxBoard: () =>') &&
    PANEL.includes("path === '/api/stx/board/start'") && PANEL.includes("path === '/api/stx/board/stop'") &&
    PANEL.includes("'/api/stx/board/start', '/api/stx/board/stop'"));

// 22/09 rà: bàn Siêu phải NGANG bàn thường ở cả panel lẫn trang người chơi
muc('bàn Siêu ngang bàn thường (rà 22/09)');
ok('lịch sử Siêu có công tắc ⚡ riêng, dùng chung HNHAN, bật/tắt tải lại đúng bàn',
    SRC.includes('id="stHNhanOn" onchange="hNhanBat(this.checked)"') && SRC.includes('if(CURPAGE==="stx")stLoad();else refresh()'));
ok('lịch sử Siêu: "🎯 bạn ăn" LUÔN hiện, ⚡ chỉ khi bật, tối đa 3 ô',
    SRC.includes('an2=(h.bets||[]).filter(function(b){return b.u===MYID&&(b.nhan||0)>0})') &&
    SRC.includes("'if(HNHAN){var nh=h.nhan||{},ids=Object.keys(nh).sort(function(a,b){return nh[b]-nh[a]});',") &&
    SRC.includes('if(ids.length)p2.push(ids.slice(0,3)'));
ok('dòng nhắc bàn Siêu đổi theo pha (bàn thường đã làm từ trước)', SRC.includes('var nh3=$("stNhac");if(nh3)nh3.textContent=STPHASE==="bet"?'));
ok('bàn Siêu nhắc giới hạn cược/người/ván như bàn thường', SRC.includes('var gh=STMAX>0?("💰 Giới hạn cược "+vnd(STMAX)+"/người/ván"):""'));
ok('cả 2 bàn nhắc "giữ chip để kéo sang ô khác"', SRC.split('giữ chip để kéo sang ô khác').length - 1 === 2);
ok('panel Siêu: gợi ý ép rẻ nhất + huỷ ép + xem trước tổng + 4 nút nhanh',
    PANEL.includes('onclick="stxTuEp()"') && PANEL.includes('onclick="stxHuyEp()"') && PANEL.includes('id="stxPrev"') &&
    PANEL.includes('onclick="stxSetDice(6,6,4)"') && PANEL.includes("path === '/api/stx/epclear'") && PANEL.includes("'/api/stx/epclear'"));
ok('panel Siêu liệt kê từng người đặt + số lượt (không chỉ tổng theo cửa)',
    PANEL.includes("(S.bets||[]).slice().reverse().map(b=>esc(b.name)") && PANEL.includes("(S.betsCount||0)+' lượt đặt"));
ok('gợi ý ép Siêu lấy THẲNG từ máy chủ (epGoiY), không tự đoán ở trình duyệt',
    PANEL.includes('const g=S.epGoiY;') && !/function stxTuEp\(\)[\s\S]{0,400}for\s*\(/.test(PANEL));
ok('xem trước ép báo BÃO khi 3 viên giống nhau — cả 2 bàn', PANEL.split('BÃO — Tài/Xỉu/Chẵn/Lẻ thua sạch').length - 1 === 2);
ok('"ô sáng/ván" ở panel luôn ghi rõ TRUNG BÌNH (từng ván lệch quanh số đó)',
    PANEL.split('ô sáng/ván').slice(0, -1).every(s => s.slice(-90).includes('trung bình')));
ok('index.js: báo cược Siêu về Discord dùng chung _txNoti, nối qua ctx.baoCuoc',
    /function stxNotifyBet\(userId, ten, cua, soTien\)/.test(IDX) && /baoCuoc: \(id, ten, cua, tien\) => stxNotifyBet\(id, ten, cua, tien\)/.test(IDX) &&
    /const c = txNotiCfg\(\);\s*if \(!c\.on \|\| !c\.id \|\| soTien < c\.min\) return;\s*const CUA_S/.test(IDX));
ok('ban.js: epGoiY + betsCount + huyEp + baoCuoc bọc try/catch',
    BAN.includes('epGoiY: timEpReNhat(), betsCount: S.bets.length,') && BAN.includes('function huyEp()') &&
    BAN.includes('if (ctx.baoCuoc) for (const k of ds) { try { ctx.baoCuoc(userId, ten, k, gop[k]); } catch (e) { } }'));

ok('mọi id bàn Siêu bắt đầu bằng st, không đụng bàn thường', !/id="sb[A-Z]/.test(SRC.slice(SRC.indexOf('id="pageStx"'), SRC.indexOf('hết #pageStx'))));

// ============================================================================
// 💸 MAX BÀN SIÊU PHẢI NÓI THẬT (22/09)
// Bạn chủ server: ví tròn 100.000, bấm MAX vào XỈU -> ô hiện 83.333, thắng nhận 166.667,
// tưởng bug. Máy tính KHÔNG sai (phí 20% cộng thêm: floor(100.000/1,2)=83.333, phí 16.666,
// trừ 99.999; thắng 1:1 = 166.667, lãi +66.667). Sai là ba chỗ NÓI DỐI người chơi.
// ============================================================================
muc('💸 MAX bàn Siêu nói thật (ví 100.000 -> cược 83.334 + phí 16.666 = trừ đúng 100.000)');
{
    const STX = require(path.join(__dirname, '..', '..', 'SieuTaiXiu', 'cua.js'));

    // ---- toán học: chạy ĐÚNG hàm stMaxTheoVi của trang (bóc từ SRC), đối chiếu phí máy chủ ----
    const mHam = SRC.match(/'function stMaxTheoVi\(bal\)\{([^']*)\}'/);
    ok('trang có hàm stMaxTheoVi (một chỗ tính MAX cho cả nút lẫn preview)', !!mHam, 'không thấy');
    const maxCua = mHam ? new Function('bal', 'STPHI', mHam[1].replace(/^\{|\}$/g, '')) : (() => 0);
    const mc0 = maxCua(100000, STX.PHI);
    ok('⭐ ví 100.000: cược 83.334 · phí 16.666 · trừ ĐÚNG 100.000 (không dư 1 như floor(ví/1,2))',
        mc0 === 83334 && STX.tienPhi(mc0) === 16666 && STX.tienTru(mc0) === 100000,
        JSON.stringify({ cuoc: mc0, phi: STX.tienPhi(mc0), tru: STX.tienTru(mc0) }));
    ok('...thắng 1:1 nhận 166.668 (ăn 83.334 + vốn 83.334) -> lãi thật +66.668',
        STX.tinhTra('xiu', mc0, [1, 2, 3], {}) === 166668 && 166668 - 100000 === 66668,
        String(STX.tinhTra('xiu', mc0, [1, 2, 3], {})));
    {
        let lo = 0, khongMax = 0, thu = 0;
        for (let bal = 1000; bal <= 2000000; bal += 997) {          // bước lẻ để quét đủ số dư
            thu++;
            const mc = maxCua(bal, STX.PHI);
            if (STX.tienTru(mc) > bal) lo++;                            // rút lố ví
            if (STX.tienTru(mc + 1) <= bal) khongMax++;                 // còn nhét thêm được -> chưa phải max
        }
        ok('⭐ quét ' + thu + ' mức ví: MAX KHÔNG BAO GIỜ rút lố ví (cược + phí ≤ ví)', lo === 0, lo + ' ca lố');
        ok('⭐ ...và luôn là mức LỚN NHẤT trả nổi phí (thêm 1 là vượt ví)', khongMax === 0, khongMax + ' ca chưa max');
    }
    ok('nút MAX và dòng preview cùng gọi stMaxTheoVi (không ai tự chia 1,2 riêng)',
        /function stTienMax\(id\)\{var con=stMaxTheoVi\(BAL\);/.test(SRC) &&
        /var mc=stMaxTheoVi\(BAL\),mp=Math\.floor\(mc\*STPHI\);/.test(SRC) &&
        (SRC.match(/Math\.floor\(BAL\/\(1\+STPHI\)\)/g) || []).length === 0);

    // ---- ① dòng preview khi chọn MAX ----
    const iP = SRC.indexOf("'var p=$(\"stPhiNho\")");
    const preview = iP >= 0 ? SRC.slice(iP, iP + 900) : '';
    ok('tìm được dòng preview phí của bàn Siêu', !!preview);
    ok('⭐ KHÔNG còn câu "ví bị trừ thêm 20% phí" (ngụ ý cược trọn ví rồi phí cộng thêm)',
        !/trừ thêm/.test(preview), preview.slice(0, 160));
    ok('⭐ MAX in đủ ba con số tính từ ví đang có: trọn ví · cược · phí',
        /đổ trọn ví/.test(preview) && /stMaxTheoVi\(BAL\)/.test(preview) && /phí <b>/.test(preview));
    ok('...và nói thẳng VÌ SAO không cược được trọn ví', /phí .*cộng THÊM trên tiền cược/.test(preview));
    ok('...ví hết tiền thì nói hết, không in số âm/0 vô nghĩa', /ví hết Dogcoin rồi/.test(preview));

    // ---- ② tooltip đồng chip trên ô Siêu ----
    const iG = SRC.indexOf("'function stVeGio(){");
    const veGio = iG >= 0 ? SRC.slice(iG, iG + 1200) : '';
    ok('⭐ tooltip trên ô ghi đủ "Cược X + phí Y = trừ ví Z"',
        /d\.title="Cược "\+vnd\(toi\)\+" \+ phí "\+vnd\(Math\.floor\(toi\*STPHI\)\)/.test(veGio), veGio.slice(0, 120));
    ok('...bàn THƯỚNG không bị vạ lây (không có phí, tooltip vẫn "X Dogcoin")',
        /'d\.appendChild\(im\);d\.appendChild\(sn\);d\.title=vnd\(toi\)\+" Dogcoin";e\.appendChild\(d\)\}',/.test(SRC));

    // ---- ③ lịch sử: dòng từng ô phải khớp dòng tổng ----
    const iH = SRC.indexOf("'function stHist(list)");
    const hist = iH >= 0 ? SRC.slice(iH, iH + 2200) : '';
    ok('⭐ dòng từng ô trừ CẢ PHÍ: nhận − cược − phí (khớp dòng tổng bên phải)',
        /vnd\(\(b\.nhan\|\|0\)-b\.amount-\(b\.phi\|\|0\)\)/.test(hist), hist.slice(0, 120));
    ok('...dòng tổng vẫn tính theo đúng số ví bị trừ', /var net=an-Math\.floor\(cuoc\*\(1\+STPHI\)\);/.test(hist));
    ok('...máy bàn có gửi b.phi trong từng ô của lịch sử (cuaAgg)',
        /cuaAgg\[k\] = \{ u: b\.userId, name: b\.username, choice: [^}]*phi: 0, nhan: 0 \}/.test(BAN) &&
        /cuaAgg\[k\]\.phi \+= \(b\.phi \|\| 0\);/.test(BAN));

    // ---- README không được hứa sai ----
    const RM = fs.readFileSync(path.join(__dirname, '..', '..', 'SieuTaiXiu', 'README.md'), 'utf8');
    ok('README không còn nói MAX "y bàn thường"', !/nút MAX CƯỢC, 3 nút thao tác/.test(RM));
    ok('README có mục 5c giải thích ca 100.000 -> 83.333', /## 5c\./.test(RM) && /83\.333/.test(RM) && /166\.667/.test(RM));
    ok('...và nói rõ muốn MAX = trọn ví thì phải đổi mô hình phí (chưa làm, chờ chủ server)',
        /đổi mô hình phí/.test(RM) && /Chưa làm/.test(RM));
}

console.log('\n🎨 GIAO DIỆN BÀN SIC BO: ' + P + ' đạt, ' + F_ + ' hỏng');
process.exit(F_ ? 1 : 0);
