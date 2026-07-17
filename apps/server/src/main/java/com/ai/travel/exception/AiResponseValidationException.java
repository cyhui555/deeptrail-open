package com.ai.travel.exception;

import lombok.Getter;

/** AI 返回内容无法形成可用业务结果时抛出的安全异常，不携带模型原文。 */
@Getter
public class AiResponseValidationException extends RuntimeException {

  private final Reason reason;

  public AiResponseValidationException(Reason reason) {
    super(reason.message);
    this.reason = reason;
  }

  /** 仅暴露低基数原因，便于任务状态、指标和发布结果聚合。 */
  public enum Reason {
    EMPTY_RESPONSE("AI 返回为空，请重试"),
    MALFORMED_JSON("AI 返回格式无效，请重试"),
    MISSING_DAYS("AI 返回缺少有效行程天数，请重试");

    private final String message;

    Reason(String message) {
      this.message = message;
    }
  }
}
