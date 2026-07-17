package com.ai.travel.exception;

/** 禁止访问异常，用户无权限访问资源时抛出。 */
public class ForbiddenException extends RuntimeException {

  public ForbiddenException(String message) {
    super(message);
  }
}
