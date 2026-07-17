package com.ai.travel.exception;

/** 管理后台目标用户不存在。 */
public class UserNotFoundException extends RuntimeException {

  public UserNotFoundException(Long userId) {
    super("用户不存在: " + userId);
  }
}
