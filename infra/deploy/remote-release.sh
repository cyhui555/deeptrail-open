#!/usr/bin/env bash

set -Eeuo pipefail

BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
BUNDLE=''
CHECKSUM_FILE=''
RELEASE_ID=''
REVISION=''
PORT='auto'
PUBLIC_HOST=''

usage() {
  cat <<'EOF'
用法：sudo bash remote-release.sh --bundle PATH --checksum PATH \
  --release-id RELEASE_ID --revision COMMIT [--port auto|30301] --public-host HOST

校验 Git bundle 后在目标机建立干净 checkout，解析固定基础镜像 digest，构建唯一镜像并发布。
这是无 Registry 时的目标环境构建入口，不替代干净远程 CI。
EOF
}

die_bootstrap() { printf '[deeptrail-bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

while (($# > 0)); do
  case "$1" in
    --bundle) BUNDLE="${2:-}"; shift 2 ;;
    --checksum) CHECKSUM_FILE="${2:-}"; shift 2 ;;
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    --revision) REVISION="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --public-host) PUBLIC_HOST="${2:-}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) die_bootstrap "未知参数：$1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || die_bootstrap '请使用 sudo/root 执行。'
[[ -f "${BUNDLE}" && -f "${CHECKSUM_FILE}" ]] || die_bootstrap 'Git bundle 或校验文件不存在。'
[[ "${RELEASE_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || die_bootstrap '非法 release ID。'
[[ "${REVISION}" =~ ^[0-9a-fA-F]{40,64}$ ]] || die_bootstrap 'revision 必须为完整 commit。'
[[ "${PUBLIC_HOST}" =~ ^[A-Za-z0-9.-]+$ ]] || die_bootstrap '公开主机名不合法。'
for command_name in awk docker git install python3 seq sha256sum; do command -v "${command_name}" >/dev/null 2>&1 || die_bootstrap "缺少 ${command_name}"; done

checksum_directory="$(cd -- "$(dirname -- "${CHECKSUM_FILE}")" && pwd -P)"
(cd "${checksum_directory}" && sha256sum -c "$(basename "${CHECKSUM_FILE}")") >/dev/null
SOURCE_SHA256="$(sha256sum "${BUNDLE}" | awk '{print $1}')"
DEPLOY_ROOT='/srv/deeptrail'
BUILD_ROOT="${DEPLOY_ROOT}/builds/${RELEASE_ID}"
[[ ! -e "${BUILD_ROOT}" && ! -L "${BUILD_ROOT}" ]] || die_bootstrap "build 已存在且不可覆盖：${BUILD_ROOT}"
install -d -o root -g root -m 0755 "${DEPLOY_ROOT}/builds"
git clone --no-checkout "${BUNDLE}" "${BUILD_ROOT}"
git -C "${BUILD_ROOT}" checkout --detach "${REVISION}"
[[ "$(git -C "${BUILD_ROOT}" rev-parse HEAD)" == "${REVISION}" ]] || die_bootstrap 'checkout revision 不一致。'
[[ -z "$(git -C "${BUILD_ROOT}" status --porcelain)" ]] || die_bootstrap '目标机构建 checkout 不是干净状态。'

# shellcheck source=common.sh
source "${BUILD_ROOT}/infra/deploy/common.sh"
bash "${BUILD_ROOT}/infra/deploy/prepare-host.sh" --initialize-server-secret

if [[ "${PORT}" == 'auto' ]]; then
  current="$(current_release_directory)"
  if [[ -n "${current}" ]]; then
    PORT="$(production_env_value "${current}" 'DEEPTRAIL_WEB_PORT')"
    validate_port "${PORT}"
  else
    PORT=''
    for candidate in $(seq 30301 30400); do
      if python3 - "${candidate}" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket()
try:
    sock.bind(("0.0.0.0", port))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
      then PORT="${candidate}"; break; fi
    done
    [[ -n "${PORT}" ]] || die '30301-30400 没有可用端口。'
  fi
else
  validate_port "${PORT}"
fi

resolve_digest() {
  local tag="$1" reference
  docker pull "${tag}" >/dev/null
  reference="$(docker image inspect "${tag}" --format '{{ index .RepoDigests 0 }}')"
  validate_base_image_reference "${reference}"
  printf '%s\n' "${reference}"
}

MAVEN_IMAGE="$(resolve_digest 'maven:3.9-eclipse-temurin-17')"
JAVA_IMAGE="$(resolve_digest 'eclipse-temurin:17-jre')"
NODE_IMAGE="$(resolve_digest 'node:24-alpine')"
RELEASE_JSON="${BUILD_ROOT}/release.json"
bash "${BUILD_ROOT}/infra/deploy/build-images.sh" \
  --release-id "${RELEASE_ID}" \
  --maven-image "${MAVEN_IMAGE}" \
  --java-image "${JAVA_IMAGE}" \
  --node-image "${NODE_IMAGE}" \
  --source-sha256 "${SOURCE_SHA256}" \
  --web-build-env "${WEB_BUILD_ENV_FILE}" \
  --pnpm-registry 'https://registry.npmmirror.com' \
  --load --output "${RELEASE_JSON}"

SERVER_IMAGE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["images"]["server"]["reference"])' "${RELEASE_JSON}")"
WEB_IMAGE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["images"]["web"]["reference"])' "${RELEASE_JSON}")"
PUBLIC_ORIGIN="http://${PUBLIC_HOST}:${PORT}"
bash "${BUILD_ROOT}/infra/deploy/deploy.sh" \
  --release-id "${RELEASE_ID}" --server-image "${SERVER_IMAGE}" --web-image "${WEB_IMAGE}" \
  --release-json "${RELEASE_JSON}" --port "${PORT}" --public-origin "${PUBLIC_ORIGIN}" \
  --cookie-secure false --offline
bash "${BUILD_ROOT}/infra/deploy/open-port.sh" --port "${PORT}"
bash "${BUILD_ROOT}/infra/deploy/verify.sh" --current --public-url "http://127.0.0.1:${PORT}" --restart

printf 'DEEPTRAIL_RELEASE_ID=%s\n' "${RELEASE_ID}"
printf 'DEEPTRAIL_REVISION=%s\n' "${REVISION}"
printf 'DEEPTRAIL_PORT=%s\n' "${PORT}"
printf 'DEEPTRAIL_URL=%s\n' "${PUBLIC_ORIGIN}"
