import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "server", ".env") });

export const sftpConfig = {
  host: process.env.SFTP_HOST,
  port: Number(process.env.SFTP_PORT || 22),
  username: process.env.SFTP_USERNAME,
  password: process.env.SFTP_PASSWORD,
  readyTimeout: 20000,
};

export const modPath = process.env.SFTP_MOD_PATH;
export const ue4ssModsPath = modPath ? modPath.replace(/\/GiveGoldCommand$/, "") : undefined;
