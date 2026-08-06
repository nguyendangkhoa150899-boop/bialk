import { Client } from "ssh2";
import { sftpConfig } from "./config.js";

const conn = new Client();
const targets = process.argv.slice(2);

function listOne(sftp, dir) {
  return new Promise((resolve) => {
    sftp.readdir(dir, (err, list) => {
      console.log(`\n=== ${dir} ===`);
      if (err) {
        console.log("ERROR:", err.message);
      } else {
        for (const item of list) {
          const isDir = (item.attrs.mode & 0o170000) === 0o040000;
          console.log(`${isDir ? "DIR " : "FILE"}  ${item.filename}`);
        }
      }
      resolve();
    });
  });
}

conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const dir of targets) {
      await listOne(sftp, dir);
    }
    conn.end();
  });
});

conn.on("error", (err) => {
  console.error("CONN ERROR:", err.message);
});

conn.connect(sftpConfig);
