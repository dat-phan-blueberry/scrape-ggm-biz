const assert = require("node:assert/strict");

(async () => {
  console.log("=== Bắt đầu kiểm thử Cơ chế Wake Call (5 phút cache & 5 lần retry) ===");

  const {
    ensureGatewayAwake,
    getLastHealthCheckTime,
    setLastHealthCheckTime,
    resetWakeState,
    WAKE_CACHE_TTL_MS,
  } = await import("../src/lib/ai-wake.ts");

  // 1. Kiểm thử bỏ qua healthcheck khi lần trước < 5 phút
  resetWakeState();
  setLastHealthCheckTime(Date.now() - (2 * 60 * 1000)); // Vừa gọi 2 phút trước

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ awake: true }), { status: 200 });
  };

  const statusMessages = [];
  const awakeFast = await ensureGatewayAwake((msg) => statusMessages.push(msg));
  assert.equal(awakeFast, true);
  assert.equal(fetchCalled, false, "Phải bỏ qua fetch khi lần trước < 5 phút");
  assert.equal(statusMessages.length, 0);
  console.log("PASS 1: Lần healthcheck trước < 5 phút -> Khỏi call healthcheck lại (trả về true ngay).");

  // 2. Kiểm thử khi lần trước > 5 phút (hoặc chưa bao giờ gọi) -> Gọi healthcheck
  resetWakeState();
  let fetchAttempts = 0;
  globalThis.fetch = async (url) => {
    fetchAttempts++;
    assert.equal(url, "/api/ai-wake");
    return new Response(JSON.stringify({ awake: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const statusList = [];
  const awakeAfterCheck = await ensureGatewayAwake((msg) => statusList.push(msg));
  assert.equal(awakeAfterCheck, true);
  assert.equal(fetchAttempts, 1);
  assert.equal(statusList[0], "Đang đánh thức dịch vụ...");
  assert.ok(getLastHealthCheckTime() > 0);
  console.log("PASS 2: Khi quá 5 phút -> Gọi healthcheck với thông báo 'Đang đánh thức dịch vụ...'.");

  // 3. Kiểm thử Retry tối đa 5 lần khi Koyeb đang boot
  resetWakeState();
  let failCount = 0;
  globalThis.fetch = async () => {
    failCount++;
    if (failCount < 3) {
      // 2 lần đầu lỗi (koyeb đang boot)
      return new Response(JSON.stringify({ awake: false }), { status: 504 });
    }
    // Lần 3 thức dậy thành công
    return new Response(JSON.stringify({ awake: true }), { status: 200 });
  };

  const retryStatusList = [];
  const awakeRetry = await ensureGatewayAwake((msg) => retryStatusList.push(msg));
  assert.equal(awakeRetry, true);
  assert.equal(failCount, 3);
  assert.equal(retryStatusList[0], "Đang đánh thức dịch vụ...");
  assert.equal(retryStatusList[1], "Đang đánh thức dịch vụ (lần thử 2/5)...");
  assert.equal(retryStatusList[2], "Đang đánh thức dịch vụ (lần thử 3/5)...");
  console.log("PASS 3: Tự động retry tối đa 5 lần khi container đang thức dậy.");

  // 4. Kiểm thử thất bại hoàn toàn sau 5 lần
  resetWakeState();
  let alwaysFailCount = 0;
  globalThis.fetch = async () => {
    alwaysFailCount++;
    return new Response(JSON.stringify({ awake: false }), { status: 504 });
  };

  const allFailStatusList = [];
  const awakeFailed = await ensureGatewayAwake((msg) => allFailStatusList.push(msg));
  assert.equal(awakeFailed, false);
  assert.equal(alwaysFailCount, 5);
  console.log("PASS 4: Trả về false sau 5 lần thử thất bại.");

  // 5. Kiểm thử thực tế route /api/ai-wake với Koyeb thật
  process.env.AI_GATEWAY_URL = "https://narrow-brunhilde-godine-5e2d343e.koyeb.app";
  globalThis.fetch = originalFetch; // Trả lại fetch thật của hệ thống
  const { GET } = await import("../src/app/api/ai-wake/route.ts");
  const liveWakeRes = await GET();
  assert.equal(liveWakeRes.status, 200);
  const liveData = await liveWakeRes.json();
  assert.equal(liveData.awake, true);
  console.log("PASS 5: Live check /api/ai-wake tới Koyeb Gateway thành công:", liveData);

  console.log("\n=== TẤT CẢ KIỂM THỬ WAKE CALL ĐỀU PASS! ===");
  process.exit(0);
})();
