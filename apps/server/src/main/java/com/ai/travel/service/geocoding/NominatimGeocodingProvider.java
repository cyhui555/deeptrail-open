package com.ai.travel.service.geocoding;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.service.geocoding.RateLimiters;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Nominatim (OpenStreetMap) 地理编码 Provider。
 *
 * <p>作为免费备用 Provider，无需 API Key。
 * 严格限流 1 QPS（OSM 使用政策要求），必须携带 User-Agent。
 *
 * <h3>限流设计</h3>
 *
 * <p>使用全局共享的 {@link RateLimiters} 令牌桶（rate=1）。
 * Nominatim 限流严格按 OSM 政策执行，长期 >1 QPS 会导致 HTTP 403/429 封禁。
 *
 * <h3>重试设计</h3>
 *
 * <p>IOException 单次重试。Nominatim 对并发敏感的 TCP reset 较为常见，
 * 重试覆盖率相对高德要高（参见 backend-runtime 规范 6）。
 *
 * <p>注意：新疆偏远地区 POI 覆盖较差，仅作兜底使用。
 */
@Component
@Order(2)
@RequiredArgsConstructor
@Slf4j
public class NominatimGeocodingProvider implements GeocodingProvider {

  /** 是否启用 IOException 单次重试。 */
  private static final boolean RETRY_ON_IO_ERROR = true;

  /** 重试间隔基数（ms）。 */
  private static final long RETRY_BACKOFF_BASE_MS = 1200L;

  /** Nominatim 严格 1 QPS（OSM 公共政策要求）。 */
  private static final double NOMINATIM_QPS = 1.0;

  private final AppGeocodingProperties properties;
  private final ObjectMapper objectMapper;

  /** Provider 是否已注册令牌桶（仅注册一次）。 */
  private final AtomicBoolean rateLimiterRegistered = new AtomicBoolean(false);

  @Override
  public GeoResult geocode(GeoRequest request) throws GeocodingException {
    StringBuilder url = new StringBuilder(properties.getNominatimBaseUrl());
    url.append("?q=").append(urlEncode(request.getName()));
    url.append("&format=json&limit=1&accept-language=zh");

    // Nominatim 不直接支持 region 过滤，拼接到 query 末尾增强准确性
    if (StrUtil.isNotBlank(request.getRegion())) {
      url.append(", ").append(urlEncode(request.getRegion()));
    }
    if (StrUtil.isNotBlank(request.getAddress())) {
      url.append(", ").append(urlEncode(request.getAddress()));
    }

    ensureRateLimiterRegistered();

    // Hutool HttpRequest.timeout(int) 同时设置连接超时和读取超时
    int timeoutMs = Math.max(properties.getConnectTimeoutMs(), properties.getReadTimeoutMs());

    // 首次调用 + IOException 单次重试
    String response = executeWithRetry(url.toString(), timeoutMs, RETRY_ON_IO_ERROR);
    return parseResponse(response);
  }

  /**
   * 带可选 IOException 重试的 HTTP GET 执行（私有方法，Nominatim 专用）。
   *
   * @param url       完整请求 URL
   * @param timeoutMs 连接 + 读取超时（ms）
   * @param retryOnIo 是否启用重试
   * @return 响应 body 字符串
   * @throws GeocodingException 如果全部尝试失败
   */
  private String executeWithRetry(String url, int timeoutMs, boolean retryOnIo)
      throws GeocodingException {
    GeocodingException lastException = null;
    int attempts = retryOnIo ? 2 : 1;
    for (int attempt = 1; attempt <= attempts; attempt++) {
      try {
        // I/O 重试也是一次真实外部请求，必须重新领取严格 1 QPS 的令牌。
        acquireRateLimitPermit();
        return executeHttpGet(url, timeoutMs);
      } catch (Exception e) {
        if (isIoError(e) && attempt < attempts) {
          log.warn("Nominatim HTTP IOException on attempt {}/{}, will retrying in {}ms: {}",
              attempt, attempts, RETRY_BACKOFF_BASE_MS, e.getMessage());
          try {
            Thread.sleep(RETRY_BACKOFF_BASE_MS);
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new GeocodingException("Nominatim retry interrupted", ie);
          }
          lastException = new GeocodingException("Nominatim HTTP error: " + e.getMessage(), e);
        } else {
          throw new GeocodingException("Nominatim HTTP error: " + e.getMessage(), e);
        }
      }
    }
    throw lastException != null
        ? lastException
        : new GeocodingException("Nominatim HTTP error: exhausted attempts");
  }

