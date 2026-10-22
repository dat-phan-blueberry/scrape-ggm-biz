import { AUDIT_VERSION } from "./audit/audit.ts";
export {
  parseAndValidateScore,
  cleanBusinessReportText,
  reportValidationError,
  splitRefinement,
  splitLongParagraph,
  splitDenseBullet,
} from "./audit/audit.ts";
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

export interface PlacePost {
  /** ISO 8601 khi nguồn có; dùng để tính độ mới của bài đăng */
  iso_date: string;
  date: string;
  snippet: string;
  link: string;
  has_image: boolean;
}

/** Đánh giá mới nhất kèm phản hồi của chủ quán (google_maps_reviews, sort newestFirst) */
export interface RecentReview {
  rating: number | null;
  date: string;
  iso_date: string;
  snippet: string;
  response: { date: string; iso_date: string; snippet: string } | null;
}

export type EnrichmentStatus = "ok" | "failed" | "skipped" | "mismatch";

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
    link?: string;
    source?: string;
    images?: Array<{ thumbnail: string; image: string; date: string }>;
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
  // Các trường làm giàu từ SerpAPI (Knowledge Graph theo ludocid, reviews, posts, photos).
  // Tùy chọn để hồ sơ đã lưu trước bản này vẫn hợp lệ.
  merchant_description?: string;
  menu_links?: ActionLink[];
  /** Danh sách món Google hiển thị (Knowledge Graph) — chỉ có tên, số ảnh, số review nhắc tới */
  menu_highlights?: Array<{ title: string; photos: number | null; reviews: number | null; thumbnail: string; price: string }>;
  /** "google_dishes": thực đơn dựng từ danh sách món Google, nguồn không trả giá và mô tả */
  menu_origin?: "google_dishes";
  /** Thuộc tính Google ghi nhận là quán KHÔNG có — không được gộp vào `extensions` */
  unsupported_extensions?: ExtensionGroup[];
  social_links?: ActionLink[];
  posts?: PlacePost[];
  photo_categories?: string[];
  recent_reviews?: RecentReview[];
  /** Mẫu "nổi bật" (sort mặc định) — gồm review cũ hơn, dùng tính tỷ lệ phản hồi */
  relevant_reviews?: RecentReview[];
  /** "ok" + rỗng = hồ sơ không có; khác "ok" = không lấy được → tiêu chí liên quan không chấm (D-0113) */
  enrichment?: Record<"knowledge_graph" | "reviews" | "posts" | "photos", EnrichmentStatus> & {
    /** Khối món của Google lúc hiện lúc không: "ok" chỉ khi thật sự lấy được danh sách món */
    dishes?: EnrichmentStatus;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp?: number;
  outcome?: "updated" | "answered" | "error";
}

export interface AiAnalysisRequest {
  profile: BusinessProfile;
  currentAnalysis?: string;
  messages?: Array<{ role: "user" | "model"; content: string }>;
}

export interface VenueAuditMemory {
  version?: string;
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
    if (parsed.dataId !== dataId || typeof parsed.analysis !== "string" || !parsed.analysis.trim()) {
      return null;
    }
    return { ...parsed, messages: Array.isArray(parsed.messages) ? parsed.messages.filter(m => m && ["user", "model"].includes(m.role) && typeof m.content === "string") : [] };
  } catch {
    return null;
  }
}

export function saveVenueAuditMemory(dataId: string, memory: VenueAuditMemory): boolean {
  if (typeof window === "undefined" || !dataId || memory.dataId !== dataId) return false;
  // Caller chỉ lưu sau khi nhận xác nhận hoàn tất từ API.
  if (typeof memory.analysis !== "string" || !memory.analysis.trim()) {
    return false;
  }
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${dataId}`, JSON.stringify({ ...memory, version: AUDIT_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function clearVenueAuditMemory(dataId: string): void {
  if (typeof window === "undefined" || !dataId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${dataId}`);
  } catch {}
}


