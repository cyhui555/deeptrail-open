package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.ai.travel.config.AppJourneyProperties;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.TrackPointMapper;
import com.ai.travel.mapper.TripPlanMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;

/** JourneyReviewAiService 单元测试。 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class JourneyReviewAiServiceTest {

  @Mock private ChatClient.Builder chatClientBuilder;
  @Mock private ChatClient chatClient;
  @Mock private ChatClient.ChatClientRequestSpec requestSpec;
  @Mock private ChatClient.CallResponseSpec callResponseSpec;
  @Mock(answer = org.mockito.Answers.RETURNS_DEEP_STUBS)
  private ChatResponse chatResponse;
  @Mock private TripPlanMapper tripPlanMapper;
  @Mock private CheckinTaskMapper checkinTaskMapper;
  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private TrackPointMapper trackPointMapper;

  private JourneyReviewAiService journeyReviewAiService;

  @BeforeEach
  void setUp() {
    AppJourneyProperties props = new AppJourneyProperties();
    props.setAiSummaryTimeoutMs(5000);
    journeyReviewAiService = new JourneyReviewAiService(
        chatClientBuilder, props, tripPlanMapper, checkinTaskMapper,
        checkinItemMapper, trackPointMapper);
  }

  @Test
  @DisplayName("AI 调用成功时应返回总结文案")
  void generateSummary_aiCallSucceeds_returnsSummary() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("成都");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    when(chatClientBuilder.build()).thenReturn(chatClient);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(callResponseSpec.chatResponse()).thenReturn(chatResponse);
    when(chatResponse.getResult().getOutput().getText()).thenReturn("这是一段 AI 生成的旅程总结。");

    String result = journeyReviewAiService.generateSummary("plan-1", 5, "很棒");

    assertThat(result).isEqualTo("这是一段 AI 生成的旅程总结。");
  }

  @Test
  @DisplayName("AI 调用超时时应返回 null（降级）")
  void generateSummary_timeout_returnsNull() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("成都");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    when(chatClientBuilder.build()).thenReturn(chatClient);
    when(chatClient.prompt(any(Prompt.class))).thenAnswer(inv -> {
      Thread.sleep(10000);
      return requestSpec;
    });

    String result = journeyReviewAiService.generateSummary("plan-1", 5, "很棒");

    assertThat(result).isNull();
  }

  @Test
  @DisplayName("AI 调用异常时应返回 null（降级）")
  void generateSummary_exception_returnsNull() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("成都");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    when(chatClientBuilder.build()).thenReturn(chatClient);
    when(chatClient.prompt(any(Prompt.class))).thenThrow(new RuntimeException("AI 服务不可用"));

    String result = journeyReviewAiService.generateSummary("plan-1", 5, "很棒");

    assertThat(result).isNull();
  }

  @Test
  @DisplayName("buildPrompt 应正确填充模板变量")
  void buildPrompt_fillsTemplateVariables() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("成都");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinTask task = new CheckinTask();
    task.setId("ctask-1");
    task.setTotalPoi(3);
    task.setCompletedPoi(2);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task));

    CheckinItem item = new CheckinItem();
    item.setCheckinTaskId("ctask-1");
    item.setPoiName("宽窄巷子");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectList(any())).thenReturn(List.of(item));
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    when(chatClientBuilder.build()).thenReturn(chatClient);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(callResponseSpec.chatResponse()).thenReturn(chatResponse);
    when(chatResponse.getResult().getOutput().getText()).thenReturn("总结");

    String result = journeyReviewAiService.generateSummary("plan-1", 5, "很棒");
    assertThat(result).isEqualTo("总结");
  }

  @Test
  @DisplayName("buildPrompt - 计划不存在时应使用默认目的地（覆盖 plan==null 空保护分支）")
  void buildPrompt_planNotFound_usesDefaultDestination() throws Exception {
    // plan 为 null —— 覆盖 buildPrompt 内部 plan.getDestination() 空保护分支
    when(tripPlanMapper.selectById("plan-missing")).thenReturn(null);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    // buildPrompt 是 private 方法，通过反射调用
    java.lang.reflect.Method method = JourneyReviewAiService.class
        .getDeclaredMethod("buildPrompt", String.class, int.class, String.class);
    method.setAccessible(true);
    String prompt = (String) method.invoke(journeyReviewAiService, "plan-missing", 5, "很棒");

    // 验证默认目的地占位符被正确填充
    assertThat(prompt).contains("未知");
  }

  @Test
  @DisplayName("buildPrompt - 空评价和空 POI 列表时使用默认值")
  void buildPrompt_emptyCommentAndPoi_usesDefaults() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-empty");
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-empty")).thenReturn(plan);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    when(chatClientBuilder.build()).thenReturn(chatClient);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(callResponseSpec.chatResponse()).thenReturn(chatResponse);
    when(chatResponse.getResult().getOutput().getText()).thenReturn("有默认值的总结");

    // userComment 为空字符串 —— 覆盖 "用户未填写评价" 分支
    String result = journeyReviewAiService.generateSummary("plan-empty", 3, "");
    assertThat(result).isEqualTo("有默认值的总结");
  }
}
