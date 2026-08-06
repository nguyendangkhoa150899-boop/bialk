import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Lịch sử tặng quà được ghi bởi chính dashboard (không phụ thuộc mod Lua),
// nên có cả timestamp lẫn kết quả kể cả khi mod timeout.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const historyFile = path.join(dataDir, "history.jsonl");

export function recordGive(entry) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(historyFile, JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch (err) {
    // Lịch sử là tính năng phụ — không được làm hỏng request tặng quà.
    console.error("Không ghi được lịch sử:", err.message);
  }
}

export function readHistory(limit = 100) {
  let raw;
  try {
    raw = fs.readFileSync(historyFile, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}
