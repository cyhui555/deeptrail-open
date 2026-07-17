package com.ai.travel.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 交通方式枚举（节点修正"交通衔接"字段）。
 *
 * <p>序列化时使用 {@link #name()}（大写英文），与前端 TS 联合类型对齐。
 */
public enum TransportMode {

  WALK,
  DRIVE,
  BUS,
  SUBWAY,
  TRAIN,
  FLIGHT;

  /** 序列化：输出大写枚举名（如 "WALK"）。 */
  @JsonValue
  public String getCode() {
    return name();
  }

  /**
   * 反序列化：大小写不敏感；未知值返回 null 而非抛异常，便于前端容错。
   *
   * @param value 字符串值
   * @return 对应枚举，或 null
   */
  @JsonCreator
  public static TransportMode of(String value) {
    if (value == null) {
      return null;
    }
    for (TransportMode m : values()) {
      if (m.name().equalsIgnoreCase(value)) {
        return m;
      }
    }
    return null;
  }
}
