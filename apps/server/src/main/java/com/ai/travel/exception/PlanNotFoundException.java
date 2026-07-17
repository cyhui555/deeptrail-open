package com.ai.travel.exception;

/** 行程清单不存在异常。 */
public class PlanNotFoundException extends RuntimeException {
  public PlanNotFoundException(String message) {
    super(message);
  }
}
