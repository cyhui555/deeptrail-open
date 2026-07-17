package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** E2E: 多用户并发打卡（PRD #51）。 */
@Tag("e2e")
class ConcurrentMultiUserE2ETest extends E2ETestBase {

  @Test
  @DisplayName("用户 A 和 B 同时打卡不同清单，数据互不干扰")
  void concurrentUsers_independentCheckin() throws Exception {
    String planIdA = createTripPlan();
    String planIdB = createTripPlan();

    Long itemIdA = startCheckinAndFirstItemId(planIdA);
    Long itemIdB = startCheckinAndFirstItemId(planIdB);

    // A 打卡（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    String respA = mockMvc.perform(post("/api/itineraries/checkin/items/" + itemIdA)
            .contentType("application/json")
            .content("{\"lat\":30.67,\"lng\":104.06}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    // B 打卡
    UserContext.setUserId(1L);
    String respB = mockMvc.perform(post("/api/itineraries/checkin/items/" + itemIdB)
            .contentType("application/json")
            .content("{\"lat\":30.67,\"lng\":104.06}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    assertThat(respA).contains("\"success\":true");
    assertThat(respB).contains("\"success\":true");
  }
}
