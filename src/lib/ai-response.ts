import { splitRefinement, type AuditInput } from "../../supabase/functions/_shared/audit.ts";

export class AiResponseError extends Error {
  constructor(message: string, public kind: "connection" | "response" | "validation", public draft = "", public retryAfterSeconds?: number, public status?: number) {
    super(message);
  }
}

export interface AiResponse {
  analysis: string;
  reply?: string;
  updatedAnalysis?: string | null;
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
    if (!res.ok || data?.error) throw new AiResponseError(data?.error || `Dịch vụ phân tích trả lỗi ${res.status}.`, "response", "", data?.retryAfterSeconds, res.status);
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
    if (typeof event.error === "string") throw new AiResponseError(event.error, "response", text, event.retryAfterSeconds, event.status);
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
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while (!completed && (end = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, end).replace(/\r$/, ""));
        buffer = buffer.slice(end + 1);
      }
      if (done && !completed) {
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
    await reader.cancel().catch(() => undefined);
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

/** Mỗi lần bấm gửi đúng một request; không tự tạo lại báo cáo đã nhận. */
export async function requestAiAudit(endpoint: string, input: AuditInput, onText?: (text: string) => void, signal?: AbortSignal): Promise<string> {
  let lastDraft = "";
  onText?.("");
  let analysis: string;
  try {
    const res = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
    });
    ({ analysis } = await readAiResponse(res, undefined, text => { lastDraft = text; onText?.(text); }));
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
