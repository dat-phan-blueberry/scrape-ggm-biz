/** Dùng chung cho Next, Edge và phần hiển thị; không phụ thuộc runtime. */
export const REPORT_MARKER = "=== BẢN BÁO CÁO CẬP NHẬT ===";
export const CHAT_MARKER = "=== PHẢN HỒI CHAT ===";
export const AUDIT_VERSION = "2026-09-15.2";
const UNKNOWN = "Chưa ghi nhận trong thông tin thu thập; cần kiểm tra trực tiếp.";

/**
 * Tên địa danh chỉ giúp nhận diện nhận định cần kiểm chứng, không phải danh sách
 * cấm nhắc đến hoặc bảng chuẩn hóa địa giới. Giữ được tên quán và tên đặc sản.
 */
const VN_PROVINCES = [
  "An Giang", "Bà Rịa – Vũng Tàu", "Bà Rịa - Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn", "Bắc Ninh", "Bến Tre",
  "Bình Dương", "Bình Định", "Bình Phước", "Bình Thuận", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng", "Đắk Lắk", "Đắk Nông",
  "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh", "Hải Dương", "Hải Phòng",
  "Hậu Giang", "Hòa Bình", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai",
  "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi",
  "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế",
  "Tiền Giang", "Hồ Chí Minh", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái", "Hội An",
];

function stripDiacritics(s: string): string {
  return s.replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chỉ bắt nhận định địa giới; tên quán/món chứa địa danh vẫn là dữ liệu hợp lệ. */
export function administrativeNameViolation(text: string): string | null {
  const normalized = stripDiacritics(text).toLocaleLowerCase();
  const claims = normalized.split(/[\n.!?]+/).filter(sentence =>
    /(?:dia chi|dia gioi|hanh chinh|tinh thanh|nap inconsistency|thuoc|sap nhap)/.test(sentence)
    && /(?:sai|loi|khong thuoc|khong phai|nham|mau thuan|bat nhat|khong nhat quan|phai (?:doi|sua)|ghep|nhieu loan)/.test(sentence)
    && !/(?:khong (?:du|co) (?:can cu|bang chung)|chua (?:du|xac minh)|khong (?:the|nen|duoc) (?:ket luan|phan|coi)|khong phai (?:loi|dia chi sai))/.test(sentence));
  if (!claims.length) return null;
  for (const name of VN_PROVINCES) {
    const needle = stripDiacritics(name).toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (claims.some(sentence => new RegExp(`\\b${needle}\\b`).test(sentence))) return name;
  }
  if (claims.some(sentence => /dia chi|nap inconsistency/.test(sentence))) return "địa chỉ chưa đối chiếu";
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function label(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : UNKNOWN;
}

/** Đưa tư liệu sang ghi chú kinh doanh; giá trị chưa có không thành từ khóa lập trình. */
function evidenceText(value: unknown): string {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return UNKNOWN;
  if (Array.isArray(value)) return value.length
    ? value.map(item => `- ${evidenceText(item).replace(/\n/g, "\n  ")}`).join("\n") : UNKNOWN;
  if (typeof value === "object") return Object.entries(value).map(([name, item]) =>
    `${name}: ${evidenceText(item).replace(/\n/g, "\n  ")}`).join("\n") || UNKNOWN;
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : UNKNOWN;
  return String(value).trim();
}

function currencyValues(text: string): number[] {
  const pattern = /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)*)(?:\s*(?:[-–]|đến|tới)\s*(\d+(?:[.,]\d+)*))?\s*(triệu|nghìn|ngàn|N\s*₫|VNĐ|VND|đồng|₫|đ|k)(?=$|[^\p{L}])/giu;
  return Array.from(text.matchAll(pattern)).flatMap(m => {
    const unit = m[3].toLowerCase();
    const factor = unit === "triệu" ? 1_000_000 : /^(?:k|nghìn|ngàn|n\s*₫)$/.test(unit) ? 1000 : 1;
    return [m[1], m[2]].filter(Boolean).map(value => {
      const number = /^\d{1,3}(?:[.,]\d{3})+$/.test(value) ? Number(value.replace(/[.,]/g, "")) : Number(value.replace(",", "."));
      return Math.round(number * factor);
    });
  });
}

