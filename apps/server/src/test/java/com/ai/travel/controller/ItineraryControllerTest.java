package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.config.JacksonConfig;
import com.ai.travel.exception.GlobalExceptionHandler;
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
class ItineraryControllerTest {

  @Mock
  private ItineraryTaskService taskService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    // 显式配置 ObjectMapper，注入 JacksonConfig 的宽容 LocalDateTime 解析
    // （standaloneSetup 默认不应用 Spring 自动配置，需手动注入消息转换器）
    ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .registerModule(new JacksonConfig().lenientLocalDateTimeModule());
    mockMvc = MockMvcBuilders.standaloneSetup(new ItineraryController(taskService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
        .build();
  }

  @Test
  void generateReturnsPendingTaskSubmission() throws Exception {
    when(taskService.submitGenerateTask(any())).thenReturn("task-1");

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-01 09:00:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.taskId").value("task-1"))
        .andExpect(jsonPath("$.data.status").value("PENDING"));

    verify(taskService).submitGenerateTask(any());
  }

  @Test
  void healthReturnsServiceStatus() throws Exception {
    mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").value("服务正常运行"));
  }

  @Test
  void optimizeValidatesMissingFields() throws Exception {
    mockMvc.perform(post("/api/itineraries/optimize")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"currentItinerary":"day 1"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
  }

  @Test
  void fromXiaohongshuReturnsTaskSubmission() throws Exception {
    when(taskService.submitXiaohongshuTask(any())).thenReturn("task-2");

    mockMvc.perform(post("/api/itineraries/from-xiaohongshu")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"url":"https://example.com/note"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.taskId").value("task-2"))
        .andExpect(jsonPath("$.data.status").value("PENDING"));
  }

  @Test
  void optimizeReturnsTaskSubmission() throws Exception {
    when(taskService.submitOptimizeTask(any())).thenReturn("task-opt-1");

    mockMvc.perform(post("/api/itineraries/optimize")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"currentItinerary":"day 1","optimizationGoal":"reduce budget"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.taskId").value("task-opt-1"))
        .andExpect(jsonPath("$.data.status").value("PENDING"));

    verify(taskService).submitOptimizeTask(any());
  }

  @Test
  void fromXiaohongshuWithNoteContent() throws Exception {
    when(taskService.submitXiaohongshuTask(any())).thenReturn("task-3");

    mockMvc.perform(post("/api/itineraries/from-xiaohongshu")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"noteContent":"周末青岛两日游，打卡啤酒城出海体验"}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.taskId").value("task-3"))
        .andExpect(jsonPath("$.data.status").value("PENDING"));

    verify(taskService).submitXiaohongshuTask(any());
  }
}
