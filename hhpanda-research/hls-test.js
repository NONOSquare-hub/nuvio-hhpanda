// Probe streamfree.vip /hls/ endpoint strictness
const fs = require('fs');
const p = fs.readFileSync('embed4.html', 'utf8');
const g = (n) => { const m = p.match(new RegExp('data-' + n + '="([^"]*)"')); return m ? m[1] : ''; };
const nonce = g('nonce');
const uid = 'e212aa99-e5c7-4607-9e23-72ad68c2c403';
const ct = Date.now();
const q = 'vid=4bVGddhz&dt=1000&snonce=' + encodeURIComponent(nonce) +
  '&cnonce=deadbeef&hash=deadbeef&uid=' + uid + '&ct=' + ct;
const urls = [
  'https://streamfree.vip/hls/4bVGddhz.m3u8?' + q,
  'https://streamfree.vip/hls/4bVGddhz.m3u8', // bare
];
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Referer': 'https://streamfree.vip/embed/vt/4bVGddhz',
  'Cookie': 'uid=' + uid,
};
(async () => {
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: H });
      const t = await r.text();
      console.log('###', r.status, u.slice(0, 90) + '...');
      console.log(t.slice(0, 600).replace(/\n/g, '\\n'));
    } catch (e) { console.log('ERR', e.message); }
  }
})();
