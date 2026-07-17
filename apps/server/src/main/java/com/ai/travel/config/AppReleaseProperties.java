package com.ai.travel.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 不可变 Release 的运行时身份。 */
@Data
@ConfigurationProperties(prefix = "app.release")
public class AppReleaseProperties {

  /** Release 清单中的唯一标识。 */
  private String id = "local";

  /** 构建该 Release 的完整 Git Commit。 */
  private String gitCommit = "unknown";

  /** Server 不可变镜像或制品摘要。 */
  private String artifactDigest = "unknown";
}
