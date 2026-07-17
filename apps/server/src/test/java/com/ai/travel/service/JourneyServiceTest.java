package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.JourneyReviewRequest;
import com.ai.travel.dto.request.UpdateSummaryRequest;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.JourneyReview;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.DuplicateReviewException;
import com.ai.travel.exception.ReviewNotFoundException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.JourneyReviewMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** JourneyService 单元测试。 */
@ExtendWith(MockitoExtension.class)
class JourneyServiceTest {

  @Mock private JourneyReviewMapper journeyReviewMapper;
  @Mock private TripPlanMapper tripPlanMapper;
  @Mock private TripPlanService tripPlanService;
  @Mock private CheckinTaskMapper checkinTaskMapper;
  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private CheckinMediaMapper checkinMediaMapper;
  @Mock private JourneyReviewAiService journeyReviewAiService;
  @Mock private TrackService trackService;

  private JourneyService journeyService;

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    journeyService = new JourneyService(
        journeyReviewMapper, tripPlanMapper, tripPlanService,
        checkinTaskMapper, checkinItemMapper, checkinMediaMapper,
        journeyReviewAiService, trackService);
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("提交评价应持久化并触发 AI 总结")
  void submitReview_persistsAndTriggersAi() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    when(tripPlanService.getPlanAndCheckPermission("plan-1")).thenReturn(plan);
    when(journeyReviewMapper.selectCount(any())).thenReturn(0L);
    when(journeyReviewMapper.insert(any(JourneyReview.class))).thenAnswer(inv -> {
      inv.getArgument(0, JourneyReview.class).setId(1L);
      return 1;
    });
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(trackService.calculateTotalDistance("plan-1")).thenReturn(0);

    JourneyReviewRequest req = new JourneyReviewRequest();
    req.setRating(5);
    req.setComment("很棒");

    Long reviewId = journeyService.submitReview("plan-1", req, 1L);

    assertThat(reviewId).isNotNull();
    verify(journeyReviewMapper).insert(any(JourneyReview.class));
  }

  @Test
  @DisplayName("重复提交评价应抛出异常")
  void submitReview_duplicateReview_throwsException() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    when(tripPlanService.getPlanAndCheckPermission("plan-1")).thenReturn(plan);
    when(journeyReviewMapper.selectCount(any())).thenReturn(1L);

    JourneyReviewRequest req = new JourneyReviewRequest();
    req.setRating(5);

    assertThatThrownBy(() -> journeyService.submitReview("plan-1", req, 1L))
        .isInstanceOf(DuplicateReviewException.class);
  }

  @Test
  @DisplayName("更新 AI 总结应设置 summaryEdited=true")
  void updateSummary_setsEditedFlag() {
    JourneyReview review = new JourneyReview();
    review.setId(1L);
    review.setPlanId("plan-1");
    review.setUserId(1L);
    when(journeyReviewMapper.selectOne(any())).thenReturn(review);
    when(journeyReviewMapper.updateById(any(JourneyReview.class))).thenReturn(1);

    UpdateSummaryRequest req = new UpdateSummaryRequest();
    req.setSummary("编辑后的总结");

    journeyService.updateSummary("plan-1", req, 1L);

    verify(journeyReviewMapper).updateById(any(JourneyReview.class));
  }

  @Test
  @DisplayName("更新不存在的总结应抛出异常")
  void updateSummary_nonExistent_throwsException() {
    when(journeyReviewMapper.selectOne(any())).thenReturn(null);

    UpdateSummaryRequest req = new UpdateSummaryRequest();
    req.setSummary("test");

    assertThatThrownBy(() -> journeyService.updateSummary("plan-999", req, 1L))
        .isInstanceOf(ReviewNotFoundException.class);
  }

  @Test
  @DisplayName("查询不存在的评价应返回 null")
  void getReview_nonExistent_returnsNull() {
    when(journeyReviewMapper.selectOne(any())).thenReturn(null);

    var result = journeyService.getReview("plan-999", 1L);

    assertThat(result).isNull();
  }

  @Test
  @DisplayName("查询存在的评价应返回响应")
  void getReview_existing_returnsResponse() {
    JourneyReview review = new JourneyReview();
    review.setId(1L);
    review.setPlanId("plan-1");
    review.setUserId(1L);
    review.setRating(5);
    when(journeyReviewMapper.selectOne(any())).thenReturn(review);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setTitle("测试清单");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    var result = journeyService.getReview("plan-1", 1L);

    assertThat(result).isNotNull();
    assertThat(result.getRating()).isEqualTo(5);
    assertThat(result.getPlanTitle()).isEqualTo("测试清单");
  }
}
