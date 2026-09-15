import { AuditError, generateAudit } from "../supabase/functions/_shared/audit-service.ts";
import { handleAuditRequest } from "../supabase/functions/ai-analysis/handler.ts";
import { AiResponseError, requestAiAudit, readAiResponse } from "../src/lib/ai-response.ts";
import { AUDIT_PROMPT_VERSION, AUDIT_SYSTEM_INSTRUCTION, buildPrompt } from "../supabase/functions/_shared/audit.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const report = "## Tổng quan\nQuán có thông tin để khách cân nhắc.\n## Thực đơn dạng chữ\nChưa thu thập danh sách món, cần xem menu trước khi nhận định.\n## Điểm cạnh tranh: 7.5/10";
const generated = (text = report, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });

Deno.test("Hotfix: một thao tác UI → Edge → Gemini, nhận report khác tiêu đề mà không gọi lần hai", async () => {
  const original = globalThis.fetch, key = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");
  let appCalls = 0, modelCalls = 0;
  Deno.env.set("GOOGLE_AI_STUDIO_API_KEY", "test-key");
  globalThis.fetch = async (url, options) => {
    if (String(url) === "http://local.test/audit") {
      appCalls++;
      const response = await handleAuditRequest(new Request(String(url), options));
      equal(response.headers.get("X-Audit-Prompt-Version"), AUDIT_PROMPT_VERSION);
      return response;
    }
    if (!String(url).startsWith("https://generativelanguage.googleapis.com/")) throw new Error("Unexpected network call");
    modelCalls++;
    const body = JSON.parse(String(options?.body));
    equal(body.generationConfig.responseSchema, undefined);
    equal(body.systemInstruction, { parts: [{ text: AUDIT_SYSTEM_INSTRUCTION }] });
    equal(body.contents.length, 1);
    equal(body.contents[0].parts[0].text.includes(AUDIT_SYSTEM_INSTRUCTION), false);
    return generated();
  };
  try {
    equal(await requestAiAudit("http://local.test/audit", { profile: {} }), report);
    equal({ appCalls, modelCalls }, { appCalls: 1, modelCalls: 1 });
  } finally {
    globalThis.fetch = original;
    if (key === undefined) Deno.env.delete("GOOGLE_AI_STUDIO_API_KEY"); else Deno.env.set("GOOGLE_AI_STUDIO_API_KEY", key);
  }
});

Deno.test("Hotfix: 429/503/403 không retry, fallback hoặc gọi reviewer", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [429, 503, 403]) {
      let calls = 0;
      globalThis.fetch = () => { calls++; return Promise.resolve(Response.json({ error: {} }, { status, headers: { "Retry-After": "20" } })); };
      let error: unknown;
      try { await generateAudit("test-key", { profile: {} }); } catch (e) { error = e; }
      equal(error instanceof AuditError, true);
      equal((error as AuditError).status, status);
      equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

Deno.test("Hotfix: response rỗng hoặc bị cắt báo lỗi đúng và không gọi lại", async () => {
  const original = globalThis.fetch;
  try {
    for (const [text, reason] of [["", "STOP"], [report, "MAX_TOKENS"]]) {
      let calls = 0;
      globalThis.fetch = () => { calls++; return Promise.resolve(generated(text, reason)); };
      let failed = false;
      try { await generateAudit("test-key", { profile: {} }); } catch (e) { failed = e instanceof AuditError; }
      equal(failed, true); equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

Deno.test("Hotfix: client giữ lỗi API, chỉ một request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; return Promise.resolve(Response.json({ error: "Dịch vụ bận" }, { status: 503 })); };
  try {
    let error: unknown;
    try { await requestAiAudit("http://local.test/audit", { profile: {} }); } catch (e) { error = e; }
    equal(error instanceof AiResponseError, true); equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

Deno.test("Hotfix: chat JSON/SSE nhận bản sửa khác tiêu đề, không đánh giá lại nội dung", async () => {
  const updated = report + "\nKiểm tra menu mỗi thứ Hai.";
  equal((await readAiResponse(Response.json({ analysis: report, updatedAnalysis: updated }), report)).analysis, updated);
  const stream = `data: ${JSON.stringify({ text: `=== PHẢN HỒI CHAT ===\nĐã sửa.\n=== BẢN BÁO CÁO CẬP NHẬT ===\n${updated}` })}\n\ndata: [DONE]\n\n`;
  equal((await readAiResponse(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }), report)).analysis, updated);
});

Deno.test("Hotfix: prompt gọn, giữ quy tắc địa giới, Text Menu, điểm và chat", () => {
  const prompt = buildPrompt({ profile: {}, currentAnalysis: report, messages: [{ role: "user", content: "Rút ngắn" }] });
  equal(AUDIT_SYSTEM_INSTRUCTION.length < 2200, true);
  for (const rule of ["Quảng Nam và Đà Nẵng", "Hội An/An Bàng hiện thuộc thành phố Đà Nẵng", "Text Menu", "0 đến 10", "Thiếu dữ liệu", "Tên món; Giá và khẩu phần; Mô tả món; Nhóm món"]) equal(AUDIT_SYSTEM_INSTRUCTION.includes(rule), true);
  equal(AUDIT_SYSTEM_INSTRUCTION.split("\n").filter(line => line.startsWith("## ")).length, 6);
  equal(prompt.includes("TOÀN BỘ báo cáo đã sửa"), true);
  equal(prompt.includes("Trả JSON"), false);
});
