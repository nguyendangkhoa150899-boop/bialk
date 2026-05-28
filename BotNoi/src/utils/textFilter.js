function filterText(text) {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { filterText };
