import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));

export async function writeSiteAssets(dist, version) {
  const assetsDir = path.join(dist, "assets");
  await mkdir(assetsDir, { recursive: true });

  const tailwind = `./assets/tailwind.${version}.css`;
  const chart = `./assets/chart.${version}.js`;
  await writeFile(path.join(dist, tailwind.slice(2)), compileTailwind());
  await writeFile(path.join(dist, chart.slice(2)), vendorChart());
  return { tailwind, chart };
}

export function rewritePage(html, assets) {
  return html
    .replace(
      '<script src="https://cdn.tailwindcss.com"></script>',
      `<link rel="stylesheet" href="${assets.tailwind}" />`,
    )
    .replace(
      '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>',
      `<script src="${assets.chart}"></script>`,
    );
}

function compileTailwind() {
  const dir = mkdtempSync(path.join(tmpdir(), "bank-pwa-tailwind-"));
  const out = path.join(dir, "out.css");
  const cli = path.join(
    path.dirname(require.resolve("tailwindcss/package.json")),
    "lib",
    "cli.js",
  );
  try {
    execFileSync(
      process.execPath,
      [
        cli,
        "-i",
        path.join(root, "tailwind.css"),
        "-o",
        out,
        "--content",
        path.join(root, "*.html"),
        "--minify",
      ],
      { stdio: "pipe" },
    );
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function vendorChart() {
  const entry = require.resolve("chart.js");
  return readFileSync(
    path.join(path.dirname(entry), "..", "dist", "chart.umd.min.js"),
  );
}
