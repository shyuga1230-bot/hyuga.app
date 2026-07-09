import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* MUHAKU_EXPORT=1 で静的書き出し(単一ファイル配布用)。通常ビルドはサーバーモード */
  ...(process.env.MUHAKU_EXPORT ? { output: "export" as const } : {}),
};

export default nextConfig;
