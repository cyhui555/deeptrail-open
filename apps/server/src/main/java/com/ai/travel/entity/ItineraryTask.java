package com.ai.travel.entity;

import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 异步任务实体，对应 itinerary_task 表。
 *
 * <p>典型生命周期：PENDING → PROCESSING → COMPLETED / FAILED / CANCELLED。
 * 终态判断统一使用 {@link TaskStatus#isTerminal()}。
 */
@Data
@TableName("itinerary_task")
public class ItineraryTask {

  @TableId(type = IdType.ASSIGN_UUID)
  private String id;

  /** 任务类型（GENERATE / OPTIMIZE / XIAOHONGSHU）。 */
  private TaskType type;

  /** 任务状态（PENDING / PROCESSING / COMPLETED / FAILED / CANCELLED）。 */
  private TaskStatus status;

  /** 请求体 JSON，提交时序列化。 */
  private String requestJson;

  /** 结果 JSON，仅在 COMPLETED 时有值。 */
  private String resultJson;

  /** 错误信息，仅在 FAILED 时有值，最长 500 字符。 */
  private String errorMessage;

  /** 小红书抓取/粘贴的解析后笔记内容，仅 XIAOHONGSHU 类型时有值。 */
  private String parsedContent;

  /** 创建时间（提交时刻）。 */
  private LocalDateTime createdAt;

  /** 开始处理时间，进入 PROCESSING 时填写。 */
  private LocalDateTime startedAt;

  /** 完成时间，包含 FAILED / CANCELLED 等终态。 */
  private LocalDateTime completedAt;

  /** 过期时间，默认 24h，用于后续清理。 */
  private LocalDateTime expiresAt;

  /** 所属用户 ID，可为 null（认证关闭时）。 */
  private Long userId;

  /** 已重试次数，每次 PROCESSING→FAILED 循环前自增，达到上限后不再重试。 */
  private Integer retryCount;
}
