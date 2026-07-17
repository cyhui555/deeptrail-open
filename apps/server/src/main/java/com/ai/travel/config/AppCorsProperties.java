package com.ai.travel.config;

import java.util.List;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** CORS 可信来源白名单配置。 */
@Data
@ConfigurationProperties(prefix = "app.cors")
public class AppCorsProperties {

  /** 允许携带凭证访问后端 API 的精确 Origin 列表。 */
  private List<String> allowedOrigins = List.of("http://localhost:3000");
}
