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

/** E2E: 地理围栏提示 - 200m 内/外打卡行为（PRD #44）。 */
@Tag("e2e")
class GeofenceE2ETest extends E2ETestBase {

  @Test
  @DisplayName("200m 内直接打卡成功，distance_meters < 200")
  void within200m_directCheckin() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 模拟 POI 坐标 30.67, 104.06（宽窄巷子），打卡位置偏差 ±0.0001°（约 10m）
    UserContext.setUserId(1L);
    String resp = mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("""
                {"lat":30.6701,"lng":104.0601,"accuracy":8,"source":"GPS"}
                """))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isTrue();
  }
}
