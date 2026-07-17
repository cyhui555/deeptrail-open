package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.info.Info;

class ReleaseInfoContributorTest {

  @Test
  @DisplayName("Actuator Info 只公开与清单一致的 Release 身份")
  void contribute_releaseIdentity_exposesOnlyApprovedFields() {
    AppReleaseProperties properties = new AppReleaseProperties();
    properties.setId("v0.2.0-test");
    properties.setGitCommit("8642554dbf77c43add46ec898716fb1ac88584b5");
    properties.setArtifactDigest("sha256:9ef42ee8948f");
    Info.Builder builder = new Info.Builder();

    new ReleaseInfoContributor(properties).contribute(builder);

    assertThat(builder.build().getDetails()).containsOnlyKeys("release");
    assertThat(builder.build().getDetails().get("release")).isEqualTo(Map.of(
        "id", "v0.2.0-test",
        "git-commit", "8642554dbf77c43add46ec898716fb1ac88584b5",
        "artifact-digest", "sha256:9ef42ee8948f"));
  }
}
