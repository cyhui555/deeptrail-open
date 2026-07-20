import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "check-visual-evidence.mjs");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test("视觉证据接受固定尺寸、完整且不含文本元数据的截图", async () => {
  await withEvidenceRoot(async (root) => {
    await writeExpectedPair(root);
    const result = runCheck(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 张确定性截图/);
    assert.match(result.stdout, /itinerary-mobile-360\.png: 360x820, sha256:/);
    assert.equal(runCheck(root, true).status, 0);
  });
});

test("视觉证据缺失、尺寸漂移或混入额外文件时失败关闭", async () => {
  await withEvidenceRoot(async (root) => {
    await writeFile(path.join(root, "itinerary-mobile-360.png"), createPng(361, 820));
    await writeFile(path.join(root, "unexpected.txt"), "unexpected", "utf8");
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected-screenshot-width/);
    assert.match(result.stderr, /missing-evidence-file/);
    assert.match(result.stderr, /unexpected-evidence-entry/);
  });
});

test("视觉证据拒绝可承载文本的 PNG 元数据块", async () => {
  await withEvidenceRoot(async (root) => {
    await writeExpectedPair(root, { textMetadata: true });
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /disallowed-png-chunk/);
  });
});

async function withEvidenceRoot(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "deeptrail-visual-evidence-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function writeExpectedPair(root, options = {}) {
  await Promise.all([
    writeFile(path.join(root, "itinerary-mobile-360.png"), createPng(360, 820, options)),
    writeFile(path.join(root, "itinerary-mobile-390.png"), createPng(390, 820, options)),
  ]);
}

function runCheck(root, withPnpmSeparator = false) {
  const arguments_ = withPnpmSeparator ? [script, "--", root] : [script, root];
  return spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}

function createPng(width, height, { textMetadata = false } = {}) {
  const bytesPerPixel = 4;
  const raw = Buffer.alloc((1 + width * bytesPerPixel) * height);
  const rowLength = 1 + width * bytesPerPixel;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowStart + 1 + x * bytesPerPixel;
      raw[pixel] = (x + y) % 256;
      raw[pixel + 1] = (x * 3 + y) % 256;
      raw[pixel + 2] = (x + y * 5) % 256;
      raw[pixel + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const chunks = [createChunk("IHDR", header)];
  if (textMetadata) chunks.push(createChunk("tEXt", Buffer.from("fixture=must-be-rejected", "utf8")));
  chunks.push(createChunk("IDAT", deflateSync(raw)), createChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([pngSignature, ...chunks]);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
