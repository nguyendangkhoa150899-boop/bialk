const { enqueue } = require('./voiceHandler');
const { filterText } = require('../utils/textFilter');

const PREFIX = '!';
const MAX_CHARS = 250;
const COOLDOWN_MS = 10_000;
const cooldowns = new Map();

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const raw = message.content.slice(PREFIX.length).trim();

  // Lệnh TTS: .nội dung cần đọc
  const text = filterText(raw);
  if (!text) return;

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    await message.reply('Bạn cần vào Voice Channel trước nhé! 🎙️');
    return;
  }

  const userId = message.author.id;
  const now = Date.now();
  const lastUsed = cooldowns.get(userId) ?? 0;

  if (now - lastUsed < COOLDOWN_MS) {
    await message.react('⏱️').catch(() => {});
    return;
  }

  if (text.length > MAX_CHARS) {
    await message.reply(`Quá dài rồi! Tối đa ${MAX_CHARS} ký tự, tin nhắn của bạn đang có ${text.length} ký tự.`);
    return;
  }

  cooldowns.set(userId, now);

  if (cooldowns.size > 5000) {
    const cutoff = now - COOLDOWN_MS;
    for (const [id, ts] of cooldowns) {
      if (ts < cutoff) cooldowns.delete(id);
    }
  }

  try {
    await enqueue(voiceChannel, text);
  } catch (err) {
    await message.reply(err.message);
  }
}

module.exports = { handleMessage };
