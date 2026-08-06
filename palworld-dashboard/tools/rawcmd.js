// Ghi một dòng lệnh THÔ vào queue.txt của mod (không qua dashboard).
// Dùng cho lệnh chẩn đoán như DUMP / DUMPP mà dashboard không có UI.
//
//   node rawcmd.js "DUMP /Script/Pal.PalPlayerState"
//   node rawcmd.js "DUMPP /Script/Pal.PalPlayerState"
import { Client } from "ssh2";
import { sftpConfig, modPath } from "./config.js";

const line = process.argv.slice(2).join(" ");
if (!line) {
  console.error('Thieu lenh. Vi du: node rawcmd.js "DUMP /Script/Pal.PalPlayerState"');
  process.exit(1);
}

const conn = new Client();
const base = modPath;

function readText(sftp, remotePath) {
  return new Promise((resolve) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on("data", (d) => chunks.push(d));
    stream.on("error", () => resolve(null));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function writeText(sftp, remotePath, text) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on("error", reject);
    stream.on("close", resolve);
    stream.end(text);
  });
}

conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;

    const before = (await readText(sftp, `${base}/results.log`)) || "";
    const existing = (await readText(sftp, `${base}/queue.txt`)) || "";
    await writeText(sftp, `${base}/queue.txt`, existing + line + "\n");
    console.log("Da gui:", line);

    console.log("Doi 6s cho mod xu ly...");
    await new Promise((r) => setTimeout(r, 6000));

    const after = await readText(sftp, `${base}/results.log`);
    console.log("--- ket qua moi trong results.log ---");
    console.log(after ? after.slice(before.length).trim() || "(chua co dong moi)" : "(khong doc duoc)");

    conn.end();
  });
});

conn.on("error", (err) => console.error("CONN ERROR:", err.message));
conn.connect(sftpConfig);
