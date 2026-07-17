package com.ai.travel.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import lombok.Data;

/** 单日内的时段安排项（如上午观光）。 */
@Data
public class ScheduleItem {

  private String period;
  private String description;
  private PoiInfo poi;
  private String estimatedDuration;
  private String estimatedCost;

  /**
   * 当前 POI → 下一 POI 的交通段列表（由 AI 在生成/优化行程时一并输出）。
   *
   * <p>最后一个 POI 可省略（为 null）。每个 transport_segment 包含 mode/durationMin/description。
   *
   * <p>JSON 字段名使用 snake_case（{@code transport_segments}），与 AI prompt
   * 输出格式一致。如未输出则由后端 {@code enrichTransportSegments} 根据两点坐标估算填充。
   */
  @JsonProperty("transport_segments")
  @Schema(description = "当前 POI → 下一 POI 的交通段列表，最后一个 POI 可省略",
          example = "[{\"mode\":\"WALK\",\"durationMin\":10,\"description\":\"步行约10分钟\"}]")
  private List<TransportSegment> transportSegments;

  /** 交通段数据结构（当前 POI → 下一 POI）。 */
  @Data
  @Schema(name = "TransportSegment", description = "当前 POI → 下一 POI 的交通段")
  public static class TransportSegment {

    /** 交通方式枚举：WALK | DRIVE | BUS | SUBWAY | TRAIN | FLIGHT。 */
    @JsonProperty("mode")
    @Schema(description = "交通方式：WALK/DRIVE/BUS/SUBWAY/TRAIN/FLIGHT", example = "WALK")
    private String mode;

    /** 预计耗时（分钟）。 */
    @JsonProperty("durationMin")
    @Schema(description = "预计耗时（分钟）", example = "10")
    private Integer durationMin;

    /** 自然语言描述（如"步行约10分钟"）。 */
    @JsonProperty("description")
    @Schema(description = "自然语言描述", example = "步行约10分钟")
    private String description;
  }
}
