package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.AddCustomItemRequest;
import com.ai.travel.dto.request.EditCustomItemRequest;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.exception.CheckinItemNotFoundException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import java.time.LocalDateTime;
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

  /** 添加自定义行程点并同步任务总数。 */
  @Transactional
  public Long addCustomItem(String taskId, AddCustomItemRequest request, Long userId) {
    CheckinTask task = requireTask(taskId);
    requireOwner(task, userId, "无权操作该打卡任务");

    CheckinItem item = new CheckinItem();
    item.setCheckinTaskId(taskId);
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
        taskId, request.getName(), userId);
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
