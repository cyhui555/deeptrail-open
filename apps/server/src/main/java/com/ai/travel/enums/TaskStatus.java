package com.ai.travel.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 异步任务状态。生命周期：PENDING → PROCESSING → COMPLETED / FAILED / CANCELLED。
 *
 * <p>使用 {@link #isTerminal()} 判断终态，禁止在业务代码中用字符串比较。
 */
public enum TaskStatus {

  PENDING,
  PROCESSING,
  COMPLETED,
  FAILED,
  CANCELLED;

  /** 是否为终态（COMPLETED / FAILED / CANCELLED）。 */
  public boolean isTerminal() {
    return this == COMPLETED || this == FAILED || this == CANCELLED;
  }

  @JsonValue
  public String getCode() {
    return name();
  }

  @JsonCreator
  public static TaskStatus of(String value) {
    return TaskStatus.valueOf(value);
  }
}
