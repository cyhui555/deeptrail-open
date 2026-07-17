package com.ai.travel.service.geocoding;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.entity.GeocodingCache;
import com.ai.travel.mapper.GeocodingCacheMapper;
import com.ai.travel.service.GeocodingService;
import com.ai.travel.util.GeoUtils;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 地理编码服务主实现。
 *
 * <p>按配置优先级依次尝试各 Provider，支持 DB 缓存（{@code geocoding_cache} 表）。
 * 全部 Provider 失败时返回 null，不阻断调用方主流程。
 *
 * <h3>DB 缓存策略</h3>
 *
 * <p>主路径：
 * <ol>
 *   <li>根据 {@code name|region|address} 拼 cacheKey</li>
 *   <li>查 DB：{@code SELECT * FROM geocoding_cache WHERE cache_key=? AND expire_at > NOW()}</li>
 *   <li>命中 → 直接返回（provider 标记为 "cache"）</li>
 *   <li>未命中 → 按优先级调用 Provider → 写库（TTL = cacheExpireMinutes）→ 返回</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GeocodingServiceImpl implements GeocodingService {

  private final AppGeocodingProperties properties;
  private final List<GeocodingProvider> providers;
  private final GeocodingCacheMapper geocodingCacheMapper;
  private final ConcurrentHashMap<String, ProviderCircuitState> providerCircuits =
      new ConcurrentHashMap<>();

  @Override
  public GeoResult geocode(GeoRequest request) {
    if (!properties.isEnabled()) {
      return null;
    }
    if (request == null || StrUtil.isBlank(request.getName())) {
      return null;
    }

    String cacheKey = buildCacheKey(request);

    // 1. DB 缓存命中检查（含 destination 不匹配时拒绝缓存的兜底校验）
    GeoResult cached = findFromCache(cacheKey, request.getDestination());
    if (cached != null) {
      log.debug("Geocoding DB cache hit: name={}", request.getName());
      return cached;
    }

    // 2. 按优先级尝试各 Provider
    List<GeocodingProvider> ordered = resolveProviderOrder();
    if (ordered.isEmpty()) {
      log.warn("No geocoding provider available");
      return null;
    }

    GeoResult result = null;
    for (GeocodingProvider provider : ordered) {
      String providerName = StrUtil.blankToDefault(
          provider.getProviderName(), provider.getClass().getSimpleName());
      if (isCircuitOpen(providerName)) {
        log.debug("Geocoding provider circuit open, skip: provider={}, name={}",
            providerName, request.getName());
        continue;
      }
      try {
        result = provider.geocode(request);
        // 正常空响应说明 Provider 可达，不应把“无匹配”误判为连接故障。
        closeCircuit(providerName);
        if (result != null && result.isValid()) {
          log.info("Geocoding success: name={}, provider={}, lat={}, lng={}",
              request.getName(), provider.getProviderName(),
              result.getLatitude(), result.getLongitude());
          break;
        }
        log.debug("Geocoding no valid result: name={}, provider={}",
            request.getName(), provider.getProviderName());
      } catch (GeocodingException e) {
        recordProviderFailure(providerName, e.getMessage());
        log.warn("Geocoding failed: name={}, provider={}, error={}",
            request.getName(), provider.getProviderName(), e.getMessage());
      } catch (Exception e) {
        recordProviderFailure(providerName, e.getMessage());
        log.error("Geocoding unexpected error: name={}, provider={}",
            request.getName(), provider.getProviderName(), e);
      }
    }

    if (result == null || !result.isValid()) {
      log.info("Geocoding exhausted all providers: name={}, region={}, address={}",
          request.getName(), request.getRegion(), request.getAddress());
      return null;
    }

    // 3. 同城校验：destination 存在且开启校验时，省/市区字段必须与 destination 匹配
    if (properties.isCityValidationEnabled()
        && StrUtil.isNotBlank(request.getDestination())
        && !isWithinDestination(result, request.getDestination())) {
      log.info("Geocoding result rejected by city validation: name={}, destination={}, "
              + "province={}, city={}, district={}, lat={}, lng={}",
          request.getName(), request.getDestination(),
          result.getProvince(), result.getCity(), result.getDistrict(),
          result.getLatitude(), result.getLongitude());
      return null;
    }
    result.setDestinationSatisfied(true);

    // 4. 写入 DB 缓存
    saveToCache(result, cacheKey, request.getName(), request.getAddress(),
        request.getRegion(), request.getDestination(),
        properties.getCacheExpireMinutes());

    return result;
  }

  private boolean isCircuitOpen(String providerName) {
    ProviderCircuitState state = providerCircuits.get(providerName);
    if (state == null) {
      return false;
    }
    long openUntil = state.openUntilNanos.get();
    if (openUntil == 0L) {
      return false;
    }
    if (System.nanoTime() - openUntil < 0L) {
      return true;
    }
    providerCircuits.remove(providerName, state);
    return false;
  }

  private void recordProviderFailure(String providerName, String error) {
    int threshold = Math.max(1, properties.getCircuitBreakerFailureThreshold());
    ProviderCircuitState state = providerCircuits.computeIfAbsent(
        providerName, ignored -> new ProviderCircuitState());
    int failures = state.consecutiveFailures.incrementAndGet();
    if (failures < threshold) {
      return;
    }
    long openSeconds = Math.max(1L, properties.getCircuitBreakerOpenSeconds());
    state.openUntilNanos.set(System.nanoTime() + Duration.ofSeconds(openSeconds).toNanos());
    state.consecutiveFailures.set(0);
    log.warn("Geocoding provider circuit opened: provider={}, openSeconds={}, error={}",
        providerName, openSeconds, error);
  }

  private void closeCircuit(String providerName) {
    providerCircuits.remove(providerName);
  }

  private static final class ProviderCircuitState {
    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private final AtomicLong openUntilNanos = new AtomicLong();
  }

  /**
   * 校验 GeoResult 是否在期望目的地内。
   *
   * <p>双层校验：
   * <ol>
   *   <li><b>行政区字段匹配</b>（字符串包含）：province/city/district 任一字段包含
   *       destination、或被 destination 包含即视为同城。</li>
   *   <li><b>距离兜底</b>（Huversine）：字段不匹配时，退化为距离校验。
   *       若 POI 坐标与 destination 中心点距离 ≤ {@code cityMaxDistanceMeters}
   *       （默认 100km）也视为同城。覆盖"destination=川西，result=四川省甘孜州康定市"
   *       这类字符串无法互相包含但坐标实际在范围内的场景。</li>
   * </ol>
   *
   * <p>当 Provider 未返回省市区字段（province/city/district 全空）时，
   * 跳过严格校验允许通过（避免对新提供商或特殊响应过度拦截），
   * 这是"AI 零信任"原则下对*明确错误*拦截、对*无法判断*放行的平衡。
   *
   * @param result      地理编码结果
   * @param destination 期望目的地字符串（如"青岛"、"川西"、"Beijing"）
   * @return true 如果在同城范围内或无法校验（字段为空）
   */
  private boolean isWithinDestination(GeoResult result, String destination) {
    // 没有省市区字段时，无法严格匹配，允许通过（避免过度拦截）
    if (StrUtil.isBlank(result.getProvince())
        && StrUtil.isBlank(result.getCity())
        && StrUtil.isBlank(result.getDistrict())) {
      log.debug("Geocoding city validation skipped: no admin fields in result for '{}'",
          result.getProvider());
      return true;
    }

    // 第一层：城市精确匹配；川西等宏观区域按所属省级范围匹配。
    if (GeoUtils.isAdministrativeMatch(
        result.getProvince(), result.getCity(), result.getDistrict(), destination)
        || GeoUtils.isMacroRegionAdministrativeMatch(
            result.getProvince(), result.getCity(), result.getDistrict(), destination)) {
      return true;
    }

    // 第二层：距离兜底（解决"字段不匹配但坐标实际在范围内"的场景）
    double[] center = GeoUtils.findDestinationCenter(destination);
    if (center != null && result.getLatitude() != null && result.getLongitude() != null) {
      double distanceMeters = GeoUtils.calculateDistance(
          result.getLatitude(), result.getLongitude(), center[0], center[1]);
      boolean accepted = distanceMeters <= properties.getCityMaxDistanceMeters();
      if (accepted) {
        log.info("Geocoding accepted by distance fallback: "
                + "destination={}, province={}, city={}, district={}, "
                + "distance={}m, maxDistance={}m, lat={}, lng={}",
            destination,
            result.getProvince(), result.getCity(), result.getDistrict(),
            Math.round(distanceMeters), properties.getCityMaxDistanceMeters(),
            result.getLatitude(), result.getLongitude());
      }
      return accepted;
    }

    // 两层都不满足 → 丢弃
    return false;
  }

  @Override
  public Map<String, GeoResult> batchGeocode(Map<String, GeoRequest> requests) {
    Map<String, GeoResult> results = new java.util.concurrent.ConcurrentHashMap<>();
    // 串行调用（受限 API QPS），未来可改为按 QPS 限流的并行
    for (Map.Entry<String, GeoRequest> entry : requests.entrySet()) {
      results.put(entry.getKey(), geocode(entry.getValue()));
    }
    return results;
  }

  /**
   * 根据配置决定 Provider 调用顺序。
   *
   * @return 按优先级排序的可用 Provider 列表
   */
  private List<GeocodingProvider> resolveProviderOrder() {
    List<GeocodingProvider> available = new ArrayList<>();
    for (GeocodingProvider provider : providers) {
      if (provider.isAvailable()) {
        available.add(provider);
      }
    }

    if ("gaode".equals(properties.getProvider())) {
      // 仅使用高德
      return available.stream()
          .filter(p -> "gaode".equals(p.getProviderName()))
          .sorted()
          .toList();
    } else if ("nominatim".equals(properties.getProvider())) {
      // 仅使用 Nominatim
      return available.stream()
          .filter(p -> "nominatim".equals(p.getProviderName()))
          .sorted()
          .toList();
    } else {
      // auto 模式：按 order 排序，全部可用 Provider 参与 fallback
      return available.stream()
          .sorted()
          .toList();
    }
  }

  // ==================== DB 缓存读写 ====================

  /**
   * 拼出缓存键（格式 "name|destination|region|address"）。
   *
   * <p>始终包含 destination 以隔离不同目的地的同名 POI 缓存，避免跨目的地污染。
   * 例："大学路"在青岛 vs 重庆 → cacheKey 不同，不共享缓存条目。
   *
   * @param request 地理编码请求
   * @return 缓存键字符串
   */
  String buildCacheKey(GeoRequest request) {
    return String.format("%s|%s|%s|%s",
        request.getName(),
        StrUtil.blankToDefault(request.getDestination(), ""),
        StrUtil.blankToDefault(request.getRegion(), ""),
        StrUtil.blankToDefault(request.getAddress(), ""));
  }

  /**
   * 从 DB 缓存查询未过期的结果。
   *
   * <p>查询条件：{@code cache_key = ? AND expire_at > NOW()}。
   * 命中时把 GeocodingCache 转为 GeoResult（provider 标记为 "cache"）。
   *
   * <p>同城校验兜底：当请求携带 destination 且缓存条目也记录了 destination 时，
   * 双向包含匹配失败则拒绝缓存（避免缓存 key 碰撞或历史脏数据污染）。
   *
   * @param cacheKey    缓存键
   * @param destination 当前请求的期望目的地（用于缓存命中时的同城校验兜底，可为 null）
   * @return 命中且未过期的 GeoResult；未命中、过期或 destination 不匹配返回 null
   */
  GeoResult findFromCache(String cacheKey, String destination) {
    try {
      QueryWrapper<GeocodingCache> qw = new QueryWrapper<>();
      qw.eq("cache_key", cacheKey);
      GeocodingCache cached = geocodingCacheMapper.selectOne(qw);
      if (cached == null) {
        return null;
      }
      if (cached.getExpireAt() == null || cached.getExpireAt().isBefore(LocalDateTime.now())) {
        log.debug("Geocoding DB cache expired: cacheKey={}", cacheKey);
        return null;
      }
      // 同城校验兜底：destination 不匹配时拒绝缓存，让主流程重新反查
      boolean destinationMismatch = StrUtil.isNotBlank(destination)
          && StrUtil.isNotBlank(cached.getDestination())
          && !(destination.contains(cached.getDestination())
              || cached.getDestination().contains(destination));
      if (destinationMismatch) {
        log.debug(
            "Geocoding DB cache skipped: destination mismatch "
                + "cache={} vs requested={}, cacheKey={}",
            cached.getDestination(), destination, cacheKey);
        return null;
      }
      return GeoResult.builder()
          .latitude(cached.getLatitude())
          .longitude(cached.getLongitude())
          .level(cached.getLevel())
          .provider("cache")
          .province(cached.getProvince())
          .city(cached.getCity())
          .district(cached.getDistrict())
          .destinationSatisfied(true)
          .build();
    } catch (Exception e) {
      log.warn("Geocoding DB cache read failed, fallback to provider: {}", e.getMessage());
      return null;
    }
  }

  /**
   * 将地理编码结果写入 DB 缓存。
   *
   * <p>写入失败仅打 WARN 日志，不阻断主流程。
   *
   * @param result     地理编码结果
   * @param cacheKey   缓存键
   * @param name       POI 名称
   * @param address    补充地址
   * @param region     地区限定
   * @param destination 期望目的地（可为空）
   * @param ttlMinutes 缓存有效期（分钟）
   */
  void saveToCache(GeoResult result, String cacheKey, String name,
                          String address, String region, String destination,
                          long ttlMinutes) {
    try {
      GeocodingCache entity = GeocodingCache.builder()
          .cacheKey(cacheKey)
          .name(name)
          .address(address)
          .region(region)
          .latitude(result.getLatitude())
          .longitude(result.getLongitude())
          .level(result.getLevel())
          .provider(result.getProvider())
          .province(result.getProvince())
          .city(result.getCity())
          .district(result.getDistrict())
          .destination(destination)
          .createdAt(LocalDateTime.now())
          .expireAt(LocalDateTime.now().plusMinutes(ttlMinutes))
          .build();
      geocodingCacheMapper.insert(entity);
      log.debug("Geocoding DB cache saved: name={}, provider={}", name, result.getProvider());
    } catch (Exception e) {
      log.warn("Geocoding DB cache write failed (non-blocking): name={}, error={}",
          name, e.getMessage());
    }
  }
}
