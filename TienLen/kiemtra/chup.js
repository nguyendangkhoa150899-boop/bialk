// ============================================================================
//  chup.js, CHỤP MÀN HÌNH THẬT CỦA BÀN TIẾN LÊN, KHÔNG CẦN NGƯỜI NGỒI BẤM
//
//  VÌ SAO CÓ FILE NÀY (chủ server hỏi 20/09: "máy cá nhân mình mạnh có cách nào
//  lấy AI claude phụ được ko để khai thác được máy mình"):
//    Suốt mấy ngày làm giao diện, vòng lặp luôn là, chủ server chụp màn hình báo lỗi,
//    bên này sửa MÙ rồi đoán, chủ server chụp lại, sai nữa, lặp. Có bug đi tới 4 vòng
//    (mảng bài lật, bài văng lên góc). Lý do: bộ kiểm chỉ đọc được CHỮ trong CSS, nó
//    xác nhận "có viết dòng đó" chứ KHÔNG biết dòng đó vẽ ra cái gì.
//    File này đóng vòng lặp đó lại: dựng bàn thật, chụp ảnh thật, xem được ngay.
//
//  KHÔNG CÀI GÌ HẾT. Dùng Chrome đã có sẵn trong máy + WebSocket có sẵn của Node 22+,
//  nói chuyện thẳng bằng giao thức CDP. Không thêm node_modules, không đụng package.json.
//
//  Chạy:
//     node TienLen/kiemtra/chup.js                     # đủ 4 khổ màn, mọi cảnh
//     node TienLen/kiemtra/chup.js --khung pc          # chỉ một khổ
//     node TienLen/kiemtra/chup.js --chedo anhet --cuoc 1000
//     node TienLen/kiemtra/chup.js --thu D:/anh        # đổi chỗ để ảnh
//
//  Ảnh ra: TienLen/kiemtra/anh/<khổ>-<cảnh>.png  (thư mục này KHÔNG commit)
// ============================================================================
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const lay = (ten, mm) => { const i = args.indexOf('--' + ten); return i >= 0 && args[i + 1] ? args[i + 1] : mm; };
const CONG = Number(lay('cong', 4177));
const CHE_DO = lay('chedo', 'hang');
const MUC_CUOC = Number(lay('cuoc', CHE_DO === 'anhet' ? 1000 : 10000));
const THU = lay('thu', path.join(__dirname, 'anh'));
const CHI_KHUNG = lay('khung', '');
const CONG_CDP = Number(lay('cdp', 9333));

// Chrome ở đâu. Tìm lần lượt, ai có trước dùng người đó.
const CHO_CHROME = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

// 📐 CÁC KHỔ MÀN CẦN SOI. Đây đúng là mấy chỗ hay vỡ nhất:
//    · pc        màn chủ server đang dùng (ảnh báo lỗi đều cỡ này)
//    · pcRong    màn rộng, chỗ mà mốc neo lệch nhau lộ ra rõ nhất
//    · dtNgang   điện thoại nằm ngang, khổ chật nhất mà vẫn phải chơi được
//    · dtTo      điện thoại lớn nằm ngang
const KHUNG = {
    pc: { w: 1169, h: 820 },
    pcRong: { w: 1920, h: 1080 },
    dtNgang: { w: 740, h: 360 },
    dtTo: { w: 880, h: 410 },
};

const nghi = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- nói chuyện với Chrome
function moCDP(url) {
    return new Promise((ok, hu) => {
        const ws = new WebSocket(url);
        const cho = new Map();
        let id = 0;
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.id && cho.has(m.id)) {
                const { ok: o, hu: h } = cho.get(m.id); cho.delete(m.id);
                m.error ? h(new Error(m.error.message)) : o(m.result);
            }
        };
        ws.onerror = () => hu(new Error('Không nối được Chrome'));
        ws.onopen = () => ok({
            goi: (pt, p) => new Promise((o, h) => { const k = ++id; cho.set(k, { ok: o, hu: h }); ws.send(JSON.stringify({ id: k, method: pt, params: p || {} })); }),
            dong: () => ws.close(),
        });
    });
}

