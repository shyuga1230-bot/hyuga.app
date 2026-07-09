/**
 * 静的書き出し(out/)を、単一のHTMLフラグメントに束ねる。
 * - <script src="/_next/..."> をインライン化
 * - <link rel="stylesheet"> を <style> に
 * - preload 等の /_next 参照は除去
 * - html/head/body の外殻を外す(アーティファクトが外殻を与えるため)
 *
 * 使い方: MUHAKU_EXPORT=1 next build && node scripts/export-single.mjs <出力先.html>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "out");
const dest = process.argv[2] ?? join(process.cwd(), "muhaku-single.html");

let html = readFileSync(join(outDir, "index.html"), "utf8");

/* stylesheet → inline <style> */
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>/g,
  (_, href) => {
    const css = readFileSync(join(outDir, href.replace(/^\//, "")), "utf8");
    return `<style>${css}</style>`;
  },
);

/* script src → inline */
html = html.replace(
  /<script([^>]*?)src="(\/_next\/[^"]+)"([^>]*)><\/script>/g,
  (_, pre, src) => {
    const js = readFileSync(join(outDir, src.replace(/^\//, "")), "utf8");
    return `<script>${js.replace(/<\/script>/g, "<\\/script>")}</script>`;
  },
);

/* 残りの /_next 参照(preload等)を除去 */
html = html.replace(/<link[^>]+\/_next\/[^>]*\/?>/g, "");

/* 外殻を外してフラグメント化 */
const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const headKept = head
  .replace(/<meta[^>]*\/?>/g, "")
  .replace(/<link[^>]*\/?>/g, "");

writeFileSync(dest, headKept + "\n" + body);
console.log("wrote", dest);