export function businessBrief(profile: unknown) {
  const p = record(profile);
  const menu = record(p.menu);
  const categories = rows(menu.categories);
  const items = categories.flatMap(c => rows(c.items)).filter(i => typeof i.title === "string" && i.title.trim());
  return {
    "Tên nhà hàng": label(p.title),
    "Loại hình": p.types,
    "Giới thiệu của nhà hàng": label(p.description),
    // Nguồn hiện chưa có địa chỉ đã đối chiếu hành chính: không đưa địa chỉ thô cho AI sao chép.
    "Địa chỉ": p.address ? "Có địa chỉ trên hồ sơ; chưa đối chiếu địa giới hoặc so sánh địa chỉ giữa các kênh. Không có căn cứ kết luận sai địa chỉ/NAP." : UNKNOWN,
    "Điện thoại liên hệ": label(p.phone),
    "Trang web được ghi nhận": label(p.website),
    "Giờ mở cửa": rows(p.hours).map(h => ({ "Ngày": h.day, "Giờ": h.time })),
    "Điểm sao của khách (thang 5)": p.rating ?? UNKNOWN,
    "Tổng lượt đánh giá": p.reviews_count ?? UNKNOWN,
    "Phân bố đánh giá": rows(p.rating_summary).map(r => ({ "Số sao": r.stars, "Số lượt": r.amount })),
    "Khoảng giá": label(p.price),
    "Giá do khách báo cáo": rows(record(p.price_details).distribution).map(r => ({ "Mức giá": r.price, "Tỷ lệ": r.percentage, "Số khách": r.reported_count })),
    "Kênh đặt chỗ ghi nhận": rows(p.booking_links).map(l => ({ "Tên kênh": l.name, "Đường dẫn": l.link })),
    "Giới hạn kiểm tra đặt chỗ": "Chỉ ghi nhận liên kết; chưa thử đặt bàn nên chưa đánh giá được khả năng hoàn tất đặt chỗ.",
    "Thực đơn dạng chữ": {
      "Tình trạng": items.length ? `Ghi nhận ${items.length} món có tên dạng chữ; chưa xác minh độ đầy đủ và ngày cập nhật.` : UNKNOWN,
      "Số món có tên": items.length,
      "Số món có giá": items.filter(i => typeof i.price === "string" && i.price.trim()).length,
      "Số món có mô tả": items.filter(i => typeof i.description === "string" && i.description.trim()).length,
      "Số nhóm có món": categories.filter(c => rows(c.items).length).length,
      "Liên kết thực đơn": label(menu.link),
      "Nguồn liên kết": label(menu.source),
      "Số ảnh thực đơn": rows(menu.images).length,
      "Giới hạn thu thập": "Chỉ đọc nội dung chữ có trong hồ sơ trả về. Chưa mở liên kết, chưa đọc chữ trong ảnh; không dùng lượng dữ liệu thu thập để kết luận độ đầy đủ của menu thực tế.",
      "Danh mục": categories.map(c => ({ "Nhóm món": c.title, "Các món": rows(c.items).map(i => ({ "Tên món": i.title, "Giá": i.price, "Mô tả": i.description })) })),
    },
    "Món nổi bật ghi nhận": rows(menu.highlights).map(h => label(h.title)),
    "Lưu ý về ảnh menu": "Ảnh thực đơn được đếm riêng với ảnh món nổi bật. Chưa xem ảnh nên chưa đánh giá độ rõ, giá và tính cập nhật.",
    "Hình ảnh": { "Số ảnh thu thập": rows(p.images).length, "Có ảnh đại diện": p.thumbnail ? "Có" : UNKNOWN, "Nhãn ảnh": rows(p.images).map(i => label(i.title)), "Giới hạn": "Chỉ có nhãn ảnh, chưa xem trực tiếp chất lượng hình ảnh." },
    "Tiện ích ghi nhận": rows(p.extensions).flatMap(e => Array.isArray(e.items) ? e.items.filter(i => typeof i === "string") : []),
    "Nhận xét khách hàng (mẫu thu thập, không đại diện toàn bộ)": rows(p.user_reviews).map(r => ({ "Số sao": r.rating, "Thời điểm": r.date, "Nội dung": r.description })),
    "Địa điểm được Google gợi ý cùng (chưa xác minh là đối thủ trực tiếp)": rows(p.similar_places).map(s => ({ "Tên": s.title, "Số sao": s.rating, "Số đánh giá": s.reviews })),
    "Quản lý hồ sơ": p.unclaimed === true ? "Nguồn hiển thị lời mời nhận quản lý; cần xác nhận với chủ nhà hàng." : "Chưa đủ căn cứ kết luận quyền quản lý hay trạng thái xác minh.",
  };
}

