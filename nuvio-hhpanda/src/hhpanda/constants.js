export const HHPANDA_BASE = 'https://hhpanda.st';
export const HHPANDA_FALLBACKS = ['https://hhpanda.tv', 'https://hhpanda.gg'];

// Public TMDB v3 key (same one shipped with every provider in nuvio-providers)
export const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';

// Local resolver (resolver/server.js) must be running on this machine while watching.
// Run `node tools/set-resolver-ip.mjs` to fill in your PC's LAN IP automatically.
export const RESOLVER_BASE = 'http://192.168.1.20:7777';

// Which HHPanda servers to offer: sv1 = Vietsub (type tiktik), sv2 = Thuyet minh (type pro)
export const SERVERS = [
  { sv: 1, type: 'tiktik', label: 'V1 Vietsub' },
  { sv: 2, type: 'pro', label: 'V2 Thuyet minh' },
];

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'Referer': 'https://hhpanda.st/',
};
