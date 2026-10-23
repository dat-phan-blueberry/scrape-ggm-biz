import { buildPrompt, scoringScope } from "../src/lib/audit/audit.ts";
import { enrichmentEnabled, ENRICH_TIMEOUT_MS, fetchEnrichment, knowledgeGraphFacts, normalizeKgPosts, normalizeMenuHighlights, startDataIdCalls, verifiedKnowledgeGraph } from "../src/lib/enrich.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function contains(text: string, values: string[]) {
  for (const value of values) if (!text.includes(value)) throw new Error(`Thiếu: ${value}`);
}
function lacks(text: string, values: string[]) {
  for (const value of values) if (text.includes(value)) throw new Error(`Không được có: ${value}`);
}
const line = (prompt: string, key: string) => prompt.split("\n").find(l => l.startsWith(`${key}:`)) ?? "";
const pr = { title: "Bếp Mẹ Ỉn - Nguyễn Thái Bình", place_id: "ChIJ-dung", data_id: "0x1:0x2", data_cid: "4821895918633354167" };

Deno.test("Tiện ích Google ghi nhận là KHÔNG có không bị chấm như tiện ích quán có", () => {
  const prompt = buildPrompt({ profile: {
    extensions: [{ key: "dining_options", items: ["Ăn tại chỗ"] }],
    unsupported_extensions: [{ key: "accessibility", items: ["Lối vào cho xe lăn"] }],
  } });
  equal(line(prompt, "Tiện ích ghi nhận"), "Tiện ích ghi nhận: - Ăn tại chỗ");
  equal(line(prompt, "Tiện ích Google ghi nhận là KHÔNG có"), "Tiện ích Google ghi nhận là KHÔNG có: - Lối vào cho xe lăn");
});

Deno.test("Knowledge Graph chỉ được nhận khi place_id khớp đúng địa điểm", () => {
  equal(verifiedKnowledgeGraph({ knowledge_graph: { place_id: "ChIJ-chi-nhanh-khac", merchant_description: "x" } }, "ChIJ-dung").status, "mismatch");
  equal(verifiedKnowledgeGraph({}, "ChIJ-dung").status, "failed");
  equal(verifiedKnowledgeGraph({ knowledge_graph: { place_id: "ChIJ-dung" } }, "ChIJ-dung").status, "ok");
  const facts = knowledgeGraphFacts({
    merchant_description: "\"Vietnamese family style traditional restaurant.\"",
    links: { "Đặt_bàn": "https://www.google.com/maps/reserve/v/dine/c/abc" },
    reservation_providers: [{ name: "chope.co", link: "https://book.chope.co/booking?rid=1" }, { name: "x", link: "javascript:alert(1)" }],
    "tiểu_sử": [{ name: "Facebook", link: "https://www.facebook.com/BepMeIn" }],
    "các_lựa_chọn_dịch_vụ": ["Phòng ăn riêng tư"],
    price_details: { distribution: [{ price: "100.000-200.000 ₫", percentage: 18.6 }] },
  });
  equal(facts.merchant_description, "Vietnamese family style traditional restaurant.");
  equal(facts.booking_links.map(l => l.name), ["Đặt bàn qua Google", "Đặt bàn qua chope.co"]);
  equal(facts.social_links, [{ name: "Facebook", link: "https://www.facebook.com/BepMeIn" }]);
  equal(facts.service_options, ["Phòng ăn riêng tư"]);
  equal(facts.price_details?.distribution[0].reported_count, 0);
});

