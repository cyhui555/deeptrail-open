package com.ai.travel.e2e;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.security.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * E2E 测试基类，提供注册/登录/获取 Token 的公用方法。
 * 与 XiaohongshuE2ETest 保持一致的模式。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@AutoConfigureMockMvc
public abstract class E2ETestBase {

  @Autowired
  protected MockMvc mockMvc;

  @Autowired
  protected ItineraryTaskMapper itineraryTaskMapper;

  protected final ObjectMapper objectMapper = new ObjectMapper();

  /**
   * 创建测试用行程任务并关联到清单，返回 planId。
   * 测试环境下认证已禁用，手动设置 UserContext。
   *
   * @return planId
   */
  protected String createTripPlan() throws Exception {
    UserContext.setUserId(1L);
    // 先创建 itinerary_task 记录（createTripPlan 会校验任务存在）
    String taskId = "task-" + System.currentTimeMillis();
    ItineraryTask task = new ItineraryTask();
    task.setId(taskId);
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setUserId(1L);
    task.setRequestJson("{\"destination\":\"成都\"}");
    task.setResultJson("{\"summary\":\"成都一日游\",\"days\":[{\"day\":1,\"date\":\"2026-07-01\",\"schedule\":[{\"period\":\"上午\",\"poi\":{\"name\":\"宽窄巷子\",\"address\":\"成都市青羊区\",\"latitude\":30.67,\"longitude\":104.06}}]}]}");
    task.setCreatedAt(java.time.LocalDateTime.now());
    task.setCompletedAt(java.time.LocalDateTime.now());
    itineraryTaskMapper.insert(task);

    String body = "{\"title\":\"E2E测试行程\",\"taskId\":\"" + taskId + "\",\"plannedDate\":\"2026-07-01\"}";
    String resp = mockMvc.perform(post("/api/trips")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return JsonPath.read(resp, "$.data").toString();
  }

  /**
   * 开始打卡并返回首个打卡项 ID。
   * 先调用 startCheckin 接口，再查询打卡任务列表获取第一项的 ID。
   *
   * @param planId 清单 ID
   * @return 首个打卡项 ID（Long）
   */
  protected Long startCheckinAndFirstItemId(String planId) throws Exception {
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/checkin/start")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isOk());

    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    // 从 data[0].items[0].id 获取首个打卡项 ID（SQLite 返回 Integer，转为 Long）
    Number id = JsonPath.read(tasksResp, "$.data[0].items[0].id");
    return id.longValue();
  }
}
