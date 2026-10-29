import { AuditError, generateAudit, AUDIT_MODEL } from "../src/lib/audit/audit-service.ts";
import { handleAuditRequest } from "../src/lib/audit/handler.ts";
import { AiResponseError, requestAiAudit, readAiResponse } from "../src/lib/ai-response.ts";
import { AUDIT_PROMPT_VERSION, AUDIT_SYSTEM_INSTRUCTION, buildPrompt } from "../src/lib/audit/audit.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const report = "## Tổng quan\nQuán có thông tin để khách cân nhắc.\n## Thực đơn dạng chữ\nChưa thu thập danh sách món, cần xem menu trước khi nhận định.\n## Điểm cạnh tranh: 7.5/10";
const generated = (text = report, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const streamed = (text = report) => new Response(
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: text.slice(0, 20) }] } }] })}\n\n`
    + `data: ${JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: text.slice(20) }] } }] })}\n\n`,
  { headers: { "Content-Type": "text/event-stream" } },
);

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
    equal(String(url), `https://generativelanguage.googleapis.com/v1beta/models/${AUDIT_MODEL}:streamGenerateContent?alt=sse`);
    modelCalls++;
    const body = JSON.parse(String(options?.body));
    equal(body.generationConfig.responseSchema, undefined);
    equal(body.systemInstruction, { parts: [{ text: AUDIT_SYSTEM_INSTRUCTION }] });
    equal(body.contents.length, 1);
    equal(body.contents[0].parts[0].text.includes(AUDIT_SYSTEM_INSTRUCTION), false);
    return streamed();
  };
  try {
    equal(await requestAiAudit("http://local.test/audit", { profile: {} }), report);
    equal({ appCalls, modelCalls }, { appCalls: 1, modelCalls: 1 });
  } finally {
    globalThis.fetch = original;
    if (key === undefined) Deno.env.delete("GOOGLE_AI_STUDIO_API_KEY"); else Deno.env.set("GOOGLE_AI_STUDIO_API_KEY", key);
  }
});

Deno.test("503 từ Gemini dừng ở key hiện tại, giữ thời gian chờ và không phạt key", async () => {
  const original = globalThis.fetch;
  const attempts: string[] = [];
  const penalties: string[] = [];
  const keys = ["test-key-1", "test-key-2"];
  let next = 0;
  globalThis.fetch = (_url, options) => {
    attempts.push(String((options?.headers as Record<string, string>)["x-goog-api-key"]));
    return Promise.resolve(Response.json({ error: { message: "Unavailable" } }, { status: 503, headers: { "Retry-After": "20" } }));
  };
  try {
    let error: unknown;
    try {
      await generateAudit({
        size: keys.length,
        acquire: () => next < keys.length ? { key: keys[next++], slot: next - 1 } : null,
        penalize: (_lease, reason) => penalties.push(reason),
      }, { profile: {} });
    } catch (caught) { error = caught; }
    equal(error instanceof AuditError, true);
    equal((error as AuditError).status, 503);
    equal((error as AuditError).retryAfterSeconds, 20);
    equal(attempts, ["test-key-1"]);
    equal(penalties, []);
  } finally { globalThis.fetch = original; }
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

Deno.test("Hotfix: prompt đầy đủ 5 trụ cột, Text Menu, 100 điểm và chat", () => {
  const prompt = buildPrompt({ profile: {}, currentAnalysis: report, messages: [{ role: "user", content: "Rút ngắn" }] });
  for (const rule of ["Text Menu", "100 ĐIỂM", "5 Trụ cột - 19 Tiêu chí", "Bảng điểm sức khỏe hồ sơ GBP", "Kế hoạch hành động 30 ngày"]) equal(AUDIT_SYSTEM_INSTRUCTION.includes(rule), true);
  // Khôi phục tiêu chí Hỏi & Đáp (3đ) và cố định tổng 100 điểm.
  equal(/Hỏi & Đáp|Q&A/.test(AUDIT_SYSTEM_INSTRUCTION), true);
  equal(prompt.includes("TOÀN BỘ báo cáo đã sửa"), true);
  equal(prompt.includes("Trả JSON"), false);
});
