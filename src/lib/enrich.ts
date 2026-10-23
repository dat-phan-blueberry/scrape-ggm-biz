/**
 * Làm giàu hồ sơ địa điểm bằng các engine SerpAPI phụ, chạy song song sau lượt
 * `google_maps` chính. `place_results` thường thiếu đúng những thứ khung chấm điểm
 * cần (phản hồi của chủ quán, bài đăng, mô tả doanh nghiệp, giá), nên thiếu bước
 * này AI sẽ chấm "không có" cho dữ liệu mà Google thật ra có.
 *
 * Không import `serpapi.ts` để giữ thuần và test được trên Deno — route truyền
 * `serpApiSearch` vào, nhờ vậy mọi lượt gọi vẫn đi qua key pool (D-0037).
 */
import type { ActionLink, EnrichmentStatus, PlacePost, PriceDistribution, RecentReview } from "./types.ts";

export type SearchFn = (params: URLSearchParams, tag: string, timeoutMs?: number) => Promise<any>;

/** Mỗi lượt phụ có hạn riêng; chậm thì bỏ, không để hồ sơ chính chờ theo. */
export const ENRICH_TIMEOUT_MS = 6_000;
/**
 * Tổng thời gian cho cả route hồ sơ tính từ lúc nhận request. Netlify cắt function đồng bộ ở 10s
 * theo mặc định, nên lượt thử lại khối món chỉ chạy khi còn đủ thời gian.
 */
export const ENRICH_BUDGET_MS = 8_000;
const RETRY_MIN_MS = 2_500;

type CallResult = { ok: boolean; data: Record<string, unknown> };

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
const url = (value: unknown) => {
  try { const u = new URL(text(value)); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
};

export interface KnowledgeGraphFacts {
  merchant_description: string;
  menu_links: ActionLink[];
  booking_links: ActionLink[];
  social_links: ActionLink[];
  service_options: string[];
  price: string;
  price_details: { distribution: PriceDistribution[]; total_reported: number } | null;
}

export interface Enrichment {
  status: Record<"knowledge_graph" | "reviews" | "posts" | "photos" | "dishes", EnrichmentStatus>;
  kg: KnowledgeGraphFacts | null;
  menu_highlights: Array<{ title: string; photos: number | null; reviews: number | null; thumbnail: string; price: string }>;
  recent_reviews: RecentReview[];
  relevant_reviews: RecentReview[];
  posts: PlacePost[];
  photo_categories: string[];
}

/**
 * Knowledge Graph lấy theo `ludocid` vẫn có thể rơi sang chi nhánh khác của chuỗi;
 * chỉ nhận khi `place_id` khớp đúng địa điểm đang thẩm định.
 */
export function verifiedKnowledgeGraph(response: unknown, placeId: string): { kg: Record<string, unknown> | null; status: EnrichmentStatus } {
  const kg = object(object(response).knowledge_graph);
  if (!Object.keys(kg).length) return { kg: null, status: "failed" };
  if (!placeId || text(kg.place_id) !== placeId) return { kg: null, status: "mismatch" };
  return { kg, status: "ok" };
}

export function knowledgeGraphFacts(kg: Record<string, unknown>): KnowledgeGraphFacts {
  const links = (list: unknown, name: (r: Record<string, unknown>) => string) =>
    rows(list).map(r => ({ name: name(r), link: url(r.link) })).filter(l => l.link && l.name);
  const booking = links(kg.reservation_providers, r => text(r.name) ? `Đặt bàn qua ${text(r.name)}` : "");
  const googleReserve = url(object(kg.links)["Đặt_bàn"]);
  if (googleReserve) booking.unshift({ name: "Đặt bàn qua Google", link: googleReserve });
  const distribution = rows(object(kg.price_details).distribution)
    .map(d => ({ price: text(d.price), percentage: typeof d.percentage === "number" ? d.percentage : 0, reported_count: typeof d.reported_count === "number" ? d.reported_count : 0 }))
    .filter(d => d.price);
  const services = kg["các_lựa_chọn_dịch_vụ"] ?? kg.service_options;
  return {
    // SerpAPI trả nguyên văn kèm dấu ngoặc kép bao quanh.
    merchant_description: text(kg.merchant_description).replace(/^["“]+|["”]+$/g, "").trim(),
    menu_links: links(kg.menu_links, r => text(r.text) || "Thực đơn"),
    booking_links: booking,
    social_links: links(kg["tiểu_sử"] ?? kg.profiles, r => text(r.name)),
    service_options: Array.isArray(services) ? services.map(text).filter(Boolean) : [],
    price: text(kg.price),
    price_details: distribution.length
      ? { distribution, total_reported: typeof object(kg.price_details).total_reported === "number" ? object(kg.price_details).total_reported as number : 0 }
      : null,
  };
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

/** `price_range` [min, max] (VND) chỉ có ở món chủ quán đã niêm yết giá trên Google. */
function dishPrice(range: unknown): string {
  if (!Array.isArray(range)) return "";
  const [min, max] = range.map(Number);
  if (!Number.isFinite(min) || min <= 0) return "";
  return Number.isFinite(max) && max > min ? `${vnd(min)} – ${vnd(max)}` : vnd(min);
}

/** Danh sách món trên tab Thực đơn/Món ăn của Google: tên, số ảnh, giá nếu có; không có mô tả. */
export function normalizeMenuHighlights(raw: unknown): Enrichment["menu_highlights"] {
  const count = (value: unknown) => typeof value === "number" ? value : null;
  return rows(raw).map(h => ({
    title: text(h.title),
    photos: count(h.photos),
    reviews: count(h.reviews),
    thumbnail: url(Array.isArray(h.thumbnails) ? h.thumbnails[0] : h.thumbnail),
    price: dishPrice(h.price_range),
  })).filter(h => h.title);
}

/** Bài đăng nằm sẵn trong Knowledge Graph, ngày dạng "8 thg 10, 2026" — dùng khi engine posts lỗi. */
export function normalizeKgPosts(raw: unknown): PlacePost[] {
  return rows(raw).map(p => {
    const m = text(p.date).match(/^(\d{1,2}) thg (\d{1,2}),? (\d{4})$/);
    const iso = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))).toISOString() : "";
    return {
      iso_date: iso,
      date: text(p.date),
      snippet: text(p.description),
      link: url(p.post_link || p.link),
      has_image: !!url(p.media),
    };
  }).filter(p => p.iso_date || p.snippet);
}

