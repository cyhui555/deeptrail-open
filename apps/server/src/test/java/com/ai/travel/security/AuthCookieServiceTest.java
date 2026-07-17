package com.ai.travel.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ai.travel.config.AppAuthProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

/** HttpOnly 认证 Cookie 安全属性测试。 */
class AuthCookieServiceTest {

  @Test
  @DisplayName("登录 Cookie 必须包含 HttpOnly、SameSite 和有效期")
  void addTokenCookie_usesSecureBrowserAttributes() {
    AppAuthProperties properties = properties(false, "Lax");
    AuthCookieService service = new AuthCookieService(properties);
    service.validateConfiguration();
    MockHttpServletResponse response = new MockHttpServletResponse();

    service.addTokenCookie(response, "jwt-token");

    String header = response.getHeader("Set-Cookie");
    assertThat(header)
        .contains("token=jwt-token")
        .contains("HttpOnly")
        .contains("SameSite=Lax")
        .contains("Path=/")
        .doesNotContain("Secure");
  }

  @Test
  @DisplayName("生产 Cookie 可启用 Secure")
  void buildTokenCookie_secureEnabled_containsSecure() {
    AuthCookieService service = new AuthCookieService(properties(true, "Strict"));
    service.validateConfiguration();

    assertThat(service.buildTokenCookie("jwt-token"))
        .contains("Secure")
        .contains("SameSite=Strict");
  }

  @Test
  @DisplayName("退出 Cookie 必须立即过期并保持 HttpOnly")
  void clearTokenCookie_expiresCookie() {
    AuthCookieService service = new AuthCookieService(properties(false, "Lax"));
    service.validateConfiguration();

    assertThat(service.buildClearCookie())
        .contains("Max-Age=0")
        .contains("HttpOnly");
  }

  @Test
  @DisplayName("SameSite=None 未启用 Secure 时拒绝启动")
  void validateConfiguration_noneWithoutSecure_fails() {
    AuthCookieService service = new AuthCookieService(properties(false, "None"));

    assertThatThrownBy(service::validateConfiguration)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("Secure");
  }

  private AppAuthProperties properties(boolean secure, String sameSite) {
    AppAuthProperties properties = new AppAuthProperties();
    properties.setCookieSecure(secure);
    properties.setCookieSameSite(sameSite);
    properties.setCookieMaxAgeDays(7);
    return properties;
  }
}
