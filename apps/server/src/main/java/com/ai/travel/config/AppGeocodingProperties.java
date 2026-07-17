package com.ai.travel.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 地理编码兜底相关配置属性。 */
@Data
@ConfigurationProperties(prefix = "app.geocoding")
public class AppGeocodingProperties {

  /** 是否启用地理编码兜底。 */
  private boolean enabled = true;

  /** 主 provider：gaode / nominatim / auto（自动选最高可用）。 */
  private String provider = "auto";

  /** 主 provider 全部失败时是否尝试次优 provider。 */
  private boolean fallbackEnabled = true;

  /** 高德 API Key（留空则跳过高德）。 */
  private String gaodeApiKey = "";

  /** 高德 API base URL。 */
  private String gaodeBaseUrl = "https://restapi.amap.com/v3/geocode/geo";

  /** Nominatim base URL（可自建）。 */
  private String nominatimBaseUrl = "https://nominatim.openstreetmap.org/search";

  /** 是否启用本地缓存。 */
  private boolean cacheEnabled = true;

  /** 缓存最大条目数。 */
  private int cacheMaxSize = 500;

  /** 缓存过期时间（分钟）。 */
  private long cacheExpireMinutes = 10080;

  /** HTTP 连接超时（毫秒）。 */
  private int connectTimeoutMs = 3000;

  /** HTTP 读取超时（毫秒）。 */
  private int readTimeoutMs = 5000;

  /** Provider 完整调用连续失败多少次后打开熔断；Provider 内部重试已计入一次完整调用。 */
  private int circuitBreakerFailureThreshold = 1;

  /** 熔断打开时长（秒）；期间同批请求直接降级，不继续累计外部超时。 */
  private long circuitBreakerOpenSeconds = 60;

  /** 高德每秒最大请求数（保守限流，避免配额耗尽）。 */
  private int gaodeMaxQps = 5;

  /**
   * 同城校验最大允许距离（米）。
   *
   * <p>当无法通过省/市字段匹配目的地时，退化为距离校验：
   * 结果坐标与 plan.destination 中心点（调用反查获得）距离超过此值即丢弃。
   * 默认 200km，覆盖新疆伊犁州内新源→伊宁（≈200km）、川西/北疆等大面积地级行政区内跨县场景，
   * 同时避免"大学路"从青岛跨城返回重庆（>1000km）这类明显错误。
   */
  private long cityMaxDistanceMeters = 200_000L;

  /** 是否启用同城校验。 */
  private boolean cityValidationEnabled = true;

  /**
   * 判断高德是否可用（已配置 Key）。
   *
   * @return true 如果 gaodeApiKey 非空
   */
  public boolean isGaodeAvailable() {
    return gaodeApiKey != null && !gaodeApiKey.isBlank();
  }
}
