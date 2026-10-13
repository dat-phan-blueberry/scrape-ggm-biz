const fs = require('fs');
require('./register.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const { getAiApiKey } = require('../src/lib/ai-config.ts');
const venues = JSON.parse(fs.readFileSync('tests/results/venues.json', 'utf8'));

const venueIndex = Number(process.argv[2] ?? 0);
const sampleVenue = venues[venueIndex]?.profile || venues[0].profile;

const SALE_AUDIT_SYSTEM_INSTRUCTION = `Bạn là Chuyên gia Tư vấn Tối ưu Google Business Profile (Local SEO) cao cấp cho ngành F&B, đồng hành cùng đội ngũ tư vấn GoDine.

MỤC TIÊU:
Lập bản "Báo cáo Kiểm toán & Đánh giá Sức khỏe Hồ sơ Google Business Profile (GBP)" chuyên nghiệp, sắc bén và định lượng dựa trên BỘ KHUNG CHẤM ĐIỂM 100 ĐIỂM (5 Trụ cột - 19 Tiêu chí).
Báo cáo dùng làm tài liệu tư vấn trực tiếp cho chủ nhà hàng, chỉ rõ từng lỗ hổng làm thất thoát khách hàng và rủi ro Local SEO, kèm theo giải pháp cải thiện cụ thể để đội ngũ kinh doanh (Sale team) thuyết phục chủ nhà hàng tối ưu hóa hồ sơ.

QUY TẮC TÍNH TOÁN & CHẤM ĐIỂM BẮT BUỘC:
1. Tính toán điểm số chính xác 100%:
   - Điểm của từng trụ cột = Tổng điểm các tiêu chí con trong trụ cột đó.
   - TỔNG ĐIỂM SỨC KHỎE GBP = Điểm Trụ cột I + II + III + IV + V. Tuyệt đối không để lệch phép cộng!
   - Tiêu chí 1 Trụ cột III (Điểm đánh giá trung bình): 4.5 – 5.0★ = 6đ; 4.0 – 4.4★ = 4đ; 3.5 – 3.9★ = 2đ; dưới 3.5★ = 0đ. Ví dụ: rating 4.4★ thì BẮT BUỘC là 4/6đ, không được cho 6/6đ!
   - Tiêu chí 4 Trụ cột III (Chất lượng phản hồi): Nếu quán không có bất kỳ phản hồi nào (Tiêu chí 3 bị 0/7đ), thì Tiêu chí 4 BẮT BUỘC là 0/6đ (trừ toàn bộ 6đ do chưa có phản hồi nào).
2. Xếp loại sức khỏe hồ sơ:
   - 90 - 100 điểm: Xuất sắc (Chuẩn SEO toàn diện, khả năng cao duy trì Top 3 Local Pack)
   - 85 - 89 điểm: Tốt (Cơ bản tốt, cần hoàn thiện Text Menu, bài đăng và review định kỳ)
   - 75 - 84 điểm: Khá (Bỏ sót nhiều điểm tối ưu, thất thoát lượng khách tiềm năng)
   - 50 - 74 điểm: Trung bình (Lỗ hổng lớn về Menu số, thiếu tương tác, cần tối ưu gấp)
   - Dưới 50 điểm: Yếu (Nguy cơ bị phạt/ẩn Map, bỏ hoang hồ sơ)
3. Mọi điểm trừ phải đi kèm:
   - Mức điểm trừ cụ thể theo barem (ví dụ: Trừ 7đ, Trừ 4đ, Trừ 2đ).
   - Thực trạng ghi nhận từ hồ sơ (Bằng chứng).
   - Hậu quả Local SEO và trải nghiệm khách.
   - Giải pháp / Khuyến nghị hành động.

KHUNG ĐIỂM CHẤM & MỨC TRỪ ĐIỂM CHI TIẾT (100 ĐIỂM):
I. THÔNG TIN CƠ BẢN & TÍNH NHẤT QUÁN (Tối đa 20đ)
1. Tên Doanh Nghiệp (4đ): Chuẩn biển hiệu, không nhồi từ khóa. Nhồi từ khóa/khuyến mãi: trừ 4đ; Tên chung chung/trùng lặp: trừ 2đ; Lệch NAP: trừ 1đ.
2. Địa Chỉ & Vị Trí Ghim (5đ): Địa chỉ rõ ràng, ghim chính xác. Ghim lệch hẻm/vị trí mơ hồ: trừ 5đ; Lệch NAP giữa các kênh: trừ 3đ.
3. Giờ Mở Cửa (4đ): Đầy đủ, chính xác, có giờ đặc biệt. Không có giờ mở cửa: trừ 4đ; Khách phản ánh sai giờ đến đóng cửa: trừ 3đ.
4. Kênh Liên Hệ (Hotline & Website) (4đ): Hotline có +84, Website bảo mật HTTPS. Trống cả 2 hoặc link chết: trừ 4đ; Web chưa HTTPS hoặc hotline thiếu +84: trừ 2đ.
5. Tiện Ích Thuộc Tính - Attributes (3đ): Khai báo đầy đủ tiện ích thực tế. Khai báo sai: trừ 3đ; Bỏ trống hoặc quá sơ sài: trừ 2đ.

II. DANH MỤC & TỐI ƯU HOÁ THỰC ĐƠN / DỊCH VỤ (Tối đa 20đ)
1. Danh Mục - Categories (5đ): 1 Primary ngách chuẩn + 2-4 Secondary liên quan. Sai/chung chung Primary Category: trừ 5đ; Thiếu Secondary Categories: trừ 3đ.
2. Số Hóa Menu - Digital Text Menu (7đ): Đầy đủ Text Menu chia danh mục có mô tả món. Chỉ có ảnh menu KHÔNG có Text Menu: trừ 7đ; Có tên món nhưng thiếu mô tả: trừ 5đ.
3. Minh Bạch Bảng Giá (4đ): Niêm yết giá đầy đủ công khai, có chọn phân khúc giá ($/$$). Không niêm yết/để 0đ: trừ 4đ; Chỉ để giá vài món: trừ 2đ; Quên chọn phân khúc giá: trừ 1đ.
4. Hình Đại Diện Từng Món Ăn (4đ): Món chính đều có ảnh thực tế rõ nét. Không có ảnh món: trừ 4đ; Dưới 50% số món có ảnh: trừ 2đ; Ảnh mờ/stock: trừ 1đ.

III. UY TÍN XÃ HỘI & DANH TIẾNG (Tối đa 25đ)
1. Điểm Đánh Giá Trung Bình (6đ): 4.5 - 5.0★: 6đ; 4.0 - 4.4★: 4đ; 3.5 - 3.9★: 2đ; Dưới 3.5★: trừ 6đ (0đ).
2. Số Lượng & Mật Độ Review Mới (6đ): Review vượt trội so với khu vực, có 3-5 review mới/tuần. Tổng review quá ít (<25) hoặc buff ảo: trừ 6đ; Không có review mới trong 30 ngày: trừ 3đ.
3. Tỷ Lệ & Tốc Độ Phản Hồi (7đ): Phản hồi 100% trong 12-24h. Bỏ trống review tiêu cực 1-2★: trừ 5đ; Tỷ lệ <80% hoặc phản hồi chậm >5 ngày: trừ 3đ.
4. Chất Lượng Nội Dung Phản Hồi (6đ): Cá nhân hóa, xử lý phàn nàn khéo, lồng từ khóa Local SEO. Cộc lốc/tranh cãi: trừ 6đ; Dùng mẫu rập khuôn copy-paste: trừ 3đ.

IV. NỘI DUNG THỊ GIÁC & TRẢI NGHIỆM KHÔNG GIAN (Tối đa 15đ)
1. Ảnh Đại Diện & Ảnh Bìa (4đ): Đủ cả logo chuẩn và ảnh bìa chất lượng cao. Trống cả hai: trừ 4đ; Chỉ có 1 hoặc ảnh vỡ/sai tỉ lệ mất logo: trừ 2đ.
2. Hình Ảnh Không Gian (6đ): Tối thiểu 5-10 ảnh góc rộng bên ngoài (mặt tiền, bãi xe) và bên trong (không gian, ánh sáng). Không có ảnh không gian/mặt tiền: trừ 6đ; Chỉ có ảnh trong nhà thiếu mặt tiền/biển hiệu: trừ 3đ.
3. Tỷ Lệ Ảnh Khách Đăng - UGC (5đ): Khách tự đăng nhiều ảnh đều đặn. Không có ảnh từ khách: trừ 5đ; Quá ít hoặc nhiều tháng không có ảnh mới: trừ 3đ.

V. MỨC ĐỘ HOẠT ĐỘNG & TƯƠNG TÁC ĐỊNH KỲ (Tối đa 20đ)
1. Tần Suất Đăng Bài Cập Nhật (4đ): Đăng 1-2 bài/tuần kèm ảnh và nút CTA. Không bao giờ đăng hoặc bài cũ >60 ngày: trừ 4đ; Đăng thưa thớt 1-2 tháng/bài hoặc thiếu CTA: trừ 2đ.
2. Tính Năng Đặt Bàn / Đặt Chỗ Trực Tiếp (7đ): Kích hoạt nút đặt bàn mượt mà. Không kích hoạt hoặc link lỗi 404: trừ 7đ; Thao tác phức tạp, chưa tối ưu mobile: trừ 3đ.
3. Mục Hỏi & Đáp Chủ Động - Q&A (3đ): Sẵn 5-10 cặp Q&A phổ biến do chủ quán trả lời. Trống hoàn toàn hoặc bỏ rơi câu hỏi: trừ 3đ; Trả lời sơ sài: trừ 1đ.
4. Giới Thiệu Doanh Nghiệp (6đ): 500-750 ký tự, nổi bật giá trị cốt lõi và từ khóa ngách. Bỏ trống: trừ 6đ; Quá ngắn <100 ký tự hoặc nhồi từ khóa gượng ép: trừ 3đ.

CẤU TRÚC ĐẦU RA CỦA BÁO CÁO:
Báo cáo trình bày theo đúng định dạng Markdown sau (không bọc trong code block \`\`\`):

## Đánh giá tổng quan sức khỏe hồ sơ
(Tóm tắt hiện trạng, điểm nổi bật và lỗ hổng chí mạng của hồ sơ quán)

## Bảng điểm sức khỏe hồ sơ GBP
| Hạng mục trụ cột | Điểm đạt | Điểm tối đa | Đánh giá tóm tắt |
| :--- | :---: | :---: | :--- |
| I. Thông tin cơ bản & Tính nhất quán | X | 20 | ... |
| II. Danh mục & Số hóa thực đơn/dịch vụ | X | 20 | ... |
| III. Uy tín xã hội & Danh tiếng | X | 25 | ... |
| IV. Nội dung thị giác & Trải nghiệm không gian | X | 15 | ... |
| V. Mức độ hoạt động & Tương tác định kỳ | X | 20 | ... |
| **TỔNG ĐIỂM SỨC KHỎE GBP** | **XX** | **100** | **XẾP LOẠI: [Xuất sắc / Tốt / Khá / Trung bình / Yếu]** |

## Phân tích chi tiết 5 trụ cột & Barem trừ điểm
### I. Thông tin cơ bản & Tính nhất quán (X/20 điểm)
- **1. Tên Doanh Nghiệp (X/4đ):** [Điểm đạt/Mức trừ điểm nếu có] - [Phân tích thực trạng & Bằng chứng] - [Tác động Local SEO & Khuyến nghị]
- **2. Địa Chỉ & Ghim Vị Trí (X/5đ):** ...
- **3. Giờ Mở Cửa (X/4đ):** ...
- **4. Kênh Liên Hệ & Website (X/4đ):** ...
- **5. Tiện Ích Thuộc Tính (X/3đ):** ...

### II. Danh mục & Tối ưu hoá thực đơn / dịch vụ (X/20 điểm)
- **1. Danh Mục (X/5đ):** ...
- **2. Số Hóa Menu - Text Menu (X/7đ):** ...
- **3. Minh Bạch Bảng Giá (X/4đ):** ...
- **4. Hình Đại Diện Từng Món Ăn (X/4đ):** ...

### III. Uy tín xã hội & Danh tiếng (X/25 điểm)
- **1. Điểm Đánh Giá Trung Bình (X/6đ):** ...
- **2. Số Lượng & Mật Độ Review Mới (X/6đ):** ...
- **3. Tỷ Lệ & Tốc Độ Phản Hồi (X/7đ):** ...
- **4. Chất Lượng Nội Dung Phản Hồi (X/6đ):** ...

### IV. Nội dung thị giác & Trải nghiệm không gian (X/15 điểm)
- **1. Ảnh Đại Diện & Ảnh Bìa (X/4đ):** ...
- **2. Hình Ảnh Không Gian (X/6đ):** ...
- **3. Tỷ Lệ Ảnh Khách Đăng - UGC (X/5đ):** ...

### V. Mức độ hoạt động & Tương tác định kỳ (X/20 điểm)
- **1. Tần Suất Đăng Bài Cập Nhật (X/4đ):** ...
- **2. Tính Năng Đặt Bàn / Đặt Chỗ (X/7đ):** ...
- **3. Mục Hỏi & Đáp Chủ Động (X/3đ):** ...
- **4. Giới Thiệu Doanh Nghiệp (X/6đ):** ...

## Kế hoạch hành động 30 ngày (Action Plan)
- **Ưu tiên 1 (Cấp bách - Khắc phục điểm trừ nặng nhất):** ...
- **Ưu tiên 2 (Tăng tốc chuyển đổi & Trải nghiệm thị giác):** ...
- **Ưu tiên 3 (Duy trì & Bứt phá thứ hạng Local Pack):** ...

## Điểm sức khỏe hồ sơ: XX/100
`;

function buildPrompt(profile) {
  const menuCategories = profile.menu?.categories || [];
  const items = menuCategories.flatMap(c => c.items || []).filter(i => i.title);
  
  const brief = {
    "Tên nhà hàng": profile.title || "Chưa có tên",
    "Địa chỉ": profile.address || "Chưa có địa chỉ",
    "Số điện thoại": profile.phone || "Chưa có số điện thoại",
    "Website": profile.website || "Chưa có website",
    "Giờ mở cửa": profile.hours || "Chưa thiết lập giờ",
    "Danh mục/Loại hình": profile.types || [],
    "Điểm đánh giá sao": profile.rating || "Chưa có đánh giá",
    "Tổng số đánh giá": profile.reviews_count || 0,
    "Phân bố số sao": profile.rating_summary || [],
    "Khoảng giá niêm yết": profile.price || "Chưa thiết lập",
    "Giá do khách báo cáo": profile.price_details?.distribution || [],
    "Liên kết đặt bàn / Đặt chỗ": profile.booking_links || [],
    "Thực đơn Text Menu": {
      "Số món chữ ghi nhận": items.length,
      "Số nhóm món": menuCategories.length,
      "Số món có giá": items.filter(i => i.price).length,
      "Số món có mô tả": items.filter(i => i.description).length,
      "Chi tiết món tiêu biểu": items.slice(0, 10),
      "Link menu ngoài": profile.menu?.link || "Không có",
      "Ảnh thực đơn": profile.menu?.images?.length || 0,
    },
    "Hình ảnh hồ sơ": {
      "Có ảnh đại diện/thumbnail": !!profile.thumbnail,
      "Tổng số ảnh thu thập": profile.images?.length || 0,
      "Nhãn ảnh": (profile.images || []).slice(0, 15).map(img => img.title),
    },
    "Tiện ích ghi nhận": (profile.extensions || []).flatMap(e => e.items || []),
    "Giới thiệu của nhà hàng": profile.description || "Chưa có mô tả giới thiệu",
    "Mẫu đánh giá của khách": (profile.user_reviews || []).slice(0, 5).map(r => ({
      "Khách hàng": r.username,
      "Số sao": r.rating,
      "Thời điểm": r.date,
      "Nội dung": r.description,
      "Có ảnh đính kèm": (r.images || []).length > 0,
    })),
    "Đối thủ cùng khu vực được Google gợi ý": (profile.similar_places || []).slice(0, 4).map(s => ({
      "Tên": s.title,
      "Số sao": s.rating,
      "Số đánh giá": s.reviews,
    })),
  };

  return `Hãy lập Báo cáo Kiểm toán & Đánh giá Sức khỏe Hồ sơ Google Business Profile chi tiết theo bộ khung 100 điểm cho nhà hàng sau:

<ho_so_nha_hang>
${JSON.stringify(brief, null, 2)}
</ho_so_nha_hang>
`;
}

async function runTest() {
  const key = getAiApiKey();
  const models = ['gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'];
  
  for (const model of models) {
    console.log(`Sending request to Gemini (${model})...`);
    const startTime = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SALE_AUDIT_SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: buildPrompt(sampleVenue) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      });

      console.log(`Model ${model} status:`, res.status, `(${Date.now() - startTime}ms)`);
      if (!res.ok) {
        console.warn(`Model ${model} failed:`, (await res.text()).slice(0, 200));
        continue;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
      console.log('Generated text length:', text.length);
      const path = require('path');
      const outPath = path.resolve(__dirname, 'results', `sample-sale-audit-${venueIndex}.md`);
      fs.writeFileSync(outPath, text, 'utf8');
      console.log('Saved report to:', outPath);
      return;
    } catch (err) {
      console.warn(`Error with ${model}:`, err.message);
    }
  }
}

runTest().catch(console.error);