/** Chạy JS trong trang, trả giá trị. Ném lỗi nếu trong trang nổ. */
async function chay(cdp, ma) {
    const r = await cdp.goi('Runtime.evaluate', { expression: '(function(){' + ma + '})()', awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Lỗi trong trang: ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
}
/** Chờ tới khi biểu thức trong trang trả true (hoặc hết giờ). */
async function cho(cdp, bieuThuc, giay, nhan) {
    for (let i = 0; i < giay * 10; i++) {
        try { if (await chay(cdp, 'return !!(' + bieuThuc + ')')) return true; } catch (e) { }
        await nghi(100);
    }
    console.log('   ⚠️ chờ quá ' + giay + 's: ' + (nhan || bieuThuc));
    return false;
}

async function anh(cdp, ten) {
    const a = await cdp.goi('Page.captureScreenshot', { format: 'png' });
    const p = path.join(THU, ten + '.png');
    fs.writeFileSync(p, Buffer.from(a.data, 'base64'));
    console.log('   📸 ' + ten + '.png  (' + Math.round(fs.statSync(p).size / 1024) + ' KB)');
}

// ---------------------------------------------------------------- chạy
(async () => {
    fs.mkdirSync(THU, { recursive: true });
    for (const f of fs.readdirSync(THU)) if (f.endsWith('.png')) fs.unlinkSync(path.join(THU, f));

    const chrome = CHO_CHROME.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
    if (!chrome) { console.error('❌ Không tìm thấy Chrome. Đặt biến môi trường CHROME_PATH trỏ tới chrome.exe'); process.exit(1); }

    // 1. dựng bàn: vỏ chạy thử + 3 máy đánh đã ngồi sẵn và bấm sẵn sàng
    console.log('🀄 Dựng bàn thử ở cổng ' + CONG + ' (' + CHE_DO + ', cược ' + MUC_CUOC.toLocaleString('vi-VN') + ')...');
    const may = spawn(process.execPath, [path.join(__dirname, '..', 'index.js'),
        '--bot', '3', '--cong', String(CONG), '--chedo', CHE_DO, '--cuoc', String(MUC_CUOC)],
        { stdio: 'ignore' });
    let songChua = false;
    for (let i = 0; i < 60; i++) {
        try { await fetch('http://127.0.0.1:' + CONG + '/?u=A'); songChua = true; break; } catch (e) { }
        await nghi(200);
    }
    if (!songChua) { console.error('❌ Vỏ chạy thử không lên'); may.kill(); process.exit(1); }

    // 2. mở Chrome ẩn
    const hoSo = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-chrome-'));
    const cr = spawn(chrome, ['--headless=new', '--remote-debugging-port=' + CONG_CDP,
        '--user-data-dir=' + hoSo, '--no-first-run', '--no-default-browser-check',
        '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });

    let trang = null;
    for (let i = 0; i < 60; i++) {
        try {
            const ds = await (await fetch('http://127.0.0.1:' + CONG_CDP + '/json/list')).json();
            trang = ds.find(t => t.type === 'page'); if (trang) break;
        } catch (e) { }
        await nghi(250);
    }
    if (!trang) { console.error('❌ Chrome không lên'); cr.kill(); may.kill(); process.exit(1); }
    const cdp = await moCDP(trang.webSocketDebuggerUrl);
    await cdp.goi('Page.enable');
    await cdp.goi('Runtime.enable');

    const ten = CHI_KHUNG ? [CHI_KHUNG] : Object.keys(KHUNG);
    let daNgoi = false;
    for (const k of ten) {
        const kh = KHUNG[k];
        if (!kh) { console.log('⚠️ không có khổ "' + k + '", bỏ qua'); continue; }
        console.log('\n📐 ' + k + '  ' + kh.w + '×' + kh.h);
        await cdp.goi('Emulation.setDeviceMetricsOverride', { width: kh.w, height: kh.h, deviceScaleFactor: 1, mobile: false });

        // ⚠️ CHỈ NGỒI MỘT LẦN, rồi các khổ sau CHỈ ĐỔI CỠ MÀN.
        // Bản đầu mỗi khổ lại tải lại trang rồi ngồi mới, sai: ngồi xong khổ 1 là người A VẪN
        // CÒN NGỒI, tải lại trang không làm nó đứng dậy. Sang khổ 2 gọi /ngoi thì máy chủ chặn
        // ("bàn đang đánh") và chờ mãi không được -> 3 trên 4 khổ chỉ chụp được mỗi màn sảnh.
        if (!daNgoi) {
            await cdp.goi('Page.navigate', { url: 'http://127.0.0.1:' + CONG + '/?u=A' });
            await nghi(900);
            await chay(cdp, 'try{localStorage.removeItem("tienlen_phong")}catch(e){} return 1;');
            await cdp.goi('Page.navigate', { url: 'http://127.0.0.1:' + CONG + '/?u=A' });
            await cho(cdp, 'window.SANH && SANH.phong && SANH.phong.length', 12, 'sảnh hiện ra');
            await nghi(400);
            await anh(cdp, k + '-1-sanh');

            // 3 máy ngồi sẵn + sẵn sàng sẵn => vỏ dev TỰ MỞ BÀN ngay lúc khởi động, trước khi có
            // người vào. Bàn đang đánh thì /ngoi bị chặn; chỉ KHE GIỮA HAI VÁN (~8 giây xem kết
            // quả) mới ngồi được -> phải BẤM LẠI LIÊN TỤC chứ không phải bấm một phát rồi chờ.
            for (let i = 0; i < 80 && !daNgoi; i++) {
                await chay(cdp, 'if (!BUSY) vaoPhong(SANH.phong[0].ma); return 1;');
                await nghi(500);
                daNgoi = await chay(cdp, 'return !!(window.S && S.gheCuaToi >= 0)');
            }
            if (!daNgoi) { await anh(cdp, k + '-2-KHONG-NGOI-DUOC'); continue; }
            await nghi(400);
            // phòng chờ chỉ có thật khi bàn CHƯA mở (chạy với --bot 1 thì thấy màn này)
            if (!await chay(cdp, 'return !!(S && S.ban)')) {
                await anh(cdp, k + '-2-phongcho');
                await chay(cdp, 'sanSang(); return 1;');
            }
        } else {
            await nghi(600);
            await anh(cdp, k + '-1-sanh-BO-QUA-da-ngoi-roi');
        }

        // Chờ VÁN MỚI: chỉ lúc đủ 13 lá thì đo độ chồng mới có nghĩa (13 lá là ca chật nhất),
        // và cũng chỉ lúc đó mới bắt được đèn khoe bài mạnh.
        const coBai = await cho(cdp, 'S && S.ban && S.ban.toi && S.ban.toi.la && S.ban.toi.la.length >= 13', 90, 'ván mới chia đủ 13 lá');
        if (!coBai) { await anh(cdp, k + '-3-KHONG-CHIA-DUOC'); continue; }

        // ✨ chụp NGAY: mấy giây đầu là lúc bài mạnh đang sáng
        await nghi(700);
        await anh(cdp, k + '-3-vuachia-khoebai');

        // chọn vài lá để soi: lá nhô lên có đè nút không, thanh ĐÁNH nằm đâu
        await chay(cdp, 'CHON = (S.ban.toi.la||[]).slice(0,3); $("banTay").__cu=""; ve(); return 1;');
        await nghi(500);
        await anh(cdp, k + '-4-dangchon3la');

        // chờ hết sáng (3,6s) để soi hàng bài lúc bình thường
        await nghi(3500);
        await chay(cdp, 'CHON = []; $("banTay").__cu=""; ve(); return 1;');
        await nghi(400);
        await anh(cdp, k + '-5-hangbai-binhthuong');

        // 📏 đo THẬT bằng trình duyệt, con số này mới là sự thật, không phải phép tính tay
        const do_ = await chay(cdp, `
      var t = $('banTay'), k = t.children, n = k.length;
      if (!n) return null;
      var a = k[0].getBoundingClientRect(), b = n > 1 ? k[1].getBoundingClientRect() : a;
      var nut = $('banNut'), nr = nut ? nut.getBoundingClientRect() : null;
      return { soLa:n, beNgangLa:Math.round(a.width), caoLa:Math.round(a.height),
               loRa: n>1 ? Math.round(b.left - a.left) : Math.round(a.width),
               laDauO: Math.round(a.left), nutHetO: nr ? Math.round(nr.right) : null,
               doiNhau: nr ? (nr.right > a.left) : false,
               tranRa: Math.round(k[n-1].getBoundingClientRect().right) > window.innerWidth };
    `);
        if (do_) {
            console.log('   📏 lá ' + do_.beNgangLa + '×' + do_.caoLa + 'px · lộ ra ' + do_.loRa + 'px · ' + do_.soLa + ' lá');
            console.log('   📏 nút hết ở ' + do_.nutHetO + ', lá đầu ở ' + do_.laDauO +
                (do_.doiNhau ? '  ❌ ĐÈ NHAU' : '  ✅ không đè') + (do_.tranRa ? '  ❌ TAY BÀI TRÀN RA NGOÀI MÀN' : ''));
        }
    }

    cdp.dong(); cr.kill(); may.kill();
    console.log('\n✅ Xong. Ảnh nằm ở: ' + THU);
    process.exit(0);
})().catch(e => { console.error('❌', e.stack || e.message); process.exit(1); });
