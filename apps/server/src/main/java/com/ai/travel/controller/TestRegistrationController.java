package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.RegisterRequest;
import com.ai.travel.dto.response.AuthResponse;
import com.ai.travel.security.AuthCookieService;
import com.ai.travel.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仅 test Profile 启用的隔离账号夹具。
 *
 * <p>浏览器回归需要独立用户验证数据归属；生产与开发 Profile 不创建此控制器。
 */
@Profile("test")
@ConditionalOnProperty(prefix = "app.auth", name = "registration-enabled", havingValue = "true")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class TestRegistrationController {

  private final UserService userService;
  private final AuthCookieService authCookieService;

  /** 为浏览器回归创建独立测试账号并下发测试会话。 */
  @PostMapping("/register")
  public ApiResponse<AuthResponse> register(
      @Valid @RequestBody RegisterRequest request,
      HttpServletResponse response) {
    AuthResponse auth = userService.registerForTesting(request);
    authCookieService.addTokenCookie(response, auth.getToken());
    return ApiResponse.ok(auth);
  }
}
