package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TaskStatusResponse;
import com.ai.travel.dto.response.TaskSummaryResponse;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.AiCallLogMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.NodeRevisionMapper;
import com.ai.travel.task.InMemoryTaskStore;
import com.ai.travel.task.TaskExecutionContext;
import com.ai.travel.task.TaskExecutionRegistry;
import com.ai.travel.entity.AiCallLog;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.ai.travel.dto.request.SaveNodeRevisionRequest;
import com.ai.travel.dto.response.NodeRevisionResponse;
import com.ai.travel.entity.NodeRevision;
import com.ai.travel.security.UserContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.FutureTask;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

@ExtendWith(MockitoExtension.class)
class ItineraryTaskServiceTest {

  private final ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();

  @Mock
  private ItineraryTaskMapper taskMapper;

  @Mock
  private AiCallLogMapper aiCallLogMapper;

  @Mock
  private NodeRevisionMapper nodeRevisionMapper;

  private InMemoryTaskStore taskStore;
  private TaskExecutionRegistry executionRegistry;
  private ItineraryTaskService taskService;

  @BeforeEach
  void setUp() {
    taskStore = new InMemoryTaskStore();
    executionRegistry = new TaskExecutionRegistry();
    taskService = new ItineraryTaskService(taskStore, executionRegistry,
        taskMapper, aiCallLogMapper,
        nodeRevisionMapper, objectMapper);
    // 单元测试环境无 HTTP 请求上下文，手动注入提交者身份，
    // 与生产环境 AuthInterceptor 写入 UserContext 的行为一致。
    UserContext.setUserId(1L);
  }

  @Test
  void submitGenerateTaskPersistsTaskAndReturnsId() {
    ArgumentCaptor<ItineraryTask> captor = ArgumentCaptor.forClass(ItineraryTask.class);
    when(taskMapper.insert(captor.capture())).thenReturn(1);

    String taskId = taskService.submitGenerateTask(sampleGenerateRequest());

    assertThat(taskId).isNotBlank();
    assertThat(taskStore.findById(taskId)).isNotNull();
    ItineraryTask saved = captor.getValue();
    assertThat(saved.getId()).isEqualTo(taskId);
    assertThat(saved.getType()).isEqualTo(TaskType.GENERATE);
    assertThat(saved.getStatus()).isEqualTo(TaskStatus.PENDING);
    assertThat(saved.getRequestJson()).contains("Beijing");
  }

  @Test
  void submitOptimizeTaskPersistsOptimizePayload() {
    when(taskMapper.insert(any(ItineraryTask.class))).thenReturn(1);

    String taskId = taskService.submitOptimizeTask(sampleOptimizeRequest());

    assertThat(taskStore.findById(taskId).getType()).isEqualTo(TaskType.OPTIMIZE);
    assertThat(taskStore.findById(taskId).getStatus()).isEqualTo(TaskStatus.PENDING);
  }

  @Test
  void submitXiaohongshuTaskPersistsXiaohongshuPayload() {
    when(taskMapper.insert(any(ItineraryTask.class))).thenReturn(1);

    String taskId = taskService.submitXiaohongshuTask(sampleXiaohongshuRequest());

    assertThat(taskStore.findById(taskId).getType()).isEqualTo(TaskType.XIAOHONGSHU);
  }

  @Test
  void submitXiaohongshuTaskWithNoteContent() {
    ArgumentCaptor<ItineraryTask> captor = ArgumentCaptor.forClass(ItineraryTask.class);
    when(taskMapper.insert(captor.capture())).thenReturn(1);

    String taskId = taskService.submitXiaohongshuTask(sampleXiaohongshuRequestWithNoteContent());

    assertThat(taskId).isNotBlank();
    assertThat(taskStore.findById(taskId).getType()).isEqualTo(TaskType.XIAOHONGSHU);
    assertThat(taskStore.findById(taskId).getStatus()).isEqualTo(TaskStatus.PENDING);
    ItineraryTask saved = captor.getValue();
    assertThat(saved.getRequestJson()).contains("noteContent");
    assertThat(saved.getRequestJson()).contains("青岛");
  }

