import { NextRequest, NextResponse } from "next/server";
import { getAiApiKey } from "@/lib/ai-config";
import { splitRefinement } from "../../../../supabase/functions/_shared/audit";
import { AuditError, auditEventStream, generateAudit, parseAuditInput } from "../../../../supabase/functions/_shared/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = getAiApiKey();
  if (!apiKey) return NextResponse.json({ error: "Máy chủ chưa cấu hình dịch vụ phân tích." }, { status: 500 });
  const input = parseAuditInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Dữ liệu hồ sơ hoặc trao đổi không hợp lệ." }, { status: 400 });
  if (!input.messages?.length) {
    return new Response(auditEventStream(apiKey, input, request.signal), {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  }
  try {
    const text = await generateAudit(apiKey, input, request.signal);
    const result = splitRefinement(text)!;
    return NextResponse.json({ ...result, analysis: result.updatedAnalysis ?? input.currentAnalysis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuditError ? error.message : "Không thể hoàn thành phân tích." },
      { status: error instanceof AuditError ? error.status : 500 });
  }
}
