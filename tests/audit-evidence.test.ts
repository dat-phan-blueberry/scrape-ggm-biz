import { buildPrompt } from "../supabase/functions/_shared/audit.ts";

function contains(text: string, values: string[]) {
  for (const value of values) if (!text.includes(value)) throw new Error(`Thiếu tư liệu: ${value}`);
}

Deno.test("Tư liệu thiếu ở mọi cấp thành lời rõ nghĩa, không lộ giá trị máy; giữ số 0", () => {
  const prompt = buildPrompt({ profile: {
    title: "Quán thử", data_id: "internal-id", description: null, price: undefined, menu: null, rating: 0,
    rating_summary: [{ stars: 1, amount: 0 }], booking_links: [{ name: "Đặt bàn", link: null }],
    user_reviews: [{ rating: null, date: undefined, description: "Khách phản ánh phục vụ chậm" }],
    similar_places: [{ title: "Quán lân cận", rating: null, reviews: undefined }],
  } });
  if (/\b(?:null|undefined|NaN)\b|\[object Object\]|\[\]|internal-id|data_id/.test(prompt)) throw new Error("Lộ cách biểu diễn dữ liệu máy");
  contains(prompt, ["Giới thiệu của nhà hàng: Chưa ghi nhận", "Khoảng giá: Chưa ghi nhận", "Điểm sao của khách (thang 5): 0", "Số lượt: 0", "Khách phản ánh phục vụ chậm", "chưa thử đặt bàn"]);
});

Deno.test("Ghi chú menu giữ tên, giá, mô tả nhiều dòng và nhóm món; không biến giá 0 thành thiếu", () => {
  const prompt = buildPrompt({ profile: { menu: { categories: [
    { title: "Món chính", items: [{ title: "Cá rô đồng kho", price: "120.000đ/phần", description: "Kho tộ\nĂn kèm cơm" }] },
    { title: "Đồ uống", items: [{ title: "Nước lọc", price: "0đ", description: null }] },
  ] } } });
  contains(prompt, ["Số món có tên: 2", "Số món có giá: 2", "Số món có mô tả: 1", "Nhóm món: Món chính", "Tên món: Cá rô đồng kho", "Giá: 120.000đ/phần", "Mô tả: Kho tộ", "Ăn kèm cơm", "Nhóm món: Đồ uống", "Giá: 0đ", "Mô tả: Chưa ghi nhận"]);
  if (prompt.includes('"categories"') || prompt.includes('"description"')) throw new Error("Lộ tên trường trong tư liệu");
});

Deno.test("Chỉ có ảnh/link menu giữ nguồn và giới hạn quan sát, không kết luận thực đơn trống", () => {
  const prompt = buildPrompt({ profile: { menu: { categories: [], link: "https://example.test/menu", source: "Nhà hàng", images: [{ image: "menu.jpg" }] } } });
  contains(prompt, ["Tình trạng: Chưa ghi nhận", "Liên kết thực đơn: https://example.test/menu", "Nguồn liên kết: Nhà hàng", "Số ảnh thực đơn: 1", "Chưa mở liên kết, chưa đọc chữ trong ảnh"]);
  if (prompt.includes("quán không có menu") || prompt.includes("Menu trống")) throw new Error("Biến giới hạn thu thập thành thiếu sót nhà hàng");
});

Deno.test("Biên tập giữ nguyên bản cần sửa làm đối chiếu và ưu tiên đính chính; không gửi lời xác nhận cũ", () => {
  const oldReport = "Description null. Menu trống. Hội An thuộc tỉnh Quảng Nam.";
  const prompt = buildPrompt({ profile: {}, currentAnalysis: oldReport, messages: [
    { role: "user", content: "Dùng địa giới mới" },
    { role: "model", content: "Đã cập nhật mọi nội dung theo yêu cầu" },
    { role: "user", content: "Viết lại cho chủ quán dễ hiểu và đánh giá Text Menu" },
  ] });
  contains(prompt, [oldReport, "Dùng địa giới mới", "YÊU CẦU HIỆN TẠI:\nViết lại cho chủ quán dễ hiểu và đánh giá Text Menu", "Thay nhận định sai, suy diễn và lời kỹ thuật trong bản cũ", "TOÀN BỘ báo cáo đã sửa"]);
  if (prompt.includes("Đã cập nhật mọi nội dung")) throw new Error("Tái dùng xác nhận chưa được kiểm chứng");
});
