package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 管理员分配普通用户账号请求。 */
@Data
@Schema(description = "管理员创建用户请求")
public class AdminCreateUserRequest {

  /** 用户名，3-50 个字符。 */
  @NotBlank(message = "用户名不能为空")
  @Size(min = 3, max = 50, message = "用户名长度为3-50个字符")
  private String username;

  /** 初始密码，6-100 个字符。 */
  @NotBlank(message = "密码不能为空")
  @Size(min = 6, max = 100, message = "密码长度为6-100个字符")
  @Schema(accessMode = Schema.AccessMode.WRITE_ONLY)
  private String password;
}
