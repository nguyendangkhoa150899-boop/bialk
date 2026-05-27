require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleMessage } = require('./src/handlers/messageHandler');
const { handleInteraction } = require('./src/handlers/interactionHandler');
const { handleVoiceStateUpdate } = require('./src/handlers/voiceHandler');
const { startWebhookServer } = require('./src/utils/webhookServer');
const { startNgrok } = require('./src/utils/ngrokManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('clientReady', () => {
  console.log(`[Bot] Sẵn sàng: ${client.user.tag}`);
});

client.on('messageCreate', handleMessage);
client.on('interactionCreate', handleInteraction);
client.on('voiceStateUpdate', (oldState) => handleVoiceStateUpdate(oldState));

process.on('unhandledRejection', (err) => {
  console.error('[UnhandledRejection]', err?.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err?.message || err);
});

(async () => {
  try {
    // Nếu chạy trên VPS đã có WEBHOOK_PUBLIC_URL trong .env thì bỏ qua ngrok
    if (!process.env.WEBHOOK_PUBLIC_URL) {
      const publicUrl = await startNgrok(3000);
      process.env.WEBHOOK_PUBLIC_URL = publicUrl;
    } else {
      console.log(`[Webhook] Dùng URL có sẵn: ${process.env.WEBHOOK_PUBLIC_URL}`);
    }

    await startWebhookServer();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error('[Startup] Lỗi khởi động:', err.message);
    process.exit(1);
  }
})();
