import { NextRequest, NextResponse } from "next/server";
import type {
  ActionLink,
  BusinessProfile,
  DayHours,
  ExtensionGroup,
  UserReview,
} from "@/lib/types";
import { serpApiSearch, SerpApiError } from "@/lib/serpapi";
import { normalizeMenu } from "@/lib/menu";
import { emptyEnrichment, enrichmentEnabled, fetchEnrichment, startDataIdCalls } from "@/lib/enrich";

/** hours từ SerpAPI là mảng các object 1 khóa: [{"thứ năm": "06:00–23:00"}, ...] */
function normalizeHours(raw: unknown): DayHours[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (entry && typeof entry === "object") {
        return Object.entries(entry as Record<string, unknown>).map(([day, time]) => ({
          day,
          time: String(time),
        }));
      }
      return [];
    });
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([day, time]) => ({
      day,
      time: String(time),
    }));
  }
  return [];
}

/** Dùng riêng cho `extensions` và `unsupported_extensions`; hai nhóm nghĩa ngược nhau, không được gộp. */
function normalizeExtensions(raw: unknown): ExtensionGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (entry && typeof entry === "object") {
      return Object.entries(entry as Record<string, unknown>)
        .filter(([, items]) => Array.isArray(items) && items.length > 0)
        .map(([key, items]) => ({ key, items: (items as unknown[]).map(String) }));
    }
    return [];
  });
}

/** Gom mọi đường dẫn đặt bàn / đặt món có trong kết quả */
function collectBookingLinks(pr: any): ActionLink[] {
  const links: ActionLink[] = [];
  const seen = new Set<string>();
  const push = (name: string, link: unknown) => {
    if (typeof link === "string" && link.startsWith("http") && !seen.has(link)) {
      seen.add(link);
      links.push({ name, link });
    }
  };

  if (pr.reservation?.link) {
    push(pr.reservation.source ? `Đặt bàn qua ${pr.reservation.source}` : "Đặt bàn", pr.reservation.link);
  }
  push("Đặt bàn qua Google", Object.values(pr).find(
    (v) => typeof v === "string" && v.startsWith("https://www.google.com/maps/reserve")
  ));
  if (pr.booking_link) push("Trang đặt chỗ", pr.booking_link);
  for (const ol of pr.order_links || []) push(ol.name || "Đặt món", ol.link);
  // Đặt món trực tuyến là kênh chuyển đổi, không phải thực đơn.
  if (pr.order_online_link) push("Đặt món trực tuyến", pr.order_online_link);
  return links;
}

