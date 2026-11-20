import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const output = path.join(
  fileURLToPath(new URL("..", import.meta.url)),
  "public",
  "icons",
);
const BACKGROUND = [31, 111, 74, 255];
const FOREGROUND = [255, 255, 255, 255];
const ICONS = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-maskable.png", size: 512, shrink: 0.72 },
];

function encode({ size, shrink = 1 }) {
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      pixels.set(coinPixel(x, y, size, shrink), y * stride + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header(size)),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function coinPixel(x, y, size, shrink) {
  const centre = size / 2;
  const radius = size * 0.3 * shrink;
  const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
  if (distance < radius * 0.55) return BACKGROUND;
  if (distance < radius) return FOREGROUND;
  return BACKGROUND;
}

function header(size) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(size, 0);
  buffer.writeUInt32BE(size, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  return buffer;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const output = Buffer.alloc(body.length + 8);
  output.writeUInt32BE(data.length, 0);
  body.copy(output, 4);
  output.writeUInt32BE(crc32(body), body.length + 4);
  return output;
}

const TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

mkdirSync(output, { recursive: true });
for (const icon of ICONS)
  writeFileSync(path.join(output, icon.name), encode(icon));
console.log(`wrote ${ICONS.length} icons to public/icons`);
