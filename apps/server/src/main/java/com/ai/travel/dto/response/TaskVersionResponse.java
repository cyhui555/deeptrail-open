package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

/** 关联的任务版本信息响应。 */
@Data
@Schema(name = "TaskVersionResponse", description = "任务版本信息")
public class TaskVersionResponse {

  @Schema(description = "关联记录 ID")
  private Long refId;

  @Schema(description = "任务 ID")
  private String taskId;

  @Schema(description = "任务类型")
  private String taskType;

  @Schema(description = "是否为当前执行版本")
  private Boolean isActive;

  @Schema(description = "任务摘要")
  private String summary;

  @Schema(description = "关联时间")
  private LocalDateTime addedAt;
}
