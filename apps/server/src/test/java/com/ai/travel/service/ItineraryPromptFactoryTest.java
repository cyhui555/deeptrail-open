package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

/** 行程 Prompt 工厂测试。 */
class ItineraryPromptFactoryTest {

  private ItineraryPromptFactory promptFactory;

  @BeforeEach
  void setUp() throws Exception {
    promptFactory = new ItineraryPromptFactory(
        resource("generate $budget$ $preferences$ $specialRequirements$"),
        resource("optimize $constraints$"),
        resource("xiaohongshu $noteContent$ $extraInstructions$"));
  }

  @Test
  void buildGenerateUsesDefaultsForOptionalFields() {
    GenerateItineraryRequest request = new GenerateItineraryRequest();
    request.setDepartureLocation("Beijing");
    request.setDepartureTime(LocalDateTime.of(2026, 7, 1, 9, 0));
    request.setDestination("Xi'an");
    request.setDays(3);
    request.setPeopleCount(2);

    assertThat(promptFactory.buildGenerate(request)).isNotNull();
  }

  @Test
  void buildOptimizeUsesDefaultConstraintsWhenBlank() {
    OptimizeItineraryRequest request = new OptimizeItineraryRequest();
    request.setCurrentItinerary("day 1 itinerary");
    request.setOptimizationGoal("reduce budget");

    assertThat(promptFactory.buildOptimize(request)).isNotNull();
  }

  @Test
  void buildExtraInstructionsReturnsDefaultWhenNoExtrasProvided() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");

    assertThat(promptFactory.buildExtraInstructions(request))
        .isEqualTo("请根据笔记内容自行推断出行参数。");
  }

  @Test
  void buildExtraInstructionsIncludesAllProvidedFields() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setDays(3);
    request.setPeopleCount(2);
    request.setPreferences(List.of("culture", "food"));
    request.setSpecialRequirements("slow pace");

    assertThat(promptFactory.buildExtraInstructions(request))
        .isEqualTo("出行天数：3天。出行人数：2人。偏好：culture、food。特殊要求：slow pace。");
  }

  private static ByteArrayResource resource(String text) {
    return new ByteArrayResource(text.getBytes(StandardCharsets.UTF_8));
  }
}
