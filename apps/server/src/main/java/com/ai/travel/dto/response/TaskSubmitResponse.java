package com.ai.travel.dto.response;

import com.ai.travel.enums.TaskStatus;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;

/** 任务提交响应，POST 后立即返回，状态固定为 PENDING。 */
@Data
@AllArgsConstructor
public class TaskSubmitResponse {

  private String taskId;
  private TaskStatus status;
  private LocalDateTime submittedAt;
}
