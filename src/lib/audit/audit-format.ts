/** JSON chỉ dùng trong giao tiếp với model; API công khai vẫn trả Markdown. */
const prose = { type: "STRING" };
const menuProperties = {
  evidence: { ...prose, description: "Nguồn thực đơn đã thu thập, phạm vi và giới hạn. Phân biệt chữ, ảnh menu, ảnh món và link chưa đọc." },
  names: { ...prose, description: "Đánh giá tên món bằng ví dụ thực tế nếu có; thiếu dữ liệu thì nói chưa đánh giá được." },
  prices: { ...prose, description: "Đánh giá giá món, đơn vị/khẩu phần; không bịa giá." },
  descriptions: { ...prose, description: "Đánh giá mô tả thành phần/khẩu phần; không suy món không có mô tả nếu chưa đọc menu." },
  grouping: { ...prose, description: "Cách nhóm món và hỗ trợ lựa chọn, căn cứ vào nhóm thực tế." },
  nextStep: { ...prose, description: "Một việc cụ thể có ích với khách và phù hợp bằng chứng, không cam kết SEO." },
};
const reportProperties = {
  overview: prose,
  strengths: prose,
  opportunities: prose,
  textMenu: { type: "OBJECT", properties: menuProperties, required: Object.keys(menuProperties) },
  actions: prose,
  score: { type: "NUMBER", minimum: 0, maximum: 10, description: "Điểm cạnh tranh 0–10, tối đa một chữ số thập phân." },
  scoreReason: { ...prose, description: "2–3 câu ngắn giải thích bằng chứng và độ chắc chắn; không kể lịch sử biên tập, không có tiêu đề Markdown, không lặp lại điểm, không tự trừ điểm vì chưa thu thập." },
};
export const AUDIT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { ...prose, description: "Trả lời yêu cầu chat; để rỗng ở lần thẩm định đầu." },
    report: { type: "OBJECT", nullable: true, properties: reportProperties, required: Object.keys(reportProperties) },
  },
  required: ["reply", "report"],
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cần trả đối tượng báo cáo đúng cấu trúc.");
  return value as Record<string, unknown>;
}
function content(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length < 20) throw new Error(`Mục ${field} chưa có nội dung đánh giá cụ thể.`);
  // Model chỉ viết nội dung; tiêu đề và điểm do renderer quản lý.
  if (/^\s*#{1,6}\s/m.test(value)) throw new Error(`Không chèn tiêu đề Markdown vào nội dung ${field}.`);
  return value.trim();
}

export function decodeAuditOutput(text: string, isChat: boolean): { reply: string; analysis: string | null } {
  const value = object(JSON.parse(text));
  if (typeof value.reply !== "string" || (isChat && !value.reply.trim())) throw new Error("Thiếu câu trả lời trao đổi.");
  if (value.report === null && isChat) return { reply: value.reply.trim(), analysis: null };
  const r = object(value.report);
  const m = object(r.textMenu);
  if (typeof r.score !== "number" || !/^(?:\d|10)(?:\.\d)?$/.test(String(r.score)) || r.score > 10) {
    throw new Error("Điểm phải thuộc thang 0–10, tối đa một chữ số thập phân.");
  }
  const menu = [
    content(m.evidence, "bằng chứng menu"),
    `**Tên món:** ${content(m.names, "tên món")}`,
    `**Giá và khẩu phần:** ${content(m.prices, "giá món")}`,
    `**Mô tả món:** ${content(m.descriptions, "mô tả món")}`,
    `**Nhóm món và lựa chọn:** ${content(m.grouping, "nhóm món")}`,
    `**Việc nên làm:** ${content(m.nextStep, "hành động menu")}`,
  ].join("\n\n");
  return {
    reply: value.reply.trim(),
    analysis: [
      `## Đánh giá tổng quan\n${content(r.overview, "tổng quan")}`,
      `## Điểm mạnh\n${content(r.strengths, "điểm mạnh")}`,
      `## Cơ hội cải thiện\n${content(r.opportunities, "cơ hội")}`,
      `## Đánh giá về Text Menu\n${menu}`,
      `## Khuyến nghị hành động\n${content(r.actions, "khuyến nghị")}`,
      `## Điểm cạnh tranh: ${r.score}/10\n${content(r.scoreReason, "lý do chấm điểm")}`,
    ].join("\n\n"),
  };
}
