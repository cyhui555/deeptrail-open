package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ScheduleItem;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.util.GeoUtils;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 签到坐标解析、城市锚点校验与历史坐标回填服务。 */
@Service
@Slf4j
public class CheckinCoordinateService {

  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;
  private final TripPlanMapper tripPlanMapper;
  private final GeocodingService geocodingService;
  private final ItineraryTaskMapper itineraryTaskMapper;
  private final ObjectMapper objectMapper;
  private final Executor coordinateLookupExecutor;

  /** 生产环境使用受控线程池并行解析独立 POI，Provider 自身继续负责全局 QPS。 */
  @Autowired
  public CheckinCoordinateService(
      CheckinTaskMapper checkinTaskMapper,
      CheckinItemMapper checkinItemMapper,
      TripPlanMapper tripPlanMapper,
      GeocodingService geocodingService,
      ItineraryTaskMapper itineraryTaskMapper,
      ObjectMapper objectMapper,
      @Qualifier("geocodingTaskExecutor") TaskExecutor coordinateLookupExecutor) {
    this(checkinTaskMapper, checkinItemMapper, tripPlanMapper, geocodingService,
        itineraryTaskMapper, objectMapper, (Executor) coordinateLookupExecutor);
  }

  /** 兼容既有领域单测与门面构造器；默认同步执行，避免测试泄漏线程。 */
  CheckinCoordinateService(
      CheckinTaskMapper checkinTaskMapper,
      CheckinItemMapper checkinItemMapper,
      TripPlanMapper tripPlanMapper,
      GeocodingService geocodingService,
      ItineraryTaskMapper itineraryTaskMapper,
      ObjectMapper objectMapper) {
    this(checkinTaskMapper, checkinItemMapper, tripPlanMapper, geocodingService,
        itineraryTaskMapper, objectMapper, Runnable::run);
  }

  /** 测试可注入可控执行器，验证批量解析并发边界。 */
  CheckinCoordinateService(
      CheckinTaskMapper checkinTaskMapper,
      CheckinItemMapper checkinItemMapper,
      TripPlanMapper tripPlanMapper,
      GeocodingService geocodingService,
      ItineraryTaskMapper itineraryTaskMapper,
      ObjectMapper objectMapper,
      Executor coordinateLookupExecutor) {
    this.checkinTaskMapper = checkinTaskMapper;
    this.checkinItemMapper = checkinItemMapper;
    this.tripPlanMapper = tripPlanMapper;
    this.geocodingService = geocodingService;
    this.itineraryTaskMapper = itineraryTaskMapper;
    this.objectMapper = objectMapper;
    this.coordinateLookupExecutor = coordinateLookupExecutor;
  }

  /**
   * 在数据库事务外调用地理编码，避免外部 HTTP 延迟占用数据库连接和事务锁。
   * 任何地理编码异常都降级为无坐标，不阻断签到任务创建。
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public Double[] resolveCoordinates(TripPlan plan, String poiName, String poiAddress) {
    try {
      String region = inferRegion(plan, poiAddress);
      String destination = plan != null && StrUtil.isNotBlank(plan.getDestination())
          ? plan.getDestination() : null;
      GeoRequest request = GeoRequest.builder()
          .name(poiName)
          .region(region)
          .address(poiAddress)
          .destination(destination)
          .build();
      GeoResult result = geocodingService.geocode(request);
      if (result != null && result.isValid()) {
        log.info("Geocoding resolved: name={}, region={}, lat={}, lng={}, provider={}",
            poiName, region, result.getLatitude(), result.getLongitude(), result.getProvider());
        return new Double[]{result.getLatitude(), result.getLongitude()};
      }

      // 跨城旅行的首末交通节点可能位于出发地。仅当地点名称/地址明确包含出发地时重试，
      // 避免把普通同名 POI 放宽为任意跨城结果。
      String departure = findDepartureLocation(plan);
      if (StrUtil.isNotBlank(departure) && mentionsLocation(poiName, poiAddress, departure)) {
        GeoRequest departureRequest = GeoRequest.builder()
            .name(poiName)
            .region(departure)
            .address(poiAddress)
            .destination(departure)
            .build();
        GeoResult departureResult = geocodingService.geocode(departureRequest);
        if (departureResult != null && departureResult.isValid()) {
          log.info("Geocoding resolved against departure: name={}, departure={}, "
                  + "lat={}, lng={}, provider={}",
              poiName, departure, departureResult.getLatitude(), departureResult.getLongitude(),
              departureResult.getProvider());
          return new Double[]{departureResult.getLatitude(), departureResult.getLongitude()};
        }
      }
      log.debug("Geocoding returned no valid result: name={}, region={}", poiName, region);
    } catch (Exception exception) {
      log.warn("Geocoding failed, skip: name={}, error={}", poiName, exception.getMessage());
    }
    return null;
  }

  private String findDepartureLocation(TripPlan plan) {
    if (plan == null || StrUtil.isBlank(plan.getActiveTaskId())) {
      return null;
    }
    try {
      ItineraryTask task = itineraryTaskMapper.selectById(plan.getActiveTaskId());
      if (task == null || StrUtil.isBlank(task.getRequestJson())) {
        return null;
      }
      return blankToNull(objectMapper.readTree(task.getRequestJson())
          .path("departureLocation").asText(null));
    } catch (Exception exception) {
      log.debug("读取出发地失败，跳过出发节点兜底: taskId={}, error={}",
          plan.getActiveTaskId(), exception.getMessage());
      return null;
    }
  }

  private boolean mentionsLocation(String poiName, String poiAddress, String location) {
    String normalized = location.trim().replaceAll("[省市区县]$", "");
    if (normalized.isBlank()) {
      return false;
    }
    return StrUtil.containsIgnoreCase(poiName, normalized)
        || StrUtil.containsIgnoreCase(poiAddress, normalized);
  }

  private String blankToNull(String value) {
    return StrUtil.isBlank(value) ? null : value.trim();
  }

  /** 仅回填缺失或 (0, 0) 的坐标。 */
  public int backfillMissingCoordinates(String planId) {
    return doBackfill(planId, false);
  }

