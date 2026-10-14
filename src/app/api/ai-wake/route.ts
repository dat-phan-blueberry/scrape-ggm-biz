import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint Wake-up / Healthcheck cho AI Gateway
 * Timeout 10s cho mỗi lượt gọi tới Koyeb
 */
export async function GET() {
  const gatewayUrl = process.env.AI_GATEWAY_URL?.trim();

  // Nếu không dùng Gateway (gọi Gemini trực tiếp local), coi như luôn sẵn sàng
  if (!gatewayUrl) {
    return NextResponse.json({ awake: true, skipped: true });
  }

  const healthUrl = `${gatewayUrl.replace(/\/+$/, "")}/health`;

  try {
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(10_000), // Timeout đúng 10s
      cache: "no-store",
    });

    if (res.ok) {
      return NextResponse.json({ awake: true, status: res.status });
    }

    return NextResponse.json({ awake: false, status: res.status }, { status: 502 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Timeout hoặc lỗi kết nối";
    return NextResponse.json({ awake: false, error: message }, { status: 504 });
  }
}
