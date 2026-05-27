require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Gọi bot vào Voice Channel của bạn')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Cho bot rời Voice Channel')
    .toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_APP_ID),
      { body: commands }
    );
    console.log('Đã đăng ký /join thành công!');
  } catch (err) {
    console.error('Lỗi đăng ký lệnh:', err.message);
  }
})();
