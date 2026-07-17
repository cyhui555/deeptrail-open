package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Data;

/** 批量上传轨迹点请求。 */
@Data
@Schema(name = "TrackPointUploadRequest", description = "批量上传轨迹点请求")
public class TrackPointUploadRequest {

  @NotEmpty(message = "轨迹点列表不能为空")
  @Valid
  @Schema(description = "轨迹点列表", requiredMode = Schema.RequiredMode.REQUIRED)
  private List<TrackPointDto> points;

  /** 单个轨迹点数据。 */
  @Data
  @Schema(name = "TrackPointDto", description = "轨迹点数据")
  public static class TrackPointDto {

    /** 客户端生成的轨迹点稳定标识；旧客户端可不传。 */
    @Size(max = 128, message = "客户端轨迹点 ID 最多 128 个字符")
    @Schema(
        description = "客户端轨迹点 ID；同一行程内重复上传时服务端只保存一次",
        example = "track-018f6d2a-7d86-7b61-a91c-12c68f0bfe31")
    private String clientPointId;

    @NotNull(message = "纬度不能为空")
    @Schema(description = "纬度", example = "30.5728", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double latitude;

    @NotNull(message = "经度不能为空")
    @Schema(description = "经度", example = "104.0668", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double longitude;

    @Schema(description = "GPS 精度（米）", example = "12.5")
    private Double accuracy;

    @Schema(description = "海拔（米）", example = "500.0")
    private Double altitude;

    @Schema(description = "速度（m/s）", example = "1.2")
    private Double speed;

    @NotNull(message = "记录时间不能为空")
    @Schema(
        description = "记录时间（ISO 8601，推荐 UTC Z；显式 offset 会归一为 UTC；"
            + "旧无时区格式固定按 UTC+08:00 解释）",
        example = "2026-07-10T14:30:00Z",
        format = "date-time",
        requiredMode = Schema.RequiredMode.REQUIRED)
    private String recordedAt;
  }
}
