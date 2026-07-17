package com.ai.travel.task;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class InMemoryTaskStoreTest {

  private InMemoryTaskStore taskStore;

  @BeforeEach
  void setUp() {
    taskStore = new InMemoryTaskStore();
  }

  @Test
  void saveFindFilterDeleteAndCasWork() {
    ItineraryTask pending = task("task-1", TaskType.GENERATE, TaskStatus.PENDING);
    ItineraryTask processing = task("task-2", TaskType.OPTIMIZE, TaskStatus.PROCESSING);

    taskStore.save(pending);
    taskStore.save(processing);

    assertThat(taskStore.size()).isEqualTo(2);
    assertThat(taskStore.findById("task-1")).isSameAs(pending);
    assertThat(taskStore.findByStatus(TaskStatus.PENDING)).containsExactly(pending);

    assertThat(taskStore.compareAndSetStatus("task-1", TaskStatus.PENDING, TaskStatus.PROCESSING))
        .isTrue();
    assertThat(pending.getStatus()).isEqualTo(TaskStatus.PROCESSING);
    assertThat(taskStore.compareAndSetStatus("task-1", TaskStatus.PENDING, TaskStatus.COMPLETED))
        .isFalse();

    taskStore.delete("task-2");
    assertThat(taskStore.findById("task-2")).isNull();
    assertThat(taskStore.size()).isEqualTo(1);
  }

  private static ItineraryTask task(String id, TaskType type, TaskStatus status) {
    ItineraryTask task = new ItineraryTask();
    task.setId(id);
    task.setType(type);
    task.setStatus(status);
    task.setCreatedAt(LocalDateTime.now());
    return task;
  }
}
