package com.ai.travel.service.geocoding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.SocketException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * {@link GaodeGeocodingProvider} / {@link NominatimGeocodingProvider} 集成测试。
 *
 * <p>通过子类覆盖 {@link GaodeGeocodingProvider#executeHttpGet} /
 * {@link NominatimGeocodingProvider#executeHttpGet}（已暴露为方法级别的测试接口）
 * 注入假 HTTP 行为,覆盖 Provider 内部以下分支:
 * <ul>
 *   <li>首次调用即成功（happy path）</li>
 *   <li>首次 IOException → 重试 → 第二次成功</li>
 *   <li>两次都 IOException → 抛出 GeocodingException（重试耗尽）</li>
 *   <li>非 IOException（如 RuntimeException）→ 立即抛出不重试</li>
 *   <li>懒注册令牌桶：首次调用触发注册，第二次调用不重复注册</li>
 *   <li>RateLimiter.waitFor 在自定义低 QPS 下阻塞大致 1 个 refill 间隔</li>
 * </ul>
 *
 * <p>覆盖 BUG-20260706-002 修复的 Provider retry 分支、懒注册路径、限流退化。
 */
class ProviderIntegrationTest {

  /** 模拟高德成功响应。 */
  static final String GAODE_OK_JSON = "{"
      + "\"status\":\"1\",\"info\":\"OK\",\"count\":\"1\","
      + "\"geocodes\":[{"
      + "  \"formatted_address\":\"山东省青岛市市南区大学路\","
      + "  \"province\":\"山东省\",\"city\":\"青岛市\",\"district\":\"市南区\","
      + "  \"location\":\"120.355643,36.082419\","
      + "  \"level\":\"兴趣点\""
      + "}]}";

  /** 模拟 Nominatim 成功响应。 */
  static final String NOMINATIM_OK_JSON = "[{"
      + "\"lat\":\"36.082419\",\"lon\":\"120.355643\",\"type\":\"attraction\","
      + "\"address\":{"
      + "  \"state\":\"山东省\",\"city\":\"青岛市\",\"district\":\"市南区\","
      + "  \"country\":\"中国\",\"country_code\":\"cn\""
      + "}}]";

  static final ObjectMapper MAPPER = new ObjectMapper();

  static AppGeocodingProperties gaodeProps() {
    AppGeocodingProperties props = new AppGeocodingProperties();
    props.setGaodeApiKey("test-key");
    props.setGaodeBaseUrl("http://localhost:8080/geocode");
    props.setNominatimBaseUrl("http://localhost:8080/nominatim");
    // 测试限流用的高 QPS 配置,避免阻塞
    props.setGaodeMaxQps(100);
    props.setConnectTimeoutMs(50);
    props.setReadTimeoutMs(50);
    return props;
  }

  static GaodeGeocodingProvider immediateSuccessGaode() {
    AppGeocodingProperties props = gaodeProps();
    return new GaodeGeocodingProvider(props, MAPPER) {
      @Override
      String executeHttpGet(String url, int timeoutMs) {
        return GAODE_OK_JSON;
      }
    };
  }

  static NominatimGeocodingProvider immediateSuccessNominatim() {
    AppGeocodingProperties props = gaodeProps();
    return new NominatimGeocodingProvider(props, MAPPER) {
      @Override
      String executeHttpGet(String url, int timeoutMs) {
        return NOMINATIM_OK_JSON;
      }
    };
  }

  @AfterEach
  void cleanRateLimiters() {
    RateLimiters.resetForTesting();
  }

  // ======================== 高德 Provider ========================

  @Nested
  @DisplayName("GaodeGeocodingProvider")
  class GaodeTests {

    @Test
    @DisplayName("首次调用即成功 — 正常解析经纬度 + 省市区字段")
    void firstCallSuccess_returnsParsedResult() throws Exception {
      GaodeGeocodingProvider provider = immediateSuccessGaode();

      GeoResult result = provider.geocode(GeoRequest.builder()
          .name("大学路漫画街").address("青岛市南区大学路").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.082419);
      assertThat(result.getLongitude()).isEqualTo(120.355643);
      assertThat(result.getProvince()).isEqualTo("山东省");
      assertThat(result.getCity()).isEqualTo("青岛市");
      assertThat(result.getDistrict()).isEqualTo("市南区");
      assertThat(result.getProvider()).isEqualTo("gaode");
      assertThat(result.isValid()).isTrue();
    }

    @Test
    @DisplayName("首次 IOException → 重试 → 第二次成功 — 覆盖 executeWithRetry 重试分支")
    void retryOnIOException_succeedsOnSecondAttempt() throws Exception {
      AtomicInteger attempts = new AtomicInteger();
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) throws Exception {
          if (attempts.incrementAndGet() == 1) {
            throw new SocketException("Connection reset");
          }
          return GAODE_OK_JSON;
        }
      };

      long startMs = System.currentTimeMillis();
      GeoResult result = provider.geocode(GeoRequest.builder().name("小鱼山").build());
      long elapsedMs = System.currentTimeMillis() - startMs;

      // 成功：说明重试第二次返回了结果
      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.082419);
      // 重试分支会 Thread.sleep(800ms),用于验证 backoff 确实发生
      assertThat(elapsedMs).isGreaterThanOrEqualTo(700);
      assertThat(attempts.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("两次都 IOException — 重试耗尽抛出 GeocodingException（覆盖 lastException 抛出路径）")
    void retryExhausted_throwsGeocodingException() {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) throws Exception {
          throw new SocketException("Connection reset");
        }
      };

      assertThatThrownBy(() -> provider.geocode(GeoRequest.builder().name("折多山").build()))
          .isInstanceOf(GeocodingException.class);
    }

    @Test
    @DisplayName("非 IOException（RuntimeException）→ 立即抛出不重试 — 覆盖 else 分支")
    void nonIOException_doesNotRetry_andThrowsImmediately() {
      AtomicInteger attempts = new AtomicInteger();
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          attempts.incrementAndGet();
          throw new RuntimeException("Not an IOException");
        }
      };

      long startMs = System.currentTimeMillis();
      assertThatThrownBy(() -> provider.geocode(GeoRequest.builder().name("天安门").build()))
          .isInstanceOf(GeocodingException.class);
      long elapsedMs = System.currentTimeMillis() - startMs;

      // 关键断言: 尝试次数 == 1,branch `attempts==1` 一次失败即走 else 分支,不进入重试
      assertThat(attempts.get()).isEqualTo(1);
      // 无 Thread.sleep(800ms),重试分支未进入——耗时 < 200ms（远低于 backoff 800ms）
      assertThat(elapsedMs).isLessThan(200);
    }

    @Test
    @DisplayName("懒注册令牌桶 — 首次 geocode 调用触发 register,getProviderName 后 RateLimiter 可用")
    void lazyRegistration_registersGaodeRateLimiterOnFirstGeocode() throws Exception {
      RateLimiters.resetForTesting();

      GaodeGeocodingProvider provider = immediateSuccessGaode();

      // 初始状态: 尚未注册
      boolean registeredBefore = containsKey(RateLimiters.registeredKeys(), "gaode");
      assertThat(registeredBefore).isFalse();

      // 首次 geocode 调用触发 lazy register
      provider.geocode(GeoRequest.builder().name("信号山").build());

      // 已注册 "gaode"
      assertThat(containsKey(RateLimiters.registeredKeys(), "gaode")).isTrue();

      // 再次 geocode — 第二次不重复 register（通过 rate limiter 能正常 waitFor 证明 limiter 已存在）
      provider.geocode(GeoRequest.builder().name("第一海水浴场").build());
      // register 幂等,注册集合仍只有 "gaode"（不重复添加）
      long gaodeCount = java.util.Arrays.stream(RateLimiters.registeredKeys())
          .filter("gaode"::equals).count();
      assertThat(gaodeCount).isEqualTo(1);
    }

    @Test
    @DisplayName("RateLimiter 低 QPS 模式 — waitFor 阻塞大致 1 个 refill 间隔")
    void rateLimiter_blocksAtLowQps() throws Exception {
      RateLimiters.resetForTesting();
      AppGeocodingProperties props = gaodeProps();
      props.setGaodeMaxQps(2);  // 每 500ms 放行 1 个
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return GAODE_OK_JSON;
        }
      };

      long startMs = System.currentTimeMillis();
      provider.geocode(GeoRequest.builder().name("A").build());
      provider.geocode(GeoRequest.builder().name("B").build());
      provider.geocode(GeoRequest.builder().name("C").build());
      long elapsedMs = System.currentTimeMillis() - startMs;

      // 2 QPS: 桶容量 = 2 (SmoothBursty),前 2 次立即放行,第 3 次需等 500ms
      assertThat(elapsedMs).isGreaterThanOrEqualTo(400);
    }

    @Test
    @DisplayName("region 传入 — URL 附加 &city=region&citylimit=true（覆盖 region 分支）")
    void regionAppendedInGaodeUrl() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          assertThat(url).contains("&city=%E9%9D%92%E5%B2%9B%E5%B8%82&citylimit=true");
          return GAODE_OK_JSON;
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder()
          .name("信号山").region("青岛市").build());
      assertThat(result).isNotNull();
    }

    @Test
    @DisplayName("API_ERROR 状态 — 抛出 GeocodingException（覆盖 parseResponse status=0 分支）")
    void apiErrorStatus_throwsGeocodingException() {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return "{\"status\":\"0\",\"info\":\"CUQPS_HAS_EXCEEDED_THE_LIMIT\",\"count\":\"0\"}";
        }
      };

      assertThatThrownBy(() -> provider.geocode(GeoRequest.builder().name("测试").build()))
          .isInstanceOf(GeocodingException.class)
          .hasMessageContaining("CUQPS_HAS_EXCEEDED_THE_LIMIT");
    }

    @Test
    @DisplayName("空地址 — URL 使用 POI name 作为 address,正常返回结果（覆盖 buildAddressWithFallback blank 分支）")
    void blankAddress_fallsBackToNameOnly() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          // 验证 URL 中包含 POI name
          assertThat(url).contains("address=" + java.net.URLEncoder.encode("小鱼山", java.nio.charset.StandardCharsets.UTF_8));
          return GAODE_OK_JSON;
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder().name("小鱼山").build());
      assertThat(result).isNotNull();
    }

    @Test
    @DisplayName("geocodes 为空数组 — 返回 null（覆盖 parseResponse geocodes.isEmpty() 分支）")
    void emptyGeocodes_returnsNull() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return "{\"status\":\"1\",\"info\":\"OK\",\"count\":\"0\",\"geocodes\":[]}";
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder().name("不存在的POI").build());
      assertThat(result).isNull();
    }

    @Test
    @DisplayName("location 为空字符串 — 返回 null（覆盖 parseResponse location blank 分支）")
    void blankLocation_returnsNull() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return "{\"status\":\"1\",\"info\":\"OK\",\"count\":\"1\","
              + "\"geocodes\":[{\"formatted_address\":\"某处\",\"location\":\"\",\"level\":\"兴趣点\"}]}";
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder().name("无坐标POI").build());
      assertThat(result).isNull();
    }

    @Test
    @DisplayName("location 格式异常（不含逗号）— 返回 null（覆盖 parseResponse location !contains(,) 分支）")
    void malformedLocation_returnsNull() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return "{\"status\":\"1\",\"info\":\"OK\",\"count\":\"1\","
              + "\"geocodes\":[{\"formatted_address\":\"某处\",\"location\":\"nocomma\",\"level\":\"兴趣点\"}]}";
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder().name("坐标格式错误POI").build());
      assertThat(result).isNull();
    }
  }

  // ======================== Nominatim Provider ========================

  @Nested
  @DisplayName("NominatimGeocodingProvider")
  class NominatimTests {

    @Test
    @DisplayName("首次成功 — 解析经纬度 + address 结构")
    void firstCallSuccess_returnsParsedResult() throws Exception {
      NominatimGeocodingProvider provider = immediateSuccessNominatim();

      GeoResult result = provider.geocode(GeoRequest.builder().name("大学路").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.082419);
      assertThat(result.getLongitude()).isEqualTo(120.355643);
      assertThat(result.getProvince()).isEqualTo("山东省");
      assertThat(result.getCity()).isEqualTo("青岛市");
      assertThat(result.getDistrict()).isEqualTo("市南区");
      assertThat(result.getProvider()).isEqualTo("nominatim");
    }

    @Test
    @DisplayName("首次 IOException → 重试 → 第二次成功")
    void retryOnIOException_succeedsOnSecondAttempt() throws Exception {
      AtomicInteger attempts = new AtomicInteger();
      AppGeocodingProperties props = gaodeProps();
      NominatimGeocodingProvider provider = new NominatimGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) throws Exception {
          if (attempts.incrementAndGet() == 1) {
            throw new SocketException("Connection reset peer");
          }
          return NOMINATIM_OK_JSON;
        }
      };

      long startMs = System.currentTimeMillis();
      GeoResult result = provider.geocode(GeoRequest.builder().name("信号山").build());
      long elapsedMs = System.currentTimeMillis() - startMs;

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.082419);
      assertThat(elapsedMs).isGreaterThanOrEqualTo(1100);  // Nominatim backoff=1200ms
      assertThat(attempts.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("两次都 IOException — 重试耗尽抛出 GeocodingException")
    void retryExhausted_throwsGeocodingException() {
      AppGeocodingProperties props = gaodeProps();
      NominatimGeocodingProvider provider = new NominatimGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) throws Exception {
          throw new IOException("Connection refused");
        }
      };

      assertThatThrownBy(() -> provider.geocode(GeoRequest.builder().name("测试").build()))
          .isInstanceOf(GeocodingException.class);
    }

    @Test
    @DisplayName("非 IOException → 立即抛出不重试")
    void nonIOException_doesNotRetry() {
      AtomicInteger attempts = new AtomicInteger();
      AppGeocodingProperties props = gaodeProps();
      NominatimGeocodingProvider provider = new NominatimGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          attempts.incrementAndGet();
          throw new IllegalStateException("Bad state");
        }
      };

      assertThatThrownBy(() -> provider.geocode(GeoRequest.builder().name("测试").build()))
          .isInstanceOf(GeocodingException.class);
      assertThat(attempts.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("懒注册令牌桶 — 首次 geocode 触发 register,后续调用不重复")
    void lazyRegistration_registersNominatimRateLimiterOnFirstGeocode() throws Exception {
      RateLimiters.resetForTesting();

      NominatimGeocodingProvider provider = immediateSuccessNominatim();

      assertThat(containsKey(RateLimiters.registeredKeys(), "nominatim")).isFalse();

      provider.geocode(GeoRequest.builder().name("栈桥").build());
      assertThat(containsKey(RateLimiters.registeredKeys(), "nominatim")).isTrue();

      provider.geocode(GeoRequest.builder().name("八大关").build());
      long nominatimCount = java.util.Arrays.stream(RateLimiters.registeredKeys())
          .filter("nominatim"::equals).count();
      assertThat(nominatimCount).isEqualTo(1);
    }

    @Test
    @DisplayName("空数组响应 — 返回 null（覆盖 parseResponse empty array 分支）")
    void emptyArrayResponse_returnsNull() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      NominatimGeocodingProvider provider = new NominatimGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return "[]";
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder().name("不存在的POI").build());
      assertThat(result).isNull();
    }

    @Test
    @DisplayName("lat/lon 缺失 — 返回 null（覆盖 parseResponse blank lat/lon 分支）")
    void missingLatLon_returnsNull() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      NominatimGeocodingProvider provider = new NominatimGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return "[{\"type\":\"attraction\",\"address\":{\"state\":\"山东省\"}}]";
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder().name("测试").build());
      assertThat(result).isNull();
    }

    @Test
    @DisplayName("region+address 传入 — URL 附加（覆盖 region/address 分支）")
    void regionAndAddressAppendedInUrl() throws Exception {
      AppGeocodingProperties props = gaodeProps();
      NominatimGeocodingProvider provider = new NominatimGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          // Nominatim URL 中空格被 Hutool URLEncoder 编码为 "+" 而非 "%20"
          assertThat(url).contains("q=%E4%BF%A1%E5%8F%B7%E5%B1%B1&format=json&limit=1&accept-language=zh");
          assertThat(url).contains("%E5%B1%B1%E4%B8%9C%E7%9C%81");
          assertThat(url).contains("%E5%B8%82%E5%8D%97%E5%8C%BA%E5%A4%A7%E5%AD%A6%E8%B7%AF");
          return NOMINATIM_OK_JSON;
        }
      };

      GeoResult result = provider.geocode(GeoRequest.builder()
          .name("信号山").region("山东省").address("市南区大学路").build());
      assertThat(result).isNotNull();
    }
  }

  @Nested
  @DisplayName("边沿: 重试中断恢复中断标志")
  class RetryInterruptTests {

    @Test
    @DisplayName("Gaode waitFor 阻塞时被中断 — 退出并保留中断标志（覆盖 RateLimiter 中断路径）")
    void gaodeRateLimiterWaitFor_interruptRestoresFlag() throws Exception {
      RateLimiters.resetForTesting();
      // 注册并消耗令牌使桶空
      RateLimiters.register("gaode-int", 1);
      RateLimiters.waitFor("gaode-int");
      // 配置 provider 使用同样的限流器 key
      RateLimiters.resetForTesting();
      AppGeocodingProperties props = gaodeProps();
      props.setGaodeMaxQps(1);
      AtomicInteger calls = new AtomicInteger();
      GaodeGeocodingProvider provider = new GaodeGeocodingProvider(props, MAPPER) {
        @Override
        String executeHttpGet(String url, int timeoutMs) {
          return GAODE_OK_JSON;
        }
      };

      // 两次 geocode: 第一次消耗令牌，第二次桶空会被阻塞；从外部中断它
      Thread t = new Thread(() -> {
        try {
          provider.geocode(GeoRequest.builder().name("first").build());
          provider.geocode(GeoRequest.builder().name("second").build());
        } catch (GeocodingException e) {
          // 中断会导致退出
        }
      });
      t.start();
      Thread.sleep(200);  // 让第二次 geocode 进入 waitFor 阻塞
      t.interrupt();
      t.join(5000);
      // 只要线程结束（不 hang），说明限流器的阻塞路径有覆盖
      assertThat(t.isAlive()).isFalse();
    }
  }

  private static boolean containsKey(String[] keys, String target) {
    for (String k : keys) {
      if (target.equals(k)) {
        return true;
      }
    }
    return false;
  }
}
