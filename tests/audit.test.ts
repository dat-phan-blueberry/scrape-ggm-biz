import { businessBrief, buildPrompt, cleanBusinessReportText, parseAndValidateScore, reportValidationError, responseValidationError, splitRefinement, evidenceValidationError } from "../supabase/functions/_shared/audit.ts";
import { AuditError, auditEventStream, generateAudit, quotaPeriod } from "../supabase/functions/_shared/audit-service.ts";
import { AiResponseError, completedReportError, completedRefinementError, readAiResponse, requestAiAudit } from "../src/lib/ai-response.ts";
import { decodeAuditOutput } from "../supabase/functions/_shared/audit-format.ts";
import { normalizeMenu } from "../src/lib/menu.ts";
import { reviewCorrection } from "../supabase/functions/_shared/audit-review.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const structured = (score = 7.5, reply = "") => ({ reply, report: {
  overview: "Nhà hàng có lượng đánh giá đáng chú ý, nhưng cần kiểm tra thêm thông tin giúp khách lựa chọn trước khi đến.",
  strengths: "Khách có thể tham khảo nhận xét đã ghi nhận để hiểu trải nghiệm tại quán.",
  opportunities: "Cần đối chiếu các kênh liên hệ thực tế với thông tin đang hiển thị.",
  textMenu: {
    evidence: "Chưa ghi nhận danh sách món dạng chữ. Cần kiểm tra menu trực tiếp với chủ quán trước khi kết luận.",
    names: "Chưa có dữ liệu tên món để đánh giá độ rõ ràng.",
    prices: "Chưa thu thập giá món và thông tin khẩu phần.",
    descriptions: "Chưa đọc được mô tả món trong thực đơn của quán.",
    grouping: "Chưa đọc được các nhóm món để đánh giá cách lựa chọn.",
    nextStep: "Cùng chủ quán kiểm tra menu trực tiếp trên điện thoại.",
  },
  actions: "Kiểm tra mức độ dễ tìm thông tin món và giá trên điện thoại, rồi ưu tiên bổ sung nội dung còn thiếu.",
  score, scoreReason: "Điểm phản ánh thông tin đã ghi nhận; cần bổ sung thực đơn để đánh giá đầy đủ.",
} });
const report = (score = "7.5/10") => decodeAuditOutput(JSON.stringify(structured()), false).analysis!.replace("7.5/10", score);

Deno.test("Điểm 0 và 10 hợp lệ; không nhầm sao Google", () => {
  for (const score of ["0", "7.5", "10", "7,5"]) equal(parseAndValidateScore(`Điểm sao: 4.4/5\n${report(`${score}/10`)}`), score.replace(",", "."));
});
Deno.test("Từ chối điểm sai; không cắt ngưỡng, chia 10 hoặc chọn điểm cuối", () => {
  for (const score of ["85/10", "85/100", "-1/10", "+7/10", "10.1/10", "0.01/10", "7/5", "NaN/10", "7/1000", "1e2/10", "7/10.5"])
    equal(parseAndValidateScore(report(score)), null);
  equal(parseAndValidateScore(report() + "\n## Điểm cạnh tranh: 8/10"), null);
  equal(parseAndValidateScore("Điểm sao: 4.4/5"), null);
});

