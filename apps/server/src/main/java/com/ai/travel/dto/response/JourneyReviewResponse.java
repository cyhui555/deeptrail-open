package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

/** 旅程报告完整响应。 */
@Data
@Schema(name = "JourneyReviewResponse", description = "旅程报告")
public class JourneyReviewResponse {

  @Schema(description = "评价 ID")
  private Long id;

  @Schema(description = "关联的清单 ID")
  private String planId;

  @Schema(description = "清单标题")
  private String planTitle;

  @Schema(description = "目的地")
  private String destination;

  @Schema(description = "出行天数")
  private Integer days;

  @Schema(description = "整体评分（1-5 星）")
  private Integer rating;

  @Schema(description = "用户文字评价")
  private String userComment;

  @Schema(description = "AI 生成总结")
  private String aiSummary;

  @Schema(description = "用户是否编辑过 AI 总结")
  private Boolean summaryEdited;

  @Schema(description = "打卡完成率，如 \"8/10\"")
  private String poiCoverage;

  @Schema(description = "轨迹总距离（米）")
  private Integer totalDistanceMeters;

  @Schema(description = "打卡照片列表")
  private List<CheckinItemResponse.MediaItemDto> photos;

  @Schema(description = "创建时间")
  private LocalDateTime createdAt;
}
