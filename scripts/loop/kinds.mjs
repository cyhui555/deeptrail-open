import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LoopGatewayError } from "./errors.mjs";
import { sha256 } from "./fs-safe.mjs";

const kindSource = path.join(path.dirname(fileURLToPath(import.meta.url)), "kinds");

export async function installProjectKinds(config) {
  const targetRoot = path.join(config.workspace, "kinds");
  await mkdir(targetRoot, { recursive: true });
  const installed = [];
  const verified = [];

  for (const name of (await readdir(kindSource)).filter((file) => file.endsWith(".md")).sort()) {
    const source = path.join(kindSource, name);
    const target = path.join(targetRoot, name);
    const content = await readFile(source);
    const targetInfo = await lstat(target).catch(() => null);
    if (!targetInfo) {
      await writeFile(target, content, { flag: "wx" });
      installed.push(name);
      continue;
    }
    if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) {
      throw new LoopGatewayError("PROJECT_KIND_INVALID", `工程 Kind 目标不是普通文件：${target}`);
    }
    const actual = await readFile(target);
    if (sha256(actual) !== sha256(content)) {
      throw new LoopGatewayError("PROJECT_KIND_DRIFT", `工程 Kind 已漂移，拒绝覆盖：${name}`);
    }
    verified.push(name);
  }
  return { installed, verified };
}

export async function verifyProjectKinds(config, options = {}) {
  const targetRoot = path.join(config.workspace, "kinds");
  const upstreamRoot = path.join(config.skillSnapshot, "loopany-core", "kinds");
  const expected = new Map();
  for (const root of [upstreamRoot, kindSource]) {
    for (const name of (await readdir(root)).filter((file) => file.endsWith(".md")).sort()) {
      if (expected.has(name)) {
        throw new LoopGatewayError("PROJECT_KIND_COLLISION", `工程 Kind 与上游重名：${name}`);
      }
      expected.set(name, sha256(await readFile(path.join(root, name))));
    }
  }

  const entries = await readdir(targetRoot, { withFileTypes: true }).catch((error) => {
    throw new LoopGatewayError("PROJECT_KIND_INVALID", `Workspace Kind 不可读：${error.message}`);
  });
  const actualNames = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".md")) {
      throw new LoopGatewayError("PROJECT_KIND_INVALID", `Workspace Kind 含非法条目：${entry.name}`);
    }
    actualNames.push(entry.name);
  }
  actualNames.sort();
  const allowedMissing = new Set(options.allowMissing ?? []);
  const expectedNames = [...expected.keys()].filter((name) => !allowedMissing.has(name)).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new LoopGatewayError("PROJECT_KIND_SET_DRIFT", "Workspace Kind 文件集合已漂移", {
      expected: expectedNames,
      actual: actualNames
    });
  }
  for (const name of actualNames) {
    const actual = sha256(await readFile(path.join(targetRoot, name)));
    if (actual !== expected.get(name)) {
      throw new LoopGatewayError("PROJECT_KIND_DRIFT", `Workspace Kind 内容已漂移：${name}`);
    }
  }
  return { ok: true, kinds: actualNames.length };
}