Deno.test("Điểm 0 hợp lệ về thang nhưng không được làm giá trị thay cho từ chối chấm", () => {
  equal(reportValidationError(report("0/10")), null);
  equal(!!reportValidationError(report("0/10") + "\nTư liệu không cung cấp sẵn điểm cạnh tranh chi tiết, do đó hệ thống không tự đặt ra con số đánh giá điểm."), true);
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

function isReview(options?: RequestInit) {
  return !!JSON.parse(String(options?.body || "{}")).generationConfig?.responseSchema?.properties?.issues;
}
function reviewed(issues: Array<{ quote: string; reason: string }> = []) {
  return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ issues }) }] } }] });
}
async function mockGeneration(outputs: Array<string | number | { text: string; finishReason: string }>, run: (requests: string[], reviews: string[]) => Promise<void>, findings: Array<Array<{ quote: string; reason: string }>> = [[]]) {
  const original = globalThis.fetch;
  const requests: string[] = [];
  const reviews: string[] = [];
  globalThis.fetch = (_url, options) => {
    if (isReview(options)) {
      reviews.push(String(options?.body));
      return Promise.resolve(reviewed(findings[Math.min(reviews.length - 1, findings.length - 1)]));
    }
    requests.push(String(options?.body));
    const output = outputs[Math.min(requests.length - 1, outputs.length - 1)];
    if (typeof output === "number") return Promise.resolve(new Response("Error", { status: output }));
    const source = typeof output === "string" ? output : output.text;
    // Fixture transport đã chuyển sang structured output của Gemini.
    const refinement = splitRefinement(source);
    const score = Number((refinement?.updatedAnalysis || source).match(/Điểm cạnh tranh: ([\d.-]+)/)?.[1]);
    const text = source.startsWith("{") ? source : JSON.stringify(structured(score, refinement?.reply || ""));
    return Promise.resolve(Response.json({ candidates: [{ finishReason: typeof output === "string" ? "STOP" : output.finishReason, content: { parts: [{ text }] } }] }));
  };
  try { await run(requests, reviews); } finally { globalThis.fetch = original; }
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

Deno.test("Báo cáo hợp lệ không bị loại vì Markdown, đánh số mục hoặc khoảng trắng", () => {
  const formatted = report().replace(/^## (.+)$/gm, "### **$1**  ");
  equal(reportValidationError(formatted), null);
  equal(reportValidationError(report().replace("## Điểm mạnh", "## 2. Điểm mạnh ###")), null);
  equal(parseAndValidateScore(report().replace("## Điểm cạnh tranh: 7.5/10", "## 6. Điểm cạnh tranh\n\n**7.5/10**")), "7.5");
  equal(parseAndValidateScore(report().replace("7.5/10", "85/10")), null);
});
Deno.test("Client từ chối bản Edge cũ thiếu Text Menu theo yêu cầu chất lượng mới", () => {
  const oldReport = report().replace("## Cơ hội cải thiện", "## Điểm yếu & thiếu sót").replace("## Đánh giá về Text Menu", "## Thực đơn");
  equal(!!completedReportError(oldReport), true);
  equal(!!reportValidationError(oldReport), true);
});

function sse(parts: string[], done = true, trailingNewline = true) {
  return parts.map(text => `data: ${JSON.stringify({ text })}\r\n\r\n`).join("")
    + (done ? `data: [DONE]${trailingNewline ? "\r\n\r\n" : ""}` : "");
}
function streamResponse(content: string, chunkSize = 17) {
  const bytes = new TextEncoder().encode(content);
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}
Deno.test("SSE chia từng byte UTF-8, nhiều sự kiện/chunk và DONE thiếu newline đều nhận đủ", async () => {
  for (const chunkSize of [1, 17, 100_000]) {
    const text = report();
    const res = await readAiResponse(streamResponse(": ping\n\n" + sse([text.slice(0, -20), text.slice(-20)], true, false), chunkSize));
    equal(res.analysis, text);
    equal(completedReportError(res.analysis), null);
  }
});
Deno.test("Sự kiện cuối chứa điểm được giữ lại khi flush EOF", async () => {
  // JSON nhiều dòng là SSE hợp lệ; không được parse riêng từng data line.
  const content = `data: {\ndata: "text": ${JSON.stringify(report())}\ndata: }\n\ndata: [DONE]`;
  equal((await readAiResponse(streamResponse(content))).analysis, report());
});
Deno.test("HTTP 200 nhưng thiếu DONE là lỗi kết nối, giữ nguyên nội dung đã nhận", async () => {
  try {
    await readAiResponse(streamResponse(sse([report()], false)));
    throw new Error("Phải báo stream chưa hoàn tất");
  } catch (error) {
    equal(error instanceof AiResponseError, true);
    equal((error as AiResponseError).kind, "connection");
    equal((error as AiResponseError).draft, report());
  }
});
Deno.test("HTTP 200 có sự kiện lỗi không bị biến thành thành công hoặc lỗi mạng chung", async () => {
  try {
    await readAiResponse(streamResponse(sse([report()], false) + 'data: {"error":"Dịch vụ đã hết lượt thử."}\n\n'));
    throw new Error("Phải báo lỗi dịch vụ");
  } catch (error) {
    equal((error as AiResponseError).kind, "response");
    equal((error as AiResponseError).message, "Dịch vụ đã hết lượt thử.");
    equal((error as AiResponseError).draft, report());
  }
});
Deno.test("JSON và Edge SSE chat cùng giữ báo cáo khi GIỮ NGUYÊN", async () => {
  const text = "=== PHẢN HỒI CHAT ===\nGiải đáp.\n=== BẢN BÁO CÁO CẬP NHẬT ===\nGIỮ NGUYÊN";
  equal((await readAiResponse(streamResponse(sse([text])), report())).analysis, report());
  equal((await readAiResponse(Response.json({ analysis: report(), reply: "Giải đáp." }), report())).analysis, report());
});
Deno.test("Client tự retry điểm sai từ Edge cũ, không ghép bản cũ vào bản mới", async () => {
  const original = globalThis.fetch;
  const displayed: string[] = [];
  let calls = 0;
  globalThis.fetch = () => Promise.resolve(streamResponse(sse([report(++calls === 1 ? "85/10" : "8/10")])));
  try {
    equal(await requestAiAudit("https://example.test", { profile: {} }, text => displayed.push(text)), report("8/10"));
    equal(calls, 2);
    equal(displayed.filter(text => text === "").length, 2);
    equal(displayed[displayed.length - 1], report("8/10"));
  } finally { globalThis.fetch = original; }
});
Deno.test("Client hết retry điểm sai: lỗi nội dung riêng, giữ bản nhận được", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; return Promise.resolve(streamResponse(sse([report("85/10")]))); };
  try {
    await requestAiAudit("https://example.test", { profile: {} });
    throw new Error("Phải từ chối điểm 85/10");
  } catch (error) {
    equal(calls, 2);
    equal((error as AiResponseError).kind, "validation");
    equal((error as AiResponseError).draft, report("85/10"));
  } finally { globalThis.fetch = original; }
});

