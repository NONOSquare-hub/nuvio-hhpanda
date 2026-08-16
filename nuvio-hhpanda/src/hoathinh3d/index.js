import { SERVERS, RESOLVER_BASE } from './constants.js';
import { getTmdbTitles, getTmdbSeasonName, findSitePost } from './utils.js';

async function getStreams(tmdbId, mediaType = 'tv', season = 1, episode = 1) {
  try {
    if (mediaType === 'movie') return [];

    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || (!titles.en && !titles.vi && !titles.orig)) return [];

    const seasonName = season > 1 ? await getTmdbSeasonName(tmdbId, season) : null;
    const post = await findSitePost(titles, season, seasonName);
    if (!post) return [];

    const epNum = Number(episode || 1);
    const streams = SERVERS.map((server) => ({
      name: `HoatHinh3D [${server.label}]`,
      title: `${post.title} - Tap ${epNum}`,
      url: `${RESOLVER_BASE}/master?post=${post.postId}&slug=${encodeURIComponent(post.slug)}&ep=${epNum}&sv=${server.sv}&type=${server.type}`,
      quality: '1080p',
      type: 'm3u8',
    }));

    return streams;
  } catch (e) {
    return [];
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
}

module.exports = { getStreams };
