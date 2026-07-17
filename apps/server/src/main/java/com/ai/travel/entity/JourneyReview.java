package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 旅程评价实体，对应 journey_review 表。
 *
 * <p>每个行程清单对应唯一一份旅程评价（1:1 关系）。
 * 包含用户评分、文字评价、AI 生成总结、打卡完成率、轨迹总距离。
 */
@Data
@TableName("journey_review")
public class JourneyReview {

  /** 主键 ID（自增）。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 关联的行程清单 ID（UNIQUE）。 */
  private String planId;

  /** 所属用户 ID（冗余校验）。 */
  private Long userId;

  /** 整体评分（1-5 星）。 */
  private Integer rating;

  /** 用户文字评价。 */
  private String userComment;

  /** AI 生成总结（可编辑后保存）。 */
  private String aiSummary;

  /** AI 总结状态：PENDING / SUCCESS / FAILED / MANUAL。 */
  private String aiSummaryStatus;

  /** 用户是否编辑过 AI 总结。 */
  private Boolean summaryEdited;

  /** 打卡完成率，如 "8/10"。 */
  private String poiCoverage;

  /** 轨迹总距离（米）。 */
  private Integer totalDistanceMeters;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 更新时间。 */
  private LocalDateTime updatedAt;
}
