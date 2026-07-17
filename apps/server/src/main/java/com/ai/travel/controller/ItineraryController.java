package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.dto.response.TaskSubmitResponse;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.service.ItineraryTaskService;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 行程相关 REST 接口。
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ItineraryController {

  private final ItineraryTaskService taskService;

  @GetMapping("/health")
  public ApiResponse<String> health() {
    return ApiResponse.ok("服务正常运行");
  }

  /** 提交生成行程任务，异步处理，立即返回 taskId。 */
  @PostMapping("/itineraries/generate")
  public ApiResponse<TaskSubmitResponse> generate(
      @Valid @RequestBody GenerateItineraryRequest request) {
    String taskId = taskService.submitGenerateTask(request);
    return ApiResponse.ok(new TaskSubmitResponse(taskId, TaskStatus.PENDING, LocalDateTime.now()));
  }

  /** 提交优化行程任务，异步处理，立即返回 taskId。 */
  @PostMapping("/itineraries/optimize")
  public ApiResponse<TaskSubmitResponse> optimize(
      @Valid @RequestBody OptimizeItineraryRequest request) {
    String taskId = taskService.submitOptimizeTask(request);
    return ApiResponse.ok(new TaskSubmitResponse(taskId, TaskStatus.PENDING, LocalDateTime.now()));
  }

  /** 提交小红书链接生成行程任务，异步处理，立即返回 taskId。 */
  @PostMapping("/itineraries/from-xiaohongshu")
  public ApiResponse<TaskSubmitResponse> fromXiaohongshu(
      @Valid @RequestBody XiaohongshuItineraryRequest request) {
    String taskId = taskService.submitXiaohongshuTask(request);
    return ApiResponse.ok(new TaskSubmitResponse(taskId, TaskStatus.PENDING, LocalDateTime.now()));
  }
}
