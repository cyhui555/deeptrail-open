package com.ai.travel.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 优化行程请求体。 */
@Data
public class OptimizeItineraryRequest {

  @NotBlank(message = "currentItinerary must not be blank")
  private String currentItinerary;

  @NotBlank(message = "optimizationGoal must not be blank")
  private String optimizationGoal;

  private String constraints;
}
