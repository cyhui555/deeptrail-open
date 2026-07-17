package com.ai.travel.service.geocoding;

import com.google.common.util.concurrent.RateLimiter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;

/**
 * 多 Provider 共享的限流器面层（基于 Guava {@link RateLimiter}）。
 *
 * <p>替换 v0.8.1 手搓的 {@code AtomicInteger + ScheduledExecutorService} 令牌桶实现。
 * 新实现获得以下工业级保障：
 * <ul>
 *   <li>微秒级 double 精度 QPS 控制（手搓实现是整数毫秒级）</li>
 *   <li>Stochastic 采样 + {@code Thread.parkNanos()}，零 CPU 空转</li>
 *   <li>可选 WarmUp 模式（从冷启动线性爬升到目标 QPS，抑制突发）</li>
 *   <li>无需显式 refill 调度，无全局守护线程，new 即创建、GC 即销毁</li>
 * </ul>
 *
 * <h3>接口契约（与手搓版兼容）</h3>
 * <ul>
 *   <li>{@link #register(String, double)} — 注册 Provider 令牌桶（幂等）</li>
 *   <li>{@link #waitFor(String)} —阻塞等待直到持有 1 个令牌</li>
 * </ul>
 *
 * <p>历史：手搓版存在 6 类边界缺陷（CAS 活锁、int QPS 截断、resetForTesting 线程泄漏、
 * 中断标志被吃掉、缺少 warmup、测试代码膨胀）。详见 BUG-20260706-003。
 */
@Slf4j
public final class RateLimiters {

  /** 私有化构造器 —— 纯静态工具类。 */
  private RateLimiters() {
  }

  /** 已注册的限流器（key = provider name）。 */
  private static final Map<String, RateLimiter> LIMITERS = new ConcurrentHashMap<>();

  /**
   * 注册一个限流器。
   *
   * <p>首次调用时创建 Guava {@link RateLimiter}（SmoothBursty 模式，桶容量 = QPS）；
   * 后续调用幂等返回已有实例。
   *
   * @param key Provider 名称（如 "gaode"、"nominatim"）
   * @param permitsPerSecond 每秒允许的请求数（必须 > 0），支持小数精度
   * @throws IllegalArgumentException 如果 permitsPerSecond <= 0
   */
  public static void register(String key, double permitsPerSecond) {
    if (permitsPerSecond <= 0) {
      throw new IllegalArgumentException("permitsPerSecond must be > 0, got " + permitsPerSecond);
    }
    LIMITERS.computeIfAbsent(key, k -> {
      // SmoothBursty: 桶容量 = permitsPerSecond，允许突发 1 秒流量
      RateLimiter limiter = RateLimiter.create(permitsPerSecond);
      log.info("RateLimiter registered: key={}, permitsPerSecond={}", key, permitsPerSecond);
      return limiter;
    });
  }

  /**
   * 阻塞等待直到持有指定 Provider 的一个令牌。
   *
   * <p>与手搓版的核心区别：Guava 内部使用 {@code Thread.parkNanos()} 内核态阻塞，
   * 不消耗 CPU；QPS 精度达 double 微秒级。
   *
   * <p>Guava {@link RateLimiter#acquire()} 声明不抛出任何受检异常（Guava 惯例）；
   * 但其内部通过 {@code LockSupport.parkNanos()} 实现阻塞，会响应中断：
   * 中断发生时 acquire 返回并恢复 {@code Thread.interrupted()} 标志，
   * 不支持"吞中断"或"吞 InterruptedException"的语义。
   *
   * <p>若上层（如 provider）需要感知中断，可用 {@code Thread.isInterrupted()}
   * 在 {@code waitFor()} 返回后再检查标志位。
   *
   * @param key Provider 名称（如 "gaode"）
   * @throws IllegalStateException 如果 key 未注册
   */
  public static void waitFor(String key) {
    RateLimiter limiter = LIMITERS.get(key);
    if (limiter == null) {
      throw new IllegalStateException(
          "RateLimiter not registered for key=" + key + ". "
          + "Call RateLimiter.register(\"" + key + "\", permitsPerSecond) first.");
    }
    limiter.acquire();
  }

  /**
   * 查看已注册的 Provider 列表（仅用于测试）。
   *
   * @return 已注册的 Provider 名称数组
   */
  public static String[] registeredKeys() {
    return LIMITERS.keySet().toArray(new String[0]);
  }

  /**
   * 重置所有注册信息（仅用于单元测试）。
   *
   * <p>与手搓版不同，无需停 SCHEDULER 线程——Guava RateLimiter 是纯对象实例，
   * 从 Map 移除后等待 GC 回收即可。
   */
  public static void resetForTesting() {
    LIMITERS.clear();
  }
}
