package com.ai.travel.service;

import com.ai.travel.dto.response.TaskStatusEventResponse;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.security.UserContext;
import com.ai.travel.task.InMemoryTaskStore;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 单实例任务状态事件中心。
 * 任务结果仍通过受鉴权的详情接口读取，SSE 只通知有限状态，避免推送用户输入和 AI 内容。
 */
@Service
public class TaskStatusStreamService {

  private static final long STREAM_TIMEOUT_MS = 5 * 60 * 1000L;

  private final InMemoryTaskStore taskStore;
  private final ItineraryTaskMapper taskMapper;
  private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> emitters =
      new ConcurrentHashMap<>();

  public TaskStatusStreamService(InMemoryTaskStore taskStore,
                                 ItineraryTaskMapper taskMapper) {
    this.taskStore = taskStore;
    this.taskMapper = taskMapper;
  }

  @PostConstruct
  void registerListener() {
    taskStore.setChangeListener(this::publish);
  }

  /**
   * 为当前登录用户打开指定任务的状态事件流。
   *
   * @param taskId 任务 ID
   * @return 已发送当前状态的 SSE 发射器
   */
  public SseEmitter open(String taskId) {
    ItineraryTask task = taskStore.findById(taskId);
    if (task == null) {
      task = taskMapper.selectById(taskId);
    }
    if (task == null) {
      throw new IllegalArgumentException("Task not found");
    }

    Long userId = UserContext.getUserId();
    if (task.getUserId() != null && !task.getUserId().equals(userId)) {
      throw new ForbiddenException("无权访问该任务");
    }

    SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
    emitters.computeIfAbsent(taskId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
    emitter.onCompletion(() -> remove(taskId, emitter));
    emitter.onTimeout(() -> {
      remove(taskId, emitter);
      emitter.complete();
    });
    emitter.onError(error -> remove(taskId, emitter));
    send(taskId, task.getStatus(), emitter);
    if (isTerminal(task.getStatus())) {
      emitter.complete();
    }
    return emitter;
  }

  private void publish(ItineraryTask task) {
    List<SseEmitter> taskEmitters = emitters.get(task.getId());
    if (taskEmitters == null || taskEmitters.isEmpty()) {
      return;
    }
    for (SseEmitter emitter : taskEmitters) {
      send(task.getId(), task.getStatus(), emitter);
      if (isTerminal(task.getStatus())) {
        emitter.complete();
      }
    }
  }

  private void send(String taskId, TaskStatus status, SseEmitter emitter) {
    try {
      emitter.send(SseEmitter.event()
          .name("task-status")
          .reconnectTime(3000)
          .data(new TaskStatusEventResponse(taskId, status, isTerminal(status))));
    } catch (IOException | IllegalStateException error) {
      remove(taskId, emitter);
      emitter.completeWithError(error);
    }
  }

  @Scheduled(fixedDelay = 15000)
  void keepAlive() {
    emitters.forEach((taskId, taskEmitters) -> {
      for (SseEmitter emitter : taskEmitters) {
        try {
          emitter.send(SseEmitter.event().comment("keepalive"));
        } catch (IOException | IllegalStateException error) {
          remove(taskId, emitter);
        }
      }
    });
  }

  private boolean isTerminal(TaskStatus status) {
    return status == TaskStatus.COMPLETED
        || status == TaskStatus.FAILED
        || status == TaskStatus.CANCELLED;
  }

  private void remove(String taskId, SseEmitter emitter) {
    emitters.computeIfPresent(taskId, (ignored, taskEmitters) -> {
      taskEmitters.remove(emitter);
      return taskEmitters.isEmpty() ? null : taskEmitters;
    });
  }

  @PreDestroy
  void closeAll() {
    taskStore.setChangeListener(null);
    emitters.values().forEach(taskEmitters -> taskEmitters.forEach(SseEmitter::complete));
    emitters.clear();
  }
}
