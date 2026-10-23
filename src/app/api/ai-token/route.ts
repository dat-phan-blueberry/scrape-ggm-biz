import { NextResponse } from "next/server";
import { signGatewayToken } from "@/lib/gateway-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cấp token ngắn hạn (10 phút, chỉ /v1/llm/chat) để trình duyệt gọi thẳng AI Gateway.
 * Middleware đã chặn người chưa đăng nhập; route chỉ ký token, không gọi AI → không dính timeout của Netlify.
 */
export async function GET() {
  const gatewayUrl = process.env.AI_GATEWAY_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.GATEWAY_TOKEN_SECRET?.trim();
  if (!gatewayUrl || !secret) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình AI Gateway (AI_GATEWAY_URL, GATEWAY_TOKEN_SECRET)." }, { status: 500 });
  }
  const service = process.env.AI_SERVICE_NAME?.trim() || "dia-ba";
  return NextResponse.json({ gatewayUrl, ...signGatewayToken(secret, service) }, { headers: { "Cache-Control": "no-store" } });
}
