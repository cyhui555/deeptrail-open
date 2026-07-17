package com.ai.travel.task;

/** 任务 deadline 或用户取消传播到执行链路时抛出的专用异常。 */
public class TaskExecutionCancelledException extends RuntimeException {

  private final TaskExecutionContext.CancellationReason reason;

  public TaskExecutionCancelledException(
      String taskId, TaskExecutionContext.CancellationReason reason) {
    super("Task execution cancelled: taskId=" + taskId + ", reason=" + reason);
    this.reason = reason;
  }

  public TaskExecutionContext.CancellationReason getReason() {
    return reason;
  }
}
