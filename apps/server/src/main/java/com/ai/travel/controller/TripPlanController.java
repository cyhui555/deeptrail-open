package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.AddTaskToPlanRequest;
import com.ai.travel.dto.request.CreateTripPlanRequest;
import com.ai.travel.dto.request.SetActiveTaskRequest;
import com.ai.travel.dto.request.StartCheckinRequest;
import com.ai.travel.dto.request.UpdateTripPlanRequest;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TripPlanResponse;
import com.ai.travel.dto.response.TripPlanSummaryResponse;
import com.ai.travel.service.TripPlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 行程清单 REST 接口。
 */
@Tag(name = "行程清单", description = "行程清单管理 API")
@RestController
@RequestMapping("/api/trips")
@RequiredArgsConstructor
@Validated
public class TripPlanController {

  private final TripPlanService tripPlanService;

  @Operation(summary = "创建行程清单", description = "创建清单并关联首个生成任务")
  @PostMapping
  public ApiResponse<String> create(@Valid @RequestBody CreateTripPlanRequest request) {
    String planId = tripPlanService.createTripPlan(request);
    return ApiResponse.ok(planId);
  }

  @Operation(summary = "获取我的行程清单列表", description = "按状态分组、分页查询，排除已删除")
  @GetMapping
  public ApiResponse<PageResult<TripPlanSummaryResponse>> list(
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
    return ApiResponse.ok(tripPlanService.listUserTrips(status, page, size));
  }

  @Operation(summary = "获取行程清单详情", description = "含关联任务列表和打卡进度")
  @GetMapping("/{planId}")
  public ApiResponse<TripPlanResponse> get(@PathVariable String planId) {
    return ApiResponse.ok(tripPlanService.getTripPlan(planId));
  }

  @Operation(summary = "更新行程清单", description = "更新标题/日期/备注/状态")
  @PutMapping("/{planId}")
  public ApiResponse<Void> update(@PathVariable String planId,
                                  @Valid @RequestBody UpdateTripPlanRequest request) {
    tripPlanService.updateTripPlan(planId, request);
    return ApiResponse.ok();
  }

  @Operation(summary = "删除行程清单", description = "软删除，设置 deleted_at")
  @DeleteMapping("/{planId}")
  public ApiResponse<Void> delete(@PathVariable String planId) {
    tripPlanService.softDeletePlan(planId);
    return ApiResponse.ok();
  }

  @Operation(summary = "关联任务到清单", description = "将新的生成任务关联到清单")
  @PostMapping("/{planId}/tasks")
  public ApiResponse<Void> addTask(@PathVariable String planId,
                                   @Valid @RequestBody AddTaskToPlanRequest request) {
    tripPlanService.addTaskToPlan(planId, request);
    return ApiResponse.ok();
  }

  @Operation(summary = "切换执行版本", description = "切换当前执行的任务版本")
  @PutMapping("/{planId}/active-task")
  public ApiResponse<Void> setActiveTask(@PathVariable String planId,
                                         @Valid @RequestBody SetActiveTaskRequest request) {
    tripPlanService.setActiveTask(planId, request);
    return ApiResponse.ok();
  }

  /**
   * 开始打卡。
   *
   * @param planId 行程清单 ID
   * @param request 可选的起始天数
   * @return 首个打卡任务 ID
   */
  @Operation(summary = "开始打卡", description = "将当前执行版本按天拆分为打卡任务")
  @PostMapping("/{planId}/checkin/start")
  public ApiResponse<String> startCheckin(@PathVariable String planId,
      @RequestBody(required = false) StartCheckinRequest request) {
    Integer startDay = request != null ? request.getStartDay() : null;
    String checkinTaskId = tripPlanService.startCheckin(planId, startDay);
    return ApiResponse.ok(checkinTaskId);
  }

  @Operation(summary = "获取打卡任务列表", description = "按天分组获取打卡任务")
  @GetMapping("/{planId}/checkin")
  public ApiResponse<List<CheckinTaskResponse>> getCheckinTasks(@PathVariable String planId) {
    return ApiResponse.ok(tripPlanService.getCheckinTasks(planId));
  }

  @Operation(summary = "回填缺失坐标的打卡项",
      description = "对清单下 (0, 0) / null 坐标的打卡项触发地理编码反查，修复历史行程伪坐标")
  @PostMapping("/{planId}/checkin/backfill-coordinates")
  public ApiResponse<Integer> backfillCoordinates(@PathVariable String planId) {
    return ApiResponse.ok(tripPlanService.backfillMissingCoordinates(planId));
  }

  @Operation(summary = "强制重查所有打卡项坐标（清洗同名跨城脏坐标）",
      description = "清空已有坐标后重新地理编码反查，"
          + "依赖 province/destination 同城校验清洗重庆等同名错误坐标；"
          + "适用于青岛/伊犁等行程出现重庆坐标的场景")
  @PostMapping("/{planId}/checkin/force-refill-coordinates")
  public ApiResponse<Integer> forceRefillCoordinates(@PathVariable String planId) {
    return ApiResponse.ok(tripPlanService.forceRefillCoordinates(planId));
  }
}
