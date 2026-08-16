# Kế hoạch: Tạo Nuvio provider cho hhpanda.st (Vietsub + Thuyết minh) — chi phí 0đ

## Kiến trúc đã nghiên cứu
- **Nuvio addon = provider JS** (không phải Stremio addon): module CommonJS xuất `getStreams(tmdbId, mediaType, season, episode)` → trả mảng `[{name, title, url, quality, headers}]`. Chạy trên Hermes → không dùng async/await trong file build; viết ở `src/<tên>/` rồi `node build.js <tên>` transpile ra `providers/<tên>.js`. cheerio được bundle sẵn theo mẫu của [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers).
- **hhpanda.st** là WordPress, REST API mở. Chuỗi khớp phim đã kiểm chứng: tên tiếng Anh (TMDB) → slug → `GET /wp-json/wp/v2/tags?slug=<slug>` → tag ID → `GET /wp-json/wp/v2/posts?tags=<id>` → post (slug, "Tập N/M", chất lượng). URL xem: `https://hhpanda.st/watch-<slug>/tap-<N>-sv{1|2}.html`.
- **Chi phí: 0đ** — provider trả link HTTP trực tiếp (m3u8/mp4) nên không cần debrid; GitHub/TMDB/Nuvio/Node đều free.

## Bước 0 — Khám phá API player bằng BrowserOS neo
Mở trang watch (vd. `/watch-nguoi-dai-dien-thoi-gian-thu-do-anh-quoc/tap-6-sv1.html`) trong BrowserOS neo, tên session `hhpanda-addon`, quan sát network để xác định:
- Endpoint tải player (dự kiến POST `admin-ajax.php` với action nào đó) — tham số, response JSON
- URL media cuối (.m3u8/.mp4) và headers bắt buộc (Referer/UA)
- Subtitle là soft-sub (đính kèm m3u8) hay hardsub; xác nhận link m3u8 tải được kèm Referer
- Định dạng URL của phim lẻ (`halim_movie_formality: single_movies`) cho supportedTypes movie
- Nếu MCP browseros-neo chưa kết nối: báo user bật BrowserOS neo (không tự đổi tool khác)

## Bước 1 — Scaffold repo `nuvio-hhpanda-provider`
Tạo `C:\Users\travi\.zcode\workspace\default\nuvio-hhpanda-provider`, lấy cấu trúc build từ template branch của yoruix/nuvio-providers (package.json, build.js), tạo:
- `src/hhpanda/constants.js` — `BASE_URL = "https://hhpanda.st"`, FALLBACK_DOMAINS (hhpanda.tv, hhpanda.gg...), `TMDB_API_KEY` (public key như provider khác), `DEFAULT_HEADERS` (UA Chrome desktop)
- `src/hhpanda/utils.js` — `getTmdbShowTitle(tmdbId, mediaType)` (GET `api.themoviedb.org/3/...`, trả `name`/`original_name`), `slugify()` (thường hóa, bỏ `: ' &`)
- `src/hhpanda/extractor.js` — `findPost(title, season)`: tag-slug lookup + biến thể "season N" + parse "Phần N" khi nhiều post; `resolveStream(postSlug, ep, sv)`: gọi đúng player API tìm được ở Bước 0, bóc URL m3u8/mp4
- `src/hhpanda/index.js` — `getStreams`: lấy title TMDB → findPost → resolve cả sv1 (Vietsub) + sv2 (Thuyết minh) → trả 2 stream `{name: "HHPanda [V1 Vietsub]" / "[V2 Thuyết minh]", url, quality (FULL HD 4K → "1080p"), headers: {Referer: BASE_URL, UA}}`; mọi nhánh lỗi đều `return []`

## Bước 2 — Build & test logic (Node 18+)
- `node build.js hhpanda` → `providers/hhpanda.js`; kiểm tra không còn async/await (Hermes)
- Script test local: gọi `getStreams` với tmdbId "Link Click: Bridon Arc" (tv s1 e6) + 1 phim đang chiếu nhiều mùa; assert có stream .m3u8/.mp4 hợp lệ

## Bước 3 — Test thật trong Nuvio
`npm start` (local server) → Nuvio debug APK → Plugin Tester load `http://<LAN-IP>:3000/providers/hhpanda.js` → phát thử 1 tập cả 2 server

## Bước 4 — Publish GitHub + cài vào Nuvio
- Thêm entry `manifest.json`: `{id: "hhpanda", name: "HHPanda (Donghua Vietsub)", supportedTypes: ["tv","movie"], contentLanguage: ["vi"], formats: ["m3u8"], filename: "providers/hhpanda.js", enabled: true, supportsExternalPlayer: true}`
- `git init` + push repo mới trên GitHub (dùng `gh`)
- Cài: Nuvio → Settings → Content & Discovery → Addons → paste raw manifest URL
- README: hướng dẫn sửa `BASE_URL` + rebuild khi site đổi domain

## Rủi ro & dự phòng
- Player API cần nonce/token → extractor fetch trang watch trước rồi mới gọi endpoint
- Domain đổi liên tục → BASE_URL + fallbacks tách riêng trong constants.js, sửa 1 dòng
- Season donghua mỗi mùa 1 post riêng → thử slug biến thể; không khớp thì trả [] thay vì crash
- Hermes ≠ Node → chỉ dùng fetch + cheerio, không dùng built-in Node

Nguồn: [DOCUMENTATION.md](https://github.com/yoruix/nuvio-providers/blob/template/DOCUMENTATION.md), [provider hianime](https://github.com/yoruix/nuvio-providers/tree/main/src/hianime), [Nuvio dùng free không cần debrid](https://www.reddit.com/r/Nuvio/comments/1rak0ho/nuvio_is_becoming_my_new_go_to/), [thảo luận chi phí debrid](https://www.reddit.com/r/Nuvio/comments/1rpnie9/nuvio_is_a_nice_looking_little_app_but_if_you/), [hướng dẫn add-on Nuvio](https://www.reddit.com/r/Nuvio/comments/1rargj7/how_to_add_plugins_add_ons_to_nuvio/).