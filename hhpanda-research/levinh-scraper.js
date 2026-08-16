const cheerio = require("cheerio");

const BASE = (process.env.HHPANDA_BASE || "https://hhpanda.st").replace(/\/+$/, "");
const UA = process.env.USER_AGENT || "Mozilla/5.0 (compatible; HHPANDA-Stremio-Addon/1.0)";

const cache = new Map();

function normalizeSearch(s) {
  return String(s || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function absolute(href) {
  if (!href) return null;
  try { return new URL(href, BASE).href; } catch { return null; }
}

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

async function fetchHTML(url) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expires > now) return cached.html;

  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const html = await res.text();
  cache.set(url, {
    html,
    expires: now + Number(process.env.CACHE_SECONDS || 300) * 1000
  });
  return html;
}

/*
 * HHPANDA changes its HTML periodically. These selectors intentionally
 * use broad link/card heuristics rather than relying on one CSS class.
 * The addon only consumes public page HTML and returns page links.
 */
function extractCards(html) {
  const $ = cheerio.load(html);
  const out = new Map();

  $("a[href]").each((_, el) => {
    const href = absolute($(el).attr("href"));
    const text = cleanText($(el).text());
    if (!href || !text) return;

    const u = new URL(href);
    if (!u.hostname.endsWith("hhpanda.st")) return;
    if (!/\/(phim|watch-|xem-|anime|hoat-hinh)/i.test(u.pathname)) return;
    if (text.length < 2 || text.length > 180) return;

    // Avoid navigation links.
    if (/^(trang chủ|home|đăng nhập|login|next|previous|xem thêm)$/i.test(text)) return;

    out.set(href, {
      id: `hhpanda:${href}`,
      type: "series",
      name: text,
      posterShape: "poster"
    });
  });

  return [...out.values()];
}

async function getCatalog(catalogId, { search = "", skip = 0 } = {}) {
  const path = catalogId === "hhpanda_animation"
    ? "/the-loai/hoat-hinh"
    : "/moi-cap-nhat";

  // HHPANDA uses paginated category pages. We fetch the requested page
  // and let Stremio request subsequent pages using extra.skip.
  const page = Math.floor(skip / 20) + 1;
  const url = page <= 1 ? `${BASE}${path}` : `${BASE}${path}?page=${page}`;

  const html = await fetchHTML(url);
  let metas = extractCards(html);

  if (search) {
    const q = search.toLocaleLowerCase("vi");
    metas = metas.filter(x => x.name.toLocaleLowerCase("vi").includes(q));
  }

  return metas.slice(0, 20);
}

async function getMeta(pageUrl) {
  const html = await fetchHTML(pageUrl);
  const $ = cheerio.load(html);

  const title =
    cleanText($("h1").first().text()) ||
    cleanText($("meta[property='og:title']").attr("content")) ||
    cleanText($("title").text());

  const poster =
    absolute($("meta[property='og:image']").attr("content")) ||
    absolute($("img").first().attr("src"));

  const background = poster;
  const description =
    cleanText($("meta[name='description']").attr("content")) ||
    cleanText($(".description, .desc, .film-description").first().text());

  return {
    id: `hhpanda:${pageUrl}`,
    type: "series",
    name: title || pageUrl,
    poster,
    background,
    description,
    posterShape: "poster",
    links: [{
      name: "Nguồn HHPANDA",
      category: "other",
      url: pageUrl
    }]
  };
}

async function getEpisodes(pageUrl) {
  const html = await fetchHTML(pageUrl);
  const $ = cheerio.load(html);
  const videos = [];

  $("a[href]").each((_, el) => {
    const href = absolute($(el).attr("href"));
    const text = cleanText($(el).text());
    if (!href || !text) return;

    // Recognize episode links by common Vietnamese labels.
    const m =
      text.match(/(?:tập|tap|episode|ep\\.?)[\\s._-]*(\\d+)/i) ||
      href.match(/(?:tap|t?p)[-_/]*(\\d+)/i);

    if (!m) return;

    const episode = Number(m[1]);
    if (!Number.isFinite(episode)) return;

    videos.push({
      id: `hhpanda:${href}`,
      title: text,
      season: 1,
      episode,
      released: undefined,
      thumbnail: undefined,
      overview: `Trang tập ${episode} trên HHPANDA`,
      // This is deliberately a page deep-link, not a video-stream URL.
      // Stremio cannot play it as a stream; it is kept as metadata for navigation.
      sourcePage: href
    });
  });

  const unique = new Map(videos.map(v => [`${v.season}:${v.episode}:${v.id}`, v]));
  return [...unique.values()].sort((a, b) => a.episode - b.episode);
}

module.exports = {
  getCatalog,
  getMeta,
  getEpisodes,
  normalizeSearch
};
