package com.ai.travel.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.GlobalExceptionHandler;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.MediaAccessService;
import com.ai.travel.service.MediaAccessService.MediaDownload;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** MediaController 单元测试。 */
@ExtendWith(MockitoExtension.class)
class MediaControllerTest {

  @Mock private MediaAccessService mediaAccessService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    UserContext.setUserId(7L);
    mockMvc = MockMvcBuilders
        .standaloneSetup(new MediaController(mediaAccessService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("下载本人媒体文件应返回 200")
  void download_ownedFile_returns200() throws Exception {
    when(mediaAccessService.loadForUser(1L, 7L)).thenReturn(download("checkin/test.jpg"));

    mockMvc.perform(get("/api/media/1"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "image/jpeg"));
  }

  @Test
  @DisplayName("下载不存在的媒体文件应返回 404")
  void download_nonExistentFile_returns404() throws Exception {
    when(mediaAccessService.loadForUser(999L, 7L)).thenReturn(Optional.empty());

    mockMvc.perform(get("/api/media/999"))
        .andExpect(status().isNotFound());
  }

  @Test
  @DisplayName("下载其他用户媒体应拒绝访问")
  void download_otherUsersFile_isForbidden() throws Exception {
    when(mediaAccessService.loadForUser(2L, 7L))
        .thenThrow(new ForbiddenException("无权访问该打卡项"));

    mockMvc.perform(get("/api/media/2"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.errorCode").value("FORBIDDEN"))
        .andExpect(jsonPath("$.data").isEmpty());
  }

  @Test
  @DisplayName("视频媒体应返回正确 Content-Type")
  void download_video_returnsVideoContentType() throws Exception {
    when(mediaAccessService.loadForUser(3L, 7L)).thenReturn(download("checkin/test.mp4"));

    mockMvc.perform(get("/api/media/3"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "video/mp4"));
  }

  @Test
  @DisplayName("未知媒体扩展名应回退到二进制类型")
  void download_unknownType_returnsOctetStream() throws Exception {
    when(mediaAccessService.loadForUser(4L, 7L)).thenReturn(download("checkin/test.bin"));

    mockMvc.perform(get("/api/media/4"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "application/octet-stream"));
  }

  private Optional<MediaDownload> download(String path) {
    return Optional.of(new MediaDownload(path, new ByteArrayResource(new byte[]{1, 2, 3})));
  }
}
