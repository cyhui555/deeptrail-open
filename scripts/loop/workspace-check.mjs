import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { LoopGatewayError } from "./errors.mjs";
import { verifyIdentity } from "./identity.mjs";
import { verifyProjectKinds } from "./kinds.mjs";
import { runLoopAny } from "./runtime.mjs";
import { verifySkills } from "./skills.mjs";

export async function verifyWorkspaceContract(config) {
  const skills = await verifySkills(config);
  const kinds = await verifyProjectKinds(config);
  const identity = await verifyIdentity(config);
  const result = await runLoopAny(config, ["doctor", "--format", "json"], {
    json: true,
    allowFailure: true
  });
  if (result.code !== 0 || result.json?.ok !== true) {
    throw new LoopGatewayError("LOOPANY_DOCTOR_FAILED", "LoopAny Doctor 未通过", result.json);
  }
  const audit = await verifyAudit(config);
  const capabilities = await verifyDisabledCapabilities(config);
  return { ok: true, skills, kinds, identity, loopany: result.json, audit, capabilities };
}

async function verifyAudit(config) {
  const file = path.join(config.workspace, "audit.jsonl");
  const content = await readFile(file, "utf8").catch((error) => {
    throw new LoopGatewayError("AUDIT_MISSING", `LoopAny Audit 不可读：${error.message}`);
  });
  let entries = 0;
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch (error) {
      throw new LoopGatewayError("AUDIT_MALFORMED", `Audit 第 ${index + 1} 行不是合法 JSON`);
    }
    if (typeof item.ts !== "string" || typeof item.op !== "string"
      || !new Set(["cli", "agent"]).has(item.actor)
      || typeof item.duration_ms !== "number") {
      throw new LoopGatewayError("AUDIT_MALFORMED", `Audit 第 ${index + 1} 行缺少操作字段`);
    }
    entries += 1;
  }
  return { ok: true, entries };
}

async function verifyDisabledCapabilities(config) {
  const workspaceConfig = await readFile(path.join(config.workspace, "config.yaml"), "utf8");
  const domains = workspaceConfig.match(/^enabled_domains:\s*(.+?)\s*$/m)?.[1];
  if (!/^schemaVersion:\s*0\.2\.0\s*$/m.test(workspaceConfig)
    || (domains !== undefined && domains !== "[]")) {
    throw new LoopGatewayError("LOOP_CAPABILITY_DRIFT", "Workspace 配置启用了未批准 Domain 或版本漂移");
  }
  const forbidden = ["search.sqlite", "search.db", "daemon.pid", "cron.lock", "server.sock"];
  for (const name of forbidden) {
    if (await lstat(path.join(config.workspace, name)).catch(() => null)) {
      throw new LoopGatewayError("LOOP_CAPABILITY_ENABLED", `发现未批准能力产物：${name}`);
    }
  }
  return {
    search: "disabled-unverified",
    embedding: "disabled-unverified",
    daemon: "denied-by-gateway",
    cron: "denied-by-gateway",
    socket: "denied-by-gateway",
    remoteGitWrite: false,
    autoSkillActivation: false
  };
}
