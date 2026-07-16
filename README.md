# Địa Bạ — Hồ sơ quán từ Google Maps

Công cụ nội bộ cho đội sales: gõ tên một quán ăn / nhà hàng, nhận về toàn bộ hồ sơ
Google Business Profile của quán (đánh giá, thực đơn, giờ cao điểm, mặt bằng giá,
kênh đặt chỗ, tiện ích…) kèm **bản thẩm định tự động** — điểm mạnh, thiếu sót và
việc quán nên làm — để mang theo khi đến ngỏ lời tư vấn.

## Chạy dự án

```bash
npm install
npm run dev
```

Tạo file `.env` ở thư mục gốc:

```env
SERPAPI_KEY=...              # https://serpapi.com — lấy dữ liệu Google Maps
GOOGLE_AI_STUDIO_API_KEY=... # https://aistudio.google.com — chạy thẩm định AI
```

## Luồng hoạt động

1. **Tìm kiếm** — `GET /api/autocomplete?q=...` gọi SerpAPI engine
   `google_maps_autocomplete`. Engine này **bắt buộc** tham số `ll` (tọa độ);
   mặc định dùng `@16.047079,108.206230,6z` để phủ toàn Việt Nam.
2. **Lấy hồ sơ** — autocomplete chỉ trả về `data_id` (không phải `place_id`),
   nên `GET /api/business-profile?data_id=...&lat=...&lng=...` dựng tham số
   `data=!4m5!3m4!1s{data_id}!8m2!3d{lat}!4d{lng}` cho engine `google_maps`.
   Route chuẩn hóa dữ liệu thô về `BusinessProfile` (xem `src/lib/types.ts`):
   giờ mở cửa, histogram điểm, thực đơn, đánh giá, giờ cao điểm, phân bố giá…
3. **Thẩm định** — `POST /api/ai-analysis` gửi hồ sơ (đã lược ảnh) cho Gemini,
   trả về báo cáo markdown tiếng Việt. Có chuỗi model dự phòng
   (`gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-flash-latest`)
   vì free tier hay quá tải 503; `gemini-3.1-pro-preview` không dùng được ở
   free tier (limit = 0).

## Cấu trúc

```
src/
  app/
    api/autocomplete/route.ts      # gợi ý địa điểm (SerpAPI)
    api/business-profile/route.ts  # hồ sơ đầy đủ + chuẩn hóa schema
    api/ai-analysis/route.ts       # thẩm định AI (Gemini, có fallback)
    layout.tsx                     # fonts (Archivo · Be Vietnam Pro · IBM Plex Mono)
    page.tsx                       # tìm kiếm + bố cục hồ sơ
  components/
    ui.tsx        # icon, sao, section, markdown renderer, skeleton
    sections.tsx  # các khối hồ sơ: đánh giá, thực đơn, giờ cao điểm…
  lib/types.ts    # kiểu dữ liệu dùng chung client/server
```

Ghi chú UI: giao diện không nhắc tên nhà cung cấp dữ liệu/AI — có thể mở
trực tiếp trước mặt chủ quán khi tư vấn.
