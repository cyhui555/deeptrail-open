package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** 坐标修正请求。 */
@Data
@Schema(name = "UpdateCoordinatesRequest", description = "坐标修正请求体")
public class UpdateCoordinatesRequest {

  @NotNull(message = "纬度不能为空")
  @DecimalMin(value = "-90", message = "纬度必须在 -90 到 90 之间")
  @DecimalMax(value = "90", message = "纬度必须在 -90 到 90 之间")
  @Schema(description = "纬度", example = "30.5728", requiredMode = Schema.RequiredMode.REQUIRED)
  private Double lat;

  @NotNull(message = "经度不能为空")
  @DecimalMin(value = "-180", message = "经度必须在 -180 到 180 之间")
  @DecimalMax(value = "180", message = "经度必须在 -180 到 180 之间")
  @Schema(description = "经度", example = "104.0668", requiredMode = Schema.RequiredMode.REQUIRED)
  private Double lng;
}
