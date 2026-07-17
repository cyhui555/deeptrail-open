package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.mapper.CheckinMediaMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;

/** 媒体读取编排与权限调用测试。 */
@ExtendWith(MockitoExtension.class)
class MediaAccessServiceTest {

  @Mock private CheckinMediaMapper checkinMediaMapper;
  @Mock private CheckinAccessService checkinAccessService;
  @Mock private StorageService storageService;

  private MediaAccessService service;

  @BeforeEach
  void setUp() {
    service = new MediaAccessService(checkinMediaMapper, checkinAccessService, storageService);
  }

  @Test
  @DisplayName("读取媒体前必须校验所属打卡项")
  void loadForUser_existingMedia_checksOwnership() {
    CheckinMedia media = new CheckinMedia();
    media.setId(1L);
    media.setCheckinItemId(10L);
    media.setFilePath("checkin/test.jpg");
    ByteArrayResource resource = new ByteArrayResource(new byte[]{1});
    when(checkinMediaMapper.selectById(1L)).thenReturn(media);
    when(storageService.load("checkin/test.jpg")).thenReturn(resource);

    var result = service.loadForUser(1L, 7L);

    assertThat(result).isPresent();
    assertThat(result.orElseThrow().resource()).isSameAs(resource);
    verify(checkinAccessService).requireOwnedItem(10L, 7L);
  }

  @Test
  @DisplayName("媒体不存在时不访问文件系统")
  void loadForUser_missingMedia_returnsEmpty() {
    when(checkinMediaMapper.selectById(404L)).thenReturn(null);

    assertThat(service.loadForUser(404L, 7L)).isEmpty();
  }
}
