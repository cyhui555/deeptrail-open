package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 编辑自定义行程点请求。仅 isCustom=true 且 status=PENDING 的打卡项允许提交本请求。 */
@Data
@Schema(name = "EditCustomItemRequest", description = "编辑自定义行程点请求体")
public class EditCustomItemRequest {

  @Schema(description = "自定义点名称", example = "朋友推荐的小店（改）")
  @NotBlank(message = "名称不能为空")
  private String name;

  @Schema(description = "时段：早上 / 上午 / 中午 / 下午 / 晚上 / 深夜", example = "下午")
  @Pattern(
      regexp = "^(早上|上午|中午|下午|晚上|深夜)$",
      message = "时段必须是以下值之一：早上/上午/中午/下午/晚上/深夜")
  private String period;

  @Schema(description = "描述", example = "朋友强烈推荐的咖啡馆（更新）")
  @Size(max = 500, message = "描述最多 500 字符")
  private String description;

  @Schema(description = "预计花费", example = "约80元/人")
  @Size(max = 50, message = "预计花费最多 50 字符")
  private String estimatedCost;

  @Schema(description = "地址", example = "人民南路二段88号")
  @Size(max = 200, message = "地址最多 200 字符")
  private String address;

  @Schema(description = "纬度（WGS84）；不传或 null 表示保留原坐标", example = "30.67")
  private Double lat;

  @Schema(description = "经度（WGS84）；不传或 null 表示保留原坐标", example = "104.06")
  private Double lng;
}
