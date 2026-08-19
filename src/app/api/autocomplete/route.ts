import { NextRequest, NextResponse } from "next/server";
import type { Suggestion } from "@/lib/types";
import { serpApiSearch, SerpApiError } from "@/lib/serpapi";

// SerpAPI google_maps_autocomplete bắt buộc phải có tọa độ `ll`.
// Mặc định: tâm Việt Nam, zoom 6 để phủ toàn quốc.
const DEFAULT_LL = "@16.047079,108.206230,6z";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const params = new URLSearchParams({
    engine: "google_maps_autocomplete",
    q: q.trim(),
    ll: request.nextUrl.searchParams.get("ll") || DEFAULT_LL,
    hl: "vi",
  });

  try {
    // Key do pool cấp; hết hạn mức thì tự xoay sang key kế tiếp.
    const data = await serpApiSearch(params, "autocomplete");

    const suggestions: Suggestion[] = (data.suggestions || []).map((s: any) => ({
      value: s.value || "",
      subtext: s.subtext || "",
      type: s.type || "",
      latitude: typeof s.latitude === "number" ? s.latitude : null,
      longitude: typeof s.longitude === "number" ? s.longitude : null,
      data_id: s.data_id || "",
    }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof SerpApiError) {
      return NextResponse.json({ error: error.userMessage }, { status: error.status });
    }
    return NextResponse.json({ error: "Không kết nối được nguồn dữ liệu" }, { status: 500 });
  }
}
