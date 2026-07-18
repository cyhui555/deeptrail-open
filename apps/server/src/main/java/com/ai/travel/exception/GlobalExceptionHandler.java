package com.ai.travel.exception;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.ErrorCode;
import java.lang.IllegalStateException;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/** 全局异常处理，将异常转换为统一的 {@link ApiResponse} 响应。 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

  /**
   * 处理参数校验异常（@Valid 注解触发的校验失败）。
   *
   * @param ex 参数校验异常
   * @return 统一错误响应
   */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ApiResponse<?> handleValidation(MethodArgumentNotValidException ex) {
    log.warn("参数校验失败: {}", ex.getMessage());
    return ApiResponse.error(
        ErrorCode.VALIDATION_FAILED.getCode(),
        ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
            .collect(Collectors.joining("; ")));
  }

  @ExceptionHandler(HandlerMethodValidationException.class)
  public ApiResponse<?> handleMethodValidation(HandlerMethodValidationException ex) {
    log.warn("方法参数校验失败: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.VALIDATION_FAILED.getCode(), "请求参数不合法: " + ex.getMessage());
  }

  @ExceptionHandler(UnauthorizedException.class)
  public ApiResponse<?> handleUnauthorized(UnauthorizedException ex) {
    log.warn("未授权访问: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.UNAUTHORIZED.getCode(), ex.getMessage());
  }

  @ExceptionHandler(UsernameExistsException.class)
  public ApiResponse<?> handleUsernameExists(UsernameExistsException ex) {
    log.warn("用户名已存在: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.USERNAME_EXISTS.getCode(), ex.getMessage());
  }

  @ExceptionHandler(UserNotFoundException.class)
  public ApiResponse<?> handleUserNotFound(UserNotFoundException ex) {
    log.warn("用户不存在: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.USER_NOT_FOUND.getCode(), ex.getMessage());
  }

  /**
   * 将越权业务异常映射为 HTTP 403，同时保留统一错误响应体供客户端读取错误码。
   *
   * @param ex 越权异常
   * @return 不包含业务数据的 403 响应
   */
  @ExceptionHandler(ForbiddenException.class)
  public ResponseEntity<ApiResponse<?>> handleForbidden(ForbiddenException ex) {
    log.warn("禁止访问: {}", ex.getMessage());
    ApiResponse<?> body = ApiResponse.error(ErrorCode.FORBIDDEN.getCode(), ex.getMessage());
    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
  }

  @ExceptionHandler(PlanNotFoundException.class)
  public ApiResponse<?> handlePlanNotFound(PlanNotFoundException ex) {
    log.warn("行程清单不存在: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.PLAN_NOT_FOUND.getCode(), ex.getMessage());
  }

  @ExceptionHandler(CheckinItemNotFoundException.class)
  public ApiResponse<?> handleCheckinItemNotFound(CheckinItemNotFoundException ex) {
    log.warn("打卡项不存在: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.CHECKIN_ITEM_NOT_FOUND.getCode(), ex.getMessage());
  }

  @ExceptionHandler(DuplicateReviewException.class)
  public ApiResponse<?> handleDuplicateReview(DuplicateReviewException ex) {
    log.warn("重复提交评价: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.REVIEW_ALREADY_EXISTS.getCode(), ex.getMessage());
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ApiResponse<?> handleIllegalArgument(IllegalArgumentException ex) {
    log.warn("非法参数: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.VALIDATION_FAILED.getCode(), ex.getMessage());
  }

  /**
   * 处理业务状态冲突异常（如自定义行程点不可编辑）。
   *
   * <p>HTTP 状态码保持 200，前端通过 code 字段（{@link ErrorCode#CUSTOM_ITEM_NOT_EDITABLE}）识别。
   *
   * @param ex 业务状态冲突异常
   * @return 统一错误响应
   */
  @ExceptionHandler(IllegalStateException.class)
  public ApiResponse<?> handleIllegalState(IllegalStateException ex) {
    log.warn("业务状态冲突: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.CUSTOM_ITEM_NOT_EDITABLE.getCode(), ex.getMessage());
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ApiResponse<?> handleMaxUploadSize(MaxUploadSizeExceededException ex) {
    log.warn("文件过大: {}", ex.getMessage());
    return ApiResponse.error(ErrorCode.FILE_TOO_LARGE.getCode(), "文件大小超出限制");
  }

  @ExceptionHandler(Exception.class)
  public ApiResponse<?> handleGeneral(Exception ex) {
    log.error("服务器内部错误", ex);
    return ApiResponse.error(ErrorCode.INTERNAL_ERROR.getCode(), ex.getMessage());
  }
}
