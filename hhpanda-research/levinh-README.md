# HHPANDA → Stremio catalog addon

Addon Node.js này đọc **catalog, metadata và danh sách tập** từ các trang HHPANDA công khai. Nó **không bóc, giải mã hoặc vượt cơ chế bảo vệ video** và không tạo URL stream từ player của HHPANDA.

## Yêu cầu

- Node.js 18+
- Kết nối Internet

## Cài đặt

```bash
npm install
```

Tạo `.env`:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Chạy:

```bash
npm start
```

Addon mặc định:

```text
http://127.0.0.1:7000/manifest.json
```

Stremio SDK cho phép chạy addon local và dùng URL manifest để cài; addon từ xa cần HTTPS. Xem tài liệu SDK chính thức:
https://github.com/Stremio/stremio-addon-sdk

## Cài vào Stremio

Trên máy đang chạy addon, mở Stremio và thêm addon bằng manifest URL:

```text
http://127.0.0.1:7000/manifest.json
```

Nếu bạn deploy lên server, dùng:

```text
https://YOUR-DOMAIN/manifest.json
```

## Lưu ý về HHPANDA

Website có thể thay đổi HTML/CSS hoặc URL phân trang. Khi đó cần chỉnh các selector trong `src/scraper.js`.

Addon này chỉ sử dụng dữ liệu trang công khai:

- tên phim
- poster/OG image
- mô tả
- link trang phim
- link/trang tập

Phần phát video cần một URL stream mà bạn có quyền sử dụng. Không thêm cơ chế vượt DRM, token protection, anti-hotlink hoặc các biện pháp bảo vệ của website.

## Kiểm tra nhanh

```bash
curl http://127.0.0.1:7000/manifest.json
```

Nếu thấy JSON manifest là server đã chạy.
