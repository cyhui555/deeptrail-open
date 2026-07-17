package com.ai.travel.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** 验证测试注册夹具在显式关闭时不会暴露公开注册路由。 */
@SpringBootTest(properties = "app.auth.registration-enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RegistrationEndpointAvailabilityTest {

  @Autowired private MockMvc mockMvc;

  @Test
  @DisplayName("默认关闭注册时 POST /api/auth/register 应返回 404")
  void registerShouldNotExistWhenDisabled() throws Exception {
    mockMvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"blocked-user\",\"password\":\"secret123\"}"))
        .andExpect(status().isNotFound());
  }
}
