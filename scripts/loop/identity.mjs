import { LoopGatewayError } from "./errors.mjs";
import { runLoopAny } from "./runtime.mjs";

export const MISSION_ID = "deeptrail-engineering-loop";
const PERSON_NAME = "Deeptrail Engineering Loop";
const PERSON_BODY = "工程自动化主体，不代表具体自然人，也不保存个人资料。";
const MISSION_TITLE = "用可审计证据持续改进旅迹工程";
const MISSION_HYPOTHESIS = "先运行确定性影子闭环，再按证据逐级提升自动化。";

export async function ensureIdentity(config) {
  const people = await runLoopAny(config, ["artifact", "list", "--kind", "person"], { json: true });
  if (!people.json.some((item) => item.id === "self")) {
    await runLoopAny(config, [
      "artifact", "create", "--kind", "person", "--slug", "self",
      "--name", PERSON_NAME, "--content", PERSON_BODY
    ], { json: true });
  }

  const missions = await runLoopAny(config, ["artifact", "list", "--kind", "mission"], { json: true });
  if (!missions.json.some((item) => item.id === MISSION_ID)) {
    await runLoopAny(config, [
      "artifact", "create", "--kind", "mission", "--slug", MISSION_ID,
      "--title", MISSION_TITLE, "--status", "active",
      "--hypothesis", MISSION_HYPOTHESIS,
      "--content", [
        "## Why this mission",
        "",
        "在不重写业务和不绕过 G0—G3 的前提下建立可恢复工程闭环。",
        "",
        "## Current hypothesis",
        "",
        MISSION_HYPOTHESIS,
        "",
        "## How loopany serves this mission",
        "",
        "- 保存 Run、Task、ExecutionSpec、Execution、Evidence、Outcome、Transaction 与 Receipt。",
        "",
        `## Day 1 — ${new Date().toISOString().slice(0, 10)}`,
        "",
        "由旅迹 Loop Gateway 初始化。"
      ].join("\n")
    ], { json: true });
  }
  return await verifyIdentity(config);
}

export async function verifyIdentity(config) {
  const person = await requireArtifact(config, "self", "person");
  if (person.frontmatter.name !== PERSON_NAME || person.body.trim() !== PERSON_BODY
    || person.frontmatter.emails !== undefined) {
    throw new LoopGatewayError("LOOP_IDENTITY_DRIFT", "Loop 工程主体已漂移或含个人字段");
  }
  const mission = await requireArtifact(config, MISSION_ID, "mission");
  const requiredBody = [
    "## Why this mission",
    "## Current hypothesis",
    "## How loopany serves this mission",
    MISSION_HYPOTHESIS
  ];
  if (mission.frontmatter.title !== MISSION_TITLE
    || mission.frontmatter.status !== "active"
    || mission.frontmatter.hypothesis !== MISSION_HYPOTHESIS
    || requiredBody.some((item) => !mission.body.includes(item))) {
    throw new LoopGatewayError("LOOP_MISSION_DRIFT", "Loop 工程 Mission 已漂移");
  }
  return { ok: true, person: "self", mission: MISSION_ID };
}

async function requireArtifact(config, id, kind) {
  const result = await runLoopAny(config, ["artifact", "get", id, "--format", "json"], {
    json: true,
    allowFailure: true
  });
  if (result.code !== 0 || result.json?.kind !== kind) {
    throw new LoopGatewayError("LOOP_IDENTITY_MISSING", `缺少 ${kind} Artifact：${id}`);
  }
  return result.json;
}
