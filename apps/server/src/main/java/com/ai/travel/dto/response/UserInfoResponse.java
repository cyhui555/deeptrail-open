package com.ai.travel.dto.response;

import com.ai.travel.enums.UserRole;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

/** 用户信息响应 DTO，/me 接口返回。 */
@Data
@Schema(description = "用户信息响应")
public class UserInfoResponse {

  /** 用户 ID。 */
  @Schema(description = "用户 ID", example = "1")
  private Long userId;

  /** 用户名。 */
  @Schema(description = "用户名", example = "traveler01")
  private String username;

  /** 用户角色。 */
  @Schema(description = "用户角色", example = "USER")
  private UserRole role;

  /** 账号是否启用。 */
  @Schema(description = "账号是否启用", example = "true")
  private boolean enabled;

  /** 手机号，可能为空。 */
  @Schema(description = "手机号", example = "1*********0")
  private String phone;

  /** 是否已绑定微信。 */
  @Schema(description = "是否已绑定微信", example = "false")
  private boolean wechatBound;

  /** 注册时间。 */
  @Schema(description = "注册时间", example = "2026-06-30T10:00:00")
  private LocalDateTime createdAt;
}
