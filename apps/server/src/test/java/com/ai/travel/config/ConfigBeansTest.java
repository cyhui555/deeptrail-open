package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.task.TaskExecutor;
import org.springframework.web.filter.CorsFilter;

/**
 * 核心基础 Bean 验证测试。
 *
 * <p>通过轻量级 {@link ApplicationContextRunner} 只加载基础配置类，
 * 验证核心基础设施 Bean 能被正确注册，避免启动完整应用上下文。
 * CORS 过滤器由 {@link CorsConfig#corsFilter()} 独立暴露为 {@code @Bean}。
 */
class ConfigBeansTest {

  private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
      .withBean(AppCorsProperties.class, () -> {
        AppCorsProperties properties = new AppCorsProperties();
        properties.setAllowedOrigins(java.util.List.of("http://localhost:3000"));
        return properties;
      })
      .withUserConfiguration(AsyncConfig.class, CorsConfig.class, OpenApiConfig.class);

  @Test
  void createsCoreInfrastructureBeans() {
    contextRunner.run(context -> {
      assertThat(context).hasSingleBean(TaskExecutor.class);
      assertThat(context).hasSingleBean(CorsFilter.class);
      assertThat(context).hasSingleBean(io.swagger.v3.oas.models.OpenAPI.class);
    });
  }
}
