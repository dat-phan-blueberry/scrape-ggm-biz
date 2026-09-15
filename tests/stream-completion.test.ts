import { AiResponseError, readAiResponse } from "../src/lib/ai-response.ts";

const report = "## Tổng quan\nBáo cáo đã sửa.";
const encoder = new TextEncoder();
const packet = `data: ${JSON.stringify({ analysis: report })}\n\ndata: [DONE]\n\n`;

Deno.test("SSE hoàn tất phải đọc hết HTTP, không tự hủy request sau DONE", async () => {
  let cancelled = false, ended = false;
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(packet)); },
    pull(controller) { ended = true; controller.close(); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { "Content-Type": "text/event-stream" } });
  const result = await readAiResponse(response, "Bản cũ");
  if (result.analysis !== report || !ended || cancelled) throw new Error(`HTTP ended=${ended}, cancelled=${cancelled}`);
});

Deno.test("HTTP đứt sau DONE vẫn báo lỗi kết nối, không nhận thành công bản sửa", async () => {
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(packet)); },
    pull(controller) { controller.error(new TypeError("Failed to fetch")); },
  }, { highWaterMark: 0 }), { headers: { "Content-Type": "text/event-stream" } });
  try {
    await readAiResponse(response, "Bản cũ");
  } catch (error) {
    if (error instanceof AiResponseError && error.kind === "connection") return;
    throw error;
  }
  throw new Error("Đã báo thành công khi HTTP bị đứt");
});

Deno.test("SSE có lỗi dạng object không được bỏ qua dù đã nhận nội dung và DONE", async () => {
  const body = `data: ${JSON.stringify({ analysis: report })}\n\ndata: {"error":{"message":"Dịch vụ không hoàn tất"},"status":502}\n\ndata: [DONE]\n\n`;
  const response = new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  try {
    await readAiResponse(response, "Bản cũ");
  } catch (error) {
    if (error instanceof AiResponseError && error.message === "Dịch vụ không hoàn tất" && error.status === 502) return;
    throw error;
  }
  throw new Error("Bỏ qua sự kiện lỗi, nhận thành công bản sửa");
});
