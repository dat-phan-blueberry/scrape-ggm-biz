// Proxy loopback cho E2E: mọi tìm kiếm, hồ sơ và báo cáo đều gọi API ứng dụng thật.
require('./register.cjs');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'));
const { getAuthUsers } = require('../src/lib/auth.ts');
const { readAiResponse, completedReportError, completedRefinementError } = require('../src/lib/ai-response.ts');
const base = 'http://127.0.0.1:3107';
const dir = path.join(__dirname, 'results');
const file = path.join(dir, 'live-browser-events.json');
const events = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const cohort = JSON.parse(fs.readFileSync(path.join(dir, 'venues.json'), 'utf8')).filter(v => v.profile.types.some(t => /nhà hàng|quán bia|nhà máy bia/i.test(t)));
let nextAuditAt = 0;
(async () => {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getAuthUsers()[0]) });
  if (!login.ok) throw new Error(`Local login HTTP ${login.status}`);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  http.createServer(async (req, res) => {
    const target = new URL(req.url, base);
    if (target.origin !== base) { res.writeHead(400); return res.end(); }
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      if (target.pathname === '/api/auth/me') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ user: { email: 'QA · API thật' } }));
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const audit = target.pathname === '/api/ai-analysis';
      const input = audit ? JSON.parse(body) : null;
      const edge = audit && input.messages?.length && cohort.findIndex(v => v.dataId === input.profile.data_id) % 2 === 1;
      if (audit) {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, nextAuditAt - Date.now())));
        if (res.destroyed) return;
      }
      const upstream = await fetch(edge ? new URL('/ai-analysis', 'http://127.0.0.1:3111') : target, { method: req.method, body, headers: { ...(edge ? {} : { Cookie: cookie }), ...(body ? { 'Content-Type': 'application/json' } : {}) }, signal: abort.signal, redirect: 'manual' });
      res.statusCode = upstream.status;
      for (const key of ['content-type', 'cache-control', 'location']) if (upstream.headers.has(key)) res.setHeader(key, upstream.headers.get(key));
      const responseChunks = [];
      if (upstream.body) for await (const chunk of upstream.body) { responseChunks.push(chunk); res.write(chunk); }
      const bytes = Buffer.concat(responseChunks);
      if (target.pathname === '/api/business-profile' && upstream.ok) {
        const profile = JSON.parse(bytes).profile;
        const profileFile = path.join(dir, 'live-browser-profiles.json');
        const profiles = fs.existsSync(profileFile) ? JSON.parse(fs.readFileSync(profileFile, 'utf8')) : {};
        profiles[profile.data_id] = profile;
        fs.writeFileSync(profileFile, JSON.stringify(profiles, null, 2));
      }
      if (audit) {
        nextAuditAt = Date.now() + 30000;
        const event = { date: new Date().toISOString(), venue: input.profile.title, dataId: input.profile.data_id, source: 'live-api', runtime: edge ? 'deno-edge' : 'next', chat: !!input.messages?.length, status: upstream.status, contentType: upstream.headers.get('content-type') };
        try {
          const result = await readAiResponse(new Response(bytes, { status: upstream.status, headers: upstream.headers }), input.currentAnalysis);
          event.error = completedReportError(result.analysis, input) || (event.chat ? completedRefinementError(result, input) : null);
          event.analysis = result.analysis;
          event.previous = input.currentAnalysis;
          event.reply = result.reply;
          event.updated = event.chat && result.analysis !== input.currentAnalysis;
        } catch (error) {
          event.error = error.message;
          if (Number.isFinite(error.retryAfterSeconds)) nextAuditAt = Math.max(nextAuditAt, Date.now() + (error.retryAfterSeconds + 1) * 1000);
        }
        events.push(event);
        fs.writeFileSync(file, JSON.stringify(events, null, 2));
        console.log(JSON.stringify({ venue: event.venue, runtime: event.runtime, chat: event.chat, status: event.status, valid: !event.error, updated: event.updated }));
      }
      res.end();
    } catch (error) {
      if (!res.destroyed) { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Yêu cầu QA chưa hoàn tất.' })); }
    }
  }).listen(3110, '127.0.0.1', () => console.log('Live browser E2E: http://127.0.0.1:3110'));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
