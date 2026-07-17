package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * E2E: 离线同步（PRD #47）。
 * 后端视角：验证批量上传打卡数据的能力（前端离线暂存后同步）。
 */
@Tag("e2e")
class OfflineSyncE2ETest extends E2ETestBase {

  @Test
  @DisplayName("离线打卡使用同一幂等键重试只完成一次")
  void batchSync_offlineCheckinDataIsIdempotent() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);
    String operationKey = "offline-checkin-" + itemId;

    // 模拟离线后批量同步 POI 的打卡数据（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("""
                {"idempotencyKey":"%s","lat":30.67,"lng":104.06,"accuracy":10}
                """.formatted(operationKey)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("""
                {"idempotencyKey":"%s","lat":30.67,"lng":104.06,"accuracy":10}
                """.formatted(operationKey)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    // 相同键重试不能重复递增 completedPoi。
    UserContext.setUserId(1L);
    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    Number completedPoi = com.jayway.jsonpath.JsonPath.read(
        tasksResp, "$.data[0].completedPoi");
    assertThat(completedPoi.intValue()).isEqualTo(1);
  }

  @Test
  @DisplayName("离线轨迹批次重复上传只保存新的客户端轨迹点")
  void batchSync_trackPointsAreDeduplicatedByClientPointId() throws Exception {
    String planId = createTripPlan();
    String body = """
        {"points":[
          {"clientPointId":"point-a","latitude":30.67,"longitude":104.06,
           "accuracy":10,"recordedAt":"2026-07-01T10:00:00Z"},
          {"clientPointId":"point-b","latitude":30.68,"longitude":104.07,
           "accuracy":10,"recordedAt":"2026-07-01T10:00:10Z"}
        ]}
        """;

    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/track/points")
            .contentType("application/json")
            .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(2));

    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/track/points")
            .contentType("application/json")
            .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(0));

    UserContext.setUserId(1L);
    mockMvc.perform(get("/api/trips/" + planId + "/track/points"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(2))
        .andExpect(jsonPath("$.data[0].recordedAt").value("2026-07-01T10:00:00Z"))
        .andExpect(jsonPath("$.data[1].recordedAt").value("2026-07-01T10:00:10Z"));

    // 后置非法时间必须让整批零写入，并进入统一参数错误响应。
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/track/points")
            .contentType("application/json")
            .content("""
                {"points":[
                  {"clientPointId":"point-before-invalid","latitude":30.69,"longitude":104.08,
                   "accuracy":10,"recordedAt":"2026-07-01T10:00:20Z"},
                  {"clientPointId":"point-invalid","latitude":30.67,"longitude":104.06,
                   "accuracy":10,"recordedAt":"not-a-time"}
                ]}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value(containsString("recordedAt 格式无效")));

    UserContext.setUserId(1L);
    mockMvc.perform(get("/api/trips/" + planId + "/track/points"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(2));
  }
}
