package com.ai.travel.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.concurrent.FutureTask;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class TaskExecutionContextTest {

  @Test
  void checkpointUsesMonotonicDeadline() {
    AtomicLong now = new AtomicLong(100L);
    TaskExecutionContext context = TaskExecutionContext.withTimeout(
        "task-timeout", Duration.ofNanos(10L), now::get);

    now.set(109L);
    context.checkpoint();
    now.set(110L);

    assertThatThrownBy(context::checkpoint)
        .isInstanceOf(TaskExecutionCancelledException.class)
        .satisfies(exception -> assertThat(
            ((TaskExecutionCancelledException) exception).getReason())
            .isEqualTo(TaskExecutionContext.CancellationReason.TIMEOUT));
  }

  @Test
  void registryCancelsBoundFutureAndKeepsFirstReason() {
    TaskExecutionRegistry registry = new TaskExecutionRegistry();
    TaskExecutionContext context = registry.register("task-cancel", Duration.ofMinutes(10));
    FutureTask<Void> future = new FutureTask<>(() -> null);
    registry.bindFuture("task-cancel", context, future);

    assertThat(registry.cancel(
        "task-cancel", TaskExecutionContext.CancellationReason.USER_CANCELLED)).isTrue();
    context.cancel(TaskExecutionContext.CancellationReason.TIMEOUT);

    assertThat(future.isCancelled()).isTrue();
    assertThat(context.getCancellationReason())
        .isEqualTo(TaskExecutionContext.CancellationReason.USER_CANCELLED);
    registry.finish("task-cancel", context);
    assertThat(registry.isRunning("task-cancel")).isFalse();
  }
}
