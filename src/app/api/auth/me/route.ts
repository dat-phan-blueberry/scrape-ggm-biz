import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken, isAuthEnabled } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Nếu hệ thống không bật auth thì coi như guest/admin mặc định
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, user: { email: "guest@godine.vn" } });
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: { email: payload.email },
  });
}
