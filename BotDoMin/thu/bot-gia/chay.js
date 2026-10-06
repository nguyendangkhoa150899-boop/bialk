// Chay thu bot (ban sao) voi discord.js / dotenv / resvg GIA: bot "vao Discord" ngay -> mo web server -> goi thu API.
// node chay.js <thu muc BotDoMin ban sao>
const Module = require('module');
const path = require('path');
const EventEmitter = require('events');
function stub(name) {
  const f = function () {};
  return new Proxy(f, {
    get(t, p) {
      if (p === 'then') return undefined;
      if (p === Symbol.iterator) return function* () {};
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'toString' || p === 'valueOf') return () => '';
      if (p === 'size' || p === 'length') return 0;
      return stub(name + '.' + String(p));
    },
    apply() { return stub(name + '()'); },
    construct() { return stub('new ' + name); },
  });
}
class FakeClient extends EventEmitter {
  constructor() { super(); this.user = { tag: 'BotGia#0000', id: '1', setPresence() {}, setActivity() {} }; this.channels = stub('channels'); this.guilds = stub('guilds'); this.users = stub('users'); this.application = stub('application'); this.ws = { ping: 1 }; }
  login() { setImmediate(() => { this.emit('ready', this); this.emit('clientReady', this); }); return Promise.resolve('ok'); }
  isReady() { return true; }
}
const discord = new Proxy({ Client: FakeClient }, { get(t, p) { return p in t ? t[p] : stub('discord.' + String(p)); } });
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'discord.js') return discord;
  if (req === 'dotenv') return { config() { return {}; } };
  if (req === '@resvg/resvg-js') return { Resvg: stub('Resvg') };
  return orig.apply(this, arguments);
};
process.on('uncaughtException', (e) => { console.log('!!! uncaughtException:', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); });
process.on('unhandledRejection', (e) => { console.log('!!! unhandledRejection:', e && e.message ? e.message : e); });
const dir = process.argv[2];
process.chdir(dir);
require(path.join(dir, 'index.js'));