  /** 清洗并重新解析清单下全部签到项的坐标。 */
  public int forceRefillCoordinates(String planId) {
    return doBackfill(planId, true);
  }

  /** 计算当天有效 AI 坐标的几何中位数，作为跨城脏坐标的校验锚点。 */
  public Double[] findDayCityAnchor(DayPlan dayPlan) {
    if (dayPlan == null || CollUtil.isEmpty(dayPlan.getSchedule())) {
      return null;
    }
    List<Double> latitudes = new ArrayList<>();
    List<Double> longitudes = new ArrayList<>();
    for (ScheduleItem item : dayPlan.getSchedule()) {
      if (item == null || item.getPoi() == null) {
        continue;
      }
      Double latitude = item.getPoi().getLatitude();
      Double longitude = item.getPoi().getLongitude();
      if (latitude != null && longitude != null
          && GeoUtils.isValidCoordinate(latitude, longitude)
          && !(latitude == 0.0 && longitude == 0.0)) {
        latitudes.add(latitude);
        longitudes.add(longitude);
      }
    }
    if (latitudes.isEmpty()) {
      return null;
    }
    Collections.sort(latitudes);
    Collections.sort(longitudes);
    return new Double[]{median(latitudes), median(longitudes)};
  }

  /** 判断坐标是否仍在当天城市锚点的合理半径内。 */
  public boolean isWithinCityRadius(
      Double latitude, Double longitude, Double[] cityAnchor, long radiusMeters) {
    if (latitude == null || longitude == null || cityAnchor == null
        || cityAnchor[0] == null || cityAnchor[1] == null) {
      return true;
    }
    int distance = GeoUtils.calculateDistance(
        latitude, longitude, cityAnchor[0], cityAnchor[1]);
    return distance <= radiusMeters;
  }

  private int doBackfill(String planId, boolean forceRefill) {
    TripPlan plan = tripPlanMapper.selectById(planId);
    if (plan == null) {
      throw new PlanNotFoundException("行程清单不存在: " + planId);
    }
    LambdaQueryWrapper<CheckinTask> taskWrapper = new LambdaQueryWrapper<>();
    taskWrapper.eq(CheckinTask::getPlanId, planId);
    List<CheckinTask> tasks = checkinTaskMapper.selectList(taskWrapper);
    if (tasks.isEmpty()) {
      return 0;
    }
    List<String> taskIds = tasks.stream().map(CheckinTask::getId).toList();
    LambdaQueryWrapper<CheckinItem> itemWrapper = new LambdaQueryWrapper<>();
    itemWrapper.in(CheckinItem::getCheckinTaskId, taskIds);
    List<CheckinItem> items = checkinItemMapper.selectList(itemWrapper);
    List<CheckinItem> candidates = items.stream()
        .filter(item -> forceRefill || !hasValidCoordinate(item))
        .toList();
    if (candidates.isEmpty()) {
      log.info("Backfill: all items already have valid coordinates, planId={}, total={}",
          planId, items.size());
      return 0;
    }

    List<CompletableFuture<ItemResolution>> pendingResolutions = candidates.stream()
        .map(item -> CompletableFuture.supplyAsync(
            () -> new ItemResolution(item, resolveOneItem(plan, item, forceRefill)),
            coordinateLookupExecutor))
        .toList();
    List<ItemResolution> resolutions = pendingResolutions.stream()
        .map(CompletableFuture::join)
        .toList();

    int resolved = 0;
    int preserved = 0;
    int failed = 0;
    // 外部解析全部结束后才顺序更新签到项，避免多个线程并发修改同一批业务记录。
    for (ItemResolution itemResolution : resolutions) {
      CheckinItem item = itemResolution.item();
      ResolutionResult result = itemResolution.result();
      switch (result.status()) {
        case RESOLVED -> {
          item.setPoiLat(result.latitude());
          item.setPoiLng(result.longitude());
          checkinItemMapper.updateById(item);
          resolved++;
        }
        case PRESERVED -> preserved++;
        case FAILED -> failed++;
        default -> {
          // 所有枚举值均已覆盖，该分支仅满足静态检查的防御性要求。
        }
      }
    }
    log.info("Backfill completed: planId={}, total={}, resolved={}, preserved={}, failed={}, "
            + "forceRefill={}",
        planId, items.size(), resolved, preserved, failed, forceRefill);
    return resolved;
  }

