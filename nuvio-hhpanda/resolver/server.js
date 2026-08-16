// HHPanda local resolver: opens the real player in Chromium, harvests the
// decrypted HLS playlist and relays decrypted segments to Nuvio over LAN.
//
//   node resolver/server.js            (default port 7777)
//   PORT=8888 HEADLESS=1 node resolver/server.js
//
// Endpoints:
//   GET /master?post=<wpId>&slug=<postSlug>&ep=<n>&sv=<1|2>&type=<tiktik|pro>  -> rewritten m3u8
//   GET /seg?sid=<sessionId>&u=<encodedOriginalUrl>                            -> decrypted segment bytes
//   GET /probe?sid=<sessionId>                                                -> capture log (debug)
//   GET /status
const http = require('http');
const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 7777);
const HEADLESS = process.env.HEADLESS === '1';
const HHPANDA = 'https://hhpanda.st';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PROFILE_DIR = path.join(__dirname, 'pw-profile');
const SESSION_IDLE_MS = 10 * 60 * 1000;

// Same hooks proven in capture2.js: everything the player decrypts flows through
// page-side crypto.subtle.decrypt, and media requests carry decryptable URLs.
const PAGE_HOOK = `
(() => {
  window.__log = [];
  const send = (kind, data) => { try { window.__log.push(Object.assign({ kind, t: Date.now() }, data)); } catch (e) {} };
  const isMedia = (u) => /\\.m3u8|\\/hls\\/|\\.ts($|\\?)|\\.mp4|\\.m4s|segment|byte/i.test(String(u));
  const b64head = (buf, n) => { const b = new Uint8Array(buf.slice(0, Math.min(n || 48, buf.byteLength))); let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };

  const of = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const r = await of.apply(this, arguments);
    try {
      if (isMedia(url)) {
        const clone = r.clone();
        const buf = await clone.arrayBuffer();
        send('fetch', { url: url.slice(0, 800), status: r.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(url) ? new TextDecoder().decode(buf.slice(0, 20000)) : undefined });
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
          send('xhr', { url: this.__url.slice(0, 800), status: this.status, len: buf.byteLength, head: b64head(buf), text: /m3u8|hls/.test(this.__url) ? String(this.responseText || '').slice(0, 20000) : undefined });
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
        send('decrypt', { len: out.byteLength, head: b64head(out), isPlaylist: s === '#EXTM3U', text: s === '#EXTM3U' ? new TextDecoder().decode(out.slice(0, 40000)) : undefined });
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

const state = {
  browserContext: null,
  sessions: new Map(), // sid -> { page, embedUrl, watchUrl, lastUsed, sid }
  sidSeq: 1,
};

async function getBrowserContext() {
  if (state.browserContext) return state.browserContext;
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1280, height: 720 },
    locale: 'vi-VN',
    userAgent: UA,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--window-position=-32000,-32000',
    ],
  });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await context.addInitScript(PAGE_HOOK);
  state.browserContext = context;
  console.log('[resolver] chromium up (headless=' + HEADLESS + ')');
  return context;
}

async function getEmbedUrl(postId, ep, sv, type) {
  const url = `${HHPANDA}/player/player.php?action=dox_ajax_player&post_id=${postId}&chapter_st=tap-${ep}&type=${type}&sv=${sv}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: `${HHPANDA}/` } });
  const html = await r.text();
  const m = html.match(/<iframe[^>]+src="([^"]+)"/i);
  if (!m) throw new Error('player.php returned no iframe (server may be missing for this show)');
  return m[1];
}

async function readLog(page) {
  try {
    return await page.evaluate(() => window.__log || []);
  } catch (e) {
    return [];
  }
}

function pickPlaylist(entries) {
  // Prefer the decrypted media playlist (has #EXTINF); fall back to any #EXTM3U text.
  const pl = entries.filter((e) => (e.kind === 'decrypt' && e.isPlaylist && e.text) || (e.text && e.text.includes('#EXTM3U')));
  if (pl.length === 0) return null;
  const media = pl.filter((e) => e.text.includes('#EXTINF'));
  const chosen = (media.length ? media : pl)[(media.length || pl.length) - 1];
  const bases = entries.filter((e) => (e.kind === 'fetch' || e.kind === 'xhr') && /\.m3u8/i.test(e.url || ''));
  const baseUrl = bases.length ? bases[bases.length - 1].url : '';
  return { text: chosen.text, baseUrl, decrypted: chosen.kind === 'decrypt' };
}

