package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 行程清单与生成任务的关联实体，对应 plan_task_ref 表。
 *
 * <p>一个清单可关联多个生成任务版本，通过 {@link #isActive} 标记当前执行版本。
 */
@Data
@TableName("plan_task_ref")
public class PlanTaskRef {

  /** 主键 ID（自增）。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 关联的行程清单 ID。 */
  private String planId;

  /** 关联的生成任务 ID。 */
  private String taskId;

  /** 是否为当前执行版本（每个 planId 只能有一条 true）。 */
  private Boolean isActive;

  /** 关联添加时间。 */
  private LocalDateTime addedAt;
}
