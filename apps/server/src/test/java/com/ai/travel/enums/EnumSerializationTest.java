package com.ai.travel.enums;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

class EnumSerializationTest {

  private final ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();

  @Test
  void taskStatusRoundTripsThroughJson() throws Exception {
    String json = objectMapper.writeValueAsString(TaskStatus.PENDING);
    assertThat(json).isEqualTo("\"PENDING\"");
    assertThat(objectMapper.readValue(json, TaskStatus.class)).isEqualTo(TaskStatus.PENDING);
    assertThat(TaskStatus.PENDING.isTerminal()).isFalse();
    assertThat(TaskStatus.COMPLETED.isTerminal()).isTrue();
  }

  @Test
  void taskTypeAndAiCallStatusRoundTripsThroughJson() throws Exception {
    String taskTypeJson = objectMapper.writeValueAsString(TaskType.GENERATE);
    String aiStatusJson = objectMapper.writeValueAsString(AiCallStatus.SUCCESS);

    assertThat(taskTypeJson).isEqualTo("\"GENERATE\"");
    assertThat(aiStatusJson).isEqualTo("\"SUCCESS\"");
    assertThat(objectMapper.readValue(taskTypeJson, TaskType.class)).isEqualTo(TaskType.GENERATE);
    assertThat(objectMapper.readValue(aiStatusJson, AiCallStatus.class))
        .isEqualTo(AiCallStatus.SUCCESS);
    assertThat(TaskType.GENERATE.resultClass()).isEqualTo(ItineraryResponse.class);
    assertThat(TaskType.OPTIMIZE.resultClass()).isEqualTo(OptimizeResponse.class);
    assertThat(TaskType.XIAOHONGSHU.resultClass()).isEqualTo(ItineraryResponse.class);
  }
}
