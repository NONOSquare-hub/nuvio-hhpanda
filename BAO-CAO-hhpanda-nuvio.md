# Báo cáo kỹ thuật: Nghiên cứu tạo Nuvio addon cho hhpanda.st

**Ngày:** 2026-08-16
**Mục tiêu:** Tạo provider cho app Nuvio phát phim từ hhpanda.st (donghua Vietsub/Thuyết minh)
**Kết luận nhanh:** Phần каталог/khớp phim làm được hoàn toàn bằng HTTP thuần. Phần stream bị hệ thống bảo vệ nhiều tầng của player `streamfree.vip` chặn — provider Nuvio (JS thuần trên Hermes) không thể tự giải mã. Muốn làm tiếp phải đổi kiến trúc sang "resolver local" (Chromium thật chạy trên PC). Chi tiết bên dưới.

---

## 1. Kiến trúc addon Nuvio (đã xác minh)

Nuvio **không** dùng addon kiểu Stremio (manifest + catalog endpoint). Provider Nuvio là một **file JavaScript** xuất hàm:

```js
async function getStreams(tmdbId, mediaType, season, episode) {
  // return [{ name, title, url, quality, headers, type, subtitles? }]
}
```

- Chạy trên **Hermes engine** (React Native) → file build cuối **không được chứa async/await**; phát triển ở `src/<tên>/` với ES modules rồi `node build.js <tên>` transpile (generator) ra `providers/<tên>.js`.
- Repo chuẩn: `manifest.json` (mảng đăng ký provider: id, name, filename, supportedTypes, contentLanguage, formats...) + thư mục `providers/`.
- Cài vào app: Nuvio → Settings → Content & Discovery → Addons → dán **raw URL của manifest.json** (vd. `https://raw.githubusercontent.com/<user>/<repo>/main/manifest.json`).
- Provider nhận mỗi `tmdbId` → phải tự gọi TMDB API để lấy tên tiếng Anh (các provider trong repo tham khảo nhúng public API key v3 trong `constants.js`).
- Test: `npm start` (local server) → Plugin Tester trong debug APK.
- Repo tham khảo: https://github.com/yoruix/nuvio-providers (branch `template` = khung dự án; branch `main` = 16 provider thật, xem `src/hianime` làm mẫu).

**Chi phí: 0đ** — provider trả link HTTP trực tiếp nên không cần debrid (chỉ torrent mới cần).

## 2. hhpanda.st — phần KHẢ THI (đã kiểm chứng bằng request thật)

Site là WordPress, REST API mở hoàn toàn.

### 2.1. Khớp phim từ TMDB
Mỗi post phim có meta `_halim_metabox_options` (hiện trong `/wp-json/wp/v2/posts`): `halim_original_title` (tên tiếng Anh), `halim_movie_formality` (tv_series/single_movies), `halim_movie_status`, `halim_episode` ("Tập 6/6"), `halim_quality`.

Chuỗi khớp đã chạy OK:
```
TMDB: GET /3/tv/{id}?api_key=...  →  name (tiếng Anh)
slugify("Link Click: Bridon Arc") → "link-click-bridon-arc"
GET https://hhpanda.st/wp-json/wp/v2/tags?slug=link-click-bridon-arc   → {id: 1469}
GET https://hhpanda.st/wp-json/wp/v2/posts?tags=1469                  → post (slug, meta)
```

### 2.2. Trang chi tiết & tập
- Trang phim: `https://hhpanda.st/<slug>`
- Trang xem: `https://hhpanda.st/watch-<slug>/tap-<N>-sv<1|2>.html` (sv1=Vietsub, sv2=Thuyết minh)
- Markup tập: `a[data-post-id][data-ep="tap-6"][data-sv="1"]`; nút server: `data-type="tiktik"` (1080P V1) / `data-type="pro"` (1080P V2).

### 2.3. Endpoint player (quan trọng nhất)
Trang watch gọi (GET, trả về HTML chứa iframe):
```
https://hhpanda.st/player/player.php?action=dox_ajax_player&post_id=<id>&chapter_st=tap-<N>&type=tiktik|pro&sv=1|2
```
Kết quả khảo sát 8 phim (xem `hhpanda-research/survey.js`):
- V1 (`tiktik`, sv1) → luôn `https://streamfree.vip/embed/vt/<videoId>`
- V2 (`pro`, sv2) → `https://streamfree.vip/embed/v/<videoId>` (một số phim không có V2 → trả về ảnh `not-found.jpg`)
- Không cần cookie/login; headers chỉ cần UA browser + Referer `https://hhpanda.st/`.

