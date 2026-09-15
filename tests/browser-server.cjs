// Máy chủ QA chỉ nghe loopback. Phát lại dữ liệu/response đã thu từ API thật.
require("./register.cjs");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."));
const { getAuthUsers } = require("../src/lib/auth.ts");
const { completedReportError } = require("../src/lib/ai-response.ts");
const fixtureReport = require("./fixture-report.cjs");
const base = "http://127.0.0.1:3107";
const dir = path.join(__dirname, "results");
const venues = JSON.parse(fs.readFileSync(path.join(dir, "venues.json"), "utf8")).filter(v => v.profile.types.some(t => /nhà hàng|quán bia|nhà máy bia/i.test(t)));
const eventFile = path.join(dir, "browser-requests.json");
const events = fs.existsSync(eventFile) ? JSON.parse(fs.readFileSync(eventFile, "utf8")) : [];
const log = e => { events.push(e); fs.writeFileSync(path.join(dir, "browser-requests.json"), JSON.stringify(events, null, 2)); };
(async () => {
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getAuthUsers()[0]) });
  if (!login.ok) throw new Error(`Local login HTTP ${login.status}`);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:3109");
    const json = data => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
    try {
      if (url.pathname === "/api/auth/me") return json({ user: { email: "QA · dữ liệu phát lại" } });
      if (url.pathname === "/api/autocomplete") return json({ suggestions: venues.map(v => ({ value: v.name, subtext: v.profile.address, type: "place", latitude: v.profile.gps?.latitude, longitude: v.profile.gps?.longitude, data_id: v.dataId })) });
      if (url.pathname === "/api/business-profile") {
        const venue = venues.find(v => v.dataId === url.searchParams.get("data_id"));
        return json({ profile: venue.profile, raw: {} });
      }
      if (url.pathname === "/api/ai-analysis") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks));
        const index = venues.findIndex(v => v.dataId === body.profile.data_id);
        const file = path.join(dir, `${index + 1}-case.json`);
        const recorded = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
        const usable = recorded && !completedReportError(recorded.initial, { profile: body.profile }) && !completedReportError(recorded.refined, { profile: body.profile });
        const initial = fixtureReport(body.profile);
        const c = usable ? recorded : { initial, refined: initial.replace("Dùng điện thoại để", "Mỗi thứ Hai, dùng điện thoại để"), reply: "Đã bổ sung lịch kiểm tra mỗi thứ Hai." };
        const chat = !!body.messages?.length;
        const last = body.messages?.at(-1)?.content || "";
        const mode = index % 4;
        log({ venue: venues[index].name, source: usable ? "live-recording" : "contract-fixture", chat, mode, previousMatches: !chat || body.currentAnalysis === c.initial || body.currentAnalysis === c.refined });
        const fail = /kiểm thử lỗi/i.test(last);
        const answer = /giải thích điểm/i.test(last);
        const analysis = answer ? body.currentAnalysis : chat ? c.refined : c.initial;
        if (chat && mode === 0 && !fail) return json({ reply: answer ? "Điểm phản ánh thông tin đã thu thập. Báo cáo giữ nguyên." : c.reply || "Đã cập nhật báo cáo.", updatedAnalysis: answer ? null : analysis, analysis });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        res.write(": ping\n\n");
        const reply = answer ? "Điểm phản ánh thông tin đã thu thập. Báo cáo giữ nguyên." : c.reply || "Đã cập nhật báo cáo.";
        const text = chat && mode === 1 ? `=== PHẢN HỒI CHAT ===\n${reply}\n=== BẢN BÁO CÁO CẬP NHẬT ===\n${answer ? "GIỮ NGUYÊN" : analysis}` : analysis;
        const wire = chat && mode === 3
          ? `data: ${JSON.stringify({ analysis: body.currentAnalysis, updatedAnalysis: analysis, reply })}\n\n`
          : [text.slice(0, 170), text.slice(170)].map(text => `data: ${JSON.stringify({ text })}\n\n`).join("");
        const bytes = Buffer.from(wire);
        res.write(bytes.subarray(0, 171));
        setTimeout(() => {
          if (res.destroyed) return;
          res.write(bytes.subarray(171));
          setTimeout(() => { if (!res.destroyed) res.end(fail ? 'data: {"error":"Lỗi dịch vụ thử nghiệm"}\n\ndata: [DONE]' : "data: [DONE]"); }, /kiểm thử chậm/i.test(last) ? 6000 : 1000);
        }, 700);
        return;
      }
      const upstream = await fetch(`${base}${req.url}`, { headers: { Cookie: cookie }, redirect: "manual" });
      res.statusCode = upstream.status;
      for (const key of ["content-type", "cache-control", "location"]) if (upstream.headers.has(key)) res.setHeader(key, upstream.headers.get(key));
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { res.statusCode = 500; json({ error: "Máy chủ QA chưa hoàn tất yêu cầu." }); }
  }).listen(3109, "127.0.0.1", () => console.log("Browser QA: http://127.0.0.1:3109 · chỉ dữ liệu phát lại"));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
