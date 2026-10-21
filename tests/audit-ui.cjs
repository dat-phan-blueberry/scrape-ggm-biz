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
assert.ok(!failed.includes("/100 sức khỏe GBP"));
const complete = render({ status: "done", analysis: "## Điểm sức khỏe hồ sơ: 0/100" });
assert.ok(complete.includes("Xuất PDF"));
assert.ok(complete.includes("/100 sức khỏe GBP"));
assert.ok(!complete.includes("Chưa hoàn tất thẩm định"));
const streaming = render({ status: "streaming", analysis: "Báo cáo đang được nhận." });
assert.ok(streaming.includes("Báo cáo đang được nhận."));
assert.ok(!streaming.includes("Xuất PDF"));
console.log("PASS: lỗi giữ nội dung và chặn xuất PDF; điểm 0 hợp lệ; đang nhận chưa được xuất PDF.");

const refining = render({ status: "done", analysis: "Bản trước" }, { isRefining: true, refinementDraft: "Bản mới đang nhận" });
assert.ok(refining.includes("Bản mới đang nhận"));
assert.ok(!refining.includes("Bản trước"));
assert.ok(/disabled=""[^>]*>[^<]*<svg[\s\S]*Xuất PDF/.test(refining));
for (const [outcome, label] of [["updated", "Đã nhận bản chỉnh sửa"], ["answered", "Giữ nguyên báo cáo"], ["error", "Chưa cập nhật — giữ bản trước"]]) {
  const html = render({ status: "done", analysis: "Bản trước" }, { chatMessages: [{ id: outcome, role: "model", content: "Phản hồi thử", outcome }] });
  assert.ok(html.includes(label));
  if (outcome !== "updated") assert.ok(!html.includes("Đã nhận bản chỉnh sửa"));
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

const { buildAuditReportHtml } = require("../src/lib/report-html.ts");
const denseSample = [
  "## Đánh giá tổng quan sức khỏe hồ sơ",
  "Cục Gạch Quán là một biểu tượng ẩm thực truyền thống Việt Nam tại TP. Hồ Chí Minh với uy tín lâu năm và lượng đánh giá khổng lồ (hơn 4.200 review, đạt 4.3★). Tuy nhiên, trên mặt trận số hóa Google Business Profile (GBP), nhà hàng đang là một \"vương triều ngủ quên\". Sở hữu di sản danh tiếng offline nhưng lại bỏ hoang hoàn toàn cơ sở hạ tầng trực tuyến, hồ sơ đang âm thầm tạo ra những lỗ rò doanh thu nghiêm trọng: website dùng chuẩn HTTP kém bảo mật, hoàn toàn trống rỗng Text Menu, thiếu hụt hình ảnh không gian và mất trắng lượng khách đặt bàn trực tuyến. Khách hàng tiềm năng đang bị bỏ rơi giữa một mặt tiền số sơ sài.",
  "## Phân tích chi tiết 5 trụ cột & Barem trừ điểm",
  "### I. Thông tin cơ bản & Tính nhất quán (16/20 điểm)",
  "- **4. Kênh Liên Hệ & Website (0/4đ):** [Mức trừ: Trừ 4đ] - [Thực trạng: Hồ sơ để trống hoàn toàn số điện thoại và không có website chính thức.] - [Tác động: Gây mất lòng tin với thuật toán Google và khách hàng.] - [Khuyến nghị: Bổ sung ngay số hotline +84 và website HTTPS.]",
  "## Điểm sức khỏe hồ sơ: 34/100",
].join("\n");

const renderedUi = render({ status: "done", analysis: denseSample });
assert.ok(renderedUi.includes("text-justify"), "Web UI report phải có text-justify");
assert.ok((renderedUi.match(/<p /g) || []).length >= 3, "Đoạn tổng quan dài 1 cục phải được tách thành nhiều đoạn <p>");
assert.ok(/<strong[^>]*>Thực trạng:<\/strong>/.test(renderedUi), "Bullet viết dồn phải tách nhãn Thực trạng thành ý con");
assert.ok(/<strong[^>]*>Khuyến nghị:<\/strong>/.test(renderedUi), "Bullet viết dồn phải tách nhãn Khuyến nghị thành ý con");

const renderedPdf = buildAuditReportHtml({
  restaurant: "Cục Gạch Quán",
  analysis: denseSample,
  score: "34",
  logoUrl: "/logo.png",
});
assert.ok(renderedPdf.includes("text-align: justify"), "Báo cáo in/PDF phải căn đều (justify)");
assert.ok((renderedPdf.match(/<p>/g) || []).length >= 3, "Báo cáo in/PDF phải tách đoạn văn dài thành nhiều đoạn <p>");
assert.ok(renderedPdf.includes("<ul><li><strong>Thực trạng:</strong>"), "Báo cáo in/PDF phải tách ý con thụt lề cho tiêu chí dài");
console.log("PASS: tách đoạn văn/bullet viết 1 cục và căn đều (justify) trên cả Web UI lẫn bản in PDF.");
