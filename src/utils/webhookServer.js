const http = require('http');

// requestId -> { resolve, reject, timer }
const pending = new Map();

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/tts-callback') {
    res.writeHead(404).end();
    return;
  }

  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    res.writeHead(200).end('OK');
    console.log(`[Webhook] Nhận callback: ${raw.slice(0, 200)}`);
    try {
      const payload = JSON.parse(raw);
      const id = payload.requestId ?? payload.request_id;
      const link = payload.audioLink ?? payload.audio_link;
      console.log(`[Webhook] requestId=${id} status=${payload.status} link=${link}`);
      const entry = pending.get(id);
      if (!entry) { console.log('[Webhook] Không tìm thấy pending entry!'); return; }

      clearTimeout(entry.timer);
      pending.delete(id);

      if (payload.status === 'SUCCESS' && link) {
        entry.resolve(link);
      } else {
        entry.reject(new Error(`Vbee TTS thất bại: ${payload.status}`));
      }
    } catch {
      // bỏ qua payload lỗi
    }
  });
});

function startWebhookServer() {
  const port = process.env.WEBHOOK_PORT || 3000;
  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) return reject(err);
      console.log(`[Webhook] Đang lắng nghe port ${port}`);
      resolve();
    });
  });
}

function waitForAudioLink(requestId, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timeout chờ audio từ Vbee (requestId: ${requestId})`));
    }, timeoutMs);

    pending.set(requestId, { resolve, reject, timer });
  });
}

module.exports = { startWebhookServer, waitForAudioLink };
