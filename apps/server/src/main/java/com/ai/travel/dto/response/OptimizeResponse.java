package com.ai.travel.dto.response;

import java.util.List;
import lombok.Data;

/** 优化行程响应。 */
@Data
public class OptimizeResponse {

  /** 优化后的行程概览（与生成行程结构一致）。 */
  private String summary;
  /** 优化后的每日行程计划（与生成行程结构一致）。 */
  private List<DayPlan> days;
  /** 出行提示（与生成行程结构一致）。 */
  private List<String> tips;
  /** 预算估算（与生成行程结构一致）。 */
  private String estimatedBudget;
  /** 兼容旧版纯文本格式：当 AI 未返回结构化数据时的降级文本。 */
  private String optimizedItinerary;
  /** 具体变更项列表。 */
  private List<ChangeItem> changes;
  /** 整体优化思路说明。 */
  private String reasoning;
}
