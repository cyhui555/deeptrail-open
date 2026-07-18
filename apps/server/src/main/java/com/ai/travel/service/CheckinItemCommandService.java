package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.AddCustomItemRequest;
import com.ai.travel.dto.request.EditCustomItemRequest;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.CheckinItemNotFoundException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 自定义签到项及签到项元数据的写操作。 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CheckinItemCommandService {

  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;
  private final TripPlanMapper tripPlanMapper;

  /**
   * 为行程添加首个手动地点；空白行程尚无按天任务时同时创建第 1 天任务。
   *
   * <p>手动任务使用由 planId 派生的稳定 UUID，既满足既有非空 {@code task_id} 约束，
   * 又让重试复用同一任务身份；整个“建任务 + 建地点”过程处于同一事务中。
   */
  @Transactional
  public Long addCustomItemToPlan(String planId, AddCustomItemRequest request, Long userId) {
    TripPlan plan = requirePlan(planId);
    requirePlanOwner(plan, userId);

    CheckinTask task = findFirstTask(planId);
    if (task == null) {
      if (StrUtil.isNotBlank(plan.getActiveTaskId())) {
        throw new IllegalStateException("已有执行版本的清单应先创建按天打卡任务");
      }
      task = createManualFirstDayTask(plan, userId);
    }
    requireOwner(task, userId, "无权操作该打卡任务");
    return insertCustomItem(task, request, userId);
  }

  /** 添加自定义行程点并同步任务总数。 */
  @Transactional
  public Long addCustomItem(String taskId, AddCustomItemRequest request, Long userId) {
    CheckinTask task = requireTask(taskId);
    requireOwner(task, userId, "无权操作该打卡任务");

    return insertCustomItem(task, request, userId);
  }

  private Long insertCustomItem(
      CheckinTask task, AddCustomItemRequest request, Long userId) {

    CheckinItem item = new CheckinItem();
    item.setCheckinTaskId(task.getId());
    item.setPoiName(request.getName());
    item.setPoiAddress(request.getAddress());
    item.setPeriod(request.getPeriod());
    item.setDescription(request.getDescription());
    item.setEstimatedCost(request.getEstimatedCost());
    if (request.getLat() != null && request.getLng() != null
        && !(request.getLat() == 0.0 && request.getLng() == 0.0)) {
      item.setPoiLat(request.getLat());
      item.setPoiLng(request.getLng());
    }
    item.setIsCustom(true);
    item.setStatus("PENDING");
    item.setSource("MANUAL");
    item.setCreatedAt(LocalDateTime.now());
    checkinItemMapper.insert(item);

    task.setTotalPoi(valueOrZero(task.getTotalPoi()) + 1);
    checkinTaskMapper.updateById(task);
    log.info("Custom checkin item added: taskId={}, name={}, userId={}",
        task.getId(), request.getName(), userId);
    return item.getId();
  }

  /** 编辑仍处于 PENDING 状态的自定义行程点。 */
  @Transactional
  public void editCustomItem(Long itemId, Long userId, EditCustomItemRequest request) {
    CheckinItem item = requireItem(itemId);
    CheckinTask task = requireTask(item.getCheckinTaskId());
    requireOwner(task, userId, "无权操作该打卡项");
    if (!Boolean.TRUE.equals(item.getIsCustom())) {
      throw new IllegalStateException("仅自定义行程点可编辑");
    }
    if (!"PENDING".equals(item.getStatus())) {
      throw new IllegalStateException("仅 PENDING 状态可编辑");
    }

    item.setPoiName(request.getName().trim());
    item.setPeriod(blankToNull(request.getPeriod()));
    item.setDescription(blankToNull(request.getDescription()));
    item.setEstimatedCost(blankToNull(request.getEstimatedCost()));
    item.setPoiAddress(blankToNull(request.getAddress()));
    applyCoordinates(item, request);
    checkinItemMapper.updateById(item);
    log.info("Custom checkin item edited: itemId={}, userId={}", itemId, userId);
  }

  /** 废弃未签到的行程点，并从任务总数中扣除。 */
  @Transactional
  public void abandonCheckin(Long itemId, Long userId) {
    CheckinItem item = requireItem(itemId);
    CheckinTask task = requireTask(item.getCheckinTaskId());
    requireOwner(task, userId, "无权操作该打卡项");
    if ("CHECKED_IN".equals(item.getStatus())) {
      throw new IllegalStateException("该打卡项已打卡，请先撤销打卡再废弃");
    }
    if ("ABANDONED".equals(item.getStatus())) {
      log.info("Checkin item already abandoned, skip: itemId={}", itemId);
      return;
    }
    item.setStatus("ABANDONED");
    checkinItemMapper.updateById(item);
    task.setTotalPoi(Math.max(0, valueOrZero(task.getTotalPoi()) - 1));
    checkinTaskMapper.updateById(task);
    log.info("Checkin item abandoned: itemId={}, planId={}, totalPoi now={}",
        itemId, task.getPlanId(), task.getTotalPoi());
  }

  /** 保存用户拖动后的纠正坐标。 */
  @Transactional
  public void updateItemCoordinates(Long itemId, Double latitude, Double longitude, Long userId) {
    CheckinItem item = requireItem(itemId);
    CheckinTask task = requireTask(item.getCheckinTaskId());
    requireOwner(task, userId, "无权操作该打卡项");
    item.setCorrectedLat(latitude);
    item.setCorrectedLng(longitude);
    checkinItemMapper.updateById(item);
    log.info("Checkin item coordinates updated: itemId={}, lat={}, lng={}, userId={}",
        itemId, latitude, longitude, userId);
  }

  private CheckinItem requireItem(Long itemId) {
    CheckinItem item = checkinItemMapper.selectById(itemId);
    if (item == null) {
      throw new CheckinItemNotFoundException("打卡项不存在: " + itemId);
    }
    return item;
  }

  private CheckinTask requireTask(String taskId) {
    CheckinTask task = checkinTaskMapper.selectById(taskId);
    if (task == null) {
      throw new RuntimeException("打卡任务不存在: " + taskId);
    }
    return task;
  }

  private TripPlan requirePlan(String planId) {
    TripPlan plan = tripPlanMapper.selectById(planId);
    if (plan == null || plan.getDeletedAt() != null) {
      throw new PlanNotFoundException("行程清单不存在: " + planId);
    }
    return plan;
  }

  private void requirePlanOwner(TripPlan plan, Long userId) {
    if (userId == null || !userId.equals(plan.getUserId())) {
      throw new ForbiddenException("无权操作该清单");
    }
  }

  private CheckinTask findFirstTask(String planId) {
    LambdaQueryWrapper<CheckinTask> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinTask::getPlanId, planId)
        .orderByAsc(CheckinTask::getDayNumber)
        .last("LIMIT 1");
    List<CheckinTask> tasks = checkinTaskMapper.selectList(wrapper);
    return tasks == null || tasks.isEmpty() ? null : tasks.get(0);
  }

  private CheckinTask createManualFirstDayTask(TripPlan plan, Long userId) {
    String manualTaskId = UUID.nameUUIDFromBytes(
        ("manual-checkin:" + plan.getId()).getBytes(StandardCharsets.UTF_8)).toString();
    CheckinTask task = new CheckinTask();
    task.setId(manualTaskId);
    task.setPlanId(plan.getId());
    // 旧表要求 task_id 非空；手动任务没有 AI 来源，因此复用自身稳定 ID 作为内部来源标识。
    task.setTaskId(manualTaskId);
    task.setUserId(userId);
    task.setItineraryDate(plan.getPlannedDate());
    task.setDayNumber(1);
    task.setStatus("ACTIVE");
    task.setTotalPoi(0);
    task.setCompletedPoi(0);
    task.setCreatedAt(LocalDateTime.now());
    checkinTaskMapper.insert(task);
    return task;
  }

  private void requireOwner(CheckinTask task, Long userId, String message) {
    if (userId != null && !userId.equals(task.getUserId())) {
      throw new ForbiddenException(message);
    }
  }

  private void applyCoordinates(CheckinItem item, EditCustomItemRequest request) {
    if (request.getLat() == null && request.getLng() == null) {
      return;
    }
    if (request.getLat() == null || request.getLng() == null) {
      throw new IllegalArgumentException("经纬度需同时填写或同时留空");
    }
    if (request.getLat() == 0.0 && request.getLng() == 0.0) {
      throw new IllegalArgumentException("坐标 (0, 0) 无效");
    }
    if (Math.abs(request.getLat()) > 90 || Math.abs(request.getLng()) > 180) {
      throw new IllegalArgumentException("经纬度超出有效范围（纬度 -90~90，经度 -180~180）");
    }
    item.setPoiLat(request.getLat());
    item.setPoiLng(request.getLng());
  }

  private static String blankToNull(String value) {
    return StrUtil.isBlank(value) ? null : value;
  }

  private static int valueOrZero(Integer value) {
    return value == null ? 0 : value;
  }
}
