import { MAX_AUDIT_KEY_ATTEMPTS, splitRefinement, type AuditInput } from "./audit/audit.ts";

export class AiResponseError extends Error {
  constructor(message: string, public kind: "connection" | "response" | "validation", public draft = "", public retryAfterSeconds?: number, public status?: number, public nextKeyAttempts?: number[]) {
    super(message);
  }
}

export interface AiResponse {
  analysis: string;
  reply?: string;
  updatedAnalysis?: string | null;
}

function responseErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

/** Hoàn tất vận chuyển không phụ thuộc cách model đặt tiêu đề. */
export function completedReportError(text: string, input?: AuditInput): string | null {
  return text.trim() ? null : "Không nhận được nội dung báo cáo.";
}

function normalizeResponse(data: Record<string, unknown>, currentAnalysis?: string): AiResponse {
  const reply = typeof data.reply === "string" ? data.reply.trim() : undefined;
  const updated = typeof data.updatedAnalysis === "string" ? data.updatedAnalysis.trim() : undefined;
  if (updated === "") throw new AiResponseError("Báo cáo chỉnh sửa bị trống. Vui lòng thử lại.", "response");
  const analysis = updated || (typeof data.analysis === "string" ? data.analysis.trim() : "");
  if (analysis) return { analysis, reply, updatedAnalysis: currentAnalysis !== undefined && analysis !== currentAnalysis ? analysis : null };
  if (data.updatedAnalysis === null && currentAnalysis !== undefined && reply) return { analysis: currentAnalysis, reply, updatedAnalysis: null };
  throw new AiResponseError("Không nhận được báo cáo hoàn chỉnh.", "response");
}

export function completedRefinementError(result: AiResponse, input: AuditInput): string | null {
  return completedReportError(result.analysis);
}

export function refinementPreview(text: string): string {
  const report = splitRefinement(text)?.updatedAnalysis;
  if (report) return report;
  // Một số Edge cũ trả thẳng báo cáo thay vì marker chat.
  return /^\s*#{1,6}\s+(?:\*\*)?(?:\d+[.)]\s*)?Đánh giá tổng quan/i.test(text) ? text : "";
}

/** Đọc đủ sự kiện cuối, kể cả khi TCP chia giữa ký tự UTF-8 hoặc thiếu newline ở EOF. */
export async function readAiResponse(res: Response, currentAnalysis?: string, onText?: (text: string) => void): Promise<AiResponse> {
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) throw new AiResponseError(responseErrorMessage(data?.error, `Dịch vụ phân tích trả lỗi ${res.status}.`), "response", "", data?.retryAfterSeconds, res.status, data?.nextKeyAttempts);
    if (!data || typeof data !== "object") throw new AiResponseError("Không nhận được báo cáo hoàn chỉnh.", "response");
    return normalizeResponse(data, currentAnalysis);
  }
  if (!res.ok || !res.body) throw new AiResponseError(`Dịch vụ phân tích trả lỗi ${res.status}.`, "response");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventLines: string[] = [];
  let text = "";
  let completed = false;
  let bodyEnded = false;
  let snapshot: Record<string, unknown> | undefined;
  const dispatch = () => {
    if (!eventLines.length) return;
    const payload = eventLines.join("\n").trim();
    eventLines = [];
    if (payload === "[DONE]") { completed = true; return; }
    let event;
    try { event = JSON.parse(payload); }
    catch { throw new AiResponseError("Phản hồi bị thiếu hoặc sai định dạng trong lúc truyền. Vui lòng thử lại.", "response", text); }
    if (!event || typeof event !== "object") throw new AiResponseError("Dịch vụ trả phản hồi không hợp lệ. Vui lòng thử lại.", "response", text);
    if (event.error) throw new AiResponseError(responseErrorMessage(event.error, "Dịch vụ phân tích không hoàn tất yêu cầu."), "response", text, event.retryAfterSeconds, event.status, event.nextKeyAttempts);
    if (typeof event.text === "string") { text += event.text; onText?.(text); }
    if (typeof event.analysis === "string" || typeof event.updatedAnalysis === "string" || event.updatedAnalysis === null) {
      snapshot = { ...snapshot, ...event };
      const preview = typeof event.updatedAnalysis === "string" ? event.updatedAnalysis : event.analysis;
      if (typeof preview === "string") onText?.(preview);
    } else if (typeof event.reply === "string") snapshot = { ...snapshot, reply: event.reply };
  };
  const line = (value: string) => {
    if (!value.trim()) dispatch();
    else if (value.startsWith("data:")) eventLines.push(value.slice(5).trimStart());
  };
  try {
    while (!bodyEnded) {
      const { done, value } = await reader.read();
      bodyEnded = done;
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, end).replace(/\r$/, ""));
        buffer = buffer.slice(end + 1);
      }
      if (done) {
        if (buffer) line(buffer.replace(/\r$/, ""));
        dispatch();
        break;
      }
    }
    if (!completed) throw new AiResponseError("Kết nối kết thúc trước khi nhận xác nhận hoàn tất báo cáo. Vui lòng thử lại.", "connection", text);
  } catch (error) {
    if (error instanceof AiResponseError) throw error;
    throw new AiResponseError("Kết nối bị gián đoạn trong lúc nhận báo cáo. Vui lòng thử lại.", "connection", text);
  } finally {
    // Chỉ hủy khi có lỗi; DONE chưa chứng minh HTTP đã kết thúc bình thường.
    if (!bodyEnded) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (snapshot && ("analysis" in snapshot || "updatedAnalysis" in snapshot)) return normalizeResponse(snapshot, currentAnalysis);
  if (currentAnalysis !== undefined) {
    const result = splitRefinement(text);
    if (!result) {
      if (!completedReportError(text)) return { analysis: text, updatedAnalysis: text, reply: typeof snapshot?.reply === "string" ? snapshot.reply : undefined };
      throw new AiResponseError("Phản hồi chỉnh sửa chưa đầy đủ. Vui lòng thử lại.", "response", text);
    }
    return { ...result, analysis: result.updatedAnalysis ?? currentAnalysis };
  }
  return { analysis: text };
}

