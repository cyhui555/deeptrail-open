# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-alpine
ARG PNPM_REGISTRY=https://registry.npmmirror.com

FROM ${NODE_IMAGE} AS build
ARG PNPM_REGISTRY
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm config set registry "${PNPM_REGISTRY}" \
    && pnpm install --frozen-lockfile --filter @deeptrail/web...

COPY apps/web apps/web
ENV BACKEND_INTERNAL_URL=http://server:8080
# NEXT_PUBLIC_* 会进入浏览器产物；通过 BuildKit secret 避免值出现在构建参数和镜像历史。
RUN --mount=type=secret,id=deeptrail_web_public_env \
    set -a; \
    if [ -f /run/secrets/deeptrail_web_public_env ]; then . /run/secrets/deeptrail_web_public_env; fi; \
    set +a; \
    pnpm --filter @deeptrail/web build

FROM ${NODE_IMAGE}

ARG BUILD_CREATED
ARG BUILD_REVISION
ARG BUILD_VERSION

LABEL org.opencontainers.image.created="${BUILD_CREATED}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.title="deeptrail-web"

WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/apps/web
USER node
CMD ["node", "server.js"]
