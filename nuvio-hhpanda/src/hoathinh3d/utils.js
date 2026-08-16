import { SITE_BASE, TMDB_API_KEY, DEFAULT_HEADERS } from './constants.js';

export async function fetchText(url, headers) {
  const resp = await fetch(url, { headers: { ...DEFAULT_HEADERS, ...(headers || {}) } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

export async function fetchJson(url, headers) {
  return JSON.parse(await fetchText(url, headers));
}

export async function resolveTmdbId(id, mediaType) {
  let cleanId = String(id || '').trim();
  if (cleanId.includes(':')) {
    cleanId = cleanId.split(':')[0];
  }
  if (cleanId.startsWith('tmdb:')) {
    cleanId = cleanId.replace('tmdb:', '');
  }
  if (cleanId.startsWith('tt')) {
    try {
      const res = await fetchJson(`https://api.themoviedb.org/3/find/${cleanId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      const list = mediaType === 'movie' ? res.movie_results : res.tv_results;
      if (list && list.length > 0) {
        return list[0].id;
      }
    } catch (e) {}
  }
  return cleanId;
}

export async function getTmdbTitles(rawTmdbId, mediaType) {
  try {
    const tmdbId = await resolveTmdbId(rawTmdbId, mediaType);
    const kind = mediaType === 'movie' ? 'movie' : 'tv';
    const base = `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const en = await fetchJson(base);
    let vi = null;
    try {
      const viData = await fetchJson(base + '&language=vi');
      vi = viData.name || viData.title || null;
    } catch (e) {}
    return {
      tmdbId,
      en: en.name || en.title || en.original_title || en.original_name || null,
      orig: en.original_name || en.original_title || null,
      vi,
    };
  } catch (e) {
    return null;
  }
}

export async function getTmdbSeasonName(rawTmdbId, season) {
  if (!season || season < 1) return null;
  try {
    const tmdbId = await resolveTmdbId(rawTmdbId, 'tv');
    const data = await fetchJson(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`);
    return data.name || null;
  } catch (e) {
    return null;
  }
}

export function slugify(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''.`]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export async function findSitePost(titles, season, seasonName) {
  const bases = [titles.en, titles.vi, titles.orig].filter(Boolean);
  const candidates = [];
  for (const b of bases) {
    if (seasonName) candidates.push(`${b} ${seasonName}`);
    if (season && season > 1) candidates.push(`${b} season ${season}`);
    candidates.push(b);
  }
  if (seasonName) candidates.push(seasonName);

  const seen = new Set();
  for (const candidate of candidates) {
    const slug = slugify(candidate);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    try {
      const tags = await fetchJson(`${SITE_BASE}/wp-json/wp/v2/tags?slug=${encodeURIComponent(slug)}`);
      if (!Array.isArray(tags) || tags.length === 0) continue;
      const posts = await fetchJson(`${SITE_BASE}/wp-json/wp/v2/posts?tags=${tags[0].id}&per_page=5`);
      if (!Array.isArray(posts) || posts.length === 0) continue;
      const post = posts[0];
      return {
        postId: post.id,
        slug: post.slug,
        title: (post.title && post.title.rendered) || candidate,
      };
    } catch (e) {
      // try next candidate
    }
  }
  return null;
}
