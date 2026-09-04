// ===== FILE TĨNH: TẤT CẢ NẰM TRONG THƯ MỤC assets/ =====
//
// THÊM ẢNH / ÂM THANH MỚI = THẢ FILE VÀO assets/ RỒI KHỞI ĐỘNG LẠI BOT. Hết. Không
// phải khai biến, không phải sửa router, không phải sửa cả file này — thư mục tự
// được quét. Trong trang web gọi thẳng bằng tên file:
//     <img src="/thang100.png">        fetch("/dry-fart.mp3")
//
// Đọc 1 lần lúc khởi động rồi giữ trong RAM (tổng vài trăm KB, nhẹ hơn nhiều so với
// mỗi lượt tải lại đọc đĩa). Thư mục thiếu hoặc rỗng thì trang VẪN CHẠY — chỗ đó chỉ
// trống ảnh/mất tiếng chứ không vỡ giao diện, không làm sập bot.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'assets');
// Chỉ nhận đúng các đuôi dưới đây. File lạ lọt vào assets/ sẽ bị bỏ qua, không phục vụ.
const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

// { '/dogcoin.png': { buf, type }, '/palimage/T_Anubis_icon_normal.png': {...} }
// 27/08: quét THÊM thư mục con 1 cấp (vd assets/palimage/ chứa 287 icon pal) rồi phục vụ
// theo đường dẫn có tiền tố: <img src="/palimage/T_Anubis_icon_normal.png">. Vẫn "thả
// file vào rồi restart" như cũ — chỉ khác là icon pal gom riêng 1 thư mục cho gọn.
const store = {};
let names = [];
function scanDir(dir, prefix) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (e.isDirectory()) { scanDir(path.join(dir, e.name), prefix + e.name + '/'); continue; }
        const type = MIME[path.extname(e.name).toLowerCase()];
        if (!type) continue;
        const key = '/' + prefix + e.name;
        try { store[key] = { buf: fs.readFileSync(path.join(dir, e.name)), type }; names.push(prefix + e.name); } catch { }
    }
}
scanDir(DIR, '');

// Trả true nếu request này là file tĩnh và đã phục vụ xong; false thì router xử tiếp.
// Tra bằng BẢNG dựng sẵn lúc khởi động, KHÔNG ghép đường dẫn từ chuỗi người dùng gửi
// lên -> không có cửa cho trò ../../ đọc trộm file ngoài thư mục assets.
function serve(req, res, urlPath) {
    if (req.method !== 'GET') return false;
    const f = store[urlPath];
    if (!f) return false;
    res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'public, max-age=604800' });
    res.end(f.buf);
    return true;
}

// 04/09: cho bot THÊM file lúc đang chạy (panel up hình item) — chỗ gọi tự ghi đĩa,
// hàm này chỉ đăng ký vào RAM để phục vụ NGAY không cần restart. Chỉ nhận đuôi trong MIME.
function add(relPath, buf) {
    const type = MIME[path.extname(relPath).toLowerCase()];
    if (!type || !Buffer.isBuffer(buf)) return false;
    const key = '/' + relPath;
    if (!store[key]) names.push(relPath);
    store[key] = { buf, type };
    return true;
}

module.exports = { serve, names, count: names.length, has: (u) => !!store[u], add };