export function normalizeRecentReviews(raw: unknown): RecentReview[] {
  return rows(raw).map(r => {
    const response = object(r.response);
    const reply = text(response.snippet) || text(object(response.extracted_snippet).original);
    // newestFirst xếp theo lần sửa gần nhất: review 2018 sửa năm nay vẫn đứng đầu. Lấy mốc sửa
    // để tính độ mới và thời gian phản hồi, không thì một review cũ làm lệch cả mẫu.
    const posted = text(r.iso_date);
    const edited = text(r.iso_date_of_last_edit);
    return {
      rating: typeof r.rating === "number" ? r.rating : null,
      date: text(r.date),
      iso_date: Date.parse(edited) > Date.parse(posted) ? edited : posted,
      snippet: text(r.snippet) || text(object(r.extracted_snippet).original),
      response: reply ? { date: text(response.date), iso_date: text(response.iso_date), snippet: reply } : null,
    };
  }).filter(r => r.snippet || r.rating !== null);
}

export function normalizePosts(raw: unknown): PlacePost[] {
  return rows(raw).map(p => ({
    iso_date: text(p.posted_at),
    date: text(p.posted_at_text) || text(p.date),
    snippet: text(p.description) || text(p.snippet),
    link: url(p.post_link || p.link),
    has_image: Array.isArray(p.thumbnails) && p.thumbnails.length > 0,
  })).filter(p => p.iso_date || p.date || p.snippet);
}

/** Bỏ hai tab điều hướng chung, giữ album thật (Thực đơn, Bầu không khí, Video, tên món…). */
export function normalizePhotoCategories(raw: unknown): string[] {
  return rows(raw).map(c => text(c.title)).filter(t => t && t !== "Tất cả" && t !== "Mới nhất");
}

/** "Không có kết quả" của SerpAPI là dữ liệu rỗng thật, không phải lỗi thu thập. */
const NO_RESULTS = /hasn't returned any results|no results/i;

const params = (values: Record<string, string>) => new URLSearchParams(values);

async function call(search: SearchFn, tag: string, p: URLSearchParams, timeoutMs = ENRICH_TIMEOUT_MS): Promise<CallResult> {
  try { return { ok: true, data: object(await search(p, tag, timeoutMs)) }; }
  catch (error) {
    if (NO_RESULTS.test(String((error as Error)?.message ?? ""))) return { ok: true, data: {} };
    return { ok: false, data: {} };
  }
}

export type DataIdCalls = Promise<[CallResult | null, CallResult | null, CallResult | null, CallResult | null]>;

/** Ba nguồn chỉ cần `data_id`: route gọi trước, chạy song song với lượt google_maps chính. */
export function startDataIdCalls(dataId: string, search: SearchFn): DataIdCalls {
  const id = text(dataId);
  return Promise.all([
    id ? call(search, "enrich-reviews", params({ engine: "google_maps_reviews", data_id: id, hl: "vi", sort_by: "newestFirst" })) : null,
    id ? call(search, "enrich-posts", params({ engine: "google_maps_posts", data_id: id, hl: "vi" })) : null,
    id ? call(search, "enrich-photos", params({ engine: "google_maps_photos", data_id: id, hl: "vi" })) : null,
    // 5 review mới nhất thường mới đăng vài giờ, chủ quán chưa kịp trả lời: lấy thêm mẫu nổi bật
    // (review cũ hơn) để tính tỷ lệ phản hồi cho công bằng.
    id ? call(search, "enrich-reviews-relevant", params({ engine: "google_maps_reviews", data_id: id, hl: "vi" })) : null,
  ]);
}

