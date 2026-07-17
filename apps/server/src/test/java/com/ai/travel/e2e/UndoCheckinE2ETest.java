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

/** E2E: 撤销打卡 - 状态回退 + 重新打卡（PRD #45）。 */
@Tag("e2e")
class UndoCheckinE2ETest extends E2ETestBase {

  @Test
  @DisplayName("撤销后 POI 状态回退为 PENDING，重新打卡成功")
  void undoAndRedoCheckin() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 打卡（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"lat\":30.67,\"lng\":104.06,\"accuracy\":10}"))
        .andExpect(status().isOk());

    // 撤销
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId + "/undo")
            .contentType("application/json"))
        .andExpect(status().isOk());

    // 重新打卡
    UserContext.setUserId(1L);
    String resp = mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"lat\":39.9042,\"lng\":116.4074,\"accuracy\":10}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isTrue();
  }
}
