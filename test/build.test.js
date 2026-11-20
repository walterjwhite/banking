import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = path.join(root, "dist");

test("build emits calculator pages with local hashed assets", () => {
  execFileSync(process.execPath, [path.join(root, "scripts", "build.mjs")], {
    stdio: "pipe",
  });

  return Promise.all(
    ["compounding.html", "purchase-power.html"].map(async (page) => {
      const html = await readFile(path.join(dist, page), "utf8");
      assert.doesNotMatch(html, /cdn\.tailwindcss\.com|cdn\.jsdelivr\.net/);
      assert.match(html, /\.\/assets\/tailwind\.[0-9a-f]+\.css/);
      assert.match(html, /\.\/assets\/chart\.[0-9a-f]+\.js/);
    }),
  );
});

test("service worker precaches the calculator pages and assets", async () => {
  execFileSync(process.execPath, [path.join(root, "scripts", "build.mjs")], {
    stdio: "pipe",
  });

  const sw = await readFile(path.join(dist, "sw.js"), "utf8");
  assert.match(sw, /"\.\/compounding\.html"/);
  assert.match(sw, /"\.\/purchase-power\.html"/);
  assert.match(sw, /"\.\/assets\//);
});
