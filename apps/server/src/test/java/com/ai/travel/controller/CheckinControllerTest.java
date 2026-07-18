package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.dto.response.CheckinItemResponse;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.dto.response.MediaUploadResponse;
import com.ai.travel.exception.GlobalExceptionHandler;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.CheckinTaskService;
import com.ai.travel.service.CheckinMediaService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** CheckinController 单元测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinControllerTest {

  @Mock private CheckinTaskService checkinTaskService;
  @Mock private CheckinMediaService checkinMediaService;

  private MockMvc mockMvc;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    mockMvc = MockMvcBuilders.standaloneSetup(
            new CheckinController(checkinTaskService, checkinMediaService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("执行打卡应返回成功")
  void executeCheckin_returnsOk() throws Exception {
    doNothing().when(checkinTaskService).checkin(any(), any(), any());

    mockMvc.perform(post("/api/itineraries/checkin/items/1")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"idempotencyKey":"checkin-operation-1","lat":39.9042,"lng":116.4074,
                 "accuracy":10,"source":"GPS","note":"打卡"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(checkinTaskService).checkin(
        eq(1L),
        argThat(request -> "checkin-operation-1".equals(request.getIdempotencyKey())),
        eq(1L));
  }

  @Test
  @DisplayName("撤销打卡应返回成功")
  void undoCheckin_returnsOk() throws Exception {
    doNothing().when(checkinTaskService).undoCheckin(any(), any());

    mockMvc.perform(post("/api/itineraries/checkin/items/1/undo")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(checkinTaskService).undoCheckin(any(), any());
  }

  @Test
  @DisplayName("获取打卡任务详情应返回任务数据")
  void getCheckinTaskDetail_returnsTask() throws Exception {
    CheckinTaskResponse resp = new CheckinTaskResponse();
    resp.setId("task-1");
    resp.setDayNumber(1);
    resp.setStatus("ACTIVE");
    when(checkinTaskService.getCheckinTaskById("task-1")).thenReturn(resp);

    mockMvc.perform(get("/api/itineraries/checkin/tasks/task-1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.id").value("task-1"))
        .andExpect(jsonPath("$.data.dayNumber").value(1));
  }

  @Test
  @DisplayName("获取打卡任务详情不存在时应抛出异常")
  void getCheckinTaskDetail_notFound_throws() throws Exception {
    when(checkinTaskService.getCheckinTaskById("nonexistent")).thenReturn(null);

    mockMvc.perform(get("/api/itineraries/checkin/tasks/nonexistent"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false));
  }

  @Test
  @DisplayName("获取打卡项详情应返回项数据")
  void getItemDetail_returnsItem() throws Exception {
    CheckinItemResponse resp = new CheckinItemResponse();
    resp.setId(1L);
    resp.setPoiName("宽窄巷子");
    resp.setStatus("PENDING");
    when(checkinTaskService.getCheckinItemDetail(1L, 1L)).thenReturn(resp);

    mockMvc.perform(get("/api/itineraries/checkin/items/1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.poiName").value("宽窄巷子"));
  }

  @Test
  @DisplayName("上传媒体文件应返回媒体 ID")
  void uploadMedia_returnsMediaId() throws Exception {
    MockMultipartFile file = new MockMultipartFile("file", "test.jpg",
        "image/jpeg", new byte[]{1, 2, 3});
    MediaUploadResponse response = new MediaUploadResponse();
    response.setId(1L);
    response.setMediaType("IMAGE");
    response.setUrl("/api/media/1");
    when(checkinMediaService.upload(1L, 1L, file)).thenReturn(response);

    mockMvc.perform(multipart("/api/itineraries/checkin/items/1/media").file(file))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.mediaType").value("IMAGE"));
  }

  @Test
  @DisplayName("放弃打卡应返回成功")
  void abandonCheckin_returnsOk() throws Exception {
    doNothing().when(checkinTaskService).abandonCheckin(any(), any());

    mockMvc.perform(post("/api/itineraries/checkin/items/1/abandon")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(checkinTaskService).abandonCheckin(any(), any());
  }

  @Test
  @DisplayName("更新坐标应返回成功")
  void updateCoordinates_returnsOk() throws Exception {
    doNothing().when(checkinTaskService).updateItemCoordinates(any(), any(), any(), any());

    mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
            .put("/api/itineraries/checkin/items/1/coordinates")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"lat\":39.9042,\"lng\":116.4074}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(checkinTaskService).updateItemCoordinates(any(), any(), any(), any());
  }

  @Test
  @DisplayName("添加自定义打卡项应返回项 ID")
  void addCustomItem_returnsItemId() throws Exception {
    when(checkinTaskService.getCheckinTasks("plan-1")).thenReturn(java.util.List.of());
    // Empty list → controller throws RuntimeException("打卡任务不存在于当前清单")
    // Instead return a list with the matching task
    com.ai.travel.dto.response.CheckinTaskResponse task = new com.ai.travel.dto.response.CheckinTaskResponse();
    task.setId("task-1");
    when(checkinTaskService.getCheckinTasks("plan-1")).thenReturn(java.util.List.of(task));
    when(checkinTaskService.addCustomItem(any(), any(), any())).thenReturn(42L);

    mockMvc.perform(post("/api/itineraries/checkin/trips/plan-1/checkin/task-1/custom-item")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"name":"自定义景点","description":"测试自定义项"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(42));
  }

  @Test
  @DisplayName("空白行程添加首个自定义打卡项应走行程级持久化入口")
  void addFirstCustomItem_returnsItemId() throws Exception {
    when(checkinTaskService.addCustomItemToPlan(any(), any(), any())).thenReturn(43L);

    mockMvc.perform(post("/api/itineraries/checkin/trips/plan-blank/custom-item")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"name":"第一个地点","period":"上午"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(43));

    verify(checkinTaskService).addCustomItemToPlan(
        eq("plan-blank"), argThat(request -> "第一个地点".equals(request.getName())), eq(1L));
  }

  @Test
  @DisplayName("编辑自定义打卡项应返回成功")
  void editCustomItem_returnsOk() throws Exception {
    doNothing().when(checkinTaskService).editCustomItem(any(), any(), any());

    mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
            .put("/api/itineraries/checkin/items/1")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"name":"新名称","description":"新描述"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(checkinTaskService).editCustomItem(any(), any(), any());
  }

  @Test
  @DisplayName("上传不支持的文件类型应返回错误")
  void uploadMedia_unsupportedType_returnsError() throws Exception {
    MockMultipartFile file = new MockMultipartFile("file", "test.exe",
        "application/octet-stream", new byte[]{1, 2, 3});
    when(checkinMediaService.upload(1L, 1L, file))
        .thenThrow(new IllegalArgumentException("不支持的文件类型：exe"));

    mockMvc.perform(multipart("/api/itineraries/checkin/items/1/media").file(file))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false));
  }

  @Test
  @DisplayName("添加自定义打卡项 - 任务不在清单内应返回错误")
  void addCustomItem_taskNotInPlan_returnsError() throws Exception {
    // getCheckinTasks 返回的列表中不包含目标 taskId
    com.ai.travel.dto.response.CheckinTaskResponse other = new com.ai.travel.dto.response.CheckinTaskResponse();
    other.setId("other-task");
    when(checkinTaskService.getCheckinTasks("plan-1")).thenReturn(java.util.List.of(other));

    mockMvc.perform(post("/api/itineraries/checkin/trips/plan-1/checkin/task-1/custom-item")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"name":"自定义景点","description":"测试自定义项"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false));
  }
}