async function openSession(postId, slug, ep, sv, type) {
  const embedUrl = await getEmbedUrl(postId, ep, sv, type);
  const watchUrl = `${HHPANDA}/watch-${slug}/tap-${ep}-sv${sv}.html`;
  const context = await getBrowserContext();
  const page = await context.newPage();
  const sid = 's' + (state.sidSeq++);

  // The embed refuses non-iframe loads; give it the watch page as referer.
  await page.goto(embedUrl, { referer: watchUrl, waitUntil: 'domcontentloaded', timeout: 60000 });

  const session = { page, embedUrl, watchUrl, lastUsed: Date.now(), sid };
  state.sessions.set(sid, session);
  return session;
}

async function waitForPlaylist(session, timeoutMs = 75000) {
  const t0 = Date.now();
  let reloaded = 0;
  while (Date.now() - t0 < timeoutMs) {
    const entries = await readLog(session.page);
    const playlist = pickPlaylist(entries);
    if (playlist) return playlist;

    // Auto-dismiss the anti-devtools interstitial by reloading a few times.
    if (reloaded < 4) {
      let blocked = false;
      try {
        blocked = await session.page.evaluate(() => document.body && document.body.innerText.includes('công cụ nhà phát triển'));
      } catch (e) {}
      if (blocked) {
        reloaded++;
        console.log(`[resolver ${session.sid}] anti-devtools block -> reload #${reloaded}`);
        await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('timed out waiting for the decrypted playlist');
}

function rewritePlaylist(text, baseUrl, sid) {
  const abs = (u) => { try { return new URL(u, baseUrl || undefined).href; } catch (e) { return u; } };
  const seg = (u) => `/seg?sid=${sid}&u=${encodeURIComponent(abs(u))}`;
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        return t.replace(/URI="([^"]+)"/g, (_, u) => `URI="${seg(u)}"`);
      }
      return seg(t);
    })
    .join('\n');
}

async function relaySegment(session, url) {
  session.lastUsed = Date.now();
  const b64 = await session.page.evaluate(async (u) => {
    const r = await fetch(u);
    if (!r.ok) return 'ERR:' + r.status;
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  }, url);
  if (b64.startsWith('ERR:')) throw new Error('segment fetch failed: ' + b64);
  return Buffer.from(b64, 'base64');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function handleMaster(req, res, q) {
  const postId = q.get('post'), slug = q.get('slug') || '', ep = q.get('ep'), sv = q.get('sv'), type = q.get('type');
  if (!postId || !ep || !sv || !type) return sendJson(res, 400, { error: 'post, ep, sv, type required' });
  try {
    const session = await openSession(postId, slug, ep, sv, type);
    const playlist = await waitForPlaylist(session);
    const out = rewritePlaylist(playlist.text, playlist.baseUrl, session.sid);
    console.log(`[resolver ${session.sid}] serving playlist (${playlist.decrypted ? 'decrypted' : 'plain'}, base=${(playlist.baseUrl || '').slice(0, 90)}...)`);
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(out);
  } catch (e) {
    console.error('[resolver] master failed:', String(e));
    sendJson(res, 502, { error: String(e.message || e) });
  }
}

async function handleSeg(req, res, q) {
  const sid = q.get('sid'), u = q.get('u');
  const session = state.sessions.get(sid);
  if (!session) return sendJson(res, 404, { error: 'unknown session (resolver restarted?)' });
  try {
    const bytes = await relaySegment(session, u);
    res.writeHead(200, {
      'Content-Type': 'video/mp2t',
      'Content-Length': bytes.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(bytes);
  } catch (e) {
    console.error('[resolver] seg failed:', String(e));
    sendJson(res, 502, { error: String(e.message || e) });
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const q = u.searchParams;
  try {
    if (u.pathname === '/status') {
      return sendJson(res, 200, {
        ok: true, port: PORT, headless: HEADLESS, sessions: [...state.sessions.keys()],
        lan: Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}`),
      });
    }
    if (u.pathname === '/master') return await handleMaster(req, res, q);
    if (u.pathname === '/seg') return await handleSeg(req, res, q);
    if (u.pathname === '/probe') {
      const s = state.sessions.get(q.get('sid'));
      if (!s) return sendJson(res, 404, { error: 'unknown sid' });
      return sendJson(res, 200, { log: (await readLog(s.page)).slice(-60) });
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
});

// reap idle sessions
setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of state.sessions) {
    if (now - s.lastUsed > SESSION_IDLE_MS) {
      console.log(`[resolver ${sid}] idle -> close`);
      s.page.close().catch(() => {});
      state.sessions.delete(sid);
    }
  }
}, 60000);

server.listen(PORT, () => {
  const lans = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}`);
  console.log(`[resolver] listening on :${PORT} (LAN: ${lans.join(', ') || 'n/a'})`);
  console.log('[resolver] keep this running while watching in Nuvio');
});
