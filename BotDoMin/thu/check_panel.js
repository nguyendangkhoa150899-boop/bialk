// Kiem client JS trong template literal HTML cua panel.js: EVAL template that (moi ${...} -> ""), roi new Function moi <script>.
// node check_panel.js [duong dan file | HEAD]
const fs = require('fs'), vm = require('vm');
const arg = process.argv[2] || require('path').join(__dirname, '..', 'panel.js');
const src = arg === 'HEAD'
    ? require('child_process').execSync('git show HEAD:BotDoMin/panel.js', { cwd: require('path').join(__dirname, '..', '..'), maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
    : fs.readFileSync(arg, 'utf8');
const m = src.match(/const HTML\s*=\s*(`[\s\S]*?`);\s*\r?\n/);
if (!m) throw new Error('khong thay const HTML');
// moi ten bien khong biet -> ham/tra ve "" (de ${a}, ${a.b}, ${a(b)} deu ra chuoi rong)
const anyFn = new Proxy(function () { return ''; }, { get: () => anyFn, apply: () => '' });
const sandbox = new Proxy({}, { has: () => true, get: (o, k) => (k === Symbol.unscopables ? undefined : anyFn) });
const html = vm.runInNewContext(m[1], vm.createContext(sandbox));
console.log(arg === 'HEAD' ? 'HEAD' : 'MOI ', ': HTML', (html.length / 1024).toFixed(0), 'KB');
let n = 0;
for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new Function(s[1]); n++; } catch (e) {
        const lines = s[1].split('\n'); let bad = '';
        for (let i = 1; i <= lines.length; i++) { try { new Function(lines.slice(0, i).join('\n')); } catch (x) { if (i === lines.length || /Unexpected end|missing/.test(x.message) === false) { bad = i + ': ' + lines[i - 1].slice(0, 160); } } }
        console.log('LOI script #' + n + ':', e.message, '| gan dong', bad); process.exit(1);
    }
}
console.log('client JS OK:', n, 'script');
