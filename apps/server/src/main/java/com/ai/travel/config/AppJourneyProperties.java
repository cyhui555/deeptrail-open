package com.ai.travel.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 旅程评价相关配置属性。 */
@Data
@ConfigurationProperties(prefix = "app.journey")
public class AppJourneyProperties {

  /** AI 总结调用超时（毫秒）。 */
  private long aiSummaryTimeoutMs = 30000;

  /** AI 总结最大重试次数。 */
  private int aiSummaryMaxRetries = 1;
}
