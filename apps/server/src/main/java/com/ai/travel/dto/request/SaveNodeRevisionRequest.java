package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 保存节点修正请求。
 *
 * <p>dayIndex/itemIndex 必填；其余字段可选（至少填一类，否则拒绝）。
 */
@Data
@Schema(name = "SaveNodeRevisionRequest", description = "保存节点修正请求")
public class SaveNodeRevisionRequest {

  /** 天序号（从 1 开始）。 */
  @NotNull(message = "dayIndex 必填")
  @Schema(description = "天序号（从 1 开始）", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
  private Integer dayIndex;

  /** 时段序号（从 0 开始）。 */
  @NotNull(message = "itemIndex 必填")
  @Schema(description = "时段序号（从 0 开始）", example = "0", requiredMode = Schema.RequiredMode.REQUIRED)
  private Integer itemIndex;

  /** 修正后纬度（-90~90，与 longitude 必须成对）。 */
  @Schema(description = "修正后纬度", example = "30.7465")
  private Double correctedLat;

  /** 修正后经度（-180~180，与 latitude 必须成对）。 */
  @Schema(description = "修正后经度", example = "120.7558")
  private Double correctedLng;

  /** 交通方式（WALK/DRIVE/BUS/SUBWAY/TRAIN/FLIGHT）。 */
  @Schema(description = "交通方式", example = "WALK")
  private String transportMode;

  /** 交通耗时（分钟）。 */
  @Schema(description = "交通耗时（分钟）", example = "10")
  private Integer transportDuration;

  /** 交通描述文本。 */
  @Schema(description = "交通描述", example = "经复兴大桥")
  private String transportDesc;
}
