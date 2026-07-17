package com.ai.travel.entity;

import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.enums.TaskType;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 调用日志实体，对应 ai_call_log 表。
 *
 * <p>每次 AI 调用对应一行记录，无论成功失败。requestSummary 入库前截断至 200 字符。
 */
@Data
@TableName("ai_call_log")
public class AiCallLog {

  @TableId(type = IdType.AUTO)
  private Long id;

  /** 调用类型（GENERATE / OPTIMIZE / XIAOHONGSHU）。 */
  private TaskType callType;

  /** 请求摘要，截断至 200 字符。 */
  private String requestSummary;

  /** 响应状态（SUCCESS / PARTIAL / FAILED）。 */
  private AiCallStatus responseStatus;

  /** 消耗 Token 数，可空。 */
  private Integer tokenUsed;

  /** AI 调用耗时（毫秒），可空。 */
  private Integer durationMs;

  /** 关联的任务 ID，可空。 */
  private String taskId;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 所属用户 ID，可为 null（认证关闭时）。 */
  private Long userId;
}
