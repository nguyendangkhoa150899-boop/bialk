const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '../../tts-cache.json');

// Load cache vào memory khi khởi động
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`[TTS Cache] Đã load ${Object.keys(cache).length} mục`);
  } catch { cache = {}; }
}

function saveCache() {
  fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), () => {});
}

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const vbeeClient = axios.create({
  baseURL: 'https://api.vbee.vn',
  httpsAgent,
  headers: {
    Authorization: `Bearer ${process.env.VBEE_API_KEY}`,
    'App-Id': process.env.VBEE_APP_ID,
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
});

const vbeePollClient = axios.create({
  baseURL: 'https://vbee.vn',
  httpsAgent,
  headers: {
    Authorization: `Bearer ${process.env.VBEE_API_KEY}`,
    'App-Id': process.env.VBEE_APP_ID,
  },
  timeout: 10_000,
});

function getCacheKey(text, voiceCode) {
  return crypto.createHash('md5').update(`${voiceCode}:${text}`).digest('hex');
}

function base64ToStream(b64) {
  const { Readable } = require('stream');
  const buf = Buffer.from(b64, 'base64');
  const stream = new Readable();
  stream.push(buf);
  stream.push(null);
  return stream;
}

async function ttsRequest(text) {
  const voiceCode = process.env.TTS_VOICE || 'hue_male_duyphuong_full_48k-fhg';
  const key = getCacheKey(text, voiceCode);

  if (cache[key]) {
    console.log(`[TTS] Cache hit: "${text}"`);
    return base64ToStream(cache[key]);
  }

  let res;
  try {
    res = await vbeeClient.post('/v1/tts', {
      text,
      mode: 'async',
      voiceCode,
      outputFormat: 'mp3',
      speed: parseFloat(process.env.TTS_SPEED) || 1,
      webhookUrl: 'http://localhost/ignore',
    });
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 200)
      : err.message;
    throw new Error(`Vbee API lỗi ${err.response?.status}: ${detail}`);
  }

  const { requestId } = res.data;
  const audioLink = await pollForAudio(requestId);

  const audioRes = await axios.get(audioLink, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    httpsAgent,
    headers: { 'Accept-Encoding': 'identity' },
  });

  cache[key] = Buffer.from(audioRes.data).toString('base64');
  saveCache();
  console.log(`[TTS] Đã cache: "${text}" (${Object.keys(cache).length} mục)`);
  return base64ToStream(cache[key]);
}

async function pollForAudio(requestId, maxAttempts = 150) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await vbeePollClient.get(`/api/v1/tts/${requestId}`);
      const result = res.data?.result;
      if (result?.status === 'SUCCESS' && result?.audio_link) return result.audio_link;
      if (result?.status === 'FAILURE') throw new Error('Vbee TTS thất bại');
    } catch (err) {
      if (err.message === 'Vbee TTS thất bại') throw err;
    }
  }
  throw new Error(`Timeout chờ audio từ Vbee (requestId: ${requestId})`);
}

module.exports = { ttsRequest };
