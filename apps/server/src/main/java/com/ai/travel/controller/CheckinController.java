package com.ai.travel.controller;

import com.ai.travel.dto.request.AddCustomItemRequest;
import com.ai.travel.dto.request.CheckinRequest;
import com.ai.travel.dto.request.EditCustomItemRequest;
import com.ai.travel.dto.request.UpdateCoordinatesRequest;
import com.ai.travel.dto.response.CheckinItemResponse;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.dto.response.MediaUploadResponse;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.CheckinMediaService;
import com.ai.travel.service.CheckinTaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 打卡操作 REST 接口。
 */
@Tag(name = "行程打卡", description = "打卡操作 API")
@RestController
@RequestMapping("/api/itineraries/checkin")
@RequiredArgsConstructor
public class CheckinController {

  private final CheckinTaskService checkinTaskService;
  private final CheckinMediaService checkinMediaService;

  /**
   * 获取单日打卡详情。
   *
   * @param checkinTaskId 打卡任务 ID
   * @return 打卡任务响应，含 POI 列表和状态
   */
  @Operation(summary = "获取单日打卡详情", description = "获取指定打卡任务的 POI 列表和状态")
  @GetMapping("/tasks/{checkinTaskId}")
  public com.ai.travel.dto.ApiResponse<CheckinTaskResponse> getCheckinTaskDetail(
      @PathVariable String checkinTaskId) {
    CheckinTaskResponse task = checkinTaskService.getCheckinTaskById(checkinTaskId);
    if (task == null) {
      throw new RuntimeException("打卡任务不存在: " + checkinTaskId);
    }
    return com.ai.travel.dto.ApiResponse.ok(task);
  }

  /**
   * 打卡。
   *
   * @param itemId 打卡项 ID
   * @param request 打卡请求，含 GPS 经纬度和笔记
   * @return 空响应
   */
  @Operation(summary = "打卡", description = "执行打卡操作（GPS + 笔记）")
  @PostMapping("/items/{itemId}")
  public com.ai.travel.dto.ApiResponse<Void> checkin(@PathVariable Long itemId,
                                   @Valid @RequestBody CheckinRequest request) {
    Long userId = UserContext.getUserId();
    checkinTaskService.checkin(itemId, request, userId);
    return com.ai.travel.dto.ApiResponse.ok();
  }

  /**
   * 撤销打卡。
   *
   * @param itemId 打卡项 ID
   * @return 空响应
   */
  @Operation(summary = "撤销打卡", description = "已打卡回退为未打卡，媒体标记为历史")
  @PostMapping("/items/{itemId}/undo")
  public com.ai.travel.dto.ApiResponse<Void> undoCheckin(@PathVariable Long itemId) {
    Long userId = UserContext.getUserId();
    checkinTaskService.undoCheckin(itemId, userId);
    return com.ai.travel.dto.ApiResponse.ok();
  }

  /**
   * 废弃打卡项。
   *
   * @param itemId 打卡项 ID
   * @return 空响应
   * @throws IllegalStateException 已打卡项不可直接废弃
   */
  @Operation(summary = "废弃打卡项",
      description = "将 PENDING 打卡项标记为 ABANDONED；已打卡项需先撤销",
      responses = {
          @ApiResponse(responseCode = "200", description = "操作成功"),
          @ApiResponse(responseCode = "400", description = "已打卡项不可直接废弃"),
          @ApiResponse(responseCode = "404", description = "打卡项不存在")
      })
  @PostMapping("/items/{itemId}/abandon")
  public com.ai.travel.dto.ApiResponse<Void> abandonCheckin(@PathVariable Long itemId) {
    Long userId = UserContext.getUserId();
    checkinTaskService.abandonCheckin(itemId, userId);
    return com.ai.travel.dto.ApiResponse.ok();
  }

  /**
   * 修正打卡项坐标。
   *
   * @param itemId 打卡项 ID
   * @param request 含 lat/lng
   * @return 空响应
   */
  @Operation(summary = "修正打卡项坐标",
      description = "用户拖动地图标记点修正 POI 坐标",
      responses = {
          @ApiResponse(responseCode = "200", description = "修正成功"),
          @ApiResponse(responseCode = "400", description = "坐标值无效"),
          @ApiResponse(responseCode = "404", description = "打卡项不存在"),
          @ApiResponse(responseCode = "403", description = "无权操作")
      })
  @PutMapping("/items/{itemId}/coordinates")
  public com.ai.travel.dto.ApiResponse<Void> updateCoordinates(@PathVariable Long itemId,
                                       @Valid @RequestBody UpdateCoordinatesRequest request) {
    Long userId = UserContext.getUserId();
    checkinTaskService.updateItemCoordinates(itemId, request.getLat(), request.getLng(), userId);
    return com.ai.travel.dto.ApiResponse.ok();
  }

