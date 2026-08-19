/**
 * Một cửa duy nhất để gọi SerpAPI. Mọi route phải đi qua đây thay vì tự
 * `fetch` — nếu không thì key pool không thấy được lỗi quota và sẽ không bao
 * giờ xoay key.
 */

import { getSerpApiKeyPool, type PenaltyReason } from "./key-pool";

/** Lỗi đã được dịch sẵn thành câu tiếng Việt cho người dùng cuối. */
export class SerpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

/**
 * Phân loại lỗi SerpAPI trả về.
 *
 * Trả `null` nghĩa là request thành công.
 * `"quota"` / `"rate"` / `"invalid"` là lỗi thuộc về KEY → phạt key rồi thử key khác.
 * `"upstream"` là lỗi thuộc về REQUEST hoặc phía SerpAPI → xoay key vô ích,
 * phải trả lỗi ra ngay (nếu không, một `data_id` sai sẽ đốt sạch cả bốn key).
 */
type Classification =
  | { kind: PenaltyReason; message: string }
  | { kind: "upstream"; message: string }
  | null;

export function classify(status: number, data: any): Classification {
  const message = String(data?.error ?? "").trim();
  const hasError = message.length > 0;

  if (status >= 200 && status < 300 && !hasError) return null;

  const lower = message.toLowerCase();

  // Hết lượt tìm kiếm của tài khoản (free tier 100 lượt/tháng, hoặc plan đã cạn).
  if (
    lower.includes("run out of searches") ||
    lower.includes("ran out of searches") ||
    lower.includes("exceeded") ||
    lower.includes("no searches left") ||
    lower.includes("search limit")
  ) {
    return { kind: "quota", message };
  }

  // Gửi quá nhanh / quá nhiều request song song — key vẫn tốt, chỉ cần nghỉ ngắn.
  if (lower.includes("throttle") || lower.includes("too many requests") || lower.includes("rate limit")) {
    return { kind: "rate", message };
  }

  // Key sai, bị revoke, hoặc tài khoản bị khoá.
  if (
    status === 401 ||
    status === 403 ||
    lower.includes("invalid api key") ||
    lower.includes("api key") ||
    lower.includes("unauthorized")
  ) {
    return { kind: "invalid", message };
  }

  // 429 mà không khớp câu nào ở trên: SerpAPI dùng 429 cho cả "hết lượt" lẫn
  // "quá nhanh". Đoán về phía "hết lượt" vì đó là ca hay gặp ở free tier —
  // đoán sai thì chỉ mất một key trong 24h, còn đoán ngược thì cả pool bị bắn
  // liên tục vào tường rate limit.
  if (status === 429) {
    return { kind: "quota", message: message || "HTTP 429 không kèm mô tả" };
  }

  return { kind: "upstream", message: message || `HTTP ${status}` };
}

/**
 * Gọi SerpAPI với key lấy từ pool, tự xoay sang key kế tiếp khi key hiện tại
 * hết hạn mức. `params` KHÔNG được chứa `api_key` — hàm này tự gắn.
 */
export async function serpApiSearch(
  params: URLSearchParams,
  tag: string,
): Promise<any> {
  const pool = getSerpApiKeyPool();

  if (pool.size === 0) {
    throw new SerpApiError(
      "SERPAPI_KEY chưa được cấu hình",
      500,
      "Máy chủ chưa cấu hình nguồn dữ liệu (.env)",
    );
  }

  let lastUserMessage = "Nguồn dữ liệu không phản hồi";

  // Mỗi key được thử tối đa một lần cho mỗi request; hết key thì thôi.
  for (let attempt = 0; attempt < pool.size; attempt++) {
    const lease = pool.acquire();
    if (!lease) break;

    const search = new URLSearchParams(params);
    search.set("api_key", lease.key);

    let res: Response;
    let data: any;
    try {
      res = await fetch(`https://serpapi.com/search.json?${search.toString()}`);
      data = await res.json().catch(() => ({}));
    } catch (error) {
      // Lỗi mạng không phải lỗi của key — đừng phạt oan, đừng đốt key kế tiếp.
      console.error(`[${tag}] không kết nối được SerpAPI:`, error);
      throw new SerpApiError(
        "network error",
        502,
        "Không kết nối được nguồn dữ liệu",
      );
    }

    const failure = classify(res.status, data);

    if (failure === null) {
      pool.reportSuccess(lease);
      return data;
    }

    // Log dùng nhãn đã mask, không bao giờ in key ra.
    console.error(
      `[${tag}] SerpAPI ${failure.kind} · key ${lease.label} · HTTP ${res.status}: ${failure.message}`,
    );

    if (failure.kind === "upstream") {
      throw new SerpApiError(
        failure.message,
        res.status >= 400 ? res.status : 502,
        `Nguồn dữ liệu trả về lỗi (${res.status})`,
      );
    }

    pool.penalize(lease, failure.kind);
    lastUserMessage =
      failure.kind === "invalid"
        ? "Một khóa nguồn dữ liệu không còn hợp lệ — cần kiểm tra cấu hình."
        : "Nguồn dữ liệu đã hết hạn mức.";
  }

  // Tới đây là mọi key đều đang nghỉ. Nói rõ chờ tới lúc nào thay vì lỗi chung chung.
  const readyAt = pool.nextAvailableAt();
  const waitNote = readyAt
    ? ` Hạn mức mở lại lúc ${readyAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`
    : "";

  console.error(
    `[${tag}] cả ${pool.size} key SerpAPI đang nghỉ; sớm nhất mở lại ${readyAt?.toISOString() ?? "không rõ"}`,
  );

  throw new SerpApiError(
    "all keys cooling down",
    429,
    `${lastUserMessage}${waitNote}`,
  );
}
