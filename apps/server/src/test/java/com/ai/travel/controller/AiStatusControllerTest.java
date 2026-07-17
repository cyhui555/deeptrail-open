package com.ai.travel.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.config.AiProviderRuntimeGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class AiStatusControllerTest {

  @Mock
  private AiProviderRuntimeGuard providerGuard;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc = MockMvcBuilders.standaloneSetup(new AiStatusController(providerGuard)).build();
  }

  @Test
  void unavailableResponseDoesNotExposeConfiguration() throws Exception {
    when(providerGuard.isProviderAvailable()).thenReturn(false);

    mockMvc.perform(get("/api/ai/status"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.available").value(false))
        .andExpect(jsonPath("$.data.message").value("AI 规划服务尚未配置"))
        .andExpect(jsonPath("$.data.apiKey").doesNotExist())
        .andExpect(jsonPath("$.data.baseUrl").doesNotExist());
  }

  @Test
  void availableResponseIsReadyForSubmission() throws Exception {
    when(providerGuard.isProviderAvailable()).thenReturn(true);

    mockMvc.perform(get("/api/ai/status"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.available").value(true))
        .andExpect(jsonPath("$.data.message").value("AI 规划服务已就绪"));
  }
}
