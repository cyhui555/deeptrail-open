package com.ai.travel.service;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.response.MediaUploadResponse;
import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/** 打卡媒体上传服务，集中处理权限、配额、存储与数据库补偿。 */
@Service
@RequiredArgsConstructor
public class CheckinMediaService {

  private static final List<String> IMAGE_TYPES = List.of("jpg", "jpeg", "png", "webp", "heic");
  private static final List<String> VIDEO_TYPES = List.of("mp4", "mov", "m4v");

  private final CheckinAccessService checkinAccessService;
  private final MediaContentValidator mediaContentValidator;
  private final StorageService storageService;
  private final CheckinMediaMapper checkinMediaMapper;

  /**
   * 上传媒体并创建数据库记录。
   *
   * <p>文件写入后如果数据库插入失败，会立即删除已写入文件，避免产生无法追踪的孤儿文件。
   */
  public MediaUploadResponse upload(Long itemId, Long userId, MultipartFile file) {
    checkinAccessService.requireOwnedItem(itemId, userId);

    String extension = FileUtil.extName(file.getOriginalFilename());
    if (StrUtil.isBlank(extension)) {
      throw new IllegalArgumentException("无法识别文件类型");
    }
    extension = extension.toLowerCase(Locale.ROOT);
    boolean image = IMAGE_TYPES.contains(extension);
    boolean video = VIDEO_TYPES.contains(extension);
    if (!image && !video) {
      throw new IllegalArgumentException("不支持的文件类型：" + extension);
    }
    mediaContentValidator.validate(file, extension);

    Long mediaCount = checkinMediaMapper.selectCount(
        new LambdaQueryWrapper<CheckinMedia>()
            .eq(CheckinMedia::getCheckinItemId, itemId)
            .eq(CheckinMedia::getIsHistory, false));
    if (image && mediaCount >= 9) {
      throw new IllegalArgumentException("最多上传 9 张照片");
    }

    String relativePath = storageService.store(file, "checkin");
    try {
      CheckinMedia media = new CheckinMedia();
      media.setCheckinItemId(itemId);
      media.setMediaType(image ? "IMAGE" : "VIDEO");
      media.setFilePath(relativePath);
      media.setFileSize((int) file.getSize());
      media.setIsHistory(false);
      media.setCreatedAt(LocalDateTime.now());
      checkinMediaMapper.insert(media);

      MediaUploadResponse response = new MediaUploadResponse();
      response.setId(media.getId());
      response.setMediaType(media.getMediaType());
      response.setUrl("/api/media/" + media.getId());
      response.setFileSize(media.getFileSize());
      return response;
    } catch (RuntimeException exception) {
      storageService.delete(relativePath);
      throw exception;
    }
  }
}
