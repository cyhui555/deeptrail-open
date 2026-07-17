package com.ai.travel.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.service.ItineraryAiService;
import com.ai.travel.service.ItineraryAiService.TaskExecutionResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

class TaskSchedulerTest {

  private final ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();

  private InMemoryTaskStore taskStore;
  private TaskExecutionRegistry executionRegistry;
  private ItineraryAiService aiService;
  private TaskExecutor taskExecutor;
  private ItineraryTaskMapper taskMapper;
  private TaskScheduler taskScheduler;

  @BeforeEach
  void setUp() {
    taskStore = new InMemoryTaskStore();
    executionRegistry = new TaskExecutionRegistry();
    aiService = org.mockito.Mockito.mock(ItineraryAiService.class);
    taskExecutor = org.mockito.Mockito.mock(TaskExecutor.class);
    taskMapper = org.mockito.Mockito.mock(ItineraryTaskMapper.class);
    taskScheduler = new TaskScheduler(
        taskStore, executionRegistry, aiService, objectMapper, taskExecutor, taskMapper, 10, 2);
    doAnswer(invocation -> {
      Runnable runnable = invocation.getArgument(0);
      runnable.run();
      return null;
    }).when(taskExecutor).execute(any(Runnable.class));
    when(taskMapper.update(isNull(), any())).thenReturn(1);
  }

  @Test
  void pollAndDispatchDoesNothingWhenThereAreNoPendingTasks() {
    taskScheduler.pollAndDispatch();

    assertThat(taskStore.size()).isEqualTo(0);
  }

