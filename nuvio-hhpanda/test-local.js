// Local logic test for the hhpanda provider (no Nuvio needed)
const { getStreams } = require('./providers/hhpanda.js');
const KEY = '1865f43a0549ca50d341dd9ab8b29f49';

(async () => {
  const show = await (await fetch(`https://api.themoviedb.org/3/tv/123542?api_key=${KEY}`)).json();
  console.log('LINK CLICK seasons:', (show.seasons || []).map((s) => `S${s.season_number}:${s.name}(${s.episode_count}ep)`).join(' | '));

  // find the Bridon Arc season number
  const bridon = (show.seasons || []).find((s) => /bridon/i.test(s.name || ''));
  const sn = bridon ? bridon.season_number : 1;
  console.log('testing season', sn, '->', bridon && bridon.name);

  const streams = await getStreams('123542', 'tv', sn, 6);
  console.log('streams:', JSON.stringify(streams, null, 1));

  // a plain season-1 show: Mu Shen Ji
  const s2 = await (await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${KEY}&query=${encodeURIComponent('Mu Shen Ji')}`)).json();
  const msj = (s2.results || [])[0];
  if (msj) {
    console.log('\nMu Shen Ji tmdb id:', msj.id, msj.name);
    const st2 = await getStreams(String(msj.id), 'tv', 1, 1);
    console.log('streams:', JSON.stringify(st2, null, 1));
  }

  const none = await getStreams('999999999', 'tv', 1, 1);
  console.log('\nbogus id ->', JSON.stringify(none));
})();
