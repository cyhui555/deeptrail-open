package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TripPlanSummaryResponse;
import com.ai.travel.exception.GlobalExceptionHandler;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.TripPlanService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** TripPlanController 单元测试。 */
@ExtendWith(MockitoExtension.class)
class TripPlanControllerTest {

  @Mock private TripPlanService tripPlanService;

  private MockMvc mockMvc;
  private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    mockMvc = MockMvcBuilders.standaloneSetup(new TripPlanController(tripPlanService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("创建清单 - 缺少标题应返回校验错误")
  void createPlan_missingTitle_returnsValidationError() throws Exception {
    mockMvc.perform(post("/api/trips")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"taskId":"task-001","plannedDate":"2026-07-01"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
  }

  @Test
  @DisplayName("创建清单 - 成功应返回 planId")
  void createPlan_success_returnsPlanId() throws Exception {
    when(tripPlanService.createTripPlan(any())).thenReturn("plan-100");

    mockMvc.perform(post("/api/trips")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"title":"云南之旅","taskId":"task-001","plannedDate":"2026-07-01"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value("plan-100"));
  }

  @Test
  @DisplayName("无 taskId 创建空白清单应返回 planId")
  void createBlankPlan_withoutTaskId_returnsPlanId() throws Exception {
    when(tripPlanService.createTripPlan(any())).thenReturn("plan-blank-1");

    mockMvc.perform(post("/api/trips")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"title":"我的空白行程","plannedDate":"2026-08-01"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value("plan-blank-1"));
  }

  @Test
  @DisplayName("获取清单列表应返回前端约定的分页字段")
  void listPlans_returnsStablePageContract() throws Exception {
    TripPlanSummaryResponse plan = new TripPlanSummaryResponse();
    plan.setId("plan-1");
    plan.setTitle("测试清单");
    when(tripPlanService.listUserTrips(null, 2, 10))
        .thenReturn(new PageResult<>(List.of(plan), 21, 2, 10, 3));

    mockMvc.perform(get("/api/trips")
            .param("page", "2")
            .param("size", "10"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.records[0].id").value("plan-1"))
        .andExpect(jsonPath("$.data.total").value(21))
        .andExpect(jsonPath("$.data.page").value(2))
        .andExpect(jsonPath("$.data.size").value(10))
        .andExpect(jsonPath("$.data.totalPages").value(3))
        .andExpect(jsonPath("$.data.current").doesNotExist())
        .andExpect(jsonPath("$.data.pages").doesNotExist());
  }

  @Test
  @DisplayName("获取清单详情应返回数据")
  void getPlan_returnsDetail() throws Exception {
    when(tripPlanService.getTripPlan("plan-1")).thenReturn(null);

    mockMvc.perform(get("/api/trips/plan-1"))
        .andExpect(status().isOk());
  }

  @Test
  @DisplayName("更新清单应返回成功")
  void updatePlan_returnsOk() throws Exception {
    doNothing().when(tripPlanService).updateTripPlan(any(), any());

    mockMvc.perform(put("/api/trips/plan-1")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"新标题\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
  }

  @Test
  @DisplayName("删除清单应返回成功")
  void deletePlan_returnsOk() throws Exception {
    doNothing().when(tripPlanService).softDeletePlan(any());

    mockMvc.perform(delete("/api/trips/plan-1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
  }

  @Test
  @DisplayName("开始打卡应返回任务 ID")
  void startCheckin_returnsTaskId() throws Exception {
    when(tripPlanService.startCheckin(any(), any())).thenReturn("ctask-1");

    mockMvc.perform(post("/api/trips/plan-1/checkin/start")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value("ctask-1"));
  }

  @Test
  @DisplayName("获取打卡任务列表应返回数据")
  void getCheckinTasks_returnsList() throws Exception {
    when(tripPlanService.getCheckinTasks(any())).thenReturn(java.util.List.of());

    mockMvc.perform(get("/api/trips/plan-1/checkin"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
  }

  @Test
  @DisplayName("关联任务到清单应返回成功")
  void addTask_returnsOk() throws Exception {
    doNothing().when(tripPlanService).addTaskToPlan(any(), any());

    mockMvc.perform(post("/api/trips/plan-1/tasks")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"taskId":"task-extra-1"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
  }

  @Test
  @DisplayName("设置当前活跃任务应返回成功")
  void setActiveTask_returnsOk() throws Exception {
    doNothing().when(tripPlanService).setActiveTask(any(), any());

    mockMvc.perform(put("/api/trips/plan-1/active-task")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"taskId":"task-001"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
  }

  @Test
  @DisplayName("回填坐标应返回数量")
  void backfillCoordinates_returnsCount() throws Exception {
    when(tripPlanService.backfillMissingCoordinates(any())).thenReturn(3);

    mockMvc.perform(post("/api/trips/plan-1/checkin/backfill-coordinates"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(3));
  }

  @Test
  @DisplayName("强制重填坐标应返回数量")
  void forceRefillCoordinates_returnsCount() throws Exception {
    when(tripPlanService.forceRefillCoordinates(any())).thenReturn(5);

    mockMvc.perform(post("/api/trips/plan-1/checkin/force-refill-coordinates"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(5));
  }
}
