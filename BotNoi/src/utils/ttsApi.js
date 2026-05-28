const axios = require('axios');
const https = require('https');
const { waitForAudioLink } = require('./webhookServer');

// Tái dùng TCP connection — tránh handshake mới mỗi request
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

async function ttsRequest(text) {
  const voiceCode = process.env.TTS_VOICE || 'hue_male_duyphuong_full_48k-fhg';
  const webhookUrl = `${process.env.WEBHOOK_PUBLIC_URL}/tts-callback`;

  let res;
  try {
    res = await vbeeClient.post('/v1/tts', {
      text,
      mode: 'async',
      voiceCode,
      outputFormat: 'mp3',
      speed: parseFloat(process.env.TTS_SPEED) || 1,
      webhookUrl,
    });
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 200)
      : err.message;
    throw new Error(`Vbee API lỗi ${err.response?.status}: ${detail}`);
  }

  const { requestId } = res.data;
  const audioLink = await waitForAudioLink(requestId);

  // Stream thẳng vào Discord, không tải về máy trước
  const audioRes = await axios.get(audioLink, {
    responseType: 'stream',
    timeout: 20_000,
    httpsAgent,
    headers: { 'Accept-Encoding': 'identity' },
  });

  return audioRes.data;
}

module.exports = { ttsRequest };
