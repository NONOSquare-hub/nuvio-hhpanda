// Capture post-decryption data from the hhpanda/streamfree player in real Chromium
const { chromium } = require('playwright');

const WATCH_URL = process.argv[2] || 'https://hhpanda.st/watch-muc-than-ky/tap-1-sv1.html';
const WAIT_MS = Number(process.argv[3] || 25000);

const HOOK = `
(() => {
  const send = (kind, data) => {
    try {
      if (typeof window.__cap === 'function') window.__cap(kind, data);
      else (window.__capQ = window.__capQ || []).push([kind, data]);
    } catch (e) {}
  };
  setInterval(() => { if (typeof window.__cap === 'function' && window.__capQ) { const q = window.__capQ; window.__capQ = null; q.forEach(([k, d]) => send(k, d)); } }, 300);

  const isMedia = (u) => /\\.m3u8|\\/hls\\/|\\.ts($|\\?)|\\.mp4|\\.m4s|segment|byte/i.test(String(u));
  const b64head = (buf, n) => {
    const b = new Uint8Array(buf.slice(0, Math.min(n || 48, buf.byteLength)));
    let s = '';
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  };

  // 1) window.fetch — catch URLs + post-SW (decrypted?) bodies
  const of = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const r = await of.apply(this, arguments);
    try {
      if (isMedia(url)) {
        const clone = r.clone();
        const buf = await clone.arrayBuffer();
        send('fetch', { url: url.slice(0, 500), status: r.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(url) ? new TextDecoder().decode(buf.slice(0, 4000)) : undefined });
      }
    } catch (e) {}
    return r;
  };

  // 2) XMLHttpRequest
  const oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__url = String(u);
    this.addEventListener('load', () => {
      try {
        if (isMedia(this.__url)) {
          const buf = this.responseType === 'arraybuffer' && this.response ? this.response : new TextEncoder().encode(this.responseText || '').buffer;
          send('xhr', { url: this.__url.slice(0, 500), status: this.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(this.__url) ? String(this.responseText || '').slice(0, 4000) : undefined });
        }
      } catch (e) {}
    });
    return oo.apply(this, arguments);
  };

  // 3) crypto.subtle.decrypt — the decrypted playlist lands here
  if (window.crypto && window.crypto.subtle) {
    const od = window.crypto.subtle.decrypt;
    window.crypto.subtle.decrypt = async function (alg, key, data) {
      const out = await od.apply(this, arguments);
      try {
        const isPlaylist = (() => { const u8 = new Uint8Array(out.slice(0, 7)); let s = ''; for (const c of u8) s += String.fromCharCode(c); return s === '#EXTM3U'; })();
        send('decrypt', { len: out.byteLength, head: b64head(out), isPlaylist, text: isPlaylist ? new TextDecoder().decode(out.slice(0, 6000)) : undefined });
      } catch (e) {}
      return out;
    };
  }

  // 4) SourceBuffer.appendBuffer — decrypted media fragments
  if (window.SourceBuffer && window.SourceBuffer.prototype) {
    const oa = window.SourceBuffer.prototype.appendBuffer;
    window.SourceBuffer.prototype.appendBuffer = function (buf) {
      try { send('append', { len: buf.byteLength, head: b64head(buf, 32) }); } catch (e) {}
      return oa.apply(this, arguments);
    };
  }
})();
`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'vi-VN' });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await context.addInitScript(HOOK);

  const caps = [];
  await context.exposeBinding('__cap', (src, kind, data) => {
    const frameUrl = (src && src.frame && src.frame.url) || '';
    caps.push({ t: Date.now(), kind, frame: frameUrl.slice(0, 80), ...data });
    const brief = data.text ? data.text.slice(0, 120).replace(/\n/g, '\\n') : '';
    console.log(`[${kind}] ${data.url || ''} len=${data.len || 0} head=${(data.head || '').slice(0, 24)} ${brief}`);
  });

  const page = await context.newPage();
  page.on('console', (m) => { const t = m.text(); if (!/^\[/.test(t)) console.log('[page]', t.slice(0, 160)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  console.log('goto', WATCH_URL);
  await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);

  // click Play inside the player iframe if present
  try {
    const frame = page.frameLocator('iframe');
    const play = frame.getByRole('button', { name: 'Phát' });
    if (await play.count() === 1) { await play.click({ timeout: 5000 }); console.log('[cmd] clicked Play'); }
    else console.log('[cmd] no Play button (autoplay?)');
  } catch (e) { console.log('[cmd] play click skipped:', String(e).slice(0, 120)); }

  await page.waitForTimeout(WAIT_MS);

  require('fs').writeFileSync('captures.json', JSON.stringify(caps, null, 1));
  console.log('=== total captures:', caps.length, '-> captures.json');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
