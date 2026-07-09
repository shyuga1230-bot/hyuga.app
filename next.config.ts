import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* MUHAKU_EXPORT=1 で静的書き出し(単一ファイル配布用)。通常ビルドはサーバーモード */
  ...(process.env.MUHAKU_EXPORT ? { output: "export" as const } : {}),
  /* GitHub Pages などサブパス配信用(例: MUHAKU_BASE_PATH=/hyuga.app) */
  ...(process.env.MUHAKU_BASE_PATH
    ? { basePath: process.env.MUHAKU_BASE_PATH }
    : {}),
};

export default nextConfig;
