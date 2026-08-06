// Cầu nối tới Palworld Admin Dashboard (project palworld-dashboard).
//
// Bot KHÔNG nói trực tiếp với server Palworld. Mọi việc đi qua dashboard vì
// dashboard đã lo sẵn: kết nối SFTP tới Shockbyte, xếp hàng lệnh tuần tự
// (chống mất lệnh khi nhiều nơi ghi cùng lúc), và so khớp tên người chơi.
//
// YÊU CẦU: dashboard chạy CÙNG máy với bot. Dashboard mặc định chỉ nghe
// 127.0.0.1 nên không ai từ internet gọi được — đừng đổi thành 0.0.0.0.
const DASHBOARD_URL = (process.env.PAL_DASHBOARD_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const DASHBOARD_PASSWORD = process.env.PAL_DASHBOARD_PASSWORD || '';

// Tặng item phải chờ mod trong game polling queue.txt (2s/lần) rồi trả kết quả
// qua SFTP — thực tế mất khoảng 5-20 giây, nên timeout phải rộng.
const GIVE_TIMEOUT_MS = 90000;
const READ_TIMEOUT_MS = 15000;

function authHeader() {
    return 'Basic ' + Buffer.from('admin:' + DASHBOARD_PASSWORD).toString('base64');
}

async function call(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || GIVE_TIMEOUT_MS);
    try {
        const res = await fetch(DASHBOARD_URL + path, {
            method: options.method || 'GET',
            body: options.body,
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = { raw: text };
        }
        if (!res.ok) {
            throw new Error((data && data.error) || `Dashboard trả về lỗi ${res.status}`);
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

// Tên người chơi lấy từ engine game hay dính ký tự ẩn (đã thấy cả ở đầu và cuối,
// ví dụ "bbb 1᲼"). Bỏ hết ký tự không phải ASCII in được để so khớp/hiển thị.
function cleanName(name) {
    return String(name == null ? '' : name).replace(/[^\x20-\x7E]/g, '').trim();
}

// [{ name, cleanName, userId (steam_...), level }]
async function getOnlinePlayers() {
    const data = await call('/api/players', { timeoutMs: READ_TIMEOUT_MS });
    const list = (data && data.players) || [];
    return list.map((p) => ({
        name: p.name,
        cleanName: cleanName(p.name),
        userId: p.userId,
        level: p.level,
    }));
}

// Tìm người chơi đang online theo SteamID đã liên kết. Trả null nếu họ offline.
// Dùng SteamID (không phải tên) vì tên trong game đổi được, SteamID thì không.
async function findOnlineBySteamId(steamId) {
    const players = await getOnlinePlayers();
    return players.find((p) => p.userId === steamId) || null;
}

// Trả { ok, message }. ok=true nghĩa là mod TRONG GAME xác nhận đã đưa item.
// Lưu ý: ok=false có thể là "người chơi offline", "chưa nhận được phản hồi
// (timeout)" — KHÔNG được coi là chắc chắn thất bại, xem ghi chú ở deliverWithdraw.
async function giveItem(playerName, itemId, quantity) {
    const data = await call('/api/give-item', {
        method: 'POST',
        body: JSON.stringify({ playerNames: [playerName], itemId, quantity }),
    });
    const first = data && Array.isArray(data.results) ? data.results[0] : null;
    return {
        ok: !!(data && data.ok),
        message: (first && first.message) || (data && data.message) || 'Không rõ kết quả',
    };
}

// ===== Liên kết Discord ↔ nhân vật (dashboard giữ dữ liệu) =====
// Cố tình KHÔNG lưu bản sao trong database.json của bot: hai nơi cùng giữ sẽ lệch nhau.

// Trả { steamId, ingameName, ... } hoặc null nếu chưa liên kết.
async function getLink(discordId) {
    const data = await call(`/api/links/${encodeURIComponent(discordId)}`, { timeoutMs: READ_TIMEOUT_MS });
    return (data && data.link) || null;
}

// ingameName: tên nhân vật ĐANG ONLINE (dashboard tự tra ra SteamID), hoặc
// truyền steamId trực tiếp nếu đã biết.
async function saveLink({ discordId, discordName, ingameName, steamId }) {
    const data = await call('/api/links', {
        method: 'POST',
        body: JSON.stringify({ discordId, discordName, ingameName, steamId }),
        timeoutMs: READ_TIMEOUT_MS,
    });
    return (data && data.link) || null;
}

module.exports = {
    getOnlinePlayers,
    findOnlineBySteamId,
    giveItem,
    getLink,
    saveLink,
    cleanName,
    DASHBOARD_URL,
};
