package com.ai.travel.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** TokenRefreshAdvice 单元测试 — 覆盖滑动续期响应头写入逻辑。 */
@ExtendWith(MockitoExtension.class)
class TokenRefreshAdviceTest {

  @Mock private JwtUtil jwtUtil;
  @Mock private AuthCookieService authCookieService;

  private TokenRefreshAdvice advice;

  @BeforeEach
  void setUp() {
    advice = new TokenRefreshAdvice(jwtUtil, authCookieService);
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("supports 始终返回 true（对所有响应体生效）")
  void supports_alwaysReturnsTrue() {
    assertThat(advice.supports((MethodParameter) null, null)).isTrue();
  }

  @Nested
  @DisplayName("beforeBodyWrite — 续期逻辑")
  class BeforeBodyWrite {

    private ServletServerHttpRequest request;
    private ServletServerHttpResponse response;

    private Object invoke(Object body, HttpServletRequest req, HttpServletResponse resp) {
      request = new ServletServerHttpRequest(req);
      response = new ServletServerHttpResponse(resp);
      return advice.beforeBodyWrite(body, null, MediaType.APPLICATION_JSON, null,
          request, response);
    }

    @Test
    @DisplayName("request 中无 token attribute → 不设置认证 Cookie")
    void noTokenAttribute_doesNotSetHeader() {
      MockHttpServletRequest req = new MockHttpServletRequest();
      MockHttpServletResponse resp = new MockHttpServletResponse();

      Object result = invoke("body", req, resp);

      assertThat(result).isEqualTo("body");
      assertThat(resp.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    @DisplayName("token 不需要续期 → 不设置认证 Cookie")
    void tokenNotNeedingRefresh_doesNotSetHeader() {
      MockHttpServletRequest req = new MockHttpServletRequest();
      req.setAttribute("token", "valid-token");
      MockHttpServletResponse resp = new MockHttpServletResponse();
      when(jwtUtil.needsRefresh("valid-token")).thenReturn(false);

      invoke("body", req, resp);

      assertThat(resp.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    @DisplayName("token 需要续期但 UserContext 无 userId → 不设置认证 Cookie")
    void needsRefreshButNoUserId_doesNotSetHeader() {
      MockHttpServletRequest req = new MockHttpServletRequest();
      req.setAttribute("token", "expiring-token");
      MockHttpServletResponse resp = new MockHttpServletResponse();
      when(jwtUtil.needsRefresh("expiring-token")).thenReturn(true);
      UserContext.clear();

      invoke("body", req, resp);

      assertThat(resp.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    @DisplayName("token 需要续期且 UserContext 有 userId → 设置 HttpOnly Cookie")
    void needsRefreshWithUserId_setsNewTokenCookie() throws Exception {
      MockHttpServletRequest req = new MockHttpServletRequest();
      req.setAttribute("token", "expiring-token");
      MockHttpServletResponse resp = new MockHttpServletResponse();
      when(jwtUtil.needsRefresh("expiring-token")).thenReturn(true);
      when(jwtUtil.generate(42L)).thenReturn("new-jwt-token");
      when(authCookieService.buildTokenCookie("new-jwt-token"))
          .thenReturn("token=new-jwt-token; Path=/; HttpOnly; SameSite=Lax");
      UserContext.setUserId(42L);

      Object result = invoke("body", req, resp);

      assertThat(result).isEqualTo("body");
      // ServletServerHttpResponse 延迟提交，需 flush 后底层 MockHttpServletResponse 才可见
      response.flush();
      assertThat(resp.getHeader(HttpHeaders.SET_COOKIE))
          .contains("token=new-jwt-token")
          .contains("HttpOnly");
    }

    @Test
    @DisplayName("request 为 null（非 Servlet） → 不设置 X-New-Token 头且 body 原样返回")
    void nullRequest_doesNotSetHeader() {
      MockHttpServletResponse resp = new MockHttpServletResponse();

      Object result = advice.beforeBodyWrite("body", null, MediaType.APPLICATION_JSON, null,
          null, new ServletServerHttpResponse(resp));

      assertThat(result).isEqualTo("body");
      assertThat(resp.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }
  }
}
