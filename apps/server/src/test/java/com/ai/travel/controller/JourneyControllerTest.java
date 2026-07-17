package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.dto.request.JourneyReviewRequest;
import com.ai.travel.dto.request.UpdateSummaryRequest;
import com.ai.travel.dto.response.JourneyReviewResponse;
import com.ai.travel.exception.GlobalExceptionHandler;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.JourneyService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** JourneyController 单元测试。 */
@ExtendWith(MockitoExtension.class)
class JourneyControllerTest {

  @Mock private JourneyService journeyService;

  private MockMvc mockMvc;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    mockMvc = MockMvcBuilders.standaloneSetup(new JourneyController(journeyService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("提交评价应返回评价 ID")
  void submitReview_returnsReviewId() throws Exception {
    when(journeyService.submitReview(any(), any(), any())).thenReturn(1L);

    mockMvc.perform(post("/api/trips/plan-1/review")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"rating\":5,\"comment\":\"很棒\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(1));

    verify(journeyService).submitReview(any(), any(), any());
  }

  @Test
  @DisplayName("更新 AI 总结应返回成功")
  void updateSummary_returnsOk() throws Exception {
    doNothing().when(journeyService).updateSummary(any(), any(), any());

    mockMvc.perform(put("/api/trips/plan-1/review/summary")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"summary\":\"编辑后的总结\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(journeyService).updateSummary(any(), any(), any());
  }

  @Test
  @DisplayName("查询评价应返回评价详情")
  void getReview_returnsReview() throws Exception {
    JourneyReviewResponse resp = new JourneyReviewResponse();
    resp.setId(1L);
    resp.setRating(5);
    resp.setUserComment("很棒");
    when(journeyService.getReview(any(), any())).thenReturn(resp);

    mockMvc.perform(get("/api/trips/plan-1/review"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.rating").value(5));

    verify(journeyService).getReview(any(), any());
  }
}