  @Test
  void submitGenerateTaskThrowsWhenSerializationFails() throws Exception {
    ObjectMapper failingMapper = mock(ObjectMapper.class);
    taskService = new ItineraryTaskService(taskStore, executionRegistry,
        taskMapper, aiCallLogMapper,
        nodeRevisionMapper, failingMapper);
    when(failingMapper.writeValueAsString(any())).thenThrow(new JsonProcessingException("boom") {});

    assertThatThrownBy(() -> taskService.submitGenerateTask(sampleGenerateRequest()))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("Request serialization failed");
  }

  @Test
  void getStatusHydratesCompletedResult() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson(objectMapper.writeValueAsString(sampleItinerary()));
    taskStore.save(task);

    TaskStatusResponse response = taskService.getStatus("task-1");

    assertThat(response.getTaskId()).isEqualTo("task-1");
    assertThat(response.getType()).isEqualTo(TaskType.GENERATE);
    assertThat(response.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    assertThat(response.getResult()).isInstanceOf(ItineraryResponse.class);
    assertThat(((ItineraryResponse) response.getResult()).getSummary()).isEqualTo("trip summary");
  }

  @Test
  void getStatusLoadsFromDatabaseWhenCacheMiss() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-db");
    task.setType(TaskType.OPTIMIZE);
    task.setStatus(TaskStatus.FAILED);
    task.setErrorMessage("boom");
    task.setCreatedAt(LocalDateTime.now());
    when(taskMapper.selectById("task-db")).thenReturn(task);

    TaskStatusResponse response = taskService.getStatus("task-db");

