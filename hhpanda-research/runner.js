// Run streamfree.vip player bundle in a fake DOM and log every URL it derives
const fs = require('fs');
const vm = require('vm');

const page = fs.readFileSync('embed4.html', 'utf8');
const attr = (n) => {
  const m = page.match(new RegExp('data-' + n + '="([^"]*)"'));
  return m ? m[1] : '';
};
const playerData = {
  id: attr('id'), nonce: attr('nonce'), state: 'loading',
  time: attr('time'), starttime: '0', checksum: attr('checksum'), uip: attr('uip'),
};
const bytecode = (page.match(/name="bytecode" content="([^"]*)"/) || [])[1] || '';
console.log('[feed] data-id len', playerData.id.length, 'nonce len', playerData.nonce.length,
  'checksum len', playerData.checksum.length, 'uip len', playerData.uip.length, 'bytecode len', bytecode.length);

const LOG = [];
const logURL = (kind, url) => {
  const s = String(url);
  if (!/^about:|^data:text/.test(s)) { LOG.push(kind + ' ' + s); console.log('>>> [' + kind + ']', s.slice(0, 300)); }
};

const noop = () => {};
const mkProxyEl = (tag) => new Proxy({}, {
  get(t, p) {
    if (p === 'tagName') return tag;
    if (p === 'style') return {};
    if (p === 'dataset') return {};
    if (p === 'addEventListener' || p === 'removeEventListener') return noop;
    if (p === 'appendChild' || p === 'removeChild' || p === 'setAttribute' || p === 'getAttribute') {
      if (p === 'setAttribute') return (k, v) => { if (k === 'src' || k === 'href') logURL(tag + '.setAttr', v); };
      return noop;
    }
    if (p === 'getContext') return () => ({ fillRect: noop, getImageData: () => ({ data: [] }), fillText: noop });
    return t[p];
  },
  set(t, p, v) {
    if (p === 'src' || p === 'href' || p === 'url') logURL(tag + '.set.' + String(p), v);
    t[p] = v; return true;
  },
});

const playerEl = new Proxy({ id: 'hrm-player' }, {
  get(t, p) {
    if (p === 'getAttribute') return (n) => (n.startsWith('data-') ? playerData[n.slice(5)] : (n === 'id' ? 'hrm-player' : null));
    if (p === 'dataset') return playerData;
    if (p === 'addEventListener' || p === 'removeEventListener' || p === 'appendChild') return noop;
    if (p === 'style') return { setProperty: noop };
    if (p === 'classList') return { add: noop, remove: noop, contains: () => false };
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; },
});

let timerId = 1;
const sb = {
  console, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, Promise, JSON, Math, Date,
  setTimeout: (fn, ms) => { try { if (ms <= 50) fn(); } catch (e) {} return timerId++; },
  clearTimeout: noop, setInterval: (fn) => timerId++, clearInterval: noop,
  requestAnimationFrame: (fn) => { try { fn(Date.now()); } catch (e) {} return timerId++; },
  performance: { now: () => Date.now() },
  location: { href: 'https://streamfree.vip/embed/vt/4bVGddhz', protocol: 'https:', origin: 'https://streamfree.vip', host: 'streamfree.vip', pathname: '/embed/vt/4bVGddhz', search: '', replace: logURL.bind(null, 'loc.replace') },
  navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', language: 'vi-VN', languages: ['vi-VN', 'vi', 'en'], platform: 'Win32', hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  sessionStorage: { _d: {}, getItem() { return null; }, setItem: noop, removeItem: noop },
  MutationObserver: function () { this.observe = noop; this.disconnect = noop; },
  IntersectionObserver: function () { this.observe = noop; this.disconnect = noop; },
  ResizeObserver: function () { this.observe = noop; this.disconnect = noop; },
  HTMLMediaElement: { prototype: { play: noop, pause: noop, load: noop } },
  MediaSource: function () { this.addEventListener = noop; },
  XMLHttpRequest: function () {
    const x = this;
    x.open = (m, u) => { logURL('xhr.' + m, u); x.readyState = 4; x.status = 200; x.responseText = '{}'; x.response = '{}'; };
    x.setRequestHeader = noop; x.send = () => { try { x.onreadystatechange && x.onreadystatechange(); } catch (e) {} };
    x.getAllResponseHeaders = () => '';
  },
  fetch: (u, opt) => {
    logURL('fetch' + (opt && opt.method && opt.method !== 'GET' ? '.' + opt.method : ''), u);
    if (opt && opt.body) { try { logURL('fetch.body', typeof opt.body === 'string' ? opt.body : '[binary ' + opt.body.length + ']'); } catch (e) {} }
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(''), json: () => Promise.resolve({}), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
  },
  Worker: function (u) { logURL('worker', u); this.postMessage = noop; this.addEventListener = noop; this.terminate = noop; },
  document: {
    title: 'x', visibilityState: 'visible', hidden: false, referrer: 'https://hhpanda.st/',
    getElementById: (id) => (id === 'hrm-player' ? playerEl : mkProxyEl('div')),
    querySelector: (sel) => {
      if (/meta\[name=.?bytecode/i.test(sel)) return { getAttribute: () => 'bytecode', content: bytecode };
      if (sel.includes('hrm-player')) return playerEl;
      return mkProxyEl('div');
    },
    querySelectorAll: () => [mkProxyEl('div')],
    createElement: (t) => mkProxyEl(t),
    createElementNS: (ns, t) => mkProxyEl(t),
    addEventListener: noop, removeEventListener: noop,
    body: mkProxyEl('body'), head: mkProxyEl('head'), documentElement: mkProxyEl('html'),
    cookie: '',
  },
  addEventListener: noop, removeEventListener: noop,
  postMessage: noop, alert: noop, confirm: () => true, prompt: () => '',
  screen: { width: 1920, height: 1080 }, devicePixelRatio: 1,
  crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; return a; }, subtle: {} },
  URL: { createObjectURL: () => 'blob:fake' }, Blob: function (p) { this.size = 0; }, Event: function () {}, CustomEvent: function () {},
  history: { pushState: noop, replaceState: noop },
};
sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.top = sb; sb.parent = sb;
sb.Object = Object; sb.Array = Array; sb.String = String; sb.Number = Number; sb.Boolean = Boolean; sb.RegExp = RegExp; sb.Error = Error; sb.Symbol = Symbol; sb.Proxy = Proxy; sb.Map = Map; sb.Set = Set; sb.WeakMap = WeakMap; sb.WeakSet = WeakSet; sb.Promise = Promise; sb.Reflect = Reflect; sb.parseInt = parseInt; sb.parseFloat = parseFloat; sb.isNaN = isNaN; sb.encodeURIComponent = encodeURIComponent; sb.decodeURIComponent = decodeURIComponent; sb.encodeURI = encodeURI; sb.decodeURI = decodeURI;

vm.createContext(sb);
const src = fs.readFileSync('app.js', 'utf8');
try { vm.runInContext(src, sb, { timeout: 20000 }); } catch (e) { console.error('[run err]', String(e).slice(0, 300)); }
// give async chains a moment
setTimeout(() => {
  console.log('--- captured', LOG.length, 'URLs ---');
  fs.writeFileSync('captured.txt', LOG.join('\n'));
}, 3000);
