package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.LoginRequest;
import com.ai.travel.dto.response.AuthResponse;
import com.ai.travel.dto.response.UserInfoResponse;
import com.ai.travel.security.AuthCookieService;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用户认证控制器，提供登录、退出和获取当前用户信息接口。
 *
 * <p>登录成功后通过 HttpOnly Cookie 下发 JWT。响应体暂时保留 Token 供非浏览器 API
 * 客户端兼容使用，Web 端不得读取或持久化该字段。
 */
@Tag(name = "认证", description = "用户登录、退出和获取当前用户信息")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Validated
public class AuthController {

  private final UserService userService;
  private final AuthCookieService authCookieService;

  /**
   * 用户登录。
   *
   * @param req 登录请求，包含用户名和密码
   * @param response HTTP 响应，用于设置 Token Cookie
   * @return 认证响应，包含 Token、用户 ID 和用户名
   */
  @Operation(summary = "用户登录",
      description = "使用用户名和密码登录，成功后返回 JWT Token 并设置 Cookie。"
          + "连续 5 次失败后锁定 15 分钟")
  @io.swagger.v3.oas.annotations.responses.ApiResponse(
      responseCode = "200", description = "登录成功",
      content = @Content(schema = @Schema(implementation = AuthResponse.class)))
  @io.swagger.v3.oas.annotations.responses.ApiResponse(
      responseCode = "401", description = "用户名或密码错误 / 登录过于频繁被锁定")
  @PostMapping("/login")
  public ApiResponse<AuthResponse> login(
      @Valid @RequestBody LoginRequest req,
      HttpServletResponse response) {
    AuthResponse auth = userService.login(req);
    authCookieService.addTokenCookie(response, auth.getToken());
    return ApiResponse.ok(auth);
  }

  /**
   * 获取当前登录用户信息。
   *
   * @return 用户信息，包含用户 ID、用户名、手机号、微信绑定状态、注册时间
   */
  @Operation(summary = "获取当前用户信息",
      description = "根据请求中的 JWT Token 返回当前登录用户的详细信息")
  @io.swagger.v3.oas.annotations.responses.ApiResponse(
      responseCode = "200", description = "获取成功",
      content = @Content(schema = @Schema(implementation = UserInfoResponse.class)))
  @io.swagger.v3.oas.annotations.responses.ApiResponse(
      responseCode = "401", description = "未登录或 Token 已过期")
  @GetMapping("/me")
  public ApiResponse<UserInfoResponse> me() {
    return ApiResponse.ok(userService.getUserInfo(UserContext.getUserId()));
  }

  /**
   * 退出当前浏览器会话。
   *
   * <p>该接口允许无有效 Token 调用，确保过期或损坏的 HttpOnly Cookie 仍可被浏览器清理。
   *
   * @param response HTTP 响应，用于清除认证 Cookie
   * @return 成功响应
   */
  @Operation(summary = "退出登录", description = "清除浏览器 HttpOnly 认证 Cookie")
  @PostMapping("/logout")
  public ApiResponse<Void> logout(HttpServletResponse response) {
    authCookieService.clearTokenCookie(response);
    return ApiResponse.ok();
  }
}