**Tức là: từ tmdbId → embed URL chỉ mất ~4 request HTTP thuần. Đoạn này viết provider là xong trong 1–2 buổi.**

## 3. streamfree.vip — bức tường (đã deobfuscate)

Player là app React + JWPlayer, bundle bị obfuscate bằng javascript-obfuscator (string array + RC4 + base64, alias `a0_0x24a9`; webpack 2 chunk: `app.*.js` + `31.*.js` — entry chờ chunk 31). Service worker `/sw.js` cũng obfuscate riêng.

Các tầng bảo vệ theo thứ tự:

1. **Referer/iframe**: embed từ chối nếu không có Referer hhpanda; kiểm tra `window.self !== window.top` (chỉ phát trong iframe) — thông báo "video này chỉ có thể phát trong iframe. (-2)".
2. **Trang chống devtools** `/devtool?vid=<id>` ("vui lòng tắt công cụ nhà phát triển"). **Lưu ý: CDP/automation KHÔNG bị chặn** — đã phát thành công bằng in-app browser chạy CDP.
3. **Dữ liệu đầu vào**: `#hrm-player` chứa `data-id`, `data-nonce`, `data-checksum`, `data-uip`, `data-time`; thẻ `<meta name="bytecode">` chứa blob ~6KB mã hóa **Base65 tự chế** (bảng chữ `A-Za-z0-9~-_`, có kiểm tra "Invalid MAGIC").
4. **URL HLS ký bằng fingerprint** (deobfuscate được luồng chính):
   ```
   /hls/<computed>.m3u8?vid=..&dt=..&snonce=..&cnonce=..&hash=..&uid=..&ct=..[&fc=..]
   ```
   - `hash` = hex-hash (thư viện hash bundle) của `[fingerprintComponents[13], salt].join('')`
   - `cnonce` tính từ kết quả thu thập fingerprint (~500 thành phần — canvas, audio, font…)
   - Có request xác minh riêng trước khi build URL (`_0x528a1c(...)`)
   - Tên file `.m3u8` được tính từ dữ liệu đầu vào (đoán `vid` sai → 404, đã thử)
5. **Mã hóa playlist + segment**: playlist chứa `#ENC-AESGCM`; key dẫn xuất từ `data-nonce` (hash rồi **đảo ngược chuỗi hex**), IV lấy từ `iv=` trong playlist; từng segment AES-GCM decrypt bằng **service worker** (protocol message type 0=resolve URL, 1=lấy m3u8Content, 2=decrypt payload ArrayBuffer).
6. **CDN đo tốc độ** trước khi phát: `https://p21/p16-ad-sg.ibyteimg.com/obj/ad-site-i18n-sg/<hash>` (ByteDance CDN, tải config binary).

### Cloudflare / TLS
- `hhpanda.st` + `streamfree.vip/embed/vt/`: cho qua cả curl lẫn Node fetch (KHÔNG gửi header `Sec-Ch-Ua` giả — gửi giả sẽ bị block "blocked" 403).
- `streamfree.vip/embed/v/` (V2): **chặn curl** (TLS fingerprint) nhưng **cho qua Node fetch (undici)**.
- Browser thật + CDP: phát bình thường.

### Trạng thái sandbox Node (chạy lại player thật không cần browser)
Xem `hhpanda-research/runner2.js` (chạy `app.js` + `chunk31.js` trong `vm` với DOM giả + webcrypto thật + fetch/XHR thật):
- ✅ qua kiểm tra iframe (giả lập `window.top ≠ window.self`)
- ✅ chạy tới bước đua XHR đo CDN
- ❌ dừng ở giai đoạn fingerprint/xác minh: flow reject một object rỗng `{}` (không thông điệp) — chưa tìm được nhánh throw
- Artifact: `decode.js`/`deob.js` (giải mã string array + deobfuscate vùng code), `decoded-strings.txt` (727 chuỗi), `embed4.html` (trang embed mẫu với đầy đủ data-*).

## 4. Kết luận khả thi & kiến trúc nếu làm tiếp

| Hạng mục | Trạng thái |
|---|---|
| Provider Nuvio: tmdbId → tên → post hhpanda → embed URL | ✅ làm được ngay |
| Embed → m3u8 play được cho Nuvio (provider thuần) | ❌ bất khả thi (mã hóa AES-GCM + fingerprint + SW) |
| Resolver local (Node + Playwright Chromium trên PC) | ✅ khả thi — đã chứng minh CDP không bị chặn |

