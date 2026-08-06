import { Client } from "ssh2";

const basePath = process.env.SFTP_MOD_PATH;

// Xếp hàng TUẦN TỰ mọi phiên SFTP. Bắt buộc vì queueAndWait làm read-modify-write
// trên queue.txt: hai request chạy song song sẽ đọc cùng nội dung cũ rồi ghi đè nhau
// → MẤT LỆNH. Trước đây chỉ admin bấm tay nên chưa gặp; khi bot Discord tự động
// tặng dogcoin thì hai bên ghi cùng lúc là chuyện bình thường.
let sftpChain = Promise.resolve();

function withSftp(fn) {
  const run = () => withSftpNow(fn);
  // Nối vào chuỗi bất kể lần trước thành công hay lỗi, nhưng vẫn trả lỗi cho caller.
  const result = sftpChain.then(run, run);
  sftpChain = result.catch(() => {});
  return result;
}

function withSftpNow(fn) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        fn(sftp).then(
          (result) => {
            conn.end();
            resolve(result);
          },
          (err) => {
            conn.end();
            reject(err);
          }
        );
      });
    });

    conn.on("error", reject);

    conn.connect({
      host: process.env.SFTP_HOST,
      port: Number(process.env.SFTP_PORT || 22),
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD,
      readyTimeout: 20000,
    });
  });
}

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

// Ghi nhiều dòng lệnh vào queue trong MỘT phiên SFTP rồi đợi kết quả.
// Mod có thể ghi thêm dòng WARN ngoài dòng OK/ERROR, nên điều kiện dừng là:
// mỗi lệnh đã có ít nhất 1 dòng kết quả "chốt" (OK/ERROR/LUA ERROR) hoặc hết lượt thử.
// Trả về mảng các dòng kết quả mới (rỗng nếu timeout hoàn toàn).
function queueAndWait(lines, expectedCount, maxAttempts = 8) {
  return withSftp(async (sftp) => {
    const queuePath = `${basePath}/queue.txt`;
    const resultPath = `${basePath}/results.log`;

    const before = (await readText(sftp, resultPath)) || "";
    const existingQueue = (await readText(sftp, queuePath)) || "";
    await writeText(sftp, queuePath, existingQueue + lines.join("\n") + "\n");

    let newLines = [];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      const after = await readText(sftp, resultPath);
      if (after && after.length > before.length) {
        newLines = after.slice(before.length).split(/\r?\n/).filter(Boolean);
        const finalLines = newLines.filter((l) => !l.startsWith("WARN") && !l.startsWith("DEBUG"));
        if (finalLines.length >= expectedCount) break;
      }
    }
    return newLines;
  });
}

// Mọi dòng kết quả liên quan tới 1 player đều được mod ghi với tiền tố "[player] "
// (xem appendPlayerResult trong main.lua) — so khớp theo tiền tố này, KHÔNG đoán
// theo nội dung câu chữ (một số lỗi như "spawn failed" trước đây không chứa tên
// player trong câu, làm dashboard báo nhầm "timeout" dù mod đã trả lời đúng).
function splitResultsByPlayer(lines, players) {
  return players.map((player) => {
    const prefix = `[${player}] `;
    const mine = lines.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length));
    if (mine.length === 0) {
      return { player, ok: false, message: "Không nhận được phản hồi từ mod trong game (timeout)." };
    }
    return { player, ok: mine.some((l) => l.startsWith("OK")), message: mine.join(" | ") };
  });
}

// playerName nằm CUỐI dòng để chịu được tên có dấu cách (tên hiển thị trong game
// nhiều khi có 2+ từ, vd "Anh Hai") — mod Lua bắt phần còn lại của dòng làm tên.
export async function giveItem(playerNames, itemId, quantity) {
  const lines = playerNames.map((p) => `ITEM ${itemId} ${quantity} ${p}`);
  const result = await queueAndWait(lines, playerNames.length, 6 + 2 * playerNames.length);
  return splitResultsByPlayer(result, playerNames);
}

// Đếm số lượng item người chơi đang có TRONG GAME (chỉ đọc).
// Trả { ok, count, message }.
export async function countItem(playerName, itemId) {
  const result = await queueAndWait([`COUNT ${itemId} ${playerName}`], 1, 6);
  const [r] = splitResultsByPlayer(result, [playerName]);
  const m = r.message && r.message.match(/COUNT\s+\S+=(\d+)/);
  return { ok: r.ok && !!m, count: m ? Number(m[1]) : null, message: r.message };
}

// Đếm item cho TẤT CẢ người đang online trong 1 lượt gửi lệnh.
// Dùng cho bảng số dư tự cập nhật — đếm từng người sẽ mất ~6 giây mỗi người.
// Trả [{ player, count }].
export async function countItemAll(itemId) {
  const lines = await queueAndWait([`COUNTALL ${itemId}`], 1, 8);
  const out = [];
  for (const line of lines) {
    // Mỗi người một dòng: "[tên] OK COUNT DogCoin=53"
    const m = line.match(/^\[(.+?)\]\s+OK COUNT\s+\S+=(\d+)$/);
    if (m) out.push({ player: m[1], count: Number(m[2]) });
  }
  return out;
}

// TRỪ item trong túi người chơi (cho luồng nạp: game -> Discord).
// Mod tự kiểm tra số dư trước, thiếu thì không sửa gì và trả ERROR.
// Trả { ok, before, after, took, message } — bên gọi PHẢI dựa vào `took` để cộng
// Dogcoin, đừng tin mỗi cờ ok, vì lệch số là mất tiền thật.
export async function takeItem(playerName, itemId, quantity) {
  const result = await queueAndWait([`TAKE ${itemId} ${quantity} ${playerName}`], 1, 8);
  const [r] = splitResultsByPlayer(result, [playerName]);
  const m = r.message && r.message.match(/truoc=(\d+)\s+sau=(\d+)/);
  const before = m ? Number(m[1]) : null;
  const after = m ? Number(m[2]) : null;
  const took = before !== null && after !== null ? before - after : null;
  return { ok: r.ok && took === quantity, before, after, took, message: r.message };
}
