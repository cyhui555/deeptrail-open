package com.ai.travel.task;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.service.ItineraryAiService;
import com.ai.travel.service.ItineraryAiService.TaskExecutionResult;
import com.ai.travel.service.ReleaseOutcomeMetrics;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.FutureTask;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 周期性调度器，扫描 PENDING 状态的任务并将其分派到 AI 执行器。
 *
 * <p>轮询间隔为 {@code task.scheduler.interval-ms}（默认 1 秒）。通过
 * {@link InMemoryTaskStore#compareAndSetStatus} 实现原子认领。实际的 AI 调用在
 * {@code aiTaskExecutor} 线程池上运行，避免阻塞调度线程。
 */
@Component("itineraryTaskScheduler")
@Slf4j
public class TaskScheduler {

  private final InMemoryTaskStore taskStore;
  private final TaskExecutionRegistry executionRegistry;
  private final ItineraryAiService aiService;
  private final ObjectMapper objectMapper;
  private final TaskExecutor taskExecutor;
  private final ItineraryTaskMapper taskMapper;
  private final int watchdogTimeoutMinutes;
  private final int maxRetryCount;
  private final ReleaseOutcomeMetrics outcomeMetrics;

  /**
   * 构造任务调度器。
   *
   * @param taskStore 内存任务存储
   * @param executionRegistry 运行中任务的取消与 Future 注册表
   * @param aiService AI 行程服务
   * @param objectMapper JSON 序列化工具
   * @param taskExecutor AI 任务线程池
   * @param taskMapper 任务数据库映射器
   * @param watchdogTimeoutMinutes 看门狗超时阈值（分钟）
   * @param maxRetryCount 任务最大重试次数
   */
  @Autowired
  public TaskScheduler(
      InMemoryTaskStore taskStore,
      TaskExecutionRegistry executionRegistry,
      ItineraryAiService aiService,
      ObjectMapper objectMapper,
      @Qualifier("aiTaskExecutor") TaskExecutor taskExecutor,
      ItineraryTaskMapper taskMapper,
      @Value("${task.watchdog.timeout-minutes:10}") int watchdogTimeoutMinutes,
      @Value("${task.max-retry:2}") int maxRetryCount,
      ReleaseOutcomeMetrics outcomeMetrics) {
    this.taskStore = taskStore;
    this.executionRegistry = executionRegistry;
    this.aiService = aiService;
    this.objectMapper = objectMapper;
    this.taskExecutor = taskExecutor;
    this.taskMapper = taskMapper;
    this.watchdogTimeoutMinutes = watchdogTimeoutMinutes;
    this.maxRetryCount = maxRetryCount;
    this.outcomeMetrics = outcomeMetrics;
  }

  /** 兼容不启动 Spring 的既有调度器单元测试。 */
  public TaskScheduler(
      InMemoryTaskStore taskStore,
      TaskExecutionRegistry executionRegistry,
      ItineraryAiService aiService,
      ObjectMapper objectMapper,
      TaskExecutor taskExecutor,
      ItineraryTaskMapper taskMapper,
      int watchdogTimeoutMinutes,
      int maxRetryCount) {
    this(taskStore, executionRegistry, aiService, objectMapper, taskExecutor, taskMapper,
        watchdogTimeoutMinutes, maxRetryCount, ReleaseOutcomeMetrics.noop());
  }

  /**
   * 周期性扫描并分派待处理任务。
   */
  @Scheduled(fixedDelayString = "${task.scheduler.interval-ms:1000}")
  public void pollAndDispatch() {
    List<ItineraryTask> pending = taskStore.findByStatus(TaskStatus.PENDING);
    if (pending.isEmpty()) {
      return;
    }

    log.debug("Scheduler scan: {} candidate tasks", pending.size());

    for (ItineraryTask task : pending) {
      boolean claimed = taskStore.compareAndSetStatus(
          task.getId(), TaskStatus.PENDING, TaskStatus.PROCESSING);
      if (!claimed) {
        continue;
      }

      task.setStartedAt(LocalDateTime.now());
      taskStore.save(task);

      TaskExecutionContext execution = executionRegistry.register(
          task.getId(), Duration.ofMinutes(watchdogTimeoutMinutes));
      FutureTask<Void> future = new FutureTask<>(() -> {
        try {
          processTask(task, execution);
        } finally {
          // 线程池会复用 worker；清除本任务的中断标记，避免污染下一次执行。
          Thread.interrupted();
        }
        return null;
      }) {
        @Override
        protected void done() {
          executionRegistry.finish(task.getId(), execution);
        }
      };
      executionRegistry.bindFuture(task.getId(), execution, future);
      try {
        taskExecutor.execute(future);
      } catch (RuntimeException exception) {
        future.cancel(false);
        taskStore.transition(task.getId(), TaskStatus.PROCESSING, TaskStatus.PENDING,
            current -> current.setStartedAt(null));
        taskStore.save(task);
        throw exception;
      }
    }
  }

  private void processTask(ItineraryTask task, TaskExecutionContext execution) {
    log.info("Processing task: id={}, type={}", task.getId(), task.getType());

    ItineraryTask currentTask = taskStore.findById(task.getId());
    if (currentTask == null || currentTask.getStatus() != TaskStatus.PROCESSING) {
      log.warn("Task already cancelled or status abnormal, skipping: id={}", task.getId());
      return;
    }

    try {
      execution.checkpoint();
      Object requestBody = parseRequest(task);
      String taskId = task.getId();
      Long userId = task.getUserId();
      TaskExecutionResult<?> outcome = switch (task.getType()) {
        case GENERATE -> aiService.executeGenerate(
            (GenerateItineraryRequest) requestBody, taskId, userId, execution);
        case OPTIMIZE -> aiService.executeOptimize(
            (OptimizeItineraryRequest) requestBody, taskId, userId, execution);
        case XIAOHONGSHU -> aiService.executeXiaohongshu(
            (XiaohongshuItineraryRequest) requestBody, taskId, userId, execution);
      };

      execution.checkpoint();
      String resultJson = objectMapper.writeValueAsString(outcome.result());
      execution.checkpoint();

      boolean updated = taskStore.transition(
          task.getId(), TaskStatus.PROCESSING, TaskStatus.COMPLETED, completed -> {
            completed.setResultJson(resultJson);
            completed.setParsedContent(outcome.parsedContent());
            completed.setErrorMessage(null);
            completed.setCompletedAt(LocalDateTime.now());
          });
      if (!updated) {
        log.info("Task terminal state already committed, skip success: id={}",
            task.getId());
        return;
      }

      if (persistTerminal(task)) {
        try {
          aiService.persistSuccess(outcome);
        } catch (Exception auditException) {
          // 任务结果已经成为唯一终态，审计补写失败不能把成功任务重新送入执行队列。
          log.error("Task completed but success audit persistence failed: id={}",
              task.getId(), auditException);
        }
      }
    } catch (TaskExecutionCancelledException exception) {
      handleCancellation(task, exception.getReason());
    } catch (Exception e) {
      if (execution.isCancelled()) {
        handleCancellation(task, execution.getCancellationReason());
        return;
      }
      log.error("Task processing failed: id={}", task.getId(), e);

      int retries = (task.getRetryCount() != null ? task.getRetryCount() : 0) + 1;

      if (retries < maxRetryCount) {
        // 未达到重试上限：重置为 PENDING，等待下一次调度周期重新认领
        log.warn("[Retry] task failed, will retry ({}/{}): id={}, error={}",
            retries, maxRetryCount, task.getId(), e.getMessage());
        boolean updated = taskStore.transition(
            task.getId(), TaskStatus.PROCESSING, TaskStatus.PENDING, pending -> {
              pending.setErrorMessage(StrUtil.maxLength(e.getMessage(), 500));
              pending.setResultJson(null);
              pending.setRetryCount(retries);
              pending.setStartedAt(null);
            });
        if (updated) {
          taskStore.save(task);
        }
        return;
      }

      // 达到重试上限：标记为 FAILED（死信）
      log.error("[DeadLetter] task exhausted retries ({}/{}): id={}, finalError={}",
          retries, maxRetryCount, task.getId(), e.getMessage());

      boolean updated = taskStore.transition(
          task.getId(), TaskStatus.PROCESSING, TaskStatus.FAILED, failed -> {
            failed.setErrorMessage(StrUtil.maxLength(e.getMessage(), 500));
            failed.setResultJson(null);
            failed.setRetryCount(retries);
            failed.setCompletedAt(LocalDateTime.now());
          });
      if (!updated) {
        log.info("Task terminal state already committed, skip failure: id={}",
            task.getId());
        return;
      }
      if (persistTerminal(task)) {
        try {
          aiService.persistFailure(
              task.getType(), e, elapsedSinceStart(task), task.getId(), task.getUserId());
        } catch (Exception auditException) {
          // FAILED 已是唯一终态；审计补写失败不能再次调度或覆盖任务状态。
          log.error("Task failed but failure audit persistence failed: id={}",
              task.getId(), auditException);
        }
        outcomeMetrics.recordTerminal(
            task.getType(), "failed", elapsedSinceStart(task), null);
      }
    }
  }

  private void handleCancellation(
      ItineraryTask task, TaskExecutionContext.CancellationReason reason) {
    if (reason == TaskExecutionContext.CancellationReason.TIMEOUT) {
      if (transitionToTimedOut(task)) {
        if (persistTerminal(task)) {
          outcomeMetrics.recordTerminal(
              task.getType(), "timeout", elapsedSinceStart(task), null);
        }
      }
      return;
    }
    log.info("Task execution stopped after user cancellation: id={}", task.getId());
    outcomeMetrics.recordTerminal(
        task.getType(), "cancelled", elapsedSinceStart(task), null);
  }

  private int elapsedSinceStart(ItineraryTask task) {
    if (task.getStartedAt() == null) {
      return 0;
    }
    long millis = Duration.between(task.getStartedAt(), LocalDateTime.now()).toMillis();
    return (int) Math.min(Math.max(millis, 0), Integer.MAX_VALUE);
  }

  private boolean transitionToTimedOut(ItineraryTask task) {
    return taskStore.transition(
        task.getId(), TaskStatus.PROCESSING, TaskStatus.FAILED, timedOut -> {
          timedOut.setErrorMessage("任务执行超时（超过 "
              + watchdogTimeoutMinutes + " 分钟），已自动终止，请重试");
          timedOut.setResultJson(null);
          timedOut.setCompletedAt(LocalDateTime.now());
        });
  }

  private boolean persistTerminal(ItineraryTask task) {
    taskStore.save(task);
    try {
      // DB 仍可能与用户取消并发；仅允许非终态记录赢得一次终态更新，
      // 避免无条件 updateById 覆盖已经提交的 CANCELLED/FAILED/COMPLETED。
      UpdateWrapper<ItineraryTask> update = Wrappers.<ItineraryTask>update()
          .eq("id", task.getId())
          .notIn("status",
              TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)
          .set("status", task.getStatus())
          .set("result_json", task.getResultJson())
          .set("error_message", task.getErrorMessage())
          .set("parsed_content", task.getParsedContent())
          .set("started_at", task.getStartedAt())
          .set("completed_at", task.getCompletedAt())
          .set("retry_count", task.getRetryCount());
      int rows = taskMapper.update(null, update);
      if (rows == 1) {
        return true;
      }
      log.warn("Terminal DB update lost concurrent race: taskId={}, status={}",
          task.getId(), task.getStatus());
      return false;
    } catch (Exception e) {
      // DB 写入失败不阻塞当前响应；数据库可能仍为 PENDING/PROCESSING。
      // 下次启动时 StartupTaskLoader 会把未完成记录重置为 PENDING 重新执行。
      log.error("Failed to persist terminal status to DB for task {} (status={}), "
              + "will be reconciled on next startup: {}",
          task.getId(), task.getStatus(), e.getMessage());
      return false;
    }
  }

  private Object parseRequest(ItineraryTask task) throws Exception {
    Class<?> clazz = switch (task.getType()) {
      case GENERATE -> GenerateItineraryRequest.class;
      case OPTIMIZE -> OptimizeItineraryRequest.class;
      case XIAOHONGSHU -> XiaohongshuItineraryRequest.class;
    };
    return objectMapper.readValue(task.getRequestJson(), clazz);
  }

  /**
   * 看门狗：扫描长时间处于 PROCESSING 状态的任务，强制标记为 FAILED。
   *
   * <p>防止因 AI 调用无超时、线程阻塞等原因导致任务永久卡在 PROCESSING。
   * 超时阈值由 {@code task.watchdog.timeout-minutes} 控制（默认 10 分钟）。
   */
  @Scheduled(fixedDelayString = "${task.watchdog.interval-ms:30000}")
  public void watchdog() {
    List<ItineraryTask> processing = taskStore.findByStatus(TaskStatus.PROCESSING);
    if (processing.isEmpty()) {
      return;
    }
    LocalDateTime threshold = LocalDateTime.now().minusMinutes(watchdogTimeoutMinutes);
    int killed = 0;
    for (ItineraryTask task : processing) {
      if (task.getStartedAt() != null && task.getStartedAt().isBefore(threshold)) {
        if (transitionToTimedOut(task)) {
          executionRegistry.cancel(
              task.getId(), TaskExecutionContext.CancellationReason.TIMEOUT);
          persistTerminal(task);
          killed++;
          log.warn("Watchdog killed stuck task: id={}, type={}, startedAt={}",
              task.getId(), task.getType(), task.getStartedAt());
        }
      }
    }
    if (killed > 0) {
      log.info("Watchdog sweep: timed out {} stuck tasks (threshold={} minutes)",
          killed, watchdogTimeoutMinutes);
    }
  }

  /**
   * 清理超过 24 小时前完成的任务，防止内存无限增长。
   *
   * <p>同时清理数据库中的对应记录，避免 DB 磁盘无限膨胀。
   */
  @Scheduled(fixedDelayString = "${task.cleanup.interval-ms:3600000}")
  public void cleanupExpired() {
    LocalDateTime threshold = LocalDateTime.now().minusHours(24);
    List<ItineraryTask> all = taskStore.findByStatus(TaskStatus.COMPLETED);
    all.addAll(taskStore.findByStatus(TaskStatus.FAILED));
    all.addAll(taskStore.findByStatus(TaskStatus.CANCELLED));
    int removed = 0;
    for (ItineraryTask t : all) {
      if (t.getCompletedAt() != null && t.getCompletedAt().isBefore(threshold)) {
        taskStore.delete(t.getId());
        taskMapper.deleteById(t.getId());
        removed++;
      }
    }
    if (removed > 0) {
      log.info("Cleaned up {} expired tasks (memory + DB)", removed);
    }
  }
}
