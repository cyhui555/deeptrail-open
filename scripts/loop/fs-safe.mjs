import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import { LoopGatewayError } from "./errors.mjs";

export function normalizePath(value) {
  return path.resolve(value);
}

export function isWithin(parent, candidate) {
  const relative = path.relative(normalizePath(parent), normalizePath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertOutside(parent, candidate, label) {
  if (isWithin(parent, candidate)) {
    throw new LoopGatewayError(
      "UNSAFE_RUNTIME_PATH",
      `${label} 必须位于 Git 工作树之外：${candidate}`
    );
  }
}

export function assertDisjoint(left, right, labels = ["路径一", "路径二"]) {
  if (isWithin(left, right) || isWithin(right, left)) {
    throw new LoopGatewayError(
      "OVERLAPPING_RUNTIME_PATH",
      `${labels[0]} 与 ${labels[1]} 不得互相包含：${left} / ${right}`
    );
  }
}

// 首次初始化时目标目录可能尚不存在；从最深的已存在祖先解析真实路径，
// 可以在创建任何文件前识别符号链接或 Windows Junction 造成的路径逃逸。
export async function canonicalizePlannedPath(value, label) {
  const requested = normalizePath(value);
  const suffix = [];
  let cursor = requested;
  let info = await lstat(cursor).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

  while (!info) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new LoopGatewayError("INVALID_RUNTIME_PATH", `${label} 没有可解析的祖先：${requested}`);
    }
    suffix.unshift(path.basename(cursor));
    cursor = parent;
    info = await lstat(cursor).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
  }

  if (info.isSymbolicLink()) {
    throw new LoopGatewayError("RUNTIME_LINK_DENIED", `${label} 的已存在祖先是链接：${cursor}`);
  }
  if (suffix.length > 0 && !info.isDirectory()) {
    throw new LoopGatewayError("INVALID_RUNTIME_PATH", `${label} 的祖先不是目录：${cursor}`);
  }
  const resolved = await realpath(cursor);
  return path.join(resolved, ...suffix);
}

export async function assertRegularFile(file, label) {
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) {
    throw new LoopGatewayError("INVALID_RUNTIME_PATH", `${label} 不是普通文件：${file}`);
  }
  return await realpath(file);
}

export async function assertDirectory(directory, label) {
  const info = await lstat(directory).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    throw new LoopGatewayError("INVALID_RUNTIME_PATH", `${label} 不是普通目录：${directory}`);
  }
  return await realpath(directory);
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function sha256File(file) {
  return sha256(await readFile(file));
}

export async function writeJsonExclusive(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  await rename(temporary, file);
}

export async function writeJsonAtomicExclusive(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    // 硬链接创建对目标名称是原子的，并在所有平台上拒绝覆盖既有 Receipt。
    await link(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export function toPortablePath(value) {
  return value.split(path.sep).join("/");
}
