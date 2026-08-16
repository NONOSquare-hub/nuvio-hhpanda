// Run the real player bundle with real fetch + webcrypto; log every URL built or fetched
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');

const page = fs.readFileSync('embed4.html', 'utf8');
const attr = (n) => (page.match(new RegExp('data-' + n + '="([^"]*)"')) || [])[1] || '';
const playerData = {
  id: attr('id'), nonce: attr('nonce'), state: 'loading',
  time: attr('time'), starttime: '0', checksum: attr('checksum'), uip: attr('uip'),
};
const bytecode = (page.match(/name="bytecode" content="([^"]*)"/) || [])[1] || '';

const CAP = [];
const cap = (k, v) => { const s = String(v); CAP.push(k + ' ' + s); console.log('>> [' + k + ']', s.slice(0, 400)); };
const noop = () => {};
const quietConsole = { log: (...a) => { const s = a.map((x) => { if (typeof x === 'string') return x; if (x instanceof Error) return x.name + ': ' + x.message + ' @' + String(x.stack).split('\n')[1]; if (x && typeof x === 'object') { try { return JSON.stringify(x).slice(0, 300); } catch (e) { return '[obj]'; } } return String(x); }).join(' | '); if (s) console.log('[page]', s.slice(0, 500)); }, error: (...a) => { for (const x of a) { if (x instanceof Error) console.log('[page.err]', x.name + ': ' + x.message + '\n' + String(x.stack).slice(0, 600)); else if (x && typeof x === 'object') { try { console.log('[page.err.obj]', JSON.stringify(x).slice(0, 400)); } catch (e) {} } else console.log('[page.err]', String(x).slice(0, 300)); } }, warn: noop, info: noop, debug: noop, table: noop, dir: noop, trace: noop, group: noop, groupEnd: noop };

function el(tag) {
  const listeners = {};
  const base = {
    tagName: (tag || 'div').toUpperCase(), children: [], _attrs: {}, style: { setProperty: noop, getPropertyValue: () => '' },
    dataset: {}, innerHTML: '', innerText: '', textContent: '', className: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute(k, v) { this._attrs[k] = v; if (k === 'src' || k === 'href') cap(tag + '.attr.' + k, v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    removeAttribute: noop, hasAttribute: () => false,
    appendChild(c) { this.children.push(c); return c; }, removeChild: noop,
    append(...cs) { this.children.push(...cs); },
    prepend: noop, insertAdjacentElement: noop, insertAdjacentHTML: noop, after: noop, before: noop, replaceWith: noop,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: noop, dispatchEvent() { return true; },
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
    getContext(type) {
      if (type === '2d') return new Proxy({}, { get: (t, p) => (p === 'canvas' ? base : (typeof p === 'string' ? () => '' : undefined)) });
      return null;
    },
    toDataURL: () => 'data:image/png;base64,', play: noop, pause: noop, load: noop,
    insertBefore: noop, contains: () => false, cloneNode: () => el(tag), closest: () => null,
  };
  return new Proxy(base, {
    get(t, p) {
      if (p === 'src' || p === 'href') return t._attrs[p];
      return p in t ? t[p] : undefined;
    },
    set(t, p, v) {
      if (p === 'src' || p === 'href') cap(tag + '.set.' + String(p), v);
      if ((p === 'textContent' || p === 'innerHTML' || p === 'value') && typeof v === 'string' && v.length > 12) cap(tag + '.text', v.slice(0, 500));
      t[p] = v; return true;
    },
  });
}

const playerEl = el('div');
playerEl.id = 'hrm-player';
playerEl.dataset = playerData;
playerEl.getAttribute = (n) => (n.startsWith('data-') ? playerData[n.slice(5)] : (n === 'id' ? 'hrm-player' : null));

const docListeners = {};
const winListeners = {};
const document = {
  readyState: 'complete', visibilityState: 'visible', hidden: false, title: 'nddtgs03e06.muxed.mp4',
  referrer: 'https://hhpanda.st/', cookie: '',
  currentScript: el('script'),
  getElementById: (id) => (id === 'hrm-player' ? playerEl : el('div')),
  querySelector(sel) {
    if (/meta\[name=.?bytecode/i.test(sel)) { const m = el('meta'); m.getAttribute = (n) => (n === 'content' ? bytecode : 'bytecode'); m.content = bytecode; return m; }
    if (sel.includes('hrm-player')) return playerEl;
    return el('div');
  },
  querySelectorAll: () => [el('div')],
  createElement: (t) => el(t), createElementNS: (ns, t) => el(t),
  addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
  removeEventListener: noop, dispatchEvent: () => true,
  body: el('body'), head: el('head'), documentElement: el('html'),
  createEvent: () => ({ initEvent: noop }), createTextNode: () => ({}),
};

// jwplayer external stub — bundle expects window.jwplayer from jwplayer.js
const jwplayerStubFn = function (id) {
  cap('jwplayer.setup-target', id);
  return {
    setup(cfg) { cap('jwplayer.setup', JSON.stringify(cfg).slice(0, 800)); },
    on: function () { return this; }, once: function () { return this; }, off: function () { return this; },
    addEventListener: function () { return this; }, removeEventListener: function () { return this; },
    play: noop, pause: noop, seek: noop, getPlaylist: () => [], getPlaylistItem: () => ({}),
    getPosition: () => 0, getDuration: () => 1676, getState: () => 'idle', setConfig: noop,
    getContainer: () => playerEl, getMute: () => false, setMute: noop, setVolume: noop, remove: noop,
  };
};
jwplayerStubFn.defaults = {};
jwplayerStubFn.utils = {};
jwplayerStubFn.version = '8.0';

const RealURL = URL;
class LogURL extends RealURL {
  constructor(u, base) {
    super(u, base);
    try { if (String(u).startsWith('/hls/') || String(u).includes('.m3u8')) cap('URL.hls', this.href); } catch (e) {}
  }
}

const store = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; }, clear: () => {} }; };
const timers = new Set();
class LogPromise extends Promise {
  constructor(exec) {
    super((res, rej) => exec(
      (v) => res(v),
      (r) => {
        const st = new Error('rejection-origin').stack.split('\n').slice(2, 6).join('\n');
        console.log('[REJECT]', String(r && r.message || r).slice(0, 160), '\n', st);
        rej(r);
      }
    ));
  }
}

