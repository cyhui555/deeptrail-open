package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 打卡记录实体，对应 checkin_item 表。
 *
 * <p>记录每个 POI 的打卡详情：GPS 坐标、距离、来源（GPS/MANUAL）、笔记。
 * 包含从 ScheduleItem 透传的时段、描述、预计游玩时长、开放时间、门票、花费、评分等扩展字段，
 * 以及标识用户自加项的 {@link #isCustom} 字段。
 */
@Data
@TableName("checkin_item")
public class CheckinItem {

  /** 主键 ID（自增）。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 关联的打卡任务 ID。 */
  private String checkinTaskId;

  /** POI 名称（冗余）。 */
  private String poiName;

  /** POI 地址。 */
  private String poiAddress;

  /** POI 纬度。 */
  private Double poiLat;

  /** POI 经度。 */
  private Double poiLng;

  /** 打卡时实际纬度。 */
  private Double checkinLat;

  /** 打卡时实际经度。 */
  private Double checkinLng;

  /** 打卡位置与 POI 的距离（米）。 */
  private Integer distanceMeters;

  /** 打卡来源：GPS / MANUAL。 */
  private String source;

  /** 最近一次成功打卡的客户端幂等键；撤销打卡时清空。 */
  private String checkinIdempotencyKey;

  /** 文字笔记。 */
  private String note;

  /** 状态：PENDING / CHECKED_IN / ABANDONED。 */
  private String status;

  /** 打卡时间。 */
  private LocalDateTime checkedInAt;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  // ==================== 扩展字段（v0.4.0 新增，打卡页面内容增强） ====================

  /** 时段：早上 / 上午 / 中午 / 下午 / 晚上 / 深夜。 */
  private String period;

  /** 时段描述文本（来自 ScheduleItem.description）。 */
  private String description;

  /** 预计游玩时长（如"2-3 小时"）。 */
  private String estimatedVisitTime;

  /** 开放时间。 */
  private String openingHours;

  /** 门票。 */
  private String admissionFee;

  /** 预计花费。 */
  private String estimatedCost;

  /** POI 评分（来自 PoiInfo.rating）。 */
  private String rating;

  /** POI 分类（来自 PoiInfo.category，如"景点"/"餐厅"/"酒店"）。 */
  private String category;

  /** POI 联系电话（来自 PoiInfo.phone）。 */
  private String phone;

  /** 是否为用户自加行程点。 */
  private Boolean isCustom = false;

  // ==================== 扩展字段（v0.6.0 新增，地图坐标修正） ====================

  /** 用户修正后的纬度（NULL 表示未修正，使用 poiLat）。 */
  private Double correctedLat;

  /** 用户修正后的经度（NULL 表示未修正，使用 poiLng）。 */
  private Double correctedLng;

  // ==================== 扩展字段（v0.7.0 新增，路线交通工具） ====================

  /**
   * 当前 POI → 下一 POI 的交通段 JSON 字符串（格式:
   * {@code {"mode":"WALK","durationMin":10,"description":"步行约10分钟"}}）。
   *
   * <p>最后一个 POI 无 outgoing，该列为 NULL。由 AI 在生成/优化行程时一并输出，
   * 通过 {@link com.ai.travel.service.CheckinTaskService} 持久化。
   */
  private String transportToNext;
}
