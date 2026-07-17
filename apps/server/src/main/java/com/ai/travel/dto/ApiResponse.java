package com.ai.travel.dto;

import lombok.Data;

/** 统一 API 响应包装，所有接口统一使用此结构返回。 */
@Data
public class ApiResponse<T> {

  private boolean success;
  private String message;
  private T data;
  private String errorCode;

  /**
   * 构建成功响应。
   *
   * @param data 响应数据
   * @return 成功响应
   */
  public static <T> ApiResponse<T> ok(T data) {
    ApiResponse<T> r = new ApiResponse<>();
    r.setSuccess(true);
    r.setMessage("ok");
    r.setData(data);
    return r;
  }

  public static <T> ApiResponse<T> ok() {
    return ok(null);
  }

  /**
   * 构建错误响应。
   *
   * @param errorCode 错误码
   * @param message 错误信息
   * @return 错误响应
   */
  public static <T> ApiResponse<T> error(String errorCode, String message) {
    ApiResponse<T> r = new ApiResponse<>();
    r.setSuccess(false);
    r.setMessage(message);
    r.setErrorCode(errorCode);
    return r;
  }
}
