import { Client } from "ssh2";
import { sftpConfig } from "./config.js";

const conn = new Client();
const files = process.argv.slice(2);

function readOne(sftp, file) {
  return new Promise((resolve) => {
    let chunks = [];
    const stream = sftp.createReadStream(file);
    stream.on("data", (d) => chunks.push(d));
    stream.on("error", (err) => {
      console.log(`\n=== ${file} ===\nERROR: ${err.message}`);
      resolve();
    });
    stream.on("end", () => {
      console.log(`\n=== ${file} ===`);
      console.log(Buffer.concat(chunks).toString("utf8"));
      resolve();
    });
  });
}

conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const f of files) {
      await readOne(sftp, f);
    }
    conn.end();
  });
});

conn.on("error", (err) => console.error("CONN ERROR:", err.message));

conn.connect(sftpConfig);
