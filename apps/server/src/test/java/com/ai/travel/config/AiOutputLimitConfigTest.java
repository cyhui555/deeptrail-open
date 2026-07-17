package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/** LongCat 结构化长输出配置回归测试。 */
class AiOutputLimitConfigTest {

  private static final int LONGCAT_MAX_OUTPUT_TOKENS = 131072;

  @Test
  void defaultProfileUsesOfficialLongCatMaximum() {
    assertMaxOutputTokens(new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer()));
  }

  @Test
  void testProfileDoesNotLowerLongCatMaximum() {
    assertMaxOutputTokens(new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withPropertyValues("spring.profiles.active=test"));
  }

  private void assertMaxOutputTokens(ApplicationContextRunner runner) {
    runner.run(context -> assertThat(context.getEnvironment().getProperty(
        "spring.ai.openai.chat.options.max-tokens", Integer.class))
        .isEqualTo(LONGCAT_MAX_OUTPUT_TOKENS));
  }
}
