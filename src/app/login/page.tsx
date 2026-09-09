"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Đăng nhập không thành công.");
      } else {
        // Đăng nhập thành công -> chuyển về trang chủ
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Nhãn thương hiệu */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 shadow-card">
            <span className="h-2 w-2 rounded-full bg-moss-deep" />
            <span className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-moss-deep">
              Godine • Khảo sát F&B
            </span>
          </div>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            ĐỊA BẠ
          </h1>
          <p className="mt-2 text-[0.84rem] text-soft">
            Công cụ nội bộ thẩm định hiện diện & Local SEO Google Maps
          </p>
        </div>

        {/* Khung đăng nhập */}
        <div className="mt-8 rounded-2xl border border-line bg-card p-7 shadow-pop sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-pin/30 bg-pin/5 p-3.5 text-[0.8rem] font-medium text-pin">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block font-mono text-[0.72rem] font-medium uppercase tracking-[0.12em] text-soft"
              >
                Tài khoản / Email
              </label>
              <input
                id="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@godine.vn"
                className="mt-1.5 w-full rounded-xl border border-line bg-field px-4 py-2.5 text-[0.88rem] text-ink outline-none transition-colors placeholder:text-soft/60 focus:border-moss focus:ring-2 focus:ring-moss/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block font-mono text-[0.72rem] font-medium uppercase tracking-[0.12em] text-soft"
              >
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-line bg-field px-4 py-2.5 text-[0.88rem] text-ink outline-none transition-colors placeholder:text-soft/60 focus:border-moss focus:ring-2 focus:ring-moss/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-moss-deep py-3 text-[0.85rem] font-semibold text-white shadow-card transition-all hover:bg-moss focus:outline-none focus:ring-2 focus:ring-moss/30 disabled:opacity-60"
            >
              {loading ? "Đang xác thực…" : "Đăng nhập hệ thống"}
            </button>
          </form>

          <p className="mt-6 text-center font-mono text-[0.66rem] text-soft">
            Tài khoản được cấp quyền bởi quản trị viên hệ thống
          </p>
        </div>
      </div>
    </div>
  );
}
