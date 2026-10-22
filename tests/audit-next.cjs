const assert = require("node:assert/strict");
require("./register.cjs");
const { POST } = require("../src/app/api/ai-analysis/route.ts");
const { AUDIT_PROMPT_VERSION, AUDIT_SYSTEM_INSTRUCTION, CHAT_MARKER, REPORT_MARKER } = require("../src/lib/audit/audit.ts");
const { AUDIT_MODEL, AI_TIMEOUT_MS } = require("../src/lib/audit/audit-service.ts");
const { readAiResponse, requestAiAudit, requestAiRefinement } = require("../src/lib/ai-response.ts");
const { getAiEndpoint } = require("../src/lib/ai-config.ts");

// Kiểm tra request thật của route; phản hồi model giả lập, không đo chất lượng AI.
const profile = { title: "Quán kiểm thử", address: "Hội An, Đà Nẵng", description: null, price: null, similar_places: [{ title: "Quán bên cạnh", rating: null }], menu: { categories: [
  { title: "Món chính", items: [{ title: "Cao lầu", price: "65.000đ", description: "Mì, thịt và rau" }] },
  { title: "Đồ uống", items: [{ title: "Nước chanh", price: "30.000đ", description: "Chanh tươi" }] },
] } };
const oldReport = 'Địa chỉ "Hội An, Đà Nẵng" là sai lệch về mặt hành chính (Hội An thuộc tỉnh Quảng Nam).';
const newReport = "## Đánh giá về Text Menu\nCao lầu có tên, giá và mô tả.\n## Điểm cạnh tranh: 7.5/10";
const firstInstruction = "Dùng đơn vị hành chính mới";
const latestInstruction = "Hội an đã được gộp vào đà nẵng đồ ngu ạ";
const oldConfirmation = 'Đã cập nhật báo cáo theo yêu cầu: "Dùng đơn vị hành chính mới"';
const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
const originalEndpoint = process.env.NEXT_PUBLIC_AI_ANALYSIS_URL;
const streamed = text => {
  const midpoint = Math.ceil(text.length / 2);
  const event = (part, finishReason) => `data: ${JSON.stringify({ candidates: [{ ...(finishReason ? { finishReason } : {}), content: { parts: [{ text: part }] } }] })}\n\n`;
  return new Response(event(text.slice(0, midpoint)) + event(text.slice(midpoint), "STOP"), {
    headers: { "Content-Type": "text/event-stream" },
  });
};

