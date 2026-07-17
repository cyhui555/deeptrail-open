package com.ai.travel.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * AI 调用响应状态。
 *
 * <p>SUCCESS: 完全成功；PARTIAL: 部分成功（如 JSON 解析走兜底但仍有内容）；FAILED: 完全失败。
 */
public enum AiCallStatus {

  SUCCESS,
  PARTIAL,
  FAILED;

  @JsonValue
  public String getCode() {
    return name();
  }

  @JsonCreator
  public static AiCallStatus of(String value) {
    return AiCallStatus.valueOf(value);
  }
}
