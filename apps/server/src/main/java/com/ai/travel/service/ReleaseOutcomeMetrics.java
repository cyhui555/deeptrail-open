package com.ai.travel.service;

import com.ai.travel.enums.TaskType;
import com.ai.travel.exception.AiResponseValidationException.Reason;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

/** 记录可按 Release 聚合的低基数业务结果，不接收任务 ID、用户内容或模型原文。 */
@Service
public class ReleaseOutcomeMetrics {

  private final MeterRegistry meterRegistry;

  public ReleaseOutcomeMetrics(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
  }

  /** 仅供不启动 Spring 的兼容单元测试使用。 */
  public static ReleaseOutcomeMetrics noop() {
    return new ReleaseOutcomeMetrics(null);
  }

  /** 任务终态提交后记录状态、耗时和聚合 Token 用量。 */
  public void recordTerminal(
      TaskType type, String terminalStatus, int durationMs, Integer tokenUsed) {
    if (meterRegistry == null) {
      return;
    }
    String taskType = normalize(type.name());
    String status = normalize(terminalStatus);
    Counter.builder("release.outcome.tasks")
        .description("按发布版本聚合的 AI 任务终态")
        .tags("task_type", taskType, "terminal_status", status)
        .register(meterRegistry)
        .increment();
    Timer.builder("release.outcome.duration")
        .description("AI 任务终态耗时")
        .publishPercentiles(0.5, 0.95)
        .maximumExpectedValue(Duration.ofMinutes(30))
        .tags("task_type", taskType, "terminal_status", status)
        .register(meterRegistry)
        .record(Math.max(durationMs, 0), TimeUnit.MILLISECONDS);
    if (tokenUsed != null && tokenUsed >= 0) {
      DistributionSummary.builder("release.outcome.tokens")
          .description("AI 任务聚合 Token 用量")
          .tags("task_type", taskType)
          .register(meterRegistry)
          .record(tokenUsed);
    }
  }

  /** 结构解析失败按任务类型和有限原因计数，禁止携带原始响应。 */
  public void recordParseFailure(TaskType type, Reason reason) {
    if (meterRegistry == null) {
      return;
    }
    Counter.builder("release.outcome.parse.invalid")
        .description("AI 结构化响应失败次数")
        .tags("task_type", normalize(type.name()), "reason", normalize(reason.name()))
        .register(meterRegistry)
        .increment();
  }

  /** 记录有限能力与原因的降级样本数。 */
  public void recordDegradation(String capability, String reason, int count) {
    if (meterRegistry == null || count <= 0) {
      return;
    }
    Counter.builder("release.outcome.degradations")
        .description("外部能力降级样本数")
        .tags("capability", normalize(capability), "reason", normalize(reason))
        .register(meterRegistry)
        .increment(count);
  }

  private String normalize(String value) {
    return value.toLowerCase(Locale.ROOT).replace('-', '_');
  }
}
