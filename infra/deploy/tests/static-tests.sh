#!/usr/bin/env bash

set -Eeuo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
DEPLOY_DIR="$(cd -- "${TEST_DIR}/.." >/dev/null 2>&1 && pwd -P)"
TMPDIR="${DEPLOY_TEST_TMPDIR:-${DEPLOY_DIR}}"
export TMPDIR

if command -v python3 >/dev/null 2>&1; then
  PYTHON_COMMAND='python3'
elif command -v python >/dev/null 2>&1; then
  PYTHON_COMMAND='python'
else
  printf '缺少 Python，无法测试 release manifest。\n' >&2
  exit 1
fi
python3() { command "${PYTHON_COMMAND}" "$@"; }

temporary_root="$(mktemp -d "${TMPDIR}/.deeptrail-deploy-test.XXXXXX")"
export DEEPTRAIL_DEPLOY_ROOT="${temporary_root}/deploy"
# shellcheck source=../common.sh
source "${DEPLOY_DIR}/common.sh"

cleanup_test() {
  rm -f -- "${env_contract_file:-}"
  if [[ -n "${release_directory:-}" && "${release_directory}" == "${temporary_root}/"* ]]; then
    rm -f -- "${release_directory}/compose.production.yml" "${release_directory}/production.env" "${manifest_path:-}"
    rmdir -- "${release_directory}" 2>/dev/null || true
  fi
  rmdir -- "${RELEASES_ROOT}" "${DEEPTRAIL_DEPLOY_ROOT}" "${temporary_root}" 2>/dev/null || true
}
trap cleanup_test EXIT

for script in common.sh build-images.sh prepare-host.sh deploy.sh verify.sh rollback.sh open-port.sh remote-release.sh verify-target-regressions.sh; do
  bash -n "${DEPLOY_DIR}/${script}"
done
for script in build-images.sh prepare-host.sh deploy.sh verify.sh rollback.sh open-port.sh remote-release.sh verify-target-regressions.sh; do
  bash "${DEPLOY_DIR}/${script}" --help >/dev/null
done
grep -Fq "node:24-alpine" "${DEPLOY_DIR}/remote-release.sh"
grep -Fq "ARG NODE_IMAGE=node:24-alpine" "${DEPLOY_DIR}/../docker/web.Dockerfile"
grep -Fq "https://registry.npmmirror.com" "${DEPLOY_DIR}/remote-release.sh"
grep -Fq "PUBLIC_HOST=''" "${DEPLOY_DIR}/remote-release.sh"
grep -Fq 'DEEPTRAIL_DEPLOY_HOST' "${DEPLOY_DIR}/publish.ps1"
grep -Fq 'ARG PNPM_REGISTRY=https://registry.npmmirror.com' "${DEPLOY_DIR}/../docker/web.Dockerfile"
grep -Fq '/tmp:exec,size=64m,uid=10001,gid=10001,mode=1770' \
  "${DEPLOY_DIR}/../docker/compose.production.yml"
grep -Fq 'DEEPTRAIL_SERVER_ARTIFACT_DIGEST' "${DEPLOY_DIR}/deploy.sh"
grep -Fq 'APP_ARTIFACT_DIGEST' "${DEPLOY_DIR}/../docker/compose.production.yml"
grep -Fq 'recover_release_services "${PREVIOUS_RELEASE}"' "${DEPLOY_DIR}/deploy.sh"
grep -Fq -- '--network none' "${DEPLOY_DIR}/verify-target-regressions.sh"
grep -Fq 'dst=/source,readonly' "${DEPLOY_DIR}/verify-target-regressions.sh"
grep -Fq 'DependencyWarmupTest' "${DEPLOY_DIR}/verify-target-regressions.sh"
if grep -Eq '/etc/deeptrail|server\.env|production\.env' "${DEPLOY_DIR}/verify-target-regressions.sh"; then
  die '目标机回归脚本不得加载生产配置。'
fi

validate_release_id 'v0.2.0-20260716-220000-5becf81206a5'
if (validate_release_id '../escape') >/dev/null 2>&1; then die '非法 release ID 未被拒绝。'; fi
validate_port 30301
if (validate_port 30401) >/dev/null 2>&1; then die '越界端口未被拒绝。'; fi

