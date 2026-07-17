package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.CheckinRequest;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

/** 打卡幂等与原子状态跃迁测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinExecutionServiceTest {

  @Mock private CheckinTaskMapper checkinTaskMapper;
  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private CheckinMediaMapper checkinMediaMapper;
  @Mock private TripPlanMapper tripPlanMapper;

  private CheckinExecutionService service;

  @BeforeEach
  void setUp() {
    service = new CheckinExecutionService(
        checkinTaskMapper, checkinItemMapper, checkinMediaMapper, tripPlanMapper);
  }

  @Test
  @DisplayName("同一打卡项使用同一幂等键重试应直接成功且不重复计数")
  void checkin_sameItemAndKey_doesNotIncrementAgain() {
    CheckinItem item = checkedItem(1L, "task-1", "operation-1");
    CheckinTask task = task("task-1", 1L);
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.selectByTaskAndIdempotencyKey("task-1", "operation-1"))
        .thenReturn(item);

    service.checkin(1L, request("operation-1"), 1L);

    verify(checkinItemMapper, never()).markCheckedInIfPending(any());
    verify(checkinTaskMapper, never()).incrementCompletedPoi(any(), any());
  }

  @Test
  @DisplayName("已打卡项使用不同幂等键重试应维持冲突")
  void checkin_checkedItemWithDifferentKey_isRejected() {
    CheckinItem item = checkedItem(1L, "task-1", "operation-1");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task("task-1", 1L));

    assertThatThrownBy(() -> service.checkin(1L, request("operation-2"), 1L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("已打卡");

    verify(checkinItemMapper, never()).markCheckedInIfPending(any());
    verify(checkinTaskMapper, never()).incrementCompletedPoi(any(), any());
  }

  @Test
  @DisplayName("幂等命中前必须校验所有权")
  void checkin_sameKeyFromAnotherUser_isForbiddenBeforeIdempotencyLookup() {
    CheckinItem item = checkedItem(1L, "task-1", "operation-1");
    CheckinTask task = task("task-1", 2L);
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> service.checkin(1L, request("operation-1"), 1L))
        .isInstanceOf(ForbiddenException.class);

    verify(checkinItemMapper, never()).selectByTaskAndIdempotencyKey(any(), any());
    verify(checkinTaskMapper, never()).incrementCompletedPoi(any(), any());
  }

  @Test
  @DisplayName("同一任务内不同打卡项复用幂等键应明确冲突")
  void checkin_sameTaskDifferentItemAndKey_isRejected() {
    CheckinItem current = pendingItem(2L, "task-1");
    CheckinItem keyOwner = checkedItem(1L, "task-1", "operation-1");
    when(checkinItemMapper.selectById(2L)).thenReturn(current);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task("task-1", 1L));
    when(checkinItemMapper.selectByTaskAndIdempotencyKey("task-1", "operation-1"))
        .thenReturn(keyOwner);

    assertThatThrownBy(() -> service.checkin(2L, request("operation-1"), 1L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("其他打卡项");

    verify(checkinItemMapper, never()).markCheckedInIfPending(any());
  }

  @Test
  @DisplayName("只有赢得 PENDING 到 CHECKED_IN 状态跃迁的请求可以递增父任务")
  void checkin_atomicTransition_incrementsParentOnlyAfterWinning() {
    CheckinItem item = pendingItem(1L, "task-1");
    CheckinTask task = task("task-1", 1L);
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.markCheckedInIfPending(any())).thenReturn(1);
    when(checkinTaskMapper.incrementCompletedPoi(eq("task-1"), any(LocalDateTime.class)))
        .thenReturn(1);

    service.checkin(1L, request("operation-1"), 1L);

    InOrder order = inOrder(checkinItemMapper, checkinTaskMapper);
    order.verify(checkinItemMapper).markCheckedInIfPending(any());
    order.verify(checkinTaskMapper)
        .incrementCompletedPoi(eq("task-1"), any(LocalDateTime.class));
  }

  @Test
  @DisplayName("并发输家观察到相同幂等结果时应成功返回且不递增父任务")
  void checkin_concurrentSameKeyLoser_doesNotIncrementParent() {
    CheckinItem pending = pendingItem(1L, "task-1");
    CheckinItem completed = checkedItem(1L, "task-1", "operation-1");
    when(checkinItemMapper.selectById(1L)).thenReturn(pending, completed);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task("task-1", 1L));
    when(checkinItemMapper.markCheckedInIfPending(any())).thenReturn(0);

    service.checkin(1L, request("operation-1"), 1L);

    verify(checkinItemMapper, times(1)).markCheckedInIfPending(any());
    verify(checkinTaskMapper, never()).incrementCompletedPoi(any(), any());
  }

  @Test
  @DisplayName("并发占用同一任务幂等键时应把数据库唯一冲突转换为业务冲突")
  void checkin_uniqueConstraintRace_returnsExplicitConflict() {
    when(checkinItemMapper.selectById(2L)).thenReturn(pendingItem(2L, "task-1"));
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task("task-1", 1L));
    when(checkinItemMapper.markCheckedInIfPending(any()))
        .thenThrow(new DataIntegrityViolationException("UNIQUE constraint failed"));

    assertThatThrownBy(() -> service.checkin(2L, request("operation-1"), 1L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("其他打卡项");

    verify(checkinTaskMapper, never()).incrementCompletedPoi(any(), any());
  }

  private CheckinRequest request(String idempotencyKey) {
    CheckinRequest request = new CheckinRequest();
    request.setSource("MANUAL");
    request.setIdempotencyKey(idempotencyKey);
    return request;
  }

  private CheckinItem pendingItem(Long id, String taskId) {
    CheckinItem item = new CheckinItem();
    item.setId(id);
    item.setCheckinTaskId(taskId);
    item.setStatus("PENDING");
    return item;
  }

  private CheckinItem checkedItem(Long id, String taskId, String idempotencyKey) {
    CheckinItem item = pendingItem(id, taskId);
    item.setStatus("CHECKED_IN");
    item.setCheckinIdempotencyKey(idempotencyKey);
    return item;
  }

  private CheckinTask task(String id, Long userId) {
    CheckinTask task = new CheckinTask();
    task.setId(id);
    task.setPlanId("plan-1");
    task.setUserId(userId);
    task.setStatus("ACTIVE");
    task.setCompletedPoi(0);
    task.setTotalPoi(2);
    return task;
  }
}
