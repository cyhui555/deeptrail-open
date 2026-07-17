package com.ai.travel.dto.response;

import lombok.Data;

/** 单日内的餐饮推荐项。 */
@Data
public class MealItem {

  private String type;
  private String recommendation;
  private PoiInfo poi;
  private String estimatedCost;
}
