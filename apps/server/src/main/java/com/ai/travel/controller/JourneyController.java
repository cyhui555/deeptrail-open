package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.JourneyReviewRequest;
import com.ai.travel.dto.request.UpdateSummaryRequest;
import com.ai.travel.dto.response.JourneyReviewResponse;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.JourneyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 旅程评价控制器。
 *
 * <p>提供评价提交、AI 总结编辑、报告查询等接口。
 */
@Tag(name = "旅程评价", description = "旅程评价与 AI 总结")
@RestController
@RequestMapping("/api/trips")
@RequiredArgsConstructor
public class JourneyController {

  private final JourneyService journeyService;

  /**
   * 提交旅程评价。
   *
   * @param planId 清单 ID
   * @param request 评价请求
   * @return 评价 ID
   */
  @Operation(summary = "提交评价",
      responses = {
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "200", description = "成功"),
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "404", description = "清单不存在"),
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "409", description = "评价已存在")
      })
  @PostMapping("/{planId}/review")
  public ApiResponse<Long> submitReview(
      @PathVariable("planId") String planId,
      @Valid @RequestBody JourneyReviewRequest request) {
    Long userId = UserContext.getUserId();
    Long reviewId = journeyService.submitReview(planId, request, userId);
    return ApiResponse.ok(reviewId);
  }

  /**
   * 更新 AI 总结。
   *
   * @param planId 清单 ID
   * @param request 更新请求
   */
  @Operation(summary = "更新 AI 总结",
      responses = {
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "200", description = "成功"),
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "404", description = "评价不存在"),
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "403", description = "无权修改")
      })
  @PutMapping("/{planId}/review/summary")
  public ApiResponse<Void> updateSummary(
      @PathVariable("planId") String planId,
      @Valid @RequestBody UpdateSummaryRequest request) {
    Long userId = UserContext.getUserId();
    journeyService.updateSummary(planId, request, userId);
    return ApiResponse.ok();
  }

  /**
   * 查询评价详情。
   *
   * @param planId 清单 ID
   * @return 评价响应（可能为 null）
   */
  @Operation(summary = "查询评价",
      responses = {
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "200", description = "成功"),
          @io.swagger.v3.oas.annotations.responses.ApiResponse(
              responseCode = "403", description = "无权查看")
      })
  @GetMapping("/{planId}/review")
  public ApiResponse<JourneyReviewResponse> getReview(
      @PathVariable("planId") String planId) {
    Long userId = UserContext.getUserId();
    return ApiResponse.ok(journeyService.getReview(planId, userId));
  }
}
