package com.ai.travel.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** 公开 API 的最小 OpenAPI 契约漂移检查。 */
@SpringBootTest(properties = {
    "springdoc.api-docs.enabled=true",
    "springdoc.swagger-ui.enabled=false"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiContractTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private ObjectMapper objectMapper;

  @Test
  @DisplayName("OpenAPI 必须保留已注册的关键操作和字段")
  void openApi_keepsRegisteredContract() throws Exception {
    String json = mockMvc.perform(get("/v3/api-docs"))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
    JsonNode openApi = objectMapper.readTree(json);
    JsonNode baseline = readBaseline();

    for (JsonNode operation : baseline.path("requiredOperations")) {
      String path = operation.path("path").asText();
      String method = operation.path("method").asText();
      assertThat(openApi.path("paths").path(path).has(method))
          .as("OpenAPI operation %s %s", method.toUpperCase(), path)
          .isTrue();
    }

    baseline.path("requiredSchemaProperties").fields().forEachRemaining(entry -> {
      JsonNode properties = openApi.path("components").path("schemas")
          .path(entry.getKey()).path("properties");
      for (JsonNode field : entry.getValue()) {
        assertThat(properties.has(field.asText()))
            .as("OpenAPI schema %s.%s", entry.getKey(), field.asText())
            .isTrue();
      }
    });
  }

  private JsonNode readBaseline() throws Exception {
    try (InputStream input = getClass().getResourceAsStream(
        "/contracts/openapi-contract-baseline.json")) {
      assertThat(input).as("OpenAPI contract baseline resource").isNotNull();
      return objectMapper.readTree(input);
    }
  }
}
