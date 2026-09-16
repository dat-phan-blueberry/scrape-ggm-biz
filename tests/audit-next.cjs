const assert = require("node:assert/strict");
require("./register.cjs");
const { POST } = require("../src/app/api/ai-analysis/route.ts");
const { AUDIT_PROMPT_VERSION, AUDIT_SYSTEM_INSTRUCTION, CHAT_MARKER, REPORT_MARKER } = require("../supabase/functions/_shared/audit.ts");
const { readAiResponse } = require("../src/lib/ai-response.ts");
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

(async () => {
  process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
  process.env.NEXT_PUBLIC_AI_ANALYSIS_URL = "https://legacy.example.test/functions/v1/ai-analysis";
  assert.equal(getAiEndpoint(), "/api/ai-analysis");
  for (const chat of [false, true]) {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      assert.ok(String(url).startsWith("https://generativelanguage.googleapis.com/"));
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
      assert.ok(prompt.includes("Giới thiệu của nhà hàng: Chưa ghi nhận"));
      assert.equal(prompt.includes(oldReport), chat);
      assert.ok(!body.systemInstruction.parts[0].text.includes(oldReport));
      if (chat) {
        assert.ok(prompt.includes(`YÊU CẦU HIỆN TẠI:\n${latestInstruction}`));
        assert.ok(prompt.includes(`<yeu_cau_truoc>- ${firstInstruction}</yeu_cau_truoc>`));
        assert.ok(!prompt.includes(oldConfirmation));
        assert.ok(prompt.indexOf(latestInstruction) > prompt.indexOf(oldReport));
      }
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{
        text: chat ? `${CHAT_MARKER}\nĐã sửa.\n${REPORT_MARKER}\n${newReport}` : newReport,
      }] } }] });
    };
    const response = await POST(new Request("http://local.test/api/ai-analysis", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, ...(chat ? { currentAnalysis: oldReport, messages: [
        { role: "user", content: firstInstruction }, { role: "model", content: oldConfirmation }, { role: "user", content: latestInstruction },
      ] } : {}) }),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Audit-Prompt-Version"), AUDIT_PROMPT_VERSION);
    const result = await readAiResponse(response, chat ? oldReport : undefined);
    assert.equal(result.analysis, newReport);
    assert.equal(calls, 1);
    console.log(`PASS Next ${chat ? "chat JSON" : "initial SSE"}: system instruction, full menu payload, prompt version, one provider call, updated report.`);
  }

  // Kiểm tra xoay key khi 429
  {
    delete globalThis.__diaBaKeyPools__;
    process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key-1,test-key-2";
    const attempts = [];
    globalThis.fetch = async (url, options) => {
      const keyUsed = options.headers["x-goog-api-key"];
      attempts.push(keyUsed);
      if (keyUsed === "test-key-1") {
        return Response.json({ error: { message: "Quota exceeded" } }, { status: 429 });
      }
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: newReport }] } }] });
    };

    const response = await POST(new Request("http://local.test/api/ai-analysis", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    }));
    assert.equal(response.status, 200);
    const result = await readAiResponse(response);
    assert.equal(result.analysis, newReport);
    assert.deepEqual(attempts, ["test-key-1", "test-key-2"]);
    console.log("PASS Key rotation: key 1 bị 429 tự động chuyển sang key 2 thành công.");
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GOOGLE_AI_STUDIO_API_KEY;
  else process.env.GOOGLE_AI_STUDIO_API_KEY = originalKey;
  if (originalEndpoint === undefined) delete process.env.NEXT_PUBLIC_AI_ANALYSIS_URL;
  else process.env.NEXT_PUBLIC_AI_ANALYSIS_URL = originalEndpoint;
});
