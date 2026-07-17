package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 登录请求 DTO。 */
@Data
@Schema(description = "登录请求")
public class LoginRequest {

  /** 用户名。 */
  @NotBlank(message = "用户名不能为空")
  @Schema(description = "用户名", example = "traveler01", requiredMode = Schema.RequiredMode.REQUIRED)
  private String username;

  /** 密码（明文，传输层应使用 HTTPS）。 */
  @NotBlank(message = "密码不能为空")
  @Schema(description = "密码", example = "secret123", requiredMode = Schema.RequiredMode.REQUIRED,
      accessMode = Schema.AccessMode.WRITE_ONLY)
  private String password;
}