Deno.test("Kết nối hỏng khi retry vẫn giữ bản nhận được ở lượt đầu", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => ++calls === 1
    ? Promise.resolve(streamResponse(sse([report("85/10")])))
    : Promise.reject(new TypeError("Network error"));
  try {
    await requestAiAudit("https://example.test", { profile: {} });
    throw new Error("Phải báo lỗi kết nối");
  } catch (error) {
    equal(calls, 2);
    equal((error as AiResponseError).kind, "connection");
    equal((error as AiResponseError).draft, report("85/10"));
  } finally { globalThis.fetch = original; }
});

Deno.test("Chặn đúng lời phán địa chỉ của An Bàng; giữ tên quán và tên món địa phương", () => {
  const wrong = 'Lỗi địa chỉ hiển thị nghiêm trọng (NAP inconsistency): Địa chỉ ghi "An Bang Beach Hội, Hội An Tây, Đà Nẵng, Việt Nam". Đây là lỗi ghép sai tỉnh thành (An Bàng thuộc Hội An, Quảng Nam, không phải Đà Nẵng).';
  equal(!!reportValidationError(report() + "\n" + wrong), true);
  for (const safe of ["Phở Thìn Đà Nẵng phục vụ món phở được khách nhắc đến.", "Bún bò Huế và bánh cuốn Hà Nội là tên món đã ghi nhận.", "Chưa đủ căn cứ kết luận địa chỉ tại Đà Nẵng sai.", "Không nên phán địa chỉ sai khi chưa xác minh."]) equal(reportValidationError(report() + "\n" + safe), null);
});

