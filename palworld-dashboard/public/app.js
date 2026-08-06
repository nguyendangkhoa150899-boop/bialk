const serverInfo = document.getElementById("server-info");
const playerRows = document.getElementById("player-rows");
const playerCount = document.getElementById("player-count");
const toast = document.getElementById("toast");

function showToast(message, isError = false) {
  const item = document.createElement("div");
  item.className = "toast-item" + (isError ? " error" : "");
  item.textContent = message;
  toast.appendChild(item);
  setTimeout(() => item.remove(), 4000);
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

async function refreshInfo() {
  try {
    const info = await api("/api/info");
    let extra = "";
    try {
      const m = await api("/api/metrics");
      const parts = [];
      if (m.serverfps !== undefined) parts.push(`${m.serverfps} FPS`);
      if (m.uptime !== undefined) parts.push(`uptime ${formatUptime(m.uptime)}`);
      if (parts.length) extra = " · " + parts.join(" · ");
    } catch {
      // metrics là phụ — server cũ không có endpoint này thì bỏ qua
    }
    serverInfo.textContent = `${info.servername || "Server"} · v${info.version || "?"}${extra}`;
  } catch (err) {
    serverInfo.textContent = "Không kết nối được server";
  }
}

function formatUptime(seconds) {
  const s = Number(seconds) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function refreshPlayers() {
  try {
    const { players = [] } = await api("/api/players");
    playerCount.textContent = players.length;
    playerRows.innerHTML = players
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.userId)}</td>
        <td>${p.level ?? "-"}</td>
        <td>${p.ping ?? "-"}</td>
        <td class="actions-cell">
          <button data-action="kick" data-userid="${escapeHtml(p.userId)}">Kick</button>
          <button data-action="ban" data-userid="${escapeHtml(p.userId)}" class="danger">Ban</button>
        </td>
      </tr>`
      )
      .join("");

    const names = players.map((p) => cleanPlayerName(p.name));
    populatePlayerPicker(document.getElementById("give-item-players"), names);
    populateLinkPlayerSelect(players);
  } catch (err) {
    showToast(err.message, true);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cleanPlayerName(name) {
  return String(name ?? "").replace(/^[^\x20-\x7E]+/, "");
}

// Danh sách checkbox chọn nhiều player; giữ nguyên tick khi refresh 10s.
function populatePlayerPicker(container, names) {
  const checked = new Set(pickedPlayers(container));
  if (names.length === 0) {
    container.innerHTML = `<span class="picker-empty">${escapeHtml(container.dataset.empty || "Trống")}</span>`;
    return;
  }
  container.innerHTML =
    `<label class="picker-all"><input type="checkbox" class="picker-toggle-all" /> Tất cả</label>` +
    names
      .map(
        (name) =>
          `<label><input type="checkbox" value="${escapeHtml(name)}"${checked.has(name) ? " checked" : ""} /> ${escapeHtml(name)}</label>`
      )
      .join("");
  const boxes = () => [...container.querySelectorAll("input[type=checkbox]:not(.picker-toggle-all)")];
  const all = container.querySelector(".picker-toggle-all");
  all.checked = boxes().length > 0 && boxes().every((b) => b.checked);
  // Listener gắn 1 lần trên container (delegation) — picker được render lại mỗi 10s.
  if (!container.dataset.bound) {
    container.dataset.bound = "1";
    container.addEventListener("change", (e) => {
      const allBox = container.querySelector(".picker-toggle-all");
      if (!allBox) return;
      if (e.target.classList.contains("picker-toggle-all")) {
        boxes().forEach((b) => (b.checked = allBox.checked));
      } else {
        allBox.checked = boxes().every((b) => b.checked);
      }
    });
  }
}

function pickedPlayers(container) {
  return [...container.querySelectorAll("input[type=checkbox]:not(.picker-toggle-all):checked")].map((c) => c.value);
}

// Render kết quả từng player (mảng results từ backend) hoặc message chung.
function renderGiveResult(status, result) {
  if (Array.isArray(result.results) && result.results.length > 0) {
    status.innerHTML = result.results
      .map((r) => `<div class="${r.ok ? "ok" : "error"}">${escapeHtml(r.player)}: ${escapeHtml(r.message)}</div>`)
      .join("");
    status.className = "status-line " + (result.ok ? "ok" : "error");
  } else {
    status.textContent = result.message || (result.ok ? "Thành công" : "Thất bại");
    status.className = "status-line " + (result.ok ? "ok" : "error");
  }
}

playerRows.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, userid } = btn.dataset;
  if (!confirm(`${action === "ban" ? "Ban" : "Kick"} player ${userid}?`)) return;
  try {
    await api(`/api/${action}`, { method: "POST", body: JSON.stringify({ userid }) });
    showToast(`Đã ${action} ${userid}`);
    refreshPlayers();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("announce-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("announce-message");
  try {
    await api("/api/announce", { method: "POST", body: JSON.stringify({ message: input.value }) });
    showToast("Đã gửi broadcast");
    input.value = "";
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("btn-save").addEventListener("click", async () => {
  try {
    await api("/api/save", { method: "POST" });
    showToast("Đã lưu world");
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("btn-shutdown").addEventListener("click", () => {
  document.getElementById("shutdown-dialog").showModal();
});

document.getElementById("shutdown-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const waittime = Number(document.getElementById("shutdown-wait").value);
  const message = document.getElementById("shutdown-message").value;
  try {
    await api("/api/shutdown", { method: "POST", body: JSON.stringify({ waittime, message }) });
    showToast("Đã gửi lệnh shutdown");
    document.getElementById("shutdown-dialog").close();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.querySelectorAll(".quick-items button[data-item]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("give-item-id").value = btn.dataset.item;
  });
});

document.getElementById("give-item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const playerNames = pickedPlayers(document.getElementById("give-item-players"));
  const itemId = document.getElementById("give-item-id").value.trim();
  const quantity = document.getElementById("give-item-quantity").value;
  const status = document.getElementById("give-item-status");
  const submitBtn = e.target.querySelector("button[type=submit]");

  if (playerNames.length === 0) {
    status.textContent = "Chọn ít nhất 1 người chơi";
    status.className = "status-line error";
    return;
  }

  status.textContent = `Đang gửi cho ${playerNames.length} người chơi (có thể mất vài giây)...`;
  status.className = "status-line";
  submitBtn.disabled = true;

  try {
    const result = await api("/api/give-item", {
      method: "POST",
      body: JSON.stringify({ playerNames, itemId, quantity }),
    });
    renderGiveResult(status, result);
    refreshHistory();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status-line error";
  } finally {
    submitBtn.disabled = false;
  }
});

// ===== Lịch sử tặng quà =====
// Vẫn hiển thị được entry loại "pal" từ lịch sử cũ (tính năng give-pal đã bỏ).
function describeGive(entry) {
  const d = entry.detail || {};
  if (entry.action === "item") return `${d.itemId} x${d.quantity}`;
  return [d.speciesId, d.level ? `Lv${d.level}` : null].filter(Boolean).join(" ");
}

async function refreshHistory() {
  try {
    const { history = [] } = await api("/api/history?limit=50");
    document.getElementById("history-rows").innerHTML = history
      .map((entry) => {
        const results = entry.results || [];
        const players = results.map((r) => escapeHtml(r.player)).join(", ");
        const allOk = results.length > 0 && results.every((r) => r.ok);
        const summary =
          results.length === 0
            ? "?"
            : allOk
            ? "✅ OK"
            : "❌ " + escapeHtml(results.filter((r) => !r.ok).map((r) => r.message).join(" | "));
        return `
      <tr>
        <td>${escapeHtml(new Date(entry.time).toLocaleString("vi-VN"))}</td>
        <td>${entry.action === "item" ? "Item" : "Pal"}</td>
        <td>${players}</td>
        <td>${escapeHtml(describeGive(entry))}</td>
        <td>${summary}</td>
      </tr>`;
      })
      .join("");
  } catch (err) {
    showToast("Không tải được lịch sử: " + err.message, true);
  }
}

document.getElementById("btn-history-refresh").addEventListener("click", refreshHistory);

// ===== Liên kết Discord ↔ Palworld =====
// Dashboard giữ dữ liệu liên kết (server/data/links.json); bot Discord đọc qua API.
function populateLinkPlayerSelect(players) {
  const select = document.getElementById("link-player");
  if (!select) return;
  const current = select.value;
  if (players.length === 0) {
    select.innerHTML = '<option value="">-- Chưa có ai online --</option>';
    return;
  }
  select.innerHTML = players
    .map((p) => {
      const name = cleanPlayerName(p.name);
      return `<option value="${escapeHtml(p.userId)}" data-name="${escapeHtml(name)}">${escapeHtml(name)} — ${escapeHtml(p.userId)}</option>`;
    })
    .join("");
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

async function refreshLinks() {
  try {
    const { links = [] } = await api("/api/links");
    document.getElementById("link-rows").innerHTML = links.length
      ? links
          .map(
            (l) => `
      <tr>
        <td>${escapeHtml(l.discordName || "")}<br /><span class="muted-small">${escapeHtml(l.discordId)}</span></td>
        <td>${escapeHtml(l.ingameName || "?")}</td>
        <td><span class="muted-small">${escapeHtml(l.steamId)}</span></td>
        <td>${escapeHtml(l.linkedAt ? new Date(l.linkedAt).toLocaleString("vi-VN") : "-")}</td>
        <td class="actions-cell">
          <button class="danger" data-unlink="${escapeHtml(l.discordId)}">Hủy</button>
        </td>
      </tr>`
          )
          .join("")
      : '<tr><td colspan="5" class="muted-small">Chưa có liên kết nào</td></tr>';
  } catch (err) {
    showToast("Không tải được liên kết: " + err.message, true);
  }
}

document.getElementById("btn-links-refresh").addEventListener("click", refreshLinks);

document.getElementById("link-rows").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-unlink]");
  if (!btn) return;
  const discordId = btn.dataset.unlink;
  if (!confirm(`Hủy liên kết của Discord ID ${discordId}?`)) return;
  try {
    await api(`/api/links/${encodeURIComponent(discordId)}`, { method: "DELETE" });
    showToast("Đã hủy liên kết");
    refreshLinks();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("link-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const discordId = document.getElementById("link-discord-id").value.trim();
  const discordName = document.getElementById("link-discord-name").value.trim();
  const select = document.getElementById("link-player");
  const steamId = select.value;
  const ingameName = select.selectedOptions[0]?.dataset.name || "";
  const status = document.getElementById("link-status");

  if (!steamId) {
    status.textContent = "Người chơi phải đang online mới lấy được SteamID";
    status.className = "status-line error";
    return;
  }

  try {
    const { link } = await api("/api/links", {
      method: "POST",
      body: JSON.stringify({ discordId, discordName, steamId, ingameName }),
    });
    status.textContent = `Đã liên kết ${link.ingameName || link.steamId} với Discord ID ${link.discordId}`;
    status.className = "status-line ok";
    document.getElementById("link-discord-id").value = "";
    document.getElementById("link-discord-name").value = "";
    refreshLinks();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status-line error";
  }
});

// ===== Unban =====
document.getElementById("unban-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("unban-userid");
  try {
    await api("/api/unban", { method: "POST", body: JSON.stringify({ userid: input.value.trim() }) });
    showToast(`Đã unban ${input.value.trim()}`);
    input.value = "";
  } catch (err) {
    showToast(err.message, true);
  }
});

refreshInfo();
refreshPlayers();
refreshHistory();
refreshLinks();
setInterval(refreshPlayers, 10000);
setInterval(refreshInfo, 30000);
