package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.exception.CheckinItemNotFoundException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 打卡对象级权限校验测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinAccessServiceTest {

  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private CheckinTaskMapper checkinTaskMapper;

  private CheckinAccessService service;

  @BeforeEach
  void setUp() {
    service = new CheckinAccessService(checkinItemMapper, checkinTaskMapper);
  }

  @Test
  @DisplayName("当前用户拥有打卡项时返回资源")
  void requireOwnedItem_owner_returnsItem() {
    CheckinItem item = item(1L, "task-1");
    CheckinTask task = task("task-1", 7L);
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThat(service.requireOwnedItem(1L, 7L)).isSameAs(item);
  }

  @Test
  @DisplayName("其他用户访问打卡项时拒绝")
  void requireOwnedItem_otherUser_throwsForbidden() {
    when(checkinItemMapper.selectById(1L)).thenReturn(item(1L, "task-1"));
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task("task-1", 8L));

    assertThatThrownBy(() -> service.requireOwnedItem(1L, 7L))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("缺少用户上下文时拒绝访问")
  void requireOwnedItem_missingUser_throwsForbidden() {
    when(checkinItemMapper.selectById(1L)).thenReturn(item(1L, "task-1"));
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task("task-1", 7L));

    assertThatThrownBy(() -> service.requireOwnedItem(1L, null))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("打卡项不存在时返回资源不存在异常")
  void requireOwnedItem_missingItem_throwsNotFound() {
    when(checkinItemMapper.selectById(404L)).thenReturn(null);

    assertThatThrownBy(() -> service.requireOwnedItem(404L, 7L))
        .isInstanceOf(CheckinItemNotFoundException.class);
  }

  private CheckinItem item(Long id, String taskId) {
    CheckinItem item = new CheckinItem();
    item.setId(id);
    item.setCheckinTaskId(taskId);
    return item;
  }

  private CheckinTask task(String id, Long userId) {
    CheckinTask task = new CheckinTask();
    task.setId(id);
    task.setUserId(userId);
    return task;
  }
}
