import type { MetadataRoute } from "next";

/* output:"export" 時にも書き出せるように静的化(データは全て固定値) */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "無白 — 人生の残量",
    short_name: "無白",
    description:
      "残り時間を直視する、入力ゼロの砂時計。こぼれた一粒は、もう戻らない。",
    /* manifest の場所からの相対解決。サブパス配信(GitHub Pages)でも壊れない */
    start_url: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0A",
    theme_color: "#0B0B0A",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
