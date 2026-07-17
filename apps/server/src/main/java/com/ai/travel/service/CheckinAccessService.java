package com.ai.travel.service;

import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.exception.CheckinItemNotFoundException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 打卡资源访问控制服务。
 *
 * <p>所有通过打卡项间接访问媒体、坐标或详情的入口都应复用此处，避免控制器只校验登录态、
 * 却遗漏“资源是否属于当前用户”的对象级权限检查。
 */
@Service
@RequiredArgsConstructor
public class CheckinAccessService {

  private final CheckinItemMapper checkinItemMapper;
  private final CheckinTaskMapper checkinTaskMapper;

  /**
   * 加载并校验当前用户拥有的打卡项。
   *
   * @param itemId 打卡项 ID
   * @param userId 当前用户 ID
   * @return 已通过所有权校验的打卡项
   */
  public CheckinItem requireOwnedItem(Long itemId, Long userId) {
    CheckinItem item = checkinItemMapper.selectById(itemId);
    if (item == null) {
      throw new CheckinItemNotFoundException("打卡项不存在: " + itemId);
    }

    CheckinTask task = checkinTaskMapper.selectById(item.getCheckinTaskId());
    if (task == null) {
      throw new CheckinItemNotFoundException("打卡项所属任务不存在: " + itemId);
    }
    if (userId == null || !Objects.equals(userId, task.getUserId())) {
      throw new ForbiddenException("无权访问该打卡项");
    }
    return item;
  }
}
