package com.ai.travel.dto.response;

import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import java.time.LocalDateTime;
import lombok.Data;

/** 任务列表项摘要，不含结果字段，避免列表接口传输大量数据。 */
@Data
public class TaskSummaryResponse {

  private String taskId;
  private TaskType type;
  private TaskStatus status;
  private LocalDateTime submittedAt;
  private LocalDateTime startedAt;
  private LocalDateTime completedAt;
  private String errorMessage;
  /** 任务内容摘要，从 requestJson 提取。 */
  private String summary;
}
