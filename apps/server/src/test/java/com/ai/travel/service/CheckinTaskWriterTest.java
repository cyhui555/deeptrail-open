package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 签到任务短事务写入器测试。 */
class CheckinTaskWriterTest {

  private final CheckinTaskMapper taskMapper = mock(CheckinTaskMapper.class);
  private final CheckinItemMapper itemMapper = mock(CheckinItemMapper.class);
  private final CheckinTaskWriter writer = new CheckinTaskWriter(taskMapper, itemMapper);

  @Test
  void persistIfAbsentBindsGeneratedTaskIdToItems() {
    when(taskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
    when(taskMapper.insert(any(CheckinTask.class))).thenAnswer(invocation -> {
      invocation.getArgument(0, CheckinTask.class).setId("task-1");
      return 1;
    });
    CheckinTask task = new CheckinTask();
    CheckinItem item = new CheckinItem();

    String result = writer.persistIfAbsent(
        "plan-1", List.of(new CheckinTaskDraft(task, List.of(item))));

    assertThat(result).isEqualTo("task-1");
    assertThat(item.getCheckinTaskId()).isEqualTo("task-1");
    verify(itemMapper).insert(item);
  }

  @Test
  void persistIfAbsentReturnsExistingTaskWithoutWriting() {
    CheckinTask existing = new CheckinTask();
    existing.setId("existing-task");
    when(taskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existing);

    String result = writer.persistIfAbsent("plan-1", List.of());

    assertThat(result).isEqualTo("existing-task");
    verify(taskMapper, never()).insert(any(CheckinTask.class));
  }
}
