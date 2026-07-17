package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** 管理员启用或停用普通用户请求。 */
@Data
@Schema(description = "管理员更新用户状态请求")
public class AdminUpdateUserStatusRequest {

  /** 更新后的启用状态。 */
  @NotNull(message = "启用状态不能为空")
  private Boolean enabled;
}
