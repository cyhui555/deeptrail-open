package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
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
import org.springframework.mock.web.MockMultipartFile;

/** 打卡媒体上传事务边界测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinMediaServiceTest {

  @Mock private CheckinAccessService checkinAccessService;
  @Mock private MediaContentValidator mediaContentValidator;
  @Mock private StorageService storageService;
  @Mock private CheckinMediaMapper checkinMediaMapper;

  private CheckinMediaService service;

  @BeforeEach
  void setUp() {
    service = new CheckinMediaService(
        checkinAccessService, mediaContentValidator, storageService, checkinMediaMapper);
  }

  @Test
  @DisplayName("上传图片应先校验所有权并返回媒体 URL")
  void upload_image_succeeds() {
    var file = file("photo.jpg");
    when(checkinMediaMapper.selectCount(any())).thenReturn(0L);
    when(storageService.store(file, "checkin")).thenReturn("checkin/photo.jpg");
    doAnswer(invocation -> {
      CheckinMedia media = invocation.getArgument(0);
      media.setId(12L);
      return 1;
    }).when(checkinMediaMapper).insert(any(CheckinMedia.class));

    var response = service.upload(3L, 7L, file);

    assertThat(response.getId()).isEqualTo(12L);
    assertThat(response.getUrl()).isEqualTo("/api/media/12");
    verify(checkinAccessService).requireOwnedItem(3L, 7L);
    verify(mediaContentValidator).validate(file, "jpg");
  }

  @Test
  @DisplayName("不支持的扩展名不得写入文件系统")
  void upload_unsupportedType_failsBeforeStorage() {
    var file = file("payload.exe");

    assertThatThrownBy(() -> service.upload(3L, 7L, file))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("不支持的文件类型");
    verify(storageService, never()).store(any(), any());
  }

  @Test
  @DisplayName("数据库写入失败时删除已保存文件")
  void upload_databaseFailure_deletesStoredFile() {
    var file = file("photo.jpg");
    when(checkinMediaMapper.selectCount(any())).thenReturn(0L);
    when(storageService.store(file, "checkin")).thenReturn("checkin/orphan.jpg");
    when(checkinMediaMapper.insert(any(CheckinMedia.class)))
        .thenThrow(new RuntimeException("database unavailable"));

    assertThatThrownBy(() -> service.upload(3L, 7L, file))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("database unavailable");
    verify(storageService).delete("checkin/orphan.jpg");
  }

  @Test
  @DisplayName("图片达到上限时拒绝上传")
  void upload_imageLimit_rejected() {
    var file = file("photo.png");
    when(checkinMediaMapper.selectCount(any())).thenReturn(9L);

    assertThatThrownBy(() -> service.upload(3L, 7L, file))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("最多上传 9 张照片");
    verify(storageService, never()).store(any(), any());
  }

  private MockMultipartFile file(String name) {
    return new MockMultipartFile("file", name, "application/octet-stream", new byte[]{1, 2, 3});
  }
}
