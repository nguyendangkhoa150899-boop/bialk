import { Client } from "ssh2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sftpConfig, ue4ssModsPath } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultLuaPath = path.join(__dirname, "..", "ue4ss-mod", "GiveGoldCommand", "Scripts", "main.lua");

const conn = new Client();
const base = ue4ssModsPath;

function mkdirp(sftp, dir) {
  return new Promise((resolve) => {
    sftp.mkdir(dir, () => resolve()); // ignore error if exists
  });
}

function writeFile(sftp, remotePath, content) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on("error", reject);
    stream.on("close", resolve);
    stream.end(content);
  });
}

function readTextFile(sftp, remotePath) {
  return new Promise((resolve) => {
    let chunks = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on("data", (d) => chunks.push(d));
    stream.on("error", () => resolve(null));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;

    await mkdirp(sftp, `${base}/GiveGoldCommand`);
    await mkdirp(sftp, `${base}/GiveGoldCommand/Scripts`);

    const luaPath = process.argv[2] || defaultLuaPath;
    const lua = readFileSync(luaPath, "utf8");
    await writeFile(sftp, `${base}/GiveGoldCommand/Scripts/main.lua`, lua);
    console.log("Uploaded main.lua from", luaPath);

    const modsTxt = await readTextFile(sftp, `${base}/mods.txt`);
    console.log("\n--- current mods.txt ---");
    console.log(modsTxt);

    if (modsTxt !== null && !modsTxt.includes("GiveGoldCommand")) {
      const updated = modsTxt.trimEnd() + "\nGiveGoldCommand : 1\n";
      await writeFile(sftp, `${base}/mods.txt`, updated);
      console.log("\n--- updated mods.txt ---");
      console.log(updated);
    } else {
      console.log("\nGiveGoldCommand already present or mods.txt unreadable, not modified.");
    }

    conn.end();
  });
});

conn.on("error", (err) => console.error("CONN ERROR:", err.message));

conn.connect(sftpConfig);
