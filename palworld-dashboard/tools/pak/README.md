# tools/pak — đồ nghề pak + cài server qua SFTP (09/09/2026, máy văn phòng không có game)

Mọi script đọc SFTP server TEST từ `server/.env`; server PROD nhận creds qua biến môi trường
`PROD_USER` / `PROD_PASS` (KHÔNG hardcode). Hard-block UUID `50533a43` (server không phải của mình).

| File | Việc |
|---|---|
| `sftp_pakget.js` | Đọc `Pal-WindowsServer.pak` (4.9 GB) của server test **theo offset** qua SFTP: dò kích thước (fstat bị chặn), parse footer/index pak V11, `list <regex>` / `get <regex> <outdir>` rút đúng entry cần (ghi block nén + manifest.json) |
| `oodle_unpack.ps1` | Giải các block Oodle theo manifest bằng `oodle-data-shared.dll` (P/Invoke) → cây `Pal/Content/...` cho UAssetCLI. Dll: `Desktop/palworld-analysis/oodle/bin/` (repo WorkingRobot/OodleUE) |
| `prod_paks.js` | Chỉ đọc: thử mở các pak theo TÊN trong `~mods/` prod (readdir Shockbyte chỉ trả 1 entry), tải về, so với repo |
| `prod_recon2.js` | Chỉ đọc: hiện trạng prod (exe, ini, world id, UE4SS/mod, PalDefender, pak) |
| `prod_setup.js` | GHI prod: mod GiveGoldCommand + mods.txt, PalDefender (dll + Config.json lấy từ test), 4 pak, `bAllowClientMod=False` 2 ini; mỗi file ghi xong đọc lại so byte |

Đồ nghề tải nóng (không trong repo, ~45 MB): UAssetCLI v1.0.5 (github jpabscale/UAssetCLI), .NET 10 runtime
portable (`dotnet-install.ps1 -Runtime dotnet -Channel 10.0 -InstallDir <dir>`), repak v0.2.3 (github trumank/repak).
Quy trình vá bảng + pack: `../../pak-mods/README.md` (mục BialkShopOff, RaidTimer v18) và `../../pak-mods/scripts/`.