const sb = {
  console: quietConsole, URL: LogURL, Promise: LogPromise,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  TextEncoder, TextDecoder, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
  Float32Array, Float64Array, ArrayBuffer, SharedArrayBuffer, DataView, BigInt64Array, BigUint64Array,
  Promise, JSON, Math, Date, RegExp, Error, TypeError, RangeError, Object, Array, String, Number, Boolean,
  Symbol, Proxy, Reflect, Map, Set, WeakMap, WeakSet, BigInt, ArrayBuffer, isNaN, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  crypto: webcrypto, AbortController, AbortSignal, structuredClone, queueMicrotask,
  setTimeout: (fn, ms, ...a) => { const id = setTimeout(() => { try { fn(...a); } catch (e) { console.log('[timer err]', String(e).slice(0, 200)); } }, Math.min(Number(ms) || 0, 300)); timers.add(id); return id; },
  clearTimeout: (id) => { clearTimeout(id); timers.delete(id); },
  setInterval: (fn, ms) => setInterval(() => { try { fn(); } catch (e) {} }, Math.max(Number(ms) || 1000, 500)),
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(() => { try { fn(Date.now()); } catch (e) {} }, 16),
  cancelAnimationFrame: noop,
  requestIdleCallback: (fn) => setTimeout(() => { try { fn({ didTimeout: false }); } catch (e) {} }, 0),
  performance: { now: () => Date.now(), timeOrigin: Date.now(), getEntries: () => [], getEntriesByType: () => [], mark: noop, measure: noop },
  location: new RealURL('https://streamfree.vip/embed/vt/4bVGddhz'),
  navigator: new Proxy({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    language: 'vi-VN', languages: ['vi-VN', 'vi', 'en-US', 'en'], platform: 'Win32',
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, webdriver: false, cookieEnabled: true,
    doNotTrack: null, vendor: 'Google Inc.', appVersion: '5.0 (Windows)', product: 'Gecko',
    plugins: [], mimeTypes: [],
    serviceWorker: { register: () => Promise.resolve({ scope: '/', addEventListener: noop, unregister: () => Promise.resolve() }), addEventListener: noop, controller: null, ready: Promise.resolve({}) },
    permissions: { query: () => Promise.resolve({ state: 'granted' }) },
    sendBeacon: () => true, javaEnabled: () => false,
  }, { get(t, p) { return p in t ? t[p] : undefined; } }),
  localStorage: store(), sessionStorage: store(), indexedDB: { open: () => ({ addEventListener: noop, onsuccess: null, onerror: null }) },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
  devicePixelRatio: 1,
  history: { length: 1, state: {}, pushState: noop, replaceState: noop, back: noop, go: noop },
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
  ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
  PerformanceObserver: class { observe() {} disconnect() {} },
  MediaSource: class { static isTypeSupported() { return true; } },
  AudioContext: class {
    constructor() { this.sampleRate = 44100; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime: noop }, connect: noop, start: noop, stop: noop, disconnect: noop }; }
    createDynamicsCompressor() { return { threshold: { value: 0, setValueAtTime: noop }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: noop, disconnect: noop }; }
    createGain() { return { gain: { value: 1 }, connect: noop, disconnect: noop }; }
    createAnalyser() { return { frequencyBinCount: 128, getFloatFrequencyData: noop, connect: noop, disconnect: noop }; }
    createBufferSource() { return { buffer: null, connect: noop, start: noop, stop: noop, disconnect: noop }; }
    getDestination() { return {}; } close() { return Promise.resolve(); } resume() { return Promise.resolve(); }
  },
  OfflineAudioContext: class {
    constructor(ch, len, rate) { this.length = len || 5000; this.sampleRate = rate || 44100; this.currentTime = 0; this.destination = {}; this.oncomplete = null; }
    createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime: noop }, connect: noop, start: noop, stop: noop, disconnect: noop }; }
    createDynamicsCompressor() { return { threshold: { value: 0, setValueAtTime: noop }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: noop, disconnect: noop }; }
    createGain() { return { gain: { value: 1 }, connect: noop, disconnect: noop }; }
    startRendering() { const buf = { getChannelData: () => new Float32Array(this.length), duration: this.length / this.sampleRate }; if (this.oncomplete) setTimeout(() => this.oncomplete({ renderedBuffer: buf }), 0); return Promise.resolve(buf); }
    resume() { return Promise.resolve(); }
  },
  HTMLMediaElement: { prototype: { play: noop, pause: noop, load: noop, canPlayType: () => 'probably' } },
  HTMLVideoElement: { prototype: {} }, HTMLCanvasElement: { prototype: {} },
  Worker: class { constructor(u) { cap('worker', u); } postMessage() {} terminate() {} addEventListener() {} },
  BroadcastChannel: class { constructor(n) { this.name = n; } postMessage() {} close() {} addEventListener() {} },
  XMLHttpRequest: class {
    constructor() { this.readyState = 0; this.status = 0; this.responseText = ''; this.response = ''; this.responseType = ''; this._headers = {}; }
    open(m, u) { this._m = m; this._u = u; this.readyState = 1; cap('xhr', u); }
    setRequestHeader(k, v) { this._headers[k] = v; }
    abort() {}
    getAllResponseHeaders() { return this._rh || ''; }
    getResponseHeader(n) { return (this._rh || '').split('\n').find((l) => l.toLowerCase().startsWith(n.toLowerCase() + ':')) || null; }
    async send() {
      try {
        const r = await fetch(this._u, { method: this._m || 'GET', headers: this._headers });
        this.status = r.status; this.statusText = r.statusText;
        this._rh = [...r.headers.entries()].map(([k, v]) => k + ': ' + v).join('\n');
        const buf = Buffer.from(await r.arrayBuffer());
        this.responseText = buf.toString('utf8');
        this.response = this.responseType === 'arraybuffer' ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : this.responseText;
        this.readyState = 4;
      } catch (e) {
        this.status = 0; this.readyState = 4; this.responseText = ''; this.response = '';
      }
      try { this.onreadystatechange && this.onreadystatechange(); } catch (e) { console.log('[xhr-cb err]', String(e).slice(0, 200)); }
      try { this.onload && this.onload(); } catch (e) { console.log('[xhr-load err]', String(e).slice(0, 200)); }
      try { this.onloadend && this.onloadend(); } catch (e) {}
    }
  },
  fetch: async (u, opt) => {
    const url = typeof u === 'string' ? u : (u && u.url) || String(u);
    cap('fetch' + (opt && opt.method && opt.method !== 'GET' ? '.' + opt.method : ''), url);
    const ac = new AbortController();
    if (opt && opt.signal) { try { opt.signal.addEventListener('abort', () => ac.abort()); } catch (e) {} }
    try {
      const r = await fetch(url, {
        method: (opt && opt.method) || 'GET',
        headers: (opt && opt.headers) || {},
        body: opt && opt.body,
        signal: ac.signal,
      });
      const clone = r.clone();
      const text = await clone.text().catch(() => '');
      if (/m3u8|\/hls\//.test(url)) { cap('m3u8-body', text.slice(0, 1500)); }
      return {
        ok: r.ok, status: r.status, statusText: r.statusText,
        headers: { get: (n) => r.headers.get(n) },
        text: () => Promise.resolve(text),
        json: () => Promise.resolve({}).catch(() => {}),
        arrayBuffer: () => r.arrayBuffer(),
      };
    } catch (e) { cap('fetch-err', url + ' :: ' + e.message); return { ok: false, status: 0, text: () => Promise.resolve(''), json: () => Promise.resolve({}), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)), headers: { get: () => null } }; }
  },
  addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: noop, postMessage: noop, dispatchEvent: () => true,
  alert: noop, confirm: () => true, prompt: () => '',
  crypto2: undefined,
  Blob: class { constructor(parts) { this.size = (parts || []).length; } },
  Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t) { this.type = t; } },
  MessageChannel: class { constructor() { this.port1 = { postMessage: (d) => cap('sw.msg', JSON.stringify(d).slice(0, 300)), addEventListener: noop, close: noop }; this.port2 = { postMessage: noop, addEventListener: noop, close: noop }; } },
  document, window: undefined, jwplayer: jwplayerStubFn,
};
sb.location.replace = (u) => cap('loc.replace', u);
sb.location.assign = (u) => cap('loc.assign', u);
sb.location.reload = (u) => cap('loc.reload', u || '');
sb.self = sb; sb.globalThis = sb; sb.top = { postMessage: noop, location: { href: 'https://hhpanda.st/watch-nguoi-dai-dien-thoi-gian-thu-do-anh-quoc/tap-6-sv1.html' } }; sb.parent = sb.top; sb.frameElement = el('iframe'); sb.window = sb;
sb.Window = function () {};

