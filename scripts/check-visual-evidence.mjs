import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inflateSync } from "node:zlib";

const rawArguments = process.argv.slice(2);
const arguments_ = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
if (arguments_.length !== 1) {
  console.error("用法：node scripts/check-visual-evidence.mjs <截图目录>");
  process.exit(2);
}

const expectedFiles = new Map([
  ["itinerary-mobile-360.png", { width: 360, height: 820 }],
  ["itinerary-mobile-390.png", { width: 390, height: 820 }],
]);
const allowedAncillaryChunks = new Map([
  ["sRGB", 1],
  ["gAMA", 4],
  ["cHRM", 32],
  ["pHYs", 9],
]);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const minimumFileSize = 10 * 1024;
const maximumFileSize = 8 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});
const failures = [];
const summaries = [];
const root = path.resolve(arguments_[0]);

class EvidenceError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

let rootMetadata;
try {
  rootMetadata = await lstat(root);
} catch (error) {
  if (error?.code === "ENOENT") addFailure(path.basename(root), "missing-evidence-root");
  else throw error;
}

if (rootMetadata) {
  if (rootMetadata.isSymbolicLink()) addFailure(path.basename(root), "symbolic-link-root");
  else if (!rootMetadata.isDirectory()) addFailure(path.basename(root), "evidence-root-not-directory");
  else await inspectRoot();
}

if (failures.length > 0) {
  console.error(`视觉证据安全检查失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`- ${failure.file}: ${failure.category}`);
  process.exit(1);
}

console.log(`视觉证据安全检查通过：${summaries.length} 张确定性截图。`);
for (const summary of summaries.sort((left, right) => left.file.localeCompare(right.file))) {
  console.log(`- ${summary.file}: ${summary.width}x${summary.height}, sha256:${summary.sha256}`);
}

async function inspectRoot() {
  const entries = await readdir(root, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  for (const expectedName of expectedFiles.keys()) {
    if (!names.has(expectedName)) addFailure(expectedName, "missing-evidence-file");
  }

  for (const entry of entries) {
    if (!expectedFiles.has(entry.name)) {
      addFailure(entry.name, "unexpected-evidence-entry");
      continue;
    }
    const absolute = path.join(root, entry.name);
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) {
      addFailure(entry.name, "symbolic-link-file");
      continue;
    }
    if (!metadata.isFile()) {
      addFailure(entry.name, "evidence-entry-not-file");
      continue;
    }
    if (metadata.size < minimumFileSize || metadata.size > maximumFileSize) {
      addFailure(entry.name, "evidence-file-size-out-of-range");
      continue;
    }

    try {
      summaries.push(validatePng(entry.name, await readFile(absolute), expectedFiles.get(entry.name)));
    } catch (error) {
      addFailure(entry.name, error instanceof EvidenceError ? error.category : "invalid-png");
    }
  }
}

function validatePng(file, buffer, expected) {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new EvidenceError("invalid-png-signature");
  }

  let offset = pngSignature.length;
  let header;
  let sawData = false;
  let sawEnd = false;
  const imageData = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new EvidenceError("truncated-png-chunk");
    const length = buffer.readUInt32BE(offset);
    const typeBuffer = buffer.subarray(offset + 4, offset + 8);
    const type = typeBuffer.toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (!/^[A-Za-z]{4}$/.test(type) || chunkEnd > buffer.length) {
      throw new EvidenceError("invalid-png-chunk");
    }
    const data = buffer.subarray(dataStart, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([typeBuffer, data]));
    if (expectedCrc !== actualCrc) throw new EvidenceError("invalid-png-crc");

    if (type === "IHDR") {
      if (offset !== pngSignature.length || header || length !== 13) {
        throw new EvidenceError("invalid-png-header");
      }
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      if (!header || sawEnd) throw new EvidenceError("invalid-png-chunk-order");
      sawData = true;
      imageData.push(data);
    } else if (type === "IEND") {
      if (!header || !sawData || sawEnd || length !== 0 || chunkEnd !== buffer.length) {
        throw new EvidenceError("invalid-png-end");
      }
      sawEnd = true;
    } else {
      const expectedLength = allowedAncillaryChunks.get(type);
      if (sawData || expectedLength === undefined || expectedLength !== length) {
        // 文本、EXIF 与未知附加块可能承载运行态信息，视觉证据统一失败关闭。
        throw new EvidenceError("disallowed-png-chunk");
      }
    }
    offset = chunkEnd;
  }

  if (!header || !sawData || !sawEnd) throw new EvidenceError("incomplete-png");
  if (header.width !== expected.width) throw new EvidenceError("unexpected-screenshot-width");
  if (header.height !== expected.height) throw new EvidenceError("unexpected-screenshot-height");
  if (header.bitDepth !== 8 || ![2, 6].includes(header.colorType)
      || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new EvidenceError("unsupported-png-format");
  }

  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const rowLength = 1 + header.width * bytesPerPixel;
  const expectedInflatedLength = rowLength * header.height;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedInflatedLength });
  } catch {
    throw new EvidenceError("invalid-png-image-data");
  }
  if (inflated.length !== expectedInflatedLength) throw new EvidenceError("invalid-png-image-size");
  const distinctBytes = new Set();
  for (let row = 0; row < header.height; row += 1) {
    const filterType = inflated[row * rowLength];
    if (filterType > 4) throw new EvidenceError("invalid-png-filter");
    for (let index = row * rowLength + 1; index < (row + 1) * rowLength; index += 97) {
      distinctBytes.add(inflated[index]);
    }
  }
  if (distinctBytes.size < 16) throw new EvidenceError("low-information-screenshot");

  return {
    file,
    width: header.width,
    height: header.height,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function addFailure(file, category) {
  const key = `${file}|${category}`;
  if (!failures.some((failure) => failure.key === key)) failures.push({ key, file, category });
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
