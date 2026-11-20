import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = path.join(root, "dist");

if (existsSync(path.join(root, "public", "snapshot.json"))) {
  throw new Error(
    "public/snapshot.json must not ship: the site is the shell and holds no balances",
  );
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await cp(path.join(root, "index.html"), path.join(dist, "index.html"));
await cp(path.join(root, "styles.css"), path.join(dist, "styles.css"));
await cp(path.join(root, "src"), path.join(dist, "src"), { recursive: true });
await cp(path.join(root, "public"), dist, { recursive: true });

console.log("built dist/");