export const MAX_AUDIT_KEY_ATTEMPTS = 256;

export interface AuditInput {
  profile: unknown;
  currentAnalysis?: string;
  messages?: Array<{ role: string; content: string }>;
  attemptedKeySlots?: number[];
}

export const AUDIT_PROMPT_VERSION = "2026-10-13.1";
export const AUDIT_SYSTEM_INSTRUCTION = `Bạn là Chuyên gia Tư vấn Tối ưu Google Business Profile (Local SEO) cao cấp cho ngành F&B, đồng hành cùng đội ngũ tư vấn GoDine.

MỤC TIÊU:
Lập bản "Báo cáo Kiểm toán & Đánh giá Sức khỏe Hồ sơ Google Business Profile (GBP)" chuyên nghiệp, sắc bén và định lượng dựa trên BỘ KHUNG CHẤM ĐIỂM 100 ĐIỂM (5 Trụ cột - 19 Tiêu chí).
Báo cáo dùng làm tài liệu tư vấn trực tiếp cho chủ nhà hàng, chỉ rõ từng lỗ hổng làm thất thoát khách hàng và rủi ro Local SEO, kèm theo giải pháp cải thiện cụ thể để đội ngũ kinh doanh (Sale team) thuyết phục chủ nhà hàng tối ưu hóa hồ sơ.

QUY TẮC TÍNH TOÁN & CHẤM ĐIỂM BẮT BUỘC:
1. Tính toán điểm số chính xác 100%:
   - Điểm của từng trụ cột = Tổng điểm các tiêu chí con trong trụ cột đó.
   - TỔNG ĐIỂM SỨC KHỎE GBP = Điểm Trụ cột I + II + III + IV + V (Tối đa 100 điểm). Tuyệt đối không để sai lệch phép cộng!
   - Tiêu chí 1 Trụ cột III (Điểm đánh giá trung bình): 4.5 – 5.0★ = 6đ; 4.0 – 4.4★ = 4đ; 3.5 – 3.9★ = 2đ; dưới 3.5★ = 0đ (ví dụ 4.4★ thì BẮT BUỘC là 4/6đ, không được cho 6/6đ).
   - Tiêu chí 4 Trụ cột III (Chất lượng phản hồi): Nếu quán không có phản hồi nào (Tiêu chí 3 bị 0/7đ), thì Tiêu chí 4 BẮT BUỘC là 0/6đ (trừ toàn bộ 6đ do chưa có phản hồi nào để đánh giá).
2. Xếp loại sức khỏe hồ sơ:
   - 90 - 100 điểm: Xuất sắc (Chuẩn SEO toàn diện, khả năng cao duy trì Top 3 Local Pack)
   - 85 - 89 điểm: Tốt (Cơ bản tốt, cần hoàn thiện Text Menu, bài đăng và review định kỳ)
   - 75 - 84 điểm: Khá (Bỏ sót nhiều điểm tối ưu, thất thoát lượng khách tiềm năng)
   - 50 - 74 điểm: Trung bình (Lỗ hổng lớn về Menu số, thiếu tương tác, cần tối ưu gấp)
   - Dưới 50 điểm: Yếu (Nguy cơ bị phạt/ẩn Map, bỏ hoang hồ sơ)
3. Mọi điểm trừ phải đi kèm:
   - Mức điểm trừ cụ thể theo barem (ví dụ: Trừ 7đ, Trừ 4đ, Trừ 2đ).
   - Thực trạng ghi nhận từ hồ sơ (Bằng chứng cụ thể).
   - Hậu quả Local SEO và trải nghiệm khách.
   - Giải pháp / Khuyến nghị hành động thực chiến.
4. Tôn trọng dữ liệu thật:
   - Không bịa đặt thông tin chưa có trong hồ sơ.
   - Không dùng thuật ngữ lập trình như null, undefined, JSON, API. Dùng ngôn ngữ tư vấn kinh doanh tự nhiên.

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
Báo cáo trình bày theo đúng định dạng Markdown sau (không bọc trong code block):

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

export function buildPrompt({ profile, currentAnalysis, messages }: AuditInput): string {
  const p = record(profile);
  const menuCategories = rows(record(p.menu).categories);
  const items = menuCategories.flatMap(c => rows(c.items)).filter(i => typeof i.title === "string" && i.title.trim());

  const brief = {
    "Tên nhà hàng": label(p.title),
    "Địa chỉ niêm yết": label(p.address),
    "Số điện thoại": label(p.phone),
    "Website": label(p.website),
    "Giờ mở cửa": rows(p.hours).map(h => ({ "Ngày": h.day, "Giờ": h.time })),
    "Danh mục/Loại hình": p.types,
    "Điểm đánh giá sao": p.rating ?? UNKNOWN,
    "Tổng số đánh giá": p.reviews_count ?? UNKNOWN,
    "Phân bố số sao": rows(p.rating_summary).map(r => ({ "Số sao": r.stars, "Số lượt": r.amount })),
    "Khoảng giá niêm yết": label(p.price),
    "Giá do khách báo cáo": rows(record(p.price_details).distribution).map(r => ({ "Mức giá": r.price, "Tỷ lệ": r.percentage, "Số khách": r.reported_count })),
    "Liên kết đặt bàn / Đặt chỗ": rows(p.booking_links).map(l => ({ "Tên kênh": l.name, "Đường dẫn": l.link })),
    "Thực đơn Text Menu": {
      "Số món chữ ghi nhận": items.length,
      "Số nhóm món": menuCategories.length,
      "Số món có giá": items.filter(i => typeof i.price === "string" && i.price.trim()).length,
      "Số món có mô tả": items.filter(i => typeof i.description === "string" && i.description.trim()).length,
      "Chi tiết món tiêu biểu": items.slice(0, 10).map(i => ({ "Tên món": i.title, "Giá": i.price, "Mô tả": i.description })),
      "Link menu ngoài": label(record(p.menu).link),
      "Ảnh thực đơn": rows(record(p.menu).images).length,
    },
    "Hình ảnh hồ sơ": {
      "Có ảnh đại diện/thumbnail": p.thumbnail ? "Có" : "Không",
      "Tổng số ảnh thu thập": rows(p.images).length,
      "Nhãn ảnh": rows(p.images).slice(0, 15).map(img => label(img.title)),
    },
    "Tiện ích ghi nhận": rows(p.extensions).flatMap(e => Array.isArray(e.items) ? e.items.filter(i => typeof i === "string") : []),
    "Giới thiệu của nhà hàng": label(p.description),
    "Mẫu đánh giá của khách": rows(p.user_reviews).slice(0, 5).map(r => ({
      "Khách hàng": r.username,
      "Số sao": r.rating,
      "Thời điểm": r.date,
      "Nội dung": r.description,
      "Có ảnh đính kèm": rows(r.images).length > 0,
    })),
    "Đối thủ cùng khu vực được Google gợi ý": rows(p.similar_places).slice(0, 4).map(s => ({
      "Tên": s.title,
      "Số sao": s.rating,
      "Số đánh giá": s.reviews,
    })),
  };

  const instructions = (messages || []).filter(message => message.role === "user").map(message => message.content);

  return `Hãy lập Báo cáo Kiểm toán & Đánh giá Sức khỏe Hồ sơ Google Business Profile chi tiết theo bộ khung 100 điểm cho nhà hàng sau:

