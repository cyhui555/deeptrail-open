package com.ai.travel.task;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** 保存单实例内正在运行的任务上下文和 Future，用于传播 watchdog/用户取消。 */
@Component
public class TaskExecutionRegistry {

  private final ConcurrentHashMap<String, RunningExecution> executions =
      new ConcurrentHashMap<>();

  /** 注册一次新执行；同一任务仍在运行时拒绝重复登记。 */
  public TaskExecutionContext register(String taskId, Duration timeout) {
    TaskExecutionContext context = TaskExecutionContext.withTimeout(taskId, timeout);
    RunningExecution running = new RunningExecution(context);
    if (executions.putIfAbsent(taskId, running) != null) {
      throw new IllegalStateException("Task execution already registered: " + taskId);
    }
    return context;
  }

  /** Future 创建后绑定到已登记上下文；若取消先到达，立即取消该 Future。 */
  public void bindFuture(String taskId, TaskExecutionContext context, Future<?> future) {
    RunningExecution running = requireSameExecution(taskId, context);
    running.future.set(Objects.requireNonNull(future, "future"));
    if (context.isCancelled()) {
      future.cancel(true);
    }
  }

  /** 登记取消原因并中断当前 Future；任务不存在时返回 false。 */
  public boolean cancel(
      String taskId, TaskExecutionContext.CancellationReason reason) {
    RunningExecution running = executions.get(taskId);
    if (running == null) {
      return false;
    }
    running.context.cancel(reason);
    Future<?> future = running.future.get();
    if (future != null) {
      future.cancel(true);
    }
    return true;
  }

  /** Future 完成或被取消后移除同一代执行，避免误删后续重试。 */
  public void finish(String taskId, TaskExecutionContext context) {
    executions.computeIfPresent(taskId, (ignored, running) ->
        running.context == context ? null : running);
  }

  boolean isRunning(String taskId) {
    return executions.containsKey(taskId);
  }

  private RunningExecution requireSameExecution(
      String taskId, TaskExecutionContext context) {
    RunningExecution running = executions.get(taskId);
    if (running == null || running.context != context) {
      throw new IllegalStateException("Task execution is not registered: " + taskId);
    }
    return running;
  }

  private static final class RunningExecution {
    private final TaskExecutionContext context;
    private final AtomicReference<Future<?>> future = new AtomicReference<>();

    private RunningExecution(TaskExecutionContext context) {
      this.context = context;
    }
  }
}
