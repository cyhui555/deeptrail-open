package com.ai.travel.dto.response;

import com.ai.travel.enums.TransportMode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Builder;
import lombok.Data;

/**
 * 节点修正响应 DTO。
 *
 * <p>{@code transportCorrected} 为派生字段：transportMode/duration/desc 任一非空即为 true。
 */
@Data
@Builder
@Schema(name = "NodeRevisionResponse", description = "节点修正响应")
public class NodeRevisionResponse {

  @Schema(description = "修正记录 ID")
  private Long id;

  @Schema(description = "天序号")
  private Integer dayIndex;

  @Schema(description = "时段序号")
  private Integer itemIndex;

  @Schema(description = "修正后纬度")
  private Double correctedLat;

  @Schema(description = "修正后经度")
  private Double correctedLng;

  @Schema(description = "交通方式")
  private String transportMode;

  @Schema(description = "交通耗时（分钟）")
  private Integer transportDuration;

  @Schema(description = "交通描述")
  private String transportDesc;

  @Schema(description = "修正前 AI 输出快照")
  private String originalJson;

  /** 派生字段：交通维度是否有修正。 */
  @Schema(description = "交通维度是否有修正")
  private boolean transportCorrected;

  @Schema(description = "更新时间")
  private LocalDateTime updatedAt;
}
