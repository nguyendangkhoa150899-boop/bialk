const { joinChannel, leaveChannel } = require('./voiceHandler');

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'leave') {
    console.log(`[Leave] User: ${interaction.user.tag}`);
    await interaction.deferReply({ ephemeral: true });
    try {
      leaveChannel(interaction.guildId);
      console.log(`[Leave] Đã rời kênh`);
      await interaction.editReply('✅ Bot đã rời kênh!');
    } catch (err) {
      console.error(`[Leave] Lỗi:`, err.message);
      await interaction.editReply(err.message);
    }
    return;
  }

  if (interaction.commandName === 'join') {
    const voiceChannel = interaction.member?.voice?.channel;
    console.log(`[Join] User: ${interaction.user.tag} | Voice: ${voiceChannel?.name ?? 'KHÔNG Ở KÊNH NÀO'}`);

    if (!voiceChannel) {
      await interaction.reply({ content: 'Bạn cần vào Voice Channel trước rồi dùng `/join` nhé! 🎙️', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await joinChannel(voiceChannel);
      console.log(`[Join] Đã join thành công: ${voiceChannel.name}`);
      await interaction.editReply(`✅ Đã vào **${voiceChannel.name}**!`);
    } catch (err) {
      console.error(`[Join] Lỗi:`, err.message);
      await interaction.editReply(err.message);
    }
  }
}

module.exports = { handleInteraction };
