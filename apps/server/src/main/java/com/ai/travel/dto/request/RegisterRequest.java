package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 注册请求 DTO。 */
@Data
@Schema(description = "注册请求")
public class RegisterRequest {

  /** 用户名，3-50 个字符。 */
  @NotBlank(message = "用户名不能为空")
  @Size(min = 3, max = 50, message = "用户名长度为3-50个字符")
  @Schema(description = "用户名", example = "traveler01", minLength = 3, maxLength = 50,
      requiredMode = Schema.RequiredMode.REQUIRED)
  private String username;

  /** 密码，6-100 个字符。 */
  @NotBlank(message = "密码不能为空")
  @Size(min = 6, max = 100, message = "密码长度为6-100个字符")
  @Schema(description = "密码", example = "secret123", minLength = 6, maxLength = 100,
      requiredMode = Schema.RequiredMode.REQUIRED, accessMode = Schema.AccessMode.WRITE_ONLY)
  private String password;
}
