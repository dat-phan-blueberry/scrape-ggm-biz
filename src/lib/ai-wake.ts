/**
 * Thời điểm kiểm tra healthcheck thành công gần nhất (timestamp ms)
 * Lưu trong memory: Nếu lần healthcheck trước < 5 phút -> Khỏi call healthcheck lại
 */
let lastHealthCheckTime = 0;
export const WAKE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

export function getLastHealthCheckTime(): number {
  return lastHealthCheckTime;
}

export function setLastHealthCheckTime(time: number): void {
  lastHealthCheckTime = time;
}

export function resetWakeState(): void {
  lastHealthCheckTime = 0;
}

/**
 * Đảm bảo AI Gateway đang thức trước khi gửi yêu cầu AI:
 * - Nếu lần healthcheck trước < 5 phút: Bỏ qua (trả về true ngay lập tức).
 * - Nếu >= 5 phút hoặc lần đầu: Gửi request healthcheck với timeout 10s, retry tối đa 5 lần.
 * - Callback onStatus cập nhật chữ "Đang đánh thức dịch vụ" lên màn hình Loading.
 */
export async function ensureGatewayAwake(
  onStatus?: (message: string) => void,
  signal?: AbortSignal
): Promise<boolean> {
  const now = Date.now();

  // 1. Nếu lần healthcheck trước < 5 phút -> Khỏi call healthcheck lại
  if (now - lastHealthCheckTime < WAKE_CACHE_TTL_MS) {
    return true;
  }

  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) return false;

    const message = attempt === 1
      ? "Đang đánh thức dịch vụ..."
      : `Đang đánh thức dịch vụ (lần thử ${attempt}/${maxRetries})...`;

    onStatus?.(message);

    try {
      const res = await fetch("/api/ai-wake", {
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.awake) {
          lastHealthCheckTime = Date.now();
          return true;
        }
      }
    } catch {
      // Bỏ qua lỗi và retry nếu chưa hết số lần thử
    }

    if (attempt < maxRetries && !signal?.aborted) {
      // Nghỉ 1 giây giữa các lần thử lại
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return false;
}
