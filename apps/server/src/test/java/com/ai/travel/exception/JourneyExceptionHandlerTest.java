package com.ai.travel.exception;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.controller.JourneyController;
import com.ai.travel.service.JourneyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** 旅程评价异常处理测试。 */
@ExtendWith(MockitoExtension.class)
class JourneyExceptionHandlerTest {

  @Mock private JourneyService journeyService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc = MockMvcBuilders.standaloneSetup(new JourneyController(journeyService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @Test
  @DisplayName("清单不存在应返回 PLAN_NOT_FOUND")
  void planNotFound_returnsErrorCode() throws Exception {
    when(journeyService.getReview(any(), any())).thenThrow(new PlanNotFoundException("清单不存在"));

    mockMvc.perform(get("/api/trips/999/review"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("PLAN_NOT_FOUND"));
  }

  @Test
  @DisplayName("重复评价应返回 REVIEW_ALREADY_EXISTS")
  void duplicateReview_returnsErrorCode() throws Exception {
    when(journeyService.submitReview(any(), any(), any()))
        .thenThrow(new DuplicateReviewException("已提交"));

    mockMvc.perform(post("/api/trips/1/review")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"rating\":5}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("REVIEW_ALREADY_EXISTS"));
  }
}
