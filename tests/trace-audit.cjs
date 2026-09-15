// Ghi đầu ra công khai của model để đối chiếu lỗi nội dung; không ghi headers/khóa/phần suy luận.
require('./register.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const { getAiApiKey } = require('../src/lib/ai-config.ts');
const { generateAudit, quotaPeriod } = require('../supabase/functions/_shared/audit-service.ts');
const venues = JSON.parse(fs.readFileSync('tests/results/venues.json', 'utf8')).filter(v => v.profile.types.some(t => /nhà hàng|quán bia|nhà máy bia/i.test(t)));
const index = Number(process.argv[2]);
if (!Number.isInteger(index) || !venues[index]) throw new Error('Cần chỉ số nhà hàng trong cohort, từ 0 đến 10.');
const profiles = JSON.parse(fs.readFileSync('tests/results/live-browser-profiles.json', 'utf8'));
const input = { profile: profiles[venues[index].dataId] || venues[index].profile };
if (process.argv.includes('--chat')) {
  const events = JSON.parse(fs.readFileSync('tests/results/live-browser-events.json', 'utf8'));
  input.currentAnalysis = events.filter(e => e.dataId === venues[index].dataId && !e.error && !e.chat).at(-1)?.analysis;
  input.messages = [{ role: 'user', content: 'Sửa báo cáo: giữ đầy đủ các mục, viết giọng tư vấn trực tiếp và thêm vào khuyến nghị hành động việc chủ quán kiểm tra lại thực đơn trên điện thoại mỗi thứ Hai. Không tự tăng điểm, không kết luận lỗi địa chỉ hay thiếu menu khi chưa xác minh.' }];
}
const trace = [];
const original = global.fetch;
global.fetch = async (url, options) => {
  const response = await original(url, options);
  const request = JSON.parse(options.body);
  const data = await response.clone().json().catch(() => null);
  const candidate = data?.candidates?.[0];
  trace.push({ stage: request.generationConfig.responseSchema.properties.issues ? 'review' : 'draft', model: new URL(url).pathname.split('/').at(-1).split(':')[0], status: response.status, period: response.status === 429 ? quotaPeriod(data) : undefined, finishReason: candidate?.finishReason, output: candidate?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('\n') });
  fs.writeFileSync(`tests/results/trace-${index}.json`, JSON.stringify(trace, null, 2));
  return response;
};
(async () => {
  try { await generateAudit(getAiApiKey(), input); console.log('Báo cáo đã qua kiểm tra.'); }
  catch (error) { console.log(error.message); process.exitCode = 1; }
  console.log(JSON.stringify(trace.map(({ output, ...metadata }) => metadata)));
})().finally(() => { global.fetch = original; });
