package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import lombok.Data;

/** 轨迹点响应。 */
@Data
@Schema(name = "TrackPointResponse", description = "轨迹点")
public class TrackPointResponse {

  @Schema(description = "轨迹点 ID")
  private Long id;

  @Schema(description = "纬度")
  private Double latitude;

  @Schema(description = "经度")
  private Double longitude;

  @Schema(description = "GPS 精度（米）")
  private Double accuracy;

  @Schema(
      description = "UTC 记录时间（ISO 8601，始终携带 Z）",
      example = "2026-07-10T14:30:00Z",
      format = "date-time")
  private Instant recordedAt;
}
