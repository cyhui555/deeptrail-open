package com.ai.travel.service;

import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.mapper.CheckinMediaMapper;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/** 媒体读取服务，将对象级权限校验与文件系统访问收敛到同一入口。 */
@Service
@RequiredArgsConstructor
public class MediaAccessService {

  private final CheckinMediaMapper checkinMediaMapper;
  private final CheckinAccessService checkinAccessService;
  private final StorageService storageService;

  /**
   * 为指定用户加载媒体。
   *
   * @param mediaId 媒体 ID
   * @param userId 当前用户 ID
   * @return 媒体不存在时为空；存在但不属于用户时抛出禁止访问异常
   */
  public Optional<MediaDownload> loadForUser(Long mediaId, Long userId) {
    CheckinMedia media = checkinMediaMapper.selectById(mediaId);
    if (media == null) {
      return Optional.empty();
    }

    checkinAccessService.requireOwnedItem(media.getCheckinItemId(), userId);
    Resource resource = storageService.load(media.getFilePath());
    return Optional.of(new MediaDownload(media.getFilePath(), resource));
  }

  /** 控制器返回文件所需的最小只读数据。 */
  public record MediaDownload(String filePath, Resource resource) {
  }
}
