/** Một gợi ý từ SerpAPI google_maps_autocomplete */
export interface Suggestion {
  value: string;
  subtext: string;
  type: string; // "place" khi là địa điểm cụ thể
  latitude: number | null;
  longitude: number | null;
  data_id: string; // rỗng nếu chỉ là gợi ý từ khóa
}

export interface RatingBucket {
  stars: number;
  amount: number;
}

export interface DayHours {
  day: string;
  time: string;
}

export interface MenuItem {
  title: string;
  description: string;
  price: string;
}

export interface MenuCategory {
  title: string;
  items: MenuItem[];
}

export interface MenuHighlight {
  title: string;
  thumbnail: string;
}

export interface ExtensionGroup {
  key: string;
  items: string[];
}

export interface PlaceImage {
  title: string;
  thumbnail: string;
}

export interface UserReview {
  username: string;
  rating: number;
  description: string;
  date: string;
  user_thumbnail: string;
  user_review_count: number | null;
  link: string;
  images: string[];
}

export interface BusynessSlot {
  time: string;
  busyness_score: number;
  info?: string;
}

export interface SimilarPlace {
  title: string;
  rating: number | null;
  reviews: number | null;
  thumbnail: string;
  data_id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ActionLink {
  name: string;
  link: string;
}

export interface PriceDistribution {
  price: string;
  percentage: number;
  reported_count: number;
}

export interface BusinessProfile {
  title: string;
  place_id: string;
  data_id: string;
  address: string;
  country: string;
  plus_code: string;
  phone: string;
  website: string;
  maps_link: string;
  thumbnail: string;
  types: string[];
  description: string;
  rating: number | null;
  reviews_count: number | null;
  rating_summary: RatingBucket[]; // sắp xếp 5★ → 1★
  price: string;
  price_details: { distribution: PriceDistribution[]; total_reported: number } | null;
  open_state: string;
  hours: DayHours[];
  gps: { latitude: number; longitude: number } | null;
  booking_links: ActionLink[];
  menu: {
    highlights: MenuHighlight[];
    categories: MenuCategory[];
  } | null;
  extensions: ExtensionGroup[];
  images: PlaceImage[];
  user_reviews: UserReview[];
  popular_times: {
    current_day: string;
    graph: Record<string, BusynessSlot[]>;
  } | null;
  similar_places: SimilarPlace[];
  unclaimed: boolean | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp?: number;
}

export interface AiAnalysisRequest {
  profile: BusinessProfile;
  currentAnalysis?: string;
  messages?: Array<{ role: "user" | "model"; content: string }>;
}

export interface VenueAuditMemory {
  dataId: string;
  title: string;
  lastUpdated: number;
  analysis: string;
  messages: ChatMessage[];
}

const STORAGE_PREFIX = "ggm_audit_memory_";

export function getVenueAuditMemory(dataId: string): VenueAuditMemory | null {
  if (typeof window === "undefined" || !dataId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${dataId}`);
    if (!raw) return null;
    const parsed: VenueAuditMemory = JSON.parse(raw);
    // Nếu bản báo cáo bị cụt lủn (không có điểm cạnh tranh hoặc quá ngắn do lỗi stream mạng), xóa bỏ cache hỏng
    if (!parsed.analysis || parsed.analysis.length < 300 || !parseAndValidateScore(parsed.analysis)) {
      localStorage.removeItem(`${STORAGE_PREFIX}${dataId}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveVenueAuditMemory(dataId: string, memory: VenueAuditMemory): void {
  if (typeof window === "undefined" || !dataId) return;
  // Chỉ lưu khi bản báo cáo là hoàn chỉnh (có điểm cạnh tranh hợp lệ và độ dài đủ lớn)
  if (!memory.analysis || memory.analysis.length < 300 || !parseAndValidateScore(memory.analysis)) {
    return;
  }
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${dataId}`, JSON.stringify(memory));
  } catch {
    /* localStorage quota hoặc bị chặn */
  }
}

export function clearVenueAuditMemory(dataId: string): void {
  if (typeof window === "undefined" || !dataId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${dataId}`);
  } catch {}
}

/**
 * Trích xuất và chuẩn hóa điểm cạnh tranh từ nội dung phân tích.
 * Đảm bảo điểm số luôn nằm trong thang [1.0, 10.0],
 * tự động quy đổi nếu AI nhầm thang 100 (ví dụ 85/100 hoặc 85/10 -> 8.5).
 */
export function parseAndValidateScore(text: string): string | null {
  if (!text) return null;

  // 1. Khớp cụm "Điểm cạnh tranh" / "Competitive score" kèm mẫu số /10 hoặc /100.
  // TUYỆT ĐỐI KHÔNG MATCH /5 (vì /5 luôn là số sao rating của review như 4.4/5 sao).
  const matches = Array.from(
    text.matchAll(/(?:Điểm cạnh tranh|Điểm đánh giá cạnh tranh|Competitive score|Khung điểm)[:\s]*\*?\*?(\d+(?:[.,]\d+)?)\*?\*?\s*\/\s*(10|100)\b/gi)
  );

  let targetMatch = matches.length > 0 ? matches[matches.length - 1] : null;

  // 2. Nếu không có, tìm heading dạng "## Điểm ... : X/10"
  if (!targetMatch) {
    const headingMatches = Array.from(
      text.matchAll(/##\s*[^#\n]*?(?:Điểm|Score)[^#\n]*?[:\s]*\*?\*?(\d+(?:[.,]\d+)?)\*?\*?\s*\/\s*(10|100)\b/gi)
    );
    targetMatch = headingMatches.length > 0 ? headingMatches[headingMatches.length - 1] : null;
  }

  // 3. Fallback: tìm bất kỳ chỗ nào có "X/10" đi liền sau từ "cạnh tranh"
  if (!targetMatch) {
    const fallbackMatches = Array.from(
      text.matchAll(/cạnh tranh[^.\n]*?[:\s]*\*?\*?(\d+(?:[.,]\d+)?)\*?\*?\s*\/\s*(10|100)\b/gi)
    );
    targetMatch = fallbackMatches.length > 0 ? fallbackMatches[fallbackMatches.length - 1] : null;
  }

  if (!targetMatch) return null;

  const rawNum = parseFloat(targetMatch[1].replace(",", "."));
  const denom = parseInt(targetMatch[2], 10);
  if (isNaN(rawNum)) return null;

  let score = rawNum;
  if (denom === 100 || (rawNum > 10 && rawNum <= 100)) {
    score = rawNum / 10;
  } else if (rawNum > 100) {
    score = 10;
  }
  score = Math.max(1, Math.min(10, score));
  return Number.isInteger(score) ? score.toString() : score.toFixed(1);
}

/**
 * Chuẩn hóa văn bản báo cáo kinh doanh, loại bỏ tuyệt đối mọi rò rỉ mã code,
 * tên biến lập trình, thuộc tính JSON hay giá trị boolean/null trước khi hiển thị cho chủ nhà hàng hoặc in PDF.
 */
export function cleanBusinessReportText(text: string): string {
  if (!text) return text;
  let s = text;

  // 1. Khử triệt để mẫu rò rỉ: "Quán hiện có chỉ số has_text_menu: false và text_menu_items_count: 0"
  s = s.replace(
    /(?:(?:quán\s+)?(?:hiện\s+)?(?:có\s+)?)?(?:chỉ\s+số|trường|thuộc\s+tính)?\s*has_text_menu:\s*(?:false|true)\s*(?:và|,)?\s*(?:(?:chỉ\s+số|trường|thuộc\s+tính)\s*)?(?:số\s+lượng\s+món\s+)?text_menu_items_count:\s*\d+/gi,
    "quán hiện chưa cập nhật thực đơn dạng văn bản trực tiếp trên Google Maps"
  );

  // 2. Khử từng biến đơn lẻ nếu còn sót
  s = s.replace(/has_text_menu:\s*false/gi, "chưa có thực đơn dạng chữ");
  s = s.replace(/has_text_menu:\s*true/gi, "đã có thực đơn dạng chữ");
  s = s.replace(/text_menu_items_count:\s*0/gi, "chưa có món ăn nào dạng chữ");
  s = s.replace(/text_menu_items_count:\s*(\d+)/gi, "$1 món dạng chữ");
  s = s.replace(/has_photo_menu_highlights:\s*(?:false|true)/gi, "");
  s = s.replace(/menu_seo_status/gi, "thực đơn");

  // 3. Khử các dạng "chỉ số X: false", "trường Y: null", "biến Z: true"
  s = s.replace(/\b(?:chỉ số|trường|thuộc tính)\s+([a-zA-Z0-9_]+)\s*:\s*(?:null|false|undefined)\b/gi, "chưa bổ sung $1");
  s = s.replace(/\b(?:chỉ số|trường|thuộc tính)\s+([a-zA-Z0-9_]+)\s*:\s*true\b/gi, "đã thiết lập $1");
  s = s.replace(/\b([a-zA-Z0-9_]+):\s*null\b/gi, "chưa có $1");

  // 4. Khử các định dạng snake_case kỹ thuật lọt vào văn bản
  s = s.replace(/\bclaim_this_business\b/gi, "xác minh chủ sở hữu quán");
  s = s.replace(/\boperating_hours\b/gi, "giờ mở cửa");
  s = s.replace(/\buser_reviews\b/gi, "đánh giá của khách hàng");
  s = s.replace(/\bsimilar_places\b/gi, "địa điểm tương tự");
  s = s.replace(/\bgps_coordinates\b/gi, "tọa độ vị trí");

  return s;
}
