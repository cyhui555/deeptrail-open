# syntax=docker/dockerfile:1.7

ARG MAVEN_IMAGE=maven:3.9-eclipse-temurin-17
ARG JAVA_RUNTIME_IMAGE=eclipse-temurin:17-jre

FROM ${MAVEN_IMAGE} AS build
WORKDIR /workspace

COPY apps/server/pom.xml apps/server/pom.xml
COPY database database
COPY packages/config packages/config
RUN mvn -B -f apps/server/pom.xml dependency:go-offline

COPY apps/server/src apps/server/src
RUN mvn -B -f apps/server/pom.xml -DskipTests package

FROM ${JAVA_RUNTIME_IMAGE}

ARG BUILD_CREATED
ARG BUILD_REVISION
ARG BUILD_VERSION

LABEL org.opencontainers.image.created="${BUILD_CREATED}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.title="deeptrail-server"

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl sqlite3 \
    && groupadd --gid 10001 deeptrail \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin deeptrail \
    && install -d -o 10001 -g 10001 -m 0750 /app/data /app/log \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=10001:10001 /workspace/apps/server/target/travel-planner-*.jar app.jar

ENV APP_DATA_DIR=/app/data
ENV APP_LOG_DIR=/app/log
ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:8080/actuator/health/readiness || exit 1
USER 10001:10001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
