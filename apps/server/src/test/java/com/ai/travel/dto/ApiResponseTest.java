package com.ai.travel.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ApiResponseTest {

  @Test
  void okBuildsUnifiedSuccessResponse() {
    ApiResponse<String> response = ApiResponse.ok("data");

    assertThat(response.isSuccess()).isTrue();
    assertThat(response.getMessage()).isEqualTo("ok");
    assertThat(response.getData()).isEqualTo("data");
    assertThat(response.getErrorCode()).isNull();
  }

  @Test
  void errorBuildsUnifiedFailureResponse() {
    ApiResponse<Void> response = ApiResponse.error("VALIDATION_FAILED", "bad request");

    assertThat(response.isSuccess()).isFalse();
    assertThat(response.getMessage()).isEqualTo("bad request");
    assertThat(response.getErrorCode()).isEqualTo("VALIDATION_FAILED");
  }
}
