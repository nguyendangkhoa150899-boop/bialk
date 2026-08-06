import { Client } from "ssh2";
import { sftpConfig, modPath } from "./config.js";

const conn = new Client();
const base = modPath;
const [playerName, itemId, quantity] = process.argv.slice(2);

function readText(sftp, remotePath) {
  return new Promise((resolve) => {
    let chunks = [];
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

async function appendText(sftp, remotePath, text) {
  const existing = (await readText(sftp, remotePath)) || "";
  await writeText(sftp, remotePath, existing + text);
}

conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;

    const before = (await readText(sftp, `${base}/results.log`)) || "";
    console.log("Result log length before:", before.length);

    const kind = process.argv[5] || "ITEM";
    const line = `${kind} ${itemId} ${quantity} ${playerName}`;
    await appendText(sftp, `${base}/queue.txt`, `${line}\n`);
    console.log(`Queued: ${line}`);

    console.log("Waiting 5s for mod to process...");
    await new Promise((r) => setTimeout(r, 5000));

    const after = await readText(sftp, `${base}/results.log`);
    console.log("\n--- new result log content ---");
    console.log(after ? after.slice(before.length) : "(results.log still missing)");

    conn.end();
  });
});

conn.on("error", (err) => console.error("CONN ERROR:", err.message));

conn.connect(sftpConfig);
