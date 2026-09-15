# Kiểm thử Địa Bạ — 15/09/2026

## Kết quả và phạm vi được chốt

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
