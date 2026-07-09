import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "無白 — 人生の残量",
  description:
    "残り時間を直視する、入力ゼロの砂時計。こぼれた一粒は、もう戻らない。",
};

export const viewport: Viewport = {
  themeColor: "#0B0B0A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
