package com.ai.travel.exception;

/** 评价不存在异常。 */
public class ReviewNotFoundException extends RuntimeException {
  public ReviewNotFoundException(String message) {
    super(message);
  }
}
