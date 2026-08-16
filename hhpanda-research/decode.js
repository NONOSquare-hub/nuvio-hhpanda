// Deobfuscate javascript-obfuscator string array from streamfree.vip app.js
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'app.js', 'utf8');

const noop = () => {};
const sandbox = {
  console: { log: noop, error: noop, warn: noop, info: noop, debug: noop },
  setTimeout, clearTimeout, setInterval, clearInterval,
  self: {}, window: {}, document: {
    createElement: () => ({ style: {}, appendChild: noop, setAttribute: noop, addEventListener: noop }),
    getElementsByTagName: () => [{ appendChild: noop }],
    addEventListener: noop, documentElement: { style: {} }, head: { appendChild: noop },
  },
  navigator: { userAgent: 'Mozilla/5.0', language: 'vi' },
  performance: { now: () => Date.now() },
  location: { href: 'https://streamfree.vip/embed/vt/x', protocol: 'https:', origin: 'https://streamfree.vip' },
  XMLHttpRequest: function () { this.open = noop; this.send = noop; this.setRequestHeader = noop; },
  fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) }),
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(src, sandbox); } catch (e) { console.error('[load err, fine]', String(e).slice(0, 160)); }

const dec = sandbox.a0_0x24a9;
console.log('decoder type:', typeof dec);
if (typeof dec !== 'function') process.exit(1);

// collect alias names assigned from a0_0x24a9 (var X=a0_0x24a9)
const aliasRe = /(?:var\s+|,\s*)(_0x[0-9a-f]+)\s*=\s*a0_0x24a9\b/g;
const aliases = new Set(['a0_0x24a9']);
let m;
while ((m = aliasRe.exec(src))) aliases.add(m[1]);
console.log('aliases:', aliases.size);

// collect (index,key) call sites through any alias
const callRe = new RegExp("(?:_0x[0-9a-f]+|" + [...aliases].join('|') + ")\\(\\s*(0x[0-9a-f]+)\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\)", 'g');
const seen = new Map();
while ((m = callRe.exec(src))) {
  const idx = parseInt(m[1], 16);
  const key = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  if (!seen.has(idx + '|' + key)) seen.set(idx + '|' + key, [idx, key]);
}
console.log('call sites:', seen.size);

const out = [];
for (const [idx, key] of seen.values()) {
  try {
    const s = dec(idx, key);
    if (typeof s === 'string') out.push(s);
  } catch (_) { /* wrong key variant */ }
}
const uniq = [...new Set(out)];
console.log('decoded:', uniq.length);
fs.writeFileSync('decoded-strings.txt', uniq.join('\n'));
const interesting = uniq.filter(s => /https?:\/\/|\/api\/|\.mp4|\.m3u8|\/embed|\/video|getlink|source/i.test(s));
console.log('--- interesting ---');
interesting.forEach(s => console.log(JSON.stringify(s)));
