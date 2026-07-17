package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

/** 行程清单详情响应。 */
@Data
@Schema(name = "TripPlanResponse", description = "行程清单详情")
public class TripPlanResponse {

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

  @Schema(description = "状态", allowableValues = {"PLANNED", "ONGOING", "COMPLETED"})
  private String status;

  @Schema(description = "当前执行的任务 ID")
  private String activeTaskId;

  @Schema(description = "清单备注")
  private String note;

  @Schema(description = "关联的任务版本列表")
  private List<TaskVersionResponse> taskVersions;

  @Schema(description = "打卡进度（已打卡 POI / 总 POI）")
  private String checkinProgress;

  @Schema(description = "创建时间")
  private LocalDateTime createdAt;
}
