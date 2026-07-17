package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.security.UserContext;
import com.ai.travel.task.InMemoryTaskStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class TaskStatusStreamServiceTest {

  private final InMemoryTaskStore taskStore = new InMemoryTaskStore();
  private final TaskStatusStreamService service = new TaskStatusStreamService(
      taskStore,
      mock(ItineraryTaskMapper.class));

  @AfterEach
  void tearDown() {
    UserContext.clear();
    service.closeAll();
  }

  @Test
  void openReturnsStreamForTaskOwner() {
    taskStore.save(task("task-owned", 7L, TaskStatus.PROCESSING));
    UserContext.setUserId(7L);

    assertThat(service.open("task-owned")).isNotNull();
  }

  @Test
  void openRejectsAnotherUserAndMissingContext() {
    taskStore.save(task("task-private", 7L, TaskStatus.PENDING));

    assertThatThrownBy(() -> service.open("task-private"))
        .isInstanceOf(ForbiddenException.class);

    UserContext.setUserId(8L);
    assertThatThrownBy(() -> service.open("task-private"))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  void openRejectsUnknownTask() {
    assertThatThrownBy(() -> service.open("missing"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private ItineraryTask task(String id, Long userId, TaskStatus status) {
    ItineraryTask task = new ItineraryTask();
    task.setId(id);
    task.setUserId(userId);
    task.setStatus(status);
    return task;
  }
}
