package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import lombok.Data;

/** 单日打卡任务详情响应。 */
@Data
@Schema(name = "CheckinTaskResponse", description = "单日打卡任务详情")
public class CheckinTaskResponse {

  @Schema(description = "打卡任务 ID")
  private String id;

  @Schema(description = "第几天（1-based）")
  private Integer dayNumber;

  @Schema(description = "行程日期")
  private String itineraryDate;

  @Schema(description = "状态")
  private String status;

  @Schema(description = "POI 总数")
  private Integer totalPoi;

  @Schema(description = "已打卡数")
  private Integer completedPoi;

  @Schema(description = "POI 打卡项列表")
  private List<CheckinItemResponse> items;

  // ==================== 天级数据（v0.5.0 新增，打卡页面内容增强） ====================

  @Schema(description = "天级餐饮列表（JSON 字符串）")
  private String mealsJson;

  @Schema(description = "天级住宿信息（JSON 字符串）")
  private String accommodationJson;

  @Schema(description = "天级交通描述")
  private String transportation;

  @Schema(description = "天级小贴士")
  private String tip;

  @Schema(description = "天级主题")
  private String theme;
}
