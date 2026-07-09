/**
 * アプリ全体(React込み)を単一HTMLフラグメントにバンドルする。
 * Claude アーティファクト等、「1ファイル・外部リクエスト禁止」の配布先向け。
 *
 * 使い方: node scripts/build-artifact.mjs <出力先.html>
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dest = process.argv[2] ?? join(process.cwd(), "muhaku-artifact.html");
const work = join(process.cwd(), ".artifact-tmp");
mkdirSync(work, { recursive: true });

const entryPath = join(work, "entry.tsx");
writeFileSync(
  entryPath,
  `
import React from "react";
import { createRoot } from "react-dom/client";
import Muhaku from "../src/app/_components/Muhaku";

const el = document.getElementById("muhaku-root");
if (el) createRoot(el).render(React.createElement(Muhaku));
`,
);

const outfile = join(work, "bundle.js");
await build({
  entryPoints: [entryPath],
  bundle: true,
  minify: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile,
  logLevel: "silent",
});

const js = readFileSync(outfile, "utf8");
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
  .replace('@import "tailwindcss";', "");

const fragment = `<title>無白 — 人生の残量</title>
<style>
*,*::before,*::after{box-sizing:border-box}
${css}
</style>
<div id="muhaku-root"></div>
<script>${js.replace(/<\/script>/g, "<\\/script>")}</script>`;

writeFileSync(dest, fragment);
rmSync(work, { recursive: true, force: true });
console.log("wrote", dest, `(${Math.round(fragment.length / 1024)} KB)`);
