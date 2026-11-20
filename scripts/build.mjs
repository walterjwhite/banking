import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rewritePage, writeSiteAssets } from "./build-assets.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = path.join(root, "dist");
const srcDir = path.join(root, "src");
const publicDir = path.join(root, "public");

const extraPages = (await readdir(root))
  .filter((name) => name.endsWith(".html") && name !== "index.html")
  .sort();

if (existsSync(path.join(publicDir, "snapshot.json"))) {
  throw new Error(
    "public/snapshot.json must not ship: the site is the shell and holds no balances",
  );
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "src"), { recursive: true });

const srcFiles = (await readdir(srcDir))
  .filter((name) => name.endsWith(".js"))
  .sort();
const version = await buildHash(srcFiles);

for (const file of srcFiles) {
  const source = await readFile(path.join(srcDir, file), "utf8");
  const rewritten = source.replace(
    /from\s+["']\.\/([A-Za-z0-9_-]+)\.js["']/g,
    `from "./$1.${version}.js"`,
  );
  await writeFile(path.join(dist, "src", hashedJs(file, version)), rewritten);
}

await writeFile(
  path.join(dist, `styles.${version}.css`),
  await readFile(path.join(root, "styles.css"), "utf8"),
);

const html = (await readFile(path.join(root, "index.html"), "utf8"))
  .replace("./styles.css", `./styles.${version}.css`)
  .replace("./src/app.js", `./src/${hashedJs("app.js", version)}`);
await writeFile(path.join(dist, "index.html"), html);

await cp(publicDir, dist, { recursive: true });

const assets = await writeSiteAssets(dist, version);
for (const page of extraPages) {
  const html = await readFile(path.join(root, page), "utf8");
  await writeFile(path.join(dist, page), rewritePage(html, assets));
}

await writeFile(
  path.join(dist, "sw.js"),
  await serviceWorker(version, srcFiles, assets),
);

console.log(`built dist/ (${version})`);

async function buildHash(files) {
  const hash = createHash("sha256");
  for (const file of ["index.html", "styles.css", "tailwind.css", ...extraPages]) {
    hash.update(file);
    hash.update(await readFile(path.join(root, file)));
  }
  for (const file of files) {
    hash.update(`src/${file}`);
    hash.update(await readFile(path.join(srcDir, file)));
  }
  for (const file of await walk(publicDir)) {
    hash.update(path.relative(publicDir, file));
    hash.update(await readFile(file));
  }
  return hash.digest("hex").slice(0, 10);
}

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files.sort();
}

function hashedJs(file, version) {
  return file.replace(/\.js$/, `.${version}.js`);
}

async function serviceWorker(version, files, assets) {
  const source = await readFile(path.join(publicDir, "sw.js"), "utf8");
  const shell = [
    "./",
    "./index.html",
    ...extraPages.map((page) => `./${page}`),
    `./styles.${version}.css`,
    assets.tailwind,
    assets.chart,
    "./manifest.webmanifest",
    "./sw.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable.png",
    "./icons/apple-touch-icon.png",
    ...files.map((file) => `./src/${hashedJs(file, version)}`),
  ];
  return source
    .replace(/const CACHE = ".*";/, `const CACHE = "family-bank-${version}";`)
    .replace(
      /const SHELL = \[[\s\S]*?\];/,
      `const SHELL = [\n${shell.map((item) => `  ${JSON.stringify(item)},`).join("\n")}\n];`,
    );
}
