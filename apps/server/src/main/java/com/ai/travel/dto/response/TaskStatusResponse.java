package com.ai.travel.dto.response;

import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import java.time.LocalDateTime;
import lombok.Data;

/** 任务状态查询响应，包含元信息、状态推进时间戳，COMPLETED 时附带结果。 */
@Data
public class TaskStatusResponse {

  private String taskId;
  private TaskType type;
  private TaskStatus status;
  private LocalDateTime submittedAt;
  private LocalDateTime startedAt;
  private LocalDateTime completedAt;
  private Object result;
  private String errorMessage;
  private String summary;
  private String parsedContent;
  private Integer tokenUsed;
  private Integer durationMs;
  /** 请求体 JSON，用于前端提取目的地、天数等信息构造标题。 */
  private String requestJson;
}
