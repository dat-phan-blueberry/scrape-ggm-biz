import { buildPrompt, cleanBusinessReportText, responseValidationError, type AuditInput } from "./audit.ts";

const MODELS = ["gemini-flash-latest", "gemini-flash-latest", "gemini-3.5-flash"];
export class AuditError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

/** Kiểm tra toàn bộ kết quả trước khi gửi, không để bản retry lỗi lọt ra UI/PDF. */
export async function generateAudit(apiKey: string, input: AuditInput, signal?: AbortSignal): Promise<string> {
  const prompt = buildPrompt(input);
  const deadline = Date.now() + 50_000;
  let correction = "";
  let invalidOutput = false;
  for (const model of MODELS) {
    if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const timeout = AbortSignal.timeout(Math.min(22_000, remaining));
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + (correction ? `\n\nLần trước chưa đạt kiểm tra: ${correction}\nHãy viết lại câu trả lời hoàn chỉnh.` : "") }] }],
          generationConfig: { temperature: 0.65, topP: 0.95, maxOutputTokens: 8192 },
        }),
      });
      if (res.status === 401 || res.status === 403) throw new AuditError("Dịch vụ phân tích chưa được cấp quyền truy cập.", res.status);
      if (!res.ok) { await res.body?.cancel(); continue; }
      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = cleanBusinessReportText((candidate?.content?.parts || [])
        .filter((part: { text?: string; thought?: boolean }) => typeof part.text === "string" && !part.thought)
        .map((part: { text: string }) => part.text).join("\n"));
      correction = candidate?.finishReason !== "STOP"
        ? "Nội dung chưa kết thúc đầy đủ. Viết báo cáo hoàn chỉnh, cô đọng hơn."
        : responseValidationError(text, input) || "";
      if (!correction) return text;
      invalidOutput = true;
    } catch (error) {
      if (error instanceof AuditError) throw error;
      if (signal?.aborted) throw new AuditError("Đã dừng phân tích.", 499);
      // Không log lỗi fetch vì có thể chứa thông tin xác thực của request.
    }
  }
  throw new AuditError(invalidOutput
    ? "Báo cáo chưa đạt yêu cầu nội dung hoặc thang điểm 0–10 sau khi thử lại. Vui lòng thử lại."
    : "Dịch vụ phân tích đang bận hoặc kết nối bị gián đoạn. Vui lòng thử lại.");
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
        send(`data: ${JSON.stringify({ error: error instanceof AuditError ? error.message : "Không thể hoàn thành phân tích." })}\n\n`);
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
