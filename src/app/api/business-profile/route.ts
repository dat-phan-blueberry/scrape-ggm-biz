import { NextRequest, NextResponse } from "next/server";
import type {
  ActionLink,
  BusinessProfile,
  DayHours,
  ExtensionGroup,
  UserReview,
} from "@/lib/types";

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

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình nguồn dữ liệu (.env)" }, { status: 500 });
  }

  const params = new URLSearchParams({
    engine: "google_maps",
    type: "place",
    api_key: apiKey,
    hl: "vi",
  });
  if (dataId) {
    // Autocomplete chỉ trả về data_id — engine google_maps nhận nó qua tham số `data`
    params.set("data", `!4m5!3m4!1s${dataId}!8m2!3d${lat || "0"}!4d${lng || "0"}`);
  } else if (placeId) {
    params.set("place_id", placeId);
  }

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error("[business-profile] SerpAPI error:", res.status, data.error);
      return NextResponse.json(
        { error: `Nguồn dữ liệu trả về lỗi (${res.status})` },
        { status: res.ok ? 500 : res.status }
      );
    }

    const pr = data.place_results || {};

    const profile: BusinessProfile = {
      title: pr.title || "",
      place_id: pr.place_id || "",
      data_id: pr.data_id || dataId || "",
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
      description: pr.description?.snippet || (typeof pr.description === "string" ? pr.description : ""),
      rating: pr.rating ?? null,
      reviews_count: pr.reviews ?? null,
      rating_summary: Array.isArray(pr.rating_summary)
        ? [...pr.rating_summary].sort((a, b) => b.stars - a.stars)
        : [],
      price: pr.price || "",
      price_details: pr.price_details?.distribution
        ? {
            distribution: pr.price_details.distribution,
            total_reported: pr.price_details.total_reported ?? 0,
          }
        : null,
      open_state: pr.open_state || "",
      hours: normalizeHours(pr.hours),
      gps: pr.gps_coordinates || null,
      booking_links: collectBookingLinks(pr),
      menu: pr.menu
        ? {
            highlights: (pr.menu.highlights || []).map((h: any) => ({
              title: h.title || "",
              thumbnail: h.thumbnail || h.image || "",
            })),
            categories: (pr.menu.categories || []).map((c: any) => ({
              title: c.title || "",
              items: (c.items || []).map((it: any) => ({
                title: it.title || "",
                description: it.description || "",
                price: it.price || "",
              })),
            })),
          }
        : null,
      extensions: normalizeExtensions(pr.extensions),
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

    return NextResponse.json({ profile, raw: data });
  } catch {
    return NextResponse.json({ error: "Không kết nối được nguồn dữ liệu" }, { status: 500 });
  }
}
