// Supabase Edge Function: ai-analysis
// Stream SSE kiểu GPT. Chạy trên Deno (Supabase) -> KHÔNG bị nén/buffer
// text/event-stream như Netlify edge, nên streaming thật hoạt động ổn định.
//
// Deploy:
//   supabase secrets set GOOGLE_AI_STUDIO_API_KEY=xxxxx
//   supabase functions deploy ai-analysis --no-verify-jwt
//
// Gọi từ frontend: POST https://<project-ref>.supabase.co/functions/v1/ai-analysis
//   body: { "profile": { ... } }

// Chuỗi dự phòng: ưu tiên gemini-flash-latest theo yêu cầu, kèm gemini-3.5-flash dự phòng
const MODELS = ["gemini-flash-latest", "gemini-3.5-flash"];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // đổi thành domain của bạn nếu muốn siết
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function cleanBusinessReportText(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(
    /(?:(?:quán\s+)?(?:hiện\s+)?(?:có\s+)?)?(?:chỉ\s+số|trường|thuộc\s+tính)?\s*has_text_menu:\s*(?:false|true)\s*(?:và|,)?\s*(?:(?:chỉ\s+số|trường|thuộc\s+tính)\s*)?(?:số\s+lượng\s+món\s+)?text_menu_items_count:\s*\d+/gi,
    "quán hiện chưa cập nhật thực đơn dạng văn bản trực tiếp trên Google Maps"
  );
  s = s.replace(/has_text_menu:\s*false/gi, "chưa có thực đơn dạng chữ");
  s = s.replace(/has_text_menu:\s*true/gi, "đã có thực đơn dạng chữ");
  s = s.replace(/text_menu_items_count:\s*0/gi, "chưa có món ăn nào dạng chữ");
  s = s.replace(/text_menu_items_count:\s*(\d+)/gi, "$1 món dạng chữ");
  s = s.replace(/has_photo_menu_highlights:\s*(?:false|true)/gi, "");
  s = s.replace(/menu_seo_status/gi, "thực đơn");
  s = s.replace(/\b(?:chỉ số|trường|thuộc tính)\s+([a-zA-Z0-9_]+)\s*:\s*(?:null|false|undefined)\b/gi, "chưa bổ sung $1");
  s = s.replace(/\b(?:chỉ số|trường|thuộc tính)\s+([a-zA-Z0-9_]+)\s*:\s*true\b/gi, "đã thiết lập $1");
  s = s.replace(/\b([a-zA-Z0-9_]+):\s*null\b/gi, "chưa có $1");
  s = s.replace(/\bclaim_this_business\b/gi, "xác minh chủ sở hữu quán");
  s = s.replace(/\boperating_hours\b/gi, "giờ mở cửa");
  s = s.replace(/\buser_reviews\b/gi, "đánh giá của khách hàng");
  s = s.replace(/\bsimilar_places\b/gi, "địa điểm tương tự");
  s = s.replace(/\bgps_coordinates\b/gi, "tọa độ vị trí");
  return s;
}

