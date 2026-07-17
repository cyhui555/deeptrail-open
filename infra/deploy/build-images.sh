#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
INVOCATION_ROOT="$(pwd -P)"

RELEASE_ID=''
MAVEN_IMAGE=''
JAVA_IMAGE=''
NODE_IMAGE=''
REGISTRY=''
OUTPUT_PATH='release.json'
SOURCE_SHA256=''
WEB_BUILD_ENV=''
PNPM_REGISTRY='https://registry.npmmirror.com'
DELIVERY_MODE=''

usage() {
  cat <<'EOF'
用法：bash infra/deploy/build-images.sh \
  --maven-image 'maven:...@sha256:<digest>' \
  --java-image 'eclipse-temurin:...@sha256:<digest>' \
  --node-image 'node:...@sha256:<digest>' \
  --source-sha256 <git-bundle-sha256> \
  (--push --registry registry.example.com/team | --load) \
  [--release-id RELEASE_ID] [--web-build-env PATH] [--pnpm-registry HTTPS_URL] [--output PATH]

生产构建要求干净 Git 工作树、固定 digest 的基础镜像和不可覆盖的 release manifest。
--web-build-env 只允许 NEXT_PUBLIC_AMAP_KEY/NEXT_PUBLIC_AMAP_SECURITY_CODE，并通过 BuildKit secret 注入。
EOF
}

while (($# > 0)); do
  case "$1" in
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    --maven-image) MAVEN_IMAGE="${2:-}"; shift 2 ;;
    --java-image) JAVA_IMAGE="${2:-}"; shift 2 ;;
    --node-image) NODE_IMAGE="${2:-}"; shift 2 ;;
    --source-sha256) SOURCE_SHA256="${2:-}"; shift 2 ;;
    --web-build-env) WEB_BUILD_ENV="${2:-}"; shift 2 ;;
    --pnpm-registry) PNPM_REGISTRY="${2:-}"; shift 2 ;;
    --registry) REGISTRY="${2:-}"; shift 2 ;;
    --output) OUTPUT_PATH="${2:-}"; shift 2 ;;
    --push)
      [[ -z "${DELIVERY_MODE}" ]] || die '--push 与 --load 只能选择一个。'
      DELIVERY_MODE='push'; shift ;;
    --load)
      [[ -z "${DELIVERY_MODE}" ]] || die '--push 与 --load 只能选择一个。'
      DELIVERY_MODE='load'; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

