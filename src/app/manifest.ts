import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "無白 — 人生の残量",
    short_name: "無白",
    description:
      "残り時間を直視する、入力ゼロの砂時計。こぼれた一粒は、もう戻らない。",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0A",
    theme_color: "#0B0B0A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
