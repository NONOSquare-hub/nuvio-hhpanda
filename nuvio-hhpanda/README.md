# HHPanda → Nuvio

Xem donghua từ **hhpanda.st** ngay trong app **Nuvio** (Vietsub + Thuyết minh).

## Kiến trúc

Stream của hhpanda nằm sau player `streamfree.vip` được bảo vệ nhiều tầng (URL HLS ký bằng
fingerprint trình duyệt, playlist + segment mã hóa AES-GCM, giải mã bằng Service Worker).
Provider Nuvio (JS thuần) không thể tự giải mã, nên repo này gồm **2 thành phần**:

```
┌─────────┐  tmdbId  ┌──────────────────┐  player.php  ┌─────────────────────────┐
│  Nuvio  │ ───────▶ │ Provider hhpanda │ ───────────▶ │ hhpanda.st (WP REST API)│
│ (TV/app)│          │ providers/*.js   │              └─────────────────────────┘
│         │  m3u8    └──────────────────┘
 │  ◀─────────────── http://<PC-cua-ban>:7777/master?... ────────────┐
 │           ▲                                                        │
 └───────────┴───── segments đã giải mã ◀──── resolver/server.js ◀───┘
                                    (Playwright + Chromium thật,
                                     móc dữ liệu SAU khi player tự giải mã)
```

- **Provider** (`src/hhpanda/` → build ra `providers/hhpanda.js`): đổi tmdbId thành link
  `http://<IP-PC>:7777/master?...`. Khớp phim qua TMDB (tên EN + tên VI + tên mùa) →
  tag WordPress của hhpanda.
- **Resolver** (`resolver/server.js`): mở player bằng Chromium thật, chờ player tự giải mã
  playlist (hook `crypto.subtle.decrypt` ngay trong trang), rewrite playlist rồi relay từng
  segment đã giải mã cho Nuvio. Chạy trên PC của bạn, TV/box cùng mạng Wi-Fi.

## Yêu cầu

- Windows PC (đã test) hoặc Linux/macOS, Node.js 18+
- Nuvio cài trên thiết bị cùng mạng với PC
- Lần đầu: ~200MB tải Chromium của Playwright

## Cài đặt (một lần)

```powershell
cd nuvio-hhpanda
npm install
npx playwright install chromium
node tools/set-resolver-ip.mjs     # ghi IP LAN của PC vào provider
node build.js hhpanda              # build lại provider với IP đúng
```

> Windows Firewall có thể hỏi khi resolver lần đầu chạy — cho phép Node trên mạng riêng (LAN).
> Kiểm tra IP LAN anytime: `node -e "console.log(require('os').networkInterfaces())"`

## Chạy hằng ngày (trước khi xem)

```powershell
node resolver/server.js
```

Giữ cửa sổ này chạy. Kiểm tra bằng `/status`:

```powershell
curl http://127.0.0.1:7777/status
```

Nếu muốn ẩn cửa sổ Chromium: `set HEADLESS=1 && node resolver/server.js`
(lưu ý: chế độ headless dễ bị trang player phát hiện hơn).

## Cài addon vào Nuvio

**Cách A — GitHub (khuyên dùng, dùng lâu dài):**
1. Push repo này lên GitHub (riêng tư hay công khai đều được).
2. Trên Nuvio: Settings → Content & Discovery → Addons → paste URL manifest:
   `https://raw.githubusercontent.com/<user>/<repo>/main/manifest.json`
3. Mỗi lần đổi IP/pc: chạy lại `node tools/set-resolver-ip.mjs && node build.js hhpanda` rồi push.

**Cách B — test nhanh trong LAN (Plugin Tester, cần debug APK):**
```powershell
npm start        # server tĩnh port 3000: manifest.json + providers/
```
Rồi trong Nuvio (bản debug) → Settings → Developer → Plugin Tester →
`http://<IP-PC>:3000/providers/hhpanda.js`

## Xem phim

1. PC đang chạy `resolver/server.js`.
2. Mở Nuvio → tìm phim (TMDB) → chọn tập → nguồn `HHPanda [V1 Vietsub]` hoặc `[V2 Thuyết minh]`.
3. Episode đầu tiên mất ~10–30s (resolver mở trang, chờ player giải mã playlist).

## Khắc phục sự cố

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| Nguồn không xuất hiện | Resolver chưa chạy / TV khác mạng / sai IP → `node tools/set-resolver-ip.mjs` + rebuild + push lại |
| 502 "timed out waiting for the decrypted playlist" | Trang player bị chặn (đổi giao diện) hoặc IP của bạn đang bị streamfree cờ đỏ vì test nhiều — đợi 30–60 phút rồi thử; kiểm tra xem trình duyệt thường có xem được không |
| Xem được lúc đầu rồi dừng | Session resolver idle >10 phút bị đóng — mở lại tập trong Nuvio (tạo session mới) |
| Site đổi domain (.st → .me…) | Sửa `HHPANDA_BASE` trong `src/hhpanda/constants.js` + rebuild + push |
| Muốn xem debug | `curl "http://127.0.0.1:7777/probe?sid=<sid>"` (sid lấy từ `/status`) |

## Giới hạn đã biết

- Chỉ hỗ trợ `tv` (phim bộ); phim lẻ (`single_movies`) chưa map.
- Mapping mùa phụ thuộc tên mùa TMDB khớp tag hhpanda — hầu hết donghua phổ biến khớp
  (đã test: Link Click S3 Bridon Arc, Mu Shen Ji), một số phim có thể cần thêm biến thể tên.
- PC phải bật khi xem. Đổi IP Wi-Fi → chạy lại set-resolver-ip + rebuild.
- Player của streamfree thay đổi bất kỳ lúc nào đều có thể làm resolver cần vá
  (các hook nằm ở `PAGE_HOOK` trong `resolver/server.js`).

## Cấu trúc

```
manifest.json            # đăng ký provider cho Nuvio
src/hhpanda/             # mã nguồn provider (index, utils, constants)
providers/hhpanda.js     # file build (Hermes-compatible)
resolver/server.js       # resolver local (Playwright)
resolver/capture*.js     # công cụ debug bắt dữ liệu player
tools/set-resolver-ip.mjs
test-local.js            # test logic provider bằng Node (không cần Nuvio)
```