  /**
   * 获取打卡项详情，含媒体列表。
   *
   * @param itemId 打卡项 ID
   * @return 打卡项详情
   */
  @Operation(summary = "获取打卡项详情", description = "含媒体列表")
  @GetMapping("/items/{itemId}")
  public com.ai.travel.dto.ApiResponse<CheckinItemResponse> getItemDetail(
      @PathVariable Long itemId) {
    Long userId = UserContext.getUserId();
    return com.ai.travel.dto.ApiResponse.ok(
        checkinTaskService.getCheckinItemDetail(itemId, userId));
  }

  /**
   * 添加自定义行程点。
   *
   * @param planId 行程清单 ID
   * @param taskId 打卡任务 ID
   * @param request 自定义行程点请求
   * @return 新增打卡项 ID
   */
  @Operation(summary = "添加自定义行程点",
      description = "用户将个人发现的兴趣点加入指定天的打卡列表",
      responses = {
          @ApiResponse(responseCode = "200", description = "新增打卡项 ID"),
          @ApiResponse(responseCode = "404", description = "打卡任务不存在"),
          @ApiResponse(responseCode = "400", description = "参数校验失败")
      })
  @PostMapping("/trips/{planId}/checkin/{taskId}/custom-item")
  public com.ai.travel.dto.ApiResponse<Long> addCustomItem(
      @PathVariable String planId,
      @PathVariable String taskId,
      @Valid @RequestBody AddCustomItemRequest request) {
    Long userId = UserContext.getUserId();
    // 校验任务属于当前清单
    checkinTaskService.getCheckinTasks(planId).stream()
        .filter(t -> t.getId().equals(taskId))
        .findFirst()
        .orElseThrow(() -> new RuntimeException("打卡任务不存在于当前清单"));
    Long itemId = checkinTaskService.addCustomItem(taskId, request, userId);
    return com.ai.travel.dto.ApiResponse.ok(itemId);
  }

  /**
   * 编辑自定义行程点。
   *
   * @param itemId 打卡项 ID
   * @param request 编辑请求（名称/经纬度/链接/笔记等）
   * @return 空响应
   */
  @Operation(summary = "编辑自定义行程点",
      description = "编辑已添加的自定义行程点（isCustom=true + PENDING 状态）",
      responses = {
          @ApiResponse(responseCode = "200", description = "操作成功"),
          @ApiResponse(responseCode = "400", description = "参数校验失败（名称空白 / 经纬度无效）"),
          @ApiResponse(responseCode = "403", description = "无权操作"),
          @ApiResponse(responseCode = "404", description = "打卡项不存在"),
          @ApiResponse(responseCode = "409", description = "非 PENDING 状态 或 非自定义行程点")
      })
  @PutMapping("/items/{itemId}")
  public com.ai.travel.dto.ApiResponse<Void> editCustomItem(@PathVariable Long itemId,
                                   @Valid @RequestBody EditCustomItemRequest request) {
    Long userId = UserContext.getUserId();
    checkinTaskService.editCustomItem(itemId, userId, request);
    return com.ai.travel.dto.ApiResponse.ok();
  }

  /**
   * 上传打卡媒体（照片/视频）。
   *
   * @param itemId 打卡项 ID
   * @param file 上传文件
   * @return 媒体上传响应，含访问 URL
   */
  @Operation(summary = "上传打卡媒体", description = "上传照片/视频到指定打卡项")
  @PostMapping("/items/{itemId}/media")
  public com.ai.travel.dto.ApiResponse<MediaUploadResponse> uploadMedia(
      @PathVariable Long itemId,
      @RequestParam("file") MultipartFile file) {
    Long userId = UserContext.getUserId();
    return com.ai.travel.dto.ApiResponse.ok(checkinMediaService.upload(itemId, userId, file));
  }
}
