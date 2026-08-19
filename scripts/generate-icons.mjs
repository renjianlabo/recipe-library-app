import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const root = process.cwd();
const publicIcons = path.join(root, "public", "icons");
const appDirectory = path.join(root, "src", "app");

const COLORS = {
  green: [46, 107, 79, 255],
  white: [255, 255, 255, 255],
  page: [220, 235, 226, 255],
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels.set(color, offset);
}

function fillRect(pixels, size, x, y, width, height, color) {
  for (let row = Math.max(0, y); row < Math.min(size, y + height); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(size, x + width); column += 1) {
      setPixel(pixels, size, column, row, color);
    }
  }
}

function fillRoundedRect(pixels, size, x, y, width, height, radius, color) {
  const right = x + width - 1;
  const bottom = y + height - 1;
  for (let row = y; row <= bottom; row += 1) {
    for (let column = x; column <= right; column += 1) {
      const cornerX = column < x + radius ? x + radius : column > right - radius ? right - radius : column;
      const cornerY = row < y + radius ? y + radius : row > bottom - radius ? bottom - radius : row;
      const dx = column - cornerX;
      const dy = row - cornerY;
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, size, column, row, color);
    }
  }
}

function renderIcon(size, maskable = false) {
  const pixels = new Uint8Array(size * size * 4);
  fillRect(pixels, size, 0, 0, size, size, COLORS.green);
  const scale = size / 512;
  const coordinate = (value) => Math.round(value * scale);
  const inset = maskable ? 154 : 126;
  const top = maskable ? 150 : 104;
  const width = maskable ? 204 : 260;
  const height = maskable ? 218 : 304;
  fillRoundedRect(
    pixels,
    size,
    coordinate(inset),
    coordinate(top),
    coordinate(width),
    coordinate(height),
    coordinate(maskable ? 26 : 38),
    COLORS.white,
  );
  fillRect(
    pixels,
    size,
    coordinate(inset + (maskable ? 42 : 50)),
    coordinate(top),
    coordinate(maskable ? 18 : 22),
    coordinate(height),
    COLORS.page,
  );
  for (const [lineY, lineWidth] of [[maskable ? 220 : 184, maskable ? 78 : 94], [maskable ? 258 : 236, maskable ? 112 : 132]]) {
    fillRoundedRect(
      pixels,
      size,
      coordinate(inset + (maskable ? 84 : 100)),
      coordinate(lineY),
      coordinate(lineWidth),
      Math.max(2, coordinate(maskable ? 16 : 20)),
      Math.max(1, coordinate(8)),
      COLORS.green,
    );
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    const targetOffset = row * (size * 4 + 1);
    raw[targetOffset] = 0;
    Buffer.from(pixels.buffer, row * size * 4, size * 4).copy(raw, targetOffset + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function writePng(size, destination, maskable = false) {
  await writeFile(destination, renderIcon(size, maskable));
}

await mkdir(publicIcons, { recursive: true });
await Promise.all([
  writePng(192, path.join(publicIcons, "app-192.png")),
  writePng(512, path.join(publicIcons, "app-512.png")),
  writePng(512, path.join(publicIcons, "app-maskable-512.png"), true),
  writePng(512, path.join(appDirectory, "icon.png")),
  writePng(180, path.join(appDirectory, "apple-icon.png")),
]);

console.log("Generated deterministic Recipe Library PNG icons.");
