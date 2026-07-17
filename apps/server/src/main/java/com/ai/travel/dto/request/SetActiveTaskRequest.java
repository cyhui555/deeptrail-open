package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 切换当前执行的任务版本请求。 */
@Data
@Schema(name = "SetActiveTaskRequest", description = "切换执行版本请求")
public class SetActiveTaskRequest {

  @NotBlank(message = "任务 ID 不能为空")
  @Schema(description = "要激活的任务 ID", requiredMode = Schema.RequiredMode.REQUIRED)
  private String taskId;
}
