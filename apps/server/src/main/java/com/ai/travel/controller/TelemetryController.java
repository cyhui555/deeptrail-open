package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.WebVitalMetricRequest;
import com.ai.travel.service.WebVitalsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 接收经过枚举约束的浏览器性能指标，不保存用户内容或完整 URL。 */
@Tag(name = "性能遥测", description = "Core Web Vitals 真实用户指标")
@RestController
@RequestMapping("/api/telemetry")
@RequiredArgsConstructor
public class TelemetryController {

  private final WebVitalsService webVitalsService;

  @Operation(summary = "上报浏览器性能指标")
  @PostMapping("/web-vitals")
  public ApiResponse<Void> recordWebVital(
      @Valid @RequestBody WebVitalMetricRequest request) {
    webVitalsService.record(request);
    return ApiResponse.ok();
  }
}
