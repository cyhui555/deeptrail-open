package com.ai.travel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Tag("e2e")
@Tag("real-network")
class XiaohongshuE2ETest {

  @Autowired
  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    UserContext.clear();
  }

  @Test
  void xiaohongshuUrlGeneratesCorrectItinerary() throws Exception {
    String taskId = submitXiaohongshuTask("""
        {"url":"http://xhslink.com/o/4ZsyHhweRDE"}
        """);

    DocumentContext result = awaitCompletion(taskId);

    assertThat(result.read("$.summary", String.class)).isNotEmpty();
    assertThat(result.read("$.days", java.util.List.class)).isNotEmpty();

    String content = result.jsonString();
    assertThat(content).containsAnyOf(
        "小鱼山", "啤酒博物馆", "奥帆中心", "栈桥", "青岛", "海钓", "啤酒城");
  }

  @Test
  void xiaohongshuNoteContentGeneratesCorrectItinerary() throws Exception {
    String taskId = submitXiaohongshuTask("""
        {"noteContent":"周六出海海钓🎣，周天城里溜达🚶‍♀️ 小鱼山+啤酒博物馆+团岛市场+奥帆中心+栈桥。打工人周末往返青岛，打卡青岛啤酒城🍻"}
        """);

    DocumentContext result = awaitCompletion(taskId);

    assertThat(result.read("$.summary", String.class)).isNotEmpty();
    assertThat(result.read("$.days", java.util.List.class)).isNotEmpty();

    String content = result.jsonString();
    assertThat(content).containsAnyOf("小鱼山", "啤酒博物馆", "奥帆中心", "栈桥", "青岛", "海钓");
  }

  private String submitXiaohongshuTask(String jsonBody) throws Exception {
    // 测试环境认证已禁用，手动注入当前用户身份，
    // 使 ItineraryTaskService#submit 能通过 UserContext.getUserId() 设置 itinerary_task.user_id。
    UserContext.setUserId(1L);
    String responseBody = mockMvc.perform(post("/api/itineraries/from-xiaohongshu")
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString(StandardCharsets.UTF_8);

    return JsonPath.read(responseBody, "$.data.taskId");
  }

  private DocumentContext awaitCompletion(String taskId) throws Exception {
    long deadline = System.currentTimeMillis() + 120_000;

    while (System.currentTimeMillis() < deadline) {
      String responseBody = mockMvc.perform(get("/api/itineraries/tasks/" + taskId))
          .andExpect(status().isOk())
          .andReturn()
          .getResponse()
          .getContentAsString(StandardCharsets.UTF_8);

      DocumentContext ctx = JsonPath.parse(responseBody);
      String status = ctx.read("$.data.status", String.class);

      if ("COMPLETED".equals(status)) {
        Object result = ctx.read("$.data.result");
        assertThat(result).as("COMPLETED task should have non-null result").isNotNull();
        return JsonPath.parse(result);
      }
      if ("FAILED".equals(status)) {
        String error = ctx.read("$.data.errorMessage", String.class);
        throw new AssertionError("Task FAILED: " + error);
      }

      Thread.sleep(3000);
    }
    throw new AssertionError("Task " + taskId + " did not complete within 120s");
  }
}
