package com.ai.travel.exception;

/** 重复提交评价异常。 */
public class DuplicateReviewException extends RuntimeException {
  public DuplicateReviewException(String message) {
    super(message);
  }
}
