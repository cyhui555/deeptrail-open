#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

PORT=''

usage() {
  cat <<'EOF'
用法：sudo bash infra/deploy/open-port.sh --port 30301

只开放一个已经由当前旅迹 release 监听且通过本机健康检查的 TCP 端口。
支持 active UFW 或 firewalld；不会修改云安全组，也不会开放整个端口段。
EOF
}

while (($# > 0)); do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

require_root
require_command curl
[[ -n "${PORT}" ]] || die '缺少 --port。'
validate_port "${PORT}"
current="$(current_release_directory)"
[[ -n "${current}" ]] || die 'current release 不存在。'
validate_release_directory "${current}"
[[ "$(production_env_value "${current}" 'DEEPTRAIL_WEB_PORT')" == "${PORT}" ]] || die '请求端口与 current release 不一致。'
wait_for_http "http://127.0.0.1:${PORT}/login" 10 1

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow "${PORT}/tcp" comment 'deeptrail web'
  log "UFW 已允许 ${PORT}/tcp。"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state 2>/dev/null | grep -q '^running$'; then
  firewall-cmd --permanent --add-port="${PORT}/tcp"
  firewall-cmd --reload
  log "firewalld 已允许 ${PORT}/tcp。"
else
  warn '未发现 active UFW/firewalld；未修改 raw iptables/nftables。请另行核对云安全组。'
fi
printf 'DEEPTRAIL_PORT=%s\n' "${PORT}"
