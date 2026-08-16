// Survey hhpanda player endpoints across shows/servers to map embed hosts
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function j(url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || 'https://hhpanda.st/' } });
  return { status: r.status, text: await r.text() };
}

(async () => {
  // 1) get some post ids from wp-json (first page + search a big show)
  const posts = await j('https://hhpanda.st/wp-json/wp/v2/posts?per_page=8&orderby=modified');
  const list = JSON.parse(posts.text);
  for (const p of list) {
    const pid = p.id;
    const ep = (p._halim_metabox_options && p._halim_metabox_options.halim_episode) || '';
    for (const type of ['tiktik', 'pro']) {
      const sv = type === 'tiktik' ? 1 : 2;
      const r = await j(`https://hhpanda.st/player/player.php?action=dox_ajax_player&post_id=${pid}&chapter_st=tap-1&type=${type}&sv=${sv}`, 'https://hhpanda.st/');
      const ifr = (r.text.match(/src="([^"]*)"/) || [])[1] || r.text.slice(0, 80);
      console.log(pid, type, ep, '->', r.status, ifr);
    }
  }
})();
