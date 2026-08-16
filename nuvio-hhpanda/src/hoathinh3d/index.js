import { SERVERS, RESOLVER_BASE } from './constants.js';
import { getTmdbTitles, getTmdbSeasonName, findSitePost, serverHasEmbed } from './utils.js';

async function getStreams(tmdbId, mediaType = 'tv', season = 1, episode = 1) {
  try {
    if (mediaType === 'movie') return [];

    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || !titles.en) return [];

    const seasonName = season > 1 ? await getTmdbSeasonName(tmdbId, season) : null;
    const post = await findSitePost(titles, season, seasonName);
    if (!post) return [];

    const streams = [];
    for (const server of SERVERS) {
      const has = await serverHasEmbed(post.postId, episode, server.type, server.sv);
      if (!has) continue;
      streams.push({
        name: `HoatHinh3D [${server.label}]`,
        title: `${post.title} - Tap ${episode}`,
        url: `${RESOLVER_BASE}/master?post=${post.postId}&slug=${encodeURIComponent(post.slug)}&ep=${episode}&sv=${server.sv}&type=${server.type}`,
        quality: '1080p',
        type: 'm3u8',
      });
    }
    return streams;
  } catch (e) {
    return [];
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
}

module.exports = { getStreams };
