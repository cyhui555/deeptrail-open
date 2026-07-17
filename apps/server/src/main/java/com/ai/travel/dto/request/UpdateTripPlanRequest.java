package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 更新行程清单请求。 */
@Data
@Schema(name = "UpdateTripPlanRequest", description = "更新行程清单请求")
public class UpdateTripPlanRequest {

  @Size(max = 200, message = "清单标题最多 200 字符")
  @Schema(description = "清单标题", example = "成都四日游（改）")
  private String title;

  @Schema(description = "计划出行日期", example = "2026-07-15")
  private String plannedDate;

  @Size(max = 1000, message = "备注最多 1000 字符")
  @Schema(description = "清单备注")
  private String note;

  @Schema(description = "状态（用户手动结束旅程时传 COMPLETED）", example = "COMPLETED")
  private String status;
}