function normalizeReviews(raw: any): UserReview[] {
  const list = raw?.most_relevant;
  if (!Array.isArray(list)) return [];
  return list.map((r: any) => ({
    username: r.username || "Ẩn danh",
    rating: typeof r.rating === "number" ? r.rating : 0,
    description: r.description || "",
    date: r.date || "",
    user_thumbnail: r.user_thumbnail || "",
    user_review_count: r.user_review_count ?? null,
    link: r.link || "",
    images: Array.isArray(r.images)
      ? r.images.map((im: any) => im?.thumbnail || "").filter(Boolean)
      : [],
  }));
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const dataId = sp.get("data_id");
  const placeId = sp.get("place_id");
  const lat = sp.get("lat");
  const lng = sp.get("lng");

  if (!dataId && !placeId) {
    return NextResponse.json({ error: "Cần data_id hoặc place_id" }, { status: 400 });
  }

  const params = new URLSearchParams({
    engine: "google_maps",
    type: "place",
    hl: "vi",
  });
  if (dataId) {
    // Autocomplete chỉ trả về data_id — engine google_maps nhận nó qua tham số `data`
    params.set("data", `!4m5!3m4!1s${dataId}!8m2!3d${lat || "0"}!4d${lng || "0"}`);
  } else if (placeId) {
    params.set("place_id", placeId);
  }

  const startedAt = Date.now();
  const enrichOn = enrichmentEnabled(process.env.SERPAPI_ENRICH);
  // Review/bài đăng/ảnh chỉ cần data_id: chạy song song với lượt chính để giữ route dưới 10s của Netlify.
  const early = enrichOn && dataId ? startDataIdCalls(dataId, serpApiSearch) : undefined;

  try {
    // Key do pool cấp; hết hạn mức thì tự xoay sang key kế tiếp.
    const data = await serpApiSearch(params, "business-profile");

    const pr = data.place_results || {};
    if (!pr.title) return NextResponse.json({ error: "Nguồn dữ liệu chưa trả về hồ sơ địa điểm này." }, { status: 404 });

    const resolvedDataId = pr.data_id || dataId || "";

    // Làm giàu song song qua key pool; lỗi từng nguồn chỉ khiến tiêu chí liên quan không được chấm (D-0113), không làm hỏng hồ sơ.
    const enrich = enrichOn
      ? await fetchEnrichment({ ...pr, data_id: resolvedDataId }, serpApiSearch, early, startedAt)
      : emptyEnrichment();
    const kg = enrich.kg;

    const bookingLinks = collectBookingLinks(pr);
    // KG và place_results thường trả cùng một kênh với URL khác tham số theo dõi: khử trùng theo cả tên kênh.
    for (const link of kg?.booking_links || []) {
      if (!bookingLinks.some((l) => l.link === link.link || l.name === link.name)) bookingLinks.push(link);
    }

    // Maps hiếm khi trả menu chữ; khi đó dùng danh sách món Google hiển thị (KG) làm thực đơn,
    // đánh dấu nguồn: Google không trả giá/mô tả từng món nên Text Menu và Bảng giá không chấm (D-0113).
    let menu = normalizeMenu(pr.menu);
    const dishes = enrich.menu_highlights;
    const menuOrigin = !menu?.categories.length && dishes.length ? ("google_dishes" as const) : undefined;
    if (menuOrigin) {
      menu = {
        categories: [{ title: "Món trên Google Maps", items: dishes.map((d) => ({ title: d.title, price: d.price, description: "" })) }],
        highlights: dishes.map((d) => ({ title: d.title, thumbnail: d.thumbnail })),
        link: menu?.link || kg?.menu_links[0]?.link || "",
        // Nhãn phải là nơi link dẫn tới (vd hum-dining.vn), không phải nơi lấy danh sách món.
        source: menu?.link ? menu.source || "" : kg?.menu_links[0]?.name || "",
        images: menu?.images || [],
      };
    }

    const extensions = normalizeExtensions(pr.extensions);
    const known = new Set(extensions.flatMap((g) => g.items));
    const services = (kg?.service_options || []).filter((item) => !known.has(item));
    if (services.length) extensions.push({ key: "Lựa chọn dịch vụ", items: services });

    const profile: BusinessProfile = {
      title: pr.title || "",
      place_id: pr.place_id || "",
      data_id: resolvedDataId,
      address: pr.address || "",
      country: pr.country || "",
      plus_code: pr.plus_code || "",
      phone: pr.phone || "",
      website: pr.website || "",
      maps_link: pr.data_cid
        ? `https://maps.google.com/?cid=${pr.data_cid}`
        : data.search_metadata?.google_maps_url || "",
      thumbnail: pr.thumbnail || "",
      types: Array.isArray(pr.type) ? pr.type : pr.type ? [String(pr.type)] : [],
      // UI hiển thị `description`; brief cho AI tách riêng mô tả do doanh nghiệp tự viết.
      description:
        pr.description?.snippet ||
        (typeof pr.description === "string" ? pr.description : "") ||
        kg?.merchant_description ||
        "",
      merchant_description: kg?.merchant_description || "",
      rating: pr.rating ?? null,
      reviews_count: pr.reviews ?? null,
      rating_summary: Array.isArray(pr.rating_summary)
        ? [...pr.rating_summary].sort((a, b) => b.stars - a.stars)
        : [],
      price: pr.price || kg?.price || "",
      price_details: pr.price_details?.distribution
        ? {
            distribution: pr.price_details.distribution,
            total_reported: pr.price_details.total_reported ?? 0,
          }
        : kg?.price_details || null,
      open_state: pr.open_state || "",
      hours: normalizeHours(pr.hours),
      gps: pr.gps_coordinates || null,
      booking_links: bookingLinks,
      menu,
      menu_origin: menuOrigin,
      menu_links: kg?.menu_links || [],
      menu_highlights: enrich.menu_highlights,
      extensions,
      unsupported_extensions: normalizeExtensions(pr.unsupported_extensions),
      social_links: kg?.social_links || [],
      posts: enrich.posts,
      photo_categories: enrich.photo_categories,
      recent_reviews: enrich.recent_reviews,
      relevant_reviews: enrich.relevant_reviews,
      enrichment: enrich.status,
      images: (pr.images || [])
        .map((im: any) => ({ title: im.title || "", thumbnail: im.thumbnail || "" }))
        .filter((im: any) => im.thumbnail),
      user_reviews: normalizeReviews(pr.user_reviews),
      popular_times: pr.popular_times?.graph_results
        ? {
            current_day: pr.popular_times.current_day || "",
            graph: pr.popular_times.graph_results,
          }
        : null,
      similar_places: (pr.people_also_search_for || []).flatMap((group: any) =>
        (group.local_results || []).map((lr: any) => ({
          title: lr.title || "",
          rating: lr.rating ?? null,
          reviews: lr.reviews ?? null,
          thumbnail: lr.thumbnail || "",
          data_id: lr.data_id || "",
          latitude: lr.gps_coordinates?.latitude ?? null,
          longitude: lr.gps_coordinates?.longitude ?? null,
        }))
      ),
      unclaimed: pr.unclaimed ?? null,
    };

    // Tham số upstream có thể chứa API key; chỉ trả dữ liệu địa điểm cần đối chiếu.
    return NextResponse.json({ profile, raw: { place_results: pr } });
  } catch (error) {
    if (error instanceof SerpApiError) {
      return NextResponse.json({ error: error.userMessage }, { status: error.status });
    }
    return NextResponse.json({ error: "Không kết nối được nguồn dữ liệu" }, { status: 500 });
  }
}
