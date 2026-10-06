// node BotDoMin/thu/check_page.js [webplay.js] - in "client JS OK" la trang nguoi choi khong loi cu phap.
// Kiem cu phap JS phia client cua webplay.js: lay mang PAGE, eval (khai bao bien thieu = ""), roi new Function moi <script>.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'webplay.js'), 'utf8');
const a = src.indexOf('\nconst PAGE = ['); const b = src.indexOf("\n].join('\\n');", a);
if (a < 0 || b < 0) throw new Error('khong thay PAGE');
const arr = src.slice(a + '\nconst PAGE = '.length, b + 2);
const ctx = {}; let page;
for (let i = 0; i < 50; i++) {
    try { page = vm.runInNewContext('(' + arr + ").join('\\n')", ctx); break; }
    catch (e) { const m = /(\w+) is not defined/.exec(e.message); if (!m) throw e; ctx[m[1]] = ''; }
}
console.log('PAGE', (page.length / 1024).toFixed(0), 'KB; bien gia:', Object.keys(ctx).join(',') || '(khong)');
const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
let n = 0;
for (const s of scripts) { try { new Function(s[1]); n++; } catch (e) { console.log('LOI script #' + n, e.message); const i = /line (\d+)/.exec(e.stack || ''); throw e; } }
console.log('client JS OK:', n, 'script');
for (const id of ['pageVq', 'vqBoard', 'vqRuong', 'navVq']) console.log(id, page.includes('id="' + id + '"') ? 'co' : 'THIEU');
for (const fn of ['function vqSync', 'function vqRender', 'function vqQuay', 'vqSync();', '#vqBoard{', 'navVq']) console.log(fn, page.includes(fn) ? 'co' : 'THIEU');
