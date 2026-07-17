package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** E2E: GPS 降级 - 手动打卡（PRD #46）。 */
@Tag("e2e")
class GpsDegradationE2ETest extends E2ETestBase {

  @Test
  @DisplayName("无 GPS 坐标时手动打卡成功，source=MANUAL")
  void manualCheckin_withoutGps() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 不传 lat/lng，模拟 GPS 不可用（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    String resp = mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"source\":\"MANUAL\",\"note\":\"手动打卡\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isTrue();
  }
}