/** Bỏ các trường ảnh/URL dài không có giá trị phân tích để prompt gọn hơn */
function slimProfile(profile: any) {
  const { images, thumbnail, user_reviews, menu, similar_places, data_id, place_id, gps_coordinates, ...rest } = profile ?? {};

  const categories = menu?.categories || [];
  const textMenuItemsCount = categories.reduce(
    (acc: number, c: any) => acc + (Array.isArray(c.items) ? c.items.length : 0),
    0
  );
  const hasTextMenu = textMenuItemsCount > 0;
  const highlights = menu?.highlights || [];
  const hasPhotoMenuHighlights = highlights.length > 0;

  let thucDonHienTai = "";
  if (hasTextMenu) {
    thucDonHienTai = `Đã có thực đơn dạng văn bản trực tiếp trên Google Maps (${textMenuItemsCount} món ăn dạng chữ). Khách tìm tên món ăn có thể được Google dẫn tới quán.`;
  } else if (hasPhotoMenuHighlights) {
    thucDonHienTai = "Chỉ có ảnh chụp thực đơn do khách hoặc quán tải lên; chưa có thực đơn dạng chữ trực tiếp trên Google Maps. Google không thể đọc chữ trong ảnh để lập chỉ mục tìm kiếm món ăn.";
  } else {
    thucDonHienTai = "Chưa có thông tin thực đơn (cả ảnh lẫn dạng chữ) trên hồ sơ Google Maps.";
  }

  return {
    ...rest,
    tinh_trang_thuc_don: thucDonHienTai,
    so_luong_mon_dang_chu: textMenuItemsCount,
    menu: menu
      ? {
          highlights: highlights.map((h: any) => h.title),
          categories: categories.map((c: any) => ({
            title: c.title,
            items: (c.items || []).map((it: any) => ({
              title: it.title,
              price: it.price,
              description: it.description || undefined,
            })),
          })),
        }
      : null,
    user_reviews: (user_reviews || []).map((r: any) => ({
      rating: r.rating,
      date: r.date,
      description: r.description,
    })),
    similar_places: (similar_places || []).map((s: any) => ({
      title: s.title,
      rating: s.rating,
      reviews: s.reviews,
    })),
  };
}

