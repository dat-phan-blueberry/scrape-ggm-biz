import { AUDIT_SYSTEM_INSTRUCTION, buildPrompt, cleanBusinessReportText, type AuditInput } from "./audit.ts";

const MODEL = "gemini-3.5-flash";
export class AuditError extends Error {
  constructor(message: string, public status = 502, public retryAfterSeconds?: number) { super(message); }
}

/** Chỉ phân loại hạn mức khi nhà cung cấp trả định danh cụ thể. */
export function quotaPeriod(failure: unknown): "day" | "minute" | "unknown" {
  const value = failure as { error?: { details?: Array<{ violations?: Array<{ quotaId?: string }> }> } } | null;
  const details = Array.isArray(value?.error?.details) ? value.error.details : [];
  const ids = details.flatMap(d => Array.isArray(d?.violations) ? d.violations.map(v => typeof v?.quotaId === "string" ? v.quotaId : "") : []);
  if (ids.some(id => /PerDay/.test(id))) return "day";
  if (ids.some(id => /PerMinute/.test(id))) return "minute";
  return "unknown";
}

/** Một thao tác người dùng chỉ gọi Gemini một lần; thử lại phải do người dùng chọn. */
export async function generateAudit(apiKey: string, input: AuditInput, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
  const timeout = AbortSignal.timeout(55_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AUDIT_SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "low" } },
      }),
    });
    if (!res.ok) {
      const failure = await res.json().catch(() => null);
      const detail = Array.isArray(failure?.error?.details) ? failure.error.details.find((d: { retryDelay?: string }) => d?.retryDelay) : undefined;
      const seconds = Number.parseFloat(res.headers.get("retry-after") || detail?.retryDelay || "");
      const retryAfter = Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
      console.warn(`[audit] HTTP ${res.status}; quota period=${quotaPeriod(failure)}`);
      throw new AuditError(res.status === 429 ? "Dịch vụ phân tích đang giới hạn lượt gọi. Vui lòng đợi rồi thử lại."
        : res.status === 401 || res.status === 403 ? "Dịch vụ phân tích chưa được cấp quyền truy cập."
        : "Dịch vụ phân tích đang bận. Vui lòng thử lại.", res.status, retryAfter);
    }
    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = cleanBusinessReportText((candidate?.content?.parts || [])
      .filter((part: { text?: string; thought?: boolean }) => typeof part.text === "string" && !part.thought)
      .map((part: { text: string }) => part.text).join("\n"));
    if (!text) throw new AuditError("Không nhận được nội dung báo cáo.");
    if (candidate.finishReason !== "STOP") throw new AuditError("Báo cáo bị ngắt trước khi hoàn tất. Vui lòng thử lại.");
    return text;
  } catch (error) {
    if (error instanceof AuditError) throw error;
    if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
    throw new AuditError(timeout.aborted ? "Phân tích quá thời gian chờ. Vui lòng thử lại." : "Không kết nối được dịch vụ phân tích.");
  }
}

export function auditEventStream(apiKey: string, input: AuditInput, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  let closed = false;
  let timer: ReturnType<typeof setInterval>;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string) => { if (!closed) controller.enqueue(encoder.encode(event)); };
      send(": ping\n\n");
      timer = setInterval(() => send(": ping\n\n"), 10_000);
      try {
        const text = await generateAudit(apiKey, input, combined);
        send(`data: ${JSON.stringify({ text })}\n\n`);
      } catch (error) {
        send(`data: ${JSON.stringify({ error: error instanceof AuditError ? error.message : "Không thể hoàn thành phân tích.",
          ...(error instanceof AuditError ? { status: error.status, retryAfterSeconds: error.retryAfterSeconds } : {}) })}\n\n`);
      } finally {
        clearInterval(timer);
        if (!closed) {
          send("data: [DONE]\n\n");
          closed = true;
          controller.close();
        }
      }
    },
    cancel() { closed = true; clearInterval(timer); abort.abort(); },
  });
}

export function parseAuditInput(body: unknown): AuditInput | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (!value.profile || typeof value.profile !== "object" || Array.isArray(value.profile)) return null;
  if (value.messages !== undefined && (!Array.isArray(value.messages) || value.messages.some(m =>
    !m || !["user", "model"].includes(m.role) || typeof m.content !== "string"))) return null;
  return {
    profile: value.profile,
    currentAnalysis: typeof value.currentAnalysis === "string" ? value.currentAnalysis : undefined,
    messages: value.messages as AuditInput["messages"],
  };
}
