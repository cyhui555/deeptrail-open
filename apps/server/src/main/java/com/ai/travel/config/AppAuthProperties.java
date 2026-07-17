package com.ai.travel.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 认证与浏览器 Cookie 配置。 */
@Data
@ConfigurationProperties(prefix = "app.auth")
public class AppAuthProperties {

  /** 是否启用 API 认证。 */
  private boolean enabled = true;

  /** 仅 test Profile 可启用的隔离账号注册夹具。 */
  private boolean registrationEnabled = false;

  /** HTTPS 部署时必须启用 Secure；本地 HTTP 开发可关闭。 */
  private boolean cookieSecure = false;

  /** Cookie SameSite 策略，仅允许 Lax、Strict 或 None。 */
  private String cookieSameSite = "Lax";

  /** Cookie 与 JWT 的统一有效天数。 */
  private long cookieMaxAgeDays = 7;
}
