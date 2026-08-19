import { NextResponse } from "next/server";
import { getSerpApiKeyPool } from "@/lib/key-pool";

/**
 * Soi tình trạng pool key: còn mấy key dùng được, key nào đang nghỉ vì lý do gì
 * và mở lại lúc nào. Không có cái này thì một pool cạn dần là hoàn toàn vô hình
 * — app chỉ báo "hết hạn mức" mà không ai biết còn bao nhiêu key.
 *
 * Chỉ trả nhãn đã mask (`#2…a1b2`), không bao giờ trả key thật.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const serpapi = getSerpApiKeyPool();
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    pools: [serpapi.snapshot()],
  });
}
