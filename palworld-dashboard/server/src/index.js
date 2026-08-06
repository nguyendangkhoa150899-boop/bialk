import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { palworld, PalworldApiError } from "./palworldClient.js";
import { dashboardAuth } from "./dashboardAuth.js";
import { giveItem, countItem, countItemAll, takeItem } from "./sftpBridge.js";
import { recordGive, readHistory } from "./history.js";
import { listLinks, getLinkByDiscordId, findBySteamId, saveLink, deleteLink } from "./links.js";
import { intInRange, nonEmptyString, ValidationError } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

const app = express();
app.use(express.json());
app.use(dashboardAuth);
app.use(express.static(publicDir));

function handle(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof PalworldApiError) {
        res.status(err.status || 502).json({ error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ error: "Dashboard server error" });
      }
    }
  };
}

app.get("/api/info", handle(() => palworld.getInfo()));
app.get("/api/players", handle(() => palworld.getPlayers()));
app.get("/api/settings", handle(() => palworld.getSettings()));
app.get("/api/metrics", handle(() => palworld.getMetrics()));

app.post(
  "/api/announce",
  handle((req) => palworld.announce(nonEmptyString(req.body.message, "Nội dung thông báo")))
);
app.post(
  "/api/kick",
  handle((req) => palworld.kick(nonEmptyString(req.body.userid, "UserID"), req.body.message))
);
app.post(
  "/api/ban",
  handle((req) => palworld.ban(nonEmptyString(req.body.userid, "UserID"), req.body.message))
);
app.post(
  "/api/unban",
  handle((req) => palworld.unban(nonEmptyString(req.body.userid, "UserID")))
);
app.post("/api/save", handle(() => palworld.save()));
app.post(
  "/api/shutdown",
  handle((req) =>
    palworld.shutdown(intInRange(req.body.waittime, { min: 0, max: 3600, label: "Thời gian đợi" }), req.body.message)
  )
);

// Nhận `playerNames` (mảng) hoặc `playerName` (chuỗi, giữ tương thích cũ) → mảng tên đã validate.
function validatePlayerNames(body) {
  const raw = body.playerNames !== undefined ? body.playerNames : body.playerName;
  const list = (Array.isArray(raw) ? raw : [raw]).map((p) => nonEmptyString(p, "Tên người chơi"));
  if (list.length === 0) throw new ValidationError("Phải chọn ít nhất 1 người chơi");
  if (list.length > 20) throw new ValidationError("Tối đa 20 người chơi mỗi lần");
  return [...new Set(list)];
}

// Gom kết quả từng player thành phản hồi chung + ghi lịch sử.
function finishGive(action, detail, results) {
  recordGive({ action, detail, results });
  return {
    ok: results.every((r) => r.ok),
    results,
    message: results.map((r) => r.message).join("\n"),
  };
}

app.post(
  "/api/give-item",
  handle(async (req) => {
    const playerNames = validatePlayerNames(req.body);
    const itemId = nonEmptyString(req.body.itemId, "Item ID");
    const quantity = intInRange(req.body.quantity, { min: 1, label: "Số lượng" });

    const results = await giveItem(playerNames, itemId, quantity);
    return finishGive("item", { itemId, quantity }, results);
  })
);


// ===== Đọc / trừ item trong game (cho luồng nạp: game -> Discord) =====
// Đếm số dư trong game — chỉ đọc, an toàn.
app.get(
  "/api/item-count",
  handle(async (req) => {
    const playerName = nonEmptyString(req.query.playerName, "Tên người chơi");
    const itemId = nonEmptyString(req.query.itemId, "Item ID");
    return await countItem(playerName, itemId);
  })
);

// Đếm cho tất cả người đang online trong 1 lượt — dùng cho bảng số dư tự cập nhật.
app.get(
  "/api/item-count-all",
  handle(async (req) => {
    const itemId = nonEmptyString(req.query.itemId, "Item ID");
    return { counts: await countItemAll(itemId) };
  })
);