Deno.test("Mục menu rỗng và lời hứa Google không đọc ảnh bị từ chối", () => {
  equal(!!reportValidationError(report().replace(/(## Đánh giá về Text Menu\n)[\s\S]*?(?=## Khuyến nghị)/, "$1\n")), true);
  equal(!!reportValidationError(report() + "\nGoogle không đọc được chữ trong ảnh menu."), true);
});

Deno.test("Menu giữ link, ảnh, giá 0; chịu dữ liệu sai kiểu và không suy highlight thành món chữ", () => {
  const menu = normalizeMenu({ link: "https://example.test/menu", source: "Quán", images: [{ image: "https://example.test/photo.jpg" }], highlights: [{ title: "Cao lầu" }], categories: [{ title: "Món chính", items: [{ title: "Món thử", price: 0 }, { title: "", price: 100 }] }] })!;
  equal(menu.categories[0].items[0].price, "0");
  equal(menu.categories[0].items.length, 1);
  equal(menu.images?.length, 1);
  equal(menu.link, "https://example.test/menu");
  equal(normalizeMenu({ link: "javascript:alert(1)", categories: "oops", highlights: {} })?.categories, []);
  equal(normalizeMenu({ link: "javascript:alert(1)" })?.link, "");
  equal(normalizeMenu({ highlights: [{ title: "Cao lầu" }] })?.categories, []);
  const brief = JSON.stringify(businessBrief({ menu }));
  equal(brief.includes('"Số ảnh thực đơn":1'), true);
  equal(brief.includes('"Số món có giá":1'), true);
});

Deno.test("Structured output thiếu nội dung menu retry; không có báo cáo hợp lệ thì fail", async () => {
  const invalid = structured();
  invalid.report.textMenu.prices = "";
  await mockGeneration([JSON.stringify(invalid), JSON.stringify(structured())], async requests => {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(requests.length, 2);
    equal(JSON.parse(requests[0]).generationConfig.responseMimeType, "application/json");
  });
});

Deno.test("Structured output không hợp thức hóa điểm sai hay report null lần đầu", () => {
  for (const value of [structured(10.1), structured(-1), structured(7.55), { reply: "", report: null }]) {
    let failed = false;
    try { decodeAuditOutput(JSON.stringify(value), false); } catch { failed = true; }
    equal(failed, true);
  }
});

Deno.test("SSE chat trả thẳng báo cáo mới phải cập nhật; snapshot mới thắng analysis cũ", async () => {
  const revised = report("8/10");
  equal((await readAiResponse(streamResponse(sse([revised])), report())).analysis, revised);
  const content = sse(["Đang xử lý"], false) + `data: ${JSON.stringify({ analysis: report(), updatedAnalysis: revised, reply: "Đã sửa." })}\n\ndata: [DONE]`;
  equal((await readAiResponse(streamResponse(content, 1), report())).analysis, revised);
});

Deno.test("JSON chỉ có updatedAnalysis, SSE analysis snapshot và marker in đậm đều đọc đúng", async () => {
  const revised = report("8/10");
  equal((await readAiResponse(Response.json({ updatedAnalysis: revised, reply: "Đã sửa." }), report())).analysis, revised);
  equal((await readAiResponse(streamResponse(`data: ${JSON.stringify({ analysis: revised })}\n\ndata: [DONE]`), report())).analysis, revised);
  equal((await readAiResponse(streamResponse(sse([`=== PHẢN HỒI CHAT ===\nĐã sửa.\n**=== BẢN BÁO CÁO CẬP NHẬT ===**\n${revised}`])), report())).analysis, revised);
});

Deno.test("Chat nói đã cập nhật nhưng giữ nguyên phải bị từ chối", () => {
  equal(!!responseValidationError("=== PHẢN HỒI CHAT ===\nĐã cập nhật báo cáo.\n=== BẢN BÁO CÁO CẬP NHẬT ===\nGIỮ NGUYÊN", { profile: {}, currentAnalysis: report(), messages: [{ role: "user", content: "Sửa báo cáo" }] }), true);
});

Deno.test("Không kết luận thiếu menu/giới thiệu từ dữ liệu chưa thu thập", () => {
  equal(!!evidenceValidationError(report() + "\nĐiểm chưa tối đa do thiếu hụt thực đơn dạng chữ trực tuyến.", { profile: {} }), true);
  equal(!!evidenceValidationError(report() + "\nQuán thiếu thông tin giới thiệu chính thức.", { profile: {} }), true);
  equal(evidenceValidationError(report(), { profile: {} }), null);
  equal(evidenceValidationError("Dữ liệu hiện tại ghi nhận chưa có sẵn thực đơn dạng chữ hoặc liên kết menu trực tuyến trong hệ thống; giới hạn này xuất phát từ phạm vi thu thập dữ liệu chứ chưa phản ánh toàn bộ thực tế tại quán.", { profile: {} }), null);
  equal(!!evidenceValidationError("Điểm bị giảm vì thiếu menu trong dữ liệu thu thập.", { profile: {} }), true);
  equal(evidenceValidationError(report() + "\nQuán chưa có menu chữ.", { profile: {}, messages: [{ role: "user", content: "Nhà hàng chưa có menu chữ, tôi xác nhận." }] }), null);
});

Deno.test("Không suy khách quen hoặc xu hướng theo thời gian từ một điểm sao/tổng đánh giá", () => {
  for (const claim of ["245 lượt đánh giá cho thấy lượng khách quen ổn định.", "Điểm 4.2/5 phản ánh sức hút ổn định.", "Điểm số này chứng minh lòng trung thành của thực khách."]) equal(!!evidenceValidationError(claim, { profile: {} }), true);
  equal(evidenceValidationError("245 lượt đánh giá là tín hiệu uy tín; chưa đủ căn cứ kết luận lượng khách ổn định.", { profile: {} }), null);
});

Deno.test("Giá tiền giữ đúng đơn vị và hai đầu khoảng; không biến 1 đồng thành 1.000 đồng", () => {
  const input = { profile: { price: "1–100.000 đ", user_reviews: [{ description: "Bữa ăn 1,6 triệu cho 6 người; một khách khác kể 70k." }] } };
  equal(!!evidenceValidationError("Mức chi tiêu từ 1.000 đến 100.000 đồng.", input), true);
  equal(evidenceValidationError("Khách báo cáo khoảng 1–100.000 đồng, một nhận xét nêu bữa ăn 1.600.000 đồng, một nhận xét khác nêu 70.000 đồng.", input), null);
  equal(evidenceValidationError("Món ăn giá 0 đồng.", { profile: { menu: { categories: [{ items: [{ title: "Món tặng", price: "0 đ" }] }] } } }), null);
  equal(evidenceValidationError("Khoảng giá 200.000–700.000 đồng.", { profile: { price: "200–700 N ₫" } }), null);
  equal(evidenceValidationError("Giá 125.000 đồng do chủ quán bổ sung.", { profile: {}, messages: [{ role: "user", content: "Giá mới của món là 125k." }] }), null);
});

Deno.test("Yêu cầu sửa rõ ràng không được trả GIỮ NGUYÊN", () => {
  equal(!!responseValidationError("=== PHẢN HỒI CHAT ===\nTôi tiếp nhận yêu cầu.\n=== BẢN BÁO CÁO CẬP NHẬT ===\nGIỮ NGUYÊN", { profile: {}, currentAnalysis: report(), messages: [{ role: "user", content: "Bổ sung lịch kiểm tra thực đơn" }] }), true);
});

Deno.test("Chưa đọc ảnh menu thì không được tự mô tả cách phân nhóm món", () => {
  const input = { profile: { menu: { categories: [], images: [{ thumbnail: "https://example.com/menu.jpg" }] } } };
  equal(!!evidenceValidationError("Các món ăn hiện được phân chia theo nhóm nguyên liệu trong ảnh thực đơn.", input), true);
  equal(evidenceValidationError("Chưa đọc được ảnh menu nên chưa có cơ sở đánh giá cách phân chia món.", input), null);
  equal(evidenceValidationError("Nguồn thu thập chưa có văn bản menu chi tiết; cần xem thực đơn hiện hành.", input), null);
});

Deno.test("Cùng lượt sửa nhận đủ lỗi dữ liệu và lỗi kiểm chứng độc lập", async () => {
  const draft = structured();
  draft.report.textMenu.grouping = "Các món ăn hiện được phân chia theo nhóm nguyên liệu trong ảnh thực đơn.";
  draft.report.overview = "Nhà hàng đã được trao giải thưởng ẩm thực quốc tế danh giá.";
  const issue = { quote: draft.report.overview, reason: "Không có nguồn giải thưởng trong hồ sơ." };
  await mockGeneration([JSON.stringify(draft), JSON.stringify(structured())], async (requests, reviews) => {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(reviews.length, 2);
    equal(requests[1].includes("Chưa có danh mục chữ"), true);
    equal(requests[1].includes(issue.reason), true);
  }, [[issue], []]);
});

Deno.test("Client không báo cập nhật nếu API chỉ trả báo cáo cũ hoặc bản sửa rỗng", async () => {
  const input = { profile: {}, currentAnalysis: report(), messages: [{ role: "user", content: "Sửa báo cáo" }] };
  equal(!!completedRefinementError({ analysis: report(), reply: "Đã sửa báo cáo." }, input), true);
  let rejected = false;
  try { await readAiResponse(Response.json({ analysis: report(), updatedAnalysis: "" }), report()); } catch { rejected = true; }
  equal(rejected, true);
});

Deno.test("Hết quota theo ngày bỏ lần retry cùng model, vẫn thử phương án dự phòng", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (url, options) => {
    if (isReview(options)) return Promise.resolve(reviewed());
    urls.push(String(url));
    return Promise.resolve(urls.length === 1
      ? Response.json({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }, { status: 429 })
      : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(structured()) }] } }] }));
  };
  try {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(urls.length, 2);
    equal(urls[1].includes("gemini-3.6-flash"), true);
  } finally { globalThis.fetch = original; }
});

