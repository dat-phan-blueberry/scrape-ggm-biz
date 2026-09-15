// Chỉ chạy thủ công khi được phép gọi nguồn dữ liệu và Gemini thật.
if (!process.argv.includes('--discover') && !process.argv.includes('--live')) {
  console.log('Không gọi API. Kiểm tra dữ liệu đã lưu: node tests/verify-live-results.cjs --representatives. --live chỉ chạy 3 mẫu đại diện khi được phép.');
  process.exit(0);
}
require("./register.cjs");
const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."));
const { getAuthUsers } = require("../src/lib/auth.ts");
const { readAiResponse, completedReportError, completedRefinementError } = require("../src/lib/ai-response.ts");
const { buildAuditReportHtml } = require("../src/lib/report-html.ts");
const { AUDIT_VERSION } = require("../supabase/functions/_shared/audit.ts");
const base = "http://127.0.0.1:3107";
const dir = path.join(__dirname, "results");
fs.mkdirSync(dir, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
const queries = ["bò leo thang", "phở thìn", "cục gạch quán", "East West Brewing", "An Bang Beach"];

(async () => {
  const user = getAuthUsers()[0];
  const auth = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(user) });
  if (!auth.ok) throw new Error(`Local login HTTP ${auth.status}`);
  const cookie = auth.headers.get("set-cookie").split(";")[0];
  const request = (url, body) => fetch(`${base}${url}`, { headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(125000) });
  let venues;
  if (process.argv.includes("--discover")) {
    const found = new Map();
    const search = [];
    for (const query of queries) {
      const response = await request(`/api/autocomplete?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      search.push({ query, status: response.status, count: data.suggestions?.length || 0, error: data.error });
      for (const s of data.suggestions || []) if (s.data_id) found.set(s.data_id, s);
      console.log(JSON.stringify(search.at(-1)));
    }
    venues = [];
    for (const s of found.values()) {
      const response = await request(`/api/business-profile?data_id=${encodeURIComponent(s.data_id)}&lat=${s.latitude || 0}&lng=${s.longitude || 0}`);
      const data = await response.json();
      const entry = { name: s.value, dataId: s.data_id, status: response.status, profile: data.profile, error: data.error };
      venues.push(entry);
      write("venues.json", venues);
      console.log(JSON.stringify({ name: entry.name, status: entry.status, textItems: entry.profile?.menu?.categories?.reduce((n, c) => n + c.items.length, 0) || 0, menuImages: entry.profile?.menu?.images?.length || 0 }));
    }
    write("discovery.json", { date: new Date().toISOString(), queries: search, total: venues.length });
    return;
  }
  venues = JSON.parse(fs.readFileSync(path.join(dir, "venues.json"), "utf8"));
  const summaryPath = path.join(dir, "live-summary.json");
  if (fs.existsSync(summaryPath)) fs.copyFileSync(summaryPath, path.join(dir, `live-summary-${Date.now()}.json`));
  const excluded = venues.filter(v => v.profile && !v.profile.types.some(t => /nhà hàng|quán bia|nhà máy bia/i.test(t)));
  write("excluded.json", excluded.map(v => ({ name: v.name, types: v.profile.types, reason: "Không phải nhà hàng/quán ăn trong phạm vi kiểm thử" })));
  const representatives = require('./representative-venues.cjs');
  venues = venues.filter(v => !excluded.includes(v) && representatives.has(v.name));
  if (venues.length !== representatives.size) throw new Error('Thiếu hồ sơ đại diện; không tự mở rộng sang nhà hàng khác.');
  const results = [];
  let nextCallAt = 0;
  const callAudit = async (input, currentAnalysis) => {
    // Server đã có retry giới hạn; runner không nhân thêm số lần gọi.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextCallAt - Date.now())));
    const response = await readAiResponse(await request("/api/ai-analysis", input), currentAnalysis);
    nextCallAt = Date.now() + 30000;
    return response;
  };
  for (const [index, venue] of venues.entries()) {
    const result = { name: venue.name, dataId: venue.dataId, profileStatus: venue.status, checks: {}, failures: [], auditVersion: AUDIT_VERSION };
    const started = Date.now();
    try {
      if (!venue.profile) throw new Error("Chưa lấy được hồ sơ thật");
      const progressFile = path.join(dir, `${index + 1}-live-progress.json`);
      const saved = process.argv.includes("--resume") && fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, "utf8")) : null;
      const initial = saved?.auditVersion === AUDIT_VERSION && saved.dataId === venue.dataId && !completedReportError(saved.initial?.analysis || "", { profile: venue.profile })
        ? saved.initial : await callAudit({ profile: venue.profile });
      const invalid = completedReportError(initial.analysis, { profile: venue.profile });
      if (invalid) throw new Error(invalid);
      result.checks.initial = true;
      fs.writeFileSync(path.join(dir, `${index + 1}-initial.md`), initial.analysis);
      write(`${index + 1}-live-progress.json`, { auditVersion: AUDIT_VERSION, dataId: venue.dataId, initial });
      const instruction = "Sửa báo cáo: giữ đầy đủ các mục, viết giọng tư vấn trực tiếp và thêm vào khuyến nghị hành động việc chủ quán kiểm tra lại thực đơn trên điện thoại mỗi thứ Hai. Không tự tăng điểm, không kết luận lỗi địa chỉ hay thiếu menu khi chưa xác minh.";
      const input = { profile: venue.profile, currentAnalysis: initial.analysis, messages: [{ role: "user", content: instruction }] };
      const refined = saved?.auditVersion === AUDIT_VERSION && saved.initial?.analysis === initial.analysis && saved.refined && !completedRefinementError(saved.refined, input)
        ? saved.refined : await callAudit(input, initial.analysis);
      const refineError = completedReportError(refined.analysis, input) || completedRefinementError(refined, input);
      if (refineError) throw new Error(refineError);
      if (refined.analysis === initial.analysis || !/thứ [hH]ai/.test(refined.analysis)) throw new Error("Chat chưa áp dụng thay đổi vào báo cáo");
      result.checks.refine = true;
      write(`${index + 1}-live-progress.json`, { auditVersion: AUDIT_VERSION, dataId: venue.dataId, initial, refined });
      fs.writeFileSync(path.join(dir, `${index + 1}-refined.md`), refined.analysis);
      const html = buildAuditReportHtml({ restaurant: venue.profile.title, analysis: refined.analysis, logoUrl: `${base}/logo.png` });
      if (!html.includes("thứ Hai") && !html.includes("thứ hai")) throw new Error("PDF chưa dùng bản sửa");
      result.checks.printHtml = true;
      // Dữ liệu cho browser QA, không chứa key hay phiên đăng nhập.
      write(`${index + 1}-case.json`, { auditVersion: AUDIT_VERSION, date: new Date().toISOString(), profile: venue.profile, initial: initial.analysis, refined: refined.analysis, reply: refined.reply, instruction });
    } catch (error) { result.failures.push(error.message); }
    result.elapsedMs = Date.now() - started;
    results.push(result);
    write("live-summary.json", { date: new Date().toISOString(), auditVersion: AUDIT_VERSION, total: venues.length, finished: results.length, results });
    console.log(JSON.stringify(result));
    if (result.failures.length) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (results.some(r => r.failures.length)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
