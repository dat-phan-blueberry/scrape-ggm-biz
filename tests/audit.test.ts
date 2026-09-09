import { businessBrief, buildPrompt, cleanBusinessReportText, parseAndValidateScore, reportValidationError, responseValidationError, splitRefinement } from "../supabase/functions/_shared/audit.ts";
import { auditEventStream, generateAudit } from "../supabase/functions/_shared/audit-service.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const report = (score = "7.5/10") => `## Đánh giá tổng quan
Nhà hàng có lượng đánh giá đáng chú ý, nhưng cần kiểm tra thêm thông tin giúp khách lựa chọn trước khi đến.
## Điểm mạnh
Khách có thể tham khảo nhận xét đã ghi nhận để hiểu trải nghiệm tại quán.
## Cơ hội cải thiện
Cần đối chiếu các kênh liên hệ thực tế với thông tin đang hiển thị.
## Đánh giá về Text Menu
Chưa ghi nhận danh sách món dạng chữ. Cần kiểm tra menu trực tiếp với chủ quán trước khi kết luận.
## Khuyến nghị hành động
Kiểm tra mức độ dễ tìm thông tin món và giá trên điện thoại, rồi ưu tiên bổ sung nội dung còn thiếu.
## Điểm cạnh tranh: ${score}`;

Deno.test("Điểm 0 và 10 hợp lệ; không nhầm sao Google", () => {
  for (const score of ["0", "7.5", "10", "7,5"]) equal(parseAndValidateScore(`Điểm sao: 4.4/5\n${report(`${score}/10`)}`), score.replace(",", "."));
});
Deno.test("Từ chối điểm sai; không cắt ngưỡng, chia 10 hoặc chọn điểm cuối", () => {
  for (const score of ["85/10", "85/100", "-1/10", "+7/10", "10.1/10", "0.01/10", "7/5", "NaN/10", "7/1000", "1e2/10", "7/10.5"])
    equal(parseAndValidateScore(report(score)), null);
  equal(parseAndValidateScore(report() + "\n## Điểm cạnh tranh: 8/10"), null);
  equal(parseAndValidateScore("Điểm sao: 4.4/5"), null);
});
Deno.test("Tư liệu dùng nhãn kinh doanh, loại địa chỉ thô và định danh nội bộ", () => {
  const brief = JSON.stringify(businessBrief({ title: "Quán mẫu", address: "ĐỊA CHỈ CŨ", data_id: "secret-id", website: "", booking_links: [], menu: { highlights: [{ title: "Bia" }], categories: [{ title: "Đồ uống", items: [{ title: "Bia", price: "40.000", description: "" }, { title: "", price: "" }] }] } }));
  for (const value of ["ĐỊA CHỈ CŨ", "secret-id", "booking_links", "categories", "highlights", '"website"']) equal(brief.includes(value), false);
  equal(brief.includes('"Số món có tên":1'), true);
  equal(brief.includes('"Số món có giá":1'), true);
  equal(brief.includes('"Số món có mô tả":0'), true);
});
Deno.test("Thiếu menu khác với khẳng định không có; không ép ưu tiên menu", () => {
  equal(JSON.stringify(businessBrief({})).includes("Chưa ghi nhận trong thông tin thu thập"), true);
  equal(buildPrompt({ profile: {} }).includes("không mặc định trừ điểm"), true);
  equal(cleanBusinessReportText("has_text_menu: true"), "has_text_menu: true");
});
Deno.test("Báo cáo thiếu Text Menu, mã kỹ thuật hoặc điểm sai không được nhận", () => {
  equal(reportValidationError(report()), null);
  for (const text of [report("11/10"), report().replace("## Đánh giá về Text Menu", "## Menu"), report() + "\nTrường `website` và `booking_links` trống", report() + "\nmenu.highlights trống"]) equal(!!reportValidationError(text), true);
});
Deno.test("Chat GIỮ NGUYÊN chỉ hợp lệ với báo cáo hợp lệ", () => {
  const chat = "=== PHẢN HỒI CHAT ===\nGiải đáp.\n=== BẢN BÁO CÁO CẬP NHẬT ===\nGIỮ NGUYÊN";
  equal(splitRefinement(chat)?.updatedAnalysis, null);
  equal(responseValidationError(chat, { profile: {}, messages: [{ role: "user", content: "Giải thích" }], currentAnalysis: report() }), null);
  equal(!!responseValidationError(chat, { profile: {}, messages: [{ role: "user", content: "Giải thích" }], currentAnalysis: report("85/10") }), true);
});

async function mockGeneration(outputs: Array<string | number | { text: string; finishReason: string }>, run: (requests: string[]) => Promise<void>) {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (_url, options) => {
    requests.push(String(options?.body));
    const output = outputs[Math.min(requests.length - 1, outputs.length - 1)];
    if (typeof output === "number") return Promise.resolve(new Response("Error", { status: output }));
    return Promise.resolve(Response.json({ candidates: [{ finishReason: typeof output === "string" ? "STOP" : output.finishReason, content: { parts: [{ text: typeof output === "string" ? output : output.text }] } }] }));
  };
  try { await run(requests); } finally { globalThis.fetch = original; }
}
Deno.test("Điểm vượt ngưỡng retry cùng model, nhận bản hợp lệ", async () => {
  await mockGeneration([report("85/10"), report("0/10")], async requests => {
    equal(await generateAudit("test-key", { profile: {} }), report("0/10"));
    equal(requests.length, 2);
    equal(requests[1].includes("Lần trước chưa đạt kiểm tra"), true);
  });
});
Deno.test("Hết 3 lần thử: SSE chỉ có lỗi, không lộ bản điểm sai", async () => {
  await mockGeneration([report("85/10")], async requests => {
    const text = await new Response(auditEventStream("test-key", { profile: {} })).text();
    equal(requests.length, 3);
    equal(text.includes('"text"'), false);
    equal(text.includes('"error"'), true);
    equal(text.includes("[DONE]"), true);
  });
});
Deno.test("SSE chỉ gửi bản sau retry hợp lệ", async () => {
  await mockGeneration([report("-1/10"), report("10/10")], async () => {
    const text = await new Response(auditEventStream("test-key", { profile: {} })).text();
    equal(text.includes("-1/10"), false);
    equal(text.includes("10/10"), true);
  });
});
Deno.test("Chat sửa điểm sai được retry và trả báo cáo mới", async () => {
  const chat = (score: string) => `=== PHẢN HỒI CHAT ===\nĐã cập nhật.\n=== BẢN BÁO CÁO CẬP NHẬT ===\n${report(score)}`;
  await mockGeneration([chat("11/10"), chat("8/10")], async requests => {
    const text = await generateAudit("test-key", { profile: {}, currentAnalysis: report(), messages: [{ role: "user", content: "Bổ sung menu" }] });
    equal(splitRefinement(text)?.updatedAnalysis, report("8/10"));
    equal(requests.length, 2);
  });
});
Deno.test("Kết quả bị cắt phải retry dù đã có điểm", async () => {
  await mockGeneration([{ text: report(), finishReason: "MAX_TOKENS" }, report()], async requests => {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(requests.length, 2);
  });
});
Deno.test("Lỗi 429 retry; lỗi quyền truy cập dừng ngay", async () => {
  await mockGeneration([429, report()], async requests => {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(requests.length, 2);
  });
  await mockGeneration([403], async requests => {
    let failed = false;
    try { await generateAudit("test-key", { profile: {} }); } catch { failed = true; }
    equal(failed, true);
    equal(requests.length, 1);
  });
});
