const assert = require("node:assert/strict");

(async () => {
  console.log("=== Bắt đầu kiểm thử Fastify AI Gateway ===");

  // 1. Kiểm thử GeminiKeyPool (không cần service name, dùng như cũ: key1,key2,...)
  const { GeminiKeyPool } = await import("../ai-gateway/key-manager.js");
  const pool = new GeminiKeyPool("gemini_key_1,gemini_key_2,gemini_key_3");
  assert.equal(pool.size, 3);
  const status = pool.getStatus();
  assert.equal(status.total, 3);
  assert.equal(status.ready, 3);

  const k1 = pool.acquireKey();
  assert.equal(k1.key, "gemini_key_1");
  // Khi slot 0 đã thử trong request (excludedSlots), tự động chuyển sang key 2
  const k2 = pool.acquireKey(new Set([0]));
  assert.equal(k2.key, "gemini_key_2");

  // Kiểm tra phạt cooldown
  pool.penalizeKey("gemini_key_1", "rate", 10_000);
  const kAfterPenalize = pool.acquireKey();
  assert.equal(kAfterPenalize.key, "gemini_key_2");
  console.log("PASS 1: GeminiKeyPool phân tích danh sách key Gemini chung, round-robin và phạt key chính xác.");

  // 2. Kiểm thử parseGatewayKeys hỗ trợ nhiều service (<service>:<key>) & Anti-Bruteforce
  const { parseGatewayKeys, BruteforceGuard, timingSafeEqualString } = await import("../ai-gateway/security.js");
  const gwKeys = parseGatewayKeys("dia-ba:key_diaba_secret,godine-chat:key_chat_secret,key_default_generic");
  assert.equal(gwKeys.length, 3);
  assert.equal(gwKeys[0].service, "dia-ba");
  assert.equal(gwKeys[0].key, "key_diaba_secret");
  assert.equal(gwKeys[1].service, "godine-chat");
  assert.equal(gwKeys[1].key, "key_chat_secret");
  assert.equal(gwKeys[2].service, "default");
  assert.equal(gwKeys[2].key, "key_default_generic");

  assert.equal(timingSafeEqualString("secret-key", "secret-key"), true);
  assert.equal(timingSafeEqualString("secret-key", "wrong-key"), false);

  const guard = new BruteforceGuard({ maxFailedAttempts: 3, windowMs: 1000, lockoutMs: 5000 });
  const testIp = "192.168.1.100";
  assert.equal(guard.isLocked(testIp).locked, false);
  assert.equal(guard.recordFailure(testIp), false); // Lần 1
  assert.equal(guard.recordFailure(testIp), false); // Lần 2
  assert.equal(guard.recordFailure(testIp), true);  // Lần 3 -> Bị khóa!
  assert.equal(guard.isLocked(testIp).locked, true);
  console.log("PASS 2: GATEWAY_API_KEYS hỗ trợ nhiều service và BruteforceGuard hoạt động chính xác.");

  // 3. Khởi chạy Fastify Gateway trên cổng thử nghiệm 4099
  process.env.PORT = "4099";
  process.env.GATEWAY_API_KEYS = "dia-ba:diaba_sec_123,godine-chat:chat_sec_456";
  process.env.GEMINI_AI_STUDIO_API_KEYS = "mock_gemini_key_1,mock_gemini_key_2";

  // Mock global fetch để không phụ thuộc vào network ngoài
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      assert.equal(options.headers["x-goog-api-key"], "mock_gemini_key_1");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Phản hồi thử nghiệm từ AI Gateway" }] } }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return originalFetch(url, options);
  };

  await import("../ai-gateway/server.js");
  await new Promise(resolve => setTimeout(resolve, 500)); // Đợi server listen

  // A. Health check (không cần key)
  const healthRes = await fetch("http://localhost:4099/health");
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, "ok");
  assert.equal(healthData.gatewayServices.length, 2);
  assert.equal(healthData.gatewayServices[0].service, "dia-ba");
  assert.equal(healthData.gatewayServices[1].service, "godine-chat");
  assert.equal(healthData.geminiPool.total, 2);
  console.log("PASS 3: GET /health hiển thị đúng danh sách services và gemini key pool.");

  // B. Chặn request không có key hoặc sai key
  const unauthRes = await fetch("http://localhost:4099/v1/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Hello" })
  });
  assert.equal(unauthRes.status, 401);
  console.log("PASS 4: Chặn request thiếu API Key với mã 401.");

  // C. Gọi với key của service 'dia-ba'
  const diabaRes = await fetch("http://localhost:4099/v1/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "diaba_sec_123"
    },
    body: JSON.stringify({ prompt: "Hello Địa Bạ" })
  });
  assert.equal(diabaRes.status, 200);
  assert.equal(diabaRes.headers.get("x-served-service"), "dia-ba");
  const aiData = await diabaRes.json();
  assert.equal(aiData.candidates[0].content.parts[0].text, "Phản hồi thử nghiệm từ AI Gateway");
  console.log("PASS 5: Nhận diện đúng service 'dia-ba' từ GATEWAY_API_KEYS.");

  // D. Kiểm tra Key Failover khi Gemini key 1 lỗi 429 -> tự động chuyển sang Gemini key 2
  let callIndex = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      callIndex++;
      if (callIndex === 1) {
        assert.equal(options.headers["x-goog-api-key"], "mock_gemini_key_1");
        // Giả lập 429 Rate Limit cho key 1
        return new Response(JSON.stringify({ error: { code: 429, message: "Resource exhausted" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }
      // Lần 2 tự động chuyển sang key 2
      assert.equal(options.headers["x-goog-api-key"], "mock_gemini_key_2");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Phản hồi thành công từ Key 2 sau failover" }] } }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return originalFetch(url, options);
  };

  const failoverRes = await fetch("http://localhost:4099/v1/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "chat_sec_456"
    },
    body: JSON.stringify({ prompt: "Test failover" })
  });
  assert.equal(failoverRes.status, 200);
  assert.equal(failoverRes.headers.get("x-served-service"), "godine-chat");
  const failoverData = await failoverRes.json();
  assert.equal(failoverData.candidates[0].content.parts[0].text, "Phản hồi thành công từ Key 2 sau failover");
  console.log("PASS 6: Tự động luân chuyển Gemini Key trong suốt khi gặp lỗi 429.");

  console.log("\n=== TẤT CẢ TEST AI GATEWAY ĐỀU PASS! ===");
  process.exit(0);
})();