// TRỪ item trong túi người chơi. Bên gọi phải kiểm tra `took` đúng bằng số yêu cầu
// trước khi cộng tiền ở hệ thống ngoài — chỉ tin cờ ok là chưa đủ.
app.post(
  "/api/take-item",
  handle(async (req) => {
    const playerName = nonEmptyString(req.body.playerName, "Tên người chơi");
    const itemId = nonEmptyString(req.body.itemId, "Item ID");
    if (!/^[A-Za-z0-9_]+$/.test(itemId)) {
      throw new ValidationError("Item ID chỉ cho phép chữ, số, gạch dưới");
    }
    const quantity = intInRange(req.body.quantity, { min: 1, max: 100000, label: "Số lượng" });

    const result = await takeItem(playerName, itemId, quantity);
    recordGive({
      action: "take",
      detail: { itemId, quantity, before: result.before, after: result.after },
      results: [{ player: playerName, ok: result.ok, message: result.message }],
    });
    return result;
  })
);

app.get("/api/history", handle((req) => ({ history: readHistory(Number(req.query.limit) || 100) })));

// ===== Liên kết Discord ↔ nhân vật Palworld =====
// Dùng bởi cả UI dashboard và bot Discord (lệnh /link). Bot đọc endpoint này để
// biết tặng dogcoin cho nhân vật nào khi người chơi rút tiền.
app.get("/api/links", handle(() => ({ links: listLinks() })));

app.get(
  "/api/links/:discordId",
  handle((req) => {
    const link = getLinkByDiscordId(nonEmptyString(req.params.discordId, "Discord ID"));
    return { link };
  })
);

app.post(
  "/api/links",
  handle(async (req) => {
    const discordId = nonEmptyString(req.body.discordId, "Discord ID");
    if (!/^\d{5,25}$/.test(discordId)) {
      throw new ValidationError("Discord ID phải là dãy số (bật Developer Mode để copy ID)");
    }
    const discordName = String(req.body.discordName ?? "").trim().slice(0, 100);

    // Cho phép truyền steamId trực tiếp, HOẶC tên nhân vật đang online (tiện hơn).
    let steamId = String(req.body.steamId ?? "").trim();
    let ingameName = String(req.body.ingameName ?? "").trim();

    if (!steamId) {
      if (!ingameName) throw new ValidationError("Cần steamId hoặc tên nhân vật đang online");
      const { players = [] } = await palworld.getPlayers();
      const norm = (s) => String(s ?? "").replace(/[^\x20-\x7E]/g, "").trim().toLowerCase();
      const matches = players.filter((p) => norm(p.name) === norm(ingameName));
      if (matches.length === 0) {
        throw new ValidationError(
          `Không thấy "${ingameName}" đang online. Người chơi phải vào game để lấy được SteamID.`
        );
      }
      if (matches.length > 1) {
        throw new ValidationError(`Có ${matches.length} người trùng tên "${ingameName}" — dùng steamId để chỉ rõ.`);
      }
      steamId = matches[0].userId;
      ingameName = String(matches[0].name ?? "").replace(/[^\x20-\x7E]/g, "").trim();
    }

    // Chặn 2 Discord trỏ cùng 1 nhân vật: sẽ giao dogcoin cho sai người.
    const taken = findBySteamId(steamId);
    if (taken && taken.discordId !== discordId) {
      throw new ValidationError(`Nhân vật này đã liên kết với Discord ID ${taken.discordId} — hủy liên kết cũ trước.`);
    }

    return { link: saveLink({ discordId, discordName, steamId, ingameName }) };
  })
);

app.delete(
  "/api/links/:discordId",
  handle((req) => ({ ok: deleteLink(nonEmptyString(req.params.discordId, "Discord ID")) }))
);

const port = process.env.PORT || 3000;
// Mặc định CHỈ nghe trên localhost. Quan trọng khi chạy trên VPS: nếu nghe mọi
// interface thì cả internet vào được dashboard, chỉ chặn bằng basic auth — quá rủi ro
// (tặng item vô hạn). Bot Discord chạy cùng máy nên gọi localhost là đủ.
// Muốn truy cập từ xa: dùng SSH tunnel, đừng đổi HOST thành 0.0.0.0.
//   ssh -L 3000:localhost:3000 -p <cong-ssh> root@<ip-vps>
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => console.log(`Palworld dashboard listening on http://${host}:${port}`));
