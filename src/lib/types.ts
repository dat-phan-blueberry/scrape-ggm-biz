import { parseAndValidateScore } from "../../supabase/functions/_shared/audit";
export { parseAndValidateScore, cleanBusinessReportText, reportValidationError, splitRefinement } from "../../supabase/functions/_shared/audit";
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


