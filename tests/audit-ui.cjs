const assert = require("node:assert/strict");
require("./register.cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { AiAuditSection, MenuSection } = require("../src/components/sections.tsx");
const render = (state, props = {}) => renderToStaticMarkup(React.createElement(AiAuditSection, {
  state, restaurant: "Quán thử nghiệm", onRun() {}, ...props,
}));
const failed = render({ status: "error", message: "Báo cáo thiếu điểm hợp lệ.", analysis: "Nội dung đã nhận của nhà hàng." });
assert.ok(failed.includes("Nội dung đã nhận của nhà hàng."));
assert.ok(failed.includes("Báo cáo thiếu điểm hợp lệ."));
assert.ok(!failed.includes("Xuất PDF"));
assert.ok(!failed.includes("/10 cạnh tranh"));
const complete = render({ status: "done", analysis: "## Điểm cạnh tranh: 0/10" });
assert.ok(complete.includes("Xuất PDF"));
assert.ok(complete.includes("/10 cạnh tranh"));
assert.ok(!complete.includes("Chưa hoàn tất thẩm định"));
const streaming = render({ status: "streaming", analysis: "Báo cáo đang được nhận." });
assert.ok(streaming.includes("Báo cáo đang được nhận."));
assert.ok(!streaming.includes("Xuất PDF"));
console.log("PASS: lỗi giữ nội dung và chặn xuất PDF; điểm 0 hợp lệ; đang nhận chưa được xuất PDF.");

const refining = render({ status: "done", analysis: "Bản trước" }, { isRefining: true, refinementDraft: "Bản mới đang nhận" });
assert.ok(refining.includes("Bản mới đang nhận"));
assert.ok(!refining.includes("Bản trước"));
assert.ok(/disabled=""[^>]*>[^<]*<svg[\s\S]*Xuất PDF/.test(refining));
for (const [outcome, label] of [["updated", "Đã cập nhật báo cáo"], ["answered", "Đã giải đáp — giữ nguyên báo cáo"], ["error", "Chưa cập nhật — giữ bản trước"]]) {
  const html = render({ status: "done", analysis: "Bản trước" }, { chatMessages: [{ id: outcome, role: "model", content: "Phản hồi thử", outcome }] });
  assert.ok(html.includes(label));
  if (outcome !== "updated") assert.ok(!html.includes("Đã cập nhật báo cáo"));
}
const completedWithoutMenuHeading = render({ status: "done", analysis: "## Thực đơn\nTên món và giá đã được phân tích." });
assert.ok(!completedWithoutMenuHeading.includes("Chưa hoàn tất thẩm định"));
assert.ok(!completedWithoutMenuHeading.includes("Thẩm định lại"));
assert.ok(completedWithoutMenuHeading.includes("Xuất PDF"));
assert.ok(renderToStaticMarkup(React.createElement(MenuSection, { profile: { menu: null } })).includes("Chưa thu thập được danh sách món dạng chữ"));

const { getVenueAuditMemory, saveVenueAuditMemory } = require("../src/lib/types.ts");
const report = require("./fixture-report.cjs")({ title: "Quán QA" });
const stored = new Map();
global.window = {};
global.localStorage = { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v) };
assert.equal(saveVenueAuditMemory("one", { dataId: "one", analysis: report, messages: [], title: "Quán QA", lastUpdated: 1 }), true);
assert.equal(getVenueAuditMemory("one").analysis, report);
assert.equal(getVenueAuditMemory("two"), null);
assert.equal(saveVenueAuditMemory("two", { dataId: "one", analysis: report }), false);
assert.equal(saveVenueAuditMemory("one", { dataId: "one", analysis: "  " }), false);
assert.equal(getVenueAuditMemory("one").analysis, report);
const shortReport = "## Thực đơn\nTên món, giá và mô tả được ghi rõ.";
assert.equal(saveVenueAuditMemory("one", { dataId: "one", analysis: shortReport }), true);
assert.equal(getVenueAuditMemory("one").analysis, shortReport);
global.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
assert.equal(saveVenueAuditMemory("one", { dataId: "one", analysis: report }), false);
delete global.window;
delete global.localStorage;
console.log("PASS: draft sửa/lỗi/giải đáp; báo cáo hoàn tất không bị chặn vì tiêu đề; cache và lỗi lưu.");
