package com.ai.travel.enums;

import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 异步任务类型。
 *
 * <p>使用 {@link #resultClass()} 获取响应反序列化目标类型，避免调用方硬编码 if/else。
 */
public enum TaskType {

  GENERATE,
  OPTIMIZE,
  XIAOHONGSHU;

  /** 返回该任务类型对应的响应类。 */
  public Class<?> resultClass() {
    return switch (this) {
      case GENERATE -> ItineraryResponse.class;
      case OPTIMIZE -> OptimizeResponse.class;
      case XIAOHONGSHU -> ItineraryResponse.class;
    };
  }

  @JsonValue
  public String getCode() {
    return name();
  }

  @JsonCreator
  public static TaskType of(String value) {
    return TaskType.valueOf(value);
  }
}
