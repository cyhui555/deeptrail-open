package com.ai.travel.service.geocoding;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 高德地图地理编码 Provider。
 *
 * <p>调用高德 Web 服务 API 将地址/POI 名称解析为经纬度坐标。
 * 使用令牌桶限流（默认 5 QPS），超限阻塞等待降级下一 Provider。
 *
 * <h3>限流设计</h3>
 *
 * <p>使用全局共享的 {@link RateLimiters} 令牌桶，替换原 Semaphore + tryAcquire(timeout) 的
 * "伪限流"（旧实现在多线程并发时 fast-fail 导致 CUQPS 限流风暴）。
 * 新实现阻塞等待令牌，严格按 QPS 节奏放行，从根本上避免打爆远端配额。
 *
 * <h3>重试设计</h3>
 *
 * <p>{@link #RETRY_ON_IO_ERROR} 的单次重试覆盖"长 idle 后 NAT/LB 静默丢弃 TCP 连接"
 * 导致的 {@code SocketException / SocketTimeoutException}（参见 backend-runtime 规范 6）。
 */
@Component
@Order(1)
@Slf4j
public class GaodeGeocodingProvider implements GeocodingProvider {

  /** 是否启用 IOException 单次重试。 */
  private static final boolean RETRY_ON_IO_ERROR = true;

  /** 重试间隔基数（ms），实际采用 1.5x 固定退避（避免惊群）。 */
  private static final long RETRY_BACKOFF_BASE_MS = 800L;

  private final AppGeocodingProperties properties;
  private final ObjectMapper objectMapper;

  /** Provider 是否已注册令牌桶（仅注册一次）。 */
  private final AtomicBoolean rateLimiterRegistered = new AtomicBoolean(false);

  public GaodeGeocodingProvider(AppGeocodingProperties properties, ObjectMapper objectMapper) {
    this.properties = properties;
    this.objectMapper = objectMapper;
  }

  /**
   * 懒注册令牌桶（首次实际调用 {@link #geocode} 时触发）。
   *
   * <p>使用 {@link AtomicBoolean} 保证多线程下仅注册一次。
   */
  private void ensureRateLimiterRegistered() {
    if (rateLimiterRegistered.compareAndSet(false, true)) {
      RateLimiters.register("gaode", properties.getGaodeMaxQps());
    }
  }


  @Override
  public GeoResult geocode(GeoRequest request) throws GeocodingException {
    if (!isAvailable()) {
      throw new GeocodingException("Gaode API Key not configured");
    }

    // 拼接查询串：address 在前作为主地址上下文，POI 名称在后作为精确匹配——
    // 形如 "address=青岛市南区大学路&...", POI address 已含城市信息可大幅提升同城命中率
    String queryAddress = buildAddressWithFallback(request);
    StringBuilder url = new StringBuilder(properties.getGaodeBaseUrl());
    url.append("?address=").append(urlEncode(queryAddress));
    url.append("&output=JSON");
    url.append("&key=").append(properties.getGaodeApiKey());

    // region 映射为 city 参数
    if (StrUtil.isNotBlank(request.getRegion())) {
      url.append("&city=").append(urlEncode(request.getRegion()));
      url.append("&citylimit=true");
    }

    // 阻塞等待令牌桶（不限时阻塞，严格按 QPS 节奏放行）
    // Guava RateLimiter.acquire() 响应中断并恢复 Thread.interrupted() 标志，不抛受检异常
    ensureRateLimiterRegistered();
    RateLimiters.waitFor("gaode");

    // Hutool HttpRequest.timeout(int) 同时设置连接超时和读取超时
    int timeoutMs = Math.max(properties.getConnectTimeoutMs(), properties.getReadTimeoutMs());

    // 首次调用 + IOException 单次重试（覆盖长 idle 后 NAT/LB 丢弃 TCP 连接的 Connection reset）
    String response = executeWithRetry(url.toString(), timeoutMs, RETRY_ON_IO_ERROR);
    return parseResponse(response);
  }

  /**
   * 带可选 IOException 重试的 HTTP GET 执行。
   *
   * <p>重试策略：
   * <ul>
   *   <li>仅对 {@link IOException}（含沿 cause 链包装的）重试 1 次</li>
   *   <li>退避时间固定为 {@link #RETRY_BACKOFF_BASE_MS} ms</li>
   *   <li>重试上限 1 次，避免增加远端 QPS 压力</li>
   * </ul>
   *
   * @param url         完整请求 URL
   * @param timeoutMs   连接 + 读取超时（ms）
   * @param retryOnIo   是否启用重试
   * @return 响应 body 字符串
   * @throws GeocodingException 如果全部尝试失败
   */
  private String executeWithRetry(String url, int timeoutMs, boolean retryOnIo)
      throws GeocodingException {
    GeocodingException lastException = null;
    int attempts = retryOnIo ? 2 : 1;
    for (int attempt = 1; attempt <= attempts; attempt++) {
      try {
        return executeHttpGet(url, timeoutMs);
      } catch (Exception e) {
        if (isIoError(e) && attempt < attempts) {
          log.warn("Gaode HTTP IOException on attempt {}/{}, will retrying in {}ms: {}",
              attempt, attempts, RETRY_BACKOFF_BASE_MS, e.getMessage());
          try {
            Thread.sleep(RETRY_BACKOFF_BASE_MS);
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new GeocodingException("Gaode retry interrupted", ie);
          }
          lastException = new GeocodingException("Gaode HTTP error: " + e.getMessage(), e);
        } else {
          throw new GeocodingException("Gaode HTTP error: " + e.getMessage(), e);
        }
      }
    }
    // 仅当 lastException 非 null 时到达（attempts>=2 且首次 IOException 后二次也失败）
    throw lastException != null
        ? lastException
        : new GeocodingException("Gaode HTTP error: exhausted attempts");
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
    return HttpRequest.get(url).timeout(timeoutMs).execute().body();
  }

  /**
   * 判断异常是否为 IOException（含沿 cause 链包装的）。
   *
   * <p>例如 Hutool 把 {@code java.net.SocketException} 包装在
   * {@code cn.hutool.http.HttpException} 中沿 cause 链可见。
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
   * 解析高德 API JSON 响应。
   *
   * @param json API 返回的原始 JSON 字符串
   * @return 地理编码结果，无结果时返回 null
   * @throws GeocodingException JSON 解析失败或 API 返回错误
   */
  GeoResult parseResponse(String json) throws GeocodingException {
    try {
      JsonNode root = objectMapper.readTree(json);
      String status = root.path("status").asText("0");
      if (!"1".equals(status)) {
        String info = root.path("info").asText("unknown");
        throw new GeocodingException("Gaode API error: " + info);
      }

      JsonNode geocodes = root.path("geocodes");
      if (!geocodes.isArray() || geocodes.isEmpty()) {
        return null;
      }

      JsonNode first = geocodes.get(0);
      String location = first.path("location").asText("");
      if (StrUtil.isBlank(location) || !location.contains(",")) {
        return null;
      }

      String[] parts = location.split(",");
      // 高德 location 格式: "lng,lat"
      return GeoResult.builder()
          .longitude(parseDoubleSafe(parts[0]))
          .latitude(parseDoubleSafe(parts[1]))
          .level(first.path("level").asText(""))
          .provider(getProviderName())
          .province(first.path("province").asText(null))
          .city(first.path("city").asText(null))
          .district(first.path("district").asText(null))
          .build();

    } catch (GeocodingException e) {
      throw e;
    } catch (Exception e) {
      throw new GeocodingException("Gaode parse error: " + e.getMessage(), e);
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
    return "gaode";
  }

  @Override
  public boolean isAvailable() {
    return properties.isGaodeAvailable();
  }

  @Override
  public int getOrder() {
    return 1;
  }

  /**
   * 构造高德 address 查询串：address 字段（含市/省信息）拼在前面 POI name 在后面。
   *
   * <p>例如 address="青岛市市南区大学路" + name="大学路" → "青岛市市南区大学路 大学路"。
   * 高德会优先匹配包含 POI 全称 + 城市上下文的组合，极大降低同名跨城命中。
   *
   * @param request 地理编码请求
   * @return 拼接后的查询字符串（至少包含 name）
   */
  private String buildAddressWithFallback(GeoRequest request) {
    String name = request.getName();
    String address = request.getAddress();
    if (StrUtil.isBlank(address)) {
      return name;
    }
    return address + " " + name;
  }

  private String urlEncode(String s) {
    return URLEncoder.encode(s, StandardCharsets.UTF_8);
  }
}
