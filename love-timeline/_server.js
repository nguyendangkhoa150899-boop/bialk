/* Server test trên điện thoại — chạy: node _server.js
   Rồi mở trên điện thoại (CÙNG WIFI):  http://<IP-máy>:8080
   Bấm Ctrl+C ở cửa sổ lệnh để tắt. File này có thể xoá trước khi up Drive. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const GOC = __dirname;
const PORT = 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".m4v": "video/x-m4v", ".ogg": "video/ogg",
  ".txt": "text/plain; charset=utf-8", ".json": "application/json"
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(GOC, rel);

  // chặn thoát ra ngoài thư mục
  if (!file.startsWith(GOC)) { res.writeHead(403); return res.end("403"); }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("404: " + rel); }
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    // hỗ trợ tua video (range request)
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (start > end || end >= st.size) end = st.size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
      fs.createReadStream(file).pipe(res);
    }
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log("Server chay o cong " + PORT);
  console.log("May tinh:   http://localhost:" + PORT);
  console.log("Dien thoai (cung WiFi):  http://192.168.1.14:" + PORT);
});
