import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { isWithin, sha256File, toPortablePath } from "./fs-safe.mjs";

export async function collectTree(root, options = {}) {
  const info = await lstat(root).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return [];
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new LoopGatewayError("TREE_ROOT_INVALID", `目录树根不是普通目录：${root}`);
  }
  const realRoot = await realpath(root);
  return await walk(realRoot, "", realRoot, options.exclude ?? new Set());
}

export async function treeDigest(root, options = {}) {
  return canonicalSha256(await collectTree(root, options));
}

export async function copyTree(source, target, options = {}) {
  const files = await collectTree(source, options);
  await mkdir(target, { recursive: false });
  for (const item of files) {
    const from = path.join(source, ...item.path.split("/"));
    const to = path.join(target, ...item.path.split("/"));
    await mkdir(path.dirname(to), { recursive: true });
    await writeFile(to, await readFile(from), { flag: "wx" });
  }
  return files;
}

export function manifestDigest(files) {
  return canonicalSha256(files.map(({ path: file, size, sha256 }) => ({ path: file, size, sha256 })));
}

async function walk(directory, relativeRoot, containmentRoot, exclude) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = toPortablePath(path.join(relativeRoot, entry.name));
    if (exclude.has(relative) || [...exclude].some((prefix) => relative.startsWith(`${prefix}/`))) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new LoopGatewayError("TREE_LINK_DENIED", `目录树中禁止链接：${absolute}`);
    }
    const resolved = await realpath(absolute);
    if (!isWithin(containmentRoot, resolved)) {
      throw new LoopGatewayError("TREE_PATH_ESCAPE", `目录树路径逃逸：${absolute}`);
    }
    if (entry.isDirectory()) {
      files.push(...await walk(absolute, relative, containmentRoot, exclude));
    } else if (entry.isFile()) {
      const info = await lstat(absolute);
      files.push({ path: relative, size: info.size, sha256: await sha256File(absolute) });
    } else {
      throw new LoopGatewayError("TREE_FILE_TYPE_DENIED", `目录树含非普通文件：${absolute}`);
    }
  }
  return files;
}
