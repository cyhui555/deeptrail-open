#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd -P)"

DEPLOY_ROOT="${DEEPTRAIL_DEPLOY_ROOT:-/srv/deeptrail}"
CONFIG_ROOT="${DEEPTRAIL_CONFIG_ROOT:-/etc/deeptrail}"
RELEASES_ROOT="${DEPLOY_ROOT}/releases"
BUILDS_ROOT="${DEPLOY_ROOT}/builds"
CURRENT_LINK="${DEPLOY_ROOT}/current"
DATA_ROOT="${DEEPTRAIL_DATA_ROOT:-${DEPLOY_ROOT}/data}"
LOG_ROOT="${DEEPTRAIL_LOG_ROOT:-${DEPLOY_ROOT}/log}"
BACKUP_ROOT="${DEEPTRAIL_BACKUP_ROOT:-${DEPLOY_ROOT}/backups}"
SERVER_ENV_FILE="${DEEPTRAIL_SERVER_ENV_FILE:-${CONFIG_ROOT}/server.env}"
WEB_ENV_FILE="${DEEPTRAIL_WEB_ENV_FILE:-${CONFIG_ROOT}/web.env}"
WEB_BUILD_ENV_FILE="${DEEPTRAIL_WEB_BUILD_ENV_FILE:-${CONFIG_ROOT}/web-build.env}"

log() {
  printf '[deeptrail-deploy] %s\n' "$*" >&2
}

warn() {
  printf '[deeptrail-deploy] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[deeptrail-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || die '请使用 sudo/root 执行服务器部署脚本。'
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少必需命令：$1"
}

