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

### Nhiều key SerpAPI (xoay key tự động)

Free tier SerpAPI chỉ 100 lượt/tháng, nên `SERPAPI_KEY` nhận **nhiều key**. Hai
cách khai, chọn cái nào cũng được:

```env
# cách 1 — một biến, phân cách bằng phẩy
SERPAPI_KEY=key_1,key_2,key_3,key_4

# cách 2 — mỗi key một biến
SERPAPI_KEY=key_1
SERPAPI_KEY_2=key_2
SERPAPI_KEY_3=key_3
SERPAPI_KEY_4=key_4
```

Cách xoay (`src/lib/key-pool.ts`):

- Dùng **cạn từng key** theo thứ tự, không rải đều — hạn mức tính theo tổng lượt
  nên dùng hết key 1 rồi mới sang key 2 thì dễ theo dõi hơn.
- Key báo hết hạn mức bị **ném xuống cuối hàng đợi** và cho nghỉ **24h**; request
  đang dở tự thử lại ngay bằng key kế tiếp nên người dùng không thấy lỗi.
- Bị *throttle* (gửi quá nhanh) chỉ nghỉ **1 phút** — đó không phải hết hạn mức.
- Lỗi không thuộc về key (ví dụ `data_id` sai, SerpAPI 500) **không** làm key bị
  phạt, tránh chuyện một truy vấn lỗi đốt sạch cả bốn key.
- Hết cooldown thì key tự sống lại. Cooldown được ghi ra `.key-pool-state.*.json`
  (đã gitignore, chỉ chứa **dấu tay băm** của key chứ không chứa key) nên restart
  server không xoá sạch trạng thái.
- Xem còn mấy key sống: `GET /api/key-status` — trả nhãn đã che (`#2…a1b2`), lý do
  nghỉ và giờ mở lại. Không bao giờ trả key thật.

Khi cả bốn key đều nghỉ, API trả 429 kèm câu nói rõ giờ hạn mức mở lại.

## Luồng hoạt động

1. **Tìm kiếm** — `GET /api/autocomplete?q=...` gọi SerpAPI engine
   `google_maps_autocomplete`. Engine này **bắt buộc** tham số `ll` (tọa độ);
   mặc định dùng `@16.047079,108.206230,6z` để phủ toàn Việt Nam.
2. **Lấy hồ sơ** — autocomplete chỉ trả về `data_id` (không phải `place_id`),
   nên `GET /api/business-profile?data_id=...&lat=...&lng=...` dựng tham số
   `data=!4m5!3m4!1s{data_id}!8m2!3d{lat}!4d{lng}` cho engine `google_maps`.
   Route chuẩn hóa dữ liệu thô về `BusinessProfile` (xem `src/lib/types.ts`):
   giờ mở cửa, histogram điểm, thực đơn, đánh giá, giờ cao điểm, phân bố giá…
3. **Thẩm định** — `POST /api/ai-analysis` gửi tư liệu có nhãn kinh doanh cho
   Gemini, trả báo cáo tiếng Việt dành cho chủ nhà hàng và đội sales. Prompt và
   kiểm tra kết quả dùng chung với Supabase Edge tại `supabase/functions/_shared/`.
   Ưu tiên `gemini-flash-latest`, thử lại một lần rồi dùng `gemini-3.5-flash` dự phòng.
4. **Xuất PDF** — nút "Xuất PDF" trên báo cáo mở cửa sổ xem trước A4 thương
   hiệu GoDine (logo ở `public/logo.png`, tiêu đề "Audit Google Business
   Profile Report") → bấm "In / Lưu PDF" → chọn *Save as PDF*. Trình dựng
   HTML nằm ở `src/lib/report-html.ts`.

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

## Quy tắc thẩm định

- Nhận định theo bằng chứng và bối cảnh từng quán; không dùng trọng số cứng,
  không mặc định trừ điểm hay ưu tiên bán giải pháp khi chưa thu thập được menu.
- Có mục **Đánh giá về Text Menu** riêng: tên món, giá, mô tả, nhóm món và khả năng
  giúp khách lựa chọn. Phân biệt thiếu thông tin với xác nhận nhà hàng chưa có.
  Không khẳng định Google không đọc được chữ trong ảnh; xem
  [hướng dẫn menu của Google](https://support.google.com/business/answer/9455840?hl=en).
- Điểm từ **0 đến 10**, tối đa một chữ số thập phân, bắt buộc tiêu đề
  `## Điểm cạnh tranh: X/10`. Sai điểm, thiếu mục hoặc kết quả bị cắt sẽ gọi lại;
  tối đa 3 lượt gọi trong ngân sách 50 giây. Không chia điểm thang 100, làm tròn
  hay cắt về 10 để hợp thức hóa kết quả sai.
- Chỉ gửi nội dung sau khi kiểm tra xong; trong khi chờ gửi SSE keepalive.
  Lần đầu dùng SSE ở cả hai môi trường; chat dùng JSON ở Next và SSE ở Edge,
  giao diện đọc được cả hai. Hết lượt thử thì báo lỗi, giữ báo cáo cũ khi sửa qua chat.
- Chưa có nguồn xác minh địa giới hiện hành nên không chuyển địa chỉ thô vào tư
  liệu AI, không tự đoán địa chỉ mới. Prompt yêu cầu bỏ tên hành chính chưa xác minh
  cả trong nhận xét và lịch sử trao đổi. Đây chưa phải dịch vụ chuẩn hóa địa chỉ;
  cần chủ quán xác nhận khi muốn ghi địa chỉ đầy đủ. Hồ sơ gốc vẫn hiển thị dữ liệu nguồn.
- Báo cáo đã lưu trước thay đổi không tự viết lại. Dùng **Làm mới** để
  tạo báo cáo theo chuẩn mới, hoặc yêu cầu sửa qua chat để giữ ngữ cảnh trao đổi.

Kiểm tra cục bộ (không gọi Gemini thật):

```bash
deno test --no-config tests/audit.test.ts
deno check --no-config supabase/functions/ai-analysis/index.ts
npm run build
```

Khi phát hành cần cập nhật cả Next và Edge nếu đang cấu hình
`NEXT_PUBLIC_AI_ANALYSIS_URL`. Chất lượng văn phong thực tế cần kiểm tra bằng báo
cáo Gemini thật; bộ kiểm thử cục bộ dùng phản hồi giả lập để kiểm tra logic.