function buildPrompt(
  profile: unknown,
  currentAnalysis?: string,
  messages?: Array<{ role: string; content: string }>
): string {
  const slim = slimProfile(profile);

  const baseInstructions = `Bạn là chuyên gia tư vấn marketing địa phương (local SEO / Google Maps) cho ngành F&B tại Việt Nam. Hãy thẩm định hồ sơ Google Maps và đưa ra nhận xét sắc bén, dựa trên số liệu thực tế.

=== NGUYÊN TẮC BẮT BUỘC: VĂN PHONG TƯ VẤN KINH DOANH CHO CHỦ NHÀ HÀNG (CẤM TUYỆT ĐỐI DÙNG CODE): ===
- Báo cáo này là TÀI LIỆU TƯ VẤN KINH DOANH CHUYÊN NGHIỆP ĐƯỢC IN RA GIẤY ĐỂ GỬI TRỰC TIẾP CHO CHỦ NHÀ HÀNG HOẶC QUẢN LÝ QUÁN ĂN (họ là người làm kinh doanh ẩm thực, KHÔNG PHẢI lập trình viên hay dân kỹ thuật máy tính).
- CẤM TUYỆT ĐỐI đưa bất kỳ từ ngữ kỹ thuật lập trình, tên biến trong code, tên trường dữ liệu JSON hay cú pháp máy tính vào bài viết:
  * CẤM DÙNG các tên biến kỹ thuật: "has_text_menu", "text_menu_items_count", "has_photo_menu_highlights", "menu_seo_status", "tinh_trang_thuc_don", "data_id", "place_id", "operating_hours", "user_reviews", "claim_this_business", v.v.
  * CẤM DÙNG các giá trị code: "true", "false", "null", "undefined", "boolean", "JSON", "array", "chỉ số has_...", "trường dữ liệu", "biến", "database", "API", v.v.
- MỌI nhận định phải diễn đạt 100% bằng ngôn ngữ tư vấn kinh doanh tiếp thị ẩm thực tự nhiên, chuẩn mực và thuyết phục:
  * SAI HOÀN TOÀN: "Quán hiện có chỉ số has_text_menu: false và text_menu_items_count: 0"
  * ĐÚNG CHUẨN MỰC: "Quán hiện chưa cập nhật thực đơn dạng văn bản trực tiếp trên Google Maps (mới chỉ có hình ảnh chụp menu do thực khách tải lên). Điều này khiến Google không thể lập chỉ mục tên từng món ăn và mức giá để tiếp cận khách hàng tìm kiếm món quanh khu vực."
  * SAI HOÀN TOÀN: "Trường website hiện là null, phone: null, status: false"
  * ĐÚNG CHUẨN MỰC: "Quán chưa thiết lập trang web chính thức, thiếu số điện thoại liên hệ trực tiếp và chưa xác minh quyền sở hữu hồ sơ (Claim) trên Google Maps."

=== NGUYÊN TẮC ĐỊA GIỚI HÀNH CHÍNH VIỆT NAM (SẮP XẾP/SÁP NHẬP ĐƠN VỊ HÀNH CHÍNH): ===
1. Việt Nam đã và đang sắp xếp, sáp nhập nhiều đơn vị hành chính cấp huyện, xã (2023–2025/2026).
   Ví dụ: TP. Thủ Đức thuộc TP.HCM (sáp nhập từ Quận 2, Quận 9, Quận Thủ Đức); nhiều phường/xã tại Hà Nội, TP.HCM, Hải Phòng, Đà Nẵng, Quảng Ninh, Bình Dương... đã sáp nhập hoặc đổi tên mới.
2. Google Maps có thể hiển thị địa chỉ theo tên hành chính mới hoặc cũ tùy theo thời điểm cập nhật.
3. BẮT BUỘC: KHÔNG phán xét địa chỉ là "sai" hay "lỗi thời" khi quán ghi theo đơn vị hành chính mới (như TP. Thủ Đức, tên phường mới) hoặc tên cũ. Chỉ nhận xét nếu địa chỉ thiếu hẳn số nhà, tên đường hoặc thiếu tỉnh/thành phố.

=== TIÊU CHÍ ĐÁNH GIÁ THỰC ĐƠN (TEXT MENU vs PHOTO MENU - QUAN TRỌNG CHO LOCAL SEO): ===
- Quan sát tình trạng thực đơn của quán:
  * Nếu quán CHƯA CÓ THỰC ĐƠN DẠNG CHỮ TRỰC TIẾP (chỉ có ảnh menu hoặc chưa có menu):
    + BẮT BUỘC chỉ rõ trong "Điểm yếu & thiếu sót": Quán đang thiếu thực đơn dạng văn bản (Text Menu trực tiếp trên Google Maps). Tuyệt đối diễn đạt bằng ngôn ngữ kinh doanh tự nhiên, không nhắc đến bất kỳ tên biến code hay chỉ số lập trình nào.
    + Nêu rõ hậu quả: Google Search và Google Maps không thể quét và lập chỉ mục được tên các món ăn và giá trong hình ảnh menu -> Bỏ lỡ lượng lớn khách hàng tiềm năng tìm kiếm món ăn quanh khu vực; ảnh menu xem trên điện thoại dễ bị mờ, khó đọc giá.
    + BẮT BUỘC đưa vào "Khuyến nghị hành động": Đưa giải pháp tạo Structured Text Menu (nhập danh mục món, giá, mô tả món trực tiếp trên Google Business Profile) lên ưu tiên hàng đầu.
  * Nếu quán ĐÃ CÓ THỰC ĐƠN DẠNG CHỮ: Đánh giá cao đây là điểm mạnh SEO nổi bật, khuyến khích cập nhật định kỳ giá và bổ sung mô tả món.

=== KHUNG CHẤM ĐIỂM CHUẨN THANG 10 (RUBRIC - TỐI ĐA 10.0 ĐIỂM): ===
Điểm cạnh tranh là tổng điểm của 5 tiêu chí sau (thang 1.0 đến 10.0):
1. Cơ bản & Xác thực (Tối đa 2.0đ): Tên chuẩn SEO, địa chỉ rõ ràng, số điện thoại, giờ mở cửa, website, trạng thái đã xác minh chủ quán (chưa claim: 0đ).
2. Đánh giá & Uy tín (Tối đa 2.5đ): Điểm rating trung bình (>4.0), số lượng review, mật độ tương tác phản hồi review.
3. Hình ảnh & Trực quan (Tối đa 2.0đ): Ảnh đại diện, không gian quán, món ăn hấp dẫn, cập nhật thường xuyên.
4. Thực đơn & Giá cả (Tối đa 2.0đ): ĐÃ CÓ TEXT MENU CHÍNH THỨC (1.5đ), có khoảng giá (0.5đ). Nếu CHỈ CÓ ẢNH MENU hoặc thiếu menu: tiêu chí này tối đa 0.5đ.
5. Chuyển đổi & Tiện ích (Tối đa 1.5đ): Có link Đặt bàn (Reserve with Google / link đặt bàn), đầy đủ thông tin tiện ích.

RÀNG BUỘC CHẤM ĐIỂM NGHIÊM NGẶT:
- Điểm cạnh tranh PHẢI nằm trong khoảng từ 1.0 đến 10.0 (TUYỆT ĐỐI KHÔNG vượt quá 10.0, KHÔNG dùng thang điểm 100, KHÔNG ghi 100/10 hay 85/10).
- Định dạng bắt buộc: "## Điểm cạnh tranh: X.X/10" hoặc "## Điểm cạnh tranh: X/10" kèm 1-2 câu giải thích cụ thể theo rubric trên.

=== CẤU TRÚC BÁO CÁO CHUẨN (MARKDOWN TIẾNG VIỆT): ===
## Đánh giá tổng quan
(2-3 câu về sức khỏe hiện diện online và năng lực cạnh tranh trên Google Maps)

## Điểm mạnh
(gạch đầu dòng, dẫn số liệu và dữ liệu cụ thể từ hồ sơ)

## Điểm yếu & thiếu sót
(gạch đầu dòng, chỉ ra các nội dung còn thiếu, đặc biệt là tình trạng Text Menu và khả năng SEO)

## Khuyến nghị hành động
(đánh số theo thứ tự ưu tiên 1, 2, 3..., mỗi mục nêu việc cần làm cụ thể và tác động)

## Điểm cạnh tranh: X/10
(1-2 câu giải thích ngắn gọn, đúng thang điểm 10 dựa trên rubric)`;

  if (!messages || messages.length === 0) {
    return `${baseInstructions}

Dữ liệu hồ sơ doanh nghiệp:
${JSON.stringify(slim, null, 2)}

Hãy phân tích và trả về bản báo cáo hoàn chỉnh theo đúng cấu trúc trên. Viết súc tích, chuyên nghiệp, dựa trên số liệu thực tế.`;
  }

  const conversationHistory = messages
    .map(
      (m, idx) =>
        `[Lượt ${idx + 1} - ${m.role === "user" ? "YÊU CẦU / QUYẾT ĐỊNH CỦA KHÁCH" : "PHẢN HỒI CỦA CHUYÊN GIA AI"}]:\n${m.content}`
    )
    .join("\n\n---\n\n");

  return `${baseInstructions}

Dữ liệu hồ sơ doanh nghiệp (Google Maps):
${JSON.stringify(slim, null, 2)}

Bản báo cáo thẩm định đang áp dụng:
${currentAnalysis || "(Chưa có)"}

=== BỘ NHỚ LỊCH SỬ CHỈNH SỬA & CÁC QUYẾT ĐỊNH (DECISIONS) CỦA KHÁCH HÀNG: ===
${conversationHistory}

=== NGUYÊN TẮC BẮT BUỘC VỀ BỘ NHỚ QUYẾT ĐỊNH (DECISION MEMORY): ===
1. Toàn bộ lịch sử trên ghi lại tiến trình trao đổi, chỉnh sửa và các quyết định cụ thể của khách hàng cho nhà hàng này.
2. BẠN PHẢI GHI NHỚ VÀ KẾ THỪA: Mọi quyết định trước đó của khách hàng (ví dụ: đã sửa điểm số lên mức nào, xác nhận bổ sung món ăn gì, sửa đổi chiến lược marketing, giữ lại hoặc bỏ bớt tiêu chí nào) ĐỀU PHẢI ĐƯỢC BẢO LƯU trong bản báo cáo mới, không được tự ý quay về nhận định ban đầu.
3. Khi khách hàng đặt câu hỏi hoặc yêu cầu chỉnh sửa tiếp:
   - Trong [PHẢN HỒI CHAT]: Trả lời trực tiếp, rõ ràng, thể hiện bạn đã nhớ rõ các quyết định trước đó của khách.
   - Trong [BẢN BÁO CÁO CẬP NHẬT]: Xuất toàn bộ bản báo cáo mới nhất (đầy đủ 5 mục chuẩn markdown) tích hợp yêu cầu mới của lượt này VÀ duy trì các quyết định cũ của khách. Nếu khách chỉ hỏi giải đáp thông tin mà không yêu cầu sửa báo cáo, hãy ghi "GIỮ NGUYÊN".

BẮT BUỘC TRẢ LỜI THEO ĐÚNG CẤU TRÚC PHÂN TÁCH SAU:
=== PHẢN HỒI CHAT ===
(Câu trả lời trực tiếp cho người dùng, giải đáp thắc mắc hoặc thông báo điểm đã chỉnh sửa theo quyết định của khách)

=== BẢN BÁO CÁO CẬP NHẬT ===
(Toàn bộ bản báo cáo mới đầy đủ 5 mục markdown tích hợp đầy đủ các quyết định từ trước đến nay, HOẶC ghi "GIỮ NGUYÊN" nếu chỉ trả lời thắc mắc)`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Chưa cấu hình GOOGLE_AI_STUDIO_API_KEY (supabase secrets)" }, 500);
  }

  let profile: unknown;
  let currentAnalysis: string | undefined;
  let messages: Array<{ role: string; content: string }> | undefined;

  try {
    const body = await req.json();
    profile = body?.profile;
    currentAnalysis = typeof body?.currentAnalysis === "string" ? body.currentAnalysis : undefined;
    messages = Array.isArray(body?.messages) ? body.messages : undefined;
  } catch {
    return jsonResponse({ error: "Body không hợp lệ" }, 400);
  }
  if (!profile) return jsonResponse({ error: "Thiếu dữ liệu hồ sơ" }, 400);

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(profile, currentAnalysis, messages) }] }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 8192,
      // KHÔNG tắt thinking ở đây: Supabase stream được + gửi ": ping"
      // keepalive lúc model suy nghĩ nên không bị timeout như Netlify.
      // Để mặc định (thinking bật) -> phục hồi chất lượng phân tích.
    },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Protocol SSE gửi về client:
      //   : ping           -> keepalive (client bỏ qua)
      //   data: {"text"}   -> một đoạn nội dung
      //   data: {"error"}  -> lỗi
      //   data: [DONE]     -> kết thúc
      const sendData = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const ping = () => controller.enqueue(encoder.encode(`: ping\n\n`));

      ping(); // mở kết nối ngay

      let sentAny = false;
      let lastStatus = 500;

      for (const model of MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          });

          if (!res.ok || !res.body) {
            lastStatus = res.status;
            const errText = await res.text().catch(() => "");
            console.error(`[ai-analysis] ${model} error:`, res.status, errText.slice(0, 300));
            continue; // thử model kế tiếp (chưa gửi text nên an toàn)
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload);
                const parts = json.candidates?.[0]?.content?.parts || [];
                for (const p of parts) {
                  if (typeof p.text === "string" && !p.thought) {
                    sendData({ text: cleanBusinessReportText(p.text) });
                    sentAny = true;
                  } else {
                    ping(); // thinking/chunk rỗng -> keepalive
                  }
                }
              } catch {
                /* chunk chưa hoàn chỉnh -> bỏ qua */
              }
            }
          }

          if (sentAny) break;
          lastStatus = 502; // stream ok nhưng rỗng -> thử model kế tiếp
        } catch (e) {
          console.error(`[ai-analysis] ${model} stream failed:`, e);
          if (sentAny) break; // đã stream dở -> dừng, tránh trùng nội dung
          lastStatus = 500;
        }
      }

      if (!sentAny) {
        sendData({ error: `Dịch vụ phân tích đang quá tải (${lastStatus}). Thử lại sau ít phút.` });
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
