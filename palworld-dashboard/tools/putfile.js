// Đẩy MỘT file local lên đường dẫn bất kỳ trên server qua SFTP.
// Khác upload.js (chỉ chuyên main.lua của mod GiveGoldCommand) — cái này dùng chung,
// cần cho việc đưa file JSON của PalSchema lên.
//
//   node putfile.js <file-local> "<duong-dan-tren-server>"
//
// Ví dụ:
//   node putfile.js ../server-backups/PalSchema_config.json.goc \
//     "/1. MOD PALWORLD TEST/Pal/Binaries/Win64/ue4ss/Mods/PalSchema/config/config.json"
import { readFileSync } from "node:fs";
import { Client } from "ssh2";
import { sftpConfig } from "./config.js";

const [localPath, remotePath] = process.argv.slice(2);
if (!localPath || !remotePath) {
  console.error('Thieu tham so. Vi du:\n  node putfile.js file.json "/1. MOD PALWORLD TEST/.../config.json"');
  process.exit(1);
}

let content;
try {
  content = readFileSync(localPath);
} catch (e) {
  console.error("Khong doc duoc file local:", e.message);
  process.exit(1);
}

const conn = new Client();

// Tạo từng cấp thư mục nếu chưa có (SFTP không tự tạo cha).
function ensureDirs(sftp, remoteFilePath) {
  const parts = remoteFilePath.split("/").filter(Boolean);
  parts.pop(); // bỏ tên file
  let cur = "";
  return parts.reduce(
    (chain, seg) =>
      chain.then(() => {
        cur += "/" + seg;
        const dir = cur;
        return new Promise((resolve) => sftp.mkdir(dir, () => resolve())); // đã tồn tại thì bỏ qua
      }),
    Promise.resolve()
  );
}

function writeText(sftp, remote, data) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remote);
    stream.on("error", reject);
    stream.on("close", resolve);
    stream.end(data);
  });
}

function readBack(sftp, remote) {
  return new Promise((resolve) => {
    const chunks = [];
    const stream = sftp.createReadStream(remote);
    stream.on("data", (d) => chunks.push(d));
    stream.on("error", () => resolve(null));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;
    try {
      await ensureDirs(sftp, remotePath);
      await writeText(sftp, remotePath, content);
      console.log(`Da ghi ${content.length} bytes -> ${remotePath}`);

      // Đọc lại để chắc chắn ghi thành công (SFTP đôi khi báo OK mà không ghi).
      const back = await readBack(sftp, remotePath);
      if (back === null) console.log("CANH BAO: doc lai khong duoc, chua chac da ghi.");
      else if (back === content.toString("utf8")) console.log("Da doc lai va khop noi dung. OK.");
      else console.log("CANH BAO: noi dung doc lai KHAC voi file goc!");
    } catch (e) {
      console.error("LOI:", e.message);
    }
    conn.end();
  });
});

conn.on("error", (e) => console.error("CONN ERROR:", e.message));
conn.connect(sftpConfig);
