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
      // model có thinking: phần suy nghĩ cũng tính vào giới hạn này
      maxOutputTokens: 8192,
    },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Client protocol (SSE):
      //   : ping           -> keepalive (bỏ qua ở client), giữ kết nối khi model "thinking"
      //   data: {"text"}   -> một đoạn nội dung
      //   data: {"error"}  -> lỗi
      //   data: [DONE]     -> kết thúc
      const sendData = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const ping = () => controller.enqueue(encoder.encode(`: ping\n\n`));

      // Mở kết nối ngay để proxy thấy có byte -> không bị Inactivity Timeout.
      ping();

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
            // quá tải / hết hạn mức: thử model kế tiếp (chưa gửi text nên an toàn)
            continue;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          // Đọc SSE từ Gemini, tách theo dòng, forward phần text về client.
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
                    sendData({ text: p.text });
                    sentAny = true;
                  } else {
                    // phần "thinking" hoặc chunk rỗng -> keepalive
                    ping();
                  }
                }
              } catch {
                /* chunk chưa hoàn chỉnh hoặc không parse được -> bỏ qua */
              }
            }
          }

          if (sentAny) break; // xong, không cần model dự phòng
          lastStatus = 502; // stream ok nhưng rỗng -> thử model kế tiếp
        } catch (e) {
          console.error(`[ai-analysis] ${model} stream failed:`, e);
          if (sentAny) break; // đã stream dở -> dừng, tránh trùng nội dung
          lastStatus = 500;
        }
      }

      if (!sentAny) {
        sendData({
          error: `Dịch vụ phân tích đang quá tải (${lastStatus}). Thử lại sau ít phút.`,
        });
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // tắt buffering ở proxy (Netlify/nginx) để chunk tới client ngay
      "X-Accel-Buffering": "no",
    },
  });
}
