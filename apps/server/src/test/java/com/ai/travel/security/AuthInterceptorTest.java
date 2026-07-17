package com.ai.travel.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import com.ai.travel.entity.User;
import com.ai.travel.mapper.UserMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.PrintWriter;
import java.io.StringWriter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class AuthInterceptorTest {

  private final JwtUtil jwtUtil = new JwtUtil();
  private AuthInterceptor interceptor;

  @Mock
  private HttpServletRequest request;

  @Mock
  private HttpServletResponse response;

  @Mock
  private AuthCookieService authCookieService;

  @Mock
  private UserMapper userMapper;

  @BeforeEach
  void setUp() throws Exception {
    ReflectionTestUtils.setField(jwtUtil, "secret", "test-secret-key-for-unit-test-minimum-256-bits-long!");
    ReflectionTestUtils.setField(jwtUtil, "expirationDays", 7);
    interceptor = new AuthInterceptor(jwtUtil, authCookieService, userMapper);
    ReflectionTestUtils.setField(interceptor, "authEnabled", true);
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  void shouldAllowHealthEndpointWithoutToken() {
    when(request.getRequestURI()).thenReturn("/api/health");

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
  }

  @Test
  void shouldAllowAuthEndpointsWithoutToken() {
    when(request.getRequestURI()).thenReturn("/api/auth/login");

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
  }

  @Test
  void shouldBlockProtectedEndpointWithoutToken() throws Exception {
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    StringWriter sw = new StringWriter();
    when(response.getWriter()).thenReturn(new PrintWriter(sw));

    assertThat(interceptor.preHandle(request, response, null)).isFalse();
  }

  @Test
  void shouldBlockProtectedEndpointWithInvalidToken() throws Exception {
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    when(request.getHeader("Authorization")).thenReturn("Bearer invalid-token");
    StringWriter sw = new StringWriter();
    when(response.getWriter()).thenReturn(new PrintWriter(sw));

    assertThat(interceptor.preHandle(request, response, null)).isFalse();
    verify(authCookieService).clearTokenCookie(response);
  }

  @Test
  void shouldAllowProtectedEndpointWithValidToken() {
    String token = jwtUtil.generate(1L);
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
    when(userMapper.selectById(1L)).thenReturn(enabledUser(1L));

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
    assertThat(UserContext.getUserId()).isEqualTo(1L);
  }

  @Test
  void shouldRejectTokenWithoutBearerPrefix() throws Exception {
    String token = jwtUtil.generate(1L);
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    when(request.getHeader("Authorization")).thenReturn(token);
    StringWriter sw = new StringWriter();
    when(response.getWriter()).thenReturn(new PrintWriter(sw));

    assertThat(interceptor.preHandle(request, response, null)).isFalse();
  }

  @Test
  void shouldAllowWhenAuthDisabled() {
    ReflectionTestUtils.setField(interceptor, "authEnabled", Boolean.FALSE);

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
  }

  @Test
  void shouldAllowRegisterEndpointWithoutToken() {
    when(request.getRequestURI()).thenReturn("/api/auth/register");

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
  }

  @Test
  void shouldAllowLogoutEndpointWithoutValidToken() {
    when(request.getRequestURI()).thenReturn("/api/auth/logout");

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
  }

  @Test
  void shouldAllowOptionsRequest() {
    when(request.getMethod()).thenReturn("OPTIONS");

    assertThat(interceptor.preHandle(request, response, null)).isFalse();
  }

  @Test
  void shouldResolveTokenFromCookieWhenBearerHeaderMissing() {
    String token = jwtUtil.generate(5L);
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    when(request.getHeader("Authorization")).thenReturn(null);
    when(request.getCookies()).thenReturn(new Cookie[] { new Cookie("token", token) });
    when(userMapper.selectById(5L)).thenReturn(enabledUser(5L));

    assertThat(interceptor.preHandle(request, response, null)).isTrue();
    assertThat(UserContext.getUserId()).isEqualTo(5L);
  }

  @Test
  void shouldBlockWhenCookieTokenIsEmpty() throws Exception {
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    when(request.getHeader("Authorization")).thenReturn(null);
    when(request.getCookies()).thenReturn(new Cookie[] { new Cookie("token", "") });
    StringWriter sw = new StringWriter();
    when(response.getWriter()).thenReturn(new PrintWriter(sw));

    assertThat(interceptor.preHandle(request, response, null)).isFalse();
  }

  @Test
  void afterCompletionClearsUserContext() {
    UserContext.setUserId(99L);
    interceptor.afterCompletion(request, response, null, null);
    assertThat(UserContext.getUserId()).isNull();
  }

  @Test
  void shouldBlockDisabledUserWithExistingToken() throws Exception {
    String token = jwtUtil.generate(7L);
    User disabled = enabledUser(7L);
    disabled.setEnabled(false);
    when(request.getRequestURI()).thenReturn("/api/itineraries/tasks");
    when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
    when(userMapper.selectById(7L)).thenReturn(disabled);
    when(response.getWriter()).thenReturn(new PrintWriter(new StringWriter()));

    assertThat(interceptor.preHandle(request, response, null)).isFalse();
    verify(authCookieService).clearTokenCookie(response);
  }

  private User enabledUser(Long id) {
    User user = new User();
    user.setId(id);
    user.setEnabled(true);
    return user;
  }
}
