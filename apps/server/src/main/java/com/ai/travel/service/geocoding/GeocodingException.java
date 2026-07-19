package com.ai.travel.service.geocoding;

/**
 * 地理编码业务异常。
 *
 * <p>封装 Provider 调用过程中的限流、网络错误、解析失败等异常。
 * 上层调用方应捕获并静默降级，不阻断主流程。
 */
public class GeocodingException extends RuntimeException {

  /** 异常类别决定上层是否应把失败计入 Provider 健康熔断。 */
  public enum FailureKind {
    PROVIDER_FAILURE,
    THROTTLED
  }

  private final FailureKind failureKind;

  /**
   * 构造地理编码异常。
   *
   * @param message 异常描述
   */
  public GeocodingException(String message) {
    this(message, null, FailureKind.PROVIDER_FAILURE);
  }

  /**
   * 构造地理编码异常（带原因）。
   *
   * @param message 异常描述
   * @param cause 原始异常
   */
  public GeocodingException(String message, Throwable cause) {
    this(message, cause, FailureKind.PROVIDER_FAILURE);
  }

  private GeocodingException(String message, Throwable cause, FailureKind failureKind) {
    super(message, cause);
    this.failureKind = failureKind;
  }

  /** 创建远端配额限流异常；该异常可降级和重试，但不能误开 Provider 健康熔断。 */
  public static GeocodingException throttled(String message) {
    return new GeocodingException(message, null, FailureKind.THROTTLED);
  }

  /** 是否为远端配额限流。 */
  public boolean isThrottled() {
    return failureKind == FailureKind.THROTTLED;
  }
}
