package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** AI Provider 运行时边界测试。 */
class AiProviderRuntimeGuardTest {

  @Test
  @DisplayName("非测试环境拒绝本地 AI 测试桩")
  void nonTestProfile_rejectsLocalMockProvider() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("dev");
    AiProviderRuntimeGuard guard = new AiProviderRuntimeGuard(
        environment, "local-mock-key", "http://127.0.0.1:18080");

    assertThatThrownBy(() -> guard.run(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("AI 测试桩");
  }

  @Test
  @DisplayName("测试环境允许确定性 AI 测试桩")
  void testProfile_allowsLocalMockProvider() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("test");
    AiProviderRuntimeGuard guard = new AiProviderRuntimeGuard(
        environment, "local-e2e-key", "http://localhost:18080");

    assertThatCode(() -> guard.run(null)).doesNotThrowAnyException();
  }

  @Test
  @DisplayName("真实 Provider 配置可以运行")
  void realProvider_isAccepted() {
    AiProviderRuntimeGuard guard = new AiProviderRuntimeGuard(
        new MockEnvironment(), "real-provider-key", "https://api.longcat.chat/openai");

    assertThatCode(() -> guard.run(null)).doesNotThrowAnyException();
  }

  @Test
  @DisplayName("占位密钥不视为可用密钥")
  void placeholderKey_isNotUsable() {
    assertThat(AiProviderRuntimeGuard.hasUsableApiKey("replace-with-your-provider-key"))
        .isFalse();
    assertThat(AiProviderRuntimeGuard.hasUsableApiKey("provider-key-not-configured"))
        .isFalse();
    assertThat(AiProviderRuntimeGuard.hasUsableApiKey("  ")).isFalse();
    assertThat(AiProviderRuntimeGuard.hasUsableApiKey("real-provider-key")).isTrue();
  }

  @Test
  @DisplayName("未配置真实密钥时在模型请求前本地拒绝")
  void missingKey_rejectsAiCallLocally() {
    AiProviderRuntimeGuard guard = new AiProviderRuntimeGuard(
        new MockEnvironment(), "provider-key-not-configured", "https://api.longcat.chat/openai");

    assertThatThrownBy(guard::assertProviderAvailable)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("SPRING_AI_OPENAI_API_KEY");
  }

  @Test
  @DisplayName("就绪状态只在真实密钥或测试 Profile 下可用")
  void availability_reflectsSafeRuntimeConfiguration() {
    MockEnvironment production = new MockEnvironment();
    AiProviderRuntimeGuard missing = new AiProviderRuntimeGuard(
        production, "provider-key-not-configured", "https://api.longcat.chat/openai");
    AiProviderRuntimeGuard real = new AiProviderRuntimeGuard(
        production, "real-provider-key", "https://api.longcat.chat/openai");
    AiProviderRuntimeGuard mock = new AiProviderRuntimeGuard(
        production, "local-mock-key", "http://127.0.0.1:18080");

    MockEnvironment test = new MockEnvironment();
    test.setActiveProfiles("test");
    AiProviderRuntimeGuard testProvider = new AiProviderRuntimeGuard(
        test, "local-e2e-key", "http://localhost:18080");

    assertThat(missing.isProviderAvailable()).isFalse();
    assertThat(mock.isProviderAvailable()).isFalse();
    assertThat(real.isProviderAvailable()).isTrue();
    assertThat(testProvider.isProviderAvailable()).isTrue();
  }
}
