package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/** 媒体上传响应。 */
@Data
@Schema(name = "MediaUploadResponse", description = "媒体上传响应")
public class MediaUploadResponse {

  @Schema(description = "媒体 ID")
  private Long id;

  @Schema(description = "媒体类型：IMAGE / VIDEO")
  private String mediaType;

  @Schema(description = "文件访问 URL")
  private String url;

  @Schema(description = "缩略图 URL")
  private String thumbnailUrl;

  @Schema(description = "文件大小（字节）")
  private Integer fileSize;
}
