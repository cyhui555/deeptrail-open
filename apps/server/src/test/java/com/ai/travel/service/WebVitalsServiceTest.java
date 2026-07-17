package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.dto.request.WebVitalMetricRequest;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class WebVitalsServiceTest {

  @Test
  void recordUsesOnlyBoundedMetricAndPageTags() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    WebVitalsService service = new WebVitalsService(registry);
    WebVitalMetricRequest request = new WebVitalMetricRequest();
    request.setName("LCP");
    request.setValue(1850.5);
    request.setRating("good");
    request.setPageGroup("trip-live");

    service.record(request);

    DistributionSummary summary = registry.find("web.vitals.lcp")
        .tags("rating", "good", "page", "trip-live")
        .summary();
    assertThat(summary).isNotNull();
    assertThat(summary.count()).isEqualTo(1);
    assertThat(summary.totalAmount()).isEqualTo(1850.5);
  }
}
