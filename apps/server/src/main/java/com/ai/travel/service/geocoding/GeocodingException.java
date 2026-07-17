package com.ai.travel.service.geocoding;

/**
 * 地理编码业务异常。
 *
 * <p>封装 Provider 调用过程中的限流、网络错误、解析失败等异常。
 * 上层调用方应捕获并静默降级，不阻断主流程。
 */
public class GeocodingException extends RuntimeException {

  /**
   * 构造地理编码异常。
   *
   * @param message 异常描述
   */
  public GeocodingException(String message) {
    super(message);
  }

  /**
   * 构造地理编码异常（带原因）。
   *
   * @param message 异常描述
   * @param cause 原始异常
   */
  public GeocodingException(String message, Throwable cause) {
    super(message, cause);
  }
}
