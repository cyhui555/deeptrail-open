package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 打卡媒体实体，对应 checkin_media 表。
 *
 * <p>存储打卡时上传的照片/视频文件路径。
 * 撤销打卡后通过 {@link #isHistory} 标记为历史媒体，不再展示但保留记录。
 */
@Data
@TableName("checkin_media")
public class CheckinMedia {

  /** 主键 ID（自增）。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 关联的打卡记录 ID。 */
  private Long checkinItemId;

  /** 媒体类型：IMAGE / VIDEO。 */
  private String mediaType;

  /** 存储路径（相对 storage root）。 */
  private String filePath;

  /** 文件大小（字节）。 */
  private Integer fileSize;

  /** 缩略图路径。 */
  private String thumbnailPath;

  /** 是否为历史媒体（撤销打卡后标记）。 */
  private Boolean isHistory;

  /** 创建时间。 */
  private LocalDateTime createdAt;
}
