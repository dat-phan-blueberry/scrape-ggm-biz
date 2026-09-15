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
   Ưu tiên `gemini-3.5-flash`, dự phòng `gemini-3.6-flash` và `gemini-3.5-flash-lite`.
   Model trả JSON theo schema; một lượt kiểm chứng riêng đối chiếu nhận định với tư liệu
   trước khi hệ thống dựng báo cáo. Cả hai lượt dùng suy luận mức trung bình.
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
- `audit-format.ts` bắt buộc nội dung từng tiêu chí menu, giải thích điểm và sáu mục
  báo cáo. Không chấp nhận chỉ có tiêu đề Text Menu. Bộ kiểm tra đối chiếu dữ liệu
  đầu vào để từ chối một số dạng kết luận “quán thiếu menu/giới thiệu” khi chỉ chưa thu thập.
- Menu giữ riêng danh sách món, món nổi bật, ảnh menu, link và tên nguồn.
  UI luôn hiện tình trạng thu thập, kể cả khi không có món dạng chữ. Không tự đọc
  nội dung link/ảnh hoặc biến tên món nổi bật thành danh sách thực đơn đầy đủ.
- Điểm từ **0 đến 10**, tối đa một chữ số thập phân, bắt buộc tiêu đề
  `## Điểm cạnh tranh: X/10`. Sai điểm, thiếu mục hoặc kết quả bị cắt sẽ gọi lại;
  tối đa 3 bản nháp trong ngân sách 110 giây. Không chia điểm thang 100, làm tròn
  hay cắt về 10 để hợp thức hóa kết quả sai.
- Mỗi bản nháp hợp lệ về cấu trúc cần thêm một lượt kiểm chứng, nên **3 bản nháp không
  đồng nghĩa 3 yêu cầu Gemini**. Kiểm chứng dùng cùng model nhưng ngữ cảnh riêng;
  schema/guard kiểm tra giá, nguồn nhận xét, suy diễn địa chỉ và tình trạng menu.
  Chỉ nhận lỗi kiểm chứng có câu trích đúng trong report; kiểm chứng lỗi thì chưa trả report.
- Thời gian chờ mỗi lượt tối đa 35 giây trong ngân sách tổng 110 giây. Retry nội dung
  gửi lại cả bản bị từ chối và lý do sửa; 429/5xx có khoảng nghỉ. Hết quota theo ngày
  bỏ retry cùng model và thử dự phòng; vẫn không có kết quả thì trả lỗi rõ ràng.
  Phân biệt RPM/RPD bằng định danh quota thực tế; số 20 hoặc HTTP 429 riêng lẻ không
  đủ kết luận hạn mức chung. Xem [hạn mức Gemini](https://ai.google.dev/gemini-api/docs/rate-limits).
  Next khai báo `maxDuration=120`; khi phát hành cần kiểm tra chế độ chạy của dự án
  cho phép thời lượng này theo [giới hạn Vercel](https://vercel.com/docs/functions/limitations).
- Chỉ gửi nội dung sau khi kiểm tra xong; trong khi chờ gửi SSE keepalive.
  Lần đầu dùng SSE ở cả hai môi trường; chat dùng JSON ở Next và SSE ở Edge,
  giao diện đọc được cả hai. Hết lượt thử thì báo lỗi, giữ báo cáo cũ khi sửa qua chat.
- Bộ đọc ở giao diện dùng chung cho thẩm định và chat: xử lý UTF-8 chia nhỏ,
  sự kiện nhiều dòng và phần còn lại ở cuối luồng; chỉ hoàn tất khi nhận `[DONE]`.
  Đọc được text delta, snapshot `analysis`/`updatedAnalysis`, JSON và report thuần
  từ Edge cũ; bản cập nhật rõ ràng được ưu tiên. Client cũng kiểm tra sáu mục,
  nội dung menu và điểm hợp lệ. Nếu endpoint trả nội dung sai, giao diện thử lại một lần; nếu vẫn lỗi thì
  giữ nội dung đã nhận để xem, nhưng không lưu làm báo cáo hoàn tất hoặc cho xuất PDF.
  Lỗi kết nối, lỗi dịch vụ và lỗi nội dung có thông báo riêng.
- Địa chỉ cụ thể chưa có nguồn đối chiếu, nên không đưa địa chỉ thô vào tư liệu AI
  và không tự chuẩn hóa. Prompt có bối cảnh hợp nhất Quảng Nam–Đà Nẵng từ
  [Nghị quyết 202/2025/QH15](https://chinhphu.vn/?docid=213930&pageid=27160).
  Guard chặn nhận định lỗi địa chỉ/địa giới thiếu căn cứ, vẫn cho phép địa danh
  trong tên quán/món. Guard này không phải dịch vụ xác minh mọi nhận định của AI.
- Khi chat sửa, UI hiện bản đang nhận, chỉ lưu sau hoàn tất và kiểm tra nội dung;
  stream lỗi giữ bản trước. “Đã cập nhật”, “Đã giải đáp”, lỗi là ba trạng thái riêng.
  Xuất PDF bị khóa trong lúc sửa và dùng cùng bản hoàn tất với UI/bộ nhớ.
- Hủy request khi đổi quán/đặt lại để phản hồi muộn không ghi đè nhầm hồ sơ.
  Bộ nhớ có phiên bản; bản cũ còn xem được với nút **Thẩm định lại**, chưa cho xuất PDF.
  Nếu trình duyệt không lưu được, UI nói rõ thay vì báo lưu thành công.
- API dữ liệu gốc chỉ trả `place_results`, loại tham số truy vấn có thể chứa key;
  lỗi upstream không ghi raw response/request có thông tin xác thực ra log.

Kiểm tra cục bộ (không gọi Gemini thật):

```bash
deno test --no-config --allow-env tests/audit.test.ts
node tests/audit-ui.cjs
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
không retry thêm bên ngoài retry của service. Chạy không tham số sẽ không gọi API.
Mỗi mẫu tối đa hai yêu cầu ứng dụng (tạo/sửa), mỗi yêu cầu gồm writer/reviewer và
retry có giới hạn nên số yêu cầu Gemini lớn hơn. `--discover` chỉ thu thập hồ sơ
qua SerpAPI khi cần; không tự sinh báo cáo. **Phiên 15/09 đã dừng mọi lượt Gemini theo yêu cầu.**

`node tests/browser-server.cjs` mở máy chủ QA loopback `127.0.0.1:3109`, dùng UI thật
với dữ liệu thu thập; phát lại báo cáo thật nếu hợp lệ hoặc fixture ghi rõ là kiểm thử.
Đây là kiểm tra UI/transport, không được dùng để tuyên bố chất lượng AI thật đã đạt.
Kết quả và giới hạn đợt này: [biên bản kiểm thử](docs/verification-2026-09-15.md).

Khi phát hành cần cập nhật cả Next và Edge nếu đang cấu hình
`NEXT_PUBLIC_AI_ANALYSIS_URL`. Chất lượng văn phong thực tế cần kiểm tra bằng báo
cáo Gemini thật; bộ kiểm thử cục bộ dùng phản hồi giả lập để kiểm tra logic.
