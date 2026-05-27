require('dotenv').config();
const axios = require('axios');

// Thay URL và format auth theo tài liệu Vbee cung cấp
const API_URL = process.env.VBEE_API_URL;

async function test() {
  console.log('Testing:', API_URL);
  console.log('APP_ID:', process.env.VBEE_APP_ID);
  console.log('TOKEN (first 30 chars):', process.env.VBEE_API_KEY?.slice(0, 30) + '...');
  console.log('---');

  try {
    const res = await axios.post(API_URL, {
      text: 'xin chào',
      mode: 'sync',
      voiceCode: process.env.TTS_VOICE,
      outputFormat: 'mp3',
      speed: 1,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.VBEE_API_KEY}`,
        'App-Id': process.env.VBEE_APP_ID,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    console.log('SUCCESS! Status:', res.status);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Audio size:', res.data.byteLength, 'bytes');
    require('fs').writeFileSync('test-output.mp3', res.data);
    console.log('Saved to test-output.mp3');
  } catch (err) {
    console.log('FAILED! Status:', err.response?.status);
    console.log('Response:', JSON.stringify(err.response?.data, null, 2) || err.message);
  }
}

test();
