import { NextRequest, NextResponse } from "next/server";
import { getGoogleAiKeyPool } from "@/lib/key-pool";
import { AUDIT_PROMPT_VERSION } from "../../../../supabase/functions/_shared/audit";
import { auditEventStream, parseAuditInput } from "../../../../supabase/functions/_shared/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const pool = getGoogleAiKeyPool();
  if (pool.size === 0) return NextResponse.json({ error: "Máy chủ chưa cấu hình dịch vụ phân tích." }, { status: 500 });
  const input = parseAuditInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Dữ liệu hồ sơ hoặc trao đổi không hợp lệ." }, { status: 400 });
  return new Response(auditEventStream(pool, input, request.signal), {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "X-Audit-Prompt-Version": AUDIT_PROMPT_VERSION },
  });
}
