package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

/** 加载并填充行程相关 Prompt 模板。 */
@Component
public class ItineraryPromptFactory {

  private final String generateTemplate;
  private final String optimizeTemplate;
  private final String xiaohongshuTemplate;

  /** 加载三类 Prompt 的单一事实源。 */
  public ItineraryPromptFactory(
      @Value("classpath:/prompts/generate-itinerary.st") Resource generateResource,
      @Value("classpath:/prompts/optimize-itinerary.st") Resource optimizeResource,
      @Value("classpath:/prompts/xiaohongshu-itinerary.st") Resource xiaohongshuResource)
      throws IOException {
    this.generateTemplate = read(generateResource);
    this.optimizeTemplate = read(optimizeResource);
    this.xiaohongshuTemplate = read(xiaohongshuResource);
  }

  /** 构建生成行程 Prompt。 */
  public Prompt buildGenerate(GenerateItineraryRequest request) {
    String text = generateTemplate
        .replace("$departureLocation$", request.getDepartureLocation())
        .replace("$departureTime$", request.getDepartureTime().toString())
        .replace("$destination$", request.getDestination())
        .replace("$days$", String.valueOf(request.getDays()))
        .replace("$peopleCount$", String.valueOf(request.getPeopleCount()))
        .replace("$budget$", Optional.ofNullable(request.getBudget()).orElse("未指定"))
        .replace("$preferences$", joinList(request.getPreferences()))
        .replace("$specialRequirements$",
            Optional.ofNullable(request.getSpecialRequirements()).orElse("无"));
    return new Prompt(text);
  }

  /** 构建优化行程 Prompt。 */
  public Prompt buildOptimize(OptimizeItineraryRequest request) {
    String text = optimizeTemplate
        .replace("$currentItinerary$", request.getCurrentItinerary())
        .replace("$optimizationGoal$", request.getOptimizationGoal())
        .replace("$constraints$", Optional.ofNullable(request.getConstraints()).orElse("无"));
    return new Prompt(text);
  }

  /** 构建小红书笔记生成 Prompt。 */
  public Prompt buildXiaohongshu(String noteContent, XiaohongshuItineraryRequest request) {
    String text = xiaohongshuTemplate
        .replace("$noteContent$", noteContent)
        .replace("$extraInstructions$", buildExtraInstructions(request));
    return new Prompt(text);
  }

  /** 构建小红书生成场景的补充要求。 */
  public String buildExtraInstructions(XiaohongshuItineraryRequest request) {
    StringBuilder builder = new StringBuilder();
    if (request.getDays() != null) {
      builder.append("出行天数：").append(request.getDays()).append("天。");
    }
    if (request.getPeopleCount() != null) {
      builder.append("出行人数：").append(request.getPeopleCount()).append("人。");
    }
    if (CollUtil.isNotEmpty(request.getPreferences())) {
      builder.append("偏好：").append(CollUtil.join(request.getPreferences(), "、")).append("。");
    }
    if (StrUtil.isNotBlank(request.getSpecialRequirements())) {
      builder.append("特殊要求：").append(request.getSpecialRequirements()).append("。");
    }
    return builder.isEmpty() ? "请根据笔记内容自行推断出行参数。" : builder.toString();
  }

  private String joinList(List<String> values) {
    if (CollUtil.isEmpty(values)) {
      return "无特殊偏好";
    }
    List<String> nonBlank = values.stream()
        .filter(StrUtil::isNotBlank)
        .collect(Collectors.toList());
    return CollUtil.join(nonBlank, "、");
  }

  private String read(Resource resource) throws IOException {
    try (var input = resource.getInputStream()) {
      return StreamUtils.copyToString(input, StandardCharsets.UTF_8);
    }
  }
}
