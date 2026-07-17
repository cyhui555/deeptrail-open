package com.ai.travel.task;

import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import jakarta.annotation.PostConstruct;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 启动加载器，进程重启后从 DB 恢复未完成任务到内存缓存。
 *
 * <p>将 PROCESSING 状态的孤儿任务重置为 PENDING，使其可被调度器重新认领。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StartupTaskLoader {

  private final ItineraryTaskMapper taskMapper;
  private final InMemoryTaskStore taskStore;

  /**
   * 启动时从数据库加载未完成任务到内存缓存，并将 PROCESSING 状态重置为 PENDING。
   */
  @PostConstruct
  public void loadUnfinishedTasks() {
    List<ItineraryTask> unfinished = taskMapper.selectList(
        Wrappers.<ItineraryTask>lambdaQuery()
            .in(ItineraryTask::getStatus, TaskStatus.PENDING, TaskStatus.PROCESSING));
    if (unfinished.isEmpty()) {
      log.info("启动加载: 无未完成任务");
      return;
    }

    int resetCount = 0;
    for (ItineraryTask task : unfinished) {
      if (task.getStatus() == TaskStatus.PROCESSING) {
        task.setStatus(TaskStatus.PENDING);
        taskMapper.updateById(task);
        resetCount++;
      }
      taskStore.save(task);
    }

    log.info("启动加载: 共恢复 {} 个未完成任务（其中 {} 个 PROCESSING 重置为 PENDING）",
        unfinished.size(), resetCount);
  }
}
