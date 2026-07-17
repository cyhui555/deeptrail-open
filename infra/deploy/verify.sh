#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

RELEASE_DIRECTORY=''
PUBLIC_URL=''
RESTART=0

usage() {
  cat <<'EOF'
用法：
  sudo bash infra/deploy/verify.sh --current [--public-url URL] [--restart]
  sudo bash infra/deploy/verify.sh --release-id RELEASE_ID [--public-url URL] [--restart]
  sudo bash infra/deploy/verify.sh --release-dir PATH [--public-url URL] [--restart]
EOF
}

while (($# > 0)); do
  case "$1" in
    --current) RELEASE_DIRECTORY="$(current_release_directory)"; shift ;;
    --release-id) validate_release_id "${2:-}"; RELEASE_DIRECTORY="${RELEASES_ROOT}/${2:-}"; shift 2 ;;
    --release-dir) RELEASE_DIRECTORY="${2:-}"; shift 2 ;;
    --public-url) PUBLIC_URL="${2:-}"; shift 2 ;;
    --restart) RESTART=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

require_root
for command_name in curl docker grep python3 readlink realpath sed sort stat; do require_command "${command_name}"; done
[[ -n "${RELEASE_DIRECTORY}" ]] || die '必须指定 --current、--release-id 或 --release-dir。'
RELEASE_DIRECTORY="$(readlink -f "${RELEASE_DIRECTORY}")"
validate_release_directory "${RELEASE_DIRECTORY}"
validate_secret_file "${SERVER_ENV_FILE}" 1
validate_secret_file "${WEB_ENV_FILE}" 0
run_compose "${RELEASE_DIRECTORY}" config --quiet
ensure_compose_images_present "${RELEASE_DIRECTORY}"
validate_release_image_metadata "${RELEASE_DIRECTORY}"

if [[ "${RESTART}" -eq 1 ]]; then
  run_compose "${RELEASE_DIRECTORY}" restart server web
fi

deadline=$((SECONDS + 240))
while true; do
  running_services="$(run_compose "${RELEASE_DIRECTORY}" ps --services --status running)"
  missing_services=()
  for service in server web; do
    if ! grep -Fxq "${service}" <<<"${running_services}"; then missing_services+=("${service}"); fi
  done
  ((${#missing_services[@]} == 0)) && break
  ((SECONDS < deadline)) || die "服务未进入运行态：${missing_services[*]}"
  sleep 2
done

for service in server web; do
  container_id="$(run_compose "${RELEASE_DIRECTORY}" ps -q "${service}")"
  deadline=$((SECONDS + 180))
  while [[ "$(docker inspect "${container_id}" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')" != 'healthy' ]]; do
    ((SECONDS < deadline)) || die "${service} 未进入 healthy。"
    sleep 2
  done
done

port="$(production_env_value "${RELEASE_DIRECTORY}" 'DEEPTRAIL_WEB_PORT')"
validate_port "${port}"
published="$(run_compose "${RELEASE_DIRECTORY}" port web 3000)"
[[ "${published}" == *":${port}" ]] || die "Web 实际映射与批准端口不一致：${published}"
wait_for_http "http://127.0.0.1:${port}/login"
wait_for_http "http://127.0.0.1:${port}/api/health"
release_info="$(run_compose "${RELEASE_DIRECTORY}" exec -T server \
  curl --fail --silent http://127.0.0.1:8080/actuator/info)"
python3 - "${RELEASE_DIRECTORY}/release.json" "${release_info}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
info = json.loads(sys.argv[2]).get("release", {})
expected = {
    "id": manifest["releaseId"],
    "git-commit": manifest["revision"],
    "artifact-digest": manifest["images"]["server"]["reference"].split("@")[-1],
}
if info != expected:
    raise SystemExit("运行中 Release 身份与 release.json 不一致")
PY
verify_database "${RELEASE_DIRECTORY}"

if [[ -n "${PUBLIC_URL}" ]]; then
  validate_public_url "${PUBLIC_URL}"
  PUBLIC_URL="${PUBLIC_URL%/}"
  wait_for_http "${PUBLIC_URL}/login"
  wait_for_http "${PUBLIC_URL}/api/health"
fi
log "release 验收通过：${RELEASE_DIRECTORY}"
