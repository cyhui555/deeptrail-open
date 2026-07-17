package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 行程清单实体，对应 trip_plan 表。
 *
 * <p>用户视角的"出行计划"，例如"7月10日成都三日游"。
 * 一个清单可关联多个生成任务（多次生成/优化的版本），用户选择其一作为当前执行版本。
 *
 * <p>状态流转：PLANNED → ONGOING（首次打卡自动） → COMPLETED（用户手动）
 */
@Data
@TableName("trip_plan")
public class TripPlan {

  /** 主键 ID（UUID）。 */
  @TableId(type = IdType.ASSIGN_UUID)
  private String id;

  /** 所属用户 ID。 */
  private Long userId;

  /** 清单标题，如"成都三日游"。 */
  private String title;

  /** 目的地（冗余，方便筛选）。 */
  private String destination;

  /** 封面图片路径（相对 storage root）。 */
  private String coverImage;

  /** 计划出行日期（yyyy-MM-dd）。 */
  private String plannedDate;

  /** AI 生成的日程日期范围（如 "2026-07-10 ~ 2026-07-12"），nullable。 */
  private String tripDates;

  /** 行程概述（来自 AI 生成结果的 summary，用于卡片展示），nullable。 */
  private String summary;

  /** 状态：PLANNED / ONGOING / COMPLETED。 */
  private String status;

  /** 当前选中的生成任务 ID。 */
  private String activeTaskId;

  /** 清单备注。 */
  private String note;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 更新时间。 */
  private LocalDateTime updatedAt;

  /** 结束时间（用户手动标记 COMPLETED 时填写）。 */
  private LocalDateTime completedAt;

  /** 软删除时间（NULL=未删除）。 */
  private LocalDateTime deletedAt;
}