  @Test
  void pollAndDispatchCompletesGenerateTask() throws Exception {
    ItineraryTask task = newTask("task-1", TaskType.GENERATE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    when(aiService.executeGenerate(
        any(GenerateItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(sampleGenerateExecution());
    taskScheduler.pollAndDispatch();

    ItineraryTask stored = taskStore.findById("task-1");
    assertThat(stored.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    assertThat(stored.getResultJson()).contains("spring trip");
    assertThat(stored.getStartedAt()).isNotNull();
    assertThat(stored.getCompletedAt()).isNotNull();
    InOrder terminalOrder = inOrder(taskMapper, aiService);
    terminalOrder.verify(taskMapper).update(isNull(), any());
    terminalOrder.verify(aiService).persistSuccess(any());
  }

  @Test
  void pollAndDispatchCompletesOptimizeTask() throws Exception {
    ItineraryTask task = newTask("task-2", TaskType.OPTIMIZE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleOptimizeRequest()));
    taskStore.save(task);
    when(aiService.executeOptimize(
        any(OptimizeItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(sampleOptimizeExecution());
    taskScheduler.pollAndDispatch();

    assertThat(taskStore.findById("task-2").getStatus()).isEqualTo(TaskStatus.COMPLETED);
  }

  @Test
  void pollAndDispatchCompletesXiaohongshuTask() throws Exception {
    ItineraryTask task = newTask("task-3", TaskType.XIAOHONGSHU, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleXiaohongshuRequest()));
    taskStore.save(task);
    when(aiService.executeXiaohongshu(
        any(XiaohongshuItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(sampleXiaohongshuExecution("fetched note"));
    taskScheduler.pollAndDispatch();

    ItineraryTask stored = taskStore.findById("task-3");
    assertThat(stored.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    assertThat(stored.getParsedContent()).isEqualTo("fetched note");
  }

  @Test
  void pollAndDispatchCompletesXiaohongshuTaskWithNoteContent() throws Exception {
    ItineraryTask task = newTask("task-3b", TaskType.XIAOHONGSHU, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleXiaohongshuRequestWithNoteContent()));
    taskStore.save(task);
    when(aiService.executeXiaohongshu(
        any(XiaohongshuItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(
            sampleXiaohongshuExecution("周末青岛两日游，打卡啤酒城出海体验"));
    taskScheduler.pollAndDispatch();

    ItineraryTask stored = taskStore.findById("task-3b");
    assertThat(stored.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    assertThat(stored.getResultJson()).contains("spring trip");
    assertThat(stored.getParsedContent()).isEqualTo("周末青岛两日游，打卡啤酒城出海体验");
  }

  @Test
  void pollAndDispatchRetriesWhenAiThrowsThenFailsAfterExhaustion() throws Exception {
    ItineraryTask task = newTask("task-4", TaskType.GENERATE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    when(aiService.executeGenerate(
        any(GenerateItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class)))
        .thenThrow(new RuntimeException("boom"));
    // 第 1 次调度：任务从 PROCESSING 被重置为 PENDING（第 1 次重试）
    taskScheduler.pollAndDispatch();
    ItineraryTask afterFirst = taskStore.findById("task-4");
    assertThat(afterFirst.getStatus()).isEqualTo(TaskStatus.PENDING);
    assertThat(afterFirst.getRetryCount()).isEqualTo(1);

    // 第 2 次调度：retryCount(max-1) 仍小于上限，重置为 PENDING
    // 但由于 maxRetry=2，第 2 次执行时 retryCount 变为 2 = max，立即 FAILED
    taskScheduler.pollAndDispatch();
    ItineraryTask stored = taskStore.findById("task-4");
    assertThat(stored.getStatus()).isEqualTo(TaskStatus.FAILED);
    assertThat(stored.getErrorMessage()).contains("boom");
    assertThat(stored.getRetryCount()).isEqualTo(2);
    assertThat(stored.getCompletedAt()).isNotNull();
    verify(aiService).persistFailure(
        any(TaskType.class), any(RuntimeException.class), anyInt(), any(String.class), any());
  }

  @Test
  void processTaskSkipsWhenTaskAlreadyCancelled() throws Exception {
    ItineraryTask task = newTask("task-5", TaskType.GENERATE, TaskStatus.PROCESSING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    taskStore.compareAndSetStatus("task-5", TaskStatus.PROCESSING, TaskStatus.CANCELLED);

    taskScheduler.pollAndDispatch();

    assertThat(taskStore.findById("task-5").getStatus()).isEqualTo(TaskStatus.CANCELLED);
  }

  @Test
  void cleanupExpiredRemovesOldTerminalTasks() {
    ItineraryTask fresh = newTask("task-6", TaskType.OPTIMIZE, TaskStatus.COMPLETED, "{}");
    fresh.setCompletedAt(LocalDateTime.now().minusHours(1));
    ItineraryTask expired = newTask("task-7", TaskType.OPTIMIZE, TaskStatus.CANCELLED, "{}");
    expired.setCompletedAt(LocalDateTime.now().minusHours(25));
    taskStore.save(fresh);
    taskStore.save(expired);

    taskScheduler.cleanupExpired();

    assertThat(taskStore.findById("task-6")).isNotNull();
    assertThat(taskStore.findById("task-7")).isNull();
  }

  @Test
  void watchdog_killsTimedOutProcessingTasks() throws Exception {
    ItineraryTask stuck = newTask("task-stuck", TaskType.GENERATE, TaskStatus.PROCESSING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    stuck.setStartedAt(LocalDateTime.now().minusMinutes(15));
    taskStore.save(stuck);
    taskScheduler.watchdog();

    assertThat(taskStore.findById("task-stuck").getStatus()).isEqualTo(TaskStatus.FAILED);
    assertThat(taskStore.findById("task-stuck").getErrorMessage()).contains("超时");
  }

  @Test
  void watchdog_doesNotKillRecentProcessingTasks() throws Exception {
    ItineraryTask recent = newTask("task-recent", TaskType.GENERATE, TaskStatus.PROCESSING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    recent.setStartedAt(LocalDateTime.now().minusMinutes(2));
    taskStore.save(recent);

    taskScheduler.watchdog();

    assertThat(taskStore.findById("task-recent").getStatus()).isEqualTo(TaskStatus.PROCESSING);
  }

  @Test
  void watchdogInterruptsWorkerAndDoesNotPersistLateSuccess() throws Exception {
    ItineraryTask task = newTask("task-late-success", TaskType.OPTIMIZE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleOptimizeRequest()));
    taskStore.save(task);
    CountDownLatch started = new CountDownLatch(1);
    AtomicReference<Thread> worker = new AtomicReference<>();
    TaskExecutor asyncExecutor = command -> {
      Thread thread = new Thread(command, "test-ai-worker");
      thread.setDaemon(true);
      worker.set(thread);
      thread.start();
    };
    TaskScheduler asyncScheduler = new TaskScheduler(
        taskStore, executionRegistry, aiService, objectMapper,
        asyncExecutor, taskMapper, 10, 2);
    when(aiService.executeOptimize(
        any(OptimizeItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenAnswer(invocation -> {
          started.countDown();
          try {
            new CountDownLatch(1).await();
          } catch (InterruptedException exception) {
            // 模拟底层调用收到中断后仍返回迟到成功；调度器必须在提交前再次检查上下文。
            Thread.currentThread().interrupt();
          }
          return sampleOptimizeExecution();
        });

    asyncScheduler.pollAndDispatch();
    assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
    task.setStartedAt(LocalDateTime.now().minusMinutes(15));

    asyncScheduler.watchdog();
    worker.get().join(2_000L);

    assertThat(worker.get().isAlive()).isFalse();
    assertThat(task.getStatus()).isEqualTo(TaskStatus.FAILED);
    assertThat(task.getErrorMessage()).contains("超时");
    assertThat(task.getResultJson()).isNull();
    assertThat(executionRegistry.isRunning(task.getId())).isFalse();
    verify(aiService, never()).persistSuccess(any());
  }

  @Test
  void processTask_dbPersistenceFailureOnTerminalIsNonFatal() throws Exception {
    ItineraryTask task = newTask("task-dbfail", TaskType.GENERATE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    when(aiService.executeGenerate(
        any(GenerateItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(sampleGenerateExecution());
    when(taskMapper.update(isNull(), any())).thenThrow(new RuntimeException("DB down"));

    taskScheduler.pollAndDispatch();

    // Task should still be marked COMPLETED in memory despite DB error
    assertThat(taskStore.findById("task-dbfail").getStatus()).isEqualTo(TaskStatus.COMPLETED);
    verify(aiService, never()).persistSuccess(any());
  }

  @Test
  void processTaskDoesNotWriteSuccessAuditWhenDatabaseTerminalRaceIsLost() throws Exception {
    ItineraryTask task = newTask("task-db-race", TaskType.GENERATE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    when(aiService.executeGenerate(
        any(GenerateItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(sampleGenerateExecution());
    when(taskMapper.update(isNull(), any())).thenReturn(0);

    taskScheduler.pollAndDispatch();

    assertThat(taskStore.findById("task-db-race").getStatus())
        .isEqualTo(TaskStatus.COMPLETED);
    verify(aiService, never()).persistSuccess(any());
  }

  @Test
  void processTask_casConcurrentCancellationDiscardsResult() throws Exception {
    ItineraryTask task = newTask("task-race", TaskType.GENERATE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    when(aiService.executeGenerate(
        any(GenerateItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class))).thenReturn(sampleGenerateExecution());
    // Override executor to inject cancellation right when task starts processing
    org.mockito.Mockito.reset(taskExecutor);
    org.mockito.Mockito.doAnswer(invocation -> {
      Runnable runnable = invocation.getArgument(0);
      // The scheduler already claimed PROCESSING; simulate a concurrent cancel
      taskStore.compareAndSetStatus("task-race", TaskStatus.PROCESSING, TaskStatus.CANCELLED);
      runnable.run();
      return null;
    }).when(taskExecutor).execute(any(Runnable.class));

    taskScheduler.pollAndDispatch();

    // Status should remain CANCELLED — result discarded via CAS fail
    assertThat(taskStore.findById("task-race").getStatus()).isEqualTo(TaskStatus.CANCELLED);
  }

  @Test
  void processTask_deadLetterCasFail_discardsError() throws Exception {
    // After max retries, CAS to FAILED may also fail (status already changed)
    ItineraryTask task = newTask("task-dl-casfail", TaskType.GENERATE, TaskStatus.PENDING,
        objectMapper.writeValueAsString(sampleGenerateRequest()));
    taskStore.save(task);
    when(aiService.executeGenerate(
        any(GenerateItineraryRequest.class), any(String.class), any(),
        any(TaskExecutionContext.class)))
        .thenThrow(new RuntimeException("persistent failure"));
    // First poll: retry 1, back to PENDING
    taskScheduler.pollAndDispatch();
    assertThat(taskStore.findById("task-dl-casfail").getStatus()).isEqualTo(TaskStatus.PENDING);

    // Second poll: now simulate concurrent cancellation before the FAILED CAS happens
    org.mockito.Mockito.reset(taskExecutor);
    org.mockito.Mockito.doAnswer(invocation -> {
      Runnable runnable = invocation.getArgument(0);
      // Cancel right before processing begins — CAS to FAILED should fail
      taskStore.compareAndSetStatus("task-dl-casfail", TaskStatus.PROCESSING, TaskStatus.CANCELLED);
      runnable.run();
      return null;
    }).when(taskExecutor).execute(any(Runnable.class));

    taskScheduler.pollAndDispatch();

    // Status should be CANCELLED (CAS failed path)
    assertThat(taskStore.findById("task-dl-casfail").getStatus()).isEqualTo(TaskStatus.CANCELLED);
  }

  @Test
  void cleanupExpired_noExpiredTasks_doesNotRemoveFresh() {
    // 所有任务的 completedAt 都在 24 小时内，不应被清理
    ItineraryTask fresh1 = newTask("task-fresh1", TaskType.GENERATE, TaskStatus.COMPLETED, "{}");
    fresh1.setCompletedAt(LocalDateTime.now().minusHours(1));
    ItineraryTask fresh2 = newTask("task-fresh2", TaskType.OPTIMIZE, TaskStatus.FAILED, "{}");
    fresh2.setCompletedAt(LocalDateTime.now().minusHours(23));
    taskStore.save(fresh1);
    taskStore.save(fresh2);

    taskScheduler.cleanupExpired();

    assertThat(taskStore.findById("task-fresh1")).isNotNull();
    assertThat(taskStore.findById("task-fresh2")).isNotNull();
  }

  private static ItineraryTask newTask(String id, TaskType type, TaskStatus status,
      String requestJson) {
    ItineraryTask task = new ItineraryTask();
    task.setId(id);
    task.setType(type);
    task.setStatus(status);
    task.setRequestJson(requestJson);
    task.setCreatedAt(LocalDateTime.now());
    return task;
  }

  private static GenerateItineraryRequest sampleGenerateRequest() {
    GenerateItineraryRequest request = new GenerateItineraryRequest();
    request.setDepartureLocation("Beijing");
    request.setDepartureTime(LocalDateTime.of(2026, 7, 1, 9, 0));
    request.setDestination("Xi'an");
    request.setDays(3);
    request.setPeopleCount(2);
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
    response.setSummary("spring trip");
    response.setDays(List.<DayPlan>of());
    response.setTips(List.of("take it easy"));
    response.setEstimatedBudget("2000");
    return response;
  }

  private static OptimizeResponse sampleOptimizeResult() {
    OptimizeResponse response = new OptimizeResponse();
    response.setOptimizedItinerary("better");
    response.setChanges(List.of());
    response.setReasoning("ok");
    return response;
  }

  private static TaskExecutionResult<ItineraryResponse> sampleGenerateExecution() {
    return new TaskExecutionResult<>(
        sampleItinerary(), TaskType.GENERATE, "Xi'an", 100, 10,
        "task", 1L, sampleGenerateRequest(), null);
  }

  private static TaskExecutionResult<OptimizeResponse> sampleOptimizeExecution() {
    return new TaskExecutionResult<>(
        sampleOptimizeResult(), TaskType.OPTIMIZE, "reduce budget", 100, 10,
        "task", 1L, null, null);
  }

  private static TaskExecutionResult<ItineraryResponse> sampleXiaohongshuExecution(
      String parsedContent) {
    return new TaskExecutionResult<>(
        sampleItinerary(), TaskType.XIAOHONGSHU, "note", 100, 10,
        "task", 1L, null, parsedContent);
  }
}
