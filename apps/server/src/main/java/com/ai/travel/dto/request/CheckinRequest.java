package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 打卡请求。
 *
 * <p>用户到达 POI 后提交，记录 GPS 坐标和笔记。
 * GPS 不可用时 source=MANUAL，lat/lng 可不传。
 */
@Data
@Schema(name = "CheckinRequest", description = "打卡请求")
public class CheckinRequest {

  /** 客户端为一次打卡操作生成的稳定幂等键；旧客户端可不传。 */
  @Size(max = 128, message = "幂等键最多 128 个字符")
  @Schema(
      description = "客户端打卡幂等键；同一打卡项使用同一键重试不会重复计数",
      example = "checkin-018f6d2a-7d86-7b61-a91c-12c68f0bfe31")
  private String idempotencyKey;

  /** 打卡时纬度（source=GPS 时必填）。 */
  @Schema(description = "打卡时纬度", example = "30.5728")
  private Double lat;

  /** 打卡时经度（source=GPS 时必填）。 */
  @Schema(description = "打卡时经度", example = "104.0668")
  private Double lng;

  /** GPS 精度（米）。 */
  @Schema(description = "GPS 精度（米）", example = "12.5")
  private Float accuracy;

  /** 打卡来源：GPS / MANUAL，默认 GPS。 */
  @Schema(description = "打卡来源", example = "GPS", allowableValues = {"GPS", "MANUAL"})
  private String source;

  /** 文字笔记，可选。 */
  @Size(max = 500, message = "笔记最多 500 字符")
  @Schema(description = "文字笔记", example = "锦里人很多，建议早上来")
  private String note;
}
