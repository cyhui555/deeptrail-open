package com.ai.travel.security;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 响应体写入前的 Token 续期通知器。
 *
 * <p>在 {@link HttpMessageConverter} 写入响应体之前执行，此时响应头尚未提交到客户端，
 * 可可靠地设置 HttpOnly {@code Set-Cookie} 响应头实现滑动续期。
 *
 * <p>仅当 Token 剩余有效期不足 3 天下发新 Token，避免无意义的刷新开销。
 * 配合 {@link AuthInterceptor} 在 {@code preHandle} 中写入的 request attribute 使用。
 */
@ControllerAdvice
@RequiredArgsConstructor
public class TokenRefreshAdvice implements ResponseBodyAdvice<Object> {

  private final JwtUtil jwtUtil;
  private final AuthCookieService authCookieService;

  @Override
  public boolean supports(MethodParameter returnType,
      Class<? extends HttpMessageConverter<?>> converterType) {
    return true;
  }

  @Override
  public Object beforeBodyWrite(Object body, MethodParameter returnType,
      MediaType selectedContentType,
      Class<? extends HttpMessageConverter<?>> converterType,
      ServerHttpRequest request, ServerHttpResponse response) {

    if (request instanceof ServletServerHttpRequest servletRequest) {
      HttpServletRequest req = servletRequest.getServletRequest();
      String token = (String) req.getAttribute("token");
      if (token != null && jwtUtil.needsRefresh(token)) {
        Long userId = UserContext.getUserId();
        if (userId != null) {
          response.getHeaders().add(
              HttpHeaders.SET_COOKIE,
              authCookieService.buildTokenCookie(jwtUtil.generate(userId)));
        }
      }
    }
    return body;
  }
}
