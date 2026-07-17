import { LoopGatewayError } from "./errors.mjs";
import { runLoopAny } from "./runtime.mjs";

export async function getArtifact(config, id) {
  const result = await runLoopAny(config, ["artifact", "get", id, "--format", "json"], {
    json: true,
    allowFailure: true
  });
  if (result.code === 0) return result.json;
  if (result.stderr.includes("Artifact not found")) return null;
  throw new LoopGatewayError("LOOPANY_READ_FAILED", `读取 Artifact ${id} 失败`, {
    stderr: result.stderr.trim().slice(0, 4096)
  });
}

export async function requireArtifact(config, id, kind) {
  if (!id) throw new LoopGatewayError("ARTIFACT_ID_MISSING", `缺少 ${kind} Artifact ID`);
  const artifact = await getArtifact(config, id);
  if (!artifact || artifact.kind !== kind) {
    throw new LoopGatewayError("ARTIFACT_MISSING", `未找到 ${kind} Artifact：${id}`);
  }
  return artifact;
}

export async function createArtifact(config, kind, slug, fields, content) {
  const args = ["artifact", "create", "--kind", kind, "--slug", slug];
  for (const [field, value] of Object.entries(fields)) args.push(`--${field}`, String(value));
  args.push("--content", content);
  return (await runLoopAny(config, args, { json: true })).json;
}

export async function addRef(config, from, to, relation) {
  await runLoopAny(config, [
    "refs", "add", "--from", from, "--to", to, "--relation", relation
  ], { json: true });
}

export async function readRefs(config, id, depth = 2) {
  return (await runLoopAny(config, [
    "refs", id, "--direction", "both", "--depth", String(depth)
  ], { json: true })).json;
}

export async function appendOutcome(config, id, content) {
  await runLoopAny(config, [
    "artifact", "append", id, "--section", "Outcome", "--content", content
  ], { json: true });
}

export async function setStatus(config, id, status, reason = undefined) {
  const args = ["artifact", "status", id, status];
  if (reason) args.push("--reason", reason);
  await runLoopAny(config, args, { json: true });
}

export async function setField(config, id, field, value) {
  await runLoopAny(config, [
    "artifact", "set", id, "--field", field, "--value", String(value)
  ], { json: true });
}