/** Mỗi key có một lượt gọi riêng để không vượt giới hạn 60 giây của Netlify. */
async function requestWithKeyFailover(endpoint: string, input: AuditInput, currentAnalysis?: string, onText?: (text: string) => void, signal?: AbortSignal): Promise<AiResponse> {
  let attemptedKeySlots: number[] = [];
  for (;;) {
    if (signal?.aborted) throw new AiResponseError("Đã dừng phân tích.", "connection");
    const res = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, attemptedKeySlots }), signal,
    });
    try {
      return await readAiResponse(res, currentAnalysis, onText);
    } catch (error) {
      const next = error instanceof AiResponseError ? error.nextKeyAttempts : undefined;
      if (!Array.isArray(next) || next.length <= attemptedKeySlots.length || next.length > MAX_AUDIT_KEY_ATTEMPTS
        || next.some((slot, index) => !Number.isInteger(slot) || slot < 0 || slot >= MAX_AUDIT_KEY_ATTEMPTS
          || (index < attemptedKeySlots.length && slot !== attemptedKeySlots[index]))) throw error;
      attemptedKeySlots = next;
      onText?.("");
    }
  }
}

export async function requestAiRefinement(endpoint: string, input: AuditInput, onText?: (text: string) => void, signal?: AbortSignal): Promise<AiResponse> {
  try {
    return await requestWithKeyFailover(endpoint, input, input.currentAnalysis, onText, signal);
  } catch (error) {
    if (error instanceof AiResponseError) throw error;
    throw new AiResponseError("Không kết nối được máy chủ. Vui lòng thử lại.", "connection");
  }
}

/** Báo lỗi khi mọi key đã thất bại; báo cáo thành công không bị gọi lại. */
export async function requestAiAudit(endpoint: string, input: AuditInput, onText?: (text: string) => void, signal?: AbortSignal): Promise<string> {
  let lastDraft = "";
  onText?.("");
  let analysis: string;
  try {
    ({ analysis } = await requestWithKeyFailover(endpoint, input, undefined, text => { lastDraft = text; onText?.(text); }, signal));
  } catch (error) {
    if (error instanceof AiResponseError) {
      error.draft ||= lastDraft;
      throw error;
    }
    throw new AiResponseError("Không kết nối được máy chủ. Vui lòng thử lại.", "connection", lastDraft);
  }
  lastDraft = analysis;
  const error = completedReportError(analysis, input);
  if (!error) return analysis;
  throw new AiResponseError(error, "response", analysis);
}
