import { buildPrompt, cleanBusinessReportText, responseValidationError, CHAT_MARKER, REPORT_MARKER, type AuditInput } from "./audit.ts";
import { AUDIT_RESPONSE_SCHEMA, decodeAuditOutput } from "./audit-format.ts";
import { AUDIT_REVIEW_SCHEMA, buildReviewPrompt, reviewCorrection } from "./audit-review.ts";

// Lượt bị chặn trước khi sinh nội dung không lấy mất lượt sửa của model dự phòng.
const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite"];
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

/** Kiểm tra toàn bộ kết quả trước khi gửi, không để bản retry lỗi lọt ra UI/PDF. */
export async function generateAudit(apiKey: string, input: AuditInput, signal?: AbortSignal): Promise<string> {
  const prompt = buildPrompt(input);
  const deadline = Date.now() + 110_000;
  let correction = "";
  let previousOutput = "";
  let invalidOutput = false;
  let upstreamStatus = 502;
  let lastFailure: "provider" | "validation" = "provider";
  let retryAfterSeconds: number | undefined;
  let generated = 0;
  const unavailableModels = new Set<string>();
  const request = async (model: string, contents: Array<{ role: string; parts: Array<{ text: string }> }>, review = false) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const timeout = AbortSignal.timeout(Math.min(35_000, remaining));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: review ? 0 : 0.35, topP: 0.9, maxOutputTokens: review ? 4096 : 8192,
          responseMimeType: "application/json", responseSchema: review ? AUDIT_REVIEW_SCHEMA : AUDIT_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: "medium" },
        },
      }),
    });
    if (res.status === 401 || res.status === 403) throw new AuditError("Dịch vụ phân tích chưa được cấp quyền truy cập.", res.status);
    if (!res.ok) {
      upstreamStatus = res.status;
      lastFailure = "provider";
      const failure = await res.json().catch(() => null);
      const period = res.status === 429 ? quotaPeriod(failure) : undefined;
      console.warn(`[audit] ${model}: HTTP ${res.status}${period ? `; quota period=${period}` : ""}`);
      if (res.status === 429 && period === "day") {
        unavailableModels.add(model);
        return null;
      }
      const retryDelay = failure?.error?.details?.find((d: { retryDelay?: string }) => d.retryDelay)?.retryDelay;
      const seconds = Number.parseFloat(res.headers.get("retry-after") || retryDelay || "2");
      retryAfterSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
      if ((res.status === 429 || res.status >= 500) && Number.isFinite(seconds) && seconds * 1000 >= deadline - Date.now()) {
        // Không thử sớm hơn Retry-After của cùng model; phương án khác vẫn được thử.
        unavailableModels.add(model);
        return null;
      }
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.min(Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 2000, Math.max(0, deadline - Date.now()));
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); };
          const timer = setTimeout(finish, delay);
          signal?.addEventListener("abort", finish, { once: true });
        });
      }
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0] || { finishReason: "EMPTY" };
  };
  const candidateText = (candidate: { content?: { parts?: Array<{ text?: string; thought?: boolean }> } }) =>
    cleanBusinessReportText((candidate.content?.parts || []).filter(part => typeof part.text === "string" && !part.thought).map(part => part.text).join("\n"));
  for (const model of MODELS) {
    if (generated >= 3 || Date.now() >= deadline) break;
    if (unavailableModels.has(model)) continue;
    if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
    try {
      const candidate = await request(model, [
        { role: "user", parts: [{ text: prompt }] },
        ...(correction ? [
          { role: "model", parts: [{ text: previousOutput || "{}" }] },
          { role: "user", parts: [{ text: `Lần trước chưa đạt kiểm tra: ${correction}\nSửa đúng lỗi trên trong TẤT CẢ các mục liên quan, kể cả giải thích điểm. Trả lại JSON hoàn chỉnh.` }] },
        ] : []),
      ]);
      if (!candidate) continue;
      generated++;
      const raw = candidateText(candidate);
      previousOutput = raw;
      if (candidate?.finishReason !== "STOP") {
        correction = "Nội dung chưa kết thúc đầy đủ. Viết báo cáo hoàn chỉnh, cô đọng hơn.";
        invalidOutput = true;
        lastFailure = "validation";
        continue;
      }
      let text: string;
      try {
        const output = decodeAuditOutput(raw, !!input.messages?.length);
        text = input.messages?.length
          ? `${CHAT_MARKER}\n${output.reply}\n${REPORT_MARKER}\n${output.analysis ?? "GIỮ NGUYÊN"}`
          : output.analysis!;
      } catch (error) {
        correction = error instanceof SyntaxError ? "Cần JSON đúng cấu trúc được yêu cầu." : (error as Error).message;
        invalidOutput = true;
        lastFailure = "validation";
        continue;
      }
      correction = responseValidationError(text, input) || "";
      {
        const review = await request(model, [{ role: "user", parts: [{ text: buildReviewPrompt(input, text) }] }], true);
        if (!review) continue;
        try {
          if (review.finishReason !== "STOP") {
            console.warn(`[audit] ${model}: kiểm chứng kết thúc ${review.finishReason}`);
            throw new Error("Chưa hoàn tất kiểm chứng báo cáo.");
          }
          correction = [correction, reviewCorrection(candidateText(review), text)].filter(Boolean).join("\n");
        } catch {
          correction = [correction, "Chưa hoàn tất kiểm chứng. Viết lại cô đọng, giữ nguồn nhận xét và chỉ kết luận điều có bằng chứng."].filter(Boolean).join("\n");
        }
      }
      if (!correction) return text;
      console.warn(`[audit] ${model}: ${correction.split(".")[0].slice(0, 160)}`);
      invalidOutput = true;
      lastFailure = "validation";
    } catch (error) {
      if (error instanceof AuditError) throw error;
      if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
      upstreamStatus = 502;
      lastFailure = "provider";
      console.warn(`[audit] ${model}: ${(error as Error).name === "TimeoutError" ? "hết thời gian chờ" : "lỗi kết nối"}`);
      // Không log lỗi fetch vì có thể chứa thông tin xác thực của request.
    }
  }
  const validationFailed = invalidOutput && lastFailure === "validation";
  throw new AuditError(validationFailed
    ? "Báo cáo chưa đạt yêu cầu nội dung hoặc thang điểm 0–10 sau khi thử lại. Vui lòng thử lại."
    : upstreamStatus === 429 ? "Dịch vụ phân tích đang giới hạn lượt gọi. Vui lòng đợi một lát rồi thử lại."
    : "Dịch vụ phân tích đang bận hoặc kết nối bị gián đoạn. Vui lòng thử lại.", !validationFailed && upstreamStatus === 429 ? 429 : 502,
    validationFailed ? undefined : retryAfterSeconds);
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
