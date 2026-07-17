package com.ai.travel.exception;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.config.JacksonConfig;
import com.ai.travel.controller.ItineraryController;
import com.ai.travel.service.ItineraryTaskService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class GlobalExceptionHandlerTest {

  @Mock
  private ItineraryTaskService taskService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    // 显式配置 ObjectMapper，注入 JacksonConfig 的宽容 LocalDateTime 解析
    ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .registerModule(new JacksonConfig().lenientLocalDateTimeModule());
    mockMvc = MockMvcBuilders.standaloneSetup(new ItineraryController(taskService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
        .build();
  }

  @Test
  void invalidRequestReturnsUnifiedErrorResponse() throws Exception {
    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").exists());
  }

  @Test
  void runtimeExceptionReturnsInternalError() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new RuntimeException("boom"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("INTERNAL_ERROR"));
  }

  @Test
  void validationErrorListsFieldMessages() throws Exception {
    mockMvc.perform(post("/api/itineraries/optimize")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"currentItinerary":"day 1"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("optimizationGoal")));
  }

  @Test
  void handleForbiddenException() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new ForbiddenException("禁止访问"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("FORBIDDEN"));
  }

  @Test
  void handlePlanNotFoundException() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new PlanNotFoundException("清单不存在"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("PLAN_NOT_FOUND"));
  }

  @Test
  void handleCheckinItemNotFoundException() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new CheckinItemNotFoundException("打卡项不存在"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("CHECKIN_ITEM_NOT_FOUND"));
  }

  @Test
  void handleDuplicateReviewException() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new DuplicateReviewException("已评价"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("REVIEW_ALREADY_EXISTS"));
  }

  @Test
  void handleUnauthorizedException() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new UnauthorizedException("未登录"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("UNAUTHORIZED"));
  }

  @Test
  void handleUsernameExistsException() throws Exception {
    when(taskService.submitGenerateTask(any())).thenThrow(new UsernameExistsException("用户名已存在"));

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("USERNAME_EXISTS"));
  }
}
