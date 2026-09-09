import { parseAndValidateScore, splitRefinement, type AuditInput } from "../../supabase/functions/_shared/audit.ts";

export class AiResponseError extends Error {
  constructor(message: string, public kind: "connection" | "response" | "validation", public draft = "") {
    super(message);
  }
}

interface AiResponse {
  analysis: string;
  reply?: string;
  updatedAnalysis?: string | null;
}

/** Tiêu chí biên tập nằm ở bước sinh báo cáo; khác tên tiêu đề không phải lỗi truyền. */
export function completedReportError(text: string): string | null {
  if (!text.trim() || text.length < 300) return "Nội dung báo cáo chưa đầy đủ.";
  if (parseAndValidateScore(text) === null) return "Báo cáo chưa có một điểm cạnh tranh hợp lệ từ 0 đến 10.";
  return null;
}

/** Đọc đủ sự kiện cuối, kể cả khi TCP chia giữa ký tự UTF-8 hoặc thiếu newline ở EOF. */
export async function readAiResponse(res: Response, currentAnalysis?: string, onText?: (text: string) => void): Promise<AiResponse> {
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) throw new AiResponseError(data?.error || `Dịch vụ phân tích trả lỗi ${res.status}.`, "response");
    if (!data || typeof data.analysis !== "string") throw new AiResponseError("Không nhận được báo cáo hoàn chỉnh.", "response");
    return data;
  }
  if (!res.ok || !res.body) throw new AiResponseError(`Dịch vụ phân tích trả lỗi ${res.status}.`, "response");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventLines: string[] = [];
  let text = "";
  let completed = false;
  const dispatch = () => {
    if (!eventLines.length) return;
    const payload = eventLines.join("\n").trim();
    eventLines = [];
    if (payload === "[DONE]") { completed = true; return; }
    let event;
    try { event = JSON.parse(payload); }
    catch { throw new AiResponseError("Phản hồi bị thiếu hoặc sai định dạng trong lúc truyền. Vui lòng thử lại.", "response", text); }
    if (!event || typeof event !== "object") throw new AiResponseError("Dịch vụ trả phản hồi không hợp lệ. Vui lòng thử lại.", "response", text);
    if (typeof event.error === "string") throw new AiResponseError(event.error, "response", text);
    if (typeof event.text === "string") { text += event.text; onText?.(text); }
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
  if (currentAnalysis !== undefined) {
    const result = splitRefinement(text);
    if (!result) throw new AiResponseError("Phản hồi chỉnh sửa chưa đầy đủ. Vui lòng thử lại.", "response", text);
    return { ...result, analysis: result.updatedAnalysis ?? currentAnalysis };
  }
  return { analysis: text };
}

/** Endpoint cũ có thể chưa kiểm tra kết quả: UI thử lại một lần nếu nội dung sai. */
export async function requestAiAudit(endpoint: string, input: AuditInput, onText?: (text: string) => void): Promise<string> {
  let lastDraft = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    onText?.("");
    let analysis: string;
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
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
    const error = completedReportError(analysis);
    if (!error) return analysis;
    if (attempt === 1) throw new AiResponseError(`Đã thử lại nhưng báo cáo chưa đạt yêu cầu: ${error}`, "validation", analysis);
  }
  throw new AiResponseError("Không thể hoàn tất báo cáo.", "response");
}
