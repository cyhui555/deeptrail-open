package com.ai.travel.entity;

import com.ai.travel.enums.TransportMode;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 行程预览节点修正实体。
 *
 * <p>复合唯一键 (task_id, day_index, item_index) 保证每 POI 只保留一份修正。
 */
@Data
@TableName("itinerary_node_revision")
public class NodeRevision {

  /** 主键。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 关联任务 ID。 */
  private String taskId;

  /** 天序号（从 1 开始）。 */
  private Integer dayIndex;

  /** 时段序号（从 0 开始）。 */
  private Integer itemIndex;

  /** 修正后纬度。 */
  private Double correctedLat;

  /** 修正后经度。 */
  private Double correctedLng;

  /** 交通方式。 */
  private TransportMode transportMode;

  /** 交通耗时（分钟）。 */
  private Integer transportDuration;

  /** 交通描述文本。 */
  private String transportDesc;

  /** 修正前 AI 输出的该节点 JSON 快照（审计用）。 */
  private String originalJson;

  /** 用户 ID（鉴权）。 */
  private Long userId;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 更新时间。 */
  private LocalDateTime updatedAt;
}
