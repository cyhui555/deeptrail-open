package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 提交旅程评价请求。 */
@Data
@Schema(name = "JourneyReviewRequest", description = "提交旅程评价请求")
public class JourneyReviewRequest {

  /** 整体评分（1-5 星）。 */
  @NotNull(message = "评分不能为空")
  @Min(value = 1, message = "评分最低 1 星")
  @Max(value = 5, message = "评分最高 5 星")
  @Schema(description = "整体评分（1-5 星）", example = "4", requiredMode = Schema.RequiredMode.REQUIRED)
  private Integer rating;

  /** 用户文字评价。 */
  @Size(max = 2000, message = "评价最多 2000 字符")
  @Schema(description = "用户文字评价", example = "这次成都之行非常愉快，美食很棒！")
  private String comment;
}