**Kiến trúc resolver local (đề xuất nếu làm tiếp):**
1. Service Node nhỏ chạy trên PC, mở Chromium (Playwright, `addInitScript` hook `fetch`/`XMLHttpRequest` **trước** khi player chạy).
2. Hook bắt dữ liệu **sau khi service worker giải mã** (SW decrypt xong mới trả cho fetch của page) → có playlist + segment đã giải mã.
3. Service re-serve HLS sạch qua `http://<IP-PC>:<port>/...`; provider Nuvio trỏ stream URL về đó (TV/box cùng LAN).
4. Provider vẫn là file tĩnh trên GitHub; chỉ cần `RESOLVER_URL` trong constants.
- Nhược điểm: PC phải bật khi xem; site thay đổi player là phải vá.

**Hướng thuần JS (không khuyên):** hoàn thiện sandbox runner2 qua bước fingerprint (tìm nhánh throw `{}`), replicate toàn bộ chuỗi verify → hash → cnonce → fetch m3u8 → AES-GCM decrypt playlist + segment, tự viết lại HLS. Ước tính nhiều ngày và rủi ro server kiểm chứng fingerprint chặt hơn nữa.

## 5. File artifact trong `hhpanda-research/`

| File | Nội dung |
|---|---|
| `watch.html` | HTML trang watch (chứa `loadPlayer()`, markup tập) |
| `embed4.html` | Trang embed V1 thật (data-id/nonce/checksum/uip + bytecode) |
| `embed-v2.html` | Trang embed V2 (cùng loại player) |
| `app.js`, `chunk31.js`, `sw.js.txt` | Bundle player + service worker (đã tải về) |
| `decode.js` | Chạy string-array decoder trong VM → `decoded-strings.txt` |
| `deob.js` | Deobfuscate vùng code quanh keyword (cách dùng: `node deob.js "từ khóa"`) |
| `runner2.js` | Sandbox chạy player thật trong Node (DOM giả + webcrypto + fetch thật) |
| `survey.js` | Khảo sát player.php trên 8 phim × 2 server |
| `hls-test.js` | Thử gọi `/hls/` với tham số tự chế (404 — xác nhận tên file phải tính) |

## 6. Đối chiếu với các addon "tự xây" có sẵn trên GitHub (cập nhật 2026-08-16)

Khi người dùng hỏi "người ta tự xây addon, ChatGPT là xong" — đã khảo sát 2 repo công khai duy nhất:

### 6.1. `levinhquang94/Hhpanda` (Stremio addon, cập nhật 2026-08-15 — khả năng chính là addon trong ảnh FB)
- Dùng `stremio-addon-sdk`, chạy local Node port 7000, manifest URL cài vào Stremio.
- **Chỉ có `resources: ["catalog", "meta"]` — KHÔNG có stream.** Description ghi rõ: *"This addon does not extract or bypass protected video streams"*; README: *"Phần phát video cần một URL stream mà bạn có quyền sử dụng. Không thêm cơ chế vượt DRM..."*
- Scraper bằng cheerio + selector HTML rộng (dễ vỡ khi site đổi — WP REST API như mục 2.1 chắc chắn hơn).
- Tức là: **tác giả đã đụng đúng bức tường mã hóa và chủ động dừng ở phần duyệt catalog.** Dùng addon này xem được danh sách phim/tập trong Stremio nhưng bấm phát sẽ không có nguồn.

### 6.2. `sikulti666999/cloudstream-hhpanda` (extension Cloudstream, 2026-03)
- Kotlin, viết theo mẫu extension khác. Selector (`.film_list-wrap .flw-item`, `/search?keyword=`) **không khớp theme Halim hiện tại** của hhpanda → trang chính/tìm kiếm gần như không hoạt động.
- `loadLinks` trả thẳng **URL iframe embed** (`doc.select("iframe").attr("src")`) làm `ExtractorLink` — Cloudstream cần URL media trực tiếp nên **không phát được**.
- Kết luận: extension này cũng không giải quyết được stream.

