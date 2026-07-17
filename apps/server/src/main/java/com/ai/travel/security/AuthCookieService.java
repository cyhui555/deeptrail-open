package com.ai.travel.security;

import com.ai.travel.config.AppAuthProperties;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** 统一生成和清理认证 Cookie，避免各入口使用不一致的安全属性。 */
@Component
@RequiredArgsConstructor
public class AuthCookieService {

  private static final String COOKIE_NAME = "token";
  private static final Set<String> ALLOWED_SAME_SITE = Set.of("Lax", "Strict", "None");

  private final AppAuthProperties properties;

  /** 启动时校验 Cookie 配置，避免 SameSite=None 在非 HTTPS 环境静默失效。 */
  @PostConstruct
  void validateConfiguration() {
    String sameSite = normalizeSameSite(properties.getCookieSameSite());
    if ("None".equals(sameSite) && !properties.isCookieSecure()) {
      throw new IllegalStateException("SameSite=None requires a Secure auth cookie");
    }
    if (properties.getCookieMaxAgeDays() <= 0) {
      throw new IllegalStateException("Auth cookie max age must be positive");
    }
  }

  /** 将 JWT 写入仅服务端可读的认证 Cookie。 */
  public void addTokenCookie(HttpServletResponse response, String token) {
    response.addHeader(HttpHeaders.SET_COOKIE, buildTokenCookie(token));
  }

  /** 清理浏览器认证 Cookie。 */
  public void clearTokenCookie(HttpServletResponse response) {
    response.addHeader(HttpHeaders.SET_COOKIE, buildClearCookie());
  }

  /** 构造续期使用的 Set-Cookie 响应头值。 */
  public String buildTokenCookie(String token) {
    return baseCookie(token)
        .maxAge(Duration.ofDays(properties.getCookieMaxAgeDays()))
        .build()
        .toString();
  }

  /** 构造退出或无效令牌使用的清理 Cookie。 */
  public String buildClearCookie() {
    return baseCookie("")
        .maxAge(Duration.ZERO)
        .build()
        .toString();
  }

  private ResponseCookie.ResponseCookieBuilder baseCookie(String value) {
    return ResponseCookie.from(COOKIE_NAME, value)
        .httpOnly(true)
        .secure(properties.isCookieSecure())
        .sameSite(normalizeSameSite(properties.getCookieSameSite()))
        .path("/");
  }

  private String normalizeSameSite(String configured) {
    if (configured == null || configured.isBlank()) {
      throw new IllegalStateException("Auth cookie SameSite must be configured");
    }
    String value = configured.trim();
    String normalized = value.substring(0, 1).toUpperCase(Locale.ROOT)
        + value.substring(1).toLowerCase(Locale.ROOT);
    if (!ALLOWED_SAME_SITE.contains(normalized)) {
      throw new IllegalStateException("Unsupported auth cookie SameSite: " + configured);
    }
    return normalized;
  }
}
