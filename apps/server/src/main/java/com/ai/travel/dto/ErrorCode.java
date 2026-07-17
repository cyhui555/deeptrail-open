package com.ai.travel.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 业务错误码枚举，用于统一错误响应。 */
@Getter
@AllArgsConstructor
public enum ErrorCode {

  VALIDATION_FAILED("VALIDATION_FAILED", "Parameter validation failed"),
  AI_SERVICE_ERROR("AI_SERVICE_ERROR", "AI service call failed"),
  INTERNAL_ERROR("INTERNAL_ERROR", "Internal server error"),
  AUTH_FAILED("AUTH_FAILED", "Authentication failed"),
  USERNAME_EXISTS("USERNAME_EXISTS", "Username already exists"),
  USER_NOT_FOUND("USER_NOT_FOUND", "User not found"),
  UNAUTHORIZED("UNAUTHORIZED", "Please login first"),
  FORBIDDEN("FORBIDDEN", "Access denied"),
  TOKEN_EXPIRED("TOKEN_EXPIRED", "Token expired"),
  TOKEN_INVALID("TOKEN_INVALID", "Token invalid"),

  // 行程清单相关 (PLAN_*)
  PLAN_NOT_FOUND("PLAN_NOT_FOUND", "行程清单不存在"),
  PLAN_FORBIDDEN("PLAN_FORBIDDEN", "无权访问该行程清单"),
  PLAN_ACTIVE_TASK_NOT_FOUND("PLAN_ACTIVE_TASK_NOT_FOUND", "清单未关联有效的执行任务"),
  PLAN_STATUS_INVALID("PLAN_STATUS_INVALID", "清单状态不允许此操作"),

  // 打卡任务相关 (CHECKIN_*)
  CHECKIN_TASK_NOT_FOUND("CHECKIN_TASK_NOT_FOUND", "打卡任务不存在"),
  CHECKIN_ITEM_NOT_FOUND("CHECKIN_ITEM_NOT_FOUND", "打卡项不存在"),
  CHECKIN_ALREADY_DONE("CHECKIN_ALREADY_DONE", "该 POI 已打卡，请先撤销"),
  CHECKIN_NOT_STARTED("CHECKIN_NOT_STARTED", "请先开始打卡"),
  CHECKIN_ITEM_LOCKED("CHECKIN_ITEM_LOCKED", "打卡项不属于当前用户"),
  CUSTOM_ITEM_NOT_EDITABLE("CUSTOM_ITEM_NOT_EDITABLE", "该自定义行程点不可编辑"),

  // 媒体相关 (MEDIA_*)
  MEDIA_COUNT_EXCEEDED("MEDIA_COUNT_EXCEEDED", "媒体数量超出限制"),
  INVALID_MEDIA_TYPE("INVALID_MEDIA_TYPE", "不支持的文件类型"),
  FILE_TOO_LARGE("FILE_TOO_LARGE", "文件大小超出限制"),

  // 轨迹相关 (TRACK_*)
  TRACK_UPLOAD_EMPTY("TRACK_UPLOAD_EMPTY", "轨迹点列表为空"),

  // 旅程评价相关 (REVIEW_*)
  REVIEW_ALREADY_EXISTS("REVIEW_ALREADY_EXISTS", "该清单已有一份评价"),
  REVIEW_NOT_FOUND("REVIEW_NOT_FOUND", "评价不存在");

  private final String code;
  private final String defaultMessage;
}
