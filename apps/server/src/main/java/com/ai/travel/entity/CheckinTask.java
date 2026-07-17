package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 打卡任务实体，对应 checkin_task 表。
 *
 * <p>从某个生成任务按天拆分而来，是实际打卡的操作单元。
 * 每天包含当天的 POI 列表（通过 {@link CheckinItem} 关联）。
 */
@Data
@TableName("checkin_task")
public class CheckinTask {

  /** 主键 ID（UUID）。 */
  @TableId(type = IdType.ASSIGN_UUID)
  private String id;

  /** 关联的行程清单 ID。 */
  private String planId;

  /** 关联的生成任务 ID。 */
  private String taskId;

  /** 所属用户 ID（冗余校验）。 */
  private Long userId;

  /** 行程日期（yyyy-MM-dd）。 */
  private String itineraryDate;

  /** 第几天（1-based）。 */
  private Integer dayNumber;

  /** 状态：ACTIVE / COMPLETED。 */
  private String status;

  /** POI 总数。 */
  private Integer totalPoi;

  /** 已打卡数。 */
  private Integer completedPoi;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 全部打卡完成时间。 */
  private LocalDateTime completedAt;

  // ==================== 天级数据（v0.5.0 新增，打卡页面内容增强） ====================

  /** 天级餐饮列表（JSON 字符串，结构同 ItineraryResponse.MealItem 列表）。 */
  private String mealsJson;

  /** 天级住宿信息（JSON 字符串，结构同 PoiInfo）。 */
  private String accommodationJson;

  /** 天级交通描述文本。 */
  private String transportation;

  /** 天级小贴士文本。 */
  private String tip;

  /** 天级主题文本（如"抵达乌鲁木齐，逛大巴扎夜市"）。 */
  private String theme;
}
