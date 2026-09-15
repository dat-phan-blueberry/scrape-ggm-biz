require('./register.cjs');
const fs = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MarkdownLite } = require('../src/components/ui.tsx');
const { completedReportError, completedRefinementError } = require('../src/lib/ai-response.ts');
const { parseAndValidateScore } = require('../supabase/functions/_shared/audit.ts');
const { buildAuditReportHtml } = require('../src/lib/report-html.ts');
const read = (name, fallback) => fs.existsSync(`tests/results/${name}`) ? JSON.parse(fs.readFileSync(`tests/results/${name}`, 'utf8')) : fallback;
const cohort = read('venues.json', []).filter(v => v.profile.types.some(t => /nhà hàng|quán bia|nhà máy bia/i.test(t)));
const events = read('live-browser-events.json', []);
const profiles = read('live-browser-profiles.json', {});
const ui = read('live-ui-results.json', []);
function textHash(s) {
  let h = 2166136261;
  for (const c of s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16);
}
function renderedHash(analysis) {
  const text = renderToStaticMarkup(React.createElement(MarkdownLite, { text: analysis })).replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return textHash(text);
}
// User narrowed live acceptance to three existing reports; keep cohort mode for historical inspection.
const representatives = require('./representative-venues.cjs');
const representativeMode = process.argv.includes('--representatives');
const allResults = cohort.map((venue, index) => {
  const all = events.filter(e => e.dataId === venue.dataId && e.source === 'live-api' && !e.error);
  const refined = all.filter(e => e.chat && e.updated && /thứ hai/i.test(e.analysis)).at(-1);
  const initial = refined && all.find(e => e.analysis === refined.previous);
  const shown = ui.find(e => e.name === venue.name || e.name === venue.profile.title);
  const profile = profiles[venue.dataId];
  const input = profile && initial ? { profile, currentAnalysis: initial.analysis, messages: [{ role: 'user', content: 'Sửa báo cáo, thêm lịch kiểm tra mỗi thứ Hai. Không tự tăng điểm.' }] } : null;
  const checks = {
    liveProfile: !!profile,
    initial: !!initial && !!input && !completedReportError(initial.analysis, input),
    refined: !!refined && !!input && !completedRefinementError({ analysis: refined.analysis, reply: refined.reply }, input),
    noScoreIncrease: !!refined && !!initial && Number(parseAndValidateScore(refined.analysis)) <= Number(parseAndValidateScore(initial.analysis)),
    transport: !!refined && (index % 2 ? refined.runtime === 'deno-edge' && refined.contentType?.includes('text/event-stream') : (refined.runtime || 'next') === 'next' && refined.contentType?.includes('application/json')),
    uiExactReport: !!refined && !!shown && renderedHash(refined.analysis) === shown.hash,
    uiChanged: !!shown?.changed,
    uiMenu: !!shown?.menu,
    uiMonday: !!shown?.monday,
    restored: !!shown?.restored,
    score: !!shown && !!refined && Number(shown.score?.replace(',', '.')) === Number(parseAndValidateScore(refined.analysis)),
    printHtml: !!refined && /thứ hai/i.test(buildAuditReportHtml({ restaurant: venue.profile.title, analysis: refined.analysis, logoUrl: 'http://127.0.0.1:3107/logo.png' })),
  };
  return { name: venue.name, dataId: venue.dataId, checks, passed: Object.values(checks).every(Boolean) };
});
const results = representativeMode ? allResults.filter(r => representatives.has(r.name)) : allResults;
const summary = {
  date: new Date().toISOString(),
  scope: representativeMode ? '3 existing live reports, per user scope correction; no new model calls' : 'original restaurant cohort',
  total: results.length, passed: results.filter(r => r.passed).length, results,
  outsideAcceptance: representativeMode ? allResults.filter(r => !representatives.has(r.name)) : [],
};
fs.writeFileSync('tests/results/accepted-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ total: summary.total, passed: summary.passed, pending: results.filter(r => !r.passed).map(r => ({ name: r.name, checks: Object.keys(r.checks).filter(k => !r.checks[k]) })) }, null, 2));
const expected = representativeMode ? representatives.size : 11;
if (!process.argv.includes('--partial') && (results.length !== expected || summary.passed !== expected)) process.exitCode = 1;
