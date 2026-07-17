package com.ai.travel.service;

import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 将已完成外部坐标解析的签到任务草稿原子化写入数据库。 */
@Service
@RequiredArgsConstructor
public class CheckinTaskWriter {

  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;

  /**
   * 在事务内再次执行幂等检查并写入全部天和签到项。
   * 地理编码已在调用前完成，因此该事务只包含数据库操作。
   */
  @Transactional
  public String persistIfAbsent(String planId, List<CheckinTaskDraft> drafts) {
    CheckinTask existing = findFirstTask(planId);
    if (existing != null) {
      return existing.getId();
    }
    String firstTaskId = null;
    for (CheckinTaskDraft draft : drafts) {
      CheckinTask task = draft.task();
      checkinTaskMapper.insert(task);
      if (firstTaskId == null) {
        firstTaskId = task.getId();
      }
      for (CheckinItem item : draft.items()) {
        item.setCheckinTaskId(task.getId());
        checkinItemMapper.insert(item);
      }
    }
    return firstTaskId;
  }

  /** 查询清单最早的签到任务，供事务内外复用幂等判断。 */
  public CheckinTask findFirstTask(String planId) {
    LambdaQueryWrapper<CheckinTask> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinTask::getPlanId, planId)
        .orderByAsc(CheckinTask::getDayNumber)
        .last("LIMIT 1");
    return checkinTaskMapper.selectOne(wrapper);
  }
}
