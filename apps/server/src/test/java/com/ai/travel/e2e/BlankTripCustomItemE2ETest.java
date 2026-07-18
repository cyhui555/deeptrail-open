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
import org.springframework.http.MediaType;

/** BUG-20260718-005：空白行程首个自定义地点的真实数据库回归。 */
@Tag("e2e")
class BlankTripCustomItemE2ETest extends E2ETestBase {

  @Test
  @DisplayName("空白行程首个地点刷新后仍存在且非所有者不可新增")
  void firstCustomItem_persistsAndRejectsOtherUser() throws Exception {
    UserContext.setUserId(1L);
    String createResponse = mockMvc.perform(post("/api/trips")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"title":"空白行程回归","plannedDate":"2026-08-01"}
                """))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    String planId = JsonPath.read(createResponse, "$.data").toString();

    UserContext.setUserId(1L);
    String addResponse = mockMvc.perform(
            post("/api/itineraries/checkin/trips/" + planId + "/custom-item")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name":"刷新后仍在的地点","period":"上午","address":"测试地址"}
                    """))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    assertThat(JsonPath.parse(addResponse).read("$.success", Boolean.class)).isTrue();

    // 再次 GET 模拟页面刷新，验证数据来自数据库而非前端临时状态。
    UserContext.setUserId(1L);
    String tasksResponse = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    DocumentContext tasks = JsonPath.parse(tasksResponse);
    assertThat(tasks.read("$.data.length()", Integer.class)).isEqualTo(1);
    assertThat(tasks.read("$.data[0].dayNumber", Integer.class)).isEqualTo(1);
    assertThat(tasks.read("$.data[0].items[0].poiName", String.class))
        .isEqualTo("刷新后仍在的地点");

    UserContext.setUserId(2L);
    String forbiddenResponse = mockMvc.perform(
            post("/api/itineraries/checkin/trips/" + planId + "/custom-item")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name":"越权地点","period":"下午"}
                    """))
        .andExpect(status().isForbidden())
        .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    DocumentContext forbidden = JsonPath.parse(forbiddenResponse);
    assertThat(forbidden.read("$.success", Boolean.class)).isFalse();
    assertThat(forbidden.read("$.errorCode", String.class)).isEqualTo("FORBIDDEN");
  }
}
