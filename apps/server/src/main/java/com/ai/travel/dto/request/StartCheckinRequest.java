package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 开始打卡请求。
 *
 * <p>将当前执行版本的行程按天拆分为打卡任务。
 * 可选指定起始天数（用于续打场景）。
 */
@Data
@Schema(name = "StartCheckinRequest", description = "开始打卡请求")
public class StartCheckinRequest {

  @Schema(description = "起始天数（1-based），不传则从第 1 天开始", example = "1")
  private Integer startDay;
}