export async function fetchEnrichment(pr: Record<string, unknown>, search: SearchFn, early?: DataIdCalls, startedAt = Date.now()): Promise<Enrichment> {
  const cid = text(pr.data_cid);
  const placeId = text(pr.place_id);

  const [kgRes, [reviewsRes, postsRes, photosRes, relevantRes]] = await Promise.all([
    cid && placeId ? call(search, "enrich-kg", params({ engine: "google", q: text(pr.title), ludocid: cid, hl: "vi", gl: "vn" })) : null,
    early ?? startDataIdCalls(text(pr.data_id), search),
  ]);
  const statusOf = (res: { ok: boolean } | null): EnrichmentStatus => res === null ? "skipped" : res.ok ? "ok" : "failed";

  let verified = kgRes?.ok ? verifiedKnowledgeGraph(kgRes.data, placeId) : null;
  // Trang kết quả Google không ổn định: có lúc thiếu khối món, có lúc trả AI Overview thay cho
  // Knowledge Graph. Thiếu thì thử bản tiếng Anh một lần; vẫn thiếu là "không lấy được", không phải "không có".
  let dishes = verified?.kg ? normalizeMenuHighlights(kgRes?.data.menu_highlights) : [];
  const remaining = ENRICH_BUDGET_MS - (Date.now() - startedAt);
  // Không ra KG theo ludocid (Google trả AI Overview) thì tra theo kgmid = `provider_id` của Maps,
  // ổn định hơn; đã có KG mà thiếu món thì thử bản tiếng Anh.
  const kgmid = text(pr.provider_id);
  const byKgmid = !verified?.kg && kgmid.startsWith("/g/");
  if (cid && placeId && (!verified?.kg || !dishes.length) && remaining >= RETRY_MIN_MS) {
    const retryParams = byKgmid
      ? params({ engine: "google", q: text(pr.title), kgmid, hl: "vi", gl: "vn" })
      : params({ engine: "google", q: text(pr.title), ludocid: cid, hl: "en", gl: "vn" });
    const retry = await call(search, byKgmid ? "enrich-kg-kgmid" : "enrich-kg-en", retryParams, Math.min(ENRICH_TIMEOUT_MS, remaining));
    const again = retry.ok ? verifiedKnowledgeGraph(retry.data, placeId) : null;
    if (again?.kg) {
      if (!verified?.kg) verified = again;
      if (!dishes.length) dishes = normalizeMenuHighlights(retry.data.menu_highlights);
    }
  }
  const kgPosts = verified?.kg ? normalizeKgPosts(verified.kg.posts) : [];
  const postsFromKg = !postsRes?.ok && kgPosts.length > 0;
  return {
    status: {
      knowledge_graph: verified ? verified.status : statusOf(kgRes),
      reviews: reviewsRes?.ok || relevantRes?.ok ? "ok" : statusOf(reviewsRes),
      posts: postsFromKg ? "ok" : statusOf(postsRes),
      photos: statusOf(photosRes),
      dishes: dishes.length ? "ok" : verified?.kg ? "failed" : statusOf(kgRes) === "skipped" ? "skipped" : "failed",
    },
    kg: verified?.kg ? knowledgeGraphFacts(verified.kg) : null,
    menu_highlights: dishes,
    recent_reviews: reviewsRes?.ok ? normalizeRecentReviews(reviewsRes.data.reviews) : [],
    relevant_reviews: relevantRes?.ok ? normalizeRecentReviews(relevantRes.data.reviews) : [],
    posts: postsFromKg ? kgPosts : postsRes?.ok ? normalizePosts(postsRes.data.posts) : [],
    photo_categories: photosRes?.ok ? normalizePhotoCategories(photosRes.data.categories) : [],
  };
}

/** Tắt làm giàu (về lại 1 lượt SerpAPI/hồ sơ) bằng `SERPAPI_ENRICH=0` khi cần giữ quota. */
export function enrichmentEnabled(flag: string | undefined): boolean {
  return !/^(0|false|off|no)$/i.test((flag ?? "").trim());
}

export function emptyEnrichment(): Enrichment {
  return {
    status: { knowledge_graph: "skipped", reviews: "skipped", posts: "skipped", photos: "skipped", dishes: "skipped" },
    kg: null, menu_highlights: [], recent_reviews: [], relevant_reviews: [], posts: [], photo_categories: [],
  };
}