Deno.test("Bốn nguồn phụ chạy qua hàm search được truyền vào, có hạn thời gian; lỗi từng nguồn tách bạch", async () => {
  const calls: Array<{ engine: string | null; tag: string; timeout?: number }> = [];
  const search = async (params: URLSearchParams, tag: string, timeout?: number) => {
    calls.push({ engine: params.get("engine"), tag, timeout });
    if (params.get("api_key")) throw new Error("route không được tự gắn key");
    switch (params.get("engine")) {
      case "google": return { knowledge_graph: { place_id: "ChIJ-chi-nhanh-khac", merchant_description: "Sai quán" }, menu_highlights: [{ title: "Bún chả", photos: 3 }] };
      case "google_maps_reviews": return { reviews: [{ rating: 5, date: "1 ngày trước", iso_date: "2026-10-20T07:00:00Z", snippet: "Ngon", response: { date: "5 giờ trước", iso_date: "2026-10-21T05:00:00Z", snippet: "Cảm ơn bạn" } }] };
      case "google_maps_posts": throw new Error("Google hasn't returned any results for this query.");
      default: throw new Error("network error");
    }
  };
  const result = await fetchEnrichment(pr, search);
  // KG không khớp quán → thử lại bản tiếng Anh một lần, nên engine google được gọi 2 lần.
  equal(calls.map(c => c.engine).sort(), ["google", "google", "google_maps_photos", "google_maps_posts", "google_maps_reviews", "google_maps_reviews"]);
  equal(calls.every(c => c.timeout === ENRICH_TIMEOUT_MS), true);
  equal(result.status, { knowledge_graph: "mismatch", reviews: "ok", posts: "ok", photos: "failed", dishes: "failed" });
  equal(result.kg, null);
  equal(result.menu_highlights, []);
  equal(result.recent_reviews[0].response?.snippet, "Cảm ơn bạn");
  equal(result.posts, []);

  const noCid = await fetchEnrichment({ ...pr, data_cid: "" }, async () => ({}));
  equal(noCid.status.knowledge_graph, "skipped");
  equal(enrichmentEnabled(undefined), true);
  equal(enrichmentEnabled("0"), false);
  equal(enrichmentEnabled("false"), false);
});

