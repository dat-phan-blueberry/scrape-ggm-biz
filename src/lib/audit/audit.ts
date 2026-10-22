/** Dùng chung cho Next, Edge và phần hiển thị; không phụ thuộc runtime. */
export const REPORT_MARKER = "=== BẢN BÁO CÁO CẬP NHẬT ===";
export const CHAT_MARKER = "=== PHẢN HỒI CHAT ===";
export const AUDIT_VERSION = "2026-09-15.2";
/** D-0113: nguồn đã lấy được mà không có mục đó thì là "không có", không để trạng thái lửng. */
const NONE = "Không có trên hồ sơ Google.";

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
  return typeof value === "string" && value.trim() ? value.trim() : NONE;
}

/** Đưa tư liệu sang ghi chú kinh doanh; giá trị chưa có không thành từ khóa lập trình. */
function evidenceText(value: unknown): string {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return NONE;
  if (Array.isArray(value)) return value.length
    ? value.map(item => `- ${evidenceText(item).replace(/\n/g, "\n  ")}`).join("\n") : NONE;
  if (typeof value === "object") return Object.entries(value).map(([name, item]) =>
    `${name}: ${evidenceText(item).replace(/\n/g, "\n  ")}`).join("\n") || NONE;
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : NONE;
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

const DAY_MS = 86_400_000;
function vnDate(iso: unknown, fallback: unknown = ""): string {
  const time = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return typeof fallback === "string" && fallback.trim() ? fallback.trim() : "không rõ ngày";
  return new Date(time).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}
function daysAgo(iso: unknown, now: number): number | null {
  const time = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / DAY_MS)) : null;
}
function clip(value: unknown, max: number): string {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function duration(hours: number): string {
  return hours < 1 ? "dưới 1 giờ" : hours < 48 ? `khoảng ${Math.round(hours)} giờ` : `khoảng ${Math.round(hours / 24)} ngày`;
}
/** Lý do mặc định khi một tiêu chí không chấm được vì nguồn không trả dữ kiện. */
function notEvaluated(reason: string): string {
  return `Không đánh giá — ${reason}`;
}

type Pillar = "I" | "II" | "III" | "IV" | "V";

/** Review mới đăng chưa tới 3 ngày chưa tính vào tỷ lệ phản hồi: chủ quán cần thời gian trả lời. */
const RESPONSE_GRACE_DAYS = 3;

/** Gộp mẫu mới nhất + mẫu nổi bật, bỏ trùng; chỉ giữ review đủ cũ để xét tỷ lệ phản hồi. */
function reviewPools(p: Record<string, unknown>, now: number) {
  const seen = new Set<string>();
  const all = [...rows(p.recent_reviews), ...rows(p.relevant_reviews)].filter(r => {
    const key = `${r.iso_date}|${r.snippet}|${r.rating}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const eligible = all.filter(r => (daysAgo(r.iso_date, now) ?? -1) >= RESPONSE_GRACE_DAYS);
  return { all, eligible };
}
const hasReply = (r: Record<string, unknown>) => !!record(r.response).snippet;
const PILLAR_MAX: Record<Pillar, number> = { I: 20, II: 20, III: 25, IV: 15, V: 20 };

export interface ExcludedCriterion { pillar: Pillar; name: string; max: number; reason: string }

/**
 * D-0113: dữ kiện chỉ có "có" hoặc "không". Tiêu chí mà dữ kiện quyết định không
 * thu thập được thì không chấm và bị loại khỏi điểm tối đa — tính bằng code để
 * AI không phải đoán.
 */
export function scoringScope(profile: unknown, now = Date.now()): { excluded: ExcludedCriterion[]; maxByPillar: Record<Pillar, number>; total: number } {
  const p = record(profile);
  const enrichment = record(p.enrichment);
  const collected = (source: string) => enrichment[source] === "ok";
  const items = rows(record(p.menu).categories).flatMap(c => rows(c.items)).filter(i => typeof i.title === "string" && i.title.trim());
  const namesOnly = p.menu_origin === "google_dishes";
  const kgOk = collected("knowledge_graph");
  // Không thấy món chưa chắc là quán không có món (khối món của Google không ổn định).
  const dishesOk = collected("dishes");
  const hasDescription = [p.merchant_description, p.description].some(v => typeof v === "string" && v.trim());
  const reviewPhotos = rows(p.user_reviews).some(r => Array.isArray(r.images) && r.images.length > 0);

  const excluded: ExcludedCriterion[] = [];
  const skip = (pillar: Pillar, name: string, max: number, reason: string) => excluded.push({ pillar, name, max, reason });

  // SerpAPI hiện chỉ trả nhóm hỗ trợ tiếp cận (+ vài lựa chọn dịch vụ từ KG), thiếu các nhóm chính
  // như hình thức phục vụ, thanh toán, tiện nghi — không đủ để chấm "quá sơ sài".
  const categoryCount = Array.isArray(p.types) ? p.types.filter(t => typeof t === "string" && t.trim()).length : 0;
  if (!categoryCount) skip("II", "1. Danh Mục", 5, "Không lấy được danh mục của hồ sơ (hồ sơ Google luôn có danh mục chính).");
  const fullAttributes = rows(p.extensions).some(e => !["accessibility", "Lựa chọn dịch vụ"].includes(String(e.key)));
  if (!fullAttributes) skip("I", "5. Tiện Ích Thuộc Tính", 3, "Google chỉ trả một phần thuộc tính (hỗ trợ tiếp cận, lựa chọn dịch vụ), không đủ để đánh giá mức đầy đủ.");
  // Danh sách món của Google có tên + giá (nếu chủ quán niêm yết) nhưng không có mô tả:
  // chấm được Bảng giá, không chấm được Text Menu (barem phân biệt có/không mô tả).
  if (namesOnly) {
    skip("II", "2. Số Hóa Menu - Text Menu", 7, "Google trả tên món nhưng không trả mô tả từng món.");
  } else if (!items.length && !dishesOk) {
    skip("II", "2. Số Hóa Menu - Text Menu", 7, "Không lấy được danh sách món từ Google.");
    skip("II", "3. Minh Bạch Bảng Giá", 4, "Không lấy được danh sách món và giá từ Google.");
  }
  if (!items.length && !rows(p.menu_highlights).length && !dishesOk) skip("II", "4. Hình Đại Diện Từng Món Ăn", 4, "Không lấy được danh sách món kèm ảnh từ Google.");
  if (!collected("reviews")) {
    skip("III", "2. Số Lượng & Mật Độ Review Mới", 6, "Không lấy được ngày của các đánh giá mới nhất.");
    skip("III", "3. Tỷ Lệ & Tốc Độ Phản Hồi", 7, "Không lấy được phản hồi của chủ quán.");
    skip("III", "4. Chất Lượng Nội Dung Phản Hồi", 6, "Không lấy được phản hồi của chủ quán.");
  } else if (reviewPools(p, now).all.length && !reviewPools(p, now).eligible.length) {
    skip("III", "3. Tỷ Lệ & Tốc Độ Phản Hồi", 7, `Các đánh giá lấy được đều mới đăng dưới ${RESPONSE_GRACE_DAYS} ngày, chủ quán chưa đủ thời gian phản hồi.`);
    skip("III", "4. Chất Lượng Nội Dung Phản Hồi", 6, `Các đánh giá lấy được đều mới đăng dưới ${RESPONSE_GRACE_DAYS} ngày.`);
  }
  if (!collected("photos")) {
    skip("IV", "2. Hình Ảnh Không Gian", 6, "Không lấy được album ảnh của hồ sơ.");
    if (!reviewPhotos) skip("IV", "3. Tỷ Lệ Ảnh Khách Đăng - UGC", 5, "Không lấy được album ảnh và ảnh khách đăng.");
  }
  if (!collected("posts")) skip("V", "1. Tần Suất Đăng Bài Cập Nhật", 4, "Không lấy được bài đăng của hồ sơ.");
  // Nguồn Google hiện không trả mục Hỏi & Đáp cho mọi địa điểm (đã thử search/place_id/data_cid, vi/en).
  skip("V", "3. Mục Hỏi & Đáp Chủ Động", 3, "Nguồn dữ liệu Google không trả mục Hỏi & Đáp.");
  if (!hasDescription && !kgOk) skip("V", "4. Giới Thiệu Doanh Nghiệp", 6, "Không lấy được phần giới thiệu doanh nghiệp.");

  const maxByPillar = { ...PILLAR_MAX };
  for (const e of excluded) maxByPillar[e.pillar] -= e.max;
  return { excluded, maxByPillar, total: Object.values(maxByPillar).reduce((a, b) => a + b, 0) };
}

export function businessBrief(profile: unknown, now = Date.now()) {
  const p = record(profile);
  const menu = record(p.menu);
  const categories = rows(menu.categories);
  const items = categories.flatMap(c => rows(c.items)).filter(i => typeof i.title === "string" && i.title.trim());
  const enrichment = record(p.enrichment);
  const collected = (source: string) => enrichment[source] === "ok";
  const kgOk = collected("knowledge_graph");
  const scope = scoringScope(profile, now);
  const menuLinks = Array.from(new Set([menu.link, ...rows(p.menu_links).map(l => l.link)]
    .filter((l): l is string => typeof l === "string" && l.trim() !== "")));
  const photoCats = Array.isArray(p.photo_categories) ? p.photo_categories.map(String).filter(Boolean) : [];
  const dishes = rows(p.menu_highlights);
  const highlights = rows(menu.highlights).map(h => label(h.title));
  const kgHighlights = dishes.map(h => typeof h.photos === "number" ? `${h.title} (${h.photos} ảnh)` : String(h.title));
  const unsupported = rows(p.unsupported_extensions).flatMap(e => Array.isArray(e.items) ? e.items.filter(i => typeof i === "string") : []);
  // Thực đơn dựng từ danh sách món Google: có tên, nguồn không trả giá/mô tả nên hai tiêu chí đó không chấm.
  const namesOnly = p.menu_origin === "google_dishes";

  const ownerText = typeof p.merchant_description === "string" ? p.merchant_description.trim() : "";
  const googleText = typeof p.description === "string" ? p.description.trim() : "";
  const descriptionSource = ownerText
    ? `Doanh nghiệp tự viết (mục "Từ doanh nghiệp" trên Google), ${ownerText.length} ký tự.`
    : googleText
    ? `Tóm tắt Google hiển thị, ${googleText.length} ký tự${kgOk ? "; hồ sơ không có mô tả do doanh nghiệp tự viết" : ""}.`
    : kgOk ? "Không có mô tả doanh nghiệp." : notEvaluated("không lấy được phần giới thiệu doanh nghiệp.");

  const reviews = rows(p.recent_reviews);
  const relevantCount = rows(p.relevant_reviews).length;
  const { all: reviewPool, eligible } = reviewPools(p, now);
  // Tỷ lệ phản hồi chỉ xét review đủ cũ; tốc độ và ví dụ phản hồi dùng mọi review đã được trả lời.
  const responded = eligible.filter(hasReply);
  const repliedAny = reviewPool.filter(hasReply);
  const low = eligible.filter(r => typeof r.rating === "number" && r.rating <= 2);
  const responseHours = repliedAny.flatMap(r => {
    const diff = Date.parse(String(record(r.response).iso_date)) - Date.parse(String(r.iso_date));
    return Number.isFinite(diff) && diff >= 0 ? [diff / 3_600_000] : [];
  }).sort((a, b) => a - b);
  const reviewDates = reviews.map(r => r.iso_date).filter((d): d is string => typeof d === "string" && Number.isFinite(Date.parse(d))).sort();
  const newestReviewDays = daysAgo(reviewDates[reviewDates.length - 1], now);
  const ownerResponses = !collected("reviews") ? notEvaluated("không lấy được đánh giá mới nhất và phản hồi của chủ quán.")
    : !reviewPool.length ? "Không có đánh giá nào."
    : {
      "Phạm vi mẫu": `${reviews.length} đánh giá mới nhất${reviewDates.length ? ` (từ ${vnDate(reviewDates[0])} đến ${vnDate(reviewDates[reviewDates.length - 1])})` : ""} và ${relevantCount} đánh giá nổi bật trên Google Maps.`,
      "Số đánh giá được chủ quán phản hồi": eligible.length
        ? `${responded.length}/${eligible.length} (chỉ tính đánh giá đã đăng từ ${RESPONSE_GRACE_DAYS} ngày trở lên)`
        : notEvaluated(`các đánh giá lấy được đều mới đăng dưới ${RESPONSE_GRACE_DAYS} ngày.`),
      "Đánh giá 1–2★ trong mẫu": low.length ? `${low.filter(r => record(r.response).snippet).length}/${low.length} đã được phản hồi` : "Không có.",
      "Thời gian phản hồi trung vị": responseHours.length ? duration(responseHours[Math.floor(responseHours.length / 2)]) : "Không có phản hồi để tính.",
      "Đánh giá mới nhất": newestReviewDays === null ? "Không rõ ngày." : `cách đây ${newestReviewDays} ngày`,
      "Số đánh giá trong 30 ngày gần nhất (trong mẫu)": reviewDates.filter(d => (daysAgo(d, now) ?? Infinity) <= 30).length,
      "Ví dụ phản hồi của chủ quán": repliedAny.length ? repliedAny.slice(0, 5).map(r => ({
        "Số sao": r.rating, "Khách viết": clip(r.snippet, 160), "Chủ quán trả lời": clip(record(r.response).snippet, 300),
      })) : "Không có phản hồi nào trong mẫu.",
    };

  const posts = rows(p.posts);
  const postDays = posts.map(pt => daysAgo(pt.iso_date, now)).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const latestPost = posts.find(pt => daysAgo(pt.iso_date, now) === postDays[0]);
  const updates = !collected("posts") ? notEvaluated("không lấy được bài đăng của hồ sơ.")
    : !posts.length ? "Không có bài đăng nào."
    : {
      "Số bài đăng lấy được": `${posts.length} (trang đầu, tối đa 10 bài gần nhất)`,
      "Bài gần nhất": postDays.length ? `${vnDate(latestPost?.iso_date)} (cách đây ${postDays[0]} ngày)` : vnDate(undefined, posts[0].date),
      "Số bài trong 60 ngày gần nhất": postDays.filter(d => d <= 60).length,
      "Số bài có ảnh": posts.filter(pt => pt.has_image === true).length,
      "Bài tiêu biểu": posts.slice(0, 3).map(pt => ({ "Ngày": vnDate(pt.iso_date, pt.date), "Nội dung": clip(pt.snippet, 200) || "Chỉ có ảnh, không có chữ." })),
    };

  const dishesWithPhoto = dishes.filter(h => typeof h.photos === "number" && h.photos > 0).length;

  // Tiêu chí có số liệu rõ: tính điểm theo barem bằng code để AI không nới/siết tay (D-0113).
  const excludedNames = new Set(scope.excluded.map(e => `${e.pillar}.${e.name}`));
  const preset: string[] = [];
  const set = (key: string, score: number, max: number, why: string) => {
    if (!excludedNames.has(key)) preset.push(`${key}: ${score}/${max}đ — ${why}`);
  };
  if (typeof p.rating === "number") {
    const r = p.rating;
    set("III.1. Điểm Đánh Giá Trung Bình", r >= 4.5 ? 6 : r >= 4 ? 4 : r >= 3.5 ? 2 : 0, 6, `${r}★.`);
  }
  if (collected("reviews")) {
    const total = typeof p.reviews_count === "number" ? p.reviews_count : null;
    const recent = reviewDates.filter(d => (daysAgo(d, now) ?? Infinity) <= 30).length;
    if (total !== null && total < 25) set("III.2. Số Lượng & Mật Độ Review Mới", 0, 6, `chỉ có ${total} lượt đánh giá (dưới 25).`);
    else if (reviews.length && !recent) set("III.2. Số Lượng & Mật Độ Review Mới", 3, 6, "không có đánh giá mới trong 30 ngày.");
    if (eligible.length) {
      const median = responseHours.length ? responseHours[Math.floor(responseHours.length / 2)] : null;
      const lowUnanswered = low.filter(r => !hasReply(r)).length;
      const why = `chủ quán phản hồi ${responded.length}/${eligible.length} đánh giá đã đăng từ ${RESPONSE_GRACE_DAYS} ngày trở lên${median === null ? "" : `, trung vị ${duration(median)}`}`;
      if (!responded.length && !repliedAny.length) {
        set("III.3. Tỷ Lệ & Tốc Độ Phản Hồi", 0, 7, `không phản hồi đánh giá nào trong ${reviewPool.length} đánh giá lấy được.`);
        set("III.4. Chất Lượng Nội Dung Phản Hồi", 0, 6, "chưa có phản hồi nào để đánh giá.");
      } else if (lowUnanswered) set("III.3. Tỷ Lệ & Tốc Độ Phản Hồi", 2, 7, `${why}; bỏ trống ${lowUnanswered} đánh giá 1–2★.`);
      else if (responded.length / eligible.length < 0.8 || (median !== null && median > 120)) set("III.3. Tỷ Lệ & Tốc Độ Phản Hồi", 4, 7, `${why}; tỷ lệ dưới 80% hoặc chậm hơn 5 ngày.`);
      else set("III.3. Tỷ Lệ & Tốc Độ Phản Hồi", 7, 7, `${why}.`);
    }
  }
  if (collected("posts")) {
    const latest = postDays.length ? postDays[0] : null;
    if (!posts.length) set("V.1. Tần Suất Đăng Bài Cập Nhật", 0, 4, "hồ sơ không có bài đăng nào.");
    else if (latest !== null && latest > 60) set("V.1. Tần Suất Đăng Bài Cập Nhật", 0, 4, `bài gần nhất cách đây ${latest} ngày (cũ hơn 60 ngày).`);
    else if (postDays.filter(d => d <= 30).length >= 4) set("V.1. Tần Suất Đăng Bài Cập Nhật", 4, 4, "có từ 4 bài trở lên trong 30 ngày gần nhất.");
    else if (latest !== null) set("V.1. Tần Suất Đăng Bài Cập Nhật", 2, 4, `bài gần nhất cách đây ${latest} ngày nhưng dưới 4 bài/30 ngày (đăng thưa).`);
  }
  const typeCount = Array.isArray(p.types) ? p.types.filter(t => typeof t === "string" && t.trim()).length : 0;
  if (typeCount === 1) set("II.1. Danh Mục", 2, 5, `có danh mục chính "${String((p.types as unknown[])[0])}" nhưng không có danh mục phụ.`);
  // Ảnh: chỉ dùng dữ kiện có/không; mức trừ cần xem chất lượng, logo hay mặt tiền không áp dụng.
  set("IV.1. Ảnh Đại Diện & Ảnh Bìa", p.thumbnail ? 4 : 0, 4, p.thumbnail ? "hồ sơ có ảnh đại diện." : "hồ sơ không có ảnh đại diện.");
  if (collected("photos")) {
    const atmosphere = photoCats.some(c => /bầu không khí|không gian|atmosphere|vibe/i.test(c));
    if (atmosphere) set("IV.2. Hình Ảnh Không Gian", 6, 6, "hồ sơ có album ảnh Bầu không khí.");
  }
  const reviewPhotos = rows(p.user_reviews).filter(r => Array.isArray(r.images) && r.images.length > 0).length;
  if (reviewPhotos) set("IV.3. Tỷ Lệ Ảnh Khách Đăng - UGC", 5, 5, `${reviewPhotos} đánh giá mẫu có ảnh do khách đăng.`);
  if (items.length) {
    const priced = items.filter(i => typeof i.price === "string" && i.price.trim()).length;
    const tier = typeof p.price === "string" && p.price.trim() !== "";
    if (!priced) set("II.3. Minh Bạch Bảng Giá", 0, 4, `không món nào trong ${items.length} món có giá.`);
    else if (priced < items.length) set("II.3. Minh Bạch Bảng Giá", 2, 4, `chỉ ${priced}/${items.length} món có giá.`);
    else set("II.3. Minh Bạch Bảng Giá", tier ? 4 : 3, 4, `${priced}/${items.length} món có giá${tier ? "" : "; chưa chọn phân khúc giá"}.`);
  }
  if (dishes.length) {
    const ratio = dishesWithPhoto / dishes.length;
    set("II.4. Hình Đại Diện Từng Món Ăn", ratio === 0 ? 0 : ratio < 0.5 ? 2 : 4, 4, `${dishesWithPhoto}/${dishes.length} món có ảnh thực tế.`);
  }
  const descriptionLength = (ownerText || googleText).length;
  if (!descriptionLength && kgOk) set("V.4. Giới Thiệu Doanh Nghiệp", 0, 6, "hồ sơ không có phần giới thiệu.");
  else if (descriptionLength && descriptionLength < 100) set("V.4. Giới Thiệu Doanh Nghiệp", 3, 6, `phần giới thiệu chỉ ${descriptionLength} ký tự (dưới 100).`);

  return {
    "Phạm vi chấm điểm": {
      "Tiêu chí KHÔNG ĐÁNH GIÁ (không chấm, không trừ, loại khỏi điểm tối đa)": scope.excluded.map(e => `${e.pillar}.${e.name} (${e.max}đ): ${e.reason}`),
      "Điểm tối đa được chấm theo trụ cột": (Object.keys(scope.maxByPillar) as Pillar[]).map(k => `${k}: ${scope.maxByPillar[k]}/${PILLAR_MAX[k]}`).join(" · "),
      "Tổng điểm tối đa được chấm": scope.total,
      "Điểm đã tính sẵn theo barem (dùng đúng số này)": preset.length ? preset : "Không có.",
    },
    "Tên nhà hàng": label(p.title),
    "Loại hình": p.types,
    "Giới thiệu của nhà hàng": ownerText || googleText || (kgOk ? NONE : notEvaluated("không lấy được phần giới thiệu doanh nghiệp.")),
    "Nguồn và độ dài phần giới thiệu": descriptionSource,
    // Nguồn hiện chưa có địa chỉ đã đối chiếu hành chính: không đưa địa chỉ thô cho AI sao chép.
    "Địa chỉ": p.address ? "Có địa chỉ và vị trí ghim trên hồ sơ. Không đối chiếu địa giới hay địa chỉ giữa các kênh nên không kết luận sai địa chỉ/NAP." : NONE,
    "Điện thoại liên hệ": label(p.phone),
    "Trang web được ghi nhận": label(p.website),
    "Mạng xã hội liên kết trên hồ sơ": rows(p.social_links).length ? rows(p.social_links).map(l => `${l.name}: ${l.link}`) : NONE,
    "Giờ mở cửa": rows(p.hours).map(h => ({ "Ngày": h.day, "Giờ": h.time })),
    "Điểm sao của khách (thang 5)": p.rating ?? NONE,
    "Tổng lượt đánh giá": p.reviews_count ?? NONE,
    "Phân bố đánh giá": rows(p.rating_summary).map(r => ({ "Số sao": r.stars, "Số lượt": r.amount })),
    "Phản hồi của chủ quán với đánh giá": ownerResponses,
    "Khoảng giá": label(p.price),
    "Giá do khách báo cáo": rows(record(p.price_details).distribution).map(r => ({ "Mức giá": r.price, "Tỷ lệ": r.percentage, "Số khách": r.reported_count })),
    "Kênh đặt chỗ ghi nhận": rows(p.booking_links).map(l => ({ "Tên kênh": l.name, "Đường dẫn": l.link })),
    "Thực đơn dạng chữ": {
      "Tình trạng": items.length && namesOnly
        ? `Google Maps hiển thị ${items.length} món có tên dạng chữ (có tên món, số ảnh và giá nếu chủ quán niêm yết; Google không trả mô tả món).`
        : items.length
        ? `Có ${items.length} món có tên dạng chữ.`
        : collected("dishes") ? "Không có món dạng chữ trên hồ sơ Google." : notEvaluated("không lấy được danh sách món."),
      "Số món có tên": items.length,
      "Số món có giá": items.filter(i => typeof i.price === "string" && i.price.trim()).length,
      "Số món có mô tả": namesOnly ? notEvaluated("Google không trả mô tả từng món.") : items.filter(i => typeof i.description === "string" && i.description.trim()).length,
      "Số nhóm có món": categories.filter(c => rows(c.items).length).length,
      "Liên kết thực đơn": menuLinks.length === 1 ? menuLinks[0] : menuLinks.length ? menuLinks : NONE,
      "Nguồn liên kết": label(menu.source),
      "Số ảnh thực đơn": rows(menu.images).length,
      "Danh mục": categories.map(c => ({ "Nhóm món": c.title, "Các món": rows(c.items).map(i => ({ "Tên món": i.title, "Giá": i.price, "Mô tả": i.description })) })),
    },
    "Món nổi bật ghi nhận": kgHighlights.length ? kgHighlights : highlights,
    "Số món có ảnh thực tế": dishes.length ? `${dishesWithPhoto}/${dishes.length}` : items.length ? NONE : collected("dishes") ? "Không có món nào." : notEvaluated("không lấy được danh sách món kèm ảnh."),
    "Hình ảnh": {
      "Số ảnh lấy được": rows(p.images).length,
      "Có ảnh đại diện": p.thumbnail ? "Có" : "Không",
      "Nhãn ảnh": rows(p.images).map(i => label(i.title)),
      "Danh mục album ảnh trên Google Maps": !collected("photos") ? notEvaluated("không lấy được album ảnh.") : photoCats.length ? photoCats : "Không có album ảnh.",
    },
    "Bài đăng cập nhật trên Google": updates,
    "Tiện ích ghi nhận": rows(p.extensions).flatMap(e => Array.isArray(e.items) ? e.items.filter(i => typeof i === "string") : []),
    "Tiện ích Google ghi nhận là KHÔNG có": unsupported.length ? unsupported : NONE,
    "Nhận xét khách hàng (mẫu thu thập, không đại diện toàn bộ)": rows(p.user_reviews).map(r => ({ "Số sao": r.rating, "Thời điểm": r.date, "Nội dung": r.description })),
    "Địa điểm được Google gợi ý cùng (chưa xác minh là đối thủ trực tiếp)": rows(p.similar_places).map(s => ({ "Tên": s.title, "Số sao": s.rating, "Số đánh giá": s.reviews })),
    "Quản lý hồ sơ": responded.length
      ? "Chủ quán đang trả lời đánh giá, cho thấy hồ sơ đang được quản lý."
      : p.unclaimed === true ? "Nguồn hiển thị lời mời nhận quản lý; cần xác nhận với chủ nhà hàng." : "Chưa đủ căn cứ kết luận quyền quản lý hay trạng thái xác minh.",
  };
}

export const MAX_AUDIT_KEY_ATTEMPTS = 256;

export interface AuditInput {
  profile: unknown;
  currentAnalysis?: string;
  messages?: Array<{ role: string; content: string }>;
  attemptedKeySlots?: number[];
}

export const AUDIT_PROMPT_VERSION = "2026-10-22.3";
export const AUDIT_SYSTEM_INSTRUCTION = `Bạn là Chuyên gia Tư vấn Chiến lược F&B & Local SEO cao cấp, đồng hành cùng đội ngũ tư vấn GoDine.

MỤC TIÊU:
Lập bản "Báo cáo Kiểm toán & Đánh giá Sức khỏe Hồ sơ Google Business Profile (GBP)" chuyên nghiệp, sắc bén và định lượng dựa trên BỘ KHUNG CHẤM ĐIỂM 100 ĐIỂM (5 Trụ cột - 19 Tiêu chí).
Báo cáo dùng làm tài liệu tư vấn trực tiếp cho chủ nhà hàng, chỉ rõ từng "lỗ rò doanh thu" làm thất thoát khách hàng và rủi ro Local SEO, kèm theo giải pháp cải thiện cụ thể để thuyết phục chủ nhà hàng tối ưu hóa hồ sơ và kích hoạt đặt bàn GoDine.

VĂN PHONG & NGÒI BÚT (WRITER & ANALYST CALIBER):
- Mang ngòi bút của một nhà văn ẩm thực kiêm chuyên gia phân tích tăng trưởng F&B sắc sảo, trending và uyên bác.
- Lối viết trực diện, đanh thép, giàu hình ảnh ẩn dụ sống động (như "vương triều ngủ quên", "mặt tiền số bị bỏ hoang", "lỗ rò doanh thu âm thầm", "ngôi sao lặn sau thuật toán"), lột tả chân thực nỗi đau thất thoát khách hàng và cơ hội bứt phá của quán.
- Tuyệt đối không dùng văn mẫu ChatGPT chung chung, sáo rỗng, vô hồn (tránh các mẫu câu rập khuôn như "đóng vai trò quan trọng", "để nâng cao trải nghiệm", "nhằm tối ưu hóa"). Mỗi câu đều phải chứa giá trị thông tin, bằng chứng thực tế và tác động kinh doanh rõ ràng.
- Viết cô đọng, gãy gọn, súc tích; tránh diễn giải dông dài để đảm bảo tốc độ phản hồi nhanh chóng và hiệu quả tư vấn cao nhất.
- BỐ CỤC THOÁNG & NGẮT ĐOẠN RÕ RÀNG (BẮT BUỘC): Tuyệt đối KHÔNG viết dồn nhiều câu thành một khối văn bản dài đặc chữ ("1 cục"). Mỗi đoạn văn chỉ từ 2–3 câu ngắn (tối đa 50–70 chữ) và BẮT BUỘC phải xuống dòng cách đoạn (có dòng trống ở giữa). Ở phần phân tích 19 tiêu chí, bắt buộc tách các ý (Thực trạng, Tác động & Khuyến nghị) xuống dòng thành các gạch đầu dòng con thụt lề thay vì viết nối dài trên cùng một dòng.

QUY TẮC TÍNH TOÁN & CHẤM ĐIỂM BẮT BUỘC:
1. Tính toán điểm số chính xác 100%:
   - Điểm của từng trụ cột = Tổng điểm các tiêu chí con trong trụ cột đó.
   - TỔNG ĐIỂM SỨC KHỎE GBP = Điểm Trụ cột I + II + III + IV + V (tối đa bằng "Tổng điểm tối đa được chấm" trong hồ sơ). Tuyệt đối không để sai lệch phép cộng!
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
5. Phạm vi chấm điểm (BẮT BUỘC):
   - Mỗi dữ kiện trong hồ sơ là CÓ hoặc KHÔNG. "Không có" nghĩa là hồ sơ Google không có mục đó và bị trừ điểm theo barem.
   - Tiêu chí thuộc danh sách "Tiêu chí KHÔNG ĐÁNH GIÁ" trong mục Phạm vi chấm điểm: không chấm, không trừ, ghi đúng một dòng theo mẫu "* **2. Số Hóa Menu - Text Menu (Không đánh giá):** Google trả tên món nhưng không trả mô tả từng món." (dùng số và tên thật của tiêu chí, lý do chép từ hồ sơ, không lặp lại tên tiêu chí), không viết thực trạng hay khuyến nghị dựa trên phỏng đoán.
   - Không mô tả tiêu chí KHÔNG ĐÁNH GIÁ như thiếu sót (không viết "trống", "thiếu", "bỏ ngỏ"…) ở phần tổng quan, bảng điểm hay kế hoạch hành động; nếu cần nhắc thì ghi "chưa đánh giá được".
   - Mức trừ cần dữ kiện mà hồ sơ không có (chất lượng/độ nét ảnh, link lỗi, thao tác đặt bàn trên điện thoại, NAP giữa các kênh, nút kêu gọi hành động của bài đăng, giờ đặc biệt) thì không áp dụng.
   - Tiêu chí có trong "Điểm đã tính sẵn theo barem": dùng đúng số điểm đó, chỉ viết thực trạng, tác động và khuyến nghị theo lý do kèm theo.
   - Giới thiệu doanh nghiệp từ 100 ký tự trở lên chỉ bị trừ khi nhồi từ khóa gượng ép; không trừ vì độ dài.
   - Cột "Điểm tối đa" của từng trụ cột và dòng tổng dùng đúng số trong "Điểm tối đa được chấm theo trụ cột" và "Tổng điểm tối đa được chấm".
   - Điểm sức khỏe hồ sơ (thang 100) = làm tròn (Tổng điểm đạt ÷ Tổng điểm tối đa được chấm × 100). Xếp loại theo điểm thang 100 này.

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
3. Tỷ Lệ & Tốc Độ Phản Hồi (7đ): Phản hồi 100% trong 12-24h. Hoàn toàn không phản hồi đánh giá nào: trừ 7đ (0/7đ); Bỏ trống review tiêu cực 1-2★: trừ 5đ; Tỷ lệ <80% hoặc phản hồi chậm >5 ngày: trừ 3đ.
4. Chất Lượng Nội Dung Phản Hồi (6đ): Cá nhân hóa, xử lý phàn nàn khéo, lồng từ khóa Local SEO. Hoàn toàn chưa có phản hồi nào để đánh giá (do Tiêu chí 3 bị 0/7đ): BẮT BUỘC trừ 6đ (0/6đ); Cộc lốc/tranh cãi: trừ 6đ; Dùng mẫu rập khuôn copy-paste: trừ 3đ.

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
Báo cáo trình bày theo đúng định dạng Markdown sau (bắt đầu ngay bằng tiêu đề đầu tiên, không bọc trong code block \`\`\`):

## Đánh giá tổng quan sức khỏe hồ sơ
(Đoạn 1 — 2 câu ngắn: Khái quát vị thế thương hiệu, điểm sáng uy tín và lượng đánh giá thực tế hiện có của nhà hàng.)

(Đoạn 2 — 2-3 câu ngắn: Chỉ rõ các "lỗ rò doanh thu" và điểm mù chí mạng trên mặt tiền số GBP đang âm thầm đẩy thực khách vào tay đối thủ.)

(Đoạn 3 — 1-2 câu ngắn: Kết luận mức độ cấp thiết cần chuẩn hóa Local SEO và kích hoạt điểm chạm đặt bàn trực tuyến GoDine.)

## Bảng điểm sức khỏe hồ sơ GBP
| Hạng mục trụ cột | Điểm đạt | Điểm tối đa | Đánh giá tóm tắt từ chuyên gia |
| :--- | :---: | :---: | :--- |
| **I. Thông tin cơ bản & Tính nhất quán** | **X** | Y | ... |
| **II. Danh mục & Số hóa thực đơn** | **X** | Y | ... |
| **III. Uy tín xã hội & Danh tiếng** | **X** | Y | ... |
| **IV. Nội dung thị giác & Trải nghiệm không gian** | **X** | Y | ... |
| **V. Mức độ hoạt động & Tương tác định kỳ** | **X** | Y | ... |
| **TỔNG ĐIỂM SỨC KHỎE GBP** | **XX** | **YY** | **XẾP LOẠI: [Xuất sắc / Tốt / Khá / Trung bình / Yếu] (Điểm thang 100: ZZ; lý do)** |
(Y, YY lấy từ mục Phạm vi chấm điểm; ZZ là điểm quy đổi thang 100.)

## Phân tích chi tiết 5 trụ cột & Barem trừ điểm
### I. Thông tin cơ bản & Tính nhất quán (X/Y điểm)
* **1. Tên Doanh Nghiệp (X/4đ):** [Đạt chuẩn / Trừ Xđ — Lý do ngắn gọn]
  - **Thực trạng:** [Bằng chứng ghi nhận từ hồ sơ]
  - **Tác động & Khuyến nghị:** [Ảnh hưởng Local SEO và hành động cụ thể]
* **2. Địa Chỉ & Ghim Vị Trí (X/5đ):** [Đạt chuẩn / Trừ Xđ — Lý do ngắn gọn]
  - **Thực trạng:** ...
  - **Tác động & Khuyến nghị:** ...
* **3. Giờ Mở Cửa (X/4đ):** ...
* **4. Kênh Liên Hệ & Website (X/4đ):** ...
* **5. Tiện Ích Thuộc Tính (X/3đ):** ...

### II. Danh mục & Tối ưu hoá thực đơn / dịch vụ (X/Y điểm)
* **1. Danh Mục (X/5đ):** ...
* **2. Số Hóa Menu - Text Menu (X/7đ):** ...
* **3. Minh Bạch Bảng Giá (X/4đ):** ...
* **4. Hình Đại Diện Từng Món Ăn (X/4đ):** ...

### III. Uy tín xã hội & Danh tiếng (X/Y điểm)
* **1. Điểm Đánh Giá Trung Bình (X/6đ):** ...
* **2. Số Lượng & Mật Độ Review Mới (X/6đ):** ...
* **3. Tỷ Lệ & Tốc Độ Phản Hồi (X/7đ):** ...
* **4. Chất Lượng Nội Dung Phản Hồi (X/6đ):** ...

### IV. Nội dung thị giác & Trải nghiệm không gian (X/Y điểm)
* **1. Ảnh Đại Diện & Ảnh Bìa (X/4đ):** ...
* **2. Hình Ảnh Không Gian (X/6đ):** ...
* **3. Tỷ Lệ Ảnh Khách Đăng - UGC (X/5đ):** ...

### V. Mức độ hoạt động & Tương tác định kỳ (X/Y điểm)
* **1. Tần Suất Đăng Bài Cập Nhật (X/4đ):** ...
* **2. Tính Năng Đặt Bàn / Đặt Chỗ (X/7đ):** ...
* **3. Mục Hỏi & Đáp Chủ Động (X/3đ):** ...
* **4. Giới Thiệu Doanh Nghiệp (X/6đ):** ...

## Kế hoạch hành động 30 ngày (Action Plan)
### Ưu tiên 1 (Cấp bách - Khắc phục điểm trừ nặng nhất)
* **[Hạng mục hành động 1]:** [Chi tiết triển khai ngắn gọn, tách dòng riêng từng việc]
* **[Hạng mục hành động 2]:** ...
### Ưu tiên 2 (Tăng tốc chuyển đổi & Trải nghiệm thị giác)
* **[Hạng mục hành động 1]:** ...
* **[Hạng mục hành động 2]:** ...
### Ưu tiên 3 (Phục hồi uy tín & Bứt phá xếp hạng Local Pack)
* **[Hạng mục hành động 1]:** ...
* **[Hạng mục hành động 2]:** ...

## Điểm sức khỏe hồ sơ: ZZ/100
`;

export function buildPrompt({ profile, currentAnalysis, messages }: AuditInput): string {
  const { "Thực đơn dạng chữ": menu, ...restaurant } = businessBrief(profile);
  const instructions = (messages || []).filter(message => message.role === "user").map(message => message.content);
  return `Thẩm định hồ sơ nhà hàng theo bộ khung kiểm toán sức khỏe 100 điểm (5 Trụ cột). Phân tích Text Menu từ danh mục bên dưới thành một mục riêng trong báo cáo.
<text_menu>
${evidenceText(menu)}
</text_menu>
<ho_so>
${evidenceText(restaurant)}
</ho_so>
${instructions.length ? `<bao_cao_truoc>${currentAnalysis || ""}</bao_cao_truoc>
<yeu_cau_truoc>${instructions.length > 1 ? evidenceText(instructions.slice(0, -1)) : "Chưa có yêu cầu trước."}</yeu_cau_truoc>
YÊU CẦU HIỆN TẠI:
${instructions[instructions.length - 1]}

Sửa trực tiếp toàn bộ báo cáo theo yêu cầu hiện tại và giữ các đính chính trước đó. Thay nhận định sai, suy diễn và lời kỹ thuật trong bản cũ. Trả đúng hai phần:
${CHAT_MARKER}
Nêu ngắn gọn nội dung cụ thể đã thay, không chỉ nhắc lại yêu cầu.
${REPORT_MARKER}
TOÀN BỘ báo cáo đã sửa theo khung điểm 100. Chỉ ghi GIỮ NGUYÊN nếu người dùng chỉ hỏi giải thích và không yêu cầu sửa. Không nói đã sửa khi giữ nguyên.` : "Viết ngay toàn bộ báo cáo với đầy đủ các mục theo chỉ dẫn hệ thống."}`;
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

const SENTENCE_ABBREVS = /(?:^|\s)(?:TP|P|Q|TT|TX|QL|TL|ĐT|Mr|Ms|Mrs|Dr|St|No|ThS|TS|BS|GS|PGS|vs|VD)\s*$/i;

/** Tách câu tiếng Việt an toàn, không cắt nhầm số thập phân, viết tắt (TP., P., Q.) hoặc số thứ tự. */
export function splitReportSentences(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      let j = i + 1;
      while (
        j < text.length &&
        (text[j] === '"' || text[j] === "”" || text[j] === "'" || text[j] === ")" || text[j] === "*" || text[j] === "]")
      ) {
        j++;
      }
      if (j < text.length && /\s/.test(text[j])) {
        const before = text.slice(start, i);
        if (SENTENCE_ABBREVS.test(before)) continue;
        if (/^\s*(?:\*\*)?(?:\d+|[IVX]+)$/i.test(before)) continue;
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        const nextChar = text[k] || "";
        if (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ"“*\[(-]/.test(nextChar)) {
          result.push(text.slice(start, j).trim());
          start = k;
          i = k - 1;
        }
      }
    }
  }
  const tail = text.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

/** Tách đoạn văn quá dài ("1 cục") thành các đoạn ngắn 1–2 câu dễ đọc. */
export function splitLongParagraph(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.length <= 200) return [trimmed];
  const sentences = splitReportSentences(trimmed);
  if (sentences.length <= 1) return [trimmed];
  const paragraphs: string[] = [];
  let current = "";
  let count = 0;
  for (const s of sentences) {
    if (current && (count >= 2 || (current.length >= 100 && current.length + 1 + s.length > 210))) {
      paragraphs.push(current);
      current = s;
      count = 1;
    } else {
      current = current ? `${current} ${s}` : s;
      count++;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function cleanBracketSegment(s: string): string {
  const trimmed = s.trim();
  const unwrapped = /^\[([^\]]+)\]\.?$/.test(trimmed) ? trimmed.replace(/^\[([^\]]+)\]\.?$/, "$1").trim() : trimmed;
  return unwrapped.replace(
    /^(Thực trạng(?:\s*&\s*Bằng chứng)?|Bằng chứng|Tác động(?:\s*(?:Local SEO\s*)?&\s*Khuyến nghị)?|Hậu quả|Khuyến nghị(?:\s*hành động)?|Giải pháp|Việc nên làm|Điểm điều chỉnh|Ghi chú điều chỉnh)\s*:/i,
    "**$1:**"
  );
}

/** Tách một mục bullet viết dồn nhiều ý trên 1 dòng thành dòng tiêu đề + các ý con thụt lề. */
export function splitDenseBullet(rawText: string): { text: string; subs: string[] } {
  const normalized = rawText.trim().replace(/(\*\*[^*]+\*\*:?)\s*[-–—]\s*/u, "$1 ");

  // 1. Tách theo các nhãn nội dung phổ biến (Thực trạng:, Tác động:, Hậu quả:, Khuyến nghị:, Giải pháp:...) hoặc cụm [Thực trạng: ...]
  const labelSplitRegex =
    /(?:\.\s+|\s+[-–—]\s+|\s*->\s*)(?=(?:\*\*|\*)?\[?(?:Thực trạng|Bằng chứng|Tác động|Hậu quả|Khuyến nghị|Giải pháp|Việc nên làm|Điểm điều chỉnh|Ghi chú điều chỉnh)(?:[^:\]\n]{0,25}):)/giu;
  const labeledParts = normalized.split(labelSplitRegex).map(p => p.trim()).filter(Boolean);
  if (labeledParts.length > 1) {
    const head = labeledParts[0].replace(/\[([^\]]+)\]/g, "$1").trim();
    const subs = labeledParts.slice(1).flatMap(part => splitLongParagraph(cleanBracketSegment(part)));
    return { text: head, subs };
  }

  // 2. Nếu bullet dài (> 165 ký tự) có phần mở đầu in đậm + trạng thái điểm, tách phần diễn giải xuống dòng con
  if (normalized.length > 165) {
    const badgeMatch = normalized.match(
      /^(\*\*[^*]+\*\*:?\s*(?:\[[^\]]+\]|\*?\([^)]+\)\*?|(?:Đạt chuẩn|Đạt tối đa|Điểm đạt:?\s*[\d/]+đ?|Trừ\s*\d+\s*đ(?:iểm)?(?:\s*[-–—]\s*[^.]+)?))\.?)\s*(?:[-–—]\s*|\s+)(.+)$/iu
    );
    if (badgeMatch && badgeMatch[2].trim().length >= 40) {
      const head = badgeMatch[1].trim();
      const rest = badgeMatch[2].trim();
      const subs = rest
        .split(/\s+[-–—]\s+(?=\[|[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])/u)
        .flatMap(part => splitLongParagraph(cleanBracketSegment(part)));
      return { text: head, subs };
    }

    const sentences = splitReportSentences(normalized);
    if (sentences.length >= 2) {
      return {
        text: sentences[0],
        subs: splitLongParagraph(sentences.slice(1).join(" ")),
      };
    }
  }

  return { text: normalized, subs: [] };
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