Deno.test("20 không xác định RPM/RPD; phải đọc đúng định danh hạn mức", () => {
  const failure = (quotaId: string) => ({ error: { details: [{ violations: [{ quotaId, quotaValue: "20" }] }] } });
  equal(quotaPeriod(failure("GenerateRequestsPerDayPerProjectPerModel-FreeTier")), "day");
  equal(quotaPeriod(failure("GenerateRequestsPerMinutePerProjectPerModel")), "minute");
  equal(quotaPeriod(failure("UnknownLimit")), "unknown");
  for (const value of [null, {}, { error: { details: {} } }, { error: { details: [null, { violations: [null] }] } }]) equal(quotaPeriod(value), "unknown");
});

Deno.test("Primary bị RPD nhưng fallback quá tải không được báo toàn dịch vụ hết quota ngày", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => Promise.resolve(++calls === 1
    ? Response.json({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }, { status: 429 })
    : Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503, headers: { "retry-after": "0" } }));
  try {
    await generateAudit("test-key", { profile: {} });
    throw new Error("Phải báo không hoàn tất");
  } catch (error) {
    equal(calls, 7);
    equal((error as AuditError).status, 502);
    equal((error as Error).message.includes("theo ngày"), false);
  } finally { globalThis.fetch = original; }
});

