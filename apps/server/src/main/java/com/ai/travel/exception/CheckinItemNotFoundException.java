package com.ai.travel.exception;

/** 打卡项不存在异常。 */
public class CheckinItemNotFoundException extends RuntimeException {
  public CheckinItemNotFoundException(String message) {
    super(message);
  }
}
