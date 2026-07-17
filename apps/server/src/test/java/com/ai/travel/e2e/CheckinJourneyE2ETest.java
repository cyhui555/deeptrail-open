package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * E2E: 完整打卡旅程（PRD #42）。
 * 创建清单 → 开始打卡 → 模拟 GPS 打卡 → 上传轨迹 → 提交评价 → 查看报告。
 */
@Tag("e2e")
class CheckinJourneyE2ETest extends E2ETestBase {

  @Test
  @DisplayName("完整打卡旅程 - 从创建清单到生成报告")
  void fullCheckinJourney() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 1. 打卡（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"lat\":30.67,\"lng\":104.06,\"accuracy\":10}"))
        .andExpect(status().isOk());

    // 2. 上传轨迹点（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    String trackResp = mockMvc.perform(post("/api/trips/" + planId + "/track/points")
            .contentType("application/json")
            .content("""
                {"points":[{"latitude":30.67,"longitude":104.06,"accuracy":5,
                  "recordedAt":"2026-07-01T10:00:00"}]}
                """))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext trackCtx = JsonPath.parse(trackResp);
    assertThat(trackCtx.read("$.success", Boolean.class)).isTrue();

    // 3. 提交评价（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/review")
            .contentType("application/json")
            .content("{\"rating\":5,\"comment\":\"非常棒的旅程！\"}"))
        .andExpect(status().isOk());

    // 4. 查询旅程报告
    UserContext.setUserId(1L);
    String reviewResp = mockMvc.perform(get("/api/trips/" + planId + "/review"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

    DocumentContext ctx = JsonPath.parse(reviewResp);
    assertThat(ctx.read("$.data.rating", Integer.class)).isEqualTo(5);
    assertThat(ctx.read("$.data.userComment", String.class)).isEqualTo("非常棒的旅程！");
  }
}
