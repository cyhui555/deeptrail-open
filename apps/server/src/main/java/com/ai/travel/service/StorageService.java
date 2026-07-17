package com.ai.travel.service;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

/**
 * 存储服务接口，抽象文件存储操作。
 *
 * <p>当前实现为 {@link com.ai.travel.service.impl.LocalFileStorageServiceImpl}，
 * 后续可替换为 MinIO/S3 实现。
 */
public interface StorageService {

  /**
   * 存储文件，返回相对路径。
   *
   * @param file 上传的文件
   * @param module 模块名（如 "checkin"、"trip"）
   * @return 相对存储路径（如 "checkin/2026/07/10/uuid.jpg"）
   * @throws IllegalArgumentException 如果文件类型不合法或大小超限
   */
  String store(MultipartFile file, String module);

  /**
   * 获取文件资源。
   *
   * @param relativePath store() 返回的相对路径
   * @return 文件资源
   */
  Resource load(String relativePath);

  /**
   * 删除文件。
   *
   * @param relativePath store() 返回的相对路径
   */
  void delete(String relativePath);
}
