package com.ai.travel.mapper.projection;

import lombok.Data;

/** 行程列表批量进度聚合结果，不作为公共 API DTO 使用。 */
@Data
public class TripPlanProgressProjection {
  private String planId;
  private Long totalPoi;
  private Long completedPoi;
}
