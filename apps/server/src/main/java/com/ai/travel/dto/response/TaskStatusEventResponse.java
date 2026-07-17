package com.ai.travel.dto.response;

import com.ai.travel.enums.TaskStatus;

/** SSE 任务状态事件，只携带驱动客户端刷新所需的最小字段。 */
public record TaskStatusEventResponse(String taskId, TaskStatus status, boolean terminal) {
}
