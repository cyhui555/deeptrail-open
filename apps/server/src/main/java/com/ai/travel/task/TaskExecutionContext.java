package com.ai.travel.task;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

/** 单次异步任务的 deadline 与取消状态，供完整执行链路在阶段边界检查。 */
public final class TaskExecutionContext {

  /** 取消来源决定调度器最终写入 FAILED 还是保留用户 CANCELLED。 */
  public enum CancellationReason {
    TIMEOUT,
    USER_CANCELLED
  }

  private final String taskId;
  private final long deadlineNanos;
  private final LongSupplier nanoTime;
  private final AtomicReference<CancellationReason> cancellationReason =
      new AtomicReference<>();

  private TaskExecutionContext(
      String taskId, long deadlineNanos, LongSupplier nanoTime) {
    this.taskId = Objects.requireNonNull(taskId, "taskId");
    this.deadlineNanos = deadlineNanos;
    this.nanoTime = Objects.requireNonNull(nanoTime, "nanoTime");
  }

  /** 创建带单调时钟 deadline 的任务上下文。 */
  public static TaskExecutionContext withTimeout(String taskId, Duration timeout) {
    return withTimeout(taskId, timeout, System::nanoTime);
  }

  static TaskExecutionContext withTimeout(
      String taskId, Duration timeout, LongSupplier nanoTime) {
    long now = nanoTime.getAsLong();
    long timeoutNanos = Math.max(0L, timeout.toNanos());
    long deadline = Long.MAX_VALUE - now < timeoutNanos
        ? Long.MAX_VALUE
        : now + timeoutNanos;
    return new TaskExecutionContext(taskId, deadline, nanoTime);
  }

  /** 为兼容同步调用创建无 deadline 上限、但仍响应线程中断的上下文。 */
  public static TaskExecutionContext unbounded(String taskId) {
    return new TaskExecutionContext(taskId, Long.MAX_VALUE, System::nanoTime);
  }

  public String getTaskId() {
    return taskId;
  }

  /** 幂等登记取消原因；第一个原因拥有终态语义。 */
  public boolean cancel(CancellationReason reason) {
    return cancellationReason.compareAndSet(null, Objects.requireNonNull(reason, "reason"));
  }

  public boolean isCancelled() {
    refreshCancellationState();
    return cancellationReason.get() != null;
  }

  public CancellationReason getCancellationReason() {
    refreshCancellationState();
    return cancellationReason.get();
  }

  /**
   * 在外部调用和持久化边界检查 deadline/取消。
   *
   * <p>使用单调时钟避免系统时间回拨；线程中断只作为兜底，正常取消会先由注册表写入明确原因。
   */
  public void checkpoint() {
    refreshCancellationState();
    CancellationReason reason = cancellationReason.get();
    if (reason != null) {
      throw new TaskExecutionCancelledException(taskId, reason);
    }
  }

  private void refreshCancellationState() {
    if (cancellationReason.get() == null
        && deadlineNanos != Long.MAX_VALUE
        && nanoTime.getAsLong() - deadlineNanos >= 0) {
      cancel(CancellationReason.TIMEOUT);
    }
    if (cancellationReason.get() == null && Thread.currentThread().isInterrupted()) {
      cancel(CancellationReason.USER_CANCELLED);
    }
  }
}