for command_name in docker git python3; do require_command "${command_name}"; done
[[ -n "${MAVEN_IMAGE}" && -n "${JAVA_IMAGE}" && -n "${NODE_IMAGE}" ]] || die '缺少基础镜像参数。'
[[ -n "${SOURCE_SHA256}" ]] || die '缺少 --source-sha256。'
[[ -n "${DELIVERY_MODE}" ]] || die '必须选择 --push 或 --load。'
validate_base_image_reference "${MAVEN_IMAGE}"
validate_base_image_reference "${JAVA_IMAGE}"
validate_base_image_reference "${NODE_IMAGE}"
validate_sha256 "${SOURCE_SHA256}"
[[ "${PNPM_REGISTRY}" =~ ^https://[A-Za-z0-9][A-Za-z0-9./_-]*$ ]] \
  || die '--pnpm-registry 必须是无凭据、无查询参数的 HTTPS URL。'

if [[ -n "${WEB_BUILD_ENV}" ]]; then
  [[ -f "${WEB_BUILD_ENV}" && ! -L "${WEB_BUILD_ENV}" ]] || die "Web 构建环境文件不存在或为链接：${WEB_BUILD_ENV}"
  if grep -Ev '^(NEXT_PUBLIC_AMAP_KEY|NEXT_PUBLIC_AMAP_SECURITY_CODE)=[^[:cntrl:]]*$|^[[:space:]]*(#.*)?$' "${WEB_BUILD_ENV}" | grep -q .; then
    die 'Web 构建环境文件只允许两个 NEXT_PUBLIC_AMAP_* 键。'
  fi
fi

if [[ "${OUTPUT_PATH}" != /* ]]; then OUTPUT_PATH="${INVOCATION_ROOT}/${OUTPUT_PATH}"; fi
[[ ! -e "${OUTPUT_PATH}" && ! -L "${OUTPUT_PATH}" ]] || die "输出文件已存在，不会覆盖：${OUTPUT_PATH}"
if [[ "${DELIVERY_MODE}" == 'push' ]]; then
  [[ -n "${REGISTRY}" ]] || die '--push 必须提供 --registry。'
  REGISTRY="${REGISTRY%/}"
  [[ "${REGISTRY}" != *://* && "${REGISTRY}" != *[[:space:]]* ]] || die '--registry 不能包含 URL scheme 或空格。'
else
  [[ -z "${REGISTRY}" ]] || die '--load 不接受 --registry。'
fi

cd "${PROJECT_ROOT}"
[[ -z "$(git status --porcelain)" ]] || die '生产镜像必须从干净 Git 工作树构建。'
BUILD_REVISION="$(git rev-parse HEAD)"
[[ "${BUILD_REVISION}" =~ ^[0-9a-fA-F]{40,64}$ ]] || die '无法取得完整 Git revision。'
BUILD_CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [[ -z "${RELEASE_ID}" ]]; then RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)-${BUILD_REVISION:0:12}"; fi
validate_release_id "${RELEASE_ID}"

if [[ "${DELIVERY_MODE}" == 'push' ]]; then
  SERVER_TAG="${REGISTRY}/deeptrail-server:${RELEASE_ID}"
  WEB_TAG="${REGISTRY}/deeptrail-web:${RELEASE_ID}"
  output_args=(--push --provenance=mode=max --sbom=true)
else
  SERVER_TAG="deeptrail-server:${RELEASE_ID}"
  WEB_TAG="deeptrail-web:${RELEASE_ID}"
  output_args=(--load)
fi

docker buildx version >/dev/null
docker buildx build \
  --platform linux/amd64 \
  --file infra/docker/server.Dockerfile \
  --build-arg "MAVEN_IMAGE=${MAVEN_IMAGE}" \
  --build-arg "JAVA_RUNTIME_IMAGE=${JAVA_IMAGE}" \
  --build-arg "BUILD_CREATED=${BUILD_CREATED}" \
  --build-arg "BUILD_REVISION=${BUILD_REVISION}" \
  --build-arg "BUILD_VERSION=${RELEASE_ID}" \
  --build-arg "PNPM_REGISTRY=${PNPM_REGISTRY}" \
  --tag "${SERVER_TAG}" "${output_args[@]}" .

web_secret_args=()
if [[ -n "${WEB_BUILD_ENV}" ]]; then
  web_secret_args=(--secret "id=deeptrail_web_public_env,src=${WEB_BUILD_ENV}")
fi
docker buildx build \
  --platform linux/amd64 \
  --file infra/docker/web.Dockerfile \
  --build-arg "NODE_IMAGE=${NODE_IMAGE}" \
  --build-arg "BUILD_CREATED=${BUILD_CREATED}" \
  --build-arg "BUILD_REVISION=${BUILD_REVISION}" \
  --build-arg "BUILD_VERSION=${RELEASE_ID}" \
  "${web_secret_args[@]}" \
  --tag "${WEB_TAG}" "${output_args[@]}" .

if [[ "${DELIVERY_MODE}" == 'push' ]]; then
  server_digest="$(docker buildx imagetools inspect "${SERVER_TAG}" --format '{{.Manifest.Digest}}')"
  web_digest="$(docker buildx imagetools inspect "${WEB_TAG}" --format '{{.Manifest.Digest}}')"
  validate_image_reference "${SERVER_TAG%:${RELEASE_ID}}@${server_digest}"
  validate_image_reference "${WEB_TAG%:${RELEASE_ID}}@${web_digest}"
  SERVER_REFERENCE="${SERVER_TAG%:${RELEASE_ID}}@${server_digest}"
  WEB_REFERENCE="${WEB_TAG%:${RELEASE_ID}}@${web_digest}"
else
  SERVER_REFERENCE="$(docker image inspect "${SERVER_TAG}" --format '{{ .Id }}')"
  WEB_REFERENCE="$(docker image inspect "${WEB_TAG}" --format '{{ .Id }}')"
fi
validate_image_reference "${SERVER_REFERENCE}"
validate_image_reference "${WEB_REFERENCE}"

umask 022
write_release_manifest "${OUTPUT_PATH}" "${RELEASE_ID}" "${BUILD_REVISION}" "${BUILD_CREATED}" \
  "${SOURCE_SHA256}" "${SERVER_REFERENCE}" "${MAVEN_IMAGE}" "${JAVA_IMAGE}" "${WEB_REFERENCE}" "${NODE_IMAGE}"
validate_release_manifest "${OUTPUT_PATH}" "${RELEASE_ID}" "${SERVER_REFERENCE}" "${WEB_REFERENCE}"
log "镜像构建完成：${SERVER_REFERENCE}"
log "镜像构建完成：${WEB_REFERENCE}"
log "release manifest：${OUTPUT_PATH}"
