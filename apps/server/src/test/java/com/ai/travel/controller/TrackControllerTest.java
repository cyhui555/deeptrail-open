package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.dto.request.TrackPointUploadRequest;
import com.ai.travel.dto.response.TrackPointResponse;
import com.ai.travel.exception.GlobalExceptionHandler;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.TrackService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
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

/** TrackController 单元测试。 */
@ExtendWith(MockitoExtension.class)
class TrackControllerTest {

  @Mock private TrackService trackService;

  private MockMvc mockMvc;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    mockMvc = MockMvcBuilders.standaloneSetup(new TrackController(trackService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("批量上传轨迹点应返回保存数量")
  void uploadPoints_returnsSavedCount() throws Exception {
    when(trackService.batchSavePoints(any(), any(), any())).thenReturn(2);

    mockMvc.perform(post("/api/trips/plan-1/track/points")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"points":[
                  {"clientPointId":"point-1","latitude":39.9042,"longitude":116.4074,
                   "accuracy":5,"recordedAt":"2026-07-01T10:00:00"},
                  {"clientPointId":"point-2","latitude":39.9163,"longitude":116.3972,
                   "accuracy":10,"recordedAt":"2026-07-01T10:00:10"}
                ]}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data").value(2));

    verify(trackService).batchSavePoints(
        eq("plan-1"),
        argThat(points -> points.size() == 2
            && "point-1".equals(points.get(0).getClientPointId())),
        eq(1L));
  }

  @Test
  @DisplayName("查询轨迹点应返回列表")
  void getPoints_returnsList() throws Exception {
    TrackPointResponse p = new TrackPointResponse();
    p.setLatitude(39.9042);
    p.setLongitude(116.4074);
    when(trackService.getTrackPoints(any(), any())).thenReturn(List.of(p));

    mockMvc.perform(get("/api/trips/plan-1/track/points"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(trackService).getTrackPoints(eq("plan-1"), eq(1L));
  }
}
