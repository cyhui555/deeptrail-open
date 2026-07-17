package com.ai.travel.exception;

/** 未认证异常，用户未登录或 Token 无效时抛出。 */
public class UnauthorizedException extends RuntimeException {

  public UnauthorizedException(String message) {
    super(message);
  }
}
