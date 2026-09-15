import { auditEventStream, parseAuditInput } from "../_shared/audit-service.ts";
import { AUDIT_PROMPT_VERSION } from "../_shared/audit.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Audit-Prompt-Version",
};
function jsonResponse(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export async function handleAuditRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const apiKey = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY")?.trim();
  if (!apiKey) return jsonResponse({ error: "Máy chủ chưa cấu hình dịch vụ phân tích." }, 500);
  const input = parseAuditInput(await req.json().catch(() => null));
  if (!input) return jsonResponse({ error: "Dữ liệu hồ sơ hoặc trao đổi không hợp lệ." }, 400);
  return new Response(auditEventStream(apiKey, input, req.signal), {
    headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "X-Audit-Prompt-Version": AUDIT_PROMPT_VERSION },
  });
}
