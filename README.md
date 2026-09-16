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

### Nhiều key SerpAPI & Google AI Studio (xoay key tự động khi 429)

Cả `SERPAPI_KEY` và `GOOGLE_AI_STUDIO_API_KEY` đều hỗ trợ nhiều key với 2 cách khai báo:

```env
# cách 1 — một biến, phân cách bằng dấu phẩy
SERPAPI_KEY=key_1,key_2,key_3,key_4
GOOGLE_AI_STUDIO_API_KEY=ai_key_1,ai_key_2,ai_key_3

# cách 2 — mỗi key một biến (hỗ trợ _1 .. _20)
SERPAPI_KEY=key_1
SERPAPI_KEY_2=key_2
SERPAPI_KEY_3=key_3

GOOGLE_AI_STUDIO_API_KEY=ai_key_1
GOOGLE_AI_STUDIO_API_KEY_2=ai_key_2
GOOGLE_AI_STUDIO_API_KEY_3=ai_key_3
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
   Gemini, trả báo cáo tiếng Việt dành cho chủ nhà hàng và đội sales. Giao diện chỉ gọi
   API Next.js cùng website; không dùng `NEXT_PUBLIC_AI_ANALYSIS_URL` hoặc gọi Edge.
   `GOOGLE_AI_STUDIO_API_KEY` được đọc ở máy chủ Next.js.
   Mỗi thao tác gọi Gemini một lần, đầu ra Markdown theo prompt gọn. Không có lượt
   kiểm chứng hoặc thử lại tự động; giữ contract SSE/JSON với frontend.
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

- Mỗi lần bấm phân tích hoặc gửi chat: **một request ứng dụng, một request Gemini**.
  Dùng `gemini-flash-latest`, suy luận thấp, tối đa 55 giây; Next maxDuration60.
  Không reviewer, schema đầu ra, tự retry hoặc đổi model dự phòng.
- Prompt ngắn gửi bằng `systemInstruction`: tư vấn theo bằng chứng, địa giới sau sắp xếp 2025,
  Text Menu có ví dụ thực tế, điểm 0–10, sáu mục Markdown và phân biệt tư liệu với chỉ dẫn.
  Không có dữ liệu không đồng nghĩa quán thiếu; không tự bịa món, giá hoặc tác động SEO.
- Tư liệu gửi AI là ghi chú kinh doanh tiếng Việt; giá trị chưa có được diễn đạt bằng lời,
  giữ nguyên số 0 có nghĩa, tên/giá/mô tả/nhóm món. Không gửi cấu trúc JSON của hồ sơ.
  Báo cáo và chat không dùng null/undefined, tên trường hay thuật ngữ lập trình.
- Một phản ánh chưa chứng minh xu hướng phục vụ; liên kết chưa chứng minh đặt bàn hoạt động.
  Không phóng đại thứ hạng/SEO, suy doanh thu từ số sao, hoặc tự quy tiêu đề đa ngôn ngữ là
  tối ưu/vi phạm. Ưu tiên tối đa ba việc có căn cứ; việc chưa rõ phải đối chiếu với chủ quán.
- Danh mục món được gửi riêng trước hồ sơ; mục “Đánh giá về Text Menu” phải nhận xét
  tên món, giá/khẩu phần, mô tả và nhóm món. Chat phải sửa nhận định sai trong bản trước.
- Yêu cầu biên tập mới nhất được tách rõ sau báo cáo hiện tại và các yêu cầu trước.
  Không gửi lại lời xác nhận của model/UI làm căn cứ đã sửa. Giao diện báo nhận bản mới,
  không tự khẳng định đã thực hiện đúng yêu cầu chỉ vì nội dung hai bản khác nhau.
- Response có `X-Audit-Prompt-Version: 2026-09-15.4` để đối chiếu bản prompt đã chạy;
  đây là phiên bản prompt, không ép tạo lại báo cáo đã lưu.
- Menu giữ chữ, ảnh, link và nguồn. Chưa đọc link/ảnh thì nêu giới hạn thu thập;
  không kết luận quán không có Text Menu hoặc tự trừ điểm vì vậy.
- UI không đánh giá lại report bằng regex tiêu đề/giá/menu. Khi API hoàn tất và có
  nội dung, hiển thị/lưu bản nhận được. Report khác tiêu đề không gây request thứ hai,
  lỗi “thiếu mục Text Menu” hoặc ép phân tích lại bộ nhớ đã lưu.
- Vẫn báo lỗi HTTP, response rỗng, model bị ngắt hoặc SSE thiếu DONE; không biến
  gián đoạn thật thành thành công. Thử lại do người dùng chọn.
- Chat nhận JSON ở Next hoặc SSE ở Edge; ưu tiên updatedAnalysis, cập nhật cùng một
  report trên UI, lịch sử, bộ nhớ và HTML in. Lỗi giữ bản trước; hủy khi đổi quán.
- Điểm được nhận diện để hiển thị, không chia100/clamp để sửa sai; không nhận diện
  được thì ẩn badge, không tự gọi lại model. Nội dung report không bị thay bằng lỗi biên tập.
- Dữ liệu nguồn chỉ trả place_results, không trả tham số truy vấn chứa key.
  Các helper đánh giá nội dung cũ còn được kiểm tra offline, không nằm trong luồng runtime.

Kiểm tra cục bộ (không gọi Gemini thật):

```bash
deno test --no-config --allow-env tests/audit.test.ts tests/hotfix.test.ts tests/audit-evidence.test.ts tests/stream-completion.test.ts
node tests/audit-ui.cjs
node tests/audit-next.cjs
deno check --no-config supabase/functions/ai-analysis/index.ts
npm run build
```

## Kiểm thử tích hợp với dữ liệu thật

Mặc định kiểm tra **3 report thật đã lưu**, không gọi Gemini:

```bash
node tests/verify-live-results.cjs --representatives
```

Ba mẫu trong `tests/representative-venues.cjs`: Bò Leo Thang (84 món chữ), East West
Đà Nẵng (link/ảnh, chưa thu thập danh sách chữ), An Bàng (24 món, địa chỉ hành chính mới).
Checker đối chiếu report API, nội dung đã quan sát trên UI, bản khôi phục, điểm và HTML in.
Không xem kết quả của tám quán ngoài phạm vi này là đã nghiệm thu.
`tests/results/` chứa dữ liệu/bằng chứng cục bộ, được gitignore; không chứa key/phiên đăng nhập.

Chỉ khi được phép chạy live ở phiên khác: app tại `127.0.0.1:3107`,
`node tests/live-e2e.cjs --live --resume`. Runner chỉ chạy ba mẫu, dừng khi một mẫu lỗi,
không tự retry ở runner hoặc service. Chạy không tham số sẽ không gọi API.
Mỗi mẫu tối đa hai yêu cầu ứng dụng (tạo/sửa), mỗi yêu cầu gọi Gemini đúng một lần. `--discover` chỉ thu thập hồ sơ
qua SerpAPI khi cần; không tự sinh báo cáo. **Phiên 15/09 đã dừng mọi lượt Gemini theo yêu cầu.**

`node tests/browser-server.cjs` mở máy chủ QA loopback `127.0.0.1:3109`, dùng UI thật
với dữ liệu thu thập; phát lại báo cáo thật nếu hợp lệ hoặc fixture ghi rõ là kiểm thử.
Đây là kiểm tra UI/transport, không được dùng để tuyên bố chất lượng AI thật đã đạt.
Kết quả và giới hạn đợt này: [biên bản kiểm thử](docs/verification-2026-09-15.md).

Phát hành cùng bản Next.js trên Netlify; không cần triển khai Supabase.
Biến `NEXT_PUBLIC_AI_ANALYSIS_URL` cũ không còn tác dụng. Chất lượng văn phong thực tế
cần kiểm tra bằng báo cáo Gemini thật; bộ kiểm thử cục bộ dùng phản hồi giả lập.
