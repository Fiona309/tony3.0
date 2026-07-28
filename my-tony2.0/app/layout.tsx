import type { Metadata } from "next";
import { Caveat, Geist, Jost, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const caveat = Caveat({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// 思源黑体（中文）
const notoSC = Noto_Sans_SC({
  variable: "--font-cn",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "做自己的 Tony · 个人染发方案",
  description: "从喜欢的发色出发，判断可达效果、风险、商品与操作步骤",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geist.variable} ${jost.variable} ${caveat.variable} ${notoSC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
