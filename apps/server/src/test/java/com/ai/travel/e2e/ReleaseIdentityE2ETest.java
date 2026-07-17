package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** E2E：运行中 Release 身份必须与不可变清单字段一一对应。 */
@Tag("e2e")
@TestPropertySource(properties = {
    "app.release.id=v0.2.0-e2e",
    "app.release.git-commit=8642554dbf77c43add46ec898716fb1ac88584b5",
    "app.release.artifact-digest=sha256:9ef42ee8948f"
})
class ReleaseIdentityE2ETest extends E2ETestBase {

  @Test
  @DisplayName("Actuator Info 返回且只返回三个 Release 清单字段")
  void actuatorInfo_releaseIdentity_matchesManifestContract() throws Exception {
    String response = mockMvc.perform(get("/actuator/info"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.release.id").value("v0.2.0-e2e"))
        .andExpect(jsonPath("$.release.git-commit")
            .value("8642554dbf77c43add46ec898716fb1ac88584b5"))
        .andExpect(jsonPath("$.release.artifact-digest").value("sha256:9ef42ee8948f"))
        .andReturn().getResponse().getContentAsString();

    Map<String, String> release = JsonPath.read(response, "$.release");
    assertThat(release).containsOnlyKeys("id", "git-commit", "artifact-digest");
  }
}
