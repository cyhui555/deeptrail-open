package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/** 行程清单列表项响应。 */
@Data
@Schema(name = "TripPlanSummaryResponse", description = "行程清单列表项")
public class TripPlanSummaryResponse {

  @Schema(description = "清单 ID")
  private String id;

  @Schema(description = "清单标题")
  private String title;

  @Schema(description = "目的地")
  private String destination;

  @Schema(description = "封面图片路径")
  private String coverImage;

  @Schema(description = "计划出行日期")
  private String plannedDate;

  @Schema(description = "AI 生成的日程日期范围，如 2026-07-10 ~ 2026-07-12")
  private String tripDates;

  @Schema(description = "状态")
  private String status;

  @Schema(description = "打卡进度")
  private String checkinProgress;

  @Schema(description = "总 POI 数")
  private Integer totalPoi;

  @Schema(description = "已打卡 POI 数")
  private Integer completedPoi;

  @Schema(description = "行程概述（AI summary）")
  private String summary;
}
