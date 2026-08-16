// Deobfuscate windows of app.js: replace alias(0x..,'key') calls with decoded strings
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('app.js', 'utf8');

const noop = () => {};
const sb = {
  console: { log: noop, error: noop, warn: noop },
  setTimeout, clearTimeout,
  document: { createElement: () => ({ style: {} }), getElementsByTagName: () => [{ appendChild: noop }], addEventListener: noop },
  navigator: { userAgent: 'x' }, performance: { now: () => 0 },
  location: { href: 'https://streamfree.vip/', protocol: 'https:' },
  XMLHttpRequest: function () { this.open = noop; this.send = noop; },
  fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve('') }),
};
sb.globalThis = sb; sb.window = sb; sb.self = sb;
vm.createContext(sb);
try { vm.runInContext(src, sb); } catch (e) {}
const dec = sb.a0_0x24a9;

const aliasRe = /(?:var\s+|,\s*)(_0x[0-9a-f]+)\s*=\s*a0_0x24a9\b/g;
const aliases = new Set(['a0_0x24a9']);
let m;
while ((m = aliasRe.exec(src))) aliases.add(m[1]);
const aliasAlt = [...aliases].join('|');

function deob(region) {
  return region.replace(
    new RegExp("(?:" + aliasAlt + ")\\(\\s*(0x[0-9a-f]+)\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\)", 'g'),
    (full, idx, key) => {
      try {
        const v = dec(parseInt(idx, 16), key.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
        return typeof v === 'string' ? JSON.stringify(v) : full;
      } catch (e) { return full; }
    });
}

// find call sites whose decode matches interesting words, dump deobfuscated context
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['bytecode', 'muxed', 'm3u8', 'hls'];
const callRe = new RegExp("(?:" + aliasAlt + ")\\(\\s*(0x[0-9a-f]+)\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\)", 'g');
const seen = new Set();
while ((m = callRe.exec(src))) {
  let v = '';
  try { v = dec(parseInt(m[1], 16), m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\')); } catch (e) { continue; }
  if (typeof v !== 'string') continue;
  if (targets.some((t) => v.toLowerCase().includes(t.toLowerCase()))) {
    const start = Math.max(0, m.index - 900), end = Math.min(src.length, m.index + 900);
    const key = start + ':' + end;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log('\n############ ' + v.slice(0, 60) + ' @' + m.index + ' ############');
    console.log(deob(src.slice(start, end)).replace(/\s+/g, ' '));
  }
}
