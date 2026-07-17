package com.ai.travel.config;

import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/** 防止开发或生产环境误连 E2E 使用的确定性 AI 测试桩。 */
@Component
@Slf4j
public class AiProviderRuntimeGuard implements ApplicationRunner {

  private static final String MOCK_PROVIDER_PORT = ":18080";

  private final Environment environment;
  private final String apiKey;
  private final String baseUrl;

  /** 创建运行时保护器，密钥只用于判定配置类型，不会写入日志。 */
  public AiProviderRuntimeGuard(
      Environment environment,
      @Value("${spring.ai.openai.api-key:}") String apiKey,
      @Value("${spring.ai.openai.base-url:https://api.longcat.chat/openai}") String baseUrl) {
    this.environment = environment;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  @Override
  public void run(ApplicationArguments args) {
    if (environment.acceptsProfiles(Profiles.of("test"))) {
      return;
    }

    if (isKnownTestProvider(apiKey, baseUrl)) {
      // 测试桩会返回固定结构数据，误用于真实运行会造成“生成成功但内容错误”。
      throw new IllegalStateException(
          "检测到 AI 测试桩配置；非 test Profile 禁止使用 local mock Provider，"
              + "请配置真实 SPRING_AI_OPENAI_API_KEY");
    }

    if (!hasUsableApiKey(apiKey)) {
      log.warn("未配置真实 SPRING_AI_OPENAI_API_KEY，AI 生成功能当前不可用");
    }
  }

  /** 在真正发起模型请求前校验配置，防止占位密钥产生无意义的外部请求。 */
  public void assertProviderAvailable() {
    if (environment.acceptsProfiles(Profiles.of("test"))) {
      return;
    }
    if (isKnownTestProvider(apiKey, baseUrl)) {
      throw new IllegalStateException("当前配置为 AI 测试桩，不能用于真实行程生成");
    }
    if (!hasUsableApiKey(apiKey)) {
      throw new IllegalStateException(
          "未配置真实 SPRING_AI_OPENAI_API_KEY，AI 生成功能不可用");
    }
  }

  /**
   * 返回当前模型服务是否可以接受真实生成请求。
   *
   * <p>该方法只暴露布尔状态，不返回密钥、密钥前缀或 Provider 地址，避免状态接口成为配置泄露面。
   */
  public boolean isProviderAvailable() {
    if (environment.acceptsProfiles(Profiles.of("test"))) {
      return true;
    }
    return !isKnownTestProvider(apiKey, baseUrl) && hasUsableApiKey(apiKey);
  }

  static boolean isKnownTestProvider(String apiKey, String baseUrl) {
    String normalizedKey = normalize(apiKey);
    String normalizedUrl = normalize(baseUrl);
    boolean knownTestKey = "local-mock-key".equals(normalizedKey)
        || "local-e2e-key".equals(normalizedKey);
    boolean knownTestUrl = normalizedUrl.contains(MOCK_PROVIDER_PORT)
        && (normalizedUrl.contains("127.0.0.1") || normalizedUrl.contains("localhost"));
    return knownTestKey || knownTestUrl;
  }

  static boolean hasUsableApiKey(String apiKey) {
    String normalizedKey = normalize(apiKey);
    return !normalizedKey.isBlank()
        && !"replace-with-your-provider-key".equals(normalizedKey)
        && !"provider-key-not-configured".equals(normalizedKey)
        && !"local-mock-key".equals(normalizedKey)
        && !"local-e2e-key".equals(normalizedKey);
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }
}
