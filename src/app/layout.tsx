import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "世界杯预测实验室",
  description: "用可解释的数据模型，发现值得看的比赛与潜在冷门。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
