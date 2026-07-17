package com.ai.travel.dto.response;

import java.util.List;
import lombok.Data;

/** 单日行程计划。 */
@Data
public class DayPlan {

  private Integer day;
  private String date;
  private String theme;
  private List<ScheduleItem> schedule;
  private List<MealItem> meals;
  private PoiInfo accommodation;
  private String transportation;
  private String tip;
}