<ho_so_nha_hang>
${JSON.stringify(brief, null, 2)}
</ho_so_nha_hang>
${instructions.length ? `<bao_cao_truoc>${currentAnalysis || ""}</bao_cao_truoc>
<yeu_cau_truoc>${instructions.length > 1 ? evidenceText(instructions.slice(0, -1)) : "Chưa có yêu cầu trước."}</yeu_cau_truoc>
YÊU CẦU HIỆN TẠI:
${instructions[instructions.length - 1]}

Sửa trực tiếp toàn bộ báo cáo theo yêu cầu hiện tại và giữ các đính chính trước đó. Trả đúng hai phần:
${CHAT_MARKER}
Nêu ngắn gọn nội dung cụ thể đã thay, không chỉ nhắc lại yêu cầu.
${REPORT_MARKER}
TOÀN BỘ báo cáo đã sửa theo khung điểm 100. Chỉ ghi GIỮ NGUYÊN nếu người dùng chỉ hỏi giải thích và không yêu cầu sửa.` : "Viết ngay toàn bộ báo cáo với đầy đủ các mục theo chỉ dẫn hệ thống."}`;
}

/** Chỉ nhận điểm được công bố rõ ràng; hỗ trợ thang 100 và thang 10. */
export function parseAndValidateScore(text: string): string | null {
  const lines = text.normalize("NFC").split(/\r?\n/).map(plainHeading).filter(Boolean);
  const label = /^(?:Điểm sức khỏe hồ sơ|Điểm sức khỏe GBP|Điểm tổng kết|Tổng điểm sức khỏe GBP|Điểm cạnh tranh|Điểm đánh giá cạnh tranh|Competitive score)(?:\s*:|$)/i;
  const indices = lines.flatMap((line, index) => label.test(line) ? [index] : []);
  
  if (indices.length >= 1) {
    const index = indices[0];
    const scoreText = lines[index].replace(label, "").trim() || lines[index + 1] || "";
    const match = scoreText.match(/^(\d{1,3}(?:[.,]\d)?)\s*\/\s*(100|10)\s*$/);
    if (match) {
      const score = Number(match[1].replace(",", "."));
      const scale = Number(match[2]);
      if (Number.isFinite(score) && score >= 0 && score <= scale) return String(score);
    }
  }

  // Quét linh hoạt mẫu trong toàn bộ văn bản
  const matchGlobal = text.match(/(?:Điểm sức khỏe hồ sơ|Điểm sức khỏe GBP|Điểm tổng kết|Tổng điểm sức khỏe GBP|Điểm cạnh tranh)[^:\n]*:\s*(\d{1,3}(?:[.,]\d)?)\s*\/\s*(100|10)(?!\d)/i);
  if (matchGlobal) {
    const score = Number(matchGlobal[1].replace(",", "."));
    const scale = Number(matchGlobal[2]);
    if (Number.isFinite(score) && score >= 0 && score <= scale) return String(score);
  }

  return null;
}

function plainHeading(line: string): string {
  return line.replace(/\u00a0/g, " ").replace(/\*\*|__/g, "").trim()
    .replace(/^#{1,6}\s+/, "").replace(/\s+#+$/, "")
    .replace(/^\d+[.)]\s+/, "").replace(/:\s*$/, "").trim();
}

export function cleanBusinessReportText(text: string): string {
  return text.replace(/\u00a0/g, " ").trim();
}

export function splitRefinement(text: string) {
  const parts = text.normalize("NFC").split(/(?:\*\*)?===\s*BẢN BÁO CÁO CẬP NHẬT\s*===(?:\*\*)?/);
  if (parts.length !== 2) return null;
  const reply = parts[0].replace(CHAT_MARKER, "").trim();
  const report = parts[1].trim();
  if (!reply || !report) return null;
  return { reply, updatedAnalysis: report === "GIỮ NGUYÊN" ? null : report };
}

export function reportValidationError(text: string): string | null {
  if (parseAndValidateScore(text) === null) return "Điểm sức khỏe hồ sơ thiếu hoặc sai định dạng thang 0–100. Cần ghi rõ điểm dạng: ## Điểm sức khỏe hồ sơ: XX/100.";
  if (/không (?:tự |thể )?(?:đặt ra|đưa ra|chấm)[^.\n]{0,70}(?:điểm|con số đánh giá)|(?:không (?:có|cung cấp) sẵn)[^.\n]{0,50}điểm/i.test(text)) {
    return "Cần chấm điểm chuyên môn từ bằng chứng; không từ chối chấm điểm.";
  }
  const headings = text.normalize("NFC").split(/\r?\n/)
    .filter(line => /^\s*(?:#{1,6}\s+|\*\*|__)/.test(line))
    .map(line => plainHeading(line).toLocaleLowerCase());
  for (const alternatives of [
    ["Đánh giá tổng quan sức khỏe hồ sơ", "Đánh giá tổng quan"],
    ["Bảng điểm sức khỏe hồ sơ GBP", "Bảng điểm sức khỏe", "Điểm mạnh"],
    ["Phân tích chi tiết 5 trụ cột & Barem trừ điểm", "Phân tích chi tiết", "Cơ hội cải thiện", "Điểm yếu & thiếu sót"],
    ["Kế hoạch hành động 30 ngày", "Kế hoạch hành động", "Khuyến nghị hành động"],
  ]) {
    if (!alternatives.some(heading => headings.includes(heading.toLocaleLowerCase()))) return `Báo cáo thiếu mục ${alternatives[0]}.`;
  }
  if (text.length < 300) return "Báo cáo quá ngắn hoặc bị gián đoạn; cần hoàn thành nội dung.";
  const menuMatch = text.match(/(?:^|\n)[^\n]*(?:Đánh giá về Text Menu|Đánh giá Text Menu)[^\n]*\n([\s\S]*?)(?=\n\s*#{1,6}\s|$)/i);
  if (menuMatch && menuMatch[1].trim().length < 80) return "Mục Text Menu phải có nội dung đánh giá thực tế, không chỉ tiêu đề.";
  if (/(?:Google|thuật toán)[^.\n]{0,80}không (?:thể )?(?:đọc|hiểu|index|lập chỉ mục)[^.\n]{0,50}(?:ảnh|hình)/i.test(text)) {
    return "Không khẳng định Google không đọc được chữ trong ảnh. Đánh giá menu theo trải nghiệm khách và dữ liệu thực tế.";
  }
  const address = administrativeNameViolation(text);
  if (address) return `Nhận định địa chỉ/địa giới chưa có căn cứ đối chiếu (${address}). Bỏ kết luận đúng/sai và tác động SEO suy đoán; không trừ điểm vì địa giới.`;
  if (/`|\b(?:booking_links|menu\.(?:highlights|categories)|has_text_menu|text_menu_items_count|user_reviews|data_id|place_id)\b|(?:trường|thuộc tính)\s+(?:website|menu|categories|highlights)\b/i.test(text)) {
    return "Báo cáo còn tên trường hoặc cú pháp lập trình. Viết lại bằng ngôn ngữ tư vấn kinh doanh tự nhiên.";
  }
  return null;
}

