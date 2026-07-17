package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.dto.request.SaveNodeRevisionRequest;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.NodeRevision;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.NodeRevisionMapper;
import com.ai.travel.security.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * E2E: 节点修正完整流程。
 *
 * <ol>
 *   <li>创建已完成任务 → 保存节点修正（地理 + 交通）</li>
 *   <li>UPSERT 验证：二次保存行数保持 1、updated_at 刷新</li>
 *   <li>落地到 CheckinTask → checkin_item 携带修正值</li>
 *   <li>删除修正 → 列表清空</li>
 * </ol>
 */
@Tag("e2e")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class NodeRevisionE2ETest extends E2ETestBase {

  @Autowired
  private NodeRevisionMapper nodeRevisionMapper;

  @Autowired
  private CheckinItemMapper checkinItemMapper;

  private final ObjectMapper objectMapper = new ObjectMapper();

  private String taskId;

  @BeforeEach
  void setUpTask() {
    UserContext.setUserId(1L);
    // 创建已完成任务（含结构化日程）
    taskId = "task-node-rev-" + System.currentTimeMillis();
    ItineraryTask task = new ItineraryTask();
    task.setId(taskId);
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setUserId(1L);
    task.setRequestJson("{\"destination\":\"杭州\"}");
    task.setResultJson(
        "{\"summary\":\"杭州一日游\","
            + "\"days\":[{\"day\":1,"
            + "\"schedule\":["
            + "{\"period\":\"上午\",\"description\":\"游西湖\","
            + "\"poi\":{\"name\":\"西湖\",\"latitude\":30.25,\"longitude\":120.15,"
            + "\"address\":\"杭州市西湖区\"}},"
            + "{\"period\":\"下午\",\"description\":\"逛河坊街\","
            + "\"poi\":{\"name\":\"河坊街\",\"latitude\":30.24,\"longitude\":120.16,"
            + "\"address\":\"杭州市上城区\"}}"
            + "]}]}");
    task.setCreatedAt(LocalDateTime.now());
    task.setCompletedAt(LocalDateTime.now());
    itineraryTaskMapper.insert(task);
  }

  @AfterEach
  void cleanUp() {
    // 清理节点修正
    List<NodeRevision> rows = nodeRevisionMapper.selectList(
        new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<NodeRevision>()
            .eq("task_id", taskId));
    for (NodeRevision row : rows) {
      nodeRevisionMapper.deleteById(row.getId());
    }
    // 清理任务
    itineraryTaskMapper.deleteById(taskId);
    UserContext.clear();
  }

  @Test
  @Order(1)
  @DisplayName("保存节点修正（地理 + 交通）→ 列表返回 1 条")
  void saveRevision_geoAndTransport() throws Exception {
    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setCorrectedLat(30.7465);
    req.setCorrectedLng(120.7558);
    req.setTransportMode("WALK");
    req.setTransportDuration(10);
    req.setTransportDesc("沿湖步行");

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.correctedLat").value(30.7465))
        .andExpect(jsonPath("$.data.correctedLng").value(120.7558))
        .andExpect(jsonPath("$.data.transportMode").value("WALK"))
        .andExpect(jsonPath("$.data.transportDuration").value(10))
        .andExpect(jsonPath("$.data.transportCorrected").value(true))
        .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

    // DB 中只有 1 行
    List<NodeRevision> rows = nodeRevisionMapper.selectList(
        new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<NodeRevision>()
            .eq("task_id", taskId));
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).getOriginalJson()).contains("西湖");

    // 列表接口返回 1 条
    UserContext.setUserId(1L);
    mockMvc.perform(get("/api/itineraries/tasks/" + taskId + "/node-revisions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(1))
        .andExpect(jsonPath("$.data[0].dayIndex").value(1))
        .andExpect(jsonPath("$.data[0].itemIndex").value(0));
  }

  @Test
  @Order(2)
  @DisplayName("UPSERT：二次保存同 task/day/item → 行数保持 1、updated_at 刷新")
  void saveRevision_upsert() throws Exception {
    SaveNodeRevisionRequest req1 = new SaveNodeRevisionRequest();
    req1.setDayIndex(1);
    req1.setItemIndex(0);
    req1.setTransportMode("WALK");
    req1.setTransportDuration(10);

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req1)))
        .andExpect(status().isOk());

    LocalDateTime firstUpdatedAt = nodeRevisionMapper.selectList(
        new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<NodeRevision>()
            .eq("task_id", taskId)).get(0).getUpdatedAt();

    // 等待 1ms 确保 updated_at 可能不同（SQLite 毫秒精度）
    Thread.sleep(50);

    // 第二次保存：改 duration
    SaveNodeRevisionRequest req2 = new SaveNodeRevisionRequest();
    req2.setDayIndex(1);
    req2.setItemIndex(0);
    req2.setTransportMode("DRIVE");
    req2.setTransportDuration(25);

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req2)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.transportMode").value("DRIVE"))
        .andExpect(jsonPath("$.data.transportDuration").value(25));

    List<NodeRevision> rows = nodeRevisionMapper.selectList(
        new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<NodeRevision>()
            .eq("task_id", taskId));
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).getTransportMode()).isEqualTo(com.ai.travel.enums.TransportMode.DRIVE);
    assertThat(rows.get(0).getTransportDuration()).isEqualTo(25);
    assertThat(rows.get(0).getUpdatedAt()).isAfterOrEqualTo(firstUpdatedAt);
  }

  @Test
  @Order(3)
  @DisplayName("越界 dayIndex → success=false + VALIDATION_FAILED")
  void saveRevision_outOfBounds_returnsError() throws Exception {
    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(99);
    req.setItemIndex(0);
    req.setTransportMode("WALK");

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("越界")));
  }

  @Test
  @Order(4)
  @DisplayName("半对坐标（仅 lat）→ success=false + VALIDATION_FAILED")
  void saveRevision_partialCoordinates_returnsError() throws Exception {
    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setCorrectedLat(30.0);

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("同时")));
  }

  @Test
  @Order(5)
  @DisplayName("非法交通方式 → success=false + VALIDATION_FAILED")
  void saveRevision_invalidTransportMode_returnsError() throws Exception {
    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setTransportMode("FLYING_CAR");

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("交通")));
  }

  @Test
  @Order(6)
  @DisplayName("落地到 CheckinTask → checkin_item 携带修正坐标和交通")
  void startCheckin_copiesRevisionToItems() throws Exception {
    // 先保存节点修正
    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setCorrectedLat(30.7465);
    req.setCorrectedLng(120.7558);
    req.setTransportMode("DRIVE");
    req.setTransportDuration(25);
    req.setTransportDesc("经复兴大桥");

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req)))
        .andExpect(status().isOk());

    // 创建清单并落地打卡任务
    String planBody = "{\"title\":\"节点修正落地测试\",\"taskId\":\"" + taskId
        + "\",\"plannedDate\":\"2026-07-01\"}";
    UserContext.setUserId(1L);
    String planResp = mockMvc.perform(post("/api/trips")
            .contentType(MediaType.APPLICATION_JSON)
            .content(planBody))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    String planId = JsonPath.read(planResp, "$.data");

    // 开始打卡（落地）
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/checkin/start")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isOk());

    // 查询打卡项，验证第一个 item 携带修正值
    UserContext.setUserId(1L);
    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    Number firstItemId = JsonPath.read(tasksResp, "$.data[0].items[0].id");
    CheckinItem firstItem = checkinItemMapper.selectById(firstItemId.longValue());

    assertThat(firstItem).isNotNull();
    assertThat(firstItem.getCorrectedLat()).isEqualTo(30.7465);
    assertThat(firstItem.getCorrectedLng()).isEqualTo(120.7558);
    // transportToNext JSON 包含 mode=DRIVE
    assertThat(firstItem.getTransportToNext()).contains("DRIVE");
    assertThat(firstItem.getTransportToNext()).contains("复兴大桥");
  }

  @Test
  @Order(7)
  @DisplayName("删除节点修正 → 列表清空")
  void deleteRevision_clearsList() throws Exception {
    // 先保存
    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setTransportMode("WALK");
    req.setTransportDuration(10);

    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/tasks/" + taskId + "/node-revisions")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(req)))
        .andExpect(status().isOk());

    // 删除
    UserContext.setUserId(1L);
    mockMvc.perform(delete("/api/itineraries/tasks/" + taskId + "/node-revisions/1/0"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    // 列表清空
    UserContext.setUserId(1L);
    mockMvc.perform(get("/api/itineraries/tasks/" + taskId + "/node-revisions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(0));
  }
}
