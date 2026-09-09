import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken, isAuthEnabled } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Nếu không cấu hình AUTH_USERS trong .env thì không bật xác thực
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  // Luôn cho phép truy cập các route đăng nhập và API auth
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/")
  ) {
    // Nếu người dùng đã đăng nhập mà truy cập /login thì chuyển về trang chủ
    if (pathname === "/login") {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      if (token) {
        const payload = await verifySessionToken(token);
        if (payload) {
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // Kiểm tra token phiên đăng nhập
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (!payload) {
    // Nếu gọi API nội bộ -> trả 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Phiên làm việc đã hết hạn hoặc chưa đăng nhập." },
        { status: 401 }
      );
    }

    // Nếu truy cập trang giao diện -> chuyển hướng về /login
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Áp dụng cho mọi route trừ static files, images và icons
     */
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
