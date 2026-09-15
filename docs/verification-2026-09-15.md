# Kiểm thử Địa Bạ — 15/09/2026

## Hotfix tiếp theo — địa giới và Text Menu còn sai trên báo cáo mới

- Chú xác nhận lỗi xuất hiện khi **vừa tạo báo cáo mới qua `/api/ai-analysis`**;
  không phải mở cache hoặc gọi Edge riêng. Chưa có raw response/header của production
  để xác định chính xác bản prompt đã chạy.
- Quy tắc trước nằm chung trong user message. Nay gửi riêng `systemInstruction`
  theo [Gemini generateContent](https://ai.google.dev/api/generate-content), nêu rõ
  Hội An/An Bàng hiện thuộc thành phố Đà Nẵng theo
  [Nghị quyết 202/2025/QH15](https://chinhphu.vn/?docid=213930&pageid=27160).
- Sáu tiêu đề đặt thành sáu dòng; mục Text Menu yêu cầu tên món, giá/khẩu phần,
  mô tả, nhóm món và ví dụ từ danh mục. Danh mục được gửi trước hồ sơ. Chat phải
  sửa nhận định sai của bản trước. Vẫn một lượt gọi, không thêm retry/reviewer/gate.
- Phản hồi tiếp theo của chú cho thấy chat hai lần đính chính vẫn giữ lời phán sai.
  Tìm thấy câu “Đã cập nhật báo cáo theo yêu cầu…” do UI tự thêm khi hai bản khác nhau;
  câu này còn bị đưa trở lại lịch sử model. Đã thay thông báo bằng xác nhận nhận bản mới,
  loại lời xác nhận model khỏi prompt, chỉ giữ các yêu cầu người dùng và báo cáo hiện tại;
  yêu cầu mới nhất đứng riêng cuối tư liệu. Prompt yêu cầu thay câu sai ở mọi mục liên quan,
  không chỉ thêm ghi chú/lời xác nhận. Test Next dùng đúng hai câu chú đã gửi để kiểm payload.
- Nguồn An Bàng đã lưu có 24 món chữ, 23 giá, 24 mô tả, 5 nhóm; dữ liệu không bị
  loại khỏi prompt. Không dùng kết quả này để suy rằng Gemini đã phân tích đúng.
- **Đã chạy PASS:** 35 test Deno; `node tests/audit-next.cjs` gồm hai ca Next
  initial SSE/chat JSON kiểm request gửi đủ dữ liệu/menu, system instruction,
  header phiên bản, một provider call và client nhận bản mới; render/storage,
  Edge type check, production build và diff check.
- Response Next/Edge thành công có `X-Audit-Prompt-Version: 2026-09-15.3`.
  Không thay đổi phiên bản cache hoặc ép tạo lại report.
- **Giới hạn:** provider trong test được giả lập; không gọi Gemini/SerpAPI,
  không chạy lại browser E2E ở lượt này. Chưa chứng minh chất lượng model thật
  với prompt mới. Chú tự push; agent không deploy.

## Hotfix sau phản hồi production — một lần bấm, một lượt gọi

**Thay thiết kế kiểm chứng/retry mô tả bên dưới.** Người dùng yêu cầu prompt tối giản,
bỏ tự chạy lần hai và lỗi biên tập sau khi hoàn tất. Chỉ sửa tại repo; chú tự push,
agent không deploy.

- Client bỏ vòng lặp hai lần và semantic validation; server bỏ reviewer/schema/retry/fallback.
- Prompt sáu quy tắc cứng, đầu ra Markdown; Gemini3.5 Flash/low, timeout55s, Next60s.
- Cache không còn yêu cầu đúng tiêu đề Text Menu/điểm hoặc ép thẩm định lại phiên bản cũ.
- HTTP lỗi, response rỗng, model bị ngắt và SSE thiếu DONE vẫn là lỗi thật, không tự retry.
- **35 test PASS**: 29 test tiện ích/vận chuyển còn áp dụng và 6 test hotfix mới.
  Thay các test yêu cầu retry cũ bằng assert đúng một request ở client và provider,
  kể cả429/503/403; không dùng test để giữ cơ chế đã bị người dùng bác.
- Render/storage, Deno Edge check, production build gồm TypeScript đều PASS.
- Browser chạy bản build với một fixture có tiêu đề “Thực đơn dạng chữ”:
  một lần bấm → đúng một request, không lỗi thiếu Text Menu/Chưa hoàn tất, xuất hiện
  report hoàn tất; mở lại hồ sơ khôi phục nguyên bản, không phát sinh thêm request.
  Bằng chứng: tests/results/hotfix-ui.json. Máy chủ kiểm thử đã dừng.
- **Không gọi Gemini hoặc SerpAPI thật trong hotfix.** Các mẫu AI thật dưới đây
  thuộc lần kiểm chứng trước; không dùng để bảo đảm văn phong của prompt mới.
- Test: `deno test --no-config --allow-env tests/audit.test.ts tests/hotfix.test.ts`.
  Khi kiểm UI bằng dữ liệu phát lại: `node tests/browser-server.cjs --hotfix`.

## Kết quả trước hotfix — lịch sử

**3/3 mẫu E2E thật đạt; 47 kiểm thử hồi quy, render/bộ nhớ, Deno Edge check và Next production build đạt.**

Theo điều chỉnh cuối của người dùng, nghiệm thu bằng **ba report đã có**, dừng tạo thêm
trên toàn danh sách. Việc trước đó tạo/retry nhiều quán đã lãng phí quota và thời gian.
Sau điều chỉnh chỉ đọc báo cáo lưu, đối chiếu UI và chạy kiểm thử cục bộ. Mọi máy chủ
kiểm thử đã dừng. Không deploy hoặc sửa dữ liệu nhà hàng.

## Ba mẫu thật đại diện

| Nhà hàng | Tư liệu menu mới nhất | Chat thật | Hash UI / khôi phục | Kết quả |
|---|---|---|---|---|
| BÒ LEO THANG - Bờ sông Bình Lợi | 84 món chữ, 18 ảnh menu | Next JSON | 1329a9da / 1329a9da | PASS |
| East West Brewing — Đà Nẵng | 0 món chữ thu thập, 12 ảnh, link menu | Deno Edge SSE | 93de30e6 / 93de30e6 | PASS |
| An Bang Beach Village Restaurant | 24 món chữ, 23 giá, 24 mô tả, 5 nhóm, 20 ảnh | Next JSON | c4b2cdd3 / c4b2cdd3 | PASS |

Số 0 nghĩa là chưa thu thập được danh sách chữ, không chứng minh quán không có menu.
Lượt tạo đầu dùng Next SSE; East West chat qua chính handler Edge trên Deno cục bộ,
không phải fixture Edge. Chưa kiểm chứng gateway Supabase đã triển khai.

Đã kiểm tra UI thật: tạo report, yêu cầu thêm lịch kiểm tra thực đơn mỗi thứ Hai,
bản sửa thay nội dung cũ, điểm không tự tăng, nhãn “Đã cập nhật báo cáo”, một lượt
trao đổi và mở lại hồ sơ trong tab mới vẫn giữ đúng report. Hash đối chiếu toàn bộ
văn bản render từ API với văn bản UI, chuẩn hóa hoa/thường và dấu câu; không chỉ
kiểm tra một câu đánh dấu. Cả ba bản khôi phục không bị cảnh báo cache cũ.

### Đọc nội dung và đối chiếu nguồn

- Bò Leo Thang: phân tích tên món GÙ BÒ NƯỚNG TẢNG, LẨU BÒ HÀN LEO THANG,
  mô tả còn hạn chế và nhóm The Best Of Bò Leo Thang/Món Quốc Dân/Drink Bia.
- East West: xác định có link website và 12 ảnh menu; giới hạn việc đánh giá tên,
  giá, mô tả, nhóm món vì chưa đọc nội dung chữ. Góp ý đón khách/chất lượng món dựa
  nhận xét đã thu thập, không trừ điểm chỉ vì thiếu dữ liệu chữ.
- An Bàng: đối chiếu giá 40.000–260.000 đồng trong nguồn, nhận diện món Wonton chưa
  thu thập giá và năm nhóm món. Địa chỉ nguồn “To 6B An Bang, Hội An Tây, Đà Nẵng,
  Việt Nam” không bị phán sai theo địa giới cũ. Điểm giữ 8,8 sau chỉnh sửa.

Đây là nghiệm thu trên ba mẫu, không phải cam kết mọi nội dung AI luôn đúng.

## Bằng chứng và kiểm thử cục bộ

- `tests/results/live-browser-events.json`: phản hồi API thật, transport và report.
- `tests/results/live-browser-profiles.json`: hồ sơ dùng đối chiếu.
- `tests/results/live-ui-results.json`: nội dung/hash/trạng thái đã quan sát bằng trình duyệt.
- `tests/results/accepted-summary.json`: 3 mẫu trong phạm vi, 12 kiểm tra mỗi mẫu đều đạt;
  giữ riêng tám quán ngoài phạm vi, không đổi các ca chưa đạt thành PASS.
- `tests/verify-live-results.cjs --representatives`: chỉ đọc bằng chứng, không gọi model.

47 regression dùng phản hồi giả lập bao phủ JSON/SSE, UTF-8 chia byte, DONE/EOF,
snapshot cũ/mới, trả report cũ dù yêu cầu sửa, giữ bản trước khi lỗi, điểm 0–10,
Text Menu, địa chỉ An Bàng, giá sai đơn vị, suy diễn từ ảnh chưa đọc, kiểm chứng
trích câu sai, RPM/RPD, Retry-After và giới hạn vòng sửa. Render/bộ nhớ bao phủ bản
nháp, nhãn kết quả, cache cũ, dữ liệu từng quán và lỗi lưu.

```text
deno test --no-config --allow-env tests/audit.test.ts           # 47 passed, 0 failed
node tests/audit-ui.cjs                                       # PASS
deno check --no-config supabase/functions/ai-analysis/index.ts # PASS
node tests/verify-live-results.cjs --representatives           # 3/3 PASS
node tests/live-e2e.cjs                                       # không gọi API
npm run build                                                # PASS, gồm TypeScript
git diff --check                                             # PASS
```

Repo chưa có cấu hình ESLint để chạy next lint không tương tác. Không cài dependency mới.

## Kết quả cũ không dùng để nghiệm thu cuối

Ban đầu tìm được 15 hồ sơ từ năm truy vấn: 11 nhà hàng/quán bia và bốn bãi biển/lưu trú.
Đợt phát lại trước có 11/11 luồng UI đạt với một cặp report thật và mười fixture;
đó là bằng chứng giao diện/vận chuyển, không phải chất lượng AI thật trên 11 quán.

Đợt gọi thật phát hiện report sai giá ở Phở Thìn Bờ Hồ; Cục Gạch và Phú Quốc chưa
được nghiệm thu UI cuối. Một số quán khác đã tạo/sửa nhưng chưa kiểm tra khôi phục.
Các bản này giữ trong bằng chứng lịch sử, không tạo lại sau yêu cầu giới hạn ba mẫu.
Lỗi phát hiện đã thành regression và guard; không tuyên bố 11/11 chất lượng AI thật đạt.

Riêng log browser ghi 30 yêu cầu ứng dụng, gồm 8 lỗi; đây **không phải tổng yêu cầu
Gemini/quota đã dùng**, vì còn các lượt điều tra trước và writer/reviewer/retry.
Runner đã sửa: mặc định không gọi API; chế độ live chỉ lấy ba mẫu, dừng khi lỗi,
không retry thêm bên ngoài service.

## Thay đổi và giới hạn phát hành

- Nội dung có cấu trúc, Text Menu đầy đủ, giọng tư vấn dựa bằng chứng; không ép
  trọng số hay viết dài cho đủ số từ. Mỗi bản có lượt kiểm chứng ngữ cảnh riêng.
- Bối cảnh hợp nhất Quảng Nam–Đà Nẵng theo
  [Nghị quyết 202/2025/QH15](https://chinhphu.vn/?docid=213930&pageid=27160).
  Không gửi địa chỉ thô để model tự phán hoặc tự chuẩn hóa địa chỉ chi tiết.
- Bảo toàn menu chữ/link/ảnh; đồng bộ API → UI → lịch sử → bản in;
  hủy theo quán, kiểm tra phiên bản/cache và thông báo lỗi lưu.
- Ưu tiên 3.5 Flash, dự phòng 3.6 Flash/Lite; writer/reviewer suy luận mức trung bình.
  Tối đa ba bản nháp đã nhận, mỗi bản có thể thêm lượt kiểm chứng; còn retry dịch vụ
  trong tổng 110 giây. Đổi lại, chất lượng được kiểm tra thêm nhưng tốn lượt gọi và
  có thể chờ lâu hơn. Ba bản nháp không đồng nghĩa ba yêu cầu Gemini.
- Một số lỗi 429 có quota ID theo ngày và giá trị 20; phản hồi khác là quá tải hoặc
  hạn mức khác. Không suy ra hạn mức chung:
  [tài liệu RPM/RPD Gemini](https://ai.google.dev/gemini-api/docs/rate-limits).

**Chưa deploy Next/Edge.** Next khai báo tối đa 120 giây; cần xác nhận deployment
cho phép thời lượng đó theo [Vercel](https://vercel.com/docs/functions/limitations).
Nếu dùng NEXT_PUBLIC_AI_ANALYSIS_URL, phải phát hành bản Edge tương ứng.

HTML in đã kiểm tra dùng bản sửa. **File PDF lưu thực tế chưa kiểm chứng** vì công
cụ trình duyệt chặn thao tác xuất theo chính sách; đã dừng, không thử đường vòng.
Cần kiểm tra thủ công file in trong lần nghiệm thu triển khai.
