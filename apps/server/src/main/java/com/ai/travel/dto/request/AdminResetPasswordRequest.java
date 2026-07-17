package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 管理员重置普通用户密码请求。 */
@Data
@Schema(description = "管理员重置用户密码请求")
public class AdminResetPasswordRequest {

  /** 新密码，6-100 个字符。 */
  @NotBlank(message = "新密码不能为空")
  @Size(min = 6, max = 100, message = "密码长度为6-100个字符")
  @Schema(accessMode = Schema.AccessMode.WRITE_ONLY)
  private String password;
}