validate_release_id() {
  local release_id="$1"
  [[ "${release_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] ||
    die 'release ID 只能包含字母、数字、点、下划线和连字符，且最长 128 个字符。'
}

validate_port() {
  local port="$1"
  [[ "${port}" =~ ^[0-9]+$ ]] || die '端口必须为数字。'
  ((port >= 30301 && port <= 30400)) || die '旅迹端口必须位于 30301-30400。'
}

validate_public_url() {
  local url="$1"
  [[ "${url}" =~ ^https?://[^[:space:]]+$ ]] || die '公开地址必须是无空格的 http:// 或 https:// URL。'
}

validate_sha256() {
  [[ "$1" =~ ^[0-9a-fA-F]{64}$ ]] || die 'SHA-256 必须为 64 位十六进制。'
}

validate_image_reference() {
  local image_reference="$1"
  if [[ "${image_reference}" =~ @sha256:[0-9a-fA-F]{64}$ || "${image_reference}" =~ ^sha256:[0-9a-fA-F]{64}$ ]]; then
    return
  fi
  die "生产镜像必须固定到 Registry digest 或本地镜像 ID：${image_reference}"
}

validate_base_image_reference() {
  [[ "$1" =~ @sha256:[0-9a-fA-F]{64}$ ]] || die "基础镜像必须固定到 Registry digest：$1"
}

validate_secret_file() {
  local path="$1"
  local require_content="${2:-1}"
  [[ -f "${path}" && ! -L "${path}" ]] || die "缺少受控环境文件：${path}"
  if [[ "${require_content}" -eq 1 ]]; then
    [[ -s "${path}" ]] || die "受控环境文件为空：${path}"
  fi

  local owner mode
  owner="$(stat -c '%u:%g' "${path}")"
  mode="$(stat -c '%a' "${path}")"
  [[ "${owner}" == '0:0' ]] || die "${path} 必须由 root:root 持有，当前 UID:GID 为 ${owner}。"
  [[ "${mode}" == '600' || "${mode}" == '400' ]] ||
    die "${path} 权限必须为 0600 或 0400，当前为 ${mode}。"
}

validate_release_directory() {
  local release_directory="$1"
  [[ -d "${release_directory}" && ! -L "${release_directory}" ]] || die "release 目录不存在或为符号链接：${release_directory}"
  [[ -f "${release_directory}/compose.production.yml" ]] || die "release 缺少 compose.production.yml：${release_directory}"
  [[ -f "${release_directory}/production.env" ]] || die "release 缺少 production.env：${release_directory}"
  [[ -f "${release_directory}/release.json" ]] || die "release 缺少 release.json：${release_directory}"

  local canonical releases_canonical
  canonical="$(realpath -e "${release_directory}")"
  releases_canonical="$(realpath -e "${RELEASES_ROOT}")"
  [[ "${canonical}" == "${releases_canonical}/"* ]] || die "release 目录越过受控根目录：${canonical}"
}

validate_release_manifest() {
  local manifest_path="$1"
  local expected_release_id="$2"
  local expected_server_image="$3"
  local expected_web_image="$4"

  python3 - "${manifest_path}" "${expected_release_id}" "${expected_server_image}" "${expected_web_image}" <<'PY'
import json
import re
import sys

path, release_id, server_image, web_image = sys.argv[1:]
with open(path, encoding="utf-8") as stream:
    manifest = json.load(stream)

errors = []
expected_top = {"schemaVersion", "project", "releaseId", "revision", "createdAt", "platform", "sourceSha256", "images"}
if set(manifest) != expected_top:
    errors.append("顶层字段必须严格匹配 release schema")
if manifest.get("schemaVersion") != 1 or manifest.get("project") != "deeptrail":
    errors.append("schemaVersion/project 不正确")
if manifest.get("releaseId") != release_id:
    errors.append("releaseId 与部署参数不一致")
if manifest.get("platform") != "linux/amd64":
    errors.append("platform 必须为 linux/amd64")
if not re.fullmatch(r"[0-9a-fA-F]{40,64}", str(manifest.get("revision", ""))):
    errors.append("revision 必须为完整 Git commit")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", str(manifest.get("createdAt", ""))):
    errors.append("createdAt 必须为 UTC RFC 3339 秒级时间")
if not re.fullmatch(r"[0-9a-fA-F]{64}", str(manifest.get("sourceSha256", ""))):
    errors.append("sourceSha256 必须为 SHA-256")
images = manifest.get("images", {})
if not isinstance(images, dict) or set(images) != {"server", "web"}:
    errors.append("images 必须严格包含 server 和 web")
for role, expected_ref in (("server", server_image), ("web", web_image)):
    item = images.get(role, {}) if isinstance(images, dict) else {}
    if not isinstance(item, dict) or set(item) != {"reference", "bases"}:
        errors.append(f"{role} 必须严格包含 reference 和 bases")
        continue
    if item.get("reference") != expected_ref:
        errors.append(f"{role} 镜像引用与部署参数不一致")
    bases = item.get("bases")
    if not isinstance(bases, list) or not bases:
        errors.append(f"{role} bases 不能为空")
    elif any(not re.search(r"@sha256:[0-9a-fA-F]{64}$", str(base)) for base in bases):
        errors.append(f"{role} 基础镜像必须固定到 digest")
if errors:
    raise SystemExit("release.json 校验失败：" + "；".join(errors))
PY
}

write_release_manifest() {
  local output_path="$1" release_id="$2" revision="$3" created_at="$4" source_sha="$5"
  local server_reference="$6" maven_base="$7" java_base="$8" web_reference="$9" node_base="${10}"
  python3 - "${output_path}" "${release_id}" "${revision}" "${created_at}" "${source_sha}" \
    "${server_reference}" "${maven_base}" "${java_base}" "${web_reference}" "${node_base}" <<'PY'
import json
import sys

output, release_id, revision, created_at, source_sha, server, maven, java, web, node = sys.argv[1:]
manifest = {
    "schemaVersion": 1,
    "project": "deeptrail",
    "releaseId": release_id,
    "revision": revision,
    "createdAt": created_at,
    "platform": "linux/amd64",
    "sourceSha256": source_sha,
    "images": {
        "server": {"reference": server, "bases": [maven, java]},
        "web": {"reference": web, "bases": [node]},
    },
}
with open(output, "x", encoding="utf-8", newline="\n") as stream:
    json.dump(manifest, stream, ensure_ascii=False, indent=2)
    stream.write("\n")
PY
}

production_env_value() {
  local release_directory="$1" key="$2"
  sed -n "s/^${key}=//p" "${release_directory}/production.env" | tail -n 1
}

validate_release_image_metadata() {
  local release_directory="$1" manifest_path server_image web_image revision created version server_user web_user
  manifest_path="${release_directory}/release.json"
  server_image="$(production_env_value "${release_directory}" 'DEEPTRAIL_SERVER_IMAGE')"
  web_image="$(production_env_value "${release_directory}" 'DEEPTRAIL_WEB_IMAGE')"
  validate_image_reference "${server_image}"
  validate_image_reference "${web_image}"
  validate_release_manifest "${manifest_path}" "$(basename "${release_directory}")" "${server_image}" "${web_image}"
  revision="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["revision"])' "${manifest_path}")"
  created="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["createdAt"])' "${manifest_path}")"
  version="$(basename "${release_directory}")"

  for pair in "${server_image}:server" "${web_image}:web"; do
    local image="${pair%:*}" role="${pair##*:}"
    [[ "$(docker image inspect "${image}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')" == "${revision}" ]] || die "${role} OCI revision 不一致。"
    [[ "$(docker image inspect "${image}" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')" == "${version}" ]] || die "${role} OCI version 不一致。"
    [[ "$(docker image inspect "${image}" --format '{{ index .Config.Labels "org.opencontainers.image.created" }}')" == "${created}" ]] || die "${role} OCI created 不一致。"
  done

  server_user="$(docker image inspect "${server_image}" --format '{{ .Config.User }}')"
  web_user="$(docker image inspect "${web_image}" --format '{{ .Config.User }}')"
  [[ "${server_user}" == '10001:10001' || "${server_user}" == '10001' ]] || die "Server 镜像不是预期的非 root 用户：${server_user:-<empty>}"
  [[ "${web_user}" == 'node' || "${web_user}" == '1000' || "${web_user}" == '1000:1000' ]] || die "Web 镜像不是预期的非 root 用户：${web_user:-<empty>}"
}

run_compose() {
  local release_directory="$1"
  shift
  docker compose --env-file "${release_directory}/production.env" --file "${release_directory}/compose.production.yml" "$@"
}

ensure_compose_images_present() {
  local release_directory="$1" image
  while IFS= read -r image; do
    [[ -n "${image}" ]] || continue
    docker image inspect "${image}" >/dev/null
  done < <(run_compose "${release_directory}" config --images | sort -u)
}

current_release_directory() {
  if [[ -L "${CURRENT_LINK}" ]]; then
    readlink -f "${CURRENT_LINK}"
  fi
}

atomic_switch_current() {
  local release_directory="$1" temporary_link="${CURRENT_LINK}.tmp.$$"
  rm -f -- "${temporary_link}"
  ln -s -- "${release_directory}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${CURRENT_LINK}"
}

wait_for_http() {
  local url="$1" attempts="${2:-60}" interval="${3:-2}" attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 10 "${url}" >/dev/null; then
      return
    fi
    sleep "${interval}"
  done
  die "健康检查超时：${url}"
}

verify_database() {
  local release_directory="$1"
  run_compose "${release_directory}" --profile operations run --rm --no-deps ops -ec '
    test "$(sqlite3 /app/data/travel.db "PRAGMA integrity_check;")" = ok
    test -z "$(sqlite3 /app/data/travel.db "PRAGMA foreign_key_check;")"
  ' >/dev/null
}

create_verified_backup() {
  local release_directory="$1" backup_id
  backup_id="$(run_compose "${release_directory}" --profile operations run --rm --no-deps ops -ec '
    set -eu
    umask 077
    backup_id="$(date -u +%Y%m%d-%H%M%S)"
    target="/app/backups/${backup_id}"
    mkdir "$target"
    sqlite3 /app/data/travel.db ".backup ${target}/travel.db"
    test "$(sqlite3 "${target}/travel.db" "PRAGMA integrity_check;")" = ok
    test -z "$(sqlite3 "${target}/travel.db" "PRAGMA foreign_key_check;")"
    sha256sum "${target}/travel.db" >"${target}/travel.db.sha256"
    printf "%s\n" "$backup_id"
  ' | tail -n 1)"
  [[ "${backup_id}" =~ ^[0-9]{8}-[0-9]{6}$ ]] || die '备份完成但未取得有效 backup ID。'
  log "升级前 SQLite 备份已创建并独立校验：${backup_id}"
}