    assertThat(response.getTaskId()).isEqualTo("task-db");
    assertThat(taskStore.findById("task-db")).isSameAs(task);
    assertThat(response.getErrorMessage()).isEqualTo("boom");
  }

  @Test
  void getStatusReturnsStatusWithoutResultWhenJsonIsInvalid() {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-bad-json");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson("not-json");
    taskStore.save(task);

    TaskStatusResponse response = taskService.getStatus("task-bad-json");

    assertThat(response.getTaskId()).isEqualTo("task-bad-json");
    assertThat(response.getResult()).isNull();
  }

  @Test
  void getStatusThrowsWhenTaskMissing() {
    when(taskMapper.selectById("missing")).thenReturn(null);

    assertThatThrownBy(() -> taskService.getStatus("missing"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("Task not found");
  }

  @Test
  void listTasksMapsSummaryResponses() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setType(TaskType.OPTIMIZE);
    task.setStatus(TaskStatus.PROCESSING);
    task.setCreatedAt(LocalDateTime.now());
    task.setRequestJson(objectMapper.writeValueAsString(sampleOptimizeRequest()));
    Page<ItineraryTask> page = new Page<>(1, 10);
    page.setRecords(List.of(task));
    page.setTotal(1);
    when(taskMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);

    PageResult<TaskSummaryResponse> result = taskService.listTasks(TaskStatus.PROCESSING, 1, 10);

    assertThat(result.getRecords()).hasSize(1);
    assertThat(result.getRecords().get(0).getTaskId()).isEqualTo("task-1");
    assertThat(result.getRecords().get(0).getStatus()).isEqualTo(TaskStatus.PROCESSING);
    assertThat(result.getRecords().get(0).getSummary()).contains("优化");
    assertThat(result.getTotal()).isEqualTo(1);
  }

  @Test
  void listTasksReturnsAllWhenStatusIsNull() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-2");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.PENDING);
    task.setCreatedAt(LocalDateTime.now());
    task.setRequestJson(objectMapper.writeValueAsString(sampleGenerateRequest()));
    Page<ItineraryTask> page = new Page<>(1, 10);
    page.setRecords(List.of(task));
    page.setTotal(1);
    when(taskMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);

    PageResult<TaskSummaryResponse> result = taskService.listTasks(null, 1, 10);

    assertThat(result.getRecords()).hasSize(1);
    assertThat(result.getRecords().get(0).getSummary()).contains("Beijing").contains("Xi'an");
  }

  @Test
  void cancelMovesTaskToCancelledState() {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.PROCESSING);
    taskStore.save(task);
    when(taskMapper.update(any(ItineraryTask.class), any())).thenReturn(1);

    taskService.cancel("task-1");

    assertThat(taskStore.findById("task-1").getStatus()).isEqualTo(TaskStatus.CANCELLED);
    assertThat(taskStore.findById("task-1").getCompletedAt()).isNotNull();
    verify(taskMapper).update(any(ItineraryTask.class), any());
  }

  @Test
  void cancelPropagatesToRunningFuture() {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-running");
    task.setType(TaskType.OPTIMIZE);
    task.setStatus(TaskStatus.PROCESSING);
    taskStore.save(task);
    when(taskMapper.update(any(ItineraryTask.class), any())).thenReturn(1);
    TaskExecutionContext execution = executionRegistry.register(
        task.getId(), Duration.ofMinutes(10));
    FutureTask<Void> future = new FutureTask<>(() -> null);
    executionRegistry.bindFuture(task.getId(), execution, future);

    taskService.cancel(task.getId());

    assertThat(future.isCancelled()).isTrue();
    assertThat(execution.getCancellationReason())
        .isEqualTo(TaskExecutionContext.CancellationReason.USER_CANCELLED);
    assertThat(task.getStatus()).isEqualTo(TaskStatus.CANCELLED);
    executionRegistry.finish(task.getId(), execution);
  }

  @Test
  void cancelThrowsWhenTaskCannotBeCancelled() {
    taskStore.save(completedTask());
    when(taskMapper.update(any(ItineraryTask.class), any())).thenReturn(0);

    assertThatThrownBy(() -> taskService.cancel("task-1"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("Task cannot be cancelled");
  }

  @Test
  void getStatusWithAiCallLogSetsTokenUsage() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-log");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson(objectMapper.writeValueAsString(sampleItinerary()));
    when(taskMapper.selectById("task-log")).thenReturn(task);

    AiCallLog log = new AiCallLog();
    log.setTokenUsed(1500);
    log.setDurationMs(3000);
    when(aiCallLogMapper.selectOne(any())).thenReturn(log);

    TaskStatusResponse response = taskService.getStatus("task-log");

    assertThat(response.getTokenUsed()).isEqualTo(1500);
    assertThat(response.getDurationMs()).isEqualTo(3000);
  }

  @Test
  void getStatusThrowsWhenUserForbidden() {
    com.ai.travel.security.UserContext.setUserId(1L);
    ItineraryTask task = new ItineraryTask();
    task.setId("task-forbidden");
    task.setUserId(99L);
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.PENDING);
    when(taskMapper.selectById("task-forbidden")).thenReturn(task);

    assertThatThrownBy(() -> taskService.getStatus("task-forbidden"))
        .isInstanceOf(com.ai.travel.exception.ForbiddenException.class);
    com.ai.travel.security.UserContext.clear();
  }

  @Test
  void cancelThrowsWhenTaskNotFound() {
    assertThatThrownBy(() -> taskService.cancel("nonexistent"))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void getStatusOptimizeTypeWithInnerJsonCompensates() throws Exception {
    // 模拟 AI 将结构化数据塞进 optimizedItinerary 字段的情况
    String resultJson = """
        {"optimizedItinerary":"{\\"summary\\":\\"内层总结\\",\\"days\\":[{\\"day\\":1}]}","reasoning":"优化思路"}
        """;
    ItineraryTask task = new ItineraryTask();
    task.setId("task-optimize");
    task.setType(TaskType.OPTIMIZE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson(resultJson);
    when(taskMapper.selectById("task-optimize")).thenReturn(task);
    when(aiCallLogMapper.selectOne(any())).thenReturn(null);

    TaskStatusResponse response = taskService.getStatus("task-optimize");

    assertThat(response.getType()).isEqualTo(TaskType.OPTIMIZE);
    assertThat(response.getResult()).isNotNull();
  }

  @Test
  void getStatusOptimizeTypeWithTruncatedJsonRepairs() throws Exception {
    // 模拟 AI 输出被截断的情况
    String resultJson = """
        {"optimizedItinerary":"{\\"summary\\":\\"总结\\",\\"days\\":[{\\"day\\":1,\\"date\\":\\"2026-07-01\\",\\"items\\":[]}]","reasoning":"思路"}
        """;
    ItineraryTask task = new ItineraryTask();
    task.setId("task-optimize-truncated");
    task.setType(TaskType.OPTIMIZE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson(resultJson);
    when(taskMapper.selectById("task-optimize-truncated")).thenReturn(task);
    when(aiCallLogMapper.selectOne(any())).thenReturn(null);

    TaskStatusResponse response = taskService.getStatus("task-optimize-truncated");

    assertThat(response.getType()).isEqualTo(TaskType.OPTIMIZE);
  }

  @Test
  void getStatusXiaohongshuTypeHandlesMissingFields() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-xhs");
    task.setType(TaskType.XIAOHONGSHU);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson("{\"summary\":\"小红书行程\",\"days\":[]}");
    when(taskMapper.selectById("task-xhs")).thenReturn(task);
    when(aiCallLogMapper.selectOne(any())).thenReturn(null);

    TaskStatusResponse response = taskService.getStatus("task-xhs");

    assertThat(response.getType()).isEqualTo(TaskType.XIAOHONGSHU);
    assertThat(response.getResult()).isNotNull();
  }

  private static GenerateItineraryRequest sampleGenerateRequest() {
    GenerateItineraryRequest request = new GenerateItineraryRequest();
    request.setDepartureLocation("Beijing");
    request.setDepartureTime(LocalDateTime.of(2026, 7, 1, 9, 0));
    request.setDestination("Xi'an");
    request.setDays(3);
    request.setPeopleCount(2);
    request.setBudget("3000");
    request.setPreferences(List.of("culture", "food"));
    request.setSpecialRequirements("slow pace");
    return request;
  }

  private static OptimizeItineraryRequest sampleOptimizeRequest() {
    OptimizeItineraryRequest request = new OptimizeItineraryRequest();
    request.setCurrentItinerary("day 1 itinerary");
    request.setOptimizationGoal("reduce budget");
    request.setConstraints("no late nights");
    return request;
  }

  private static XiaohongshuItineraryRequest sampleXiaohongshuRequest() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");
    return request;
  }

  private static XiaohongshuItineraryRequest sampleXiaohongshuRequestWithNoteContent() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setNoteContent("周末青岛两日游，打卡啤酒城出海体验");
    return request;
  }

  private static ItineraryResponse sampleItinerary() {
    ItineraryResponse response = new ItineraryResponse();
    response.setSummary("trip summary");
    response.setDays(List.<DayPlan>of());
    response.setTips(List.of("tip"));
    response.setEstimatedBudget("2000");
    return response;
  }

  private static ItineraryTask completedTask() {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setUserId(1L);
    task.setResultJson(sampleItineraryWithScheduleJson());
    return task;
  }

  @Test
  @DisplayName("未登录（UserContext=null）提交任务应抛出 UnauthorizedException")
  void submitGenerateTask_withoutLoginContext_throwsUnauthorized() {
    // 清除 UserContext 模拟未登录状态 — 覆盖 userId=null 抛出 UnauthorizedException 分支
    UserContext.clear();

    assertThatThrownBy(() -> taskService.submitGenerateTask(sampleGenerateRequest()))
        .isInstanceOf(com.ai.travel.exception.UnauthorizedException.class)
        .hasMessageContaining("未登录");

    // 恢复上下文避免影响其他测试
    UserContext.setUserId(1L);
  }

  // ========== 节点修正测试 ==========

  @AfterEach
  void tearDown() {
    com.ai.travel.security.UserContext.clear();
  }

  private static String sampleItineraryWithScheduleJson() {
    return "{\"summary\":\"成都一日游\",\"days\":[{\"day\":1,\"schedule\":[{\"period\":\"上午\",\"poi\":{\"name\":\"宽窄巷子\",\"latitude\":30.67,\"longitude\":104.06}}]}]}";
  }

  @Test
  void saveNodeRevision_insertsWhenNoExistingRow() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());
    when(nodeRevisionMapper.update(any(), any())).thenReturn(0);
    when(nodeRevisionMapper.insert(any(NodeRevision.class))).thenReturn(1);

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setCorrectedLat(30.7465);
    req.setCorrectedLng(120.7558);
    req.setTransportMode("WALK");
    req.setTransportDuration(10);

    NodeRevisionResponse resp = taskService.saveNodeRevision("task-1", req);
    assertThat(resp.isTransportCorrected()).isTrue();
    assertThat(resp.getCorrectedLat()).isEqualTo(30.7465);
    verify(nodeRevisionMapper).insert(any(NodeRevision.class));
  }

  @Test
  void saveNodeRevision_updatesWhenRowExists() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());
    when(nodeRevisionMapper.update(any(), any())).thenReturn(1);
    NodeRevision existing = new NodeRevision();
    existing.setId(1L);
    existing.setDayIndex(1);
    existing.setItemIndex(0);
    existing.setTransportMode(com.ai.travel.enums.TransportMode.WALK);
    when(nodeRevisionMapper.selectOne(any())).thenReturn(existing);

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setTransportMode("WALK");
    req.setTransportDuration(15);

    NodeRevisionResponse resp = taskService.saveNodeRevision("task-1", req);
    assertThat(resp.getDayIndex()).isEqualTo(1);
  }

  @Test
  void saveNodeRevision_throwsWhenDayIndexOutOfBounds() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(99);
    req.setItemIndex(0);
    req.setCorrectedLat(30.0);
    req.setCorrectedLng(120.0);

    assertThatThrownBy(() -> taskService.saveNodeRevision("task-1", req))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("越界");
  }

  @Test
  void saveNodeRevision_throwsWhenOnlyLatProvided() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setCorrectedLat(30.0);

    assertThatThrownBy(() -> taskService.saveNodeRevision("task-1", req))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("经纬度");
  }

  @Test
  void saveNodeRevision_throwsWhenTransportModeInvalid() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setTransportMode("FLYING_CAR");

    assertThatThrownBy(() -> taskService.saveNodeRevision("task-1", req))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("交通方式");
  }

  @Test
  void saveNodeRevision_throwsWhenNothingToSave() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);

    assertThatThrownBy(() -> taskService.saveNodeRevision("task-1", req))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("至少");
  }

  @Test
  void saveNodeRevision_throwsForbiddenForOtherUser() {
    UserContext.setUserId(99L);
    ItineraryTask task = completedTask();
    task.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(task);

    SaveNodeRevisionRequest req = new SaveNodeRevisionRequest();
    req.setDayIndex(1);
    req.setItemIndex(0);
    req.setTransportMode("WALK");

    assertThatThrownBy(() -> taskService.saveNodeRevision("task-1", req))
        .isInstanceOf(com.ai.travel.exception.ForbiddenException.class);
  }

  @Test
  void listNodeRevisions_returnsAll() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());
    NodeRevision rev = new NodeRevision();
    rev.setId(1L);
    rev.setDayIndex(1);
    rev.setItemIndex(0);
    rev.setTransportMode(com.ai.travel.enums.TransportMode.WALK);
    when(nodeRevisionMapper.selectList(any())).thenReturn(List.of(rev));

    List<NodeRevisionResponse> result = taskService.listNodeRevisions("task-1");
    assertThat(result).hasSize(1);
    assertThat(result.get(0).isTransportCorrected()).isTrue();
  }

  @Test
  void deleteNodeRevision_invokesMapper() {
    UserContext.setUserId(1L);
    when(taskMapper.selectById("task-1")).thenReturn(completedTask());

    taskService.deleteNodeRevision("task-1", 1, 0);
    verify(nodeRevisionMapper).delete(any());
  }

  @Test
  void listTasks_pageZero_clampsToOne() {
    // safePage should clamp page=0 to 1
    UserContext.setUserId(1L);
    com.baomidou.mybatisplus.extension.plugins.pagination.Page<ItineraryTask> page =
        new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 10);
    page.setRecords(List.of());
    page.setTotal(0);
    when(taskMapper.selectPage(
        any(com.baomidou.mybatisplus.extension.plugins.pagination.Page.class),
        any())).thenReturn(page);

    var result = taskService.listTasks(null, 0, 10);
    assertThat(result).isNotNull();
    assertThat(result.getPage()).isEqualTo(1);
  }

  @Test
  void listTasks_userIdNull_doesNotFilterByUser() {
    // When UserContext userId is null, no user filter applied
    UserContext.clear();
    com.baomidou.mybatisplus.extension.plugins.pagination.Page<ItineraryTask> page =
        new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 10);
    page.setRecords(List.of());
    page.setTotal(0);
    when(taskMapper.selectPage(
        any(com.baomidou.mybatisplus.extension.plugins.pagination.Page.class),
        any(LambdaQueryWrapper.class))).thenReturn(page);

    var result = taskService.listTasks(null, 1, 10);
    assertThat(result).isNotNull();
  }

  @Test
  void buildSummary_invalidRequestJson_returnsTypeName() {
    // Create a task whose requestJson cannot be parsed - triggers catch branch
    ItineraryTask badTask = new ItineraryTask();
    badTask.setId("task-bad");
    badTask.setType(TaskType.GENERATE);
    badTask.setStatus(TaskStatus.PENDING);
    badTask.setUserId(1L);
    badTask.setRequestJson("not valid json{{{");
    badTask.setCreatedAt(java.time.LocalDateTime.now());

    UserContext.setUserId(1L);
    com.baomidou.mybatisplus.extension.plugins.pagination.Page<ItineraryTask> page =
        new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 10);
    page.setRecords(List.of(badTask));
    page.setTotal(1);
    when(taskMapper.selectPage(
        any(com.baomidou.mybatisplus.extension.plugins.pagination.Page.class),
        any())).thenReturn(page);

    var result = taskService.listTasks(null, 1, 10);
    assertThat(result.getRecords()).hasSize(1);
    // buildSummary catch branch returns type.name()
    assertThat(result.getRecords().get(0).getSummary()).isEqualTo("GENERATE");
  }

  @Test
  void getStatus_aiCallLogWithNullTokenUsed_doesNotSetTokenUsed() throws Exception {
    ItineraryTask task = new ItineraryTask();
    task.setId("task-null-token");
    task.setType(TaskType.GENERATE);
    task.setStatus(TaskStatus.COMPLETED);
    task.setCreatedAt(LocalDateTime.now());
    task.setResultJson(objectMapper.writeValueAsString(sampleItinerary()));
    when(taskMapper.selectById("task-null-token")).thenReturn(task);

    AiCallLog log = new AiCallLog();
    log.setTokenUsed(null);
    log.setDurationMs(2000);
    when(aiCallLogMapper.selectOne(any())).thenReturn(log);

    TaskStatusResponse response = taskService.getStatus("task-null-token");

    // tokenUsed is null in log, so response tokenUsed should be null
    assertThat(response.getTokenUsed()).isNull();
    assertThat(response.getDurationMs()).isEqualTo(2000);
  }

  @Test
  void deleteNodeRevision_forbiddenUser_throwsForbiddenException() {
    UserContext.setUserId(1L);
    ItineraryTask otherOwnerTask = completedTask();
    otherOwnerTask.setUserId(99L);
    when(taskMapper.selectById("task-1")).thenReturn(otherOwnerTask);

    assertThatThrownBy(() -> taskService.deleteNodeRevision("task-1", 1, 0))
        .isInstanceOf(com.ai.travel.exception.ForbiddenException.class);
  }

  @Test
  void listTasks_sizeExceedsMax_clampsTo50() {
    UserContext.setUserId(1L);
    com.baomidou.mybatisplus.extension.plugins.pagination.Page<ItineraryTask> page =
        new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 50);
    page.setRecords(List.of());
    page.setTotal(0);
    when(taskMapper.selectPage(
        any(com.baomidou.mybatisplus.extension.plugins.pagination.Page.class),
        any())).thenReturn(page);

    var result = taskService.listTasks(null, 1, 100);
    assertThat(result.getSize()).isEqualTo(50);
  }
}
