import { SERVERS, RESOLVER_BASE } from './constants.js';
import { getTmdbTitles, getTmdbSeasonName, findHhpandaPost, serverHasEmbed } from './utils.js';

// Nuvio entry point: tmdbId -> streams served by the local hhpanda resolver.
async function getStreams(tmdbId, mediaType = 'tv', season = 1, episode = 1) {
  try {
    if (mediaType === 'movie') return [];

    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || !titles.en) return [];

    const seasonName = season > 1 ? await getTmdbSeasonName(tmdbId, season) : null;
    const post = await findHhpandaPost(titles, season, seasonName);
    if (!post) return [];

    const streams = [];
    for (const server of SERVERS) {
      const has = await serverHasEmbed(post.postId, episode, server.type, server.sv);
      if (!has) continue;
      streams.push({
        name: `HHPanda [${server.label}]`,
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

module.exports = { getStreams };
