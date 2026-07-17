#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

RELEASE_ID=''
SERVER_IMAGE=''
WEB_IMAGE=''
PORT=''
PUBLIC_ORIGIN=''
COOKIE_SECURE='false'
COMPOSE_SOURCE="${PROJECT_ROOT}/infra/docker/compose.production.yml"
RELEASE_JSON_SOURCE=''
OFFLINE=0
SKIP_BACKUP=0
DEPLOYMENT_STARTED=0

usage() {
  cat <<'EOF'
用法：sudo bash infra/deploy/deploy.sh \
  --release-id RELEASE_ID --server-image IMAGE_ID_OR_DIGEST --web-image IMAGE_ID_OR_DIGEST \
  --release-json PATH --port 30301 --public-origin http://deeptrail.example.invalid:30301 \
  [--cookie-secure true|false] [--offline] [--skip-backup]

--offline      镜像已导入或在本机完成构建，不执行 Registry pull。
--skip-backup  仅在存在另外一份已验证升级前备份时使用。
EOF
}

while (($# > 0)); do
  case "$1" in
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    --server-image) SERVER_IMAGE="${2:-}"; shift 2 ;;
    --web-image) WEB_IMAGE="${2:-}"; shift 2 ;;
    --release-json) RELEASE_JSON_SOURCE="${2:-}"; shift 2 ;;
    --compose-file) COMPOSE_SOURCE="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --public-origin) PUBLIC_ORIGIN="${2:-}"; shift 2 ;;
    --cookie-secure) COOKIE_SECURE="${2:-}"; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

require_root
for command_name in curl docker flock grep install mktemp mv python3 readlink realpath sed sort ss stat; do require_command "${command_name}"; done
[[ -n "${RELEASE_ID}" && -n "${SERVER_IMAGE}" && -n "${WEB_IMAGE}" && -n "${RELEASE_JSON_SOURCE}" ]] || die '缺少 release 或镜像参数。'
[[ -n "${PORT}" && -n "${PUBLIC_ORIGIN}" ]] || die '缺少 --port 或 --public-origin。'
validate_release_id "${RELEASE_ID}"
validate_image_reference "${SERVER_IMAGE}"
validate_image_reference "${WEB_IMAGE}"
validate_port "${PORT}"
validate_public_url "${PUBLIC_ORIGIN}"
[[ "${COOKIE_SECURE}" == 'true' || "${COOKIE_SECURE}" == 'false' ]] || die '--cookie-secure 只能是 true 或 false。'
[[ -f "${COMPOSE_SOURCE}" && -f "${RELEASE_JSON_SOURCE}" ]] || die 'Compose 或 release.json 不存在。'
validate_release_manifest "${RELEASE_JSON_SOURCE}" "${RELEASE_ID}" "${SERVER_IMAGE}" "${WEB_IMAGE}"
RELEASE_REVISION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["revision"])' "${RELEASE_JSON_SOURCE}")"
SERVER_ARTIFACT_DIGEST="${SERVER_IMAGE##*@}"
validate_secret_file "${SERVER_ENV_FILE}" 1
validate_secret_file "${WEB_ENV_FILE}" 0
grep -Eq '^JWT_SECRET=.{64,}$' "${SERVER_ENV_FILE}" || die 'server.env 缺少足够长度的 JWT_SECRET。'

docker compose version >/dev/null
install -d -o root -g root -m 0755 "${RELEASES_ROOT}"
exec 9>/run/lock/deeptrail-deploy.lock
flock -n 9 || die '已有另一个旅迹发布或回滚进程正在执行。'

RELEASE_DIRECTORY="${RELEASES_ROOT}/${RELEASE_ID}"
[[ ! -e "${RELEASE_DIRECTORY}" && ! -L "${RELEASE_DIRECTORY}" ]] || die "release 已存在且不可覆盖：${RELEASE_DIRECTORY}"
PREVIOUS_RELEASE="$(current_release_directory)"
if [[ -n "${PREVIOUS_RELEASE}" ]]; then
  validate_release_directory "${PREVIOUS_RELEASE}"
  previous_port="$(production_env_value "${PREVIOUS_RELEASE}" 'DEEPTRAIL_WEB_PORT')"
  if [[ "${previous_port}" != "${PORT}" ]] && ss -H -ltn "sport = :${PORT}" | grep -q .; then
    die "端口 ${PORT} 已被其他服务监听。"
  fi
