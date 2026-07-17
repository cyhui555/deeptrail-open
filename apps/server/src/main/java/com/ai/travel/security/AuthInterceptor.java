package com.ai.travel.security;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.entity.User;
import com.ai.travel.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 认证拦截器，校验请求中的 JWT Token 并将用户 ID 写入 {@link UserContext}。
 *
 * <p>白名单路径（{@code /api/health}、{@code /api/auth/}）直接放行。
 * Token 剩余有效期不足 3 天时通过 HttpOnly Cookie 实现滑动续期。
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

  private final JwtUtil jwtUtil;
  private final AuthCookieService authCookieService;
  private final UserMapper userMapper;

  @Value("${app.auth.enabled:true}")
  private boolean authEnabled;

  private static final Set<String> EXACT_WHITELIST = Set.of(
      "/api/health",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/logout",
      // 登录页同样需要真实用户性能指标；请求体已由枚举和数值边界严格约束。
      "/api/telemetry/web-vitals"
  );

  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                           Object handler) {
    if (!authEnabled) {
      return true;
    }

    // CORS 预检正常由最高优先级 CorsFilter 处理；此分支仅作为容器差异下的防御。
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      response.setStatus(HttpServletResponse.SC_OK);
      return false;
    }

    String path = request.getRequestURI();

    if (EXACT_WHITELIST.contains(path)) {
      return true;
    }

    String token = resolveToken(request);
    if (token == null) {
      sendUnauthorized(response, "请先登录");
      return false;
    }
    if (!jwtUtil.validate(token)) {
      authCookieService.clearTokenCookie(response);
      sendUnauthorized(response, "登录已过期，请重新登录");
      return false;
    }

    Long userId = jwtUtil.getUserIdFromToken(token);
    User user = userMapper.selectById(userId);
    if (user == null || Boolean.FALSE.equals(user.getEnabled())) {
      authCookieService.clearTokenCookie(response);
      sendUnauthorized(response, "账号已停用或不存在，请联系管理员");
      return false;
    }

    UserContext.setUserId(userId);
    request.setAttribute("token", token);
    return true;
  }

  @Override
  public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                              Object handler, Exception ex) {
    // Token 续期由 TokenRefreshAdvice 在响应体写入前以 HttpOnly Cookie 下发。
    UserContext.clear();
  }

  /**
   * 解析请求中的 JWT Token。
   *
   * <p>优先从 {@code Authorization: Bearer xxx} 头读取（API 调用）；
   * 若缺失则回退读取 {@code token} cookie（浏览器 img/video 等
   * 自动带 cookie 的场景）。
   *
   * @param request HTTP 请求
   * @return 有效 token 字符串，均未找到时返回 null
   */
  private String resolveToken(HttpServletRequest request) {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      return header.substring(7);
    }
    // 回退：从 cookie 读取（适配 <img>/<video> 等无法自定义头的场景）
    if (request.getCookies() != null) {
      for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
        if ("token".equals(cookie.getName()) && !cookie.getValue().isEmpty()) {
          return cookie.getValue();
        }
      }
    }
    return null;
  }

  /**
   * 发送 401 未授权响应。
   *
   * @param response HTTP 响应
   * @param message 错误提示信息
   */
  private void sendUnauthorized(HttpServletResponse response, String message) {
    response.setStatus(401);
    response.setContentType("application/json;charset=UTF-8");
    try {
      response.getWriter().write(
          objectMapper.writeValueAsString(ApiResponse.error("UNAUTHORIZED", message))
      );
    } catch (IOException ignored) {
      // 写入响应失败时忽略，客户端可感知连接断开
    }
  }

}