vm.createContext(sb);
process.on('unhandledRejection', (r) => { console.log('[unhandledRejection]', String(r && r.stack || r).slice(0, 400)); });
console.log('--- running app.js ---');
try { vm.runInContext(fs.readFileSync('app.js', 'utf8'), sb, { timeout: 60000 }); } catch (e) { console.error('[run err]', String(e).slice(0, 500)); }
console.log('probe a0_0x24a9:', vm.runInContext('typeof a0_0x24a9', sb));
// chunk 31 must load to release the webpack entry (O(...,[0x1f],...))
try { vm.runInContext(fs.readFileSync('chunk31.js', 'utf8'), sb, { timeout: 60000 }); console.log('chunk31 loaded'); } catch (e) { console.error('[chunk31 err]', String(e).slice(0, 500)); }
// fire DOMContentLoaded + load listeners
for (const [name, fns] of [['DOMContentLoaded', docListeners.DOMContentLoaded], ['load', winListeners.load], ['DOMContentLoaded', winListeners.DOMContentLoaded]]) {
  for (const fn of fns || []) { try { fn({ type: name }); } catch (e) { console.log('[' + name + ' err]', String(e).slice(0, 300)); } }
}

setTimeout(() => {
  console.log('\n===== captured ' + CAP.length + ' =====');
  fs.writeFileSync('captured2.txt', CAP.join('\n---\n'));
  process.exit(0);
}, 15000);
