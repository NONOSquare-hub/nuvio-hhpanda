/**
 * hhpanda - Built from src/hhpanda/
 * Generated: 2026-08-16T14:26:52.662Z
 */
var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/hhpanda/constants.js
var HHPANDA_BASE = "https://hhpanda.st";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var RESOLVER_BASE = "http://192.168.1.20:7777";
var SERVERS = [
  { sv: 1, type: "tiktik", label: "V1 Vietsub" },
  { sv: 2, type: "pro", label: "V2 Thuyet minh" }
];
var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
  "Referer": "https://hhpanda.st/"
};

// src/hhpanda/utils.js
function fetchText(url, headers) {
  return __async(this, null, function* () {
    const resp = yield fetch(url, { headers: __spreadValues(__spreadValues({}, DEFAULT_HEADERS), headers || {}) });
    if (!resp.ok)
      throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.text();
  });
}
function fetchJson(url, headers) {
  return __async(this, null, function* () {
    return JSON.parse(yield fetchText(url, headers));
  });
}
function resolveTmdbId(id, mediaType) {
  return __async(this, null, function* () {
    let cleanId = String(id || "").trim();
    if (cleanId.includes(":")) {
      cleanId = cleanId.split(":")[0];
    }
    if (cleanId.startsWith("tmdb:")) {
      cleanId = cleanId.replace("tmdb:", "");
    }
    if (cleanId.startsWith("tt")) {
      try {
        const res = yield fetchJson(`https://api.themoviedb.org/3/find/${cleanId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
        const list = mediaType === "movie" ? res.movie_results : res.tv_results;
        if (list && list.length > 0) {
          return list[0].id;
        }
      } catch (e) {
      }
    }
    return cleanId;
  });
}
function getTmdbTitles(rawTmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      const tmdbId = yield resolveTmdbId(rawTmdbId, mediaType);
      const kind = mediaType === "movie" ? "movie" : "tv";
      const base = `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${TMDB_API_KEY}`;
      const en = yield fetchJson(base);
      let vi = null;
      try {
        const viData = yield fetchJson(base + "&language=vi");
        vi = viData.name || viData.title || null;
      } catch (e) {
      }
      return {
        tmdbId,
        en: en.name || en.title || en.original_title || en.original_name || null,
        orig: en.original_name || en.original_title || null,
        vi
      };
    } catch (e) {
      return null;
    }
  });
}
function getTmdbSeasonName(rawTmdbId, season) {
  return __async(this, null, function* () {
    if (!season || season < 1)
      return null;
    try {
      const tmdbId = yield resolveTmdbId(rawTmdbId, "tv");
      const data = yield fetchJson(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`);
      return data.name || null;
    } catch (e) {
      return null;
    }
  });
}
function slugify(title) {
  return String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[''.`]/g, "").replace(/&/g, " ").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
function findHhpandaPost(titles, season, seasonName) {
  return __async(this, null, function* () {
    const bases = [titles.en, titles.vi, titles.orig].filter(Boolean);
    const candidates = [];
    for (const b of bases) {
      if (seasonName)
        candidates.push(`${b} ${seasonName}`);
      if (season && season > 1)
        candidates.push(`${b} season ${season}`);
      candidates.push(b);
    }
    if (seasonName)
      candidates.push(seasonName);
    const seen = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      const slug = slugify(candidate);
      if (!slug || seen.has(slug))
        continue;
      seen.add(slug);
      try {
        const tags = yield fetchJson(`${HHPANDA_BASE}/wp-json/wp/v2/tags?slug=${encodeURIComponent(slug)}`);
        if (!Array.isArray(tags) || tags.length === 0)
          continue;
        const posts = yield fetchJson(`${HHPANDA_BASE}/wp-json/wp/v2/posts?tags=${tags[0].id}&per_page=5`);
        if (!Array.isArray(posts) || posts.length === 0)
          continue;
        const post = posts[0];
        return {
          postId: post.id,
          slug: post.slug,
          title: post.title && post.title.rendered || candidate
        };
      } catch (e) {
      }
    }
    return null;
  });
}
function serverHasEmbed(postId, epTag, type, sv) {
  return __async(this, null, function* () {
    try {
      const html = yield fetchText(
        `${HHPANDA_BASE}/player/player.php?action=dox_ajax_player&post_id=${postId}&chapter_st=tap-${epTag}&type=${type}&sv=${sv}`
      );
      return /<iframe[^>]+src="/i.test(html);
    } catch (e) {
      return false;
    }
  });
}

// src/hhpanda/index.js
function getStreams(tmdbId, mediaType = "tv", season = 1, episode = 1) {
  return __async(this, null, function* () {
    try {
      if (mediaType === "movie")
        return [];
      const titles = yield getTmdbTitles(tmdbId, mediaType);
      if (!titles || !titles.en)
        return [];
      const seasonName = season > 1 ? yield getTmdbSeasonName(tmdbId, season) : null;
      const post = yield findHhpandaPost(titles, season, seasonName);
      if (!post)
        return [];
      const streams = [];
      for (const server of SERVERS) {
        const has = yield serverHasEmbed(post.postId, episode, server.type, server.sv);
        if (!has)
          continue;
        streams.push({
          name: `HHPanda [${server.label}]`,
          title: `${post.title} - Tap ${episode}`,
          url: `${RESOLVER_BASE}/master?post=${post.postId}&slug=${encodeURIComponent(post.slug)}&ep=${episode}&sv=${server.sv}&type=${server.type}`,
          quality: "1080p",
          type: "m3u8"
        });
      }
      return streams;
    } catch (e) {
      return [];
    }
  });
}
module.exports = { getStreams };
