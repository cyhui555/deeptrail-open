package com.ai.travel.exception;

/** 用户名已被占用异常，映射到 USERNAME_EXISTS 错误码。 */
public class UsernameExistsException extends RuntimeException {

  public UsernameExistsException(String username) {
    super("用户名已存在: " + username);
  }
}
