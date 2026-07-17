package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.MealItem;
import com.ai.travel.dto.response.PoiInfo;
import com.ai.travel.dto.response.ScheduleItem;
import com.ai.travel.task.TaskExecutionContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** 对 AI 行程中的 POI 执行地理编码反查和坐标覆盖。 */
@Service
@Slf4j
public class PoiCoordinateEnricher {

  private final GeocodingService geocodingService;
  private final AppGeocodingProperties geocodingProperties;
  private final ReleaseOutcomeMetrics outcomeMetrics;

  /** Spring 运行时注入 Release Outcome 指标。 */
  @Autowired
  public PoiCoordinateEnricher(
      GeocodingService geocodingService,
      AppGeocodingProperties geocodingProperties,
      ReleaseOutcomeMetrics outcomeMetrics) {
    this.geocodingService = geocodingService;
    this.geocodingProperties = geocodingProperties;
    this.outcomeMetrics = outcomeMetrics;
  }

  /** 兼容不启动 Spring 的既有单元测试。 */
  public PoiCoordinateEnricher(
      GeocodingService geocodingService, AppGeocodingProperties geocodingProperties) {
    this(geocodingService, geocodingProperties, ReleaseOutcomeMetrics.noop());
  }

  /** 增强完整行程响应中的坐标。 */
  public void enrich(ItineraryResponse response, String requestHint, String destination) {
    enrich(response, requestHint, destination,
        TaskExecutionContext.unbounded("coordinate-enrichment"));
  }

  /** 增强完整行程响应中的坐标，并在每个 POI 边界传播任务取消。 */
  public void enrich(
      ItineraryResponse response,
      String requestHint,
      String destination,
      TaskExecutionContext execution) {
    if (response == null || CollUtil.isEmpty(response.getDays())) {
      return;
    }
    enrichDays(response.getDays(), requestHint, destination, execution);
  }

  /** 增强 DayPlan 列表中的 schedule、meals 和 accommodation 坐标。 */
  public void enrichDays(List<DayPlan> days, String requestHint, String destination) {
    enrichDays(days, requestHint, destination,
        TaskExecutionContext.unbounded("coordinate-enrichment"));
  }

  /** 增强 DayPlan 列表，并确保取消后不再启动下一个外部 Provider 调用。 */
  public void enrichDays(
      List<DayPlan> days,
      String requestHint,
      String destination,
      TaskExecutionContext execution) {
    if (!geocodingProperties.isEnabled() || geocodingService == null) {
      return;
    }
    int totalChecked = 0;
    int geocoded = 0;
    int stillInvalid = 0;

    for (DayPlan day : days) {
      execution.checkpoint();
      if (day == null) {
        continue;
      }
      if (CollUtil.isNotEmpty(day.getSchedule())) {
        for (ScheduleItem item : day.getSchedule()) {
          execution.checkpoint();
          if (item == null || item.getPoi() == null) {
            continue;
          }
          totalChecked++;
          if (tryGeocode(item.getPoi(), destination)) {
            geocoded++;
          } else if (isInvalid(item.getPoi())) {
            stillInvalid++;
          }
        }
      }
      if (CollUtil.isNotEmpty(day.getMeals())) {
        for (MealItem meal : day.getMeals()) {
          execution.checkpoint();
          if (meal == null || meal.getPoi() == null) {
            continue;
          }
          totalChecked++;
          if (tryGeocode(meal.getPoi(), destination)) {
            geocoded++;
          } else if (isInvalid(meal.getPoi())) {
            stillInvalid++;
          }
        }
      }
      if (day.getAccommodation() != null) {
        execution.checkpoint();
        totalChecked++;
        if (tryGeocode(day.getAccommodation(), destination)) {
          geocoded++;
        } else if (isInvalid(day.getAccommodation())) {
          stillInvalid++;
        }
      }
    }

    if (geocoded > 0 || stillInvalid > 0) {
      log.info("[CoordinateEnrich] requestHint={}, dayCount={}, totalChecked={}, "
              + "geocoded={}, stillInvalid={}",
          requestHint, days.size(), totalChecked, geocoded, stillInvalid);
    }
    if (stillInvalid > 0) {
      log.warn("[CoordinateEnrich] {} POI(s) still invalid, requestHint={}",
          stillInvalid, requestHint);
      outcomeMetrics.recordDegradation("geocoding", "invalid_coordinate", stillInvalid);
    }
    execution.checkpoint();
  }

  private boolean tryGeocode(PoiInfo poi, String destination) {
    if (StrUtil.isBlank(poi.getName())) {
      log.debug("[CoordinateEnrich] Skip geocoding: POI name is blank");
      return false;
    }
    try {
      GeoRequest request = GeoRequest.builder()
          .name(poi.getName())
          .region(inferRegion(destination, poi.getAddress()))
          .address(poi.getAddress())
          .destination(destination)
          .build();
      GeoResult result = geocodingService.geocode(request);
      if (result != null && result.isValid()) {
        poi.setLatitude(result.getLatitude());
        poi.setLongitude(result.getLongitude());
        log.info("[CoordinateEnrich] Geocoded POI: name={}, lat={}, lng={}, provider={}",
            poi.getName(), result.getLatitude(), result.getLongitude(), result.getProvider());
        return true;
      }
      log.warn("[CoordinateEnrich] No result: name={}, address={}, keep lat={}, lng={}",
          poi.getName(), poi.getAddress(), poi.getLatitude(), poi.getLongitude());
    } catch (Exception exception) {
      log.warn("[CoordinateEnrich] Geocoding failed: name={}, error={}",
          poi.getName(), exception.getMessage());
    }
    return false;
  }

  private boolean isInvalid(PoiInfo poi) {
    Double latitude = poi.getLatitude();
    Double longitude = poi.getLongitude();
    return latitude == null || longitude == null || latitude == 0.0 && longitude == 0.0;
  }

  private String inferRegion(String destination, String address) {
    if (StrUtil.isNotBlank(destination)) {
      return destination;
    }
    if (StrUtil.isNotBlank(address) && address.length() > 4) {
      return address.length() > 10 ? address.substring(0, 10) : address;
    }
    return null;
  }
}
