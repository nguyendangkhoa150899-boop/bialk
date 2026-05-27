const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
} = require('@discordjs/voice');
const { ttsRequest } = require('../utils/ttsApi');

// Map<guildId, GuildState>
const guilds = new Map();
const AUTO_DISCONNECT_MS = 30 * 60 * 1000;

function createGuildState(connection, channelId) {
  const player = createAudioPlayer();
  player.on('error', (err) => {
    console.error('[AudioPlayer] Lỗi phát audio:', err.message);
  });
  connection.subscribe(player);
  return { connection, player, channelId, queue: [], isPlaying: false, timer: null };
}

function scheduleDisconnect(guildId) {
  const state = guilds.get(guildId);
  if (!state) return;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => teardown(guildId), AUTO_DISCONNECT_MS);
}

function teardown(guildId) {
  const state = guilds.get(guildId);
  if (!state) return;
  clearTimeout(state.timer);
  try { state.player.stop(true); } catch {}
  try { state.connection.destroy(); } catch {}
  guilds.delete(guildId);
  console.log(`[VoiceHandler] Ngắt kết nối guild ${guildId}`);
}

function setupDisconnectHandler(connection, guildId) {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      teardown(guildId);
    }
  });
}

function getLockedChannelName(guild, state) {
  const ch = guild.channels.cache.get(state.channelId);
  return ch ? `**${ch.name}**` : 'kênh khác';
}

// Lệnh .join — chỉ join, không đọc gì
async function joinChannel(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  const state = guilds.get(guildId);

  if (state && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    if (state.channelId === voiceChannel.id) {
      throw new Error(`Bot đang ở kênh này rồi!`);
    }
    throw new Error(`Bot đang ở ${getLockedChannelName(voiceChannel.guild, state)} rồi, chờ bot rời kênh đó trước nhé!`);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  guilds.set(guildId, createGuildState(connection, voiceChannel.id));
  setupDisconnectHandler(connection, guildId);
  scheduleDisconnect(guildId);
}

// Lệnh . (TTS) — join nếu chưa có, reject nếu bot đang ở kênh khác
async function enqueue(voiceChannel, text) {
  const guildId = voiceChannel.guild.id;
  let state = guilds.get(guildId);

  const isDestroyed = state && state.connection.state.status === VoiceConnectionStatus.Destroyed;

  if (state && !isDestroyed) {
    if (state.channelId !== voiceChannel.id) {
      throw new Error(`Bot đang ở ${getLockedChannelName(voiceChannel.guild, state)} rồi, chờ bot rời kênh đó trước nhé!`);
    }
  } else {
    // Bot chưa ở đâu hoặc connection đã chết — join kênh của người dùng
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });
    state = createGuildState(connection, voiceChannel.id);
    guilds.set(guildId, state);
    setupDisconnectHandler(connection, guildId);
  }

  state.queue.push(text);
  scheduleDisconnect(guildId);

  if (!state.isPlaying) {
    processNext(guildId);
  }
}

async function processNext(guildId) {
  const state = guilds.get(guildId);
  if (!state || state.queue.length === 0) {
    if (state) scheduleDisconnect(guildId);
    return;
  }

  if (state.connection.state.status === VoiceConnectionStatus.Destroyed) {
    guilds.delete(guildId);
    return;
  }

  state.isPlaying = true;
  const text = state.queue.shift();

  try {
    console.log(`[TTS] Gọi Vbee: "${text}"`);
    const stream = await ttsRequest(text);
    console.log(`[TTS] Nhận stream, bắt đầu phát...`);
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
    state.player.play(resource);

    await entersState(state.player, AudioPlayerStatus.Playing, 10_000);
    console.log(`[TTS] Đang phát...`);
    await entersState(state.player, AudioPlayerStatus.Idle, 120_000);
    console.log(`[TTS] Phát xong.`);
  } catch (err) {
    console.error('[TTS] Lỗi:', err.message);
  }

  state.isPlaying = false;
  processNext(guildId);
}

// Gọi từ voiceStateUpdate — tự ngắt khi kênh không còn ai (trừ bot)
function handleVoiceStateUpdate(oldState, newState) {
  const guildId = oldState.guild.id;
  const state = guilds.get(guildId);
  if (!state) return;

  // Chỉ xử lý khi ai đó RỜI kênh của bot
  const leftBotChannel =
    oldState.channelId === state.channelId &&
    newState.channelId !== state.channelId;
  if (!leftBotChannel) return;

  // Đếm số người thật còn trong kênh
  const humanCount = [...newState.guild.voiceStates.cache.values()]
    .filter(vs => vs.channelId === state.channelId && vs.member && !vs.member.user.bot)
    .length;

  if (humanCount === 0) {
    console.log(`[VoiceHandler] Kênh trống, ngắt kết nối guild ${guildId}`);
    teardown(guildId);
  }
}

function leaveChannel(guildId) {
  if (!guilds.has(guildId)) throw new Error('Bot không ở kênh nào cả!');
  teardown(guildId);
}

module.exports = { joinChannel, enqueue, leaveChannel, handleVoiceStateUpdate };
