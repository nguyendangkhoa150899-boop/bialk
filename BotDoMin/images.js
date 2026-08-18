// ===== GOM TOÀN BỘ FILE ẢNH VỀ MỘT CHỖ =====
//
// Trước đây mỗi ảnh phải: khai một biến readFileSync ở đầu webplay.js + thêm một
// nhánh if trong router. Thêm 3 ảnh là rối tung. Giờ chỉ cần thêm 1 dòng vào bảng
// FILES bên dưới, không phải đụng vào webplay.js nữa.
//
// Ảnh đọc 1 lần lúc khởi động rồi giữ trong RAM (tổng vài chục KB, nhẹ hơn nhiều so
// với việc mỗi lượt tải lại đọc đĩa). THIẾU FILE THÌ TRANG VẪN CHẠY — chỗ đó chỉ
// trống ảnh chứ không vỡ giao diện, không làm sập bot.

const fs = require('fs');
const path = require('path');

// đường dẫn web  ->  tên file trong thư mục này
const FILES = {
    '/dogcoin.png': 'dogcoin.png',              // đồng Dogcoin (tiền tệ, chip cược)
    '/hero.png': 'hero.png',                    // nhân vật leo thang
    '/thang100.jpg': 'thang100.jpg',            // Leo Thang: lên tới đỉnh
    '/ngungdungluc.jpg': 'ngungdungluc.jpg',    // Leo Thang: ngưng đúng lúc, ăn tiền
    '/thua.jpg': 'thua.jpg',                    // Leo Thang: đạp trúng lửa, thua
};

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

// { '/dogcoin.png': { buf, type } } — chỉ chứa ảnh ĐỌC ĐƯỢC
const store = {};
const missing = [];
for (const [url, file] of Object.entries(FILES)) {
    try {
        store[url] = {
            buf: fs.readFileSync(path.join(__dirname, file)),
            type: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        };
    } catch { missing.push(file); }
}

// Trả true nếu request này là ảnh và đã phục vụ xong; false thì router xử tiếp.
function serve(req, res, urlPath) {
    if (req.method !== 'GET') return false;
    const img = store[urlPath];
    if (!img) return false;
    res.writeHead(200, { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=604800' });
    res.end(img.buf);
    return true;
}

module.exports = { serve, missing, has: (u) => !!store[u] };