export function responseValidationError(text: string, input: AuditInput): string | null {
  if (!input.messages?.length) return reportValidationError(text) || evidenceValidationError(text, input);
  const refinement = splitRefinement(text);
  if (!refinement) return "Cần trả đúng hai phần PHẢN HỒI CHAT và BẢN BÁO CÁO CẬP NHẬT.";
  if (administrativeNameViolation(refinement.reply)) return "Câu trả lời chat phán địa chỉ sai khi chưa đối chiếu; viết lại theo bằng chứng.";
  if (refinement.updatedAnalysis === null && /đã (?:cập nhật|chỉnh sửa|sửa|bổ sung)/i.test(refinement.reply)) return "Nói đã cập nhật nhưng không có báo cáo mới. Trả toàn bộ báo cáo đã sửa.";
  const latest = input.messages.filter(m => m.role === "user").at(-1)?.content || "";
  if (refinement.updatedAnalysis === null && /^(?:(?:hãy|vui lòng|giúp tôi|nhờ bạn)\s+)?(?:sửa|chỉnh sửa|viết lại|rút (?:gọn|ngắn)|bổ sung|cập nhật|biên tập)/i.test(latest.trim())) {
    return "Người dùng yêu cầu sửa báo cáo. Phải trả toàn bộ báo cáo đã sửa, không được giữ nguyên.";
  }
  const report = refinement.updatedAnalysis ?? input.currentAnalysis ?? "";
  return reportValidationError(report) || evidenceValidationError(report, input);
}