(async () => {
  process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
  process.env.NEXT_PUBLIC_AI_ANALYSIS_URL = "https://legacy.example.test/functions/v1/ai-analysis";
  assert.equal(getAiEndpoint(), "/api/ai-analysis");
  for (const chat of [false, true]) {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), `https://generativelanguage.googleapis.com/v1beta/models/${AUDIT_MODEL}:streamGenerateContent?alt=sse`);
      calls++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body.systemInstruction, { parts: [{ text: AUDIT_SYSTEM_INSTRUCTION }] });
      assert.equal(body.contents.length, 1);
      const prompt = body.contents[0].parts[0].text;
      assert.ok(!prompt.includes(AUDIT_SYSTEM_INSTRUCTION));
      assert.ok(prompt.indexOf("<text_menu>") < prompt.indexOf("<ho_so>"));
      const menu = prompt.split("<text_menu>\n")[1].split("\n</text_menu>")[0];
      for (const line of ["Số món có tên: 2", "Số món có giá: 2", "Số món có mô tả: 2", "Nhóm món: Món chính", "Tên món: Cao lầu", "Giá: 65.000đ", "Mô tả: Mì, thịt và rau", "Nhóm món: Đồ uống", "Tên món: Nước chanh", "Giá: 30.000đ", "Mô tả: Chanh tươi"]) assert.ok(menu.includes(line));
      assert.ok(!/\b(?:null|undefined)\b|\[object Object\]/.test(prompt));
      assert.ok(prompt.includes("Giới thiệu của nhà hàng: Không đánh giá"));
      assert.equal(prompt.includes(oldReport), chat);
      assert.ok(!body.systemInstruction.parts[0].text.includes(oldReport));
      if (chat) {
        assert.ok(prompt.includes(`YÊU CẦU HIỆN TẠI:\n${latestInstruction}`));
        assert.ok(prompt.includes(`<yeu_cau_truoc>- ${firstInstruction}</yeu_cau_truoc>`));
        assert.ok(!prompt.includes(oldConfirmation));
        assert.ok(prompt.indexOf(latestInstruction) > prompt.indexOf(oldReport));
      }
      return streamed(chat ? `${CHAT_MARKER}\nĐã sửa.\n${REPORT_MARKER}\n${newReport}` : newReport);
    };
    const response = await POST(new Request("http://local.test/api/ai-analysis", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, ...(chat ? { currentAnalysis: oldReport, messages: [
        { role: "user", content: firstInstruction }, { role: "model", content: oldConfirmation }, { role: "user", content: latestInstruction },
      ] } : {}) }),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Audit-Prompt-Version"), AUDIT_PROMPT_VERSION);
    assert.match(response.headers.get("Content-Type"), /text\/event-stream/);
    const previews = [];
    const result = await readAiResponse(response, chat ? oldReport : undefined, text => previews.push(text));
    assert.equal(result.analysis, newReport);
    assert.equal(previews.length, 2);
    assert.equal(calls, 1);
    console.log(`PASS Next ${chat ? "chat SSE" : "initial SSE"}: system instruction, full menu payload, two deltas, updated report.`);
  }

  {
    delete globalThis.__diaBaKeyPools__;
    process.env.GOOGLE_AI_STUDIO_API_KEY = `test-stream-${process.pid}-${Date.now()}`;
    const encoder = new TextEncoder();
    const prefix = newReport.slice(0, 20);
    const event = (text, finishReason) => `data: ${JSON.stringify({ candidates: [{ ...(finishReason ? { finishReason } : {}), content: { parts: [{ text }] } }] })}\n\n`;
    let releaseProvider;
    let seenFirst;
    const firstVisible = new Promise(resolve => { seenFirst = resolve; });
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") return POST(new Request(String(url), options));
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(event(prefix)));
          releaseProvider = () => {
            controller.enqueue(encoder.encode(event(newReport.slice(20), "STOP")));
            controller.close();
          };
        },
      }), { headers: { "Content-Type": "text/event-stream" } });
    };
    let settled = false;
    let waitTimer;
    const audit = requestAiAudit("http://local.test/api/ai-analysis", { profile }, text => {
      if (text === prefix) seenFirst();
    }).finally(() => { settled = true; });
    try {
      await Promise.race([firstVisible, new Promise((_, reject) => { waitTimer = setTimeout(() => reject(new Error("First delta did not arrive")), 2_000); })]);
      assert.equal(settled, false);
      releaseProvider();
      assert.equal(await audit, newReport);
      console.log("PASS Progressive streaming: nội dung đầu hiển thị trước khi Gemini kết thúc.");
    } finally { clearTimeout(waitTimer); if (!settled) releaseProvider?.(); }
  }

  // Kiểm tra xoay key khi 429
  {
    delete globalThis.__diaBaKeyPools__;
    const [firstKey, secondKey] = [`test-key-1-${process.pid}-${Date.now()}`, `test-key-2-${process.pid}-${Date.now()}`];
    process.env.GOOGLE_AI_STUDIO_API_KEY = `${firstKey},${secondKey}`;
    const attempts = [];
    let appCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") {
        appCalls++;
        return POST(new Request(String(url), options));
      }
      const keyUsed = options.headers["x-goog-api-key"];
      attempts.push(keyUsed);
      if (keyUsed === firstKey) {
        return Response.json({ error: { message: "Quota exceeded" } }, { status: 429 });
      }
      return streamed(newReport);
    };

    const analysis = await requestAiAudit("http://local.test/api/ai-analysis", { profile });
    assert.equal(analysis, newReport);
    assert.deepEqual(attempts, [firstKey, secondKey]);
    assert.equal(appCalls, 2);
    console.log("PASS Key rotation: 429 chuyển sang key 2 qua request mới.");
  }

  // 503 vẫn thử key kế tiếp; key đầu không bị phạt.
  {
    delete globalThis.__diaBaKeyPools__;
    const firstKey = `test-busy-1-${process.pid}-${Date.now()}`;
    const secondKey = `test-busy-2-${process.pid}-${Date.now()}`;
    process.env.GOOGLE_AI_STUDIO_API_KEY = `${firstKey},${secondKey}`;
    const attempts = [];
    let appCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") {
        appCalls++;
        return POST(new Request(String(url), options));
      }
      const key = options.headers["x-goog-api-key"];
      attempts.push(key);
      return key === firstKey
        ? Response.json({ error: { message: "Unavailable" } }, { status: 503 })
        : streamed(newReport);
    };
    assert.equal(await requestAiAudit("http://local.test/api/ai-analysis", { profile }), newReport);
    assert.deepEqual(attempts, [firstKey, secondKey]);
    assert.equal(appCalls, 2);
    assert.equal(globalThis.__diaBaKeyPools__.get("gemini").snapshot().keys[0].penalties, 0);
    console.log("PASS Service unavailable: 503 chuyển sang key 2, key 1 không bị phạt.");
  }

  {
    delete globalThis.__diaBaKeyPools__;
    const keys = [`test-cut-1-${process.pid}-${Date.now()}`, `test-cut-2-${process.pid}-${Date.now()}`];
    process.env.GOOGLE_AI_STUDIO_API_KEY = keys.join(",");
    const previews = [];
    const attempts = [];
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") return POST(new Request(String(url), options));
      const key = options.headers["x-goog-api-key"];
      attempts.push(key);
      return key === keys[0]
        ? new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Bản dở" }] } }] })}\n\n`, { headers: { "Content-Type": "text/event-stream" } })
        : streamed(newReport);
    };
    assert.equal(await requestAiAudit("http://local.test/api/ai-analysis", { profile }, text => previews.push(text)), newReport);
    assert.deepEqual(attempts, keys);
    assert.ok(previews.includes("Bản dở"));
    assert.ok(previews.includes(""));
    assert.equal(previews.at(-1), newReport);
    console.log("PASS Interrupted stream: bỏ bản dở và nhận trọn báo cáo từ key tiếp theo.");
  }

  {
    delete globalThis.__diaBaKeyPools__;
    const keys = [`test-fail-1-${process.pid}-${Date.now()}`, `test-fail-2-${process.pid}-${Date.now()}`];
    process.env.GOOGLE_AI_STUDIO_API_KEY = keys.join(",");
    const attempts = [];
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") return POST(new Request(String(url), options));
      attempts.push(options.headers["x-goog-api-key"]);
      return Response.json({ error: { message: "Unavailable" } }, { status: 503 });
    };
    await assert.rejects(requestAiAudit("http://local.test/api/ai-analysis", { profile }), error => error.status === 503);
    assert.deepEqual(attempts, keys);
    console.log("PASS All keys failed: chỉ báo 503 sau khi đã thử cả hai key.");
  }

  {
    delete globalThis.__diaBaKeyPools__;
    const keys = [`test-chat-1-${process.pid}-${Date.now()}`, `test-chat-2-${process.pid}-${Date.now()}`];
    process.env.GOOGLE_AI_STUDIO_API_KEY = keys.join(",");
    const attempts = [];
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") return POST(new Request(String(url), options));
      const key = options.headers["x-goog-api-key"];
      attempts.push(key);
      return key === keys[0] ? Response.json({ error: { message: "Unavailable" } }, { status: 503 })
        : streamed(`${CHAT_MARKER}\nĐã sửa.\n${REPORT_MARKER}\n${newReport}`);
    };
    const result = await requestAiRefinement("http://local.test/api/ai-analysis", { profile, currentAnalysis: oldReport, messages: [{ role: "user", content: latestInstruction }] });
    assert.equal(result.analysis, newReport);
    assert.deepEqual(attempts, keys);
    console.log("PASS Chat: lỗi key đầu chuyển key thứ hai và nhận báo cáo mới.");
  }

  {
    delete globalThis.__diaBaKeyPools__;
    const keys = [`test-slow-1-${process.pid}-${Date.now()}`, `test-slow-2-${process.pid}-${Date.now()}`];
    process.env.GOOGLE_AI_STUDIO_API_KEY = keys.join(",");
    const originalTimeout = AbortSignal.timeout;
    const waits = [];
    const attempts = [];
    AbortSignal.timeout = ms => {
      waits.push(ms);
      return waits.length === 1 ? AbortSignal.abort() : originalTimeout(ms);
    };
    globalThis.fetch = async (url, options) => {
      if (String(url) === "http://local.test/api/ai-analysis") return POST(new Request(String(url), options));
      attempts.push(options.headers["x-goog-api-key"]);
      if (options.signal.aborted) throw new DOMException("Timed out", "AbortError");
      return streamed(newReport);
    };
    try {
      assert.equal(await requestAiAudit("http://local.test/api/ai-analysis", { profile }), newReport);
      assert.deepEqual(attempts, keys);
      assert.deepEqual(waits, [AI_TIMEOUT_MS, AI_TIMEOUT_MS]);
      console.log("PASS Timeout: mỗi key có thời gian chờ cấu hình, key kế tiếp được thử qua request mới.");
    } finally { AbortSignal.timeout = originalTimeout; }
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GOOGLE_AI_STUDIO_API_KEY;
  else process.env.GOOGLE_AI_STUDIO_API_KEY = originalKey;
  if (originalEndpoint === undefined) delete process.env.NEXT_PUBLIC_AI_ANALYSIS_URL;
  else process.env.NEXT_PUBLIC_AI_ANALYSIS_URL = originalEndpoint;
});