env_contract_file="${temporary_root}/web.env"
printf 'AMAP_REST_KEY=test-rest-key\n' >"${env_contract_file}"
validate_required_env_key "${env_contract_file}" 'AMAP_REST_KEY'
printf 'AMAP_REST_KEY=\n' >"${env_contract_file}"
if (validate_required_env_key "${env_contract_file}" 'AMAP_REST_KEY') >/dev/null 2>&1; then
  die '空的必需部署配置未被拒绝。'
fi
printf 'AMAP_REST_KEY=first\nAMAP_REST_KEY=second\n' >"${env_contract_file}"
if (validate_required_env_key "${env_contract_file}" 'AMAP_REST_KEY') >/dev/null 2>&1; then
  die '重复的必需部署配置未被拒绝。'
fi
printf 'AMAP_REST_KEY=valid\nAMAP_REST_KEY=\n' >"${env_contract_file}"
if (validate_required_env_key "${env_contract_file}" 'AMAP_REST_KEY') >/dev/null 2>&1; then
  die '有效值与后置空值混合时未被拒绝。'
fi
printf 'AMAP_REST_KEY=valid\nAMAP_REST_KEY= \n' >"${env_contract_file}"
if (validate_required_env_key "${env_contract_file}" 'AMAP_REST_KEY') >/dev/null 2>&1; then
  die '有效值与后置空白值混合时未被拒绝。'
fi
printf 'NEXT_PUBLIC_AMAP_KEY=test-public-key\nNEXT_PUBLIC_AMAP_SECURITY_CODE=test-security-code\n' >"${env_contract_file}"
validate_required_env_key "${env_contract_file}" 'NEXT_PUBLIC_AMAP_KEY'
validate_required_env_key "${env_contract_file}" 'NEXT_PUBLIC_AMAP_SECURITY_CODE'
printf 'NEXT_PUBLIC_AMAP_KEY=test-public-key\n' >"${env_contract_file}"
if (validate_required_env_key "${env_contract_file}" 'NEXT_PUBLIC_AMAP_SECURITY_CODE') >/dev/null 2>&1; then
  die '缺失 NEXT_PUBLIC_AMAP_SECURITY_CODE 时未被拒绝。'
fi
grep -Eq '^[[:space:]]*validate_required_env_key "\$\{WEB_BUILD_ENV\}" '\''NEXT_PUBLIC_AMAP_KEY'\''[[:space:]]*$' \
  "${DEPLOY_DIR}/build-images.sh"
grep -Eq '^[[:space:]]*validate_required_env_key "\$\{WEB_BUILD_ENV\}" '\''NEXT_PUBLIC_AMAP_SECURITY_CODE'\''[[:space:]]*$' \
  "${DEPLOY_DIR}/build-images.sh"
grep -Eq '^[[:space:]]*validate_required_env_key "\$\{WEB_ENV_FILE\}" '\''AMAP_REST_KEY'\''[[:space:]]*$' \
  "${DEPLOY_DIR}/deploy.sh"
python3 - "${DEPLOY_DIR}/deploy.sh" <<'PY'
import sys

lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
verify_calls = [
    index for index, line in enumerate(lines)
    if line.startswith('bash "${SCRIPT_DIR}/verify.sh" --release-dir "${RELEASE_DIRECTORY}"')
]
switch_calls = [
    index for index, line in enumerate(lines)
    if line == 'atomic_switch_current "${RELEASE_DIRECTORY}"'
]
if len(verify_calls) != 1 or len(switch_calls) != 1:
    raise SystemExit("部署必须且只能包含一次 release 验收和 current 原子切换")
verify_index = verify_calls[0]
if verify_index + 1 >= len(lines) or lines[verify_index + 1].strip() != '--public-url "http://127.0.0.1:${PORT}" --map-smoke':
    raise SystemExit("release 验收必须显式启用真实地图探针")
if verify_index >= switch_calls[0]:
    raise SystemExit("真实地图探针必须在 current 原子切换前执行")
PY

zero_digest="$(printf '0%.0s' {1..64})"
one_digest="$(printf '1%.0s' {1..64})"
two_digest="$(printf '2%.0s' {1..64})"
server_image="sha256:${zero_digest}"
web_image="sha256:${one_digest}"
validate_image_reference "${server_image}"
if (validate_image_reference 'deeptrail-server:latest') >/dev/null 2>&1; then die '漂移镜像 tag 未被拒绝。'; fi