### 6.3. Hàm ý
- Chưa ai công khai giải được stream của streamfree.vip kể cả bằng Cloudstream WebViewResolver thông thường — vì ngay cả URL m3u8 bắt được qua webview cũng **mã hóa trên đường truyền** (SW giải mã trong page, video ăn blob:). Muốn có stream sạch phải hook bên trong page sau khi SW giải mã (kiến trúc resolver local ở mục 4).
- "ChatGPT lật là xong" tạo ra addon **catalog** trong vài phút — đúng cái người trong ảnh có. Phần phát video là 20% khó nhất mà không ai làm được công khai.
- Nếu chỉ cần addon catalog (Stremio/Nuvio-kiểu-liệt-kê) thì có thể làm ngay bằng WP REST API — tốt hơn scraper HTML của cả 2 repo trên.

## 7. Cập nhật 2026-08-16 (buổi 2): ĐÃ BUILD resolver + provider (chưa test được end-to-end do IP bị block)

Sau khi thống nhất hướng đi "xem trong Nuvio", đã build hoàn chỉnh repo `nuvio-hhpanda/`:

### 7.1. Những gì đã xong và kiểm chứng
- **Provider Nuvio** (`src/hhpanda/` → `providers/hhpanda.js`, build bằng build.js của nuvio-providers):
  - tmdbId → TMDB (tên EN + **tên VI** qua `language=vi` + tên mùa qua `/season/N`) → slug → tag WP → post.
  - Test thực tế PASS 2 case: *Link Click S3 Bridon Arc* (match qua "LINK CLICK Bridon Arc") và *Mu Shen Ji/Tales of Herding Gods* (match qua tên VI "Mục Thần Ký"). Trả 2 stream V1/V2 trỏ về resolver. ID rác → trả [] an toàn.
  - `tools/set-resolver-ip.mjs` tự điền IP LAN hiện tại (đang là 192.168.1.20:7777) vào constants + rebuild.
- **Resolver** (`resolver/server.js`, Playwright Chromium + persistent profile):
  - `/master?post&slug&ep&sv&type` → gọi player.php → mở embed với referer watch → đợi hook bắt playlist đã giải mã (mọi decryption của player đều đi qua `crypto.subtle.decrypt` ở tầng trang — đã chứng minh qua deobfuscation) → rewrite URL segment thành `/seg?sid&u=` → trả m3u8 sạch.
  - `/seg` → bảo trang đang sống fetch lại segment (đi qua Service Worker → nhận bytes ĐÃ GIẢI MÃ) → relay cho Nuvio.
  - Auto reload khi gặp trang chống-devtools; session idle 10 phút tự đóng; `/status`, `/probe` để debug.
  - Smoke test: server boot OK, `/status` OK, `/master` xử lý lỗi sạch (502 + message).
- **README.md** đầy đủ hướng dẫn cài đặt/sử dụng/troubleshooting.

### 7.2. Chướng ngại còn lại
- **IP của máy đang bị streamfree.vip block (403 "blocked")** — do lượng request test lớn trong ngày (curl/node/playwright). Block theo IP (đổi UA không ăn thua), thường tự hết sau vài giờ.
- Hệ quả: chưa chạy được bài test end-to-end cuối cùng (bắt playlist + relay segment). Toàn bộ pipeline đã sẵn sàng; chỉ cần chạy lại khi block hết:
  ```
  node resolver/server.js
  curl "http://127.0.0.1:7777/master?post=621&slug=muc-than-ky&ep=1&sv=1&type=tiktik"
  ```
- Lần chạy Playwright đầu tiên từng thấy "jwplayer ready" (qua hết các check) trước khi IP bị block → cơ chế có nền tảng khả thi, nhưng **chưa có bằng chứng end-to-end** — coi đây là prototype đã build, chưa phải sản phẩm đã verify.
- Lưu ý cho người dùng: nếu trình duyệt thường của bạn cũng không xem được hhpanda lúc này thì cũng do cùng lý do (IP block tạm thời) — đợi rồi xem lại.

## 8. Nguồn tham khảo

- Nuvio provider docs: https://github.com/yoruix/nuvio-providers/blob/template/DOCUMENTATION.md
- Provider mẫu (TMDB + cheerio): https://github.com/yoruix/nuvio-providers/tree/main/src/hianime
- Cách thêm addon vào Nuvio: https://www.reddit.com/r/Nuvio/comments/1rargj7/how_to_add_plugins_add_ons_to_nuvio/
- Nuvio dùng được không cần debrid: https://www.reddit.com/r/Nuvio/comments/1rak0ho/nuvio_is_becoming_my_new_go_to/
- Lịch sử đổi domain hhpanda (.me→.tv→.gh→.st): https://www.facebook.com/hhpanda.tv/posts/908208871740254
