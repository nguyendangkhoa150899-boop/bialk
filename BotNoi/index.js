require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleMessage } = require('./src/handlers/messageHandler');
const { handleInteraction } = require('./src/handlers/interactionHandler');
const { handleVoiceStateUpdate } = require('./src/handlers/voiceHandler');

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
client.on('voiceStateUpdate', (oldState, newState) => handleVoiceStateUpdate(oldState, newState));

process.on('unhandledRejection', (err) => {
  console.error('[UnhandledRejection]', err?.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err?.message || err);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[Startup] Lỗi đăng nhập:', err.message);
  process.exit(1);
});
