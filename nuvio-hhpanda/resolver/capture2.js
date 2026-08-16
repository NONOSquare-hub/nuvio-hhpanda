// Capture v2: hook page + service worker, force play, screenshot
const { chromium } = require('playwright');
const fs = require('fs');

const WATCH_URL = process.argv[2] || 'https://hhpanda.st/watch-muc-than-ky/tap-1-sv1.html';
const WAIT_MS = Number(process.argv[3] || 30000);

const PAGE_HOOK = `
(() => {
  window.__log = [];
  const send = (kind, data) => { try { window.__log.push(Object.assign({ kind, t: Date.now() }, data)); console.log('[' + kind + '] ' + (data.url || '') + ' len=' + (data.len || 0)); } catch (e) {} };
  const isMedia = (u) => /\\.m3u8|\\/hls\\/|\\.ts($|\\?)|\\.mp4|\\.m4s|segment/i.test(String(u));
  const b64head = (buf, n) => { const b = new Uint8Array(buf.slice(0, Math.min(n || 48, buf.byteLength))); let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };

  const of = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const r = await of.apply(this, arguments);
    try {
      if (isMedia(url)) {
        const clone = r.clone();
        const buf = await clone.arrayBuffer();
        send('fetch', { url: url.slice(0, 600), status: r.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(url) ? new TextDecoder().decode(buf.slice(0, 6000)) : undefined });
      }
    } catch (e) {}
    return r;
  };

  const oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__url = String(u);
    this.addEventListener('load', () => {
      try {
        if (isMedia(this.__url)) {
          const buf = this.responseType === 'arraybuffer' && this.response ? this.response : new TextEncoder().encode(this.responseText || '').buffer;
          send('xhr', { url: this.__url.slice(0, 600), status: this.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(this.__url) ? String(this.responseText || '').slice(0, 6000) : undefined });
        }
      } catch (e) {}
    });
    return oo.apply(this, arguments);
  };

  if (window.crypto && window.crypto.subtle) {
    const od = window.crypto.subtle.decrypt;
    window.crypto.subtle.decrypt = async function (alg, key, data) {
      const out = await od.apply(this, arguments);
      try {
        let s = ''; const u8 = new Uint8Array(out.slice(0, 7)); for (const c of u8) s += String.fromCharCode(c);
        send('decrypt', { len: out.byteLength, head: b64head(out), isPlaylist: s === '#EXTM3U', text: s === '#EXTM3U' ? new TextDecoder().decode(out.slice(0, 8000)) : undefined });
      } catch (e) {}
      return out;
    };
  }

  if (window.SourceBuffer && window.SourceBuffer.prototype) {
    const oa = window.SourceBuffer.prototype.appendBuffer;
    window.SourceBuffer.prototype.appendBuffer = function (buf) {
      try { send('append', { len: buf.byteLength, head: b64head(buf, 32) }); } catch (e) {}
      return oa.apply(this, arguments);
    };
  }
})();
`;

const SW_HOOK = `
(() => {
  self.__swlog = [];
  const send = (kind, data) => { try { self.__swlog.push(Object.assign({ kind, t: Date.now() }, data)); } catch (e) {} };
  const isMedia = (u) => /\.m3u8|\/hls\/|\.ts($|\?)|\.mp4|\.m4s|segment|byte/i.test(String(u));
  const b64head = (buf, n) => { const b = new Uint8Array(buf.slice(0, Math.min(n || 48, buf.byteLength))); let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };

  const of = self.fetch;
  self.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const r = await of.apply(this, arguments);
    try {
      if (isMedia(url)) {
        const clone = r.clone();
        const buf = await clone.arrayBuffer();
        send('swfetch', { url: url.slice(0, 600), status: r.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(url) ? new TextDecoder().decode(buf.slice(0, 8000)) : undefined });
      }
    } catch (e) {}
    return r;
  };

  self.addEventListener('message', (ev) => {
    try {
      const d = ev.data;
      if (d && d.type !== undefined && d.payload instanceof ArrayBuffer) send('swmsg-decrypt-in', { type: d.type, len: d.payload.byteLength, head: b64head(d.payload, 24) });
      else if (d && d.url) send('swmsg-url', { type: d.type, url: String(d.url).slice(0, 600) });
    } catch (e) {}
  });
})();
`;

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-position=-32000,-32000'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'vi-VN' });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await context.addInitScript(PAGE_HOOK);

  const workers = [];
  context.on('serviceworker', async (sw) => {
    console.log('[sw] registered:', sw.url());
    try { await sw.evaluate(SW_HOOK); console.log('[sw] hook installed'); } catch (e) { console.log('[sw] hook err', String(e).slice(0, 150)); }
    workers.push(sw);
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  console.log('goto', WATCH_URL);
  await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // auto-dismiss the anti-devtools block: click "Thử lại" up to 6 times
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    let blocked = false;
    for (const frame of page.frames()) {
      try {
        blocked = blocked || await frame.evaluate(() => document.body && document.body.innerText.includes('công cụ nhà phát triển'));
      } catch (e) {}
    }
    if (!blocked) { console.log('[block-check] pass at attempt', i + 1); break; }
    console.log('[block-check] blocked, reloading...');
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded' }); }
  }
  await page.waitForTimeout(9000);

  // force play on any video element in any frame
  for (const frame of page.frames()) {
    try {
      const res = await frame.evaluate(async () => {
        const vids = document.querySelectorAll('video');
        const out = [];
        for (const v of vids) {
          try { v.muted = true; await v.play(); } catch (e) {}
          out.push({ src: String(v.currentSrc || v.src || '').slice(0, 80), paused: v.paused, ready: v.readyState, dur: v.duration });
        }
        return out;
      });
      if (res.length) console.log('[video]', frame.url().slice(0, 60), JSON.stringify(res));
    } catch (e) {}
  }

  await page.screenshot({ path: 'shot1.png' });
  console.log('[shot] saved shot1.png');

  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MS) {
    await page.waitForTimeout(3000);
    for (const w of workers) {
      try {
        const log = await w.evaluate(() => self.__swlog || []);
        if (log.length) {
          for (const e of log.splice(0)) console.log('[SW]', e.kind, (e.url || '').slice(0, 200), 'len=' + (e.len || 0), 'head=' + (e.head || '').slice(0, 20), (e.text || '').slice(0, 150).replace(/\n/g, '\\n'));
          fs.appendFileSync('sw-captures.log', '');
        }
      } catch (e) {}
    }
  }

  // dump page log
  for (const frame of page.frames()) {
    try {
      const log = await frame.evaluate(() => window.__log || []);
      if (log.length) {
        console.log('=== PAGE LOG (' + frame.url().slice(0, 60) + ') ===');
        for (const e of log) console.log('[PAGE]', e.kind, (e.url || '').slice(0, 200), 'len=' + (e.len || 0), 'head=' + (e.head || '').slice(0, 20), (e.text || '').slice(0, 200).replace(/\n/g, '\\n'));
      }
    } catch (e) {}
  }
  await page.screenshot({ path: 'shot2.png' });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
