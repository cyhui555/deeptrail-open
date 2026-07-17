package com.ai.travel.dto.response;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 分页查询结果，包含分页元数据与当前页记录。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PageResult<T> {

  private List<T> records;
  private long total;
  private int page;
  private int size;
  private int totalPages;
}
