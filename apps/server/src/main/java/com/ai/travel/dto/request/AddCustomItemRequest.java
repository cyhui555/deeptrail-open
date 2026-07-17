package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/** 添加自定义行程点请求。 */
@Data
@Schema(name = "AddCustomItemRequest", description = "添加自定义行程点请求体")
public class AddCustomItemRequest {

  @Schema(description = "自定义点名称", example = "朋友推荐的小店")
  @NotBlank(message = "名称不能为空")
  private String name;

  @Schema(description = "时段：早上 / 上午 / 中午 / 下午 / 晚上 / 深夜", example = "下午")
  @Pattern(regexp = "^(早上|上午|中午|下午|晚上|深夜)$", message = "时段必须是以下值之一：早上/上午/中午/下午/晚上/深夜")
  private String period;

  @Schema(description = "描述", example = "朋友强烈推荐的咖啡馆，环境清幽")
  private String description;

  @Schema(description = "预计花费", example = "约50元/人")
  private String estimatedCost;

  @Schema(description = "地址", example = "人民南路二段")
  private String address;

  @Schema(description = "纬度（WGS84）；为空则不在地图上显示", example = "30.67")
  private Double lat;

  @Schema(description = "经度（WGS84）；为空则不在地图上显示", example = "104.06")
  private Double lng;
}
