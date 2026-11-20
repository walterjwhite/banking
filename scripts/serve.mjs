import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const servedRoot = path.resolve(projectRoot, process.argv[2] ?? ".");
const publicRoot = path.join(servedRoot, "public");
const port = Number(process.env.PORT ?? 4173);

const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const file = await resolveFile(pathname);
  if (!file) return send(response, 404, "not found");
  const body = await readFile(file);
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
  });
  response.end(body);
}).listen(port, () =>
  console.log(`family bank mockup: http://localhost:${port}`),
);

/** Source files live at the root; the PWA assets live in public/. */
async function resolveFile(pathname) {
  const relative =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  for (const candidate of [
    path.join(servedRoot, relative),
    path.join(publicRoot, relative),
  ]) {
    if (!isInside(candidate, servedRoot) && !isInside(candidate, publicRoot))
      continue;
    const file = await existingFile(candidate);
    if (file) return file;
  }
  return null;
}

async function existingFile(candidate) {
  try {
    const stats = await stat(candidate);
    const file = stats.isDirectory()
      ? path.join(candidate, "index.html")
      : candidate;
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

function isInside(target, root) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function send(response, status, text) {
  response.writeHead(status, { "content-type": "text/plain" });
  response.end(text);
}
