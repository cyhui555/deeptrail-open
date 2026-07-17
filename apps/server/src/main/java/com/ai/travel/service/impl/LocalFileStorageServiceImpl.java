package com.ai.travel.service.impl;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.config.AppStorageProperties;
import com.ai.travel.service.StorageService;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 本地文件存储实现。
 *
 * <p>文件存储路径：{@code {root}/media/{module}/{yyyy}/{MM}/{dd}/{uuid}.{ext}}
 * 文件名校验：仅允许白名单扩展名。
 * 文件大小校验：超过配置的最大值时抛异常。
 */
@Service
@Slf4j
public class LocalFileStorageServiceImpl implements StorageService {

  private final Path storageRoot;
  private final long maxFileSize;
  private final Set<String> allowedImageTypes;
  private final Set<String> allowedVideoTypes;

  private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

  /**
   * 构造本地文件存储服务。
   *
   * <p>解析存储根目录、最大文件大小、允许的媒体类型白名单，并确保存储目录存在。
   *
   * @param props 存储相关配置属性
   */
  public LocalFileStorageServiceImpl(AppStorageProperties props) {
    this.storageRoot = Paths.get(props.getRoot()).resolve("media").toAbsolutePath().normalize();
    this.maxFileSize = parseFileSize(props.getMaxFileSize());
    this.allowedImageTypes = new HashSet<>(Arrays.asList(
        props.getAllowedImageTypes().split(",")));
    this.allowedVideoTypes = new HashSet<>(Arrays.asList(
        props.getAllowedVideoTypes().split(",")));
    // 确保存储目录存在
    FileUtil.mkdir(this.storageRoot.toFile());
    log.info("Storage root: {}, max file size: {} bytes", this.storageRoot, this.maxFileSize);
  }

  @Override
  public String store(MultipartFile file, String module) {
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException("文件不能为空");
    }

    // 文件大小校验
    if (file.getSize() > maxFileSize) {
      throw new IllegalArgumentException("文件大小超出限制（最大 "
          + (maxFileSize / 1024 / 1024) + "MB）");
    }

    // 文件扩展名校验
    String originalFilename = file.getOriginalFilename();
    String ext = FileUtil.extName(originalFilename);
    if (StrUtil.isBlank(ext)) {
      throw new IllegalArgumentException("无法识别文件类型");
    }
    ext = ext.toLowerCase();
    if (!allowedImageTypes.contains(ext) && !allowedVideoTypes.contains(ext)) {
      throw new IllegalArgumentException("不支持的文件类型：" + ext);
    }

    // 构建存储路径
    String datePath = LocalDate.now().format(DATE_FORMAT);
    String filename = IdUtil.fastSimpleUUID() + "." + ext;
    Path targetDir = resolveWithinRoot(Paths.get(module).resolve(datePath).toString());
    Path targetPath = targetDir.resolve(filename);

    try {
      FileUtil.mkdir(targetDir.toFile());
      file.transferTo(targetPath.toAbsolutePath());
      log.info("File stored: {}", targetPath);

      // 返回相对路径（相对于 storageRoot）
      return Paths.get(module).resolve(datePath).resolve(filename).toString();
    } catch (IOException e) {
      log.error("Failed to store file: {}", e.getMessage(), e);
      throw new RuntimeException("文件存储失败: " + e.getMessage(), e);
    }
  }

  @Override
  public Resource load(String relativePath) {
    try {
      Path filePath = resolveWithinRoot(relativePath);
      Resource resource = new UrlResource(filePath.toUri());
      if (!resource.exists() || !resource.isReadable()) {
        throw new RuntimeException("文件不存在或不可读: " + relativePath);
      }
      return resource;
    } catch (Exception e) {
      log.error("Failed to load file: {}", e.getMessage(), e);
      throw new RuntimeException("文件加载失败: " + e.getMessage(), e);
    }
  }

  @Override
  public void delete(String relativePath) {
    try {
      Path filePath = resolveWithinRoot(relativePath);
      FileUtil.del(filePath);
      log.info("File deleted: {}", filePath);
    } catch (Exception e) {
      log.warn("Failed to delete file (non-blocking): {}", e.getMessage());
    }
  }

  /**
   * 解析文件大小字符串（支持 "50MB"、"1024KB" 等格式）。
   *
   * @param sizeStr 文件大小字符串
   * @return 字节数
   */
  private long parseFileSize(String sizeStr) {
    sizeStr = sizeStr.trim().toUpperCase();
    if (sizeStr.endsWith("MB")) {
      return Long.parseLong(sizeStr.replace("MB", "").trim()) * 1024 * 1024;
    }
    if (sizeStr.endsWith("KB")) {
      return Long.parseLong(sizeStr.replace("KB", "").trim()) * 1024;
    }
    return Long.parseLong(sizeStr);
  }

  /**
   * 将相对路径解析到存储根目录内，拒绝绝对路径和目录穿越。
   *
   * @param relativePath 数据库中保存的相对路径
   * @return 规范化后的安全绝对路径
   */
  private Path resolveWithinRoot(String relativePath) {
    if (StrUtil.isBlank(relativePath)) {
      throw new IllegalArgumentException("媒体路径不能为空");
    }
    Path candidate = Paths.get(relativePath);
    if (candidate.isAbsolute()) {
      throw new IllegalArgumentException("媒体路径必须是相对路径");
    }
    Path resolved = storageRoot.resolve(candidate).normalize();
    if (!resolved.startsWith(storageRoot)) {
      throw new IllegalArgumentException("媒体路径超出存储根目录");
    }
    return resolved;
  }
}
