package com.ai.travel.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI / Swagger 接口文档配置。 */
@Configuration
public class OpenApiConfig {

  /**
   * 构建 OpenAPI 基础信息 Bean。
   *
   * <p>设置 API 标题、版本号与描述信息。
   *
   * @return 自定义 OpenAPI 配置
   */
  @Bean
  public OpenAPI customOpenApi() {
    return new OpenAPI()
        .info(new Info()
            .title("旅迹 API")
            .version("0.1.0")
            .description("Spring AI Travel Itinerary Planner"));
  }
}
