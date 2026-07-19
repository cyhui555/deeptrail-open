import { isIP } from "node:net";
import path from "node:path";

const highConfidencePatterns = [
  ["private-key", /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g],
  ["github-token", /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/g],
  ["aws-access-key", /(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/g],
  ["google-api-key", /(?<![A-Za-z0-9_-])AIza[A-Za-z0-9_-]{30,}/g],
  ["slack-token", /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["stripe-live-key", /(?<![A-Za-z0-9])sk_live_[A-Za-z0-9]{16,}/g],
  ["openai-key", /(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ["jwt-literal", /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["url-embedded-credential", /https?:\/\/[^/\s:@]+:[^@\s/]+@/gi],
];

const quotedAssignmentPattern =
  /(?<![A-Za-z0-9_-])(?<key>(?:(?:api|access|secret)[_-]?(?:key|token)|(?:client|jwt|database|db)[_-]?secret|password|passwd|pwd|token|secret))(?![A-Za-z0-9_-])\s*[:=]\s*(?<quote>["'])(?<value>[^"'\r\n]{12,})\k<quote>/gim;
const configAssignmentPattern =
  /^\s*(?<key>[A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key)[A-Za-z0-9_.-]*)\s*[:=]\s*(?<value>[A-Za-z0-9_./+=:@-]{12,})\s*(?:#.*)?$/gim;
const ipv4Pattern = /(?<![0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9])/g;
const ipv6UrlPattern = /https?:\/\/\[([0-9a-f:]+)\]/gi;
const networkSensitivePath = /^(?:infra\/|docs\/(?:archive|memory|operations|requirements)\/)/;

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function isPlaceholderValue(value) {
  return /\$\{|\{\{|<[^>]+>|example|placeholder|change.?me|replace|your[_-]|dummy|fake|not.?a.?real|not.?configured|provider-key-not-configured|\*{3,}|x{4,}|test-only|dev-only/i.test(
    value,
  );
}

function looksHighEntropy(value) {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  const diversity = new Set(value).size / value.length;
  return value.length >= 20 && classes >= 3 && diversity >= 0.4;
}

function isOneWayPasswordHash(value) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)
    || /^\$(?:argon2|scrypt)\$/i.test(value);
}

export function isPublicIpv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = octets;
  if ([0, 10, 127].includes(a) || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(value) {
  if (isIP(value) !== 6) return false;
  const normalized = value.toLowerCase();
  return normalized !== "::1" && !normalized.startsWith("fc") && !normalized.startsWith("fd")
    && !normalized.startsWith("fe8") && !normalized.startsWith("fe9")
    && !normalized.startsWith("fea") && !normalized.startsWith("feb");
}

function hasLikelyNetworkContext(content, index) {
  const before = content.slice(Math.max(0, index - 100), index);
  return /https?:\/\/(?:[^@\s/]+@)?$/i.test(before)
    || /(?:\bssh\s+(?:[^@\s]+@)?|@)$/i.test(before)
    || /(?:(?:host|hostname|origin|url|endpoint|server)\b|主机|入口|服务器|目标)[^\r\n]{0,60}$/i.test(before);
}

export function validateTrackedPath(relativePath) {
  const normalized = normalizePath(relativePath);
  const name = path.posix.basename(normalized).toLowerCase();
  const violations = [];
  const isEnvironmentTemplate = /\.env\.(?:example|sample|template)$/.test(name)
    || /(?:^|\.)env\.example$/.test(name);

  if (!isEnvironmentTemplate && (name === ".env" || /^\.env\./.test(name))) {
    violations.push("tracked-environment-file");
  }
  if (/^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)$/.test(name)
      || /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(name)
      || /^(?:credentials?|secrets?)(?:\.|$)/.test(name)) {
    violations.push("tracked-credential-file");
  }
  if (/\.(?:sqlite3?|db|dump|bak|backup)$/.test(name)) {
    violations.push("tracked-data-file");
  }
  if (/(?:^|\/)(?:test-results|playwright-report|artifacts|logs?)(?:\/|$)/.test(normalized)) {
    violations.push("tracked-generated-artifact");
  }
  return violations;
}

export function scanText(content, relativePath, options = {}) {
  const normalized = normalizePath(relativePath);
  const violations = [];

  for (const [category, pattern] of highConfidencePatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) violations.push(category);
  }

  const testLikePath = /(?:^|\/)(?:tests?|fixtures?)(?:\/|$)|(?:test|spec|e2e|fixture)\.[^/]+$/i.test(normalized);
  quotedAssignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(quotedAssignmentPattern)) {
    if (!isPlaceholderValue(match.groups.value)
        && !isOneWayPasswordHash(match.groups.value)
        && (!testLikePath || looksHighEntropy(match.groups.value))) {
      violations.push("credential-assignment");
      break;
    }
  }

  if (/\.(?:env|example|sample|template|ya?ml|json|properties|toml|ini|conf|xml|md|sh|ps1|sql)$/i.test(normalized)) {
    configAssignmentPattern.lastIndex = 0;
    for (const match of content.matchAll(configAssignmentPattern)) {
      if (!isPlaceholderValue(match.groups.value)
          && !isOneWayPasswordHash(match.groups.value)
          && looksHighEntropy(match.groups.value)) {
        violations.push("credential-assignment");
        break;
      }
    }
  }

  const inspectNetwork = options.detectAnyPublicNetwork
    || options.detectLikelyPublicNetwork
    || networkSensitivePath.test(normalized);
  if (inspectNetwork) {
    ipv4Pattern.lastIndex = 0;
    for (const match of content.matchAll(ipv4Pattern)) {
      if (isPublicIpv4(match[0])
          && (options.detectAnyPublicNetwork || hasLikelyNetworkContext(content, match.index))) {
        violations.push("public-network-address");
        break;
      }
    }

    ipv6UrlPattern.lastIndex = 0;
    for (const match of content.matchAll(ipv6UrlPattern)) {
      if (isPublicIpv6(match[1])) {
        violations.push("public-network-address");
        break;
      }
    }
  }

  return [...new Set(violations)];
}

export function validateWorkflowText(content, relativePath = "") {
  const violations = [];
  if (/^\s*pull_request_target\s*:/m.test(content)) violations.push("pull-request-target-trigger");
  const isReadOnly = /^permissions:\s*\r?\n\s+contents:\s*read\s*$/m.test(content);
  const isConstrainedAuthor = normalizePath(relativePath) === ".github/workflows/automation-pr-author.yml"
    && validateAutomationAuthorWorkflow(content).length === 0;
  const isConstrainedArchiveFinalizer = normalizePath(relativePath)
      === ".github/workflows/archive-pr-finalizer.yml"
    && validateArchiveFinalizerWorkflow(content).length === 0;
  if (!isReadOnly && !isConstrainedAuthor && !isConstrainedArchiveFinalizer) {
    violations.push("workflow-permissions-not-read-only");
  }
  if (/\bsecrets\.[A-Za-z_][A-Za-z0-9_]*/.test(content)) {
    violations.push("workflow-secret-reference");
  }
  if (/(?:^|\s)(?:test-results|artifacts)\//m.test(content) || /trace\.zip/i.test(content)) {
    violations.push("raw-runtime-artifact-upload");
  }
  return violations;
}

export function validateArchiveFinalizerWorkflow(content) {
  const failures = [];
  const requiredFragments = [
    /^on:\s*\r?\n  workflow_run:\s*$/m,
    /^    workflows: \[CI\]\s*$/m,
    /^    types: \[completed\]\s*$/m,
    /^permissions:\s*\{\}\s*$/m,
    /^    if: github\.repository == 'cyhui555\/deeptrail-open' && github\.event\.workflow_run\.name == 'CI' && github\.event\.workflow_run\.event == 'pull_request' && github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.head_repository\.full_name == github\.repository\s*$/m,
    /^      contents: write\s*$/m,
    /^      pull-requests: write\s*$/m,
    /^      checks: read\s*$/m,
    /^        uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\s+# v7\s*$/m,
    /^          ref: main\s*$/m,
    /^          persist-credentials: false\s*$/m,
    /^          GH_TOKEN: \$\{\{ github\.token \}\}\s*$/m,
    /^          WORKFLOW_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}\s*$/m,
    /^          EXPECTED_HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}\s*$/m,
    /^        run: node scripts\/github\/archive-pr-finalizer\.mjs\s*$/m,
  ];
  if (requiredFragments.some((pattern) => !pattern.test(content))) {
    failures.push("archive-finalizer-workflow-contract-missing");
  }
  const triggerBlock = content.match(/^on:\s*\r?\n(?<body>(?:^ {2,}.*(?:\r?\n|$))*)/m)?.groups?.body ?? "";
  const triggers = [...triggerBlock.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]);
  if ([...content.matchAll(/^on:/gm)].length !== 1
      || triggers.length !== 1 || triggers[0] !== "workflow_run") {
    failures.push("archive-finalizer-workflow-trigger-too-broad");
  }
  const rootPermissions = [...content.matchAll(/^permissions:/gm)].length;
  const jobPermissions = [...content.matchAll(/^ {4}permissions:/gm)].length;
  if (rootPermissions !== 1 || jobPermissions !== 1) {
    failures.push("archive-finalizer-workflow-permissions-duplicated");
  }
  const writePermissions = [...content.matchAll(/^\s+[a-z-]+:\s*write\s*$/gm)]
    .map((match) => match[0].trim());
  if (writePermissions.join("|") !== "contents: write|pull-requests: write") {
    failures.push("archive-finalizer-workflow-permissions-drift");
  }
  if ([...content.matchAll(/^\s+run:/gm)].length !== 1
      || [...content.matchAll(/^\s+uses:/gm)].length !== 1) {
    failures.push("archive-finalizer-workflow-step-drift");
  }
  if ([...content.matchAll(/^\s+GH_TOKEN:/gm)].length !== 1) {
    failures.push("archive-finalizer-workflow-token-drift");
  }
  return failures;
}

export function validateAutomationAuthorWorkflow(content) {
  const failures = [];
  const requiredFragments = [
    /^on:\s*\r?\n  workflow_dispatch:\s*$/m,
    /^permissions:\s*\{\}\s*$/m,
    /^    if: github\.actor == github\.repository_owner && github\.ref == 'refs\/heads\/main' && github\.repository == 'cyhui555\/deeptrail-open'\s*$/m,
    /^      contents: write\s*$/m,
    /^      pull-requests: write\s*$/m,
    /^        uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\s+# v7\s*$/m,
    /^          ref: main\s*$/m,
    /^          persist-credentials: false\s*$/m,
    /^          GH_TOKEN: \$\{\{ github\.token \}\}\s*$/m,
    /^        run: node scripts\/github\/automation-pr-author\.mjs\s*$/m,
  ];
  if (requiredFragments.some((pattern) => !pattern.test(content))) failures.push("author-workflow-contract-missing");
  const triggerBlock = content.match(/^on:\s*\r?\n(?<body>(?:^ {2,}.*(?:\r?\n|$))*)/m)?.groups?.body ?? "";
  const triggers = [...triggerBlock.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]);
  if ([...content.matchAll(/^on:/gm)].length !== 1
      || triggers.length !== 1 || triggers[0] !== "workflow_dispatch") {
    failures.push("author-workflow-trigger-too-broad");
  }
  const rootPermissions = [...content.matchAll(/^permissions:/gm)].length;
  const jobPermissions = [...content.matchAll(/^ {4}permissions:/gm)].length;
  if (rootPermissions !== 1 || jobPermissions !== 1) failures.push("author-workflow-permissions-duplicated");
  const writePermissions = [...content.matchAll(/^\s+[a-z-]+:\s*write\s*$/gm)].map((match) => match[0].trim());
  if (writePermissions.join("|") !== "contents: write|pull-requests: write") {
    failures.push("author-workflow-permissions-drift");
  }
  if ([...content.matchAll(/^\s+run:/gm)].length !== 1 || [...content.matchAll(/^\s+uses:/gm)].length !== 1) {
    failures.push("author-workflow-step-drift");
  }
  if ([...content.matchAll(/^\s+GH_TOKEN:/gm)].length !== 1) failures.push("author-workflow-token-drift");
  return failures;
}
