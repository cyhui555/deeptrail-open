package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建行程清单请求。
 *
 * <p>支持两种创建方式：
 * <ol>
 *   <li>从行程详情页"加入行程清单"时提交，{@code taskId} 必填，系统自动从任务提取 destination / summary；</li>
 *   <li>从行程清单页"新建行程"时提交，{@code taskId} 为空，创建空白清单，用户后续手动添加行程点。</li>
 * </ol>
 */
@Data
@Schema(name = "CreateTripPlanRequest", description = "创建行程清单请求")
public class CreateTripPlanRequest {

  /** 清单标题，如"成都三日游"。 */
  @NotBlank(message = "清单标题不能为空")
  @Size(max = 200, message = "清单标题最多 200 字符")
  @Schema(description = "清单标题", example = "成都三日游", requiredMode = Schema.RequiredMode.REQUIRED)
  private String title;

  /**
   * 关联的首个生成任务 ID。
   *
   * <p>从行程详情页"加入行程清单"时必填；
   * 从清单页"新建行程"时为空，系统创建空白清单。
   */
  @Schema(description = "关联的生成任务 ID（可选，空值创建空白清单）",
      example = "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
  private String taskId;

  /** 计划出行日期（yyyy-MM-dd），可选。 */
  @Schema(description = "计划出行日期", example = "2026-07-10")
  private String plannedDate;

  /**
   * AI 生成的日程日期范围，可选。
   *
   * <p>格式："{首天日期} ~ {末天日期}"，如 "2026-07-10 ~ 2026-07-12"。
   * 由前端从 {@code ItineraryResponse.days[].date} 聚合而来，用户不直接编辑。
   */
  @Size(max = 100, message = "日程日期范围最多 100 字符")
  @Schema(description = "AI 生成的日程日期范围", example = "2026-07-10 ~ 2026-07-12")
  private String tripDates;

  /** 清单备注，可选。 */
  @Size(max = 1000, message = "备注最多 1000 字符")
  @Schema(description = "清单备注")
  private String note;
}
