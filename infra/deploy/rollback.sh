#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

TARGET_RELEASE_ID=''
PUBLIC_URL=''
SCHEMA_CONFIRMED=0
SKIP_BACKUP=0
ROLLBACK_STARTED=0

usage() {
  cat <<'EOF'
用法：sudo bash infra/deploy/rollback.sh --release-id PREVIOUS_RELEASE_ID \
  --confirm-schema-compatible [--public-url URL] [--skip-backup]

只回滚不可变代码/配置；不会覆盖数据库或用户文件。
EOF
}

while (($# > 0)); do
  case "$1" in
    --release-id) TARGET_RELEASE_ID="${2:-}"; shift 2 ;;
    --confirm-schema-compatible) SCHEMA_CONFIRMED=1; shift ;;
    --public-url) PUBLIC_URL="${2:-}"; shift 2 ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

require_root
for command_name in curl docker flock python3 readlink realpath sed sort stat; do require_command "${command_name}"; done
[[ -n "${TARGET_RELEASE_ID}" ]] || die '缺少 --release-id。'
[[ "${SCHEMA_CONFIRMED}" -eq 1 ]] || die '必须先审查迁移并提供 --confirm-schema-compatible。'
validate_release_id "${TARGET_RELEASE_ID}"
exec 9>/run/lock/deeptrail-deploy.lock
flock -n 9 || die '已有另一个旅迹发布或回滚进程正在执行。'

CURRENT_RELEASE="$(current_release_directory)"
[[ -n "${CURRENT_RELEASE}" ]] || die 'current 不存在，无法回滚。'
TARGET_RELEASE="${RELEASES_ROOT}/${TARGET_RELEASE_ID}"
validate_release_directory "${CURRENT_RELEASE}"
validate_release_directory "${TARGET_RELEASE}"
CURRENT_RELEASE="$(readlink -f "${CURRENT_RELEASE}")"
TARGET_RELEASE="$(readlink -f "${TARGET_RELEASE}")"
[[ "${CURRENT_RELEASE}" != "${TARGET_RELEASE}" ]] || die '目标 release 已经是 current。'
run_compose "${TARGET_RELEASE}" config --quiet
ensure_compose_images_present "${TARGET_RELEASE}"
validate_release_image_metadata "${TARGET_RELEASE}"
if [[ "${SKIP_BACKUP}" -eq 1 ]]; then warn '按显式参数跳过回滚前备份。'; else create_verified_backup "${CURRENT_RELEASE}"; fi

on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "${ROLLBACK_STARTED}" -eq 1 ]]; then
    warn '目标 release 验收失败，恢复原 current release。'
    run_compose "${CURRENT_RELEASE}" up -d --remove-orphans || true
  fi
  exit "${exit_code}"
}
trap on_error ERR
ROLLBACK_STARTED=1
run_compose "${TARGET_RELEASE}" up -d --remove-orphans
verify_args=(--release-dir "${TARGET_RELEASE}")
if [[ -n "${PUBLIC_URL}" ]]; then verify_args+=(--public-url "${PUBLIC_URL}"); fi
bash "${SCRIPT_DIR}/verify.sh" "${verify_args[@]}"
atomic_switch_current "${TARGET_RELEASE}"
ROLLBACK_STARTED=0
trap - ERR
log "回滚完成，current 已切换到：${TARGET_RELEASE}"
