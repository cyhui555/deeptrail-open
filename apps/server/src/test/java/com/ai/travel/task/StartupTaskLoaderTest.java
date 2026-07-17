package com.ai.travel.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.ItineraryTaskMapper;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class StartupTaskLoaderTest {

  @Mock
  private ItineraryTaskMapper taskMapper;

  @Test
  void loadUnfinishedTasksRestoresPendingAndProcessingTasks() {
    InMemoryTaskStore taskStore = new InMemoryTaskStore();
    ItineraryTask pending = task("task-1", TaskType.GENERATE, TaskStatus.PENDING);
    ItineraryTask processing = task("task-2", TaskType.OPTIMIZE, TaskStatus.PROCESSING);
    when(taskMapper.selectList(any())).thenReturn(List.of(pending, processing));

    StartupTaskLoader loader = new StartupTaskLoader(taskMapper, taskStore);
    loader.loadUnfinishedTasks();

    verify(taskMapper).updateById(processing);
    assertThat(taskStore.size()).isEqualTo(2);
    assertThat(taskStore.findById("task-1").getStatus()).isEqualTo(TaskStatus.PENDING);
    assertThat(taskStore.findById("task-2").getStatus()).isEqualTo(TaskStatus.PENDING);
    assertThat(processing.getStatus()).isEqualTo(TaskStatus.PENDING);
  }

  @Test
  void loadUnfinishedTasks_doesNothingWhenNoUnfinishedTasks() {
    InMemoryTaskStore taskStore = new InMemoryTaskStore();
    when(taskMapper.selectList(any())).thenReturn(List.of());

    StartupTaskLoader loader = new StartupTaskLoader(taskMapper, taskStore);
    loader.loadUnfinishedTasks();

    assertThat(taskStore.size()).isEqualTo(0);
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
