import { NextRequest, NextResponse } from "next/server";
import { validateCredentials, createSessionToken, COOKIE_NAME, isAuthEnabled } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Vui lòng nhập đầy đủ email và mật khẩu." },
        { status: 400 }
      );
    }

    // Nếu chưa cấu hình AUTH_USERS trong .env thì từ chối hoặc cảnh báo
    if (!isAuthEnabled()) {
      return NextResponse.json(
        { error: "Hệ thống chưa cấu hình AUTH_USERS trong .env." },
        { status: 500 }
      );
    }

    const user = validateCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không chính xác." },
        { status: 401 }
      );
    }

    const token = await createSessionToken(user.email);
    const response = NextResponse.json({ success: true, email: user.email });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 ngày
    });

    return response;
  } catch (err) {
    console.error("[auth:login] error:", err);
    return NextResponse.json(
      { error: "Có lỗi xảy ra trong quá trình đăng nhập. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