Deno.test("Retry-After vượt deadline không được bị cắt thành 5 giây rồi gọi lại cùng model", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (url, options) => {
    if (isReview(options)) return Promise.resolve(reviewed());
    urls.push(String(url));
    return Promise.resolve(urls.length === 1
      ? Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429, headers: { "retry-after": "180" } })
      : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(structured()) }] } }] }));
  };
  try {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(urls.length, 2);
    equal(urls[0] === urls[1], false);
  } finally { globalThis.fetch = original; }
});

Deno.test("Báo cáo đúng schema vẫn phải sửa nhận định bị kiểm chứng bác bỏ trước khi gửi", async () => {
  const draft = structured();
  draft.report.overview = "Quán có lượng khách quen ổn định nhờ hình ảnh sắc nét.";
  const issue = { quote: draft.report.overview, reason: "Không có thống kê khách quay lại và chưa xem trực tiếp hình ảnh trong tư liệu." };
  await mockGeneration([JSON.stringify(draft), JSON.stringify(structured())], async (requests, reviews) => {
    equal(await generateAudit("test-key", { profile: { reviews_count: 245 } }), report());
    equal(requests.length, 2);
    equal(reviews.length, 2);
    equal(requests[1].includes(issue.reason), true);
    equal(reviews[0].includes("245"), true);
  }, [[issue], []]);
});

