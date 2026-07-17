package com.ai.travel.dto.response;

import lombok.Data;

/** 优化结果中的单条变更记录。 */
@Data
public class ChangeItem {

  private String item;
  private String from;
  private String to;
  private String reason;
}
