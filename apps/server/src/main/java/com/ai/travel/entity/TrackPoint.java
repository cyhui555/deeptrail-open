package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 轨迹点实体，对应 track_point 表。
 *
 * <p>每 10 秒记录一次的 GPS 定位点，用于绘制出行轨迹。
 * 仅当 accuracy ≤ 50m 且与上一点距离 > 5m 时记录。
 */
@Data
@TableName("track_point")
public class TrackPoint {

  /** 主键 ID（自增）。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 关联的行程清单 ID。 */
  private String planId;

  /** 客户端生成的稳定轨迹点 ID；同一行程内唯一。 */
  private String clientPointId;

  /** 纬度。 */
  private Double latitude;

  /** 经度。 */
  private Double longitude;

  /** GPS 精度（米）。 */
  private Double accuracy;

  /** 海拔（米）。 */
  private Double altitude;

  /** 速度（m/s）。 */
  private Double speed;

  /** UTC 记录时间；V5 起数据库中的无时区值只表示 UTC。 */
  private LocalDateTime recordedAt;

  /** 创建时间。 */
  private LocalDateTime createdAt;
}