Deno.test("Kiểm chứng không hoàn tất thì không gửi báo cáo; lỗi RPM cuối không bị ghi nhầm là lỗi nội dung", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, options) => Promise.resolve(isReview(options)
    ? Response.json({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }] }] } }, { status: 429, headers: { "retry-after": "180" } })
    : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(structured()) }] } }] }));
  try {
    await generateAudit("test-key", { profile: {} });
    throw new Error("Không được gửi báo cáo chưa kiểm chứng");
  } catch (error) {
    equal((error as AuditError).status, 429);
    equal((error as AuditError).retryAfterSeconds, 180);
  } finally { globalThis.fetch = original; }
});

Deno.test("JSON và SSE giữ mã lỗi/thời gian đợi để E2E không retry sớm", async () => {
  const data = { error: "Dịch vụ đang giới hạn lượt gọi.", status: 429, retryAfterSeconds: 37 };
  for (const response of [Response.json(data, { status: 429 }), streamResponse(`data: ${JSON.stringify(data)}\n\ndata: [DONE]`)]) {
    try { await readAiResponse(response); throw new Error("Phải báo lỗi"); }
    catch (error) { equal((error as AiResponseError).status, 429); equal((error as AiResponseError).retryAfterSeconds, 37); }
  }
});

Deno.test("Kiểm chứng lỗi hoặc trích câu không có trong báo cáo không được tự cho PASS", () => {
  equal(reviewCorrection('{"issues":[]}', report()), null);
  for (const raw of ['{}', '{"issues":[{"quote":"Câu bịa của người kiểm chứng","reason":"Sai"}]}', '{"issues":[null]}']) {
    let failed = false;
    try { reviewCorrection(raw, report()); } catch { failed = true; }
    equal(failed, true);
  }
});

Deno.test("Model dự phòng còn lượt sửa nội dung khi primary bị RPD", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  let reviews = 0;
  globalThis.fetch = (url, options) => {
    if (isReview(options)) { reviews++; return Promise.resolve(reviewed()); }
    urls.push(String(url));
    return Promise.resolve(urls.length === 1
      ? Response.json({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }, { status: 429 })
      : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(structured(urls.length === 2 ? 85 : 7.5)) }] } }] }));
  };
  try {
    equal(await generateAudit("test-key", { profile: {} }), report());
    equal(urls.length, 3);
    equal(urls[1], urls[2]);
    equal(urls[1].includes("gemini-3.6-flash"), true);
    equal(reviews, 1);
  } finally { globalThis.fetch = original; }
});
