package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ai.travel.config.AppStorageProperties;
import com.ai.travel.service.impl.LocalFileStorageServiceImpl;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/** 本地文件存储服务单元测试。 */
class LocalFileStorageServiceImplTest {

  private LocalFileStorageServiceImpl storageService;
  private Path tempDir;

  @BeforeEach
  void setUp() throws Exception {
    tempDir = Files.createTempDirectory("storage-test");
    AppStorageProperties props = new AppStorageProperties();
    props.setRoot(tempDir.toString());
    props.setMaxFileSize("50MB");
    props.setAllowedImageTypes("jpg,jpeg,png,webp,heic");
    props.setAllowedVideoTypes("mp4,mov,m4v");
    storageService = new LocalFileStorageServiceImpl(props);
  }

  @AfterEach
  void tearDown() throws Exception {
    if (Files.exists(tempDir)) {
      Files.walk(tempDir).sorted(java.util.Comparator.reverseOrder())
          .forEach(p -> {
            try {
              Files.deleteIfExists(p);
            } catch (Exception ignored) {
            }
          });
    }
  }

  @Test
  @DisplayName("上传文件后应能通过相对路径加载")
  void store_andLoad() throws Exception {
    MultipartFile file = new MockMultipartFile("test.jpg", "test.jpg",
        "image/jpeg", "test content".getBytes());
    String relativePath = storageService.store(file, "checkin");
    assertThat(relativePath).isNotNull();
    Resource resource = storageService.load(relativePath);
    assertThat(resource.exists()).isTrue();
  }

  @Test
  @DisplayName("上传空文件应抛出异常")
  void store_emptyFile_throwsException() {
    MultipartFile file = new MockMultipartFile("empty.jpg", "empty.jpg",
        "image/jpeg", new byte[0]);
    assertThatThrownBy(() -> storageService.store(file, "checkin"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("上传不支持的类型应抛出异常")
  void store_unsupportedType_throwsException() {
    MultipartFile file = new MockMultipartFile("test.exe", "test.exe",
        "application/octet-stream", "test content".getBytes());
    assertThatThrownBy(() -> storageService.store(file, "checkin"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("加载不存在的文件应抛出异常")
  void load_nonExistentFile_throwsException() {
    assertThatThrownBy(() -> storageService.load("nonexistent/path.jpg"))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  @DisplayName("删除文件不应抛出异常")
  void delete_nonExistentFile_doesNotThrow() {
    // 删除不存在的文件应该是非阻塞的
    storageService.delete("nonexistent/path.jpg");
    assertThat(true).isTrue();
  }

  @Test
  @DisplayName("上传无扩展名文件应抛出异常")
  void store_noExtensionFile_throwsException() {
    MultipartFile file = new MockMultipartFile("testfile", "testfile",
        "application/octet-stream", "test content".getBytes());
    assertThatThrownBy(() -> storageService.store(file, "checkin"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("无法识别文件类型");
  }

  @Test
  @DisplayName("上传超大文件应抛出异常")
  void store_oversizedFile_throwsException() {
    // 构造超过 50MB 的虚拟文件
    byte[] bigContent = new byte[51 * 1024 * 1024];
    MultipartFile file = new MockMultipartFile("big.jpg", "big.jpg",
        "image/jpeg", bigContent);
    assertThatThrownBy(() -> storageService.store(file, "checkin"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("文件大小超出限制");
  }

  @Test
  @DisplayName("上传视频文件应成功")
  void store_videoFile_succeeds() {
    MultipartFile file = new MockMultipartFile("test.mp4", "test.mp4",
        "video/mp4", "video content".getBytes());
    String relativePath = storageService.store(file, "checkin");
    assertThat(relativePath).isNotNull();
    assertThat(relativePath).endsWith(".mp4");
  }

  @Test
  @DisplayName("上传文件名为 null 应抛出异常")
  void store_nullOriginalFilename_throwsException() {
    MultipartFile file = new MockMultipartFile("test", null,
        "image/jpeg", "test content".getBytes());
    assertThatThrownBy(() -> storageService.store(file, "checkin"))
        .isInstanceOfAny(IllegalArgumentException.class, NullPointerException.class);
  }

  @Test
  @DisplayName("加载文件为目录时应抛出异常")
  void load_fileIsDirectory_throwsException() throws Exception {
    // 在存储根目录下创建一个子目录而不是文件
    Path dir = tempDir.resolve("media").resolve("checkin").resolve("2026");
    java.nio.file.Files.createDirectories(dir);

    assertThatThrownBy(() -> storageService.load("checkin/2026"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("文件不存在或不可读");
  }

  @Test
  @DisplayName("加载目录穿越路径应被拒绝")
  void load_pathTraversal_throwsException() {
    assertThatThrownBy(() -> storageService.load("../../outside.txt"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("媒体路径超出存储根目录");
  }

  @Test
  @DisplayName("删除目录穿越路径不得影响根目录外文件")
  void delete_pathTraversal_keepsOutsideFile() throws Exception {
    Path outside = tempDir.resolve("outside.txt");
    Files.writeString(outside, "keep");

    storageService.delete("../../outside.txt");

    assertThat(outside).exists();
  }
}
