const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

const NGROK_BIN = 'C:\\Users\\nguye\\AppData\\Local\\ngrok\\ngrok.exe';
const STATIC_DOMAIN = 'uselessly-emu-laptop.ngrok-free.dev';

async function startNgrok(port) {
  // Nếu ngrok đang chạy rồi thì dùng luôn
  try {
    const res = await axios.get('http://localhost:4040/api/tunnels', { timeout: 1000 });
    const tunnel = res.data.tunnels.find(t => t.proto === 'https');
    if (tunnel) {
      console.log(`[Ngrok] Đang dùng tunnel hiện có: ${tunnel.public_url}`);
      return tunnel.public_url;
    }
  } catch {}

  // Khởi động ngrok mới với static domain
  console.log('[Ngrok] Đang khởi động...');
  const proc = spawn(NGROK_BIN, ['http', `--domain=${STATIC_DOMAIN}`, port.toString()], {
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();

  // Chờ ngrok sẵn sàng
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await axios.get('http://localhost:4040/api/tunnels', { timeout: 1000 });
      const tunnel = res.data.tunnels.find(t => t.proto === 'https');
      if (tunnel) {
        console.log(`[Ngrok] Tunnel: ${tunnel.public_url}`);
        return tunnel.public_url;
      }
    } catch {}
  }

  throw new Error('Ngrok không khởi động được sau 10 giây');
}

module.exports = { startNgrok };
