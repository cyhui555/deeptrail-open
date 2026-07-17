package com.ai.travel.controller;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.MediaAccessService;
import com.ai.travel.service.MediaAccessService.MediaDownload;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.file.Path;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 媒体文件下载控制器。
 *
 * <p>通过媒体 ID 查找对应的存储路径，返回文件内容。
 */
@Tag(name = "媒体文件", description = "打卡媒体文件下载")
@RestController
@RequestMapping("/api/media")
@RequiredArgsConstructor
public class MediaController {

  private final MediaAccessService mediaAccessService;

  /**
   * 下载媒体文件。
   *
   * @param mediaId 媒体记录 ID
   * @return 文件资源
   */
  @Operation(summary = "下载媒体文件",
      responses = {
          @ApiResponse(responseCode = "200", description = "文件内容"),
          @ApiResponse(responseCode = "404", description = "文件不存在")
      })
  @GetMapping("/{mediaId}")
  public ResponseEntity<Resource> download(@PathVariable("mediaId") Long mediaId) {
    MediaDownload media = mediaAccessService.loadForUser(mediaId, UserContext.getUserId())
        .orElse(null);
    if (media == null) {
      return ResponseEntity.notFound().build();
    }
    // 按文件扩展名推断 Content-Type，使图片/视频能在浏览器 <img>/<video> 标签内联显示
    MediaType contentType = resolveContentType(media.filePath());
    return ResponseEntity.ok()
        // 媒体属于用户私有数据，必须让每次读取都重新经过对象级权限校验。
        .cacheControl(CacheControl.noStore())
        .contentType(contentType)
        .body(media.resource());
  }

  /**
   * 根据文件扩展名解析 HTTP Content-Type。
   *
   * <p>图片返回具体 image/* 类型，视频返回 video/*，其它回退到 {@code application/octet-stream}。
   *
   * @param relativePath 存储相对路径
   * @return 对应的 MediaType
   */
  private MediaType resolveContentType(String relativePath) {
    if (StrUtil.isBlank(relativePath)) {
      return MediaType.APPLICATION_OCTET_STREAM;
    }
    String ext = Path.of(relativePath).getFileName().toString();
    int dotIdx = ext.lastIndexOf('.');
    if (dotIdx < 0 || dotIdx == ext.length() - 1) {
      return MediaType.APPLICATION_OCTET_STREAM;
    }
    String suffix = ext.substring(dotIdx + 1).toLowerCase();
    return switch (suffix) {
      case "jpg", "jpeg" -> MediaType.IMAGE_JPEG;
      case "png" -> MediaType.IMAGE_PNG;
      case "webp" -> MediaType.valueOf("image/webp");
      case "heic" -> MediaType.valueOf("image/heic");
      case "gif" -> MediaType.IMAGE_GIF;
      case "mp4" -> MediaType.valueOf("video/mp4");
      case "mov" -> MediaType.valueOf("video/quicktime");
      case "m4v" -> MediaType.valueOf("video/x-m4v");
      default -> MediaType.APPLICATION_OCTET_STREAM;
    };
  }
}
