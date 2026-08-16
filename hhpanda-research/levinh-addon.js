require("dotenv").config();

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const {
  getCatalog,
  getMeta,
  getEpisodes,
  normalizeSearch,
} = require("./src/scraper");

const PORT = Number(process.env.PORT || 7000);

const manifest = {
  id: "com.example.hhpanda.catalog",
  version: "1.0.0",
  name: "HHPANDA Catalog",
  description:
    "Catalog, metadata and episode links for HHPANDA pages. This addon does not extract or bypass protected video streams.",
  resources: ["catalog", "meta"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "hhpanda_new",
      name: "HHPANDA • Mới cập nhật",
      extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }]
    },
    {
      type: "series",
      id: "hhpanda_animation",
      name: "HHPANDA • Hoạt hình",
      extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }]
    }
  ],
  idPrefixes: ["hhpanda:"]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
  const search = normalizeSearch(args.extra?.search || "");
  const skip = Number(args.extra?.skip || 0);

  const items = await getCatalog(args.id, { search, skip });
  return {
    metas: items,
    cacheMaxAge: Number(process.env.CACHE_SECONDS || 300)
  };
});

builder.defineMetaHandler(async (args) => {
  if (!args.id.startsWith("hhpanda:")) return { meta: null };

  const url = args.id.slice("hhpanda:".length);
  const meta = await getMeta(url);

  if (!meta) return { meta: null };

  // Episode list is represented as Stremio series videos.
  meta.videos = await getEpisodes(url);
  return {
    meta,
    cacheMaxAge: Number(process.env.CACHE_SECONDS || 300)
  };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`HHPANDA Stremio addon running on http://127.0.0.1:${PORT}/manifest.json`);
