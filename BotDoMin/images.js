// ===== ẢNH: TẤT CẢ NẰM TRONG THƯ MỤC assets/ =====
//
// THÊM ẢNH MỚI = THẢ FILE VÀO assets/ RỒI KHỞI ĐỘNG LẠI BOT. Hết. Không phải khai
// biến, không phải sửa router, không phải sửa cả file này — thư mục tự được quét.
// Trong trang web gọi thẳng bằng tên file, ví dụ: <img src="/thang100.jpg">
//
// Ảnh đọc 1 lần lúc khởi động rồi giữ trong RAM (tổng vài chục KB, nhẹ hơn nhiều so
// với mỗi lượt tải lại đọc đĩa). Thư mục thiếu hoặc rỗng thì trang VẪN CHẠY — chỗ đó
// chỉ trống ảnh chứ không vỡ giao diện, không làm sập bot.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'assets');
// Chỉ nhận đúng các đuôi ảnh. File lạ lọt vào assets/ sẽ bị bỏ qua, không đem phục vụ.
const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// { '/dogcoin.png': { buf, type } }
const store = {};
let names = [];
try {
    for (const file of fs.readdirSync(DIR)) {
        const type = MIME[path.extname(file).toLowerCase()];
        if (!type) continue;
        try { store['/' + file] = { buf: fs.readFileSync(path.join(DIR, file)), type }; names.push(file); } catch { }
    }
} catch { /* chưa có thư mục assets/ — trang vẫn chạy, chỉ không có ảnh */ }

// Trả true nếu request này là ảnh và đã phục vụ xong; false thì router xử tiếp.
// Tra bằng BẢNG dựng sẵn lúc khởi động, KHÔNG ghép đường dẫn từ chuỗi người dùng gửi
// lên -> không có cửa cho trò ../../ đọc trộm file ngoài thư mục ảnh.
function serve(req, res, urlPath) {
    if (req.method !== 'GET') return false;
    const img = store[urlPath];
    if (!img) return false;
    res.writeHead(200, { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=604800' });
    res.end(img.buf);
    return true;
}

module.exports = { serve, names, count: names.length, has: (u) => !!store[u] };