elif ss -H -ltn "sport = :${PORT}" | grep -q .; then
  die "端口 ${PORT} 已被其他服务监听。"
fi

install -d -o root -g root -m 0755 "${RELEASE_DIRECTORY}"
install -o root -g root -m 0644 "${COMPOSE_SOURCE}" "${RELEASE_DIRECTORY}/compose.production.yml"
install -o root -g root -m 0644 "${RELEASE_JSON_SOURCE}" "${RELEASE_DIRECTORY}/release.json"
temporary_env="$(mktemp)"
cleanup() { rm -f -- "${temporary_env:-}"; }
on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "${DEPLOYMENT_STARTED}" -eq 1 ]]; then
    warn '新 release 未通过验收，current 未切换；停止未验收 Web/Server。'
    run_compose "${RELEASE_DIRECTORY}" stop web server >/dev/null 2>&1 || true
    warn '请先审查迁移兼容性，再调用 rollback.sh 恢复上一 release。'
  fi
  exit "${exit_code}"
}
trap cleanup EXIT
trap on_error ERR

umask 077
{
  printf 'DEEPTRAIL_SERVER_IMAGE=%s\n' "${SERVER_IMAGE}"
  printf 'DEEPTRAIL_WEB_IMAGE=%s\n' "${WEB_IMAGE}"
  printf 'DEEPTRAIL_RELEASE_ID=%s\n' "${RELEASE_ID}"
  printf 'DEEPTRAIL_GIT_COMMIT=%s\n' "${RELEASE_REVISION}"
  printf 'DEEPTRAIL_SERVER_ARTIFACT_DIGEST=%s\n' "${SERVER_ARTIFACT_DIGEST}"
  printf 'DEEPTRAIL_SERVER_ENV_FILE=%s\n' "${SERVER_ENV_FILE}"
  printf 'DEEPTRAIL_WEB_ENV_FILE=%s\n' "${WEB_ENV_FILE}"
  printf 'DEEPTRAIL_DATA_ROOT=%s\n' "${DATA_ROOT}"
  printf 'DEEPTRAIL_LOG_ROOT=%s\n' "${LOG_ROOT}"
  printf 'DEEPTRAIL_BACKUP_ROOT=%s\n' "${BACKUP_ROOT}"
  printf 'DEEPTRAIL_WEB_BIND=0.0.0.0\n'
  printf 'DEEPTRAIL_WEB_PORT=%s\n' "${PORT}"
  printf 'DEEPTRAIL_PUBLIC_ORIGIN=%s\n' "${PUBLIC_ORIGIN}"
  printf 'DEEPTRAIL_COOKIE_SECURE=%s\n' "${COOKIE_SECURE}"
  printf 'DEEPTRAIL_MANAGEMENT_ENDPOINTS=health,info,prometheus\n'
} >"${temporary_env}"
install -o root -g root -m 0600 "${temporary_env}" "${RELEASE_DIRECTORY}/production.env"

run_compose "${RELEASE_DIRECTORY}" config --quiet
if [[ "${OFFLINE}" -eq 1 ]]; then
  log '离线模式：检查本机不可变镜像。'
else
  run_compose "${RELEASE_DIRECTORY}" pull
fi
ensure_compose_images_present "${RELEASE_DIRECTORY}"
validate_release_image_metadata "${RELEASE_DIRECTORY}"

if [[ -n "${PREVIOUS_RELEASE}" && "${PREVIOUS_RELEASE}" != "${RELEASE_DIRECTORY}" ]]; then
  if [[ "${SKIP_BACKUP}" -eq 1 ]]; then warn '按显式参数跳过升级前备份。'; else create_verified_backup "${PREVIOUS_RELEASE}"; fi
fi

DEPLOYMENT_STARTED=1
run_compose "${RELEASE_DIRECTORY}" up -d --remove-orphans
bash "${SCRIPT_DIR}/verify.sh" --release-dir "${RELEASE_DIRECTORY}" --public-url "http://127.0.0.1:${PORT}"
atomic_switch_current "${RELEASE_DIRECTORY}"
DEPLOYMENT_STARTED=0
trap - ERR
log "发布完成，current 已切换到：${RELEASE_DIRECTORY}"
if [[ -n "${PREVIOUS_RELEASE}" ]]; then log "上一 release：$(basename "${PREVIOUS_RELEASE}")"; fi
