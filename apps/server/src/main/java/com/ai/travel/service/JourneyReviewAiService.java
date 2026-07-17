package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.config.AppJourneyProperties;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.TrackPoint;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.TrackPointMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Service;

/**
 * 旅程评价 AI 服务。
 *
 * <p>构建 Prompt → 调用 ChatClient → 返回总结文案。
 * 支持超时降级（30s 超时后返回 null，前端展示纯用户自评）。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JourneyReviewAiService {

  private final ChatClient.Builder chatClientBuilder;
  private final AppJourneyProperties journeyProperties;
  private final TripPlanMapper tripPlanMapper;
  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinItemMapper checkinItemMapper;
  private final TrackPointMapper trackPointMapper;

  // Prompt 模板（懒加载）
  private volatile String promptTemplate;

  /**
   * 异步生成 AI 总结文案。
   *
   * @param planId 行程清单 ID
   * @param rating 用户评分
   * @param userComment 用户文字评价
   * @return AI 生成的总结文案，超时或失败时返回 null
   */
  public String generateSummary(String planId, int rating, String userComment) {
    try {
      String promptText = buildPrompt(planId, rating, userComment);

      // 异步调用，带超时
      CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
        try {
          ChatClient client = chatClientBuilder.build();
          var response = client.prompt(new Prompt(promptText)).call().chatResponse();
          return response.getResult().getOutput().getText();
        } catch (Exception e) {
          log.error("AI call failed: {}", e.getMessage(), e);
          return null;
        }
      });

      String summary = future.get(journeyProperties.getAiSummaryTimeoutMs(), TimeUnit.MILLISECONDS);
      if (StrUtil.isNotBlank(summary)) {
        log.info("AI summary generated for plan: {}", planId);
        return summary.trim();
      }
    } catch (TimeoutException e) {
      log.warn("AI summary generation timed out for plan: {}", planId);
    } catch (Exception e) {
      log.error("AI summary generation failed for plan: {}", e.getMessage(), e);
    }

    // 降级：返回 null，前端展示纯用户自评
    return null;
  }

  /**
   * 构建 AI Prompt。
   */
  private String buildPrompt(String planId, int rating, String userComment) {
    // 获取打卡数据
    LambdaQueryWrapper<CheckinTask> taskWrapper = new LambdaQueryWrapper<>();
    taskWrapper.eq(CheckinTask::getPlanId, planId);
    List<CheckinTask> tasks = checkinTaskMapper.selectList(taskWrapper);

    int totalPoi = tasks.stream()
        .mapToInt(t -> t.getTotalPoi() != null ? t.getTotalPoi() : 0)
        .sum();
    int completedPoi = tasks.stream()
        .mapToInt(t -> t.getCompletedPoi() != null ? t.getCompletedPoi() : 0)
        .sum();

    // 获取已打卡 POI 名称列表
    LambdaQueryWrapper<CheckinItem> itemWrapper = new LambdaQueryWrapper<>();
    itemWrapper.in(CheckinItem::getCheckinTaskId,
        tasks.stream().map(CheckinTask::getId).collect(Collectors.toList()))
        .eq(CheckinItem::getStatus, "CHECKED_IN");
    List<CheckinItem> checkedItems = checkinItemMapper.selectList(itemWrapper);
    String poiList = checkedItems.stream()
        .map(CheckinItem::getPoiName)
        .collect(Collectors.joining("、"));

    // 获取轨迹天数
    LambdaQueryWrapper<TrackPoint> trackWrapper = new LambdaQueryWrapper<>();
    trackWrapper.eq(TrackPoint::getPlanId, planId);
    List<TrackPoint> trackPoints = trackPointMapper.selectList(trackWrapper);
    long trackDays = trackPoints.stream()
        .map(t -> t.getRecordedAt().toLocalDate())
        .distinct()
        .count();

    // 填充模板
    TripPlan plan = tripPlanMapper.selectById(planId);
    String destination = (plan != null && StrUtil.isNotBlank(plan.getDestination()))
        ? plan.getDestination() : "未知";
    return getPromptTemplate()
        .replace("$destination$", destination)
        .replace("$days$", String.valueOf(tasks.size()))
        .replace("$poiCoverage$", completedPoi + "/" + totalPoi)
        .replace("$rating$", String.valueOf(rating))
        .replace("$userComment$",
            StrUtil.isNotBlank(userComment) ? userComment : "用户未填写评价")
        .replace("$trackDays$", String.valueOf(trackDays))
        .replace("$poiList$", StrUtil.isNotBlank(poiList) ? poiList : "无");
  }

  /**
   * 获取 Prompt 模板（懒加载）。
   */
  private String getPromptTemplate() {
    if (promptTemplate == null) {
      synchronized (this) {
        if (promptTemplate == null) {
          try {
            var resource = new org.springframework.core.io.ClassPathResource(
                "prompts/journey-summary.st");
            promptTemplate = org.springframework.util.StreamUtils.copyToString(
                resource.getInputStream(), java.nio.charset.StandardCharsets.UTF_8);
          } catch (Exception e) {
            log.error("Failed to load journey summary prompt template", e);
            promptTemplate = "请为$destination$的$days$天旅行生成总结，打卡完成率$poiCoverage$，评分$rating$星。";
          }
        }
      }
    }
    return promptTemplate;
  }
}
