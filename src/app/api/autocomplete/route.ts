import { NextRequest, NextResponse } from "next/server";
import type { Suggestion } from "@/lib/types";

// SerpAPI google_maps_autocomplete bắt buộc phải có tọa độ `ll`.
// Mặc định: tâm Việt Nam, zoom 6 để phủ toàn quốc.
const DEFAULT_LL = "@16.047079,108.206230,6z";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình nguồn dữ liệu (.env)" }, { status: 500 });
  }

  const params = new URLSearchParams({
    engine: "google_maps_autocomplete",
    q: q.trim(),
    ll: request.nextUrl.searchParams.get("ll") || DEFAULT_LL,
    api_key: apiKey,
    hl: "vi",
  });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error("[autocomplete] SerpAPI error:", res.status, data.error);
      return NextResponse.json(
        { error: `Nguồn dữ liệu trả về lỗi (${res.status})` },
        { status: res.ok ? 500 : res.status }
      );
    }

    const suggestions: Suggestion[] = (data.suggestions || []).map((s: any) => ({
      value: s.value || "",
      subtext: s.subtext || "",
      type: s.type || "",
      latitude: typeof s.latitude === "number" ? s.latitude : null,
      longitude: typeof s.longitude === "number" ? s.longitude : null,
      data_id: s.data_id || "",
    }));

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Không kết nối được nguồn dữ liệu" }, { status: 500 });
  }
}
