package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 关联新的生成任务到清单请求。 */
@Data
@Schema(name = "AddTaskToPlanRequest", description = "关联任务到清单请求")
public class AddTaskToPlanRequest {

  @NotBlank(message = "任务 ID 不能为空")
  @Schema(description = "要关联的生成任务 ID", requiredMode = Schema.RequiredMode.REQUIRED)
  private String taskId;
}