/** Dữ liệu không lấy được không phải bằng chứng quán thiếu thông tin. */
export function evidenceValidationError(text: string, input: AuditInput): string | null {
  const p = record(input.profile);
  const items = rows(record(p.menu).categories).flatMap(c => rows(c.items)).filter(i => i.title);
  const userContext = input.messages?.filter(m => m.role === "user").map(m => m.content).join("\n") || "";
  const priceSources = [p.price, p.description, ...rows(record(p.price_details).distribution).map(r => r.price),
    ...items.flatMap(i => [i.price, i.description]), ...rows(p.user_reviews).map(r => r.description), userContext]
    .filter(v => typeof v === "string").join("\n");
  const knownPrices = new Set(currencyValues(priceSources));
  const unknownPrice = currencyValues(text).find(value => !knownPrices.has(value));
  if (unknownPrice !== undefined) return `Số tiền ${unknownPrice} đồng chưa có trong tư liệu giá/menu/nhận xét hoặc thông tin người dùng. Giữ đúng số và đơn vị từ nguồn; không tự thêm cận dưới, đổi đơn vị hay coi giá khách kể là giá hiện hành.`;
  const sentences = text.split(/(?<=[.!?])\s+|\n/).filter(s => !/không (?:thể|nên|được) (?:kết luận|coi)|(?:chưa|không) đủ (?:căn cứ|bằng chứng)|nếu |cần (?:kiểm tra|đối chiếu|xác minh)/i.test(s));
  const unsupportedTrend = sentences.find(s => /(?:điểm|sao|lượt đánh giá)/i.test(s)
    && /(?:cho thấy|chứng minh|phản ánh)[^.!?]{0,100}(?:ổn định|trung thành|khách quen|tăng trưởng)/i.test(s));
  if (unsupportedTrend) return `Điểm sao/tổng lượt đánh giá không chứng minh khách quen, lòng trung thành hoặc xu hướng ổn định/tăng trưởng. Chỉ nêu tín hiệu đánh giá hiện có: ${unsupportedTrend.trim().slice(0, 260)}`;
  if (!items.length) {
    const imaginedGrouping = sentences.find(s => /(?:món|thực đơn|menu)/i.test(s)
      && /(?:được|hiện|đã)[^.!?]{0,40}(?:phân (?:chia|loại)|chia (?:theo|thành)|xếp (?:theo|vào))/i.test(s)
      && !/(?:chưa|không)[^.!?]{0,45}(?:thu thập|trích xuất|ghi nhận|đánh giá|xác định|đọc)/i.test(s));
    if (imaginedGrouping) return `Chưa có danh mục chữ và chưa đọc ảnh menu, không được mô tả cách phân nhóm món như đã quan sát. Viết rõ giới hạn đánh giá hoặc đề xuất có điều kiện: ${imaginedGrouping.trim().slice(0, 260)}`;
  }
  return null;
}