  private ResolutionResult resolveOneItem(
      TripPlan plan, CheckinItem item, boolean forceRefill) {
    if (forceRefill && item.getPoiLat() != null && item.getPoiLng() != null
        && !isLikelyInDestination(plan, item.getPoiLat(), item.getPoiLng())) {
      log.info("Force refill: 坐标偏离目的地，准备重查: itemId={}", item.getId());
    }
    Double[] coordinates = resolveCoordinates(plan, item.getPoiName(), item.getPoiAddress());
    if (coordinates != null) {
      return new ResolutionResult(
          ResolutionStatus.RESOLVED, coordinates[0], coordinates[1]);
    }
    if (forceRefill && hasValidCoordinate(item)) {
      // Provider 空结果或短暂故障不得把已有业务数据降级为空；用户仍可手工校准疑似脏坐标。
      log.info("Force refill: 地理编码未返回结果，保留原坐标: itemId={}", item.getId());
      return new ResolutionResult(ResolutionStatus.PRESERVED, null, null);
    }
    return new ResolutionResult(ResolutionStatus.FAILED, null, null);
  }

  private String inferRegion(TripPlan plan, String poiAddress) {
    if (plan != null && StrUtil.isNotBlank(plan.getDestination())) {
      return plan.getDestination();
    }
    if (StrUtil.isNotBlank(poiAddress) && poiAddress.length() > 4) {
      return poiAddress.length() > 10 ? poiAddress.substring(0, 10) : poiAddress;
    }
    return null;
  }

  private boolean hasValidCoordinate(CheckinItem item) {
    Double latitude = item.getPoiLat();
    Double longitude = item.getPoiLng();
    return latitude != null && longitude != null
        && GeoUtils.isValidCoordinate(latitude, longitude)
        && !(latitude == 0.0 && longitude == 0.0);
  }

  private boolean isLikelyInDestination(TripPlan plan, double latitude, double longitude) {
    if (StrUtil.isBlank(plan.getDestination())) {
      return true;
    }
    double[] center = findRoughCityCenter(plan.getDestination().trim());
    return center == null
        || GeoUtils.calculateDistance(latitude, longitude, center[0], center[1]) <= 500_000;
  }

  private static double median(List<Double> values) {
    int middle = values.size() / 2;
    return values.size() % 2 == 1
        ? values.get(middle) : (values.get(middle - 1) + values.get(middle)) / 2.0;
  }

  private static double[] findRoughCityCenter(String destination) {
    return switch (destination) {
      case "青岛", "青岛市", "烟台", "烟台是", "威海", "威海市", "潍坊", "潍坊市" ->
          new double[]{36.07, 120.35};
      case "济南", "济南市", "泰安", "泰安市" -> new double[]{36.65, 117.12};
      case "重庆", "重庆市" -> new double[]{29.56, 106.55};
      case "成都", "成都市" -> new double[]{30.57, 104.07};
      case "北京", "北京市" -> new double[]{39.90, 116.40};
      case "上海", "上海市" -> new double[]{31.23, 121.47};
      case "乌鲁木齐", "乌鲁木齐市" -> new double[]{43.80, 87.60};
      case "伊犁", "伊犁州", "伊犁哈萨克自治州" -> new double[]{43.92, 81.32};
      case "西安", "西安市" -> new double[]{34.26, 108.93};
      case "广州", "广州市" -> new double[]{23.13, 113.26};
      case "深圳市", "深圳" -> new double[]{22.54, 114.06};
      case "杭州", "杭州市" -> new double[]{30.27, 120.15};
      case "昆明", "昆明市" -> new double[]{25.04, 102.73};
      case "三亚", "三亚市" -> new double[]{18.25, 109.50};
      default -> null;
    };
  }

  private enum ResolutionStatus {
    RESOLVED, PRESERVED, FAILED
  }

  private record ResolutionResult(
      ResolutionStatus status, Double latitude, Double longitude) {
  }

  private record ItemResolution(CheckinItem item, ResolutionResult result) {
  }
}
