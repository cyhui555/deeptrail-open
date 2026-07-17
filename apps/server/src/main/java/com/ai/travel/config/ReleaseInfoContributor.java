package com.ai.travel.config;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;

/** 向 Actuator 暴露可与不可变清单核对的脱敏 Release 身份。 */
@Component
public class ReleaseInfoContributor implements InfoContributor {

  private final AppReleaseProperties release;

  public ReleaseInfoContributor(AppReleaseProperties release) {
    this.release = release;
  }

  @Override
  public void contribute(Info.Builder builder) {
    // 只允许三个清单字段进入公开信息，避免环境变量、Secret 或用户内容被意外暴露。
    Map<String, String> identity = new LinkedHashMap<>();
    identity.put("id", release.getId());
    identity.put("git-commit", release.getGitCommit());
    identity.put("artifact-digest", release.getArtifactDigest());
    builder.withDetail("release", identity);
  }
}
