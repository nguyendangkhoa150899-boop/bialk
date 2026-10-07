// 🖼️ 02/10: ICON VẬT PHẨM GAME cho web (vòng quay, rương, admin).
// Chỉ mục data/itemicons.json do repo game tạo: node tools/icon-vat-pham/lam.js <client> <ra>
//   { cell: 64, sets: { <bộ>: [file, w, h, <ô px nếu khác 64>] }, items: { <id>: [<bộ>, <số ô từ 1>] } }
// Tấm ảnh (56 MB, 426 file) nằm NGOÀI git ở ICON_DIR (mặc định /opt/minigame/itemicon), phục vụ thẳng từ đĩa
// (không nạp RAM). Client cắt ô bằng CSS background-position.
const fs = require('fs');
const path = require('path');

const ICON_DIR = process.env.ITEMICON_DIR || path.join(__dirname, '..', 'itemicon');   // /opt/minigame/itemicon
let IDX = { cell: 64, sets: {}, items: {} };
try { IDX = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'itemicons.json'), 'utf8')); } catch { /* không có chỉ mục -> mọi món không hình */ }

// -> { f: file, x, y (px trong tấm), w, h (cỡ tấm) } | null
function icon(id) {
    const it = IDX.items[String(id)];
    if (!it) return null;
    const s = IDX.sets[it[0]];
    if (!s) return null;
    // 07/10: tấm chân dung pet / NPC là ô 48px (5x5) - s[3]. Mọi chỗ vẽ (CSS vqIcon / vqaIc / bảng rơi, SVG ảnh Ghép Ngọc)
    // tính theo ô 64 -> trả tọa độ + cỡ tấm đã QUY ĐỔI về thang ô 64 (nhân 64/ô), khỏi sửa từng chỗ vẽ.
    const cell = s[3] || IDX.cell || 64, k = 64 / cell, cols = Math.max(1, Math.floor(s[1] / cell)), n = it[1] - 1;
    return { f: s[0], x: (n % cols) * cell * k, y: Math.floor(n / cols) * cell * k, w: s[1] * k, h: s[2] * k };
}

// GET /itemicon/<file> - chỉ tên file trong chỉ mục (chặn đi lạc thư mục)
const OK = new Set(Object.values(IDX.sets).map((s) => s[0]));
function serve(req, res, file) {
    file = decodeURIComponent(String(file || ''));
    if (!OK.has(file)) { res.writeHead(404); return res.end(); }
    const p = path.join(ICON_DIR, file);
    fs.stat(p, (err, st) => {
        if (err) { res.writeHead(404); return res.end(); }
        const etag = '"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"';
        if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
        res.writeHead(200, { 'Content-Type': /\.png$/i.test(file) ? 'image/png' : 'image/jpeg', 'Content-Length': st.size,
            'Cache-Control': 'public, max-age=604800', ETag: etag });
        fs.createReadStream(p).pipe(res);
    });
}

module.exports = { icon, serve, ICON_DIR, count: () => Object.keys(IDX.items).length };
