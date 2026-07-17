package com.ai.travel.dto.response;

import com.ai.travel.enums.UserRole;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 认证响应 DTO，登录成功后返回。 */
@Data
@AllArgsConstructor
@NoArgsConstructor
@Schema(description = "认证响应")
public class AuthResponse {

  /** JWT Token，后续请求通过 Authorization: Bearer 令牌 传递。 */
  @Schema(description = "JWT Token", example = "eyJhbGciOiJIUzM4NCJ9...")
  private String token;

  /** 用户 ID。 */
  @Schema(description = "用户 ID", example = "1")
  private Long userId;

  /** 用户名。 */
  @Schema(description = "用户名", example = "traveler01")
  private String username;

  /** 当前用户角色，用于客户端展示对应入口；服务端仍会独立鉴权。 */
  @Schema(description = "用户角色", example = "USER")
  private UserRole role;
}
