package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.JourneyReviewRequest;
import com.ai.travel.dto.request.UpdateSummaryRequest;
import com.ai.travel.dto.response.JourneyReviewResponse;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.JourneyReview;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.DuplicateReviewException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.exception.ReviewNotFoundException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.JourneyReviewMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.service.TripPlanService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 旅程评价服务。
 *
 * <p>提供评价提交、AI 总结生成、总结编辑、报告查询等能力。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JourneyService {

  private final JourneyReviewMapper journeyReviewMapper;
  private final TripPlanMapper tripPlanMapper;
  private final TripPlanService tripPlanService;
  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;
  private final CheckinMediaMapper checkinMediaMapper;
  private final JourneyReviewAiService journeyReviewAiService;
  private final TrackService trackService;

  /**
   * 提交评价（评分 + 文字），异步生成 AI 总结。
   *
   * @param planId 清单 ID
   * @param request 评价请求
   * @param userId 用户 ID
   * @return 评价 ID
   */
  @Transactional
  public Long submitReview(String planId, JourneyReviewRequest request, Long userId) {
    TripPlan plan = tripPlanService.getPlanAndCheckPermission(planId);

    // 检查是否已存在评价
    Long count = journeyReviewMapper.selectCount(
        new LambdaQueryWrapper<JourneyReview>().eq(JourneyReview::getPlanId, planId));
    if (count > 0) {
      throw new DuplicateReviewException("该清单已提交评价，请使用更新接口");
    }

    JourneyReview review = new JourneyReview();
    review.setPlanId(planId);
    review.setUserId(userId);
    review.setRating(request.getRating());
    review.setUserComment(request.getComment());
    review.setAiSummaryStatus("PENDING");
    // 计算打卡完成率和轨迹总距离
    review.setPoiCoverage(calculatePoiCoverage(planId));
    review.setTotalDistanceMeters(trackService.calculateTotalDistance(planId));
    review.setCreatedAt(LocalDateTime.now());
    journeyReviewMapper.insert(review);

    // 异步生成 AI 总结
    CompletableFuture.runAsync(() -> {
      String summary = journeyReviewAiService.generateSummary(
          planId, request.getRating(), request.getComment());
      if (summary != null) {
        review.setAiSummary(summary);
        review.setAiSummaryStatus("SUCCESS");
      } else {
        review.setAiSummaryStatus("FAILED");
      }
      review.setUpdatedAt(LocalDateTime.now());
      journeyReviewMapper.updateById(review);
    });

    log.info("提交评价成功: planId={}, reviewId={}", planId, review.getId());
    return review.getId();
  }

  /**
   * 更新 AI 总结（用户编辑）。
   *
   * @param planId 清单 ID
   * @param request 更新请求
   * @param userId 用户 ID
   */
  @Transactional
  public void updateSummary(String planId, UpdateSummaryRequest request, Long userId) {
    JourneyReview review = journeyReviewMapper.selectOne(
        new LambdaQueryWrapper<JourneyReview>().eq(JourneyReview::getPlanId, planId));
    if (review == null) {
      throw new ReviewNotFoundException("评价不存在: planId=" + planId);
    }
    if (!review.getUserId().equals(userId)) {
      throw new ForbiddenException("无权修改他人评价");
    }
    review.setAiSummary(request.getSummary());
    review.setSummaryEdited(true);
    review.setAiSummaryStatus("MANUAL");
    review.setUpdatedAt(LocalDateTime.now());
    journeyReviewMapper.updateById(review);
    log.info("更新评价总结: planId={}", planId);
  }

  /**
   * 查询评价详情。
   *
   * @param planId 清单 ID
   * @param userId 用户 ID
   * @return 评价响应
   */
  public JourneyReviewResponse getReview(String planId, Long userId) {
    JourneyReview review = journeyReviewMapper.selectOne(
        new LambdaQueryWrapper<JourneyReview>().eq(JourneyReview::getPlanId, planId));
    if (review == null) {
      return null;
    }
    if (!review.getUserId().equals(userId)) {
      throw new ForbiddenException("无权查看他人评价");
    }
    return toResponse(review);
  }

  /**
   * 计算打卡完成率。
   *
   * @param planId 清单 ID
   * @return 完成率字符串，如 "8/10"
   */
  private String calculatePoiCoverage(String planId) {
    LambdaQueryWrapper<CheckinTask> taskWrapper = new LambdaQueryWrapper<>();
    taskWrapper.eq(CheckinTask::getPlanId, planId);
    List<CheckinTask> tasks = checkinTaskMapper.selectList(taskWrapper);
    int totalPoi = tasks.stream()
        .mapToInt(t -> t.getTotalPoi() != null ? t.getTotalPoi() : 0).sum();
    int completedPoi = tasks.stream()
        .mapToInt(t -> t.getCompletedPoi() != null ? t.getCompletedPoi() : 0).sum();
    return completedPoi + "/" + totalPoi;
  }

  private JourneyReviewResponse toResponse(JourneyReview review) {
    JourneyReviewResponse resp = new JourneyReviewResponse();
    resp.setId(review.getId());
    resp.setPlanId(review.getPlanId());
    // 查询清单标题和目的地
    TripPlan plan = tripPlanMapper.selectById(review.getPlanId());
    if (plan != null) {
      resp.setPlanTitle(plan.getTitle());
      resp.setDestination(plan.getDestination());
    }
    resp.setRating(review.getRating());
    resp.setUserComment(review.getUserComment());
    resp.setAiSummary(review.getAiSummary());
    resp.setSummaryEdited(review.getSummaryEdited());
    resp.setPoiCoverage(review.getPoiCoverage());
    resp.setTotalDistanceMeters(review.getTotalDistanceMeters());
    resp.setCreatedAt(review.getCreatedAt());
    return resp;
  }
}
