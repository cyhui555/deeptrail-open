package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.enums.TaskType;
import com.ai.travel.exception.AiResponseValidationException.Reason;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class ReleaseOutcomeMetricsTest {

  @Test
  void recordsOnlyBoundedBusinessDimensions() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ReleaseOutcomeMetrics metrics = new ReleaseOutcomeMetrics(registry);

    metrics.recordTerminal(TaskType.GENERATE, "completed", 1250, 420);
    metrics.recordParseFailure(TaskType.GENERATE, Reason.MALFORMED_JSON);
    metrics.recordDegradation("geocoding", "invalid_coordinate", 2);

    assertThat(registry.get("release.outcome.tasks").counter().count()).isEqualTo(1);
    assertThat(registry.get("release.outcome.duration").timer().totalTime(
        java.util.concurrent.TimeUnit.MILLISECONDS)).isEqualTo(1250);
    assertThat(registry.get("release.outcome.tokens").summary().totalAmount()).isEqualTo(420);
    assertThat(registry.get("release.outcome.parse.invalid").counter().count()).isEqualTo(1);
    assertThat(registry.get("release.outcome.degradations").counter().count()).isEqualTo(2);
    assertThat(registry.getMeters()).allSatisfy(meter ->
        assertThat(meter.getId().getTags()).noneMatch(tag ->
            tag.getKey().contains("user") || tag.getKey().contains("task_id")));
  }
}
