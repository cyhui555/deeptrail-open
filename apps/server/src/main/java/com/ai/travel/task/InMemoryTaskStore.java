package com.ai.travel.task;

import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.enums.TaskStatus;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 线程安全的内存任务存储，基于 {@link ConcurrentHashMap}。
 *
 * <p>适用 MVP / 单实例部署；进程重启后任务丢失（由 {@link StartupTaskLoader} 从 DB 恢复）。
 * 状态转换通过 {@link #compareAndSetStatus} 保证原子性。
 *
 * <p><b>多实例限制：</b>此类仅在 JVM 进程内可见，多实例部署时各实例内存状态独立，
 * 可能导致同一任务被多个实例并发调度。扩展多实例时需要替换为 Redis 等外部存储。
 */
@Component
public class InMemoryTaskStore {

  private final ConcurrentHashMap<String, ItineraryTask> tasks = new ConcurrentHashMap<>();
  private volatile Consumer<ItineraryTask> changeListener = task -> { };

  /** 保存任务，同 ID 覆盖。 */
  public void save(ItineraryTask task) {
    tasks.put(task.getId(), task);
    changeListener.accept(task);
  }

  /** 注册单实例任务状态监听器，用于向浏览器推送状态变化。 */
  public void setChangeListener(Consumer<ItineraryTask> listener) {
    changeListener = listener != null ? listener : task -> { };
  }

  /** 按 ID 查询，不存在返回 null。 */
  public ItineraryTask findById(String id) {
    return tasks.get(id);
  }

  /** 按状态过滤，返回当前快照列表。 */
  public List<ItineraryTask> findByStatus(TaskStatus status) {
    return tasks.values().stream()
        .filter(t -> t.getStatus() == status)
        .collect(Collectors.toList());
  }

  /**
   * 原子地将状态从 expected 更新为 updated。
   *
   * @return true 表示更新成功；false 表示当前状态与 expected 不匹配
   */
  public boolean compareAndSetStatus(String id, TaskStatus expected, TaskStatus updated) {
    return transition(id, expected, updated, task -> { });
  }

  /**
   * 原子地提交状态和附属字段，避免 watchdog 与工作线程分别写出半个终态。
   *
   * @param mutator 只在当前状态匹配时执行；应写入结果、错误和完成时间等终态字段
   * @return true 表示本调用赢得状态转换
   */
  public boolean transition(
      String id,
      TaskStatus expected,
      TaskStatus updated,
      Consumer<ItineraryTask> mutator) {
    AtomicBoolean changed = new AtomicBoolean(false);
    tasks.computeIfPresent(id, (k, task) -> {
      if (task.getStatus() == expected) {
        mutator.accept(task);
        task.setStatus(updated);
        changed.set(true);
      }
      return task;
    });
    return changed.get();
  }

  /** 按 ID 删除。 */
  public void delete(String id) {
    tasks.remove(id);
  }

  /** 当前任务总数。 */
  public int size() {
    return tasks.size();
  }
}