  /** 测试可覆盖该边界，以验证每次真实 HTTP 尝试都重新领取令牌。 */
  void acquireRateLimitPermit() {
    RateLimiters.waitFor("nominatim");
    if (Thread.currentThread().isInterrupted()) {
      throw new GeocodingException("Nominatim rate limit wait interrupted");
    }
  }

  /**
   * 懒注册令牌桶（首次调用触发）。
   */
  private void ensureRateLimiterRegistered() {
    if (rateLimiterRegistered.compareAndSet(false, true)) {
      RateLimiters.register("nominatim", NOMINATIM_QPS);
    }
  }

  /**
   * 执行单次 HTTP GET 请求并返回响应 body。
   *
   * <p>包装为独立方法以便集成测试通过子类覆盖注入假 HTTP 行为，
   * 从而覆盖 {@link #executeWithRetry} 的重试/中断分支。
   *
   * @param url       完整请求 URL
   * @param timeoutMs 连接 + 读取超时（ms）
   * @return 响应 body 字符串
   * @throws Exception Hutool 抛出的任意异常（含 IOException 包装）
   */
  String executeHttpGet(String url, int timeoutMs) throws Exception {
    return HttpRequest.get(url)
        .header("User-Agent", "TravelPlanner/1.0 (dev@travel-planner.app)")
        .timeout(timeoutMs)
        .execute()
        .body();
  }

  /**
   * 判断异常是否为 IOException（含沿 cause 链包装的）。
   *
   * @param e 待判断的异常
   * @return true 如果本身是 IOException 或链中包含 IOException
   */
  private static boolean isIoError(Throwable e) {
    Throwable current = e;
    while (current != null) {
      if (current instanceof IOException) {
        return true;
      }
      current = current.getCause();
    }
    return false;
  }

  /**
   * 解析 Nominatim JSON 响应。
   *
   * @param json API 返回的原始 JSON 字符串
   * @return 地理编码结果，无结果时返回 null
   * @throws GeocodingException JSON 解析失败或格式异常
   */
  GeoResult parseResponse(String json) throws GeocodingException {
    try {
      JsonNode root = objectMapper.readTree(json);
      if (!root.isArray() || root.isEmpty()) {
        return null;
      }

      JsonNode first = root.get(0);
      String latStr = first.path("lat").asText("");
      String lonStr = first.path("lon").asText("");
      if (StrUtil.isBlank(latStr) || StrUtil.isBlank(lonStr)) {
        return null;
      }

      // Nominatim 的 address 子对象包含 state/county/city 等结构化信息
      JsonNode addressNode = first.path("address");
      String province = null;
      String city = null;
      String district = null;
      if (addressNode != null && addressNode.isObject()) {
        // 中国场景: state=省, city=市, county/district=区/县
        province = addressNode.path("state").asText(null);
        if (province == null) {
          province = addressNode.path("province").asText(null);
        }
        city = addressNode.path("city").asText(null);
        if (city == null) {
          city = addressNode.path("county").asText(null);
        }
        district = addressNode.path("district").asText(null);
        if (district == null) {
          district = addressNode.path("suburb").asText(null);
        }
      }

      return GeoResult.builder()
          .latitude(parseDoubleSafe(latStr))
          .longitude(parseDoubleSafe(lonStr))
          .level(first.path("type").asText(""))
          .provider(getProviderName())
          .province(province)
          .city(city)
          .district(district)
          .build();

    } catch (GeocodingException e) {
      throw e;
    } catch (Exception e) {
      throw new GeocodingException("Nominatim parse error: " + e.getMessage(), e);
    }
  }

  private Double parseDoubleSafe(String s) {
    try {
      return Double.parseDouble(s.trim());
    } catch (NumberFormatException e) {
      return null;
    }
  }

  @Override
  public String getProviderName() {
    return "nominatim";
  }

  @Override
  public boolean isAvailable() {
    // Nominatim 无需 Key，始终可用
    return true;
  }

  @Override
  public int getOrder() {
    return 2;
  }

  private String urlEncode(String s) {
    return URLEncoder.encode(s, StandardCharsets.UTF_8);
  }
}