Deno.test("Không lấy được phản hồi/bài đăng thì tiêu chí không chấm và bị loại khỏi điểm tối đa (D-0113)", () => {
  const prompt = buildPrompt({ profile: { title: "Quán cũ", enrichment: { knowledge_graph: "failed", reviews: "failed", posts: "failed", photos: "failed" } } });
  contains(prompt, [
    "Phản hồi của chủ quán với đánh giá: Không đánh giá — không lấy được đánh giá mới nhất và phản hồi của chủ quán.",
    "III.3. Tỷ Lệ & Tốc Độ Phản Hồi (7đ)",
    "Bài đăng cập nhật trên Google: Không đánh giá",
    "Nguồn và độ dài phần giới thiệu: Không đánh giá",
    "Tổng điểm tối đa được chấm: 34",
  ]);
  lacks(prompt, ["hưa thu thập", "Chưa ghi nhận"]);
  // Hồ sơ đã lưu trước bản này không có `enrichment`: cũng là không lấy được.
  contains(buildPrompt({ profile: { title: "Hồ sơ lưu cũ" } }), ["Phản hồi của chủ quán với đánh giá: Không đánh giá"]);
  const empty = buildPrompt({ profile: { enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok" }, posts: [] } });
  contains(empty, ["Bài đăng cập nhật trên Google: Không có bài đăng nào."]);
});

Deno.test("Phạm vi chấm: đủ nguồn + thực đơn từ danh sách món + tiện ích lẻ → loại Tiện ích, Text Menu và Q&A, tối đa 87", () => {
  const scope = scoringScope({ enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok" }, menu_origin: "google_dishes",
    menu: { categories: [{ title: "Món", items: [{ title: "Pad Thai" }] }] }, menu_highlights: [{ title: "Pad Thai", photos: 3 }], merchant_description: "x", types: ["Nhà hàng chay", "Nhà hàng Việt Nam"] });
  equal(scope.excluded.map(e => `${e.pillar}.${e.name}`), ["I.5. Tiện Ích Thuộc Tính", "II.2. Số Hóa Menu - Text Menu"]);
  equal(scope.maxByPillar, { I: 17, II: 13, III: 25, IV: 15, V: 17 });
  equal(scope.total, 87);
  // Có nhóm tiện ích chính (vd dining_options) thì vẫn chấm I.5.
  equal(scoringScope({ extensions: [{ key: "dining_options", items: ["Ăn tại chỗ"] }] }).excluded.some(e => e.name.startsWith("5. Tiện Ích")), false);
});

Deno.test("Mẫu đánh giá mới nhất: tỷ lệ phản hồi, thời gian phản hồi, độ mới bài đăng và mô tả doanh nghiệp", () => {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const review = (rating: number, days: number, reply?: string) => ({ rating, date: "", iso_date: at(days), snippet: `Khách ${rating} sao`,
    response: reply ? { date: "", iso_date: new Date(Date.parse(at(days)) + 6 * 3_600_000).toISOString(), snippet: reply } : null });
  const prompt = buildPrompt({ profile: {
    enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok" },
    merchant_description: "Bữa cơm gia đình Việt",
    // Review 1 ngày tuổi không tính tỷ lệ (chủ quán chưa đủ thời gian) nhưng vẫn tính tốc độ và ví dụ phản hồi.
    recent_reviews: [review(5, 1, "Cảm ơn anh"), review(1, 4), review(2, 1)],
    relevant_reviews: [review(4, 80, "Cảm ơn chị")],
    posts: [{ iso_date: "2025-03-19T06:41:03Z", date: "Mar 19, 2025", snippet: "Món mới", link: "", has_image: true }],
    photo_categories: ["Thực đơn", "Bầu không khí"],
  } });
  contains(prompt, [
    "Số đánh giá được chủ quán phản hồi: 1/2 (chỉ tính đánh giá đã đăng từ 3 ngày trở lên)",
    "Đánh giá 1–2★ trong mẫu: 0/1 đã được phản hồi",
    "và 1 đánh giá nổi bật",
    "Thời gian phản hồi trung vị: khoảng 6 giờ",
    "Chủ quán trả lời: Cảm ơn anh",
    "Bài gần nhất: 19/03/2025",
    "Số bài trong 60 ngày gần nhất: 0",
    "Giới thiệu của nhà hàng: Bữa cơm gia đình Việt",
    "Doanh nghiệp tự viết",
    "21 ký tự",
    "Danh mục album ảnh trên Google Maps: - Thực đơn",
    "Quản lý hồ sơ: Chủ quán đang trả lời đánh giá",
  ]);
});

Deno.test("Link thực đơn ngoài không mâu thuẫn với dòng liên kết thực đơn và không lẫn link đặt món", () => {
  const prompt = buildPrompt({ profile: {
    menu_links: [{ name: "online.pubhtml5.com", link: "https://online.pubhtml5.com/rkxr/kneb/" }],
    booking_links: [{ name: "Đặt món trực tuyến", link: "https://www.google.com/searchviewer/42" }],
  } });
  contains(prompt, ["Liên kết thực đơn: https://online.pubhtml5.com/rkxr/kneb/"]);
  lacks(prompt.split("<ho_so>")[0], ["searchviewer"]);
});

Deno.test("Review sửa lại dùng mốc sửa gần nhất để tính độ mới", async () => {
  const result = await fetchEnrichment(pr, async (params: URLSearchParams) => params.get("engine") === "google_maps_reviews"
    ? { reviews: [{ rating: 4, iso_date: "2018-05-31T13:43:10Z", iso_date_of_last_edit: "2026-10-17T00:00:00Z", snippet: "Sửa lại" }] } : {});
  equal(result.recent_reviews[0].iso_date, "2026-10-17T00:00:00Z");
});

Deno.test("Thực đơn dựng từ danh sách món Google: đếm món có giá, mô tả không chấm chứ không đếm 0", () => {
  const prompt = buildPrompt({ profile: {
    menu_origin: "google_dishes",
    menu: { categories: [{ title: "Món trên Google Maps", items: [{ title: "Pad Thai", price: "82.000 ₫", description: "" }, { title: "Sương Sâm", price: "", description: "" }] }], highlights: [] },
    menu_highlights: [{ title: "Pad Thai", photos: 36, reviews: 0, thumbnail: "" }],
  } });
  contains(prompt, ["Google Maps hiển thị 2 món có tên dạng chữ", "Số món có tên: 2", "Số món có giá: 1", "II.3. Minh Bạch Bảng Giá: 2/4đ — chỉ 1/2 món có giá.", "Số món có mô tả: Không đánh giá — Google không trả mô tả từng món.", "Số món có ảnh thực tế: 1/1", "Tên món: Pad Thai", "Pad Thai (36 ảnh)"]);
  lacks(prompt, ["Số món có mô tả: 0"]);
});

Deno.test("Điểm tính sẵn theo barem: sao, bài đăng >60 ngày, phản hồi, ảnh món, mô tả ngắn", () => {
  const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 + hours * 3_600_000).toISOString();
  const reply = (days: number, afterHours: number) => ({ rating: 5, iso_date: ago(days), snippet: "Ngon", response: { iso_date: ago(days, afterHours), snippet: "Cảm ơn" } });
  const prompt = buildPrompt({ profile: {
    enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok" },
    rating: 4.6, reviews_count: 5012,
    recent_reviews: [reply(3, 20), reply(5, 30), reply(9, 40), { rating: 1, iso_date: ago(12), snippet: "Tệ", response: null }],
    posts: [{ iso_date: ago(88), date: "", snippet: "Món mới", link: "", has_image: true }],
    menu_highlights: [{ title: "Pad Thai", photos: 36 }, { title: "Sương Sâm", photos: 0 }, { title: "Green Curry", photos: 1 }],
    description: "Quán chay nhỏ.",
  } });
  contains(prompt, [
    "III.1. Điểm Đánh Giá Trung Bình: 6/6đ — 4.6★.",
    "III.3. Tỷ Lệ & Tốc Độ Phản Hồi: 2/7đ — chủ quán phản hồi 3/4 đánh giá đã đăng từ 3 ngày trở lên",
    "bỏ trống 1 đánh giá 1–2★",
    "V.1. Tần Suất Đăng Bài Cập Nhật: 0/4đ — bài gần nhất cách đây 88 ngày (cũ hơn 60 ngày).",
    "II.4. Hình Đại Diện Từng Món Ăn: 4/4đ — 2/3 món có ảnh thực tế.",
    "V.3. Giới Thiệu Doanh Nghiệp: 3/6đ — phần giới thiệu chỉ 14 ký tự (dưới 100).",
  ]);
  // Tiêu chí đã bị loại (không lấy được bài đăng) thì không được có điểm tính sẵn.
  lacks(buildPrompt({ profile: { enrichment: { posts: "failed" }, posts: [] } }), ["V.1. Tần Suất Đăng Bài Cập Nhật: 0/4đ"]);
});

Deno.test("Khối món của Google lúc có lúc không: thử lại bản tiếng Anh; vẫn không có thì 3 tiêu chí menu không chấm", async () => {
  const kg = { knowledge_graph: { place_id: "ChIJ-dung", merchant_description: "Quán chay" } };
  const calls: string[] = [];
  const found = await fetchEnrichment(pr, async (params: URLSearchParams, tag: string) => {
    calls.push(tag);
    if (tag === "enrich-kg") return kg;
    if (tag === "enrich-kg-en") return { ...kg, menu_highlights: [{ title: "Pad Thai", photos: 36 }] };
    return {};
  });
  equal(calls.filter(t => t.startsWith("enrich-kg")), ["enrich-kg", "enrich-kg-en"]);
  equal(found.status.dishes, "ok");
  equal(found.menu_highlights.map(d => d.title), ["Pad Thai"]);

  const missing = await fetchEnrichment(pr, async (_p: URLSearchParams, tag: string) => tag.startsWith("enrich-kg") ? kg : {});
  equal(missing.status, { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok", dishes: "failed" });
  const scope = scoringScope({ enrichment: missing.status, merchant_description: "Quán chay", types: ["Nhà hàng chay"] });
  equal(scope.excluded.map(e => `${e.pillar}.${e.name}`), ["I.5. Tiện Ích Thuộc Tính", "II.2. Số Hóa Menu - Text Menu", "II.3. Minh Bạch Bảng Giá", "II.4. Hình Đại Diện Từng Món Ăn"]);
  contains(buildPrompt({ profile: { enrichment: missing.status } }), ["Tình trạng: Không đánh giá — không lấy được danh sách món."]);
});

Deno.test("Hết ngân sách thời gian thì không thử lại khối món (giữ route dưới giới hạn 10s của Netlify)", async () => {
  const tags: string[] = [];
  const kg = { knowledge_graph: { place_id: "ChIJ-dung" } };
  const result = await fetchEnrichment(pr, async (_p: URLSearchParams, tag: string) => { tags.push(tag); return tag === "enrich-kg" ? kg : {}; }, undefined, Date.now() - 7_000);
  equal(tags.includes("enrich-kg-en"), false);
  equal(result.status.dishes, "failed");
});

Deno.test("Ba nguồn theo data_id được khởi động sớm và dùng lại, không gọi hai lần", async () => {
  const tags: string[] = [];
  const search = async (_p: URLSearchParams, tag: string) => { tags.push(tag); return {}; };
  const early = startDataIdCalls("0x1:0x2", search);
  await fetchEnrichment(pr, search, early);
  equal(tags.filter(t => t === "enrich-reviews").length, 1);
  equal(tags.filter(t => t === "enrich-posts").length, 1);
  equal(tags.filter(t => t === "enrich-photos").length, 1);
});

Deno.test("Giá từng món lấy từ price_range; món không niêm yết giá để trống", () => {
  const dishes = normalizeMenuHighlights([
    { title: "Creamy Mushroom Soup", price_range: [82000, 82000], photos: 27 },
    { title: "Combo", price_range: [150000, 250000] },
    { title: "Mushrooms Pizza", photos: 1 },
  ]);
  equal(dishes.map(d => d.price), ["82.000 ₫", "150.000 ₫ – 250.000 ₫", ""]);
});

Deno.test("Engine bài đăng lỗi thì dùng bài đăng trong Knowledge Graph (ngày dạng 8 thg 10, 2026)", async () => {
  equal(normalizeKgPosts([{ date: "8 thg 10, 2026", description: "Lẩu mắm", media: "https://x.test/a.jpg" }])[0].iso_date, "2026-10-08T00:00:00.000Z");
  const kg = { knowledge_graph: { place_id: "ChIJ-dung", posts: [{ date: "3 thg 9, 2026", description: "Món mới", media: "https://x.test/b.jpg" }] }, menu_highlights: [{ title: "Lẩu mắm" }] };
  const result = await fetchEnrichment(pr, async (params: URLSearchParams) => {
    if (params.get("engine") === "google") return kg;
    if (params.get("engine") === "google_maps_posts") throw new Error("Failed to retrieve Google Maps Posts results.");
    return {};
  });
  equal(result.status.posts, "ok");
  equal(result.posts.map(p => p.snippet), ["Món mới"]);
});

Deno.test("Không thấy Knowledge Graph (Google trả AI Overview) thì thử lại bản tiếng Anh", async () => {
  const tags: string[] = [];
  const result = await fetchEnrichment(pr, async (_p: URLSearchParams, tag: string) => {
    tags.push(tag);
    if (tag === "enrich-kg") return { ai_overview: {} };
    if (tag === "enrich-kg-en") return { knowledge_graph: { place_id: "ChIJ-dung", merchant_description: "Quán" }, menu_highlights: [{ title: "Cơm" }] };
    return {};
  });
  equal(tags.includes("enrich-kg-en"), true);
  equal(result.status.knowledge_graph, "ok");
  equal(result.kg?.merchant_description, "Quán");
  equal(result.menu_highlights.length, 1);
});

Deno.test("Mọi review lấy được đều mới đăng dưới 3 ngày thì không chấm tỷ lệ/chất lượng phản hồi, không trừ 13đ", () => {
  const fresh = (h: number) => ({ rating: 5, iso_date: new Date(Date.now() - h * 3_600_000).toISOString(), snippet: "Ngon", response: null });
  const profile = { enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok", dishes: "ok" }, recent_reviews: [fresh(2), fresh(20), fresh(30)] };
  const names = scoringScope(profile).excluded.map(e => `${e.pillar}.${e.name}`);
  equal(names.includes("III.3. Tỷ Lệ & Tốc Độ Phản Hồi") && names.includes("III.4. Chất Lượng Nội Dung Phản Hồi"), true);
  const prompt = buildPrompt({ profile });
  lacks(prompt, ["III.3. Tỷ Lệ & Tốc Độ Phản Hồi: 0/7đ"]);
  contains(prompt, ["Số đánh giá được chủ quán phản hồi: Không đánh giá — các đánh giá lấy được đều mới đăng dưới 3 ngày."]);
});

Deno.test("Điểm tính sẵn: danh mục chỉ 1 mục, ảnh đại diện, album Bầu không khí, ảnh khách đăng", () => {
  const prompt = buildPrompt({ profile: {
    enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok", dishes: "ok" },
    types: ["Nhà hàng Việt Nam"], thumbnail: "https://x.test/t.jpg",
    photo_categories: ["Thực đơn", "Bầu không khí", "Của chủ sở hữu"],
    user_reviews: [{ rating: 5, description: "Ngon", images: ["https://x.test/a.jpg"] }],
  } });
  contains(prompt, [
    'II.1. Danh Mục: 2/5đ — có danh mục chính "Nhà hàng Việt Nam" nhưng không có danh mục phụ.',
    "IV.1. Ảnh Đại Diện & Ảnh Bìa: 4/4đ — hồ sơ có ảnh đại diện.",
    "IV.2. Hình Ảnh Không Gian: 6/6đ — hồ sơ có album ảnh Bầu không khí.",
    "IV.3. Tỷ Lệ Ảnh Khách Đăng - UGC: 5/5đ — 1 đánh giá mẫu có ảnh do khách đăng.",
  ]);
  // Không lấy được danh mục thì không chấm (Google luôn có danh mục chính).
  equal(scoringScope({ types: [] }).excluded.some(e => e.name === "1. Danh Mục"), true);
});

Deno.test("Không ra KG theo ludocid thì tra theo kgmid (provider_id) của Maps", async () => {
  const seen: Array<{ tag: string; kgmid: string | null }> = [];
  const result = await fetchEnrichment({ ...pr, provider_id: "/g/11ysx9s4bp" }, async (p: URLSearchParams, tag: string) => {
    seen.push({ tag, kgmid: p.get("kgmid") });
    if (tag === "enrich-kg") return { ai_overview: {} };
    if (tag === "enrich-kg-kgmid") return { knowledge_graph: { place_id: "ChIJ-dung", merchant_description: "Ẩm thực lai Á" } };
    return {};
  });
  equal(seen.find(s => s.tag === "enrich-kg-kgmid")?.kgmid, "/g/11ysx9s4bp");
  equal(result.status.knowledge_graph, "ok");
  equal(result.kg?.merchant_description, "Ẩm thực lai Á");
});
