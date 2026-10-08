// 🐾 08/10: mô hình 3D trân thú trade (Ghép Ngọc) - 8 bản biến dị + bản thường, dựng lại từ client đã giải mã.
// Dữ liệu (~80 MB, 51 trứng) nằm NGOÀI git ở PET3D_DIR (mặc định /opt/minigame/pet3d), giống itemicon:
//   <dir>/index.json = { "<mã trứng>": { ten, so, f: ["m1.bin", ..., "t0.dds", ...] } }
//   <dir>/<mã trứng>/m<k>.bin (k = 1 bản thường, 2.. = biến dị đời 1..) + t<n>.dds (texture)
// Tạo bằng repo game tools/pet3d (xem README: node noi.js && node dungall.js -> ra/pet3d) rồi chép lên. Thiếu thư mục -> trang không hiện nút 3D, không lỗi.
const fs = require('fs'), path = require('path');
const DIR = process.env.PET3D_DIR || path.join(__dirname, '..', 'pet3d');   // /opt/minigame/pet3d
let IDX = {}, RAW = Buffer.from('{}');
try { RAW = fs.readFileSync(path.join(DIR, 'index.json')); IDX = JSON.parse(RAW.toString('utf8')); } catch { /* chưa chép dữ liệu */ }
const OK = new Set(); for (const [id, x] of Object.entries(IDX)) for (const f of x.f || []) OK.add(id + '/' + f);

// GET /pet3d/index.json | /pet3d/<mã trứng>/<file> - chỉ file có trong chỉ mục
function serve(req, res, rest) {
    rest = String(rest || '');
    if (rest === 'index.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
        return res.end(RAW);
    }
    if (!OK.has(rest)) { res.writeHead(404); return res.end(); }
    const p = path.join(DIR, rest);
    fs.stat(p, (err, st) => {
        if (err) { res.writeHead(404); return res.end(); }
        const etag = '"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"';
        if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
        res.writeHead(200, { 'Content-Type': /\.json$/.test(rest) ? 'application/json; charset=utf-8' : 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'public, max-age=604800', ETag: etag });
        fs.createReadStream(p).pipe(res);
    });
}

module.exports = { serve, DIR, count: () => Object.keys(IDX).length };
