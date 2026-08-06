import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bảng liên kết Discord ↔ nhân vật Palworld.
//
// Dashboard là NƠI GIỮ dữ liệu này (một nguồn sự thật duy nhất) vì dashboard mới
// là bên biết SteamID/tên người chơi trong game. Bot Discord đọc/ghi qua API.
//
// Liên kết theo SteamID (userId dạng "steam_7656...") chứ KHÔNG theo tên nhân vật:
// tên trong game đổi được, SteamID thì không. Tên chỉ lưu để admin dễ nhìn.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const linksFile = path.join(dataDir, "links.json");

function readAll() {
  try {
    const raw = fs.readFileSync(linksFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(links) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(linksFile, JSON.stringify(links, null, 2), "utf8");
}

// [{ discordId, discordName, steamId, ingameName, linkedAt }]
export function listLinks() {
  const links = readAll();
  return Object.entries(links)
    .map(([discordId, v]) => ({ discordId, ...v }))
    .sort((a, b) => (b.linkedAt || 0) - (a.linkedAt || 0));
}

export function getLinkByDiscordId(discordId) {
  const links = readAll();
  const found = links[discordId];
  return found ? { discordId, ...found } : null;
}

// Ai đang giữ SteamID này (chặn 2 Discord trỏ cùng 1 nhân vật — sẽ giao sai người).
export function findBySteamId(steamId) {
  return listLinks().find((l) => l.steamId === steamId) || null;
}

export function saveLink({ discordId, discordName, steamId, ingameName }) {
  const links = readAll();
  links[discordId] = {
    discordName: discordName || "",
    steamId,
    ingameName: ingameName || "",
    linkedAt: Date.now(),
  };
  writeAll(links);
  return { discordId, ...links[discordId] };
}

export function deleteLink(discordId) {
  const links = readAll();
  if (!links[discordId]) return false;
  delete links[discordId];
  writeAll(links);
  return true;
}
