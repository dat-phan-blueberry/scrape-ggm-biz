import { NextRequest, NextResponse } from "next/server";

// Stream token-by-token (kiểu GPT) để tránh "Inactivity Timeout" của proxy:
// luôn có byte chảy về client trong suốt quá trình sinh nội dung.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// gemini-3.1-pro-preview không khả dụng ở free tier (limit = 0, luôn 429).
// Dùng chuỗi dự phòng: model đầu quá tải (503/429) thì tự chuyển model sau.
const MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-flash-latest"];

/** Bỏ các trường ảnh/URL dài không có giá trị phân tích để prompt gọn hơn */
function slimProfile(profile: any) {
  const {
    images,
    thumbnail,
    user_reviews,
    menu,
    similar_places,
    ...rest
  } = profile ?? {};
  return {
    ...rest,
    menu: menu
      ? {
          highlights: (menu.highlights || []).map((h: any) => h.title),
          categories: (menu.categories || []).map((c: any) => ({
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình dịch vụ phân tích (.env)" }, { status: 500 });
  }

  let profile: unknown;
  try {
    const body = await request.json();
    profile = body.profile;
    if (!profile) {
      return NextResponse.json({ error: "Thiếu dữ liệu hồ sơ" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const prompt = `Bạn là chuyên gia tư vấn marketing địa phương (local SEO / Google Maps) cho ngành F&B tại Việt Nam. Hãy thẩm định hồ sơ Google Maps dưới đây và đưa ra nhận xét chuyên nghiệp, đi thẳng vào dữ liệu.

Dữ liệu hồ sơ doanh nghiệp:
${JSON.stringify(slimProfile(profile), null, 2)}

Trả lời bằng TIẾNG VIỆT, dùng markdown với đúng các mục sau:

## Đánh giá tổng quan
(2-3 câu về sức khỏe hiện diện online của doanh nghiệp)

## Điểm mạnh
(gạch đầu dòng, dẫn số liệu cụ thể từ hồ sơ)

## Điểm yếu & thiếu sót
(gạch đầu dòng, chỉ ra trường dữ liệu còn thiếu hoặc chưa tối ưu)

## Khuyến nghị hành động
(đánh số theo thứ tự ưu tiên, mỗi mục nêu việc cần làm cụ thể)

## Điểm cạnh tranh: X/10
(1-2 câu giải thích ngắn)

Viết súc tích, dựa trên số liệu, không chung chung.`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 8192,
      // TẮT thinking: model trả chữ gần như tức thì thay vì "suy nghĩ" hàng
      // chục giây. Nhờ vậy request hoàn tất trong ~5s -> không còn dính
      // "Inactivity Timeout" của proxy Netlify (chỉ nổ khi im lặng quá lâu).
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  // Ghi chú: KHÔNG stream SSE về client nữa. Netlify edge nén Brotli
  // (content-encoding: br) và buffer luôn text/event-stream, nuốt mất các
  // chunk sau -> client chỉ nhận được ": ping". Header no-transform không
  // được tôn trọng. Vì thinking đã tắt, gọi non-stream trả JSON nhanh & ổn
  // định; hiệu ứng "gõ chữ kiểu GPT" được xử lý ở phía client.
  let lastStatus = 500;
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`[ai-analysis] ${model} error:`, res.status, data?.error?.message);
        lastStatus = res.status;
        // quá tải / hết hạn mức -> thử model kế tiếp
        if (res.status === 503 || res.status === 429 || res.status === 500) continue;
        return NextResponse.json(
          { error: `Dịch vụ phân tích trả về lỗi (${res.status}). Thử lại sau ít phút.` },
          { status: res.status }
        );
      }

      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts
        .filter((p: any) => typeof p.text === "string" && !p.thought)
        .map((p: any) => p.text)
        .join("\n")
        .trim();

      if (!text) {
        lastStatus = 502;
        continue;
      }

      return NextResponse.json({ analysis: text });
    } catch {
      lastStatus = 500;
    }
  }

  return NextResponse.json(
    { error: "Dịch vụ phân tích đang quá tải. Thử lại sau ít phút." },
    { status: lastStatus }
  );
}
