const baseUrl = `${process.env.PALWORLD_PROTOCOL || "http"}://${process.env.PALWORLD_HOST}:${process.env.PALWORLD_PORT}`;
const authHeader = "Basic " + Buffer.from(`admin:${process.env.PALWORLD_ADMIN_PASSWORD}`).toString("base64");

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? tryParseJson(text) : null;

  if (!res.ok) {
    const message = data?.message || text || `Palworld API returned ${res.status}`;
    throw new PalworldApiError(message, res.status);
  }

  return data;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class PalworldApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const palworld = {
  getInfo: () => call("GET", "/v1/api/info"),
  getPlayers: () => call("GET", "/v1/api/players"),
  getSettings: () => call("GET", "/v1/api/settings"),
  getMetrics: () => call("GET", "/v1/api/metrics"),
  announce: (message) => call("POST", "/v1/api/announce", { message }),
  kick: (userid, message) => call("POST", "/v1/api/kick", { userid, message }),
  ban: (userid, message) => call("POST", "/v1/api/ban", { userid, message }),
  unban: (userid) => call("POST", "/v1/api/unban", { userid }),
  save: () => call("POST", "/v1/api/save"),
  shutdown: (waittime, message) => call("POST", "/v1/api/shutdown", { waittime, message }),
};
