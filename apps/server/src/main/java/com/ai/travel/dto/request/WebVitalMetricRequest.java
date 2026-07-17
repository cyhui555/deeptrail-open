package com.ai.travel.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/** 浏览器 Core Web Vitals 上报，只允许有限指标和页面分组。 */
@Data
public class WebVitalMetricRequest {

  @NotBlank
  @Pattern(regexp = "CLS|FCP|INP|LCP|TTFB")
  private String name;

  @DecimalMin("0.0")
  @DecimalMax("600000.0")
  private double value;

  @NotBlank
  @Pattern(regexp = "good|needs-improvement|poor")
  private String rating;

  @NotBlank
  @Pattern(regexp = "home|trips|trip-live|trip-track|trip-memory|trip-overview|"
      + "trip-detail|task-detail|auth|profile|other")
  private String pageGroup;
}
