package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.CheckinRequest;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.CheckinItemNotFoundException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.util.GeoUtils;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 签到、撤销以及清单完成状态级联服务。 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CheckinExecutionService {

  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;
  private final CheckinMediaMapper checkinMediaMapper;
  private final TripPlanMapper tripPlanMapper;

  /** 执行一次 GPS 或手动签到。 */
  @Transactional
  public void checkin(Long itemId, CheckinRequest request, Long userId) {
    CheckinItem item = requireItem(itemId);
    CheckinTask task = requireTask(item.getCheckinTaskId());
    // 所有权校验必须先于幂等命中判断，避免他人通过已知键探测或操作资源。
    requireOwner(task, userId);
    String idempotencyKey = normalizeIdempotencyKey(request.getIdempotencyKey());

    if (idempotencyKey != null) {
      CheckinItem keyOwner = checkinItemMapper.selectByTaskAndIdempotencyKey(
          task.getId(), idempotencyKey);
      if (keyOwner != null && !Objects.equals(itemId, keyOwner.getId())) {
        throw new IllegalArgumentException("该幂等键已用于同一任务的其他打卡项");
      }
    }

    if ("CHECKED_IN".equals(item.getStatus())) {
      if (idempotencyKey != null
          && idempotencyKey.equals(item.getCheckinIdempotencyKey())) {
        log.info("Duplicate checkin accepted: itemId={}, idempotencyKey={}",
            itemId, idempotencyKey);
        return;
      }
      throw new IllegalArgumentException("该 POI 已打卡，请先撤销");
    }

    int distance = 0;
    String source = StrUtil.isBlank(request.getSource()) ? "GPS" : request.getSource();
    if ("GPS".equals(source)) {
      if (!GeoUtils.isValidCoordinate(request.getLat(), request.getLng())) {
        throw new IllegalArgumentException("无效的 GPS 坐标");
      }
      if (GeoUtils.isValidCoordinate(item.getPoiLat(), item.getPoiLng())) {
        distance = GeoUtils.calculateDistance(
            request.getLat(), request.getLng(), item.getPoiLat(), item.getPoiLng());
      }
      item.setCheckinLat(request.getLat());
      item.setCheckinLng(request.getLng());
      item.setDistanceMeters(distance);
    } else {
      source = "MANUAL";
    }
    item.setSource(source);
    item.setNote(request.getNote());
    item.setStatus("CHECKED_IN");
    item.setCheckedInAt(LocalDateTime.now());
    item.setCheckinIdempotencyKey(idempotencyKey);

    int transitioned;
    try {
      transitioned = checkinItemMapper.markCheckedInIfPending(item);
    } catch (DataIntegrityViolationException ex) {
      // 应用层预查无法消除两个请求同时抢占同一键的窗口，唯一索引负责最终裁决。
      if (idempotencyKey != null) {
        throw new IllegalArgumentException("该幂等键已用于同一任务的其他打卡项", ex);
      }
      throw ex;
    }
    if (transitioned == 0) {
      CheckinItem latest = requireItem(itemId);
      if (idempotencyKey != null
          && "CHECKED_IN".equals(latest.getStatus())
          && idempotencyKey.equals(latest.getCheckinIdempotencyKey())) {
        log.info("Concurrent duplicate checkin accepted: itemId={}, idempotencyKey={}",
            itemId, idempotencyKey);
        return;
      }
      throw new IllegalArgumentException("该 POI 已打卡，请先撤销");
    }

    int newCompletedPoi = valueOrZero(task.getCompletedPoi()) + 1;
    task.setCompletedPoi(newCompletedPoi);
    if (newCompletedPoi >= task.getTotalPoi()) {
      task.setStatus("COMPLETED");
      task.setCompletedAt(item.getCheckedInAt());
    }
    if (checkinTaskMapper.incrementCompletedPoi(task.getId(), item.getCheckedInAt()) != 1) {
      throw new IllegalStateException("打卡任务状态更新失败");
    }

    TripPlan plan = tripPlanMapper.selectById(task.getPlanId());
    if (plan != null && "PLANNED".equals(plan.getStatus())) {
      plan.setStatus("ONGOING");
      plan.setUpdatedAt(LocalDateTime.now());
      tripPlanMapper.updateById(plan);
      log.info("Trip plan status auto-changed to ONGOING: {}", plan.getId());
    }
    cascadeCompletePlan(plan);
    log.info("Checkin done: itemId={}, source={}, distance={}m", itemId, source, distance);
  }

  /** 撤销签到并把关联媒体标记为历史记录。 */
  @Transactional
  public void undoCheckin(Long itemId, Long userId) {
    CheckinItem item = requireItem(itemId);
    CheckinTask task = requireTask(item.getCheckinTaskId());
    requireOwner(task, userId);

    item.setStatus("PENDING");
    item.setCheckinLat(null);
    item.setCheckinLng(null);
    item.setDistanceMeters(null);
    item.setCheckedInAt(null);
    item.setSource("GPS");
    item.setCheckinIdempotencyKey(null);
    checkinItemMapper.updateById(item);

    task.setCompletedPoi(Math.max(0, valueOrZero(task.getCompletedPoi()) - 1));
    if ("COMPLETED".equals(task.getStatus())) {
      task.setStatus("ACTIVE");
      task.setCompletedAt(null);
    }
    checkinTaskMapper.updateById(task);

    LambdaQueryWrapper<CheckinMedia> mediaWrapper = new LambdaQueryWrapper<>();
    mediaWrapper.eq(CheckinMedia::getCheckinItemId, item.getId());
    List<CheckinMedia> mediaList = checkinMediaMapper.selectList(mediaWrapper);
    for (CheckinMedia media : mediaList) {
      media.setIsHistory(true);
      checkinMediaMapper.updateById(media);
    }
    log.info("Checkin undone: itemId={}, {} media marked as history", itemId, mediaList.size());
  }

  private void cascadeCompletePlan(TripPlan plan) {
    if (plan == null || "COMPLETED".equals(plan.getStatus())) {
      return;
    }
    LambdaQueryWrapper<CheckinTask> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinTask::getPlanId, plan.getId());
    List<CheckinTask> tasks = checkinTaskMapper.selectList(wrapper);
    if (tasks.isEmpty() || !tasks.stream().allMatch(this::isTaskEffectivelyCompleted)) {
      return;
    }
    plan.setStatus("COMPLETED");
    plan.setCompletedAt(LocalDateTime.now());
    plan.setUpdatedAt(LocalDateTime.now());
    tripPlanMapper.updateById(plan);
    log.info("Trip plan auto-completed: planId={}, all {} checkin tasks done",
        plan.getId(), tasks.size());
  }

  private boolean isTaskEffectivelyCompleted(CheckinTask task) {
    if (task.getTotalPoi() != null && task.getTotalPoi() == 0) {
      return true;
    }
    LambdaQueryWrapper<CheckinItem> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinItem::getCheckinTaskId, task.getId());
    List<CheckinItem> items = checkinItemMapper.selectList(wrapper);
    return items.isEmpty() || items.stream()
        .filter(item -> !"ABANDONED".equals(item.getStatus()))
        .allMatch(item -> "CHECKED_IN".equals(item.getStatus()));
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
      throw new RuntimeException("打卡任务不存在");
    }
    return task;
  }

  private void requireOwner(CheckinTask task, Long userId) {
    if (userId != null && !userId.equals(task.getUserId())) {
      throw new ForbiddenException("无权操作该打卡项");
    }
  }

  private static int valueOrZero(Integer value) {
    return value == null ? 0 : value;
  }

  private static String normalizeIdempotencyKey(String value) {
    String normalized = StrUtil.trim(value);
    return StrUtil.isBlank(normalized) ? null : normalized;
  }
}
