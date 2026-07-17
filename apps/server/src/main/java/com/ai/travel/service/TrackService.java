package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import com.ai.travel.dto.request.TrackPointUploadRequest;
import com.ai.travel.dto.response.TrackPointResponse;
import com.ai.travel.entity.TrackPoint;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.mapper.TrackPointMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.util.GeoUtils;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 轨迹服务。
 *
 * <p>提供轨迹点的批量保存、查询、总距离计算。
 * 保存时自动过滤 accuracy > 50m 的点。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TrackService {

  private static final int CLIENT_ID_QUERY_CHUNK_SIZE = 500;
  private static final ZoneOffset LEGACY_RECORDED_AT_OFFSET = ZoneOffset.ofHours(8);

  private final TrackPointMapper trackPointMapper;
  private final TripPlanMapper tripPlanMapper;

  /**
   * 批量保存轨迹点。
   *
   * <p>过滤 accuracy > 50m 的点（无效定位）。
   *
   * @param planId 行程清单 ID
   * @param points 轨迹点列表
   * @param userId 用户 ID
   * @return 实际保存的轨迹点数量
   */
  @Transactional
  public int batchSavePoints(String planId, List<TrackPointUploadRequest.TrackPointDto> points,
                             Long userId) {
    getPlanAndCheckPermission(planId, userId);

    if (CollUtil.isEmpty(points)) {
      return 0;
    }

    Set<String> persistedClientPointIds = loadExistingClientPointIds(planId, points);
    List<TrackPoint> acceptedPoints = prepareTrackPoints(
        planId, points, persistedClientPointIds);
    int savedCount = 0;
    for (TrackPoint entity : acceptedPoints) {
      String clientPointId = entity.getClientPointId();
      int inserted = clientPointId == null
          ? trackPointMapper.insert(entity)
          : trackPointMapper.insertIdempotently(entity);
      if (inserted > 0) {
        savedCount++;
      } else {
        // 预查后仍可能发生并发插入，数据库唯一索引在此把重复转换为零行写入。
        log.debug("Concurrent duplicate track point ignored: planId={}, clientPointId={}",
            planId, clientPointId);
      }
    }

    log.info("Track points saved: planId={}, count={}/{}", planId, savedCount, points.size());
    return savedCount;
  }

  /**
   * 查询轨迹点列表（按 recorded_at 排序）。
   *
   * @param planId 行程清单 ID
   * @param userId 当前用户 ID
   * @return 轨迹点列表
   */
  public List<TrackPointResponse> getTrackPoints(String planId, Long userId) {
    getPlanAndCheckPermission(planId, userId);
    return loadTrackPoints(planId);
  }

  private List<TrackPointResponse> loadTrackPoints(String planId) {
    LambdaQueryWrapper<TrackPoint> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(TrackPoint::getPlanId, planId)
        .orderByAsc(TrackPoint::getRecordedAt);
    List<TrackPoint> points = trackPointMapper.selectList(wrapper);

    return points.stream().map(p -> {
      TrackPointResponse resp = new TrackPointResponse();
      resp.setId(p.getId());
      resp.setLatitude(p.getLatitude());
      resp.setLongitude(p.getLongitude());
      resp.setAccuracy(p.getAccuracy());
      // recorded_at 自 V5 起始终表示 UTC；响应恢复为 Instant，确保 JSON 明确携带 Z。
      resp.setRecordedAt(p.getRecordedAt().toInstant(ZoneOffset.UTC));
      return resp;
    }).collect(Collectors.toList());
  }

  /**
   * 计算轨迹总距离。
   *
   * @param planId 行程清单 ID
   * @return 总距离（米）
   */
  public int calculateTotalDistance(String planId) {
    // 该方法仅由已经校验行程归属的评价流程调用，避免为同一请求重复查询行程。
    List<TrackPointResponse> points = loadTrackPoints(planId);
    if (points.size() < 2) {
      return 0;
    }

    double total = 0;
    for (int i = 1; i < points.size(); i++) {
      total += GeoUtils.calculateDistance(
          points.get(i - 1).getLatitude(), points.get(i - 1).getLongitude(),
          points.get(i).getLatitude(), points.get(i).getLongitude());
    }
    return (int) total;
  }

  private TripPlan getPlanAndCheckPermission(String planId, Long userId) {
    TripPlan plan = tripPlanMapper.selectById(planId);
    if (plan == null || plan.getDeletedAt() != null) {
      throw new PlanNotFoundException("行程清单不存在: " + planId);
    }
    // 认证关闭时 userId 可能为空，沿用既有上传接口的开发环境语义。
    if (userId != null && !userId.equals(plan.getUserId())) {
      throw new ForbiddenException("无权操作该清单");
    }
    return plan;
  }

  private Set<String> loadExistingClientPointIds(
      String planId, List<TrackPointUploadRequest.TrackPointDto> points) {
    LinkedHashSet<String> requestedIds = points.stream()
        .map(TrackPointUploadRequest.TrackPointDto::getClientPointId)
        .map(TrackService::normalizeClientPointId)
        .filter(java.util.Objects::nonNull)
        .collect(Collectors.toCollection(LinkedHashSet::new));
    if (requestedIds.isEmpty()) {
      return Set.of();
    }

    List<String> requestedIdList = new ArrayList<>(requestedIds);
    Set<String> existingIds = new HashSet<>();
    for (int offset = 0; offset < requestedIdList.size(); offset += CLIENT_ID_QUERY_CHUNK_SIZE) {
      int end = Math.min(offset + CLIENT_ID_QUERY_CHUNK_SIZE, requestedIdList.size());
      List<String> found = trackPointMapper.selectExistingClientPointIds(
          planId, requestedIdList.subList(offset, end));
      if (found != null) {
        existingIds.addAll(found);
      }
    }
    return existingIds;
  }

  private List<TrackPoint> prepareTrackPoints(
      String planId,
      List<TrackPointUploadRequest.TrackPointDto> points,
      Set<String> persistedClientPointIds) {
    Set<String> acceptedClientPointIds = new HashSet<>();
    List<TrackPoint> acceptedPoints = new ArrayList<>();
    for (TrackPointUploadRequest.TrackPointDto dto : points) {
      if (!GeoUtils.isAccurateEnough(dto.getAccuracy())) {
        log.debug("Track point filtered (accuracy too low): {}", dto.getAccuracy());
        continue;
      }
      if (!GeoUtils.isValidCoordinate(dto.getLatitude(), dto.getLongitude())) {
        continue;
      }

      String clientPointId = normalizeClientPointId(dto.getClientPointId());
      if (clientPointId != null
          && (persistedClientPointIds.contains(clientPointId)
              || !acceptedClientPointIds.add(clientPointId))) {
        log.debug("Duplicate track point skipped: planId={}, clientPointId={}",
            planId, clientPointId);
        continue;
      }

      TrackPoint entity = new TrackPoint();
      entity.setPlanId(planId);
      entity.setClientPointId(clientPointId);
      entity.setLatitude(dto.getLatitude());
      entity.setLongitude(dto.getLongitude());
      entity.setAccuracy(dto.getAccuracy());
      entity.setAltitude(dto.getAltitude());
      entity.setSpeed(dto.getSpeed());
      entity.setRecordedAt(parseRecordedAt(dto.getRecordedAt()));
      entity.setCreatedAt(LocalDateTime.now());
      acceptedPoints.add(entity);
    }
    // 必须先完成整批解析，再开始写库；事务继续兜底后续数据库异常的全批回滚。
    return acceptedPoints;
  }

  private static String normalizeClientPointId(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private static LocalDateTime parseRecordedAt(String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.isEmpty()) {
      throw invalidRecordedAt(null);
    }

    try {
      // 客户端 toISOString() 和显式偏移量都先换算到 UTC，再写入无时区数据库列。
      return OffsetDateTime.parse(normalized, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
          .withOffsetSameInstant(ZoneOffset.UTC)
          .toLocalDateTime();
    } catch (DateTimeException offsetException) {
      try {
        return LocalDateTime.ofInstant(Instant.parse(normalized), ZoneOffset.UTC);
      } catch (DateTimeException instantException) {
        try {
          // 旧协议未携带时区，固定按 UTC+08:00 解释，禁止依赖部署机 systemDefault。
          return LocalDateTime.parse(normalized, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
              .toInstant(LEGACY_RECORDED_AT_OFFSET)
              .atOffset(ZoneOffset.UTC)
              .toLocalDateTime();
        } catch (DateTimeException localException) {
          throw invalidRecordedAt(localException);
        }
      }
    }
  }

  private static IllegalArgumentException invalidRecordedAt(Exception cause) {
    String message = "轨迹点 recordedAt 格式无效；请使用 ISO 8601 时间，例如 "
        + "2026-07-01T10:00:00Z、2026-07-01T18:00:00+08:00，"
        + "或兼容格式 2026-07-01T10:00:00（按 UTC+08:00 解释）";
    return cause == null
        ? new IllegalArgumentException(message)
        : new IllegalArgumentException(message, cause);
  }
}