mkdir -p "${RELEASES_ROOT}"
release_directory="${RELEASES_ROOT}/v0.2.0-20260716-220000-5becf81206a5"
mkdir "${release_directory}"
manifest_path="${release_directory}/release.json"
write_release_manifest "${manifest_path}" "$(basename "${release_directory}")" \
  '5becf81206a5bdf8bf21446cb555b575a3e493e6' '2026-07-16T14:00:00Z' "${two_digest}" \
  "${server_image}" "maven:3.9@sha256:${zero_digest}" "eclipse-temurin:17@sha256:${one_digest}" \
  "${web_image}" "node:24@sha256:${two_digest}"
printf 'services: {}\n' >"${release_directory}/compose.production.yml"
cat >"${release_directory}/production.env" <<EOF
DEEPTRAIL_SERVER_IMAGE=${server_image}
DEEPTRAIL_WEB_IMAGE=${web_image}
EOF
validate_release_directory "${release_directory}"
validate_release_manifest "${manifest_path}" "$(basename "${release_directory}")" "${server_image}" "${web_image}"
if (validate_release_manifest "${manifest_path}" 'wrong-release' "${server_image}" "${web_image}") >/dev/null 2>&1; then
  die 'manifest 身份不一致未被拒绝。'
fi

MOCK_SERVER_USER='10001:10001'
docker() {
  local arguments="$*"
  case "${arguments}" in
    *org.opencontainers.image.revision*) printf '5becf81206a5bdf8bf21446cb555b575a3e493e6\n' ;;
    *org.opencontainers.image.version*) printf '%s\n' "$(basename "${release_directory}")" ;;
    *org.opencontainers.image.created*) printf '2026-07-16T14:00:00Z\n' ;;
    *"${server_image}"*Config.User*) printf '%s\n' "${MOCK_SERVER_USER}" ;;
    *Config.User*) printf 'node\n' ;;
    *) die "Docker mock 收到未知参数：${arguments}" ;;
  esac
}
validate_release_image_metadata "${release_directory}"
if (MOCK_SERVER_USER='root'; validate_release_image_metadata "${release_directory}") >/dev/null 2>&1; then
  die 'Server root 用户未被拒绝。'
fi

RECOVERY_COMPOSE_RESULT=0
RECOVERY_HTTP_RESULT=0
RECOVERY_PORT=30301
RECOVERY_URLS=''
run_compose() {
  [[ "$1" == '/srv/deeptrail/releases/previous' ]] || return 1
  shift
  [[ "$*" == 'up -d --remove-orphans' ]] || return 1
  return "${RECOVERY_COMPOSE_RESULT}"
}
production_env_value() {
  [[ "$1" == '/srv/deeptrail/releases/previous' && "$2" == 'DEEPTRAIL_WEB_PORT' ]] || return 1
  printf '%s\n' "${RECOVERY_PORT}"
}
curl() {
  local url="${*: -1}"
  RECOVERY_URLS+="${url}"$'\n'
  return "${RECOVERY_HTTP_RESULT}"
}
sleep() { :; }

recover_release_services '/srv/deeptrail/releases/previous'
grep -Fxq 'http://127.0.0.1:30301/login' <<<"${RECOVERY_URLS}" || die '恢复流程未验证登录页。'
grep -Fxq 'http://127.0.0.1:30301/api/health' <<<"${RECOVERY_URLS}" || die '恢复流程未验证 API 健康。'
if (RECOVERY_COMPOSE_RESULT=1; recover_release_services '/srv/deeptrail/releases/previous') >/dev/null 2>&1; then
  die '上一 release 启动失败时恢复流程错误返回成功。'
fi
if (RECOVERY_PORT=30299; recover_release_services '/srv/deeptrail/releases/previous') >/dev/null 2>&1; then
  die '上一 release 端口越界时恢复流程错误返回成功。'
fi
if (RECOVERY_HTTP_RESULT=1; recover_release_services '/srv/deeptrail/releases/previous') >/dev/null 2>&1; then
  die '上一 release 健康检查失败时恢复流程错误返回成功。'
fi

printf 'DEPLOY_SCRIPT_STATIC_TESTS_OK\n'
