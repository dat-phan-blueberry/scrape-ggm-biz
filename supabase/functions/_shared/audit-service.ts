import { AUDIT_SYSTEM_INSTRUCTION, MAX_AUDIT_KEY_ATTEMPTS, buildPrompt, cleanBusinessReportText, type AuditInput } from "./audit.ts";

const MODEL = "gemini-3.5-flash";
export class AuditError extends Error {
  constructor(message: string, public status = 502, public retryAfterSeconds?: number, public nextKeyAttempts?: number[]) { super(message); }
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
  acquire(excludedSlots?: ReadonlySet<number>): KeyLeaseLike | null;
  reportSuccess?(lease: KeyLeaseLike): void;
  penalize?(lease: KeyLeaseLike, reason: "quota" | "rate" | "invalid", customMs?: number): void;
}

function toPool(apiKeyOrPool: string | KeyPoolLike): KeyPoolLike {
  if (typeof apiKeyOrPool !== "string") return apiKeyOrPool;
  const keys = apiKeyOrPool.split(/[,;\s]+/).map(k => k.trim()).filter(k => k.length > 0);
  return {
    size: keys.length,
    acquire(excludedSlots) {
      const slot = keys.findIndex((_, index) => !excludedSlots?.has(index));
      if (slot < 0) return null;
      return { key: keys[slot], label: `#${slot + 1}…${keys[slot].slice(-4)}`, slot };
    },
    reportSuccess() {},
    penalize() {},
  };
}

async function readGeminiStream(res: Response, onDelta: (text: string) => void): Promise<string> {
  if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
    throw new AuditError("Dịch vụ phân tích trả luồng không hợp lệ.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];
  let text = "";
  let finishReason = "";
  let ended = false;
  const dispatch = () => {
    if (!dataLines.length) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    if (payload.trim() === "[DONE]") return;
    let event: any;
    try { event = JSON.parse(payload); }
    catch { throw new AuditError("Luồng phân tích bị lỗi định dạng."); }
    if (event?.error) throw new AuditError("Dịch vụ phân tích bị gián đoạn.");
    const candidate = event?.candidates?.[0];
    const delta = (candidate?.content?.parts || [])
      .filter((part: { text?: string; thought?: boolean }) => typeof part.text === "string" && !part.thought)
      .map((part: { text: string }) => part.text).join("");
    if (delta) { text += delta; onDelta(delta); }
    if (candidate?.finishReason) finishReason = candidate.finishReason;
  };
  const line = (value: string) => {
    if (!value.trim()) dispatch();
    else if (value.startsWith("data:")) dataLines.push(value.slice(5).trimStart());
  };
  try {
    while (!ended) {
      const { done, value } = await reader.read();
      ended = done;
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, end).replace(/\r$/, ""));
        buffer = buffer.slice(end + 1);
      }
      if (done) {
        if (buffer) line(buffer.replace(/\r$/, ""));
        dispatch();
      }
    }
  } finally {
    if (!ended) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const result = cleanBusinessReportText(text);
  if (!result) throw new AuditError("Không nhận được nội dung báo cáo.");
  if (finishReason !== "STOP") throw new AuditError("Báo cáo bị ngắt trước khi hoàn tất. Vui lòng thử lại.");
  return result;
}

const CANDIDATE_MODELS = ["gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash"];

export async function generateAudit(apiKeyOrPool: string | KeyPoolLike, input: AuditInput, signal?: AbortSignal, onDelta?: (text: string) => void): Promise<string> {
  if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
  const pool = toPool(apiKeyOrPool);
  if (pool.size === 0) throw new AuditError("Máy chủ chưa cấu hình dịch vụ phân tích.", 500);
  const attempted = input.attemptedKeySlots ?? [];
  const lease = pool.acquire(new Set(attempted));
  if (!lease) throw new AuditError("Các key phân tích hiện không dùng được. Vui lòng thử lại sau.", 429);
  const tried = [...attempted, lease.slot ?? attempted.length];
  const timeout = AbortSignal.timeout(55_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const action = onDelta ? "streamGenerateContent?alt=sse" : "generateContent";
  let lastFailure: AuditError | null = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": lease.key },
        signal: combinedSignal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: AUDIT_SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
          generationConfig: { temperature: 0.25, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "low" } },
        }),
      });

      if (!res.ok) {
        const failure = await res.json().catch(() => null);
        const detail = Array.isArray(failure?.error?.details) ? failure.error.details.find((d: { retryDelay?: string }) => d?.retryDelay) : undefined;
        const seconds = Number.parseFloat(res.headers.get("retry-after") || detail?.retryDelay || "");
        const retryAfter = Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
        const period = quotaPeriod(failure);
        const label = lease.label || `#${(lease.slot ?? 0) + 1}`;
        console.warn(`[audit] model ${model} key ${label} HTTP ${res.status}; quota period=${period}`);

        if (res.status === 503 || res.status === 404) {
          // Model quá tải hoặc không khả dụng -> Thử model dự phòng tiếp theo
          continue;
        }

        if (res.status === 429) {
          const penaltyReason = period === "minute" ? "rate" : "quota";
          pool.penalize?.(lease, penaltyReason, retryAfter ? retryAfter * 1000 : undefined);
          throw new AuditError("Dịch vụ phân tích đang giới hạn lượt gọi. Vui lòng đợi rồi thử lại.", 429, retryAfter);
        }

        if (res.status === 401 || res.status === 403) {
          pool.penalize?.(lease, "invalid");
          throw new AuditError("Dịch vụ phân tích chưa được cấp quyền truy cập.", res.status);
        }

        throw new AuditError("Dịch vụ phân tích đang bận. Vui lòng thử lại.", res.status, retryAfter);
      }

      if (onDelta) {
        const text = await readGeminiStream(res, onDelta);
        pool.reportSuccess?.(lease);
        return text;
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
    } catch (err) {
      if (err instanceof AuditError) {
        lastFailure = err;
        if (err.status === 429 || err.status === 401 || err.status === 403) throw err;
      }
    }
  }

  if (lastFailure) throw lastFailure;
  throw new AuditError("Dịch vụ phân tích hiện đang quá tải. Vui lòng thử lại.", 503);
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
        await generateAudit(apiKeyOrPool, input, combined, delta => send(`data: ${JSON.stringify({ text: delta })}\n\n`));
      } catch (error) {
        send(`data: ${JSON.stringify({ error: error instanceof AuditError ? error.message : "Không thể hoàn thành phân tích.",
          ...(error instanceof AuditError ? { status: error.status, retryAfterSeconds: error.retryAfterSeconds, nextKeyAttempts: error.nextKeyAttempts } : {}) })}\n\n`);
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
  if (value.attemptedKeySlots !== undefined && (!Array.isArray(value.attemptedKeySlots)
    || value.attemptedKeySlots.length > MAX_AUDIT_KEY_ATTEMPTS
    || value.attemptedKeySlots.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= MAX_AUDIT_KEY_ATTEMPTS)
    || new Set(value.attemptedKeySlots).size !== value.attemptedKeySlots.length)) return null;
  return {
    profile: value.profile,
    currentAnalysis: typeof value.currentAnalysis === "string" ? value.currentAnalysis : undefined,
    messages: value.messages as AuditInput["messages"],
    attemptedKeySlots: value.attemptedKeySlots as number[] | undefined,
  };
}
