// Cầu nối giữa BotDoMin và server Palworld (REST API của dedicated server).
// Cần trong .env: PALWORLD_HOST, PALWORLD_REST_PORT, PALWORLD_ADMIN_PASSWORD

function authHeader() {
    const password = process.env.PALWORLD_ADMIN_PASSWORD;
    return `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
}

function baseUrl() {
    return `http://${process.env.PALWORLD_HOST}:${process.env.PALWORLD_REST_PORT}`;
}

// Danh sách người chơi đang online kèm định danh (SteamID, PlayerUID...).
async function getOnlinePlayers() {
    const res = await fetch(`${baseUrl()}/v1/api/players`, {
        headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error(`REST API /players lỗi ${res.status}: ${await res.text()}`);
    return res.json();
}

// Ép server lưu game ngay lập tức (gọi trước khi đọc file .sav để có số liệu mới nhất).
async function forceSave() {
    const res = await fetch(`${baseUrl()}/v1/api/save`, {
        method: 'POST',
        headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error(`REST API /save lỗi ${res.status}: ${await res.text()}`);
    return res.json().catch(() => ({}));
}

module.exports = { getOnlinePlayers, forceSave };
