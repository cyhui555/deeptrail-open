package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.exception.AiResponseValidationException;
import com.ai.travel.exception.AiResponseValidationException.Reason;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/** 用共享 Eval 数据集验证合法样本全通过、非法样本零假成功。 */
class AiQualityEvalTest {

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final AiResponseParser parser = new AiResponseParser(objectMapper);

  @TestFactory
  List<DynamicTest> parsingCasesFollowEvalContract() throws Exception {
    List<DynamicTest> tests = new ArrayList<>();
    try (InputStream stream = getClass().getResourceAsStream("/evals/ai-quality-cases.json")) {
      assertThat(stream).as("共享 Eval 夹具必须进入 test classpath").isNotNull();
      for (JsonNode item : objectMapper.readTree(stream).path("cases")) {
        if (!"parsing".equals(item.path("boundary").asText())) {
          continue;
        }
        tests.add(DynamicTest.dynamicTest(item.path("id").asText(), () -> verifyCase(item)));
      }
    }
    assertThat(tests).hasSizeGreaterThanOrEqualTo(9);
    return tests;
  }

  private void verifyCase(JsonNode item) {
    String raw = item.path("raw").asText();
    String taskType = item.path("taskType").asText();
    JsonNode expected = item.path("expected");
    if (expected.path("valid").asBoolean()) {
      int dayCount = "optimize".equals(taskType)
          ? parser.parseOptimize(raw, AiCallStatus.SUCCESS).getDays().size()
          : parser.parseItinerary(raw, AiCallStatus.SUCCESS).getDays().size();
      assertThat(dayCount).isEqualTo(expected.path("dayCount").asInt());
      return;
    }

    assertThatThrownBy(() -> {
      if ("optimize".equals(taskType)) {
        parser.parseOptimize(raw, AiCallStatus.SUCCESS);
      } else {
        parser.parseItinerary(raw, AiCallStatus.SUCCESS);
      }
    }).isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.valueOf(expected.path("reason").asText()));
  }
}
