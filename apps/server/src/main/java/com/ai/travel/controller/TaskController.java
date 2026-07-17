package com.ai.travel.controller;

import com.ai.travel.dto.request.SaveNodeRevisionRequest;
import com.ai.travel.dto.response.NodeRevisionResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TaskStatusResponse;
import com.ai.travel.dto.response.TaskSummaryResponse;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.service.ItineraryTaskService;
import com.ai.travel.service.TaskStatusStreamService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** 任务状态查询与取消 REST 接口。 */
@Tag(name = "行程任务", description = "任务查询、取消、节点修正")
@RestController
@RequestMapping("/api/itineraries/tasks")
@RequiredArgsConstructor
@Validated
public class TaskController {

  private final ItineraryTaskService taskService;
  private final TaskStatusStreamService taskStatusStreamService;

  /** 分页获取任务列表，可按状态过滤。 */
  @Operation(summary = "分页获取任务列表")
  @ApiResponse(responseCode = "200", description = "成功")
  @GetMapping
  public com.ai.travel.dto.ApiResponse<PageResult<TaskSummaryResponse>> listTasks(
      @RequestParam(required = false) TaskStatus status,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "10") @Min(1) @Max(100) int size) {
    return com.ai.travel.dto.ApiResponse.ok(taskService.listTasks(status, page, size));
  }

  /** 获取完整任务状态，SSE 客户端在状态事件到达后调用。 */
  @Operation(summary = "获取任务状态")
  @ApiResponse(responseCode = "200", description = "成功")
  @GetMapping("/{taskId}")
  public com.ai.travel.dto.ApiResponse<TaskStatusResponse> getStatus(
      @PathVariable String taskId) {
    return com.ai.travel.dto.ApiResponse.ok(taskService.getStatus(taskId));
  }

  /** 订阅任务状态变化；断线客户端可继续使用详情接口退避轮询。 */
  @Operation(summary = "订阅任务状态变化")
  @GetMapping(value = "/{taskId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter streamStatus(@PathVariable String taskId) {
    return taskStatusStreamService.open(taskId);
  }

  /** 取消尚未完成的任务。 */
  @Operation(summary = "取消任务")
  @ApiResponse(responseCode = "200", description = "成功")
  @DeleteMapping("/{taskId}")
  public com.ai.travel.dto.ApiResponse<Void> cancel(@PathVariable String taskId) {
    taskService.cancel(taskId);
    return com.ai.travel.dto.ApiResponse.ok();
  }

  /** 列出任务下所有节点修正。 */
  @Operation(summary = "列出节点修正")
  @ApiResponse(responseCode = "200", description = "成功")
  @GetMapping("/{taskId}/node-revisions")
  public com.ai.travel.dto.ApiResponse<List<NodeRevisionResponse>> listNodeRevisions(
      @PathVariable String taskId) {
    return com.ai.travel.dto.ApiResponse.ok(taskService.listNodeRevisions(taskId));
  }

  /** 保存（UPSERT）节点修正。 */
  @Operation(summary = "保存节点修正")
  @ApiResponse(responseCode = "200", description = "成功")
  @PutMapping("/{taskId}/node-revisions")
  public com.ai.travel.dto.ApiResponse<NodeRevisionResponse> saveNodeRevision(
      @PathVariable String taskId,
      @Valid @RequestBody SaveNodeRevisionRequest req) {
    return com.ai.travel.dto.ApiResponse.ok(taskService.saveNodeRevision(taskId, req));
  }

  /** 删除节点修正。 */
  @Operation(summary = "删除节点修正")
  @ApiResponse(responseCode = "200", description = "成功")
  @DeleteMapping("/{taskId}/node-revisions/{dayIndex}/{itemIndex}")
  public com.ai.travel.dto.ApiResponse<Void> deleteNodeRevision(
      @PathVariable String taskId,
      @PathVariable int dayIndex,
      @PathVariable int itemIndex) {
    taskService.deleteNodeRevision(taskId, dayIndex, itemIndex);
    return com.ai.travel.dto.ApiResponse.ok();
  }
}
