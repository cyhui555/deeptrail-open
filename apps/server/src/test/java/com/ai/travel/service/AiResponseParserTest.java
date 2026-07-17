package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.exception.AiResponseValidationException;
import com.ai.travel.exception.AiResponseValidationException.Reason;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** AI 响应解析器测试。 */
class AiResponseParserTest {

  private final AiResponseParser parser = new AiResponseParser(new ObjectMapper());

  @Test
  @DisplayName("Markdown 代码块中的 JSON 应直接解析")
  void parseItinerary_markdownFence_succeeds() {
    var response = parser.parseItinerary(
        "```json\n{\"summary\":\"ok\",\"days\":[{\"day\":1,\"schedule\":[]}]}\n```",
        AiCallStatus.SUCCESS);

    assertThat(response.getSummary()).isEqualTo("ok");
  }

  @Test
  @DisplayName("说明文字包裹的 JSON 应通过片段提取解析")
  void parseItinerary_wrappedJson_succeeds() {
    var response = parser.parseItinerary(
        "prefix {\"summary\":\"ok\",\"days\":[{\"day\":1,\"schedule\":[]}]} suffix",
        AiCallStatus.SUCCESS);

    assertThat(response.getSummary()).isEqualTo("ok");
  }

  @Test
  @DisplayName("空行程响应应降级为可读提示")
  void parseItinerary_blank_fallsBack() {
    assertThatThrownBy(() -> parser.parseItinerary("   ", AiCallStatus.SUCCESS))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.EMPTY_RESPONSE);
  }

  @Test
  @DisplayName("损坏的行程 JSON 应保留模型原文")
  void parseItinerary_malformedJson_fallsBack() {
    assertThatThrownBy(() -> parser.parseItinerary(
        "prefix {invalid-json} suffix", AiCallStatus.FAILED))
        .isInstanceOf(AiResponseValidationException.class)
        .hasMessageNotContaining("invalid-json")
        .extracting("reason")
        .isEqualTo(Reason.MALFORMED_JSON);
  }

  @Test
  @DisplayName("空优化响应应降级为可读提示")
  void parseOptimize_blank_fallsBack() {
    assertThatThrownBy(() -> parser.parseOptimize("  ", AiCallStatus.SUCCESS))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.EMPTY_RESPONSE);
  }

  @Test
  @DisplayName("说明文字包裹的优化 JSON 应通过片段提取解析")
  void parseOptimize_wrappedJson_succeeds() {
    OptimizeResponse response = parser.parseOptimize(
        "prefix {\"summary\":\"better\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"changes\":[],\"reasoning\":\"ok\"} suffix",
        AiCallStatus.SUCCESS);

    assertThat(response.getSummary()).isEqualTo("better");
    assertThat(response.getReasoning()).isEqualTo("ok");
  }

  @Test
  @DisplayName("损坏的优化 JSON 应保留模型原文")
  void parseOptimize_malformedJson_fallsBack() {
    assertThatThrownBy(() -> parser.parseOptimize(
        "prefix {invalid-json} suffix", AiCallStatus.FAILED))
        .isInstanceOf(AiResponseValidationException.class)
        .hasMessageNotContaining("invalid-json")
        .extracting("reason")
        .isEqualTo(Reason.MALFORMED_JSON);
  }

  @Test
  @DisplayName("合法 JSON 缺少 days 时必须失败，不能伪装成成功")
  void parseItinerary_missingDays_rejected() {
    assertThatThrownBy(() -> parser.parseItinerary(
        "{\"summary\":\"looks valid\"}", AiCallStatus.SUCCESS))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.MISSING_DAYS);
  }
}
