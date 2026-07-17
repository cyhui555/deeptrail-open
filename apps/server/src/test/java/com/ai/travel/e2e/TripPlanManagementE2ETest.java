package com.ai.travel.e2e;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** E2E: 行程清单管理 - 多任务版本切换（PRD #43）。 */
@Tag("e2e")
class TripPlanManagementE2ETest extends E2ETestBase {

  @Test
  @DisplayName("一个清单关联多个任务版本，切换执行版本")
  void multipleTaskVersions_switchActive() throws Exception {
    String planId = createTripPlan();

    // 添加第二个任务版本
    mockMvc.perform(post("/api/trips/" + planId + "/tasks")
            .contentType("application/json")
            .content("{\"taskId\":\"task-v2-uuid\"}"))
        .andExpect(status().isOk());

    // 切换执行版本
    mockMvc.perform(put("/api/trips/" + planId + "/active-task")
            .contentType("application/json")
            .content("{\"taskId\":\"task-v2-uuid\"}"))
        .andExpect(status().isOk());
  }
}
