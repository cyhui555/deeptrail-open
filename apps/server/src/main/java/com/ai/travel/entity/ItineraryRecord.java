package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 行程记录实体，对应 itinerary_record 表。
 *
 * <p>一次生成请求对应一行记录。偏好以"、"拼接存储；resultJson 存 AI 原始 JSON 响应。
 */
@Data
@TableName("itinerary_record")
public class ItineraryRecord {

  @TableId(type = IdType.AUTO)
  private Long id;

  /** 出发地，例如 "北京"。 */
  private String departureLocation;

  /** 出发时间。 */
  private LocalDateTime departureTime;

  /** 目的地，例如 "西安"。 */
  private String destination;

  /** 出行天数，≥1。 */
  private Integer days;

  /** 出行人数，≥1。 */
  private Integer peopleCount;

  /** 预算范围，可空。 */
  private String budget;

  /** 旅行偏好，多项用"、"分隔。 */
  private String preferences;

  /** 特殊要求，可空。 */
  private String specialRequirements;

  /** AI 返回的行程 JSON 字符串。 */
  private String resultJson;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 所属用户 ID，可为 null（认证关闭时）。 */
  private Long userId;
}
