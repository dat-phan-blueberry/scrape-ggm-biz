import { AuditError, generateAudit } from "../src/lib/audit/audit-service.ts";

Deno.test("Gemini ngừng gửi giữa chừng thì báo lỗi 504 thay vì để UI đứng ở bản dở", async () => {
  Deno.env.set("AI_STREAM_IDLE_MS", "50");
  Deno.env.set("AI_FIRST_CHUNK_MS", "50");
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (() => Promise.resolve(new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"## Đánh giá tổng quan"}]}}]}\n\n'));
      // Không đóng luồng: mô phỏng nguồn treo sau chunk đầu.
    },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/event-stream" } }))) as typeof fetch;
  const deltas: string[] = [];
  try {
    const started = Date.now();
    const error = await generateAudit("test-key", { profile: { title: "Quán thử" } }, undefined, d => deltas.push(d)).then(() => null, e => e);
    if (!(error instanceof AuditError) || error.status !== 504) throw new Error(`Expected AuditError 504, got ${error}`);
    if (Date.now() - started > 2000) throw new Error("Idle timeout không kích hoạt kịp");
    if (deltas.join("") !== "## Đánh giá tổng quan") throw new Error("Mất chunk đã nhận");
    if (!cancelled) throw new Error("Không hủy luồng treo");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("AI_STREAM_IDLE_MS");
    Deno.env.delete("AI_FIRST_CHUNK_MS");
  }
});
