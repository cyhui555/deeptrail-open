#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

APP_UID="${DEEPTRAIL_APP_UID:-10001}"
APP_GID="${DEEPTRAIL_APP_GID:-10001}"
MIGRATE_EXISTING_DATA_OWNER=0
INITIALIZE_SERVER_SECRET=0

usage() {
  cat <<'EOF'
用法：sudo bash infra/deploy/prepare-host.sh [--app-uid UID] [--app-gid GID] \
  [--migrate-existing-data-owner] [--initialize-server-secret]

初始化 /srv/deeptrail 与 /etc/deeptrail。
--initialize-server-secret 仅在 server.env 为空时生成强随机 JWT_SECRET，不打印其值。
EOF
}

while (($# > 0)); do
  case "$1" in
    --app-uid) APP_UID="${2:-}"; shift 2 ;;
    --app-gid) APP_GID="${2:-}"; shift 2 ;;
    --migrate-existing-data-owner) MIGRATE_EXISTING_DATA_OWNER=1; shift ;;
    --initialize-server-secret) INITIALIZE_SERVER_SECRET=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

[[ "${APP_UID}" =~ ^[0-9]+$ && "${APP_GID}" =~ ^[0-9]+$ ]] || die 'UID/GID 必须为数字。'
require_root
for command_name in chmod chown docker find install openssl stat; do require_command "${command_name}"; done
docker compose version >/dev/null

install -d -o root -g root -m 0755 "${DEPLOY_ROOT}" "${RELEASES_ROOT}" "${BUILDS_ROOT}"
install -d -o "${APP_UID}" -g "${APP_GID}" -m 0750 "${DATA_ROOT}" "${LOG_ROOT}" "${BACKUP_ROOT}"
install -d -o root -g root -m 0700 "${CONFIG_ROOT}"

existing_owner_mismatch="$(find "${DATA_ROOT}" "${LOG_ROOT}" "${BACKUP_ROOT}" -mindepth 1 \( ! -uid "${APP_UID}" -o ! -gid "${APP_GID}" \) -print -quit)"
if [[ -n "${existing_owner_mismatch}" ]]; then
  if [[ "${MIGRATE_EXISTING_DATA_OWNER}" -eq 1 ]]; then
    # 非 root 容器必须同时拥有 SQLite/WAL、上传、日志和备份目录。
    chown -R "${APP_UID}:${APP_GID}" "${DATA_ROOT}" "${LOG_ROOT}" "${BACKUP_ROOT}"
  else
    die "数据目录包含非 ${APP_UID}:${APP_GID} 文件；确认备份后使用 --migrate-existing-data-owner。"
  fi
fi

for env_file in "${SERVER_ENV_FILE}" "${WEB_ENV_FILE}" "${WEB_BUILD_ENV_FILE}"; do
  if [[ ! -e "${env_file}" ]]; then
    install -o root -g root -m 0600 /dev/null "${env_file}"
  else
    [[ -f "${env_file}" && ! -L "${env_file}" ]] || die "受控环境文件不能是符号链接：${env_file}"
    chown root:root "${env_file}"
    chmod 0600 "${env_file}"
  fi
done

if [[ ! -s "${SERVER_ENV_FILE}" ]]; then
  [[ "${INITIALIZE_SERVER_SECRET}" -eq 1 ]] || die "${SERVER_ENV_FILE} 为空；使用 --initialize-server-secret 或由管理员安全填写。"
  umask 077
  printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 48)" >"${SERVER_ENV_FILE}"
  log '已生成强随机 JWT_SECRET；值未输出。'
fi

validate_secret_file "${SERVER_ENV_FILE}" 1
validate_secret_file "${WEB_ENV_FILE}" 0
validate_secret_file "${WEB_BUILD_ENV_FILE}" 0
log '宿主目录与受控环境文件准备完成。'
