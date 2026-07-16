import type { Metadata } from "next";
import { Archivo, Be_Vietnam_Pro, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Archivo({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-display",
  axes: ["wdth"],
});

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-mono",
});

const pinFavicon =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2C10.2 2 5.5 6.7 5.5 12.5 5.5 20.4 16 30 16 30s10.5-9.6 10.5-17.5C26.5 6.7 21.8 2 16 2z" fill="#15684B"/><circle cx="16" cy="12.6" r="4" fill="#F1F2EC"/></svg>'
  );

export const metadata: Metadata = {
  title: "Địa Bạ — Hồ sơ quán từ Google Maps",
  description:
    "Tra cứu và thẩm định hồ sơ doanh nghiệp F&B trên Google Maps: đánh giá, thực đơn, giờ cao điểm, kênh đặt bàn.",
  icons: { icon: pinFavicon },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${display.variable} ${body.variable} ${mono.variable} font-body`}>
        {children}
      </body>
    </html>
  );
}
