package com.ai.travel.service;

import com.ai.travel.dto.request.WebVitalMetricRequest;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 将浏览器性能样本记录到 Micrometer，标签全部来自有限枚举以控制基数。 */
@Service
@RequiredArgsConstructor
public class WebVitalsService {

  private final MeterRegistry meterRegistry;

  /**
   * 记录一个已经通过枚举与数值范围校验的浏览器性能样本。
   *
   * @param request Core Web Vitals 样本
   */
  public void record(WebVitalMetricRequest request) {
    String metricName = "web.vitals." + request.getName().toLowerCase(Locale.ROOT);
    DistributionSummary.builder(metricName)
        .description("旅迹浏览器真实用户性能指标")
        .publishPercentileHistogram()
        .tag("rating", request.getRating())
        .tag("page", request.getPageGroup())
        .register(meterRegistry)
        .record(request.getValue());
  }
}
