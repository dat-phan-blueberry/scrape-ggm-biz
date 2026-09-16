import { AUDIT_SYSTEM_INSTRUCTION, buildPrompt, cleanBusinessReportText, type AuditInput } from "./audit.ts";

const MODEL = "gemini-flash-latest";
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

export interface KeyLeaseLike {
  readonly key: string;
  readonly label?: string;
  readonly slot?: number;
}

export interface KeyPoolLike {
  readonly size: number;
  acquire(): KeyLeaseLike | null;
  reportSuccess?(lease: KeyLeaseLike): void;
  penalize?(lease: KeyLeaseLike, reason: "quota" | "rate" | "invalid", customMs?: number): void;
}

function toPool(apiKeyOrPool: string | KeyPoolLike): KeyPoolLike {
  if (typeof apiKeyOrPool !== "string") return apiKeyOrPool;
  const keys = apiKeyOrPool.split(/[,;\s]+/).map(k => k.trim()).filter(k => k.length > 0);
  let index = 0;
  return {
    size: keys.length,
    acquire() {
      if (index >= keys.length) return null;
      const key = keys[index++];
      return { key, label: `#${index}…${key.slice(-4)}`, slot: index - 1 };
    },
    reportSuccess() {},
    penalize() {},
  };
}

/** Thử lần lượt các key; khi gặp 429/403 tự động xoay sang key kế tiếp. */
export async function generateAudit(apiKeyOrPool: string | KeyPoolLike, input: AuditInput, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
  const pool = toPool(apiKeyOrPool);
  if (pool.size === 0) throw new AuditError("Máy chủ chưa cấu hình dịch vụ phân tích.", 500);

  const deadline = Date.now() + 55_000;
  let lastError: AuditError | null = null;
  const maxAttempts = pool.size;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const lease = pool.acquire();
    if (!lease) break;

    const attemptTimeout = AbortSignal.timeout(Math.min(30_000, remaining));
    const combinedSignal = signal
      ? AbortSignal.any([signal, attemptTimeout])
      : attemptTimeout;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": lease.key },
        signal: combinedSignal,
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
        const period = quotaPeriod(failure);
        const label = lease.label || `#${(lease.slot ?? 0) + 1}`;
        console.warn(`[audit] key ${label} HTTP ${res.status}; quota period=${period}`);

        if (res.status === 429) {
          const penaltyReason = period === "minute" ? "rate" : "quota";
          pool.penalize?.(lease, penaltyReason, retryAfter ? retryAfter * 1000 : undefined);
          lastError = new AuditError("Dịch vụ phân tích đang giới hạn lượt gọi. Vui lòng đợi rồi thử lại.", 429, retryAfter);
          continue;
        }

        if (res.status === 401 || res.status === 403) {
          pool.penalize?.(lease, "invalid");
          lastError = new AuditError("Dịch vụ phân tích chưa được cấp quyền truy cập.", res.status);
          continue;
        }

        lastError = new AuditError("Dịch vụ phân tích đang bận. Vui lòng thử lại.", res.status, retryAfter);
        continue;
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = cleanBusinessReportText((candidate?.content?.parts || [])
        .filter((part: { text?: string; thought?: boolean }) => typeof part.text === "string" && !part.thought)
        .map((part: { text: string }) => part.text).join("\n"));
      if (!text) throw new AuditError("Không nhận được nội dung báo cáo.");
      if (candidate.finishReason !== "STOP") throw new AuditError("Báo cáo bị ngắt trước khi hoàn tất. Vui lòng thử lại.");

      pool.reportSuccess?.(lease);
      return text;
    } catch (error) {
      if (error instanceof AuditError) throw error;
      if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
      if (attemptTimeout.aborted) {
        console.warn(`[audit] key ${lease.label || lease.slot} hết thời gian chờ, xoay sang key kế tiếp`);
        continue;
      }
      throw new AuditError("Không kết nối được dịch vụ phân tích.");
    }
  }

  if (lastError) throw lastError;
  throw new AuditError("Dịch vụ phân tích đang giới hạn lượt gọi. Vui lòng đợi rồi thử lại.", 429);
}

export function auditEventStream(apiKeyOrPool: string | KeyPoolLike, input: AuditInput, signal?: AbortSignal) {
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
        const text = await generateAudit(apiKeyOrPool, input, combined);
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
