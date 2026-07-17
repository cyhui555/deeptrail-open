package com.ai.travel.config;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * 跨域配置。
 *
 * <p>显式注册 {@link CorsFilter} 为最高优先级（{@link Ordered#HIGHEST_PRECEDENCE}），
 * 独立于 {@link WebConfig} 避免依赖链引入认证拦截器等不必要的 bean。
 * 优先级最高确保 CORS 预检请求在其它过滤器/拦截器之前命中。
 */
@Configuration
@RequiredArgsConstructor
public class CorsConfig {

  private final AppCorsProperties properties;

  /**
   * CORS 过滤器实例。
   *
   * <p>独立暴露为 {@code @Bean} 以便 {@code ConfigBeansTest} 直接验证 CORS 过滤器存在。
   *
   * @return CORS 过滤器实例
   */
  @Bean
  public CorsFilter corsFilter() {
    List<String> allowedOrigins = properties.getAllowedOrigins() == null
        ? List.of()
        : properties.getAllowedOrigins().stream()
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .distinct()
            .toList();
    if (allowedOrigins.isEmpty()) {
      throw new IllegalStateException("At least one CORS allowed origin must be configured");
    }
    if (allowedOrigins.stream().anyMatch(origin -> origin.contains("*"))) {
      throw new IllegalStateException("Wildcard CORS origins are not allowed with credentials");
    }

    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(allowedOrigins);
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return new CorsFilter(source);
  }

  /**
   * 全局 CORS 过滤器（最高优先级）。
   *
   * <p>将 {@link #corsFilter()} 包装为 {@link FilterRegistrationBean}，
   * 强制最高优先级确保 CORS 预检请求在其它过滤器/拦截器之前命中。
   *
   * @return 已注册的 CORS FilterRegistrationBean
   */
  @Bean
  public FilterRegistrationBean<CorsFilter> corsFilterRegistration() {
    FilterRegistrationBean<CorsFilter> bean = new FilterRegistrationBean<>(corsFilter());
    bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
    return bean;
  }
}
