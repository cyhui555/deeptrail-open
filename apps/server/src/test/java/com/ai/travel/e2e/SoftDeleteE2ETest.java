package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** E2E: 行程清单软删除（PRD #49）。 */
@Tag("e2e")
class SoftDeleteE2ETest extends E2ETestBase {

  @Test
  @DisplayName("删除清单后列表不出现，直接访问返回 404")
  void softDelete_hidesPlanFromList() throws Exception {
    String planId = createTripPlan();

    // 删除
    mockMvc.perform(delete("/api/trips/" + planId))
        .andExpect(status().isOk());

    // 列表中不应出现
    String listResp = mockMvc.perform(get("/api/trips"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    assertThat(listResp).doesNotContain(planId);
  }
}
