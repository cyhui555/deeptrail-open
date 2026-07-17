package com.ai.travel.service;

import com.ai.travel.dto.response.CheckinItemResponse;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 签到任务与签到项的只读查询服务。 */
@Service
@RequiredArgsConstructor
public class CheckinQueryService {

  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;
  private final CheckinAccessService checkinAccessService;
  private final CheckinResponseAssembler responseAssembler;

  /** 按天返回清单下的全部签到任务。 */
  public List<CheckinTaskResponse> getCheckinTasks(String planId) {
    LambdaQueryWrapper<CheckinTask> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinTask::getPlanId, planId).orderByAsc(CheckinTask::getDayNumber);
    List<CheckinTask> tasks = checkinTaskMapper.selectList(wrapper);
    if (tasks.isEmpty()) {
      return List.of();
    }

    // 首屏 GET 只执行数据库读取：任务、打卡项和媒体均批量加载，避免逐日/逐项 N+1。
    List<String> taskIds = tasks.stream().map(CheckinTask::getId).toList();
    return responseAssembler.toTaskResponses(tasks, loadItems(taskIds));
  }

  /** 返回单个签到任务，不存在时返回 null。 */
  public CheckinTaskResponse getCheckinTaskById(String checkinTaskId) {
    CheckinTask task = checkinTaskMapper.selectById(checkinTaskId);
    if (task == null) {
      return null;
    }
    return responseAssembler.toTaskResponse(task, loadItems(task.getId()));
  }

  /** 返回已通过用户归属校验的签到项详情。 */
  public CheckinItemResponse getCheckinItemDetail(Long itemId, Long userId) {
    CheckinItem item = checkinAccessService.requireOwnedItem(itemId, userId);
    return responseAssembler.toItemResponse(item);
  }

  private List<CheckinItem> loadItems(String taskId) {
    LambdaQueryWrapper<CheckinItem> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinItem::getCheckinTaskId, taskId).orderByAsc(CheckinItem::getId);
    return checkinItemMapper.selectList(wrapper);
  }

  private List<CheckinItem> loadItems(List<String> taskIds) {
    LambdaQueryWrapper<CheckinItem> wrapper = new LambdaQueryWrapper<>();
    wrapper.in(CheckinItem::getCheckinTaskId, taskIds)
        .orderByAsc(CheckinItem::getCheckinTaskId)
        .orderByAsc(CheckinItem::getId);
    return checkinItemMapper.selectList(wrapper);
  }
}
