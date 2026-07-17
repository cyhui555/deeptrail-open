package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** E2E: 数据隔离 - 用户 A 创建的清单对用户 B 不可见（PRD #48）。 */
@Tag("e2e")
class DataIsolationE2ETest extends E2ETestBase {

  @Test
  @DisplayName("用户 B 的列表中不出现用户 A 的清单")
  void userB_cannotSee_userAPlans() throws Exception {
    // 用户 A 创建清单
    String planIdA = createTripPlan();

    // 测试 profile 只跳过令牌解析，业务层仍必须按 UserContext 隔离数据。
    UserContext.setUserId(2L);
    String resp = mockMvc.perform(get("/api/trips"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    assertThat(resp).doesNotContain(planIdA);
  }
}
