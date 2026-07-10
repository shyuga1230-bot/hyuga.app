import type { NextConfig } from "next";

// GitHub Pages(静的ホスティング)向けビルド: GITHUB_PAGES=true のときだけ
// 静的書き出し+リポジトリ名のbasePathを適用する。
// 通常の npm run dev / npm run build には影響しない
const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export" as const,
        basePath: "/hyuga.app",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
