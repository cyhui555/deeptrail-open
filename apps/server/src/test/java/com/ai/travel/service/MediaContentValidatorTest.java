package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/** 媒体真实格式校验测试。 */
class MediaContentValidatorTest {

  private final MediaContentValidator validator = new MediaContentValidator();

  @Test
  @DisplayName("合法 PNG 文件头应通过校验")
  void validate_png_succeeds() {
    byte[] content = {
        (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
    };

    assertThatCode(() -> validator.validate(file("photo.png", content), "png"))
        .doesNotThrowAnyException();
  }

  @Test
  @DisplayName("伪装扩展名的文件应被拒绝")
  void validate_disguisedFile_rejected() {
    byte[] content = "not a png".getBytes(StandardCharsets.US_ASCII);

    assertThatThrownBy(() -> validator.validate(file("payload.png", content), "png"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("文件内容与扩展名不匹配");
  }

  @Test
  @DisplayName("HEIC 容器不应伪装为 MP4")
  void validate_heicRenamedAsMp4_rejected() {
    byte[] content = isoHeader("heic");

    assertThatThrownBy(() -> validator.validate(file("photo.mp4", content), "mp4"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("文件内容与扩展名不匹配");
  }

  @Test
  @DisplayName("HEIC 容器不应伪装为 MOV")
  void validate_heicRenamedAsMov_rejected() {
    byte[] content = isoHeader("heic");

    assertThatThrownBy(() -> validator.validate(file("photo.mov", content), "mov"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("文件内容与扩展名不匹配");
  }

  @Test
  @DisplayName("标准 MP4 容器应通过校验")
  void validate_mp4_succeeds() {
    byte[] content = isoHeader("isom");

    assertThatCode(() -> validator.validate(file("video.mp4", content), "mp4"))
        .doesNotThrowAnyException();
  }

  private MockMultipartFile file(String name, byte[] content) {
    return new MockMultipartFile("file", name, "application/octet-stream", content);
  }

  private byte[] isoHeader(String brand) {
    byte[] content = new byte[16];
    content[3] = 16;
    System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, content, 4, 4);
    System.arraycopy(brand.getBytes(StandardCharsets.US_ASCII), 0, content, 8, 4);
    return content;
  }
}
