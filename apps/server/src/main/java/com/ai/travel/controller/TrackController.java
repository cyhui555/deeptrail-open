package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.TrackPointUploadRequest;
import com.ai.travel.dto.response.TrackPointResponse;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.TrackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 轨迹 REST 接口。
 */
@Tag(name = "轨迹", description = "轨迹记录 API")
@RestController
@RequestMapping("/api/trips/{planId}/track")
@RequiredArgsConstructor
public class TrackController {

  private final TrackService trackService;

  /**
   * 批量上传轨迹点。
   *
   * @param planId 清单 ID
   * @param request 轨迹点上传请求，accuracy &gt; 50m 的点会被过滤
   * @return 实际保存的轨迹点数量
   */
  @Operation(summary = "批量上传轨迹点", description = "过滤 accuracy > 50m 的点")
  @PostMapping("/points")
  public ApiResponse<Integer> uploadPoints(
      @PathVariable String planId,
      @Valid @RequestBody TrackPointUploadRequest request) {
    Long userId = UserContext.getUserId();
    int saved = trackService.batchSavePoints(planId, request.getPoints(), userId);
    return ApiResponse.ok(saved);
  }

  /**
   * 查询轨迹点列表。
   *
   * @param planId 清单 ID
   * @return 按 recorded_at 排序的轨迹点列表
   */
  @Operation(summary = "查询轨迹点列表", description = "按 recorded_at 排序")
  @GetMapping("/points")
  public ApiResponse<List<TrackPointResponse>> getPoints(@PathVariable String planId) {
    Long userId = UserContext.getUserId();
    return ApiResponse.ok(trackService.getTrackPoints(planId, userId));
  }
}
