#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

RELEASE_ID=''
MAVEN_CACHE_VOLUME='deeptrail-maven-cache-v1'

usage() {
  cat <<'EOF'
用法：sudo bash infra/deploy/verify-target-regressions.sh [--release-id RELEASE_ID]

在目标机对不可变 Release 的精确源码运行固定服务端回归。依赖准备阶段不加载生产配置；
测试阶段关闭容器网络，源码只读挂载，且不挂载 Secret、生产数据库或日志。
EOF
}

while (($# > 0)); do
  case "$1" in
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

require_root
for command_name in docker flock git python3 readlink realpath; do
  require_command "${command_name}"
done
docker version >/dev/null

if [[ -n "${RELEASE_ID}" ]]; then
  validate_release_id "${RELEASE_ID}"
  RELEASE_DIRECTORY="${RELEASES_ROOT}/${RELEASE_ID}"
else
  RELEASE_DIRECTORY="$(current_release_directory)"
fi
[[ -n "${RELEASE_DIRECTORY}" ]] || die 'current release 不存在。'
validate_release_directory "${RELEASE_DIRECTORY}"
RELEASE_ID="$(basename "${RELEASE_DIRECTORY}")"

MANIFEST_PATH="${RELEASE_DIRECTORY}/release.json"
BUILD_DIRECTORY="${BUILDS_ROOT}/${RELEASE_ID}"
[[ -d "${BUILD_DIRECTORY}" && ! -L "${BUILD_DIRECTORY}" ]] ||
  die "缺少不可变 Release 源码目录：${BUILD_DIRECTORY}"
BUILD_CANONICAL="$(realpath -e "${BUILD_DIRECTORY}")"
BUILDS_CANONICAL="$(realpath -e "${BUILDS_ROOT}")"
[[ "${BUILD_CANONICAL}" == "${BUILDS_CANONICAL}/"* ]] ||
  die "构建目录越过受控根目录：${BUILD_CANONICAL}"

readarray -t manifest_values < <(python3 - "${MANIFEST_PATH}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    manifest = json.load(stream)
print(manifest["revision"])
print(manifest["images"]["server"]["bases"][0])
PY
)
REVISION="${manifest_values[0]:-}"
MAVEN_IMAGE="${manifest_values[1]:-}"
[[ "${REVISION}" =~ ^[0-9a-fA-F]{40,64}$ ]] || die 'release revision 不合法。'
validate_base_image_reference "${MAVEN_IMAGE}"

git_safe=(-c "safe.directory=${BUILD_CANONICAL}" -C "${BUILD_CANONICAL}")
[[ "$(git "${git_safe[@]}" rev-parse HEAD)" == "${REVISION}" ]] ||
  die '构建源码 HEAD 与 release revision 不一致。'
git "${git_safe[@]}" diff --quiet --
git "${git_safe[@]}" diff --cached --quiet --
docker image inspect "${MAVEN_IMAGE}" >/dev/null || die '固定 Maven 基础镜像不在目标机。'

exec 9>/run/lock/deeptrail-target-regressions.lock
flock -n 9 || die '已有目标机确定性回归正在执行。'
docker volume create "${MAVEN_CACHE_VOLUME}" >/dev/null

TEST_SELECTOR='TaskSchedulerTest,GeocodingServiceImplTest,PoiCoordinateEnricherTest,AiResponseParserTest,ItineraryAiServiceTest,AiQualityEvalTest'
common_args=(
  --rm
  --mount "type=bind,src=${BUILD_CANONICAL},dst=/source,readonly"
  --mount "type=volume,src=${MAVEN_CACHE_VOLUME},dst=/root/.m2"
  --tmpfs /work:rw,exec,size=2g
  --workdir /work
)

log "准备固定 Maven 测试运行时：${RELEASE_ID}@${REVISION}"
docker run "${common_args[@]}" "${MAVEN_IMAGE}" sh -ec '
  cp -a /source/. /work/
  mkdir -p apps/server/src/test/java/com/ai/travel/target
  cat >apps/server/src/test/java/com/ai/travel/target/DependencyWarmupTest.java <<"JAVA"
package com.ai.travel.target;

import org.junit.jupiter.api.Test;

class DependencyWarmupTest {
  @Test
  void resolvesTestRuntime() {
  }
}
JAVA
  mvn -B -f apps/server/pom.xml -Dtest=DependencyWarmupTest test
'

log '关闭回归容器网络并执行固定样例；不会加载生产 Secret 或 Provider 配置。'
docker run "${common_args[@]}" --network none "${MAVEN_IMAGE}" sh -ec "
  cp -a /source/. /work/
  mvn -o -B -f apps/server/pom.xml -Dtest=${TEST_SELECTOR} test
"

log "目标机确定性回归通过：${RELEASE_ID}@${REVISION}"
