package com.ai.travel.dto.response;

import java.util.List;
import lombok.Data;

/** 生成行程响应。 */
@Data
public class ItineraryResponse {

  private String summary;
  private List<DayPlan> days;
  private List<String> tips;
  private String estimatedBudget;
}
