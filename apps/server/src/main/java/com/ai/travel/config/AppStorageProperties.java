package com.ai.travel.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 存储相关配置属性。 */
@Data
@ConfigurationProperties(prefix = "app.storage")
public class AppStorageProperties {

  /** 存储根目录。 */
  private String root = "data/storage";

  /** 单文件最大大小。 */
  private String maxFileSize = "50MB";

  /** 允许的图片类型（逗号分隔）。 */
  private String allowedImageTypes = "jpg,jpeg,png,webp,heic";

  /** 允许的视频类型（逗号分隔）。 */
  private String allowedVideoTypes = "mp4,mov,m4v";
}
